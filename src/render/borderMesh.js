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
    const verts = [startV];
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
      verts.push(v);
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
      edges, pts, verts, start: startV, end: v, loop: v === startV && !isBreak(startV),
      id: 0, pos: 0, neg: 0, cls: 0, closed: false, H: null, S: null, bbox: null, cut: null,
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

  // --- Hücre geometrisi (organik hex) ------------------------------------
  // Zincir üstündeki köşe, eğrinin ona en yakın örneğine "oturur"; zincir
  // kenarının hücre sınırı eğrinin iki oturmuş köşe arasındaki parçasıdır.
  // İç kenarlar oturmuş ya da titretilmiş köşeler arasında kıvrılır (bkz.
  // cellEdge). Böylece province sınırı hücre kenarlarının tam birleşimidir.
  const snapX = new Float64Array(numCorners);
  const snapY = new Float64Array(numCorners);
  const snapSet = new Uint8Array(numCorners);
  const edgeChain = new Int32Array(n * 6).fill(-1);
  const edgeK = new Int32Array(n * 6);
  const edgeRev = new Uint8Array(n * 6);
  for (const ch of chains) {
    ch.cut = cutChain(ch);
    const ns = ch.S.length / 2;
    for (let k = 0; k < ch.cut.length; k++) {
      const v = ch.verts[k];
      const si = ((ch.cut[k] % ns) + ns) % ns;
      snapX[v] = ch.S[si * 2];
      snapY[v] = ch.S[si * 2 + 1];
      snapSet[v] = 1;
    }
    for (let k = 0; k < ch.edges.length; k++) {
      const ref = ch.edges[k];
      const e = ref >= 0 ? ref : ~ref;
      const a = eTile[e] * 6 + eDir[e];
      edgeChain[a] = ch.id;
      edgeK[a] = k;
      edgeRev[a] = ref >= 0 ? 0 : 1;
      const j = eOther[e];
      if (j >= 0) {
        // Komşunun aynı kenarı (yön d+3) ters yönde yürünür.
        const b = j * 6 + (eDir[e] + 3) % 6;
        edgeChain[b] = ch.id;
        edgeK[b] = k;
        edgeRev[b] = ref >= 0 ? 1 : 0;
      }
    }
    ch.verts = null;
  }
  const cells = { cornerOf, snapX, snapY, snapSet, edgeChain, edgeK, edgeRev, nbr };

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
    world, keys, labels, regions, chains, cells,
    edges: { eTile, eOther },
    gl: null,
    regionData: null,
    band: null,
    version: 0,
  };
}

/** GL dolgu eşlemesinin tablosu; ağ başına ilk istekte kurulur. */
export function meshGlTable(mesh) {
  mesh.gl ??= buildGlTable(mesh);
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
 * Köşe titremesi ve iç kenar kıvrımı (dünya birimi). Küçük tutulur: zincir
 * eğrisi hex yolundan 17 birime dek sapabilir ve zincirde olmayan bir köşe
 * hex yolundan en az iç yarıçap (22.5) uzaktadır; titreme bu payın içinde
 * kalmalı ki iç kenar sınır eğrisini kesmesin.
 */
const CORNER_JITTER = 4.5;
/** İç kenar eğrisi: yarım dalga (yay) + tam dalga (S) genliği. */
const EDGE_BOW = 5;
const EDGE_S = 2;
/** İç kenarın parça sayısı: yakın zoomda eğri, kırık çizgi gibi okunmasın. */
const EDGE_SEGS = 5;

/** -1..1 aralığında, tam sayı anahtardan deterministik değer. */
function hashSigned(a, b) {
  return hash2(a, b) * 2 - 1;
}

/** Sarmal periyodunda en yakın temsilciye çekilmiş fark. */
function wrapDelta(dx, P) {
  return P ? dx - P * Math.round(dx / P) : dx;
}

/** S'nin [lo, hi] (sarmalı indeks) aralığında (x, y)'ye en yakın örneği. */
function nearestSample(S, ns, x, y, lo, hi) {
  if (hi < lo) hi = lo;
  let best = lo;
  let bestD = Infinity;
  for (let u = lo; u <= hi; u++) {
    const i = ((u % ns) + ns) % ns;
    const d = (S[i * 2] - x) ** 2 + (S[i * 2 + 1] - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

/**
 * Zincirin her hex köşesi için eğri örnek indeksi (artan, kapalıda sarmalı).
 * Açık zincirin uçları eğrinin uçlarıdır. Kenar k'nin hücre sınırı
 * S[cut[k] .. cut[k+1]] parçasıdır.
 */
function cutChain(ch) {
  const H = ch.H;
  const S = ch.S;
  const E = ch.edges.length;
  const ns = S.length / 2;
  if (!ch.closed) {
    const m = E + 1;
    const cut = new Int32Array(m);
    cut[m - 1] = ns - 1;
    const ratio = (ns - 1) / E;
    let prev = 0;
    for (let k = 1; k < m - 1; k++) {
      const lo = Math.max(prev + 1, Math.floor((k - 2) * ratio));
      const hi = Math.min(ns - 1 - (m - 1 - k), Math.ceil((k + 2) * ratio));
      cut[k] = nearestSample(S, ns, H[k * 2], H[k * 2 + 1], lo, hi);
      prev = cut[k];
    }
    return cut;
  }
  const cut = new Int32Array(E);
  const ratio = ns / E;
  cut[0] = nearestSample(S, ns, H[0], H[1], Math.floor(-2 * ratio), Math.ceil(2 * ratio));
  let prev = cut[0];
  for (let k = 1; k < E; k++) {
    const lo = Math.max(prev + 1, cut[0] + Math.floor((k - 2) * ratio));
    const hi = Math.min(cut[0] + ns - (E - k), cut[0] + Math.ceil((k + 2) * ratio));
    cut[k] = nearestSample(S, ns, H[k * 2], H[k * 2 + 1], lo, hi);
    prev = cut[k];
  }
  return cut;
}

/** Köşenin hücre konumu, `tile` merkezine göre yerel: oturmuş ya da titretilmiş. */
function cornerLocal(mesh, tile, k, out) {
  const { cornerOf, snapX, snapY, snapSet } = mesh.cells;
  const P = mesh.world.wrapWidth || 0;
  const id = cornerOf(tile.q, tile.r, k);
  if (snapSet[id]) {
    out[0] = wrapDelta(snapX[id] - tile.x, P);
    out[1] = snapY[id] - tile.y;
    return;
  }
  out[0] = CORNERS[k][0] + CORNER_JITTER * hashSigned(id, 7);
  out[1] = CORNERS[k][1] + CORNER_JITTER * hashSigned(id, 13);
}

const CORNER_A = new Float64Array(2);
const CORNER_B = new Float64Array(2);

/**
 * Hücre kenarı: `ti` hexinin köşe d'sinden d+1'e, ti merkezine göre YEREL.
 *
 *   zincir kenarı  → sınır eğrisinin iki oturmuş köşe arası parçası,
 *   iç kenar       → köşeler arasında iki ara noktayla hafif kıvrık,
 *   deniz-deniz / harita kenarı → düz hex kenarı (dolgu tablosu onları atlar).
 *
 * İç kenar, küçük indeksli hexin gözünden kurulur; komşu aynı kenarı birebir
 * aynı noktalarla (ters sırada) görür.
 */
export function cellEdge(mesh, ti, d) {
  const m = edgeInto(mesh, ti, d);
  return EDGE_BUF.slice(0, m * 2);
}

/** Kenar örnekleme tamponu (bkz. edgeInto); tablo kurulumu kenar başına dizi ayırmasın. */
let EDGE_BUF = new Float64Array(512);
const SIN_BOW = Float64Array.from({ length: EDGE_SEGS + 1 }, (_, i) => Math.sin((Math.PI * i) / EDGE_SEGS));
const SIN_S = Float64Array.from({ length: EDGE_SEGS + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / EDGE_SEGS));

/** cellEdge'in tahsisatsız gövdesi: noktaları EDGE_BUF'a yazar, nokta sayısını döner. */
function edgeInto(mesh, ti, d) {
  const world = mesh.world;
  const P = world.wrapWidth || 0;
  const tile = world.tiles[ti];
  const cells = mesh.cells;
  const slot = ti * 6 + d;
  const c = cells.edgeChain[slot];
  if (c >= 0) {
    const ch = mesh.chains[c];
    const S = ch.S;
    const ns = S.length / 2;
    const k = cells.edgeK[slot];
    const u0 = ch.cut[k];
    const u1 = k + 1 < ch.cut.length ? ch.cut[k + 1] : ch.cut[0] + ns;
    const len = u1 - u0 + 1;
    if (EDGE_BUF.length < len * 2) EDGE_BUF = new Float64Array(len * 4);
    const out = EDGE_BUF;
    const rev = cells.edgeRev[slot] === 1;
    for (let i = 0; i < len; i++) {
      const si = (((u0 + i) % ns) + ns) % ns;
      const o = (rev ? len - 1 - i : i) * 2;
      out[o] = wrapDelta(S[si * 2] - tile.x, P);
      out[o + 1] = S[si * 2 + 1] - tile.y;
    }
    return len;
  }
  const j = cells.nbr[slot];
  const labels = mesh.labels;
  const out = EDGE_BUF;
  if (j < 0 || labels[ti] < 0 || labels[j] < 0) {
    const ca = CORNERS[d];
    const cb = CORNERS[(d + 1) % 6];
    out[0] = ca[0]; out[1] = ca[1]; out[2] = cb[0]; out[3] = cb[1];
    return 2;
  }
  // İç kenar: kanonik taraf küçük indeksli hex.
  const flip = j < ti;
  const ct = flip ? world.tiles[j] : tile;
  const cd = flip ? (d + 3) % 6 : d;
  cornerLocal(mesh, ct, cd, CORNER_A);
  cornerLocal(mesh, ct, (cd + 1) % 6, CORNER_B);
  const ax = CORNER_A[0];
  const ay = CORNER_A[1];
  const ex = CORNER_B[0] - ax;
  const ey = CORNER_B[1] - ay;
  const el = Math.sqrt(ex * ex + ey * ey) || 1;
  const nx = -ey / el;
  const ny = ex / el;
  const key = (flip ? j : ti) * 6 + cd;
  // Yay + S: kenar tek bir hafif kavis ya da iki yana kıvrılan bir dalga
  // olur; uçlarda sıfır, köşe yerinde kalır. Kırık çizgi değil eğri: sınır
  // çizgileri gibi okunsun.
  const bow = EDGE_BOW * hashSigned(key, 1);
  const wave = EDGE_S * hashSigned(key, 2);
  const np = EDGE_SEGS + 1;
  // Komşunun gözünden kurulduysa bu hexin yereline, ters sırada yazılır.
  const ox = flip ? wrapDelta(ct.x - tile.x, P) : 0;
  const oy = flip ? ct.y - tile.y : 0;
  for (let i = 0; i < np; i++) {
    const t = i / EDGE_SEGS;
    const off = bow * SIN_BOW[i] + wave * SIN_S[i];
    const o = (flip ? np - 1 - i : i) * 2;
    out[o] = ax + ex * t + nx * off + ox;
    out[o + 1] = ay + ey * t + ny * off + oy;
  }
  // Uç birebir köşe: komşu kenarla aynı nokta.
  const last = (flip ? 0 : np - 1) * 2;
  out[last] = CORNER_B[0] + ox;
  out[last + 1] = CORNER_B[1] + oy;
  return np;
}

/**
 * Hücrenin kapalı ana hattı, hex merkezine göre yerel. Altı kenar uç uca;
 * ortak köşe noktası bir kez yazılır. Ağ başına önbellekli (geometri sahiplik
 * değişiminde aynı kalır, bkz. updateMeshGroups).
 */
export function cellOutline(mesh, ti) {
  mesh.outlines ??= new Map();
  let loop = mesh.outlines.get(ti);
  if (loop) return loop;
  const parts = [];
  let len = 0;
  for (let d = 0; d < 6; d++) {
    const e = cellEdge(mesh, ti, d);
    parts.push(e);
    len += e.length - 2;
  }
  loop = new Float64Array(len);
  let o = 0;
  for (const e of parts) {
    // Son nokta bir sonraki kenarın ilk noktasıdır.
    for (let i = 0; i < e.length - 2; i++) loop[o++] = e[i];
  }
  mesh.outlines.set(ti, loop);
  return loop;
}

/**
 * Dünya noktasının hücresi (kare indeksi, harita dışı -1). Shader'ın
 * fillCells kuralının birebir aynısı: nokta hexinin merkezinden noktaya
 * uzanan doğrunun kestiği son sınır parçası, noktanın hangi hücrede olduğunu
 * söyler. Tıklama, imleç ve kıyı maskesi buradan okur.
 */
export function cellAt(mesh, x, y) {
  const world = mesh.world;
  const ti = tileIndexAt(world, x, y);
  if (ti < 0) return -1;
  const tile = world.tiles[ti];
  const lx = wrapDelta(x - tile.x, world.wrapWidth || 0);
  const ly = y - tile.y;
  const gl = meshGlTable(mesh);
  const n = gl.head[ti * 4 + 1];
  const start = gl.head[ti * 4];
  const d = gl.data;
  let bestT = -1;
  let result = ti;
  for (let i = 0; i < n; i++) {
    const o = (start + i) * 8;
    const ax = d[o];
    const ay = d[o + 1];
    const ex = d[o + 2] - ax;
    const ey = d[o + 3] - ay;
    const den = lx * ey - ly * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (ax * ey - ay * ex) / den;
    const u = (ax * ly - ay * lx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1 && t > bestT) {
      bestT = t;
      const left = ex * (ly - ay) - ey * (lx - ax) > 0;
      result = left ? d[o + 4] : d[o + 5];
    }
  }
  return result;
}

/** Dünya noktası yumuşak kıyıya göre karada mı? (bkz. cellAt) */
export function smoothLandAt(mesh, x, y) {
  const c = cellAt(mesh, x, y);
  return c >= 0 && !mesh.world.tiles[c].terrain.water;
}

/**
 * GL dolgu eşlemesinin tablosu: hücre sınırlarının parçaları, değdikleri
 * her hexe kaydedilir.
 *
 * Shader her piksel için kendi hexinin merkezinden piksele bir doğru çeker;
 * kesilen son sınır parçası pikselin hücresini verir (parçanın o yanındaki
 * hücre). Hex merkezi daima kendi hücresindedir (sapma iç yarıçapın altında,
 * bkz. EĞRİ BİÇİMİ ve CORNER_JITTER) ve hex dışbükeydir: merkezden piksele
 * doğru hexin içinde kalır, dolayısıyla hexe değen bütün parçalar o hexin
 * listesindeyse karar kesindir.
 *
 * Kayıtlar hex merkezine göre YEREL koordinattadır: shader sarmalı hiç
 * bilmeden doğru parçayı bulur.
 *
 *   head: cols x rows RGBA32F  — (ilk kayıt, sayı, 0, 0)
 *   data: GL_DATA_WIDTH x h    — kayıt başına iki teksel:
 *         (ax, ay, bx, by), (sol hücre, sağ hücre, 0, 0)
 *         sol = a→b yönüne göre çapraz çarpımı pozitif yan; hücre = kare indeksi
 */
function buildGlTable(mesh) {
  const world = mesh.world;
  const labels = mesh.labels;
  const cols = world.cols;
  const n = cols * world.rows;
  const P = world.wrapWidth || 0;
  const tiles = world.tiles;
  const nbr = neighborTable(world);
  const R = HEX_SIZE + GL_MARGIN;
  // Kayıtlar önce düz bir diziye yazılır, sonra kare başına sayılıp
  // yerleştirilir: kare başına JS dizisi tutmak tahsisat ve GC'ydi.
  const REC = 7;
  let rec = new Float32Array(262144 * REC);
  let total = 0;
  const counts = new Int32Array(n);
  const cand = new Int32Array(16);
  for (let ti = 0; ti < n; ti++) {
    if (labels[ti] < 0) continue;
    const tile = tiles[ti];
    for (let d = 0; d < 6; d++) {
      const j = nbr[ti * 6 + d];
      // Harita kenarı düz hex kenarıdır (hex sınırı = hücre sınırı).
      if (j < 0) continue;
      // Kara-kara kenarı bir kez, kıyı kenarı kara tarafından kurulur.
      if (labels[j] >= 0 && j < ti) continue;
      const m = edgeInto(mesh, ti, d);
      const pts = EDGE_BUF;
      // ti hangi yanda: düz hex kenarına göre merkezin yanı (eğri merkezi aşmaz).
      const c0 = CORNERS[d];
      const c1 = CORNERS[(d + 1) % 6];
      const tiLeft = (c1[0] - c0[0]) * -c0[1] - (c1[1] - c0[1]) * -c0[0] > 0;
      const left = tiLeft ? ti : j;
      const right = tiLeft ? j : ti;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < m; i++) {
        const x = pts[i * 2];
        const y = pts[i * 2 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      // Aday hexler: kenarın iki hexi ve komşuları. Eğri hex yolundan en çok
      // 17 birim saptığı için daha ötesine erişemez.
      let nc = 0;
      cand[nc++] = ti;
      cand[nc++] = j;
      for (let k = 0; k < 12; k++) {
        const h = nbr[(k < 6 ? ti : j) * 6 + (k % 6)];
        if (h < 0) continue;
        let seen = false;
        for (let q = 0; q < nc; q++) if (cand[q] === h) { seen = true; break; }
        if (!seen) cand[nc++] = h;
      }
      for (let q = 0; q < nc; q++) {
        const h = cand[q];
        const ht = tiles[h];
        const ox = wrapDelta(tile.x - ht.x, P);
        const oy = tile.y - ht.y;
        if (maxX + ox < -R || minX + ox > R || maxY + oy < -R || minY + oy > R) continue;
        for (let s = 0; s < m - 1; s++) {
          const ax = pts[s * 2] + ox;
          const ay = pts[s * 2 + 1] + oy;
          const bx = pts[s * 2 + 2] + ox;
          const by = pts[s * 2 + 3] + oy;
          if ((ax < -R && bx < -R) || (ax > R && bx > R)
            || (ay < -R && by < -R) || (ay > R && by > R)) continue;
          if (!segTouchesHex(ax, ay, bx, by, R)) continue;
          if ((total + 1) * REC > rec.length) {
            const grown = new Float32Array(rec.length * 2);
            grown.set(rec);
            rec = grown;
          }
          const o = total * REC;
          rec[o] = h;
          rec[o + 1] = ax; rec[o + 2] = ay; rec[o + 3] = bx; rec[o + 4] = by;
          rec[o + 5] = left; rec[o + 6] = right;
          counts[h]++;
          total++;
        }
      }
    }
  }
  const head = new Float32Array(n * 4);
  let at = 0;
  let rawMax = 0;
  let dropped = 0;
  const start = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    start[i] = at;
    if (!counts[i]) continue;
    if (counts[i] > rawMax) rawMax = counts[i];
    if (counts[i] > GL_MAX_PER_TILE) dropped += counts[i] - GL_MAX_PER_TILE;
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
    data[d + 4] = rec[o + 5]; data[d + 5] = rec[o + 6];
  }
  return { head, data, width: GL_DATA_WIDTH, height, entries: at, rawMax, dropped };
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
 * Shader bu alanı piksel başına tek okumayla çizer. Izgara malzeme
 * rasteriyle aynı (hex başına 4 teksel, x WRAP_X0'dan).
 *
 * Üreteçtir: her yield bir dilim sonudur (tarayıcıda tamamı ~20 ms; sahiplik
 * değişince tek kareye sığdırılırsa takılma olur). Bitince mesh.band'e yazar.
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
