// ULUSAL YÖNETİM EKRANLARI — Uluslar Çağı (TASARIM.md §16).
//
// Altı ekran, sekme künyeleriyle aynı adlar: Budget (altın), Trade (kaynak ve
// ticaret), Factories (IC, tüketim malı, üretim hatları), Construction (bina
// ve kalkınma), Population (halklar ve birleşme), Politics (hükûmet, yasa,
// danışman, gündem, karar).
//
// KURAL (ilke 2): ekran formül KURMAZ. Her sayı oyunun döküm fonksiyonundan
// gelir (economyView, governmentView, constructionView, agendaView...);
// burada yalnız biçim ve düğme vardır. Bileşenler kit.js'tedir; her sayının
// bilgi kartı tooltipData/tooltipState sağlayıcılarındandır. Bağlama
// `bindStateScreens` içindedir: her düğme bir `data-uc-*` özniteliği taşır.
//
// ADLANDIRMA (HOI4 modeli): kodda "province" denen küme oyuncunun gözünde
// STATE'tir (ekonomi, bina, kalkınma); ordunun yürüdüğü hex PROVINCE'tir.

import {
  BUILDINGS, BUILDING_IDS, DEVELOPMENT_MAX, EQUIPMENT, EQUIPMENT_IDS, RESOURCES, RESOURCE_IDS,
  TAX_PER_DEVELOPMENT,
} from '../game/econ/defs.js';
import { LAWS, lawIndex } from '../game/laws.js';
import { economyView, formatPopulation, populationOf } from '../game/economy.js';
import { consumerStability, consumerTaxBonus, setLineWeight } from '../game/econ/industry.js';
import { embargoed, setEmbargo } from '../game/econ/trade.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import {
  buildBlockers, buildingCost, cancelProject, constructionView, developBlockers, developmentCost,
  moveProject, queueBuilding, queueDevelopment,
} from '../game/construction.js';
import { buildingLevels, buildingSlots, provinceName, growthRateOf } from '../game/provinces.js';
import { depositsOf, fertilityOf } from '../game/econ/deposits.js';
import {
  PARTIES, appointGovernment, dismissAdvisor, enactRegime, governmentView,
  hireAdvisor, runPropaganda, setLaw,
} from '../game/politics.js';
import { agendaView, chooseAgenda } from '../game/agenda.js';
import { decisionsView, takeDecision } from '../game/decisions.js';
import {
  acceptBlockers, acceptCulture, cultureMix, expelBlockers, expelCulture, releaseBlockers, releaseToKin,
} from '../game/culture.js';
import { formNation, formationBlockers, proposeUnion, unionBlockers, unionCandidates, unificationStatus } from '../game/unification.js';
import { GOALS, goalMet } from '../game/hegemony.js';
import { nationManpower } from '../game/recruitment.js';
import { describeEffects, mod } from '../game/modifiers.js';
import {
  badge, blockedAttr, chain, empty, esc, kpi, kpiRow, ledger, meter, num, panel, pct, pips, pts,
  segmented, short, signed, spark, tipAttr, tone,
} from './kit.js';
import { buildingArt, equipmentArt, lawArt, ledgerArt, resourceArt } from './icons/art.js';

const turnOf = (game) => game.turns?.turn ?? game.world?.turn ?? 0;

/**
 * Yasa kartı: gravür amblem, ad, yürürlükteki seçenek, seçenekler bölünmüş
 * kontrol olarak. Her seçeneğin kartı etkisini ve engelini söyler; ilk tık
 * onay ister (state.confirm), ikinci tık yasayı çıkarır.
 */
function lawCard(world, nation, lawId, confirm, { compact = false } = {}) {
  const law = LAWS[lawId];
  const current = lawIndex(nation, lawId);
  const view = governmentView(world, nation).laws.find((row) => row.id === lawId);
  const options = law.options.map((option, index) => {
    const blockers = view?.options[index]?.blockers ?? [];
    const key = `law:${lawId}:${index}`;
    return {
      label: confirm === key ? 'Confirm?' : esc(option.name),
      on: index === current,
      confirm: confirm === key,
      blocked: blockers.length > 0 && index !== current,
      attrs: `data-uc-law="${lawId}:${index}"`,
      tip: 'law-option',
      arg: `${lawId}:${index}`,
    };
  });
  return `<div class="k-law${compact ? ' compact' : ''}">
    <span class="k-law-art"${tipAttr('law', lawId)}>${lawArt(lawId, compact ? 'md' : 'lg')}</span>
    <div class="k-law-main">
      <div class="k-law-head"${tipAttr('law', lawId)}>
        <b>${esc(law.name)}</b>
        <small>${esc(law.options[current].desc)}</small>
        ${view?.lock ? badge(`locked ${view.lock}w`, 'warn') : ''}
      </div>
      ${segmented(options)}
    </div>
  </div>`;
}

// ================================================================= BUDGET ===

export function renderBudget(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const ledgerRows = view.ledger;
  const turn = turnOf(game);
  const bankrupt = view.bankruptUntil > turn;
  const line = (id, label) => ({
    icon: ledgerArt(id), label, value: signed(ledgerRows[id] ?? 0),
    tone: tone(ledgerRows[id] ?? 0), tip: 'ledger', arg: id,
  });
  const income = [line('tax', 'Taxes'), line('exports', 'Exports')];
  if (Math.abs(ledgerRows.treaty ?? 0) > 0.05) income.push(line('treaty', 'Tribute & reparations'));
  const expenseIds = [
    ['army', 'Army upkeep'], ['navy', 'Navy upkeep'], ['maintenance', 'Building upkeep'],
    ['education', 'Education'], ['imports', 'Imports'], ['interest', 'Debt interest'],
    ['inflation', 'Inflation'], ['construction', 'Construction'], ['recruitment', 'Recruitment'],
    ['unrest', 'Martial law'], ['outlay', 'State purchases'],
  ];
  const expenses = expenseIds.filter(([id]) => Math.abs(ledgerRows[id] ?? 0) > 0.05).map(([id, label]) => line(id, label));
  const totalIn = income.reduce((s, row) => s + (ledgerRows[row.arg] ?? 0), 0);
  const totalOut = expenses.reduce((s, row) => s + (ledgerRows[row.arg] ?? 0), 0);
  const tax = view.tax;
  const history = me.economy?.history ?? [];
  const debtShare = view.debtCap > 0 ? view.debt / view.debtCap : 0;
  const reserve = view.inflationReserve ?? 0;
  const idle = Math.max(0, view.gold - reserve);

  const kpis = kpiRow([
    kpi({ icon: ledgerArt('tax', 'md'), label: 'Treasury', value: short(view.gold), sub: `${signed(ledgerRows.net ?? 0)} last week`, tip: 'treasury', cls: 'hero' }),
    kpi({ label: 'Income', value: num(ledgerRows.income ?? 0), sub: 'gold per week', tip: 'ledger', arg: 'tax' }),
    kpi({ label: 'Expenses', value: num(Math.abs(ledgerRows.expenses ?? totalOut)), sub: 'gold per week', tip: { text: 'Everything the state paid last week, one-off projects included.' } }),
    kpi({
      label: 'Debt', value: short(view.debt), sub: `ceiling ${short(view.debtCap)}`,
      tip: { text: 'Debt\nBorrowing is automatic when the treasury runs dry. Interest is 0.3% a week. Above the ceiling (20 weeks of income) the state goes bankrupt: debt wiped, stability −20, no credit for a year.' },
      meter: debtShare, meterTone: debtShare > 0.75 ? 'neg' : 'warn',
    }),
    kpi({
      label: 'Inflation reserve', value: short(reserve), sub: idle > 0 ? `${short(idle)} melting` : 'nothing melts',
      tip: 'ledger', arg: 'inflation', meter: reserve > 0 ? Math.min(1, view.gold / reserve) : 0, meterTone: idle > 0 ? 'warn' : 'pos',
    }),
  ]);

  const taxChain = chain(
    { label: 'States', value: tax.base, text: num(tax.base), tip: { text: 'States\nPopulation × development × status, summed over every state, plus the crown\'s flat 4.' } },
    [
      { label: 'Tax law', value: tax.law, tip: 'law', arg: 'tax' },
      { label: 'Stability', value: tax.stability, tip: 'stability' },
      { label: 'Consumer goods', value: tax.consumer, tip: { text: 'Consumer goods\nA surplus of consumer goods lifts the tax yield; a shortage does not cut it — it costs stability instead.' } },
      { label: 'Ministers & events', value: tax.mods, tip: { text: 'Ministers, research and events\nAll modifiers to tax income.' } },
    ],
    { label: 'Weekly tax', value: tax.total, text: num(tax.total), tone: 'pos', tip: 'ledger', arg: 'tax' },
  );

  const treasuryPanel = panel('Treasury', `<div class="k-chart${history.length > 1 ? ' tall' : ''}">${spark(history.map((entry) => entry.gold), { width: 420, height: 110 })}</div>
      <div class="k-chart-legend"><span>${history.length} weeks</span><span>now <b>${short(view.gold)}</b></span></div>`, { sub: 'gold, last 52 weeks' });

  return `${kpis}
    ${bankrupt ? `<div class="k-alert neg"><b>Bankrupt</b> for ${view.bankruptUntil - turn} more weeks — no credit, stability −20, the army trains and recovers at half speed.</div>` : ''}
    <div class="k-cols-2">
      ${panel('Income', `${ledger([...income, { label: 'Total', value: signed(totalIn), tone: 'pos', strong: true }])}
        <small class="k-sublabel">How the tax line is built</small>${taxChain}`, { sub: 'last week' })}
      <div class="k-stack">
        ${panel('Expenses', expenses.length ? ledger([...expenses, { label: 'Total', value: signed(totalOut), tone: 'neg', strong: true }]) : empty('Nothing spent last week.'), { sub: 'last week' })}
        ${treasuryPanel}
      </div>
    </div>
    ${panel('Fiscal laws', `<div class="k-laws two">${lawCard(world, me, 'tax', state.confirm)}${lawCard(world, me, 'education', state.confirm)}</div>
      <p class="k-note">Education costs <b>${num(view.education, 1)}</b> gold a week and moves literacy toward <b>${pct(view.literacyTarget)}</b> (now ${pct(view.literacy)}).</p>`,
    { sub: `${governmentView(world, me).lawCost} political power per change` })}`;
}

// ================================================================== TRADE ===

export function renderTrade(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const resources = view.resources ?? {};
  const market = world.market ?? {};
  const ledgerRows = view.ledger ?? {};
  const shortages = RESOURCE_IDS.filter((id) => (resources[id]?.need ?? 0) > 0.01 && (resources[id]?.ratio ?? 1) < 0.98);
  const embargoes = (me.embargoes ?? []).map((id) => world.nations[id]).filter(Boolean);

  const kpis = kpiRow([
    kpi({ icon: ledgerArt('exports', 'md'), label: 'Exports', value: signed(ledgerRows.exports ?? 0), sub: 'gold last week', tip: 'ledger', arg: 'exports', cls: 'hero' }),
    kpi({ label: 'Imports', value: signed(ledgerRows.imports ?? 0), sub: 'gold last week', tip: 'ledger', arg: 'imports' }),
    kpi({ label: 'Trade balance', value: signed((ledgerRows.exports ?? 0) + (ledgerRows.imports ?? 0)), sub: 'exports − imports', tip: { text: 'Trade balance\nExport income minus the cost of imports last week.' } }),
    kpi({
      label: 'Shortages', value: String(shortages.length),
      sub: shortages.length ? shortages.map((id) => RESOURCES[id].name).join(', ') : 'every need covered',
      tip: { text: 'Shortages\nResources the country needs but could not fully make or buy last week.' },
    }),
    kpi({
      label: 'Blockade', value: pct(view.blockade), sub: view.blockade > 0 ? 'of our coast is cut' : 'sea lanes open',
      tip: { text: 'Blockade\nEnemy warships within two hexes of our coastal states cut that share of seaborne imports.' },
      meter: view.blockade, meterTone: 'neg',
    }),
  ]);

  const rows = RESOURCE_IDS.map((id) => {
    const info = RESOURCES[id];
    const r = resources[id] ?? {};
    const needed = (r.need ?? 0) > 0.01;
    const ratio = needed ? r.ratio : 1;
    const price = market.prices?.[id] ?? info.price;
    const history = market.history?.[id] ?? [];
    const trend = history.length > 4 ? price - history[Math.max(0, history.length - 5)] : 0;
    const partner = r.topPartner >= 0 ? world.nations[r.topPartner] : null;
    return `<div class="k-res-row${needed && ratio < 0.8 ? ' short' : ''}"${tipAttr('resource', id)}>
      <span class="k-res-name">${resourceArt(id, 'sm')}<b>${esc(info.name)}</b>${info.era && !needed ? badge('no demand yet', 'dim') : ''}</span>
      <span class="k-num">${num(r.produced ?? 0)}</span>
      <span class="k-num">${needed ? num(r.need) : '—'}</span>
      <span class="k-cover">${needed ? `${meter(ratio, { tone: ratio < 0.8 ? 'neg' : ratio < 0.98 ? 'warn' : 'pos' })}<b>${pct(ratio)}</b>` : '<small class="k-dim">not needed</small>'}</span>
      <span class="k-num neg">${r.imported > 0.05 ? num(r.imported) : '—'}</span>
      <span class="k-num pos">${r.exported > 0.05 ? num(r.exported) : '—'}</span>
      <span class="k-price"><b>${num(price, 2)}</b><i class="${trend > 0.01 ? 'up' : trend < -0.01 ? 'down' : ''}"></i></span>
      <span class="k-partner">${partner ? `${esc(partner.name)} <small>${pct(r.topShare)}</small>` : '<small class="k-dim">—</small>'}</span>
    </div>`;
  }).join('');
  const table = `<div class="k-res-table">
      <div class="k-res-row head"><span>Resource</span><span>Made</span><span>Needed</span><span>Covered</span><span>Bought</span><span>Sold</span><span>Price</span><span>Main supplier</span></div>
      ${rows}
    </div>`;

  const marketTiles = RESOURCE_IDS.map((id) => {
    const price = market.prices?.[id] ?? 0;
    const base = RESOURCES[id].price;
    return `<div class="k-mkt"${tipAttr('resource', id)}>
      ${resourceArt(id, 'sm')}
      <span><em>${esc(RESOURCES[id].name)}</em><b>${num(price, 2)}</b><small>${price >= base ? '+' : '−'}${Math.abs(Math.round((price / base - 1) * 100))}% vs base</small></span>
      ${spark(market.history?.[id] ?? [], { width: 90, height: 24, cls: 'mini' })}
    </div>`;
  }).join('');

  const embargoBody = embargoes.length
    ? ledger(embargoes.map((other) => ({
      label: esc(other.name),
      value: `<button class="k-btn sm" data-uc-embargo-lift="${other.id}">Lift</button>`,
    })))
    : empty('No embargoes. Declare one from a foreign power\'s dossier (25 political power).');

  return `${kpis}
    <div class="k-split wide-left">
      ${panel('Resources', table, { sub: 'per week · hover a row for its uses and suppliers' })}
      <div class="k-stack">
        ${panel('Trade law', lawCard(world, me, 'trade', state.confirm, { compact: true })
    + '<p class="k-note">Exports sell only the surplus, up to the law\'s share of output. Imports fill every shortage automatically while the treasury can pay.</p>')}
        ${panel('Embargoes', embargoBody, { sub: 'no trade with these states' })}
      </div>
    </div>
    ${panel('World market', `<div class="k-mkts">${marketTiles}</div>`, { sub: 'price = base × (world need ÷ world output)^1.5, 0.6–2× base' })}`;
}

// ============================================================== INDUSTRY ===

export function renderIndustry(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const ic = view.ic ?? { total: 0, civil: 0, military: 0, raw: 0, factors: {} };
  const consumer = view.consumer ?? { need: 0, cottage: 0, civil: 0, supply: 0, ratio: 1 };
  const logistics = equipmentLogistics(world, me);
  const ironclad = mod(me, 'ironclad') > 0;
  const f = ic.factors ?? {};

  const kpis = kpiRow([
    kpi({ icon: buildingArt('factory', 'md'), label: 'Industrial capacity', value: num(ic.total), sub: `${num(ic.raw, 0)} factory levels`, tip: 'ic', cls: 'hero' }),
    kpi({ label: 'Civilian', value: num(ic.civil), sub: 'makes consumer goods', tip: { text: 'Civilian industry\nThe share of industry the economy law leaves to the people. It tops up the consumer goods the workshops make.' } }),
    kpi({ label: 'Military', value: num(ic.military), sub: `${pct(ic.share)} of industry`, tip: 'law', arg: 'economy' }),
    kpi({
      label: 'Consumer goods', value: pct(consumer.ratio), sub: `${pts(consumerStability(consumer.ratio))} stability`,
      tip: { text: 'Consumer goods\nWhat the people want grows every decade. A shortage costs stability; a surplus lifts tax income.' },
      meter: Math.min(1, consumer.ratio), meterTone: consumer.ratio < 0.95 ? 'neg' : 'pos',
    }),
    kpi({ label: 'Dockyards', value: String(ic.dockyards ?? 0), sub: (ic.dockyards ?? 0) > 0 ? 'ship line open' : 'no ship line', tip: 'building', arg: 'dockyard' }),
  ]);

  const icChain = chain(
    { label: 'Factories', value: ic.raw, text: num(ic.raw), tip: 'building', arg: 'factory' },
    [
      { label: 'Coal', value: f.coal ?? 1, tip: 'resource', arg: 'COAL' },
      { label: 'Stability', value: f.stability ?? 1, tip: 'stability' },
      { label: 'Conscription', value: f.law ?? 1, tip: 'law', arg: 'conscription' },
      { label: 'Technology', value: f.tech ?? 1, tip: { text: 'Technology and ministers\nAll industrial capacity modifiers.' } },
      ...((f.oil ?? 1) !== 1 || mod(me, 'oilIc') > 0 ? [{ label: 'Oil', value: f.oil ?? 1, tip: 'resource', arg: 'OIL' }] : []),
    ],
    { label: 'Industry', value: ic.total, text: num(ic.total), tone: 'pos', tip: 'ic' },
  );

  const supply = Math.max(consumer.need, consumer.supply, 1e-6);
  const consumerBar = `<div class="k-stackbar">
      <i class="a" style="width:${(consumer.cottage / supply) * 100}%"${tipAttr({ text: `Workshops\n${num(consumer.cottage)} — households and craftsmen; grows with population and development.` })}></i>
      <i class="b" style="width:${(consumer.civil / supply) * 100}%"${tipAttr({ text: `Civilian industry\n${num(consumer.civil)} — factories working for the people.` })}></i>
      <b style="left:${Math.min(100, (consumer.need / supply) * 100)}%"${tipAttr({ text: `What the people want\n${num(consumer.need)} — grows every decade.` })}></b>
    </div>
    <div class="k-legend"><span><i class="a"></i>Workshops ${num(consumer.cottage)}</span><span><i class="b"></i>Civilian industry ${num(consumer.civil)}</span><span><i class="mark"></i>Wanted ${num(consumer.need)}</span></div>`;

  const lines = EQUIPMENT_IDS.map((id) => {
    const info = EQUIPMENT[id];
    const line = view.lines?.[id] ?? { weight: 0, efficiency: 0, ic: 0, output: 0, limit: 1 };
    const log = logistics.find((row) => row.id === id);
    const blocked = id === 'ships' && (ic.dockyards ?? 0) <= 0;
    const need = log?.required ?? 0;
    return `<div class="k-line${blocked ? ' off' : ''}"${tipAttr('line', id)}>
      <span class="k-line-art">${equipmentArt(id, 'lg', ironclad)}</span>
      <div class="k-line-main">
        <div class="k-line-head"><b>${esc(info.name)}</b><small>${num(info.ic, 2)} IC each</small>${blocked ? badge('needs a dockyard', 'neg') : ''}</div>
        <div class="k-line-stats">
          <span><small>Output</small><b>${num(line.output, 1)}</b><em>/wk</em></span>
          <span><small>Stock</small><b>${short(log?.stock ?? 0)}</b>${need > 0.5 ? `<em>needs ${short(need)}</em>` : ''}</span>
          <span><small>Industry</small><b>${num(line.ic, 2)}</b><em>IC</em></span>
        </div>
        <div class="k-line-eff"><small>Efficiency</small>${meter(line.efficiency, { tone: line.efficiency < 0.4 ? 'warn' : 'pos' })}<b>${pct(line.efficiency)}</b>
          ${line.limit < 1 ? badge(`materials ${pct(line.limit)}`, 'neg') : ''}</div>
      </div>
      <div class="k-stepper" data-tip="text" data-tip-text="Line weight\nMilitary industry is shared between lines by weight.">
        <button class="k-btn sm" data-uc-weight="${id}:1" ${line.weight >= 10 ? 'disabled' : ''}>▲</button>
        <b>${line.weight}</b>
        <button class="k-btn sm" data-uc-weight="${id}:-1" ${line.weight <= 0 ? 'disabled' : ''}>▼</button>
      </div>
    </div>`;
  }).join('');

  return `${kpis}
    <div class="k-cols-2">
      ${panel('Industrial capacity', icChain, { sub: 'factories × multipliers' })}
      ${panel('Consumer goods', `${consumerBar}<p class="k-note">Covered <b class="${consumer.ratio < 0.95 ? 'neg' : 'pos'}">${pct(consumer.ratio)}</b> · stability ${pts(consumerStability(consumer.ratio))} · tax bonus +${pct(consumerTaxBonus(consumer.ratio))}</p>`, { sub: 'the people\'s share of industry' })}
    </div>
    ${panel('Economy law', lawCard(world, me, 'economy', state.confirm), { sub: 'how much industry works for the army' })}
    ${panel('Production lines', `<div class="k-lines">${lines}</div>`, { sub: 'military industry is shared by weight · shortages of iron, timber or coal slow a line' })}`;
}

// ========================================================== CONSTRUCTION ===

export function renderConstruction(game, me, state) {
  const world = game.world;
  const view = constructionView(world, me);
  const own = (world.provinces ?? []).filter((p) => p.owner === me.id && p.econ)
    .sort((a, b) => b.econ.population - a.econ.population || a.id - b.id);
  if (state.province == null || !own.some((p) => p.id === state.province)) state.province = own[0]?.id ?? null;
  const selected = world.provinces?.[state.province];
  const active = view.queue.filter((q) => q.active).length;

  const kpis = kpiRow([
    kpi({ icon: buildingArt('mine', 'md'), label: 'Building now', value: `${active} / ${view.slots}`, sub: 'construction slots', tip: { text: 'Construction slots\nProjects that advance at once: 2 + one per five states, plus technology. Waiting projects start as slots free up.' }, meter: view.slots ? active / view.slots : 0, cls: 'hero' }),
    kpi({ label: 'Queued', value: String(view.queue.length - active), sub: 'waiting for a slot', tip: { text: 'Queue\nPaid up front; they wait for a free construction slot. ▲ moves a project to the front.' } }),
    kpi({ label: 'Development cap', value: String(view.developmentCap), sub: `of ${DEVELOPMENT_MAX}`, tip: { text: 'Development cap\nThe highest development any state may reach: 3, plus technology, plus literacy × 4.' } }),
    kpi({ label: 'States', value: String(own.length), sub: `${own.filter((p) => p.econ.core !== false).length} core`, tip: { text: 'States\nNon-core states count at their compliance: less tax, fewer recruits, less industry.' } }),
    kpi({ label: 'Treasury', value: short(me.gold), sub: 'buildings are paid up front', tip: 'treasury' }),
  ]);

  const queue = view.queue.length ? `<div class="k-projs">${view.queue.map((item) => `<div class="k-proj${item.active ? ' active' : ''}">
      <span class="k-proj-art">${item.kind === 'develop' ? '<span class="k-dev-ico">▲</span>' : buildingArt(item.building, 'sm')}</span>
      <span class="k-proj-main"><b>${esc(item.name)}</b><small>${esc(item.province)}</small>
        <span class="k-proj-bar">${meter(item.progress, { tone: item.active ? 'pos' : '' })}<em>${item.active ? `${item.weeksLeft ?? '—'} wk` : 'waiting'}</em></span></span>
      <span class="k-proj-acts">
        <button class="k-btn sm" data-uc-proj-top="${item.id}"${tipAttr({ text: 'Move to the front of the queue' })}>▲</button>
        <button class="k-btn sm danger" data-uc-proj-cancel="${item.id}"${tipAttr({ text: 'Cancel\n75% of the unspent cost comes back.' })}>✕</button>
      </span></div>`).join('')}</div>` : empty('Nothing under construction — pick a state below and build.');

  const list = own.map((province) => {
    const econ = province.econ;
    const levels = buildingLevels(econ);
    const slots = buildingSlots(econ);
    const main = depositsOf(province);
    return `<button class="k-state${province.id === state.province ? ' on' : ''}" data-uc-prov="${province.id}"${tipAttr('state', province.id)}>
      <span class="k-state-res">${resourceArt(main[0]?.id, 'md')}</span>
      <span class="k-state-name"><b>${esc(provinceName(province.center))}</b><small>${formatPopulation(econ.population)}${econ.core === false ? ' · <em>not core</em>' : ''}</small></span>
      <span class="k-state-goods">${main.map((line) => `<span>${line === main[0] ? '' : resourceArt(line.id, 'xs')}<b>${esc(RESOURCES[line.id].name)}</b><small>×${num(line.size, 0)}</small></span>`).join('')}</span>
      <span class="k-state-blds">${BUILDING_IDS.filter((id) => (econ.buildings[id] ?? 0) > 0).map((id) => `<span>${buildingArt(id, 'sm')}<i>${econ.buildings[id]}</i></span>`).join('') || '<small class="k-dim">no buildings</small>'}</span>
      <span class="k-state-dev"><small>Development</small>${pips(econ.development, DEVELOPMENT_MAX, view.developmentCap)}</span>
      <span class="k-state-slots${levels >= slots ? ' full' : ''}"><small>Slots</small>${meter(slots ? levels / slots : 0, { tone: levels >= slots ? 'warn' : 'pos' })}<b>${levels}/${slots}</b></span>
    </button>`;
  }).join('');

  let detail = empty('Select a state.');
  if (selected?.econ) {
    const econ = selected.econ;
    const devBlockers = developBlockers(world, me, selected);
    const levels = buildingLevels(econ);
    const slots = buildingSlots(econ);
    const deposits = depositsOf(selected);
    const cards = BUILDING_IDS.map((id) => {
      const info = BUILDINGS[id];
      const blockers = buildBlockers(world, me, selected, id);
      const cost = buildingCost(world, me, selected, id);
      const level = econ.buildings[id] ?? 0;
      return `<div class="k-build${level > 0 ? ' has' : ''}"${tipAttr('building', id)}>
        ${buildingArt(id, 'lg')}
        <div class="k-build-body">
          <b>${esc(info.name)}</b>
          <span class="k-build-lv">${pips(level, info.max)}</span>
          <small>${esc(info.effect)}</small>
        </div>
        <button class="k-btn" data-uc-build="${id}"${blockedAttr(blockers)}><b>${cost}</b><small>${info.weeks} wk</small></button>
      </div>`;
    }).join('');
    detail = `<div class="k-statehead">
        <div class="k-statehead-t">
          <h4>${esc(provinceName(selected.center))}</h4>
          <div class="k-chips">
            ${deposits.map((line) => `<span class="k-chip"${tipAttr('resource', line.id)}>${resourceArt(line.id, 'xs')}${esc(RESOURCES[line.id].name)} <b>×${num(line.size, 1)}</b></span>`).join('')}
            <span class="k-chip"${tipAttr({ text: 'Fertility\nHow well the land feeds its people, against the world average.' })}>Fertility <b>${Math.round(fertilityOf(selected) * 100)}%</b></span>
            <span class="k-chip">${formatPopulation(econ.population)} people</span>
            <span class="k-chip ${econ.core === false ? 'neg' : ''}"${tipAttr('state', selected.id)}>${econ.core === false ? `Not core · ${pct(econ.status)}` : 'Core'}</span>
          </div>
        </div>
        <div class="k-devbox"${tipAttr({ text: `Development\nEach level: tax +${Math.round(TAX_PER_DEVELOPMENT * 100)}%, one more building slot, faster growth. Cost rises steeply with the level and the state's population.` })}>
          <small>Development</small>
          <span>${pips(econ.development, DEVELOPMENT_MAX, view.developmentCap)}<b>${econ.development}</b></span>
          <button class="k-btn" data-uc-develop="1"${blockedAttr(devBlockers)}><b>Develop</b><small>${developmentCost(me, selected)} gold · 12 wk</small></button>
        </div>
      </div>
      <div class="k-slotsline"><small>Building slots</small>${meter(slots ? levels / slots : 0, { tone: levels >= slots ? 'neg' : 'pos' })}<b>${levels} / ${slots}</b></div>
      <div class="k-builds">${cards}</div>`;
  }

  return `${kpis}
    ${panel('Under construction', queue, { sub: 'timber shortages slow every site', right: `${active} building · ${view.queue.length - active} waiting` })}
    <div class="k-split">
      ${panel('States', `<div class="k-states">${list}</div>`, { sub: 'development · slots', cls: 'k-statelist' })}
      ${panel('Build', detail, { sub: 'paid up front · weekly upkeep', cls: 'k-statedetail' })}
    </div>`;
}

// ============================================================ POPULATION ===

export function renderPopulation(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const economy = me.economy ?? {};
  const mix = cultureMix(world, me);
  const capital = world.provinces?.[me.capital?.provinceId];
  const growth = capital?.econ ? growthRateOf(me, capital.econ) * 52 : 0;
  const status = unificationStatus(world, me);
  const goal = GOALS[me.goal];

  const kpis = kpiRow([
    kpi({ label: 'Population', value: formatPopulation(economy.population ?? populationOf(world, me)), sub: `${signed(growth * 100, 2)}% a year`, tip: { text: 'Population\nGrows with food, consumer goods, stability and peace; war and famine shrink it.' }, cls: 'hero' }),
    kpi({ icon: lawArt('education', 'md'), label: 'Literacy', value: pct(economy.literacy), sub: `target ${pct(economy.literacyTarget)}`, tip: 'law', arg: 'education', meter: economy.literacy, meterTone: 'pos' }),
    kpi({ icon: lawArt('conscription', 'md'), label: 'Manpower', value: formatPopulation(nationManpower(world, me.id)), sub: 'available recruits', tip: 'manpower' }),
    kpi({ icon: lawArt('citizenship', 'md'), label: 'Accepted peoples', value: pct(economy.acceptedShare ?? 1), sub: 'of the population', tip: 'law', arg: 'citizenship', meter: economy.acceptedShare ?? 1 }),
  ]);

  const peoples = mix.slice(0, 14).map((row) => {
    const accept = acceptBlockers(world, me, row.id, turn);
    const release = releaseBlockers(world, me, row.id);
    const expel = expelBlockers(world, me, row.id);
    const confirmKey = `expel:${row.id}`;
    const color = world.cultures?.[row.id]?.color ?? '#888';
    return `<div class="k-people"${tipAttr('culture', row.id)}>
      <span class="k-people-name"><i style="background:${color}"></i><b>${esc(row.name)}</b>${row.primary ? badge('primary', 'gold') : row.accepted ? badge('accepted', 'pos') : badge('foreign', 'dim')}</span>
      <span class="k-num">${formatPopulation(row.people)}</span>
      <span class="k-people-share">${meter(row.share, { tone: row.accepted ? 'pos' : 'warn' })}<b>${pct(row.share)}</b></span>
      <span class="k-people-acts">${row.accepted ? '' : `
        <button class="k-btn sm" data-uc-accept="${row.id}"${blockedAttr(accept)}${accept.length ? '' : tipAttr({ text: 'Accept\nThey pay full taxes, fill the ranks and stop rising. Costs political power.' })}>Accept</button>
        <button class="k-btn sm" data-uc-release="${row.id}"${blockedAttr(release)}${release.length ? '' : tipAttr({ text: 'Release\nHand their states to their kin state.' })}>Release</button>
        <button class="k-btn sm danger${state.confirm === confirmKey ? ' confirming' : ''}" data-uc-expel="${row.id}"${blockedAttr(expel)}${expel.length ? '' : tipAttr({ text: 'Expel\nFinal: they leave and the land empties. Infamy and unrest follow.' })}>${state.confirm === confirmKey ? 'Confirm' : 'Expel'}</button>`}</span>
    </div>`;
  }).join('');

  const formBlockers = formationBlockers(world, me);
  const unions = unionCandidates(world, me).map((other) => {
    const blockers = unionBlockers(world, me, other, turn, game.turns?.playerNation);
    return { label: esc(other.name), value: `<button class="k-btn sm" data-uc-union="${other.id}"${blockedAttr(blockers)}>Propose union</button>` };
  });
  const held = status.total ? status.owned / status.total : 0;
  // En huzursuz state'ler: halklar tablosu "kim", bu liste "nerede" sorusunu
  // cevaplar — isyan nereden çıkacak, ödün ya da baskı nereye.
  const restless = (world.provinces ?? []).filter((p) => p.owner === me.id && p.econ && (p.econ.unrest ?? 0) > 0.3)
    .sort((a, b) => (b.econ.unrest ?? 0) - (a.econ.unrest ?? 0)).slice(0, 8);
  const restlessRows = restless.map((province) => {
    const econ = province.econ;
    const unrest = econ.unrest ?? 0;
    const culture = world.cultures?.[province.culture];
    return `<div class="k-restless"${tipAttr('state', province.id)}>
      <span class="k-people-name"><i style="background:${culture?.color ?? '#888'}"></i><b>${esc(provinceName(province.center))}</b><small>${esc(culture?.name ?? '')}</small></span>
      <span class="k-people-share">${meter(unrest / 10, { tone: unrest >= 7 ? 'neg' : unrest >= 4 ? 'warn' : 'party', mark: 0.7 })}<b class="${unrest >= 7 ? 'neg' : ''}">${num(unrest, 1)}</b></span>
      <span class="k-dim">compliance ${Math.round(econ.control ?? 0)}%</span>
    </div>`;
  }).join('');

  return `${kpis}
    <div class="k-split wide-left">
      <div class="k-stack">
        ${panel('Peoples', `<div class="k-peoples">${peoples}</div>`, { sub: 'accept costs political power · release hands states to their kin · expulsion is final' })}
        ${panel('Restless states', restlessRows || empty('No state is restless.'), { sub: 'unrest out of 10 · a revolt brews above 7', tip: { text: 'Unrest\nForeign peoples without rights, fresh conquests, unwanted war and empty shelves feed unrest. Above 7 a national movement can rise.' } })}
        ${panel('National goal', goal ? `<div class="k-goal ${goalMet(world, me) ? 'pos' : ''}"><b>${esc(goal.name)}</b><p>${esc(goal.desc)}</p>
          <span>${goalMet(world, me) ? badge('on track', 'pos') : badge('not yet achieved', 'neg')} <b>+${goal.bonus}</b> points in 1900</span></div>` : empty('No goal.'), { sub: 'victory bonus in 1900' })}
      </div>
      <div class="k-stack">
        ${panel('Citizenship', lawCard(world, me, 'citizenship', state.confirm, { compact: true }), { sub: 'who belongs to the nation' })}
        ${panel(`The ${esc(status.culture)} nation`, `
          <div class="k-unify"${tipAttr({ text: 'Unification\nHold 80% of your people\'s homeland to proclaim the Great nation: a core on every homeland state, prestige and an end to the kin-abroad grievance.' })}>
            <small>Homeland held</small>${meter(held, { tone: 'pos', mark: 0.8, wide: true })}<b>${status.owned} / ${status.total}</b>
          </div>
          ${ledger([
    { label: 'Kin under foreign rule', value: pct(economy.kinAbroad ?? 0), tone: (economy.kinAbroad ?? 0) > 0.1 ? 'neg' : '' },
    { label: 'Great nation', value: status.formed == null ? 'not yet proclaimed' : status.formed === me.id ? 'proclaimed' : 'claimed by another' },
    ...unions,
  ])}
          <button class="k-btn wide" data-uc-form="1"${blockedAttr(formBlockers)}>Proclaim the Great ${esc(status.culture)} Empire</button>`, { sub: 'unification' })}
      </div>
    </div>`;
}

// ============================================================== POLITICS ===

export function renderPolitics(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const view = governmentView(world, me, turn);
  const agenda = agendaView(world, me, turn);
  const decisions = decisionsView(me, turn);

  const kpis = kpiRow([
    kpi({ label: 'Political power', value: String(Math.round(view.power)), sub: `${signed(view.powerIncome.total, 2)} / week · cap 500`, tip: 'power', meter: view.power / 500, cls: 'hero' }),
    kpi({ label: 'Stability', value: pct(view.stability), sub: `heading to ${pct(view.stabilityTarget)}`, tip: 'stability', meter: view.stability, meterTone: view.stability < 0.35 ? 'neg' : 'pos' }),
    kpi({ label: 'War support', value: pct(view.warSupport), sub: `heading to ${pct(view.warSupportTarget)}`, tip: 'warsupport', meter: view.warSupport, meterTone: 'warn' }),
    kpi({ label: 'Government', value: esc(view.government.name), sub: view.nextElection ? `election in ${Math.max(0, view.nextElection - turn)} weeks` : 'no elections', tip: { text: `${view.government.name}\n${view.government.desc}` } }),
    kpi({
      label: 'Legitimacy', value: view.legitimacy.gap > 0 ? pts(-view.legitimacy.hit) : 'full',
      sub: view.legitimacy.gap > 0 ? `the people want the ${esc(PARTIES[view.legitimacy.leader].name)}` : 'the people back the cabinet',
      tip: { text: 'Legitimacy\nIf the people want another party than the one in government, stability pays for it every week.' },
    }),
  ]);

  const parts = (list) => ledger(list.map((part) => ({ label: esc(part.label), value: pts(part.value), tone: tone(part.value) })));

  const parties = view.support.map((party) => {
    const appoint = !party.appointBlockers.includes('Decided by elections') && !party.ruling;
    const confirming = state.confirm === `gov:${party.id}`;
    return `<div class="k-party${party.ruling ? ' ruling' : ''}"${tipAttr('party', party.id)}>
      <i class="k-party-color" style="background:${party.color}"></i>
      <span class="k-party-name"><b>${esc(party.name)}</b>${party.ruling ? badge('in government', 'gold') : ''}<small>${describeEffects(party.effects).join(' · ')}</small></span>
      <span class="k-party-sup">${meter(party.support / 100, { tone: 'party' })}<b>${Math.round(party.support)}%</b></span>
      <span class="k-party-acts">
        ${appoint ? `<button class="k-btn sm${confirming ? ' confirming' : ''}" data-uc-appoint="${party.id}"${blockedAttr(party.appointBlockers)}>${confirming ? 'Confirm' : 'Appoint · 80'}</button>` : ''}
        <button class="k-btn sm" data-uc-propaganda="${party.id}"${blockedAttr(party.propagandaBlockers)}${party.propagandaBlockers.length ? '' : tipAttr({ text: 'Propaganda\n50 political power: this party\'s support grows for a while.' })}>Propaganda · 50</button>
      </span>
    </div>`;
  }).join('');
  const regimes = view.regimes.map((regime) => `<button class="k-btn${state.confirm === `regime:${regime.id}` ? ' confirming' : ''}" data-uc-regime="${regime.id}"${blockedAttr(regime.blockers)}>
      ${esc(regime.name)} · ${regime.cost}${state.confirm === `regime:${regime.id}` ? ' — confirm' : ''}</button>`).join('');

  const laws = Object.keys(LAWS).map((id) => lawCard(world, me, id, state.confirm, { compact: true })).join('');

  const seats = view.advisors.map((seat) => {
    const others = seat.candidates.filter((c) => c.id !== seat.hired?.id);
    return `<div class="k-seat">
      <small class="k-seat-name">${esc(seat.name)}</small>
      ${seat.hired ? `<div class="k-seat-who"${tipAttr('advisor', `${seat.slot}:${seat.hired.id}`)}><b>${esc(seat.hired.title)}</b><span>${esc(seat.hired.name)}</span>
          <small>${describeEffects(seat.hired.effects).join(' · ')}</small>
          <button class="k-btn sm" data-uc-dismiss="${seat.slot}">Dismiss</button></div>` : '<div class="k-seat-who vacant"><span>Vacant seat</span></div>'}
      <div class="k-seat-cands">${others.map((candidate) => `<button class="k-cand" data-uc-hire="${candidate.id}"${candidate.blockers.length ? blockedAttr(candidate.blockers) : tipAttr('advisor', `${seat.slot}:${candidate.id}`)}>
          <b>${esc(candidate.title)}</b><small>${esc(candidate.name)} · 50</small></button>`).join('')}</div>
    </div>`;
  }).join('');

  const agendaBody = agenda.current
    ? `<div class="k-agenda now"${tipAttr('agenda', agenda.current.id)}><small>In progress</small><b>${esc(agenda.current.name)}</b><p>${esc(agenda.current.reward)}</p>
        <span>${meter(agenda.current.progress, { tone: 'pos', wide: true })}<em>${agenda.current.weeksLeft} weeks left</em></span></div>`
    : `<div class="k-agenda-opts">${agenda.options.map((option) => `<button class="k-agenda" data-uc-agenda="${option.id}"${tipAttr('agenda', option.id)}>
        <b>${esc(option.name)}</b><p>${esc(option.desc)}</p><em>${esc(option.reward)} · ${option.weeks} weeks</em></button>`).join('')
      || empty('New proposals arrive next week.')}</div>`;
  const recent = (me.agenda?.log ?? []).slice(0, 3).map((entry) => `<li>${esc(entry.text)}</li>`).join('');

  const decisionTiles = decisions.map((decision) => `<button class="k-dec" data-uc-decision="${decision.id}"${decision.blockers.length ? blockedAttr(decision.blockers) : tipAttr('decision', decision.id)}>
      <b>${esc(decision.name)}</b><span class="k-cost">${decision.cost}</span><small>${esc(decision.desc)}</small></button>`).join('');

  return `${kpis}
    <div class="k-cols-3">
      ${panel('Stability', parts(view.stabilityParts), { sub: 'target, piece by piece', right: `→ ${pct(view.stabilityTarget)}`, tip: 'stability' })}
      ${panel('War support', parts(view.warSupportParts), { sub: 'target, piece by piece', right: `→ ${pct(view.warSupportTarget)}`, tip: 'warsupport' })}
      ${panel('National agenda', agendaBody + (recent ? `<ul class="k-log">${recent}</ul>` : ''), { sub: 'one project at a time' })}
    </div>
    ${panel('Parties', `<div class="k-parties">${parties}</div>${regimes ? `<div class="k-actions">${regimes}</div>` : ''}`, { sub: esc(view.government.desc) })}
    ${panel('Laws', `<div class="k-laws">${laws}</div>`, { sub: `${view.lawCost} political power per change · 26-week lock · click twice to enact` })}
    ${panel('Advisors', `<div class="k-seats">${seats}</div>`, { sub: 'one per seat · 50 political power · hover a candidate for their effects' })}
    ${panel('Decisions', `<div class="k-decs">${decisionTiles}</div>`, { sub: 'spend political power' })}`;
}

// ================================================================== BIND ===

/**
 * Ekran düğmelerini oyunun kapılarına bağlar. `screens` Screens örneğidir:
 * `refresh()`, `uc` durum nesnesi ve `me` buradan okunur.
 */
export function bindStateScreens(screens) {
  const { game } = screens;
  const me = screens.me;
  const root = screens.el.body;
  const state = screens.uc;
  if (!me) return;
  // Her düğme SG, altın ya da istikrar harcar; üst çubuk haftayı beklemeden
  // tazelensin diye eylemden sonra 'politics' yayınlanır (hud.js dinler).
  const on = (selector, handler) => {
    for (const el of root.querySelectorAll(selector)) {
      el.onclick = (event) => {
        handler(el, event);
        game.emit('politics', me.id);
      };
    }
  };
  const confirmThen = (key, apply) => {
    if (state.confirm !== key) {
      state.confirm = key;
      screens.refresh();
      return;
    }
    state.confirm = null;
    apply();
    screens.refresh();
  };
  on('[data-uc-law]', (el) => {
    const [lawId, index] = el.dataset.ucLaw.split(':');
    confirmThen(`law:${lawId}:${index}`, () => setLaw(game, me, lawId, Number(index)));
  });
  on('[data-uc-weight]', (el) => {
    const [id, delta] = el.dataset.ucWeight.split(':');
    setLineWeight(me, id, (me.economy?.lines?.[id]?.weight ?? 0) + Number(delta));
    screens.refresh();
  });
  on('[data-uc-embargo-lift]', (el) => {
    setEmbargo(me, Number(el.dataset.ucEmbargoLift), false);
    screens.refresh();
  });
  on('[data-uc-prov]', (el) => {
    state.province = Number(el.dataset.ucProv);
    const province = game.world.provinces?.[state.province];
    if (province?.center) game.focusTile?.(province.center);
    screens.refresh();
  });
  on('[data-uc-build]', (el) => {
    const province = game.world.provinces?.[state.province];
    if (province) queueBuilding(game, me, province, el.dataset.ucBuild);
    screens.refresh();
  });
  on('[data-uc-develop]', () => {
    const province = game.world.provinces?.[state.province];
    if (province) queueDevelopment(game, me, province);
    screens.refresh();
  });
  on('[data-uc-proj-top]', (el) => { moveProject(game, me, Number(el.dataset.ucProjTop), 'top'); screens.refresh(); });
  on('[data-uc-proj-cancel]', (el) => { cancelProject(game, me, Number(el.dataset.ucProjCancel)); screens.refresh(); });
  on('[data-uc-accept]', (el) => { acceptCulture(game, me, Number(el.dataset.ucAccept)); screens.refresh(); });
  on('[data-uc-release]', (el) => { releaseToKin(game, me, Number(el.dataset.ucRelease)); screens.refresh(); });
  on('[data-uc-expel]', (el) => {
    const id = Number(el.dataset.ucExpel);
    confirmThen(`expel:${id}`, () => expelCulture(game, me, id));
  });
  on('[data-uc-form]', () => { formNation(game, me); screens.refresh(); });
  on('[data-uc-union]', (el) => { proposeUnion(game, me, Number(el.dataset.ucUnion)); screens.refresh(); });
  on('[data-uc-appoint]', (el) => {
    const id = el.dataset.ucAppoint;
    confirmThen(`gov:${id}`, () => appointGovernment(game, me, id));
  });
  on('[data-uc-propaganda]', (el) => { runPropaganda(game, me, el.dataset.ucPropaganda); screens.refresh(); });
  on('[data-uc-regime]', (el) => {
    const id = el.dataset.ucRegime;
    confirmThen(`regime:${id}`, () => enactRegime(game, me, id));
  });
  on('[data-uc-hire]', (el) => { hireAdvisor(game, me, el.dataset.ucHire); screens.refresh(); });
  on('[data-uc-dismiss]', (el) => { dismissAdvisor(game, me, el.dataset.ucDismiss); screens.refresh(); });
  on('[data-uc-agenda]', (el) => { chooseAgenda(game, me, el.dataset.ucAgenda); screens.refresh(); });
  on('[data-uc-decision]', (el) => { takeDecision(game, me, el.dataset.ucDecision); screens.refresh(); });
}

/** Dosya kartından ambargo (SG bedeli diplomasi katmanında; burada kapı). */
export const EMBARGO_POWER = 25;
export function embargoBlockers(world, me, other) {
  const out = [];
  if (!other?.alive || other.id === me.id) return ['Not a valid target'];
  if (embargoed(world, me.id, other.id) && (me.embargoes ?? []).includes(other.id)) return ['Already under embargo'];
  if ((me.power ?? 0) < EMBARGO_POWER) out.push(`Needs ${EMBARGO_POWER} political power`);
  return out;
}
export function declareEmbargo(game, me, otherId) {
  const other = game.world.nations[otherId];
  if (embargoBlockers(game.world, me, other).length) return false;
  me.power -= EMBARGO_POWER;
  setEmbargo(me, otherId, true);
  game.turns?.addLog?.(`Embargo declared on ${other.name}.`, { kind: 'POLITICS' });
  return true;
}
