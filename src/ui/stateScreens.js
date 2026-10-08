// ULUSAL YÖNETİM EKRANLARI — Uluslar Çağı (TASARIM.md §16).
//
// Altı ekran, sekme künyeleriyle aynı adlar: Budget (altın), Trade (kaynak ve
// ticaret), Factories (IC, tüketim malı, üretim hatları), Construction (bina
// ve kalkınma), Population (halklar ve birleşme), Politics (hükûmet, yasa,
// danışman, gündem, karar).
//
// KURAL (ilke 2): ekran formül KURMAZ. Her sayı oyunun döküm fonksiyonundan
// gelir (economyView, governmentView, constructionView, agendaView...);
// burada yalnız biçim ve düğme vardır. Bağlama `bindStateScreens` içindedir:
// her düğme bir `data-uc-*` özniteliği taşır, oyunun kapısını çağırır.

import {
  BUILDINGS, BUILDING_IDS, EQUIPMENT, EQUIPMENT_IDS, RESOURCES, RESOURCE_IDS, TAX_PER_DEVELOPMENT,
} from '../game/econ/defs.js';
import { LAWS, lawIndex } from '../game/laws.js';
import { economyView, formatPopulation, populationOf } from '../game/economy.js';
import { setLineWeight } from '../game/econ/industry.js';
import { consumerStability, consumerTaxBonus } from '../game/econ/industry.js';
import { embargoed, setEmbargo } from '../game/econ/trade.js';
import { equipmentLogistics } from '../game/reinforcement.js';
import {
  buildBlockers, buildingCost, cancelProject, constructionView, developBlockers, developmentCost,
  moveProject, queueBuilding, queueDevelopment,
} from '../game/construction.js';
import { buildingLevels, buildingSlots, provinceName } from '../game/provinces.js';
import { depositsOf, fertilityOf } from '../game/econ/deposits.js';
import {
  ADVISOR_SLOTS, PARTIES, appointGovernment, dismissAdvisor, enactRegime, governmentView,
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
import { growthRateOf } from '../game/provinces.js';
import { describeEffects } from '../game/modifiers.js';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const num = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : '—');
const signed = (value, digits = 1) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(digits)}`;
const pct = (value) => `${Math.round((value ?? 0) * 100)}%`;
const pts = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(Math.round(value * 100))}`;
const tone = (value) => (value < 0 ? 'res-neg' : value > 0 ? 'res-pos' : '');
const turnOf = (game) => game.turns?.turn ?? game.world?.turn ?? 0;

/** Engel listesini düğmenin title metnine çevirir. */
const why = (blockers) => (blockers?.length ? ` disabled title="${esc(blockers.join(' · '))}"` : '');

function card(title, sub, body, extra = '') {
  return `<section class="card uc-card ${extra}">
    <div class="card-head"><h3>${esc(title)}</h3>${sub ? `<small>${sub}</small>` : ''}</div>
    ${body}
  </section>`;
}

function rows(list) {
  return `<div class="detail-list">${list.filter(Boolean).map(([label, value, cls = '']) => (
    `<div><span>${label}</span><b class="${cls}">${value}</b></div>`)).join('')}</div>`;
}

function bar(share, cls = '') {
  const width = Math.max(0, Math.min(100, Math.round((share ?? 0) * 100)));
  return `<span class="uc-bar ${cls}"><i style="width:${width}%"></i></span>`;
}

/** Yasa seçeneklerini çip olarak basar (ekran içi hızlı yasa). */
function lawChips(world, nation, lawId, confirm) {
  const law = LAWS[lawId];
  const current = lawIndex(nation, lawId);
  const view = governmentView(world, nation).laws.find((row) => row.id === lawId);
  return `<div class="uc-law">
    <span class="uc-law-name">${law.icon} ${esc(law.name)}${view?.lock ? ` <small>locked ${view.lock}w</small>` : ''}</span>
    <div class="uc-chips">${law.options.map((option, index) => {
    const blockers = view?.options[index]?.blockers ?? [];
    const active = index === current;
    const key = `law:${lawId}:${index}`;
    const pending = confirm === key;
    return `<button class="chip uc-chip${active ? ' on' : ''}${pending ? ' confirming' : ''}"
      data-uc-law="${lawId}:${index}" ${active ? 'disabled' : why(blockers)}
      title="${esc(option.desc)}${blockers.length && !active ? ` — ${esc(blockers.join(' · '))}` : ''}">
      ${esc(option.name)}${pending ? ' · confirm?' : ''}</button>`;
  }).join('')}</div>
  </div>`;
}

// ================================================================= BUDGET ===

export function renderBudget(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const ledger = view.ledger;
  const turn = turnOf(game);
  const bankrupt = view.bankruptUntil > turn;
  const income = [
    ['Taxes', signed(ledger.tax ?? 0), 'res-pos'],
    ['Exports', signed(ledger.exports ?? 0), 'res-pos'],
    ['Tribute & reparations', signed(ledger.treaty ?? 0), tone(ledger.treaty ?? 0)],
  ];
  const expenses = [
    ['Army upkeep', signed(ledger.army ?? 0), 'res-neg'],
    ['Navy upkeep', signed(ledger.navy ?? 0), 'res-neg'],
    ['Building upkeep', signed(ledger.maintenance ?? 0), 'res-neg'],
    [`Inflation (coin above ${Math.round(view.inflationReserve)} melts)`, signed(ledger.inflation ?? 0), 'res-neg'],
    ['Education', signed(ledger.education ?? 0), 'res-neg'],
    ['Imports', signed(ledger.imports ?? 0), 'res-neg'],
    ['Debt interest', signed(ledger.interest ?? 0), 'res-neg'],
    ['Construction', signed(ledger.construction ?? 0), tone(ledger.construction ?? 0)],
    ['Recruitment', signed(ledger.recruitment ?? 0), tone(ledger.recruitment ?? 0)],
    ['Martial law', signed(ledger.unrest ?? 0), tone(ledger.unrest ?? 0)],
    ['State purchases', signed(ledger.outlay ?? 0), tone(ledger.outlay ?? 0)],
  ].filter((row) => row[1] !== '+0.0' && row[1] !== '−0.0');
  const tax = view.tax;
  const history = me.economy?.history ?? [];
  const spark = sparkline(history.map((entry) => entry.gold));
  return `<div class="overview-stats">
      <div><span>Treasury</span><b>${Math.round(view.gold)}</b><small>gold</small></div>
      <div><span>Weekly balance</span><b class="${tone(ledger.net)}">${signed(ledger.net ?? 0)}</b><small>last week, closed</small></div>
      <div><span>Debt</span><b class="${view.debt > view.debtCap * 0.75 ? 'res-neg' : ''}">${Math.round(view.debt)}</b><small>ceiling ${Math.round(view.debtCap)}</small></div>
      <div><span>Income</span><b>${num(ledger.income ?? 0)}</b><small>per week</small></div>
    </div>
    ${bankrupt ? `<p class="uc-alert bad">The state is bankrupt for ${view.bankruptUntil - turn} more weeks: no credit, stability −20, the army trains and recovers at half speed.</p>` : ''}
    <div class="uc-grid">
      ${card('Income', 'last week', rows(income))}
      ${card('Expenses', 'last week', rows(expenses))}
    </div>
    <div class="uc-grid">
      ${card('Tax yield', 'how the tax line is built', rows([
    ['Provinces (population × development × status)', num(tax.base)],
    ['Tax law', `×${num(tax.law, 2)}`],
    ['Stability', `×${num(tax.stability, 2)}`],
    ['Consumer goods surplus', `×${num(tax.consumer, 2)}`],
    ['Ministers, research, events', `×${num(tax.mods, 2)}`],
    ['Weekly tax', num(tax.total), 'res-pos'],
  ]))}
      ${card('Treasury', '52 weeks', `<div class="uc-spark">${spark}</div>${rows([
    ['Interest', `${num((me.debt ?? 0) * 0.003, 2)}/week`],
    ['Borrowing', bankrupt ? 'Closed (bankrupt)' : 'Automatic when the treasury runs dry'],
    ['Above the ceiling', 'Bankruptcy: debt wiped, 52 weeks of disgrace'],
  ])}`)}
    </div>
    ${card('Fiscal laws', 'political power', `${lawChips(world, me, 'tax', state.confirm)}${lawChips(world, me, 'education', state.confirm)}
      <p class="uc-note">Education costs ${num(view.education, 1)} gold a week and moves literacy toward ${pct(view.literacyTarget)} (now ${pct(view.literacy)}).</p>`)}`;
}

function sparkline(values, width = 220, height = 42) {
  const list = values.filter(Number.isFinite);
  if (list.length < 2) return '<small class="uc-note">Not enough history yet.</small>';
  const min = Math.min(...list, 0);
  const max = Math.max(...list, 1);
  const span = Math.max(1e-6, max - min);
  const points = list.map((value, index) => {
    const x = (index / (list.length - 1)) * width;
    const y = height - ((value - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const zero = height - ((0 - min) / span) * height;
  return `<svg viewBox="0 0 ${width} ${height}" class="uc-spark-svg" preserveAspectRatio="none">
    <line x1="0" x2="${width}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" class="zero"/>
    <polyline points="${points}"/></svg>`;
}

// ================================================================== TRADE ===

export function renderTrade(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const resources = view.resources ?? {};
  const market = world.market ?? {};
  const table = RESOURCE_IDS.map((id) => {
    const info = RESOURCES[id];
    const r = resources[id] ?? {};
    const partner = r.topPartner >= 0 ? world.nations[r.topPartner] : null;
    const ratioCls = r.ratio < 0.8 ? 'res-neg' : r.ratio < 1 ? 'warn' : '';
    return `<tr>
      <td><span class="uc-res-dot" style="background:${info.color}"></span>${info.glyph} ${esc(info.name)}</td>
      <td>${num(r.produced ?? 0)}</td>
      <td>${num(r.need ?? 0)}</td>
      <td class="res-neg">${r.imported ? num(r.imported) : '—'}</td>
      <td class="res-pos">${r.exported ? num(r.exported) : '—'}</td>
      <td class="${ratioCls}">${(r.need ?? 0) > 0.01 ? pct(r.ratio) : '—'}</td>
      <td>${num(market.prices?.[id] ?? info.price, 2)}</td>
      <td>${partner ? `${esc(partner.name)} <small>${pct(r.topShare)}</small>` : '—'}</td>
    </tr>`;
  }).join('');
  const embargoes = (me.embargoes ?? []).map((id) => world.nations[id]).filter(Boolean);
  const marketRows = RESOURCE_IDS.map((id) => {
    const history = market.history?.[id] ?? [];
    return `<div class="uc-mkt">
      <span>${RESOURCES[id].glyph} ${esc(RESOURCES[id].name)}</span>
      <b>${num(market.prices?.[id] ?? 0, 2)}</b>
      <small>world needs ${pct(market.balance?.[id] ?? 0)} of output · traded ${num(market.volume?.[id] ?? 0, 0)}</small>
      <div class="uc-spark mini">${sparkline(history, 120, 22)}</div>
    </div>`;
  }).join('');
  return `${card('Trade law', 'how much of our surplus may leave the country', lawChips(world, me, 'trade', state.confirm)
    + `<p class="uc-note">Exports sell only the surplus, up to the law's share of output. Imports fill every shortage automatically while the treasury can pay${view.blockade > 0 ? ` — <b class="res-neg">an enemy fleet blockades ${pct(view.blockade)} of our coast</b>` : ''}.</p>`)}
    ${card('Resources', 'per week', `<div class="uc-table-wrap"><table class="uc-table">
      <thead><tr><th>Resource</th><th>Made</th><th>Needed</th><th>Imported</th><th>Exported</th><th>Covered</th><th>Price</th><th>Main supplier</th></tr></thead>
      <tbody>${table}</tbody></table></div>
      <p class="uc-note">Food feeds the people · Coal fuels the factories · Iron and Timber feed the production lines and construction · Horses mount cavalry and artillery · Saltpeter is gunpowder for every regiment in battle.</p>`)}
    <div class="uc-grid">
      ${card('World market', 'price = base × (world need ÷ world output)^1.5', `<div class="uc-mkts">${marketRows}</div>`)}
      ${card('Embargoes', 'no trade with these states', embargoes.length
    ? `<div class="detail-list">${embargoes.map((other) => `<div><span>${esc(other.name)}</span>
        <button class="action compact" data-uc-embargo-lift="${other.id}">Lift</button></div>`).join('')}</div>`
    : '<p class="empty">No embargoes. Declare one from a foreign power\'s dossier (25 political power).</p>')}
    </div>`;
}

// ============================================================== INDUSTRY ===

export function renderIndustry(game, me, state) {
  const world = game.world;
  const view = economyView(world, me);
  const ic = view.ic ?? { total: 0, civil: 0, military: 0, raw: 0, factors: {} };
  const consumer = view.consumer ?? { need: 0, cottage: 0, civil: 0, supply: 0, ratio: 1 };
  const logistics = equipmentLogistics(world, me);
  const lines = EQUIPMENT_IDS.map((id) => {
    const info = EQUIPMENT[id];
    const line = view.lines?.[id] ?? { weight: 0, efficiency: 0, ic: 0, output: 0, limit: 1 };
    const log = logistics.find((row) => row.id === id);
    const blocked = id === 'ships' && (ic.dockyards ?? 0) <= 0;
    return `<div class="uc-line${blocked ? ' off' : ''}">
      <span class="uc-line-name">${info.glyph} ${esc(info.name)}<small>${num(info.ic, 2)} IC each</small></span>
      <span class="uc-weight">
        <button class="action compact" data-uc-weight="${id}:-1" ${line.weight <= 0 ? 'disabled' : ''}>−</button>
        <b>${line.weight}</b>
        <button class="action compact" data-uc-weight="${id}:1" ${line.weight >= 10 ? 'disabled' : ''}>+</button>
      </span>
      <span>${num(line.ic, 2)} IC</span>
      <span title="Efficiency grows while the line works, decays when idle">${bar(line.efficiency)} ${pct(line.efficiency)}</span>
      <span class="${line.limit < 1 ? 'res-neg' : ''}" title="Share of the line's resources available">${line.limit < 1 ? `materials ${pct(line.limit)}` : 'materials ok'}</span>
      <span><b>${num(line.output, 1)}</b>/wk</span>
      <span>stock <b>${num(log?.stock ?? 0, 0)}</b>${log?.required > 0.5 ? ` · needs ${num(log.required, 0)}` : ''}</span>
      ${blocked ? '<em>Needs a dockyard</em>' : ''}
    </div>`;
  }).join('');
  const factors = ic.factors ?? {};
  return `<div class="overview-stats">
      <div><span>Industrial capacity</span><b>${num(ic.total)}</b><small>${num(ic.raw, 0)} factory levels</small></div>
      <div><span>Civilian</span><b>${num(ic.civil)}</b><small>consumer goods</small></div>
      <div><span>Military</span><b>${num(ic.military)}</b><small>${pct(ic.share)} of industry</small></div>
      <div><span>Consumer goods</span><b class="${consumer.ratio < 0.95 ? 'res-neg' : 'res-pos'}">${pct(consumer.ratio)}</b><small>of what the people want</small></div>
    </div>
    ${card('Economy law', 'how much industry works for the army', lawChips(world, me, 'economy', state.confirm))}
    <div class="uc-grid">
      ${card('Industrial capacity', 'factories × multipliers', rows([
    ['Factory levels × status', num(ic.raw)],
    ['Coal supply', `×${num(factors.coal ?? 1, 2)}`, (factors.coal ?? 1) < 1 ? 'res-neg' : ''],
    ['Stability', `×${num(factors.stability ?? 1, 2)}`],
    ['Conscription law', `×${num(factors.law ?? 1, 2)}`],
    ['Technology & ministers', `×${num(factors.tech ?? 1, 2)}`],
    ['Total', num(ic.total), 'res-pos'],
  ]))}
      ${card('Consumer goods', 'the people\'s share of industry', rows([
    ['Wanted (grows every decade)', num(consumer.need)],
    ['Workshops', num(consumer.cottage)],
    ['Civilian industry', num(consumer.civil)],
    ['Covered', pct(consumer.ratio), consumer.ratio < 0.95 ? 'res-neg' : 'res-pos'],
    ['Stability effect', pts(consumerStability(consumer.ratio)), tone(consumerStability(consumer.ratio))],
    ['Tax bonus', `+${pct(consumerTaxBonus(consumer.ratio))}`],
  ]))}
    </div>
    ${card('Production lines', 'military industry is shared by weight', `<div class="uc-lines">${lines}</div>
      <p class="uc-note">Raise a weight to move military industry onto that line. Rifles arm every regiment, artillery the gun regiments, ships the fleet (dockyards needed). Shortages of iron, timber or coal slow the lines.</p>`)}`;
}

// ========================================================== CONSTRUCTION ===

const BUILDING_GLYPH = {
  farm: '🌾', mine: '⛏', factory: '🏭', dockyard: '⚓', barracks: '⚔', fort: '🏰', railway: '🛤', university: '🎓',
};

export function renderConstruction(game, me, state) {
  const world = game.world;
  const view = constructionView(world, me);
  const own = (world.provinces ?? []).filter((p) => p.owner === me.id && p.econ)
    .sort((a, b) => b.econ.population - a.econ.population || a.id - b.id);
  if (state.province == null || !own.some((p) => p.id === state.province)) state.province = own[0]?.id ?? null;
  const selected = world.provinces?.[state.province];
  const queue = view.queue.length ? view.queue.map((item) => `<div class="uc-proj${item.active ? ' active' : ''}">
      <span>${item.kind === 'develop' ? '📈' : BUILDING_GLYPH[item.building] ?? '🏗'} <b>${esc(item.name)}</b><small>${esc(item.province)}</small></span>
      <span>${bar(item.progress)} ${item.active ? `${item.weeksLeft ?? '—'} wk` : 'waiting'}</span>
      <span class="uc-proj-acts">
        <button class="action compact" data-uc-proj-top="${item.id}" title="Move to the front">▲</button>
        <button class="action compact" data-uc-proj-cancel="${item.id}" title="Cancel (75% of the unspent cost back)">✕</button>
      </span></div>`).join('') : '<p class="empty">Nothing under construction.</p>';
  const list = own.map((province) => {
    const econ = province.econ;
    const levels = buildingLevels(econ);
    const slots = buildingSlots(econ);
    const icons = BUILDING_IDS.filter((id) => econ.buildings[id] > 0)
      .map((id) => `<i title="${esc(BUILDINGS[id].name)} ${econ.buildings[id]}">${BUILDING_GLYPH[id]}${econ.buildings[id] > 1 ? econ.buildings[id] : ''}</i>`).join('');
    return `<button class="uc-prov${province.id === state.province ? ' on' : ''}" data-uc-prov="${province.id}">
      <span><b>${esc(provinceName(province.center))}</b><small>${formatPopulation(econ.population)} · dev ${econ.development}${econ.core ? '' : ' · non-core'}</small></span>
      <span class="uc-prov-b">${icons || '<small>no buildings</small>'}</span>
      <span class="uc-prov-s">${levels}/${slots}</span>
    </button>`;
  }).join('');
  let detail = '<p class="empty">Select a province.</p>';
  if (selected?.econ) {
    const econ = selected.econ;
    const devBlockers = developBlockers(world, me, selected);
    const deposits = depositsOf(selected).map((line) => `${RESOURCES[line.id].glyph} ${RESOURCES[line.id].name} ×${num(line.size, 1)}`).join(' · ') || 'none';
    const buildRows = BUILDING_IDS.map((id) => {
      const info = BUILDINGS[id];
      const blockers = buildBlockers(world, me, selected, id);
      const cost = buildingCost(world, me, selected, id);
      return `<div class="uc-build">
        <span>${BUILDING_GLYPH[id]} <b>${esc(info.name)}</b> <small>${econ.buildings[id]}/${info.max}</small></span>
        <small>${esc(info.effect)}</small>
        <button class="action compact" data-uc-build="${id}"${why(blockers)}>${cost} · ${info.weeks}w</button>
      </div>`;
    }).join('');
    detail = `<div class="uc-prov-head">
        <h4>${esc(provinceName(selected.center))}</h4>
        <small>${formatPopulation(econ.population)} people · fertility ${num(fertilityOf(selected), 2)} · deposits: ${deposits}</small>
      </div>
      <div class="uc-dev">
        <span><b>Development ${econ.development} <small>of ${view.developmentCap}</small></b><small>tax +${Math.round(TAX_PER_DEVELOPMENT * 100)}% per level, +1 building slot, faster growth</small></span>
        <button class="action compact" data-uc-develop="1"${why(devBlockers)}>Develop · ${developmentCost(me, selected)}</button>
      </div>
      <div class="uc-builds">${buildRows}</div>`;
  }
  return `<div class="overview-stats">
      <div><span>Construction slots</span><b>${view.slots}</b><small>projects at once</small></div>
      <div><span>In queue</span><b>${view.queue.length}</b><small>${view.queue.filter((q) => q.active).length} building now</small></div>
      <div><span>Development cap</span><b>${view.developmentCap}</b><small>research and literacy raise it</small></div>
      <div><span>Treasury</span><b>${Math.round(me.gold)}</b><small>buildings are paid up front</small></div>
    </div>
    ${card('Under construction', 'timber shortages slow every site', `<div class="uc-projs">${queue}</div>`)}
    <div class="uc-split">
      ${card('Provinces', 'buildings / slots', `<div class="uc-provs">${list}</div>`, 'uc-left')}
      ${card('Build', 'paid up front, upkeep weekly', detail, 'uc-right')}
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
  const cultureRows = mix.slice(0, 14).map((row) => {
    const accept = acceptBlockers(world, me, row.id, turn);
    const release = releaseBlockers(world, me, row.id);
    const expel = expelBlockers(world, me, row.id);
    const confirmKey = `expel:${row.id}`;
    return `<tr>
      <td><span class="uc-res-dot" style="background:${world.cultures?.[row.id]?.color ?? '#888'}"></span>${esc(row.name)}${row.primary ? ' <small>primary</small>' : row.accepted ? ' <small>accepted</small>' : ''}</td>
      <td>${formatPopulation(row.people)}</td>
      <td>${pct(row.share)}</td>
      <td>${row.accepted ? '—' : `<button class="action compact" data-uc-accept="${row.id}"${why(accept)}>Accept</button>
        <button class="action compact" data-uc-release="${row.id}"${why(release)}>Release</button>
        <button class="action compact${state.confirm === confirmKey ? ' confirming' : ''}" data-uc-expel="${row.id}"${why(expel)}>${state.confirm === confirmKey ? 'Confirm expulsion' : 'Expel'}</button>`}</td>
    </tr>`;
  }).join('');
  const status = unificationStatus(world, me);
  const formBlockers = formationBlockers(world, me);
  const unions = unionCandidates(world, me).map((other) => {
    const blockers = unionBlockers(world, me, other, turn, game.turns?.playerNation);
    return `<div><span>${esc(other.name)}</span><button class="action compact" data-uc-union="${other.id}"${why(blockers)}>Propose union</button></div>`;
  }).join('');
  const goal = GOALS[me.goal];
  return `<div class="overview-stats">
      <div><span>Population</span><b>${formatPopulation(economy.population ?? populationOf(world, me))}</b><small>${signed(growth * 100, 2)}% a year</small></div>
      <div><span>Literacy</span><b>${pct(economy.literacy)}</b><small>target ${pct(economy.literacyTarget)}</small></div>
      <div><span>Manpower</span><b>${formatPopulation(nationManpower(world, me.id))}</b><small>available recruits</small></div>
      <div><span>Accepted peoples</span><b>${pct(economy.acceptedShare ?? 1)}</b><small>of the population</small></div>
    </div>
    ${card('Citizenship', 'who belongs to the nation', lawChips(world, me, 'citizenship', state.confirm)
    + '<p class="uc-note">Accepted peoples pay full taxes, fill the ranks and do not rise. Others are taxed and recruited by compliance and the citizenship law; their unrest feeds national movements.</p>')}
    ${card('Peoples', 'accept costs political power; release hands provinces to their kin; expulsion is final',
    `<div class="uc-table-wrap"><table class="uc-table"><thead><tr><th>People</th><th>Population</th><th>Share</th><th></th></tr></thead><tbody>${cultureRows}</tbody></table></div>`)}
    <div class="uc-grid">
      ${card(`The ${esc(status.culture)} nation`, 'unification', `${rows([
    ['Homeland provinces held', `${status.owned} / ${status.total}`],
    ['Kin under foreign rule', pct(economy.kinAbroad ?? 0)],
    ['Great nation', status.formed == null ? 'not yet proclaimed' : status.formed === me.id ? 'proclaimed' : 'claimed by another'],
  ])}
        <button class="action wide" data-uc-form="1"${why(formBlockers)}>Proclaim the Great ${esc(status.culture)} Empire</button>
        ${unions ? `<div class="detail-list">${unions}</div>` : ''}`)}
      ${card('National goal', 'victory bonus in 1900', goal ? `<p><b>${esc(goal.name)}</b> — ${esc(goal.desc)}</p>
        <p class="${goalMet(world, me) ? 'res-pos' : 'res-neg'}">${goalMet(world, me) ? 'On track' : 'Not yet achieved'} · +${goal.bonus} points</p>` : '<p class="empty">No goal.</p>')}
    </div>`;
}

// ============================================================== POLITICS ===

export function renderPolitics(game, me, state) {
  const world = game.world;
  const turn = turnOf(game);
  const view = governmentView(world, me, turn);
  const agenda = agendaView(world, me, turn);
  const decisions = decisionsView(me, turn);
  const parties = view.support.map((party) => {
    const appoint = !party.appointBlockers.includes('Decided by elections') && !party.ruling;
    return `<div class="uc-party${party.ruling ? ' ruling' : ''}">
      <span class="uc-party-name"><i style="background:${party.color}"></i>${esc(party.name)}${party.ruling ? ' <small>in government</small>' : ''}</span>
      <span>${bar(party.support / 100)} ${Math.round(party.support)}%</span>
      <small>${esc(party.pitch)} ${describeEffects(party.effects).join(', ')}</small>
      <span class="uc-party-acts">
        ${appoint ? `<button class="action compact${state.confirm === `gov:${party.id}` ? ' confirming' : ''}" data-uc-appoint="${party.id}"${why(party.appointBlockers)}>${state.confirm === `gov:${party.id}` ? 'Confirm' : 'Appoint · 80'}</button>` : ''}
        <button class="action compact" data-uc-propaganda="${party.id}"${why(party.propagandaBlockers)}>Propaganda · 50</button>
      </span>
    </div>`;
  }).join('');
  const parts = (list) => list.map((part) => `<div><span>${esc(part.label)}</span><b class="${tone(part.value)}">${pts(part.value)}</b></div>`).join('');
  const advisors = view.advisors.map((slot) => `<div class="uc-adv">
      <span class="uc-adv-slot">${esc(slot.name)}</span>
      ${slot.hired ? `<span><b>${esc(slot.hired.title)} ${esc(slot.hired.name)}</b><small>${describeEffects(slot.hired.effects).join(', ')}</small>
        <button class="action compact" data-uc-dismiss="${slot.slot}">Dismiss</button></span>` : '<span><small>vacant</small></span>'}
      <span class="uc-adv-cands">${slot.candidates.filter((c) => c.id !== slot.hired?.id).map((candidate) => `<button class="action compact" data-uc-hire="${candidate.id}"${why(candidate.blockers)}
        title="${esc(describeEffects(candidate.effects).join(', '))}">${esc(candidate.title)} ${esc(candidate.name)} · 50</button>`).join('')}</span>
    </div>`).join('');
  const agendaBody = agenda.current
    ? `<div class="uc-agenda now"><b>${esc(agenda.current.name)}</b><small>${esc(agenda.current.reward)}</small>
        <span>${bar(agenda.current.progress)} ${agenda.current.weeksLeft} weeks left</span></div>`
    : `<div class="uc-agenda-opts">${agenda.options.map((option) => `<button class="uc-agenda" data-uc-agenda="${option.id}">
        <b>${esc(option.name)}</b><small>${esc(option.desc)}</small><em>${esc(option.reward)} · ${option.weeks} weeks</em></button>`).join('')
      || '<p class="empty">New proposals arrive next week.</p>'}</div>`;
  const regimes = view.regimes.map((regime) => `<button class="action${state.confirm === `regime:${regime.id}` ? ' confirming' : ''}" data-uc-regime="${regime.id}"${why(regime.blockers)}>
      ${esc(regime.name)} · ${regime.cost}${state.confirm === `regime:${regime.id}` ? ' — confirm' : ''}</button>`).join('');
  const decisionRows = decisions.map((decision) => `<button class="uc-decision" data-uc-decision="${decision.id}"${why(decision.blockers)}>
      <b>${esc(decision.name)} <small>${decision.cost}</small></b><small>${esc(decision.desc)}</small></button>`).join('');
  const recent = (me.agenda?.log ?? []).slice(0, 3).map((entry) => `<li>${esc(entry.text)}</li>`).join('');
  return `<div class="overview-stats">
      <div><span>Political power</span><b>${Math.round(view.power)}</b><small>${signed(view.powerIncome.total, 2)}/week · cap 500</small></div>
      <div><span>Stability</span><b>${pct(view.stability)}</b><small>heading to ${pct(view.stabilityTarget)}</small></div>
      <div><span>War support</span><b>${pct(view.warSupport)}</b><small>heading to ${pct(view.warSupportTarget)}</small></div>
      <div><span>Government</span><b>${esc(view.government.name)}</b><small>${view.nextElection ? `election in ${Math.max(0, view.nextElection - turn)} weeks` : 'no elections'}</small></div>
    </div>
    <div class="uc-grid">
      ${card('Stability', 'target, piece by piece', `<div class="detail-list">${parts(view.stabilityParts)}</div>`)}
      ${card('War support', 'target, piece by piece', `<div class="detail-list">${parts(view.warSupportParts)}</div>`)}
    </div>
    ${card('Parties', view.legitimacy.gap > 0 ? `the people want the ${esc(PARTIES[view.legitimacy.leader].name)} — legitimacy ${pts(view.legitimacy.hit)} stability` : 'the government has the people behind it', `<div class="uc-parties">${parties}</div>
      ${regimes ? `<div class="action-row">${regimes}</div>` : ''}
      <p class="uc-note">${esc(view.government.desc)}</p>`)}
    ${card('Laws', `${view.lawCost} political power per change · 26-week lock`, Object.keys(LAWS).map((id) => lawChips(world, me, id, state.confirm)).join(''))}
    ${card('Advisors', 'one per seat · 50 political power', `<div class="uc-advs">${advisors}</div>`)}
    <div class="uc-grid">
      ${card('National agenda', 'one project at a time', agendaBody + (recent ? `<ul class="uc-log">${recent}</ul>` : ''))}
      ${card('Decisions', 'spend political power', `<div class="uc-decisions">${decisionRows}</div>`)}
    </div>`;
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
