// Relatorio semanal das Promocoes do Veras (domingo 8h, pelo bot no Telegram).
// Compara a semana que passou (os 7 dias antes de hoje) com a anterior, mostra
// as ofertas e lojas que mais deram clique, confere a saude do site e sugere o
// que fazer na proxima semana. So leitura no banco, exceto a marca de envio.
//   report:weekly:<dia> -> marca que o relatorio daquele domingo ja foi enviado

const { redis } = require("./store");
const { EVENTS, dayKey } = require("./stats");
const { sendMessage } = require("./tg");
const { reportChat } = require("./report");

const SITE = "https://promocoesdoveras.com.br";
const STORE_NAMES = {
  amazon: "Amazon", mercadolivre: "Mercado Livre", shopee: "Shopee", magalu: "Magalu", kabum: "Kabum",
  aliexpress: "AliExpress", americanas: "Americanas", casasbahia: "Casas Bahia", shein: "Shein", carrefour: "Carrefour",
};

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const cut = (s, n = 58) => (s.length > n ? s.slice(0, n - 2) + "…" : s);
function headline(text) {
  const lines = String(text || "").split("\n");
  const line = lines.find((l) => /^\s*🔥/u.test(l)) || lines.find((l) => l.trim()) || "Oferta";
  return line.replace(/^\s*🔥\s*/u, "").replace(/^🎟️\s*/u, "🎟️ ").trim();
}
function delta(now, before) {
  if (!before) return now ? " (novo)" : "";
  const d = Math.round(((now - before) / before) * 100);
  if (d === 0) return " (=)";
  return d > 0 ? ` (▲ ${d}%)` : ` (▼ ${Math.abs(d)}%)`;
}
const days = (from, to) => { const out = []; for (let i = from; i <= to; i++) out.push(dayKey(new Date(Date.now() - i * 86400000))); return out; };
const br = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

async function sumWeek(list) {
  const names = Object.keys(EVENTS);
  const cmds = [];
  for (const d of list) { for (const e of names) cmds.push(["GET", `st:${d}:${e}`]); cmds.push(["PFCOUNT", `st:${d}:uv`]); }
  const res = await redis(cmds);
  const sum = { unique: 0 };
  for (const e of names) sum[e] = 0;
  let i = 0;
  for (let k = 0; k < list.length; k++) { for (const e of names) sum[e] += Number(res[i++]) || 0; sum.unique += Number(res[i++]) || 0; }
  return sum;
}

async function buildWeekly() {
  const week = days(1, 7), prev = days(8, 14);
  const [w, p] = await Promise.all([sumWeek(week), sumWeek(prev)]);

  // Ofertas mais clicadas na semana (ate 30, para somar por loja).
  const tmp = `st:tmp:week:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const offerKeys = week.map((d) => `st:${d}:offers`);
  const weekStart = Date.parse(`${week.at(-1)}T00:00:00-03:00`), weekEnd = Date.parse(`${week[0]}T23:59:59-03:00`);
  const [, topFlat, , lastFlat, posted, endedAll, skipped] = await redis([
    ["ZUNIONSTORE", tmp, String(offerKeys.length), ...offerKeys],
    ["ZRANGE", tmp, "0", "29", "REV", "WITHSCORES"],
    ["DEL", tmp],
    ["ZRANGE", "ads:bytime", "0", "0", "REV", "WITHSCORES"],
    ["ZCOUNT", "ads:bytime", String(weekStart), String(weekEnd)],
    ["ZRANGE", "ended:ads", "0", "-1"],
    ["SMEMBERS", "hero:skip"],
  ]);
  // Avisos de "acabou" ainda nao tratados (a oferta segue no destaque).
  const skipSet = new Set((skipped || []).map(String));
  const endedCount = (endedAll || []).filter((id) => !skipSet.has(String(id))).length;
  const top = [];
  for (let j = 0; j < (topFlat || []).length; j += 2) top.push({ id: Number(topFlat[j]), clicks: Number(topFlat[j + 1]) });
  let ads = [];
  if (top.length) { const [raws] = await redis([["MGET", ...top.map((o) => `ad:${o.id}`)]]); ads = (raws || []).map((r) => (r ? JSON.parse(r) : null)); }
  top.forEach((o, i) => { const a = ads[i]; o.title = a ? headline(a.text) : "Oferta removida"; o.store = a && a.store; });

  const byStore = {};
  let storeTotal = 0;
  for (const o of top) { const k = STORE_NAMES[o.store] ? o.store : "outras"; byStore[k] = (byStore[k] || 0) + o.clicks; storeTotal += o.clicks; }
  const stores = Object.entries(byStore).sort((a, b) => b[1] - a[1]).slice(0, 4);

  // Saude: ultima oferta recebida do disparador.
  const lastMs = lastFlat && lastFlat[1] ? Number(lastFlat[1]) : 0;
  const hoursSince = lastMs ? (Date.now() - lastMs) / 3600000 : Infinity;

  const ctr = w.view ? (w.offer / w.view) * 100 : 0, ctrPrev = p.view ? (p.offer / p.view) * 100 : 0;
  const pctTxt = (n) => `${n.toFixed(1).replace(".", ",")}%`;

  const L = [
    `🗓️ <b>Relatório semanal · ${br(week.at(-1))} a ${br(week[0])}</b>`,
    "",
    "<b>Movimento</b> (vs semana anterior)",
    `👀 ${fmt(w.visit)} visitas${delta(w.visit, p.visit)}`,
    `🖼️ ${fmt(w.view)} ofertas vistas${delta(w.view, p.view)}`,
    `🛒 ${fmt(w.offer)} cliques em ofertas${delta(w.offer, p.offer)}${w.view ? ` · ${pctTxt(ctr)} das vistas` : ""}`,
    `🎟️ ${fmt(w.coupon)} cupons copiados${delta(w.coupon, p.coupon)} · 📤 ${fmt(w.share)} compartilhadas`,
    `📲 ${fmt((w.whatsapp || 0) + (w.exit_whatsapp || 0))} WhatsApp · ✈️ ${fmt(w.telegram)} Telegram · 🔗 ${fmt(w.channels)} Linktree`,
    `📦 ${fmt(posted)} ofertas publicadas na semana`,
  ];
  if (top.length) {
    L.push("", "🏆 <b>Mais clicadas da semana</b>");
    top.slice(0, 5).forEach((o, i) => L.push(`${i + 1}. ${esc(cut(o.title))} — ${fmt(o.clicks)}`));
    L.push("", "🏪 <b>Cliques por loja</b> (entre as mais clicadas)");
    L.push(stores.map(([k, v]) => `${k === "outras" ? "Outras" : STORE_NAMES[k]} ${Math.round((v / storeTotal) * 100)}%`).join(" · "));
  } else {
    L.push("", "Nenhum clique em oferta registrado na semana.");
  }

  // Saude do site
  L.push("", "🩺 <b>Saúde do site</b>");
  if (hoursSince === Infinity) L.push("⚠️ Nenhuma oferta encontrada no banco.");
  else if (hoursSince > 6) L.push(`⚠️ A última oferta chegou há ${Math.round(hoursSince)}h. Confira se o disparador e o bot estão funcionando.`);
  else L.push(`✅ Recebendo ofertas normalmente (última há ${hoursSince < 1 ? "menos de 1h" : Math.round(hoursSince) + "h"}).`);
  if (Number(endedCount) > 0) L.push(`🚩 ${fmt(endedCount)} oferta(s) com aviso de "acabou" ainda no destaque — revise em <a href="${SITE}/admin">/admin</a>.`);

  // Sugestoes simples, a partir dos numeros.
  const tips = [];
  if (stores.length && stores[0][0] !== "outras" && storeTotal >= 5 && stores[0][1] / storeTotal >= 0.4)
    tips.push(`${STORE_NAMES[stores[0][0]]} trouxe ${Math.round((stores[0][1] / storeTotal) * 100)}% dos cliques: vale priorizar ofertas dela.`);
  if (p.visit >= 20 && w.visit < p.visit * 0.8) tips.push("As visitas caíram: divulgue o link do site nos canais e no Instagram esta semana.");
  if (p.visit >= 20 && w.visit > p.visit * 1.2) tips.push("As visitas subiram: mantenha o ritmo de postagens que funcionou.");
  if (w.view >= 200 && ctrPrev && ctr < ctrPrev * 0.8) tips.push("Menos gente clicando no que vê: teste mais ofertas com desconto alto e cupom.");
  if (w.coupon >= 5 && w.coupon >= w.offer * 0.15) tips.push("Os cupons estão sendo bastante copiados: poste mais ofertas com cupom.");
  if (top[0] && top[0].clicks >= 5) tips.push(`A campeã da semana (${esc(cut(top[0].title, 40))}) pode valer um repost, se ainda estiver ativa.`);
  if (!tips.length) tips.push("Semana estável. Mantenha a frequência e acompanhe a próxima.");
  L.push("", "💡 <b>Sugestões</b>", ...tips.slice(0, 3).map((t) => `• ${t}`));

  L.push("", `<a href="${SITE}/admin">Abrir o painel</a> · <a href="${SITE}">Ver o site</a>`);
  return L.join("\n");
}

async function sendWeekly({ force = false } = {}) {
  const chat = await reportChat();
  if (!chat) return { sent: false, reason: "nenhum chat escolhido no painel" };
  if (!force) {
    const [ok] = await redis([["SET", `report:weekly:${dayKey()}`, "1", "NX", "EX", String(3 * 86400)]]);
    if (ok !== "OK") return { sent: false, reason: "relatório desta semana já enviado" };
  }
  await sendMessage(chat, await buildWeekly());
  return { sent: true, chat };
}

module.exports = { buildWeekly, sendWeekly };
