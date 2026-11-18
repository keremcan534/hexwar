// GAZETE DENETİMİ (src/game/press.js).
//
// Üç soru:
//   1. Gazete simülasyona dokunuyor mu? Aynı tohum gazeteli ve gazetesiz koşulur,
//      parmak izleri bayt bayt aynı olmalı (her koşu kendi sürecinde).
//   2. Manşetler tekrar ediyor mu? Birebir aynı başlık ve aynı kalıp sayılır.
//   3. Arşiv kayıttan sağlam dönüyor mu, kayda ne kadar yük bindiriyor?
//
//   node scripts/audit/press-audit.mjs [YIL=20] [TOHUM=PRESS1] [--samples]
//
// Örnek sayılar scripts/audit/_tmp/press/ altına düz metin yazılır: gazeteyi
// sayı değil, gözle okumak için.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  headless, passivePlayer, section, sub, table, finding, reportFindings,
} from './harness.mjs';
import { worldFingerprint, extendedFingerprint, fingerprintHash } from './fingerprint.mjs';
import { paperOf, pressWeek, voiceOf } from '../../src/game/press.js';
import { LEX, composeIssue, paperName } from '../../src/game/pressText.js';

const HERE = fileURLToPath(import.meta.url);
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));

/** İşçi kipi: tek koşu, parmak izini JSON olarak basar. */
if (process.argv[2] === '--worker') {
  const [, seed, weeks, withPress] = process.argv.slice(2);
  const game = headless(seed);
  const after = passivePlayer(game);
  for (let i = 0; i < Number(weeks); i++) {
    game.turns.endTurn();
    after();
    if (withPress === '1') pressWeek(game);
  }
  process.stdout.write(JSON.stringify({
    core: fingerprintHash(worldFingerprint(game)),
    extended: fingerprintHash(extendedFingerprint(game)),
    rng: game.turns.rng.state(),
    issues: game.world.press?.issues.length ?? 0,
  }));
  process.exit(0);
}

const YEARS = Number(args[0] ?? 20);
const SEED = args[1] ?? 'PRESS1';
const WEEKS = Math.round(YEARS * 52.18);
const OUT = join(dirname(HERE), '_tmp', 'press');
mkdirSync(OUT, { recursive: true });

section(`GAZETE: ${YEARS} yıl, tohum ${SEED}`);

const game = headless(SEED);
const afterWeek = passivePlayer(game);
const player = afterWeek.player;
const costs = [];
for (let i = 0; i < WEEKS && player.alive; i++) {
  game.turns.endTurn();
  afterWeek();
  const t0 = performance.now();
  pressWeek(game);
  costs.push(performance.now() - t0);
}

const press = game.world.press;
const issues = press?.issues ?? [];
const views = issues.map(composeIssue);

// ---------------------------------------------------------- ÖRNEKLER ---

const textOf = (view) => [
  `${view.paper} — ${view.numberLabel} — ${view.city}, ${view.date}${view.extra ? ` — ${view.extraLabel}` : ''}  [${view.voice}/${view.family}] foto: ${view.photo}`,
  `  [${view.lead.section}] ${view.lead.head.toUpperCase()}`,
  `      ${view.lead.deck}`,
  ...(view.lead.body ? [`      ${view.lead.body}`] : []),
  ...view.subs.map((row) => `  * [${row.section}] ${row.head} — ${row.deck} ${row.body}`.trimEnd()),
  ...view.briefs.map((row) => `  · ${row.head}. ${row.deck}`.trimEnd()),
  '',
].join('\n').replaceAll('[[cut]]', '[SANSÜR]');

writeFileSync(join(OUT, `${SEED}-hepsi.txt`), views.map(textOf).join('\n'));

// ---------------------------------------------------------- ÖLÇÜMLER ---

/** Başlığın kalıbı: büyük harfle başlayan özel adlar ve sayılar silinir. */
const names = new Set();
for (const nation of game.world.nations) names.add(nation.name);
for (const city of game.world.cities) names.add(city.name);
function skeleton(head) {
  let out = head;
  for (const name of names) out = out.split(name).join('#');
  return out.replace(/\d+/g, '0').toLowerCase();
}

const count = (list) => {
  const map = new Map();
  for (const item of list) map.set(item, (map.get(item) ?? 0) + 1);
  return map;
};
const repeats = (map) => [...map].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);

const leads = views.map((view) => view.lead.head);
const allHeads = views.flatMap((view) => [view.lead.head, ...view.subs.map((row) => row.head), ...view.briefs.map((row) => row.head)]);
const leadExact = repeats(count(leads));
const allExact = repeats(count(allHeads));
const leadShapes = repeats(count(leads.map(skeleton)));

/** Aynı başlığın iki basımı arasındaki en kısa aralık (sayı). */
let nearest = Infinity;
const lastAt = new Map();
leads.forEach((head, i) => {
  if (lastAt.has(head)) nearest = Math.min(nearest, i - lastAt.get(head));
  lastAt.set(head, i);
});

const byKind = count(issues.map((issue) => issue.lead.k));
const byYear = count(views.map((view) => view.date.slice(-4)));
const extras = views.filter((view) => view.extra).length;
const bytes = JSON.stringify(press ?? {}).length;

sub('Basım');
console.log(`  sayı ${issues.length} (yılda ${(issues.length / YEARS).toFixed(1)}), olağanüstü ${extras} (yılda ${(extras / YEARS).toFixed(1)})`);
console.log(`  kayıt yükü ${(bytes / 1024).toFixed(0)} KB, sayı başına ${(bytes / Math.max(1, issues.length)).toFixed(0)} bayt`);
const ranked = [...costs].sort((a, b) => a - b);
const at = (q) => ranked[Math.min(ranked.length - 1, Math.floor(ranked.length * q))].toFixed(2);
console.log(`  haftalık maliyet: ortanca ${at(0.5)} ms, %95 ${at(0.95)} ms, %99 ${at(0.99)} ms (başka süreçler koşarken şişer)`);
console.log(`  ses: ${[...count(views.map((v) => v.voice))].map(([v, n]) => `${v} ${n}`).join(', ')}`);
console.log(`  gazete adları: ${[...count(views.map((v) => v.paper)).keys()].join(' | ')}`);

sub('Tekrar');
console.log(`  manşet: ${leads.length}, birebir tekrar eden başlık ${leadExact.length}, en kısa aralık ${Number.isFinite(nearest) ? `${nearest} sayı` : 'yok'}`);
console.log(`  bütün başlıklar: ${allHeads.length}, birebir tekrar ${allExact.length}`);
console.log(`  aynı kalıp manşet: ${leadShapes.length} kalıp, en sık ${leadShapes[0]?.[1] ?? 0} kez`);
for (const [head, n] of leadExact.slice(0, 8)) console.log(`    ${n}× ${head}`);
for (const [shape, n] of leadShapes.slice(0, 8)) console.log(`    kalıp ${n}× ${shape}`);

sub('Manşet türleri');
console.log(table([...byKind].sort((a, b) => b[1] - a[1]).map(([kind, n]) => ({ kind, n })), [
  { label: 'tür', get: (r) => r.kind, right: false },
  { label: 'sayı', get: (r) => r.n },
]));
void byYear;

// --------------------------------------------------------------- SES ---

/** Aynı olgu beş rejimin ağzından: propaganda gerçekten kayıyor mu? */
const VOICES = ['court', 'jingo', 'labour', 'free', 'sober'];
const FIXTURES = [
  { k: 'capital_fell', city: 'Karsk', a: 'Vostria', by: 'Arheim', us: 'a' },
  { k: 'battle', w: 'Arheim', l: 'Vostria', place: 'Pellvale', gen: 'Otto Brandt', lw: 8400, ll: 31000, us: 'l' },
  { k: 'peace', a: 'Arheim', b: 'Vostria', us: 'b', n: 4, wk: 96 },
  { k: 'front', foe: 'Arheim', wk: 40, hold: 0, held: 6, lo: 120000, lt: 64000, mood: 'lose', gen: 'Ivan Sorel' },
  { k: 'supply', a: 'Vostria', us: 1, pct: 62 },
  { k: 'hunger', pct: 71 },
  { k: 'war', a: 'Arheim', b: 'Vostria', us: 'b', ph: 'declared', wk: 8 },
];
const voiceLines = [];
let flat = 0;
for (const fact of FIXTURES) {
  voiceLines.push(`--- ${fact.k} ---`);
  const heads = new Set();
  for (const vo of VOICES) {
    const view = composeIssue({
      n: 1, t: 700, x: 0, fam: 'Torvic', vo, ci: 'Karsk', na: 'Vostria', ru: 'the Emperor', pa: 'Vestnik', ph: null,
      lead: { ...fact, v: 0 }, subs: [], briefs: [],
    });
    heads.add(view.lead.head);
    voiceLines.push(`  ${vo.padEnd(7)} ${view.lead.head}\n          ${view.lead.deck} ${view.lead.body}`.replaceAll('[[cut]]', '[SANSÜR]'));
  }
  if (heads.size < VOICES.length) flat++;
}
writeFileSync(join(OUT, 'sesler.txt'), `${voiceLines.join('\n')}\n`);
sub('Ses');
console.log(`  ${FIXTURES.length} olgu × ${VOICES.length} ses, manşeti sesler arasında aynı kalan olgu: ${flat}`);
if (flat) finding('MEDIUM', 'Rejim sesi manşeti değiştirmiyor', '0', String(flat));

// Rejim → ses tablosu: oyuncunun rejimi değişince gazetenin sesi de değişmeli.
const voiceTable = [
  ['absolutism', 'conservative', 'court'], ['constitutional', 'conservative', 'sober'], ['republic', 'conservative', 'free'],
  ['constitutional', 'liberal', 'free'], ['republic', 'nationalist', 'jingo'], ['absolutism', 'nationalist', 'jingo'], ['republic', 'socialist', 'labour'],
];
const wrongVoice = voiceTable.filter(([government, ruling, want]) => voiceOf({ politics: { government, ruling } }) !== want);
console.log(`  rejim → ses tablosu: ${voiceTable.length - wrongVoice.length}/${voiceTable.length} doğru`);
if (wrongVoice.length) finding('HIGH', 'Rejim sesi yanlış', 'tablo', JSON.stringify(wrongVoice));

// Aynı dünyada her ülkenin kendi gazetesi: ad ve dil ülkeye göre değişiyor mu?
const papers = game.world.nations.filter((nation) => nation.alive && nation.capital).map((nation) => paperOf(game.world, nation));
console.log(`  bu dünyada ${papers.length} ulus: ${new Set(papers.map((row) => row.paper)).size} farklı gazete adı, ${new Set(papers.map((row) => row.family)).size} dil ailesi`);

const masts = Object.keys(LEX).map((family) => `${family.padEnd(8)} ${VOICES.map((vo) => paperName(family, vo, 'Karsk', 'Vostria', 7)).join(' | ')}`);
writeFileSync(join(OUT, 'gazete-adlari.txt'), `${masts.join('\n')}\n`);

// ---------------------------------------------------------- DOĞRULAMA ---

sub('Kayıt turu');
const roundTrip = JSON.parse(JSON.stringify(press));
const again = roundTrip.issues.map(composeIssue);
const stable = JSON.stringify(again) === JSON.stringify(views);
console.log(`  kayıttan dönen arşiv aynı metni veriyor: ${stable ? 'evet' : 'HAYIR'}`);
if (!stable) finding('HIGH', 'Arşiv kayıt turunda değişiyor', 'aynı metin', 'farklı');

sub('Simülasyona dokunmuyor mu (gazeteli / gazetesiz, ayrı süreçler)');
const probe = (flag) => JSON.parse(execFileSync(process.execPath, [HERE, '--worker', SEED, String(Math.min(WEEKS, 260)), flag], { encoding: 'utf8', maxBuffer: 1 << 26 }));
const off = probe('0');
const on = probe('1');
const same = off.core === on.core && off.extended === on.extended && JSON.stringify(off.rng) === JSON.stringify(on.rng);
console.log(`  gazetesiz ${off.core} / ${off.extended}\n  gazeteli  ${on.core} / ${on.extended} (${on.issues} sayı)`);
console.log(`  parmak izi aynı: ${same ? 'evet' : 'HAYIR'}`);
if (!same) finding('CRITICAL', 'Gazete simülasyonu değiştiriyor', 'aynı parmak izi', 'farklı');

if (issues.length < YEARS * 10) finding('HIGH', 'Az sayı basıldı', `en az ${YEARS * 10}`, String(issues.length));
const ratio = leadExact.reduce((sum, [, n]) => sum + n - 1, 0) / Math.max(1, leads.length);
console.log(`\n  tekrar oranı (fazladan basılan aynı manşet / manşet): ${(ratio * 100).toFixed(1)}%`);
if (ratio > 0.05) finding('HIGH', 'Manşet tekrarı yüksek', '≤ %5', `${(ratio * 100).toFixed(1)}%`);

process.exitCode = reportFindings() ? 1 : 0;
