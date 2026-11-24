// YAŞAYAN DÜNYA — haritanın takvimle değişen katmanlarının yöneticisi.
//
// Mevsim (kar, yaprak) kara malzemesinin içindedir (seasonGLSL.js); buz, bulut,
// cephe, gece, maketler, duman, gemi ve tren #map-living tuvalindedir
// (livingGL.js). Bu dosya hangisinin ne zaman, nerede çizileceğine karar verir.
//
// Üç sözleşme:
//   1. Kendi kare döngüsü YOK: oyunun karesine bağlanır, su tiki zinciriyle akar.
//   2. Yalnız görseldir: dünyayı okur, yazmaz; oyunun zarını tüketmez. Hava ve
//      cephe yerel hash'ten gelir, aynı tohumda aynı gökyüzü.
//   3. Okunurluk önce gelir: veri kiplerinde (kaynak, nüfus, barış) katman susar,
//      harita bir seçim yüzeyi olarak kalır.
//
// Katman notu: DOM ve GPU'ya dokunur; oyun durumunu yalnız okur.

import { SQRT3 } from '../../core/hex.js';
import { dateOfTurn } from '../../game/calendar.js';
import { HEX_SIZE } from '../../world/worldgen.js';
import { LIVING_ATLAS } from './atlasMeta.js';
import { dayOfYear, seasonAt, temperatureAt } from './climate.js';
import { livingFlags } from './flags.js';
import { FRONT_COUNT, LivingGL } from './livingGL.js';
import { hash01, LivingMotion, sampleRoute, shuttle } from './motion.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
const ROW_H = HEX_SIZE * 1.5;
const TAU = Math.PI * 2;

/** Gece-gündüzün bir turu (gerçek saniye): oyun hızından bağımsız, sakin. */
const DAY_CYCLE_S = 280;

/**
 * Sabit gün saati (Kerem 2026-11-23: "dünya saatini ayarlardan sabit olarak ayarlayabilelim").
 * Döngüde güneş gerçek zamanla batıya kayar ve gece haritanın üstünden geçer. Sabit kipte
 * güneşin boylamı KAMERAYA bağlanır: oyuncu nereye bakarsa orası seçtiği saattedir. Değer,
 * bakılan boylamla güneş arasındaki açı (radyan): sabahleyin güneş doğudadır (boylam büyük).
 */
export const TIME_OF_DAY = { cycle: null, day: 0, dawn: 1.6, dusk: -1.6, night: Math.PI };
const FRONT_LIFE_S = 260;
const FRONT_SPEED = 8.5;

const MAX_SPRITES = 1400;
const MAX_PUFFS = 2600;

/** Maketlerin dünya boyuna çarpanı: hex içinde dursun, komşuyu boğmasın. */
const CITY_SCALE = 0.82;
const TOWN_SCALE = 0.6;
const FACTORY_SCALE = 0.72;
const PORT_SCALE = 0.78;

const smooth = (a, b, v) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const cityTier = (dev) => (dev < 3 ? 1 : dev < 5 ? 2 : dev < 7.5 ? 3 : 4);
const factoryTier = (dev) => (dev < 6 ? 1 : dev < 8 ? 2 : 3);

/** Harita kipine göre karın ve yaprağın payı; veri kipinde mevsim yok. */
const SEASON_MODE = {
  political: { cap: 0.8, leaf: 0.52 },
  terrain: { cap: 0.94, leaf: 0.85 },
  geography: { cap: 0.94, leaf: 0.85 },
  cultures: { cap: 0.5, leaf: 0.3 },
};
const ACTOR_MODES = new Set(['political', 'terrain', 'cultures']);

const asset = (name) => new URL(`../../../assets/living/${name}`, import.meta.url).href;

export class LivingWorld {
  constructor(game) {
    this.game = game;
    this.flags = livingFlags;
    this.gl = LivingGL.create(document.getElementById('map'));
    this.motion = new LivingMotion();
    /** Görüntü denetimi: game.living.debug.day = 15 (yılın günü), sunLon, time (sn). */
    this.debug = { day: null, sunLon: null, time: null };
    /** Settings → Graphics → Time of day (TIME_OF_DAY anahtarı). */
    this.timeOfDay = 'cycle';
    this.season = { on: false, S: 0, cool: 0, cap: 0, leaf: 0 };
    this.sites = [];
    this.siteWorld = null;
    this.siteKey = null;
    this.siteTurn = -1e9;
    this.snowDay = -1;
    this.railVersion = -1;
    this.lastDraw = 0;
    this.lastCam = { x: 0, y: 0, zoom: 0, view: null };
    this.px = 0;
    this.py = 0;
    this.pk = 1;
    this.sprites = new Float32Array(MAX_SPRITES * 9);
    this.puffs = new Float32Array(MAX_PUFFS * 8);
    this.frontA = new Float32Array(FRONT_COUNT * 4);
    this.frontB = new Float32Array(FRONT_COUNT * 4);
    this.precipData = new Float32Array(FRONT_COUNT * 8);
    this.field = {};
    this.ortho = new Float32Array(16);
    // Kare başına ayrılmasın: küçük diziler bile su tikinde çöp birikintisi olur.
    this.glowBuf = new Float32Array(MAX_SPRITES * 4);
    this.shifts = [0];
    this.sample = { x: 0, y: 0, dx: 0, dy: 0 };
    this.run = { s: 0, forward: true };
    this.cells = this.indexCells();
    /** Son karelerin katman süresi (ms, kayan ortalama): ölçüm için. */
    this.cpuMs = 0;

    if (!this.gl) return;
    this.gl.onRestored = () => {
      this.railVersion = -1;
      this.railBuild = null;
      this.lastDraw = 0;
    };
    this.loadAtlas();
    const inner = game.frame;
    game.frame = (ts = performance.now()) => {
      inner(ts);
      this.frame();
    };
    livingFlags.subscribe(() => {
      this.lastDraw = 0;
      game.renderer.invalidateCache();
      game.requestRender();
    });
  }

  async loadAtlas() {
    const load = async (name) => {
      const img = new Image();
      img.src = asset(name);
      await img.decode();
      return img;
    };
    try {
      const [color, mask] = await Promise.all([load('living-color.webp'), load('living-mask.webp')]);
      this.gl.setAtlas(color, mask);
      this.lastDraw = 0;
      this.game.requestRender();
    } catch (err) {
      // Atlas inmezse mevsim ve hava yine çalışır; yalnız maketler çizilmez.
      console.warn('[living] maket atlası yüklenemedi:', err.message);
    }
  }

  indexCells() {
    const { size, headings, cells } = LIVING_ATLAS;
    const out = {};
    for (const [id, c] of Object.entries(cells)) {
      out[id] = { u: c.x / size, v: c.y / size, du: c.c / size, size: c.s, tips: c.tips ?? [] };
    }
    const row = (prefix) => Array.from({ length: headings }, (_, h) => out[`${prefix}_${h}`]);
    this.ships = [row('ship_0'), row('ship_1')];
    this.locos = row('loco');
    this.wagons = row('wagon');
    this.headings = headings;
    return out;
  }

  // ------------------------------------------------------------- yerleşim ---

  /** Kalkınma düzeyi değişmedikçe yerleşim listesi yeniden kurulmaz. */
  refreshSites(world, turn) {
    if (this.siteWorld === world && turn - this.siteTurn < 8) return;
    this.siteTurn = turn;
    let key = 0;
    for (const p of world.provinces ?? []) {
      key = (Math.imul(key, 31) + Math.round((p.econ?.development ?? 0) * 2) + p.id) | 0;
    }
    key = (key + (world.cities?.length ?? 0)) | 0;
    if (this.siteWorld === world && key === this.siteKey) return;
    this.siteWorld = world;
    this.siteKey = key;
    this.sites = this.buildSites(world);
    this.snowDay = -1;
  }

  buildSites(world) {
    const sites = [];
    const P = world.wrapWidth || 0;
    const clim = this.game.renderer.waterGL?.climate;
    const eq = clim?.equator ?? 0.5;
    const spanX = world.cols * HEX_STEP;
    const spanY = world.rows * ROW_H;
    const originX = -HEX_STEP / 2;
    const originY = -ROW_H / 2;
    const add = (cell, x, y, scale, kind, extra = {}) => {
      if (!cell) return;
      const u = (x - originX) / spanX;
      const v = (y - originY) / spanY;
      const lat = (eq - v) * 2.98;
      sites.push({
        cell, x, y, u, v, kind,
        size: cell.size * scale,
        tips: cell.tips.map(([dx, dy]) => [dx * scale, dy * scale]),
        lon: u * TAU,
        sinLat: Math.sin(lat),
        cosLat: Math.cos(lat),
        snow: 0,
        phase: hash01(Math.round(x), Math.round(y), 5),
        ...extra,
      });
    };
    const taken = new Set();
    const idx = (t) => t.row * world.cols + t.col;
    for (const city of world.cities ?? []) {
      const t = city.tile;
      const province = world.provinces?.[t.provinceId];
      const dev = province?.econ?.development ?? 1;
      const nation = world.nations?.[city.nationId];
      const capital = nation?.capital === t;
      let tier = cityTier(dev);
      if (capital) tier = Math.min(4, Math.max(2, tier + 1));
      const variant = Math.floor(hash01(idx(t), 3) * 3);
      add(this.cells[`city_${tier}_${variant}`], t.x, t.y, CITY_SCALE, 'city', { glow: 0.5 + tier * 0.3 });
      taken.add(idx(t));
      // Liman: denize bakan yüze göre dört pişmiş yönden biri.
      let sx = 0;
      let sy = 0;
      for (const n of world.neighbors(t)) {
        if (!n.terrain.water) continue;
        let dx = n.x - t.x;
        if (P) dx -= P * Math.round(dx / P);
        sx += dx;
        sy += n.y - t.y;
      }
      if ((sx || sy) && dev >= 2) {
        const face = Math.abs(sy) >= Math.abs(sx) ? (sy > 0 ? 's' : 'n') : (sx > 0 ? 'e' : 'w');
        const reach = HEX_STEP * 0.42;
        const norm = Math.hypot(sx, sy);
        add(this.cells[`port_${dev >= 5 ? 2 : 1}_${face}`], t.x + (sx / norm) * reach, t.y + (sy / norm) * reach, PORT_SCALE, 'port', { glow: 0.4 });
      }
      if (dev >= 4) {
        const land = world.neighbors(t).filter((n) => !n.terrain.water && !n.city);
        if (land.length) {
          const n = land[Math.floor(hash01(idx(t), 11) * land.length)];
          let dx = n.x - t.x;
          if (P) dx -= P * Math.round(dx / P);
          const variantF = hash01(idx(t), 13) < 0.5 ? 0 : 1;
          add(this.cells[`factory_${factoryTier(dev)}_${variantF}`], t.x + dx * 0.72, t.y + (n.y - t.y) * 0.72, FACTORY_SCALE, 'factory', { glow: 0.45 });
          taken.add(idx(n));
        }
      }
    }
    // Şehri olmayan kalkınmış state merkezi kasaba taşır: harita yalnız başkentlerden ibaret kalmasın.
    for (const p of world.provinces ?? []) {
      const c = p.center;
      if (!c || taken.has(idx(c)) || c.terrain.water) continue;
      const dev = p.econ?.development ?? 1;
      if (dev < 2.2) continue;
      add(this.cells[`city_1_${Math.floor(hash01(idx(c), 7) * 3)}`], c.x, c.y, TOWN_SCALE, 'town', { glow: 0.3 });
      if (dev >= 6) {
        add(this.cells[`factory_1_${hash01(idx(c), 9) < 0.5 ? 0 : 1}`], c.x + HEX_STEP * 0.55, c.y + ROW_H * 0.25, FACTORY_SCALE * 0.85, 'factory', { glow: 0.3 });
      }
    }
    sites.sort((a, b) => a.y - b.y);
    return sites;
  }

  // -------------------------------------------------------------- izdüşüm ---

  /** Eğik kamerada arazinin normalize yüksekliği (terrainBake ile aynı okuma). */
  heightAt(terrain, x, y) {
    const H = terrain.height;
    const f = terrain.field;
    const w = H.w;
    const u = ((x - f.x0) / f.spanX) * w - 0.5;
    const v = ((y - f.y0) / f.spanY) * H.h - 0.5;
    let iu = Math.floor(u);
    const iv = Math.floor(v);
    const fu = u - iu;
    const fv = v - iv;
    iu = ((iu % w) + w) % w;
    const x1 = iu + 1 === w ? 0 : iu + 1;
    const y0 = Math.min(H.h - 1, Math.max(0, iv));
    const y1 = Math.min(H.h - 1, Math.max(0, iv + 1));
    const d = H.data;
    const a = d[(y0 * w + iu) * 4];
    const b = d[(y0 * w + x1) * 4];
    const e = d[(y1 * w + iu) * 4];
    const g = d[(y1 * w + x1) * 4];
    return (a + (b - a) * fu) * (1 - fv) + (e + (g - e) * fu) * fv;
  }

  groundAt(x, y) {
    const r = this.game.renderer;
    const terrain = r.gfxTerrainFor(r.renderWorld);
    if (!terrain) return 0;
    const t = r.gfxTune;
    const h = Math.max(0, this.heightAt(terrain, x, y));
    const c = t?.heightCurve ?? 0;
    return h * (1 - c + c * h) * (t?.heightScale ?? 0);
  }

  /** Dünya noktası → ekran (px, py, pk); görünür değilse false. */
  project(wx, wy, margin = 180) {
    const cam = this.game.camera;
    const P = this.period;
    let dx = wx - cam.x;
    if (P) dx -= P * Math.round(dx / P);
    const view = this.view;
    if (view) {
      const x = cam.x + dx;
      // Görünür zeminin dışı elenir: yükseklik okuması ve izdüşüm şehir başına pahalı.
      const b = view.bbox;
      if (x < b.minX - 120 || x > b.maxX + 120 || wy < b.minY - 120 || wy > b.maxY + 120) return false;
      const p = view.project(x, wy, this.groundAt(x, wy));
      if (!p) return false;
      this.px = p.x;
      this.py = p.y;
      this.pk = Math.min(1.3, Math.max(0.6, view.f / (p.depth * view.zoom)));
    } else {
      this.px = dx * cam.zoom + cam.viewWidth / 2;
      this.py = (wy - cam.y) * cam.zoom + cam.viewHeight / 2;
      this.pk = 1;
    }
    return this.px > -margin && this.px < cam.viewWidth + margin
      && this.py > -margin && this.py < cam.viewHeight + margin;
  }

  pushSprite(cell, size, snow, night, alpha) {
    if (this.nSprites >= MAX_SPRITES) return;
    const b = this.sprites;
    const i = this.nSprites++ * 9;
    b[i] = this.px;
    b[i + 1] = this.py;
    b[i + 2] = size;
    b[i + 3] = cell.u;
    b[i + 4] = cell.v;
    b[i + 5] = cell.du;
    b[i + 6] = snow;
    b[i + 7] = night;
    b[i + 8] = alpha;
  }

  pushPuff(x, y, rx, ry, r, g, b, a) {
    if (this.nPuffs >= MAX_PUFFS) return;
    const d = this.puffs;
    const i = this.nPuffs++ * 8;
    d[i] = x;
    d[i + 1] = y;
    d[i + 2] = rx;
    d[i + 3] = ry;
    d[i + 4] = r;
    d[i + 5] = g;
    d[i + 6] = b;
    d[i + 7] = a;
  }

  // ----------------------------------------------------------------- hava ---

  /** Cepheler: orta enlem fırtına kuşaklarında doğar, doğuya sürüklenir, söner. */
  updateFronts(world, time, on) {
    const A = this.frontA;
    const B = this.frontB;
    const span = world.cols * HEX_STEP;
    const spanY = world.rows * ROW_H;
    const eq = (this.game.renderer.waterGL?.climate?.equator ?? 0.5) * spanY - ROW_H / 2;
    const seed = this.seedNumber(world);
    for (let i = 0; i < FRONT_COUNT; i++) {
      const clock = time / FRONT_LIFE_S + i * 0.37;
      const cycle = Math.floor(clock);
      const phase = clock - cycle;
      const h = (k) => hash01(seed, i * 97 + cycle, k);
      const north = h(1) < 0.68;
      const band = (0.18 + h(2) * 0.34) * spanY;
      const x = ((h(3) * span + phase * FRONT_LIFE_S * FRONT_SPEED) % span + span) % span;
      const y = eq + (north ? -band : band) + (h(4) - 0.5) * 160;
      const angle = (north ? 0.55 : -0.55) + (h(5) - 0.5) * 0.7;
      const strength = on ? Math.sin(Math.PI * phase) ** 0.7 * (0.55 + h(6) * 0.45) : 0;
      A[i * 4] = x;
      A[i * 4 + 1] = y;
      A[i * 4 + 2] = Math.cos(angle);
      A[i * 4 + 3] = Math.sin(angle);
      B[i * 4] = 520 + h(7) * 760;
      B[i * 4 + 1] = 80 + h(8) * 110;
      B[i * 4 + 2] = strength;
      B[i * 4 + 3] = 0;
    }
  }

  seedNumber(world) {
    if (this.seedWorld === world) return this.seedValue;
    const text = String(world.seed ?? 'hexwar');
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    this.seedWorld = world;
    this.seedValue = h | 0;
    return this.seedValue;
  }

  // ------------------------------------------------------------ demiryolu ---

  /** Ray şeridi dilim dilim kurulur: 170 hat tek karede ~14 ms tutuyordu (ölçüldü). */
  * railMesh(rails, terrain) {
    let segments = 0;
    for (const edge of rails) segments += edge.route.len.length - 1;
    const out = new Float32Array(segments * 6 * 7);
    let o = 0;
    const put = (x, y, nx, ny, side, run, h) => {
      out[o++] = x; out[o++] = y; out[o++] = nx; out[o++] = ny; out[o++] = side; out[o++] = run; out[o++] = h;
    };
    let count = 0;
    for (const edge of rails) {
      const { pts, len } = edge.route;
      const n = len.length;
      const norm = (k) => {
        const a = Math.max(0, k - 1);
        const b = Math.min(n - 1, k + 1);
        const dx = pts[b * 2] - pts[a * 2];
        const dy = pts[b * 2 + 1] - pts[a * 2 + 1];
        const l = Math.hypot(dx, dy) || 1;
        return [-dy / l, dx / l];
      };
      const hAt = (k) => (terrain ? this.heightAt(terrain, pts[k * 2], pts[k * 2 + 1]) : 0);
      for (let k = 0; k < n - 1; k++) {
        const [ax, ay] = norm(k);
        const [bx, by] = norm(k + 1);
        const x0 = pts[k * 2];
        const y0 = pts[k * 2 + 1];
        const x1 = pts[k * 2 + 2];
        const y1 = pts[k * 2 + 3];
        const h0 = hAt(k);
        const h1 = hAt(k + 1);
        put(x0, y0, ax, ay, -1, len[k], h0);
        put(x1, y1, bx, by, -1, len[k + 1], h1);
        put(x1, y1, bx, by, 1, len[k + 1], h1);
        put(x0, y0, ax, ay, -1, len[k], h0);
        put(x1, y1, bx, by, 1, len[k + 1], h1);
        put(x0, y0, ax, ay, 1, len[k], h0);
      }
      if (++count % 4 === 0) yield;
    }
    this.gl.setRails(out);
  }

  stepRails(terrain) {
    if (!this.railBuild && (this.motion.railVersion !== this.railVersion || terrain !== this.railTerrain)) {
      this.railVersion = this.motion.railVersion;
      this.railTerrain = terrain;
      this.railBuild = this.railMesh(this.motion.rails, terrain);
    }
    if (!this.railBuild) return;
    const t0 = performance.now();
    while (performance.now() - t0 < 1.2) {
      if (this.railBuild.next().done) {
        this.railBuild = null;
        return;
      }
    }
  }

  /** Sabit gün saati ya da döngü; kare hemen tazelenir. */
  setTimeOfDay(mode) {
    this.timeOfDay = Object.hasOwn(TIME_OF_DAY, mode) ? mode : 'cycle';
    this.lastDraw = 0;
    this.lastCam.x = NaN;
    this.game.requestRender?.();
  }

  // ----------------------------------------------------------------- kare ---

  frame() {
    const t0 = performance.now();
    const game = this.game;
    const r = game.renderer;
    const world = game.world;
    const wgl = r.waterGL;
    if (!world || !wgl || this.gl.lost) return;

    const turn = game.turns?.turn ?? world.turn ?? 1;
    const day = this.debug.day ?? dayOfYear(dateOfTurn(turn, game.clock?.day ?? 0));
    const season = seasonAt(day);
    const mode = SEASON_MODE[r.mapMode] ?? null;
    const S = this.season;
    S.on = !!mode && livingFlags.on('seasons') && r.glSurface();
    S.S = season.S;
    S.cool = season.cool;
    S.cap = mode?.cap ?? 0;
    S.leaf = mode?.leaf ?? 0;
    wgl.season = S;

    const clim = wgl.world === world ? wgl.climate : null;
    const fieldOn = !!mode && !!clim && r.glSurface() && livingFlags.master;
    const actors = ACTOR_MODES.has(r.mapMode) && !!clim && r.glSurface() && livingFlags.master;
    if (!fieldOn && !actors) {
      if (this.wasDrawn) {
        this.gl.clear();
        this.wasDrawn = false;
      }
      return;
    }
    const cam = game.camera;
    const view = wgl.view3d ?? null;
    const now = performance.now();
    const L = this.lastCam;
    const moved = L.x !== cam.x || L.y !== cam.y || L.zoom !== cam.zoom || L.view !== view;
    // Tempoyu Game'in su tiki verir (~60 Hz, ekranın tam böleni; game.js IDLE_FRAME_MS):
    // eski 30/60 ms kapısı bulutu, gemiyi ve dumanı 15-30 Hz'de bırakıyordu. Kapı yalnız
    // aynı vsync'te iki kez çizmeyi önler.
    if (!moved && now - this.lastDraw < 10) return;
    this.lastDraw = now;
    L.x = cam.x;
    L.y = cam.y;
    L.zoom = cam.zoom;
    L.view = view;
    this.view = view;
    this.period = world.wrapWidth || 0;
    this.wasDrawn = true;

    const gl = this.gl;
    gl.setClimate(clim);
    gl.resize(cam.viewWidth, cam.viewHeight, r.dpr);
    gl.begin();

    const time = (this.debug.time ?? now) / 1000;
    const spanX = world.cols * HEX_STEP;
    const spanY = world.rows * ROW_H;
    const nightOn = livingFlags.on('nightLights');
    const fixedSun = TIME_OF_DAY[this.timeOfDay] ?? null;
    const sunLon = this.debug.sunLon ?? (fixedSun != null
      ? (cam.x / spanX) * TAU + fixedSun
      : (-time / DAY_CYCLE_S) * TAU);
    const frontsOn = livingFlags.on('fronts');
    this.updateFronts(world, time, frontsOn);

    const f = this.field;
    f.viewW = cam.viewWidth;
    f.viewH = cam.viewHeight;
    f.camX = cam.x;
    f.camY = cam.y;
    f.zoom = cam.zoom;
    f.view = view;
    f.originX = -HEX_STEP / 2;
    f.originY = -ROW_H / 2;
    f.spanX = spanX;
    f.spanY = spanY;
    f.time = time % 86400;
    f.S = season.S;
    f.cool = season.cool;
    f.distMax = clim.distMax;
    f.hex = HEX_STEP;
    f.equator = clim.equator;
    f.ice = livingFlags.on('seaIce');
    f.clouds = livingFlags.on('clouds');
    f.fronts = frontsOn;
    f.night = nightOn;
    f.sunLon = sunLon;
    f.sunDecl = season.decl;
    f.frontA = this.frontA;
    f.frontB = this.frontB;
    f.dpr = r.dpr;
    if (fieldOn) gl.drawField(f);

    // Görünüm matrisi: düz kamerada basit ölçek + öteleme, eğikte kameranın kendisi.
    let vp = this.ortho;
    if (view) vp = view.viewProj;
    else {
      const sx = (2 * cam.zoom) / cam.viewWidth;
      const sy = (-2 * cam.zoom) / cam.viewHeight;
      vp[0] = sx;
      vp[5] = sy;
      vp[10] = 1;
      vp[12] = -cam.x * sx;
      vp[13] = -cam.y * sy;
      vp[15] = 1;
    }
    const P = this.period;
    if (this.shifts.length !== (P ? 3 : 1) || this.shifts[0] !== -P) this.shifts = P ? [-P, 0, P] : [0];
    const shifts = this.shifts;

    this.nSprites = 0;
    this.nPuffs = 0;
    if (actors) this.drawActors(world, turn, season, clim, time, sunLon, nightOn, vp, shifts);

    if (frontsOn && fieldOn && cam.zoom >= 0.42) {
      const d = this.precipData;
      let n = 0;
      for (let i = 0; i < FRONT_COUNT; i++) {
        if (this.frontB[i * 4 + 2] < 0.05) continue;
        d.set(this.frontA.subarray(i * 4, i * 4 + 4), n * 8);
        d.set(this.frontB.subarray(i * 4, i * 4 + 4), n * 8 + 4);
        n++;
      }
      f.precipAlpha = smooth(0.42, 0.7, cam.zoom);
      // Kar tanesi uzakta karıncalanma gibi okunur: yalnız yakında yağar.
      f.flakeAlpha = smooth(0.95, 1.5, cam.zoom);
      f.time = time % 1000;
      gl.drawPrecip(f, vp, shifts, d, n);
    }
    gl.finish();
    this.cpuMs += (performance.now() - t0 - this.cpuMs) * 0.1;
  }

  /** Yerleşim, demiryolu, gemi, tren, duman, gece ışığı. */
  drawActors(world, turn, season, clim, time, sunLon, nightOn, vp, shifts) {
    const game = this.game;
    const cam = game.camera;
    const gl = this.gl;
    const zoom = cam.zoom;
    const wantShips = livingFlags.on('ships');
    const wantTrains = livingFlags.on('trains');
    const wantCities = livingFlags.on('cities');
    this.motion.update(world, turn, !!game.turns?.turnJob, wantShips, wantTrains);
    this.refreshSites(world, turn);

    const sinD = Math.sin(season.decl);
    const cosD = Math.cos(season.decl);
    const nightOf = (s) => {
      if (!nightOn) return 0;
      const h = s.sinLat * sinD + s.cosLat * cosD * Math.cos(s.lon - sunLon);
      return 1 - smooth(-0.1, 0.06, h);
    };
    // Kar haftalık değişir; her karede 300 şehri yeniden örneklemeye gerek yok.
    if (this.snowDay !== Math.floor(season.day)) {
      this.snowDay = Math.floor(season.day);
      for (const s of this.sites) {
        s.snow = livingFlags.on('seasons') ? 1 - smooth(-1.6, 0.8, temperatureAt(clim, s.u, s.v, season.S, season.cool)) : 0;
      }
    }

    // --- demiryolu ---
    const r = game.renderer;
    const terrainNow = r.gfxTerrainFor?.(r.renderWorld) ?? null;
    this.stepRails(terrainNow);
    const trainAlpha = wantTrains ? smooth(0.62, 0.95, zoom) : 0;
    if (trainAlpha > 0) {
      const t = r.gfxTune;
      gl.drawRails(vp, shifts, 1.15, trainAlpha * 0.9, this.view ? (t?.heightScale ?? 0) : 0, t?.heightCurve ?? 0);
    }

    // --- yerleşim ---
    const cityAlpha = wantCities ? smooth(0.5, 0.8, zoom) : 0;
    const smokeOn = livingFlags.on('smoke');
    const glowAt = this.glowBuf;
    let glows = 0;
    if (nightOn || cityAlpha > 0) {
      for (const s of this.sites) {
        const far = s.kind === 'city';
        if (cityAlpha <= 0 && !far) continue;
        if (!this.project(s.x, s.y)) continue;
        const px = this.px;
        const py = this.py;
        const k = this.pk;
        const night = nightOf(s);
        if (night > 0.02 && wantCities && glows < glowAt.length) {
          glowAt[glows++] = px;
          glowAt[glows++] = py;
          glowAt[glows++] = s.glow * k;
          glowAt[glows++] = night;
        }
        if (cityAlpha > 0) {
          this.pushSprite(s.cell, s.size * zoom * k, s.snow, night, cityAlpha);
          if (smokeOn && s.tips.length) this.queueSmoke(s, px, py, zoom * k, time, night, cityAlpha);
        }
      }
    }
    // Işık halesi uzakta da görünür: geceleyin şehirler haritada parlar.
    for (let i = 0; i < glows; i += 4) {
      const R = Math.max(5, 34 * glowAt[i + 2] * zoom);
      const a = glowAt[i + 3] * 0.34;
      this.pushPuff(glowAt[i], glowAt[i + 1], R, R * 0.8, 1.0 * a, 0.68 * a, 0.32 * a, a * 0.14);
    }
    const glowCount = this.nPuffs;
    gl.drawPuffs(cam.viewWidth, cam.viewHeight, this.puffs, glowCount);

    // --- gemi ve tren: sıralı listenin üstüne ---
    const shipAlpha = wantShips ? smooth(0.36, 0.6, zoom) : 0;
    if (shipAlpha > 0) this.queueShips(time, zoom, sinD, cosD, sunLon, nightOn, shipAlpha, smokeOn);
    if (trainAlpha > 0) this.queueTrains(time, zoom, sinD, cosD, sunLon, nightOn, trainAlpha, smokeOn);

    gl.drawSprites(cam.viewWidth, cam.viewHeight, this.sprites, this.nSprites);
    gl.drawPuffs(cam.viewWidth, cam.viewHeight, this.puffs.subarray(glowCount * 8), this.nPuffs - glowCount);
  }

  queueSmoke(site, px, py, scale, time, night, alpha) {
    const tone = 0.66 - 0.36 * night;
    for (const [dx, dy] of site.tips) {
      const baseX = px + dx * scale;
      const baseY = py + dy * scale;
      for (let k = 0; k < 6; k++) {
        const t = (time * 0.075 + k / 6 + site.phase) % 1;
        const a = Math.sin(Math.PI * t) ** 1.3 * 0.3 * alpha;
        const R = (1.4 + t * 8.5) * scale;
        const x = baseX + (t * t * 17 + Math.sin(t * 6 + site.phase * 9) * 1.6) * scale;
        const y = baseY - t * 25 * scale;
        this.pushPuff(x, y, R, R * 0.86, tone * a, tone * a * 0.98, tone * a * 0.96, a);
      }
    }
  }

  headingOf(dx, dy) {
    const a = Math.atan2(dx, -dy);
    const n = this.headings;
    return ((Math.round((a / TAU) * n) % n) + n) % n;
  }

  /** Noktanın gece payı (örnek başına tablo yok: gemi sayısı az). */
  nightAtPoint(x, y, sinD, cosD, sunLon, nightOn) {
    if (!nightOn) return 0;
    const spanX = this.game.world.cols * HEX_STEP;
    const spanY = this.game.world.rows * ROW_H;
    const eq = this.game.renderer.waterGL.climate.equator;
    const lat = (eq - (y + ROW_H / 2) / spanY) * 2.98;
    const lon = ((x + HEX_STEP / 2) / spanX) * TAU;
    const h = Math.sin(lat) * sinD + Math.cos(lat) * cosD * Math.cos(lon - sunLon);
    return 1 - smooth(-0.1, 0.06, h);
  }

  queueShips(time, zoom, sinD, cosD, sunLon, nightOn, alpha, smokeOn) {
    const Q = this.sample;
    const run = this.run;
    for (const ship of this.motion.ships) {
      const total = ship.route.total;
      shuttle(time * ship.speed / (2 * total) + ship.phase, total, run);
      sampleRoute(ship.route, run.s, Q);
      const dir = run.forward ? 1 : -1;
      const fade = smooth(0, 60, Math.min(run.s, total - run.s));
      if (fade <= 0 || !this.project(Q.x, Q.y)) continue;
      const px = this.px;
      const py = this.py;
      const k = zoom * this.pk;
      const cell = this.ships[ship.variant][this.headingOf(Q.dx * dir, Q.dy * dir)];
      const night = this.nightAtPoint(Q.x, Q.y, sinD, cosD, sunLon, nightOn);
      // Dümen suyu: geminin arkasında sönen köpük.
      for (let w = 1; w <= 4; w++) {
        const back = w * 5.5 * k;
        const a = (0.15 - w * 0.03) * fade * alpha;
        const R = (2.2 + w * 0.9) * k;
        this.pushPuff(px - Q.dx * dir * back, py - Q.dy * dir * back, R, R * 0.7, 0.8 * a, 0.86 * a, 0.9 * a, a);
      }
      this.pushSprite(cell, cell.size * k, 0, night, fade * alpha);
      if (smokeOn && cell.tips[0]) {
        const [dx, dy] = cell.tips[0];
        for (let n = 0; n < 4; n++) {
          const t = (time * 0.16 + n / 4 + ship.phase) % 1;
          const a = (1 - t) * t * 1.15 * fade * alpha;
          const R = (0.9 + t * 3.8) * k;
          this.pushPuff(px + (dx - Q.dx * dir * t * 11) * k, py + (dy - Q.dy * dir * t * 11 - t * 8) * k, R, R, 0.5 * a, 0.5 * a, 0.5 * a, a);
        }
      }
    }
  }

  queueTrains(time, zoom, sinD, cosD, sunLon, nightOn, alpha, smokeOn) {
    const Q = this.sample;
    const run = this.run;
    const GAP = 9.4;
    for (const train of this.motion.trains) {
      const total = train.route.total;
      if (total < 40) continue;
      shuttle(time * train.speed / (2 * total) + train.phase, total, run);
      const dir = run.forward ? 1 : -1;
      const head = run.s;
      const fade = smooth(0, 20, Math.min(head, total - head));
      if (fade <= 0) continue;
      for (let i = train.wagons; i >= 0; i--) {
        const s = head - dir * i * GAP;
        if (s < 0 || s > total) continue;
        sampleRoute(train.route, s, Q);
        if (!this.project(Q.x, Q.y)) continue;
        const k = zoom * this.pk;
        const h = this.headingOf(Q.dx * dir, Q.dy * dir);
        const cell = i === 0 ? this.locos[h] : this.wagons[h];
        const night = this.nightAtPoint(Q.x, Q.y, sinD, cosD, sunLon, nightOn);
        this.pushSprite(cell, cell.size * k, 0, night, fade * alpha);
        if (i === 0 && smokeOn && cell.tips[0]) {
          const [dx, dy] = cell.tips[0];
          for (let n = 0; n < 4; n++) {
            const t = (time * 0.42 + n / 4 + train.phase) % 1;
            const a = (1 - t) * t * 1.5 * fade * alpha;
            const R = (0.7 + t * 2.8) * k;
            this.pushPuff(this.px + (dx - Q.dx * dir * t * 9) * k, this.py + (dy - Q.dy * dir * t * 9 - t * 6) * k, R, R, 0.72 * a, 0.72 * a, 0.72 * a, a);
          }
        }
      }
    }
  }
}
