// HALKLAR DENETİMİ — imparatorluklar kaç halk derin doğuyor, halklar kampanya
// boyunca hangi basamaktan hangisine geçiyor, kim hangi kanaldan ayrılıyor?
//
// redesign §5 (2026-10-15). Atılabilir sondalardan derlendi: u3-cultform-probe
// (dünya üretimi), u2-mov-campaign (kampanya yaşam döngüsü), u3-release-gates
// (bırakma kapıları). Sondaların ölçtüğü taban burada aynı tanımla basılır ki
// sonraki paketler aynı cetvelle kıyaslasın:
//   dünya  ENC kuzey 1.5-2.3 · bileşik 1.7-2.9 · kavşak 2.5-3.0 · yanlış ana halk 11-15
//   kampanya (YZ-yalnız, --player none) hak verme 38/38/40 (1900-09: 24/29/28),
//          ayaklanma 5/1/4 (hepsi 1904-11), LIBERATE 111/81/123 küme,
//          kabul dışı pay %36-39 → %3-4
//   kapılar  bırakılabilir çift 0/52 ve 0/54 (tur 1, STAT1/STAT2)
//
// Bu denetim bir ÖLÇÜ CETVELİDİR: eşiklerin çoğu paket kabulleridir (P2, P3,
// P4, P8) ve "hedefler" tablosunda ölçülen değerle yan yana basılır. Bulgu
// yalnız değişmez ihlalinde (güvenlik kilidi) ve boş koşuda (hiç olay yok)
// üretilir.
//
//   node scripts/audit/peoples-audit.mjs [--part worldgen|campaign|all]
//        [--seeds STAT1,STAT2,STAT3] [--player auto|none] [--weeks N] [--json dosya]
//
// --player auto: oyuncu ulusu gerçek oyundaki gibi seçilir, AUTO açık,
// edilgen (harness.passivePlayer; stats-dashboard ve u5 ile aynı kurulum).
// --player none: bütün uluslar YZ (u2 sondasının kurulumu).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  headless, passivePlayer, section, sub, table, n1, n2, pct, finding, reportFindings,
  runWorkers, requireEvents, mean, quantile,
} from './harness.mjs';
import * as culture from '../../src/game/culture.js';
import { CAMPAIGN_TURNS, calendarYear } from '../../src/game/calendar.js';
import { kinAbroadShare } from '../../src/game/politics.js';
import {
  PeoplesObserver, releasePairs, standingShares, isRebel, rowsOf,
} from './peoples-observer.mjs';
import { fingerprintHash } from './fingerprint.mjs';

const SELF = fileURLToPath(import.meta.url);
const pc = (v) => (Number.isFinite(v) ? pct(v) : '-');

async function optionalModule(relative) {
  try {
    return await import(relative);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes(relative.split('/').pop())) return null;
    throw error;
  }
}
const birth = await optionalModule('../../src/game/nationBirth.js');

const EMPIRES = ['kuzey-imparatorlugu', 'bilesik-monarsi', 'kavsak-imparatorlugu', 'dogu-devi'];
const SHORT = {
  'kuzey-imparatorlugu': 'kuzey', 'bilesik-monarsi': 'bilesik', 'kavsak-imparatorlugu': 'kavsak', 'dogu-devi': 'dogu-devi',
};

// ---------------------------------------------------------- DÜNYA ÜRETİMİ ---

/** hsl(...) dizgesinden kaba ayırt edilebilirlik (culture-audit ile aynı). */
function separation(a, b) {
  const parse = (color) => {
    const m = String(color).match(/hsl\((\d+(?:\.\d+)?) (\d+(?:\.\d+)?)% (\d+(?:\.\d+)?)%\)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return 99;
  let dh = Math.abs(x[0] - y[0]);
  if (dh > 180) dh = 360 - dh;
  return dh / 3 + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]);
}

/**
 * Çekirdeğin hex ağırlıklı en büyük halkı (redesign D3'ün ana halk kuralı:
 * world/nations.assignPrimaryCultures). Koloni oy vermez, ağırlık hex × pay.
 */
function largestCorePeople(world, nation) {
  const votes = new Map();
  for (const p of world.provinces) {
    if (p.owner !== nation.id || p.coreOf !== nation.id) continue;
    for (const r of rowsOf(p)) votes.set(r.id, (votes.get(r.id) ?? 0) + p.tileIdx.length * r.share);
  }
  let best = -1;
  let most = -1;
  for (const [id, w] of votes) {
    if (w > most || (w === most && id < best)) {
      most = w;
      best = id;
    }
  }
  return best;
}

/** Bir ulusun nüfus ağırlıklı halk payları (bütün sahip olunan kümeler; u3 tanımı). */
function nationMix(world, nation) {
  const mix = new Map();
  let pop = 0;
  for (const p of world.provinces) {
    if (p.owner !== nation.id) continue;
    const w = p.econ?.population ?? 0;
    pop += w;
    for (const r of rowsOf(p)) mix.set(r.id, (mix.get(r.id) ?? 0) + w * r.share);
  }
  const shares = [...mix.entries()].map(([id, v]) => ({ id, s: v / Math.max(1, pop) })).sort((a, b) => b.s - a.s || a.id - b.id);
  const simpson = shares.reduce((s, r) => s + r.s * r.s, 0);
  return { pop, shares, enc: simpson > 0 ? 1 / simpson : 0 };
}

function worldgenOf(seed) {
  const t0 = Date.now();
  const game = headless(seed, { cols: 160, rows: 96 });
  const world = game.world;
  const regular = world.nations.filter((n) => !isRebel(n) && world.provinces.some((p) => p.owner === n.id));
  const rows = regular.map((n) => {
    const mix = nationMix(world, n);
    return {
      id: n.id, name: n.name, archetype: n.archetype, pop: mix.pop, enc: mix.enc,
      largest: mix.shares[0]?.s ?? 0, largestId: mix.shares[0]?.id ?? -1,
      primary: mix.shares.find((r) => r.id === n.culture)?.s ?? 0,
      corePrimary: largestCorePeople(world, n),
      peoples2: mix.shares.filter((r) => r.s >= 0.02).length,
      peoples5: mix.shares.filter((r) => r.s >= 0.05).length,
    };
  });
  const empires = {};
  for (const arch of EMPIRES) {
    const r = rows.find((x) => x.archetype === arch);
    if (r) {
      const nation = world.nations[r.id];
      const made = (world.subjectPeoples ?? []).find((x) => x.nation === r.id);
      empires[SHORT[arch]] = {
        name: r.name, enc: r.enc, largest: r.largest, primary: r.primary, peoples2: r.peoples2, peoples5: r.peoples5, popM: r.pop / 1e6,
        homeRule: (nation.homeRule ?? []).map((c) => world.cultures[c]?.name ?? c),
        made: made ? made.peoples.filter((m) => !m.kept).length : 0,
        kept: made ? made.peoples.filter((m) => m.kept).length : 0,
      };
    }
  }
  // Çizgi okunabilirliği (culture-audit): karışık kümede çoğunluk ile ilk azınlığın renk ayrımı.
  let weakPairs = 0;
  for (const p of world.provinces) {
    const minority = p.cultures?.[1];
    if (!minority || minority.share < 0.15) continue;
    if (separation(world.cultures[p.culture]?.color, world.cultures[minority.id]?.color) < 14) weakPairs++;
  }
  // Soydaş terimi (politics.kinAbroadShare): savaş desteğinin barış tabanı (P5b'nin girdisi).
  const kinTerms = regular.map((n) => Math.min(0.2, kinAbroadShare(world, n) * 0.4));
  const western = rows.filter((r) => r.archetype === 'bati-devleti').map((r) => r.largest);
  // KİMLİK: düzenli ulusların adı, rengi ve kare sayısı. P2'nin alt halklar
  // geçişi ana akıştan çekmez; bu iz değişirse bölümleme kaymıştır.
  const identity = fingerprintHash(regular.map((n) => `${n.id}:${n.name}:${n.color}:${n.tiles}`).join('|'));
  const standing = standingShares(world);
  return {
    seed, ms: Date.now() - t0,
    cultures: world.cultures.length,
    families: new Set(world.cultures.map((c) => c.family)).size,
    nations: regular.length,
    slots: world.nations.filter(isRebel).length,
    nationsTotal: world.nations.length,
    provinces: world.provinces.length,
    // D3 tanımı (ana halk = çekirdeğin hex ağırlıklı en büyük halkı): P2 kabulü
    // bunu okur. Eski u3 tanımı (nüfus, kolonilerle) bilgi olarak kalır:
    // denizci imparatorluğun kolonisi ve hex/nüfus çoğunluğu ayrışan yarı
    // yarıya devletler onda kalır.
    wrongPrim: rows.filter((r) => r.corePrimary !== world.nations[r.id].culture).length,
    wrongPrimPop: rows.filter((r) => r.largestId !== world.nations[r.id].culture).length,
    newPeoples: (world.subjectPeoples ?? []).reduce((s, x) => s + x.peoples.filter((m) => !m.kept).length, 0),
    nationStates: rows.filter((r) => r.largest >= 0.85).length,
    westernMedian: quantile(western, 0.5),
    multiEthnic: rows.filter((r) => r.peoples5 >= 3 && r.enc >= 2).length,
    weakPairs,
    subject: standing.subject,
    nonPrimary: standing.nonPrimary,
    kinAtCap: kinTerms.filter((t) => t >= 0.2 - 1e-9).length,
    kinMean: mean(kinTerms),
    identity,
    empires,
    releaseGates: releasePairs(world, birth),
  };
}

// ---------------------------------------------------------- KAMPANYA ---

function campaignWorker(seed, playerMode, weeks) {
  const t0 = Date.now();
  const game = headless(seed, { cols: 160, rows: 96 });
  const world = game.world;
  const afterWeek = playerMode === 'auto' ? passivePlayer(game) : null;
  const observer = new PeoplesObserver(game, { player: afterWeek ? afterWeek.player.id : -1, birth, jumps: true });
  const gates = [{ week: 0, year: calendarYear(game.turns.turn), ...releasePairs(world, birth) }];
  const stability = {}; // 5 yıllık kova → barıştaki düzenli ulusların istikrarı
  for (let week = 1; week <= weeks; week++) {
    game.turns.endTurn();
    afterWeek?.();
    observer.step();
    const year = calendarYear(game.turns.turn);
    const key = Math.floor((year - 1900) / 5) * 5 + 1900;
    const bin = (stability[key] ??= { sum: 0, n: 0 });
    for (const nation of world.nations) {
      if (!nation.alive || isRebel(nation) || (nation.economy?.warFronts ?? 0) > 0) continue;
      bin.sum += nation.stability ?? 0;
      bin.n++;
    }
    if (week % 52 === 0) gates.push({ week, year, ...releasePairs(world, birth) });
    if (week % 260 === 0) process.stderr.write(`[peoples ${seed} ${playerMode}] hafta ${week}/${weeks} ${Math.round((Date.now() - t0) / 1000)} s\n`);
  }
  const summary = observer.finish();
  return {
    seed, playerMode, weeks, secs: Math.round((Date.now() - t0) / 1000),
    player: afterWeek ? { id: afterWeek.player.id, name: afterWeek.player.name, alive: afterWeek.player.alive } : null,
    worldEvents: Object.fromEntries(Object.entries(world.worldEvents ?? {}).map(([k, v]) => [k, { start: v.start, until: v.until, year: calendarYear(v.start) }])),
    peaceStability: Object.fromEntries(Object.entries(stability).map(([k, v]) => [k, v.n ? v.sum / v.n : null])),
    gates,
    ...summary,
    // Olay listesi kısaltılır: hak verme ve ayaklanma kalır (kazanç ölçüleriyle).
    events: summary.events.filter((e) => e.kind === 'grant' || e.kind === 'uprising' || e.kind === 'homeRule' || e.kind === 'crisis'),
  };
}

if (process.argv[2] === '--worker') {
  const [, seed, mode, weeks] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(campaignWorker(seed, mode, Number(weeks))));
  process.exit(0);
}

// --------------------------------------------------------------- ANA AKIŞ ---

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const PART = opt('--part', 'all');
const SEEDS = opt('--seeds', 'STAT1,STAT2,STAT3').split(',');
const WORLD_SEEDS = opt('--world-seeds', 'STAT1,STAT2,STAT3,BORDER1').split(',');
const PLAYER = opt('--player', 'auto');
const WEEKS = Number(opt('--weeks', CAMPAIGN_TURNS));
const JSON_OUT = opt('--json', null);
const report = { part: PART, seeds: SEEDS, player: PLAYER, weeks: WEEKS };

section(`HALKLAR DENETIMI — ${PART}${PART !== 'campaign' ? ` · dunya ${WORLD_SEEDS.join(',')}` : ''}`
  + `${PART !== 'worldgen' ? ` · kampanya ${SEEDS.join(',')} 160x96 · ${WEEKS} hafta · oyuncu ${PLAYER}` : ''}`
  + ` · D7 ${birth ? 'var' : 'yok'}`);

// Kampanya işçileri dünya bölümüyle aynı anda başlar (en uzun iş onlar).
const campaignJobs = PART === 'worldgen' ? null
  : runWorkers(SELF, SEEDS.map((seed) => ['--worker', seed, PLAYER, WEEKS]));

if (PART !== 'campaign') {
  sub('DUNYA URETIMI (tur 1, 160x96)');
  const worlds = WORLD_SEEDS.map(worldgenOf);
  report.worldgen = worlds;
  console.log(table(worlds, [
    { label: 'tohum', get: (w) => w.seed, right: false },
    { label: 'kultur', get: (w) => `${w.cultures} (${w.families} aile)` },
    { label: 'ulus+yuva', get: (w) => `${w.nations}+${w.slots}=${w.nationsTotal}` },
    { label: 'yanlis ana', get: (w) => `${w.wrongPrim} (nufus ${w.wrongPrimPop})` },
    { label: 'yeni halk', get: (w) => w.newPeoples },
    { label: 'ulus-devlet>=85%', get: (w) => w.nationStates },
    { label: 'bati medyan', get: (w) => pct(w.westernMedian) },
    { label: 'cok etnik', get: (w) => w.multiEthnic },
    { label: 'zayif cift', get: (w) => w.weakPairs },
    { label: 'tebaa payi', get: (w) => pct(w.subject) },
    { label: 'soydas tavanda', get: (w) => `${w.kinAtCap} (ort ${n2(w.kinMean)})` },
    { label: 'kimlik', get: (w) => w.identity, right: false },
  ]));
  sub('Arketip imparatorluklar: etkin halk sayisi (ENC), >=%2 halk, en buyuk halk');
  const empireRows = [];
  for (const w of worlds) {
    for (const [arch, e] of Object.entries(w.empires)) empireRows.push({ seed: w.seed, arch, ...e });
  }
  console.log(table(empireRows, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'arketip', get: (r) => r.arch, right: false },
    { label: 'ulus', get: (r) => r.name, right: false },
    { label: 'nufus M', get: (r) => n1(r.popM) },
    { label: 'ENC', get: (r) => n2(r.enc) },
    { label: '>=%2', get: (r) => r.peoples2 },
    { label: '>=%5', get: (r) => r.peoples5 },
    { label: 'en buyuk', get: (r) => pct(r.largest) },
    { label: 'ana halk', get: (r) => pct(r.primary) },
    { label: 'yeni+kalan', get: (r) => `${r.made}+${r.kept}` },
    { label: 'Home Rule', get: (r) => r.homeRule.join(',') || '-', right: false },
  ]));
  for (const arch of Object.values(SHORT)) {
    const list = empireRows.filter((r) => r.arch === arch).map((r) => r.enc);
    if (list.length) console.log(`  ENC ${arch.padEnd(10)} ${n2(Math.min(...list))}-${n2(Math.max(...list))} (ort ${n2(mean(list))})`);
  }
  console.log(`  yanlis ana halk ${worlds.map((w) => w.wrongPrim).join('/')} · kultur ${worlds.map((w) => w.cultures).join('/')}`
    + ` · ulus (yuva dahil) ${worlds.map((w) => w.nationsTotal).join('/')}`);
  console.log(`  birakilabilir cift (tur 1, ${worlds[0].releaseGates.api}): `
    + worlds.map((w) => `${w.seed} ${w.releaseGates.open}/${w.releaseGates.pairs} (tebaa ${w.releaseGates.subjectOpen}/${w.releaseGates.subjectPairs})`).join(' · '));

  // P2 KABULÜ (redesign §6 P2; hepsi TASARIM KARARI, tohum başına basılır).
  // Kimlik izi taban P0 snapshot'ından (redesign-baseline §3.4).
  sub('P2 kabul hedefleri (tasarim karari; tohum basina)');
  const IDENTITY = { STAT1: 'a014e387', STAT2: 'dcff3872', STAT3: '78890941', BORDER1: '44d755a5' };
  const emp = (w, a) => w.empires[a] ?? {};
  const between = (v, lo, hi) => Number.isFinite(v) && v >= lo && v <= hi;
  const TARGETS = [
    ['yanlis ana halk = 0 (D3 tanimi)', (w) => w.wrongPrim, (v) => v === 0],
    ['ENC kuzey >= 3.5', (w) => emp(w, 'kuzey').enc, (v) => v >= 3.5],
    ['ENC bilesik >= 5.0', (w) => emp(w, 'bilesik').enc, (v) => v >= 5.0],
    ['ENC kavsak >= 3.5', (w) => emp(w, 'kavsak').enc, (v) => v >= 3.5],
    ['ENC dogu-devi 1.6-2.8', (w) => emp(w, 'dogu-devi').enc, (v) => between(v, 1.6, 2.8)],
    ['bilesik en buyuk halk <= %35', (w) => emp(w, 'bilesik').largest, (v) => v <= 0.35],
    ['>=%2 halk bilesik >= 8', (w) => emp(w, 'bilesik').peoples2, (v) => v >= 8],
    ['>=%2 halk kuzey >= 7', (w) => emp(w, 'kuzey').peoples2, (v) => v >= 7],
    ['>=%2 halk kavsak >= 5', (w) => emp(w, 'kavsak').peoples2, (v) => v >= 5],
    ['ulus-devlet (>=%85) >= 24', (w) => w.nationStates, (v) => v >= 24],
    ['bati medyan en buyuk >= %75', (w) => w.westernMedian, (v) => v >= 0.75],
    ['tur 1 tebaa payi %30-42', (w) => w.subject, (v) => between(v, 0.30, 0.42)],
    ['kultur 54-62', (w) => w.cultures, (v) => between(v, 54, 62)],
    ['ulus (yuva dahil) <= 135', (w) => w.nationsTotal, (v) => v <= 135],
    ['zayif cift 0', (w) => w.weakPairs, (v) => v === 0],
    ['duzenli ulus kimligi ayni', (w) => w.identity, (v, w) => !IDENTITY[w.seed] || v === IDENTITY[w.seed]],
  ];
  const show = (v) => (typeof v === 'string' ? v : Number.isInteger(v) ? String(v) : (v < 1.5 && v >= 0 ? pct(v) : n2(v)));
  for (const [label, get, ok] of TARGETS) {
    const cells = worlds.map((w) => {
      const v = get(w);
      return `${show(v)} ${ok(v, w) ? 'ok' : 'KACTI'}`;
    });
    console.log(`  ${label.padEnd(34)} ${cells.join(' · ')}`);
  }
  report.p2 = Object.fromEntries(TARGETS.map(([label, get, ok]) => [label, worlds.map((w) => ({ seed: w.seed, value: get(w), ok: ok(get(w), w) }))]));
}

if (campaignJobs) {
  const runs = await campaignJobs;
  report.campaign = runs;
  sub(`KAMPANYA (${SEEDS.join(',')} 160x96, ${WEEKS} hafta, oyuncu ${PLAYER}) — 5 yillik kovalar, tohumlar toplami`);
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r.bins)))].sort();
  const sum = (key, get) => runs.reduce((s, r) => s + (r.bins[key] ? get(r.bins[key]) : 0), 0);
  const per = (key, get) => runs.map((r) => (r.bins[key] ? get(r.bins[key]) : 0)).join('/');
  const binRows = keys.map((key) => ({
    key,
    grants: per(key, (b) => b.grants),
    hr: `${per(key, (b) => b.crises.homeRule)} · ${per(key, (b) => b.homeRuleGrants)}`,
    indep: per(key, (b) => b.crises.independence),
    dominions: per(key, (b) => b.dominions),
    warUp: per(key, (b) => b.warUprisings),
    peaceSec: `${per(key, (b) => b.peacefulUprisings)}${runs.some((r) => r.bins[key]?.breakaways?.secession) ? ` +${per(key, (b) => b.breakaways?.secession ?? 0)}` : ''}`,
    liberate: `${sum(key, (b) => b.liberate.kin)}k/${sum(key, (b) => b.liberate.freeState)}ö`,
    freed: per(key, (b) => b.freedDominions),
    breakdowns: per(key, (b) => b.breakdowns),
    concessions: sum(key, (b) => b.concessions),
    martial: sum(key, (b) => b.martial),
    alive: runs.map((r) => {
      const point = r.alive.find((a) => a.year === Number(key) + 5) ?? r.alive.at(-1);
      return `${point.regular}+${point.freeStates}`;
    }).join(' '),
  }));
  console.log(table(binRows, [
    { label: 'kova', get: (r) => r.key, right: false },
    { label: 'hak', get: (r) => r.grants },
    { label: 'HR kriz·hak', get: (r) => r.hr },
    { label: 'bagimsizlik krizi', get: (r) => r.indep },
    { label: 'Dominion', get: (r) => r.dominions },
    { label: 'savasli ayaklanma', get: (r) => r.warUp },
    { label: 'barisci kopus', get: (r) => r.peaceSec },
    { label: 'LIBERATE kume', get: (r) => r.liberate },
    { label: 'serbest Dom.', get: (r) => r.freed },
    { label: 'cokus', get: (r) => r.breakdowns },
    { label: 'taviz', get: (r) => r.concessions },
    { label: 'sikiyonetim', get: (r) => r.martial },
    { label: 'ulus+Ozgur (kova sonu)', get: (r) => r.alive, right: false },
  ]));

  sub('Konum paylari (dunya nufusu; tohum basina)');
  const YEARS = [1900, 1905, 1910, 1914, 1920, 1925, 1930, 1935, 1939, 1945];
  const at = (r, year) => (year === 1945 ? r.standing.find((s) => s.end) : r.standing.find((s) => s.year === year && !s.end));
  console.log(table(YEARS.map((year) => ({ year, list: runs.map((r) => at(r, year)) })), [
    { label: 'yil', get: (r) => r.year },
    { label: 'tebaa', get: (r) => r.list.map((s) => pc(s?.subject)).join('/') },
    { label: 'vatandas', get: (r) => r.list.map((s) => pc(s?.citizen)).join('/') },
    { label: 'Home Rule', get: (r) => r.list.map((s) => pc(s?.homeRule)).join('/') },
    { label: 'birakilmis', get: (r) => r.list.map((s) => pc(s?.released)).join('/') },
    { label: 'ana halk disi', get: (r) => r.list.map((s) => pc(s?.nonPrimary)).join('/') },
  ]));

  sub('Ozet (taban karsilastirmasi)');
  const grants = runs.map((r) => r.events.filter((e) => e.kind === 'grant'));
  const uprisings = runs.map((r) => r.events.filter((e) => e.kind === 'uprising'));
  const liberate = runs.map((r) => Object.values(r.bins).reduce((s, b) => s + b.liberate.kin + b.liberate.freeState, 0));
  console.log(`  hak verme ${grants.map((g) => g.length).join('/')} (1900-09 ${grants.map((g) => g.filter((e) => e.year < 1910).length).join('/')};`
    + ` kendi cogunlugu ${grants.map((g) => g.filter((e) => e.ownMajority).length).join('/')};`
    + ` yol yillik/hareket ${grants.map((g) => `${g.filter((e) => e.via === 'yearly').length}/${g.filter((e) => e.via === 'movement').length}`).join(' ')})`);
  console.log(`  ayaklanma ${uprisings.map((u) => u.length).join('/')} (yillar ${uprisings.map((u) => [...new Set(u.map((e) => e.year))].join(',') || '-').join(' | ')};`
    + ` savasli ${uprisings.map((u) => u.filter((e) => e.war).length).join('/')})`);
  console.log(`  LIBERATE kume ${liberate.join('/')} · kabul disi pay 1900 → 1945 ${runs.map((r) => `${pc(at(r, 1900)?.notAccepted)}→${pc(at(r, 1945)?.notAccepted)}`).join(' · ')}`);
  console.log(`  dunya baris istikrari (barista duzenli uluslar, kampanya ortalamasi) ${runs.map((r) => n2(mean(Object.values(r.peaceStability)))).join('/')}`);
  console.log(`  bolumler (halk kanali + LIBERATE kume): kivilcimdan once ${runs.map((r) => r.periods?.beforeGreatWar ?? '-').join('/')}`
    + ` · buyuk savas +312 hf ${runs.map((r) => r.periods?.greatWarPlus312 ?? '-').join('/')}`
    + ` · 2. buyuk savas → son ${runs.map((r) => r.periods?.ww2ToEnd ?? '-').join('/')}`);
  const tg = runs.map((r) => r.gates[0]);
  console.log(`  birakilabilir cift tur 1 (${tg[0].api}) ${tg.map((g) => `${g.open}/${g.pairs} (tebaa ${g.subjectOpen}/${g.subjectPairs})`).join(' · ')}`
    + ` · 5. yil ${runs.map((r) => { const g = r.gates.find((x) => x.week === 260); return g ? `${g.open}/${g.pairs}` : '-'; }).join(' · ')}`);
  if (PLAYER === 'auto') {
    console.log(`  oyuncu (AUTO) ulusal soru SG: ${runs.map((r) => `${r.player?.name} ${n1(r.pp.spent)}/${n1(r.pp.income)} (${pct(r.pp.spent / Math.max(1e-9, r.pp.income))})`).join(' · ')}`);
  }

  sub('Arketip imparatorluklarin 1900 kumeleri: hangi kanaldan gitti?');
  const empireRows = runs.flatMap((r) => r.empires.map((e) => ({ seed: r.seed, ...e })));
  console.log(table(empireRows, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'arketip', get: (r) => SHORT[r.archetype] ?? r.archetype, right: false },
    { label: 'ulus', get: (r) => r.name, right: false },
    { label: '1900', get: (r) => r.start },
    { label: 'halk kanali', get: (r) => `${r.lostPeople} (${pct(r.lostPeople / Math.max(1, r.start))})` },
    { label: 'LIBERATE', get: (r) => r.lostLiberate },
    { label: 'savas/baris/birlesme', get: (r) => r.lostOther },
    { label: 'kanallar', get: (r) => Object.entries(r.by).map(([k, v]) => `${k}:${v}`).join(' '), right: false },
  ]));

  sub('Hak vermenin ANLIK kazanci (D8 basvurusu: ayni hafta, hak var/yok karsi olgusu)');
  const jumps = grants.flat().filter((e) => e.jump);
  const levyPct = jumps.map((e) => (e.jump.levyWith - e.jump.levyWithout) / Math.max(1e-9, e.jump.levyWithout));
  const rowPct = jumps.map((e) => (e.jump.levyRowWith - e.jump.levyRowWithout) / Math.max(1e-9, e.jump.levyRowWithout));
  const outPct = jumps.map((e) => (e.jump.outputWith - e.jump.outputWithout) / Math.max(1e-9, e.jump.outputWithout));
  console.log(`  ${jumps.length} hak verme · ulusal kura havuzu +${pct(quantile(levyPct, 0.5))} ortanca (p10 ${pct(quantile(levyPct, 0.1))}, p90 ${pct(quantile(levyPct, 0.9))})`
    + ` · halkin kendi havuzu +${pct(quantile(rowPct, 0.5))} ortanca`
    + ` · ulusal taban cikti +${pct(quantile(outPct, 0.5))} ortanca (p90 ${pct(quantile(outPct, 0.9))}, en cok ${pct(Math.max(0, ...outPct.filter(Number.isFinite)))})`);

  sub('Guvenlik kilidi (ana halkin kumesi halk kanalindan gitmez; redesign §2.0)');
  const violations = runs.reduce((s, r) => s + r.safety.violations, 0);
  console.log(`  dunyada halk kanali kume ${runs.map((r) => r.safety.peopleLossesWorld).join('/')} · ana halk cogunluklu olani ${runs.map((r) => r.safety.violations).join('/')}`);
  console.log(`  tek halkli (>= %95) ulus ${runs.map((r) => r.safety.monoNations).join('/')} · baslangic kumesinden giden ${runs.map((r) => r.safety.monoLosses).join('/')}`
    + ` (ana halk cogunluklu ${runs.map((r) => r.safety.monoPrimaryLosses).join('/')}; azinlik yurdu §2.0 geregi ayrilabilir)`);
  if (violations > 0) {
    finding('CRITICAL', 'guvenlik kilidi', 'ana halk cogunluklu kume halk kanalindan gitmez', `${violations} kume`,
      runs.flatMap((r) => r.safety.examples).slice(0, 3).map((l) => `${l.from}->${l.to} ${l.kind} halk ${l.culture}`).join('; '));
  }
  const events = runs.reduce((s, r) => s + r.events.length + Object.values(r.bins).reduce((t, b) => t + b.liberate.kin + b.liberate.freeState, 0), 0);
  requireEvents('kampanya', events, 'hak verme + ayaklanma + LIBERATE olayi');
}

if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(report));
process.exit(reportFindings() > 0 ? 1 : 0);
