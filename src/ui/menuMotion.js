// Ana menü sahnelerinin canlı katmanı.
//
// Sahneler durağan fotoğraf; video koymak hem depoyu şişirir hem de "derleme
// adımı yok" kuralına karşı bir varlık hattı ister. Onun yerine resmi tuvale
// kendimiz çiziyor ve üstüne sahneye özgü, resimdeki şeylere OTURAN küçük
// hareketler koyuyoruz: bulut gölgesi, su kıpırtısı, yağmur, duman, kıvılcım,
// ışık huzmesi, kuş. Fotoğrafı bozan tek şey (su/rüzgâr) şerit şerit yer
// değiştirmedir; gerisi resmin üstüne eklenen ışık ve parçacıktır, yani resim
// hiçbir yerde "eriyip" kaymaz.
//
// Bütün koordinatlar resmin kendi birimindedir (u, v ∈ 0..1). Kamera (yavaş
// yakınlaşma + kayma) değişse de duman bacada, kıvılcım alevde kalır.
// Koordinatlar resimlere ızgara çizilerek okundu; resim değişirse tablo da
// değişmeli.
//
// Döngü yalnız menü açıkken, hareket anahtarı açıkken döner (bkz. uiMotion).
// Harita döngüsünden ayrıdır: menü haritanın üstünü tamamen örter.
//
// Katman notu: DOM'a dokunur (ui katmanı), oyun durumuna dokunmaz.

const TAU = Math.PI * 2;

/* --------------------------------------------------------------------------
   Sahne tablosu. Anahtar mainMenu.js SCENES[].theme'dir.

   Ortak birimler: r/size = resim YÜKSEKLİĞİNİN kesri; amp = 1080 satırlık
   ekranda piksel; rise/wind = saniyede resim birimi; rate = saniyede parça.
   -------------------------------------------------------------------------- */
export const SCENE_MOTION = {
  // Savaş gemisi kıyıyı dövüyor: şehirde yangın dumanı, ufukta top ağzı
  // çakmaları, ön planda patlamanın nefesi, arada bir yeni salvo.
  bombardment: [
    { type: 'sky', rect: [0, 0, 1, 0.27], fade: [0, 0.5], speed: 0.006, alpha: 0.55 },
    { type: 'water', poly: [[0.3, 0.335], [1, 0.335], [1, 1], [0.69, 1], [0.56, 0.74], [0.55, 0.56], [0.45, 0.5], [0.3, 0.45]],
      amp: 2.4, wave: 18, speed: 1.1 },
    { type: 'smoke', at: [[0.33, 0.255], [0.415, 0.245], [0.475, 0.25], [0.565, 0.25], [0.635, 0.255], [0.74, 0.262]],
      rate: 1.4, life: 12, size: [0.006, 0.04], rise: 0.011, wind: 0.006, color: [36, 40, 50], alpha: 0.26 },
    { type: 'flash', band: [0.22, 0.258, 0.96, 0.29], every: [1.2, 4.5], r: 0.022, color: [255, 186, 120], alpha: 0.75, decay: 0.18 },
    { type: 'glow', at: [0.6, 0.5], r: 0.2, color: [255, 168, 92], alpha: 0.2, flicker: 0.8 },
    { type: 'embers', at: [[0.6, 0.5, 0.07]], rate: 7, life: 1.6, rise: 0.05, spread: 0.06, size: 0.0028, color: [255, 196, 120] },
    { type: 'flash', at: [[0.6, 0.5]], every: [12, 19], r: 0.36, color: [255, 205, 150], alpha: 0.55, decay: 0.45, shake: 5 },
  ],
  // Saray salonu: pencerelerden düşen huzmeler soluk alıp verir, içlerinde toz
  // asılı durur, avizenin kristalleri kıpırdar.
  'imperial-hall': [
    { type: 'beams', color: [188, 208, 255], alpha: 0.13, list: [
      { from: [[0.45, 0.19], [0.47, 0.55]], to: [[0.99, 0.69], [0.62, 0.79]], period: 9 },
      { from: [[0.28, 0.1], [0.31, 0.5]], to: [[0.78, 0.83], [0.36, 0.92]], period: 11.5 },
      { from: [[0.44, 0.15], [0.45, 0.27]], to: [[0.98, 0.52], [0.93, 0.62]], period: 13.5 },
    ] },
    { type: 'glow', at: [0.74, 0.77], r: 0.26, squash: 0.22, color: [205, 218, 255], alpha: 0.1, pulse: 9, depth: 0.7 },
    { type: 'motes', poly: [[0.28, 0.1], [0.5, 0.16], [1, 0.66], [1, 0.82], [0.36, 0.95], [0.28, 0.5]],
      count: 80, size: 0.0024, color: [222, 232, 255], alpha: 0.55 },
    { type: 'stars', rect: [0.51, 0.0, 0.69, 0.22], count: 16, size: 0.0035, color: [230, 238, 255], alpha: 0.9, speed: 2.4 },
    { type: 'stars', rect: [0.76, 0.27, 0.85, 0.4], count: 7, size: 0.003, color: [230, 238, 255], alpha: 0.8, speed: 2.4 },
  ],
  // Sisli liman: ay bulutların ardında, su kıpırdar, ay sütunu parıldar,
  // bacalar tüter, martılar geçer.
  harbour: [
    { type: 'sky', rect: [0, 0, 1, 0.5], fade: [0, 0.4], speed: 0.004, alpha: 0.5 },
    { type: 'glow', at: [0.4, 0.443], r: 0.08, color: [232, 236, 246], alpha: 0.26, pulse: 12, depth: 0.55 },
    { type: 'smoke', at: [[0.115, 0.475], [0.512, 0.47], [0.528, 0.455], [0.884, 0.3]],
      rate: 0.45, life: 16, size: [0.008, 0.05], rise: 0.004, wind: 0.004, color: [66, 70, 80], alpha: 0.38 },
    { type: 'water', poly: [[0, 0.575], [0.66, 0.575], [0.66, 0.64], [0.4, 0.86], [0.27, 1], [0, 1]],
      amp: 2, wave: 13, speed: 0.9 },
    { type: 'glints', rect: [0.385, 0.6, 0.42, 0.82], count: 28, color: [236, 240, 250], alpha: 0.75 },
    { type: 'birds', band: [0.1, 0.12, 0.9, 0.34], count: 4, size: 0.008, speed: 0.012, color: [40, 44, 52] },
  ],
  // Yağmurlu başkent: yağmur, taşta halkalar, ıslak zeminde kıpırdayan
  // yansıma, titreyen fenerler.
  'rainy-capital': [
    { type: 'sky', rect: [0.34, 0, 1, 0.37], fade: [0, 0.4], speed: 0.005, alpha: 0.45 },
    { type: 'water', poly: [[0.33, 0.64], [1, 0.64], [1, 1], [0.15, 1]], amp: 1.2, wave: 10, speed: 1.4 },
    { type: 'glow', at: [0.501, 0.548], r: 0.03, color: [255, 214, 150], alpha: 0.4, flicker: 0.3 },
    { type: 'glow', at: [0.569, 0.522], r: 0.026, color: [255, 214, 150], alpha: 0.38, flicker: 0.3 },
    { type: 'glow', at: [0.848, 0.537], r: 0.026, color: [255, 214, 150], alpha: 0.38, flicker: 0.3 },
    { type: 'glow', at: [0.976, 0.565], r: 0.026, color: [255, 214, 150], alpha: 0.32, flicker: 0.3 },
    { type: 'glow', at: [0.569, 0.72], r: 0.05, squash: 2.6, color: [255, 220, 170], alpha: 0.1, flicker: 0.3 },
    { type: 'glow', at: [0.85, 0.71], r: 0.045, squash: 2.6, color: [255, 220, 170], alpha: 0.1, flicker: 0.3 },
    { type: 'ripples', poly: [[0.33, 0.66], [1, 0.66], [1, 1], [0.15, 1]], rate: 34, life: 0.75, size: 0.013, alpha: 0.28 },
    { type: 'rain', density: 520, angle: 0.12, speed: 1500, length: 34, alpha: 0.16 },
  ],
  // Makas alanı: lokomotif buhar salar, bulut gölgesi geçer, güneş yarığı
  // soluk alır.
  'rail-yard': [
    { type: 'sky', rect: [0, 0, 1, 0.54], fade: [0, 0.3], speed: 0.005, alpha: 0.55 },
    { type: 'glow', at: [0.27, 0.4], r: 0.2, color: [236, 236, 242], alpha: 0.14, pulse: 14, depth: 0.7 },
    { type: 'water', poly: [[0.585, 0.72], [0.655, 0.72], [0.73, 1], [0.6, 1]], amp: 1, wave: 9, speed: 1 },
    { type: 'smoke', at: [[0.222, 0.62], [0.172, 0.69]], rate: 2.2, life: 7, size: [0.01, 0.065],
      rise: 0.02, wind: 0.006, color: [206, 209, 214], alpha: 0.42 },
    { type: 'birds', band: [0.4, 0.1, 0.95, 0.4], count: 5, size: 0.007, speed: 0.014, color: [32, 34, 40] },
  ],
  // Kıyı tabyası: deniz dalgalanır, ince çisenti, martılar.
  'coast-fort': [
    { type: 'sky', rect: [0, 0, 1, 0.35], fade: [0, 0.3], speed: 0.007, alpha: 0.55 },
    { type: 'water', poly: [[0, 0.36], [0.28, 0.36], [0.25, 0.45], [0.28, 0.55], [0.35, 0.62], [0.32, 0.72],
      [0.3, 0.82], [0.25, 0.92], [0.2, 1], [0, 1]], amp: 2.6, wave: 16, speed: 0.9 },
    { type: 'birds', band: [0.05, 0.1, 0.6, 0.38], count: 5, size: 0.008, speed: 0.016, color: [215, 220, 226] },
    { type: 'rain', density: 240, angle: 0.25, speed: 1100, length: 22, alpha: 0.1 },
  ],
  // Lale gecesi: yıldızlar kırpışır, ay soluk alır, tarlada rüzgâr dolaşır,
  // arada bir yıldız kayar.
  'crescent-night': [
    { type: 'stars', rect: [0, 0, 1, 0.42], count: 70, size: 0.0022, color: [222, 228, 245], alpha: 0.7, speed: 0.9 },
    { type: 'meteor', rect: [0.05, 0.02, 0.6, 0.25], every: [16, 34] },
    { type: 'glow', at: [0.725, 0.135], r: 0.1, color: [232, 226, 204], alpha: 0.22, pulse: 10, depth: 0.5 },
    { type: 'water', poly: [[0, 0.55], [1, 0.55], [1, 1], [0, 1]], amp: 1.5, wave: 120, speed: 0.55, sway: true },
  ],
  // Tarla yolu: bulutlar geçer, güneş yarığı açılıp kapanır, ekin dalgalanır,
  // su birikintileri kıpırdar.
  'field-road': [
    { type: 'sky', rect: [0, 0, 1, 0.55], fade: [0, 0.25], speed: 0.006, alpha: 0.6 },
    { type: 'glow', at: [0.35, 0.42], r: 0.22, color: [242, 236, 224], alpha: 0.15, pulse: 13, depth: 0.7 },
    { type: 'water', poly: [[0, 0.58], [1, 0.58], [1, 1], [0, 1]], amp: 1.2, wave: 90, speed: 0.7, sway: true },
    { type: 'water', poly: [[0.1, 0.95], [0.45, 0.8], [0.75, 0.68], [0.85, 0.63], [0.82, 0.72], [0.55, 0.88], [0.3, 1], [0.08, 1]],
      amp: 1.4, wave: 8, speed: 1.1 },
    { type: 'birds', band: [0.1, 0.2, 0.9, 0.45], count: 6, size: 0.007, speed: 0.013, color: [30, 32, 38] },
  ],
  // Vadideki kasaba: bulutlar, güneş yarığı, gölcükler, yol birikintisi,
  // bacalarda ince duman.
  valley: [
    { type: 'sky', rect: [0, 0, 1, 0.52], fade: [0, 0.25], speed: 0.006, alpha: 0.6 },
    { type: 'glow', at: [0.37, 0.28], r: 0.22, color: [242, 238, 228], alpha: 0.16, pulse: 12, depth: 0.7 },
    { type: 'smoke', at: [[0.365, 0.605], [0.712, 0.575], [0.775, 0.585]], rate: 0.35, life: 12, size: [0.004, 0.025],
      rise: 0.004, wind: 0.003, color: [120, 126, 138], alpha: 0.22 },
    { type: 'water', poly: [[0, 0.68], [1, 0.68], [1, 1], [0, 1]], amp: 1, wave: 90, speed: 0.7, sway: true },
    { type: 'water', poly: [[0.25, 0.575], [0.46, 0.575], [0.46, 0.62], [0.25, 0.62]], amp: 1, wave: 6, speed: 1 },
    { type: 'water', poly: [[0.58, 0.66], [0.67, 0.66], [0.67, 0.69], [0.58, 0.69]], amp: 1, wave: 6, speed: 1 },
    { type: 'water', poly: [[0.13, 0.72], [0.22, 0.72], [0.38, 0.84], [0.38, 1], [0.15, 1], [0.15, 0.8]], amp: 1.4, wave: 8, speed: 1.1 },
    { type: 'birds', band: [0.5, 0.1, 0.95, 0.4], count: 5, size: 0.007, speed: 0.013, color: [30, 32, 38] },
  ],
  // Yanan sokak: pencerelerde alev titrer, kıvılcım yükselir, kara duman
  // gökyüzüne yayılır, ıslak taşa turuncu yansır.
  'burning-street': [
    { type: 'smoke', at: [[0.26, 0.11], [0.36, 0.15], [0.53, 0.27], [0.71, 0.38]], rate: 1.2, life: 13, size: [0.03, 0.12],
      rise: 0.011, wind: 0.006, color: [28, 30, 40], alpha: 0.28 },
    { type: 'glow', at: [0.26, 0.2], r: 0.11, color: [255, 150, 70], alpha: 0.32, flicker: 1 },
    { type: 'glow', at: [0.31, 0.25], r: 0.05, color: [255, 160, 80], alpha: 0.28, flicker: 1 },
    { type: 'glow', at: [0.375, 0.27], r: 0.05, color: [255, 160, 80], alpha: 0.26, flicker: 1 },
    { type: 'glow', at: [0.52, 0.34], r: 0.08, color: [255, 150, 70], alpha: 0.3, flicker: 1 },
    { type: 'glow', at: [0.72, 0.44], r: 0.07, color: [255, 150, 70], alpha: 0.3, flicker: 1 },
    { type: 'glow', at: [0.725, 0.535], r: 0.03, color: [255, 160, 80], alpha: 0.24, flicker: 1 },
    { type: 'glow', at: [0.48, 0.78], r: 0.32, squash: 0.3, color: [255, 150, 80], alpha: 0.07, flicker: 0.8 },
    { type: 'glow', at: [0.893, 0.31], r: 0.035, color: [255, 222, 172], alpha: 0.3, flicker: 0.15 },
    { type: 'embers', at: [[0.26, 0.2, 0.05], [0.52, 0.34, 0.04], [0.72, 0.44, 0.04], [0.375, 0.27, 0.02]],
      rate: 9, life: 4, rise: 0.04, spread: 0.02, size: 0.0026, color: [255, 176, 96] },
  ],
};

/* --------------------------------------------------------------------------
   Yardımcılar
   -------------------------------------------------------------------------- */

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Düzgün olmayan ama yumuşak 0..1 titreşim: alev, fener. Faz parçaya özel. */
function flicker(t, phase) {
  return 0.5 + 0.5 * (
    0.5 * Math.sin(t * 7.3 + phase)
    + 0.3 * Math.sin(t * 13.1 + phase * 2.1)
    + 0.2 * Math.sin(t * 23.7 + phase * 3.7)
  );
}

function pointInPoly(u, v, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ui, vi] = poly[i];
    const [uj, vj] = poly[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

function polyBounds(poly) {
  let u0 = 1, v0 = 1, u1 = 0, v1 = 0;
  for (const [u, v] of poly) {
    u0 = Math.min(u0, u); v0 = Math.min(v0, v);
    u1 = Math.max(u1, u); v1 = Math.max(v1, v);
  }
  return [u0, v0, u1, v1];
}

function randomInPoly(poly, bounds = polyBounds(poly)) {
  for (let i = 0; i < 40; i++) {
    const u = rand(bounds[0], bounds[2]);
    const v = rand(bounds[1], bounds[3]);
    if (pointInPoly(u, v, poly)) return [u, v];
  }
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
}

function tracePoly(ctx, view, poly) {
  ctx.beginPath();
  poly.forEach(([u, v], i) => {
    if (i === 0) ctx.moveTo(view.x(u), view.y(v));
    else ctx.lineTo(view.x(u), view.y(v));
  });
  ctx.closePath();
}

/**
 * Döşenebilir değer gürültüsü (fBm), gri. Bulut gölgesinin dokusu. Bir kez
 * üretilir; 256² × 5 oktav açılışta ~5 ms.
 */
let noiseTile = null;
let noiseField = null;
function cloudNoise() {
  if (noiseTile) return noiseTile;
  const size = 256;
  const sum = new Float32Array(size * size);
  let amp = 1;
  for (let o = 0; o < 5; o++) {
    const cells = 4 << o;
    const lattice = new Float32Array(cells * cells);
    for (let i = 0; i < lattice.length; i++) lattice[i] = Math.random();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const iy = Math.floor(fy);
      const ty = fy - iy;
      const sy = ty * ty * (3 - 2 * ty);
      const y0 = iy % cells;
      const y1 = (iy + 1) % cells;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const ix = Math.floor(fx);
        const tx = fx - ix;
        const sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % cells;
        const x1 = (ix + 1) % cells;
        const a = lattice[y0 * cells + x0];
        const b = lattice[y0 * cells + x1];
        const c = lattice[y1 * cells + x0];
        const d = lattice[y1 * cells + x1];
        sum[y * size + x] += amp * (a + (b - a) * sx + (c - a + (a - b + d - c) * sx) * sy);
      }
    }
    amp *= 0.55;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (const n of sum) { lo = Math.min(lo, n); hi = Math.max(hi, n); }
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < sum.length; i++) {
    // Kontrast açılır: ortalama gri (nötr) kalır, uçlar bulut ve yarık olur.
    const n = clamp(0.5 + ((sum[i] - lo) / (hi - lo) - 0.5) * 1.9, 0, 1);
    const g = Math.round(n * 255);
    image.data[i * 4] = g;
    image.data[i * 4 + 1] = g;
    image.data[i * 4 + 2] = g;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  noiseField = new Float32Array(sum.length);
  for (let i = 0; i < sum.length; i++) noiseField[i] = image.data[i * 4] / 255;
  noiseTile = canvas;
  return canvas;
}

/**
 * Duman/buhar topağı: yumuşak kenarlı, içi gürültüyle oyulmuş leke. Dört
 * değişke: hep aynı biçim yan yana dizilince "baskı deseni" gibi duruyordu.
 * Gürültü ALFAYA yazılır; gri dokuyu destination-in ile bindirmek opak
 * olduğu için hiçbir şey oymuyor, topak düz bir daire kalıyordu (ölçüldü).
 */
const puffCache = new Map();
function puffSprites(color) {
  const key = color.join(',');
  if (puffCache.has(key)) return puffCache.get(key);
  cloudNoise();
  const size = 128;
  const sprites = [];
  for (let k = 0; k < 4; k++) {
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(size, size);
    const ox = Math.floor(Math.random() * 256);
    const oy = Math.floor(Math.random() * 256);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = noiseField[((y + oy) & 255) * 256 + ((x + ox) & 255)];
        // Kenar gürültüyle bozulur: yarıçap pikselden piksele oynar.
        const d = Math.hypot(x - size / 2, y - size / 2) / (size / 2) + (0.5 - n) * 0.45;
        const edge = clamp((1 - d) / 0.55, 0, 1);
        const body = edge * edge * (3 - 2 * edge);
        const a = body * clamp(0.25 + n * 1.1, 0, 1);
        const i = (y * size + x) * 4;
        image.data[i] = color[0];
        image.data[i + 1] = color[1];
        image.data[i + 2] = color[2];
        image.data[i + 3] = Math.round(a * 255);
      }
    }
    ctx.putImageData(image, 0, 0);
    sprites.push(canvas);
  }
  puffCache.set(key, sprites);
  return sprites;
}

/** Işık noktası: kıvılcım, toz, yıldız. Beyaz; renk çizimde verilir. */
let dotSprite = null;
function dot() {
  if (dotSprite) return dotSprite;
  const size = 32;
  const canvas = makeCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  dotSprite = canvas;
  return canvas;
}

const tintCache = new Map();
function tintedDot(color) {
  const key = color.join(',');
  if (tintCache.has(key)) return tintCache.get(key);
  const base = dot();
  const canvas = makeCanvas(base.width, base.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = rgba(color, 1);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Merkez beyaza yakın kalsın: kıvılcımın çekirdeği renkli değil sıcaktır.
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(base, 8, 8, 16, 16);
  tintCache.set(key, canvas);
  return canvas;
}

/* --------------------------------------------------------------------------
   Katmanlar. Her biri { draw(ctx, view, t, dt, motion) }.
   `view` resim biriminden ekran pikseline çevirir; `view.unit` 1080 satırlık
   ekrana göre ölçek (parçacık boyu ekranla büyüsün).
   -------------------------------------------------------------------------- */

/**
 * Bulut gölgesi: gökyüzü bölgesinde kayan gürültü, "yumuşak ışık" ile.
 * Fotoğrafın kendisini kaydırmak ufuktaki kule ve vinçlerde hayalet bırakıyordu;
 * ışığı kaydırmak bırakmıyor ve göz bunu bulutun yürümesi olarak okuyor.
 */
function skyLayer(cfg, img) {
  const [u0, v0, u1, v1] = cfg.rect;
  // Tampon resim pikselinin yarısı: bulut zaten yumuşak, tam çözünürlük boşa.
  const bw = (u1 - u0) * img.naturalWidth * 0.5;
  const bh = (v1 - v0) * img.naturalHeight * 0.5;
  const buffer = makeCanvas(bw, bh);
  const bctx = buffer.getContext('2d');
  const mask = makeCanvas(bw, bh);
  {
    const m = mask.getContext('2d');
    const [top, bottom] = cfg.fade ?? [0, 0.3];
    const g = m.createLinearGradient(0, 0, 0, mask.height);
    g.addColorStop(0, top > 0 ? 'rgba(0,0,0,0)' : '#000');
    if (top > 0) g.addColorStop(top, '#000');
    g.addColorStop(Math.max(top, 1 - bottom), '#000');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    m.fillStyle = g;
    m.fillRect(0, 0, mask.width, mask.height);
  }
  const pattern = bctx.createPattern(cloudNoise(), 'repeat');
  const scale = (bh / 256) * 1.3;
  return {
    draw(ctx, view, t) {
      bctx.globalCompositeOperation = 'copy';
      bctx.globalAlpha = 1;
      const drift = t * cfg.speed * img.naturalWidth * 0.5;
      // İki ölçek, iki hız: tek kat "kayan desen" gibi okunuyor, iki kat
      // derinlik veriyor. Yatay gerdirme bulutu yassı tutar.
      pattern.setTransform(new DOMMatrix().translate(-drift, 0).scale(scale * 2.6, scale));
      bctx.fillStyle = pattern;
      bctx.fillRect(0, 0, bw, bh);
      bctx.globalCompositeOperation = 'source-over';
      bctx.globalAlpha = 0.45;
      pattern.setTransform(new DOMMatrix().translate(-drift * 1.7, 37).scale(scale * 1.3, scale * 0.55));
      bctx.fillRect(0, 0, bw, bh);
      bctx.globalAlpha = 1;
      bctx.globalCompositeOperation = 'destination-in';
      bctx.drawImage(mask, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = cfg.mode ?? 'soft-light';
      ctx.globalAlpha = cfg.alpha ?? 0.5;
      ctx.drawImage(buffer, view.x(u0), view.y(v0), (u1 - u0) * view.w, (v1 - v0) * view.h);
      ctx.restore();
    },
  };
}

/**
 * Su ve rüzgâr: bölge yatay şeritler halinde yeniden çizilir, her şerit
 * sinüsle sağa sola kayar. Dalga boyu aşağı (yakına) doğru büyür — perspektif.
 * `sway` ekin/çimen içindir: uzun dalga, yavaş, aşağıda daha güçlü.
 */
function waterLayer(cfg, img) {
  const bounds = polyBounds(cfg.poly);
  const phase = Math.random() * TAU;
  return {
    draw(ctx, view, t) {
      const top = Math.max(0, Math.floor(view.y(bounds[1])));
      const bottom = Math.min(view.ch, Math.ceil(view.y(bounds[3])));
      const left = Math.max(0, Math.floor(view.x(bounds[0])));
      const right = Math.min(view.cw, Math.ceil(view.x(bounds[2])));
      if (bottom <= top || right <= left) return;
      const strip = 2;
      const amp = cfg.amp * view.unit;
      const span = bottom - top;
      const sx = (left - view.ox) / view.s;
      const sw = (right - left) / view.s;
      ctx.save();
      tracePoly(ctx, view, cfg.poly);
      ctx.clip();
      for (let y = top; y < bottom; y += strip) {
        const depth = (y - top) / span;
        // Resim satırı cinsinden faz: kamera yakınlaşınca dalga da büyür.
        const row = (y - view.oy) / view.s;
        const wave = cfg.wave * (0.45 + depth * 1.1);
        let off;
        if (cfg.sway) {
          // Rüzgâr dalgası tarlada uzaklaşarak yürür.
          off = Math.sin(row / wave - t * cfg.speed + phase)
            * (0.6 + 0.4 * Math.sin(t * 0.21 + phase)) * (0.25 + depth);
        } else {
          off = (Math.sin(row / wave + t * cfg.speed * 2.2 + phase)
            + 0.55 * Math.sin(row / (wave * 0.37) - t * cfg.speed * 3.1)) * (0.35 + depth * 0.9);
        }
        ctx.drawImage(img, sx, row, sw, strip / view.s, left + off * amp, y, right - left, strip);
      }
      ctx.restore();
    },
  };
}

/** Ay/güneş sütunundaki parıltılar: yatay kısa çizgiler belirip söner. */
function glintsLayer(cfg) {
  const [u0, v0, u1, v1] = cfg.rect;
  const items = Array.from({ length: cfg.count }, () => ({
    u: rand(u0, u1), v: rand(v0, v1), p: Math.random() * TAU, w: rand(1.2, 3.2), len: rand(0.4, 1),
  }));
  return {
    draw(ctx, view, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.lineWidth = Math.max(1, 1.4 * view.unit);
      for (const g of items) {
        const a = Math.max(0, Math.sin(t * g.w + g.p)) ** 4;
        if (a < 0.02) continue;
        const depth = (g.v - v0) / (v1 - v0);
        const half = (4 + depth * 14) * g.len * view.unit;
        ctx.strokeStyle = rgba(cfg.color, a * cfg.alpha);
        const x = view.x(g.u);
        const y = view.y(g.v);
        ctx.beginPath();
        ctx.moveTo(x - half, y);
        ctx.lineTo(x + half, y);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/**
 * Işık kaynağı: radyal parıltı. `pulse` yavaş soluk (saniye periyot),
 * `flicker` alev titreşimi (0..1). `squash` elipsi dikey ezer (<1) ya da
 * uzatır (>1): zeminde yansıma.
 */
function glowLayer(cfg) {
  const phase = Math.random() * 100;
  return {
    draw(ctx, view, t) {
      let k = 1;
      if (cfg.pulse) k *= 1 - (cfg.depth ?? 0.5) * (0.5 + 0.5 * Math.sin((t * TAU) / cfg.pulse + phase));
      if (cfg.flicker) k *= 1 - cfg.flicker * 0.6 * flicker(t, phase);
      const a = (cfg.alpha ?? 0.2) * k;
      if (a < 0.003) return;
      const x = view.x(cfg.at[0]);
      const y = view.y(cfg.at[1]);
      const r = cfg.r * view.h;
      ctx.save();
      ctx.globalCompositeOperation = cfg.mode ?? 'screen';
      ctx.translate(x, y);
      ctx.scale(1, cfg.squash ?? 1);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, rgba(cfg.color, a));
      g.addColorStop(0.4, rgba(cfg.color, a * 0.45));
      g.addColorStop(1, rgba(cfg.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    },
  };
}

/**
 * Işık huzmeleri. Her huzme bir kez, resim biriminde, bulanık olarak
 * önceden çizilir (her karede filtre çalıştırmak pahalı); karede yalnız
 * opaklığı soluk alır.
 */
function beamsLayer(cfg, img) {
  const scale = 0.25;
  const W = img.naturalWidth * scale;
  const H = img.naturalHeight * scale;
  const beams = cfg.list.map((beam) => {
    const canvas = makeCanvas(W, H);
    const c = canvas.getContext('2d');
    c.filter = `blur(${Math.round(H * 0.012)}px)`;
    const [[a0u, a0v], [a1u, a1v]] = beam.from;
    const [[b0u, b0v], [b1u, b1v]] = beam.to;
    const g = c.createLinearGradient(
      ((a0u + a1u) / 2) * W, ((a0v + a1v) / 2) * H,
      ((b0u + b1u) / 2) * W, ((b0v + b1v) / 2) * H,
    );
    g.addColorStop(0, rgba(cfg.color, 0.9));
    g.addColorStop(0.6, rgba(cfg.color, 0.55));
    g.addColorStop(1, rgba(cfg.color, 0));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(a0u * W, a0v * H);
    c.lineTo(b0u * W, b0v * H);
    c.lineTo(b1u * W, b1v * H);
    c.lineTo(a1u * W, a1v * H);
    c.closePath();
    c.fill();
    return { canvas, period: beam.period, phase: Math.random() * TAU };
  });
  return {
    draw(ctx, view, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (const b of beams) {
        // Bulut güneşin önünden geçiyormuş gibi: iki sinüs, biri yavaş.
        const k = 0.55 + 0.3 * Math.sin((t * TAU) / b.period + b.phase)
          + 0.15 * Math.sin((t * TAU) / (b.period * 2.7) + b.phase * 1.7);
        ctx.globalAlpha = clamp(cfg.alpha * k * 2, 0, 1);
        ctx.drawImage(b.canvas, view.ox, view.oy, view.w, view.h);
      }
      ctx.restore();
    },
  };
}

/**
 * Duman ve buhar. Her kaynak saniyede `rate` topak salar; topak yükselir,
 * rüzgârla yana kayar, büyür ve söner. Sahne açılır açılmaz duman olgun
 * görünsün diye ilk karede `life` kadar ileri sarılır.
 */
function smokeLayer(cfg) {
  const sprites = puffSprites(cfg.color);
  const parts = [];
  const timers = cfg.at.map(() => Math.random());
  const spawn = (i) => {
    const [u, v] = cfg.at[i];
    parts.push({
      u: u + rand(-0.004, 0.004), v, age: 0,
      life: cfg.life * rand(0.75, 1.2),
      rot: Math.random() * TAU, spin: rand(-0.15, 0.15),
      wind: cfg.wind * rand(0.7, 1.3), rise: cfg.rise * rand(0.8, 1.2),
      sprite: sprites[Math.floor(Math.random() * sprites.length)],
    });
  };
  const step = (dt) => {
    for (let i = 0; i < cfg.at.length; i++) {
      timers[i] += dt * cfg.rate;
      while (timers[i] >= 1) { timers[i] -= 1; spawn(i); }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      // Yükseldikçe yavaşlar ve rüzgâra kapılır.
      const f = p.age / p.life;
      p.v -= p.rise * (1 - f * 0.6) * dt;
      p.u += p.wind * (0.3 + f) * dt;
      p.rot += p.spin * dt;
    }
  };
  for (let s = 0; s < cfg.life; s += 0.25) step(0.25);
  return {
    draw(ctx, view, t, dt) {
      step(dt);
      ctx.save();
      for (const p of parts) {
        const f = p.age / p.life;
        // Yavaş belirir: kaynakta üst üste yığılan genç topaklar kara top gibi duruyordu.
        const a = cfg.alpha * Math.min(1, f * 3) * (1 - f) ** 1.3;
        const r = (cfg.size[0] + (cfg.size[1] - cfg.size[0]) * Math.sqrt(f)) * view.h;
        ctx.globalAlpha = a;
        ctx.setTransform(1, 0, 0, 1, view.x(p.u), view.y(p.v));
        ctx.rotate(p.rot);
        ctx.drawImage(p.sprite, -r, -r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

/** Kıvılcım: alevin üstünden yükselen, salınan, sönen sıcak noktalar. */
function embersLayer(cfg) {
  const sprite = tintedDot(cfg.color);
  const parts = [];
  let timer = 0;
  const spawn = () => {
    const [u, v, spread] = cfg.at[Math.floor(Math.random() * cfg.at.length)];
    const angle = rand(-Math.PI, 0);
    parts.push({
      u: u + rand(-spread, spread), v: v + rand(-spread, spread) * 0.6,
      vu: Math.cos(angle) * cfg.spread * rand(0.2, 1),
      vv: -cfg.rise * rand(0.4, 1.2),
      age: 0, life: cfg.life * rand(0.5, 1.2), p: Math.random() * TAU, sz: rand(0.6, 1.4),
    });
  };
  return {
    draw(ctx, view, t, dt) {
      timer += dt * cfg.rate;
      while (timer >= 1) { timer -= 1; spawn(); }
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.age += dt;
        if (p.age >= p.life) { parts.splice(i, 1); continue; }
        p.u += (p.vu + Math.sin(t * 3 + p.p) * 0.004) * dt;
        p.v += p.vv * dt;
        p.vv *= 1 - dt * 0.3;
        const f = p.age / p.life;
        const a = (1 - f) * (0.6 + 0.4 * Math.sin(t * 17 + p.p));
        const r = cfg.size * view.h * p.sz * (1.6 - f) * 2;
        ctx.globalAlpha = clamp(a, 0, 1);
        ctx.drawImage(sprite, view.x(p.u) - r, view.y(p.v) - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

/** Huzmede asılı toz: çok yavaş gezinen, kırpışan soluk noktalar. */
function motesLayer(cfg) {
  const sprite = tintedDot(cfg.color);
  const bounds = polyBounds(cfg.poly);
  const items = Array.from({ length: cfg.count }, () => {
    const [u, v] = randomInPoly(cfg.poly, bounds);
    return { u, v, p: Math.random() * TAU, w: rand(0.3, 0.9), sz: rand(0.5, 1.5), du: rand(-1, 1), dv: rand(-1, 1) };
  });
  return {
    draw(ctx, view, t, dt) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of items) {
        m.u += (m.du * 0.0016 + Math.sin(t * 0.3 + m.p) * 0.0012) * dt;
        m.v += (m.dv * 0.001 + 0.0006) * dt;
        if (!pointInPoly(m.u, m.v, cfg.poly)) {
          [m.u, m.v] = randomInPoly(cfg.poly, bounds);
        }
        const a = cfg.alpha * (0.35 + 0.65 * Math.max(0, Math.sin(t * m.w + m.p)));
        const r = cfg.size * view.h * m.sz * 2;
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, view.x(m.u) - r, view.y(m.v) - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

/** Yıldız ve kristal kırpışması: sabit yerde, keskin tepeli parlama. */
function starsLayer(cfg) {
  const sprite = tintedDot(cfg.color);
  const [u0, v0, u1, v1] = cfg.rect;
  const items = Array.from({ length: cfg.count }, () => ({
    u: rand(u0, u1), v: rand(v0, v1), p: Math.random() * TAU, w: rand(0.5, 1.5) * (cfg.speed ?? 1), sz: rand(0.5, 1.3),
  }));
  return {
    draw(ctx, view, t) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const s of items) {
        const a = cfg.alpha * Math.max(0, Math.sin(t * s.w + s.p)) ** 3;
        if (a < 0.02) continue;
        const r = cfg.size * view.h * s.sz * 2;
        ctx.globalAlpha = a;
        ctx.drawImage(sprite, view.x(s.u) - r, view.y(s.v) - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

/** Kayan yıldız: seyrek, kısa, soldan sağa aşağı. */
function meteorLayer(cfg) {
  let wait = rand(cfg.every[0] * 0.4, cfg.every[1] * 0.6);
  let m = null;
  return {
    draw(ctx, view, t, dt) {
      if (!m) {
        wait -= dt;
        if (wait > 0) return;
        wait = rand(cfg.every[0], cfg.every[1]);
        const [u0, v0, u1, v1] = cfg.rect;
        m = { u: rand(u0, u1), v: rand(v0, v1), age: 0, life: rand(0.6, 1.1), du: rand(0.12, 0.2), dv: rand(0.04, 0.08) };
      }
      m.age += dt;
      const f = m.age / m.life;
      if (f >= 1) { m = null; return; }
      const hu = m.u + m.du * f;
      const hv = m.v + m.dv * f;
      const tail = 0.05;
      const a = Math.sin(Math.PI * f) * 0.8;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const x0 = view.x(hu - m.du * tail * 4);
      const y0 = view.y(hv - m.dv * tail * 4);
      const x1 = view.x(hu);
      const y1 = view.y(hv);
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(230,236,255,0)');
      g.addColorStop(1, `rgba(240,244,255,${a})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, 1.6 * view.unit);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    },
  };
}

/**
 * Yağmur. Ekran biriminde: damla kameraya yakındır, kamera kaymasıyla
 * birlikte kaymaz. İki derinlik: uzak ince/sık, yakın uzun/seyrek.
 */
function rainLayer(cfg) {
  const drops = Array.from({ length: cfg.density }, () => ({
    x: Math.random(), y: Math.random(), near: Math.random() < 0.3, sp: rand(0.8, 1.2),
  }));
  return {
    draw(ctx, view, t, dt) {
      const { cw, ch, unit } = view;
      const dx = Math.sin(cfg.angle);
      const dy = Math.cos(cfg.angle);
      ctx.save();
      ctx.lineCap = 'round';
      for (const near of [false, true]) {
        const len = cfg.length * unit * (near ? 1.6 : 0.8);
        ctx.strokeStyle = `rgba(210,220,232,${cfg.alpha * (near ? 1.3 : 0.8)})`;
        ctx.lineWidth = Math.max(1, (near ? 1.5 : 1) * unit);
        ctx.beginPath();
        for (const d of drops) {
          if (d.near !== near) continue;
          const v = (cfg.speed * unit * d.sp * (near ? 1.4 : 1)) / ch;
          d.y += v * dt;
          d.x += (v * dt * dx / dy) * (ch / cw);
          if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
          if (d.x > 1.05) d.x -= 1.1;
          const x = d.x * cw;
          const y = d.y * ch;
          ctx.moveTo(x, y);
          ctx.lineTo(x - dx * len, y - dy * len);
        }
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/** Taşta yağmur halkaları: genişleyen, yassı, sönen elipsler. */
function ripplesLayer(cfg) {
  const bounds = polyBounds(cfg.poly);
  const items = [];
  let timer = 0;
  return {
    draw(ctx, view, t, dt) {
      timer += dt * cfg.rate;
      while (timer >= 1) {
        timer -= 1;
        const [u, v] = randomInPoly(cfg.poly, bounds);
        items.push({ u, v, age: 0 });
      }
      ctx.save();
      ctx.lineWidth = Math.max(1, view.unit);
      for (let i = items.length - 1; i >= 0; i--) {
        const r = items[i];
        r.age += dt;
        const f = r.age / cfg.life;
        if (f >= 1) { items.splice(i, 1); continue; }
        const depth = (r.v - bounds[1]) / (bounds[3] - bounds[1]);
        const rad = cfg.size * view.h * (0.3 + depth) * (0.2 + f);
        ctx.strokeStyle = `rgba(220,228,238,${cfg.alpha * (1 - f)})`;
        ctx.beginPath();
        ctx.ellipse(view.x(r.u), view.y(r.v), rad, rad * 0.28, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/**
 * Kuşlar: uzakta süzülen küçük "v"ler. Kanat çırpar, arada süzülür.
 * Bant dışına çıkan kuş bir süre sonra karşı kenardan döner.
 */
function birdsLayer(cfg) {
  const [u0, v0, u1, v1] = cfg.band;
  const make = (anywhere) => {
    const dir = Math.random() < 0.5 ? 1 : -1;
    return {
      u: anywhere ? rand(u0, u1) : dir > 0 ? u0 - rand(0.02, 0.2) : u1 + rand(0.02, 0.2),
      v: rand(v0, v1), dir, p: Math.random() * TAU,
      sp: cfg.speed * rand(0.7, 1.3), sz: rand(0.7, 1.3), bob: Math.random() * TAU,
    };
  };
  const birds = Array.from({ length: cfg.count }, () => make(true));
  return {
    draw(ctx, view, t, dt) {
      ctx.save();
      ctx.strokeStyle = rgba(cfg.color, 0.75);
      ctx.lineWidth = Math.max(1, 1.3 * view.unit);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < birds.length; i++) {
        const b = birds[i];
        b.u += b.dir * b.sp * dt;
        b.v += Math.sin(t * 0.5 + b.bob) * 0.002 * dt;
        if (b.u < u0 - 0.25 || b.u > u1 + 0.25) { birds[i] = make(false); continue; }
        // Çırpma ve süzülme ardışık: sürekli çırpan kuş böcek gibi duruyor.
        const glide = Math.sin(t * 0.7 + b.p) > 0.3;
        const wing = glide ? 0.25 : Math.sin(t * 9 + b.p);
        const s = cfg.size * view.h * b.sz;
        const x = view.x(b.u);
        const y = view.y(b.v);
        ctx.beginPath();
        ctx.moveTo(x - s, y - wing * s * 0.6);
        ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.25, x, y);
        ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.25, x + s, y - wing * s * 0.6);
        ctx.stroke();
      }
      ctx.restore();
    },
  };
}

/**
 * Ani ışık: top ağzı, uzak patlama. Ya sabit noktalardan (`at`) ya da bir
 * bantta rastgele yerden çakar; hızla söner. `shake` kamerayı sarsar.
 */
function flashLayer(cfg) {
  const items = [];
  let wait = rand(cfg.every[0] * 0.3, cfg.every[1]);
  return {
    draw(ctx, view, t, dt, motion) {
      wait -= dt;
      if (wait <= 0) {
        wait = rand(cfg.every[0], cfg.every[1]);
        const at = cfg.at
          ? cfg.at[Math.floor(Math.random() * cfg.at.length)]
          : [rand(cfg.band[0], cfg.band[2]), rand(cfg.band[1], cfg.band[3])];
        items.push({ u: at[0], v: at[1], age: 0, k: rand(0.6, 1) });
        // Bazen ikili salvo: tek çakma tekrar eden bir "tik" gibi kalıyor.
        if (Math.random() < 0.35) items.push({ u: at[0] + rand(-0.01, 0.01), v: at[1], age: -rand(0.12, 0.3), k: rand(0.5, 0.8) });
        if (cfg.shake) motion.kick(cfg.shake);
      }
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      for (let i = items.length - 1; i >= 0; i--) {
        const f = items[i];
        f.age += dt;
        if (f.age < 0) continue;
        const a = cfg.alpha * f.k * Math.exp(-f.age / cfg.decay);
        if (a < 0.004) { items.splice(i, 1); continue; }
        const r = cfg.r * view.h * (0.7 + 0.3 * Math.min(1, f.age / cfg.decay));
        const x = view.x(f.u);
        const y = view.y(f.v);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(cfg.color, a));
        g.addColorStop(0.3, rgba(cfg.color, a * 0.5));
        g.addColorStop(1, rgba(cfg.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.restore();
    },
  };
}

const LAYERS = {
  sky: skyLayer,
  water: waterLayer,
  glints: glintsLayer,
  glow: glowLayer,
  beams: beamsLayer,
  smoke: smokeLayer,
  embers: embersLayer,
  motes: motesLayer,
  stars: starsLayer,
  meteor: meteorLayer,
  rain: rainLayer,
  ripples: ripplesLayer,
  birds: birdsLayer,
  flash: flashLayer,
};

/* --------------------------------------------------------------------------
   Sahne sürücüsü
   -------------------------------------------------------------------------- */

const motionOn = () => document.documentElement.dataset.motion !== 'off';

export class MenuMotion {
  /**
   * @param {HTMLCanvasElement} canvas resmin üstündeki tuval
   * @param {HTMLElement} host `is-live` sınıfını taşıyan kap (menü kökü):
   *   tuval çizmeye başlayınca alttaki <img> gizlenir, durunca geri gelir.
   */
  constructor(canvas, host) {
    this.canvas = canvas;
    this.host = host;
    this.ctx = canvas.getContext('2d');
    this.scene = null;
    this.img = null;
    this.layers = [];
    this.running = false;
    this.raf = 0;
    this.last = 0;
    this.t = 0;
    this.shake = 0;
    /** Son 60 karenin ortalama çizim süresi (ms). Konsoldan okunur. */
    this.cost = 0;
    this.onFrame = (now) => this.frame(now);
  }

  setScene(scene) {
    this.scene = scene;
    this.img = null;
    this.layers = [];
    this.setLive(false);
    const img = new Image();
    img.decoding = 'async';
    img.src = scene.src;
    this.pending = img;
    const ready = () => {
      if (this.pending !== img) return;
      this.img = img;
      this.t = 0;
      this.layers = (SCENE_MOTION[scene.theme] ?? []).map((cfg) => LAYERS[cfg.type](cfg, img));
      this.canvas.style.filter = scene.filter ?? '';
      // Tuval kendi giriş animasyonunu oynar; img'ninki gizlendiği için görünmez.
      this.canvas.style.animation = 'none';
      void this.canvas.offsetWidth;
      this.canvas.style.animation = '';
      if (this.running) this.kickLoop();
    };
    // decode() değil onload: arka plandaki/gizli sekmede decode sözü hiç
    // çözülmeyebiliyor (ölçüldü), menü sonsuza dek durağan kalıyordu.
    if (img.complete && img.naturalWidth) ready();
    else img.onload = ready;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.kickLoop();
  }

  /**
   * Son kare tuvalde kalır: perde 320 ms'de solarken img'ye geri dönmek
   * (yakınlaşmasız kare) gözle görülür bir sıçrama yapıyordu.
   */
  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /** Hareket anahtarı değişince çağrılır (mainMenu.js). */
  sync() {
    if (this.running) this.kickLoop();
  }

  kick(amount) {
    this.shake = Math.max(this.shake, amount);
  }

  kickLoop() {
    if (this.raf || !this.running) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.onFrame);
  }

  setLive(live) {
    this.host?.classList.toggle('is-live', live);
    if (!live) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  frame(now) {
    this.raf = 0;
    if (!this.running) return;
    // Anahtar kapalıyken döngü kendini bırakır; sync() yeniden başlatır.
    if (!motionOn()) { this.setLive(false); return; }
    this.raf = requestAnimationFrame(this.onFrame);
    if (!this.img) return;
    // Sekme arkadayken rAF durur; dönüşte koca bir adım parçacıkları fırlatmasın.
    // rAF damgası kickLoop'taki performance.now()'dan önce olabilir: eksi adım.
    const dt = clamp((now - this.last) / 1000, 0, 0.05);
    this.last = now;
    this.t += dt;
    const start = performance.now();
    this.draw(dt);
    this.cost += (performance.now() - start - this.cost) / 60;
    if (!this.host?.classList.contains('is-live')) this.setLive(true);
  }

  /**
   * Kamera: object-fit: cover + object-position ile AYNI kadrajdan başlar
   * (t=0'da img ile birebir), sonra 90 sn'lik bir solukla %7'ye kadar
   * yakınlaşıp kayar. Kayma her an yakınlaşmanın açtığı payın içindedir;
   * kenarda boşluk açılmaz.
   */
  view(dt) {
    const { canvas, img, t } = this;
    // Tuval CSS pikselinde tutulur: resim zaten 1672 px, DPR çarpanı yalnız
    // dolgu maliyeti getirir.
    const cw = Math.round(canvas.clientWidth);
    const ch = Math.round(canvas.clientHeight);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const z = 1 + 0.035 * (1 - Math.cos((t * TAU) / 90));
    const s = Math.max(cw / W, ch / H) * z;
    const w = W * s;
    const h = H * s;
    const [px, py] = (this.scene.position ?? '50% 50%').split(/\s+/).map((p) => parseFloat(p) / 100);
    // Yakınlaşmanın açtığı pay: w·(1 − 1/z). t=0'da sıfır, img ile aynı kare.
    const padX = w * (1 - 1 / z);
    const padY = h * (1 - 1 / z);
    let ox = (cw - w) * px + Math.sin((t * TAU) / 130) * 0.4 * padX;
    let oy = (ch - h) * py + Math.sin((t * TAU) / 110) * 0.25 * padY;
    if (this.shake > 0.05) {
      ox += rand(-1, 1) * this.shake;
      oy += rand(-1, 1) * this.shake * 0.6;
      this.shake *= Math.exp(-dt * 7);
    } else this.shake = 0;
    ox = clamp(ox, cw - w, 0);
    oy = clamp(oy, ch - h, 0);
    return {
      cw, ch, ox, oy, w, h, s,
      unit: ch / 1080,
      x: (u) => ox + u * w,
      y: (v) => oy + v * h,
    };
  }

  draw(dt) {
    const { ctx, img } = this;
    const view = this.view(dt);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'copy';
    ctx.globalAlpha = 1;
    ctx.drawImage(img, view.ox, view.oy, view.w, view.h);
    ctx.globalCompositeOperation = 'source-over';
    for (const layer of this.layers) {
      layer.draw(ctx, view, this.t, dt, this);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
