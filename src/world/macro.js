// Makro dünya şablonu: kıtalar saf gürültü değil, silindir üzerinde ROL
// atanmış kara çekirdekleri. Gürültü yalnız kıyıları/organik dokuyu verir;
// stratejik iskelet (yoğun-batı, kuzey imparatorluğu, kavşak, doğu devi,
// yarımada kolonisi, güney kıtası, ada zincirleri) her tohumda korunur.
//
// Tohum başına: küresel boylam döndürmesi + blob başına jitter — dünyalar
// birbirine benzemez ama arketip coğrafya hep okunur. Tasarım: docs/makro-dunya.md
//
// Katman notu: saf matematik/veri; DOM'suz, game'siz.

import { makeRng } from '../core/rng.js';

/** Dairesel boylam farkı: en kısa yay, [-0.5, 0.5]. */
export function wrapDelta(du) {
  return du - Math.round(du);
}

/**
 * Kara çekirdekleri. u/v merkez, ru/rv yarıçap (harita payı), w ağırlık
 * (negatif = deniz oyar: iç deniz, körfez). jitter blob başına oynama payı.
 */
const BLOBS = [
  // --- Yeni Dünya ---
  { zone: 'yeni-kuzey', u: 0.245, v: 0.30, ru: 0.100, rv: 0.165, w: 1.05, jitter: 0.02 },
  { zone: 'kistak', u: 0.272, v: 0.475, ru: 0.024, rv: 0.055, w: 0.85, jitter: 0.012 },
  { zone: 'yeni-guney', u: 0.30, v: 0.645, ru: 0.062, rv: 0.145, w: 1.0, jitter: 0.018 },
  { zone: 'korsan-adalari', u: 0.215, v: 0.50, ru: 0.030, rv: 0.030, w: 0.42, jitter: 0.02, scatter: true },
  // --- Eski Dünya ---
  { zone: 'yogun-bati', u: 0.475, v: 0.295, ru: 0.075, rv: 0.115, w: 1.05, jitter: 0.015 },
  { zone: 'kuzey-bozkiri', u: 0.665, v: 0.165, ru: 0.175, rv: 0.105, w: 1.0, jitter: 0.02 },
  { zone: 'kavsak', u: 0.565, v: 0.445, ru: 0.052, rv: 0.095, w: 0.95, jitter: 0.012 },
  { zone: 'dogu-ovasi', u: 0.845, v: 0.44, ru: 0.105, rv: 0.135, w: 1.05, jitter: 0.02 },
  { zone: 'guney-yarimada', u: 0.70, v: 0.585, ru: 0.052, rv: 0.105, w: 0.95, jitter: 0.015 },
  { zone: 'dogu-adalari', u: 0.965, v: 0.335, ru: 0.024, rv: 0.080, w: 0.72, jitter: 0.02, scatter: true },
  // --- Güney kıtası (kuzey omzu iç denizin güney duvarını örer) ---
  { zone: 'guney-kita', u: 0.49, v: 0.675, ru: 0.090, rv: 0.160, w: 1.05, jitter: 0.015 },
  // --- Deniz oymaları ---
  { zone: 'ic-deniz', u: 0.515, v: 0.44, ru: 0.044, rv: 0.046, w: -1.5, jitter: 0.008 },
  { zone: 'sicak-korfez', u: 0.615, v: 0.545, ru: 0.040, rv: 0.048, w: -0.9, jitter: 0.012 },
  // --- Ada zinciri: Büyük Okyanus'u köprüleyen basamaklar ---
  { zone: 'baharat-adalari', u: 0.955, v: 0.60, ru: 0.020, rv: 0.028, w: 0.40, jitter: 0.02, scatter: true },
  { zone: 'baharat-adalari', u: 0.035, v: 0.635, ru: 0.020, rv: 0.028, w: 0.38, jitter: 0.02, scatter: true },
  { zone: 'baharat-adalari', u: 0.10, v: 0.60, ru: 0.018, rv: 0.024, w: 0.36, jitter: 0.02, scatter: true },
];

/** Aşılmaz sıradağ şeritleri: (u1,v1)-(u2,v2), genişlik, yükseklik itmesi. */
const RIDGES = [
  // Yarımadayı doğu ovasından koparan yay (Himalaya işlevi).
  { zone: 'yarimada-seddi', u1: 0.655, v1: 0.505, u2: 0.765, v2: 0.49, width: 0.014, h: 1.45 },
  // Güney yeni dünyanın batı kıyı sırtı (And işlevi).
  { zone: 'bati-sirti', u1: 0.262, v1: 0.53, u2: 0.276, v2: 0.775, width: 0.010, h: 1.1 },
  // Bozkırı yoğun-batıdan yumuşakça ayıran alçak sırt (Ural işlevi).
  { zone: 'bozkir-ayraci', u1: 0.585, v1: 0.10, u2: 0.605, v2: 0.30, width: 0.008, h: 0.65 },
];

/**
 * Bölge kuralları: province boyu (kıyı/iç), nüfus çarpanı, gelişim kademesi.
 * Boy hedefi bölünme kotasıdır; sınır/iç bölge iri province'lerle okunur kalır.
 */
export const ZONE_RULES = {
  'yogun-bati': { size: [4, 5], popMul: 1.6, dev: 2 },
  'dogu-adalari': { size: [4, 4], popMul: 1.3, dev: 2 },
  'kavsak': { size: [6, 7], popMul: 1.3, dev: 1 },
  // İri province: koloni sayısı yönetilebilir kalsın, nüfus çarpanı devleşsin.
  'guney-yarimada': { size: [8, 10], popMul: 2.6, dev: 0 },
  'dogu-ovasi': { size: [6, 8], popMul: 3.0, dev: 0 },
  'yeni-guney': { size: [7, 10], popMul: 0.8, dev: 0 },
  'yeni-kuzey': { size: [8, 13], popMul: 0.55, dev: 1 },
  'kistak': { size: [5, 6], popMul: 0.8, dev: 0 },
  'korsan-adalari': { size: [3, 3], popMul: 0.8, dev: 0 },
  'baharat-adalari': { size: [3, 3], popMul: 0.9, dev: 0 },
  'kuzey-bozkiri': { size: [11, 15], popMul: 0.6, dev: 0 },
  'guney-kita': { size: [9, 15], popMul: 0.7, dev: 0 },
  'acik-deniz': { size: [5, 8], popMul: 0.6, dev: 0 },
};

/** Bölgesiz (başıboş gürültü adası) kareler için varsayılan. */
export const DEFAULT_ZONE = 'acik-deniz';

/**
 * Arketip ülke planı. Sıra yerleşim önceliğidir: büyükler yer kapar,
 * küçükler kalan dokuyu doldurur. provinces = çekirdek hedefi (küme).
 */
export function archetypePlan(rng) {
  return [
    {
      role: 'denizci-imparatorluk', zone: 'yogun-bati', coastal: true,
      provinces: rng.int(14, 18), dev: 2, extraCity: true,
      // Yarımadanın ~üçte biri: 15-25 koloni province'i — yönetilebilir ama
      // nüfus çarpanıyla imparatorluğun ekonomik bel kemiği.
      colony: { zone: 'guney-yarimada', share: 0.3 },
      bases: { zone: 'baharat-adalari', provinces: 2 },
    },
    {
      role: 'dogu-devi', zone: 'dogu-ovasi',
      provinces: rng.int(24, 32), dev: 0, extraCity: true,
    },
    {
      role: 'kuzey-imparatorlugu', zone: 'kuzey-bozkiri',
      provinces: rng.int(26, 34), dev: 0, extraCity: true, acceptNeighbors: 1,
    },
    {
      role: 'bilesik-monarsi', zone: 'yogun-bati',
      provinces: rng.int(14, 20), dev: 1, extraCity: true, acceptNeighbors: 2,
    },
    {
      role: 'kavsak-imparatorlugu', zone: 'kavsak',
      provinces: rng.int(12, 18), dev: 1, acceptNeighbors: 1,
    },
    {
      role: 'yeni-federasyon', zone: 'yeni-kuzey', coastal: true,
      provinces: rng.int(10, 16), dev: 1, extraCity: true,
    },
    {
      role: 'ada-modernlesicisi', zone: 'dogu-adalari',
      provinces: rng.int(5, 8), dev: 2,
    },
    {
      role: 'dogu-kralligi', zone: 'dogu-ovasi',
      provinces: rng.int(5, 9), dev: 0,
    },
    // Devin gölgesindeki beylikler: haraç kuşağı, ileride nüfuz sahası.
    ...Array.from({ length: 2 }, () => ({
      role: 'dogu-beyligi', zone: 'dogu-ovasi', provinces: rng.int(3, 6), dev: 0,
    })),
    // Doku ülkeleri: rol adı taşımazlar, bölgesel çeşitliliği verirler.
    ...Array.from({ length: rng.int(4, 6) }, () => ({
      role: 'guney-cumhuriyeti', zone: 'yeni-guney', provinces: rng.int(5, 9), dev: 0,
    })),
    ...Array.from({ length: rng.int(7, 10) }, () => ({
      role: 'bati-devleti', zone: 'yogun-bati', provinces: rng.int(3, 12), dev: 1,
    })),
    ...Array.from({ length: rng.int(3, 4) }, () => ({
      role: 'kiyi-kralligi', zone: 'guney-kita', coastal: true, provinces: rng.int(4, 7), dev: 0,
    })),
    {
      role: 'yarimada-beyligi', zone: 'guney-yarimada', provinces: rng.int(3, 6), dev: 0,
    },
    // Bozkırın güney ucunda hanlık: kuzey devinin yumuşak karnı.
    {
      role: 'bozkir-hanligi', zone: 'kuzey-bozkiri', provinces: rng.int(4, 7), dev: 0,
    },
    // Kıstağın kapı bekçisi: ince köprünün stratejik sahibi.
    {
      role: 'kistak-devleti', zone: 'kistak', provinces: rng.int(2, 4), dev: 0,
    },
  ];
}

/** Bölge başına kültür sayısı: kimlik dokusunun yoğunluğu. */
export const ZONE_CULTURES = {
  'yogun-bati': 3,
  'kuzey-bozkiri': 2,
  'kavsak': 2,
  'dogu-ovasi': 2,
  'guney-yarimada': 2,
  'yeni-kuzey': 1,
  'yeni-guney': 2,
  'guney-kita': 4,
  'dogu-adalari': 1,
  'kistak': 1,
  'baharat-adalari': 1,
  'korsan-adalari': 1,
};

export function makeMacro(seed) {
  const rng = makeRng(`${seed}-macro`);
  // Küresel döndürme: dikiş her dünyada başka bir okyanusa düşer; haritanın
  // "sol kenarı" diye bir kavram kalmaz.
  const rotate = rng.range(0, 1);
  const blobs = BLOBS.map((blob) => ({
    ...blob,
    u: (blob.u + rng.range(-blob.jitter, blob.jitter) + rotate + 1) % 1,
    v: blob.v + rng.range(-blob.jitter, blob.jitter) * 0.7,
    ru: blob.ru * rng.range(0.88, 1.12),
    rv: blob.rv * rng.range(0.88, 1.12),
  }));
  const ridges = RIDGES.map((ridge) => ({
    ...ridge,
    u1: (ridge.u1 + rotate) % 1,
    u2: (ridge.u2 + rotate) % 1,
  }));

  const field = (blob, u, v) => {
    const du = wrapDelta(u - blob.u) / blob.ru;
    const dv = (v - blob.v) / blob.rv;
    const s = du * du + dv * dv;
    return blob.w * Math.exp(-(s ** 1.15));
  };

  /** Nokta-doğru parçası mesafesi, u sarmalı. */
  const ridgeField = (ridge, u, v) => {
    const du = wrapDelta(u - ridge.u1);
    const su = wrapDelta(ridge.u2 - ridge.u1);
    const sv = ridge.v2 - ridge.v1;
    const dv = v - ridge.v1;
    const len2 = su * su + sv * sv;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (du * su + dv * sv) / len2)) : 0;
    const px = du - su * t;
    const py = dv - sv * t;
    const d = Math.hypot(px, py) / ridge.width;
    return ridge.h * Math.exp(-(d * d));
  };

  return {
    rotate,
    /** Kara maskesi: pozitif bloblar toplanır, deniz oymaları düşer. */
    mask(u, v) {
      let sum = 0;
      for (const blob of blobs) sum += field(blob, u, v);
      return sum;
    },
    /** Sıradağ itmesi: yüzdelik sıralamada tepeye taşır (aşılmaz zincir). */
    ridge(u, v) {
      let sum = 0;
      for (const ridge of ridges) sum += ridgeField(ridge, u, v);
      return sum;
    },
    /** En güçlü POZİTİF blobun bölgesi; hiçbiri hissedilmiyorsa açık deniz. */
    zoneOf(u, v) {
      let best = null;
      let bestField = 0.04; // eşik: okyanus ortası gürültü adası "bölgesiz" kalır
      for (const blob of blobs) {
        if (blob.w <= 0) continue;
        const f = field(blob, u, v);
        if (f > bestField) {
          bestField = f;
          best = blob.zone;
        }
      }
      return best ?? DEFAULT_ZONE;
    },
    /**
     * Bölge çapaları (jitter+döndürme sonrası) — ülke yerleşimi ve denetim
     * bunları arar. Deniz oymaları da dahildir (iç deniz testi kullanır).
     */
    anchors() {
      const out = {};
      for (const blob of blobs) {
        // Aynı bölgenin çok blobu varsa (ada zinciri) ilk çapa yeter.
        if (!out[blob.zone]) out[blob.zone] = { u: blob.u, v: blob.v };
      }
      return out;
    },
  };
}
