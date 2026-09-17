// Siyaset ekranı: hükûmet ve beş yasa.
//
// Eskiden Victoria 2'nin Politics penceresini birebir izliyordu (üst meclis,
// iki ideoloji pastası, mesele tablosu, 18 yasa merdiveni, hareketler). Şimdi
// oyuncunun iki kararı var ve ekran yalnız onları gösterir: solda hangi
// partiyle yönetileceği, sağda beş yasanın kademesi (bkz. game/politics.js).
//
// Bu dosya yalnız ÇİZER. Destek, meşruiyet bedeli, tavanlar, kilitler ve
// "bu kademe ne verir" farkları game/politics.js'ten hazır gelir; burada
// hiçbir eşik ya da katsayı yoktur. Her kapalı düğme nedenini yazar.

import { gameDate } from './hud.js';

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

const points = (value) => `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}`;

/* --------------------------------------------------------------------------
   PİKTOGRAM — yasa başına bir figür, 16px, tek renk, 1.3 stroke.
   -------------------------------------------------------------------------- */
const GLYPH = {
  house: '<path d="M2.4 6.1 8 2.9l5.6 3.2M3.6 6.9v4.8M6.5 6.9v4.8M9.5 6.9v4.8M12.4 6.9v4.8M2.4 12.6h11.2"/>',
  union: '<path d="M4.6 13.1V8.3c0-.9.7-1.6 1.6-1.6h3.6c.9 0 1.6.7 1.6 1.6v4.8zM6.1 6.7V4.5a1.1 1.1 0 0 1 2.2 0v2.2M8.3 6.7V5.1a1.1 1.1 0 0 1 2.2 0v1.6"/>',
  health: '<path d="M6.4 3h3.2v3.4H13v3.2H9.6V13H6.4V9.6H3V6.4h3.4z"/>',
  rights: '<path d="M4 3.4h8v9.2H4z"/><path d="M6 6h4M6 8.1h4M6 10.2h2.4"/>',
  conscript: '<path d="M2.8 10.4h10.4M3.7 10.4C3.7 7.4 5.6 5.4 8 5.4s4.3 2 4.3 5M2.2 10.4h11.6v1.7H2.2zM8 5.4V3.2"/>',
  lock: '<path d="M4 7.2h8v6H4z"/><path d="M5.8 7.2V5.4a2.2 2.2 0 0 1 4.4 0v1.8"/>',
};

const glyph = (id) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GLYPH[id] ?? ''}</svg>`;

/** Bölüm başlığı: bordo laklanmış şerit; defterin her yerinde aynı. */
const band = (title, note = '') => `<h4 class="pol-band">${esc(title)}${
  note ? `<em>${esc(note)}</em>` : ''}</h4>`;

/** Kilidin okunur süresi: haftalar kısa, aylar uzun bekleme için. */
function waitLabel(weeks) {
  if (weeks <= 0) return 'now';
  if (weeks < 9) return `in ${weeks} week${weeks === 1 ? '' : 's'}`;
  const months = Math.round(weeks / 4.35);
  return `in about ${months} month${months === 1 ? '' : 's'}`;
}

/* --------------------------------------------------------------------------
   HÜKÛMET
   -------------------------------------------------------------------------- */

/**
 * Meşruiyet satırı: oyuncunun partiyi seçerken göze aldığı tek bedel. Sayı
 * istikrar tooltip'indeki "Government backing" kalemiyle aynı kaynaktan gelir.
 */
function legitimacyLine(view) {
  const { legitimacy, ruling } = view;
  if (!ruling) return '';
  const leads = !legitimacy.leader || legitimacy.leader.id === ruling.id;
  return `<div class="pol-legit ${leads ? 'ok' : 'bad'}">
    <p>${leads
    ? `<b>The ${esc(ruling.name)}</b> hold the most backing: <b>${ruling.support.toFixed(0)}%</b>. Governing costs no stability.`
    : `<b>The ${esc(legitimacy.leader.name)}</b> lead with <b>${legitimacy.leader.support.toFixed(0)}%</b>
       against your ${esc(ruling.name)}' <b>${ruling.support.toFixed(0)}%</b>:
       stability <b class="res-neg">${points(legitimacy.hit)}</b> while this lasts.`}</p>
    <small>${esc(legitimacy.note)}</small>
  </div>`;
}

function partyCard(party, view, confirm) {
  const confirming = confirm === `gov:${party.id}`;
  const caps = party.caps.map((cap) => `<li class="${cap.max >= 2 ? 'full' : cap.max === 0 ? 'none' : ''}">
    <span>${esc(cap.law)}</span><b>${esc(cap.cap)}</b></li>`).join('');
  let action;
  if (party.ruling) {
    action = '<span class="pol-form is-ruling">In government</span>';
  } else if (party.blocked) {
    action = `<span class="pol-form is-blocked">${esc(party.blocked)}</span>`;
  } else {
    const cost = party.hit < -0.0005 ? ` · stability ${points(party.hit)}` : ' · no stability cost';
    action = `<button class="pol-form${confirming ? ' is-confirming' : ''}" data-form-government="${esc(party.id)}">${confirming
      ? `Click again — the ${esc(party.name)} then govern for four years${cost}`
      : 'Form government'}</button>`;
  }
  return `<article class="pol-party${party.ruling ? ' is-ruling' : ''}${party.leader ? ' is-leader' : ''}"
    style="--party-color:${party.color}">
    <header class="pol-party-head">
      <i aria-hidden="true"></i><b>${esc(party.name)}</b>
      ${party.leader ? '<small>most backed</small>' : ''}
      <strong>${party.support.toFixed(1)}%</strong>
    </header>
    <span class="pol-party-bar" aria-hidden="true"><i style="width:${Math.min(100, party.support).toFixed(1)}%"></i></span>
    <p class="pol-pitch">${esc(party.pitch)}</p>
    <p class="pol-programme">${esc(party.summary)}</p>
    <ul class="pol-caps" aria-label="Highest level of each law this government allows">${caps}</ul>
    ${action}
  </article>`;
}

function governmentColumn(view, confirm) {
  const lock = view.lockWeeks > 0
    ? `The next change of government is possible on <b>${esc(gameDate(view.lockTurn))}</b> (${view.lockWeeks} weeks).`
    : 'The government may be changed now. A new government serves <b>four years</b>.';
  return `<section class="pol-gov">
    ${band('Government', view.government)}
    ${legitimacyLine(view)}
    <p class="pol-lock">${lock}</p>
    <div class="pol-parties">${view.parties.map((party) => partyCard(party, view, confirm)).join('')}</div>
  </section>`;
}

/* --------------------------------------------------------------------------
   YASALAR
   -------------------------------------------------------------------------- */

/**
 * Farkın adı ve yönü. `good` "artması iyi mi": ücret faturasının artması
 * yeşil olsaydı tablo yalan söylerdi. Sayıların hiçbiri burada üretilmez.
 */
const EFFECT_LABEL = {
  lowerMood: { name: 'Workers', good: true, kind: 'mood' },
  middleMood: { name: 'Middle class', good: true, kind: 'mood' },
  upperMood: { name: 'Elite', good: true, kind: 'mood' },
  throughput: { name: 'Industry output', good: true, kind: 'pct' },
  wageCost: { name: 'Wage bill', good: false, kind: 'pct' },
  socialBurden: { name: 'Treasury commitment', good: false, kind: 'pct' },
  manpower: { name: 'Manpower', good: true, kind: 'pct' },
  literacyFloor: { name: 'Literacy floor', good: true, kind: 'pct' },
  researchRate: { name: 'Research', good: true, kind: 'pct' },
  minorityCeiling: { name: 'Minority loyalty', good: true, kind: 'pct' },
};

function effectChips(delta) {
  if (!delta) return '';
  return Object.entries(delta)
    .filter(([key]) => EFFECT_LABEL[key])
    // Büyükten küçüğe: oyuncunun önce görmesi gereken en ağır sonuçtur.
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    .map(([key, value]) => {
      const meta = EFFECT_LABEL[key];
      const helps = meta.good ? value > 0 : value < 0;
      const shown = meta.kind === 'mood' ? points(value) : `${points(value)}%`;
      return `<span class="pol-eff ${helps ? 'up' : 'down'}"><small>${esc(meta.name)}</small><b>${shown}</b></span>`;
    }).join('');
}

function levelCell(row, level, confirm) {
  const key = `law:${row.law.id}:${level.id}`;
  const confirming = confirm === key;
  if (level.state === 'current') {
    return `<div class="pol-level is-current">
      <span class="pol-level-name"><i aria-hidden="true">✓</i>${esc(level.name)}</span>
      <small class="pol-level-note">in force</small>
    </div>`;
  }
  const chips = `<span class="pol-effects">${effectChips(level.delta)}</span>`;
  if (level.blocked) {
    const beyond = level.state === 'beyond';
    return `<div class="pol-level ${beyond ? 'is-beyond' : 'is-waiting'}${level.wanted ? ' is-wanted' : ''}">
      <span class="pol-level-name">${beyond ? `<i class="pol-lock-icon">${glyph('lock')}</i>` : ''}${esc(level.name)}</span>
      <small class="pol-level-note">${esc(level.wanted ? `Chosen, suspended — ${level.blocked}` : level.blocked)}</small>
      ${chips}
    </div>`;
  }
  return `<button class="pol-level is-open${confirming ? ' is-confirming' : ''}" data-set-law="${esc(row.law.id)}:${esc(level.id)}">
    <span class="pol-level-name">${esc(level.name)}</span>
    <small class="pol-level-note">${confirming ? 'Click again — this law then waits a year' : 'Enact'}</small>
    ${chips}
  </button>`;
}

function lawRow(row, confirm) {
  const current = row.law.levels[row.current];
  const lock = row.lockWeeks > 0 ? `<em>changes again ${esc(waitLabel(row.lockWeeks))}</em>` : '';
  return `<article class="pol-law${row.lockWeeks > 0 ? ' is-locked' : ''}">
    <header class="pol-law-head">
      <i class="pol-law-icon">${glyph(row.law.icon)}</i>
      <h5>${esc(row.law.name)}</h5>
      ${lock}
    </header>
    <p class="pol-law-now">${esc(current.effect)}</p>
    <div class="pol-levels">${row.levels.map((level) => levelCell(row, level, confirm)).join('')}</div>
  </article>`;
}

function lawsColumn(board, confirm) {
  return `<section class="pol-laws">
    ${band('Laws', 'each law can change once a year · the government sets the highest level')}
    ${board.map((row) => lawRow(row, confirm)).join('')}
  </section>`;
}

/* --------------------------------------------------------------------------
   ÇERÇEVE
   -------------------------------------------------------------------------- */

/**
 * Ekranın tamamı. `view` = politics.governmentView, `board` = politics.lawBoard;
 * `confirm` Screens örneğinde yaşayan bekleyen iki tıklı onaydır.
 */
export function politicsScreen(view, board, confirm = null) {
  return `<div class="pol">
    ${governmentColumn(view, confirm)}
    ${lawsColumn(board, confirm)}
  </div>`;
}
