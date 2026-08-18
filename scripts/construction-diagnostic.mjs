import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import {
  FORT_DEFENSE, FORT_RADIUS, canQueueConstruction, cancelConstruction, constructionAtlas,
  constructionCount, constructionPower, constructionUpkeep, fortDefenseAt, higherEducationBonus,
  investmentBlocker, investmentLevel, prioritizeConstruction, queueConstruction, queueInvestment,
  runConstruction,
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
game.renderer = { invalidateCache() {}, invalidateTiles() {} };
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
// Yatirim bedeli PESIN odenir; tani finansmani degil kuyruk davranisini olcer.
nation.gold = Math.max(nation.gold, 800);

// --- 1) Ulusal insaat kapasitesi yatirimi -----------------------------------
const capacityQueued = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
// Ikinci yatirimin fiyati kuyruktakiyle birlikte artmali (fiyat kacirilamaz).
const risingCost = investmentBlocker(nation, 'CONSTRUCTION_CAPACITY') === null;
for (let week = 0; week < 20; week++) runConstruction(game);
const capacityCompleted = investmentLevel(nation, 'CONSTRUCTION_CAPACITY') === 1;
const capacityIncreased = constructionPower(nation) === 10;
const upkeepApplied = constructionUpkeep(nation) === 4;

// --- 2) Yuksekogretim: egitim butcesi esigi ---------------------------------
nation.economy.social.education = 0;
const educationGate = investmentBlocker(nation, 'HIGHER_EDUCATION') !== null;
nation.economy.social.education = 25;
const educationQueued = queueInvestment(game, nation.id, 'HIGHER_EDUCATION');
for (let week = 0; week < 15; week++) runConstruction(game);
const educationCompleted = investmentLevel(nation, 'HIGHER_EDUCATION') === 1
  && higherEducationBonus(nation) === 0.06;

// --- 3) Kale: capa secimi ve YEREL etki -------------------------------------
const anchor = region.tiles.find((tile) => tile.terrain.passable) ?? region.center;
const fortQueued = queueConstruction(game, nation.id, region.id, 'FORT', anchor);
const fortProject = nation.construction.projects.find((p) => p.typeId === 'FORT');
const anchorStored = fortProject.q === anchor.q && fortProject.r === anchor.r;
// Kuyruk araclari: fort projesi one alinabilir ve iptal iade eder.
const secondQueued = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
// Kuyruk [FORT, CAPACITY]: kapasiteyi bir yukari almak sirayi cevirmeli.
const capacityProject = nation.construction.projects.find(
  (p) => p.typeId === 'CONSTRUCTION_CAPACITY' && p.progress === 0,
);
const reordered = prioritizeConstruction(game, nation.id, capacityProject.id, -1)
  && nation.construction.projects[0]?.id === capacityProject.id;
const cancelTarget = nation.construction.projects.find(
  (p) => p.typeId === 'CONSTRUCTION_CAPACITY' && p.progress === 0,
);
const goldBefore = nation.gold;
const cancelled = cancelConstruction(game, nation.id, cancelTarget.id)
  && nation.gold > goldBefore;
for (let week = 0; week < 12; week++) runConstruction(game);
const fortBuilt = constructionCount(nation, 'FORT') === 1;
const atAnchor = fortDefenseAt(game.world, nation.id, game.world.get(anchor.q, anchor.r));
const far = game.world.tiles.find((tile) => tile.owner === nation.id && tile.terrain.passable
  && game.world.wrapDistance(tile.q, tile.r, anchor.q, anchor.r) > FORT_RADIUS);
const fortLocal = atAnchor === FORT_DEFENSE
  && (!far || fortDefenseAt(game.world, nation.id, far) === 0);
const limitsWork = canQueueConstruction(game.world, nation, region.id, 'FORT');

// --- 4) Kayit turu: v15 dogal, v14 gocu -------------------------------------
game.newWorld = function newWorld(seed, options = {}) {
  this.world = generateWorld(seed, options);
  generateNations(this.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
  this.turns.start(this.world);
  return this.world;
};
game.setSpeed = () => 0;
const saved = serialize(game);
const loaded = deserialize(game, saved);
const loadedNation = game.world.nations[nation.id];
const savePreserved = loaded
  && investmentLevel(loadedNation, 'CONSTRUCTION_CAPACITY') === 1
  && investmentLevel(loadedNation, 'HIGHER_EDUCATION') === 1
  && constructionCount(loadedNation, 'FORT') === 1
  && constructionPower(loadedNation) === 10;

// v14 gocu: eski bina kayitlari kurum seviyelerine cevrilmeli, idare iade edilmeli.
const legacy = JSON.parse(JSON.stringify(saved));
legacy.version = 14;
const legacyNation = legacy.nations.find((n) => n.id === nation.id);
legacyNation.construction = {
  nextId: 9,
  buildings: [
    { id: 'b1', typeId: 'CONSTRUCTION_SECTOR', regionId: 'x', q: anchor.q, r: anchor.r },
    { id: 'b2', typeId: 'CONSTRUCTION_SECTOR', regionId: 'x', q: anchor.q, r: anchor.r },
    { id: 'b3', typeId: 'UNIVERSITY', regionId: 'x', q: anchor.q, r: anchor.r },
    { id: 'b4', typeId: 'ADMINISTRATION', regionId: 'x', q: anchor.q, r: anchor.r },
    { id: 'b5', typeId: 'FORT', regionId: 'x', q: anchor.q, r: anchor.r },
  ],
  projects: [
    { id: 6, typeId: 'UNIVERSITY', regionId: 'x', q: anchor.q, r: anchor.r, work: 100, cost: 100, funded: 100, progress: 0 },
    { id: 7, typeId: 'ADMINISTRATION', regionId: 'x', q: anchor.q, r: anchor.r, work: 80, cost: 80, funded: 80, progress: 0 },
  ],
  completedFactories: [],
  lastCompleted: 0,
};
const goldBeforeMigration = legacyNation.gold;
const migrated = deserialize(game, legacy);
const migratedNation = game.world.nations[nation.id];
const migration = {
  loads: migrated,
  capacityFromSectors: investmentLevel(migratedNation, 'CONSTRUCTION_CAPACITY') === 2,
  educationFromUniversity: investmentLevel(migratedNation, 'HIGHER_EDUCATION') === 1,
  fortSurvives: constructionCount(migratedNation, 'FORT') === 1,
  adminRefunded: migratedNation.gold >= goldBeforeMigration + 80 + 80,
  universityProjectConverted: migratedNation.construction.projects.some(
    (p) => p.kind === 'national' && p.typeId === 'HIGHER_EDUCATION',
  ),
  adminProjectDropped: !migratedNation.construction.projects.some(
    (p) => p.typeId === 'ADMINISTRATION',
  ),
  powerPreserved: constructionPower(migratedNation) === 15,
};

// --- 5) Temerrut kademesi ----------------------------------------------------
migratedNation.gold = 0;
const solventKeeps = constructionPower(migratedNation) === 15;
migratedNation.economy.creditPenalty = 0.85;
const fortTile = game.world.get(anchor.q, anchor.r);
const defaultDegrades = constructionPower(migratedNation) < 15
  && fortDefenseAt(game.world, migratedNation.id, fortTile) < FORT_DEFENSE
  && higherEducationBonus(migratedNation) < 0.06;
migratedNation.economy.creditPenalty = 0;

const functional = {
  capacityQueued,
  risingCost,
  capacityCompleted,
  capacityIncreased,
  upkeepApplied,
  educationGate,
  educationQueued,
  educationCompleted,
  fortQueued,
  anchorStored,
  secondQueued,
  reordered,
  cancelled,
  fortBuilt,
  fortLocal,
  limitsWork,
  savePreserved,
  ...migration,
  solventKeeps,
  defaultDegrades,
};

const passed = nations.every(
  (result) => result.regions > 0 && result.coveredOnce
    && result.deterministic && result.totalsValid,
) && Object.values(functional).every(Boolean);
console.log(JSON.stringify({ nations, functional, passed }, null, 2));
if (!passed) process.exitCode = 1;
