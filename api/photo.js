// Entrega a foto de um anuncio. A imagem fica nos servidores do Telegram e
// o link direto contem o token do bot, entao o site nunca recebe esse link:
// ele pede /api/photo?ad=<id> e esta rota busca a imagem por tras.

const { isConfigured, getAd } = require("./_lib/store");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

module.exports = async function handler(req, res) {
  const id = Number.parseInt((req.query || {}).ad, 10);
  if (!Number.isFinite(id) || !TOKEN || !isConfigured()) {
    res.status(404).end();
    return;
  }

  try {
    const ad = await getAd(id);
    if (!ad || !ad.photo_file_id) {
      res.status(404).end();
      return;
    }

    const infoRes = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(ad.photo_file_id)}`
    );
    const info = await infoRes.json();
    if (!info.ok || !info.result || !info.result.file_path) {
      res.status(404).end();
      return;
    }

    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${TOKEN}/${info.result.file_path}`
    );
    if (!fileRes.ok) {
      res.status(502).end();
      return;
    }

    const buffer = Buffer.from(await fileRes.arrayBuffer());
    // O Telegram responde "application/octet-stream"; sem o tipo certo o
    // navegador nao mostra a imagem. Deduz pelo final do arquivo.
    const ext = (info.result.file_path.split(".").pop() || "").toLowerCase();
    const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    res.setHeader("Content-Type", types[ext] || "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // A foto de um anuncio nao muda: a CDN da Vercel guarda por 30 dias.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=2592000, immutable");
    res.status(200).send(buffer);
  } catch (err) {
    console.error("[photo] Falha ao buscar foto:", err.message);
    res.status(502).end();
  }
};
