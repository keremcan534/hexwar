import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import {
  canQueueConstruction, cancelConstruction, constructionAtlas, constructionCount,
  constructionPower, constructionTaxMultiplier, constructionUpkeep, prioritizeConstruction,
  fortDefenseAt, queueConstruction, runConstruction, universityWorkforceBonus,
} from '../src/game/construction.js';
import { generateNations } from '../src/world/nations.js';
import { generateWorld } from '../src/world/worldgen.js';
import { deserialize, serialize } from '../src/game/save.js';

const game = Object.create(Game.prototype);
game.world = generateWorld('CONSTRUCTION-DIAGNOSTIC');
generateNations(game.world, { seed: 'CONSTRUCTION-DIAGNOSTIC-nations' });
game.selected = null;
game.selectedUnit = null;
game.reachable = null;
game.autosaveEnabled = false;
game.listeners = {};
game.renderer = { invalidateCache() {} };
game.emit = () => {};
game.requestRender = () => {};
game.autosave = () => {};
game.turns = new TurnManager(game);
game.turns.start(game.world);

const nations = game.world.nations.filter((nation) => nation.alive).map((nation) => {
  const atlas = constructionAtlas(game.world, nation.id);
  const repeat = constructionAtlas(game.world, nation.id);
  const owned = game.world.tiles.filter(
    (tile) => tile.owner === nation.id && tile.terrain.passable,
  );
  return {
    nation: nation.name,
    regions: atlas.regions.length,
    provinces: owned.length,
    coveredOnce: atlas.tileRegions.size === owned.length
      && atlas.regions.reduce((sum, region) => sum + region.tiles.length, 0) === owned.length,
    deterministic: owned.every(
      (tile) => atlas.tileRegions.get(tile)?.id === repeat.tileRegions.get(tile)?.id,
    ),
    totalsValid: atlas.slots === atlas.used + atlas.free
      && atlas.regions.every((region) => (
        region.slots >= 4 && region.slots <= 12
        && region.used >= 0 && region.free >= 0
        && region.used + region.free === region.slots
      )),
  };
});

const nation = game.world.nations.find((candidate) => candidate.alive);
game.turns.playerNation = nation.id;
const region = constructionAtlas(game.world, nation.id).regions[0];
const beforeSlots = constructionAtlas(game.world, nation.id).free;
const sectorQueued = queueConstruction(game, nation.id, region.id, 'CONSTRUCTION_SECTOR');
const slotReserved = constructionAtlas(game.world, nation.id).free === beforeSlots - 1;
for (let week = 0; week < 20; week++) runConstruction(game);
const sectorCompleted = constructionCount(nation, 'CONSTRUCTION_SECTOR', region.id) === 1;
const capacityIncreased = constructionPower(nation) === 10;
const upkeepApplied = constructionUpkeep(nation) === 6;

const fortQueued = queueConstruction(game, nation.id, region.id, 'FORT');
const adminQueued = queueConstruction(game, nation.id, region.id, 'ADMINISTRATION');
const universityQueued = queueConstruction(game, nation.id, region.id, 'UNIVERSITY');
const universityProject = nation.construction.projects.find(
  (project) => project.typeId === 'UNIVERSITY',
);
const reordered = prioritizeConstruction(game, nation.id, universityProject.id, -1)
  && nation.construction.projects[1]?.typeId === 'UNIVERSITY';
const cancelId = nation.construction.projects.find(
  (project) => project.typeId === 'ADMINISTRATION',
)?.id;
const cancelled = cancelConstruction(game, nation.id, cancelId)
  && !nation.construction.projects.some((project) => project.id === cancelId);
const limitsWork = canQueueConstruction(game.world, nation, region.id, 'CONSTRUCTION_SECTOR');
const effects = constructionTaxMultiplier(nation) === 1 && universityWorkforceBonus(nation) === 0;
const saved = serialize(game);
game.newWorld = function newWorld(seed, options = {}) {
  this.world = generateWorld(seed, options);
  generateNations(this.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
  this.turns.start(this.world);
  return this.world;
};
game.setSpeed = () => 0;
const loaded = deserialize(game, saved);
const loadedNation = game.world.nations[nation.id];
const savePreserved = loaded
  && constructionCount(loadedNation, 'CONSTRUCTION_SECTOR') === 1
  && loadedNation.construction.projects.length === 2
  && constructionPower(loadedNation) === 10;
for (let week = 0; week < 7; week++) runConstruction(game);
const fortProjectAnchor = loadedNation.construction.buildings.find(
  (building) => building.typeId === 'FORT',
);
const fortAnchorTile = game.world.get(fortProjectAnchor.q, fortProjectAnchor.r);
const fortEffectApplied = fortDefenseAt(game.world, loadedNation.id, fortAnchorTile) === 0.08;
for (let week = 0; week < 10; week++) runConstruction(game);
const universityEffectApplied = universityWorkforceBonus(loadedNation) === 0.04;
const loadedRegion = constructionAtlas(game.world, loadedNation.id).regions[0];
queueConstruction(game, loadedNation.id, loadedRegion.id, 'ADMINISTRATION');
for (let week = 0; week < 8; week++) runConstruction(game);
const adminEffectApplied = constructionTaxMultiplier(loadedNation) === 1.04;
loadedNation.gold = 0;
const unfundedBuildingsStop = constructionPower(loadedNation) === 5
  && fortDefenseAt(game.world, loadedNation.id, fortAnchorTile) === 0
  && universityWorkforceBonus(loadedNation) === 0
  && constructionTaxMultiplier(loadedNation) === 1;

const functional = {
  sectorQueued,
  slotReserved,
  sectorCompleted,
  capacityIncreased,
  upkeepApplied,
  fortQueued,
  adminQueued,
  universityQueued,
  reordered,
  cancelled,
  limitsWork,
  effects,
  savePreserved,
  fortEffectApplied,
  universityEffectApplied,
  adminEffectApplied,
  unfundedBuildingsStop,
};

const passed = nations.every(
  (result) => result.regions > 0 && result.coveredOnce
    && result.deterministic && result.totalsValid,
) && Object.values(functional).every(Boolean);
console.log(JSON.stringify({ nations, functional, passed }, null, 2));
if (!passed) process.exitCode = 1;
