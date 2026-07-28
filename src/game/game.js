// Oyun kabuğu: dünya + kamera + giriş + çizimi birbirine bağlar.
// Çizim yalnızca bir şey değiştiğinde yapılır (mobil pil dostu).

import { generateWorld, HEX_SIZE } from '../world/worldgen.js';
import { generateNations } from '../world/nations.js';
import { Camera } from '../render/camera.js';
import { Renderer } from '../render/renderer.js';
import { PointerController } from '../input/pointer.js';
import { pixelToHex } from '../core/hex.js';
import { randomSeed } from '../core/rng.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.camera = new Camera();
    this.renderer = new Renderer(canvas, this.camera);
    this.world = null;
    this.selected = null;
    this.hovered = null;
    this.listeners = { select: [], world: [] };
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
    this.renderer.invalidateCache();
    this.renderer.resize();
    this.camera.setBounds(this.world.bounds);
    this.camera.fit();
    this.emit('world', this.world);
    this.requestRender();
    return this.world;
  }

  tileAtScreen(sx, sy) {
    if (!this.world) return null;
    const w = this.camera.screenToWorld(sx, sy);
    const { q, r } = pixelToHex(w.x, w.y, HEX_SIZE);
    return this.world.get(q, r) ?? null;
  }

  handleTap(sx, sy) {
    const tile = this.tileAtScreen(sx, sy);
    this.selected = tile;
    this.emit('select', tile);
    this.requestRender();
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
      if (this.world) this.renderer.render(this.world, { selected: this.selected, hovered: this.hovered });
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
