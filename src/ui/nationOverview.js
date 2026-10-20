// ÜLKE ÖZETİ (Nation Overview) — bayrağa basınca açılan vitrin ekranı.
//
// Veri game/nationOverview.js'ten gelir; burada yalnız çizim, sanat yuvaları
// ve oturumun bildirim halkası durur. Ekran haftalık tazelemede baştan
// kurulur, o yüzden her kutunun boyu değerden bağımsızdır: satır sayıları
// sabit, uzun metin tek satır + bilgi kartı (bkz. hexwar arayüz ilkesi).
//
// SANAT YUVALARI: her panelin arka planı bir resimdir. Ekranın kendi
// sahneleri `assets/overview/` altındadır; henüz sahnesi olmayan yuva menü
// setinden ödünç alır (aynı soğuk, yağmurlu ton — yan yana yamalı durmaz).
// `pos` resmin panelde görünen kısmını seçer (background-position).

import { NOTIFY } from '../game/notifications.js';
import { RECENT_EVENTS, nationOverview, recentEvents } from '../game/nationOverview.js';
import { formatPopulation } from '../game/economy.js';
import { dateOfTurn } from '../game/calendar.js';
import { NOTIFY_GLYPH, glyph } from './icons/glyphs.js';
import { resourceArt } from './icons/art.js';

export const OVERVIEW_ART = {
  hero: { src: 'assets/overview/hero.jpg', pos: '50% 38%' },
  score: { src: 'assets/menu/palace-hall.jpg', pos: '50% 45%' },
  industry: { src: 'assets/overview/industry.jpg', pos: '55% 45%' },
  population: { src: 'assets/overview/population.jpg', pos: '45% 55%' },
  forces: { src: 'assets/menu/main-menu.jpg', pos: '35% 50%' },
  prestige: { src: 'assets/overview/prestige.jpg', pos: '70% 55%' },
  land: { src: 'assets/overview/land.jpg', pos: '75% 62%' },
  outlook: { src: 'assets/menu/coast-fort.jpg', pos: '60% 50%' },
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Oturumun bildirim halkası: türü (ikon, ton) yalnız bildirim anında bilinir. */
const session = [];

/**
 * Bildirimleri dinler. Tur günlüğü (`turns.log`) yalnız metin tutuyor; ikon
 * ve ton için olayın türü gerekir, o da yalnız `notify` anında elde.
 */
export function trackOverviewEvents(game) {
  game.on('notify', ({ entry }) => {
    if (!entry) return;
    const title = entry.title ?? entry.text;
    const turn = game.turns?.turn ?? entry.turn ?? 0;
    const last = session[session.length - 1];
    if (last && last.turn === turn && last.title === title) return;
    session.push({ turn, kind: entry.kind, title });
    if (session.length > RECENT_EVENTS * 4) session.shift();
  });
  game.on('world', () => { session.length = 0; });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function dateLabel(turn) {
  const date = dateOfTurn(turn);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function pct(value) {
  return `${Math.round(value * 100)}%`;
}

function signed(value, digits = 0) {
  const text = Math.abs(value).toFixed(digits);
  return `${value < 0 ? '−' : '+'}${text}`;
}

function art(slot) {
  const def = OVERVIEW_ART[slot];
  if (!def) return '';
  // Adres satır içi stilde: özel özellikte (`--art: url()`) göreli adres
  // onu KULLANAN stil dosyasına göre çözülür (src/assets/... → 404).
  return `<span class="nov-art" style="background-image:url('${def.src}');background-position:${def.pos}" aria-hidden="true"></span>`;
}

function tip(text) {
  return `data-tip="text" data-tip-text="${esc(text)}"`;
}

const FLOURISH = `<svg class="nov-curl" viewBox="0 0 44 24" aria-hidden="true">
  <path d="M0 12c9 0 11-7 17-7 5 0 7 4 4 7-3 3-8 1-7-2M0 12c9 0 11 7 17 7 5 0 7-4 4-7" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
  <path d="M28 12l6-4.5 6 4.5-6 4.5z" fill="currentColor"/></svg>`;

/**
 * Gönder başı: mızrak ucu + bilezik + top, ve ondan sarkan altın kordon ile
 * püskül. Bayrağın gönder kenarı kıpırdamaz (flagWave: genlik soldan artar),
 * o yüzden kordon durağan SVG olarak bezin önünde durabilir.
 */
const FINIAL = `<svg class="nov-finial" viewBox="0 0 64 150" aria-hidden="true">
  <defs>
    <linearGradient id="nov-gold" x1="0" x2="1" y1="0" y2="0">
      <stop offset="0" stop-color="#6e5226"/><stop offset=".42" stop-color="#f6dfa0"/>
      <stop offset=".6" stop-color="#d4ad5e"/><stop offset="1" stop-color="#5f461f"/>
    </linearGradient>
    <linearGradient id="nov-cord" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="#e9c97c"/><stop offset="1" stop-color="#a47b35"/>
    </linearGradient>
  </defs>
  <path d="M14 1c3 7 7 13 7 20 0 5-3 8-7 8s-7-3-7-8c0-7 4-13 7-20z" fill="url(#nov-gold)" stroke="#3e2d12" stroke-width=".7"/>
  <path d="M14 5v20" stroke="#fff3cf" stroke-opacity=".55" stroke-width=".8"/>
  <rect x="8.5" y="29" width="11" height="3.2" rx="1.2" fill="url(#nov-gold)" stroke="#3e2d12" stroke-width=".5"/>
  <circle cx="14" cy="37" r="5" fill="url(#nov-gold)" stroke="#3e2d12" stroke-width=".6"/>
  <rect x="9.5" y="42" width="9" height="3" rx="1" fill="url(#nov-gold)" stroke="#3e2d12" stroke-width=".5"/>
  <path d="M17 44c10 6 16 22 11 40-3 11-9 17-6 27" fill="none" stroke="#3e2d12" stroke-width="3.2" stroke-linecap="round" opacity=".55"/>
  <path d="M17 44c10 6 16 22 11 40-3 11-9 17-6 27" fill="none" stroke="url(#nov-cord)" stroke-width="2" stroke-linecap="round"/>
  <path d="M17 44c10 6 16 22 11 40-3 11-9 17-6 27" fill="none" stroke="#fff1c4" stroke-width=".6" stroke-dasharray="1.4 2.2" stroke-opacity=".7"/>
  <circle cx="22" cy="112" r="3.6" fill="url(#nov-gold)" stroke="#3e2d12" stroke-width=".6"/>
  <path d="M19.5 115h5l3 24h-11z" fill="url(#nov-gold)" stroke="#3e2d12" stroke-width=".6"/>
  <path d="M18.5 121l-1 18M20.6 121l-.6 18M22.5 121v18M24.4 121l.6 18M26.4 121l1 18" stroke="#5a4119" stroke-width=".55" stroke-opacity=".8"/>
  <rect x="18.6" y="118" width="7" height="2.2" rx=".8" fill="#f1d58c" stroke="#3e2d12" stroke-width=".4"/>
</svg>`;

const FLEUR = `<svg class="nov-fleur" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 1.5c-2.2 2.6-2.8 5.4-1.2 8.6-2.1-1.6-4.9-1.6-6.4.2 2.1-.1 3.7 1 4.2 3.2H6.9v1.6h3.5c-.4 2.2-1.6 3.8-3.5 4.9h10.2c-1.9-1.1-3.1-2.7-3.5-4.9h3.5V13.5h-1.7c.5-2.2 2.1-3.3 4.2-3.2-1.5-1.8-4.3-1.8-6.4-.2 1.6-3.2 1-6-1.2-8.6z"/></svg>`;

function panelHead(icon, title, extra = '') {
  return `<header class="nov-head">${glyph(icon, 'nov-head-icon')}<h4>${title}</h4>${extra}</header>`;
}

function linkButton(screen, label) {
  return `<button class="nov-link" data-open-screen="${screen}">${label}<span aria-hidden="true">→</span></button>`;
}

/**
 * İlişki sütunu: iki bayrak yuvası ve "+N more" satırı hep durur. Savaş
 * sütunundaki bayrak barış masasını açar — ekran açıkken üstteki savaş
 * çipleri gizlidir (overview.css), onların işini bu bayraklar görür.
 */
function relationColumn(world, label, icon, tone, ids, empty, scores = null) {
  const shown = ids.slice(0, 2);
  const rest = ids.slice(2);
  const flags = shown.map((id) => {
    const nation = world.nations[id];
    const score = scores?.[id];
    const action = score != null
      ? `data-peace="${id}" ${tip(`${nation.name}\nWar score ${score >= 0 ? '+' : ''}${score}\nOpen peace talks`)}`
      : `data-nation="${id}" ${tip(`${nation.name}\nOpen the dossier`)}`;
    return `<button class="nov-rel-flag" ${action}>
      <span data-flag-nation="${id}" data-flag-w="46" data-flag-h="31" data-flag-style="crest"></span>${score != null
        ? `<small class="nov-war-score ${score > 8 ? 'pos' : score < -8 ? 'neg' : ''}">${score >= 0 ? '+' : ''}${score}</small>` : ''}</button>`;
  }).join('');
  const more = rest.length
    ? `<small class="nov-rel-more" ${tip(rest.map((id) => world.nations[id].name).join('\n'))}>+${rest.length} more</small>`
    : '<small class="nov-rel-more">&nbsp;</small>';
  return `<div class="nov-rel tone-${tone}">
      <span class="nov-rel-badge">${glyph(icon)}</span>
      <b>${label}</b>
      <div class="nov-rel-flags">${flags || `<em>${empty}</em>`}</div>
      ${more}
    </div>`;
}

function statCard(slot, icon, label, value, sub, tipText) {
  return `<div class="nov-panel nov-stat" ${tip(tipText)}>
      ${art(slot)}
      <span class="nov-stat-icon">${glyph(icon)}</span>
      <div class="nov-stat-text"><span>${label}</span><b>${value}</b><small>${sub}</small></div>
    </div>`;
}

function stateRow(icon, label, value, cls = '') {
  return `<div class="nov-row${cls ? ` ${cls}` : ''}">${glyph(icon)}<span>${label}</span><b>${value}</b></div>`;
}

/**
 * Ekranın HTML'i. Etkileşimler Screens.bind'in genel kancalarındadır:
 * `data-nation` (dosya), `data-open-screen`, `data-focus-capital`.
 */
export function renderNationOverview(game, me) {
  const world = game.world;
  const view = nationOverview(world, me);
  const { score, state, relations } = view;
  const years = Math.max(0, view.endYear - view.year);

  const title = `<header class="nov-title">
      <span class="nov-flourish">${FLOURISH}</span>
      <div><h2>Nation Overview</h2>
        <p>${view.year} <i>•</i> ${years} years to ${view.endYear} <i>•</i> ${state.wars.length ? 'At war' : 'At peace'}</p></div>
      <span class="nov-flourish is-right">${FLOURISH}</span>
    </header>`;

  const hero = `<section class="nov-panel nov-hero">
      ${art('hero')}
      <span class="nov-hero-shade" aria-hidden="true"></span>
      <div class="nov-standard" aria-hidden="true">
        <i class="nov-pole"></i>
        <span class="nov-flag" data-flag-nation="${me.id}" data-flag-w="216" data-flag-h="144" data-flag-style="banner"></span>
        <i class="nov-ring is-top"></i><i class="nov-ring is-mid"></i><i class="nov-ring is-low"></i>
        ${FINIAL}
      </div>
      <div class="nov-identity">
        <h3>${esc(view.fullName)}</h3>
        <div class="nov-meta">
          <span>${glyph('people')}${esc(view.culture)}</span><i>•</i>
          <span>${glyph('column')}${esc(view.government)}</span>
        </div>
        <div class="nov-meta"><span>${glyph('ballot')}${esc(view.party)}</span></div>
        <p class="nov-intro">${esc(view.intro)} <em>${esc(view.line)}</em></p>
      </div>
      ${FLEUR}
    </section>`;

  const diplomacy = `<section class="nov-panel nov-relations">
      ${panelHead('scroll', 'Diplomacy &amp; Relations', linkButton('diplomacy', 'View Diplomacy'))}
      <div class="nov-rel-cols">
        ${relationColumn(world, 'Allies', 'handshake', 'ally', relations.allies, 'No allies')}
        ${relationColumn(world, 'Rivals', 'swords', 'rival', relations.rivals, 'No rivals')}
        ${relationColumn(world, 'At War', 'flag', 'war', relations.wars, 'At peace', relations.warScores)}
      </div>
    </section>`;

  const parts = score.parts;
  const ic = view.industry;
  const trendText = ic.trend
    ? `\n${signed(ic.trend.change * 100)}% over the past ${ic.trend.weeks} weeks`
    : '';
  const stats = `<div class="nov-stats">
      ${statCard('score', 'crown', 'Score', String(score.total),
        score.rank ? `Rank ${score.rank} of ${score.of}` : 'Unranked',
        `Hegemony score\nIndustry ${parts?.industry ?? 0} · population ${parts?.population ?? 0} · core provinces ${parts?.land ?? 0} · prestige ${parts?.prestige ?? 0}${parts?.goal ? ` · goal ${parts.goal}` : ''}\n${score.rank === 1 ? 'You lead the powers.' : `${score.leaderName} leads with ${score.leader}.`} The leader in ${view.endYear} wins.`)}
      ${statCard('industry', 'factory', 'Industry', ic.ic.toFixed(1), `IC <i>•</i> ${ic.points} points`,
        `Industrial capacity\n${ic.ic.toFixed(1)} IC worth ${ic.points} score points${trendText}`)}
      ${statCard('population', 'people', 'Population', formatPopulation(view.population.total),
        `${view.population.cities} ${view.population.cities === 1 ? 'city' : 'cities'}`,
        `Population\n${formatPopulation(view.population.total)} people, ${parts?.population ?? 0} score points`)}
      ${statCard('forces', 'swords', 'Armed Forces', String(view.forces.divisions),
        `Power ${view.forces.power.toFixed(1)}${view.forces.ships ? ` <i>•</i> ${view.forces.ships} ships` : ''}`,
        `Armed forces\n${view.forces.divisions} divisions · ${view.forces.ships} ships\nMilitary power ${view.forces.power.toFixed(1)}`)}
      ${statCard('prestige', 'laurel', 'Prestige', String(view.prestige), 'Wars, agenda, discoveries',
        `Prestige\nEarned by winning wars, completing the agenda and being first to a discovery. Each point is worth a score point.`)}
      ${statCard('land', 'column', 'Core Provinces', String(view.land.cores), `${view.land.provinces} provinces held`,
        `Core provinces\nEach core province is worth a score point; ${view.land.provinces} provinces are held in all.`)}
    </div>`;

  const resources = `<section class="nov-panel nov-resources">
      <header class="nov-res-head">${glyph('crate', 'nov-head-icon')}
        <div><h4>Strategic Resources</h4><small>Share of national need covered</small></div></header>
      <div class="nov-res-grid">
        ${view.resources.map((row) => {
          const cls = row.ratio == null ? 'is-none' : row.ratio < 0.5 ? 'is-low' : row.ratio < 0.9 ? 'is-short' : '';
          return `<div class="nov-res ${cls}" ${tip(`${row.name}\n${row.ratio == null ? 'No current need' : `${pct(row.ratio)} of national need covered`}`)}>
            ${resourceArt(row.id, 'md')}
            <div><small>${esc(row.name)}</small><b>${row.ratio == null ? '—' : pct(row.ratio)}</b></div>
          </div>`;
        }).join('')}
      </div>
    </section>`;

  const infamyCls = state.infamy >= state.infamyCap * 0.6 ? 'is-bad' : '';
  const goal = view.goal;
  const nationState = `<section class="nov-panel nov-state">
      ${panelHead('shield', 'State of the Nation', goal ? `<small class="nov-head-note">Goal: ${esc(goal.name)}</small>` : '')}
      <div class="nov-rows">
        ${stateRow('column', 'Capital', state.capital
          ? `<button class="nov-capital" data-focus-capital="1" ${tip('Show the capital on the map')}>${esc(state.capital)}${glyph('map')}</button>`
          : 'Lost', state.capital ? '' : 'is-bad')}
        ${stateRow('factory', 'Output', `<span ${tip(`Output
${state.output} IC a week: handwork, industry and the crown.
Development fund: ${state.fund} IC.`)}>${state.output} IC/wk <small>fund ${state.fund}</small></span>`)}
        ${stateRow('scales', 'Stability', pct(state.stability), state.stability < 0.4 ? 'is-bad' : '')}
        ${stateRow('shield', 'War Support', pct(state.warSupport))}
        ${stateRow('warning', 'Infamy', `${state.infamy.toFixed(1)} <small>/ ${state.infamyCap}</small>`, infamyCls)}
        ${stateRow('swords', 'Wars', state.wars.length
          ? `<span class="nov-ellipsis" ${tip(state.wars.join('\n'))}>${esc(state.wars.join(', '))}</span>`
          : 'At peace', state.wars.length ? 'is-bad' : '')}
        ${stateRow('medal', 'National Goal', goal
          ? `<span class="nov-goal" ${tip(`${goal.name}${goal.met ? ' — achieved' : ''}\n${goal.desc}\nWorth ${goal.bonus} score points.`)}>${esc(goal.desc)}</span>`
          : '—', 'is-goal')}
      </div>
    </section>`;

  const events = recentEvents(me, session, game.turns?.log ?? []);
  const eventRows = [];
  for (let i = 0; i < RECENT_EVENTS; i++) {
    const row = events[i];
    if (!row) {
      eventRows.push(`<li class="is-empty"><span></span><span>${i === 0 ? 'Nothing of note yet.' : ''}</span><time></time></li>`);
      continue;
    }
    const tone = NOTIFY[row.kind]?.tone ?? 'info';
    eventRows.push(`<li class="tone-${tone}" ${tip(row.title)}>${glyph(NOTIFY_GLYPH[row.kind] ?? 'info')}
      <span>${esc(row.title)}</span><time>${dateLabel(row.turn)}</time></li>`);
  }
  const recent = `<section class="nov-panel nov-events">
      ${panelHead('burst', 'Recent Events', linkButton('chronicle', 'View All Events'))}
      <ol class="nov-event-list">${eventRows.join('')}</ol>
    </section>`;

  const outlook = `<section class="nov-panel nov-outlook">
      ${art('outlook')}
      <span class="nov-outlook-shade" aria-hidden="true"></span>
      ${panelHead('gear', 'Strategic Outlook')}
      <div class="nov-outlook-text">
        ${view.outlook.map((line) => `<p class="tone-${line.tone}">${esc(line.text)}</p>`).join('')}
      </div>
    </section>`;

  return `<div class="nov">
      ${title}
      <div class="nov-top">${hero}${diplomacy}</div>
      ${stats}
      ${resources}
      <div class="nov-bottom">${nationState}${recent}${outlook}</div>
    </div>`;
}
