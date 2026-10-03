// NEHİRLER — hex KENARLARI boyunca akan drenaj ağı.
//
// Nehir kare merkezinden değil, iki kare arasındaki kenardan akar: böylece
// bir nehir aynı anda iki province'i ayıran çizgi olabilir (province üreteci
// v2 nehir geçişini pahalı sayar) ve çizimde hücre kenarıyla birebir çakışır.
//
// Yöntem: hex köşe grafında "öncelikli taşma" (priority-flood). Denize değen
// köşelerden başlanır, en alçak sınır köşesi açılır; her köşenin akış yönü
// onu ilk açan komşudur. Çukurlar kendiliğinden doldurulmuş sayılır, her kara
// köşesi denize varır. Yağış = köşenin üç karesinin nemi; birikim akış
// ağacında aşağı toplanır. Birikimi eşiği aşan kenar nehirdir.
//
// RNG ÇEKMEZ, araziye DOKUNMAZ: aynı tohum aynı nehri verir, nehir eklemek
// iklim/kültür/ülke akışını kaydırmaz. Yalnız `tile.river`, `tile.riverMask`
// ve `world.rivers` yazar.
//
// Katman notu: world katmanıdır, DOM'a dokunmaz.

import { DIRS } from '../core/hex.js';

/**
 * Köşe adlandırma (render/borderMesh.js ile AYNI şema): her köşe tek bir
 * hexin üst (0) ya da alt (1) köşesi sayılır. [komşu yönü (-1 = kendisi), tip]
 */
const CORNER_OWNER = [[5, 1], [1, 0], [-1, 1], [2, 0], [4, 1], [-1, 0]];

/**
 * Nehir sayılan kara köşesi payı. Eşik dünyanın kendi birikim dağılımından
 * seçilir: kurak ya da küçük dünyada da nehir olur, ıslak dünyada taşmaz.
 */
const RIVER_SHARE = 0.055;
/** Bu kadar kenardan kısa nehir sistemi atılır: kıyıda bir kenarlık çizik nehir değil. */
const MIN_SYSTEM_EDGES = 5;
/** Donmuş arazide (buz sahanlığı) yağış akmaz. */
const FROZEN_TEMPERATURE = 0.12;

/** Küçük ikili yığın (anahtar, köşe); eşitlikte küçük köşe: deterministik. */
class CornerHeap {
  constructor() {
    this.keys = [];
    this.ids = [];
  }
  get size() { return this.ids.length; }
  less(i, j) {
    return this.keys[i] < this.keys[j] || (this.keys[i] === this.keys[j] && this.ids[i] < this.ids[j]);
  }
  swap(i, j) {
    [this.keys[i], this.keys[j]] = [this.keys[j], this.keys[i]];
    [this.ids[i], this.ids[j]] = [this.ids[j], this.ids[i]];
  }
  push(key, id) {
    this.keys.push(key);
    this.ids.push(id);
    let i = this.ids.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(out) {
    out[0] = this.keys[0];
    out[1] = this.ids[0];
    const lastK = this.keys.pop();
    const lastI = this.ids.pop();
    if (this.ids.length) {
      this.keys[0] = lastK;
      this.ids[0] = lastI;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.ids.length && this.less(l, m)) m = l;
        if (r < this.ids.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
  }
}

/**
 * Nehirleri üretir. markCoasts'tan SONRA çağrılır (kumsal kıyısı da kara).
 * `world.rivers`: { edges: [{ a, b, dir, flow }], systems, threshold }
 *   a, b: kenarın iki kare indeksi (a'dan b'ye yön `dir`), flow: 0..1 göreli.
 * `tile.riverMask`: altı kenar bayrağı (bit d = DIRS[d] yönündeki kenar).
 */
export function generateRivers(world) {
  const { cols, rows, tiles } = world;
  const n = cols * rows;
  const numCorners = (rows + 2) * cols * 2;
  const cornerOf = (tile, k) => {
    let q = tile.q;
    let r = tile.r;
    const [d, type] = CORNER_OWNER[k];
    if (d >= 0) { q += DIRS[d][0]; r += DIRS[d][1]; }
    const col = q + ((r - (r & 1)) >> 1);
    const wc = ((col % cols) + cols) % cols;
    return ((r + 1) * cols + wc) * 2 + type;
  };

  // Köşe -> kareler (en çok 3) ve köşe -> komşu köşeler (en çok 3).
  const cTiles = new Int32Array(numCorners * 3).fill(-1);
  const cTileN = new Uint8Array(numCorners);
  const cNbr = new Int32Array(numCorners * 3).fill(-1);
  const cNbrN = new Uint8Array(numCorners);
  const addTile = (c, t) => {
    for (let i = 0; i < cTileN[c]; i++) if (cTiles[c * 3 + i] === t) return;
    cTiles[c * 3 + cTileN[c]++] = t;
  };
  const addNbr = (c, o) => {
    for (let i = 0; i < cNbrN[c]; i++) if (cNbr[c * 3 + i] === o) return;
    cNbr[c * 3 + cNbrN[c]++] = o;
  };
  const tileCorners = new Int32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    for (let k = 0; k < 6; k++) {
      const c = cornerOf(t, k);
      tileCorners[i * 6 + k] = c;
      addTile(c, i);
    }
    for (let k = 0; k < 6; k++) {
      const a = tileCorners[i * 6 + k];
      const b = tileCorners[i * 6 + ((k + 1) % 6)];
      addNbr(a, b);
      addNbr(b, a);
    }
  }

  // Köşe sınıfı ve yüksekliği. Kara köşesi: üç karesi de kara. Ağız: denize
  // değen köşe. Harita kenarındaki eksik köşe (iki kareli) akışa girmez.
  const elev = new Float64Array(numCorners);
  const rain = new Float64Array(numCorners);
  const kind = new Uint8Array(numCorners); // 0 yok, 1 kara, 2 ağız
  for (let c = 0; c < numCorners; c++) {
    const m = cTileN[c];
    if (m < 3) continue;
    let e = 0;
    let wet = 0;
    let water = false;
    for (let i = 0; i < 3; i++) {
      const t = tiles[cTiles[c * 3 + i]];
      e += t.elevation;
      if (t.terrain.water) water = true;
      else if (t.temperature > FROZEN_TEMPERATURE) wet += t.moisture;
    }
    elev[c] = e / 3;
    rain[c] = wet / 3;
    kind[c] = water ? 2 : 1;
  }

  // Öncelikli taşma: denizden içeri, doldurulmuş yüksekliğe göre.
  const down = new Int32Array(numCorners).fill(-1);
  const seen = new Uint8Array(numCorners);
  const order = [];
  const heap = new CornerHeap();
  for (let c = 0; c < numCorners; c++) {
    if (kind[c] !== 2) continue;
    seen[c] = 1;
    heap.push(elev[c], c);
  }
  const top = [0, 0];
  while (heap.size) {
    heap.pop(top);
    const key = top[0];
    const c = top[1];
    for (let i = 0; i < cNbrN[c]; i++) {
      const o = cNbr[c * 3 + i];
      if (seen[o] || kind[o] !== 1) continue;
      seen[o] = 1;
      down[o] = c;
      order.push(o);
      heap.push(Math.max(key, elev[o]), o);
    }
  }

  // Birikim: akış ağacında yukarıdan aşağı (açılış sırasının tersi).
  const acc = Float64Array.from(rain);
  for (let i = order.length - 1; i >= 0; i--) {
    const c = order[i];
    acc[down[c]] += acc[c];
  }

  // Eşik: kara köşelerinin birikim dağılımının üst RIVER_SHARE dilimi.
  const landAcc = order.map((c) => acc[c]).sort((a, b) => a - b);
  const threshold = landAcc.length
    ? landAcc[Math.min(landAcc.length - 1, Math.floor(landAcc.length * (1 - RIVER_SHARE)))]
    : Infinity;

  // Ağız (sistem kökü) başına kenar sayısı: kısa çizikler atılır.
  const mouthOf = new Int32Array(numCorners).fill(-1);
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    const d = down[c];
    mouthOf[c] = kind[d] === 2 ? d : mouthOf[d];
  }
  const systemEdges = new Map();
  for (const c of order) {
    if (acc[c] < threshold) continue;
    systemEdges.set(mouthOf[c], (systemEdges.get(mouthOf[c]) ?? 0) + 1);
  }

  const nbr = (i, d) => world.get(tiles[i].q + DIRS[d][0], tiles[i].r + DIRS[d][1]);
  const indexOf = (t) => t.row * cols + t.col;
  for (const t of tiles) {
    t.river = false;
    t.riverMask = 0;
  }
  const edges = [];
  let maxAcc = 0;
  for (const c of order) if (acc[c] >= threshold && acc[c] > maxAcc) maxAcc = acc[c];
  for (const c of order) {
    if (acc[c] < threshold || (systemEdges.get(mouthOf[c]) ?? 0) < MIN_SYSTEM_EDGES) continue;
    const p = down[c];
    // Kenarın iki karesi: iki köşenin ortak kareleri.
    let a = -1;
    let b = -1;
    for (let i = 0; i < 3; i++) {
      const t = cTiles[c * 3 + i];
      for (let j = 0; j < 3; j++) {
        if (cTiles[p * 3 + j] !== t) continue;
        if (a < 0) a = t;
        else b = t;
      }
    }
    if (a < 0 || b < 0) continue;
    let dir = -1;
    for (let d = 0; d < 6; d++) {
      const nb = nbr(a, d);
      if (nb && indexOf(nb) === b) { dir = d; break; }
    }
    if (dir < 0) continue;
    // Akış gücü kök ölçekli: ana kol ile kaynak arasındaki fark çizimde
    // okunsun ama kaynak görünmez kalmasın.
    const flow = Math.sqrt((acc[c] - threshold) / Math.max(1e-9, maxAcc - threshold));
    edges.push({ a, b, dir, flow });
    tiles[a].riverMask |= 1 << dir;
    tiles[b].riverMask |= 1 << ((dir + 3) % 6);
    tiles[a].river = true;
    tiles[b].river = true;
  }
  let systems = 0;
  for (const count of systemEdges.values()) if (count >= MIN_SYSTEM_EDGES) systems++;
  world.rivers = { edges, systems, threshold };
  return world.rivers;
}

/** Kenar başına göreli akış (0..1), kare indeksi*6 + yön; nehir değilse 0. */
export function riverFlowTable(world) {
  if (world.rivers?.flowTable) return world.rivers.flowTable;
  const table = new Float32Array(world.cols * world.rows * 6);
  for (const e of world.rivers?.edges ?? []) {
    const v = Math.max(0.05, e.flow);
    table[e.a * 6 + e.dir] = v;
    const t = world.tiles[e.a];
    const nb = world.get(t.q + DIRS[e.dir][0], t.r + DIRS[e.dir][1]);
    if (nb) table[(nb.row * world.cols + nb.col) * 6 + ((e.dir + 3) % 6)] = v;
  }
  if (world.rivers) world.rivers.flowTable = table;
  return table;
}
