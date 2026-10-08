// ULUSAL EKRANLARIN BİLGİ KARTLARI — yasa, bütçe satırı, parti, danışman,
// karar, gündem, üretim hattı, state.
//
// Kural (tooltip.js): içerik burada HESAPLANMAZ, oyunun döküm fonksiyonları
// okunur. Ekran bir sayıyı gösteriyorsa kartı "neden" ve "neyi değiştirir"
// sorularını cevaplar; ekran ile kart aynı fonksiyondan okur, ayrışamaz.

import { provideTooltip } from './tooltip.js';
import { LAWS } from '../game/laws.js';
import { governmentView, PARTIES } from '../game/politics.js';
import { decisionsView } from '../game/decisions.js';
import { AGENDA } from '../game/agenda.js';
import { describeEffects } from '../game/modifiers.js';
import { economyView, formatPopulation } from '../game/economy.js';
import { BUILDINGS, BUILDING_IDS, EQUIPMENT, RESOURCES } from '../game/econ/defs.js';
import { depositsOf, fertilityOf } from '../game/econ/deposits.js';
import { provinceName, buildingLevels, buildingSlots } from '../game/provinces.js';
import { LEDGER_LINES } from '../game/treasury.js';

const signed = (value, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value ?? 0).toFixed(digits)}`;
const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;

/** describeEffects satırı ("+5% Tax income") → kartın etki satırı. */
function effectRows(effects) {
  return describeEffects(effects).map((line) => {
    const at = line.indexOf(' ');
    const value = at > 0 ? line.slice(0, at) : line;
    const label = at > 0 ? line.slice(at + 1) : '';
    return { label: label || value, value: label ? value : '', tone: value.startsWith('−') ? 'bad' : 'good' };
  });
}

/** Bütçe satırı → ne olduğu, neyle oynanır. */
const LEDGER_TEXT = {
  tax: 'Every state pays by population × development × status. The tax law, stability and a consumer-goods surplus multiply it; the crown adds a flat 4.',
  exports: 'Surplus resources sold abroad at the world price, up to the share your trade law allows.',
  treaty: 'Reparations and tribute from peace treaties, paid or received.',
  army: 'Weekly pay of every land regiment; ×1.5 while at war.',
  navy: 'Weekly upkeep of every warship.',
  imports: 'Shortages are bought automatically at the world price while the treasury can pay.',
  construction: 'Buildings and development are paid in full when the project starts.',
  recruitment: 'One-off cost of ordering a new regiment.',
  education: 'The education law funds schools: literacy rises toward its target.',
  maintenance: 'Every building level costs a little each week; a bigger state carries more.',
  inflation: 'Gold above half a year of income loses 0.5% a week. Hoarded coin melts: spend it on buildings, development or the army.',
  interest: 'Debt costs 0.3% a week.',
  unrest: 'Martial law against a national movement is paid in gold.',
  outlay: 'Generals, event choices and agenda projects.',
};

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
      footer: `Changing a law costs ${view.lawCost} political power and locks it for 26 weeks.${row?.lock ? ` Locked for ${row.lock} more weeks.` : ''}`,
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
          : `Click twice to enact: ${view.lawCost} political power, then locked for 26 weeks.`,
    };
  });

  provideTooltip('ledger', (id) => {
    const nation = me();
    if (!nation?.economy || !LEDGER_LINES[id]) return null;
    const ledger = economyView(game.world, nation).ledger ?? {};
    return {
      type: 'breakdown',
      title: LEDGER_LINES[id].label,
      value: `${signed(ledger[id] ?? 0)} gold last week`,
      text: LEDGER_TEXT[id] ?? '',
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
      footer: 'The ruling party grants its bonus and bounds which laws you may pass. If the people want another party, legitimacy costs stability.',
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
        : person.blockers?.length ? person.blockers.join(' · ') : 'Hire for 50 political power; replaces whoever holds the seat.',
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
    return {
      type: 'breakdown',
      title: `${info.name} line`,
      value: `${(line.output ?? 0).toFixed(1)} per week`,
      text: `Each unit costs ${info.ic} IC and ${recipe || 'no materials'}. Military industry is shared between lines by weight.`,
      rows: [
        { label: 'Weight', value: String(line.weight ?? 0) },
        { label: 'Industry on this line', value: `${(line.ic ?? 0).toFixed(2)} IC` },
        { label: 'Efficiency', value: pct(line.efficiency), tone: (line.efficiency ?? 0) < 0.4 ? 'bad' : 'good' },
        { label: 'Materials available', value: pct(line.limit ?? 1), tone: (line.limit ?? 1) < 1 ? 'bad' : 'good' },
      ],
      footer: 'Efficiency grows while a line works and decays while it idles: switching lines often wastes industry.',
    };
  });

  provideTooltip('state', (id) => {
    const province = game.world.provinces?.[Number(id)];
    const econ = province?.econ;
    if (!econ) return null;
    const deposits = depositsOf(province).map((line) => `${RESOURCES[line.id]?.name} ×${line.size.toFixed(1)}`).join(', ');
    const built = BUILDING_IDS.filter((b) => (econ.buildings?.[b] ?? 0) > 0).map((b) => `${BUILDINGS[b].name} ${econ.buildings[b]}`).join(', ');
    return {
      type: 'breakdown',
      title: provinceName(province.center),
      value: `${formatPopulation(econ.population)} people`,
      rows: [
        { label: 'Development', value: String(econ.development) },
        { label: 'Building slots', value: `${buildingLevels(econ)} / ${buildingSlots(econ)}` },
        { label: 'Resources', value: deposits || 'none' },
        { label: 'Fertility', value: `${Math.round(fertilityOf(province) * 100)}% of world average` },
        { label: 'Compliance', value: `${Math.round(econ.control ?? 0)}%` },
        { label: 'Status', value: econ.core ? 'core — counts in full' : `not core — counts at ${pct(econ.status)}`, tone: econ.core ? 'good' : 'bad' },
      ],
      text: built ? `Buildings: ${built}.` : 'No buildings yet.',
    };
  });
}
