// Tooltip içerik sağlayıcıları.
//
// TEK KURAL: burada hiçbir simülasyon formülü yeniden kurulmaz. Her sağlayıcı
// alan katmanının döküm fonksiyonunu okur — economyView, economy.alloc/bills,
// stabilityBreakdown, warSupportBreakdown, powerIncome — ve okuduğunu cümleye
// çevirir (TASARIM.md ilke 2). Cümledeki katsayılar (0.6, 0.2, %60…) defs.js
// sabitlerinden yazılır: ayar değişince kart eskimesin.
//
// Sağlayıcı `null` dönerse tooltip hiç açılmaz — boş bir kart göstermek,
// hiç göstermemekten kötüdür.

import { registerStateTooltips } from './tooltipState.js';
import { provideTooltip } from './tooltip.js';
import { tabLedgerTip } from './tabLedger.js';
import { economyView, formatPopulation, literacyTarget, splitOutput } from '../game/economy.js';
import {
  TECH_CATEGORIES, canResearch, diffusionDiscount, effectiveTechCost, hasTech,
  researchPath, researchPointsOf, techById, techCost,
} from '../game/technology.js';
import { activeAlerts } from '../game/alerts.js';
import { easingNote, shownAlert } from './alerts.js';
import { DELEGATION_AREAS, areasOfScreen, isDelegated } from '../game/delegation.js';
import { INFAMY, INFAMY_COALITION, infamyDecayOf } from '../game/infamy.js';
import {
  DEPOSIT_DEV, DEPOSIT_DEV_BY, DEVELOPMENT_CAP_BASE, DEVELOPMENT_CAP_LITERACY, FEED, FUND_FLOOR_WEEKS,
  HAND_OUTPUT, INDUSTRY_PER_DEV, INVEST, RESOURCES, SUPPLY,
} from '../game/econ/defs.js';
import { billCap, supplyFactor } from '../game/econ/bills.js';
import { consumerStability, feedTarget } from '../game/econ/industry.js';
import { developmentCap } from '../game/econ/investment.js';
import { LEDGER_LINES, LEDGER_LINE_IDS } from '../game/treasury.js';
import { FOCUS_BY_ID } from '../game/focus.js';
import { focusPreview } from '../game/stateFocus.js';
import { growthFactors, provinceName } from '../game/provinces.js';
import { describeEffects, mod, modifierBreakdown } from '../game/modifiers.js';
import { powerIncome } from '../game/politics.js';
import { nationManpower } from '../game/recruitment.js';
import { yearOfTurn } from '../game/calendar.js';
import { UNIT_TYPES } from '../game/units.js';
import { CURRENCY, money } from './kit.js';
import { warOverview } from '../game/warView.js';

const pct = (v, d = 0) => `${((v ?? 0) * 100).toFixed(d)}%`;
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v ?? 0).toFixed(1)}`;
const times = (v) => `×${(v ?? 1).toFixed(2)}`;
const pts = (v) => `${v >= 0 ? '+' : '−'}${Math.abs((v ?? 0) * 100).toFixed(1)}`;
/** `text` ham HTML basilir; simulasyondan gelen cumleler kacirilarak girer. */
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

/**
 * Sağlayıcıları kurar. Oyun nesnesini kapatma (closure) ile taşır ki
 * sağlayıcılar imzalarında dolaşmasın.
 */
export function registerTooltips(game) {
  const me = () => game.world.nations[game.turns.playerNation];

  /* ----------------------------------------------------------------------
     ÜST ÇUBUK — çıktı, faturalar, fon, doyurma kolu, SG, savaş desteği,
     sanayi, kaynaklar. TEK ÇUBUK (2026-10-15): haftalık çıktı faturalar /
     ordu / halk / kalkınma diye bölünür; kartlar bu dört payı aynı
     alanlardan (economy.ic, economy.alloc, economy.bills) okur.
     ---------------------------------------------------------------------- */

  provideTooltip('output', () => {
    const nation = me();
    const economy = nation?.economy;
    const ic = economy?.ic;
    if (!ic) return null;
    const alloc = economy.alloc;
    const rows = [
      { label: `Handwork (${HAND_OUTPUT} per 100k workers)`, value: ic.hand.toFixed(1) },
      { label: `Industry (${INDUSTRY_PER_DEV} per 100k workers per level above 1)`, value: ic.total.toFixed(1) },
      { label: 'The crown', value: ic.crown.toFixed(1) },
      // El ve sanayi ortak çarpanı zaten içerir; satır yalnız nedenini söyler.
      { label: 'Stability, labour and conscription laws, advisors (included)', value: times(ic.factors?.common) },
    ];
    if (alloc) {
      rows.push(
        { label: '→ Bills: supply, schools, martial law', value: alloc.bills.toFixed(1), tone: 'bad' },
        { label: '→ Army production lines', value: alloc.army.toFixed(1) },
        { label: '→ The people (consumer goods)', value: alloc.people.toFixed(1) },
        { label: '→ Development', value: alloc.invest.toFixed(1), tone: 'good' },
      );
    }
    return {
      type: 'breakdown',
      title: 'Output',
      value: `${ic.output.toFixed(1)} IC/wk`,
      text: `Everything the nation makes in a week. Every 100,000 workers make ${HAND_OUTPUT} IC by hand; every development `
        + `level above 1 adds ${INDUSTRY_PER_DEV} IC of industry per 100,000 workers — industry needs coal and grows with technology. `
        + 'The state\'s <b>bills</b> come off the top, the <b>army</b> draws its production lines from industry, the '
        + '<b>people</b> are fed as far as the handle says, and everything left <b>develops</b> the country.',
      rows,
      rowsLabel: 'This week',
    };
  });

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
    // Kayıp istikrar dökümünün kendi satırıdır; dökümde yoksa (ilk hafta) yazılmaz.
    const stabilityHit = nation.politics?.stabilityParts?.find((part) => part.label === 'Supply crisis')?.value;
    return {
      type: 'breakdown',
      title: crisis ? 'Bills — supply crisis' : 'Bills',
      value: `${bills.owed.toFixed(1)} IC/wk`,
      text: 'Army and navy supply, schools and martial law come off the top of output, before the army\'s lines, '
        + `the people and development. They may take at most ${pct(cap)} of output. Above that the nation is in a `
        + '<b>supply crisis</b>: every bill is paid in part; reinforcement, training and organisation recovery slow to '
        + '×(0.5 + 0.5 × the share paid) and stability falls by up to 20 points.',
      rows: [
        { label: `Army supply: ${bills.land} regiments × ${perRegiment.toFixed(2)}${bills.atWar ? ` (at war ×${SUPPLY.war})` : ''}`, value: bills.army.toFixed(1) },
        { label: `Navy supply: ${(bills.sea ?? 0).toFixed(1)} ships`, value: bills.navy.toFixed(1) },
        { label: 'Schools (education law)', value: bills.schools.toFixed(1) },
        bills.martial > 0.05 ? { label: 'Martial law', value: bills.martial.toFixed(1) } : null,
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
        + 'investment efficiency: technology, advisors, the trade law, timber and iron) and buys development levels '
        + `state by state — the best gain for its cost first; states with the Develop focus come first and pay ${discount}% less. `
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
  // Eski kimlik: üst çubuk fon hücresini 'treasury' adıyla işaretliyor olabilir.
  provideTooltip('treasury', fundTip);

  /**
   * DOYURMA KOLU — ekonominin tek kolu. Bir adım önizlemesi oyunun saf
   * paylaşım fonksiyonundan (splitOutput) gelir: kart oyunla ayrışamaz.
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
    return {
      type: 'breakdown',
      title: 'Feeding the people',
      value: `×${target.toFixed(2)}${auto ? ' · AUTO' : ''}`,
      text: 'The one handle of the economy: how well the people are fed. Consumer goods = feed × need, and the need grows '
        + 'with the population and every decade. Fed above their need the people are steadier, grow faster and stay calmer '
        + '(the gain tops out around ×1.2); below it stability, growth and calm fall. Everything not fed develops the country. '
        + `AUTO feeds ×0.95–1.10 in peace by temperament, ×${FEED.war} at war, +${FEED.unrest.toFixed(2)} while stability is below 40%.`,
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
      text: `${esc(focus.desc)} Without it the fund buys the level with the best gain for its cost anywhere in the `
        + 'nation. Each level adds industry, deposit output and population growth.',
      rows: lines.map((line) => ({ label: line, value: '' })).concat(mine && target?.provinceId === province.id
        ? [{ label: 'The fund is saving for this state now', value: `level ${target.level}`, tone: 'good' }] : []),
      footer: 'Focus slots grow with literacy.',
    };
  });

  provideTooltip('power', () => {
    const nation = me();
    if (!nation) return null;
    const income = powerIncome(nation);
    return {
      type: 'breakdown',
      title: 'Political power',
      value: `${Math.round(nation.power ?? 0)} / 500`,
      text: 'The currency of government: laws, advisors, propaganda, culture policy, '
        + 'war justification, embargoes and decisions all cost political power.',
      rows: [
        { label: 'Base', value: '+1.00' },
        ...modifierBreakdown(nation, 'power').map((row) => ({ label: row.label, value: `+${row.value.toFixed(2)}`, tone: 'good' })),
        { label: 'Stability multiplier', value: `×${income.stability.toFixed(2)}` },
        { label: 'Per week', value: `+${income.total.toFixed(2)}`, tone: 'good' },
      ],
    };
  });

  // Sağ üst savaş kutusu (ui/warDock.js): kutunun kısalttığı her şey burada.
  provideTooltip('war', (id) => {
    const view = warOverview(game.world, game.turns.playerNation, game.world.turn ?? 0);
    const w = view.wars.find((row) => row.enemyId === Number(id));
    if (!w) return null;
    const started = w.aggressor === 'us' ? 'We declared this war.' : w.aggressor === 'them' ? `${w.name} declared this war.` : '';
    const goals = [w.goal ? `Our goal: ${w.goal}.` : '', w.theirGoal ? `Their goal: ${w.theirGoal}.` : ''].filter(Boolean).join(' ');
    return {
      type: 'breakdown',
      title: `War with ${w.name}`,
      value: `score ${w.score > 0 ? '+' : ''}${w.score}`,
      text: `${started} ${goals} War score runs from −100 to +100: occupied land, the enemy capital, losses and remaining strength.`.trim(),
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

  provideTooltip('warsupport', () => {
    const nation = me();
    const parts = nation?.politics?.warSupportParts;
    if (!parts) return null;
    return {
      type: 'breakdown',
      title: 'War support',
      value: pct(nation.warSupport),
      text: 'How willing the people are to fight. Extensive conscription needs 50%, total '
        + 'mobilisation 80%. Below 20% the nation accepts harsh peace terms.',
      rows: parts.map((part) => ({ label: part.label, value: pts(part.value), tone: part.value >= 0 ? 'good' : 'bad' })),
      footer: `Heading to ${pct(nation.politics?.warSupportTarget)}, one point a week.`,
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
      text: `The part of output that development builds: every level above 1 adds ${INDUSTRY_PER_DEV} IC per 100,000 `
        + 'workers. It burns coal, iron and timber (and oil once refineries come) and grows with technology. The economy '
        + `law lets the army's production lines draw up to ${law}% of it; what they leave goes to the people and development.`,
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

  provideTooltip('resource', (id) => {
    const nation = me();
    const info = RESOURCES[id];
    const record = nation?.economy?.resources?.[id];
    if (!info || !record) return null;
    const partner = record.topPartner >= 0 && (record.imported ?? 0) > 0.05 ? game.world.nations[record.topPartner] : null;
    const uses = {
      FOOD: 'Feeds the people. Below 70% the population shrinks.',
      COAL: 'Fuels industry: short coal costs up to 40% of it.',
      IRON: 'Industry and development eat it; so do rifles, artillery, tanks and steel warships. Short iron slows investment.',
      TIMBER: 'Development eats it (short timber slows investment); so do rifle stocks, early airframes and wooden hulls.',
      HORSES: 'Cavalry and artillery: without them they fight up to 40% weaker.',
      SALTPETER: 'Gunpowder: every regiment in battle burns it; short powder costs up to 30% of strength. Rifle and artillery lines use it too, and so does fertiliser.',
      OIL: 'The fuel of the age. Industry runs on it (+15%, more with Refined Petroleum and Synthetic Fuel, in proportion to the oil you have); tanks and aircraft move on it and lose up to 60% of their strength without it.',
      RUBBER: 'Tyres and field telegraph: every land regiment wants it, up to +15% in battle in proportion to the rubber you have. Tanks and aircraft are built with it.',
    }[id];
    return {
      type: 'breakdown',
      title: info.name,
      value: record.need > 0.01 ? `${pct(record.ratio)} covered` : 'no need',
      text: uses,
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
     EYALET KUTUSU — denetim, RGO, kültür
     ---------------------------------------------------------------------- */

  provideTooltip('control', () => ({
    type: 'mechanic',
    title: 'Control',
    text: 'How much of this state actually answers to you. Freshly taken land '
      + 'starts low and climbs back; occupied land pays you nothing until the '
      + 'peace is signed.',
  }));


  /* ----------------------------------------------------------------------
     UST CUBUK — istikrar, sohret, ordu, insan gucu
     Tarayicinin `title` balonu bir saniye gecikiyor, duz metin basiyor ve
     ekran goruntusune bile girmiyor; kor oyun testinde "tooltip yok" diye
     okundu. Ayni bilgi artik geciktirmeli kartta.
     ---------------------------------------------------------------------- */

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
      text: 'How firmly the country holds together. It multiplies political power and output; '
        + 'below 30% unrest boils over. It moves one point a week toward its target.',
      rows: parts.map((part) => ({ label: part.label, value: pts(part.value), tone: part.value >= 0 ? 'good' : 'bad' })),
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
      text: `How much the world resents your conquests. At ${INFAMY_COALITION} your `
        + 'neighbours unite in a coalition and declare war on you together.',
      rows: [
        // İşgal şöhreti yalnız İLAN ETTİĞİN savaşta kesilir (turn.js): savunma
        // savaşında düşman toprağını tutmak bedavadır. Kart bunu söylemiyordu;
        // savunma savaşında 0.0 kalan şöhret "bozuk" görünüyordu.
        { label: 'Occupying a foreign-culture hex — wars you declared', value: `+${INFAMY.FOREIGN_CULTURE_TILE}`, tone: 'bad' },
        { label: 'Occupying a hex of your own culture — wars you declared', value: `+${INFAMY.OWN_CULTURE_TILE}`, tone: 'bad' },
        { label: 'Occupying a city — wars you declared', value: `+${INFAMY.CITY}`, tone: 'bad' },
        { label: 'Occupying in a war declared on you', value: '+0', tone: 'good' },
        { label: 'Annexing at the peace table (any war)', value: 'per hex, city and person', tone: 'bad' },
        { label: 'Forgotten every week', value: `−${decay.toFixed(2)}`, tone: 'good' },
      ],
      footer: infamy >= INFAMY_COALITION * 0.6
        ? 'Close to the threshold: one more annexation may unite your neighbours.'
        : 'A single border state is safe; a string of annexations is not.',
    };
  });

  provideTooltip('army', () => ({
    type: 'mechanic',
    title: 'Army',
    text: 'Men under arms: soldiers drawn from your states and serving in your '
      + 'divisions. A regiment is 30,000 infantry, 20,000 cavalry or 15,000 gunners. '
      + 'Survivors of a disbanded unit walk home; the dead do not.',
  }));

  provideTooltip('manpower', () => {
    const nation = me();
    return {
      type: 'mechanic',
      title: 'Manpower',
      text: `Recruits available: ${formatPopulation(nation ? nationManpower(game.world, nation.id) : 0)}. `
        + 'The conscription law sets the share of the population that can be called up (2% to 15%); '
        + 'technology, advisors, the citizenship law and compliance raise or lower it. Regiments and reinforcements draw from it.',
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
      footer: 'Click the icon to pin the note; ✕ silences it until the situation changes.',
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
      political: ['Army map', 'Borders, nations and armies: divisions, fronts, battles and offensives. Occupied hexes carry a hatch; the front of the selected commander is outlined.'],
      terrain: ['Terrain', 'Relief and vegetation without borders: where armies slow down and where the land is rich.'],
      geography: ['Geography', 'The bare world as the generator drew it — continents, seas and straits, no borders or units.'],
      cultures: ['Cultures', 'Who lives where. Hatching marks states whose majority differs from the owner\'s culture.'],
      resources: ['Resources', 'What every state produces: food, coal, iron, timber, horses or saltpeter — and the oil and rubber fields that only matter once industry and armies need them.'],
      population: ['Population', 'How many people live in each state, in four bands.'],
      seas: ['Navy map', 'The seas, region by region. Green waters are yours, red the enemy\'s, amber contested. Give each sea a priority and the admiralty sails the fleet there; whoever holds a sea blockades the coasts on it and sinks the transports crossing it. Shortcut: M.'],
      diplomacy: ['Diplomacy', 'Who is at war with whom. Green is the nation you look from, red its enemies, blue its allies; hatching marks occupied land. Click any nation to see the map through its eyes.'],
      unrest: ['Unrest', 'How close each state is to revolt, 0 to 10. Above 7 a revolt starts to brew; foreign culture, hunger and occupation drive it.'],
      industry: ['Industry', 'Industry in each state, across every nation: every development level above the first is industry — where the industrial heartlands are.'],
      infamy: ['Infamy', `How feared each nation is. At ${INFAMY_COALITION} the neighbours start forming coalitions against it.`],
      layers: ['Layers', 'Grid, labels, live sea, and the seed of this world.'],
    };
    const row = table[mode];
    return row ? { type: 'simple', title: row[0], text: row[1] } : null;
  });

  /**
   * Sekme künyesi: ekranın ne olduğu ve AUTO ışığının anlamı. Işık tek başına
   * "bu neden yeşil yanıyor" sorusunu cevaplamaz; cümle devir tablosundan gelir.
   */
  provideTooltip('tab', (screen) => {
    const TAB = {
      construction: ['Development', 'The development fund, the state it develops next and the level and cap of every state.', 'F1'],
      industry: ['Factories', 'Industry, consumer goods and the production lines.', 'F2'],
      trade: ['Trade', 'Your resources, the world market and embargoes.', 'F3'],
      budget: ['Economy', 'The weekly output and its split: bills, army, people and development — and the handle that feeds the people.', 'F4'],
      military: ['Military', 'Regiments, training, equipment and commanders.', 'F5'],
      population: ['Population', 'Growth, literacy, manpower and the unification of your people.', 'F6'],
      cultures: ['Cultures', 'Every people in the nation: rights, assimilation, deportation, resettlement, movements and state focus.', 'F7'],
      politics: ['Politics', 'Government, laws, advisors, agenda and decisions.', 'F8'],
      technology: ['Technology', 'The research tree, the queue and what each technology does.', 'F9'],
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
    const text = !states.length ? row[1] : `${row[1]} ${states.map((a) => (a.on
      ? `${a.area.name} is run by the government: ${a.area.desc} Turn it off with ${where(a)}.`
      : `You run ${a.area.name} yourself; ${where(a)} hands it to the government.`)).join(' ')}`;
    // Sekmenin canlı satırı (Vic2 üst menüsü): yuvaya sığmayan ad, ölçü ve
    // eşikler burada. Kart açıkken haftalık tazelenir (tabLedger.sync).
    const live = nation ? tabLedgerTip(screen) : null;
    if (!live) return { type: 'simple', title, text };
    return { type: 'breakdown', title, value: live.value, text, rows: live.rows, rowsLabel: 'This week' };
  });

  provideTooltip('setup', (field) => {
    const table = {
      seed: ['World seed', 'Any text. The same seed always draws the same world, nations and opening economy — share it to share a map. Blank picks a random one.'],
      size: ['Map size', 'Hex columns; rows follow the aspect. 160 × 96 is the standard world the game is balanced on.'],
      cont: ['Continentality', 'How the land clumps: low values scatter islands and peninsulas, high values fuse them into a few large continents.'],
      land: ['Land ratio', 'Nudges the share of land. 0.00 is the standard 36% land; negative drowns the coasts, positive raises them.'],
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
    text: 'States of a culture your nation does not accept recover control more '
      + 'slowly and are unhappier, and their grievance grows every year. Accept a '
      + 'people — or revoke it — in the Cultures tab (F7); citizenship law sets how '
      + 'much the rest serve and how restless they are.',
  }));

  /* ----------------------------------------------------------------------
     TEKNOLOJİ — ağaç düğümü ve kuyruk çipi (bkz. technologyScreen.js).
     Fiyat motorun ETKİN fiyatıdır; erken araştırma cezası ve yayılım
     indirimi formül kopyalanmadan, motorun kendi fonksiyonlarından okunur.
     ---------------------------------------------------------------------- */

  provideTooltip('tech', (arg) => {
    const nation = me();
    const entry = techById(arg);
    if (!nation || !entry) return null;
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
      footer: done ? null : 'Click to research now · Shift+click to queue · Right-click to remove',
    };
  });

  /* ----------------------------------------------------------------------
     SÖZLÜK — ekranların özet etiketleri. Tanım kısa; bugünkü değer ve nereden
     geldiği, okunabiliyorsa, yanında. Formül burada kopyalanmaz: yalnız alan
     katmanının zaten hesapladığı sayılar okunur.
     ---------------------------------------------------------------------- */

  /**
   * Kalkınma kademesinin büyümeye katkısı, provinces.growthFactors'ın kendi
   * çarpanından (iki kademenin farkı). Kıtlıkta döküm çarpan taşımaz: null.
   */
  const growthPerLevel = (nation) => {
    const one = growthFactors(nation, { development: 1 }).development;
    const two = growthFactors(nation, { development: 2 }).development;
    return Number.isFinite(one) && Number.isFinite(two) ? two - one : null;
  };

  const GLOSSARY = {
    literacy: (nation) => ({
      type: 'breakdown',
      title: 'National literacy',
      value: pct(nation.economy?.literacy, 1),
      text: 'Schooling of the nation. It feeds research, raises the development cap and quickens '
        + 'national movements. It drifts slowly toward a target set by the education law, whose schools are a weekly bill; '
        + 'in a supply crisis the schools work only as far as the bill is paid.',
      rows: [
        { label: 'Now', value: pct(nation.economy?.literacy, 1) },
        { label: 'Heading toward', value: pct(literacyTarget(game.world, nation), 1), tone: 'good' },
      ],
    }),
    research: (nation) => ({
      type: 'breakdown',
      title: 'Research points',
      value: `${researchPointsOf(nation).toFixed(2)}/wk`,
      text: 'One point a week, plus literacy × 6; technology, ministers and parties multiply.',
    }),
    unrest: () => ({
      type: 'mechanic',
      title: 'Unrest',
      text: 'From 0 to 10. Unaccepted peoples, fresh conquest, an unpopular war and hungry people push it up; '
        + 'minority rights and well-fed people pull it down. Unrest feeds national movements.',
    }),
    compliance: () => ({
      type: 'mechanic',
      title: 'Compliance',
      text: 'How far a non-core state accepts our rule (0-100). Output, recruits and resources '
        + 'come in at 25% plus 75% of compliance. Cores always give everything.',
    }),
    consumer: () => ({
      type: 'mechanic',
      title: 'Consumer goods',
      text: 'What the people consume. The feed handle on the Economy screen sets it to a multiple of their need; '
        + 'the need grows with the population and every decade. Short goods cost stability and growth and raise unrest; '
        + 'a surplus helps up to about ×1.2. What the people do not eat develops the country.',
    }),
    development: (nation) => {
      const literacy = nation.economy?.literacy ?? 0;
      const growth = growthPerLevel(nation);
      const cap = developmentCap(nation);
      return {
        type: 'breakdown',
        title: 'Development',
        value: `cap ${cap}`,
        text: 'Roads, towns, railways and factories, bought level by level with the development fund. Each level above 1 '
          + `adds ${INDUSTRY_PER_DEV} IC of industry per 100,000 workers; each level adds `
          + `${growth != null ? `+${Math.round(growth * 100)}%` : 'more'} population growth and lets deposits dig `
          + `+${Math.round(DEPOSIT_DEV.perDev * 100)}% of their base (iron and timber `
          + `+${Math.round(DEPOSIT_DEV_BY.IRON.perDev * 100)}%: industry needs them). Every level costs more than the last. `
          + 'No state develops beyond the cap: schools raise it.',
        rows: [
          { label: 'Base', value: String(DEVELOPMENT_CAP_BASE) },
          { label: 'Technology', value: signed(mod(nation, 'developmentCap')) },
          { label: `Literacy ${pct(literacy)} × ${DEVELOPMENT_CAP_LITERACY}`, value: `+${(literacy * DEVELOPMENT_CAP_LITERACY).toFixed(2)}` },
          { label: 'Cap (rounded)', value: String(cap) },
        ],
        rowsLabel: 'The cap',
      };
    },
    officers: () => ({
      type: 'mechanic',
      title: 'Officers',
      text: 'Generals and admirals. Each commands an army or fleet; their skill shapes battle rolls and sieges. '
        + 'A new commission is paid from the development fund.',
    }),
    upkeep: (nation) => ({
      type: 'mechanic',
      title: 'Army supply',
      text: `A bill paid off the top of output every week: ${SUPPLY.land} IC per regiment and ${SUPPLY.sea} per warship `
        + `at the start, growing with the era to ×${(1 + SUPPLY.eraGrowth).toFixed(1)}, and ×${SUPPLY.war} while at war. `
        + `When all the bills pass ${pct(billCap(nation))} of output the nation is in a supply crisis.`,
    }),
  };

  provideTooltip('term', (arg) => {
    const nation = me();
    const entry = GLOSSARY[arg];
    return nation && entry ? entry(nation) : null;
  });

  // Ulusal ekranların kartları ayrı dosyada (tooltipState.js).
  registerStateTooltips(game);
}
