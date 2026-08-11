// Vergi sisteminin DAVRANIS denetimi.
//
// Soru sudur: kaydirac depolanan bir yuzdeyi degistiriyor diye sistem
// calisiyor sayilmaz. Ayni tohumla iki dunya kurulur, yalniz alt sinif
// vergisi degisir, 104 hafta islenir ve hanenin parasina ne oldugu olculur.
//
// Kullanim: node scripts/tax-behavior-diagnostic.mjs [hafta=104] [tohum=tax]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { setFiscalPolicy } from '../src/game/economy.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    reachable: null, autosaveEnabled: false, listeners: {},
    renderer: { invalidateCache() {}, resize() {} },
    camera: { setBounds() {}, fit() {} },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  return game;
}

const WEEKS = Number(process.argv[2] ?? 104);
const SEED = process.argv[3] ?? 'tax';

/**
 * Tek senaryo. Olculen ulke OYUNCU olarak isaretlenir: YZ maliyesi her hafta
 * kaydiraci parti tercihine geri surukler ve iki kosu ayni yere yakinsar —
 * kaldirac olu gorunur ama olcumu YZ ezmistir.
 */
function runScenario(lowerTax) {
  const game = headless(SEED);
  const world = game.world;
  const nation = world.nations.find((n) => n.alive && n.economy);
  game.turns.playerNation = nation.id;
  setFiscalPolicy(nation, 'tax', lowerTax, 'lower');

  let consumption = 0;
  let taxRevenue = 0;
  let samples = 0;
  for (let week = 0; week < WEEKS; week++) {
    game.turns.endTurn();
    // YZ'nin dokunmadigindan emin ol: oyuncu ulkesi her hafta sabit kalmali.
    setFiscalPolicy(nation, 'tax', lowerTax, 'lower');
    const lower = nation.economy.classes.lower;
    consumption += lower.needsCost ?? 0;
    taxRevenue += nation.economy.ledger?.taxRevenue ?? 0;
    samples++;
  }

  const lower = nation.economy.classes.lower;
  const grossIncome = lower.income ?? 0;
  const taxPaid = lower.taxPaid ?? 0;
  return {
    lowerTax,
    grossIncome,
    taxPaid,
    // Harcanabilir gelir = geçim butcesi (vergiden SONRA hesaplanir).
    disposable: lower.needsBudget ?? 0,
    consumption: consumption / samples,
    needsFulfilled: (lower.needsBudget ?? 0) / Math.max(0.001, lower.needsCost ?? 0),
    satisfaction: lower.satisfaction ?? 0,
    canAfford: lower.canAffordNeeds,
    hardshipWeeks: lower.hardshipWeeks ?? 0,
    stability: nation.economy.stability ?? 0,
    taxRevenue: taxRevenue / samples,
    population: lower.population ?? 0,
    // Fabrika talebi: sanayinin toplam girdi talebi (hane tuketimi duserse
    // tuketim mallari zinciri de dusmeli).
    factoryDemand: Object.values(world.market.goods)
      .reduce((sum, state) => sum + (state.demand ?? 0), 0),
    treasury: nation.gold,
  };
}

console.log(`HexWar vergi davranis denetimi — ${WEEKS} hafta, tohum '${SEED}'`);
console.log('Ayni tohum, ayni dunya; yalniz ALT SINIF VERGISI farkli.\n');

const a = runScenario(0);
const b = runScenario(80);

const rows = [
  ['brut gelir (haftalik)', a.grossIncome, b.grossIncome, 'esit olmali'],
  ['odenen vergi', a.taxPaid, b.taxPaid, 'B cok daha yuksek'],
  ['harcanabilir gelir', a.disposable, b.disposable, 'B DAHA DUSUK'],
  ['tuketim (ort.)', a.consumption, b.consumption, 'B daha dusuk'],
  ['ihtiyac karsilama', a.needsFulfilled, b.needsFulfilled, 'B daha dusuk'],
  ['memnuniyet', a.satisfaction, b.satisfaction, 'B daha dusuk'],
  ['istikrar', a.stability, b.stability, 'B daha dusuk'],
  ['hazine vergi geliri', a.taxRevenue, b.taxRevenue, 'B daha yuksek'],
  ['alt sinif nufusu', a.population, b.population, '—'],
  ['fabrika/pazar talebi', a.factoryDemand, b.factoryDemand, '—'],
];

console.log('olcut'.padEnd(24) + 'A (%0)'.padStart(12) + 'B (%80)'.padStart(12)
  + 'fark'.padStart(12) + '  beklenti');
console.log('-'.repeat(84));
for (const [label, va, vb, expect] of rows) {
  const delta = vb - va;
  const pct = Math.abs(va) > 1e-9 ? ` (${(delta / Math.abs(va) * 100).toFixed(1)}%)` : '';
  console.log(label.padEnd(24)
    + va.toFixed(3).padStart(12)
    + vb.toFixed(3).padStart(12)
    + (delta.toFixed(3) + pct).padStart(12)
    + '  ' + expect);
}

// --- Kabul olcutu ---------------------------------------------------------
const checks = [
  {
    name: 'Vergi hanenin cebine giriyor (harcanabilir gelir dusuyor)',
    ok: b.disposable < a.disposable * 0.9,
    detail: `${a.disposable.toFixed(2)} -> ${b.disposable.toFixed(2)}`,
  },
  {
    name: 'Odenen vergi gercekten artiyor',
    ok: b.taxPaid > a.taxPaid,
    detail: `${a.taxPaid.toFixed(2)} -> ${b.taxPaid.toFixed(2)}`,
  },
  {
    name: 'Hazine geliri artiyor',
    ok: b.taxRevenue > a.taxRevenue,
    detail: `${a.taxRevenue.toFixed(2)} -> ${b.taxRevenue.toFixed(2)}`,
  },
  {
    name: 'Ihtiyac karsilama kotulesiyor',
    ok: b.needsFulfilled < a.needsFulfilled,
    detail: `${a.needsFulfilled.toFixed(3)} -> ${b.needsFulfilled.toFixed(3)}`,
  },
  {
    name: 'Memnuniyet dusuyor (huzursuzluk yerine gecen olcut)',
    ok: b.satisfaction < a.satisfaction,
    detail: `${a.satisfaction.toFixed(3)} -> ${b.satisfaction.toFixed(3)}`,
  },
];

console.log('\nKABUL OLCUTU');
let failed = 0;
for (const check of checks) {
  if (!check.ok) failed++;
  console.log(`  ${check.ok ? 'GECTI' : 'KALDI'}  ${check.name} — ${check.detail}`);
}

console.log('\nOLCULEMEYEN (modelde yok):');
console.log('  birikim/servet   — POP ya da sinif duzeyinde kasa alani yok');
console.log('  radikallesme     — POP duzeyinde yok; ulusal stability vekil olarak kullanildi');

console.log(`\n${failed === 0 ? 'GECTI' : `KALDI — ${failed} kontrol`}`);
process.exit(failed === 0 ? 0 : 1);
