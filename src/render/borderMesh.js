// SINIR AĞI — province ve ülke sınırlarının yumuşatılmış geometrisi.
//
// Harita birimi province'tir, veri ızgarası ise hex kalır; sınır hex
// kenarlarından türer. Hex kenarını olduğu gibi çizmek haritayı petek gibi
// okutuyordu: oyuncu province'i değil hexi görüyordu. Kenarlar hex köşe
// grafiğinde ZİNCİRLERE dizilir ve her zincir doğal bir eğriye dönüştürülür
// (bkz. EĞRİ BİÇİMİ: süzgeç + kıvrım, hex yolundan sınırlı sapma).
//
// Zincir, iki bölgenin kesintisiz ortak sınırıdır; üç bölgenin buluştuğu
// köşede (kavşak) ve kıyıda kopar. Uçlar yumuşatmada SABİT kalır: kavşak
// kaymaz, komşu zincirler aynı noktada buluşur, bölge çokgenleri dikişsiz
// kapanır.
//
// Kıyı da aynı eğridir: GL yüzeyi kara/deniz kararını onunla verir, deniz
// katmanlarının kıyı uzaklığı alanı coastMesh'ten gelir (material.js). Yalnız
// Canvas2D yedeği kıyıyı hex kenarında çizer (renderer.chainPts).
//
// Çizgi, kenar gölgesi, bölge çokgenleri (classic dolgu) ve GL dolgu
// eşlemesi AYNI yumuşak eğriden beslenir. Dolgunun sınırı çizgiyle aynı
// eğriye çekilmezse yumuşak çizginin iki yanından renk dişleri taşar (yakın
// zoomda 10-18 px).
//
// Katman notu: render katmanıdır ama DOM'a dokunmaz; Node'da sınanabilir.

import { DIRS, HEX_CORNERS } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';

/** Bölge etiketi olmayan taraflar. */
export const SEA = -1;
export const OFFMAP = -2;

/** Zincir sınıfları: çizim dili bunlara göre seçilir. */
export const LINE_COUNTRY = 0;
export const LINE_PROVINCE = 1;
export const LINE_COAST = 2;

const CORNERS = HEX_CORNERS.map(([x, y]) => [x * HEX_SIZE, y * HEX_SIZE]);

/**
 * Bir köşeyi üç hex paylaşır; aynı nokta üç ayrı kimlikle sayılmasın diye her
 * köşe tek bir hexin ÜST (5) ya da ALT (2) köşesi olarak adlanır.
 * [komşu yönü (-1 = kendisi), 0 = üst, 1 = alt]
 */
const CORNER_OWNER = [[5, 1], [1, 0], [-1, 1], [2, 0], [4, 1], [-1, 0]];

/**
 * Ülke kenar gölgesinin derinliği (dünya birimi, sınırdan içeri): eski iki hex
 * halkasının toplamı — sınır karesi + bir kare daha.
 */
export const BAND_REACH = 74;

/** GL dolgu eşlemesinde hex başına en fazla parça (shader döngü tavanı). */
export const GL_MAX_PER_TILE = 64;

/** GL parça tablosunun eni (teksel); kayıt başına iki teksel. */
export const GL_DATA_WIDTH = 2048;

/** Parçanın hexe "değdiği" sayılan pay: kenar yumuşatma pikseli dışarıda kalmasın. */
const GL_MARGIN = 2.5;

/** Komşu merkezinin yerel konumu, yön başına (dünya birimi). */
const NEIGHBOR_OFFSET = DIRS.map(([dq, dr]) => [
  Math.sqrt(3) * HEX_SIZE * (dq + dr / 2),
  1.5 * HEX_SIZE * dr,
]);

const NEIGHBOR_CACHE = new WeakMap();

/**
 * Kare başına altı komşunun indeksi (yok: -1), dünya başına bir kez.
 * world.get her çağrıda bir {col,row} nesnesi kuruyordu; ağ kurulumu onu
 * yüz binlerce kez çağırınca sürenin dörtte biri tahsisat ve GC'ydi.
 */
export function neighborTable(world) {
  let tab = NEIGHBOR_CACHE.get(world);
  if (tab) return tab;
  const cols = world.cols;
  const rows = world.rows;
  tab = new Int32Array(cols * rows * 6).fill(-1);
  for (let row = 0; row < rows; row++) {
    const q0 = -((row - (row & 1)) >> 1);
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      const q = col + q0;
      for (let d = 0; d < 6; d++) {
        const rr = row + DIRS[d][1];
        if (rr < 0 || rr >= rows) continue;
        const cc = q + DIRS[d][0] + ((rr - (rr & 1)) >> 1);
        tab[i * 6 + d] = rr * cols + (((cc % cols) + cols) % cols);
      }
    }
  }
  NEIGHBOR_CACHE.set(world, tab);
  return tab;
}

/**
 * EĞRİ BİÇİMİ. Hex kenarı yolu (H) bir merdivendir: sınır hangi yönde
 * giderse gitsin 60°'lik dişlerle ilerler. Köşe kırpması (Chaikin) dişi
 * yuvarlıyor ama periyodunu koruyordu — çizgiler kapatılınca dolgu kenarı
 * yine hex hex basamaklıydı, çizgiler de "cetvelle çekilmiş koloni sınırı"
 * gibi düzenli dalgalanıyordu. Şimdi:
 *
 *   1. H yay uzunluğuna göre eşit aralıkla örneklenir,
 *   2. yay boyunca Gauss süzgeci: bir hex periyodundaki diş söner (dalga boyu
 *      45 birimde genlik %1), üç hexlik çıkıntı kalır (%60),
 *   3. eğri H'den en çok SHAPE_CLAMP uzaklaşabilir,
 *   4. konuma bağlı gürültüyle normali boyunca kıvrılır, yeniden sınırlanır.
 *
 * SINIR KANITI: her hex merkezi kendi kenarlarından iç yarıçap (22.5) kadar
 * uzaktadır. Eğri H'den en çok MEANDER_CLAMP (17) saparsa hiçbir merkez
 * karşı tarafa geçmez ve eğri yalnız H'ye kenar ya da KÖŞE ile değen hexlere
 * girer — GL dolgu tablosu bu kümeyi tarar (buildGlTable).
 */
const SHAPE_STEP = 4.5;
const SHAPE_SIGMA = 22;
const SHAPE_CLAMP = 14;
const MEANDER_CLAMP = 17;
/** Açık zincirde uçlara doğru sönme boyu: kavşak yerinde kalır, komşular buluşur. */
const SHAPE_TAPER = 26;
/** Kıvrım genliği: süzgecin sildiği düzensizliğin yerine konuma bağlı olanı. */
const MEANDER_AMP = 6;

// Ara tamponlar: zincir başına dizi ayırmak kurulumun üçte birini
// tahsisata harcıyordu.
let BUF_X = new Float64Array(4096);
let BUF_Y = new Float64Array(4096);
let BUF_GX = new Float64Array(4096);
let BUF_GY = new Float64Array(4096);
let BUF_SEG = new Int32Array(4096);
let BUF_S = new Float64Array(4096);
let BUF_D = new Float64Array(4096);
let BUF_T = new Float64Array(4096);

function ensureBuffers(n) {
  if (BUF_X.length >= n) return;
  const size = n * 2;
  BUF_X = new Float64Array(size);
  BUF_Y = new Float64Array(size);
  BUF_GX = new Float64Array(size);
  BUF_GY = new Float64Array(size);
  BUF_SEG = new Int32Array(size);
  BUF_S = new Float64Array(size);
  BUF_D = new Float64Array(size);
  BUF_T = new Float64Array(size);
}

/**
 * Yerinde kutu süzgeci (yarıçap rb). Açık zincirde pencere uçta kırpılır ve
 * yeniden ağırlıklanır; kapalıda sarar.
 */
function boxPass(v, n, rb, closed) {
  const tmp = BUF_T;
  if (closed && 2 * rb + 1 >= n) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += v[i];
    for (let i = 0; i < n; i++) v[i] = sum / n;
    return;
  }
  let sum = 0;
  if (closed) {
    const width = 2 * rb + 1;
    for (let d = -rb; d <= rb; d++) sum += v[(d + n) % n];
    for (let k = 0; k < n; k++) {
      tmp[k] = sum / width;
      sum += v[(k + rb + 1) % n] - v[(k - rb + n) % n];
    }
  } else {
    let cnt = 0;
    for (let i = 0; i <= Math.min(rb, n - 1); i++) {
      sum += v[i];
      cnt++;
    }
    for (let k = 0; k < n; k++) {
      tmp[k] = sum / cnt;
      const add = k + rb + 1;
      if (add < n) {
        sum += v[add];
        cnt++;
      }
      const rem = k - rb;
      if (rem >= 0) {
        sum -= v[rem];
        cnt--;
      }
    }
  }
  for (let k = 0; k < n; k++) v[k] = tmp[k];
}

function hash2(ix, iy) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * Değer gürültüsü; x ekseninde `period` hücrede sarar. Zincirler açılmış
 * koordinattadır ve aynı zincir iki ağda (siyasi, kıyı) farklı periyotta
 * açılabilir: gürültü sarmazsa kıyı iki ağda farklı kıvrılırdı.
 */
function valueNoise(x, y, period) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const x0 = period ? ((ix % period) + period) % period : ix;
  const x1 = period ? (x0 + 1) % period : ix + 1;
  const a = hash2(x0, iy);
  const b = hash2(x1, iy);
  const c = hash2(x0, iy + 1);
  const d = hash2(x1, iy + 1);
  return (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) * 2 - 1;
}

/** Oktavlar: [hücre boyu, genlik, y kayması] — ~3 hexlik kıvrım, ~1 hexlik dalga, kırık. */
const MEANDER_OCTAVES = [[130, 0.62, 0], [48, 0.34, 17.3], [21, 0.2, -41.9]];

/** Hücre boyları sarmal periyoduna tam bölünecek biçimde yuvarlanır. */
function meanderNoise(x, y, P) {
  if (P !== NOISE_P) {
    NOISE_P = P;
    for (let k = 0; k < MEANDER_OCTAVES.length; k++) {
      const cell = MEANDER_OCTAVES[k][0];
      NOISE_N[k] = P ? Math.max(1, Math.round(P / cell)) : 0;
      NOISE_C[k] = P ? P / NOISE_N[k] : cell;
    }
  }
  let v = 0;
  for (let k = 0; k < MEANDER_OCTAVES.length; k++) {
    const c = NOISE_C[k];
    v += valueNoise(x / c, y / c + MEANDER_OCTAVES[k][2], NOISE_N[k]) * MEANDER_OCTAVES[k][1];
  }
  return v;
}
let NOISE_P = -1;
const NOISE_N = new Int32Array(MEANDER_OCTAVES.length);
const NOISE_C = new Float64Array(MEANDER_OCTAVES.length);

const NEAR = new Float64Array(3);

/** (px,py)'nin a-b parçasına en yakın noktası NEAR'a: x, y, uzaklık². */
function nearestOnSeg(px, py, ax, ay, bx, by) {
  const ex = bx - ax;
  const ey = by - ay;
  const ll = ex * ex + ey * ey;
  let t = ll > 1e-12 ? ((px - ax) * ex + (py - ay) * ey) / ll : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  NEAR[0] = ax + ex * t;
  NEAR[1] = ay + ey * t;
  NEAR[2] = (px - NEAR[0]) ** 2 + (py - NEAR[1]) ** 2;
}

const CLAMPED = new Float64Array(2);

/** Noktayı H'nin `seg` çevresindeki parçalarına en çok `limit` uzaklığa çeker (CLAMPED'e). */
function clampToPath(H, closed, seg, x, y, limit) {
  const m = H.length / 2;
  const segs = closed ? m : m - 1;
  let bx = x;
  let by = y;
  let best = Infinity;
  // Gauss penceresi (3σ = 66) üç kenar boyu: en yakın kaynak parça ±3 içinde.
  const reach = Math.min(segs, 3);
  for (let k = -reach; k <= reach; k++) {
    let s = seg + k;
    if (closed) s = ((s % segs) + segs) % segs;
    else if (s < 0 || s >= segs) continue;
    const j = s + 1 < m ? s + 1 : 0;
    nearestOnSeg(x, y, H[s * 2], H[s * 2 + 1], H[j * 2], H[j * 2 + 1]);
    if (NEAR[2] < best) {
      best = NEAR[2];
      bx = NEAR[0];
      by = NEAR[1];
    }
  }
  const d = Math.sqrt(best);
  if (d <= limit) {
    CLAMPED[0] = x;
    CLAMPED[1] = y;
  } else {
    const k = limit / d;
    CLAMPED[0] = bx + (x - bx) * k;
    CLAMPED[1] = by + (y - by) * k;
  }
}

/**
 * Hex kenarı yolundan doğal sınır eğrisi (bkz. EĞRİ BİÇİMİ). Açık zincirin
 * uçları birebir H'nin uçlarıdır. `P`: sarmal periyodu (gürültü sarması).
 */
function shapeChain(H, closed, P) {
  const m = H.length / 2;
  if (m < 2) return H;
  const segs = closed ? m : m - 1;
  let total = 0;
  for (let i = 0; i < segs; i++) {
    const j = i + 1 < m ? i + 1 : 0;
    total += Math.sqrt((H[j * 2] - H[i * 2]) ** 2 + (H[j * 2 + 1] - H[i * 2 + 1]) ** 2);
  }
  if (total < 1e-6) return H;
  const count = Math.max(closed ? 6 : 1, Math.round(total / SHAPE_STEP));
  const n = closed ? count : count + 1;
  ensureBuffers(n + 2);
  const X = BUF_X;
  const Y = BUF_Y;
  const GX = BUF_GX;
  const GY = BUF_GY;
  const SEG = BUF_SEG;
  const S = BUF_S;

  // 1. Eşit aralıklı örnekleme; her örneğin kaynak parçası kenetleme içindir.
  let seg = 0;
  let segStart = 0;
  let segLen = Math.sqrt((H[2] - H[0]) ** 2 + (H[3] - H[1]) ** 2);
  for (let k = 0; k < n; k++) {
    const s = (total * k) / count;
    while (seg < segs - 1 && segStart + segLen < s) {
      segStart += segLen;
      seg++;
      const j = seg + 1 < m ? seg + 1 : 0;
      segLen = Math.sqrt((H[j * 2] - H[seg * 2]) ** 2 + (H[j * 2 + 1] - H[seg * 2 + 1]) ** 2);
    }
    const j = seg + 1 < m ? seg + 1 : 0;
    const t = segLen > 1e-9 ? Math.min(1, (s - segStart) / segLen) : 0;
    X[k] = H[seg * 2] + (H[j * 2] - H[seg * 2]) * t;
    Y[k] = H[seg * 2 + 1] + (H[j * 2 + 1] - H[seg * 2 + 1]) * t;
    SEG[k] = seg;
    S[k] = s;
  }

  // 2. Yay boyunca Gauss yaklaşığı: üç kutu geçişi (kayan toplam, O(n)).
  // Gerçek çekirdek örnek başına 31 dokunuştu ve tam kurulumun en büyük
  // kalemiydi. Küçük kapalı halkada (tek hexlik ada) süzgeç halkanın boyuna
  // göre daralır: yoksa ada noktaya büzülür.
  const sigma = closed ? Math.min(SHAPE_SIGMA, total / 10) : SHAPE_SIGMA;
  const ss = sigma / (total / count);
  const rb = Math.max(1, Math.round((Math.sqrt(4 * ss * ss + 1) - 1) / 2));
  for (let k = 0; k < n; k++) {
    GX[k] = X[k];
    GY[k] = Y[k];
  }
  for (let pass = 0; pass < 3; pass++) {
    boxPass(GX, n, rb, closed);
    boxPass(GY, n, rb, closed);
  }

  // 3. Uç sönümü ve kenetleme. X[k] H'nin üstünde olduğundan kaymanın boyu
  // H'ye uzaklığın üst sınırıdır: sınırın altındaki noktada arama gereksiz.
  const out = new Float64Array(n * 2);
  const D = BUF_D;
  for (let k = 0; k < n; k++) {
    let w = 1;
    if (!closed) {
      const u = Math.min(1, Math.min(S[k], total - S[k]) / SHAPE_TAPER);
      w = u * u * (3 - 2 * u);
    }
    const dx = (GX[k] - X[k]) * w;
    const dy = (GY[k] - Y[k]) * w;
    const dd = Math.sqrt(dx * dx + dy * dy);
    if (dd <= SHAPE_CLAMP) {
      out[k * 2] = X[k] + dx;
      out[k * 2 + 1] = Y[k] + dy;
      D[k] = dd;
    } else {
      clampToPath(H, closed, SEG[k], X[k] + dx, Y[k] + dy, SHAPE_CLAMP);
      out[k * 2] = CLAMPED[0];
      out[k * 2 + 1] = CLAMPED[1];
      D[k] = SHAPE_CLAMP;
    }
  }
  // 4. Kıvrım (normal boyunca) ve yeniden kenetleme (yine yalnız gerekirse).
  for (let k = 0; k < n; k++) {
    const a = closed ? (k - 1 + n) % n : Math.max(0, k - 1);
    const b = closed ? (k + 1) % n : Math.min(n - 1, k + 1);
    let tx = out[b * 2] - out[a * 2];
    let ty = out[b * 2 + 1] - out[a * 2 + 1];
    const tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl;
    ty /= tl;
    let w = 1;
    if (!closed) {
      const u = Math.min(1, Math.min(S[k], total - S[k]) / SHAPE_TAPER);
      w = u * u * (3 - 2 * u);
    }
    const x = out[k * 2];
    const y = out[k * 2 + 1];
    const off = MEANDER_AMP * w * meanderNoise(x, y, P);
    GX[k] = x - ty * off;
    GY[k] = y + tx * off;
    D[k] += Math.abs(off);
  }
  for (let k = 0; k < n; k++) {
    if (D[k] <= MEANDER_CLAMP) {
      out[k * 2] = GX[k];
      out[k * 2 + 1] = GY[k];
      continue;
    }
    clampToPath(H, closed, SEG[k], GX[k], GY[k], MEANDER_CLAMP);
    out[k * 2] = CLAMPED[0];
    out[k * 2 + 1] = CLAMPED[1];
  }
  if (!closed) {
    // Uçlar birebir kavşak noktası: kayan nokta payı bile birleşimi açmasın.
    out[0] = H[0];
    out[1] = H[1];
    out[(n - 1) * 2] = H[(m - 1) * 2];
    out[(n - 1) * 2 + 1] = H[(m - 1) * 2 + 1];
  }
  return out;
}

function bboxOf(pts, box = [Infinity, Infinity, -Infinity, -Infinity]) {
  for (let i = 0; i < pts.length; i += 2) {
    if (pts[i] < box[0]) box[0] = pts[i];
    if (pts[i + 1] < box[1]) box[1] = pts[i + 1];
    if (pts[i] > box[2]) box[2] = pts[i];
    if (pts[i + 1] > box[3]) box[3] = pts[i + 1];
  }
  return box;
}

/** Noktanın merkezi orijinde, dış yarıçapı R olan sivri tepeli hexin içinde mi? */
function inHex(x, y, R) {
  const ax = Math.abs(x);
  return ax <= R * 0.8660254 && ax * 0.5773503 + Math.abs(y) <= R;
}

/**
 * Parça (yerel koordinat) hexe değiyor mu? Uçlardan biri içerde ya da bir
 * kenarı kesiyor. Tahsisatsız: GL tablosu bunu yüz binlerce kez sorar.
 */
function segTouchesHex(ax, ay, bx, by, R) {
  if (inHex(ax, ay, R) || inHex(bx, by, R)) return true;
  const rx = bx - ax;
  const ry = by - ay;
  for (let k = 0; k < 6; k++) {
    const c0 = HEX_CORNERS[k];
    const c1 = HEX_CORNERS[k === 5 ? 0 : k + 1];
    const cx = c0[0] * R;
    const cy = c0[1] * R;
    const sx = c1[0] * R - cx;
    const sy = c1[1] * R - cy;
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) continue;
    const qx = cx - ax;
    const qy = cy - ay;
    const t = (qx * sy - qy * sx) / den;
    const u = (qx * ry - qy * rx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

/**
 * Dünyanın sınır ağı. `groupOf(tile)` hangi büyük sınırın çizileceğini verir:
 * siyasi kiplerde sahip, kültür kipinde kültür. Bölge = (province, grup);
 * aynı province'in iki sahibi varsa (kare kare barış devri) arası da ülke
 * sınırıdır.
 */
export function buildBorderMesh(world, groupOf, keys = null) {
  const cols = world.cols;
  const rows = world.rows;
  const n = cols * rows;
  const P = world.wrapWidth || 0;
  const tiles = world.tiles;

  keys ??= borderKeys(world, groupOf);
  const labels = new Int32Array(n);
  const regions = [];
  const regionOf = new Map();
  for (let i = 0; i < n; i++) {
    const key = keys[i];
    if (key < 0) { labels[i] = SEA; continue; }
    let id = regionOf.get(key);
    if (id === undefined) {
      id = regions.length;
      regionOf.set(key, id);
      const province = Math.floor(key / 4096) - 1;
      const group = (key % 4096) - 1;
      regions.push({ id, province, group, tiles: [], chains: [], loops: [], loopsHex: [], bbox: null, partial: false });
    }
    labels[i] = id;
    regions[id].tiles.push(i);
  }

  // --- Kenarlar ---------------------------------------------------------
  const numCorners = (rows + 2) * cols * 2;
  const cornerOf = (q, r, k) => {
    let qq = q;
    let rr = r;
    const [d, type] = CORNER_OWNER[k];
    if (d >= 0) { qq += DIRS[d][0]; rr += DIRS[d][1]; }
    const col = qq + ((rr - (rr & 1)) >> 1);
    const wc = ((col % cols) + cols) % cols;
    return ((rr + 1) * cols + wc) * 2 + type;
  };
  const cap = n * 3 + 16;
  let E = 0;
  const eTile = new Int32Array(cap);
  const eDir = new Uint8Array(cap);
  const eOther = new Int32Array(cap);
  const eOtherLabel = new Int32Array(cap);
  const eC0 = new Int32Array(cap);
  const eC1 = new Int32Array(cap);
  const cornerEdges = new Int32Array(numCorners * 3).fill(-1);
  const cornerDeg = new Uint8Array(numCorners);
  const nbr = neighborTable(world);
  for (let i = 0; i < n; i++) {
    const la = labels[i];
    if (la < 0) continue;
    const t = tiles[i];
    for (let d = 0; d < 6; d++) {
      const j = nbr[i * 6 + d];
      const lb = j >= 0 ? labels[j] : OFFMAP;
      if (lb === la) continue;
      // Kara-kara kenarı iki taraftan da görülür: küçük indeksli sahiplenir.
      if (lb >= 0 && j < i) continue;
      const e = E++;
      eTile[e] = i; eDir[e] = d; eOther[e] = j; eOtherLabel[e] = lb;
      const c0 = cornerOf(t.q, t.r, d);
      const c1 = cornerOf(t.q, t.r, (d + 1) % 6);
      eC0[e] = c0; eC1[e] = c1;
      cornerEdges[c0 * 3 + cornerDeg[c0]++] = e;
      cornerEdges[c1 * 3 + cornerDeg[c1]++] = e;
    }
  }
  const pairOf = (e) => {
    const a = labels[eTile[e]];
    const b = eOtherLabel[e];
    return a < b ? a * 65536 + b : b * 65536 + a;
  };
  const isBreak = (v) => cornerDeg[v] !== 2
    || pairOf(cornerEdges[v * 3]) !== pairOf(cornerEdges[v * 3 + 1]);

  // --- Zincirler --------------------------------------------------------
  const visited = new Uint8Array(E);
  const chains = [];
  const cornerPos = (e, k) => {
    const t = tiles[eTile[e]];
    const c = CORNERS[k];
    return [t.x + c[0], t.y + c[1]];
  };
  const trace = (startV, e0) => {
    const edges = [];
    const pts = [];
    let v = startV;
    let e = e0;
    let lastX = null;
    const push = (x, y) => {
      if (P && lastX !== null) x += P * Math.round((lastX - x) / P);
      pts.push(x, y);
      lastX = x;
    };
    for (;;) {
      visited[e] = 1;
      const fwd = eC0[e] === v;
      const d = eDir[e];
      const kFrom = fwd ? d : (d + 1) % 6;
      const kTo = fwd ? (d + 1) % 6 : d;
      if (!edges.length) {
        const [x, y] = cornerPos(e, kFrom);
        push(x, y);
      }
      const [x, y] = cornerPos(e, kTo);
      push(x, y);
      edges.push(fwd ? e : ~e);
      v = fwd ? eC1[e] : eC0[e];
      if (v === startV || isBreak(v)) break;
      const a = cornerEdges[v * 3];
      const b = cornerEdges[v * 3 + 1];
      const next = a === e ? b : a;
      if (next < 0 || visited[next]) break;
      e = next;
    }
    // Kavşaktan çıkıp aynı kavşağa dönen zincir AÇIKTIR: ucu kavşakta sabit
    // kalmalı, döngü gibi yumuşatılırsa kavşak kayar ve komşular kopar.
    // Bütün alanlar baştan: nesne biçimi sabit kalsın, sonradan eklenen
    // alanlar zinciri yavaş sözlük kipine düşürmesin.
    return {
      edges, pts, start: startV, end: v, loop: v === startV && !isBreak(startV),
      id: 0, pos: 0, neg: 0, cls: 0, closed: false, H: null, S: null, bbox: null,
    };
  };
  for (let v = 0; v < numCorners; v++) {
    if (!cornerDeg[v] || !isBreak(v)) continue;
    for (let s = 0; s < cornerDeg[v]; s++) {
      const e = cornerEdges[v * 3 + s];
      if (!visited[e]) chains.push(trace(v, e));
    }
  }
  for (let e = 0; e < E; e++) {
    if (!visited[e]) chains.push(trace(eC0[e], e));
  }

  // --- Zincir sınıfı, yumuşatma -----------------------------------------
  for (const ch of chains) {
    const first = ch.edges[0];
    const e = first >= 0 ? first : ~first;
    const la = labels[eTile[e]];
    const lb = eOtherLabel[e];
    // c0→c1 yönünde eTile pozitif taraftadır (çapraz çarpım > 0).
    ch.pos = first >= 0 ? la : lb;
    ch.neg = first >= 0 ? lb : la;
    const H = Float64Array.from(ch.pts);
    ch.pts = null;
    const m = H.length / 2;
    // Silindiri saran döngü (kutup bandı) açılmış koordinatta kapanmaz.
    const cylinder = ch.loop && Math.abs(H[0] - H[(m - 1) * 2]) > 1;
    ch.closed = ch.loop && !cylinder;
    ch.H = ch.closed ? H.subarray(0, (m - 1) * 2) : H;
    const land = ch.pos >= 0 && ch.neg >= 0;
    if (land) {
      ch.cls = regions[ch.pos].group !== regions[ch.neg].group ? LINE_COUNTRY : LINE_PROVINCE;
    } else {
      ch.cls = LINE_COAST;
    }
    // Harita kenarı (kutup) hex kenarında kalır; kara-kara ve kara-deniz
    // zincirleri yumuşar ve kıvrılır. Kıyı da artık yumuşak: hex dişli
    // sahil, yumuşak sınırların yanında haritanın en petek parçasıydı.
    if (land || ch.pos === SEA || ch.neg === SEA) {
      ch.S = shapeChain(ch.H, ch.closed, P);
    } else {
      ch.S = ch.H;
    }
    ch.bbox = bboxOf(ch.H, bboxOf(ch.S));
  }
  chains.forEach((ch, id) => {
    ch.id = id;
    if (ch.pos >= 0) regions[ch.pos].chains.push(id);
    if (ch.neg >= 0) regions[ch.neg].chains.push(id);
  });

  // --- Bölge döngüleri --------------------------------------------------
  // Bölge hep POZİTİF tarafta kalacak yönde yürünür: dış sınır ve delikler
  // zıt yönlü çıkar, Path2D 'nonzero' ile deliği kendiliğinden boşaltır.
  // İki takım: loops her zinciri yumuşak eğrisiyle (GL yüzeyi), loopsHex
  // kıyıyı hex kenarıyla (classic yedek: orada su katmanları hex yoluna bağlı).
  let buf = new Float64Array(4096);
  const assemble = (region, pick) => {
    const starts = new Map();
    const loops = [];
    let partial = false;
    for (const id of region.chains) {
      const ch = chains[id];
      const reversed = ch.pos !== region.id;
      if (ch.closed) {
        loops.push(reversed ? reversePts(pick(ch)) : pick(ch));
        continue;
      }
      starts.set(reversed ? ch.end : ch.start, { ch, reversed });
    }
    const used = new Set();
    for (const [startV, first] of starts) {
      if (used.has(startV)) continue;
      let len = 0;
      let cur = first;
      let v = startV;
      while (cur && !used.has(v)) {
        used.add(v);
        const S = pick(cur.ch);
        const m = S.length / 2;
        if (buf.length < len + S.length + 2) {
          const grown = new Float64Array((len + S.length) * 2);
          grown.set(buf.subarray(0, len));
          buf = grown;
        }
        const x0 = cur.reversed ? S[(m - 1) * 2] : S[0];
        const shift = !len || !P ? 0 : P * Math.round((buf[len - 2] - x0) / P);
        // Birleşim noktası iki kez yazılmasın.
        for (let k = len ? 1 : 0; k < m; k++) {
          const i = cur.reversed ? m - 1 - k : k;
          buf[len++] = S[i * 2] + shift;
          buf[len++] = S[i * 2 + 1];
        }
        v = cur.reversed ? cur.ch.start : cur.ch.end;
        cur = starts.get(v);
      }
      // Silindir döngüsü (açılmış koordinatta P kadar kayık kapanır) çokgen
      // olamaz; yalnız sahipsiz kutup kuşaklarında olur, çizgisi zaten var.
      if (len >= 8 && Math.abs(buf[0] - buf[len - 2]) < 1 && Math.abs(buf[1] - buf[len - 1]) < 1) {
        loops.push(buf.slice(0, len - 2));
      } else {
        // Çokgeni eksik bölge: classic dolgu onu hex hex boyar.
        partial = true;
      }
    }
    return { loops, partial: partial || !loops.length };
  };
  for (const region of regions) {
    const smooth = assemble(region, (ch) => ch.S);
    const hex = assemble(region, (ch) => (ch.cls === LINE_COAST ? ch.H : ch.S));
    region.loops = smooth.loops;
    region.loopsHex = hex.loops;
    region.partial = smooth.partial || hex.partial;
    let box = null;
    for (const loop of smooth.loops) box = bboxOf(loop, box ?? undefined);
    for (const loop of hex.loops) box = bboxOf(loop, box ?? undefined);
    region.bbox = box;
  }

  return {
    world, keys, labels, regions, chains,
    edges: { eTile, eOther },
    gl: null,
    regionData: null,
    band: null,
    version: 0,
  };
}

/** GL dolgu eşlemesinin tablosu; ağ başına ilk istekte kurulur. */
export function meshGlTable(mesh) {
  mesh.gl ??= buildGlTable(mesh.world, mesh.labels, mesh.chains, mesh.edges.eTile, mesh.edges.eOther);
  return mesh.gl;
}

const COAST_CACHE = new WeakMap();

/**
 * Yalnız province bölümlemesiyle kurulmuş ağ: kıyının yumuşak hâli dünya
 * başına SABİT olsun diye. Denizin uzaklık alanı (malzeme, GL denizi, three.js
 * denizi) bu kıyıdan pişer; sahiplik değişince yeniden pişmemeli. Sahiplik
 * province içinde bölünmedikçe bölge ağının kıyısı bununla birebir aynıdır
 * (zincir kopuşları aynı köşelerde, yumuşatma aynı).
 */
export function coastMesh(world) {
  let mesh = COAST_CACHE.get(world);
  if (!mesh) {
    mesh = buildBorderMesh(world, () => 0);
    meshGlTable(mesh);
    COAST_CACHE.set(world, mesh);
  }
  return mesh;
}

/**
 * Dünya noktası yumuşak kıyıya göre karada mı? Shader'ın kara/deniz kararıyla
 * aynı kural: noktanın hexinin merkezinden noktaya uzanan doğru eğriyi
 * kesiyorsa nokta komşu taraftadır (bkz. surfaceGL fillCells).
 */
export function smoothLandAt(mesh, x, y) {
  const world = mesh.world;
  const cols = world.cols;
  const ti = tileIndexAt(world, x, y);
  if (ti < 0) return false;
  const tile = world.tiles[ti];
  const P = world.wrapWidth || 0;
  let lx = x - tile.x;
  if (P) lx -= P * Math.round(lx / P);
  const ly = y - tile.y;
  const gl = mesh.gl;
  const n = gl.head[ti * 4 + 1];
  const start = gl.head[ti * 4];
  const d = gl.data;
  let bestT = -1;
  let result = ti;
  for (let i = 0; i < n; i++) {
    const o = (start + i) * 8;
    const ax = d[o]; const ay = d[o + 1];
    const ex = d[o + 2] - ax; const ey = d[o + 3] - ay;
    const den = lx * ey - ly * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * ly - ay * lx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t > bestT) {
      bestT = t;
      const side = ex * (ly - ay) - ey * (lx - ax);
      result = side * d[o + 6] > 0 ? d[o + 5] * cols + d[o + 4] : ti;
    }
  }
  return !world.tiles[result].terrain.water;
}

/** Dünya noktasının (açılmış x olabilir) hex indeksi; harita dışı -1. Küp yuvarlama, tahsisatsız. */
function tileIndexAt(world, x, y) {
  const cols = world.cols;
  const fr = (y * 2) / (3 * HEX_SIZE);
  const fq = x / (Math.sqrt(3) * HEX_SIZE) - fr / 2;
  const fs = -fq - fr;
  let rq = Math.round(fq);
  let rr = Math.round(fr);
  const rs = Math.round(fs);
  const dq = Math.abs(rq - fq);
  const dr = Math.abs(rr - fr);
  const ds = Math.abs(rs - fs);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  if (rr < 0 || rr >= world.rows) return -1;
  const col = rq + ((rr - (rr & 1)) >> 1);
  if (!world.wrapWidth && (col < 0 || col >= cols)) return -1;
  return rr * cols + (((col % cols) + cols) % cols);
}

function reversePts(pts) {
  const m = pts.length / 2;
  const out = new Float64Array(pts.length);
  for (let i = 0; i < m; i++) {
    out[i * 2] = pts[(m - 1 - i) * 2];
    out[i * 2 + 1] = pts[(m - 1 - i) * 2 + 1];
  }
  return out;
}

/**
 * Kare başına bölge anahtarı (deniz -1). Ağın yeniden kurulması gerekip
 * gerekmediği bununla anlaşılır: etiket numaraları aynı kalırken bir
 * province'in bütünüyle el değiştirmesi ancak anahtarda görünür.
 */
export function borderKeys(world, groupOf) {
  const n = world.cols * world.rows;
  const keys = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const t = world.tiles[i];
    if (!t || t.terrain.water) { keys[i] = -1; continue; }
    // Buz eteği bağlı olduğu province'e katılır: sınır dağın etrafından
    // dolaşmaz, province'in kendi kenarı olur.
    const province = t.provinceId >= 0 ? t.provinceId : (t.fringeOf ?? -1);
    const group = groupOf(t);
    keys[i] = (province + 1) * 4096 + (group + 1);
  }
  return keys;
}

export function sameKeys(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Bölümleme aynı kalıp yalnız grup (sahip/kültür) değiştiyse ağı yerinde
 * günceller ve true döner; bölümleme değiştiyse false (tam kurulum gerekir).
 *
 * Barış masası ve yerleşim province'i BÜTÜN olarak devreder: kümeler aynı
 * kalır, yalnız bir bölgenin sahibi değişir. O zaman zincirler, bölge
 * döngüleri, GL tablosu ve yamalar birebir geçerlidir — değişen tek şey hangi
 * zincirin ülke, hangisinin province sınırı olduğudur. Tam kurulum ~30 ms
 * (tarayıcıda, nadir çalışan soğuk kod) tek karelik takılma demekti.
 */
export function updateMeshGroups(mesh, keys) {
  const old = mesh.labels;
  const n = old.length;
  const next = new Int32Array(mesh.regions.length).fill(-2);
  const seen = new Map();
  for (let i = 0; i < n; i++) {
    const label = old[i];
    const key = keys[i];
    if (label < 0 || key < 0) {
      if ((label < 0) !== (key < 0)) return false;
      continue;
    }
    if (next[label] === -2) {
      // İki eski bölge aynı anahtara düşüyorsa birleşmişlerdir: bölümleme değişti.
      if (seen.has(key)) return false;
      seen.set(key, label);
      next[label] = key;
    } else if (next[label] !== key) {
      return false;
    }
  }
  for (const region of mesh.regions) {
    const key = next[region.id];
    if (key < 0) continue;
    region.group = (key % 4096) - 1;
  }
  for (const ch of mesh.chains) {
    if (ch.pos < 0 || ch.neg < 0) continue;
    ch.cls = mesh.regions[ch.pos].group !== mesh.regions[ch.neg].group ? LINE_COUNTRY : LINE_PROVINCE;
  }
  mesh.keys = keys;
  mesh.index = null;
  // Sahipli/sahipsiz ve ülke sınırı değişti: bölge dokusu ve gölge alanı
  // yeniden kurulur; geometri ve dolgu tablosu aynen geçerli.
  mesh.regionData = null;
  mesh.band = null;
  mesh.version++;
  return true;
}

/**
 * GL dolgu eşlemesinin tablosu.
 *
 * Shader her piksel için kendi hexinin merkezinden piksele bir doğru çeker;
 * doğru yumuşak sınırı kesiyorsa piksel komşu bölgededir ve rengi o taraftaki
 * komşu hexten okunur. Hex merkezi daima kendi bölgesinde kalır (yumuşak eğri
 * kenar orta noktalarının dışbükey zarfından taşmaz), bu yüzden kesişim testi
 * tek başına yeter; uzaklık alanı ya da çokgen dolgusu gerekmez.
 *
 * Kayıtlar hex merkezine göre YEREL koordinattadır: shader sarmalı hiç
 * bilmeden doğru parçayı bulur.
 *
 *   head: cols x rows RGBA32F  — (ilk kayıt, sayı, 0, 0)
 *   data: GL_DATA_WIDTH x h    — kayıt başına iki teksel:
 *         (ax, ay, bx, by), (karşı kol, karşı satır, karşı tarafın işareti,
 *         1 = kıyı / 0 = kara-kara)
 */
function buildGlTable(world, labels, chains, eTile, eOther) {
  const cols = world.cols;
  const n = cols * world.rows;
  const P = world.wrapWidth || 0;
  const tiles = world.tiles;
  const nbr = neighborTable(world);
  const R = HEX_SIZE + GL_MARGIN;
  // Kayıtlar önce düz bir diziye (kare + 8 değer) yazılır, sonra kare başına
  // sayılıp yerleştirilir: kare başına JS dizisi tutmak tahsisat ve GC'ydi.
  const REC = 9;
  let rec = new Float32Array(65536 * REC);
  let total = 0;
  const counts = new Int32Array(n);
  // Hex başına zincirde değdiği kenar aralığı: parça taraması yalnız o
  // aralığın çevresine bakar (eğri H'den en çok 17 birim sapar, kenar 26).
  // Her parçayı her yakın hexe sınamak uzun kıyıda karesel büyüyordu.
  const near = [];
  const stamp = new Int32Array(n).fill(-1);
  const kLo = new Int32Array(n);
  const kHi = new Int32Array(n);
  let cid = 0;
  const touch = (ti, k) => {
    if (stamp[ti] !== cid) {
      stamp[ti] = cid;
      kLo[ti] = k;
      kHi[ti] = k;
      near.push(ti);
    } else {
      if (k < kLo[ti]) kLo[ti] = k;
      if (k > kHi[ti]) kHi[ti] = k;
    }
  };
  for (const ch of chains) {
    cid++;
    // Kıyı da tabloda: shader kara/deniz kararını da yumuşak eğriden verir.
    // Harita kenarı (kutup) hex kenarında kalır, onu eşlemeye gerek yok.
    const coast = ch.cls === LINE_COAST;
    if (coast && ch.pos !== SEA && ch.neg !== SEA) continue;
    near.length = 0;
    const edgeCount = ch.edges.length;
    for (let k = 0; k < edgeCount; k++) {
      const ref = ch.edges[k];
      const e = ref >= 0 ? ref : ~ref;
      const ta = eTile[e];
      const tb = eOther[e];
      touch(ta, k);
      if (tb < 0) continue;
      touch(tb, k);
      // Kenarın iki ucundaki üçüncü hexler: eğri H'den saptığında köşede
      // onlara da girer (bkz. EĞRİ BİÇİMİ). Kenarın iki hexinin ortak
      // komşuları, yön d'nin iki yanındaki yönlerdir.
      for (let d = 0; d < 6; d++) {
        if (nbr[ta * 6 + d] !== tb) continue;
        for (const dd of [(d + 1) % 6, (d + 5) % 6]) {
          const j = nbr[ta * 6 + dd];
          if (j >= 0 && (labels[j] === ch.pos || labels[j] === ch.neg)) touch(j, k);
        }
        break;
      }
    }
    const S = ch.S;
    const ms = S.length / 2;
    const segs = ch.closed ? ms : ms - 1;
    const midX = (ch.bbox[0] + ch.bbox[2]) / 2;
    // H'nin k. parçası ch.edges[k]'dir; S eşit aralıklı olduğundan k. kenar
    // S'de yaklaşık k·ratio'dadır (bütün hex kenarları eşit boy).
    const ratio = segs / edgeCount;
    for (const ti of near) {
      let sLo = 0;
      let sHi = segs - 1;
      if (!(ch.closed && kHi[ti] - kLo[ti] > edgeCount / 2)) {
        sLo = Math.max(0, Math.floor((kLo[ti] - 4) * ratio));
        sHi = Math.min(segs - 1, Math.ceil((kHi[ti] + 5) * ratio));
      }
      const t = tiles[ti];
      const mine = labels[ti];
      const farLabel = mine === ch.pos ? ch.neg : ch.pos;
      const farSign = mine === ch.pos ? -1 : 1;
      // Zincir açılmış koordinatta; hex merkezi aynı periyoda çekilir.
      const cx = P ? t.x + P * Math.round((midX - t.x) / P) : t.x;
      const cy = t.y;
      for (let s = sLo; s <= sHi; s++) {
        const s2 = s + 1 < ms ? s + 1 : 0;
        const ax = S[s * 2] - cx;
        const ay = S[s * 2 + 1] - cy;
        const bx = S[s2 * 2] - cx;
        const by = S[s2 * 2 + 1] - cy;
        if ((ax < -R && bx < -R) || (ax > R && bx > R)
          || (ay < -R && by < -R) || (ay > R && by > R)) continue;
        if (!segTouchesHex(ax, ay, bx, by, R)) continue;
        // Karşı taraf: o bölgenin, parçaya en yakın komşu hexi. Renk ve işgal
        // taraması oradan okunur; hex başına arazi tonu böylece korunur.
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        let best = -1;
        let bestD = Infinity;
        for (let d = 0; d < 6; d++) {
          const j = nbr[ti * 6 + d];
          if (j < 0 || labels[j] !== farLabel) continue;
          const o = NEIGHBOR_OFFSET[d];
          const dd = (o[0] - mx) ** 2 + (o[1] - my) ** 2;
          if (dd < bestD) { bestD = dd; best = j; }
        }
        if (best < 0) continue;
        if ((total + 1) * REC > rec.length) {
          const grown = new Float32Array(rec.length * 2);
          grown.set(rec);
          rec = grown;
        }
        const o = total * REC;
        rec[o] = ti;
        rec[o + 1] = ax; rec[o + 2] = ay; rec[o + 3] = bx; rec[o + 4] = by;
        rec[o + 5] = best % cols; rec[o + 6] = Math.floor(best / cols); rec[o + 7] = farSign;
        rec[o + 8] = coast ? 1 : 0;
        counts[ti]++;
        total++;
      }
    }
  }
  const head = new Float32Array(n * 4);
  let at = 0;
  let rawMax = 0;
  const start = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    start[i] = at;
    if (!counts[i]) continue;
    if (counts[i] > rawMax) rawMax = counts[i];
    const count = Math.min(GL_MAX_PER_TILE, counts[i]);
    head[i * 4] = at;
    head[i * 4 + 1] = count;
    at += count;
  }
  const height = Math.max(1, Math.ceil(Math.max(1, at * 2) / GL_DATA_WIDTH));
  const data = new Float32Array(GL_DATA_WIDTH * height * 4);
  const fill = new Int32Array(n);
  for (let r = 0; r < total; r++) {
    const o = r * REC;
    const ti = rec[o];
    if (fill[ti] >= GL_MAX_PER_TILE) continue;
    const d = (start[ti] + fill[ti]++) * 8;
    data[d] = rec[o + 1]; data[d + 1] = rec[o + 2]; data[d + 2] = rec[o + 3]; data[d + 3] = rec[o + 4];
    data[d + 4] = rec[o + 5]; data[d + 5] = rec[o + 6]; data[d + 6] = rec[o + 7]; data[d + 7] = rec[o + 8];
  }
  return { head, data, width: GL_DATA_WIDTH, height, entries: at, rawMax };
}

/**
 * Kare başına bölge dokusu: RG bölge kimliği + 1 (deniz 0), B sahipli mi.
 * Shader hex rengini yalnız aynı bölge içinde süzer (ülke rengi sınırı
 * aşmasın) ve ülke kenar gölgesini yalnız sahipli karada çizer. Sahiplik
 * değişince (bkz. updateMeshGroups) yalnız bu doku tazelenir.
 */
export function meshRegionData(mesh) {
  if (mesh.regionData) return mesh.regionData;
  const labels = mesh.labels;
  const n = labels.length;
  const region = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const id = labels[i] + 1;
    region[i * 4] = id & 255;
    region[i * 4 + 1] = (id >> 8) & 255;
    region[i * 4 + 2] = labels[i] >= 0 && mesh.regions[labels[i]].group >= 0 ? 255 : 0;
    region[i * 4 + 3] = 255;
  }
  mesh.regionData = region;
  return region;
}

/** Kenar gölgesi alanının hex başına teksel sayısı (malzeme rasteriyle aynı ızgara). */
const BAND_SUB = 4;

/**
 * Ülke kenar gölgesinin uzaklık alanı: her teksel için en yakın ülke sınırına
 * ya da sahipli kıyıya uzaklık, BAND_REACH'e bölünüp 0-255'e sıkışmış.
 *
 * Gölge önce Canvas2D'de, ülkenin çokgenine kırpılmış altı geniş darbeydi;
 * yakın zoomda darbeler 240 px'e çıkıyor ve statik katman her kurulduğunda
 * GPU'yu kareden taşırıyordu (ölçüldü: kare aralığı p95 4.3 → 12-17 ms).
 * Shader bu alanı piksel başına tek okumayla, kademesiz bir geçiş olarak
 * çizer. İşaretsiz uzaklık yeter: ülkenin içindeki bir pikselden başka iki
 * ülkenin sınırına giden yol önce kendi sınırını keser.
 *
 * Izgara malzeme rasteriyle aynı (hex başına 4 teksel, x WRAP_X0'dan): GL
 * yüzeyi aynı alan orijini ve açıklığıyla okur.
 */
export function meshBandField(mesh) {
  if (!mesh.band) {
    const job = bandFieldJob(mesh);
    while (!job.next().done);
  }
  return mesh.band;
}

/**
 * Gölge alanını dilim dilim kuran üreteç: her yield bir dilim sonudur (tarayıcıda
 * tamamı ~20 ms; sahiplik değişince tek kareye sığdırılırsa takılma olur).
 * Bitince alanı mesh.band'e yazar.
 */
export function* bandFieldJob(mesh) {
  // Sürüm İŞİN BAŞINDA damgalanır: yarıda sahiplik değişirse eski sonuç yeni
  // sürüm sanılmasın (çağıran o zaman işi baştan başlatır).
  const version = mesh.version;
  const world = mesh.world;
  const w = world.cols * BAND_SUB;
  const h = world.rows * BAND_SUB;
  const tw = (Math.sqrt(3) * HEX_SIZE) / BAND_SUB;
  const th = (1.5 * HEX_SIZE) / BAND_SUB;
  const x0 = -(Math.sqrt(3) * HEX_SIZE) / 2;
  const y0 = -(1.5 * HEX_SIZE) / 2;
  const d = new Float32Array(w * h).fill(1e9);
  // Tohum: zincire yakın teksellere KESİN uzaklık; gerisini chamfer yayar.
  let n = 0;
  for (const ch of mesh.chains) {
    if (ch.cls === LINE_PROVINCE) continue;
    if (ch.cls === LINE_COAST) {
      const land = mesh.regions[ch.pos >= 0 ? ch.pos : ch.neg];
      if (!land || land.group < 0) continue;
    }
    const S = ch.S;
    const m = S.length / 2;
    const segs = ch.closed ? m : m - 1;
    for (let s = 0; s < segs; s++) {
      const s2 = s + 1 < m ? s + 1 : 0;
      const ax = S[s * 2]; const ay = S[s * 2 + 1];
      const bx = S[s2 * 2]; const by = S[s2 * 2 + 1];
      const ex = bx - ax; const ey = by - ay;
      const ee = Math.max(1e-9, ex * ex + ey * ey);
      const i0 = Math.floor((Math.min(ax, bx) - x0) / tw) - 1;
      const i1 = Math.floor((Math.max(ax, bx) - x0) / tw) + 1;
      const j0 = Math.max(0, Math.floor((Math.min(ay, by) - y0) / th) - 1);
      const j1 = Math.min(h - 1, Math.floor((Math.max(ay, by) - y0) / th) + 1);
      for (let j = j0; j <= j1; j++) {
        const cy = y0 + (j + 0.5) * th;
        for (let i = i0; i <= i1; i++) {
          const cx = x0 + (i + 0.5) * tw;
          const t = Math.max(0, Math.min(1, ((cx - ax) * ex + (cy - ay) * ey) / ee));
          const dist = Math.hypot(cx - ax - ex * t, cy - ay - ey * t);
          const k = j * w + (((i % w) + w) % w);
          if (dist < d[k]) d[k] = dist;
        }
      }
    }
    if (++n % 160 === 0) yield;
  }
  yield;
  // İki geçişli chamfer; yatay sarmal için iki tur (bkz. material.distanceField).
  const dd = Math.hypot(tw, th);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        const xl = x > 0 ? x - 1 : w - 1;
        const xr = x < w - 1 ? x + 1 : 0;
        if (y > 0) {
          const up = (y - 1) * w;
          if (d[up + x] + th < v) v = d[up + x] + th;
          if (d[up + xl] + dd < v) v = d[up + xl] + dd;
          if (d[up + xr] + dd < v) v = d[up + xr] + dd;
        }
        if (d[y * w + xl] + tw < v) v = d[y * w + xl] + tw;
        d[i] = v;
      }
      if (y % 96 === 95) yield;
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        const xl = x > 0 ? x - 1 : w - 1;
        const xr = x < w - 1 ? x + 1 : 0;
        if (y < h - 1) {
          const down = (y + 1) * w;
          if (d[down + x] + th < v) v = d[down + x] + th;
          if (d[down + xl] + dd < v) v = d[down + xl] + dd;
          if (d[down + xr] + dd < v) v = d[down + xr] + dd;
        }
        if (d[y * w + xr] + tw < v) v = d[y * w + xr] + tw;
        d[i] = v;
      }
      if (y % 96 === 0) yield;
    }
  }
  const data = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = Math.min(255, Math.round((d[i] / BAND_REACH) * 255));
  mesh.band = { data, w, h, version };
}
