// Trade ekranı: imparatorluk ticaret dairesinin defteri.
//
// Yerleşim Victoria 2'nin Trade penceresini izler — üstte ulusal künye, solda
// kategori kategori mal kataloğu, sağda seçili malın dosyası, altta ticaret
// yapısı şeridi — boya bizim: kömür siyahı yüzey, mat pirinç ayraç, bordo
// şerit başlık (bkz. styles.css §19).
//
// Bu dosya yalnız ÇİZER. Bütün sayılar game/tradeLedger.js'ten hazır gelir;
// burada hiçbir toplam hesaplanmaz. Mal simgeleri resourceGlyph'ten (boyalı
// madalyon ya da çizgi-SVG) — emoji değil.

import { resourceGlyph } from './icons/index.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/** Victoria 2'nin mal blokları. GOODS[].category ile eşleşir. */
export const GOOD_CATEGORIES = {
  raw: 'Raw Materials',
  industrial: 'Industrial Goods',
  consumer: 'Consumer Goods',
  luxury: 'Luxury Goods',
  military: 'Military Goods',
};

/** Miktar: büyüdükçe ondalık atar; defter sütunları hizalı kalsın. */
const qty = (value) => {
  const v = Math.abs(value ?? 0);
  return (value ?? 0).toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2);
};

/** Haftalık eğilim oku. Eşik 0.005: gürültü ok göstermesin. */
function trendArrow(trend) {
  if (trend > 0.005) return '<em class="t-up">▲</em>';
  if (trend < -0.005) return '<em class="t-down">▼</em>';
  return '<em class="t-flat">—</em>';
}

/* --------------------------------------------------------------------------
   FİYAT GRAFİĞİ — eski priceChart'ın soyu; taban fiyat kesikli referans.
   -------------------------------------------------------------------------- */
export function priceSparkline(history, base) {
  if (!history || history.length < 2) {
    return '<p class="trade-empty">Price history builds up as weeks pass.</p>';
  }
  const max = Math.max(base, ...history);
  const min = Math.min(base, ...history);
  const span = Math.max(1e-6, max - min);
  const w = 236;
  const h = 44;
  const x = (i) => (i / (history.length - 1)) * w;
  const y = (value) => h - ((value - min) / span) * h;
  const line = history.map((value, index) => `${index ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(' ');
  const rising = history[history.length - 1] >= history[0];
  return `<svg class="trade-spark ${rising ? 'up' : 'down'}" viewBox="0 0 ${w} ${h}"
      role="img" aria-label="Price over the last ${history.length} weeks">
      <line class="spark-base" x1="0" x2="${w}" y1="${y(base).toFixed(1)}" y2="${y(base).toFixed(1)}"></line>
      <path class="spark-area" d="${line} L${w},${h} L0,${h} Z"></path>
      <path class="spark-line" d="${line}"></path>
    </svg>
    <div class="trade-spark-foot"><small>last ${history.length} weeks</small><small>base £${base}</small></div>`;
}

/* --------------------------------------------------------------------------
   KATALOG — kategori blokları ve mal karoları
   -------------------------------------------------------------------------- */

/**
 * Tek mal karosu.
 *
 * Eskiden karoda dört sey vardi: ad, fiyat, karsilanma cubugu ve icinde sayi
 * gecen bir durum satiri. Kirk iki malin hepsinde dort sey okumak katalogu
 * taranamaz yapiyordu. Simdi ikisi: ROZET (ne durumda) ve DUZ CUMLE (neden).
 * Sayilar sag panelde, secilen malin dosyasinda duruyor — katalog tarama,
 * dosya inceleme icindir.
 */
const BADGE = {
  severe: 'Shortage', short: 'Shortage', export: 'Surplus',
  surplus: 'Surplus', balanced: 'Stable', idle: 'Idle',
};

export function goodTile(row, selected) {
  return `<button class="trade-good st-${row.status.id}${selected ? ' selected' : ''}"
    data-trade-good="${row.id}"
    title="${esc(row.name)} — made ${qty(row.flow.production)} · needs ${qty(row.flow.demand)} · in ${qty(row.flow.imports)} · out ${qty(row.flow.exports)}">
    <i class="tg-glyph">${resourceGlyph(row.id)}</i>
    <span class="tg-body">
      <span class="tg-row">
        <span class="tg-name">${esc(row.name)}</span>
        <span class="tg-price">£${row.price.toFixed(2)}${trendArrow(row.trend)}</span>
      </span>
      <span class="tg-row">
        <span class="tg-badge">${esc(BADGE[row.status.id] ?? row.status.label)}</span>
        <small class="tg-reason">${esc(row.reason ?? '')}</small>
      </span>
    </span>
  </button>`;
}

/** Katalog suzgecleri. Kategori bloklari duruyor; suzgec onlari daraltir. */
export const TRADE_FILTERS = {
  all: { id: 'all', label: 'All goods', test: () => true },
  shortage: {
    id: 'shortage',
    label: 'Shortages',
    test: (row) => row.status.id === 'severe' || row.status.id === 'short',
  },
  imported: {
    id: 'imported', label: 'Import dependent', test: (row) => (row.importShare ?? 0) > 0.35,
  },
  surplus: {
    id: 'surplus',
    label: 'Surplus',
    test: (row) => row.status.id === 'surplus' || row.status.id === 'export',
  },
  military: { id: 'military', label: 'Military', test: (row) => row.category === 'military' },
};

export function tradeFilterBar(activeId) {
  return `<div class="trade-filters">${Object.values(TRADE_FILTERS).map((filter) => `
    <button class="trade-filter${filter.id === activeId ? ' on' : ''}"
      data-trade-filter="${filter.id}">${esc(filter.label)}</button>`).join('')}</div>`;
}

export function goodsCatalog(rows, selectedId, filterId = 'all') {
  const filter = TRADE_FILTERS[filterId] ?? TRADE_FILTERS.all;
  const kept = rows.filter((row) => filter.test(row));
  if (!kept.length) return '<p class="trade-empty">No goods match this filter.</p>';
  return Object.entries(GOOD_CATEGORIES).map(([categoryId, title]) => {
    const inCategory = kept.filter((row) => row.category === categoryId);
    if (!inCategory.length) return '';
    return `<section class="trade-cat">
      <h4>${esc(title)}<em>${inCategory.length} goods</em></h4>
      <div class="trade-cat-grid">${
  inCategory.map((row) => goodTile(row, row.id === selectedId)).join('')}</div>
    </section>`;
  }).join('');
}

/* --------------------------------------------------------------------------
   SAĞ PANEL — seçili malın dosyası
   -------------------------------------------------------------------------- */

const strip = (title, note = '') => `<h4 class="trade-h4">${esc(title)}${
  note ? `<em>${esc(note)}</em>` : ''}</h4>`;

/** İki sütunlu künye satırı. */
const kv = (label, value, cls = '') => `<div class="trade-kv${cls ? ` ${cls}` : ''}">
  <span>${esc(label)}</span><b>${value}</b></div>`;

/** Adlı akış satırı: ad + oranlı çubuk + miktar. */
function flowRows(list, unitNote) {
  if (!list.length) return `<p class="trade-empty">${esc(unitNote)}</p>`;
  const max = Math.max(...list.map((entry) => entry.amount));
  return list.map((entry) => `<div class="trade-flow-row" title="${esc(entry.note ?? '')}">
    <span class="tf-name">${esc(entry.name)}</span>
    <span class="tf-bar"><i style="width:${((entry.amount / max) * 100).toFixed(1)}%"></i></span>
    <b class="tf-qty">${qty(entry.amount)}</b>
  </div>`).join('');
}

/** Talebin kaynağı: devlet / fabrika / nüfus / diğer kovaları. */
function needsBreakdown(consumers, demand) {
  const groups = { government: 0, factories: 0, population: 0, other: 0 };
  for (const entry of consumers) groups[entry.group ?? 'other'] += entry.amount;
  const labels = {
    government: 'Government', factories: 'Factories', population: 'Population', other: 'Other',
  };
  const total = Math.max(0.001, demand);
  return Object.entries(groups)
    .filter(([, amount]) => amount > 0.001)
    .map(([groupId, amount]) => `<div class="trade-flow-row">
      <span class="tf-name">${labels[groupId]}</span>
      <span class="tf-bar dim"><i style="width:${Math.min(100, (amount / total) * 100).toFixed(1)}%"></i></span>
      <b class="tf-qty">${qty(amount)}</b>
    </div>`).join('') || '<p class="trade-empty">No domestic demand this week.</p>';
}

export function goodDossierPanel(dossier) {
  const { row, tariffView, stockpile } = dossier;
  const flow = row.flow;
  const net = (flow.exports ?? 0) - (flow.imports ?? 0);
  const coverage = row.coverage != null ? `${Math.round(row.coverage * 100)}%` : '—';
  const trend36 = row.trend36 != null
    ? `<em class="${row.trend36 > 0.005 ? 't-up' : row.trend36 < -0.005 ? 't-down' : 't-flat'}">${
      row.trend36 >= 0 ? '▲' : '▼'} ${Math.abs(row.trend36 * 100).toFixed(1)}%</em>`
    : '<em class="t-flat">—</em>';

  const reasons = dossier.reasons.map((reason) => `<li class="tone-${reason.tone}">${esc(reason.text)}</li>`).join('');

  const boardRows = dossier.board.map((entry, index) => `<div class="trade-flow-row">
    <span class="tf-name">${index + 1}. ${esc(entry.nation.name)}</span>
    <span class="tf-bar dim"><i style="width:${((entry.production / dossier.board[0].production) * 100).toFixed(1)}%"></i></span>
    <b class="tf-qty">${qty(entry.production)}</b>
  </div>`).join('');

  // Stok yalnız askeri mallarda gerçek; sivil malda dürüst bir not durur.
  const stockBlock = stockpile
    ? `${kv('In arsenal', `${qty(stockpile.stock)} / ${stockpile.cap}`)}
       ${kv('Reserve target', qty(stockpile.reserve))}
       ${kv('Retained this week', `+${qty(stockpile.produced)}`, 'pos')}
       ${kv('Imported this week', `+${qty(stockpile.imported)}`, stockpile.imported > 0 ? 'pos' : '')}
       ${stockpile.used != null ? kv('Used by reinforcement', `−${qty(stockpile.used)}`, stockpile.used > 0 ? 'neg' : '') : ''}`
    : '<p class="trade-empty">No state stockpile — civilian goods clear on the weekly market.</p>';

  // Dort kapali dugmelik "rezerve kabuk" kaldirildi: iki beta boyunca hicbir
  // sey yapamayan kontroller "olmayan dugme koymayiz" ilkesini ihlal ediyordu.
  // Mal bazli politika gercekten kurulursa dugmeleriyle birlikte geri gelir.
  const policy = `<p class="trade-policy-note">Trade clears automatically on the
    weekly world market; there is no per-good order to place.</p>`;

  return `<aside class="trade-detail">
    <header class="trade-detail-head">
      <i class="tg-glyph">${resourceGlyph(row.id)}</i>
      <div class="tdh-name"><b>${esc(row.name)}</b><small>${esc(GOOD_CATEGORIES[row.category] ?? row.category)}</small></div>
      <div class="tdh-price"><b>£${row.price.toFixed(2)}</b><small>${(row.price / row.base).toFixed(2)}× base ${trend36}</small></div>
    </header>
    ${priceSparkline(dossier.history, row.base)}

    ${strip('Domestic market', 'weekly')}
    <div class="trade-kv-grid">
      ${kv('Produced', qty(flow.production))}
      ${kv('Demand', qty(flow.demand))}
      ${kv('Imported', qty(flow.imports), flow.imports > 0.05 ? 'neg' : '')}
      ${kv('Exported', qty(flow.exports), flow.exports > 0.05 ? 'pos' : '')}
      ${kv('Unmet demand', qty(flow.shortage), (flow.shortage ?? 0) > 0.05 ? 'neg' : '')}
      ${kv('Coverage', coverage, row.status.id === 'severe' || row.status.id === 'short' ? 'neg' : '')}
    </div>

    ${strip('Why the price moves')}
    <ul class="trade-why">${reasons}</ul>

    <div class="trade-two-col">
      <section>${strip('Main producers', 'domestic')}
        <div class="trade-flow-list">${flowRows(dossier.producers, 'Nothing produced at home.')}</div></section>
      <section>${strip('Main consumers', 'domestic')}
        <div class="trade-flow-list">${flowRows(dossier.consumers, 'No domestic buyers this week.')}</div></section>
    </div>

    <details class="trade-deeper">
      <summary>Deeper figures</summary>

    ${strip('Demand by source')}
    <div class="trade-flow-list">${needsBreakdown(dossier.consumers, flow.demand ?? 0)}</div>

    ${strip('Tariff at the border')}
    <div class="trade-kv-grid">
      ${kv('World price', `£${tariffView.worldPrice.toFixed(2)}`)}
      ${kv('Tariff rate', `${tariffView.tariff}%`)}
      ${kv('On imported share', `${Math.round(tariffView.importShare * 100)}% of demand`)}
      ${kv('Tariff adds', `+£${tariffView.tariffAdd.toFixed(2)}`, tariffView.tariffAdd > 0.01 ? 'neg' : '')}
      ${kv('Cost at home', `£${tariffView.domesticPrice.toFixed(2)}`)}
      ${kv('Import appetite', `${Math.round(tariffView.appetite * 100)}%`)}
    </div>

    ${strip('State stockpile')}
    <div class="trade-kv-grid">${stockBlock}</div>

    ${strip('World market')}
    <div class="trade-kv-grid">
      ${kv('World supply', qty(dossier.world.supply))}
      ${kv('World demand', qty(dossier.world.demand))}
      ${kv('Traded', qty(dossier.world.traded))}
      ${kv('Your rank', dossier.myRank ? `${dossier.myRank} / ${dossier.boardSize}` : '—')}
      ${kv('Your share', dossier.myShare != null ? `${(dossier.myShare * 100).toFixed(1)}%` : '—')}
    </div>
    <div class="trade-flow-list">${boardRows || '<p class="trade-empty">Nobody produces this yet.</p>'}</div>

    ${strip('Trade policy')}
    ${policy}
    </details>
  </aside>`;
}

/* --------------------------------------------------------------------------
   ÜST KÜNYE ve ALT ŞERİT
   -------------------------------------------------------------------------- */

export function tradeSummaryBar(summary) {
  // BES HUCRE. Eskiden sekiz kucuk cip vardi ve hicbiri one cikmiyordu; sekiz
  // esit agirlikli sayi, sifir sayi demektir. Kalanlar (dunya ticareti, tarife
  // orani, en yuksek baski) alt seritteki ulusal ozette zaten duruyor.
  const cell = (label, value, cls = '') => `<span class="trade-total${cls ? ` ${cls}` : ''}">
    <small>${esc(label)}</small><b>${value}</b></span>`;
  const balance = summary.balance;
  return `<div class="trade-totals">
    ${cell('Trade balance', `${balance >= 0 ? '+' : ''}£${balance.toFixed(1)}`, balance >= 0 ? 'pos' : 'neg')}
    ${cell('Imports', `£${summary.importValue.toFixed(1)}`)}
    ${cell('Exports', `£${summary.exportValue.toFixed(1)}`)}
    ${cell('Tariff income', `£${summary.tariffRevenue.toFixed(1)}`)}
    ${cell('Critical shortages', String(summary.shortages), summary.shortages ? 'neg' : '')}
    ${summary.awaiting ? '<span class="trade-await">market clears on the next weekly tick</span>' : ''}
  </div>`;
}

function structureList(title, rows, kind) {
  const body = rows.length
    ? rows.map((row) => `<div class="trade-flow-row">
        <span class="tf-name">${esc(row.name)}</span>
        <b class="tf-qty">£${row[kind].toFixed(1)}</b>
      </div>`).join('')
    : '<p class="trade-empty">none</p>';
  return `<section class="trade-struct-block">${strip(title, 'weekly value')}${body}</section>`;
}

export function tradeStructureStrip(structure) {
  // UC BLOK. Ulusal ozet buradan alinip secili malin dosyasinin dibine
  // tasindi: serit dort esit kutuya bolununce hicbiri okunmuyordu ve ozet,
  // mala degil ULKEYE ait oldugu icin dosyanin sonunda daha dogru duruyor.
  const dep = (label, value) => `<div class="trade-flow-row">
    <span class="tf-name">${esc(label)}</span>
    <span class="tf-bar dim"><i style="width:${value != null ? (value * 100).toFixed(0) : 0}%"></i></span>
    <b class="tf-qty">${value != null ? `${Math.round(value * 100)}%` : '—'}</b>
  </div>`;
  return `<div class="trade-structure">
    ${structureList('Top imports', structure.topImports, 'importValue')}
    ${structureList('Top exports', structure.topExports, 'exportValue')}
    <section class="trade-struct-block">${strip('Trade dependency', 'imported share of demand')}
      ${dep('Factory inputs', structure.dependency.inputs)}
      ${dep('Food supply', structure.dependency.food)}
      ${dep('Military goods', structure.dependency.military)}
    </section>
  </div>`;
}

/** Ulusal ozet: mala degil ulkeye ait; secili malin dosyasinin dibinde durur. */
export function tradeNationalSummary(summary) {
  return `<section class="trade-national">${strip('National summary')}
    <div class="trade-kv-grid">
      ${kv('Imports', `£${summary.importValue.toFixed(1)}`)}
      ${kv('Exports', `£${summary.exportValue.toFixed(1)}`)}
      ${kv('Balance', `${summary.balance >= 0 ? '+' : ''}£${summary.balance.toFixed(1)}`, summary.balance >= 0 ? 'pos' : 'neg')}
      ${kv('Critical shortages', String(summary.shortages), summary.shortages ? 'neg' : '')}
      ${kv('Export surpluses', String(summary.exportables), summary.exportables ? 'pos' : '')}
      ${kv('Tariff income', `£${summary.tariffRevenue.toFixed(1)}`)}
    </div>
  </section>`;
}

/* --------------------------------------------------------------------------
   ÇERÇEVE
   -------------------------------------------------------------------------- */

export function tradeScreen(data, selectedId, filterId = 'all') {
  return `<div class="trade">
    ${tradeSummaryBar(data.summary)}
    ${tradeFilterBar(filterId)}
    <div class="trade-main">
      <div class="trade-goods-scroll">${goodsCatalog(data.rows, selectedId, filterId)}</div>
      <div class="trade-side">
        ${goodDossierPanel(data.dossier)}
        ${tradeNationalSummary(data.summary)}
      </div>
    </div>
    ${tradeStructureStrip(data.structure)}
  </div>`;
}
