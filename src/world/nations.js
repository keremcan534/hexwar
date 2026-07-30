// Rastgele ülkeler: tohum seçimi + ağırlıklı yayılma (Dijkstra) ile organik sınırlar.

import { makeRng } from '../core/rng.js';
import { hexDistance } from '../core/hex.js';
import { makeFlag } from './flags.js';
import { growRegions, pickSeeds } from './regions.js';

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
  const seeds = pickNationSeeds(world, land, nationCount, rng);

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
      // Kurucu kültür: başkentin halkı. Ülke sınırlarıyla kültür sınırları
      // örtüşmediği için bu, ileride hoşnutsuzluğun ölçütü olacak.
      culture: tile.culture ?? -1,
      tiles: 0,
      population: 0,
      coastal: false,
      // Yayılma hızı: küçük değer = daha hızlı büyür = daha geniş ülke.
      aggression: rng.range(0.7, 1.4),
      // Teknoloji eğilimi: YZ'lerin farklı yollardan büyümesini sağlar.
      focus: rng.pick(['economy', 'military', 'admin']),
      techs: [],
      budget: Math.round(avgShare * rng.range(minShare, maxShare)),
    };
  });

  growNations(world, nations, rng);
  computeStats(world, nations);

  world.nations = nations;
  return nations;
}

/** Tohumlar: birbirinden uzak, minik adalara başkent kurmayan. */
function pickNationSeeds(world, land, count, rng) {
  const mainland = land.filter((t) => (world.continentSizes?.[t.continent] ?? 0) >= 12);
  return pickSeeds(
    mainland.length >= count ? mainland : land,
    count,
    rng,
    (a, b) => hexDistance(a.q, a.r, b.q, b.r),
    Math.max(4, Math.floor(Math.min(world.cols, world.rows) / Math.sqrt(count))),
  );
}

function growNations(world, nations, rng) {
  const { assignment } = growRegions(world, nations.map((n) => n.capital), {
    canEnter: (tile) => !tile.terrain.water && tile.terrain.passable,
    // Arazi maliyeti + rastgele jitter -> düz değil, tırtıklı sınırlar.
    stepCost: (tile, i) => (tile.terrain.moveCost + rng.range(0, 2.2)) * nations[i].aggression,
    budget: (i) => nations[i].budget,
  });
  for (const [tile, id] of assignment) tile.owner = id;
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
