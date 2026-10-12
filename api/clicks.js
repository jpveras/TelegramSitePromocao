// Total de cliques em "Ver oferta", publico (sem SETUP_KEY), para mostrar
// um contador na propria pagina.
//   GET /api/clicks

const { isConfigured, redis } = require("./_lib/store");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=120");
  if (!isConfigured()) {
    res.status(200).json({ clicks: 0 });
    return;
  }
  try {
    const [raw] = await redis([["GET", "st:total:offer"]]);
    res.status(200).json({ clicks: Number(raw) || 0 });
  } catch (err) {
    console.error("[clicks] Falha ao ler contador:", err.message);
    res.status(200).json({ clicks: 0 });
  }
};
