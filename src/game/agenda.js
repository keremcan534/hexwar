// ULUSAL GÜNDEM — HOI4'ün odak ağacının sade karşılığı (TASARIM.md §9).
//
// Ağaç yerine DURUMA UYAN ÜÇ SEÇENEK: ulusun o anki sorunlarından (borç,
// soydaş, tüketim malı, kıyı, düşman) uygun şablonlar tartılır, üçü sunulur,
// biri seçilir, 12-20 hafta sonra SOMUT bir sonuç verir (bina, teçhizat,
// geçici değiştirici, savaş gerekçesi). Bitince yeni üçlü gelir.
//
// Neden ağaç değil: 69 ülkeye elle ağaç yazılamaz ve prosedürel dünyada
// "senin tarihin" önceden bilinmez. Şablon + koşul + ağırlık, her ülkeye
// kendi hikâyesini verir; aynı kapı oyuncu ve YZ içindir.

import { makeRng } from '../core/rng.js';
import { addIdea, addTimedModifier, refreshModifiers } from './modifiers.js';
import { BUILDINGS, DEVELOPMENT_MAX } from './econ/defs.js';
import { addEquipment } from './econ/industry.js';
import { buildingLevels, buildingSlots, provinceName } from './provinces.js';
import { cultureMix } from './culture.js';
import { addInfamy } from './infamy.js';
import { kinAbroadShare } from './politics.js';
import { developmentCap } from './construction.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Tamamlanan şablon bu kadar hafta yeniden sunulmaz. */
const REPEAT_COOLDOWN = 520;
const OPTIONS = 3;

function ownProvinces(world, nation) {
  return (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ && (p.econ.status ?? 1) > 0);
}

/** Province'e bina kademesi ekler (yuva ve tavan sınırında); eklenen sayıyı döndürür. */
function grantBuilding(world, provinces, buildingId, count) {
  const info = BUILDINGS[buildingId];
  let given = 0;
  const names = [];
  for (const province of provinces) {
    if (given >= count) break;
    const econ = province.econ;
    if ((econ.buildings[buildingId] ?? 0) >= info.max) continue;
    if (buildingLevels(econ) >= buildingSlots(econ)) continue;
    if (info.minDevelopment && econ.development < info.minDevelopment) continue;
    if (info.coastal && !province.coastal) continue;
    if (info.needsDeposit && !province.deposits?.length) continue;
    econ.buildings[buildingId]++;
    names.push(provinceName(province.center));
    given++;
  }
  return names;
}

const byPopulation = (list) => [...list].sort((a, b) => b.econ.population - a.econ.population || a.id - b.id);
const popUnits = (nation) => (nation.economy?.population ?? 0) / 100000;

/**
 * Şablonlar. `weight` 0 ise sunulmaz; `apply` sonucu tek cümleyle döndürür.
 * Etiketler İngilizce (oyuncu metni), yorumlar Türkçe.
 */
export const AGENDA = {
  railway_push: {
    name: 'Railway Push', weeks: 16,
    desc: 'Lay track between the heartland\'s largest towns.',
    reward: '+1 Railway in the three most populous provinces',
    weight: (world, nation) => (ownProvinces(world, nation).length >= 3 ? 1.2 : 0),
    apply: (game, nation) => {
      const names = grantBuilding(game.world, byPopulation(ownProvinces(game.world, nation)), 'railway', 3);
      return names.length ? `Railways opened in ${names.join(', ')}.` : 'The line was surveyed but no slot was free.';
    },
  },
  industrial_drive: {
    name: 'Industrial Drive', weeks: 20,
    desc: 'State credit for the first mills of a new industry.',
    reward: '+1 Factory in the two most developed provinces',
    weight: (world, nation) => ((nation.economy?.consumer?.ratio ?? 1) < 1 ? 2 : 1),
    apply: (game, nation) => {
      const list = ownProvinces(game.world, nation)
        .sort((a, b) => b.econ.development - a.econ.development || b.econ.population - a.econ.population);
      const names = grantBuilding(game.world, list, 'factory', 2);
      return names.length ? `New factories in ${names.join(', ')}.` : 'No province had room for a factory.';
    },
  },
  army_reform: {
    name: 'Army Reform', weeks: 16,
    desc: 'New drill books and a modern officer school.',
    reward: '+5% land attack, +20% training speed for 2 years',
    weight: (world, nation) => ((nation.economy?.warFronts ?? 0) > 0 || nation.focus === 'military' ? 1.6 : 0.8),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-army', 'Army Reform', 104, { attack: 0.05, training: 0.2 }, game.turns.turn);
      return 'The reformed army drills to the new manual.';
    },
  },
  arsenal_program: {
    name: 'Arsenal Programme', weeks: 12,
    desc: 'Fill the depots before the next war.',
    reward: 'Rifles and artillery delivered to the depot',
    weight: (world, nation) => ((nation.economy?.warFronts ?? 0) > 0 ? 2 : 0.9),
    apply: (game, nation) => {
      const rifles = Math.round(20 + popUnits(nation) * 0.6);
      const guns = Math.round(4 + popUnits(nation) * 0.08);
      addEquipment(nation, 'rifles', rifles);
      addEquipment(nation, 'guns', guns);
      return `${rifles} rifles and ${guns} guns delivered.`;
    },
  },
  land_reform: {
    name: 'Land Reform', weeks: 16,
    desc: 'Enclosure, drainage and model farms.',
    reward: '+1 Farm in the three most fertile provinces, stability +5 for a year',
    weight: (world, nation) => ((nation.economy?.resources?.FOOD?.ratio ?? 1) < 1 ? 2.5 : 0.7),
    apply: (game, nation) => {
      const list = ownProvinces(game.world, nation)
        .sort((a, b) => (b.fertility ?? 1) * b.econ.population - (a.fertility ?? 1) * a.econ.population);
      const names = grantBuilding(game.world, list, 'farm', 3);
      addTimedModifier(nation, 'agenda-land', 'Land Reform', 52, { stability: 0.05 }, game.turns.turn);
      return names.length ? `Model farms in ${names.join(', ')}.` : 'The reform calmed the countryside.';
    },
  },
  literacy_campaign: {
    name: 'Literacy Campaign', weeks: 20,
    desc: 'Teachers, primers and night schools.',
    reward: 'Literacy +3% now, literacy target +5% for 3 years',
    weight: (world, nation) => ((nation.economy?.literacy ?? 0) < 0.4 ? 1.3 : 0.5),
    apply: (game, nation) => {
      nation.economy.literacy = clamp((nation.economy.literacy ?? 0) + 0.03, 0, 1);
      addTimedModifier(nation, 'agenda-literacy', 'Literacy Campaign', 156, { literacy: 0.05 }, game.turns.turn);
      return 'The schoolhouses fill.';
    },
  },
  fortify_border: {
    name: 'Fortify the Border', weeks: 12,
    desc: 'Forts on the roads an enemy would take.',
    reward: '+1 Fort in three border provinces',
    weight: (world, nation) => (nation.rivalId != null || (nation.economy?.warFronts ?? 0) > 0 ? 1.4 : 0.5),
    apply: (game, nation) => {
      const world = game.world;
      const border = ownProvinces(world, nation).filter((p) => p.neighbors.some((id) => {
        const owner = world.provinces[id]?.owner;
        return owner >= 0 && owner !== nation.id;
      }));
      const names = grantBuilding(world, byPopulation(border), 'fort', 3);
      return names.length ? `Forts raised in ${names.join(', ')}.` : 'The border was surveyed.';
    },
  },
  naval_ambition: {
    name: 'Naval Ambition', weeks: 20,
    desc: 'A dockyard and a squadron to fly the flag.',
    reward: '+1 Dockyard and a stock of ships',
    weight: (world, nation) => (nation.economy?.coastal ? ((nation.economy?.blockade ?? 0) > 0 ? 2 : 0.9) : 0),
    apply: (game, nation) => {
      const names = grantBuilding(game.world, byPopulation(ownProvinces(game.world, nation).filter((p) => p.coastal)), 'dockyard', 1);
      const ships = Math.round(10 + popUnits(nation) * 0.2);
      addEquipment(nation, 'ships', ships);
      return `${names.length ? `A dockyard at ${names[0]}; ` : ''}${ships} ships fitted out.`;
    },
  },
  bread_and_circuses: {
    name: 'Bread and Circuses', weeks: 8,
    desc: 'Festivals, subsidies and a royal amnesty.',
    reward: 'Stability +8 for a year',
    weight: (world, nation) => ((nation.stability ?? 0.5) < 0.5 ? 2.2 : 0.2),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-bread', 'Bread and Circuses', 52, { stability: 0.08 }, game.turns.turn);
      return 'The crowds cheer.';
    },
  },
  open_markets: {
    name: 'Open the Markets', weeks: 12,
    desc: 'Commercial treaties with every port that will sign.',
    reward: 'Export income +25%, import cost −10% for 2 years',
    weight: (world, nation) => (nation.economy?.coastal ? 1 : 0.5),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-markets', 'Open Markets', 104, { exportIncome: 0.25, importCost: -0.1 }, game.turns.turn);
      return 'Merchants crowd the docks.';
    },
  },
  reconcile_minority: {
    name: 'Reconcile the Minorities', weeks: 16,
    desc: 'Schools in their tongue, places in the civil service.',
    reward: 'Unrest −3 and compliance +20 in minority provinces',
    weight: (world, nation) => (cultureMix(world, nation).some((row) => !row.accepted && row.share >= 0.08) ? 1.6 : 0),
    apply: (game, nation) => {
      let count = 0;
      for (const province of ownProvinces(game.world, nation)) {
        if (nation.accepted?.includes(province.culture) || province.culture === nation.culture) continue;
        province.econ.unrest = Math.max(0, (province.econ.unrest ?? 0) - 3);
        province.econ.control = Math.min(100, (province.econ.control ?? 0) + 20);
        count++;
      }
      return `${count} provinces calmed.`;
    },
  },
  settle_frontier: {
    name: 'Settle the Frontier', weeks: 16,
    desc: 'Land grants for families who move to the margins.',
    reward: 'Population growth +20% for 3 years',
    weight: () => 0.8,
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-settle', 'Frontier Settlement', 156, { growth: 0.2 }, game.turns.turn);
      return 'Wagons roll toward the frontier.';
    },
  },
  officer_corps: {
    name: 'Expand the Officer Corps', weeks: 12,
    desc: 'Staff college graduates take the field.',
    reward: 'Organisation recovery +15% and reinforcement +15% for 2 years',
    weight: (world, nation) => (nation.focus === 'military' ? 1.2 : 0.6),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-officers', 'Officer Corps', 104, { organization: 0.15, reinforce: 0.15 }, game.turns.turn);
      return 'A new generation of officers.';
    },
  },
  debt_conversion: {
    name: 'Debt Conversion', weeks: 12,
    desc: 'Refinance the national debt at a lower rate.',
    reward: 'A third of the debt written off, stability −3 for half a year',
    weight: (world, nation) => ((nation.debt ?? 0) > 50 ? 2.4 : 0),
    apply: (game, nation) => {
      const cut = Math.round((nation.debt ?? 0) / 3);
      nation.debt = Math.max(0, (nation.debt ?? 0) - cut);
      addTimedModifier(nation, 'agenda-debt', 'Debt Conversion', 26, { stability: -0.03 }, game.turns.turn);
      return `${cut} gold of debt converted away.`;
    },
  },
  great_exhibition: {
    name: 'Great Exhibition', weeks: 20,
    desc: 'Show the world the marvels of our industry.',
    reward: 'Prestige +10, research +10% for 2 years',
    weight: (world, nation) => ((nation.economy?.ic?.total ?? 0) >= 4 ? 1.2 : 0),
    apply: (game, nation) => {
      nation.prestige = (nation.prestige ?? 0) + 10;
      addTimedModifier(nation, 'agenda-exhibition', 'Great Exhibition', 104, { research: 0.1 }, game.turns.turn);
      return 'Visitors flock to the crystal halls.';
    },
  },
  bureaucratic_reform: {
    name: 'Bureaucratic Reform', weeks: 20, once: true,
    desc: 'A professional civil service replaces patronage.',
    reward: 'Permanent political power +0.25',
    weight: () => 0.9,
    apply: (game, nation) => {
      addIdea(nation, 'reformed-bureaucracy', 'Reformed Bureaucracy', { power: 0.25 });
      return 'The ministries run by examination now.';
    },
  },
  unify_kin: {
    name: 'Bring Our Kin Home', weeks: 16,
    desc: 'Our people abroad look to us. The press demands action.',
    reward: 'Claims on kin provinces held by neighbours, war support +10 for 2 years',
    weight: (world, nation) => ((nation.economy?.kinAbroad ?? 0) >= 0.12 ? 2.4 : 0),
    apply: (game, nation) => {
      const world = game.world;
      const claims = new Set(nation.claims ?? []);
      for (const province of world.provinces ?? []) {
        if (province.owner < 0 || province.owner === nation.id) continue;
        if (province.culture !== nation.culture && province.homeland !== nation.culture) continue;
        claims.add(province.id);
      }
      nation.claims = [...claims];
      addTimedModifier(nation, 'agenda-kin', 'Irredentism', 104, { warSupport: 0.1 }, game.turns.turn);
      return `Claims laid on ${claims.size} provinces of our kin.`;
    },
  },
  national_romanticism: {
    name: 'National Romanticism', weeks: 12,
    desc: 'Poets, anthems and a national epic.',
    reward: 'War support +8 for 2 years, prestige +5',
    weight: (world, nation) => (world.turn > 400 ? 1 : 0.5),
    apply: (game, nation) => {
      nation.prestige = (nation.prestige ?? 0) + 5;
      addTimedModifier(nation, 'agenda-romantic', 'National Romanticism', 104, { warSupport: 0.08 }, game.turns.turn);
      return 'The anthem is sung in every square.';
    },
  },
  diplomatic_charm: {
    name: 'Diplomatic Charm Offensive', weeks: 8,
    desc: 'Envoys, gifts and a royal visit abroad.',
    reward: 'Infamy −6',
    weight: (world, nation) => ((nation.infamy ?? 0) > 8 ? 2 : 0.2),
    apply: (game, nation) => {
      addInfamy(nation, -6);
      return 'The courts of the world are soothed.';
    },
  },
  develop_heartland: {
    name: 'Develop the Heartland', weeks: 16,
    desc: 'Roads, markets and town charters for the core provinces.',
    reward: '+1 development in the three most populous provinces',
    weight: () => 1.1,
    apply: (game, nation) => {
      const cap = Math.min(DEVELOPMENT_MAX, developmentCap(nation) + 1);
      const names = [];
      for (const province of byPopulation(ownProvinces(game.world, nation))) {
        if (names.length >= 3) break;
        if (province.econ.development >= cap) continue;
        province.econ.development++;
        names.push(provinceName(province.center));
      }
      return names.length ? `${names.join(', ')} developed.` : 'The heartland is already developed.';
    },
  },
  coal_and_iron: {
    name: 'Coal and Iron', weeks: 16,
    desc: 'Open new pits in the richest seams.',
    reward: '+1 Mine in two deposit provinces',
    weight: (world, nation) => (ownProvinces(world, nation).some((p) => p.deposits?.length) ? 1.1 : 0),
    apply: (game, nation) => {
      const list = byPopulation(ownProvinces(game.world, nation).filter((p) => p.deposits?.length));
      const names = grantBuilding(game.world, list, 'mine', 2);
      return names.length ? `New mines in ${names.join(', ')}.` : 'The surveyors found no free ground.';
    },
  },
  conscription_drive: {
    name: 'Recruitment Drive', weeks: 8,
    desc: 'Bounties and patriotic posters.',
    reward: 'Manpower +15% for 2 years',
    weight: (world, nation) => ((nation.economy?.warFronts ?? 0) > 0 ? 1.8 : 0.5),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-recruit', 'Recruitment Drive', 104, { manpower: 0.15 }, game.turns.turn);
      return 'Volunteers queue at the depots.';
    },
  },
  tax_census: {
    name: 'Cadastral Survey', weeks: 12,
    desc: 'Map every field; tax what is really there.',
    reward: 'Tax income +10% for 3 years',
    weight: (world, nation) => ((nation.gold ?? 0) < 50 ? 1.6 : 0.8),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-census', 'Cadastral Survey', 156, { tax: 0.1 }, game.turns.turn);
      return 'The survey is complete; the treasury smiles.';
    },
  },
  peace_dividend: {
    name: 'Peace Dividend', weeks: 12,
    desc: 'Turn swords into ploughshares.',
    reward: 'Consumer goods need −5% and stability +3 for 2 years',
    weight: (world, nation) => ((nation.economy?.warFronts ?? 0) === 0 && (nation.politics?.warWeeks ?? 0) === 0 ? 0.9 : 0),
    apply: (game, nation) => {
      addTimedModifier(nation, 'agenda-peace', 'Peace Dividend', 104, { consumerNeed: -0.05, stability: 0.03 }, game.turns.turn);
      return 'Workshops return to civilian goods.';
    },
  },
};
export const AGENDA_IDS = Object.keys(AGENDA);

export function ensureAgenda(nation) {
  const agenda = nation.agenda ?? {};
  nation.agenda = agenda;
  if (!Array.isArray(agenda.options)) agenda.options = [];
  if (!agenda.done || typeof agenda.done !== 'object') agenda.done = {};
  agenda.current ??= null;
  agenda.log ??= [];
  return agenda;
}

/** Şu an sunulabilir mi (koşul, tekrar beklemesi, tek seferlik)? */
function eligible(world, nation, id, turn) {
  const template = AGENDA[id];
  const agenda = ensureAgenda(nation);
  const last = agenda.done[id];
  if (last != null && (template.once || turn - last < REPEAT_COOLDOWN)) return 0;
  return Math.max(0, template.weight(world, nation) ?? 0);
}

/** Üç seçenek: uygun şablonlar ağırlıkla, tohumdan deterministik çekilir. */
export function offerAgenda(world, nation, turn) {
  const agenda = ensureAgenda(nation);
  const rng = makeRng(`${world.seed}-agenda-${nation.id}-${turn}`);
  const pool = AGENDA_IDS.map((id) => ({ id, weight: eligible(world, nation, id, turn) }))
    .filter((entry) => entry.weight > 0);
  const options = [];
  while (options.length < OPTIONS && pool.length) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    let index = 0;
    for (; index < pool.length - 1; index++) {
      roll -= pool[index].weight;
      if (roll <= 0) break;
    }
    options.push(pool.splice(index, 1)[0].id);
  }
  agenda.options = options;
  agenda.offeredAt = turn;
  return options;
}

export function chooseAgenda(game, nation, id) {
  const agenda = ensureAgenda(nation);
  if (agenda.current || !agenda.options.includes(id)) return false;
  const turn = game.turns?.turn ?? game.world.turn ?? 0;
  agenda.current = { id, start: turn, weeks: AGENDA[id].weeks };
  agenda.options = [];
  game.emit?.('politics', nation.id);
  return true;
}

/** YZ seçimi: en ağır seçenek (eşitlikte sıra). */
function aiChoose(game, nation) {
  const agenda = ensureAgenda(nation);
  const world = game.world;
  let best = null;
  let bestWeight = -1;
  for (const id of agenda.options) {
    const weight = AGENDA[id].weight(world, nation) ?? 0;
    if (weight > bestWeight) {
      best = id;
      bestWeight = weight;
    }
  }
  if (best) chooseAgenda(game, nation, best);
}

/**
 * Haftalık gündem: biten iş sonucunu verir, boşta olana seçenek sunulur, YZ
 * (ve AUTO'daki oyuncu) hemen seçer. Oyuncunun seçimi beklenir — süre
 * işlemez, seçilmeyen gündem bedavaya ilerlemez.
 */
export function runAgenda(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  for (const nation of world.nations) {
    if (!nation.alive || nation.rebelCulture != null && nation.archetype === 'rebel') continue;
    const agenda = ensureAgenda(nation);
    const current = agenda.current;
    if (current && turn - current.start >= current.weeks) {
      const text = AGENDA[current.id].apply(game, nation);
      agenda.done[current.id] = turn;
      agenda.log.unshift({ id: current.id, turn, text });
      if (agenda.log.length > 12) agenda.log.pop();
      agenda.current = null;
      nation.prestige = (nation.prestige ?? 0) + 2;
      refreshModifiers(nation, turn);
      if (nation.id === game.turns?.playerNation) {
        game.turns.addLog(`${AGENDA[current.id].name} complete: ${text}`, { kind: 'POLITICS' });
      }
    }
    if (agenda.current) continue;
    if (!agenda.options.length || turn - (agenda.offeredAt ?? 0) > 104) offerAgenda(world, nation, turn);
    const isPlayer = nation.id === game.turns?.playerNation;
    if (!isPlayer || nation.delegation?.agenda) aiChoose(game, nation);
  }
}

/** Gündem ekranının modeli. */
export function agendaView(world, nation, turn = world.turn ?? 0) {
  const agenda = ensureAgenda(nation);
  const current = agenda.current
    ? {
      ...agenda.current,
      name: AGENDA[agenda.current.id].name,
      reward: AGENDA[agenda.current.id].reward,
      progress: clamp((turn - agenda.current.start) / agenda.current.weeks, 0, 1),
      weeksLeft: Math.max(0, agenda.current.start + agenda.current.weeks - turn),
    }
    : null;
  return {
    current,
    options: agenda.options.map((id) => ({ id, ...AGENDA[id] })),
    log: agenda.log,
    kinAbroad: kinAbroadShare(world, nation),
  };
}
