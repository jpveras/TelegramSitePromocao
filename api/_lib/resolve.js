// Descobre a loja de cada oferta. O DisparaPromo usa links encurtados
// (oferta.pravce.com.br/XXXX) e o texto quase nunca diz a loja; entao o
// servidor abre o link uma vez, segue os redirecionamentos e reconhece a
// loja pelo endereco de destino (ou pelos links da pagina, se for uma
// pagina intermediaria). O resultado fica salvo no proprio anuncio.

const { redis, getAd, saveAdFields } = require("./store");

// Chaves iguais as do site (public/index.html, lista STORES).
const STORE_HOSTS = [
  ["amazon", /(^|\.)amazon\.com(\.br)?$|(^|\.)amzn\.(to|com)$|(^|\.)a\.co$/],
  ["mercadolivre", /(^|\.)mercadoli(vre|bre)\.com(\.br)?$|(^|\.)meli\.la$|(^|\.)mercadolivre\.com$/],
  ["shopee", /(^|\.)shopee\.com(\.br)?$|(^|\.)shp\.ee$/],
  ["shein", /(^|\.)shein\.com(\.br)?$/],
  ["magalu", /(^|\.)magazineluiza\.com\.br$|(^|\.)magalu\.com(\.br)?$|(^|\.)magazinevoce\.com\.br$/],
  ["aliexpress", /(^|\.)aliexpress\.(com|us)$/],
  ["kabum", /(^|\.)kabum\.com\.br$/],
  ["americanas", /(^|\.)americanas\.com\.br$/],
  ["casasbahia", /(^|\.)casasbahia\.com\.br$/],
  ["netshoes", /(^|\.)netshoes\.com\.br$/],
  ["carrefour", /(^|\.)carrefour\.com\.br$/],
  ["temu", /(^|\.)temu\.com$/],
];

function storeFromHost(host) {
  if (!host) return null;
  const h = host.toLowerCase().replace(/^www\./, "");
  for (const [key, re] of STORE_HOSTS) if (re.test(h)) return key;
  return null;
}

// Procura enderecos de lojas dentro de uma pagina (meta refresh, botoes, JS).
function storeFromHtml(html) {
  const re = /https?:(?:\/\/|\\\/\\\/)([a-z0-9.-]+\.[a-z]{2,})/gi;
  const counts = {};
  let m;
  while ((m = re.exec(html))) {
    const key = storeFromHost(m[1]);
    if (key) counts[key] = (counts[key] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

function extractUrl(text) {
  const m = (text || "").match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

const UA =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

async function fetchStep(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "text/html,*/*" },
    });
  } finally {
    clearTimeout(t);
  }
}

// Segue ate 6 redirecionamentos. Devolve { store, host }.
async function resolveStoreFromUrl(startUrl, { timeoutMs = 3000, totalMs = 6000 } = {}) {
  const deadline = Date.now() + totalMs;
  let url = startUrl;
  let host = null;
  for (let hop = 0; hop < 6 && url && Date.now() < deadline; hop++) {
    let u;
    try { u = new URL(url); } catch { break; }
    host = u.hostname;
    const direct = storeFromHost(host);
    if (direct) return { store: direct, host };
    let res;
    try { res = await fetchStep(url, Math.min(timeoutMs, deadline - Date.now())); } catch { break; }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, url).toString();
      continue;
    }
    if (res.ok && /html|text/i.test(res.headers.get("content-type") || "")) {
      const html = (await res.text()).slice(0, 300000);
      const store = storeFromHtml(html);
      if (store) return { store, host };
      // Redirecionamento por meta refresh / window.location para outro site.
      const next =
        html.match(/http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i) ||
        html.match(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)["']/i);
      if (next) { url = new URL(next[1].replace(/&amp;/g, "&"), url).toString(); continue; }
    }
    break;
  }
  return { store: null, host };
}

// Identifica e salva a loja de um anuncio. "outros" = verificado, sem loja.
async function resolveAd(ad) {
  const url = extractUrl(ad.text);
  if (!url) {
    await saveAdFields(ad.id, { store: "outros", store_checked_at: new Date().toISOString() });
    return "outros";
  }
  const { store, host } = await resolveStoreFromUrl(url);
  await saveAdFields(ad.id, {
    store: store || "outros",
    store_host: host || null,
    store_checked_at: new Date().toISOString(),
  });
  return store || "outros";
}

// Processa anuncios antigos aos poucos, do mais novo para o mais antigo,
// usando um cursor no Redis. Para quando acabar o tempo combinado.
async function backfillStores({ budgetMs = 5000, max = 10 } = {}) {
  const started = Date.now();
  const [cursorRaw, nextId] = await redis([["GET", "stores:cursor"], ["GET", "ads:next_id"]]);
  let cursor = cursorRaw === null ? Number(nextId) || 0 : Number(cursorRaw);
  let done = 0;
  const results = [];
  while (cursor > 0 && done < max && Date.now() - started < budgetMs) {
    const ad = await getAd(cursor);
    if (ad && !ad.store_checked_at) {
      results.push([ad.id, await resolveAd(ad)]);
      done++;
    }
    cursor--;
    await redis([["SET", "stores:cursor", String(cursor)]]);
  }
  return { cursor, processed: results };
}

module.exports = { resolveAd, backfillStores, storeFromHost, storeFromHtml, resolveStoreFromUrl };
