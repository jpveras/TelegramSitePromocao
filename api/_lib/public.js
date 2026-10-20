// O que vai para o navegador: sem ids internos do Telegram. A foto passa
// pela rota /api/photo, para o token do bot nunca aparecer no site.
function toPublic(ad) {
  return {
    id: ad.id,
    // O DisparaPromo poe espacos invisiveis dentro dos precos ("R$ 1.​029"),
    // o que cortava o preco no site. Remove-os so na exibicao.
    text: ad.text ? ad.text.replace(/[\u200b-\u200d\u2060\ufeff]/g, "") : ad.text,
    posted_at: ad.posted_at,
    // Loja descoberta pelo link (api/_lib/resolve.js); null = ainda nao verificada.
    store: ad.store || null,
    updated_at: ad.updated_at || null,
    // "v=2" invalida a copia em cache das fotos servidas antes com tipo errado.
    photo_url: ad.photo_file_id ? `/api/photo?ad=${ad.id}&v=2` : null,
    // Historico de preco (api/_lib/history.js): o que se sabia antes deste anuncio.
    ph: ad.ph || null,
    // Visitantes avisaram que a oferta/cupom acabou (3 avisos ou mais).
    ended: ad.ended_reported ? true : undefined,
  };
}

module.exports = { toPublic };
