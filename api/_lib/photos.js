// Foto de reserva: as vezes o disparador manda a oferta so com texto (sem foto).
// Como o mesmo produto costuma ser anunciado mais de uma vez, guardamos a
// ultima foto de cada produto (pelo nome normalizado) e reaproveitamos.
//   photo:bykey  -> hash  chave do produto -> file_id do Telegram
//   photo:cursor -> ultimo id ja processado pela varredura dos antigos
// O file_id do Telegram vale para qualquer mensagem do mesmo bot.

const { redis, toStored, getAd } = require("./store");
const { describe, productKey } = require("./parse");

const keyOf = (ad) => {
  const k = productKey(describe(ad).name);
  return k.length >= 8 ? k : null;
};

// Anuncio novo: guarda a foto dele, ou pega emprestada a de um anuncio anterior.
async function handleNewAdPhoto(ad) {
  const key = keyOf(ad);
  if (!key) return null;
  if (ad.photo_file_id) {
    await redis([["HSET", "photo:bykey", key, ad.photo_file_id]]);
    return null;
  }
  const [fileId] = await redis([["HGET", "photo:bykey", key]]);
  if (!fileId) return null;
  const fresh = (await getAd(ad.id)) || ad;
  if (fresh.photo_file_id) return null;
  await redis([["SET", `ad:${ad.id}`, toStored({ ...fresh, photo_file_id: fileId, photo_borrowed: true })]]);
  return fileId;
}

// Varre os anuncios antigos do mais antigo para o mais novo (lotes pequenos),
// montando o indice e preenchendo os que ficaram sem foto.
async function catchUpPhotos({ batch = 150 } = {}) {
  const [cursorRaw, nextRaw] = await redis([["GET", "photo:cursor"], ["GET", "ads:next_id"]]);
  const cursor = Number(cursorRaw) || 0, last = Number(nextRaw) || 0;
  if (cursor >= last) return { done: true, cursor };
  const ids = [];
  for (let i = cursor + 1; i <= Math.min(last, cursor + batch); i++) ids.push(i);
  const [raws] = await redis([["MGET", ...ids.map((i) => `ad:${i}`)]]);
  const ads = (raws || []).map((r) => (r ? JSON.parse(r) : null)).filter(Boolean);

  const missing = ads.filter((a) => !a.photo_file_id && keyOf(a));
  const known = {};
  if (missing.length) {
    const keys = [...new Set(missing.map(keyOf))];
    const [vals] = await redis([["HMGET", "photo:bykey", ...keys]]);
    keys.forEach((k, i) => { if (vals && vals[i]) known[k] = vals[i]; });
  }
  const cmds = [];
  const setPairs = [];
  let filled = 0;
  for (const a of ads) {
    const k = keyOf(a);
    if (!k) continue;
    if (a.photo_file_id) { known[k] = a.photo_file_id; setPairs.push(k, a.photo_file_id); }
    else if (known[k]) { cmds.push(["SET", `ad:${a.id}`, toStored({ ...a, photo_file_id: known[k], photo_borrowed: true })]); filled++; }
  }
  if (setPairs.length) cmds.push(["HSET", "photo:bykey", ...setPairs]);
  cmds.push(["SET", "photo:cursor", String(ids.at(-1))]);
  await redis(cmds);
  return { done: false, cursor: ids.at(-1), filled };
}

module.exports = { handleNewAdPhoto, catchUpPhotos };
