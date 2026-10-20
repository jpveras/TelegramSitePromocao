// Recebe os eventos do site (visita, clique em oferta, cupom, redes...).
// Chamado pelo navegador com navigator.sendBeacon, inclusive no clique que
// leva para a loja, sem atrasar o redirecionamento.

const { isConfigured } = require("./_lib/store");
const { EVENTS, recordEvent, recordViews } = require("./_lib/stats");

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : req.body;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.status(405).end();
    return;
  }
  const body = readBody(req) || {};
  const event = String(body.e || "");
  if (!Object.prototype.hasOwnProperty.call(EVENTS, event) || !isConfigured()) {
    res.status(204).end();
    return;
  }
  // Visualizacoes chegam em lote: { e: "view", ids: [12, 13, ...] }
  if (event === "view") {
    const ids = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isInteger(n) && n > 0) : [];
    try {
      await recordViews({ ids });
    } catch (err) {
      console.error("[track] Falha ao registrar visualizacoes:", err.message);
    }
    res.status(204).end();
    return;
  }
  const visitorId = /^[a-z0-9]{8,40}$/i.test(body.v || "") ? body.v : null;
  const adId = Number.isInteger(body.a) && body.a > 0 ? body.a : null;
  // "Essa oferta acabou": 1 aviso por visitante; com 3 avisos a oferta sai do
  // destaque sozinha e ganha o aviso no card.
  if (event === "ended" && adId && visitorId) {
    try {
      const { redis, saveAdFields } = require("./_lib/store");
      const [added, , count] = await redis([
        ["SADD", `ended:${adId}`, visitorId],
        ["EXPIRE", `ended:${adId}`, String(30 * 86400)],
        ["SCARD", `ended:${adId}`],
      ]);
      if (Number(added) === 1) {
        await redis([["ZADD", "ended:ads", String(Number(count) || 1), String(adId)]]);
        await recordEvent({ event, visitorId, adId });
        if (Number(count) >= 3) {
          await redis([["SADD", "hero:skip", String(adId)]]);
          await saveAdFields(adId, { ended_reported: true });
        }
      }
    } catch (err) {
      console.error("[track] Falha ao registrar aviso de encerrada:", err.message);
    }
    res.status(204).end();
    return;
  }
  try {
    await recordEvent({ event, visitorId, adId });
  } catch (err) {
    console.error("[track] Falha ao registrar evento:", err.message);
  }
  res.status(204).end();
};
