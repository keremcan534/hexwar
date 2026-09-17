// Province RGO, iş kapasitesi, askerî nüfus kaybı ve toplu göç doğrulaması.
// Hex kaynakları (2026-09): her hex kendi kaynağını taşır, küme satırlarının
// toplamını üretir; RGO yalnız alt sınıf iş gücünü çalıştırır.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  MIGRATION_COHORT, RGO_TYPES, depositsOf, provinceOutput, provincePopulation,
  provinceRgoJobs, provinceRgoStatus, provinceSoldiers, runProvinceMigration,
} from '../src/game/provinces.js';
import { ensureMilitaryEconomy } from '../src/game/economy.js';
import { UNIT_TYPES, applyArmyLosses } from '../src/game/units.js';
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
  game.renderer = { invalidateCache() {}, invalidateTiles() {} };
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

/** Karelerin ait oldugu kume kayitlari, tekrarsiz. */
function clustersOf(world, tiles) {
  const seen = new Set();
  const out = [];
  for (const tile of tiles) {
    const cluster = world.provinces?.[tile.provinceId];
    if (!cluster?.econ || seen.has(cluster.id)) continue;
    seen.add(cluster.id);
    out.push(cluster);
  }
  return out;
}

const RAW_GOODS = new Set(Object.values(RGO_TYPES).map((type) => type.goodId));

/** Kumelerin butun ham mal ciktisi (altin haric); kume basina BIR kez. */
function rawOutput(world, tiles) {
  return clustersOf(world, tiles).reduce((sum, cluster) => {
    const output = provinceOutput(world, cluster);
    let raw = 0;
    for (const [id, value] of Object.entries(output)) if (RAW_GOODS.has(id)) raw += value;
    return sum + raw;
  }, 0);
}

/**
 * Kumenin iş gücünü kadronun `fraction` katina ayarlar: fabrika, banliyö ve
 * asker sifirlanir, nufus alt sinif payina bolunur (RGO yalniz onu calistirir).
 */
function fillToJobs(tile, fraction = 1, extraWorkers = 0) {
  const econ = tile.province;
  econ.industrialEmployees = 0;
  econ.industrialCommuters = 0;
  econ.soldiers = 0;
  econ.population = Math.round((provinceRgoJobs(tile) * fraction + extraWorkers) / econ.lowerShare);
}

const first = headless('RGO-DETERMINISTIC');
const second = headless('RGO-DETERMINISTIC');
const firstResources = first.world.tiles.filter((tile) => tile.province).map((tile) => tile.resource);
const secondResources = second.world.tiles.filter((tile) => tile.province).map((tile) => tile.resource);
const land = first.world.tiles.filter((tile) => tile.province);
const rgoCounts = Object.fromEntries(Object.keys(RGO_TYPES).map((id) => [
  id, land.filter((tile) => tile.resource === id).length,
]));
// Kume YALNIZ kendi satirlarinin mallarini uretir.
const outputMatchesDeposits = first.world.provinces.every((cluster) => {
  if (cluster.owner < 0 || !cluster.econ) return true;
  const allowed = new Set(depositsOf(cluster.econ).map((line) => RGO_TYPES[line.id].goodId));
  const output = provinceOutput(first.world, cluster);
  return Object.entries(output).every(([id, value]) => id === 'gold' || !(value > 0) || allowed.has(id));
});
const depositsSumToHexes = first.world.provinces.every((cluster) => (
  !cluster.econ || depositsOf(cluster.econ).reduce((sum, line) => sum + line.hexes, 0) === cluster.tileIdx.length
));
// Kurulus ordusunun adami gercek kumelerden gelir (turn.js: depo bitince
// techizatsiz recruit). Bedava tumen kalirsa olumu nufustan bir sey goturmez.
const startingRegiments = first.world.units.flatMap((unit) => unit.regiments ?? []);
const startingDrawnShare = startingRegiments.filter((regiment) => regiment.draws?.length).length
  / Math.max(1, startingRegiments.length);
const startingUnit = first.world.units.find((unit) => unit.regiments?.[0]?.draws?.length) ?? first.world.units[0];
const startingDraws = startingUnit.regiments[0].draws.reduce(
  (sum, draw) => sum + draw.men, 0,
);
const startingNationPopulation = provincePopulation(first.world, startingUnit.nationId);
const startingSoldiers = provinceSoldiers(first.world, startingUnit.nationId);
disband(first, startingUnit);
// Asker nufusun ICINDE durur (bkz. provinces.claimSoldiers): terhis nufusu
// artirmaz, yalniz asker kaydini birakir.
const startingPopulationReturned = provincePopulation(first.world, startingUnit.nationId)
  - startingNationPopulation;
const startingSoldiersReleased = startingSoldiers - provinceSoldiers(first.world, startingUnit.nationId);

const legacyArmyGame = headless('RGO-LEGACY-ARMY');
const legacyUnit = legacyArmyGame.world.units[0];
legacyUnit.regiments[0].draws = [];
const legacyPopulationBefore = provincePopulation(legacyArmyGame.world, legacyUnit.nationId);
disband(legacyArmyGame, legacyUnit);
const legacyPopulationAfter = provincePopulation(legacyArmyGame.world, legacyUnit.nationId);

const capacityTile = land.find((tile) => tile.owner >= 0);
capacityTile.province.control = 100;
fillToJobs(capacityTile, 1);
const fullOutput = rawOutput(first.world, [capacityTile]);
fillToJobs(capacityTile, 0.5);
const halfOutput = rawOutput(first.world, [capacityTile]);

const armyGame = headless('RGO-ARMY-LINK');
const armyNation = armyGame.world.nations.find((nation) => nation.alive && owned(armyGame.world, nation.id).length > 8);
const armyTiles = owned(armyGame.world, armyNation.id);
for (const tile of armyTiles) fillToJobs(tile, 1);
const military = ensureMilitaryEconomy(armyNation);
military.arms = 40;
const populationBeforeRecruitment = provincePopulation(armyGame.world, armyNation.id);
const soldiersBeforeRecruitment = provinceSoldiers(armyGame.world, armyNation.id);
const outputBeforeRecruitment = rawOutput(armyGame.world, armyTiles);
const recruited = recruit(armyGame, armyNation, 'INFANTRY');
const populationAfterRecruitment = provincePopulation(armyGame.world, armyNation.id);
const soldiersAfterRecruitment = provinceSoldiers(armyGame.world, armyNation.id);
const outputAfterRecruitment = rawOutput(armyGame.world, armyTiles);
disband(armyGame, recruited);
const populationAfterPeacefulDisband = provincePopulation(armyGame.world, armyNation.id);

const lossGame = headless('RGO-CASUALTIES');
const lossNation = lossGame.world.nations.find((nation) => nation.alive && owned(lossGame.world, nation.id).length > 8);
const lossTiles = owned(lossGame.world, lossNation.id);
for (const tile of lossTiles) fillToJobs(tile, 1);
ensureMilitaryEconomy(lossNation).arms = 40;
const populationBeforeLoss = provincePopulation(lossGame.world, lossNation.id);
const soldiersBeforeLoss = provinceSoldiers(lossGame.world, lossNation.id);
const doomed = recruit(lossGame, lossNation, 'INFANTRY');
// world verilmezse kayip kumeye yazilmaz ve asker hayalet kalir (units.js).
applyArmyLosses(doomed, 500, 0, lossGame.world);
disband(lossGame, doomed);
const populationAfterLoss = provincePopulation(lossGame.world, lossNation.id);
const soldiersAfterLoss = provinceSoldiers(lossGame.world, lossNation.id);

const migrationGame = headless('RGO-MIGRATION');
const migrationNation = migrationGame.world.nations.find(
  (nation) => nation.alive && owned(migrationGame.world, nation.id).length >= 3,
);
const migrationTiles = owned(migrationGame.world, migrationNation.id);
for (const tile of migrationTiles) fillToJobs(tile, 1);
// Verici ile alici FARKLI kumelerden secilmeli: ayni kumenin iki uyesi ayni
// havuzu paylasir, kume kendi kendine goc edemez.
const donor = migrationTiles[0];
const receiver = migrationTiles.find((tile) => tile.provinceId !== donor.provinceId);
fillToJobs(donor, 1, 2000);
fillToJobs(receiver, 1, -1500);
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
const longProvinces = longGame.world.provinces.filter((province) => province.econ);

const assertions = {
  deterministic: firstResources.every((id, index) => id === secondResources[index]),
  everyHexHasResource: land.every((tile) => Boolean(RGO_TYPES[tile.resource])),
  allRgoTypesExist: Object.values(rgoCounts).every((count) => count > 0),
  outputMatchesDeposits,
  depositsSumToHexes,
  startingArmyHasRealProvinceDraws: startingDraws > 0 && startingPopulationReturned === 0
    && Math.abs(startingSoldiersReleased - startingDraws) < 1,
  startingArmyMostlyDrawn: startingDrawnShare >= 0.85,
  legacyFreeArmyCannotCreatePopulation: legacyPopulationAfter === legacyPopulationBefore,
  halfWorkforceHalvesOutput: Math.abs(halfOutput / fullOutput - 0.5) < 0.02,
  recruitmentConsumesProvincePopulation: populationAfterRecruitment === populationBeforeRecruitment
    && soldiersAfterRecruitment - soldiersBeforeRecruitment === UNIT_TYPES.INFANTRY.manpower,
  underCapacityCutsProduction: outputAfterRecruitment < outputBeforeRecruitment,
  peacefulDisbandReturnsSurvivors: populationAfterPeacefulDisband === populationBeforeRecruitment,
  battleDeathsStayLost: populationBeforeLoss - populationAfterLoss === UNIT_TYPES.INFANTRY.manpower / 2
    && soldiersAfterLoss === soldiersBeforeLoss,
  migrationUsesCohorts: moved >= MIGRATION_COHORT && moved % MIGRATION_COHORT === 0,
  migrationConservesPopulation: populationAfterMigration === populationBeforeMigration,
  migrationFillsVacancy: receiverEfficiencyAfter > receiverEfficiencyBefore
    && donor.province.migration < 0 && receiver.province.migration > 0,
  longRunPopulationValid: longProvinces.every((province) => province.econ.population >= 0),
  longRunOutputFinite: longProvinces.every((province) => (
    Object.values(provinceOutput(longGame.world, province)).every(Number.isFinite)
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
    startingDrawnShare: Number(startingDrawnShare.toFixed(3)),
    startingRegiments: startingRegiments.length,
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
