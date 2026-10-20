// KAYNAK DENGESİ — 160×96, tam kampanya, beş yılda bir satır.
//
//   node scripts/audit/resource-balance.mjs [TOHUM]
//
// Kaynak başına: dünya arz/ihtiyaç, takas teklif/talep, fiyat ÷ taban fiyat
// ve kıt (oran < 0.8) ulus payı. audit:econ 10 yıl koşar ve geç oyunu görmez:
// 2026-10-15'te sanayi 45 yılda ×4-5 büyürken madenler %20 büyüyordu ve
// 1940'ta ulusların %74'ü demir kıtlığındaydı; on yıllık denetim temizdi.
// Bir tohum ~15 dk; üç tohum paralel koşar.

import { headless } from './harness.mjs';
import { RESOURCE_IDS, RESOURCES } from '../../src/game/econ/defs.js';
import { CAMPAIGN_TURNS, exactYearOfTurn } from '../../src/game/calendar.js';

const SEED = process.argv[2] ?? 'STAT1';
const game = headless(SEED, { cols: 160, rows: 96 });
const world = game.world;
const STEP = 261;

let acc;
const reset = () => {
  acc = {};
  for (const id of RESOURCE_IDS) acc[id] = { produced: 0, need: 0, offered: 0, wanted: 0, price: 0, short: 0, records: 0, weeks: 0 };
};
reset();

console.log(`KAYNAK DENGESİ ${SEED} 160x96 · hücre: arz/ihtiyaç teklif/talep · fiyat÷taban · kıt ulus %`);
for (let week = 1; week <= CAMPAIGN_TURNS; week++) {
  game.turns.endTurn();
  const market = world.market;
  for (const id of RESOURCE_IDS) {
    const a = acc[id];
    a.offered += market.offered[id] ?? 0;
    a.wanted += market.wanted[id] ?? 0;
    a.price += market.prices[id] / RESOURCES[id].price;
    a.weeks++;
    for (const nation of world.nations) {
      if (!nation.alive || !nation.economy?.resources) continue;
      const record = nation.economy.resources[id];
      a.produced += record.produced;
      a.need += record.need;
      a.records++;
      if (record.need >= 0.05 && record.ratio < 0.8) a.short++;
    }
  }
  if (week % STEP !== 0 && week !== CAMPAIGN_TURNS) continue;
  const cells = RESOURCE_IDS.filter((id) => id !== 'FOOD').map((id) => {
    const a = acc[id];
    const ratio = (x, y) => (y > 0 ? (x / y).toFixed(2) : '–');
    return `${id.slice(0, 4)} ${ratio(a.produced, a.need)}/${ratio(a.offered, a.wanted)}`
      + ` p${(a.price / a.weeks).toFixed(2)} k${Math.round(100 * a.short / Math.max(1, a.records))}%`;
  });
  console.log(Math.floor(exactYearOfTurn(world.turn ?? week)), cells.join(' | '));
  reset();
}
