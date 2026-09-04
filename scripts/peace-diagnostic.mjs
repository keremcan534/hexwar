// Baris masasinin iki tarafli calistigini dogrular.
//
// Onceden YZ ayri bir yoldan gidiyordu: `makePeace` isgal edilen her kareyi
// otomatik devrediyor, sart koymuyor, oyuncuya teklif gondermiyordu. Burada
// olculen sey su: YZ de oyuncuyla ayni araclari (warscore butcesi, talep,
// sart) kullaniyor mu ve kazanan taraf beyaz barisi reddedebiliyor mu.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { computeContacts, declareWarNow } from '../src/game/diplomacy.js';
import { controllerOf } from '../src/game/control.js';
import {
  MAX_DEMAND_PROVINCES, PEACE_TERMS, buildOffer, occupiedProvincesOf, offerAcceptable,
  offerCost, provinceKeyOf, provinceWarCost, signPeace, warScore,
} from '../src/game/peace.js';

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

/**
 * Sinir komsusu iki ulke bulur ve saldirana hedefin karelerini isgal ettirir.
 * `held` 1'den kucukse hedefin karelerinin orani, degilse mutlak sayidir.
 */
function occupiedWar(seed, held = 5) {
  const game = headless(seed);
  const world = game.world;
  let pair = null;
  world.forEach((tile) => {
    if (pair || tile.owner < 0 || !tile.terrain.passable) return;
    const near = world.neighbors(tile).find(
      (n) => n.owner >= 0 && n.owner !== tile.owner && n.terrain.passable,
    );
    if (near) pair = { a: tile.owner, b: near.owner };
  });
  if (!pair) throw new Error('Sinir komsusu bulunamadi.');
  declareWarNow(game, pair.a, pair.b);
  game.turns.turn += 20;   // MIN_WAR_TURNS gecsin

  const theirs = world.tiles.filter((t) => t.owner === pair.b && t.terrain.passable);
  const want = held <= 1 ? Math.floor(theirs.length * held) : held;
  // b'nin KUMELERINI a isgal etsin: masada yalniz tamamen isgal edilmis kume
  // istenebildigi icin isgal kume kume ilerletilir (kusatma tamamlama kurali).
  let taken = 0;
  for (const cluster of (world.provinces ?? [])) {
    if (taken >= want) break;
    if (cluster.owner !== pair.b || !cluster.econ) continue;
    for (const idx of cluster.tileIdx) {
      world.tiles[idx].controller = pair.a;
      taken++;
    }
  }
  return { game, ...pair, taken, theirs: theirs.length };
}

function section(title) {
  console.log(`\n=== ${title}`);
}

let failures = 0;
function check(label, ok, detail = '') {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- 0) Warscore olcegi: isgal payi ile puan nasil oluyor ---
section('warscore olcegi (isgal payi -> puan)');
{
  for (const share of [0.1, 0.25, 0.5, 0.75, 0.95]) {
    const { game, a, b, taken, theirs } = occupiedWar('peace-scale', share);
    const world = game.world;
    const score = warScore(world, a, b);
    const land = buildOffer(world, a, b);
    const mixed = buildOffer(world, a, b, { termShare: 0.5 });
    console.log(`  isgal %${String(Math.round((taken / theirs) * 100)).padStart(2)}`
      + ` (${taken}/${theirs} kare) -> warscore ${String(score).padStart(3)}`
      + ` · toprak odakli ${land.demands.length} kare + ${land.terms.length} sart`
      + ` · karma ${mixed.demands.length} kare + ${mixed.terms.length} sart`);
  }
}

// --- 1) Teklif kurma: butce warscore, talep tutulan topraktan gelir ---
section('buildOffer warscore butcesini asmaz');
{
  const { game, a, b } = occupiedWar('peace-1', 6);
  const world = game.world;
  const score = warScore(world, a, b);
  const offer = buildOffer(world, a, b);
  const cost = offerCost(world, offer);
  console.log(`  warscore ${score} · talep ${offer.demands.length} kare`
    + ` · sart ${offer.terms.length} · bedel ${cost}`);
  check('bedel butceyi asmiyor', cost <= Math.max(0, score), `${cost} <= ${Math.max(0, score)}`);
  check('karsi taraf kabul ediyor', offerAcceptable(world, a, b, offer));
  check(`en fazla ${MAX_DEMAND_PROVINCES} kume`, offer.demands.length <= MAX_DEMAND_PROVINCES);

  const held = new Set(occupiedProvincesOf(world, a, b).map(({ province }) => provinceKeyOf(province)));
  check('yalniz cephede tamamen tutulan kumeler isteniyor',
    offer.demands.every((key) => held.has(key)));
}

// --- 2) Istah butceyi kisar ---
section('appetite talebi kisar');
{
  const { game, a, b } = occupiedWar('peace-2', 6);
  const world = game.world;
  const full = offerCost(world, buildOffer(world, a, b, { appetite: 1 }));
  const half = offerCost(world, buildOffer(world, a, b, { appetite: 0.5 }));
  console.log(`  tam istah ${full} · yari istah ${half}`);
  check('yari istah daha az istiyor', half <= full, `${half} <= ${full}`);
}

// --- 3) Warscore yoksa teklif beyaz baristir ---
section('kozsuz taraf beyaz baris teklif eder');
{
  const { game, a, b } = occupiedWar('peace-3', 0);
  const world = game.world;
  // Kaybeden taraf: b'nin gozunden bakiyoruz, elinde isgal yok.
  const offer = buildOffer(world, b, a);
  check('talep yok', offer.demands.length === 0);
  check('sart yok', offer.terms.length === 0);
  check('bedel sifir', offerCost(world, offer) === 0);
}

// --- 4) Imzalanan anlasma yalniz anlasilan kareleri devreder ---
section('signPeace sadece masadaki kareleri devreder');
{
  const { game, a, b } = occupiedWar('peace-4', 6);
  const world = game.world;
  const offer = buildOffer(world, a, b);
  const demanded = new Set(offer.demands);
  // Talep edilen kumelerin toplam hex sayisi: devir kume butunuyle olur.
  const demandedTiles = [...demanded].reduce((sum, key) => (
    sum + (world.provinces[Number(key.slice(1))]?.tileIdx.length ?? 0)
  ), 0);
  const occupiedBefore = occupiedProvincesOf(world, a, b).length;
  const aTilesBefore = world.nations[a].tiles;

  const ok = signPeace(game, a, b, offer);
  check('anlasma imzalandi', ok);
  check('devredilen kare sayisi talep edilen kumelerin toplami kadar',
    world.nations[a].tiles === aTilesBefore + demandedTiles,
    `${aTilesBefore} -> ${world.nations[a].tiles}, talep ${demanded.size} kume / ${demandedTiles} kare`);

  const stillOccupied = world.tiles.filter(
    (t) => t.owner === b && controllerOf(t) === a,
  ).length;
  check('anlasma disi isgaller kalkti', stillOccupied === 0,
    `barIs oncesi ${occupiedBefore} isgal, sonrasi ${stillOccupied}`);
}

// --- 5) Sartlar kaydedilip yuklenebiliyor ---
section('anlasma sartlari save/load hayatta kaliyor');
{
  const { game, a, b } = occupiedWar('peace-5', 0.9);
  const world = game.world;
  const offer = { demands: [], concessions: [], terms: ['REPARATIONS'] };
  const score = warScore(world, a, b);
  if (score >= PEACE_TERMS.REPARATIONS.cost) {
    signPeace(game, a, b, offer);
    const { deserialize, serialize } = await import('../src/game/save.js');
    const blob = serialize(game);
    const revived = headless('peace-5');
    deserialize(revived, JSON.parse(JSON.stringify(blob)));
    const treaties = revived.world.nations[b].treaties ?? [];
    check('tazminat sarti yuklemede duruyor',
      treaties.some((t) => t.type === 'REPARATIONS'),
      `${treaties.length} sart bulundu`);
  } else {
    console.log(`  ATLANDI — warscore ${score} tazminat icin yetmiyor`);
  }
}

// --- 6) Kume degeri: sehirli ve kalabalik kume pahali ---
section('provinceWarCost gelisime gore artiyor');
{
  const { game } = occupiedWar('peace-6', 1);
  const world = game.world;
  const hasCity = (p) => p.tileIdx.some((idx) => world.tiles[idx].city);
  const cityCluster = world.provinces.find((p) => p.owner >= 0 && p.econ && hasCity(p));
  const emptyCluster = world.provinces.find((p) => (
    p.owner >= 0 && p.econ && !hasCity(p)
    && p.econ.population / p.econ.hexes < 5000
  ));
  if (cityCluster && emptyCluster) {
    const c1 = provinceWarCost(world, cityCluster);
    const c2 = provinceWarCost(world, emptyCluster);
    console.log(`  sehirli kume ${c1} · bos kume ${c2}`);
    check('sehirli kume daha pahali', c1 > c2);
  } else {
    console.log('  ATLANDI — karsilastirilacak kume bulunamadi');
  }
}

// --- 7) YZ turu: oyuncuya teklif masaya duser, otomatik uygulanmaz ---
section('YZ teklifi oyuncuya masaya duser');
{
  const { game, a, b } = occupiedWar('peace-7', 6);
  const world = game.world;
  game.turns.playerNation = b;           // kaybeden taraf oyuncu olsun
  const bTilesBefore = world.nations[b].tiles;
  const offer = buildOffer(world, a, b);
  const entry = game.receivePeaceOffer(a, b, offer);
  check('teklif kuyruga girdi', Boolean(entry) && game.hasPeaceOffer(a, b));
  check('toprak kendiliginden el degistirmedi', world.nations[b].tiles === bTilesBefore);

  game.resolvePeaceOffer(entry.id, false);
  check('reddedince savas suruyor', !game.hasPeaceOffer(a, b)
    && world.relations[a][b].state === 'war');
}

// --- 8) Gercek oyun dongusu: YZ savaslari masada bitiyor mu ---
section('YZ savaslari masada bitiyor (elle baslatilan savaslar, 150 hafta)');
{
  const game = headless('peace-live');
  const world = game.world;
  // Savas ilani temposu ayri bir mesele (bkz. ai.js WAR_THRESHOLD); burada
  // olculen sey savasin nasil *bittigi*, o yuzden savaslari elle basliyoruz.
  const contacts = computeContacts(world);
  let started = 0;
  for (let a = 0; a < world.nations.length && started < 4; a++) {
    for (let b = a + 1; b < world.nations.length && started < 4; b++) {
      if (!contacts[a]?.[b]) continue;
      if (declareWarNow(game, a, b)) started++;
    }
  }
  console.log(`  ${started} savas elle baslatildi`);

  const before = new Map();
  let signed = 0;
  let withTerms = 0;
  let landTransfers = 0;

  for (let week = 0; week < 150; week++) {
    for (let a = 0; a < world.nations.length; a++) {
      for (let b = a + 1; b < world.nations.length; b++) {
        before.set(`${a}:${b}`, world.relations[a][b].state);
      }
    }
    const tilesBefore = world.nations.map((n) => n.tiles);
    game.turns.endTurn();
    for (let a = 0; a < world.nations.length; a++) {
      for (let b = a + 1; b < world.nations.length; b++) {
        if (before.get(`${a}:${b}`) === 'war' && world.relations[a][b].state === 'peace') {
          signed++;
          if (world.nations[a].tiles !== tilesBefore[a]) landTransfers++;
        }
      }
    }
  }
  withTerms = world.nations.reduce((sum, n) => sum + (n.treaties?.length ?? 0), 0);
  const wars = world.nations.filter((n, i) => world.nations.some(
    (o, j) => j > i && world.relations[i][j].state === 'war',
  )).length;
  console.log(`  imzalanan baris ${signed} · toprak degistiren ${landTransfers}`
    + ` · yururlukteki sart ${withTerms} · hala savasan ulke ${wars}`);
  check('YZ savaslari barisla bitiyor', signed > 0);
  check('anlasmalarin bir kismi toprak devrediyor', landTransfers > 0);
}

section('SONUC');
console.log(`  ${failures === 0 ? 'Hepsi gecti.' : `${failures} kontrol basarisiz.`}`);
process.exit(failures === 0 ? 0 : 1);
