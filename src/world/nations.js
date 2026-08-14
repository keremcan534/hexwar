// Rastgele ülkeler: tohum seçimi + ağırlıklı yayılma (Dijkstra) ile organik sınırlar.

import { makeRng } from '../core/rng.js';
import { makeFlag } from './flags.js';
import { growRegions, pickSeeds } from './regions.js';

const SYL_START = ['Ar', 'Bel', 'Cor', 'Dra', 'El', 'Fen', 'Gor', 'Hal', 'Ir', 'Kaz', 'Lor', 'Mar', 'Nor', 'Oss', 'Pra', 'Quen', 'Rav', 'Sar', 'Tur', 'Ul', 'Vas', 'Wyn', 'Yar', 'Zen'];
const SYL_MID = ['a', 'e', 'i', 'o', 'an', 'en', 'ir', 'or', 'al', 'ath', 'esh', 'ov', 'ur', 'yl'];
const SYL_END = ['ya', 'ia', 'land', 'mark', 'stan', 'grad', 'heim', 'dor', 'ria', 'nia', 'gard', 'vik', 'esh', 'ov'];
const TITLES = ['Kingdom', 'Empire', 'Republic', 'Principality', 'Duchy', 'Confederation', 'Khanate', 'Emirate'];

// Politik harita paleti. Renkler yalniz genel olarak farkli degil, asagidaki
// komsuluk boyamasinda birbirine siniri olan ulkeler icin ozellikle ayrilir.
const NATION_PALETTE = [
  { hue: 4, sat: 74, light: 52 },
  { hue: 211, sat: 72, light: 55 },
  { hue: 111, sat: 58, light: 47 },
  { hue: 48, sat: 80, light: 56 },
  { hue: 282, sat: 64, light: 59 },
  { hue: 174, sat: 64, light: 44 },
  { hue: 326, sat: 70, light: 58 },
  { hue: 27, sat: 84, light: 55 },
  { hue: 239, sat: 58, light: 66 },
  { hue: 84, sat: 64, light: 49 },
  { hue: 195, sat: 82, light: 46 },
  { hue: 350, sat: 52, light: 68 },
];

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
  return `Nation-${used.size + 1}`;
}

/** Altın oran açısıyla dağıtılan ton: 20+ ülkede bile renkler karışmaz. */
function makeColor(index, rng) {
  const hue = (index * 137.508 + rng.range(0, 40)) % 360;
  const sat = 62 + ((index * 17) % 20);
  const light = 48 + ((index * 11) % 16);
  return { color: `hsl(${hue.toFixed(0)} ${sat}% ${light}%)`, hue, sat, light };
}

function colorDistance(a, b) {
  const hue = Math.min(Math.abs(a.hue - b.hue), 360 - Math.abs(a.hue - b.hue));
  return hue + Math.abs(a.light - b.light) * 2.4 + Math.abs(a.sat - b.sat) * 0.25;
}

/**
 * Ulke kimligi haritadaki konumu bilmeden renk uretemez: altin-oran tonlari
 * genel olarak daginik olsa da iki benzer ton yan yana gelebiliyordu. Sinir
 * grafigini cikarip en cok komsusu olan ulkeden baslayarak, atanmis komsularina
 * en uzak palet rengini seceriz. Ayni renk yalniz siniri olmayanlarda tekrarlar.
 */
function separateNeighborColors(world, nations, rng) {
  const adjacent = nations.map(() => new Set());
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    for (const near of world.neighbors(tile)) {
      if (near.owner < 0 || near.owner === tile.owner) continue;
      adjacent[tile.owner].add(near.owner);
    }
  });

  const assigned = new Array(nations.length).fill(-1);
  const usage = new Array(NATION_PALETTE.length).fill(0);
  const order = nations.map((nation) => nation.id)
    .sort((a, b) => adjacent[b].size - adjacent[a].size || a - b);

  for (const nationId of order) {
    let best = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < NATION_PALETTE.length; i++) {
      let nearest = 240;
      for (const otherId of adjacent[nationId]) {
        const other = assigned[otherId];
        if (other >= 0) nearest = Math.min(
          nearest, colorDistance(NATION_PALETTE[i], NATION_PALETTE[other]),
        );
      }
      // Esitlikte haritanin tamaminin ayni ilk renkle baslamamasi icin daha az
      // kullanilmis renk kazanir; son terim yalniz deterministik bag kiricidir.
      const score = nearest - usage[i] * 8 + ((nationId * 7 + i * 3) % 13) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    assigned[nationId] = best;
    usage[best]++;
  }

  for (const nation of nations) {
    const base = NATION_PALETTE[assigned[nation.id]];
    nation.hue = base.hue;
    nation.sat = base.sat;
    nation.light = base.light;
    nation.color = `hsl(${base.hue} ${base.sat}% ${base.light}%)`;
    nation.flag = makeFlag(rng, base);
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

  // Tavan 30: 200x160 haritada kara ~11k kareye çıkıyor; 22'de dünya birkaç
  // dev imparatorluğa bölünüp savaş çeşitliliği ölüyordu.
  const nationCount = count ?? Math.max(4, Math.min(30, Math.round(land.length / 95)));
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
      // Politik harita kipi ülke rengini arazi parlaklığıyla oynatabilsin.
      hue: palette.hue,
      sat: palette.sat,
      light: palette.light,
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
      budget: Math.round(avgShare * rng.range(minShare, maxShare)),
    };
  });

  growNations(world, nations, rng);
  separateNeighborColors(world, nations, rng);
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
    (a, b) => world.wrapDistance(a.q, a.r, b.q, b.r),
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
