// U. BORC / FAIZ ISTISMAR TESTI

import {
  headless, run, runPeaceful, pickNation, section, sub, table, finding,
  reportFindings, n1, n2, n0, pct,
} from './harness.mjs';
import { debtCapacity, debtInterestRate } from '../../src/game/economy.js';

const SEED = 'debt-audit';

section('U. BORC VE FAIZ');

// -------------------------------------------- 1) SUREKLI ACIK ---
sub('Her hafta hazineyi bosalt: borc, faiz, kapasite nasil davraniyor (150 hafta)');
{
  const game = headless(SEED);
  run(game, 80);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const rows = [];
  for (let i = 0; i < 150; i++) {
    // Surekli acik: haftalik gelirin iki kati sizdirilir. Sabit bir rakam
    // yetmiyor — gelir zamanla buyudugu icin ulke acigi kendiliginden kapatiyor.
    nation.gold -= Math.max(60, (nation.economy.ledger?.income ?? 60) * 2);
    runPeaceful(game, 1);
    if ((i + 1) % 15 === 0) {
      rows.push({
        week: i + 1,
        gold: nation.gold,
        debt: nation.debt ?? 0,
        capacity: debtCapacity(nation),
        rate: debtInterestRate(nation),
        interest: Math.abs(nation.economy.ledger?.interest ?? 0),
        borrowed: nation.economy.ledger?.borrow ?? 0,
        defaulted: nation.economy.ledger?.default ?? 0,
        credit: nation.economy.ledger?.creditPenalty ?? 0,
        income: nation.economy.ledger?.income ?? 0,
      });
    }
  }
  console.log(table(rows, [
    { label: 'hafta', get: (r) => r.week },
    { label: 'hazine', get: (r) => n0(r.gold) },
    { label: 'borc', get: (r) => n0(r.debt) },
    { label: 'borcKapasitesi', get: (r) => n0(r.capacity) },
    { label: 'yillikFaiz', get: (r) => pct(r.rate) },
    { label: 'haftalikFaiz', get: (r) => n2(r.interest) },
    { label: 'borclanilan', get: (r) => n2(r.borrowed) },
    { label: 'temerrut', get: (r) => n2(r.defaulted) },
    { label: 'krediCezasi', get: (r) => pct(r.credit) },
    { label: 'gelir', get: (r) => n2(r.income) },
  ]));
  const last = rows[rows.length - 1];
  console.log(`\n  150 hafta sonunda: hazine ${n0(last.gold)}, borc ${n0(last.debt)},`
    + ` kapasite ${n0(last.capacity)}, faiz orani ${pct(last.rate)}`);
  if (last.gold < -100) {
    finding('HIGH', 'Hazine sinirsiz negatife inebiliyor',
      'borclanma kapasitesi dolunca hazinenin bir tabani olmali (iflas, zorunlu kesinti, temerrut)',
      `kapasite ${n0(last.capacity)} altinda dolduktan sonra hazine ${n0(last.gold)}'e kadar indi`,
      'settleDebt yalnizca `room` kadar borclandirir; kalan acik hazinede negatif olarak birikir'
      + ' ve hicbir sistem bunu geri cevirmez. Tek etkisi canAfford kapilarinin kapanmasi'
      + ' ve `gold > 0` sartina bagli bina bonuslarinin sonmesi.');
  }
  if (last.debt >= last.capacity - 1) {
    console.log('  OK  borc kapasite tavaninda durdu (sinirsiz borclanma yok).');
  }
}

// -------------------------------------------- 2) FAIZ VE GERI ODEME ---
sub('Faiz gercekten isliyor mu, bolluk borcu kapatiyor mu');
{
  const game = headless(SEED);
  run(game, 80);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  nation.gold = -600;
  runPeaceful(game, 1);
  const borrowed = nation.economy.ledger?.borrow ?? 0;
  const debtAfter = nation.debt ?? 0;
  let interest = 0;
  let repaid = 0;
  const peakDebt = nation.debt ?? 0;
  for (let i = 0; i < 20; i++) {
    runPeaceful(game, 1);
    interest += Math.abs(nation.economy.ledger?.interest ?? 0);
    // Geri odeme bu dongude de olabilir (hazine yastigin ustundeyse);
    // ayri saymak "hic geri odenmedi" gibi yanlis bir tani veriyordu.
    repaid += Math.abs(nation.economy.ledger?.repay ?? 0);
  }
  const debtBeforeRepay = nation.debt ?? 0;
  nation.gold = 5000;
  for (let i = 0; i < 40; i++) {
    runPeaceful(game, 1);
    repaid += Math.abs(nation.economy.ledger?.repay ?? 0);
  }
  console.log(`  borc zirvesi ${n1(peakDebt)}`);
  console.log(`  borclanilan ${n1(borrowed)} · 20 haftalik faiz ${n2(interest)}`
    + ` · geri odenen ${n1(repaid)} · kalan borc ${n1(nation.debt ?? 0)}`);
  console.log(`  borc ${n1(debtAfter)} -> ${n1(debtBeforeRepay)} -> ${n1(nation.debt ?? 0)}`);
  if (!(borrowed > 0)) finding('HIGH', 'Acik borclanmaya donmuyor', 'negatif hazine borc yaratmali', `${n1(borrowed)}`, '');
  if (!(interest > 0)) finding('HIGH', 'Faiz tahakkuk etmiyor', 'borc faiz odemeli', `${n2(interest)}`, '');
  if (!(repaid > 0)) finding('HIGH', 'Borc geri odenmiyor', 'bolluk borcu azaltmali', `${n1(repaid)}`, '');
  if (borrowed > 0 && interest > 0 && repaid > 0) {
    console.log('  OK  borclan / faiz ode / geri ode dongusu calisiyor.');
  }
}

// -------------------------------------------- 3) BORCLAN-ODE DONGUSU ---
sub('Borclan-geri ode dongusu para uretiyor mu (200 salinim)');
{
  const game = headless(SEED);
  run(game, 80);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  const startNet = nation.gold - (nation.debt ?? 0);
  let cycles = 0;
  for (let i = 0; i < 200; i++) {
    nation.gold = -200;      // borclanmaya zorla
    runPeaceful(game, 1);
    nation.gold = 900;       // geri odemeye zorla
    runPeaceful(game, 1);
    cycles++;
  }
  const endNet = nation.gold - (nation.debt ?? 0);
  console.log(`  ${cycles} salinim · net varlik (hazine - borc) ${n1(startNet)} -> ${n1(endNet)}`);
  console.log(`  NOT: hazine her salinimda elle set edildigi icin mutlak deger anlamli degil;`
    + ' bakilan sey borcun dongude eriyip erimedigi.');
  console.log(`  son borc ${n1(nation.debt ?? 0)} · son faiz ${n2(Math.abs(nation.economy.ledger?.interest ?? 0))}`);
}

// -------------------------------------------- 4) NEGATIF/SONSUZ DEGERLER ---
sub('Faiz orani ve kapasite sinirlari');
{
  const game = headless(SEED);
  run(game, 60);
  const nation = pickNation(game);
  const probe = [];
  for (const [gold, debt, income] of [
    [0, 0, 0], [100, 0, 50], [0, 100000, 50], [0, 100, 0], [0, 1e9, 1e9], [0, 0, -50],
  ]) {
    nation.gold = gold;
    nation.debt = debt;
    nation.economy.ledger.income = income;
    probe.push({
      gold, debt, income,
      capacity: debtCapacity(nation),
      rate: debtInterestRate(nation),
    });
  }
  console.log(table(probe, [
    { label: 'hazine', get: (r) => n0(r.gold) },
    { label: 'borc', get: (r) => n0(r.debt) },
    { label: 'gelir', get: (r) => n0(r.income) },
    { label: 'kapasite', get: (r) => n0(r.capacity) },
    { label: 'yillikFaiz', get: (r) => pct(r.rate) },
  ]));
  const bad = probe.filter((r) => !Number.isFinite(r.capacity) || !Number.isFinite(r.rate)
    || r.rate < 0 || r.capacity < 0);
  if (bad.length) {
    finding('HIGH', 'Borc parametreleri sinirda bozuluyor',
      'kapasite ve faiz her zaman sonlu ve pozitif olmali', `${bad.length} sinir durumu bozuk`, '');
  } else {
    console.log('  OK  sinir degerlerinde faiz ve kapasite sonlu ve negatif degil.');
  }
}

// -------------------------------------------- 5) DUNYA GENELI BORC ---
sub('400 hafta sonra dunyadaki borc dagilimi (YZ)');
{
  const game = headless(SEED);
  run(game, 400);
  const rows = game.world.nations.filter((n) => n.alive).map((n) => ({
    id: n.id,
    gold: n.gold,
    debt: n.debt ?? 0,
    capacity: debtCapacity(n),
    load: (n.debt ?? 0) / Math.max(1, debtCapacity(n)),
    rate: debtInterestRate(n),
    interest: Math.abs(n.economy.ledger?.interest ?? 0),
    income: n.economy.ledger?.income ?? 0,
    net: n.economy.ledger?.net ?? 0,
  })).sort((a, b) => b.load - a.load);
  console.log(table(rows, [
    { label: 'ulke', get: (r) => r.id },
    { label: 'hazine', get: (r) => n0(r.gold) },
    { label: 'borc', get: (r) => n0(r.debt) },
    { label: 'kapasite', get: (r) => n0(r.capacity) },
    { label: 'yuk', get: (r) => pct(r.load) },
    { label: 'faizOrani', get: (r) => pct(r.rate) },
    { label: 'haftalikFaiz', get: (r) => n2(r.interest) },
    { label: 'gelir', get: (r) => n2(r.income) },
    { label: 'haftalikNet', get: (r) => n2(r.net) },
  ]));
  const maxed = rows.filter((r) => r.load > 0.95);
  const negative = rows.filter((r) => r.gold < -50);
  console.log(`\n  kapasitesini doldurmus ulke: ${maxed.length}/${rows.length}`
    + ` · hazinesi -50'nin altinda olan: ${negative.length}/${rows.length}`);
  if (maxed.length > rows.length * 0.3) {
    finding('MEDIUM', 'YZ borc sarmali', 'YZ ulkelerinin cogu borc tavaninda olmamali',
      `${maxed.length}/${rows.length} ulke 400 haftada borc kapasitesini doldurmus`, '');
  }
  if (negative.length) {
    finding('HIGH', 'YZ hazineleri kalici negatif',
      'hazine negatifken devlet harcamalarini kismali ve toparlanmali',
      `${negative.length} ulkenin hazinesi negatif (en kotu ${n0(Math.min(...negative.map((r) => r.gold)))})`,
      'negatif hazine geri donusu olmayan bir cukur: canAfford kapanir, bina bonuslari soner,'
      + ' insaat gucu tabana iner, gelir dusrer, cukur derinlesir');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
