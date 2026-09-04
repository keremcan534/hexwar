// Strength/organization ayrimi ve HOI tarzi geri cekilme davranisi.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  battleAt, runBattles, startBattle,
} from '../src/game/battles.js';
import {
  createUnit, organizationOf, soldiersOf, strengthRatio,
} from '../src/game/units.js';
import { declareWarNow } from '../src/game/diplomacy.js';

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

function scenario(seed, connectedRetreat) {
  const game = headless(seed);
  const { world } = game;
  const attackerNation = world.nations[0];
  const defenderNation = world.nations[1];
  const target = world.tiles.find((tile) => {
    if (!tile.terrain.passable) return false;
    return world.neighbors(tile).filter((near) => near.terrain.passable).some((approach) => (
      world.neighbors(approach).filter((near) => near !== tile && near.terrain.passable).length >= 2
    ));
  });
  const approach = world.neighbors(target).find((tile) => (
    tile.terrain.passable
    && world.neighbors(tile).filter((near) => near !== target && near.terrain.passable).length >= 2
  ));

  for (const tile of world.tiles) {
    tile.units = [];
    tile.unit = null;
    if (tile.terrain.passable) {
      tile.owner = defenderNation.id;
      tile.controller = defenderNation.id;
    }
  }
  world.units = [];
  approach.owner = attackerNation.id;
  approach.controller = attackerNation.id;
  if (connectedRetreat) {
    const queue = [{ tile: approach, depth: 0 }];
    const seen = new Set([approach, target]);
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head];
      current.tile.owner = attackerNation.id;
      current.tile.controller = attackerNation.id;
      if (current.depth >= 3) continue;
      for (const near of world.neighbors(current.tile)) {
        if (seen.has(near) || !near.terrain.passable) continue;
        seen.add(near);
        queue.push({ tile: near, depth: current.depth + 1 });
      }
    }
  }
  target.owner = defenderNation.id;
  target.controller = defenderNation.id;

  const attacker = createUnit('INFANTRY', attackerNation.id, approach, attackerNation);
  const defender = createUnit('INFANTRY', defenderNation.id, target, defenderNation);
  world.units.push(attacker, defender);
  declareWarNow(game, attackerNation.id, defenderNation.id);
  game.turns.turn = 10;
  const started = startBattle(game, attacker, target);
  let rounds = 0;
  while (battleAt(world, target) && rounds < 25) {
    game.turns.turn++;
    runBattles(game);
    rounds++;
  }
  return { game, world, target, attacker, defender, started, rounds };
}

const openLine = scenario('COMBAT-ORG-RETREAT', true);
const encircled = scenario('COMBAT-ORG-SURRENDER', false);
const openSurvivor = openLine.world.units.includes(openLine.attacker)
  ? openLine.attacker : openLine.defender;

const results = {
  explicitStats: {
    regimentHasStrength: Number.isFinite(openSurvivor?.regiments?.[0]?.strength),
    regimentHasOrganization: Number.isFinite(openSurvivor?.regiments?.[0]?.organization),
    divisionOrganizationDerived: Number.isFinite(organizationOf(openSurvivor)),
    divisionStrengthDerived: strengthRatio(openSurvivor) > 0 && strengthRatio(openSurvivor) <= 1,
  },
  normalDefeat: {
    battleStarted: openLine.started,
    battleResolved: !battleAt(openLine.world, openLine.target),
    divisionSurvived: openLine.world.units.includes(openLine.attacker),
    retreatRecorded: Boolean(openLine.attacker.lastRetreat),
    manpowerRemained: soldiersOf(openLine.attacker) > 450,
    strengthWasDamaged: strengthRatio(openLine.attacker) < 0.9,
    organizationBrokeFirst: organizationOf(openLine.attacker) <= 15,
    didNotSurrender: !openLine.game.turns.log.some((line) => line.includes('surrendered')),
  },
  encirclementException: {
    battleStarted: encircled.started,
    noRouteMeansDestroyed: !encircled.world.units.includes(encircled.attacker),
    surrenderLogged: encircled.game.turns.log.some((line) => line.includes('surrendered')),
  },
};
results.passed = Object.values(results).filter((value) => typeof value === 'object')
  .every((section) => Object.values(section).every(Boolean));

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
