// HAREKET — ticaret yollarında gemiler, kalkınmış state'ler arasında trenler.
//
// Yalnız ekrandır: dünyayı okur, hiçbir şey yazmaz, oyunun zarını tüketmez.
// Rotalar dilim dilim kurulur (kare bütçesi): tek deniz rotası birkaç ms
// sürebilir, kırk rotayı bir karede ödemek görünür takılma olurdu.
//
// Katman notu: DOM'a dokunmaz, Node'da sınanabilir.

import { SQRT3 } from '../../core/hex.js';
import { HEX_SIZE } from '../../world/worldgen.js';
import { neighborTable } from '../borderMesh.js';

const HEX_STEP = SQRT3 * HEX_SIZE;

/** Ekrandaki azami gemi: yoğun ticarette deniz otoyola dönmesin. */
const MAX_SHIPS = 54;
const MAX_TRAINS = 70;
/** Bu kalkınmadan sonra province hatta bağlanır: ağ, ülke kalkındıkça gözle görülür büyür. */
export const RAIL_DEVELOPMENT = 3;
/** Her ülkenin en gelişmiş bu kadar province'i eşiğe bakmadan hatlıdır: 1900'de raysız devlet yoktu. */
const RAIL_TRUNK = 5;
/** Hat başına en uzak komşu (hex). */
const RAIL_REACH = 10;

/** Yerel, oyundan bağımsız hash: 0..1. */
export function hash01(a, b = 0, c = 0) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b) ^ Math.imul(c | 0, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

/** Tek A* arama tezgâhı: diziler yeniden kullanılır, kare başına çöp yok. */
class PathDesk {
  constructor(world) {
    const n = world.cols * world.rows;
    this.world = world;
    this.nb = neighborTable(world);
    this.g = new Float32Array(n);
    this.prev = new Int32Array(n);
    this.stamp = new Uint32Array(n);
    this.closed = new Uint32Array(n);
    this.round = 0;
    // İkili yığın tip dizilerinde: arama başına binlerce küçük dizi ayrılmasın.
    this.heapF = new Float32Array(n * 6);
    this.heapI = new Int32Array(n * 6);
    this.period = world.wrapWidth || 0;
  }

  distance(a, b) {
    const t = this.world.tiles;
    let dx = Math.abs(t[a].x - t[b].x);
    if (this.period) dx = Math.min(dx, this.period - dx);
    return Math.hypot(dx, t[a].y - t[b].y) / HEX_STEP;
  }

  /** En ucuz yol (kare indeksleri); cost(i) < 0 geçilmez. Bulunamazsa null. */
  search(from, to, cost, limit = 7000) {
    const { nb, g, prev, stamp, closed, heapF, heapI } = this;
    const round = ++this.round;
    let size = 0;
    const push = (f, i) => {
      let k = size++;
      while (k > 0) {
        const up = (k - 1) >> 1;
        if (heapF[up] <= f) break;
        heapF[k] = heapF[up];
        heapI[k] = heapI[up];
        k = up;
      }
      heapF[k] = f;
      heapI[k] = i;
    };
    const pop = () => {
      const top = heapI[0];
      size--;
      const f = heapF[size];
      const i = heapI[size];
      let k = 0;
      for (;;) {
        let c = k * 2 + 1;
        if (c >= size) break;
        if (c + 1 < size && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= f) break;
        heapF[k] = heapF[c];
        heapI[k] = heapI[c];
        k = c;
      }
      heapF[k] = f;
      heapI[k] = i;
      return top;
    };
    g[from] = 0;
    prev[from] = -1;
    stamp[from] = round;
    // Sezgi hafif abartılı: rota görsel, en kısası şart değil; arama çok daralır.
    push(this.distance(from, to) * 1.25, from);
    let visits = 0;
    while (size && visits++ < limit) {
      const i = pop();
      if (closed[i] === round) continue;
      closed[i] = round;
      if (i === to) {
        const path = [];
        for (let k = to; k >= 0; k = prev[k]) path.push(k);
        return path.reverse();
      }
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j < 0 || closed[j] === round) continue;
        const c = j === to ? 1 : cost(j);
        if (c < 0) continue;
        const next = g[i] + c;
        if (stamp[j] !== round || next < g[j]) {
          stamp[j] = round;
          g[j] = next;
          prev[j] = i;
          if (size < heapF.length) push(next + this.distance(j, to) * 1.25, j);
        }
      }
    }
    return null;
  }
}

/** Kare yolu → sarmalsız, yumuşatılmış çizgi ve yay boyu tablosu. */
export function makeRoute(world, indices) {
  const P = world.wrapWidth || 0;
  let xs = [];
  let ys = [];
  let last = null;
  for (const i of indices) {
    const t = world.tiles[i];
    let x = t.x;
    if (last !== null && P) x += P * Math.round((last - x) / P);
    xs.push(x);
    ys.push(t.y);
    last = x;
  }
  // Hex merkezinden geçen yol testere gibi durur: iki tur köşe kesme.
  for (let pass = 0; pass < 2 && xs.length > 2; pass++) {
    const nx = [xs[0]];
    const ny = [ys[0]];
    for (let k = 0; k < xs.length - 1; k++) {
      nx.push(xs[k] * 0.75 + xs[k + 1] * 0.25, xs[k] * 0.25 + xs[k + 1] * 0.75);
      ny.push(ys[k] * 0.75 + ys[k + 1] * 0.25, ys[k] * 0.25 + ys[k + 1] * 0.75);
    }
    nx.push(xs[xs.length - 1]);
    ny.push(ys[ys.length - 1]);
    xs = nx;
    ys = ny;
  }
  const n = xs.length;
  const pts = new Float32Array(n * 2);
  const len = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    pts[k * 2] = xs[k];
    pts[k * 2 + 1] = ys[k];
    if (k) len[k] = len[k - 1] + Math.hypot(xs[k] - xs[k - 1], ys[k] - ys[k - 1]);
  }
  return { pts, len, total: len[n - 1] };
}

/** Yay boyunda konum ve yön; `out` yeniden kullanılır. */
export function sampleRoute(route, s, out) {
  const { pts, len, total } = route;
  const at = Math.max(0, Math.min(total, s));
  let lo = 0;
  let hi = len.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (len[mid] <= at) lo = mid;
    else hi = mid;
  }
  const span = Math.max(1e-4, len[hi] - len[lo]);
  const t = (at - len[lo]) / span;
  const dx = pts[hi * 2] - pts[lo * 2];
  const dy = pts[hi * 2 + 1] - pts[lo * 2 + 1];
  out.x = pts[lo * 2] + dx * t;
  out.y = pts[lo * 2 + 1] + dy * t;
  out.dx = dx / span;
  out.dy = dy / span;
  return out;
}

/** Git-gel: 0..1 faz → yay boyu ve yön işareti. */
export function shuttle(phase, total, out) {
  const f = phase - Math.floor(phase);
  out.forward = f < 0.5;
  out.s = (out.forward ? f * 2 : (1 - f) * 2) * total;
  return out;
}

const tileIndex = (world, t) => t.row * world.cols + t.col;

/**
 * Su kütlesi etiketleri: göldeki liman okyanustaki limana gidemez. Etiketsiz
 * arama bütün denizi gezip kareyi taşırıyordu (ölçüldü: 340 ms).
 */
function waterBodies(world) {
  const nb = neighborTable(world);
  const n = world.cols * world.rows;
  const label = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (label[i] >= 0 || !world.tiles[i].terrain.water) continue;
    let top = 0;
    stack[top++] = i;
    label[i] = next;
    while (top) {
      const at = stack[--top];
      for (let d = 0; d < 6; d++) {
        const j = nb[at * 6 + d];
        if (j >= 0 && label[j] < 0 && world.tiles[j].terrain.water) {
          label[j] = next;
          stack[top++] = j;
        }
      }
    }
    next++;
  }
  return label;
}

/** Ulus başına limanlar: suya komşu şehirler, kalkınmışı önde. */
function harbourTable(world, bodies) {
  const nb = neighborTable(world);
  const table = new Map();
  for (const city of world.cities ?? []) {
    const i = tileIndex(world, city.tile);
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j < 0 || bodies[j] < 0) continue;
      if (!table.has(city.nationId)) table.set(city.nationId, []);
      table.get(city.nationId).push({
        tile: j, body: bodies[j],
        size: world.provinces?.[city.tile.provinceId]?.econ?.development ?? 1,
      });
      break;
    }
  }
  for (const list of table.values()) list.sort((a, b) => b.size - a.size || a.tile - b.tile);
  return table;
}

/** İki ulusun aynı denizdeki en yakın büyük liman çifti; yoksa null. */
function harbourPair(desk, table, a, b) {
  const from = table.get(a)?.slice(0, 4) ?? [];
  const to = table.get(b)?.slice(0, 4) ?? [];
  let best = null;
  let bestD = Infinity;
  for (const x of from) {
    for (const y of to) {
      if (x.body !== y.body || x.tile === y.tile) continue;
      const d = desk.distance(x.tile, y.tile);
      if (d < bestD) {
        bestD = d;
        best = [x.tile, y.tile];
      }
    }
  }
  return best;
}

function seaCost(world) {
  const tiles = world.tiles;
  return (i) => {
    const t = tiles[i].terrain;
    if (!t.water) return -1;
    // Sığlık pahalı: gemi kıyıya yapışık değil açıktan gider.
    return t.id === 'COAST' ? 2.2 : 1;
  };
}

function landCost(world, owner) {
  const tiles = world.tiles;
  return (i) => {
    const tile = tiles[i];
    const t = tile.terrain;
    if (t.water || t.id === 'ICE' || tile.owner !== owner) return -1;
    if (t.id === 'MOUNTAIN' || t.id === 'SNOW_PEAK') return 7;
    if (t.id === 'HILLS') return 2.4;
    if (t.id === 'FOREST' || t.id === 'JUNGLE') return 1.5;
    return 1;
  };
}

/** Ülke başına hatlı province'ler: başkent, ana hat ve kalkınma eşiğini geçenler. */
function railNodes(world) {
  const byOwner = new Map();
  for (const p of world.provinces ?? []) {
    if (!p.center || p.owner < 0) continue;
    if (!byOwner.has(p.owner)) byOwner.set(p.owner, []);
    byOwner.get(p.owner).push(p);
  }
  const dev = (p) => p.econ?.development ?? 0;
  for (const [owner, list] of byOwner) {
    const capital = world.nations[owner]?.capital?.provinceId;
    list.sort((x, y) => dev(y) - dev(x) || x.id - y.id);
    byOwner.set(owner, list.filter((p, i) => i < RAIL_TRUNK || dev(p) >= RAIL_DEVELOPMENT || p.id === capital));
  }
  return byOwner;
}

/** Hat planı: düğüm başına en yakın iki komşu; menzilde komşusu olmayan en yakınına bağlanır. */
function railPlan(world) {
  const P = world.wrapWidth || 0;
  const reach = RAIL_REACH * HEX_STEP;
  const pairs = new Map();
  for (const nodes of railNodes(world).values()) {
    for (const a of nodes) {
      const near = [];
      for (const b of nodes) {
        if (a === b) continue;
        let dx = Math.abs(a.center.x - b.center.x);
        if (P) dx = Math.min(dx, P - dx);
        near.push([Math.hypot(dx, a.center.y - b.center.y), b]);
      }
      near.sort((x, y) => x[0] - y[0] || x[1].id - y[1].id);
      const inReach = near.filter(([d]) => d <= reach).slice(0, 2);
      for (const [, b] of inReach.length ? inReach : near.slice(0, 1)) {
        const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
        if (!pairs.has(key)) pairs.set(key, a.id < b.id ? [a, b] : [b, a]);
      }
    }
  }
  return [...pairs.values()];
}

/** Hatların imzası: düğümler ve sahipleri değişmedikçe ağ yeniden kurulmaz. */
function railKey(world) {
  let h = 0;
  for (const nodes of railNodes(world).values()) {
    for (const p of nodes) h = (Math.imul(h, 31) + p.id * 7 + p.owner + 11) | 0;
  }
  return h;
}

export class LivingMotion {
  constructor() {
    this.world = null;
    this.desk = null;
    this.ships = [];
    this.rails = [];
    this.trains = [];
    this.railVersion = 0;
    this.job = null;
    this.laneTurn = -1e9;
    this.railTurn = -1e9;
    this.railSig = null;
    this.routes = new Map();
  }

  /** Kare başına: sırası gelen işi başlatır ve bütçe kadar ilerletir. */
  update(world, turn, busy, wantShips, wantTrains, budgetMs = 1.5) {
    if (this.world !== world) {
      this.world = world;
      this.desk = new PathDesk(world);
      this.ships = [];
      this.rails = [];
      this.trains = [];
      this.railVersion++;
      this.job = null;
      this.laneTurn = -1e9;
      this.railTurn = -1e9;
      this.railSig = null;
      this.routes = new Map();
      this.bodies = null;
    }
    if (!this.job && !busy) {
      // İlk haftada ticaret akışı henüz yok: gemisiz kaldıkça her hafta yeniden bakılır.
      if (wantShips && (turn - this.laneTurn >= 6 || (!this.ships.length && turn !== this.laneTurn))) {
        this.laneTurn = turn;
        this.job = this.shipJob(world);
      } else if (wantTrains && turn - this.railTurn >= 13) {
        this.railTurn = turn;
        const sig = railKey(world);
        if (sig !== this.railSig) {
          this.railSig = sig;
          this.job = this.railJob(world);
        }
      }
    }
    if (!this.job) return;
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (this.job.next().done) {
        this.job = null;
        return;
      }
    }
  }

  /**
   * En değerli deniz ticareti çiftleri, trade.clearTrade'in haftalık akışından.
   * seaLaneView çağrılmaz: o, savaş kesintilerini hesaplayıp donanma durumuna
   * önbellek yazar ve büyük dünyada tek karede 200 ms sürer. Burada akış yalnız
   * okunur; anahtar çözümü seaLanes.pairKey ile aynıdır.
   */
  * shipJob(world) {
    const flows = world.navyState?.flows;
    if (!flows?.size) {
      this.ships = [];
      return;
    }
    const n = world.nations.length;
    const lanes = [];
    for (const [key, flow] of flows) {
      if (flow.value > 0) lanes.push({ a: Math.floor(key / n), b: key % n, value: flow.value });
    }
    lanes.sort((x, y) => y.value - x.value || x.a - y.a || x.b - y.b);
    yield;
    this.bodies ??= waterBodies(world);
    yield;
    const harbours = harbourTable(world, this.bodies);
    const cost = seaCost(world);
    const top = lanes[0]?.value ?? 1;
    const ships = [];
    let used = 0;
    for (const lane of lanes) {
      if (used >= 34 || ships.length >= MAX_SHIPS) break;
      if (!world.nations[lane.a]?.alive || !world.nations[lane.b]?.alive) continue;
      const key = lane.a < lane.b ? `${lane.a}:${lane.b}` : `${lane.b}:${lane.a}`;
      let route = this.routes.get(key);
      if (route === undefined) {
        const pair = harbourPair(this.desk, harbours, lane.a, lane.b);
        const path = pair ? this.desk.search(pair[0], pair[1], cost) : null;
        route = path && path.length > 6 ? makeRoute(world, path) : null;
        this.routes.set(key, route);
        yield;
      }
      if (!route) continue;
      used++;
      const count = 1 + Math.min(2, Math.floor((lane.value / top) * 3));
      for (let k = 0; k < count && ships.length < MAX_SHIPS; k++) {
        ships.push({
          route,
          phase: hash01(lane.a, lane.b, k),
          variant: hash01(lane.b, lane.a, k) < 0.5 ? 0 : 1,
          speed: 11 + hash01(k, lane.a, lane.b) * 5,
        });
      }
    }
    this.ships = ships;
  }

  /** Demiryolu ağı ve üzerinde mekik dokuyan trenler. */
  * railJob(world) {
    const plan = railPlan(world);
    yield;
    const rails = [];
    const links = new Map();
    const link = (id, edge, flip) => {
      if (!links.has(id)) links.set(id, []);
      links.get(id).push({ edge, flip });
    };
    for (const [a, b] of plan) {
      const from = tileIndex(world, a.center);
      const to = tileIndex(world, b.center);
      const path = this.desk.search(from, to, landCost(world, a.owner), 1400);
      if (path && path.length > 2) {
        const edge = { a: a.id, b: b.id, path, route: makeRoute(world, path) };
        rails.push(edge);
        link(a.id, edge, false);
        link(b.id, edge, true);
      }
      yield;
    }
    // Trenler: her ağ parçasında kullanılmamış hatlardan yürüyerek hat çıkar.
    const used = new Set();
    const trains = [];
    // Karışık sıra: bütçe düşük kimlikli province'lerde, yani tek bölgede tükenmesin.
    const starts = [...links.keys()].sort((x, y) => hash01(x, 5, 9) - hash01(y, 5, 9) || x - y);
    for (const start of starts) {
      for (const first of links.get(start)) {
        if (used.has(first.edge) || trains.length >= MAX_TRAINS) continue;
        const indices = [];
        let node = start;
        let step = first;
        for (let hops = 0; step && hops < 6; hops++) {
          used.add(step.edge);
          const seq = step.flip ? [...step.edge.path].reverse() : step.edge.path;
          indices.push(...(indices.length ? seq.slice(1) : seq));
          node = step.flip ? step.edge.a : step.edge.b;
          step = (links.get(node) ?? []).find((n) => !used.has(n.edge));
        }
        trains.push({
          route: makeRoute(world, indices),
          phase: hash01(start, trains.length, 7),
          speed: 15 + hash01(trains.length, start, 3) * 7,
          wagons: 2 + Math.floor(hash01(start, 3, trains.length) * 3),
        });
      }
      yield;
    }
    this.rails = rails;
    this.trains = trains;
    this.railVersion++;
  }
}
