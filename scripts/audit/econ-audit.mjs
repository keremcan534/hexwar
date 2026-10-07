// EKONOMİ DENETİMİ — Uluslar Çağı değişmezleri ve sağlığı (TASARIM.md §17).
//
// İki katman:
//   DEĞİŞMEZ  her hafta harness.scanInvariants: defter kapanır (unreconciled
//             0), dünya ticareti kapanır (Σ ithalat = Σ ihracat), oran [0,1],
//             stok/nüfus/borç negatif değil, NaN yok. İhlal = CRITICAL.
//   SAĞLIK    ekonominin oynanabilir aralıkta kalması: iflas sıklığı, altın
//             birikimi (harcanacak yer kalmadı mı?), SG tavana yapışması,
//             kaynak kıtlığının yaygınlığı, fiyatların banda çakılması.
//
//   npm run audit:econ            (3 tohum × 520 hafta)
//   npm run audit:econ -- 1040    (hafta sayısı)

import { headless, scanInvariants, section, sub, finding, reportFindings, table, pct } from './harness.mjs';
import { RESOURCE_IDS } from '../../src/game/econ/defs.js';
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
  violations: [], nationWeeks: 0, bankruptcies: [], ppCapped: 0, short: {}, floor: {}, ceiling: {},
  priceWeeks: 0, consumerLow: 0, foodFamine: 0,
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
      if (e.justBankrupt === world.turn) {
        totals.bankruptcies.push({
          seed, turn: world.turn, nation: nation.name, atWar: (e.warFronts ?? 0) > 0,
          income: e.ledger?.income ?? 0, net: e.ledger?.net ?? 0, regiments: world.units.filter((u) => u.nationId === nation.id).length,
        });
      }
      if ((nation.power ?? 0) >= POWER_CAP - 1) totals.ppCapped++;
      if ((e.consumer?.ratio ?? 1) < 0.85) totals.consumerLow++;
      if ((e.resources?.FOOD?.ratio ?? 1) < 0.7) totals.foodFamine++;
      for (const id of RESOURCE_IDS) {
        const r = e.resources?.[id];
        if (r && r.need > 0.05 && r.ratio < 0.8) totals.short[id]++;
      }
    }
    totals.priceWeeks++;
    for (const id of RESOURCE_IDS) {
      const base = { FOOD: 1, COAL: 1.6, IRON: 2, TIMBER: 1.2, HORSES: 2.2, SALTPETER: 3 }[id];
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
  endRows.push({
    seed,
    alive: alive.length,
    goldP50: quantile(alive.map((n) => n.gold), 0.5),
    goldP90: quantile(alive.map((n) => n.gold), 0.9),
    incomeP50: quantile(alive.map((n) => n.economy.ledger?.income ?? 0), 0.5),
    icP50: quantile(alive.map((n) => n.economy.ic?.total ?? 0), 0.5),
    stabP50: quantile(alive.map((n) => n.stability), 0.5),
    debtors: alive.filter((n) => (n.debt ?? 0) > 0).length,
    ms: (performance.now() - t0) / WEEKS,
  });
}

sub('Dünya sonu (tohum başına)');
console.log(table(endRows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'canlı', get: (r) => r.alive },
  { label: 'altın p50', get: (r) => r.goldP50.toFixed(0) },
  { label: 'altın p90', get: (r) => r.goldP90.toFixed(0) },
  { label: 'gelir p50', get: (r) => r.incomeP50.toFixed(1) },
  { label: 'IC p50', get: (r) => r.icP50.toFixed(1) },
  { label: 'istikrar p50', get: (r) => pct(r.stabP50) },
  { label: 'borçlu', get: (r) => r.debtors },
  { label: 'ms/hafta', get: (r) => r.ms.toFixed(1) },
]));

sub('Değişmezler');
if (!totals.violations.length) console.log('  İhlal yok.');
for (const v of totals.violations.slice(0, 20)) {
  finding('CRITICAL', `Değişmez ihlali: ${v.system}.${v.field}`, 'her hafta geçerli olmalı',
    `${v.value}`, `tohum ${v.seed}, hafta ${v.turn}, ulus ${v.nationId} ${v.note ?? ''}`);
}

sub('Sağlık');
const years = totals.nationWeeks / 52;
const bankruptRate = totals.bankruptcies.length / Math.max(1, years);
console.log(`  İflas: ${totals.bankruptcies.length} (ulus-yıl başına ${bankruptRate.toFixed(3)}); savaşta ${totals.bankruptcies.filter((b) => b.atWar).length}`);
for (const b of totals.bankruptcies.slice(0, 8)) {
  console.log(`    ${b.seed} T${b.turn} ${b.nation}${b.atWar ? ' (savaşta)' : ''}: gelir ${b.income.toFixed(1)}, net ${b.net.toFixed(1)}, ${b.regiments} tümen`);
}
if (bankruptRate > 0.03) {
  finding('MEDIUM', 'İflas sık', 'ulus-yıl başına ≤ 0.03 (iflas istisna olmalı)', bankruptRate.toFixed(3));
}
const capped = totals.ppCapped / totals.nationWeeks;
console.log(`  SG tavanda (${POWER_CAP}): ulus-haftaların ${pct(capped)}`);
if (capped > 0.15) finding('MEDIUM', 'SG tavana yapışıyor', 'ulus-haftaların ≤ %15', pct(capped), 'harcanacak karar azsa SG değersizleşir');
const glut = endRows.filter((r) => r.goldP50 > 3000).length;
if (glut) finding('MEDIUM', 'Altın birikiyor', `medyan hazine ${WEEKS} hafta sonunda ≤ 3000`, `${glut} tohumda aşıldı`);
console.log(`  Tüketim malı < %85: ulus-haftaların ${pct(totals.consumerLow / totals.nationWeeks)} · kıtlık (gıda < %70): ${pct(totals.foodFamine / totals.nationWeeks)}`);
if (totals.foodFamine / totals.nationWeeks > 0.05) {
  finding('MEDIUM', 'Kıtlık yaygın', 'ulus-haftaların ≤ %5', pct(totals.foodFamine / totals.nationWeeks));
}
const resRows = RESOURCE_IDS.map((id) => ({
  id,
  short: totals.short[id] / totals.nationWeeks,
  floor: totals.floor[id] / totals.priceWeeks,
  ceiling: totals.ceiling[id] / totals.priceWeeks,
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
