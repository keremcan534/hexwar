// OYUN İÇİ AÇILIR LİSTE — yerel <select>'in yerine geçen bileşen.
//
// Neden yerel select değil: açılır listesini işletim sistemi çizer —
// Windows'ta beyaz, sistem yazı tipli bir pencere (Kerem: "frontline target
// seçerken aşırı kötü bir ekran açılıyor"); oyunun malzemesi ona ulaşamaz.
// Üstelik odakta kalan select harita kısayollarını yutuyordu: oklar değeri
// sessizce değiştiriyor, harfler listede atlıyordu.
//
// Davranış:
//   - Düğme index.html'de yazılıdır; sınıfı malzemesini seçer (komuta
//     şeridinde .tool-btn ailesi, skin.css §5). Bileşen içini ve listeyi
//     kurar, düğmeyi bir kaba (.hx-dd-wrap) alır: liste düğmenin içine
//     konamaz (düğmede etkileşimli öğe olmaz) ve kaba göre konumlanır —
//     rıhtımın dönüşümü ve cam süzgeci sabit konumlu bir pencereyi bozardı.
//   - Kapalıyken klavyeye dokunmaz: yalnız odaktaki düğmede Enter, Space ya
//     da Alt+↓ açar. Ok, harf, rakam haritaya gider.
//   - Açıkken klavye listenindir ve oyuna sızmaz: ↑↓ Home End PageUp/Down
//     gezer, Enter/Space seçer, Esc kapatır (generali bırakmaz), Tab kapatıp
//     sıradaki denetime geçer, harf o harfle başlayan satıra atlar. Listenin
//     kullanmadığı tuş (F1-F10, rakam) listeyi kapatıp oyuna gider.
//   - Odak açıkken de düğmede kalır (aria-activedescendant); satıra tık
//     odağı çalmaz. Fareyle seçimden sonra odak bırakılır: Space yine saattir.
//   - Dışarı tık, pencere değişimi, odağın kaçması ya da düğmenin gizlenmesi
//     (general bırakıldı) listeyi kapatır.
//   - Liste aşağıda yer yoksa yukarı açılır (komuta şeridi ekranın altında).
//   - Satırlar kapalıyken kurulmaz: HUD her tazelemede setItems çağırır; iş
//     yalnız açılışta ve açıkken içerik değişince yapılır.
//
// Satır: { value, label, icon?(host), note?, glyph?, tone?, group? }.
// `icon` satırın ve düğmenin simge kabını doldurur (bayrak, glif); simgenin
// yalnız değere bağlı olduğu varsayılır. Ardışık satırların `group`u
// değişince araya ince çizgi girer. `tone: 'war'` kırmızı işarettir.
//
// Katman notu: yalnız DOM. Oyunu bilmez; satırları çağıran kurar.

import { glyph } from './icons/glyphs.js';
import { hideTooltips } from './tooltip.js';
import { toLocal, uiScale } from './uiScale.js';

/** Liste ile pencere kenarı arasındaki pay (görsel px). */
const EDGE = 8;
/** Düğme ile liste arası (yerel px, command.css ile aynı). */
const GAP = 5;
/** Harfle atlamada ardışık basışların tek arama sayıldığı süre. */
const TYPE_MS = 700;
/** Yalnız değiştirici tuşlar listeyi kapatmaz (Shift+Tab, büyük harf). */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);

const CARET = '<svg class="hx-dd-caret" viewBox="0 0 10 10" aria-hidden="true">'
  + '<path d="M1.8 3.6L5 6.8l3.2-3.2" fill="none" stroke="currentColor" stroke-width="1.5"'
  + ' stroke-linecap="round" stroke-linejoin="round"/></svg>';

let serial = 0;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function eat(event) {
  event.preventDefault();
  event.stopPropagation();
}

function signature(items) {
  return items.map((it) => [it.value, it.label, it.note, it.glyph, it.tone, it.group].join('\u0001')).join('\u0002');
}

export class Dropdown {
  /**
   * @param {HTMLButtonElement} button düğme (malzemesi kendi sınıfından)
   * @param {object} [options]
   * @param {(value: string) => void} [options.onChange] oyuncu seçince
   * @param {string} [options.caption] listenin başlığı
   */
  constructor(button, { onChange = null, caption = '' } = {}) {
    this.button = button;
    this.onChange = onChange;
    this.items = [];
    this.sig = '';
    this.built = null;
    this.painted = null;
    this.current = '';
    this.isOpen = false;
    this.active = -1;
    this.rows = [];
    this.typed = '';
    this.typedAt = 0;
    this.tip = null;
    this.byPointer = false;

    const id = button.id || `hx-dd-${++serial}`;
    button.id = id;
    this.wrap = document.createElement('span');
    this.wrap.className = 'hx-dd-wrap';
    button.replaceWith(this.wrap);
    this.wrap.append(button);

    button.type = 'button';
    button.classList.add('hx-dd');
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', `${id}-list`);
    button.innerHTML = '<span class="hx-dd-ico" aria-hidden="true"></span>'
      + '<span class="hx-dd-text"></span><span class="hx-dd-mark" aria-hidden="true"></span>'
      + CARET;
    this.ico = button.querySelector('.hx-dd-ico');
    this.text = button.querySelector('.hx-dd-text');
    this.mark = button.querySelector('.hx-dd-mark');

    this.pop = document.createElement('div');
    this.pop.className = 'hx-dd-pop';
    this.pop.hidden = true;
    this.pop.innerHTML = `${caption ? `<div class="hx-dd-cap" id="${id}-cap">${esc(caption)}</div>` : ''}`
      + `<div class="hx-dd-list" role="listbox" id="${id}-list"${caption ? ` aria-labelledby="${id}-cap"` : ''}></div>`;
    this.list = this.pop.querySelector('.hx-dd-list');
    this.wrap.append(this.pop);

    this.outside = (event) => {
      if (!this.wrap.contains(event.target)) this.close();
    };
    this.lost = () => this.close();
    // Düğme gizlenirse (general bırakıldı, ekran açıldı) liste asılı kalmasın.
    this.watch = new MutationObserver(() => {
      if (this.isOpen && !(this.button.isConnected && this.button.getClientRects().length)) this.close();
    });
    this.bind();
  }

  bind() {
    const { button, pop, list } = this;
    button.addEventListener('click', (event) => {
      if (!this.isOpen) {
        this.open({ pointer: event.detail > 0 });
        return;
      }
      // Fareyle kapatınca odak bırakılır: Space yine saati sürsün.
      this.close({ blur: event.detail > 0 });
    });
    button.addEventListener('keydown', (event) => this.onKey(event));
    // Düğmenin kendi Space tıklaması keyup'tadır; açma/seçme keydown'da oldu.
    button.addEventListener('keyup', (event) => {
      if (event.key === ' ') event.preventDefault();
    });
    // Satıra basmak odağı düğmeden almasın (klavye açık listede kalır).
    pop.addEventListener('pointerdown', (event) => event.preventDefault());
    pop.addEventListener('mousedown', (event) => event.preventDefault());
    list.addEventListener('pointermove', (event) => {
      const row = event.target.closest?.('.hx-dd-opt');
      if (row) this.setActive(Number(row.dataset.i), false);
    });
    list.addEventListener('click', (event) => {
      const row = event.target.closest?.('.hx-dd-opt');
      if (row) this.choose(Number(row.dataset.i), { blur: true });
    });
    this.wrap.addEventListener('focusout', (event) => {
      if (this.isOpen && !this.wrap.contains(event.relatedTarget)) this.close();
    });
  }

  get value() {
    return this.current;
  }

  /** Değeri yazar; onChange ÇAĞRILMAZ (yalnız oyuncunun seçimi bildirilir). */
  set value(value) {
    const next = value == null ? '' : String(value);
    if (next === this.current) return;
    this.current = next;
    this.paint();
    if (this.isOpen) this.markSelected();
  }

  /** Satırları değiştirir; içerik aynıysa hiçbir şey yapmaz. */
  setItems(items) {
    this.items = items ?? [];
    const sig = signature(this.items);
    if (sig === this.sig) return;
    this.sig = sig;
    this.paint();
    if (!this.isOpen) return;
    if (!this.items.length) {
      this.close();
      return;
    }
    const keep = this.rows[this.active]?.dataset.value ?? this.current;
    this.render();
    this.place();
    this.setActive(Math.max(0, this.indexOf(keep)), true);
  }

  indexOf(value) {
    return this.items.findIndex((item) => String(item.value) === value);
  }

  /** Düğmenin yüzü: seçili satırın simgesi, adı ve işareti. */
  paint() {
    const item = this.items[this.indexOf(this.current)] ?? null;
    const key = item ? [item.value, item.label, item.glyph, item.tone].join('\u0001') : '';
    if (key === this.painted) return;
    this.painted = key;
    this.text.textContent = item?.label ?? '';
    this.button.dataset.tone = item?.tone ?? '';
    this.mark.innerHTML = item?.glyph ? glyph(item.glyph, 'hx-dd-g') : '';
    // Simge kabı her değişimde yenilenir: bayrak tuvali kaba bağlı yaşar,
    // eski kapta glif yerine bayrağa (ya da tersi) dönmek iz bırakıyordu.
    const ico = document.createElement('span');
    ico.className = 'hx-dd-ico';
    ico.setAttribute('aria-hidden', 'true');
    this.ico.replaceWith(ico);
    this.ico = ico;
    item?.icon?.(ico);
  }

  /**
   * `pointer`: fareyle açıldı. O zaman kapanışta (Esc, Enter dahil) odak
   * bırakılır; klavyeyle gelen oyuncunun odağı düğmede kalır.
   */
  open({ pointer = false } = {}) {
    if (this.isOpen || !this.items.length) return;
    this.isOpen = true;
    this.byPointer = pointer;
    hideTooltips();
    // Açıkken düğmenin bilgi kartı listenin üstüne açılmasın.
    if (this.button.dataset.tip) {
      this.tip = this.button.dataset.tip;
      delete this.button.dataset.tip;
    }
    this.button.setAttribute('aria-expanded', 'true');
    this.wrap.classList.add('is-open');
    // Önce görünür olur: bayrak tuvali arayüz ölçeğini görünür kaptan okur.
    this.pop.hidden = false;
    this.render();
    this.place();
    this.setActive(Math.max(0, this.indexOf(this.current)), true);
    if (document.activeElement !== this.button) this.button.focus({ preventScroll: true });
    document.addEventListener('pointerdown', this.outside, true);
    window.addEventListener('blur', this.lost);
    window.addEventListener('resize', this.lost);
    this.watch.observe(document.body, {
      attributes: true, attributeFilter: ['class', 'hidden'], subtree: true,
    });
  }

  close({ blur = false } = {}) {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.pop.hidden = true;
    this.wrap.classList.remove('is-open');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.removeAttribute('aria-activedescendant');
    if (this.tip) {
      this.button.dataset.tip = this.tip;
      this.tip = null;
    }
    document.removeEventListener('pointerdown', this.outside, true);
    window.removeEventListener('blur', this.lost);
    window.removeEventListener('resize', this.lost);
    this.watch.disconnect();
    if (blur && document.activeElement === this.button) this.button.blur();
  }

  choose(index, { blur = false } = {}) {
    const item = this.items[index];
    this.close({ blur });
    if (!item || String(item.value) === this.current) return;
    this.current = String(item.value);
    this.paint();
    this.onChange?.(this.current);
  }

  /** Satırlar: yalnız içerik değiştiyse yeniden kurulur. */
  render() {
    if (this.built === this.sig) {
      this.markSelected();
      return;
    }
    this.built = this.sig;
    const id = this.list.id;
    let html = '';
    let group = null;
    this.items.forEach((item, i) => {
      const g = item.group ?? '';
      if (i > 0 && g !== group) html += '<div class="hx-dd-sep" role="separator"></div>';
      group = g;
      const note = item.note || item.glyph
        ? `<span class="hx-dd-note">${item.glyph ? glyph(item.glyph, 'hx-dd-g') : ''}${esc(item.note)}</span>` : '';
      html += `<div class="hx-dd-opt" role="option" id="${id}-${i}" data-i="${i}" data-value="${esc(item.value)}"`
        + `${item.tone ? ` data-tone="${esc(item.tone)}"` : ''} aria-selected="false">`
        + `<span class="hx-dd-ico" aria-hidden="true"></span><span class="hx-dd-name">${esc(item.label)}</span>${note}</div>`;
    });
    this.list.innerHTML = html;
    this.rows = [...this.list.querySelectorAll('.hx-dd-opt')];
    this.rows.forEach((row, i) => this.items[i].icon?.(row.querySelector('.hx-dd-ico')));
    this.active = -1;
    this.markSelected();
  }

  markSelected() {
    const at = this.indexOf(this.current);
    this.rows.forEach((row, i) => row.setAttribute('aria-selected', String(i === at)));
  }

  setActive(index, scroll) {
    if (!this.rows.length) return;
    const i = Math.max(0, Math.min(this.rows.length - 1, index));
    if (i === this.active && !scroll) return;
    this.rows[this.active]?.classList.remove('is-active');
    this.active = i;
    const row = this.rows[i];
    row.classList.add('is-active');
    this.button.setAttribute('aria-activedescendant', row.id);
    if (!scroll) return;
    // scrollIntoView sayfayı da kaydırabilirdi; yalnız liste kayar.
    const list = this.list;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }

  /**
   * Yön ve boy: önce aşağı denenir, sığmıyorsa ve yukarıda daha çok yer
   * varsa yukarı açılır; ikisine de sığmazsa liste kendi içinde kayar.
   * Ölçüler görsel px'tir, yazılan değerler yerel px (bkz. uiScale.js).
   */
  place() {
    const { pop, list } = this;
    list.style.maxHeight = '';
    pop.style.left = '';
    pop.dataset.side = 'down';
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const r = this.button.getBoundingClientRect();
    const need = pop.getBoundingClientRect().height;
    const gap = GAP * uiScale();
    const below = vh - r.bottom - gap - EDGE;
    const above = r.top - gap - EDGE;
    const side = need <= below || below >= above ? 'down' : 'up';
    pop.dataset.side = side;
    const room = side === 'down' ? below : above;
    if (need > room) {
      const chrome = need - list.getBoundingClientRect().height;
      list.style.maxHeight = `${Math.max(60, toLocal(room - chrome))}px`;
    }
    const box = pop.getBoundingClientRect();
    const over = box.right - (vw - EDGE);
    if (over > 0) pop.style.left = `${-toLocal(Math.min(over, box.left - EDGE))}px`;
  }

  onKey(event) {
    // Tarayıcı kısayolları (Ctrl+R gibi) karışılmaz.
    if (event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (!this.isOpen) {
      const opens = key === 'Enter' || key === ' '
        || (event.altKey && (key === 'ArrowDown' || key === 'ArrowUp'));
      if (!opens) return;
      eat(event);
      this.open({ pointer: false });
      return;
    }
    if (MODIFIERS.has(key)) return;
    const blur = this.byPointer;
    const page = Math.max(1, Math.floor(this.list.clientHeight / (this.rows[0]?.offsetHeight || 30)) - 1);
    switch (key) {
      case 'ArrowDown': this.setActive(this.active + 1, true); break;
      case 'ArrowUp':
        if (event.altKey) this.choose(this.active, { blur });
        else this.setActive(this.active - 1, true);
        break;
      case 'PageDown': this.setActive(this.active + page, true); break;
      case 'PageUp': this.setActive(this.active - page, true); break;
      case 'Home': this.setActive(0, true); break;
      case 'End': this.setActive(this.rows.length - 1, true); break;
      case 'Enter':
      case ' ':
        this.choose(this.active, { blur });
        break;
      case 'Escape': this.close({ blur }); break;
      case 'Tab':
        // Varsayılan kesilmez: odak sıradaki denetime geçer.
        this.close();
        return;
      default:
        if (key.length === 1 && !event.altKey) {
          this.seek(key);
          break;
        }
        // Listenin kullanmadığı tuş oyuna gider; liste önce kapanır.
        this.close();
        return;
    }
    eat(event);
  }

  /** Harfle atlama: aynı harfin tekrarı sıradaki eşleşmeye geçer (yerel listedeki gibi). */
  seek(char) {
    const now = performance.now();
    const c = char.toLocaleLowerCase();
    this.typed = now - this.typedAt < TYPE_MS ? this.typed + c : c;
    this.typedAt = now;
    const repeat = [...this.typed].every((ch) => ch === this.typed[0]);
    const needle = repeat ? this.typed[0] : this.typed;
    const start = repeat ? this.active + 1 : Math.max(0, this.active);
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      if (String(this.items[i].label).toLocaleLowerCase().startsWith(needle)) {
        this.setActive(i, true);
        return;
      }
    }
  }
}
