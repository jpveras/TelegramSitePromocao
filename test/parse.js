// Teste offline do leitor da pagina publica do canal (t.me/s/<canal>),
// com um HTML de exemplo no mesmo formato que o Telegram usa.
// Rode com: npm test
const assert = require("assert");
const { parsePosts, normalizeChannel } = require("../api/_lib/channel");

const html = `
<section class="tgme_channel_history js-message_history">
  <div class="tgme_widget_message_wrap"><div class="tgme_widget_message service_message" data-post="promo/1">
    <div class="tgme_widget_message_text">Canal criado</div></div></div>
  <div class="tgme_widget_message_wrap"><div class="tgme_widget_message text_not_supported_wrap" data-post="promo/4922">
    <a class="tgme_widget_message_photo_wrap" style="width:800px;background-image:url('https://cdn4.telesco.pe/file/abc.jpg')"></a>
    <div class="tgme_widget_message_text js-message_text" dir="auto">ACABAMENTO DE MARCA<br/><br/>🔥 Watercooler Deepcool<br/>💰 R$ 317,00<br/>🛒 Compre aqui 👇<br/><a href="https://oferta.pravce.com.br/FtXFu3" target="_blank">https://oferta.pravce.com.br/FtXFu3</a></div>
    <div class="tgme_widget_message_footer"><a class="tgme_widget_message_date" href="https://t.me/promo/4922"><time datetime="2026-10-10T12:20:59+00:00" class="time">12:20</time></a></div>
  </div></div>
  <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="promo/4923">
    <div class="tgme_widget_message_text">Fone R$ 59 <a href="https://amzn.to/x">clique</a></div>
    <a class="tgme_widget_message_date" href="#"><time datetime="2026-10-10T13:00:00+00:00"></time></a>
  </div></div>
  <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="promo/4924">
    <div class="tgme_widget_message_sticker_wrap"></div>
  </div></div>
</section>`;

const posts = parsePosts(html, "promo");
assert.deepStrictEqual(posts.map((p) => p.id), [4923, 4922]);
assert.strictEqual(posts[1].photo_url, "https://cdn4.telesco.pe/file/abc.jpg");
assert.ok(posts[1].text.startsWith("ACABAMENTO DE MARCA\n\n🔥 Watercooler"));
assert.ok(posts[1].text.endsWith("https://oferta.pravce.com.br/FtXFu3"));
assert.strictEqual(posts[1].posted_at, "2026-10-10T12:20:59.000Z");
assert.strictEqual(posts[1].telegram_url, "https://t.me/promo/4922");
// Link com texto ("clique") mantem o texto e ganha o endereco ao lado.
assert.strictEqual(posts[0].text, "Fone R$ 59 clique https://amzn.to/x");

for (const [input, out] of [
  ["promocoesdoveras", "promocoesdoveras"], ["@Promo_Veras", "Promo_Veras"],
  ["https://t.me/promocoes", "promocoes"], ["t.me/s/promocoes/", "promocoes"],
  ["https://t.me/+AbCdEf", null], ["", null],
]) assert.strictEqual(normalizeChannel(input), out, input);

console.log("OK: leitura dos posts, textos, links, fotos, datas e nome do canal");
