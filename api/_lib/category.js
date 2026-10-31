// Categorias pelo nome do produto: as MESMAS regras do site (public/index.html,
// lista CATEGORIES). Ao mudar uma regra la, mude aqui tambem.
const { describe } = require("./parse");

const CATEGORIES = [
  { key: "games",       label: "Games",          icon: "🎮", match: /playstation|\bps[45]\b|\bxbox\b|nintendo|\bswitch\s?(2|oled|lite)?\b|console|controle\s?(sem\s?fio|gamer|joystick|dualsense|dualshock)|\bdualsense\b|\bjoystick\b/i },
  { key: "tv",          label: "TV e Áudio",     icon: "📺", match: /smart\s?tv|\btv\b|televis|projetor|caixa\s?de\s?som|soundbar|home\s?theater|\bfones?\b|headset|headphone|earbuds?|\bbuds\d*\b|airpods|\bjbl\b|\bpartybox\b|microfone|chromecast|fire\s?tv|tv\s?box/i },
  { key: "informatica", label: "Informática",    icon: "💻", match: /notebook|tablet|\bipad\b|galaxy\s?tab|placa\s?de\s?v[íi]deo|\brtx\b|\bgtx\b|\bradeon\b|processador|\bryzen\b|\bintel\b|placa.?m[ãa]e|\bssd\b|\bnvme\b|mem[óo]ria\s?(ram|ddr)|\bddr[45]\b|gabinete|water\s?cooler|\bcooler\b|\bfans?\b|teclado|\bmouse\b|mousepad|monitor|impressora|fonte\s.*\d+\s?w|80\s?plus|pendrive|hd\s?externo|roteador|webcam|\bkindle\b/i },
  { key: "celulares",   label: "Celulares",      icon: "📱", match: /celular|smartphone|iphone|\bmoto\s?(g|e|edge)\s?\d*|motorola\s?(moto|edge|razr)|redmi|\bpoco\b|xiaomi|galaxy\s?(a|s|m|z)\s?\d|smartwatch|rel[óo]gio\s?inteligente|\bband\s?\d|carregador|power\s?bank|capinha|pel[íi]cula/i },
  { key: "casa",        label: "Casa e Cozinha", icon: "🏠", match: /panela|frigideira|escorredor|liquidificador|batedeira|air\s?fryer|fritadeira|cafeteira|chaleira|\bgelo\b|sanduicheira|grill|forno|mixer|eletroport[áa]til|micro-?ondas|geladeira|fog[ãa]o|cozinha|talher|prato|copo|garrafa|t[ée]rmica|pote|condimento|jogo\s?de\s?cama|len[çc]ol|edred[oã]m|travesseiro|toalha|utens[íi]lio|caneca|aspirador|rob[ôo]\s?aspirador|ventilador|climatizador|ar\s?condicionado|chuveiro|torneira|\bpia\b|cuba|lixeira|organizador|aromatizador|l[âa]mpada|fechadura|ferramenta|furadeira|parafusadeira|cadeira|mesa\b|colch[ãa]o|tapete|cortina/i },
  { key: "mercado",     label: "Mercado",        icon: "🛒", match: /ketchup|maionese|mostarda|refrigerante|cerveja|\bvinho\b|\bcaf[ée]\b|chocolate|biscoito|leite|azeite|arroz|feij[ãa]o|achocolatado|sab[ãa]o|amaciante|detergente|desinfetante|papel\s?higi[êe]nico|limpeza|fralda|ra[çc][ãa]o/i },
  { key: "beleza",      label: "Beleza e Saúde", icon: "💄", match: /perfume|eau\s?de|col[ôo]nia|maquiagem|batom|base\s?l[íi]quida|shampoo|condicionador|creme|hidratante|skincare|s[ée]rum|protetor\s?solar|desodorante|barbeador|aparador|secador|chapinha|escova\s?(de\s?cabelo|alisadora|secadora)|escovas?\s?de\s?dentes?|escova\s?el[ée]trica|creme\s?dental|fio\s?dental|multivitam|vitamina|col[áa]geno/i },
  { key: "moda",        label: "Moda",           icon: "👗", match: /vestido|cal[çc]a\b|camis(a|eta)|blusa|moletom|sapato|t[êe]nis|sand[áa]lia|chinelo|\bmule\b|bolsa|mochila|\bshort\b|bermuda|saia|jaqueta|roupa|cueca|calcinha|meia\b|bon[ée]\b|[óo]culos|rel[óo]gio(?!\s?inteligente)/i },
  { key: "esporte",     label: "Esporte",        icon: "🏋️", match: /academia|halter|anilha|esteira|bicicleta|\bbike\b|suplemento|\bwhey\b|creatina|prote[íi]na|coqueteleira|yoga|corrida|camping|barraca/i },
  { key: "brinquedos",  label: "Brinquedos",     icon: "🧸", match: /brinquedo|boneca|\blego\b|blocos\s?de\s?montar|infantil|beb[êe]|carrinho\s?de\s?controle|pel[úu]cia|quebra-?cabe[çc]a|jogo\s?de\s?tabuleiro|jogo\s?da\s?mem[óo]ria/i },
];

function categoryOf(ad) {
  const name = describe(ad).name || "";
  for (const c of CATEGORIES) if (c.match.test(name)) return c;
  return null;
}

module.exports = { CATEGORIES, categoryOf };
