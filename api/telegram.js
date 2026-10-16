// Webhook do Telegram: o Telegram chama esta rota a cada mensagem nova
// (ou editada) no grupo/canal, e o anuncio e salvo no banco na hora.

const { upsertAd, rememberChat } = require("./_lib/store");
const { resolveAd, backfillStores } = require("./_lib/resolve");

const { webhookSecret } = require("./_lib/secret");
const { sendMessage } = require("./_lib/tg");
const { rememberCandidate, reportChat, sendReport } = require("./_lib/report");

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
  await rememberCandidate(chatId, name);
  const text = String(msg.text || "").trim().toLowerCase();
  const isReportChat = (await reportChat()) === chatId;

  if (isReportChat && text.startsWith("/resumo")) {
    await sendReport({ force: true });
    return;
  }
  const reply = isReportChat
    ? "✅ Você já recebe o resumo diário das Promoções do Veras, todo dia por volta das 23h.\nEnvie /resumo para receber o de hoje agora."
    : "👋 Olá! Este é o bot das <b>Promoções do Veras</b>.\n\nPara receber o resumo diário (visitas, cliques e ofertas mais clicadas), abra o painel em promocoesdoveras.com.br/admin e escolha seu nome em <b>Resumo diário no Telegram</b>.";
  await sendMessage(chatId, reply);
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
        await backfillStores({ budgetMs: 12000, max: 20 });
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
