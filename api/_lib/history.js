// Historico de preco: o mesmo produto costuma ser anunciado mais de uma vez.
// Para cada produto (pelo nome) guardamos o menor e o ultimo preco vistos.
// Cada anuncio recebe "ph" com o que se sabia ANTES dele:
//   { prev, prevAt, min, minAt, count }
// Processa os anuncios em ordem de id (cursor price:cursor), entao o
// historico fica certo mesmo para os antigos.

const { redis, toStored } = require("./store");
const { describe, parseBRL, productKey } = require("./parse");

async function recordPrice(ad) {
  const d = describe(ad);
  const price = parseBRL(d.now);
  const key = productKey(d.name);
  if (!price || key.length < 8) return null;
  const stateKey = `ph:${key}`;
  const [raw] = await redis([["GET", stateKey]]);
  const st = raw ? JSON.parse(raw) : null;
  const at = ad.posted_at;
  const cmds = [];
  let ph = null;
  if (st) {
    ph = { prev: st.last, prevAt: st.lastAt, min: st.min, minAt: st.minAt, count: st.count };
    cmds.push(["SET", `ad:${ad.id}`, toStored({ ...ad, ph })]);
  }
  const next = st
    ? {
        min: price < st.min ? price : st.min,
        minAt: price < st.min ? at : st.minAt,
        last: price, lastAt: at, count: st.count + 1,
      }
    : { min: price, minAt: at, last: price, lastAt: at, count: 1 };
  cmds.push(["SET", stateKey, JSON.stringify(next)]);
  await redis(cmds);
  return ph;
}

// Processa ate "max" anuncios ainda nao vistos, do mais antigo para o mais novo.
async function catchUpPrices({ max = 60, budgetMs = 6000 } = {}) {
  const started = Date.now();
  const [curRaw, nextRaw] = await redis([["GET", "price:cursor"], ["GET", "ads:next_id"]]);
  let cur = Number(curRaw) || 0;
  const last = Number(nextRaw) || 0;
  let done = 0;
  while (cur < last && done < max && Date.now() - started < budgetMs) {
    const ids = [];
    for (let i = cur + 1; i <= Math.min(last, cur + 20); i++) ids.push(i);
    const [raws] = await redis([["MGET", ...ids.map((i) => `ad:${i}`)]]);
    for (let j = 0; j < ids.length; j++) {
      cur = ids[j];
      done++;
      if (raws[j]) {
        try { await recordPrice(JSON.parse(raws[j])); } catch (err) { console.error("[history]", cur, err.message); }
      }
    }
    await redis([["SET", "price:cursor", String(cur)]]);
  }
  return { cursor: cur, done };
}

module.exports = { recordPrice, catchUpPrices };
