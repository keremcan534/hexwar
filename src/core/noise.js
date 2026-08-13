// Seed'li Perlin gürültüsü + fBm. Harita üretiminin temeli.

export function makeNoise2D(rng) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;

  function grad(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  /**
   * [-1, 1] aralığında Perlin değeri. periodX verilirse x ekseninde o periyotla
   * dikişsiz tekrarlar (silindir dünya); perm 256'lık olduğundan periodX <= 256 şart.
   */
  return function noise(x, y, periodX) {
    const xi = Math.floor(x);
    let X = xi & 255;
    // Periyotlu kipte lattice sütunu modulo periyot seçilir; periyotsuz kipte
    // X+1'in 256 taşması perm'in 512'ye kopyalı olmasıyla zaten güvenli.
    let X1 = X + 1;
    if (periodX) {
      X = ((xi % periodX) + periodX) % periodX;
      X1 = (X + 1) % periodX;
    }
    const Y = Math.floor(y) & 255;
    const xf = x - xi;
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);
    const aa = perm[perm[X] + Y];
    const ab = perm[perm[X] + Y + 1];
    const ba = perm[perm[X1] + Y];
    const bb = perm[perm[X1] + Y + 1];
    const x1 = lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u);
    const x2 = lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 0.7071;
  };
}

/** Katmanlı gürültü. Sonuç [0, 1]. periodX oktavlarla birlikte ölçeklenir. */
export function fbm(noise, x, y, { octaves = 5, frequency = 1, lacunarity = 2, gain = 0.5, periodX } = {}) {
  if (periodX) {
    // En yüksek oktavın periyodu perm tablosunu aşarsa dikiş geri gelir.
    const top = periodX * frequency * Math.pow(lacunarity, octaves - 1);
    console.assert(Number.isInteger(top) && top <= 256, 'fbm periodX tamsayı ve <=256 kalmalı', top);
  }
  let amp = 1;
  let freq = frequency;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * freq, y * freq, periodX ? periodX * freq : undefined) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return (sum / norm) * 0.5 + 0.5;
}
