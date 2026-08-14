// Kültür bölgeleri: ülkelerden az sayıda ve büyük. Ülkeler bunların üstüne
// kurulduğu için sınırlar doğuştan "yapay" olur — bir ülkenin toprağında
// başka halkların yaşaması kuraldır, istisna değil.
//
// Bu adımda kültürün oyun etkisi yok; hoşnutsuzluk ve infamy 3. adımda gelecek.

import { growRegions, pickSeeds } from './regions.js';

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

  // Ülkelerden çok daha az: bir kültür bölgesi birkaç ülkeyi kapsasın.
  const count = options.count
    ?? Math.max(3, Math.min(14, Math.round(land.length / 260)));
  const seeds = pickSeeds(
    land,
    count,
    rng,
    (a, b) => world.wrapDistance(a.q, a.r, b.q, b.r),
    Math.max(6, Math.floor(Math.min(world.cols, world.rows) / Math.sqrt(count))),
  );

  const { assignment, counts } = growRegions(world, seeds, {
    // Kültürler denizi aşar: yoksa her ada kendi başına kültürsüz kalıyor.
    canEnter: (tile) => tile.terrain.passable || tile.terrain.navigable,
    stepCost: (tile) => (tile.terrain.water ? 3 : 1 + rng.range(0, 1.6)),
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
