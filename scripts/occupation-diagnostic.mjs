// Egemenlik, askeri kontrol, save ve baris devrini kontrollu olarak dogrular.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { controllerOf, isOccupied } from '../src/game/control.js';
import { declareWar, makePeace } from '../src/game/diplomacy.js';
import { placeUnit, unitsOn } from '../src/game/units.js';
import { provinceOutput } from '../src/game/provinces.js';
import { deserialize, serialize } from '../src/game/save.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    reachable: null, autosaveEnabled: false, listeners: {},
    renderer: { invalidateCache() {}, invalidateTiles() {}, resize() {} },
    camera: { setBounds() {}, fit() {} },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

function reloadable(game) {
  game.newWorld = function newWorld(seed, options = {}) {
    this.world = generateWorld(seed, options);
    generateNations(this.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
    this.turns.start(this.world);
    return this.world;
  };
  return game;
}

function borderScenario(seed) {
  const game = reloadable(headless(seed));
  const world = game.world;
  let pair = null;
  world.forEach((tile) => {
    if (pair || tile.owner < 0 || !tile.terrain.passable) return;
    const attacker = world.units.find((unit) => (
      unit.nationId === tile.owner && unit.type.domain === 'land'
    ));
    if (!attacker) return;
    const target = world.neighbors(tile).find((near) => (
      near.owner >= 0 && near.owner !== tile.owner && near.terrain.passable
      && unitsOn(near).length === 0 && near.province
    ));
    if (target) pair = { attacker, origin: tile, target };
  });
  if (!pair) throw new Error('No empty controlled border province found.');
  placeUnit(pair.attacker, pair.origin);
  const attackerId = pair.origin.owner;
  const defenderId = pair.target.owner;
  declareWar(game, attackerId, defenderId);
  return { game, world, attackerId, defenderId, ...pair };
}

const war = borderScenario('OCCUPATION-DIAGNOSTIC');
const legalOwnerBefore = war.target.owner;
const attackerTilesBefore = war.world.nations[war.attackerId].tiles;
const defenderTilesBefore = war.world.nations[war.defenderId].tiles;
const occupied = war.game.enterTile(war.attacker, war.target);
const save = serialize(war.game);
const loadedGame = reloadable(headless('OCCUPATION-LOAD'));
const loaded = deserialize(loadedGame, save);
const loadedTile = loadedGame.world.get(war.target.q, war.target.r);

const wartime = {
  occupationCreated: occupied,
  sovereigntyUnchanged: war.target.owner === legalOwnerBefore,
  controllerChanged: controllerOf(war.target) === war.attackerId,
  markedOccupied: isOccupied(war.target),
  provinceCountsUnchanged: war.world.nations[war.attackerId].tiles === attackerTilesBefore
    && war.world.nations[war.defenderId].tiles === defenderTilesBefore,
  occupiedOutputStopped: Object.values(provinceOutput(war.target)).every((value) => value === 0),
  lowControl: war.target.province.control === 10,
};

const persistence = {
  loaded,
  legalOwnerPreserved: loadedTile?.owner === legalOwnerBefore,
  controllerPreserved: controllerOf(loadedTile) === war.attackerId,
  occupationPreserved: isOccupied(loadedTile),
};

const peaceMade = makePeace(war.game, war.attackerId, war.defenderId);
const settlement = {
  peaceMade,
  sovereigntyTransferred: war.target.owner === war.attackerId,
  controllerNormalized: controllerOf(war.target) === war.attackerId && !isOccupied(war.target),
  provinceCountsTransferred: war.world.nations[war.attackerId].tiles === attackerTilesBefore + 1
    && war.world.nations[war.defenderId].tiles === defenderTilesBefore - 1,
  integrationControlApplied: war.target.province.control === 25,
};

const liberation = borderScenario('OCCUPATION-LIBERATION');
liberation.game.enterTile(liberation.attacker, liberation.target);
liberation.game.turns.occupy(liberation.target, liberation.defenderId);
makePeace(liberation.game, liberation.attackerId, liberation.defenderId);
const liberationRules = {
  defenderLiberatedProvince: liberation.target.owner === liberation.defenderId,
  noTransferWithoutOccupation: controllerOf(liberation.target) === liberation.defenderId,
};

const results = { wartime, persistence, settlement, liberationRules };
results.passed = Object.values(results).every((section) => (
  typeof section !== 'object' || Object.values(section).every(Boolean)
));
console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
