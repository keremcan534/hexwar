// C. VERGI UC DEGER TESTI
//
// Ayni tohum, tek degisken: sinif vergi orani. Her senaryo KENDI SURECINDE
// isler (bkz. harness.runScenario) — yoksa ayni surecte kurulan ikinci dunya
// ayni tohumla bile baska bir oyun olur.
//
// Sorulan sey "hazine artiyor mu" degil; hane bilancosunun, tuketimin,
// ihtiyac karsilanmasinin ve nufusun gercekten kimildayip kimildamadigi.

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';

const SEED = 'tax-audit';
const WARMUP = 52;
const TRACE = 52;
const WEEKS = 260;

function scenario(label, levers) {
  return runScenario({
    seed: SEED, label, warmup: WARMUP, weeks: WEEKS, trace: TRACE,
    peaceful: true, levers, measure: ['trace'],
  });
}

const at = (r, week) => (week >= WEEKS ? { ...r.snap, cohorts: r.cohorts }
  : r.trace.find((t) => t.week === WARMUP + 1 + week) ?? r.trace[Math.floor(week / TRACE) - 1]);

// TEK ORAN: sinif basina kaydirac kalmadi. "Kim oder" iktidarin
// ideolojisinden turer (economy.js TAX_STRUCTURES), oran herkes icin ayni.
// Vergi artik uc sinif orani (economy.tax). `taxAll` ucunu birden, `taxOne`
// yalniz istenen sinifi oynatir — sinif basina kanal boylece olculebilir.
const TAX_KEY = { lower: 'taxLower', middle: 'taxMiddle', upper: 'taxUpper' };
const taxAll = (v) => Object.values(TAX_KEY).map((key) => ({ key, value: v }));
const taxOne = (c, v) => [{ key: TAX_KEY[c] ?? 'taxLower', value: v }];

function row(label, m, cohorts) {
  return {
    label,
    taxRev: n2(m.taxRevenue),
    gold: n0(m.gold),
    debt: n0(m.debt),
    lowInc: n2(m.lowerIncome),
    lowTax: n2(m.lowerTax),
    lowBudget: n1(m.lowerBudget),
    lowCost: n1(m.lowerCost),
    lowSpent: n1(m.lowerSpent ?? m.lowerCost),
    met: pct(m.lowerMet ?? 1),
    dispo: n2(m.lowerBudget - m.lowerCost),
    needs: cohorts ? pct(cohorts.needsFulfilled) : '-',
    sat: n2(m.lowerSat),
    pop: n0(m.population),
    lowPop: n0(m.lowerPop),
    upPop: n0(m.upperPop),
    stab: n2(m.stability),
    fac: `${m.factories}/${n0(m.factoryLevels)}`,
    fill: pct(m.fill),
  };
}

const COLS = [
  { label: 'senaryo', get: (r) => r.label, right: false },
  { label: 'vergiGeliri', get: (r) => r.taxRev },
  { label: 'hazine', get: (r) => r.gold },
  { label: 'borc', get: (r) => r.debt },
  { label: 'altGelir', get: (r) => r.lowInc },
  { label: 'altVergi', get: (r) => r.lowTax },
  { label: 'altButce', get: (r) => r.lowBudget },
  { label: 'altSepet(istenen)', get: (r) => r.lowCost },
  { label: 'altHarcama(fiili)', get: (r) => r.lowSpent },
  { label: 'sepetKarsilanan', get: (r) => r.met },
  { label: 'artik', get: (r) => r.dispo },
  { label: 'ihtiyac', get: (r) => r.needs },
  { label: 'memnun', get: (r) => r.sat },
  { label: 'nufus', get: (r) => r.pop },
  { label: 'altNufus', get: (r) => r.lowPop },
  { label: 'ustNufus', get: (r) => r.upPop },
  { label: 'istikrar', get: (r) => r.stab },
  { label: 'fabrika', get: (r) => r.fac },
  { label: 'doluluk', get: (r) => r.fill },
];

section('C. VERGI TESTI — ayni tohum, tek degisken, savassiz kosu');
console.log(`  tohum ${SEED} · isitma ${WARMUP} hafta · olcum ${WEEKS} hafta · her senaryo ayri surecte`);

// ---------------------------------------------------------------- ALT SINIF ---
sub('Alt sinif vergisi 0 / 50 / 100 (diger vergiler varsayilanda)');
const lower = {
  0: scenario('lower0', taxOne('lower', 0)),
  50: scenario('lower50', taxOne('lower', 50)),
  100: scenario('lower100', taxOne('lower', 100)),
};
for (const idx of [0, 1, 4]) {
  const week = (idx + 1) * TRACE;
  console.log(`\n  hafta +${week}`);
  console.log(table(
    Object.entries(lower).map(([v, s]) => row(`altVergi=${v}%`, s.trace[idx], week === WEEKS ? s.cohorts : null)),
    COLS,
  ));
}

// -------------------------------------------------------------- ORTA/UST ---
sub('Orta ve ust sinif vergisi 0 / 100 (+260 hafta)');
const middle = { 0: scenario('mid0', taxOne('middle', 0)), 100: scenario('mid100', taxOne('middle', 100)) };
const upper = { 0: scenario('up0', taxOne('upper', 0)), 100: scenario('up100', taxOne('upper', 100)) };
console.log(table([
  ...Object.entries(middle).map(([v, s]) => row(`ortaVergi=${v}%`, s.snap, s.cohorts)),
  ...Object.entries(upper).map(([v, s]) => row(`ustVergi=${v}%`, s.snap, s.cohorts)),
], COLS));

console.log('\n  sinifin KENDI hanesi (hafta +260):');
console.log(table([
  ...Object.entries(middle).map(([v, s]) => ({
    label: `ortaVergi=${v}%`, b: s.snap.middleBudget, c: s.snap.middleCost,
    p: s.snap.middlePop, pc: s.snap.privateCapital,
  })),
  ...Object.entries(upper).map(([v, s]) => ({
    label: `ustVergi=${v}%`, b: s.snap.upperBudget, c: s.snap.upperCost,
    p: s.snap.upperPop, pc: s.snap.privateCapital,
  })),
], [
  { label: 'senaryo', get: (r) => r.label, right: false },
  { label: 'sinifButcesi', get: (r) => n1(r.b) },
  { label: 'sinifSepeti', get: (r) => n1(r.c) },
  { label: 'artik', get: (r) => n2(r.b - r.c) },
  { label: 'sinifNufusu', get: (r) => n0(r.p) },
  { label: 'ozelSermaye', get: (r) => n1(r.pc) },
]));

// --------------------------------------------------------------- HEPSI ---
sub('Butun vergiler 0% ve butun vergiler 100%');
const all0 = scenario('all0', taxAll(0));
const all100 = scenario('all100', taxAll(100));
for (const idx of [0, 1, 4]) {
  const week = (idx + 1) * TRACE;
  console.log(`\n  hafta +${week}`);
  console.log(table([
    row('hepsi=0%', all0.trace[idx], week === WEEKS ? all0.cohorts : null),
    row('hepsi=100%', all100.trace[idx], week === WEEKS ? all100.cohorts : null),
  ], COLS));
}

// ----------------------------------------------------------------- TANI ---
section('C. TANI');

{
  const lo = lower[0].snap.taxRevenue;
  const hi = lower[100].snap.taxRevenue;
  const d = relDelta(lo, hi);
  console.log(`  vergi geliri: alt %0 -> ${n2(lo)}/hafta · alt %100 -> ${n2(hi)}/hafta (${pct(d)})`);
  if (Math.abs(d) < 0.05) {
    finding('HIGH', 'Alt sinif vergisi -> hazine geliri', 'gelir belirgin artmali',
      `%${(d * 100).toFixed(1)} fark`, `0% -> ${n2(lo)}, 100% -> ${n2(hi)}`);
  }
}

{
  const a = lower[0].snap;
  const b = lower[100].snap;
  const dBudget = relDelta(a.lowerBudget, b.lowerBudget);
  console.log(`  alt sinif gecim BUTCESI: %0 -> ${n1(a.lowerBudget)} · %100 -> ${n1(b.lowerBudget)} (${pct(dBudget)})`);
  if (Math.abs(dBudget) < 0.05) {
    finding('CRITICAL', 'Vergi -> hane butcesi', 'butce vergiyle kuculmeli',
      'butce degismiyor', `%0: ${n1(a.lowerBudget)} · %100: ${n1(b.lowerBudget)}`);
  }
}

{
  const a = lower[0].snap;
  const b = lower[100].snap;
  // Olculen sey FIILI harcamadir. "Istenen sepet" (needsCost) butceden bagimsiz
  // kalmaya devam eder ve oyle kalmali: sinif dususu ve memnuniyet zincirleri
  // "ne kadarini karsilayamiyor" sorusunu ondan okur.
  const dSpent = relDelta(a.lowerSpent, b.lowerSpent);
  console.log(`  alt sinif FIILI HARCAMASI (piyasa talebi): %0 -> ${n1(a.lowerSpent)}`
    + ` · %100 -> ${n1(b.lowerSpent)} (${pct(dSpent)})`);
  console.log(`  sepetin karsilanan orani: %0 -> ${pct(a.lowerMet)} · %100 -> ${pct(b.lowerMet)}`);
  if (Math.abs(dSpent) < 0.25) {
    finding('CRITICAL', 'Vergi -> hane tuketimi -> piyasa talebi',
      'butcesi sifirlanan sinif daha az mal almali, piyasa talebi dusmeli',
      `fiili harcama farki yalniz ${pct(dSpent)}`,
      `%0 vergi: butce ${n1(a.lowerBudget)} harcama ${n1(a.lowerSpent)} | `
      + `%100 vergi: butce ${n1(b.lowerBudget)} harcama ${n1(b.lowerSpent)}`);
  }
}

{
  const b = all100.snap;
  const a = all0.snap;
  console.log(`  hepsi=%100 @260: altButce ${n1(b.lowerBudget)} · altSepet ${n1(b.lowerCost)}`
    + ` · ihtiyacKarsilanma ${pct(all100.cohorts.needsFulfilled)} · nufus ${n0(b.population)}`);
  console.log(`  hepsi=%0   @260: altButce ${n1(a.lowerBudget)} · altSepet ${n1(a.lowerCost)}`
    + ` · ihtiyacKarsilanma ${pct(all0.cohorts.needsFulfilled)} · nufus ${n0(a.population)}`);
  const popCost = (a.population - b.population) / Math.max(1, a.population);
  const goldGain = b.gold - a.gold;
  console.log(`  tavan verginin 260 haftalik bedeli: nufus ${pct(popCost)},`
    + ` istikrar ${n2(a.stability)} -> ${n2(b.stability)}, sanayi ${a.factories}/${a.factoryLevels}`
    + ` -> ${b.factories}/${b.factoryLevels}, hazine +${n0(goldGain)}`);
  // TASARIM: yoksulluk nufusu oldurmez (provinces.js). Tavan verginin bedeli
  // istikrar, ust sinifin erimesi, sanayi ve buyume tarafinda odenir; olcut
  // bunlardan en az ikisinin gorunur olmasidir.
  const costs = [];
  if (a.stability - b.stability >= 0.1) costs.push(`istikrar ${n2(a.stability)} -> ${n2(b.stability)}`);
  if (a.upperPop > 0 && (a.upperPop - b.upperPop) / a.upperPop >= 0.1) costs.push(`ust sinif ${n0(a.upperPop)} -> ${n0(b.upperPop)}`);
  if (a.factoryLevels - b.factoryLevels >= 2) costs.push(`sanayi ${a.factoryLevels} -> ${b.factoryLevels} seviye`);
  if (popCost >= 0.01) costs.push(`nufus ${pct(popCost)}`);
  console.log(`  gorunur bedeller: ${costs.length ? costs.join(' · ') : 'YOK'}`);
  if (goldGain > 0 && costs.length < 2) {
    finding('HIGH', '%100 vergi neredeyse bedelsiz',
      'tavan vergi istikrar/sinif/sanayi/buyume tarafinda en az iki gorunur bedel odemeli',
      `260 haftada hazine +${n0(goldGain)}, gorunur bedel: ${costs.length ? costs.join(', ') : 'yok'}`,
      `nufus farki ${pct(popCost)} — tasarim geregi yoksulluk oldurmez`);
  }
  if (b.lowerBudget < 0) {
    finding('HIGH', '%100 vergide hane butcesi negatif', 'butce 0 tabanina oturmali',
      `${n1(b.lowerBudget)}`, '');
  }
}

{
  const a = all0.snap;
  console.log(`  butun vergiler %0 iken hazine ${n0(a.gold)}, borc ${n0(a.debt)},`
    + ` sehir geliri ${n2(a.cityRevenue)}/hafta (vergiden bagimsiz)`);
  // Devletin vergi disi geliri (province altini, devlet tesisi, gumruk)
  // tasarimdir; sifir vergi iflas ettirmek zorunda degil ama hazineyi
  // BELIRGIN yoksullastirmali: tavan senaryonun en cok ucte biri.
  const b = all100.snap;
  const share = b.gold > 0 ? a.gold / b.gold : 0;
  console.log(`  sifir vergi hazinesi tavan senaryonun ${pct(share)}'i`);
  if (a.gold > 0 && a.debt <= 0 && share > 0.34) {
    finding('MEDIUM', 'Sifir vergi neredeyse bedelsiz',
      'vergisiz hazine tavan senaryonun ucte birini gecmemeli',
      `260 haftada sifir vergi ${n0(a.gold)} vs tavan ${n0(b.gold)} (${pct(share)})`,
      `vergi disi gelir (province altini ${n2(a.cityRevenue)}/hafta) tek basina yetiyor`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
