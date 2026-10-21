// Ofertas mais clicadas hoje (publico, sem dados pessoais): usado no
// "Mais clicadas hoje" e nos selos "Em alta" do site.
//   GET /api/hot
// Se hoje ainda tem poucos cliques, soma os de ontem (periodo "48h").

const { isConfigured, redis } = require("./_lib/store");
const { dayKey } = require("./_lib/stats");
const { toPublic } = require("./_lib/public");

function pairs(flat) {
  const out = [];
  for (let i = 0; i < (flat || []).length; i += 2) out.push({ id: Number(flat[i]), clicks: Number(flat[i + 1]) });
  return out;
}

let seedChecked = false;

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=120, stale-while-revalidate=300");
  if (!isConfigured()) {
    res.status(200).json({ period: "today", items: [], skip: [] });
    return;
  }
  try {
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    // Ofertas tiradas do destaque pelo painel (ex.: cupom expirou).
    // Na primeira vez, ja tira a 982 (Headphone Havit, cupom expirado em 17/10).
    if (!seedChecked) {
      const [seeded] = await redis([["SET", "hero:skip:seeded", "1", "NX"]]);
      if (seeded === "OK") await redis([["SADD", "hero:skip", "982"]]);
      seedChecked = true;
    }
    // Mesma ida ao banco: ofertas fora do destaque + mais vistas hoje (selo "viram hoje").
    const [skipRaw, viewsFlat] = await redis([["SMEMBERS", "hero:skip"], ["ZRANGE", `st:${today}:views`, "0", "59", "REV", "WITHSCORES"]]);
    const views = {};
    for (let i = 0; i + 1 < (viewsFlat || []).length; i += 2) views[viewsFlat[i]] = Number(viewsFlat[i + 1]) || 0;
    const skip = (skipRaw || []).map(Number).filter(Boolean);
    let period = "today";
    let [flat] = await redis([["ZRANGE", `st:${today}:offers`, "0", "11", "REV", "WITHSCORES"]]);
    let list = pairs(flat);
    if (list.length < 4) {
      period = "48h";
      const tmp = `st:tmp:hot:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
      const [, top] = await redis([
        ["ZUNIONSTORE", tmp, "2", `st:${today}:offers`, `st:${yesterday}:offers`],
        ["ZRANGE", tmp, "0", "11", "REV", "WITHSCORES"],
        ["DEL", tmp],
      ]);
      list = pairs(top);
    }
    const raws = list.length ? (await redis([["MGET", ...list.map((x) => `ad:${x.id}`)]]))[0] : [];
    const items = [];
    list.forEach((x, i) => {
      if (raws[i]) items.push({ id: x.id, clicks: x.clicks, ad: toPublic(JSON.parse(raws[i])) });
    });
    res.status(200).json({ period, items: items.filter((x) => !skip.includes(x.id)), skip, views });
  } catch (err) {
    console.error("[hot] Falha:", err.message);
    res.status(200).json({ period: "today", items: [] });
  }
};
