// MEKANİK SAĞLIK TARAMASI — "bu kaldıraç çalışıyor mu?" (Uluslar Çağı)
//
// Her kaldıraca aynı soru: kaldıracı uçtan uca çekince oyunda ölçülebilir bir
// şey değişiyor mu, ve bu değişim TOHUM GÜRÜLTÜSÜNÜN üstünde mi?
//
//   ÖLÜ           — hiçbir ölçüt kıpırdamadı. Mekanik yok.
//   GÜRÜLTÜ ALTI  — kıpırdadı ama tohumlar arası doğal oynamanın altında.
//   ÇALIŞIYOR     — gürültünün üstünde. Oyuncu hisseder.
//
// Yöntem: her tohumda aynı ulus için üç kol, ayrı süreçlerde, barış içinde:
// kaldıracın iki ucu ve GÜRÜLTÜ KOLU (düşük uç + hazineye 1 altın dürtü).
// Etki tohum içi EŞLİ bağıl farktır; gürültü, dürtünün aynı ölçütü ne kadar
// oynattığıdır (kelebek etkisi). İlk sürüm etkiyi tohumlar arası yayılımla
// kıyaslıyordu: farklı tohumun "orta ulusu" farklı boydadır ve askerî IC
// 0.07 → 0.53 (7.5 kat) bile "gürültü altı" çıkıyordu — ölçü kaldıracı
// değil ülke boyunu ölçüyordu.
//
// Kaldıraç başına bir BEKLENEN ölçüt vardır (vergi → hazine, askerlik →
// insan gücü...): kaldıraç yalnız o ölçütte değerlendirilir, çünkü yan
// etkiler (vergi istikrarı da düşürür) bilgidir, hüküm değil.
//
//   npm run audit:mechanics

import { runScenario, section, sub, finding, reportFindings, table, pct } from './harness.mjs';

const SEEDS = ['mh1', 'mh2', 'mh3'];
const WEEKS = 104;
const WARMUP = 26;

/** Kaldıraç → iki uç ve beklenen ölçüt. */
const LEVERS = [
  { id: 'tax', law: 'tax', lo: 0, hi: 2, metric: 'gold', note: 'Low vs High Taxes → treasury' },
  { id: 'conscription', law: 'conscription', lo: 0, hi: 3, metric: 'manpower', note: 'Volunteer vs Total → manpower' },
  // IC kaldıraçları sanayi ülkesinde ölçülür: üç tohumun ikisinde orta ulusun
  // hiç fabrikası yoktu (IC 0) — iki uç da sıfır, kaldıraç değil kanal yok.
  { id: 'economy', law: 'economy', lo: 0, hi: 3, metric: 'militaryIC', note: 'Civilian vs Total War → military IC (industrial nation)', nation: 'industry' },
  // Tüketim malı bedeli SANAYİ ülkesinde ısırır: tarım ülkesinin rafını el
  // tezgâhı doldurur (TASARIM.md §5), orta ulusta fark tasarım gereği küçük.
  { id: 'economy-consumer', law: 'economy', lo: 0, hi: 3, metric: 'consumer', note: 'Civilian vs Total War → consumer goods (industrial nation)', nation: 'industry' },
  { id: 'trade', law: 'trade', lo: 0, hi: 3, metric: 'exports', note: 'Closed vs Free → export income' },
  { id: 'citizenship', law: 'citizenship', lo: 0, hi: 2, metric: 'unrest', note: 'Residency vs Full → unrest' },
  { id: 'education', law: 'education', lo: 0, hi: 2, metric: 'literacy', note: 'None vs Universal → literacy' },
  { id: 'rifles-line', line: 'rifles', lo: 0, hi: 10, metric: 'rifles', note: 'Rifles line 0 vs 10 → rifle stock (industrial nation)', base: [{ law: 'economy', index: 2 }], nation: 'industry' },
];

function leverSpec(lever, value) {
  if (lever.law) return [...(lever.base ?? []), { law: lever.law, index: value }];
  return [...(lever.base ?? []), { line: lever.line, weight: value }];
}

function metricOf(out, metric) {
  const snap = out.snap;
  switch (metric) {
    case 'gold': return snap.gold - snap.debt;
    case 'manpower': return snap.manpower;
    case 'militaryIC': return snap.militaryIC;
    case 'consumer': return snap.consumer;
    case 'exports': return snap.exportRevenue;
    case 'unrest': return out.unrest ?? 0;
    case 'literacy': return snap.literacy;
    case 'rifles': return snap.stock?.rifles ?? 0;
    default: return NaN;
  }
}

section(`MEKANİK SAĞLIK — ${LEVERS.length} kaldıraç · ${SEEDS.length} tohum · ${WEEKS} hafta`);

const rows = [];
for (const lever of LEVERS) {
  const lo = [];
  const hi = [];
  const nudged = [];
  const arms = [[lever.lo, lo, []], [lever.hi, hi, []], [lever.lo, nudged, [{ name: 'nudgeGold', args: { amount: 1 } }]]];
  for (const seed of SEEDS) {
    for (const [end, list, mutations] of arms) {
      const out = runScenario({
        seed, warmup: WARMUP, peacefulWarmup: true, weeks: WEEKS, peaceful: true,
        nation: lever.nation ?? 'median', levers: leverSpec(lever, end), measure: ['unrest'],
        mutations, label: `${lever.id}:${end}${mutations.length ? ':nudge' : ''}`,
      });
      list.push(metricOf(out, lever.metric));
    }
  }
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
  const verdict = dead ? 'ÖLÜ' : (Math.abs(effect) >= floor && sameSign) ? 'ÇALIŞIYOR' : 'GÜRÜLTÜ ALTI';
  rows.push({ lever, lo: mean(lo), hi: mean(hi), effect, noise, floor, sameSign, verdict });
}

sub('Sonuç');
console.log(table(rows, [
  { label: 'kaldıraç', get: (r) => r.lever.id, right: false },
  { label: 'ölçüt', get: (r) => r.lever.metric, right: false },
  { label: 'düşük uç', get: (r) => r.lo.toFixed(2) },
  { label: 'yüksek uç', get: (r) => r.hi.toFixed(2) },
  { label: 'eşli etki', get: (r) => pct(r.effect) },
  { label: 'dürtü gürültüsü', get: (r) => pct(r.noise) },
  { label: 'kat', get: (r) => (Math.abs(r.effect) / r.floor).toFixed(2) },
  { label: 'hüküm', get: (r) => r.verdict, right: false },
]));

for (const row of rows) {
  if (row.verdict === 'ÖLÜ') {
    finding('HIGH', `${row.lever.id} ölü`, row.lever.note, 'iki uç birebir aynı');
  } else if (row.verdict === 'GÜRÜLTÜ ALTI') {
    finding('MEDIUM', `${row.lever.id} hissedilmiyor`, row.lever.note,
      `eşli etki ${pct(row.effect)}, eşik ${pct(row.floor)}${row.sameSign ? '' : ', tohumlar arasında yön tutarsız'}`);
  }
}
const working = rows.filter((r) => r.verdict === 'ÇALIŞIYOR').length;
console.log(`\n  ${rows.length} kaldıraç · çalışıyor ${working} · gürültü altı ${rows.filter((r) => r.verdict === 'GÜRÜLTÜ ALTI').length} · ölü ${rows.filter((r) => r.verdict === 'ÖLÜ').length}`);
process.exitCode = reportFindings() ? 1 : 0;
