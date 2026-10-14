// Contador anonimo de visitas e cliques do site, guardado no mesmo Redis.
// Nao guarda nome, IP nem dado pessoal: so contagens por dia e um id
// aleatorio por navegador (para contar visitantes unicos).
//
// Estrutura no Redis (por dia, no fuso de Sao Paulo):
//   st:<AAAA-MM-DD>:<evento>  -> contador do evento no dia
//   st:<AAAA-MM-DD>:uv        -> HyperLogLog dos visitantes unicos do dia
//   st:<AAAA-MM-DD>:offers    -> sorted set id do anuncio -> cliques no dia
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
  const tmp = `st:tmp:top:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const [, top] = await redis([
    ["ZUNIONSTORE", tmp, String(unionKeys.length), ...unionKeys],
    ["ZRANGE", tmp, "0", "9", "REV", "WITHSCORES"],
    ["DEL", tmp],
  ]);
  const topOffers = [];
  for (let j = 0; j < (top || []).length; j += 2) {
    topOffers.push({ id: Number(top[j]), clicks: Number(top[j + 1]) });
  }

  return { events: EVENTS, perDay, total, topOffers };
}

module.exports = { EVENTS, recordEvent, readStats, dayKey };
