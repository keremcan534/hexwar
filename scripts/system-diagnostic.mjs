// Ordu yığınları, province ekonomisi ve muharebe referans bütünlüğü.
// Kullanım: node scripts/system-diagnostic.mjs [seed] [hafta]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { MAX_STACK, regimentCount, soldiersOf, unitsOn } from '../src/game/units.js';
import { CONSTRUCTION_TYPES } from '../src/game/construction.js';

const seed = process.argv[2] ?? 'SYSTEM';
const weeks = Math.max(1, Number(process.argv[3] ?? 180));
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

let maxBattles = 0;
let observedBattles = 0;
let observedWars = 0;
let previousBattleIds = new Set();
let previousWars = new Set();
const battleStats = new Map();
const completedBattles = [];
const retreatingSeen = new Set();
const reorganizingSeen = new Set();
const retreats = new Map();
let capturedProvinces = 0;
let previousOwners = game.world.tiles.map((tile) => tile.owner);
for (let week = 0; week < weeks && !game.turns.victory; week++) {
  game.turns.endTurn();
  for (let i = 0; i < game.world.tiles.length; i++) {
    const owner = game.world.tiles[i].owner;
    if (previousOwners[i] >= 0 && owner >= 0 && owner !== previousOwners[i]) capturedProvinces++;
  }
  previousOwners = game.world.tiles.map((tile) => tile.owner);
  const ids = new Set(game.world.battleSystem.battles.map((battle) => battle.id));
  for (const battle of game.world.battleSystem.battles) {
    if (!previousBattleIds.has(battle.id)) observedBattles++;
    battleStats.set(battle.id, {
      started: battle.started,
      rounds: battle.rounds,
      losses: battle.attackerLosses + battle.defenderLosses,
      attackerLosses: battle.attackerLosses,
      defenderLosses: battle.defenderLosses,
    });
  }
  for (const id of previousBattleIds) {
    if (!ids.has(id) && battleStats.has(id)) completedBattles.push(battleStats.get(id));
  }
  for (const unit of game.world.units) {
    if ((unit.retreatUntil ?? 0) > game.turns.turn) retreatingSeen.add(unit.id);
    if ((unit.attackReadyAt ?? 0) > game.turns.turn) reorganizingSeen.add(unit.id);
    if (unit.lastRetreat) retreats.set(`${unit.id}:${unit.lastRetreat.turn}`, unit.lastRetreat.distance);
  }
  previousBattleIds = ids;
  maxBattles = Math.max(maxBattles, ids.size);
  const wars = new Set();
  for (let a = 0; a < game.world.nations.length; a++) {
    for (let b = a + 1; b < game.world.nations.length; b++) {
      if (game.world.relations[a][b]?.state === 'war') wars.add(`${a}:${b}`);
    }
  }
  for (const id of wars) if (!previousWars.has(id)) observedWars++;
  previousWars = wars;
}

const battleIds = new Set(game.world.battleSystem.battles.map((battle) => battle.id));
const orphanedArmies = game.world.units.filter(
  (army) => army.battleId && !battleIds.has(army.battleId),
);
// Tümenler artık birleşmiyor: bir province'te MAX_STACK kadarı yan yana
// durabilir. Hata, yığın tavanının aşılması ya da düşman tümenlerinin aynı
// karede bulunmasıdır — sayının birden büyük olması değil.
const stacks = new Map();
for (const army of game.world.units) {
  const key = `${army.tile.q}:${army.tile.r}`;
  if (!stacks.has(key)) stacks.set(key, []);
  stacks.get(key).push(army);
}
let duplicateTiles = 0;
for (const group of stacks.values()) {
  const nations = new Set(group.map((army) => army.nationId));
  if (group.length > MAX_STACK || nations.size > 1) duplicateTiles++;
}
const invalidStacks = game.world.units.filter((army) => (
  !army.regiments?.length
  || soldiersOf(army) <= 0
  || !unitsOn(army.tile).includes(army)
));
const provinces = game.world.tiles.filter((tile) => tile.province);
const developed = provinces.filter((tile) => (
  tile.province.agriculture + tile.province.extraction + tile.province.commerce > 3
));
// Yapılar artık şehre değil ulusal inşaat durumuna bağlı (construction.js).
// Bir bölgenin bütün yapıları bölge merkezinde çapalanır; ölçüt tek kare değil,
// çapanın hâlâ sahibinin toprağında olması ve tipin tanımlı kalmasıdır.
const structures = game.world.nations.flatMap((nation) => (
  (nation.construction?.buildings ?? []).map((building) => ({ nation, building }))
));
const invalidStructures = structures.filter(({ nation, building }) => {
  const tile = game.world.get(building.q, building.r);
  return !tile || tile.owner !== nation.id || !CONSTRUCTION_TYPES[building.typeId];
});
const thinCapturedSalients = game.world.tiles.filter((tile) => {
  if (tile.owner < 0 || (tile.heldSince ?? -100) < 0 || !tile.terrain.passable) return false;
  const ring = game.world.neighbors(tile).filter((near) => near.terrain.passable);
  const friendly = ring.filter((near) => near.owner === tile.owner).length;
  const foreign = ring.filter((near) => near.owner >= 0 && near.owner !== tile.owner).length;
  return friendly <= 1 && foreign >= 4;
});
const mean = (values) => values.length
  ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
  : 0;
const productionLines = game.world.nations.flatMap((nation) => (
  nation.economy?.factories ?? []
)).filter((factory) => factory.typeId === 'ARMS_FACTORY');
const equipmentStocks = game.world.nations.filter((nation) => nation.alive).map((nation) => ({
  arms: nation.economy?.military?.arms ?? 0,
  artillery: nation.economy?.military?.artillery ?? 0,
}));

console.log(JSON.stringify({
  seed,
  turn: game.turns.turn,
  victory: game.turns.victory?.nation?.name ?? null,
  alive: game.world.nations.filter((nation) => nation.alive).length,
  armies: game.world.units.length,
  regiments: game.world.units.reduce((sum, army) => sum + regimentCount(army), 0),
  observedBattles,
  observedWars,
  maxConcurrentBattles: maxBattles,
  activeBattles: battleIds.size,
  completedBattleRounds: {
    count: completedBattles.length,
    mean: mean(completedBattles.map((battle) => battle.rounds)),
    max: Math.max(0, ...completedBattles.map((battle) => battle.rounds)),
  },
  completedBattleLosses: mean(completedBattles.map((battle) => battle.losses)),
  completedAttackerLosses: mean(completedBattles.map((battle) => battle.attackerLosses)),
  completedDefenderLosses: mean(completedBattles.map((battle) => battle.defenderLosses)),
  capturedProvinces,
  retreatingUnitsSeen: retreatingSeen.size,
  retreatDistance: {
    count: retreats.size,
    mean: mean([...retreats.values()]),
    min: retreats.size ? Math.min(...retreats.values()) : 0,
  },
  reorganizingUnitsSeen: reorganizingSeen.size,
  thinCapturedSalients: thinCapturedSalients.length,
  orphanedArmies: orphanedArmies.length,
  duplicateTiles,
  invalidStacks: invalidStacks.length,
  provinces: provinces.length,
  developedProvinces: developed.length,
  structures: structures.length,
  invalidStructures: invalidStructures.length,
  militaryProduction: {
    allFactories: game.world.nations.reduce(
      (sum, nation) => sum + (nation.economy?.factories?.length ?? 0), 0,
    ),
    lines: productionLines.length,
    smallArmsLines: productionLines.filter((factory) => factory.lineEquipment === 'arms').length,
    artilleryLines: productionLines.filter((factory) => factory.lineEquipment === 'artillery').length,
    meanEfficiency: mean(productionLines.map((factory) => factory.lineEfficiency ?? 0)),
    meanSmallArmsStock: mean(equipmentStocks.map((stock) => stock.arms)),
    meanArtilleryStock: mean(equipmentStocks.map((stock) => stock.artillery)),
    meanGold: mean(game.world.nations.filter((nation) => nation.alive).map((nation) => nation.gold)),
    meanIronOutput: mean(game.world.nations.filter((nation) => nation.alive)
      .map((nation) => nation.economy?.inventory?.iron ?? 0)),
  },
}, null, 2));
