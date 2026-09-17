import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import {
  cancelConstruction, constructionAtlas, constructionPower, constructionUpkeep,
  constructionView, investmentBlocker, investmentLevel, moveConstructionTo,
  prioritizeConstruction, queueInvestment, runConstruction,
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
    // Bolge yuvalari kaleyle gitti; bolge artik yalniz fabrika konumu ve ad.
    regionsValid: atlas.regions.every((region) => region.tiles.length > 0 && Boolean(region.name))
      && new Set(atlas.regions.map((region) => region.id)).size === atlas.regions.length,
  };
});

const nation = game.world.nations.find((candidate) => candidate.alive);
game.turns.playerNation = nation.id;
// Yatirim bedeli PESIN odenir; tani finansmani degil kuyruk davranisini olcer.
nation.gold = Math.max(nation.gold, 800);

// --- 1) Ulusal insaat kapasitesi yatirimi -----------------------------------
const capacityQueued = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
// Ikinci yatirimin fiyati kuyruktakiyle birlikte artmali (fiyat kacirilamaz).
const risingCost = investmentBlocker(nation, 'CONSTRUCTION_CAPACITY') === null
  && constructionView(nation).capacity.cost > 100;
for (let week = 0; week < 20; week++) runConstruction(game);
const capacityCompleted = investmentLevel(nation, 'CONSTRUCTION_CAPACITY') === 1;
const capacityIncreased = constructionPower(nation) === 10;
const upkeepApplied = constructionUpkeep(nation) === 4;

// --- 2) Kuyruk araclari: sira, uca tasima, iptal iadesi ---------------------
nation.gold = Math.max(nation.gold, 800);
const firstQueued = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
const secondQueued = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
const [first, second] = nation.construction.projects;
const reordered = prioritizeConstruction(game, nation.id, second.id, -1)
  && nation.construction.projects[0]?.id === second.id;
const movedToBottom = moveConstructionTo(game, nation.id, second.id, 'bottom')
  && nation.construction.projects.at(-1)?.id === second.id;
const movedToTop = moveConstructionTo(game, nation.id, second.id, 'top')
  && nation.construction.projects[0]?.id === second.id;
const view = constructionView(nation);
const viewRows = view.own.length === 2 && view.investors.length === 0
  && view.own.every((row) => row.place === 'National' && row.eta >= 1)
  && view.capacity.pending === 2 && view.clearsIn === view.own.at(-1).eta;
const goldBefore = nation.gold;
const cancelled = cancelConstruction(game, nation.id, first.id)
  && nation.gold > goldBefore
  && !nation.construction.projects.some((p) => p.id === first.id);
for (let week = 0; week < 30; week++) runConstruction(game);
const secondCompleted = investmentLevel(nation, 'CONSTRUCTION_CAPACITY') === 2
  && constructionPower(nation) === 15;

// --- 3) Kayit turu: v21 dogal, kaldirilan kalemlerin temizligi, v14 gocu -----
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
  && investmentLevel(loadedNation, 'CONSTRUCTION_CAPACITY') === 2
  && constructionPower(loadedNation) === 15
  && !('buildings' in loadedNation.construction);

const anchor = game.world.tiles.find((tile) => tile.owner === nation.id && tile.terrain.passable);

// Kaldirmadan once kaydedilmis oyun: yerlesik kale, egitim seviyesi ve bedeli
// odenmis kale/yuksekogretim projeleri. Kapasite korunur, gerisi iade edilerek
// duser.
const removal = JSON.parse(JSON.stringify(saved));
const removalNation = removal.nations.find((n) => n.id === nation.id);
removalNation.construction = {
  nextId: 20,
  buildings: [{ id: 'b1', typeId: 'FORT', regionId: 'x', q: anchor.q, r: anchor.r }],
  projects: [
    { id: 11, typeId: 'FORT', regionId: 'x', q: anchor.q, r: anchor.r, work: 60, cost: 60, funded: 60, progress: 45 },
    { id: 12, kind: 'national', typeId: 'HIGHER_EDUCATION', work: 120, cost: 120, funded: 120, progress: 0 },
  ],
  completedFactories: [],
  lastCompleted: 0,
  capacity: { construction: 2, education: 1 },
};
const goldBeforeRemoval = removalNation.gold;
const cleanedLoads = deserialize(game, removal);
const cleanedNation = game.world.nations[nation.id];
const cleanup = {
  cleanedLoads,
  removedBuildings: !('buildings' in cleanedNation.construction),
  removedEducation: !('education' in cleanedNation.construction.capacity),
  removedProjects: cleanedNation.construction.projects.length === 0,
  // Kalenin insa edilmemis ceyregi (15) + yuksekogretimin tamami (120).
  refundedOnce: Math.abs(cleanedNation.gold - (goldBeforeRemoval + 15 + 120)) < 1e-6,
  capacityKept: investmentLevel(cleanedNation, 'CONSTRUCTION_CAPACITY') === 2,
};

// v14 gocu: eski bina kayitlari kurum seviyesine cevrilir, gerisi iade edilir.
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
  noLegacyBuildings: !('buildings' in migratedNation.construction),
  // Administration binasi (80) + University projesi (100) + Administration projesi (80).
  legacyRefunded: Math.abs(migratedNation.gold - (goldBeforeMigration + 80 + 100 + 80)) < 1e-6,
  legacyProjectsDropped: migratedNation.construction.projects.length === 0,
  powerPreserved: constructionPower(migratedNation) === 15,
};

// --- 4) Temerrut kademesi ----------------------------------------------------
migratedNation.gold = 0;
const solventKeeps = constructionPower(migratedNation) === 15;
migratedNation.economy.creditPenalty = 0.85;
const defaultDegrades = constructionPower(migratedNation) < 15;
migratedNation.economy.creditPenalty = 0;

const functional = {
  capacityQueued,
  risingCost,
  capacityCompleted,
  capacityIncreased,
  upkeepApplied,
  firstQueued,
  secondQueued,
  reordered,
  movedToBottom,
  movedToTop,
  viewRows,
  cancelled,
  secondCompleted,
  savePreserved,
  ...cleanup,
  ...migration,
  solventKeeps,
  defaultDegrades,
};

const passed = nations.every(
  (result) => result.regions > 0 && result.coveredOnce
    && result.deterministic && result.regionsValid,
) && Object.values(functional).every(Boolean);
console.log(JSON.stringify({ nations, functional, passed }, null, 2));
if (!passed) process.exitCode = 1;
