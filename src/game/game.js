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

  getReachable(unit) {
    return reachable(this.world, unit.tile, unit.movesLeft, {
      canEnter: (tile) => tile.terrain.passable && !tile.unit,
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
      this.turns.addLog(`${city.name} ele geçirildi (${old.name}).`);
    }
  }

  attack(unit, tile) {
    const defender = tile.unit;
    if (!defender || defender.nationId === unit.nationId || unit.movesLeft <= 0) return false;
    if (hexDistance(unit.tile.q, unit.tile.r, tile.q, tile.r) !== 1) return false;

    const result = resolveCombat(unit, defender, this.turns.rng);
    // Saldırı turun kalan hareketini tüketir.
    unit.movesLeft = 0;

    if (result.defenderDied) {
      this.turns.killUnit(defender);
      if (!result.attackerDied) this.enterTile(unit, tile);
    }
    if (result.attackerDied) this.turns.killUnit(unit);

    if (unit === this.selectedUnit) this.selectUnit(null);
    this.emit('units', this.selectedUnit);
    this.requestRender();
    return true;
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
