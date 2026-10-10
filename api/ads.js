// Espelho do canal do Telegram para o site.
//   GET /api/ads              -> posts mais recentes
//   GET /api/ads?before=123   -> posts mais antigos que o 123 (botao "carregar mais")
//   GET /api/ads?after=123    -> posts novos desde o 123 (feed ao vivo)

const { normalizeChannel, fetchChannelPage } = require("./_lib/channel");

const CONFIGURED_CHANNEL = normalizeChannel(process.env.TELEGRAM_CHANNEL);

function toInt(value) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = async function handler(req, res) {
  const query = req.query || {};
  // Enquanto TELEGRAM_CHANNEL nao estiver configurado, da para testar outro
  // canal publico com ?channel=nome. Depois de configurado, so o canal oficial.
  const CHANNEL = CONFIGURED_CHANNEL || normalizeChannel(query.channel);
  if (!CHANNEL) {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ configured: false, ads: [] });
    return;
  }

  const before = toInt(query.before);
  const after = toInt(query.after);

  try {
    const { available, posts } = await fetchChannelPage(CHANNEL, { before });
    if (!available) {
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({
        configured: true,
        available: false,
        channel: CHANNEL,
        error: "Canal nao encontrado ou nao e publico.",
        ads: [],
      });
      return;
    }

    const ads = after ? posts.filter((p) => p.id > after) : posts;
    // A CDN da Vercel guarda a resposta por 10s: muitos visitantes ao mesmo
    // tempo geram uma unica consulta ao Telegram.
    res.setHeader("Cache-Control", "public, s-maxage=10, stale-while-revalidate=30");
    res.status(200).json({ configured: true, available: true, channel: CHANNEL, ads });
  } catch (err) {
    console.error("[ads] Falha ao ler o canal:", err.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).json({ error: "Falha ao ler o canal do Telegram" });
  }
};
