// Pagina propria de cada oferta: /oferta/123 (reescrita para /api/oferta?id=123).
// Serve para compartilhar: no WhatsApp o link aparece com a foto, o nome e o
// preco do produto. Quem abre ve a oferta e vai para a loja com um toque.

const { isConfigured, getAd } = require("./_lib/store");
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
.now{font-size:32px;font-weight:900;color:var(--accent);margin:2px 0 8px}
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
.stale{background:rgba(245,197,24,.14);color:#c99a00;font-size:12.5px;font-weight:700;padding:8px 10px;border-radius:10px;margin-bottom:12px}
`;

function page({ title, desc, image, url, body }) {
  return `<!doctype html><html lang="pt-br"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}">
<meta property="og:type" content="product"><meta property="og:site_name" content="Promoções do Veras">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(url)}"><meta property="og:locale" content="pt_BR">
<meta name="twitter:card" content="summary_large_image"><meta name="theme-color" content="#0b0d12">
<link rel="icon" type="image/png" href="/favicon.png"><link rel="manifest" href="/manifest.webmanifest">
${themeScript()}<style>${CSS}</style></head><body>
<header><a href="/"><img src="/logo.png" alt=""> Promoções do Veras</a><a class="all" href="/">Ver todas as ofertas ›</a></header>
<main>${body}</main></body></html>`;
}

module.exports = async function handler(req, res) {
  const id = Number.parseInt((req.query || {}).id, 10);
  const host = req.headers["x-forwarded-host"] || req.headers.host || "promocoesdoveras.com.br";
  const origin = `https://${host}`;
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
  const price = d.now ? ` por ${d.now}` : "";
  const off = d.discount ? ` (-${d.discount}%)` : "";
  const title = `${d.name}${price}`;
  const desc = `🔥 ${d.now ? d.now + off : "Oferta"}${storeLabel ? " na " + storeLabel : ""}${d.coupon ? " · Cupom " + d.coupon : ""} · Promoções do Veras`;
  const image = ad.photo_file_id ? `${origin}/api/photo?ad=${ad.id}&v=2` : `${origin}/og.png`;
  const stale = Date.now() - Date.parse(ad.posted_at) > 48 * 3600 * 1000;

  const body = `
<div class="card">
  <div class="thumb">${ad.photo_file_id ? `<img src="/api/photo?ad=${ad.id}&v=2" alt="${esc(d.name)}">` : `<span class="ph">🏷️</span>`}${storeLabel ? `<span class="store">${esc(storeLabel)}</span>` : ""}</div>
  <div class="body">
    ${stale ? `<div class="stale">⏳ Oferta publicada há mais de 2 dias, o preço pode ter mudado.</div>` : ""}
    <h1>${esc(d.name)}</h1>
    ${d.old ? `<div><span class="old">${esc(d.old)}</span>${d.discount ? `<span class="off">-${d.discount}%</span>` : ""}</div>` : ""}
    <div class="now">${esc(d.now || "Confira o preço")}</div>
    ${d.pix || d.installments ? `<div class="pay">${d.pix ? "<span>💠 Preço no Pix</span>" : ""}${d.installments ? `<span>💳 ${esc(d.installments)}</span>` : ""}</div>` : ""}
    ${d.rating ? `<div class="rating">⭐ <b>${esc(d.rating)}</b> de avaliação</div>` : ""}
    ${d.coupon ? `<button class="coupon" id="coupon" data-code="${esc(d.coupon)}">🏷️ <span class="code">Cupom: ${esc(d.coupon)}</span><span class="hint">copiar</span></button>` : ""}
    ${d.url ? `<a class="go" id="go" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer">Ver oferta na loja ›</a>` : ""}
    <div class="row">
      <button type="button" id="share">📤 Compartilhar</button>
      <a href="/">🛍️ Mais ofertas</a>
    </div>
    <p class="note">Preços e estoque podem mudar a qualquer momento na loja.</p>
  </div>
</div>
<a class="wa" href="${WHATSAPP}" target="_blank" rel="noopener noreferrer">Receber ofertas no WhatsApp</a>
<script>
(function(){
  var AD=${ad.id};
  function track(e){try{if(localStorage.getItem("pv_optout")==="1")return}catch(x){}var v="";try{v=localStorage.getItem("pv_vid")||""}catch(x){}var b=JSON.stringify({e:e,v:v,a:AD});try{if(navigator.sendBeacon&&navigator.sendBeacon("/api/track",new Blob([b],{type:"application/json"})))return}catch(x){}fetch("/api/track",{method:"POST",headers:{"Content-Type":"application/json"},body:b,keepalive:true}).catch(function(){})}
  var go=document.getElementById("go"); if(go) go.addEventListener("click",function(){track("offer")});
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
  res.status(200).send(page({ title, desc, image, url: `${origin}/oferta/${ad.id}`, body }));
};
