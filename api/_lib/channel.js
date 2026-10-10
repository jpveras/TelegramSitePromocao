// Le os posts de um canal PUBLICO do Telegram pela pagina de previa
// (https://t.me/s/<canal>). Nao precisa de bot, token nem banco de dados:
// o proprio Telegram guarda os anuncios, e o site so espelha o que esta la.

const cheerio = require("cheerio");

const PAGE_SIZE_HINT = 20; // o Telegram devolve cerca de 20 posts por pagina

function normalizeChannel(value) {
  if (!value) return null;
  // Aceita "meucanal", "@meucanal", "t.me/meucanal" ou "https://t.me/s/meucanal".
  const m = String(value)
    .trim()
    .match(/^(?:https?:\/\/)?(?:t\.me\/|telegram\.me\/)?(?:s\/)?@?([A-Za-z0-9_]{4,})\/?$/);
  return m ? m[1] : null;
}

// Converte o HTML do texto do post em texto puro, mantendo quebras de linha.
// Links viram o endereco real (href), para o site achar o link da oferta.
function htmlToText($, el) {
  const node = $(el).clone();
  node.find("br").replaceWith("\n");
  node.find("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    const label = $(a).text().trim();
    const looksLikeUrl = /^(https?:\/\/|www\.)|\.[a-z]{2,}\//i.test(label);
    if (!/^https?:\/\//i.test(href)) return;
    // Link com texto ("Compre aqui") ganha o endereco ao lado, senao o site
    // nao teria como montar o botao "Ver oferta".
    $(a).replaceWith(looksLikeUrl || !label ? href : `${label} ${href}`);
  });
  // Emojis personalizados aparecem como imagens; usa o emoji de texto se houver.
  node.find("i.emoji b, tg-emoji").each((_, e) => $(e).replaceWith($(e).text()));
  return node.text().replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function backgroundUrl(style) {
  const m = /background-image:\s*url\(['"]?([^'")]+)['"]?\)/i.exec(style || "");
  return m ? m[1] : null;
}

function parsePosts(html, channel) {
  const $ = cheerio.load(html);
  const posts = [];

  $(".tgme_widget_message[data-post]").each((_, el) => {
    const msg = $(el);
    const dataPost = msg.attr("data-post") || "";
    const id = Number.parseInt(dataPost.split("/").pop(), 10);
    if (!Number.isFinite(id)) return;

    // Mensagens de servico (ex.: "canal criado") nao sao anuncios.
    if (msg.hasClass("service_message")) return;

    const textEl = msg.find(".tgme_widget_message_text").first();
    const text = textEl.length ? htmlToText($, textEl) : null;

    const photo =
      backgroundUrl(msg.find(".tgme_widget_message_photo_wrap").first().attr("style")) ||
      backgroundUrl(msg.find(".tgme_widget_message_video_thumb").first().attr("style")) ||
      backgroundUrl(msg.find(".link_preview_image").first().attr("style")) ||
      msg.find(".link_preview_right_image").first().attr("src") ||
      null;

    const datetime = msg.find(".tgme_widget_message_date time").attr("datetime") || null;

    if (!text && !photo) return;

    posts.push({
      id,
      text,
      photo_url: photo,
      posted_at: datetime ? new Date(datetime).toISOString() : null,
      telegram_url: `https://t.me/${channel}/${id}`,
    });
  });

  // A pagina vem do mais antigo para o mais novo; o site quer o contrario.
  return posts.sort((a, b) => b.id - a.id);
}

async function fetchChannelPage(channel, { before = null } = {}) {
  const url = new URL(`https://t.me/s/${channel}`);
  if (before) url.searchParams.set("before", String(before));

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FeedEspelho/1.0)",
      "Accept-Language": "pt-BR,pt;q=0.9",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`t.me respondeu ${res.status}`);

  const finalUrl = res.url || "";
  const html = await res.text();
  // Canal privado ou inexistente: o Telegram redireciona para a pagina do
  // convite, que nao tem a lista de posts.
  const isPreview = /tgme_channel_history|tgme_widget_message/.test(html);
  if (!isPreview || !/\/s\//.test(finalUrl || url.href)) {
    return { available: false, posts: [] };
  }
  return { available: true, posts: parsePosts(html, channel) };
}

module.exports = { normalizeChannel, parsePosts, fetchChannelPage, PAGE_SIZE_HINT };
