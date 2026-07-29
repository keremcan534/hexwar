// Şehir binaları. Tasarım kuralı (docs/tasarim.md): bonuslar **sabit**, yüzde
// değil — yüzde verirsek her fetih lideri katlar ve kırdığımız kartopu geri gelir.
// Her binanın bakımı var ki "hep al, hiç düşünme" olmasın.

import { hexesInRange } from '../core/hex.js';

/** Şehir başına bina yuvası. Geç oyun şehirleri sınırsız yığmasın. */
export const MAX_BUILDINGS = 3;

/**
 * Arazi koşulu: bina beslendiği araziye yakın kurulmalı.
 * Yarıçap parametre — `cities.js`'ten almak döngüsel bağımlılık yaratıyordu.
 */
function hasNearby(world, city, radius, predicate) {
  for (const { q, r } of hexesInRange(city.tile.q, city.tile.r, radius)) {
    const tile = world.get(q, r);
    if (tile && predicate(tile)) return true;
  }
  return false;
}

const isForest = (t) => t.terrain.yields.timber > 0;
const isOre = (t) => t.terrain.yields.iron > 0;

export const BUILDINGS = {
  GRANARY: {
    id: 'GRANARY',
    name: 'Ambar',
    cost: { gold: 40, timber: 3 },
    upkeep: 1,
    desc: '+2 erzak, büyüme eşiği −%20',
    apply: (city, out) => { out.food += 2; },
  },
  MARKET: {
    id: 'MARKET',
    name: 'Pazar',
    cost: { gold: 60, timber: 2 },
    upkeep: 1,
    desc: '+4 altın',
    apply: (city, out) => { out.gold += 4; },
  },
  SAWMILL: {
    id: 'SAWMILL',
    name: 'Bıçkıhane',
    cost: { gold: 50, timber: 2 },
    upkeep: 1,
    desc: 'işlenen her orman +1 kereste',
    requires: (world, city, radius) => hasNearby(world, city, radius, isForest),
    apply: (city, out) => {
      out.timber += city.worked.filter(isForest).length;
    },
  },
  FORGE: {
    id: 'FORGE',
    name: 'Demirhane',
    cost: { gold: 70, timber: 3, iron: 2 },
    upkeep: 2,
    desc: 'işlenen her tepe/dağ +1 demir',
    requires: (world, city, radius) => hasNearby(world, city, radius, isOre),
    apply: (city, out) => {
      out.iron += city.worked.filter(isOre).length;
    },
  },
  HARBOR: {
    id: 'HARBOR',
    name: 'Liman',
    cost: { gold: 70, timber: 4 },
    upkeep: 1,
    desc: 'işlenen her su +1 erzak +1 altın',
    requires: (world, city) => city.tile.coastal,
    apply: (city, out) => {
      const water = city.worked.filter((t) => t.terrain.water).length;
      out.food += water;
      out.gold += water;
    },
  },
  WALLS: {
    id: 'WALLS',
    name: 'Sur',
    cost: { gold: 60, timber: 2, iron: 2 },
    upkeep: 1,
    desc: '+%15 savunma',
    defense: 0.15,
    apply: () => {},
  },
};

export function hasBuilding(city, id) {
  return city.buildings?.includes(id);
}

export function canBuild(world, city, id, radius) {
  const b = BUILDINGS[id];
  if (!b || !city.buildings) return false;
  if (city.buildings.length >= MAX_BUILDINGS) return false;
  if (hasBuilding(city, id)) return false;
  return !b.requires || b.requires(world, city, radius);
}

/** Binaların şehir üretimine katkısı. */
export function applyBuildings(city, out) {
  for (const id of city.buildings ?? []) BUILDINGS[id]?.apply(city, out);
}

/** Şehrin bina bakım gideri (altın). */
export function buildingUpkeep(city) {
  let total = 0;
  for (const id of city.buildings ?? []) total += BUILDINGS[id]?.upkeep ?? 0;
  return total;
}

/** Surların savunma katkısı. */
export function buildingDefense(city) {
  let total = 0;
  for (const id of city.buildings ?? []) total += BUILDINGS[id]?.defense ?? 0;
  return total;
}
