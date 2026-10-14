// Leitura do texto padrao do DisparaPromo no servidor (mesmas regras do
// site em public/index.html), usada na pagina de cada oferta.

function clean(text) {
  return (text || "").replace(/[​-‍⁠﻿]/g, "");
}

function extractUrl(text) {
  const m = (text || "").match(/https?:\/\/[^\s]+/i);
  return m ? m[0] : null;
}

function extractPrices(text) {
  if (!text) return { now: null, old: null };
  const oldM = text.match(/\bDe\s*R\$\s?([\d.,]*\d)/i);
  const nowM = text.match(/💰\s*R\$\s?([\d.,]*\d)/u);
  if (nowM) return { now: `R$ ${nowM[1]}`, old: oldM ? `R$ ${oldM[1]}` : null };
  const all = [...text.matchAll(/R\$\s?([\d.,]*\d)/g)].map((m) => `R$ ${m[1]}`);
  if (all.length === 0) return { now: null, old: null };
  if (all.length === 1) return { now: all[0], old: null };
  return { old: all[0], now: all[1] };
}

function parseBRL(value) {
  if (!value) return null;
  const n = Number(value.replace(/[^\d,.]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractDiscount(text, oldPrice, nowPrice) {
  const o = parseBRL(oldPrice), n = parseBRL(nowPrice);
  if (o && n && o > n) return Math.round((1 - n / o) * 100);
  const m = (text || "").match(/(\d{1,2})\s?%\s*(?:de\s*desconto|off)/i);
  return m ? Number(m[1]) : null;
}

function extractRating(text) {
  const m = (text || "").match(/avalia[cç][aã]o[^\d\n]{0,8}(\d(?:[.,]\d)?)/i);
  const r = m ? Number(m[1].replace(",", ".")) : 0;
  return r > 0 ? r.toFixed(1) : null;
}

function extractCoupon(text) {
  const m = (text || "").match(/cupom\s*:\s*([A-Za-z0-9][A-Za-z0-9_-]{2,40})/i);
  return m ? m[1].toUpperCase() : null;
}

function extractPayment(text) {
  const t = text || "";
  const pix = /\bno\s+pix\b/i.test(t);
  // Exige "de R$" ou "sem juros" depois do "Nx" (evita medidas como "30 x 40 cm").
  const inst = t.match(/(\d{1,2})\s?x\s*(?:de\s*R\$\s?[\d.,]*\d(?:\s*(sem\s+juros))?|(sem\s+juros))/i);
  let installments = null;
  if (inst && Number(inst[1]) >= 2) installments = inst[2] || inst[3] ? `${inst[1]}x sem juros` : `até ${inst[1]}x`;
  return { pix, installments };
}

function extractName(text) {
  const lines = (text || "").split("\n");
  const fire = lines.find((l) => /^\s*🔥/u.test(l));
  const name = fire ? fire.replace(/^\s*🔥\s*/u, "") : lines.find((l) => l.trim()) || "Oferta";
  return name.trim().slice(0, 160);
}

function describe(ad) {
  const text = clean(ad.text);
  const { now, old } = extractPrices(text);
  return {
    name: extractName(text),
    url: extractUrl(text),
    now,
    old,
    discount: extractDiscount(text, old, now),
    rating: extractRating(text),
    coupon: extractCoupon(text),
    ...extractPayment(text),
  };
}

module.exports = { describe, clean, extractPayment };
