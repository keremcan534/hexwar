// Borsa ekranı: yüzyıl başı bir borsa bülteni.
//
// Yerleşim iki sütundur — solda kotasyon defteri (filtre şeridi + sıralanabilir
// tablo), sağda seçili şirketin dosyası. Boya diğer ekranlarla aynı: kömür
// siyahı yüzey, mat pirinç ayraç, bordo şerit başlık, kırık beyaz metin.
// Kart yığını, yuvarlak köşe, neon ve "portföyünüz bugün %2.3 arttı" yoktur;
// bu bir defterdir, bir uygulama değil.
//
// Bu dosya yalnız ÇİZER. Bütün sayılar game/companies.js'ten hazır gelir
// (exchangeRows / companyDossier); burada hiçbir toplam hesaplanmaz.

import { resourceGlyph } from './icons/index.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const money = (v) => {
  const a = Math.abs(v ?? 0);
  if (a >= 100000) return `${((v ?? 0) / 1000).toFixed(0)}k`;
  if (a >= 1000) return `${((v ?? 0) / 1000).toFixed(1)}k`;
  return (v ?? 0).toFixed(a >= 100 ? 0 : a >= 10 ? 1 : 2);
};
const pct = (v, digits = 1) => `${((v ?? 0) * 100).toFixed(digits)}%`;
const people = (v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v || 0)));

/** Eğilim oku. Eşik %1: haftalık gürültü ok göstermesin. */
function trendCell(trend) {
  if (trend > 0.01) return `<em class="t-up">▲ ${pct(trend, 0)}</em>`;
  if (trend < -0.01) return `<em class="t-down">▼ ${pct(-trend, 0)}</em>`;
  return '<em class="t-flat">—</em>';
}

/** Değer izi. Rastgelelik yok: çizgi gerçek defterin izidir. */
function valueSparkline(history) {
  if (!history || history.length < 3) return '';
  const max = Math.max(...history);
  const min = Math.min(...history);
  const span = Math.max(1e-6, max - min);
  const step = 100 / Math.max(1, history.length - 1);
  const points = history.map((v, i) => `${(i * step).toFixed(2)},${(28 - ((v - min) / span) * 26).toFixed(2)}`);
  const rising = history[history.length - 1] >= history[0];
  return `<svg class="xch-spark ${rising ? 'up' : 'down'}" viewBox="0 0 100 28"
      preserveAspectRatio="none" aria-hidden="true">
      <polyline class="spark-line" points="${points.join(' ')}"/>
    </svg>`;
}

export const EXCHANGE_FILTERS = {
  all: 'All listings',
  mine: 'My holdings',
  foreign: 'Foreign-held',
  profitable: 'Profitable',
  strategic: 'Strategic goods',
  home: 'Domestic',
};

/** Stratejik mal filtresi: ordunun ve ağır sanayinin dayandığı kalemler. */
export const STRATEGIC_GOODS = new Set([
  'iron', 'coal', 'oil', 'rubber', 'sulphur', 'steel', 'fuel',
  'ammunition', 'explosives', 'arms', 'tanks', 'airplane', 'tools',
]);

export const EXCHANGE_COLUMNS = [
  { id: 'name', label: 'Company', align: 'left' },
  { id: 'home', label: 'Home', align: 'left' },
  { id: 'sector', label: 'Sector', align: 'left' },
  { id: 'value', label: 'Market value', align: 'num' },
  { id: 'profit', label: 'Profit / wk', align: 'num' },
  { id: 'yield', label: 'Yield', align: 'num' },
  { id: 'foreign', label: 'Foreign', align: 'num' },
  { id: 'stake', label: 'Ours', align: 'num' },
  { id: 'employees', label: 'Employees', align: 'num' },
  { id: 'trend', label: 'Trend', align: 'num' },
];

const SORTERS = {
  name: (r) => r.name,
  home: (r) => r.homeName,
  sector: (r) => r.sectorName,
  value: (r) => r.value,
  profit: (r) => r.profit,
  yield: (r) => r.dividendYield,
  foreign: (r) => r.foreign,
  stake: (r) => r.stake,
  employees: (r) => r.employees,
  trend: (r) => r.trend,
};

export function filterRows(rows, state) {
  const filter = state.filter ?? 'all';
  const country = state.country ?? '';
  const sector = state.sector ?? '';
  let out = rows.filter((row) => !row.defunct || row.stake > 0);
  if (country) out = out.filter((row) => String(row.home) === String(country));
  if (sector) out = out.filter((row) => row.sector === sector);
  if (filter === 'mine') out = out.filter((row) => row.stake > 0);
  else if (filter === 'foreign') out = out.filter((row) => row.foreign > 0);
  else if (filter === 'profitable') out = out.filter((row) => row.profitAvg > 0);
  else if (filter === 'home') out = out.filter((row) => row.domestic);
  else if (filter === 'strategic') {
    out = out.filter((row) => row.goods.some((id) => STRATEGIC_GOODS.has(id)));
  }
  const key = SORTERS[state.sort ?? 'value'] ?? SORTERS.value;
  const dir = state.dir === 'asc' ? 1 : -1;
  return out.sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (typeof x === 'string') return dir * x.localeCompare(y) || a.id.localeCompare(b.id);
    return dir * (x - y) || a.id.localeCompare(b.id);
  });
}

function listingRow(row, selected) {
  const flags = [
    row.frozen ? '<span class="tag war">frozen</span>' : '',
    row.atWar && row.stake > 0 ? '' : '',
    row.defunct ? '<span class="tag truce">dormant</span>' : '',
    row.failing && !row.defunct ? '<span class="tag truce">losses</span>' : '',
  ].filter(Boolean).join('');
  return `<tr class="xch-row${selected ? ' selected' : ''}${row.domestic ? ' home' : ''}"
      data-company="${esc(row.id)}" tabindex="0">
    <td class="xch-name"><b>${esc(row.name)}</b>${flags}</td>
    <td>${esc(row.homeName)}</td>
    <td class="xch-sector">${esc(row.sectorName)}</td>
    <td class="num">¤${money(row.value)}</td>
    <td class="num ${row.profit >= 0 ? 't-up' : 't-down'}">${row.profit >= 0 ? '' : '−'}¤${money(Math.abs(row.profit))}</td>
    <td class="num">${row.dividendYield > 0 ? pct(row.dividendYield) : '—'}</td>
    <td class="num">${row.foreign > 0.0005 ? pct(row.foreign, 0) : '—'}</td>
    <td class="num${row.stake > 0 ? ' own' : ''}">${row.stake > 0.0005 ? pct(row.stake, 1) : '—'}</td>
    <td class="num">${people(row.employees)}</td>
    <td class="num">${trendCell(row.trend)}</td>
  </tr>`;
}

function ownershipBar(dossier) {
  const parts = [
    { cls: 'own-domestic', share: dossier.domesticHolders, label: `Domestic capital ${pct(dossier.domesticHolders, 0)}` },
    ...dossier.holders.map((h) => ({
      cls: h.you ? 'own-you' : h.id === dossier.home ? 'own-state' : 'own-foreign',
      share: h.share,
      label: `${h.name} ${pct(h.share, 1)}`,
    })),
  ].filter((p) => p.share > 0.0005);
  return `<div class="xch-ownbar" role="img" aria-label="Ownership structure">
      ${parts.map((p) => `<span class="${p.cls}" style="flex:${p.share.toFixed(5)}"
        title="${esc(p.label)}"></span>`).join('')}
    </div>
    <ul class="xch-owners">
      <li><span class="key own-domestic"></span>Domestic capitalists<b>${pct(dossier.domesticHolders, 1)}</b></li>
      ${dossier.holders.map((h) => `<li${h.you ? ' class="you"' : ''}>
        <span class="key ${h.you ? 'own-you' : h.id === dossier.home ? 'own-state' : 'own-foreign'}"></span>
        ${esc(h.name)}${h.id === dossier.home ? ' (state)' : ''}${h.you ? ' — us' : ''}
        ${h.frozen ? '<em class="t-down">frozen</em>' : ''}<b>${pct(h.share, 1)}</b></li>`).join('')}
    </ul>`;
}

function dealPanel(dossier) {
  if (dossier.atWar) {
    return `<p class="xch-note war">We are at war with ${esc(dossier.homeName)}.
      No shares may be bought or sold, dividends are withheld and preferential
      access is suspended. The position itself is not confiscated.</p>`;
  }
  const lines = [];
  if (dossier.isHome) {
    lines.push(`<p class="xch-note">A domestic company. Foreign capital may hold up to
      <b>${pct(dossier.cap, 0)}</b> of it (${esc(dossier.openness.name.toLowerCase())} regime).</p>`);
  } else {
    lines.push(`<p class="xch-note">Foreign ownership ceiling in ${esc(dossier.homeName)}'s
      ${esc(dossier.sectorName.toLowerCase())}: <b>${pct(dossier.cap, 0)}</b>
      (${esc(dossier.openness.name.toLowerCase())}). Currently held abroad:
      <b>${pct(dossier.foreign, 1)}</b>.</p>`);
  }
  const buyable = dossier.room;
  const buys = [0.01, 0.03, 0.05]
    .filter((share) => share <= buyable + 1e-9)
    .map((share) => ({ share, cost: dossier.unitPrice * share * 100 }));
  const affordable = buys.filter((b) => b.cost <= dossier.treasury);
  // Neden alamiyoruz? Tek bir cumleyle SOYLE. Dort ayri kapi baglayabilir
  // (tavan, savas, haftalik sinir, hazine) ve sessizce olu duran bir dugme
  // oyuncuya hicbirini ogretmez.
  const blocker = buyable < 0.005
    ? (dossier.cap <= 0
      ? `${esc(dossier.homeName)} is closed to foreign capital.`
      : dossier.foreign >= dossier.cap - 1e-9
        ? `Foreign investors already hold the legal maximum of ${pct(dossier.cap, 0)}.`
        : 'No shares are on offer this week; the founding block does not sell.')
    : !affordable.length
      ? `The treasury holds ¤${money(dossier.treasury)} — the smallest parcel costs ¤${money(buys[0].cost)}.`
      : null;
  lines.push(`<div class="xch-deal">
    <div class="xch-deal-head">
      <span><small>free float</small><b>${pct(dossier.float, 1)}</b></span>
      <span><small>available to us</small><b>${pct(buyable, 1)}</b></span>
      <span><small>price per 1%</small><b>¤${money(dossier.unitPrice)}</b></span>
    </div>
    <div class="xch-deal-row">
      ${affordable.map((b) => `<button data-buy-share="${b.share}"
        data-company="${esc(dossier.id)}">Buy ${pct(b.share, 0)}
        <small>¤${money(b.cost)}</small></button>`).join('')}
      ${dossier.stake > 0.0005 ? `<button class="ghost" data-sell-share="0.01"
        data-company="${esc(dossier.id)}">Sell 1%
        <small>¤${money(dossier.unitPrice * 0.01 * 100 * 0.96)}</small></button>` : ''}
      ${blocker ? `<span class="xch-blocked">${blocker}</span>` : ''}
    </div>
    ${dossier.stake > 0.0005 && dossier.sellerPool < dossier.unitPrice
    ? `<p class="xch-fine">Domestic capital in ${esc(dossier.homeName)} holds only
      ¤${money(dossier.sellerPool)} — a sale would clear only in part.</p>` : ''}
    <p class="xch-fine">Purchases are limited to ${pct(0.05, 0)} of a company per week and
      settle against domestic capital; a large order moves the price against us.</p>
  </div>`);
  if (dossier.seizable) {
    lines.push(`<div class="xch-seize">
      <h4>Nationalisation</h4>
      <p class="xch-fine">Foreign investors hold <b>${pct(dossier.foreign, 1)}</b> of this
        company. The treasury may take that stake. Paying nothing costs us standing
        abroad for decades.</p>
      <div class="xch-deal-row">
        <button data-seize="compensated" data-company="${esc(dossier.id)}">Buy out
          <small>full value</small></button>
        <button data-seize="partial" data-company="${esc(dossier.id)}">Part-pay
          <small>40%</small></button>
        <button class="danger" data-seize="seizure" data-company="${esc(dossier.id)}">Seize
          <small>no payment</small></button>
      </div>
    </div>`);
  }
  return lines.join('');
}

function dossierPanel(dossier) {
  if (!dossier) {
    return '<p class="empty">Select a listing to open its file.</p>';
  }
  const access = dossier.outputs.filter((o) => o.access > 0);
  return `<div class="xch-file">
    <header class="xch-file-head">
      <div>
        <h3>${esc(dossier.name)}</h3>
        <p class="xch-sub">${esc(dossier.sectorName)} · ${esc(dossier.homeName)}
          ${dossier.defunct ? ' · <em class="t-down">no operating assets</em>' : ''}</p>
      </div>
      <div class="xch-quote">
        <b>¤${money(dossier.value)}</b>
        <small>market value</small>
        ${valueSparkline(dossier.history)}
      </div>
    </header>

    <div class="xch-kv">
      <span><small>profit / week</small><b class="${dossier.profit >= 0 ? 't-up' : 't-down'}">${dossier.profit >= 0 ? '' : '−'}¤${money(Math.abs(dossier.profit))}</b></span>
      <span><small>margin</small><b>${pct(dossier.margin, 1)}</b></span>
      <span><small>dividend / week</small><b>¤${money(dossier.dividend)}</b></span>
      <span><small>yield</small><b>${dossier.dividendYield > 0 ? pct(dossier.dividendYield) : '—'}</b></span>
      <span><small>employees</small><b>${people(dossier.employees)}</b></span>
      <span><small>retained cash</small><b>¤${money(dossier.cash)}</b></span>
    </div>

    <section class="xch-block">
      <h4>Our position</h4>
      ${dossier.stake > 0.0005 ? `<p class="xch-line">We hold <b>${pct(dossier.stake, 1)}</b>,
        worth <b>¤${money(dossier.value * dossier.stake)}</b>, paying
        <b>¤${money(dossier.yourDividend)}</b> a week${dossier.frozen ? ' — <em class="t-down">frozen by war</em>' : ''}.</p>`
    : '<p class="xch-line dim">We hold no shares in this company.</p>'}
      ${access.length ? `<p class="xch-line">Preferential purchase access:
        ${access.map((o) => `<b>${esc(o.id.replace(/_/g, ' '))}</b> +${pct(o.access, 0)} priority`).join(', ')}.
        <span class="xch-fine">Priority in the queue only — the goods are still bought at
        the market price.</span></p>` : ''}
    </section>

    <section class="xch-block">
      <h4>Ownership</h4>
      ${ownershipBar(dossier)}
    </section>

    <section class="xch-block">
      <h4>What it produces</h4>
      ${dossier.outputs.length ? `<ul class="xch-goods">
        ${dossier.outputs.map((o) => `<li>${resourceGlyph(o.id, 16)}
          <span>${esc(o.id.replace(/_/g, ' '))}</span>
          <b>${o.qty.toFixed(2)}/wk</b><em>¤${money(o.value)}</em></li>`).join('')}
      </ul>` : '<p class="xch-line dim">Nothing is leaving its gates this week.</p>'}
      ${dossier.threat && dossier.threat.share < 0.95 ? `<p class="xch-line warn">
        Input at risk: <b>${esc(dossier.threat.goodId.replace(/_/g, ' '))}</b> is only
        ${pct(dossier.threat.share, 0)} supplied.</p>` : ''}
    </section>

    <section class="xch-block">
      <h4>Where it operates</h4>
      ${dossier.sites.length ? `<ul class="xch-sites">
        ${dossier.sites.map((site) => `<li><b>${esc(site.name)}</b>
          <span>${esc(site.detail)}</span></li>`).join('')}
      </ul>` : '<p class="xch-line dim">No operating sites.</p>'}
      ${dossier.lastInvestment ? `<p class="xch-line">Latest investment:
        a ${esc(String(dossier.lastInvestment.typeId).replace(/_/g, ' ').toLowerCase())}
        in ${esc(dossier.lastInvestment.regionName ?? 'the interior')}.</p>` : ''}
      ${dossier.lastSeizure ? `<p class="xch-line warn">Nationalised
        ${pct(dossier.lastSeizure.share, 1)} of foreign holdings
        (${esc(dossier.lastSeizure.mode)}), paying ¤${money(dossier.lastSeizure.paid)}.</p>` : ''}
    </section>

    <section class="xch-block">
      ${dealPanel(dossier)}
    </section>
  </div>`;
}

/**
 * Ekranın tamamı.
 * @param {object} view `{ rows, portfolio, presence, countries, sectors, dossier }`
 * @param {object} state `{ filter, country, sector, sort, dir, selected }`
 */
export function exchangeScreen(view, state) {
  const rows = filterRows(view.rows, state);
  const sort = state.sort ?? 'value';
  const dir = state.dir === 'asc' ? 'asc' : 'desc';
  const head = EXCHANGE_COLUMNS.map((col) => `<th class="${col.align === 'num' ? 'num' : ''}${sort === col.id ? ` sorted ${dir}` : ''}"
      data-sort="${col.id}" title="Sort by ${esc(col.label)}">${esc(col.label)}</th>`).join('');
  return `<div class="exchange">
    <header class="xch-head">
      <div class="xch-title">
        <span>GLOBAL EXCHANGE</span>
        <h3>Quotations &amp; Holdings</h3>
      </div>
      <div class="xch-summary">
        <span><small>portfolio abroad</small><b>¤${money(view.portfolio.value)}</b></span>
        <span><small>dividends / week</small><b>¤${money(view.portfolio.dividend)}</b></span>
        <span><small>positions</small><b>${view.portfolio.stakes}${view.portfolio.frozen ? ` <em class="t-down">(${view.portfolio.frozen} frozen)</em>` : ''}</b></span>
        <span><small>foreign share of our industry</small><b>${pct(view.presence.share, 1)}</b></span>
        <span><small>our investment regime</small><b>${esc(view.openness.name)}</b></span>
      </div>
    </header>

    <div class="xch-filters">
      ${Object.entries(EXCHANGE_FILTERS).map(([id, label]) => `<button
        class="chip${(state.filter ?? 'all') === id ? ' active' : ''}"
        data-filter="${id}">${esc(label)}</button>`).join('')}
      <select data-country aria-label="Filter by country">
        <option value="">Every country</option>
        ${view.countries.map((c) => `<option value="${c.id}"${String(state.country) === String(c.id) ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select>
      <select data-sector aria-label="Filter by sector">
        <option value="">Every sector</option>
        ${view.sectors.map((s) => `<option value="${esc(s.id)}"${state.sector === s.id ? ' selected' : ''}>${esc(s.name)}</option>`).join('')}
      </select>
    </div>

    <div class="xch-body">
      <div class="xch-list">
        ${rows.length ? `<table class="data-table xch-table">
          <thead><tr>${head}</tr></thead>
          <tbody>${rows.map((row) => listingRow(row, row.id === state.selected)).join('')}</tbody>
        </table>` : '<p class="empty">No listing matches this filter.</p>'}
      </div>
      <aside class="xch-dossier">${dossierPanel(view.dossier)}</aside>
    </div>
  </div>`;
}
