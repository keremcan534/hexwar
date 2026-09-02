// Siyaset ekranı: hükûmet, üst meclis ve yasa defteri.
//
// Yerleşim Victoria 2'nin Politics penceresini birebir izler — solda tek bir
// sütunda rejim/meclis/parti/pastalar/meseleler, sağda dört sekme ve Reforms
// sekmesinde iki sütun yasa merdiveni ile altta "Matters of State" bandı.
// Boya bizim: kömür siyahı yüzey, oyulmuş pirinç çerçeve, bordo şerit başlık
// (bkz. styles.css §17) — referansın gri/altın metal kabuğu değil.
//
// Bu dosya yalnız ÇİZER. Bütün sayılar game/reforms.js ve game/politics.js'ten
// hazır gelir; burada hiçbir eşik ya da toplam hesaplanmaz. Simgeler satır içi
// çizgi-SVG'dir (emoji değil), renkler UI katmanına aittir.

import {
  REFORM_CATEGORIES, canEnactCategory, electorate, importantIssues, peopleMix,
  reformMovements, reformValue, upperHouse, voterMix,
} from '../game/reforms.js';
import { IDEOLOGIES, POLITICAL_POLICIES, rulingParty } from '../game/politics.js';
import { formatPopulation } from '../game/economy.js';
import { gameDate } from './hud.js';

/* --------------------------------------------------------------------------
   PASTA — konik gradyan, dilimler arasinda ince koyu dikis. Nufus ekrani
   yeniden yazilinca (donut'a gecti) buranin tek tuketicisi kaldi; ortak
   dosyada durmasinin bir sebebi yok.
   -------------------------------------------------------------------------- */
const PIE_SEAM = '#0a0f12';

export function pieChart(slices, { size = 70, colorOf = () => '#7b7568' } = {}) {
  const usable = slices.filter((slice) => slice.share > 0.0005);
  if (!usable.length) {
    return `<i class="pie empty" style="--pie-size:${size}px" aria-hidden="true"></i>`;
  }
  const stops = [];
  let at = 0;
  for (const slice of usable) {
    const from = at * 100;
    const to = Math.min(100, (at + slice.share) * 100);
    // Dikis dilimin basindadir; tek dilimlik pastada gereksiz gurultu olur.
    if (usable.length > 1) stops.push(`${PIE_SEAM} ${from.toFixed(3)}% ${(from + 0.4).toFixed(3)}%`);
    stops.push(`${colorOf(slice.id)} ${(from + (usable.length > 1 ? 0.4 : 0)).toFixed(3)}% ${to.toFixed(3)}%`);
    at += slice.share;
  }
  return `<i class="pie" style="--pie-size:${size}px;
    background:conic-gradient(from -90deg, ${stops.join(', ')})" aria-hidden="true"></i>`;
}

/** Pasta lejanti: renk kutucugu, ad, pay. */
export function pieLegend(slices, { colorOf = () => '#7b7568', limit = 7 } = {}) {
  const usable = slices.filter((slice) => slice.share > 0.0005);
  const shown = usable.slice(0, limit);
  const rest = usable.slice(limit);
  const restShare = rest.reduce((sum, slice) => sum + slice.share, 0);
  const row = (color, name, share, title) => `<span class="pie-legend-row" title="${esc(title ?? name)}">
    <i style="background:${color}"></i><em>${esc(name)}</em><b>${(share * 100).toFixed(1)}%</b></span>`;
  if (!usable.length) return '<span class="pie-legend-row empty"><em>no returns</em></span>';
  return shown.map((slice) => row(colorOf(slice.id), slice.name, slice.share)).join('')
    + (rest.length
      ? row('#5d5a52', `Other (${rest.length})`, restShare,
        rest.map((slice) => `${slice.name} ${(slice.share * 100).toFixed(1)}%`).join(' · '))
      : '');
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const pct = (share) => `${(share * 100).toFixed(1)}%`;
const ideologyColor = (id) => IDEOLOGIES[id]?.color ?? '#7b7568';

/* --------------------------------------------------------------------------
   PİKTOGRAM — yasa başına bir figür, 16px, tek renk, 1.3 stroke.
   Referanstaki küçük kurum simgelerinin karşılığı; hepsi aynı çizgi dilinde.
   -------------------------------------------------------------------------- */
const GLYPH = {
  wage: '<circle cx="8" cy="8" r="5"/><path d="M8 4.8v6.4M6.3 6.6h3.4M6.3 9.4h3.4"/>',
  clock: '<circle cx="8" cy="8" r="5.4"/><path d="M8 4.6V8l2.4 1.5"/>',
  safety: '<path d="M8 2.9 2.7 12.6h10.6z"/><path d="M8 6.2v3.1M8 11.1h.01"/>',
  unemployment: '<path d="M3.4 8h9.2c0 2.6-2 4.6-4.6 4.6S3.4 10.6 3.4 8z"/><circle cx="8" cy="4.4" r="1.4"/><path d="M8 5.8v2.2"/>',
  pension: '<circle cx="6.6" cy="3.9" r="1.6"/><path d="M4.4 13.1V9.3c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2v3.8M11.4 6.4v6.7M10.2 6.4h2.4"/>',
  health: '<path d="M6.4 3h3.2v3.4H13v3.2H9.6V13H6.4V9.6H3V6.4h3.4z"/>',
  school: '<path d="M8 4.6C6.7 3.5 5 3.2 3 3.4v8.3c2-.2 3.7.1 5 1.2 1.3-1.1 3-1.4 5-1.2V3.4c-2-.2-3.7.1-5 1.2z"/><path d="M8 4.6v8.3"/>',
  penal: '<path d="M8 2.9v10.2M4.4 13.1h7.2M3 6.2h10M4.6 6.2 3 9.7h3.2zM11.4 6.2 9.8 9.7H13z"/>',
  party: '<path d="M4.4 13.1V2.9M4.4 3.5h7.2L9.9 5.9l1.7 2.4H4.4z"/>',
  house: '<path d="M2.4 6.1 8 2.9l5.6 3.2M3.6 6.9v4.8M6.5 6.9v4.8M9.5 6.9v4.8M12.4 6.9v4.8M2.4 12.6h11.2"/>',
  conscript: '<path d="M2.8 10.4h10.4M3.7 10.4C3.7 7.4 5.6 5.4 8 5.4s4.3 2 4.3 5M2.2 10.4h11.6v1.7H2.2zM8 5.4V3.2"/>',
  franchise: '<path d="M2.9 7.1h10.2v6H2.9zM5.6 7.1V4.3h4.8v2.8M6.2 5.5h3.6"/>',
  ballot: '<path d="M4 2.8h8v10.4H4z"/><path d="m6 6.7 1.3 1.3L10 5.3M6 10.5h4"/>',
  union: '<path d="M4.6 13.1V8.3c0-.9.7-1.6 1.6-1.6h3.6c.9 0 1.6.7 1.6 1.6v4.8zM6.1 6.7V4.5a1.1 1.1 0 0 1 2.2 0v2.2M8.3 6.7V5.1a1.1 1.1 0 0 1 2.2 0v1.6"/>',
  debt: '<path d="m5.7 6.4-1.4 1.4a2.4 2.4 0 0 0 3.4 3.4l1.3-1.3M10.3 9.6l1.4-1.4a2.4 2.4 0 0 0-3.4-3.4L7 6.1"/>',
  slavery: '<circle cx="5.6" cy="6.2" r="2.3"/><circle cx="10.4" cy="9.8" r="2.3"/><path d="M13 3 3 13"/>',
  meeting: '<circle cx="5" cy="4.8" r="1.4"/><circle cx="11" cy="4.8" r="1.4"/><path d="M2.4 12.8v-2.1c0-1.2 1-2.2 2.2-2.2h.8c1.2 0 2.2 1 2.2 2.2v2.1M8.4 12.8v-2.1c0-1.2 1-2.2 2.2-2.2h.8c1.2 0 2.2 1 2.2 2.2v2.1"/>',
  child: '<circle cx="8" cy="4.2" r="1.8"/><path d="M5.8 12.9V9.5c0-1.2 1-2.2 2.2-2.2s2.2 1 2.2 2.2v3.4M6.6 10.6h2.8"/>',
  rights: '<path d="M4 3.4h8v9.2H4z"/><path d="M6 6h4M6 8.1h4M6 10.2h2.4"/>',
  border: '<path d="M2.4 5.6h11.2M2.4 10h11.2M4.6 3.4v9.2M8 3.4v9.2M11.4 3.4v9.2"/>',
  press: '<path d="M2.6 3.9h8.8v8.7H2.6z"/><path d="M11.4 6.4h2.1v4.6a1.6 1.6 0 0 1-3.1 0M4.4 6.1h5.2M4.4 8.2h5.2M4.4 10.3h3.2"/>',
};

const glyph = (id) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id] ?? ''}</svg>`;

/* --------------------------------------------------------------------------
   SOL SÜTUN — rejim, meclis, iktidar, pastalar, meseleler
   -------------------------------------------------------------------------- */

/** Bölüm başlığı: bordo laklanmış şerit; defterin her yerinde aynı. */
const band = (title, note = '') => `<h4 class="pol-band">${esc(title)}${
  note ? `<em>${esc(note)}</em>` : ''}</h4>`;

/**
 * Rejim künyesi. "Democracy" bir alan değil, yasaların okunuşudur (bkz.
 * reforms.governmentType) — sandık ve parti yasası neye izin veriyorsa rejimin
 * adı odur. Seçim tarihi hafta sayısından değil, oyunun takviminden gelir.
 */
function governmentBlock(nation, world, { government, register, militancy }) {
  const politics = nation.politics;
  const weeks = Math.max(0, politics.nextElectionTurn - world.turn);
  return `<section class="pol-gov">
    ${band(government)}
    <div class="pol-gov-line">
      <span class="pol-gov-date">Next election is due:
        <b>${esc(gameDate(politics.nextElectionTurn))}</b>
        <em>${weeks} ${weeks === 1 ? 'week' : 'weeks'}</em></span>
      <span class="pol-gov-stats">
        <i class="pol-mini" title="Share of the population enrolled in the electorate — set by the Vote Franchise law">
          ${glyph('franchise')}<b>${Math.round(register.share * 100)}%</b></i>
        <i class="pol-mini${militancy >= 4 ? ' hot' : ''}" title="National militancy, 0–10 — derived from class satisfaction, not simulated directly">
          ${glyph('meeting')}<b>${militancy.toFixed(1)}</b></i>
      </span>
    </div>
  </section>`;
}

/**
 * Üst meclis. Reform kapısının kendisi: bir yasanın çıkması bu pastadaki
 * ideolojilerin yarıdan fazlasının o kademeyi istemesine bağlıdır. Altındaki
 * iki satır referanstaki "Can't enact ... reforms" satırlarının karşılığıdır.
 */
function upperHouseBlock(house, gates) {
  const row = (category, allowed) => `<span class="pol-gate ${allowed ? 'ok' : 'no'}"
    title="${allowed
    ? `At least one ${REFORM_CATEGORIES[category].name.toLowerCase()} law has a majority in the upper house.`
    : `No ${REFORM_CATEGORIES[category].name.toLowerCase()} law can pass the upper house at present.`}">
    <i aria-hidden="true">${allowed ? '✓' : '✕'}</i>${
  allowed ? 'Can enact' : "Can't enact"} ${esc(REFORM_CATEGORIES[category].name.toLowerCase())}</span>`;
  return `<section class="pol-house">
    ${band('Upperhouse', 'seats by ideology')}
    <div class="pol-house-body">
      ${pieChart(house, { size: 78, colorOf: ideologyColor })}
      <div class="pie-legend">${pieLegend(house, { colorOf: ideologyColor, limit: 6 })}</div>
    </div>
    <div class="pol-gates">${row('social', gates.social)}${row('political', gates.political)}</div>
  </section>`;
}

const AXIS_LABEL = {
  trade: 'Trade Policy',
  economy: 'Economic Policy',
  citizenship: 'Citizenship Policy',
  military: 'War Policy',
};

/** İktidar partisi ve programı — referanstaki politika tablosunun karşılığı. */
function rulingBlock(ruler, election) {
  const info = IDEOLOGIES[ruler.ideology];
  const rows = Object.entries(ruler.policies).map(([axis, value]) => {
    const policy = POLITICAL_POLICIES[axis]?.[value];
    return `<tr title="${esc(policy?.desc ?? '')}">
      <td>${esc(AXIS_LABEL[axis] ?? axis)}</td>
      <td class="pol-policy-value">${esc(policy?.name ?? value)}</td>
    </tr>`;
  }).join('');
  return `<section class="pol-party" style="--party-color:${info.color}">
    <div class="pol-party-name">
      <i aria-hidden="true"></i><b>${esc(ruler.name)}</b><small>${esc(info.name)}</small>
      <strong>${ruler.support.toFixed(1)}%</strong>
    </div>
    <button class="pol-election" data-hold-election ${election.allowed ? '' : 'disabled'}
      title="${esc(election.note)}">Hold Election</button>
    <table class="pol-policies">${rows}</table>
  </section>`;
}

/**
 * İki pasta yan yana: kim oy veriyor, kim yaşıyor. Aradaki fark oy hakkı
 * yasasının resmidir — kütük daraldıkça pastalar ayrışır.
 */
function mixesBlock(voters, people, register) {
  // Lejant yok — referansta da yok. Renk anahtarını üstteki üst meclis bloğu
  // zaten taşıyor; iki dar kutuya sıkıştırılan lejant "Conserva…" diye
  // kırpılıyordu (ölçüldü). Dağılımın kendisi başlıkta yazılı.
  const cell = (title, note, slices) => `<div class="pol-mix">
    ${band(title, note)}
    <div class="pol-mix-body" title="${esc(slices.length
    ? slices.map((slice) => `${slice.name} ${pct(slice.share)}`).join('\n')
    : 'No electorate under the current franchise.')}">
      ${pieChart(slices, { size: 84, colorOf: ideologyColor })}
    </div>
  </div>`;
  return `<section class="pol-mixes">
    ${cell("Voters' Ideologies", `${formatPopulation(register.voters)} enrolled`, voters)}
    ${cell("Peoples' Ideologies", formatPopulation(register.people), people)}
  </section>`;
}

/**
 * Önemli meseleler: parti programları ve halkın istediği bir sonraki yasa.
 * Seçmen sütunu kütük boşken "0.0%" değil "—" der: sıfır destek ile sandığın
 * hiç olmaması aynı şey değildir.
 */
function issuesBlock(issues, hasElectorate) {
  const rows = issues.map((issue) => `<tr title="${esc(issue.name)}">
    <td class="pol-issue-name">${esc(issue.name)}</td>
    <td class="num${hasElectorate ? '' : ' void'}">${hasElectorate ? pct(issue.voters) : '—'}</td>
    <td class="num">${pct(issue.people)}</td>
  </tr>`).join('');
  return `<section class="pol-issues">
    ${band('Important Issues')}
    <div class="pol-issues-scroll">
      <table class="pol-issue-table">
        <thead><tr><th>Issue</th><th class="num">Voters</th><th class="num">People</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" class="pol-empty">No issues on the register.</td></tr>'}</tbody>
      </table>
    </div>
  </section>`;
}

/* --------------------------------------------------------------------------
   REFORMS SEKMESİ — yasa merdivenleri
   -------------------------------------------------------------------------- */

/**
 * Tek yasa merdiveni. Kademeler tam sırasıyla listelenir; yürürlükteki ve
 * altındakiler işaretli, bir sonraki basamak meclisten geçiyorsa pirinç ve
 * tıklanabilir, geçmiyorsa kilitli ve nedeni başlıkta yazılı. Referanstaki
 * kutunun aynısı: hiçbir kademe gizlenmez, çünkü ekranın işi merdivenin
 * TAMAMINI göstermektir.
 */
/** Bekleme sayacını okunur süreye çevirir. */
function waitLabel(weeks) {
  if (weeks <= 0) return 'ready';
  if (weeks < 9) return `${weeks} weeks`;
  const months = Math.round(weeks / 4.35);
  return `about ${months} month${months === 1 ? '' : 's'}`;
}

/**
 * Bir sonraki basamağın gerekçesi. Oyuncu neden geçmediğini TAHMİN ETMEK
 * zorunda kalmamalı: kim ne kadar veriyor, baskı ne ekliyor, hangi engel
 * duruyor — hepsi burada. Yüzde tek başına "neden olmuyor"u anlatmıyordu.
 */
function blockReason(status) {
  const lines = [
    `${status.next.name} — ${status.severity} reform`,
    `Support ${pct(status.support)} of ${pct(status.threshold)} required`,
  ];
  const seats = status.contributions
    .filter((c) => c.points >= 0.005)
    .map((c) => `${c.name} ${pct(c.points)}${c.wants ? '' : ' (reluctant)'}`);
  lines.push(seats.length ? seats.join(' · ') : 'no support in the chamber');

  const pressure = [];
  const p = status.pressure;
  if (p.militancy > 0.05) pressure.push(`unrest ${pct(p.militancy)}`);
  if (p.movement > 0.05) pressure.push(`movement ${pct(p.movement)}`);
  if (p.fatigue > 0.01) pressure.push(`fatigue −${pct(p.fatigue * 0.25)}`);
  if (p.government) {
    pressure.push(`government ${p.government > 0 ? '+' : ''}${pct(p.government)} threshold`);
  }
  if (pressure.length) lines.push(`Pressure: ${pressure.join(' · ')}`);

  if (status.blocked === 'cooldown') {
    lines.push(`Institutions are still adjusting to the previous reform — ${waitLabel(status.cooldownLeft)}`);
  } else if (status.blocked === 'support') {
    lines.push('Blocked: the chamber will not carry it yet');
  } else {
    lines.push('Ready to enact');
  }
  if (status.emergency) lines.push('Crisis has shortened the usual delay');
  return lines.join('\n');
}

export function reformLadder(status) {
  const { group, current, next } = status;
  const steps = group.steps.map((step) => {
    const done = step.index <= current.index;
    const isNext = next && step.index === next.index;
    const enact = isNext && status.canEnact;
    const title = isNext ? blockReason(status) : `${step.name}\n${step.effect}`;
    const mark = done ? '<i class="rstep-mark on" aria-hidden="true">✓</i>'
      : '<i class="rstep-mark" aria-hidden="true"></i>';
    const cls = done ? (step.index === current.index ? 'is-current' : 'is-past')
      : enact ? 'is-open' : isNext ? 'is-blocked' : 'is-locked';
    // Kilitli basamakta rakam yerine ENGELİN kendisi durur.
    const badge = !isNext ? ''
      : status.blocked === 'cooldown'
        ? `<em class="rstep-wait">${esc(waitLabel(status.cooldownLeft))}</em>`
        : `<em>${pct(status.support)}<small>/${pct(status.threshold)}</small></em>`;
    if (enact) {
      return `<li class="rstep ${cls}"><button data-reform="${group.id}" title="${esc(title)}">
        ${mark}<span>${esc(step.name)}</span>${badge}</button></li>`;
    }
    return `<li class="rstep ${cls}" title="${esc(title)}">${mark}<span>${esc(step.name)}</span>${badge}</li>`;
  }).join('');
  const state = status.complete ? '' : status.blocked ? ` is-${status.blocked}` : ' is-ready';
  return `<article class="reform${status.complete ? ' is-complete' : ''}${state}">
    <header class="reform-head"><i class="reform-icon">${glyph(group.icon)}</i>
      <h5>${esc(group.name)}</h5></header>
    <ol class="reform-steps">${steps}</ol>
  </article>`;
}

function reformColumn(category, board) {
  const rows = board.filter((status) => status.group.category === category);
  return `<section class="pol-col pol-col-${category}">
    ${band(REFORM_CATEGORIES[category].name)}
    <div class="pol-reform-grid">${rows.map(reformLadder).join('')}</div>
  </section>`;
}

/**
 * Bütün kapılar kapalıysa ekran nedenini söylemeli. Yoksa oyuncu yirmi bir
 * merdivenin hiçbirinde düğme bulamaz ve ekranı bozuk sanar — kilidin siyasi
 * bir kilit olduğunu ve nasıl açılacağını burada yazıyoruz.
 */
function reformNote(board, house, houseLaw) {
  if (board.some((row) => row.canEnact)) {
    return `<p class="pol-note">A law is enacted one step at a time and never repealed.
      The step opens when the ideologies that want it hold more than half of the upper
      house — and the composition of that house is itself the Upper House law.
      <em>Enacted laws feed the economy: wages, factory output, class mood and the
      social budget all move with them.</em></p>`;
  }
  const top = house[0];
  const appointed = houseLaw === 'party_appointed' || houseLaw === 'appointed';
  return `<p class="pol-note blocked"><b>No law can pass this upper house.</b>
    The chamber is ${top ? `${pct(top.share)} ${esc(top.name.toLowerCase())}` : 'empty'}, and every
    remaining step falls short of a majority.${appointed
    ? ' Its seats follow the ruling party, so the chamber changes when the government does — win an election, or widen the house through the Upper House law once that becomes possible.'
    : ' It follows the population, so it changes as classes grow, prosper or radicalise.'}
    <em>This is a political lock, not a bug.</em></p>`;
}

export function reformsTab(board, house, houseLaw) {
  return `<div class="pol-reforms">
    <div class="pol-reform-columns">
      ${reformColumn('social', board)}
      ${reformColumn('political', board)}
    </div>
    ${reformColumn('state', board)}
    ${reformNote(board, house, houseLaw)}
  </div>`;
}

/* --------------------------------------------------------------------------
   ÖBÜR SEKMELER
   -------------------------------------------------------------------------- */

/** Hareketler: bir sonraki yasayı isteyen ama alamayan halkın örgütlü kısmı. */
export function movementsTab({ militancy, movements }) {
  if (!movements.length) {
    return `<div class="pol-tab-empty">${band('Movements')}
      <p>No movement has formed. Every law the population wants is either already
        enacted or wanted by too few to organise.</p></div>`;
  }
  const rows = movements.map((movement) => `<div class="pol-movement${movement.blocked ? ' blocked' : ''}">
    <i class="reform-icon">${glyph(movement.icon)}</i>
    <div class="pol-movement-body">
      <b>${esc(movement.step)}</b>
      <small>${esc(movement.name)} · ${pct(movement.demand)} of the population wants it</small>
      <span class="pol-movement-bar"><i style="width:${(movement.support * 100).toFixed(1)}%"></i></span>
    </div>
    <div class="pol-movement-num">
      <span><small>support</small><b>${pct(movement.support)}</b></span>
      <span><small>house</small><b class="${movement.blocked ? 'res-neg' : 'res-pos'}">${pct(movement.houseSupport)}</b></span>
    </div>
  </div>`).join('');
  return `<div class="pol-movements">
    ${band('Movements', `national militancy ${militancy.toFixed(1)} / 10`)}
    ${rows}
    <p class="pol-note">Movements are derived from what the population wants and how
      unsatisfied it is; they are an indicator, not a simulated organisation.
      <em>They cannot yet rise in revolt.</em></p>
  </div>`;
}

/* --------------------------------------------------------------------------
   ÇERÇEVE
   -------------------------------------------------------------------------- */

// "Decisions" (bos kayit defteri) ve "Release Nations" (kalici kapali
// dugmeler) sekmeleri kaldirildi: iki beta boyunca oyuncuya tek bir eylem
// sunmadilar. Olay sistemi ya da ulus-birakma gercekten kurulunca sekmeleri
// icerikleriyle birlikte geri gelir.
export const POLITICS_TABS = [
  ['reforms', 'Reforms'],
  ['movements', 'Movements'],
];

function tabBar(active) {
  return `<nav class="pol-tabs">${POLITICS_TABS.map(([id, label]) => `
    <button data-politics-tab="${id}" class="${active === id ? 'active' : ''}"
      aria-pressed="${active === id}">${label}</button>`).join('')}</nav>`;
}

/**
 * Ekranın tamamı. `state` Screens örneğinde yaşar (yalnız açık sekme).
 * `board` dışarıdan verilir: aynı hesap sekme çubuğu, kapılar ve meseleler
 * tarafından paylaşılır, üç kez kurulmaz.
 */
export function politicsScreen(world, nation, state, board) {
  const ruler = rulingParty(nation);
  const house = upperHouse(nation);
  const register = electorate(nation);
  const movements = reformMovements(nation, { board });
  const gates = {
    social: canEnactCategory(nation, 'social', board),
    political: canEnactCategory(nation, 'political', board),
  };
  const weeks = Math.max(0, nation.politics.nextElectionTurn - world.turn);
  // Erken seçim ancak sandığın gölgesinde: son haftalarda ya da vadesi geçmişse.
  const election = {
    allowed: state.electionWindow && state.hasElectorate,
    note: !state.hasElectorate
      ? 'There is no electorate: no election can be held under the current franchise.'
      : state.electionWindow
        ? 'Call the election now instead of waiting for the due date.'
        : `The election is ${weeks} weeks away; it can be called in the last ${state.electionWindowWeeks} weeks.`,
  };

  const body = state.tab === 'movements' ? movementsTab(movements)
    : reformsTab(board, house, reformValue(nation, 'upper_house'));

  return `<div class="pol">
    <aside class="pol-left">
      ${governmentBlock(nation, world, {
    government: state.government, register, militancy: movements.militancy,
  })}
      ${upperHouseBlock(house, gates)}
      ${rulingBlock(ruler, election)}
      ${mixesBlock(voterMix(nation), peopleMix(nation), register)}
      ${issuesBlock(importantIssues(nation, { board }), state.hasElectorate)}
    </aside>
    <section class="pol-right">
      ${tabBar(state.tab)}
      <div class="pol-panel">${body}</div>
    </section>
  </div>`;
}
