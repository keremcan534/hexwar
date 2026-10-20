// Kultur huzursuzlugu / asimilasyon / isyan denetimi.
//
// Bu mekanigin en buyuk riski oyunu BOZMASIDIR: haritanin kendi kendine
// dagilmasi, tek kulturlu devletin sebepsiz kopmasi, ya da hicbir seyin
// olmamasi. Yedi test o riskleri sabitler:
//
//   1. Tek kulturlu ulus huzursuzluktan TOPRAK KAYBEDEMEZ (guvenlik kilidi).
//   2. Yabanci kulturlu tasra gercekten huzursuzlanir (mekanik olu degil).
//   3. Vatandaslik politikasi olculebilir bir fark yaratir (kaldirac calisiyor).
//   4. Asimilasyon yuzyilda anlamli, on yilda gorunmez olmali (Vic2 temposu).
//   5. Dagilma CANLI ve SINIRLI (redesign §5): uc tohumun her birinde en az bir
//      hareket esige (BRINK, 90) varir ya da kopar; el degisen kume <= %50.
//   6. Her basamak yatistirir ve bir sonrakini baslatir (redesign D1, senaryo,
//      AUTO kapali): hak verme uyelerin huzursuzluk hedefini en az 3 dusurur ve
//      52 hafta icinde talep baslangicin ustune cikar; Home Rule talebi sifirlar,
//      kura istekliligi 0.5, riza 0.70 ± 0.02 (P9 sonrasi); ret ayrilikci
//      ilerlemeyi >= 60'a ve sikayeti +3'e tasir.
//   7. Esik (BRINK): istikrarli ve barista ulusun tebaa hareketi 90'i gecmez;
//      istikrar 0.40'in altina cakilinca 26 hafta icinde kopar.
//
// Mekanigi henuz olmayan alt test SKIP (not present) basar, asla GECTI degil.
// culture.js ve movements.js ad alani olarak alinir: kaldirilan bir disa
// aktarim denetimi cokertemez.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import { fileURLToPath } from 'node:url';
import {
  headless, run, runPeaceful, section, sub, table, n1, n2, pct, finding, reportFindings,
  runWorkers, skip, requireEvents, mean, quantile,
} from './harness.mjs';
import * as culture from '../../src/game/culture.js';
import * as movements from '../../src/game/movements.js';
import { refreshModifiers } from '../../src/game/modifiers.js';
import { culturePools } from '../../src/game/levy.js';
import { occupiedShareOf } from '../../src/game/provinces.js';
import { PeoplesObserver, isRebel } from './peoples-observer.mjs';

const { CULTURE, acceptCulture, cultureMix, foreignShareOf, unrestSummary } = culture;
const SELF = fileURLToPath(import.meta.url);
const BRINK = movements.MOVEMENT?.BRINK ?? 90;
const HAS_BRINK = Number.isFinite(movements.MOVEMENT?.BRINK);
// D1 merdiveni: konum okuyucusu ve kriz cevabi (P4). Sozlesme adlari:
//   culture.standingOf(nation, cultureId) → 'subject'|'citizen'|'homeRule'
//   culture.isHomeRule(nation, cultureId)
//   movements.answerCrisis(game, nation, cultureId, 'grant'|'concessions'|'refuse')
const HAS_LADDER = typeof culture.standingOf === 'function';
const HAS_CRISIS = typeof movements.answerCrisis === 'function' && typeof culture.isHomeRule === 'function';

/**
 * TEST 5'in tohum kosusu: WEEKS hafta, her hafta tebaa hareketlerinin en
 * yuksek ilerlemesi ve halk kanalindan el degistiren kume sayilir.
 */
function breakupRun(game, weeks) {
  const world = game.world;
  const owner0 = world.provinces.map((p) => p.owner);
  const observer = new PeoplesObserver(game, { player: -1, jumps: false });
  let peak = 0;
  let brinkWeeks = 0;
  for (let i = 0; i < weeks; i++) {
    game.turns.endTurn();
    observer.step();
    let weekPeak = 0;
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      for (const [key, record] of Object.entries(nation.movements ?? {})) {
        if (culture.isAccepted(nation, Number(key))) continue;
        weekPeak = Math.max(weekPeak, record.progress ?? 0);
      }
    }
    peak = Math.max(peak, weekPeak);
    if (weekPeak >= BRINK - 1e-9) brinkWeeks++;
  }
  const summary = observer.finish();
  const people = Object.values(summary.bins).reduce((s, b) => s + (b.transfer.people ?? 0), 0);
  return {
    peak, brinkWeeks, people,
    uprisings: world.uprisings ?? 0,
    vassals: world.vassalReleases ?? 0,
    changed: world.provinces.filter((p, i) => owner0[i] >= 0 && p.owner !== owner0[i]).length,
    provinces: world.provinces.filter((p) => p.econ).length,
  };
}

if (process.argv[2] === '--worker') {
  const [, seed, weeks] = process.argv.slice(2);
  process.stdout.write(JSON.stringify({ seed, ...breakupRun(headless(seed), Number(weeks)) }));
  process.exit(0);
}

/**
 * Vatandaslik artik bir YASADIR (politics.laws.citizenship) ve iktidarin
 * programi tavanini belirler. Iki kolda da ayni parti (liberal: tavan Full)
 * iktidardadir ki olculen fark yalniz yasadan gelsin. Kilit ve duyuru
 * atlanir; olculen sey kapi degil etki.
 */
function forceCitizenship(nation, level) {
  if (!nation?.politics) return;
  nation.politics.ruling = 'liberal';
  // Uluslar Çağı: yasa kademe indeksidir (0 residency, 1 limited, 2 full).
  const index = { residency_only: 0, residency: 0, limited_citizenship: 1, limited: 1, full_citizenship: 2, full: 2 }[level] ?? level;
  nation.politics.laws.citizenship = index;
  refreshModifiers(nation, 0);
}

const WEEKS = Number(process.argv[2] ?? 520);
const T5_SEEDS = ['CULTURE-UNREST', 'CU2', 'CU3'];

section(`KULTUR HUZURSUZLUGU DENETIMI — ${WEEKS} hafta · esik ${BRINK}${HAS_BRINK ? '' : ' (BRINK yok, 90 varsayildi)'}`
  + ` · D1 merdiveni ${HAS_LADDER ? 'var' : 'yok'} · kriz ${HAS_CRISIS ? 'var' : 'yok'}`);

// TEST 5'in uc tohumu kendi sureclerinde, ana kosuyla ayni anda.
const breakupJobs = runWorkers(SELF, T5_SEEDS.map((seed) => ['--worker', seed, WEEKS]));

/** Bir ulusun kumelerinin kultur kesiti. */
function slice(world, nation) {
  const rows = world.provinces.filter((p) => p.owner === nation.id && p.econ);
  const foreign = rows.filter((p) => foreignShareOf(p, nation) >= 0.5);
  return {
    provinces: rows.length,
    foreign: foreign.length,
    unrest: unrestSummary(world, nation),
    ownUnrest: rows.filter((p) => foreignShareOf(p, nation) < 0.5)
      .reduce((s, p) => Math.max(s, p.econ.unrest ?? 0), 0),
    ownMean: (() => {
      const own = rows.filter((p) => foreignShareOf(p, nation) < 0.5);
      return own.length ? own.reduce((s, p) => s + (p.econ.unrest ?? 0), 0) / own.length : 0;
    })(),
    foreignUnrest: foreign.length
      ? foreign.reduce((s, p) => s + (p.econ.unrest ?? 0), 0) / foreign.length : 0,
  };
}

// --- Ortak kosu: bir dunya, WEEKS hafta ---
const game = headless('CULTURE-UNREST');
const world = game.world;
// Kopan kumeyi sayabilmek icin baslangic sahipligi.
const ownerAt0 = world.provinces.map((p) => p.owner);
// Tek kulturlu ve cok kulturlu birer ulus sec (kurulus aninda).
const mono = [];
const multi = [];
for (const nation of world.nations) {
  if (!nation.alive || nation.tiles < 5) continue;
  const owned = world.provinces.filter((p) => p.owner === nation.id && p.econ);
  if (!owned.length) continue;
  const foreign = owned.filter((p) => foreignShareOf(p, nation) >= 0.5).length;
  (foreign === 0 ? mono : multi).push({ nation, owned: owned.length, foreign });
}
mono.sort((a, b) => b.owned - a.owned);
multi.sort((a, b) => b.foreign - a.foreign);
const monoNation = mono[0]?.nation ?? null;
const multiNation = multi[0]?.nation ?? null;

sub('KURULUS');
console.log(`  tek kulturlu aday: ${monoNation?.name ?? 'YOK'}`
  + (mono[0] ? ` (${mono[0].owned} kume, yabanci 0)` : ''));
console.log(`  cok kulturlu aday: ${multiNation?.name ?? 'YOK'}`
  + (multi[0] ? ` (${multi[0].owned} kume, ${multi[0].foreign} yabanci)` : ''));

run(game, WEEKS);

const revolted = world.provinces.filter((p, i) => (
  ownerAt0[i] >= 0 && p.owner !== ownerAt0[i]
)).length;

// --- TEST 1: tek kulturlu ulus guvende mi? ---
sub('TEST 1 — tek kulturlu ulus huzursuzluktan kume kaybediyor mu?');
{
  // Kurulusta yabancisi olmayan butun uluslar: hala butun kumeleri kendi
  // kulturunden mi, ve isyan sayaci sifir mi?
  let risky = 0;
  let peak = 0;
  for (const row of mono) {
    const owned = world.provinces.filter((p) => p.owner === row.nation.id && p.econ);
    for (const province of owned) {
      const weeks = province.econ.revoltWeeks ?? 0;
      peak = Math.max(peak, weeks);
      if (weeks > 0) risky++;
    }
  }
  console.log(`  ${mono.length} tek kulturlu ulus · isyan sayaci sifirdan buyuk kume: ${risky}`
    + ` · en yuksek sayac ${peak}/${CULTURE.REVOLT_WEEKS}`);
  if (risky > 0) {
    finding('CRITICAL', 'guvenlik kilidi',
      'tek kulturlu ulusun kumesi isyan sayaci biriktirmemeli',
      `${risky} kume sayac biriktirdi (en yuksek ${peak})`,
      'REVOLT_FOREIGN_MIN kapisi kabul edilmeyen halkin cogunlugunu sart kosar');
  } else {
    console.log('  -> Tek kulturlu ulusal devlet bu mekanikten toprak kaybedemez. DOGRU.');
  }
}

// --- TEST 2: mekanik olu mu? ---
sub('TEST 2 — yabanci kulturlu tasra huzursuzlaniyor mu?');
{
  const rows = [];
  for (const row of multi.slice(0, 6)) {
    const s = slice(world, row.nation);
    rows.push({
      ulke: row.nation.name,
      kume: s.provinces,
      yabanci: s.foreign,
      yabanciHuzursuz: n2(s.foreignUnrest),
      kendiEnYuksek: n2(s.ownUnrest),
      kaynayan: s.unrest.boiling,
    });
  }
  console.log(table(rows, [
    { label: 'ulke', get: (r) => r.ulke, right: false },
    { label: 'kume', get: (r) => r.kume },
    { label: 'yabanci', get: (r) => r.yabanci },
    { label: 'yab.huzursuz', get: (r) => r.yabanciHuzursuz },
    { label: 'kendi zirve', get: (r) => r.kendiEnYuksek },
    { label: 'kaynayan', get: (r) => r.kaynayan },
  ]));
  // Karsilastirma AYNI CINSTEN olmali: iki tarafta da ORTALAMA, ve yalniz
  // hala yabanci kumesi olan uluslar sayilir. Ilk yazimda yabanci ORTALAMASI
  // kendi kumelerinin ZIRVESI ile karsilastiriliyordu ve yabancisi kalmamis
  // ulusler foreign=0 ile ortalamayi asagi cekiyordu — olcut hatasiydi.
  const withForeign = multi.map((row) => slice(world, row.nation))
    .filter((x) => x.foreign > 0);
  const avgForeign = withForeign.reduce((s, x) => s + x.foreignUnrest, 0)
    / Math.max(1, withForeign.length);
  const avgOwn = withForeign.reduce((s, x) => s + x.ownMean, 0)
    / Math.max(1, withForeign.length);
  console.log(`  hala yabanci kumesi olan ${withForeign.length} ulus`
    + ` · yabanci kume ortalamasi ${n2(avgForeign)} · kendi kumeleri ortalamasi ${n2(avgOwn)}`);
  if (avgForeign < 1) {
    finding('HIGH', 'huzursuzluk olu',
      'yabanci kulturlu tasra olculebilir huzursuzluk biriktirmeli',
      `ortalama ${n2(avgForeign)}`);
  } else if (avgForeign <= avgOwn) {
    finding('HIGH', 'huzursuzluk ayirt etmiyor',
      'yabanci kume kendi kumesinden daha huzursuz olmali',
      `yabanci ${n2(avgForeign)} <= kendi ${n2(avgOwn)}`);
  } else {
    console.log('  -> Yabanci halk kendi halkindan belirgin daha huzursuz. DOGRU.');
  }
}

// --- TEST 3: vatandaslik kaldiraci ---
sub('TEST 3 — vatandaslik politikasi huzursuzlugu oynatiyor mu?');
{
  const results = {};
  const kept = {};
  for (const policy of ['residency', 'full_citizenship']) {
    const probe = headless('CULTURE-UNREST');
    const world2 = probe.world;
    const target = world2.nations.find((n) => n.name === multiNation?.name);
    if (!target) break;
    probe.turns.playerNation = target.id;
    // Kosu boyunca ortalama: son haftanin fotografi hayatta kalan kumeleri
    // olcer. Olculdu: residency altinda Norengrad 22 kumenin 19'unu kaybetti,
    // elde kalan 3 ana kume sakindi ve son-hafta olcusu ters cikti
    // (1.90 vs 2.58) — oysa kosu boyunca residency 3 kat huzursuzdu.
    let sum = 0;
    let samples = 0;
    for (let i = 0; i < 520; i++) {
      // Yasa her hafta yeniden yazilir: kaydedilmis bir secim bile olculeni bozmasin.
      forceCitizenship(target, policy);
      probe.turns.endTurn();
      if (i % 13 === 12 && target.alive) {
        sum += unrestSummary(world2, target).unrest;
        samples++;
      }
    }
    results[policy] = samples > 0 ? sum / samples : 0;
    kept[policy] = world2.provinces.filter((p) => p.owner === target.id).length;
  }
  const strict = results.residency ?? 0;
  const open = results.full_citizenship ?? 0;
  console.log(`  ${multiNation?.name ?? '?'} · kosu ortalamasi: residency ${n2(strict)}`
    + ` · full citizenship ${n2(open)} · fark ${n2(strict - open)}`
    + ` · elde kalan kume ${kept.residency ?? '?'} / ${kept.full_citizenship ?? '?'}`);
  if (!(strict - open > 0.3)) {
    finding('HIGH', 'vatandaslik kaldiraci',
      'residency ile tam vatandaslik arasinda olculebilir fark olmali',
      `${n2(strict)} vs ${n2(open)}`);
  } else {
    console.log('  -> Vatandaslik politikasi huzursuzlugu gercekten oynatiyor. DOGRU.');
  }
}

// --- TEST 4: asimilasyon temposu ---
sub('TEST 4 — asimilasyon yuzyilda anlamli, on yilda gorunmez mi?');
{
  let moved = 0;
  let owned = 0;
  for (const province of world.provinces) {
    if (province.owner < 0 || !province.econ) continue;
    owned++;
    moved += province.econ.assimilated ?? 0;
  }
  const perProvince = owned > 0 ? moved / owned : 0;
  const perCentury = perProvince * (5200 / WEEKS);
  console.log(`  ${WEEKS} haftada kume basina kayan pay ${n2(perProvince * 100)}%`
    + ` · bu hizla yuzyilda ~${n2(Math.min(100, perCentury * 100))}%`);
  if (perProvince * 100 > 25) {
    finding('HIGH', 'asimilasyon hizli',
      `${WEEKS} haftada kume basina %25'ten az pay kaymali`,
      `${n2(perProvince * 100)}%`, 'harita on yilda tek renge doner');
  } else if (perCentury * 100 < 5) {
    finding('MEDIUM', 'asimilasyon olu',
      'yuzyilda en az %5 pay kaymali, yoksa cikis yolu yok',
      `${n2(perCentury * 100)}%`);
  } else {
    console.log('  -> Asimilasyon Vic2 temposunda: on yillar surer, yuzyilda kazanir. DOGRU.');
  }
}

// --- TEST 5: dagilma canli ve sinirli mi? ---
sub(`TEST 5 — dagilma canli ve sinirli mi? (${T5_SEEDS.length} tohum x ${WEEKS} hafta, 78x62)`);
{
  const rows = await breakupJobs;
  console.log(table(rows, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'en ileri tebaa hareketi', get: (r) => `%${r.peak.toFixed(0)}` },
    { label: `esikte hafta (>=${BRINK})`, get: (r) => r.brinkWeeks },
    { label: 'ayaklanma', get: (r) => r.uprisings },
    { label: 'vasal/Dominion', get: (r) => r.vassals },
    { label: 'halk kanali kume', get: (r) => r.people },
    { label: 'el degisen', get: (r) => `${r.changed}/${r.provinces} (${pct(r.changed / r.provinces)})` },
  ]));
  console.log('  NOT: el degisen savasi da icerir; ust sinir testidir. Esik, BRINK yoksa 90 kabul edilir.');
  const dead = rows.filter((r) => r.peak < BRINK - 1e-9 && r.people === 0);
  const torn = rows.filter((r) => r.changed / r.provinces > 0.5);
  if (dead.length) {
    finding('HIGH', 'dagilma olu',
      `her tohumda en az bir hareket esige (${BRINK}) varmali ya da kopmali (tasarim karari)`,
      dead.map((r) => `${r.seed}: en ileri %${r.peak.toFixed(0)}, kopus 0`).join('; '),
      'MOVEMENT.CALM/GROWTH esikleri erisilemez olabilir');
  }
  if (torn.length) {
    finding('HIGH', 'harita dagiliyor', 'kumelerin yarisindan fazlasi el degistirmemeli',
      torn.map((r) => `${r.seed} ${pct(r.changed / r.provinces)}`).join('; '));
  }
  if (!dead.length && !torn.length) console.log('  -> Hareketler esige varip kopuyor, harita dagilmiyor. DOGRU.');
}

/** Uyelerin (halkin cogunluk oldugu kumeler) nufus agirlikli huzursuzluk hedefi. */
function membersTarget(world, nation, members, turn) {
  let weighted = 0;
  let people = 0;
  for (const province of members) {
    if (province.owner !== nation.id || !province.econ) continue;
    const parts = culture.unrestBreakdown(world, province, nation, { occupied: occupiedShareOf(world, province), turn });
    const w = Math.max(1, province.econ.population ?? 0);
    weighted += parts.target * w;
    people += w;
  }
  return people > 0 ? weighted / people : NaN;
}

/**
 * Kura istekliligi: ayni kumede halkin satiriyla ana halkin satirinin kisi
 * basina havuz orani (taban — nufus, oran, sukun, statu — ikisinde ortak).
 */
function willingnessOf(world, nation, cultureId, members) {
  const ratios = [];
  for (const province of members) {
    if (province.owner !== nation.id || !province.econ) continue;
    const rows = culturePools(world, province, nation);
    const row = rows.find((r) => r.id === cultureId);
    const primary = rows.find((r) => r.id === nation.culture);
    if (row?.share > 0 && primary?.share > 0 && primary.pool > 0) ratios.push((row.pool / row.share) / (primary.pool / primary.share));
  }
  return mean(ratios);
}

const membersOf = (world, nation, cultureId) => world.provinces
  .filter((p) => p.owner === nation.id && p.econ && p.culture === cultureId);

/** Sahte kriz: ulus oyuncu olur (YZ hemen cevaplar), talep 100'e cekilir, bir hafta. */
function forceCrisis(probe, nation, cultureId) {
  probe.turns.playerNation = nation.id;
  nation.delegation = null;
  const record = ((nation.movements ??= {})[cultureId] ??= { progress: 0 });
  record.progress = 100;
  probe.turns.endTurn();
  return nation.movements?.[cultureId]?.crisis ?? null;
}

/** Halk hak sahibi degilse hak verilir (SG doldurularak): kriz basamagi vatandas ister. */
function ensureCitizen(probe, nation, cultureId) {
  if (culture.isAccepted(nation, cultureId)) return true;
  nation.power = Math.max(nation.power ?? 0, 400);
  return acceptCulture(probe, nation, cultureId);
}

// --- TEST 6: her basamak yatistirir ve bir sonraki talebi baslatir mi? ---
sub('TEST 6 — her basamak yatistirir ve bir sonrakini baslatir mi? (senaryo, AUTO kapali)');
{
  const probe = headless('CULTURE-UNREST');
  const world2 = probe.world;
  for (let i = 0; i < 520; i++) probe.turns.endTurn();
  // TEK ULKE ORNEGI KIRILGAN (eski TEST 6'nin dersi: dengedeki tek ulke
  // saglam mekanigi "etkisiz" ilan ediyordu). Sekiz aday, her biri kendi
  // uyeleriyle olculur; hedef BIR HAFTA sonra okunur (birikmis sikayet
  // kabulden sonraki haftada sifira kirpilir).
  const candidates = [];
  for (const nation of world2.nations) {
    if (!nation.alive || isRebel(nation)) continue;
    for (const row of cultureMix(world2, nation)) {
      if (row.primary || row.accepted || row.share < CULTURE.ACCEPT_MIN_SHARE) continue;
      const members = membersOf(world2, nation, row.id);
      if (!members.length) continue;
      candidates.push({ nation, row, members });
      break;
    }
    if (candidates.length >= 8) break;
  }
  const scripted = candidates[0]?.nation ?? null;
  if (scripted) {
    probe.turns.playerNation = scripted.id;
    scripted.delegation = null;
  }
  const turn0 = probe.turns.turn;
  for (const c of candidates) {
    c.before = membersTarget(world2, c.nation, c.members, turn0);
    c.nation.power = Math.max(c.nation.power ?? 0, 400);
    c.ok = acceptCulture(probe, c.nation, c.row.id);
    c.progress0 = c.nation.movements?.[c.row.id]?.progress ?? 0;
  }
  probe.turns.endTurn();
  for (const c of candidates) c.after = membersTarget(world2, c.nation, c.members, probe.turns.turn);
  const granted = candidates.filter((c) => c.ok && Number.isFinite(c.before) && Number.isFinite(c.after));
  console.log(table(candidates, [
    { label: 'ulke', get: (r) => `${r.nation.name}${r.nation === scripted ? ' (senaryo)' : ''}`, right: false },
    { label: 'halk', get: (r) => `${r.row.name} ${pct(r.row.share)}`, right: false },
    { label: 'uye', get: (r) => r.members.length },
    { label: 'hak', get: (r) => (r.ok ? 'evet' : 'hayir'), right: false },
    { label: 'hedef once', get: (r) => n2(r.before) },
    { label: '1 hafta sonra', get: (r) => n2(r.after) },
    { label: 'dusus', get: (r) => n2(r.before - r.after) },
  ]));
  if (requireEvents('TEST 6a', granted.length, 'gerceklesen hak verme')) {
    const drops = granted.map((c) => c.before - c.after);
    const median = quantile(drops, 0.5);
    console.log(`  uyelerin hedef dususu ortanca ${n2(median)} · ortalama ${n2(mean(drops))} (tasarim karari: >= 3)`);
    if (!(median >= 3)) {
      finding('HIGH', 'hak verme yatistirmiyor',
        'hak verme uyelerin huzursuzluk hedefini en az 3 dusurur (redesign D1/§5)',
        `ortanca dusus ${n2(median)} (${drops.map(n2).join(', ')})`,
        'kabul kultur terimini sifirlar ama ana halka iki yillik tepki (2.5) biner');
    } else console.log('  -> Hak verme uyeleri yatistiriyor. DOGRU.');
  }
  // (a2) Bir sonraki talep: vatandas izi (D1) yoksa olculemez.
  if (!HAS_LADDER) {
    skip('TEST 6a talep yukselir', 'culture.standingOf yok: hak sonrasi vatandas talebi izi henuz yok (D1, P4)');
  } else if (scripted && candidates[0].ok) {
    const id = candidates[0].row.id;
    let peak = candidates[0].progress0;
    for (let i = 0; i < 51; i++) {
      probe.turns.endTurn();
      peak = Math.max(peak, scripted.movements?.[id]?.progress ?? 0);
    }
    console.log(`  ${scripted.name} ← ${candidates[0].row.name}: hak sonrasi talep ${n1(candidates[0].progress0)} → 52 haftada en yuksek ${n1(peak)}`);
    if (!(peak > candidates[0].progress0 + 1e-9)) {
      finding('HIGH', 'merdiven donmuyor', 'hak verilen halkin talebi 52 hafta icinde baslangicinin ustune cikar (D1)',
        `${n1(candidates[0].progress0)} → ${n1(peak)}`);
    } else console.log('  -> Hak bir sonraki talebi baslatiyor. DOGRU.');
  }

  // (b) Home Rule ve (c) ret: zorla kriz (D1 kriz cevabi yoksa SKIP).
  if (!HAS_CRISIS) {
    skip('TEST 6b Home Rule', 'movements.answerCrisis / culture.isHomeRule yok (D1, P4)');
    skip('TEST 6c ret', 'movements.answerCrisis yok (D1, P4)');
  } else {
    const pairs = [];
    for (const nation of world2.nations) {
      if (!nation.alive || isRebel(nation)) continue;
      for (const row of cultureMix(world2, nation)) {
        if (row.primary || culture.isHomeRule(nation, row.id) || row.share < CULTURE.ACCEPT_MIN_SHARE) continue;
        if (!membersOf(world2, nation, row.id).length) continue;
        pairs.push({ nation, id: row.id, name: row.name });
        break;
      }
      if (pairs.length >= 2) break;
    }
    if (requireEvents('TEST 6b/6c', pairs.length >= 2 ? 2 : 0, 'zorla kriz icin iki (ulus, halk) cifti')) {
      // (b) Home Rule
      {
        const { nation, id, name } = pairs[0];
        ensureCitizen(probe, nation, id);
        const crisis = forceCrisis(probe, nation, id);
        if (crisis) movements.answerCrisis(probe, nation, id, 'grant');
        const members = membersOf(world2, nation, id);
        probe.turns.endTurn();
        const progress = nation.movements?.[id]?.progress ?? 0;
        const willing = willingnessOf(world2, nation, id, members);
        const consent = members.map((p) => p.econ?.consent).filter((v) => typeof v === 'number');
        console.log(`  Home Rule ${nation.name} ← ${name}: kriz ${crisis ? crisis.kind ?? '?' : 'ACILMADI'}`
          + ` · Home Rule ${culture.isHomeRule(nation, id) ? 'evet' : 'HAYIR'} · talep ${n1(progress)}`
          + ` · kura istekliligi ${n2(willing)} · riza ${consent.length ? n2(mean(consent)) : 'yok'}`);
        const bad = [];
        if (!crisis) bad.push('kriz acilmadi');
        if (!culture.isHomeRule(nation, id)) bad.push('Home Rule verilmedi');
        if (progress > 1) bad.push(`talep ${n1(progress)} (0 beklenir; bir hafta buyume payi 1)`);
        if (Number.isFinite(willing) && Math.abs(willing - 0.5) > 0.02) bad.push(`kura istekliligi ${n2(willing)}`);
        if (!Number.isFinite(willing)) bad.push('kura istekliligi olculemedi (uyede ana halk satiri yok)');
        if (consent.length && Math.abs(mean(consent) - 0.7) > 0.02) bad.push(`riza ${n2(mean(consent))}`);
        if (!consent.length) skip('TEST 6b riza 0.70', 'province.econ.consent yok (D8, P9)');
        if (bad.length) finding('HIGH', 'Home Rule basamagi', 'talep 0, kura istekliligi 0.5, riza 0.70 ± 0.02', bad.join('; '));
        else console.log('  -> Home Rule basamagi dogru. DOGRU.');
      }
      // (c) Ret
      {
        const { nation, id, name } = pairs[1];
        ensureCitizen(probe, nation, id);
        const crisis = forceCrisis(probe, nation, id);
        const members = membersOf(world2, nation, id);
        const grievance0 = mean(members.map((p) => p.econ?.grievance ?? 0));
        if (crisis) movements.answerCrisis(probe, nation, id, 'refuse');
        const grievance1 = mean(members.map((p) => p.econ?.grievance ?? 0));
        const progress = nation.movements?.[id]?.progress ?? 0;
        console.log(`  Ret ${nation.name} ← ${name}: kriz ${crisis ? crisis.kind ?? '?' : 'ACILMADI'}`
          + ` · hak ${culture.isAccepted(nation, id) ? 'DURUYOR' : 'geri alindi'} · ayrilikci ilerleme ${n1(progress)}`
          + ` · sikayet ${n2(grievance0)} → ${n2(grievance1)}`);
        const bad = [];
        if (!crisis) bad.push('kriz acilmadi');
        if (culture.isAccepted(nation, id)) bad.push('hak geri alinmadi');
        if (!(progress >= 60)) bad.push(`ilerleme ${n1(progress)} < 60`);
        if (!(grievance1 - grievance0 >= 3 - 1e-9)) bad.push(`sikayet +${n2(grievance1 - grievance0)} < 3`);
        if (bad.length) finding('HIGH', 'ret basamagi', 'ret: hak kalkar, ayrilikci ilerleme >= 60, sikayet +3', bad.join('; '));
        else console.log('  -> Ret isyana donuyor. DOGRU.');
      }
    }
  }
}

// --- TEST 7: esik (BRINK) ---
sub(`TEST 7 — esik: istikrarli ulusun tebaa hareketi ${BRINK}'i gecmez, sarsilinca kopar`);
if (!HAS_BRINK) {
  skip('TEST 7 esik', 'movements.MOVEMENT.BRINK yok (D1, P4)');
} else {
  const probe = headless('CULTURE-UNREST');
  const world3 = probe.world;
  runPeaceful(probe, 260);
  let pick = null;
  for (const nation of world3.nations) {
    if (!nation.alive || isRebel(nation)) continue;
    for (const [id, provinces] of culture.movementProvinces(world3, nation)) {
      if (provinces.length && provinces.length < (nation.provinces ?? 0)) { pick = { nation, id, provinces }; break; }
    }
    if (pick) break;
  }
  if (requireEvents('TEST 7', pick ? 1 : 0, 'uyesi olan tebaa hareketi')) {
    const { nation, id, provinces } = pick;
    probe.turns.playerNation = nation.id;
    nation.delegation = null;
    const record = () => nation.movements?.[id] ?? {};
    const lostAny = () => provinces.some((p) => p.owner !== nation.id);
    const push = (stability) => {
      nation.stability = stability;
      if (typeof nation.politics?.exhaustion === 'number') nation.politics.exhaustion = 0;
      for (const p of provinces) if (p.owner === nation.id && p.econ) p.econ.unrest = 9;
    };
    let peak = 0;
    const uprisings0 = record().uprisings ?? 0;
    for (let i = 0; i < 52; i++) {
      push(Math.max(nation.stability ?? 0.6, 0.7));
      runPeaceful(probe, 1);
      peak = Math.max(peak, record().progress ?? 0);
    }
    const heldA = !lostAny() && (record().uprisings ?? 0) === uprisings0;
    let brokeAt = null;
    for (let i = 0; i < 26 && brokeAt == null; i++) {
      // Sarsılma eşiğinin altı (movements.FALTER_STABILITY, 2026-10-15: 0.40 → 0.30).
      push((movements.FALTER_STABILITY ?? 0.40) - 0.05);
      runPeaceful(probe, 1);
      if ((record().uprisings ?? 0) > uprisings0 || lostAny()) brokeAt = i + 1;
    }
    console.log(`  ${nation.name} ← ${world3.cultures[id]?.name}: istikrarli + baris 52 hafta, en yuksek %${peak.toFixed(1)}`
      + ` · ${heldA ? 'kopmadi' : 'KOPTU'} · istikrar ${((movements.FALTER_STABILITY ?? 0.40) - 0.05).toFixed(2)}'te ${brokeAt == null ? '26 haftada KOPMADI' : `${brokeAt}. haftada koptu`}`);
    if (peak > BRINK + 1e-9 || !heldA) {
      finding('HIGH', 'esik tutmuyor', `istikrarli ve barista ulusun tebaa hareketi ${BRINK}'i gecmez`, `en yuksek %${peak.toFixed(1)}${heldA ? '' : ', koptu'}`);
    }
    if (brokeAt == null) {
      finding('HIGH', 'esik acilmiyor', 'istikrar sarsilma esiginin altina cakilinca hareket 26 hafta icinde kopar', '26 haftada kopmadi');
    }
    if (peak <= BRINK + 1e-9 && heldA && brokeAt != null) console.log('  -> Baris gerilim biriktirir, sarsinti onu bosaltir. DOGRU.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);

