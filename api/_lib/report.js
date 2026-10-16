// Resumo diario das Promocoes do Veras, enviado pelo bot no Telegram.
//   report:chat          -> chat (privado) que recebe o resumo
//   report:candidates    -> hash chat_id -> nome de quem mandou /start no privado
//   report:sent:<dia>    -> marca que o resumo do dia ja foi enviado

const { redis, countAds, countSince } = require("./store");
const { readStats, dayKey } = require("./stats");
const { sendMessage } = require("./tg");

const SITE = "https://promocoesdoveras.com.br";

function esc(s) {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1).replace(".", ",")}%` : "—");

function headline(text) {
  const lines = String(text || "").split("\n");
  const line = lines.find((l) => /^\s*🔥/u.test(l)) || lines.find((l) => l.trim()) || "Oferta";
  return line.replace(/^\s*🔥\s*/u, "").trim();
}

function trend(today, yesterday) {
  if (!yesterday) return "";
  const d = Math.round(((today - yesterday) / yesterday) * 100);
  if (d === 0) return " (igual a ontem)";
  return d > 0 ? ` (▲ ${d}% vs ontem)` : ` (▼ ${Math.abs(d)}% vs ontem)`;
}

async function buildReport() {
  const [two, one, total, last24h] = await Promise.all([readStats(2), readStats(1), countAds(), countSince(Date.now() - 86400000)]);
  const t = two.perDay[0] || {};
  const y = two.perDay[1] || {};
  const [dd, mm] = [dayKey().slice(8, 10), dayKey().slice(5, 7)];

  let top = one.topOffers.slice(0, 3);
  if (top.length) {
    const [raws] = await redis([["MGET", ...top.map((o) => `ad:${o.id}`)]]);
    top = top.map((o, i) => ({ ...o, title: raws && raws[i] ? headline(JSON.parse(raws[i]).text) : "Oferta removida" }));
  }
  const cut = (s) => (s.length > 60 ? s.slice(0, 58) + "…" : s);

  const lines = [
    `📊 <b>Promoções do Veras · ${dd}/${mm}</b>`,
    "",
    `👀 <b>${fmt(t.visit)}</b> visitas · ${fmt(t.unique)} pessoas${trend(t.visit, y.visit)}`,
    `🖼️ <b>${fmt(t.view)}</b> ofertas vistas na tela`,
    `🛒 <b>${fmt(t.offer)}</b> cliques em ofertas${t.view ? ` · ${pct(t.offer, t.view)} das vistas` : ""}${trend(t.offer, y.offer)}`,
    `🎟️ ${fmt(t.coupon)} cupons copiados · 📤 ${fmt(t.share)} compartilhadas`,
    `📲 ${fmt((t.whatsapp || 0) + (t.exit_whatsapp || 0))} WhatsApp · ✈️ ${fmt(t.telegram)} Telegram · 📸 ${fmt(t.instagram)} Instagram`,
    `📦 ${fmt(last24h)} ofertas publicadas nas últimas 24h (total ${fmt(total)})`,
  ];
  if (top.length) {
    lines.push("", "🏆 <b>Mais clicadas hoje</b>");
    top.forEach((o, i) => lines.push(`${i + 1}. ${esc(cut(o.title))} — ${fmt(o.clicks)} clique${o.clicks === 1 ? "" : "s"}`));
  } else {
    lines.push("", "Nenhum clique em oferta hoje ainda.");
  }
  lines.push("", `<a href="${SITE}/admin">Abrir o painel</a> · <a href="${SITE}">Ver o site</a>`);
  return lines.join("\n");
}

async function reportChat() {
  const [chat] = await redis([["GET", "report:chat"]]);
  return chat || null;
}

// force = envia mesmo que o resumo do dia ja tenha sido enviado (teste / /resumo).
async function sendReport({ force = false } = {}) {
  const chat = await reportChat();
  if (!chat) return { sent: false, reason: "nenhum chat escolhido no painel" };
  if (!force) {
    const [ok] = await redis([["SET", `report:sent:${dayKey()}`, "1", "NX", "EX", String(3 * 86400)]]);
    if (ok !== "OK") return { sent: false, reason: "resumo de hoje já enviado" };
  }
  await sendMessage(chat, await buildReport());
  return { sent: true, chat };
}

async function rememberCandidate(chatId, name) {
  await redis([["HSET", "report:candidates", String(chatId), String(name || chatId)]]);
}

async function listCandidates() {
  const [flat] = await redis([["HGETALL", "report:candidates"]]);
  const out = [];
  for (let i = 0; i < (flat || []).length; i += 2) out.push({ id: flat[i], name: flat[i + 1] });
  return out;
}

module.exports = { buildReport, sendReport, reportChat, rememberCandidate, listCandidates };
