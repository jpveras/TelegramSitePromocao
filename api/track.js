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
  try {
    await recordEvent({ event, visitorId, adId });
  } catch (err) {
    console.error("[track] Falha ao registrar evento:", err.message);
  }
  res.status(204).end();
};
