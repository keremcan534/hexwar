// Ordu yığınları, province ekonomisi ve muharebe referans bütünlüğü.
// Kullanım: node scripts/system-diagnostic.mjs [seed] [hafta]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { regimentCount, soldiersOf } from '../src/game/units.js';

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
for (let week = 0; week < weeks && !game.turns.victory; week++) {
  game.turns.endTurn();
  const ids = new Set(game.world.battleSystem.battles.map((battle) => battle.id));
  for (const id of ids) if (!previousBattleIds.has(id)) observedBattles++;
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
const occupiedTiles = new Set();
let duplicateTiles = 0;
for (const army of game.world.units) {
  const key = `${army.tile.q}:${army.tile.r}`;
  if (occupiedTiles.has(key)) duplicateTiles++;
  occupiedTiles.add(key);
}
const invalidStacks = game.world.units.filter(
  (army) => !army.regiments?.length || soldiersOf(army) <= 0 || army.tile.unit !== army,
);
const provinces = game.world.tiles.filter((tile) => tile.province);
const developed = provinces.filter((tile) => (
  tile.province.agriculture + tile.province.extraction + tile.province.commerce > 3
));
const structures = game.world.tiles.filter((tile) => tile.structure);
const invalidStructures = structures.filter((tile) => {
  const city = game.world.cities.find((item) => item.id === tile.structure.cityId);
  return !city || city.nationId !== tile.owner
    || !city.buildings.includes(tile.structure.buildingId);
});

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
  orphanedArmies: orphanedArmies.length,
  duplicateTiles,
  invalidStacks: invalidStacks.length,
  provinces: provinces.length,
  developedProvinces: developed.length,
  structures: structures.length,
  invalidStructures: invalidStructures.length,
  authority: game.world.nations
    .filter((nation) => nation.alive)
    .map((nation) => Math.round(nation.economy.authority)),
}, null, 2));
