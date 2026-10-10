const TelegramBot = require("node-telegram-bot-api");
const { EventEmitter } = require("events");
const { insertAd } = require("./db");

const events = new EventEmitter();

function startBot({ token, chatId }) {
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN nao configurado. Copie .env.example para .env e preencha."
    );
  }

  // Polling: nao precisa de dominio/HTTPS publico, ideal pra rodar em qualquer servidor.
  const bot = new TelegramBot(token, { polling: true });

  console.log("[bot] Conectado ao Telegram, aguardando mensagens...");
  if (!chatId) {
    console.log(
      "[bot] TELEGRAM_CHAT_ID ainda nao definido. Poste algo no grupo/canal " +
        "do DisparaPromo agora: o chat_id vai aparecer aqui no console."
    );
  }

  // Grupos/supergrupos normais chegam como "message". Canais chegam como "channel_post".
  const handleIncoming = async (msg) => {
    const incomingChatId = String(msg.chat.id);

    // Sempre loga o chat_id recebido, pra facilitar configurar o .env na primeira vez.
    console.log(
      `[bot] Mensagem recebida de chat_id=${incomingChatId} (${msg.chat.title || msg.chat.type})`
    );

    if (chatId && incomingChatId !== String(chatId)) {
      return; // ignora mensagens de outros chats, caso o bot esteja em varios grupos
    }

    const text = msg.text || msg.caption || null;
    let photoFileId = null;
    let photoUrl = null;

    if (msg.photo && msg.photo.length > 0) {
      // Telegram manda varias resolucoes; pega a maior.
      const largest = msg.photo[msg.photo.length - 1];
      photoFileId = largest.file_id;
      try {
        photoUrl = await bot.getFileLink(largest.file_id);
      } catch (err) {
        console.error("[bot] Falha ao gerar link da foto:", err.message);
      }
    }

    if (!text && !photoUrl) {
      return; // mensagem sem conteudo util (sticker, etc.) - ignora
    }

    const ad = insertAd({
      telegram_message_id: msg.message_id,
      chat_id: incomingChatId,
      text,
      photo_file_id: photoFileId,
      photo_url: photoUrl,
      posted_at: new Date((msg.date || Date.now() / 1000) * 1000).toISOString(),
    });

    console.log(`[bot] Novo anuncio salvo (id=${ad.id})`);
    events.emit("new-ad", ad);
  };

  bot.on("message", handleIncoming);
  bot.on("channel_post", handleIncoming);

  bot.on("polling_error", (err) => {
    console.error("[bot] Erro de polling:", err.message);
  });

  return bot;
}

module.exports = { startBot, events };
