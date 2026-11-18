// Okyanus katmanı: oyunun karesine bağlanan tek giriş noktası.
//
// Kendi rAF döngüsü YOK: `draw` oyunun karesinden hemen sonra çağrılır, kadans
// oyunun su zamanlayıcısıdır. Simülasyon durumuna yalnız okumak için bakılır;
// rastgelelik ve zaman oyunun zarından ayrıdır, determinizme temas etmez.
//
// Harita karesi kopyalanmaz. Eski katman her kamera adımında #map-water'ı dokuya
// alıyordu; burada su kendi tabanını hesapladığı için bağlamlar arası kopya yok.

import { GLKit } from './glKit.js';
import { Cascade, cascadeLayout, cascadePrograms, LOOP_SECONDS } from './cascade.js';
import { OceanBake } from './bake.js';
import { shadeFrag } from './shade.js';
import { ShallowSolver } from './shallow.js';
import { HEX_SIZE } from '../../world/worldgen.js';

const HEX_STEP = Math.sqrt(3) * HEX_SIZE;
/** surfaceGL ile AYNI güneş: kara ve deniz tek ışıkta dursun. */
const SUN = (() => {
  const v = [-0.55, -0.68, 0.48];
  const l = Math.hypot(...v);
  return v.map((c) => c / l);
})();
/** Sanal gözün yüksekliği, görünen dünya yüksekliğine oran. Parıltı bölgesini ekranın sol üstüne koyar. */
const EYE_HEIGHT = 0.36;

const QUALITY = {
  high: { cascades: 3, caustics: true, frozen: false, shallow: true },
  medium: { cascades: 2, caustics: true, frozen: false },
  low: { cascades: 2, caustics: false, frozen: true },
};

function invert4(m) {
  const a = m;
  const b00 = a[0] * a[5] - a[1] * a[4];
  const b01 = a[0] * a[6] - a[2] * a[4];
  const b02 = a[0] * a[7] - a[3] * a[4];
  const b03 = a[1] * a[6] - a[2] * a[5];
  const b04 = a[1] * a[7] - a[3] * a[5];
  const b05 = a[2] * a[7] - a[3] * a[6];
  const b06 = a[8] * a[13] - a[9] * a[12];
  const b07 = a[8] * a[14] - a[10] * a[12];
  const b08 = a[8] * a[15] - a[11] * a[12];
  const b09 = a[9] * a[14] - a[10] * a[13];
  const b10 = a[9] * a[15] - a[11] * a[13];
  const b11 = a[10] * a[15] - a[11] * a[14];
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!det) return new Float32Array(16);
  det = 1 / det;
  return new Float32Array([
    (a[5] * b11 - a[6] * b10 + a[7] * b09) * det,
    (a[2] * b10 - a[1] * b11 - a[3] * b09) * det,
    (a[13] * b05 - a[14] * b04 + a[15] * b03) * det,
    (a[10] * b04 - a[9] * b05 - a[11] * b03) * det,
    (a[6] * b08 - a[4] * b11 - a[7] * b07) * det,
    (a[0] * b11 - a[2] * b08 + a[3] * b07) * det,
    (a[14] * b02 - a[12] * b05 - a[15] * b01) * det,
    (a[8] * b05 - a[10] * b02 + a[11] * b01) * det,
    (a[4] * b10 - a[5] * b08 + a[7] * b06) * det,
    (a[1] * b08 - a[0] * b10 - a[3] * b06) * det,
    (a[12] * b04 - a[13] * b02 + a[15] * b00) * det,
    (a[9] * b02 - a[8] * b04 - a[11] * b00) * det,
    (a[5] * b07 - a[4] * b09 - a[6] * b06) * det,
    (a[0] * b09 - a[1] * b07 + a[2] * b06) * det,
    (a[13] * b01 - a[12] * b03 - a[14] * b00) * det,
    (a[8] * b03 - a[9] * b01 + a[10] * b00) * det,
  ]);
}

const smooth = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class OceanLayer {
  constructor(game, canvas, { quality = 'high' } = {}) {
    this.game = game;
    this.canvas = canvas;
    this.quality = null;
    this.pixelRatio = Math.min(devicePixelRatio || 1, 2);
    this.visible = true;
    this.clock = 180;
    this.lastTs = 0;
    this.tick = 0;
    this.bakedWorld = null;
    this.timing = null;
    this.lost = false;
    this.tracks = new Map();
    this.external = [];
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.init(this.quality ?? quality);
      game.requestRender();
    });
    this.init(quality);
  }

  init(quality) {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('[okyanus] WebGL2 yok');
    if (!gl.getExtension('EXT_color_buffer_float')) throw new Error('[okyanus] kayan nokta hedefi yok');
    gl.getExtension('OES_texture_float_linear');
    this.gl = gl;
    this.kit = new GLKit(gl);
    this.waveP = cascadePrograms(this.kit);
    this.bake = new OceanBake(this.kit);
    this.bakedWorld = null;
    this.shadePrograms = new Map();
    this.cascadeSets = new Map();
    this.swe = null;
    this.primed = false;
    this.quality = null;
    this.setQuality(quality);
  }

  setQuality(q) {
    const key = QUALITY[q] ? q : 'high';
    if (this.quality === key) return;
    this.quality = key;
    this.cfg = QUALITY[key];
    this.needFrozenFrame = true;
    const layoutKey = this.cfg.cascades === 3 ? 'high' : 'medium';
    if (!this.cascadeSets.has(layoutKey)) {
      const W = this.game.world?.wrapWidth ?? 7205.33;
      this.cascadeSets.set(layoutKey, cascadeLayout(W, layoutKey)
        .map((spec) => new Cascade(this.kit, this.waveP, spec)));
    }
    this.cascades = this.cascadeSets.get(layoutKey);
    if (this.cfg.shallow && !this.swe) this.swe = new ShallowSolver(this.kit, this.bake);
    const shadeKey = `${this.cfg.cascades}:${this.cfg.caustics}:${!!this.cfg.shallow}`;
    if (!this.shadePrograms.has(shadeKey)) {
      this.shadePrograms.set(shadeKey, this.kit.program(`deniz.${shadeKey}`, shadeFrag({
        cascades: this.cfg.cascades, caustics: this.cfg.caustics, shallow: !!this.cfg.shallow,
      })));
    }
    this.shade = this.shadePrograms.get(shadeKey);
    this.game.requestRender?.();
  }

  resize() {
    const cam = this.game.camera;
    const w = Math.max(1, Math.round(cam.viewWidth * this.pixelRatio));
    const h = Math.max(1, Math.round(cam.viewHeight * this.pixelRatio));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  ensureWorld() {
    const r = this.game.renderer;
    const cache = r.material?.cache;
    if (!cache?.toLand || cache.world !== this.game.world) return false;
    if (this.bakedWorld !== cache.world) {
      this.bake.bakeWorld(cache, HEX_STEP);
      this.bakedWorld = cache.world;
      this.field = [cache.x0, cache.y0, cache.width, cache.height];
      // Karo boyu dünya genişliğini tam bölmeli: boy değişince kaskatlar yeniden kurulur.
      const W = this.game.world?.wrapWidth ?? 0;
      if (this.layoutWrap !== undefined && Math.abs(this.layoutWrap - W) > 1) {
        const q = this.quality;
        this.cascadeSets.clear();
        this.quality = null;
        this.primed = false;
        this.setQuality(q);
      }
      this.layoutWrap = W;
      if (this.swe) this.swe.dx = 0;
    }
    return true;
  }

  /**
   * Denizdeki birlikler ve dışarıdan bildirilen gemiler. Birlik simülasyonda
   * haftalık hex adımıyla ilerler; burada sürekli bir rotaya süzülür ki iz
   * kesik kesik atlamasın. Yalnız okunur, simülasyona bir şey yazılmaz.
   */
  gatherShips(dt) {
    const world = this.game.world;
    const list = world?.units;
    const seen = new Set();
    const k = 1 - Math.exp(-dt / 0.9);
    const track = (id, tx, ty) => {
      seen.add(id);
      let s = this.tracks.get(id);
      if (!s) { s = { x: tx, y: ty, vx: 0, vy: 0 }; this.tracks.set(id, s); }
      const W = world?.wrapWidth ?? 0;
      let dx = tx - s.x;
      if (W) dx -= Math.round(dx / W) * W;
      const nx = s.x + dx * k;
      const ny = s.y + (ty - s.y) * k;
      if (dt > 0) {
        s.vx += ((nx - s.x) / dt - s.vx) * 0.25;
        s.vy += ((ny - s.y) / dt - s.vy) * 0.25;
      }
      s.x = nx;
      s.y = ny;
    };
    if (list) {
      for (const u of list) {
        if (!u?.embarked || u.hp <= 0 || !u.tile) continue;
        const next = u.path?.[0];
        let x = u.tile.x;
        let y = u.tile.y;
        if (next) {
          const t = Math.min(1, u.progress ?? 0);
          x += (next.x - x) * t;
          y += (next.y - y) * t;
        }
        track(`u${u.id}`, x, y);
      }
    }
    for (const e of this.external) track(`x${e.id}`, e.x, e.y);
    for (const id of this.tracks.keys()) if (!seen.has(id)) this.tracks.delete(id);
    const out = [];
    for (const s of this.tracks.values()) if (Math.hypot(s.vx, s.vy) > 0.6) out.push(s);
    return out;
  }

  stepWaves(zoom) {
    const list = this.cascades;
    const t = this.clock % LOOP_SECONDS;
    // Kaskatlar sırayla tazelenir: uzun dalga kare başına birkaç piksel bile
    // yürümez, her karede üçünü birden çözmek boşa bütçe. Kısa dalga her karede.
    const n = list.length;
    this.tick++;
    if (!this.primed) {
      for (const c of list) c.update(t);
      this.primed = true;
      return;
    }
    const last = list[n - 1];
    if (zoom >= 0.55 || n < 3) last.update(t);
    const slow = n - 1;
    list[this.tick % slow].update(t);
  }

  draw(ts) {
    if (!this.visible || this.lost) return;
    const { game, gl, kit } = this;
    const cam = game.camera;
    if (!this.ensureWorld()) return;
    const dt = this.lastTs ? Math.min(0.1, (ts - this.lastTs) / 1000) : 0;
    this.lastTs = ts;
    const frozen = this.cfg.frozen;
    if (!frozen) this.clock += dt;
    this.resize();

    this.beginTiming();
    if (!frozen || this.needFrozenFrame) {
      if (frozen) {
        this.primed = false;
        this.needFrozenFrame = false;
      }
      this.stepWaves(cam.zoom);
    }

    const r = game.renderer;
    const view = r.waterGL?.view3d ?? null;
    const spanX = cam.viewWidth / cam.zoom;
    const spanY = cam.viewHeight / cam.zoom;
    const eye = view
      ? [view.eye[0], view.eye[1], view.eye[2]]
      : [cam.x, cam.y, spanY * EYE_HEIGHT];
    const useSwe = this.cfg.shallow && !view && !frozen;
    if (useSwe) this.swe.update(cam, dt, this.field, game.world?.wrapWidth ?? 0, this.gatherShips(dt));
    const c = this.cascades;
    const meanW = [
      smooth(0.42, 0.95, cam.zoom),
      smooth(0.3, 0.72, cam.zoom),
      smooth(0.75, 1.5, cam.zoom),
    ];
    const quiet = r.waterAnimatedMode?.() === false && r.mapMode !== 'seas' ? 1 : 0;
    const vals = {
      uRes: [this.canvas.width, this.canvas.height],
      uCam: [cam.x, cam.y],
      uSpan: [spanX, spanY],
      uPersp: view ? 1 : 0,
      uInvVP: view ? invert4(view.viewProj) : IDENTITY,
      uEye: eye,
      uSun: SUN,
      uTime: this.clock,
      uQuiet: quiet,
      uExposure: 1,
      // Uzak zoomda parıltı alanı ekranın çeyreğini kaplar: harita okunur kalsın.
      uGlint: 0.04 + 0.96 * smooth(0.8, 2.3, cam.zoom),
      uField: this.field,
      uTile: [c[0].L, c[1].L, c[2]?.L ?? 1],
      uMeanW: meanW,
      uWrapX: game.world?.wrapWidth ?? 0,
      // Uzakta gök yansıması denizi puslu gri yapar; harita rengi önde kalsın.
      uSkyK: 0.35 + 0.65 * smooth(0.45, 1.4, cam.zoom),
    };
    const tex = {
      uA0: c[0].A, uB0: c[0].B, uF0: c[0].foamTex,
      uA1: c[1].A, uB1: c[1].B, uF1: c[1].foamTex,
      uBathy: this.bake.bathy, uMacro: this.bake.macro, uFoamTex: this.bake.foam,
    };
    if (c[2]) { tex.uA2 = c[2].A; tex.uB2 = c[2].B; }
    if (this.cfg.shallow) {
      vals.uSweOn = useSwe && this.swe.active ? this.swe.fade : 0;
      vals.uSweRect = this.swe.rect;
      tex.uSwe = this.swe.output;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    kit.run(this.shade, null, vals, tex);
    this.endTiming();
    // Seas kipi oyunun su zincirini açmaz; deniz orada da aksın diye mevcut
    // zamanlayıcı dürtülür (yeni bir kare döngüsü değil).
    if (!frozen && r.mapMode === 'seas') game.scheduleWaterFrame?.();
  }

  /** Ölçüm isteğe bağlıdır: sorgu nesneleri boşta maliyetsiz kalsın. */
  measure(on) {
    const { gl } = this;
    if (on && !this.timing) {
      const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
      this.timing = ext ? { ext, wait: [], gpu: [], cpu: [] } : null;
    } else if (!on) {
      this.timing = null;
    }
    return !!this.timing;
  }

  beginTiming() {
    const T = this.timing;
    if (!T) return;
    T.t0 = performance.now();
    T.q = this.gl.createQuery();
    this.gl.beginQuery(T.ext.TIME_ELAPSED_EXT, T.q);
  }

  endTiming() {
    const T = this.timing;
    if (!T) return;
    const { gl } = this;
    gl.endQuery(T.ext.TIME_ELAPSED_EXT);
    T.wait.push(T.q);
    for (let i = T.wait.length - 1; i >= 0; i--) {
      const q = T.wait[i];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!gl.getParameter(T.ext.GPU_DISJOINT_EXT)) T.gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
      gl.deleteQuery(q);
      T.wait.splice(i, 1);
    }
    T.cpu.push(performance.now() - T.t0);
  }
}

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
