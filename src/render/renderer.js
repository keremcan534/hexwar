// Canvas2D hex çizimi. Görünmeyen hexler kırpılır, aynı renkler tek path'te toplanır,
// uzaklaşınca tüm dünya önceden pişirilmiş tek dokudan basılır.

import { HEX_CORNERS, SQRT3, DIRS } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { drawFlag } from './flagPainter.js';
import { maxHpOf, moraleOf, regimentCount, soldiersOf } from '../game/units.js';
import { terrainShade } from '../world/terrain.js';
import { BUILDINGS } from '../game/buildings.js';

const MAX_DPR = 2;            // mobilde 3x DPR gereksiz pahalı
const CACHE_MAX_SIDE = 2048;  // önbellek dokusunun en uzun kenarı (bellek sınırı)
const CACHE_ZOOM = 0.55;      // bu zoom altında tüm dünya önbellekten tek seferde basılır

/** Şehir ve birim aynı karede: biri yukarı, biri aşağı kaydırılır. */
const CITY_OFFSET = 0.3;
const UNIT_ON_CITY_OFFSET = 0.22;

/** Emir rozetleri; orders.js'teki ORDER değerleriyle eşleşir. */
const ORDER_BADGE = { auto: '⚙', hold: '⏸' };

/**
 * NATO harita sembolleri: piyade çapraz, süvari elips, topçu nokta.
 * Harf yerine bunlar kullanılıyor — dilden bağımsız ve uzaktan okunur.
 */
function natoSymbol(path, typeId, cx, cy, r) {
  const w = r * 0.78;
  const h = r * 0.52;
  switch (typeId) {
    case 'INFANTRY':
      path.moveTo(cx - w, cy - h);
      path.lineTo(cx + w, cy + h);
      path.moveTo(cx + w, cy - h);
      path.lineTo(cx - w, cy + h);
      break;
    case 'CAVALRY':
      path.ellipse(cx, cy, w, h, 0, 0, Math.PI * 2);
      break;
    case 'ARTILLERY':
      // Topçu simgesi tek dolu nokta: NATO'da ateş desteğinin karşılığı.
      path.ellipse(cx, cy, h * 0.55, h * 0.55, 0, 0, Math.PI * 2);
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
    this.showLabels = true;
    /** 'political' | 'terrain' | 'cultures' */
    this.mapMode = 'political';
    /** (ülke,arazi) ve (kültür,arazi) renk önbelleği; her karede yeniden hesaplanmasın. */
    this.tintCache = new Map();
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

  setMapMode(mode) {
    this.mapMode = mode;
    this.tintCache.clear();
    this.invalidateCache();
  }

  /**
   * Politik/kültür kipinde bir karenin rengi: sahibinin tonu, arazinin
   * parlaklığıyla. Karıştırma (alfa) yerine bu yöntem seçildi çünkü alfada
   * aynı ülke ormanda ve çölde iki farklı renge dönüşüyor, ayırt edilemiyordu.
   */
  ownerTint(owner, terrain) {
    const key = `${owner.id}:${terrain.id}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const shade = terrainShade(terrain);
    const light = Math.max(14, Math.min(82, owner.light * shade));
    // Doygunluğu biraz kısıyoruz: 15 ülke tam doygun olunca harita bağırıyor.
    color = `hsl(${Math.round(owner.hue)} ${Math.round(owner.sat * 0.82)}% ${Math.round(light)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /** Sahipsiz kara politik kipte soluk kalır ki sahipli topraklar öne çıksın. */
  neutralTint(terrain) {
    const key = `neutral:${terrain.id}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const l = Math.round(Math.max(20, Math.min(78, 46 * terrainShade(terrain))));
    color = `hsl(80 8% ${l}%)`;
    this.tintCache.set(key, color);
    return color;
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
      this.drawTerrain(ctx, tiles, world);
      if (this.showGrid) this.drawGrid(ctx, tiles, cam.zoom);
      if (this.mapMode !== 'terrain') this.drawBorders(ctx, world, tiles, cam.zoom);
      this.drawRoads(ctx, world, tiles, cam.zoom);
      this.lastDrawn = tiles.length;
    }

    if (state.reachable) this.drawReachable(ctx, state.reachable);
    if (state.buildingPlacement) this.drawBuildingPlacement(ctx, state.buildingPlacement);
    if (state.selected) this.drawHighlight(ctx, state.selected, '#ffffff', 3);
    if (state.hovered && state.hovered !== state.selected) {
      this.drawHighlight(ctx, state.hovered, 'rgba(255,255,255,0.45)', 2);
    }
    this.drawCities(ctx, world);
    this.drawStructures(ctx, world);
    this.drawFronts(ctx, world, state);
    this.drawMovement(ctx, world, state.selectedUnit, state.playerNation);
    this.drawUnits(ctx, world, state.selectedUnit);
    this.drawBattles(ctx, world);
    this.drawSelection(ctx, state.selection);
    ctx.restore();

    // Seçim kutusu ekran uzayında: kamera dönüşümünün dışında çizilir.
    if (state.marquee) this.drawMarquee(ctx, state.marquee);

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
    this.drawTerrain(ctx, all, world);
    if (this.mapMode !== 'terrain') this.drawBorders(ctx, world, all, scale);
    // Yollar önbelleğe de girmeli: yoksa uzaklaşınca ağ tamamen kayboluyordu.
    this.drawRoads(ctx, world, all, scale);

    this.cache = { canvas, x: b.minX, y: b.minY, w, h, scale };
    return this.cache;
  }

  /**
   * Zemin dolgusu. Kipe göre renk seçilir ama çizim tek geçişte, renge göre
   * gruplanarak yapılır (binlerce hex için tek fill çağrısı başına bir path).
   */
  drawTerrain(ctx, tiles, world) {
    const byColor = new Map();
    for (const t of tiles) {
      const color = this.tileColor(t, world);
      let path = byColor.get(color);
      if (!path) {
        path = new Path2D();
        byColor.set(color, path);
      }
      this.hexPath(path, t.x, t.y);
    }
    for (const [color, path] of byColor) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
  }

  /**
   * Kaynak kipi: kare, en çok verdiği kaynağın rengini alır; yoğunluk
   * miktarla artar. Nerede demir/kereste olduğunu görmeden genişleme kararı
   * vermek körlemesineydi.
   */
  resourceTint(tile) {
    const y = tile.terrain.yields;
    const best = [
      ['food', y.food, 96], ['timber', y.timber, 140],
      ['iron', y.iron, 205], ['gold', y.gold, 48],
    ].sort((a, b) => b[1] - a[1])[0];
    if (!best[1]) return 'hsl(210 6% 26%)';
    const key = `res:${tile.terrain.id}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const light = 26 + Math.min(3, best[1]) * 12;
    color = `hsl(${best[2]} 58% ${light}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  tileColor(tile, world) {
    if (this.mapMode === 'resources') {
      return tile.terrain.water ? 'hsl(210 30% 18%)' : this.resourceTint(tile);
    }
    // Su her kipte arazi rengiyle kalır: kimsenin toprağı değil.
    if (tile.terrain.water || this.mapMode === 'terrain') return tile.terrain.color;

    if (this.mapMode === 'cultures') {
      if (tile.culture < 0) return this.neutralTint(tile.terrain);
      return this.ownerTint(world.cultures[tile.culture], tile.terrain);
    }
    if (tile.owner < 0) return this.neutralTint(tile.terrain);
    return this.ownerTint(world.nations[tile.owner], tile.terrain);
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
    ctx.lineCap = 'round';
    // Önce koyu alt çizgi, sonra ülke rengi: benzer tonlu iki komşu birbirine
    // karışmasın. Sabit ekran kalınlığı için ölçeğe bölünür.
    ctx.lineWidth = 4.2 / scale;
    ctx.strokeStyle = 'rgba(8,12,18,0.75)';
    for (const path of byColor.values()) ctx.stroke(path);

    ctx.lineWidth = 2 / scale;
    for (const [color, path] of byColor) {
      ctx.strokeStyle = color;
      ctx.stroke(path);
    }
  }

  /** Yol ağı yakın ve orta zoomda siyasi haritanın üstünde okunur kalır. */
  drawRoads(ctx, world, tiles, scale) {
    const paths = new Map();
    const pathFor = (level) => {
      let path = paths.get(level);
      if (!path) {
        path = new Path2D();
        paths.set(level, path);
      }
      return path;
    };

    for (const tile of tiles) {
      const level = tile.roadLevel ?? 0;
      if (level <= 0 || tile.terrain.water) continue;
      let connected = false;
      for (const next of world.neighbors(tile)) {
        if ((next.roadLevel ?? 0) <= 0 || next.owner !== tile.owner) continue;
        if (next.q < tile.q || (next.q === tile.q && next.r < tile.r)) continue;
        connected = true;
        const segment = pathFor(Math.min(level, next.roadLevel));
        segment.moveTo(tile.x, tile.y);
        segment.lineTo(next.x, next.y);
      }
      if (!connected) {
        // Yalnız kare: komşusuna bağlanmamış yol. Kısa bir tire neredeyse
        // görünmüyordu; ağın ilk düğümü de okunabilir olmalı.
        const marker = pathFor(level);
        const r = HEX_SIZE * 0.16;
        marker.moveTo(tile.x - r, tile.y);
        marker.lineTo(tile.x + r, tile.y);
        marker.moveTo(tile.x, tile.y - r);
        marker.lineTo(tile.x, tile.y + r);
      }
    }

    ctx.lineCap = 'round';
    for (const [level, path] of paths) {
      ctx.lineWidth = (3.2 + level * 0.9) / scale;
      ctx.strokeStyle = 'rgba(34, 25, 17, 0.78)';
      ctx.stroke(path);
      ctx.lineWidth = (1.3 + level * 0.55) / scale;
      ctx.strokeStyle = level === 3 ? '#e8c982' : level === 2 ? '#c8a96a' : '#9a8058';
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

  /** Seçili ordular: altın çember. Çoklu seçimde hepsi işaretlenir. */
  drawSelection(ctx, selection) {
    if (!selection?.length) return;
    const zoom = this.camera.zoom;
    ctx.lineWidth = 3 / zoom;
    ctx.strokeStyle = '#e5ca84';
    for (const unit of selection) {
      if (!unit?.tile) continue;
      ctx.beginPath();
      ctx.arc(unit.tile.x, unit.tile.y, HEX_SIZE * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Sürüklenen seçim kutusu (masaüstünde klasör seçer gibi). */
  drawMarquee(ctx, rect) {
    if (rect.w < 2 && rect.h < 2) return;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = 'rgba(229, 202, 132, 0.12)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(229, 202, 132, 0.9)';
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w, rect.h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  /**
   * Cephe hatları. Taarruz hattı kırmızı, savunma hattı mavi; etkin plan kalın
   * ve dolu, hazırlık aşamasındaki plan kesikli çizilir. Sürüklenirken oluşan
   * geçici hat da aynı yerde, sarı olarak gösterilir.
   */
  drawFronts(ctx, world, state) {
    const zoom = this.camera.zoom;
    const fronts = world.frontSystem?.fronts ?? [];

    for (const front of fronts) {
      if (front.nationId !== state.playerNation) continue;
      const tiles = front.tiles
        .map((point) => world.get(point.q, point.r))
        .filter(Boolean);
      if (tiles.length < 2) continue;
      const attack = front.plan === 'advance';
      const selected = state.selectedFront?.id === front.id;

      ctx.beginPath();
      ctx.moveTo(tiles[0].x, tiles[0].y);
      for (const tile of tiles.slice(1)) ctx.lineTo(tile.x, tile.y);
      ctx.lineWidth = (selected ? 6 : 4) / zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = attack ? 'rgba(214, 96, 84, 0.92)' : 'rgba(101, 169, 207, 0.92)';
      ctx.setLineDash(front.active ? [] : [9 / zoom, 6 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hazırlık göstergesi: hattın her ucunda planlama oranı kadar dolu nokta.
      const ready = Math.max(0, Math.min(1, front.planning ?? 0));
      for (const tile of [tiles[0], tiles[tiles.length - 1]]) {
        ctx.beginPath();
        ctx.arc(tile.x, tile.y, HEX_SIZE * 0.26, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
        ctx.lineWidth = 4 / zoom;
        ctx.strokeStyle = ready >= 1 ? '#e5ca84' : 'rgba(229, 202, 132, 0.6)';
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    const draw = state.frontDraw;
    if (draw?.tiles?.length > 1) {
      ctx.beginPath();
      ctx.moveTo(draw.tiles[0].x, draw.tiles[0].y);
      for (const tile of draw.tiles.slice(1)) ctx.lineTo(tile.x, tile.y);
      ctx.lineWidth = 5 / zoom;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(229, 202, 132, 0.95)';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
  }

  /**
   * Yürüyüş hatları. Ordu artık haftalar boyunca yol alıyor; oyuncunun nereye
   * gittiğini görmesi şart. Seçili ordunun yolu parlak, diğerleri soluk çizilir.
   */
  drawMovement(ctx, world, selectedUnit, playerNation) {
    const zoom = this.camera.zoom;

    // Toplanma noktası: yeni alayların yürüdüğü yer. Yürüyüş hatlarıyla aynı
    // katmanda çizilir ki oyuncu ordusunun nereye aktığını tek bakışta görsün.
    const rally = world.nations?.[playerNation]?.rallyPoint;
    const rallyTile = rally ? world.get(rally.q, rally.r) : null;
    if (rallyTile) {
      ctx.lineWidth = 2.5 / zoom;
      ctx.strokeStyle = 'rgba(197, 164, 93, 0.95)';
      ctx.beginPath();
      ctx.arc(rallyTile.x, rallyTile.y, HEX_SIZE * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(rallyTile.x, rallyTile.y - HEX_SIZE * 0.42);
      ctx.lineTo(rallyTile.x, rallyTile.y + HEX_SIZE * 0.42);
      ctx.moveTo(rallyTile.x - HEX_SIZE * 0.42, rallyTile.y);
      ctx.lineTo(rallyTile.x + HEX_SIZE * 0.42, rallyTile.y);
      ctx.stroke();
    }

    for (const unit of world.units) {
      if (!unit.path?.length || unit.nationId !== playerNation) continue;
      const active = unit === selectedUnit;
      ctx.beginPath();
      ctx.moveTo(unit.tile.x, unit.tile.y);
      for (const tile of unit.path) ctx.lineTo(tile.x, tile.y);
      ctx.lineWidth = (active ? 3 : 2) / zoom;
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hedef işareti: yolun sonunda içi boş halka.
      const end = unit.path[unit.path.length - 1];
      ctx.beginPath();
      ctx.arc(end.x, end.y, HEX_SIZE * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
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
      const ratio = unit.hp / maxHpOf(unit);
      if (ratio < 1) {
        const w = radius * 1.8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(ux - w / 2, uy + radius + 2, w, 4);
        ctx.fillStyle = ratio > 0.5 ? '#5ed46a' : ratio > 0.25 ? '#e8c34a' : '#e05a4a';
        ctx.fillRect(ux - w / 2, uy + radius + 2, w * ratio, 4);
      }
      // Emirle meşgulse soluk perde: oyuncunun ilgilenmesi gereken ordu öne çıksın.
      if (unit.order) {
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

      // Ordu yığını: province üzerindeki gerçek asker sayısı ve alay adedi.
      ctx.font = `800 ${Math.round(HEX_SIZE * 0.3)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = 2.5 / zoom;
      const stackLabel = soldiersOf(unit) >= 1000
        ? `${(soldiersOf(unit) / 1000).toFixed(1)}K`
        : String(soldiersOf(unit));
      ctx.strokeText(stackLabel, ux, uy + radius * 0.78);
      ctx.fillText(stackLabel, ux, uy + radius * 0.78);
    }
  }

  drawBuildingPlacement(ctx, placement) {
    const path = new Path2D();
    for (const tile of placement.tiles.keys()) this.hexPath(path, tile.x, tile.y);
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = '#58c3a5';
    ctx.fill(path);
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2 / this.camera.zoom;
    ctx.strokeStyle = 'rgba(119,255,213,0.85)';
    ctx.stroke(path);
  }

  /** Province'e fiziksel olarak yerleştirilen ulusal binalar. */
  drawStructures(ctx, world) {
    const rect = this.camera.visibleRect(HEX_SIZE * 2);
    const zoom = this.camera.zoom;
    for (const tile of world.tiles) {
      const building = BUILDINGS[tile.structure?.buildingId];
      if (!building) continue;
      if (tile.x < rect.minX || tile.x > rect.maxX || tile.y < rect.minY || tile.y > rect.maxY) continue;
      const x = tile.x + HEX_SIZE * 0.28;
      const y = tile.y - HEX_SIZE * 0.28;
      const size = HEX_SIZE * 0.34;
      ctx.fillStyle = 'rgba(5,15,22,0.9)';
      ctx.fillRect(x - size, y - size, size * 2, size * 2);
      ctx.strokeStyle = 'rgba(218,235,225,0.8)';
      ctx.lineWidth = 1.4 / zoom;
      ctx.strokeRect(x - size, y - size, size * 2, size * 2);
      ctx.font = `${Math.round(HEX_SIZE * 0.38)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(building.icon ?? '◆', x, y);
    }
  }

  /** Province muharebesi: çatışma yerinde iki ordunun asker ve moral durumu. */
  drawBattles(ctx, world) {
    const battles = world.battleSystem?.battles;
    if (!battles?.length) return;
    const zoom = this.camera.zoom;
    const rect = this.camera.visibleRect(HEX_SIZE * 3);

    for (const battle of battles) {
      const tile = world.get(battle.q, battle.r);
      if (!tile) continue;
      const x = tile.x;
      const y = tile.y - HEX_SIZE * 0.8;
      if (x < rect.minX || x > rect.maxX || y < rect.minY || y > rect.maxY) continue;

      const attacker = world.units.find((army) => army.id === battle.attackerId);
      const defender = world.units.find((army) => army.id === battle.defenderId);
      const width = 88 / zoom;
      const height = 28 / zoom;
      const half = width / 2;
      ctx.fillStyle = world.nations[battle.attackerNation].color;
      ctx.fillRect(x - half, y - height / 2, half, height);
      ctx.fillStyle = world.nations[battle.defenderNation].color;
      ctx.fillRect(x, y - height / 2, half, height);
      ctx.lineWidth = 2 / zoom;
      ctx.strokeStyle = 'rgba(5,10,14,0.9)';
      ctx.strokeRect(x - half, y - height / 2, width, height);

      ctx.font = `700 ${10 / zoom}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 3 / zoom;
      const a = attacker ? `${(soldiersOf(attacker) / 1000).toFixed(1)}K` : '0';
      const d = defender ? `${(soldiersOf(defender) / 1000).toFixed(1)}K` : '0';
      ctx.fillText(`${a}  ⚔  ${d}`, x, y);
      ctx.shadowBlur = 0;

      const aMorale = attacker ? moraleOf(attacker) : 0;
      const dMorale = defender ? moraleOf(defender) : 0;
      const moraleTotal = Math.max(1, aMorale + dMorale);
      const markerX = x - half + (aMorale / moraleTotal) * width;
      ctx.fillStyle = '#f5d58c';
      ctx.fillRect(markerX - 1.5 / zoom, y - height / 2 - 4 / zoom, 3 / zoom, height + 8 / zoom);
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
