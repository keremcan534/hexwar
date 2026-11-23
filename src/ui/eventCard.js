// OLAY KARTI — oyuncuya gelen seçenekli olay (game/eventCards.js).
//
// Kart haritanın ortasında açılır ve saati DURDURUR: karar beklemeden akan
// zaman olayı bildirime çevirirdi. Seçenek tıklanınca oyunun kapısı
// (`resolveCard`) çağrılır; kart kapanır, saat eski hızına döner. Oyuncu
// kartı kapatamaz ama erteleyebilir ("Later"): sekiz hafta cevapsız kalırsa
// YZ'nin seçimi uygulanır, oyun kilitlenmez. Ertelenen kart sol şeritteki
// "Decision waiting" düğmesinden yeniden açılır (ui/alerts.js).

import { EVENT_TIMEOUT, pendingCards, resolveCard } from '../game/eventCards.js';
import { gameDate } from './hud.js';
import { pausePolicyOf } from '../game/notifications.js';

/**
 * Olayın sahnesi: menü resimlerinden biri. Paradox olayının gücü başlık
 * resmindedir; düz kutu "bildirim penceresi" gibi okunuyordu.
 */
const EVENT_SCENE = {
  famine: 'field-road',
  bumper_harvest: 'field-road',
  strike: 'rail-yard',
  motor_boom: 'rail-yard',
  depression: 'rail-yard',
  great_inventor: 'rail-yard',
  war_weariness: 'coast-fort',
  border_incident: 'coast-fort',
  veterans: 'coast-fort',
  cholera: 'tulip-night',
  influenza: 'tulip-night',
  liberal_agitation: 'palace-square',
  revolution: 'palace-square',
  // Menünün savaş gemisi: barut fıçısının sahnesi.
  mobilisation: 'main-menu',
  court_scandal: 'palace-hall',
  strongman: 'palace-hall',
  emigration: 'harbour-dawn',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export class EventCards {
  constructor(game) {
    this.game = game;
    this.layer = null;
    this.deferred = new Set();
    this.resumeSpeed = 0;
    /** Son bakışta oyuncunun bekleyen kartları (anahtar → başlık). */
    this.known = new Map();
    /** Oyuncunun kendi cevapladığı kartlar: kaybolan öteki kartı kabine kapattı. */
    this.answered = new Set();
    game.on('card', (info) => {
      // `sync` yalnız şeridi tazeler (bkz. changed); kartı yeniden açmaz.
      if (info?.sync || info?.nationId !== game.turns?.playerNation) return;
      // Şeritteki "Decision waiting" düğmesi ertelenenleri geri getirir.
      if (info.reopen) this.deferred.clear();
      this.show();
    });
    game.on('turn', () => {
      this.noticeTimeouts();
      this.show();
    });
    game.on('world', () => {
      this.close(false);
      this.deferred.clear();
      this.known.clear();
      this.answered.clear();
    });
    // Kampanya sonu: kart kapanış sayfasının üstüne binmez (B-13). Aynı
    // haftada dünya olayının kartı zaferden önce düşebiliyordu.
    game.on('victory', () => {
      this.resumeSpeed = 0;
      this.close(false);
    });
  }

  me() {
    return this.game.world?.nations?.[this.game.turns?.playerNation];
  }

  /** Şerit (ui/alerts.js) bekleyen kart sayısını yeniden okusun. */
  changed() {
    const me = this.me();
    if (me) this.game.emit('card', { nationId: me.id, sync: true });
  }

  /**
   * Cevapsız kalıp zaman aşımında kabinenin kapattığı kart. Eskiden sessizdi:
   * ertelenen kart bir daha görünmüyor, sekiz hafta sonra seçim kayıtsız
   * yapılıyordu (B-10). Hangi seçeneğin uygulandığını oyun katmanı söylemiyor;
   * söylenebilen kadarı söylenir.
   */
  noticeTimeouts() {
    const me = this.me();
    if (!me) return;
    const now = new Map(pendingCards(me).map((card) => [card.key, card.title]));
    for (const [key, title] of this.known) {
      if (now.has(key) || this.answered.has(key)) continue;
      this.game.notifications?.push(`${title}: unanswered for ${EVENT_TIMEOUT} weeks, the cabinet decided for you.`, {
        kind: 'POLITICS',
        key: `cabinet-card-${key}`,
        title: `The cabinet decided: ${title}`,
        body: `Unanswered for ${EVENT_TIMEOUT} weeks, the cabinet chose for you.`,
      });
      this.deferred.delete(key);
    }
    this.known = now;
    this.answered.clear();
  }

  show() {
    const me = this.me();
    if (!me) return this.close();
    // Kampanya bittiyse ya da kapanış sayfası açıksa kart açılmaz.
    if (this.game.turns?.victory || document.getElementById('epilogue')) return this.close(false);
    const pending = pendingCards(me);
    for (const card of pending) this.known.set(card.key, card.title);
    const card = pending.find((entry) => !this.deferred.has(entry.key));
    if (!card) return this.close();
    if (this.layer?.dataset.key === card.key) return;
    this.close(false);
    // Kart saati yalnız "All" ayarında durdurur (Kerem: "oyun sürekli
    // duruyor"): cevapsız kart süresi dolunca kabine karar verir.
    if (this.game.clock?.speed > 0 && pausePolicyOf(this.game) === 'all') {
      this.resumeSpeed = this.game.clock.speed;
      this.game.setSpeed(0);
    }
    const layer = document.createElement('div');
    layer.className = 'event-card-layer';
    layer.dataset.key = card.key;
    const scene = EVENT_SCENE[card.id] ?? 'main-menu';
    const date = gameDate(card.turn ?? this.game.turns?.turn ?? 1);
    const deadline = gameDate((card.turn ?? this.game.turns?.turn ?? 1) + EVENT_TIMEOUT);
    layer.innerHTML = `<div class="event-card ev" role="dialog" aria-modal="true" aria-label="${esc(card.title)}" tabindex="-1">
      <div class="ev-scene" style="background-image:url('assets/menu/${scene}.jpg')"><span class="ev-vignette"></span></div>
      <div class="ev-body">
        <small class="ev-kicker">${esc(me.name)}${date ? ` · ${esc(date)}` : ''}</small>
        <h3>${esc(card.title)}</h3>
        <p>${esc(card.text)}</p>
        <div class="ev-options">
          ${card.options.map((option, i) => `<button class="ev-opt" data-option="${option.index}" ${option.available ? '' : 'disabled'}>
            <i>${'ABCDE'[i] ?? ''}</i><span><b>${esc(option.label)}</b><small>${esc(option.detail)}</small></span></button>`).join('')}
        </div>
        <button class="ev-later" data-later="1">Decide later <small>— it waits in the alert column; unanswered by ${esc(deadline)}, the cabinet decides</small></button>
      </div>
    </div>`;
    layer.addEventListener('click', (event) => {
      const option = event.target.closest('[data-option]');
      if (option && !option.disabled) {
        this.answered.add(card.key);
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
    // Modal odağı alır (B-13): klavye kartın içinde kalır (hud.modalKey).
    // Seçenek değil kartın kendisi odaklanır — Enter'a alışkın bir el kararı
    // yanlışlıkla vermesin; Tab ilk seçeneğe gider.
    layer.querySelector('.event-card')?.focus({ preventScroll: true });
    this.changed();
  }

  close(resume = true) {
    const had = Boolean(this.layer);
    this.layer?.remove();
    this.layer = null;
    if (resume && this.resumeSpeed > 0) {
      this.game.setSpeed(this.resumeSpeed);
      this.resumeSpeed = 0;
    }
    if (had) this.changed();
  }
}
