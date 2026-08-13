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
 * Üç döşenebilir su dokusu, açılışta bir kez, deterministik tohumlarla.
 * Hepsi alfa kanalında "sapma" taşır ve source-over ile basılır: soft-light
 * benzeri karışımlar mobil canvas'ta ölçülebilir derecede pahalıydı.
 */
function buildTextures() {
  // Geniş kabarma: çok düşük frekans, İKİ yönlü ton sapması (aydınlanan sırt
  // + gölgede kalan çukur). Yalnız aydınlatan tek yönlü doku suyu sütlü
  // gösteriyordu. 1024: döşeme tekrarını uzak zoomda bile seyrekleştirir.
  const ws = 1024;
  const swellField = normalized(fbm(ws, ws, [2, 3, 5], makeRng(180317)));
  const swell = makeWaterCanvas(ws, (data) => {
    for (let i = 0; i < swellField.length; i++) {
      const d = Math.max(-0.5, Math.min(0.5, (swellField[i] - 0.5) * 1.35));
      const p = i * 4;
      // Azami sapma ~%12, tipik ~%4: kabarma "ton dalgalanması" olarak
      // hissedilmeli. İlk denemedeki 0.30'luk tavan denizi sisle kaplıyordu.
      if (d > 0) {
        data[p] = 150; data[p + 1] = 172; data[p + 2] = 182;
        data[p + 3] = Math.round(d * 2 * 0.13 * 255);
      } else {
        data[p] = 5; data[p + 1] = 17; data[p + 2] = 24;
        data[p + 3] = Math.round(-d * 2 * 0.15 * 255);
      }
    }
  });

  // Kırışıklık: dalga yönünde uzatılmış, ayrı bir maskeyle KIRILAN parçalar.
  // Maske süreksizliği şart — kesintisiz çizgiler taranmış ekran gibi okunur.
  const rs = 512;
  const rippleField = normalized(
    smearWrapped(fbm(rs, rs, [8, 16, 32], makeRng(551201)), rs, 3, -1, 4),
  );
  const rippleMask = normalized(fbm(rs, rs, [3, 5], makeRng(662311)));
  const ripple = makeWaterCanvas(rs, (data) => {
    for (let i = 0; i < rippleField.length; i++) {
      const broken = smoothstep(0.34, 0.66, rippleMask[i]);
      const light = smoothstep(0.62, 0.82, rippleField[i]) * broken;
      const dark = smoothstep(0.36, 0.22, rippleField[i]) * broken;
      const p = i * 4;
      if (light >= dark) {
        data[p] = 168; data[p + 1] = 188; data[p + 2] = 192;
        data[p + 3] = Math.round(light * 0.34 * 255);
      } else {
        data[p] = 10; data[p + 1] = 22; data[p + 2] = 30;
        data[p + 3] = Math.round(dark * 0.24 * 255);
      }
    }
  });

  // Parıltı: ışık yönünde kuvvetle uzatılmış, yalnız tepe değerleri geçen
  // seyrek vurgular. Eşik yumuşak — ikili kesim neon beyaz çizgi üretir.
  // Saf beyaza yalnız en uç "spark" pikselleri yaklaşır.
  const ss = 512;
  const shimmerField = normalized(
    smearWrapped(fbm(ss, ss, [6, 12, 24], makeRng(770129)), ss, 4, -3, 6),
  );
  const shimmerMask = normalized(fbm(ss, ss, [2, 4], makeRng(881407)));
  const shimmer = makeWaterCanvas(ss, (data) => {
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
      data[p + 3] = Math.round(Math.min(0.35, glow * 0.22 + spark * 0.18) * 255);
    }
  });

  return { swell, ripple, shimmer };
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
    this.textures ??= buildTextures();
    this.patterns = {
      swell: ctx.createPattern(this.textures.swell, 'repeat'),
      ripple: ctx.createPattern(this.textures.ripple, 'repeat'),
      shimmer: ctx.createPattern(this.textures.shimmer, 'repeat'),
    };
    return this.patterns;
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
    for (const t of sea) {
      let segs = null;
      let nearLand = false;
      for (let side = 0; side < 6; side++) {
        const n = world.get(t.q + DIRS[side][0], t.r + DIRS[side][1]);
        if (!n || n.terrain.water) continue;
        nearLand = true;
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
      }
    }

    this.worldCache = {
      world,
      hasSea: sea.length > 0,
      seaPaths: this.chunkedPaths(sea),
      coastalSet,
      coastalPaths: this.chunkedPaths([...coastalSet]),
      foamByTile,
    };
    return this.worldCache;
  }

  /**
   * Desen dolgusu. Kaydırma pattern dönüşümüyle yapılır: doku dünya uzayında
   * durur, zaman yalnız dönüşümün öteleme bileşenini oynatır — her karede
   * yeni piksel üretilmez.
   */
  fillPattern(ctx, name, paths, time, vel, alpha, scale = 1, wrapWidth = 0) {
    if (alpha <= 0) return;
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
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, ox, oy]));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = pattern;
    for (const path of paths) ctx.fill(path);
    ctx.globalAlpha = 1;
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
    const g = ctx.createLinearGradient(cx + L.x * r, cy + L.y * r, cx - L.x * r, cy - L.y * r);
    g.addColorStop(0, `rgba(150, 168, 176, ${(0.07 * k).toFixed(3)})`);
    g.addColorStop(0.55, 'rgba(120, 140, 150, 0.02)');
    g.addColorStop(1, `rgba(6, 16, 24, ${(0.10 * k).toFixed(3)})`);
    ctx.fillStyle = g;
    for (const path of paths) ctx.fill(path);
  }

  /**
   * Yakın zoom su geçişi. `seaTiles`/`seaPaths` yalnız görünür kareleri
   * içerir; pahalı topoloji worldCache'ten gelir. Katman sırası bilinçli:
   * önce statik ton (gradyan, kıyı aydınlanması), sonra hareketli desenler,
   * en üstte köpük ve yerel bozulmalar.
   */
  drawNear(ctx, world, seaTiles, seaPaths, zoom, time) {
    if (!seaTiles.length) return;
    const cache = this.ensureWorld(world);
    this.ensurePatterns(ctx);
    const quality = this.quality;
    const dbg = this.debug;
    const wind = this.env.windStrength;

    if (dbg.base) this.fillSkyGradient(ctx, world, seaPaths);

    let coastalVisible = null;
    if (quality !== 'low' && zoom >= FOAM_MIN_ZOOM) {
      coastalVisible = [];
      // Sarmal hayaletleri (bkz. renderer.visibleTiles) gerçek karesinden çözülür.
      for (const t of seaTiles) if (cache.coastalSet.has(t.ghostOf ?? t)) coastalVisible.push(t);
    }
    if (dbg.base && coastalVisible?.length) {
      // Kıyıda su hafifçe aydınlanır: sığlık, beyaz kontur çizmeden hissedilir.
      // Alfa çok düşük tutulur — düz hex dolgusu güçlenince kıyı şeridi
      // petek deseni olarak okunuyordu.
      ctx.globalAlpha = 0.03;
      ctx.fillStyle = '#9eb4b7';
      for (const path of this.chunkedPaths(coastalVisible)) ctx.fill(path);
      ctx.globalAlpha = 1;
    }

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
      const alpha = Math.max(0.12, Math.min(0.65, pulse))
        * this.env.lightIntensity * (1 - this.env.storminess * 0.6);
      this.fillPattern(ctx, 'shimmer', seaPaths, time, scaleVel(SHIMMER_VEL, wind), alpha, 1, P);
      animated = true;
    }
    if (dbg.foam && coastalVisible?.length) {
      this.drawFoam(ctx, cache, coastalVisible, zoom, time);
      animated = true;
    }
    if (quality === 'high' && dbg.disturbance) {
      animated = this.drawDisturbances(ctx, time) || animated;
    }
    if (animated) this.animatedThisFrame = true;
  }

  /** Köpük üç opaklık katmanına dağılır; katmanlar farklı fazda "nefes alır". */
  drawFoam(ctx, cache, coastalVisible, zoom, time) {
    const tiers = [[], [], []];
    const counts = [0, 0, 0];
    for (const tile of coastalVisible) {
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
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.0, 1.7 / Math.sqrt(zoom));
    const base = [0.10, 0.15, 0.21];
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
  bakeStatic(ctx, world, tiles = null) {
    const cache = this.ensureWorld(world);
    if (!cache.hasSea) return;
    // Alt küme verilirse yalnız o kareler boyanır: sarmal önbelleğin kenar
    // geçişleri tüm denizi yeniden boyayıp alfayı katlamasın.
    const seaPaths = tiles ? this.chunkedPaths(tiles) : cache.seaPaths;
    const coastalPaths = tiles
      ? this.chunkedPaths(tiles.filter((t) => cache.coastalSet.has(t.ghostOf ?? t)))
      : cache.coastalPaths;
    this.fillSkyGradient(ctx, world, seaPaths);
    ctx.globalAlpha = 0.03;
    ctx.fillStyle = '#9eb4b7';
    for (const path of coastalPaths) ctx.fill(path);
    ctx.globalAlpha = 1;
  }

  /**
   * Uzak zoom: önbellek görüntüsünün üstüne YALNIZ geniş kabarma biner.
   * Kırışıklık/parıltı bu ölçekte okunmaz, maliyeti boşa gider (LOD).
   */
  drawFar(ctx, world, time) {
    const cache = this.ensureWorld(world);
    if (!cache.hasSea || !this.debug.swell) return;
    this.ensurePatterns(ctx);
    this.fillPattern(
      ctx, 'swell', cache.seaPaths, time,
      scaleVel(SWELL_VEL, this.env.windStrength), 0.5, 1, world.wrapWidth ?? 0,
    );
    this.animatedThisFrame = true;
  }
}
