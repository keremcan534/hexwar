// Kare bazlı yol altyapısı. Yol seviyesi kara hareket maliyetini düşürür;
// maliyet yükseldikçe ağın her yere aynı anda yayılması zorlaşır.

import { canAfford, pay } from './cities.js';

export const ROAD_MAX_LEVEL = 3;

export const ROAD_LEVELS = [
  { name: 'No Road', moveReduction: 0 },
  { name: 'Dirt Road', moveReduction: 0.35 },
  { name: 'Paved Road', moveReduction: 0.7 },
  { name: 'Strategic Highway', moveReduction: 1.1 },
];

export function roadCost(tile) {
  const next = Math.min(ROAD_MAX_LEVEL, (tile?.roadLevel ?? 0) + 1);
  return {
    gold: 16 + next * 14,
    timber: next,
  };
}

export function canBuildRoad(tile, nationId) {
  return Boolean(
    tile
    && tile.owner === nationId
    && tile.terrain.passable
    && !tile.terrain.water
    && (tile.roadLevel ?? 0) < ROAD_MAX_LEVEL,
  );
}

export function buildRoad(game, tile, nationId) {
  if (!canBuildRoad(tile, nationId)) return false;
  const nation = game.world.nations[nationId];
  const cost = roadCost(tile);
  if (!nation?.alive || !canAfford(nation, cost) || !pay(nation, cost)) return false;
  tile.roadLevel = (tile.roadLevel ?? 0) + 1;
  game.renderer.invalidateCache();
  game.requestRender();
  return true;
}

export function roadMoveCost(tile) {
  const level = Math.max(0, Math.min(ROAD_MAX_LEVEL, tile?.roadLevel ?? 0));
  const reduction = ROAD_LEVELS[level].moveReduction;
  return Math.max(0.5, tile.terrain.moveCost - reduction);
}

export function roadLabel(tile) {
  return ROAD_LEVELS[Math.max(0, Math.min(ROAD_MAX_LEVEL, tile?.roadLevel ?? 0))].name;
}
