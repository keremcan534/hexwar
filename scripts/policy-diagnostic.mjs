// Budget & Society politikalarının yalnız UI değil, simülasyon sonucu ürettiğini
// aynı seed'in kontrollü kopyalarında doğrular.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { setFiscalPolicy } from '../src/game/economy.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  game.selected = null;
  game.selectedUnit = null;
  game.reachable = null;
  game.buildingPlacement = null;
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

function configure(game, { tax, tariff, army }) {
  const nation = game.world.nations[0];
  for (const classId of ['lower', 'middle', 'upper']) {
    setFiscalPolicy(nation, 'tax', tax, classId);
  }
  setFiscalPolicy(nation, 'tariff', tariff);
  setFiscalPolicy(nation, 'armySpending', army);
}

function run(policy) {
  const game = headless('POLICY-CONTROL');
  configure(game, policy);
  for (let week = 0; week < 16; week++) game.turns.endTurn();
  const nation = game.world.nations[0];
  return {
    treasury: Number(nation.gold.toFixed(1)),
    weeklyTax: Number(nation.economy.taxRevenue.toFixed(2)),
    tariffRevenue: Number(nation.economy.tariffRevenue.toFixed(2)),
    stability: Number((nation.economy.stability * 100).toFixed(1)),
    lowerSatisfaction: Number((nation.economy.classes.lower.satisfaction * 100).toFixed(1)),
    standardOfLiving: Number(nation.economy.standardOfLiving.toFixed(2)),
    population: nation.economy.population,
    classes: Object.fromEntries(Object.entries(nation.economy.classes)
      .map(([id, socialClass]) => [id, socialClass.population])),
    armyGoldUpkeep: Number(nation.budget.upkeep.gold.toFixed(1)),
  };
}

const lowTax = run({ tax: 0, tariff: -25, army: 100 });
const highTax = run({ tax: 80, tariff: 50, army: 100 });
const lowArmy = run({ tax: 20, tariff: 10, army: 25 });
const baseline = run({ tax: 20, tariff: 10, army: 100 });
const assertions = {
  highTaxRaisesRevenue: highTax.weeklyTax > lowTax.weeklyTax,
  highTaxLowersSatisfaction: highTax.lowerSatisfaction < lowTax.lowerSatisfaction,
  highTaxLowersStability: highTax.stability < lowTax.stability,
  lowArmySpendingCutsUpkeep: lowArmy.armyGoldUpkeep < baseline.armyGoldUpkeep,
  highTaxDemotesPopulation: highTax.classes.lower > lowTax.classes.lower
    && highTax.classes.upper < lowTax.classes.upper,
};

console.log(JSON.stringify({
  lowTax,
  highTax,
  lowArmy,
  baseline,
  assertions,
  passed: Object.values(assertions).every(Boolean),
}, null, 2));

