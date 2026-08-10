// Fabrika kadro dolulugunun neden tavana takildigini olcer.
//
// Iki ayri sinir var ve hangisinin bagladigi disaridan gorunmuyor:
//   akis  = lower * MONTHLY_HIRE_RATE * schooling * willingness   (aylik ise alim)
//   stok  = min(professionCounts.workers, lower * MAX_WORKER_SHARE) - employed
// Ustune ayda yalnizca bir POPULATION_COHORT ciftci isciye donuyor. Fabrika
// kurulusu bu akistan hizliysa kadro hicbir zaman dolmaz.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { industrialJobs } from '../src/game/economy.js';

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

/** Bir ulkenin kadro tablosu. */
function snapshot(nation) {
  const economy = nation.economy ?? {};
  const factories = economy.factories ?? [];
  const jobs = industrialJobs(nation);
  const employees = factories.reduce((sum, f) => sum + (f.employees ?? 0), 0);
  const counts = economy.professionCounts ?? {};
  const lower = economy.classes?.lower?.population ?? 0;
  return {
    factories: factories.length,
    levels: factories.reduce((sum, f) => sum + (f.level ?? 0), 0),
    jobs,
    employees,
    fill: jobs > 0 ? employees / jobs : 1,
    workers: counts.workers ?? 0,
    farmers: counts.farmers ?? 0,
    lower,
    // Iki sinirin o anki degeri: hangisi kucukse o bagliyor.
    stockRoom: Math.min(counts.workers ?? 0, lower * 0.4) - employees,
    shareCap: lower * 0.4,
    satisfaction: economy.classes?.lower?.satisfaction ?? 0,
  };
}

const YEARS = Number(process.argv[2] ?? 25);
const WEEKS = YEARS * 52;
const game = headless('employment');
const world = game.world;

console.log(`HexWar kadro tanilamasi — ${YEARS} yil (${WEEKS} hafta), `
  + `${world.nations.length} ulke\n`);

const marks = new Set([0, 5, 10, 15, 20, 25, 40, 60, 80, 100].map((y) => y * 52));
let bindingFlow = 0;
let bindingStock = 0;
let samples = 0;

console.log('yil |  tesis  seviye |    kadro /   isci  dolu% |  workers  farmers'
  + ' | stok bosluk | tavan(%40)');
console.log('-'.repeat(100));

for (let week = 0; week <= WEEKS; week++) {
  if (marks.has(week)) {
    const alive = world.nations.filter((n) => n.alive && n.economy);
    const totals = alive.reduce((acc, n) => {
      const s = snapshot(n);
      acc.factories += s.factories; acc.levels += s.levels;
      acc.jobs += s.jobs; acc.employees += s.employees;
      acc.workers += s.workers; acc.farmers += s.farmers;
      acc.stockRoom += s.stockRoom; acc.shareCap += s.shareCap;
      return acc;
    }, {
      factories: 0, levels: 0, jobs: 0, employees: 0,
      workers: 0, farmers: 0, stockRoom: 0, shareCap: 0,
    });
    const fill = totals.jobs > 0 ? (totals.employees / totals.jobs) * 100 : 100;
    console.log(
      `${String(week / 52).padStart(3)} | ${String(totals.factories).padStart(6)}`
      + ` ${String(totals.levels).padStart(6)} | ${String(Math.round(totals.jobs)).padStart(8)}`
      + ` / ${String(Math.round(totals.employees)).padStart(7)}`
      + ` ${fill.toFixed(1).padStart(6)} | ${String(Math.round(totals.workers)).padStart(8)}`
      + ` ${String(Math.round(totals.farmers)).padStart(8)}`
      + ` | ${String(Math.round(totals.stockRoom)).padStart(11)}`
      + ` | ${String(Math.round(totals.shareCap)).padStart(10)}`,
    );
  }
  // Hangi sinir bagliyor: isci stogu mu, aylik akis mi?
  if (week > 52 && week % 13 === 0) {
    for (const nation of world.nations) {
      if (!nation.alive || !nation.economy) continue;
      const s = snapshot(nation);
      if (s.jobs <= 0 || s.fill >= 0.995) continue;
      samples++;
      const flowRoom = s.lower * 0.0008 * 1 * (0.65 + s.satisfaction * 0.5);
      if (s.stockRoom < flowRoom) bindingStock++;
      else bindingFlow++;
    }
  }
  if (week < WEEKS) game.turns.endTurn();
}

console.log(`\nBagliyan sinir (${samples} ornek, kadrosu dolmamis ulkeler):`);
console.log(`  isci stogu (workers / %40 tavani) : ${bindingStock}`
  + ` (%${samples ? Math.round((bindingStock / samples) * 100) : 0})`);
console.log(`  aylik ise alim akisi              : ${bindingFlow}`
  + ` (%${samples ? Math.round((bindingFlow / samples) * 100) : 0})`);

const alive = world.nations.filter((n) => n.alive && n.economy);
const worst = alive.map((n) => ({ name: n.name, ...snapshot(n) }))
  .filter((s) => s.jobs > 0)
  .sort((a, b) => a.fill - b.fill).slice(0, 5);
// Kadroyu kim buyutuyor: hangi tesis turu, kac seviye?
const byType = new Map();
for (const nation of alive) {
  for (const factory of nation.economy.factories ?? []) {
    const row = byType.get(factory.typeId) ?? { count: 0, levels: 0, jobs: 0, employees: 0 };
    row.count++;
    row.levels += factory.level ?? 0;
    row.jobs += factory.jobs ?? (factory.level ?? 0) * 2000;
    row.employees += factory.employees ?? 0;
    byType.set(factory.typeId, row);
  }
}
console.log('\nTesis turune gore:');
for (const [typeId, row] of [...byType].sort((a, b) => b[1].jobs - a[1].jobs)) {
  console.log(`  ${typeId.padEnd(18)} ${String(row.count).padStart(5)} tesis`
    + ` · ${String(row.levels).padStart(5)} seviye`
    + ` · kadro ${String(Math.round(row.jobs)).padStart(8)}`
    + ` · dolu %${((row.employees / Math.max(1, row.jobs)) * 100).toFixed(1)}`);
}

console.log('\nEn dusuk doluluk:');
for (const s of worst) {
  console.log(`  ${s.name.padEnd(16)} dolu %${(s.fill * 100).toFixed(1).padStart(5)}`
    + ` · kadro ${Math.round(s.jobs)} · isci ${Math.round(s.employees)}`
    + ` · workers ${Math.round(s.workers)} · %40 tavani ${Math.round(s.shareCap)}`);
}
