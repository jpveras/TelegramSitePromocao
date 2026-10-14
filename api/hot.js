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

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60, stale-while-revalidate=300");
  if (!isConfigured()) {
    res.status(200).json({ period: "today", items: [] });
    return;
  }
  try {
    const today = dayKey();
    const yesterday = dayKey(new Date(Date.now() - 86400000));
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
    res.status(200).json({ period, items });
  } catch (err) {
    console.error("[hot] Falha:", err.message);
    res.status(200).json({ period: "today", items: [] });
  }
};
