// V. YZ EKONOMIK HAYATTA KALMA TESTI
//
// 10 deterministik tohum x 260 hafta. Her ulke icin hazine, borc, sanayi,
// ordu, vergi, gumruk, harcama kaydiraclari ve istikrar taranir; sonra
// patolojiler sayilir.

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct,
} from './harness.mjs';

const SEEDS = ['ai-1', 'ai-2', 'ai-3', 'ai-4', 'ai-5', 'ai-6', 'ai-7', 'ai-8', 'ai-9', 'ai-10'];
const WEEKS = 260;

section(`V. YZ HAYATTA KALMA — ${SEEDS.length} tohum x ${WEEKS} hafta`);

const all = [];
for (const seed of SEEDS) {
  const r = runScenario({
    seed, warmup: 0, weeks: WEEKS, asPlayer: false, measure: ['nations'],
  });
  for (const n of r.nations) all.push({ seed, ...n });
}

sub('Tohum bazinda ozet');
const bySeed = SEEDS.map((seed) => {
  const rows = all.filter((r) => r.seed === seed);
  const sum = (key) => rows.reduce((s, r) => s + r[key], 0);
  const avg = (key) => sum(key) / Math.max(1, rows.length);
  return {
    seed,
    nations: rows.length,
    broke: rows.filter((r) => r.gold <= 0).length,
    negative: rows.filter((r) => r.gold < -50).length,
    indebted: rows.filter((r) => r.debt > 0).length,
    avgGold: avg('gold'),
    avgDebt: avg('debt'),
    avgFactories: avg('factories'),
    avgLevels: avg('factoryLevels'),
    avgRegiments: avg('regiments'),
    avgStability: avg('stability'),
    avgTaxLower: avg('taxLower'),
    avgTariff: avg('tariff'),
    avgEdu: avg('education'),
    avgWel: avg('welfare'),
    subsidized: sum('subsidized'),
    atWar: rows.filter((r) => r.atWar).length,
    zeroFactory: rows.filter((r) => r.factories === 0).length,
  };
});
console.log(table(bySeed, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'ulke', get: (r) => r.nations },
  { label: 'hazine<=0', get: (r) => r.broke },
  { label: 'hazine<-50', get: (r) => r.negative },
  { label: 'borclu', get: (r) => r.indebted },
  { label: 'ortHazine', get: (r) => n0(r.avgGold) },
  { label: 'ortBorc', get: (r) => n0(r.avgDebt) },
  { label: 'ortTesis', get: (r) => n1(r.avgFactories) },
  { label: 'ortSeviye', get: (r) => n1(r.avgLevels) },
  { label: 'ortAlay', get: (r) => n1(r.avgRegiments) },
  { label: 'ortIstikrar', get: (r) => n2(r.avgStability) },
  { label: 'ortAltVergi', get: (r) => n1(r.avgTaxLower) },
  { label: 'ortTarife', get: (r) => n1(r.avgTariff) },
  { label: 'ortEgitim', get: (r) => n1(r.avgEdu) },
  { label: 'ortRefah', get: (r) => n1(r.avgWel) },
  { label: 'destekli', get: (r) => r.subsidized },
  { label: 'savasta', get: (r) => r.atWar },
  { label: 'tesissiz', get: (r) => r.zeroFactory },
]));

sub('Politika kaydiraclarinin dagilimi (butun ulkeler, butun tohumlar)');
const dist = (key, buckets) => {
  const out = buckets.map((b) => ({ b, n: 0 }));
  for (const r of all) {
    const v = r[key];
    for (let i = out.length - 1; i >= 0; i--) {
      if (v >= out[i].b) { out[i].n++; break; }
    }
  }
  return out.map((o) => `${o.b}+:${o.n}`).join(' ');
};
console.log(`  alt vergi   ${dist('taxLower', [0, 10, 20, 30, 35])}`);
console.log(`  orta vergi  ${dist('taxMiddle', [0, 10, 20, 30, 42])}`);
console.log(`  ust vergi   ${dist('taxUpper', [0, 10, 20, 30, 45])}`);
console.log(`  tarife      ${dist('tariff', [-50, -10, 0, 25, 50, 99])}`);
console.log(`  egitim      ${dist('education', [0, 20, 40, 60, 100])}`);
console.log(`  saglik      ${dist('health', [0, 20, 40, 60, 100])}`);
console.log(`  refah       ${dist('welfare', [0, 20, 40, 60, 100])}`);
console.log(`  askeriMaas  ${dist('militaryWages', [25, 50, 75, 100])}`);
console.log(`  tedarik     ${dist('militaryProcurement', [25, 50, 75, 100])}`);
console.log(`  yonetim     ${dist('adminFunding', [30, 50, 75, 100])}`);

sub('En kotu 12 ulke (borc yuku)');
const worst = [...all].sort((a, b) => (b.debt - b.gold) - (a.debt - a.gold)).slice(0, 12);
console.log(table(worst, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'ulke', get: (r) => r.id },
  { label: 'hazine', get: (r) => n0(r.gold) },
  { label: 'borc', get: (r) => n0(r.debt) },
  { label: 'gelir', get: (r) => n2(r.income) },
  { label: 'gider', get: (r) => n2(r.expenses) },
  { label: 'net', get: (r) => n2(r.net) },
  { label: 'ordu', get: (r) => n2(r.armyCost) },
  { label: 'tedarik', get: (r) => n2(r.procurementCost) },
  { label: 'sosyal', get: (r) => n2(r.socialCost) },
  { label: 'insaat', get: (r) => n2(r.constructionCost) },
  { label: 'faiz', get: (r) => n2(r.interestCost) },
  { label: 'destek', get: (r) => n2(r.subsidyCost) },
  { label: 'alay', get: (r) => r.regiments },
  { label: 'tesis', get: (r) => r.factories },
  { label: 'savasta', get: (r) => (r.atWar ? 'evet' : '-') },
]));

section('V. PATOLOJI TARAMASI');

const total = all.length;
const pct0 = (n) => `${n}/${total} (${((n / total) * 100).toFixed(0)}%)`;

// 1) Kalici negatif hazine
{
  const bad = all.filter((r) => r.gold < -50);
  console.log(`  hazinesi -50 altinda: ${pct0(bad.length)}`);
  if (bad.length > total * 0.15) {
    finding('HIGH', 'YZ kalici negatif hazineye dusuyor',
      'YZ acik verince harcamalarini kismali ve toparlanmali',
      `${pct0(bad.length)} ulke ${WEEKS}. haftada negatif hazinede`,
      `en kotu ${n0(Math.min(...bad.map((r) => r.gold)))}; adjustWarFiscalAI'nin kriz dali`
      + ' yalniz `borc > kapasite/2 VE hazine < 50` sartiyla aciliyor ve sosyal/tedarik'
      + ' kesintisi acigi kapatmaya yetmiyor');
  }
}

// 2) Borc tavanina yapisik
{
  const bad = all.filter((r) => r.debt > 0 && r.debt >= r.income * 26 * 0.95);
  console.log(`  borc kapasitesinin %95+'inde: ${pct0(bad.length)}`);
  if (bad.length > total * 0.15) {
    finding('MEDIUM', 'YZ borc tavaninda sikisip kaliyor',
      'borc gecici bir arac olmali, kalici durum degil', `${pct0(bad.length)}`, '');
  }
}

// 3) Vergiyi tavanda tutma
{
  const maxTax = all.filter((r) => r.taxLower >= 35 && r.taxMiddle >= 42 && r.taxUpper >= 45);
  console.log(`  uc vergiyi de YZ tavaninda tutan: ${pct0(maxTax.length)}`);
  if (maxTax.length > total * 0.4) {
    finding('MEDIUM', 'YZ vergiyi surekli tavanda tutuyor',
      'vergi bir tercih olmali; kriz gecince inmeli',
      `${pct0(maxTax.length)} ulke uc vergiyi de YZ tavaninda tutuyor`,
      'adjustFiscalAI yalniz `rich` (hazine > 600 VE haftalik net > 0) durumunda vergi indirir;'
      + ' borclu ulke bu esige hic ulasamaz, vergi tek yonlu yukselir');
  }
}

// 4) Gumrugu tavanda tutma
{
  const maxTariff = all.filter((r) => r.tariff >= 99);
  const zeroTariff = all.filter((r) => r.tariff <= 0);
  console.log(`  tarifesi %99+: ${pct0(maxTariff.length)} · tarifesi <=0: ${pct0(zeroTariff.length)}`);
}

// 5) Hicbir seye yatirim yapmayan / sanayisiz
{
  const noFactory = all.filter((r) => r.factories === 0);
  const hoarding = all.filter((r) => r.gold > 3000 && r.factories < 5);
  console.log(`  hic fabrikasi olmayan: ${pct0(noFactory.length)}`
    + ` · para yigip yatirim yapmayan (hazine>3000, tesis<5): ${pct0(hoarding.length)}`);
  if (noFactory.length) {
    finding('MEDIUM', 'Sanayisiz YZ ulkeleri', 'her ulkenin kurulus sanayisi vardir',
      `${pct0(noFactory.length)} ulkenin hic fabrikasi yok`,
      'kurulus tesisleri (STARTING_INDUSTRY) yalniz sehri olan ulkelere veriliyor;'
      + ' sehrini kaybeden ulke sanayisiz kaliyor');
  }
  if (hoarding.length > total * 0.15) {
    finding('MEDIUM', 'YZ para yigiyor, yatirim yapmiyor',
      'zengin YZ sanayilesmeli', `${pct0(hoarding.length)}`, '');
  }
}

// 6) Sosyal harcamayi hic acmayan
{
  const noSocial = all.filter((r) => r.education === 0 && r.health === 0 && r.welfare === 0);
  const maxSocial = all.filter((r) => r.education >= 90 && r.health >= 90 && r.welfare >= 90);
  console.log(`  uc sosyal kalemi de kapali: ${pct0(noSocial.length)}`
    + ` · ucu de %90+: ${pct0(maxSocial.length)}`);
}

// 7) Butun kaydiraclari tavana ceken
{
  const maxAll = all.filter((r) => r.militaryWages >= 100 && r.militaryProcurement >= 100
    && r.adminFunding >= 100 && r.education >= 90 && r.health >= 90 && r.welfare >= 90);
  console.log(`  butun harcama kaydiraclarini tavana ceken: ${pct0(maxAll.length)}`);
}

// 8) Sabit ekonomi
{
  const stagnant = all.filter((r) => r.factoryLevels <= r.factories + 1);
  console.log(`  sanayisi hic seviye atlamamis (seviye ~= tesis sayisi): ${pct0(stagnant.length)}`);
}

// 9) Ordu buyuklugu makul mu
{
  const bloated = all.filter((r) => r.soldiers > r.population * 0.15);
  const disarmed = all.filter((r) => r.regiments === 0);
  console.log(`  ordusu nufusun %15'inden buyuk: ${pct0(bloated.length)}`
    + ` · hic kara birimi olmayan: ${pct0(disarmed.length)}`);
  if (bloated.length) {
    finding('MEDIUM', 'YZ tasiyamayacagi ordu kuruyor',
      'ordu nufusa gore makul kalmali', `${pct0(bloated.length)}`, '');
  }
}

// 10) Sanayi/istikrar dagilimi
{
  const sorted = [...all].sort((a, b) => b.factoryLevels - a.factoryLevels);
  console.log(`  sanayi dagilimi: en buyuk ${sorted[0].factoryLevels} seviye,`
    + ` medyan ${sorted[Math.floor(sorted.length / 2)].factoryLevels},`
    + ` en kucuk ${sorted[sorted.length - 1].factoryLevels}`);
  const unstable = all.filter((r) => r.stability < 0.35);
  console.log(`  istikrari 0.35 altinda: ${pct0(unstable.length)}`);
}

// ----------------------------------------------------- GEC OYUN (520h) ---
// 260 hafta YZ'yi saglikli gosteriyor; mali cokus daha sonra basliyor.
// Ayni tohumlarin ilk yarisiyla 520 haftalik hali yan yana konur.
sub('Gec oyun: 5 tohum x 520 hafta');
{
  const late = [];
  for (const seed of SEEDS.slice(0, 5)) {
    const r = runScenario({ seed, warmup: 0, weeks: 520, asPlayer: false, measure: ['nations'] });
    for (const n of r.nations) late.push({ seed, ...n });
  }
  const compare = (rows, label) => ({
    label,
    n: rows.length,
    broke: rows.filter((r) => r.gold <= 0).length,
    negative: rows.filter((r) => r.gold < -50).length,
    indebted: rows.filter((r) => r.debt > 0).length,
    gold: rows.reduce((s, r) => s + r.gold, 0) / rows.length,
    debt: rows.reduce((s, r) => s + r.debt, 0) / rows.length,
    levels: rows.reduce((s, r) => s + r.factoryLevels, 0) / rows.length,
    stability: rows.reduce((s, r) => s + r.stability, 0) / rows.length,
    maxTax: rows.filter((r) => r.taxLower >= 35 && r.taxMiddle >= 42 && r.taxUpper >= 45).length,
    maxTariff: rows.filter((r) => r.tariff >= 99).length,
  });
  const early = all.filter((r) => SEEDS.slice(0, 5).includes(r.seed));
  console.log(table([compare(early, '260 hafta'), compare(late, '520 hafta')], [
    { label: 'ufuk', get: (r) => r.label, right: false },
    { label: 'ulke', get: (r) => r.n },
    { label: 'hazine<=0', get: (r) => r.broke },
    { label: 'hazine<-50', get: (r) => r.negative },
    { label: 'borclu', get: (r) => r.indebted },
    { label: 'ortHazine', get: (r) => n0(r.gold) },
    { label: 'ortBorc', get: (r) => n0(r.debt) },
    { label: 'ortSeviye', get: (r) => n1(r.levels) },
    { label: 'ortIstikrar', get: (r) => n2(r.stability) },
    { label: 'vergiTavaninda', get: (r) => r.maxTax },
    { label: 'tarifeTavaninda', get: (r) => r.maxTariff },
  ]));
  const bad = late.filter((r) => r.gold < -50);
  console.log(`\n  520. haftada hazinesi -50 altinda: ${bad.length}/${late.length}`
    + ` (${((bad.length / late.length) * 100).toFixed(0)}%)`
    + (bad.length ? ` · en kotu ${n0(Math.min(...bad.map((r) => r.gold)))}` : ''));
  if (bad.length > late.length * 0.1) {
    finding('HIGH', 'YZ gec oyunda toparlanamaz acige giriyor',
      'YZ acik verince harcamalarini kisip toparlanmali',
      `260. haftada ${all.filter((r) => r.gold < -50).length}/${all.length} ulke negatif hazinede;`
      + ` 520. haftada ${bad.length}/${late.length}`
      + ` (en kotu ${n0(Math.min(...bad.map((r) => r.gold)))})`,
      'adjustWarFiscalAI kriz dali yalniz `borc > kapasite/2 VE hazine < 50` sartiyla acilir;'
      + ' actiginda da yalniz sosyal ve tedariki kisar. Hazinenin tabani olmadigi icin'
      + ' (bkz. debt-audit) acik geri donulemez sekilde birikir.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
