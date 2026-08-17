// HAFTALIK SIMULASYON PROFILI — faz ve alt faz siralamasi.
//
// Ayni tohum, ayni isitma, ayni olcum penceresi: optimizasyon oncesi/sonrasi
// karsilastirmasi icin tek gecerli yol. Tarayici penceresi sunum hizina bagli
// oldugu icin CPU siralamasi burada olculur.
//
//   node scripts/sim-profile.mjs [warmup=400] [window=30] [seed] [cols] [rows]
//
// Varsayilan dunya STANDART boyuttur (160x96): denetim tezgahinin 78x62'lik
// kucuk dunyasi haftalik maliyetin dortte birini gosteriyor ve sevkiyat
// halindeki oyunu temsil etmiyor.

import { headless, run } from './audit/harness.mjs';

const WARMUP = Number(process.argv[2] ?? 400);
const WINDOW = Number(process.argv[3] ?? 30);
const SEED = process.argv[4] ?? 'perf-walk';
const COLS = Number(process.argv[5] ?? 160);
const ROWS = Number(process.argv[6] ?? 96);

const game = headless(SEED, { cols: COLS, rows: ROWS });
run(game, WARMUP);

const world = game.world;
const units = world.units.length;
const factories = world.nations.reduce((s, n) => s + (n.economy?.factories?.length ?? 0), 0);

const phases = {};
const econ = {};
// Dilim dagilimi: kare pacing'ini bozan sey haftalik TOPLAM degil, tek bir
// `next()` cagrisinin suresidir. 5 ms'lik kare butcesi 30 ms'lik bolunemez
// bir adimi bolemez — donma tam olarak orada olur.
const steps = [];
const stepPhase = new Map();
const t0 = performance.now();
for (let i = 0; i < WINDOW; i++) {
  const job = game.turns.turnSteps();
  let done = false;
  while (!done) {
    const s0 = performance.now();
    done = job.next().done;
    const ms = performance.now() - s0;
    steps.push(ms);
    const phase = String(game.turns.phase ?? '?').replace(/:.*$/, ':*');
    const e = stepPhase.get(phase) ?? { n: 0, sum: 0, max: 0 };
    e.n++; e.sum += ms; if (ms > e.max) e.max = ms;
    stepPhase.set(phase, e);
  }
  const p = game.turns.lastProfile ?? {};
  for (const k in p) phases[k] = (phases[k] ?? 0) + p[k];
  const e = game.turns.lastEconomyProfile ?? {};
  for (const k in e) econ[k] = (econ[k] ?? 0) + e[k];
}
const perWeek = (performance.now() - t0) / WINDOW;
steps.sort((a, b) => a - b);
const q = (p) => +steps[Math.min(steps.length - 1, Math.floor(p * steps.length))].toFixed(2);
const sliceStats = {
  perWeek: +(steps.length / WINDOW).toFixed(1),
  p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +steps[steps.length - 1].toFixed(2),
  over5ms: steps.filter((s) => s > 5).length,
  over16ms: steps.filter((s) => s > 16).length,
  worstByPhase: [...stepPhase.entries()]
    .map(([k, v]) => [k, +v.max.toFixed(2), +(v.sum / v.n).toFixed(2), v.n])
    .sort((a, b) => b[1] - a[1]).slice(0, 8),
};

const rank = (obj) => Object.entries(obj)
  .map(([k, v]) => [k, +(v / WINDOW).toFixed(2)])
  .sort((a, b) => b[1] - a[1]);

const phaseRows = rank(phases);
const econRows = rank(econ);
const covered = phaseRows.reduce((s, [, v]) => s + v, 0);

console.log(JSON.stringify({
  seed: SEED,
  turn: game.turns.turn,
  warmup: WARMUP,
  window: WINDOW,
  units,
  factories,
  msPerWeek: +perWeek.toFixed(2),
  profiledMs: +covered.toFixed(2),
  coverage: `${Math.round((covered / perWeek) * 100)}%`,
  slices: sliceStats,
  phases: phaseRows,
  economy: econRows,
}, null, 1));
