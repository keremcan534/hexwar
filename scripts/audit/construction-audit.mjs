// Q. INSAAT ISTISMAR TESTI
//
// 2026-09'dan itibaren kuyrukta yalniz ulusal insaat kapasitesi yatirimi ve
// fabrika projeleri var (kale ve yuksekogretim kaldirildi, bkz.
// construction.js basligi). Denetim dort soruya bakar: bedel gercekten pesin
// mi, kapasite yatirimi bedavaya donusen bir cark mi (A/B kiyasi), iptal para
// uretiyor mu ve eski kayittaki kaldirilmis kalemler iz birakmadan cikiyor mu.

import {
  headless, run, runPeaceful, runScenario, pickNation, section, sub, table,
  finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import {
  BASE_CONSTRUCTION_POWER, NATIONAL_INVESTMENTS, cancelConstruction, constructionAtlas,
  constructionPower, ensureConstruction, investmentCost, prioritizeConstruction,
  queueInvestment,
} from '../../src/game/construction.js';
import { buildFactory, factoryCost, factoryMargin, FACTORIES } from '../../src/game/economy.js';
import { formGovernment } from '../../src/game/politics.js';

const SEED = 'construction-audit';

section('Q. INSAAT SISTEMI');

// ------------------------------------------- 1) BEDELLER PESIN MI? ---
sub('Ulusal yatirim kuyruga girerken hazineden ne cikiyor?');
{
  const game = headless(SEED);
  run(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const rows = [];
  for (const id of Object.keys(NATIONAL_INVESTMENTS)) {
    // Ikinci satir: kuyruktaki seviye fiyati yukseltmeli (fiyat kacirilamaz).
    for (let i = 0; i < 2; i++) {
      nation.gold = 5000;
      const declared = investmentCost(nation, id);
      const before = nation.gold;
      const ok = queueInvestment(game, nation.id, id);
      const project = ensureConstruction(nation).projects.slice(-1)[0];
      rows.push({
        typeId: `${id} #${i + 1}`, declaredCost: declared, goldPaid: before - nation.gold,
        work: ok ? project.work : null, queued: ok,
      });
    }
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
      'her yatirim ilan edilen bedeli kuyruga girerken oder',
      `${free.map((r) => r.typeId).join(', ')} hazineden 0 altin cikardi`, '');
  } else {
    console.log('  OK  her kalem ilan edilen bedeli pesin oduyor.');
  }
  if (rows.length >= 2 && !(rows[1].declaredCost > rows[0].declaredCost)) {
    finding('MEDIUM', 'Kuyruktaki seviye fiyati yukseltmiyor',
      'ikinci seviye birinciden pahali olmali',
      `${rows[0].declaredCost} -> ${rows[1].declaredCost}`, '');
  }
  nation.gold = 0;
  const brokeInvest = queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
  if (brokeInvest) {
    finding('HIGH', 'Parasiz devlet insaata baslayabiliyor',
      'bedeli odeyemeyen devlet kuyruga yazamamali',
      `hazine 0 iken yatirim=${brokeInvest}`, '');
  } else {
    console.log('  OK  hazine 0 iken yatirim baslatilamiyor.');
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
  nation.gold = 500;
  queueInvestment(game, nation.id, 'CONSTRUCTION_CAPACITY');
  const project = ensureConstruction(nation).projects.slice(-1)[0];
  nation.gold = 0;
  const before = project.progress;
  runPeaceful(game, 4);
  const still = ensureConstruction(nation).projects.find((p) => p.id === project.id);
  console.log(`  bedeli ODENMIS proje, hazine 0 iken 4 haftada: ${n2(before)}`
    + ` -> ${still ? n2(still.progress) : 'BITTI'}`);
  if (still && still.progress <= before) {
    finding('HIGH', 'Bedeli odenmis proje hazine bosken durdu',
      'pesin odenen is hazineden bagimsiz ilerlemeli',
      `4 haftada ilerleme ${n2(before)} -> ${n2(still.progress)}`, '');
  }
  nation.gold = 1;
  const on = constructionPower(nation);
  nation.gold = 0;
  const off = constructionPower(nation);
  if (on !== off) {
    finding('LOW', 'Etkilerde gizli 1-altinlik ucurum',
      'etkiler hazine bakiyesine gore ani acilip kapanmamali',
      `hazine 1 -> 0: guc ${on} -> ${off}`, '');
  } else {
    console.log('  OK  hazine 1 -> 0 gecisinde insaat gucu sicramiyor (olcut kredi itibari).');
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

  nation.gold = 5000;
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

  // Devlet fabrikasi iptali. Test devletin fabrika kurabildigi bir hukumet
  // ister: liberal hukumette buildFactory hic kurmaz ve olcum bos gecer
  // (olculdu: 'odenen 0, iade 0'). Ilk bos (state, tur) cifti secilir.
  formGovernment(game, nation, 'conservative', { force: true });
  const types = Object.keys(FACTORIES)
    .filter((id) => (FACTORIES[id].availableFrom ?? 0) <= world.turn)
    .sort((a, b) => factoryMargin(world, b) - factoryMargin(world, a));
  nation.gold = 5000;
  const goldB = nation.gold;
  let typeId = types[0];
  let built = false;
  for (const region of constructionAtlas(world, nation.id).regions) {
    typeId = types.find((id) => buildFactory(game, nation, region.id, id));
    if (typeId) { built = true; break; }
  }
  typeId ??= types[0];
  const cost = factoryCost(nation, typeId);
  const afterBuild = nation.gold;
  const project = ensureConstruction(nation).projects.slice(-1)[0];
  const cancelled = built ? cancelConstruction(game, nation.id, project.id) : false;
  const refunded = nation.gold - afterBuild;
  console.log(`  devlet fabrikasi (${typeId}, bedel ${cost.gold}): odenen ${n0(goldB - afterBuild)}, iade ${n0(refunded)}`);
  if (!built) {
    finding('LOW', 'Devlet fabrikasi iptal testi olculemedi',
      'muhafazakar hukumette bos bir state/tur bulunmali', 'hicbir state/tur kurulamadi', '');
  }
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

// ------------------------------ 5) KALDIRILAN KALEMLER: ESKI KAYIT ---
sub('Eski kayittaki kale / yuksekogretim kalintilari');
{
  const game = headless(SEED);
  run(game, 40);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const tile = game.world.tiles.find((t) => t.owner === nation.id && t.terrain.passable);
  const state = ensureConstruction(nation);
  // Kaldirmadan onceki bicim: yerlesik kale, egitim seviyesi ve iki bedeli
  // pesin odenmis (yarisi insa edilmis) proje.
  state.buildings = [{ id: 'b1', typeId: 'FORT', regionId: 'x', q: tile.q, r: tile.r }];
  state.capacity.education = 2;
  state.projects.push(
    { id: 901, typeId: 'FORT', regionId: 'x', q: tile.q, r: tile.r, work: 60, cost: 60, funded: 60, progress: 30 },
    { id: 902, kind: 'national', typeId: 'HIGHER_EDUCATION', work: 120, cost: 120, funded: 120, progress: 0 },
  );
  const capacityBefore = state.capacity.construction;
  const gold = nation.gold;
  ensureConstruction(nation);
  const after = ensureConstruction(nation);
  const refund = nation.gold - gold;
  // Beklenen iade: kalenin insa edilmemis yarisi (30) + yuksekogretimin tamami (120).
  const expected = 30 + 120;
  const rows = [{
    buildings: 'buildings' in after ? 'KALDI' : 'silindi',
    education: 'education' in after.capacity ? 'KALDI' : 'silindi',
    dropped: after.projects.some((p) => p.id === 901 || p.id === 902) ? 'KALDI' : 'dustu',
    refund: n2(refund),
    capacity: `${capacityBefore} -> ${after.capacity.construction}`,
  }];
  console.log(table(rows, [
    { label: 'bina', get: (r) => r.buildings, right: false },
    { label: 'egitimSeviyesi', get: (r) => r.education, right: false },
    { label: 'projeler', get: (r) => r.dropped, right: false },
    { label: 'iade', get: (r) => r.refund },
    { label: 'kapasite', get: (r) => r.capacity, right: false },
  ]));
  if ('buildings' in after || 'education' in after.capacity
    || after.projects.some((p) => p.id === 901 || p.id === 902)) {
    finding('HIGH', 'Kaldirilan insaat kalemi eski kayitta yasiyor',
      'ensureConstruction kale/yuksekogretim izini temizlemeli', JSON.stringify(rows[0]), '');
  } else if (Math.abs(refund - expected) > 1e-6) {
    finding('HIGH', 'Kaldirilan projenin iadesi yanlis',
      'yalniz insa edilmemis pay geri doner, bir kez',
      `iade ${n2(refund)}, beklenen ${expected}`, '');
  } else if (after.capacity.construction !== capacityBefore) {
    finding('MEDIUM', 'Temizlik insaat kapasitesine dokundu', 'kapasite ayni kalmali',
      rows[0].capacity, '');
  } else {
    console.log('  OK  kalintilar silindi, insa edilmemis pay bir kez iade edildi.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
