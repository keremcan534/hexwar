// SÖZLÜK — kartların içindeki vurgulu terimlerin açıklaması (iç içe katman).
//
// Paradox'un iç içe tooltip'i "stability"nin üstüne gelince istikrarın ne
// olduğunu söyler; kart metni terimi tipTerm ile sarar, açıklama buradan
// gelir. Kural tooltipData.js ile aynı: CÜMLEDEKİ HER SAYI oyundan okunur —
// sabit (defs, CULTURE, COURSE…), döküm fonksiyonu (courseView,
// legitimacyOf…) ya da oyunun kendi saf fonksiyonunun bir uçta
// değerlendirilmesi (istikrar %0 iken powerIncome). Formül burada yeniden
// yazılmaz: yazılsaydı ayar değişince sözlük oyundan ayrışırdı.
//
// Katman notu: yalnız HTML dizgisi kurar; oyun durumunu okur, değiştirmez.
// Uçta değerlendirme ulusun KOPYASIYLA yapılır (yayılım), asıl ulusa dokunmaz.

import { provideTooltip, tipTerm } from './tooltip.js';
import {
  COURSE, CROWN_MARGIN, ELECTION_WEEKS, EXHAUSTION, EXHAUSTION_LADDER, PARTIES, PARTY_IDS, WILL,
  courseView, governmentOf, legitimacyOf, powerIncome, stabilityBreakdown,
} from '../game/politics.js';
import { LAWS, lawOption } from '../game/laws.js';
import { describeEffects } from '../game/modifiers.js';
import { outputFactors } from '../game/econ/output.js';
import {
  CONSENT, CORE_WEEKS, growthFactors, provinceName, provinceStatus,
} from '../game/provinces.js';
import {
  BLOCKADE_COVER, EVADE_RATIO, HOME_WATERS, TRANSPORT_HOLD, TRANSPORT_LOSS, closedSeas,
} from '../game/navy.js';
import { seaTradeLoss } from '../game/seaLanes.js';
import { MIN_WAR_TURNS, TRUCE_MAX_TURNS, TRUCE_REPEAT_STEP, TRUCE_TURNS, truceLeft } from '../game/diplomacy.js';
import {
  ACCEPT_STEP, CULTURE, acceptPrice, isHomeRule, rightsHolders,
} from '../game/culture.js';
import { BREAK, MOVEMENT } from '../game/movements.js';
import { HOME_RULE_LEVY } from '../game/levy.js';
import { consumerStability } from '../game/econ/industry.js';
import { developmentCap } from '../game/econ/investment.js';
import {
  DEPOSIT_DEV, DEPOSIT_DEV_BY, DEVELOPMENT_CAP_BASE, DEVELOPMENT_CAP_LITERACY, FEED, INDUSTRY_PER_DEV, INVEST, SUPPLY,
} from '../game/econ/defs.js';
import { billCap } from '../game/econ/bills.js';
import { literacyTarget } from '../game/economy.js';
import { researchPointsOf } from '../game/technology.js';
import { mod } from '../game/modifiers.js';
import { FOCUS, focusSlots } from '../game/focus.js';
import { generalCost, generalModifier } from '../game/command.js';

const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d)}%`;
const signed = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v ?? 0).toFixed(d)}`;
/** İstikrar/irade puanı (0-1 ölçeğinden): 0.05 → "+5". */
const pts = (v, d = 0) => `${v >= 0 ? '+' : '−'}${Math.abs((v ?? 0) * 100).toFixed(d)}`;
const times = (v) => `×${(v ?? 1).toFixed(2)}`;
const years = (weeks) => `${Math.round(weeks / 52)} years`;

/**
 * Tam kartı olan kavramlar kendi sağlayıcısını açar (canlı döküm, iç içe);
 * ötekiler sözlük girdisidir. Kart metni yalnız `term()` çağırır: terimin
 * hangi sağlayıcıda yaşadığını bilmek zorunda kalmaz.
 */
const ROUTES = {
  power: 'power', stability: 'stability', warsupport: 'warsupport', infamy: 'infamy', manpower: 'manpower',
  bills: 'bills', fund: 'fund', feeding: 'feed', output: 'output', industry: 'ic', develop: 'develop',
};

/** Kart içi vurgulu terim: `term('stability', 'stability')`. */
export function term(key, label = key) {
  const route = ROUTES[key];
  return route ? tipTerm(route, label) : tipTerm('term', label, key);
}

/** Yasanın kendi kartı (seçenekler ve bedel) terim olarak. */
export const lawTerm = (lawId, label) => tipTerm('law', label, lawId);

/* ------------------------------------------------------------------------
   Uçta değerlendirme: oyunun fonksiyonu, ulusun bir alanı değiştirilmiş
   KOPYASIYLA çağrılır. "İstikrar %0'da güç kaç kat" sorusunun cevabı
   formül kopyalamadan budur.
   ------------------------------------------------------------------------ */
const at = (nation, patch) => ({ ...nation, ...patch });
const withEconomy = (nation, patch) => ({ ...nation, economy: { ...(nation.economy ?? {}), ...patch } });
const withPolitics = (nation, patch) => ({ ...nation, politics: { ...(nation.politics ?? {}), ...patch } });
/** Kıtlıktaki ülkede büyüme dökümü çarpan taşımaz: gıda tam sayılarak okunur. */
const fed = (nation) => withEconomy(nation, {
  resources: { ...(nation.economy?.resources ?? {}), FOOD: { ...(nation.economy?.resources?.FOOD ?? {}), ratio: 1 } },
});

/** İstikrarın üç çarpanı, %0 ve %100 uçlarında ve bugün. */
export function stabilityEffects(nation) {
  const growth = (n) => growthFactors(fed(n), { development: 1 }).stability;
  return {
    power: { low: powerIncome(at(nation, { stability: 0 })).stability, high: powerIncome(at(nation, { stability: 1 })).stability, now: powerIncome(nation).stability },
    output: { low: outputFactors(at(nation, { stability: 0 })).stability, high: outputFactors(at(nation, { stability: 1 })).stability, now: outputFactors(nation).stability },
    growth: { low: growth(at(nation, { stability: 0 })), high: growth(at(nation, { stability: 1 })), now: growth(nation) },
  };
}

/** Bir istikrar kaleminin değeri, ulusun değiştirilmiş kopyasında. */
export function stabilityPartIf(world, nation, label) {
  return stabilityBreakdown(world, nation).parts.find((part) => part.label === label)?.value ?? 0;
}

export function registerGlossary(game) {
  const world = () => game.world;
  const turn = () => game.turns?.turn ?? game.world?.turn ?? 0;
  const mine = (nation) => (world().provinces ?? []).filter((p) => p.owner === nation.id && p.econ);

  const GLOSSARY = {
    exhaustion: (nation) => {
      const politics = nation.politics ?? {};
      const now = politics.exhaustion ?? 0;
      const target = politics.exhaustionTarget ?? now;
      const worst = stabilityPartIf(world(), withPolitics(nation, { exhaustion: 1 }), 'War exhaustion');
      const rows = (politics.exhaustionParts ?? []).map((part) => ({ label: part.label, value: pts(part.value), tone: 'bad' }));
      rows.push({ label: 'Heading to', value: pct(target) });
      return {
        type: 'breakdown',
        title: 'War exhaustion',
        value: pct(now),
        text: 'The price of war: casualties, years at war, the enemy on our soil, defeats, shortages and men under arms. '
          + `It moves toward its target up to ${Math.round(EXHAUSTION.UP * 100)} points a week while rising `
          + `and ${Math.round(EXHAUSTION.DOWN * 100)} while fading, so it outlasts the peace. `
          + `Above ${pct(EXHAUSTION.STABILITY_FROM)} it costs ${term('stability')} (at most ${pts(worst, 1)}); `
          + `above ${pct(WILL.CRACK_FROM)} ${term('warsupport', 'war support')} cracks (up to ${pts(-WILL.CRACK)}). `
          + `It also raises ${term('unrest')} in every state, most where peoples are not accepted.`,
        rows,
        rowsLabel: 'Now',
        effects: EXHAUSTION_LADDER.map((step) => ({ label: step.text, value: pct(step.at), tone: now >= step.at ? 'bad' : '' })),
        effectsLabel: 'The ladder',
      };
    },

    legitimacy: (nation) => {
      const legit = legitimacyOf(nation);
      const ruling = nation.politics?.ruling ?? PARTY_IDS[0];
      const support = nation.politics?.support ?? {};
      // Bir puanlık destek farkının istikrar bedeli: oyunun fonksiyonu, 10
      // puanlık yapay farkla değerlendirilir.
      const rival = PARTY_IDS.find((id) => id !== ruling) ?? PARTY_IDS[0];
      const probe = Object.fromEntries(PARTY_IDS.map((id) => [id, id === rival ? 10 : 0]));
      const perPoint = Number((Math.abs(legitimacyOf({ politics: { support: probe, ruling } }).hit / 10) * 100).toFixed(2));
      const government = governmentOf(nation);
      return {
        type: 'breakdown',
        title: 'Legitimacy',
        value: legit.gap > 0.05 ? `${pts(legit.hit, 1)} stability` : 'secure',
        text: 'Whether the people want the party that governs. When another party leads in popular support, '
          + `every point of the gap costs ${perPoint} point${perPoint === 1 ? '' : 's'} of ${term('stability')}. `
          + (!government.elections
            ? `${government.name}: no elections — the crown keeps its government, at this price.`
            : government.id === 'constitutional'
              ? `${government.name}: elections every ${years(ELECTION_WEEKS)}; the crown keeps the ${PARTIES.conservative.name} `
                + `in power unless another party leads them by more than ${CROWN_MARGIN} points.`
              : `${government.name}: elections every ${years(ELECTION_WEEKS)} bring the leading party to power.`),
        rows: [
          { label: `In government: ${PARTIES[ruling]?.name ?? '—'}`, value: `${Math.round(support[ruling] ?? 0)}%` },
          { label: `Most popular: ${PARTIES[legit.leader]?.name ?? '—'}`, value: `${Math.round(support[legit.leader] ?? 0)}%` },
          { label: 'Stability', value: pts(legit.hit, 1), tone: legit.hit < 0 ? 'bad' : '' },
        ],
        rowsLabel: 'Now',
      };
    },

    course: (nation) => {
      const view = courseView(nation);
      const name = (id) => PARTIES[id]?.name ?? id;
      const budgets = view.budgets.filter((b) => b > 0).map((b) => pct(b)).join(' or ');
      const order = describeEffects({ warSupport: COURSE.ORDER_WILL })[0] ?? '';
      const reform = describeEffects({ unrest: COURSE.REFORM_UNREST })[0] ?? '';
      return {
        type: 'breakdown',
        title: 'Course of the state',
        value: view.toward ? `toward ${name(view.toward)}` : `holding · ${name(view.leaning)}`,
        text: 'Where the state is heading on the party square: order or reform, left or right. Funding the course '
          + `spends ${budgets} of the weekly ${term('power', 'political power')}; holding it is free. `
          + 'The course draws popular support toward the party in its corner. '
          + `Full order gives ${order}; full reform gives ${reform} in every state.`,
        rows: [
          { label: 'Leaning', value: name(view.leaning) },
          { label: 'Budget', value: pct(view.budget) },
          { label: 'Cost this week', value: view.weeklyCost > 0 ? `−${view.weeklyCost.toFixed(2)} power` : 'none' },
          view.weeks != null ? { label: 'Weeks to the heading', value: String(view.weeks) } : null,
        ].filter(Boolean),
        rowsLabel: 'Now',
      };
    },

    consent: (nation) => {
      const states = mine(nation).filter((p) => p.econ.core !== false);
      let people = 0;
      let weighted = 0;
      for (const p of states) {
        people += p.econ.population ?? 0;
        weighted += (p.econ.consent ?? 1) * (p.econ.population ?? 0);
      }
      const low = states.filter((p) => (p.econ.consent ?? 1) < 0.995)
        .sort((a, b) => (a.econ.consent ?? 1) - (b.econ.consent ?? 1)).slice(0, 3);
      return {
        type: 'breakdown',
        title: 'Consent',
        value: people > 0 ? pct(weighted / people) : '—',
        text: 'What the people of a core state are willing to give. Citizens give everything. '
          + `A subject people withholds up to ${pct(CONSENT.SUBJECT_WITHHOLD)} of its share of the output as ${term('compliance')} `
          + `falls below its ceiling; a ${term('homerule', 'Home Rule')} people keeps ${pct(1 - CONSENT.HOME_RULE_QUOTA)} of its share. `
          + `No state gives less than ${pct(CONSENT.FLOOR)}. Consent cuts output and mined resources, not food or recruits.`,
        rows: low.map((p) => ({ label: provinceName(p.center), value: pct(p.econ.consent), tone: 'bad' })),
        rowsLabel: low.length ? 'Lowest' : 'Every core state gives in full',
      };
    },

    acceptance: (nation) => {
      const holders = rightsHolders(nation);
      const selfRule = holders.filter((id) => isHomeRule(nation, id)).length;
      return {
        type: 'breakdown',
        title: 'Acceptance',
        value: `${holders.length} accepted`,
        text: 'Every people stands on a ladder: subject → citizen → Home Rule → a state of its own. '
          + `Subjects have no rights: ${term('unrest')} grows with their share and the years of foreign rule, they send only the `
          + `${lawTerm('citizenship', 'citizenship law')}'s share of recruits and withhold ${term('consent')}. `
          + `Accepting a people costs ${acceptPrice(nation)} ${term('power', 'political power')} now (+${ACCEPT_STEP} for each people already accepted) `
          + `and needs ${pct(CULTURE.ACCEPT_MIN_SHARE)} of the population; the states where they are the majority become cores. `
          + `Citizens in time demand ${term('homerule', 'Home Rule')}.`,
        rows: [
          { label: 'Accepted peoples', value: String(holders.length) },
          { label: 'of which Home Rule', value: String(selfRule) },
          { label: 'Population with full rights', value: pct(nation.economy?.acceptedShare ?? 0) },
        ],
        rowsLabel: 'Now',
      };
    },

    homerule: () => ({
      type: 'mechanic',
      title: 'Home Rule',
      text: `A people with Home Rule governs itself: it keeps ${pct(1 - CONSENT.HOME_RULE_QUOTA)} of its share of the output `
        + `and sends ${pct(HOME_RULE_LEVY)} of its recruits. Its demand for a state of its own grows `
        + `${times(MOVEMENT.HOME_RULE_PACE)} as fast as a citizen's demand for Home Rule. When the demand fills, a crisis asks you `
        + `to release it as a Dominion, buy time with a concession, or refuse — then it loses its rights and its movement returns at ${MOVEMENT.REFUSE_HOME_RULE}. `
        + `A nation past ${pct(BREAK.PEACEFUL)} ${term('exhaustion', 'war exhaustion')} cannot hold it: it leaves without asking.`,
    }),

    unrest: (nation) => {
      const states = mine(nation);
      let people = 0;
      let weighted = 0;
      for (const p of states) {
        people += p.econ.population ?? 0;
        weighted += (p.econ.unrest ?? 0) * (p.econ.population ?? 0);
      }
      const top = [...states].sort((a, b) => (b.econ.unrest ?? 0) - (a.econ.unrest ?? 0)).slice(0, 3)
        .filter((p) => (p.econ.unrest ?? 0) >= 0.05);
      const stabilityHit = nation.politics?.stabilityParts?.find((part) => part.label === 'Unrest')?.value;
      return {
        type: 'breakdown',
        title: 'Unrest',
        value: people > 0 ? `${(weighted / people).toFixed(1)} / ${CULTURE.MAX_UNREST}` : '—',
        text: `How restless a state is, 0 to ${CULTURE.MAX_UNREST}; it moves ${pct(CULTURE.APPROACH)} of the way to its target each week. `
          + `Peoples that are not accepted (by their share and the ${lawTerm('citizenship', 'citizenship law')}), years of foreign rule, `
          + `fresh conquest, ${term('exhaustion', 'war exhaustion')}, occupation, short ${term('consumer', 'consumer goods')}, `
          + 'an unequal levy and harsh culture policy push it up; goods above the need, minority rights and an Integration focus calm it. '
          + `Where the people-weighted unrest of a subject people's states passes ${MOVEMENT.CALM}, its national movement grows; below, it fades. `
          + `Each point drags ${term('compliance')} down ${CULTURE.CONTROL_DRAG} a week and the average costs ${term('stability')}.`,
        rows: [
          ...top.map((p) => ({ label: provinceName(p.center), value: (p.econ.unrest ?? 0).toFixed(1), tone: (p.econ.unrest ?? 0) >= MOVEMENT.CALM ? 'bad' : '' })),
          stabilityHit != null ? { label: 'Stability now', value: pts(stabilityHit, 1), tone: 'bad' } : null,
        ].filter(Boolean),
        rowsLabel: top.length ? 'Most restless' : 'Calm everywhere',
      };
    },

    compliance: (nation) => {
      // Çekirdek dışı state'in payı oyunun kendi fonksiyonundan, uyum 0 ve
      // 100 iken (yeni alınmış, kabul edilmemiş yapay bir state'le).
      const fresh = (control) => provinceStatus(world(), {
        owner: nation.id, coreOf: -1, culture: -1, homeland: -1, tileIdx: [],
        econ: { control, ownedSince: world().turn ?? 0 },
      });
      const citizenship = lawOption(nation, 'citizenship');
      const nonCore = mine(nation).filter((p) => p.econ.core === false);
      return {
        type: 'breakdown',
        title: 'Compliance',
        value: nonCore.length ? `${nonCore.length} states not core` : 'all states core',
        text: 'How far a state answers to our rule, 0–100%. A core state gives everything; a state that is not a core '
          + `gives ${pct(fresh(0))} at no compliance and ${pct(fresh(100))} at full — output, recruits and resources alike. `
          + `It climbs each week, faster with ${term('stability')} and for accepted peoples, up to a ceiling: 100% for accepted peoples, `
          + `${pct(citizenship.ceiling)} for the rest under ${citizenship.name}. Every point of ${term('unrest')} drags it down `
          + `${CULTURE.CONTROL_DRAG} a week, and in wartime ${term('exhaustion', 'war exhaustion')} drains it where the people are not accepted. `
          + `Below ${pct(CULTURE.ASSIMILATE_CONTROL)} nobody assimilates. `
          + `A state becomes a core when its majority is accepted, when it is our people's homeland, or after ${years(CORE_WEEKS)} of rule.`,
        rows: nonCore.sort((a, b) => (a.econ.control ?? 0) - (b.econ.control ?? 0)).slice(0, 3)
          .map((p) => ({ label: provinceName(p.center), value: `${Math.round(p.econ.control ?? 0)}% → gives ${pct(p.econ.status)}`, tone: 'bad' })),
        rowsLabel: 'Least compliant',
      };
    },

    research: (nation) => {
      const base = researchPointsOf({ economy: { literacy: 0 } });
      const full = researchPointsOf({ economy: { literacy: 1 } });
      const plain = researchPointsOf({ economy: { literacy: nation.economy?.literacy ?? 0 } });
      const now = researchPointsOf(nation);
      return {
        type: 'breakdown',
        title: 'Research points',
        value: `${now.toFixed(2)} / week`,
        text: `${base.toFixed(0)} point${base === 1 ? '' : 's'} a week, and up to ${(full - base).toFixed(0)} more at full ${term('literacy')}; `
          + 'technology, ministers and parties multiply it. A technology researched before its year costs more; '
          + 'neighbours who already know it make it cheaper.',
        rows: [
          { label: `Literacy ${pct(nation.economy?.literacy)}`, value: plain.toFixed(2) },
          { label: 'Technology, ministers, parties', value: times(plain > 0 ? now / plain : 1) },
        ],
        rowsLabel: 'Now',
      };
    },

    literacy: (nation) => {
      const law = lawOption(nation, 'education');
      return {
        type: 'breakdown',
        title: 'National literacy',
        value: pct(nation.economy?.literacy, 1),
        text: `Schooling of the nation. It feeds ${term('research')}, raises the ${term('development', 'development cap')} `
          + `(literacy × ${DEVELOPMENT_CAP_LITERACY}), opens a state focus slot for every ${pct(FOCUS.LITERACY_PER_SLOT)} `
          + `(at most ${FOCUS.MAX_SLOTS}), speeds assimilation and turns voters from the ${PARTIES.conservative.name} to the `
          + `${PARTIES.liberal.name}. It drifts toward a target set by the `
          + `${lawTerm('education', 'education law')}; its schools are a weekly ${term('bills', 'bill')}, and in a supply crisis `
          + 'they work only as far as the bill is paid.',
        rows: [
          { label: 'Now', value: pct(nation.economy?.literacy, 1) },
          { label: `Heading toward (${law.name})`, value: pct(literacyTarget(world(), nation), 1), tone: 'good' },
          { label: 'Schools', value: law.cost ? `${law.cost} IC per 100k a week` : 'none' },
          { label: 'State focus slots', value: String(focusSlots(nation)) },
        ],
      };
    },

    consumer: (nation) => {
      const growth = (ratio) => growthFactors(fed(withEconomy(nation, { consumer: { ...(nation.economy?.consumer ?? {}), ratio } })), { development: 1 }).consumer;
      return {
        type: 'mechanic',
        title: 'Consumer goods',
        text: `What the people consume: ${term('feeding')} × their need. The need grows with the population and the era. `
          + `Short goods cost ${term('stability')} (at most ${pts(consumerStability(0))}) and growth `
          + `(down to ${times(growth(0))}); a surplus helps a little (at most ${pts(consumerStability(FEED.max))} stability, growth ${times(growth(FEED.max))}). `
          + `Goods also calm or stir ${term('unrest')}. Output the people are not fed goes to the ${term('fund', 'development fund')}.`,
      };
    },

    development: (nation) => {
      const literacy = nation.economy?.literacy ?? 0;
      const one = growthFactors(fed(nation), { development: 1 }).development;
      const two = growthFactors(fed(nation), { development: 2 }).development;
      const growth = Number.isFinite(one) && Number.isFinite(two) ? two - one : null;
      const cap = developmentCap(nation);
      return {
        type: 'breakdown',
        title: 'Development',
        value: `cap ${cap}`,
        text: `Roads, towns, railways and factories, bought level by level with the ${term('fund', 'development fund')}. `
          + `Each level above 1 adds ${INDUSTRY_PER_DEV} IC of ${term('industry')} per 100,000 workers; each level adds `
          + `${growth != null ? `+${Math.round(growth * 100)}%` : 'more'} population growth and lets deposits dig `
          + `+${Math.round(DEPOSIT_DEV.perDev * 100)}% of their base (iron +${Math.round(DEPOSIT_DEV_BY.IRON.perDev * 100)}%, `
          + `timber +${Math.round(DEPOSIT_DEV_BY.TIMBER.perDev * 100)}%). `
          + `A level costs ${INVEST.cost} IC × the state's people in 100k × the new level${INVEST.exponent === 2 ? ' squared' : `^${INVEST.exponent}`}; `
          + `the ${term('develop', 'Develop focus')} takes ${Math.round((1 - INVEST.focusDiscount) * 100)}% off. `
          + `No state develops beyond the cap: ${term('literacy')} raises it.`,
        rows: [
          { label: 'Base', value: String(DEVELOPMENT_CAP_BASE) },
          { label: 'Technology', value: signed(mod(nation, 'developmentCap')) },
          { label: `Literacy ${pct(literacy)} × ${DEVELOPMENT_CAP_LITERACY}`, value: `+${(literacy * DEVELOPMENT_CAP_LITERACY).toFixed(2)}` },
          { label: 'Cap (rounded)', value: String(cap) },
        ],
        rowsLabel: 'The cap',
      };
    },

    officers: (nation) => {
      // Kademe başına muharebe payı oyunun kendi çarpanından (niteliksiz general).
      const perSkill = generalModifier({ skill: 1, traits: [] }) - 1;
      const next = generalCost(nation).ic;
      return {
        type: 'mechanic',
        title: 'Officers',
        text: `Generals and admirals. Each commands an army or fleet; every level of skill adds ${pct(perSkill)} to its battle `
          + 'strength and traits add their own edge (an Engineer ignores part of the terrain and fortifications). '
          + `As the forces grow the staff commissions new officers by itself; the next costs ${Math.round(next)} IC from the `
          + `${term('fund', 'development fund')}.`,
      };
    },

    upkeep: (nation) => ({
      type: 'mechanic',
      title: 'Army supply',
      text: `A ${term('bills', 'bill')} paid off the top of output every week: ${SUPPLY.land} IC per regiment and ${SUPPLY.sea} per warship `
        + `at the start, growing with the era to ×${(1 + SUPPLY.eraGrowth).toFixed(1)}, and ×${SUPPLY.war} while at war. `
        + `A conscript regiment costs ×${SUPPLY.conscript}, a militia ×${SUPPLY.militia}, a submarine ${SUPPLY.sub} IC. `
        + `When all the bills pass ${pct(billCap(nation))} of output the nation is in a ${term('bills', 'supply crisis')}.`,
    }),

    truce: (nation) => {
      const rows = [];
      for (const other of world().nations) {
        if (other.id === nation.id || !other.alive) continue;
        const left = truceLeft(world(), nation.id, other.id, turn());
        if (left > 0) rows.push({ label: other.name, value: `${left} weeks` });
      }
      return {
        type: 'breakdown',
        title: 'Truce',
        value: rows.length ? `${rows.length} active` : 'none',
        text: `After a peace the two nations cannot declare war on each other for ${TRUCE_TURNS} weeks. Each earlier war between `
          + `the same pair lengthens it by ${pct(TRUCE_REPEAT_STEP)}, up to ${TRUCE_MAX_TURNS} weeks: raiding the same neighbour year after `
          + `year grows ever slower. Peace talks open only after ${MIN_WAR_TURNS} weeks of war.`,
        rows: rows.slice(0, 6),
        rowsLabel: 'Our truces',
      };
    },

    blockade: (nation) => ({
      type: 'breakdown',
      title: 'Blockade',
      value: nation.economy?.coastal ? pct(nation.economy?.blockade) : 'no coast',
      text: `An enemy fleet that holds a sea off our coast blockades the coastal states on it: its share of the ${term('seacontrol', 'sea')} `
        + `× how well it covers the coast (${BLOCKADE_COVER} fleet strength per coastal state for full cover). Sea trade with every partner `
        + 'shrinks by the blockaded share on each side; land neighbours trade on. Win the sea to lift it.',
      rows: [
        { label: 'Our coast blockaded', value: pct(nation.economy?.blockade), tone: (nation.economy?.blockade ?? 0) > 0 ? 'bad' : '' },
        { label: 'Sea trade cut on the way (held seas, submarines)', value: pct(seaTradeLoss(world(), nation.id)) },
      ],
      rowsLabel: 'Now',
    }),

    seacontrol: (nation) => {
      const closed = closedSeas(world(), nation.id);
      return {
        type: 'breakdown',
        title: 'Sea control',
        value: closed.size ? `${closed.size} seas closed to us` : 'no sea closed',
        text: 'Each sea is held by whoever brings more fleet strength: our side\'s share is our and our allies\' strength ÷ all the strength there. '
          + `A fleet below ${pct(EVADE_RATIO)} of the enemy's avoids battle and stays in port; in its home waters a fleet is `
          + `${pct(HOME_WATERS)} stronger. Where the enemy holds more than ${pct(TRANSPORT_HOLD)} the sea is closed: our armies can `
          + `neither embark on it nor cross it, and troops already at sea lose up to ${pct(TRANSPORT_LOSS)} a week. The holder of a sea `
          + `${term('blockade', 'blockades')} the enemy coast on it.`,
      };
    },
  };

  provideTooltip('term', (arg) => {
    const nation = game.world?.nations[game.turns.playerNation];
    const entry = GLOSSARY[arg];
    return nation && entry ? entry(nation) : null;
  });

  return GLOSSARY;
}

/** İstikrar %0-%100 arası çarpanların okunur özeti (stability kartı ve sözlük). */
export function stabilityEffectRows(nation) {
  const e = stabilityEffects(nation);
  return [
    { label: `Political power (${times(e.power.low)} – ${times(e.power.high)})`, value: times(e.power.now) },
    { label: `Output (${times(e.output.low)} – ${times(e.output.high)})`, value: times(e.output.now) },
    { label: `Population growth (${times(e.growth.low)} – ${times(e.growth.high)})`, value: times(e.growth.now) },
  ];
}
