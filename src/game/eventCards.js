// OLAY KARTLARI — sistemlere bağlı, seçenekli olaylar (TASARIM.md §9).
//
// Her kartın bir KOŞULU vardır (kıtlık ancak gıda açığında, grev ancak
// tüketim malı kıtken ve sosyalistler doğduktan sonra), haftalık bir
// olasılığı ve iki-üç seçeneği. Seçenekler somuttur: altın, SG, geçici
// değiştirici, bina. YZ ağırlıkla hemen seçer; oyuncuya kart açılır, sekiz
// hafta cevapsız kalırsa ilk seçenek uygulanır (oyun kilitlenmez).
//
// Dünya olayları (worldEvents.js): barut fıçısı, kızıl yıllar, büyük grip,
// buhran. Başlarken her ulusa kendi kartı gelir (`world: true` kartlar), etkisi
// süresince değiştirici, milliyetçilik, parti ve savaş gerilimi kanallarından.

import { makeRng } from '../core/rng.js';
import { addTimedModifier, refreshModifiers } from './modifiers.js';
import { settle } from './treasury.js';
import { canSpend, spend } from './econ/investment.js';
import { IC_SCALE } from './econ/defs.js';
import { changeGovernment, setRuling } from './politics.js';
import { addInfamy } from './infamy.js';
import { turnOfYear } from './calendar.js';
import { WORLD_EVENTS, WORLD_EVENT_IDS, worldEventActive, worldEventSchedule } from './worldEvents.js';
import { declareWar } from './diplomacy.js';
import { scoreboard } from './hegemony.js';
import { suggestWarGoal } from './peace.js';
import { money } from './money.js';

const units = (nation) => Math.max(1, (nation.economy?.population ?? 0) / 100000);
const atWar = (nation) => (nation.economy?.warFronts ?? 0) > 0;
const exhaustionOf = (nation) => nation.politics?.exhaustion ?? 0;

/**
 * Devrim kartının eşikleri (redesign D5). Kızıl yıllar kolu da yorgunluk
 * ister: kızıl yıllar bitkin devleti devirir, yalnız istikrarsız olanı değil.
 * MAX_OCCUPIED: kalabalık KENDİ başkentimizde toplanır — toprağının çoğu
 * işgal altındaki ülkede devrim değil teslim olur. Ölçüm (P5, STAT3 1904-16):
 * yorgunluğu ≥ 0.75 savaşta kalanların çoğu koalisyonun ezdiği, %50-100'ü
 * işgal altında 60-170 hafta bekleyen ülkelerdi.
 * CHANCE: bu kapılarla haftalık 0.05'te 16 | 11 | 18, 0.03'te dört koşuda
 * 5-13 devrim/kampanya (STAT1-3); kapı haftalarından kestirim (gerçekleşenle
 * ±2 tuttu) 0.015'te on iki tohum-koşusunun hepsinde 2.9-7.8.
 */
export const REVOLUTION = {
  RED_YEARS_EXHAUSTION: 0.6, RED_YEARS_STABILITY: 0.5,
  EXHAUSTION: 0.75, STABILITY: 0.45, MAX_OCCUPIED: 0.25,
  CHANCE: 0.015,
};

/** Cevapsız kart bu kadar hafta sonra ilk seçenekle kapanır. */
export const EVENT_TIMEOUT = 8;
/** Ulus başına haftada en çok bir kart; aynı kart bu kadar hafta tekrarlanmaz. */
const DEFAULT_COOLDOWN = 260;

function timed(game, nation, id, label, weeks, effects) {
  addTimedModifier(nation, id, label, weeks, effects, game.turns?.turn ?? 0);
  refreshModifiers(nation, game.turns?.turn ?? 0);
}

function bump(nation, party, amount) {
  const support = nation.politics?.support;
  if (!support || !(party in support)) return;
  support[party] = Math.max(0, support[party] + amount);
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
      { label: 'Open the state granaries', detail: 'Paid from the development fund; stability +4 for half a year',
        cost: (nation) => Math.round(units(nation) * 1.2),
        available: (nation) => canSpend(nation, Math.round(units(nation) * 1.2)),
        ai: (nation) => (canSpend(nation, units(nation) * 2.4) ? 2 : 0.5),
        apply: (game, nation, option) => {
          spend(nation, option.cost(nation));
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
    trigger: (world, nation) => (nation.economy?.consumer?.ratio ?? 1) < 0.9 && (nation.economy?.ic?.total ?? 0) >= 3 * IC_SCALE,
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
    // Bezginlik iradeden değil YORGUNLUKTAN gelir (redesign D5 merdiveni 0.45):
    // irade artık savaşta toplanıyor, kayıp ve savaş yılı yorgunluğu besliyor.
    trigger: (world, nation) => atWar(nation) && (nation.politics?.warWeeks ?? 0) >= 52
      && exhaustionOf(nation) >= 0.45,
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
  motor_boom: {
    title: 'The Motor Boom',
    text: 'Workshops that built bicycles now build motorcars. Their investors want the state to stand behind the loans.',
    trigger: (world, nation) => (world.turn ?? 0) >= turnOfYear(1908) && canSpend(nation, 180)
      && (nation.economy?.ic?.total ?? 0) >= 8 * IC_SCALE,
    chance: 0.012,
    options: [
      { label: 'Guarantee the loans', detail: `Costs ${money(120, 0)} from the development fund; industry +4% for three years`,
        available: (nation) => canSpend(nation, 120),
        ai: () => 1.5,
        apply: (game, nation) => {
          spend(nation, 120);
          timed(game, nation, 'event-motor', 'Motor industry', 156, { ic: 0.04 });
        } },
      { label: 'Tax the boom', detail: `+${money(60, 0)} to the development fund`,
        ai: () => 1,
        apply: (game, nation) => settle(nation, 'grant', 60) },
    ],
  },
  // KIZIL YILLAR: uzun savaşın ya da dalganın çökerttiği devlette devrim.
  revolution: {
    title: 'Bread, Peace and Land',
    text: 'Soldiers\' councils sit in the barracks and the factories. The crowd in the capital will not go home.',
    // Kızıl yıllarda savaşta ya da savaştan yeni çıkmış, bitkin ve istikrarsız
    // ülke; başka zaman merdivenin devrim basamağında (yorgunluk 0.75,
    // istikrar < 0.45), savaşta. İki kolda da kalabalık KENDİ başkentinde
    // toplanır (işgal < %25).
    //
    // P0 sayımı 30 | 34 | 26 devrim/kampanya verdi (yorum 2-4 diyordu): eski
    // ikinci kol (iki yıllık savaş + irade < 0.35 + istikrar < 0.35) 1904-12
    // kümesini, kızıl yıllar kolu (istikrar < 0.6, savaşta) 1917-20'deki
    // 18-22'yi üretiyordu. P5 ölçümü (STAT1-3): eşikler yorgunluğa taşınınca
    // ilk sürümde 39 | 58 | 70 (ikinci kol her yerde), kızıl yıllara 0.6
    // yorgunluk eklenince 16 | 11 | 18 — kızıl yıllar kolu %50-100 işgal
    // altındaki ve isyancı devletleri de deviriyordu.
    trigger: (world, nation) => {
      const exhaustion = exhaustionOf(nation);
      const stability = nation.stability ?? 0.5;
      if ((nation.economy?.occupiedShare ?? 0) >= REVOLUTION.MAX_OCCUPIED) return false;
      if (worldEventActive(world, 'red_years', world.turn ?? 0)
        && stability < REVOLUTION.RED_YEARS_STABILITY && exhaustion >= REVOLUTION.RED_YEARS_EXHAUSTION
        && (atWar(nation) || (nation.politics?.warWeeks ?? 0) >= 13)) return true;
      return stability < REVOLUTION.STABILITY && atWar(nation) && exhaustion >= REVOLUTION.EXHAUSTION;
    },
    // Haftalık olasılık sabitten okunur (kalibrasyon kolu).
    get chance() { return REVOLUTION.CHANCE; },
    options: [
      { label: 'Proclaim the republic', detail: 'Becomes a Republic; stability +6 for a year; war support −10; the left gains',
        available: (nation) => nation.politics?.government !== 'republic',
        // Kaybedilen ya da sevilmeyen savaş tacı düşürür.
        ai: (nation) => ((nation.stability ?? 0.5) < 0.45 || (nation.warSupport ?? 0.5) < 0.4 ? 2 : 1.1),
        apply: (game, nation) => {
          changeGovernment(game, nation, 'republic', game.turns.turn,
            { effects: { stability: 0.06 }, weeks: 52, name: 'The Republic' });
          timed(game, nation, 'event-revolution', 'Revolution', 52, { warSupport: -0.1 });
          bump(nation, 'socialist', 10);
          bump(nation, 'liberal', 5);
        } },
      { label: 'Bow to the councils', detail: 'Stability +4 for a year; war support −10; socialists gain',
        available: (nation) => nation.politics?.government === 'republic',
        ai: () => 1.4,
        apply: (game, nation) => {
          timed(game, nation, 'event-revolution', 'Councils', 52, { stability: 0.04, warSupport: -0.1 });
          bump(nation, 'socialist', 15);
        } },
      { label: 'Crush the soviets', detail: 'Costs 30 political power; stability −6 and unrest +30% for two years; nationalists gain',
        available: (nation) => (nation.power ?? 0) >= 30,
        ai: (nation) => (nation.politics?.government === 'absolutism' ? 1.4 : 0.8),
        apply: (game, nation) => {
          nation.power -= 30;
          timed(game, nation, 'event-revolution', 'White terror', 104, { stability: -0.06, unrest: 0.3 });
          bump(nation, 'nationalist', 6);
        } },
    ],
  },
  // AŞIRILAR ÇAĞI: istikrarsız cumhuriyette uniformalı kurtarıcı.
  strongman: {
    title: 'The Strongman',
    text: 'A decorated veteran promises order, bread and revenge. His followers march in uniform.',
    trigger: (world, nation) => (world.turn ?? 0) >= turnOfYear(1920)
      && nation.politics?.government !== 'absolutism'
      && (nation.politics?.support?.nationalist ?? 0) >= 25 && (nation.stability ?? 0.5) < 0.6,
    chance: 0.02,
    options: [
      { label: 'Give him the chancellery', detail: 'Rule by decree: no elections, nationalists govern; war support +10 and stability +5 for two years',
        ai: (nation) => ((nation.stability ?? 0.5) < 0.5 ? 2 : 0.9),
        apply: (game, nation) => {
          changeGovernment(game, nation, 'absolutism', game.turns.turn,
            { effects: { stability: 0.05, warSupport: 0.1 }, weeks: 104, name: 'The New Order' });
          setRuling(game, nation, 'nationalist', game.turns.turn);
          nation.politics.rulingLock = game.turns.turn + 52;
          bump(nation, 'liberal', -10);
        } },
      { label: 'Defend the constitution', detail: 'Costs 40 political power; stability −4 for a year; nationalists lose ground',
        available: (nation) => (nation.power ?? 0) >= 40,
        ai: () => 1.2,
        apply: (game, nation) => {
          nation.power -= 40;
          timed(game, nation, 'event-strongman', 'Emergency laws', 52, { stability: -0.04 });
          bump(nation, 'nationalist', -8);
        } },
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
        apply: (game, nation) => timed(game, nation, 'event-cholera', 'Quarantine', 26, { output: -0.07 }) },
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
        // Liberaller güçlüyse taç da yoldan çekilir: yokken YZ hep sansürü
        // seçiyordu ve 45 yılın sonunda 39 ulusun 29-32'si mutlakiyetti.
        ai: (nation) => ((nation.stability ?? 0.5) < 0.4 || (nation.politics?.support?.liberal ?? 0) >= 35 ? 2 : 0.8),
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
      { label: 'Fund his laboratory', detail: `Costs ${money(75, 0)} from the development fund; research +15% for a year`,
        available: (nation) => canSpend(nation, 75),
        ai: (nation) => (canSpend(nation, 150) ? 1.6 : 0.4),
        apply: (game, nation) => {
          spend(nation, 75);
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
      { label: 'Sell it abroad', detail: '+ money',
        cost: (nation) => Math.round(units(nation) * 0.9),
        ai: () => 1.2,
        // Defterde 'grant' satırına: 'exports' alıcısız ihracat geliri gibi
        // görünüyor, ticaretin para korunumunu bozuyordu.
        apply: (game, nation, option) => settle(nation, 'grant', option.cost(nation)) },
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
      { label: 'Pensions and parades', detail: 'Costs money; stability +5 for a year',
        cost: (nation) => Math.round(units(nation) * 0.75),
        available: (nation) => canSpend(nation, Math.round(units(nation) * 0.75)),
        ai: (nation) => (canSpend(nation, units(nation) * 1.5) ? 1.5 : 0.4),
        apply: (game, nation, option) => {
          spend(nation, option.cost(nation));
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
  // --- Dünya olaylarının kartları (worldEvents.js `card`): zarla değil,
  // olay başlarken her ulusa bir kez gelir.
  mobilisation: {
    title: 'The Powder Keg',
    text: 'Alliances harden into camps. The general staffs open their railway timetables and every frontier waits for a spark.',
    world: true,
    options: [
      { label: 'Mobilise the reserves', detail: 'Manpower +15% and war support +5 for two years; stability −3',
        ai: (nation) => (nation.aggression ?? 1) * (nation.rivalId != null ? 1.3 : 0.9),
        apply: (game, nation) => {
          timed(game, nation, 'event-keg', 'Mobilised reserves', 104, { manpower: 0.15, warSupport: 0.05, stability: -0.03 });
        } },
      { label: 'Armed neutrality', detail: 'Stability +3 for two years',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-keg', 'Armed neutrality', 104, { stability: 0.03 }) },
    ],
  },
  rearmament: {
    title: 'The Road to War',
    text: 'The treaties of the last war are dead letters. Every staff draws up its plans, and every arsenal wants orders.',
    world: true,
    options: [
      { label: 'Rearm', detail: 'Production efficiency cap +10% and efficiency growth +50% for three years; war support +5',
        ai: (nation) => (nation.aggression ?? 1) * (nation.rivalId != null ? 1.4 : 1),
        apply: (game, nation) => timed(game, nation, 'event-rearm', 'Rearmament', 156,
          { lineEfficiency: 0.1, lineGain: 0.5, warSupport: 0.05 }) },
      { label: 'Seek peace in our time', detail: 'Stability +4 for three years',
        ai: () => 1.1,
        apply: (game, nation) => timed(game, nation, 'event-rearm', 'Appeasement', 156, { stability: 0.04 }) },
    ],
  },
  influenza: {
    title: 'The Great Influenza',
    text: 'A new influenza runs through the barracks and then the cities. Unlike any plague before it, it kills the young.',
    world: true,
    options: [
      { label: 'Close the schools and theatres', detail: 'Output −7% for half a year; fewer die',
        ai: (nation) => ((nation.economy?.bills?.s ?? 1) >= 1 ? 1.4 : 0.8),
        apply: (game, nation) => {
          timed(game, nation, 'event-influenza', 'Quarantine', 26, { output: -0.07 });
          timed(game, nation, 'event-influenza-care', 'Public health', 52, { growth: 0.25 });
        } },
      { label: 'Keep the factories running', detail: 'Stability −3 for a year',
        ai: () => 1,
        apply: (game, nation) => timed(game, nation, 'event-influenza', 'Open cities', 52, { stability: -0.03 }) },
    ],
  },
  depression: {
    title: 'The Great Depression',
    text: 'The exchanges have crashed. Banks fail, factories close, and the unemployed queue for soup.',
    world: true,
    options: [
      { label: 'Balance the budget', detail: 'Pensions and wages cut: the development fund gains; stability −4 for two years',
        cost: (nation) => Math.round(units(nation) * 0.9),
        ai: (nation) => ((nation.fund ?? 0) < 0 ? 2 : 0.9),
        apply: (game, nation, option) => {
          settle(nation, 'grant', option.cost(nation));
          timed(game, nation, 'event-depression', 'Austerity', 104, { stability: -0.04 });
        } },
      { label: 'Public works', detail: 'Paid from the development fund; investment +25% and stability +3 for two years',
        cost: (nation) => Math.round(units(nation) * 1.2),
        available: (nation) => canSpend(nation, Math.round(units(nation) * 1.2)),
        ai: (nation) => (canSpend(nation, units(nation) * 2.4) ? 1.6 : 0.5),
        apply: (game, nation, option) => {
          spend(nation, option.cost(nation));
          timed(game, nation, 'event-depression', 'Public works', 104, { investment: 0.25, stability: 0.03 });
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

/** Büyük güçlerin sayısı: kıvılcım bunların arasında aranır. */
const GREAT_POWERS = 8;

/**
 * BÜYÜK SAVAŞ KIVILCIMI: en güçlü devletler arasında rakip ya da sınır
 * komşusu çiftlerden en gerilimlisi savaşa girer (kriz gerekçesi bedelsiz).
 * Ağırlık: rakiplik ×2, sınırın uzunluğu, iki gücün puanı. Saldırgan savaş
 * desteği yüksek olandır; oyuncu otomatik saldırgan yapılmaz (declareWar
 * kuralı) — o zaman rolü karşı taraf alır. İttifak, ateşkes ya da çullanma
 * tavanı bir çifti kapatırsa sıradakine geçilir. `count` kadar AYRI çift
 * (ikinci büyük savaş iki cepheden başlar).
 * @returns {object[]} [{ aggressor, target }]
 */
export function sparkGreatWar(game, count = 1) {
  const sparks = [];
  const busy = new Set();
  for (let i = 0; i < count; i++) {
    const spark = sparkOne(game, busy);
    if (!spark) break;
    sparks.push(spark);
    busy.add(spark.aggressor.id);
    busy.add(spark.target.id);
  }
  return sparks;
}

/** Tek kıvılcım; `busy` bu olayda zaten savaşa sokulmuş uluslardır. */
function sparkOne(game, busy) {
  const world = game.world;
  const board = scoreboard(world).slice(0, GREAT_POWERS);
  const player = game.turns?.playerNation;
  const pairs = [];
  for (const x of board) {
    for (const y of board) {
      const a = x.nation;
      const b = y.nation;
      if (a.id >= b.id || busy.has(a.id) || busy.has(b.id)) continue;
      const contact = world.contacts?.[a.id]?.[b.id] ?? 0;
      const rival = a.rivalId === b.id || b.rivalId === a.id;
      if (!rival && contact <= 0) continue;
      pairs.push({ a, b, weight: (rival ? 2 : 1) * (1 + Math.log(1 + contact)) * (x.total + y.total) });
    }
  }
  pairs.sort((p, q) => q.weight - p.weight || p.a.id - q.a.id || p.b.id - q.b.id);
  for (const { a, b } of pairs) {
    let aggressor = (a.warSupport ?? 0) >= (b.warSupport ?? 0) ? a : b;
    let target = aggressor === a ? b : a;
    if (aggressor.id === player) [aggressor, target] = [target, aggressor];
    const goal = suggestWarGoal(world, aggressor.id, target.id);
    if (declareWar(game, aggressor.id, target.id, { reason: 'crisis', goal: goal?.id ?? null })) {
      return { aggressor, target };
    }
  }
  return null;
}

/** Haftalık: dünya olayı, sonra ulus başına en çok bir kart; zaman aşımı. */
export function runEventCards(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  // DÜNYA OLAYLARI: tohuma bağlı haftada, bir kez; etkisi her ulusa yazılır.
  const schedule = worldEventSchedule(world);
  for (const id of WORLD_EVENT_IDS) {
    const entry = schedule[id];
    if (entry.fired || turn < entry.start) continue;
    entry.fired = true;
    const event = WORLD_EVENTS[id];
    for (const nation of world.nations) {
      if (!nation.alive || !nation.politics) continue;
      if (event.effects) {
        addTimedModifier(nation, `world-${id}`, event.title, entry.until - turn, event.effects, turn);
        refreshModifiers(nation, turn);
      }
      if (event.card) fire(game, nation, event.card, turn);
    }
    const sparks = event.spark ? sparkGreatWar(game, event.spark === true ? 1 : event.spark) : [];
    const said = sparks.map((spark) => `${spark.aggressor.name} declares war on ${spark.target.name}.`).join(' ');
    game.turns.addLog(said ? `${event.log} ${said}` : event.log, { kind: 'NATION' });
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
        detail: option.cost ? `${option.detail} (${money(option.cost(nation), 0)})` : option.detail,
        available: optionAvailable(option, nation),
      })),
    };
  });
}
