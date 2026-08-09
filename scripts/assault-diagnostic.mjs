// Ortak taarruzun gercek katilimci, combat width, plan/cadence ve oyuncu
// kontrollerini headless olarak dogrular.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  STANCE, assignDivisions, generalsOf, runCommand,
} from '../src/game/command.js';
import {
  MAX_ASSAULT_DIVISIONS, battleAt, startBattle,
} from '../src/game/battles.js';
import { createUnit, placeUnit } from '../src/game/units.js';
import { advanceMovement, destinationOf, orderMove } from '../src/game/movement.js';
import { declareWar } from '../src/game/diplomacy.js';
import { hexDistance } from '../src/core/hex.js';

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
    renderer: { invalidateCache() {} },
    emit() {},
    requestRender() {},
    autosave() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

function assaultScenario(seed, planning = 0.5) {
  const game = headless(seed);
  const world = game.world;
  const target = world.tiles.find((tile) => (
    tile.terrain.passable
    && world.neighbors(tile).filter((near) => near.terrain.passable).length >= 3
  ));
  const approaches = world.neighbors(target).filter(
    (tile) => tile.terrain.passable,
  ).slice(0, 3);
  const nation = world.nations[0];
  const foe = world.nations[1];

  for (const tile of world.tiles) {
    tile.units = [];
    tile.unit = null;
    if (tile.terrain.passable) {
      tile.owner = nation.id;
      tile.controller = nation.id;
    }
  }
  world.units = [];
  for (const other of world.nations) {
    for (const general of generalsOf(other)) general.divisions = [];
  }
  target.owner = foe.id;
  target.controller = foe.id;

  const attackers = [
    createUnit('infantry', nation.id, approaches[0], nation),
    createUnit('infantry', nation.id, approaches[1], nation),
    createUnit('infantry', nation.id, approaches[2], nation),
    createUnit('infantry', nation.id, approaches[0], nation),
  ];
  const defender = createUnit('infantry', foe.id, target, foe);
  world.units.push(...attackers, defender);

  const general = generalsOf(nation)[0];
  assignDivisions(nation, general.id, attackers);
  for (const unit of attackers) unit.post = { q: unit.tile.q, r: unit.tile.r };
  Object.assign(general, {
    target: foe.id,
    stance: STANCE.ADVANCE,
    planning,
    nextAssaultAt: 0,
    aggression: 2,
  });
  declareWar(game, nation.id, foe.id);
  game.turns.turn = 10;
  return { game, world, nation, foe, target, attackers, defender, general };
}

const automatic = assaultScenario('ASSAULT-DIAGNOSTIC-AUTO');
runCommand(automatic.game);
const battle = battleAt(automatic.world, automatic.target);
const overflow = automatic.attackers.find((unit) => unit.battleId !== battle?.id);
const initialAttackers = battle?.attackers.length ?? 0;

// Bir katilimci yok olsa bile ayni muharebeye taze tumen sokup width yenilenemez.
const fallen = automatic.attackers.find((unit) => unit.battleId === battle?.id);
if (fallen) automatic.game.turns.killUnit(fallen);
const replacementRejected = overflow
  ? !startBattle(automatic.game, overflow, automatic.target)
  : false;

// Generalin ayni cadence icinde ikinci province muharebesi acmasi engellenir.
const secondTarget = automatic.world.neighbors(overflow.tile).find((tile) => (
  tile !== automatic.target && tile.terrain.passable
));
secondTarget.owner = automatic.foe.id;
secondTarget.controller = automatic.foe.id;
const secondDefender = createUnit(
  'infantry', automatic.foe.id, secondTarget, automatic.foe,
);
automatic.world.units.push(secondDefender);
const secondAssaultRejected = !automatic.game.attack(overflow, secondTarget);

const unprepared = assaultScenario('ASSAULT-DIAGNOSTIC-PLAN', 0);
runCommand(unprepared.game);
const waitsForPlanning = !battleAt(unprepared.world, unprepared.target);

const player = assaultScenario('ASSAULT-DIAGNOSTIC-PLAYER');
player.game.turns.playerNation = player.nation.id;
player.game.selected_ = [...player.attackers];
player.game.selectedUnit = player.attackers[0];
player.game.tileAtScreen = () => player.target;
const playerOrderAccepted = player.game.handleRightTap(0, 0);
const playerBattle = battleAt(player.world, player.target);

// Uzak dusman counter'ina sag tik: once attack-move yolu, sonra muharebe.
const distant = assaultScenario('ASSAULT-DIAGNOSTIC-DISTANT');
const marching = distant.attackers[0];
const rear = distant.world.neighbors(marching.tile).find((tile) => (
  tile.terrain.passable && tile.owner === distant.nation.id
  && tile !== distant.target && !tile.units?.length
  && hexDistance(tile.q, tile.r, distant.target.q, distant.target.r) >= 2
));
if (rear) placeUnit(marching, rear);
distant.general.stance = STANCE.HOLD;
distant.game.turns.playerNation = distant.nation.id;
distant.game.selected_ = [marching];
distant.game.selectedUnit = marching;
distant.game.tileAtScreen = () => distant.target;
const distantOrderAccepted = Boolean(rear) && distant.game.handleRightTap(0, 0);
const attackMoveCreated = destinationOf(marching) === distant.target;
runCommand(distant.game);
const manualPathSurvivedCommand = destinationOf(marching) === distant.target;
for (let week = 0; week < 8 && !battleAt(distant.world, distant.target); week++) {
  advanceMovement(distant.game);
  distant.game.turns.turn++;
  runCommand(distant.game);
}
const distantBattleStarted = battleAt(distant.world, distant.target)?.attackers.includes(marching.id);

// Taarruz cooldown'u dost toprakta yeniden konuslanmayi engellememeli.
const regrouping = assaultScenario('ASSAULT-DIAGNOSTIC-REGROUP');
const regroupingUnit = regrouping.attackers[0];
const friendlyMove = regrouping.world.neighbors(regroupingUnit.tile).find((tile) => (
  tile.terrain.passable && tile.owner === regrouping.nation.id && !tile.units?.length
));
regroupingUnit.attackReadyAt = regrouping.game.turns.turn + 5;
const regroupingCanMove = Boolean(friendlyMove)
  && orderMove(regrouping.game, regroupingUnit, friendlyMove);

const results = {
  automatic: {
    battleCreated: Boolean(battle),
    combinedAttack: initialAttackers === MAX_ASSAULT_DIVISIONS,
    oneProvinceOnly: automatic.world.battleSystem.battles.length === 1,
    cadenceStarted: automatic.general.nextAssaultAt > automatic.game.turns.turn,
    planningConsumed: automatic.general.planning < 0.58,
  },
  antiExploit: {
    combatWidth: MAX_ASSAULT_DIVISIONS === 3,
    replacementAfterLossRejected: replacementRejected,
    secondAssaultRejected,
    waitsForPlanning,
  },
  player: {
    orderAccepted: playerOrderAccepted,
    combinedAttack: playerBattle?.attackers.length === MAX_ASSAULT_DIVISIONS,
    overflowExcluded: playerBattle?.attackerCommitted === MAX_ASSAULT_DIVISIONS,
  },
  interaction: {
    distantOrderAccepted,
    attackMoveCreated,
    manualPathSurvivedCommand,
    distantBattleStarted: Boolean(distantBattleStarted),
    regroupingCanMove,
  },
};
results.passed = Object.values(results).filter((value) => typeof value === 'object')
  .every((section) => Object.values(section).every(Boolean));

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
