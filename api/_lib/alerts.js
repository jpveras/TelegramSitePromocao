// Alertas de produto pelo Telegram: a pessoa manda "/alerta rtx" para o bot
// e recebe no privado cada oferta nova com essas palavras no nome.
//   alert:users          -> set de chats com alertas
//   alert:kw:<chat>      -> set de palavras-chave do chat

const { redis } = require("./store");
const { describe, productKey } = require("./parse");
const { sendMessage, sendPhoto } = require("./tg");

const SITE = "https://promocoesdoveras.com.br";
const MAX_ALERTS = 10;

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

function normKeyword(kw) {
  return productKey(kw).slice(0, 40);
}

async function addAlert(chatId, kw) {
  const k = normKeyword(kw);
  if (k.length < 2) return { ok: false, reason: "curta" };
  const [count] = await redis([["SCARD", `alert:kw:${chatId}`]]);
  if (Number(count) >= MAX_ALERTS) return { ok: false, reason: "limite" };
  await redis([["SADD", "alert:users", String(chatId)], ["SADD", `alert:kw:${chatId}`, k]]);
  return { ok: true, keyword: k };
}

async function listAlerts(chatId) {
  const [list] = await redis([["SMEMBERS", `alert:kw:${chatId}`]]);
  return (list || []).sort();
}

async function removeAlert(chatId, kw) {
  const k = normKeyword(kw);
  await redis([["SREM", `alert:kw:${chatId}`, k]]);
  const left = await listAlerts(chatId);
  if (!left.length) await redis([["SREM", "alert:users", String(chatId)]]);
  return left;
}

async function stopAlerts(chatId) {
  await redis([["DEL", `alert:kw:${chatId}`], ["SREM", "alert:users", String(chatId)]]);
}

// Todas as palavras do alerta precisam aparecer no nome do produto.
function matches(kw, nameKey) {
  const words = ` ${nameKey} `;
  return kw.split(" ").every((w) => words.includes(` ${w} `) || (w.length >= 4 && words.includes(` ${w}`)));
}

async function notifyMatches(ad, { budgetMs = 5000 } = {}) {
  const started = Date.now();
  const d = describe(ad);
  const nameKey = productKey(d.name);
  if (!nameKey) return 0;
  const [users] = await redis([["SMEMBERS", "alert:users"]]);
  if (!users || !users.length) return 0;
  const kwLists = await redis(users.map((u) => ["SMEMBERS", `alert:kw:${u}`]));
  let sent = 0;
  for (let i = 0; i < users.length; i++) {
    if (Date.now() - started > budgetMs) break;
    const hit = (kwLists[i] || []).find((kw) => matches(kw, nameKey));
    if (!hit) continue;
    const lines = [
      `🔔 <b>Alerta: ${esc(hit)}</b>`,
      `🔥 ${esc(d.name)}`,
      d.now ? `💰 <b>${esc(d.now)}</b>${d.discount ? ` (-${d.discount}%)` : ""}${d.pix ? " no Pix" : ""}` : "",
      d.coupon ? `🎟️ Cupom: <code>${esc(d.coupon)}</code>` : "",
      `👉 <a href="${SITE}/oferta/${ad.id}">Ver a oferta</a>`,
    ].filter(Boolean);
    const text = `${lines.join("\n")}\n\n<i>Para parar este alerta: /remover ${esc(hit)}</i>`;
    try {
      if (ad.photo_file_id) await sendPhoto(users[i], ad.photo_file_id, text);
      else await sendMessage(users[i], text);
      sent++;
    } catch (err) {
      console.error("[alerts] Falha ao avisar", users[i], err.message);
      // Bloqueou o bot: tira os alertas dessa pessoa.
      if (/blocked|deactivated|chat not found/i.test(err.message)) await stopAlerts(users[i]);
    }
  }
  return sent;
}

// Payload do link t.me/Bot?start=a_<base64url da palavra>
function decodeStartPayload(payload) {
  const m = /^a_([A-Za-z0-9_-]{1,60})$/.exec(String(payload || ""));
  if (!m) return null;
  try {
    return Buffer.from(m[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return null;
  }
}

module.exports = { addAlert, listAlerts, removeAlert, stopAlerts, notifyMatches, decodeStartPayload, matches, normKeyword };
