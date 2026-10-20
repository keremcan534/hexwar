// ANA YURT DENETİMİ — halklar yurdunda kalıyor mu, her çıkış kapısı çalışıyor mu?
//
// 2026-10-15 yeniden yazımı (redesign §5). Eski sürümün üç testi BOŞ GEÇİYORDU:
// kırık küme (brokenSince) src'de hiç null-dışı yazılmıyor, cultureRevolts ve
// suppressedRevolts hiç sayılmıyordu — TEST 1/3/4 hiçbir şey ölçmeden "DOĞRU"
// basıyordu. TEST 2 ise adının ("dünya homojenleşmiyor mu") ölçmediği bir şeyi
// ölçüyordu: 1 − kabul payı. Bir halkı KABUL ETMEK onu "erimiş" sayıyordu;
// ölçüldü (HL1-3, 50 yıl): yurt payı %80.3 → %85.0 YÜKSELİRKEN metrik
// %47 → %5 düştü, düşüşün %78-81'i kabuldü (U1 raporu, Shapley + olay defteri).
//
// Ufuk artık kampanyadır (CAMPAIGN_TURNS = 1945 sonu; eski 50×52 hafta
// kampanyanın 4 yıl ötesine taşıyordu). Tohumlar HL1-6 78×62 artı HL1 160×96.
// Her tohum KENDİ sürecinde koşar (units.js nextId; bkz. harness.runScenario).
// culture.js ad alanı olarak içe alınır: silinen bir dışa aktarım denetimi
// çökertemez (2026-10-12'de expelCulture'ın kalkması onu iki gün çökertti ve
// run-all onu "0 bulgu" diye temiz gösterdi).
//
// TESTLER (eşik türü başlıkta: TASARIM KARARI ya da TABAN ± GÜRÜLTÜ)
//   T1  güvenlik kilidi        en büyük halkı ≥ %95 olan ulus halk kanalından
//                              başlangıç kümesi kaybetmez (tasarım kararı: 0)
//   T2a yurt kilidi            yurt kümelerinde yurt halkının nüfus ağırlıklı
//                              payı sonda ≥ başta − 1 puan; odak + zorla
//                              asimilasyonun yurttan aldığı ≤ %5 (taban: %1.7-2.7)
//   T2b çeşitlilik             dünya ters-Simpson kültür sayısı ≥ 0.5× (FAIL),
//                              ≥ 0.8× (WARN) başlangıç (taban: ×0.89-1.02)
//   T2c fren tutuşu (WARN)     konum payları 1900/1910/1914/1920/1939/1945;
//                              tasarım kapısı: tebaa 1914 ≥ %20, 1945 ≥ %8,
//                              1900-09 hak verme ≤ 6 (tohum başına)
//   T3  bırakma hep mümkün     0 kapalı (sahip × çoğunluk halk) çifti, 1. tur
//                              ve 5 yıl boyunca yıllık (D7 yoksa SKIP)
//   T4  Özgür Devlet uyanışı   3 yuva uyanır (biri iki kez) → kaydet → yükle →
//                              8 hafta: özdeş; ikinci hayat istikrar 0.6, 0
//                              süreli değiştirici (D7 yoksa SKIP)
//   T5  savaş toprak üretir    eski TEST 5 olduğu gibi
//   T6  her çıkış bir kez      hak, Home Rule (zorla kriz), Dominion, akrabaya
//                              bırakma, Özgür Devlet, sürgün (Agitation'daki
//                              tebaa) — mekanik yoksa SKIP
//
//   node scripts/audit/homeland-audit.mjs [hafta] [HL1,HL2,...] [--big TOHUM|--no-big]

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  headless, run, section, sub, table, n1, n2, pct, finding, reportFindings, runWorkers,
  skip, requireEvents, mean,
} from './harness.mjs';
import * as culture from '../../src/game/culture.js';
import * as movements from '../../src/game/movements.js';
import * as culturePolicy from '../../src/game/culturePolicy.js';
import { CAMPAIGN_TURNS } from '../../src/game/calendar.js';
import { capitalProvinceOf } from '../../src/game/peace.js';
import { serialize, deserialize } from '../../src/game/save.js';
import { PeoplesObserver, releasePairs, rowsOf, isRebel } from './peoples-observer.mjs';
import { worldFingerprint, extendedFingerprint } from './fingerprint.mjs';

const SELF = fileURLToPath(import.meta.url);
const pc = (v) => (Number.isFinite(v) ? pct(v) : '-');
const TMP = join(dirname(SELF), '_tmp');

/** Henüz yazılmamış modül (ör. D7 nationBirth.js) SKIP'tir; bozuk modül ise çöker. */
async function optionalModule(relative) {
  try {
    return await import(relative);
  } catch (error) {
    if (error?.code === 'ERR_MODULE_NOT_FOUND' && String(error.message).includes(relative.split('/').pop())) return null;
    throw error;
  }
}
const birth = await optionalModule('../../src/game/nationBirth.js');
const HAS_D7 = typeof birth?.releasePeople === 'function' && typeof birth?.releasePeopleBlockers === 'function';
const HAS_D1 = typeof movements.answerCrisis === 'function' && typeof culture.isHomeRule === 'function';

const valid = (world, owner) => owner >= 0 && world.nations[owner]?.alive;

/** Dünya nüfusunun kültür dağılımının ters Simpson indeksi (etkin kültür sayısı). */
function diversity(world) {
  const by = new Map();
  let pop = 0;
  for (const p of world.provinces) {
    if (!p.econ) continue;
    const w = Math.max(0, p.econ.population ?? 0);
    pop += w;
    for (const r of rowsOf(p)) by.set(r.id, (by.get(r.id) ?? 0) + w * r.share);
  }
  let sumSq = 0;
  for (const v of by.values()) sumSq += (v / pop) ** 2;
  return sumSq > 0 ? 1 / sumSq : 0;
}

/**
 * Yurt izleyicisi (hl-threshold-probe ile aynı tanım): yurt kümelerinde yurt
 * halkının payı ve haftalık yurt kaybının kanalı — odak ('assimilate'),
 * zorla asimilasyon ya da öteki (göç, kura ölümü, katliam).
 */
function homelandTracker(world) {
  const capture = () => ({
    rows: world.provinces.map((p) => rowsOf(p).map((r) => ({ id: r.id, share: r.share }))),
    pop: world.provinces.map((p) => Math.max(0, p.econ?.population ?? 0)),
    focus: world.provinces.map((p) => p.econ?.focus ?? null),
  });
  let prev = capture();
  const loss = { focus: 0, forced: 0, other: 0 };
  const share = (rows, id) => rows.find((r) => r.id === id)?.share ?? 0;
  return {
    loss,
    keep() {
      let pop = 0;
      let keep = 0;
      for (const p of world.provinces) {
        if (!p.econ || p.homeland < 0 || !valid(world, p.owner)) continue;
        const w = Math.max(0, p.econ.population ?? 0);
        pop += w;
        keep += w * share(rowsOf(p), p.homeland);
      }
      return { keep: pop > 0 ? keep / pop : 0, people: keep };
    },
    step() {
      for (let i = 0; i < world.provinces.length; i++) {
        const p = world.provinces[i];
        if (!p.econ || p.homeland < 0 || !valid(world, p.owner)) continue;
        const s0 = share(prev.rows[i], p.homeland);
        const s1 = share(rowsOf(p), p.homeland);
        if (s1 >= s0 - 1e-12) continue;
        const lost = (s0 - s1) * prev.pop[i];
        const nation = world.nations[p.owner];
        if (p.econ.focus === 'assimilate' || prev.focus[i] === 'assimilate') loss.focus += lost;
        else if (nation.forcedAssimilation?.includes(p.homeland)) loss.forced += lost;
        else loss.other += lost;
      }
      prev = capture();
    },
  };
}

// ------------------------------------------------------------- İŞÇİLER ---

function campaignWorker(seed, cols, rows, weeks) {
  const t0 = Date.now();
  const game = headless(seed, cols ? { cols, rows } : {});
  const world = game.world;
  const observer = new PeoplesObserver(game, { player: -1, birth, jumps: false });
  const gates = [{ week: 0, ...releasePairs(world, birth) }];
  const tracker = homelandTracker(world);
  const start = { ...tracker.keep(), D: diversity(world) };
  for (let week = 1; week <= weeks; week++) {
    game.turns.endTurn();
    observer.step();
    tracker.step();
    if (week % 52 === 0 && week <= 260) gates.push({ week, ...releasePairs(world, birth) });
    if (week % 520 === 0) process.stderr.write(`[homeland ${seed} ${cols}x${rows}] hafta ${week}/${weeks} ${Math.round((Date.now() - t0) / 1000)} s\n`);
  }
  const summary = observer.finish();
  const breakawayProvinces = world.breakaways && typeof world.breakaways === 'object'
    ? Object.values(world.breakaways).reduce((s, v) => s + (Number(v) || 0), 0) : 0;
  let assimilated = 0;
  for (const p of world.provinces) assimilated += p.econ?.assimilated ?? 0;
  const transfers = {};
  for (const bin of Object.values(summary.bins)) {
    for (const [k, v] of Object.entries(bin.transfer)) transfers[k] = (transfers[k] ?? 0) + v;
  }
  return {
    seed, cols, rows, weeks, secs: Math.round((Date.now() - t0) / 1000),
    start, end: { ...tracker.keep(), D: diversity(world) },
    hlLoss: tracker.loss,
    gates,
    standing: summary.standing,
    grants: summary.events.filter((e) => e.kind === 'grant').map((e) => ({ year: e.year, ownMajority: e.ownMajority })),
    safety: summary.safety,
    provinces: summary.provinces,
    changed: summary.changed,
    transfers,
    seceded: (world.uprisingProvinces ?? 0) + (world.vassalProvinces ?? 0) + breakawayProvinces,
    uprisings: world.uprisings ?? 0,
    vassals: world.vassalReleases ?? 0,
    releases: world.cultureReleases ?? 0,
    expulsions: world.cultureExpulsions ?? 0,
    crackdowns: world.crackdowns ?? 0,
    nationsBefore: summary.alive[0]?.regular ?? null,
    alive: summary.alive.at(-1),
    assimilated,
  };
}

/** Bizim topraklarımızda çoğunluk olan, ana halkımız olmayan halklar (başkent hariç). */
function majorityPeoples(world, nation) {
  const capital = capitalProvinceOf(world, nation.id);
  const out = new Set();
  for (const p of world.provinces) {
    if (p.owner !== nation.id || !p.econ || p === capital) continue;
    if (p.culture >= 0 && p.culture !== nation.culture) out.add(p.culture);
  }
  return [...out].sort((a, b) => a - b);
}

const heirOf = (world, value) => (typeof value === 'number' ? world.nations[value] : value) ?? null;
const nameOfCulture = (world, id) => world.cultures?.[id]?.name ?? `#${id}`;

/**
 * T6: her çıkış bir kez. 26 haftalık adımlarla en çok 30 yıl; her adımda
 * henüz çalışmamış çıkışlar denenir. Ölçülen şey "kapı açıkken eylem gerçekten
 * oluyor mu"dur, bedelin karşılanabilirliği değil: SG eksikse doldurulur.
 */
function exitsWorker(seed) {
  const game = headless(seed);
  const world = game.world;
  const done = new Map();
  const legacy = {};
  const EXITS = ['grant', 'homeRule', 'dominion', 'kin', 'freeState', 'deport'];
  if (!HAS_D1) done.set('homeRule', { status: 'skip', detail: 'movements.answerCrisis / culture.isHomeRule yok (D1, P4)' });
  if (!HAS_D7) {
    for (const k of ['dominion', 'kin', 'freeState']) done.set(k, { status: 'skip', detail: 'nationBirth.releasePeople yok (D7, P3)' });
  }
  const regular = () => world.nations.filter((n) => n.alive && !isRebel(n));

  const tryGrant = () => {
    for (const nation of regular()) {
      for (const row of culture.cultureMix(world, nation)) {
        if (row.primary || row.accepted || row.share < culture.CULTURE.ACCEPT_MIN_SHARE) continue;
        nation.power = Math.max(nation.power ?? 0, 400);
        if (culture.acceptBlockers(world, nation, row.id).length) continue;
        const ok = culture.acceptCulture(game, nation, row.id) && culture.isAccepted(nation, row.id);
        return done.set('grant', { status: ok ? 'ok' : 'failed', detail: `${nation.name} ← ${row.name} (%${(row.share * 100).toFixed(0)})` });
      }
    }
    return null;
  };
  const tryDeport = () => {
    for (const nation of regular()) {
      for (const [key, record] of Object.entries(nation.movements ?? {})) {
        const id = Number(key);
        if ((record.progress ?? 0) < 25 || culture.isAccepted(nation, id)) continue;
        if (culturePolicy.deportBlockers(world, nation, id).length) continue;
        const gone = culturePolicy.deport(game, nation, id);
        return done.set('deport', { status: gone > 0 ? 'ok' : 'failed', detail: `${nation.name} → ${nameOfCulture(world, id)} ${Math.round(gone).toLocaleString('en-US')} kişi (hareket %${(record.progress ?? 0).toFixed(0)})` });
      }
    }
    return null;
  };
  const tryLegacyVassal = () => {
    if (legacy.dominion) return;
    for (const nation of regular()) {
      for (const key of Object.keys(nation.movements ?? {})) {
        const id = Number(key);
        if (movements.vassalBlockers(world, nation, id).length) continue;
        const ok = movements.releaseAsVassal(game, nation, id);
        legacy.dominion = { status: ok ? 'ok' : 'failed', detail: `${nation.name} → ${nameOfCulture(world, id)} (movements.releaseAsVassal)` };
        return;
      }
    }
  };
  const tryRelease = (kind) => {
    for (const nation of regular()) {
      for (const id of majorityPeoples(world, nation)) {
        if (birth.releasePeopleBlockers(world, nation, id).length) continue;
        const heir = typeof birth.heirFor === 'function' ? heirOf(world, birth.heirFor(world, nation, id)) : null;
        if (kind === 'kin' && (!heir || isRebel(heir))) continue;
        if (kind === 'freeState' && (!heir || !isRebel(heir))) continue;
        const target = kind === 'dominion' ? null : heir;
        const ok = birth.releasePeople(game, nation, id, { dominion: kind === 'dominion' });
        const left = world.provinces.filter((p) => p.owner === nation.id && p.culture === id
          && p !== capitalProvinceOf(world, nation.id)).length;
        let pass = Boolean(ok) && left === 0;
        let detail = `${nation.name} → ${nameOfCulture(world, id)}${target ? ` (mirasçı ${target.name})` : ''}`;
        if (kind === 'dominion') {
          const slot = world.nations.find((n) => n.alive && isRebel(n)
            && (n.treaties ?? []).some((t) => t.type === 'VASSALIZE' && t.partner === nation.id) && (n.rebelCulture ?? n.culture) === id);
          pass = pass && Boolean(slot);
          detail += slot ? ` → ${slot.name} VASSALIZE` : ' → Dominion bağı yok';
        }
        return done.set(kind, { status: pass ? 'ok' : 'failed', detail: `${detail}; kalan küme ${left}` });
      }
    }
    return null;
  };
  const tryHomeRule = () => {
    for (const nation of regular()) {
      for (const id of majorityPeoples(world, nation)) {
        if (!culture.isAccepted(nation, id) || culture.isHomeRule(nation, id)) continue;
        // Pencere oyuncuya açılır (YZ hemen cevaplar): ulus geçici olarak oyuncu, AUTO kapalı.
        const savedPlayer = game.turns.playerNation;
        const savedDelegation = nation.delegation;
        game.turns.playerNation = nation.id;
        nation.delegation = null;
        const record = (nation.movements ??= {})[id] ??= { progress: 0 };
        record.progress = 100;
        game.turns.endTurn();
        const opened = nation.movements?.[id]?.crisis;
        let pass = false;
        if (opened) {
          movements.answerCrisis(game, nation, id, 'grant');
          pass = culture.isHomeRule(nation, id) && (nation.movements?.[id]?.progress ?? 0) === 0;
        }
        game.turns.playerNation = savedPlayer;
        nation.delegation = savedDelegation;
        return done.set('homeRule', {
          status: pass ? 'ok' : 'failed',
          detail: `${nation.name} ← ${nameOfCulture(world, id)}: kriz ${opened ? `açıldı (${opened.kind ?? '?'})` : 'AÇILMADI'}`,
        });
      }
    }
    return null;
  };

  for (let week = 0; week <= 30 * 52 && done.size < EXITS.length; week += 26) {
    if (week) run(game, 26);
    if (!done.has('grant')) tryGrant();
    if (!done.has('deport')) tryDeport();
    if (HAS_D7) {
      for (const kind of ['kin', 'freeState', 'dominion']) if (!done.has(kind)) tryRelease(kind);
    } else tryLegacyVassal();
    if (HAS_D1 && !done.has('homeRule')) tryHomeRule();
  }
  const items = EXITS.map((exit) => ({ exit, ...(done.get(exit) ?? { status: 'not-open', detail: '30 yılda açık aday çıkmadı' }) }));
  return { seed, items, legacy, turn: game.turns.turn };
}

/** T4: üç uyanış (biri iki kez), kayıt turu. Yalnız D7 varken çağrılır. */
function wakeWorker(seed) {
  const game = headless(seed);
  const world = game.world;
  run(game, 260);
  const picks = [];
  const used = new Set();
  for (const nation of world.nations.filter((n) => n.alive && !isRebel(n))) {
    for (const id of majorityPeoples(world, nation)) {
      if (birth.releasePeopleBlockers(world, nation, id).length) continue;
      const heir = typeof birth.heirFor === 'function' ? heirOf(world, birth.heirFor(world, nation, id)) : null;
      if (!heir || !isRebel(heir) || heir.alive || used.has(heir.id)) continue;
      used.add(heir.id);
      picks.push({ nation, id, slot: heir });
      if (picks.length >= 3) break;
    }
    if (picks.length >= 3) break;
  }
  if (picks.length < 3) return { seed, status: 'not-open', picks: picks.length };
  const woke = picks.map((p) => Boolean(birth.releasePeople(game, p.nation, p.id, {})) && p.slot.alive);
  // Bir yuvayı öldür: kümelerini eski sahibine geri ver, eleme bir haftada işler.
  const first = picks[0];
  for (const p of world.provinces) {
    if (p.owner === first.slot.id) game.turns.claimAtPeace(p.center, first.nation.id);
  }
  // Muhafız alayı da gider: ordusu olan topraksız devlet sürgünde yaşar
  // (turn.js eleme kuralı), yuva ölmeden ikinci hayat sınanamazdı.
  for (const unit of world.units.filter((u) => u.nationId === first.slot.id)) game.turns.killUnit(unit);
  run(game, 1);
  const died = !first.slot.alive;
  const again = Boolean(birth.releasePeople(game, first.nation, first.id, {})) && first.slot.alive;
  const second = {
    stability: first.slot.stability,
    timed: Array.isArray(first.slot.timed) ? first.slot.timed.length : Object.keys(first.slot.timed ?? {}).length,
  };
  mkdirSync(TMP, { recursive: true });
  const file = join(TMP, `homeland-wake-${seed}.json`);
  writeFileSync(file, JSON.stringify(serialize(game)));
  run(game, 8);
  const live = `${worldFingerprint(game)}\n${extendedFingerprint(game)}`;
  const loaded = JSON.parse(execFileSync(process.execPath, [SELF, '--worker', 'wake-load', seed, file],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
  return {
    seed, status: 'ran', woke, died, again, second,
    identical: live === loaded.fp,
    firstDiff: live === loaded.fp ? null : live.split('\n').find((line, i) => line !== loaded.fp.split('\n')[i])?.slice(0, 160),
  };
}

function wakeLoadWorker(seed, file) {
  const game = headless(seed);
  if (!deserialize(game, JSON.parse(readFileSync(file, 'utf8')))) return { fp: 'deserialize basarisiz' };
  run(game, 8);
  return { fp: `${worldFingerprint(game)}\n${extendedFingerprint(game)}` };
}

if (process.argv[2] === '--worker') {
  const [kind, seed, a, b, c] = process.argv.slice(3);
  let out;
  if (kind === 'campaign') out = campaignWorker(seed, Number(a), Number(b), Number(c));
  else if (kind === 'exits') out = exitsWorker(seed);
  else if (kind === 'wake') out = wakeWorker(seed);
  else if (kind === 'wake-load') out = wakeLoadWorker(seed, a);
  else throw new Error(`bilinmeyen isci: ${kind}`);
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

// --------------------------------------------------------------- ANA AKIŞ ---

const argv = process.argv.slice(2);
const flagAt = (name) => argv.indexOf(name);
const positional = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1] === '--big'));
const WEEKS = Number(positional[0] ?? CAMPAIGN_TURNS);
const SEEDS = (positional[1] ?? 'HL1,HL2,HL3,HL4,HL5,HL6').split(',');
const BIG = flagAt('--no-big') >= 0 ? null : (flagAt('--big') >= 0 ? argv[flagAt('--big') + 1] : 'HL1');

section(`ANA YURT DENETIMI — ${WEEKS} hafta (CAMPAIGN_TURNS ${CAMPAIGN_TURNS}) · ${SEEDS.join(',')} 78x62`
  + `${BIG ? ` + ${BIG} 160x96` : ''} · D7 ${HAS_D7 ? 'var' : 'yok'} · D1 ${HAS_D1 ? 'var' : 'yok'}`);

const jobs = SEEDS.map((seed) => ['--worker', 'campaign', seed, 78, 62, WEEKS]);
if (BIG) jobs.push(['--worker', 'campaign', BIG, 160, 96, WEEKS]);
jobs.push(['--worker', 'exits', SEEDS[0]]);
if (HAS_D7) jobs.push(['--worker', 'wake', SEEDS[0]]);
// Büyük harita en uzun iştir (~12 dk): önce başlasın ki duvar saati kısalsın.
const order = jobs.map((job, i) => i).sort((x, y) => (jobs[y][4] ?? 0) - (jobs[x][4] ?? 0));
const ordered = await runWorkers(SELF, order.map((i) => jobs[i]));
const results = new Array(jobs.length);
order.forEach((jobIndex, k) => { results[jobIndex] = ordered[k]; });
const runs = results.slice(0, SEEDS.length + (BIG ? 1 : 0));
const small = runs.slice(0, SEEDS.length);
const exits = results[SEEDS.length + (BIG ? 1 : 0)];
const wake = HAS_D7 ? results.at(-1) : null;
const label = (r) => `${r.seed}${r.cols === 160 ? ' 160x96' : ''}`;

sub('KOSU SONUCLARI');
console.log(table(runs, [
  { label: 'tohum', get: label, right: false },
  { label: 'kume', get: (r) => r.provinces },
  { label: 'el degisen', get: (r) => `${r.changed} (${pct(r.changed / r.provinces)})` },
  { label: 'baris', get: (r) => r.transfers.peace ?? 0 },
  { label: 'liberate', get: (r) => r.transfers.liberate ?? 0 },
  { label: 'birlesme', get: (r) => r.transfers.union ?? 0 },
  { label: 'halk kanali', get: (r) => r.transfers.people ?? 0 },
  { label: 'ayaklanma', get: (r) => `${r.uprisings}/${r.vassals}v` },
  { label: 'hak verme', get: (r) => r.grants.length },
  { label: 'ulke', get: (r) => `${r.nationsBefore}->${r.alive?.regular}+${r.alive?.freeStates}ö` },
  { label: 'sn', get: (r) => r.secs },
]));

// --- T1 ---
sub('T1 — guvenlik kilidi: ana halkin kumesi halk kanalindan gidiyor mu?');
{
  // Kilit (redesign §2.0): ana halkin izi yoktur; cogunlugu (province.culture)
  // sahibinin ana halki olan kume hareket, birakma ya da cokusle GIDEMEZ.
  // §5 T1'in kumesi (en buyuk halki >= %95 olan ulus) ayrica basilir: onlarin
  // AZINLIK cogunluklu kumesi §2.0 "kim ayrilabilir" geregi ayrilabilir — P0
  // tabaninda 7 kampanyada 1 kume, eski vasal birakmayla (bilgi, bulgu degil).
  // P0 tabaninda kilit 2 kez delindi (HL kampanyalari): hareket uyeligi
  // (culture.movementProvinces) kumenin COGUNLUGUNA degil TOPLAM kabul disi
  // paya (>= %50) bakiyor; ana halkin cogulluk yaptigi (ör. %40) karisik kume
  // en buyuk tebaa halkin hareketiyle gidebiliyor.
  const mono = runs.reduce((s, r) => s + r.safety.monoNations, 0);
  const lost = runs.reduce((s, r) => s + r.safety.violations, 0);
  const monoLost = runs.reduce((s, r) => s + r.safety.monoLosses, 0);
  const monoPrimary = runs.reduce((s, r) => s + r.safety.monoPrimaryLosses, 0);
  const events = runs.reduce((s, r) => s + r.safety.peopleLossesWorld, 0);
  console.log(`  dunyada halk kanalindan giden kume ${events} · ana halk cogunluklu olani ${lost}`);
  console.log(`  en buyuk halki >= %95 olan ulus ${mono} (tohum basina ${runs.map((r) => r.safety.monoNations).join('/')})`
    + ` · baslangic kumesinden giden ${monoLost} (ana halk cogunluklu ${monoPrimary}; azinlik yurdu ${monoLost - monoPrimary}`
    + `${monoLost ? `: ${runs.flatMap((r) => r.safety.monoExamples).slice(0, 3).map((l) => `kume ${l.pid} ${l.from}->${l.to} ${l.kind} halk ${l.culture}/ana ${l.fromPrimary}`).join('; ')}` : ''})`);
  if (requireEvents('T1', events, 'halk kanalindan el degistiren kume') && requireEvents('T1', mono, 'tek halkli ulus')) {
    if (lost > 0 || monoPrimary > 0) {
      const ex = runs.flatMap((r) => r.safety.examples).slice(0, 3)
        .map((l) => `kume ${l.pid} ${l.from}->${l.to} (${l.kind}, halk ${l.culture}, ana ${l.fromPrimary})`).join('; ');
      finding('CRITICAL', 'guvenlik kilidi',
        'ana halk cogunluklu kume halk kanalindan gitmez; tek halkli ulus kendi halkinin kumesini kaybetmez (tasarim karari)',
        `${lost} kume halk kanalindan gitti`,
        `${ex} — hareket uyeligi toplam kabul disi paya (>= %50) bakiyor, kume cogunluguna degil`);
    } else console.log('  -> Ana halkin topragi kultur mekanigiyle gitmiyor. DOGRU.');
  }
}

// --- T2a ---
sub('T2a — yurt kilidi: halk kendi yurdunda eriyor mu?');
{
  console.log(table(runs, [
    { label: 'tohum', get: label, right: false },
    { label: 'yurt payi bas', get: (r) => pct(r.start.keep) },
    { label: 'son', get: (r) => pct(r.end.keep) },
    { label: 'fark', get: (r) => `${((r.end.keep - r.start.keep) * 100).toFixed(1)} puan` },
    { label: 'odak kaybi', get: (r) => pct(r.hlLoss.focus / Math.max(1, r.start.people)) },
    { label: 'zorla', get: (r) => pct(r.hlLoss.forced / Math.max(1, r.start.people)) },
    { label: 'oteki', get: (r) => pct(r.hlLoss.other / Math.max(1, r.start.people)) },
  ]));
  console.log(`  ortalama (78x62) ${pct(mean(small.map((r) => r.start.keep)))} -> ${pct(mean(small.map((r) => r.end.keep)))}`
    + ' · taban HL1-3 2401. hafta: %80.3 -> %84.8 (2600. hafta %85.0)');
  const assimilation = runs.reduce((s, r) => s + r.assimilated, 0);
  if (requireEvents('T2a', assimilation, 'asimilasyon akisi (econ.assimilated)')) {
    const melted = runs.filter((r) => r.end.keep < r.start.keep - 0.01);
    const bypass = runs.filter((r) => (r.hlLoss.focus + r.hlLoss.forced) / Math.max(1, r.start.people) > 0.05);
    if (melted.length) {
      finding('HIGH', 'yurt kilidi',
        'yurt halkinin yurt kumelerindeki payi sonda >= basta - 1 puan (tasarim karari)',
        melted.map((r) => `${label(r)} ${pct(r.start.keep)} -> ${pct(r.end.keep)}`).join('; '));
    }
    if (bypass.length) {
      finding('HIGH', 'yurt kilidi delindi',
        'odak + zorla asimilasyon yurt halkinin en fazla %5\'ini eritir (taban %1.7-2.7)',
        bypass.map((r) => `${label(r)} ${pct((r.hlLoss.focus + r.hlLoss.forced) / r.start.people)}`).join('; '));
    }
    if (!melted.length && !bypass.length) console.log('  -> Halklar yurdunda duruyor, kilidi delen kanal sinirda. DOGRU.');
  }
}

// --- T2b ---
sub('T2b — cesitlilik: dunya homojenlesiyor mu?');
{
  console.log(`  etkin kultur sayisi (ters Simpson) ${runs.map((r) => `${label(r)} ${n2(r.start.D)}->${n2(r.end.D)} (x${n2(r.end.D / r.start.D)})`).join(' · ')}`);
  const ratios = runs.map((r) => r.end.D / r.start.D);
  const worst = Math.min(...ratios);
  console.log(`  en kotu oran x${n2(worst)} · taban x0.89-1.02`);
  if (worst < 0.5) {
    finding('HIGH', 'cesitlilik', 'etkin kultur sayisi baslangicin yarisindan asagi inmez (tasarim karari)', `x${n2(worst)}`);
  } else if (worst < 0.8) {
    finding('MEDIUM', 'cesitlilik (WARN)', 'etkin kultur sayisi baslangicin 0.8 katinin ustunde kalir', `x${n2(worst)}`);
  } else console.log('  -> Dunya cok halkli kaliyor. DOGRU.');
}

// --- T2c ---
sub('T2c — fren tutusu (tasarim kapisi, WARN): konum paylari');
{
  const YEARS = [1900, 1910, 1914, 1920, 1939, 1945];
  const at = (r, year) => (year === 1945 ? r.standing.find((s) => s.end) : r.standing.find((s) => s.year === year && !s.end));
  const rowsOut = [];
  for (const r of runs) {
    for (const year of YEARS) {
      const s = at(r, year);
      if (!s) continue;
      rowsOut.push({ seed: label(r), year, ...s });
    }
  }
  const meanRow = (year) => {
    const list = small.map((r) => at(r, year)).filter(Boolean);
    return { seed: '78x62 ort', year, ...Object.fromEntries(['subject', 'citizen', 'homeRule', 'released', 'notAccepted', 'nonPrimary'].map((k) => [k, mean(list.map((s) => s[k]))])) };
  };
  const display = [...YEARS.map(meanRow), ...rowsOut.filter((r) => r.seed.includes('160'))];
  console.log(table(display, [
    { label: 'kosu', get: (r) => r.seed, right: false },
    { label: 'yil', get: (r) => r.year },
    { label: 'tebaa', get: (r) => pc(r.subject) },
    { label: 'vatandas', get: (r) => pc(r.citizen) },
    { label: 'Home Rule', get: (r) => pc(r.homeRule) },
    { label: 'birakilmis', get: (r) => pc(r.released) },
    { label: 'ana halk disi', get: (r) => pc(r.nonPrimary) },
    { label: 'kabul disi (eski TEST 2, bilgi)', get: (r) => pc(r.notAccepted) },
  ]));
  const early = runs.map((r) => ({ r, n: r.grants.filter((g) => g.year < 1910).length, own: r.grants.filter((g) => g.ownMajority).length }));
  console.log(`  hak verme 1900-09: ${early.map((e) => `${label(e.r)} ${e.n}`).join(' · ')}`
    + ` · kampanya: ${runs.map((r) => r.grants.length).join('/')} · kendi cogunlugunu kabul: ${early.map((e) => e.own).join('/')}`);
  const lowSubject = runs.filter((r) => (at(r, 1914)?.subject ?? 0) < 0.20 || (at(r, 1945)?.subject ?? 0) < 0.08);
  if (lowSubject.length) {
    finding('MEDIUM', 'fren tutusu (WARN)', 'tebaa payi 1914 >= %20 ve 1945 >= %8 (tasarim kapisi)',
      lowSubject.map((r) => `${label(r)} ${pc(at(r, 1914)?.subject)} / ${pc(at(r, 1945)?.subject)}`).join('; '),
      'erken toplu hak verme freni tutacak tebaa birakmiyor (U1: kabul dususun %78-81\'i)');
  }
  const tooMany = early.filter((e) => e.n > 6);
  if (tooMany.length) {
    finding('MEDIUM', 'erken hak verme (WARN)', '1900-09 arasi hak verme <= 6 (tasarim kapisi)',
      tooMany.map((e) => `${label(e.r)} ${e.n}`).join('; '));
  }
}

// --- T3 ---
sub('T3 — birakma hep mumkun mu? (sahip x cogunluk halk ciftleri)');
{
  const api = runs[0].gates[0].api;
  console.log(`  engel kaynagi: ${api}`);
  console.log(table(runs, [
    { label: 'tohum', get: label, right: false },
    ...[0, 52, 104, 156, 208, 260].map((week) => ({
      label: week ? `yil ${week / 52}` : 'tur 1',
      get: (r) => {
        const g = r.gates.find((x) => x.week === week);
        return g ? `${g.open}/${g.pairs} (tebaa ${g.subjectOpen}/${g.subjectPairs})` : '-';
      },
    })),
  ]));
  const blocked = runs.reduce((s, r) => s + r.gates.reduce((t, g) => t + (g.pairs - g.open), 0), 0);
  const pairs = runs.reduce((s, r) => s + r.gates.reduce((t, g) => t + g.pairs, 0), 0);
  const reasons = {};
  for (const r of runs) for (const g of r.gates) for (const [k, v] of Object.entries(g.reasons)) reasons[k] = (reasons[k] ?? 0) + v;
  console.log(`  kapali cift ${blocked}/${pairs} · engeller: ${Object.entries(reasons).map(([k, v]) => `${v}× "${k}"`).join(' · ') || '-'}`);
  if (!HAS_D7) {
    skip('T3 birakma hep mumkun', 'nationBirth.releasePeopleBlockers yok (D7, P3); yukaridaki sayilar eski releaseToKin kapisinin tabanidir');
  } else if (requireEvents('T3', pairs, 'sahip x cogunluk halk cifti')) {
    if (blocked > 0) {
      finding('HIGH', 'birakma kapali', 'her (sahip, cogunluk halk) cifti birakilabilir (tasarim karari: 0 kapali)', `${blocked}/${pairs} kapali`);
    } else console.log('  -> Her halk birakilabiliyor. DOGRU.');
  }
}

// --- T4 ---
sub('T4 — Ozgur Devlet uyanisi: kaydet/yukle turu ve ikinci hayat');
if (!HAS_D7) {
  skip('T4 Ozgur Devlet uyanisi', 'nationBirth.releasePeople yok (D7, P3)');
} else if (wake.status !== 'ran') {
  finding('HIGH', 'T4 vacuous', '3 uyuyan yuva uyandirilabilmeli', `${wake.picks} aday`);
} else {
  console.log(`  uyanis ${wake.woke.map((x) => (x ? 'evet' : 'HAYIR')).join('/')} · olen yuva ${wake.died ? 'evet' : 'HAYIR'}`
    + ` · ikinci uyanis ${wake.again ? 'evet' : 'HAYIR'} · istikrar ${n2(wake.second.stability)} · sureli degistirici ${wake.second.timed}`
    + ` · kaydet/yukle +8 hafta ${wake.identical ? 'OZDES' : 'FARKLI'}`);
  const bad = [];
  if (!wake.woke.every(Boolean) || !wake.died || !wake.again) bad.push('uyanis zinciri tamamlanmadi');
  if (Math.abs(wake.second.stability - 0.6) > 1e-6 || wake.second.timed !== 0) bad.push('ikinci hayat temiz degil');
  if (!wake.identical) bad.push(`kaydet/yukle ayristi: ${wake.firstDiff}`);
  if (bad.length) finding('HIGH', 'Ozgur Devlet uyanisi', 'uc uyanis + ikinci hayat + ozdes kayit turu', bad.join('; '));
  else console.log('  -> Uyanis ve ikinci hayat kayittan ozdes donuyor. DOGRU.');
}

// --- T5 ---
sub('T5 — savas hala toprak uretiyor mu?');
{
  const share = mean(runs.map((r) => r.changed / r.provinces));
  const conquest = mean(runs.map((r) => Math.max(0, r.changed - r.seceded) / r.provinces));
  const peaces = runs.reduce((s, r) => s + (r.transfers.peace ?? 0), 0);
  console.log(`  ${WEEKS} haftada el degisen kume orani ${pct(share)} (tohum basina ${runs.map((r) => pct(r.changed / r.provinces)).join('/')})`
    + ` · halk hareketiyle kopan ${n1(mean(runs.map((r) => r.seceded)))} · fetih payi ${pct(conquest)} · baris masasi devri ${peaces}`);
  if (requireEvents('T5', peaces, 'baris masasinda devredilen kume')) {
    if (share > 0.5) finding('HIGH', 'harita dagiliyor', 'kumelerin yarisindan fazlasi el degistirmemeli', pct(share));
    if (share < 0.03) {
      finding('CRITICAL', 'toprak uretimi', 'savas hala sinir degistirmeli', pct(share), 'audit:borders TEST 1 ile ayni kapi');
    } else if (conquest > 0.33) {
      finding('HIGH', 'kartopu', 'haritanin ucte birinden fazlasi FETIHLE el degistirmemeli', pct(conquest), 'audit:borders TEST 3 ile ayni esik');
    } else if (share <= 0.5) console.log('  -> Savas toprak uretiyor, harita dagilmiyor. DOGRU.');
  }
}

// --- T6 ---
sub(`T6 — her cikis bir kez calisiyor mu? (${exits.seed}, 26 haftalik adimlarla en cok 30 yil)`);
{
  console.log(table(exits.items, [
    { label: 'cikis', get: (r) => r.exit, right: false },
    { label: 'durum', get: (r) => r.status, right: false },
    { label: 'ayrinti', get: (r) => r.detail ?? '', right: false },
  ]));
  if (exits.legacy.dominion) console.log(`  eski kapi (bilgi): Dominion yerine vasal birakma ${exits.legacy.dominion.status} — ${exits.legacy.dominion.detail}`);
  for (const item of exits.items) {
    if (item.status === 'skip') skip(`T6 ${item.exit}`, item.detail);
    else if (item.status === 'not-open') finding('HIGH', `T6 ${item.exit} vacuous`, 'cikis kapisi kampanyada en az bir kez acilmali', item.detail);
    else if (item.status === 'failed') finding('HIGH', `T6 ${item.exit}`, 'acik gorunen kapi calistirilabilmeli', item.detail);
  }
  if (exits.items.every((i) => i.status === 'ok' || i.status === 'skip')) console.log('  -> Var olan her cikis calisti. DOGRU.');
}

process.exit(reportFindings() > 0 ? 1 : 0);
