// Province RGO, iş kapasitesi, askerî nüfus kaybı ve toplu göç doğrulaması.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  MIGRATION_COHORT, RGO_TYPES, provinceOutput, provincePopulation,
  provinceRgoJobs, provinceRgoStatus, runProvinceMigration,
} from '../src/game/provinces.js';
import { ensureMilitaryEconomy } from '../src/game/economy.js';
import { applyArmyLosses } from '../src/game/units.js';
import { disband, recruit } from '../src/game/recruitment.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
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
  game.turns.playerNation = -1;
  return game;
}

function owned(world, nationId) {
  return world.tiles.filter((tile) => tile.owner === nationId && tile.province);
}

function rawOutput(tiles) {
  return tiles.reduce((sum, tile) => {
    const out = provinceOutput(tile);
    return sum + out.food + out.timber + out.iron + out.coal;
  }, 0);
}

const first = headless('RGO-DETERMINISTIC');
const second = headless('RGO-DETERMINISTIC');
const firstRgos = first.world.tiles.filter((tile) => tile.province).map((tile) => tile.province.rgo);
const secondRgos = second.world.tiles.filter((tile) => tile.province).map((tile) => tile.province.rgo);
const land = first.world.tiles.filter((tile) => tile.province);
const rgoCounts = Object.fromEntries(Object.keys(RGO_TYPES).map((id) => [
  id, land.filter((tile) => tile.province.rgo === id).length,
]));
const uniqueOutput = land.every((tile) => {
  if (tile.owner < 0) return true;
  const output = provinceOutput(tile);
  return ['food', 'timber', 'iron', 'coal'].filter((id) => output[id] > 0).length === 1;
});
const startingUnit = first.world.units[0];
const startingDraws = startingUnit.regiments[0].draws.reduce(
  (sum, draw) => sum + draw.men, 0,
);
const startingNationPopulation = provincePopulation(first.world, startingUnit.nationId);
disband(first, startingUnit);
const startingPopulationReturned = provincePopulation(first.world, startingUnit.nationId)
  - startingNationPopulation;

const legacyArmyGame = headless('RGO-LEGACY-ARMY');
const legacyUnit = legacyArmyGame.world.units[0];
legacyUnit.regiments[0].draws = [];
const legacyPopulationBefore = provincePopulation(legacyArmyGame.world, legacyUnit.nationId);
disband(legacyArmyGame, legacyUnit);
const legacyPopulationAfter = provincePopulation(legacyArmyGame.world, legacyUnit.nationId);

const capacityTile = land.find((tile) => tile.owner >= 0);
capacityTile.province.control = 100;
capacityTile.province.population = provinceRgoJobs(capacityTile);
const fullOutput = rawOutput([capacityTile]);
capacityTile.province.population = Math.round(provinceRgoJobs(capacityTile) * 0.5);
const halfOutput = rawOutput([capacityTile]);

const armyGame = headless('RGO-ARMY-LINK');
const armyNation = armyGame.world.nations.find((nation) => nation.alive && owned(armyGame.world, nation.id).length > 8);
const armyTiles = owned(armyGame.world, armyNation.id);
for (const tile of armyTiles) tile.province.population = provinceRgoJobs(tile);
const military = ensureMilitaryEconomy(armyNation);
military.arms = 40;
const populationBeforeRecruitment = provincePopulation(armyGame.world, armyNation.id);
const outputBeforeRecruitment = rawOutput(armyTiles);
const recruited = recruit(armyGame, armyNation, 'INFANTRY');
const populationAfterRecruitment = provincePopulation(armyGame.world, armyNation.id);
const outputAfterRecruitment = rawOutput(armyTiles);
disband(armyGame, recruited);
const populationAfterPeacefulDisband = provincePopulation(armyGame.world, armyNation.id);

const lossGame = headless('RGO-CASUALTIES');
const lossNation = lossGame.world.nations.find((nation) => nation.alive && owned(lossGame.world, nation.id).length > 8);
const lossTiles = owned(lossGame.world, lossNation.id);
for (const tile of lossTiles) tile.province.population = provinceRgoJobs(tile);
ensureMilitaryEconomy(lossNation).arms = 40;
const populationBeforeLoss = provincePopulation(lossGame.world, lossNation.id);
const doomed = recruit(lossGame, lossNation, 'INFANTRY');
applyArmyLosses(doomed, 500, 0);
disband(lossGame, doomed);
const populationAfterLoss = provincePopulation(lossGame.world, lossNation.id);

const migrationGame = headless('RGO-MIGRATION');
const migrationNation = migrationGame.world.nations.find(
  (nation) => nation.alive && owned(migrationGame.world, nation.id).length >= 3,
);
const migrationTiles = owned(migrationGame.world, migrationNation.id);
for (const tile of migrationTiles) tile.province.population = provinceRgoJobs(tile);
const [donor, receiver] = migrationTiles;
donor.province.population = provinceRgoJobs(donor) + 2000;
receiver.province.population = Math.max(0, provinceRgoJobs(receiver) - 1500);
const populationBeforeMigration = provincePopulation(migrationGame.world, migrationNation.id);
const receiverEfficiencyBefore = provinceRgoStatus(receiver).efficiency;
const moved = runProvinceMigration(migrationGame.world, true);
const populationAfterMigration = provincePopulation(migrationGame.world, migrationNation.id);
const receiverEfficiencyAfter = provinceRgoStatus(receiver).efficiency;

const longGame = headless('RGO-LONG');
let observedMigration = 0;
const started = performance.now();
for (let week = 0; week < 260 && !longGame.turns.victory; week++) {
  longGame.turns.endTurn();
  observedMigration += longGame.world.nations.reduce(
    (sum, nation) => sum + (nation.economy?.internalMigration ?? 0), 0,
  );
}
const elapsedMs = performance.now() - started;
const longProvinces = longGame.world.tiles.filter((tile) => tile.province);

const assertions = {
  deterministic: firstRgos.every((id, index) => id === secondRgos[index]),
  exactlyOneRgo: land.every((tile) => Boolean(RGO_TYPES[tile.province.rgo])),
  allRgoTypesExist: Object.values(rgoCounts).every((count) => count > 0),
  onlyRgoProducesRawGood: uniqueOutput,
  startingArmyHasRealProvinceDraws: startingDraws > 0
    && Math.abs(startingPopulationReturned - startingDraws) < 1,
  legacyFreeArmyCannotCreatePopulation: legacyPopulationAfter === legacyPopulationBefore,
  halfWorkforceHalvesOutput: Math.abs(halfOutput / fullOutput - 0.5) < 0.02,
  recruitmentConsumesProvincePopulation: populationBeforeRecruitment - populationAfterRecruitment === 3000,
  underCapacityCutsProduction: outputAfterRecruitment < outputBeforeRecruitment,
  peacefulDisbandReturnsSurvivors: populationAfterPeacefulDisband === populationBeforeRecruitment,
  battleDeathsStayLost: populationBeforeLoss - populationAfterLoss === 1500,
  migrationUsesCohorts: moved >= MIGRATION_COHORT && moved % MIGRATION_COHORT === 0,
  migrationConservesPopulation: populationAfterMigration === populationBeforeMigration,
  migrationFillsVacancy: receiverEfficiencyAfter > receiverEfficiencyBefore
    && donor.province.migration < 0 && receiver.province.migration > 0,
  longRunPopulationValid: longProvinces.every((tile) => tile.province.population >= 0),
  longRunOutputFinite: longProvinces.every((tile) => (
    Object.values(provinceOutput(tile)).every(Number.isFinite)
  )),
  naturalMigrationObserved: observedMigration > 0,
};
const passed = Object.values(assertions).every(Boolean);
console.log(JSON.stringify({
  rgoCounts,
  capacity: {
    jobs: provinceRgoJobs(capacityTile),
    fullOutput: Number(fullOutput.toFixed(3)),
    halfOutput: Number(halfOutput.toFixed(3)),
  },
  army: {
    populationBeforeRecruitment,
    populationAfterRecruitment,
    outputLossPercent: Number(((1 - outputAfterRecruitment / outputBeforeRecruitment) * 100).toFixed(1)),
    populationAfterPeacefulDisband,
    permanentBattleLoss: populationBeforeLoss - populationAfterLoss,
  },
  migration: { moved, receiverEfficiencyBefore, receiverEfficiencyAfter },
  longRun: {
    weeks: longGame.turns.turn - 1,
    elapsedMs: Math.round(elapsedMs),
    observedMigration,
  },
  assertions,
  passed,
}, null, 2));
if (!passed) process.exitCode = 1;
