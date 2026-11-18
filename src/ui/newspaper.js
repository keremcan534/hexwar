// GAZETE — köşedeki kart, açılan ön sayfa, Chronicle arşivi.
//
// Yazı işleri (game/press.js) her hafta dünyayı okur; burası yalnız basılan
// sayıyı gösterir. Saate dokunmaz: kart oyunu durdurmaz, ön sayfa açıkken de
// zaman akar. 4x'te bir ay bir saniyedir; aylık sayı kartı her ay yenilense
// köşe titrerdi, bu yüzden olağan kart duvar saatiyle seyreltilir. Arşiv eksiksiz
// kalır: kartı görünmeyen sayı Chronicle'dan okunur.

import { pressIssue, pressWeek } from '../game/press.js';
import { composeIssue } from '../game/pressText.js';
import { glyph } from './icons/glyphs.js';
import { onEscape } from './hud.js';
import { esc } from './kit.js';

/** Olağan kart bu kadar görünür kalır; üstüne gelinince süre durur. */
const CARD_MS = 14000;
/** İki olağan kart arasındaki en kısa süre. Olağanüstü sayı bunu beklemez. */
const CARD_GAP_MS = 45000;

/** Sansürcünün sildiği yer: metinde boşluk kalır, altı okunmaz. */
const inked = (text) => esc(text).replaceAll('[[cut]]', '<span class="gz-cut" role="img" aria-label="removed by the censor"></span>');

const sizeOf = (text, short, long) => (text.length <= short ? 's' : text.length <= long ? 'm' : 'l');

function storyHtml(row, tag = 'h3') {
  return `<article class="gz-story">
    <span class="gz-sec">${esc(row.section)}</span>
    <${tag}>${esc(row.head)}</${tag}>
    ${row.deck ? `<p class="gz-deck">${inked(row.deck)}</p>` : ''}
    ${row.body ? `<p>${inked(row.body)}</p>` : ''}
  </article>`;
}

/** Ön sayfanın tamamı: gazetenin kâğıdı, üstünde başka arayüz yok. */
function pageHtml(view) {
  const subs = view.subs.map((row) => storyHtml(row)).join('');
  const briefs = view.briefs.length
    ? `<aside class="gz-briefs"><span class="gz-sec">${esc(view.briefLabel)}</span>
        ${view.briefs.map((row) => `<p><b>${esc(row.head)}.</b> ${inked(row.deck)}</p>`).join('')}</aside>`
    : '';
  return `<header class="gz-mast">
      <div class="gz-mast-line">
        <span>${esc(view.numberLabel)}</span>
        ${view.extra ? `<b>${esc(view.extraLabel)}</b>` : ''}
        <span>${esc(view.city)}, ${esc(view.date)}</span>
      </div>
      <h1 data-size="${sizeOf(view.paper, 14, 22)}">${esc(view.paper)}</h1>
    </header>
    <section class="gz-lead">
      <span class="gz-sec">${esc(view.lead.section)}</span>
      <h2 data-size="${sizeOf(view.lead.head, 30, 56)}">${esc(view.lead.head)}</h2>
      <div class="gz-lead-grid${view.photo ? '' : ' no-photo'}">
        ${view.photo ? `<div class="gz-photo" style="background-image:url('assets/${esc(view.photo)}')" aria-hidden="true"></div>` : ''}
        <div class="gz-lead-text">
          ${view.lead.deck ? `<p class="gz-deck">${inked(view.lead.deck)}</p>` : ''}
          ${view.lead.body ? `<p>${inked(view.lead.body)}</p>` : ''}
        </div>
      </div>
    </section>
    ${subs || briefs ? `<section class="gz-cols" data-cols="${view.subs.length + (briefs ? 1 : 0)}">${subs}${briefs}</section>` : ''}`;
}

export class Newspaper {
  constructor(game) {
    this.game = game;
    this.card = null;
    this.layer = null;
    this.cardTimer = 0;
    this.lastCardAt = -Infinity;

    game.on('turn', () => {
      const issue = pressWeek(game);
      if (issue) this.arrive(issue);
    });
    game.on('world', () => { this.closeCard(); this.closePage(); });
    game.on('victory', () => this.closeCard());
    // Esc sırası (hud.js): açık gazete seçimden önce kapanır.
    onEscape(game, () => {
      if (!this.layer) return false;
      this.closePage();
      return true;
    });
    // Chronicle ekranı her tazelemede yeniden yazılır: dinleyici köktedir.
    const openRow = (event) => {
      const row = event.target.closest?.('[data-press-issue]');
      if (row) this.openIssue(Number(row.dataset.pressIssue));
    };
    document.addEventListener('click', openRow);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        if (event.target.closest?.('[data-press-issue]')) { event.preventDefault(); openRow(event); }
      }
    });
  }

  /** Yeni sayı: olağanüstü sayı hep görünür, olağan olan sırasını bekler. */
  arrive(issue) {
    const now = performance.now();
    if (!issue.x && (this.card || now - this.lastCardAt < CARD_GAP_MS)) return;
    this.lastCardAt = now;
    this.showCard(issue);
  }

  showCard(issue) {
    this.closeCard();
    const view = composeIssue(issue);
    const card = document.createElement('aside');
    card.className = `gz-card${view.extra ? ' is-extra' : ''}`;
    card.setAttribute('aria-label', `${view.paper}: ${view.lead.head}`);
    card.innerHTML = `<button type="button" class="gz-card-open" data-gz-open>
        <span class="gz-card-mast"><b>${esc(view.paper)}</b><small>${view.extra ? esc(view.extraLabel) : esc(view.date)}</small></span>
        ${view.photo ? `<span class="gz-photo" style="background-image:url('assets/${esc(view.photo)}')" aria-hidden="true"></span>` : ''}
        <strong>${esc(view.lead.head)}</strong>
        ${view.lead.deck ? `<span class="gz-card-deck">${inked(view.lead.deck)}</span>` : ''}
      </button>
      <button type="button" class="icon-btn gz-card-x" data-gz-close aria-label="Close">${glyph('close', 'ctl')}</button>`;
    card.addEventListener('click', (event) => {
      if (event.target.closest('[data-gz-close]')) { this.closeCard(); return; }
      if (event.target.closest('[data-gz-open]')) { this.closeCard(); this.openIssue(issue.n); }
    });
    // Okurken kart kaçmasın.
    card.addEventListener('pointerenter', () => clearTimeout(this.cardTimer));
    card.addEventListener('pointerleave', () => this.armCard(issue));
    document.body.append(card);
    this.card = card;
    this.armCard(issue);
  }

  /** Olağanüstü sayı okunana dek durur; olağan kart kendiliğinden çekilir. */
  armCard(issue) {
    clearTimeout(this.cardTimer);
    if (!issue.x) this.cardTimer = setTimeout(() => this.closeCard(), CARD_MS);
  }

  closeCard() {
    clearTimeout(this.cardTimer);
    this.card?.remove();
    this.card = null;
  }

  openIssue(number) {
    const world = this.game.world;
    const issue = pressIssue(world, number);
    if (!issue) return;
    this.closePage();
    const list = world.press.issues;
    const at = list.indexOf(issue);
    const older = list[at - 1];
    const newer = list[at + 1];
    const view = composeIssue(issue);
    const layer = document.createElement('div');
    layer.className = 'gz-layer';
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-label', `${view.paper}, ${view.date}`);
    layer.innerHTML = `<div class="gz-frame">
        <div class="gz-tools">
          <button type="button" class="k-btn" data-gz-go="${older?.n ?? ''}" ${older ? '' : 'disabled'}>Older issue</button>
          <button type="button" class="k-btn" data-gz-go="${newer?.n ?? ''}" ${newer ? '' : 'disabled'}>Newer issue</button>
          <button type="button" class="icon-btn gz-page-x" data-gz-close aria-label="Close" data-tip="text" data-tip-text="Close · Esc">${glyph('close', 'ctl')}</button>
        </div>
        <article class="gz-page" tabindex="-1">${pageHtml(view)}</article>
      </div>`;
    layer.addEventListener('click', (event) => {
      const go = event.target.closest('[data-gz-go]');
      if (go && !go.disabled) { this.openIssue(Number(go.dataset.gzGo)); return; }
      // Kâğıdın dışına tık gazeteyi kapatır; harita geri gelir.
      if (event.target.closest('[data-gz-close]') || event.target === layer) this.closePage();
    });
    document.body.append(layer);
    this.layer = layer;
    layer.querySelector('.gz-page')?.focus({ preventScroll: true });
  }

  closePage() {
    this.layer?.remove();
    this.layer = null;
  }
}
