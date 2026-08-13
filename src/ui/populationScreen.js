// Nüfus ekranı: 19. yüzyıl sayım dairesinin defteri.
//
// Yerleşim Victoria 2'nin Population penceresini izler — solda coğrafi
// tarayıcı, üstte dar dağılım şeridi, altta yoğun POP tablosu — ama boya
// bizim: kömür siyahı yüzey, mat pirinç ayraç, kırık beyaz yazı.
//
// Bu dosya yalnız ÇİZER. Bütün sayılar game/census.js'ten hazır gelir; burada
// hiçbir toplam hesaplanmaz. Parçalar tek tek dışa açıktır (satır, pasta,
// blok, tablo) çünkü ekran tek bir dev şablon değil, yeniden kullanılabilir
// bileşenlerden kurulur.

import {
  cohortPolitics, confessionOf, consciousnessOf, literacyOf, locationName, militancyOf,
} from '../game/census.js';
import { PROFESSION_INFO, formatPopulation } from '../game/economy.js';
import { IDEOLOGIES } from '../game/politics.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* --------------------------------------------------------------------------
   PALET — mezhep/meslek/mesele renkleri yalnız grafik anlamı taşır, oyun
   anlamı taşımaz; bu yüzden game katmanında değil burada dururlar. Hepsi
   tozlu ve mat: neon dilim defteri web grafiğine çevirir.
   -------------------------------------------------------------------------- */
const PROFESSION_COLOR = {
  farmers: '#8b9659', laborers: '#997a49', workers: '#a05a45', clerks: '#6e8992',
  artisans: '#a5874a', officers: '#7b6e8d', capitalists: '#bd9e59', aristocrats: '#8b5460',
};
const CONFESSION_COLOR = {
  orthodox: '#b09857', reformed: '#7b8c69', covenant: '#887898',
  crescent: '#5e8984', dharmic: '#ae784b', animist: '#786b5b',
};
const ESTATE_COLOR = { lower: '#94895d', middle: '#6f8894', upper: '#b1904f' };
const ISSUE_COLOR = {
  residency: '#6b5880', limited_citizenship: '#807194', full_citizenship: '#9a8dac',
  laissez_faire: '#c3a75b', interventionism: '#a48a47', state_capitalism: '#856e39',
  planned_economy: '#68542b',
  free_trade: '#7d94a0', protectionism: '#5b7380',
  pacifism: '#98a06a', anti_military: '#a67e4d', pro_military: '#a15a46', jingoism: '#883d34',
};
const SEAM = '#080d10';

const professionColor = (id) => PROFESSION_COLOR[id] ?? '#7b7568';
const ideologyColor = (id) => IDEOLOGIES[id]?.color ?? '#7b7568';
const issueColor = (id) => ISSUE_COLOR[id] ?? '#7b7568';
const cultureColor = (world, id) => world.cultures?.[id]?.color ?? '#6f7778';
const confessionColor = (id) => CONFESSION_COLOR[id] ?? '#786b5b';

/* --------------------------------------------------------------------------
   PİKTOGRAM — sekme çubuğuyla aynı çizgi dili: 16px, tek renk, 1.3 stroke.
   Referanstaki küçük sınıf figürlerinin karşılığı; emoji değil.
   -------------------------------------------------------------------------- */
const FIGURE_PATH = {
  farmers: '<circle cx="6" cy="4" r="1.7"/><path d="M3.5 13.5V9.5c0-1.4 1.1-2.5 2.5-2.5s2.5 1.1 2.5 2.5v4M11 3l1.8 10.5M10 5.2l3.4-1.1"/>',
  laborers: '<circle cx="6.5" cy="4" r="1.7"/><path d="M4 13.5V9.5C4 8.1 5.1 7 6.5 7S9 8.1 9 9.5v4M11 13.5 12.8 6M10.6 6.4l3.4-1.4-.7 2.4z"/>',
  workers: '<circle cx="6" cy="4" r="1.7"/><path d="M3.5 13.5V9.5C3.5 8.1 4.6 7 6 7s2.5 1.1 2.5 2.5v4M10.5 13.5V8l1.7 1.2V8L14 9.2v4.3M11.7 11.6h.6"/>',
  clerks: '<circle cx="8" cy="4" r="1.7"/><path d="M5.5 13.5v-4C5.5 8.1 6.6 7 8 7s2.5 1.1 2.5 2.5v4M8 8.4v2.4M3 13.5h10M3.2 9.5H5M11 9.5h1.8"/>',
  artisans: '<circle cx="6.2" cy="4" r="1.7"/><path d="M3.8 13.5v-4C3.8 8.1 4.9 7 6.2 7s2.4 1.1 2.4 2.5v4M10.4 9.6l3.1-3.1M9.6 12.2l1.6-1.6M12.6 5.4l1.6 1.6"/>',
  officers: '<circle cx="8" cy="4.6" r="1.7"/><path d="M5.6 2.6h4.8M5.2 13.5v-3.9C5.2 8.2 6.4 7.1 8 7.1s2.8 1.1 2.8 2.5v3.9M12.6 4v9.5M8 8.6v2.2"/>',
  capitalists: '<circle cx="8" cy="4.4" r="1.7"/><path d="M5.2 13.5V9.6C5.2 8.2 6.4 7.1 8 7.1s2.8 1.1 2.8 2.5v3.9M8 8.8v2.6M2.6 11.5h1.4M12 11.5h1.4M3.4 8.6l1.2.8M12.6 8.6l-1.2.8"/>',
  aristocrats: '<path d="M5.2 4.6V2.4h5.6v2.2M4.2 4.6h7.6M5.2 13.5V9.6C5.2 8.2 6.4 7.1 8 7.1s2.8 1.1 2.8 2.5v3.9M11.6 9.8l1.6 3.7M4.4 9.8l-1.6 3.7"/>',
};

/** Şeritteki süzgeç figürü: satır içi SVG, rengi açık/kapalı durumdan alır. */
const figureSvg = (id) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${FIGURE_PATH[id] ?? ''}</svg>`;

/**
 * Tablodaki figür arka plan resmidir, DOM düğümü değil. Satır içi SVG olarak
 * çizilince 700 satır ~26.000 düğüm üretiyor ve tek tazeleme 190 ms sürüyordu
 * (ölçüldü); rengi gömülü sekiz data-URI aynı görüntüyü sıfır düğümle verir.
 */
const FIGURE_URL = Object.fromEntries(Object.keys(FIGURE_PATH).map((id) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none"
    stroke="${PROFESSION_COLOR[id]}" stroke-width="1.3" stroke-linecap="round"
    stroke-linejoin="round">${FIGURE_PATH[id]}</svg>`;
  return [id, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`];
}));

/* --------------------------------------------------------------------------
   PASTA — konik gradyan, dilim aralarında oyulmuş ince koyu dikiş. Referanstaki
   küçük pastaların karşılığı; grafik kütüphanesi yok.
   -------------------------------------------------------------------------- */
export function pieChart(slices, { size = 70, colorOf = () => '#7b7568' } = {}) {
  const usable = slices.filter((slice) => slice.share > 0.0005);
  if (!usable.length) {
    return `<i class="census-pie empty" style="--pie-size:${size}px" aria-hidden="true"></i>`;
  }
  const stops = [];
  let at = 0;
  for (const slice of usable) {
    const from = at * 100;
    const to = Math.min(100, (at + slice.share) * 100);
    // Dikiş dilimin başındadır; tek dilimlik pastada gereksiz gürültü olur.
    if (usable.length > 1) stops.push(`${SEAM} ${from.toFixed(3)}% ${(from + 0.4).toFixed(3)}%`);
    stops.push(`${colorOf(slice.id)} ${(from + (usable.length > 1 ? 0.4 : 0)).toFixed(3)}% ${to.toFixed(3)}%`);
    at += slice.share;
  }
  return `<i class="census-pie" style="--pie-size:${size}px;
    background:conic-gradient(from -90deg, ${stops.join(', ')})" aria-hidden="true"></i>`;
}

/** Pasta lejantı: renk kutucuğu, ad, pay. Payı %0.05'in altındakiler düşer. */
export function pieLegend(slices, { colorOf = () => '#7b7568', limit = 7 } = {}) {
  const usable = slices.filter((slice) => slice.share > 0.0005);
  const shown = usable.slice(0, limit);
  const rest = usable.slice(limit);
  const restShare = rest.reduce((sum, slice) => sum + slice.share, 0);
  const row = (color, name, share, title) => `<span class="census-legend-row" title="${esc(title ?? name)}">
    <i style="background:${color}"></i><em>${esc(name)}</em><b>${(share * 100).toFixed(1)}%</b></span>`;
  if (!usable.length) {
    return '<span class="census-legend-row empty"><em>no returns</em></span>';
  }
  return shown.map((slice) => row(colorOf(slice.id), slice.name, slice.share)).join('')
    + (rest.length
      ? row('#5d5a52', `Other (${rest.length})`, restShare,
        rest.map((slice) => `${slice.name} ${(slice.share * 100).toFixed(1)}%`).join(' · '))
      : '');
}

/**
 * Üst şeridin tek bloğu: başlık, pasta, lejant. Referanstaki "WORKFORCE /
 * RELIGION / IDEOLOGY" kutucuklarının karşılığı.
 */
export function summaryBlock({ title, note = '', slices, colorOf }) {
  return `<section class="census-block">
    <h4>${esc(title)}${note ? `<em>${esc(note)}</em>` : ''}</h4>
    <div class="census-block-body">
      ${pieChart(slices, { colorOf })}
      <div class="census-legend">${pieLegend(slices, { colorOf })}</div>
    </div>
  </section>`;
}

/** Yığılmış şeridin gradyanı: dilimler çocuk düğüm değil, tek bir dolgu. */
function stackFill(slices, colorOf) {
  const stops = [];
  let at = 0;
  for (const slice of slices) {
    const from = at * 100;
    const to = Math.min(100, (at + slice.share) * 100);
    stops.push(`${colorOf(slice.id)} ${from.toFixed(2)}% ${to.toFixed(2)}%`);
    at += slice.share;
  }
  return stops.length ? `linear-gradient(90deg, ${stops.join(', ')})` : '';
}

const stackTitle = (slices) => slices.slice(0, 4)
  .map((slice) => `${slice.name} ${(slice.share * 100).toFixed(0)}%`).join(' · ');

/**
 * Satırların taşıdığı bütün boyalar tek bir stil bloğunda toplanır: sekiz
 * meslek figürü, kültür çipleri, sınıf başına ideoloji ve mesele şeritleri.
 *
 * Satır içinde yazıldıklarında 700 satır ~500 karakterlik bir data-URI ile
 * 13 duraklı bir gradyanı tekrar tekrar taşıyordu — 1.4 MB HTML ve 150 ms
 * yeniden çizim (ölçüldü). Farklı değer sayısı aslında yirmiyi geçmiyor.
 */
function paintRules(world, nation, classes) {
  const rules = [];
  for (const [id, url] of Object.entries(FIGURE_URL)) rules.push(`.fig-${id}{--fig:${url}}`);
  for (const culture of world.cultures ?? []) {
    rules.push(`.chip-${culture.id}{--chip:${culture.color}}`);
  }
  for (const [id, color] of Object.entries(CONFESSION_COLOR)) rules.push(`.rel-${id}{color:${color}}`);
  for (const [id, color] of Object.entries(ESTATE_COLOR)) rules.push(`.est-${id}{color:${color}}`);
  for (const [classId, politics] of classes) {
    const ideology = stackFill(politics.ideology, ideologyColor);
    const issues = stackFill(politics.issues, issueColor);
    if (ideology) rules.push(`.ideo-${classId}{background:${ideology}}`);
    if (issues) rules.push(`.issue-${classId}{background:${issues}}`);
  }
  return `<style>${rules.join('')}</style>`;
}

/* --------------------------------------------------------------------------
   COĞRAFİ TARAYICI
   -------------------------------------------------------------------------- */

/**
 * Tarayıcının tek satırı: ok, ad, sağda nüfus. Ülke/state/province aynı kalıp.
 * Ok ayrı bir düğmedir (iç içe düğme geçersiz HTML'dir ve tarayıcı onu satırın
 * dışına taşır): açmak ile seçmek iki farklı iştir, ikisi de tıklanabilir olmalı.
 */
export function browserRow({
  kind, id, name, population, selected, partial = false, open = false,
  expandable = false, note = '',
}) {
  const twist = expandable
    ? `<button class="census-twist" data-census-toggle="${esc(id)}"
        aria-expanded="${open}" aria-label="${open ? 'Collapse' : 'Expand'} ${esc(name)}"
        >${open ? '▾' : '▸'}</button>`
    : '<i class="census-twist-gap" aria-hidden="true"></i>';
  const state = selected ? ' selected' : partial ? ' partial' : '';
  return `<div class="census-row census-row-${kind}${state}">
    ${twist}
    <button class="census-pick" data-census-pick="${esc(id)}" data-census-kind="${kind}"
      aria-pressed="${Boolean(selected)}"
      title="${esc(name)}${note ? ` — ${esc(note)}` : ''}">
      <span class="census-row-name">${esc(name)}</span>
      <span class="census-row-pop">${formatPopulation(population)}</span>
    </button>
  </div>`;
}

/** Ülke → state → province ağacı. Açık state'ler province'lerini gösterir. */
export function geographicBrowser(tree, { selection, expanded }) {
  const rows = [];
  for (const state of tree.states) {
    const keys = state.provinces.map((province) => province.key);
    const picked = keys.filter((key) => selection.has(key)).length;
    const open = expanded.has(state.id);
    rows.push(browserRow({
      kind: 'state',
      id: `state:${state.id}`,
      name: state.name,
      population: state.population,
      selected: picked === keys.length && keys.length > 0,
      partial: picked > 0 && picked < keys.length,
      open,
      expandable: true,
      note: `${keys.length} province${keys.length === 1 ? '' : 's'}`,
    }));
    if (!open) continue;
    for (const province of state.provinces) {
      rows.push(browserRow({
        kind: 'province',
        id: `prov:${province.key}`,
        name: province.name,
        population: province.population,
        selected: selection.has(province.key),
        note: province.city ? `${province.city.name} — city` : '',
      }));
    }
  }
  const all = tree.keys.length;
  const picked = tree.keys.filter((key) => selection.has(key)).length;
  return `<aside class="census-browser">
    ${browserRow({
    kind: 'country',
    id: 'country',
    name: tree.name,
    population: tree.population,
    selected: picked === all && all > 0,
    partial: picked > 0 && picked < all,
    note: `${tree.states.length} states`,
  })}
    <div class="census-browser-list">${rows.join('') || '<p class="census-empty">No territory.</p>'}</div>
  </aside>`;
}

/* --------------------------------------------------------------------------
   BAŞLIK ŞERİDİ — meslek süzgeçleri ve seçim düğmeleri
   -------------------------------------------------------------------------- */

/**
 * Referanstaki küçük figür dizisi. Dekor değil süzgeç: bir figüre basmak o
 * mesleği tablodan ve dağılımlardan çıkarır. Sağda Select All / Deselect All.
 */
export function headerStrip({ trades, counts }) {
  const figures = Object.values(PROFESSION_INFO).map((profession) => {
    const size = counts.get(profession.id) ?? 0;
    const on = trades.has(profession.id);
    return `<button class="census-fig${on ? ' on' : ''}" data-census-trade="${profession.id}"
      style="--fig:${professionColor(profession.id)}"
      title="${esc(profession.name)} — ${formatPopulation(size)}${on ? '' : ' (hidden)'}">
      ${figureSvg(profession.id)}</button>`;
  }).join('');
  return `<div class="census-strip">
    <div class="census-figs">${figures}</div>
    <div class="census-strip-buttons">
      <button class="census-btn" data-census-all="1">Select All</button>
      <button class="census-btn" data-census-none="1">Deselect All</button>
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   POP TABLOSU
   -------------------------------------------------------------------------- */

// `text` sütunu ilk tıklamada A→Z sıralanır; sayı sütunu büyükten küçüğe.
// Tek bir varsayılan yön kullanınca yer adları Z'den başlıyordu.
const COLUMNS = [
  { key: 'size', label: 'Size', cls: 'num', title: 'Cohort size' },
  { key: 'type', label: 'Type', text: true, title: 'Occupation' },
  { key: 'estate', label: 'Estate', text: true, title: 'Social class the occupation belongs to' },
  { key: 'nation', label: 'Nationality', text: true, title: 'Culture of the cohort' },
  { key: 'rel', label: 'Rel', cls: 'mid', text: true, title: 'Confession (derived from culture)' },
  { key: 'location', label: 'Location', text: true, title: 'Province' },
  { key: 'cash', label: 'Cash', cls: 'num', title: 'Weekly income earned by this cohort, ¤' },
  { key: 'tax', label: 'Tax', cls: 'num', title: 'Weekly tax paid by this cohort, ¤' },
  { key: 'budget', label: 'Budget', cls: 'num', title: 'Weekly household spending budget after tax, ¤' },
  { key: 'living', label: 'Living', cls: 'num', title: 'Weekly cost of the household basket, ¤' },
  { key: 'left', label: 'Left', cls: 'num', title: 'Budget minus the basket — what the household keeps, ¤' },
  { key: 'needs', label: 'Needs', cls: 'num', title: 'Share of the household basket actually bought' },
  { key: 'ideology', label: 'Ideology', title: 'Ideological leaning of the cohort class' },
  { key: 'issues', label: 'Issues', title: 'Policies its parties campaign on' },
  { key: 'unemp', label: 'Unemp', cls: 'num', title: 'Unemployed share; only trades with real workplaces' },
  { key: 'mil', label: 'MIL', cls: 'num', title: 'Militancy 0–10 — derived from unmet needs and unemployment' },
  { key: 'con', label: 'CON', cls: 'num', title: 'Consciousness 0–10 — derived from literacy and urban life' },
  { key: 'lit', label: 'LIT', cls: 'num', title: 'Literacy — derived from schooling, class and urbanisation' },
];

/** Sınıfın defterdeki kısa adı: "Lower Class" sütunu gereksiz genişletiyordu. */
const ESTATE = { lower: 'Lower', middle: 'Middle', upper: 'Upper' };

/**
 * Satır yüksekliği, piksel. Sanallaştırmanın bütün aritmetiği buna dayanır ve
 * CSS ile BİREBİR aynı olmalı (bkz. .census-grid td: 20px içerik + 1px ayraç).
 * Kaydığında boşluk satırları gerçek satırlarla tutmaz, kaydırma zıplar.
 */
const ROW_HEIGHT = 21;

/**
 * Yedek satır bloğu. Pencere blok sınırında kaydığı için bu sayı iki şeyi
 * birden ayarlar: kaç satır fazladan çizilir ve kaç piksel kaydırınca gövde
 * yeniden yazılır (blok × 21 px).
 *
 * 10 seçildi çünkü iki maliyet aynı yöne çekmiyor: haftalık yeniden çizim
 * OYUNCU HİÇBİR ŞEY YAPMADAN olur, kaydırma ise ancak oyuncu kaydırırken.
 * Büyük yedek haftalık maliyeti şişiriyordu (18'de pencere 84 satır, 10'da
 * ~59). Karşılığında yeniden çizim ~210 px'de bire iner — kaydırırken bile
 * tek karelik iş.
 */
const ROW_BUFFER = 10;

function sortValue(row, key) {
  switch (key) {
    case 'size': return row.cohort.size;
    case 'type': return row.cohort.professionName;
    case 'estate': return row.cohort.classId;
    case 'nation': return row.culture;
    case 'rel': return row.confession.name;
    case 'location': return row.location;
    case 'cash': return row.cohort.income ?? 0;
    case 'tax': return row.cohort.taxPaid ?? 0;
    case 'budget': return row.cohort.disposable ?? 0;
    case 'living': return row.cohort.consumption ?? 0;
    case 'left': return row.surplus;
    case 'needs': return row.cohort.needsFulfilled ?? 1;
    case 'unemp': return row.unemployment ?? -1;
    case 'mil': return row.militancy;
    case 'con': return row.consciousness;
    case 'lit': return row.literacy;
    case 'ideology': return row.politics.ideology[0]?.share ?? 0;
    case 'issues': return row.politics.issues[0]?.share ?? 0;
    default: return row.cohort.size;
  }
}

/** Sayısal hücrenin sıcaklığı: kötü kırmızıya, iyi zeytine kayar. */
const tone = (value, warn, bad) => (value >= bad ? ' bad' : value >= warn ? ' warn' : '');

/** Bir sütuna ilk tıklamada hangi yön? Metin A→Z, sayı büyükten küçüğe. */
export const defaultSortDir = (key) => (COLUMNS.find((column) => column.key === key)?.text ? 1 : -1);

/**
 * Kohortları tablo satırına çevirir ve sıralar. Türetilen alanlar (mezhep, ad,
 * okuryazarlık, militanlık…) burada bir kez hesaplanır; kaydırma sırasında
 * yalnız çizim tekrarlanır, bu liste değil.
 */
export function buildPopRows(world, nation, cohorts, sort) {
  const rows = cohorts.map((cohort) => {
    const tile = cohort.tile ?? world.get(cohort.q, cohort.r);
    return {
      cohort,
      tile,
      culture: world.cultures?.[cohort.culture]?.name ?? 'Stateless',
      confession: confessionOf(world, cohort.culture),
      location: locationName(tile),
      politics: cohortPolitics(nation, cohort),
      literacy: literacyOf(nation, cohort),
      militancy: militancyOf(cohort),
      consciousness: consciousnessOf(nation, cohort),
      unemployment: cohort.employed != null && cohort.size > 0
        ? cohort.unemployed / cohort.size : null,
      // Vergiden ve sepetten sonra hanede kalan. Üst sınıfta bu artık yatırım
      // sermayesine dönüşen paradır (bkz. politics.js collectPrivateCapital).
      surplus: (cohort.disposable ?? 0) - (cohort.consumption ?? 0),
    };
  });

  const dir = sort.dir;
  rows.sort((a, b) => {
    const left = sortValue(a, sort.key);
    const right = sortValue(b, sort.key);
    const cmp = typeof left === 'string'
      ? left.localeCompare(right) : (left - right);
    return cmp * dir || b.cohort.size - a.cohort.size;
  });
  return rows;
}

/** Tek satır. */
function popRow(row) {
  const { cohort } = row;
  const needs = Math.round((cohort.needsFulfilled ?? 1) * 100);
  const unemployment = row.unemployment;
  return `<tr class="census-tr" title="${esc(cohort.professionName)} of ${esc(row.culture)} in ${esc(row.location)}">
      <td class="c-size num strong">${formatPopulation(cohort.size)}</td>
      <td class="c-type census-type fig-${cohort.professionId}">${esc(cohort.professionName)}</td>
      <td class="c-estate census-estate est-${cohort.classId}">${ESTATE[cohort.classId] ?? cohort.classId}</td>
      <td class="c-nation census-culture chip-${cohort.culture}">${esc(row.culture)}</td>
      <td class="c-rel mid census-rel rel-${row.confession.id}"
        title="${esc(row.confession.name)}">${row.confession.glyph}</td>
      <td class="c-location census-loc">${esc(row.location)}</td>
      <td class="c-cash num">${(cohort.income ?? 0).toFixed(2)}</td>
      <td class="c-tax num dim">${(cohort.taxPaid ?? 0).toFixed(2)}</td>
      <td class="c-budget num">${(cohort.disposable ?? 0).toFixed(2)}</td>
      <td class="c-living num dim">${(cohort.consumption ?? 0).toFixed(2)}</td>
      <td class="c-left num ${row.surplus >= 0 ? 'good' : 'bad'}">${
  row.surplus >= 0 ? '+' : ''}${row.surplus.toFixed(2)}</td>
      <td class="c-needs num${needs >= 95 ? ' good' : needs < 60 ? ' bad' : needs < 85 ? ' warn' : ''}">${needs}%</td>
      <td class="c-ideology"><span class="census-stack ideo-${cohort.classId}"
        title="${esc(stackTitle(row.politics.ideology))}"></span></td>
      <td class="c-issues"><span class="census-stack issue-${cohort.classId}"
        title="${esc(stackTitle(row.politics.issues))}"></span></td>
      <td class="c-unemp num${unemployment == null ? ' void' : tone(unemployment, 0.12, 0.3)}">${
  unemployment == null ? '—' : `${Math.round(unemployment * 100)}%`}</td>
      <td class="c-mil num${tone(row.militancy, 3, 6)}">${row.militancy.toFixed(1)}</td>
      <td class="c-con num">${row.consciousness.toFixed(1)}</td>
      <td class="c-lit num">${Math.round(row.literacy * 100)}%</td>
    </tr>`;
}

/**
 * Yalnız görünen pencereyi çizer; üstteki ve alttaki satırların yerini iki
 * boşluk satırı tutar, böylece kaydırma çubuğu bütün listeyi gösterir.
 *
 * Neden: maliyet DOM düğüm sayısıyla doğrusaldır (ölçüldü: ~11 ms / 1000
 * düğüm) ve 1080p'de aynı anda yalnız ~28 satır görünür. Bütün kohortları
 * çizmek, görülmeyen satırların yerleşimini her hafta yeniden hesaplamaktı.
 */
/**
 * Çizilecek satır aralığı. Başlangıç blok sınırına yuvarlanır: yuvarlanmasa
 * pencere her 21 px'lik kaydırmada kayar ve gövde her karede yeniden çizilirdi.
 * Blok sınırıyla yeniden çizim ~380 px'de bire iner.
 */
export function popRowWindow(total, view = {}) {
  const height = Math.max(ROW_HEIGHT, view.height || 640);
  const scrollTop = Math.max(0, view.scrollTop || 0);
  const visible = Math.ceil(height / ROW_HEIGHT);
  const start = Math.floor(scrollTop / ROW_HEIGHT);
  const first = Math.max(0, Math.floor(start / ROW_BUFFER) * ROW_BUFFER - ROW_BUFFER);
  return { first, last: Math.min(total, first + visible + ROW_BUFFER * 3) };
}

export function popRowsHtml(rows, view = {}) {
  const total = rows.length;
  if (!total) return '';
  const { first, last } = popRowWindow(total, view);
  const spacer = (count) => (count > 0
    ? `<tr class="census-spacer" style="height:${count * ROW_HEIGHT}px"><td colspan="${COLUMNS.length}"></td></tr>`
    : '');
  return spacer(first)
    + rows.slice(first, last).map(popRow).join('')
    + spacer(total - last);
}

export function popTable(rows, sort, view) {
  const dir = sort.dir;
  const head = COLUMNS.map((column) => {
    const active = sort.key === column.key;
    return `<th class="c-${column.key} ${column.cls ?? ''}">
      <button class="census-th${active ? ' sorted' : ''}" data-census-sort="${column.key}"
        title="${esc(column.title)}">${esc(column.label)}<i>${
  active ? (dir < 0 ? '▾' : '▴') : '⇅'}</i></button></th>`;
  }).join('');

  // Gerçek tablo, `table-layout: fixed` ile. Satır başına CSS ızgarası kurmak
  // 700 satırda tek başına 103 ms yerleşim demekti (ölçüldü); tarayıcının
  // tablo yerleşimi sütun genişliğini bir kez, başlıktan hesaplar.
  return `<div class="census-table">
    <div class="census-scroll">
      <table class="census-grid">
        <thead><tr>${head}</tr></thead>
        <tbody>${popRowsHtml(rows, view)}</tbody>
      </table>
      ${rows.length ? '' : '<p class="census-empty">No cohorts in this selection.</p>'}
    </div>
  </div>`;
}

/* --------------------------------------------------------------------------
   ÇERÇEVE — üç bölgeyi tek ızgarada birleştirir
   -------------------------------------------------------------------------- */

/** Şeridin sağ ucundaki toplamlar: seçimin tek satırlık künyesi. */
function totalsBar(census, tree, visible) {
  const cell = (label, value, cls = '') => `<span class="census-total${cls ? ` ${cls}` : ''}">
    <small>${esc(label)}</small><b>${value}</b></span>`;
  // Meslek süzgeci tabloyu daraltır ama dağılımları daraltmaz (referansta da
  // öyle); rozet kaç kohortun gizlendiğini söylemezse tablo eksik görünür.
  const hidden = census.cohorts.length - visible;
  return `<div class="census-totals">
    ${cell('Selected', `${census.provinces} / ${tree.keys.length}`)}
    ${cell('Population', formatPopulation(census.total))}
    ${cell('Cohorts', hidden > 0 ? `${visible} <em>of ${census.cohorts.length}</em>` : String(visible),
    hidden > 0 ? 'filtered' : '')}
    ${cell('Employment', census.employment == null ? '—' : `${Math.round(census.employment * 100)}%`)}
    ${cell('Unemployed', formatPopulation(census.unemployed))}
    ${/* Boş seçimde ortalama diye bir şey yok; "%100 karşılandı" yalan olurdu. */ ''}
    ${cell('Needs met', census.total ? `${Math.round(census.needs * 100)}%` : '—')}
    ${cell('Literacy', census.total ? `${Math.round(census.literacy * 100)}%` : '—')}
    ${cell('Income', `¤${census.income.toFixed(1)}`)}
    ${cell('Tax', `¤${census.taxPaid.toFixed(1)}`)}
  </div>`;
}

/** Meslek süzgecinden geçen kohortlar, tablo satırına çevrilmiş ve sıralanmış. */
export function censusRows(world, nation, census, state) {
  return buildPopRows(
    world,
    nation,
    census.cohorts.filter((cohort) => state.trades.has(cohort.professionId)),
    state.sort,
  );
}

/**
 * Ekranın tamamı. `state` Screens örneğinde yaşar: seçili province'ler, açık
 * state'ler, görünür meslekler, sıralama ve tablonun kaydırma penceresi.
 * `rows` dışarıdan verilir (bkz. censusRows): kaydırma sırasında yalnız gövde
 * yeniden çizilirken aynı liste kullanılır, satırlar baştan türetilmez.
 */
export function populationScreen(world, nation, tree, census, state, rows) {
  const counts = new Map();
  const classes = new Map();
  for (const cohort of census.cohorts) {
    counts.set(cohort.professionId, (counts.get(cohort.professionId) ?? 0) + cohort.size);
    if (!classes.has(cohort.classId)) classes.set(cohort.classId, cohortPolitics(nation, cohort));
  }

  return `<div class="census">
    ${paintRules(world, nation, classes)}
    ${geographicBrowser(tree, state)}
    <div class="census-main">
      ${headerStrip({ trades: state.trades, counts })}
      ${totalsBar(census, tree, rows.length)}
      <div class="census-band">
        ${summaryBlock({
    title: 'Workforce',
    note: 'occupation',
    slices: census.workforce.map((slice) => ({
      ...slice, name: PROFESSION_INFO[slice.id]?.name ?? slice.id,
    })),
    colorOf: professionColor,
  })}
        ${summaryBlock({
    title: 'Nationality',
    note: 'culture',
    slices: census.nationality,
    colorOf: (id) => cultureColor(world, Number(id)),
  })}
        ${summaryBlock({
    title: 'Religion',
    note: 'confession',
    slices: census.religion,
    colorOf: confessionColor,
  })}
        ${summaryBlock({
    title: 'Ideology',
    note: 'by class',
    slices: census.ideology,
    colorOf: ideologyColor,
  })}
        ${summaryBlock({
    title: 'Dominant Issues',
    note: 'party programmes',
    slices: census.issues,
    colorOf: issueColor,
  })}
        ${summaryBlock({
    title: 'Electorate',
    note: 'national return',
    slices: census.electorate,
    colorOf: ideologyColor,
  })}
      </div>
      ${popTable(rows, state.sort, state.view)}
    </div>
  </div>`;
}
