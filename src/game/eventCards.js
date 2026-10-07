// OLAY KARTLARI — sistemlere bağlı, seçenekli olaylar (TASARIM.md §9).
//
// Her kartın bir KOŞULU vardır (kıtlık ancak gıda açığında, grev ancak
// tüketim malı kıtken ve sosyalistler doğduktan sonra), haftalık bir
// olasılığı ve iki-üç seçeneği. Seçenekler somuttur: altın, SG, geçici
// değiştirici, bina. YZ ağırlıkla hemen seçer; oyuncuya kart açılır, sekiz
// hafta cevapsız kalırsa ilk seçenek uygulanır (oyun kilitlenmez).
//
// Dünya olayı: ULUSLARIN BAHARI (1848 dolayı). İki yıl boyunca milliyetçilik
// çağı ×1.3 (culture.nationalismEra), liberal ve milliyetçi destek sıçrar,
// her ulusa kendi kartı gelir.

import { makeRng } from '../core/rng.js';
import { addTimedModifier, refreshModifiers } from './modifiers.js';
import { settle } from './treasury.js';
import { changeGovernment, SOCIALIST_TURN } from './politics.js';
import { addInfamy } from './infamy.js';
import { BUILDINGS } from './econ/defs.js';
import { buildingLevels, buildingSlots } from './provinces.js';

const units = (nation) => Math.max(1, (nation.economy?.population ?? 0) / 100000);
const atWar = (nation) => (nation.economy?.warFronts ?? 0) > 0;

/** Cevapsız kart bu kadar hafta sonra ilk seçenekle kapanır. */
export const EVENT_TIMEOUT = 8;
/** Ulus başına haftada en çok bir kart; aynı kart bu kadar hafta tekrarlanmaz. */
const DEFAULT_COOLDOWN = 260;
/** Ulusların Baharı: 1848 dolayı, iki yıl. */
const SPRING_TURN = 625;
const SPRING_WEEKS = 104;

function timed(game, nation, id, label, weeks, effects) {
  addTimedModifier(nation, id, label, weeks, effects, game.turns?.turn ?? 0);
  refreshModifiers(nation, game.turns?.turn ?? 0);
}

function bump(nation, party, amount) {
  const support = nation.politics?.support;
  if (!support || !(party in support)) return;
  support[party] = Math.max(0, support[party] + amount);
}

function grantRailways(world, nation, count) {
  const list = (world.provinces ?? [])
    .filter((p) => p.owner === nation.id && p.econ)
    .sort((a, b) => b.econ.population - a.econ.population || a.id - b.id);
  let given = 0;
  for (const province of list) {
    if (given >= count) break;
    const econ = province.econ;
    if ((econ.buildings.railway ?? 0) >= BUILDINGS.railway.max) continue;
    if (buildingLevels(econ) >= buildingSlots(econ)) continue;
    econ.buildings.railway++;
    given++;
  }
  return given;
}

/**
 * Kart tablosu. `trigger` koşul (bool), `chance` haftalık olasılık,
 * `options[i].ai` YZ ağırlığı (yüksek olan seçilir), `apply` etkiyi uygular.
 */
export const EVENT_CARDS = {
  famine: {
    title: 'Famine in the Provinces',
    text: 'The harvest has failed and bread prices riot. The people look to the capital.',
    trigger: (world, nation) => (nation.economy?.resources?.FOOD?.ratio ?? 1) < 0.85,
    chance: 0.06,
    options: [
      { label: 'Open the state granaries', detail: 'Costs gold; stability +4 for half a year',
        cost: (nation) => Math.round(units(nation) * 0.8),
        ai: (nation) => ((nation.gold ?? 0) > units(nation) ? 2 : 0.5),
        apply: (game, nation, option) => {
          settle(nation, 'outlay', -option.cost(nation));
          timed(game, nation, 'event-famine', 'Granaries opened', 26, { stability: 0.04 });
        } },
      { label: 'Let the market decide', detail: 'Stability −6 for half a year, socialists gain',
        ai: () => 1,
        apply: (game, nation) => {
          timed(game, nation, 'event-famine', 'Famine', 26, { stability: -0.06 });
          bump(nation, 'socialist', 4);
        } },
    ],
  },
  strike: {
    title: 'General Strike',
    text: 'Workers in the mill towns down tools: the shops are empty and the wages are not.',
    trigger: (world, nation) => (world.turn ?? 0) >= SOCIALIST_TURN
      && (nation.economy?.consumer?.ratio ?? 1) < 0.9 && (nation.economy?.ic?.total ?? 0) >= 3,
    chance: 0.03,
    options: [
      { label: 'Concede higher wages', detail: 'Industry −5% for a year; stability +3; socialists gain',
        ai: (nation) => (nation.politics?.ruling === 'socialist' || nation.politics?.ruling === 'liberal' ? 2 : 0.8),
        apply: (game, nation) => {
          timed(game, nation, 'event-strike', 'Wage settlement', 52, { ic: -0.05, stability: 0.03 });
          bump(nation, 'socialist', 5);
        } },
      { label: 'Send in the troops', detail: 'Stability −5 for a year; conservatives gain',
        ai: (nation) => (nation.politics?.ruling === 'conservative' ? 2 : 1),
        apply: (game, nation) => {
          timed(game, nation, 'event-strike', 'Strike broken', 52, { stability: -0.05 });
          bump(nation, 'conservative', 3);
          bump(nation, 'socialist', 3);
        } },
    ],
  },
  war_weariness: {
    title: 'The Nation Tires of War',
    text: 'Casualty lists fill the newspapers. Mothers march on the ministry.',
    trigger: (world, nation) => atWar(nation) && (nation.politics?.warWeeks ?? 0) >= 52
      && (nation.warSupport ?? 0.5) < 0.35,
    chance: 0.04,
    options: [
      { label: 'Promise an honourable peace', detail: 'Stability +5 for a year; war support −5',
        ai: () => 1.5,
        apply: (game, nation) => {
          timed(game, nation, 'event-weary', 'Promise of peace', 52, { stability: 0.05, warSupport: -0.05 });
        } },
      { label: 'Rally the nation', detail: 'Costs 30 political power; war support +8 for a year',
        ai: (nation) => ((nation.power ?? 0) > 60 ? 1.6 : 0.2),
        available: (nation) => (nation.power ?? 0) >= 30,
        apply: (game, nation) => {
          nation.power -= 30;
          timed(game, nation, 'event-weary', 'Patriotic rally', 52, { warSupport: 0.08 });
        } },
    ],
  },
  railway_mania: {
    title: 'Railway Mania',
    text: 'Speculators float a railway company on every street. Should the state join in?',
    trigger: (world, nation) => (world.turn ?? 0) > 300 && (nation.gold ?? 0) >= 120
      && (nation.economy?.ic?.total ?? 0) >= 2,
    chance: 0.012,
    options: [
      { label: 'Guarantee the bonds', detail: 'Costs 80 gold; +1 railway in two provinces',
        ai: () => 1.5,
        apply: (game, nation) => {
          settle(nation, 'outlay', -80);
          grantRailways(game.world, nation, 2);
        } },
      { label: 'Tax the speculators', detail: '+40 gold',
        ai: () => 1,
        apply: (game, nation) => settle(nation, 'tax', 40) },
    ],
  },
  cholera: {
    title: 'Cholera Outbreak',
    text: 'Cholera spreads through the crowded quarters of the capital.',
    trigger: (world, nation) => (nation.economy?.development ?? 1) >= 2,
    chance: 0.004,
    options: [
      { label: 'Quarantine the cities', detail: 'Tax −10% for half a year',
        ai: () => 1.3,
        apply: (game, nation) => timed(game, nation, 'event-cholera', 'Quarantine', 26, { tax: -0.1 }) },
      { label: 'Keep the markets open', detail: 'Growth −40% and stability −3 for a year',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-cholera', 'Cholera', 52, { growth: -0.4, stability: -0.03 }) },
    ],
  },
  liberal_agitation: {
    title: 'Liberal Agitation',
    text: 'Students and lawyers petition the crown for a constitution.',
    trigger: (world, nation) => nation.politics?.government === 'absolutism'
      && (nation.politics?.support?.liberal ?? 0) >= 28,
    chance: 0.02,
    options: [
      { label: 'Grant a constitution', detail: 'Becomes a Constitutional Monarchy; stability +6 for a year',
        ai: (nation) => ((nation.stability ?? 0.5) < 0.4 ? 2 : 0.8),
        apply: (game, nation) => changeGovernment(game, nation, 'constitutional', game.turns.turn,
          { effects: { stability: 0.06 }, weeks: 52, name: 'New Constitution' }) },
      { label: 'Censor the press', detail: 'Costs 30 political power; stability −4 for a year',
        available: (nation) => (nation.power ?? 0) >= 30,
        ai: () => 1.2,
        apply: (game, nation) => {
          nation.power -= 30;
          timed(game, nation, 'event-censor', 'Censorship', 52, { stability: -0.04 });
          bump(nation, 'liberal', -6);
        } },
    ],
  },
  great_inventor: {
    title: 'A Great Inventor',
    text: 'A self-taught engineer demonstrates a machine that could change everything.',
    trigger: (world, nation) => (nation.economy?.literacy ?? 0) >= 0.25,
    chance: 0.006,
    options: [
      { label: 'Fund his laboratory', detail: 'Costs 50 gold; research +15% for a year',
        ai: (nation) => ((nation.gold ?? 0) > 100 ? 1.6 : 0.4),
        apply: (game, nation) => {
          settle(nation, 'outlay', -50);
          timed(game, nation, 'event-inventor', 'State laboratory', 52, { research: 0.15 });
        } },
      { label: 'Let industry buy the patent', detail: 'Industry +3% for two years',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-inventor', 'Patent', 104, { ic: 0.03 }) },
    ],
  },
  border_incident: {
    title: 'Border Incident',
    text: 'Our border guards exchanged fire with a patrol of our rival.',
    trigger: (world, nation) => nation.rivalId != null && !atWar(nation)
      && (world.contacts?.[nation.id]?.[nation.rivalId] ?? 0) > 0,
    chance: 0.008,
    options: [
      { label: 'Demand an apology', detail: 'War support +6 for a year, infamy +1',
        ai: (nation) => (nation.aggression ?? 1),
        apply: (game, nation) => {
          timed(game, nation, 'event-border', 'Border incident', 52, { warSupport: 0.06 });
          addInfamy(nation, 1);
        } },
      { label: 'Let it pass', detail: 'Stability +2 for a year',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-border', 'Calm heads', 52, { stability: 0.02 }) },
    ],
  },
  bumper_harvest: {
    title: 'Bumper Harvest',
    text: 'The granaries overflow. What shall we do with the surplus?',
    trigger: (world, nation) => (nation.economy?.resources?.FOOD?.ratio ?? 1) >= 1
      && (nation.economy?.resources?.FOOD?.produced ?? 0) > (nation.economy?.resources?.FOOD?.need ?? 0) * 1.1,
    chance: 0.006,
    options: [
      { label: 'Sell it abroad', detail: '+ gold',
        cost: (nation) => Math.round(units(nation) * 0.6),
        ai: () => 1.2,
        apply: (game, nation, option) => settle(nation, 'exports', option.cost(nation)) },
      { label: 'Feed the people', detail: 'Growth +20% for a year',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-harvest', 'Bumper harvest', 52, { growth: 0.2 }) },
    ],
  },
  emigration: {
    title: 'Emigration Wave',
    text: 'Ships leave the ports crowded with families seeking a better life abroad.',
    trigger: (world, nation) => (nation.economy?.consumer?.ratio ?? 1) < 0.85 && nation.economy?.coastal,
    chance: 0.01,
    options: [
      { label: 'Let them go', detail: '1% of the population leaves; stability +4 for a year',
        ai: () => 1.2,
        apply: (game, nation) => {
          for (const province of game.world.provinces ?? []) {
            if (province.owner === nation.id && province.econ) province.econ.population = Math.round(province.econ.population * 0.99);
          }
          timed(game, nation, 'event-emigration', 'Emigration', 52, { stability: 0.04 });
        } },
      { label: 'Close the ports', detail: 'Stability −3 for a year',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-emigration', 'Closed ports', 52, { stability: -0.03 }) },
    ],
  },
  court_scandal: {
    title: 'Scandal at Court',
    text: 'A minister\'s affairs are in every newspaper.',
    trigger: (world, nation) => nation.politics?.government !== 'republic',
    chance: 0.004,
    options: [
      { label: 'Hush it up', detail: 'Costs 40 political power',
        available: (nation) => (nation.power ?? 0) >= 40,
        ai: (nation) => ((nation.power ?? 0) > 80 ? 1.5 : 0.3),
        apply: (game, nation) => { nation.power -= 40; } },
      { label: 'Dismiss the minister', detail: 'Stability −5 for half a year',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-scandal', 'Court scandal', 26, { stability: -0.05 }) },
    ],
  },
  veterans: {
    title: 'The Veterans Return',
    text: 'The regiments march home. The men want land, pensions and a parade.',
    trigger: (world, nation) => !atWar(nation) && (nation.politics?.warWeeks ?? 0) > 0
      && (nation.politics?.warWeeks ?? 0) <= 8,
    chance: 0.25,
    cooldown: 104,
    options: [
      { label: 'Pensions and parades', detail: 'Costs gold; stability +5 for a year',
        cost: (nation) => Math.round(units(nation) * 0.5),
        ai: (nation) => ((nation.gold ?? 0) > units(nation) ? 1.5 : 0.4),
        apply: (game, nation, option) => {
          settle(nation, 'outlay', -option.cost(nation));
          timed(game, nation, 'event-veterans', 'Veterans honoured', 52, { stability: 0.05 });
        } },
      { label: 'Send them home', detail: 'Stability −3 for a year; nationalists gain',
        ai: () => 1,
        apply: (game, nation) => {
          timed(game, nation, 'event-veterans', 'Forgotten veterans', 52, { stability: -0.03 });
          bump(nation, 'nationalist', 4);
        } },
    ],
  },
  springtime: {
    title: 'The Springtime of Nations',
    text: 'Revolution sweeps the continent! Crowds demand constitutions and national freedom.',
    world: true,
    options: [
      { label: 'Grant reforms', detail: 'Liberals gain; stability +4 for two years',
        ai: (nation) => (nation.politics?.government === 'absolutism' ? 0.8 : 1.5),
        apply: (game, nation) => {
          bump(nation, 'liberal', 8);
          timed(game, nation, 'event-spring', 'Reforms of 1848', 104, { stability: 0.04 });
        } },
      { label: 'Hold firm', detail: 'Stability −6 and unrest +20% for two years',
        ai: (nation) => (nation.politics?.government === 'absolutism' ? 1.4 : 0.6),
        apply: (game, nation) => {
          timed(game, nation, 'event-spring', 'Repression of 1848', 104, { stability: -0.06, unrest: 0.2 });
          bump(nation, 'nationalist', 4);
        } },
    ],
  },
};
export const EVENT_IDS = Object.keys(EVENT_CARDS);

function ensureEvents(nation) {
  nation.cards ??= { pending: [], last: {} };
  nation.cards.pending ??= [];
  nation.cards.last ??= {};
  return nation.cards;
}

function optionAvailable(option, nation) {
  return !option.available || option.available(nation);
}

/** Seçeneği uygular (oyuncu ya da YZ); kartı kuyruktan düşürür. */
export function resolveCard(game, nation, cardKey, optionIndex) {
  const state = ensureEvents(nation);
  const index = state.pending.findIndex((entry) => entry.key === cardKey);
  if (index < 0) return false;
  const entry = state.pending[index];
  const card = EVENT_CARDS[entry.id];
  const option = card?.options[optionIndex];
  if (!option || !optionAvailable(option, nation)) return false;
  state.pending.splice(index, 1);
  option.apply(game, nation, option);
  game.emit?.('politics', nation.id);
  return true;
}

function aiOption(card, nation) {
  let best = 0;
  let bestWeight = -Infinity;
  card.options.forEach((option, index) => {
    if (!optionAvailable(option, nation)) return;
    const weight = option.ai ? option.ai(nation) : 1;
    if (weight > bestWeight) {
      best = index;
      bestWeight = weight;
    }
  });
  return best;
}

function fire(game, nation, id, turn) {
  const state = ensureEvents(nation);
  state.last[id] = turn;
  const card = EVENT_CARDS[id];
  const key = `${id}-${turn}`;
  state.pending.push({ key, id, turn });
  const isPlayer = nation.id === game.turns?.playerNation;
  if (!isPlayer) {
    resolveCard(game, nation, key, aiOption(card, nation));
  } else {
    game.turns.addLog(card.title, { kind: 'POLITICS' });
    game.emit?.('card', { nationId: nation.id, key });
  }
}

/** Haftalık: dünya olayı, sonra ulus başına en çok bir kart; zaman aşımı. */
export function runEventCards(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  // ULUSLARIN BAHARI: tohuma bağlı bir haftada, bir kez.
  if (!world.spring) {
    const offset = Math.floor(makeRng(`${world.seed}-spring`)() * 40) - 20;
    world.spring = { start: SPRING_TURN + offset, until: SPRING_TURN + offset + SPRING_WEEKS, fired: false };
  }
  if (!world.spring.fired && turn >= world.spring.start) {
    world.spring.fired = true;
    for (const nation of world.nations) {
      if (nation.alive && nation.politics) fire(game, nation, 'springtime', turn);
    }
    game.turns.addLog('The Springtime of Nations: revolution sweeps the world.', { kind: 'NATION' });
  }
  for (const nation of world.nations) {
    if (!nation.alive || !nation.politics) continue;
    const state = ensureEvents(nation);
    // Cevapsız kart: zaman aşımında YZ seçimiyle kapanır.
    for (const entry of [...state.pending]) {
      if (turn - entry.turn >= EVENT_TIMEOUT) {
        resolveCard(game, nation, entry.key, aiOption(EVENT_CARDS[entry.id], nation));
      }
    }
    if (state.pending.length) continue;
    const rng = makeRng(`${world.seed}-cards-${nation.id}-${turn}`);
    for (const id of EVENT_IDS) {
      const card = EVENT_CARDS[id];
      if (card.world) continue;
      const roll = rng();
      if (turn - (state.last[id] ?? -9999) < (card.cooldown ?? DEFAULT_COOLDOWN)) continue;
      if (roll >= card.chance) continue;
      if (!card.trigger(world, nation)) continue;
      fire(game, nation, id, turn);
      break;
    }
  }
}

/** Oyuncunun bekleyen kartları (ekranın modeli). */
export function pendingCards(nation) {
  return ensureEvents(nation).pending.map((entry) => {
    const card = EVENT_CARDS[entry.id];
    return {
      key: entry.key,
      id: entry.id,
      title: card.title,
      text: card.text,
      turn: entry.turn,
      options: card.options.map((option, index) => ({
        index,
        label: option.label,
        detail: option.cost ? `${option.detail} (${option.cost(nation)} gold)` : option.detail,
        available: optionAvailable(option, nation),
      })),
    };
  });
}
