// Ekonomi değişikliklerini gerçek oyun döngüsüyle, çizim ve DOM olmadan ölçer.
// Kullanım: node scripts/economy-diagnostic.mjs [oyun sayısı] [seed öneki]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { storageCap } from '../src/game/cities.js';
import { BUILDINGS, buildingSlots, canBuild } from '../src/game/buildings.js';
import { canTrade } from '../src/game/trade.js';
import { atPeace } from '../src/game/diplomacy.js';
import { FINAL_TURN, hegemonyScore } from '../src/game/hegemony.js';
import { availableTechs } from '../src/game/tech.js';

const gameCount = Math.max(1, Number.parseInt(process.argv[2] ?? '30', 10));
const seedPrefix = process.argv[3] ?? 'ECON';
const traceSeed = process.argv[4] ?? null;

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

function supplierState(world, buyer, good) {
  let suppliers = 0;
  let available = 0;
  for (const seller of world.nations) {
    if (seller.id === buyer.id || !canTrade(seller) || !canTrade(buyer)) continue;
    if (!atPeace(world, seller.id, buyer.id)) continue;
    const linked = (world.contacts?.[seller.id]?.[buyer.id] ?? 0) > 0
      || (seller.coastal && buyer.coastal);
    if (!linked) continue;
    const cap = storageCap(seller.budget?.cities ?? 1, seller);
    const surplus = Math.max(0, Math.min(seller[good] - 12, cap - 12));
    if (surplus <= 0) continue;
    suppliers++;
    available += surplus;
  }
  return { suppliers, available: Math.round(available) };
}

function nationSnapshot(world, nation, turn) {
  const cities = world.cities.filter((city) => city.nationId === nation.id);
  const units = world.units.filter((unit) => unit.nationId === nation.id);
  const ownedRoadLevels = world.tiles.reduce(
    (sum, tile) => sum + (tile.owner === nation.id ? tile.roadLevel ?? 0 : 0), 0,
  );
  const workedRoadLevels = cities.reduce(
    (sum, city) => sum + city.worked.reduce(
      (roadSum, tile) => roadSum + (tile.roadLevel ?? 0), 0,
    ), 0,
  );
  const buildable = cities.flatMap((city) => Object.keys(BUILDINGS)
    .filter((id) => canBuild(world, city, id, 2))
    .map((id) => ({ city: city.name, id })));
  const timberMarket = supplierState(world, nation, 'timber');
  const ironMarket = supplierState(world, nation, 'iron');
  return {
    seed: world.seed,
    turn,
    id: nation.id,
    name: nation.name,
    gold: Math.round(nation.gold),
    timber: Math.round(nation.timber),
    iron: Math.round(nation.iron),
    infamy: Math.round(nation.infamy ?? 0),
    canTrade: canTrade(nation),
    tiles: nation.tiles,
    cities: cities.length,
    buildings: cities.reduce((sum, city) => sum + (city.buildings?.length ?? 0), 0),
    buildingSlots: cities.reduce((sum, city) => sum + buildingSlots(nation, city), 0),
    buildable: buildable.length,
    units: units.length,
    heavyUnits: units.filter((unit) => unit.type.id === 'CAVALRY' || unit.type.id === 'WARSHIP').length,
    techs: nation.techs?.length ?? 0,
    availableTechs: availableTechs(nation).length,
    ownedRoadLevels,
    workedRoadLevels,
    net: Object.fromEntries(
      Object.entries(nation.budget?.net ?? {}).map(([key, value]) => [key, Math.round(value)]),
    ),
    production: Object.fromEntries(
      Object.entries(nation.budget?.production ?? {}).map(([key, value]) => [key, Math.round(value)]),
    ),
    timberMarket,
    ironMarket,
    score: hegemonyScore(world, nation).total,
  };
}

function percentile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.round((sorted.length - 1) * fraction)];
}

const results = [];
let richestEver = null;
const start = performance.now();

for (let index = 0; index < gameCount; index++) {
  const seed = `${seedPrefix}-${String(index + 1).padStart(3, '0')}`;
  const game = headlessGame(seed);
  let tradeDeals = 0;
  let tradeVolume = 0;
  const trace = [];

  while (!game.turns.victory && game.turns.turn < FINAL_TURN) {
    game.turns.endTurn();
    tradeDeals += game.turns.lastTrade?.deals ?? 0;
    tradeVolume += game.turns.lastTrade?.volume ?? 0;
    for (const nation of game.world.nations) {
      if (!nation.alive) continue;
      if (!richestEver || nation.gold > richestEver.gold) {
        richestEver = nationSnapshot(game.world, nation, game.turns.turn);
      }
    }
    if (seed === traceSeed && game.turns.turn % 10 === 0) {
      const richestNow = game.world.nations
        .filter((nation) => nation.alive)
        .sort((a, b) => b.gold - a.gold)[0];
      if (richestNow) trace.push(nationSnapshot(game.world, richestNow, game.turns.turn));
    }
  }

  const alive = game.world.nations.filter((nation) => nation.alive);
  const richest = alive.reduce(
    (best, nation) => (!best || nation.gold > best.gold ? nation : best),
    null,
  );
  const victory = game.turns.victory;
  const winnerScore = victory ? hegemonyScore(game.world, victory.nation) : null;
  const ownedTiles = alive.reduce((sum, nation) => sum + nation.tiles, 0);
  results.push({
    seed,
    turn: game.turns.turn,
    alive: alive.length,
    winner: victory?.nation.name ?? null,
    byConquest: victory?.byConquest ?? null,
    winnerEconomyTechShare: winnerScore
      ? Math.round(((winnerScore.economy + winnerScore.technology) / winnerScore.total) * 100)
      : null,
    winnerDirectLandShare: winnerScore
      ? Math.round(((victory.nation.tiles * 0.04) / winnerScore.total) * 100)
      : null,
    winnerOwnedLandShare: victory
      ? Math.round((victory.nation.tiles / Math.max(1, ownedTiles)) * 100)
      : null,
    tradeDeals,
    tradeVolume: Math.round(tradeVolume),
    richest: richest ? nationSnapshot(game.world, richest, game.turns.turn) : null,
    ...(trace.length ? { trace } : {}),
  });
}

const goldPeaks = results.map((result) => result.richest?.gold ?? 0);
const tradeVolumes = results.map((result) => result.tradeVolume);
const turns = results.map((result) => result.turn);
const conquestWins = results.filter((result) => result.byConquest).length;
const economyTechShares = results.map((result) => result.winnerEconomyTechShare ?? 0);
const directLandShares = results.map((result) => result.winnerDirectLandShare ?? 0);
const ownedLandShares = results.map((result) => result.winnerOwnedLandShare ?? 0);
const highGoldGames = results
  .filter((result) => (result.richest?.gold ?? 0) >= 400)
  .sort((a, b) => b.richest.gold - a.richest.gold);

console.log(JSON.stringify({
  games: gameCount,
  elapsedMs: Math.round(performance.now() - start),
  turns: {
    mean: Math.round(turns.reduce((sum, value) => sum + value, 0) / turns.length),
    min: Math.min(...turns),
    max: Math.max(...turns),
  },
  nonConquestWinRate: `${Math.round((1 - conquestWins / gameCount) * 100)}%`,
  winnerComposition: {
    economyTechnologyMedian: `${percentile(economyTechShares, 0.5)}%`,
    directLandMedian: `${percentile(directLandShares, 0.5)}%`,
    ownedLandMedian: `${percentile(ownedLandShares, 0.5)}%`,
  },
  richestGold: {
    median: percentile(goldPeaks, 0.5),
    p90: percentile(goldPeaks, 0.9),
    max: Math.max(...goldPeaks),
  },
  tradeVolume: {
    median: percentile(tradeVolumes, 0.5),
    p90: percentile(tradeVolumes, 0.9),
  },
  richestEver,
  highGoldGames,
}, null, 2));
