// Armazenamento dos anuncios no Redis (Upstash), acessado pela API REST.
// Funciona na Vercel sem dependencias: a Vercel cria as variaveis
// KV_REST_API_URL / KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL /
// UPSTASH_REDIS_REST_TOKEN) quando voce conecta um banco Upstash Redis
// ao projeto em Storage.
//
// Estrutura no Redis:
//   ads:next_id                -> contador de ids
//   ads:index                  -> sorted set (score = id) com todos os ids
//   ads:bytime                 -> sorted set (score = data do post em ms) para contar por periodo
//   ad:<id>                    -> JSON do anuncio
//   tg:<chat_id>:<message_id>  -> id do anuncio (evita duplicar e permite editar)
//   chats:seen                 -> hash chat_id -> nome dos chats que falaram com o bot

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

function isConfigured() {
  return Boolean(REDIS_URL && REDIS_TOKEN);
}

// Executa varios comandos de uma vez (pipeline) e devolve os resultados.
async function redis(commands) {
  if (!isConfigured()) {
    throw new Error(
      "Banco nao configurado: conecte um Upstash Redis ao projeto na Vercel (Storage)."
    );
  }
  const res = await fetch(`${REDIS_URL.replace(/\/$/, "")}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    throw new Error(`Redis respondeu ${res.status}: ${await res.text()}`);
  }
  const results = await res.json();
  for (const r of results) {
    if (r.error) throw new Error(`Erro no Redis: ${r.error}`);
  }
  return results.map((r) => r.result);
}

// Grava o JSON so com caracteres ASCII (acentos e emojis viram \uXXXX).
// Emojis e caracteres invisiveis chegavam embaralhados na volta do Redis,
// deslocando quebras de linha e quebrando os links dos anuncios.
function toStored(value) {
  return JSON.stringify(value).replace(
    /[\u007f-\uffff]/g,
    (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

function parseAds(rawList) {
  return rawList.filter(Boolean).map((raw) => JSON.parse(raw));
}

// Salva um anuncio novo ou atualiza um existente (mensagem editada no Telegram).
async function upsertAd(ad) {
  const refKey = `tg:${ad.chat_id}:${ad.telegram_message_id}`;
  const [existingId] = await redis([["GET", refKey]]);

  if (existingId) {
    const [currentRaw] = await redis([["GET", `ad:${existingId}`]]);
    const current = currentRaw ? JSON.parse(currentRaw) : {};
    const updated = {
      ...current,
      ...ad,
      // Edicao sem foto nao apaga a foto que ja existia (nem a de reserva).
      photo_file_id: ad.photo_file_id || current.photo_file_id || null,
      photo_thumb_id: ad.photo_file_id ? ad.photo_thumb_id || null : current.photo_thumb_id || null,
      id: Number(existingId),
      received_at: current.received_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await redis([["SET", `ad:${existingId}`, toStored(updated)]]);
    return { ad: updated, created: false };
  }

  const [id] = await redis([["INCR", "ads:next_id"]]);
  // Reserva o par chat/mensagem; se outra chamada chegou junto, usa a dela.
  const [reserved] = await redis([["SET", refKey, String(id), "NX"]]);
  if (reserved !== "OK") {
    return upsertAd(ad);
  }

  const record = {
    id,
    telegram_message_id: ad.telegram_message_id,
    chat_id: ad.chat_id,
    text: ad.text ?? null,
    photo_file_id: ad.photo_file_id ?? null,
    photo_thumb_id: ad.photo_thumb_id ?? null,
    posted_at: ad.posted_at,
    received_at: new Date().toISOString(),
  };
  await redis([
    ["SET", `ad:${id}`, toStored(record)],
    ["ZADD", "ads:index", String(id), String(id)],
    ["ZADD", "ads:bytime", String(postedMs(record)), String(id)],
  ]);
  countsCache = null;
  return { ad: record, created: true };
}

async function getAd(id) {
  const [raw] = await redis([["GET", `ad:${id}`]]);
  return raw ? JSON.parse(raw) : null;
}

// Acrescenta campos a um anuncio ja salvo (ex.: a loja descoberta pelo link).
async function saveAdFields(id, fields) {
  const current = await getAd(id);
  if (!current) return null;
  const updated = { ...current, ...fields };
  await redis([["SET", `ad:${id}`, toStored(updated)]]);
  return updated;
}

async function fetchByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const [rawList] = await redis([["MGET", ...ids.map((id) => `ad:${id}`)]]);
  return parseAds(rawList);
}

// Mais recentes primeiro. "before" pagina para tras (anuncios mais antigos).
async function listAds({ limit = 60, before = null } = {}) {
  const max = before ? `(${before}` : "+inf";
  const [ids] = await redis([
    ["ZRANGE", "ads:index", max, "-inf", "BYSCORE", "REV", "LIMIT", "0", String(limit)],
  ]);
  return fetchByIds(ids);
}

// Anuncios novos desde o ultimo id que a pagina ja tem (para o feed ao vivo).
async function listAdsAfter(afterId, limit = 100) {
  const [ids] = await redis([
    ["ZRANGE", "ads:index", `(${afterId}`, "+inf", "BYSCORE", "LIMIT", "0", String(limit)],
  ]);
  return fetchByIds(ids);
}

// Chats de onde o bot recebeu mensagens (id -> nome), para achar o TELEGRAM_CHAT_ID.
async function rememberChat(chatId, name) {
  await redis([["HSET", "chats:seen", String(chatId), String(name || "")]]);
}

async function listSeenChats() {
  const [flat] = await redis([["HGETALL", "chats:seen"]]);
  const chats = [];
  for (let i = 0; i < (flat || []).length; i += 2) {
    chats.push({ chat_id: flat[i], name: flat[i + 1] });
  }
  return chats;
}

function postedMs(ad) {
  const t = Date.parse(ad.posted_at || ad.received_at || "");
  return Number.isFinite(t) ? t : Date.now();
}

// Anuncios salvos antes de existir o ads:bytime entram nele aqui, uma vez so.
let byTimeChecked = false;
async function backfillByTime() {
  if (byTimeChecked) return;
  const [indexCount, timeCount] = await redis([["ZCARD", "ads:index"], ["ZCARD", "ads:bytime"]]);
  if (Number(timeCount) >= Number(indexCount)) { byTimeChecked = true; return; }
  const [ids] = await redis([["ZRANGE", "ads:index", "0", "-1"]]);
  for (let i = 0; i < ids.length; i += 200) {
    const ads = await fetchByIds(ids.slice(i, i + 200));
    if (ads.length === 0) continue;
    const args = [];
    for (const ad of ads) args.push(String(postedMs(ad)), String(ad.id));
    await redis([["ZADD", "ads:bytime", ...args]]);
  }
  byTimeChecked = true;
}

// Quantos anuncios foram postados desde "sinceMs" (ex.: ultimas 24h).
async function countSince(sinceMs) {
  await backfillByTime();
  const [count] = await redis([["ZCOUNT", "ads:bytime", String(sinceMs), "+inf"]]);
  return Number(count) || 0;
}

async function countAds() {
  const [count] = await redis([["ZCARD", "ads:index"]]);
  return Number(count) || 0;
}

// Total e "ultimas 24h" para o site. Guardados por 2 min na memoria da funcao:
// o feed ao vivo pergunta a cada 15 s e esses numeros mudam devagar.
const COUNTS_TTL_MS = 120000;
let countsCache = null;
async function getCounts() {
  if (countsCache && Date.now() - countsCache.at < COUNTS_TTL_MS) return countsCache;
  await backfillByTime();
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const [total, last24h] = await redis([["ZCARD", "ads:index"], ["ZCOUNT", "ads:bytime", String(since), "+inf"]]);
  countsCache = { at: Date.now(), total: Number(total) || 0, last24h: Number(last24h) || 0 };
  return countsCache;
}

module.exports = {
  getCounts,
  isConfigured,
  upsertAd,
  getAd,
  saveAdFields,
  listAds,
  listAdsAfter,
  countAds,
  countSince,
  redis,
  rememberChat,
  listSeenChats,
  toStored,
};
