// TEKRAR HARİTASI — dünyanın küçük, hızlı, siyasi resmi.
//
// Oyunun haritası bir kampanyayı ayda bir kez baştan çizmek için fazla ağırdır
// ve kamerayla, seçimle, birimlerle iç içedir. Burada dünya bir kez piksel →
// province tablosuna indirilir; her kare yalnız tablodan renk okur (1280×720'de
// birkaç ms). Sınır çizgileri de önceden listelenmiş piksel çiftlerinden gelir.
//
// Tuval tek boyutludur: video da ekran da aynı resmi gösterir.

import { SQRT3 } from '../core/hex.js';

const SEA_TOP = '#10293a';
const SEA_BOTTOM = '#0a1a26';
const UNOWNED_RGB = [128, 124, 108];
const BORDER_RGB = [12, 15, 16];
const FLASH_RGB = [255, 244, 214];

/** Ekranın baytları little-endian ABGR yazılır. */
const abgr = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;

function hslToRgb(hue, sat, light) {
  const s = sat / 100;
  const l = light / 100;
  const k = (n) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}

function nationRgb(nation) {
  if (Number.isFinite(nation?.hue)) return hslToRgb(nation.hue, nation.sat ?? 40, nation.light ?? 50);
  const match = /hsl\((\d+)[ ,]+(\d+)%[ ,]+(\d+)%/.exec(nation?.color ?? '');
  return match ? hslToRgb(+match[1], +match[2], +match[3]) : UNOWNED_RGB;
}

/** Arazinin gölgesi (siyah örtü): dağ koyu, ova açık. */
const TERRAIN_SHADE = {
  MOUNTAIN: 0.3, SNOW_PEAK: 0.12, HILLS: 0.15, FOREST: 0.09, JUNGLE: 0.11,
  TUNDRA: 0.04, ICE: 0.02, DESERT: 0.02,
};

function makeCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/** En az karası olan sütun: sarmal dünyanın dikişi okyanusa düşsün. */
function seamColumn(world) {
  const land = new Int32Array(world.cols);
  world.forEach((tile) => { if (!tile.terrain.water) land[tile.col] += 1; });
  let best = 0;
  for (let col = 1; col < world.cols; col++) if (land[col] < land[best]) best = col;
  return best;
}

export class ReplayMap {
  /** @param {object} world @param {number} width tuval eni @param {number} height harita yüksekliği sınırı */
  constructor(world, width, height) {
    this.world = world;
    this.width = width;
    const hex = world.wrapWidth / (world.cols * SQRT3);
    const worldHeight = (world.rows - 1) * 1.5 * hex + 2 * hex;
    this.scale = Math.min(width / world.wrapWidth, height / worldHeight);
    this.mapWidth = world.wrapWidth * this.scale;
    this.height = Math.round(worldHeight * this.scale);
    this.left = (width - this.mapWidth) / 2;
    this.hex = hex;
    this.seamX = (seamColumn(world) - 0.5) * SQRT3 * hex;

    const count = world.provinces.length;
    this.count = count;
    this.SEA = count;
    this.LAND = count + 1;
    this.palette = new Uint32Array(count + 2);
    this.palette[this.LAND] = abgr(...UNOWNED_RGB);
    this.nationColors = world.nations.map((nation) => nationRgb(nation));

    this.centerX = new Float32Array(count);
    this.centerY = new Float32Array(count);
    this.weight = new Uint16Array(count);
    world.provinces.forEach((province, id) => {
      const tile = province.center ?? world.tiles[province.tileIdx[0]];
      const at = this.project(tile);
      this.centerX[id] = at.x;
      this.centerY[id] = at.y;
      this.weight[id] = province.tileIdx.length;
    });

    this.buildRaster();
    this.layer = makeCanvas(width, this.height);
    this.layerCtx = this.layer.getContext('2d');
    this.image = this.layerCtx.createImageData(width, this.height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.bakeBackdrop();
  }

  /** Dünya karesinin tuvaldeki yeri (dikişe göre sarılmış). */
  project(tile) {
    const span = this.world.wrapWidth;
    const x = (((tile.x - this.seamX) % span) + span) % span;
    return { x: this.left + x * this.scale, y: (tile.y + this.hex) * this.scale };
  }

  /** Piksel → province tablosu ve ülke sınırı adayı piksel çiftleri. */
  buildRaster() {
    const { world, width, height, scale, left, hex, seamX, SEA, LAND } = this;
    const { cols, rows } = world;
    const ofTile = new Uint16Array(world.tiles.length).fill(SEA);
    world.forEach((tile, index) => { if (!tile.terrain.water) ofTile[index] = LAND; });
    world.provinces.forEach((province, id) => {
      for (const index of province.tileIdx) ofTile[index] = id;
    });

    const raster = new Uint16Array(width * height);
    const tileAt = new Int32Array(width * height).fill(-1);
    const unitX = 1 / (SQRT3 * hex);
    const unitR = 2 / (3 * hex);
    for (let py = 0, at = 0; py < height; py++) {
      const wy = (py + 0.5) / scale - hex;
      const fr = wy * unitR;
      for (let px = 0; px < width; px++, at++) {
        raster[at] = SEA;
        const mapped = (px + 0.5 - left) / scale;
        if (mapped < 0 || mapped >= world.wrapWidth) continue;
        const fq = (mapped + seamX) * unitX - fr / 2;
        // Küp yuvarlama, nesne ayırmadan: bu döngü bir milyona yakın kez döner.
        let q = Math.round(fq);
        let r = Math.round(fr);
        const s = Math.round(-fq - fr);
        const dq = Math.abs(q - fq);
        const dr = Math.abs(r - fr);
        const ds = Math.abs(s + fq + fr);
        if (dq > dr && dq > ds) q = -r - s;
        else if (dr > ds) r = -q - s;
        if (r < 0 || r >= rows) continue;
        const col = (((q + ((r - (r & 1)) >> 1)) % cols) + cols) % cols;
        const index = r * cols + col;
        raster[at] = ofTile[index];
        tileAt[at] = index;
      }
    }
    this.raster = raster;
    this.tileAt = tileAt;

    const isProvince = (value) => value < SEA;
    let edges = 0;
    const scan = (visit) => {
      for (let py = 0, at = 0; py < height; py++) {
        for (let px = 0; px < width; px++, at++) {
          const here = raster[at];
          if (!isProvince(here)) continue;
          if (px + 1 < width && raster[at + 1] !== here && isProvince(raster[at + 1])) visit(at, here, raster[at + 1]);
          if (py + 1 < height && raster[at + width] !== here && isProvince(raster[at + width])) visit(at, here, raster[at + width]);
        }
      }
    };
    scan(() => { edges++; });
    this.edgeAt = new Int32Array(edges);
    this.edgeA = new Uint16Array(edges);
    this.edgeB = new Uint16Array(edges);
    let cursor = 0;
    scan((at, a, b) => {
      this.edgeAt[cursor] = at;
      this.edgeA[cursor] = a;
      this.edgeB[cursor] = b;
      cursor++;
    });
  }

  /** Değişmeyen katmanlar: deniz + kıyı ışığı (alt), kabartma + kıyı çizgisi (üst). */
  bakeBackdrop() {
    const { width, height, raster, SEA, world, left, mapWidth } = this;
    const mask = makeCanvas(width, height);
    const maskCtx = mask.getContext('2d');
    const maskImage = maskCtx.createImageData(width, height);
    const maskPixels = new Uint32Array(maskImage.data.buffer);
    const coast = makeCanvas(width, height);
    const coastCtx = coast.getContext('2d');
    const coastImage = coastCtx.createImageData(width, height);
    const coastPixels = new Uint32Array(coastImage.data.buffer);
    const glow = abgr(130, 196, 204);
    const line = ((150 << 24) | (20 << 16) | (24 << 8) | 16) >>> 0;
    for (let py = 0, at = 0; py < height; py++) {
      for (let px = 0; px < width; px++, at++) {
        if (raster[at] === SEA) continue;
        maskPixels[at] = glow;
        const shore = (px > 0 && raster[at - 1] === SEA) || (px + 1 < width && raster[at + 1] === SEA)
          || (py > 0 && raster[at - width] === SEA) || (py + 1 < height && raster[at + width] === SEA);
        if (shore) coastPixels[at] = line;
      }
    }
    maskCtx.putImageData(maskImage, 0, 0);
    coastCtx.putImageData(coastImage, 0, 0);

    const back = makeCanvas(width, height);
    const ctx = back.getContext('2d');
    const sea = ctx.createLinearGradient(0, 0, 0, height);
    sea.addColorStop(0, SEA_TOP);
    sea.addColorStop(1, SEA_BOTTOM);
    ctx.fillStyle = sea;
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.filter = 'blur(7px)';
    ctx.globalAlpha = 0.4;
    ctx.drawImage(mask, 0, 0);
    ctx.restore();
    this.back = back;

    // Kabartma kare çözünürlüğünde çizilip büyütülür: yumuşatma hex köşelerini
    // siler, geriye yalnız dağların gölgesi kalır.
    const small = makeCanvas(world.cols, world.rows);
    const smallCtx = small.getContext('2d');
    const smallImage = smallCtx.createImageData(world.cols, world.rows);
    world.forEach((tile, index) => {
      if (tile.terrain.water) return;
      smallImage.data[index * 4 + 3] = Math.round((TERRAIN_SHADE[tile.terrain.id] ?? 0) * 255);
    });
    smallCtx.putImageData(smallImage, 0, 0);
    const relief = makeCanvas(width, height);
    const reliefCtx = relief.getContext('2d');
    reliefCtx.imageSmoothingEnabled = true;
    reliefCtx.imageSmoothingQuality = 'high';
    const cell = mapWidth / world.cols;
    const shift = left - seamColumn(world) * cell;
    for (const offset of [0, mapWidth]) {
      reliefCtx.drawImage(small, shift + offset, 0, mapWidth, height);
    }
    reliefCtx.globalCompositeOperation = 'destination-in';
    reliefCtx.drawImage(mask, 0, 0);
    reliefCtx.globalCompositeOperation = 'source-over';
    reliefCtx.drawImage(coast, 0, 0);
    this.relief = relief;
  }

  /**
   * Karenin siyasi katmanını kurar.
   * @param {Int16Array} row province → sahip
   * @param {Float32Array|null} heat yeni el değiştiren province'lerin parlaklığı 0..1
   */
  paint(row, heat = null) {
    const { palette, nationColors, count, raster, pixels, edgeAt, edgeA, edgeB } = this;
    for (let id = 0; id < count; id++) {
      const owner = row[id];
      const rgb = owner >= 0 ? (nationColors[owner] ?? UNOWNED_RGB) : UNOWNED_RGB;
      const glow = heat ? heat[id] * 0.62 : 0;
      palette[id] = glow > 0.01
        ? abgr(
          Math.round(rgb[0] + (FLASH_RGB[0] - rgb[0]) * glow),
          Math.round(rgb[1] + (FLASH_RGB[1] - rgb[1]) * glow),
          Math.round(rgb[2] + (FLASH_RGB[2] - rgb[2]) * glow),
        )
        : abgr(rgb[0], rgb[1], rgb[2]);
    }
    for (let at = 0; at < raster.length; at++) pixels[at] = palette[raster[at]];
    const border = abgr(...BORDER_RGB);
    for (let i = 0; i < edgeAt.length; i++) {
      if (row[edgeA[i]] !== row[edgeB[i]]) pixels[edgeAt[i]] = border;
    }
    this.layerCtx.putImageData(this.image, 0, 0);
  }

  /** Son boyanan kareyi hedef tuvale basar. */
  draw(ctx) {
    ctx.drawImage(this.back, 0, 0);
    ctx.drawImage(this.layer, 0, 0);
    ctx.drawImage(this.relief, 0, 0);
  }

  /**
   * Ulusların ad yerleri: her ulusun EN BÜYÜK bitişik toprağının ağırlık
   * merkezi. Dağınık imparatorluğun ortalaması başka ülkenin üstüne düşerdi.
   * @returns {Array<{id:number, x:number, y:number, tiles:number}>} büyükten küçüğe
   */
  anchors(row, limit, always = -1) {
    const { world, count, centerX, centerY, weight, mapWidth, left } = this;
    const groups = new Map();
    for (let id = 0; id < count; id++) {
      const owner = row[id];
      if (owner < 0) continue;
      let group = groups.get(owner);
      if (!group) {
        group = { id: owner, tiles: 0, members: [] };
        groups.set(owner, group);
      }
      group.tiles += weight[id];
      group.members.push(id);
    }
    const ranked = [...groups.values()].sort((a, b) => b.tiles - a.tiles || a.id - b.id);
    const chosen = ranked.slice(0, limit);
    const mine = groups.get(always);
    if (mine && !chosen.includes(mine)) chosen.push(mine);

    const seen = new Uint8Array(count);
    return chosen.map((group) => {
      let best = null;
      for (const start of group.members) {
        if (seen[start]) continue;
        const blob = [start];
        seen[start] = 1;
        let tiles = 0;
        for (let head = 0; head < blob.length; head++) {
          const id = blob[head];
          tiles += weight[id];
          for (const near of world.provinces[id].neighbors ?? []) {
            if (near < count && !seen[near] && row[near] === group.id) {
              seen[near] = 1;
              blob.push(near);
            }
          }
        }
        if (!best || tiles > best.tiles) best = { blob, tiles };
      }
      // Dikişi aşan toprak: konumlar ilk üyeye göre açılır, sonra geri sarılır.
      const originX = centerX[best.blob[0]];
      let sumX = 0;
      let sumY = 0;
      for (const id of best.blob) {
        let dx = centerX[id] - originX;
        if (dx > mapWidth / 2) dx -= mapWidth;
        else if (dx < -mapWidth / 2) dx += mapWidth;
        sumX += dx * weight[id];
        sumY += centerY[id] * weight[id];
      }
      let x = originX + sumX / best.tiles;
      if (x < left) x += mapWidth;
      else if (x > left + mapWidth) x -= mapWidth;
      return { id: group.id, x, y: sumY / best.tiles, tiles: group.tiles };
    });
  }
}
