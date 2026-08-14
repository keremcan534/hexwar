// Geç oyun altın tüketimini ölçer: idari gider, sosyal harcama, ordu
// modernizasyonu ve sanayi genişlemesi hazineyi gerçekten emiyor mu?
// Kullanım: node scripts/sink-diagnostic.mjs [oyun sayısı] [seed öneki] [hafta]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { SOCIAL_PROGRAMS, socialSpendingCost } from '../src/game/economy.js';
import { regimentCount } from '../src/game/units.js';

const gameCount = Math.max(1, Number.parseInt(process.argv[2] ?? '4', 10));
const seedPrefix = process.argv[3] ?? 'SINK';
const weeks = Math.max(1, Number.parseInt(process.argv[4] ?? '250', 10));

function headlessGame(seed) {
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

function snapshot(world, nation) {
  const factories = nation.economy?.factories ?? [];
  return {
    name: nation.name,
    gold: Math.round(nation.gold),
    cities: nation.budget?.cities ?? 0,
    provinces: nation.budget?.provinces ?? 0,
    administration: Number((nation.budget?.administration ?? 0).toFixed(1)),
    armyGold: Number((nation.budget?.armyGold ?? 0).toFixed(1)),
    socialCost: Number(socialSpendingCost(nation).toFixed(1)),
    social: { ...nation.economy.social },
    stability: Math.round((nation.economy?.stability ?? 0) * 100),
    factories: factories.length,
    factoryLevels: factories.reduce((sum, factory) => sum + factory.level, 0),
    netGold: Math.round(nation.budget?.net?.gold ?? 0),
  };
}

const rows = [];
for (let index = 0; index < gameCount; index++) {
  const seed = `${seedPrefix}-${String(index + 1).padStart(3, '0')}`;
  const game = headlessGame(seed);
  let peakGold = 0;
  while (!game.turns.victory && game.turns.turn < weeks) {
    game.turns.endTurn();
    for (const nation of game.world.nations) {
      if (nation.alive) peakGold = Math.max(peakGold, nation.gold);
    }
  }
  const alive = game.world.nations.filter((nation) => nation.alive);
  const richest = alive.reduce((best, n) => (!best || n.gold > best.gold ? n : best), null);
  rows.push({
    seed,
    week: game.turns.turn,
    peakGold: Math.round(peakGold),
    richest: richest ? snapshot(game.world, richest) : null,
    totalRegiments: game.world.units.reduce((sum, u) => sum + regimentCount(u), 0),
    socialSpenders: alive.filter(
      (n) => Object.keys(SOCIAL_PROGRAMS).some((id) => (n.economy.social[id] ?? 0) > 0),
    ).length,
    aliveNations: alive.length,
  });
}

console.log(JSON.stringify({
  weeks,
  peakGold: {
    max: Math.max(...rows.map((row) => row.peakGold)),
    mean: Math.round(rows.reduce((sum, row) => sum + row.peakGold, 0) / rows.length),
  },
  games: rows,
}, null, 2));
