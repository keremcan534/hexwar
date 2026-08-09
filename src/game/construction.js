// State construction: deterministik planlama bolgeleri, kalici binalar ve
// Victoria 3 benzeri ulusal insaat gucuyle ilerleyen tek bir oncelik kuyrugu.

import { hexDistance } from '../core/hex.js';
import { provinceName } from './provinces.js';
import { controllerOf } from './control.js';

const TARGET_PROVINCES_PER_REGION = 14;
const MIN_REGIONS = 1;
const MAX_REGIONS = 12;

export const BASE_CONSTRUCTION_POWER = 5;

export const CONSTRUCTION_TYPES = {
  CONSTRUCTION_SECTOR: {
    id: 'CONSTRUCTION_SECTOR', name: 'Construction Sector', icon: '🏗',
    cost: 100, upkeep: 6, maxPerRegion: 3,
    desc: '+5 weekly construction power. Expensive to maintain.',
  },
  FORT: {
    id: 'FORT', name: 'Fort', icon: '🛡',
    cost: 70, upkeep: 1.5, maxPerRegion: 3,
    desc: '+8% defender power in this state per level.',
  },
  ADMINISTRATION: {
    id: 'ADMINISTRATION', name: 'Administration', icon: '⚖',
    cost: 80, upkeep: 2, maxPerRegion: 2,
    desc: '+4% national tax collection per building.',
  },
  UNIVERSITY: {
    id: 'UNIVERSITY', name: 'University', icon: '🎓',
    cost: 100, upkeep: 3, maxPerRegion: 2,
    desc: 'Improves education spending and industrial workforce.',
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function tileOrder(a, b) {
  return a.r - b.r || a.q - b.q;
}

function chooseSeeds(tiles, capital, count) {
  const ordered = [...tiles].sort(tileOrder);
  const first = tiles.includes(capital) ? capital : ordered[0];
  const seeds = [first];
  while (seeds.length < count) {
    let best = null;
    let bestDistance = -1;
    for (const tile of ordered) {
      if (seeds.includes(tile)) continue;
      const distance = Math.min(...seeds.map(
        (seed) => hexDistance(tile.q, tile.r, seed.q, seed.r),
      ));
      if (distance > bestDistance) {
        best = tile;
        bestDistance = distance;
      }
    }
    if (!best) break;
    seeds.push(best);
  }
  return seeds;
}

function nearestSeed(tile, seeds) {
  let winner = 0;
  let distance = Infinity;
  for (let index = 0; index < seeds.length; index++) {
    const next = hexDistance(tile.q, tile.r, seeds[index].q, seeds[index].r);
    if (next < distance) {
      winner = index;
      distance = next;
    }
  }
  return winner;
}

function displayCenter(tiles) {
  const q = tiles.reduce((sum, tile) => sum + tile.q, 0) / Math.max(1, tiles.length);
  const r = tiles.reduce((sum, tile) => sum + tile.r, 0) / Math.max(1, tiles.length);
  return [...tiles].sort((a, b) => (
    hexDistance(a.q, a.r, q, r) - hexDistance(b.q, b.r, q, r)
  ) || tileOrder(a, b))[0];
}

export function ensureConstruction(nation) {
  nation.construction ??= { nextId: 1, buildings: [], projects: [], lastCompleted: 0 };
  const state = nation.construction;
  state.nextId = Math.max(1, Number(state.nextId) || 1);
  state.buildings = (state.buildings ?? []).filter(
    (building) => CONSTRUCTION_TYPES[building.typeId]
      && (typeof building.regionId === 'string' || Number.isFinite(building.q)),
  );
  state.projects = (state.projects ?? []).filter(
    (project) => CONSTRUCTION_TYPES[project.typeId]
      && (typeof project.regionId === 'string' || Number.isFinite(project.q)),
  ).map((project) => ({
    ...project,
    progress: Math.max(0, Number(project.progress) || 0),
  }));
  state.lastCompleted ??= 0;
  return state;
}

export function initConstruction(world) {
  for (const nation of world.nations) {
    nation.construction = { nextId: 1, buildings: [], projects: [], lastCompleted: 0 };
  }
}

export function constructionCount(nation, typeId, regionId = null) {
  const state = ensureConstruction(nation);
  return state.buildings.filter((building) => (
    building.typeId === typeId && (regionId == null || building.regionId === regionId)
  )).length;
}

export function constructionPower(nation) {
  const sectorPower = constructionCount(nation, 'CONSTRUCTION_SECTOR') * 5;
  return BASE_CONSTRUCTION_POWER + (nation.gold > 0 ? sectorPower : 0);
}

export function constructionUpkeep(nation) {
  return ensureConstruction(nation).buildings.reduce(
    (sum, building) => sum + (CONSTRUCTION_TYPES[building.typeId]?.upkeep ?? 0), 0,
  );
}

export function constructionTaxMultiplier(nation) {
  return nation.gold > 0
    ? 1 + Math.min(0.24, constructionCount(nation, 'ADMINISTRATION') * 0.04) : 1;
}

export function universityWorkforceBonus(nation) {
  return nation.gold > 0
    ? Math.min(0.24, constructionCount(nation, 'UNIVERSITY') * 0.04) : 0;
}

export function fortDefenseAt(world, nationId, tile) {
  if (!tile || tile.owner !== nationId) return 0;
  if (!(world.nations[nationId]?.gold > 0)) return 0;
  const region = constructionAtlas(world, nationId).tileRegions.get(tile);
  return region ? region.buildings.filter((building) => building.typeId === 'FORT').length * 0.08 : 0;
}

export function constructionAtlas(world, nationId) {
  const nation = world?.nations?.[nationId];
  const owned = world?.tiles?.filter(
    (tile) => tile.owner === nationId && controllerOf(tile) === nationId
      && tile.terrain.passable,
  ) ?? [];
  if (!nation || !owned.length) {
    return { nationId, regions: [], tileRegions: new Map(), slots: 0, used: 0, free: 0 };
  }

  const regionCount = clamp(
    Math.ceil(owned.length / TARGET_PROVINCES_PER_REGION),
    MIN_REGIONS,
    MAX_REGIONS,
  );
  const seeds = chooseSeeds(owned, nation.capital, regionCount);
  const regions = seeds.map((seed, index) => ({
    id: `${nationId}:${index}`,
    index,
    seed,
    tiles: [],
    cities: [],
    population: 0,
    development: 0,
  }));
  const tileRegions = new Map();

  for (const tile of owned) {
    const region = regions[nearestSeed(tile, seeds)];
    region.tiles.push(tile);
    region.population += tile.province?.population ?? 0;
    region.development += (tile.province?.agriculture ?? 0)
      + (tile.province?.extraction ?? 0) + (tile.province?.commerce ?? 0);
    tileRegions.set(tile, region);
  }

  for (const city of world.cities.filter((candidate) => candidate.nationId === nationId)) {
    tileRegions.get(city.tile)?.cities.push(city);
  }

  for (const region of regions) {
    region.center = displayCenter(region.tiles);
    region.name = region.cities[0]?.name ?? provinceName(region.seed);
    const capacity = 3 + Math.floor(region.tiles.length / 6)
      + Math.floor(region.population / 70000) + Math.floor(region.development / 12);
    region.slots = clamp(capacity, 4, 12);
    const state = ensureConstruction(nation);
    const inRegion = (item) => {
      if (Number.isFinite(item.q) && Number.isFinite(item.r)) {
        const anchor = world.get(item.q, item.r);
        return anchor?.owner === nationId && controllerOf(anchor) === nationId
          && tileRegions.get(anchor)?.id === region.id;
      }
      return item.regionId === region.id;
    };
    region.buildings = state.buildings.filter(inRegion);
    region.projects = state.projects.filter(inRegion);
    region.used = region.buildings.length + region.projects.length;
    region.free = Math.max(0, region.slots - region.used);
    region.freeRatio = region.slots ? region.free / region.slots : 0;
    region.status = region.free === 0 ? 'full' : region.used > 0 ? 'partial' : 'open';
  }

  return {
    nationId,
    regions,
    tileRegions,
    slots: regions.reduce((sum, region) => sum + region.slots, 0),
    used: regions.reduce((sum, region) => sum + region.used, 0),
    free: regions.reduce((sum, region) => sum + region.free, 0),
  };
}

export function canQueueConstruction(world, nation, regionId, typeId) {
  const type = CONSTRUCTION_TYPES[typeId];
  if (!nation?.alive || !type) return false;
  const region = constructionAtlas(world, nation.id).regions.find((item) => item.id === regionId);
  if (!region || region.free <= 0) return false;
  const sameType = region.buildings.filter((building) => building.typeId === typeId).length
    + region.projects.filter((project) => project.typeId === typeId).length;
  return sameType < type.maxPerRegion;
}

export function queueConstruction(game, nationId, regionId, typeId) {
  const nation = game.world.nations[nationId];
  if (!canQueueConstruction(game.world, nation, regionId, typeId)) return false;
  const state = ensureConstruction(nation);
  const region = constructionAtlas(game.world, nationId).regions.find((item) => item.id === regionId);
  state.projects.push({
    id: state.nextId++, typeId, regionId, regionName: region.name,
    q: region.center.q, r: region.center.r,
    progress: 0, started: game.turns.turn,
  });
  game.renderer.invalidateCache();
  game.emit('construction', state);
  game.requestRender();
  return true;
}

export function cancelConstruction(game, nationId, projectId) {
  const nation = game.world.nations[nationId];
  if (!nation) return false;
  const state = ensureConstruction(nation);
  const index = state.projects.findIndex((project) => project.id === projectId);
  if (index < 0) return false;
  state.projects.splice(index, 1);
  game.renderer.invalidateCache();
  game.emit('construction', state);
  game.requestRender();
  return true;
}

export function prioritizeConstruction(game, nationId, projectId, direction) {
  const nation = game.world.nations[nationId];
  if (!nation) return false;
  const state = ensureConstruction(nation);
  const index = state.projects.findIndex((project) => project.id === projectId);
  const target = index + Math.sign(direction);
  if (index < 0 || target < 0 || target >= state.projects.length) return false;
  [state.projects[index], state.projects[target]] = [state.projects[target], state.projects[index]];
  game.emit('construction', state);
  return true;
}

export function captureConstructionAt(world, tile, newNationId) {
  if (!tile || tile.owner < 0 || tile.owner === newNationId) return 0;
  const oldNation = world.nations[tile.owner];
  const newNation = world.nations[newNationId];
  if (!oldNation || !newNation) return 0;
  const oldState = ensureConstruction(oldNation);
  const newState = ensureConstruction(newNation);
  const captured = oldState.buildings.filter(
    (building) => building.q === tile.q && building.r === tile.r,
  );
  oldState.buildings = oldState.buildings.filter(
    (building) => building.q !== tile.q || building.r !== tile.r,
  );
  // Tamamlanmamis proje province kaybedildiginde iptal olur; bitmis bina devredilir.
  oldState.projects = oldState.projects.filter(
    (project) => project.q !== tile.q || project.r !== tile.r,
  );
  for (const building of captured) {
    newState.buildings.push({
      ...building,
      id: `captured-${newNationId}-${newState.nextId++}`,
      regionId: `${newNationId}:captured`,
    });
  }
  return captured.length;
}

function planConstructionAI(game, nation) {
  const state = ensureConstruction(nation);
  if (nation.id === game.turns.playerNation || state.projects.length || nation.gold < 180) return;
  const desired = constructionCount(nation, 'CONSTRUCTION_SECTOR') < 1
    ? 'CONSTRUCTION_SECTOR'
    : constructionCount(nation, 'ADMINISTRATION') < 1
      ? 'ADMINISTRATION'
      : constructionCount(nation, 'UNIVERSITY') < 1
        ? 'UNIVERSITY'
        : constructionCount(nation, 'FORT') < 2 ? 'FORT' : null;
  if (!desired) return;
  const regions = constructionAtlas(game.world, nation.id).regions
    .sort((a, b) => b.free - a.free || b.population - a.population);
  const region = regions.find((candidate) => (
    canQueueConstruction(game.world, nation, candidate.id, desired)
  ));
  if (region) queueConstruction(game, nation.id, region.id, desired);
}

export function runConstruction(game) {
  let changed = false;
  for (const nation of game.world.nations) {
    if (!nation.alive) continue;
    planConstructionAI(game, nation);
    const state = ensureConstruction(nation);
    let power = constructionPower(nation);
    let completed = 0;
    while (power > 0 && state.projects.length) {
      const project = state.projects[0];
      const type = CONSTRUCTION_TYPES[project.typeId];
      const remaining = Math.max(0, type.cost - project.progress);
      const spent = Math.min(power, remaining);
      project.progress += spent;
      power -= spent;
      if (project.progress + 1e-6 < type.cost) break;
      state.projects.shift();
      state.buildings.push({
        id: `building-${nation.id}-${project.id}`,
        typeId: project.typeId,
        regionId: project.regionId,
        regionName: project.regionName,
        q: project.q,
        r: project.r,
        completed: game.turns.turn,
      });
      completed++;
      if (nation.id === game.turns.playerNation) {
        game.turns.addLog(`${type.name} completed in ${project.regionName}.`);
      }
    }
    state.lastCompleted = completed;
    if (completed || state.projects.length) changed = true;
  }
  if (changed) {
    game.renderer.invalidateCache();
    game.emit('construction', null);
    game.requestRender();
  }
  return changed;
}
