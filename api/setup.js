// Liga o bot ao site (registra o webhook no Telegram) e mostra o estado da
// configuracao. Abra no navegador, uma vez, depois de configurar a Vercel:
//   https://SEU-SITE.vercel.app/api/setup?key=SEU_SETUP_KEY

const { isConfigured, countAds, listSeenChats } = require("./_lib/store");

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const { webhookSecret } = require("./_lib/secret");

const WEBHOOK_SECRET = webhookSecret();
const SETUP_KEY = process.env.SETUP_KEY;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

async function telegram(method, params) {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params || {}),
  });
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (!SETUP_KEY || (req.query || {}).key !== SETUP_KEY) {
    res.status(401).json({ error: "Informe ?key= com o valor de SETUP_KEY." });
    return;
  }

  const missing = [];
  if (!TOKEN) missing.push("TELEGRAM_BOT_TOKEN");
  if (!WEBHOOK_SECRET) missing.push("TELEGRAM_WEBHOOK_SECRET");
  if (!isConfigured()) missing.push("banco Upstash Redis (Storage na Vercel)");
  if (missing.length > 0) {
    res.status(200).json({ ok: false, falta_configurar: missing });
    return;
  }

  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const webhookUrl = `https://${host}/api/telegram`;

  const bot = await telegram("getMe");
  if (!bot.ok) {
    res.status(200).json({
      ok: false,
      erro: "O Telegram recusou o TELEGRAM_BOT_TOKEN. Confira o token na Vercel.",
    });
    return;
  }

  const set = await telegram("setWebhook", {
    url: webhookUrl,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "channel_post", "edited_message", "edited_channel_post"],
  });
  const info = await telegram("getWebhookInfo");
  const [total, chats] = await Promise.all([countAds(), listSeenChats()]);

  res.status(200).json({
    ok: Boolean(set.ok),
    bot: `@${bot.result.username}`,
    webhook: webhookUrl,
    webhook_registrado: set.ok ? "sim" : set.description,
    mensagens_pendentes_no_telegram: info.result ? info.result.pending_update_count : null,
    ultimo_erro_do_telegram: info.result ? info.result.last_error_message || null : null,
    chat_filtrado: CHAT_ID || "nenhum (salva mensagens de todos os chats onde o bot esta)",
    chats_vistos: chats,
    anuncios_salvos: total,
  });
};
