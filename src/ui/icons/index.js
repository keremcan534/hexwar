// Birleşik ikon sistemi — tek giriş kapısı.
//
// Mal ikonlarının kanonik kaynağı boyalı madalyon seti (assets/icons/
// resources). Boyası olmayan mal, sekme çubuğuyla aynı ailedeki çizgi-SVG
// yedeğe düşer; o da yoksa sandık. Eksik ikon ekranı asla bozmaz.
//
// Tesis amblemi ayrı bir sanat seti DEĞİLDİR: tesisin kimliği ürettiği
// maldır (Steel Mill = çelik madalyonu). Bu tercih iki iş görür — amblem
// veriden türer (yeni tesis eklemek sanat istemez) ve kart, referanstaki
// gibi boyalı bir madalyonla açılır. Ürünü boyasız tesis tür glifine düşer.

import { RESOURCE_ART, RESOURCE_PATHS, RINGED_ART } from './resources.js';
import { FACTORY_PATHS } from './factories.js';

const ART_BASE = 'assets/icons/resources';

/** Ortak SVG kabuğu: 24 birimlik kare, çizgi üslubu. */
function shell(inner, viewBox = '0 0 24 24') {
  return `<svg viewBox="${viewBox}" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${inner}</svg>`;
}

/** Eşleşme yoksa: sandık. */
const FALLBACK_RESOURCE = '<path d="M4 8h16v11H4z"/><path d="M4 8l2-3h12l2 3M12 8v11M4 13h16"/>';

/** Eşleşme yoksa: dişli — jenerik tesis. */
const FALLBACK_FACTORY = '<circle cx="12" cy="12" r="4"/>'
  + '<path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M7 7 5.6 5.6M18.4 18.4 17 17M7 17l-1.4 1.4M18.4 5.6 17 7"/>';

/** Bu malın boyalı madalyonu var mı? (Kart, halka çizimini buna göre seçer.) */
export function hasResourceArt(goodId) {
  return Boolean(RESOURCE_ART[goodId]);
}

/**
 * Halkası sanatın içinde mi? Paket 1 madalyonları kendi pirinç halkasını
 * taşır; paket 2 nesneleri halkasızdır ve CSS halkasının içine oturur.
 */
export function resourceArtRinged(goodId) {
  return RINGED_ART.has(goodId);
}

/** Mal ikonu: boyalı madalyon ya da çizgi-SVG. Satır içi kullanım. */
export function resourceGlyph(goodId) {
  const art = RESOURCE_ART[goodId];
  if (art) return `<img src="${ART_BASE}/${art}.png" alt="" loading="lazy" decoding="async">`;
  return shell(RESOURCE_PATHS[goodId] ?? FALLBACK_RESOURCE);
}

/**
 * Tesis amblemi: önce ürünün boyalı madalyonu, sonra tesis tür glifi.
 * outputId'yi kart verir; icons katmanı oyun tablolarını bilmez.
 */
export function factoryEmblem(typeId, outputId = null) {
  if (outputId && RESOURCE_ART[outputId]) return resourceGlyph(outputId);
  const glyph = FACTORY_PATHS[typeId]
    ?? (outputId ? RESOURCE_PATHS[outputId] : null)
    ?? FALLBACK_FACTORY;
  return shell(glyph);
}
