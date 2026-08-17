// Istikrar denetimi. Beta bulgusu B-09: istikrar 60 yil boyunca %44'te
// dondu — uc savas, isgal ve nufusun ucte ikisinin dusman kontrolunde
// olmasina ragmen. Sorunun kokeni girdi eksikligiydi.
//
// Bu denetim iki sey arar:
//   1. Istikrar HAREKET EDIYOR mu (varyans)?
//   2. Isgal / savas / issizlik gercekten ISIRIYOR mu (isgal altindaki ulke
//      barisci ulkeden istikrarsiz mi)?

import {
  headless, alive, n0, n1, n2, pct, section, sub, table, finding, reportFindings,
} from './harness.mjs';
import { atWar } from '../../src/game/diplomacy.js';

const WEEKS = Number(process.argv[2] ?? 420);

section('ISTIKRAR DENETIMI');

const game = headless('STABIL');
const world = game.world;

// Ulke basina istikrar izi.
const trace = new Map();
for (let w = 0; w < WEEKS; w++) {
  game.turns.endTurn();
  for (const nation of alive(game)) {
    if (!trace.has(nation.id)) trace.set(nation.id, []);
    trace.get(nation.id).push(nation.economy.stability ?? 0);
  }
}

// --- 1. HAREKET EDIYOR MU? ---
sub('HAREKETLILIK');
const stats = [];
for (const nation of alive(game)) {
  const series = trace.get(nation.id) ?? [];
  if (series.length < 50) continue;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const mean = series.reduce((s, v) => s + v, 0) / series.length;
  const variance = series.reduce((s, v) => s + (v - mean) ** 2, 0) / series.length;
  stats.push({
    name: nation.name, min, max, mean, range: max - min,
    sd: Math.sqrt(variance),
    last: series[series.length - 1],
    bd: nation.economy.stabilityBreakdown ?? {},
  });
}
stats.sort((a, b) => a.range - b.range);
console.log('  En az hareket eden 6 ulke:');
console.log(table(stats.slice(0, 6), [
  { label: 'ulke', get: (r) => r.name, right: false },
  { label: 'min', get: (r) => pct(r.min) },
  { label: 'max', get: (r) => pct(r.max) },
  { label: 'aralik', get: (r) => pct(r.range) },
  { label: 'sapma', get: (r) => n2(r.sd * 100) },
]));
const frozen = stats.filter((r) => r.range < 0.05);
console.log(`\n  Butun kosuda %5'ten az oynayan ulke: ${frozen.length}/${stats.length}`);
const avgRange = stats.reduce((s, r) => s + r.range, 0) / Math.max(1, stats.length);
console.log(`  Ortalama oynama araligi: ${pct(avgRange)}`);
if (frozen.length > stats.length * 0.5) {
  finding('HIGH', 'istikrar donuk',
    'istikrar oyun boyunca anlamli olcude hareket etmeli',
    `${frozen.length}/${stats.length} ulke %5'ten az oynadi`);
}

// --- 2. GIRDILER ISIRIYOR MU? ---
sub('GIRDILERIN ETKISI');
const rows = alive(game).map((n) => {
  const bd = n.economy.stabilityBreakdown ?? {};
  return {
    name: n.name,
    stability: n.economy.stability ?? 0,
    base: bd.base ?? 0,
    occ: bd.occupation ?? 0,
    war: bd.war ?? 0,
    unemp: bd.unemployment ?? 0,
    occShare: bd.occupiedShare ?? 0,
    fronts: bd.warFronts ?? 0,
  };
}).sort((a, b) => a.stability - b.stability);

console.log(table(rows.slice(0, 10), [
  { label: 'ulke', get: (r) => r.name, right: false },
  { label: 'istikrar', get: (r) => pct(r.stability) },
  { label: 'taban', get: (r) => pct(r.base) },
  { label: 'isgal', get: (r) => n1(r.occ * 100) },
  { label: 'savas', get: (r) => n1(r.war * 100) },
  { label: 'issizlik', get: (r) => n1(r.unemp * 100) },
  { label: 'isgal%', get: (r) => pct(r.occShare) },
  { label: 'cephe', get: (r) => r.fronts },
]));

// Kimlik: taban + kalemler == istikrar (kirpma disinda)
let identityBad = 0;
for (const r of rows) {
  const sum = r.base + r.occ + r.war + r.unemp;
  if (Math.abs(sum - r.stability) > 0.02 && r.stability > 0.04 && r.stability < 0.97) {
    identityBad++;
  }
}
if (identityBad) {
  finding('HIGH', 'istikrar dokumu tutmuyor',
    'dokum kalemlerinin toplami istikrara esit olmali (ekranda gosterilecek)',
    `${identityBad} ulkede toplam tutmuyor`);
} else {
  console.log('\n  Dokum kimligi tutuyor: taban + isgal + savas + issizlik = istikrar.');
}

// Isgal altindakiler ile barisci/temiz olanlar karsilastirmasi
const occupiedNations = rows.filter((r) => r.occShare > 0.05);
const cleanNations = rows.filter((r) => r.occShare === 0 && r.fronts === 0);
const avg = (list, k) => (list.length ? list.reduce((s, r) => s + r[k], 0) / list.length : 0);
console.log(`\n  Isgal altindaki ${occupiedNations.length} ulke: ort. istikrar ${pct(avg(occupiedNations, 'stability'))}`);
console.log(`  Isgalsiz+barisci ${cleanNations.length} ulke: ort. istikrar ${pct(avg(cleanNations, 'stability'))}`);
if (occupiedNations.length >= 2 && cleanNations.length >= 2
  && avg(occupiedNations, 'stability') >= avg(cleanNations, 'stability')) {
  finding('HIGH', 'isgalin istikrara etkisi',
    'isgal altindaki ulke, isgalsiz ulkeden daha istikrarsiz olmali',
    `isgal altinda ${pct(avg(occupiedNations, 'stability'))} vs temiz ${pct(avg(cleanNations, 'stability'))}`);
}

// --- 3. KONTROLLU SENARYO: ISGAL ---
// Uzun kosuda o an isgal altinda ulke olmayabiliyor; isgal kanalini
// kanitlamak icin dogrudan kurulur. Beta'nin senaryosu tam olarak buydu.
sub('KONTROLLU SENARYO — ISGAL VE SAVAS');
const victim = alive(game).sort((a, b) => (b.tiles ?? 0) - (a.tiles ?? 0))[0];
const invader = alive(game).find((n) => n.id !== victim.id);
const before = {
  stability: victim.economy.stability,
  bd: { ...victim.economy.stabilityBreakdown },
};

// Kurbanin karelerinin ~%70'i isgal edilir + savas ilan edilir.
const { declareWar } = await import('../../src/game/diplomacy.js');
if (!atWar(world, invader.id, victim.id)) declareWar(game, invader.id, victim.id);
let taken = 0;
const target = Math.floor((victim.tiles ?? 0) * 0.7);
world.forEach((tile) => {
  if (tile.owner !== victim.id || taken >= target) return;
  tile.controller = invader.id;
  taken++;
});
for (let i = 0; i < 6; i++) game.turns.endTurn();

const after = {
  stability: victim.economy.stability,
  bd: { ...victim.economy.stabilityBreakdown },
};
console.log(`  ${victim.name}: ${taken} kare isgal edildi, ${invader.name} ile savasta.`);
console.log(table([
  { k: 'istikrar', a: pct(before.stability), b: pct(after.stability) },
  { k: 'taban', a: pct(before.bd.base ?? 0), b: pct(after.bd.base ?? 0) },
  { k: 'isgal kalemi', a: n1((before.bd.occupation ?? 0) * 100), b: n1((after.bd.occupation ?? 0) * 100) },
  { k: 'savas kalemi', a: n1((before.bd.war ?? 0) * 100), b: n1((after.bd.war ?? 0) * 100) },
  { k: 'isgal payi', a: pct(before.bd.occupiedShare ?? 0), b: pct(after.bd.occupiedShare ?? 0) },
  { k: 'cephe', a: before.bd.warFronts ?? 0, b: after.bd.warFronts ?? 0 },
], [
  { label: 'olcum', get: (r) => r.k, right: false },
  { label: 'once', get: (r) => r.a },
  { label: 'sonra', get: (r) => r.b },
]));

if ((after.bd.occupation ?? 0) >= -0.01) {
  finding('HIGH', 'isgal kanali olu',
    'isgal edilen ulkede isgal kalemi negatif olmali',
    `isgal kalemi ${n1((after.bd.occupation ?? 0) * 100)} (isgal payi ${pct(after.bd.occupiedShare ?? 0)})`);
} else if (after.stability >= before.stability) {
  finding('HIGH', 'isgalin net etkisi yok',
    'isgal + savas istikrari DUSURMELI',
    `${pct(before.stability)} -> ${pct(after.stability)}`);
} else {
  console.log(`  -> Isgal ve savas istikrari ${pct(before.stability)} -> ${pct(after.stability)} dusurdu. DOGRU.`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
