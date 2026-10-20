// Hareket eğrileri. Doğrusal hareket "amatör" görünür; burada her şey ya
// güçlü yavaşlamayla oturur ya da küçük bir taşmayla yaylanır.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, x) => clamp((x - a) / (b - a));
export const mix = lerp;

export const linear = (t) => t;
export const inQuad = (t) => t * t;
export const outQuad = (t) => 1 - (1 - t) * (1 - t);
export const inCubic = (t) => t * t * t;
export const outCubic = (t) => 1 - Math.pow(1 - t, 3);
export const inOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const outQuart = (t) => 1 - Math.pow(1 - t, 4);
export const inQuart = (t) => t * t * t * t;
export const outQuint = (t) => 1 - Math.pow(1 - t, 5);
export const inOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const outExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const inExpo = (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10));
export const inOutExpo = (t) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2;
export const inOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
// Ağır kamera: yavaş kalkış, uzun süzülüş — "EMPIRE" dili.
export const heavy = (t) => inOutQuint(clamp(t));
// Küçük taşma: tipografi ve panel girişleri.
export const outBack = (t, s = 1.25) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2);

// Kritik sönümlü-alt yay: 0'dan 1'e, hafif taşma ile oturur.
export function spring(t, { freq = 2.2, damp = 0.55 } = {}) {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * freq;
  return 1 - Math.exp(-damp * w * t) * Math.cos(w * Math.sqrt(1 - damp * damp) * t);
}

// t'yi [a,b] aralığında 0..1'e çevirip eğri uygular.
export const seg = (t, a, b, ease = linear) => ease(invLerp(a, b, t));

// Tekrarlanabilir sözde rastgele (parçacıklar karede aynı kalsın diye).
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// Kamera sarsıntısı: çok frekanslı, zamanla sönen; rastgele değil deterministik.
export function shake(t, amp, decay = 6) {
  if (t < 0) return [0, 0, 0];
  const k = amp * Math.exp(-decay * t);
  return [
    k * (Math.sin(t * 71.3) * 0.6 + Math.sin(t * 133.7 + 1.3) * 0.4),
    k * (Math.sin(t * 89.1 + 2.1) * 0.6 + Math.sin(t * 157.3) * 0.4),
    k * 0.0025 * Math.sin(t * 47.0 + 0.7),
  ];
}
