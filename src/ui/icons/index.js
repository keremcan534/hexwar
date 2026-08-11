// Birleşik ikon sistemi — tek giriş kapısı.
//
// Depoda ikili dosya yasak (bkz. CLAUDE.md): bütün ikonlar çalışma anında
// üretilen satır-içi SVG'dir. Çizgi tabanlı (stroke) tek üslup kullanılır ki
// sekme çubuğundaki mevcut ikonlarla aynı ailede dursunlar ve currentColor
// üzerinden CSS ile boyansınlar.
//
// Aşama 1: yalnız sözleşme + genel yedek ikonlar. Mal ve tesis ikonlarının
// gerçek çizimleri resources.js / factories.js dosyalarında (aşama 2).

import { RESOURCE_PATHS } from './resources.js';
import { FACTORY_PATHS } from './factories.js';

/** Ortak SVG kabuğu: 24 birimlik kare, çizgi üslubu. */
function shell(inner, viewBox = '0 0 24 24') {
  return `<svg viewBox="${viewBox}" fill="none" stroke="currentColor"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
    aria-hidden="true">${inner}</svg>`;
}

/** Eşleşme yoksa: sandık. Eksik ikon ekranı bozmaz, sadece sıradan görünür. */
const FALLBACK_RESOURCE = '<path d="M4 8h16v11H4z"/><path d="M4 8l2-3h12l2 3M12 8v11M4 13h16"/>';

/** Eşleşme yoksa: dişli — jenerik tesis. */
const FALLBACK_FACTORY = '<circle cx="12" cy="12" r="4"/>'
  + '<path d="M12 5V3M12 21v-2M5 12H3M21 12h-2M7 7 5.6 5.6M18.4 18.4 17 17M7 17l-1.4 1.4M18.4 5.6 17 7"/>';

/** Mal ikonu: küçük, satır içi. */
export function resourceGlyph(goodId) {
  return shell(RESOURCE_PATHS[goodId] ?? FALLBACK_RESOURCE);
}

/**
 * Tesis amblemi: pirinç halka içinde tür glifi. Halka ve zemin CSS'te
 * (.fcard-emblem) çizilir; SVG yalnız glifi taşır ki aynı glif ileride
 * listelerde halkasız da kullanılabilsin.
 */
export function factoryEmblem(typeId) {
  return shell(FACTORY_PATHS[typeId] ?? FALLBACK_FACTORY);
}
