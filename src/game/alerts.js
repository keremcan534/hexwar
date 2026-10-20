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
import { money } from './money.js';

/**
 * Uyarı türleri. Kimlikler ui/alerts.js'teki ikonlarla eşleşir. `tier`
 * sıralama: 2 varoluşsal, 1 ciddi, 0 bilgilendirici.
 */
export const ALERT_KINDS = {
  STARVATION: { id: 'STARVATION', label: 'Food', tone: 'bad', tier: 2 },
  CRISIS: { id: 'CRISIS', label: 'Supply', tone: 'bad', tier: 2 },
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
    // Acil: şerit bunu histerezis beklemeden gösterir (ui/alerts.js).
    urgent: food.ratio < 0.7,
    cause: `Our provinces grow ${food.produced.toFixed(1)} food a week and the people need ${food.need.toFixed(1)};`
      + ` imports bring ${food.imported.toFixed(1)}. ${pct(food.ratio)} of the need is met.`
      + (blockade > 0 ? ` An enemy fleet blockades ${pct(blockade)} of our coast.` : ''),
    remedy: food.ratio < 0.7
      ? 'Below 70% the population shrinks every week. Keep the development fund above its floor so imports can be paid, put a Production focus on a fertile state, or break the blockade.'
      : 'Growth slows and stability falls. Keep the development fund above its floor so imports can be paid, or put a Production focus on a fertile state.',
  };
}

function consumerGoods(world, nation) {
  const consumer = nation.economy?.consumer;
  if (!consumer || consumer.ratio >= 0.95) return null;
  // Ordunun FİİLEN çektiği pay (yasanın tavanı değil): hatlar durmuşsa
  // yasa ne derse desin sanayi halka kalır.
  const alloc = nation.economy?.alloc;
  const army = alloc && alloc.output > 0 ? alloc.army / alloc.output : 0;
  const bills = alloc && alloc.output > 0 ? alloc.bills / alloc.output : 0;
  const feed = consumer.feed ?? 1;
  return {
    id: 'DEMOTION',
    kind: ALERT_KINDS.DEMOTION,
    title: 'The shops are empty',
    cause: `The people get ${consumer.supply.toFixed(1)} IC of goods and want ${consumer.need.toFixed(1)}:`
      + ` ${pct(consumer.ratio)} of their need.`
      + (feed < 0.95 ? ` They are fed at ${pct(feed)} of their need by policy.` : '')
      + (bills > 0.25 ? ` The state's bills take ${pct(bills)} of output.` : '')
      + (army > 0.1 ? ` The army draws ${pct(army)} of output.` : ''),
    remedy: feed < 0.95
      ? 'Feed the people more on the Economy screen: every missing tenth costs stability.'
      : army > 0.1 || bills > 0.25
        ? 'Lower the army\'s draw (Economy law) or its size, or develop the country: expectations rise every decade.'
        : 'Develop the country: expectations rise every decade and handwork alone cannot keep up.',
  };
}

/**
 * İKMAL KRİZİ (iflasın yerine): faturalar çıktının tavan payını aştı. Acil:
 * takviye, eğitim ve düzen yavaşlar, istikrar düşer. Tavana yaklaşmak
 * (%85) uyarıdır, acil değil.
 */
function supply(world, nation) {
  const bills = nation.economy?.bills;
  const output = nation.economy?.ic?.output ?? 0;
  if (!bills || !(output > 0)) return null;
  const crisis = bills.s < 1 - 1e-6;
  const near = !crisis && bills.owed >= bills.room * 0.85;
  if (!crisis && !near) return null;
  return {
    id: 'CRISIS',
    kind: ALERT_KINDS.CRISIS,
    title: crisis ? 'Supply crisis' : 'The state\'s bills near the ceiling',
    urgent: crisis,
    cause: `Army, navy, schools and martial law cost ${money(bills.owed, 0)} a week; the ceiling is ${money(bills.room, 0)}`
      + ` (${pct(bills.room / output)} of output).`
      + (crisis ? ` Only ${pct(bills.s)} is paid: the army reinforces, trains and recovers slower and stability falls.` : ''),
    remedy: 'Stand regiments down, cut school spending, lengthen the working week (Labour law), or requisition the economy (decision).',
  };
}

function shortage(world, nation) {
  const resources = nation.economy?.resources ?? {};
  // Yalnız bedeli OLAN kıtlık uyarıdır. Kauçuk ve tanksız/uçaksız ülkede
  // petrol yalnız bonus taşır (TASARIM §3): eksikleri ceza değil, kaçan
  // fırsattır. Eskiden kauçuk kıtlığı oyuncu haftalarının %87'sinde yanıyordu
  // (ölçüldü, 3 tohum × 45 yıl) ve sürekli yanan uyarı okunmaz oluyordu.
  const motorized = world.units.some((unit) => unit.nationId === nation.id
    && unit.regiments?.some((regiment) => regiment.typeId === 'ARMOR' || regiment.typeId === 'AIRCRAFT'));
  let worst = null;
  for (const [id, record] of Object.entries(resources)) {
    if (id === 'FOOD' || record.need < 0.05 || record.ratio >= 0.8) continue;
    if (id === 'RUBBER' || (id === 'OIL' && !motorized)) continue;
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
    TIMBER: 'Development slows down.',
    HORSES: 'Cavalry and artillery fight weaker.',
    SALTPETER: 'Our regiments run out of gunpowder in battle.',
    OIL: 'Tanks and aircraft run short of fuel and fight weaker.',
  }[worst.id] ?? '';
  return {
    id: `SHORTAGE:${worst.id}`,
    kind: ALERT_KINDS.SHORTAGE,
    title: `${name} shortage`,
    cause: `We need ${worst.record.need.toFixed(1)} ${name.toLowerCase()} a week and have ${pct(worst.record.ratio)} of it. ${effect}`,
    remedy: `Develop a state with a ${name.toLowerCase()} deposit, conquer one, or keep the development fund above its floor for imports.`,
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
    remedy: 'Develop our own deposits, or buy from more countries by keeping peace with several suppliers.',
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

const CHECKS = [famine, supply, consumerGoods, shortage, dependency, legitimacy];

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
