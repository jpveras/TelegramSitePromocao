// Lista os anuncios para o site.
//   GET /api/ads?limit=60             -> mais recentes
//   GET /api/ads?limit=60&before=123  -> mais antigos que o id 123 (botao "carregar mais")
//   GET /api/ads?after=123            -> novos desde o id 123 (feed ao vivo)

const { isConfigured, listAds, listAdsAfter, countAds } = require("./_lib/store");

// O que vai para o navegador: sem ids internos do Telegram. A foto passa
// pela rota /api/photo, para o token do bot nunca aparecer no site.
function toPublic(ad) {
  return {
    id: ad.id,
    // O DisparaPromo poe espacos invisiveis dentro dos precos ("R$ 1.​029"),
    // o que cortava o preco no site. Remove-os so na exibicao.
    text: ad.text ? ad.text.replace(/[\u200b-\u200d\u2060\ufeff]/g, "") : ad.text,
    posted_at: ad.posted_at,
    updated_at: ad.updated_at || null,
    // "v=2" invalida a copia em cache das fotos servidas antes com tipo errado.
    photo_url: ad.photo_file_id ? `/api/photo?ad=${ad.id}&v=2` : null,
  };
}

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!isConfigured()) {
    res.status(200).json({ configured: false, total: 0, ads: [] });
    return;
  }

  const query = req.query || {};
  const limit = Math.min(toInt(query.limit) || 60, 200);
  const before = toInt(query.before);
  const after = toInt(query.after);

  try {
    const [ads, total] = await Promise.all([
      after !== null ? listAdsAfter(after) : listAds({ limit, before }),
      countAds(),
    ]);
    res.status(200).json({ configured: true, total, ads: ads.map(toPublic) });
  } catch (err) {
    console.error("[ads] Falha ao listar anuncios:", err.message);
    res.status(500).json({ error: "Falha ao carregar anuncios" });
  }
};
