// MEVSİM SAATİ ve İKLİM ALANI — haritanın takvimle değişen görünümünün verisi.
//
// Yalnız görseldir: oyun durumunu okur, hiçbir şey yazmaz, oyunun zarına
// dokunmaz. Gürültü ve rastgelelik gerekirse yerel hash kullanılır.
//
// Sıcaklık modeli tek satırdır ve shader ile JS aynı satırı kullanır:
//
//   sıcaklık(°C) = yıllık ortalama + işaretli genlik × S(takvim)
//
// Ortalama karenin kendi `temperature` değerinden gelir (0..1 ≈ −20..30 °C,
// earthTerrain.js ile aynı ölçek), yani yükseklik ve enlem zaten içindedir.
// Genlik enlem ve karasallıkla büyür; işareti yarımküreyi taşır, bu yüzden
// güney yarımkürede mevsimler kendiliğinden terstir.
//
// Katman notu: DOM'a dokunmaz, Node'da sınanabilir.

const TAU = Math.PI * 2;

/** S'nin tepe yaptığı gün: sıcak, güneşin tepesinden ~5 hafta sonra gelir. */
const WARM_PEAK_DAY = 200;

/**
 * Yılın gününden mevsim durumu.
 *   S     +1 kuzeyde yaz ortası, −1 kış ortası
 *   cool  >0 kuzey soğurken (ağustos-ocak): yaprak dökümü buna bakar
 *   decl  güneşin dik açısı (radyan): gece-gündüz çizgisinin eğimi
 */
export function seasonAt(dayOfYear) {
  const a = (TAU * (dayOfYear - WARM_PEAK_DAY)) / 365;
  return {
    day: dayOfYear,
    S: Math.cos(a),
    cool: Math.sin(a),
    decl: 0.4091 * Math.sin((TAU * (dayOfYear - 80)) / 365),
  };
}

/** UTC tarihin yıl içindeki günü (0 = 1 Ocak). */
export function dayOfYear(date) {
  return (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
}

/**
 * Ekvator satırı: satır ortalaması en sıcak olan yer. Üretilen dünyada orta
 * satırdır, Earth haritasında enlem aralığı simetrik olmadığından kayar.
 */
export function equatorRow(world) {
  const { cols, rows, tiles } = world;
  const mean = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let c = 0; c < cols; c++) sum += tiles[r * cols + c]?.temperature ?? 0;
    mean[r] = sum / cols;
  }
  // Tek satırlık gürültü ekvatoru oynatmasın: geniş pencereyle en sıcak kuşak.
  const reach = Math.max(2, Math.round(rows / 10));
  let best = rows >> 1;
  let top = -Infinity;
  for (let r = 0; r < rows; r++) {
    let sum = 0;
    for (let k = -reach; k <= reach; k++) sum += mean[Math.max(0, Math.min(rows - 1, r + k))];
    if (sum > top) {
      top = sum;
      best = r;
    }
  }
  return best;
}

/** Yatayda sarmal, dikeyde kenetli kutu bulanıklığı; n kanallı değil, tek alan. */
function blur(src, w, h, radius) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += src[base + ((k % w) + w) % w];
    for (let x = 0; x < w; x++) {
      tmp[base + x] = sum / span;
      sum += src[base + (x + radius + 1) % w] - src[base + ((x - radius) % w + w) % w];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += tmp[Math.max(0, Math.min(h - 1, k)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / span;
      sum += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
    }
  }
  return out;
}

const FOREST_WEIGHT = { FOREST: 1, JUNGLE: 1, HILLS: 0.3, GRASSLAND: 0.08 };

/**
 * İklim rasteri, kıyı alanıyla aynı ızgarada (hex başına 4 teksel, doğrusal
 * süzülür). RGBA8:
 *   R yükseklik (surfaceGL'in eski R8 yükseklik dokusunun birebir aynısı)
 *   G orman payı
 *   B yıllık ortalama: (°C + 40) / 90
 *   A işaretli mevsim genliği: 0.5 + °C / 80
 */
export function buildClimateRaster(world, w, h, surface) {
  const { cols, rows, tiles } = world;
  const sub = w / cols;
  const half = sub / 2;
  const eq = equatorRow(world);
  const halfSpan = Math.max(eq, rows - 1 - eq, 1);

  // Karasallık: geniş komşulukta kara payı (hex ızgarasında, ucuz).
  const landHex = new Float32Array(cols * rows);
  for (let i = 0; i < landHex.length; i++) landHex[i] = tiles[i]?.terrain.water ? 0 : 1;
  const inland = blur(blur(landHex, cols, rows, 4), cols, rows, 3);

  const forest = new Float32Array(w * h);
  const mean = new Float32Array(w * h);
  const amp = new Float32Array(w * h);
  for (let row = 0; row < rows; row++) {
    const lat = Math.abs(row - eq) / halfSpan;
    const sign = row <= eq ? 1 : -1;
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const tile = tiles[i];
      if (!tile) continue;
      const water = tile.terrain.water;
      const t = inland[i];
      const swing = water
        ? 1.5 + 8 * lat ** 0.9
        : (3 + 17 * lat ** 0.85) * (0.55 + 0.55 * Math.max(0, Math.min(1, (t - 0.45) / 0.5)));
      // Kara yükseklik cezasıyla üretildiği için ova deniz seviyesinden soğuk
      // kalıyordu: düzeltmesiz, kuzey karasının yarısı yıl boyu karlı çıkıyor.
      const m = (tile.temperature ?? 0.5) * 50 - 20 + (water ? 0 : 6.5);
      const f = water ? 0 : (FOREST_WEIGHT[tile.terrain.id] ?? 0);
      const x0 = 2 * col * half + (row & 1) * half;
      const y0 = row * sub;
      for (let sy = 0; sy < sub; sy++) {
        const yy = y0 + sy;
        if (yy >= h) continue;
        for (let sx = 0; sx < sub; sx++) {
          const p = yy * w + (((x0 + sx) % w) + w) % w;
          forest[p] = f;
          mean[p] = m;
          amp[p] = swing * sign;
        }
      }
    }
  }
  const forestSoft = blur(forest, w, h, 2);
  const meanSoft = blur(mean, w, h, 2);
  const ampSoft = blur(amp, w, h, 2);
  const out = new Uint8Array(w * h * 4);
  const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < w * h; i++) {
    const p = i * 4;
    out[p] = byte(surface[i]);
    out[p + 1] = byte(forestSoft[i]);
    out[p + 2] = byte((meanSoft[i] + 40) / 90);
    out[p + 3] = byte(0.5 + ampSoft[i] / 80);
  }
  return { data: out, w, h, equator: (eq + 0.5) / rows };
}

/**
 * Karın geçikmesi: ilkbaharda kar birikmiş olduğu için geç erir, sonbaharda zemin
 * ılık olduğu için geç tutar. Bu pay olmadan nisan ile ekim aynı görünüyordu.
 */
export const SNOW_LAG = 0.28;

/** Rasterden o noktanın kar için sıcaklığı (°C); shader ile aynı formül. */
export function temperatureAt(raster, u, v, S, cool = 0) {
  const x = Math.floor((((u % 1) + 1) % 1) * raster.w) % raster.w;
  const y = Math.max(0, Math.min(raster.h - 1, Math.floor(v * raster.h)));
  const p = (y * raster.w + x) * 4;
  const mean = (raster.data[p + 2] / 255) * 90 - 40;
  const amp = (raster.data[p + 3] / 255 - 0.5) * 80;
  return mean + amp * (S + SNOW_LAG * cool);
}
