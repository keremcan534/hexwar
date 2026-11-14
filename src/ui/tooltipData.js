// Tooltip içerik sağlayıcıları.
//
// TEK KURAL: burada hiçbir simülasyon formülü yeniden kurulmaz. Her sağlayıcı
// alan katmanının döküm fonksiyonunu okur — economyView, economy.alloc/bills,
// stabilityBreakdown, warSupportBreakdown, powerIncome — ve okuduğunu cümleye
// çevirir (TASARIM.md ilke 2). Cümledeki katsayılar (0.6, 0.2, %60…) defs.js
// sabitlerinden yazılır: ayar değişince kart eskimesin. Sabiti olmayan bir
// eşik (istikrar %0'da güç kaç kat) oyunun kendi fonksiyonu bir uçta
// değerlendirilerek okunur (bkz. tooltipGlossary.js).
//
// Vurgulu terimler (`term()`) iç içe kart açar: istikrar kartındaki "unrest"
// kelimesinin üstüne gelen oyuncu huzursuzluğun açıklamasını alır.
//
// Sağlayıcı `null` dönerse tooltip hiç açılmaz — boş bir kart göstermek,
// hiç göstermemekten kötüdür.

import { registerStateTooltips } from './tooltipState.js';
import { provideTooltip, tipTerm } from './tooltip.js';
import {
  lawTerm, registerGlossary, stabilityEffectRows, stabilityPartIf, term,
} from './tooltipGlossary.js';
import { tabLedgerTip } from './tabLedger.js';
import { economyView, formatPopulation, splitOutput } from '../game/economy.js';
import {
  TECHNOLOGIES, TECH_CATEGORIES, canResearch, diffusionDiscount, effectiveTechCost, hasTech,
  researchPath, researchPointsOf, techById, techCost,
} from '../game/technology.js';
import { activeAlerts } from '../game/alerts.js';
import { easingNote, shownAlert } from './alerts.js';
import { DELEGATION_AREAS, areasOfScreen, isDelegated } from '../game/delegation.js';
import {
  COALITION_CHANCE, INFAMY, INFAMY_ANNEX, INFAMY_COALITION, infamyDecayOf, maxCoalitionAttackers,
} from '../game/infamy.js';
import {
  FEED, FUND_FLOOR_WEEKS, HAND_OUTPUT, INDUSTRY_PER_DEV, INVEST, RESOURCES, SUPPLY,
} from '../game/econ/defs.js';
import { billCap, inSupplyCrisis, supplyFactor } from '../game/econ/bills.js';
import { consumerStability, feedTarget } from '../game/econ/industry.js';
import { fundFloor, investEfficiency, investmentTarget, levelCost } from '../game/econ/investment.js';
import { outputFactors } from '../game/econ/output.js';
import { LEDGER_LINES, LEDGER_LINE_IDS } from '../game/treasury.js';
import { FOCUS_BY_ID } from '../game/focus.js';
import { focusPreview } from '../game/stateFocus.js';
import { FAMINE_THRESHOLD, growthFactors, provinceName } from '../game/provinces.js';
import { describeEffects, mod, modifierBreakdown } from '../game/modifiers.js';
import {
  POWER_CAP, STABILITY_STEP, WILL, courseView, powerIncome,
} from '../game/politics.js';
import { LAWS, lawOption } from '../game/laws.js';
import { nationManpower } from '../game/recruitment.js';
import { yearOfTurn } from '../game/calendar.js';
import { UNIT_TYPES, menUnderArms, unitAvailable } from '../game/units.js';
import { CULTURE, foreignManpowerShare } from '../game/culture.js';
import { FALTER_STABILITY, MOVEMENT } from '../game/movements.js';
import { LEVEE } from '../game/mobilization.js';
import { DEATH_SHARE, HOME_RULE_LEVY } from '../game/levy.js';
import { fuelFactor, horseFactor, powderFactor } from '../game/battles.js';
import { MAX_WAR_SCORE } from '../game/peace.js';
import { autoFeed } from '../game/ai.js';
import { CURRENCY, money } from './kit.js';
import { warOverview } from '../game/warView.js';
import { STANDARD_COLS, STANDARD_ROWS, TARGET_LAND } from '../world/worldgen.js';

const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d)}%`;
const signed = (v, d = 1) => `${v >= 0 ? '+' : '−'}${Math.abs(v ?? 0).toFixed(d)}`;
const times = (v) => `×${(v ?? 1).toFixed(2)}`;
const pts = (v) => `${v >= 0 ? '+' : '−'}${Math.abs((v ?? 0) * 100).toFixed(1)}`;
/** `text` ham HTML basilir; simulasyondan gelen cumleler kacirilarak girer. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Döküm satırının adı bir sözlük kavramıysa satır terim taşır: istikrar
 * dökümündeki "War exhaustion" satırı yorgunluğun kendi kartını açar.
 */
const PART_TERMS = {
  'Consumer goods': (label) => term('consumer', label),
  'Food supply': (label) => tipTerm('resource', label, 'FOOD'),
  Legitimacy: (label) => term('legitimacy', label),
  'Supply crisis': (label) => term('bills', label),
  'War exhaustion': (label) => term('exhaustion', label),
  Unrest: (label) => term('unrest', label),
};
const partRow = (part, value, tone) => {
  const wrap = PART_TERMS[part.label];
  return wrap ? { label: part.label, labelHtml: wrap(part.label), value, tone } : { label: part.label, value, tone };
};
/** Puan (0-1 ölçeğinden tam sayı): 0.03 → "+3". */
const ptsInt = (v) => `${v >= 0 ? '+' : '−'}${Math.round(Math.abs(v ?? 0) * 100)}`;

/**
 * Değiştirici anahtarını veren 1900 teknolojileri, kendi kartlarıyla (iç
 * içe): " (more with A, B)". Miras teknolojileri herkeste vardır, yazılmaz.
 */
function moreWith(key) {
  const list = [];
  for (const folders of Object.values(TECHNOLOGIES)) {
    for (const techs of Object.values(folders)) {
      for (const tech of techs) if (tech.effects?.[key]) list.push(tipTerm('tech', tech.name, tech.id));
    }
  }
  return list.length ? ` (more with ${list.join(', ')})` : '';
}

/** Kaynağın oranı değiştirilmiş ulus kopyası (uçta değerlendirme için). */
const withResource = (nation, id, ratio) => ({
  ...nation,
  economy: {
    ...(nation.economy ?? {}),
    resources: { ...(nation.economy?.resources ?? {}), [id]: { ...(nation.economy?.resources?.[id] ?? {}), ratio } },
  },
});

/**
 * Sağlayıcıları kurar. Oyun nesnesini kapatma (closure) ile taşır ki
 * sağlayıcılar imzalarında dolaşmasın.
 */
export function registerTooltips(game) {
  const me = () => game.world.nations[game.turns.playerNation];
  const glossary = registerGlossary(game);

  /* ----------------------------------------------------------------------
     ÜST ÇUBUK — çıktı, faturalar, fon, doyurma kolu, SG, savaş desteği,
     sanayi, kaynaklar. TEK ÇUBUK (2026-10-15): haftalık çıktı faturalar /
     ordu / halk / kalkınma diye bölünür; kartlar bu dört payı aynı
     alanlardan (economy.ic, economy.alloc, economy.bills) okur.
     ---------------------------------------------------------------------- */

  /**
   * ÇIKTI kartı — üst çubuk hücresi ve iç içe "output" terimi aynı kartı
   * okur. Kart eskiden hud.js'te ayrı yazılıydı ve sözlük terimi
   * taşıyamıyordu; buradaki kayıt hud'ınkinden SONRA yapılır ve onun yerine
   * geçer (main.js sırası).
   */
  const outputCard = () => {
    const nation = me();
    const economy = nation?.economy;
    if (!economy?.ic) return null;
    const { ic, alloc, bills, consumer } = economy;
    const n = (v) => (v ?? 0).toFixed(1);
    const crisis = inSupplyCrisis(nation);
    const efficiency = economy.investEfficiency ?? 1;
    const summary = alloc
      ? `${n(alloc.output)} IC: ${n(alloc.bills)} bills · ${n(alloc.army)} army · ${n(alloc.people)} people · ${n(alloc.invest)} development. `
      : 'The first week has not closed yet. ';
    const crisisLine = crisis && bills
      ? `<b>Supply crisis:</b> the bills (${money(bills.owed, 1)}) are above the ceiling of ${money(bills.room, 1)}; `
        + `only ${pct(bills.s)} is paid, so reinforcement, training and order suffer. `
      : '';
    const rows = [
      { label: `Handwork (${HAND_OUTPUT} per 100k workers)`, value: `+${n(ic.hand)}` },
      { label: 'Industry', labelHtml: `${term('industry', 'Industry')} (${INDUSTRY_PER_DEV} per 100k workers per level above 1)`, value: `+${n(ic.total)}` },
      { label: 'The crown', value: `+${n(ic.crown)}` },
      alloc ? {
        label: 'Bills', labelHtml: crisis ? `${term('bills', 'Bills')} (${pct(bills?.s)} paid)` : `${term('bills', 'Bills')}: supply, schools`,
        value: `−${n(alloc.bills)}`, tone: crisis ? 'bad' : '',
      } : null,
      alloc ? { label: `Army lines (cap ${n(alloc.armyCap)})`, value: `−${n(alloc.army)}` } : null,
      alloc ? { label: 'People', labelHtml: `People (${term('feeding', 'fed')} ×${(consumer?.feed ?? 1).toFixed(2)})`, value: `−${n(alloc.people)}` } : null,
      alloc ? {
        label: 'Development', labelHtml: `${term('development', 'Development')}${efficiency !== 1 ? ` (×${efficiency.toFixed(2)} into the fund)` : ''}`,
        value: n(alloc.invest), tone: alloc.invest > 0 ? 'good' : '',
      } : null,
    ].filter(Boolean);
    // Fonun hedefi canlı: Develop odağı hafta ortasında değişebilir.
    const target = investmentTarget(game.world, nation);
    return {
      type: 'breakdown',
      title: 'Output',
      value: `${n(ic.output)} IC / week`,
      text: `${summary}${crisisLine}Everything the nation makes in a week. ${term('bills', 'Bills')} come off the top, the army's `
        + `production lines draw from ${term('industry')}, the people are fed as the ${term('feeding', 'feeding handle')} says, `
        + `and the rest goes to the ${term('fund', 'development fund')}. Stability, labour and conscription laws and advisors `
        + `multiply it (${times(ic.factors?.common)} now).`,
      rowsLabel: 'This week',
      rows,
      footer: `${CURRENCY.label}: ${money(nation.fund ?? 0, 0)} (it may dip to ${money(fundFloor(nation), 0)})`
        + (target ? ` · saving for ${esc(target.name)}, level ${(target.econ.development ?? 1) + 1} at ${money(levelCost(target), 0)}.` : '.'),
    };
  };
  provideTooltip('output', outputCard);
  provideTooltip('topbar-output', outputCard);

  /**
   * FATURALAR — econ/bills.js'in haftalık kaydı. Kriz çarpanı supplyFactor'dan,
   * istikrar kaybı istikrar dökümünün kendi satırından okunur (formül yok).
   */
  provideTooltip('bills', () => {
    const nation = me();
    const bills = nation?.economy?.bills;
    if (!bills) return null;
    const output = nation.economy.ic?.output ?? 0;
    const cap = billCap(nation);
    const crisis = bills.s < 1 - 1e-6;
    const perRegiment = SUPPLY.land * (bills.era ?? 1) * (bills.war ?? 1) * (bills.mods ?? 1);
    // Hiç ödenmeyen haftanın bedelleri, oyunun kendi fonksiyonlarından.
    const unpaid = { ...nation, economy: { ...nation.economy, bills: { ...bills, s: 0 } } };
    const worstStability = stabilityPartIf(game.world, unpaid, 'Supply crisis');
    // Kayıp istikrar dökümünün kendi satırıdır; dökümde yoksa (ilk hafta) yazılmaz.
    const stabilityHit = nation.politics?.stabilityParts?.find((part) => part.label === 'Supply crisis')?.value;
    return {
      type: 'breakdown',
      title: crisis ? 'Bills — supply crisis' : 'Bills',
      value: `${bills.owed.toFixed(1)} IC/wk`,
      text: `${term('upkeep', 'Army and navy supply')}, ${lawTerm('education', 'schools')}, martial law and treaty payments come off the top of output, `
        + `before the army's lines, the people and development. They may take at most ${pct(cap)} of output. Above that the nation is `
        + 'in a <b>supply crisis</b>: every bill is paid in part; reinforcement, training and organisation recovery slow '
        + `(down to ×${supplyFactor(unpaid).toFixed(2)} when nothing is paid) and ${term('stability')} falls (at most ${pts(worstStability)}).`,
      rows: [
        { label: `Army supply: ${bills.land} regiments × ${perRegiment.toFixed(2)}${bills.atWar ? ` (at war ×${SUPPLY.war})` : ''}`, value: bills.army.toFixed(1) },
        { label: `Navy supply: ${(bills.sea ?? 0).toFixed(1)} ships`, value: bills.navy.toFixed(1) },
        { label: 'Schools (education law)', value: bills.schools.toFixed(1) },
        bills.martial > 0.05 ? { label: 'Martial law', value: bills.martial.toFixed(1) } : null,
        // Tazminat/haraç ödemesi de faturadır (econ/bills.js TREATY_SHARE); satırı yoktu, toplam tutmuyordu.
        (bills.treaty ?? 0) > 0.05 ? {
          label: `Treaty payments to ${(bills.treaties ?? []).map((t) => game.world.nations[t.partner]?.name ?? '?').join(', ')}`,
          value: bills.treaty.toFixed(1), tone: 'bad',
        } : null,
        { label: `Ceiling: ${pct(cap)} of ${output.toFixed(1)} output`, value: bills.room.toFixed(1) },
        { label: 'Share paid', value: pct(bills.s), tone: crisis ? 'bad' : 'good' },
      ].filter(Boolean),
      footer: crisis
        ? `Supply crisis: reinforcement, training and organisation ×${supplyFactor(nation).toFixed(2)}${stabilityHit != null ? `; stability ${pts(stabilityHit)}` : ''}. `
          + 'Fewer regiments, cheaper schools or more output end it.'
        : `Room for ${Math.max(0, bills.room - bills.owed).toFixed(1)} IC more before a supply crisis.`,
    };
  });

  /**
   * KALKINMA FONU (eski hazine). Satırlar fon defterinin geçen haftasıdır
   * (treasury.closeWeek); hedef state economy.investTarget'tan okunur.
   */
  const fundTip = () => {
    const nation = me();
    if (!nation?.economy) return null;
    const view = economyView(game.world, nation);
    const ledger = view.ledger ?? {};
    const target = view.investTarget;
    const province = target ? game.world.provinces?.[target.provinceId] : null;
    // Sıfır satır gürültüdür; yatırım satırı her zaman durur (fonun ana akışı).
    const rows = view.settled ? LEDGER_LINE_IDS
      .filter((id) => id === 'investment' || Math.abs(ledger[id] ?? 0) >= 0.05)
      .map((id) => ({ label: LEDGER_LINES[id].label, value: signed(ledger[id] ?? 0), tone: (ledger[id] ?? 0) >= 0 ? 'good' : 'bad' }))
      .concat({ label: 'Week closed at', value: signed(ledger.net ?? 0), tone: (ledger.net ?? 0) >= 0 ? 'good' : 'bad' })
      : [];
    const discount = Math.round((1 - INVEST.focusDiscount) * 100);
    return {
      type: 'breakdown',
      title: CURRENCY.label,
      value: money(view.fund, 0),
      text: `What the economy did not spend. Invested output flows in every week (×${view.investEfficiency.toFixed(2)} `
        + 'investment efficiency: technology, advisors, the trade law, timber and iron) and buys '
        + `${term('development')} levels state by state — the best gain for its cost first; states with the `
        + `${term('develop', 'Develop focus')} come first and pay ${discount}% less. `
        + 'Exports, tribute and windfalls add to it; imports, new officers, settlers and event choices are paid from it. '
        + `It may sink to ${FUND_FLOOR_WEEKS} weeks of output below zero; at that floor imports and purchases stop.`,
      rows,
      rowsLabel: 'Last week',
      footer: target && province
        ? `Saving for ${esc(provinceName(province.center))} → level ${target.level}: ${money(Math.max(0, view.fund), 0)} of ${money(target.cost, 0)}. Floor ${money(view.fundFloor, 0)}.`
        : `No state can be developed now (cap ${view.developmentCap}, or not under control): what would be invested feeds the people. Floor ${money(view.fundFloor, 0)}.`,
    };
  };
  provideTooltip('fund', fundTip);

  /**
   * DOYURMA KOLU — ekonominin tek kolu. Bir adım önizlemesi oyunun saf
   * paylaşım fonksiyonundan (splitOutput) gelir: kart oyunla ayrışamaz.
   * AUTO'nun bugünkü hedefi YZ'nin kendi fonksiyonundan (kopya üzerinde).
   */
  provideTooltip('feed', () => {
    const nation = me();
    const economy = nation?.economy;
    const consumer = economy?.consumer;
    if (!consumer) return null;
    const target = feedTarget(nation);
    const auto = (economy.feed?.mode ?? 'auto') === 'auto';
    const stability = consumerStability(consumer.ratio ?? 1);
    // Kıtlıkta büyüme dökümü tüketim çarpanı taşımaz (açlık her şeyi ezer).
    const growth = growthFactors(nation, { development: economy.development ?? 1 }).consumer;
    const alloc = economy.alloc;
    let step = null;
    if (alloc && target < FEED.max) {
      const up = splitOutput({
        output: alloc.output, billsPaid: alloc.bills, armyCap: alloc.armyCap, drawn: alloc.army,
        need: consumer.need, feed: Math.min(FEED.max, target + FEED.step),
        investable: economy.investable ?? (alloc.invest > 0 || Boolean(economy.investTarget)),
      });
      step = { people: up.people - alloc.people, invest: up.invest - alloc.invest };
    }
    const copy = { ...nation, economy: { ...economy, feed: { mode: 'auto', target } } };
    autoFeed(copy);
    const aim = copy.economy.feed.target;
    return {
      type: 'breakdown',
      title: 'Feeding the people',
      value: `×${target.toFixed(2)}${auto ? ' · AUTO' : ''}`,
      text: `The one handle of the economy: how well the people are fed. ${term('consumer', 'Consumer goods')} = feed × need, `
        + 'and the need grows with the population and the era. Fed above their need the people are steadier, grow faster and '
        + `stay calmer; below it ${term('stability')}, growth and calm fall. Everything not fed goes to the `
        + `${term('fund', 'development fund')}. AUTO aims at ×${aim.toFixed(2)} now: ×${FEED.war} at war, more while stability is low.`,
      rows: [
        { label: 'Need (population × era)', value: consumer.need.toFixed(1) },
        { label: 'Fed this week', value: consumer.supply.toFixed(1) },
        { label: 'Covered', value: pct(consumer.ratio), tone: (consumer.ratio ?? 1) < 1 ? 'bad' : 'good' },
        { label: 'Stability', value: pts(stability), tone: stability < 0 ? 'bad' : 'good' },
        growth != null ? { label: 'Population growth', value: times(growth), tone: growth < 1 ? 'bad' : '' } : null,
        step ? { label: `One step up (+${FEED.step})`, value: `people +${step.people.toFixed(1)} · development ${signed(step.invest)}` } : null,
      ].filter(Boolean),
      footer: `The handle runs from ×${FEED.min} to ×${FEED.max}. ${auto ? 'Moving it takes the handle off AUTO.' : 'Manual: no automation touches it.'}`,
    };
  });

  /**
   * DEVELOP ODAĞI. Argüman state kimliğiyse o state'in kademe bedeli odaklı ve
   * odaksız (stateFocus.focusPreview, oyunun kendi formülü) yazılır.
   */
  provideTooltip('develop', (arg) => {
    const nation = me();
    const focus = FOCUS_BY_ID.develop;
    if (!nation || !focus) return null;
    const province = arg === '' || arg == null ? null : game.world.provinces?.[Number(arg)];
    const mine = province?.econ && province.owner === nation.id;
    const lines = mine ? focusPreview(game.world, nation, province, 'develop')?.lines ?? [] : [];
    const target = nation.economy?.investTarget;
    return {
      type: 'mechanic',
      title: `Focus: ${focus.name}`,
      text: `${esc(focus.desc)} Without it the ${term('fund', 'development fund')} buys the level with the best gain for its cost `
        + `anywhere in the nation. Each ${term('development')} level adds industry, deposit output and population growth.`,
      rows: lines.map((line) => ({ label: line, value: '' })).concat(mine && target?.provinceId === province.id
        ? [{ label: 'The fund is saving for this state now', value: `level ${target.level}`, tone: 'good' }] : []),
      footer: 'Focus slots grow with literacy.',
    };
  });

  /**
   * SİYASİ GÜÇ. Haftalık değişim NET yazılır: rota finansmanı gelirden pay
   * keser (politics.stepCourse). Brüt gelir yazılınca kart ve üst çubuk
   * rota açıkken haftada ~0.3-0.7 fazla söylüyordu (T-06).
   */
  provideTooltip('power', () => {
    const nation = me();
    if (!nation) return null;
    const income = powerIncome(nation);
    const course = courseView(nation);
    const net = income.total - course.weeklyCost;
    return {
      type: 'breakdown',
      title: 'Political power',
      value: `${Math.round(nation.power ?? 0)} / ${POWER_CAP}`,
      text: `The currency of government: laws, advisors, the ${term('course', 'course of the state')}, culture policy, `
        + `war justification, embargoes and decisions all cost political power. ${term('stability', 'Stability')} multiplies `
        + `the income; it stops at ${POWER_CAP}.`,
      rows: [
        { label: 'Base', value: signed(income.base, 2) },
        ...modifierBreakdown(nation, 'power').map((row) => ({ label: row.label, value: signed(row.value, 2), tone: row.value >= 0 ? 'good' : 'bad' })),
        { label: 'Stability multiplier', labelHtml: `${term('stability', 'Stability')} multiplier`, value: times(income.stability) },
        course.weeklyCost > 0
          ? { label: 'Course', labelHtml: `${term('course', 'Course of the state')} (${pct(course.budget)} of income)`, value: `−${course.weeklyCost.toFixed(2)}`, tone: 'bad' }
          : null,
        { label: 'Per week', value: signed(net, 2), tone: net >= 0 ? 'good' : 'bad' },
      ].filter(Boolean),
      footer: (nation.power ?? 0) >= POWER_CAP - 0.5 ? 'At the cap: income is lost until you spend.' : null,
    };
  });

  // Sağ üst savaş kutusu (ui/warDock.js): kutunun kısalttığı her şey burada.
  provideTooltip('war', (id) => {
    const view = warOverview(game.world, game.turns.playerNation, game.world.turn ?? 0);
    const w = view.wars.find((row) => row.enemyId === Number(id));
    if (!w) return null;
    const started = w.aggressor === 'us' ? 'We declared this war.' : w.aggressor === 'them' ? `${esc(w.name)} declared this war.` : '';
    const goals = [w.goal ? `Our goal: ${esc(w.goal)}.` : '', w.theirGoal ? `Their goal: ${esc(w.theirGoal)}.` : ''].filter(Boolean).join(' ');
    return {
      type: 'breakdown',
      title: `War with ${w.name}`,
      value: `score ${w.score > 0 ? '+' : ''}${w.score}`,
      text: [started, goals, `War score runs from −${MAX_WAR_SCORE} to +${MAX_WAR_SCORE}: occupied land, the enemy capital, `
        + `losses and remaining strength. Land taken at the peace table costs ${term('infamy')}; after the peace a ${term('truce')} holds.`].filter(Boolean).join(' '),
      rows: [
        { label: 'Weeks at war', value: String(w.weeks) },
        { label: 'Our losses (≈ men)', value: formatPopulation(w.lossesOurs), tone: w.lossesOurs > w.lossesTheirs ? 'bad' : '' },
        { label: 'Their losses (≈ men)', value: formatPopulation(w.lossesTheirs), tone: w.lossesTheirs > w.lossesOurs ? 'good' : '' },
        { label: 'Their states we hold', value: String(w.holdTheirs), tone: w.holdTheirs ? 'good' : '' },
        { label: 'Our states they hold', value: String(w.holdOurs), tone: w.holdOurs ? 'bad' : '' },
        { label: 'Battles under way', value: String(w.battles) },
        w.allies.length ? { label: 'Allies fighting them', value: w.allies.join(', ') } : null,
        { label: 'Peace talks', value: w.talksIn > 0 ? `in ${w.talksIn} weeks` : 'open', tone: w.talksIn > 0 ? '' : 'good' },
      ].filter(Boolean),
      footer: w.talksIn > 0 ? 'Click: open their dossier.' : 'Click: open peace talks.',
    };
  });

  /**
   * SAVAŞ DESTEĞİ — İRADE. Eşikler yasa verisinden (laws.js) ve LEVEE'den;
   * adım WILL'den. Eski kart "%20'nin altında kötü barışı kabul eder"
   * diyordu: o dal yorgunluk sayısı yazıldığından beri ölü (peace.js), barışı
   * artık yorgunluk getirir (T-08).
   */
  provideTooltip('warsupport', () => {
    const nation = me();
    const parts = nation?.politics?.warSupportParts;
    if (!parts) return null;
    const gates = ['conscription', 'economy'].flatMap((id) => LAWS[id].options
      .filter((option) => option.warSupport)
      .map((option) => `${lawTerm(id, option.name)} ${pct(option.warSupport)}${option.needsTotalWar ? ' (only in a total war)' : option.atWarOr ? ' (or any war)' : ''}`));
    return {
      type: 'breakdown',
      title: 'War support',
      value: pct(nation.warSupport),
      text: `How willing the people are to fight. War laws need it: ${gates.join(', ')}. A war law passed is held until the peace. `
        + `Call to Arms needs ${pct(LEVEE.WILL)}. Above ${pct(WILL.CRACK_FROM)} ${term('exhaustion', 'war exhaustion')} cracks it.`,
      rows: parts.map((part) => partRow(part, pts(part.value), part.value >= 0 ? 'good' : 'bad')),
      footer: `Heading to ${pct(nation.politics?.warSupportTarget)}: ${ptsInt(WILL.STEP)} a week, `
        + `${ptsInt(WILL.STEP_UP_AT_WAR)} while rising at war.`,
    };
  });

  provideTooltip('ic', () => {
    const nation = me();
    const ic = nation?.economy?.ic;
    if (!ic) return null;
    const f = ic.factors ?? {};
    const law = Math.round((ic.share ?? 0) * 100);
    return {
      type: 'breakdown',
      title: 'Industry',
      value: `${ic.total.toFixed(1)} IC`,
      text: `The part of ${term('output')} that ${term('development')} builds: every level above 1 adds ${INDUSTRY_PER_DEV} IC per 100,000 `
        + 'workers. It burns coal, iron and timber (and oil once refineries come) and grows with technology. The '
        + `${lawTerm('economy', 'economy law')} lets the army's production lines draw up to ${law}% of it; what they leave goes to the people and development.`,
      rows: [
        { label: `Before factors: ${INDUSTRY_PER_DEV} × 100k workers × levels above 1`, value: ic.raw.toFixed(1) },
        { label: 'Coal', value: times(f.coal), tone: (f.coal ?? 1) < 1 ? 'bad' : '' },
        { label: 'Iron · timber', value: `${times(f.iron)} · ${times(f.timber)}`, tone: Math.min(f.iron ?? 1, f.timber ?? 1) < 1 ? 'bad' : '' },
        (f.oilBonus ?? 0) > 0 ? { label: 'Oil', value: times(f.oil), tone: 'good' } : null,
        { label: 'Technology', value: times(f.tech) },
        { label: 'Stability, labour and conscription laws, advisors', value: times(f.common) },
        { label: `Army may draw (economy law ${law}%)`, value: (ic.military ?? 0).toFixed(1) },
        { label: 'Drawn by the lines', value: (ic.drawn ?? 0).toFixed(1) },
      ].filter(Boolean),
    };
  });

  /**
   * KAYNAK kartı. "Eksikse ne kadar keser" sayıları oyunun kendi çarpan
   * fonksiyonlarından, kaynak oranı 0'a çekilmiş kopyayla okunur: eskiden
   * metne elle yazılmıştı ve petrol bonusu iki eski teknolojinin toplamıydı.
   */
  provideTooltip('resource', (id) => {
    const nation = me();
    const info = RESOURCES[id];
    const record = nation?.economy?.resources?.[id];
    if (!info || !record) return null;
    const partner = record.topPartner >= 0 && (record.imported ?? 0) > 0.05 ? game.world.nations[record.topPartner] : null;
    const cut = (factor) => pct(1 - factor);
    const shortOutput = (res) => outputFactors(withResource(nation, res, 0));
    const investShort = (res) => {
      const full = investEfficiency(withResource(withResource(nation, 'IRON', 1), 'TIMBER', 1));
      return full > 0 ? investEfficiency(withResource(withResource(withResource(nation, 'IRON', 1), 'TIMBER', 1), res, 0)) / full : 1;
    };
    const uses = {
      FOOD: () => `Feeds the people. Below ${pct(FAMINE_THRESHOLD)} the population shrinks.`,
      COAL: () => `Fuels ${term('industry')}: short coal costs up to ${cut(shortOutput('COAL').coal)} of it.`,
      IRON: () => `${term('industry', 'Industry')} and ${term('development')} eat it; so do rifles, artillery, tanks and steel warships. `
        + `Short iron costs up to ${cut(shortOutput('IRON').iron)} of industry and slows investment to ×${investShort('IRON').toFixed(2)}.`,
      TIMBER: () => `${term('development', 'Development')} eats it (short timber slows investment to ×${investShort('TIMBER').toFixed(2)}, `
        + `industry up to −${cut(shortOutput('TIMBER').timber)}); so do rifle stocks, early airframes and wooden hulls.`,
      HORSES: () => `Cavalry and artillery: without them they fight up to ${cut(horseFactor({ regiments: [{ typeId: 'CAVALRY' }] }, 0))} weaker.`,
      SALTPETER: () => `Gunpowder: every regiment in battle burns it; short powder costs up to ${cut(powderFactor(0))} of strength. `
        + 'Rifle and artillery lines use it too, and so does fertiliser.',
      OIL: () => `The fuel of the age. ${term('industry', 'Industry')} runs on it: +${pct(Math.max(0, mod(nation, 'oilIc')))} now, in proportion `
        + `to the oil you have${moreWith('oilIc')}. Tanks and aircraft move on it and lose up to `
        + `${cut(fuelFactor({ regiments: [{ typeId: 'ARMOR' }] }, 0))} of their strength without it.`,
      RUBBER: () => `Tyres and field telegraph: every land regiment fights up to +${pct(Math.max(0, mod(nation, 'rubberArmy')))} stronger now, `
        + `in proportion to the rubber you have${moreWith('rubberArmy')}. Tanks and aircraft are built with it.`,
    }[id];
    return {
      type: 'breakdown',
      title: info.name,
      value: record.need > 0.01 ? `${pct(record.ratio)} covered` : 'no need',
      text: uses ? uses() : '',
      rows: [
        { label: 'Produced', value: record.produced.toFixed(1) },
        { label: 'Needed', value: record.need.toFixed(1) },
        { label: 'Imported', value: record.imported.toFixed(1), tone: record.imported > 0 ? 'bad' : '' },
        { label: 'Exported', value: record.exported.toFixed(1), tone: record.exported > 0 ? 'good' : '' },
        { label: 'World price', value: (game.world.market?.prices?.[id] ?? info.price).toFixed(2) },
        partner ? { label: `Main supplier: ${partner.name}`, value: pct(record.topShare), tone: record.topShare > 0.5 ? 'bad' : '' } : null,
      ].filter(Boolean),
    };
  });

  /* ----------------------------------------------------------------------
     EYALET KUTUSU — denetim, kültür
     ---------------------------------------------------------------------- */

  // 'control' hücresi sözlükteki uyum kartını açar: iki ayrı açıklama
  // zamanla ayrışırdı (eski kart "işgal edilen toprak ödemez" diyordu).
  provideTooltip('control', () => {
    const nation = me();
    return nation ? glossary.compliance(nation) : null;
  });

  /* ----------------------------------------------------------------------
     UST CUBUK — istikrar, sohret, ordu, insan gucu
     Tarayicinin `title` balonu bir saniye gecikiyor, duz metin basiyor ve
     ekran goruntusune bile girmiyor; kor oyun testinde "tooltip yok" diye
     okundu. Ayni bilgi artik geciktirmeli kartta.
     ---------------------------------------------------------------------- */

  /**
   * İSTİKRAR. Eski metin "%30'un altında huzursuzluk taşar" diyordu; oyunda
   * istikrarı huzursuzluğa bağlayan yol yok (T-09). Kart artık istikrarın
   * GERÇEK etkilerini oyunun çarpanlarından okur.
   */
  provideTooltip('stability', () => {
    // Döküm tıkla sabitlenmişken aynı bilgiyi üstüne ikinci kez açma: haftalık
    // yeniden kurulan hücre imleç altında pointerover verip kartı pimin
    // tam üstüne açıyor, pimi örtüyordu (ölçüldü).
    if (document.querySelector('.why-pop[data-anchor="stability"]')) return null;
    const nation = me();
    const parts = nation?.politics?.stabilityParts;
    if (!parts?.length) {
      return { type: 'simple', title: 'Stability', text: 'Measured after the first weekly tick.' };
    }
    return {
      type: 'breakdown',
      title: 'Stability',
      value: pct(nation.stability, 1),
      text: `How firmly the country holds together. It moves ${Math.round(STABILITY_STEP * 100)} point a week toward its target and `
        + `multiplies ${term('power', 'political power')}, ${term('output')} and population growth. Below ${pct(FALTER_STABILITY)} `
        + `the state falters: national movements are no longer held at the brink (${MOVEMENT.BRINK} of 100) and can break away.`,
      effects: stabilityEffectRows(nation),
      effectsLabel: 'Multiplies (at 0% – 100%)',
      rows: parts.map((part) => partRow(part, pts(part.value), part.value >= 0 ? 'good' : 'bad')),
      footer: `Target ${pct(nation.politics?.stabilityTarget, 1)}. Click the figure to pin the breakdown.`,
    };
  });

  provideTooltip('infamy', () => {
    const nation = me();
    const infamy = nation?.infamy ?? 0;
    const decay = infamyDecayOf(nation);
    return {
      type: 'breakdown',
      title: 'Infamy',
      value: `${infamy.toFixed(1)} / ${INFAMY_COALITION}`,
      text: `How much the world resents your conquests. From ${INFAMY_COALITION} on, every week each nation in contact `
        + `with you has a chance of ${pct(COALITION_CHANCE)} to join a coalition war against you, up to `
        + `${maxCoalitionAttackers()} fronts at once; the hopelessly weak stay out. Land taken at the peace table is the `
        + `main source: ${INFAMY_ANNEX.PER_TILE} a hex, ${INFAMY_ANNEX.PER_CITY} a city and 1 per `
        + `${formatPopulation(INFAMY_ANNEX.POP_PER_POINT)} people, ×${INFAMY_ANNEX.FOREIGN} for a foreign people `
        + `(×${INFAMY_ANNEX.OWN_CULTURE} for your own), ×${INFAMY_ANNEX.HOMELAND} for a foreign people's homeland, and more `
        + 'for every earlier war on the same victim. It fades every week, faster the higher it is.',
      rows: [
        // İşgal şöhreti yalnız İLAN ETTİĞİN savaşta kesilir (turn.js): savunma
        // savaşında düşman toprağını tutmak bedavadır. Kart bunu söylemiyordu;
        // savunma savaşında 0.0 kalan şöhret "bozuk" görünüyordu.
        { label: 'Occupying a foreign-culture hex — wars you declared', value: `+${INFAMY.FOREIGN_CULTURE_TILE}`, tone: 'bad' },
        { label: 'Occupying a hex of your own culture — wars you declared', value: `+${INFAMY.OWN_CULTURE_TILE}`, tone: 'bad' },
        { label: 'Occupying a city — wars you declared', value: `+${INFAMY.CITY}`, tone: 'bad' },
        { label: 'Occupying in a war declared on you', value: '+0', tone: 'good' },
        { label: 'Annexing a hex at the peace table — any war', value: `+${INFAMY_ANNEX.PER_TILE}`, tone: 'bad' },
        { label: 'Annexing a city at the peace table — any war', value: `+${INFAMY_ANNEX.PER_CITY}`, tone: 'bad' },
        { label: 'Forgotten every week', value: `−${decay.toFixed(2)}`, tone: 'good' },
      ],
      // Kalan pay söylenir; "tek sınır state'i güvenlidir" gibi bir hüküm
      // state'in boyuna ve halkına göre yanlış olabiliyordu.
      footer: infamy >= INFAMY_COALITION
        ? 'Past the threshold: a coalition can form any week until it fades below.'
        : `${(INFAMY_COALITION - infamy).toFixed(1)} more and coalitions can form against you.`,
    };
  });

  /**
   * ORDU. Alay boyları UNIT_TYPES'tan (eski metin süvari ve topçuyu yanlış,
   * zırh ve hava kolunu hiç yazmıyordu; T-07); hücrenin gösterdiği sayı da
   * kartta: insan, güç puanı değil.
   */
  provideTooltip('army', () => {
    const nation = me();
    if (!nation) return null;
    const types = Object.values(UNIT_TYPES).filter((type) => type.domain === 'land' && unitAvailable(type.id, nation));
    const sizes = types.map((type) => `${formatPopulation(type.manpower)} ${type.name.toLowerCase()}`).join(', ');
    const units = (game.world.units ?? []).filter((unit) => unit.nationId === nation.id && unit.type?.domain === 'land');
    const men = units.reduce((sum, unit) => sum + menUnderArms(unit), 0);
    const regiments = units.reduce((sum, unit) => sum + (unit.regiments?.length ?? 0), 0);
    const supply = nation.economy?.bills?.army;
    return {
      type: 'breakdown',
      title: 'Army',
      value: `${formatPopulation(men)} men`,
      text: `Men under arms, raised from your states' ${term('manpower')} and serving in your divisions. A full regiment is `
        + `${sizes}. Of the men a battle costs, ${pct(DEATH_SHARE)} die and the rest come home wounded; survivors of a `
        + `disbanded unit walk home. Every regiment is a weekly ${term('upkeep', 'supply bill')}.`,
      rows: [
        { label: 'Divisions', value: String(units.length) },
        { label: 'Regiments', value: String(regiments) },
        supply != null ? { label: 'Army supply this week', value: `${supply.toFixed(1)} IC` } : null,
      ].filter(Boolean),
      rowsLabel: 'Now',
    };
  });

  /** İNSAN GÜCÜ. Yasa oranları LAWS'tan (eski metin %2-%15 diyordu; T-08). */
  provideTooltip('manpower', () => {
    const nation = me();
    if (!nation) return null;
    const law = lawOption(nation, 'conscription');
    const citizenship = lawOption(nation, 'citizenship');
    const rates = LAWS.conscription.options.map((option) => `${option.name} ${pct(option.rate)}`).join(', ');
    return {
      type: 'breakdown',
      title: 'Manpower',
      value: formatPopulation(nationManpower(game.world, nation.id)),
      text: `Recruits available. The ${lawTerm('conscription', 'conscription law')} sets the share of the people that can be called `
        + `up: ${rates}. Peoples that are not ${term('acceptance', 'accepted')} give ${pct(foreignManpowerShare(nation))} of theirs `
        + `under ${citizenship.name} (${lawTerm('citizenship', 'citizenship law')}); ${term('homerule', 'Home Rule')} peoples ${pct(HOME_RULE_LEVY)}. `
        + `Restless states give less; states that are not cores give as far as their ${term('compliance')} goes. `
        + 'Men under arms leave the pool; regiments and reinforcements draw from it.',
      rows: [
        { label: `Law: ${law.name}`, value: pct(law.rate) },
        { label: 'Technology, advisors', value: times(Math.max(0.2, 1 + mod(nation, 'manpower'))) },
      ],
      rowsLabel: 'Now',
    };
  });

  /* ----------------------------------------------------------------------
     UYARI SERIDI — ikonun uzerine gelince sebep ve care
     ---------------------------------------------------------------------- */

  provideTooltip('alert', (id) => {
    // Önce şeritte duranı oku: histerezis tuttuğu uyarı bu hafta ham
    // listede olmayabilir, kart boş açılmasın.
    const alert = shownAlert(id) ?? activeAlerts(game.world, me()).find((row) => row.id === id);
    if (!alert) return null;
    return {
      type: 'simple',
      title: alert.title,
      text: `${alert.easing ? `<i>${esc(easingNote(alert.easing))}</i><br><br>` : ''}${esc(alert.cause)}<br><br><b>${esc(alert.remedy)}</b>`,
      footer: 'Click the icon to pin the note; the cross silences it until the situation changes.',
    };
  });

  /* ----------------------------------------------------------------------
     SAAT, HARITA KIPLERI, DUNYA KURULUMU — duz aciklamalar
     ---------------------------------------------------------------------- */

  provideTooltip('time', (speed) => {
    const n = Number(speed) || 0;
    const desc = {
      0: 'Pause. Space toggles it; + and − step the speed.',
      1: 'One day per second — a week every seven seconds.',
      2: 'Two days per second.',
      4: 'Four days per second.',
      6: 'Six days per second — a year in about a minute.',
      8: 'Eight days per second — a week in under a second while the simulation keeps up.',
    }[n] ?? '';
    return {
      type: 'simple',
      title: n ? `Speed ×${n}` : 'Pause',
      text: `${desc}${n ? ' War, crisis and existential events stop the clock by themselves; '
        + 'the date then says why.' : ''}`,
    };
  });

  provideTooltip('mapmode', (mode) => {
    const table = {
      political: () => ['Army map', 'Borders, nations and armies: divisions, fronts, battles and offensives. Occupied hexes carry a hatch; the front of the selected commander is outlined.'],
      terrain: () => ['Terrain', 'Relief and vegetation without borders: where armies slow down and where the land is rich.'],
      geography: () => ['Geography', 'The bare world as the generator drew it — continents, seas and straits, no borders or units.'],
      cultures: () => ['Cultures', `Who lives where. Hatching marks states whose majority differs from the owner's culture — whether that people is ${term('acceptance', 'accepted')} decides how restless it is.`],
      resources: () => ['Resources', 'What every state produces: food, coal, iron, timber, horses or saltpeter — and the oil and rubber fields that only matter once industry and armies need them.'],
      // Renk sürekli bir logaritmik ölçektir (renderer.populationTint); lejant yalnız dört durak gösterir.
      population: () => ['Population', 'How many people live in each state, on one continuous scale from empty to crowded; the legend marks four points on it.'],
      seas: () => ['Navy map', `The seas, region by region. Green waters are yours, red the enemy's, amber contested (${term('seacontrol', 'sea control')}). `
        + `Click any sea to give it a priority and the admiralty sails the fleet there; whoever holds a sea ${term('blockade', 'blockades')} the coasts on it `
        + "and closes it to the enemy's transports. Hatched seas are closed to our troops. Shortcut: M."],
      diplomacy: () => ['Diplomacy', 'Who is at war with whom. Green is the nation you look from, red its enemies, blue its allies; hatching marks occupied land. Click any nation to see the map through its eyes.'],
      unrest: () => ['Unrest', `How restless each state is, 0 to ${CULTURE.MAX_UNREST} (${term('unrest')}). Where a subject people's states pass ${MOVEMENT.CALM} on average, `
        + `its national movement grows; foreign rule, fresh conquest, war exhaustion, occupation and short ${term('consumer', 'consumer goods')} drive it.`],
      industry: () => ['Industry', 'Industry in each state, across every nation: every development level above the first is industry — where the industrial heartlands are.'],
      infamy: () => ['Infamy', `How feared each nation is. At ${INFAMY_COALITION} the neighbours start forming coalitions against it.`],
      layers: () => ['Layers', 'Grid, labels, live sea, and the seed of this world.'],
    };
    const row = table[mode]?.();
    return row ? { type: 'simple', title: row[0], text: row[1] } : null;
  });

  /**
   * Sekme künyesi: ekranın ne olduğu ve AUTO ışığının anlamı. Işık tek başına
   * "bu neden yeşil yanıyor" sorusunu cevaplamaz; cümle devir tablosundan gelir.
   */
  provideTooltip('tab', (screen) => {
    // İkinci alan HTML'dir: ekranın konusu olan kavramlar sözlük terimidir
    // (sekme kartından iç içe açılır); geri kalan cümle kaçırılır.
    const TAB = {
      construction: ['Development', `The ${term('fund', 'development fund')}, the state it develops next and the level and ${term('development', 'cap')} of every state.`, 'F1'],
      industry: ['Factories', `${term('industry', 'Industry')}, ${term('consumer', 'consumer goods')} and the production lines.`, 'F2'],
      trade: ['Trade', 'Your resources, the world market and embargoes.', 'F3'],
      budget: ['Economy', `The weekly ${term('output')} and its split: ${term('bills')}, army, people and development — and the handle that ${term('feeding', 'feeds the people')}.`, 'F4'],
      military: ['Military', `Regiments, training, equipment and ${term('officers', 'commanders')}.`, 'F5'],
      population: ['Population', `Growth, ${term('literacy')}, ${term('manpower')} and the unification of your people.`, 'F6'],
      cultures: ['Cultures', `Every people in the nation: ${term('acceptance', 'rights')}, assimilation, deportation, resettlement, movements and state focus.`, 'F7'],
      politics: ['Politics', `Government, laws, advisors, agenda and decisions. Laws, advisors and decisions are paid in ${term('power', 'political power')}.`, 'F8'],
      technology: ['Technology', `The research tree, the queue and what each technology does — bought with ${term('research', 'research points')}.`, 'F9'],
      chronicle: ['Chronicle', 'The history of your nation, event by event.', 'F10'],
    };
    const row = TAB[screen];
    if (!row) return null;
    const nation = me();
    // Bir ekranda birden çok alan olabilir (Politics: Government + Agenda),
    // bir alan birden çok ekranda (Economy). Kart her alanı ayrı söyler;
    // lamba herhangi biri açıkken yanar (hud.syncTabAuto).
    const areas = nation ? areasOfScreen(screen) : [];
    const key = row[2] ? ` · ${row[2]}` : '';
    const states = areas.map((id) => ({ id, on: isDelegated(nation, id), area: DELEGATION_AREAS[id] }));
    const mode = !states.length ? ''
      : states.every((a) => a.on) ? 'AUTO' : states.some((a) => a.on) ? 'partly AUTO' : 'manual';
    const title = `${row[0]}${key}${mode ? ` · ${mode}` : ''}`;
    const where = (a) => (a.area.inPanel ? 'its switch is in its panel' : 'AUTO in the screen header (A)');
    const text = !states.length ? row[1] : `${row[1]} ${esc(states.map((a) => (a.on
      ? `${a.area.name} is run by the government: ${a.area.desc} Turn it off with ${where(a)}.`
      : `You run ${a.area.name} yourself; ${where(a)} hands it to the government.`)).join(' '))}`;
    // Sekmenin canlı satırı (Vic2 üst menüsü): yuvaya sığmayan ad, ölçü ve
    // eşikler burada. Kart açıkken haftalık tazelenir (tabLedger.sync).
    const live = nation ? tabLedgerTip(screen) : null;
    if (!live) return { type: 'simple', title, text };
    return { type: 'breakdown', title, value: live.value, text, rows: live.rows, rowsLabel: 'This week' };
  });

  provideTooltip('setup', (field) => {
    const table = {
      seed: ['World seed', 'Any text. The same seed always draws the same world, nations and opening economy — share it to share a map. Blank picks a random one.'],
      size: ['Map size', `Hex columns; rows follow the aspect. ${STANDARD_COLS} × ${STANDARD_ROWS} is the standard world the game is balanced on.`],
      cont: ['Continentality', 'How the land clumps: low values scatter islands and peninsulas, high values fuse them into a few large continents.'],
      land: ['Land ratio', `Nudges the share of land. 0.00 is the standard ${Math.round(TARGET_LAND * 100)}% land; negative drowns the coasts, positive raises them.`],
      nations: ['Great powers', 'How many nations are seeded as great powers. Automatic lets the generator decide from the land available.'],
    };
    const row = table[field];
    return row ? { type: 'simple', title: row[0], text: row[1] } : null;
  });


  provideTooltip('defense', () => ({
    type: 'mechanic',
    title: 'Defence',
    text: 'Terrain bonus, plus a city\'s walls if one stands here. A defender on this '
      + 'hex fights with this much extra strength.',
  }));

  provideTooltip('culture', () => ({
    type: 'mechanic',
    title: 'Culture',
    text: `States of a culture your nation does not ${term('acceptance', 'accept')} recover ${term('compliance')} more `
      + `slowly and are unhappier (${term('unrest')}), and their grievance grows every year. Accept a `
      + 'people — or revoke it — in the Cultures tab (F7); the '
      + `${lawTerm('citizenship', 'citizenship law')} sets how much the rest serve and how restless they are.`,
  }));

  /* ----------------------------------------------------------------------
     TEKNOLOJİ — ağaç düğümü ve kuyruk çipi (bkz. technologyScreen.js).
     Fiyat motorun ETKİN fiyatıdır; erken araştırma cezası ve yayılım
     indirimi formül kopyalanmadan, motorun kendi fonksiyonlarından okunur.
     Kaynak kartlarında iç içe terim olarak da açılır (petrol → Refined
     Petroleum): orada tık araştırma başlatmaz, yönerge yazılmaz.
     ---------------------------------------------------------------------- */

  provideTooltip('tech', (arg, element) => {
    const nation = me();
    const entry = techById(arg);
    if (!nation || !entry) return null;
    const nested = Boolean(element?.classList?.contains('tip-term'));
    const { tech, categoryId, folder } = entry;
    const world = game.world;
    const year = yearOfTurn(world.turn ?? 1);
    const research = nation.research ?? {};
    const queue = research.queue ?? [];
    const done = hasTech(nation, tech.id);
    const status = done ? 'Researched'
      : research.current === tech.id ? 'Researching'
        : queue.includes(tech.id) ? `Queued #${queue.indexOf(tech.id) + 1}`
          : canResearch(nation, tech.id) ? 'Available' : 'Locked';

    const effects = describeEffects(tech.effects).map((line) => ({
      label: line, value: '', tone: line.startsWith('−') ? 'bad' : 'good',
    }));
    if (tech.unlocks && UNIT_TYPES[tech.unlocks]) {
      effects.push({ label: `Unlocks ${UNIT_TYPES[tech.unlocks].name}: a new arm and production line`, value: '', tone: 'good' });
    }
    if (tech.desc) effects.unshift({ label: tech.desc, value: '' });

    const rows = [];
    if (!done) {
      const cost = effectiveTechCost(world, nation, tech.id, year);
      rows.push({ label: 'Cost', value: `${cost} RP` });
      const onTime = techCost(tech.id, tech.year ?? year);
      const now = techCost(tech.id, year);
      if (now > onTime) {
        rows.push({ label: `Ahead of its time (${tech.year})`, value: `+${Math.round((now / onTime - 1) * 100)}%`, tone: 'bad' });
      }
      const discount = diffusionDiscount(world, nation, tech.id);
      if (discount > 0.005) {
        rows.push({ label: 'Neighbours already know it', value: `−${Math.round(discount * 100)}%`, tone: 'good' });
      }
      const path = researchPath(nation, tech.id);
      const rate = researchPointsOf(nation);
      if (path.length > 1) rows.push({ label: 'Earlier steps first', value: path.length - 1 });
      if (rate > 0) {
        const total = path.reduce((sum, id) => sum + effectiveTechCost(world, nation, id, year), 0);
        const weeks = Math.max(0, Math.ceil((total - (research.points ?? 0)) / rate));
        rows.push({ label: research.current === tech.id ? 'Done in' : 'If started now', value: `${weeks} wk` });
      }
    }
    return {
      type: 'breakdown',
      title: tech.name,
      value: status,
      text: `${esc(TECH_CATEGORIES[categoryId]?.name ?? categoryId)} · ${esc(folder)} · activation ${tech.year}`,
      effects,
      rows,
      rowsLabel: 'Research',
      footer: done || nested ? null : 'Click to research now · Shift+click to queue · Right-click to remove',
    };
  });

  // Ulusal ekranların kartları ayrı dosyada (tooltipState.js).
  registerStateTooltips(game);
}
