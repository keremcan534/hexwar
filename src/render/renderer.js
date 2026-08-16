// Canvas2D hex çizimi. Görünmeyen hexler kırpılır, aynı renkler tek path'te toplanır,
// uzaklaşınca tüm dünya önceden pişirilmiş tek dokudan basılır.

import { HEX_CORNERS, SQRT3, DIRS, wrapCol } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { englishCityName } from '../game/cities.js';
import { drawFlag } from './flagPainter.js';
import { maxHpOf, organizationOf, soldiersOf, unitsOn } from '../game/units.js';
import { terrainShade } from '../world/terrain.js';
import { constructionAtlas } from '../game/construction.js';
import { RGO_TYPES } from '../game/provinces.js';
import { controllerOf, isOccupied } from '../game/control.js';
import { materials } from './textures.js';
import { WaterLayer } from './water.js';

/**
 * Karenin GÖRÜNEN sahibi. Geçilmez arazi (dağ, zirve, buz) hiçbir province'e
 * üye olmadığı için `owner` alanı hep -1'dir; bağlı olduğu province'in sahibini
 * gösteririz (bkz. provinces-gen.attachImpassableFringe). Böylece ülkelerin
 * ortasında gri delik kalmaz ve fetihten sonra da doğru kalır.
 */
function ownerOf(tile, world) {
  if (tile.owner >= 0) return tile.owner;
  if (tile.fringeOf >= 0) return world.provinces?.[tile.fringeOf]?.owner ?? -1;
  return -1;
}

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

/**
 * Yakın-dal statik katmanı: görüş alanı + bu oranda kenar payı tek offscreen
 * dokuya çizilir; su animasyonu tikleri yalnız 2 blit + hareketli katman
 * öder. 0.45-0.7 zoom bandında (~5k görünür hex) her tikte tüm statik boruyu
 * yeniden çizmek karede ~12 ms tutuyordu (ölçüldü, 1920x1080) — asıl
 * hareketli iş 0.5 ms'ti. Kaydırma payı aşılınca ya da zoom yerleşince
 * katman yeniden kurulur.
 */
const STATIC_PAD = 0.26;
/** Statik katman bu büyütme aralığında ölçeklenerek kullanılır; dışında kurulur. */
const STATIC_MAG_MIN = 0.78;
const STATIC_MAG_MAX = 1.35;
/** Pinch bittikten bu kadar ms sonra net (1:1) görüntü için yeniden kurulur. */
const STATIC_SETTLE_MS = 150;
/** Statik katman dokusunun azami kenarı (piksel); pay gerekirse kısılır. */
const STATIC_MAX_SIDE = 5120;

/** Şehir ve birim aynı karede: biri yukarı, biri aşağı kaydırılır. */
const CITY_OFFSET = 0.3;
const UNIT_ON_CITY_OFFSET = 0.22;

/** Emir rozetleri; orders.js'teki ORDER değerleriyle eşleşir. */
const ORDER_BADGE = { auto: '⚙', hold: '⏸' };

/** Sayaç tip kısaltmaları (bkz. paintCounterSprite). */
const TYPE_CODE = {
  INFANTRY: 'INF', CAVALRY: 'CAV', ARTILLERY: 'ART', WARSHIP: 'NAV',
  ARMOR: 'ARM', AIRCRAFT: 'AIR',
};

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

/** '#rrggbb' → {h,s,l}. Arazi renkleri hex yazılır; ton sapması HSL ister. */
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 1e-6) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * Kare başına deterministik ton kademesi (−2..+2). Arazi kiplerinde düz renk
 * blokları kırar: aynı biyomun komşu hexleri baskı mürekkebi gibi hafifçe
 * dalgalanır. provinceStep'ten farkı: burada çapa karenin kendisidir, kültür
 * değil doku anlatılır.
 */
function tileStep(tile) {
  let h = (tile.q * 374761393 + tile.r * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (((h ^ (h >>> 16)) >>> 0) % 5) - 2;
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.camera = camera;
    this.dpr = 1;
    this.showGrid = true;
    this.showLabels = true;
    /**
     * 'political' | 'terrain' | 'geography' | 'cultures' | 'resources'
     * | 'population' | 'construction'
     *
     * 'geography': fiziksel coğrafya önizlemesi. Ülke, sınır, province kenarı,
     * ızgara ve etiket kapalı — yalnız kara, deniz ve arazi. Kıtaların biçimi
     * siyasi katmandan bağımsız değerlendirilebilsin diye vardır.
     */
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
    // Yakın-dal statik katman önbelleği (bkz. STATIC_PAD ve ensureStaticLayers).
    this.staticLayers = null;
    this.staticDirty = true;
    this.zoomStamp = { zoom: 0, at: 0 };
    this.moveStamp = { x: 0, y: 0, at: 0 };
    this.seaFrame = null;
    // Dilimli arka plan işleri: statik katman yeniden kurulumu (staticJob,
    // yedek tuval çiftine pişer, bitince takaslanır) ve uzak-zoom dünya
    // önbelleği ısıtması (farJob). İkisi de "tek karede dev iş" donmasını
    // birkaç kareye yayar.
    this.staticJob = null;
    this.staticSpare = null;
    this.farJob = null;
  }

  /**
   * Su animasyonu yalnız coğrafi kiplerde çizilir. İnşaat/barış gibi kipler
   * haritayı bir seçim yüzeyine çevirir; orada kıpırdayan deniz dikkat
   * dağıtır ve animasyon zinciri kendiliğinden durur.
   */
  waterAnimatedMode() {
    return this.mapMode === 'political' || this.mapMode === 'terrain'
      || this.mapMode === 'geography' || this.mapMode === 'cultures';
  }

  /** Game bir sonraki animasyon karesini zamanlasın mı (bkz. Game.scheduleWaterFrame). */
  waterActive() {
    // Etiket erimesi de kare ister: su çizmeyen kiplerde yarıda donmasın.
    // waterSkipped: zoom jesti deniz katmanını atlattı — zincir sürsün ki
    // jest bitince su kendiliğinden geri gelsin.
    return this.water.animatedThisFrame || this.water.disturbances.length > 0
      || this.labelFadePending === true || this.waterSkipped === true;
  }

  /**
   * Dilimli arka plan işi kaldı mı? Game kare zincirini buna bakarak sürdürür:
   * statik katman ve uzak önbellek dilimleri yalnız çizim karesinde ilerler,
   * zincir kesilirse iş bir sonraki etkileşime dek yarım kalıyordu.
   */
  hasPendingJobs() {
    return !!this.staticJob || !!this.farJob;
  }

  /**
   * Menü perdesi arkasında ısıtma: bir çağrı bir dilim işler, iş kaldıysa
   * true döner. Amaç ilk harita karesinin senkron büyük iş ödememesi
   * (ölçüldü: su dokuları 227 ms + uzak pişirme 111 ms tek karede).
   */
  warmup(world) {
    if (this.water.worldCache?.world !== world) {
      this.water.ensureWorld(world);
      return true;
    }
    if (this.water.warmStep(this.ctx)) return true;
    if (!this.cache) {
      this.stepCacheBuild(world, 10);
      return !this.cache;
    }
    return false;
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
    // Sprite'lar ulus rengine bağlı; yeni dünyada aynı id başka renktir.
    this.unitSprites?.clear();
    this.dirtyTiles?.clear();
    // Ülke biçimleri değişmiş olabilir: etiket yerleşimi yeniden kurulsun.
    this.labelsDirty = true;
    this.staticDirty = true;
    this.seaFrame = null;
    this.staticJob = null;
    this.farJob = null;
  }

  /**
   * Yalnız inşaat verisi eskidi: rozet/bölge atlası düşer, tam pişirme
   * yalnız inşaat kipi ekrandayken gerekir. Ölçüldü (62 ulus, hız 8):
   * YZ'nin her tur kuyruk oynatması runConstruction üzerinden tam
   * invalidateCache tetikliyor, uzak önbellek + etiket yerleşimi + ton
   * önbelleği her tur baştan kuruluyordu (~her karede 5 ms farbake dilimi
   * ve saniyede ~20 MB çöp). Harita görseli inşaattan yalnız o kipte etkilenir.
   */
  invalidateConstruction() {
    this.constructionCache = null;
    if (this.mapMode === 'construction') this.invalidateCache();
  }

  /**
   * Nokta geçersizleme: sahiplik/işgal değişen kareler tam pişirme yerine
   * önbelleğe yerinde boyanır. Savaş haftalarında invalidateCache fırtınası
   * 32k hexlik dünyayı haftada onlarca kez baştan pişiriyordu; artık yalnız
   * değişen kareler (+1 komşu halkası) yeniden mürekkeplenir.
   */
  invalidateTiles(tiles, ownershipChanged = true) {
    // Etiket çapaları yalnız EGEMENLİK değişince kayar (ownerOf owner'a
    // bakar, controller'a değil). İşgal (occupy) controller değiştirir;
    // onun için yerleşimi kirletmek, savaş haftalarında her turda 15k karelik
    // PCA taramasını tetikleyip etiketleri jest ortasında sıçratıyordu —
    // "haritada rastgele beliren isimler" şikâyetinin kökü buydu.
    if (ownershipChanged) this.labelsDirty = true;
    this.staticDirty = true;
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
    if (this.showsPolitics()) this.drawBorders(ctx, world, list, cache.scale);
    ctx.restore();
  }

  /** Siyasi katmanlar (sınır, province kenarı, etiket) çizilsin mi? */
  showsPolitics() {
    return this.mapMode !== 'terrain' && this.mapMode !== 'geography';
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
    // Tavanlar +12 kaldırıldı: eski 22-34 bandı bütün ulusları griye
    // eziyordu (görsel teşhis) — palet artık kaynağında terbiyeli olduğu
    // için buradaki emniyet kemeri yalnız aşırıyı kesmeli, kimliği değil.
    let ceiling;
    if (h < 20 || h >= 340) ceiling = 46;        // kiremit / demir oksit
    else if (h < 50) ceiling = 44;               // hardal, eski altın
    else if (h < 95) ceiling = 38;               // zeytin
    else if (h < 165) ceiling = 34;              // orman yeşili
    else if (h < 200) ceiling = 36;              // oksitlenmiş bakır
    else if (h < 260) ceiling = 38;              // arduvaz mavisi
    else if (h < 320) ceiling = 36;              // soluk erik
    else ceiling = 42;                           // gül kurusu
    // Sıcak toprak eksenine doğru hafif çekiş: saf turkuaz ve saf mor
    // haritada dijital duruyordu.
    const warmPull = h > 150 && h < 300 ? -6 : 2;
    return {
      hue: (h + warmPull + 360) % 360,
      sat: Math.min(sat, ceiling),
      light,
    };
  }

  ownerTint(owner, terrain, tile = null, world = null) {
    // Province başına çok küçük, deterministik ton sapması. Amaç yamalı bir
    // görünüm değil: aynı ülkenin komşu province'leri arasında ±%3 parlaklık
    // ve ±%2 doygunluk farkı, baskı mürekkebinin eşit olmayan yoğunluğunu
    // taklit eder. Sapma az sayıda kademeye yuvarlanır ki renk önbelleği
    // province sayısı kadar büyümesin.
    const step = tile ? this.provinceStep(tile, world) : 0;
    const key = `${owner.id}:${terrain.id}:${step}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    // Arazi gölgesi 1'e doğru sıkıştırılır. Ham TERRAIN_SHADE 0.68–1.34
    // aralığında, yani iki kat: ülkenin parlaklığıyla çarpılınca aynı ülke
    // dağda %40, karda %66 çıkıyordu (ölçüldü) ve tek ülke birkaç ayrı ülke
    // gibi okunuyordu. Siyasi haritada asıl bilgi kimin toprağı olduğudur;
    // arazi yalnız dokuyu verir, kimliği ezmez.
    const shade = 1 + (terrainShade(terrain) - 1) * POLITICAL_TERRAIN_WEIGHT;
    // 0.62'lik doygunluk sıkıştırması 0.78'e gevşetildi ve parlaklık
    // [34, 60] baskı bandına kenetlendi: dolgular pastel sise gömülmeden
    // kimlik taşır, ama hiçbir ülke tabakadan fırlamaz.
    const base = this.mineralize(owner.hue, owner.sat * 0.78, owner.light * shade * 0.9);
    const light = Math.max(34, Math.min(60, base.light + step * 1.5));
    const sat = Math.max(12, base.sat + step * 0.8);
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
  provinceStep(tile, world = null) {
    // Ton çapası province merkezidir: küme tek yüzey gibi tonlanır, komşu
    // kümeler ±kademe ayrışır. Küme yoksa (eski çağrı yolu) kare kendisi.
    const anchor = world?.provinces?.[tile.provinceId]?.center ?? tile;
    let h = (anchor.q * 374761393 + anchor.r * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    const grain = (((h ^ (h >>> 16)) >>> 0) % 1000) / 1000;
    const field = (Math.sin(anchor.q * 0.21 + anchor.r * 0.13)
      + Math.sin(anchor.q * 0.07 - anchor.r * 0.31)) / 2;
    const mixed = grain * 0.45 + (field * 0.5 + 0.5) * 0.55;
    return Math.round((mixed - 0.5) * 4);
  }

  /** Sahipsiz kara politik kipte soluk kalır ki sahipli topraklar öne çıksın. */
  neutralTint(terrain, step = 0) {
    const key = `neutral:${terrain.id}:${step}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const l = Math.round(Math.max(20, Math.min(78, 46 * terrainShade(terrain) + step * 1.2)));
    color = `hsl(80 8% ${l}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /**
   * Arazi kiplerinin dolgusu: ham arazi rengi + kare başına ±kademe sapma.
   * Sapma olmadan her biyom tek düz blok gibi okunuyordu; ±%1.3 parlaklık
   * dalgalanması, atlas greniyle birlikte yüzeye "basılmış kâğıt" dokusu verir.
   */
  terrainTint(terrain, step = 0) {
    const key = `terr:${terrain.id}:${step}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    this.terrainHsl ??= new Map();
    let base = this.terrainHsl.get(terrain.id);
    if (!base) {
      base = hexToHsl(terrain.color);
      this.terrainHsl.set(terrain.id, base);
    }
    const l = Math.max(6, Math.min(94, base.l + step * 1.3));
    const s = Math.max(0, base.s + step * 0.7);
    color = `hsl(${Math.round(base.h)} ${Math.round(s)}% ${Math.round(l)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /**
   * Ülkenin harita üstü mürekkep rengi: sınır tonu, şehir işareti, işgal
   * taraması ve muharebe çubuğu bunu kullanır. Ham palet rengi bu ölçekte
   * neon duruyordu; mineral aileden ama dolgudan bir kademe daha doygun bir
   * ton, koyu kontur üstünde ülkeyi tanıtır ama bağırmaz.
   */
  nationInk(nation) {
    const key = `nink:${nation.id}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const base = this.mineralize(nation.hue, nation.sat, nation.light);
    const sat = Math.min(48, base.sat + 14);
    const light = Math.max(32, Math.min(62, base.light));
    color = `hsl(${Math.round(base.hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /**
   * Sınıra doğru koyulaşan kenar tonu: dolgunun kendisinden türetilmiş,
   * belirgin ölçüde koyu bir gölge. Paradox haritalarının imza görünümü —
   * ülke kesilmiş kağıt parçası gibi kenarında gölgelenir, düz vinil
   * çıkartma gibi durmaz (bkz. drawBorders halkaları).
   */
  nationEdgeTone(nation) {
    const key = `nedge:${nation.id}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const base = this.mineralize(nation.hue, nation.sat * 0.9, nation.light);
    const sat = Math.min(50, base.sat + 8);
    const light = Math.max(16, base.light * 0.5);
    color = `hsl(${Math.round(base.hue)} ${Math.round(sat)}% ${Math.round(light)}%)`;
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
    // Sarmalda kolon aralığı KISITLANMAZ: statik katman dünya-çapalı geniş
    // bir dikdörtgen ister ve bu dikdörtgen dikişi rahatça aşar. Eski ±2
    // kolonluk yaka, dikişi aşan kısmın karelerini hiç toplamıyordu — katman
    // orada şeffaf kalıyor, ekranda "kara bant" beliriyordu. Kolon hangi
    // periyoda düşerse karesi o periyodun hayaleti olarak (x ± k·P) eklenir;
    // dikdörtgen periyottan genişse aynı kare iki kopyada da yer alır.
    let colMin = Math.floor(rect.minX / colW) - 1;
    let colMax = Math.ceil(rect.maxX / colW) + 1;
    if (!P) {
      colMin = Math.max(0, colMin);
      colMax = Math.min(world.cols - 1, colMax);
    }
    const out = [];
    for (let row = rowMin; row <= rowMax; row++) {
      const base = row * world.cols;
      for (let col = colMin; col <= colMax; col++) {
        const wc = wrapCol(col, world.cols);
        const t = world.tiles[base + wc];
        if (!t) continue;
        const k = P ? Math.floor(col / world.cols) : 0;
        // ghostOf: kıyı köpüğü gibi nesne kimliğiyle aranan veriler gerçek
        // kareden çözülsün (bkz. water.js).
        if (k === 0) out.push(t);
        else out.push({ ...t, x: t.x + k * P, ghostOf: t });
      }
    }
    return out;
  }

  /**
   * Görünür deniz kareleri + dolgu yolları; kare-rect'i hex ızgarasına
   * oturduğu sürece yeniden kurulmaz. Su animasyonu tikleri kamera dururken
   * aynı ürünleri tekrar kullanır (visibleTiles + Path2D kurulumu sıfır).
   */
  visibleSeaProducts(world, rect, onlyCached = false) {
    // Kapsama önbelleği: ürünler, isteği İÇEREN payla kurulmuş son
    // kapsamalardan döner. Hex-ızgara anahtarlı önceki sürüm kaydırmada her
    // 1-3 hexte tüm deniz yollarını (kare listesi + Path2D demeti) baştan
    // kuruyordu — ölçüldü: pan sırasında saniyede ~7-11 MB çöpün ana kaynağı.
    // %20 pay ile kurulum ancak kamera payı tüketince tekrarlanır; fazla alan
    // tuvale kırpıldığı için görünmez. Dikişte her kopya kendi rect'iyle
    // gelir; küçük bir kapsama listesi (4) iki kopyayı birden taşır.
    if (this.seaFrame?.world !== world) this.seaFrame = { world, covers: [] };
    const covers = this.seaFrame.covers;
    for (const c of covers) {
      if (rect.minX >= c.minX && rect.maxX <= c.maxX
        && rect.minY >= c.minY && rect.maxY <= c.maxY) return c.products;
    }
    // Aktif zoom jesti: kurulum ~150 ms'de bire sınırlanır ve aradaki
    // karelerde SON kapsama kullanılır (yollar dünya-uzayı, her zoom'da
    // geçerli; zoom-out'ta kenarlar bir sonraki kuruluma dek desensiz kalır).
    // Tam atlama su katmanını jest boyunca "pat" diye söndürüyordu — o da
    // ayrı bir görsel hata gibi okunuyordu.
    if (onlyCached) {
      const last = covers[covers.length - 1];
      if (last && performance.now() - (this.seaFrame.builtAt ?? 0) < 150) {
        return last.products;
      }
    }
    const padX = (rect.maxX - rect.minX) * 0.2;
    const padY = (rect.maxY - rect.minY) * 0.2;
    const cover = {
      minX: rect.minX - padX, maxX: rect.maxX + padX,
      minY: rect.minY - padY, maxY: rect.maxY + padY,
    };
    const tiles = [];
    for (const t of this.visibleTiles(world, cover)) if (t.terrain.water) tiles.push(t);
    cover.products = { tiles, paths: this.chunkedHexPaths(tiles, FILL_CHUNK) };
    covers.push(cover);
    if (covers.length > 4) covers.shift();
    this.seaFrame.builtAt = performance.now();
    return cover.products;
  }

  /** Statik katmanın hedef dünya dikdörtgeni + doku boyutu (piksel hizalı). */
  staticGeometry(world) {
    const cam = this.camera;
    const s = cam.zoom * this.dpr;
    const viewW = cam.viewWidth / cam.zoom;
    const viewH = cam.viewHeight / cam.zoom;
    // Kenar payı doku tavanına sığacak kadar kısılır: pay büyük ekran +
    // yüksek DPR'de sınırsız büyürse tek katman 8k'yı aşıyordu.
    const padX = Math.min(viewW * STATIC_PAD,
      Math.max(0, (STATIC_MAX_SIDE / s - viewW) / 2));
    const padY = Math.min(viewH * STATIC_PAD,
      Math.max(0, (STATIC_MAX_SIDE / s - viewH) / 2));
    // Cihaz pikseline hizalama: kaydırma-tekrar kullanımında eski görüntü tam
    // piksel kaydırılarak kopyalanır; kesirli fark bulanıklatırdı.
    const x0 = Math.round((cam.x - viewW / 2 - padX) * s) / s;
    const y0 = Math.round((cam.y - viewH / 2 - padY) * s) / s;
    const w = viewW + padX * 2;
    const h = viewH + padY * 2;
    return {
      x0, y0, w, h,
      pxW: Math.max(1, Math.ceil(w * s)),
      pxH: Math.max(1, Math.ceil(h * s)),
      zoom: cam.zoom, cx: cam.x, cy: cam.y,
    };
  }

  /**
   * Statik katman geçerli mi? Kullanım hâlleri:
   *   - kamera duruyor: doğrudan tekrar kullan;
   *   - kaydırma: pay içindeyken tekrar kullan; aşınca SENKRON kur — kaydır-
   *     ve-şerit yolu ucuz (birkaç ms), beklemeye değmez;
   *   - zoom: katman ölçeklenerek gösterilir, yeniden kurulum ARKA PLANDA
   *     dilim dilim pişer (stepStaticJob) ve bitince takaslanır. Zoom
   *     sırasında hiçbir kare "dev tek iş" ödemez — donmanın kökü buydu.
   */
  ensureStaticLayers(world) {
    const cam = this.camera;
    const L = this.staticLayers;
    const hard = !L || L.world !== world || L.mode !== this.mapMode
      || L.dpr !== this.dpr || L.grid !== this.showGrid;
    if (hard) {
      this.staticJob = null;
      return this.buildStaticLayers(world);
    }
    if (this.staticDirty) {
      // Oyun olayı (fetih, işgal) statiği bayatlattı: senkron tam pişirme
      // DEĞİL dilimli iş — zaman akarken her haftalık tikte 12-40 ms'lik
      // takılmanın kaynağı buydu. İçerik en fazla 3 kare (~120 ms) bayat
      // kalır; sınır çizgisinin yüz milisaniye geç güncellenmesi hissedilmez,
      // kare düşmesi hissedilir.
      this.staticDirty = false;
      this.staticJob = null;
      this.stepStaticJob(world);
      return this.staticLayers;
    }
    const viewW = cam.viewWidth / cam.zoom;
    const viewH = cam.viewHeight / cam.zoom;
    const mag = cam.zoom / L.zoom;
    const P = world.wrapWidth || 0;
    let dx = cam.x - L.cx;
    if (P) dx -= P * Math.round(dx / P);
    const dy = cam.y - L.cy;
    const slackX = (L.w - viewW) / 2;
    const slackY = (L.h - viewH) / 2;
    if (mag === 1) {
      this.staticJob = null;
      if (Math.abs(dx) > slackX || Math.abs(dy) > slackY) {
        return this.buildStaticLayers(world);
      }
      return L;
    }
    // Zoom değişti: jest sürerken katman ölçekli blitle idare eder, yeniden
    // pişirme ancak büyütme okunmaz hâle gelince (±%25) ya da jest yerleşince
    // başlar. Eski %8'lik bant sürekli tekerlekte saniyede ~2 tam pişirme +
    // GPU doku yüklemesi üretiyordu (ölçüldü: 20 sn'de 46 GC düşüşü / 75 MB
    // ve 30 uzun kare); hareket hâlindeki hafif bulanıklık ise görünmüyor.
    const settled = performance.now() - this.zoomStamp.at > STATIC_SETTLE_MS;
    if (settled || mag < 0.75 || mag > 1.33) this.stepStaticJob(world);
    return this.staticLayers;
  }

  /**
   * Dilimli statik yeniden kurulum: yedek tuval çiftine 3 dikey dilimde
   * pişirilir, tamamlanınca gösterilen katmanla takaslanır. Kamera işin
   * anlık görüntüsünden çok uzaklaşırsa iş tazelenir (dilimler ucuz).
   */
  stepStaticJob(world) {
    const cam = this.camera;
    let job = this.staticJob;
    if (job) {
      let jdx = cam.x - job.cx;
      if (job.P) jdx -= job.P * Math.round(jdx / job.P);
      // Zoom sapmasında iş TAZELENMEZ, bitirilir: eşik %8'ken sürekli tekerlek
      // zoom'unda her kare işi baştan başlatıyor, iş hiç bitemiyor ve eski
      // katman ekranda küçülüp kenarlarda boşluk bırakıyordu. Yakın-tarihli
      // bitmiş iş, bayat-ama-bütün eski katmandan her zaman iyidir; sonraki
      // iş güncel zooma yakınsar.
      const stale = job.world !== world
        || Math.abs(cam.zoom / job.zoom - 1) > 0.3
        || Math.abs(jdx) > job.w * 0.25
        || Math.abs(cam.y - job.cy) > job.h * 0.25;
      if (stale) job = null;
    }
    if (!job) {
      const g = this.staticGeometry(world);
      let pair = this.staticSpare;
      this.staticSpare = null;
      if (!pair || pair.base.width !== g.pxW || pair.base.height !== g.pxH) {
        pair = { base: document.createElement('canvas'), top: document.createElement('canvas') };
        pair.base.width = g.pxW;
        pair.base.height = g.pxH;
        pair.top.width = g.pxW;
        pair.top.height = g.pxH;
      }
      const s = g.zoom * this.dpr;
      const setup = (canvas) => {
        const c = canvas.getContext('2d');
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, canvas.width, canvas.height);
        c.setTransform(s, 0, 0, s, -g.x0 * s, -g.y0 * s);
        return c;
      };
      job = {
        world, ...g, P: world.wrapWidth || 0, pair,
        b: setup(pair.base), t: setup(pair.top),
        slice: 0, slices: 3, tiles: 0,
        mode: this.mapMode, grid: this.showGrid, dpr: this.dpr,
      };
      this.staticJob = job;
    }
    const sw = job.w / job.slices;
    const clip = {
      minX: job.x0 + job.slice * sw, maxX: job.x0 + (job.slice + 1) * sw,
      minY: job.y0, maxY: job.y0 + job.h,
    };
    const collar = HEX_SIZE * 2.5;
    job.tiles += this.paintStaticContent(job.b, job.t, world, {
      minX: clip.minX - collar, maxX: clip.maxX + collar,
      minY: clip.minY - collar, maxY: clip.maxY + collar,
    }, clip, job.zoom);
    job.slice++;
    if (job.slice >= job.slices) {
      const old = this.staticLayers;
      this.staticLayers = {
        base: job.pair.base, top: job.pair.top,
        world, mode: job.mode, dpr: job.dpr, grid: job.grid,
        zoom: job.zoom, cx: job.cx, cy: job.cy,
        x0: job.x0, y0: job.y0, w: job.w, h: job.h, tileCount: job.tiles,
      };
      if (old) this.staticSpare = { base: old.base, top: old.top };
      this.staticJob = null;
    }
  }

  /**
   * Statik boru hattının kendisi: verilen dünya dikdörtgenindeki kareleri
   * taban+üst katmanlara çizer. `clip` verilirse iki bağlam da o dikdörtgene
   * kırpılır — kaydırmada yalnız yeni açılan şerit boyanır, kare toplama
   * yine de 2.5 hex yakalıdır ki komşudan taşan mürekkep (sınır kılıfı, kıyı
   * halosu) şerit içinde eksik kalmasın.
   */
  paintStaticContent(b, t, world, rect, clip, scale = this.camera.zoom) {
    if (clip) {
      for (const g of [b, t]) {
        g.save();
        g.beginPath();
        g.rect(clip.minX, clip.minY, clip.maxX - clip.minX, clip.maxY - clip.minY);
        g.clip();
      }
    }
    const tiles = this.visibleTiles(world, rect);

    // TABAN: zemin dolguları + kıyı karası ışığı + statik su tabanı.
    this.paintTileFills(b, tiles, world);
    if (this.waterAnimatedMode()) {
      const land = [];
      const sea = [];
      for (const tile of tiles) (tile.terrain.water ? sea : land).push(tile);
      this.paintShore(b, world, land);
      this.water.paintStaticBase(b, world, sea);
      // ÜST: kıyı mürekkebi çizgi katmanının en altına.
      if (sea.length) {
        const cache = this.water.ensureWorld(world);
        const coastal = sea.filter((tile) => cache.coastalSet.has(tile.ghostOf ?? tile));
        if (coastal.length) this.water.drawCoastline(t, cache, coastal, scale);
      }
    }

    // ÜST: işgal/inşaat taraması, ızgara, province kenarı, ülke sınırı.
    if (this.mapMode === 'political') this.drawOccupationOverlay(t, world, tiles, scale);
    if (this.mapMode === 'construction') this.drawConstructionOverlay(t, world, tiles, scale);
    if (this.showGrid && scale >= GRID_MIN_ZOOM && this.mapMode !== 'geography') {
      this.drawGrid(t, tiles, scale);
    }
    if (this.mapMode !== 'geography') this.drawProvinceEdges(t, tiles, world, scale);
    if (this.showsPolitics()) this.drawBorders(t, world, tiles, scale);

    if (clip) {
      b.restore();
      t.restore();
    }
    return tiles.length;
  }

  /** Statik katmanları (taban + üst çizgiler) kenar paylı olarak pişirir. */
  buildStaticLayers(world) {
    const cam = this.camera;
    const dpr = this.dpr;
    const s = cam.zoom * dpr;
    const { x0, y0, w, h, pxW, pxH } = this.staticGeometry(world);

    const prev = this.staticLayers;
    // Saf kaydırma tekrar kullanımı: aynı dünya/kip/zoom ve aynı doku boyutu
    // ise eski içerik piksel hizalı kaydırılır, yalnız yeni açılan şeritler
    // çizilir. Tam pişirme ~11k kare sürerken şeritler onda biri kadardır;
    // sürükleme sırasındaki "kasma" bu farktan geliyordu.
    const canScroll = prev && !this.staticDirty && prev.world === world
      && prev.mode === this.mapMode && prev.dpr === dpr && prev.grid === this.showGrid
      && prev.zoom === cam.zoom
      && prev.base.width === pxW && prev.base.height === pxH;

    let L = prev;
    if (!L || L.base.width !== pxW || L.base.height !== pxH) {
      L = { base: document.createElement('canvas'), top: document.createElement('canvas') };
      L.base.width = pxW;
      L.base.height = pxH;
      L.top.width = pxW;
      L.top.height = pxH;
    }

    // Sarmalda eski katman başka periyottan kalmış olabilir; farkı en yakın
    // temsilciye çek.
    const P = world.wrapWidth || 0;
    let dxWorld = 0;
    let dyWorld = 0;
    if (canScroll) {
      dxWorld = x0 - prev.x0;
      if (P) dxWorld -= P * Math.round(dxWorld / P);
      dyWorld = y0 - prev.y0;
    }
    const dxPx = Math.round(dxWorld * s);
    const dyPx = Math.round(dyWorld * s);
    const scrolled = canScroll && (dxPx !== 0 || dyPx !== 0)
      && Math.abs(dxPx) < pxW && Math.abs(dyPx) < pxH;

    const setup = (canvas) => {
      const g = canvas.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (scrolled) {
        // 'copy' kaynağı önce anlık görüntüye alır: kendi üstüne kaydırma
        // güvenlidir ve dışarıdan gelen alan şeffaf kalır — clear gerekmez.
        g.globalCompositeOperation = 'copy';
        g.drawImage(canvas, -dxPx, -dyPx);
        g.globalCompositeOperation = 'source-over';
      } else {
        g.clearRect(0, 0, canvas.width, canvas.height);
      }
      g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
      return g;
    };
    const b = setup(L.base);
    const t = setup(L.top);

    Object.assign(L, {
      world, mode: this.mapMode, dpr, grid: this.showGrid,
      zoom: cam.zoom, cx: cam.x, cy: cam.y, x0, y0, w, h,
    });

    const collar = HEX_SIZE * 2.5;
    if (scrolled) {
      let drawn = 0;
      // Dikey şerit: kaydırma yönünde açılan tam boy dilim.
      if (dxPx !== 0) {
        const clip = dxWorld > 0
          ? { minX: x0 + w - dxWorld, maxX: x0 + w, minY: y0, maxY: y0 + h }
          : { minX: x0, maxX: x0 - dxWorld, minY: y0, maxY: y0 + h };
        drawn += this.paintStaticContent(b, t, world, {
          minX: clip.minX - collar, maxX: clip.maxX + collar,
          minY: clip.minY - collar, maxY: clip.maxY + collar,
        }, clip);
      }
      // Yatay şerit: dikey şeridin kapladığı alan hariç (çift boyama alfa
      // katlar), kalan genişlikte dilim.
      if (dyPx !== 0) {
        const left = dxWorld > 0 ? x0 : x0 - dxWorld;
        const right = dxWorld > 0 ? x0 + w - dxWorld : x0 + w;
        const clip = dyWorld > 0
          ? { minX: left, maxX: right, minY: y0 + h - dyWorld, maxY: y0 + h }
          : { minX: left, maxX: right, minY: y0, maxY: y0 - dyWorld };
        if (clip.maxX > clip.minX) {
          drawn += this.paintStaticContent(b, t, world, {
            minX: clip.minX - collar, maxX: clip.maxX + collar,
            minY: clip.minY - collar, maxY: clip.maxY + collar,
          }, clip);
        }
      }
      L.tileCount = drawn;
    } else {
      L.tileCount = this.paintStaticContent(b, t, world, {
        minX: x0, maxX: x0 + w, minY: y0, maxY: y0 + h,
      }, null);
    }

    this.staticDirty = false;
    this.staticLayers = L;
    return L;
  }

  render(world, state = {}) {
    const ctx = this.ctx;
    const cam = this.camera;
    // Geçen zaman kare sayısından bağımsız: animasyon her FPS'te aynı hızda akar.
    this.waterTime = performance.now() / 1000;
    this.water.animatedThisFrame = false;
    // Kopya döngüsünden önce sıfırlanır; yakın dal atlarsa yeniden kurar.
    this.waterSkipped = false;
    // Zoom/kaydırma damgaları: statik katmanın "jest yerleşti, netle" kararı
    // ve boşta ısıtma (farJob) yalnız dinlenmede çalışsın diye.
    if (cam.zoom !== this.zoomStamp.zoom) {
      this.zoomStamp = { zoom: cam.zoom, at: performance.now() };
    }
    if (cam.x !== this.moveStamp.x || cam.y !== this.moveStamp.y) {
      this.moveStamp = { x: cam.x, y: cam.y, at: performance.now() };
    }
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
      }, k);
      ctx.restore();
    }

    // Seçim kutusu ekran uzayında: kamera dönüşümünün dışında çizilir.
    if (state.marquee) this.drawMarquee(ctx, state.marquee);

    // Etiketler her zoomda: uzak görünümde ülke adları haritayı "atlas"
    // yapar; yoğunluğu zoom LOD'u ve çarpışma ayıklaması yönetir.
    if (this.showLabels && this.mapMode !== 'construction' && this.mapMode !== 'geography'
      && world.nations?.length) {
      const t0 = performance.now();
      this.drawLabels(ctx, world);
      this.perf?.add('r.labels', performance.now() - t0);
    }
    this.perf?.bump('hex', this.lastDrawn);
    this.perf?.bump('copies', k1 - k0 + 1);
  }

  /** Tek periyot kopyasının bütün dünya-uzayı katmanları. rect kopya-yereldir. */
  renderCopy(ctx, world, state, rect, copyK = 0) {
    const cam = this.camera;
    const perf = this.perf;
    let t0 = performance.now();
    if (cam.zoom < CACHE_ZOOM) {
      if (!this.cache) this.stepCacheBuild(world);
      const cache = this.cache;
      if (cache) {
        if (this.dirtyTiles?.size) this.repaintTiles(world);
        ctx.imageSmoothingEnabled = true;
        // Yaka dahil basılır: kopya bandının kırpma sınırı görüntünün içinden
        // geçer, kenar pikselinde örtülmeyen kesir kalmaz (bkz. CACHE_COLLAR).
        const pad = CACHE_COLLAR / cache.scale;
        ctx.drawImage(
          cache.canvas,
          cache.x - pad, cache.y, cache.w + pad * 2, cache.h,
        );
      } else if (this.farJob?.canvas) {
        // Pişirme sürüyor: satır bantları yukarıdan aşağı dolar, hazır kısım
        // gösterilir. Donmuş kare yerine 3-4 karede akan bir dolum.
        const j = this.farJob;
        const b = world.bounds;
        const pad = CACHE_COLLAR / j.scale;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(
          j.canvas,
          WRAP_X0 - pad, b.minY, (world.wrapWidth ?? b.maxX - b.minX) + pad * 2, b.maxY - b.minY,
        );
      }
      perf?.add('r.far', performance.now() - t0);
      t0 = performance.now();
      if (this.cache && this.waterAnimatedMode()) {
        this.water.drawFar(ctx, world, this.waterTime, rect);
      }
      perf?.add('r.water', performance.now() - t0);
    } else {
      // Statik her şey (dolgu, kıyı, ızgara, sınır) önbellek dokusundan
      // basılır; yalnız hareketli su katmanı canlı çizilir. Su animasyonunun
      // her tikinde tüm boruyu yeniden çizmek 0.45-0.7 zoom bandını
      // "powerpoint"e çeviriyordu (bkz. STATIC_PAD).
      const layers = this.ensureStaticLayers(world);
      perf?.add('r.static', performance.now() - t0);
      t0 = performance.now();
      const P = world.wrapWidth || 0;
      // Katman kopya-0 çerçevesinde, kameranın çevresinde kurulur ve dikişi
      // aşan içerik hayaletlerle İÇİNDEDİR. Bu yüzden görüntü her kopyada
      // AYNI ekran konumuna basılmalı: kopya dönüşümü +k·P eklediği için
      // çizim koordinatı -k·P ile dengelenir; bant kırpması doğru dilimi
      // seçer. Dengelenmezse dikişin öbür kopyasına düşen bant boş kalıyor
      // ve ekranda "kara şerit" beliriyordu. Ek kayma, kamera katmanın
      // kurulduğu yerden periyot atlamışsa en yakın temsilciye çeker.
      const shift = P ? -copyK * P + Math.round((cam.x - layers.cx) / P) * P : 0;
      ctx.imageSmoothingEnabled = true;
      // Hızlı zoom-out'ta görünür dünya katmanın kapsamından büyür; dilimli
      // iş yetişene dek kenarlarda arka plan (siyah) görünüyordu. Katman
      // görüşü kapsamıyorsa altına uzak-zoom dünya dokusu zemin serilir:
      // kenarlar yumuşak harita olur, asla boşluk olmaz.
      let ldx = cam.x - layers.cx;
      if (P) ldx -= P * Math.round(ldx / P);
      const viewW = cam.viewWidth / cam.zoom;
      const viewH = cam.viewHeight / cam.zoom;
      const covered = Math.abs(ldx) <= (layers.w - viewW) / 2 + 1
        && Math.abs(cam.y - layers.cy) <= (layers.h - viewH) / 2 + 1;
      if (!covered && this.cache) {
        const backdrop = this.cache;
        const bpad = CACHE_COLLAR / backdrop.scale;
        ctx.drawImage(
          backdrop.canvas,
          backdrop.x - bpad, backdrop.y, backdrop.w + bpad * 2, backdrop.h,
        );
      }
      ctx.drawImage(layers.base, layers.x0 + shift, layers.y0, layers.w, layers.h);
      if (this.waterAnimatedMode()) {
        // Aktif zoom jestinde deniz yolları yeniden KURULMAZ: görünür rect her
        // karede değiştiği için önbellek anahtarı sürekli kaçıyor ve yol
        // kurulumu kare başına yüzlerce KB çöp üretiyordu (ölçüldü ~8 MB/sn).
        // Önbellekte yoksa desen katmanı o kare atlanır (statik su tabanı
        // katmanda zaten var); jest yerleşince ilk su tikinde geri gelir.
        const zooming = performance.now() - this.zoomStamp.at < 120;
        const sea = this.visibleSeaProducts(world, rect, zooming);
        this.waterSkipped = !sea && this.camera.zoom >= CACHE_ZOOM;
        if (sea && sea.tiles.length) {
          // Desenler çizgi katmanının altında, köpük/bozulma üstünde.
          this.water.drawAnimated(ctx, world, sea.tiles, sea.paths, cam.zoom, this.waterTime);
          ctx.drawImage(layers.top, layers.x0 + shift, layers.y0, layers.w, layers.h);
          this.water.drawSurfaceAnim(ctx, world, sea.tiles, cam.zoom, this.waterTime);
        } else {
          ctx.drawImage(layers.top, layers.x0 + shift, layers.y0, layers.w, layers.h);
        }
      } else {
        ctx.drawImage(layers.top, layers.x0 + shift, layers.y0, layers.w, layers.h);
      }
      perf?.add('r.water', performance.now() - t0);
      this.lastDrawn += layers.tileCount;
      // Uzak önbellek eksikse boş anlarda dilim dilim ısıt: kullanıcı sonra
      // zoom-out yaptığında bekleme kalmasın. Yalnız kamera dinlenirken —
      // aktif jest karelerine ek yük bindirmez. İstisna: katman görüşü
      // kapsamıyorsa zemin dokusuna ŞİMDİ ihtiyaç var, jest sürerken de ısıt.
      const idle = performance.now() - Math.max(this.zoomStamp.at, this.moveStamp.at) > 250;
      if (!this.cache && (idle || !covered) && !this.staticJob) {
        if (!this.farJob) {
          try {
            this.startFarBake(world, CACHE_MAX_SIDE);
          } catch {
            this.startFarBake(world, CACHE_FALLBACK_SIDE);
          }
        }
        t0 = performance.now();
        this.stepFarBake(world);
        perf?.add('r.farbake', performance.now() - t0);
      }
    }

    t0 = performance.now();
    if (state.reachable) this.drawReachable(ctx, state.reachable);
    if (state.selected && state.selected.provinceId >= 0) {
      this.drawProvinceHighlight(ctx, world, state.selected.provinceId);
    }
    if (state.selected) this.drawHighlight(ctx, state.selected, '#ffffff', 3);
    if (state.hovered && state.hovered !== state.selected) {
      this.drawHighlight(ctx, state.hovered, 'rgba(255,255,255,0.45)', 2);
    }
    this.drawCities(ctx, world, rect);
    if (this.mapMode === 'construction') {
      this.drawConstructionBadges(ctx, world, cam.zoom, rect);
    } else if (this.mapMode !== 'geography') {
      // Coğrafya kipi fiziksel dünyayı yalnız başına gösterir: ordu, cephe ve
      // muharebe de siyasettir (bkz. mapMode yorumu).
      this.drawFronts(ctx, world, state);
      this.drawMovement(ctx, world, state.selectedUnit, state.playerNation);
      this.drawUnitCounters(ctx, world, state.selectedUnit, rect);
      this.drawBattles(ctx, world, rect);
    }
    this.drawSelection(ctx, state.selection);
    perf?.add('r.actors', performance.now() - t0);
  }

  /**
   * Tüm dünyayı tek bir dokuya çizer. Uzaklaşınca binlerce hex yerine tek
   * drawImage yapılır -> mobilde kaydırma akıcı kalır.
   *
   * Canvas tam bir sarmal periyodu (P) kaplar: kopyalar `x0 + k*P`'de yan
   * yana basıldığında dikiş görünmez. Dikişten taşan mürekkep (hex yarımları,
   * sınır kalınlığı) kenar kolonların ±P kaydırılmış ek geçişiyle tamamlanır.
   */
  /**
   * Uzak önbelleği kare bütçesi içinde ilerletir. Eski buildCache SENKRON
   * tamamlıyordu: ilk uzak kare tam pişirmeyi tek seferde ödüyordu (ölçüldü:
   * açılış karesinde 111 ms). Artık kare başına en fazla `budgetMs` dilim
   * işlenir; hazır olana dek kısmi doku gösterilir (bkz. renderCopy) ve
   * kare zinciri hasPendingJobs ile sürer.
   */
  stepCacheBuild(world, budgetMs = 12) {
    if (!this.farJob) {
      try {
        this.startFarBake(world, CACHE_MAX_SIDE);
      } catch {
        // Mobil bellek tavanı: 3072'lik doku ayrılamazsa 2048 ile yetin.
        this.startFarBake(world, CACHE_FALLBACK_SIDE);
      }
    }
    const t0 = performance.now();
    while (!this.cache && this.farJob && performance.now() - t0 < budgetMs) {
      this.stepFarBake(world);
    }
  }

  startFarBake(world, maxSide) {
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
    ctx.translate(CACHE_COLLAR, 0);
    ctx.scale(scale, scale);
    ctx.translate(-WRAP_X0, -b.minY);
    this.farJob = {
      world, canvas, ctx, scale, widthPx, heightPx,
      row: 0, step: Math.max(8, Math.ceil(world.rows / 8)),
      mode: this.mapMode,
    };
  }

  /**
   * Uzak önbellek pişirmesinin bir satır bandını işler. Satır bandı kendi
   * içinde bütündür: her kare 6 kenarını da kendisi çizdiği için bant
   * sınırında sınır/ızgara eksiği kalmaz (repaintTiles ile aynı ilke).
   * Dikiş hayaletleri (±P kolonlar) satır sırasında karıştırılır — ayrı
   * geçişte çizilselerdi ortak kenarda çift kenar yumuşatma dikiş bırakırdı.
   */
  stepFarBake(world) {
    const j = this.farJob;
    if (!j || j.world !== world || j.mode !== this.mapMode) {
      this.farJob = null;
      return false;
    }
    const P = world.wrapWidth;
    const endRow = Math.min(world.rows, j.row + j.step);
    const bakeTiles = [];
    for (let row = j.row; row < endRow; row++) {
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
    this.drawTerrain(j.ctx, bakeTiles, world, true);
    if (this.mapMode === 'political') this.drawOccupationOverlay(j.ctx, world, bakeTiles, j.scale);
    if (this.mapMode === 'construction') {
      this.drawConstructionOverlay(j.ctx, world, bakeTiles, j.scale);
    }
    if (this.showsPolitics()) this.drawBorders(j.ctx, world, bakeTiles, j.scale);
    j.row = endRow;
    if (j.row >= world.rows) {
      const b = world.bounds;
      this.cache = {
        canvas: j.canvas, x: WRAP_X0, y: b.minY, w: P,
        h: b.maxY - b.minY, scale: j.scale, widthPx: j.widthPx, heightPx: j.heightPx,
      };
      this.farJob = null;
    }
    return true;
  }

  /**
   * Zemin dolgusu. Kipe göre renk seçilir ama çizim tek geçişte, renge göre
   * gruplanarak yapılır (binlerce hex için tek fill çağrısı başına bir path).
   *
   * Kâğıt dokusunun kara/deniz yolları YALNIZ önbellek pişirilirken kurulur.
   * Önceden her karede kuruluyordu ama `paintAtlas` canlı karede hiçbir şey
   * çizmiyor: 3243 hex için karede 15.5 ms tamamen boşa gidiyordu (ölçüldü).
   */
  /** Zemin dolgularının kendisi: renge göre grupla, parçalı yollarla doldur. */
  paintTileFills(ctx, tiles, world) {
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
  }

  drawTerrain(ctx, tiles, world, baking = false) {
    this.paintTileFills(ctx, tiles, world);
    // Canlı yakın dal artık buradan geçmez: statik katman kurucusu dolgu,
    // kıyı ve su tabanını kendi çizer (bkz. buildStaticLayers). Bu yol
    // yalnız uzak-zoom önbelleği pişirilirken/onarılırken kullanılır.
    if (!baking) return;
    const land = [];
    const sea = [];
    for (const t of tiles) (t.terrain.water ? sea : land).push(t);
    if (this.waterAnimatedMode()) this.paintShore(ctx, world, land);
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
  }

  /**
   * Kıyının hemen içindeki kara şeridi ısıtılmış açık tonla yıkanır: deniz
   * kenarı kağıt üstünde hafifçe "güneş almış" okunur ve kıyı çizgisinin
   * mürekkebi (water.drawCoastline) bu açıklıkla kontrast kazanır.
   */
  paintShore(ctx, world, landTiles) {
    const shoreSet = this.shoreSetOf(world);
    const shore = [];
    for (const t of landTiles) {
      if (shoreSet.has(t.ghostOf ?? t)) shore.push(t);
    }
    if (!shore.length) return;
    // 0.06 algı eşiğinin altındaydı; 0.11 kıyı şeridini "güneş almış"
    // gösterir ama kum rengine boyamaz.
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = '#f0dfae';
    for (const path of this.chunkedHexPaths(shore, FILL_CHUNK)) ctx.fill(path);
    ctx.globalAlpha = 1;
  }

  /** Denize komşu kara kareleri; dünya başına bir kez çıkarılır. */
  shoreSetOf(world) {
    if (this.shoreCache?.world === world) return this.shoreCache.set;
    const set = new Set();
    for (const t of world.tiles) {
      if (!t || t.terrain.water) continue;
      for (const n of world.neighbors(t)) {
        if (n.terrain.water) {
          set.add(t);
          break;
        }
      }
    }
    this.shoreCache = { world, set };
    return set;
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
      // Barış teklifi küme anahtarı taşır: seçim bütün kümeyi boyar.
      const key = `p${tile.provinceId}`;
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
    // Su kimsenin toprağı değil; geo kiplerinde taban rengi derinlikten
    // gelir (bkz. water.seaShade — sığlık turkuaz, abis petrol). Seçim
    // yüzeyi kipleri yukarıda kendi düz sularını döndürdü.
    if (tile.terrain.water) {
      if (this.waterAnimatedMode()) return this.water.seaColor(world, tile);
      return tile.terrain.color;
    }
    if (this.mapMode === 'terrain' || this.mapMode === 'geography') {
      return this.terrainTint(tile.terrain, tileStep(tile));
    }

    if (this.mapMode === 'cultures') {
      if (tile.culture < 0) return this.neutralTint(tile.terrain, tileStep(tile));
      return this.ownerTint(world.cultures[tile.culture], tile.terrain, tile, world);
    }
    const owner = ownerOf(tile, world);
    if (owner < 0) return this.neutralTint(tile.terrain, tileStep(tile));
    return this.ownerTint(world.nations[owner], tile.terrain, tile, world);
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
      const holder = world.nations[controller];
      ctx.fillStyle = holder ? this.nationInk(holder) : '#999';
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
    // Hex ızgarası artık en alt kademe: üstünde province kenarı, onun
    // üstünde ülke sınırı var. Saf siyah değil koyu toprak tonu; üç kademeli
    // hiyerarşi (ızgara < province < ülke) için en sessiz seviye.
    ctx.strokeStyle = 'rgba(8, 12, 12, 0.10)';
    // Deniz ızgara dışıdır: hex kenarları suyu petekli bir zemine çeviriyordu.
    // Su malzemesi komşu deniz hexlerini tek yüzeye köprüler; ızgara bunu bozar.
    const land = tiles.filter((t) => !t.terrain.water);
    // Parçalı yol: tek yolda binlerce hex kurmak karenin tamamını yiyordu
    // (bkz. chunkedHexPaths). Stroke olduğu için bölmek görüntüyü değiştirmez.
    for (const path of this.chunkedHexPaths(land)) ctx.stroke(path);
  }

  /**
   * Province kenarları: kara-kara farklı kümeler arasındaki ince nötr çizgi.
   * Ülke sınırından zayıf, hex ızgarasından güçlü — CK3'ün üç kademeli
   * okuması (hex dokusu / province / ülke). Kıyıda çizilmez, su katmanı
   * kıyıyı zaten anlatıyor.
   */
  drawProvinceEdges(ctx, tiles, world, scale) {
    const c = this.corners;
    const paths = [];
    let path = null;
    let segments = 0;
    for (const t of tiles) {
      if (t.provinceId < 0) continue;
      for (let i = 0; i < 6; i++) {
        const n = world.get(t.q + DIRS[i][0], t.r + DIRS[i][1]);
        if (!n || n.terrain.water || n.provinceId === t.provinceId) continue;
        // Parçalı yol (bkz. chunkedHexPaths gerekçesi).
        if (segments % 512 === 0) {
          path = new Path2D();
          paths.push(path);
        }
        segments++;
        const a = c[i];
        const b = c[(i + 1) % 6];
        path.moveTo(t.x + a[0], t.y + a[1]);
        path.lineTo(t.x + b[0], t.y + b[1]);
      }
    }
    // Ülke sınırından iki kademe zayıf: ince, yumuşak, mürekkep grisi.
    // Ülke konturu 0.9 alfa/3.4px iken province 0.16/1px — hiyerarşi net:
    // province dokusu hissedilir ama ülke sınırıyla asla yarışmaz.
    ctx.lineCap = 'round';
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = 'rgba(10, 15, 14, 0.16)';
    for (const p of paths) ctx.stroke(p);
  }

  /**
   * Seçili karenin province'i tek parça vurgulanır: hangi hexlerin aynı
   * kümede olduğu tıklamadan önce okunur. Üye sayısı ≤8 — her kare yeniden
   * kurmak önbellekten ucuz.
   */
  drawProvinceHighlight(ctx, world, provinceId) {
    const province = world.provinces?.[provinceId];
    if (!province) return;
    const zoom = this.camera.zoom;
    const fill = new Path2D();
    const outline = new Path2D();
    const c = this.corners;
    for (const idx of province.tileIdx) {
      const t = world.tiles[idx];
      this.hexPath(fill, t.x, t.y);
      for (let i = 0; i < 6; i++) {
        const n = world.get(t.q + DIRS[i][0], t.r + DIRS[i][1]);
        if (n && n.provinceId === provinceId) continue;
        const a = c[i];
        const b = c[(i + 1) % 6];
        outline.moveTo(t.x + a[0], t.y + a[1]);
        outline.lineTo(t.x + b[0], t.y + b[1]);
      }
    }
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    ctx.fill(fill);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineWidth = 2.2 / zoom;
    ctx.strokeStyle = 'rgba(229, 202, 132, 0.85)';
    ctx.stroke(outline);
  }

  /** Yalnızca farklı sahipler arasındaki kenarları çizer -> net ülke sınırları. */
  drawBorders(ctx, world, tiles, scale) {
    const byColor = new Map();
    const c = this.corners;
    const cultureMode = this.mapMode === 'cultures';
    // Kenar gölgesi yalnız politik kipte: veri kiplerinde (nüfus, kaynak,
    // inşaat, barış) ulus rengi katmanı okumayı kirletir.
    const edgeMode = this.mapMode === 'political';
    // Sınır da etek kareleri kapsar: dağ silsilesi ülkenin İÇİNDE kalır,
    // sınır çizgisi onun etrafından dolaşmaz.
    const groupOf = (tile) => (cultureMode ? tile.culture : ownerOf(tile, world));

    // 1. geçiş: kenar segmentleri + sınır karesi kümesi (gerçek kare anahtar,
    // sarmal hayaletler karesinden çözülür).
    const boundaryOf = edgeMode ? new Map() : null;
    const ring1ByColor = edgeMode ? new Map() : null;
    for (const t of tiles) {
      const group = groupOf(t);
      if (group < 0) continue;
      const color = cultureMode
        ? world.cultures[group].color
        : this.nationInk(world.nations[group]);
      let path = byColor.get(color);
      if (!path) {
        path = new Path2D();
        byColor.set(color, path);
      }
      let boundary = false;
      for (let i = 0; i < 6; i++) {
        const n = world.get(t.q + DIRS[i][0], t.r + DIRS[i][1]);
        if (n && groupOf(n) === group) continue;
        boundary = true;
        const a = c[i];
        const b = c[(i + 1) % 6];
        path.moveTo(t.x + a[0], t.y + a[1]);
        path.lineTo(t.x + b[0], t.y + b[1]);
      }
      if (boundary && edgeMode) {
        boundaryOf.set(t.ghostOf ?? t, group);
        const tone = this.nationEdgeTone(world.nations[group]);
        let ring = ring1ByColor.get(tone);
        if (!ring) {
          ring = new Path2D();
          ring1ByColor.set(tone, ring);
        }
        this.hexPath(ring, t.x, t.y);
      }
    }

    // 2. geçiş: sınırın bir kare içi. İki halka birlikte, sınıra doğru
    // koyulaşan bir gradyan kurar — ülke kesilmiş kağıt gibi kenarında
    // gölgelenir (Paradox'un imza kenar geçişinin hex karşılığı). Kendi
    // karesine dolgu olduğu için komşu ülkeye taşma/çakışma sorunu yok.
    if (edgeMode) {
      const ring2ByColor = new Map();
      for (const t of tiles) {
        const real = t.ghostOf ?? t;
        if (boundaryOf.has(real)) continue;
        const group = groupOf(t);
        if (group < 0) continue;
        for (let i = 0; i < 6; i++) {
          const n = world.get(t.q + DIRS[i][0], t.r + DIRS[i][1]);
          if (!n || boundaryOf.get(n) !== group) continue;
          const tone = this.nationEdgeTone(world.nations[group]);
          let ring = ring2ByColor.get(tone);
          if (!ring) {
            ring = new Path2D();
            ring2ByColor.set(tone, ring);
          }
          this.hexPath(ring, t.x, t.y);
          break;
        }
      }
      ctx.globalAlpha = 0.13;
      for (const [tone, ring] of ring2ByColor) {
        ctx.fillStyle = tone;
        ctx.fill(ring);
      }
      ctx.globalAlpha = 0.26;
      for (const [tone, ring] of ring1ByColor) {
        ctx.fillStyle = tone;
        ctx.fill(ring);
      }
      ctx.globalAlpha = 1;
    }

    ctx.lineCap = 'round';
    // Kontur: eskisinden ince (4.2→3.4) ama daha koyu ve dolu — sınır
    // "kalın bant" değil "net mürekkep hattı" okunur; kenar gölgesi
    // kalınlık hissini zaten veriyor.
    ctx.lineWidth = 3.4 / scale;
    ctx.strokeStyle = 'rgba(6, 9, 10, 0.9)';
    for (const path of byColor.values()) ctx.stroke(path);

    // İç hat: çok ince, düşük opaklıkta sıcak highlight. Neon bir dış çizgi
    // değil, baskıda hattın iç kenarında kalan açık mürekkep payı.
    ctx.lineWidth = (cultureMode ? 2 : 1.1) / scale;
    for (const [color, path] of byColor) {
      ctx.strokeStyle = cultureMode ? color : 'rgba(203, 178, 122, 0.1)';
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

  /** Denize komşu şehir limandır; kimlik başına bir kez hesaplanır. */
  isPort(world, city) {
    this.portCache ??= new WeakMap();
    let port = this.portCache.get(city);
    if (port === undefined) {
      port = false;
      for (const n of world.neighbors(city.tile)) {
        if (n.terrain.water) {
          port = true;
          break;
        }
      }
      this.portCache.set(city, port);
    }
    return port;
  }

  /** Beş kollu yıldız yolu; başkent nişanı. */
  starPath(path, cx, cy, r) {
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const radius = i % 2 === 0 ? r : r * 0.42;
      const x = cx + Math.cos(angle) * radius;
      const y = cy + Math.sin(angle) * radius;
      if (i === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    path.closePath();
  }

  /**
   * Şehirler: ülke mürekkebinde sur levhası. Kademeler tek sanat dilinde
   * ayrışır — başkent pirinç yıldız taşır, liman çapa işareti alır, tahkimat
   * seviyesi burç dişi olarak okunur. Ham palet rengi yerine nationInk:
   * işaretler haritanın atlas tonuyla aynı aileden gelir.
   */
  drawCities(ctx, world, rect) {
    // Coğrafya kipi fiziksel dünyayı yalnız başına gösterir: şehir de siyasettir.
    if (!world.cities?.length || this.mapMode === 'geography') return;
    const zoom = this.camera.zoom;
    // Ayrıntı işaretleri (yıldız, çapa, diş konturu) uzak zoomda okunmaz;
    // orada yalnız levha kalır, çizim maliyeti de düşer.
    const detailed = zoom >= 0.3;

    for (const city of world.cities) {
      const t = city.tile;
      if (t.x < rect.minX || t.x > rect.maxX || t.y < rect.minY || t.y > rect.maxY) continue;
      const nation = world.nations[city.nationId];
      const isCapital = nation.capital === t;
      const ink = this.nationInk(nation);
      const s = HEX_SIZE * (isCapital ? 0.52 : 0.44);
      // Şehir hexin üst yarısına: aynı karedeki birim onu tamamen örtüyordu.
      const cy = t.y - HEX_SIZE * CITY_OFFSET;

      // Zemin gölgesi: levha haritaya "basılı" değil "oturmuş" dursun.
      // shadowBlur DEĞİL — Gauss gölgesi şehir başına ölçülür maliyet
      // biriktiriyordu; kaydırılmış yarı saydam blok aynı derinliği verir.
      const off = 1.6 / zoom;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fillRect(t.x - s + off * 0.4, cy - s * 0.7 + off, s * 2, s * 1.4);

      ctx.beginPath();
      ctx.rect(t.x - s, cy - s * 0.7, s * 2, s * 1.4);
      ctx.fillStyle = ink;
      ctx.fill();
      ctx.lineWidth = 1.6 / zoom;
      ctx.strokeStyle = 'rgba(4, 8, 10, 0.8)';
      ctx.stroke();

      // Üst ışık: tek çizgilik fildişi vurgu, levhayı metal gibi toplar.
      ctx.fillStyle = 'rgba(238, 228, 200, 0.28)';
      ctx.fillRect(t.x - s, cy - s * 0.7, s * 2, Math.max(0.8 / zoom, s * 0.16));

      // Burçlar: seviye arttıkça üstte daha çok diş.
      const teeth = 1 + city.level;
      const w = (s * 2) / (teeth * 2 - 1);
      ctx.beginPath();
      for (let i = 0; i < teeth; i++) {
        ctx.rect(t.x - s + i * w * 2, cy - s * 0.7 - w * 0.8, w, w * 0.8);
      }
      ctx.fillStyle = ink;
      ctx.fill();
      if (detailed) ctx.stroke();

      if (!detailed) continue;

      // Başkent: sur üstünde pirinç yıldız — bayrağın yanındaki taht nişanı.
      if (isCapital) {
        const star = new Path2D();
        this.starPath(star, t.x, cy - s * 1.35, s * 0.4);
        ctx.fillStyle = '#dfc180';
        ctx.fill(star);
        ctx.lineWidth = 1 / zoom;
        ctx.strokeStyle = 'rgba(40, 28, 8, 0.85)';
        ctx.stroke(star);
      }

      // Liman: levhanın sağında küçük çapa. Deniz ticareti tek bakışta okunur.
      if (this.isPort(world, city)) {
        const ax = t.x + s * 1.5;
        const ay = cy + s * 0.05;
        const ah = s * 0.5;
        const anchor = new Path2D();
        anchor.moveTo(ax, ay - ah);
        anchor.lineTo(ax, ay + ah * 0.55);
        anchor.moveTo(ax - ah * 0.42, ay - ah * 0.45);
        anchor.lineTo(ax + ah * 0.42, ay - ah * 0.45);
        // Alt yay: başlangıç noktasına önce moveTo, yoksa arc mevcut
        // noktadan yaya bağlantı çizgisi çeker.
        const armR = ah * 0.52;
        const a0 = Math.PI * 0.85;
        anchor.moveTo(ax + Math.cos(a0) * armR, ay + ah * 0.05 + Math.sin(a0) * armR);
        anchor.arc(ax, ay + ah * 0.05, armR, a0, Math.PI * 0.15, true);
        ctx.lineCap = 'round';
        // Koyu kılıf + fildişi mürekkep: her zeminde okunur.
        ctx.lineWidth = Math.max(1.1 / zoom, s * 0.09);
        ctx.strokeStyle = 'rgba(4, 8, 10, 0.75)';
        ctx.stroke(anchor);
        ctx.lineWidth = Math.max(0.7 / zoom, s * 0.055);
        ctx.strokeStyle = 'rgba(226, 216, 192, 0.92)';
        ctx.stroke(anchor);
      }
    }
  }

  /** Birim kimlik şeridinin mineral tonu; kare başına dize kurulmasın. */
  nationBand(nation) {
    const key = `nband:${nation.id}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const band = this.mineralize(nation.hue, nation.sat * 0.5, nation.light * 0.8);
    color = `hsl(${Math.round(band.hue)} ${Math.round(band.sat)}% ${Math.round(band.light)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /**
   * Birimler: ülke renginde plaka + tip/mevcut yazısı + STR-ORG çubukları.
   *
   * Sayaç, görsel durum anahtarıyla offscreen'e BİR KEZ pişer ve her karede
   * tek drawImage ile basılır. Canlı çizim ölçüldü: kaydırmada p95 kare
   * süresinin ana kalemiydi (13.9 → 7.2 ms, birimler kapatılınca) ve durakta
   * ~2.3 MB/sn çöp (birim başına gradyan + Path2D + yazı) buradan geliyordu.
   * Sprite yalnız durum değişince yeniden pişer (mevcut/çubuklar haftalık,
   * seçim/muharebe anlık, zoom kovası ~%25 adımda).
   */
  drawUnitCounters(ctx, world, selectedUnit, rect) {
    if (!world.units?.length) return;
    const zoom = this.camera.zoom;
    const width = HEX_SIZE * 1.56;
    const height = HEX_SIZE * 1.08;

    for (const unit of world.units) {
      const tile = unit.tile;
      if (tile.x < rect.minX || tile.x > rect.maxX || tile.y < rect.minY || tile.y > rect.maxY) {
        continue;
      }
      const stack = unitsOn(tile);
      if (stack.length > 1 && stack[0] !== unit) continue;
      const nation = world.nations[unit.nationId];
      const y = tile.y + (tile.city ? HEX_SIZE * UNIT_ON_CITY_OFFSET : 0);
      const left = tile.x - width / 2;
      const top = y - height / 2;

      // Uzak LOD: bu ölçekte sayaç ~7 px — köşe yuvarlağı, gradyan ve
      // çubuklar okunmaz ama maliyeti okunur (ölçüldü: 655 birimlik dünyada
      // su tiki başına ~2.7 ms). Plaka + kimlik şeridi yeter.
      if (zoom < 0.34) {
        const off = 1.5 / zoom;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(left + off * 0.4, top + off, width, height);
        ctx.fillStyle = unit.battleId ? '#3a2018' : '#131a20';
        ctx.fillRect(left, top, width, height);
        ctx.fillStyle = this.nationBand(nation);
        ctx.fillRect(left, top, width, height * 0.3);
        continue;
      }

      const sprite = this.unitSprite(unit, nation, Math.min(stack.length, 9), unit === selectedUnit);
      ctx.drawImage(sprite.canvas, left - sprite.margin, top - sprite.margin, sprite.w, sprite.h);
    }
  }

  /** Sayaç sprite önbelleği; anahtar görsel durumun tamamını taşır. */
  unitSprite(unit, nation, stackLen, selected) {
    // Zoom kovası: sprite 1.25 adımlı ölçek basamağında pişer, ara zoomlarda
    // blit ölçeklenir (≤%12 sapma — durağan kartta okunur fark bırakmıyor).
    const bucket = Math.max(-6, Math.min(10,
      Math.round(Math.log(this.camera.zoom * this.dpr) / Math.log(1.25))));
    const strengthQ = Math.round(
      20 * Math.max(0, Math.min(1, unit.hp / Math.max(1, maxHpOf(unit)))),
    );
    const orgQ = Math.round(Math.max(0, Math.min(100, organizationOf(unit))) / 5);
    const soldiers = compactSoldiers(unit);
    const key = `${bucket}|${nation.id}|${unit.type.id}|${soldiers}|${strengthQ}|${orgQ}|`
      + `${unit.battleId ? 1 : 0}|${selected ? 1 : 0}|${stackLen}|${unit.order?.type ?? ''}`;
    this.unitSprites ??= new Map();
    let sprite = this.unitSprites.get(key);
    if (sprite) return sprite;
    sprite = this.paintCounterSprite(Math.pow(1.25, bucket), {
      nation,
      typeId: unit.type.id,
      soldiers,
      strength: strengthQ / 20,
      organization: orgQ / 20,
      battle: !!unit.battleId,
      selected,
      stackLen,
      order: unit.order?.type ?? null,
    });
    // Basit tavan: taşınca en eski yarı düşer (Map ekleme sıralıdır).
    if (this.unitSprites.size > 900) {
      let drop = this.unitSprites.size / 2;
      for (const k of this.unitSprites.keys()) {
        if (drop-- <= 0) break;
        this.unitSprites.delete(k);
      }
    }
    this.unitSprites.set(key, sprite);
    return sprite;
  }

  /** Sayacın kendisini (0,0) çapasına pişirir; drawUnitCounters blit eder. */
  paintCounterSprite(scale, spec) {
    const width = HEX_SIZE * 1.56;
    const height = HEX_SIZE * 1.08;
    // Pay gölgeyi, yığın rozetini ve çerçeve taşmalarını kapsar.
    const margin = HEX_SIZE * 0.34;
    const w = width + margin * 2;
    const h = height + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.translate(margin, margin);
    // Çizgi kalınlıkları ekranda sabit kalsın: kovanın temsil ettiği zoom.
    const zoom = Math.max(0.2, scale / this.dpr);
    const left = 0;
    const top = 0;
    const x = width / 2;
    const detailed = zoom > 0.46;
    const off = 1.5 / zoom;
    const { nation, strength, organization } = spec;

    const radius = Math.max(1.5 / zoom, HEX_SIZE * 0.1);
    const outer = roundedRectPath(new Path2D(), left, top, width, height, radius);

    // Ucuz gölge: shadowBlur birim başına Gauss maliyeti biriktiriyordu
    // (bkz. drawCities'teki aynı dönüşüm); kaydırılmış koyu blok yeter.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(left + off * 0.4, top + off, width, height);
    // Plaka düz renk değil: üstten alta hafif koyulaşan boyalı metal.
    if (detailed) {
      const plate = ctx.createLinearGradient(left, top, left, top + height);
      plate.addColorStop(0, '#1a2228');
      plate.addColorStop(1, '#0e1417');
      ctx.fillStyle = plate;
    } else ctx.fillStyle = '#141b20';
    ctx.fill(outer);
    // Cerceve ulke renginden alinmaz: doygun uluslarda neon turkuaz bir
    // kutuya donuyordu. Secili birim pirinc, muharebedeki tugla kirmizisi,
    // gerisi mat kirik beyaz.
    ctx.lineWidth = (spec.battle || spec.selected ? 2.4 : 1.4) / zoom;
    ctx.strokeStyle = spec.selected ? '#d0ae62'
      : spec.battle ? '#a95e4a' : 'rgba(206, 196, 172, 0.5)';
    ctx.stroke(outer);

    // Ulke rengi yalniz ust kimlik seridinde: counter haritaya karismaz.
    ctx.save();
    ctx.clip(outer);
    // Kimlik şeridi ülkenin haritadaki mineral tonunu kullanır; ham palet
    // rengi kartı dijital bir rozete çeviriyordu.
    ctx.fillStyle = this.nationBand(nation);
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
      ctx.fillText(TYPE_CODE[spec.typeId] ?? 'DIV', left + width * 0.08, top + height * 0.135);
      ctx.textAlign = 'right';
      ctx.fillText(spec.soldiers, left + width * 0.92, top + height * 0.135);

      // NATO cercevesi ve sinif sembolu koyu govdede acik renkle okunur.
      const symbolWidth = width * 0.58;
      const symbolHeight = height * 0.38;
      const symbolY = top + height * 0.48;
      ctx.lineWidth = 1.15 / zoom;
      ctx.strokeStyle = 'rgba(214, 200, 168, 0.8)';
      ctx.strokeRect(x - symbolWidth / 2, symbolY - symbolHeight / 2, symbolWidth, symbolHeight);
      const symbol = new Path2D();
      natoSymbol(symbol, spec.typeId, x, symbolY, height * 0.2);
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

    if (spec.stackLen > 1) {
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
      ctx.fillText(String(spec.stackLen), left + width - badgeWidth * 0.25, top + badgeWidth * 0.25);
    }

    if (spec.order && detailed) {
      ctx.font = `800 ${Math.round(HEX_SIZE * 0.23)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#f7e7b3';
      ctx.fillText(ORDER_BADGE[spec.order] ?? '', left + width * 0.1, top + height * 0.58);
    }

    if (spec.selected) {
      ctx.lineWidth = 1.15 / zoom;
      ctx.strokeStyle = '#ffffff';
      const inner = roundedRectPath(
        new Path2D(), left + 2 / zoom, top + 2 / zoom,
        width - 4 / zoom, height - 4 / zoom, radius * 0.7,
      );
      ctx.stroke(inner);
    }
    return { canvas, margin, w, h };
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
      // Mineral mürekkep: ham palet iki neon bloğa dönüşüyordu.
      ctx.fillStyle = this.nationInk(world.nations[battle.attackerNation]);
      ctx.fillRect(x - half, y - height / 2, half, height);
      ctx.fillStyle = this.nationInk(world.nations[battle.defenderNation]);
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

  /**
   * Ülke etiket yerleşimi — dünya başına bir kez, sahiplik değişince yeniden.
   *
   * "Bounding box ortası" yerine iki bilgi birleştirilir:
   *   1. Kütle merkezi + kovaryans (PCA): ülkenin ana ekseni etiketin hafif
   *      eğimini (±22°) ve yayılma genişliğini verir. Dikey ülkelerde eğim
   *      iptal edilir — döndürülmüş dikey ad okunmuyor, küçük ad okunuyor.
   *   2. En iyi satır bandı: merkeze yakın, en geniş yatay kara şeridi.
   *      Hilal/L biçimli ülkelerde salt merkez denize/komşuya düşer; band
   *      etiketi ülkenin gövdesine çeker (merkezle %38 harmanlanır).
   *
   * Sarmal dünyada koordinatlar başkent-yerel çözülür: dikişi saran ülkenin
   * ortalaması haritanın öbür ucuna kaçamaz.
   */
  buildLabelLayout(world) {
    const P = world.wrapWidth || 0;
    const acc = new Map();
    for (const t of world.tiles) {
      if (!t || t.terrain.water) continue;
      const owner = ownerOf(t, world);
      if (owner < 0) continue;
      let a = acc.get(owner);
      if (!a) {
        a = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, rows: new Map() };
        acc.set(owner, a);
      }
      const cap = world.nations[owner].capital;
      let dx = t.x - cap.x;
      if (P) dx -= P * Math.round(dx / P);
      const x = cap.x + dx;
      a.n++;
      a.sx += x; a.sy += t.y;
      a.sxx += x * x; a.syy += t.y * t.y; a.sxy += x * t.y;
      let r = a.rows.get(t.row);
      if (!r) {
        r = { min: x, max: x, y: t.y, count: 0 };
        a.rows.set(t.row, r);
      }
      if (x < r.min) r.min = x;
      if (x > r.max) r.max = x;
      r.count++;
    }

    const list = [];
    for (const [owner, a] of acc) {
      const nation = world.nations[owner];
      if (!nation) continue;
      const mx = a.sx / a.n;
      const my = a.sy / a.n;
      const cxx = a.sxx / a.n - mx * mx;
      const cyy = a.syy / a.n - my * my;
      const cxy = a.sxy / a.n - mx * my;
      let angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      // Eğim yalnız yataya yakın eksenlerde: hafif meyil atlas hissi verir,
      // dikey eksende düz kalıp boyut küçültmek okunur olan tek seçenek.
      const vertical = Math.abs(angle) > 0.9;
      const tilt = vertical ? 0 : Math.max(-0.38, Math.min(0.38, angle));

      let band = null;
      let bandScore = -Infinity;
      for (const r of a.rows.values()) {
        if (r.count < 2 && a.n > 6) continue;
        const score = (r.max - r.min) - Math.abs(r.y - my) * 1.35;
        if (score > bandScore) {
          bandScore = score;
          band = r;
        }
      }
      const bx = band ? (band.min + band.max) / 2 : mx;
      const by = band ? band.y : my;
      const x = bx * 0.62 + mx * 0.38;
      const y = by * 0.62 + my * 0.38;
      const spread = Math.sqrt(Math.max(cxx, cyy));
      let avail = Math.max(band ? band.max - band.min : 0, spread * 2.6);
      if (vertical) avail = Math.min(avail, spread * 1.8);

      const name = nation.name.toUpperCase();
      // Büyük ülke büyük yazılır; ad uzunluğu sığmıyorsa boyut iner, bolluk
      // varsa harf aralığı açılıp ülkenin enine yayılır (atlas dizgisi).
      // %118 pay: kıyı ülkesinde adın denize hafifçe taşmasına izin verir.
      let size = Math.max(12, Math.min(32, 8.5 + Math.sqrt(a.n) * 1.15));
      let spacing = size * 0.12;
      const est = (s, sp) => name.length * s * 0.68 + sp * (name.length - 1);
      while (size > 11 && est(size, spacing) > avail * 1.18) {
        size -= 1;
        spacing = size * 0.12;
      }
      if (est(size, spacing) < avail * 0.78) {
        spacing = Math.min(
          size * 0.45,
          spacing + (avail * 0.78 - est(size, spacing)) / Math.max(1, name.length - 1),
        );
      }
      list.push({ x, y, tilt, size, spacing, name, flag: nation.flag, priority: a.n });
    }
    list.sort((a, b) => b.priority - a.priority);
    return list;
  }

  /** Metin genişliği: ada 100px referansında bir kez ölçülür, boyutla ölçeklenir. */
  measureLabel(ctx, refFont, text) {
    this.measureCache ??= new Map();
    const key = refFont + '|' + text;
    let w = this.measureCache.get(key);
    if (w === undefined) {
      ctx.font = refFont;
      w = ctx.measureText(text).width;
      this.measureCache.set(key, w);
    }
    return w;
  }

  /**
   * Üç kademeli etiket sistemi (Paradox LOD'u):
   *   uzak (< 0.68)   → yalnız ülke adları; çakışan küçükler ayıklanır.
   *   orta (0.68-0.95) → ülke + state (province) adları; state'ler nüfus
   *                      önceliğiyle yerleşir, ülkelerin kutusuna giremez.
   *   yakın (≥ 0.8/1.0) → başkent ve şehir adları; ülke adı sönükleşir ama
   *                      kaybolmaz — hiyerarşi yer değiştirir, silinmez.
   * Bütün kademeler tek çarpışma listesini paylaşır: hiçbir yazı başka
   * yazının üstüne binmez, yer yoksa düşük öncelikli olan çizilmez.
   */
  drawLabels(ctx, world) {
    const cam = this.camera;
    const z = cam.zoom;
    // Yerleşim ancak dünya değişince ANINDA kurulur; oyun olayı kirlettiyse
    // en fazla 700 ms'de bir — savaş haftalarında her tikte 15k karelik PCA
    // taraması kare düşürüyordu, etiket çapasının yüz milisaniye geç kayması
    // ise görünmez. Jest sürerken (zoom/kaydırma) hiç kurulmaz: çapalar jest
    // ortasında değişince adlar ekranda sıçrıyor, eriyen eski + beliren yeni
    // kopyalar "rastgele isim yağmuru" gibi okunuyordu.
    const gestureIdle = performance.now()
      - Math.max(this.zoomStamp.at, this.moveStamp.at) > 250;
    if (!this.labelLayout || this.labelLayout.world !== world
      || (this.labelsDirty && gestureIdle
        && performance.now() - (this.labelLayoutAt ?? 0) > 700)) {
      this.labelLayout = { world, list: this.buildLabelLayout(world) };
      this.labelLayoutAt = performance.now();
      this.labelsDirty = false;
    }

    const placed = [];
    const collides = (x, y, w, h) => {
      for (const r of placed) {
        if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return true;
      }
      return false;
    };

    // Zamansal yumuşatma: çarpışma/eşik kararları zoom sırasında kare kare
    // değişebilir; karar değişimi etiketi "pat" diye açıp kapatıyordu. Her
    // etiket kalıcı bir alfa taşır ve hedefine ~150 ms'de kayar — kararlar
    // aynı kalır, geçişler yumuşar. Sıfıra inen kayıt silinir; harita
    // sabitken döngü maliyeti yoktur.
    // dt tavanı 0.05: boşta su kadansı 80 ms'yken 0.1'lik tavan fade'i iki
    // tikte bitiriyordu — adlar "pat" diye açılıyordu. 0.05 ile geçiş her
    // kadansta en az 3-4 adım sürer.
    const dt = Math.min(0.05, Math.max(0, this.waterTime - (this.labelClock ?? this.waterTime)));
    this.labelClock = this.waterTime;
    this.labelAlpha ??= new Map();
    this.labelFadePending = false;
    const fade = (key, target) => {
      const cur = this.labelAlpha.get(key) ?? 0;
      const step = dt * 7;
      const next = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
      if (next !== target) this.labelFadePending = true;
      if (next <= 0.004) this.labelAlpha.delete(key);
      else this.labelAlpha.set(key, next);
      return next;
    };
    const ramp = (v, lo, hi) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
    // Zoom jesti sürerken YENİ etiket kabul edilmez; görünenler kalır ve
    // akar. Hızlı zoom z eşiklerini (state 0.68, şehir 0.78+) tek karede
    // aşıyor ve yüzlerce ad aynı karede tam alfaya yakın beliriyordu —
    // "patlama gibi binlerce isim, sonra geri çekiliyor" hatası buydu.
    // Jest ~200 ms yerleşince kabul normale döner ve adlar rampayla gelir.
    const zoomGesture = performance.now() - this.zoomStamp.at < 200;
    // Karar histerezisi: görünür etiketin kutusu %18 küçültülerek (zor
    // kovulur), görünmeyeninki %15 büyütülerek (zor girer) test edilir.
    // Tek eşikli karar sınır durumunda kare kare salınıyor, etiketler
    // "rastgele belirip gidiyordu". Ekrana talep gerçek kutuyla yazılır.
    const admits = (key, rx, ry, rw, rh) => {
      const wasOn = (this.labelAlpha.get(key) ?? 0) > 0.25;
      if (zoomGesture && !wasOn) return false;
      const m = (wasOn ? -0.18 : 0.15) * Math.min(rw, rh);
      return !collides(rx - m, ry - m, rw + m * 2, rh + m * 2);
    };
    // Sarmal temsilcisi taraf değiştirince (dikişte soldan çıkıp sağdan
    // girme) etiket ekranın öbür ucuna tam alfayla ışınlanıyordu; sıçrama
    // yakalanırsa yeni yerinde sıfırdan erir.
    this.labelPos ??= new Map();
    const anchorJump = (key, x) => {
      const last = this.labelPos.get(key);
      this.labelPos.set(key, x);
      if (last !== undefined && Math.abs(x - last) > cam.viewWidth * 0.5) {
        this.labelAlpha.set(key, 0);
      }
    };

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // --- 1. Ülke adları ---
    // Haritaya gömülü his: boyut zoomla birlikte hafifçe büyür (sabit ekran
    // boyu HUD yazısı gibi duruyordu) ama 0.8–1.2 bandında kalır.
    const zScale = 0.8 + 0.4 * Math.min(1, z);
    const countryAlpha = z <= 0.95 ? 1 : Math.max(0.55, 1 - (z - 0.95) * 0.5);
    for (const L of this.labelLayout.list) {
      const size = L.size * zScale;
      const key = 'n' + L.name;
      if (size < 8) {
        this.labelAlpha.delete(key);
        continue;
      }
      const p = cam.worldToScreenWrapped(L.x, L.y);
      const spacing = L.spacing * zScale;
      const w100 = this.measureLabel(ctx, '600 100px Georgia, "Times New Roman", serif', L.name);
      const w = (w100 * size) / 100 + spacing * L.name.length;
      if (p.x < -w || p.x > cam.viewWidth + w || p.y < -50 || p.y > cam.viewHeight + 50) {
        // Ekran dışı: alfa sıfırlanır ki dönüşte içeri "erirken" girsin.
        this.labelAlpha.delete(key);
        continue;
      }
      const cos = Math.abs(Math.cos(L.tilt));
      const sin = Math.abs(Math.sin(L.tilt));
      // Nefes payı: kutular birbirine değebildiğinde iki komşu ülkenin adı
      // tek kelime gibi okunuyordu (CORMARK+TURLAND). Yatayda yarım harf,
      // dikeyde çeyrek satır tampon.
      const pad = size * 0.5;
      const bw = cos * w + sin * size + pad * 2;
      const bh = sin * w + size * 1.15 + pad * 0.6;
      const rx = p.x - bw / 2;
      const ry = p.y - bh / 2;
      // Küçük ulus keskin eşikte değil 8.5-10 px bandında erir.
      const sizeFactor = ramp(size, 8.5, 10);
      anchorJump(key, p.x);
      const fits = sizeFactor > 0.04 && admits(key, rx, ry, bw, bh);
      if (fits) placed.push({ x: rx, y: ry, w: bw, h: bh });
      const a = fade(key, fits ? countryAlpha * sizeFactor : 0);
      if (a <= 0.01) continue;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(L.tilt);
      ctx.globalAlpha = a;
      ctx.font = `600 ${size.toFixed(1)}px Georgia, "Times New Roman", serif`;
      ctx.letterSpacing = spacing.toFixed(2) + 'px';
      // Yumuşak zemin ayrımı: sert siyah kontur yerine gölge + yarı saydam
      // ince kontur — yazı haritanın mürekkebi gibi, HUD çıkartması değil.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(1.6, size * 0.1);
      ctx.strokeStyle = 'rgba(10, 13, 13, 0.42)';
      ctx.strokeText(L.name, 0, 0);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.fillStyle = 'rgba(236, 227, 205, 0.96)';
      ctx.fillText(L.name, 0, 0);
      ctx.letterSpacing = '0px';
      ctx.restore();
      // Bayrak uzak/orta zoomda kimlik verir; yakında şehir katmanı devralır.
      if (L.flag && z < 0.75) {
        ctx.globalAlpha = a;
        drawFlag(ctx, L.flag, p.x - 9, p.y + bh / 2 + 3, 18, 12);
        ctx.globalAlpha = 1;
      }
    }

    // --- 2. State (province) adları ---
    // Geçiş 0.6'dan itibaren işler ki 0.68 eşiğinin altına inerken etiketler
    // "pat" diye silinmesin — hedef alfa 0'a düşer, erime payı kalır.
    if (z >= 0.6 && world.provinces?.length && this.showsPolitics()) {
      const zoomAlpha = Math.min(0.85, Math.max(0, (z - 0.68) * 4));
      const refFont = '400 small-caps 100px Georgia, "Times New Roman", serif';
      const size = 10.5;
      const visible = [];
      for (const pr of world.provinces) {
        if (!pr.name) continue;
        // Sahipsiz kırlar en yakın zoomda; önce devletlerin toprağı konuşsun.
        if (pr.owner < 0 && z < 1.1) continue;
        const p = cam.worldToScreenWrapped(pr.center.x, pr.center.y);
        if (p.x < -70 || p.x > cam.viewWidth + 70 || p.y < -20 || p.y > cam.viewHeight + 20) {
          continue;
        }
        visible.push({ pr, p });
      }
      visible.sort((a, b) => (b.pr.population ?? 0) - (a.pr.population ?? 0));
      ctx.font = `400 small-caps ${size}px Georgia, "Times New Roman", serif`;
      ctx.letterSpacing = '1.1px';
      for (const { pr, p } of visible) {
        const key = 'p' + pr.center.q + ':' + pr.center.r;
        const w = (this.measureLabel(ctx, refFont, pr.name) * size) / 100 + pr.name.length * 1.1;
        const rx = p.x - w / 2 - 3;
        const ry = p.y - 8;
        anchorJump(key, p.x);
        const fits = zoomAlpha > 0 && admits(key, rx, ry, w + 6, 16);
        if (fits) placed.push({ x: rx, y: ry, w: w + 6, h: 16 });
        const a = fade(key, fits ? zoomAlpha : 0);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = 'rgba(8, 11, 11, 0.32)';
        ctx.strokeText(pr.name, p.x, p.y);
        ctx.fillStyle = 'rgba(226, 219, 198, 0.92)';
        ctx.fillText(pr.name, p.x, p.y);
      }
      ctx.globalAlpha = 1;
      ctx.letterSpacing = '0px';
    }

    // --- 3. Şehir ve başkent adları ---
    // Keskin z eşikleri yerine rampalar: başkent 0.78-0.92, önemli şehir
    // 0.98-1.12, hepsi 1.22-1.36 bandında erir; fade artığı için tarama
    // 0.72'den başlar.
    if (z >= 0.72 && world.cities?.length) {
      const capFont = '600 small-caps 11.5px Georgia, "Times New Roman", serif';
      const cityFont = 'italic 400 10px Georgia, "Times New Roman", serif';
      const capTarget = ramp(z, 0.78, 0.92) * 0.95;
      const majorTarget = ramp(z, 0.98, 1.12) * 0.85;
      const allTarget = ramp(z, 1.22, 1.36) * 0.85;
      for (const city of world.cities) {
        const key = 'c' + city.id;
        const isCapital = world.nations[city.nationId]?.capital === city.tile;
        const target = isCapital
          ? capTarget
          : Math.max(city.level >= 2 ? majorTarget : 0, allTarget);
        if (target <= 0 && !this.labelAlpha.has(key)) continue;
        const p = cam.worldToScreenWrapped(city.tile.x, city.tile.y);
        if (p.x < -60 || p.x > cam.viewWidth + 60 || p.y < -24 || p.y > cam.viewHeight + 24) {
          this.labelAlpha.delete(key);
          continue;
        }
        const name = englishCityName(city.name);
        const ly = p.y + HEX_SIZE * z * 0.68;
        const refFont = isCapital
          ? '600 small-caps 100px Georgia, "Times New Roman", serif'
          : 'italic 400 100px Georgia, "Times New Roman", serif';
        const size = isCapital ? 11.5 : 10;
        const w = (this.measureLabel(ctx, refFont, name) * size) / 100;
        const rx = p.x - w / 2 - 2;
        const ry = ly - 8;
        anchorJump(key, p.x);
        const fits = target > 0 && admits(key, rx, ry, w + 4, 15);
        if (fits) placed.push({ x: rx, y: ry, w: w + 4, h: 15 });
        const a = fade(key, fits ? target : 0);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.font = isCapital ? capFont : cityFont;
        ctx.lineWidth = isCapital ? 1.9 : 1.6;
        ctx.strokeStyle = 'rgba(6, 10, 10, 0.4)';
        ctx.strokeText(name, p.x, ly);
        ctx.fillStyle = isCapital ? 'rgba(240, 231, 208, 0.95)' : 'rgba(223, 214, 192, 0.85)';
        ctx.fillText(name, p.x, ly);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
