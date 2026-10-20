// Webhook do Telegram: o Telegram chama esta rota a cada mensagem nova
// (ou editada) no grupo/canal, e o anuncio e salvo no banco na hora.

const { upsertAd, rememberChat } = require("./_lib/store");
const { resolveAd, backfillStores } = require("./_lib/resolve");

const { webhookSecret } = require("./_lib/secret");
const { sendMessage } = require("./_lib/tg");
const { rememberCandidate, reportChat, sendReport } = require("./_lib/report");
const { addAlert, listAlerts, removeAlert, stopAlerts, notifyMatches, decodeStartPayload } = require("./_lib/alerts");
const { catchUpPrices } = require("./_lib/history");

const HELP_ALERTAS =
  "🔔 <b>Alertas de produto</b>\n" +
  "Eu te aviso aqui assim que sair uma oferta com a palavra que você escolher.\n\n" +
  "• <code>/alerta rtx 5060</code> → cria um alerta\n" +
  "• <code>/alertas</code> → mostra seus alertas\n" +
  "• <code>/remover rtx 5060</code> → apaga um alerta\n" +
  "• <code>/parar</code> → apaga todos\n\n" +
  "Dica: use 1 ou 2 palavras (ex.: <code>air fryer</code>, <code>iphone</code>, <code>whey</code>).";

const listar = (list) => (list.length ? list.map((k) => `• ${k}`).join("\n") : "(nenhum)");

const WEBHOOK_SECRET = webhookSecret();
// Um ou mais chats separados por virgula (ex.: o canal e o grupo).
const CHAT_IDS = (process.env.TELEGRAM_CHAT_ID || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return null;
}

async function handlePrivate(msg) {
  const chatId = String(msg.chat.id);
  const who = [msg.chat.first_name, msg.chat.last_name].filter(Boolean).join(" ") || "Sem nome";
  const name = msg.chat.username ? `${who} (@${msg.chat.username})` : who;
  const raw = String(msg.text || "").trim();
  const text = raw.toLowerCase();
  const arg = raw.replace(/^\/\S+\s*/, "").trim();
  const reply = (t) => sendMessage(chatId, t);

  // Link do site: t.me/PromocoesVerasBot?start=a_<palavra>
  if (text.startsWith("/start a_")) {
    const kw = decodeStartPayload(raw.split(/\s+/)[1]);
    const r = kw ? await addAlert(chatId, kw) : { ok: false };
    if (r.ok) return reply(`✅ Alerta criado: <b>${r.keyword}</b>\nAssim que sair uma oferta com isso, eu te mando aqui. 🔔\n\nSeus alertas:\n${listar(await listAlerts(chatId))}\n\n/ajuda para ver os comandos.`);
    return reply(r.reason === "limite" ? "Você já tem 10 alertas. Apague algum com /remover antes de criar outro." : HELP_ALERTAS);
  }
  if (text.startsWith("/alerta") && !text.startsWith("/alertas")) {
    if (!arg) return reply(HELP_ALERTAS);
    const r = await addAlert(chatId, arg);
    if (r.ok) return reply(`✅ Alerta criado: <b>${r.keyword}</b>\n\nSeus alertas:\n${listar(await listAlerts(chatId))}`);
    return reply(r.reason === "limite" ? "Você já tem 10 alertas. Apague algum com /remover antes de criar outro." : "Escreva a palavra depois do comando. Ex.: <code>/alerta air fryer</code>");
  }
  if (text.startsWith("/alertas")) return reply(`🔔 Seus alertas:\n${listar(await listAlerts(chatId))}\n\nPara criar: <code>/alerta palavra</code>`);
  if (text.startsWith("/remover")) {
    if (!arg) return reply("Diga qual alerta apagar. Ex.: <code>/remover air fryer</code>");
    return reply(`🗑️ Pronto. Seus alertas agora:\n${listar(await removeAlert(chatId, arg))}`);
  }
  if (text.startsWith("/parar")) {
    await stopAlerts(chatId);
    return reply("🔕 Todos os seus alertas foram apagados. Quando quiser, é só mandar <code>/alerta palavra</code>.");
  }
  if (text.startsWith("/ajuda") || text.startsWith("/help")) return reply(HELP_ALERTAS);

  // Resumo diario (dono do site)
  const isReportChat = (await reportChat()) === chatId;
  if (isReportChat && text.startsWith("/resumo")) {
    await sendReport({ force: true });
    return;
  }
  if (text === "/start" || text.startsWith("/start ")) await rememberCandidate(chatId, name);
  const intro = isReportChat
    ? "✅ Você recebe o resumo diário das Promoções do Veras, todo dia por volta das 23h. Envie /resumo para receber o de hoje agora.\n\n"
    : "👋 Olá! Este é o bot das <b>Promoções do Veras</b>.\n\n";
  await reply(intro + HELP_ALERTAS);
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }

  // So aceita chamadas que trazem o segredo combinado com o Telegram.
  if (!WEBHOOK_SECRET || req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    res.status(401).json({ error: "Nao autorizado" });
    return;
  }

  const update = readBody(req);
  // Grupos chegam como "message"; canais como "channel_post". Edicoes tambem.
  const msg =
    update &&
    (update.message ||
      update.channel_post ||
      update.edited_message ||
      update.edited_channel_post);

  if (!msg || !msg.chat) {
    res.status(200).json({ ok: true, ignored: "sem mensagem" });
    return;
  }

  const incomingChatId = String(msg.chat.id);
  // Fica nos logs da Vercel: e assim que voce descobre o TELEGRAM_CHAT_ID.
  const chatName = msg.chat.title || msg.chat.username || msg.chat.type;
  console.log(`[telegram] Mensagem de chat_id=${incomingChatId} (${chatName})`);
  // Guarda os chats vistos para a pagina /api/setup mostrar qual e o id certo.
  await rememberChat(incomingChatId, chatName).catch(() => {});

  // Conversa no privado com o bot: cadastro para o resumo diario.
  if (msg.chat.type === "private" && !update.edited_message) {
    try {
      await handlePrivate(msg);
    } catch (err) {
      console.error("[telegram] Falha no privado:", err.message);
    }
    res.status(200).json({ ok: true, private: true });
    return;
  }

  if (CHAT_IDS.length > 0 && !CHAT_IDS.includes(incomingChatId)) {
    res.status(200).json({ ok: true, ignored: "outro chat" });
    return;
  }

  const text = msg.text || msg.caption || null;
  // Telegram manda varias resolucoes da foto; guarda a maior.
  const photoFileId =
    msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1].file_id : null;

  if (!text && !photoFileId) {
    res.status(200).json({ ok: true, ignored: "sem conteudo" });
    return;
  }

  try {
    const { ad, created } = await upsertAd({
      telegram_message_id: msg.message_id,
      chat_id: incomingChatId,
      text,
      photo_file_id: photoFileId,
      posted_at: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
    });
    console.log(`[telegram] Anuncio ${created ? "salvo" : "atualizado"} (id=${ad.id})`);
    // Descobre a loja pelo link (e aproveita para identificar alguns
    // anuncios antigos). Falhas aqui nunca impedem o anuncio de ser salvo.
    if (created || !ad.store_checked_at) {
      try {
        await resolveAd(ad);
        if (created) await notifyMatches(ad).catch((e) => console.error("[telegram] Falha nos alertas:", e.message));
        await catchUpPrices({ max: 60, budgetMs: 5000 }).catch((e) => console.error("[telegram] Falha no historico:", e.message));
        await backfillStores({ budgetMs: 10000, max: 15 });
      } catch (err) {
        console.error("[telegram] Falha ao identificar loja:", err.message);
      }
    }
    res.status(200).json({ ok: true, id: ad.id });
  } catch (err) {
    console.error("[telegram] Falha ao salvar anuncio:", err.message);
    // 500 faz o Telegram tentar entregar de novo mais tarde, sem perder o anuncio.
    res.status(500).json({ ok: false });
  }
};
