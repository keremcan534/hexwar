// X. SINIR VE GECERSIZ DURUM TESTI
//
// Her senaryo bir uc degerle baslar ve 40 hafta isletilir. Her hafta butun
// degismezler taranir (NaN, Infinity, negatif sayim, imkansiz durum).

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct,
} from './harness.mjs';

const SEED = 'boundary-audit';

const CASES = [
  { label: '0 nufus (province=0)', mutations: [{ name: 'setProvincePopulation', args: { population: 0 } }] },
  { label: '1 nufus (province=1)', mutations: [{ name: 'setProvincePopulation', args: { population: 1 } }] },
  { label: 'dev nufus (x100)', mutations: [{ name: 'populationScale', args: { factor: 100 } }] },
  { label: '0 hazine', mutations: [{ name: 'setGold', args: { gold: 0 } }] },
  { label: 'dev hazine (1e9)', mutations: [{ name: 'setGold', args: { gold: 1e9 } }] },
  { label: 'negatif hazine (-1e6)', mutations: [{ name: 'setGold', args: { gold: -1e6 } }] },
  { label: '0 fabrika', mutations: [{ name: 'wipeFactories' }] },
  { label: 'yuzlerce fabrika (x40)', mutations: [{ name: 'cloneFactories', args: { copies: 40 } }] },
  { label: '0 insan gucu', mutations: [{ name: 'drainManpower' }] },
  { label: '0 fiyat', mutations: [{ name: 'setPrices', args: { price: 0 } }], repeat: true },
  { label: 'dev fiyat (1e6)', mutations: [{ name: 'setPrices', args: { price: 1e6 } }], repeat: true },
  { label: '0 piyasa arzi', mutations: [{ name: 'setMarketFlow', args: { supply: 0 } }], repeat: true },
  { label: 'dev piyasa arzi (1e9)', mutations: [{ name: 'setMarketFlow', args: { supply: 1e9 } }], repeat: true },
  { label: '0 techizat', mutations: [{ name: 'stripEquipment' }], repeat: true },
  { label: 'tum sinif vergisi %100', levers: [
    { key: 'tax', value: 100, classId: 'lower' },
    { key: 'tax', value: 100, classId: 'middle' },
    { key: 'tax', value: 100, classId: 'upper' },
  ] },
  { label: 'tarife %1000 (raw)', levers: [{ key: 'tariff', value: 1000, raw: true }] },
  { label: 'tarife -%1000 (raw)', levers: [{ key: 'tariff', value: -1000, raw: true }] },
];

section('X. SINIR / GECERSIZ DURUM TESTI');
console.log(`  tohum ${SEED} · isitma 60 hafta · her senaryo 40 hafta, her hafta degismez taramasi`);

const results = CASES.map((c) => ({
  label: c.label,
  r: runScenario({
    seed: SEED, label: c.label, warmup: 60, weeks: 40, peaceful: true,
    mutations: c.mutations ?? [],
    repeatMutations: c.repeat ? c.mutations : [],
    levers: c.levers ?? [],
    watchInvariants: true,
    measure: ['invariants'],
  }),
}));

sub('Sonuc tablosu');
console.log(table(results, [
  { label: 'senaryo', get: (x) => x.label, right: false },
  { label: 'ihlal', get: (x) => x.r.violations.length },
  { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  { label: 'borc', get: (x) => n0(x.r.snap.debt) },
  { label: 'nufus', get: (x) => n0(x.r.snap.population) },
  { label: 'tesis', get: (x) => x.r.snap.factories },
  { label: 'kadro', get: (x) => n0(x.r.snap.employees) },
  { label: 'gdp', get: (x) => n1(x.r.snap.gdp) },
  { label: 'gelir', get: (x) => n2(x.r.snap.income) },
  { label: 'istikrar', get: (x) => n2(x.r.snap.stability) },
  { label: 'alay', get: (x) => x.r.snap.regiments },
  { label: 'ihtiyac', get: (x) => pct(x.r.cohorts.needsFulfilled) },
]));

sub('Bulunan degismez ihlalleri');
let totalViolations = 0;
for (const { label, r } of results) {
  if (!r.violations.length) continue;
  totalViolations += r.violations.length;
  console.log(`\n  [${label}] ${r.violations.length} farkli ihlal:`);
  for (const v of r.violations.slice(0, 10)) {
    console.log(`    hafta ${v.turn} · ulke ${v.nationId} · ${v.system}.${v.field} = ${v.value}`
      + (v.note ? ` (${v.note})` : ''));
  }
}
if (!totalViolations) console.log('  Hicbir senaryoda degismez ihlali yok.');

section('X. TANI');
{
  const broken = results.filter((x) => x.r.violations.length);
  if (broken.length) {
    finding('HIGH', 'Sinir degerlerinde gecersiz durum',
      'hicbir uc deger NaN/Infinity/negatif sayim uretmemeli',
      `${broken.length}/${results.length} senaryo degismez ihlal etti:`
      + ` ${broken.map((x) => x.label).join(', ')}`,
      broken.map((x) => `${x.label}: ${x.r.violations.slice(0, 3)
        .map((v) => `${v.system}.${v.field}=${v.value}`).join(', ')}`).join(' | '));
  } else {
    console.log('  OK  butun uc degerlerde simulasyon sonlu ve tutarli kaldi.');
  }

  // Ozel kontroller
  const zeroPrice = results.find((x) => x.label === '0 fiyat');
  console.log(`  0 fiyat senaryosu: GSYH ${n1(zeroPrice.r.snap.gdp)},`
    + ` fabrika kari ${n2(zeroPrice.r.snap.factoryProfit)},`
    + ` vergi ${n2(zeroPrice.r.snap.taxRevenue)}, hazine ${n0(zeroPrice.r.snap.gold)}`);
  const hugePrice = results.find((x) => x.label === 'dev fiyat (1e6)');
  console.log(`  1e6 fiyat senaryosu: GSYH ${n1(hugePrice.r.snap.gdp)},`
    + ` fabrika kari ${n2(hugePrice.r.snap.factoryProfit)},`
    + ` hane sepeti ${n1(hugePrice.r.snap.lowerCost)}, hazine ${n0(hugePrice.r.snap.gold)}`);
  const zeroPop = results.find((x) => x.label === '0 nufus (province=0)');
  console.log(`  0 nufus senaryosu: nufus ${n0(zeroPop.r.snap.population)},`
    + ` kohort ${n0(zeroPop.r.snap.cohortPopulation)}, alay ${zeroPop.r.snap.regiments},`
    + ` istikrar ${n2(zeroPop.r.snap.stability)}`);
  const bigTreasury = results.find((x) => x.label === 'dev hazine (1e9)');
  console.log(`  1e9 hazine senaryosu: 40 hafta sonra hazine ${n0(bigTreasury.r.snap.gold)},`
    + ` tesis ${bigTreasury.r.snap.factories}, insaat projesi ${bigTreasury.r.snap.projects}`);
  const negTreasury = results.find((x) => x.label === 'negatif hazine (-1e6)');
  console.log(`  -1e6 hazine senaryosu: 40 hafta sonra hazine ${n0(negTreasury.r.snap.gold)},`
    + ` borc ${n0(negTreasury.r.snap.debt)} — toparlanma yolu var mi:`
    + ` ${negTreasury.r.snap.gold > -1e6 ? 'kismen' : 'YOK'}`);
  // populationOf tabani: nufusu sifirlanan ulke bile 10.000 kisilik bir
  // ekonomi isletmeye devam ediyor.
  const zeroPop2 = results.find((x) => x.label === '1 nufus (province=1)');
  if (zeroPop.r.snap.population === zeroPop2.r.snap.population
    && zeroPop.r.snap.population >= 10000) {
    finding('MEDIUM', 'populationOf hayali 10.000 kisilik taban uyduruyor',
      'nufusu tukenen ulkenin ekonomisi de tukenmeli',
      `province nufusu 0 ve 1 olan iki senaryo da ayni sonucu veriyor:`
      + ` ulke nufusu ${n0(zeroPop.r.snap.population)}, sanayi kadrosu`
      + ` ${n0(zeroPop.r.snap.employees)}, GSYH ${n1(zeroPop.r.snap.gdp)}`,
      'populationOf = Math.max(10000, provincePopulation(...)) — sinif nufuslari,'
      + ' vergi matrahi ve sosyal harcama bu hayali tabandan hesaplaniyor;'
      + ' 8 alay hala sahada ve fabrikalar hala 14.074 isci calistiriyor');
  }

  // Gumruk formulunun matematiksel tanim araligi
  const IMPORT_ELASTICITY = 1.6;
  const appetite = (t) => 1 / (1 + (t / 100) * IMPORT_ELASTICITY);
  console.log(`\n  ithalat istahi formulu 1/(1 + tarife/100 x ${IMPORT_ELASTICITY}):`);
  console.log(table([-1000, -100, -62.5, -50, 0, 100, 1000].map((t) => ({ t, a: appetite(t) })), [
    { label: 'tarife%', get: (r) => r.t },
    { label: 'istah', get: (r) => (Number.isFinite(r.a) ? n2(r.a) : String(r.a)) },
    { label: 'gecerli', get: (r) => (Number.isFinite(r.a) && r.a > 0 ? 'evet' : 'HAYIR') },
  ]));
  finding('LOW', 'Ithalat istahi formulu -%62.5\'te tanimsiz',
    'formul butun sayi araliginda pozitif ve sonlu olmali',
    `tarife = -62.5 -> istah = ${appetite(-62.5)}; -62.5'in altinda istah NEGATIF olur`,
    'UI bandi (-50 taban) bugun bu bolgeye girmiyor, ama settleGlobalTrade'
    + ' matematiksel korumaya sahip degil: bant genisletilirse ithalat negatife doner');

  const manyFactories = results.find((x) => x.label === 'yuzlerce fabrika (x40)');
  console.log(`  x40 fabrika senaryosu: tesis ${manyFactories.r.snap.factories},`
    + ` kadro ${n0(manyFactories.r.snap.employees)}, doluluk ${pct(manyFactories.r.snap.fill)},`
    + ` fabrika kari ${n2(manyFactories.r.snap.factoryProfit)}`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
