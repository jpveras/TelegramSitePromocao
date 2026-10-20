// Lista os anuncios para o site.
//   GET /api/ads?limit=60             -> mais recentes
//   GET /api/ads?limit=60&before=123  -> mais antigos que o id 123 (botao "carregar mais")
//   GET /api/ads?after=123            -> novos desde o id 123 (feed ao vivo)

const { isConfigured, listAds, listAdsAfter, countAds, countSince } = require("./_lib/store");
const { toPublic } = require("./_lib/public");

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

module.exports = async function handler(req, res) {
  // Cache curto na CDN: varios visitantes perguntando a mesma coisa no mesmo
  // instante recebem a mesma resposta, sem rodar a funcao de novo.
  res.setHeader("Cache-Control", "public, max-age=0, s-maxage=10, stale-while-revalidate=30");

  if (!isConfigured()) {
    res.status(200).json({ configured: false, total: 0, ads: [] });
    return;
  }

  const query = req.query || {};
  const limit = Math.min(toInt(query.limit) || 60, 200);
  const before = toInt(query.before);
  const after = toInt(query.after);

  try {
    const [ads, total, last24h] = await Promise.all([
      after !== null ? listAdsAfter(after) : listAds({ limit, before }),
      countAds(),
      countSince(Date.now() - 24 * 60 * 60 * 1000),
    ]);
    res.status(200).json({ configured: true, total, last24h, ads: ads.map(toPublic) });
  } catch (err) {
    console.error("[ads] Falha ao listar anuncios:", err.message);
    res.status(500).json({ error: "Falha ao carregar anuncios" });
  }
};
