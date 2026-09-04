// Nüfus ekranı: bir teşhis panosu.
//
// Ekran şu yedi soruyu birkaç saniyede cevaplamak zorundadır: kaç kişiyim,
// büyüyor muyum, halk çalışıyor mu, ihtiyacı karşılanıyor mu, okuyor mu,
// huzursuz mu, nereye bakmalıyım. Eski ekran bunların hiçbirini cevaplamıyor,
// altı pasta ve yirmi sütunluk bir tablo gösteriyordu.
//
// Yerleşim sabittir:
//   SOL     state/province gezgini — "nereye bakayım?"
//   ÜST     altı sağlık kartı + dikkat şeridi
//   ORTA    sekmeli toplumsal çözümleme
//   ALT     grup tablosu
//   SAĞ     seçili grubun dosyası
//
// Bu dosya YALNIZ ÇİZER. Bütün sayılar `game/populationView.js`ten hazır
// gelir; burada hiçbir eşik, oran ya da "neden mutsuz" cümlesi hesaplanmaz.

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const people = (v) => {
  const n = Math.round(v ?? 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return String(n);
};
const pct = (v, digits = 0) => (v == null ? '—' : `${(v * 100).toFixed(digits)}%`);
/** Yüzde PUANI değişimi. Oran değişimiyle karıştırılmasın diye ayrı biçim. */
const pp = (v, digits = 1) => (v == null ? '—'
  : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(digits)} pp`);
const arrow = (v) => (v == null ? '' : v > 0.0001 ? 'up' : v < -0.0001 ? 'down' : 'flat');

export const POP_TABS = {
  overview: 'Overview',
  classes: 'Classes',
  culture: 'Culture',
  religion: 'Religion',
  politics: 'Politics',
  states: 'States',
  // "Cohorts" sekmesi kaldirildi: bos bir orta panel cizip alttaki grup
  // tablosunu tekrar ediyordu (Open Beta 4). Gruplar zaten her sekmenin altinda.
};

/* ==========================================================================
   PASTA — konik gradyan; grafik kütüphanesi yok
   ========================================================================== */

const SEAM = '#0a0f12';
const PALETTE = [
  '#8a9a6b', '#a8894f', '#7d6a92', '#5f8a8a', '#a86b5f', '#6b7f9a', '#948a6b',
];
const colorAt = (index) => PALETTE[index % PALETTE.length];

export function donut(slices, { size = 92, hole = 58 } = {}) {
  const usable = slices.filter((slice) => slice.share > 0.0005);
  if (!usable.length) {
    return `<i class="pop-donut empty" style="--donut:${size}px" aria-hidden="true"></i>`;
  }
  const stops = [];
  let at = 0;
  usable.forEach((slice, index) => {
    const from = at * 100;
    const to = Math.min(100, (at + slice.share) * 100);
    if (usable.length > 1) stops.push(`${SEAM} ${from.toFixed(3)}% ${(from + 0.5).toFixed(3)}%`);
    stops.push(`${colorAt(index)} ${(from + (usable.length > 1 ? 0.5 : 0)).toFixed(3)}% ${to.toFixed(3)}%`);
    at += slice.share;
  });
  return `<i class="pop-donut" style="--donut:${size}px;--hole:${hole}%;
    background:conic-gradient(from -90deg, ${stops.join(', ')})" aria-hidden="true"></i>`;
}

export function legend(slices) {
  return slices.filter((slice) => slice.share > 0.0005).map((slice, index) => `
    <span class="pop-legend-row">
      <i style="background:${colorAt(index)}"></i>
      <em>${esc(slice.name)}</em>
      <b>${(slice.share * 100).toFixed(1)}%</b>
    </span>`).join('') || '<span class="pop-legend-row empty"><em>no returns</em></span>';
}

/** Yığılmış tek çubuk: pastadan daha okunur olduğu yerde (sınıf dağılımı). */
function stackedBar(slices) {
  const usable = slices.filter((slice) => slice.share > 0.0005);
  return `<span class="pop-stack">${usable.map((slice, index) => `
    <i style="width:${(slice.share * 100).toFixed(2)}%;background:${colorAt(index)}"
      title="${esc(slice.name)} ${(slice.share * 100).toFixed(1)}%"></i>`).join('')}</span>`;
}

/** Etiketli yatay ölçek. Tooltip'siz okunur olmak zorunda. */
function meter(label, value, text) {
  const width = Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100);
  return `<div class="pop-meter">
    <span class="pop-meter-label">${esc(label)}</span>
    <b>${text}</b>
    <i><i style="width:${width}%"></i></i>
  </div>`;
}

/** 12 aylık iz. Örnek yoksa çizilmez — uydurma eğri yok. */
function sparkline(samples, { width = 260, height = 74 } = {}) {
  if (!samples || samples.length < 3) {
    return '<p class="empty">No history yet — the first year is still being recorded.</p>';
  }
  const max = Math.max(...samples);
  const min = Math.min(...samples);
  const span = Math.max(1e-9, max - min);
  const step = width / Math.max(1, samples.length - 1);
  const points = samples.map((value, index) => `${(index * step).toFixed(1)},${(height - ((value - min) / span) * (height - 8) - 4).toFixed(1)}`);
  const rising = samples[samples.length - 1] >= samples[0];
  return `<svg class="pop-spark ${rising ? 'up' : 'down'}" viewBox="0 0 ${width} ${height}"
      preserveAspectRatio="none" aria-hidden="true">
      <polyline points="${points.join(' ')}"/>
    </svg>`;
}

/* ==========================================================================
   ÜST — altı sağlık kartı
   ========================================================================== */

function healthCards(summary) {
  // Her kartin ustunde NE oldugu ve NEYIN oynattigi yazar; rakam tek basina
  // "buna ne yapmaliyim" sorusunu cevaplamiyordu (Open Beta 4 nufus kesfi).
  const card = (label, value, note, noteTone = '', tip = '') => `
    <div class="pop-card" ${tip ? `title="${esc(tip)}"` : ''}>
      <small>${esc(label)}</small>
      <b>${value}</b>
      <em class="${noteTone}">${note}</em>
    </div>`;
  const growthNote = summary.growth == null
    ? 'no history yet'
    : `${summary.monthlyPeople >= 0 ? '+' : '−'}${people(Math.abs(summary.monthlyPeople))} / month`;
  return `<header class="pop-cards">
    ${card('Total population', people(summary.total), growthNote, arrow(summary.growth),
    'Everyone living in your provinces. The note is the change over the last month.')}
    ${card('Growth', summary.growth == null ? '—' : `${summary.growth >= 0 ? '+' : '−'}${Math.abs(summary.growth * 100).toFixed(2)}%`,
    'per month', arrow(summary.growth),
    'Monthly change of the whole population. Needs met, health care and war move it.')}
    ${card('Employment', pct(summary.employment),
    summary.unemployed > 0 ? `${people(summary.unemployed)} unemployed` : 'everyone in work',
    summary.unemployed > 0 ? 'down' : 'up',
    'Share of working people with a job. Idle hands mean too few factories or fields — build, or let capital build.')}
    ${card('Needs met', pct(summary.needs), pp(summary.needsChange), arrow(summary.needsChange),
    'How much of what your people want they can afford at current prices. Falling needs breed unrest; the note is the change over the last year.')}
    ${card('Literacy', pct(summary.literacy), `${pp(summary.literacyChange)} this year`,
    arrow(summary.literacyChange),
    'Share of adults who can read. Education spending and schools raise it; it feeds research and lets people move up a class.')}
    ${card('Unrest', summary.unrest.toFixed(1),
    summary.unrest > 5 ? 'severe' : summary.unrest > 3.5 ? 'rising' : 'low',
    summary.unrest > 3.5 ? 'down' : 'up',
    'Average militancy on a 0–10 scale, driven by hunger and unemployment. Above 3.5 provinces radicalise; above 5 it is a crisis.')}
  </header>`;
}

/* ==========================================================================
   DİKKAT ŞERİDİ
   ========================================================================== */

function attentionStrip(view) {
  const rows = [];
  for (const alert of view.alerts) {
    // Her uyarı NEREYE gideceğini bilir: tıklayınca ilgili sekme/süzgeç açılır.
    const worst = view.states.filter((state) => state.alerts.some((a) => a.id === alert.id))
      .sort((a, b) => b.population - a.population)[0];
    rows.push(`<button class="pop-alert ${alert.tone}" data-pop-alert="${alert.id}"
      ${worst ? `data-pop-alert-state="${esc(worst.id)}"` : ''}>
      <b>${esc(alert.label)}</b>
      <small>${esc(alertNote(alert.id, view, worst))}</small>
    </button>`);
  }
  if (!rows.length) {
    return `<div class="pop-attention calm">
      <span class="pop-attention-label">Needs attention</span>
      <p>No major social problems detected.</p>
    </div>`;
  }
  return `<div class="pop-attention">
    <span class="pop-attention-label">Needs attention</span>
    ${rows.join('')}
  </div>`;
}

/** Uyarının altındaki cümle — hepsi ölçülmüş sayıdan türer. */
function alertNote(id, view, worst) {
  const s = view.summary;
  if (id === 'FAMINE') return `only ${pct(s.needs)} of the basket is met`;
  if (id === 'LOW_NEEDS') return `${pp(s.needsChange)} this year`;
  if (id === 'HIGH_UNEMPLOYMENT') return `${people(s.unemployed)} seeking work`;
  if (id === 'RISING_UNREST') return worst ? `worst in ${worst.name}` : 'agitation is spreading';
  if (id === 'DECLINING_POPULATION') return `${people(Math.abs(s.monthlyPeople ?? 0))} lost each month`;
  if (id === 'LOW_LITERACY') return `${pct(s.literacy)} can read`;
  if (id === 'GROWING_FAST') return `+${people(s.monthlyPeople ?? 0)} each month`;
  return '';
}

/* ==========================================================================
   SOL — state / province gezgini
   ========================================================================== */

export function filterStates(states, state) {
  const query = (state.query ?? '').trim().toLowerCase();
  if (!query) return states;
  return states.filter((row) => row.name.toLowerCase().includes(query)
    || row.provinces.some((province) => province.name.toLowerCase().includes(query)));
}

function navColumn(view, state) {
  const rows = filterStates(view.states, state);
  const list = rows.map((row) => {
    const open = state.expanded.has(row.id);
    return `<div class="pop-nav-group">
      <button class="pop-nav-state${state.selected === row.id ? ' on' : ''}"
        data-pop-state="${esc(row.id)}">
        <i class="pop-nav-twist${open ? ' open' : ''}" data-pop-expand="${esc(row.id)}"
          aria-hidden="true">›</i>
        <b>${esc(row.name)}</b>
        <span class="pop-nav-people">${people(row.population)}</span>
        ${row.alert ? `<em class="pop-flag ${row.alert.tone}">${esc(row.alert.label)}</em>` : ''}
      </button>
      ${open ? row.provinces.map((province) => `
        <span class="pop-nav-province">
          <span>${esc(province.name)}</span>
          <b>${people(province.population)}</b>
        </span>`).join('') : ''}
    </div>`;
  }).join('');
  return `<aside class="pop-nav">
    <div class="pop-nav-head">
      <span>States and provinces</span>
      ${state.selected ? '<button class="pop-nav-clear" data-pop-state="">Clear</button>' : ''}
    </div>
    <span class="pop-search">
      <i aria-hidden="true">⌕</i>
      <input type="search" placeholder="Search states or provinces…" data-pop-search
        value="${esc(state.query ?? '')}">
    </span>
    <div class="pop-nav-list">${list || '<p class="empty">No match.</p>'}</div>
  </aside>`;
}

/* ==========================================================================
   ORTA — sekmeler
   ========================================================================== */

function panel(title, note, body, cls = '') {
  return `<section class="pop-panel ${cls}">
    <header><b>${esc(title)}</b>${note ? `<small>${esc(note)}</small>` : ''}</header>
    ${body}
  </section>`;
}

function overviewPanels(view) {
  const d = view.distributions;
  const s = view.summary;
  return `<div class="pop-panels">
    ${panel('Social classes', 'by occupation', `
      ${stackedBar(d.professions)}
      <div class="pop-legend">${legend(d.professions)}</div>`)}
    ${panel('Culture', 'by population', `
      <div class="pop-chart">${donut(d.cultures)}<div class="pop-legend">${legend(d.cultures)}</div></div>`)}
    ${panel('Ideology', 'of the people', `
      <div class="pop-chart">${donut(d.ideologies)}<div class="pop-legend">${legend(d.ideologies)}</div></div>`)}
    ${panel('Employment and needs', '', `
      ${meter('Employment', s.employment, pct(s.employment))}
      ${meter('Needs met', s.needs, pct(s.needs))}
      ${meter('Literacy', s.literacy, pct(s.literacy))}
      ${meter('Unrest', s.unrestShare, pct(s.unrestShare))}
      <p class="hint">${s.unemployed > 0
    ? `${people(s.unemployed)} people are looking for work.`
    : 'Every post that exists is filled.'}</p>`)}
    ${panel('Trend', `${view.trend.weeks ?? 0} weeks recorded`, `
      ${sparkline(view.trend.samples)}
      <div class="pop-trend-foot">
        <span><small>population</small><b>${people(s.total)}</b></span>
        <span><small>needs</small><b class="${arrow(s.needsChange)}">${pp(s.needsChange)}</b></span>
        <span><small>literacy</small><b class="${arrow(s.literacyChange)}">${pp(s.literacyChange)}</b></span>
      </div>`)}
  </div>`;
}

/* ==========================================================================
   TABLOLAR
   ========================================================================== */

/** Sutun basligi → satirdaki deger. Metin sutunlari harf sirasi, sayilar buyukluk. */
function sortValue(row, key) {
  switch (key) {
    case 'name': return `${row.culture} ${row.profession}`;
    case 'alert': return row.alert ? row.alert.weight ?? 0 : -1;
    default: return row[key] ?? null;
  }
}

export function filterGroups(view, state) {
  let rows = view.groups;
  if (state.selected) {
    const target = view.states.find((row) => row.id === state.selected);
    const provinces = new Set((target?.provinces ?? []).map((entry) => entry.id));
    rows = rows.filter((row) => row.stateIds.some((id) => provinces.has(id)));
  }
  const query = (state.groupQuery ?? '').trim().toLowerCase();
  if (query) {
    rows = rows.filter((row) => `${row.culture} ${row.profession}`.toLowerCase().includes(query));
  }
  // Baslik tiklaninca siralanir; varsayilan buyukten kucuge nufus. Sayisal
  // sutunlarda bos deger ("—") her zaman sona duser.
  const sort = state.sort ?? { key: 'size', dir: -1 };
  const dir = sort.dir ?? -1;
  rows = [...rows].sort((a, b) => {
    const va = sortValue(a, sort.key);
    const vb = sortValue(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'string' || typeof vb === 'string') {
      return String(va).localeCompare(String(vb)) * dir;
    }
    return (va - vb) * dir;
  });
  return rows;
}

const GROUP_COLUMNS = [
  { key: 'name', label: 'Group', align: '' },
  { key: 'size', label: 'Size', align: 'num' },
  // Sutun bir province adi tasir (grubun en kalabalik yurdu), state degil.
  { key: 'home', label: 'Home', align: '' },
  { key: 'className', label: 'Class', align: '' },
  { key: 'culture', label: 'Culture', align: '' },
  { key: 'employment', label: 'Employment', align: 'num' },
  { key: 'needs', label: 'Needs met', align: 'num' },
  { key: 'literacy', label: 'Literacy', align: 'num' },
  { key: 'leaning', label: 'Political leaning', align: '' },
  { key: 'alert', label: 'Alert', align: '' },
];

function groupTable(view, state) {
  const rows = filterGroups(view, state);
  const sort = state.sort ?? { key: 'size', dir: -1 };
  const head = GROUP_COLUMNS.map((column) => {
    const on = sort.key === column.key;
    const arrowMark = on ? (sort.dir < 0 ? ' ▼' : ' ▲') : '';
    return `<th class="${column.align}${on ? ' sorted' : ''}" data-pop-sort="${column.key}"
    title="Sort by ${esc(column.label.toLowerCase())}">${esc(column.label)}${arrowMark}</th>`;
  }).join('');
  const body = rows.map((row) => `<tr class="${state.group === row.id ? 'on' : ''}"
    data-pop-group="${esc(row.id)}" tabindex="0">
    <td><b>${esc(row.culture)} ${esc(row.profession)}</b></td>
    <td class="num">${people(row.size)}</td>
    <td>${esc(row.home)}</td>
    <td>${esc(row.className)}</td>
    <td>${esc(row.culture)}</td>
    <td class="num">${pct(row.employment)}</td>
    <td class="num ${row.needs != null && row.needs < 0.85 ? 'bad' : ''}">${pct(row.needs)}</td>
    <td class="num">${pct(row.literacy)}</td>
    <td class="lean">${esc(row.leaning)}</td>
    <td>${row.alert ? `<em class="pop-flag ${row.alert.tone}">${esc(row.alert.label)}</em>` : '—'}</td>
  </tr>`).join('');
  return `<div class="pop-table">
    <div class="pop-table-head">
      <span>${rows.length} group${rows.length === 1 ? '' : 's'}</span>
      <span class="pop-search small">
        <i aria-hidden="true">⌕</i>
        <input type="search" placeholder="Search groups…" data-pop-group-search
          value="${esc(state.groupQuery ?? '')}">
      </span>
    </div>
    <div class="pop-table-scroll">
      <table class="data-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
  </div>`;
}

function classesTab(view) {
  const rows = view.distributions.classes.map((row) => `<tr>
    <td><b>${esc(row.name)}</b></td>
    <td class="num">${people(row.value)}</td>
    <td class="num">${(row.share * 100).toFixed(1)}%</td>
  </tr>`).join('');
  return panel('Social classes', 'share of the population',
    `<table class="data-table"><thead><tr><th>Class</th><th class="num">People</th>
      <th class="num">Share</th></tr></thead><tbody>${rows}</tbody></table>`, 'wide');
}

function cultureTab(view) {
  const rows = view.distributions.cultures.map((row) => {
    const groups = view.groups.filter((group) => group.culture === row.name);
    const unrest = groups.length
      ? groups.reduce((sum, g) => sum + g.unrest * g.size, 0)
        / Math.max(1, groups.reduce((sum, g) => sum + g.size, 0))
      : null;
    const home = groups.sort((a, b) => b.size - a.size)[0]?.home ?? '—';
    return `<tr>
      <td><b>${esc(row.name)}</b></td>
      <td class="num">${people(row.value)}</td>
      <td class="num">${(row.share * 100).toFixed(1)}%</td>
      <td>${esc(home)}</td>
      <td class="num ${unrest != null && unrest > 3.5 ? 'bad' : ''}">${unrest == null ? '—' : unrest.toFixed(1)}</td>
    </tr>`;
  }).join('');
  return panel('Cultures', 'ranked by population',
    `<table class="data-table"><thead><tr><th>Culture</th><th class="num">People</th>
      <th class="num">Share</th><th>Largest state</th>
      <th class="num">Unrest</th></tr></thead><tbody>${rows}</tbody></table>
     <p class="hint">Unrest is measured from unmet needs and unemployment
       (the groups behind each figure are listed below).</p>`, 'wide');
}

function religionTab(view) {
  const rows = view.distributions.religions.map((row) => `<tr>
    <td><b>${esc(row.name)}</b></td>
    <td class="num">${people(row.value)}</td>
    <td class="num">${(row.share * 100).toFixed(1)}%</td>
  </tr>`).join('');
  return panel('Confessions', 'share of the population',
    `<table class="data-table"><thead><tr><th>Confession</th><th class="num">People</th>
      <th class="num">Share</th></tr></thead><tbody>${rows}</tbody></table>
     <p class="hint">Confession follows culture. No mechanic reads it yet, so no
       tension is claimed here.</p>`, 'wide');
}

function politicsTab(view) {
  const parties = view.politics.parties.map((party) => `<div class="pop-party">
    <span class="pop-party-id"><b>${esc(party.name)}</b>
      <small>${esc(party.ideologyName)}${party.ruling ? ' · in government' : ''}</small></span>
    <i class="pop-party-bar"><i style="width:${Math.round(party.support)}%;
      background:${party.color ?? '#7b7568'}"></i></i>
    <em>${party.support.toFixed(1)}%</em>
  </div>`).join('');
  const issues = view.politics.issues.map((row) => `<div class="pop-issue">
    <span>${esc(row.name)}</span><b>${(row.share * 100).toFixed(0)}%</b>
  </div>`).join('');
  return `<div class="pop-panels two">
    ${panel('Party support', 'national return', parties)}
    ${panel('Dominant issues', 'what the country argues about', issues)}
    ${panel('Ideology', 'of the people, not the electorate', `
      <div class="pop-chart">${donut(view.distributions.ideologies)}
      <div class="pop-legend">${legend(view.distributions.ideologies)}</div></div>`)}
  </div>`;
}

function statesTab(view) {
  const rows = view.states.map((row) => `<tr class="${row.id === view.selectedState ? 'on' : ''}"
    data-pop-state="${esc(row.id)}">
    <td><b>${esc(row.name)}</b></td>
    <td class="num">${people(row.population)}</td>
    <td class="num">${pct(row.employment)}</td>
    <td class="num ${row.needs != null && row.needs < 0.85 ? 'bad' : ''}">${pct(row.needs)}</td>
    <td class="num">${pct(row.literacy)}</td>
    <td class="num ${row.unrest > 3.5 ? 'bad' : ''}">${row.unrest == null ? '—' : row.unrest.toFixed(1)}</td>
    <td>${row.alert ? `<em class="pop-flag ${row.alert.tone}">${esc(row.alert.label)}</em>` : '—'}</td>
  </tr>`).join('');
  return panel('States', 'ranked by population',
    `<table class="data-table"><thead><tr><th>State</th><th class="num">People</th>
      <th class="num">Employment</th><th class="num">Needs</th><th class="num">Literacy</th>
      <th class="num">Unrest</th><th>Alert</th></tr></thead><tbody>${rows}</tbody></table>`, 'wide');
}

/* ==========================================================================
   SAĞ — seçili grubun dosyası
   ========================================================================== */

function detailPanel(detail) {
  if (!detail) {
    return `<aside class="pop-detail empty">
      <p class="empty">Select a group to open its file.</p>
    </aside>`;
  }
  const stat = (label, value, cls = '') => `<div class="pop-detail-stat">
    <small>${esc(label)}</small><b class="${cls}">${value}</b></div>`;
  return `<aside class="pop-detail">
    <header>
      <h4>${esc(detail.culture)} ${esc(detail.profession)}</h4>
      <small>${esc(detail.home)} · ${esc(detail.className)}</small>
    </header>
    <div class="pop-detail-grid">
      ${stat('Population', people(detail.size))}
      ${stat('Share of nation', `${(detail.share * 100).toFixed(1)}%`)}
      ${stat('Employment', pct(detail.employment))}
      ${stat('Needs met', pct(detail.needs), detail.needs < 0.85 ? 'bad' : '')}
      ${stat('Literacy', pct(detail.literacy))}
      ${stat('Unrest', detail.unrest == null ? '—' : detail.unrest.toFixed(1),
    detail.unrest > 3.5 ? 'bad' : '')}
      ${stat('Weekly income', `£${detail.income.toFixed(1)}`)}
      ${stat('Tax paid', `£${detail.taxPaid.toFixed(1)}`)}
    </div>
    <section class="pop-detail-block">
      <b>Political leaning</b>
      <p>${esc(detail.leaning)}</p>
    </section>
    <section class="pop-detail-block">
      <b>Current issues</b>
      ${detail.issues.length
    ? `<ul>${detail.issues.map((issue) => `<li>${esc(issue)}</li>`).join('')}</ul>`
    : '<p class="calm">No significant issues.</p>'}
    </section>
    <section class="pop-detail-block">
      <b>Where they live</b>
      <ul>${detail.places.map((place) => `<li>${esc(place.name)}
        <em>${people(place.people)} · ${(place.share * 100).toFixed(0)}%</em></li>`).join('')}</ul>
    </section>
  </aside>`;
}

/* ==========================================================================
   ÇERÇEVE
   ========================================================================== */

/**
 * @param {object} view `populationOverview()` çıktısı
 * @param {object} state `{ tab, selected, expanded, query, group, groupQuery }`
 * @param {object|null} detail `populationGroupDetail()` çıktısı
 */
export function populationScreen(view, state, detail) {
  const tabs = Object.entries(POP_TABS).map(([id, label]) => `
    <button class="pop-tab${state.tab === id ? ' on' : ''}"
      data-pop-tab="${id}">${esc(label)}</button>`).join('');
  const selected = view.states.find((row) => row.id === state.selected) ?? null;
  view.selectedState = state.selected;

  const middle = state.tab === 'overview' ? overviewPanels(view)
    : state.tab === 'classes' ? classesTab(view)
      : state.tab === 'culture' ? cultureTab(view)
        : state.tab === 'religion' ? religionTab(view)
          : state.tab === 'politics' ? politicsTab(view)
            : state.tab === 'states' ? statesTab(view)
              : '';

  return `<div class="pop">
    ${navColumn(view, state)}
    <div class="pop-body">
      ${healthCards(view.summary)}
      ${attentionStrip(view)}
      ${selected ? `<div class="pop-scope">
        Showing <b>${esc(selected.name)}</b> · ${people(selected.population)} people
        <button class="pop-scope-clear" data-pop-state="">show the whole country</button>
      </div>` : ''}
      <nav class="pop-tabs">${tabs}</nav>
      ${middle}
      <div class="pop-lower">
        ${groupTable(view, state)}
        ${detailPanel(detail)}
      </div>
    </div>
  </div>`;
}
