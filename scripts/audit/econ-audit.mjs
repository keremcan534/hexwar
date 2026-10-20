// EKONOMİ DENETİMİ — Tek Çubuk değişmezleri ve sağlığı (TASARIM.md §17).
//
// İki katman:
//   DEĞİŞMEZ  her hafta harness.scanInvariants: çubuk kapanır (çıktı =
//             faturalar + ordu + halk + kalkınma), faturalar tavanı aşmaz,
//             fon defteri kapanır (unreconciled 0), dünya ticareti miktarda
//             ve değerde kapanır, oran [0,1], kalkınma/kale tam sayı, NaN
//             yok. İhlal = CRITICAL.
//   SAĞLIK    ekonominin oynanabilir aralıkta kalması: ikmal krizinin
//             sıklığı (barışta istisna, savaşta bedel), fonun tabana
//             yapışması, barışta halkın aç kalması, kıtlık, SG tavanı,
//             fiyatların banda çakılması.
//
//   npm run audit:econ            (3 tohum × 520 hafta)
//   npm run audit:econ -- 1040    (hafta sayısı)

import { headless, scanInvariants, section, sub, finding, reportFindings, table, pct } from './harness.mjs';
import { RESOURCES, RESOURCE_IDS } from '../../src/game/econ/defs.js';
import { fundFloor } from '../../src/game/econ/investment.js';
import { inSupplyCrisis } from '../../src/game/econ/bills.js';
import { POWER_CAP } from '../../src/game/politics.js';

const WEEKS = Number(process.argv[2] ?? 520);
const SEEDS = ['ec1', 'ec2', 'ec3'];

const quantile = (list, q) => {
  if (!list.length) return NaN;
  const sorted = [...list].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
};

section(`EKONOMİ DENETİMİ — ${SEEDS.length} tohum × ${WEEKS} hafta`);

const totals = {
  violations: [], nationWeeks: 0, peaceWeeks: 0, warWeeks: 0, crisisPeace: 0, crisisWar: 0,
  fundPinned: 0, ppCapped: 0, short: {}, floor: {}, ceiling: {},
  priceWeeks: 0, consumerLowPeace: 0, foodFamine: 0,
  // Ulus-hafta örnekleri: çubuğun tipik paylaşımı (ortanca).
  output: [], billsShare: [], armyShare: [], peopleShare: [], investShare: [],
};
for (const id of RESOURCE_IDS) { totals.short[id] = 0; totals.floor[id] = 0; totals.ceiling[id] = 0; }
const endRows = [];

for (const seed of SEEDS) {
  const game = headless(seed);
  const world = game.world;
  const seen = new Set();
  const t0 = performance.now();
  for (let week = 1; week <= WEEKS; week++) {
    game.turns.endTurn();
    for (const v of scanInvariants(world)) {
      const key = `${v.system}|${v.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      totals.violations.push({ seed, ...v });
    }
    for (const nation of world.nations) {
      if (!nation.alive || !nation.economy) continue;
      const e = nation.economy;
      totals.nationWeeks++;
      const war = e.bills?.atWar ?? (e.warFronts ?? 0) > 0;
      const crisis = inSupplyCrisis(nation);
      if (war) {
        totals.warWeeks++;
        if (crisis) totals.crisisWar++;
      } else {
        totals.peaceWeeks++;
        if (crisis) totals.crisisPeace++;
        // Barışta halkın payı bir politikadır (kol × ihtiyaç); oran ancak
        // serbest çıktı kolu karşılamazsa 0.85'in altına iner.
        if ((e.consumer?.ratio ?? 1) < 0.85) totals.consumerLowPeace++;
      }
      // Taban: tek seferlik alım ve ithalat durur. %1 pay: taban çıktı
      // ortalamasıyla kayar, tam eşitlik nadiren yakalanır.
      const floor = fundFloor(nation);
      if (floor < 0 && (nation.fund ?? 0) <= floor * 0.99) totals.fundPinned++;
      if ((nation.power ?? 0) >= POWER_CAP - 1) totals.ppCapped++;
      if ((e.resources?.FOOD?.ratio ?? 1) < 0.7) totals.foodFamine++;
      for (const id of RESOURCE_IDS) {
        const r = e.resources?.[id];
        if (r && r.need > 0.05 && r.ratio < 0.8) totals.short[id]++;
      }
      const a = e.alloc;
      if (a && a.output > 0) {
        totals.output.push(a.output);
        totals.billsShare.push(a.bills / a.output);
        totals.armyShare.push(a.army / a.output);
        totals.peopleShare.push(a.people / a.output);
        totals.investShare.push(a.invest / a.output);
      }
    }
    totals.priceWeeks++;
    for (const id of RESOURCE_IDS) {
      // Taban fiyat tanımdan: elle yazılmış tablo petrol ve kauçuğu hiç saymıyordu.
      const base = RESOURCES[id].price;
      const ratio = world.market.prices[id] / base;
      if (ratio <= 0.62) totals.floor[id]++;
      if (ratio >= 1.95) totals.ceiling[id]++;
    }
  }
  const alive = world.nations.filter((n) => n.alive && n.economy);
  const supply = {};
  for (const id of RESOURCE_IDS) {
    const produced = alive.reduce((s, n) => s + (n.economy.resources[id]?.produced ?? 0), 0);
    const need = alive.reduce((s, n) => s + (n.economy.resources[id]?.need ?? 0), 0);
    supply[id] = need > 0 ? produced / need : Infinity;
  }
  console.log(`  ${seed} dünya arz/ihtiyaç: ${RESOURCE_IDS.map((id) => `${id} ${Number.isFinite(supply[id]) ? supply[id].toFixed(2) : '∞'}`).join(' · ')}`);
  const share = (key) => quantile(alive.map((n) => {
    const a = n.economy.alloc;
    return a && a.output > 0 ? a[key] / a.output : 0;
  }), 0.5);
  endRows.push({
    seed,
    alive: alive.length,
    outputP50: quantile(alive.map((n) => n.economy.ic?.output ?? 0), 0.5),
    icP50: quantile(alive.map((n) => n.economy.ic?.total ?? 0), 0.5),
    // Fon, haftalık çıktının katı olarak: mutlak IC ülke boyunu ölçer.
    fundWeeksP50: quantile(alive.map((n) => (n.fund ?? 0) / Math.max(1, n.economy.outputAvg ?? 0)), 0.5),
    devP50: quantile(alive.map((n) => n.economy.development ?? 1), 0.5),
    bills: share('bills'),
    people: share('people'),
    invest: share('invest'),
    stabP50: quantile(alive.map((n) => n.stability), 0.5),
    crisis: alive.filter(inSupplyCrisis).length,
    ms: (performance.now() - t0) / WEEKS,
  });
}

sub('Dünya sonu (tohum başına)');
console.log(table(endRows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'canlı', get: (r) => r.alive },
  { label: 'çıktı p50', get: (r) => r.outputP50.toFixed(1) },
  { label: 'sanayi p50', get: (r) => r.icP50.toFixed(1) },
  { label: 'fon/hafta p50', get: (r) => r.fundWeeksP50.toFixed(1) },
  { label: 'kalkınma p50', get: (r) => r.devP50.toFixed(2) },
  { label: 'fatura', get: (r) => pct(r.bills) },
  { label: 'halk', get: (r) => pct(r.people) },
  { label: 'kalkınma payı', get: (r) => pct(r.invest) },
  { label: 'istikrar p50', get: (r) => pct(r.stabP50) },
  { label: 'krizde', get: (r) => r.crisis },
  { label: 'ms/hafta', get: (r) => r.ms.toFixed(1) },
]));

sub('Değişmezler');
if (!totals.violations.length) console.log('  İhlal yok.');
for (const v of totals.violations.slice(0, 20)) {
  finding('CRITICAL', `Değişmez ihlali: ${v.system}.${v.field}`, 'her hafta geçerli olmalı',
    `${v.value}`, `tohum ${v.seed}, hafta ${v.turn}, ulus ${v.nationId} ${v.note ?? ''}`);
}

sub('Sağlık');
const of = (n, d) => n / Math.max(1, d);
const med = (list) => quantile(list, 0.5);
console.log(`  Çubuk ortancası (ulus-hafta): çıktı ${med(totals.output).toFixed(1)} IC · faturalar ${pct(med(totals.billsShare))}`
  + ` · ordu ${pct(med(totals.armyShare))} · halk ${pct(med(totals.peopleShare))} · kalkınma ${pct(med(totals.investShare))}`);
const crisisPeace = of(totals.crisisPeace, totals.peaceWeeks);
const crisisWar = of(totals.crisisWar, totals.warWeeks);
console.log(`  İkmal krizi: barış ulus-haftalarının ${pct(crisisPeace)} (${totals.peaceWeeks}) · savaşınkilerin ${pct(crisisWar)} (${totals.warWeeks})`);
// İflasın yerine kriz: barışta istisna, savaşta ordunun gerçek bedeli.
if (crisisPeace > 0.005) finding('MEDIUM', 'Barışta ikmal krizi', 'barış ulus-haftalarının ≤ %0.5', pct(crisisPeace), 'faturalar barışta çıktının %60\'ını geçmemeli');
if (crisisWar > 0.10) finding('MEDIUM', 'Savaşta ikmal krizi sık', 'savaş ulus-haftalarının ≤ %10', pct(crisisWar), 'savaş ordusu ekonomiyi tavana dayamamalı');
const pinned = of(totals.fundPinned, totals.nationWeeks);
console.log(`  Fon tabanda: ulus-haftaların ${pct(pinned)}`);
if (pinned > 0.01) finding('MEDIUM', 'Fon tabana yapışıyor', 'ulus-haftaların ≤ %1', pct(pinned), 'tabanda ithalat ve tek seferlik alım durur');
const capped = of(totals.ppCapped, totals.nationWeeks);
console.log(`  SG tavanda (${POWER_CAP}): ulus-haftaların ${pct(capped)}`);
if (capped > 0.15) finding('MEDIUM', 'SG tavana yapışıyor', 'ulus-haftaların ≤ %15', pct(capped), 'harcanacak karar azsa SG değersizleşir');
const consumerLow = of(totals.consumerLowPeace, totals.peaceWeeks);
const famine = of(totals.foodFamine, totals.nationWeeks);
console.log(`  Barışta tüketim malı < %85: barış ulus-haftalarının ${pct(consumerLow)} · kıtlık (gıda < %70): ${pct(famine)}`);
if (consumerLow > 0.10) finding('MEDIUM', 'Barışta halk aç', 'barış ulus-haftalarının ≤ %10', pct(consumerLow), 'serbest çıktı doyurma kolunu karşılamıyor');
if (famine > 0.05) finding('MEDIUM', 'Kıtlık yaygın', 'ulus-haftaların ≤ %5', pct(famine));
const resRows = RESOURCE_IDS.map((id) => ({
  id,
  short: of(totals.short[id], totals.nationWeeks),
  floor: of(totals.floor[id], totals.priceWeeks),
  ceiling: of(totals.ceiling[id], totals.priceWeeks),
}));
console.log(table(resRows, [
  { label: 'kaynak', get: (r) => r.id, right: false },
  { label: 'kıt (<%80) ulus-hafta', get: (r) => pct(r.short) },
  { label: 'fiyat tabanda', get: (r) => pct(r.floor) },
  { label: 'fiyat tavanda', get: (r) => pct(r.ceiling) },
]));
for (const row of resRows) {
  // Güherçile barışta değersizdir (yalnız muharebe yakar): tasarım gereği.
  if (row.id === 'SALTPETER') continue;
  if (row.floor > 0.8) finding('LOW', `${row.id} fiyatı tabana çakılı`, 'fiyat ticaret sinyali taşımalı', `haftaların ${pct(row.floor)}`, 'arz talebin çok üstünde: kaynak değersiz');
  if (row.ceiling > 0.8) finding('LOW', `${row.id} fiyatı tavana çakılı`, 'fiyat ticaret sinyali taşımalı', `haftaların ${pct(row.ceiling)}`, 'dünya arzı yapısal olarak kıt');
}
process.exitCode = reportFindings() ? 1 : 0;
