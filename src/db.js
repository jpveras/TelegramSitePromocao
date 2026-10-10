const fs = require("fs");
const path = require("path");

// Banco simples em arquivo JSON. Sem dependencias nativas (nada de
// compilar C++/node-gyp), roda igual em qualquer SO sem instalar Python
// ou build tools - so precisa do Node.
const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "ads.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ nextId: 1, ads: [] }, null, 2));
}

function readData() {
  const raw = fs.readFileSync(dbPath, "utf-8");
  return JSON.parse(raw);
}

function writeData(data) {
  // Escreve em arquivo temporario e renomeia, pra nunca deixar o ads.json
  // corrompido se o processo for interrompido no meio da escrita.
  const tmpPath = dbPath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, dbPath);
}

function insertAd(ad) {
  const data = readData();
  const record = {
    id: data.nextId,
    telegram_message_id: ad.telegram_message_id ?? null,
    chat_id: ad.chat_id,
    text: ad.text ?? null,
    photo_file_id: ad.photo_file_id ?? null,
    photo_url: ad.photo_url ?? null,
    posted_at: ad.posted_at,
    received_at: new Date().toISOString(),
  };
  data.ads.push(record);
  data.nextId += 1;
  writeData(data);
  return record;
}

function getAdById(id) {
  const data = readData();
  return data.ads.find((a) => a.id === id) || null;
}

function listAds({ limit = 50, before = null } = {}) {
  const data = readData();
  // Mais recente primeiro (maior id primeiro), igual a ORDER BY id DESC
  let ads = [...data.ads].sort((a, b) => b.id - a.id);
  if (before !== null) {
    ads = ads.filter((a) => a.id < before);
  }
  return ads.slice(0, limit);
}

module.exports = { insertAd, listAds, getAdById };
