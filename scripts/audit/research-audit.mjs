// ARASTIRMA / TEKNOLOJI DENETIMI
//
// Amac: teknolojinin YAKITINI ve AYRISMASINI onyil onyil olcmek.
// Bu denetim once A kolunu (mevcut davranis) kayda gecirir; yakit
// duzeltmesi geldiginde ayni betik B kolunu olcer ve
// TECHNOLOGY_DESIGN.md'de ONCEDEN yazilmis olcutlerle karsilastirir.
//
// Kritik nokta: olcutler kodun ONUNDE yazildi. Bu betik onlari
// dogrular ya da yanlislar; onlara gore ayarlanmaz.

import {
  headless, section, sub, table, finding, reportFindings, n0, n1, pct,
} from './harness.mjs';
import { researchPointsOf } from '../../src/game/technology.js';
import { investmentLevel } from '../../src/game/construction.js';

const SEEDS = ['RSCH1', 'RSCH2', 'RSCH3'];
const FINAL_TURN = 5740;                 // 1945 (hegemony.js)
const DECADES = [1850, 1860, 1870, 1880, 1890, 1900, 1910, 1920, 1930, 1945];

const yearOf = (turn) => 1836 + Math.floor(((turn ?? 1) - 1) * 7 / 365);

/** Siralanmis diziden yuzdelik. Bos dizide 0. */
function quantile(sorted, q) {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}
const asc = (a) => [...a].sort((x, y) => x - y);

/** Bir tohumu 1945'e kadar isletir, onyil isaretlerini toplar. */
function runSeed(seed) {
  const game = headless(seed);
  const world = game.world;
  const marks = [];
  let next = 0;
  while ((world.turn ?? 1) <= FINAL_TURN && next < DECADES.length) {
    game.turns.endTurn();
    if (yearOf(world.turn) < DECADES[next]) continue;
    const live = world.nations.filter((n) => n.alive && n.economy);
    const edu = asc(live.map((n) => n.economy.social?.education ?? 0));
    const lit = asc(live.map((n) => n.economy.literacy ?? 0));
    const rate = asc(live.map((n) => researchPointsOf(n)));
    const techs = asc(live.map((n) => (n.research?.done ?? []).length));
    const he = live.map((n) => investmentLevel(n, 'HIGHER_EDUCATION'));
    // Ayrisma olcusu: kac FARKLI teknoloji kumesi var? (sira duyarsiz)
    const sets = new Set(live.map((n) => (n.research?.done ?? []).slice().sort().join(',')));
    const progHist = {};
    let abandoned = 0;
    for (const n of live) {
      const p = n.research?.programme ?? 'NONE';
      progHist[p] = (progHist[p] ?? 0) + 1;
      abandoned += (n.research?.programmeHistory ?? [])
        .filter((h) => h.reason === 'crisis' || h.reason === 'abandoned').length;
    }
    marks.push({
      year: DECADES[next],
      nations: live.length,
      progHist,
      abandonedTotal: abandoned,
      eduMed: quantile(edu, 0.5),
      eduAt0: edu.filter((v) => v === 0).length,
      eduIqr: quantile(edu, 0.75) - quantile(edu, 0.25),
      litP10: quantile(lit, 0.1), litP50: quantile(lit, 0.5), litP90: quantile(lit, 0.9),
      rateP10: quantile(rate, 0.1), rateP50: quantile(rate, 0.5), rateP90: quantile(rate, 0.9),
      techP10: quantile(techs, 0.1), techP50: quantile(techs, 0.5), techP90: quantile(techs, 0.9),
      techMin: techs[0] ?? 0, techMax: techs[techs.length - 1] ?? 0,
      distinctSets: sets.size,
      heAny: he.filter((v) => v > 0).length,
      heGe2: he.filter((v) => v >= 2).length,
      heTotal: he.reduce((a, b) => a + b, 0),
      stabMed: quantile(asc(live.map((n) => n.economy.stability ?? 0)), 0.5),
      healthMed: quantile(asc(live.map((n) => n.economy.social?.health ?? 0)), 0.5),
      welfareMed: quantile(asc(live.map((n) => n.economy.social?.welfare ?? 0)), 0.5),
    });
    next++;
  }
  return { seed, marks };
}

section('ARASTIRMA DENETIMI — teknolojinin yakiti ve ayrismasi');
console.log(`  ${SEEDS.length} tohum × ${FINAL_TURN} tur (1836-1945)`);
console.log('  NOT: harness.headless() 78x62 harita kurar (standart 160x96 degil).');
console.log('  Mutlak sayilar buna aittir; yakit cokusu standart haritada ayrica dogrulandi.');

const runs = SEEDS.map(runSeed);

// ---------------------------------------------------------- YAKIT ---
sub('Yakit: egitim harcamasi ve okuryazarlik');
for (const run of runs) {
  console.log(`\n  [${run.seed}]`);
  console.log(table(run.marks, [
    { label: 'yil', get: (m) => m.year },
    { label: 'ulke', get: (m) => m.nations },
    { label: 'egitim med', get: (m) => n0(m.eduMed) },
    { label: 'egitim=0', get: (m) => `${m.eduAt0} (${pct(m.eduAt0 / m.nations).trim()})` },
    { label: 'egitim IQR', get: (m) => n0(m.eduIqr) },
    { label: 'okuryaz p10/p50/p90', get: (m) => `${pct(m.litP10).trim()}/${pct(m.litP50).trim()}/${pct(m.litP90).trim()}` },
  ]));
}

// ------------------------------------------------------ AYRISMA ---
sub('Ayrisma: arastirma hizi ve teknoloji sayisi');
for (const run of runs) {
  console.log(`\n  [${run.seed}]`);
  console.log(table(run.marks, [
    { label: 'yil', get: (m) => m.year },
    { label: 'hiz p10/p50/p90', get: (m) => `${n1(m.rateP10)}/${n1(m.rateP50)}/${n1(m.rateP90)}` },
    { label: 'hiz p90/p10', get: (m) => (m.rateP10 > 0 ? n1(m.rateP90 / m.rateP10) : '∞') },
    { label: 'tek p10/p50/p90', get: (m) => `${n0(m.techP10)}/${n0(m.techP50)}/${n0(m.techP90)}` },
    { label: 'lider-geri', get: (m) => n0(m.techMax - m.techMin) },
    { label: 'farkli kume', get: (m) => m.distinctSets },
  ]));
}

// --------------------------------------------- YUKSEKOGRETIM ---
sub('Kurum: yuksekogretim ve toplumsal denge');
for (const run of runs) {
  console.log(`\n  [${run.seed}]`);
  console.log(table(run.marks, [
    { label: 'yil', get: (m) => m.year },
    { label: 'HE>=1', get: (m) => m.heAny },
    { label: 'HE>=2', get: (m) => m.heGe2 },
    { label: 'HE toplam', get: (m) => m.heTotal },
    { label: 'istikrar', get: (m) => n1(m.stabMed) },
    { label: 'saglik med', get: (m) => n0(m.healthMed) },
    { label: 'refah med', get: (m) => n0(m.welfareMed) },
  ]));
}

// ------------------------------------------- ONCEDEN YAZILMIS OLCUTLER ---
sub('TECHNOLOGY_DESIGN.md olcutleri (kod yazilmadan once kayda gecti)');

const at = (run, year) => run.marks.find((m) => m.year === year);
const every = (fn) => runs.every(fn);
const some = (fn) => runs.some(fn);

// (a) 1860 sonrasi her onyilda egitimi 0 olan ulke <= %40
{
  const bad = [];
  for (const run of runs) {
    for (const m of run.marks) {
      if (m.year <= 1860) continue;
      if (m.eduAt0 / m.nations > 0.40) bad.push(`${run.seed}/${m.year}: ${pct(m.eduAt0 / m.nations).trim()}`);
    }
  }
  console.log(`  (a) egitim=0 orani <=%40 : ${bad.length ? 'KALDI' : 'GECTI'}`);
  if (bad.length) {
    finding('HIGH', 'Yakit cokusu — egitim sifira yapisiyor',
      '1860 sonrasi hicbir onyilda ulkelerin %40\'indan fazlasi egitimde sifirda olmamali',
      `${bad.length} onyil-tohum esigi asti: ${bad.slice(0, 6).join(' · ')}`,
      'adjustSocialAI (economy.js:2558) tek yonlu cirt: broke sarti kolay, rich zor,'
      + ' dongu ilk degisiklikte return ediyor ve istikrar<0.5\'te egitimi ILK kesiyor');
  }
}

// (b) egitim IQR sifir olmamali (1860/1900/1945)
{
  const flat = [];
  for (const run of runs) for (const y of [1860, 1900, 1945]) {
    const m = at(run, y);
    if (m && m.eduIqr === 0) flat.push(`${run.seed}/${y}`);
  }
  console.log(`  (b) egitim IQR > 0        : ${flat.length ? 'KALDI' : 'GECTI'}`);
  if (flat.length) {
    finding('MEDIUM', 'Egitim harcamasi yozlasmis',
      'ulkeler egitim harcamasinda birbirinden ayrismali (IQR > 0)',
      `${flat.join(' · ')} icin ceyrekler arasi acilim SIFIR`,
      'butun ulkeler ayni degerde (taban ya da tavan) yigiliyor');
  }
}

// (c) medyan okuryazarlik 1900 >= 0.25
{
  const vals = runs.map((r) => at(r, 1900)?.litP50 ?? 0);
  const ok = vals.every((v) => v >= 0.25);
  console.log(`  (c) 1900 okuryazarlik>=%25: ${ok ? 'GECTI' : 'KALDI'} (${vals.map((v) => pct(v).trim()).join(' · ')})`);
  if (!ok) {
    finding('HIGH', 'Okuryazarlik yuzyil ortasinda taban seviyede',
      '1900\'de medyan okuryazarlik en az %25 olmali',
      `olculen: ${vals.map((v) => pct(v).trim()).join(' · ')}`,
      'okuryazarlik hedefi 0.08 tabanina cakili (advanceLiteracy, economy.js:3380)');
  }
}

// (e) arastirma hizi p90/p10 >= 2.0 (1900) — lider VE geri kalan var mi
{
  const vals = runs.map((r) => { const m = at(r, 1900); return m && m.rateP10 > 0 ? m.rateP90 / m.rateP10 : Infinity; });
  const ok = vals.every((v) => v >= 2.0);
  console.log(`  (e) 1900 hiz p90/p10>=2.0 : ${ok ? 'GECTI' : 'KALDI'} (${vals.map((v) => n1(v)).join(' · ')})`);
  if (!ok) {
    finding('MEDIUM', 'Arastirma hizinda ayrisma yok',
      '1900\'de en hizli %10 ile en yavas %10 arasinda en az 2 kat fark olmali',
      `olculen p90/p10: ${vals.map((v) => n1(v)).join(' · ')}`,
      'formuldeki sabit +1 tabani (technology.js:222) herkesi ayni tabana yaklastiriyor');
  }
}

// (f) 1945'te farkli teknoloji kumesi >= 9
{
  const vals = runs.map((r) => at(r, 1945)?.distinctSets ?? 0);
  const ok = vals.every((v) => v >= 9);
  console.log(`  (f) 1945 farkli kume>=9   : ${ok ? 'GECTI' : 'KALDI'} (${vals.join(' · ')})`);
  if (!ok) {
    finding('HIGH', 'Teknolojik ayrisma duzlesti',
      '1945\'te en az 9 farkli teknoloji kumesi olmali',
      `olculen: ${vals.join(' · ')}`,
      'butun ulkeler ayni merdiveni ayni sirada tirmaniyor olabilir');
  }
}

// (g) 1900'de lider-geri farki >= 8
{
  const vals = runs.map((r) => { const m = at(r, 1900); return m ? m.techMax - m.techMin : 0; });
  const ok = vals.every((v) => v >= 8);
  console.log(`  (g) 1900 lider-geri>=8    : ${ok ? 'GECTI' : 'KALDI'} (${vals.join(' · ')})`);
  if (!ok) {
    finding('MEDIUM', 'Teknolojik liderlik merdiveni yok',
      '1900\'de en ileri ile en geri ulke arasinda en az 8 teknoloji fark olmali',
      `olculen: ${vals.join(' · ')}`, '');
  }
}

// (d) yuksekogretim: A kolunda OLCULEN taban kayit altina alinir
{
  const vals = runs.map((r) => { const m = at(r, 1900); return m ? `${m.heAny}/${m.nations} (>=2: ${m.heGe2})` : '?'; });
  console.log(`  (d) 1900 HE>=1 (taban)    : ${vals.join(' · ')}`);
}

// (h) 1870'te alt cerekte olup 1930'da ust yariya cikan var mi
{
  console.log('  (h) yakalama (catch-up)   : ulus kimligi izlenmedigi icin bu kosuda OLCULMEDI');
}

// (i) fesih ve program dagilimi
sub('Ulusal programlar');
for (const run of runs) {
  console.log(`\n  [${run.seed}]`);
  console.log(table(run.marks, [
    { label: 'yil', get: (m) => m.year },
    { label: 'programlar', get: (m) => Object.entries(m.progHist ?? {}).sort().map(([k, v]) => `${k.slice(0, 4)}:${v}`).join(' '), right: false },
    { label: 'fesih(kumulatif)', get: (m) => m.abandonedTotal ?? 0 },
  ]));
}
{
  // Tek program dunyayi yutmasin: 1900'de en yaygin program (NONE haric)
  // canli ulkelerin %70'ini gecmesin. "YZ hep ayni yolu secer" yasagi.
  const bad = [];
  for (const run of runs) {
    const m = at(run, 1900);
    if (!m?.progHist) continue;
    const withProg = Object.entries(m.progHist).filter(([k]) => k !== 'NONE');
    const total = withProg.reduce((s, [, v]) => s + v, 0);
    const top = Math.max(0, ...withProg.map(([, v]) => v));
    if (total > 0 && top / total > 0.7) bad.push(`${run.seed}: ${top}/${total}`);
  }
  console.log(`  (i2) tek program tekeli yok : ${bad.length ? 'KALDI' : 'GECTI'}${bad.length ? ` (${bad.join(' · ')})` : ''}`);
  if (bad.length) {
    finding('MEDIUM', 'YZ program cesitliligi yetersiz',
      '1900\'de tek bir program, program sahibi ulkelerin %70\'inden fazlasini tutmamali',
      bad.join(' · '), 'scoreProgrammes agirliklari tekduzelesiyor olabilir');
  }
}

reportFindings();
