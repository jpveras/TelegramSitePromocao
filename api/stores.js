// Identifica a loja dos anuncios antigos mais rapido (botao no painel).
// O webhook ja faz isso aos poucos a cada anuncio novo; esta rota adianta.
//   GET /api/stores?key=SETUP_KEY

const { isConfigured, redis } = require("./_lib/store");
const { backfillStores } = require("./_lib/resolve");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const key = (req.query || {}).key;
  if (!process.env.SETUP_KEY || key !== process.env.SETUP_KEY) {
    res.status(401).json({ error: "Chave invalida" });
    return;
  }
  if (!isConfigured()) {
    res.status(200).json({ ok: false, error: "Banco nao configurado" });
    return;
  }
  try {
    const { cursor, processed } = await backfillStores({ budgetMs: 7000, max: 30 });
    const counts = {};
    for (const [, store] of processed) counts[store] = (counts[store] || 0) + 1;
    const [total] = await redis([["ZCARD", "ads:index"]]);
    res.status(200).json({
      ok: true,
      processados_agora: processed.length,
      lojas: counts,
      faltam_aprox: Math.max(0, cursor),
      total: Number(total) || 0,
    });
  } catch (err) {
    console.error("[stores] Falha:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
};
