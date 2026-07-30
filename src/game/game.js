// Oyun kabuğu: dünya + kamera + giriş + çizimi birbirine bağlar.
// Çizim yalnızca bir şey değiştiğinde yapılır (mobil pil dostu).

import { generateWorld, HEX_SIZE } from '../world/worldgen.js';
import { generateNations } from '../world/nations.js';
import { Camera } from '../render/camera.js';
import { Renderer } from '../render/renderer.js';
import { PointerController } from '../input/pointer.js';
import { pixelToHex, hexDistance } from '../core/hex.js';
import { randomSeed } from '../core/rng.js';
import { reachable } from '../core/pathfind.js';
import { placeUnit, resolveCombat } from './units.js';
import { TurnManager } from './turn.js';
import { captureCity } from './cities.js';
import { atWar, considerPeaceOffer, declareWar } from './diplomacy.js';
import { INFAMY, addInfamy } from './infamy.js';
import { assignAllWorkers, nationBudget } from './cities.js';
import { loadFromStorage, saveToStorage } from './save.js';
import {
  ORDER, clearOrder, executeOrders, idleUnits, setOrder,
} from './orders.js';
import { roadMoveCost } from './infrastructure.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera();
    this.renderer = new Renderer(canvas, this.camera);
    this.world = null;
    this.selected = null;
    this.hovered = null;
    this.selectedUnit = null;
    this.reachable = null;   // { costs, prev } — seçili birimin menzili
    this.turns = new TurnManager(this);
    this.listeners = { select: [], world: [], turn: [], units: [] };
    this.dirty = false;
    this.frameHandle = 0;
    this.autosaveEnabled = true;

    this.input = new PointerController(canvas, this.camera, {
      onTap: (x, y) => this.handleTap(x, y),
      onHover: (x, y) => this.handleHover(x, y),
      onChange: () => this.requestRender(),
    });

    this.onResize = () => {
      this.renderer.resize();
      this.camera.setBounds(this.world?.bounds ?? this.camera.bounds ?? { minX: 0, minY: 0, maxX: 1, maxY: 1 });
      this.requestRender();
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  on(event, fn) {
    this.listeners[event]?.push(fn);
    return this;
  }

  emit(event, payload) {
    for (const fn of this.listeners[event] ?? []) fn(payload);
  }

  /** Yeni dünya üret. seed verilmezse rastgele. */
  newWorld(seed = randomSeed(), options = {}) {
    const t0 = performance.now();
    this.world = generateWorld(seed, options);
    generateNations(this.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
    this.world.genTime = performance.now() - t0;

    this.selected = null;
    this.hovered = null;
    this.selectedUnit = null;
    this.reachable = null;
    this.turns.start(this.world);
    this.renderer.invalidateCache();
    this.renderer.resize();
    this.camera.setBounds(this.world.bounds);
    this.camera.fit();
    this.emit('world', this.world);
    this.emit('turn', this.turns.turn);
    this.requestRender();
    return this.world;
  }

  tileAtScreen(sx, sy) {
    if (!this.world) return null;
    const w = this.camera.screenToWorld(sx, sy);
    const { q, r } = pixelToHex(w.x, w.y, HEX_SIZE);
    return this.world.get(q, r) ?? null;
  }

  /**
   * Tek dokunuşun anlamı bağlama göre değişir:
   * seçili birim varsa menzile git / bitişik düşmana vur, yoksa seç.
   */
  handleTap(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    this.selected = tile;

    const unit = this.selectedUnit;
    if (tile && unit && unit.hp > 0) {
      const enemy = tile.unit && tile.unit.nationId !== unit.nationId;
      if (enemy && hexDistance(unit.tile.q, unit.tile.r, tile.q, tile.r) === 1) {
        this.attack(unit, tile);
        this.emit('select', tile);
        this.requestRender();
        return;
      }
      if (!enemy && this.reachable?.costs.has(tile) && tile !== unit.tile) {
        this.moveUnit(unit, tile);
        this.emit('select', tile);
        this.requestRender();
        return;
      }
      // Menzil dışı ama girilebilir bir kareye dokunmak = "oraya yürü" emri.
      if (tile !== unit.tile && this.canEnterFor(unit)(tile)) {
        this.orderGoto(unit, tile);
        this.emit('select', tile);
        this.requestRender();
        return;
      }
    }

    this.selectUnit(tile?.unit ?? null);
    this.emit('select', tile);
    this.requestRender();
  }

  /** Yalnızca oyuncunun ve hareket hakkı olan birimleri seçilebilir kılar. */
  selectUnit(unit) {
    if (unit && unit.nationId !== this.turns.playerNation) unit = null;
    this.selectedUnit = unit;
    this.reachable = unit && unit.movesLeft > 0 ? this.getReachable(unit) : null;
    this.emit('units', unit);
  }

  /**
   * Birimin girebileceği kareler. Kara birimi denize girebilir ("bindirilmiş"),
   * gemi karaya çıkamaz.
   */
  canEnterFor(unit) {
    const world = this.world;
    // Barış içindeki ülkenin toprağına girilmez: sınırlar ancak savaşla aşılır.
    const allowed = (tile) => tile.owner < 0
      || tile.owner === unit.nationId
      || atWar(world, tile.owner, unit.nationId);

    if (unit.type.domain === 'sea') {
      return (tile) => tile.terrain.navigable && !tile.unit;
    }
    return (tile) => (tile.terrain.passable || tile.terrain.navigable)
      && !tile.unit && allowed(tile);
  }

  costForUnit() {
    return (tile) => (tile.terrain.water ? tile.terrain.seaCost : roadMoveCost(tile));
  }

  getReachable(unit) {
    return reachable(this.world, unit.tile, unit.movesLeft, {
      canEnter: this.canEnterFor(unit),
      costOf: this.costForUnit(unit),
    });
  }

  moveUnit(unit, tile) {
    const info = unit === this.selectedUnit ? this.reachable : this.getReachable(unit);
    const cost = info?.costs.get(tile);
    if (cost === undefined) return false;

    this.enterTile(unit, tile);
    unit.movesLeft = Math.max(0, unit.movesLeft - cost);
    if (unit === this.selectedUnit) this.selectUnit(unit.movesLeft > 0 ? unit : null);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return true;
  }

  /** Bir birimin kareye girişi: yerleş, toprağı al, şehirse ele geçir. */
  enterTile(unit, tile) {
    placeUnit(unit, tile);
    this.turns.claim(tile, unit.nationId);
    const city = tile.city;
    if (city && city.nationId !== unit.nationId) {
      const old = this.world.nations[city.nationId];
      captureCity(this, city, unit.nationId);
      // Şehir almak en pahalı fetihtir: bir ülkeyi yutmak dünyayı üstüne çeker.
      addInfamy(this.world.nations[unit.nationId], INFAMY.CITY);
      this.turns.addLog(`${city.name} captured from ${old.name}.`);
    }
  }

  attack(unit, tile) {
    const defender = tile.unit;
    if (!defender || defender.nationId === unit.nationId || unit.movesLeft <= 0) return false;
    if (hexDistance(unit.tile.q, unit.tile.r, tile.q, tile.r) !== 1) return false;
    // Denizdeki kara birimi savaşamaz; önce karaya çıkmalı.
    if (unit.embarked) return false;
    // Barış içindeki ülkeye saldırmak için önce savaş ilan edilmeli.
    if (!atWar(this.world, unit.nationId, defender.nationId)) return false;

    const result = resolveCombat(unit, defender, this.turns.rng, this.world);
    // Saldırı turun kalan hareketini tüketir.
    unit.movesLeft = 0;

    if (result.defenderDied) {
      this.turns.killUnit(defender);
      // Gemi karaya, kara birimi de gemisiz olmayan kareye ilerleyemez.
      if (!result.attackerDied && this.canEnterFor(unit)(tile)) this.enterTile(unit, tile);
    }
    if (result.attackerDied) this.turns.killUnit(unit);

    if (unit === this.selectedUnit) this.selectUnit(null);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return true;
  }

  // --- Sürekli emirler: mikro yönetimi azaltan katman ---

  /** Uzak hedefe yürüme emri; ilk adımı hemen atar. */
  orderGoto(unit, tile) {
    setOrder(unit, ORDER.GOTO, tile);
    executeOrders(this, unit.nationId, this.turns.rng);
    // Emir sürüyorsa birim seçili kalmasın: sıradaki birime geçilebilsin.
    this.selectUnit(unit.order || unit.movesLeft <= 0 ? null : unit);
    this.emit('units', this.selectedUnit);
    return unit.order;
  }

  setUnitOrder(unit, type) {
    if (!unit) return;
    setOrder(unit, type);
    if (type === ORDER.AUTO) executeOrders(this, unit.nationId, this.turns.rng);
    this.selectUnit(unit.order ? null : unit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
  }

  clearUnitOrder(unit) {
    if (!unit) return;
    clearOrder(unit);
    this.selectUnit(unit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
  }

  /**
   * Her turun sonunda otomatik kayıt. Mobilde uygulama arka planda kapanabilir;
   * oyuncunun 200. turda her şeyi kaybetmesi kabul edilemez.
   * Simülasyon ölçümlerinde kapatılabilsin diye anahtarlı.
   */
  autosave() {
    if (!this.autosaveEnabled || !this.world) return;
    saveToStorage(this);
  }

  save() {
    return saveToStorage(this);
  }

  load() {
    return loadFromStorage(this);
  }

  /** İşçileri ve bütçeleri baştan hesaplar; kayıt yüklendikten sonra gerekir. */
  recomputeEconomy() {
    if (!this.world) return;
    assignAllWorkers(this.world);
    for (const nation of this.world.nations) {
      nation.budget = nationBudget(this.world, nation);
    }
  }

  idleUnits() {
    return idleUnits(this.world, this.turns.playerNation);
  }

  /**
   * Hareket hakkı olan bir sonraki emirsiz birime geçer ve kamerayı oraya taşır.
   * Turu bitirmeden önce "unuttuğum birim var mı?" derdini ortadan kaldırır.
   */
  selectNextIdle() {
    const idle = this.idleUnits();
    if (!idle.length) return null;
    const current = idle.indexOf(this.selectedUnit);
    const next = idle[(current + 1) % idle.length];
    this.camera.zoom = Math.max(this.camera.zoom, 0.8);
    this.camera.centerOn(next.tile.x, next.tile.y);
    this.selected = next.tile;
    this.selectUnit(next);
    this.emit('select', next.tile);
    this.requestRender();
    return next;
  }

  declareWarOn(nationId) {
    const ok = declareWar(this, this.turns.playerNation, nationId);
    if (ok) {
      this.selectUnit(this.selectedUnit);
      this.emit('units', this.selectedUnit);
      this.requestRender();
    }
    return ok;
  }

  /** Barış teklifi: karşı taraf reddedebilir. */
  proposePeaceTo(nationId) {
    const accepted = considerPeaceOffer(this, this.turns.playerNation, nationId, this.turns.rng);
    if (!accepted) {
      this.turns.addLog(`${this.world.nations[nationId].name} rejected the peace offer.`);
    }
    this.selectUnit(this.selectedUnit);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return accepted;
  }

  endTurn() {
    this.selectUnit(null);
    this.turns.endTurn();
  }

  handleHover(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    if (tile !== this.hovered) {
      this.hovered = tile;
      this.requestRender();
    }
  }

  focusNation(nation) {
    if (!nation) return;
    this.camera.zoom = Math.max(this.camera.zoom, 1);
    this.camera.centerOn(nation.capital.x, nation.capital.y);
    this.selected = nation.capital;
    this.emit('select', nation.capital);
    this.requestRender();
  }

  requestRender() {
    this.dirty = true;
    if (this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(this.frame);
  }

  frame = () => {
    this.frameHandle = 0;
    const moving = this.input.update();
    if (this.dirty || moving) {
      this.dirty = false;
      if (this.world) {
        this.renderer.render(this.world, {
          selected: this.selected,
          hovered: this.hovered,
          selectedUnit: this.selectedUnit,
          reachable: this.reachable,
        });
      }
    }
    if (moving) this.frameHandle = requestAnimationFrame(this.frame);
  };

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.input.destroy();
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
  }
}
