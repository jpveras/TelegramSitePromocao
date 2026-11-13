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

  const t0 = Date.now();
  const step = (name) => console.log(`[photo] ad=${id} ${name} +${Date.now() - t0}ms`);
  try {
    const ad = await getAd(id);
    step("redis");
    if (!ad || !ad.photo_file_id) {
      res.status(404).end();
      return;
    }

    // s=m: versao media para os cards, quando existir.
    const fileId = (req.query || {}).s === "m" && ad.photo_thumb_id ? ad.photo_thumb_id : ad.photo_file_id;
    const infoRes = await fetch(
      `https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const info = await infoRes.json();
    step(`getFile ${infoRes.status} ${info.ok ? "ok" : info.description || ""}`);
    if (!info.ok || !info.result || !info.result.file_path) {
      res.status(404).end();
      return;
    }

    const fileRes = await fetch(
      `https://api.telegram.org/file/bot${TOKEN}/${info.result.file_path}`,
      { signal: AbortSignal.timeout(10000) }
    );
    step(`download ${fileRes.status}`);
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
    step(`enviado ${buffer.length}b`);
  } catch (err) {
    console.error("[photo] Falha ao buscar foto:", err.message);
    res.status(502).end();
  }
};
