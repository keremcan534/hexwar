// Canvas2D hex çizimi. Görünmeyen hexler kırpılır, aynı renkler tek path'te toplanır,
// uzaklaşınca tüm dünya önceden pişirilmiş tek dokudan basılır.

import { HEX_CORNERS, SQRT3, DIRS } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { drawFlag } from './flagPainter.js';

const MAX_DPR = 2;            // mobilde 3x DPR gereksiz pahalı
const CACHE_MAX_SIDE = 2048;  // önbellek dokusunun en uzun kenarı (bellek sınırı)
const CACHE_ZOOM = 0.55;      // bu zoom altında tüm dünya önbellekten tek seferde basılır

/** Şehir ve birim aynı karede: biri yukarı, biri aşağı kaydırılır. */
const CITY_OFFSET = 0.3;
const UNIT_ON_CITY_OFFSET = 0.22;

/** Emir rozetleri; orders.js'teki ORDER değerleriyle eşleşir. */
const ORDER_BADGE = { auto: '⚙', goto: '→', hold: '⏸' };

/**
 * NATO harita sembolleri: keşif tek eğik çizgi, piyade çapraz, zırhlı elips.
 * Harf yerine bunlar kullanılıyor — dilden bağımsız ve uzaktan okunur.
 */
function natoSymbol(path, typeId, cx, cy, r) {
  const w = r * 0.78;
  const h = r * 0.52;
  switch (typeId) {
    case 'SCOUT':
      path.moveTo(cx - w, cy + h);
      path.lineTo(cx + w, cy - h);
      break;
    case 'INFANTRY':
      path.moveTo(cx - w, cy - h);
      path.lineTo(cx + w, cy + h);
      path.moveTo(cx + w, cy - h);
      path.lineTo(cx - w, cy + h);
      break;
    case 'CAVALRY':
      path.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      break;
    case 'WARSHIP':
      // Gövdenin kendisi zaten okunuyor; sadece direk eklenir.
      path.moveTo(cx - r * 0.15, cy + h * 0.3);
      path.lineTo(cx - r * 0.15, cy - h * 1.5);
      break;
    default:
      path.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  }
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.dpr = 1;
    this.showGrid = true;
    this.showOwners = true;
    this.showLabels = true;
    /** 'nations' | 'cultures' */
    this.mapMode = 'nations';
    this.corners = HEX_CORNERS.map(([x, y]) => [x * HEX_SIZE, y * HEX_SIZE]);
    this.cache = null;
    this.lastDrawn = 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.camera.setViewport(rect.width, rect.height);
  }

  /** Dünya ya da katman ayarları değişince önbellek geçersizleşir. */
  invalidateCache() {
    this.cache = null;
  }

  hexPath(path, cx, cy) {
    const c = this.corners;
    path.moveTo(cx + c[0][0], cy + c[0][1]);
    for (let i = 1; i < 6; i++) path.lineTo(cx + c[i][0], cy + c[i][1]);
    path.closePath();
  }

  /** Görünür alandaki tile'ları offset ızgara üzerinden toplar. */
  visibleTiles(world) {
    const rect = this.camera.visibleRect(HEX_SIZE * 2);
    const rowH = HEX_SIZE * 1.5;
    const colW = HEX_SIZE * SQRT3;
    const rowMin = Math.max(0, Math.floor(rect.minY / rowH) - 1);
    const rowMax = Math.min(world.rows - 1, Math.ceil(rect.maxY / rowH) + 1);
    const colMin = Math.max(0, Math.floor(rect.minX / colW) - 1);
    const colMax = Math.min(world.cols - 1, Math.ceil(rect.maxX / colW) + 1);
    const out = [];
    for (let row = rowMin; row <= rowMax; row++) {
      const base = row * world.cols;
      for (let col = colMin; col <= colMax; col++) {
        const t = world.tiles[base + col];
        if (t) out.push(t);
      }
    }
    return out;
  }

  render(world, state = {}) {
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a1b2e';
    ctx.fillRect(0, 0, cam.viewWidth, cam.viewHeight);

    ctx.save();
    ctx.translate(cam.viewWidth / 2, cam.viewHeight / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    if (cam.zoom < CACHE_ZOOM) {
      const cache = this.cache ?? this.buildCache(world);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(cache.canvas, cache.x, cache.y, cache.w, cache.h);
      this.lastDrawn = 0;
    } else {
      const tiles = this.visibleTiles(world);
      this.drawTerrain(ctx, tiles);
      if (this.showOwners) this.drawOwnership(ctx, world, tiles);
      if (this.showGrid) this.drawGrid(ctx, tiles, cam.zoom);
      if (this.showOwners) this.drawBorders(ctx, world, tiles, cam.zoom);
      this.lastDrawn = tiles.length;
    }

    if (state.reachable) this.drawReachable(ctx, state.reachable);
    if (state.selected) this.drawHighlight(ctx, state.selected, '#ffffff', 3);
    if (state.hovered && state.hovered !== state.selected) {
      this.drawHighlight(ctx, state.hovered, 'rgba(255,255,255,0.45)', 2);
    }
    this.drawCities(ctx, world);
    this.drawUnits(ctx, world, state.selectedUnit);
    ctx.restore();

    if (this.showLabels && world.nations?.length && cam.zoom > 0.3) {
      this.drawLabels(ctx, world);
    }
  }

  /**
   * Tüm dünyayı tek bir dokuya çizer. Uzaklaşınca binlerce hex yerine tek
   * drawImage yapılır -> mobilde kaydırma akıcı kalır.
   */
  buildCache(world) {
    const b = world.bounds;
    const w = b.maxX - b.minX;
    const h = b.maxY - b.minY;
    const scale = Math.min(1, CACHE_MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(-b.minX, -b.minY);

    const all = world.tiles;
    this.drawTerrain(ctx, all);
    if (this.showOwners) {
      this.drawOwnership(ctx, world, all);
      this.drawBorders(ctx, world, all, scale);
    }

    this.cache = { canvas, x: b.minX, y: b.minY, w, h, scale };
    return this.cache;
  }

  drawTerrain(ctx, tiles) {
    const byColor = new Map();
    for (const t of tiles) {
      let path = byColor.get(t.terrain.color);
      if (!path) {
        path = new Path2D();
        byColor.set(t.terrain.color, path);
      }
      this.hexPath(path, t.x, t.y);
    }
    for (const [color, path] of byColor) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }

  /** Sahiplik katmanı: ülke renkleri ya da kültür kipinde halk renkleri. */
  drawOwnership(ctx, world, tiles) {
    const byColor = new Map();
    for (const t of tiles) {
      const color = this.mapMode === 'cultures'
        ? (t.culture >= 0 ? world.cultures[t.culture].color : null)
        : (t.owner >= 0 ? world.nations[t.owner].color : null);
      if (!color) continue;
      let path = byColor.get(color);
      if (!path) {
        path = new Path2D();
        byColor.set(color, path);
      }
      this.hexPath(path, t.x, t.y);
    }
    // Düşük tutuldu: yüksek alfada ülke rengi arazi paletini soldurup
    // haritayı tek düze çamur rengine çeviriyor. Kültür kipinde amaç zaten
    // bölgeleri okumak olduğu için biraz daha koyu.
    ctx.globalAlpha = this.mapMode === 'cultures' ? 0.5 : 0.3;
    for (const [color, path] of byColor) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    ctx.globalAlpha = 1;
  }

  drawGrid(ctx, tiles, scale) {
    const path = new Path2D();
    for (const t of tiles) this.hexPath(path, t.x, t.y);
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.stroke(path);
  }

  /** Yalnızca farklı sahipler arasındaki kenarları çizer -> net ülke sınırları. */
  drawBorders(ctx, world, tiles, scale) {
    const byColor = new Map();
    const c = this.corners;
    const cultureMode = this.mapMode === 'cultures';
    const groupOf = (tile) => (cultureMode ? tile.culture : tile.owner);

    for (const t of tiles) {
      const group = groupOf(t);
      if (group < 0) continue;
      const color = cultureMode ? world.cultures[group].color : world.nations[group].color;
      let path = byColor.get(color);
      if (!path) {
        path = new Path2D();
        byColor.set(color, path);
      }
      for (let i = 0; i < 6; i++) {
        const n = world.get(t.q + DIRS[i][0], t.r + DIRS[i][1]);
        if (n && groupOf(n) === group) continue;
        const a = c[i];
        const b = c[(i + 1) % 6];
        path.moveTo(t.x + a[0], t.y + a[1]);
        path.lineTo(t.x + b[0], t.y + b[1]);
      }
    }
    // Sabit ekran kalınlığı: dünya birimine çevirmek için ölçeğe bölünür.
    ctx.lineWidth = 2.2 / scale;
    ctx.lineCap = 'round';
    for (const [color, path] of byColor) {
      ctx.strokeStyle = color;
      ctx.stroke(path);
    }
  }

  /** Seçili birimin gidebileceği kareler. */
  drawReachable(ctx, reachable) {
    const path = new Path2D();
    for (const tile of reachable.costs.keys()) this.hexPath(path, tile.x, tile.y);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = '#ffffff';
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke(path);
  }

  /** Şehirler: ülke renginde köşeli sur işareti, seviye kadar burçlu. */
  drawCities(ctx, world) {
    if (!world.cities?.length) return;
    const rect = this.camera.visibleRect(HEX_SIZE * 2);
    const s = HEX_SIZE * 0.46;

    for (const city of world.cities) {
      const t = city.tile;
      if (t.x < rect.minX || t.x > rect.maxX || t.y < rect.minY || t.y > rect.maxY) continue;
      const color = world.nations[city.nationId].color;
      // Şehir hexin üst yarısına: aynı karedeki birim onu tamamen örtüyordu.
      const cy = t.y - HEX_SIZE * CITY_OFFSET;

      ctx.beginPath();
      ctx.rect(t.x - s, cy - s * 0.7, s * 2, s * 1.4);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2 / this.camera.zoom;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.stroke();

      // Burçlar: seviye arttıkça üstte daha çok diş.
      const teeth = 1 + city.level;
      const w = (s * 2) / (teeth * 2 - 1);
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        ctx.rect(t.x - s + i * w * 2, cy - s * 0.7 - w * 0.8, w, w * 0.8);
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.stroke();
    }
  }

  /**
   * Birimler: ülke renginde disk + tip harfi + can çubuğu.
   * Uzaklaşınca yazı okunmaz olduğu için sadece disk çizilir.
   */
  drawUnits(ctx, world, selectedUnit) {
    if (!world.units?.length) return;
    const zoom = this.camera.zoom;
    const rect = this.camera.visibleRect(HEX_SIZE * 2);
    const radius = HEX_SIZE * 0.52;
    const detailed = zoom > 0.5;

    for (const unit of world.units) {
      const t = unit.tile;
      if (t.x < rect.minX || t.x > rect.maxX || t.y < rect.minY || t.y > rect.maxY) continue;
      const nation = world.nations[unit.nationId];
      // Şehirle aynı karedeyse aşağı kayar; ikisi de görünür kalsın.
      const ux = t.x;
      const uy = t.y + (t.city ? HEX_SIZE * UNIT_ON_CITY_OFFSET : 0);

      const atSea = unit.embarked || unit.type.domain === 'sea';
      const shape = new Path2D();
      if (atSea) {
        // Sivri pruvalı gövde: simetrik yamuk sepete benziyordu.
        shape.moveTo(ux - radius * 0.85, uy - radius * 0.45);
        shape.lineTo(ux + radius * 0.45, uy - radius * 0.45);
        shape.lineTo(ux + radius, uy + radius * 0.1);
        shape.lineTo(ux + radius * 0.35, uy + radius * 0.6);
        shape.lineTo(ux - radius * 0.6, uy + radius * 0.6);
        shape.closePath();
      } else {
        shape.arc(ux, uy, radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = nation.color;
      ctx.fill(shape);

      // Sağ alta kalınlaşan hilal gölge: düz renk diski hacimli gösterir.
      if (!atSea) {
        const crescent = new Path2D();
        crescent.arc(ux, uy, radius, 0, Math.PI * 2);
        crescent.arc(ux - radius * 0.1, uy - radius * 0.1, radius * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fill(crescent, 'evenodd');
      }

      ctx.lineWidth = (unit === selectedUnit ? 3 : 1.5) / zoom;
      ctx.strokeStyle = unit === selectedUnit ? '#ffffff' : 'rgba(0,0,0,0.7)';
      ctx.stroke(shape);

      if (!detailed) continue;

      // NATO sembolü: harften daha okunur ve dile bağlı değil.
      const symbol = new Path2D();
      natoSymbol(symbol, unit.type.id, ux, uy, radius);
      ctx.lineWidth = Math.max(1.2 / zoom, radius * 0.13);
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.stroke(symbol);

      // Can çubuğu yalnızca hasarlıysa.
      const ratio = unit.hp / unit.type.hp;
      if (ratio < 1) {
        const w = radius * 1.8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(ux - w / 2, uy + radius + 2, w, 4);
        ctx.fillStyle = ratio > 0.5 ? '#5ed46a' : ratio > 0.25 ? '#e8c34a' : '#e05a4a';
        ctx.fillRect(ux - w / 2, uy + radius + 2, w * ratio, 4);
      }
      // Hareket hakkı bittiyse ya da emirle meşgulse soluk perde.
      if (unit.movesLeft <= 0 || unit.order) {
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill(shape);
      }
      // Emir rozeti: oyuncu hangi birimi devrettiğini bir bakışta görsün.
      if (unit.order) {
        ctx.font = `700 ${Math.round(HEX_SIZE * 0.4)}px system-ui, sans-serif`;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.lineWidth = 2.5 / zoom;
        const badge = ORDER_BADGE[unit.order.type] ?? '';
        ctx.strokeText(badge, ux + radius * 0.9, uy - radius * 0.8);
        ctx.fillText(badge, ux + radius * 0.9, uy - radius * 0.8);
      }
    }
  }

  drawHighlight(ctx, tile, color, width) {
    const path = new Path2D();
    this.hexPath(path, tile.x, tile.y);
    ctx.lineWidth = width / this.camera.zoom;
    ctx.strokeStyle = color;
    ctx.stroke(path);
  }

  /** Etiketler ekran uzayında çizilir; zoom'la büyüyüp okunmaz olmasınlar. */
  drawLabels(ctx, world) {
    const cam = this.camera;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 13px system-ui, sans-serif';
    for (const nation of world.nations) {
      if (nation.tiles === 0) continue;
      const p = cam.worldToScreen(nation.capital.x, nation.capital.y);
      if (p.x < -80 || p.y < -30 || p.x > cam.viewWidth + 80 || p.y > cam.viewHeight + 30) continue;
      // Etiket başkentin altına: üstüne yazınca şehir işaretini örtüyordu.
      const ly = p.y + Math.max(16, HEX_SIZE * cam.zoom * 0.7);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(nation.name, p.x, ly);
      ctx.fillStyle = '#fff';
      ctx.fillText(nation.name, p.x, ly);
      // Başkent bayrağı: ülkeyi renginden değil kimliğinden tanı.
      if (nation.flag) drawFlag(ctx, nation.flag, p.x - 9, ly + 8, 18, 12);
    }
    ctx.restore();
  }
}
