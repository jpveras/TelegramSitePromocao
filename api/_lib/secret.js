// O Telegram so aceita no "secret_token" do webhook letras, numeros, _ e -
// (ate 256 caracteres). Para qualquer senha cadastrada funcionar, usamos o
// hash SHA-256 dela (64 caracteres hexadecimais) como segredo do webhook.
const crypto = require("crypto");

function webhookSecret() {
  const raw = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!raw) return null;
  return crypto.createHash("sha256").update(raw, "utf8").digest("hex");
}

module.exports = { webhookSecret };
