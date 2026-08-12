// Q. INSAAT ISTISMAR TESTI

import {
  headless, run, runPeaceful, runScenario, pickNation, section, sub, table,
  finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import {
  BASE_CONSTRUCTION_POWER, CONSTRUCTION_TYPES, cancelConstruction,
  constructionAtlas, constructionCount, constructionPower, constructionTaxMultiplier,
  constructionUpkeep, ensureConstruction, prioritizeConstruction, queueConstruction,
  universityWorkforceBonus,
} from '../../src/game/construction.js';
import { buildFactory, factoryCost, factoryMargin, FACTORIES } from '../../src/game/economy.js';
import { fortDefenseAt } from '../../src/game/construction.js';

const SEED = 'construction-audit';

section('Q. INSAAT SISTEMI');

// ------------------------------------------- 1) BINALARIN GERCEK BEDELI ---
sub('Bina kuyruga girerken hazineden ne kadar cikiyor?');
{
  const game = headless(SEED);
  run(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const region = constructionAtlas(game.world, nation.id).regions[0];
  const rows = [];
  for (const typeId of Object.keys(CONSTRUCTION_TYPES)) {
    // Her tur icin ayni kosul: hazine bol olsun ki olculen sey BEDEL olsun,
    // "onceki binadan sonra parasi kalmadi" olmasin.
    nation.gold = 5000;
    const before = nation.gold;
    const ok = queueConstruction(game, nation.id, region.id, typeId);
    const project = ensureConstruction(nation).projects.slice(-1)[0];
    rows.push({
      typeId,
      declaredCost: CONSTRUCTION_TYPES[typeId].cost,
      goldPaid: before - nation.gold,
      work: ok ? project.work : null,
      projectCost: ok ? project.cost : null,
      upkeep: CONSTRUCTION_TYPES[typeId].upkeep,
      queued: ok,
    });
  }
  console.log(table(rows, [
    { label: 'bina', get: (r) => r.typeId, right: false },
    { label: 'tablodakiCost', get: (r) => r.declaredCost },
    { label: 'hazinedenCikan', get: (r) => n2(r.goldPaid) },
    { label: 'projeIsi(work)', get: (r) => r.work ?? '-' },
    { label: 'projeParasi(cost)', get: (r) => r.projectCost ?? '-' },
    { label: 'haftalikBakim', get: (r) => r.upkeep },
  ]));
  const free = rows.filter((r) => r.queued && r.goldPaid === 0);
  if (free.length) {
    finding('HIGH', 'Devlet binalari PESIN BEDELSIZ',
      'CONSTRUCTION_TYPES.cost bir altin bedeli olmali',
      `${free.length}/${rows.length} bina turu kuyruga girerken hazineden 0 altin cikariyor`,
      '`cost` alani normalizeProject icinde `work` (insaat isi) olarak kullaniliyor,'
      + ' project.cost 0 kaliyor, projectFundingRatio 1 donuyor. Bina yalniz haftalik'
      + ' bakim odiyor; kurulusu tamamen bedava. Fabrika projeleri ise pesin oduyor.');
  } else {
    console.log('  OK  her bina turu tablodaki bedeli pesin oduyor.');
  }
  // Parasiz devlet bina BASLATAMAMALI (baslamis proje isle ilerler, parayla degil).
  nation.gold = 0;
  const brokeCanStart = queueConstruction(game, nation.id, region.id, 'FORT');
  console.log(`  hazine 0 iken yeni bina baslatilabiliyor mu: ${brokeCanStart ? 'EVET' : 'hayir'}`);
  if (brokeCanStart) {
    finding('HIGH', 'Parasiz devlet bina baslatabiliyor',
      'bedeli odeyemeyen devlet projeyi kuyruga alamamali', 'FORT kuyruga girdi', '');
  }
}

// -------------------------------------------- 2) INSAAT GUCU KADEMELERI ---
sub('Insaat sektoru sayisi -> insaat gucu, bakim, sanayilesme hizi (200 hafta)');
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
    { label: 'sektor', get: (x) => x.count },
    { label: 'gercekSektor', get: (x) => x.r.construction.sectors },
    { label: 'insaatGucu', get: (x) => x.r.construction.power },
    { label: 'haftalikBakim', get: (x) => n2(x.r.construction.upkeep) },
    { label: 'bekleyenProje', get: (x) => x.r.construction.projects.length },
    { label: 'tesis', get: (x) => x.r.snap.factories },
    { label: 'toplamSeviye', get: (x) => x.r.snap.factoryLevels },
    { label: 'kadro', get: (x) => n0(x.r.snap.employees) },
    { label: 'gdp', get: (x) => n1(x.r.snap.gdp) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
    { label: 'borc', get: (x) => n0(x.r.snap.debt) },
  ]));
  const lo = rows[0].r;
  const hi = rows[rows.length - 1].r;
  console.log(`\n  0 -> 12 sektor: insaat gucu ${lo.construction.power} -> ${hi.construction.power},`
    + ` sanayi ${lo.snap.factories}/${lo.snap.factoryLevels} -> ${hi.snap.factories}/${hi.snap.factoryLevels},`
    + ` GSYH ${n1(lo.snap.gdp)} -> ${n1(hi.snap.gdp)}, hazine ${n0(lo.snap.gold)} -> ${n0(hi.snap.gold)}`);
  const dGdp = relDelta(lo.snap.gdp, hi.snap.gdp);
  const dGold = hi.snap.gold - lo.snap.gold;
  if (dGdp > 0.15 && dGold > 0) {
    finding('MEDIUM', 'Insaat sektoru kendini fazlasiyla amorti ediyor',
      'sektor bakimi (4/hafta) buyumeyi bir noktada frenlemeli',
      `12 sektor 200 haftada GSYH'yi ${pct(dGdp)} artirdi VE hazine ${n0(dGold)} daha yuksek`,
      `bakim toplami ${n2(hi.construction.upkeep)}/hafta, buna karsilik ek uretim degeri cok daha buyuk`);
  }
  if (relDelta(lo.snap.factoryLevels, hi.snap.factoryLevels) < 0.05) {
    finding('MEDIUM', 'Insaat gucu sanayilesmeyi hizlandirmiyor',
      'daha cok santiye daha hizli fabrika demeli',
      `0 sektor ${lo.snap.factoryLevels} seviye, 12 sektor ${hi.snap.factoryLevels} seviye`,
      'darbogaz insaat gucu degil, isgucu ya da para olabilir');
  }
}

// ------------------------------------- 3) SIFIR KAPASITE / SIFIR PARA ---
sub('Kapasite ve para olmadan proje ilerliyor mu?');
{
  const game = headless(SEED);
  run(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const region = constructionAtlas(game.world, nation.id).regions[0];
  queueConstruction(game, nation.id, region.id, 'FORT');
  const project = ensureConstruction(nation).projects.slice(-1)[0];
  nation.gold = 0;
  const before = project.progress;
  runPeaceful(game, 4);
  const still = ensureConstruction(nation).projects.find((p) => p.id === project.id);
  console.log(`  bedeli ODENMIS proje, hazine 0 iken 4 haftada: ${n2(before)}`
    + ` -> ${still ? n2(still.progress) : 'BITTI'}`
    + ` (taban insaat gucu ${BASE_CONSTRUCTION_POWER}/hafta, sektor bonusu gold>0 sartina bagli)`);
  console.log('  NOT: bu DOGRU davranis — bedel pesin odendi, kalan is insaat gucuyle yapilir.');

  // gold > 0 esigi: butun bina bonuslari tam 0'da kayboluyor
  nation.gold = 1;
  const on = {
    power: constructionPower(nation),
    tax: constructionTaxMultiplier(nation),
    uni: universityWorkforceBonus(nation),
  };
  nation.gold = 0;
  const off = {
    power: constructionPower(nation),
    tax: constructionTaxMultiplier(nation),
    uni: universityWorkforceBonus(nation),
  };
  console.log(`  hazine 1 altin: guc ${on.power}, vergi carpani ${n2(on.tax)}, universite ${n2(on.uni)}`);
  console.log(`  hazine 0 altin: guc ${off.power}, vergi carpani ${n2(off.tax)}, universite ${n2(off.uni)}`);
  if (on.power !== off.power || on.tax !== off.tax) {
    finding('LOW', 'Bina bonuslarinda gizli 1-altinlik ucurum',
      'bina etkileri hazine bakiyesine gore ani acilip kapanmamali',
      `hazine 1 -> 0 arasinda insaat gucu ${on.power} -> ${off.power},`
      + ` vergi carpani ${n2(on.tax)} -> ${n2(off.tax)}`,
      'constructionPower/constructionTaxMultiplier/universityWorkforceBonus/fortDefenseAt'
      + ' hepsi `nation.gold > 0` kapisi kullaniyor: 0.0 altinda ulke butun altyapisini kaybediyor');
  }
}

// ------------------------------------------ 4) IPTAL / ONCELIK ISTISMARI ---
sub('Iptal-yeniden kur dongusu para uretiyor mu?');
{
  const game = headless(SEED);
  run(game, 80);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const world = game.world;
  const region = constructionAtlas(world, nation.id).regions
    .find((r) => r.free > 0) ?? constructionAtlas(world, nation.id).regions[0];

  // (a) Bedelsiz bina: iptal/ekle dongusu
  const goldA = nation.gold;
  for (let i = 0; i < 50; i++) {
    if (!queueConstruction(game, nation.id, region.id, 'FORT')) break;
    const p = ensureConstruction(nation).projects.slice(-1)[0];
    cancelConstruction(game, nation.id, p.id);
  }
  console.log(`  bina: 50 kez kur-iptal et -> hazine ${n0(goldA)} -> ${n0(nation.gold)}`
    + ` (fark ${n2(nation.gold - goldA)})`);

  // (b) Devlet fabrikasi: pesin odenir, iptalde geri gelir mi?
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
  const afterCancel = nation.gold;
  const paid = goldB - afterBuild;
  const refunded = afterCancel - afterBuild;
  console.log(`  devlet fabrikasi (${typeId}, bedel ${cost.gold}):`
    + ` kurulus ${n0(goldB)} -> ${n0(afterBuild)} · iptal sonrasi ${n0(afterCancel)}`
    + ` (odenen ${n0(paid)}, iade ${n0(refunded)})`);
  if (built && cancelled && refunded <= 0) {
    finding('MEDIUM', 'Fabrika projesi iptalinde para iade edilmiyor',
      'iptal edilen projenin harcanmamis parasi hazineye donmeli',
      `${cost.gold} altin pesin odendi, proje iptal edildi, hazineye 0 altin dondu`, '');
  }
  if (refunded > paid + 1e-6) {
    finding('CRITICAL', 'Iptal para uretiyor', 'iade odenenden FAZLA olamaz',
      `odendi ${n0(paid)}, iade ${n0(refunded)}`, '');
  }

  // Yarim kalmis proje: yapilan is batiktir, yalniz kalan pay iade edilmeli.
  nation.gold = 5000;
  const partialStart = nation.gold;
  if (buildFactory(game, nation, region.id, typeId)) {
    const half = ensureConstruction(nation).projects.slice(-1)[0];
    const spent = partialStart - nation.gold;
    runPeaceful(game, 6);
    const live = ensureConstruction(nation).projects.find((p) => p.id === half.id);
    const progressed = live ? live.progress / live.work : 1;
    const goldBefore = nation.gold;
    if (live) cancelConstruction(game, nation.id, half.id);
    const back = nation.gold - goldBefore;
    console.log(`  yarim proje: odenen ${n0(spent)}, ilerleme ${pct(progressed)},`
      + ` iade ${n0(back)} (beklenen ~${n0(spent * (1 - progressed))})`);
    if (back > spent + 1e-6) {
      finding('CRITICAL', 'Yarim projede iade odenenden fazla',
        'iade <= odenen', `odendi ${n0(spent)}, iade ${n0(back)}`, '');
    }
  }

  // (c) Oncelik manipulasyonu
  const state = ensureConstruction(nation);
  const ids = state.projects.map((p) => p.id);
  let swaps = 0;
  for (let i = 0; i < 20; i++) {
    if (prioritizeConstruction(game, nation.id, ids[0], -1)) swaps++;
    if (prioritizeConstruction(game, nation.id, ids[0], 1)) swaps++;
  }
  console.log(`  oncelik degisimi ${swaps} kez uygulandi; proje sayisi ${state.projects.length},`
    + ` toplam ilerleme ${n2(state.projects.reduce((s, p) => s + p.progress, 0))}`);
}

// ----------------------------------------- 5) SLOT VE TUR SINIRI ---
sub('Bolge yuvasi ve tur basina sinir gercekten baglayici mi');
{
  const game = headless(SEED);
  run(game, 100);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const atlas = constructionAtlas(game.world, nation.id);
  let queued = 0;
  for (const region of atlas.regions) {
    for (const typeId of Object.keys(CONSTRUCTION_TYPES)) {
      for (let i = 0; i < 6; i++) {
        if (queueConstruction(game, nation.id, region.id, typeId)) queued++;
      }
    }
  }
  const after = constructionAtlas(game.world, nation.id);
  console.log(`  ${atlas.regions.length} bolge · toplam yuva ${atlas.slots} · spam sonrasi kuyruk ${queued} proje`);
  console.log(`  bolge doluluk: ${after.regions.map((r) => `${r.used}/${r.slots}`).join(' ')}`);
  const overfull = after.regions.filter((r) => r.used > r.slots);
  if (overfull.length) {
    finding('HIGH', 'Bolge yuvasi asilabiliyor', 'used <= slots',
      `${overfull.length} bolge yuvasini asti`, '');
  } else {
    console.log('  OK  yuva siniri tutuyor; sinirsiz bina kuyruga alinamiyor.');
  }
  // Kuyruk bittiginde bakim faturasi
  runPeaceful(game, 120);
  console.log(`  120 hafta sonra: ${constructionCount(nation, 'FORT')} kale,`
    + ` ${constructionCount(nation, 'CONSTRUCTION_SECTOR')} santiye,`
    + ` bakim ${n2(constructionUpkeep(nation))}/hafta, hazine ${n0(nation.gold)},`
    + ` borc ${n0(nation.debt ?? 0)}`);
  const tile = game.world.tiles.find((t) => t.owner === nation.id && t.terrain.passable);
  console.log(`  kale savunma bonusu (ornek kare): ${pct(fortDefenseAt(game.world, nation.id, tile))}`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
