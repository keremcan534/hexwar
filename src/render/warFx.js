// Savaşın haritadaki izi: simülasyonun gerçek durumundan efekt listesi kurar.
//
// Yalnız OKUR. Dünyaya yazmaz ve oyunun zarını çekmez: bütün rastgelelik kendi
// karmasından gelir, böylece efektler açıkken de aynı tohum aynı oyunu verir.
// Liste yalnız durum değişince (hafta, muharebe açılıp kapanması) yeniden
// kurulur; karede GPU'ya birkaç uniform gider.
//
// Kayda girmez: yanık toprak görseldir, yüklenen oyunda yeni savaşlarla birikir.

import { DIRS, SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { atWar } from '../game/diplomacy.js';
import { controllerOf } from '../game/control.js';
import { anchorTile } from '../game/navy.js';
import { maxHpOf, soldiersOf } from '../game/units.js';
import { FX, SCAR_WEEK_STEP, STRIDE, WarFxGL } from './warFxGL.js';
import { FIRE_SIM_RES, SIM_SLOTS } from './warFireSim.js';

/** Veri kiplerinde kıpırdayan efekt okumayı bozar (su da orada durur). */
const WAR_MODES = new Set(['political', 'terrain', 'cultures']);
/** Sayaçların künyeye döndüğü eşikle aynı bantta ışık noktasına iner. */
const DETAIL_FROM = 0.3;
const DETAIL_TO = 0.46;
const FOREVER = 1e7;
/** Biten efektin sönme payı (sn): gölgelendiricideki life() ile aynı. */
const FADE_OUT = 2.6;
/** Bir deniz muharebesi haftalık sonuçtur; ekranda bu kadar saniye yaşar. */
const NAVAL_SECONDS = 18;
/** Düşen şehrin yangın evreleri (hafta). */
const FIRE_FULL = 8;
const FIRE_DOWN = 40;
const FIRE_OUT = 80;
/** Barıştan sonra izin tamamen silindiği süre: gölgelendirici de 312'de bitirir. */
const SCAR_LIFE = 312;
const MAX_EDGES = 2400;
const MAX_ADVANCES = 96;
const FRONT_ROWS_PER_FRAME = 3;
/** Kare başına yüklenen yanık satırı ve aylık bakımda işlenen kayıt: ani bedel olmasın. */
const SCAR_ROWS_PER_FRAME = 24;
const SCAR_UPKEEP_PER_FRAME = 40;

/** Akışkan yangının başladığı zoom: altında tek alev pikseli bile seçilmez. */
const SIM_ZOOM = 0.62;
/** Dev province'te alan bu kenarla sınırlanır: teksel başına ayrıntı düşmesin. */
const SIM_MAX_SPAN = HEX_SIZE * 30;
/** Yangının province içinde yayılma hızı (alan kenarı / sn). */
const SIM_SPREAD = 0.03;
/** Yuva başına gerçek alev panosu: büyük province'te de doldurma bedeli sabit kalır. */
const MAX_FLAME_ROOTS = 120;

const SIDE_INDEX = { own: 0, ally: 1, hostile: 2, other: 3 };

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp01 = (x) => Math.max(0, Math.min(1, x));
/** Görsel karma: oyunun RNG'sine bağlı değildir. */
const hash = (a, b = 0) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

class Batch {
  constructor(capacity = 64) {
    this.data = new Float32Array(capacity * STRIDE);
    this.count = 0;
  }

  reset() {
    this.count = 0;
  }

  push(a0, a1, a2, a3, b0, b1, b2, b3, start, end) {
    if ((this.count + 1) * STRIDE > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    const d = this.data;
    let i = this.count++ * STRIDE;
    d[i++] = a0; d[i++] = a1; d[i++] = a2; d[i++] = a3;
    d[i++] = b0; d[i++] = b1; d[i++] = b2; d[i++] = b3;
    d[i++] = start; d[i++] = end; d[i++] = 0; d[i] = 0;
  }
}

/**
 * Yanık toprak alanı: altıgen başına yarım hex çözünürlüklü doku. R yanık,
 * G krater, B harabe, A son savaş haftası. Solma gölgelendiricide hesaplanır;
 * yıllar süren iz için haftalık doku yüklemesi gerekmez.
 */
class ScarField {
  constructor(world) {
    this.world = world;
    this.width = world.cols * 2;
    this.height = world.rows * 2;
    this.x0 = -(SQRT3 * HEX_SIZE) / 2;
    this.y0 = world.bounds.minY;
    this.spanX = world.wrapWidth;
    this.spanY = world.bounds.maxY - world.bounds.minY;
    this.bytes = new Uint8Array(this.width * this.height * 4);
    this.land = new Uint8Array(this.width * this.height);
    this.records = new Map();
    this.dirtyFrom = Infinity;
    this.dirtyTo = -1;
    this.upkeep = null;
    for (const tile of world.tiles) {
      if (tile.terrain?.water) continue;
      this.stamp(tile, (index, weight) => {
        this.land[index] = Math.max(this.land[index], Math.round(weight * 255));
      });
    }
  }

  /** Kare merkezi çevresindeki teksellere yumuşak ağırlıkla yazar (sarmal dikişi dahil). */
  stamp(tile, write) {
    const u = ((tile.x - this.x0) / this.spanX) * this.width;
    const v = ((tile.y - this.y0) / this.spanY) * this.height;
    const reach = 2.1;
    for (let y = Math.max(0, Math.floor(v - reach)); y <= Math.min(this.height - 1, Math.ceil(v + reach)); y++) {
      for (let x = Math.floor(u - reach); x <= Math.ceil(u + reach); x++) {
        const d = Math.hypot(x + 0.5 - u, y + 0.5 - v);
        if (d >= reach) continue;
        const wrapped = ((x % this.width) + this.width) % this.width;
        write(y * this.width + wrapped, 1 - smooth(0.7, reach, d));
      }
    }
  }

  mark(tile, turn, burn, crater, ruin) {
    if (tile.terrain?.water) return;
    const rec = this.records.get(tile) ?? { burn: 0, crater: 0, ruin: 0, last: turn };
    rec.burn = clamp01(rec.burn + burn);
    rec.crater = clamp01(rec.crater + crater);
    rec.ruin = clamp01(rec.ruin + ruin);
    rec.last = turn;
    this.records.set(tile, rec);
    this.paint(tile, rec);
  }

  touch(tile) {
    const v = ((tile.y - this.y0) / this.spanY) * this.height;
    this.dirtyFrom = Math.min(this.dirtyFrom, Math.max(0, Math.floor(v - 3)));
    this.dirtyTo = Math.max(this.dirtyTo, Math.min(this.height - 1, Math.ceil(v + 3)));
  }

  /** Sıradaki kirli satır bandı; yoksa null. */
  nextBand(limit) {
    if (this.dirtyTo < this.dirtyFrom) return null;
    const y = this.dirtyFrom;
    const rows = Math.min(limit, this.dirtyTo - y + 1);
    this.dirtyFrom = y + rows;
    if (this.dirtyFrom > this.dirtyTo) {
      this.dirtyFrom = Infinity;
      this.dirtyTo = -1;
    }
    return { y, rows };
  }

  paint(tile, rec) {
    this.touch(tile);
    const b = this.bytes;
    const week = Math.min(255, Math.floor(rec.last / SCAR_WEEK_STEP));
    this.stamp(tile, (index, weight) => {
      const i = index * 4;
      b[i] = Math.max(b[i], Math.round(rec.burn * weight * 255));
      b[i + 1] = Math.max(b[i + 1], Math.round(rec.crater * weight * 255));
      b[i + 2] = Math.max(b[i + 2], Math.round(rec.ruin * weight * 255));
      b[i + 3] = Math.max(b[i + 3], week);
    });
  }

  /** Savaş sürdükçe iz solmaz; barış geldiğinde saat o haftadan işlemeye başlar. */
  beginUpkeep(turn, fighting) {
    this.upkeep = { turn, fighting, tiles: [...this.records.keys()], at: 0 };
  }

  stepUpkeep(limit) {
    const job = this.upkeep;
    if (!job) return;
    const end = Math.min(job.tiles.length, job.at + limit);
    for (; job.at < end; job.at++) {
      const tile = job.tiles[job.at];
      const rec = this.records.get(tile);
      if (!rec) continue;
      if (job.fighting.has(controllerOf(tile))) {
        rec.last = job.turn;
        this.paint(tile, rec);
      } else if (job.turn - rec.last > SCAR_LIFE) {
        this.touch(tile);
        this.stamp(tile, (index) => this.bytes.fill(0, index * 4, index * 4 + 4));
        this.records.delete(tile);
      }
    }
    if (job.at >= job.tiles.length) this.upkeep = null;
  }
}

export class WarFx {
  /** WebGL2 yoksa null: renderer efektsiz sürer. */
  static attach(renderer, afterCanvas) {
    const layer = WarFxGL.create(afterCanvas);
    return layer ? new WarFx(renderer, layer) : null;
  }

  constructor(renderer, layer) {
    this.renderer = renderer;
    this.layer = layer;
    this.world = null;
    this.batches = Object.values(FX).map(() => new Batch());
    this.epoch = performance.now() / 1000;
    this.vp = new Float32Array(16);
    this.anchors = new Float32Array(256);
    this.anchorCount = 0;
    this.copies = [];
    this.stat = { cpuMs: 0, instances: 0, visible: false };
    layer.onRestored = () => this.reupload();
    this.reset(null);
  }

  reset(world) {
    this.world = world;
    this.firstTile = world?.tiles[0] ?? null;
    this.turn = -1;
    this.signature = -1;
    this.battles = new Map();
    this.fires = new Map();
    this.navals = new Map();
    this.seenReports = new Set();
    this.cityHolder = new Map();
    this.scars = null;
    this.frontNext = new Batch(256);
    this.frontRow = -1;
    this.frontCount = 0;
    this.frontFighting = new Set();
    this.fighting = new Set();
    this.simFires = new Array(SIM_SLOTS).fill(null);
    this.nextExpiry = FOREVER;
    this.dirty = true;
    for (const batch of this.batches) batch.reset();
    if (!world) return;
    this.scars = new ScarField(world);
    this.layer.setLand(this.scars.width, this.scars.height, this.scars.land);
    this.layer.setScars(this.scars.width, this.scars.height, this.scars.bytes);
    for (const city of world.cities ?? []) this.cityHolder.set(city, controllerOf(city.tile));
    for (const report of world.navyState?.reports ?? []) this.seenReports.add(report.id);
  }

  /** Bağlam geri geldi: bütün dokular ve listeler yeniden yüklenir. */
  reupload() {
    if (!this.scars) return;
    this.layer.setLand(this.scars.width, this.scars.height, this.scars.land);
    this.layer.setScars(this.scars.width, this.scars.height, this.scars.bytes);
    this.frontRow = 0;
    this.frontNext.reset();
    this.simFires.fill(null);
    for (const fire of this.fires.values()) fire.simSlot = -1;
    this.dirty = true;
  }

  now() {
    return performance.now() / 1000 - this.epoch;
  }

  /** Karede bir kez: durum değiştiyse listeyi tazeler, sonra çizer. */
  frame(world, playerNation) {
    const t0 = performance.now();
    const r = this.renderer;
    const open = world && r.glSurface() && WAR_MODES.has(r.mapMode)
      && !document.body.classList.contains('menu-open');
    if (!open) {
      this.layer.show(false);
      return;
    }
    if (world !== this.world || world.tiles[0] !== this.firstTile || (world.turn ?? 0) < this.turn) this.reset(world);
    this.layer.resize(r.camera.viewWidth, r.camera.viewHeight, r.dpr);
    this.updateSims(world, r.camera);
    this.sync(world, playerNation);
    this.draw(world);
    this.stat.cpuMs = performance.now() - t0;
  }

  /** Yuvalar ekrana en yakın büyük yangınlara gider; yangın sönünce ya da çıkınca boşalır. */
  updateSims(world, cam) {
    const sim = this.layer.sim;
    if (!sim) return;
    const on = !this.renderer.waterGL?.view3d && cam.zoom >= SIM_ZOOM;
    const P = world.wrapWidth;
    const away = (tile) => {
      let dx = tile.x - cam.x;
      if (P) dx -= P * Math.round(dx / P);
      return Math.hypot(dx, tile.y - cam.y);
    };
    const reach = Math.hypot(cam.viewWidth, cam.viewHeight) / (2 * cam.zoom) + HEX_SIZE * 8;
    const now = this.now();
    for (let i = 0; i < SIM_SLOTS; i++) {
      const fire = this.simFires[i];
      if (!fire) continue;
      if (!on || this.fires.get(fire.city) !== fire || fire.level <= 0.05 || away(fire.tile) > reach * 1.3) {
        sim.close(i);
        fire.simSlot = -1;
        this.simFires[i] = null;
        this.dirty = true;
      }
    }
    if (on) {
      const waiting = [...this.fires.values()]
        .filter((fire) => fire.simSlot === undefined || fire.simSlot < 0)
        .filter((fire) => fire.level > 0.15 && away(fire.tile) < reach)
        .sort((p, q) => away(p.tile) - away(q.tile));
      for (let i = 0; i < SIM_SLOTS && waiting.length; i++) {
        if (!this.simFires[i]) this.openSim(world, i, waiting.shift(), now);
      }
    }
    for (let i = 0; i < SIM_SLOTS; i++) {
      const fire = this.simFires[i];
      if (!fire) continue;
      const slot = sim.slots[i];
      slot.level = fire.level;
      // Kuşatmada yangın şehrin çevresinde kalır, düşünce province'e yayılır.
      const full = fire.fell >= 0 ? fire.simReach : Math.min(fire.simReach, (HEX_SIZE * 2.4) / slot.rect[2]);
      slot.radius = Math.min(full, fire.simFrom + (now - fire.simStart) * SIM_SPREAD);
    }
  }

  /** Province şeklini maskeye çizer: haritadaki sınırla aynı eğri, duvar birebir oturur. */
  openSim(world, index, fire, now) {
    const r = this.renderer;
    const tile = fire.tile;
    const P = world.wrapWidth;
    const id = tile.provinceId >= 0 ? tile.provinceId : tile.fringeOf;
    const members = world.provinces?.[id]?.tileIdx?.map((i) => world.tiles[i]) ?? [tile];
    const place = members.map((member) => {
      let dx = member.x - tile.x;
      if (P) dx -= P * Math.round(dx / P);
      return { member, x: tile.x + dx, shift: tile.x + dx - member.x };
    });
    const pad = HEX_SIZE * 1.3;
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const { member, x } of place) {
      minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad);
      minY = Math.min(minY, member.y - pad); maxY = Math.max(maxY, member.y + pad);
    }
    const span = Math.min(SIM_MAX_SPAN, Math.max(maxX - minX, maxY - minY));
    const cx = span < maxX - minX ? tile.x : (minX + maxX) / 2;
    const cy = span < maxY - minY ? tile.y : (minY + maxY) / 2;
    const x0 = cx - span / 2;
    const y0 = cy - span / 2;
    if (!this.maskCanvas) {
      this.maskCanvas = document.createElement('canvas');
      this.maskCanvas.width = FIRE_SIM_RES;
      this.maskCanvas.height = FIRE_SIM_RES;
      this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.maskCtx;
    const k = FIRE_SIM_RES / span;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, FIRE_SIM_RES, FIRE_SIM_RES);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5 / k;
    for (const { member, shift } of place) {
      const path = new Path2D();
      r.cellPath(path, world, member);
      ctx.setTransform(k, 0, 0, k, (shift - x0) * k, -y0 * k);
      ctx.fill(path);
      // Komşu hücrelerin kenar yumuşatması arada kıl payı duvar bırakmasın.
      ctx.stroke(path);
    }
    const cityU = (tile.x - x0) / span;
    const cityV = (tile.y - y0) / span;
    let far = 0;
    for (const { member, x } of place) far = Math.max(far, Math.hypot(x - tile.x, member.y - tile.y));
    fire.simSlot = index;
    fire.simStart = now;
    fire.simReach = (far + HEX_SIZE * 2) / span;
    // Yangın çoktan büyümüşse ekrana girdiğinde sıfırdan başlamaz.
    fire.simFrom = fire.fell >= 0 ? Math.min(fire.simReach, 0.1 + (this.turn - fire.fell) * 0.05) : 0.08;
    this.simFires[index] = fire;
    this.layer.sim.open(index, [x0, y0, span, span], [cityU, cityV], this.maskCanvas, (HEX_SIZE * 0.4) / span, this.flameRoots(span));
    this.dirty = true;
  }

  /**
   * Province'e ekilen alev kökleri. Kıyı boyunca sık ve küçük, içeride seyrek ve
   * büyük: ateşin kenarı sınır çizgisini izler. Kuzeyden güneye sıralıdır, öndeki
   * alev arkadakini örter.
   */
  flameRoots(span) {
    const data = this.maskCtx.getImageData(0, 0, FIRE_SIM_RES, FIRE_SIM_RES).data;
    const inside = (u, v) => {
      if (u < 0 || v < 0 || u >= 1 || v >= 1) return false;
      return data[(Math.floor(v * FIRE_SIM_RES) * FIRE_SIM_RES + Math.floor(u * FIRE_SIM_RES)) * 4] > 127;
    };
    let area = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] > 127) area++;
    const share = area / (FIRE_SIM_RES * FIRE_SIM_RES);
    const step = Math.max((HEX_SIZE * 0.58) / span, Math.sqrt(share / MAX_FLAME_ROOTS));
    const size = Math.max(HEX_SIZE * 1.5, step * span * 2.7);
    const roots = [];
    for (let row = 0; row * step < 1; row++) {
      for (let col = 0; col * step < 1; col++) {
        const u = (col + 0.5 + (hash(col, row) - 0.5) * 0.8) * step;
        const v = (row + 0.5 + (hash(row, col + 9) - 0.5) * 0.8) * step;
        if (!inside(u, v)) continue;
        const shore = !inside(u + step, v) || !inside(u - step, v) || !inside(u, v + step) || !inside(u, v - step);
        const s = hash(col + 3, row + 5);
        roots.push([u, v, s, size * (shore ? 0.6 + s * 0.3 : 0.75 + s * s * 0.95)]);
      }
    }
    roots.sort((p, q) => p[1] - q[1]);
    return new Float32Array(roots.flat());
  }

  sync(world, playerNation) {
    const now = this.now();
    const turn = world.turn ?? 0;
    const list = world.battleSystem?.battles ?? [];
    const signature = list.length * 100000 + (list[list.length - 1]?.id ?? 0);
    const newWeek = turn !== this.turn;
    if (newWeek || signature !== this.signature) {
      this.signature = signature;
      this.syncBattles(world, list, now, newWeek ? turn : -1);
      if (newWeek) {
        this.turn = turn;
        this.syncCities(world, turn, now);
        this.syncNaval(world, now);
        if (turn % 4 === 0) this.scars.beginUpkeep(turn, this.fighting);
        this.startFrontScan(world);
      }
      this.dirty = true;
    }
    this.stepFront(world);
    if (now >= this.nextExpiry) this.dirty = true;
    if (this.dirty) {
      this.dirty = false;
      this.rebuild(world, playerNation, now);
    }
    this.scars.stepUpkeep(SCAR_UPKEEP_PER_FRAME);
    const band = this.scars.nextBand(SCAR_ROWS_PER_FRAME);
    if (band) this.layer.patchScars(band.y, band.rows, this.scars.width, this.scars.bytes);
  }

  syncBattles(world, list, now, weekTurn) {
    const units = new Map(world.units.map((unit) => [unit.id, unit]));
    const live = new Set();
    for (const battle of list) {
      const tile = world.get(battle.q, battle.r);
      if (!tile) continue;
      live.add(battle.id);
      const attackers = (battle.attackers ?? []).map((id) => units.get(id)).filter(Boolean);
      const defenders = (battle.defenders ?? []).map((id) => units.get(id)).filter(Boolean);
      // Güç tümen sayısı × kalan asker payıdır: yarı erimiş iki kolordu, tam
      // güçlü iki kolordu kadar gürlemez.
      let effective = 0;
      for (const unit of [...attackers, ...defenders]) {
        effective += clamp01(soldiersOf(unit) / Math.max(1, maxHpOf(unit)));
      }
      const power = clamp01(Math.pow(effective / 9, 0.62));
      const seen = this.battles.get(battle.id);
      const rec = seen ?? { id: battle.id, tile, seed: hash(battle.id, tile.q), start: now, end: FOREVER };
      rec.power = power;
      rec.nation = battle.attackerNation;
      rec.origins = [...new Set(attackers.map((unit) => unit.tile).filter((from) => from && from !== tile))];
      rec.end = FOREVER;
      this.battles.set(battle.id, rec);
      if (weekTurn >= 0) this.scarBattle(world, tile, power, weekTurn);
    }
    for (const rec of this.battles.values()) {
      if (!live.has(rec.id) && rec.end === FOREVER) rec.end = now + FADE_OUT;
    }
  }

  /** Muharebe karesi ağır, komşuları hafif iz alır: savaş alanı hex sınırı tanımaz. */
  scarBattle(world, tile, power, turn) {
    const scars = this.scars;
    scars.mark(tile, turn, 0.07 + 0.1 * power, 0.08 + 0.14 * power, tile.city ? 0.1 + 0.12 * power : 0);
    for (const near of world.neighbors(tile)) scars.mark(near, turn, 0.02 + 0.03 * power, 0.012 + 0.035 * power, 0);
  }

  syncCities(world, turn, now) {
    for (const city of world.cities ?? []) {
      const holder = controllerOf(city.tile);
      const before = this.cityHolder.get(city);
      this.cityHolder.set(city, holder);
      // İlk görüldüğü hafta sayılmaz: yüklenen kayıttaki eski işgal yanmaya başlamasın.
      if (before === undefined || before === holder || holder < 0 || before < 0) continue;
      if (!atWar(world, holder, before)) continue;
      this.fires.set(city, { city, tile: city.tile, fell: turn, start: now, end: FOREVER, seed: hash(city.id, 7) });
      this.scars.mark(city.tile, turn, 0.8, 0.4, 0.9);
    }
    const besieged = new Set();
    for (const rec of this.battles.values()) if (rec.end === FOREVER && rec.tile.city) besieged.add(rec.tile.city);
    for (const city of besieged) {
      if (!this.fires.has(city)) {
        this.fires.set(city, { city, tile: city.tile, fell: -1, start: now, end: FOREVER, seed: hash(city.id, 7) });
      }
    }
    for (const fire of this.fires.values()) {
      fire.besieged = besieged.has(fire.city);
      const age = fire.fell < 0 ? Infinity : turn - fire.fell;
      if (age === 3) {
        const id = fire.tile.provinceId;
        for (const i of world.provinces?.[id]?.tileIdx ?? []) this.scars.mark(world.tiles[i], turn, 0.55, 0.05, 0);
      }
      const burning = age < FIRE_FULL ? 1
        : age < FIRE_DOWN ? 1 - ((age - FIRE_FULL) / (FIRE_DOWN - FIRE_FULL)) * 0.82
          : age < FIRE_OUT ? 0.18 * (1 - (age - FIRE_DOWN) / (FIRE_OUT - FIRE_DOWN)) : 0;
      fire.level = Math.max(burning, fire.besieged ? 0.55 : 0);
      if (fire.level <= 0.01 && fire.end === FOREVER) fire.end = now + FADE_OUT;
      else if (fire.level > 0.01) fire.end = FOREVER;
    }
  }

  syncNaval(world, now) {
    for (const report of world.navyState?.reports ?? []) {
      if (this.seenReports.has(report.id)) continue;
      this.seenReports.add(report.id);
      const tile = anchorTile(world, report.zone);
      if (!tile) continue;
      const ships = report.sides.reduce((sum, side) => sum + side.ships, 0);
      const sunk = report.sides.reduce((sum, side) => sum + side.sunk.length, 0);
      const damaged = report.sides.reduce((sum, side) => sum + side.damaged, 0);
      const around = world.neighbors(tile).filter((near) => near.terrain?.water);
      const burning = [];
      for (let i = 0; i < Math.min(3, sunk + Math.ceil(damaged / 2)); i++) {
        burning.push(around[i % Math.max(1, around.length)] ?? tile);
      }
      this.navals.set(report.id, {
        tile, burning, seed: hash(report.turn, report.zone),
        power: clamp01(ships / 14), start: now, end: now + NAVAL_SECONDS,
      });
    }
  }

  /** Savaş yoksa tarama hiç başlamaz: barışta hafta başına bedel sıfır kalır. */
  startFrontScan(world) {
    if (this.frontRow >= 0) return;
    const nations = world.nations ?? [];
    const war = nations.some((a) => a?.alive && nations.some((b) => b?.alive && a.id < b.id && atWar(world, a.id, b.id)));
    if (war) {
      this.frontRow = 0;
      return;
    }
    if (this.frontCount) this.layer.upload(FX.FRONT, this.frontNext.data, 0);
    this.frontCount = 0;
    this.fighting = new Set();
  }

  /**
   * Cephe taraması kare başına birkaç satır işler: 160×96 dünyanın tamamı tek
   * karede taranırsa savaş haftalarında uzak zoom bütçesi aşılıyordu.
   */
  stepFront(world) {
    if (this.frontRow < 0) return;
    const P = world.wrapWidth;
    const last = Math.min(world.rows, this.frontRow + FRONT_ROWS_PER_FRAME);
    const next = this.frontNext;
    for (let row = this.frontRow; row < last; row++) {
      for (let col = 0; col < world.cols; col++) {
        const tile = world.tiles[row * world.cols + col];
        if (!tile || tile.terrain?.water) continue;
        const mine = controllerOf(tile);
        if (mine < 0) continue;
        // Kenar başına tek kayıt: yarım yönler, öbür yarıyı komşu kare yazar.
        for (let d = 0; d < 3; d++) {
          const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
          if (!near || near.terrain?.water) continue;
          const theirs = controllerOf(near);
          if (theirs < 0 || theirs === mine || !atWar(world, mine, theirs)) continue;
          this.frontFighting.add(mine);
          this.frontFighting.add(theirs);
          if (next.count >= MAX_EDGES) continue;
          let dx = near.x - tile.x;
          if (P) dx -= P * Math.round(dx / P);
          const dy = near.y - tile.y;
          next.push(tile.x + dx / 2, tile.y + dy / 2, HEX_SIZE * 1.02, HEX_SIZE * 1.05,
            hash(tile.q, tile.r), 1, Math.atan2(dy, dx) + Math.PI / 2, 0, -10, FOREVER);
        }
      }
    }
    this.frontRow = last;
    if (last < world.rows) return;
    this.frontRow = -1;
    this.layer.upload(FX.FRONT, next.data, next.count);
    this.frontCount = next.count;
    this.fighting = this.frontFighting;
    this.frontFighting = new Set();
    next.reset();
  }

  addAnchor(x, y) {
    if (this.anchorCount * 2 >= this.anchors.length) {
      const grown = new Float32Array(this.anchors.length * 2);
      grown.set(this.anchors);
      this.anchors = grown;
    }
    this.anchors[this.anchorCount * 2] = x;
    this.anchors[this.anchorCount * 2 + 1] = y;
    this.anchorCount++;
  }

  rebuild(world, playerNation, now) {
    for (const batch of this.batches) if (batch !== this.batches[FX.FRONT]) batch.reset();
    this.anchorCount = 0;
    this.nextExpiry = FOREVER;
    const expire = (map) => {
      for (const [key, rec] of map) {
        if (rec.end < now) map.delete(key);
        else if (rec.end !== FOREVER) this.nextExpiry = Math.min(this.nextExpiry, rec.end);
      }
    };
    expire(this.battles);
    expire(this.fires);
    expire(this.navals);
    for (const rec of this.battles.values()) this.buildBattle(rec, world, playerNation);
    for (const fire of this.fires.values()) this.buildFire(fire);
    for (const naval of this.navals.values()) this.buildNaval(naval);
    this.buildAdvances(world, playerNation, now);
    let total = this.frontCount;
    for (const kind of Object.values(FX)) {
      if (kind === FX.FRONT) continue;
      this.layer.upload(kind, this.batches[kind].data, this.batches[kind].count);
      total += this.batches[kind].count;
    }
    this.stat.instances = total;
  }

  buildBattle(rec, world, playerNation) {
    const { tile, seed, power, start, end } = rec;
    const b = this.batches;
    const x = tile.x;
    const y = tile.y;
    this.addAnchor(x, y);
    const spread = HEX_SIZE * 0.72;
    b[FX.GLOW].push(x, y, HEX_SIZE * (1.5 + power), HEX_SIZE * (1.15 + power * 0.8), seed, power, 1, 0, start, end);
    b[FX.POINT].push(x, y, 9 + power * 9, 0, seed, 0.45 + power * 0.55, 0, 0, start, end);
    const smokes = 1 + Math.round(power * 2);
    for (let i = 0; i < smokes; i++) {
      const s = hash(seed, i + 1);
      const a = s * Math.PI * 2;
      b[FX.SMOKE].push(x + Math.cos(a) * spread * 0.6, y + Math.sin(a) * spread * 0.4,
        HEX_SIZE * (2.4 + power * 1.2), HEX_SIZE * (2.6 + power * 1.6), s, power, 1, 0, start, end);
    }
    const bursts = 1 + Math.round(power * 5);
    for (let i = 0; i < bursts; i++) {
      b[FX.BURST].push(x, y, spread, HEX_SIZE * (1.0 + power * 0.55), hash(seed, i + 11), power, 0, 0, start, end);
    }
    const flashes = 3 + Math.round(power * 9);
    for (let i = 0; i < flashes; i++) {
      b[FX.FLASH].push(x, y, spread * 1.15, HEX_SIZE * (0.26 + power * 0.16), hash(seed, i + 31), power, 0, 0, start, end);
    }
    const side = SIDE_INDEX[this.renderer.sideOf(world, rec.nation, playerNation)] ?? 3;
    for (const from of rec.origins) this.pushArrow(from, tile, power * 0.5 + 0.5, side, start, end, seed);
  }

  /** Hedefe akan üç köşeli işaret; çıkış karesi hedefin sarmal kopyasına taşınır. */
  pushArrow(from, to, power, side, start, end, seed) {
    const P = this.world.wrapWidth;
    let dx = to.x - from.x;
    if (P) dx -= P * Math.round(dx / P);
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (!(len > 0)) return;
    const ux = dx / len;
    const uy = dy / len;
    const ax = to.x - dx + ux * HEX_SIZE * 0.46;
    const ay = from.y + uy * HEX_SIZE * 0.46;
    const bx = to.x - ux * HEX_SIZE * 0.5;
    const by = to.y - uy * HEX_SIZE * 0.5;
    for (let i = 0; i < 3; i++) {
      this.batches[FX.ARROW].push(ax, ay, bx, by, i / 3 + seed * 0.07, power, side, HEX_SIZE * 0.3, start, end);
    }
  }

  /** Düşman toprağına yürüyen tümenler: muharebeden önce de taarruz yönü okunur. */
  buildAdvances(world, playerNation) {
    const seen = new Set();
    let drawn = 0;
    for (const unit of world.units) {
      if (drawn >= MAX_ADVANCES) break;
      if (unit.battleId || unit.embarked || unit.type?.domain !== 'land' || !unit.path?.length) continue;
      const to = unit.path.find((tile) => tile !== unit.tile);
      if (!to || !unit.tile || to.terrain?.water) continue;
      const holder = controllerOf(to);
      if (holder < 0 || holder === unit.nationId || !atWar(world, unit.nationId, holder)) continue;
      const key = `${unit.tile.q},${unit.tile.r}>${to.q},${to.r}`;
      if (seen.has(key)) continue;
      seen.add(key);
      drawn++;
      this.addAnchor(to.x, to.y);
      const side = SIDE_INDEX[this.renderer.sideOf(world, unit.nationId, playerNation)] ?? 3;
      this.pushArrow(unit.tile, to, 0.28, side, -10, FOREVER, hash(unit.id, 3));
    }
  }

  buildFire(fire) {
    const { tile, seed, level, start, end } = fire;
    if (!level) return;
    const b = this.batches;
    const x = tile.x;
    const y = tile.y;
    this.addAnchor(x, y);
    const size = HEX_SIZE * (0.72 + level * 0.62);
    b[FX.GLOW].push(x, y - size * 0.25, HEX_SIZE * (1.7 + level * 1.5), HEX_SIZE * (1.3 + level * 1.1), seed, 0.5 + level * 0.5, 0, 0, start, end);
    b[FX.POINT].push(x, y, 7 + level * 8, 0, seed, 0.5 + level * 0.5, 1, 0, start, end);
    // Kara duman alevden önce çizilir: alev sütunun dibinden çıkıyor görünür.
    const plumes = level > 0.5 ? 2 : 1;
    for (let i = 0; i < plumes; i++) {
      const s = hash(seed, i + 3);
      b[FX.SMOKE].push(x + (s - 0.5) * HEX_SIZE * 0.7, y - HEX_SIZE * 0.08,
        HEX_SIZE * (3.2 + level * 1.8), HEX_SIZE * (4.6 + level * 4.4), s, level, 0, 0.5 + level * 0.5, start, end);
    }
    // Akışkan yuvası bu yangını çiziyorsa gürültü alevi üst üste binmesin.
    if (fire.simSlot >= 0) return;
    // Alçak ateş yatağı dilleri birleştirir: yan yana dizilmiş mum gibi durmasınlar.
    const beds = 1 + Math.round(level * 3);
    for (let i = 0; i < beds; i++) {
      const s = hash(seed, i + 21);
      const a = (i / beds) * Math.PI * 2 + s * 2;
      b[FX.FLAME].push(x + Math.cos(a) * HEX_SIZE * 0.42, y + Math.sin(a) * HEX_SIZE * 0.2 + HEX_SIZE * 0.12,
        size * (1.05 + s * 0.45), size * (0.95 + s * 0.4), s, level * 0.8, 0, 0, start, end);
    }
    const tongues = 2 + Math.round(level * 4);
    const order = [];
    for (let i = 0; i < tongues; i++) {
      const s = hash(seed, i + 41);
      const a = (i / tongues) * Math.PI * 2 + s * 1.4;
      const r = i === 0 ? 0 : HEX_SIZE * (0.3 + s * 0.28);
      order.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.62, s, main: i === 0 });
    }
    // Arkadaki dil önce: öndeki alev onun üstünü örter.
    order.sort((p, q) => p.y - q.y);
    for (const tongue of order) {
      const k = (tongue.main ? 1.45 : 0.62) + tongue.s * 0.42;
      b[FX.FLAME].push(tongue.x, tongue.y, size * k * 1.02, size * k * 2.05, tongue.s, level, 0, 0, start, end);
    }
  }

  buildNaval(naval) {
    const { tile, seed, power, start, end, burning } = naval;
    const b = this.batches;
    const x = tile.x;
    const y = tile.y;
    this.addAnchor(x, y);
    const spread = HEX_SIZE * 1.7;
    b[FX.GLOW].push(x, y, HEX_SIZE * (2 + power * 1.4), HEX_SIZE * (1.5 + power), seed, power, 1, 0, start, end);
    b[FX.POINT].push(x, y, 9 + power * 7, 0, seed, 0.5 + power * 0.5, 2, 0, start, end);
    const columns = 3 + Math.round(power * 6);
    for (let i = 0; i < columns; i++) {
      b[FX.SPLASH].push(x, y, spread, HEX_SIZE * (0.75 + power * 0.32), hash(seed, i + 7), power, 0, 0, start, end);
    }
    const flashes = 5 + Math.round(power * 10);
    for (let i = 0; i < flashes; i++) {
      b[FX.FLASH].push(x, y, spread, HEX_SIZE * 0.5, hash(seed, i + 61), power, 1, 0, start, end);
    }
    burning.forEach((at, i) => {
      const s = hash(seed, i + 81);
      const sx = at.x + (s - 0.5) * HEX_SIZE * 0.5;
      const sy = at.y + (hash(s, 2) - 0.5) * HEX_SIZE * 0.4;
      b[FX.SHIP].push(sx, sy, HEX_SIZE * 1.15, HEX_SIZE * 0.42, s, 1, (s - 0.5) * 1.1, 0, start, end);
      b[FX.SMOKE].push(sx, sy, HEX_SIZE * 3, HEX_SIZE * 4.2, s, 1, 0, 0.8, start, end);
      b[FX.FLAME].push(sx - HEX_SIZE * 0.12, sy, HEX_SIZE * 0.72, HEX_SIZE * 1.05, s, 0.85, 0, 0, start, end);
      b[FX.FLAME].push(sx + HEX_SIZE * 0.2, sy, HEX_SIZE * 0.5, HEX_SIZE * 0.78, hash(s, 5), 0.7, 0, 0, start, end);
    });
  }

  /** Görünür bir odak var mı? Ekran dışındaki savaş GPU'ya hiç gitmesin. */
  anyVisible(cam) {
    const P = this.world.wrapWidth;
    const halfW = cam.viewWidth / (2 * cam.zoom) + HEX_SIZE * 6;
    const halfH = cam.viewHeight / (2 * cam.zoom) + HEX_SIZE * 8;
    const a = this.anchors;
    for (let i = 0; i < this.anchorCount; i++) {
      let dx = a[i * 2] - cam.x;
      if (P) dx -= P * Math.round(dx / P);
      if (Math.abs(dx) < halfW && Math.abs(a[i * 2 + 1] - cam.y) < halfH) return true;
    }
    return false;
  }

  draw(world) {
    const r = this.renderer;
    const cam = r.camera;
    const detail = smooth(DETAIL_FROM, DETAIL_TO, cam.zoom);
    const tilted = r.waterGL?.view3d ?? null;
    const ground = !tilted;
    const scarsOn = ground && detail > 0 && this.scars.records.size > 0;
    const frontOn = ground && detail > 0 && this.frontCount > 0;
    const visible = this.anchorCount > 0 ? this.anyVisible(cam) : false;
    if (!visible && !scarsOn && !frontOn) {
      this.layer.show(false);
      this.stat.visible = false;
      return;
    }
    this.layer.show(true);
    this.stat.visible = true;
    if (this.fires.size) this.layer.loadAtlas();
    const P = world.wrapWidth;
    const copies = this.copies;
    copies.length = 0;
    if (P) {
      const half = cam.viewWidth / (2 * cam.zoom);
      const first = Math.floor((cam.x - half - HEX_SIZE * 8) / P);
      const last = Math.floor((cam.x + half + HEX_SIZE * 8) / P);
      for (let k = first; k <= last; k++) copies.push(k * P);
    } else copies.push(0);
    const vp = this.vp;
    if (tilted) vp.set(tilted.viewProj);
    else {
      const sx = (2 * cam.zoom) / cam.viewWidth;
      const sy = (-2 * cam.zoom) / cam.viewHeight;
      vp.fill(0);
      vp[0] = sx;
      vp[5] = sy;
      vp[10] = 1;
      vp[12] = -cam.x * sx;
      vp[13] = -cam.y * sy;
      vp[15] = 1;
    }
    const time = this.now();
    const s = this.scars;
    this.layer.render({
      vp,
      width: cam.viewWidth,
      height: cam.viewHeight,
      x: cam.x,
      y: cam.y,
      zoom: cam.zoom,
      refW: tilted ? tilted.D : 1,
      time,
      // Bütün dumanlar aynı rüzgârda eğilir: sütunlar tek bir hava gibi okunur.
      wind: Math.sin(time * 0.07) * 0.5 + Math.sin(time * 0.023 + 1.3) * 0.5,
      turn: world.turn ?? 0,
      detail,
      map: [s.x0, s.y0, 1 / s.spanX, 1 / s.spanY],
      copies,
      ground,
      scars: scarsOn,
    });
  }

  /** Ölçüm: kare başına JS süresi, GPU süresi, örnek sayısı. */
  stats() {
    return { ...this.stat, gpuMs: this.layer.gpuMs() };
  }
}
