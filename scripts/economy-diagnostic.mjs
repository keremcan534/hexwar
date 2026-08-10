// Ekonomi değişikliklerini gerçek oyun döngüsüyle, çizim ve DOM olmadan ölçer.
// Kullanım: node scripts/economy-diagnostic.mjs [oyun sayısı] [seed öneki] [iz seed'i]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { ensureConstruction } from '../src/game/construction.js';
import { FINAL_TURN, hegemonyScore } from '../src/game/hegemony.js';

// Oyun ufku 300 turdan 5200'e (yuz yil) cikinca tek kosu ~15 kat uzadi.
// Varsayilan 30 oyun saatler suruyordu; 6 oyun ayni egilimi birkac dakikada
// verir, daha genis ornek gerekince sayi arguman olarak yukseltilir.
const gameCount = Math.max(1, Number.parseInt(process.argv[2] ?? '6', 10));
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

function nationSnapshot(world, nation, turn) {
  const cities = world.cities.filter((city) => city.nationId === nation.id);
  const units = world.units.filter((unit) => unit.nationId === nation.id);
  const economy = nation.economy ?? {};
  const trade = economy.trade ?? {};
  const construction = ensureConstruction(nation);
  return {
    seed: world.seed,
    turn,
    id: nation.id,
    name: nation.name,
    // Ülke artık kereste/demir stoklamaz; hepsi dünya pazarından akar (turn.js).
    gold: Math.round(nation.gold),
    infamy: Math.round(nation.infamy ?? 0),
    tiles: nation.tiles,
    cities: cities.length,
    factories: economy.factories?.length ?? 0,
    factoryLevels: (economy.factories ?? []).reduce((sum, f) => sum + f.level, 0),
    structures: construction.buildings.length,
    projects: construction.projects.length,
    units: units.length,
    heavyUnits: units.filter((unit) => unit.type.id === 'CAVALRY' || unit.type.id === 'WARSHIP').length,
    gdp: Math.round(economy.gdp ?? 0),
    // İhracat/ithalat hane ve firma akışıdır; hazineye yalnız tarife girer.
    exportValue: Math.round(trade.exportValue ?? 0),
    importValue: Math.round(trade.importValue ?? 0),
    tradeBalance: Math.round(trade.balance ?? 0),
    net: Object.fromEntries(
      Object.entries(nation.budget?.net ?? {}).map(([key, value]) => [key, Math.round(value)]),
    ),
    production: Object.fromEntries(
      Object.entries(nation.budget?.production ?? {}).map(([key, value]) => [key, Math.round(value)]),
    ),
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
  // Dünya pazarı haftalık kapanır; hacim tek turluk fotoğraf değil, toplam akıştır.
  let marketGdp = 0;
  let tradeVolume = 0;
  let weeks = 0;
  const trace = [];

  while (!game.turns.victory && game.turns.turn < FINAL_TURN) {
    game.turns.endTurn();
    weeks++;
    marketGdp += game.world.market?.totalGdp ?? 0;
    for (const nation of game.world.nations) {
      if (!nation.alive) continue;
      tradeVolume += nation.economy?.trade?.exportValue ?? 0;
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
    // 'hegemony' esige ulasildi, 'time' 300. hafta doldu demek.
    reason: victory?.reason ?? null,
    winnerEconomyShare: winnerScore
      ? Math.round((winnerScore.economy / winnerScore.total) * 100)
      : null,
    winnerDirectLandShare: winnerScore
      ? Math.round(((victory.nation.tiles * 0.04) / winnerScore.total) * 100)
      : null,
    winnerOwnedLandShare: victory
      ? Math.round((victory.nation.tiles / Math.max(1, ownedTiles)) * 100)
      : null,
    meanMarketGdp: weeks ? Math.round(marketGdp / weeks) : 0,
    tradeVolume: Math.round(tradeVolume),
    richest: richest ? nationSnapshot(game.world, richest, game.turns.turn) : null,
    ...(trace.length ? { trace } : {}),
  });
}

const goldPeaks = results.map((result) => result.richest?.gold ?? 0);
const tradeVolumes = results.map((result) => result.tradeVolume);
const marketGdps = results.map((result) => result.meanMarketGdp);
const turns = results.map((result) => result.turn);
const conquestWins = results.filter((result) => result.byConquest).length;
const economyShares = results.map((result) => result.winnerEconomyShare ?? 0);
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
  hegemonyWinRate: `${Math.round(
    (results.filter((result) => result.reason === 'hegemony').length / gameCount) * 100,
  )}%`,
  winnerComposition: {
    economyMedian: `${percentile(economyShares, 0.5)}%`,
    directLandMedian: `${percentile(directLandShares, 0.5)}%`,
    ownedLandMedian: `${percentile(ownedLandShares, 0.5)}%`,
  },
  richestGold: {
    median: percentile(goldPeaks, 0.5),
    p90: percentile(goldPeaks, 0.9),
    max: Math.max(...goldPeaks),
  },
  marketGdp: {
    median: percentile(marketGdps, 0.5),
    p90: percentile(marketGdps, 0.9),
  },
  tradeVolume: {
    median: percentile(tradeVolumes, 0.5),
    p90: percentile(tradeVolumes, 0.9),
  },
  richestEver,
  highGoldGames,
}, null, 2));
