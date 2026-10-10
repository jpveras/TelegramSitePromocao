// Teste rapido, sem internet: sobe um Redis falso (imitando a API REST do
// Upstash) e passa mensagens de exemplo pelo webhook e pela listagem.
// Rode com: npm test

const http = require("http");
const assert = require("assert");

function fakeRedisServer() {
  const kv = new Map();
  const zsets = new Map();
  const hashes = new Map();

  function zrangeByScore(key, args) {
    const rev = args.includes("REV");
    const li = args.indexOf("LIMIT");
    const offset = li >= 0 ? Number(args[li + 1]) : 0;
    const count = li >= 0 ? Number(args[li + 2]) : Infinity;
    const parse = (v) => {
      if (v === "+inf") return { n: Infinity, ex: false };
      if (v === "-inf") return { n: -Infinity, ex: false };
      return v.startsWith("(") ? { n: Number(v.slice(1)), ex: true } : { n: Number(v), ex: false };
    };
    // Com REV, os limites vem como (max, min).
    const [a, b] = rev ? [parse(args[1]), parse(args[0])] : [parse(args[0]), parse(args[1])];
    const min = a, max = b;
    const items = [...(zsets.get(key) || new Map())]
      .filter(([, s]) => (min.ex ? s > min.n : s >= min.n) && (max.ex ? s < max.n : s <= max.n))
      .sort((x, y) => (rev ? y[1] - x[1] : x[1] - y[1]))
      .map(([m]) => m);
    return items.slice(offset, offset + count);
  }

  function run([cmd, ...args]) {
    switch (cmd) {
      case "GET": return kv.has(args[0]) ? kv.get(args[0]) : null;
      case "SET":
        if (args.includes("NX") && kv.has(args[0])) return null;
        kv.set(args[0], args[1]);
        return "OK";
      case "INCR": {
        const n = Number(kv.get(args[0]) || 0) + 1;
        kv.set(args[0], String(n));
        return n;
      }
      case "ZADD": {
        if (!zsets.has(args[0])) zsets.set(args[0], new Map());
        zsets.get(args[0]).set(args[2], Number(args[1]));
        return 1;
      }
      case "ZCARD": return (zsets.get(args[0]) || new Map()).size;
      case "ZRANGE": return zrangeByScore(args[0], args.slice(1));
      case "MGET": return args.map((k) => (kv.has(k) ? kv.get(k) : null));
      case "HSET": {
        if (!hashes.has(args[0])) hashes.set(args[0], new Map());
        hashes.get(args[0]).set(args[1], args[2]);
        return 1;
      }
      case "HGETALL": return [...(hashes.get(args[0]) || new Map())].flat();
      default: return { error: `comando nao suportado no teste: ${cmd}` };
    }
  }

  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      assert.strictEqual(req.headers.authorization, "Bearer token-teste");
      const results = JSON.parse(body).map((c) => {
        const r = run(c);
        return r && r.error ? r : { result: r };
      });
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(results));
    });
  });
}

function call(handler, { method = "GET", query = {}, headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, data }); },
      send(data) { resolve({ status: this.statusCode, data }); },
      end() { resolve({ status: this.statusCode, data: null }); },
    };
    Promise.resolve(handler({ method, query, headers, body }, res)).catch(reject);
  });
}

(async () => {
  const server = fakeRedisServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();

  process.env.KV_REST_API_URL = `http://127.0.0.1:${port}`;
  process.env.KV_REST_API_TOKEN = "token-teste";
  process.env.TELEGRAM_WEBHOOK_SECRET = "segredo-teste";
  process.env.TELEGRAM_CHAT_ID = "-100111";

  const telegram = require("../api/telegram");
  const ads = require("../api/ads");
  // O Telegram envia o hash SHA-256 da senha (ver api/_lib/secret.js).
  const hashed = require("crypto").createHash("sha256").update("segredo-teste").digest("hex");
  const ok = { "x-telegram-bot-api-secret-token": hashed };

  // Sem o segredo: recusado.
  let r = await call(telegram, { method: "POST", body: {}, headers: {} });
  assert.strictEqual(r.status, 401);

  // Post de canal com foto e legenda.
  r = await call(telegram, {
    method: "POST", headers: ok,
    body: { channel_post: { message_id: 10, date: 1760000000, chat: { id: -100111, title: "Promo" },
      caption: "Air Fryer R$ 399,90 R$ 249,90 https://amzn.to/x", photo: [{ file_id: "p" }, { file_id: "P" }] } },
  });
  assert.deepStrictEqual([r.status, r.data.id], [200, 1]);

  // Mensagem de grupo (string JSON, como pode chegar) so com texto.
  r = await call(telegram, {
    method: "POST", headers: ok,
    body: JSON.stringify({ message: { message_id: 11, date: 1760000100, chat: { id: -100111 }, text: "Fone R$ 59" } }),
  });
  assert.strictEqual(r.data.id, 2);

  // Edicao da primeira mensagem: atualiza, nao duplica.
  r = await call(telegram, {
    method: "POST", headers: ok,
    body: { edited_channel_post: { message_id: 10, date: 1760000000, chat: { id: -100111 },
      caption: "Air Fryer R$ 229,90", photo: [{ file_id: "P2" }] } },
  });
  assert.strictEqual(r.data.id, 1);

  // Outro chat: ignorado. Sticker: ignorado.
  r = await call(telegram, { method: "POST", headers: ok,
    body: { message: { message_id: 1, date: 1, chat: { id: -999 }, text: "x" } } });
  assert.strictEqual(r.data.ignored, "outro chat");
  r = await call(telegram, { method: "POST", headers: ok,
    body: { message: { message_id: 12, date: 1, chat: { id: -100111 }, sticker: {} } } });
  assert.strictEqual(r.data.ignored, "sem conteudo");

  // Listagem: mais recente primeiro, sem dados internos do Telegram.
  r = await call(ads, { query: { limit: "10" } });
  assert.strictEqual(r.data.total, 2);
  assert.deepStrictEqual(r.data.ads.map((a) => a.id), [2, 1]);
  assert.strictEqual(r.data.ads[1].text, "Air Fryer R$ 229,90");
  assert.strictEqual(r.data.ads[1].photo_url, "/api/photo?ad=1&v=2");
  assert.ok(!("photo_file_id" in r.data.ads[1]) && !("chat_id" in r.data.ads[1]));

  // Paginacao e feed ao vivo.
  r = await call(ads, { query: { before: "2" } });
  assert.deepStrictEqual(r.data.ads.map((a) => a.id), [1]);
  r = await call(ads, { query: { after: "1" } });
  assert.deepStrictEqual(r.data.ads.map((a) => a.id), [2]);
  r = await call(ads, { query: { after: "2" } });
  assert.deepStrictEqual(r.data.ads, []);

  server.close();
  console.log("OK: webhook, edicao, filtro de chat, listagem, paginacao e feed ao vivo");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
