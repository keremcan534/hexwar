// ULUSAL EKRANLARIN BİLGİ KARTLARI — yasa, fon defteri satırı, parti, danışman,
// karar, gündem, üretim hattı, state.
//
// Kural (tooltip.js): içerik burada HESAPLANMAZ, oyunun döküm fonksiyonları
// okunur. Ekran bir sayıyı gösteriyorsa kartı "neden" ve "neyi değiştirir"
// sorularını cevaplar; ekran ile kart aynı fonksiyondan okur, ayrışamaz.

import { provideTooltip } from './tooltip.js';
import { lawTerm, term } from './tooltipGlossary.js';
import { LAWS } from '../game/laws.js';
import { ADVISOR_COST, LAW_LOCK, governmentView, PARTIES } from '../game/politics.js';
import { decisionsView } from '../game/decisions.js';
import { AGENDA } from '../game/agenda.js';
import { describeEffects } from '../game/modifiers.js';
import { economyView, formatPopulation } from '../game/economy.js';
import {
  EQUIPMENT, FOOD_BASE, FOOD_FERTILITY, HAND_OUTPUT, INDUSTRY_PER_DEV, INVEST, RESOURCES,
} from '../game/econ/defs.js';
import { depositsOf, fertilityOf } from '../game/econ/deposits.js';
import { linePriorityOf } from '../game/econ/industry.js';
import { developmentCap } from '../game/econ/investment.js';
import { FOCUS_BY_ID } from '../game/focus.js';
import { occupiedShareOf, provinceName } from '../game/provinces.js';
import { LEDGER_LINES } from '../game/treasury.js';
import { stateCultures, stateYield } from '../game/stateView.js';
import { depositDevOf, outputBreakdown } from '../game/econ/resources.js';
import { priceOf } from '../game/econ/trade.js';
import { CULTURE, unrestBreakdown } from '../game/culture.js';
import { MOVEMENT } from '../game/movements.js';
import { esc, money, signedMoney } from './kit.js';

const signed = (value, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value ?? 0).toFixed(digits)}`;
const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;

/** describeEffects satırı ("+5% National output") → kartın etki satırı. */
function effectRows(effects) {
  return describeEffects(effects).map((line) => {
    const at = line.indexOf(' ');
    const value = at > 0 ? line.slice(0, at) : line;
    const label = at > 0 ? line.slice(at + 1) : '';
    return { label: label || value, value: label ? value : '', tone: value.startsWith('−') ? 'bad' : 'good' };
  });
}

/**
 * Fon defteri satırı → ne olduğu, neyle oynanır. Faturalar (ikmal, okul,
 * sıkıyönetim) bu deftere girmez: çıktının önünden düşer (kart 'bills').
 */
// İşlev: terimler sağlayıcılar kurulduktan SONRA yazılmalı (modül yüklenirken
// sözlük henüz yok, tipTerm düz metin dönerdi).
const ledgerText = (id) => ({
  investment: () => `The output left after the ${term('bills')}, the army's lines and the people, multiplied by investment efficiency `
    + `(technology, advisors, the trade law, timber and iron). ${term('feeding', 'Feed the people')} less and more flows in.`,
  exports: () => `Surplus resources sold abroad at the world price, up to the share your ${lawTerm('trade', 'trade law')} allows.`,
  treaty: () => 'Reparations and tribute from peace treaties, paid or received.',
  grant: () => 'One-off windfalls: a rich harvest, a boom, an event choice.',
  imports: () => `Shortages are bought automatically at the world price while the ${term('fund', 'fund')} is above its floor.`,
  development: () => `${term('development', 'Development')} levels the fund bought. A level costs ${INVEST.cost} × the state's people in 100k × the new `
    + `level ${INVEST.exponent === 2 ? 'squared' : `to the power ${INVEST.exponent}`}; the ${term('develop', 'Develop focus')} takes `
    + `${Math.round((1 - INVEST.focusDiscount) * 100)}% off.`,
  outlay: () => `One-off purchases: new ${term('officers', 'generals and admirals')}, settlers, event choices and agenda projects.`,
})[id]?.() ?? '';

export function registerStateTooltips(game) {
  const me = () => game.world.nations[game.turns.playerNation];
  const turn = () => game.turns?.turn ?? game.world?.turn ?? 0;

  provideTooltip('law', (lawId) => {
    const law = LAWS[lawId];
    const nation = me();
    if (!law || !nation) return null;
    const view = governmentView(game.world, nation, turn());
    const row = view.laws.find((entry) => entry.id === lawId);
    return {
      type: 'mechanic',
      title: law.name,
      text: law.options.map((option, index) => `${index === row?.current ? '▸ ' : ''}<b>${option.name}</b> — ${option.desc}`).join('<br>'),
      footer: `Changing a law costs ${view.lawCost} ${term('power', 'political power')} and locks it for ${LAW_LOCK} weeks.${row?.lock ? ` Locked for ${row.lock} more weeks.` : ''}`,
    };
  });

  provideTooltip('law-option', (arg) => {
    const [lawId, index] = String(arg).split(':');
    const law = LAWS[lawId];
    const option = law?.options[Number(index)];
    const nation = me();
    if (!option || !nation) return null;
    const view = governmentView(game.world, nation, turn());
    const row = view.laws.find((entry) => entry.id === lawId);
    const blockers = row?.options[Number(index)]?.blockers ?? [];
    const current = row?.current === Number(index);
    return {
      type: 'mechanic',
      title: `${law.name}: ${option.name}`,
      text: option.desc,
      footer: current ? 'This is the current law.'
        : blockers.length ? blockers.join(' · ')
          : `Click twice to enact: ${view.lawCost} ${term('power', 'political power')}, then locked for ${LAW_LOCK} weeks.`,
    };
  });

  provideTooltip('ledger', (id) => {
    const nation = me();
    if (!nation?.economy || !LEDGER_LINES[id]) return null;
    const ledger = economyView(game.world, nation).ledger ?? {};
    return {
      type: 'breakdown',
      title: LEDGER_LINES[id].label,
      value: `${signedMoney(ledger[id] ?? 0)} last week`,
      text: ledgerText(id),
    };
  });

  provideTooltip('party', (id) => {
    const party = PARTIES[id];
    const nation = me();
    if (!party || !nation) return null;
    const view = governmentView(game.world, nation, turn());
    const row = view.support.find((entry) => entry.id === id);
    return {
      type: 'mechanic',
      title: party.name,
      text: party.pitch,
      effects: effectRows(party.effects),
      rows: [
        { label: 'Popular support', value: `${Math.round(row?.support ?? 0)}%` },
        { label: 'In government', value: row?.ruling ? 'yes' : 'no' },
      ],
      footer: `The ruling party grants its bonus and bounds which laws you may pass. If the people want another party, ${term('legitimacy')} costs ${term('stability')}.`,
    };
  });

  provideTooltip('advisor', (arg) => {
    const [slot, id] = String(arg).split(':');
    const nation = me();
    if (!nation) return null;
    const view = governmentView(game.world, nation, turn());
    const seat = view.advisors.find((entry) => entry.slot === slot);
    const person = seat?.hired?.id === id ? seat.hired : seat?.candidates.find((c) => c.id === id);
    if (!person) return null;
    return {
      type: 'mechanic',
      title: `${person.title} ${person.name}`,
      text: `${seat.name} seat.`,
      effects: effectRows(person.effects),
      footer: seat.hired?.id === id ? 'Serving now. Dismissing frees the seat.'
        : person.blockers?.length ? person.blockers.join(' · ') : `Hire for ${ADVISOR_COST} ${term('power', 'political power')}; replaces whoever holds the seat.`,
    };
  });

  provideTooltip('decision', (id) => {
    const nation = me();
    const decision = nation ? decisionsView(nation, turn()).find((entry) => entry.id === id) : null;
    if (!decision) return null;
    return {
      type: 'mechanic',
      title: decision.name,
      text: decision.desc,
      rows: [
        { label: 'Cost', value: `${decision.cost} political power` },
        { label: 'Cooldown', value: `${decision.cooldown} weeks` },
      ],
      footer: decision.blockers.length ? decision.blockers.join(' · ') : 'Available now.',
    };
  });

  provideTooltip('agenda', (id) => {
    const item = AGENDA[id];
    if (!item) return null;
    return {
      type: 'mechanic',
      title: item.name,
      text: item.desc,
      rows: [{ label: 'Reward', value: item.reward }, { label: 'Takes', value: `${item.weeks ?? '—'} weeks` }],
      footer: 'One national project at a time. Choosing is free; the reward arrives when it completes.',
    };
  });

  provideTooltip('line', (id) => {
    const info = EQUIPMENT[id];
    const nation = me();
    if (!info || !nation?.economy) return null;
    const line = nation.economy.lines?.[id] ?? {};
    const recipe = Object.entries(info.resources ?? {}).map(([res, amount]) => `${amount} ${RESOURCES[res]?.name ?? res}`).join(', ');
    const priority = linePriorityOf(line.weight ?? 0);
    return {
      type: 'breakdown',
      title: `${info.name} line`,
      value: `${(line.output ?? 0).toFixed(1)} per week`,
      text: `Each unit costs ${info.ic} IC and ${recipe || 'no materials'}. The army's share of ${term('industry')} `
        + `(set by the ${lawTerm('economy', 'economy law')}) is split between the lines by priority.`,
      rows: [
        { label: 'Priority', value: line.mode === 'manual' ? `${priority.name} (yours)` : `Auto · ${priority.id === 'off' ? 'stopped' : priority.name}` },
        { label: 'Industry on this line', value: `${(line.ic ?? 0).toFixed(2)} IC` },
        { label: 'Efficiency', value: pct(line.efficiency), tone: (line.efficiency ?? 0) < 0.4 ? 'bad' : 'good' },
        { label: 'Materials available', value: pct(line.limit ?? 1), tone: (line.limit ?? 1) < 1 ? 'bad' : 'good' },
      ],
      footer: 'Efficiency grows while a line works and decays while it idles: switching lines often wastes industry.',
    };
  });

  // --- STATE KARTININ AÇIKLAMALARI (Kerem: "timber ×1.5 ne demek, fertility
  // ne demek, unrest neyden geliyor, state'ten gelir ne kadar"). Her satır
  // oyunun formülünün bir çarpanıdır (game/stateView.js, outputBreakdown).

  // State'in getirisi artık vergi değil ÇIKTIDIR (el + sanayi); sahibinin
  // haftalık çubuğuna girer. Mallar dünya fiyatıyla değerdir, toplanmaz.
  provideTooltip('state-income', (id) => {
    const province = game.world.provinces?.[Number(id)];
    const y = province ? stateYield(game.world, province) : null;
    if (!y) return null;
    const owner = game.world.nations[y.nationId];
    const out = y.output;
    return {
      type: 'breakdown',
      title: `${provinceName(province.center)} — what it makes`,
      value: `${money(y.total, 2)} / week`,
      text: `${term('output', 'Output')} goes into ${esc(owner?.name ?? 'the owner')}'s weekly bar: ${term('bills')}, the army, `
        + `the people and ${term('development')}. Goods are valued at the world price: sold abroad they add to the `
        + `${term('fund', 'development fund')}, used at home they save imports.`,
      rowsLabel: 'This week',
      rows: [
        { label: `Handwork (${HAND_OUTPUT} per 100k workers)`, value: money(y.hand, 2) },
        { label: `Industry (development ${y.development}: ${Math.max(0, y.development - 1)} × ${INDUSTRY_PER_DEV} per 100k workers)`, value: money(y.industry, 2) },
        out ? { label: 'Workforce (not under arms)', value: pct(out.work), tone: out.work < 0.97 ? 'bad' : '' } : null,
        out ? { label: 'Status', value: pct(out.status), tone: out.status < 1 ? 'bad' : '' } : null,
        // Rıza el, sanayi ve yatakları çarpar (econ/output.js); satırı yokken çarpanlar toplamı tutmuyordu.
        (province.econ?.consent ?? 1) < 0.995
          ? { label: 'Consent', labelHtml: term('consent', 'Consent'), value: pct(province.econ.consent), tone: 'bad' } : null,
        ...y.goods.map((g) => ({ label: `${RESOURCES[g.id]?.name ?? g.id}: ${g.amount.toFixed(2)} / week × ${money(g.price, 2)}`, value: `≈${money(g.value, 2)}` })),
        y.next
          ? { label: `Level ${y.next.level} would cost ${money(y.next.cost, 0)} and add`, value: `+${money(y.next.gain, 2)} / week`, tone: 'good' }
          : { label: 'Development', value: `${y.development} / ${y.cap} — at the cap` },
      ].filter(Boolean),
    };
  });

  provideTooltip('deposit', (arg) => {
    const [pid, resId] = String(arg).split(':');
    const province = game.world.provinces?.[Number(pid)];
    const nation = game.world.nations[province?.owner];
    const out = province && nation ? outputBreakdown(province, nation) : null;
    const row = out?.deposits.find((d) => d.id === resId);
    if (!row) return null;
    const name = RESOURCES[resId]?.name ?? resId;
    const level = province.econ?.development ?? 1;
    return {
      type: 'breakdown',
      title: `${name} deposit ×${row.size.toFixed(1)}`,
      value: `${row.total.toFixed(2)} / week`,
      text: `×${row.size.toFixed(1)} is the size of the deposit: this state digs ${row.size.toFixed(1)} times the base amount of `
        + `${name.toLowerCase()}. ${term('development', 'Development')} raises it; men under arms, a non-core status `
        + `(${term('compliance')}) and withheld ${term('consent')} lower it.`,
      rows: [
        { label: 'Base output', value: row.base.toFixed(3) },
        { label: 'Deposit size', value: `×${row.size.toFixed(2)}` },
        { label: `Development ${level} (${depositDevOf(resId).base} + ${depositDevOf(resId).perDev} per level)`, value: `×${row.dev.toFixed(2)}` },
        { label: 'Technology, advisors', value: `×${row.extra.toFixed(2)}` },
        { label: 'Workforce (not under arms)', value: pct(out.work), tone: out.work < 0.97 ? 'bad' : '' },
        { label: 'Status', value: pct(out.status), tone: out.status < 1 ? 'bad' : '' },
        out.focus !== 1 ? { label: 'State focus', value: `×${out.focus.toFixed(2)}`, tone: 'good' } : null,
        (province.econ?.consent ?? 1) < 0.995
          ? { label: 'Consent', labelHtml: term('consent', 'Consent'), value: pct(province.econ.consent), tone: 'bad' } : null,
        { label: 'Worth at the world price', value: `≈${money(row.total * priceOf(game.world, resId), 2)} / week` },
      ].filter(Boolean),
    };
  });

  provideTooltip('fertility', (id) => {
    const province = game.world.provinces?.[Number(id)];
    const nation = game.world.nations[province?.owner];
    const out = province && nation ? outputBreakdown(province, nation) : null;
    if (!out) return null;
    const f = out.food;
    const balance = f.total - f.need;
    return {
      type: 'breakdown',
      title: `Fertility ${pct(f.fertility)}`,
      value: `${f.total.toFixed(2)} food / week`,
      text: 'How well the land grows food. Every 100,000 people at work grow a base amount plus a share that scales with fertility. Fertile states feed the nation, barren ones import.',
      rows: [
        { label: 'Food per 100k workers', value: `${f.perUnit.toFixed(2)} (${FOOD_BASE} + ${FOOD_FERTILITY} × fertility)` },
        { label: 'Workers (100k)', value: f.units.toFixed(2) },
        { label: 'Technology, saltpeter fertiliser', value: `×${f.mods.toFixed(2)}` },
        out.focus !== 1 ? { label: 'State focus', value: `×${out.focus.toFixed(2)}`, tone: 'good' } : null,
        { label: 'Status', value: pct(out.status), tone: out.status < 1 ? 'bad' : '' },
        { label: 'This state eats', value: f.need.toFixed(2) },
        { label: balance >= 0 ? 'Surplus for the nation' : 'Shortfall', value: signed(balance, 2), tone: balance >= 0 ? 'good' : 'bad' },
      ].filter(Boolean),
    };
  });

  provideTooltip('unrest', (id) => {
    const province = game.world.provinces?.[Number(id)];
    const nation = game.world.nations[province?.owner];
    if (!province?.econ || !nation) return null;
    // İşgal payı simülasyonla aynı kaynaktan (culture.runProvinceCulture,
    // peoplesView): 0 verilince işgal altındaki state'in hedefi düşük, işgal
    // satırı hiç yoktu (T-10).
    const p = unrestBreakdown(game.world, province, nation, { occupied: occupiedShareOf(game.world, province), turn: turn() });
    const now = province.econ.unrest ?? 0;
    const row = (label, value, positiveIsBad = true, labelHtml = null) => (Math.abs(value) < 0.05 ? null
      : { label, labelHtml, value: signed(positiveIsBad ? value : -value), tone: (positiveIsBad ? value : -value) > 0 ? 'bad' : 'good' });
    return {
      type: 'breakdown',
      title: `Unrest ${now.toFixed(1)} / ${CULTURE.MAX_UNREST}`,
      value: `heading to ${p.target.toFixed(1)}`,
      text: `${term('unrest', 'Unrest')} moves ${Math.round(CULTURE.APPROACH * 100)}% of the way to its target each week. `
        + `Where the states of a people that is not accepted pass ${MOVEMENT.CALM} on average, its national movement grows; below, it fades.`,
      rows: [
        row(`Not accepted (${pct(p.foreign)} of the people)`, p.culture, true, `Not ${term('acceptance', 'accepted')} (${pct(p.foreign)} of the people)`),
        row('Years of foreign rule (grows until you act)', p.grievance),
        row('Recent conquest', p.conquest, true, `Recent conquest (${term('compliance')})`),
        row('War exhaustion', p.war, true, term('exhaustion', 'War exhaustion')),
        row('Occupation', p.occupation),
        row('Call to Arms', p.levee),
        row('Nationalist backlash', p.backlash),
        row('Unequal levy', p.levy),
        row('Reservation', p.reservation),
        row('Forced assimilation', p.forced),
        row('Consumer goods', p.welfare, false, term('consumer', 'Consumer goods')),
        row('Minority rights (citizenship law)', p.rights, false, `Minority rights (${lawTerm('citizenship', 'citizenship law')})`),
        row('Integration focus', p.focus, false),
        Math.abs(p.policy - 1) >= 0.005 ? { label: 'Laws, advisors, technology', value: `×${p.policy.toFixed(2)}` } : null,
      ].filter(Boolean),
    };
  });

  provideTooltip('culture-row', (arg) => {
    const [pid, cid] = String(arg).split(':').map(Number);
    const province = game.world.provinces?.[pid];
    const row = province ? stateCultures(game.world, province).find((r) => r.id === cid) : null;
    if (!row) return null;
    const nation = game.world.nations[province.owner];
    const econ = province.econ ?? {};
    // Neden erimiyor / neden eriyor: assimilate'in kapıları (culture.js).
    let why;
    const gate = CULTURE.ASSIMILATE_CONTROL * 100;
    if (row.primary) why = 'The nation\'s own people: it absorbs the others.';
    else if (row.accepted) why = `${term('acceptance', 'Accepted')}: it counts as one of the nation's own peoples and does not assimilate.`;
    else if (row.homeland) why = 'This is their homeland: a people does not melt away in its own land. Only resettlement, deportation, a state focus or forced assimilation changes that.';
    else if ((econ.control ?? 0) < gate) why = `${term('compliance', 'Compliance')} below ${gate}%: nobody assimilates in a state that is not under control.`;
    else if ((econ.unrest ?? 0) >= CULTURE.MAX_UNREST / 1.3) why = `Too restless to assimilate (${term('unrest')}): calm the state first.`;
    else why = `Slowly assimilates into the nation's people: ${term('literacy')}, cities, ${term('compliance')} and the `
      + `${lawTerm('citizenship', 'citizenship law')} set the pace; ${term('unrest')} slows it.`;
    return {
      type: 'breakdown',
      title: `${row.name} — ${(row.share * 100).toFixed(1)}%`,
      value: Math.abs(row.monthly) < 0.0005 ? 'steady' : `${row.monthly > 0 ? '+' : '−'}${Math.abs(row.monthly * 100).toFixed(2)}% a month`,
      text: why,
      rows: [
        { label: 'Status', value: row.primary ? 'primary culture' : row.accepted ? 'accepted' : 'not accepted', tone: row.primary || row.accepted ? 'good' : 'bad' },
        row.homeland ? { label: 'Homeland', value: 'yes' } : null,
        { label: 'Nation', value: nation?.name ?? '—' },
      ].filter(Boolean),
      footer: 'Click the name to see where this people lives.',
    };
  });

  provideTooltip('state', (id) => {
    const province = game.world.provinces?.[Number(id)];
    const econ = province?.econ;
    if (!econ) return null;
    const deposits = depositsOf(province).map((line) => `${RESOURCES[line.id]?.name} ×${line.size.toFixed(1)}`).join(', ');
    const owner = game.world.nations[province.owner];
    const focus = FOCUS_BY_ID[econ.focus];
    // Bina yok (2026-10-15): state'i kalkınma kademesi, sabit kale ve odak anlatır.
    return {
      type: 'breakdown',
      title: provinceName(province.center),
      value: `${formatPopulation(econ.population)} people`,
      rows: [
        { label: 'Development', labelHtml: term('development', 'Development'), value: owner ? `${econ.development} / cap ${developmentCap(owner)}` : String(econ.development) },
        (econ.fort ?? 0) > 0 ? { label: 'Fortifications', value: `level ${econ.fort}` } : null,
        { label: 'Resources', value: deposits || 'none' },
        { label: 'Fertility', value: `${Math.round(fertilityOf(province) * 100)}% of world average` },
        { label: 'Compliance', labelHtml: term('compliance', 'Compliance'), value: `${Math.round(econ.control ?? 0)}%` },
        (econ.consent ?? 1) < 0.995 ? { label: 'Consent', labelHtml: term('consent', 'Consent'), value: pct(econ.consent), tone: 'bad' } : null,
        { label: 'Status', value: econ.core !== false ? 'core — counts in full' : `not core — counts at ${pct(econ.status)}`, tone: econ.core !== false ? 'good' : 'bad' },
        focus ? { label: 'Focus', value: focus.name } : null,
      ].filter(Boolean),
    };
  });
}
