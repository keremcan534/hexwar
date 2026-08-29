// K + L + N. NUFUS MUHASEBESI, HANE EKONOMISI, ISTIHDAM

import {
  headless, run, runPeaceful, runScenario, pickNation, section, sub, table,
  finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import {
  CLASS_PROFESSIONS, POPULATION_COHORT, PROFESSION_INFO, factoryJobs,
  industrialJobs, populationOf,
} from '../../src/game/economy.js';
import { nationCohorts, reconcile, summarize } from '../../src/game/population.js';
import { professionCountsOf } from '../../src/game/economy.js';
import { nationManpower, recruit, disband } from '../../src/game/recruitment.js';
import { provinceRgoStatus } from '../../src/game/provinces.js';
import { soldiersOf, UNIT_TYPES } from '../../src/game/units.js';

const SEED = 'population-audit';

/** Dunyadaki toplam province nufusu — tek kanonik nufus deposu. */
function worldPopulation(world) {
  // Kume dongusu: tile.province paylasilan econ, kare kare toplamak ayni
  // havuzu uye sayisi kadar sayar.
  let total = 0;
  for (const province of world.provinces ?? []) total += province.econ?.population ?? 0;
  return total;
}

/** Ordudaki insanlar: alaylarin province'ten cektigi ve hala hayatta olan asker. */
function armyManpower(world) {
  let total = 0;
  for (const unit of world.units) {
    for (const r of unit.regiments ?? []) {
      total += (r.draws ?? []).reduce((s, d) => s + Math.max(0, d.men ?? 0), 0);
    }
  }
  return total;
}

section('K. NUFUS MUHASEBESI');

// --------------------------------------- 1) KOHORT / SINIF / SAYAC TUTARLILIGI ---
sub('Kohort toplami = meslek sayaclari = sinif toplamlari (200 hafta)');
{
  const game = headless(SEED);
  run(game, 200);
  const rows = game.world.nations.filter((n) => n.alive && n.economy).map((n) => {
    const rec = reconcile(game.world, n);
    const counts = professionCountsOf(n);
    const countTotal = Object.values(counts).reduce((s, v) => s + v, 0);
    const classTotal = Object.keys(n.economy.classes)
      .reduce((s, id) => s + n.economy.classes[id].population, 0);
    return {
      id: n.id,
      province: populationOf(game.world, n),
      cohortPopulation: n.economy.cohortPopulation,
      countTotal,
      classTotal,
      cohortSum: rec.total,
      worstDrift: rec.worstDrift,
      roundingGap: populationOf(game.world, n) - countTotal,
    };
  });
  console.log(table(rows, [
    { label: 'ulke', get: (r) => r.id },
    { label: 'provinceNufus', get: (r) => n0(r.province) },
    { label: 'meslekToplami', get: (r) => n0(r.countTotal) },
    { label: 'sinifToplami', get: (r) => n0(r.classTotal) },
    { label: 'kohortToplami', get: (r) => n0(r.cohortSum) },
    { label: 'enKotuSapma', get: (r) => n0(r.worstDrift) },
    { label: 'yuvarlamaFarki', get: (r) => n0(r.roundingGap) },
  ]));
  const worst = Math.max(...rows.map((r) => r.worstDrift));
  const gapPct = Math.max(...rows.map((r) => Math.abs(r.roundingGap) / Math.max(1, r.province)));
  console.log(`\n  en kotu kohort sapmasi: ${n0(worst)} kisi · en kotu yuvarlama farki: ${pct(gapPct)}`);
  if (worst > 0) {
    finding('HIGH', 'Kohort muhasebesi tutmuyor', 'kohort toplami meslek sayaclarina esit olmali',
      `en kotu sapma ${n0(worst)} kisi`, '');
  } else {
    console.log('  OK  kohort/meslek/sinif toplamlari birebir tutuyor (hayalet nufus yok).');
  }
  if (gapPct > 0.002) {
    finding('LOW', 'Kohort yuvarlama farki',
      `nufus ${POPULATION_COHORT} kisilik kohortlara yuvarlaniyor`,
      `province nufusu ile meslek sayaci arasinda en fazla ${pct(gapPct)} fark`,
      'reconcilePopulation tabana yuvarlar; artik nufus hicbir meslege yazilmaz');
  }
}

// ------------------------------------------ 2) HAFTALIK NUFUS DENKLEMI ---
sub('Haftalik denklem: onceki + buyume - askerAlimi + terhis = simdiki (60 hafta izleme)');
{
  const game = headless(SEED);
  run(game, 100);
  const world = game.world;
  let prevPop = worldPopulation(world);
  let prevArmy = armyManpower(world);
  const rows = [];
  let worstDrift = 0;
  for (let i = 0; i < 60; i++) {
    runPeaceful(game, 1);
    const pop = worldPopulation(world);
    const army = armyManpower(world);
    // Barista toprak el degistirmez; nufus yalniz buyume ve asker alimiyla oynar.
    // Ordunun tasidigi insanlar da nufusun parcasidir: toplam korunmali,
    // yalniz dogal buyume kadar artmali.
    const total = pop + army;
    const prevTotal = prevPop + prevArmy;
    const growth = total - prevTotal;
    const famine = world.nations.reduce(
      (sum, nation) => sum + (nation.economy?.famineDeaths ?? 0), 0,
    );
    rows.push({
      week: world.turn, pop, army, total, growth, famine,
      // runPeaceful savasi ancak tur SONRASI bastirir: parlamali haftada
      // gercek muharebe olumleri olur — o hafta "barisci" sayilmaz.
      warFlash: game.lastWeekWarFlash === true,
      rate: growth / Math.max(1, prevTotal),
    });
    worstDrift = Math.max(worstDrift, Math.abs(growth) / Math.max(1, prevTotal));
    prevPop = pop;
    prevArmy = army;
  }
  console.log(table(rows.slice(-8), [
    { label: 'hafta', get: (r) => r.week },
    { label: 'provinceNufus', get: (r) => n0(r.pop) },
    { label: 'ordudakiInsan', get: (r) => n0(r.army) },
    { label: 'toplam', get: (r) => n0(r.total) },
    { label: 'haftalikDegisim', get: (r) => n0(r.growth) },
    { label: 'oran', get: (r) => pct(r.rate) },
  ]));
  // Kitlik olumleri BELGELENMIS bir kanaldir (provinces.js famine, ekrana ve
  // sayaca "famineDeaths" olarak yazilir): denklem onlari dusukten dusuyor.
  // Yalniz kitligin ACIKLAYAMADIGI kayip bulgu sayilir.
  const negatives = rows.filter((r) => !r.warFlash && r.growth + r.famine < -1);
  const famineWeeks = rows.filter((r) => r.growth < 0 && r.growth + r.famine >= -1).length;
  const flashWeeks = rows.filter((r) => r.warFlash && r.growth < 0).length;
  if (flashWeeks) console.log(`  savas parlamasi (bir haftalik, denklemin disinda): ${flashWeeks} hafta`);
  console.log(`\n  60 haftada toplam dusen hafta: ${rows.filter((r) => r.growth < 0).length}`
    + ` (kitlikla aciklanan: ${famineWeeks})`
    + (negatives.length ? ` · ACIKLANAMAYAN kayip haftasi: ${negatives.length}` : ''));
  console.log(`  ortalama haftalik buyume orani: ${pct(rows.reduce((s, r) => s + r.rate, 0) / rows.length)}`);
  if (negatives.length) {
    finding('MEDIUM', 'Barista nufus KAYNAKSIZ kayboluyor',
      'savas yokken kayip = kayitli kitlik olumleri olmali',
      `${negatives.length}/60 haftada aciklanamayan kayip, en buyugu ${
        n0(Math.min(...negatives.map((r) => r.growth + r.famine)))} kisi`,
      'olasi kaynak: alay draws kaydi ile cekilen insan farki ya da province kaybinda silinen draws');
  }
}

// ------------------------------------------------- 3) ASKER ALIM DONGUSU ---
sub('S. Kur/dagit dongusu insan gucu uretiyor mu? (200 dongu)');
{
  const game = headless(SEED);
  run(game, 120);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const world = game.world;
  const before = { pop: worldPopulation(world), army: armyManpower(world), units: world.units.length };
  let created = 0;
  let disbanded = 0;
  for (let i = 0; i < 200; i++) {
    // Stok tukenmesin: dongu insan gucu uretiyor mu diye baktigimiz icin
    // techizat kisitini bilerek kaldiriyoruz.
    nation.economy.military.arms = 40;
    const unit = recruit(game, nation, 'INFANTRY');
    if (!unit) break;
    created++;
    if (disband(game, unit)) disbanded++;
  }
  const after = { pop: worldPopulation(world), army: armyManpower(world), units: world.units.length };
  console.log(`  ${created} alay kuruldu, ${disbanded} tanesi ayni anda dagitildi`);
  console.log(table([{ before, after }], [
    { label: 'olcum', get: () => 'province + ordu', right: false },
    { label: 'once', get: (r) => n0(r.before.pop + r.before.army) },
    { label: 'sonra', get: (r) => n0(r.after.pop + r.after.army) },
    { label: 'fark', get: (r) => n0((r.after.pop + r.after.army) - (r.before.pop + r.before.army)) },
    { label: 'birimOnce', get: (r) => r.before.units },
    { label: 'birimSonra', get: (r) => r.after.units },
  ]));
  const drift = (after.pop + after.army) - (before.pop + before.army);
  if (Math.abs(drift) > 100) {
    finding(drift > 0 ? 'HIGH' : 'MEDIUM', 'Kur/dagit dongusu nufus uretiyor/yok ediyor',
      'alay kurup hemen dagitmak toplam insan sayisini degistirmemeli',
      `${created} dongude toplam ${n0(drift)} kisi ${drift > 0 ? 'yaratildi' : 'kayboldu'}`, '');
  } else {
    console.log(`  OK  dongu nufus uretmiyor (sapma ${n0(drift)} kisi).`);
  }
}

// ----------------------------------------------- 4) INSAN GUCU TAVANI ---
sub('S. Insan gucunden fazla asker toplanabiliyor mu?');
{
  const game = headless(SEED);
  run(game, 120);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const world = game.world;
  const manpower0 = nationManpower(world, nation.id);
  let raised = 0;
  for (let i = 0; i < 400; i++) {
    nation.economy.military.arms = 40;
    nation.gold = 100000;
    const unit = recruit(game, nation, 'INFANTRY');
    if (!unit) break;
    raised++;
  }
  const manpower1 = nationManpower(world, nation.id);
  const soldiers = world.units.filter((u) => u.nationId === nation.id)
    .reduce((s, u) => s + soldiersOf(u), 0);
  console.log(`  baslangic insan gucu ${n0(manpower0)} (province nufusu - ${n0(2000)}/kare taban)`);
  console.log(`  spam sonrasi kurulan alay: ${raised} · kalan insan gucu ${n0(manpower1)}`);
  console.log(`  ordu buyuklugu ${n0(soldiers)} asker · ulke nufusu ${n0(populationOf(world, nation))}`);
  const drained = manpower0 - manpower1;
  const drawn = raised * UNIT_TYPES.INFANTRY.manpower;
  console.log(`  cekilen insan ${n0(drawn)} · insan gucundeki dusus ${n0(drained)}`
    + ` (fark ${n0(drawn - drained)})`);
  let negative = 0;
  world.forEach((t) => { if (t.province && t.province.population < 0) negative++; });
  if (negative) {
    finding('HIGH', 'Asker alimi province nufusunu negatife dusuruyor',
      'province nufusu 2000 tabanin altina inmemeli', `${negative} province negatif`, '');
  } else {
    console.log(`  OK  hicbir province negatife dusmedi; taban (2000 kisi) tutuyor.`);
  }
  const armyShare = soldiers / Math.max(1, populationOf(world, nation));
  console.log(`  ordu/nufus orani: ${pct(armyShare)}`);
  if (armyShare > 0.25) {
    finding('MEDIUM', 'Ordu nufusa gore makul olmayan boyuta ulasabiliyor',
      'ordu nufusun kucuk bir yuzdesiyle sinirli olmali',
      `spam sonrasi ordu nufusun ${pct(armyShare)}'i`, '');
  }
}

// ------------------------------------------------------- L. HANE EKONOMISI ---
section('L. HANE (POP) EKONOMISI');
sub('Temsili kohortlarin gelir/vergi/tuketim/artik defteri (200 hafta)');
{
  const game = headless(SEED);
  runPeaceful(game, 199);
  // Kimlik GECIKMELIDIR: populationDemand butceyi GECEN haftanin net
  // geliriyle kurar (fiscalBalance ayni hafta daha sonra kosar). Onceki
  // haftanin gelir/vergi anlik goruntusu alinir, bir hafta ilerletilir,
  // kimlik o cifte karsi SIKI dogrulanir.
  const lagNation = pickNation(game);
  const previousNet = {};
  for (const classId of Object.keys(lagNation.economy.classes)) {
    const socialClass = lagNation.economy.classes[classId];
    previousNet[classId] = Math.max(0, (socialClass.income ?? 0) - (socialClass.taxPaid ?? 0));
  }
  runPeaceful(game, 1);
  const nation = pickNation(game);
  const cohorts = nationCohorts(game.world, nation);
  const sample = [];
  for (const professionId of Object.keys(PROFESSION_INFO)) {
    const biggest = cohorts.filter((c) => c.professionId === professionId)
      .sort((a, b) => b.size - a.size)[0];
    if (biggest) sample.push(biggest);
  }
  console.log(table(sample, [
    { label: 'meslek', get: (c) => c.professionId, right: false },
    { label: 'sinif', get: (c) => c.classId, right: false },
    { label: 'kohort', get: (c) => n0(c.size) },
    { label: 'brutGelir', get: (c) => n2(c.income) },
    { label: 'vergi', get: (c) => n2(c.taxPaid) },
    { label: 'netGelir', get: (c) => n2(c.income - c.taxPaid) },
    { label: 'gecimButcesi', get: (c) => n2(c.disposable) },
    { label: 'tuketim', get: (c) => n2(c.consumption) },
    { label: 'artik', get: (c) => n2(c.disposable - c.consumption) },
    { label: 'ihtiyacKarsilanma', get: (c) => pct(c.needsFulfilled) },
    { label: 'istihdam', get: (c) => (c.employed == null ? '-' : `${n0(c.employed)}/${n0(c.size)}`) },
  ]));

  // KIMLIK (siki): butce = GECEN haftanin net geliri + BEYAN EDILMIS
  // gecimlik (socialClass.subsistence — famineDeaths gibi kayitli kanal).
  // Baska hicbir kaynak yok; sapma parasal uydurma demektir.
  let worst = 0;
  for (const classId of Object.keys(nation.economy.classes)) {
    const socialClass = nation.economy.classes[classId];
    const expected = (previousNet[classId] ?? 0) + (socialClass.subsistence ?? 0);
    const budget = socialClass.needsBudget ?? 0;
    worst = Math.max(worst, Math.abs(budget - expected) / Math.max(1, expected));
  }
  console.log(`\n  "butce = onceki net gelir + gecimlik" kimligi: en kotu sapma ${pct(worst)}`);
  if (worst < 0.01) console.log('  OK  hane defteri tek hikaye: gelir + kayitli gecimlik.');
  else finding('HIGH', 'POP gelir defteri kendi icinde tutarsiz',
    'needsBudget = oncekiNetGelir + subsistence (kayitli ayni-gecimlik kanali)',
    `en kotu sapma ${pct(worst)}`,
    'butceye gelir ve beyan edilmis gecimlik disinda bir kaynak sizmis');

  const totalIncome = Object.keys(nation.economy.classes)
    .reduce((s, id) => s + nation.economy.classes[id].income, 0);
  const totalBudget = Object.keys(nation.economy.classes)
    .reduce((s, id) => s + nation.economy.classes[id].needsBudget, 0);
  console.log(`  ulusal sinif geliri toplami ${n2(totalIncome)}/hafta`
    + ` · gecim butceleri toplami ${n2(totalBudget)}/hafta (${n1(totalBudget / Math.max(1e-9, totalIncome))}x)`);
  if (totalBudget > totalIncome * 2) {
    finding('HIGH', 'Hane butcesi geliri kat kat asiyor',
      'hanelerin harcayabilecegi para gelirlerinden gelmeli',
      `gecim butceleri toplami gelirin ${n1(totalBudget / Math.max(1e-9, totalIncome))} kati`,
      'butce gelirden turetilmedigi icin sinif geliri (income) tamamen dekoratif:'
      + ' yalniz vergi matrahi olarak kullaniliyor');
  }

  // GECMIS REFAH GELECEGE TASINIYOR MU?
  //
  // Eski olcut sinif nesnesinde bir `savings` ALANI arıyordu. Basit cekirdek o
  // alani kaldirdi (tek tuketicisi kendi cekimiydi); refahin tasiyicisi artik
  // SINIF PAYLARIDIR: bir yil refah icinde gecirmek insanlari kalici olarak
  // ust sinifa tasir, yoksulluk asagi iter (bkz. econ/pop.js runClassMobility).
  // Olcut de stok ALANINI degil, stogun ISLEVINI sinar.
  const shares = nation.economy.classShares;
  const carriesForward = shares
    ? Object.values(shares).some((v) => Number.isFinite(v) && v > 0)
    : Object.values(nation.economy.classes).some((c) => c.savings !== undefined);
  const mobility = nation.economy.mobility ?? {};
  const moved = Object.values(mobility).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
  console.log(`  refah tasiyicisi: ${shares ? 'sinif paylari' : 'sinif birikimi'}`
    + ` (${carriesForward ? 'var' : 'YOK'}) · son hafta kayan pay ${(moved * 100).toFixed(3)}%`);
  if (!carriesForward) {
    finding('HIGH', 'Gecmis refah gelecege tasinmiyor',
      'iyi yillar kotu yillari tasimali (birikim stogu ya da sinif payi)',
      'ne sinif payi ne birikim alani var', '');
  }

  // Issiz POP gercekten fakir mi?
  const workers = cohorts.filter((c) => c.professionId === 'workers');
  const employedRows = workers.filter((c) => c.employed > 0);
  const idleRows = workers.filter((c) => c.employed === 0 && c.size > 0);
  if (employedRows.length && idleRows.length) {
    const avg = (list, key) => list.reduce((s, c) => s + c[key] / c.size, 0) / list.length;
    const workIncome = avg(employedRows, 'income') * 1000;
    const idleIncome = avg(idleRows, 'income') * 1000;
    console.log(`\n  calisan isci kohortu (1000 kisi basi): gelir ${n2(workIncome)}`
      + ` · tuketim ${n2(avg(employedRows, 'consumption') * 1000)}`);
    console.log(`  issiz isci kohortu (1000 kisi basi): gelir ${n2(idleIncome)}`
      + ` · tuketim ${n2(avg(idleRows, 'consumption') * 1000)}`);
    const gap = workIncome > 0 ? 1 - idleIncome / workIncome : 0;
    console.log(`  issizlik gelir farki: ${pct(gap)}`);
    if (gap < 0.1) {
      finding('HIGH', 'Issizligin hane ekonomisinde karsiligi yok',
        'issiz POP daha az kazanmali ve daha az tuketmeli',
        `calisan ve issiz isci kisi basi neredeyse ayni geliri aliyor (fark ${pct(gap)})`,
        'population.js cohortEconomics payi kohort BOYUTUNA gore dagitiyor,'
        + ' istihdam durumu hic girmiyor');
    } else {
      console.log('  OK  issiz kohort belirgin daha az kazaniyor (etkinlik agirligi calisiyor).');
    }
  }
}

// ---------------------------------------------------------- N. ISTIHDAM ---
section('N. ISTIHDAM TESTI');
sub('A: saglikli sanayi · B: fabrikalar kapali · C: sanayi 3 kat');
{
  const specs = [
    { label: 'A saglikli', mutations: [] },
    { label: 'B kapali', mutations: [{ name: 'pinEmployment', args: { fill: 0 } }], repeat: true },
    { label: 'C sisirilmis', mutations: [{ name: 'pinEmployment', args: { fill: 1 } }], repeat: true },
  ];
  const rows = specs.map((s) => ({
    label: s.label,
    r: runScenario({
      seed: SEED, label: s.label, warmup: 120, weeks: 80, peaceful: true,
      mutations: s.mutations,
      repeatMutations: s.repeat ? s.mutations : [],
      measure: ['factories'],
    }),
  }));
  console.log(table(rows, [
    { label: 'senaryo', get: (x) => x.label, right: false },
    { label: 'tesis', get: (x) => x.r.snap.factories },
    { label: 'kadroKapasitesi', get: (x) => n0(x.r.snap.jobs) },
    { label: 'calisan', get: (x) => n0(x.r.snap.employees) },
    { label: 'doluluk', get: (x) => pct(x.r.snap.fill) },
    { label: 'kohortIstihdami', get: (x) => (x.r.cohorts.employment == null ? '-' : pct(x.r.cohorts.employment)) },
    { label: 'issiz', get: (x) => n0(x.r.cohorts.employableTotal - x.r.cohorts.employed) },
    { label: 'ihtiyacKarsilanma', get: (x) => pct(x.r.cohorts.needsFulfilled) },
    { label: 'altMemnuniyet', get: (x) => n2(x.r.snap.lowerSat) },
    { label: 'nufus', get: (x) => n0(x.r.snap.population) },
    { label: 'gdp', get: (x) => n1(x.r.snap.gdp) },
  ]));
  const a = rows[0].r;
  const b = rows[1].r;
  console.log(`\n  fabrikalar kapatilinca: istihdam ${pct(a.cohorts.employment)} -> ${pct(b.cohorts.employment)},`
    + ` alt sinif memnuniyeti ${n2(a.snap.lowerSat)} -> ${n2(b.snap.lowerSat)},`
    + ` nufus ${n0(a.snap.population)} -> ${n0(b.snap.population)}`);
  if (Math.abs(relDelta(a.snap.lowerSat, b.snap.lowerSat)) < 0.05) {
    finding('HIGH', 'Issizlik -> hane refahi',
      'sanayi kapaninca alt sinif fakirlesmeli',
      `istihdam ${pct(a.cohorts.employment)} -> ${pct(b.cohorts.employment)} degisti ama`
      + ` memnuniyet ${n2(a.snap.lowerSat)} -> ${n2(b.snap.lowerSat)}`,
      'memnuniyet sepet fiyatina ve vergiye bakar, istihdama degil');
  }
  const dGdp = relDelta(a.snap.gdp, b.snap.gdp);
  const dNeeds = b.cohorts.needsFulfilled - a.cohorts.needsFulfilled;
  console.log(`  butun sanayi durunca GSYH ${n1(a.snap.gdp)} -> ${n1(b.snap.gdp)} (${pct(dGdp)})`
    + ` ama ihtiyac karsilanmasi ${pct(a.cohorts.needsFulfilled)} -> ${pct(b.cohorts.needsFulfilled)}`);
  if (Math.abs(dGdp) > 0.5 && Math.abs(dNeeds) < 0.02) {
    finding('HIGH', 'GSYH -> hane refahi bagi yok',
      'ulkenin butun sanayisi durunca halkin ihtiyaci karsilanamamali',
      `GSYH ${pct(dGdp)} dustu, ihtiyac karsilanmasi ${(dNeeds * 100).toFixed(2)} puan degisti`,
      'hane talebi nufusla olculur ve karsilanma butceyle degil piyasa arziyla belirlenir;'
      + ' arz tarafi da RGO agirlikli oldugu icin sanayinin durmasi haneyi hic bulmuyor');
  }

  // Istihdam kavramsal sinirlari
  const overEmployed = rows.some((x) => x.r.cohorts.employed > x.r.cohorts.employableTotal);
  console.log(`  istihdam isgucunu asiyor mu: ${overEmployed ? 'EVET' : 'hayir'}`);
  if (overEmployed) {
    finding('HIGH', 'Istihdam isgucunu asiyor', 'employed <= employableTotal', '', '');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
