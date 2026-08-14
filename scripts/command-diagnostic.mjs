// Yeni komuta modelini bassiz dogrular: cephe sinirdan turetiliyor mu, kalici
// mevkiler haftalar arasinda sabit kaliyor mu, taarruz gercek birim emri uretiyor
// mu ve kayit gidis-donusu komuta baglantilarini koruyor mu?

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { hexDistance } from '../src/core/hex.js';
import {
  MAX_SKILL, STANCE, TRAITS, assignDivisions, assignGeneral, commandSize,
  borderNationIds, frontTilesOf, generalModifier, generalOfArmy, generalsOf, postTileOf,
  participatingAttackPower, refreshFront, runCommand, setStance, setTarget,
} from '../src/game/command.js';
import { advanceMovement, destinationOf, orderMove } from '../src/game/movement.js';
import { atWar, declareWar } from '../src/game/diplomacy.js';
import { deserialize, serialize } from '../src/game/save.js';
import { battleUnitPower, runBattles, startBattle } from '../src/game/battles.js';
import {
  MAX_ENTRENCHMENT, advanceEntrenchment, armyPower, clearPath, placeUnit, refreshArmy,
  unitsOn,
} from '../src/game/units.js';

const weeks = Math.max(1, Number.parseInt(process.argv[2] ?? '80', 10));

function headlessGame(seed) {
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

function makeReloadable(game) {
  game.newWorld = function newWorld(seed, options = {}) {
    this.world = generateWorld(seed, options);
    generateNations(this.world, {
      seed: `${seed}-nations`, count: options.nationCount ?? null,
    });
    this.selected = null;
    this.selectedUnit = null;
    this.selected_ = [];
    this.activeGeneral = null;
    this.turns.start(this.world);
    return this.world;
  };
  game.setSpeed = () => 0;
  return game;
}

function borderingPair(world) {
  let found = null;
  world.forEach((tile) => {
    if (found || tile.owner < 0 || !tile.terrain.passable) return;
    if (!world.units.some((unit) => unit.nationId === tile.owner && unit.type.domain === 'land')) return;
    const near = world.neighbors(tile).find(
      (other) => other.owner >= 0 && other.owner !== tile.owner && other.terrain.passable,
    );
    if (near) found = { nationId: tile.owner, foreignId: near.owner };
  });
  return found;
}

function emptyBorderTiles(world) {
  let found = null;
  world.forEach((tile) => {
    if (found || tile.owner < 0 || !tile.terrain.passable || unitsOn(tile).length) return;
    const near = world.neighbors(tile).find((other) => (
      other.owner >= 0 && other.owner !== tile.owner && other.terrain.passable
      && unitsOn(other).length === 0
    ));
    if (near) found = { own: tile, foreign: near };
  });
  return found;
}

function distanceToPosts(world, divisions) {
  return divisions.reduce((sum, unit) => {
    const post = postTileOf(world, unit);
    return sum + (post ? hexDistance(unit.tile.q, unit.tile.r, post.q, post.r) : 0);
  }, 0);
}

function adjacentColorStats(world) {
  const pairs = new Set();
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    for (const near of world.neighbors(tile)) {
      if (near.owner < 0 || near.owner === tile.owner) continue;
      pairs.add([tile.owner, near.owner].sort((a, b) => a - b).join(':'));
    }
  });
  const distances = [...pairs].map((key) => {
    const [a, b] = key.split(':').map(Number);
    const left = world.nations[a];
    const right = world.nations[b];
    const hue = Math.min(
      Math.abs(left.hue - right.hue), 360 - Math.abs(left.hue - right.hue),
    );
    return hue + Math.abs(left.light - right.light) * 2.4
      + Math.abs(left.sat - right.sat) * 0.25;
  });
  return {
    borders: pairs.size,
    minimumDistance: Math.min(...distances),
    exactDuplicates: distances.filter((distance) => distance === 0).length,
  };
}

const results = {};
const game = headlessGame('COMMAND-V2');
const world = game.world;

const staffs = world.nations.map((nation) => generalsOf(nation).length);
results.generalsSeeded = {
  nations: world.nations.length,
  min: Math.min(...staffs),
  max: Math.max(...staffs),
  traitsValid: world.nations.every((nation) => generalsOf(nation).every(
    (general) => general.traits.every((trait) => TRAITS[trait])
      && general.skill >= 1 && general.skill <= MAX_SKILL,
  )),
};
results.colors = adjacentColorStats(world);

const pair = borderingPair(world);
if (!pair) throw new Error('Diagnostic world has no bordering nations with land divisions.');
const nation = world.nations[pair.nationId];
const foreign = world.nations[pair.foreignId];
const divisions = world.units
  .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land')
  .slice(0, 6);
const general = generalsOf(nation)[0];
const otherGeneral = generalsOf(nation)[1];

const before = generalModifier(generalOfArmy(nation, divisions[0]), { army: divisions[0] });
assignGeneral(nation, general.id, divisions[0]);
const after = generalModifier(generalOfArmy(nation, divisions[0]), { army: divisions[0] });
assignDivisions(nation, general.id, divisions);
assignDivisions(nation, otherGeneral.id, [divisions.at(-1)]);
results.command = {
  combatBonusApplied: after > before,
  sourceSize: commandSize(general),
  targetSize: commandSize(otherGeneral),
  transferUnique: divisions.every((unit) => generalsOf(nation).filter(
    (candidate) => candidate.divisions.includes(unit.id),
  ).length === 1),
};

// Son tumen aktarim testinde diger generale gitti; cephe testi kalan gruptur.
const lineDivisions = divisions.slice(0, -1);
game.turns.playerNation = nation.id;
setTarget(world, general, foreign.id);
setStance(world, general, STANCE.HOLD);
runCommand(game);
const peacefulFront = frontTilesOf(world, general);
results.peaceTarget = {
  stillAtPeace: !atWar(world, nation.id, foreign.id),
  listedAsBorderTarget: borderNationIds(world, nation.id).includes(foreign.id),
  deployedOnChosenBorder: peacefulFront.length > 0 && peacefulFront.every((tile) => (
    tile.owner === nation.id && world.neighbors(tile).some((near) => near.owner === foreign.id)
  )),
};

declareWar(game, nation.id, foreign.id);
runCommand(game);
const front = frontTilesOf(world, general);
const firstPosts = new Map(lineDivisions.map((unit) => [
  unit.id, unit.post ? `${unit.post.q}:${unit.post.r}` : null,
]));
runCommand(game);
const secondPosts = new Map(lineDivisions.map((unit) => [
  unit.id, unit.post ? `${unit.post.q}:${unit.post.r}` : null,
]));
results.derivedFront = {
  target: foreign.name,
  tiles: front.length,
  onlyOwnBorderTiles: front.length > 0 && front.every((tile) => (
    tile.owner === nation.id && world.neighbors(tile).some((near) => near.owner === foreign.id)
  )),
  postsAssigned: lineDivisions.every((unit) => unit.post),
  postsStable: lineDivisions.every((unit) => firstPosts.get(unit.id) === secondPosts.get(unit.id)),
  noStoredFrontSystem: world.frontSystem === undefined,
};

const distanceBefore = distanceToPosts(world, lineDivisions);
for (let i = 0; i < 30 && distanceToPosts(world, lineDivisions) > 0; i++) {
  runCommand(game);
  advanceMovement(game);
  game.turns.turn++;
}
const distanceAfter = distanceToPosts(world, lineDivisions);
results.holdLine = {
  distanceBefore,
  distanceAfter,
  approachedPosts: distanceAfter < distanceBefore || distanceAfter === 0,
  noAttackWhileHolding: !world.battleSystem.battles.some(
    (battle) => battle.attackerNation === nation.id,
  ),
};

setStance(world, general, STANCE.ADVANCE);
general.planning = 1;
let attackIssued = false;
for (let i = 0; i < 8 && !attackIssued; i++) {
  runCommand(game);
  attackIssued = world.battleSystem.battles.some(
    (battle) => battle.attackerNation === nation.id,
  ) || lineDivisions.some((unit) => {
    const goal = destinationOf(unit);
    return goal && goal.owner !== nation.id;
  });
  game.turns.turn++;
}
refreshFront(world, general);
results.offensive = {
  attackIssued,
  lineRemainsDerived: frontTilesOf(world, general).every((tile) => tile.owner === nation.id),
  stance: general.stance,
};

const saveGame = makeReloadable(headlessGame('COMMAND-SAVE-V2'));
const saveWorld = saveGame.world;
const savePair = borderingPair(saveWorld);
const saveNation = saveWorld.nations[savePair.nationId];
const saveArmy = saveWorld.units.find(
  (unit) => unit.nationId === saveNation.id && unit.type.domain === 'land',
);
const saveGeneral = generalsOf(saveNation)[0];
assignGeneral(saveNation, saveGeneral.id, saveArmy);
setTarget(saveWorld, saveGeneral, savePair.foreignId);
setStance(saveWorld, saveGeneral, STANCE.ADVANCE);
saveGeneral.planning = 0.73;
saveGeneral.nextAssaultAt = 42;
saveNation.economy.military.arms = 7.5;
saveArmy.post = { q: saveArmy.tile.q, r: saveArmy.tile.r };
saveArmy.entrenchment = 0.25;
const saved = serialize(saveGame);
const loadedSave = deserialize(saveGame, saved);
const loadedNation = saveGame.world.nations[saveNation.id];
const loadedGeneral = generalsOf(loadedNation).find((candidate) => candidate.id === saveGeneral.id);
const loadedArmy = saveGame.world.units.find(
  (unit) => loadedGeneral?.divisions.includes(unit.id),
);
results.saveRoundTrip = {
  loaded: loadedSave,
  divisionReferenceKept: loadedGeneral?.divisions.length === 1 && Boolean(loadedArmy),
  targetKept: loadedGeneral?.target === savePair.foreignId,
  stanceKept: loadedGeneral?.stance === STANCE.ADVANCE,
  assaultCadenceKept: loadedGeneral?.nextAssaultAt === 42,
  militaryStockKept: loadedNation.economy.military.arms === 7.5,
  postKept: loadedArmy?.post?.q === saveArmy.post.q && loadedArmy?.post?.r === saveArmy.post.r,
  entrenchmentKept: loadedArmy?.entrenchment === 0.25,
  noGhostStacks: saveGame.world.tiles.every(
    (tile) => (tile.units ?? []).every((unit) => saveGame.world.units.includes(unit)),
  ),
};

const oldSave = JSON.parse(JSON.stringify(saved));
for (const savedUnit of oldSave.units) delete savedUnit.entrenchment;
for (const savedNation of oldSave.nations) delete savedNation.economy.military;
const oldSaveGame = makeReloadable(headlessGame('COMMAND-SAVE-V2'));
const loadedOldSave = deserialize(oldSaveGame, oldSave);
const oldSaveNation = oldSaveGame.world.nations[saveNation.id];
const oldSaveGeneral = generalsOf(oldSaveNation).find((candidate) => candidate.id === saveGeneral.id);
const oldSaveArmy = oldSaveGame.world.units.find(
  (unit) => oldSaveGeneral?.divisions.includes(unit.id),
);
results.oldSaveEntrenchment = {
  loaded: loadedOldSave,
  defaultsToZero: oldSaveArmy?.entrenchment === 0,
  militaryDefaultsCreated: oldSaveNation.economy.military.arms === 16,
};

const fixGame = headlessGame('COMBAT-FIXES');
const fixWorld = fixGame.world;
const fixUnit = fixWorld.units.find((unit) => (
  unit.type.domain === 'land' && unit.tile.owner === unit.nationId && unit.tile.terrain.passable
));
fixUnit.entrenchment = 0;
clearPath(fixUnit);
fixUnit.battleId = null;
fixUnit.retreatUntil = 0;
const newlyCreated = fixUnit.entrenchment;
for (let tick = 1; tick <= 7; tick++) advanceEntrenchment(fixUnit, tick);
const afterSeven = fixUnit.entrenchment;
advanceEntrenchment(fixUnit, 8);
const afterEight = fixUnit.entrenchment;

const moveOrigin = fixWorld.tiles.find((tile) => (
  tile.owner === fixUnit.nationId && tile.terrain.passable && unitsOn(tile).length === 0
  && fixWorld.neighbors(tile).some((near) => (
    near.owner === fixUnit.nationId && near.terrain.passable && unitsOn(near).length === 0
  ))
));
const moveTarget = fixWorld.neighbors(moveOrigin).find((tile) => (
  tile.owner === fixUnit.nationId && tile.terrain.passable && unitsOn(tile).length === 0
));
placeUnit(fixUnit, moveOrigin);
fixUnit.entrenchment = MAX_ENTRENCHMENT;
const manualMoveWorks = orderMove(fixGame, fixUnit, moveTarget);
const movingReset = fixUnit.entrenchment === 0;
clearPath(fixUnit);
fixUnit.entrenchment = MAX_ENTRENCHMENT;
placeUnit(fixUnit, moveTarget);
const relocationReset = fixUnit.entrenchment === 0;
fixUnit.entrenchment = MAX_ENTRENCHMENT;
moveTarget.owner = (fixUnit.nationId + 1) % fixWorld.nations.length;
moveTarget.controller = moveTarget.owner;
advanceEntrenchment(fixUnit, 9);
const lostControlReset = fixUnit.entrenchment === 0;

const combatTiles = emptyBorderTiles(fixWorld);
const attackerNationId = combatTiles.own.owner;
const defenderNationId = combatTiles.foreign.owner;
const attacker = fixWorld.units.find((unit) => (
  unit.nationId === attackerNationId && unit.type.domain === 'land' && unit !== fixUnit
));
const defender = fixWorld.units.find((unit) => (
  unit.nationId === defenderNationId && unit.type.domain === 'land'
));
const adjacentSupport = fixWorld.units.find((unit) => (
  unit.nationId === attackerNationId && unit.type.domain === 'land'
  && unit !== attacker && unit !== fixUnit
));
placeUnit(attacker, combatTiles.own);
placeUnit(defender, combatTiles.foreign);
const attackerOwnPower = armyPower(attacker);
const loneEstimate = participatingAttackPower(attacker);
const supportTile = fixWorld.neighbors(combatTiles.foreign).find((tile) => (
  tile !== combatTiles.own && tile.terrain.passable && unitsOn(tile).length === 0
));
if (supportTile && adjacentSupport) {
  supportTile.owner = attackerNationId;
  placeUnit(adjacentSupport, supportTile);
}
const estimateWithAdjacent = participatingAttackPower(attacker);
const defenderTerrain = combatTiles.foreign.terrain;
const defenderCity = combatTiles.foreign.city;
combatTiles.foreign.terrain = { ...defenderTerrain, defense: 0 };
combatTiles.foreign.city = null;
defender.entrenchment = 0;
const plainDefense = battleUnitPower(fixWorld, defender, true);
combatTiles.foreign.terrain = { ...defenderTerrain, defense: 0.25 };
combatTiles.foreign.city = { level: 2 };
const terrainCityDefense = battleUnitPower(fixWorld, defender, true);
defender.entrenchment = MAX_ENTRENCHMENT;
const fullyEntrenchedDefense = battleUnitPower(fixWorld, defender, true);
combatTiles.foreign.terrain = defenderTerrain;
combatTiles.foreign.city = defenderCity;

declareWar(fixGame, attackerNationId, defenderNationId);
attacker.entrenchment = MAX_ENTRENCHMENT;
const manualAttackWorks = startBattle(fixGame, attacker, combatTiles.foreign);
const attackingReset = attacker.entrenchment === 0;
for (const regiment of defender.regiments) {
  regiment.organization = 0;
  regiment.morale = 0;
}
refreshArmy(defender);
fixGame.turns.rng = () => 0.5;
fixGame.turns.turn++;
runBattles(fixGame);
const retreatingReset = defender.entrenchment === 0
  && defender.retreatUntil > fixGame.turns.turn;

results.combatFixes = {
  loneEstimateUsesOwnPower: loneEstimate === attackerOwnPower,
  adjacentSupportPlaced: Boolean(supportTile && adjacentSupport),
  adjacentSupportIgnored: estimateWithAdjacent === loneEstimate,
  newlyArrivedZero: newlyCreated === 0,
  reachesMaximumInSevenTicks: afterSeven === MAX_ENTRENCHMENT,
  neverExceedsMaximum: afterEight === MAX_ENTRENCHMENT,
  manualMoveWorks,
  movingReset,
  relocationReset,
  lostControlReset,
  manualAttackWorks,
  attackingReset,
  retreatingReset,
  terrainAndCityStillApply: terrainCityDefense > plainDefense,
  maximumMatchesOldMultiplier: Math.abs(
    fullyEntrenchedDefense / terrainCityDefense - 1.35
  ) < 1e-9,
};

const longGame = headlessGame('COMMAND-LONG');
for (let i = 0; i < weeks; i++) longGame.turns.endTurn();
const longWorld = longGame.world;
const ids = new Set(longWorld.units.map((unit) => unit.id));
let duplicateAssignments = 0;
let orphanReferences = 0;
for (const longNation of longWorld.nations) {
  const assigned = new Set();
  for (const longGeneral of generalsOf(longNation)) {
    for (const id of longGeneral.divisions) {
      if (!ids.has(id)) orphanReferences++;
      if (assigned.has(id)) duplicateAssignments++;
      assigned.add(id);
    }
  }
}
results.integrity = {
  weeks: longGame.turns.turn,
  armies: longWorld.units.length,
  battles: longWorld.battleSystem.battles.length,
  orphanReferences,
  duplicateAssignments,
  invalidPosts: longWorld.units.filter((unit) => unit.post && !longWorld.get(unit.post.q, unit.post.r)).length,
  noLegacyFrontSystem: longWorld.frontSystem === undefined,
  wars: longWorld.relations.flat().filter((record) => record?.state === 'war').length / 2,
  warSymmetry: longWorld.nations.every((a) => longWorld.nations.every(
    (b) => atWar(longWorld, a.id, b.id) === atWar(longWorld, b.id, a.id),
  )),
};

results.passed = Boolean(
  results.generalsSeeded.traitsValid
  && results.colors.minimumDistance > 70
  && results.colors.exactDuplicates === 0
  && results.command.combatBonusApplied
  && results.command.transferUnique
  && Object.values(results.peaceTarget).every(Boolean)
  && results.derivedFront.onlyOwnBorderTiles
  && results.derivedFront.postsAssigned
  && results.derivedFront.postsStable
  && results.derivedFront.noStoredFrontSystem
  && results.holdLine.approachedPosts
  && results.holdLine.noAttackWhileHolding
  && results.offensive.attackIssued
  && results.offensive.lineRemainsDerived
  && results.offensive.stance === STANCE.ADVANCE
  && Object.values(results.saveRoundTrip).every(Boolean)
  && Object.values(results.oldSaveEntrenchment).every(Boolean)
  && Object.values(results.combatFixes).every(Boolean)
  && results.integrity.orphanReferences === 0
  && results.integrity.duplicateAssignments === 0
  && results.integrity.invalidPosts === 0
  && results.integrity.noLegacyFrontSystem
  && results.integrity.warSymmetry
);

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
