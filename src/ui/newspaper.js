// GAZETE — sekme şeridindeki düğme, açılan ön sayfa, Chronicle arşivi.
//
// Yazı işleri (game/press.js) her hafta dünyayı okur; burası yalnız basılan
// sayıyı gösterir. Saate dokunmaz, ön sayfa açıkken de zaman akar. Gazete oyuncu
// isteyince açılır (Kerem 2026-11-18): yeni sayılar düğmede sayılır, ekrana çıkmaz.

import { pressIssue, pressWeek } from '../game/press.js';
import { composeIssue } from '../game/pressText.js';
import { glyph } from './icons/glyphs.js';
import { onEscape } from './hud.js';
import { esc } from './kit.js';

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
    this.layer = null;
    this.unread = 0;
    this.button = document.getElementById('btn-newspaper');
    this.note = this.button?.querySelector('small') ?? null;
    if (this.button) this.button.onclick = () => this.toggleLatest();

    game.on('turn', () => {
      if (pressWeek(game)) this.unread++;
      this.sync();
    });
    game.on('world', () => {
      this.closePage();
      this.unread = 0;
      this.sync();
    });
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

  /** Düğme son sayıyı açar; gazete açıksa kapatır. */
  toggleLatest() {
    if (this.layer) {
      this.closePage();
      return;
    }
    const latest = this.game.world?.press?.issues?.at(-1);
    if (latest) this.openIssue(latest.n);
  }

  /** Düğmenin yazısı: okunmamış sayı varsa kaç tane, yoksa adı. */
  sync() {
    if (!this.button) return;
    const any = Boolean(this.game.world?.press?.issues?.length);
    this.button.disabled = !any;
    this.button.classList.toggle('has-new', this.unread > 0);
    this.button.classList.toggle('on', Boolean(this.layer));
    if (this.note) this.note.textContent = this.unread > 0 ? `${this.unread} new` : 'Paper';
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
    this.unread = 0;
    this.sync();
    layer.querySelector('.gz-page')?.focus({ preventScroll: true });
  }

  closePage() {
    this.layer?.remove();
    this.layer = null;
    this.sync();
  }
}
