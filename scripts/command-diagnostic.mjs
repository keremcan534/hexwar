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
import { createUnit } from '../src/game/units.js';
import {
  MAX_SKILL, TRAITS, assignDivisions, assignGeneral, commandSize, generalModifier,
  generalOfArmy, generalsOf, setAggression,
} from '../src/game/generals.js';
import {
  PLAN, aggressionInfo, assignArmy, createFront, frontOfArmy, reconcileFronts, runFronts,
  toggleExecution,
} from '../src/game/fronts.js';
import { declareWar } from '../src/game/diplomacy.js';
import { deserialize, serialize } from '../src/game/save.js';

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

function makeReloadable(game) {
  game.newWorld = function newWorld(seed, options = {}) {
    this.world = generateWorld(seed, options);
    generateNations(this.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
    this.selected = null;
    this.selectedUnit = null;
    this.selected_ = [];
    this.activeGeneral = null;
    this.selectedFront = null;
    this.drawMode = null;
    this.turns.start(this.world);
    return this.world;
  };
  game.setSpeed = () => 0;
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

// --- 2b) General tek tümen değil, bir ordu grubu komuta ediyor mu? ---
let groupArmies = world.units.filter((u) => u.nationId === nation.id).slice(0, 2);
if (groupArmies.length < 2) {
  let reinforcementTile = null;
  world.forEach((tile) => {
    if (!reinforcementTile && tile.owner === nation.id && tile.terrain.passable && !tile.unit) {
      reinforcementTile = tile;
    }
  });
  if (reinforcementTile) {
    const reinforcement = createUnit(army.type.id, nation.id, reinforcementTile, nation);
    world.units.push(reinforcement);
    groupArmies = [army, reinforcement];
  }
}
const otherGeneral = generalsOf(nation)[1];
assignDivisions(nation, general.id, groupArmies);
const groupFront = createFront(game, nation, [army.tile, ...world.neighbors(army.tile)].slice(0, 2), PLAN.HOLD, general.id);
if (groupFront) for (const unit of groupArmies) assignArmy(world, groupFront, unit);
assignDivisions(nation, otherGeneral.id, [groupArmies[1]]);
reconcileFronts(world);
results.armyGroupTransfer = {
  initialGroupHadTwo: groupArmies.length === 2,
  sourceSize: commandSize(general),
  targetSize: commandSize(otherGeneral),
  transferredToTarget: generalOfArmy(nation, groupArmies[1])?.id === otherGeneral.id,
  uniqueAssignments: groupArmies.every((unit) => generalsOf(nation).filter(
    (candidate) => candidate.divisions.includes(unit.id),
  ).length === 1),
  removedFromOldFront: !groupFront || !groupFront.armies.includes(groupArmies[1]?.id),
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

// --- 4b) Taarruz oku hedefe ilerliyor, geri çekilme hattı yerinde kalıyor mu? ---
let arrowResult = { skipped: 'no bordering nation found' };
if (neighbourId !== null) {
  let origin = null;
  let target = null;
  world.forEach((tile) => {
    if (origin || tile.owner !== nation.id || !tile.terrain.passable) return;
    const enemy = world.neighbors(tile).find(
      (near) => near.owner === neighbourId && near.terrain.passable,
    );
    if (enemy) {
      origin = tile;
      target = enemy;
    }
  });
  if (origin && target) {
    const arrowGeneral = generalsOf(nation)[2];
    const arrowArmy = world.units.find((unit) => unit.nationId === nation.id);
    assignDivisions(nation, arrowGeneral.id, [arrowArmy]);
    setAggression(arrowGeneral, 3);
    const arrow = createFront(game, nation, [origin], PLAN.ARROW, arrowGeneral.id);
    arrow.target = { q: target.q, r: target.r };
    assignArmy(world, arrow, arrowArmy);
    arrow.planning = 1;
    toggleExecution(game, arrow);
    const beforeDistance = hexDistance(origin.q, origin.r, target.q, target.r);
    runFronts(game);
    const lead = world.get(arrow.tiles[0].q, arrow.tiles[0].r);
    const afterDistance = hexDistance(lead.q, lead.r, target.q, target.r);

    const holdTiles = [origin, ...world.neighbors(origin).filter(
      (near) => near.owner === nation.id && near.terrain.passable,
    )].slice(0, 2);
    const fallback = createFront(game, nation, holdTiles, PLAN.HOLD);
    const fallbackBefore = fallback?.tiles.map((point) => `${point.q}:${point.r}`).join(',');
    if (fallback) {
      toggleExecution(game, fallback);
      runFronts(game);
    }
    arrowResult = {
      singleProvinceOriginAccepted: Boolean(arrow),
      distanceBefore: beforeDistance,
      distanceAfter: afterDistance,
      movedTowardTarget: afterDistance < beforeDistance,
      fallbackStayedPut: !fallback || fallbackBefore === fallback.tiles
        .map((point) => `${point.q}:${point.r}`).join(','),
      aggressionCadence: {
        careful: aggressionInfo(1).cadence,
        balanced: aggressionInfo(2).cadence,
        aggressive: aggressionInfo(3).cadence,
      },
    };
  }
}
results.arrowAndFallbackPlans = arrowResult;

// --- 4c) Kayıt/yükleme general ve cephe ordu kimliklerini koruyor mu? ---
const saveGame = makeReloadable(headlessGame('COMMAND-SAVE'));
const saveWorld = saveGame.world;
const saveNation = saveWorld.nations.find(
  (candidate) => candidate.alive && saveWorld.units.some((unit) => unit.nationId === candidate.id),
);
const saveArmy = saveWorld.units.find((unit) => unit.nationId === saveNation.id);
const saveGeneral = generalsOf(saveNation)[0];
assignGeneral(saveNation, saveGeneral.id, saveArmy);
const saveLine = [saveArmy.tile, ...saveWorld.neighbors(saveArmy.tile).filter(
  (tile) => tile.terrain.passable,
)].slice(0, 2);
const saveFront = createFront(
  saveGame, saveNation, saveLine, PLAN.HOLD, saveGeneral.id,
);
assignArmy(saveWorld, saveFront, saveArmy);
const saveData = serialize(saveGame);
const loaded = deserialize(saveGame, saveData);
const loadedNation = saveGame.world.nations[saveNation.id];
const loadedGeneral = generalsOf(loadedNation).find((candidate) => candidate.id === saveGeneral.id);
const loadedFront = saveGame.world.frontSystem.fronts.find(
  (candidate) => candidate.id === saveFront.id,
);
results.commandSaveRoundTrip = {
  loaded,
  generalDivisions: loadedGeneral?.divisions.length ?? 0,
  frontArmies: loadedFront?.armies.length ?? 0,
  generalRefsExist: (loadedGeneral?.divisions ?? []).every(
    (id) => saveGame.world.units.some((unit) => unit.id === id),
  ),
  frontRefsExist: (loadedFront?.armies ?? []).every(
    (id) => saveGame.world.units.some((unit) => unit.id === id),
  ),
  sameArmyReference: loadedGeneral?.divisions[0] === loadedFront?.armies[0],
};

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

results.passed = Boolean(
  results.generalsSeeded.traitsValid
  && results.commanderAffectsCombat.changed
  && results.commanderAffectsCombat.oneGeneralPerArmy
  && results.armyGroupTransfer.initialGroupHadTwo
  && results.armyGroupTransfer.transferredToTarget
  && results.armyGroupTransfer.uniqueAssignments
  && results.armyGroupTransfer.removedFromOldFront
  && results.frontDistributesArmies.armiesMovedToLine
  && results.frontDistributesArmies.planningGrows
  && results.frontDistributesArmies.armyBoundToOneFront
  && (results.advancePlanPushesLine.skipped || results.advancePlanPushesLine.lineMoved)
  && (results.arrowAndFallbackPlans.skipped
    || (results.arrowAndFallbackPlans.movedTowardTarget
      && results.arrowAndFallbackPlans.fallbackStayedPut))
  && results.commandSaveRoundTrip.loaded
  && results.commandSaveRoundTrip.generalDivisions === 1
  && results.commandSaveRoundTrip.frontArmies === 1
  && results.commandSaveRoundTrip.generalRefsExist
  && results.commandSaveRoundTrip.frontRefsExist
  && results.commandSaveRoundTrip.sameArmyReference
  && results.integrity.orphanArmyRefs === 0
  && results.integrity.generalsOnDeadArmies === 0
  && results.integrity.duplicateGeneralAssignments === 0
  && results.integrity.armiesInTwoFronts === 0
);

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
