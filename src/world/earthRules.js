// EARTH bölge kuralları: macro.ZONE_RULES'un Earth'e kalibre edilmiş hâli.
//
// Roller (arketip boyları, doldurma devletleri) PROVINCE sayısıyla, nüfus
// ağırlıkları bölge çarpanıyla yazılıdır ve prosedürel şablonun alanlarına
// göre dengelendi. Earth'te bölgelerin kara alanı farklıdır: Sibirya ve
// Kanada Miller şişmesiyle dev, Hindistan ve Japonya küçük, Avrupa mercekle
// büyük. Ayar olmadan Hindistan kolonisi 6 province kalıyor, doğu devi
// Avrupa'nın 1.5 katı nüfusa ulaşamıyordu (audit:world -- --earth).
//
// Değerler ELLE YAZILMAZ: scripts/earth/calibrate-earth.mjs prosedürel
// standart dünyayı ölçer (bölge başına province sayısı ve nüfus) ve Earth'te
// aynı sayıyı veren boyu ve çarpanı buraya yazar. Mercekle bilerek büyütülen
// Avrupa ve Anadolu (yogun-bati, kavsak) prosedürel kuralda kalır: daha çok
// province taşımaları istenen ayrıntıdır.
//
// Katman notu: saf veri; DOM'suz.

import { ZONE_RULES } from './macro.js';

/** Bölge başına üzerine yazılan alanlar ({ size, popMul }). */
// scripts/earth/calibrate-earth.mjs: 8 prosedürel, 4 Earth tohumu.
// Satır sonu: prosedürel → Earth (province sayısı, bölge nüfusu).
export const EARTH_ZONE_OVERRIDES = {
  'baharat-adalari': { size: [3, 3], popMul: 0.95 }, // province 15→23, nüfus 3M→3M
  'dogu-adalari': { size: [2, 2], popMul: 9.43 }, // province 26→7, nüfus 8M→8M
  'dogu-ovasi': { size: [2, 2], popMul: 5.56 }, // province 95→83, nüfus 102M→103M
  'guney-kita': { size: [3, 5], popMul: 1.83 }, // province 113→109, nüfus 46M→46M
  'guney-yarimada': { size: [2, 3], popMul: 5.26 }, // province 45→41, nüfus 51M→51M
  'kistak': { size: [2, 2], popMul: 1.75 }, // province 22→15, nüfus 5M→5M
  'kuzey-bozkiri': { size: [21, 29], popMul: 0.34 }, // province 70→69, nüfus 22M→22M
  'yeni-guney': { size: [5, 7], popMul: 1.08 }, // province 70→68, nüfus 25M→24M
  'yeni-kuzey': { size: [12, 20], popMul: 0.42 }, // province 100→103, nüfus 24M→24M
};

/**
 * Kural sürümü: kayıt genOptions.earthRules ile taşır (provinces-gen'in
 * provinceGen deseni). 1 = 7d67c86'nın Earth'ü (kalibrasyonsuz ZONE_RULES,
 * kutup çölü yok); 2 = yukarıdaki kalibrasyon + kutup çölü (earthTerrain).
 * Sürüm 1 o commit'le başlamış kampanyayı birebir aynı kurar.
 */
export const EARTH_RULES_LATEST = 2;

/** Sürümün üzerine yazımları; bilinmeyen sürüm en yenisidir. */
export function earthOverridesFor(version = EARTH_RULES_LATEST) {
  return version >= 2 ? EARTH_ZONE_OVERRIDES : {};
}

/** ZONE_RULES + Earth üzerine yazımları (bölge başına alan alan birleşir). */
export function earthZoneRules(overrides = EARTH_ZONE_OVERRIDES) {
  const out = {};
  for (const [zone, rule] of Object.entries(ZONE_RULES)) out[zone] = { ...rule, ...(overrides[zone] ?? {}) };
  return out;
}
