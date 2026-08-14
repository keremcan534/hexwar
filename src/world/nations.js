// Rastgele ülkeler: tohum seçimi + ağırlıklı yayılma (Dijkstra) ile organik sınırlar.

import { makeRng } from '../core/rng.js';
import { makeFlag } from './flags.js';
import { growRegions } from './regions.js';
import { archetypePlan } from './macro.js';

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
  } = options;

  const rng = makeRng(seed);
  world.forEach((t) => { t.owner = -1; });
  for (const province of world.provinces ?? []) {
    province.owner = -1;
    province.coreOf = -1;
  }

  if (!world.provinces?.length) {
    world.nations = [];
    return [];
  }

  // Arketip planı: her ülkenin ROLÜ, bölgesi ve province hedefi şablondan
  // gelir (bkz. macro.archetypePlan + docs/makro-dunya.md). Dünyanın kalanı
  // SAHİPSİZ kalır — sınır boyları ve kolonizasyon alanı bilerek açıktır.
  // `count` (menü kaydıracı) plan listesini kırpar: büyükler önce doğar.
  const plan = archetypePlan(rng);
  const specs = count != null ? plan.slice(0, Math.max(1, count)) : plan;
  const anchors = world.macroAnchors ?? {};
  const graph = {
    neighbors: (province) => province.neighbors.map((i) => world.provinces[i]),
  };
  const anchorTileOf = (zone) => {
    const anchor = anchors[zone];
    if (!anchor) return world.tiles[Math.floor(world.tiles.length / 2)];
    const col = Math.min(world.cols - 1, Math.max(0, Math.floor(anchor.u * world.cols)));
    const row = Math.min(world.rows - 1, Math.max(0, Math.floor(anchor.v * world.rows)));
    return world.tileAt(col, row);
  };
  const distanceToAnchor = (province, anchorTile) => world.wrapDistance(
    province.center.q, province.center.r, anchorTile.q, anchorTile.r,
  );
  const zoneAllowed = (province, spec) => province.zone === spec.zone
    || province.zone === 'acik-deniz';

  // Yerleşim: sırayla, bölge içinde çapaya en yakın uygun kümeden büyüme.
  const usedNames = new Set();
  const nations = [];
  const claimCluster = (province, nationId, core) => {
    province.owner = nationId;
    province.coreOf = core ? nationId : -1;
    for (const idx of province.tileIdx) world.tiles[idx].owner = nationId;
  };
  const growHome = (spec, seedProvince, nationId) => {
    const { assignment } = growRegions(graph, [seedProvince], {
      canEnter: (province) => province.owner === -1 && zoneAllowed(province, spec),
      stepCost: (province) => province.moveCost + rng.range(0, 2.2),
      budget: () => spec.provinces,
    });
    for (const [province] of assignment) claimCluster(province, nationId, true);
  };

  for (const spec of specs) {
    const anchorTile = anchorTileOf(spec.zone);
    const candidates = world.provinces.filter((province) => (
      province.owner === -1
      && province.zone === spec.zone
      && (!spec.coastal || province.coastal)
      && (province.tileIdx.length >= 3 || spec.zone.includes('adalar'))
    ));
    // Bölge doluysa (küçük harita, kırpılmış plan) ülke doğmaz; plan esnektir.
    if (!candidates.length) continue;
    candidates.sort((a, b) => distanceToAnchor(a, anchorTile) - distanceToAnchor(b, anchorTile));
    const seedProvince = candidates[0];
    const id = nations.length;
    const name = makeName(rng, usedNames);
    const palette = makeColor(id, rng);
    const nation = {
      id,
      name,
      fullName: `${name} ${rng.pick(TITLES)}`,
      color: palette.color,
      // Politik harita kipi ülke rengini arazi parlaklığıyla oynatabilsin.
      hue: palette.hue,
      sat: palette.sat,
      light: palette.light,
      flag: makeFlag(rng, palette),
      capital: seedProvince.center,
      culture: seedProvince.culture ?? -1,
      // Kabul edilen kültürler: birincil + (bileşik monarşi gibi) komşu halklar.
      accepted: [],
      archetype: spec.role,
      devTier: spec.dev ?? 0,
      extraCity: Boolean(spec.extraCity),
      tiles: 0,
      provinces: 0,
      population: 0,
      coastal: false,
      aggression: rng.range(0.7, 1.4),
      focus: rng.pick(['economy', 'military', 'admin']),
    };
    nations.push(nation);
    growHome(spec, seedProvince, id);

    // Deniz aşırı koloni: Hindistan-benzeri yarımadanın büyük payı — çekirdek
    // DEĞİL, kültürü kabul edilmemiş, ama ekonomik olarak değerli.
    if (spec.colony) {
      const colonyAnchor = anchorTileOf(spec.colony.zone);
      const pool = world.provinces.filter(
        (province) => province.owner === -1 && province.zone === spec.colony.zone,
      );
      const target = Math.round(pool.length * spec.colony.share);
      if (target > 0 && pool.length) {
        pool.sort((a, b) => distanceToAnchor(a, colonyAnchor) - distanceToAnchor(b, colonyAnchor));
        const { assignment } = growRegions(graph, [pool[0]], {
          canEnter: (province) => province.owner === -1
            && province.zone === spec.colony.zone,
          stepCost: (province) => province.moveCost + rng.range(0, 1.4),
          budget: () => target,
        });
        for (const [province] of assignment) claimCluster(province, id, false);
      }
    }
    // Ada üsleri: deniz yolunun basamak taşları (tek küme, çekirdek değil).
    if (spec.bases) {
      const baseAnchor = anchorTileOf(spec.bases.zone);
      const pool = world.provinces.filter(
        (province) => province.owner === -1 && province.zone === spec.bases.zone,
      ).sort((a, b) => distanceToAnchor(a, baseAnchor) - distanceToAnchor(b, baseAnchor));
      for (const province of pool.slice(0, spec.bases.provinces)) {
        claimCluster(province, id, false);
      }
    }
    // Kabul edilen kültürler: ev topraklarında en yaygın yabancı halklar.
    const votes = new Map();
    for (const province of world.provinces) {
      if (province.coreOf !== id || province.culture < 0) continue;
      if (province.culture === nation.culture) continue;
      votes.set(province.culture, (votes.get(province.culture) ?? 0) + 1);
    }
    const acceptedNeighbors = [...votes.entries()]
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, spec.acceptNeighbors ?? 0)
      .map(([cultureId]) => cultureId);
    nation.accepted = [nation.culture, ...acceptedNeighbors].filter((c) => c >= 0);
  }

  separateNeighborColors(world, nations, rng);
  computeStats(world, nations);

  world.nations = nations;
  return nations;
}

function computeStats(world, nations) {
  for (const n of nations) {
    n.tiles = 0;
    n.provinces = 0;
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
  for (const province of world.provinces ?? []) {
    if (province.owner >= 0) nations[province.owner].provinces++;
  }
  // Başkent nüfusu ayrıca ağırlıklı.
  for (const n of nations) n.population = Math.round(n.population * 1.15);
}
