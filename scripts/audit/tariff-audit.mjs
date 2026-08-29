// D. GUMRUK ISTISMAR TESTI
//
// Tarife uc yerden isler: (1) ithalat istahi (settleGlobalTrade appetite),
// (2) hane sepeti ve fabrika girdi maliyeti (tariffFactor x importShare),
// (3) hazine geliri (importValue x tarife). Soru: kanallar tutarli mi, iki kez
// mi biniyor, bedava para uretiyor mu?
//
// Kaldirac HER HAFTA tazelenir: runPolitics -> applyGovernmentLimits tarifeyi
// iktidar partisinin bandina geri kirpar (bu fren olcumun kendisinde de
// dogrulanir, asagidaki "gecerli aralik" bolumune bakiniz).

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import { headless, run } from './harness.mjs';
import { setBudgetPolicy } from '../../src/game/economy.js';
import { policyOf, rulingParty } from '../../src/game/politics.js';

const SEED = 'tariff-audit';
const WARMUP = 60;
const WEEKS = 200;
const LEVELS = [-50, -15, 0, 25, 50, 100];

const runs = LEVELS.map((tariff) => ({
  tariff,
  ...runScenario({
    seed: SEED, label: `tariff${tariff}`, warmup: WARMUP, weeks: WEEKS,
    peaceful: true, nation: 'protectionist',
    // raw: politika bandini asan SINIR testi (mekanigi olcuyoruz, UI yolunu degil).
    levers: [{ key: 'tariff', value: tariff, raw: true }],
    measure: ['trade'],
  }),
}));

section('D. GUMRUK TESTI — ayni tohum, tek degisken, savassiz kosu');
sub(`${WEEKS} hafta (isitma ${WARMUP} hafta), her seviye ayri surecte`);
console.log(table(runs, [
  { label: 'tarife%', get: (r) => r.tariff },
  { label: 'gumrukGeliri', get: (r) => n2(r.snap.tariffRevenue) },
  { label: 'ithalatMiktar', get: (r) => n2(r.snap.imports) },
  { label: 'ithalatDeger', get: (r) => n2(r.snap.importValue) },
  { label: 'ihracatMiktar', get: (r) => n2(r.snap.exports) },
  { label: 'ticaretDenge', get: (r) => n2(r.snap.exportValue - r.snap.importValue) },
  { label: 'ithalPayiOrt', get: (r) => pct(r.trade.importShareAvg) },
  { label: 'girdiHam', get: (r) => n2(r.trade.inputSpend) },
  { label: 'girdiGumruklu', get: (r) => n2(r.trade.inputSpendTariffed) },
  { label: 'fabrikaKar', get: (r) => n1(r.snap.factoryProfit) },
  { label: 'ihtiyac', get: (r) => pct(r.cohorts.needsFulfilled) },
  { label: 'karsilanma', get: (r) => pct(r.trade.fulfilled) },
  { label: 'altSepet', get: (r) => n1(r.snap.lowerCost) },
  { label: 'istikrar', get: (r) => n2(r.snap.stability) },
  { label: 'gelir', get: (r) => n2(r.snap.income) },
  { label: 'gider', get: (r) => n2(r.snap.expenses) },
  { label: 'hazine', get: (r) => n0(r.snap.gold) },
  { label: 'borc', get: (r) => n0(r.snap.debt) },
]));

section('D. TANI');
const at = (t) => runs.find((r) => r.tariff === t);

// 1) Korumacilik gercekten koruyor mu
{
  const lo = at(0).snap.imports;
  const hi = at(100).snap.imports;
  console.log(`  ithalat miktari: %0 -> ${n2(lo)} · %100 -> ${n2(hi)} (${pct(relDelta(lo, hi))})`);
  if (Math.abs(relDelta(lo, hi)) < 0.05) {
    finding('HIGH', 'Tarife -> ithalat miktari', 'yuksek tarife ithalati kismali',
      'ithalat miktari degismiyor', `%0: ${n2(lo)} · %100: ${n2(hi)}`);
  } else {
    console.log('  OK  gumruk ithalat istahini gercekten kisiyor (appetite kanali canli).');
  }
}

// 2) Kimlik: gumruk geliri = ithalat degeri x tarife
{
  let worst = 0;
  for (const r of runs) {
    const expected = r.snap.importValue * (r.tariff / 100);
    worst = Math.max(worst, Math.abs(expected - r.snap.tariffRevenue));
  }
  console.log(`  kimlik kontrolu (gelir = ithalatDegeri x tarife): en kotu sapma ${n2(worst)}`);
  if (worst > 0.01) {
    finding('MEDIUM', 'Gumruk geliri kimligi', 'gelir = ithalatDegeri x tarife',
      `en kotu sapma ${n2(worst)}`, 'gumruk iki kez sayilmis ya da eksik tahsil edilmis olabilir');
  }
}

// 3) Negatif tarife gercek bir bedel mi
{
  const r = at(-50);
  const base = at(0);
  console.log(`  tarife -50%: gumruk satiri ${n2(r.snap.tariffRevenue)}/hafta,`
    + ` ithalat ${n2(r.snap.imports)} birim (%0'da ${n2(base.snap.imports)}),`
    + ` hazine ${n0(r.snap.gold)} (%0'da ${n0(base.snap.gold)}), borc ${n0(r.snap.debt)}`);
}

// 4) Sanayiye maliyeti
{
  const lo = at(0);
  const hi = at(100);
  const dCost = relDelta(lo.trade.inputSpendTariffed, hi.trade.inputSpendTariffed);
  console.log(`  fabrika girdi faturasi (gumruklu): %0 -> ${n2(lo.trade.inputSpendTariffed)}`
    + ` · %100 -> ${n2(hi.trade.inputSpendTariffed)} (${pct(dCost)})`);
  console.log(`  ortalama ithal payi: %0 -> ${pct(lo.trade.importShareAvg)}`
    + ` · %100 -> ${pct(hi.trade.importShareAvg)}`);
  if (Math.abs(dCost) < 0.03) {
    finding('MEDIUM', 'Tarife -> fabrika girdi maliyeti',
      'ithal girdiye bagimli sanayi gumrukte pahalanmali',
      `girdi faturasi farki ${pct(dCost)}`,
      'kanal kodda var (tariffFactor x importShare) ama dunya ticaret hacmi kucuk'
      + ` oldugu icin uzerinde isleyecek ithal payi yok (${pct(hi.trade.importShareAvg)})`);
  }
}

// 5) Bedava para mi
{
  const base = at(0);
  const max = at(100);
  const dGold = max.snap.gold - base.snap.gold;
  const dNeeds = max.cohorts.needsFulfilled - base.cohorts.needsFulfilled;
  const dBasket = relDelta(base.snap.lowerCost, max.snap.lowerCost);
  const dMet = max.snap.lowerMet - base.snap.lowerMet;
  console.log(`  %0 -> %100 tarife: hazine ${dGold >= 0 ? '+' : ''}${n0(dGold)},`
    + ` gumruk geliri ${n2(max.snap.tariffRevenue)}/hafta (toplam gelirin`
    + ` ${pct(max.snap.tariffRevenue / Math.max(1e-9, max.snap.income))}'i)`);
  console.log(`  hanenin odedigi bedel: sepet ${pct(dBasket)},`
    + ` karsilayabildigi oran ${(dMet * 100).toFixed(2)} puan,`
    + ` sanayi girdi faturasi ${pct(relDelta(base.trade.inputSpendTariffed, max.trade.inputSpendTariffed))}`);
  // Bedelin gorunur olmasi icin ya hane sepeti pahalanmali ya sanayi zorlanmali.
  // Buyuklugu ithal payi belirler: %4-10 bir ekonomide gumruk kucuk bir vergidir.
  if (dGold > 0 && Math.abs(dBasket) < 0.02 && Math.abs(dMet) < 0.01) {
    finding('HIGH', 'Tavan tarife bedelsiz gelir',
      'gumrugun bedeli hane sepetinde ya da sanayi girdisinde gorunmeli',
      `%100 tarife ${WEEKS} haftada hazineye ${n0(dGold)} kattı;`
      + ` hane sepeti ${pct(dBasket)}, karsilanan oran ${(dMet * 100).toFixed(2)} puan`, '');
  } else {
    console.log(`  OK  gumrugun bedeli olculebilir: hane sepeti ${pct(dBasket)} pahalandi.`);
  }
}

// 6) Politika siniri (UI yolu) gercek mi
{
  const g = headless(SEED);
  run(g, WARMUP);
  const prot = g.world.nations.find((n) => n.alive && policyOf(n, 'trade') === 'protectionism');
  const other = g.world.nations.find((n) => n.alive && n.politics && n !== prot);
  if (other) rulingParty(other).policies.trade = 'free_trade';
  const probe = (nation) => {
    if (!nation) return 'yok';
    setBudgetPolicy(nation, 'tariff', 999);
    const hi = nation.economy.tariff;
    setBudgetPolicy(nation, 'tariff', -999);
    const lo = nation.economy.tariff;
    return `${lo}..${hi}`;
  };
  console.log(`  UI yolundan gecerli aralik — korumaci: ${probe(prot)} · serbest ticaret: ${probe(other)}`);
  console.log('  NOT: yukaridaki tablo bu bandi bilerek asar (raw yazim); band gercekten uygulaniyor.');
}

process.exit(reportFindings() > 0 ? 1 : 0);
