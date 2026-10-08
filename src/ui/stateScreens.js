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
import { buildingLevels, buildingSlots, provinceName } from '../game/provinces.js';
import { depositsOf } from '../game/econ/deposits.js';
import {
  PARTIES, appointGovernment, dismissAdvisor, enactRegime, governmentView,
  hireAdvisor, runPropaganda, setLaw,
} from '../game/politics.js';
import { agendaView, chooseAgenda } from '../game/agenda.js';
import { decisionsView, takeDecision } from '../game/decisions.js';
import { acceptCulture, expelCulture, releaseToKin } from '../game/culture.js';
import { formNation, formationBlockers, proposeUnion } from '../game/unification.js';
import { GOALS, goalMet } from '../game/hegemony.js';
import { nationManpower } from '../game/recruitment.js';
import { describeEffects, mod } from '../game/modifiers.js';
import {
  badge, blockedAttr, chain, empty, esc, kpi, kpiRow, ledger, meter, num, panel, pct, pips, pts,
  segmented, short, signed, spark, tipAttr, tone,
} from './kit.js';
import { buildingArt, emblemArt, equipmentArt, lawArt, ledgerArt, resourceArt } from './icons/art.js';
import { buildPreview } from '../game/buildPreview.js';
import { peoplesView } from '../game/peoplesView.js';
import {
  MOVEMENT, crackdown, declareMartialLaw, grantConcessions, releaseAsVassal,
} from '../game/movements.js';

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

  // HOI4 MODELİ: önce NE kurulacağı seçilir, sonra bütün state'ler o binanın
  // o state'te getireceği GERÇEK kazançla sıralı listelenir (buildPreview).
  // Eski akış state → bina idi ve kartlar genel etkiyi yazıyordu ("Food
  // +25%"); oyuncu kırk state'te tek tek gezip ne alacağını bilmeden basıyordu.
  if (!state.build || !(state.build === 'develop' || BUILDINGS[state.build])) state.build = 'mine';
  const pick = state.build;
  const rows = buildCandidates(world, me, pick, state);
  const ready = rows.filter((row) => !row.blockers.length);

  const options = BUILD_PICKS.map((id, index) => {
    const info = BUILDINGS[id];
    const name = info?.name ?? 'Develop';
    const effect = info?.effect ?? 'Tax and one more building slot';
    const art = id === 'develop' ? emblemArt('infrastructure', 'md') : buildingArt(id, 'md');
    const can = own.filter((p) => !(id === 'develop' ? developBlockers(world, me, p) : buildBlockers(world, me, p, id)).length).length;
    return `<button class="k-bopt${id === pick ? ' on' : ''}" data-uc-pick="${id}"${id === 'develop' ? '' : tipAttr('building', id)}>
      <kbd class="k-key">${index + 1}</kbd>
      <span class="k-bopt-art">${art}</span>
      <span class="k-bopt-t"><b>${esc(name)}</b><small>${esc(effect)}</small></span>
      <em class="${can ? '' : 'none'}"${tipAttr({ text: `${can} state${can === 1 ? '' : 's'} can take one now` })}>${can}</em>
    </button>`;
  }).join('');

  // Kaynak süzgeci: kazancı olan kaynaklar ("bütün kömür state'leri").
  const unfiltered = state.resFilter ? buildCandidates(world, me, pick, { ...state, resFilter: null }) : rows;
  const resIds = [...new Set(unfiltered.flatMap((row) => row.preview.gains.map((g) => g.resource).filter(Boolean)))];
  if (state.resFilter && !resIds.includes(state.resFilter)) state.resFilter = null;
  const filters = resIds.length > 1 ? `<div class="k-wfilter">
      <kbd class="k-key"${tipAttr({ text: 'F cycles the resource filter' })}>F</kbd>
      <button class="k-wchip${state.resFilter ? '' : ' on'}" data-uc-res="">All</button>
      ${resIds.map((id) => `<button class="k-wchip${state.resFilter === id ? ' on' : ''}" data-uc-res="${id}">${resourceArt(id, 'xs')}${esc(RESOURCES[id].name)}</button>`).join('')}
    </div>` : '';

  const unused = (id) => (me.economy?.resources?.[id]?.need ?? 0) < 0.01;
  const gainHtml = (preview) => {
    if (!preview.gains.length) return `<span class="k-wgain none">${esc(preview.note || 'no gain')}</span>`;
    // Süzgeç açıksa süzülen kaynak ana satırdır ("bütün petrol state'leri").
    const gains = state.resFilter
      ? [...preview.gains].sort((x, y) => (y.resource === state.resFilter) - (x.resource === state.resFilter))
      : preview.gains;
    const [main, ...rest] = gains;
    const idle = main.resource && unused(main.resource);
    return `<span class="k-wgain${idle ? ' idle' : ''}">
      ${main.resource ? resourceArt(main.resource, 'xs') : ''}<b>${esc(main.text)}</b>${main.resource ? '<small>/wk</small>' : ''}
      ${rest.length ? `<em>${rest.map((g) => esc(g.text)).join(' · ')}</em>` : ''}
    </span>`;
  };
  const gainTip = (row) => {
    const lines = [`${row.name}: what one more ${pick === 'develop' ? 'development level' : BUILDINGS[pick].name} does`];
    for (const g of row.preview.gains) {
      lines.push(g.from != null ? `${g.label}: ${num(g.from, 2)} → ${num(g.to, 2)} per week` : g.text);
      if (g.resource && unused(g.resource)) {
        const bought = Math.min(1, world.market?.balance?.[g.resource] ?? 1);
        lines.push(`  ${g.label} has no use at home: it can only be exported, and the world buys ${Math.round(bought * 100)}% of what it produces`);
      }
    }
    if (row.preview.worth > 0.005) {
      // Geri dönüş NET kazançla: bakım her hafta değerden düşer.
      const net = row.preview.worth - (BUILDINGS[pick]?.upkeep ?? 0);
      lines.push(`Worth ≈ ${num(row.preview.worth, 2)} gold/wk to you${net > 0.005
        ? ` (pays for itself in ~${Math.ceil(row.cost / net)} weeks after upkeep)` : ', less than its upkeep'}`);
    }
    else if (row.preview.worth != null) lines.push('Worth almost nothing to you today: no use at home, no buyer abroad');
    if (row.preview.note) lines.push(row.preview.note);
    if (pick !== 'develop') lines.push(`Upkeep: ${BUILDINGS[pick].upkeep} gold/wk`);
    return { text: lines.join('\n') };
  };

  const header = `<div class="k-wrow head"><span></span><span>State</span><span>${pick === 'develop' ? 'Development' : 'Level'}</span><span>Slots</span><span>You get</span><span></span></div>`;
  state.cursor = Math.max(0, Math.min(state.cursor ?? 0, rows.length - 1));
  const table = rows.length ? rows.map((row, index) => {
    const econ = row.province.econ;
    const level = pick === 'develop' ? pips(econ.development, DEVELOPMENT_MAX, view.developmentCap)
      : pips(econ.buildings[pick] ?? 0, BUILDINGS[pick].max);
    return `<div class="k-wrow${row.blockers.length ? ' off' : ''}${index === state.cursor ? ' kb' : ''}" data-uc-row="${index}">
      <span class="k-wrow-res">${resourceArt(depositsOf(row.province)[0]?.id, 'sm')}</span>
      <span class="k-wrow-name"><button class="k-link" data-uc-focus="${row.province.id}"${tipAttr('state', row.province.id)}>${esc(row.name)}</button>
        <small>${formatPopulation(econ.population)}${econ.core === false ? ' · <em>not core</em>' : ''}</small></span>
      <span class="k-wrow-lv">${level}</span>
      <span class="k-wrow-slots${row.levels >= row.slots ? ' full' : ''}">${row.levels}/${row.slots}</span>
      <span class="k-wrow-gain"${tipAttr(gainTip(row))}>${gainHtml(row.preview)}</span>
      <button class="k-btn" data-uc-buildat="${row.province.id}"${blockedAttr(row.blockers)}><b>${row.cost}</b><small>${row.weeks} wk</small></button>
    </div>`;
  }).join('') : empty(state.showAll ? 'You own no states.' : 'No state can take this now — show all to see why.');

  // Toplu kurulum: en iyi N state, sıradaki sırayla. Fabrika her kurulumda
  // pahalanır; toplam bu yüzden "≈".
  const bulk = [3, 5].filter((n) => ready.length >= n || n === 3).map((n) => {
    const take = ready.slice(0, n);
    const total = take.reduce((sum, row) => sum + row.cost, 0);
    const blockers = !take.length ? ['No state can take one now']
      : (me.gold ?? 0) < total ? [`Needs ≈${total} gold`] : [];
    const key = n === 3 ? 'B' : '⇧B';
    return `<button class="k-btn sm" data-uc-bulk="${n}"${blockers.length ? blockedAttr(blockers) : tipAttr({ text: `Queue one in each of the ${take.length} best states:\n${take.map((r) => `${r.name} — ${r.preview.gains[0]?.text ?? ''}`).join('\n')}\n\nShortcut: ${key}` })}>Best ${Math.min(n, Math.max(1, take.length))} · ≈${total}<kbd>${key}</kbd></button>`;
  }).join('');
  const showAll = `<button class="k-btn sm${state.showAll ? ' on' : ''}" data-uc-showall="1"${tipAttr({ text: 'Also list states where it cannot be built (full, maximum level, no coast...), with the reason on the button.' })}>${state.showAll ? 'Hide unavailable' : 'Show all'}<kbd>S</kbd></button>`;
  const pickName = pick === 'develop' ? 'Develop' : BUILDINGS[pick].name;

  return `${kpis}
    <div class="k-split k-cons">
      ${panel('Build', `<div class="k-bopts">${options}</div>`, { sub: 'pick what to build', cls: 'k-bcat' })}
      ${panel(`${pickName} — where`, `${filters}<div class="k-wtable">${header}${table}</div>${KEY_LEGEND}`, {
    sub: `best first · ${ready.length} of ${rows.length} ready`, right: `${bulk}${showAll}`, cls: 'k-where',
  })}
    </div>
    ${panel('Under construction', queue, { sub: 'timber shortages slow every site', right: `${active} building · ${view.queue.length - active} waiting` })}`;
}

/** Katalog sırası = rakam kısayolu (1 Farm … 9 Develop). */
const BUILD_PICKS = [...BUILDING_IDS, 'develop'];

const KEY_LEGEND = `<div class="k-keys">
  <span><kbd>1</kbd>–<kbd>9</kbd> building</span><span><kbd>↑</kbd><kbd>↓</kbd> state</span>
  <span><kbd>Enter</kbd> build</span><span><kbd>B</kbd> best 3</span><span><kbd>⇧B</kbd> best 5</span>
  <span><kbd>F</kbd> filter</span><span><kbd>S</kbd> show all</span><span><kbd>A</kbd> auto</span>
</div>`;

function queueAt(game, me, state, province) {
  return state.build === 'develop'
    ? queueDevelopment(game, me, province)
    : queueBuilding(game, me, province, state.build);
}

/** En iyi N state'e birer tane; ekranın gösterdiği sırayla. */
function queueBest(game, me, state, count) {
  const ready = buildCandidates(game.world, me, state.build, state).filter((row) => !row.blockers.length);
  let done = 0;
  for (const row of ready.slice(0, count)) {
    if (!queueAt(game, me, state, row.province)) break;
    done++;
  }
  return done;
}

/**
 * Construction klavyesi (screens.handleKey). Fare akışının birebir kopyası:
 * rakam binayı seçer, oklar satırı, Enter kurar, B en iyi 3 (⇧ ile 5),
 * F süzgeci döndürür, S kurulamayanları açar. Kırk state'e kırk tık yerine
 * "4, B, B, B" — mikro yönetim tuşa iner (TASARIM.md ev ödevi testi).
 */
export function constructionKey(screens, event) {
  const { game } = screens;
  const me = screens.me;
  const state = screens.uc;
  if (!me) return false;
  const after = () => {
    screens.refresh();
    game.emit('politics', me.id);
    screens.el.body.querySelector('.k-wrow.kb')?.scrollIntoView({ block: 'nearest' });
  };
  const digit = /^(?:Digit|Numpad)([1-9])$/.exec(event.code);
  if (digit) {
    const id = BUILD_PICKS[Number(digit[1]) - 1];
    if (!id) return false;
    state.build = id;
    state.resFilter = null;
    state.cursor = 0;
    after();
    return true;
  }
  if (!state.build) return false;
  const rows = () => buildCandidates(game.world, me, state.build, state);
  switch (event.code) {
    case 'ArrowDown':
    case 'ArrowUp': {
      const step = event.code === 'ArrowDown' ? 1 : -1;
      state.cursor = Math.max(0, Math.min(rows().length - 1, (state.cursor ?? 0) + step));
      after();
      return true;
    }
    case 'Enter':
    case 'NumpadEnter': {
      // Odaktaki düğme kendi Enter'ını kullanır (klavyeyle gezen oyuncu).
      if (event.target?.closest?.('button, a, input, select')) return false;
      const row = rows()[state.cursor ?? 0];
      if (row && !row.blockers.length) queueAt(game, me, state, row.province);
      after();
      return true;
    }
    case 'KeyB':
      queueBest(game, me, state, event.shiftKey ? 5 : 3);
      after();
      return true;
    case 'KeyF': {
      const all = buildCandidates(game.world, me, state.build, { ...state, resFilter: null });
      const ids = [null, ...new Set(all.flatMap((row) => row.preview.gains.map((g) => g.resource).filter(Boolean)))];
      if (ids.length <= 2) return true;
      const at = ids.indexOf(state.resFilter ?? null);
      state.resFilter = ids[(at + (event.shiftKey ? ids.length - 1 : 1)) % ids.length];
      state.cursor = 0;
      after();
      return true;
    }
    case 'KeyS':
      state.showAll = !state.showAll;
      state.cursor = 0;
      after();
      return true;
    default:
      return false;
  }
}

/**
 * Seçili bina için state satırları, kazanca göre sıralı. Ekran ve "en iyi N"
 * düğmesi AYNI listeyi okur — düğmenin kurduğu, ekranın gösterdiğidir.
 * Kalıcı engeli olan state (tavan, slot, kıyı...) `showAll` yoksa düşer;
 * altın ve kuyruk geçici engeldir, satır kalır ve düğme sebebini söyler.
 */
function buildCandidates(world, me, pick, state = {}) {
  const transient = (text) => /gold$/.test(text) || /queue is full/.test(text);
  const out = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== me.id || !province.econ) continue;
    const blockers = pick === 'develop' ? developBlockers(world, me, province) : buildBlockers(world, me, province, pick);
    if (!state.showAll && blockers.some((b) => !transient(b))) continue;
    const preview = buildPreview(world, me, province, pick);
    const filter = state.resFilter;
    if (filter && !preview.gains.some((g) => g.resource === filter)) continue;
    const score = filter ? preview.gains.find((g) => g.resource === filter).value : preview.score;
    out.push({
      province,
      name: provinceName(province.center),
      blockers,
      preview,
      score,
      cost: pick === 'develop' ? developmentCost(me, province) : buildingCost(world, me, province, pick),
      weeks: pick === 'develop' ? 12 : BUILDINGS[pick].weeks,
      levels: buildingLevels(province.econ),
      slots: buildingSlots(province.econ),
    });
  }
  const hard = (row) => row.blockers.some((b) => !transient(b));
  return out.sort((a, b) => hard(a) - hard(b) || b.score - a.score || b.province.econ.population - a.province.econ.population);
}


// ============================================================ POPULATION ===

export function renderPopulation(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const economy = me.economy ?? {};
  const view = peoplesView(world, me, turn);
  const goal = GOALS[me.goal];
  const g = view.growth;
  const yearly = (rate) => `${signed(rate * 52 * 100, 2)}%`;

  const kpis = kpiRow([
    kpi({ icon: emblemArt('people', 'md'), label: 'Population', value: formatPopulation(economy.population ?? populationOf(world, me)), sub: `${yearly(g.rate)} a year${view.realized != null ? ` · last year ${signed(view.realized * 100, 2)}%` : ''}`, tip: { text: 'Population\nGrows with food, consumer goods, stability, development and peace; war and famine shrink it. The Growth panel shows every factor.' }, cls: 'hero' }),
    kpi({ icon: lawArt('education', 'md'), label: 'Literacy', value: pct(economy.literacy), sub: `heading for ${pct(economy.literacyTarget)}`, tip: 'law', arg: 'education', meter: economy.literacy, meterTone: 'pos' }),
    kpi({ icon: emblemArt('recruits', 'md'), label: 'Manpower', value: formatPopulation(nationManpower(world, me.id)), sub: 'men who can still be raised', tip: 'manpower' }),
    kpi({ icon: lawArt('citizenship', 'md'), label: 'Full citizens', value: pct(economy.acceptedShare ?? 1), sub: 'of the population', tip: 'law', arg: 'citizenship', meter: economy.acceptedShare ?? 1 }),
    kpi({ icon: emblemArt('infamy', 'md'), label: 'Unrest', value: num(view.unrest, 1), sub: view.boiling ? `${view.boiling} state${view.boiling === 1 ? '' : 's'} at revolt level` : `revolt level is ${view.revoltAt}`, tip: { text: `Unrest (0-10)\nPopulation-weighted across your states. Above ${view.revoltAt} a state can rise; where an unaccepted people is the majority, unrest above 6 feeds their national movement.` }, meter: view.unrest / 10, meterTone: view.unrest >= 4 ? 'neg' : 'warn' }),
  ]);

  // --- Halklar -----------------------------------------------------------
  const acceptTip = (row) => {
    const p = row.accept.preview;
    return { text: [
      `Accept the ${row.name}`,
      `Recruits +${formatPopulation(p.recruits)}`,
      `Unrest where they live: ${num(p.unrestFrom, 1)} → ${num(p.unrestTo, 1)} (target)`,
      'They pay full taxes, fill the ranks and stop feeding a movement.',
      `Cost: ${p.power} political power`,
      `Backlash: your own people +${num(p.backlash, 1)} unrest, fading over ${Math.round(p.backlashWeeks / 52)} years`,
    ].join('\n') };
  };
  const stageChip = (move) => (move
    ? `<span class="k-stage s${move.stage.index}"${tipAttr({ text: `${move.stage.name} · ${Math.round(move.progress)}%\nAt 100% their states break away${move.heir ? ` and ${move.heir.name} goes to war with us` : ''}.${move.eta != null ? `\nAt this pace: ~${move.eta} weeks.` : ''}` })}>${esc(move.stage.name)} <b>${Math.round(move.progress)}%</b></span>`
    : '<span class="k-dim">—</span>');
  const peopleHead = `<div class="k-prow head"><span>People</span><span>Share</span><span>Lives in</span><span>Unrest</span><span>Movement</span><span></span></div>`;
  const peopleRows = view.peoples.slice(0, 14).map((row) => {
    const confirmKey = `expel:${row.id}`;
    const status = row.primary ? badge('primary', 'gold') : row.accepted ? badge('accepted', 'pos') : badge('no rights', 'dim');
    let acts = '<span class="k-dim">full citizens</span>';
    if (row.accept) {
      const extra = [];
      if (!row.release.blockers.length) extra.push(`<button class="k-btn sm" data-uc-release="${row.id}"${tipAttr({ text: 'Release\nHand their broken states to their kin state. The land and the trouble go; the world thinks better of us.' })}>Release</button>`);
      if (!row.expel.blockers.length) extra.push(`<button class="k-btn sm danger${state.confirm === confirmKey ? ' confirming' : ''}" data-uc-expel="${row.id}"${tipAttr({ text: `Expel\nFinal: all ${formatPopulation(row.people)} of them leave and their land empties. Infamy and unrest follow.` })}>${state.confirm === confirmKey ? 'Confirm' : 'Expel'}</button>`);
      // Engelliyken de önizleme görünür: oyuncu neyi kaçırdığını bilmeli.
      const blocked = row.accept.blockers;
      const tip = blocked.length
        ? ` disabled aria-disabled="true"${tipAttr({ text: `Not possible now\n${blocked.join('\n')}\n\n${acceptTip(row).text}` })}`
        : tipAttr(acceptTip(row));
      acts = `<button class="k-btn sm" data-uc-accept="${row.id}"${tip}>Accept<small>${row.accept.preview.power} PP</small></button>${extra.join('')}`;
    }
    const gain = row.accept && row.accept.preview.recruits > 0
      ? `<em class="k-pgain"${tipAttr(acceptTip(row))}>if accepted: +${formatPopulation(row.accept.preview.recruits)} recruits</em>` : '';
    return `<div class="k-prow"${tipAttr('culture', row.id)}>
      <span class="k-prow-name"><i style="background:${row.color}"></i><b>${esc(row.name)}</b>${status}${gain}</span>
      <span class="k-prow-share">${meter(row.share, { tone: row.accepted ? 'pos' : 'warn' })}<b>${pct(row.share)}</b><small>${formatPopulation(row.people)}</small></span>
      <span class="k-prow-where"><span><b>${row.states}</b> state${row.states === 1 ? '' : 's'}</span><small>${row.majority ? `majority in ${row.majority}` : 'minority everywhere'}</small></span>
      <span class="k-prow-unrest">${meter(row.unrest / 10, { tone: row.unrest >= 6 ? 'neg' : row.unrest >= 3 ? 'warn' : 'pos', mark: 0.6 })}<b>${num(row.unrest, 1)}</b></span>
      <span class="k-prow-move">${stageChip(row.movement)}</span>
      <span class="k-prow-acts">${acts}</span>
    </div>`;
  }).join('');

  // --- Huzursuz state'ler, sebebiyle ------------------------------------
  const restlessRows = view.restless.map((row) => {
    const culture = world.cultures?.[row.culture];
    const rising = row.target > row.unrest + 0.15;
    const falling = row.target < row.unrest - 0.15;
    const causes = row.causes.slice(0, 2).map((c) => `<span class="k-cause">${esc(c.label)} <b>+${num(c.value, 1)}</b></span>`).join('')
      + row.reliefs.slice(0, 1).map((c) => `<span class="k-cause pos">${esc(c.label)} <b>${num(c.value, 1)}</b></span>`).join('');
    const tip = [`${row.name}: unrest ${num(row.unrest, 1)}, heading for ${num(row.target, 1)}`,
      ...row.causes.map((c) => `${c.label} +${num(c.value, 2)}`),
      ...row.reliefs.map((c) => `${c.label} ${num(c.value, 2)}`),
      `Compliance ${Math.round(row.compliance)}% · foreign ${pct(row.foreign)}`].join('\n');
    return `<div class="k-rrow">
      <span class="k-rrow-name"><i style="background:${culture?.color ?? '#888'}"></i><button class="k-link" data-uc-focus="${row.id}"${tipAttr('state', row.id)}>${esc(row.name)}</button><small>${esc(culture?.name ?? '')}</small></span>
      <span class="k-rrow-val"${tipAttr({ text: tip })}>${meter(row.unrest / 10, { tone: row.unrest >= 7 ? 'neg' : row.unrest >= 4 ? 'warn' : 'party', mark: 0.7 })}<b class="${row.unrest >= 7 ? 'neg' : ''}">${num(row.unrest, 1)}</b><i class="k-trend ${rising ? 'up' : falling ? 'down' : ''}">${rising ? '▲' : falling ? '▼' : '■'}</i></span>
      <span class="k-rrow-causes"${tipAttr({ text: tip })}>${causes || '<span class="k-dim">settling</span>'}</span>
      <span class="k-rrow-comp">${Math.round(row.compliance)}%</span>
    </div>`;
  }).join('');

  // --- Ulusal hareketler --------------------------------------------------
  const moveCards = view.movements.map((row) => {
    const a = row.actions;
    const act = (id, label, cfg, tip, cls = '') => {
      const key = `move:${id}:${row.cultureId}`;
      const arming = state.confirm === key;
      return `<button class="k-btn sm ${cls}${arming ? ' confirming' : ''}" data-uc-move="${id}:${row.cultureId}"${cfg.blockers.length ? blockedAttr(cfg.blockers) : tipAttr({ text: tip })}>${arming ? 'Confirm' : label}</button>`;
    };
    const ticks = MOVEMENT.STAGES.slice(1).map((s) => `<i style="left:${s.at}%"></i>`).join('');
    const pace = row.martialLeft > 0 ? `martial law · ${row.martialLeft} wk`
      : row.calmLeft > 0 ? `exhausted · ${row.calmLeft} wk`
        : row.eta != null ? `breaks away in ~${row.eta} wk` : 'fading';
    return `<div class="k-move s${row.stage.index}" style="--mv:${row.color ?? '#888'}">
      <div class="k-move-head"><i></i><b>${esc(row.name)}</b><span class="k-stage s${row.stage.index}">${esc(row.stage.name)}</span><small>${pace}</small></div>
      <div class="k-move-bar"${tipAttr({ text: `${Math.round(row.progress)}% — at 100% ${row.provinces.length} state${row.provinces.length === 1 ? '' : 's'} break away${row.heir ? ` and ${row.heir.name} goes to war with us` : ''}.\nIt grows while their unrest stays above ${row.calm} (now ${num(row.pressure, 1)}).` })}><i class="fill" style="width:${row.progress.toFixed(1)}%"></i>${ticks}</div>
      <div class="k-move-acts">
        ${act('concessions', `Concede · ${a.concessions.cost} PP`, a.concessions, `Temporary: −${a.concessions.drop}% progress and calmer states. Once a year.`)}
        ${act('martial', `Martial law · ${num(a.martial.cost, 1)}/wk`, a.martial, `Temporary: for ${a.martial.weeks} weeks the movement loses ground; gold every week and some stability.`)}
        ${act('vassal', `Release ${a.vassal.provinces} as vassal`, a.vassal, 'Permanent: their states become our vassal. The land goes, the war never comes, they pay us 15% of their income.')}
        ${act('crackdown', `Crush · ${formatPopulation(a.crackdown.dead)} die`, a.crackdown, `Permanent: ${formatPopulation(a.crackdown.dead)} of them die. −${a.crackdown.drop}% progress, heavy infamy, lost stability; our other peoples grow bolder.`, 'danger')}
      </div>
    </div>`;
  }).join('');

  // --- Büyüme -------------------------------------------------------------
  const growthBody = g.famine
    ? `<div class="k-famine"><b>Famine</b> — food covers ${pct(g.foodRatio)} of need; the population shrinks ${yearly(g.rate)} a year. Build farms or import food.</div>`
    : `<div class="k-growth-top"><b class="${g.rate >= 0 ? 'pos' : 'neg'}">${yearly(g.rate)}</b><small>a year</small>${spark(view.history, { width: 200, height: 34, zero: false })}</div>
      ${chain({ label: 'Base', text: `${num(g.base * 5200, 2)}%`, value: g.base }, [
    { label: 'Food', value: g.food, tip: { text: `Food\nShortfall slows growth; below 70% covered, famine.\nCovered ${pct(g.foodRatio)}` } },
    { label: 'Goods', value: g.consumer, tip: { text: 'Consumer goods\nFull shelves add growth, empty ones take it away.' } },
    { label: 'Stability', value: g.stability },
    { label: 'Development', value: g.development, tip: { text: 'Development\nPopulation-weighted across your states: +5% per level.' } },
    { label: 'Law', value: g.law },
    { label: 'Tech & ideas', value: g.mods },
    { label: 'Peace', value: g.peace, tip: { text: 'Peace\nAt war, growth is cut by 40%.' } },
  ], { label: 'per year', text: yearly(g.rate), value: g.rate })}`;

  // --- Birleşme -----------------------------------------------------------
  const status = view.status;
  const held = status.total ? status.owned / status.total : 0;
  const unionRows = view.unions.map((u) => `<div class="k-urow">
      <b>${esc(u.name)}</b><small>${formatPopulation(u.population)}</small>
      <span class="k-urow-ratio ${u.ratio >= u.need ? 'pos' : ''}"${tipAttr({ text: `Size\nWe must be ${u.need}× their population to absorb them peacefully. Now ${num(u.ratio, 1)}×.` })}>${num(u.ratio, 1)}× <small>/ ${u.need}×</small></span>
      <button class="k-btn sm" data-uc-union="${u.id}"${blockedAttr(u.blockers)}${u.blockers.length ? '' : tipAttr({ text: `Union\nTheir whole state joins ours in peace. Costs ${u.power} political power and a little infamy.` })}>Union<small>${u.power} PP</small></button>
    </div>`).join('');
  const formBlockers = formationBlockers(world, me);

  return `${kpis}
    <div class="k-split wide-left k-pop">
      <div class="k-stack">
        ${panel('Peoples', `<div class="k-ptable">${peopleHead}${peopleRows}</div>`, { sub: 'who lives in the nation · hover Accept to see what it brings' })}
        ${panel('Citizenship', lawCard(world, me, 'citizenship', state.confirm, { compact: true }), { sub: 'rights for peoples you have not accepted' })}
        ${panel('Restless states', restlessRows ? `<div class="k-rtable">${restlessRows}</div>${view.restlessMore ? `<small class="k-more">and ${view.restlessMore} calmer state${view.restlessMore === 1 ? '' : 's'}</small>` : ''}` : empty('Every state is calm.'), { sub: `out of 10 · revolt at ${view.revoltAt} · ▲ rising ▼ settling`, right: 'cause · compliance' })}
      </div>
      <div class="k-stack">
        ${panel('National movements', moveCards || empty('No movement is growing. One rises where an unaccepted people is the majority and their unrest stays above 6.'), { sub: view.movements.length ? 'act before they break away' : 'peoples without rights organise here' })}
        ${panel('Growth', growthBody, { sub: 'why the population grows' })}
        ${panel(`The ${esc(status.culture)} nation`, `
          <div class="k-unify"${tipAttr({ text: 'Unification\nHold 80% of your people\'s homeland to proclaim the Great nation: a core on every homeland state, prestige and an end to the kin-abroad grievance.' })}>
            <small>Homeland held</small>${meter(held, { tone: 'pos', mark: 0.8, wide: true })}<b>${status.owned} / ${status.total}</b>
          </div>
          <div class="k-unify-sub"><span>Kin under foreign rule <b class="${(economy.kinAbroad ?? 0) > 0.1 ? 'neg' : ''}">${pct(economy.kinAbroad ?? 0)}</b></span>
            ${goal ? `<span${tipAttr({ text: `${goal.name}\n${goal.desc}` })}>Goal: <b>${esc(goal.name)}</b> ${goalMet(world, me) ? badge('on track', 'pos') : badge(`+${goal.bonus} in 1900`, 'dim')}</span>` : ''}</div>
          ${unionRows ? `<div class="k-unions">${unionRows}</div>` : ''}
          <button class="k-btn wide" data-uc-form="1"${blockedAttr(formBlockers)}>Proclaim the Great ${esc(status.culture)} Empire</button>`, { sub: status.formed == null ? 'unification' : status.formed === me.id ? 'proclaimed' : 'claimed by another' })}
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
  // İnşaat: bina seç → state satırında kur. Ekran kapanmaz; peş peşe
  // kırk state'e basmak kırk tık olmasın diye "en iyi N" de var.
  on('[data-uc-pick]', (el) => { state.build = el.dataset.ucPick; state.resFilter = null; state.cursor = 0; screens.refresh(); });
  on('[data-uc-res]', (el) => { state.resFilter = el.dataset.ucRes || null; state.cursor = 0; screens.refresh(); });
  on('[data-uc-showall]', () => { state.showAll = !state.showAll; state.cursor = 0; screens.refresh(); });
  on('[data-uc-focus]', (el) => {
    const province = game.world.provinces?.[Number(el.dataset.ucFocus)];
    if (province?.center) game.focusTile?.(province.center);
  });
  on('[data-uc-buildat]', (el) => {
    const province = game.world.provinces?.[Number(el.dataset.ucBuildat)];
    const row = el.closest('[data-uc-row]');
    if (row) state.cursor = Number(row.dataset.ucRow);
    if (province) queueAt(game, me, state, province);
    screens.refresh();
  });
  on('[data-uc-bulk]', (el) => { queueBest(game, me, state, Number(el.dataset.ucBulk)); screens.refresh(); });
  on('[data-uc-proj-top]', (el) => { moveProject(game, me, Number(el.dataset.ucProjTop), 'top'); screens.refresh(); });
  on('[data-uc-proj-cancel]', (el) => { cancelProject(game, me, Number(el.dataset.ucProjCancel)); screens.refresh(); });
  on('[data-uc-accept]', (el) => { acceptCulture(game, me, Number(el.dataset.ucAccept)); screens.refresh(); });
  on('[data-uc-release]', (el) => { releaseToKin(game, me, Number(el.dataset.ucRelease)); screens.refresh(); });
  on('[data-uc-expel]', (el) => {
    const id = Number(el.dataset.ucExpel);
    confirmThen(`expel:${id}`, () => expelCulture(game, me, id));
  });
  on('[data-uc-form]', () => { formNation(game, me); screens.refresh(); });
  // Ulusal hareket eylemleri (movementDock ile aynı kapılar). Kalıcı olanlar
  // (vassal bırakma, katliam) iki tık ister.
  on('[data-uc-move]', (el) => {
    const [action, id] = el.dataset.ucMove.split(':');
    const cultureId = Number(id);
    const run = {
      concessions: () => grantConcessions(game, me, cultureId),
      martial: () => declareMartialLaw(game, me, cultureId),
      vassal: () => releaseAsVassal(game, me, cultureId),
      crackdown: () => crackdown(game, me, cultureId),
    }[action];
    if (!run) return;
    if (action === 'vassal' || action === 'crackdown') confirmThen(`move:${action}:${cultureId}`, run);
    else { run(); screens.refresh(); }
  });
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
