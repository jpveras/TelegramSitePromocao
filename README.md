# Feed de Anúncios (Telegram → Site na Vercel)

Cada anúncio postado no grupo/canal do Telegram aparece no site em poucos
segundos, sem precisar atualizar a página. Tudo roda na Vercel.

## Como funciona

1. **Telegram → site:** o bot do Telegram avisa o site (webhook em
   `/api/telegram`) a cada mensagem nova ou editada no grupo/canal.
2. **Banco:** o anúncio é salvo num Upstash Redis conectado ao projeto na
   Vercel. Mensagens editadas atualizam o anúncio em vez de duplicar.
3. **Site ao vivo:** a página (`public/index.html`) carrega os anúncios e
   pergunta a cada 5 segundos se chegou algum novo (`/api/ads?after=...`).
4. **Fotos:** passam pela rota `/api/photo`, para o token do bot nunca
   aparecer no navegador. A CDN da Vercel guarda as fotos em cache.

> O Telegram só entrega ao bot mensagens enviadas **depois** que o webhook
> foi ligado. Anúncios antigos do grupo não são importados automaticamente.

## Configurar na Vercel (uma vez)

### 1. Bot no Telegram

1. No **@BotFather**, crie o bot (`/newbot`) e guarde o token.
2. **Canal:** adicione o bot como **administrador**.
   **Grupo:** adicione o bot e, no @BotFather, desative o modo de
   privacidade (`/mybots` → bot → `Bot Settings` → `Group Privacy` → `Turn off`).

### 2. Banco

No projeto da Vercel: **Storage → Create Database → Upstash (Redis)** e
conecte ao projeto. A Vercel cria sozinha as variáveis `KV_REST_API_URL` e
`KV_REST_API_TOKEN`.

### 3. Variáveis de ambiente

Em **Settings → Environment Variables** (ambiente Production):

| Variável | Valor |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | token do @BotFather |
| `TELEGRAM_WEBHOOK_SECRET` | texto longo e aleatório (letras, números, `_` e `-`) |
| `SETUP_KEY` | outra senha aleatória, para abrir a página de setup |
| `TELEGRAM_CHAT_ID` | opcional; id do grupo/canal (veja o passo 5) |

Depois de salvar, faça um **Redeploy** para as variáveis valerem.

### 4. Ligar o bot ao site

Abra no navegador, uma vez:

```
https://SEU-SITE.vercel.app/api/setup?key=SEU_SETUP_KEY
```

A resposta mostra se o webhook foi registrado, se falta configurar algo e
quantos anúncios já foram salvos. Pode abrir de novo sempre que quiser
conferir o status.

### 5. Filtrar só o grupo do DisparaPromo (opcional)

Poste algo no grupo/canal e abra `/api/setup?key=...` de novo: em
`chats_vistos` aparece o id de cada chat que falou com o bot. Coloque o id
certo em `TELEGRAM_CHAT_ID` e faça um Redeploy. Sem essa variável, o site
salva mensagens de todos os chats onde o bot estiver.

## Estrutura

```
api/
├── _lib/store.js   # leitura/escrita no Redis (Upstash REST)
├── telegram.js     # webhook: recebe as mensagens do Telegram
├── ads.js          # lista de anúncios para o site
├── photo.js        # entrega as fotos sem expor o token
└── setup.js        # registra o webhook e mostra o status
public/index.html   # o site
test/smoke.js       # teste offline (npm test)
vercel.json
```

## Testar

```bash
npm test
```

Roda o webhook e a listagem contra um Redis falso, sem internet e sem
precisar de token.
