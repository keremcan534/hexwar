import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { ensureEconomy, ensureMilitaryEconomy } from '../src/game/economy.js';
import {
  RECRUITMENT_ARMS, RECRUITMENT_EQUIPMENT, PROVINCE_POPULATION_FLOOR,
  disband, nationManpower, recruit,
} from '../src/game/recruitment.js';
import {
  equipmentLogistics, reinforcementNeed, runReinforcements,
} from '../src/game/reinforcement.js';
import { UNIT_TYPES, applyArmyLosses, refreshArmy, soldiersOf } from '../src/game/units.js';
import { provinceSoldiers } from '../src/game/provinces.js';

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
    renderer: { invalidateCache() {}, invalidateTiles() {} },
    emit() {},
    requestRender() {},
    autosave() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

function damagedUnit(game, loss = 120) {
  const unit = game.world.units.find((candidate) => (
    candidate.type.domain === 'land' && candidate.regiments?.length
  ));
  unit.regiments[0].strength -= loss;
  refreshArmy(unit);
  return unit;
}

const normalGame = headless('REINFORCEMENT-NORMAL');
const normalUnit = damagedUnit(normalGame);
const normalNation = normalGame.world.nations[normalUnit.nationId];
const normalMilitary = ensureMilitaryEconomy(normalNation);
normalMilitary.arms = 2;
const normalNeed = reinforcementNeed(normalGame.world, normalNation);
const normalStrengthBefore = soldiersOf(normalUnit);
const normalManpowerBefore = nationManpower(normalGame.world, normalNation.id);
const normalArmsBefore = normalMilitary.arms;
runReinforcements(normalGame);

const noArmsGame = headless('REINFORCEMENT-NO-ARMS');
const noArmsUnit = damagedUnit(noArmsGame);
const noArmsMilitary = ensureMilitaryEconomy(
  noArmsGame.world.nations[noArmsUnit.nationId],
);
noArmsMilitary.arms = 0;
const noArmsBefore = soldiersOf(noArmsUnit);
runReinforcements(noArmsGame);

const noMenGame = headless('REINFORCEMENT-NO-MEN');
const noMenUnit = damagedUnit(noMenGame);
const noMenNation = noMenGame.world.nations[noMenUnit.nationId];
noMenGame.world.forEach((tile) => {
  if (tile.owner === noMenNation.id && tile.province) {
    tile.province.population = PROVINCE_POPULATION_FLOOR;
  }
});
ensureMilitaryEconomy(noMenNation).arms = 10;
const noMenBefore = soldiersOf(noMenUnit);
runReinforcements(noMenGame);

const lockedGame = headless('REINFORCEMENT-LOCKED');
const lockedUnit = damagedUnit(lockedGame);
ensureMilitaryEconomy(lockedGame.world.nations[lockedUnit.nationId]).arms = 10;
lockedUnit.battleId = 999;
const lockedBefore = soldiersOf(lockedUnit);
runReinforcements(lockedGame);

const logisticsGame = headless('REINFORCEMENT-LOGISTICS');
const logisticsUnit = damagedUnit(logisticsGame, 500);
const logisticsMilitary = ensureMilitaryEconomy(
  logisticsGame.world.nations[logisticsUnit.nationId],
);
Object.assign(logisticsMilitary, {
  arms: 0,
  armsProducedAverage: 0.35,
  armsImportedAverage: 0.35,
  armsSupplyAverage: 0.7,
  armsAverageSamples: 4,
});
const logisticsLine = equipmentLogistics(
  logisticsGame.world,
  logisticsGame.world.nations[logisticsUnit.nationId],
)[0];

const artilleryGame = headless('REINFORCEMENT-ARTILLERY');
for (const tile of artilleryGame.world.tiles) {
  tile.units = [];
  tile.unit = null;
}
artilleryGame.world.units = [];
const artilleryNation = artilleryGame.world.nations.find(
  (nation) => nationManpower(artilleryGame.world, nation.id) >= 1500,
);
const artilleryMilitary = ensureMilitaryEconomy(artilleryNation);
artilleryMilitary.arms = 10;
artilleryMilitary.artillery = 10;
const artilleryArmsBeforeRecruit = artilleryMilitary.arms;
const artilleryStockBeforeRecruit = artilleryMilitary.artillery;
const artilleryUnit = recruit(artilleryGame, artilleryNation, 'ARTILLERY');
const artilleryArmsAfterRecruit = artilleryMilitary.arms;
const artilleryStockAfterRecruit = artilleryMilitary.artillery;
applyArmyLosses(artilleryUnit, 120, 0, artilleryGame.world);
const damagedArtilleryStrength = soldiersOf(artilleryUnit);
artilleryMilitary.artillery = 0;
runReinforcements(artilleryGame);
const blockedWithoutArtillery = soldiersOf(artilleryUnit) === damagedArtilleryStrength;
artilleryMilitary.artillery = 10;
artilleryMilitary.arms = 0;
runReinforcements(artilleryGame);
const blockedWithoutSmallArms = soldiersOf(artilleryUnit) === damagedArtilleryStrength;
artilleryMilitary.arms = 10;
const armsBeforeArtilleryReinforcement = artilleryMilitary.arms;
const gunsBeforeArtilleryReinforcement = artilleryMilitary.artillery;
runReinforcements(artilleryGame);

const recruitGame = headless('REINFORCEMENT-RECRUIT');
const recruitWorld = recruitGame.world;
for (const tile of recruitWorld.tiles) {
  tile.units = [];
  tile.unit = null;
}
recruitWorld.units = [];
const recruitNation = recruitWorld.nations.find(
  (nation) => nationManpower(recruitWorld, nation.id) >= 3000,
);
const recruitMilitary = ensureMilitaryEconomy(recruitNation);
recruitMilitary.arms = 10;
const recruitArmsBefore = recruitMilitary.arms;
const recruitMenBefore = nationManpower(recruitWorld, recruitNation.id);
// Odenen bedel ASKER KAYDIDIR: asker nufusun icinde durur (0e180a5), tarladan
// ve insan gucu havuzundan duser. Eski olcu nufusun 3000 dusmesini bekliyordu —
// hem eski model hem nufus olcegi (x10) oncesi.
const recruitSoldiersBefore = provinceSoldiers(recruitWorld, recruitNation.id);
const recruited = recruit(recruitGame, recruitNation, 'INFANTRY');
const menClaimed = provinceSoldiers(recruitWorld, recruitNation.id) - recruitSoldiersBefore
  === UNIT_TYPES.INFANTRY.manpower;
const armsPaid = recruitMilitary.arms <= recruitArmsBefore - RECRUITMENT_ARMS.INFANTRY;

// world verilmezse kayip kumeye yazilmaz: asker hayalet kalir, olum nufustan
// dusmez ve asagidaki olcu yanlis sebeple gecer.
applyArmyLosses(recruited, 100, 0, recruitWorld);
runReinforcements(recruitGame);
disband(recruitGame, recruited);
const casualtiesStayedLost = nationManpower(recruitWorld, recruitNation.id) < recruitMenBefore;

delete recruitNation.economy.military;
ensureEconomy(recruitWorld);

const results = {
  normal: {
    demandDetected: normalNeed.strength >= 120,
    gainedStrength: soldiersOf(normalUnit) > normalStrengthBefore,
    consumedPopulation: nationManpower(normalGame.world, normalNation.id) < normalManpowerBefore,
    consumedArms: normalMilitary.arms < normalArmsBefore,
    weeklyStatsRecorded: normalMilitary.reinforced > 0
      && normalMilitary.manpowerUsed > 0 && normalMilitary.armsUsed > 0,
  },
  shortages: {
    noArmsMeansNoStrength: soldiersOf(noArmsUnit) === noArmsBefore,
    noManpowerMeansNoStrength: soldiersOf(noMenUnit) === noMenBefore,
    activeBattleMeansNoReinforcement: soldiersOf(lockedUnit) === lockedBefore,
  },
  logistics: {
    shortageDetected: logisticsLine.balance < 0,
    dailyProductionDerivedFromWeeklyAverage:
      Math.abs(logisticsLine.producedPerDay - 0.05) < 1e-9,
    importsIncludedInSupply: Math.abs(logisticsLine.supplyPerDay - 0.1) < 1e-9,
    finiteClosureEstimate: Number.isFinite(logisticsLine.etaDays)
      && logisticsLine.etaDays > 0,
  },
  artilleryEquipment: {
    unitCreated: Boolean(artilleryUnit),
    recruitmentUsedSmallArms: artilleryArmsBeforeRecruit - artilleryArmsAfterRecruit
      >= RECRUITMENT_EQUIPMENT.ARTILLERY.arms,
    recruitmentUsedArtillery: artilleryStockBeforeRecruit - artilleryStockAfterRecruit
      >= RECRUITMENT_EQUIPMENT.ARTILLERY.artillery,
    blockedWithoutArtillery,
    blockedWithoutSmallArms,
    bothStocksConsumedForReinforcement: artilleryMilitary.arms < armsBeforeArtilleryReinforcement
      && artilleryMilitary.artillery < gunsBeforeArtilleryReinforcement,
    strengthRestored: soldiersOf(artilleryUnit) > damagedArtilleryStrength,
  },
  recruitment: {
    unitCreated: Boolean(recruited),
    menClaimed,
    armsPaid,
    casualtiesStayedLostAfterReinforcementAndDisband: casualtiesStayedLost,
    oldSaveGetsMilitaryDefaults: recruitNation.economy.military.arms === 16,
  },
};
results.passed = Object.values(results).every(
  (section) => Object.values(section).every(Boolean),
);

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
