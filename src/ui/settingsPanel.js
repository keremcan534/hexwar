// AYARLAR PENCERESİ — sekmeli seçenekler (Display, Graphics, Audio, Map,
// Controls, Gameplay, Game).
//
// Her satır bir tanımdır (bkz. define): adı, açıklaması, varsayılanı ve oyunu
// gerçekten değiştiren `write`. Ekranda duran ama etkisi olmayan ayar yazılmaz.
//
// Değerler iki yerde yaşar. Sahibi olan ayarın kaydı sahibindedir (tema, harita
// stili, arayüz ölçeği, hareket, katman kutuları): tanım `stored: false` der ve
// `read` onu sahibinden okur, ana menüdeki ya da katman menüsündeki eşiyle iki
// ayrı doğru oluşmaz. Geri kalanı STORE_KEY altında tek JSON'dur.
//
// Öteki modüllerin dosyalarına dokunmadan bağlanılan yerler (kare tavanı, tuşla
// kaydırma hızı, otomatik kayıt aralığı, bilgi kartı gecikmesi) hook* yöntemleridir;
// her biri neden o noktadan bağlandığını kendi başında söyler.
//
// Katman notu: ui katmanı. Simülasyona yalnız game'in açık kapılarından değer.

import { gfxStyleOptions } from '../render/gfx/index.js';
import { LIVING_LAYERS, livingFlags } from '../render/living/flags.js';
import { setUiMotion, uiMotion } from './mainMenu.js';
import { panelOpen } from './motion.js';
import { UI_FACTOR_MAX, UI_FACTOR_MIN, setUiScaleFactor, uiScaleFactor } from './uiScale.js';

const STORE_KEY = 'hexwar:options';
const $ = (id) => document.getElementById(id);

const TABS = [
  ['display', 'Display'],
  ['graphics', 'Graphics'],
  ['audio', 'Audio'],
  ['map', 'Map'],
  ['controls', 'Controls'],
  ['gameplay', 'Gameplay'],
  ['game', 'Game'],
];

/** Modüllerin kendi varsayılanları (ambience.js, uiSound.js, menuMusic.js). */
const AUDIO_DEFAULT = { master: 100, music: 42, ambience: 60, interface: 55 };

/** hud.js PAN_KEYS ile aynı tuşlar: yalnız bunların kaydırması hızlanır. */
const PAN_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** tooltip.js DELAY (700 ms) ne kadar kısalır. */
const TIP_SHIFT = { normal: 0, short: 350, fast: 600 };

/** Durgun denizin donduğu an: sıfır değil, dalga deseni dolu görünsün. */
const STILL_SEA_TIME = 137;

/** Controls sekmesindeki liste; tuşların kendisi hud.js'tedir. */
const KEY_LIST = [
  ['Space', 'Pause or resume'],
  ['+ / −', 'Game speed'],
  ['W A S D / arrows', 'Move the map'],
  ['Middle mouse drag', 'Move the map'],
  ['Mouse wheel', 'Zoom'],
  ['Home', 'Back to the capital'],
  ['M', 'Naval map'],
  ['P', 'Diplomacy'],
  ['F1 – F10', 'Management screens'],
  ['N', 'Next idle division'],
  ['1 – 9', 'Recall control group'],
  ['Ctrl + 1 – 9', 'Assign control group'],
  ['H', 'Hold position'],
  ['X / Delete', 'Stop divisions'],
  ['O', 'Toggle offensive'],
  ['F11', 'Fullscreen'],
  ['Shift + F3', 'Performance overlay'],
  ['Esc', 'Close the top window'],
];

const pct = (v) => `${Math.round(v)}%`;

/**
 * Ekran açılışı ayrı bir anahtardır: "Interface animations" bayrak dalgasını da
 * kapatıyor; Kerem yalnız sekme açılışını istemeyebilir. Kök özniteliği CSS'i yönetir.
 */
const SCREEN_ANIM_KEY = 'hexwar.ui.screenAnim';
function screenAnim() {
  try { return localStorage.getItem(SCREEN_ANIM_KEY) ?? 'on'; } catch { return 'on'; }
}
function setScreenAnim(value) {
  try { localStorage.setItem(SCREEN_ANIM_KEY, value); } catch { /* yalnız bu oturum */ }
  document.documentElement.dataset.screenAnim = value;
}
document.documentElement.dataset.screenAnim = screenAnim();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function readStore() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

const ON_OFF = [{ v: true, label: 'On' }, { v: false, label: 'Off' }];

export class SettingsPanel {
  constructor(game, { menu = null } = {}) {
    this.game = game;
    this.menu = menu;
    this.root = $('settings');
    this.store = readStore();
    this.sea = this.store.sea ?? 'high';
    this.scale = (this.store.renderScale ?? 100) / 100;
    this.panSpeed = (this.store.panSpeed ?? 100) / 100;
    this.autosaveEvery = this.store.autosave ?? 10;
    this.tipShift = TIP_SHIFT[this.store.tipDelay] ?? 0;
    this.frameGap = 0;
    this.quiet = false;
    this.audio = this.readAudio();
    this.sentMusic = null;
    this.rows = new Map();
    this.defs = this.define();
    this.byId = new Map(this.defs.map((def) => [def.id, def]));

    this.hookFrameCap();
    this.hookKeyPan();
    this.hookTooltipDelay();
    this.hookAutosave();
    this.hookSea();
    this.hookFocus();
    this.hookFullscreen();
    this.hookLayerBoxes();

    this.build();
    this.adopt();
    new MutationObserver(() => this.adopt()).observe(this.root, { childList: true });
    this.bindWindow();
    this.boot();
  }

  // ---- tanımlar ----------------------------------------------------------

  define() {
    const { game } = this;
    const r = game.renderer;
    const styles = gfxStyleOptions().map((o) => ({ v: o.name, label: o.label }));
    const layer = (id, box, label, tip, def, stored = false) => ({
      id, tab: 'map', sec: 'Map layers', label, tip, kind: 'toggle', def, stored, box,
      read: () => $(box)?.checked ?? def,
      write: (v) => this.setBox(box, v),
    });
    const volume = (id, label, tip) => ({
      id, tab: 'audio', sec: 'Volume', label, tip, kind: 'range', min: 0, max: 100, step: 1,
      def: AUDIO_DEFAULT[id], fmt: pct, live: true,
      read: () => this.audio[id],
      write: (v) => { this.audio[id] = v; this.applyAudio(); },
    });
    return [
      // --- Display ---
      {
        id: 'fullscreen', tab: 'display', sec: 'Window', label: 'Fullscreen', kind: 'toggle', def: false,
        tip: 'Fills the whole screen. F11 does the same. While fullscreen, hold Esc to leave it; a short press of Esc still closes windows in the game.',
        read: () => this.isFullscreen(),
        write: (v, boot) => (boot ? this.armFullscreen(v) : this.setFullscreen(v)),
      },
      {
        id: 'uiScale', tab: 'display', sec: 'Window', label: 'Interface scale', kind: 'range',
        min: UI_FACTOR_MIN * 100, max: UI_FACTOR_MAX * 100, step: 5, def: 100, fmt: pct, stored: false,
        tip: 'Makes every panel, button and text larger or smaller. The map is not affected. On small windows the game limits how far the interface can grow so that it still fits.',
        read: () => Math.round(uiScaleFactor() * 100),
        write: (v) => this.setUiScale(v),
      },
      {
        id: 'theme', tab: 'display', sec: 'Picture', label: 'Colour theme', kind: 'choice', def: 'dark', stored: false,
        choices: [{ v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }],
        tip: 'Colours of the panels and screens. The map keeps its own colours.',
        read: () => game.theme?.get() ?? 'dark',
        write: (v) => game.theme?.set(v),
      },
      {
        id: 'accent', tab: 'display', sec: 'Picture', label: 'Accent colour', kind: 'choice', def: 'brass', stored: false,
        choices: [{ v: 'brass', label: 'Brass' }, { v: 'steel', label: 'Steel blue' }, { v: 'silver', label: 'Silver' }, { v: 'verdigris', label: 'Verdigris' }],
        tip: 'The metal of buttons, frames and highlights. Warnings, map and pictures keep their colours.',
        read: () => game.theme?.accent?.() ?? 'brass',
        write: (v) => game.theme?.setAccent?.(v),
      },
      {
        id: 'brightness', tab: 'display', sec: 'Picture', label: 'Brightness', kind: 'range',
        min: 70, max: 130, step: 1, def: 100, fmt: pct, live: true,
        tip: 'Lightens or darkens the whole picture, map and interface alike.',
        write: () => this.applyPicture(),
      },
      {
        id: 'contrast', tab: 'display', sec: 'Picture', label: 'Contrast', kind: 'range',
        min: 70, max: 130, step: 1, def: 100, fmt: pct, live: true,
        tip: 'Widens or narrows the gap between dark and light areas.',
        write: () => this.applyPicture(),
      },
      {
        id: 'gamma', tab: 'display', sec: 'Picture', label: 'Gamma', kind: 'range',
        min: 0.7, max: 1.5, step: 0.05, def: 1, fmt: (v) => v.toFixed(2), live: true,
        tip: 'Lifts or lowers the mid-tones without touching pure black and white. Raise it if dark terrain is hard to read on your monitor.',
        write: () => this.applyPicture(),
      },

      // --- Graphics ---
      {
        id: 'gfx', tab: 'graphics', sec: 'Map', label: 'Map style', kind: 'choice', stored: false,
        def: styles.some((o) => o.v === 'vic3') ? 'vic3' : 'classic', choices: styles,
        tip: 'How the map is painted. The rules of the game do not change.',
        read: () => r.pendingGfx || r.gfxStyle || 'classic',
        write: (v) => this.setGfxStyle(v),
      },
      {
        id: 'renderScale', tab: 'graphics', sec: 'Map', label: 'Render scale', kind: 'range',
        min: 50, max: 100, step: 5, def: 100, fmt: pct,
        tip: 'Draws the map at fewer pixels and stretches it to fit the window, which raises the frame rate on a weak graphics card. The map gets softer; the interface stays sharp. NVIDIA DLSS cannot run inside a browser, so this is the honest equivalent: plain upscaling, with no AI reconstruction.',
        write: (v) => this.setRenderScale(v),
      },
      {
        id: 'sea', tab: 'graphics', sec: 'Map', label: 'Sea quality', kind: 'choice', def: 'high',
        choices: [{ v: 'high', label: 'High' }, { v: 'medium', label: 'Medium' }, { v: 'low', label: 'Low' }],
        tip: 'High: full ocean with waves and foam. Medium: the lighter animated sea. Low: a still sea, the cheapest choice, which also lets the graphics card rest while the map is idle.',
        write: (v) => this.setSea(v),
      },
      {
        id: 'film', tab: 'graphics', sec: 'Map', label: 'Map film grain', kind: 'toggle', def: true,
        tip: 'The fine grain, warm tint and darkened corners laid over the map.',
        write: (v) => { const film = $('map-film'); if (film) film.style.display = v ? '' : 'none'; },
      },
      {
        id: 'minis', tab: 'graphics', sec: 'Map', label: '3D units', kind: 'toggle', def: true,
        tip: 'Close to the map, armies and fleets appear as animated 3D miniatures. Off keeps the flat counters at every zoom, which is also lighter on the computer.',
        write: (v) => {
          const box = $('opt-3d-units');
          if (box) box.checked = v;
          r.minis.setEnabled(v);
          game.requestRender();
        },
      },
      {
        id: 'frameCap', tab: 'graphics', sec: 'Performance', label: 'Frame rate cap', kind: 'choice', def: 0,
        choices: [{ v: 0, label: 'Off' }, { v: 120, label: '120' }, { v: 60, label: '60' }, { v: 30, label: '30' }],
        tip: 'Limits how many map frames are drawn per second, to keep a laptop cool and quiet. Weekly turn processing is never slowed by the cap.',
        write: (v) => { this.frameGap = v > 0 ? 1000 / v : 0; },
      },
      {
        id: 'motion', tab: 'graphics', sec: 'Performance', label: 'Interface animations', kind: 'toggle', def: true, stored: false,
        tip: 'Panels slide and fade, and flags wave. Off makes every panel appear at once and holds flags still.',
        read: () => uiMotion() !== 'off',
        write: (v) => setUiMotion(v ? 'on' : 'off'),
      },
      {
        id: 'screen-anim', tab: 'graphics', sec: 'Performance', label: 'Screen opening fade', kind: 'toggle', def: true, stored: false,
        tip: 'A short fade when a screen or tab opens. Off opens it at once.',
        read: () => screenAnim() !== 'off',
        write: (v) => setScreenAnim(v ? 'on' : 'off'),
      },
      {
        id: 'perf', tab: 'graphics', sec: 'Performance', label: 'Performance overlay', kind: 'toggle', def: false,
        tip: 'Shows frame rate and frame times in the top right corner. Shortcut: Shift + F3.',
        read: () => Boolean($('perf-overlay')),
        write: (v) => this.setPerfOverlay(v),
      },

      // --- Audio ---
      volume('master', 'Master volume', 'Scales music, ambience and interface sounds together.'),
      volume('music', 'Music', 'The soundtrack, in the main menu and in the campaign.'),
      volume('ambience', 'Ambience', 'Wind, sea and the sounds of the front on the map.'),
      volume('interface', 'Interface sounds', 'Button clicks, tabs and confirmations.'),
      {
        id: 'focusMute', tab: 'audio', sec: 'Behaviour', label: 'Mute when the window is unfocused', kind: 'toggle', def: false,
        tip: 'Silences the game while you are working in another window. Sound returns when you come back.',
        write: () => this.syncQuiet(),
      },

      // --- Map ---
      layer('labels', 'opt-labels', 'Labels', 'Names of countries, seas and cities on the map.', true, true),
      layer('countryBorders', 'opt-country-borders', 'Country borders', 'The lines between nations.', true),
      layer('provinceBorders', 'opt-province-borders', 'Province borders', 'The lines between states inside a nation.', true),
      layer('grid', 'opt-grid', 'Hex grid', 'Outlines every hex on the map.', false),
      layer('plates', 'opt-front-plates', 'Front strength', 'Plates over each front showing its general and how many men hold it.', true),
      {
        id: 'occupation', tab: 'map', sec: 'Map layers', label: 'Occupied land shading', kind: 'toggle', def: true,
        tip: 'Tints and hatches land held by an enemy army in the colour of the occupier.',
        write: (v) => { r.setOccupationShade(v); game.requestRender(); },
      },
      {
        id: 'minimap', tab: 'map', sec: 'Map layers', label: 'Minimap', kind: 'toggle', def: true,
        tip: 'The small world map in the bottom right corner.',
        write: (v) => { const box = $('minimap'); if (box) box.style.display = v ? '' : 'none'; },
      },
      ...LIVING_LAYERS.map(({ key, label }) => ({
        id: `living-${key}`, tab: 'map', sec: 'Living world', label, kind: 'toggle', def: true, stored: false,
        tip: 'Visual only: it never changes the rules of the game.',
        read: () => livingFlags.stored(key),
        write: (v) => { livingFlags.set(key, v); game.requestRender(); },
      })),

      // --- Controls ---
      {
        id: 'panSpeed', tab: 'controls', sec: 'Camera', label: 'Map pan speed', kind: 'range',
        min: 50, max: 250, step: 10, def: 100, fmt: pct, live: true,
        tip: 'How far the keyboard and edge scrolling move the map. Dragging with the middle mouse button always follows the cursor exactly.',
        write: (v) => { this.panSpeed = v / 100; game.input.edge.speed = v / 100; },
      },
      {
        id: 'zoomSpeed', tab: 'controls', sec: 'Camera', label: 'Zoom speed', kind: 'range',
        min: 50, max: 250, step: 10, def: 100, fmt: pct, live: true,
        tip: 'How much one step of the mouse wheel zooms.',
        write: (v) => { game.input.zoomSpeed = v / 100; },
      },
      {
        id: 'invertZoom', tab: 'controls', sec: 'Camera', label: 'Invert zoom', kind: 'toggle', def: false,
        tip: 'Reverses the mouse wheel: rolling forward zooms out.',
        write: (v) => { game.input.invertZoom = v; },
      },
      {
        id: 'edgeScroll', tab: 'controls', sec: 'Camera', label: 'Edge scrolling', kind: 'toggle', def: false,
        tip: 'Moves the map when the cursor touches the edge of the window. Works best in fullscreen.',
        write: (v) => game.input.setEdgeScroll(v),
      },

      // --- Gameplay ---
      {
        id: 'autosave', tab: 'gameplay', sec: 'Campaign', label: 'Autosave', kind: 'choice', def: 10,
        choices: [{ v: 0, label: 'Off' }, { v: 5, label: '5 wk' }, { v: 10, label: '10 wk' }, { v: 20, label: '20 wk' }, { v: 52, label: '1 year' }],
        tip: 'How many game weeks pass between automatic saves. Autosaves use their own slot and never replace your manual saves.',
        write: (v) => { this.autosaveEvery = v; this.retellAutosave(); },
      },
      {
        id: 'focusPause', tab: 'gameplay', sec: 'Campaign', label: 'Pause when the window is unfocused', kind: 'toggle', def: false,
        tip: 'Stops the clock while you are in another window and restarts it at the same speed when you return.',
      },
      {
        id: 'tipDelay', tab: 'gameplay', sec: 'Interface', label: 'Tooltip delay', kind: 'choice', def: 'normal',
        choices: [{ v: 'normal', label: 'Normal' }, { v: 'short', label: 'Short' }, { v: 'fast', label: 'Fast' }],
        tip: 'How long the cursor must rest on something before its explanation opens: 0.7, 0.35 or 0.1 seconds.',
        write: (v) => { this.tipShift = TIP_SHIFT[v] ?? 0; },
      },
    ];
  }

  // ---- değerler ----------------------------------------------------------

  /** Ayarın şu anki değeri: sahibi varsa ondan, yoksa kayıttan. */
  value(def) {
    if (def.read) return def.read();
    return this.store[def.id] ?? def.def;
  }

  persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.store));
    } catch {
      // Depo kapalıysa ayarlar yalnız bu oturumda geçerli.
    }
  }

  /** Oyuncunun seçimi: kaydet, uygula, satırı boya. */
  commit(def, value, { save = true } = {}) {
    if (def.stored !== false) this.store[def.id] = value;
    if (save) this.persist();
    def.write?.(value, false);
    // İstenen değil gerçekleşen boyanır: tam ekran reddedilebilir, ölçek tavana takılabilir.
    this.paint(def);
  }

  /** Açılışta kayıtlı değerleri uygula; kaydı olmayan ayar varsayılanında kalır. */
  boot() {
    for (const def of this.defs) {
      if (def.stored === false || !(def.id in this.store)) continue;
      def.write?.(this.store[def.id], true);
    }
    this.applyAudio();
    this.syncAll();
  }

  state() {
    return Object.fromEntries(this.defs.map((def) => [def.id, this.value(def)]));
  }

  // ---- pencere -----------------------------------------------------------

  build() {
    const tabs = $('opt-tabs');
    const body = $('opt-body');
    const gamePane = $('opt-pane-game');
    this.panes = new Map([['game', gamePane]]);
    this.tabButtons = new Map();
    for (const [id, label] of TABS) {
      const btn = el('button', 'action', label);
      btn.type = 'button';
      btn.id = `opt-tab-${id}`;
      btn.setAttribute('role', 'tab');
      btn.addEventListener('click', () => this.showTab(id));
      tabs.append(btn);
      this.tabButtons.set(id, btn);
      if (id === 'game') continue;
      const pane = el('section', 'opt-pane');
      pane.id = `opt-pane-${id}`;
      pane.setAttribute('role', 'tabpanel');
      pane.hidden = true;
      body.insertBefore(pane, gamePane);
      this.panes.set(id, pane);
    }
    gamePane.setAttribute('aria-labelledby', 'opt-tab-game');

    let sec = '';
    for (const def of this.defs) {
      const pane = this.panes.get(def.tab);
      const key = `${def.tab}/${def.sec}`;
      if (key !== sec) {
        sec = key;
        pane.append(el('h3', 'opt-sec', def.sec));
      }
      pane.append(this.buildRow(def));
      if (def.id === 'gfx') {
        this.gfxSlot = el('div', 'opt-gfx');
        pane.append(this.gfxSlot);
      }
    }

    const controls = this.panes.get('controls');
    controls.append(el('h3', 'opt-sec', 'Keys'));
    const keys = el('div', 'opt-keys');
    for (const [key, what] of KEY_LIST) {
      const row = el('div');
      row.append(el('span', '', what), el('kbd', '', key));
      keys.append(row);
    }
    controls.append(keys);

    this.legacy = el('div', 'opt-legacy');
    this.root.append(this.legacy);
    this.showTab('display');
  }

  buildRow(def) {
    const row = el('div', 'opt-row');
    row.dataset.opt = def.id;
    const label = el('span', 'opt-label', def.label);
    label.dataset.tip = 'text';
    label.dataset.tipText = `${def.label}\n${def.tip}`;
    row.append(label);

    if (def.kind === 'range') {
      const box = el('div', 'field opt-range');
      const input = el('input');
      input.type = 'range';
      input.min = String(def.min);
      input.max = String(def.max);
      input.step = String(def.step);
      input.setAttribute('aria-label', def.label);
      const out = el('output');
      input.addEventListener('input', () => {
        const v = Number(input.value);
        this.paint(def, v);
        if (def.live) this.commit(def, v, { save: false });
      });
      input.addEventListener('change', () => {
        this.commit(def, Number(input.value));
        if (def.id === 'interface' || def.id === 'master') this.game.uiSound?.play('click');
      });
      box.append(input, out);
      row.append(box);
      this.rows.set(def.id, { input, out });
      return row;
    }

    const box = el('div', 'opt-seg');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', def.label);
    const buttons = (def.kind === 'toggle' ? ON_OFF : def.choices).map((choice) => {
      const btn = el('button', 'action', choice.label);
      btn.type = 'button';
      btn.addEventListener('click', () => this.commit(def, choice.v));
      box.append(btn);
      return { btn, v: choice.v };
    });
    row.append(box);
    this.rows.set(def.id, { buttons });
    return row;
  }

  paint(def, value = this.value(def)) {
    const ui = this.rows.get(def.id);
    if (!ui) return;
    if (ui.input) {
      if (Number(ui.input.value) !== value) ui.input.value = String(value);
      ui.out.textContent = def.fmt(value);
      ui.input.style.setProperty('--pct', pct(((value - def.min) / (def.max - def.min)) * 100));
      return;
    }
    for (const { btn, v } of ui.buttons) {
      const on = v === value;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  paintId(id) {
    const def = this.byId.get(id);
    if (def) this.paint(def);
  }

  syncAll() {
    for (const def of this.defs) this.paint(def);
  }

  showTab(id) {
    this.tab = id;
    for (const [key, pane] of this.panes) pane.hidden = key !== id;
    for (const [key, btn] of this.tabButtons) {
      const on = key === id;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
    }
    $('opt-body').scrollTop = 0;
  }

  /**
   * Ses, tema ve stil modülleri kendi satırlarını #settings'e ekler. Onlara
   * dokunmadan pencerenin düzeni korunur: harita stili kutusu Graphics
   * sekmesine (stilin Tilt kaydırıcısı onunla gelir), ötekiler görünmez kaba.
   */
  adopt() {
    const keep = new Set([this.legacy, $('opt-tabs'), $('opt-body'), $('save-info'), $('opt-reset')]);
    for (const node of [...this.root.children]) {
      if (keep.has(node) || node.classList.contains('panel-head')) continue;
      if (node.classList.contains('gfx-settings')) this.gfxSlot.append(node);
      else this.legacy.append(node);
    }
    // Tema satırı stil kutusunun hemen arkasına kurulur (theme.js).
    for (const node of this.gfxSlot.querySelectorAll(':scope > :not(.gfx-settings)')) this.legacy.append(node);
  }

  close() {
    $('btn-close-settings').click();
  }

  bindWindow() {
    const { root } = this;
    new MutationObserver(() => {
      const open = panelOpen(root);
      if (open === this.wasOpen) return;
      this.wasOpen = open;
      if (open) this.onOpen();
      else this.disarmReset();
    }).observe(root, { attributes: true, attributeFilter: ['class'] });

    $('opt-scrim').addEventListener('click', () => this.close());
    $('opt-reset').addEventListener('click', () => this.reset());

    // Yukarı/aşağı ok sekmeler arasında gezer (dikey sekme dizisi).
    $('opt-tabs').addEventListener('keydown', (event) => {
      const step = { ArrowDown: 1, ArrowUp: -1 }[event.code];
      if (!step) return;
      event.preventDefault();
      const at = TABS.findIndex(([id]) => id === this.tab);
      const next = TABS[(at + step + TABS.length) % TABS.length][0];
      this.showTab(next);
      this.tabButtons.get(next).focus();
    });

    // Pencere açıkken klavye pencerenindir. Belge düzeyinde kesilir: denetimlerin
    // kendi tuşları (kaydırıcı okları, odaktaki düğmenin Space'i) çalışır, oyunun
    // pencere düzeyindeki kısayolları (Space saati, WASD, F1-F10) çalışmaz.
    document.addEventListener('keydown', (event) => {
      if (!panelOpen(root) || document.querySelector('.event-card-layer, #epilogue')) return;
      if (event.code === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        return;
      }
      if (event.code === 'Tab' || event.code === 'F11' || event.code === 'F12') return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      // F5 oyunda bir sekmedir: burada kesilince sayfayı yenilemesin.
      if (/^F\d+$/.test(event.code)) event.preventDefault();
      event.stopPropagation();
    });

    // Ana menünün müzik denetimleri aynı değeri değiştirir.
    const pull = () => setTimeout(() => this.pullMusic());
    $('menu-volume')?.addEventListener('input', pull);
    $('menu-mute')?.addEventListener('click', pull);
  }

  onOpen() {
    this.pullMusic();
    this.syncAll();
    this.retellAutosave();
    this.tabButtons.get(this.tab)?.focus({ preventScroll: true });
  }

  /** İki tık: yanlış bir tık bütün seçimleri silmesin (Generate ile aynı dil). */
  reset() {
    const btn = $('opt-reset');
    if (!this.resetArmed) {
      this.resetArmed = true;
      btn.classList.add('confirming');
      btn.textContent = 'Click again to reset';
      clearTimeout(this.resetTimer);
      this.resetTimer = setTimeout(() => this.disarmReset(), 6000);
      return;
    }
    this.disarmReset();
    for (const def of this.defs) this.commit(def, def.def, { save: false });
    this.persist();
    this.syncAll();
  }

  disarmReset() {
    clearTimeout(this.resetTimer);
    if (!this.resetArmed) return;
    this.resetArmed = false;
    const btn = $('opt-reset');
    btn.classList.remove('confirming');
    btn.textContent = 'Reset to defaults';
  }

  // ---- görüntü -----------------------------------------------------------

  isFullscreen() {
    return Boolean(document.fullscreenElement) || this.browserFullscreen();
  }

  /** Tarayıcının kendi tam ekranı (F11 menüden ya da başlatıcının --start-fullscreen'i). */
  browserFullscreen() {
    return !document.fullscreenElement && Boolean(window.matchMedia?.('(display-mode: fullscreen)').matches);
  }

  setFullscreen(on) {
    if (on && !document.fullscreenElement) {
      if (this.browserFullscreen()) return;
      document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => this.afterFullscreen());
      // Gömülü pencerelerde istek ne kabul ne ret alır: tercih askıda kalmasın.
      setTimeout(() => { if (!document.fullscreenElement) this.afterFullscreen(); }, 2000);
    } else if (!on && document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => this.afterFullscreen());
    } else if (!on && this.browserFullscreen()) {
      // Bu kipten sayfa çıkamaz: yalan söyleyen düğme yerine yol gösterilir.
      $('save-info').textContent = 'This window was started fullscreen: press F11 to leave it.';
      this.paintId('fullscreen');
    }
  }

  /**
   * Tarayıcı tam ekranı yalnız bir kullanıcı hareketiyle açar: kayıtlı tercih
   * oyuncunun ilk tıkında ya da tuşunda yerine getirilir. `click`: basışta açılsa
   * pencere bırakıştan önce büyür ve tıklanan düğme imlecin altından kayardı.
   */
  armFullscreen(on) {
    if (!on || this.isFullscreen()) return;
    const go = (event) => {
      document.removeEventListener('click', go, true);
      document.removeEventListener('keydown', go, true);
      if (event.code !== 'Escape') this.setFullscreen(true);
    };
    document.addEventListener('click', go, true);
    document.addEventListener('keydown', go, true);
  }

  afterFullscreen() {
    const on = Boolean(document.fullscreenElement);
    this.store.fullscreen = on;
    this.persist();
    // Esc tam ekranı düşürmesin: oyunda en sık basılan tuştur ve pencereleri
    // kapatır. Kilitliyken tarayıcı çıkışı Esc'e basılı tutmaya taşır.
    if (on) navigator.keyboard?.lock?.(['Escape']).catch(() => {});
    else navigator.keyboard?.unlock?.();
    this.paintId('fullscreen');
  }

  hookFullscreen() {
    document.addEventListener('fullscreenchange', () => this.afterFullscreen());
    window.matchMedia?.('(display-mode: fullscreen)').addEventListener?.('change', () => this.paintId('fullscreen'));
    // F11 tarayıcıya bırakılsaydı sayfa onu göremez, düğme yanlış kalırdı.
    window.addEventListener('keydown', (event) => {
      if (event.code !== 'F11' || event.ctrlKey || event.altKey || event.metaKey || this.browserFullscreen()) return;
      event.preventDefault();
      if (!event.repeat) this.setFullscreen(!document.fullscreenElement);
    }, true);
  }

  setUiScale(percent) {
    setUiScaleFactor(percent / 100);
    // Üst çubuğun yüksekliğini ve sayaç konumlarını ölçen kod pencereyi dinler.
    window.dispatchEvent(new Event('resize'));
  }

  /**
   * Kök öğede süzgeç: yalnız kök, içindeki `position: fixed` öğelerin konumunu
   * bozmaz. Varsayılan değerlerde süzgeç hiç yazılmaz, maliyeti sıfır kalır.
   */
  applyPicture() {
    const brightness = this.store.brightness ?? 100;
    const contrast = this.store.contrast ?? 100;
    const gamma = this.store.gamma ?? 1;
    const parts = [];
    if (brightness !== 100) parts.push(`brightness(${brightness / 100})`);
    if (contrast !== 100) parts.push(`contrast(${contrast / 100})`);
    if (gamma !== 1) {
      this.gammaFilter(gamma);
      parts.push('url(#hx-gamma)');
    }
    document.documentElement.style.filter = parts.join(' ');
  }

  /** CSS'te gama işlevi yok: SVG aktarım süzgeci, kanal başına. */
  gammaFilter(gamma) {
    if (!this.gammaNodes) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.style.cssText = 'position:fixed;width:0;height:0;pointer-events:none';
      const filter = document.createElementNS(NS, 'filter');
      filter.id = 'hx-gamma';
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      const transfer = document.createElementNS(NS, 'feComponentTransfer');
      this.gammaNodes = ['feFuncR', 'feFuncG', 'feFuncB'].map((name) => {
        const fn = document.createElementNS(NS, name);
        fn.setAttribute('type', 'gamma');
        transfer.append(fn);
        return fn;
      });
      filter.append(transfer);
      svg.append(filter);
      document.body.append(svg);
    }
    for (const fn of this.gammaNodes) fn.setAttribute('exponent', String(1 / gamma));
  }

  // ---- grafik ------------------------------------------------------------

  setGfxStyle(name) {
    const select = $('opt-gfx-style');
    if (!select) return;
    select.value = name;
    select.dispatchEvent(new Event('change'));
  }

  setRenderScale(percent) {
    this.scale = percent / 100;
    this.game.renderer.setRenderScale(this.scale);
    this.syncOcean();
    this.game.requestRender();
  }

  setPerfOverlay(on) {
    if (Boolean($('perf-overlay')) === Boolean(on)) return;
    // Kaplamanın tek kapısı kendi kısayolu (bkz. perfOverlay.js).
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'F3', key: 'F3', shiftKey: true }));
  }

  setSea(quality) {
    this.sea = quality;
    this.setBox('opt-live-sea', quality !== 'low');
    this.syncOcean();
    this.game.requestRender();
  }

  /**
   * Okyanus katmanı (lab/entegre.js) ana modülden sonra ve geç yüklenir; bu
   * yüzden kare başına yoklanır. Kendi piksel oranını tutar, pencere her
   * boyutlanınca sıfırlar: çizim ölçeği burada yeniden yazılır.
   */
  syncOcean() {
    const ocean = window.deniz;
    if (!ocean) return;
    const show = this.sea === 'high';
    if (ocean.gorunur !== show) ocean.goster(show);
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * this.scale;
    if (Math.abs(ocean.gl.getPixelRatio() - ratio) > 0.001) {
      ocean.gl.setPixelRatio(ratio);
      ocean.tazeleIste(4);
    }
  }

  /**
   * Durgun deniz. Düşük kalitede boşta kare istenmez ve GL denizin saati
   * dondurulur; yalnız kare istememek dalgayı her kaydırmada sıçratırdı.
   */
  hookSea() {
    const { game } = this;
    const r = game.renderer;
    const active = r.waterActive.bind(r);
    r.waterActive = () => (this.sea === 'low'
      ? r.labelFadePending === true || r.waterSkipped === true
      : active());
    const gl = r.waterGL;
    if (gl) {
      const draw = gl.draw.bind(gl);
      gl.draw = (camera, time, ...rest) => draw(camera, this.sea === 'low' ? STILL_SEA_TIME : time, ...rest);
    }
    game.on('frame', () => this.syncOcean());
  }

  /**
   * Kare tavanı. Game üç yerden doğrudan requestAnimationFrame(this.frame) ister
   * ve okyanus katmanı game.frame'i sarar; tek ortak nokta istek anıdır. Yalnız
   * oyunun karesi süzülür, öteki rAF kullanıcıları (bayrak, menü) etkilenmez.
   * Hafta kapanışı dilimlerini kare zinciri pompalar: iş sürerken tavan
   * uygulanmaz, yoksa 30 FPS simülasyonu da yavaşlatırdı.
   */
  hookFrameCap() {
    const { game } = this;
    const native = window.requestAnimationFrame.bind(window);
    let nextAt = 0;
    window.requestAnimationFrame = (callback) => {
      if (!this.frameGap || callback !== game.frame) return native(callback);
      const gate = (ts) => {
        const gap = this.frameGap;
        if (!gap || game.turns?.turnJob || ts >= nextAt - 1) {
          // Faz kilidi: 144 Hz'te 60 FPS, 2-3 vsync aralıklarıyla ortalama 60 eder.
          nextAt = ts - nextAt > gap ? ts + gap : nextAt + gap;
          callback(ts);
        } else native(gate);
      };
      return native(gate);
    };
  }

  // ---- ses ---------------------------------------------------------------

  /** İlk açılış: ayar yoksa modüllerin bugünkü düzeyi başlangıç sayılır. */
  readAudio() {
    const { game, store } = this;
    const amb = game.ambience;
    const ui = game.uiSound;
    const music = this.menu?.music;
    return {
      master: store.master ?? AUDIO_DEFAULT.master,
      music: store.music ?? (music ? (music.muted ? 0 : Math.round(music.level * 100)) : AUDIO_DEFAULT.music),
      ambience: store.ambience ?? (amb ? (amb.muted ? 0 : amb.volume) : AUDIO_DEFAULT.ambience),
      interface: store.interface ?? (ui ? (ui.muted ? 0 : ui.volume) : AUDIO_DEFAULT.interface),
    };
  }

  /** Kanal × ana düzey, modüllerin kendi kapılarından. */
  applyAudio() {
    const { game, audio, quiet } = this;
    const k = audio.master / 100;
    for (const [module, level] of [[game.ambience, audio.ambience], [game.uiSound, audio.interface]]) {
      if (!module) continue;
      const volume = Math.round(level * k);
      const mute = quiet || volume <= 0;
      if (module.muted !== mute) module.setMuted(mute);
      if (module.volume !== volume) module.setVolume(volume);
    }
    const music = this.menu?.music;
    if (music) {
      const level = (audio.music * k) / 100;
      this.sentMusic = level;
      if (Math.abs(music.level - level) > 0.002 || music.muted !== (level <= 0.001)) music.setVolume(level);
      game.music?.deck?.apply();
    }
  }

  /** Ana menüde değiştirilen müzik düzeyi bu pencereye geri yazılır. */
  pullMusic() {
    const music = this.menu?.music;
    const k = this.audio.master / 100;
    if (!music || k <= 0 || this.sentMusic == null) return;
    if (music.muted === (this.sentMusic <= 0.001) && Math.abs(music.level - this.sentMusic) <= 0.005) return;
    this.audio.music = music.muted ? 0 : clamp(Math.round((music.level / k) * 100), 0, 100);
    this.sentMusic = music.muted ? 0 : music.level;
    this.store.music = this.audio.music;
    this.persist();
    this.paintId('music');
  }

  /** Odak kaybında sessizlik: kayıtlı düzeyler değişmez, yalnız çıkış kesilir. */
  syncQuiet() {
    const quiet = Boolean(this.store.focusMute) && !this.focused;
    if (quiet === this.quiet) return;
    this.quiet = quiet;
    const { game, audio } = this;
    const k = audio.master / 100;
    if (game.ambience) {
      game.ambience.muted = quiet || audio.ambience * k <= 0;
      game.ambience.update();
    }
    if (game.uiSound) {
      game.uiSound.muted = quiet || audio.interface * k <= 0;
      game.uiSound.apply();
    }
    if (this.menu?.music) this.menu.music.audio.muted = quiet;
    game.music?.deck?.apply();
  }

  hookFocus() {
    const { game } = this;
    this.focused = document.hasFocus();
    // Oyun müziği her düzey okumasında buradan geçer: sessizlik sırasında
    // başlayan yeni parça da sessiz başlar.
    const music = game.music;
    if (music) {
      const level = music.outputLevel.bind(music);
      music.outputLevel = () => (this.quiet ? 0 : level());
    }
    let resume = 0;
    window.addEventListener('blur', () => {
      this.focused = false;
      this.syncQuiet();
      if (this.store.focusPause && game.clock?.speed > 0 && !document.body.classList.contains('menu-open')) {
        resume = game.clock.speed;
        game.setSpeed(0);
      }
    });
    window.addEventListener('focus', () => {
      this.focused = true;
      this.syncQuiet();
      // Bu arada açılan olay kartı saati kendisi tutar ve kapanınca kendisi açar.
      if (resume && !game.clock?.speed && !document.querySelector('.event-card-layer')) game.setSpeed(resume);
      resume = 0;
    });
  }

  // ---- harita ------------------------------------------------------------

  /** Katman menüsündeki kutuyu sürer: hud.js'in onchange'i işi yapar. */
  setBox(id, on) {
    const box = $(id);
    if (!box || box.checked === on) return;
    box.checked = on;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /** Katman menüsünden yapılan değişiklik bu pencereye yansır. */
  hookLayerBoxes() {
    for (const def of this.defs) {
      if (!def.box) continue;
      $(def.box)?.addEventListener('change', () => {
        if (def.stored !== false) {
          this.store[def.id] = $(def.box).checked;
          this.persist();
        }
        this.paint(def);
      });
    }
    // Harita katmanları menüsündeki kutu aynı ayarı yazar.
    $('opt-3d-units')?.addEventListener('change', (event) => this.commit(this.byId.get('minis'), event.target.checked));
    $('opt-live-sea')?.addEventListener('change', (event) => {
      const live = event.target.checked;
      if (live === (this.sea !== 'low')) return;
      this.commit(this.byId.get('sea'), live ? 'high' : 'low');
    });
  }

  // ---- denetimler --------------------------------------------------------

  /**
   * Tuşla kaydırmanın adımı hud.js'te sabittir. Tuşun olay süresince kameranın
   * adımı çarpılır; fareyle sürükleme aynı işlevden geçtiği halde çarpılmaz,
   * çünkü harita imlecin altında kalmalıdır.
   */
  hookKeyPan() {
    const { game } = this;
    const camera = game.camera;
    const pan = camera.panByScreen.bind(camera);
    let keyed = false;
    camera.panByScreen = (dx, dy) => (keyed ? pan(dx * this.panSpeed, dy * this.panSpeed) : pan(dx, dy));
    window.addEventListener('keydown', (event) => { keyed = PAN_CODES.has(event.code); }, true);
    window.addEventListener('keydown', () => { keyed = false; });
    window.addEventListener('keyup', () => { keyed = false; }, true);
    game.input.edge.speed = this.panSpeed;
    game.input.edge.gate = () => {
      const body = document.body.classList;
      return !body.contains('menu-open') && !body.contains('picker-open') && !body.contains('screen-open')
        && !panelOpen(this.root) && document.hasFocus();
    };
  }

  // ---- oynanış -----------------------------------------------------------

  /**
   * Otomatik kayıt: turn.js sabit on haftada bir game.autosave() çağırır. O çağrı
   * boşa alınır, aralığı burası sayar. Yazımın kendisi (duraklamayı bekleme,
   * yuva, hata bildirimi) game.js'te olduğu gibi kalır.
   */
  hookAutosave() {
    const { game } = this;
    const flag = game.autosave.bind(game);
    game.autosave = () => {};
    let last = game.turns?.turn ?? 0;
    // Dünya yüklenince de `turn` yayılır: o an kayıt anı değildir.
    game.on('world', () => { last = game.turns?.turn ?? 0; });
    game.on('turn', () => {
      const turn = game.turns?.turn ?? 0;
      if (turn === last) return;
      last = turn;
      if (this.autosaveEvery > 0 && turn % this.autosaveEvery === 0) flag();
    });
    const watch = (node, options) => {
      if (node) new MutationObserver(() => this.retellAutosave()).observe(node, options);
    };
    watch($('save-info'), { childList: true, characterData: true, subtree: true });
    watch($('screen-body'), { childList: true });
  }

  /** "Her on haftada" yazan sabit cümleler seçilen aralığı söylesin. */
  retellAutosave() {
    const weeks = this.autosaveEvery;
    if (weeks === 10) return;
    for (const node of [$('save-info'), ...document.querySelectorAll('#screen-body .card-head small')]) {
      if (!node?.textContent.includes('autosaves every ten weeks')) continue;
      node.textContent = weeks > 0
        ? node.textContent.replace('autosaves every ten weeks', `autosaves every ${weeks} weeks`)
        : node.textContent.replace(/(t)he game (?:also )?autosaves every ten weeks(?: into its own slot)?/i,
          (_, t) => (t === 'T' ? 'Autosave is off' : 'autosave is off'));
    }
  }

  /**
   * Bilgi kartı gecikmesi tooltip.js'te sabittir ve bekleme olayın zaman
   * damgasından sayılır (ana iş parçacığı meşgulken kart geç açılmasın diye).
   * Damga geriye alınınca kart aynı yoldan daha erken açılır.
   */
  hookTooltipDelay() {
    const shift = (event) => {
      if (this.tipShift) Object.defineProperty(event, 'timeStamp', { value: event.timeStamp - this.tipShift });
    };
    window.addEventListener('pointerover', shift, true);
    window.addEventListener('focusin', shift, true);
  }
}
