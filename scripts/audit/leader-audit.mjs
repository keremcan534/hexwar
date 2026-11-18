// LİDER DENETİMİ — "bu kişilik özelliği bir YZ kararını gerçekten değiştiriyor mu?"
//
// Yöntem (gürültü testi, TASARIM §12b): her kol kendi sürecinde aynı dünyayı
// koşar. Taban kol `neutral` (liderler var, özellik yok). Her özellik kolunda o
// özellik BÜTÜN liderlere zorlanır: kaldıracın tam menzili. Kaos tabanı `placebo`
// aynı nötr dünyayı tur zarından fazladan çekilen sayıyla (HX_PLACEBO) koşar: kural
// aynıdır, fark yalnız zincirin kaosudur.
//
//   etki  = (özellik − nötr) tohum başına, kendi ölçütünde, ortalama
//   gürültü = (placebo − nötr) farklarının karekök-ortalama-karesi (tek tohum)
//   std.hata = gürültü / √tohum (ortalamanın gürültüsü)
//
// Hüküm: beklenen yönde, |etki| ≥ 2 × std.hata ve tohumların en az üçte ikisi aynı
// yönde → ÇALIŞIYOR; yoksa GÜRÜLTÜ ALTI (sil).
// Ölçütler oyun kodundan okunmaz, her hafta dünyanın durumundan sayılır: audit
// yan etki yapmaz, oyun zarı çekmez.
//
//   node scripts/audit/leader-audit.mjs [yıl=30] [tohumlar=LDR1..LDR12] [--size=78x62] [--jobs=6]

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const self = fileURLToPath(import.meta.url);
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const flag = (name, fallback) => flags.find((f) => f.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;

/** Özellik başına beklenen ölçüt ve yön: özelliğin vaadi tek sayıyla sınanır. */
const EXPECT = {
  warlike: { metric: 'offensives', dir: 1 },
  cautious: { metric: 'offensives', dir: -1 },
  opportunist: { metric: 'allianceLoss', dir: 1 },
  conciliator: { metric: 'alliances', dir: 1 },
  isolationist: { metric: 'alliances', dir: -1 },
  pragmatist: { metric: 'concessions', dir: 1 },
};

const METRIC_TEXT = {
  offensives: 'saldırı savaşı',
  allianceLoss: 'bozulan ittifak + reddedilen çağrı',
  concessions: 'talepte verme + geri adım',
  alliances: 'kurulan ittifak',
};

// ------------------------------------------------------------------ İŞÇİ ---

async function worker() {
  const { headless } = await import('./harness.mjs');
  const seed = process.env.LDR_SEED;
  const years = Number(process.env.LDR_YEARS);
  const [cols, rows] = process.env.LDR_SIZE.split('x').map(Number);
  const game = headless(seed, { cols, rows });
  const world = game.world;
  const open = new Map();
  const m = {
    offensives: 0, warsEnded: 0, warWeekSum: 0, leaders: 0, deaths: 0, elections: 0, coups: 0,
  };
  const count = world.nations.length;
  const seenLeader = new Map(world.nations.map((n) => [n.id, n.leader?.n ?? 0]));
  for (let week = 0; week < years * 52; week++) {
    game.turns.endTurn();
    for (let a = 0; a < count; a++) {
      for (let b = a + 1; b < count; b++) {
        const rec = world.relations[a]?.[b];
        const key = a * count + b;
        const hostile = rec?.state === 'war' || rec?.state === 'crisis';
        if (hostile && !open.has(key)) {
          open.set(key, world.turn);
          const aggressor = rec.aggressor;
          if ((rec.reason == null || rec.reason === 'demand') && aggressor != null) m.offensives++;
        } else if (!hostile && open.has(key)) {
          m.warWeekSum += world.turn - open.get(key);
          m.warsEnded++;
          open.delete(key);
        }
      }
    }
    for (const nation of world.nations) {
      const leader = nation.leader;
      if (!leader || seenLeader.get(nation.id) === leader.n) continue;
      seenLeader.set(nation.id, leader.n);
      m.leaders++;
      if (leader.via === 'death') m.deaths++;
      else if (leader.via === 'election' || leader.via === 'term') m.elections++;
      else if (leader.via === 'coup' || leader.via === 'revolution') m.coups++;
    }
  }
  const history = world.history ?? [];
  const titled = (re) => history.filter((h) => re.test(h.title ?? '')).length;
  const refused = world.nations.reduce((sum, n) => sum + (n.memory ?? []).filter((e) => e.kind === 'refused_call').length, 0);
  const alive = world.nations.filter((n) => n.alive).length;
  const out = {
    offensives: m.offensives,
    alliances: titled(/conclude an alliance/),
    allianceLoss: titled(/ends its alliance/) + refused,
    warWeeks: m.warsEnded ? m.warWeekSum / m.warsEnded : 0,
    yields: titled(/cedes .* without a war/),
    backDowns: titled(/backs down over/),
    concessions: titled(/cedes .* without a war/) + titled(/backs down over/),
    demands: titled(/ demands .* from /),
    alive,
    leaders: m.leaders, deaths: m.deaths, elections: m.elections, coups: m.coups,
  };
  process.stdout.write(`\n@@${JSON.stringify(out)}\n`);
}

if (process.env.LDR_WORKER) {
  await worker();
  process.exit(0);
}

// ---------------------------------------------------------------- KOŞUCU ---

const years = Number(args[0] ?? 30);
const seeds = (args[1] ?? Array.from({ length: 12 }, (_, i) => `LDR${i + 1}`).join(',')).split(',');
const size = flag('size', '78x62');
const jobs = Number(flag('jobs', 6));

const arms = [
  { id: 'neutral', env: { HX_LEADER_TRAIT: 'neutral' } },
  { id: 'placebo1', env: { HX_LEADER_TRAIT: 'neutral', HX_PLACEBO: '1' } },
  { id: 'placebo2', env: { HX_LEADER_TRAIT: 'neutral', HX_PLACEBO: '2' } },
  { id: 'mix', env: {} },
  ...Object.keys(EXPECT).map((id) => ({ id, env: { HX_LEADER_TRAIT: id } })),
];

function runArm(arm, seed) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env, ...arm.env, LDR_WORKER: '1', LDR_SEED: seed, LDR_YEARS: String(years), LDR_SIZE: size,
    };
    const child = spawn(process.execPath, [self], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.on('close', (code) => {
      const line = text.split('\n').find((l) => l.startsWith('@@'));
      if (code !== 0 || !line) reject(new Error(`${arm.id}/${seed} çıkış ${code}`));
      else resolve({ arm: arm.id, seed, ...JSON.parse(line.slice(2)) });
    });
  });
}

const queue = arms.flatMap((arm) => seeds.map((seed) => ({ arm, seed })));
const results = [];
let done = 0;
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
  while (queue.length) {
    const { arm, seed } = queue.shift();
    results.push(await runArm(arm, seed));
    done++;
    process.stderr.write(`\r${done}/${arms.length * seeds.length}`);
  }
}));
process.stderr.write('\n');

const at = (arm, seed) => results.find((r) => r.arm === arm && r.seed === seed);
const mean = (list) => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length);

/** Placebo farklarının karekök-ortalama-karesi: tek tohumda doğal oynama. */
function noiseOf(metric) {
  const deltas = seeds.flatMap((seed) => ['placebo1', 'placebo2'].map((p) => at(p, seed)[metric] - at('neutral', seed)[metric]));
  return Math.sqrt(mean(deltas.map((d) => d * d)));
}

const rows = [];
for (const [id, expect] of Object.entries(EXPECT)) {
  const deltas = seeds.map((seed) => at(id, seed)[expect.metric] - at('neutral', seed)[expect.metric]);
  const effect = mean(deltas);
  const noise = noiseOf(expect.metric);
  const agree = deltas.filter((d) => Math.sign(d) === expect.dir).length;
  // Etki bir ORTALAMADIR: kıyas ölçüsü ortalamanın standart hatasıdır (gürültü/√n),
  // eşik onun iki katı. Tohumların üçte ikisi de aynı yönde olmalı.
  const standardError = noise / Math.sqrt(seeds.length);
  const works = Math.sign(effect) === expect.dir && Math.abs(effect) >= 2 * standardError
    && agree >= (2 * seeds.length) / 3;
  rows.push({
    id, metric: expect.metric, base: mean(seeds.map((s) => at('neutral', s)[expect.metric])), effect, noise, standardError, agree, works,
  });
}

console.log(`\nLİDER KALDIRAÇLARI · ${size} · ${seeds.length} tohum × ${years} yıl`);
console.log('özellik       ölçüt                               taban    etki   gürültü  std.hata  tohum   hüküm');
for (const r of rows) {
  console.log([
    r.id.padEnd(13), METRIC_TEXT[r.metric].padEnd(35), r.base.toFixed(1).padStart(6),
    `${r.effect >= 0 ? '+' : ''}${r.effect.toFixed(1)}`.padStart(7), r.noise.toFixed(1).padStart(8),
    r.standardError.toFixed(1).padStart(9), `${r.agree}/${seeds.length}`.padStart(6), r.works ? '  ÇALIŞIYOR' : '  GÜRÜLTÜ ALTI',
  ].join(' '));
}

const summary = (arm) => {
  const keys = ['offensives', 'alliances', 'allianceLoss', 'demands', 'yields', 'backDowns', 'alive', 'leaders', 'deaths', 'elections', 'coups'];
  return Object.fromEntries(keys.map((k) => [k, Number(mean(seeds.map((s) => at(arm, s)[k])).toFixed(1))]));
};
console.log('\nDünya (tohum ortalaması):');
for (const arm of ['neutral', 'placebo1', 'placebo2', 'mix']) console.log(arm.padEnd(10), JSON.stringify(summary(arm)));

const out = join(dirname(self), '_tmp', 'leaders');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `leaders-${years}y-${seeds.length}s.json`), JSON.stringify({ years, seeds, size, rows, results }, null, 1));

const dead = rows.filter((r) => !r.works);
console.log(dead.length ? `\nBULGU: gürültü altında ${dead.length} özellik: ${dead.map((r) => r.id).join(', ')}` : '\nBütün özellikler tabanı geçti.');
process.exitCode = dead.length ? 1 : 0;
