// MEKANIK SAGLIK TARAMASI — "bu mekanik calisiyor mu?"
//
// Tek soru sorar ve her mekanige ayni soruyu sorar: kaldiraci TABANDAN
// TAVANA cekince oyunda olculebilir bir sey degisiyor mu?
//
// Uc sonuc vardir:
//   OLU            — hicbir olcut kimildamadi (bit bit ayni). Mekanik yok.
//   GURULTU ALTI   — kimildadi ama tohum gurultusunun altinda. Oyuncu hissedemez.
//   CALISIYOR      — gurultunun uzerinde. Mekanik var.
//
// Gurultu tabani butce gecisinde olculdu (6 tohum, 160 hafta, hicbir seye
// dokunulmadan): hazine %50.8 · gsyh %51.9 · nufus %39.1 · needsMet %26.5 ·
// istikrar %5.5 · memnuniyet %5.3. Bir mekanigin BUTUN menzili bu esigin
// altindaysa oyuncu icin yoktur.
//
//   npm run audit:mechanics

import { headless, runPeaceful, pickNation, section, sub, finding, reportFindings } from './harness.mjs';
import { REFORMS, refreshReformModifiers } from '../../src/game/reforms.js';
import { setBudgetPolicy } from '../../src/game/economy.js';

const WEEKS = 120;
const WARMUP = 30;
const SEEDS = ['mh1', 'mh2'];

/** Gurultu tabani — butce gecisinde 6 tohumla olculdu. */
const NOISE = {
  gold: 50.8, gdp: 51.9, pop: 39.1, needs: 26.5, stab: 5.5, sat: 5.3,
};

function measure(nation) {
  const e = nation.economy;
  return {
    gold: nation.gold ?? 0,
    gdp: e.gdp ?? 0,
    pop: e.population ?? 0,
    needs: e.needsMet ?? 0,
    stab: e.stability ?? 0,
    sat: e.classes?.lower?.satisfaction ?? 0,
  };
}

/** Bir kolu kosar: `apply(nation)` her hafta cagrilir. */
function arm(seed, apply) {
  const game = headless(seed);
  runPeaceful(game, WARMUP);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  apply?.(nation);
  for (let i = 0; i < WEEKS; i++) {
    runPeaceful(game, 1);
    apply?.(nation);
  }
  return measure(nation);
}

/** Iki kolun en buyuk BAGIL farki (%), olcut olcut. */
function spread(a, b) {
  const out = {};
  let identical = true;
  let best = { key: null, pct: 0, ratio: 0 };
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) identical = false;
    const scale = Math.max(Math.abs(a[key]), Math.abs(b[key]), 1e-9);
    const pct = Math.abs(b[key] - a[key]) / scale * 100;
    out[key] = pct;
    const ratio = pct / NOISE[key];
    if (ratio > best.ratio) best = { key, pct, ratio };
  }
  return { out, identical, best };
}

function verdict(sp) {
  if (sp.identical) return 'OLU';
  return sp.best.ratio >= 1 ? 'CALISIYOR' : 'GURULTU ALTI';
}

const results = [];

function probe(label, applyLow, applyHigh) {
  const lows = SEEDS.map((s) => arm(s, applyLow));
  const highs = SEEDS.map((s) => arm(s, applyHigh));
  // Iki tohumda da ayniysa OLU; degilse en guclu sinyali al.
  const sps = lows.map((lo, i) => spread(lo, highs[i]));
  const identical = sps.every((s) => s.identical);
  const best = sps.reduce((acc, s) => (s.best.ratio > acc.ratio ? s.best : acc), { ratio: 0, key: '-', pct: 0 });
  const v = identical ? 'OLU' : (best.ratio >= 1 ? 'CALISIYOR' : 'GURULTU ALTI');
  results.push({ label, verdict: v, key: best.key, pct: best.pct, ratio: best.ratio });
  const mark = v === 'OLU' ? '  <<< OLU' : v === 'GURULTU ALTI' ? '  <-- hissedilmez' : '';
  console.log(`  ${label.padEnd(24)} ${v.padEnd(13)} en guclu: ${String(best.key).padEnd(6)}`
    + ` %${best.pct.toFixed(1).padStart(6)}  = gurultunun ${best.ratio.toFixed(2)} kati${mark}`);
}

// =========================================================== REFORMLAR
section('MEKANIK SAGLIK TARAMASI');
sub(`Reform merdivenleri — taban kademe vs tavan kademe (${WEEKS} hafta, ${SEEDS.length} tohum)`);

const ladders = (Array.isArray(REFORMS) ? REFORMS : Object.values(REFORMS));
for (const group of ladders) {
  const bottom = group.steps[0].id;
  const top = group.steps[group.steps.length - 1].id;
  // Siyasi kapi ATLANIR: burada kapinin degil ETKININ olcusu yapiliyor.
  const set = (id) => (nation) => {
    nation.politics.reforms[group.id] = id;
    refreshReformModifiers(nation);
  };
  probe(group.id, set(bottom), set(top));
}

// ============================================================ BUTCE
sub('Butce kaldiraclari — kontrol grubu (bunlarin calistigi ayrica dogrulandi)');
const budget = [
  ['taxRate', 0, 100],
  ['tariff', 0, 100],
  ['armyFunding', 25, 100],
  ['education', 0, 100],
  ['welfare', 0, 100],
];
for (const [policy, lo, hi] of budget) {
  probe(policy,
    (n) => setBudgetPolicy(n, policy, lo),
    (n) => setBudgetPolicy(n, policy, hi));
}

// ============================================================== OZET
sub('Ozet');
const dead = results.filter((r) => r.verdict === 'OLU');
const weak = results.filter((r) => r.verdict === 'GURULTU ALTI');
const live = results.filter((r) => r.verdict === 'CALISIYOR');
console.log(`  toplam ${results.length} mekanik · CALISIYOR ${live.length}`
  + ` · GURULTU ALTI ${weak.length} · OLU ${dead.length}`);

if (dead.length) {
  finding('HIGH', 'Olu mekanikler',
    'kaldiraci tabandan tavana cekmek olculebilir bir sey degistirmeli',
    `${dead.length} mekanikte HICBIR olcut kimildamadi: ${dead.map((d) => d.label).join(', ')}`);
}
if (weak.length) {
  finding('MEDIUM', 'Hissedilmeyen mekanikler',
    'butun menzil tohum gurultusunun uzerinde olmali',
    `${weak.length} mekanik gurultunun altinda: ${weak.map((w) => `${w.label} (${w.ratio.toFixed(2)}x)`).join(', ')}`);
}

reportFindings();
