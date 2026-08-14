// Dünya pazarı mal akışını ve ülke bazlı ithalat/ihracat muhasebesini doğrular.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { GOOD_IDS, IMPORT_ELASTICITY, settleGlobalTrade } from '../src/game/economy.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';

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

const game = headless('TRADE-DIAGNOSTIC');
for (let week = 0; week < 80; week++) game.turns.endTurn();

const alive = game.world.nations.filter((nation) => nation.alive);
const conservation = GOOD_IDS.map((id) => {
  const imports = alive.reduce((sum, nation) => sum + nation.economy.goodsFlow[id].imports, 0);
  const exports = alive.reduce((sum, nation) => sum + nation.economy.goodsFlow[id].exports, 0);
  return { id, imports, exports, difference: Math.abs(imports - exports) };
});
const flows = alive.flatMap((nation) => GOOD_IDS.map((id) => nation.economy.goodsFlow[id]));
const marketWorks = {
  finite: flows.every((flow) => Object.values(flow).every(Number.isFinite)),
  nonNegative: flows.every((flow) => [
    flow.production, flow.demand, flow.domestic, flow.imports,
    flow.exports, flow.fulfilled, flow.shortage,
  ].every((value) => value >= -1e-9)),
  fulfilledBounded: flows.every((flow) => flow.fulfilled <= flow.demand + 1e-7),
  conserved: conservation.every((row) => row.difference < 1e-7),
  pricesMoved: GOOD_IDS.some((id) => Math.abs(game.world.market.goods[id].trend) > 1e-5),
};

// Controlled two-country clearing: one producer, one consumer.
const controlled = headless('TRADE-CONTROLLED');
const [seller, buyer] = controlled.world.nations.filter((nation) => nation.alive);
for (const nation of controlled.world.nations) {
  if (!nation.alive) continue;
  for (const id of GOOD_IDS) {
    Object.assign(nation.economy.goodsFlow[id], {
      production: 0, demand: 0, retained: 0, domestic: 0,
      imports: 0, exports: 0, fulfilled: 0, shortage: 0, importShare: 0,
    });
  }
}
seller.economy.goodsFlow.food.production = 10;
buyer.economy.goodsFlow.food.demand = 6;
buyer.economy.tariff = 25;
const buyerGoldBefore = buyer.gold;
settleGlobalTrade(controlled.world);
const controlledFlow = {
  sellerExports: seller.economy.goodsFlow.food.exports,
  buyerImports: buyer.economy.goodsFlow.food.imports,
  buyerCoverage: buyer.economy.goodsFlow.food.fulfilled / buyer.economy.goodsFlow.food.demand,
  tariffRevenue: buyer.economy.tariffRevenue,
  treasuryDelta: buyer.gold - buyerGoldBefore,
};
// Tarife ithalat istahini kisar (bkz. economy.js IMPORT_ELASTICITY): %25
// gumruklu alici talebinin tamamini DEGIL, istah kadarini ithal eder.
// Eski beklenti "talep tam karsilanir" idi; korumacilik gercek bir kisinti
// yaratmaya baslayinca beklenti de ona gore guncellendi.
const appetite = 1 / (1 + (buyer.economy.tariff / 100) * IMPORT_ELASTICITY);
const expectedImports = 6 * appetite;
const controlledWorks = {
  exactQuantity: Math.abs(controlledFlow.sellerExports - expectedImports) < 1e-7
    && Math.abs(controlledFlow.buyerImports - expectedImports) < 1e-7,
  demandMet: Math.abs(controlledFlow.buyerCoverage - appetite) < 1e-7,
  tariffOnlyTreasuryFlow: controlledFlow.tariffRevenue > 0
    && Math.abs(controlledFlow.treasuryDelta - controlledFlow.tariffRevenue) < 1e-7,
};

const passed = [...Object.values(marketWorks), ...Object.values(controlledWorks)].every(Boolean);
console.log(JSON.stringify({
  turn: game.turns.turn,
  alive: alive.length,
  marketWorks,
  controlledWorks,
  controlledFlow,
  weeklyCrossBorderVolume: Number(conservation.reduce((sum, row) => sum + row.imports, 0).toFixed(2)),
  tradeBalances: alive.slice(0, 5).map((nation) => ({
    nation: nation.name,
    imports: Number(nation.economy.trade.importValue.toFixed(2)),
    exports: Number(nation.economy.trade.exportValue.toFixed(2)),
    balance: Number(nation.economy.trade.balance.toFixed(2)),
  })),
  passed,
}, null, 2));

if (!passed) process.exitCode = 1;
