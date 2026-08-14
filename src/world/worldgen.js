// Prosedürel dünya üretimi.
//
//   coğrafya (kıta iskeleti; geography.js) -> yükseklik -> iklim -> arazi
//
// Kıtaların BİÇİMİ burada değil geography.js'te doğar; burası o fiziksel
// iskeleti iklime ve arazi tiplerine çevirir. Gürültü artık kıta üretmez,
// yalnız sıcaklık/nem dokusunu ve kıyı ayrıntısını verir.

import { makeRng } from '../core/rng.js';
import { makeNoise2D, fbm } from '../core/noise.js';
import { classify, SEA_LEVEL, TERRAIN } from './terrain.js';
import { DIRS, SQRT3, axialToOffset, hexDistance, hexToPixel, offsetToAxial, wrapCol } from '../core/hex.js';
import { generateCultures } from './cultures.js';
import { generateProvinces } from './provinces-gen.js';
import { buildGeography, zoneAnchors } from './geography.js';

/** Hex dış yarıçapı (dünya birimi). Ekran ölçeği kamera zoom'undan gelir. */
export const HEX_SIZE = 26;

/**
 * STANDART DÜNYA: 160 x 96, doğu-batı sarmalı açık, kuzey-güney kapalı.
 * Denge hedefi budur; şablon coğrafya bu ölçüye göre tasarlandı
 * (bkz. docs/cografya.md). Kaydırıcı başka boy verebilir ama iskelet en/boy
 * oranı 160:96'ya (5:3) yakın kaldığı sürece okunur kalır.
 */
export const STANDARD_COLS = 160;
export const STANDARD_ROWS = 96;

/** Hedef kara oranı: okyanuslar geniş kalsın diye üçte birin biraz üstü. */
export const TARGET_LAND = 0.36;

/**
 * Kaydırıcı yalnız sütun verir; satır standart en/boy oranından türer.
 * Oran korunmazsa şablon kıtalar yatay/dikey ezilir (bkz. geography.js TX).
 */
export function worldRows(cols) {
  return Math.max(24, Math.round(cols * (STANDARD_ROWS / STANDARD_COLS)));
}

export const DEFAULT_OPTIONS = {
  cols: STANDARD_COLS,
  rows: STANDARD_ROWS,
  /** 0 = daha çok ada ve kırık kıyı, 1 = daha derli toplu kıta */
  continentality: 0.5,
  /** Kara oranı kaydırması: + = daha çok kara */
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

  // Fiziksel coğrafya kendi rng dalını kullanır; iklim/kültür akışı kaymaz.
  const geo = buildGeography(seed, opt.cols, opt.rows, {
    targetLand: Math.min(0.55, Math.max(0.15, TARGET_LAND + opt.landBias)),
    continentality: opt.continentality,
  });

  const moistNoise = makeNoise2D(rng);
  const tempNoise = makeNoise2D(rng);
  const depthNoise = makeNoise2D(rng);

  const nx = 1 / opt.cols;
  const ny = 1 / opt.rows;
  const total = opt.cols * opt.rows;

  // Kara yüksekliği SIRALAMAYLA eşlenir: tepe/yayla/ova oranları coğrafya
  // alanının dağılımından bağımsız kalsın (dağ zinciri nerede olursa olsun
  // dünyanın %11'i dağ). Sıralama yalnız kara karelerinden kurulur.
  const landHeights = [];
  for (let i = 0; i < total; i++) if (geo.land[i]) landHeights.push(geo.height[i]);
  landHeights.sort((a, b) => a - b);
  const landSorted = Float32Array.from(landHeights);

  for (let row = 0; row < opt.rows; row++) {
    for (let col = 0; col < opt.cols; col++) {
      const idx = row * opt.cols + col;
      const { q, r } = offsetToAxial(col, row);
      const u = col * nx;
      const v = row * ny;
      const isLand = geo.land[idx] === 1;

      let elevation;
      if (isLand) {
        const lr = rankOf(landSorted, geo.height[idx]);
        // Kare eğri: alçak arazi bol, yüksek zirve seyrek.
        elevation = SEA_LEVEL + Math.pow(lr, 2) * (1 - SEA_LEVEL);
      } else {
        elevation = SEA_LEVEL - shelfDepth(geo.toLand[idx], depthNoise, u, v);
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
      moisture *= 0.8 + (1 - latitude) * 0.4 - horseLat * 0.4;
      // Karasallık: denizden uzak iç bölge kurur. Çöl/bozkır artık rastgele
      // değil, coğrafyanın sonucudur (geniş kıta içi = kurak kuşak).
      if (isLand) moisture -= 0.12 * (1 - Math.exp(-geo.toWater[idx] / 9));
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
        // Makro bölge: province boyu, nüfus/gelişim çarpanı ve arketip
        // yerleşimi buradan okur. Deniz bölgesizdir.
        zone: isLand ? geo.zones[idx] : null,
      };

      world.tiles.push(tile);
      if (!terrain.water) world.landCount++;
    }
  }

  markCoasts(world);
  labelContinents(world);
  generateCultures(world, rng);
  // Province bölümlemesi kültürden sonra: küme, üye çoğunluğunun kültürüne
  // "snap" eder. Kendi rng dalını kullanır, ana akışı kaydırmaz.
  generateProvinces(world);
  // Kayıt yalnız üretilenden sapan kareleri yazar; taban kültür karşılaştırma için.
  world.forEach((t) => { t.baseCulture = t.culture; });
  // Arketip ülke yerleşimi bölge çapalarını arar (bkz. nations.js). Çapa
  // şablon noktası değil GERÇEK kara ağırlık merkezidir: bükülme sonrası
  // bölge nereye kaydıysa oraya.
  world.macroAnchors = zoneAnchors(geo.zones, opt.cols, opt.rows, geo.anchors);
  // Coğrafya karnesi: denetim betikleri ve hata ayıklama okur, oyun okumaz.
  world.geo = {
    stats: geo.stats, score: geo.score, reasons: geo.reasons, attempt: geo.attempt,
  };
  // Kaydı aynı ayarlarla geri kurabilmek için üretim seçenekleri saklanır.
  world.genOptions = { ...opt };
  computeBounds(world);
  return world;
}

/**
 * Deniz derinliği kıyıdan uzaklıkla bantlanır: 1 kare sahanlık, 2-4 kare
 * açık deniz, sonrası derin. Gürültü yalnız bant kenarını tırtıklar — yoksa
 * kıtaların çevresinde mükemmel halkalar oluşur.
 */
function shelfDepth(distance, noise, u, v) {
  const d = Math.max(1, distance);
  const base = d <= 1 ? 0.022 : 0.048 + Math.min(0.24, (d - 1) * 0.038);
  const jitter = (fbm(noise, u * 9, v * 9, { octaves: 2, periodX: 9 }) - 0.5) * 0.03;
  return Math.min(0.34, Math.max(0.012, base + (d <= 1 ? jitter * 0.3 : jitter)));
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
      tile.elevation < SEA_LEVEL + 0.011 &&
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
