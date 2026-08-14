// Kültür bölgeleri: makro bölge ailelerinden doğar (bkz. macro.ZONE_CULTURES).
// Yoğun-batı 3 kültür konuşur, güney kıtası 4 parçalı, doğu ovası 2 dev halk.
// Ülkeler bunların üstüne kurulduğu için sınırlar doğuştan "yapay" olur — bir
// ülkenin toprağında başka halkların yaşaması kuraldır, istisna değil.

import { growRegions, pickSeeds } from './regions.js';
import { DEFAULT_ZONE, ZONE_CULTURES } from './macro.js';

const STEM = ['Ar', 'Ves', 'Kest', 'Morv', 'Dun', 'Sel', 'Tarn', 'Ilv', 'Gwen', 'Ozr', 'Bask', 'Ren', 'Vol', 'Amr', 'Sirn', 'Kald'];
const TAIL = ['en', 'ani', 'ir', 'oy', 'ash', 'uk', 'iel', 'ar', 'os', 'une'];

/** Kültür renkleri ülke paletinden ayrı: harita kipinde karışmasınlar. */
function cultureColor(index, rng) {
  const hue = (index * 97 + rng.range(0, 30)) % 360;
  return { color: `hsl(${hue.toFixed(0)} 42% 58%)`, hue, sat: 42, light: 58 };
}

function cultureName(rng, used) {
  for (let i = 0; i < 40; i++) {
    const name = rng.pick(STEM) + rng.pick(TAIL);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `Culture-${used.size + 1}`;
}

/**
 * Dünyaya kültür bölgeleri yerleştirir; her kara karesine `culture` yazar.
 * @returns {Array} cultures
 */
export function generateCultures(world, rng, options = {}) {
  const land = world.tiles.filter((t) => !t.terrain.water && t.terrain.passable);
  world.forEach((t) => { t.culture = -1; });
  if (!land.length) {
    world.cultures = [];
    return [];
  }

  // Tohumlar makro bölge ailelerinden: bölge başına ZONE_CULTURES kadar,
  // bölge içinde birbirinden uzak. Küçük haritada bölge cılız kalırsa
  // (kara payı düşükse) tohum sayısı bölge karesine göre kısılır.
  const seeds = [];
  const byZone = new Map();
  for (const tile of land) {
    const zone = tile.zone ?? DEFAULT_ZONE;
    if (!byZone.has(zone)) byZone.set(zone, []);
    byZone.get(zone).push(tile);
  }
  const zoneOrder = [...byZone.keys()].sort();
  for (const zone of zoneOrder) {
    const tiles = byZone.get(zone);
    const want = options.count != null
      ? 1
      : Math.max(1, Math.min(ZONE_CULTURES[zone] ?? 1, Math.floor(tiles.length / 30) || 1));
    seeds.push(...pickSeeds(
      tiles,
      want,
      rng,
      (a, b) => world.wrapDistance(a.q, a.r, b.q, b.r),
      Math.max(4, Math.floor(Math.sqrt(tiles.length / want))),
    ));
  }

  const { assignment, counts } = growRegions(world, seeds, {
    // Kültürler denizi aşar: yoksa her ada kendi başına kültürsüz kalıyor.
    canEnter: (tile) => tile.terrain.passable || tile.terrain.navigable,
    // Bölge dışına yayılmak pahalı: aileler kendi coğrafyasında kalır ama
    // sınır boylarında iç içe geçebilir (Vic2'nin karışık kuşakları).
    stepCost: (tile, i) => {
      const base = tile.terrain.water ? 3 : 1 + rng.range(0, 1.6);
      return tile.terrain.water || tile.zone === seeds[i].zone ? base : base + 2.2;
    },
  });

  const used = new Set();
  const cultures = seeds.map((tile, i) => {
    const palette = cultureColor(i, rng);
    return {
      id: i,
      name: cultureName(rng, used),
      color: palette.color,
      hue: palette.hue,
      sat: palette.sat,
      light: palette.light,
      origin: tile,
      tiles: 0,
    };
  });

  for (const [tile, id] of assignment) {
    if (tile.terrain.water) continue; // deniz sadece geçit, kültürü yok
    tile.culture = id;
    cultures[id].tiles++;
  }
  // Ulaşılamayan kara (kapalı iç bölge) en yakın kültüre yazılır.
  world.forEach((tile) => {
    if (tile.terrain.water || tile.culture >= 0 || !tile.terrain.passable) return;
    let bestId = 0;
    let bestDist = Infinity;
    for (const c of cultures) {
      const d = world.wrapDistance(c.origin.q, c.origin.r, tile.q, tile.r);
      if (d < bestDist) { bestDist = d; bestId = c.id; }
    }
    tile.culture = bestId;
    cultures[bestId].tiles++;
  });

  world.cultures = cultures;
  world.cultureCounts = counts;
  return cultures;
}
