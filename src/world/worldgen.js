// Prosedürel dünya üretimi. Seed -> yükseklik/nem/sıcaklık -> arazi -> kıtalar.

import { makeRng } from '../core/rng.js';
import { makeNoise2D, fbm } from '../core/noise.js';
import { classify, SEA_LEVEL, TERRAIN } from './terrain.js';
import { DIRS, SQRT3, axialToOffset, hexDistance, hexToPixel, offsetToAxial, wrapCol } from '../core/hex.js';
import { generateCultures } from './cultures.js';

/** Hex dış yarıçapı (dünya birimi). Ekran ölçeği kamera zoom'undan gelir. */
export const HEX_SIZE = 26;

export const DEFAULT_OPTIONS = {
  cols: 200,
  rows: 160,
  /** 0 = bol ada, 1 = tek büyük kıta */
  continentality: 0.5,
  /** Deniz seviyesi kaydırması: + = daha çok kara */
  landBias: 0,
};

export class World {
  constructor(cols, rows, seed) {
    this.cols = cols;
    this.rows = rows;
    this.seed = seed;
    this.tiles = [];
    this.landCount = 0;
    this.bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    // Silindir dünyanın piksel periyodu. bounds genişliği DEĞİL: bounds pad taşır.
    this.wrapWidth = cols * SQRT3 * HEX_SIZE;
  }

  /** Axial erişim; doğu-batı sarmalı burada çözülür, kutuplar dışarıda kalır. */
  get(q, r) {
    if (r < 0 || r >= this.rows) return undefined;
    const { col } = axialToOffset(q, r);
    return this.tiles[r * this.cols + wrapCol(col, this.cols)];
  }

  /** Offset ızgara erişimi: çizimde görünür aralığı taramak için. */
  tileAt(col, row) {
    if (row < 0 || row >= this.rows) return undefined;
    return this.tiles[row * this.cols + wrapCol(col, this.cols)];
  }

  /** Yalnız kutup satırlarında komşu eksilir; doğu-batı kenarı sarmalla kapanır. */
  neighbors(tile) {
    const out = [];
    for (let i = 0; i < 6; i++) {
      const n = this.get(tile.q + DIRS[i][0], tile.r + DIRS[i][1]);
      if (n) out.push(n);
    }
    return out;
  }

  /**
   * Silindir metriği: iki hex arasındaki gerçek mesafe. Offset'te tam tur,
   * axial q'da ±cols kaymasına denk gelir (r sarmada değişmez).
   */
  wrapDistance(aq, ar, bq, br) {
    const direct = hexDistance(aq, ar, bq, br);
    const east = hexDistance(aq + this.cols, ar, bq, br);
    const west = hexDistance(aq - this.cols, ar, bq, br);
    return Math.min(direct, east, west);
  }

  forEach(fn) {
    for (let i = 0; i < this.tiles.length; i++) fn(this.tiles[i], i);
  }
}

export function generateWorld(seed, options = {}) {
  const opt = { ...DEFAULT_OPTIONS, ...options };
  const rng = makeRng(seed);
  const world = new World(opt.cols, opt.rows, seed);

  const elevNoise = makeNoise2D(rng);
  const moistNoise = makeNoise2D(rng);
  const tempNoise = makeNoise2D(rng);
  const detailNoise = makeNoise2D(rng);

  // Gürültü uzayında haritayı kare tutmak için ölçek.
  const nx = 1 / opt.cols;
  const ny = 1 / opt.rows;

  // --- 1. geçiş: ham yükseklik alanı ---
  const raw = new Float32Array(opt.cols * opt.rows);
  for (let row = 0; row < opt.rows; row++) {
    for (let col = 0; col < opt.cols; col++) {
      const u = col * nx;
      const v = row * ny;

      // Dünya doğu-batıda silindir: yalnız kutup satırları denize çekilir.
      const dist = Math.abs(v - 0.5) * 2;
      const falloff = Math.pow(Math.max(0, 1 - Math.pow(dist, 2.6)), 1.1);

      let e = fbm(elevNoise, u * 4, v * 4, { octaves: 6, gain: 0.52, periodX: 4 });
      // continentality: yüksek -> alçak yerler bastırılır, kara tek parça toplanır
      e = Math.pow(e, 1 + opt.continentality * 1.2);
      e += fbm(detailNoise, u * 12, v * 12, { octaves: 3, periodX: 12 }) * 0.12 - 0.06;
      raw[row * opt.cols + col] = e * falloff + (falloff - 1) * 0.15;
    }
  }

  // Deniz seviyesi sabit eşik değil, yüzdelik dilim: kara oranı hep kontrollü.
  const targetLand = Math.min(0.9, Math.max(0.05, 0.34 + opt.landBias));
  const sorted = Float32Array.from(raw).sort();
  const waterShare = 1 - targetLand;

  // --- 2. geçiş: normalize et, iklimi hesapla, arazi ata ---
  for (let row = 0; row < opt.rows; row++) {
    for (let col = 0; col < opt.cols; col++) {
      const { q, r } = offsetToAxial(col, row);
      const u = col * nx;
      const v = row * ny;
      const e = raw[row * opt.cols + col];

      // Sıralama (rank) tabanlı eşleme: biyom oranları gürültünün dağılımından bağımsız.
      const rank = rankOf(sorted, e);
      let elevation;
      if (rank < waterShare) {
        elevation = (rank / waterShare) * SEA_LEVEL;
      } else {
        const lr = (rank - waterShare) / targetLand;
        // Kare eğri: alçak arazi bol, yüksek zirve seyrek.
        elevation = SEA_LEVEL + Math.pow(lr, 2) * (1 - SEA_LEVEL);
      }

      // Sıcaklık: enleme bağlı (kutuplar soğuk) + yükseklik cezası + biraz gürültü.
      const latitude = Math.abs(v - 0.5) * 2;
      let temperature = 1 - Math.pow(latitude, 1.25);
      temperature -= Math.max(0, elevation - SEA_LEVEL) * 0.7;
      temperature += (fbm(tempNoise, u * 3, v * 3, { octaves: 3, periodX: 3 }) - 0.5) * 0.18;
      temperature = Math.min(1, Math.max(0, temperature));

      // fbm değerleri ortalamaya toplanır; kontrastı açmazsak her yer aynı biyom olur.
      let moisture = (fbm(moistNoise, u * 5, v * 5, { octaves: 5, periodX: 5 }) - 0.5) * 1.9 + 0.5;
      // Kutuplar kuru, ekvator nemli; ~30. enlemde (at enlemleri) kurak kuşak -> çöller.
      const horseLat = Math.exp(-Math.pow((latitude - 0.36) / 0.12, 2));
      moisture = moisture * (0.8 + (1 - latitude) * 0.4 - horseLat * 0.4);
      moisture = Math.min(1, Math.max(0, moisture));

      const terrain = classify(elevation, moisture, temperature);
      const pixel = hexToPixel(q, r, HEX_SIZE);

      const tile = {
        q, r, col, row,
        x: pixel.x, y: pixel.y,
        elevation, moisture, temperature,
        terrain,
        coastal: false,
        river: false,
        owner: -1,      // ülke index'i, -1 = sahipsiz
        culture: -1,    // halk id'si; ülke sınırından bağımsız
        continent: -1,  // kara kütlesi id'si
      };

      world.tiles.push(tile);
      if (!terrain.water) world.landCount++;
    }
  }

  markCoasts(world);
  labelContinents(world);
  generateCultures(world, rng);
  // Kayıt yalnız üretilenden sapan kareleri yazar; taban kültür karşılaştırma için.
  world.forEach((t) => { t.baseCulture = t.culture; });
  // Kaydı aynı ayarlarla geri kurabilmek için üretim seçenekleri saklanır.
  world.genOptions = { ...opt };
  computeBounds(world);
  return world;
}

/** Değerin sıralı dizideki göreli konumu (0..1). Alt sınır ikili arama. */
function rankOf(sorted, value) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo / sorted.length;
}

/** Kıyı bayrağı + alçak ılıman kıyılarda kumsal şeridi. */
function markCoasts(world) {
  world.forEach((tile) => {
    if (tile.terrain.water) return;
    tile.coastal = world.neighbors(tile).some((n) => n.terrain.water);
    if (
      tile.coastal &&
      tile.elevation < SEA_LEVEL + 0.018 &&
      tile.temperature > 0.3 &&
      tile.terrain !== TERRAIN.MOUNTAIN
    ) {
      tile.terrain = TERRAIN.BEACH;
    }
  });
}

/** Bitişik kara parçalarını numaralandırır; ülke tohumlarını dağıtırken lazım. */
function labelContinents(world) {
  let id = 0;
  const stack = [];
  world.forEach((tile) => {
    if (tile.terrain.water || tile.continent !== -1) return;
    const current = id++;
    stack.length = 0;
    stack.push(tile);
    tile.continent = current;
    let size = 0;
    while (stack.length) {
      const t = stack.pop();
      size++;
      for (const n of world.neighbors(t)) {
        if (!n.terrain.water && n.continent === -1) {
          n.continent = current;
          stack.push(n);
        }
      }
    }
    world.continentSizes = world.continentSizes || [];
    world.continentSizes[current] = size;
  });
  world.continentCount = id;
}

function computeBounds(world) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  world.forEach((t) => {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x > maxX) maxX = t.x;
    if (t.y > maxY) maxY = t.y;
  });
  const pad = HEX_SIZE * 1.5;
  world.bounds = {
    minX: minX - pad, minY: minY - pad,
    maxX: maxX + pad, maxY: maxY + pad,
  };
}

export { TERRAIN };
