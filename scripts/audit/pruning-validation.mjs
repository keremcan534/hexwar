// BUDAMA GECISI UZUN KOSU DOGRULAMASI
//
// Bina donusumu + yuk azaltma + kaldirac düzeltmelerinden sonra dunya sagligi:
//   - YZ yeni kapasite/kurum modeline yatirim yapiyor mu?
//   - Kapasite patliyor mu, duruyor mu?
//   - Kaleler sinira mi dikiliyor?
//   - Sohret/koalisyon freni artik ATES ALIYOR mu?
//   - Donanma 1836'dan itibaren gercekten kurulabiliyor mu?
//   - Ekonomi/politika sagligi (iflas, istikrar, fiyat tavani) geriledi mi?
//
// Kullanim: node scripts/audit/pruning-validation.mjs [quick]
//   quick: 3 tohum x 520 hafta (duman); varsayilan: 5x1300 + 3x2600 + 1x5740.

import {
  headless, section, sub, table, finding, reportFindings, n1, n0, pct,
} from './harness.mjs';
import { investmentLevel, constructionCount, constructionPower } from '../../src/game/construction.js';
import { INFAMY_COALITION } from '../../src/game/infamy.js';
import { GOODS } from '../../src/game/economy.js';

const quick = process.argv.includes('quick');
const PLANS = quick
  ? [{ weeks: 520, seeds: ['pv-1', 'pv-2', 'pv-3'] }]
  : [
    { weeks: 1300, seeds: ['pv-1', 'pv-2', 'pv-3', 'pv-4', 'pv-5'] },
    { weeks: 2600, seeds: ['pv-1', 'pv-2', 'pv-6'] },
    { weeks: 5740, seeds: ['pv-1'] },
  ];

section('BUDAMA GECISI UZUN KOSU DOGRULAMASI');

const summaryRows = [];

for (const plan of PLANS) {
  for (const seed of plan.seeds) {
    const t0 = performance.now();
    const game = headless(seed);
    const world = game.world;
    let infamyPeak = 0;
    let overThresholdWeeks = 0;
    let coalitionSeen = 0;
    let phases = 0;
    for (let week = 0; week < plan.weeks; week++) {
      game.turns.endTurn();
      phases++;
      // Haftalik ornekleme ucuz kalemlerle sinirli; agir toplulastirma yillik.
      for (const nation of world.nations) {
        if (!nation.alive) continue;
        const infamy = nation.infamy ?? 0;
        if (infamy > infamyPeak) infamyPeak = infamy;
        if (infamy >= INFAMY_COALITION) overThresholdWeeks++;
      }
      if (week % 52 === 0) {
        coalitionSeen += world.nations.filter((n) => n.alive
          && (n.infamy ?? 0) >= INFAMY_COALITION).length ? 0 : 0;
      }
    }
    const wall = (performance.now() - t0) / 1000;
    const alive = world.nations.filter((n) => n.alive && n.economy);
    const capacity = alive.map((n) => investmentLevel(n, 'CONSTRUCTION_CAPACITY'));
    const education = alive.map((n) => investmentLevel(n, 'HIGHER_EDUCATION'));
    const forts = alive.map((n) => constructionCount(n, 'FORT'));
    const powerMax = Math.max(...alive.map((n) => constructionPower(n)));
    const warships = world.units.filter((u) => u.type.domain === 'sea').length;
    const goods = Object.entries(world.market.goods);
    const ceiling = goods.filter(([id, g]) => g.price >= (GOODS[id].basePrice * 8) - 1e-9).length;
    const bankrupt = alive.filter((n) => (n.economy.creditPenalty ?? 0) > 0.3).length;
    // YZ kendi tavanini (2 + fabrika/3, bkz. planConstructionAI) asiyor mu?
    // Mutlak seviye olcut DEGIL: taban cizgide de buyuk imparatorluk 68
    // sektor biriktiriyordu ve odeyebiliyordu. Hata olan tavan ihlalidir;
    // kuyruktaki projelerin tamamlanma payi icin +2 tolerans.
    const ceilingBreach = Math.max(0, ...alive.map((n) => investmentLevel(n, 'CONSTRUCTION_CAPACITY')
      - (2 + Math.floor((n.economy.factories?.length ?? 0) / 3) + 2)));
    const stabilityAvg = alive.reduce((s, n) => s + (n.economy.stability ?? 0), 0)
      / Math.max(1, alive.length);
    const wars = alive.filter((n) => world.nations.some((o) => o.alive && o.id !== n.id
      && world.relations[n.id][o.id]?.state === 'war')).length;
    const sum = (xs) => xs.reduce((s, x) => s + x, 0);
    const row = {
      seed,
      weeks: plan.weeks,
      wall,
      weeksPerSecond: plan.weeks / wall,
      alive: alive.length,
      population: alive.reduce((s, n) => s + n.economy.population, 0),
      capacityTotal: sum(capacity),
      capacityMax: Math.max(...capacity),
      educationTotal: sum(education),
      educationMax: Math.max(...education),
      fortsTotal: sum(forts),
      powerMax,
      warships,
      infamyPeak,
      overThresholdWeeks,
      ceiling,
      bankrupt,
      ceilingBreach,
      stabilityAvg,
      wars,
    };
    summaryRows.push(row);
    console.log(`  ${seed} x${plan.weeks}hf: ${n1(wall)}s (${n1(row.weeksPerSecond)} hf/s)`
      + ` · ${alive.length} ulke · kapasite T${row.capacityTotal}/max${row.capacityMax}`
      + ` · egitim T${row.educationTotal}/max${row.educationMax} · kale ${row.fortsTotal}`
      + ` · gemi ${warships} · zirve sohret ${n1(infamyPeak)}`
      + ` · esik-ustu ${overThresholdWeeks} ulke-hafta · tavan mal ${ceiling}`);
  }
}

sub('Ozet');
console.log(table(summaryRows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'hafta', get: (r) => r.weeks },
  { label: 'sure(s)', get: (r) => n1(r.wall) },
  { label: 'hf/s', get: (r) => n1(r.weeksPerSecond) },
  { label: 'ulke', get: (r) => r.alive },
  { label: 'nufus', get: (r) => n0(r.population) },
  { label: 'kapasiteT', get: (r) => r.capacityTotal },
  { label: 'kapMax', get: (r) => r.capacityMax },
  { label: 'egitimT', get: (r) => r.educationTotal },
  { label: 'kale', get: (r) => r.fortsTotal },
  { label: 'gemi', get: (r) => r.warships },
  { label: 'zirveSohret', get: (r) => n1(r.infamyPeak) },
  { label: 'esikUstuHf', get: (r) => r.overThresholdWeeks },
  { label: 'tavanMal', get: (r) => r.ceiling },
  { label: 'iflas', get: (r) => r.bankrupt },
  { label: 'istikrar', get: (r) => pct(r.stabilityAvg) },
  { label: 'savasta', get: (r) => r.wars },
]));

// --- Sistemik saglik esikleri -----------------------------------------------
for (const row of summaryRows) {
  if (row.capacityTotal === 0) {
    finding('HIGH', `YZ kapasiteye hic yatirim yapmiyor (${row.seed})`,
      'planConstructionAI ilk seviyeyi her ulkede kurmali',
      `${row.weeks} haftada toplam kapasite 0`, '');
  }
  if (row.ceilingBreach > 0) {
    finding('MEDIUM', `Kapasite tavan ihlali (${row.seed})`,
      'YZ, planConstructionAI tavanini (2 + fabrika/3) asmamali',
      `en kotu ulke tavani ${row.ceilingBreach} seviye asiyor`, '');
  }
  if (row.warships === 0 && row.weeks >= 520) {
    finding('MEDIUM', `Donanma hic kurulmuyor (${row.seed})`,
      'yelkenli konvoy zinciriyle 1836 donanmasi mumkun olmali',
      `${row.weeks} haftada 0 gemi`, '');
  }
  if (row.weeks >= 1300 && row.infamyPeak < INFAMY_COALITION) {
    finding('LOW', `Sohret esigi hic asilmadi (${row.seed})`,
      'seri fetih coken dunyada esik ara sira dolmali (fren ates almali)',
      `${row.weeks} haftada zirve ${n1(row.infamyPeak)}/${INFAMY_COALITION}`,
      'tek kosuda dusuk zirve tek basina hata degil; genel desen izlenmeli');
  }
  if (row.bankrupt > row.alive * 0.4) {
    finding('HIGH', `Yaygin iflas (${row.seed})`,
      'degisiklikler dunya ekonomisini cokertmemeli',
      `${row.bankrupt}/${row.alive} ulke agir kredi cezasinda`, '');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
