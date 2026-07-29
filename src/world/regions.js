// Ağırlıklı çok kaynaklı yayılma (Dijkstra). Organik, tırtıklı sınırlı bölgeler
// üretir. Hem ülkeler hem kültürler bunu kullanır: aynı algoritma iki farklı
// ölçekte çalıştırılınca "bu sınır yapay" gerilimi kendiliğinden doğar.

/** Küçük ikili yığın. */
class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].cost <= a[i].cost) break;
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
        if (l < a.length && a[l].cost < a[m].cost) m = l;
        if (r < a.length && a[r].cost < a[m].cost) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * Tohumlardan dışa doğru büyüyen bölgeler.
 * @param {object} world
 * @param {object[]} seeds başlangıç kareleri
 * @param {{
 *   canEnter: (tile: object) => boolean,
 *   stepCost: (tile: object, regionIndex: number) => number,
 *   budget?: (regionIndex: number) => number,
 * }} opts
 * @returns {{ assignment: Map<object, number>, counts: number[] }}
 */
export function growRegions(world, seeds, { canEnter, stepCost, budget = () => Infinity }) {
  const assignment = new Map();
  const counts = new Array(seeds.length).fill(0);
  const best = new Map();
  const heap = new MinHeap();

  const expand = (tile, region, cost) => {
    for (const n of world.neighbors(tile)) {
      if (!canEnter(n)) continue;
      const total = cost + stepCost(n, region);
      const known = best.get(n);
      if (known !== undefined && known <= total) continue;
      best.set(n, total);
      heap.push({ tile: n, region, cost: total });
    }
  };

  seeds.forEach((tile, i) => {
    assignment.set(tile, i);
    counts[i] = 1;
    best.set(tile, 0);
    expand(tile, i, 0);
  });

  while (heap.size) {
    const { tile, region, cost } = heap.pop();
    if (assignment.has(tile)) continue;
    if (counts[region] >= budget(region)) continue;
    if (best.get(tile) !== cost) continue; // eskimiş giriş
    assignment.set(tile, region);
    counts[region]++;
    expand(tile, region, cost);
  }

  return { assignment, counts };
}

/**
 * Birbirinden uzak tohumlar seçer. Sıkışırsa asgari mesafeyi gevşetir;
 * yoksa küçük haritalarda istenen sayıya hiç ulaşılamıyor.
 */
export function pickSeeds(candidates, count, rng, distance, startDistance) {
  const pool = rng.shuffle(candidates.slice());
  const chosen = [];
  let minDist = startDistance;

  while (chosen.length < count && minDist > 1) {
    for (const tile of pool) {
      if (chosen.length >= count) break;
      if (chosen.includes(tile)) continue;
      if (chosen.every((c) => distance(c, tile) >= minDist)) chosen.push(tile);
    }
    minDist = Math.floor(minDist * 0.7);
  }
  for (const tile of pool) {
    if (chosen.length >= count) break;
    if (!chosen.includes(tile)) chosen.push(tile);
  }
  return chosen.slice(0, count);
}
