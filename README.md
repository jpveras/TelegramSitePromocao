# Feed de Anúncios (espelho do canal do Telegram na Vercel)

O site é um espelho do canal do Telegram: tudo que é postado no canal
aparece no site, inclusive os posts antigos. Não usa banco de dados, bot
nem token.

## Como funciona

- Todo canal **público** do Telegram tem uma página de prévia em
  `https://t.me/s/<canal>`, com os posts, fotos e datas.
- A rota `/api/ads` lê essa página e devolve os anúncios para o site.
  A CDN da Vercel guarda a resposta por 10 segundos, para muitos
  visitantes não sobrecarregarem o Telegram.
- O site confere a cada 10 segundos se apareceu post novo e o mostra sem
  precisar atualizar a página. O botão "Carregar mais antigos" busca o
  histórico do canal.
- O próprio Telegram é a "base de dados": post editado ou apagado no canal
  aparece editado ou some do site ao recarregar a página.

## O que é necessário

1. **Um canal público.** Precisa ser um *canal* (não grupo) com link
   público, do tipo `t.me/meucanal`. Canal ou grupo privado (link
   `t.me/+...`) não tem página de prévia e não pode ser espelhado.
2. **A prévia do canal ativada.** Já vem ligada nos canais públicos. Para
   conferir, abra `https://t.me/s/meucanal` no navegador: precisa aparecer
   a lista de posts.
3. **Uma variável na Vercel:** em *Settings → Environment Variables*,
   crie `TELEGRAM_CHANNEL` com o nome do canal (ex.: `meucanal`) e faça
   um *Redeploy*.

Antes de configurar, dá para testar qualquer canal público abrindo o site
com `?channel=nome`, por exemplo `https://SEU-SITE.vercel.app/?channel=meucanal`.
Depois que `TELEGRAM_CHANNEL` é definido, o site só mostra esse canal.

## Estrutura

```
api/_lib/channel.js   # lê a página pública do canal e extrai os posts
api/ads.js            # rota usada pelo site
public/index.html     # o site
test/parse.js         # teste offline (npm test)
vercel.json
```
