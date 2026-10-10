// KARARLAR — Siyasi Gücün gündelik harcama menüsü (TASARIM.md §9).
//
// Yasa ve danışman seyrek değişir; SG'nin her hafta bir yere akması gerekir,
// yoksa tavana yapışır ve oyuncunun önünde karar kalmaz (ölçüldü: ilk
// sürümde medyan ulus 6. yılda 500 tavanındaydı). Kararlar küçük, somut ve
// süreli değiştiricilerdir; her birinin bekleme süresi vardır. YZ ve AUTO
// aynı tabloyu, duruma göre ağırlıkla kullanır.

import { addTimedModifier, refreshModifiers } from './modifiers.js';
import { settle } from './treasury.js';
import { addEquipment } from './econ/industry.js';

const atWar = (nation) => (nation.economy?.warFronts ?? 0) > 0;
const units = (nation) => Math.max(1, (nation.economy?.population ?? 0) / 100000);

/**
 * `cost` SG, `cooldown` hafta, `available` koşul, `weight` YZ ağırlığı,
 * `apply` etki (cümle döner).
 */
export const DECISIONS = {
  industrial_subsidies: {
    name: 'Industrial Subsidies', cost: 75, cooldown: 104,
    desc: 'Construction +20% speed and building cost −10% for two years.',
    available: () => true,
    weight: (nation) => ((nation.economy?.consumer?.ratio ?? 1) < 1.05 ? 1.6 : 0.8),
    apply: (game, nation) => {
      // Süre = bekleme: etki boşluksuz sürer (52 haftada yarı zaman boştu).
      addTimedModifier(nation, 'decision-subsidies', 'Industrial Subsidies', 104, { construction: 0.2, buildCost: -0.1 }, game.turns.turn);
      return 'Credit flows to the builders.';
    },
  },
  war_bonds: {
    name: 'War Bonds', cost: 50, cooldown: 52,
    desc: 'Raise six weeks of income from patriotic savers; war support +3 for half a year.',
    available: (nation) => atWar(nation),
    weight: (nation) => ((nation.gold ?? 0) < 100 ? 2.5 : 1),
    apply: (game, nation) => {
      const amount = Math.round(Math.max(20, (nation.economy?.incomeAvg ?? 0) * 6));
      settle(nation, 'tax', amount);
      addTimedModifier(nation, 'decision-bonds', 'War Bonds', 26, { warSupport: 0.03 }, game.turns.turn);
      return `${amount} gold raised.`;
    },
  },
  requisition: {
    name: 'Requisition Arms', cost: 40, cooldown: 52,
    desc: 'Seize hunting rifles and old muskets: rifles for the depot, stability −3 for half a year.',
    available: (nation) => atWar(nation),
    weight: (nation) => ((nation.economy?.stock?.rifles ?? 0) < 20 ? 2.5 : 0.3),
    apply: (game, nation) => {
      const rifles = Math.round(10 + units(nation) * 0.5);
      addEquipment(nation, 'rifles', rifles);
      addTimedModifier(nation, 'decision-requisition', 'Requisitioned Arms', 26, { stability: -0.03 }, game.turns.turn);
      return `${rifles} rifles requisitioned.`;
    },
  },
  military_drills: {
    name: 'Grand Manoeuvres', cost: 50, cooldown: 104,
    desc: 'Organisation recovery +15% and training speed +15% for a year.',
    available: () => true,
    // Barış ağırlığı YZ tabanının (0.5) altında: manevra savaşta ya da askerî
    // odakta alınır. 0.6'da barışta da alınıyor, SG'nin büyük payını yiyordu.
    weight: (nation) => (atWar(nation) || nation.focus === 'military' ? 1.4 : 0.4),
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-drills', 'Grand Manoeuvres', 52, { organization: 0.15, training: 0.15 }, game.turns.turn);
      return 'The army drills in the autumn fields.';
    },
  },
  land_grants: {
    name: 'Land Grants', cost: 60, cooldown: 156,
    desc: 'Population growth +15% for two years, stability +2.',
    available: () => true,
    weight: () => 0.7,
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-grants', 'Land Grants', 104, { growth: 0.15, stability: 0.02 }, game.turns.turn);
      return 'Settlers take up new farms.';
    },
  },
  gendarmerie: {
    name: 'Expand the Gendarmerie', cost: 50, cooldown: 104,
    desc: 'Unrest −20% for a year, stability +2; liberals resent it.',
    available: () => true,
    weight: (nation) => ((nation.politics?.stabilityTarget ?? 0.6) < 0.45 ? 1.8 : 0.3),
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-police', 'Gendarmerie', 52, { unrest: -0.2, stability: 0.02 }, game.turns.turn);
      const support = nation.politics?.support;
      if (support) support.liberal = Math.max(0, (support.liberal ?? 0) - 4);
      return 'Constables patrol the restless towns.';
    },
  },
  national_census: {
    name: 'National Census', cost: 40, cooldown: 260,
    desc: 'Tax income +5% for two years.',
    available: () => true,
    weight: () => 1,
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-census', 'National Census', 104, { tax: 0.05 }, game.turns.turn);
      return 'Every household counted.';
    },
  },
  royal_amnesty: {
    name: 'Amnesty and Festivities', cost: 60, cooldown: 104,
    desc: 'Stability +6 for half a year.',
    available: () => true,
    weight: (nation) => ((nation.stability ?? 0.6) < 0.45 ? 2 : 0.2),
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-amnesty', 'Amnesty', 26, { stability: 0.06 }, game.turns.turn);
      return 'Prisons open, bells ring.';
    },
  },
  patriotic_press: {
    name: 'Patriotic Press', cost: 50, cooldown: 104,
    desc: 'War support +8 for a year.',
    available: () => true,
    weight: (nation) => (atWar(nation) && (nation.warSupport ?? 0.5) < 0.5 ? 2.2 : 0.3),
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-press', 'Patriotic Press', 52, { warSupport: 0.08 }, game.turns.turn);
      return 'The papers beat the drum.';
    },
  },
  debt_moratorium: {
    name: 'Debt Moratorium', cost: 80, cooldown: 520,
    desc: 'A quarter of the debt is written off; stability −4 and import cost +10% for half a year.',
    available: (nation) => (nation.debt ?? 0) > 50,
    weight: (nation) => ((nation.debt ?? 0) > (nation.economy?.debtCap ?? Infinity) * 0.5 ? 3 : 0),
    apply: (game, nation) => {
      const cut = Math.round((nation.debt ?? 0) / 4);
      nation.debt -= cut;
      addTimedModifier(nation, 'decision-moratorium', 'Debt Moratorium', 26, { stability: -0.04, importCost: 0.1 }, game.turns.turn);
      return `${cut} gold of debt repudiated.`;
    },
  },
  research_grants: {
    name: 'Research Grants', cost: 60, cooldown: 104,
    desc: 'Research +15% for two years.',
    available: () => true,
    weight: () => 0.9,
    apply: (game, nation) => {
      addTimedModifier(nation, 'decision-research', 'Research Grants', 104, { research: 0.15 }, game.turns.turn);
      return 'The academies receive the crown\'s purse.';
    },
  },
};
export const DECISION_IDS = Object.keys(DECISIONS);

export function decisionBlockers(nation, id, turn) {
  const decision = DECISIONS[id];
  if (!decision) return ['Unknown decision'];
  const out = [];
  if (!decision.available(nation)) out.push('Not available now');
  const last = nation.decisions?.[id];
  if (last != null && turn - last < decision.cooldown) out.push(`Again in ${decision.cooldown - (turn - last)} weeks`);
  if ((nation.power ?? 0) < decision.cost) out.push(`Needs ${decision.cost} political power`);
  return out;
}

export function takeDecision(game, nation, id) {
  const turn = game.turns?.turn ?? game.world.turn ?? 0;
  if (decisionBlockers(nation, id, turn).length) return null;
  const decision = DECISIONS[id];
  nation.power -= decision.cost;
  nation.decisions = { ...(nation.decisions ?? {}), [id]: turn };
  const text = decision.apply(game, nation);
  refreshModifiers(nation, turn);
  if (nation.id === game.turns?.playerNation) {
    game.turns.addLog(`${decision.name}: ${text}`, { kind: 'POLITICS' });
  }
  game.emit?.('politics', nation.id);
  return text;
}

/**
 * YZ: SG birikince (150 üstü) duruma en uygun kararı alır; ayda bir.
 * Yasa ve danışman için pay bırakır.
 */
export function decisionsAI(game, nation) {
  const turn = game.turns?.turn ?? 0;
  if ((turn + nation.id) % 4 !== 2 || (nation.power ?? 0) < 150) return null;
  let best = null;
  let bestWeight = 0.5;
  for (const id of DECISION_IDS) {
    if (decisionBlockers(nation, id, turn).length) continue;
    const weight = DECISIONS[id].weight(nation);
    if (weight > bestWeight) {
      best = id;
      bestWeight = weight;
    }
  }
  return best ? takeDecision(game, nation, best) : null;
}

/** Karar listesinin ekran modeli. */
export function decisionsView(nation, turn) {
  return DECISION_IDS.map((id) => ({
    id, ...DECISIONS[id], blockers: decisionBlockers(nation, id, turn),
  }));
}
