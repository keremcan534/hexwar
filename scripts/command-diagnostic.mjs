// General ve cephe sistemlerini başsız doğrular: komutan ataması muharebe
// gücünü değiştiriyor mu, cepheye atanan ordular hat boyunca dağılıyor mu,
// taarruz planı hattı düşman toprağına doğru itiyor mu?
//
// Kullanım: node scripts/command-diagnostic.mjs [hafta]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { hexDistance } from '../src/core/hex.js';
import {
  MAX_SKILL, TRAITS, assignGeneral, generalModifier, generalOfArmy, generalsOf,
} from '../src/game/generals.js';
import {
  PLAN, assignArmy, createFront, frontOfArmy, runFronts, toggleExecution,
} from '../src/game/fronts.js';
import { declareWar } from '../src/game/diplomacy.js';

const weeks = Math.max(1, Number.parseInt(process.argv[2] ?? '60', 10));

function headlessGame(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, reachable: null, autosaveEnabled: false,
    listeners: {}, renderer: { invalidateCache() {} }, emit() {}, requestRender() {},
    autosave() {}, frontDraw: null, selectedFront: null,
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

const results = {};
const game = headlessGame('COMMAND');
const world = game.world;

// --- 1) Generaller kuruldu mu? ---
const staffs = world.nations.map((n) => generalsOf(n).length);
results.generalsSeeded = {
  nations: world.nations.length,
  min: Math.min(...staffs),
  max: Math.max(...staffs),
  traitsValid: world.nations.every((n) => generalsOf(n).every(
    (g) => g.traits.every((t) => TRAITS[t]) && g.skill >= 1 && g.skill <= MAX_SKILL,
  )),
};

// --- 2) Komutan ataması muharebe çarpanını değiştiriyor mu? ---
const nation = world.nations.find((n) => n.alive && world.units.some((u) => u.nationId === n.id));
const army = world.units.find((u) => u.nationId === nation.id);
const before = generalModifier(generalOfArmy(nation, army), { army });
const general = generalsOf(nation)[0];
assignGeneral(nation, general.id, army);
const after = generalModifier(generalOfArmy(nation, army), { army });
results.commanderAffectsCombat = {
  general: general.name,
  skill: general.skill,
  traits: general.traits,
  modifierBefore: Number(before.toFixed(3)),
  modifierAfter: Number(after.toFixed(3)),
  changed: after > before,
  oneGeneralPerArmy: generalsOf(nation).filter((g) => g.divisions.includes(army.id)).length === 1,
};

// --- 3) Cepheye atanan ordular hat boyunca dağılıyor mu? ---
// Ulusun kendi topraklarından bir hat çiz.
const own = [];
world.forEach((t) => { if (t.owner === nation.id && t.terrain.passable) own.push(t); });
own.sort((a, b) => a.q - b.q || a.r - b.r);
const line = own.filter((_, i) => i % 3 === 0).slice(0, 6);
const front = createFront(game, nation, line, PLAN.HOLD);
const myArmies = world.units.filter((u) => u.nationId === nation.id);
for (const unit of myArmies) assignArmy(world, front, unit);

const startDistance = myArmies.reduce((sum, u) => sum + Math.min(
  ...front.tiles.map((t) => hexDistance(u.tile.q, u.tile.r, t.q, t.r)),
), 0);
for (let i = 0; i < 12; i++) game.turns.endTurn();
const liveArmies = world.units.filter((u) => u.nationId === nation.id && front.armies.includes(u.id));
const endDistance = liveArmies.reduce((sum, u) => sum + Math.min(
  ...front.tiles.map((t) => hexDistance(u.tile.q, u.tile.r, t.q, t.r)),
), 0);
results.frontDistributesArmies = {
  frontTiles: front.tiles.length,
  armiesAssigned: front.armies.length,
  totalDistanceBefore: startDistance,
  totalDistanceAfter: endDistance,
  armiesMovedToLine: endDistance < startDistance || endDistance === 0,
  planningBuilt: Number((front.planning ?? 0).toFixed(2)),
  planningGrows: (front.planning ?? 0) > 0,
  armyBoundToOneFront: liveArmies.every((u) => frontOfArmy(world, u)?.id === front.id),
};

// --- 4) Taarruz planı hattı düşman toprağına itiyor mu? ---
const neighbourId = (() => {
  let best = null;
  world.forEach((t) => {
    if (best !== null || t.owner !== nation.id) return;
    for (const near of world.neighbors(t)) {
      if (near.owner >= 0 && near.owner !== nation.id) { best = near.owner; return; }
    }
  });
  return best;
})();

let advance = { skipped: 'no bordering nation found' };
if (neighbourId !== null) {
  declareWar(game, nation.id, neighbourId);
  // Sınır boyunca taarruz hattı kur.
  const border = [];
  world.forEach((t) => {
    if (t.owner !== nation.id || !t.terrain.passable) return;
    if (world.neighbors(t).some((n) => n.owner === neighbourId)) border.push(t);
  });
  const attackFront = createFront(game, nation, border.slice(0, 6), PLAN.ADVANCE);
  if (attackFront) {
    for (const unit of world.units.filter((u) => u.nationId === nation.id)) {
      assignArmy(world, attackFront, unit);
    }
    attackFront.planning = 1;
    toggleExecution(game, attackFront);
    const startTiles = attackFront.tiles.map((t) => `${t.q}:${t.r}`).join(',');
    let enemyTilesOnLine = 0;
    for (let i = 0; i < 10; i++) {
      runFronts(game);
      game.turns.turn++;
    }
    for (const point of attackFront.tiles) {
      const tile = world.get(point.q, point.r);
      if (tile && tile.owner !== nation.id) enemyTilesOnLine++;
    }
    advance = {
      target: world.nations[neighbourId].name,
      lineBefore: startTiles,
      lineAfter: attackFront.tiles.map((t) => `${t.q}:${t.r}`).join(','),
      lineMoved: startTiles !== attackFront.tiles.map((t) => `${t.q}:${t.r}`).join(','),
      tilesNowOnEnemySide: enemyTilesOnLine,
      lineLengthKept: attackFront.tiles.length === Math.min(6, border.length),
    };
  }
}
results.advancePlanPushesLine = advance;

// --- 5) Uzun koşuda bütünlük ---
for (let i = 0; i < weeks; i++) game.turns.endTurn();
const fronts = world.frontSystem.fronts;
results.integrity = {
  weeks: game.turns.turn,
  fronts: fronts.length,
  orphanArmyRefs: fronts.reduce((sum, f) => sum + f.armies.filter(
    (id) => !world.units.some((u) => u.id === id),
  ).length, 0),
  generalsOnDeadArmies: world.nations.reduce((sum, n) => sum + generalsOf(n).filter(
    (g) => g.divisions.some((id) => !world.units.some((u) => u.id === id)),
  ).length, 0),
  duplicateGeneralAssignments: world.nations.reduce((sum, n) => {
    const seen = new Set();
    let dupes = 0;
    for (const g of generalsOf(n)) {
      for (const id of g.divisions) {
        if (seen.has(id)) dupes++;
        seen.add(id);
      }
    }
    return sum + dupes;
  }, 0),
  armiesInTwoFronts: world.units.filter(
    (u) => fronts.filter((f) => f.armies.includes(u.id)).length > 1,
  ).length,
  promotedGenerals: world.nations.reduce(
    (sum, n) => sum + generalsOf(n).filter((g) => g.skill > 3).length, 0,
  ),
};

console.log(JSON.stringify(results, null, 2));
