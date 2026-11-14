// HOI4/EU4 tarzı bildirim kutucukları: sağ altta, harita kiplerinin üstündeki
// zilin içinde toplanır. Oyun katmanı ne olduğunu söyler (game/notifications.js),
// burası nasıl göründüğüne ve ne zaman kaybolduğuna karar verir.

import { battleAt } from '../game/battles.js';
import { NOTIFY_GLYPH, glyph } from './icons/glyphs.js';
import { onEscape } from './hud.js';
import { refreshTooltipsWithin } from './tooltip.js';

/**
 * Tepside tutulan kart sayısı. Gizli kartın süresi işlemez (bkz. syncTimers):
 * okunmamış haberi duvar saati değil bu tavan düşürür, önce geçici olanlar.
 */
const MAX_CARDS = 8;
const MAX_CARDS_NARROW = 3;
const NARROW_WIDTH = 620;

/** Giriş/çıkış geçişinin süresi; CSS'teki --notify-slide ile aynı olmalı. */
const SLIDE_MS = 420;

export class Notifications {
  constructor(game, root = document.getElementById('notify-stack')) {
    this.game = game;
    this.root = root;
    /** Kart başına zamanlayıcı durumu: kalan süre, görünmezken durur. */
    this.cards = new Map();
    // Tepsi kapalı doğar: kapalı tepsideki kartın süresi işlemez.
    this.paused = true;
    this.hovered = false;
    if (!this.root) return;

    // İmleç yığının üstündeyken sayaç durur: okurken kart kaçmasın.
    this.root.addEventListener('pointerenter', () => { this.hovered = true; this.syncTimers(); });
    this.root.addEventListener('pointerleave', () => { this.hovered = false; this.syncTimers(); });

    game.on('notify', ({ entry, repeated }) => (
      repeated ? this.bump(entry) : this.add(entry)
    ));
    game.on('notify-clear', () => this.clear());
    // Konusu kapanan kartlar (barışan savaş gibi) ekrandan da kalkar.
    game.on('notify-dismiss', (entries) => {
      for (const entry of entries ?? []) this.remove(entry);
    });
    // Yeni dünya eski dünyanın kartlarıyla açılmasın.
    game.on('world', () => { this.clear(); this.setOpen(false); });

    // ZİL SABİT, KARTLAR ÜSTÜNDE. Eskiden zil yığının İLK çocuğuydu ve kartlar
    // imleç zilin üstüne gelince (:hover) açılıyordu: alttan sabitli yığın
    // büyüyünce zil yüzlerce piksel yukarı kaçıyor, tık altına kayan karta
    // düşüp onu okunmadan siliyordu (HUD-05, CH-03). Şimdi liste zilin
    // ÜSTÜNDE ayrı bir kutudur, yalnız tıkla açılır; zil yerinden oynamaz.
    this.list = document.createElement('div');
    this.list.className = 'notify-list';
    this.list.setAttribute('role', 'list');
    this.tray = document.createElement('button');
    this.tray.type = 'button';
    this.tray.className = 'notify-tray';
    this.tray.setAttribute('aria-label', 'Notifications');
    this.tray.setAttribute('aria-expanded', 'false');
    this.tray.onclick = () => this.setOpen(!this.isOpen);
    this.root.append(this.list, this.tray);
    // SESSIZ KIP — her zaman. Kerem: "sagda cikan popuplari kaldirabiliriz";
    // sag ust artik ulusal hareket panelidir (ui/movementDock.js). Kartlar
    // zilde toplanir, tiklayinca acilir. Saati durduran (halt) kartlar da oradadir.
    document.body.classList.add('notify-quiet');
    // Ana menü perdesi ya da başka bir kip gövde sınıfını değiştirince kartın
    // görünürlüğü de değişir; sayaçlar onunla eşitlenir.
    new MutationObserver(() => this.syncTimers())
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    // Dışarı bir tık tepsiyi kapatır (haritaya tıklama kendi işini de yapar).
    this.outside = (event) => {
      if (!this.root.contains(event.target)) this.setOpen(false);
    };
    // Esc sırası (hud.js): açık tepsi seçimden önce kapanır.
    onEscape(game, () => {
      if (!this.isOpen) return false;
      this.setOpen(false);
      return true;
    });
    this.updateTray();
  }

  get isOpen() {
    return Boolean(this.root?.classList.contains('open'));
  }

  /** Tepsiyi açar/kapatır; açılınca bütün kartlar görülmüş sayılır. */
  setOpen(open) {
    if (!this.root || open === this.isOpen) return;
    this.root.classList.toggle('open', open);
    this.tray.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      for (const [entry, state] of this.cards) {
        state.seen = true;
        // Gizliyken CSS şeridi baştan oynar: kalan süreyle eşitlenir.
        if (entry.ttl) state.card.style.setProperty('--notify-ttl', `${Math.round(state.remaining)}ms`);
      }
      document.addEventListener('pointerdown', this.outside, true);
      this.list.scrollTop = 0;
    } else {
      document.removeEventListener('pointerdown', this.outside, true);
    }
    this.syncTimers();
    this.updateTray();
  }

  /**
   * Kartın süresi yalnız GÖRÜLÜRKEN işler: tepsi açık, imleç üstünde değil,
   * ana menü perdesi inik. Eskiden sessiz kipte her kart gizli doğuyor ama
   * duvar saatiyle düşüyordu; 8x'te bir yıllık haber hiç görünmeden
   * siliniyordu (HUD-09, CH-02).
   */
  syncTimers() {
    const body = document.body.classList;
    const hidden = !this.isOpen || body.contains('menu-open') || body.contains('picker-open');
    this.setPaused(hidden || this.hovered);
  }

  /** Sayac: kart sayisi, okunmamis var mi, en agir ton. Kart yoksa soluk. */
  updateTray() {
    if (!this.tray) return;
    const count = this.cards.size;
    const states = [...this.cards.values()];
    const unseen = states.filter((state) => !state.seen).length;
    const alert = [...this.cards.keys()].some((entry) => entry.tone === 'bad' || entry.tone === 'war');
    // Sayaç hiç kaybolmaz: 0'da soluk durur (belirip kaybolması oynama sayılır).
    this.tray.classList.toggle('empty', count === 0);
    this.tray.classList.toggle('unseen', unseen > 0);
    const html = `${glyph('bell', 'inline')} ${count}`;
    if (this.tray.innerHTML !== html) this.tray.innerHTML = html;
    this.tray.classList.toggle('notify-alert', alert);
    // Bilgi kartı yalnız kapalıyken: açık listenin üstüne binmesin.
    if (this.isOpen) {
      this.tray.removeAttribute('data-tip');
      this.tray.removeAttribute('data-tip-text');
    } else {
      this.tray.dataset.tip = 'text';
      this.tray.dataset.tipText = count
        ? `Notifications\n${count} waiting${unseen ? `, ${unseen} unread` : ''}. Click to open the list; click a card to go to the place it names. Esc closes.`
        : 'Notifications\nNothing waiting. New dispatches gather here.';
      refreshTooltipsWithin(this.root);
    }
    this.tray.setAttribute('aria-label', `Notifications: ${count}${unseen ? `, ${unseen} unread` : ''}`);
  }

  /** Görünmeyen yeni haber zili bir kez parlatır. */
  glow() {
    if (this.isOpen) return;
    this.tray.classList.remove('bump');
    void this.tray.offsetWidth;
    this.tray.classList.add('bump');
  }

  add(entry) {
    const card = this.build(entry);
    // En yeni en üstte: açık listede eski kartlar imlecin altından kaymaz,
    // liste yukarı doğru büyür.
    this.list.prepend(card);
    this.cards.set(entry, {
      card,
      remaining: entry.ttl,
      startedAt: performance.now(),
      timer: 0,
      seen: this.isOpen,
    });
    this.mount(card);
    this.startTimer(entry);
    this.trim();
    this.updateTray();
    this.glow();
  }

  /** Aynı olay yine geldi: sayacı büyüt, metni tazele, kartı bir kez zıplat. */
  bump(entry) {
    const state = this.cards.get(entry);
    if (!state) {
      this.add(entry);
      return;
    }
    const { card } = state;
    if (!this.isOpen) state.seen = false;
    // BASLIK DA TAZELENIR. Model katmani basligi guncelliyordu ama kart yalniz
    // govdeyi yaziyordu: 1870'teki yeni aclik karti 1836'nin basligini ve
    // "1016 hafta" suresini tasiyordu (Astra6 B5). Baslik yok/var gecisinde
    // kartin iskeleti degistigi icin o durumda kart bastan kurulur.
    const titleNode = card.querySelector('.notify-title');
    if (Boolean(titleNode) !== Boolean(entry.title) || card.dataset.kind !== entry.kind) {
      // Basliksiz karta baslik geldi (ya da tersi), ya da olayin TURU degisti
      // (ikon/etiket/ton/ttl onunla gelir): iskelet degisti, kart yerinde
      // yeniden kurulur. `remove()` cagrilmaz — o, modeldeki kaydi da kapatir
      // ve kart ile model ayrisirdi.
      const fresh = this.build(entry);
      card.replaceWith(fresh);
      state.card = fresh;
      this.restartTimer(entry);
      this.updateTray();
      this.glow();
      return;
    }
    if (titleNode && titleNode.textContent !== entry.title) titleNode.textContent = entry.title;
    card.querySelector('.notify-body').textContent = entry.title ? (entry.body ?? '') : entry.text;
    const count = card.querySelector('.notify-count');
    count.textContent = entry.count > 1 ? String(entry.count) : '';
    count.classList.toggle('shown', entry.count > 1);
    // Animasyonu baştan oynatmak için sınıfı bir kare boyunca kaldırmak gerekir.
    card.classList.remove('bump');
    void card.offsetWidth;
    card.classList.add('bump');
    this.restartTimer(entry);
    this.updateTray();
    this.glow();
  }

  build(entry) {
    const card = document.createElement('article');
    // Ulusal olay (tier 2+) kendi ağırlığında görünür: başlık serif ve büyük,
    // sonuç cümlesi altında. Rutin bildirim eskisi gibi tek satır kalır —
    // her olayı büyütmek "bildirim cehennemi"dir (bkz. EVENT_COMMUNICATION_SYSTEM).
    const tier = entry.tier ?? 0;
    const weight = tier >= 3 ? ' notify-existential' : tier >= 2 ? ' notify-major' : '';
    card.className = `notify-card notify-${entry.tone}${entry.ttl ? '' : ' notify-sticky'}${weight}`;
    card.setAttribute('role', 'listitem');
    card.dataset.kind = entry.kind;
    card.style.setProperty('--notify-ttl', `${entry.ttl || 0}ms`);
    const headline = entry.title
      ? `<b class="notify-title">${escapeHtml(entry.title)}</b>`
      : '';
    const body = entry.title ? (entry.body ?? '') : entry.text;
    card.innerHTML = `
      <span class="notify-icon" aria-hidden="true">${glyph(NOTIFY_GLYPH[entry.kind] ?? 'info')}
        <b class="notify-count${entry.count > 1 ? ' shown' : ''}">${entry.count > 1 ? entry.count : ''}</b>
      </span>
      <span class="notify-text">
        <small>${escapeHtml(entry.label)}</small>
        ${headline}
        <span class="notify-body">${escapeHtml(body)}</span>
      </span>
      <button class="notify-close" aria-label="Dismiss">${glyph('close', 'ctl')}</button>
      <i class="notify-timer" aria-hidden="true"></i>`;

    card.querySelector('.notify-close').onclick = (event) => {
      event.stopPropagation();
      this.remove(entry);
    };
    // Karta tıklamak olayın geçtiği yere gider: HOI4'te uyarıya tıklamak gibi.
    card.onclick = () => {
      // Deniz kaydı (muharebe/kaçınma): Seas haritası açılır, kartı panelde.
      if (entry.report && this.game.renderer?.mapMode !== 'seas') {
        document.querySelector('.mode-btn[data-mode="seas"]')?.click();
      }
      if (entry.tile) {
        this.game.focusTile(entry.tile);
        // Muharebe sürüyorsa penceresi de açılır (ui/battlePanel.js).
        const battle = battleAt(this.game.world, entry.tile);
        if (battle) this.game.emit('inspect', battle.id);
      }
      if (entry.report) this.game.emit('navalReport', entry.report);
      this.remove(entry);
    };
    card.classList.toggle('notify-linked', Boolean(entry.tile || entry.report));
    return card;
  }

  /**
   * Giriş animasyonu. Yükseklik 0'dan doğal boyuta açılır; yoksa yeni kart
   * altındakileri bir karede aşağı itiyor ve yığın zıplıyor.
   */
  mount(card) {
    const height = card.offsetHeight;
    // Kapalı tepside kart gizli (display: none) dogar: yukseklik 0 olculur,
    // gecis hic bitmez ve kart sonradan acilinca 0px'te kalirdi. Gizli kart
    // animasyonsuz kalir; tepsi acilinca dogal boyuyla gorunur.
    if (!height) return;
    card.style.height = '0px';
    card.style.marginBottom = '0px';
    card.classList.add('notify-enter');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      card.style.height = `${height}px`;
      card.style.marginBottom = '';
      card.classList.remove('notify-enter');
    }));
    // Geçiş bitince yüksekliği serbest bırak: metin sarması sonradan değişebilir.
    const done = (event) => {
      if (event.target !== card || event.propertyName !== 'height') return;
      card.style.height = '';
      card.removeEventListener('transitionend', done);
    };
    card.addEventListener('transitionend', done);
  }

  remove(entry) {
    const state = this.cards.get(entry);
    if (!state) return;
    this.cards.delete(entry);
    this.game.notifications?.release(entry);
    clearTimeout(state.timer);
    this.updateTray();

    const { card } = state;
    // Çıkarken de yükseklik kapanır ki alttaki kartlar yukarı kayarken akmasın.
    card.style.height = `${card.offsetHeight}px`;
    void card.offsetWidth;
    card.classList.add('notify-leave');
    card.style.height = '0px';
    card.style.marginBottom = '0px';
    setTimeout(() => card.remove(), SLIDE_MS);
  }

  /** Tepsi taşarsa en eski geçici kart düşer; kalıcı uyarılar korunur. */
  trim() {
    const max = window.innerWidth <= NARROW_WIDTH ? MAX_CARDS_NARROW : MAX_CARDS;
    while (this.cards.size > max) {
      // Map ekleme sırasını korur: ilk bulunan en eskidir.
      const victim = [...this.cards.keys()].find((entry) => entry.ttl)
        ?? [...this.cards.keys()][0];
      this.remove(victim);
    }
  }

  startTimer(entry) {
    const state = this.cards.get(entry);
    if (!state || !state.remaining || this.paused) return;
    state.startedAt = performance.now();
    state.timer = setTimeout(() => this.remove(entry), state.remaining);
  }

  restartTimer(entry) {
    const state = this.cards.get(entry);
    if (!state) return;
    clearTimeout(state.timer);
    state.timer = 0;
    state.remaining = entry.ttl;
    const bar = state.card.querySelector('.notify-timer');
    state.card.style.setProperty('--notify-ttl', `${entry.ttl || 0}ms`);
    bar.style.animation = 'none';
    void bar.offsetWidth;
    bar.style.animation = '';
    this.startTimer(entry);
  }

  setPaused(paused) {
    if (this.paused === paused) return;
    this.paused = paused;
    this.root.classList.toggle('paused', paused);
    for (const [entry, state] of this.cards) {
      if (!state.remaining) continue;
      if (paused) {
        // Yalnız gerçekten işleyen sayaç düşer; hiç başlamamış kartın süresi
        // kapalı tepside geçen zamandan yemez.
        if (state.timer) {
          clearTimeout(state.timer);
          state.timer = 0;
          state.remaining = Math.max(
            200, state.remaining - (performance.now() - state.startedAt),
          );
        }
      } else {
        this.startTimer(entry);
      }
    }
  }

  clear() {
    for (const entry of [...this.cards.keys()]) this.remove(entry);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
