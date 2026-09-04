// Sanayi ekranı: üç sütunlu bir tesis yönetimi panosu.
//
// Yerleşim referansı sabittir ve tartışmaya kapalıdır:
//   SOL     state gezgini — "nereye bakayım?"
//   ORTA    seçili state + büyük, okunur tesis kartları — "ne yapayım?"
//   SAĞ     inşaat rayı + hazine desteği — "ne kadar sürede?"
//   ÜST     altı sayılık ulusal sanayi özeti
//
// Kart okuma sırası da sabittir: AD+SEVİYE → DURUM → GİRDİ→ÇIKTI → KADRO →
// KÂR+SEBEBİ → EYLEMLER. Görsel olarak bu beşinden başka hiçbir şey öne
// çıkmaz; eski ekranın minik ikon kutucukları bilerek yok.
//
// Bu dosya YALNIZ ÇİZER. Bütün sayılar `game/industryView.js`ten hazır gelir
// (industryOverview / factoryBuildOptions); burada hiçbir eşik, hiçbir oran,
// hiçbir kâr sebebi hesaplanmaz — yoksa ekran simülasyondan sapar.

import { factoryEmblem, resourceGlyph } from './icons/index.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const money = (v) => {
  const a = Math.abs(v ?? 0);
  if (a >= 1000) return `${((v ?? 0) / 1000).toFixed(2)}K`;
  if (a >= 100) return `${Math.round(v ?? 0)}`;
  return (v ?? 0).toFixed(a >= 10 ? 0 : 1);
};
const signed = (v) => `${v >= 0 ? '+' : '−'}£${money(Math.abs(v))}`;
const people = (v) => {
  const n = Math.round(v ?? 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
};
const tone = (v) => (v > 0.005 ? 'good' : v < -0.005 ? 'bad' : '');

/** Kart ve state satırı süzgeçleri. Aynı adlar `Screens` durumunda saklanır. */
export const INDUSTRY_FILTERS = {
  all: 'All',
  attention: 'Needs Attention',
  profitable: 'Profitable',
  losing: 'Losing Money',
};

export const STATE_FILTERS = {
  all: 'All States',
  profitable: 'Profitable',
  losing: 'Losing Money',
};

export const CATEGORY_TABS = {
  all: 'All Industries',
  consumer: 'Consumer Goods',
  industrial: 'Industrial Goods',
  military: 'Military Goods',
  raw: 'Raw Materials',
};

/** Bir malın tek satırlık künyesi: madalyon + ad + haftalık akış. */
function goodCell(good) {
  return `<span class="ind-good" data-tip="good" data-tip-arg="${esc(good.id)}">
    <i>${resourceGlyph(good.id)}</i>
    <span><b>${esc(good.name)}</b><small>${good.perWeek.toFixed(1)} / week</small></span>
  </span>`;
}

/* ==========================================================================
   ÜST — ulusal sanayi özeti
   ========================================================================== */

/**
 * Ust serit ALTI AYRI KART DEGIL, tek bir alet panelidir: hucreler dikey
 * ayraclarla bolunur, panelin kendisi tektir. Alti kutu yan yana dizmek
 * seridi "kartlar tepsisi" yapiyordu.
 */
function summaryStrip(summary) {
  const cell = (label, value, extra = '', cls = '', explain = '') => `
    <span class="ind-sum-cell"${explain ? ` title="${esc(explain)}"` : ''}>
      <small>${esc(label)}</small>
      <b class="${cls}">${value}</b>
      ${extra ? `<em>${extra}</em>` : ''}
    </span>`;
  return `<header class="ind-summary">
    ${cell('Total factories', summary.factories)}
    ${cell('Workers', `${people(summary.workers)} / ${people(summary.jobs)}`)}
    ${cell('Weekly profit', signed(summary.weeklyProfit), '', tone(summary.weeklyProfit))}
    ${cell('Hired per month', `+${people(summary.hiredPerMonth)}`)}
    ${cell('Private capital', `£${money(summary.privateCapital)}`,
    summary.investmentRule?.privateBuild === false
      ? `+£${summary.privateInflow.toFixed(1)} / week · idle under ${esc(summary.investmentRule.name)}`
      : `+£${summary.privateInflow.toFixed(1)} / week`,
    '', summary.investmentRule?.privateBuild === false
      ? `${summary.investmentRule.name}: ${summary.investmentRule.desc} The pool fills to its ceiling and waits for a change of policy.`
      : 'Money investors have on hand for factory construction and expansion.')}
    ${cell('Open slots', `${summary.freeSlots} / ${summary.totalSlots}`)}
    ${summary.investmentRule ? `<span class="ind-sum-cell ind-sum-rule" title="${esc(summary.investmentRule.desc)}">
      <small>Who may build</small>
      <b>${esc(summary.investmentRule.name)}</b>
      <em>${esc(summary.investmentRule.who)}</em>
    </span>` : ''}
  </header>`;
}

/* ==========================================================================
   SOL — state gezgini
   ========================================================================== */

export function filterStates(states, state) {
  const query = (state.stateQuery ?? '').trim().toLowerCase();
  return states.filter((row) => {
    if (query && !row.name.toLowerCase().includes(query)) return false;
    if (state.stateFilter === 'profitable') return row.profit > 0.005;
    if (state.stateFilter === 'losing') return row.profit < -0.005;
    return true;
  });
}

function stateColumn(states, state) {
  const rows = filterStates(states, state);
  const chips = Object.entries(STATE_FILTERS).map(([id, label]) => `
    <button class="ind-chip${(state.stateFilter ?? 'all') === id ? ' on' : ''}"
      data-state-filter="${id}">${esc(label)}</button>`).join('');
  // Satirda YALNIZ state secmeye yarayan bilgi durur: ad, nufus, tesis sayisi,
  // haftalik kar ve varsa tek bir sorun rozeti. Ikincil istatistik yok.
  const list = rows.map((row) => `
    <button class="ind-state${state.selected === row.id ? ' on' : ''}"
      data-industry-state="${esc(row.id)}">
      <b class="ind-state-name">${esc(row.name)}${state.selected === row.id
    ? ' <i class="ind-star">★</i>' : ''}</b>
      <b class="ind-state-profit ${tone(row.profit)}">${signed(row.profit)}</b>
      <small class="ind-state-sub">${people(row.population)} · ${row.plants} plant${row.plants === 1 ? '' : 's'}</small>
      ${row.attention ? `<em class="ind-warn" title="${row.attention} plant${row.attention === 1 ? '' : 's'} in this state need attention">⚠ ${row.attention}</em>` : ''}
    </button>`).join('');
  return `<aside class="ind-states">
    <div class="ind-states-head">
      <span class="ind-search">
        <i aria-hidden="true">⌕</i>
        <input type="search" placeholder="Search states…" data-state-search
          value="${esc(state.stateQuery ?? '')}">
      </span>
    </div>
    <div class="ind-chips">${chips}</div>
    <div class="ind-state-list">${list || '<p class="empty">No state matches.</p>'}</div>
  </aside>`;
}

/* ==========================================================================
   ORTA — tesis kartları
   ========================================================================== */

export function filterFactories(factories, state) {
  return factories.filter((row) => {
    if (state.selected && row.stateId !== state.selected) return false;
    if (state.category && state.category !== 'all' && row.category !== state.category) return false;
    const filter = state.filter ?? 'all';
    // "Dikkat" bayragi tek kapidan gelir (industryView.factoryDiagnosis): ise
    // alim ve buyume kriz sayilmaz.
    if (filter === 'attention') return row.attention;
    if (filter === 'profitable') return row.profit > 0.005;
    if (filter === 'losing') return row.profit < -0.005 || row.subsidyPaid > 0;
    return true;
  });
}

/**
 * SIRA SABİTTİR — DURUM SÜTUNDA DURUR, SIRADA DEĞİL.
 *
 * Önce kâra göre sıralanıyordu; kâr her tik oynadığı için kartlar zıplıyordu.
 * Sonra "durum kategorisi" ile sıralandı, ama o da çözmedi: bir tesis girdi
 * kıtlığına girip çıktıkça listenin tepesiyle ortası arasında gidip geliyor,
 * oyuncu tıklamak üzere olduğu kartı kaybediyordu (kullanıcı bildirimi).
 *
 * Sorunluyu öne çıkarma işi zaten SÜZGECİN: başlıkta "Needs attention",
 * "Losing money" çipleri var. Sıra artık yalnız ada bakar ve hiç oynamaz.
 */
export function sortFactories(rows) {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name)
    || String(a.id).localeCompare(String(b.id)));
}

function factoryCard(row, openMenu) {
  const chain = `<div class="fac-chain">
    ${row.inputs.length ? row.inputs.map(goodCell).join('') : '<span class="ind-good dim">no inputs</span>'}
    <i class="fac-arrow" aria-hidden="true">→</i>
    ${row.outputs.length ? row.outputs.map(goodCell).join('') : '<span class="ind-good dim">nothing</span>'}
  </div>`;
  // TASMA MENUSU yalniz gercekten VAR OLAN eylemleri tasir; olu satir
  // gostermek "tiklanabilir ama hicbir sey yapmiyor" hissi uretir.
  const menu = [];
  if (row.expansion) {
    menu.push(`<button data-cancel-expansion="${row.expansion.projectId}"
      title="Stop the expansion. ${row.expansion.refund > 0.05
    ? `£${money(row.expansion.refund)} of unspent money comes back`
    : 'Nothing comes back — the work is already paid for'}.">Cancel expansion</button>`);
  }
  if (row.subsidized) {
    menu.push(`<button data-subsidize="${esc(row.id)}">Stop subsidy</button>`);
  }
  menu.push(`<button class="danger" data-close-factory="${esc(row.id)}">Close factory…</button>`);

  return `<article class="fac-card${row.attention ? ` alert-${row.status.tone}` : ''}">
    <div class="fac-emblem" aria-hidden="true">${row.outputs.length
    ? resourceGlyph(row.outputs[0].id) : factoryEmblem(row.typeId)}</div>

    <div class="fac-id">
      <h4>${esc(row.name)}</h4>
      <span class="fac-meta">
        <em class="fac-cat">${esc(row.categoryLabel)}</em>
        <em class="fac-level">Level ${row.level}</em>
      </span>
      <span class="fac-status ${row.status.tone}" data-tip="fac-status"
        data-tip-arg="${esc(row.id)}" tabindex="0">${esc(row.status.label)}</span>
    </div>

    ${chain}

    <div class="fac-workers" data-tip="fac-workers" data-tip-arg="${esc(row.id)}" tabindex="0">
      <small>Workers</small>
      <b>${people(row.employees)} <span>/ ${people(row.jobs)}</span></b>
      <i class="fac-bar${row.attention && row.status.id === 'WORKER_SHORTAGE' ? ' short' : ''}"><i style="width:${Math.round(row.fill * 100)}%"></i></i>
    </div>

    <div class="fac-profit ${tone(row.profit)}" data-tip="fac-profit"
      data-tip-arg="${esc(row.id)}" tabindex="0">
      <small>Weekly profit</small>
      <b>${signed(row.profit)}</b>
      <em>${esc(row.reason)}</em>
    </div>

    <div class="fac-actions">
      <button class="action primary" data-upgrade-factory="${esc(row.id)}"
        ${row.upgradeBlocked ? 'disabled' : ''}
        data-tip="fac-upgrade" data-tip-arg="${esc(row.id)}">Upgrade</button>
      <button class="action${row.subsidized ? ' on' : ''}" data-subsidize="${esc(row.id)}"
        data-tip="fac-subsidy" data-tip-arg="${esc(row.id)}"
        >${row.subsidized ? 'Subsidised ✓' : 'Subsidise'}</button>
      <div class="fac-more">
        <button class="action icon" data-factory-menu="${esc(row.id)}"
          aria-expanded="${openMenu === row.id}" title="More actions">⋯</button>
        ${openMenu === row.id ? `<div class="fac-menu">${menu.join('')}</div>` : ''}
      </div>
    </div>
  </article>`;
}

/** Kapatma onayı: sonuçları SAYIYLA söyler, "emin misin?" demez. */
function closeConfirm(row) {
  return `<div class="picker-overlay" data-close-overlay="1">
    <div class="card fac-confirm">
      <div class="card-head"><h3>Close ${esc(row.name)}?</h3></div>
      <ul class="fac-confirm-list">
        <li><b>${people(row.employees)} workers</b> are released and return to the labour pool.</li>
        <li>Its output stops: <b>${row.outputs.map((o) => esc(o.name)).join(', ') || 'nothing'}</b>
          leaves the national supply.</li>
        <li>The plant is dismantled. <b>Nothing is refunded</b> — the money spent building it is gone.</li>
        ${row.expansion ? `<li class="bad">Its expansion is cancelled too;
          <b>£${money(row.expansion.refund)}</b> of unspent money comes back.</li>` : ''}
        ${row.subsidized ? '<li>The subsidy on it ends.</li>' : ''}
        ${row.profit < 0 ? `<li class="good">It is currently losing
          <b>£${money(Math.abs(row.profit))}</b> a week.</li>`
    : `<li class="bad">It is currently earning <b>£${money(row.profit)}</b> a week.</li>`}
      </ul>
      <div class="fac-confirm-row">
        <button class="action" data-close-cancel="1">Keep it open</button>
        <button class="action danger" data-close-confirm="${esc(row.id)}">Close the factory</button>
      </div>
    </div>
  </div>`;
}

function mainColumn(view, state) {
  const selected = view.states.find((row) => row.id === state.selected) ?? null;
  const rows = sortFactories(filterFactories(view.factories, state));
  const tabs = Object.entries(CATEGORY_TABS).map(([id, label]) => `
    <button class="ind-tab${(state.category ?? 'all') === id ? ' on' : ''}"
      data-industry-category="${id}">${esc(label)}</button>`).join('');
  const filters = Object.entries(INDUSTRY_FILTERS).map(([id, label]) => `
    <button class="ind-chip${(state.filter ?? 'all') === id ? ' on' : ''}"
      data-industry-filter="${id}">${esc(label)}</button>`).join('');
  const attention = view.factories.filter((row) => row.attention).length;
  const empty = selected && selected.free > 0;
  return `<main class="ind-main">
    <div class="ind-main-head">
      <div class="ind-main-title">
        <h3>${selected ? esc(selected.name) : 'All states'}
          ${selected ? '<i class="ind-star">★</i>' : ''}</h3>
        <small>${selected
    ? `Population ${people(selected.population)} · ${selected.plants} plants · ${selected.free} free slots`
    : `${view.factories.length} plants across ${view.states.length} states`}</small>
      </div>
      <button class="ind-build" data-add-region="${esc(state.selected ?? '')}"
        ${state.selected ? '' : 'disabled'}
        title="${state.selected ? 'Open the catalogue for this state'
    : 'Select a state first'}">+ Build Factory</button>
    </div>

    <div class="ind-tabs">${tabs}</div>
    <div class="ind-filters">
      ${filters}
      ${attention ? `<span class="ind-attention">${attention} need attention</span>` : ''}
    </div>

    <div class="ind-cards">
      ${rows.map((row) => factoryCard(row, state.menu)).join('')
    || '<p class="empty">No plant matches this filter.</p>'}
      ${empty ? `<button class="fac-empty" data-add-region="${esc(selected.id)}">
        <i aria-hidden="true">+</i>
        <span><b>Empty plant slot</b><small>${selected.free} industries can still be founded here</small></span>
        <em>Build</em>
      </button>` : ''}
    </div>
  </main>`;
}

/* ==========================================================================
   SAĞ — inşaat rayı
   ========================================================================== */

function railColumn(view) {
  const projects = view.construction;
  // Proje yoksa ray daralır ve genişliği kartlara bırakır.
  if (!projects.length) {
    // Dondurulmus dikey yazi kullanilmaz: bos ray, kart alanina genislik
    // birakan tek satirlik bir kenar kontrolune iner.
    return `<aside class="ind-rail collapsed">
      <span class="ind-rail-chip">
        <i aria-hidden="true">⚒</i>
        <span>Construction</span>
        <b>0</b>
        <em aria-hidden="true">›</em>
      </span>
    </aside>`;
  }
  const rows = projects.map((project) => `
    <div class="ind-project${project.stalled ? ' stalled' : ''}">
      <i class="ind-project-icon" aria-hidden="true">${project.outputId
    ? resourceGlyph(project.outputId) : factoryEmblem(project.typeId)}</i>
      <span class="ind-project-id">
        <b>${esc(project.name)}</b>
        <small>${esc(project.stateName)}${project.actor === 'private' ? ' · private' : ''}</small>
      </span>
      <span class="ind-project-bar"><i style="width:${project.percent}%"></i></span>
      <em>${project.percent}%</em>
      <small class="ind-project-eta">${project.stalled
    ? `stalled — £${money(project.owed)} unpaid`
    : `${project.weeksLeft} week${project.weeksLeft === 1 ? '' : 's'} remaining`}</small>
      ${project.owed > 0.05 ? `<button class="ind-project-fund" data-support="${project.id}"
        title="Pay £${money(project.owed)} from the treasury to finish it sooner. Shift-click pays the remainder in full.">\u{1F3DB}</button>` : ''}
    </div>`).join('');
  return `<aside class="ind-rail">
    <div class="ind-rail-head"><span>Under construction</span><b>${projects.length}</b></div>
    ${rows}
    <p class="hint">Investor sites are paid for by private capital. The treasury can
      top one up to finish it sooner.</p>
  </aside>`;
}

/* ==========================================================================
   İNŞA KATALOĞU
   ========================================================================== */

export function buildCatalogue(catalogue, state) {
  if (!catalogue) return '';
  const category = state.buildCategory ?? 'all';
  const options = catalogue.options
    .filter((option) => category === 'all' || option.category === category)
    // Marja göre sıralamak inşa listesini de her tik zıplatıyordu; marj
    // satırın kendisinde zaten yazılı.
    .sort((a, b) => Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name));
  const tabs = Object.entries(CATEGORY_TABS).map(([id, label]) => `
    <button class="ind-tab${category === id ? ' on' : ''}"
      data-build-category="${id}">${esc(label)}</button>`).join('');
  const cards = options.map((option) => `
    <article class="build-card${option.enabled ? '' : ' blocked'}">
      <div class="build-emblem" aria-hidden="true">${option.outputs.length
    ? resourceGlyph(option.outputs[0].id) : factoryEmblem(option.typeId)}</div>
      <div class="build-id">
        <h4>${esc(option.name)}</h4>
        <em class="fac-cat">${esc(option.categoryLabel)}</em>
      </div>
      <div class="fac-chain">
        ${option.inputs.length ? option.inputs.map(goodCell).join('')
    : '<span class="ind-good dim">no inputs</span>'}
        <i class="fac-arrow" aria-hidden="true">→</i>
        ${option.outputs.map(goodCell).join('')}
      </div>
      <div class="build-facts">
        <span><small>workers</small><b>${people(option.workers)}</b></span>
        <span><small>cost</small><b>£${Math.round(option.cost)}</b></span>
        <span><small>market</small><b class="${option.margin > 0 ? 'good' : 'bad'}">${esc(option.market)}</b></span>
        ${option.eraLabel ? `<span><small>invented</small><b>${esc(option.eraLabel)}</b></span>` : ''}
      </div>
      ${option.enabled
    ? `<button class="action build-go" data-factory="${esc(option.typeId)}"
        data-region="${esc(catalogue.region.id)}">Build £${Math.round(option.cost)}</button>`
    : `<span class="build-blocked">${esc(option.blocked)}</span>`}
    </article>`).join('');
  return `<div class="picker-overlay" data-picker-overlay="1">
    <div class="card build-catalogue">
      <div class="card-head">
        <h3>Build in ${esc(catalogue.region.name)}</h3>
        <small>treasury £${Math.round(catalogue.treasury)}</small>
        <button class="action" data-close-picker="1">Close</button>
      </div>
      <div class="ind-tabs">${tabs}</div>
      <div class="build-grid">${cards || '<p class="empty">Nothing to build in this category.</p>'}</div>
    </div>
  </div>`;
}

/* ==========================================================================
   ÇERÇEVE
   ========================================================================== */

/**
 * @param {object} view `industryOverview()` çıktısı
 * @param {object} state `{ selected, stateFilter, stateQuery, category, filter, menu, confirm }`
 * @param {object|null} catalogue `factoryBuildOptions()` çıktısı ya da null
 */
export function industryScreen(view, state, catalogue) {
  const confirmRow = state.confirm
    ? view.factories.find((row) => row.id === state.confirm) : null;
  return `<div class="ind">
    ${summaryStrip(view.summary)}
    <div class="ind-cols">
      ${stateColumn(view.states, state)}
      ${mainColumn(view, state)}
      ${railColumn(view)}
    </div>
    ${catalogue ? buildCatalogue(catalogue, state) : ''}
    ${confirmRow ? closeConfirm(confirmRow) : ''}
  </div>`;
}
