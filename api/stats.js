// Numeros do site para o painel (/painel.html). Protegido pela SETUP_KEY.
//   GET /api/stats?key=SUA_SETUP_KEY&days=7

const { isConfigured, redis } = require("./_lib/store");
const { readStats } = require("./_lib/stats");

const SETUP_KEY = process.env.SETUP_KEY;

function headline(text) {
  if (!text) return "Anúncio";
  const product = text.split("\n").find((l) => /^\s*🔥/.test(l));
  const line = product || text.split("\n").find((l) => l.trim());
  return (line || "Anúncio").replace(/^\s*🔥\s*/, "").trim().slice(0, 120);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const query = req.query || {};
  if (!SETUP_KEY || query.key !== SETUP_KEY) {
    res.status(401).json({ error: "Chave inválida." });
    return;
  }
  if (!isConfigured()) {
    res.status(200).json({ error: "Banco não configurado." });
    return;
  }
  const days = Math.min(Math.max(Number.parseInt(query.days, 10) || 7, 1), 90);
  try {
    const stats = await readStats(days);
    for (const listName of ["topOffers", "topViewed"]) {
      const list = stats[listName] || [];
      if (list.length === 0) continue;
      const [raws] = await redis([["MGET", ...list.map((o) => `ad:${o.id}`)]]);
      stats[listName] = list.map((o, i) => {
        const ad = raws && raws[i] ? JSON.parse(raws[i]) : null;
        return { ...o, title: ad ? headline(ad.text) : "Anúncio removido" };
      });
    }
    res.status(200).json({ days, ...stats });
  } catch (err) {
    console.error("[stats] Falha ao ler numeros:", err.message);
    res.status(500).json({ error: "Falha ao ler os números." });
  }
};
