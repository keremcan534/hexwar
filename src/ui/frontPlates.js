// CEPHE LEVHALARI — haritada cephe başına general portresi + insan sayısı.
//
// Kerem: "internetteki tarih videolarında cephelerde 123,345 gibi sayılar
// çıkıyor, sürekli inip çıkıyor, cepheye göre konumlanıyor; uzaklaşınca
// generalin fotoğrafı da haritada görünebilir, hiçbir şeyi engellemeden."
//
// Sayı burada ÜRETİLMEZ: game/frontView.js sayar (ordu panelinin
// menUnderArms toplamı + cephe kuşağındaki düşman). Bu modül yalnız yerleşim,
// sayma animasyonu ve etkileşimdir.
//
// NEDEN DOM, tuval değil: levha imleçle konuşur (data-tip kartı, tık =
// komuta kartının tıkı) ve portre ordu panelindeki <img>'in aynısıdır.
// Tuvalde bunların her biri ayrı isabet sınaması ve ikinci bir kart dili
// demekti. Konum her karede `game.on('frame')` ile yazılır: aynı görevde,
// boyamadan önce — levha haritadan bir kare bile geri kalmaz.
//
// Kare bütçesi: boşta EK KARE YOK. Sayma animasyonu sürerken (≈0.75 sn)
// game.requestRender() ister; bitince zincir kendiliğinden kopar. Konum
// yazımı yalnız değer değişince stil dokunur.

import { ZONE_DEPTH, frontCounts, frontGeometry } from '../game/frontView.js';
import { unitsOn } from '../game/units.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { subayPortresi } from './icons/subaylar.js';
import { provideTooltip } from './tooltip.js';
import { uiScale } from './uiScale.js';

const STORE_KEY = 'hexwar.map.frontPlates';
/**
 * Bu zoomun üstünde levha yok: sayaçlar 30 px'i geçer, cephe zaten okunur ve
 * levha onlarla çarpışacak yer bulamaz. Varsayılan oturma zoomu ~0.29'dur.
 */
const NEAR_ZOOM = 0.62;
/**
 * Altı STRATEJİK biçim: portre ana öğe. Eşik sayaçların uzak LOD'uyla aynı
 * (renderer drawUnitCounters, 0.34): sayaç bayrağa indiği anda levha yüze döner.
 */
const FAR_ZOOM = 0.34;
const TWEEN_MS = 750;
/**
 * CANLI SAYAÇ (Kerem: "son üç basamak sürekli hızlıca ileri geri gitsin,
 * bir şeyler oluyormuş hissi versin"). Saat akarken sayının son basamakları
 * gerçek değerin çevresinde titrer; saat durunca TAM değere oturur ve kart
 * hep tam değeri yazar — titreşim sunumdur, sayının kendisi frontView'dan.
 * Harita yeniden çizilmez: yalnız metin, ayrı bir zamanlayıcıyla (~12 Hz).
 */
const TICKER_MS = 85;
/** Titreşim genliği değerin bu payı; en az/en çok (son üç basamak). */
const TICKER_SHARE = 0.004;
const TICKER_MIN = 40;
const TICKER_MAX = 999;
/** Son sayım değişikliğinden sonra bu süre "çatışma sıcak": genlik iki kat. */
const TICKER_HOT_MS = 2500;
const MAX_OWN = 10;
const MAX_ALLY = 4;
/** HUD panellerinin dikdörtgenleri bu aralıkla yeniden okunur (okuma düzen zorlar). */
const HUD_REFRESH_MS = 500;
/**
 * Engel olan HUD: body'nin her görünür kökü (yeni panel — donanma, diplomasi,
 * province kartı — liste beklemeden engel olur) + kökünden taşan iç paneller.
 * Geçici kartlar engel DEĞİL: imleç birimin üstüne gelince levhalar yer
 * değiştirseydi her hover haritayı kıpırdatırdı; kart zaten levhanın üstünde.
 */
const HUD_NESTED = '#layer-menu, #settings, .notify-tray, .alert-strip, .battle-strip, .perf-overlay';
const HUD_PASSIVE = '.map-film, .front-plates, .unit-hover, .tip-card, .flash-hint, .screen, .menu';
/** Bundan büyük kök örtüdür (ekran, menü, olay kartı katmanı): levha zaten altında kalır. */
const HUD_COVER_SHARE = 0.5;

/**
 * Levha ölçüleri (yerel px, --ui = 1). TEK kaynak: öğeye buradan yazılır,
 * çarpışma da bunu okur — CSS ölçü vermez.
 */
const SIZES = {
  far: { own: { w: 68, h: 76 }, enemy: { w: 66, h: 20 }, ally: { w: 44, h: 58 } },
  mid: { own: { w: 108, h: 32 }, enemy: { w: 66, h: 20 }, ally: { w: 86, h: 26 } },
};

const numberFormat = new Intl.NumberFormat('en-US');
const fmt = (n) => numberFormat.format(Math.max(0, Math.round(n)));

function storedOn() {
  try {
    return localStorage.getItem(STORE_KEY) !== '0';
  } catch {
    return true;
  }
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class FrontPlates {
  constructor(game) {
    this.game = game;
    this.enabled = storedOn();
    this.plates = new Map();
    this.geometry = null;
    this.counts = new Map();
    this.geoDirty = true;
    this.countDirty = true;
    this.anchors = new Map();
    this.hudRects = [];
    this.hudAt = -Infinity;
    this.canvasRect = { left: 0, top: 0, width: 0, height: 0 };
    this.mode = null;
    this.pointer = null;
    this.placed = [];

    const layer = document.createElement('div');
    layer.className = 'front-plates is-off';
    layer.id = 'front-plates';
    // Harita filminin hemen üstü: DOM sırasında bütün HUD'dan önce, yani
    // her panel levhanın üstünde boyanır (z-index 2, bkz. frontPlates.css).
    const film = document.getElementById('map-film');
    if (film) film.after(layer);
    else document.body.prepend(layer);
    this.layer = layer;

    const box = document.getElementById('opt-front-plates');
    if (box) {
      box.checked = this.enabled;
      box.onchange = (event) => this.setEnabled(event.target.checked);
    }

    const markGeo = () => { this.geoDirty = true; this.countDirty = true; this.nudge(); };
    const markCount = () => { this.countDirty = true; this.nudge(); };
    game.on('world', () => this.reset());
    game.on('player', () => this.reset());
    for (const event of ['turn', 'command', 'diplomacy', 'peace']) game.on(event, markGeo);
    for (const event of ['battles', 'units']) game.on(event, markCount);
    game.on('frame', () => this.sync());

    // Levhanın üstündeki imleç: levha söner (altındaki harita görünsün), kart
    // ayrıntıyı taşır. Düşman levhası tıklanmaz ama yine söner.
    window.addEventListener('pointermove', (event) => {
      this.pointer = { x: event.clientX, y: event.clientY };
      this.markUnder();
    }, { passive: true });

    provideTooltip('front-plate', (key) => this.tooltip(key));
  }

  setEnabled(on) {
    this.enabled = Boolean(on);
    try {
      localStorage.setItem(STORE_KEY, this.enabled ? '1' : '0');
    } catch {
      // Tercih yalnız bu oturumda yaşar.
    }
    this.game.requestRender();
  }

  reset() {
    clearInterval(this.tickerId);
    this.tickerId = 0;
    for (const plate of this.plates.values()) plate.el.remove();
    this.plates.clear();
    this.counts.clear();
    this.anchors.clear();
    this.geometry = null;
    this.geoDirty = true;
    this.countDirty = true;
    this.placed = [];
  }

  /** Veri değişti: levha görünürse bir kare iste (görünmüyorsa kare harcama). */
  nudge() {
    if (this.enabled && this.plates.size) this.game.requestRender();
  }

  // --- Kare ---------------------------------------------------------------

  sync() {
    const t0 = performance.now();
    const game = this.game;
    const world = game.world;
    const me = game.turns?.playerNation;
    const cam = game.camera;
    const body = document.body.classList;
    // Eğik kamera (3B stil) dünya→ekran dönüşümünü değiştirir; levha orada
    // yanlış yere düşerdi. Menü ve ülke seçimi haritayı örter.
    const visible = this.enabled && world && me != null && me >= 0
      && cam.zoom < NEAR_ZOOM && !game.renderer.gfx?.style?.renderWrap
      && !body.contains('menu-open') && !body.contains('picker-open');
    if (!visible) {
      this.layer.classList.add('is-off');
      this.placed = [];
      return;
    }
    // Hafta kapanışı dilimlenir (turnJob): yarım kalmış haftanın sayısı
    // yazılmaz, iş bitince ilk karede tazelenir.
    const busy = Boolean(game.turns?.turnJob);
    if (this.geoDirty && !busy) this.rebuild(world, me);
    if (this.countDirty && !busy && this.geometry) this.recount(world);
    if (!this.plates.size) {
      this.layer.classList.add('is-off');
      this.placed = [];
      return;
    }
    this.layer.classList.remove('is-off');
    this.layer.classList.toggle('is-faded', body.contains('screen-open'));

    const mode = cam.zoom < FAR_ZOOM ? 'far' : 'mid';
    if (mode !== this.mode) {
      this.mode = mode;
      this.layer.dataset.mode = mode;
      for (const plate of this.plates.values()) {
        const size = SIZES[mode][plate.kind];
        plate.el.style.width = `${size.w}px`;
        plate.el.style.height = `${size.h}px`;
      }
    }
    const now = performance.now();
    if (now - this.hudAt > HUD_REFRESH_MS) this.readHud(now);
    this.place(world, me, mode);
    const animating = this.tick(now);
    this.markUnder();
    if (this.tickerWanted()) this.startTicker();
    game.perf?.add('ui.plates', performance.now() - t0);
    if (animating) game.requestRender();
  }

  /** Cephe geometrisi değişti: levha kümesini kur (DOM yalnız eklenen/çıkanda). */
  rebuild(world, me) {
    this.geoDirty = false;
    this.geometry = frontGeometry(world, me);
    const wanted = new Map();
    const active = this.game.activeGeneral;
    // Öncelik: seçili general, sonra cephedeki adam (sayım öncesi tümen sayısı).
    const own = this.geometry.fronts.filter((f) => f.side === 'own')
      .sort((a, b) => Number(b.general === active) - Number(a.general === active)
        || b.general.divisions.length - a.general.divisions.length || a.general.id - b.general.id)
      .slice(0, MAX_OWN);
    const allies = this.geometry.fronts.filter((f) => f.side === 'ally')
      .sort((a, b) => b.general.divisions.length - a.general.divisions.length || a.key.localeCompare(b.key))
      .slice(0, MAX_ALLY);
    own.forEach((front, rank) => {
      wanted.set(front.key, { kind: 'own', front, rank });
      wanted.set(`enemy|${front.key}`, { kind: 'enemy', front, rank: rank + 0.5 });
    });
    allies.forEach((front, rank) => wanted.set(front.key, { kind: 'ally', front, rank: 100 + rank }));

    for (const [key, plate] of this.plates) {
      if (wanted.has(key)) continue;
      plate.el.remove();
      this.plates.delete(key);
    }
    for (const [key, spec] of wanted) {
      let plate = this.plates.get(key);
      if (!plate) {
        plate = this.createPlate(key, spec.kind, spec.front);
        this.plates.set(key, plate);
      }
      plate.front = spec.front;
      plate.rank = spec.rank;
      // Çapa haftadan haftaya zıplamasın: önceki çapa hâlâ cephedeyse kalır.
      const prev = this.anchors.get(spec.front.key);
      const anchor = prev && spec.front.tiles.includes(prev) ? prev : spec.front.anchor;
      this.anchors.set(spec.front.key, anchor);
      plate.anchor = anchor;
      if (spec.kind === 'own') this.paintOwn(plate);
    }
    for (const key of [...this.anchors.keys()]) {
      if (!this.geometry.fronts.some((f) => f.key === key)) this.anchors.delete(key);
    }
  }

  createPlate(key, kind, front) {
    const el = document.createElement(kind === 'own' ? 'button' : 'div');
    // Gizli doğar: yerleşim ilk serbest yeri bulana dek sol üst köşede durmasın.
    el.className = `fp fp-${kind} is-hidden`;
    el.dataset.front = key;
    if (this.mode) {
      const size = SIZES[this.mode][kind];
      el.style.width = `${size.w}px`;
      el.style.height = `${size.h}px`;
    }
    if (kind === 'enemy') {
      el.innerHTML = '<i class="fp-flag"></i><b class="fp-men">0</b>';
    } else {
      el.innerHTML = `<span class="fp-face">${subayPortresi(front.general)}</span><b class="fp-men">0</b><i class="fp-stance"></i>`;
    }
    if (kind === 'own') {
      el.type = 'button';
      // Sekme sırasına girmez: klavyenin yolu komuta kartlarıdır.
      el.tabIndex = -1;
      el.dataset.tip = 'front-plate';
      el.dataset.tipArg = key;
      el.setAttribute('aria-label', `${front.general.name}: select command`);
      this.bindOwn(el, key);
    }
    this.layer.appendChild(el);
    return {
      key, kind, el, men: el.querySelector('.fp-men'), front, anchor: front.anchor,
      value: null, from: 0, to: null, t0: 0, cue: null, slot: 0, rect: null, shownText: '', shown: false, x: NaN, y: NaN,
    };
  }

  /**
   * Sol tık = komuta kartının tıkı (game.selectGeneral). Sağ/orta tuş ve
   * tekerlek haritaya geçer: levhanın altındaki hexe yürüyüş emri ya da zoom
   * levha yüzünden kaybolmasın.
   */
  bindOwn(el, key) {
    const canvas = this.game.renderer?.canvas ?? document.getElementById('map');
    el.addEventListener('click', () => {
      const general = this.plates.get(key)?.front?.general;
      if (general) this.game.selectGeneral(general);
    });
    el.addEventListener('pointerdown', (event) => {
      if (event.button === 0 || !canvas) return;
      event.preventDefault();
      this.layer.classList.add('is-through');
      const release = () => this.layer.classList.remove('is-through');
      window.addEventListener('pointerup', release, { once: true, capture: true });
      window.addEventListener('pointercancel', release, { once: true, capture: true });
      canvas.dispatchEvent(new PointerEvent('pointerdown', event));
    });
    el.addEventListener('contextmenu', (event) => event.preventDefault());
    el.addEventListener('wheel', (event) => {
      if (!canvas) return;
      event.preventDefault();
      canvas.dispatchEvent(new WheelEvent('wheel', event));
    }, { passive: false });
  }

  /** Duruş şeridi ve ad: haftalık (duruş değişince 'command' gelir). */
  paintOwn(plate) {
    const general = plate.front.general;
    plate.el.classList.toggle('is-advancing', general.stance === 'advance');
    plate.el.classList.toggle('is-active', this.game.activeGeneral === general);
  }

  recount(world) {
    this.countDirty = false;
    const rows = frontCounts(world, this.geometry);
    this.counts.clear();
    this.geometry.fronts.forEach((front, index) => this.counts.set(front.key, rows[index]));
    const now = performance.now();
    for (const plate of this.plates.values()) {
      const row = this.counts.get(plate.front.key);
      if (!row) continue;
      if (plate.kind === 'enemy') {
        const lead = world.nations[row.enemies[0]?.id ?? plate.front.enemyIds[0]];
        plate.el.querySelector('.fp-flag').style.background = lead?.color ?? '#7d2f22';
        this.setTarget(plate, row.enemyMen, now);
      } else {
        this.setTarget(plate, row.ourMen, now);
      }
      if (plate.kind === 'own') this.paintOwn(plate);
    }
  }

  // --- Sayma --------------------------------------------------------------

  setTarget(plate, value, now) {
    if (plate.to === value) return;
    if (plate.to == null) {
      // İlk görünüş sayılmaz: savaş başında levhalar sıfırdan "dolmasın".
      plate.value = value;
      plate.to = value;
      this.writeText(plate, value);
      return;
    }
    plate.from = plate.value;
    plate.to = value;
    plate.t0 = now;
    const cue = value < plate.from ? 'loss' : 'gain';
    if (cue !== plate.cue) {
      plate.el.classList.toggle('is-loss', cue === 'loss');
      plate.el.classList.toggle('is-gain', cue === 'gain');
      plate.cue = cue;
    }
  }

  /** Animasyonları ilerletir; sürüyorsa true (bir kare daha gerekir). */
  tick(now) {
    let active = false;
    for (const plate of this.plates.values()) {
      if (plate.to == null || plate.value === plate.to) continue;
      const t = Math.min(1, (now - plate.t0) / TWEEN_MS);
      const eased = 1 - (1 - t) ** 3;
      plate.value = t >= 1 ? plate.to : plate.from + (plate.to - plate.from) * eased;
      this.writeText(plate, plate.value);
      if (t < 1) active = true;
      else {
        // Renk ipucu sayım bitince CSS geçişiyle söner.
        plate.el.classList.remove('is-loss', 'is-gain');
        plate.cue = null;
      }
    }
    return active;
  }

  // --- Canlı sayaç -------------------------------------------------------

  /** Saat akıyor, levhalar görünüyor, bir ekran örtmüyor. */
  tickerWanted() {
    const game = this.game;
    return Boolean(this.enabled && this.plates.size && game.clock?.speed && !game.turns?.victory
      && !this.layer.classList.contains('is-off') && !document.body.classList.contains('screen-open')
      && document.visibilityState !== 'hidden');
  }

  startTicker() {
    if (this.tickerId) return;
    this.tickerId = setInterval(() => this.tickTicker(), TICKER_MS);
  }

  /** Saat durdu ya da levhalar gitti: zamanlayıcıyı bırak, sayıları tam değere oturt. */
  stopTicker() {
    clearInterval(this.tickerId);
    this.tickerId = 0;
    for (const plate of this.plates.values()) {
      if (plate.to != null && plate.kind !== 'ally') this.writeText(plate, plate.value);
    }
  }

  tickTicker() {
    if (!this.tickerWanted()) {
      this.stopTicker();
      return;
    }
    const now = performance.now();
    for (const plate of this.plates.values()) {
      if (plate.kind === 'ally' || plate.to == null || !plate.shown) continue;
      // Sayma animasyonu sürerken titreşim karışmaz: gerçek düşüş okunsun.
      if (plate.value !== plate.to) continue;
      const hot = now - plate.t0 < TICKER_HOT_MS ? 2 : 1;
      const span = Math.min(TICKER_MAX, Math.max(TICKER_MIN, plate.value * TICKER_SHARE) * hot);
      // Rastgele yürüyüş: tam değerin çevresinde gidip gelir, uzaklaşmaz.
      plate.jitter = Math.max(-span, Math.min(span, (plate.jitter ?? 0) * 0.55 + (Math.random() * 2 - 1) * span * 0.6));
      const shown = Math.max(0, plate.value + plate.jitter);
      this.writeText(plate, shown);
    }
  }

  writeText(plate, value) {
    const text = fmt(value);
    if (text === plate.shownText) return;
    plate.shownText = text;
    plate.men.textContent = text;
  }

  // --- Yerleşim -----------------------------------------------------------

  readHud(now) {
    this.hudAt = now;
    const canvas = this.game.renderer?.canvas;
    const c = canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: 0, height: 0 };
    this.canvasRect = { left: c.left, top: c.top, width: c.width, height: c.height };
    this.hudRects = [];
    const cover = c.width * c.height * HUD_COVER_SHARE;
    const seen = new Set();
    const add = (el) => {
      if (seen.has(el) || el.hidden || el.tagName === 'CANVAS' || el.matches(HUD_PASSIVE)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || r.width * r.height > cover) return;
      if (r.right <= c.left || r.bottom <= c.top || r.left >= c.left + c.width || r.top >= c.top + c.height) return;
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.05) return;
      this.hudRects.push({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height });
    };
    for (const el of document.body.children) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'LINK' || el.tagName === 'STYLE') continue;
      add(el);
    }
    for (const el of document.querySelectorAll(HUD_NESTED)) add(el);
  }

  /**
   * Engeller (kanvas px): sayaçlar, muharebe nişanları, cephe rozetleri,
   * seçim, HUD. Sayaç ölçüsü renderer'ın kendi eğrisinden (counterZoom) okunur:
   * çizilenle çarpışılan aynı kutu.
   */
  obstacles(world, me) {
    const game = this.game;
    const r = game.renderer;
    const cam = game.camera;
    const zoom = cam.zoom;
    const vw = cam.viewWidth;
    const vh = cam.viewHeight;
    const P = world.wrapWidth;
    // Periyot ekrandan dar olabilir (geniş ekran, uzak zoom): yan kopyalar da engel.
    const shifts = P && P * zoom < vw * 1.5 ? [0, -P * zoom, P * zoom] : [0];
    const out = [...this.hudRects];
    const push = (sx, sy, w, h) => {
      for (const shift of shifts) {
        const x = sx + shift - w / 2;
        const y = sy - h / 2;
        if (x > vw || y > vh || x + w < 0 || y + h < 0) continue;
        out.push({ x, y, w, h });
      }
    };
    const sides = new Map();
    const selected = new Set(game.selection ?? []);
    // Şehirdeki sayaç biraz aşağı kayar; kutu iki konumu da örter.
    const cityPad = HEX_SIZE * 0.44 * zoom;
    // Yığın başına tek kutu; görünmeyen taraf (uzakta üçüncü ülke) yığın
    // sorgusundan ÖNCE elenir — dünyanın birimlerinin çoğu odur.
    const seenTiles = new Set();
    for (const unit of world.units ?? []) {
      const tile = unit.tile;
      if (!tile || seenTiles.has(tile)) continue;
      let side = sides.get(unit.nationId);
      if (!side) {
        side = r.sideOf(world, unit.nationId, me);
        sides.set(unit.nationId, side);
      }
      if (!r.counterVisible(side)) continue;
      const s = cam.worldToScreenWrapped(tile.x, tile.y);
      // Ekran dışı yığın engel değil (yan kopyalar varsa push süzer).
      if (shifts.length === 1 && (s.x < -60 || s.y < -60 || s.x > vw + 60 || s.y > vh + 60)) continue;
      seenTiles.add(tile);
      const stack = unitsOn(tile);
      const ze = r.counterZoom(side);
      // Seçili yığının altın çerçevesi sayaçtan biraz geniş (renderer
      // drawSelection: 1.72 × 1.28, 2.5 px çizgi). Sabit 6 px pay uzak zoomda
      // 11 px'lik sayacı 31 px'lik kutuya şişirip seçilen generalin levhasını
      // düşürüyordu.
      const framed = stack.some((u) => selected.has(u));
      const w = HEX_SIZE * (framed ? 1.72 : 1.56) * ze + (framed ? 3 : 0) + 8;
      const h = HEX_SIZE * (framed ? 1.28 : 1.08) * ze + (framed ? 3 : 0) + 8;
      push(s.x, s.y + (tile.city ? cityPad / 2 : 0), w, h + (tile.city ? cityPad : 0));
    }
    // Filo rozetleri (seaLayer.drawFleets): bölge çapasının altında sabit
    // ekran ölçüsünde, en çok üç ulus yan yana + denizaltı satırı. Yalnız
    // çizilen taraflar (üçüncü ülkenin filosu Seas kipi dışında çizilmez).
    const navy = world.navyState;
    const seaGeo = navy?.presence?.size || navy?.subs?.size ? r.sea?.geometry?.(world) : null;
    if (seaGeo) {
      for (const here of [navy.presence, navy.subs]) {
        for (const [zoneId, fleets] of here ?? []) {
          const anchor = seaGeo.anchors[zoneId];
          if (!anchor) continue;
          let drawn = false;
          for (const nationId of fleets.keys()) {
            let side = sides.get(nationId);
            if (!side) {
              side = r.sideOf(world, nationId, me);
              sides.set(nationId, side);
            }
            if (side !== 'other' || r.mapMode === 'seas') { drawn = true; break; }
          }
          if (!drawn) continue;
          const s = cam.worldToScreenWrapped(anchor.x, anchor.y);
          // Kutu deniz muharebesi nişanını (çapanın 22 px üstü) da örter.
          push(s.x, s.y + 4, 140, 62);
        }
      }
    }
    const far = zoom < FAR_ZOOM;
    const hex = HEX_SIZE * 1.8 * zoom;
    for (const battle of world.battleSystem?.battles ?? []) {
      const tile = world.get(battle.q, battle.r);
      if (!tile) continue;
      const s = cam.worldToScreenWrapped(tile.x, tile.y);
      // Nişan karenin üstünde; saldırı üçgenleri karenin çevresinde.
      push(s.x, s.y - HEX_SIZE * 0.8 * zoom, far ? 20 : 80, far ? 20 : 28);
      push(s.x, s.y, hex + 8, hex + 8);
    }
    for (const badge of r.frontBadges ?? []) {
      const at = badge.at;
      const rad = Math.max(HEX_SIZE * 0.24 * zoom, 8);
      const s = cam.worldToScreenWrapped(at.x - HEX_SIZE * 0.8, at.y - HEX_SIZE * 0.8);
      // En çok üç rozet yan yana (renderer.drawFrontBadges).
      push(s.x + rad * 2.5, s.y, rad * 2.5 * 3 + 6, rad * 2 + 6);
    }
    if (game.selected) {
      const s = cam.worldToScreenWrapped(game.selected.x, game.selected.y);
      push(s.x, s.y, hex, hex);
    }
    return out;
  }

  /**
   * Levhanın aday dikdörtgenleri (kanvas px), yakından uzağa. Normal boyunca
   * üç uzaklık × beş yan kayma; sıra sabit (yapışkan yuva indeksi geçerli
   * kalsın). Uzak zoomda seçili tümenlerin çerçeveli sayaçları cephe
   * gerisini doldurur: dokuz adayla seçilen generalin levhası, tıklandığı
   * anda yer bulamayıp kayboluyordu (ölçüldü, AUDIT1 Gideon); geniş yan
   * kaymalar bunu kapatır.
   */
  candidatesFor(plate, w, h, hexPx) {
    const sign = plate.kind === 'enemy' ? -1 : 1;
    const nx = plate.front.normal.x * sign;
    const ny = plate.front.normal.y * sign;
    const a = this.game.camera.worldToScreenWrapped(plate.anchor.x, plate.anchor.y);
    // Dikdörtgenin normal yönündeki yarı uzanımı: levha cephe hexinden en az
    // bir hex ötede başlar.
    const reach = (Math.abs(nx) * w + Math.abs(ny) * h) / 2;
    const base = reach + hexPx * 0.9 + 6;
    const lateral = (Math.abs(ny) * w + Math.abs(nx) * h) * 0.6;
    const out = [];
    for (const [step, d] of [base, base + reach + 8, base + reach * 2 + 16].entries()) {
      for (const k of [0, 1, -1, 2, -2]) {
        const s = lateral * k;
        out.push({ x: a.x + nx * d - ny * s - w / 2, y: a.y + ny * d + nx * s - h / 2, w, h, cost: step + Math.abs(k) * 0.75 });
      }
    }
    return out.sort((p, q) => p.cost - q.cost);
  }

  /**
   * Levhaları öncelik sırasıyla yerleştirir: ilk serbest aday alınır
   * (önceki karedeki aday önce denenir: zoomda levha aday aday zıplamasın).
   * Serbest aday yoksa levha DÜŞER — sayaç, muharebe, seçim ve HUD hiçbir
   * zaman örtülmez.
   */
  place(world, me, mode) {
    const cam = this.game.camera;
    const scale = uiScale();
    const zoom = cam.zoom;
    const vw = cam.viewWidth;
    const vh = cam.viewHeight;
    const blocks = this.obstacles(world, me);
    const placed = [];
    const order = [...this.plates.values()].sort((a, b) => a.rank - b.rank);
    const hexPx = HEX_SIZE * Math.sqrt(3) * zoom;
    for (const plate of order) {
      const size = SIZES[mode][plate.kind];
      const w = size.w * scale;
      const h = size.h * scale;
      const row = this.counts.get(plate.front.key);
      // Karşısında düşman tümeni olmayan cephenin düşman levhası boş kalır
      // (sayım sıfıra inerken animasyon bitene dek görünür).
      const empty = plate.kind === 'enemy' && !(row?.enemyMen > 0) && plate.value === plate.to;
      let rect = null;
      if (!empty && plate.to != null) {
        const candidates = this.candidatesFor(plate, w, h, hexPx);
        const tryAt = (index) => {
          const c = candidates[index];
          if (!c || c.x < 4 || c.y < 4 || c.x + c.w > vw - 4 || c.y + c.h > vh - 4) return false;
          for (const b of blocks) if (overlaps(c, b)) return false;
          for (const p of placed) if (overlaps(c, p)) return false;
          return true;
        };
        let slot = tryAt(plate.slot) ? plate.slot : -1;
        for (let i = 0; slot < 0 && i < candidates.length; i++) if (tryAt(i)) slot = i;
        if (slot >= 0) {
          plate.slot = slot;
          rect = candidates[slot];
          placed.push({ x: rect.x - 3, y: rect.y - 3, w: rect.w + 6, h: rect.h + 6 });
        }
      }
      this.show(plate, rect, scale);
    }
    this.placed = order.filter((p) => p.rect);
  }

  show(plate, rect, scale) {
    plate.rect = rect;
    if (!rect) {
      if (plate.shown) {
        plate.el.classList.add('is-hidden');
        plate.shown = false;
      }
      return;
    }
    if (!plate.shown) {
      plate.el.classList.remove('is-hidden');
      plate.shown = true;
    }
    // Görsel px → yakınlaştırılmış kökün yerel px'i (ui/uiScale.js).
    const x = Math.round((this.canvasRect.left + rect.x) / scale);
    const y = Math.round((this.canvasRect.top + rect.y) / scale);
    if (x === plate.x && y === plate.y) return;
    plate.x = x;
    plate.y = y;
    plate.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  markUnder() {
    const p = this.pointer;
    for (const plate of this.plates.values()) {
      const r = plate.rect;
      const under = Boolean(p && r && plate.shown
        && p.x - this.canvasRect.left >= r.x && p.x - this.canvasRect.left <= r.x + r.w
        && p.y - this.canvasRect.top >= r.y && p.y - this.canvasRect.top <= r.y + r.h);
      if (under !== Boolean(plate.under)) {
        plate.under = under;
        plate.el.classList.toggle('is-under', under);
      }
    }
  }

  // --- Kart ---------------------------------------------------------------

  tooltip(key) {
    const plate = this.plates.get(key);
    const world = this.game.world;
    if (!plate || !world) return null;
    const front = plate.front;
    const row = this.counts.get(front.key);
    const general = front.general;
    const stance = general.fallingBack ? 'Falling back'
      : general.stance === 'advance' ? 'Advancing' : 'Holding';
    const enemies = (row?.enemies?.length ? row.enemies.map((e) => e.id) : front.enemyIds)
      .map((id) => world.nations[id]?.name ?? '?');
    const facing = enemies.length ? enemies.join(', ') : 'the enemy';
    const rows = [
      { label: `Our men · ${row?.ourDivisions ?? 0} ${row?.ourDivisions === 1 ? 'division' : 'divisions'}`, value: fmt(row?.ourMen ?? 0), tone: 'good' },
      { label: `Enemy facing · ${row?.enemyDivisions ?? 0} ${row?.enemyDivisions === 1 ? 'division' : 'divisions'}`, value: fmt(row?.enemyMen ?? 0), tone: 'bad' },
    ];
    if ((row?.enemies?.length ?? 0) > 1) {
      for (const e of row.enemies) rows.push({ label: `  ${world.nations[e.id]?.name ?? '?'}`, value: fmt(e.men) });
    }
    if (row?.enemyMen > 0) {
      rows.push({ label: 'Ratio', value: `${(row.ourMen / row.enemyMen).toFixed(2)} : 1` });
    }
    return {
      type: 'breakdown',
      title: general.name,
      value: stance,
      note: `${front.place ? `${front.place} front` : 'Front'} · facing ${facing} · planning ${Math.round(Math.max(0, Math.min(1, general.planning ?? 0)) * 100)}%`,
      rows,
      rowsLabel: 'Strength',
      footer: `Men under arms in this commander's divisions, against enemy divisions within ${ZONE_DEPTH} provinces of the line.<br>Click: select the command · Right-click and wheel pass to the map`,
    };
  }
}
