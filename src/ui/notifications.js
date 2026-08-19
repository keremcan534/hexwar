// HOI4/EU4 tarzı bildirim kutucukları: sağ üstte, saatin altında yığılır.
// Oyun katmanı ne olduğunu söyler (game/notifications.js), burası nasıl
// göründüğüne ve ne zaman kaybolduğuna karar verir.

/** Aynı anda görünecek kart sayısı; telefonda üçten fazlası haritayı yutuyor. */
const MAX_CARDS = 5;
const MAX_CARDS_NARROW = 3;
const NARROW_WIDTH = 620;

/** Giriş/çıkış geçişinin süresi; CSS'teki --notify-slide ile aynı olmalı. */
const SLIDE_MS = 420;

export class Notifications {
  constructor(game, root = document.getElementById('notify-stack')) {
    this.game = game;
    this.root = root;
    /** Kart başına zamanlayıcı durumu: kalan süre, imleç üstündeyken durur. */
    this.cards = new Map();
    this.paused = false;
    if (!this.root) return;

    // İmleç yığının üstündeyken sayaç durur: okurken kart kaçmasın.
    this.root.addEventListener('pointerenter', () => this.setPaused(true));
    this.root.addEventListener('pointerleave', () => this.setPaused(false));

    game.on('notify', ({ entry, repeated }) => (
      repeated ? this.bump(entry) : this.add(entry)
    ));
    game.on('notify-clear', () => this.clear());
    // Konusu kapanan kartlar (barışan savaş gibi) ekrandan da kalkar.
    game.on('notify-dismiss', (entries) => {
      for (const entry of entries ?? []) this.remove(entry);
    });
    // Yeni dünya eski dünyanın kartlarıyla açılmasın.
    game.on('world', () => this.clear());
  }

  add(entry) {
    const card = this.build(entry);
    this.root.prepend(card);
    this.cards.set(entry, {
      card,
      remaining: entry.ttl,
      startedAt: performance.now(),
      timer: 0,
    });
    this.mount(card);
    this.startTimer(entry);
    this.trim();
  }

  /** Aynı olay yine geldi: sayacı büyüt, metni tazele, kartı bir kez zıplat. */
  bump(entry) {
    const state = this.cards.get(entry);
    if (!state) {
      this.add(entry);
      return;
    }
    const { card } = state;
    card.querySelector('.notify-body').textContent = entry.title ? (entry.body ?? '') : entry.text;
    const count = card.querySelector('.notify-count');
    count.textContent = entry.count > 1 ? String(entry.count) : '';
    count.classList.toggle('shown', entry.count > 1);
    // Animasyonu baştan oynatmak için sınıfı bir kare boyunca kaldırmak gerekir.
    card.classList.remove('bump');
    void card.offsetWidth;
    card.classList.add('bump');
    this.restartTimer(entry);
  }

  build(entry) {
    const card = document.createElement('article');
    // Ulusal olay (tier 2+) kendi ağırlığında görünür: başlık serif ve büyük,
    // sonuç cümlesi altında. Rutin bildirim eskisi gibi tek satır kalır —
    // her olayı büyütmek "bildirim cehennemi"dir (bkz. EVENT_COMMUNICATION_SYSTEM).
    const tier = entry.tier ?? 0;
    const weight = tier >= 3 ? ' notify-existential' : tier >= 2 ? ' notify-major' : '';
    card.className = `notify-card notify-${entry.tone}${entry.ttl ? '' : ' notify-sticky'}${weight}`;
    card.style.setProperty('--notify-ttl', `${entry.ttl || 0}ms`);
    const headline = entry.title
      ? `<b class="notify-title">${escapeHtml(entry.title)}</b>`
      : '';
    const body = entry.title ? (entry.body ?? '') : entry.text;
    card.innerHTML = `
      <span class="notify-icon" aria-hidden="true">${entry.icon}
        <b class="notify-count${entry.count > 1 ? ' shown' : ''}">${entry.count > 1 ? entry.count : ''}</b>
      </span>
      <span class="notify-text">
        <small>${escapeHtml(entry.label)}</small>
        ${headline}
        <span class="notify-body">${escapeHtml(body)}</span>
      </span>
      <button class="notify-close" aria-label="Dismiss">✕</button>
      <i class="notify-timer" aria-hidden="true"></i>`;

    card.querySelector('.notify-close').onclick = (event) => {
      event.stopPropagation();
      this.remove(entry);
    };
    // Karta tıklamak olayın geçtiği yere gider: HOI4'te uyarıya tıklamak gibi.
    card.onclick = () => {
      if (entry.tile) this.game.focusTile(entry.tile);
      this.remove(entry);
    };
    card.classList.toggle('notify-linked', Boolean(entry.tile));
    return card;
  }

  /**
   * Giriş animasyonu. Yükseklik 0'dan doğal boyuta açılır; yoksa yeni kart
   * altındakileri bir karede aşağı itiyor ve yığın zıplıyor.
   */
  mount(card) {
    const height = card.offsetHeight;
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

    const { card } = state;
    // Çıkarken de yükseklik kapanır ki alttaki kartlar yukarı kayarken akmasın.
    card.style.height = `${card.offsetHeight}px`;
    void card.offsetWidth;
    card.classList.add('notify-leave');
    card.style.height = '0px';
    card.style.marginBottom = '0px';
    setTimeout(() => card.remove(), SLIDE_MS);
  }

  /** Yığın taşarsa en eski geçici kart düşer; kalıcı uyarılar korunur. */
  trim() {
    const max = window.innerWidth <= NARROW_WIDTH ? MAX_CARDS_NARROW : MAX_CARDS;
    while (this.cards.size > max) {
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
    state.remaining = entry.ttl;
    const bar = state.card.querySelector('.notify-timer');
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
        clearTimeout(state.timer);
        state.remaining = Math.max(
          200, state.remaining - (performance.now() - state.startedAt),
        );
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
