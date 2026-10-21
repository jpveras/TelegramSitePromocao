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
        for (let i = 1; i < args.length; i += 2) zsets.get(args[0]).set(args[i + 1], Number(args[i]));
        return 1;
      }
      case "ZCARD": return (zsets.get(args[0]) || new Map()).size;
      case "ZRANGE": {
        if (!args.includes("BYSCORE")) {
          const rev = args.includes("REV");
          const sorted = [...(zsets.get(args[0]) || new Map())].sort((x, y) => (rev ? y[1] - x[1] : x[1] - y[1]));
          const start = Number(args[1]), stop = Number(args[2]);
          const slice = sorted.slice(start, stop === -1 ? undefined : stop + 1);
          return args.includes("WITHSCORES") ? slice.flatMap(([m, sc]) => [m, String(sc)]) : slice.map(([m]) => m);
        }
        return zrangeByScore(args[0], args.slice(1));
      }
      case "ZCOUNT": {
        const min = Number(args[1]);
        const max = args[2] === "+inf" ? Infinity : Number(args[2]);
        return [...(zsets.get(args[0]) || new Map()).values()].filter((v) => v >= min && v <= max).length;
      }
      case "INCRBY": {
        const n = Number(kv.get(args[0]) || 0) + Number(args[1]);
        kv.set(args[0], String(n));
        return n;
      }
      case "ZSCORE": {
        const z = zsets.get(args[0]);
        return z && z.has(args[1]) ? String(z.get(args[1])) : null;
      }
      case "SADD": {
        if (!hashes.has(args[0])) hashes.set(args[0], new Map());
        for (const v of args.slice(1)) hashes.get(args[0]).set(v, "1");
        return 1;
      }
      case "SREM": { const h = hashes.get(args[0]); if (h) for (const v of args.slice(1)) h.delete(v); return 1; }
      case "SMEMBERS": return [...(hashes.get(args[0]) || new Map()).keys()];
      case "MGET": return args.map((k) => (kv.has(k) ? kv.get(k) : null));
      case "EXPIRE": return 1;
      case "DEL": { for (const k of args) { zsets.delete(k); kv.delete(k); hashes.delete(k); } return 1; }
      case "SCARD": return (hashes.get(args[0]) || new Map()).size;
      case "PFADD": {
        if (!hashes.has(args[0])) hashes.set(args[0], new Map());
        for (const v of args.slice(1)) hashes.get(args[0]).set(v, "1");
        return 1;
      }
      case "PFCOUNT": return (hashes.get(args[0]) || new Map()).size;
      case "ZINCRBY": {
        if (!zsets.has(args[0])) zsets.set(args[0], new Map());
        const z = zsets.get(args[0]);
        z.set(args[2], (z.get(args[2]) || 0) + Number(args[1]));
        return String(z.get(args[2]));
      }
      case "ZUNIONSTORE": {
        const out = new Map();
        for (const k of args.slice(2, 2 + Number(args[1]))) {
          for (const [m, sc] of zsets.get(k) || new Map()) out.set(m, (out.get(m) || 0) + sc);
        }
        zsets.set(args[0], out);
        return out.size;
      }
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
  // Os dois exemplos tem data de 2025 (1760000000), fora das ultimas 24h.
  assert.strictEqual(r.data.last24h, 0);
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

  // Post de agora entra na contagem das ultimas 24h.
  r = await call(telegram, { method: "POST", headers: ok,
    body: { message: { message_id: 13, date: Math.floor(Date.now() / 1000), chat: { id: -100111 }, text: "Novo R$ 10" } } });
  r = await call(ads, { query: {} });
  assert.deepStrictEqual([r.data.total, r.data.last24h], [3, 1]);

  // Contador de visitas e cliques + painel.
  process.env.SETUP_KEY = "chave-teste";
  const track = require("../api/track");
  const stats = require("../api/stats");
  const send = (body) => call(track, { method: "POST", body: JSON.stringify(body) });
  await send({ e: "visit", v: "aaaa1111bbbb" });
  await send({ e: "visit", v: "aaaa1111bbbb" });
  await send({ e: "visit", v: "cccc2222dddd" });
  await send({ e: "offer", v: "aaaa1111bbbb", a: 1 });
  await send({ e: "offer", v: "cccc2222dddd", a: 1 });
  await send({ e: "offer", v: "cccc2222dddd", a: 2 });
  await send({ e: "coupon" });
  await send({ e: "exit_shown" });
  await send({ e: "exit_whatsapp" });
  await send({ e: "view", v: "aaaa1111bbbb", ids: [1, 2, 2] });
  await send({ e: "view", v: "cccc2222dddd", ids: [1, "x", -3] });
  r = await send({ e: "hack" }); // evento desconhecido e ignorado
  assert.strictEqual(r.status, 204);
  r = await call(stats, { query: { key: "errada" } });
  assert.strictEqual(r.status, 401);
  r = await call(stats, { query: { key: "chave-teste", days: "7" } });
  const today = r.data.perDay[0];
  assert.deepStrictEqual([today.visit, today.unique, today.offer, today.coupon, today.exit_whatsapp], [3, 2, 3, 1, 1]);
  assert.deepStrictEqual(r.data.topOffers.map((o) => [o.id, o.clicks]), [[1, 2], [2, 1]]);
  assert.strictEqual(r.data.topOffers[0].title, "Air Fryer R$ 229,90");
  assert.strictEqual(r.data.total.visit, 3);
  assert.strictEqual(today.view, 3);
  assert.deepStrictEqual(r.data.topOffers.map((o) => [o.id, o.views]), [[1, 2], [2, 1]]);
  assert.deepStrictEqual(r.data.topViewed.map((o) => [o.id, o.views, o.clicks]), [[1, 2, 2], [2, 1, 1]]);
  console.log("OK: contador de visitas/cliques e painel");

  // Mais clicadas (publico)
  const hot = require("../api/hot");
  r = await call(hot, {});
  assert.deepStrictEqual(r.data.items.map((x) => [x.id, x.clicks]), [[1, 2], [2, 1]]);
  assert.ok(r.data.items[0].ad.text.includes("Air Fryer") && !("chat_id" in r.data.items[0].ad));
  assert.deepStrictEqual(r.data.skip, [982]);
  r = await call(stats, { query: { key: "chave-teste", skip: "1" } });
  assert.deepStrictEqual(r.data.skipped.map((x) => x.id).sort(), [1, 982]);
  r = await call(hot, {});
  assert.deepStrictEqual(r.data.items.map((x) => x.id), [2]);
  r = await call(stats, { query: { key: "chave-teste", unskip: "1" } });
  assert.deepStrictEqual(r.data.skipped.map((x) => x.id), [982]);
  console.log("OK: mais clicadas");

  // Resumo diario: cadastro pelo /start no privado, escolha no painel e texto.
  r = await call(telegram, { method: "POST", headers: ok,
    body: { message: { message_id: 1, date: 1, chat: { id: 555, type: "private", first_name: "Joao", username: "jpveras" }, text: "/start" } } });
  assert.strictEqual(r.data.private, true);
  const report = require("../api/report");
  r = await call(report, {});
  assert.strictEqual(r.status, 401);
  r = await call(report, { query: { key: "chave-teste", action: "status" } });
  assert.deepStrictEqual(r.data.candidates, [{ id: "555", name: "Joao (@jpveras)" }]);
  r = await call(report, { query: { key: "chave-teste", action: "set", chat: "999" } });
  assert.strictEqual(r.status, 400);
  r = await call(report, { query: { key: "chave-teste", action: "set", chat: "555" } });
  assert.strictEqual(r.data.chat, "555");
  r = await call(report, { query: { key: "chave-teste", action: "preview" } });
  assert.ok(r.data.text.includes("Promoções do Veras") && r.data.text.includes("cliques em ofertas") && r.data.text.includes("Air Fryer"));
  if (process.env.SHOW_REPORT) console.log(r.data.text);
  console.log("OK: resumo diario");

  // Loja: o anuncio 1 tem link amzn.to -> amazon, sem precisar abrir o link.
  r = await call(ads, { query: { limit: "10" } });
  assert.strictEqual(r.data.ads.find((a) => a.id === 1).store, "amazon");
  assert.strictEqual(r.data.ads.find((a) => a.id === 2).store, "outros");

  // Link encurtado: segue redirecionamento e tambem pagina intermediaria.
  const { resolveStoreFromUrl } = require("../api/_lib/resolve");
  const shortener = http.createServer((req, res) => {
    if (req.url === "/a") { res.writeHead(302, { Location: "/b" }); return res.end(); }
    if (req.url === "/b") { res.writeHead(301, { Location: "https://www.mercadolivre.com.br/p/MLB1" }); return res.end(); }
    if (req.url === "/page") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end('<a href="https://s.shopee.com.br/abc">Comprar</a>'); }
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => shortener.listen(0, "127.0.0.1", ok));
  const base = `http://127.0.0.1:${shortener.address().port}`;
  assert.strictEqual((await resolveStoreFromUrl(`${base}/a`)).store, "mercadolivre");
  assert.strictEqual((await resolveStoreFromUrl(`${base}/page`)).store, "shopee");
  assert.strictEqual((await resolveStoreFromUrl(`${base}/404`)).store, null);
  shortener.close();
  console.log("OK: loja identificada pelo link");

  // Pagina da oferta (previa do WhatsApp).
  const oferta = require("../api/oferta");
  r = await call(oferta, { query: { id: "1" }, headers: { host: "promocoesdoveras.com.br" } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.includes('og:image" content="https://promocoesdoveras.com.br/api/photo?ad=1&amp;v=2"'));
  assert.ok(r.data.includes("Air Fryer R$ 229,90") && r.data.includes("Amazon"));
  const ld = JSON.parse(r.data.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.strictEqual(ld["@type"], "Product");
  assert.deepStrictEqual([ld.offers.price, ld.offers.priceCurrency, ld.offers.seller.name], ["229.90", "BRL", "Amazon"]);
  r = await call(oferta, { query: { id: "999" }, headers: { host: "x.com" } });
  assert.strictEqual(r.status, 404);
  console.log("OK: pagina da oferta");

  // Historico de preco: mesmo produto anunciado de novo mais barato.
  const mk = (mid, price) => ({ channel_post: { message_id: mid, date: Math.floor(Date.now() / 1000), chat: { id: -100111 },
    text: `🔥 Fone Bluetooth XYZ Pro Max\nDe R$ 300,00\n💰 R$ ${price} no Pix\nhttps://amzn.to/abc${mid}` } });
  r = await call(telegram, { method: "POST", headers: ok, body: mk(201, "150,00") });
  const idA = r.data.id;
  r = await call(telegram, { method: "POST", headers: ok, body: mk(202, "120,00") });
  const idB = r.data.id;
  r = await call(ads, { query: { limit: "20" } });
  const adB = r.data.ads.find((a) => a.id === idB);
  assert.ok(adB.ph && adB.ph.prev === 150 && adB.ph.min === 150 && adB.ph.count === 1, JSON.stringify(adB.ph));
  assert.strictEqual(r.data.ads.find((a) => a.id === idA).ph, null);
  console.log("OK: historico de preco");

  // Alertas: comando no privado e combinacao com o nome do produto.
  const al = require("../api/_lib/alerts");
  r = await call(telegram, { method: "POST", headers: ok,
    body: { message: { message_id: 3, date: 1, chat: { id: 777, type: "private", first_name: "Ana" }, text: "/alerta Fone Bluetooth" } } });
  assert.deepStrictEqual(await al.listAlerts("777"), ["fone bluetooth"]);
  const payload = "a_" + Buffer.from("air fryer").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  assert.strictEqual(al.decodeStartPayload(payload), "air fryer");
  assert.ok(al.matches("fone bluetooth", "fone bluetooth xyz pro max"));
  assert.ok(al.matches("fone", "fones de ouvido"));
  assert.ok(!al.matches("rtx", "fone bluetooth xyz"));
  await al.removeAlert("777", "fone bluetooth");
  assert.deepStrictEqual(await al.listAlerts("777"), []);
  console.log("OK: alertas");

  // "Acabou": 3 visitantes diferentes -> sai do destaque e ganha o aviso.
  for (const v of ["vvvv1111aaaa", "vvvv2222bbbb", "vvvv2222bbbb", "vvvv3333cccc"]) await send({ e: "ended", v, a: idB });
  r = await call(ads, { query: { limit: "20" } });
  assert.strictEqual(r.data.ads.find((a) => a.id === idB).ended, true);
  r = await call(stats, { query: { key: "chave-teste" } });
  assert.deepStrictEqual(r.data.ended.map((o) => [o.id, o.reports, o.skipped]), [[idB, 3, true]]);
  console.log("OK: avisos de oferta encerrada");

  // Paginas para o Google
  r = await call(oferta, { query: { loja: "amazon" }, headers: { host: "promocoesdoveras.com.br" } });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.includes("Promoções e cupons da Amazon hoje") && r.data.includes(`/oferta/${idB}`));
  r = await call(oferta, { query: { loja: "xpto" }, headers: { host: "x" } });
  assert.strictEqual(r.status, 404);
  r = await call(oferta, { query: { sitemap: "1" }, headers: { host: "promocoesdoveras.com.br" } });
  assert.ok(r.data.includes("<urlset") && r.data.includes("/loja/shopee") && r.data.includes(`/oferta/${idB}`));
  r = await call(oferta, { query: { id: String(idB) }, headers: { host: "promocoesdoveras.com.br" } });
  assert.ok(r.data.includes("Menor preço já visto aqui"));
  console.log("OK: paginas de loja, sitemap e historico na pagina da oferta");

  server.close();
  console.log("OK: webhook, edicao, filtro de chat, listagem, paginacao e feed ao vivo");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
