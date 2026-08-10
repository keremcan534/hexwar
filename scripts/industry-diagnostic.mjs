// Sanayilesmenin yuz yila (1836-1936) nasil yayildigini olcer. Zafer kontrolu
// kapatilir: amac kimin kazandigi degil, fabrikalarin ne zaman dolup ne zaman
// seviye atladigi. Kullanim: node scripts/industry-diagnostic.mjs [oyun] [seed]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { FINAL_TURN, hegemonyScore } from '../src/game/hegemony.js';
import { MAX_FACTORY_LEVEL, WORKERS_PER_LEVEL } from '../src/game/economy.js';

const gameCount = Math.max(1, Number.parseInt(process.argv[2] ?? '3', 10));
const seedPrefix = process.argv[3] ?? 'IND';
const CHECKPOINT = 520; // on yil

function headlessGame(seed) {
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

/** Sanayisi en buyuk ulkenin o andaki fotografi. */
function leaderSnapshot(world, turn) {
  const alive = world.nations.filter((nation) => nation.alive && nation.economy);
  if (!alive.length) return null;
  const leader = alive
    .map((nation) => ({
      nation,
      levels: nation.economy.factories.reduce((sum, factory) => sum + factory.level, 0),
    }))
    .sort((a, b) => b.levels - a.levels)[0].nation;
  const factories = leader.economy.factories;
  const employed = factories.reduce((sum, factory) => sum + factory.employees, 0);
  const jobs = factories.reduce((sum, factory) => sum + factory.level * WORKERS_PER_LEVEL, 0);
  const lower = leader.economy.classes.lower.population;
  return {
    year: 1836 + Math.floor((turn - 1) * 7 / 365),
    turn,
    nation: leader.name,
    factories: factories.length,
    levels: factories.reduce((sum, factory) => sum + factory.level, 0),
    maxedPlants: factories.filter((factory) => factory.level >= MAX_FACTORY_LEVEL).length,
    staffing: jobs ? `${Math.round((employed / jobs) * 100)}%` : '0%',
    workers: Math.round(employed),
    lowerClassShare: lower ? `${((employed / lower) * 100).toFixed(1)}%` : '0%',
    ...scoreBreakdown(world, leader),
    gold: Math.round(leader.gold),
  };
}

/**
 * Puanin hangi kalemden geldigi. "economy" tek basina yaniltici: icinde ham
 * uretim ile sanayi birlikte duruyor ve agirliklari cok farkli.
 */
function scoreBreakdown(world, nation) {
  const score = hegemonyScore(world, nation);
  const budget = nation.budget;
  const production = budget
    ? budget.production.gold + budget.production.food
      + budget.production.timber + budget.production.iron
    : 0;
  const industryPoints = score.economy - production * 1.2;
  const share = (value) => `${Math.round((value / Math.max(1, score.total)) * 100)}%`;
  return {
    score: score.total,
    industryShare: share(industryPoints),
    productionShare: share(production * 1.2),
    prestigeShare: share(score.prestige),
  };
}

const runs = [];
for (let index = 0; index < gameCount; index++) {
  const seed = `${seedPrefix}-${String(index).padStart(3, '0')}`;
  const game = headlessGame(seed);
  const timeline = [];
  for (let turn = 1; turn <= FINAL_TURN; turn++) {
    game.turns.endTurn();
    // Zafer bayragi kalksa da dongu surer; yuzyilin tamamini gormek istiyoruz.
    if (game.turns.turn % CHECKPOINT === 0) {
      const shot = leaderSnapshot(game.world, game.turns.turn);
      if (shot) timeline.push(shot);
    }
  }
  runs.push({ seed, timeline });
}

for (const run of runs) {
  console.log(`\n=== ${run.seed} ===`);
  console.table(run.timeline);
}
