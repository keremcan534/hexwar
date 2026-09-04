// Kultur huzursuzlugu / asimilasyon / isyan denetimi.
//
// Bu mekanigin en buyuk riski oyunu BOZMASIDIR: haritanin kendi kendine
// dagilmasi, tek kulturlu devletin sebepsiz kopmasi, ya da hicbir seyin
// olmamasi. Alti test o riskleri sabitler:
//
//   1. Tek kulturlu ulus huzursuzluktan TOPRAK KAYBEDEMEZ (guvenlik kilidi).
//   2. Yabanci kulturlu tasra gercekten huzursuzlanir (mekanik olu degil).
//   3. Vatandaslik politikasi olculebilir bir fark yaratir (kaldirac calisiyor).
//   4. Asimilasyon yuzyilda anlamli, on yilda gorunmez olmali (Vic2 temposu).
//   5. Isyan olur ama harita dagilmaz (yuzyilda kopan kume orani sinirli).
//   6. Kultur kabulu huzursuzlugu dusurur (cikis yolu gercek).
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import {
  headless, run, section, sub, table, n1, n2, pct, finding, reportFindings,
} from './harness.mjs';
import {
  CULTURE, acceptCulture, cultureMix, foreignShareOf, unrestSummary,
} from '../../src/game/culture.js';
import { rulingParty } from '../../src/game/politics.js';

/**
 * Politika iktidar partisinden gelir (politics.policyOf); testte sabitlemek
 * icin BUTUN partilerin ayni kaydi yazilir — secim kimi getirirse getirsin
 * olculen politika degismez.
 */
function forcePolicy(nation, category, value) {
  for (const party of nation?.politics?.parties ?? []) party.policies[category] = value;
  const ruling = rulingParty(nation);
  if (ruling) ruling.policies[category] = value;
}

const WEEKS = Number(process.argv[2] ?? 520);

section(`KULTUR HUZURSUZLUGU DENETIMI — ${WEEKS} hafta`);

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
  for (const policy of ['residency', 'full_citizenship']) {
    const probe = headless('CULTURE-UNREST');
    const world2 = probe.world;
    const target = world2.nations.find((n) => n.name === multiNation?.name);
    if (!target) break;
    probe.turns.playerNation = target.id;
    for (let i = 0; i < 260; i++) {
      // Politika her hafta yeniden yazilir: runPolitics YZ tercihine geri ceker.
      forcePolicy(target, 'citizenship', policy);
      probe.turns.endTurn();
    }
    results[policy] = unrestSummary(world2, target).unrest;
  }
  const strict = results.residency ?? 0;
  const open = results.full_citizenship ?? 0;
  console.log(`  ${multiNation?.name ?? '?'} · residency ${n2(strict)} · full citizenship ${n2(open)}`
    + ` · fark ${n2(strict - open)}`);
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

// --- TEST 5: harita dagiliyor mu? ---
sub('TEST 5 — isyan oluyor ama harita dagilmiyor mu?');
{
  const total = world.provinces.filter((p) => p.econ).length;
  const share = total > 0 ? revolted / total : 0;
  const boiling = world.provinces.filter((p) => (p.econ?.revoltWeeks ?? 0) > 0).length;
  const revolts = world.cultureRevolts ?? 0;
  console.log(`  ${WEEKS} haftada sahibi degisen kume ${revolted}/${total} (${pct(share)})`
    + ` · bunlarin ISYANLA kopani ${revolts} · su an isyan sayaci isleyen kume ${boiling}`);
  console.log('  NOT: ilk sayi savasi da icerir; ust sinir testidir.');
  if (revolts === 0) {
    finding('HIGH', 'isyan olu',
      `${WEEKS} haftada en az bir ayrilikci isyan beklenir`,
      'hic isyan olmadi', 'REVOLT_UNREST/REVOLT_WEEKS esikleri erisilemez olabilir');
  }
  if (share > 0.5) {
    finding('HIGH', 'harita dagiliyor',
      'kumelerin yarisindan fazlasi el degistirmemeli',
      pct(share));
  } else {
    console.log('  -> Sinirlar degisiyor ama harita dagilmiyor. DOGRU.');
  }
}

// --- TEST 6: kultur kabulu cikis yolu mu? ---
sub('TEST 6 — kulturu kabul etmek huzursuzlugu dusuruyor mu?');
{
  const probe = headless('CULTURE-UNREST');
  const world2 = probe.world;
  const target = world2.nations.find((n) => n.name === multiNation?.name);
  if (!target) {
    console.log('  ATLANDI — cok kulturlu aday yok');
  } else {
    probe.turns.playerNation = target.id;
    for (let i = 0; i < 260; i++) {
      forcePolicy(target, 'citizenship', 'limited_citizenship');
      probe.turns.endTurn();
    }
    const before = unrestSummary(world2, target).unrest;
    const mix = cultureMix(world2, target);
    const candidate = mix.find((row) => !row.accepted && row.share >= CULTURE.ACCEPT_MIN_SHARE);
    if (!candidate) {
      console.log(`  ATLANDI — ${target.name} icinde esigi asan kabul edilmemis kultur yok`
        + ` (en buyugu ${mix.find((r) => !r.accepted) ? pct(mix.find((r) => !r.accepted).share) : 'yok'})`);
    } else {
      const ok = acceptCulture(probe, target, candidate.id);
      for (let i = 0; i < 156; i++) probe.turns.endTurn();
      const after = unrestSummary(world2, target).unrest;
      console.log(`  ${candidate.name} (${pct(candidate.share)}) kabul edildi: ${ok}`);
      console.log(`  ulusal huzursuzluk ${n2(before)} -> ${n2(after)} (uc yil sonra)`);
      if (!ok) {
        finding('HIGH', 'kabul kapisi', 'esigi asan kultur kabul edilebilmeli', 'reddedildi');
      } else if (after >= before) {
        finding('MEDIUM', 'kabul etkisiz',
          'kultur kabulu ulusal huzursuzlugu dusurmeli',
          `${n2(before)} -> ${n2(after)}`,
          'tepki (backlash) iki yil surer; uc yil sonra net kazanc beklenir');
      } else {
        console.log('  -> Kabul gercek bir cikis yolu. DOGRU.');
      }
    }
  }
}

reportFindings();
