// Pagina propria de cada oferta: /oferta/123 (reescrita para /api/oferta?id=123).
// Serve para compartilhar: no WhatsApp o link aparece com a foto, o nome e o
// preco do produto. Quem abre ve a oferta e vai para a loja com um toque.

const { isConfigured, getAd, listAds } = require("./_lib/store");
const { describe } = require("./_lib/parse");

const STORES = {
  amazon: "Amazon", mercadolivre: "Mercado Livre", shopee: "Shopee", shein: "Shein",
  magalu: "Magalu", aliexpress: "AliExpress", kabum: "Kabum", americanas: "Americanas",
  casasbahia: "Casas Bahia", netshoes: "Netshoes", carrefour: "Carrefour", temu: "Temu",
};
const WHATSAPP = "https://whatsapp.com/channel/0029VbBX1t66buMHs99zHP2c";

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function themeScript() {
  return `<script>(function(){var t=null;try{t=localStorage.getItem("pv_theme")}catch(e){}if(t!=="light"&&t!=="dark"){t=window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute("data-theme",t)})();</script>`;
}

const CSS = `
:root{--bg:#0b0d12;--card:#15171c;--line:#23262e;--text:#eef0f3;--muted:#8b93a1;--accent:#ff7a1a;--green:#3fc96b;--soft:#1b1d23;--coupon-bg:#1d1712;--coupon-line:#3a2a1c;color-scheme:dark}
:root[data-theme="light"]{--bg:#f4f5f8;--card:#fff;--line:#e4e7ec;--text:#15181f;--muted:#5b6372;--accent:#f06a0a;--green:#1e9e4f;--soft:#f1f2f5;--coupon-bg:#fff4ec;--coupon-line:#f7cfae;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-font-smoothing:antialiased}
header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--line)}
header a{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;color:var(--text);text-decoration:none}
header img{width:28px;height:28px;border-radius:50%}
header .all{font-size:13.5px;color:var(--accent);font-weight:800}
main{max-width:520px;margin:0 auto;padding:18px 16px 60px}
.card{background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden}
.thumb{position:relative;background:linear-gradient(180deg,#fff,#eceef1);aspect-ratio:1/1;display:flex;align-items:center;justify-content:center}
.thumb img{width:100%;height:100%;object-fit:contain}
.thumb .ph{font-size:64px}
.store{position:absolute;top:12px;left:12px;background:rgba(40,42,48,.85);color:#fff;font-size:12.5px;font-weight:800;padding:5px 11px;border-radius:999px}
.body{padding:18px}
h1{font-size:19px;line-height:1.35;margin:0 0 12px}
.old{color:var(--muted);text-decoration:line-through;font-size:14px}
.off{background:rgba(63,201,107,.14);color:var(--green);font-weight:800;font-size:12.5px;padding:2px 7px;border-radius:6px;margin-left:6px}
.now{font-size:32px;font-weight:900;color:var(--text);margin:2px 0 8px}
.pay{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.pay span{font-size:12.5px;font-weight:700;padding:4px 9px;border-radius:8px;background:var(--soft);color:var(--text)}
.rating{font-size:13.5px;color:var(--muted);margin-bottom:14px}
.coupon{display:flex;align-items:center;gap:8px;width:100%;padding:12px 14px;border-radius:12px;border:1px dashed var(--accent);background:var(--coupon-bg);color:var(--accent);font:inherit;font-weight:800;font-size:14.5px;cursor:pointer;margin-bottom:10px}
.coupon{text-align:left}.coupon .code{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.coupon .hint{margin-left:auto;font-size:12px;color:var(--muted);font-weight:700;white-space:nowrap}
.coupon.ok{border-color:var(--green);color:var(--green)}
.go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:16px;border-radius:14px;background:var(--accent);color:#fff;font-weight:900;font-size:16px;letter-spacing:.04em;text-transform:uppercase;text-decoration:none;box-shadow:0 10px 24px rgba(255,122,26,.3)}
.row{display:flex;gap:10px;margin-top:10px}
.row a,.row button{flex:1;display:flex;align-items:center;justify-content:center;gap:6px;padding:12px;border-radius:12px;border:1px solid var(--line);background:var(--soft);color:var(--text);font:inherit;font-weight:700;font-size:14px;text-decoration:none;cursor:pointer}
.note{font-size:12.5px;color:var(--muted);text-align:center;margin-top:14px;line-height:1.5}
.wa{margin-top:18px;display:flex;align-items:center;justify-content:center;gap:8px;padding:14px;border-radius:14px;background:#25d366;color:#062b15;font-weight:900;text-decoration:none}
.lt{display:block;text-align:center;margin-top:12px;font-size:14px;font-weight:800;color:var(--accent);text-decoration:none}
.ph-badge{display:inline-block;font-size:13px;font-weight:800;padding:6px 10px;border-radius:9px;margin:0 0 10px;background:rgba(63,201,107,.14);color:var(--green)}
.ph-badge.down{background:rgba(255,122,26,.12);color:var(--accent)}
.flag{display:block;margin:12px auto 0;background:none;border:none;color:var(--muted);font:inherit;font-size:12.5px;cursor:pointer;text-decoration:underline}
.flag:disabled{text-decoration:none;cursor:default;color:var(--green)}
.stale{background:rgba(245,197,24,.14);color:#c99a00;font-size:12.5px;font-weight:700;padding:8px 10px;border-radius:10px;margin-bottom:12px}
`;

const BRL = (n) => "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DM = (iso) => { const t = new Date(iso); return isNaN(t) ? "" : t.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }); };
function historyBadge(ad, d) {
  const ph = ad.ph; const { parseBRL } = require("./_lib/parse");
  const now = parseBRL(d.now);
  if (!ph || !now) return "";
  if (now < ph.min) return `<div class="ph-badge">📉 Menor preço já visto aqui (antes: ${BRL(ph.min)} em ${DM(ph.minAt)})</div>`;
  if (ph.prev && now < ph.prev - 0.5) return `<div class="ph-badge down">↓ ${BRL(ph.prev - now)} mais barato que em ${DM(ph.prevAt)}</div>`;
  return "";
}

// Dados estruturados (schema.org) para o Google mostrar preco e loja na busca.
function productJsonLd(ad, d, { origin, image, storeLabel }) {
  const { parseBRL } = require("./_lib/parse");
  const price = parseBRL(d.now);
  const data = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: d.name,
    image: [image],
    description: `${d.name}${d.coupon ? " · Cupom " + d.coupon : ""} · oferta divulgada no Promoções do Veras`,
    url: `${origin}/oferta/${ad.id}`,
  };
    if (price) {
    const posted = Date.parse(ad.posted_at || "") || Date.now();
    data.offers = {
      "@type": "Offer",
      url: `${origin}/oferta/${ad.id}`,
      priceCurrency: "BRL",
      price: price.toFixed(2),
      priceValidUntil: new Date(posted + 7 * 86400000).toISOString().slice(0, 10),
      availability: ad.ended_reported ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      ...(storeLabel ? { seller: { "@type": "Organization", name: storeLabel } } : {}),
    };
  }
  return data;
}

function page({ title, desc, image, url, body, extraCss = "", wide = false, jsonLd = null }) {
  return `<!doctype html><html lang="pt-br"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="Promoções do Veras">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(url)}"><meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b0d12">
<link rel="icon" type="image/png" href="/favicon.png"><link rel="manifest" href="/manifest.webmanifest"><link rel="canonical" href="${esc(url)}">
${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>` : ""}
${themeScript()}<style>${CSS}${extraCss}</style></head><body>
<header><a href="/"><img src="/logo.png" alt=""> Promoções do Veras</a><a class="all" href="/">Ver todas as ofertas ›</a></header>
<main${wide ? ' class="wide"' : ""}>${body}</main></body></html>`;
}

const LIST_CSS = `
.intro{color:var(--muted);font-size:15px;line-height:1.6;margin:0 0 18px}
.list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
.item{display:flex;flex-direction:column;background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;text-decoration:none;color:var(--text)}
.item .ph{aspect-ratio:4/3;background:#fff;display:flex;align-items:center;justify-content:center}
.item .ph img{width:88%;height:88%;object-fit:contain}
.item .in{padding:12px 14px}
.item .nm{font-size:14px;font-weight:700;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0 0 6px}
.item .pr{font-size:20px;font-weight:900}
.item .off{background:rgba(63,201,107,.14);color:var(--green);font-weight:800;font-size:12px;padding:2px 6px;border-radius:6px;margin-left:6px}
.stores{display:flex;flex-wrap:wrap;gap:8px;margin:26px 0 0}
.stores a{padding:8px 12px;border-radius:999px;border:1px solid var(--line);background:var(--soft);color:var(--text);text-decoration:none;font-size:13px;font-weight:700}
main.wide{max-width:1100px}
`;

const PREP = { mercadolivre: "do", aliexpress: "do", carrefour: "do" };

async function storePage(req, res, origin, key) {
  const label = STORES[key];
  if (!label) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).send(page({ title: "Loja não encontrada · Promoções do Veras", desc: "Veja as ofertas de hoje.", image: `${origin}/og.png`, url: `${origin}/`, body: `<div class="card"><div class="body"><h1>Loja não encontrada</h1><a class="go" href="/">Ver ofertas de hoje</a></div></div>` }));
    return;
  }
  const recent = isConfigured() ? await listAds({ limit: 400 }).catch(() => []) : [];
  const ads = recent.filter((a) => a.store === key).slice(0, 48);
  const de = `${PREP[key] || "da"} ${label}`;
  const items = ads.map((a) => {
    const d = describe(a);
    return `<a class="item" href="/oferta/${a.id}"><span class="ph">${a.photo_file_id ? `<img src="/api/photo?ad=${a.id}&v=2" alt="${esc(d.name)}" loading="lazy">` : "🏷️"}</span><span class="in"><p class="nm">${esc(d.name)}</p><span class="pr">${esc(d.now || "Confira")}</span>${d.discount ? `<span class="off">-${d.discount}%</span>` : ""}</span></a>`;
  }).join("");
  const others = Object.entries(STORES).filter(([k]) => k !== key).map(([k, l]) => `<a href="/loja/${k}">${esc(l)}</a>`).join("");
  const body = `<h1>Promoções e cupons ${esc(de)} hoje</h1>
<p class="intro">As melhores ofertas ${esc(de)} selecionadas pelo canal Promoções do Veras, atualizadas ao vivo. ${ads.length ? `${ads.length} ofertas recentes abaixo.` : "Nenhuma oferta recente desta loja agora — confira as de outras lojas."}</p>
<div class="list">${items}</div>
<p style="margin-top:22px"><a class="go" href="/">Ver todas as ofertas de hoje ›</a></p>
<div class="stores">${others}</div>`;
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=900, stale-while-revalidate=3600");
  res.status(200).send(page({
    title: `Promoções ${de} hoje · ofertas e cupons · Promoções do Veras`,
    desc: `Ofertas e cupons ${de} atualizados ao vivo: os melhores descontos do dia selecionados pelo Promoções do Veras.`,
    image: `${origin}/og.png`, url: `${origin}/loja/${key}`, body, extraCss: LIST_CSS, wide: true,
  }));
}


// ---------- Campanha: 11.11 e Black Friday ----------
// Uma pagina so (/black-friday, /11-11) com contagem regressiva e as melhores
// ofertas recentes. Cache de 15 min na CDN: quase nao gasta o banco.
const EVENTS = [
  { key: "1111", name: "11.11", at: "2026-11-11T00:00:00-03:00", end: "2026-11-12T00:00:00-03:00", desc: "o maior dia de ofertas da Shopee e do AliExpress" },
  { key: "bf", name: "Black Friday", at: "2026-11-27T00:00:00-03:00", end: "2026-11-28T00:00:00-03:00", desc: "descontos fortes em quase todas as lojas" },
];
const CAMP_RE = /black\s*friday|black\s*fri|esquenta|11[.\/]11|blackfriday|cyber\s*monday/i;

const CAMP_CSS = `
.camp-hero{border-radius:20px;padding:26px 22px;margin:0 0 20px;background:linear-gradient(135deg,#111 0%,#2a1606 100%);color:#fff;border:1px solid #3a2a1c}
.camp-hero h1{margin:0 0 8px;font-size:clamp(24px,4.5vw,36px);line-height:1.15}
.camp-hero p{margin:0;color:#d6d0c8;line-height:1.55}
.cd-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin:18px 0 4px}
.cd{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:14px;padding:14px 16px}
.cd b{display:block;font-size:13px;letter-spacing:.04em;text-transform:uppercase;color:#ffb27a;margin:0 0 6px}
.cd .t{font-size:26px;font-weight:900;font-variant-numeric:tabular-nums}
@media (max-width:560px){.cd .t{font-size:20px}.camp-hero{padding:20px 16px}}
.cd small{display:block;color:#bdb6ad;margin-top:4px;font-size:12.5px}
.cd.live{border-color:#ff7a1a;background:rgba(255,122,26,.16)}
.camp-cta{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0 0}
.camp-cta a{display:inline-flex;align-items:center;gap:6px;padding:11px 16px;border-radius:12px;font-weight:800;text-decoration:none;font-size:14.5px}
.camp-cta .cwa{background:#25d366;color:#06301a}
.camp-cta .ctg{background:#2aa7e0;color:#fff}
.camp-sub{font-size:19px;margin:26px 0 12px}
.camp-tips{margin:26px 0 0;padding:16px 18px;border:1px solid var(--line);border-radius:14px;background:var(--soft);color:var(--muted);line-height:1.6;font-size:14px}
.camp-tips b{color:var(--text)}
`;

async function campaignPage(req, res, origin) {
  const recent = isConfigured() ? await listAds({ limit: 200 }).catch(() => []) : [];
  const since = Date.now() - 72 * 3600 * 1000;
  const fresh = recent.filter((a) => (Date.parse(a.posted_at) || 0) >= since && !a.ended_reported);
  const scored = fresh.map((a) => ({ a, d: describe(a) }));
  const tagged = scored.filter((x) => CAMP_RE.test(x.a.text || ""));
  const rest = scored.filter((x) => !CAMP_RE.test(x.a.text || "")).sort((x, y) => (y.d.discount || 0) - (x.d.discount || 0));
  const list = tagged.concat(rest).slice(0, 36);
  const items = list.map(({ a, d }) => `<a class="item" href="/oferta/${a.id}"><span class="ph">${a.photo_file_id ? `<img src="/api/photo?ad=${a.id}&v=2" alt="${esc(d.name)}" loading="lazy">` : "🏷️"}</span><span class="in"><p class="nm">${esc(d.name)}</p><span class="pr">${esc(d.now || "Confira")}</span>${d.discount ? `<span class="off">-${d.discount}%</span>` : ""}</span></a>`).join("");
  const cds = EVENTS.map((e) => `<div class="cd" data-at="${e.at}" data-end="${e.end}"><b>${esc(e.name)}</b><span class="t">${esc(new Date(e.at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" }))}</span><small>${esc(e.desc)}</small></div>`).join("");
  const body = `<section class="camp-hero">
  <h1>🖤 Black Friday e 11.11 2026: ofertas e cupons</h1>
  <p>As melhores promoções da Black Friday e do 11.11, selecionadas e conferidas pelo Promoções do Veras. Entre no canal para receber as ofertas no momento em que saírem.</p>
  <div class="cd-row">${cds}</div>
  <div class="camp-cta"><a class="cwa" href="${WHATSAPP}" target="_blank" rel="noopener noreferrer">📲 Receber no WhatsApp</a><a class="ctg" href="https://t.me/PromocoesdoVeras" target="_blank" rel="noopener noreferrer">✈️ Receber no Telegram</a></div>
</section>
<h2 class="camp-sub">${tagged.length ? "🔥 Ofertas da campanha e maiores descontos" : "🔥 Maiores descontos dos últimos dias"}</h2>
<div class="list">${items || '<p class="intro">Novas ofertas chegam a cada poucos minutos.</p>'}</div>
<p style="margin-top:22px"><a class="go" href="/">Ver todas as ofertas de hoje ›</a></p>
<div class="camp-tips"><b>Dicas para aproveitar:</b> salve as ofertas no ❤️ do site, crie um alerta com o nome do produto que você quer (🔔 Me avise), compare com o selo “📉 Menor preço já visto” e confira o cupom antes de finalizar. Você paga o mesmo preço da loja.</div>
<script>
(function(){
  function fmt(ms){var s=Math.max(0,Math.floor(ms/1000)),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;return (d?d+"d ":"")+String(h).padStart(2,"0")+"h "+String(m).padStart(2,"0")+"m "+String(x).padStart(2,"0")+"s"}
  function tick(){document.querySelectorAll(".cd").forEach(function(el){var at=Date.parse(el.dataset.at),end=Date.parse(el.dataset.end),now=Date.now(),t=el.querySelector(".t");
    if(now<at){t.textContent="Faltam "+fmt(at-now);el.classList.remove("live")}
    else if(now<end){t.textContent="🔴 Acontecendo agora";el.classList.add("live")}
    else{t.textContent="Encerrado";el.classList.remove("live")}})}
  tick();setInterval(tick,1000);
})();
</script>`;
  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=900, stale-while-revalidate=3600");
  res.status(200).send(page({
    title: "Black Friday 2026 e 11.11: ofertas e cupons de hoje · Promoções do Veras",
    desc: "Contagem regressiva para o 11.11 e a Black Friday 2026, com as melhores ofertas e cupons do dia selecionados pelo Promoções do Veras.",
    image: `${origin}/og.png`, url: `${origin}/black-friday`, body, extraCss: LIST_CSS + CAMP_CSS, wide: true,
  }));
}

async function sitemap(req, res, origin) {
  const ads = isConfigured() ? await listAds({ limit: 500 }).catch(() => []) : [];
  const urls = [`<url><loc>${origin}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`, `<url><loc>${origin}/black-friday</loc><changefreq>hourly</changefreq><priority>0.9</priority></url>`]
    .concat(Object.keys(STORES).map((k) => `<url><loc>${origin}/loja/${k}</loc><changefreq>hourly</changefreq><priority>0.8</priority></url>`))
    .concat(ads.map((a) => `<url><loc>${origin}/oferta/${a.id}</loc><lastmod>${String(a.updated_at || a.posted_at || "").slice(0, 10)}</lastmod><priority>0.5</priority></url>`));
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=600, s-maxage=3600");
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`);
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const id = Number.parseInt(q.id, 10);
  const host = req.headers["x-forwarded-host"] || req.headers.host || "promocoesdoveras.com.br";
  const origin = `https://${host}`;
  if (q.sitemap) return sitemap(req, res, origin);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (q.campanha) return campaignPage(req, res, origin);
  if (q.loja) return storePage(req, res, origin, String(q.loja).toLowerCase());
  res.setHeader("Content-Type", "text/html; charset=utf-8");

  const ad = Number.isFinite(id) && id > 0 && isConfigured() ? await getAd(id).catch(() => null) : null;
  if (!ad) {
    res.setHeader("Cache-Control", "no-store");
    res.status(404).send(page({
      title: "Oferta não encontrada · Promoções do Veras",
      desc: "Veja as ofertas e cupons de hoje.",
      image: `${origin}/og.png`, url: `${origin}/`,
      body: `<div class="card"><div class="body"><h1>Essa oferta não está mais disponível 😕</h1><p class="note" style="text-align:left">Mas tem oferta nova saindo a cada poucos minutos.</p><a class="go" href="/">Ver ofertas de hoje</a></div></div>`,
    }));
    return;
  }

  const d = describe(ad);
  const storeLabel = STORES[ad.store] || null;
  // Post so de cupom (sem preco): titulo e texto proprios.
  const couponOnly = !d.now && !!d.coupon && (/^\s*🔥?\s*🎟️?\s*cupom\b/imu.test(ad.text || "") || /cupom\.pravce\.com\.br/i.test(ad.text || ""));
  if (couponOnly) d.name = `Cupom de desconto${storeLabel ? " " + storeLabel : ""}: ${d.coupon}`;
  const price = d.now ? ` por ${d.now}` : "";
  const off = d.discount ? ` (-${d.discount}%)` : "";
  const title = `${d.name}${price}`;
  const desc = `🔥 ${d.now ? d.now + off : "Oferta"}${storeLabel ? " na " + storeLabel : ""}${d.coupon ? " · Cupom " + d.coupon : ""} · Promoções do Veras`;
  const image = ad.photo_file_id ? `${origin}/api/photo?ad=${ad.id}&v=2` : `${origin}/og.png`;
  const stale = Date.now() - Date.parse(ad.posted_at) > 48 * 3600 * 1000;
  const jsonLd = productJsonLd(ad, d, { origin, image, storeLabel });

  const body = `
<div class="card">
  <div class="thumb">${ad.photo_file_id ? `<img src="/api/photo?ad=${ad.id}&v=2" alt="${esc(d.name)}">` : `<span class="ph">🏷️</span>`}${storeLabel ? `<span class="store">${esc(storeLabel)}</span>` : ""}</div>
  <div class="body">
    ${stale ? `<div class="stale">⏳ Oferta publicada há mais de 2 dias, o preço pode ter mudado.</div>` : ""}
    <h1>${esc(d.name)}</h1>
    ${d.old ? `<div><span class="old">${esc(d.old)}</span>${d.discount ? `<span class="off">-${d.discount}%</span>` : ""}</div>` : ""}
    ${couponOnly ? `<p class="note" style="text-align:left;margin:4px 0 12px">Copie o código abaixo e aplique no carrinho${storeLabel ? " " + (["mercadolivre","aliexpress","carrefour"].includes(ad.store) ? "do" : "da") + " " + esc(storeLabel) : ""} antes de pagar.</p>` : `<div class="now">${esc(d.now || "Confira o preço")}</div>`}
    ${d.pix || d.installments ? `<div class="pay">${d.pix ? "<span>💠 Preço no Pix</span>" : ""}${d.installments ? `<span>💳 ${esc(d.installments)}</span>` : ""}</div>` : ""}
    ${historyBadge(ad, d)}
    ${d.rating ? `<div class="rating">⭐ <b>${esc(d.rating)}</b> de avaliação</div>` : ""}
    ${d.coupon ? `<button class="coupon" id="coupon" data-code="${esc(d.coupon)}">🏷️ <span class="code">Cupom: ${esc(d.coupon)}</span><span class="hint">copiar</span></button>` : ""}
    ${d.url ? `<a class="go" id="go" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">${storeLabel ? `Ver ${["mercadolivre","aliexpress","carrefour"].includes(ad.store) ? "no" : "na"} ${esc(storeLabel)}` : "Ver oferta na loja"} ›</a>` : ""}
    <div class="row">
      <button type="button" id="share">📤 Compartilhar</button>
      <a href="/">🛍️ Mais ofertas</a>
    </div>
    <p class="note">✔️ Você paga o mesmo preço da loja, pelo link oficial. Preços e estoque podem mudar a qualquer momento.</p>
    <button type="button" class="flag" id="flag">🚩 Esta oferta ou cupom acabou? Avise a gente</button>
  </div>
</div>
<a class="wa" href="${WHATSAPP}" target="_blank" rel="noopener noreferrer">Receber ofertas no WhatsApp</a>
<a class="lt" href="https://linktr.ee/jpverastech" target="_blank" rel="noopener noreferrer">🔗 Conheça todos os nossos canais ›</a>
<script>
(function(){
  var AD=${ad.id};
  function track(e){try{if(localStorage.getItem("pv_optout")==="1")return}catch(x){}var v="";try{v=localStorage.getItem("pv_vid")||""}catch(x){}var b=JSON.stringify({e:e,v:v,a:AD});try{if(navigator.sendBeacon&&navigator.sendBeacon("/api/track",new Blob([b],{type:"application/json"})))return}catch(x){}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true}).catch(function(){})}
  var go=document.getElementById("go"); if(go) go.addEventListener("click",function(){track("offer")});
  var fl=document.getElementById("flag");
  if(fl){var k="pv_ended_"+AD;try{if(localStorage.getItem(k)){fl.disabled=true;fl.textContent="✓ Obrigado pelo aviso!"}}catch(x){}
    fl.addEventListener("click",function(){try{if(!localStorage.getItem("pv_vid"))localStorage.setItem("pv_vid",(String(Math.random()).slice(2)+Date.now()).slice(0,32));localStorage.setItem(k,"1")}catch(x){}track("ended");fl.disabled=true;fl.textContent="✓ Obrigado pelo aviso!"});}
  var c=document.getElementById("coupon");
  if(c) c.addEventListener("click",function(){var code=c.dataset.code;(navigator.clipboard?navigator.clipboard.writeText(code):Promise.reject()).catch(function(){var t=document.createElement("textarea");t.value=code;document.body.appendChild(t);t.select();try{document.execCommand("copy")}catch(e){}t.remove()}).finally(function(){c.classList.add("ok");c.querySelector(".hint").textContent="copiado ✓";track("coupon")})});
  document.getElementById("share").addEventListener("click",function(){
    var text=${JSON.stringify(`🔥 ${d.name}${d.now ? " por " + d.now : ""}${d.coupon ? " (cupom " + d.coupon + ")" : ""}`).replace(/</g, "\\u003c")};
    var url=location.origin+"/oferta/"+AD; track("share");
    if(navigator.share){navigator.share({title:"Promoções do Veras",text:text,url:url}).catch(function(){});}
    else{window.open("https://wa.me/?text="+encodeURIComponent(text+"\\n"+url),"_blank","noopener");}
  });
})();
</script>`;

  res.setHeader("Cache-Control", "public, max-age=60, s-maxage=600, stale-while-revalidate=3600");
  res.status(200).send(page({ title, desc, image, url: `${origin}/oferta/${ad.id}`, body, jsonLd }));
};
