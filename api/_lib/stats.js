// Contador anonimo de visitas e cliques do site, guardado no mesmo Redis.
// Nao guarda nome, IP nem dado pessoal: so contagens por dia e um id
// aleatorio por navegador (para contar visitantes unicos).
//
// Estrutura no Redis (por dia, no fuso de Sao Paulo):
//   st:<AAAA-MM-DD>:<evento>  -> contador do evento no dia
//   st:<AAAA-MM-DD>:uv        -> HyperLogLog dos visitantes unicos do dia
//   st:<AAAA-MM-DD>:offers    -> sorted set id do anuncio -> cliques no dia
//   st:<AAAA-MM-DD>:views     -> sorted set id do anuncio -> vezes que apareceu na tela
//   st:total:<evento>         -> contador desde o inicio

const { redis } = require("./store");

const EVENTS = {
  visit: "Visitas (páginas abertas)",
  offer: "Cliques em \"Ver oferta\"",
  coupon: "Cupons copiados",
  whatsapp: "Cliques no WhatsApp",
  telegram: "Cliques no Telegram",
  instagram: "Cliques no Instagram",
  exit_shown: "Aviso de saída exibido",
  exit_whatsapp: "Aviso de saída → WhatsApp",
  share: "Ofertas compartilhadas",
  install: "Site instalado como app",
  view: "Ofertas vistas na tela",
};
const KEEP_SECONDS = 400 * 24 * 60 * 60; // guarda o detalhe diario por ~13 meses

function dayKey(date = new Date()) {
  // en-CA formata como AAAA-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function recordEvent({ event, visitorId, adId }) {
  const day = dayKey();
  const cmds = [
    ["INCR", `st:${day}:${event}`],
    ["EXPIRE", `st:${day}:${event}`, String(KEEP_SECONDS)],
    ["INCR", `st:total:${event}`],
  ];
  if (event === "visit" && visitorId) {
    cmds.push(["PFADD", `st:${day}:uv`, visitorId], ["EXPIRE", `st:${day}:uv`, String(KEEP_SECONDS)]);
    cmds.push(["PFADD", "st:total:uv", visitorId]);
  }
  if (event === "offer" && adId) {
    cmds.push(["ZINCRBY", `st:${day}:offers`, "1", String(adId)], ["EXPIRE", `st:${day}:offers`, String(KEEP_SECONDS)]);
    cmds.push(["ZINCRBY", "st:total:offers", "1", String(adId)]);
  }
  await redis(cmds);
}

// Ofertas que apareceram na tela (o site manda em lote, uma vez por oferta por visita).
async function recordViews({ ids }) {
  const list = [...new Set(ids)].slice(0, 60);
  if (list.length === 0) return;
  const day = dayKey();
  const cmds = [
    ["INCRBY", `st:${day}:view`, String(list.length)],
    ["EXPIRE", `st:${day}:view`, String(KEEP_SECONDS)],
    ["INCRBY", "st:total:view", String(list.length)],
  ];
  for (const id of list) {
    cmds.push(["ZINCRBY", `st:${day}:views`, "1", String(id)]);
    cmds.push(["ZINCRBY", "st:total:views", "1", String(id)]);
  }
  cmds.push(["EXPIRE", `st:${day}:views`, String(KEEP_SECONDS)]);
  await redis(cmds);
}

async function readStats(days) {
  const names = Object.keys(EVENTS);
  const list = [];
  for (let i = 0; i < days; i++) list.push(dayKey(new Date(Date.now() - i * 86400000)));

  const cmds = [];
  for (const d of list) {
    for (const e of names) cmds.push(["GET", `st:${d}:${e}`]);
    cmds.push(["PFCOUNT", `st:${d}:uv`]);
  }
  for (const e of names) cmds.push(["GET", `st:total:${e}`]);
  cmds.push(["PFCOUNT", "st:total:uv"]);
  const res = await redis(cmds);

  let i = 0;
  const perDay = list.map((d) => {
    const row = { day: d };
    for (const e of names) row[e] = Number(res[i++]) || 0;
    row.unique = Number(res[i++]) || 0;
    return row;
  });
  const total = {};
  for (const e of names) total[e] = Number(res[i++]) || 0;
  total.unique = Number(res[i++]) || 0;

  // Ofertas mais clicadas no periodo
  const unionKeys = list.map((d) => `st:${d}:offers`);
  const viewKeys = list.map((d) => `st:${d}:views`);
  const rnd = `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const tmp = `st:tmp:top:${rnd}`;
  const tmpV = `st:tmp:views:${rnd}`;
  const [, top, , topV] = await redis([
    ["ZUNIONSTORE", tmp, String(unionKeys.length), ...unionKeys],
    ["ZRANGE", tmp, "0", "9", "REV", "WITHSCORES"],
    ["ZUNIONSTORE", tmpV, String(viewKeys.length), ...viewKeys],
    ["ZRANGE", tmpV, "0", "9", "REV", "WITHSCORES"],
  ]);
  const topOffers = [];
  for (let j = 0; j < (top || []).length; j += 2) {
    topOffers.push({ id: Number(top[j]), clicks: Number(top[j + 1]) });
  }
  const topViewed = [];
  for (let j = 0; j < (topV || []).length; j += 2) {
    topViewed.push({ id: Number(topV[j]), views: Number(topV[j + 1]) });
  }
  // Vistas das mais clicadas e cliques das mais vistas (para a taxa de clique).
  const scoreCmds = [
    ...topOffers.map((o) => ["ZSCORE", tmpV, String(o.id)]),
    ...topViewed.map((o) => ["ZSCORE", tmp, String(o.id)]),
    ["DEL", tmp],
    ["DEL", tmpV],
  ];
  const scores = await redis(scoreCmds);
  topOffers.forEach((o, i) => { o.views = Number(scores[i]) || 0; });
  topViewed.forEach((o, i) => { o.clicks = Number(scores[topOffers.length + i]) || 0; });

  return { events: EVENTS, perDay, total, topOffers, topViewed };
}

module.exports = { EVENTS, recordEvent, recordViews, readStats, dayKey };
