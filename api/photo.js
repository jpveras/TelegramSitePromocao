// Entrega a foto de um anuncio. A imagem fica nos servidores do Telegram e
// o link direto contem o token do bot, entao o site nunca recebe esse link:
// ele pede /api/photo?ad=<id> e esta rota busca a imagem por tras.
//
// Em 12/11/2026 as fotos pararam: as chamadas ao Telegram ficavam presas sem
// resposta ate a funcao estourar o tempo. Por isso cada chamada tem limite de
// tempo e, se falhar, tenta de novo com uma conexao nova (sem reaproveitar).

const https = require("https");
const { isConfigured, getAd } = require("./_lib/store");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

// GET com conexao propria (agent:false = nada de conexao antiga reaproveitada).
function getFresh(url, ms) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: false, timeout: ms, headers: { Connection: "close" } }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

// 1a tentativa: fetch normal (rapido). Falhou ou demorou: conexao nova.
async function getBytes(url, ms) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms) });
    return { status: r.status, body: Buffer.from(await r.arrayBuffer()) };
  } catch (err) {
    console.error("[photo] 1a tentativa falhou, tentando com conexao nova:", err.name || err.message);
    return getFresh(url, ms);
  }
}

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

    // s=m: versao media para os cards, quando existir.
    const fileId = (req.query || {}).s === "m" && ad.photo_thumb_id ? ad.photo_thumb_id : ad.photo_file_id;
    const infoRes = await getBytes(`https://api.telegram.org/bot${TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`, 6000);
    let info = null;
    try { info = JSON.parse(infoRes.body.toString("utf8")); } catch { /* resposta invalida */ }
    if (!info || !info.ok || !info.result || !info.result.file_path) {
      console.error("[photo] getFile sem arquivo:", id, infoRes.status, info && info.description);
      res.setHeader("Cache-Control", "no-store");
      res.status(404).end();
      return;
    }

    const fileRes = await getBytes(`https://api.telegram.org/file/bot${TOKEN}/${info.result.file_path}`, 8000);
    if (fileRes.status !== 200 || !fileRes.body.length) {
      console.error("[photo] download falhou:", id, fileRes.status);
      res.setHeader("Cache-Control", "no-store");
      res.status(502).end();
      return;
    }

    // O Telegram responde "application/octet-stream"; sem o tipo certo o
    // navegador nao mostra a imagem. Deduz pelo final do arquivo.
    const ext = (info.result.file_path.split(".").pop() || "").toLowerCase();
    const types = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
    res.setHeader("Content-Type", types[ext] || "image/jpeg");
    res.setHeader("X-Content-Type-Options", "nosniff");
    // A foto de um anuncio nao muda: a CDN da Vercel guarda por 30 dias.
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=2592000, immutable");
    res.status(200).send(fileRes.body);
  } catch (err) {
    console.error("[photo] Falha ao buscar foto:", id, err.message);
    res.setHeader("Cache-Control", "no-store");
    res.status(502).end();
  }
};
