# Feed de Anúncios (Telegram → Site)

Captura cada anúncio postado no grupo/canal do Telegram (onde você é admin) e
mostra num site com feed ao vivo, sem precisar atualizar a página.

Usa só a API oficial do Telegram (Bot API) — nada de credenciais de terceiros.

## Como funciona

1. Um bot do Telegram (criado por você, via @BotFather) fica conectado ao
   grupo/canal e escuta as mensagens novas.
2. Cada mensagem (texto e/ou foto) é salva num arquivo `data/ads.json` local
   (sem banco de verdade, sem nada pra instalar além do Node).
3. O site consulta esse banco e mantém uma conexão aberta (Server-Sent
   Events) para receber cada novo anúncio em tempo real, assim que o bot
   captura.

## Passo a passo

### 1. Criar o bot no Telegram

1. Abra uma conversa com **@BotFather** no Telegram.
2. Envie `/newbot` e siga as instruções (nome e username do bot).
3. O BotFather vai te dar um **token** (algo como `123456:ABC-DEF...`).

### 2. Adicionar o bot ao grupo/canal

- **Se for um canal**: adicione o bot como **administrador** do canal (sem
  isso, ele não recebe os posts).
- **Se for um grupo**: adicione o bot como membro normal, mas antes
  **desative o modo de privacidade** do bot:
  1. Fale com @BotFather → `/mybots` → selecione seu bot
  2. `Bot Settings` → `Group Privacy` → `Turn off`
  3. Isso é necessário para o bot enxergar todas as mensagens do grupo, não
     só comandos.

### 3. Instalar as dependências

```bash
npm install
```

### 4. Configurar o `.env`

```bash
cp .env.example .env
```

Abra o `.env` e cole o token do bot em `TELEGRAM_BOT_TOKEN`. Deixe
`TELEGRAM_CHAT_ID` em branco por enquanto.

### 5. Descobrir o chat_id do grupo/canal

```bash
npm start
```

Poste qualquer mensagem de teste no grupo/canal do DisparaPromo. No console
vai aparecer algo como:

```
[bot] Mensagem recebida de chat_id=-1001234567890 (Nome do Grupo)
```

Copie esse número (incluindo o `-` se tiver) e cole em `TELEGRAM_CHAT_ID`
no `.env`. Reinicie o servidor (`Ctrl+C` e `npm start` de novo).

A partir daqui, só mensagens desse chat específico serão salvas — útil se
o bot estiver em mais de um grupo.

### 6. Abrir o site

Acesse **http://localhost:3000** — o feed carrega os anúncios já salvos e
fica "ao vivo" (bolinha verde no topo), atualizando sozinho a cada novo
anúncio postado no Telegram.

## Estrutura do projeto

```
telegram-ads-feed/
├── src/
│   ├── bot.js      # conecta no Telegram, escuta mensagens, salva no banco
│   ├── db.js       # leitura/escrita do data/ads.json
│   └── server.js   # servidor Express: API + feed ao vivo (SSE)
├── public/
│   └── index.html  # site do feed
├── data/
│   └── ads.json     # "banco" gerado automaticamente na primeira execução
├── .env.example
└── package.json
```

## Rodando em produção (sempre ligado)

Para deixar isso rodando 24/7 num servidor (VPS, por exemplo), use um
gerenciador de processos como [pm2](https://pm2.keymetrics.io/):

```bash
npm install -g pm2
pm2 start src/server.js --name feed-anuncios
pm2 save
```

## Observações

- O bot usa **polling** (fica perguntando ao Telegram se tem mensagem nova),
  então não precisa de domínio público nem HTTPS — roda em qualquer máquina
  com internet.
- As fotos ficam hospedadas nos servidores do Telegram; o site só salva o
  link (`photo_url`), que expira depois de um tempo. Se quiser manter as
  imagens permanentemente, dá pra baixar o arquivo (`bot.downloadFile`) e
  salvar localmente — posso adicionar isso se precisar.
- Isso só funciona para o conteúdo que chega no grupo/canal **onde você é
  admin/membro**; não acessa nada fora disso.
