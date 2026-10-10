require("dotenv").config();
const path = require("path");
const express = require("express");
const { listAds } = require("./db");
const { startBot, events } = require("./bot");

const PORT = process.env.PORT || 3000;
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || null;

const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

// Lista os anuncios mais recentes (carga inicial da pagina)
app.get("/api/ads", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const before = req.query.before ? Number(req.query.before) : null;
  res.json(listAds({ limit, before }));
});

// Feed ao vivo: Server-Sent Events. A pagina abre uma conexao e recebe
// cada novo anuncio assim que o bot captura, sem precisar dar refresh.
const sseClients = new Set();

app.get("/api/stream", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.write("\n");
  sseClients.add(res);

  req.on("close", () => {
    sseClients.delete(res);
  });
});

events.on("new-ad", (ad) => {
  const payload = `data: ${JSON.stringify(ad)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
});

app.listen(PORT, () => {
  console.log(`[server] Site rodando em http://localhost:${PORT}`);
});

try {
  startBot({ token: TOKEN, chatId: CHAT_ID });
} catch (err) {
  console.error(err.message);
  console.error(
    "[server] O site vai continuar no ar, mas sem captar novos anuncios ate configurar o bot."
  );
}
