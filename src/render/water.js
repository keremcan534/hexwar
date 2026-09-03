// Deniz yüzeyi katmanı. Amaç fiziksel doğruluk değil optik yanılsama:
// birkaç ayrı frekansta, tek başına fark edilmeyecek kadar soluk katman üst
// üste binince su "canlı" okunur. Tek güçlü doku hem döşeme izini ele verir
// hem stratejik okunurluğu bozar; bu yüzden hiçbir katman tek başına
// belirgin değildir.
//
// Bütün desenler DÜNYA uzayına sabitlenir: pattern dönüşümü kamera
// dönüşümünün altında çalışır, kamera kayınca oyuncu suyun üzerinden geçer,
// doku ekrana yapışmaz.
//
// Katman notu: DOM'a dokunur (canvas/pattern üretir), oyun durumuna dokunmaz.

import { DIRS, HEX_CORNERS } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { makeRng, fbm } from './textures.js';

const TAU = Math.PI * 2;

/** renderer.FILL_CHUNK ile aynı gerekçe: tek dev Path2D süper-doğrusal pahalı. */
const FILL_CHUNK = 256;

/** LOD eşikleri: uzak zoomda okunmayan detayın maliyeti boşa gider. */
const RIPPLE_MIN_ZOOM = 0.55;
const SHIMMER_MIN_ZOOM = 0.85;
const RIPPLE_DETAIL_ZOOM = 1.6;
const FOAM_MIN_ZOOM = 0.45;

/**
 * Hâkim dalga yönü güneybatıdan kuzeydoğuya (canvas'ta y aşağı olduğundan y
 * negatif). Katmanlar aynı yöne yakın ama aynı hızda değil: eşzamanlı hareket
 * "kayan tek fotoğraf" gibi okunur. Hızlar dünya pikseli/saniyedir.
 */
const SWELL_VEL = { x: 3.4, y: -2.2 };
const RIPPLE_VEL = { x: 6.2, y: -3.4 };
const RIPPLE_DETAIL_VEL = { x: 7.8, y: -1.8 };
const SHIMMER_VEL = { x: 9.5, y: -7.4 };

/**
 * Deniz TABAN rengi: karaya uzaklığın (yumuşatılmış halka) fonksiyonu.
 * Önceki sürüm derinliği alfa 0.02-0.11'lik overlay halkalarla anlatıyordu —
 * koyu tabanda algı eşiğinin altında kalıyordu. Artık bantlar tabanın
 * kendisidir: sığlık turkuaza açılır (L%27), açık deniz petrol lacivertine
 * iner (L%9). ~18 puanlık gerçek değer aralığı + ton kayması; derinlik
 * overlay'siz, ilk bakışta okunur.
 *
 * @param depth 0 (kıyı) .. 6 (abis), kesirli olabilir
 * @param jitterStep −1..1 — kare başına kırıklık, mekanik bant izini bozar
 */
function seaShade(depth, jitterStep) {
  const t = Math.min(1, depth / 5.5);
  // Derinliğin ASIL anlatıcısı artık bu değil: sürekli bir kıyı-uzaklığı
  // rasteri denizin tamamını boyuyor (bkz. material.paintSea). Bu dolgu onun
  // ALTINDA kalır ve yalnız rasterin yumuşatılmış kenarında görünür — bu
  // yüzden rasterin paletiyle HİZALI tutulur, yoksa kıyıda ince bir renk
  // uyuşmazlığı şeridi kalır. Hex başına tek ton olduğu için burada geniş bir
  // aralık tutmanın bedeli petek görünümüydü; aralık kasten dar.
  const hue = 186 + t * 12;
  const sat = 26 + t * 8;
  const light = 22 - t * 14 + jitterStep * 0.5;
  return `hsl(${Math.round(hue)} ${Math.round(sat)}% ${(Math.round(light * 2) / 2).toFixed(1)}%)`;
}

function smoothstep(edge0, edge1, v) {
  const t = Math.min(1, Math.max(0, (v - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** fbm ortalamaya sıkışır; eşikleme anlamlı olsun diye alan 0..1'e gerilir. */
function normalized(field) {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < field.length; i++) {
    if (field[i] < min) min = field[i];
    if (field[i] > max) max = field[i];
  }
  const span = Math.max(1e-6, max - min);
  for (let i = 0; i < field.length; i++) field[i] = (field[i] - min) / span;
  return field;
}

/** Deterministik kenar zarı: köpük parçaları her açılışta aynı yerde dursun. */
function hash01(a, b, c) {
  let h = (a * 374761393 + b * 668265263 + c * 97429177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (((h ^ (h >>> 16)) >>> 0) % 65536) / 65536;
}

/**
 * Alanı verilen yönde sarmalı olarak bulanıklaştırır: kırışıklıklar dalga
 * yönünde uzar. Sarmalı örnekleme döşenebilirliği korur — kenarda dikiş
 * çıkmaz.
 */
function smearWrapped(src, size, dx, dy, taps) {
  const out = new Float32Array(src.length);
  const n = taps * 2 + 1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let k = -taps; k <= taps; k++) {
        const sx = (((x + k * dx) % size) + size) % size;
        const sy = (((y + k * dy) % size) + size) % size;
        sum += src[sy * size + sx];
      }
      out[y * size + x] = sum / n;
    }
  }
  return out;
}

function makeWaterCanvas(size, encode) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  encode(image.data);
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Üç döşenebilir su dokusu, deterministik tohumlarla — her biri AYRI
 * fonksiyon: üretim toplamda ~200 ms tutuyor (ölçüldü) ve tek parça hâlinde
 * ilk kareyi donduruyordu. warmStep menü perdesi arkasında tek tek pişirir.
 * Hepsi alfa kanalında "sapma" taşır ve source-over ile basılır: soft-light
 * benzeri karışımlar mobil canvas'ta ölçülebilir derecede pahalıydı.
 */
function buildSwellTexture() {
  // Geniş kabarma: çok düşük frekans, İKİ yönlü ton sapması (aydınlanan sırt
  // + gölgede kalan çukur). Yalnız aydınlatan tek yönlü doku suyu sütlü
  // gösteriyordu. 1024: döşeme tekrarını uzak zoomda bile seyrekleştirir.
  const ws = 1024;
  const swellField = normalized(fbm(ws, ws, [2, 3, 5], makeRng(180317)));
  return makeWaterCanvas(ws, (data) => {
    for (let i = 0; i < swellField.length; i++) {
      const d = Math.max(-0.5, Math.min(0.5, (swellField[i] - 0.5) * 1.35));
      const p = i * 4;
      // Azami sapma ~%22: eski %12-15 koyu tabanda algı eşiğinin altında
      // kalıyordu (görsel teşhis). 0.30 üstü hâlâ sise kaçar; bu bandın
      // amacı boyanmış denizin geniş ton dalgalanması.
      // Alfa ve aydınlık uç KISILDI (0.22 → 0.10). Deniz tabanı artık çok
      // daha koyu; aynı yıkama o zeminde oransal olarak birkaç kat güçlü
      // düşüyor ve okyanusu "gri bulut tarlası"na çeviriyordu (görsel
      // teşhis). Koyu uç neredeyse aynı kaldı: derinliği bozmuyor.
      if (d > 0) {
        data[p] = 118; data[p + 1] = 142; data[p + 2] = 152;
        data[p + 3] = Math.round(d * 2 * 0.065 * 255);
      } else {
        data[p] = 4; data[p + 1] = 14; data[p + 2] = 22;
        data[p + 3] = Math.round(-d * 2 * 0.22 * 255);
      }
    }
  });
}

function buildRippleTexture() {
  // Kırışıklık: dalga yönünde uzatılmış, ayrı bir maskeyle KIRILAN parçalar.
  // Maske süreksizliği şart — kesintisiz çizgiler taranmış ekran gibi okunur.
  const rs = 512;
  const rippleField = normalized(
    smearWrapped(fbm(rs, rs, [8, 16, 32], makeRng(551201)), rs, 3, -1, 4),
  );
  const rippleMask = normalized(fbm(rs, rs, [3, 5], makeRng(662311)));
  return makeWaterCanvas(rs, (data) => {
    for (let i = 0; i < rippleField.length; i++) {
      const broken = smoothstep(0.34, 0.66, rippleMask[i]);
      const light = smoothstep(0.62, 0.82, rippleField[i]) * broken;
      const dark = smoothstep(0.36, 0.22, rippleField[i]) * broken;
      const p = i * 4;
      // Tavanlar yükseltildi (0.34→0.48 / 0.24→0.34): kırışıklık artık
      // yakın zoomda gerçekten okunan bir dalga dokusu.
      if (light >= dark) {
        data[p] = 138; data[p + 1] = 160; data[p + 2] = 166;
        data[p + 3] = Math.round(light * 0.20 * 255);
      } else {
        data[p] = 8; data[p + 1] = 20; data[p + 2] = 28;
        data[p + 3] = Math.round(dark * 0.30 * 255);
      }
    }
  });
}

function buildShimmerTexture() {
  // Parıltı: ışık yönünde kuvvetle uzatılmış, yalnız tepe değerleri geçen
  // seyrek vurgular. Eşik yumuşak — ikili kesim neon beyaz çizgi üretir.
  // Saf beyaza yalnız en uç "spark" pikselleri yaklaşır.
  const ss = 512;
  const shimmerField = normalized(
    smearWrapped(fbm(ss, ss, [6, 12, 24], makeRng(770129)), ss, 4, -3, 6),
  );
  const shimmerMask = normalized(fbm(ss, ss, [2, 4], makeRng(881407)));
  return makeWaterCanvas(ss, (data) => {
    for (let i = 0; i < shimmerField.length; i++) {
      // Maske TOPLANMAZ, ÇARPILIR: toplandığında geniş maske bölgeleri eşiği
      // topluca aşıyor ve deniz sise gömülüyordu. Çarpım yalnız bazı
      // bölgelerdeki tepe kıvrımlarını parlatır — "ara sıra ışık yakalayan"
      // ince yansımalar.
      // Eşik yüksek tutulur: yalnız en ince tepe kıvrımları geçer. Daha
      // gevşek eşikler iri "virgül" lekeleri üretiyordu — amaç ara sıra
      // kayan İNCE gümüş çizgiler.
      const glow = smoothstep(0.80, 0.93, shimmerField[i]) * smoothstep(0.48, 0.78, shimmerMask[i]);
      const spark = smoothstep(0.94, 0.985, shimmerField[i]) * smoothstep(0.6, 0.85, shimmerMask[i]);
      const p = i * 4;
      data[p] = Math.round(139 + glow * 41 + spark * 43);
      data[p + 1] = Math.round(166 + glow * 24 + spark * 40);
      data[p + 2] = Math.round(173 + glow * 15 + spark * 39);
      // Tavan 0.5 → 0.26: koyulaşan denizde aynı parıltı beyaz bir sis
      // tabakası gibi okunuyordu. Seyrek gümüş kıvrım kalsın, tabaka değil.
      data[p + 3] = Math.round(Math.min(0.26, glow * 0.14 + spark * 0.18) * 255);
    }
  });
}

function scaleVel(vel, k) {
  return { x: vel.x * k, y: vel.y * k };
}

export class WaterLayer {
  constructor() {
    /** 'low' | 'medium' | 'high' — low: taban+kabarma, medium: +kırışık+kıyı, high: +parıltı+yerel etki. */
    this.quality = 'high';
    /** Geliştirici anahtarları; oyuncu arayüzünde yok. Konsoldan: game.renderer.water.debug.shimmer = false */
    this.debug = { base: true, swell: true, ripple: true, shimmer: true, foam: true, disturbance: true };
    /**
     * İleride hava/gün-gece sistemleri bu yüzeyden konuşsun diye API burada
     * hazır; bugün kimse yazmıyor. lightDirection dünya uzayında birim
     * vektördür (yansımanın kaydığı yön).
     */
    this.env = { lightDirection: { x: 0.55, y: -0.84 }, lightIntensity: 1, storminess: 0, windStrength: 1 };
    this.textures = null;
    this.patterns = null;
    this.worldCache = null;
    this.disturbances = [];
    /** Son karede hareketli katman çizildi mi — Game buna bakıp sonraki kareyi zamanlar. */
    this.animatedThisFrame = false;
    this.corners = HEX_CORNERS.map(([x, y]) => [x * HEX_SIZE, y * HEX_SIZE]);
  }

  setEnvironment(partial) {
    Object.assign(this.env, partial);
  }

  ensurePatterns(ctx) {
    if (this.patterns) return this.patterns;
    this.textures ??= {};
    this.textures.swell ??= buildSwellTexture();
    this.textures.ripple ??= buildRippleTexture();
    this.textures.shimmer ??= buildShimmerTexture();
    this.patterns = {
      swell: ctx.createPattern(this.textures.swell, 'repeat'),
      ripple: ctx.createPattern(this.textures.ripple, 'repeat'),
      shimmer: ctx.createPattern(this.textures.shimmer, 'repeat'),
    };
    return this.patterns;
  }

  /** Desenler hazır mı? Değilse çizim atlanır, ısıtma tamamlar (bkz. warmStep). */
  ready() {
    return !!this.patterns;
  }

  /**
   * Isıtma dilimi: bir çağrı en fazla bir doku üretir. Üç doku toplam ~200 ms
   * (ölçüldü) — tek parça üretim ilk su karesini donduruyordu. true = iş kaldı.
   */
  warmStep(ctx) {
    this.textures ??= {};
    if (!this.textures.swell) {
      this.textures.swell = buildSwellTexture();
      return true;
    }
    if (!this.textures.ripple) {
      this.textures.ripple = buildRippleTexture();
      return true;
    }
    if (!this.textures.shimmer) {
      this.textures.shimmer = buildShimmerTexture();
      return true;
    }
    if (!this.patterns && ctx) {
      this.ensurePatterns(ctx);
      return false;
    }
    return !this.patterns;
  }

  hexPath(path, cx, cy) {
    const c = this.corners;
    path.moveTo(cx + c[0][0], cy + c[0][1]);
    for (let i = 1; i < 6; i++) path.lineTo(cx + c[i][0], cy + c[i][1]);
    path.closePath();
  }

  chunkedPaths(tiles) {
    const paths = [];
    let path = null;
    for (let i = 0; i < tiles.length; i++) {
      if (i % FILL_CHUNK === 0) {
        path = new Path2D();
        paths.push(path);
      }
      this.hexPath(path, tiles[i].x, tiles[i].y);
    }
    return paths;
  }

  /**
   * Dünyaya bağlı topoloji bir kez çıkarılır: deniz yolları, kıyı kümesi ve
   * köpük parçaları her karede yeniden hesaplanMAZ. Arazi oyun boyunca
   * değişmediği için anahtar dünya nesnesinin kendisidir.
   */
  ensureWorld(world) {
    if (this.worldCache?.world === world) return this.worldCache;
    const sea = [];
    for (const t of world.tiles) if (t?.terrain.water) sea.push(t);

    const coastalSet = new Set();
    const foamByTile = new Map();
    // Kıyının tam kenarı: köpükten farklı olarak KESİNTİSİZ segmentler.
    // Eski atlasların mürekkep kıyı çizgisi buradan çizilir (drawCoastline).
    const coastSegsByTile = new Map();
    for (const t of sea) {
      let segs = null;
      let inkSegs = null;
      let nearLand = false;
      for (let side = 0; side < 6; side++) {
        const n = world.get(t.q + DIRS[side][0], t.r + DIRS[side][1]);
        if (!n || n.terrain.water) continue;
        nearLand = true;
        {
          const a = this.corners[side];
          const b = this.corners[(side + 1) % 6];
          (inkSegs ??= []).push({
            x1: t.x + a[0], y1: t.y + a[1], x2: t.x + b[0], y2: t.y + b[1],
          });
        }
        // Kenarların bir kısmı hiç köpük almaz, kalanı kısaltılıp opaklık
        // katmanlarına dağıtılır: sürekli beyaz kontur "seçili hex" gibi
        // yapay durur, kırık parçalar kıyı çalkantısı gibi okunur.
        const keep = hash01(t.q, t.r, side * 4);
        if (keep < 0.34) continue;
        const a = this.corners[side];
        const b = this.corners[(side + 1) % 6];
        const t0 = 0.06 + hash01(t.q, t.r, side * 4 + 1) * 0.30;
        const t1 = 0.94 - hash01(t.q, t.r, side * 4 + 2) * 0.30;
        if (t1 - t0 < 0.18) continue;
        const x1 = t.x + a[0] + (b[0] - a[0]) * t0;
        const y1 = t.y + a[1] + (b[1] - a[1]) * t0;
        const x2 = t.x + a[0] + (b[0] - a[0]) * t1;
        const y2 = t.y + a[1] + (b[1] - a[1]) * t1;
        const tier = Math.floor(hash01(t.q, t.r, side * 4 + 3) * 3);
        (segs ??= []).push({ x1, y1, x2, y2, tier });
        // Ara sıra denize doğru ikinci, kısa bir iz: tek hat yerine kırık
        // çift hat — gerçek kıyı köpüğünün dağınıklığı.
        if (keep > 0.74) {
          const emx = (x1 + x2) / 2;
          const emy = (y1 + y2) / 2;
          const px = t.x + (emx - t.x) * 0.74;
          const py = t.y + (emy - t.y) * 0.74;
          const dxs = (x2 - x1) * 0.22;
          const dys = (y2 - y1) * 0.22;
          segs.push({ x1: px - dxs, y1: py - dys, x2: px + dxs, y2: py + dys, tier: (tier + 1) % 3 });
        }
      }
      if (nearLand) {
        coastalSet.add(t);
        if (segs) foamByTile.set(t, segs);
        if (inkSegs) coastSegsByTile.set(t, inkSegs);
      }
    }

    // Karaya uzaklık (hex halkası cinsinden), çok kaynaklı BFS. Halkalar
    // derinlik bantlarını verir: kıyıda aydınlanan sığlık, açıkta koyulaşan
    // abis. Eski gemici haritalarının derinlik konturlarıyla aynı okuma —
    // arazi sınıflandırmasına dokunmadan yalnız boyamada kullanılır.
    const depthOf = new Map();
    let frontier = [...coastalSet];
    for (const t of frontier) depthOf.set(t, 0);
    let depth = 0;
    while (frontier.length && depth < 6) {
      depth++;
      const next = [];
      for (const t of frontier) {
        for (let side = 0; side < 6; side++) {
          const n = world.get(t.q + DIRS[side][0], t.r + DIRS[side][1]);
          if (!n || !n.terrain.water || depthOf.has(n)) continue;
          depthOf.set(n, depth);
          next.push(n);
        }
      }
      frontier = next;
    }

    // Taban rengi: kendi + komşu derinliklerinin ağırlıklı ortalaması bant
    // sınırını kırar (sözde-gradyan). Çeyrek adıma yuvarlama + 3 kademeli
    // jitter, renk çeşidini sınırlı tutar ki drawTerrain'in renge-göre
    // gruplama yolu verimli kalsın (~40-60 ayrı dize).
    const seaColorOf = new Map();
    for (const t of sea) {
      // İKİ halka. Tek halkalık ortalama, derinlik aralığı 10 puanken yetiyordu;
      // aralık 25 puana açılınca komşu hexler arasındaki adım gözle görünür
      // oldu ve deniz PETEK gibi okunmaya başladı. İkinci halka adımı yarıya
      // indirir: derinlik okuması aynı kalır, altıgen basamak kaybolur.
      let sum = (depthOf.get(t) ?? 6) * 3;
      let count = 3;
      for (let side = 0; side < 6; side++) {
        const n = world.get(t.q + DIRS[side][0], t.r + DIRS[side][1]);
        if (!n?.terrain.water) continue;
        sum += (depthOf.get(n) ?? 6) * 2;
        count += 2;
        for (let s2 = 0; s2 < 6; s2++) {
          const m = world.get(n.q + DIRS[s2][0], n.r + DIRS[s2][1]);
          if (!m?.terrain.water || m === t) continue;
          sum += depthOf.get(m) ?? 6;
          count++;
        }
      }
      const smooth = Math.round(Math.min(6, sum / count) * 4) / 4;
      const jitterStep = Math.floor(hash01(t.q, t.r, 11) * 3) - 1;
      seaColorOf.set(t, seaShade(smooth, jitterStep));
    }

    // Deniz yolları 8 kolonluk bantlara bölünür: uzak zoom animasyonu her
    // karede TÜM denizi dolduruyordu; 200x160 dünyada ~20k deniz hexi bunu
    // tek başına kare bütçesinin üstüne çıkarıyor. Bant başına yol listesi
    // sayesinde drawFar yalnız görünür dilimleri doldurur.
    const BAND_COLS = 8;
    const bandMap = new Map();
    for (const t of sea) {
      const idx = Math.floor(t.col / BAND_COLS);
      let band = bandMap.get(idx);
      if (!band) {
        band = { tiles: [], minX: Infinity, maxX: -Infinity };
        bandMap.set(idx, band);
      }
      band.tiles.push(t);
      if (t.x < band.minX) band.minX = t.x;
      if (t.x > band.maxX) band.maxX = t.x;
    }
    const seaBands = [...bandMap.values()].map((band) => ({
      // Hex yarıçapı kadar pay: bandın mürekkebi merkezlerden taşar.
      minX: band.minX - HEX_SIZE * 1.2,
      maxX: band.maxX + HEX_SIZE * 1.2,
      paths: this.chunkedPaths(band.tiles),
    }));

    this.worldCache = {
      world,
      hasSea: sea.length > 0,
      seaTiles: sea,
      seaPaths: this.chunkedPaths(sea),
      seaBands,
      coastalSet,
      coastalPaths: this.chunkedPaths([...coastalSet]),
      foamByTile,
      coastSegsByTile,
      depthOf,
      seaColorOf,
      abyssColor: seaShade(6, 0),
    };
    return this.worldCache;
  }

  /**
   * Karenin taban deniz rengi (bkz. seaShade). Renderer geo kiplerinde dolgu
   * için çağırır; seçim yüzeyi kipleri kendi düz sularını korur.
   */
  seaColor(world, tile) {
    const cache = this.ensureWorld(world);
    return cache.seaColorOf.get(tile.ghostOf ?? tile) ?? cache.abyssColor;
  }

  /**
   * Boyanmış atlas kıyısı — üç geçiş, hepsi kıyının GERÇEK kenar geometrisini
   * izler (hex dolgusu değil): yuvarlak uçlu geniş vuruşlar altıgen
   * basamakları görsel olarak kırar.
   *
   *   1. Sığlık parlaması: geniş, soluk turkuaz — suya taşan kısmı sığ
   *      şerit gibi okunur (kara tarafı kum halosunun altında kalır).
   *   2. Kum halosu: orta genişlikte sıcak bant — kara tarafında plaj
   *      çizgisi, su tarafında kumsal sığlığı.
   *   3. Mürekkep: ince, koyu, kararlı kıyı çizgisi.
   */
  drawCoastline(ctx, cache, coastalVisible, zoom) {
    const paths = [];
    let path = null;
    let count = 0;
    for (const tile of coastalVisible) {
      const segs = cache.coastSegsByTile.get(tile.ghostOf ?? tile);
      if (!segs) continue;
      const dx = tile.ghostOf ? tile.x - tile.ghostOf.x : 0;
      for (const s of segs) {
        if (count % FILL_CHUNK === 0) {
          path = new Path2D();
          paths.push(path);
        }
        count++;
        path.moveTo(s.x1 + dx, s.y1);
        path.lineTo(s.x2 + dx, s.y2);
      }
    }
    if (!paths.length) return;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Dört kademe, dıştan içe daralarak: geniş ve soluk sığlıktan ince ve
    // koyu mürekkebe. Üç kademeliydi ve aradaki sıçrama fazlaydı — kıyı ya
    // "soluk bir bulanıklık" ya "sert bir çizgi" okunuyordu. Dördüncü, dar
    // ve daha parlak turkuaz kademesi ikisini bağlar: §13'ün istediği
    // "çevresel kontrastla aydınlanmış kıyı", neon bir kontur değil.
    // KIYI HALESİ KALDIRILDI. Geniş turkuaz vuruşlar her kıyıyı aynı
    // genişlikte saran bir aura yapıyordu ve oyuncu "kıyı parlaması"nı
    // BİLİNÇLİ olarak görüyordu (§4). Sığlığın kendisi artık kıyı-uzaklığı
    // rasterinin işi — düzensiz, yer yer kaybolan bir şelf. Burada kalan
    // yalnız hattın KENDİSİ: ince koyu bir mürekkep ve onun kara tarafında
    // dar, sıcak bir pay. İkisi de kontrast üretir, ışık değil.
    ctx.lineWidth = Math.max(2.6, 3.4 / Math.sqrt(zoom));
    ctx.strokeStyle = 'rgba(214, 196, 152, 0.16)';
    for (const p of paths) ctx.stroke(p);
    ctx.lineWidth = Math.max(1.1, 1.5 / Math.sqrt(zoom));
    ctx.strokeStyle = 'rgba(5, 12, 16, 0.72)';
    for (const p of paths) ctx.stroke(p);
  }

  /** Desen katmanlarının birleştiği ara tuval (bkz. fillPattern dikiş notu). */
  ensureFx(ctx) {
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    if (!this.fx || this.fx.canvas.width !== w || this.fx.canvas.height !== h) {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      this.fx = { canvas, ctx: canvas.getContext('2d') };
    }
    return this.fx;
  }

  /**
   * Desen dolgusu. Kaydırma pattern dönüşümüyle yapılır: doku dünya uzayında
   * durur, zaman yalnız dönüşümün öteleme bileşenini oynatır — her karede
   * yeni piksel üretilmez.
   *
   * Dikiş notu: yollar FILL_CHUNK'lık parçalardır ve komşu parçaların ortak
   * hex kenarında kenar yumuşatma iki kez uygulanır. Opak dolguda görünmez;
   * YARI SAYDAM desende alfa toplanıp denizde gezinen ince koyu çizgiler
   * bırakıyordu (görsel hata raporu). Çare: parçalar ara tuvalde tam alfayla
   * birleştirilir — ilk parça source-over, kalanlar destination-over (aynı
   * deseni örneklediklerinden ortak kenar pikseli a·c + (1-a)·c = c olur,
   * dikiş matematiksel olarak yok) — ve ana tuvale hedef alfayla TEK blit
   * yapılır. Tek parçalık yol doğrudan çizilir.
   */
  fillPattern(ctx, name, paths, time, vel, alpha, scale = 1, wrapWidth = 0) {
    if (alpha <= 0 || !paths.length) return;
    const pattern = this.patterns[name];
    // Sarmal dünyada desen periyodu dünya periyodunu tam bölmeli; yoksa
    // dikişin iki yanındaki kopyalar aynı denizi farklı fazda gösterir.
    if (wrapWidth) {
      const reps = Math.max(1, Math.round(wrapWidth / (this.textures[name].width * scale)));
      scale = wrapWidth / (this.textures[name].width * reps);
    }
    const period = this.textures[name].width * scale;
    const ox = (((time * vel.x) % period) + period) % period;
    const oy = (((time * vel.y) % period) + period) % period;
    // Tek DOMMatrix örneği güncellenir: her katman her tikte yenisini
    // ayırmak duraklatılmış oyunda dahi sürekli çöp üretiyordu.
    const m = (this.matrix ??= new DOMMatrix());
    m.a = scale; m.b = 0; m.c = 0; m.d = scale; m.e = ox; m.f = oy;
    pattern.setTransform(m);

    if (paths.length === 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = pattern;
      ctx.fill(paths[0]);
      ctx.globalAlpha = 1;
      return;
    }

    const fx = this.ensureFx(ctx);
    const f = fx.ctx;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.clearRect(0, 0, fx.canvas.width, fx.canvas.height);
    f.setTransform(ctx.getTransform());
    f.fillStyle = pattern;
    for (let i = 0; i < paths.length; i++) {
      if (i === 1) f.globalCompositeOperation = 'destination-over';
      f.fill(paths[i]);
    }
    f.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(fx.canvas, 0, 0);
    ctx.restore();
  }

  /**
   * Sahte gök yansıması: tam sahne yansıması yerine ışık yönü boyunca tek
   * düşük frekanslı gradyan. Işığa bakan uç gümüşleşir, ters uç laciverte
   * gömülür — deniz hex hex değil tek parça bir yüzey olarak okunur.
   */
  fillSkyGradient(ctx, world, paths) {
    const b = world.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const r = Math.hypot(b.maxX - b.minX, b.maxY - b.minY) / 2;
    // Silindir dünyada gradyan x'e bağlı olamaz: dikişte açık uç koyu uca
    // çarpar. Işık yönü dikeye izdüşürülür, kutuptan kutba tek geçiş kalır.
    const L = world.wrapWidth
      ? { x: 0, y: this.env.lightDirection.y >= 0 ? 1 : -1 }
      : this.env.lightDirection;
    const k = this.env.lightIntensity;
    // Alfalar KISILDI. Deniz tabanı artık çok daha koyu (bkz. seaShade ve
    // material.paintSea): açık uçtaki 0.13'lük gümüş yıkama, koyu bir zeminde
    // orantısal olarak devasa bir kaldırma demek ve haritanın kuzeyini pus
    // içinde bırakıyordu (görsel teşhis: Zeniov kıyısı boydan boya soluk).
    // "Geniş organik değişim" görevini de artık deniz rasteri üstleniyor;
    // buraya kalan yalnız hafif bir kutup-kutup eğimi.
    const g = ctx.createLinearGradient(cx + L.x * r, cy + L.y * r, cx - L.x * r, cy - L.y * r);
    g.addColorStop(0, `rgba(150, 172, 180, ${(0.045 * k).toFixed(3)})`);
    g.addColorStop(0.55, 'rgba(120, 140, 150, 0.012)');
    g.addColorStop(1, `rgba(4, 12, 20, ${(0.10 * k).toFixed(3)})`);
    ctx.fillStyle = g;
    for (const path of paths) ctx.fill(path);
  }

  /**
   * Yakın zoomun STATİK su tabanı: yalnız gök gradyanı (derinlik zaten
   * taban renklerinde, bkz. seaShade). Renderer'ın statik katman önbelleğine
   * bir kez çizilir; her karede değil (bkz. renderer.buildStaticLayers).
   */
  paintStaticBase(ctx, world, seaTiles) {
    if (!seaTiles.length || !this.debug.base) return;
    this.ensureWorld(world);
    this.fillSkyGradient(ctx, world, this.chunkedPaths(seaTiles));
  }

  /**
   * Yakın zoomun HAREKETLİ katmanları: desenler, köpük, yerel bozulmalar.
   * Su animasyonunun her tikinde yalnız bu çalışır — statik taban ve kıyı
   * çizgisi önbellekten blit edilir. Eski drawNear'ın statik+animasyonu
   * birlikte çizmesi, her tikte tüm boruyu ödetiyordu (ölçüldü: 1920px'te
   * karede 12.4 ms; bunun ~0.5 ms'i gerçekten hareketliydi).
   */
  drawAnimated(ctx, world, seaTiles, seaPaths, zoom, time) {
    if (!seaTiles.length) return;
    this.ensureWorld(world);
    // Dokular hazır değilse bu kare atlanır ama zincir canlı tutulur:
    // ısıtma dilimleri (menü perdesi ya da su tikleri) birkaç adımda
    // tamamlar. Senkron üretim ilk kareyi ~200 ms donduruyordu (ölçüldü).
    if (!this.patterns) {
      this.warmStep(ctx);
      this.animatedThisFrame = true;
      if (!this.patterns) return;
    }
    const quality = this.quality;
    const dbg = this.debug;
    const wind = this.env.windStrength;

    let animated = false;
    const P = world.wrapWidth ?? 0;
    if (dbg.swell) {
      this.fillPattern(ctx, 'swell', seaPaths, time, scaleVel(SWELL_VEL, wind), 0.9, 1, P);
      animated = true;
    }
    if (quality !== 'low' && zoom >= RIPPLE_MIN_ZOOM && dbg.ripple) {
      this.fillPattern(ctx, 'ripple', seaPaths, time, scaleVel(RIPPLE_VEL, wind), 0.6, 1, P);
      if (zoom >= RIPPLE_DETAIL_ZOOM) {
        // Yakın plan: aynı doku yarı ölçekte, farklı yönde — yeni bir doku
        // maliyeti ödemeden çözünürlük hissi artar.
        this.fillPattern(ctx, 'ripple', seaPaths, time, scaleVel(RIPPLE_DETAIL_VEL, wind), 0.35, 0.5, P);
      }
      animated = true;
    }
    if (quality === 'high' && zoom >= SHIMMER_MIN_ZOOM && dbg.shimmer) {
      // Parıltı aralıklıdır: iki yavaş salınımın toplamı bazen sönükleşir,
      // bazen belirginleşir — "her yerde sürekli parlayan" denizden kaçınılır.
      const pulse = 0.45 + 0.35 * Math.sin(time * 0.21) + 0.3 * Math.sin(time * 0.073 + 1.7);
      const alpha = Math.max(0.08, Math.min(0.30, pulse))
        * this.env.lightIntensity * (1 - this.env.storminess * 0.6);
      this.fillPattern(ctx, 'shimmer', seaPaths, time, scaleVel(SHIMMER_VEL, wind), alpha, 1, P);
      animated = true;
    }
    if (animated) this.animatedThisFrame = true;
  }

  /**
   * Çizgi katmanının ÜSTÜNDE yaşayan hareketli su: kıyı köpüğü mürekkep
   * hattının üzerinde nefes alır, bozulma halkaları her şeyin üstünde.
   * Statik üst katman blitinden sonra çağrılır.
   */
  drawSurfaceAnim(ctx, world, seaTiles, zoom, time) {
    const cache = this.ensureWorld(world);
    const quality = this.quality;
    const dbg = this.debug;
    let animated = false;
    if (quality !== 'low' && zoom >= FOAM_MIN_ZOOM && dbg.foam) {
      const foam = this.foamFor(cache, seaTiles);
      if (foam.count) {
        this.drawFoam(ctx, foam.tiers, zoom, time);
        animated = true;
      }
    }
    if (quality === 'high' && dbg.disturbance) {
      animated = this.drawDisturbances(ctx, time) || animated;
    }
    if (animated) this.animatedThisFrame = true;
  }

  /**
   * Köpük yolları görünür deniz listesi başına BİR KEZ kurulur. Liste
   * (renderer.visibleSeaProducts ürünü) kamera hücre değiştirene dek aynı
   * nesne kaldığı için WeakMap anahtarı olarak yeter. Eskiden her su tikinde
   * Path2D'ler baştan kuruluyordu — duraklatılmış oyunda ölçülen ~4 MB/sn
   * çöpün ve GC mikro takılmalarının ana kaynağıydı.
   */
  foamFor(cache, seaTiles) {
    this.foamCache ??= new WeakMap();
    let foam = this.foamCache.get(seaTiles);
    if (foam) return foam;
    const tiers = [[], [], []];
    const counts = [0, 0, 0];
    for (const tile of seaTiles) {
      const segs = cache.foamByTile.get(tile.ghostOf ?? tile);
      if (!segs) continue;
      // Hayalet karede parçalar gerçek karenin koordinatını taşır; periyot
      // kayması kadar ötelenir.
      const dx = tile.ghostOf ? tile.x - tile.ghostOf.x : 0;
      for (const s of segs) {
        // Stroke da parçalanır (bkz. FILL_CHUNK gerekçesi) — kıyısı uzun
        // haritalarda tek Path2D yine süper-doğrusal pahalıya kaçar.
        if (counts[s.tier] % FILL_CHUNK === 0) tiers[s.tier].push(new Path2D());
        counts[s.tier]++;
        const path = tiers[s.tier][tiers[s.tier].length - 1];
        path.moveTo(s.x1 + dx, s.y1);
        path.lineTo(s.x2 + dx, s.y2);
      }
    }
    foam = { tiers, count: counts[0] + counts[1] + counts[2] };
    this.foamCache.set(seaTiles, foam);
    return foam;
  }

  /** Köpük üç opaklık katmanına dağılır; katmanlar farklı fazda "nefes alır". */
  drawFoam(ctx, tiers, zoom, time) {
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.0, 1.7 / Math.sqrt(zoom));
    const base = [0.14, 0.20, 0.28];
    for (let tier = 0; tier < 3; tier++) {
      if (!tiers[tier].length) continue;
      const breathe = 0.75 + 0.25 * Math.sin(time * 0.5 + tier * 2.1);
      ctx.strokeStyle = `rgba(191, 208, 207, ${(base[tier] * breathe).toFixed(3)})`;
      for (const path of tiers[tier]) ctx.stroke(path);
    }
  }

  /**
   * Yerel su bozulması: gemi dümen suyu, top ağzı şok dalgası, patlama gibi
   * gelecekteki etkiler için ortak temel. Oyun sistemlerine bağlı değildir;
   * çağıran dünya koordinatı verir. Görsel dil: önce yüzeyi "düzleyen"
   * basınç yaması (küçük kırışıklıklar kısa süre silinir), ardından dışa
   * yayılan soluk halka — bariz beyaz daire değil.
   */
  addRipple(x, y, { radius = HEX_SIZE * 1.6, strength = 1, duration = 1.8 } = {}) {
    this.disturbances.push({ x, y, radius, strength, duration, start: null });
  }

  drawDisturbances(ctx, time) {
    const list = this.disturbances;
    if (!list.length) return false;
    let write = 0;
    let drawn = false;
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      // Başlangıç ilk çizimde damgalanır: çağıranın zaman kaynağı bilmesi gerekmez.
      if (d.start === null) d.start = time;
      const p = (time - d.start) / d.duration;
      if (p >= 1) continue;
      list[write++] = d;
      drawn = true;
      const ease = 1 - (1 - p) ** 2;
      const r = d.radius * (0.2 + 0.8 * ease);
      ctx.globalAlpha = 0.30 * d.strength * (1 - p);
      ctx.fillStyle = '#123746';
      ctx.beginPath();
      ctx.arc(d.x, d.y, r * 0.85, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.20 * d.strength * (1 - p) ** 1.5;
      ctx.strokeStyle = '#bacccc';
      ctx.lineWidth = Math.max(1.2, r * 0.16 * (1 - p * 0.5));
      ctx.beginPath();
      ctx.arc(d.x, d.y, r, 0, TAU);
      ctx.stroke();
    }
    list.length = write;
    ctx.globalAlpha = 1;
    return drawn;
  }

  /**
   * Uzak-zoom önbelleğine giren statik su tabanı. Hareketli katmanlar burada
   * pişirilmez; onlar canlı karede önbelleğin üstüne biner (bkz. drawFar).
   */
  bakeStatic(ctx, world, tiles = null, { coastline = true } = {}) {
    const cache = this.ensureWorld(world);
    if (!cache.hasSea) return;
    // Alt küme verilirse yalnız o kareler boyanır: sarmal önbelleğin kenar
    // geçişleri tüm denizi yeniden boyayıp alfayı katlamasın.
    const seaTiles = tiles ?? cache.seaTiles;
    const seaPaths = tiles ? this.chunkedPaths(tiles) : cache.seaPaths;
    this.fillSkyGradient(ctx, world, seaPaths);
    // Kıyı hattı ÇAĞIRANIN sırasına bırakılabilir: uzak önbellek artık deniz
    // ve kara dolgusunu ayrı süpürmelerde basıyor (bkz. renderer.stepFarBake)
    // ve burada çizilen hat kara dolgusunun altında kalırdı.
    if (!coastline) return;
    const coastal = seaTiles.filter((t) => cache.coastalSet.has(t.ghostOf ?? t));
    // Uzak zoomda köpük çizilmez; kıyıyı önbellekteki boyalı hat anlatır.
    this.drawCoastline(ctx, cache, coastal, 1);
  }

  /** Yalnız kıyı hattı; uzak önbelleğin mürekkep süpürmesinde çağrılır. */
  bakeCoastline(ctx, world, tiles) {
    const cache = this.ensureWorld(world);
    if (!cache.hasSea) return;
    const coastal = tiles.filter((t) => cache.coastalSet.has(t.ghostOf ?? t));
    if (coastal.length) this.drawCoastline(ctx, cache, coastal, 1);
  }

  /**
   * Uzak zoom: önbellek görüntüsünün üstüne YALNIZ geniş kabarma biner.
   * Kırışıklık/parıltı bu ölçekte okunmaz, maliyeti boşa gider (LOD).
   */
  drawFar(ctx, world, time, rect = null) {
    const cache = this.ensureWorld(world);
    if (!cache.hasSea || !this.debug.swell) return;
    if (!this.patterns) {
      this.warmStep(ctx);
      this.animatedThisFrame = true;
      if (!this.patterns) return;
    }
    // Görünür dikdörtgen verilirse yalnız kesişen bantlar doldurulur.
    let paths = cache.seaPaths;
    if (rect) {
      paths = [];
      for (const band of cache.seaBands) {
        if (band.maxX < rect.minX || band.minX > rect.maxX) continue;
        paths.push(...band.paths);
      }
      if (!paths.length) return;
    }
    this.fillPattern(
      ctx, 'swell', paths, time,
      scaleVel(SWELL_VEL, this.env.windStrength), 0.5, 1, world.wrapWidth ?? 0,
    );
    this.animatedThisFrame = true;
  }
}
