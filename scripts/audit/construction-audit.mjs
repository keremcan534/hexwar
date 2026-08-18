// Q. INSAAT ISTISMAR TESTI
//
// v15'ten itibaren yerlesik bina yalniz KALE; insaat kapasitesi ve
// yuksekogretim ULUSAL yatirimdir (bkz. construction.NATIONAL_INVESTMENTS).
// Denetim uc soruya bakar: bedel gercekten pesin mi, kapasite yatirimi
// bedavaya donusen bir carkl mi (A/B kiyasi), kale yerel etkisini ve
// yuva sinirini koruyor mu.

import {
  headless, run, runPeaceful, runScenario, pickNation, section, sub, table,
  finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import {
  BASE_CONSTRUCTION_POWER, CONSTRUCTION_TYPES, FORT_DEFENSE, FORT_RADIUS,
  NATIONAL_INVESTMENTS, cancelConstruction, constructionAtlas, constructionCount,
  constructionPower, constructionUpkeep, ensureConstruction, fortDefenseAt,
  higherEducationBonus, investmentCost, investmentLevel, prioritizeConstruction,
  queueConstruction, queueInvestment,
} from '../../src/game/construction.js';
import { buildFactory, factoryCost, factoryMargin, FACTORIES } from '../../src/game/economy.js';

const SEED = 'construction-audit';

section('Q. INSAAT SISTEMI');

// ------------------------------------------- 1) BEDELLER PESIN MI? ---
sub('Bina ve ulusal yatirim kuyruga girerken hazineden ne cikiyor?');
{
  const game = headless(SEED);
  run(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const region = constructionAtlas(game.world, nation.id).regions[0];
  const rows = [];
  for (const typeId of Object.keys(CONSTRUCTION_TYPES)) {
    nation.gold = 5000;
    const before = nation.gold;
    const ok = queueConstruction(game, nation.id, region.id, typeId);
    const project = ensureConstruction(nation).projects.slice(-1)[0];
    rows.push({
      typeId,
      declaredCost: CONSTRUCTION_TYPES[typeId].cost,
      goldPaid: before - nation.gold,
      work: ok ? project.work : null,
      queued: ok,
    });
  }
  for (const id of Object.keys(NATIONAL_INVESTMENTS)) {
    nation.gold = 5000;
    if (id === 'HIGHER_EDUCATION') nation.economy.social.education = 100;
    const declared = investmentCost(nation, id);
    const before = nation.gold;
    const ok = queueInvestment(game, nation.id, id);
    const project = ensureConstruction(nation).projects.slice(-1)[0];
    rows.push({
      typeId: id, declaredCost: declared, goldPaid: before - nation.gold,
      work: ok ? project.work : null, queued: ok,
    });
  }
  console.log(table(rows, [
    { label: 'kalem', get: (r) => r.typeId, right: false },
    { label: 'ilanEdilenBedel', get: (r) => r.declaredCost },
    { label: 'hazinedenCikan', get: (r) => n2(r.goldPaid) },
    { label: 'projeIsi(work)', get: (r) => r.work ?? '-' },
    { label: 'kuyrugaGirdi', get: (r) => (r.queued ? 'evet' : 'HAYIR') },
  ]));
  const free = rows.filter((r) => r.queued && r.goldPaid === 0);
  if (free.length) {
    finding('HIGH', 'Pesin bedel odemeyen kalem var',
      'her bina/yatirim ilan edilen bedeli kuyruga girerken oder',
      `${free.map((r) => r.typeId).join(', ')} hazineden 0 altin cikardi`, '');
  } else {
    console.log('  OK  her kalem ilan edilen bedeli pesin oduyor.');
  }
  nation.gold = 0;
  const brokeFort = queueConstruction(game, nation.id, region.id, 'FORT');
  const brokeInvest = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
  if (brokeFort || brokeInvest) {
    finding('HIGH', 'Parasiz devlet insaata baslayabiliyor',
      'bedeli odeyemeyen devlet kuyruga yazamamali',
      `hazine 0 iken fort=${brokeFort} yatirim=${brokeInvest}`, '');
  } else {
    console.log('  OK  hazine 0 iken ne kale ne yatirim baslatilabiliyor.');
  }
}

// -------------------------------------- 2) KAPASITE A/B/C KIYASI ---
sub('Kapasite yatirimi: hic (A) / dengeli (C) / agresif (B) — 200 hafta');
{
  const rows = [0, 1, 3, 6, 12].map((count) => ({
    count,
    r: runScenario({
      seed: SEED, warmup: 60, weeks: 200, peaceful: true,
      mutations: count > 0 ? [{ name: 'grantConstructionSectors', args: { count } }] : [],
      measure: ['construction'],
    }),
  }));
  console.log(table(rows, [
    { label: 'kapasite', get: (x) => x.count },
    { label: 'gercekSeviye', get: (x) => x.r.construction.sectors },
    { label: 'insaatGucu', get: (x) => x.r.construction.power },
    { label: 'haftalikBakim', get: (x) => n2(x.r.construction.upkeep) },
    { label: 'bekleyenProje', get: (x) => x.r.construction.projects.length },
    { label: 'tesis', get: (x) => x.r.snap.factories },
    { label: 'toplamSeviye', get: (x) => x.r.snap.factoryLevels },
    { label: 'gdp', get: (x) => n1(x.r.snap.gdp) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
    { label: 'borc', get: (x) => n0(x.r.snap.debt) },
  ]));
  const lo = rows[0].r;
  const hi = rows[rows.length - 1].r;
  console.log(`\n  0 -> 12 seviye: insaat gucu ${lo.construction.power} -> ${hi.construction.power},`
    + ` GSYH ${n1(lo.snap.gdp)} -> ${n1(hi.snap.gdp)}, hazine ${n0(lo.snap.gold)} -> ${n0(hi.snap.gold)}`);
  const dGdp = relDelta(lo.snap.gdp, hi.snap.gdp);
  const dGold = hi.snap.gold - lo.snap.gold;
  // KABUL OLCUTU (budama plani, Faz 3): agresif kapasite (B) dengeliye (C)
  // karsi BEDAVA ustunluk kurmamali — GSYH artarken hazine de artiyorsa
  // yatirimin firsat maliyeti yok demektir.
  if (dGdp > 0.15 && dGold > 0) {
    finding('MEDIUM', 'Kapasite yatirimi kendini fazlasiyla amorti ediyor',
      'seviye bakimi buyumeyi bir noktada frenlemeli',
      `12 seviye 200 haftada GSYH'yi ${pct(dGdp)} artirdi VE hazine ${n0(dGold)} daha yuksek`,
      `bakim toplami ${n2(hi.construction.upkeep)}/hafta`);
  }
  if (lo.snap.gold < -50) {
    finding('MEDIUM', 'Kapasitesiz ulke (A) oynanamaz durumda',
      'hic yatirim yapmayan ulke yasayabilmeli',
      `taban guc ${BASE_CONSTRUCTION_POWER} ile hazine ${n0(lo.snap.gold)}`, '');
  }
}

// ------------------------------------- 3) SIFIR PARA / TEMERRUT ---
sub('Bedeli odenmis proje parasiz ilerler; temerrut kademeli koreltir');
{
  const game = headless(SEED);
  run(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const region = constructionAtlas(game.world, nation.id).regions[0];
  nation.gold = 500;
  queueConstruction(game, nation.id, region.id, 'FORT');
  const project = ensureConstruction(nation).projects.slice(-1)[0];
  nation.gold = 0;
  const before = project.progress;
  runPeaceful(game, 4);
  const still = ensureConstruction(nation).projects.find((p) => p.id === project.id);
  console.log(`  bedeli ODENMIS proje, hazine 0 iken 4 haftada: ${n2(before)}`
    + ` -> ${still ? n2(still.progress) : 'BITTI'}`);
  nation.gold = 1;
  const on = { power: constructionPower(nation), edu: higherEducationBonus(nation) };
  nation.gold = 0;
  const off = { power: constructionPower(nation), edu: higherEducationBonus(nation) };
  if (on.power !== off.power || on.edu !== off.edu) {
    finding('LOW', 'Etkilerde gizli 1-altinlik ucurum',
      'etkiler hazine bakiyesine gore ani acilip kapanmamali',
      `hazine 1 -> 0: guc ${on.power} -> ${off.power}, egitim ${n2(on.edu)} -> ${n2(off.edu)}`, '');
  } else {
    console.log('  OK  hazine 1 -> 0 gecisinde hicbir etki sicramiyor (olcut kredi itibari).');
  }
}

// ------------------------------------------ 4) IPTAL ISTISMARI ---
sub('Iptal-yeniden kur dongusu para uretiyor mu?');
{
  const game = headless(SEED);
  run(game, 80);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const world = game.world;
  const region = constructionAtlas(world, nation.id).regions
    .find((r) => r.free > 0) ?? constructionAtlas(world, nation.id).regions[0];

  nation.gold = 5000;
  const goldA = nation.gold;
  for (let i = 0; i < 50; i++) {
    if (!queueConstruction(game, nation.id, region.id, 'FORT')) break;
    const p = ensureConstruction(nation).projects.slice(-1)[0];
    cancelConstruction(game, nation.id, p.id);
  }
  const fortDrift = nation.gold - goldA;
  console.log(`  kale: 50 kez kur-iptal -> hazine farki ${n2(fortDrift)}`);
  if (fortDrift > 1e-6) {
    finding('CRITICAL', 'Kale kur-iptal dongusu para uretiyor', 'iade <= odenen', `fark +${n2(fortDrift)}`, '');
  }
  const goldI = nation.gold;
  for (let i = 0; i < 20; i++) {
    if (!queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY')) break;
    const p = ensureConstruction(nation).projects.slice(-1)[0];
    cancelConstruction(game, nation.id, p.id);
  }
  const investDrift = nation.gold - goldI;
  console.log(`  yatirim: 20 kez kur-iptal -> hazine farki ${n2(investDrift)}`);
  if (investDrift > 1e-6) {
    finding('CRITICAL', 'Yatirim kur-iptal dongusu para uretiyor', 'iade <= odenen', `fark +${n2(investDrift)}`, '');
  }

  // Devlet fabrikasi iptali (eski Q4b — degismedi).
  const typeId = Object.keys(FACTORIES)
    .filter((id) => (FACTORIES[id].availableFrom ?? 0) <= world.turn)
    .sort((a, b) => factoryMargin(world, b) - factoryMargin(world, a))[0];
  nation.gold = 5000;
  const goldB = nation.gold;
  const cost = factoryCost(nation, typeId);
  const built = buildFactory(game, nation, region.id, typeId);
  const afterBuild = nation.gold;
  const project = ensureConstruction(nation).projects.slice(-1)[0];
  const cancelled = built ? cancelConstruction(game, nation.id, project.id) : false;
  const refunded = nation.gold - afterBuild;
  console.log(`  devlet fabrikasi (${typeId}, bedel ${cost.gold}): odenen ${n0(goldB - afterBuild)}, iade ${n0(refunded)}`);
  if (built && cancelled && refunded <= 0) {
    finding('MEDIUM', 'Fabrika projesi iptalinde para iade edilmiyor',
      'harcanmamis para hazineye donmeli', 'iade 0', '');
  }
  if (refunded > goldB - afterBuild + 1e-6) {
    finding('CRITICAL', 'Iptal para uretiyor', 'iade <= odenen', '', '');
  }

  const state = ensureConstruction(nation);
  const ids = state.projects.map((p) => p.id);
  let swaps = 0;
  for (let i = 0; i < 20 && ids.length; i++) {
    if (prioritizeConstruction(game, nation.id, ids[0], -1)) swaps++;
    if (prioritizeConstruction(game, nation.id, ids[0], 1)) swaps++;
  }
  console.log(`  oncelik degisimi ${swaps} kez; proje ${state.projects.length}`);
}

// ----------------------------------------- 5) KALE: YUVA VE YEREL ETKI ---
sub('Kale spam siniri ve yerel etki');
{
  const game = headless(SEED);
  run(game, 100);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  nation.gold = 100000;
  const atlas = constructionAtlas(game.world, nation.id);
  let queued = 0;
  for (const region of atlas.regions) {
    for (let i = 0; i < 6; i++) {
      if (queueConstruction(game, nation.id, region.id, 'FORT')) queued++;
    }
  }
  const after = constructionAtlas(game.world, nation.id);
  console.log(`  ${atlas.regions.length} bolge · spam denemesi -> kuyruga giren ${queued}`);
  const overfull = after.regions.filter((r) => r.used > r.slots);
  const perRegion = after.regions.every((r) => (
    r.buildings.filter((b) => b.typeId === 'FORT').length
      + r.projects.filter((p) => p.typeId === 'FORT').length
      <= CONSTRUCTION_TYPES.FORT.maxPerRegion
  ));
  if (overfull.length || !perRegion) {
    finding('HIGH', 'Kale yuva/bolge siniri asilabiliyor', 'used <= slots ve tur siniri', '', '');
  } else {
    console.log('  OK  yuva ve bolge basi sinir tutuyor.');
  }
  runPeaceful(game, 120);
  const fortCount = constructionCount(nation, 'FORT');
  const anchorBuilding = ensureConstruction(nation).buildings.find((b) => b.typeId === 'FORT');
  if (anchorBuilding) {
    const anchor = game.world.get(anchorBuilding.q, anchorBuilding.r);
    const nearDefense = fortDefenseAt(game.world, nation.id, anchor);
    const farTile = game.world.tiles.find((t) => t.owner === nation.id && t.terrain.passable
      && game.world.wrapDistance(t.q, t.r, anchor.q, anchor.r) > FORT_RADIUS
      && fortDefenseAt(game.world, nation.id, t) === 0);
    console.log(`  ${fortCount} kale · capadaki savunma ${pct(nearDefense)} ·`
      + ` yaricap disi sifir ornegi ${farTile ? 'var' : 'bulunamadi'}`);
    if (nearDefense < FORT_DEFENSE) {
      finding('HIGH', 'Kale capasinda etki yok',
        'kale kendi karesini savunmali', `capa ${pct(nearDefense)}`, '');
    }
  }
  console.log(`  bakim ${n2(constructionUpkeep(nation))}/hafta, hazine ${n0(nation.gold)}`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
