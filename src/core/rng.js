// Deterministik rastgelelik. Aynı seed -> aynı dünya.

export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: hızlı, kaliteli, 32-bit seed'li PRNG. */
export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 1;
  const rng = function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.int = (min, max) => min + Math.floor(rng() * (max - min + 1));
  rng.range = (min, max) => min + rng() * (max - min);
  rng.chance = (p) => rng() < p;
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  // Uzun omurlu bir akis (tur zari) kaydedilebilmeli. Durum tek bir 32-bit
  // tamsayidir; yazilmazsa yuklenen oyun zarlari bastan atmaya baslar ve
  // kesintisiz devam eden oyundan ayrilir (olculdu: 100 hafta sonra farkli
  // savaslar, farkli nufus).
  rng.state = () => a | 0;
  rng.seedState = (value) => { a = (Number(value) | 0) || 1; };
  return rng;
}

/** Okunabilir rastgele seed (paylaşılabilir olsun diye kısa). */
export function randomSeed() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
