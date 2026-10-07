// Harita uyarıları: "şu an neyin yanlış gittiği ve NEDEN".
//
// HOI4/EU4'teki ikon şeridinin karşılığı. Uyarı sebebi kendisi getirir; hiçbir
// sayı uydurulmaz — başlık, sebep ve çare simülasyonun kendi alanlarından
// türer (kaynak oranı, tüketim malı oranı, defter, meşruiyet). Uyarı metni
// bir yorum değil, okunmuş bir ölçümdür.
//
// Katman notu: DOM'a dokunmaz, `world`/`nation` okur. Çizimi ui/alerts.js yapar.

import { RESOURCES } from './econ/defs.js';
import { legitimacyOf, PARTIES } from './politics.js';
import { trainingQueue } from './recruitment.js';

/**
 * Uyarı türleri. Kimlikler ui/alerts.js'teki ikonlarla eşleşir. `tier`
 * sıralama: 2 varoluşsal, 1 ciddi, 0 bilgilendirici.
 */
export const ALERT_KINDS = {
  STARVATION: { id: 'STARVATION', label: 'Food', tone: 'bad', tier: 2 },
  DEFICIT: { id: 'DEFICIT', label: 'Treasury', tone: 'bad', tier: 2 },
  DEMOTION: { id: 'DEMOTION', label: 'Consumer goods', tone: 'warn', tier: 1 },
  IMPORT_DRAIN: { id: 'IMPORT_DRAIN', label: 'Trade', tone: 'warn', tier: 1 },
  SHORTAGE: { id: 'SHORTAGE', label: 'Supply', tone: 'warn', tier: 1 },
  IDEOLOGY: { id: 'IDEOLOGY', label: 'Politics', tone: 'info', tier: 1 },
};

const pct = (value) => `${Math.round(value * 100)}%`;

function famine(world, nation) {
  const food = nation.economy?.resources?.FOOD;
  if (!food || food.ratio >= 0.95) return null;
  const blockade = nation.economy?.blockade ?? 0;
  return {
    id: 'STARVATION',
    kind: ALERT_KINDS.STARVATION,
    title: food.ratio < 0.7 ? 'Famine' : 'Food is running short',
    cause: `Our provinces grow ${food.produced.toFixed(1)} food a week and the people need ${food.need.toFixed(1)};`
      + ` imports bring ${food.imported.toFixed(1)}. ${pct(food.ratio)} of the need is met.`
      + (blockade > 0 ? ` An enemy fleet blockades ${pct(blockade)} of our coast.` : ''),
    remedy: food.ratio < 0.7
      ? 'Below 70% the population shrinks every week. Build farms in fertile provinces, keep gold for imports, or break the blockade.'
      : 'Growth slows and stability falls. Build farms, or make sure the treasury can pay for imports.',
  };
}

function consumerGoods(world, nation) {
  const consumer = nation.economy?.consumer;
  if (!consumer || consumer.ratio >= 0.95) return null;
  const military = nation.economy?.ic?.share ?? 0;
  return {
    id: 'DEMOTION',
    kind: ALERT_KINDS.DEMOTION,
    title: 'The shops are empty',
    cause: `Consumer goods meet ${pct(consumer.ratio)} of demand: workshops make ${consumer.cottage.toFixed(1)},`
      + ` civilian industry ${consumer.civil.toFixed(1)}, the people want ${consumer.need.toFixed(1)}.`
      + (military > 0.1 ? ` ${pct(military)} of our industry works for the army.` : ''),
    remedy: military > 0.1
      ? 'Return industry to civilian work (Economy law) or build factories. Every missing tenth costs stability.'
      : 'Build factories: expectations rise every decade and workshops alone cannot keep up.',
  };
}

function treasury(world, nation) {
  const economy = nation.economy;
  const turn = world.turn ?? 0;
  if ((nation.bankruptUntil ?? 0) > turn) {
    return {
      id: 'DEFICIT',
      kind: ALERT_KINDS.DEFICIT,
      title: 'The state is bankrupt',
      cause: `We defaulted on our debts. For ${nation.bankruptUntil - turn} more weeks no one lends to us,`
        + ' stability suffers and the army trains and reinforces at half speed.',
      remedy: 'Cut costs: fewer regiments, lower education spending, higher taxes.',
    };
  }
  const net = economy?.ledger?.net ?? 0;
  const cap = economy?.debtCap ?? 0;
  const debt = nation.debt ?? 0;
  if (net >= 0 && debt < cap * 0.75) return null;
  return {
    id: 'DEFICIT',
    kind: ALERT_KINDS.DEFICIT,
    title: debt >= cap * 0.75 ? 'Debt near the ceiling' : 'Running a deficit',
    cause: `Last week closed at ${net >= 0 ? '+' : ''}${net.toFixed(1)} gold. Debt ${Math.round(debt)} of a ${Math.round(cap)} ceiling.`,
    remedy: 'Above the ceiling the state goes bankrupt. Raise taxes, cut the army or imports, or stop building for a while.',
  };
}

function shortage(world, nation) {
  const resources = nation.economy?.resources ?? {};
  let worst = null;
  for (const [id, record] of Object.entries(resources)) {
    if (id === 'FOOD' || record.need < 0.05 || record.ratio >= 0.8) continue;
    if (!worst || record.ratio < worst.record.ratio) worst = { id, record };
  }
  const waiting = trainingQueue(nation).filter((item) => Object.keys(item.missing ?? {}).length).length;
  if (!worst && waiting === 0) return null;
  if (!worst) {
    return {
      id: 'SHORTAGE:equipment',
      kind: ALERT_KINDS.SHORTAGE,
      title: 'Regiments waiting for equipment',
      cause: `${waiting} regiment${waiting > 1 ? 's wait' : ' waits'} in the training queue for weapons the depot does not have.`,
      remedy: 'Shift industry to the army (Economy law) or weigh the production lines toward what is missing.',
    };
  }
  const name = RESOURCES[worst.id].name;
  const effect = {
    COAL: 'Industry runs below capacity.',
    IRON: 'Production lines slow down.',
    TIMBER: 'Construction slows down.',
    HORSES: 'Cavalry and artillery fight weaker.',
    SALTPETER: 'Our regiments run out of gunpowder in battle.',
  }[worst.id] ?? '';
  return {
    id: `SHORTAGE:${worst.id}`,
    kind: ALERT_KINDS.SHORTAGE,
    title: `${name} shortage`,
    cause: `We need ${worst.record.need.toFixed(1)} ${name.toLowerCase()} a week and have ${pct(worst.record.ratio)} of it. ${effect}`,
    remedy: `Build a mine on a ${name.toLowerCase()} deposit, conquer one, or keep gold for imports.`,
  };
}

function dependency(world, nation) {
  const resources = nation.economy?.resources ?? {};
  let worst = null;
  for (const [id, record] of Object.entries(resources)) {
    if (record.topPartner < 0 || record.topShare < 0.5) continue;
    if (!worst || record.topShare > worst.record.topShare) worst = { id, record };
  }
  if (!worst) return null;
  const partner = world.nations[worst.record.topPartner];
  const name = RESOURCES[worst.id].name;
  return {
    id: `IMPORT_DRAIN:${worst.id}`,
    kind: ALERT_KINDS.IMPORT_DRAIN,
    title: `Dependent on ${partner?.name ?? 'one supplier'} for ${name.toLowerCase()}`,
    cause: `${pct(worst.record.topShare)} of our ${name.toLowerCase()} need comes from ${partner?.name ?? 'a single country'}.`
      + ' An embargo or a war would cut it overnight.',
    remedy: 'Build our own mines or farms, or buy from more countries by keeping peace with several suppliers.',
  };
}

function legitimacy(world, nation) {
  const { gap, leader } = legitimacyOf(nation);
  if (gap < 12) return null;
  const ruling = PARTIES[nation.politics?.ruling];
  const elections = nation.politics?.government !== 'absolutism';
  return {
    id: 'IDEOLOGY',
    kind: ALERT_KINDS.IDEOLOGY,
    title: `The people want the ${PARTIES[leader].name}`,
    cause: `${PARTIES[leader].name} lead the ${ruling?.name ?? 'government'} by ${Math.round(gap)} points.`
      + ` Legitimacy costs ${Math.round(gap * 0.4)} stability.`,
    remedy: elections
      ? 'The next election will settle it — or spend political power on propaganda for the ruling party.'
      : `Appoint a ${PARTIES[leader].name} government (political power), or run propaganda for the crown's party.`,
  };
}

const CHECKS = [famine, treasury, consumerGoods, shortage, dependency, legitimacy];

/**
 * Ulusun şu anki uyarıları, ağırdan hafife. SAF FONKSİYON: durum yazmaz.
 */
export function activeAlerts(world, nation) {
  if (!nation?.alive || !nation.economy) return [];
  const out = [];
  for (const check of CHECKS) {
    let hit = null;
    try {
      hit = check(world, nation);
    } catch {
      hit = null;
    }
    if (hit) out.push(hit);
  }
  return out.sort((a, b) => b.kind.tier - a.kind.tier);
}
