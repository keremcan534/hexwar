// POLİTİKA PAKETİ DENETİMİ — her kaldıraç gerçekten etki ediyor mu? (TASARIM §18)
//
// Yöntem audit:mechanics'in aynısıdır: aynı tohumda ayrı süreçlerde üç kol
// (düşük uç, yüksek uç, düşük uç + 1 IC dürtü). Etki tohum içi eşli bağıl
// farktır; eşik `max(2 × dürtü gürültüsü, %5)` ve her tohumda aynı yön.
//
// Kaldıraçlar kurulu duruma uygulanır: vassalı olmayan ulusa vassal, savaşı
// olmayan ulusa işgal kurulur. Ölçülen, mekaniğin kendisidir; YZ'nin onu ne
// sıklıkla seçtiği sınır ölçüsünün (audit:borders, POLICY_ARMS) işidir.
//
//   npm run audit:policies
//   LEVERS=camp-output,fusion npm run audit:policies

import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { fileURLToPath } from 'node:url';
import { section, sub, table, pct, finding, reportFindings, headless, runPeaceful, run, scanInvariants } from './harness.mjs';
import { settle } from '../../src/game/treasury.js';
import { policyOrder, setPolicyOrder } from '../../src/game/orders.js';
import { POLICY_ORDER, OCCUPATION_LAWS, vassalTreaty } from '../../src/game/policyDefs.js';
import { occupationLawOf, runOccupation, runPolicyAI } from '../../src/game/policies.js';
import { campBlockers, campsOf, inmatesOf, openCamp, setCampIntake, setCampRegime, startFusion } from '../../src/game/culturePolicy.js';
import { cultureMix, isAccepted } from '../../src/game/culture.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { regardOf } from '../../src/game/relations.js';

const SEEDS = ['POL1', 'POL2', 'POL3'];
const WARMUP = 26;

/** Efendi: en büyük ulus; vassal: temas hâlindeki, ondan küçük en kalabalık ulus. */
function pair(game, { small = false } = {}) {
  const world = game.world;
  const list = world.nations.filter((n) => n.alive && n.economy)
    .sort((a, b) => b.economy.population - a.economy.population || a.id - b.id);
  const overlord = list[0];
  const near = list.slice(1).filter((n) => world.contacts?.[overlord.id]?.[n.id] > 0);
  // Masadan çıkan tipik vassal küçüktür. Dünyanın ikinci büyük devleti kendi
  // başına haftada 250 IC yatırır: yardımı ölçüye girmez (ölçüldü, +%1).
  const vassal = (small ? near.at(-1) : near[0]) ?? list[1];
  return { overlord, vassal };
}

function bind(game, overlord, vassal, stance) {
  vassal.treaties = (vassal.treaties ?? []).filter((t) => t.type !== 'VASSALIZE');
  vassal.treaties.push({ type: 'VASSALIZE', partner: overlord.id, since: game.world.turn, autonomy: 30, stance });
}

/**
 * Ölçülen ulus oyuncudur ve AUTO'su kapalıdır: yoksa kendi YZ'si çeyrek sonunda
 * kolun duruşunu değiştirir ve iki uç aynı dünyaya döner (ilk koşuda oldu).
 */
function focus(game, nation) {
  game.turns.playerNation = nation.id;
  nation.delegation = null;
  return nation;
}

const sum = (world, nationId, read) => (world.provinces ?? [])
  .filter((p) => p.owner === nationId && p.econ).reduce((s, p) => s + read(p), 0);
const population = (world, id) => sum(world, id, (p) => p.econ.population ?? 0);
const development = (world, id) => sum(world, id, (p) => (p.econ.development ?? 1) * (p.econ.population ?? 0)) / Math.max(1, population(world, id));

/** Vassal duruşu kolu: haftalık barış, efendi ve vassalın ölçütleri. */
function stanceArm(metric, weeks = 156, options = {}) {
  return {
    setup(game, end) {
      const { overlord, vassal } = pair(game, options);
      focus(game, overlord);
      overlord.power = 400;
      bind(game, overlord, vassal, end);
      return { overlord, vassal };
    },
    weeks,
    peaceful: true,
    read(game, { overlord, vassal }) {
      const world = game.world;
      return {
        // Fonun kendisi kalkınma alımlarıyla dalgalanır: ölçülen haftalık haraç akışıdır.
        overlordFund: overlord.economy.ledger.treaty ?? 0,
        vassalIndustry: vassal.economy.ic.total,
        overlordFood: overlord.economy.resources.FOOD.produced,
        overlordIron: overlord.economy.resources.IRON.produced + overlord.economy.resources.COAL.produced,
        vassalPop: population(world, vassal.id),
        overlordPop: population(world, overlord.id),
        vassalDev: development(world, vassal.id),
        vassalFund: vassal.fund,
        autonomy: vassalTreaty(vassal, world.turn)?.autonomy ?? 0,
        regard: regardOf(world, vassal.id, overlord.id),
        infamy: overlord.infamy ?? 0,
        vassalStability: vassal.stability,
      }[metric];
    },
  };
}

/** Savaşta alay kaçırma: efendi savaşa sokulur, levy kolunda vassaldan alay gelir. */
function levyArm() {
  return {
    setup(game, end) {
      const world = game.world;
      const { overlord, vassal } = pair(game);
      focus(game, overlord);
      overlord.power = 400;
      bind(game, overlord, vassal, end);
      const foe = world.nations.find((n) => n.alive && n.id !== overlord.id && n.id !== vassal.id
        && world.contacts?.[overlord.id]?.[n.id] > 0);
      return { overlord, vassal, foe };
    },
    weeks: 52,
    peaceful: true,
    // Savaş hâli haftalık yazılır: cephe sayısı okunur, muharebe dünyayı oynatmaz.
    each(game, { overlord, foe }) {
      if (foe) game.world.relations[overlord.id][foe.id].state = 'war';
    },
    read(game, { overlord, vassal }) {
      return game.world.units.filter((u) => u.nationId === overlord.id
        && u.regiments?.some((r) => r.auxOf === vassal.id)).length + 1;
    },
  };
}

/** İşgal yasası: bir düşmanın üç state'i işgalde tutulur (barış içinde sayılmadan). */
function occupationArm(metric, weeks = 104) {
  return {
    setup(game, end) {
      const world = game.world;
      const { overlord, vassal: enemy } = pair(game);
      focus(game, overlord);
      overlord.policies = { occupation: end };
      const targets = world.provinces.filter((p) => p.owner === enemy.id && p.econ)
        .sort((a, b) => b.econ.population - a.econ.population || a.id - b.id).slice(0, 3);
      return { overlord, enemy, targets, take: 0 };
    },
    weeks,
    peaceful: true,
    // İşgal yasayı işletecek kadar sürer, sonra kontrol geri verilir: barış
    // imzası işgali sıfırlamasın, ordular kolun dünyasını ayırmasın.
    each(game, ctx) {
      const world = game.world;
      const tiles = ctx.targets.flatMap((p) => p.tileIdx.map((idx) => world.tiles[idx]));
      const saved = tiles.map((tile) => tile.controller);
      for (const tile of tiles) tile.controller = ctx.overlord.id;
      const before = ctx.overlord.fund;
      runOccupation(game);
      ctx.take += ctx.overlord.fund - before;
      tiles.forEach((tile, i) => { tile.controller = saved[i]; });
    },
    read(game, ctx) {
      const world = game.world;
      return {
        fund: ctx.take,
        resistance: ctx.targets.reduce((s, p) => s + (p.econ.resistance ?? 0), 0) / ctx.targets.length + 1,
        population: ctx.targets.reduce((s, p) => s + (p.econ.population ?? 0), 0),
        infamy: (ctx.overlord.infamy ?? 0) + 1,
        development: ctx.targets.reduce((s, p) => s + (p.econ.development ?? 1), 0),
        regard: regardOf(world, ctx.enemy.id, ctx.overlord.id),
      }[metric];
    },
  };
}

/** Ceza kampı kolları: yabancı çoğunluklu en kalabalık state kamptır. */
function campArm(metric, weeks = 156) {
  return {
    setup(game, end) {
      const world = game.world;
      const list = world.nations.filter((n) => n.alive && n.economy)
        .map((n) => ({ nation: n, row: cultureMix(world, n).filter((c) => !c.primary && !c.accepted)[0] }))
        .filter((r) => r.row).sort((a, b) => b.row.people - a.row.people || a.nation.id - b.nation.id);
      const { nation, row } = list[0];
      focus(game, nation);
      // Kapı Residency ister; kol Limited'de koşar: Residency'de huzursuzluk
      // ve hareket tavana dayanıp kampın bedelini görünmez kılıyordu.
      nation.politics.laws.citizenship = 0;
      nation.power = 400;
      // En sakin uygun state: kampın bindirdiği huzursuzluk tavana çarpmasın.
      const site = world.provinces.filter((p) => p.owner === nation.id && p.econ
        && !campBlockers(world, nation, p).length && p.cultures?.some((c) => c.id === row.id))
        .sort((a, b) => (a.econ.unrest ?? 0) - (b.econ.unrest ?? 0) || a.id - b.id)[0];
      if (end !== 'closed') {
        openCamp(game, nation, site.id);
        setCampRegime(nation, end);
        setCampIntake(world, nation, row.id, true);
      }
      nation.politics.laws.citizenship = 1;
      return { nation, cultureId: row.id, site };
    },
    weeks,
    peaceful: true,
    read(game, { nation, cultureId, site }) {
      const world = game.world;
      const people = cultureMix(world, nation).find((c) => c.id === cultureId)?.people ?? 0;
      return {
        output: (site.econ.campWorkers ?? 0) + 0.01,
        people,
        unrest: (site.econ.unrest ?? 0) + 1,
        infamy: (nation.infamy ?? 0) + 1,
        movement: (nation.movements?.[cultureId]?.progress ?? 0) + 1,
        manpower: nationManpower(world, nation.id),
        stability: nation.stability,
        inmates: campsOf(world, nation).reduce((s, c) => s + inmatesOf(c, nation), 0) + 1,
      }[metric];
    },
  };
}

/** Kaynaşma: hak sahibi en büyük halk ana halka karışır. */
function fusionArm(metric, weeks = 260) {
  return {
    setup(game, end) {
      const world = game.world;
      const list = world.nations.filter((n) => n.alive && n.economy)
        .map((n) => ({ nation: n, row: cultureMix(world, n).filter((c) => !c.primary)
          .sort((a, b) => b.share - a.share || a.id - b.id)[0] }))
        .filter((r) => r.row && r.row.share >= 0.05)
        .sort((a, b) => b.row.people - a.row.people || a.nation.id - b.nation.id);
      const { nation, row } = list[0];
      focus(game, nation);
      if (!isAccepted(nation, row.id)) nation.accepted = [...(nation.accepted?.length ? nation.accepted : [nation.culture]), row.id];
      nation.homeRule = (nation.homeRule ?? []).filter((id) => id !== row.id);
      if (nation.movements?.[row.id]) nation.movements[row.id].crisis = null;
      nation.power = 400;
      nation.stability = Math.max(nation.stability ?? 0, 0.7);
      nation.economy.literacy = Math.max(nation.economy.literacy ?? 0, 0.3);
      if (end === 'on' && !startFusion(game, nation, row.id)) throw new Error('kaynaşma başlamadı');
      return { nation, cultureId: row.id };
    },
    weeks,
    peaceful: true,
    read(game, { nation, cultureId }) {
      const world = game.world;
      return {
        share: (cultureMix(world, nation).find((c) => c.id === cultureId)?.share ?? 0) + 0.001,
        primary: cultureMix(world, nation).find((c) => c.id === nation.culture)?.share ?? 0,
      }[metric];
    },
  };
}

/** Kaldıraç: iki uç, beklenen yön ve ölçüt. */
const LEVERS = [
  { id: 'tribute-industry', lo: 'tribute', hi: 'industry', arm: () => stanceArm('overlordFund'), note: 'Standard Tribute vs Industrial Levy → weekly tribute received' },
  { id: 'extract-resources', lo: 'tribute', hi: 'extract', arm: () => stanceArm('overlordIron'), note: 'Standard Tribute vs Resource Extraction → overlord iron + coal' },
  { id: 'starve-food', lo: 'tribute', hi: 'starve', arm: () => stanceArm('overlordFood'), note: 'Standard Tribute vs Grain Requisition → overlord food' },
  { id: 'starve-pop', lo: 'tribute', hi: 'starve', arm: () => stanceArm('vassalPop'), note: 'Standard Tribute vs Grain Requisition → vassal population' },
  { id: 'abduct-pop', lo: 'tribute', hi: 'abduct', arm: () => stanceArm('vassalPop'), note: 'Standard Tribute vs Labour Deportation → vassal population' },
  { id: 'abduct-gain', lo: 'tribute', hi: 'abduct', arm: () => stanceArm('overlordPop'), note: 'Standard Tribute vs Labour Deportation → overlord population' },
  { id: 'strip-dev', lo: 'tribute', hi: 'strip', arm: () => stanceArm('vassalIndustry'), note: 'Standard Tribute vs Asset Stripping → vassal industry' },
  { id: 'levy-regiments', lo: 'tribute', hi: 'levy', arm: levyArm, note: 'Standard Tribute vs Forced Levy at war → regiments raised from the vassal' },
  { id: 'harsh-autonomy', lo: 'tribute', hi: 'starve', arm: () => stanceArm('autonomy'), note: 'Standard Tribute vs Grain Requisition → vassal autonomy (the price)' },
  { id: 'harsh-regard', lo: 'tribute', hi: 'abduct', arm: () => stanceArm('regard'), note: 'Standard Tribute vs Labour Deportation → their regard (the price)', absolute: true },
  { id: 'protect-stability', lo: 'tribute', hi: 'protect', arm: () => stanceArm('vassalStability'), note: 'Standard Tribute vs Protectorate → vassal stability' },
  // Kademe bedeli karesel büyür: küçük vassal yardımı beş yılda biriktirir, ancak
  // sonra harcar (POL2: 5. yılda fon 2.0K → 7.0K, kademe aynı). Ölçü on yıldır.
  { id: 'invest-fund', lo: 'tribute', hi: 'invest', arm: () => stanceArm('vassalDev', 520, { small: true }), note: 'Standard Tribute vs Development Partnership → development of a small vassal (10 years)' },
  { id: 'selfrule-autonomy', lo: 'tribute', hi: 'selfrule', arm: () => stanceArm('autonomy'), note: 'Standard Tribute vs Self-Government → vassal autonomy' },
  { id: 'occ-income', lo: 'civil', hi: 'plunder', arm: () => occupationArm('fund'), note: 'Civil Administration vs Total Plunder → occupier fund' },
  { id: 'occ-resistance', lo: 'civil', hi: 'plunder', arm: () => occupationArm('resistance'), note: 'Civil Administration vs Total Plunder → resistance' },
  { id: 'occ-requisition', lo: 'military', hi: 'requisition', arm: () => occupationArm('resistance'), note: 'Military Government vs Requisition → resistance' },
  { id: 'occ-pop', lo: 'military', hi: 'plunder', arm: () => occupationArm('population'), note: 'Military Government vs Total Plunder → occupied population' },
  { id: 'occ-infamy', lo: 'military', hi: 'plunder', arm: () => occupationArm('infamy'), note: 'Military Government vs Total Plunder → infamy (the price)' },
  { id: 'camp-output', lo: 'detention', hi: 'exhaustion', arm: () => campArm('output'), note: 'Detention vs Labour to Exhaustion → labour the penal state yields' },
  { id: 'camp-toll', lo: 'detention', hi: 'exhaustion', arm: () => campArm('people'), note: 'Detention vs Labour to Exhaustion → surviving people (the price)' },
  { id: 'camp-open-unrest', lo: 'closed', hi: 'labour', arm: () => campArm('unrest'), note: 'No penal state vs Forced Labour → unrest in the state (the price)' },
  { id: 'camp-open-infamy', lo: 'closed', hi: 'labour', arm: () => campArm('infamy'), note: 'No penal state vs Forced Labour → infamy (the price)' },
  { id: 'camp-open-movement', lo: 'closed', hi: 'labour', arm: () => campArm('movement'), note: 'No penal state vs Forced Labour → their movement (the price)' },
  { id: 'camp-penal', lo: 'labour', hi: 'penal', arm: () => campArm('manpower'), note: 'Forced Labour vs Penal Battalions → manpower' },
  { id: 'fusion', lo: 'off', hi: 'on', arm: () => fusionArm('share'), note: 'Fusion off vs on → share of the fusing people' },
];

// ------------------------------------------------------------- İŞÇİ SÜRECİ ---

if (process.argv[2] === '--job') {
  const { lever: leverId, end, seed, nudge } = JSON.parse(process.argv[3]);
  const lever = LEVERS.find((row) => row.id === leverId);
  const arm = lever.arm();
  const game = headless(seed);
  runPeaceful(game, WARMUP);
  const ctx = arm.setup(game, end);
  const payer = ctx.overlord ?? ctx.nation;
  if (nudge) settle(payer, 'grant', 1);
  const violations = [];
  for (let week = 0; week < arm.weeks; week++) {
    (arm.peaceful ? runPeaceful : run)(game, 1);
    arm.each?.(game, ctx);
    if (week % 13 === 0) violations.push(...scanInvariants(game.world));
  }
  process.stdout.write(JSON.stringify({ value: arm.read(game, ctx), violations: violations.slice(0, 5) }));
  process.exit(0);
}

// ------------------------------------------------------------------ ANA AKIŞ ---

function runJob(job) {
  return new Promise((resolveJob, rejectJob) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--job', JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('close', (code) => {
      try { resolveJob(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { rejectJob(new Error(`işçi çöktü (${JSON.stringify(job)}), çıkış ${code}`)); }
    });
  });
}

const ONLY = process.env.LEVERS ? new Set(process.env.LEVERS.split(',')) : null;
const levers = LEVERS.filter((row) => !ONLY || ONLY.has(row.id));
section(`POLİTİKA PAKETİ — ${levers.length} kaldıraç · ${SEEDS.length} tohum`);

const jobs = [];
for (const lever of levers) {
  for (const seed of SEEDS) {
    jobs.push({ lever: lever.id, end: lever.lo, seed, slot: 'lo' });
    jobs.push({ lever: lever.id, end: lever.hi, seed, slot: 'hi' });
    jobs.push({ lever: lever.id, end: lever.lo, seed, slot: 'nudged', nudge: true });
  }
}
const results = new Array(jobs.length);
let cursor = 0;
await Promise.all(Array.from({ length: Math.max(1, availableParallelism() - 2) }, async () => {
  while (cursor < jobs.length) {
    const index = cursor++;
    results[index] = await runJob(jobs[index]);
  }
}));

const rel = (a, b) => (b - a) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
const mean = (list) => list.reduce((s, v) => s + v, 0) / list.length;
const rows = levers.map((lever) => {
  const of = (slot) => SEEDS.map((seed) => results[jobs.findIndex((j) => j.lever === lever.id && j.seed === seed && j.slot === slot)].value);
  const lo = of('lo');
  const hi = of('hi');
  const nudged = of('nudged');
  const effects = SEEDS.map((_, i) => rel(lo[i], hi[i]));
  const noise = mean(SEEDS.map((_, i) => Math.abs(rel(lo[i], nudged[i]))));
  const effect = mean(effects);
  const floor = Math.max(noise * 2, 0.05);
  const same = effects.every((e) => e !== 0 && Math.sign(e) === Math.sign(effect));
  const dead = lo.every((v, i) => Math.abs(v - hi[i]) < 1e-9);
  const verdict = dead ? 'ÖLÜ' : Math.abs(effect) >= floor && same ? 'ÇALIŞIYOR' : 'GÜRÜLTÜ ALTI';
  return { lever, effect, effects, noise, floor, verdict };
});

sub('Sonuç');
console.log(table(rows, [
  { label: 'kaldıraç', get: (r) => r.lever.id, right: false },
  { label: 'eşli etki', get: (r) => pct(r.effect) },
  { label: 'tohum başına', get: (r) => r.effects.map((e) => pct(e)).join(' '), right: false },
  { label: 'dürtü gürültüsü', get: (r) => pct(r.noise) },
  { label: 'kat', get: (r) => (Math.abs(r.effect) / r.floor).toFixed(2) },
  { label: 'hüküm', get: (r) => r.verdict, right: false },
]));
for (const row of rows) {
  if (row.verdict === 'ÖLÜ') finding('HIGH', `${row.lever.id} ölü`, row.lever.note, 'iki uç birebir aynı');
  else if (row.verdict !== 'ÇALIŞIYOR') finding('MEDIUM', `${row.lever.id} hissedilmiyor`, row.lever.note, `eşli etki ${pct(row.effect)}, eşik ${pct(row.floor)}`);
}
const bad = results.flatMap((r) => r.violations ?? []);
if (bad.length) finding('HIGH', 'Değişmez ihlali', 'scanInvariants temiz', JSON.stringify(bad.slice(0, 4)));

// Devir: AUTO anahtarı oyuncu için YZ kapısını açar, sert uçları açmaz.
sub('Devir (orders.setPolicyOrder)');
{
  const game = headless('POL1');
  runPeaceful(game, WARMUP);
  const { overlord, vassal } = pair(game);
  overlord.aggression = 1.4;
  overlord.power = 400;
  bind(game, overlord, vassal, 'tribute');
  setPolicyOrder(overlord, 'vassals', POLICY_ORDER.AUTO);
  setPolicyOrder(overlord, 'occupation', POLICY_ORDER.AUTO);
  setPolicyOrder(overlord, 'camps', POLICY_ORDER.AUTO);
  for (let i = 0; i < 26; i++) {
    game.world.turn += 1;
    game.turns.turn = game.world.turn;
    runPolicyAI(game, overlord, { cabinet: true });
  }
  const stance = vassalTreaty(vassal, game.world.turn)?.stance;
  const harsh = ['strip', 'abduct', 'starve', 'levy', 'industry'].includes(stance);
  console.log(`  AUTO duruş: ${stance} · emir ${policyOrder(overlord, 'vassals')} · işgal yasası ${occupationLawOf(overlord)?.id} · kamp ${campsOf(game.world, overlord).length}`);
  if (harsh) finding('HIGH', 'AUTO sert duruş seçti', 'kabine sert uçlara gitmez', stance);
  if (occupationLawOf(overlord)?.id === OCCUPATION_LAWS.plunder.id) finding('HIGH', 'AUTO yağma seçti', 'kabine Total Plunder seçmez', 'plunder');
  if (campsOf(game.world, overlord).length) finding('HIGH', 'AUTO kamp açtı', 'kabine kamp açmaz', 'kamp');
}

const working = rows.filter((r) => r.verdict === 'ÇALIŞIYOR').length;
console.log(`\n  ${rows.length} kaldıraç · çalışıyor ${working} · gürültü altı ${rows.filter((r) => r.verdict === 'GÜRÜLTÜ ALTI').length} · ölü ${rows.filter((r) => r.verdict === 'ÖLÜ').length}`);
process.exitCode = reportFindings() ? 1 : 0;
