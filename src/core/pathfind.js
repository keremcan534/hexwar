// Hex ızgarada yol bulma. Arazi maliyetleri terrain.moveCost'tan gelir.
// DOM'a dokunmaz; Node ile de test edilebilir.

import { hexDistance } from './hex.js';

/** Küçük ikili yığın. Dijkstra/A* kuyruğu. */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/** Varsayılan geçilebilirlik: kara + boş kare. Başlangıç karesi her zaman geçerli. */
function defaultCanEnter(tile) {
  return tile.terrain.passable && !tile.unit;
}

/** Varsayılan maliyet: kara hareket maliyeti. Deniz için costOf geçilmeli. */
function defaultCostOf(tile) {
  return tile.terrain.moveCost;
}

/**
 * Verilen hareket bütçesiyle ulaşılabilen tüm kareler.
 * @returns {{ costs: Map<object, number>, prev: Map<object, object> }}
 */
export function reachable(world, start, budget, {
  canEnter = defaultCanEnter,
  costOf = defaultCostOf,
} = {}) {
  const costs = new Map([[start, 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push({ tile: start, f: 0 });

  while (heap.size) {
    const { tile, f } = heap.pop();
    if (f > (costs.get(tile) ?? Infinity)) continue; // eskimiş giriş
    for (const n of world.neighbors(tile)) {
      if (!canEnter(n, tile)) continue;
      const next = f + costOf(n, tile);
      if (next > budget) continue;
      if (next >= (costs.get(n) ?? Infinity)) continue;
      costs.set(n, next);
      prev.set(n, tile);
      heap.push({ tile: n, f: next });
    }
  }
  return { costs, prev };
}

/** reachable() sonucundan hedefe giden kare dizisi (başlangıç hariç). */
export function tracePath(prev, target) {
  const path = [];
  let cur = target;
  while (cur && prev.has(cur)) {
    path.push(cur);
    cur = prev.get(cur);
  }
  return path.reverse();
}

/**
 * Bütçesiz A*: uzak hedefe en ucuz yol. Bulunamazsa null.
 * Sezgisel = hex mesafesi (en ucuz adım maliyeti 1 olduğu için kabul edilebilir).
 */
export function findPath(world, start, goal, {
  canEnter = defaultCanEnter,
  costOf = defaultCostOf,
  maxNodes = 8000,
} = {}) {
  if (start === goal) return [];
  const g = new Map([[start, 0]]);
  const prev = new Map();
  const heap = new MinHeap();
  heap.push({ tile: start, f: 0 });
  let expanded = 0;

  while (heap.size) {
    const { tile } = heap.pop();
    if (tile === goal) return tracePath(prev, goal);
    if (++expanded > maxNodes) break;
    const cost = g.get(tile);
    for (const n of world.neighbors(tile)) {
      if (n !== goal && !canEnter(n, tile)) continue;
      const next = cost + costOf(n, tile);
      if (!Number.isFinite(next)) continue;
      if (next >= (g.get(n) ?? Infinity)) continue;
      g.set(n, next);
      prev.set(n, tile);
      heap.push({ tile: n, f: next + hexDistance(n.q, n.r, goal.q, goal.r) });
    }
  }
  return null;
}
