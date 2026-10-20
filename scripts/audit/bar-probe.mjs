// ÇUBUK SONDASI — Tek Çubuk ekonomisinin yıl yıl dünya kesiti (TASARIM §5-§7).
//
// Kalibrasyon için hızlı döngü: her yıl dünya medyanı ve uçları — çıktı,
// payların dağılımı (faturalar / ordu / halk / kalkınma), tüketim malı,
// ikmal krizi, kalkınma, fon, ordu boyu, savaş payı ve fiyatların tabana
// yapışması. Bulgu basmaz; sayı basar.
//
//   node scripts/audit/bar-probe.mjs [tohum] [yıl] [büyük]
//   büyük = 1 → 160×96 standart dünya (varsayılan 78×62)

import { headless } from './harness.mjs';
import {
  DEPOSIT_DEV, DEPOSIT_OUTPUT, INVEST, INVEST_MATERIALS, RESOURCE_IDS, TRADE, RESOURCES,
} from '../../src/game/econ/defs.js';
import { atWar } from '../../src/game/diplomacy.js';
import { yearOfTurn } from '../../src/game/calendar.js';
import { developmentCap } from '../../src/game/econ/investment.js';

const SEED = process.argv[2] ?? 'BAR1';
const YEARS = Number(process.argv[3] ?? 10);
const BIG = process.argv[4] === '1';
// Kalibrasyon kolları (ortam değişkeni): INVEST_COST, INVEST_EXP, MAT_TIMBER,
// MAT_IRON, DEP_BASE, DEP_PER, DEP_HORSES. Ürün sabitlerine dokunmadan dener.
const env = process.env;
if (env.INVEST_COST) INVEST.cost = Number(env.INVEST_COST);
if (env.INVEST_EXP) INVEST.exponent = Number(env.INVEST_EXP);
if (env.MAT_TIMBER) INVEST_MATERIALS.TIMBER = Number(env.MAT_TIMBER);
if (env.MAT_IRON) INVEST_MATERIALS.IRON = Number(env.MAT_IRON);
if (env.DEP_BASE) DEPOSIT_DEV.base = Number(env.DEP_BASE);
if (env.DEP_PER) DEPOSIT_DEV.perDev = Number(env.DEP_PER);
if (env.DEP_HORSES) DEPOSIT_OUTPUT.HORSES = Number(env.DEP_HORSES);
const game = headless(SEED, BIG ? { cols: 160, rows: 96 } : {});
const world = game.world;
const q = (list, p) => {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))];
};
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '-');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');
const pc = (v) => `${Math.round(v * 100)}%`;

let crisisWeeks = 0;
let crisisWarWeeks = 0;
let warNationWeeks = 0;
let nationWeeks = 0;
let floorWeeks = 0;
let consumerLow = 0;
let peaceWeeks = 0;
const priceFloor = Object.fromEntries(RESOURCE_IDS.map((id) => [id, 0]));
let weeks = 0;

console.log(`ÇUBUK SONDASI ${SEED} ${BIG ? '160x96' : '78x62'} ${YEARS} yıl · bedel ${INVEST.cost} × L^${INVEST.exponent} · malzeme T${INVEST_MATERIALS.TIMBER} I${INVEST_MATERIALS.IRON} · yatak ${DEPOSIT_DEV.base}+${DEPOSIT_DEV.perDev}`);
console.log('yıl   ulus  çıktı p50/max   fatura ordu  halk  kalkın | tük.malı p10/p50 | kriz | kalk.ort cap | fon/çıktı | alay p50 | savaş');
for (let year = 0; year < YEARS; year++) {
  for (let w = 0; w < 52; w++) {
    game.turns.endTurn();
    weeks++;
    for (const id of RESOURCE_IDS) {
      if ((world.market?.prices?.[id] ?? 0) <= RESOURCES[id].price * TRADE.minPrice * 1.02) priceFloor[id]++;
    }
    for (const nation of world.nations) {
      if (!nation.alive || !nation.economy?.alloc) continue;
      nationWeeks++;
      const war = (nation.economy.warFronts ?? 0) > 0;
      const crisis = (nation.economy.bills?.s ?? 1) < 1 - 1e-6;
      if (crisis) crisisWeeks++;
      if (war) {
        warNationWeeks++;
        if (crisis) crisisWarWeeks++;
      } else {
        peaceWeeks++;
        if ((nation.economy.consumer?.ratio ?? 1) < 0.85) consumerLow++;
      }
      if ((nation.fund ?? 0) <= -4 * (nation.economy.outputAvg ?? 0) + 1e-6) floorWeeks++;
    }
  }
  const rows = world.nations.filter((n) => n.alive && n.economy?.alloc);
  const shares = (key) => rows.map((n) => n.economy.alloc[key] / Math.max(1e-9, n.economy.alloc.output));
  const out = rows.map((n) => n.economy.alloc.output);
  const cons = rows.map((n) => n.economy.consumer?.ratio ?? 1);
  const dev = rows.map((n) => n.economy.development ?? 1);
  const capShare = rows.map((n) => {
    const cap = developmentCap(n);
    let at = 0;
    let all = 0;
    for (const p of world.provinces) {
      if (p.owner !== n.id || !p.econ) continue;
      all++;
      if (p.econ.development >= cap) at++;
    }
    return all ? at / all : 0;
  });
  const fund = rows.map((n) => (n.fund ?? 0) / Math.max(1, n.economy.outputAvg ?? 1));
  const regs = rows.map((n) => world.units.filter((u) => u.nationId === n.id && u.type.domain === 'land')
    .reduce((s, u) => s + (u.regiments?.length ?? 1), 0));
  const atWarShare = rows.filter((n) => (n.economy.warFronts ?? 0) > 0).length / Math.max(1, rows.length);
  const crisisNow = rows.filter((n) => (n.economy.bills?.s ?? 1) < 1 - 1e-6).length;
  console.log(`${yearOfTurn(world.turn)}  ${String(rows.length).padStart(3)}  ${f1(q(out, 0.5)).padStart(6)}/${f1(q(out, 1)).padStart(6)}  `
    + `${pc(q(shares('bills'), 0.5)).padStart(5)} ${pc(q(shares('army'), 0.5)).padStart(4)} ${pc(q(shares('people'), 0.5)).padStart(5)} ${pc(q(shares('invest'), 0.5)).padStart(5)}  | `
    + `${f2(q(cons, 0.1))}/${f2(q(cons, 0.5))}        | ${String(crisisNow).padStart(3)}  | ${f2(q(dev, 0.5))} ${pc(q(capShare, 0.5))}     | ${f2(q(fund, 0.5))}      | ${String(q(regs, 0.5)).padStart(4)}     | ${pc(atWarShare)}`);
}
console.log(`\nikmal krizi: ulus-haftaların ${pc(crisisWeeks / Math.max(1, nationWeeks))}; savaşta ${pc(crisisWarWeeks / Math.max(1, warNationWeeks))}, barışta ${pc((crisisWeeks - crisisWarWeeks) / Math.max(1, nationWeeks - warNationWeeks))}`);
console.log(`fon tabanda: ${pc(floorWeeks / Math.max(1, nationWeeks))}; barışta tüketim malı <0.85: ${pc(consumerLow / Math.max(1, peaceWeeks))}`);
console.log(`fiyat tabanda (haftaların payı): ${RESOURCE_IDS.map((id) => `${id} ${pc(priceFloor[id] / weeks)}`).join(' · ')}`);
const prices = RESOURCE_IDS.map((id) => `${id} ${f2((world.market.prices[id] ?? 0) / RESOURCES[id].price)}×`).join(' · ');
console.log(`son fiyatlar (taban katı): ${prices}`);
const bal = RESOURCE_IDS.map((id) => `${id} ${f2(world.market.balance?.[id] ?? 0)}`).join(' · ');
console.log(`dünya ihtiyaç/üretim: ${bal}`);
const player = world.nations.filter((n) => n.alive).sort((a, b) => (b.economy.ic?.output ?? 0) - (a.economy.ic?.output ?? 0))[0];
const a = player.economy.alloc;
console.log(`en büyük: ${player.name} çıktı ${f1(a.output)} (el ${f1(player.economy.ic.hand)} sanayi ${f1(player.economy.ic.total)}) · fatura ${f1(a.bills)} ordu ${f1(a.army)}/${f1(player.economy.ic.military)} halk ${f1(a.people)} kalkınma ${f1(a.invest)} · kalk.ort ${f2(player.economy.development)} cap ${developmentCap(player)} · fon ${f1(player.fund)}`);
void atWar;
