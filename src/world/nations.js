// Rastgele ülkeler: tohum seçimi + ağırlıklı yayılma (Dijkstra) ile organik sınırlar.

import { makeRng } from '../core/rng.js';
import { hexDistance } from '../core/hex.js';
import { makeFlag } from './flags.js';

const SYL_START = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gor', 'Hal', 'Ir', 'Kaz', 'Lor', 'Mar', 'Nor', 'Oss', 'Pra', 'Quen', 'Rav', 'Sar', 'Tur', 'Ul', 'Vas', 'Wyn', 'Yar', 'Zen'];
const SYL_MID = ['a', 'e', 'i', 'o', 'an', 'en', 'ir', 'or', 'al', 'ath', 'esh', 'ov', 'ur', 'yl'];
const SYL_END = ['ya', 'ia', 'land', 'mark', 'stan', 'grad', 'heim', 'dor', 'ria', 'nia', 'gard', 'vik', 'esh', 'ov'];
const TITLES = ['Krallığı', 'İmparatorluğu', 'Cumhuriyeti', 'Prensliği', 'Dükalığı', 'Konfederasyonu', 'Hanlığı', 'Emirliği'];

function makeName(rng, used) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let base = rng.pick(SYL_START);
    if (rng.chance(0.55)) base += rng.pick(SYL_MID);
    base += rng.pick(SYL_END);
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
  }
  return `Ulus-${used.size + 1}`;
}

/** Altın oran açısıyla dağıtılan ton: 20+ ülkede bile renkler karışmaz. */
function makeColor(index, rng) {
  const hue = (index * 137.508 + rng.range(0, 40)) % 360;
  const sat = 62 + ((index * 17) % 20);
  const light = 48 + ((index * 11) % 16);
  return { color: `hsl(${hue.toFixed(0)} ${sat}% ${light}%)`, hue, sat, light };
}

/** Küçük ikili yığın (min-heap). Yayılma kuyruğu için. */
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
 * Dünyaya ülkeler yerleştirir. world.tiles[].owner alanını doldurur.
 * @returns {Array} nations
 */
export function generateNations(world, options = {}) {
  const {
    seed = world.seed + '-nations',
    count = null,
    /** Ülke başına hedef kare sayısı; boyut çeşitliliği buradan gelir. */
    minShare = 0.5,
    maxShare = 1.8,
  } = options;

  const rng = makeRng(seed);
  const land = world.tiles.filter((t) => !t.terrain.water && t.terrain.passable);
  world.forEach((t) => { t.owner = -1; });

  if (land.length === 0) {
    world.nations = [];
    return [];
  }

  const nationCount = count ?? Math.max(4, Math.min(22, Math.round(land.length / 95)));
  const seeds = pickSeeds(world, land, nationCount, rng);

  const usedNames = new Set();
  const nations = seeds.map((tile, i) => {
    const name = makeName(rng, usedNames);
    const avgShare = land.length / seeds.length;
    const palette = makeColor(i, rng);
    return {
      id: i,
      name,
      fullName: `${name} ${rng.pick(TITLES)}`,
      color: palette.color,
      flag: makeFlag(rng, palette),
      capital: tile,
      tiles: 0,
      population: 0,
      coastal: false,
      // Yayılma hızı: küçük değer = daha hızlı büyür = daha geniş ülke.
      aggression: rng.range(0.7, 1.4),
      budget: Math.round(avgShare * rng.range(minShare, maxShare)),
    };
  });

  growNations(world, nations, rng);
  computeStats(world, nations);

  world.nations = nations;
  return nations;
}

/** Tohumlar: birbirinden uzak, mümkünse verimli ve büyük kıtalarda. */
function pickSeeds(world, land, count, rng) {
  const candidates = rng.shuffle(land.slice());
  const chosen = [];
  // Haritanın kısa kenarına göre ölçekli minimum mesafe; sıkışırsa gevşetilir.
  let minDist = Math.max(4, Math.floor(Math.min(world.cols, world.rows) / Math.sqrt(count)));

  while (chosen.length < count && minDist > 1) {
    for (const tile of candidates) {
      if (chosen.length >= count) break;
      if (chosen.includes(tile)) continue;
      const continentSize = world.continentSizes?.[tile.continent] ?? 0;
      if (continentSize < 12 && chosen.length < count - 1) continue; // minik adalara başkent kurma
      const ok = chosen.every((c) => hexDistance(c.q, c.r, tile.q, tile.r) >= minDist);
      if (ok) chosen.push(tile);
    }
    minDist = Math.floor(minDist * 0.7);
  }

  // Hâlâ eksikse kalan karadan doldur.
  for (const tile of candidates) {
    if (chosen.length >= count) break;
    if (!chosen.includes(tile)) chosen.push(tile);
  }
  return chosen.slice(0, count);
}

function growNations(world, nations, rng) {
  const heap = new MinHeap();
  const best = new Map(); // tile -> ulaşılan en düşük maliyet

  for (const nation of nations) {
    nation.capital.owner = nation.id;
    nation.tiles = 1;
    best.set(nation.capital, 0);
    push(nation.capital, nation, 0);
  }

  function push(tile, nation, cost) {
    for (const n of world.neighbors(tile)) {
      if (n.terrain.water || !n.terrain.passable) continue;
      // Arazi maliyeti + rastgele jitter -> düz değil, tırtıklı sınırlar.
      const step = (n.terrain.moveCost + rng.range(0, 2.2)) * nation.aggression;
      const total = cost + step;
      const known = best.get(n);
      if (known !== undefined && known <= total) continue;
      best.set(n, total);
      heap.push({ tile: n, nation, cost: total });
    }
  }

  while (heap.size) {
    const { tile, nation, cost } = heap.pop();
    if (tile.owner !== -1) continue;
    if (nation.tiles >= nation.budget) continue;
    if (best.get(tile) !== cost) continue; // eskimiş giriş
    tile.owner = nation.id;
    nation.tiles++;
    push(tile, nation, cost);
  }
}

function computeStats(world, nations) {
  for (const n of nations) {
    n.tiles = 0;
    n.population = 0;
    n.coastal = false;
  }
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    const n = nations[tile.owner];
    n.tiles++;
    n.population += Math.round(tile.terrain.yields.food * 2200 + tile.moisture * 400);
    if (tile.coastal) n.coastal = true;
  });
  // Başkent nüfusu ayrıca ağırlıklı.
  for (const n of nations) n.population = Math.round(n.population * 1.15);
}
