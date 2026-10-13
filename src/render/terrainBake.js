// ARAZİ TEMELİ — hex verisinden sürekli alanlar (yükseklik, biyom, iklim).
//
// Neden ayrı bir pişirme: bugünkü kabartma hex başına 4x4 tuğladan kurulan
// R8 bir rasterden gelir (material.js). Yakın zoomda bir hex ~158 piksel,
// bir teksel ~39 piksel eder; tuğla basamağı, düz zirve ve "çakıl mozaiği"
// oradan çıkıyordu. Burada hex MERKEZLERİ Gauss ağırlığıyla süzülür (tuğla
// yok), dağ/tepe ağırlığıyla kapılanan ayrıntı eklenir (yamaç yönüne hizalı
// oluklar + sırtlı gürültü), kıyı GL yüzeyinin kullandığı yumuşak kıyı
// eğrisine (borderMesh.coastMesh) teksel altı hassasiyetle bağlanır.
// Biyomlar da aynı süzmeden gelir ama örnek noktası periyodik gürültüyle
// bükülür: ekoton hex kenarını değil arazinin kendisini izler.
//
// YALNIZ klasik dışı bir görsel stil (?gfx=...) açıkken çalışır; klasik
// yolun maliyeti sıfırdır.
//
// Çıktı (bkz. surfaceGL.setTerrain, gfx/terrainGLSL.js):
//   height: TERRAIN_SUB teksel/hex, RGBA float
//     R yükseklik (kıyıda 0, en yüksek zirve ~1, denizde hafif eksi)
//     G taban yükseklik (ayrıntısız, yalnız süzülmüş hex yüksekliği)
//     B yayla kapısı (dağ 1, tepe ~0.5, ova 0) — ayrıntının ağırlığı
//     A kıyıya işaretli uzaklık (hex eni cinsinden; kara +, deniz −; ±8)
//   biome: BIOME_SUB teksel/hex, 3 katman RGBA8 (ilk on kanal toplamı 1)
//     0: orman, cangıl, çayır, bozkır   1: çöl, tundra, kar, kaya
//     2: bataklık, kumsal, sıcaklık, nem
//
// Determinizm: RNG akışı YOK; her gürültü (x, y, tohum ^ tuz) karmasından
// gelir. Tohum dünyanın tohumundan türer, tuz alan başına sabittir — yeni bir
// alan eklemek eskilerini kaydırmaz (material.stageFields'in tek akış
// sorunu burada yok).
//
// Sarmal: x her yerde periyodiktir (gürültü kafesi periyodu tam sayı hücre),
// y kenara kenetlenir.
//
// Katman notu: DOM'a DOKUNMAZ (Node'da test edilir, Worker'a taşınabilir).

import { SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { SEA_LEVEL } from '../world/terrain.js';
import { coastMesh, meshGlTable } from './borderMesh.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
const ROW_H = HEX_SIZE * 1.5;
const X0 = -HEX_STEP / 2;
const Y0 = -ROW_H / 2;
const TAU = Math.PI * 2;

/** Yükseklik dokusunun hex başına teksel sayısı. 8: yakın zoomda teksel ~20 CSS px. */
export const TERRAIN_SUB = 8;
/** Kaba alanların (biyom, iklim, kapılar) hex başına teksel sayısı. */
export const BIOME_SUB = 4;

/** Biyom kanalları; doku katmanı = indeks >> 2, kanal = indeks & 3. */
export const BIOMES = ['forest', 'jungle', 'grass', 'steppe', 'desert', 'tundra',
  'snow', 'rock', 'marsh', 'beach'];
const NB = BIOMES.length;
const B_FOREST = 0;
const B_JUNGLE = 1;
const B_GRASS = 2;
const B_STEPPE = 3;
const B_DESERT = 4;
const B_TUNDRA = 5;
const B_SNOW = 6;
const B_ROCK = 7;
const B_MARSH = 8;
const B_BEACH = 9;

/**
 * Ayar. Yükseklik birimi normalize yükseklik: (elev − deniz) / (1 − deniz),
 * yani kara medyanı ~0.25, dağ eşiği 0.79, kar eşiği 0.90 (worldgen rank²).
 */
export const BAKE = {
  /** Yükseklik/kapı/iklim süzgeci (hex eni). Merkezde kendi payı ~%66. */
  sigmaH: 0.45,
  /**
   * Ovada geniş süzgeç: hex yükseklikleri ovada küçük rastgele farklar
   * taşır ve dar süzgeçte her hex kendi tümseği olur — ışıkta hex ızgarası
   * ("fitilli kumaş"). Engebe kapısı düşükken bu genişlik kullanılır.
   */
  sigmaWide: 0.85,
  /** Biyom süzgeci; daha dar: hexin kendi biyomu merkezde ~%80. */
  sigmaB: 0.55,
  /** Örnek noktasının bükülmesi (hex): geniş ve ince ölçek. */
  warpBroad: 0.55, warpBroadCell: 3.0,
  warpFine: 0.24, warpFineCell: 1.0,
  /** Büyük sırt (zirve/eyer dizisi): hücre (hex), genlik, bükülme. */
  ridgeCell: 2.3, ridgeAmp: 0.20, ridgeOctaves: 2,
  ridgeWarp: 0.7, ridgeWarpCell: 3.0,
  /** Yamaç olukları: dalga boyu (hex), hücre (hex), genlik. İki oktav. */
  gullyWave: 1.25, gullyCell: 1.3, gullyAmp: 0.075,
  /** Oluğun açılması için gereken taban eğimi (yükseklik / hex). */
  gullySlope0: 0.04, gullySlope1: 0.22,
  /** Tepe dalgası. */
  hillCell: 1.05, hillAmp: 0.06,
  /** Ova dalgalanması: çok hafif, düzlük ölü düz durmasın diye. */
  lowCell: 1.8, lowAmp: 0.012,
  /** Kıyı rampası (hex): kara bu mesafede tam yüksekliğine çıkar. */
  coastRamp: 0.85,
  /** Denizin kıyıdan uzaklaştıkça indiği sığ eksi yükseklik. */
  seaDip: 0.04,
};

/** 19'lu komşuluk (eksenel uzaklık ≤ 2): σ=0.45 hex Gauss'u kesmeden taşır. */
const RING = [];
for (let dr = -2; dr <= 2; dr++) {
  for (let dq = -2; dq <= 2; dq++) {
    if (Math.abs(dq + dr) > 2) continue;
    RING.push([dq, dr]);
  }
}
const RING_DX = new Float64Array(RING.map(([dq, dr]) => SQRT3 * HEX_SIZE * (dq + dr / 2)));
const RING_DY = new Float64Array(RING.map(([, dr]) => 1.5 * HEX_SIZE * dr));

/** exp(−d²/2σ²) çizelgesi; d² hex² biriminde, [0, 8) aralığı. */
const LUT_N = 2048;
const LUT_SCALE = LUT_N / 8;
function gaussLut(sigma) {
  const lut = new Float32Array(LUT_N + 1);
  for (let i = 0; i <= LUT_N; i++) lut[i] = Math.exp(-(i / LUT_SCALE) / (2 * sigma * sigma));
  return lut;
}

/** Tohum: dünya tohumundan FNV-1a; tuz ayrı alanları ayırır. */
export function terrainSeed(world) {
  const text = String(world.seed ?? 'hexwar');
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h ^ 0x5bd1e995) >>> 0;
}

// ---------------------------------------------------------------- gürültü

const GX = new Float32Array(16);
const GY = new Float32Array(16);
for (let k = 0; k < 16; k++) {
  const a = ((k + 0.5) * Math.PI) / 8;
  GX[k] = Math.cos(a);
  GY[k] = Math.sin(a);
}

function hash3(ix, iy, s) {
  let h = (Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy + 0x3c6ef372, 0x165667b1) ^ s) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * Periyodik gradyan gürültüsü. Kafes x'te `per` hücrede kendine sarılır,
 * hücre boyu dünya eni / per: sarmal dikişinde gürültü kesintisiz devam eder.
 * Çıkış kabaca [−1, 1].
 */
function perlin(u, v, per, s) {
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  let x0 = iu % per;
  if (x0 < 0) x0 += per;
  const x1 = x0 + 1 === per ? 0 : x0 + 1;
  const h00 = hash3(x0, iv, s) & 15;
  const h10 = hash3(x1, iv, s) & 15;
  const h01 = hash3(x0, iv + 1, s) & 15;
  const h11 = hash3(x1, iv + 1, s) & 15;
  const n00 = GX[h00] * fu + GY[h00] * fv;
  const n10 = GX[h10] * (fu - 1) + GY[h10] * fv;
  const n01 = GX[h01] * fu + GY[h01] * (fv - 1);
  const n11 = GX[h11] * (fu - 1) + GY[h11] * (fv - 1);
  const su = fu * fu * fu * (fu * (fu * 6 - 15) + 10);
  const sv = fv * fv * fv * (fv * (fv * 6 - 15) + 10);
  const a = n00 + (n10 - n00) * su;
  const b = n01 + (n11 - n01) * su;
  return (a + (b - a) * sv) * 1.41;
}

/** Hücre boyu (hex) → periyodik kafes: tam sayı periyot, gerçek hücre boyu. */
function octave(spanX, cellHex, seed, salt) {
  const per = Math.max(1, Math.round(spanX / (cellHex * HEX_STEP)));
  return { per, cell: spanX / per, inv: per / spanX, s: (seed ^ Math.imul(salt, 0x9e3779b1)) | 0 };
}

function noiseAt(o, wx, wy) {
  return perlin((wx - X0) * o.inv, (wy - Y0) * o.inv, o.per, o.s);
}

/**
 * YAMAÇ OLUKLARI (fazör gürültüsü). Hücre başına rastgele fazlı şeritler
 * yamaç yönüne PARALEL uzanır; komşu hücreler yumuşak ağırlıkla karışır, faz
 * farkı birleşme yerinde dallanma gibi okunur. Aşınmış dağın en tanıdık
 * izi budur: sırttan vadiye inen oluk demetleri. İzotropik sırtlı gürültü
 * yönsüz "solucan" desenine düşüyordu (Node önizlemesinde görüldü).
 * (dx, dy) birim yamaç yönü; dönüş [−1, 1].
 */
function gullies(o, wave, x, y, dx, dy) {
  const u = (x - X0) * o.inv;
  const v = (y - Y0) * o.inv;
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const k = TAU / wave;
  // Şerit yönü yamaç yönü: faz yalnız DİK eksende değişir.
  const px = -dy;
  const py = dx;
  const cell = o.cell;
  const sig = 1 / (0.55 * cell * cell);
  let sc = 0;
  let sw = 0;
  for (let j = -1; j <= 1; j++) {
    const cy = iv + j;
    for (let i = -1; i <= 1; i++) {
      const cx = iu + i;
      let hx = cx % o.per;
      if (hx < 0) hx += o.per;
      const h = hash3(hx, cy, o.s);
      const qx = (cx + 0.5 + ((h & 255) / 255 - 0.5) * 0.7 - u) * cell;
      const qy = (cy + 0.5 + (((h >>> 8) & 255) / 255 - 0.5) * 0.7 - v) * cell;
      const w = Math.exp(-(qx * qx + qy * qy) * sig);
      const phase = (-(qx * px + qy * py)) * k + ((h >>> 16) & 1023) * (TAU / 1024);
      sc += w * Math.cos(phase);
      sw += w;
    }
  }
  return sc / (sw + 1e-6);
}

// ---------------------------------------------------------------- yardımcı

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function smoothstep(e0, e1, v) {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Kaba ızgaradan çift doğrusal örnek: x sarmal, y kenetli; (u, v) teksel merkezli. */
function bilerp(f, w, h, u, v) {
  const iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  const x0 = iu < 0 ? iu + w : (iu >= w ? iu - w : iu);
  const x1 = x0 + 1 === w ? 0 : x0 + 1;
  const y0 = iv < 0 ? 0 : (iv >= h ? h - 1 : iv);
  const y1 = iv + 1 < 0 ? 0 : (iv + 1 >= h ? h - 1 : iv + 1);
  const a = f[y0 * w + x0];
  const b = f[y0 * w + x1];
  const c = f[y1 * w + x0];
  const d = f[y1 * w + x1];
  return (a + (b - a) * fu) * (1 - fv) + (c + (d - c) * fu) * fv;
}

// ---------------------------------------------------------------- biyom

/**
 * İklimden bitki örtüsü (orman/cangıl/çayır/bozkır/çöl). Dağ ve tepe
 * hexlerinin yamaçları da bu kuralla giyinir: classify'ın eşikleri
 * (terrain.js) aynı sırayla okunur ki tepe yamacı, aynı iklimde ova olsaydı
 * alacağı örtüyü alsın.
 */
function vegetation(T, M, out, share) {
  if (M < 0.28 && T > 0.5) {
    const s = smoothstep(0.18, 0.28, M);
    out[B_DESERT] += share * (1 - s);
    out[B_STEPPE] += share * s;
  } else if (T > 0.74) {
    if (M > 0.58) out[B_JUNGLE] += share;
    else {
      const s = smoothstep(0.50, 0.30, M);
      out[B_STEPPE] += share * (0.25 + 0.5 * s);
      out[B_GRASS] += share * (0.75 - 0.5 * s);
    }
  } else if (M < 0.30) out[B_STEPPE] += share;
  else if (M > 0.50) out[B_FOREST] += share;
  else out[B_GRASS] += share;
}

/**
 * Bir hexin biyom bileşimi (toplam 1). Kar ve kaya YALNIZ zirve/dağ/tepe
 * hexlerinde doğar (ipucu kutusu ne diyorsa harita da onu göstersin); buz
 * sahanlığı kardır. Bataklık arazi tipi değildir: alçak, çok nemli, nehirli
 * ya da kıyı ovasının bir PAYIDIR, hexin adı değişmez.
 */
export function hexBiome(tile, out = new Float32Array(NB)) {
  out.fill(0);
  const T = tile.temperature;
  const M = tile.moisture;
  const eN = (tile.elevation - SEA_LEVEL) / (1 - SEA_LEVEL);
  switch (tile.terrain.id) {
    case 'SNOW_PEAK':
      out[B_SNOW] = 0.82;
      out[B_ROCK] = 0.18;
      break;
    case 'ICE':
      out[B_SNOW] = 1;
      break;
    case 'MOUNTAIN': {
      // Soğuk dağın sırtında kar saçağı: veride dağların çoğu 0.45'ten
      // soğuk ama zirve eşiğinin altında; tamamen beyaz değil, payla.
      const snow = 0.30 * smoothstep(0.42, 0.30, T);
      out[B_SNOW] = snow;
      out[B_ROCK] = 0.68 - snow * 0.5;
      vegetation(T, M, out, 1 - out[B_SNOW] - out[B_ROCK]);
      break;
    }
    case 'HILLS':
      out[B_ROCK] = 0.16;
      vegetation(T, M, out, 0.84);
      break;
    case 'TUNDRA':
      out[B_TUNDRA] = 1;
      break;
    case 'DESERT':
      out[B_DESERT] = 1;
      break;
    case 'BEACH':
      out[B_BEACH] = 0.78;
      vegetation(T, M, out, 0.22);
      break;
    case 'FOREST':
      out[B_FOREST] = 1;
      break;
    case 'JUNGLE':
      out[B_JUNGLE] = 1;
      break;
    case 'GRASSLAND':
      out[B_GRASS] = 1;
      break;
    case 'PLAINS': {
      const s = smoothstep(0.45, 0.20, M);
      out[B_STEPPE] = 0.35 + 0.55 * s;
      out[B_GRASS] = 1 - out[B_STEPPE];
      break;
    }
    default:
      vegetation(T, M, out, 1);
  }
  // Bataklık: alçak + nemli + (nehir ya da kıyı). Ova tiplerinden pay alır.
  const id = tile.terrain.id;
  if (id === 'GRASSLAND' || id === 'FOREST' || id === 'JUNGLE' || id === 'PLAINS') {
    const wet = smoothstep(MARSH_M0, MARSH_M1, M) * (1 - smoothstep(MARSH_E0, MARSH_E1, eN));
    const near = tile.river ? 1 : (tile.coastal ? 0.8 : 0.45);
    const m = clamp(wet * near * 0.8, 0, 0.8);
    if (m > 0) {
      for (let k = 0; k < NB; k++) out[k] *= 1 - m;
      out[B_MARSH] += m;
    }
  }
  return out;
}
// Bataklık eşikleri ölçülmüş dağılımdan (bkz. scratchpad bake-test): hedef
// karanın ~%2-3'ü bataklık baskın.
const MARSH_M0 = 0.52;
const MARSH_M1 = 0.70;
const MARSH_E0 = 0.06;
const MARSH_E1 = 0.16;

/** Sırt (dağ tipi) ve tepe kapısı: ayrıntının hangi karakterde ve ne kadar bineceği. */
function hexGates(tile, eN) {
  switch (tile.terrain.id) {
    case 'SNOW_PEAK':
    case 'MOUNTAIN':
      return [1, 0];
    case 'HILLS':
      return [0.22, 0.85];
    default:
      // Yüksek tundra/buz: classify sıcaklığı yükseklikten önce okur, yani
      // soğuk yayla "tepe" adını almaz ama yine de engebelidir.
      return [0.35 * smoothstep(0.55, 0.85, eN), 0.45 * smoothstep(0.30, 0.65, eN)];
  }
}

// ---------------------------------------------------------------- iş

/**
 * Dilimli pişirme üreteci. Her `yield` kısa bir dilimdir (~1-4 ms); çağıran
 * kendi bütçesi dolana dek `next()` çağırır. Dönüş değeri sonuçtur.
 *
 * @param world  dünya (tiles: elevation, temperature, moisture, terrain, river, coastal)
 * @param opts   { sub: yükseklik teksel/hex, ...BAKE üzerine yazılacak ayarlar }
 */
export function* terrainBakeJob(world, opts = {}) {
  const P = { ...BAKE, ...opts };
  const SUB = opts.sub ?? TERRAIN_SUB;
  const t0 = nowMs();
  const timings = {};
  const cols = world.cols;
  const rows = world.rows;
  const n = cols * rows;
  const spanX = cols * HEX_STEP;
  const spanY = rows * ROW_H;
  const seed = terrainSeed(world);
  const S = HEX_SIZE;
  const Wc = cols * BIOME_SUB;
  const Hc = rows * BIOME_SUB;
  const CTW = HEX_STEP / BIOME_SUB;
  const CTH = ROW_H / BIOME_SUB;

  // --- 1. hex başına veri ---
  const land = new Uint8Array(n);
  const eN = new Float32Array(n);
  const temp = new Float32Array(n);
  const moist = new Float32Array(n);
  const gR = new Float32Array(n);
  const gH = new Float32Array(n);
  const bio = new Float32Array(n * NB);
  const tmp = new Float32Array(NB);
  for (let i = 0; i < n; i++) {
    const t = world.tiles[i];
    if (!t || t.terrain.water) continue;
    land[i] = 1;
    const e = clamp((t.elevation - SEA_LEVEL) / (1 - SEA_LEVEL), 0, 1);
    eN[i] = e;
    temp[i] = t.temperature;
    moist[i] = t.moisture;
    const [r, h] = hexGates(t, e);
    gR[i] = r;
    gH[i] = h;
    hexBiome(t, tmp);
    bio.set(tmp, i * NB);
  }
  yield 'prep';
  // 19'lu komşuluk tablosu ve "iki halkada kara var mı" bayrağı: açık
  // denizin teksellerine hiç girilmez.
  const NR = RING.length;
  const ringIdx = new Int32Array(n * NR).fill(-1);
  const nearLand = new Uint8Array(n);
  for (let row = 0; row < rows; row++) {
    if ((row & 31) === 31) yield 'ring';
    const qOff = -((row - (row & 1)) >> 1);
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const q = col + qOff;
      let any = 0;
      for (let k = 0; k < NR; k++) {
        const rr = row + RING[k][1];
        if (rr < 0 || rr >= rows) continue;
        const cc = q + RING[k][0] + ((rr - (rr & 1)) >> 1);
        const j = rr * cols + (((cc % cols) + cols) % cols);
        ringIdx[i * NR + k] = j;
        any |= land[j];
      }
      nearLand[i] = any;
    }
  }
  timings.prep = nowMs() - t0;
  yield 'prep';

  // --- 2. kaba alanlar (BIOME_SUB): bükülmüş noktada Gauss süzmesi ---
  let tc = nowMs();
  const lutH = gaussLut(P.sigmaH);
  const lutW = gaussLut(P.sigmaWide);
  const lutB = gaussLut(P.sigmaB);
  const nc = Wc * Hc;
  const cE = new Float32Array(nc);
  const cEw = new Float32Array(nc);
  const cR = new Float32Array(nc);
  const cHi = new Float32Array(nc);
  const cT = new Float32Array(nc);
  const cM = new Float32Array(nc);
  const cB = new Float32Array(nc * NB);
  const wB1 = octave(spanX, P.warpBroadCell, seed, 11);
  const wB2 = octave(spanX, P.warpBroadCell, seed, 12);
  const wF1 = octave(spanX, P.warpFineCell, seed, 13);
  const wF2 = octave(spanX, P.warpFineCell, seed, 14);
  const ampB = P.warpBroad * HEX_STEP;
  const ampF = P.warpFine * HEX_STEP;
  const invStep2 = 1 / (HEX_STEP * HEX_STEP);
  const acc = new Float64Array(NB);
  for (let j = 0; j < Hc; j++) {
    const wy = Y0 + (j + 0.5) * CTH;
    for (let i = 0; i < Wc; i++) {
      const wx = X0 + (i + 0.5) * CTW;
      let ti = hexIndex(wx, wy, cols, rows);
      if (ti < 0 || !nearLand[ti]) continue;
      const px = wx + noiseAt(wB1, wx, wy) * ampB + noiseAt(wF1, wx, wy) * ampF;
      const py = wy + noiseAt(wB2, wx, wy) * ampB + noiseAt(wF2, wx, wy) * ampF;
      // Bükülmüş noktanın hexi; komşu merkezleri ona göre.
      const fr = py / (1.5 * S);
      const fq = px / (SQRT3 * S) - fr / 2;
      const fs = -fq - fr;
      let rq = Math.round(fq);
      let rr = Math.round(fr);
      const rs = Math.round(fs);
      const dq = Math.abs(rq - fq);
      const dr = Math.abs(rr - fr);
      const ds = Math.abs(rs - fs);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      if (rr < 0) rr = 0;
      if (rr >= rows) rr = rows - 1;
      const cx = SQRT3 * S * (rq + rr / 2);
      const cy = 1.5 * S * rr;
      const col = rq + ((rr - (rr & 1)) >> 1);
      ti = rr * cols + (((col % cols) + cols) % cols);
      let sH = 0; let sE = 0; let sW = 0; let sEw = 0; let sR = 0; let sHi = 0;
      let sT = 0; let sM = 0; let sB = 0;
      acc.fill(0);
      const base = ti * NR;
      for (let k = 0; k < NR; k++) {
        const t = ringIdx[base + k];
        if (t < 0 || !land[t]) continue;
        const ex = px - cx - RING_DX[k];
        const ey = py - cy - RING_DY[k];
        const d2 = (ex * ex + ey * ey) * invStep2;
        if (d2 >= 8) continue;
        const li = (d2 * LUT_SCALE) | 0;
        const wh = lutH[li];
        sH += wh;
        sE += wh * eN[t];
        sR += wh * gR[t];
        sHi += wh * gH[t];
        sT += wh * temp[t];
        sM += wh * moist[t];
        const ww = lutW[li];
        sW += ww;
        sEw += ww * eN[t];
        const wb = lutB[li];
        if (wb > 1e-4) {
          sB += wb;
          const o = t * NB;
          for (let b = 0; b < NB; b++) acc[b] += wb * bio[o + b];
        }
      }
      const idx = j * Wc + i;
      if (sH > 1e-6) {
        cE[idx] = sE / sH;
        cEw[idx] = sW > 1e-6 ? sEw / sW : sE / sH;
        cR[idx] = sR / sH;
        cHi[idx] = sHi / sH;
        cT[idx] = sT / sH;
        cM[idx] = sM / sH;
      }
      if (sB > 1e-6) {
        const o = idx * NB;
        for (let b = 0; b < NB; b++) cB[o + b] = acc[b] / sB;
      }
    }
    if ((j & 1) === 1) yield 'coarse';
  }
  timings.coarse = nowMs() - tc;

  // --- 3. biyom katmanları (RGBA8 x 3) ---
  tc = nowMs();
  const biome = new Uint8Array(nc * 4 * 3);
  const layer = nc * 4;
  for (let j = 0; j < Hc; j++) {
    for (let i = j * Wc, end = i + Wc; i < end; i++) {
      const o = i * NB;
      for (let b = 0; b < NB; b++) {
        biome[(b >> 2) * layer + i * 4 + (b & 3)] = Math.round(clamp(cB[o + b], 0, 1) * 255);
      }
      biome[2 * layer + i * 4 + 2] = Math.round(clamp(cT[i], 0, 1) * 255);
      biome[2 * layer + i * 4 + 3] = Math.round(clamp(cM[i], 0, 1) * 255);
    }
    if ((j & 31) === 31) yield 'biome';
  }
  timings.biome = nowMs() - tc;

  // --- 4. ince ızgara: taban yükseklik + kapılar (çift doğrusal), sonra [1 2 1] ---
  tc = nowMs();
  const W = cols * SUB;
  const H = rows * SUB;
  const nf = W * H;
  const R = SUB / BIOME_SUB;
  const fE = new Float32Array(nf);
  const fR = new Float32Array(nf);
  const fHi = new Float32Array(nf);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / R - 0.5;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / R - 0.5;
      const k = j * W + i;
      const r = bilerp(cR, Wc, Hc, u, v);
      const hi = bilerp(cHi, Wc, Hc, u, v);
      // Engebe kapısı düşükse geniş süzgeç: ovada hex tümsekleri söner.
      const rug = smoothstep(0.05, 0.45, r + 0.6 * hi);
      const en = bilerp(cE, Wc, Hc, u, v);
      const ew = bilerp(cEw, Wc, Hc, u, v);
      fE[k] = ew + (en - ew) * rug;
      fR[k] = r;
      fHi[k] = hi;
    }
    if ((j & 15) === 15) yield 'upsample';
  }
  // Çift doğrusal büyütme kaba teksel sınırında eğimi kırar; ışık eğimden
  // hesaplandığı için o kırık yakında 2 teksellik ızgara olarak görünürdü.
  yield* blur121(fE, W, H);
  timings.upsample = nowMs() - tc;

  // --- 5. kıyıya işaretli uzaklık: yumuşak kıyı eğrisinden, teksel altı ---
  // Kıyı parçaları GL yüzeyinin dolgu tablosundan (coastMesh): yükseklik ve
  // A kanalı tam olarak shader'ın kara/deniz kararının sıfırında kesişir.
  // Parçası olan hexlerin teksellerine kesin uzaklık, kalanına chamfer.
  tc = nowMs();
  const TW = HEX_STEP / SUB;
  const TH = ROW_H / SUB;
  const mesh = coastMesh(world);
  const gl = meshGlTable(mesh);
  const water = new Uint8Array(n);
  for (let i = 0; i < n; i++) water[i] = world.tiles[i]?.terrain.water ? 1 : 0;
  const fD = new Float32Array(nf);
  const fLand = new Uint8Array(nf);
  const P_WRAP = world.wrapWidth || spanX;
  for (let j = 0; j < H; j++) {
    const wy = Y0 + (j + 0.5) * TH;
    for (let i = 0; i < W; i++) {
      const wx = X0 + (i + 0.5) * TW;
      const k = j * W + i;
      const ti = hexIndex(wx, wy, cols, rows);
      if (ti < 0) {
        fD[k] = 1e9;
        continue;
      }
      const cnt = gl.head[ti * 4 + 1];
      if (!cnt) {
        fLand[k] = water[ti] ? 0 : 1;
        fD[k] = 1e9;
        continue;
      }
      const tile = world.tiles[ti];
      let lx = wx - tile.x;
      lx -= P_WRAP * Math.round(lx / P_WRAP);
      const ly = wy - tile.y;
      const start = gl.head[ti * 4];
      const d = gl.data;
      let bestT = -1;
      let cell = ti;
      let dMin = 1e9;
      for (let s = 0; s < cnt; s++) {
        const o = (start + s) * 8;
        const ax = d[o];
        const ay = d[o + 1];
        const ex = d[o + 2] - ax;
        const ey = d[o + 3] - ay;
        // cellAt'in kuralı: merkezden noktaya ışının kestiği SON parça.
        const den = lx * ey - ly * ex;
        if (Math.abs(den) > 1e-9) {
          const t = (ax * ey - ay * ex) / den;
          const u = (ax * ly - ay * lx) / den;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t > bestT) {
            bestT = t;
            cell = ex * (ly - ay) - ey * (lx - ax) > 0 ? d[o + 4] : d[o + 5];
          }
        }
        // Uzaklık yalnız kara/deniz ayıran parçaya (iç hücre kenarı değil).
        if (water[d[o + 4]] !== water[d[o + 5]]) {
          const apx = lx - ax;
          const apy = ly - ay;
          const ee = ex * ex + ey * ey;
          const h = ee > 1e-9 ? clamp((apx * ex + apy * ey) / ee, 0, 1) : 0;
          const qx = apx - ex * h;
          const qy = apy - ey * h;
          const dd = qx * qx + qy * qy;
          if (dd < dMin) dMin = dd;
        }
      }
      fLand[k] = water[cell] ? 0 : 1;
      fD[k] = dMin < 1e9 ? Math.sqrt(dMin) : 1e9;
    }
    if ((j & 3) === 3) yield 'coastExact';
  }
  // Chamfer: kesin değerlerden dışarı yayılım (iki tur: sarmal dikişi).
  for (let pass = 0; pass < 2; pass++) {
    yield* chamferSweeps(fD, W, H, TW, TH);
  }
  timings.coast = nowMs() - tc;

  // --- 6. ayrıntı + paketleme ---
  tc = nowMs();
  const out = new Float32Array(nf * 4);
  const oLow1 = octave(spanX, P.lowCell, seed, 21);
  const oLow2 = octave(spanX, P.lowCell * 0.47, seed, 22);
  const oHill1 = octave(spanX, P.hillCell, seed, 31);
  const oHill2 = octave(spanX, P.hillCell * 0.5, seed, 32);
  const oRW1 = octave(spanX, P.ridgeWarpCell, seed, 41);
  const oRW2 = octave(spanX, P.ridgeWarpCell, seed, 42);
  const oR = [];
  for (let k = 0; k < P.ridgeOctaves; k++) oR.push(octave(spanX, P.ridgeCell / 2 ** k, seed, 51 + k));
  const oG1 = octave(spanX, P.gullyCell, seed, 61);
  const wave1 = P.gullyWave * HEX_STEP;
  const ridgeWarpAmp = P.ridgeWarp * HEX_STEP;
  const ramp = P.coastRamp * HEX_STEP;
  // Sırt toplamının ortalaması: ayrıntı ortalaması sıfır olsun ki dağın
  // ORTALAMA yüksekliği değişmesin (yalnız sırt ve vadi eklensin).
  const ridgeMean = estimateRidgeMean(oR, P.ridgeOctaves);
  let landTexels = 0;
  for (let j = 0; j < H; j++) {
    const wy = Y0 + (j + 0.5) * TH;
    const ju = j > 0 ? j - 1 : 0;
    const jd = j < H - 1 ? j + 1 : H - 1;
    for (let i = 0; i < W; i++) {
      const k = j * W + i;
      const o = k * 4;
      const wx = X0 + (i + 0.5) * TW;
      const dist = fD[k];
      const sd = fLand[k] ? dist : -dist;
      out[o + 3] = clamp(sd / HEX_STEP, -8, 8);
      if (!fLand[k]) {
        const dip = -P.seaDip * smoothstep(0, HEX_STEP, dist);
        out[o] = dip;
        out[o + 1] = dip;
        continue;
      }
      landTexels++;
      const e = fE[k];
      const r = fR[k];
      const hi = fHi[k];
      // Ova dalgası her yerde; kapısı engebenin kalanı.
      let detail = (noiseAt(oLow1, wx, wy) * 0.65 + noiseAt(oLow2, wx, wy) * 0.35)
        * P.lowAmp * clamp(1 - r - hi, 0, 1);
      if (hi > 0.01) {
        const hn = noiseAt(oHill1, wx, wy) * 0.7 + noiseAt(oHill2, wx, wy) * 0.3;
        detail += hn * P.hillAmp * hi;
      }
      const rug = r + 0.45 * hi;
      if (rug > 0.01) {
        // Taban eğimi (yükseklik / hex): oluk yönü ve şiddeti.
        const il = i > 0 ? i - 1 : W - 1;
        const ir = i < W - 1 ? i + 1 : 0;
        const gx = (fE[j * W + ir] - fE[j * W + il]) / (2 * TW) * HEX_STEP;
        const gy = (fE[jd * W + i] - fE[ju * W + i]) / (2 * TH) * HEX_STEP;
        const gm = Math.hypot(gx, gy);
        const slopeW = smoothstep(P.gullySlope0, P.gullySlope1, gm);
        if (slopeW > 0.001) {
          const dx = gx / gm;
          const dy = gy / gm;
          // Tek oktav: daha incesi SUB 8'de 4 tekselin altına iner ve tüylü
          // bir kumlanma bırakıyordu (oyun içi görüntüde görüldü). İnce oluk
          // GPU'da piksel başına kurulur (terrainGLSL gfxErosionGrad).
          const g1 = gullies(oG1, wave1, wx, wy, dx, dy);
          // Keskin sırt, yuvarlak olmayan V vadi: |g| kıvrımı.
          detail += (0.5 - Math.abs(g1)) * 2 * P.gullyAmp * slopeW * rug;
        }
        if (r > 0.01) {
          const qx = wx + noiseAt(oRW1, wx, wy) * ridgeWarpAmp;
          const qy = wy + noiseAt(oRW2, wx, wy) * ridgeWarpAmp;
          detail += (ridgedAt(oR, P.ridgeOctaves, qx, qy) - ridgeMean) * P.ridgeAmp * r;
        }
      }
      const rp = dist >= ramp ? 1 : 1 - (1 - dist / ramp) ** 2;
      out[o] = Math.max(0, e + detail) * rp;
      out[o + 1] = e * rp;
      out[o + 2] = clamp(r + 0.5 * hi, 0, 1);
    }
    if ((j & 3) === 3) yield 'detail';
  }
  timings.detail = nowMs() - tc;
  timings.total = nowMs() - t0;

  return {
    world,
    seed,
    height: { w: W, h: H, sub: SUB, data: out, texel: [TW, TH] },
    biome: { w: Wc, h: Hc, sub: BIOME_SUB, layers: 3, data: biome, texel: [CTW, CTH] },
    field: { x0: X0, y0: Y0, spanX, spanY },
    timings,
    landTexels,
  };
}

/**
 * CPU örnekleyici: dünya noktasında yükseklik kaydı, GPU'daki gfxTerrain ile
 * aynı süzme (çift doğrusal, x sarmal, y kenetli). Canvas2D mürekkep geçişleri
 * (kontur, ağaç/yerleşim simgesi yerleşimi) ve denetimler için.
 * @returns {{h:number, base:number, gate:number, coast:number}} coast: hex, kara +
 */
export function sampleTerrain(terrain, x, y) {
  const H = terrain.height;
  const f = terrain.field;
  const u = ((x - f.x0) / f.spanX) * H.w - 0.5;
  const v = ((y - f.y0) / f.spanY) * H.h - 0.5;
  const d = H.data;
  const w = H.w;
  let iu = Math.floor(u);
  const iv = Math.floor(v);
  const fu = u - iu;
  const fv = v - iv;
  iu = ((iu % w) + w) % w;
  const x1 = iu + 1 === w ? 0 : iu + 1;
  const y0 = clamp(iv, 0, H.h - 1);
  const y1 = clamp(iv + 1, 0, H.h - 1);
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const a = d[(y0 * w + iu) * 4 + c];
    const b = d[(y0 * w + x1) * 4 + c];
    const e = d[(y1 * w + iu) * 4 + c];
    const g = d[(y1 * w + x1) * 4 + c];
    out[c] = (a + (b - a) * fu) * (1 - fv) + (e + (g - e) * fu) * fv;
  }
  return { h: out[0], base: out[1], gate: out[2], coast: out[3] };
}

/**
 * CPU örnekleyici: dünya noktasında biyom ağırlıkları (adlar BIOMES) +
 * sıcaklık/nem, 0..1. En yakın teksel (simge yerleşimi için yeterli).
 */
export function sampleBiome(terrain, x, y) {
  const B = terrain.biome;
  const f = terrain.field;
  let i = Math.floor(((x - f.x0) / f.spanX) * B.w);
  i = ((i % B.w) + B.w) % B.w;
  const j = clamp(Math.floor(((y - f.y0) / f.spanY) * B.h), 0, B.h - 1);
  const layer = B.w * B.h * 4;
  const o = (j * B.w + i) * 4;
  const out = {};
  for (let b = 0; b < NB; b++) out[BIOMES[b]] = B.data[(b >> 2) * layer + o + (b & 3)] / 255;
  out.temperature = B.data[2 * layer + o + 2] / 255;
  out.moisture = B.data[2 * layer + o + 3] / 255;
  return out;
}

/** Senkron sürüm (Node denetimleri, test). */
export function bakeTerrain(world, opts) {
  const it = terrainBakeJob(world, opts);
  for (;;) {
    const r = it.next();
    if (r.done) return r.value;
  }
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

/** Dünya noktasının kare indeksi (harita dışı −1); x sarmal. */
function hexIndex(x, y, cols, rows) {
  const fr = (y * 2) / (3 * HEX_SIZE);
  const fq = x / (SQRT3 * HEX_SIZE) - fr / 2;
  const fs = -fq - fr;
  let rq = Math.round(fq);
  let rr = Math.round(fr);
  const rs = Math.round(fs);
  const dq = Math.abs(rq - fq);
  const dr = Math.abs(rr - fr);
  const ds = Math.abs(rs - fs);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  if (rr < 0 || rr >= rows) return -1;
  const col = rq + ((rr - (rr & 1)) >> 1);
  return rr * cols + (((col % cols) + cols) % cols);
}

/**
 * Chamfer yayılımı (ileri + geri süpürme), satır satır dilimli. Tohumlar
 * sıfır değil KESİN uzaklıklardır; yayılım yalnız küçültür.
 */
function* chamferSweeps(d, w, h, dx, dy) {
  const dd = Math.hypot(dx, dy);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    const up = (y - 1) * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      let v = d[i];
      const xl = x === 0 ? w - 1 : x - 1;
      const xr = x === w - 1 ? 0 : x + 1;
      if (y > 0) {
        if (d[up + x] + dy < v) v = d[up + x] + dy;
        if (d[up + xl] + dd < v) v = d[up + xl] + dd;
        if (d[up + xr] + dd < v) v = d[up + xr] + dd;
      }
      if (d[row + xl] + dx < v) v = d[row + xl] + dx;
      d[i] = v;
    }
    if ((y & 31) === 31) yield 'chamfer';
  }
  for (let y = h - 1; y >= 0; y--) {
    const row = y * w;
    const down = (y + 1) * w;
    for (let x = w - 1; x >= 0; x--) {
      const i = row + x;
      let v = d[i];
      const xl = x === 0 ? w - 1 : x - 1;
      const xr = x === w - 1 ? 0 : x + 1;
      if (y < h - 1) {
        if (d[down + x] + dy < v) v = d[down + x] + dy;
        if (d[down + xl] + dd < v) v = d[down + xl] + dd;
        if (d[down + xr] + dd < v) v = d[down + xr] + dd;
      }
      if (d[row + xr] + dx < v) v = d[row + xr] + dx;
      d[i] = v;
    }
    if ((y & 31) === 0) yield 'chamfer';
  }
}

/**
 * Sırtlı çok fraktallı (Musgrave): 1 − |n| sırtı keskinleştirir, karesi
 * vadiyi genişletir; her oktavın payı bir öncekinin sırt değeriyle çarpılır
 * — ince sırtlar ana sırtın üstünde toplanır, vadide sönük kalır. 0..~1.
 */
function ridgedAt(oR, nOct, x, y) {
  let sum = 0;
  let weight = 1;
  let amp = 1;
  let norm = 0;
  for (let k = 0; k < nOct; k++) {
    let r = 1 - Math.abs(noiseAt(oR[k], x, y));
    r *= r;
    r *= weight;
    weight = clamp(r * 1.6, 0, 1);
    sum += r * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function estimateRidgeMean(oR, nOct) {
  let s = 0;
  const N = 4096;
  for (let i = 0; i < N; i++) {
    // Düzenli dağılmış örnek (altın oran), RNG yok.
    const x = X0 + ((i * 0.6180339887) % 1) * 5000;
    const y = Y0 + ((i * 0.7548776662) % 1) * 3000;
    s += ridgedAt(oR, nOct, x, y);
  }
  return s / N;
}

/**
 * Yerinde [1 2 1]/4 bulanıklığı; x sarmal, y kenetli. Satır satır dilimli:
 * tek parça 1280×768'de ~15 ms tutuyordu (kare bütçesi). Dikey geçiş satır
 * sırasıyla gider (bir önceki satırın ESKİ değeri tamponda tutulur) — sütun
 * sırası önbellek dostu değildi.
 */
function* blur121(f, w, h) {
  const tmp = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const b = y * w;
    for (let x = 0; x < w; x++) {
      const l = f[b + (x === 0 ? w - 1 : x - 1)];
      const r = f[b + (x === w - 1 ? 0 : x + 1)];
      tmp[x] = (l + 2 * f[b + x] + r) * 0.25;
    }
    f.set(tmp, b);
    if ((y & 127) === 127) yield 'blur';
  }
  const prev = f.slice(0, w);
  const cur = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    const b = y * w;
    const nb = (y === h - 1 ? y : y + 1) * w;
    cur.set(f.subarray(b, b + w));
    for (let x = 0; x < w; x++) f[b + x] = (prev[x] + 2 * cur[x] + f[nb + x]) * 0.25;
    prev.set(cur);
    if ((y & 127) === 127) yield 'blur';
  }
}
