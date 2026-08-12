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

const taxAll = (v) => ['lower', 'middle', 'upper'].map((c) => ({ key: 'tax', value: v, classId: c }));
const taxOne = (c, v) => [{ key: 'tax', value: v, classId: c }];

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
  if (goldGain > 0 && popCost < 0.03) {
    finding('HIGH', '%100 vergi neredeyse bedelsiz',
      'tavan vergi nufus/sanayi tarafinda gorunur bir bedel odemeli',
      `260 haftada hazine +${n0(goldGain)}, nufus farki yalniz ${pct(popCost)}`,
      `tek gorunur bedel istikrar (${n2(a.stability)} -> ${n2(b.stability)})`
      + ` ve ust sinifin erimesi (${n0(a.upperPop)} -> ${n0(b.upperPop)})`);
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
  if (a.gold > 0 && a.debt <= 0) {
    finding('MEDIUM', 'Sifir vergi devleti iflas etmiyor',
      'butun vergileri kapatmak hazineyi borca surmeli',
      `260 hafta boyunca vergi geliri 0 iken hazine ${n0(a.gold)} ve borc yok`,
      `province altin geliri (${n2(a.cityRevenue)}/hafta) vergi kaydiraciyla hic ilgili degil`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
