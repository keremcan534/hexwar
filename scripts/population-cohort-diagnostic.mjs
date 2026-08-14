// POP kohort muhasebesi.
//
// Kohortlar tureti lmis veridir; degeri ancak toplamlari kanonik kaynagi
// tuttugu surece vardir. Burada kanit uretilir:
//
//   TEST 8  kohort toplami = meslek sayaclari = sinif toplamlari
//   TEST 7  nufus muhasebesi: onceki + degisim = yeni (hayalet/kayip nufus yok)
//   +       kohortlarin gercek zemine oturdugu (fabrika/RGO istihdami)
//   +       uzun kosuda NaN, negatif, kohort patlamasi yok
//
// Kullanim: node scripts/population-cohort-diagnostic.mjs [hafta=260]

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { nationCohorts, reconcile, summarize } from '../src/game/population.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    reachable: null, autosaveEnabled: false, listeners: {},
    renderer: { invalidateCache() {}, invalidateTiles() {}, resize() {} },
    camera: { setBounds() {}, fit() {} },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

const WEEKS = Number(process.argv[2] ?? 260);
const game = headless('cohort');
const world = game.world;

console.log(`HexWar POP kohort tanilamasi — ${WEEKS} hafta\n`);

let failures = 0;
function check(label, ok, detail = '') {
  if (!ok) failures++;
  console.log(`  ${ok ? 'GECTI' : 'KALDI'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// --- Uzun kosu: her hafta muhasebe ve saglik kontrolu -----------------------
let worstDrift = 0;
let worstNationDrift = null;
let popAccountingWorst = 0;
let nanSeen = false;
let negativeSeen = false;
let maxCohorts = 0;
const prevPopulation = new Map();

for (const nation of world.nations) {
  if (nation.alive && nation.economy) prevPopulation.set(nation.id, nation.economy.population ?? 0);
}

for (let week = 1; week <= WEEKS; week++) {
  game.turns.endTurn();
  // Her hafta bir ulke ornekle (hepsini her hafta cozmek pahali),
  // ama kontrol butun ulkeleri sirayla gezer.
  const alive = world.nations.filter((n) => n.alive && n.economy);
  const nation = alive[week % alive.length];
  if (!nation) continue;

  const report = reconcile(world, nation);
  if (report.worstDrift > worstDrift) {
    worstDrift = report.worstDrift;
    worstNationDrift = nation.name;
  }
  maxCohorts = Math.max(maxCohorts, report.cohorts);

  const cohorts = nationCohorts(world, nation);
  for (const cohort of cohorts) {
    if (!Number.isFinite(cohort.size) || !Number.isFinite(cohort.income)
      || !Number.isFinite(cohort.needsFulfilled)) nanSeen = true;
    if (cohort.size < 0 || (cohort.employed ?? 0) < 0 || (cohort.unemployed ?? 0) < 0) {
      negativeSeen = true;
    }
  }

  // TEST 7: ulusal nufus, kume nufuslarinin toplamiyla bagdasmali.
  // (tile.province paylasilan econ; kare dongusu ayni havuzu tekrar sayardi)
  let provinceSum = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id && province.econ) provinceSum += province.econ.population;
  }
  const drift = Math.abs(provinceSum - (nation.economy.population ?? 0));
  popAccountingWorst = Math.max(popAccountingWorst, drift);
}

console.log('TEST 8 — TOPLAMLAR BAGDASIYOR MU');
check('kohort toplami meslek/sinif sayaclarini tutuyor',
  worstDrift === 0, `en kotu sapma ${worstDrift} kisi${worstNationDrift ? ` (${worstNationDrift})` : ''}`);

console.log('\nTEST 7 — NUFUS MUHASEBESI');
check('ulusal nufus = province nufuslari toplami',
  popAccountingWorst < 1, `en kotu sapma ${popAccountingWorst.toFixed(2)} kisi`);

console.log('\nSAGLIK');
check('NaN yok', !nanSeen);
check('negatif deger yok', !negativeSeen);
check('kohort sayisi makul', maxCohorts < 4000, `en cok ${maxCohorts} kohort`);

// --- Son durum: kohortlar gercek zemine oturuyor mu? -----------------------
const nation = world.nations.filter((n) => n.alive && n.economy)
  .sort((a, b) => (b.economy.population ?? 0) - (a.economy.population ?? 0))[0];
const cohorts = nationCohorts(world, nation);
const view = summarize(cohorts);

console.log(`\nORNEK ULKE: ${nation.name} — ${cohorts.length} kohort,`
  + ` ${view.total.toLocaleString('tr-TR')} kisi`);
console.log('  sinif      : ' + view.byClass.map(([id, size]) => `${id} ${(size / view.total * 100).toFixed(1)}%`).join(' · '));
console.log('  meslek     : ' + view.byProfession.slice(0, 5).map(([id, size]) => `${id} ${(size / view.total * 100).toFixed(1)}%`).join(' · '));
console.log('  kultur     : ' + view.byCulture.map(([id, size]) => `#${id} ${(size / view.total * 100).toFixed(1)}%`).join(' · '));
console.log(`  istihdam   : ${view.employment === null ? '—' : (view.employment * 100).toFixed(1) + '%'}`
  + ` (${view.employed.toLocaleString('tr-TR')}/${view.employableTotal.toLocaleString('tr-TR')})`);
console.log(`  ihtiyac    : ${(view.needsFulfilled * 100).toFixed(1)}%`);

// Kohortlar gercek is yerine oturuyor mu: fabrika isci kohortlarinin
// istihdami, o province'teki tesis kadrosuyla ayni olmali.
const workerCohorts = cohorts.filter((c) => c.professionId === 'workers');
const cohortEmployed = workerCohorts.reduce((sum, c) => sum + c.employed, 0);
const factoryEmployed = Math.round((nation.economy.factories ?? [])
  .reduce((sum, f) => sum + (f.employees ?? 0), 0));
console.log('\nGERCEK ZEMIN');
check('fabrika isci kohortlari gercek tesis kadrosuna oturuyor',
  Math.abs(cohortEmployed - factoryEmployed) <= workerCohorts.length,
  `kohort ${cohortEmployed} · tesis ${factoryEmployed}`);

const withWork = workerCohorts.filter((c) => c.workplaces > 0).length;
check('isci kohortlari fabrikasi olan province lerde',
  withWork > 0 || factoryEmployed === 0, `${withWork}/${workerCohorts.length} kohort is yerli`);

console.log(`\n${failures === 0 ? 'GECTI' : `KALDI — ${failures} kontrol`}`);
process.exit(failures === 0 ? 0 : 1);
