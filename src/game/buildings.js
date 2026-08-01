// Şehir binaları. Tasarım kuralı (docs/tasarim.md): bonuslar **sabit**, yüzde
// değil — yüzde verirsek her fetih lideri katlar ve kırdığımız kartopu geri gelir.
// Her binanın bakımı var ki "hep al, hiç düşünme" olmasın.

import { hexDistance, hexesInRange } from '../core/hex.js';
import { techBuildingSlots } from './tech.js';

/** Şehir başına bina yuvası. Geç oyun şehirleri sınırsız yığmasın. */
export const MAX_BUILDINGS = 4;

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
const isFertile = (t) => !t.terrain.water && t.terrain.yields.food >= 2;

export const BUILDINGS = {
  GRANARY: {
    id: 'GRANARY',
    category: 'civilian',
    icon: '🌾',
    name: 'Granary',
    cost: { gold: 40, timber: 3 },
    maintenance: { gold: 1 },
    desc: '+2 food, growth threshold −20%',
    apply: (city, out) => { out.food += 2; },
  },
  MARKET: {
    id: 'MARKET',
    category: 'civilian',
    icon: '⬤',
    name: 'Market',
    cost: { gold: 60, timber: 2 },
    maintenance: { gold: 1 },
    desc: '+4 gold',
    apply: (city, out) => { out.gold += 4; },
  },
  SAWMILL: {
    id: 'SAWMILL',
    category: 'industry',
    icon: '🪵',
    name: 'Sawmill',
    cost: { gold: 50, timber: 2 },
    maintenance: { gold: 1, food: 1 },
    desc: '+1 timber from every worked forest',
    requiresText: 'Requires nearby forest',
    requires: (world, city, radius) => hasNearby(world, city, radius, isForest),
    apply: (city, out) => {
      out.timber += city.worked.filter(isForest).length;
    },
  },
  FORGE: {
    id: 'FORGE',
    category: 'industry',
    icon: '⚒',
    name: 'Forge',
    cost: { gold: 70, timber: 3, iron: 2 },
    maintenance: { gold: 2, timber: 1 },
    desc: '+1 iron from every worked hill or mountain',
    requiresText: 'Requires nearby iron-bearing terrain',
    requires: (world, city, radius) => hasNearby(world, city, radius, isOre),
    apply: (city, out) => {
      out.iron += city.worked.filter(isOre).length;
    },
  },
  HARBOR: {
    id: 'HARBOR',
    category: 'naval',
    icon: '⚓',
    name: 'Harbor',
    cost: { gold: 70, timber: 4 },
    maintenance: { gold: 1 },
    desc: '+1 food and +1 gold from every worked water tile',
    requiresText: 'Requires a coastal city',
    requires: (world, city) => city.tile.coastal,
    apply: (city, out) => {
      const water = city.worked.filter((t) => t.terrain.water).length;
      out.food += water;
      out.gold += water;
    },
  },
  WALLS: {
    id: 'WALLS',
    category: 'military',
    icon: '🛡',
    name: 'Fortifications',
    cost: { gold: 60, timber: 2, iron: 2 },
    maintenance: { gold: 1 },
    desc: '+15% defense',
    defense: 0.15,
    apply: () => {},
  },
  FARM_ESTATE: {
    id: 'FARM_ESTATE',
    category: 'civilian',
    icon: '🌱',
    name: 'Agricultural Estate',
    cost: { gold: 55, timber: 3 },
    maintenance: { gold: 1 },
    desc: '+1 food from every worked fertile land tile',
    requiresText: 'Requires nearby fertile land',
    requires: (world, city, radius) => hasNearby(world, city, radius, isFertile),
    apply: (city, out) => {
      out.food += city.worked.filter(isFertile).length;
    },
  },
  MINE: {
    id: 'MINE',
    category: 'industry',
    icon: '⛏',
    name: 'Deep Mine',
    cost: { gold: 65, timber: 4 },
    maintenance: { gold: 2, food: 1 },
    desc: '+2 iron',
    requiresText: 'Requires nearby iron-bearing terrain',
    requires: (world, city, radius) => hasNearby(world, city, radius, isOre),
    apply: (city, out) => { out.iron += 2; },
  },
  WORKSHOP: {
    id: 'WORKSHOP',
    category: 'industry',
    icon: '🏭',
    name: 'Manufacturing Works',
    cost: { gold: 80, timber: 4, iron: 2 },
    maintenance: { gold: 2, iron: 1 },
    desc: '+2 timber and +2 gold',
    apply: (city, out) => {
      out.timber += 2;
      out.gold += 2;
    },
  },
  BARRACKS: {
    id: 'BARRACKS',
    category: 'military',
    icon: '⚔',
    name: 'Barracks',
    cost: { gold: 90, timber: 5, iron: 3 },
    maintenance: { gold: 2, food: 1 },
    armyUpkeepRelief: 1,
    desc: '−1 national army gold upkeep',
    apply: () => {},
  },
  SHIPYARD: {
    id: 'SHIPYARD',
    category: 'naval',
    icon: '🚢',
    name: 'Naval Shipyard',
    cost: { gold: 110, timber: 6, iron: 4 },
    maintenance: { gold: 2, timber: 1 },
    desc: '+1 timber and +3 gold',
    requiresText: 'Requires a coastal city',
    requires: (world, city) => city.tile.coastal,
    apply: (city, out) => {
      out.timber += 1;
      out.gold += 3;
    },
  },
  UNIVERSITY: {
    id: 'UNIVERSITY',
    category: 'state',
    icon: '🎓',
    name: 'University',
    cost: { gold: 140, timber: 6 },
    maintenance: { gold: 3 },
    researchDiscount: 0.08,
    desc: '−8% technology gold cost',
    apply: () => {},
  },
  SUPPLY_DEPOT: {
    id: 'SUPPLY_DEPOT',
    category: 'state',
    icon: '📦',
    name: 'Supply Depot',
    cost: { gold: 75, timber: 5 },
    maintenance: { gold: 1 },
    storage: 20,
    desc: '+20 timber and iron storage capacity',
    apply: () => {},
  },
  ADMIN_CENTER: {
    id: 'ADMIN_CENTER',
    category: 'state',
    icon: '🏛',
    name: 'Administrative Center',
    cost: { gold: 120, timber: 5 },
    maintenance: { gold: 2 },
    extraSlot: 1,
    desc: '+1 building slot and +2 gold',
    apply: (city, out) => { out.gold += 2; },
  },
};

export function hasBuilding(city, id) {
  return city.buildings?.includes(id);
}

/** Şehrin bina yuvası sayısı; idare yatırımları yeni yuvalar açar. */
export function buildingSlots(nation, city = null) {
  const local = city?.buildings?.reduce(
    (sum, id) => sum + (BUILDINGS[id]?.extraSlot ?? 0), 0,
  ) ?? 0;
  return MAX_BUILDINGS + (nation ? techBuildingSlots(nation) : 0) + local;
}

export function buildingStatus(world, city, id, radius) {
  const b = BUILDINGS[id];
  if (!b || !city?.buildings) return { ok: false, reason: 'Unavailable' };
  if (hasBuilding(city, id)) return { ok: false, reason: 'Already built' };
  const nation = world?.nations?.[city.nationId];
  if (city.buildings.length >= buildingSlots(nation, city)) {
    return { ok: false, reason: 'No free building slots' };
  }
  if (b.requires && !b.requires(world, city, radius)) {
    return { ok: false, reason: b.requiresText ?? 'Location requirements not met' };
  }
  return { ok: true, reason: '' };
}

export function canBuild(world, city, id, radius) {
  return buildingStatus(world, city, id, radius).ok;
}

function locationFits(buildingId, tile, city) {
  if (!tile?.terrain.passable || tile.structure) return false;
  if (buildingId === 'SAWMILL') return tile.terrain.yields.timber > 0;
  if (buildingId === 'FORGE' || buildingId === 'MINE') return tile.terrain.yields.iron > 0;
  if (buildingId === 'FARM_ESTATE') return tile.terrain.yields.food >= 2;
  if (buildingId === 'HARBOR' || buildingId === 'SHIPYARD') return tile.coastal;
  if (buildingId === 'WALLS') return tile === city.tile;
  return true;
}

/** Seçilen province'e hangi şehir adına bina yerleştirilebileceğini döndürür. */
export function placementCityFor(world, nationId, tile, buildingId, radius = 2) {
  if (!tile || tile.owner !== nationId || !tile.terrain.passable || tile.structure) return null;
  const cities = world.cities
    .filter((city) => (
      city.nationId === nationId
      && hexDistance(city.tile.q, city.tile.r, tile.q, tile.r) <= radius
    ))
    .sort((a, b) => (
      hexDistance(a.tile.q, a.tile.r, tile.q, tile.r)
      - hexDistance(b.tile.q, b.tile.r, tile.q, tile.r)
    ));
  for (const city of cities) {
    if (!locationFits(buildingId, tile, city)) continue;
    if (buildingStatus(world, city, buildingId, radius).ok) return city;
  }
  return null;
}

export function buildingPlacementTiles(world, nationId, buildingId, radius = 2) {
  const placements = new Map();
  world.forEach((tile) => {
    const city = placementCityFor(world, nationId, tile, buildingId, radius);
    if (city) placements.set(tile, city);
  });
  return placements;
}

/** Binaların şehir üretimine katkısı. */
export function applyBuildings(city, out) {
  for (const id of city.buildings ?? []) BUILDINGS[id]?.apply(city, out);
}

/** Şehrin bina bakım gideri (altın). */
export function buildingUpkeep(city) {
  return buildingMaintenance(city).gold ?? 0;
}

/**
 * İşletme gideri tek kaynağa kilitli değildir. Yeni bir stratejik kaynak
 * eklendiğinde bina tanımındaki `maintenance` alanı ekonomiye kendiliğinden katılır.
 */
export function buildingMaintenance(city) {
  const total = {};
  for (const id of city.buildings ?? []) {
    const building = BUILDINGS[id];
    const maintenance = building?.maintenance ?? { gold: building?.upkeep ?? 0 };
    for (const [resource, amount] of Object.entries(maintenance)) {
      total[resource] = (total[resource] ?? 0) + amount;
    }
  }
  return total;
}

/** Surların savunma katkısı. */
export function buildingDefense(city) {
  let total = 0;
  for (const id of city.buildings ?? []) total += BUILDINGS[id]?.defense ?? 0;
  return total;
}

export function buildingStorage(city) {
  return (city.buildings ?? []).reduce(
    (total, id) => total + (BUILDINGS[id]?.storage ?? 0), 0,
  );
}

export function buildingResearchDiscount(city) {
  return (city.buildings ?? []).reduce(
    (total, id) => total + (BUILDINGS[id]?.researchDiscount ?? 0), 0,
  );
}

export function buildingArmyUpkeepRelief(city) {
  return (city.buildings ?? []).reduce(
    (total, id) => total + (BUILDINGS[id]?.armyUpkeepRelief ?? 0), 0,
  );
}
