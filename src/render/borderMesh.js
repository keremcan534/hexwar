// SINIR AĞI — province ve ülke sınırlarının yumuşatılmış geometrisi.
//
// Harita birimi province'tir, veri ızgarası ise hex kalır; sınır hex
// kenarlarından türer. Hex kenarını olduğu gibi çizmek haritayı petek gibi
// okutuyordu: oyuncu province'i değil hexi görüyordu. Kenarlar hex köşe
// grafiğinde ZİNCİRLERE dizilir ve kara-kara zincirleri kenar orta
// noktalarından yumuşatılır.
//
// Zincir, iki bölgenin kesintisiz ortak sınırıdır; üç bölgenin buluştuğu
// köşede (kavşak) ve kıyıda kopar. Uçlar yumuşatmada SABİT kalır: kavşak
// kaymaz, komşu zincirler aynı noktada buluşur, bölge çokgenleri dikişsiz
// kapanır.
//
// Kıyı hex kenarında kalır. Kara maskesi (surfaceGL) ve iki deniz katmanı hex
// kenarlıdır; kıyıyı yumuşatmak denize dokunmak demek ve bu adımın işi değil.
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
 * Chaikin tekrar sayısı. 2'de dikey sınırların dalgası hâlâ köşeli okunuyor,
 * 4'te nokta sayısı ikiye katlanıp hiçbir şey kazandırmıyor; doğrusal
 * kısımlar zaten sadeleştirmede tek parçaya iner.
 */
const SMOOTH_ITERS = 3;

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

// Yumuşatmanın ara tamponları: zincir başına yeni dizi ayırmak kurulumun
// üçte birini tahsisata harcıyordu.
let SCRATCH_A = new Float64Array(8192);
let SCRATCH_B = new Float64Array(8192);

/**
 * Chaikin köşe kırpması + doğrusal noktaların atılması; sonuç kesin boyda
 * yeni bir dizidir. Açık zincirde uçlar sabit: kavşak ve kıyı ucu yerinde
 * kalır, komşu zincirler orada birleşmeye devam eder.
 */
function smoothPolyline(ctrl, closed, iters) {
  const need = ctrl.length * (2 ** iters) + 8;
  if (SCRATCH_A.length < need) {
    SCRATCH_A = new Float64Array(need * 2);
    SCRATCH_B = new Float64Array(need * 2);
  }
  let src = ctrl;
  let len = ctrl.length;
  let dst = SCRATCH_A;
  for (let k = 0; k < iters; k++) {
    const m = len / 2;
    if (m < 3) break;
    let o = 0;
    if (closed) {
      for (let i = 0; i < m; i++) {
        const j = i + 1 < m ? i + 1 : 0;
        const ax = src[i * 2]; const ay = src[i * 2 + 1];
        const bx = src[j * 2]; const by = src[j * 2 + 1];
        dst[o++] = 0.75 * ax + 0.25 * bx; dst[o++] = 0.75 * ay + 0.25 * by;
        dst[o++] = 0.25 * ax + 0.75 * bx; dst[o++] = 0.25 * ay + 0.75 * by;
      }
    } else {
      dst[o++] = src[0]; dst[o++] = src[1];
      for (let i = 0; i < m - 1; i++) {
        const ax = src[i * 2]; const ay = src[i * 2 + 1];
        const bx = src[i * 2 + 2]; const by = src[i * 2 + 3];
        if (i > 0) { dst[o++] = 0.75 * ax + 0.25 * bx; dst[o++] = 0.75 * ay + 0.25 * by; }
        if (i < m - 2) { dst[o++] = 0.25 * ax + 0.75 * bx; dst[o++] = 0.25 * ay + 0.75 * by; }
      }
      dst[o++] = src[(m - 1) * 2]; dst[o++] = src[(m - 1) * 2 + 1];
    }
    src = dst;
    len = o;
    dst = dst === SCRATCH_A ? SCRATCH_B : SCRATCH_A;
  }
  // Yatay hex sınırının orta noktaları tek doğru üstündedir; yumuşatma oraya
  // onlarca eş doğrultulu nokta koyar ve her biri GL'de piksel başına bir
  // döngü adımı, Canvas2D'de bir lineTo demektir. Sapma son TUTULAN noktaya
  // göre ölçülür: komşuya göre ölçülseydi yavaş bir kavisin bütün noktaları
  // tek tek "düz" sayılıp atılabilirdi.
  const m = len / 2;
  const keep = dst;
  let count = 0;
  let lx = src[0];
  let ly = src[1];
  keep[count++] = lx; keep[count++] = ly;
  for (let i = 1; i < m - 1; i++) {
    const ax = src[i * 2] - lx; const ay = src[i * 2 + 1] - ly;
    const bx = src[i * 2 + 2] - src[i * 2]; const by = src[i * 2 + 3] - src[i * 2 + 1];
    const la = Math.hypot(ax, ay); const lb = Math.hypot(bx, by);
    if (la < 1e-9) continue;
    // ~0.25°: 3.5x zoomda bile kırık görünmeyen sapma.
    if (lb > 1e-9 && Math.abs(ax * by - ay * bx) / (la * lb) <= 0.004) continue;
    lx = src[i * 2]; ly = src[i * 2 + 1];
    keep[count++] = lx; keep[count++] = ly;
  }
  if (m > 1) { keep[count++] = src[(m - 1) * 2]; keep[count++] = src[(m - 1) * 2 + 1]; }
  return keep.slice(0, count);
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
      regions.push({ id, province, group, tiles: [], chains: [], loops: [], bbox: null, partial: false });
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
    if (ch.pos >= 0 && ch.neg >= 0) {
      const ra = regions[ch.pos];
      const rb = regions[ch.neg];
      ch.cls = ra.group !== rb.group ? LINE_COUNTRY : LINE_PROVINCE;
      const hm = ch.H.length / 2;
      const segs = ch.closed ? hm : hm - 1;
      const ctrl = new Float64Array((segs + (ch.closed ? 0 : 2)) * 2);
      let o = 0;
      if (!ch.closed) { ctrl[o++] = ch.H[0]; ctrl[o++] = ch.H[1]; }
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % hm;
        ctrl[o++] = (ch.H[i * 2] + ch.H[j * 2]) / 2;
        ctrl[o++] = (ch.H[i * 2 + 1] + ch.H[j * 2 + 1]) / 2;
      }
      if (!ch.closed) { ctrl[o++] = ch.H[(hm - 1) * 2]; ctrl[o++] = ch.H[(hm - 1) * 2 + 1]; }
      ch.S = smoothPolyline(ctrl, ch.closed, SMOOTH_ITERS);
    } else {
      ch.cls = LINE_COAST;
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
  let buf = new Float64Array(4096);
  for (const region of regions) {
    const starts = new Map();
    const loops = [];
    for (const id of region.chains) {
      const ch = chains[id];
      const reversed = ch.pos !== region.id;
      if (ch.closed) {
        loops.push(reversed ? reversePts(ch.S) : ch.S);
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
        const S = cur.ch.S;
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
        region.partial = true;
      }
    }
    region.loops = loops;
    if (!loops.length) region.partial = true;
    let box = null;
    for (const loop of loops) box = bboxOf(loop, box ?? undefined);
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
 *         (ax, ay, bx, by), (karşı kol, karşı satır, karşı tarafın işareti, 0)
 */
function buildGlTable(world, labels, chains, eTile, eOther) {
  const cols = world.cols;
  const n = cols * world.rows;
  const P = world.wrapWidth || 0;
  const tiles = world.tiles;
  const nbr = neighborTable(world);
  const R = HEX_SIZE + GL_MARGIN;
  // Kayıtlar önce düz bir diziye (kare, 7 değer) yazılır, sonra kare başına
  // sayılıp yerleştirilir: kare başına JS dizisi tutmak tahsisat ve GC'ydi.
  let rec = new Float32Array(65536 * 8);
  let total = 0;
  const counts = new Int32Array(n);
  const near = new Set();
  for (const ch of chains) {
    if (ch.cls === LINE_COAST) continue;
    near.clear();
    for (const ref of ch.edges) {
      const e = ref >= 0 ? ref : ~ref;
      near.add(eTile[e]);
      if (eOther[e] >= 0) near.add(eOther[e]);
    }
    const S = ch.S;
    const ms = S.length / 2;
    const segs = ch.closed ? ms : ms - 1;
    const midX = (ch.bbox[0] + ch.bbox[2]) / 2;
    for (const ti of near) {
      const t = tiles[ti];
      const mine = labels[ti];
      const farLabel = mine === ch.pos ? ch.neg : ch.pos;
      const farSign = mine === ch.pos ? -1 : 1;
      // Zincir açılmış koordinatta; hex merkezi aynı periyoda çekilir.
      const cx = P ? t.x + P * Math.round((midX - t.x) / P) : t.x;
      const cy = t.y;
      for (let s = 0; s < segs; s++) {
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
        if ((total + 1) * 8 > rec.length) {
          const grown = new Float32Array(rec.length * 2);
          grown.set(rec);
          rec = grown;
        }
        const o = total * 8;
        rec[o] = ti;
        rec[o + 1] = ax; rec[o + 2] = ay; rec[o + 3] = bx; rec[o + 4] = by;
        rec[o + 5] = best % cols; rec[o + 6] = Math.floor(best / cols); rec[o + 7] = farSign;
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
    const o = r * 8;
    const ti = rec[o];
    if (fill[ti] >= GL_MAX_PER_TILE) continue;
    const d = (start[ti] + fill[ti]++) * 8;
    data[d] = rec[o + 1]; data[d + 1] = rec[o + 2]; data[d + 2] = rec[o + 3]; data[d + 3] = rec[o + 4];
    data[d + 4] = rec[o + 5]; data[d + 5] = rec[o + 6]; data[d + 6] = rec[o + 7];
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
