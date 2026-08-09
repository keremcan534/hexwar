// Yüzey dokuları. Hepsi çalışma anında, deterministik olarak üretilir —
// dışarıdan indirilen görsel yok, derleme adımı yok.
//
// Neden tek bir noise yetmez: tek frekanslı gürültü ekranda "kum" gibi görünür
// ve döşeme izi hemen fark edilir. Fiziksel bir yüzey birden çok ölçekte
// değişir: geniş tonal dalgalanma (boyanın kalınlığı), orta ölçekli lekeler
// (mürekkep yoğunluğu) ve çok ince gren (kâğıt lifi). Bu dosya bu katmanları
// ayrı frekanslarda üretip toplar.
//
// Katman notu: DOM'a dokunur (canvas üretir) ama oyun durumuna dokunmaz.

/** Küçük, hızlı ve tekrarlanabilir sayı üreteci (mulberry32). */
function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Döşenebilir value-noise. Kafes `cells × cells` boyutunda ve kenarlarda
 * kendine sarıldığı için doku yan yana dizildiğinde dikiş görünmez.
 * @returns {Float32Array} 0..1 aralığında width*height değer
 */
function valueNoise(width, height, cells, rng) {
  const lattice = new Float32Array(cells * cells);
  for (let i = 0; i < lattice.length; i++) lattice[i] = rng();
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = (y / height) * cells;
    const iy = Math.floor(fy);
    const ty = smooth(fy - iy);
    const y0 = ((iy % cells) + cells) % cells;
    const y1 = (y0 + 1) % cells;
    for (let x = 0; x < width; x++) {
      const fx = (x / width) * cells;
      const ix = Math.floor(fx);
      const tx = smooth(fx - ix);
      const x0 = ((ix % cells) + cells) % cells;
      const x1 = (x0 + 1) % cells;
      const a = lattice[y0 * cells + x0];
      const b = lattice[y0 * cells + x1];
      const c = lattice[y1 * cells + x0];
      const d = lattice[y1 * cells + x1];
      out[y * width + x] = (a * (1 - tx) + b * tx) * (1 - ty)
        + (c * (1 - tx) + d * tx) * ty;
    }
  }
  return out;
}

/**
 * Birden çok oktavı toplar: her oktav iki kat daha ince, yarı ağırlıkta.
 * Sonuç 0..1'e normalize edilir.
 */
function fbm(width, height, octaves, rng) {
  const out = new Float32Array(width * height);
  let amplitude = 1;
  let total = 0;
  for (const cells of octaves) {
    const layer = valueNoise(width, height, cells, rng);
    for (let i = 0; i < out.length; i++) out[i] += layer[i] * amplitude;
    total += amplitude;
    amplitude *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Yönlü yüzey izleri: boyanın fırça/haddeleme yönü. */
function directionalStreaks(width, height, rng, angle = 0) {
  const line = new Float32Array(width + height);
  for (let i = 0; i < line.length; i++) line[i] = rng();
  // Komşuları yumuşat: keskin çizgi değil, yumuşak iz olsun.
  const soft = new Float32Array(line.length);
  for (let i = 0; i < line.length; i++) {
    const a = line[(i - 1 + line.length) % line.length];
    const b = line[i];
    const c = line[(i + 1) % line.length];
    soft[i] = (a + b * 2 + c) / 4;
  }
  const out = new Float32Array(width * height);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const projected = Math.abs(Math.round(x * cos + y * sin)) % soft.length;
      out[y * width + x] = soft[projected];
    }
  }
  return out;
}

/**
 * Bir doku canvas'ı üretir.
 *
 * @param {object} options
 * @param {number} options.size          döşeme kenarı (piksel)
 * @param {number} options.seed          tekrarlanabilirlik için
 * @param {number[]} options.octaves     kafes çözünürlükleri (geniş → ince)
 * @param {number} options.grain         ince beyaz gren payı (0..1)
 * @param {number} options.streaks       yönlü iz payı (0..1)
 * @param {number} options.streakAngle   iz açısı (radyan)
 * @param {number} options.contrast      sonucun ortalamadan sapma çarpanı
 * @param {[number,number,number]} options.tint  dokunun rengi
 * @param {number} options.alpha         azami opaklık (0..1)
 */
export function makeTexture({
  size = 256,
  seed = 1,
  octaves = [2, 4, 8, 16],
  grain = 0.25,
  streaks = 0,
  streakAngle = 0,
  contrast = 1,
  tint = [255, 255, 255],
  alpha = 0.06,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;

  const rng = makeRng(seed);
  const base = fbm(size, size, octaves, rng);
  const fine = valueNoise(size, size, size / 2, rng);
  const streak = streaks > 0 ? directionalStreaks(size, size, rng, streakAngle) : null;

  const [r, g, b] = tint;
  for (let i = 0; i < base.length; i++) {
    let v = base[i] * (1 - grain) + fine[i] * grain;
    if (streak) v = v * (1 - streaks) + streak[i] * streaks;
    // Ortalamadan sapmayı kontrol et: doku "gri gürültü ekranı" olmasın.
    v = 0.5 + (v - 0.5) * contrast;
    const p = i * 4;
    data[p] = r;
    data[p + 1] = g;
    data[p + 2] = b;
    data[p + 3] = Math.max(0, Math.min(255, Math.round(v * alpha * 255)));
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Üç malzeme, üç ayrı karakter. Aynı asset'i her yere sürmek yüzeyleri
 * birbirinin aynısı yapıyor; her biri kendi frekans karışımına sahip.
 */
let cache = null;

export function materials() {
  if (cache) return cache;
  cache = {
    // Mat boyalı metal: ince gren + hafif dikey haddeleme izi.
    uiMetal: makeTexture({
      size: 256,
      seed: 20250901,
      octaves: [4, 8, 32],
      grain: 0.55,
      streaks: 0.22,
      streakAngle: Math.PI / 2,
      contrast: 0.85,
      tint: [226, 214, 186],
      alpha: 0.05,
    }),
    // Atlas kâğıdı: geniş tonal dalgalanma + orta ölçekli mürekkep lekesi.
    mapAtlas: makeTexture({
      size: 512,
      seed: 771103,
      octaves: [2, 3, 6, 12, 48],
      grain: 0.3,
      contrast: 1.15,
      tint: [246, 236, 210],
      alpha: 0.1,
    }),
    // Deniz: çok geniş ölçekli ton değişimi, gren neredeyse yok.
    oceanInk: makeTexture({
      size: 512,
      seed: 448817,
      octaves: [2, 3, 5, 9],
      grain: 0.12,
      contrast: 1.3,
      tint: [150, 190, 205],
      alpha: 0.09,
    }),
    // Haritanın tamamına binen son film greni.
    filmGrain: makeTexture({
      size: 128,
      seed: 90210,
      octaves: [64],
      grain: 0.85,
      contrast: 0.7,
      tint: [255, 250, 236],
      alpha: 0.035,
    }),
  };
  return cache;
}
