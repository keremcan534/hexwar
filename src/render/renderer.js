// Canvas2D hex çizimi. Görünmeyen hexler kırpılır, aynı renkler tek path'te toplanır,
// uzaklaşınca tüm dünya önceden pişirilmiş tek dokudan basılır.

import { HEX_CORNERS, SQRT3, DIRS, wrapCol } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { drawFlag } from './flagPainter.js';
import { maxHpOf, organizationOf, soldiersOf, unitsOn } from '../game/units.js';
import { terrainShade } from '../world/terrain.js';
import { constructionAtlas } from '../game/construction.js';
import { RGO_TYPES } from '../game/provinces.js';
import { controllerOf, isOccupied } from '../game/control.js';
import { materials } from './textures.js';
import { WaterLayer } from './water.js';

const MAX_DPR = 2;            // mobilde 3x DPR gereksiz pahalı
/**
 * Sarmal periyodunun sol kenarı: 0. kolonun çift satır hexinin sol ucu.
 * Kopya bantları, önbellek dokusu ve k indeksleri hep bu orijine hizalanır;
 * farklı orijinler kullanılırsa aradaki şerit hiçbir kopyaya düşmez.
 */
const WRAP_X0 = -(SQRT3 * HEX_SIZE) / 2;
/**
 * Önbellek dokusunun en uzun kenarı. 200x160 dünyada periyot ~9000 birim;
 * 2048 uzak zoomu fazla bulanıklaştırıyordu. 3072 RGBA ~27 MB — alloc
 * başarısız olursa buildCache 2048'e geri düşer.
 */
const CACHE_MAX_SIDE = 3072;
const CACHE_FALLBACK_SIDE = 2048;
/**
 * Önbellek dokusunun her iki yanındaki yaka (piksel). Kopyalar piksel hizalı
 * bantlarla kırpılırken drawImage kenarı kesirli kalır; kenar pikselindeki
 * örtülmeyen kesir arka planı gösterip dikişte koyu çizgi bırakıyordu.
 * Yaka, kırpma sınırını görüntünün İÇİNE taşır: 4 px, en güçlü küçültmede
 * bile 2+ hedef piksellik pay bırakır.
 */
const CACHE_COLLAR = 4;
/**
 * Bu zoom altında tüm dünya önbellekten tek seferde basılır. 0.55'ten 0.45'e:
 * büyük haritada önbellek ölçeği düştü, 0.55'te büyütme bulanıklığı görünür
 * oluyordu; 0.45'te yakın dal telefonda ~1000 hex çizer, hala bütçede.
 */
export const CACHE_ZOOM = 0.45;
/**
 * Hex ızgarasının görünmeye başladığı zoom. CACHE_ZOOM 0.55'ten 0.45'e
 * inince yakın dal 0.45-0.55 bandını da çizer oldu; ızgara o bantta hem
 * kare bütçesini aşıyor (3k+ hex stroke) hem de uzak görünümle (ızgarasız
 * önbellek) arasında görsel sıçrama yaratıyordu. Eski eşik korunur.
 */
const GRID_MIN_ZOOM = 0.55;
/** Tek `Path2D`ye eklenecek azami hex sayısı (bkz. chunkedHexPaths). */
const PATH_CHUNK = 64;
/**
 * Dolgu için parça boyu. Stroke'tan büyük tutulur: aynı renkteki komşu hexler
 * ayrı `fill` çağrılarına bölünürse paylaştıkları kenarda kenar yumuşatma iki
 * kez uygulanır ve ince bir dikiş kalır. 256'da deniz gibi geniş tek renkli
 * alanlar birkaç parçaya bölünür, dikiş sayısı görünmeyecek kadar az kalır.
 */
const FILL_CHUNK = 256;
/**
 * Siyasi/kültür kipinde arazi gölgesinin ağırlığı (0 = arazi hiç etkilemez,
 * 1 = ham TERRAIN_SHADE). Ham değerle bir ülkenin toprağı içinde parlaklık
 * 24 puan yayılıyordu; 0.22 ile yayılım ~8 puana iner ve ülke tek renk okunur.
 * Arazi dokusu kaybolmaz, yalnız kimliğin önüne geçmez.
 */
const POLITICAL_TERRAIN_WEIGHT = 0.22;

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

function roundedRectPath(path, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  path.moveTo(x + r, y);
  path.lineTo(x + width - r, y);
  path.quadraticCurveTo(x + width, y, x + width, y + r);
  path.lineTo(x + width, y + height - r);
  path.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  path.lineTo(x + r, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - r);
  path.lineTo(x, y + r);
  path.quadraticCurveTo(x, y, x + r, y);
  path.closePath();
  return path;
}

function compactSoldiers(unit) {
  const soldiers = soldiersOf(unit);
  if (soldiers >= 1000) return `${(soldiers / 1000).toFixed(1)}K`;
  return String(soldiers);
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.dpr = 1;
    this.showGrid = true;
    this.showLabels = true;
    /** 'political' | 'terrain' | 'cultures' | 'resources' | 'population' | 'construction' */
    this.mapMode = 'political';
    this.constructionNation = -1;
    this.constructionCache = null;
    /** (ülke,arazi) ve (kültür,arazi) renk önbelleği; her karede yeniden hesaplanmasın. */
    this.tintCache = new Map();
    this.corners = HEX_CORNERS.map(([x, y]) => [x * HEX_SIZE, y * HEX_SIZE]);
    this.cache = null;
    this.lastDrawn = 0;
    // Deniz yüzeyi ayrı bir katman nesnesidir: dokular, kıyı topolojisi ve
    // yerel bozulmalar orada yaşar (bkz. water.js).
    this.water = new WaterLayer();
    this.waterTime = 0;
  }

  /**
   * Su animasyonu yalnız coğrafi kiplerde çizilir. İnşaat/barış gibi kipler
   * haritayı bir seçim yüzeyine çevirir; orada kıpırdayan deniz dikkat
   * dağıtır ve animasyon zinciri kendiliğinden durur.
   */
  waterAnimatedMode() {
    return this.mapMode === 'political' || this.mapMode === 'terrain' || this.mapMode === 'cultures';
  }

  /** Game bir sonraki animasyon karesini zamanlasın mı (bkz. Game.scheduleWaterFrame). */
  waterActive() {
    return this.water.animatedThisFrame || this.water.disturbances.length > 0;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.camera.setViewport(rect.width, rect.height);
  }

  /**
   * Dünya ya da katman ayarları değişince önbellek geçersizleşir.
   *
   * Ton önbelleği de burada düşer. Anahtarı `sahipId:arazi:kademe` — yeni bir
   * dünyada ülke id'leri aynı ama renkleri bambaşka, dolayısıyla eski girdiler
   * yeni ülkelere yanlış rengi veriyordu: tek ülkenin toprağı iki ayrı tonda
   * çiziliyordu (ölçüldü: 15 ülkenin hepsi hatalı, en kötüsü 165° sapma).
   * Yeniden kurma maliyeti önemsiz — ülke × arazi × kademe, birkaç yüz girdi.
   */
  invalidateCache() {
    this.cache = null;
    this.constructionCache = null;
    this.tintCache.clear();
    this.dirtyTiles?.clear();
  }

  /**
   * Nokta geçersizleme: sahiplik/işgal değişen kareler tam pişirme yerine
   * önbelleğe yerinde boyanır. Savaş haftalarında invalidateCache fırtınası
   * 32k hexlik dünyayı haftada onlarca kez baştan pişiriyordu; artık yalnız
   * değişen kareler (+1 komşu halkası) yeniden mürekkeplenir.
   */
  invalidateTiles(tiles) {
    // Önbellek yoksa iş yok: ilk uzak-zoom karesi zaten taze pişirir.
    if (!this.cache) return;
    this.dirtyTiles ??= new Set();
    for (const tile of tiles) this.dirtyTiles.add(tile);
    // Küme büyüdüyse (toplu ilhak, çökme) tam pişirme daha ucuz.
    if (this.dirtyTiles.size > 512) this.invalidateCache();
  }

  /** Kirli kareleri önbellek dokusuna yerinde boyar (bkz. invalidateTiles). */
  repaintTiles(world) {
    const cache = this.cache;
    const dirty = this.dirtyTiles;
    if (!cache || !dirty?.size) return;
    // Sınır mürekkebi komşuya taşar: +1 halka birlikte boyanır.
    const affected = new Set();
    for (const tile of dirty) {
      affected.add(tile);
      for (const n of world.neighbors(tile)) affected.add(n);
    }
    dirty.clear();
    const P = world.wrapWidth;
    const list = [];
    for (const tile of affected) {
      list.push(tile);
      // Dikişe yakın kareler yakalı dokunun iki ucunda da yaşar.
      if (tile.col <= 2) list.push({ ...tile, x: tile.x + P, ghostOf: tile });
      if (tile.col >= world.cols - 3) list.push({ ...tile, x: tile.x - P, ghostOf: tile });
    }
    const ctx = cache.canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(CACHE_COLLAR, 0);
    ctx.scale(cache.scale, cache.scale);
    ctx.translate(-cache.x, -world.bounds.minY);
    const clip = new Path2D();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const tile of list) {
      this.hexPath(clip, tile.x, tile.y);
      if (tile.x < minX) minX = tile.x;
      if (tile.x > maxX) maxX = tile.x;
      if (tile.y < minY) minY = tile.y;
      if (tile.y > maxY) maxY = tile.y;
    }
    ctx.clip(clip);
    // Eski mürekkep tamamen silinir: işgal taraması gibi yarı saydam katmanlar
    // üst üste binip koyulaşmasın. Temizlik karmaşık kırpmayla kesiştiği için
    // tüm doku yerine yalnız etkilenen karelerin kutusu silinir (ölçüldü:
    // tam genişlik 60 karelik kirli kümede ~1 sn, kutu ~milisaniyeler).
    ctx.clearRect(
      minX - HEX_SIZE * 2, minY - HEX_SIZE * 2,
      (maxX - minX) + HEX_SIZE * 4, (maxY - minY) + HEX_SIZE * 4,
    );
    this.drawTerrain(ctx, list, world, true);
    if (this.mapMode === 'political') this.drawOccupationOverlay(ctx, world, list, cache.scale);
    if (this.mapMode === 'construction') this.drawConstructionOverlay(ctx, world, list, cache.scale);
    if (this.mapMode !== 'terrain') this.drawBorders(ctx, world, list, cache.scale);
    ctx.restore();
  }

  setMapMode(mode) {
    this.mapMode = mode;
    this.tintCache.clear();
    this.invalidateCache();
  }

  setConstructionMode(nationId) {
    this.constructionNation = nationId;
    this.setMapMode('construction');
  }

  /**
   * Baris masasi kipi. Karsi tarafin topragi kirmizi, secilenler yesil yanar;
   * kendi verdigin topraklar turuncu. Construction kipiyle ayni kalip: harita
   * bir secim yuzeyine doner.
   */
  setPeaceMode(nationId, targetId, selection) {
    this.peaceNation = nationId;
    this.peaceTarget = targetId;
    this.peaceSelection = selection ?? { demands: new Set(), concessions: new Set() };
    this.setMapMode('peace');
  }

  updatePeaceSelection(selection) {
    this.peaceSelection = selection;
    this.tintCache.clear();
    this.invalidateCache();
  }

  constructionData(world) {
    if (this.constructionCache?.world === world
      && this.constructionCache?.nationId === this.constructionNation) {
      return this.constructionCache.atlas;
    }
    const atlas = constructionAtlas(world, this.constructionNation);
    this.constructionCache = { world, nationId: this.constructionNation, atlas };
    return atlas;
  }

  /**
   * Politik/kültür kipinde bir karenin rengi: sahibinin tonu, arazinin
   * parlaklığıyla. Karıştırma (alfa) yerine bu yöntem seçildi çünkü alfada
   * aynı ülke ormanda ve çölde iki farklı renge dönüşüyor, ayırt edilemiyordu.
   */
  /**
   * Ülke renginin mineral karşılığı. Genel bir doygunluk kısma yerine ton
   * bazlı dönüşüm: parlak yeşil zeytine, mor mürdüme, turkuaz oksitlenmiş
   * bakıra, kırmızı demir oksite, sarı hardala gider. Uluslar arası kontrast
   * korunur, ama hiçbiri dijital görünmez.
   */
  mineralize(hue, sat, light) {
    const h = ((hue % 360) + 360) % 360;
    // Ton başına doygunluk tavanı: yeşil ve turkuaz gözde en baskın
    // ailelerdir, en çok onlar kısılır; kırmızı-toprak aralığı korunur.
    let ceiling;
    if (h < 20 || h >= 340) ceiling = 34;        // kiremit / demir oksit
    else if (h < 50) ceiling = 32;               // hardal, eski altın
    else if (h < 95) ceiling = 26;               // zeytin
    else if (h < 165) ceiling = 22;              // orman yeşili
    else if (h < 200) ceiling = 24;              // oksitlenmiş bakır
    else if (h < 260) ceiling = 26;              // arduvaz mavisi
    else if (h < 320) ceiling = 24;              // soluk erik
    else ceiling = 30;                           // gül kurusu
    // Sıcak toprak eksenine doğru hafif çekiş: saf turkuaz ve saf mor
    // haritada dijital duruyordu.
    const warmPull = h > 150 && h < 300 ? -6 : 2;
    return {
      hue: (h + warmPull + 360) % 360,
      sat: Math.min(sat, ceiling),
      light,
    };
  }

  ownerTint(owner, terrain, tile = null) {
    // Province başına çok küçük, deterministik ton sapması. Amaç yamalı bir
    // görünüm değil: aynı ülkenin komşu province'leri arasında ±%3 parlaklık
    // ve ±%2 doygunluk farkı, baskı mürekkebinin eşit olmayan yoğunluğunu
    // taklit eder. Sapma az sayıda kademeye yuvarlanır ki renk önbelleği
    // province sayısı kadar büyümesin.
    const step = tile ? this.provinceStep(tile) : 0;
    const key = `${owner.id}:${terrain.id}:${step}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    // Arazi gölgesi 1'e doğru sıkıştırılır. Ham TERRAIN_SHADE 0.68–1.34
    // aralığında, yani iki kat: ülkenin parlaklığıyla çarpılınca aynı ülke
    // dağda %40, karda %66 çıkıyordu (ölçüldü) ve tek ülke birkaç ayrı ülke
    // gibi okunuyordu. Siyasi haritada asıl bilgi kimin toprağı olduğudur;
    // arazi yalnız dokuyu verir, kimliği ezmez.
    const shade = 1 + (terrainShade(terrain) - 1) * POLITICAL_TERRAIN_WEIGHT;
    const base = this.mineralize(owner.hue, owner.sat * 0.62, owner.light * shade * 0.88);
    const light = Math.max(12, Math.min(66, base.light + step * 1.5));
    const sat = Math.max(6, base.sat + step * 0.8);
    color = `hsl(${Math.round(base.hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /**
   * Province'in ton kademesi (−2..+2). İki frekans toplanır: kare başına
   * hash (mürekkep grenі) ve geniş ölçekli sinüs alanı (baskı bölgesi). Tek
   * başına hash kullanmak satranç tahtası, tek başına alan kullanmak bant
   * yaratıyordu.
   */
  provinceStep(tile) {
    let h = (tile.q * 374761393 + tile.r * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    const grain = (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000;
    const field = (Math.sin(tile.q * 0.21 + tile.r * 0.13)
      + Math.sin(tile.q * 0.07 - tile.r * 0.31)) / 2;
    const mixed = grain * 0.45 + (field * 0.5 + 0.5) * 0.55;
    return Math.round((mixed - 0.5) * 4);
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

  /**
   * Hex yollarını parçalara böler.
   *
   * Tek bir `Path2D`ye binlerce kenar eklemek süper-doğrusal pahalıdır; ölçüm
   * (3243 hex, aynı makine): tek yolda 30.4 ms, 512'lik parçalarda 4.9 ms,
   * 64'lük parçalarda 1.1 ms. Çizim maliyeti parça sayısından bağımsız —
   * `stroke`/`fill` ölçülebilir bir süre almıyor.
   *
   * YALNIZ stroke için güvenlidir: dolgu ayrı yollara bölünürse aynı renkteki
   * komşu hexlerin paylaştığı kenarlarda kenar yumuşatmadan ince dikiş kalır.
   */
  chunkedHexPaths(tiles, chunk = PATH_CHUNK) {
    const paths = [];
    let path = null;
    for (let i = 0; i < tiles.length; i++) {
      if (i % chunk === 0) {
        path = new Path2D();
        paths.push(path);
      }
      this.hexPath(path, tiles[i].x, tiles[i].y);
    }
    return paths;
  }

  /**
   * Görünür alandaki tile'ları offset ızgara üzerinden toplar. rect kopya-yereldir.
   *
   * Sarmalda kırpma [0, cols-1]'in 2 kolon ötesine "hayalet" kopyalarla taşar:
   * dikişin iki yanındaki hexler aynı geçişte, aynı renk path'inde dolmalı,
   * yoksa ayrı doldurulan komşu hexlerin ortak kenarında kenar yumuşatma iki
   * kez uygulanır ve denizde dikiş boyunca ince koyu bir çizgi kalır (aynı
   * gerekçe için bkz. FILL_CHUNK). Çift çizimi render()'daki piksel hizalı
   * kopya bandı kırpması önler: hayaletin bandın dışına taşan kısmı atılır.
   */
  visibleTiles(world, rect) {
    const rowH = HEX_SIZE * 1.5;
    const colW = HEX_SIZE * SQRT3;
    const P = world.wrapWidth;
    const rowMin = Math.max(0, Math.floor(rect.minY / rowH) - 1);
    const rowMax = Math.min(world.rows - 1, Math.ceil(rect.maxY / rowH) + 1);
    const collar = P ? 2 : 0;
    const colMin = Math.max(-collar, Math.floor(rect.minX / colW) - 1);
    const colMax = Math.min(world.cols - 1 + collar, Math.ceil(rect.maxX / colW) + 1);
    const out = [];
    for (let row = rowMin; row <= rowMax; row++) {
      const base = row * world.cols;
      for (let col = colMin; col <= colMax; col++) {
        if (col < 0 || col >= world.cols) {
          const wc = wrapCol(col, world.cols);
          const t = world.tiles[base + wc];
          // ghostOf: kıyı köpüğü gibi nesne kimliğiyle aranan veriler gerçek
          // kareden çözülsün (bkz. water.js).
          if (t) out.push({ ...t, x: t.x + (col > wc ? P : -P), ghostOf: t });
        } else {
          const t = world.tiles[base + col];
          if (t) out.push(t);
        }
      }
    }
    return out;
  }

  render(world, state = {}) {
    const ctx = this.ctx;
    const cam = this.camera;
    // Geçen zaman kare sayısından bağımsız: animasyon her FPS'te aynı hızda akar.
    this.waterTime = performance.now() / 1000;
    this.water.animatedThisFrame = false;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Harita zemini arayüz paletiyle aynı kömür-lacivert tonda.
    ctx.fillStyle = '#0b1115';
    ctx.fillRect(0, 0, cam.viewWidth, cam.viewHeight);

    // Silindir dünya: görünür pencereye düşen her periyot kopyası ayrı çizilir.
    // Kopya başına yalnız görünür kareler işlendiğinden toplam maliyet sabittir.
    const P = world.wrapWidth;
    const rect = cam.visibleRect(HEX_SIZE * 2);
    const k0 = P ? Math.floor((rect.minX - WRAP_X0) / P) : 0;
    const k1 = P ? Math.floor((rect.maxX - WRAP_X0) / P) : 0;

    this.lastDrawn = 0;
    for (let k = k0; k <= k1; k++) {
      ctx.save();
      if (k1 > k0) {
        // Piksel hizalı kopya bandı: her ekran pikseli tam olarak BİR kopyaya
        // aittir. Böylece dikişte üst üste binen yarı saydam katmanlar (işgal
        // taraması, su desenleri, çizgiler) alfa katlayamaz; hayalet hexler de
        // serbestçe çizilir, bandın dışına taşan kısmı kırpılır.
        const bandX = (edge) => Math.round(
          (WRAP_X0 + edge * P - cam.x) * cam.zoom + cam.viewWidth / 2,
        );
        const left = k === k0 ? 0 : bandX(k);
        const right = k === k1 ? cam.viewWidth : bandX(k + 1);
        ctx.beginPath();
        ctx.rect(left, 0, right - left, cam.viewHeight);
        ctx.clip();
      }
      ctx.translate(cam.viewWidth / 2, cam.viewHeight / 2);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x + k * P, -cam.y);
      this.renderCopy(ctx, world, state, {
        minX: rect.minX - k * P, maxX: rect.maxX - k * P,
        minY: rect.minY, maxY: rect.maxY,
      });
      ctx.restore();
    }

    // Seçim kutusu ekran uzayında: kamera dönüşümünün dışında çizilir.
    if (state.marquee) this.drawMarquee(ctx, state.marquee);

    if (this.showLabels && this.mapMode !== 'construction'
      && world.nations?.length && cam.zoom > 0.3) {
      this.drawLabels(ctx, world);
    }
  }

  /** Tek periyot kopyasının bütün dünya-uzayı katmanları. rect kopya-yereldir. */
  renderCopy(ctx, world, state, rect) {
    const cam = this.camera;
    if (cam.zoom < CACHE_ZOOM) {
      const cache = this.cache ?? this.buildCache(world);
      if (this.dirtyTiles?.size) this.repaintTiles(world);
      ctx.imageSmoothingEnabled = true;
      // Yaka dahil basılır: kopya bandının kırpma sınırı görüntünün içinden
      // geçer, kenar pikselinde örtülmeyen kesir kalmaz (bkz. CACHE_COLLAR).
      const pad = CACHE_COLLAR / cache.scale;
      ctx.drawImage(
        cache.canvas,
        cache.x - pad, cache.y, cache.w + pad * 2, cache.h,
      );
      if (this.waterAnimatedMode()) this.water.drawFar(ctx, world, this.waterTime, rect);
    } else {
      const tiles = this.visibleTiles(world, rect);
      this.drawTerrain(ctx, tiles, world);
      if (this.mapMode === 'political') this.drawOccupationOverlay(ctx, world, tiles, cam.zoom);
      if (this.mapMode === 'construction') {
        this.drawConstructionOverlay(ctx, world, tiles, cam.zoom);
      }
      if (this.showGrid && cam.zoom >= GRID_MIN_ZOOM) this.drawGrid(ctx, tiles, cam.zoom);
      if (this.mapMode !== 'terrain') this.drawBorders(ctx, world, tiles, cam.zoom);
      this.lastDrawn += tiles.length;
    }

    if (state.reachable) this.drawReachable(ctx, state.reachable);
    if (state.selected) this.drawHighlight(ctx, state.selected, '#ffffff', 3);
    if (state.hovered && state.hovered !== state.selected) {
      this.drawHighlight(ctx, state.hovered, 'rgba(255,255,255,0.45)', 2);
    }
    this.drawCities(ctx, world, rect);
    if (this.mapMode === 'construction') {
      this.drawConstructionBadges(ctx, world, cam.zoom, rect);
    } else {
      this.drawFronts(ctx, world, state);
      this.drawMovement(ctx, world, state.selectedUnit, state.playerNation);
      this.drawUnitCounters(ctx, world, state.selectedUnit, rect);
      this.drawBattles(ctx, world, rect);
    }
    this.drawSelection(ctx, state.selection);
  }

  /**
   * Tüm dünyayı tek bir dokuya çizer. Uzaklaşınca binlerce hex yerine tek
   * drawImage yapılır -> mobilde kaydırma akıcı kalır.
   *
   * Canvas tam bir sarmal periyodu (P) kaplar: kopyalar `x0 + k*P`'de yan
   * yana basıldığında dikiş görünmez. Dikişten taşan mürekkep (hex yarımları,
   * sınır kalınlığı) kenar kolonların ±P kaydırılmış ek geçişiyle tamamlanır.
   */
  buildCache(world) {
    try {
      return this.bakeCache(world, CACHE_MAX_SIDE);
    } catch {
      // Mobil bellek tavanı: 3072'lik doku ayrılamazsa 2048 ile yetin.
      return this.bakeCache(world, CACHE_FALLBACK_SIDE);
    }
  }

  bakeCache(world, maxSide) {
    const b = world.bounds;
    const P = world.wrapWidth;
    const h = b.maxY - b.minY;
    const idealScale = Math.min(1, maxSide / Math.max(P, h));
    const widthPx = Math.max(1, Math.round(P * idealScale));
    const scale = widthPx / P;
    const heightPx = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    // Yakalı doku: periyodun iki yanına taşan mürekkep de pişirilir, kopya
    // bandı kırpması görüntünün içinden geçer (bkz. CACHE_COLLAR).
    canvas.width = widthPx + CACHE_COLLAR * 2;
    canvas.height = heightPx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('önbellek dokusu ayrılamadı');
    const x0 = WRAP_X0;
    ctx.translate(CACHE_COLLAR, 0);
    ctx.scale(scale, scale);
    ctx.translate(-x0, -b.minY);

    // Dikişten taşan mürekkep için kenar kolonların ±P kaydırılmış hayaletleri
    // ana listeye SATIR SIRASINDA karıştırılır: ayrı bir geçişte çizilselerdi
    // aynı renk komşularıyla farklı path'lere düşer, ortak kenarda çift kenar
    // yumuşatma dikiş çizgisi bırakırdı (bkz. visibleTiles / FILL_CHUNK).
    const bakeTiles = [];
    for (let row = 0; row < world.rows; row++) {
      const base = row * world.cols;
      for (let col = -2; col < 0; col++) {
        const t = world.tiles[base + world.cols + col];
        bakeTiles.push({ ...t, x: t.x - P, ghostOf: t });
      }
      for (let col = 0; col < world.cols; col++) bakeTiles.push(world.tiles[base + col]);
      for (let col = 0; col < 2; col++) {
        const t = world.tiles[base + col];
        bakeTiles.push({ ...t, x: t.x + P, ghostOf: t });
      }
    }
    this.drawTerrain(ctx, bakeTiles, world, true);
    if (this.mapMode === 'political') this.drawOccupationOverlay(ctx, world, bakeTiles, scale);
    if (this.mapMode === 'construction') {
      this.drawConstructionOverlay(ctx, world, bakeTiles, scale);
    }
    if (this.mapMode !== 'terrain') this.drawBorders(ctx, world, bakeTiles, scale);

    this.cache = { canvas, x: x0, y: b.minY, w: P, h, scale, widthPx, heightPx };
    return this.cache;
  }

  /**
   * Zemin dolgusu. Kipe göre renk seçilir ama çizim tek geçişte, renge göre
   * gruplanarak yapılır (binlerce hex için tek fill çağrısı başına bir path).
   *
   * Kâğıt dokusunun kara/deniz yolları YALNIZ önbellek pişirilirken kurulur.
   * Önceden her karede kuruluyordu ama `paintAtlas` canlı karede hiçbir şey
   * çizmiyor: 3243 hex için karede 15.5 ms tamamen boşa gidiyordu (ölçüldü).
   */
  drawTerrain(ctx, tiles, world, baking = false) {
    const byColor = new Map();
    for (const t of tiles) {
      const color = this.tileColor(t, world);
      let group = byColor.get(color);
      if (!group) {
        group = [];
        byColor.set(color, group);
      }
      group.push(t);
    }
    for (const [color, group] of byColor) {
      ctx.fillStyle = color;
      for (const path of this.chunkedHexPaths(group, FILL_CHUNK)) ctx.fill(path);
    }
    if (baking) {
      const land = [];
      const sea = [];
      for (const t of tiles) (t.terrain.water ? sea : land).push(t);
      this.paintAtlas(
        ctx,
        this.chunkedHexPaths(land, FILL_CHUNK),
        this.chunkedHexPaths(sea, FILL_CHUNK),
        true,
      );
      // Suyun statik tabanı (gök gradyanı, kıyı aydınlanması) önbelleğe bir
      // kez pişer; hareketli katmanlar canlı karede üstüne biner (drawFar).
      // Yalnız verilen karelerin tabanı boyanır: sarmal hayaletler de payını
      // alır ama hiçbir kare iki kez boyanıp alfasını katlamaz.
      if (this.waterAnimatedMode()) this.water.bakeStatic(ctx, world, sea);
      return;
    }
    if (!this.waterAnimatedMode()) return;
    const sea = tiles.filter((t) => t.terrain.water);
    if (!sea.length) return;
    this.water.drawNear(
      ctx, world, sea,
      this.chunkedHexPaths(sea, FILL_CHUNK),
      this.camera.zoom, this.waterTime,
    );
  }

  /** Doku desenleri dünya uzayına sabitlenir; bir kez üretilip saklanır. */
  patterns(ctx) {
    if (!this.texturePatterns) {
      const mat = materials();
      this.texturePatterns = {
        atlas: ctx.createPattern(mat.mapAtlas, 'repeat'),
        ocean: ctx.createPattern(mat.oceanInk, 'repeat'),
      };
    }
    return this.texturePatterns;
  }

  /**
   * Atlas baskısı. Desen dünya uzayına sabitlendiği için ülke sınırlarında
   * kesilip yeniden başlamaz: tek parça bir kâğıt yüzeyi gibi davranır.
   *
   * Performans notu: kara ve deniz için iki ayrı `fill(Path2D)` çağrısı,
   * binlerce hex'ten oluşan birleşik yolu `soft-light` ile taramak demekti ve
   * yakın zoomda kareye ~43 ms ekliyordu. Kâğıt zaten tüm dünyayı kaplayan tek
   * bir yüzey olduğu için tek dikdörtgen yeterli; deniz kendi malzemesini
   * yalnız önbellek pişirilirken (uzak zoom) alır, orada maliyet bir kez ödenir.
   *
   * `land` ve `sea` parça listeleridir (bkz. chunkedHexPaths): tek yolda
   * 4836 hex kurmak pişirmenin 36.6 ms'ini tek başına yiyordu. Desen zaten
   * soft-light ile çok soluk bindiği için parça sınırlarındaki dikiş görünmez.
   */
  paintAtlas(ctx, land, sea, baking = false) {
    const { atlas, ocean } = this.patterns(ctx);
    if (!atlas) return;
    ctx.save();
    // soft-light: altındaki rengi yok etmeden yoğunluğunu dalgalandırır.
    ctx.globalCompositeOperation = 'soft-light';
    if (baking) {
      // Önbellek pişirilirken maliyet bir kez ödenir: kara ve deniz kendi
      // malzemesini alır.
      if (ocean) {
        ctx.fillStyle = ocean;
        for (const path of sea) ctx.fill(path);
      }
      ctx.fillStyle = atlas;
      for (const path of land) ctx.fill(path);
    }
    ctx.restore();
  }


  /** Kaynak kipi: her province yalnız kendi RGO rengini taşır. */
  resourceTint(tile) {
    const type = RGO_TYPES[tile.province?.rgo];
    if (!type) return 'hsl(210 6% 26%)';
    const quality = Math.max(0.85, Math.min(1.15, tile.province.rgoQuality ?? 1));
    const key = `res:${type.id}:${Math.round(quality * 10)}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const light = 30 + (quality - 0.85) * 38;
    color = `hsl(${type.hue} 30% ${Math.round(light)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /** Logaritmik nufus skalasi: 1K koyu, 20K+ parlak sari-yesil. */
  populationTint(tile) {
    const population = Math.max(0, tile.province?.population ?? 0);
    if (!population) return 'hsl(225 8% 20%)';
    const low = Math.log10(800);
    const high = Math.log10(20000);
    const ratio = Math.max(0, Math.min(1, (Math.log10(population) - low) / (high - low)));
    const hue = 268 - ratio * 205;
    const saturation = 18 + ratio * 18;
    const light = 20 + ratio * 34;
    return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(light)}%)`;
  }

  tileColor(tile, world) {
    if (this.mapMode === 'resources') {
      return tile.terrain.water ? 'hsl(210 30% 18%)' : this.resourceTint(tile);
    }
    if (this.mapMode === 'population') {
      return tile.terrain.water ? 'hsl(210 30% 15%)' : this.populationTint(tile);
    }
    if (this.mapMode === 'peace') {
      if (tile.terrain.water) return 'hsl(207 35% 14%)';
      const key = `${tile.q}:${tile.r}`;
      if (this.peaceSelection?.demands?.has(key)) return 'hsl(126 38% 34%)';
      if (this.peaceSelection?.concessions?.has(key)) return 'hsl(28 44% 34%)';
      if (tile.owner === this.peaceTarget) return 'hsl(2 40% 30%)';
      if (tile.owner === this.peaceNation) return 'hsl(210 16% 26%)';
      return 'hsl(205 8% 17%)';
    }
    if (this.mapMode === 'construction') {
      if (tile.terrain.water) return 'hsl(207 35% 14%)';
      if (tile.owner !== this.constructionNation) return 'hsl(205 10% 19%)';
      const region = this.constructionData(world).tileRegions.get(tile.ghostOf ?? tile);
      // Ton, orandan cok mutlak bos kapasiteyi anlatir: 4/4 ile 10/10 ayni
      // aciklikta gorunmemeli; fazla bos slotu olan state daha acik yesildir.
      // Doygunluk arayuz paletiyle ayni kademede: %52 neon yesil bir alan
      // yaratiyor ve acik panelle gorsel guc yarisina giriyordu.
      const light = 22 + Math.min(1, (region?.free ?? 0) / 12) * 26;
      return `hsl(96 18% ${Math.round(light)}%)`;
    }
    // Su her kipte arazi rengiyle kalır: kimsenin toprağı değil.
    if (tile.terrain.water || this.mapMode === 'terrain') return tile.terrain.color;

    if (this.mapMode === 'cultures') {
      if (tile.culture < 0) return this.neutralTint(tile.terrain);
      return this.ownerTint(world.cultures[tile.culture], tile.terrain, tile);
    }
    if (tile.owner < 0) return this.neutralTint(tile.terrain);
    return this.ownerTint(world.nations[tile.owner], tile.terrain, tile);
  }

  /** Hukuki sinir sabit kalir; isgal edilen province controller renginde taranir. */
  drawOccupationOverlay(ctx, world, tiles, scale) {
    const groups = new Map();
    for (const tile of tiles) {
      if (!isOccupied(tile) || tile.terrain.water) continue;
      const controller = controllerOf(tile);
      let group = groups.get(controller);
      if (!group) {
        group = { path: new Path2D(), minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
        groups.set(controller, group);
      }
      this.hexPath(group.path, tile.x, tile.y);
      group.minX = Math.min(group.minX, tile.x - HEX_SIZE);
      group.maxX = Math.max(group.maxX, tile.x + HEX_SIZE);
      group.minY = Math.min(group.minY, tile.y - HEX_SIZE);
      group.maxY = Math.max(group.maxY, tile.y + HEX_SIZE);
    }
    for (const [controller, group] of groups) {
      ctx.save();
      ctx.globalAlpha = 0.46;
      ctx.fillStyle = world.nations[controller]?.color ?? '#999';
      ctx.fill(group.path);
      ctx.globalAlpha = 1;
      ctx.clip(group.path);
      ctx.beginPath();
      const height = group.maxY - group.minY;
      const spacing = 9 / scale;
      for (let x = group.minX - height; x <= group.maxX + height; x += spacing) {
        ctx.moveTo(x, group.minY);
        ctx.lineTo(x + height, group.maxY);
      }
      ctx.lineWidth = 2.2 / scale;
      ctx.strokeStyle = 'rgba(214, 200, 168, 0.5)';
      ctx.stroke();
      ctx.restore();
    }
  }

  drawConstructionOverlay(ctx, world, tiles, scale) {
    const atlas = this.constructionData(world);
    const visible = new Set(tiles);
    const spacing = 10 / scale;
    const stripeWidth = 2.5 / scale;

    for (const region of atlas.regions) {
      if (region.status === 'open') continue;
      const shown = region.tiles.filter((tile) => visible.has(tile));
      if (!shown.length) continue;
      const clip = new Path2D();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const tile of shown) {
        this.hexPath(clip, tile.x, tile.y);
        minX = Math.min(minX, tile.x - HEX_SIZE);
        maxX = Math.max(maxX, tile.x + HEX_SIZE);
        minY = Math.min(minY, tile.y - HEX_SIZE);
        maxY = Math.max(maxY, tile.y + HEX_SIZE);
      }
      ctx.save();
      ctx.clip(clip);
      ctx.beginPath();
      const height = maxY - minY;
      for (let x = minX - height; x <= maxX + height; x += spacing) {
        ctx.moveTo(x, minY);
        ctx.lineTo(x + height, maxY);
      }
      ctx.lineWidth = stripeWidth;
      ctx.strokeStyle = region.status === 'full'
        ? 'rgba(126, 141, 146, 0.7)'
        : 'rgba(183, 142, 72, 0.66)';
      ctx.stroke();
      ctx.restore();
    }

    // Ulke sinirindan farkli olarak planlama bolgesi sinirlari ince beyazdir.
    const border = new Path2D();
    for (const tile of tiles) {
      const region = atlas.tileRegions.get(tile.ghostOf ?? tile);
      if (!region) continue;
      for (let side = 0; side < 6; side++) {
        const neighbor = world.get(tile.q + DIRS[side][0], tile.r + DIRS[side][1]);
        const other = atlas.tileRegions.get(neighbor);
        if (!other || other.id === region.id) continue;
        const a = this.corners[side];
        const b = this.corners[(side + 1) % 6];
        border.moveTo(tile.x + a[0], tile.y + a[1]);
        border.lineTo(tile.x + b[0], tile.y + b[1]);
      }
    }
    ctx.lineWidth = 1.8 / scale;
    ctx.strokeStyle = 'rgba(214, 200, 168, 0.55)';
    ctx.stroke(border);
  }

  drawConstructionBadges(ctx, world, scale, rect) {
    if (scale < 0.25) return;
    const atlas = this.constructionData(world);
    const width = 54 / scale;
    const height = 27 / scale;
    for (const region of atlas.regions) {
      const tile = region.center;
      if (!tile || tile.x < rect.minX || tile.x > rect.maxX
        || tile.y < rect.minY || tile.y > rect.maxY) continue;
      const x = tile.x - width / 2;
      const y = tile.y - height / 2;
      ctx.fillStyle = 'rgba(11, 17, 21, 0.9)';
      ctx.fillRect(x, y, width, height);
      ctx.strokeStyle = region.status === 'full'
        ? 'rgba(126, 141, 146, 0.9)'
        : region.status === 'partial'
          ? 'rgba(183, 142, 72, 0.9)'
          : 'rgba(131, 154, 107, 0.9)';
      ctx.lineWidth = 1.4 / scale;
      ctx.strokeRect(x, y, width, height);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d9d1bd';
      ctx.font = `700 ${10 / scale}px ui-monospace, monospace`;
      ctx.fillText(`${region.used}/${region.slots}`, tile.x, tile.y - 4 / scale);
      ctx.fillStyle = '#839a6b';
      ctx.font = `${8 / scale}px ui-monospace, monospace`;
      ctx.fillText(`${region.free} free`, tile.x, tile.y + 7 / scale);
    }
  }


  drawGrid(ctx, tiles, scale) {
    ctx.lineWidth = 1 / scale;
    // Province ızgarası saf siyah değil koyu bir toprak tonudur: baskıda
    // hatlar mürekkebin kendi rengindedir, altına siyah çizilmez.
    ctx.strokeStyle = 'rgba(8, 12, 12, 0.22)';
    // Deniz ızgara dışıdır: hex kenarları suyu petekli bir zemine çeviriyordu.
    // Su malzemesi komşu deniz hexlerini tek yüzeye köprüler; ızgara bunu bozar.
    const land = tiles.filter((t) => !t.terrain.water);
    // Parçalı yol: tek yolda binlerce hex kurmak karenin tamamını yiyordu
    // (bkz. chunkedHexPaths). Stroke olduğu için bölmek görüntüyü değiştirmez.
    for (const path of this.chunkedHexPaths(land)) ctx.stroke(path);
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
    // Dış hat: kalın ve koyu, ülkeyi yerinden söker.
    ctx.lineWidth = 4.6 / scale;
    ctx.strokeStyle = 'rgba(2, 5, 6, 0.88)';
    for (const path of byColor.values()) ctx.stroke(path);

    // İç hat: çok ince, düşük opaklıkta sıcak highlight. Neon bir dış çizgi
    // değil, baskıda hattın iç kenarında kalan açık mürekkep payı.
    ctx.lineWidth = (cultureMode ? 2 : 1) / scale;
    for (const [color, path] of byColor) {
      ctx.strokeStyle = cultureMode ? color : 'rgba(193, 167, 112, 0.16)';
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
    const width = HEX_SIZE * 1.72;
    const height = HEX_SIZE * 1.28;
    ctx.lineWidth = 2.5 / zoom;
    ctx.strokeStyle = '#e5ca84';
    for (const unit of selection) {
      if (!unit?.tile) continue;
      const y = unit.tile.y + (unit.tile.city ? HEX_SIZE * UNIT_ON_CITY_OFFSET : 0);
      const frame = roundedRectPath(
        new Path2D(), unit.tile.x - width / 2, y - height / 2, width, height, 3 / zoom,
      );
      ctx.stroke(frame);
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
   * Secili komutanin cephesi. Hat sirali bir zincir degildir: sinira bakan
   * province kumesidir. Bu nedenle kareler birbirine baglanmaz; her province
   * ayni bant icinde boyanir ve sinir degisince goruntu kendiliginden ilerler.
   */
  drawFronts(ctx, world, state) {
    const tiles = state.front ?? [];
    const general = state.activeGeneral;
    if (!general || !tiles.length || general.nationId !== state.playerNation) return;

    const zoom = this.camera.zoom;
    const attack = general.stance === 'advance';
    const glow = attack ? '#ff9382' : '#8fcdef';
    const band = new Path2D();
    for (const tile of tiles) this.hexPath(band, tile.x, tile.y);

    ctx.globalAlpha = 0.3;
    ctx.fillStyle = glow;
    ctx.fill(band);
    ctx.globalAlpha = 1;
    ctx.lineWidth = (attack ? 3.5 : 2.5) / zoom;
    ctx.strokeStyle = glow;
    ctx.stroke(band);

    const ready = Math.max(0, Math.min(1, general.planning ?? 0));
    const marker = tiles[Math.floor(tiles.length / 2)];
    ctx.beginPath();
    ctx.arc(
      marker.x, marker.y, HEX_SIZE * 0.26,
      -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2,
    );
    ctx.lineWidth = 4 / zoom;
    ctx.strokeStyle = ready >= 1 ? '#e5ca84' : 'rgba(229, 202, 132, 0.65)';
    ctx.stroke();
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

    // Dikişi aşan yol çizgileri periyot kadar sıçramasın: her adım en yakın
    // sarmal temsilciyle çizilir, hat kopyanın kenarından dışarı akar.
    const P = world.wrapWidth;
    for (const unit of world.units) {
      if (!unit.path?.length || unit.nationId !== playerNation) continue;
      const active = unit === selectedUnit;
      ctx.beginPath();
      ctx.moveTo(unit.tile.x, unit.tile.y);
      let px = unit.tile.x;
      for (const tile of unit.path) {
        const dx = tile.x - px;
        px += P ? dx - P * Math.round(dx / P) : dx;
        ctx.lineTo(px, tile.y);
      }
      ctx.lineWidth = (active ? 3 : 2) / zoom;
      ctx.strokeStyle = active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.setLineDash([6 / zoom, 5 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Hedef işareti: yolun sonunda içi boş halka.
      const end = unit.path[unit.path.length - 1];
      ctx.beginPath();
      ctx.arc(px, end.y, HEX_SIZE * 0.3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /** Şehirler: ülke renginde köşeli sur işareti, seviye kadar burçlu. */
  drawCities(ctx, world, rect) {
    if (!world.cities?.length) return;
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
  drawUnitCounters(ctx, world, selectedUnit, rect) {
    if (!world.units?.length) return;
    const zoom = this.camera.zoom;
    const width = HEX_SIZE * 1.56;
    const height = HEX_SIZE * 1.08;
    const detailed = zoom > 0.46;
    const typeCode = {
      INFANTRY: 'INF', CAVALRY: 'CAV', ARTILLERY: 'ART', WARSHIP: 'NAV',
      ARMOR: 'ARM', AIRCRAFT: 'AIR',
    };

    for (const unit of world.units) {
      const tile = unit.tile;
      if (tile.x < rect.minX || tile.x > rect.maxX || tile.y < rect.minY || tile.y > rect.maxY) {
        continue;
      }
      const stack = unitsOn(tile);
      if (stack.length > 1 && stack[0] !== unit) continue;
      const nation = world.nations[unit.nationId];
      const x = tile.x;
      const y = tile.y + (tile.city ? HEX_SIZE * UNIT_ON_CITY_OFFSET : 0);
      const left = x - width / 2;
      const top = y - height / 2;
      const radius = Math.max(1.5 / zoom, HEX_SIZE * 0.1);
      const outer = roundedRectPath(new Path2D(), left, top, width, height, radius);
      const strength = Math.max(0, Math.min(1, unit.hp / Math.max(1, maxHpOf(unit))));
      const organization = Math.max(0, Math.min(1, organizationOf(unit) / 100));

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = 2.5 / zoom;
      ctx.shadowOffsetY = 1.5 / zoom;
      // Plaka düz renk değil: üstten alta hafif koyulaşan boyalı metal.
      const plate = ctx.createLinearGradient(left, top, left, top + height);
      plate.addColorStop(0, '#1a2228');
      plate.addColorStop(1, '#0e1417');
      ctx.fillStyle = plate;
      ctx.fill(outer);
      // Cerceve ulke renginden alinmaz: doygun uluslarda neon turkuaz bir
      // kutuya donuyordu. Secili birim pirinc, muharebedeki tugla kirmizisi,
      // gerisi mat kirik beyaz.
      ctx.lineWidth = (unit.battleId || unit === selectedUnit ? 2.4 : 1.4) / zoom;
      ctx.strokeStyle = unit === selectedUnit ? '#d0ae62'
        : unit.battleId ? '#a95e4a' : 'rgba(206, 196, 172, 0.5)';
      ctx.stroke(outer);
      ctx.restore();

      // Ulke rengi yalniz ust kimlik seridinde: counter haritaya karismaz.
      ctx.save();
      ctx.clip(outer);
      // Kimlik şeridi ülkenin haritadaki mineral tonunu kullanır; ham palet
      // rengi kartı dijital bir rozete çeviriyordu.
      const band = this.mineralize(nation.hue, nation.sat * 0.5, nation.light * 0.8);
      ctx.fillStyle = `hsl(${Math.round(band.hue)} ${Math.round(band.sat)}% ${Math.round(band.light)}%)`;
      ctx.fillRect(left, top, width, height * 0.25);
      ctx.fillStyle = 'rgba(226, 214, 186, 0.14)';
      ctx.fillRect(left, top, width, Math.max(0.8 / zoom, height * 0.045));
      // İç gölge: plaka gömülü dursun.
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.lineWidth = 2 / zoom;
      ctx.stroke(outer);
      ctx.restore();

      if (detailed) {
        ctx.font = `800 ${Math.round(HEX_SIZE * 0.2)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#081017';
        ctx.textAlign = 'left';
        ctx.fillText(typeCode[unit.type.id] ?? 'DIV', left + width * 0.08, top + height * 0.135);
        ctx.textAlign = 'right';
        ctx.fillText(compactSoldiers(unit), left + width * 0.92, top + height * 0.135);

        // NATO cercevesi ve sinif sembolu koyu govdede acik renkle okunur.
        const symbolWidth = width * 0.58;
        const symbolHeight = height * 0.38;
        const symbolY = top + height * 0.48;
        ctx.lineWidth = 1.15 / zoom;
        ctx.strokeStyle = 'rgba(214, 200, 168, 0.8)';
        ctx.strokeRect(x - symbolWidth / 2, symbolY - symbolHeight / 2, symbolWidth, symbolHeight);
        const symbol = new Path2D();
        natoSymbol(symbol, unit.type.id, x, symbolY, height * 0.2);
        ctx.lineWidth = Math.max(1.15 / zoom, height * 0.055);
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#d9d1bd';
        ctx.stroke(symbol);
      }

      // STR ve ORG iki ayri durum cubugudur; her zaman gorunur.
      const barLeft = left + width * 0.07;
      const barWidth = width * 0.86;
      const barHeight = Math.max(1.35 / zoom, height * 0.065);
      const strengthY = top + height * 0.77;
      const organizationY = top + height * 0.89;
      ctx.fillStyle = '#05090c';
      ctx.fillRect(barLeft, strengthY, barWidth, barHeight);
      ctx.fillRect(barLeft, organizationY, barWidth, barHeight);
      ctx.fillStyle = strength > 0.5 ? '#839a6b' : strength > 0.25 ? '#b78e48' : '#a95e4a';
      ctx.fillRect(barLeft, strengthY, barWidth * strength, barHeight);
      ctx.fillStyle = organization > 0.35 ? '#7e8d92' : organization > 0.15 ? '#b78e48' : '#a95e4a';
      ctx.fillRect(barLeft, organizationY, barWidth * organization, barHeight);

      if (stack.length > 1) {
        const badgeWidth = HEX_SIZE * 0.48;
        const badge = roundedRectPath(
          new Path2D(), left + width - badgeWidth * 0.75, top - badgeWidth * 0.25,
          badgeWidth, badgeWidth, badgeWidth * 0.22,
        );
        ctx.fillStyle = '#0b1117';
        ctx.fill(badge);
        ctx.lineWidth = 1.4 / zoom;
        ctx.strokeStyle = '#e5ca84';
        ctx.stroke(badge);
        ctx.font = `800 ${Math.round(HEX_SIZE * 0.22)}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f2e4b9';
        ctx.fillText(String(stack.length), left + width - badgeWidth * 0.25, top + badgeWidth * 0.25);
      }

      if (unit.order && detailed) {
        ctx.font = `800 ${Math.round(HEX_SIZE * 0.23)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f7e7b3';
        ctx.fillText(ORDER_BADGE[unit.order.type] ?? '', left + width * 0.1, top + height * 0.58);
      }

      if (unit === selectedUnit) {
        ctx.lineWidth = 1.15 / zoom;
        ctx.strokeStyle = '#ffffff';
        const inner = roundedRectPath(
          new Path2D(), left + 2 / zoom, top + 2 / zoom,
          width - 4 / zoom, height - 4 / zoom, radius * 0.7,
        );
        ctx.stroke(inner);
      }
    }
  }


  /** Province muharebesi: çatışma yerinde iki ordunun asker ve moral durumu. */
  drawBattles(ctx, world, rect) {
    const battles = world.battleSystem?.battles;
    if (!battles?.length) return;
    const zoom = this.camera.zoom;
    // Kimlik -> birim tablosu bir kez: muharebe basina world.units.find
    // taramak O(muharebe x birim), buyuk haritada kare butcesini yiyordu.
    const unitById = new Map(world.units.map((army) => [army.id, army]));

    for (const battle of battles) {
      const tile = world.get(battle.q, battle.r);
      if (!tile) continue;
      const x = tile.x;
      const y = tile.y - HEX_SIZE * 0.8;
      if (x < rect.minX || x > rect.maxX || y < rect.minY || y > rect.maxY) continue;

      const attackers = (battle.attackers ?? [])
        .map((id) => unitById.get(id)).filter(Boolean);
      const defenders = (battle.defenders ?? [])
        .map((id) => unitById.get(id)).filter(Boolean);
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
      const aSoldiers = attackers.reduce((sum, army) => sum + soldiersOf(army), 0);
      const dSoldiers = defenders.reduce((sum, army) => sum + soldiersOf(army), 0);
      const a = aSoldiers ? `${(aSoldiers / 1000).toFixed(1)}K` : '0';
      const d = dSoldiers ? `${(dSoldiers / 1000).toFixed(1)}K` : '0';
      ctx.fillText(`${a}  ⚔  ${d}`, x, y);
      ctx.shadowBlur = 0;

      const aOrganization = aSoldiers > 0 ? attackers.reduce(
        (sum, army) => sum + organizationOf(army) * soldiersOf(army), 0,
      ) / aSoldiers : 0;
      const dOrganization = dSoldiers > 0 ? defenders.reduce(
        (sum, army) => sum + organizationOf(army) * soldiersOf(army), 0,
      ) / dSoldiers : 0;
      const organizationTotal = Math.max(1, aOrganization + dOrganization);
      const markerX = x - half + (aOrganization / organizationTotal) * width;
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
      // Sarmal temsilci: dikişin öbür yanındaki başkent de etiketini alsın.
      const p = cam.worldToScreenWrapped(nation.capital.x, nation.capital.y);
      if (p.x < -80 || p.y < -30 || p.x > cam.viewWidth + 80 || p.y > cam.viewHeight + 30) continue;
      // Etiket başkentin altına: üstüne yazınca şehir işaretini örtüyordu.
      const ly = p.y + Math.max(16, HEX_SIZE * cam.zoom * 0.7);
      // Sıcak ivory + kontrollü koyu kontur + çok hafif aşağı gölge.
      // Glow yok: parlama etiketi haritadan kopartıyor.
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetY = 1;
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = 'rgba(3, 6, 7, 0.72)';
      ctx.strokeText(nation.name, p.x, ly);
      ctx.restore();
      ctx.fillStyle = '#e6dcc4';
      ctx.fillText(nation.name, p.x, ly);
      // Başkent bayrağı: ülkeyi renginden değil kimliğinden tanı.
      if (nation.flag) drawFlag(ctx, nation.flag, p.x - 9, ly + 8, 18, 12);
    }
    ctx.restore();
  }
}
