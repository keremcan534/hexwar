// Prosedürel bayraklar. Gerçek bayrakların dilbilgisi taklit edilir
// (bantlar, haç, kanton, üçgen, arma, taç) ama içerik ülkenin renginden ve
// unvanından türer; rastgele dünyaya sabit tarihî sembol yamanmaz.
//
// DÜNYA AKIŞINA DOKUNULMAZ: tarif dünya RNG'sinden HER ZAMAN tam yedi sayı
// çeker (eski sürümle aynı). Bayrak bu akışın ortasında üretilir; bir çekiş
// fazla ya da eksik olsa sonraki her şey (isimler, kültürler, sınırlar)
// kayardı. Ek çeşitlilik (arma türü, ince şerit, şerit sayısı) bu yedi
// sayıdan tohumlanan YEREL bir akıştan gelir.
//
// Bu dosya sadece tarif üretir; çizim `render/flagPainter.js` işidir. Eski
// kayıtlardaki tarifler (yalnız pattern/colors/emblem) aynen çizilir.

import { makeRng } from '../core/rng.js';

/** Bant/şekil düzenleri. Ağırlıklar gerçek bayrak dağılımını kabaca taklit eder. */
const PATTERNS = [
  'triband-v', 'triband-v', 'triband-h', 'triband-h', 'triband-wide',
  'bicolor-h', 'bicolor-v',
  'cross', 'nordic-cross', 'saltire',
  'canton', 'stripes', 'hoist-triangle', 'bend',
  'bordure', 'quartered', 'disc', 'star-band',
];

/**
 * Nötrler: ağartılmamış keten beyazı, is siyahı, sırma altın. Saf beyaz ve
 * saf sarı boyalı kumaşta "ekran" gibi durur.
 */
const WHITE = '#eee8d8';
const BLACK = '#1d1e22';
const GOLD = '#d3a33c';
const NEUTRALS = [WHITE, WHITE, BLACK, GOLD];

/** Taç taşıyan unvanlar; cumhuriyetler yıldız, güneş ve çelenk sever. */
const CROWNED = /Kingdom|Empire|Principality|Duchy|Khanate|Emirate/;
const CRESCENT = /Khanate|Emirate/;

function hsl(h, s, l) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

/**
 * Harita mürekkebinden bayrak boyasına: aynı ton, daha doygun ve koyu.
 * Harita paleti bilinçli olarak soluk (atlas baskısı); bayrak kumaşı ise
 * boyanır — soluk pastel bayrak "silik çıktı" gibi duruyordu. Dönemin
 * boyaları neon değildir: sarı hardala, yeşil koyu çuha yeşiline iner
 * (açık ve doygun kalınca ekranda fosforlu duruyorlardı).
 */
function dye(hue, sat, light) {
  const h = ((hue % 360) + 360) % 360;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  // Sarı dar tutulur: 58°'den sonrası (limon/chartreuse) yeşil boyaya iner.
  const yellow = h >= 38 && h <= 58;
  const green = h > 58 && h < 165;
  const s = clamp(sat * 1.15 + 14, 44, yellow ? 62 : green ? 50 : 64);
  const l = yellow ? clamp(light, 46, 52) : green ? clamp(light - 12, 26, 35) : clamp(light - 9, 28, 40);
  return hsl(h, s, l);
}

/** Göreli parlaklık (0..1): yalnız bu dosyanın ürettiği hsl ve #hex biçimleri. */
export function luminance(color) {
  let r; let g; let b;
  const m = /^hsl\((-?[\d.]+) ([\d.]+)% ([\d.]+)%\)$/.exec(color);
  if (m) {
    const h = Number(m[1]) / 360; const s = Number(m[2]) / 100; const l = Number(m[3]) / 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const ch = (t) => {
      const u = ((t % 1) + 1) % 1;
      if (u < 1 / 6) return p + (q - p) * 6 * u;
      if (u < 0.5) return q;
      if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
      return p;
    };
    [r, g, b] = [ch(h + 1 / 3), ch(h), ch(h - 1 / 3)];
  } else {
    const n = parseInt(String(color).slice(1), 16) || 0;
    [r, g, b] = [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a, b) {
  const la = luminance(a); const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Motif zeminden okunmuyorsa en okunur nötre döner. */
function legible(color, field) {
  if (contrast(color, field) >= 2.4) return color;
  return [GOLD, WHITE, BLACK].sort((x, y) => contrast(y, field) - contrast(x, field))[0];
}

/** Haç gibi tek renkli çizgi taşıyan desenler: ince şerit bu çizgiyi kenarlar. */
const LINED = new Set(['cross', 'nordic-cross', 'saltire', 'bend']);

/** Desen → motifin oturduğu zemin rengi indeksi ve motif olasılığı. */
const CHARGE_SPOT = {
  'triband-v': { field: 1, chance: 0.55 },
  'triband-h': { field: 1, chance: 0.45 },
  'triband-wide': { field: 1, chance: 0.85 },
  'bicolor-h': { field: 0, chance: 0.3 },
  'bicolor-v': { field: 0, chance: 0.3 },
  canton: { field: 0, chance: 1 },
  stripes: { field: 2, chance: 1 },
  'hoist-triangle': { field: 0, chance: 0.8 },
  bordure: { field: 1, chance: 1 },
  quartered: { field: 1, chance: 0.35 },
  disc: { field: 0, chance: 0.25 },
};

function pickCharge(local, title, small) {
  const crowned = CROWNED.test(title ?? '');
  const table = small
    // Kanton ve üçgen gibi dar yerde ayrıntılı arma okunmaz.
    ? (crowned ? ['star', 'crown', 'crown', 'sun', 'cross-pattee'] : ['star', 'star', 'sun', 'star-ring', 'cross-pattee'])
    : (crowned
      ? ['arms', 'arms', 'arms', 'crown', 'crown', 'star', 'sun', 'cross-pattee', 'wreath']
      : ['star', 'star', 'sun', 'wreath', 'wreath', 'arms', 'star-ring', 'cross-pattee']);
  if (CRESCENT.test(title ?? '') && local.chance(0.6)) return 'crescent';
  return local.pick(table);
}

/**
 * Ülkenin renk kimliğinden bayrak tarifi üretir.
 * @param {ReturnType<import('../core/rng.js').makeRng>} rng dünya akışı — tam 7 çekiş
 * @param {{hue:number, sat:number, light:number}} base
 * @param {string} [title] ülke unvanı (Kingdom, Republic…): arma türünü seçer
 */
export function makeFlag(rng, base, title = '') {
  // --- Dünya akışı: yedi çekiş, sırası ve sayısı sabit. ---
  const u = [];
  const draw = () => { const value = rng(); u.push(value); return value; };
  const pattern = PATTERNS[Math.floor(draw() * PATTERNS.length)];
  const complementary = draw() < 0.5;
  const shift = complementary ? 150 + (draw() * 60 - 30) : 30 + (draw() * 30 - 15);
  const lightJitter = draw() * 16 - 8;
  const neutral = NEUTRALS[Math.floor(draw() * NEUTRALS.length)];
  const neutralFirst = draw() >= 0.6;
  const emblemDraw = draw();

  // --- Yerel akış: bu yedi sayıdan tohumlanır, dünyayı etkilemez. ---
  const local = makeRng(u.reduce((h, value) => Math.imul(h ^ Math.floor(value * 4294967296), 16777619) >>> 0, 2166136261) || 1);

  const primary = dye(base.hue, base.sat, base.light);
  const secondary = dye(base.hue + shift, base.sat - 8, base.light + lightJitter);
  // Nötrü ortaya koymak (Fransa/İtalya düzeni) küçük boyutta en okunur sonucu veriyor.
  const colors = neutralFirst ? [neutral, primary, secondary] : [primary, neutral, secondary];

  const spot = CHARGE_SPOT[pattern];
  const small = pattern === 'canton' || pattern === 'stripes' || pattern === 'hoist-triangle';
  const charge = spot && local.chance(spot.chance) ? pickCharge(local, title, small) : null;
  // Motifin (ya da haç/yıldız bandının) oturduğu zemin; okunurluk ona göre.
  const field = colors[spot ? spot.field : pattern === 'star-band' ? 2 : 0];
  const emblem = legible([neutral, WHITE, GOLD][Math.floor(emblemDraw * 3)], field);
  let fimbria = local.chance(0.32) ? (luminance(colors[0]) > 0.5 ? BLACK : WHITE) : null;
  // Haç/çapraz/bant ince şeritle kenarlanınca şerit haçla aynı renge düşebilir
  // (beyaz haça beyaz kenar: görünmez). O zaman Norveç düzeni: kenar nötr
  // kalır, haç ikincil renge geçer; o da zeminden okunmuyorsa şerit düşer.
  let ink = emblem;
  if (fimbria && fimbria === emblem && LINED.has(pattern)) {
    if (contrast(colors[2], colors[0]) >= 1.8) ink = colors[2];
    else fimbria = null;
  }

  return {
    pattern,
    colors,
    /** Yıldız/haç gibi motiflerin rengi; zeminle çakışmasın diye ayrı seçilir. */
    emblem,
    charge,
    // Armanın kalkanı: iki renk ve bölünüş; çerçevesi sırma.
    shield: charge === 'arms'
      ? {
        colors: local.chance(0.5) ? [secondary, WHITE] : [primary, GOLD],
        division: local.pick(['pale', 'fess', 'bend', 'plain']),
        crown: CROWNED.test(title ?? ''),
      }
      : null,
    // İnce ayırıcı şerit (Norveç, Güney Afrika): bantlar ve haç kenarı.
    fimbria,
    /** Haç, çapraz ve bant rengi (yoksa emblem). */
    ink,
    stripes: pattern === 'stripes' ? local.pick([5, 7, 9, 11]) : 0,
  };
}
