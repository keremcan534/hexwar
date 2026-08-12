// W. OYUNCU META / BASKIN STRATEJI AVI
//
// Ayni tohum, ayni ulke, ayni sure. Fark yalniz oyuncunun politika seti.
// Aranan sey: her kosulda dogru olan tek bir cevap var mi?

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';

const SEED = 'strategy-audit';
const WARMUP = 60;
const WEEKS = 260;

const tax = (l, m, u) => [
  { key: 'tax', value: l, classId: 'lower' },
  { key: 'tax', value: m, classId: 'middle' },
  { key: 'tax', value: u, classId: 'upper' },
];
const social = (e, h, w) => [
  { key: 'social', value: e, classId: 'education' },
  { key: 'social', value: h, classId: 'health' },
  { key: 'social', value: w, classId: 'welfare' },
];
const army = (wage, proc) => [
  { key: 'militaryWages', value: wage },
  { key: 'militaryProcurement', value: proc },
];

const STRATEGIES = [
  { label: 'varsayilan (dokunma)', levers: [] },
  { label: 'tam vergi %100', levers: tax(100, 100, 100) },
  { label: 'YZ tavani 35/42/45', levers: tax(35, 42, 45) },
  { label: 'dusuk vergi 5/5/5', levers: tax(5, 5, 5) },
  { label: 'sifir vergi', levers: tax(0, 0, 0) },
  { label: 'tarife %100', levers: [{ key: 'tariff', value: 100, raw: true }] },
  { label: 'tarife %0', levers: [{ key: 'tariff', value: 0, raw: true }] },
  { label: 'ithalat subvansiyonu -%50', levers: [{ key: 'tariff', value: -50, raw: true }] },
  { label: 'sifir sosyal', levers: social(0, 0, 0) },
  { label: 'tam sosyal', levers: social(100, 100, 100) },
  { label: 'yalniz egitim %100', levers: social(100, 0, 0) },
  { label: 'yalniz refah %100', levers: social(0, 0, 100) },
  { label: 'sifir ordu', levers: army(0, 0) },
  { label: 'tam ordu', levers: army(100, 100) },
  { label: 'yonetim %30', levers: [{ key: 'adminFunding', value: 30 }] },
  { label: 'yonetim %100', levers: [{ key: 'adminFunding', value: 100 }] },
  { label: 'tam subvansiyon', levers: [], repeatMutations: [{ name: 'subsidizeAll' }] },
  {
    label: 'OPTIMAL AVI: tavan vergi + tavan tarife + sifir sosyal + sifir ordu',
    levers: [...tax(100, 100, 100), { key: 'tariff', value: 100, raw: true },
      ...social(0, 0, 0), ...army(0, 0), { key: 'adminFunding', value: 100 }],
  },
  {
    label: 'DENGELI: YZ vergi + tarife %50 + refah %60 + egitim %60',
    levers: [...tax(35, 42, 45), { key: 'tariff', value: 50, raw: true },
      ...social(60, 30, 60), ...army(75, 65), { key: 'adminFunding', value: 100 }],
  },
  {
    label: 'REFAH DEVLETI: dusuk vergi + tam sosyal',
    levers: [...tax(10, 15, 20), ...social(100, 100, 100), { key: 'adminFunding', value: 100 }],
  },
  {
    label: 'INSAAT: 12 santiye + tavan vergi + tavan tarife',
    levers: [...tax(100, 100, 100), { key: 'tariff', value: 100, raw: true }],
    mutations: [{ name: 'grantConstructionSectors', args: { count: 12 } }],
  },
];

section(`W. BASKIN STRATEJI AVI — ${STRATEGIES.length} politika seti, ${WEEKS} hafta`);
console.log(`  tohum ${SEED} · isitma ${WARMUP} hafta · her set ayri surecte · savassiz kosu`);

const runs = STRATEGIES.map((s) => ({
  label: s.label,
  r: runScenario({
    seed: SEED, label: s.label, warmup: WARMUP, weeks: WEEKS, peaceful: true,
    levers: s.levers, mutations: s.mutations ?? [], repeatMutations: s.repeatMutations ?? [],
    measure: ['army'],
  }),
}));

/**
 * Bilesik puan. Agirliklar oyunun kendi hedeflerinden: hegemonya puani
 * topraga/nufusa/sanayiye bakar, hazine harcanabilir gucu temsil eder,
 * istikrar ise ic huzurdur. Mutlak degeri degil SIRALAMASI anlamlidir.
 */
function score(r) {
  return r.snap.gold / 1000
    + r.snap.factoryLevels * 0.6
    + r.snap.population / 100000
    + r.snap.stability * 12
    + r.army.power / 20
    - r.snap.debt / 1000;
}

sub('Sonuclar (bilesik puana gore)');
const sorted = [...runs].sort((a, b) => score(b.r) - score(a.r));
console.log(table(sorted, [
  { label: 'strateji', get: (x) => x.label, right: false },
  { label: 'puan', get: (x) => n1(score(x.r)) },
  { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  { label: 'borc', get: (x) => n0(x.r.snap.debt) },
  { label: 'tesis/seviye', get: (x) => `${x.r.snap.factories}/${x.r.snap.factoryLevels}` },
  { label: 'kadro', get: (x) => n0(x.r.snap.employees) },
  { label: 'nufus', get: (x) => n0(x.r.snap.population) },
  { label: 'istikrar', get: (x) => n2(x.r.snap.stability) },
  { label: 'orduGucu', get: (x) => n1(x.r.army.power) },
  { label: 'ihtiyac', get: (x) => pct(x.r.cohorts.needsFulfilled) },
  { label: 'gdp', get: (x) => n1(x.r.snap.gdp) },
  { label: 'gelir', get: (x) => n2(x.r.snap.income) },
  { label: 'gider', get: (x) => n2(x.r.snap.expenses) },
]));

section('W. TANI');

const find = (label) => runs.find((x) => x.label === label).r;
const base = find('varsayilan (dokunma)');

// 1) Baskin strateji var mi
//
// Tek bir bilesik puan agirliklandirma tercihidir, oyunun kendi olcusu degil
// (hegemony.js puani sehir + ortak + TOPRAK okur; hazineyi hic okumaz). O
// yuzden asil olcut AGIRLIKSIZ olmali: bir set, dengeli setten BUTUN
// eksenlerde birden iyiyse baskindir. Bilesik puan yalniz siralama icin.
{
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  console.log(`  bilesik puan siralamasi (yalniz kaba siralama icin):`);
  console.log(`    en iyi "${best.label}" ${n1(score(best.r))}`
    + ` · ikinci "${sorted[1].label}" ${n1(score(sorted[1].r))}`
    + ` · en kotu "${worst.label}" ${n1(score(worst.r))}`);

  const AXES = [
    { key: 'hazine', get: (r) => r.snap.gold },
    { key: 'nufus', get: (r) => r.snap.population },
    { key: 'sanayi', get: (r) => r.snap.factoryLevels },
    { key: 'istikrar', get: (r) => r.snap.stability },
    { key: 'ihtiyac', get: (r) => r.cohorts.needsFulfilled },
  ];
  const balanced = find('DENGELI: YZ vergi + tarife %50 + refah %60 + egitim %60');
  const dominant = runs.filter((x) => x.r !== balanced
    && AXES.every((a) => a.get(x.r) > a.get(balanced) * 1.001));
  console.log(`\n  dengeli sete gore BUTUN eksenlerde ustun olan set sayisi: ${dominant.length}`);
  console.log(table([
    { label: 'DENGELI', r: balanced },
    { label: 'OPTIMAL AVI', r: find('OPTIMAL AVI: tavan vergi + tavan tarife + sifir sosyal + sifir ordu') },
    { label: 'REFAH DEVLETI', r: find('REFAH DEVLETI: dusuk vergi + tam sosyal') },
  ], [
    { label: 'set', get: (x) => x.label, right: false },
    ...AXES.map((a) => ({
      label: a.key,
      get: (x) => (a.key === 'nufus' || a.key === 'hazine' ? n0(a.get(x.r))
        : a.key === 'sanayi' ? String(a.get(x.r)) : n2(a.get(x.r))),
    })),
  ]));
  if (dominant.length) {
    finding('HIGH', 'Baskin politika seti var',
      'hicbir politika seti dengeli setten butun eksenlerde birden ustun olmamali',
      `${dominant.length} set baskin: ${dominant.map((x) => x.label).join(' | ')}`, '');
  } else {
    console.log('  OK  hicbir set butun eksenlerde birden ustun degil — her strateji bir seyi feda ediyor.');
  }
}

// 2) Vergi ekseninde monotonluk
{
  const rows = ['sifir vergi', 'dusuk vergi 5/5/5', 'YZ tavani 35/42/45', 'tam vergi %100']
    .map((l) => ({ l, r: find(l) }));
  console.log('\n  vergi ekseni:');
  console.log(table(rows, [
    { label: 'set', get: (x) => x.l, right: false },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
    { label: 'seviye', get: (x) => x.r.snap.factoryLevels },
    { label: 'nufus', get: (x) => n0(x.r.snap.population) },
    { label: 'istikrar', get: (x) => n2(x.r.snap.stability) },
    { label: 'ihtiyac', get: (x) => pct(x.r.cohorts.needsFulfilled) },
    { label: 'puan', get: (x) => n1(score(x.r)) },
  ]));
  const monotone = rows.every((x, i) => i === 0 || x.r.snap.gold >= rows[i - 1].r.snap.gold);
  const base = rows[0].r;
  const top = rows[rows.length - 1].r;
  console.log(`  tavan vergide matrah: nufus ${pct(relDelta(base.snap.population, top.snap.population))},`
    + ` sanayi ${pct(relDelta(base.snap.factoryLevels, top.snap.factoryLevels))},`
    + ` GSYH ${pct(relDelta(base.snap.gdp, top.snap.gdp))}`);
  if (monotone) {
    finding('MEDIUM', 'Vergi gelirinde Laffer egrisi yok',
      'cok yuksek vergi bir noktadan sonra matrahi kucultup geliri DUSURMELI',
      `hazine %0 -> ${n0(rows[0].r.snap.gold)}, %5 -> ${n0(rows[1].r.snap.gold)},`
      + ` YZ tavani -> ${n0(rows[2].r.snap.gold)}, %100 -> ${n0(rows[3].r.snap.gold)} (monoton artan)`,
      `matrah artik gercekten kuculuyor (nufus ${pct(relDelta(base.snap.population, top.snap.population))},`
      + ` sanayi ${pct(relDelta(base.snap.factoryLevels, top.snap.factoryLevels))}) ama yeterince degil:`
      + ' sinif geliri (incomePool) URETIM DEGERINDEN gelir, hane butcesinden degil,'
      + ' ve uretim degeri fiyat tavani sayesinde kitlikta bile yuksek kaliyor');
  }
}

// 3) Kaydiraclarin tek yonlu olup olmadigi
{
  const pairs = [
    ['sifir sosyal', 'tam sosyal'],
    ['sifir ordu', 'tam ordu'],
    ['yonetim %30', 'yonetim %100'],
    ['tarife %0', 'tarife %100'],
  ];
  console.log('\n  kaydirac uclari (puan farki, pozitif = tavan daha iyi):');
  for (const [lo, hi] of pairs) {
    const a = find(lo);
    const b = find(hi);
    console.log(`    ${lo.padEnd(16)} ${n1(score(a))}  vs  ${hi.padEnd(16)} ${n1(score(b))}`
      + `  -> ${n1(score(b) - score(a))}`);
  }
}

// 4) Subvansiyon istismari
{
  const sub2 = find('tam subvansiyon');
  console.log(`\n  tam subvansiyon: hazine ${n0(sub2.snap.gold)} (varsayilan ${n0(base.snap.gold)}),`
    + ` sanayi ${sub2.snap.factories}/${sub2.snap.factoryLevels}`
    + ` (varsayilan ${base.snap.factories}/${base.snap.factoryLevels}),`
    + ` haftalik subvansiyon ${n2(sub2.snap.subsidyCost)}`);
  if (sub2.snap.factoryLevels > base.snap.factoryLevels && sub2.snap.gold > 0) {
    finding('MEDIUM', 'Genel subvansiyon karli',
      'her fabrikayi desteklemek hazineyi yormali',
      `sanayi ${base.snap.factoryLevels} -> ${sub2.snap.factoryLevels} seviye,`
      + ` hazine ${n0(base.snap.gold)} -> ${n0(sub2.snap.gold)}`,
      'subvansiyon zarari kapatip kar egilimini 0\'a cektigi icin isten cikarma'
      + ' durur ve kadro (dolayisiyla seviye atlama) korunur');
  }
}

// 5) Insaat stratejisi
{
  const build = find('INSAAT: 12 santiye + tavan vergi + tavan tarife');
  const optimal = find('OPTIMAL AVI: tavan vergi + tavan tarife + sifir sosyal + sifir ordu');
  console.log(`  12 santiye eklemek: sanayi ${optimal.snap.factories}/${optimal.snap.factoryLevels}`
    + ` -> ${build.snap.factories}/${build.snap.factoryLevels},`
    + ` hazine ${n0(optimal.snap.gold)} -> ${n0(build.snap.gold)}`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
