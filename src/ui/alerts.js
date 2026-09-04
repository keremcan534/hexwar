// Harita uyarı şeridi: sol kenarda ikonlar, tıklayınca açılan küçük pencere.
//
// Bildirim baloncuğundan (ui/notifications.js) farkı KALICI olmasıdır:
// baloncuk bir OLAYI duyurur ve geçer, buradaki ikon bir DURUM duruyor
// oldukça durur. "GDP neden düşüyor" sorusunun cevabı bir olay değil, süren
// bir durumdur.
//
// Kapatma iki kademeli:
//   ✕            — bu uyarıyı şimdilik sustur; durum geçip geri gelirse yeniden çıkar
//   sustur listesi — susturulanlar şeridin altındaki küçük düğmeden geri açılır
//
// Susturma OTURUMDA yaşar, kayda yazılmaz: kayıt biçimini büyütmemek için
// (bkz. save.js) ve "kalıcı olarak gizlenen uyarı" oyuncunun kendi ayağına
// sıkması olduğu için — yeni bir hafta gerçekten yeni bir durumdur.

import { activeAlerts } from '../game/alerts.js';

/** İkon glifleri: sekme künyeleri ve defterle aynı çizgi ailesi. */
const GLYPH = {
  STARVATION: '<path d="M5 2.5v5a2 2 0 0 0 4 0v-5M7 7.5v6M12 2.5c-1.4 1.2-2 2.8-2 4.5 0 1.2.7 2 2 2z'
    + 'M12 9v4.5"/>',
  DEFICIT: '<path d="M8 2v12M11 4.5H6.5a2 2 0 0 0 0 4h3a2 2 0 0 1 0 4H5"/>',
  IMPORT_DRAIN: '<path d="M2.5 11.5h11M4 11.5V7l4-3.5L12 7v4.5M8 3.5V1"/><path d="M6 14.5h4"/>',
  SHORTAGE: '<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2h0"/>',
  IDEOLOGY: '<path d="M8 2.2 13.5 5v3.2c0 3-2.3 4.9-5.5 5.6C4.8 13.1 2.5 11.2 2.5 8.2V5z"/>',
  DEMOTION: '<path d="M5.5 6.4a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8zM2 13.2v-2.4c0-1.7 1.6-3 3.5-3s3.5 1.3 3.5 3M12 6v6M12 12l-2-2M12 12l2-2"/>',
};

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

const icon = (kindId) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor"
  stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"
  aria-hidden="true">${GLYPH[kindId] ?? GLYPH.SHORTAGE}</svg>`;

export class AlertStrip {
  constructor(game) {
    this.game = game;
    /** Susturulan uyarı kimlikleri (oturum içi). */
    this.muted = new Set();
    /** Açık olan uyarının kimliği; ikinci tık kapatır. */
    this.open = null;

    this.root = document.createElement('div');
    this.root.className = 'alert-strip';
    this.root.id = 'alert-strip';
    this.root.setAttribute('aria-label', 'Standing alerts');
    document.body.appendChild(this.root);

    // Tek dinleyici: şerit her tazelemede baştan kurulduğu için düğme başına
    // dinleyici bağlamak çöp üretirdi.
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.last = '';
  }

  onClick(event) {
    const mute = event.target.closest('[data-alert-mute]');
    if (mute) {
      this.muted.add(mute.dataset.alertMute);
      if (this.open === mute.dataset.alertMute) this.open = null;
      this.refresh(true);
      return;
    }
    if (event.target.closest('[data-alert-restore]')) {
      this.muted.clear();
      this.refresh(true);
      return;
    }
    const pin = event.target.closest('[data-alert-open]');
    if (pin) {
      const id = pin.dataset.alertOpen;
      this.open = this.open === id ? null : id;
      this.refresh(true);
    }
  }

  /**
   * Şeridi yeniden yazar. `force` yoksa içerik değişmediyse DOM'a dokunulmaz:
   * uyarılar her hafta yeniden ölçülüyor ve çoğu hafta aynı çıkıyor; her
   * seferinde innerHTML yazmak açık pencereyi kapatır ve çöp üretir.
   */
  refresh(force = false) {
    const world = this.game.world;
    const me = world?.nations?.[this.game.turns?.playerNation];
    if (!me) {
      if (this.last !== '') { this.root.innerHTML = ''; this.last = ''; }
      return;
    }
    const all = activeAlerts(world, me);
    const shown = all.filter((alert) => !this.muted.has(alert.id));
    const hiddenCount = all.length - shown.length;

    const html = shown.map((alert) => {
      const isOpen = this.open === alert.id;
      return `<div class="alert-item ${alert.kind.tone}${isOpen ? ' open' : ''}">
        <button class="alert-pin" data-alert-open="${esc(alert.id)}"
          title="${esc(alert.title)}" aria-expanded="${isOpen}">
          ${icon(alert.kind.id)}</button>
        ${isOpen ? `<div class="alert-pop">
          <header><small>${esc(alert.kind.label)}</small>
            <button class="alert-mute" data-alert-mute="${esc(alert.id)}"
              title="Silence this alert until the situation changes">✕</button></header>
          <b>${esc(alert.title)}</b>
          <p>${esc(alert.cause)}</p>
          <p class="alert-remedy">${esc(alert.remedy)}</p>
        </div>` : ''}
      </div>`;
    }).join('') + (hiddenCount ? `<button class="alert-restore" data-alert-restore="1"
      title="Bring silenced alerts back">+${hiddenCount}</button>` : '');

    if (!force && html === this.last) return;
    this.last = html;
    this.root.innerHTML = html;
  }
}
