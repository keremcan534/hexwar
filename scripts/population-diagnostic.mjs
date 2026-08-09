import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  CLASS_PROFESSIONS, POPULATION_COHORT, PROFESSION_INFO, ensurePopulationModel,
  runPopulationMobility,
} from '../src/game/economy.js';

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
  return game;
}

const game = headless('POPULATION-COHORTS');
const nation = game.world.nations[0];
const counts = ensurePopulationModel(nation);
const initialExactPopulation = nation.economy.population;
const tracked = Object.values(counts).reduce((sum, value) => sum + value, 0);
const classTotal = Object.values(nation.economy.classes)
  .reduce((sum, socialClass) => sum + socialClass.population, 0);
const professionClassesValid = Object.entries(CLASS_PROFESSIONS).every(([classId, ids]) => (
  ids.every((id) => PROFESSION_INFO[id].classId === classId)
));
const legacyGame = headless('POPULATION-LEGACY');
const legacyNation = legacyGame.world.nations[0];
delete legacyNation.economy.professionCounts;
delete legacyNation.economy.cohortPopulation;
delete legacyNation.economy.mobility;
const migratedLegacy = ensurePopulationModel(legacyNation);
const legacyMigrationValid = Object.values(migratedLegacy).reduce((sum, value) => sum + value, 0) > 0
  && Object.values(migratedLegacy).every((value) => value % POPULATION_COHORT === 0);

const upperBefore = nation.economy.classes.upper.population;
const middleBeforeUpperDemotion = nation.economy.classes.middle.population;
nation.economy.classes.upper.canAffordNeeds = false;
nation.economy.classes.upper.hardshipWeeks = 3;
nation.economy.classes.middle.canAffordNeeds = true;
runPopulationMobility(nation, 4);
const upperDemoted = nation.economy.classes.upper.population === upperBefore - POPULATION_COHORT
  && nation.economy.classes.middle.population === middleBeforeUpperDemotion + POPULATION_COHORT;

const middleBefore = nation.economy.classes.middle.population;
const lowerBefore = nation.economy.classes.lower.population;
nation.economy.classes.upper.canAffordNeeds = true;
nation.economy.classes.middle.canAffordNeeds = false;
nation.economy.classes.middle.hardshipWeeks = 3;
runPopulationMobility(nation, 8);
const middleDemoted = nation.economy.classes.middle.population === middleBefore - POPULATION_COHORT
  && nation.economy.classes.lower.population === lowerBefore + POPULATION_COHORT;

for (let week = 0; week < 80; week++) game.turns.endTurn();
const living = game.world.nations.filter((candidate) => candidate.alive);
const longRunValid = living.every((candidate) => {
  const professionCounts = ensurePopulationModel(candidate);
  const sum = Object.values(professionCounts).reduce((total, value) => total + value, 0);
  return sum > 0 && Object.values(professionCounts).every(
    (value) => value >= 0 && value % POPULATION_COHORT === 0,
  );
});
const upperShares = living.map((candidate) => (
  candidate.economy.classes.upper.population / Math.max(1, candidate.economy.cohortPopulation)
));

const results = {
  aggregation: {
    onlyAggregateProfessionTotals: !Array.isArray(nation.economy.professionCounts),
    eightProfessionCounters: Object.keys(counts).length === Object.keys(PROFESSION_INFO).length,
    cohortMultiples: Object.values(counts).every((value) => value % POPULATION_COHORT === 0),
    classTotalsMatchCohorts: tracked === classTotal,
    exactPopulationRemainderBelowCohort: Math.abs(initialExactPopulation - tracked) < POPULATION_COHORT,
    professionClassesValid,
    legacySaveMigration: legacyMigrationValid,
  },
  mobility: {
    upperDemotedByOneCohort: upperDemoted,
    middleDemotedByOneCohort: middleDemoted,
    cohortSize: POPULATION_COHORT,
  },
  longRun: {
    weeks: 80,
    livingNations: living.length,
    validAggregates: longRunValid,
    meanUpperShare: Number((upperShares.reduce((sum, value) => sum + value, 0)
      / Math.max(1, upperShares.length) * 100).toFixed(1)),
    zeroUpperClasses: upperShares.filter((value) => value === 0).length,
  },
};
results.passed = Object.entries(results)
  .filter(([key]) => key !== 'mobility' && key !== 'longRun')
  .every(([, section]) => Object.values(section).every(Boolean))
  && upperDemoted && middleDemoted && longRunValid;

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
