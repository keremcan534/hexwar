// Butce sisteminin uzun vadeli dogrulamasi.
//
// Iki soru: (1) muhasebe kimligi her hafta kapaniyor mu —
// Δhazine = net + borclanilan - odenen; (2) YZ ulkeleri genisletilmis butceyle
// uzun simulasyonda mali cokuse girmeden yasayabiliyor mu.
//
// Kullanim: node scripts/budget-diagnostic.mjs [hafta=260] [tohum=budget]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { debtCapacity } from '../src/game/economy.js';

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
  game.turns.playerNation = -1;
  return game;
}

const WEEKS = Number(process.argv[2] ?? 260);
const SEED = process.argv[3] ?? 'budget';
const game = headless(SEED);
const world = game.world;

console.log(`HexWar butce tanilamasi — ${WEEKS} hafta, tohum '${SEED}',`
  + ` ${world.nations.length} ulke\n`);

let identityWorst = 0;
let identitySamples = 0;
let identityBad = 0;
const goldPrev = new Map();
const stats = {
  treasury: 0, debt: 0, procurement: 0, subsidy: 0, construction: 0,
  interest: 0, readiness: 0, samples: 0, insolventWeeks: 0, negativeGoldWeeks: 0,
};

for (let week = 1; week <= WEEKS; week++) {
  for (const nation of world.nations) goldPrev.set(nation.id, nation.gold);
  game.turns.endTurn();
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy?.ledger) continue;
    const L = nation.economy.ledger;
    if (L.lastUpdated !== world.turn) continue;
    const delta = nation.gold - goldPrev.get(nation.id);
    // Temerrut de bir bilanco hareketidir: borclanma kapasitesi dolunca
    // odenmeyen acik hazineyi sifira oturtur (bkz. economy.js settleDebt).
    const expected = (L.net ?? 0) + (L.borrowed ?? 0) - (L.repaid ?? 0) + (L.defaulted ?? 0);
    const err = Math.abs(delta - expected);
    identitySamples++;
    identityWorst = Math.max(identityWorst, err);
    // Es zamanli akislarin yuvarlanmasi icin kucuk tolerans.
    if (err > 0.05) identityBad++;

    stats.treasury += nation.gold;
    stats.debt += nation.debt ?? 0;
    stats.procurement += L.procurementCost ?? 0;
    stats.subsidy += L.subsidyCost ?? 0;
    stats.construction += (L.constructionCost ?? 0) + (L.projectCost ?? 0);
    stats.interest += L.interestCost ?? 0;
    stats.readiness += nation.economy.military?.supplyIndex ?? 1;
    stats.samples++;
    const capacity = debtCapacity(nation);
    if ((nation.debt ?? 0) >= capacity * 0.95) stats.insolventWeeks++;
    if (nation.gold < -1) stats.negativeGoldWeeks++;
  }
}

const avg = (key) => (stats[key] / Math.max(1, stats.samples));
const alive = world.nations.filter((n) => n.alive);
console.log('MUHASEBE KIMLIGI');
console.log(`  ornek ${identitySamples} · en kotu sapma ${identityWorst.toFixed(4)}`
  + ` · toleransi asan ${identityBad}`);
console.log('\nORTALAMALAR (ulke-hafta basina)');
console.log(`  hazine        ${avg('treasury').toFixed(1)}`);
console.log(`  borc          ${avg('debt').toFixed(1)}`);
console.log(`  tedarik       ${avg('procurement').toFixed(2)}/hafta`);
console.log(`  subvansiyon   ${avg('subsidy').toFixed(2)}/hafta`);
console.log(`  insaat        ${avg('construction').toFixed(2)}/hafta`);
console.log(`  faiz          ${avg('interest').toFixed(3)}/hafta`);
console.log(`  ikmal endeksi ${avg('readiness').toFixed(2)}`);
console.log('\nSAGLIK');
console.log(`  kapasite tavaninda gecen ulke-hafta  ${stats.insolventWeeks}`
  + ` (%${(stats.insolventWeeks / Math.max(1, stats.samples) * 100).toFixed(1)})`);
console.log(`  eksi hazinede gecen ulke-hafta       ${stats.negativeGoldWeeks}`
  + ` (%${(stats.negativeGoldWeeks / Math.max(1, stats.samples) * 100).toFixed(1)})`);
console.log(`  yasayan ulke                         ${alive.length}/${world.nations.length}`);
console.log(`  son hafta ort. hazine / borc         ${(
  alive.reduce((s, n) => s + n.gold, 0) / alive.length).toFixed(0)} / ${(
  alive.reduce((s, n) => s + (n.debt ?? 0), 0) / alive.length).toFixed(0)}`);

const pass = identityBad === 0
  && stats.insolventWeeks / Math.max(1, stats.samples) < 0.2;
console.log(`\n${pass ? 'GECTI' : 'KALDI'}`);
process.exit(pass ? 0 : 1);
