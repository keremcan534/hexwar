import { constructionAtlas } from '../src/game/construction.js';
import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  buildFactory, canBuildFactory, ensureEconomy, ensureMilitaryEconomy, ensureProductionLine,
  equipmentStock, runEconomy, setMilitaryProductionLine,
} from '../src/game/economy.js';
import { deserialize, serialize } from '../src/game/save.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null,
    selectedUnit: null,
    selected_: [],
    activeGeneral: null,
    reachable: null,
    autosaveEnabled: false,
    listeners: {},
    renderer: { invalidateCache() {} },
    emit() {},
    requestRender() {},
    autosave() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

function makeReloadable(game) {
  game.newWorld = function newWorld(seed, options = {}) {
    this.world = generateWorld(seed, options);
    generateNations(this.world, {
      seed: `${seed}-nations`, count: options.nationCount ?? null,
    });
    this.selected = null;
    this.selectedUnit = null;
    this.selected_ = [];
    this.activeGeneral = null;
    this.turns.start(this.world);
    return this.world;
  };
  game.setSpeed = () => 0;
  return game;
}

const game = makeReloadable(headless('PRODUCTION-LINES'));
const city = game.world.cities[0];
const nation = game.world.nations[city.nationId];
game.turns.playerNation = nation.id;
nation.gold = 10000;

// Ulke kurulus silah fabrikasiyla basliyor ve bir state'te ayni turden tek
// tesis olur; yeni hat bu yuzden bos bir state'e kurulur.
const freeRegion = constructionAtlas(game.world, nation.id).regions.find(
  (region) => canBuildFactory(game.world, nation, region.id, 'ARMS_FACTORY'),
);
const built = buildFactory(game, nation, freeRegion.id, 'ARMS_FACTORY');
const factory = nation.economy.factories.find((item) => item.typeId === 'ARMS_FACTORY');
const defaultLine = ensureProductionLine(factory);
const defaultsToSmallArms = defaultLine.lineEquipment === 'arms';
const startsAtHalfEfficiency = defaultLine.lineEfficiency === 0.5;
const switched = setMilitaryProductionLine(game, nation, factory.id, 'artillery');
const artilleryBefore = equipmentStock(nation, 'artillery');
let totalArtilleryOutput = 0;
for (let week = 0; week < 8; week++) {
  runEconomy(game);
  totalArtilleryOutput += factory.lineOutput;
}
const artilleryAfter = equipmentStock(nation, 'artillery');
const efficiencyAfterProduction = factory.lineEfficiency;
const rawInputsFedProduction = factory.inputFulfillment > 0 && totalArtilleryOutput > 0;
const artilleryEquipmentSelected = factory.lineEquipment === 'artillery';

const save = serialize(game);
const loaded = deserialize(game, save);
ensureEconomy(game.world);
const loadedNation = game.world.nations[nation.id];
const loadedFactory = loadedNation.economy.factories.find((item) => item.id === factory.id);
const savedProductPreserved = loadedFactory.lineEquipment === 'artillery';

const switchedBack = setMilitaryProductionLine(
  game, loadedNation, loadedFactory.id, 'arms',
);

const oldSave = JSON.parse(JSON.stringify(save));
delete oldSave.nations[nation.id].economy.military.artillery;
delete oldSave.nations[nation.id].economy.military.artilleryProduced;
for (const item of oldSave.nations[nation.id].economy.factories) {
  delete item.lineEquipment;
  delete item.lineEfficiency;
  delete item.lineOutput;
}
delete oldSave.market.goods.artillery;
const oldLoaded = deserialize(game, oldSave);
ensureEconomy(game.world);
const migratedNation = game.world.nations[nation.id];
const migratedFactory = migratedNation.economy.factories.find(
  (item) => item.typeId === 'ARMS_FACTORY',
);

const results = {
  creation: {
    built,
    defaultsToSmallArms,
    startsAtHalfEfficiency,
  },
  artilleryLine: {
    switched,
    equipmentSelected: artilleryEquipmentSelected,
    efficiencyGrew: efficiencyAfterProduction > 0.5,
    outputCreated: totalArtilleryOutput > 0,
    rawInputsFedProduction,
    stockIncreased: artilleryAfter > artilleryBefore,
  },
  switching: {
    switchedBack,
    efficiencyReset: loadedFactory.lineEfficiency === 0.5,
    staleOutputCleared: loadedFactory.lineOutput === 0,
  },
  save: {
    loaded,
    productPreserved: savedProductPreserved,
    oldLoaded,
    oldFactoryMigrated: ensureProductionLine(migratedFactory).lineEquipment === 'arms',
    oldMarketMigrated: Boolean(game.world.market.goods.artillery),
    oldStockMigrated: ensureMilitaryEconomy(migratedNation).artillery === 6,
  },
};
results.passed = Object.values(results).every(
  (section) => Object.values(section).every(Boolean),
);

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
