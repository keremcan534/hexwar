// İSTATİSTİK PANOSU — stats-dashboard.mjs JSON'larını tek bir HTML'e çizer.
//
// Tohumlar arası ortanca çizgi + en düşük/en yüksek bant. Mutlak değerler
// tohumdan tohuma (oyuncu ulusu farklı) değiştiği için grafiklerin çoğu
// ORANDIR: çıktıya oranla paylar, haftalık çıktıya oranla fon, alaya oranla
// depo, otomatik koşuya oranla varyant.
//
//   node scripts/audit/stats-dashboard-html.mjs [klasör] [çıktı.html] [önceki-klasör]
//
// Önceki klasör verilirse (ör. bir denge değişikliğinden önceki koşular) aynı
// metrikler onun için de hesaplanır ve pano iki durumu yan yana çizer. Önceki
// koşular eski şemada olabilir (Tek Çubuk'tan önceki altın/inşaat alanları):
// eksik alan hata değil, o seri boş kalır ve grafik yalnız "sonra"yı çizer.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UNIT_EQUIPMENT } from '../../src/game/econ/defs.js';
import { CAMPAIGN_TURNS, START_YEAR, END_YEAR, DAYS_PER_TURN } from '../../src/game/calendar.js';

const DIR = process.argv[2] ?? 'scripts/audit/_tmp/stats';
const OUT = process.argv[3] ?? 'scripts/audit/_tmp/stats/dashboard.html';
const BEFORE = process.argv[4] ?? null;
const KIT = UNIT_EQUIPMENT.INFANTRY.rifles;

let runs = [];
let byVariant = {};
let seeds = [];
function load(dir) {
  runs = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('dashboard'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
  byVariant = {};
  for (const r of runs) (byVariant[r.variant] ??= []).push(r);
  seeds = [...new Set(runs.map((r) => r.seed))].sort();
}

const med = (l) => { const s = l.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] + (s.length % 2 ? 0 : (s[s.length / 2] - s[(s.length - 1) >> 1]) / 2) : null; };
const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 1000) / 1000);
/** Eski şemada olmayan alan istisna atmasın: değer NaN olur, seri o noktayı atlar. */
const safe = (fn) => (...args) => {
  try {
    const v = fn(...args);
    return typeof v === 'number' ? v : NaN;
  } catch {
    return NaN;
  }
};

/** Bir varyantın metriği: her örnek için tohumlar arası [yıl, ortanca, min, max]. */
function series(variant, fn) {
  const list = byVariant[variant] ?? [];
  // Varyant yoksa boş seri (Math.min() = Infinity sonsuz döngüye girerdi).
  if (!list.length) return [];
  const get = safe(fn);
  const n = Math.min(...list.map((r) => r.samples.length));
  const out = [];
  for (let i = 0; i < n; i++) {
    const vals = list.map((r) => get(r.samples[i], r, i)).filter((v) => Number.isFinite(v));
    if (!vals.length) continue;
    out.push([list[0].samples[i].year, r2(med(vals)), r2(Math.min(...vals)), r2(Math.max(...vals))]);
  }
  return out;
}
/** Varyant / auto oranı, aynı tohumda. */
function ratio(variant, fn) {
  const base = Object.fromEntries((byVariant.auto ?? []).map((r) => [r.seed, r]));
  const list = (byVariant[variant] ?? []).filter((r) => base[r.seed]);
  if (!list.length) return [];
  const get = safe(fn);
  const n = Math.min(...list.map((r) => Math.min(r.samples.length, base[r.seed].samples.length)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const vals = list.map((r) => {
      const a = get(base[r.seed].samples[i]);
      const b = get(r.samples[i]);
      return a > 0 ? b / a : NaN;
    }).filter(Number.isFinite);
    if (vals.length) out.push([list[0].samples[i].year, r2(med(vals)), r2(Math.min(...vals)), r2(Math.max(...vals))]);
  }
  return out;
}
/** 13 haftalık (3 örnek) kayan ortalama: haftalık defter gürültülü. */
function smooth(s, k = 3) {
  return s.map((p, i) => {
    const w = s.slice(Math.max(0, i - k + 1), i + 1);
    const avg = (j) => w.reduce((t, q) => t + (q[j] ?? 0), 0) / w.length;
    return [p[0], r2(avg(1)), r2(avg(2)), r2(avg(3))];
  });
}
/** Oyuncu çıktısının payı (%), kova ortalaması. */
const share = (k) => (s) => 100 * s.P.shares[k];
/** Dünya çıktısının payı (%). */
const worldShare = (k) => (s) => (s.W.flows.output > 0 ? 100 * s.W.flows[k] / s.W.flows.output : NaN);

/** Yıllık toplam (iş yükü): örnekleri takvim yılına toplar, tohum ortancası. */
function yearly(variant, fn) {
  const list = byVariant[variant] ?? [];
  const get = safe(fn);
  const years = {};
  for (const r of list) {
    const per = {};
    for (const s of r.samples) {
      const v = get(s);
      if (!Number.isFinite(v)) continue;
      const y = Math.floor(s.year);
      per[y] = (per[y] ?? 0) + v;
    }
    for (const [y, v] of Object.entries(per)) (years[y] ??= []).push(v);
  }
  return Object.entries(years).filter(([, v]) => v.length === list.length).map(([y, v]) => [Number(y), r2(med(v)), r2(Math.min(...v)), r2(Math.max(...v))]);
}
const noteSum = (s) => Object.values(s.P.notes ?? {}).reduce((a, b) => a + b, 0);

// ------------------------------------------------------------ METRİKLER ---
const A = 'auto';
function compute() {
const data = {
  meta: {
    seeds, variants: Object.keys(byVariant), weeks: runs[0]?.weeks, startYear: START_YEAR, endYear: END_YEAR,
    players: (byVariant.auto ?? []).map((r) => `${r.seed}: ${r.player.name}`),
    campaignTurns: CAMPAIGN_TURNS, daysPerTurn: DAYS_PER_TURN,
  },
  // Çubuk: oyuncunun haftalık çıktısının payları (%).
  bar: {
    output: smooth(series(A, (s) => s.P.output), 6),
    bills: smooth(series(A, share('bills')), 6),
    army: smooth(series(A, share('army')), 6),
    people: smooth(series(A, share('people')), 6),
    invest: smooth(series(A, share('invest')), 6),
    // Ordu + donanmanın ödenen ikmal faturası (faturaların içinde).
    supply: smooth(series(A, share('supply')), 6),
  },
  worldBar: {
    bills: smooth(series(A, worldShare('bills')), 6),
    army: smooth(series(A, worldShare('army')), 6),
    people: smooth(series(A, worldShare('people')), 6),
    invest: smooth(series(A, worldShare('invest')), 6),
  },
  supply: {
    // s = faturaların ödenen payı (1 = kriz yok).
    player: smooth(series(A, (s) => s.P.s), 6),
    diplo: smooth(series('diplo', (s) => s.P.s), 6),
    worldCrisis: smooth(series(A, (s) => 100 * s.W.flows.crisis), 6),
  },
  fund: {
    // Fon, haftalık çıktının katı (taban −4).
    player: smooth(series(A, (s) => s.P.fund / Math.max(1, s.P.outputAvg))),
    worldMed: series(A, (s) => s.W.fundWeeks[1]),
    worldP90: series(A, (s) => s.W.fundWeeks[3]),
    worldPinned: series(A, (s) => 100 * s.W.pinnedShare),
  },
  development: {
    avg: series(A, (s) => s.P.development),
    p10: series(A, (s) => s.P.dev[0]),
    p50: series(A, (s) => s.P.dev[1]),
    p90: series(A, (s) => s.P.dev[2]),
    cap: series(A, (s) => s.P.devCap),
    world: series(A, (s) => s.W.dev[1]),
    noinvest: series('noinvest', (s) => s.P.development),
    levelsYear: yearly(A, (s) => s.P.levels),
  },
  industry: {
    output: series(A, (s) => s.P.output),
    ic: series(A, (s) => s.P.ic),
  },
  prices: {
    offFloor: series(A, (s) => 100 * s.W.offFloor),
  },
  army: {
    regiments: series(A, (s) => s.P.regiments),
    stockRegiments: series(A, (s) => s.P.stock.rifles / KIT),
    manpowerRegiments: series(A, (s) => s.P.manpowerRegiments),
    mobTarget: series(A, (s) => s.P.mobTarget),
  },
  stockVsManpower: series(A, (s) => (s.P.stock.rifles / KIT) / Math.max(0.5, s.P.manpowerRegiments)),
  draw: {
    // Sanayinin orduya giden payı (hatların çektiği).
    player: smooth(series(A, (s) => 100 * s.P.icUsed / Math.max(0.1, s.P.ic)), 6),
    diplo: smooth(series('diplo', (s) => 100 * s.P.icUsed / Math.max(0.1, s.P.ic)), 6),
    consumer: smooth(series(A, (s) => s.P.consumer), 6),
    consumerDiplo: smooth(series('diplo', (s) => s.P.consumer), 6),
    lawPartialYear: yearly(A, (s) => (s.P.law >= 1 ? 4 : 0)),
  },
  milIC: {
    total: series(A, (s) => s.P.icMil),
    used: series(A, (s) => s.P.icUsed),
    worldIdle: series(A, (s) => 100 * s.W.milIdle[1]),
    worldIdleP25: series(A, (s) => 100 * s.W.milIdle[0]),
  },
  rifles: {
    cap: smooth(series(A, (s) => s.P.rifleCapWk)),
    out: smooth(series(A, (s) => s.P.rifleOutWk)),
    used: smooth(series(A, (s) => s.P.rifleUsedWk), 6),
    weeksToMob: series(A, (s) => (s.P.mobTarget * KIT) / Math.max(0.1, s.P.rifleCapWk)),
  },
  // Kalkınmayan oyuncu ÷ AUTO oyuncu, aynı tohum.
  noinvest: {
    output: ratio('noinvest', (s) => s.P.output),
    ic: ratio('noinvest', (s) => s.P.ic),
    score: ratio('noinvest', (s) => s.P.score),
    population: ratio('noinvest', (s) => s.P.population),
    // Kalkınamayan oyuncunun halkı: payı halka döner (oran, düz değer).
    consumer: smooth(series('noinvest', (s) => s.P.consumer), 6),
  },
  war: {
    cover: series(A, (s) => (s.W.atWar ? 100 * s.W.warCover[1] : NaN)),
    idle: series(A, (s) => (s.W.atWar ? 100 * s.W.warIdle[1] : NaN)),
    short: series(A, (s) => (s.W.atWar ? 100 * s.W.warShort / s.W.atWar : NaN)),
  },
  diplo: {
    warYear: yearly('diplo', (s) => s.P.warWeeks),
    stockRegiments: series('diplo', (s) => s.P.stock.rifles / KIT),
    manpowerRegiments: series('diplo', (s) => s.P.manpowerRegiments),
    regiments: series('diplo', (s) => s.P.regiments),
    riflesUsedYear: yearly('diplo', (s) => s.P.rifleUsedWk * 4),
    riflesOutYear: yearly('diplo', (s) => s.P.rifleOutWk * 4),
    notes: yearly('diplo', noteSum),
  },
  load: {
    notes: yearly(A, noteSum),
    cards: yearly(A, (s) => s.P.cards),
    peace: yearly(A, (s) => s.P.peaceOffers),
    alertWeeks: yearly(A, (s) => s.P.alertWeeks),
    war: yearly(A, (s) => s.P.warWeeks),
    worldWar: series(A, (s) => 100 * s.W.atWarShare),
    alertKinds: (() => {
      const tot = {};
      for (const r of byVariant[A] ?? []) for (const s of r.samples) for (const [k, v] of Object.entries(s.P.alertKinds ?? {})) tot[k] = (tot[k] ?? 0) + v;
      const weeks = (byVariant[A] ?? []).reduce((a, r) => a + r.samples.length * r.bucket, 0) || 1;
      return Object.entries(tot).map(([k, v]) => [k, Math.round(1000 * v / weeks) / 10]).sort((a, b) => b[1] - a[1]);
    })(),
    kinds: (() => {
      const tot = {};
      for (const r of byVariant[A] ?? []) for (const s of r.samples) for (const [k, v] of Object.entries(s.P.notes ?? {})) tot[k] = (tot[k] ?? 0) + v;
      const n = (byVariant[A] ?? []).length || 1;
      return Object.entries(tot).map(([k, v]) => [k, Math.round(v / n)]).sort((a, b) => b[1] - a[1]);
    })(),
  },
};

// Özet sayılar (metin içinde kullanılır). Boş seri null verir: metin "–" basar.
const last = (s) => s.at(-1)?.[1];
const avgOf = (s, from = 0, to = 1e9) => {
  const v = s.filter((p) => p[0] >= from && p[0] < to).map((p) => p[1]).filter(Number.isFinite);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
data.summary = {
  outputEnd: last(data.bar.output),
  billsAvg: avgOf(data.bar.bills),
  armyAvg: avgOf(data.bar.army),
  supplyAvg: avgOf(data.bar.supply),
  peopleAvg: avgOf(data.bar.people),
  investAvg: avgOf(data.bar.invest),
  worldBillsAvg: avgOf(data.worldBar.bills),
  worldInvestAvg: avgOf(data.worldBar.invest),
  supplyPlayerMin: data.supply.player.length ? Math.min(...data.supply.player.map((p) => p[1])) : null,
  worldCrisisAvg: avgOf(data.supply.worldCrisis),
  worldCrisisLate: avgOf(data.supply.worldCrisis, 1935, 1946),
  fundEnd: last(data.fund.player),
  worldFundEnd: last(data.fund.worldMed),
  worldPinnedAvg: avgOf(data.fund.worldPinned),
  devEnd: last(data.development.avg),
  devNoinvestEnd: last(data.development.noinvest),
  devCapEnd: last(data.development.cap),
  offFloorAvg: avgOf(data.prices.offFloor),
  idleAvg: avgOf(data.milIC.worldIdle),
  stockVsManpowerMed: med(data.stockVsManpower.map((p) => p[1])),
  weeksToMob: med(data.rifles.weeksToMob.map((p) => p[1])),
  noinvestOutput: last(data.noinvest.output), noinvestIC: last(data.noinvest.ic),
  noinvestScore: last(data.noinvest.score), noinvestPop: last(data.noinvest.population),
  noinvestConsumer: last(data.noinvest.consumer),
  notesPerYear: med(data.load.notes.map((p) => p[1])),
  drawAvg: avgOf(data.draw.player),
  drawDiploAvg: avgOf(data.draw.diplo),
  consumerAvg: avgOf(data.draw.consumer),
  diploWarLate: data.diplo.warYear.filter((p) => p[0] >= 1925).reduce((a, p) => a + p[1], 0),
  diploWarEarly: data.diplo.warYear.filter((p) => p[0] < 1925).reduce((a, p) => a + p[1], 0),
  worldWarLate: avgOf(data.load.worldWar, 1930, 1946),
  regimentsEnd: last(data.army.regiments),
  manpowerAvg: avgOf(data.army.manpowerRegiments),
  stockAvg: avgOf(data.army.stockRegiments),
};
return data;
}

load(DIR);
const data = compute();
if (BEFORE) {
  load(BEFORE);
  data.before = compute();
  load(DIR);
}

writeFileSync(OUT.replace(/\.html$/, '.data.json'), JSON.stringify(data));
const template = readFileSync(new URL('./stats-dashboard.template.html', import.meta.url), 'utf8');
const render = readFileSync(new URL('./stats-dashboard.render.js', import.meta.url), 'utf8');
writeFileSync(OUT, template.replace('__DATA__', () => JSON.stringify(data)).replace('__RENDER__', () => render));
console.log(JSON.stringify(data.summary, null, 1));
console.log('kinds', data.load.kinds);
console.log('alerts', data.load.alertKinds);
console.log('→', OUT);
