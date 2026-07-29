// Prosedürel bayraklar. Gerçek kokartların dilbilgisi taklit edilir
// (bantlar, haç, yıldız, köşe kantonu) ama içerik ülkenin renginden türer;
// böylece rastgele üretilen dünyaya sabit tarihî sembol yamamayız.
//
// Bu dosya sadece tarif üretir; çizim `render/flagPainter.js` işidir.

/** Bant/şekil düzenleri. Ağırlıklar gerçek bayrak dağılımını kabaca taklit eder. */
const PATTERNS = [
  'triband-v', 'triband-v', 'triband-h', 'triband-h',
  'bicolor-h', 'bicolor-v',
  'cross', 'nordic-cross',
  'star', 'star-band',
  'canton', 'diagonal',
];

/** Kromatik renklerin arasına giren nötrler: küçük boyutta okunurluğu bunlar sağlar. */
const NEUTRALS = ['#f4f4f0', '#f4f4f0', '#141c26', '#e8c34a'];

function hsl(h, s, l) {
  return `hsl(${Math.round(((h % 360) + 360) % 360)} ${Math.round(s)}% ${Math.round(l)}%)`;
}

/**
 * Ülkenin renk kimliğinden bayrak tarifi üretir.
 * @param {ReturnType<import('../core/rng.js').makeRng>} rng
 * @param {{hue:number, sat:number, light:number}} base
 */
export function makeFlag(rng, base) {
  const pattern = rng.pick(PATTERNS);
  const primary = hsl(base.hue, base.sat, base.light);
  // İkincil renk: ya tamamlayıcı ya da yakın ton — ikisi de gerçek bayraklarda var.
  const shift = rng.chance(0.5) ? 150 + rng.range(-30, 30) : 30 + rng.range(-15, 15);
  const secondary = hsl(base.hue + shift, base.sat - 8, base.light + rng.range(-8, 8));
  const neutral = rng.pick(NEUTRALS);

  // Nötrü ortaya koymak (Fransa/İtalya düzeni) küçük boyutta en okunur sonucu veriyor.
  const colors = rng.chance(0.6)
    ? [primary, neutral, secondary]
    : [neutral, primary, secondary];

  return {
    pattern,
    colors,
    /** Yıldız/haç gibi motiflerin rengi; zeminle çakışmasın diye ayrı seçilir. */
    emblem: rng.pick([neutral, '#f4f4f0', '#e8c34a']),
  };
}
