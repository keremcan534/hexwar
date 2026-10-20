// MEKANİK SAĞLIK TARAMASI — "bu kaldıraç çalışıyor mu?" (Uluslar Çağı)
//
// Her kaldıraca aynı soru: kaldıracı uçtan uca çekince oyunda ölçülebilir bir
// şey değişiyor mu, ve bu değişim TOHUM GÜRÜLTÜSÜNÜN üstünde mi?
//
//   ÖLÜ           — hiçbir ölçüt kıpırdamadı. Mekanik yok.
//   GÜRÜLTÜ ALTI  — kıpırdadı ama tohumlar arası doğal oynamanın altında.
//   ÇALIŞIYOR     — gürültünün üstünde. Oyuncu hisseder.
//   SKIP          — kaldıracın API'si henüz yok (redesign paketi inmedi);
//                   kol koşulmaz, asla ÇALIŞIYOR basılmaz.
//   RAPOR         — eşiği yok, yalnız ölçülür (redesign §5: tier3 kolu).
//
// Yöntem: her tohumda aynı ulus için üç kol, ayrı süreçlerde, barış içinde:
// kaldıracın iki ucu ve GÜRÜLTÜ KOLU (düşük uç + kalkınma fonuna 1 IC dürtü).
// Etki tohum içi EŞLİ bağıl farktır; gürültü, dürtünün aynı ölçütü ne kadar
// oynattığıdır (kelebek etkisi). İlk sürüm etkiyi tohumlar arası yayılımla
// kıyaslıyordu: farklı tohumun "orta ulusu" farklı boydadır ve askerî IC
// 0.07 → 0.53 (7.5 kat) bile "gürültü altı" çıkıyordu — ölçü kaldıracı
// değil ülke boyunu ölçüyordu.
//
// Kaldıraç başına bir BEKLENEN ölçüt vardır (emek → çıktı, askerlik →
// insan gücü...): kaldıraç yalnız o ölçütte değerlendirilir, çünkü yan
// etkiler (uzun mesai istikrarı da düşürür) bilgidir, hüküm değil. Ek
// ölçütler (extra) yalnız basılır.
//
// Yeniden tasarım kaldıraçları (redesign §5): course, nationalities,
// grant-citizenship, war-law-lock, tier3, levee, consent. "Dünya" kaldıraçları
// (savaş yasaları) ölçütü bütün ulusların savaş haftalarından alır; onların
// kolları savaşlı koşar (barışçı koşuda savaş haftası yoktur).
//
// Kollar süreç havuzunda paralel koşar (harness.runScenariosParallel); her
// kol kendi sürecindedir, sonuç sıralı koşuyla aynıdır.
//
//   npm run audit:mechanics

import {
  runScenariosParallel, section, sub, finding, reportFindings, table, pct, skip,
} from './harness.mjs';
import * as politics from '../../src/game/politics.js';
import * as culture from '../../src/game/culture.js';
import * as mobilization from '../../src/game/mobilization.js';
import * as provinces from '../../src/game/provinces.js';

const SEEDS = ['mh1', 'mh2', 'mh3'];
const WEEKS = 104;
const WARMUP = 26;

/** Kaldıracın API'si var mı (yoksa SKIP nedeni). */
const PRESENT = {
  course: () => (typeof politics.setCourse === 'function' ? null : 'politics.setCourse yok (D4, P7)'),
  nationalities: () => (typeof culture.standingOf === 'function' ? null : 'culture.standingOf yok: milliyetler politikasi okunmuyor (D1, P4)'),
  levee: () => (mobilization.LEVEE ? null : 'mobilization.LEVEE yok (D6, P6)'),
  consent: () => (provinces.CONSENT ? null : 'provinces.CONSENT yok (D8, P9)'),
};

/** Kaldıraç → iki uç ve beklenen ölçüt. */
const LEVERS = [
  // Vergi yasasının yerine (Tek Çubuk, 2026-10-15): emek yasası çıktıyı çarpar.
  { id: 'labour', law: 'labour', lo: 0, hi: 2, metric: 'output', note: 'Ten-Hour Day vs Long Hours → output' },
  { id: 'conscription', law: 'conscription', lo: 0, hi: 3, metric: 'manpower', note: 'Volunteer vs Total → manpower' },
  // IC kaldıraçları sanayi ülkesinde ölçülür: üç tohumun ikisinde orta ulusun
  // hiç fabrikası yoktu (IC 0) — iki uç da sıfır, kaldıraç değil kanal yok.
  // Yasa ordunun ÇEKEBİLECEĞİ paydır; barışta Auto hatlar depo doluyken hiç
  // çekmez (ölçüldü: iki uçta da 0). Tüfek hattı elle High'dayken çekilen pay
  // yasanın tavanına oturur: ölçülen şey yasanın ordunun eline verdiğidir.
  { id: 'economy', law: 'economy', lo: 0, hi: 3, metric: 'militaryIC', note: 'Civilian vs Total War, rifles line High → army draw (industrial nation)', nation: 'industry', base: [{ line: 'rifles', priority: 'high' }] },
  // Tek Çubuk'ta halkın payı bir POLİTİKADIR (doyurma kolu × ihtiyaç): ordu
  // halktan ancak serbest çıktı yetmezse alır. Sanayi ülkesinde Total War
  // (sanayinin %80'i) bile kola dokunmuyor — ölçüldü, kol 1.05'te elle, tüfek
  // High: tüketim malı oranı üç tohumda iki uçta da 1.05. Yasanın bedeli artık
  // KALKINMADAN ödenir: ölçüt tüketim malı yerine yatırım payı.
  { id: 'economy-invest', law: 'economy', lo: 0, hi: 3, metric: 'invest', note: 'Civilian vs Total War, feed 1.05, rifles line High → invested output (industrial nation)', nation: 'industry', base: [{ feed: 1.05 }, { line: 'rifles', priority: 'high' }] },
  { id: 'trade', law: 'trade', lo: 0, hi: 3, metric: 'exports', note: 'Closed vs Free → export revenue (IC)' },
  { id: 'citizenship', law: 'citizenship', lo: 0, hi: 2, metric: 'unrest', note: 'Residency vs Full → unrest' },
  { id: 'education', law: 'education', lo: 0, hi: 2, metric: 'literacy', note: 'None vs Universal → literacy' },
  { id: 'rifles-line', line: 'rifles', lo: 0, hi: 10, metric: 'rifles', note: 'Rifles line 0 vs 10 → rifle stock (industrial nation)', base: [{ law: 'economy', index: 2 }], nation: 'industry' },
  // Tek kol: halkı doyurmak istikrar ve büyüme alır, kalkınmadan verir.
  { id: 'feed', feed: true, lo: 0.85, hi: 1.15, metric: 'stability', note: 'Feed 0.85 vs 1.15 (manual) → stability' },
  // Kalkınma: kademe alınamayan (donmuş) ülke ile normal ülkenin çıktısı.
  // Düşük uç dondurulmuş koldur; gürültü kolu onun üstüne dürtüdür. Yavaş
  // kaldıraçtır: ortanca (geri kalmış) ülke iki yılda 2-4 kademe alır, kademe
  // başına çıktının ~%1.5'i; donmuş kol o payı halka verip istikrar kazanır.
  // 104 haftada tohumlar +%7 / +%2 / +%1 (gürültü altı), 260 haftada
  // +%19 / +%6 / +%5 (ölçüldü 2026-10-15). 45 yılda donmuş oyuncu ×0.47 çıktı.
  { id: 'invest', mutation: 'freezeDevelopment', lo: 'frozen', hi: 'normal', metric: 'output', weeks: 260, note: 'Development frozen vs normal → output after 5 years' },

  // --- yeniden tasarım (redesign §5 tablo) ---
  // Rota (D4): köşe partinin desteği; kapı Δ ≥ +10 puan VE ≥ 2× gürültü.
  { id: 'course', kind: 'course', requires: 'course', lo: { x: -1, y: 1 }, hi: { x: 1, y: -1 }, budget: 0.30, weeks: 156, metric: 'support.nationalist', minAbs: 10, measure: ['support'], note: 'Course toward the Liberal corner vs the Nationalist corner, High funding, 156 w → nationalist support' },
  // Milliyetler (D1): 2× gürültünün altındaysa duruş SİLİNİR (redesign D1).
  { id: 'nationalities', kind: 'nationalities', requires: 'nationalities', lo: 'repress', hi: 'accommodate', weeks: 260, metric: 'stability', extra: ['subjectShare', 'peopleLost'], measure: ['peoples'], asPlayer: false, nation: 'subject-people', onFail: 'the stance is deleted (redesign D1)', note: 'Repress vs Accommodate, 260 w → stability' },
  // Hak verme: %15-25'lik tebaa halka bir kez hak, AUTO kapalı.
  { id: 'grant-citizenship', kind: 'grant', lo: 'none', hi: 'subject', weeks: 260, metric: 'output', extra: ['unrest', 'manpower'], nation: 'subject-people', note: '15–25% subject people granted vs not, 260 w → national output' },
  // Savaşta yasa kilidi (D5): dünya, savaşlı koşu.
  { id: 'war-law-lock', kind: 'warLawLock', lo: 'off', hi: 'on', weeks: 260, metric: 'extensiveAtWar', extra: ['warLengthP50'], world: true, peaceful: false, asPlayer: false, measure: ['warlaws'], note: 'War-law lock off vs on (all nations), 260 w → Extensive share of nation-war-weeks' },
  // 3. kademe eşikleri (D5): yalnız raporlanır, sınır bandı audit:borders'ta.
  { id: 'tier3', kind: 'tier3', lo: 'base', hi: 'redesign', weeks: 260, metric: 'tmTweShare', extra: ['warLengthP50', 'extensiveAtWar'], world: true, peaceful: false, asPlayer: false, measure: ['warlaws'], reportOnly: true, note: 'Tier-3 thresholds 0.8/0.7 vs 0.65/0.6 + total war (all nations), 260 w → TM+TWE share of war weeks' },
  // Call to Arms (D6): işgal edilen savunan; 2× gürültünün altındaysa levée KESİLİR.
  { id: 'levee', kind: 'levee', requires: 'levee', lo: false, hi: true, weeks: 78, metric: 'occupiedShare', extra: ['capitalHeld', 'warWeeks'], peaceful: false, asPlayer: false, mutations: [{ name: 'forceInvasion' }, { name: 'damageArmy', args: { ratio: 0.3 } }], measure: ['invasion'], onFail: 'the levée is cut (redesign D6)', note: 'Call to Arms off vs on for an invaded defender (army cut to 30%), 78 w → occupied share' },
  // Rıza ekonomisi (D8).
  { id: 'consent', kind: 'consent', requires: 'consent', lo: false, hi: true, weeks: 260, metric: 'output', nation: 'subject-people', note: 'Consent economics off vs on, 260 w → national output' },
];

/** Kolun kaldıraçları ve mutasyonları. */
function armSpec(lever, end) {
  const base = [...(lever.base ?? [])];
  const extra = [...(lever.mutations ?? [])];
  if (lever.mutation) {
    return { levers: base, mutations: [...extra, ...(end === lever.lo ? [{ name: lever.mutation }] : [])] };
  }
  if (lever.kind === 'course') return { levers: [...base, { course: end, budget: lever.budget }], mutations: extra };
  if (lever.kind) return { levers: [...base, { [lever.kind]: end }], mutations: extra };
  if (lever.law) return { levers: [...base, { law: lever.law, index: end }], mutations: extra };
  if (lever.feed) return { levers: [...base, { feed: end }], mutations: extra };
  return { levers: [...base, { line: lever.line, weight: end }], mutations: extra };
}

function metricOf(out, metric) {
  const snap = out.snap;
  switch (metric) {
    case 'output': return snap.output;
    case 'manpower': return snap.manpower;
    case 'militaryIC': return snap.militaryIC;
    case 'invest': return snap.investShare;
    case 'consumer': return snap.consumer;
    case 'exports': return snap.exportRevenue;
    case 'unrest': return out.unrest ?? 0;
    case 'literacy': return snap.literacy;
    case 'stability': return snap.stability;
    case 'rifles': return snap.stock?.rifles ?? 0;
    case 'support.nationalist': return out.support?.nationalist ?? NaN;
    case 'subjectShare': return out.peoples?.subjectShare ?? NaN;
    case 'peopleLost': return out.peoples?.lost ?? NaN;
    case 'extensiveAtWar': return out.warlaws?.extensiveAtWar ?? NaN;
    case 'tmTweShare': return out.warlaws ? (out.warlaws.tmShare + out.warlaws.tweShare) / 2 : NaN;
    case 'warLengthP50': return out.warlaws?.lengthP50 ?? NaN;
    case 'occupiedShare': return out.invasion?.occupiedShare ?? NaN;
    case 'capitalHeld': return out.invasion?.capitalHeld ?? NaN;
    case 'warWeeks': return out.invasion?.warWeeks ?? NaN;
    default: return NaN;
  }
}

section(`MEKANİK SAĞLIK — ${LEVERS.length} kaldıraç · ${SEEDS.length} tohum · ${WEEKS} hafta (varsayılan)`);

// Bütün kollar tek havuzda: kaldıraç × tohum × (düşük, yüksek, dürtülü düşük).
const nudge = { name: 'nudgeFund', args: { amount: 1 } };
const jobs = [];
const missing = new Map();
// Tek kaldıraç koşusu: LEVERS=levee,course npm run audit:mechanics
const ONLY = process.env.LEVERS ? new Set(process.env.LEVERS.split(',')) : null;
for (const lever of LEVERS) {
  if (ONLY && !ONLY.has(lever.id)) continue;
  const why = lever.requires ? PRESENT[lever.requires]() : null;
  if (why) { missing.set(lever.id, why); continue; }
  for (const seed of SEEDS) {
    for (const [end, slot, noisy] of [[lever.lo, 'lo', false], [lever.hi, 'hi', false], [lever.lo, 'nudged', true]]) {
      const { levers, mutations } = armSpec(lever, end);
      jobs.push({
        lever, seed, slot,
        spec: {
          seed, warmup: WARMUP, peacefulWarmup: lever.peaceful !== false, weeks: lever.weeks ?? WEEKS,
          peaceful: lever.peaceful !== false, asPlayer: lever.asPlayer ?? true,
          nation: lever.nation ?? 'median', levers, measure: ['unrest', ...(lever.measure ?? [])],
          mutations: noisy ? [...mutations, nudge] : mutations,
          label: `${lever.id}:${JSON.stringify(end)}${noisy ? ':nudge' : ''}`,
        },
      });
    }
  }
}
const outs = await runScenariosParallel(jobs.map((j) => j.spec));

const rows = [];
for (const lever of LEVERS) {
  if (ONLY && !ONLY.has(lever.id)) continue;
  if (missing.has(lever.id)) {
    skip(`kaldirac ${lever.id}`, missing.get(lever.id));
    rows.push({ lever, verdict: 'SKIP', lo: NaN, hi: NaN, effect: NaN, noise: NaN, floor: NaN, extra: '' });
    continue;
  }
  const arms = { lo: [], hi: [], nudged: [] };
  const extraArms = { lo: {}, hi: {} };
  jobs.forEach((job, i) => {
    if (job.lever !== lever) return;
    const out = outs[i];
    if (out.skip) throw new Error(`beklenmeyen SKIP: ${lever.id} ${out.skip}`);
    arms[job.slot].push(metricOf(out, lever.metric));
    if (job.slot !== 'nudged') {
      for (const m of lever.extra ?? []) (extraArms[job.slot][m] ??= []).push(metricOf(out, m));
    }
  });
  const { lo, hi, nudged } = arms;
  const mean = (list) => list.reduce((s, v) => s + v, 0) / list.length;
  // Tohum içi eşli bağıl fark: ölçek her tohumun kendi iki kolundan.
  const rel = (a, b) => (b - a) / Math.max(Math.abs(a), Math.abs(b), 1e-9);
  const effects = SEEDS.map((_, i) => rel(lo[i], hi[i]));
  const noises = SEEDS.map((_, i) => Math.abs(rel(lo[i], nudged[i])));
  const effect = mean(effects);
  const noise = mean(noises);
  const sameSign = effects.every((e) => Math.sign(e) === Math.sign(effect) && e !== 0);
  const dead = lo.every((v, i) => Math.abs(v - hi[i]) < 1e-9);
  // Etki dürtü gürültüsünün iki katının ve %5'in üstünde, her tohumda aynı yönde olmalı.
  const floor = Math.max(noise * 2, 0.05);
  const absDelta = mean(hi) - mean(lo);
  const absOk = lever.minAbs == null || absDelta >= lever.minAbs;
  let verdict = dead ? 'ÖLÜ' : (Math.abs(effect) >= floor && sameSign && absOk) ? 'ÇALIŞIYOR' : 'GÜRÜLTÜ ALTI';
  if (lever.reportOnly) verdict = `RAPOR (${verdict})`;
  const extra = (lever.extra ?? []).map((m) => `${m} ${mean(extraArms.lo[m]).toFixed(3)}→${mean(extraArms.hi[m]).toFixed(3)}`).join(' · ');
  rows.push({ lever, lo: mean(lo), hi: mean(hi), effect, noise, floor, sameSign, verdict, absDelta, absOk, extra, effects });
}

sub('Sonuç');
console.log(table(rows, [
  { label: 'kaldıraç', get: (r) => r.lever.id, right: false },
  { label: 'ölçüt', get: (r) => r.lever.metric, right: false },
  { label: 'düşük uç', get: (r) => (Number.isFinite(r.lo) ? r.lo.toFixed(2) : '-') },
  { label: 'yüksek uç', get: (r) => (Number.isFinite(r.hi) ? r.hi.toFixed(2) : '-') },
  { label: 'eşli etki', get: (r) => (Number.isFinite(r.effect) ? pct(r.effect) : '-') },
  // Tohum başına etki: "her tohumda aynı yön" kuralının ve yayılımın kanıtı
  // (redesign §5: her ortalama tohum yayılımıyla basılır).
  { label: 'tohum başına', get: (r) => (r.effects ? r.effects.map((e) => pct(e)).join(' ') : '-'), right: false },
  { label: 'dürtü gürültüsü', get: (r) => (Number.isFinite(r.noise) ? pct(r.noise) : '-') },
  { label: 'kat', get: (r) => (Number.isFinite(r.effect) ? (Math.abs(r.effect) / r.floor).toFixed(2) : '-') },
  { label: 'hüküm', get: (r) => r.verdict, right: false },
]));
for (const row of rows.filter((r) => r.extra)) console.log(`  ${row.lever.id} ek ölçütler (düşük→yüksek): ${row.extra}`);

for (const row of rows) {
  if (row.verdict === 'ÖLÜ') {
    finding('HIGH', `${row.lever.id} ölü`, row.lever.note, 'iki uç birebir aynı', row.lever.onFail ? `aksi hâlde ${row.lever.onFail}` : '');
  } else if (row.verdict === 'GÜRÜLTÜ ALTI') {
    finding('MEDIUM', `${row.lever.id} hissedilmiyor`, row.lever.note,
      `eşli etki ${pct(row.effect)}, eşik ${pct(row.floor)}${row.sameSign ? '' : ', tohumlar arasında yön tutarsız'}`
      + `${row.absOk === false ? `, mutlak fark ${row.absDelta.toFixed(1)} < ${row.lever.minAbs}` : ''}`,
      row.lever.onFail ? `aksi hâlde ${row.lever.onFail}` : '');
  }
}
const counted = rows.filter((r) => r.verdict !== 'SKIP' && !r.verdict.startsWith('RAPOR'));
const working = counted.filter((r) => r.verdict === 'ÇALIŞIYOR').length;
console.log(`\n  ${counted.length} kaldıraç · çalışıyor ${working} · gürültü altı ${counted.filter((r) => r.verdict === 'GÜRÜLTÜ ALTI').length}`
  + ` · ölü ${counted.filter((r) => r.verdict === 'ÖLÜ').length} · rapor ${rows.filter((r) => r.verdict.startsWith('RAPOR')).length}`
  + ` · atlanan ${rows.filter((r) => r.verdict === 'SKIP').length}`);
process.exitCode = reportFindings() ? 1 : 0;
