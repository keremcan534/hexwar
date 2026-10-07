// OLAY KARTI — oyuncuya gelen seçenekli olay (game/eventCards.js).
//
// Kart haritanın ortasında açılır ve saati DURDURUR: karar beklemeden akan
// zaman olayı bildirime çevirirdi. Seçenek tıklanınca oyunun kapısı
// (`resolveCard`) çağrılır; kart kapanır, saat eski hızına döner. Oyuncu
// kartı kapatamaz ama erteleyebilir ("Later"): sekiz hafta cevapsız kalırsa
// YZ'nin seçimi uygulanır, oyun kilitlenmez.

import { pendingCards, resolveCard } from '../game/eventCards.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class EventCards {
  constructor(game) {
    this.game = game;
    this.layer = null;
    this.deferred = new Set();
    this.resumeSpeed = 0;
    game.on('card', (info) => {
      if (info?.nationId === game.turns?.playerNation) this.show();
    });
    game.on('turn', () => this.show());
    game.on('world', () => this.close());
  }

  me() {
    return this.game.world?.nations?.[this.game.turns?.playerNation];
  }

  show() {
    const me = this.me();
    if (!me) return this.close();
    const card = pendingCards(me).find((entry) => !this.deferred.has(entry.key));
    if (!card) return this.close();
    if (this.layer?.dataset.key === card.key) return;
    this.close(false);
    if (this.game.clock?.speed > 0) {
      this.resumeSpeed = this.game.clock.speed;
      this.game.setSpeed(0);
    }
    const layer = document.createElement('div');
    layer.className = 'event-card-layer';
    layer.dataset.key = card.key;
    layer.innerHTML = `<div class="event-card" role="dialog" aria-modal="true" aria-label="${esc(card.title)}">
      <small>${esc(me.name)} · event</small>
      <h3>${esc(card.title)}</h3>
      <p>${esc(card.text)}</p>
      <div class="event-options">
        ${card.options.map((option) => `<button class="action" data-option="${option.index}" ${option.available ? '' : 'disabled'}>
          <b>${esc(option.label)}</b><small>${esc(option.detail)}</small></button>`).join('')}
        <button class="action compact" data-later="1">Decide later</button>
      </div>
    </div>`;
    layer.addEventListener('click', (event) => {
      const option = event.target.closest('[data-option]');
      if (option && !option.disabled) {
        resolveCard(this.game, me, card.key, Number(option.dataset.option));
        this.game.emit('politics', me.id);
        this.close();
        this.show();
        return;
      }
      if (event.target.closest('[data-later]')) {
        this.deferred.add(card.key);
        this.close();
        this.show();
      }
    });
    document.body.append(layer);
    this.layer = layer;
  }

  close(resume = true) {
    this.layer?.remove();
    this.layer = null;
    if (resume && this.resumeSpeed > 0) {
      this.game.setSpeed(this.resumeSpeed);
      this.resumeSpeed = 0;
    }
  }
}
