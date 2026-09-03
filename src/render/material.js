// Dünyanın YÜZEY MALZEMESİ: kabartma ışığı, pigment ve deniz derinliği.
//
// Sorun şuydu: ülke rengi tek bir `fillStyle`, deniz ise hex başına tek bir
// düz tondu. Boyalı bir atlasta ise pigment her yerde aynı yoğunlukta
// değildir, sırtlar ışık alır, vadiler gölgede kalır ve sığlık kıyıyı düzgün
// bir halka gibi sarmaz — girintili çıkıntılı bir şelftir.
//
// Yöntem: dünya başına BİR KEZ iki raster pişirilir ve haritanın üstüne
// gerilir.
//
//   1. IŞIK ALANI (`light`)  — opak, orta gri çevresinde; `overlay` ile biner.
//      overlay'de %50 gri HER zeminde birim elemandır, dolayısıyla alan tüm
//      dünyaya tek dikdörtgen olarak serilse bile ortalama rengi kaydırmaz;
//      yalnız YEREL kontrast ekler ve siyahlar siyah kalır.
//   2. DENİZ ALANI (`sea`)   — RGBA; karada alfa 0, denizde kıyı-uzaklığına
//      göre renk. Deniz dolgusunun ÜSTÜNE, kara dolgusunun ALTINA serilir
//      (bkz. renderer.paintStaticContent): böylece yumuşatılmış kenarı karaya
//      taşsa bile üstünü kara dolgusu kapatır, hiçbir kırpma yolu gerekmez.
//
// Kıyı uzaklığı GERÇEK bir uzaklık alanıdır (iki geçişli chamfer), hex halkası
// değil; üstüne iki frekansta gürültü bindirilir. Bu yüzden sığlık her kıyıda
// aynı genişlikte parlayan bir hale değil, yer yer genişleyip yer yer kaybolan
// bir şelf olarak okunur.
//
// Alan statik katmana / uzak önbelleğe pişer — kare başına maliyeti yoktur.
//
// Katman notu: DOM'a dokunur (canvas üretir), oyun durumuna dokunmaz.

import { SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { SEA_LEVEL } from '../world/terrain.js';
import { makeRng, valueNoise, fbm } from './textures.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
const ROW_H = HEX_SIZE * 1.5;
/** Sarmal periyodunun sol kenarı; renderer.WRAP_X0 ile aynı orijin. */
const WRAP_X0 = -HEX_STEP / 2;

/**
 * Alanın hex başına teksel sayısı (her iki eksende).
 *
 * 2'ydi ve yetmiyordu: kabartma hex başına tek bir eğim değeriydi, büyütünce
 * yumuşak lekelere dönüşüyordu — "boyanmış rölyef" değil "renkli bulut".
 * 4'te yükseklik rasteri hexler arasında gerçekten enterpole olur, eğim
 * SÜREKLİ bir yüzeyden hesaplanır ve sırtlar sırt gibi durur. 160x96 dünyada
 * 640x384 teksel = 246k; dünya başına bir kez, ısıtma diliminde.
 */
const SUB = 4;

/** Teksel boyu (dünya birimi). Uzaklık alanı doğrudan dünya biriminde çıkar. */
const TEX_W = HEX_STEP / SUB;
const TEX_H = ROW_H / SUB;

/**
 * Güneş yönü (ekran uzayı, y aşağı). Kuzeybatıdan: kartografik gelenek —
 * insan gözü ışığı yukarıdan bekler, tersi kabartmayı çukur okutur.
 */
const SUN = { x: -0.62, y: -0.78 };

/**
 * Arazi karakteri. `relief` eğimin ışığa katkısı, `grain` yerel kırıklık,
 * `tone` sabit parlaklık kayması, `warm` sıcaklığa çekiş.
 *
 * Hiçbiri ülke rengini DEĞİŞTİRMEZ, yalnız yoğunluğunu oynatır: siyasi okuma
 * bozulmaz. Ama orman gerçekten daha koyu ve daha lekeli, çöl daha düz ve
 * daha sıcak olur — yüzey araziyi anlatır.
 */
const CHARACTER = {
  SNOW_PEAK: { relief: 1.55, grain: 0.30, tone: 0.05, warm: 0.08 },
  MOUNTAIN: { relief: 1.60, grain: 0.38, tone: -0.02, warm: 0.04 },
  HILLS: { relief: 1.15, grain: 0.32, tone: 0.00, warm: 0.10 },
  FOREST: { relief: 0.62, grain: 0.52, tone: -0.07, warm: -0.18 },
  JUNGLE: { relief: 0.62, grain: 0.56, tone: -0.09, warm: -0.22 },
  GRASSLAND: { relief: 0.50, grain: 0.22, tone: -0.01, warm: -0.04 },
  PLAINS: { relief: 0.44, grain: 0.16, tone: 0.01, warm: 0.06 },
  DESERT: { relief: 0.46, grain: 0.11, tone: 0.03, warm: 0.28 },
  BEACH: { relief: 0.34, grain: 0.13, tone: 0.03, warm: 0.24 },
  TUNDRA: { relief: 0.52, grain: 0.24, tone: 0.01, warm: -0.02 },
  ICE: { relief: 0.70, grain: 0.15, tone: 0.04, warm: 0.02 },
};
const DEFAULT_CHARACTER = { relief: 0.5, grain: 0.2, tone: 0, warm: 0 };

/**
 * Işık alanının sapma tavanı. overlay güçlü bir karışımdır; ±0.22 kara
 * yüzeyinde ~%45'lik yerel parlaklık oynaması demektir ve kabartmayı taşımaya
 * fazlasıyla yeter. Daha genişi ülke rengini yer.
 */
const CLAMP_LO = 0.28;
const CLAMP_HI = 0.72;
/**
 * Sapmayı SERT kesmek yerine yumuşak sıkıştırma. Dağlık bölgelerde ham eğim
 * tavanı aşıyor ve alan tam beyaz/tam siyah düzlüklere oturuyordu (ölçüldü:
 * tekselin %2.2'si üst, %2.6'sı alt tavanda) — sırt orada bilgi taşımıyor,
 * bantlaşıyordu. tanh tavana asimptotik yaklaşır: en dik yamaç bile detayını
 * korur, aralık yine aşılmaz.
 */
function softClip(v) {
  const R = (CLAMP_HI - CLAMP_LO) / 2;
  return 0.5 + R * Math.tanh((v - 0.5) / R);
}

/**
 * BİLEŞEN AĞIRLIKLARI — kabartma baskın, gürültü tabi.
 *
 * İlk geçişte geniş rastgele aydınlanma (`ambient`) 0.46 ağırlıktaydı ve
 * ekranda baskın sinyaldi: ülkeler "üstüne renkli bulut püskürtülmüş" gibi
 * okunuyordu. Fiziksel ipucu (eğim) ile rastgele ipucu arasındaki sıra artık
 * tersine çevrildi: eğim 1.0, geniş rastgelelik 0.13.
 */
const W_RELIEF = 1.0;
const W_AMBIENT = 0.13;
const W_PIGMENT = 0.20;
const W_GRAIN = 0.44;

/** Deniz: sığlıktan abise geçişin dünya birimindeki erimi (≈4 hex eni). */
const SEA_REACH = HEX_STEP * 4.0;
/** Sığlık bandının kabaca bittiği uzaklık; gürültüyle bozulur. */
const SHELF = HEX_STEP * 0.95;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

function smoothstep(e0, e1, v) {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Ayrılabilir kutu bulanıklığı; yatayda sarmal, dikeyde kenara kenetli. */
function blurWrapped(src, w, h, radius) {
  if (radius <= 0) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += src[base + (((x + k) % w) + w) % w];
      tmp[base + x] = sum / n;
    }
  }
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let sum = 0;
      for (let k = -radius; k <= radius; k++) sum += tmp[clamp(y + k, 0, h - 1) * w + x];
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

/**
 * İki geçişli chamfer uzaklık dönüşümü — tohum tekselden DÜNYA BİRİMİNDE
 * uzaklık. Adım bedelleri tekselin gerçek en/boyudur, yani sonuç doğrudan
 * dünya biriminde çıkar ve eşikler hex eni cinsinden yazılabilir.
 *
 * Yatay sarmal için ileri/geri süpürme İKİ KEZ koşulur: tek turda dikişin
 * solundan sağına bilgi taşınamıyor ve periyodun kenarında sahte bir "kıyıdan
 * uzak" şeridi kalıyor.
 *
 * @param seed 1 = tohum (uzaklık 0), 0 = doldurulacak
 */
function distanceField(seed, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = seed[i] ? 0 : INF;
  const dx = TEX_W;
  const dy = TEX_H;
  const dd = Math.hypot(dx, dy);
  const wrap = (x) => ((x % w) + w) % w;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        let v = d[i];
        const up = y > 0 ? (y - 1) * w : -1;
        if (up >= 0) {
          if (d[up + x] + dy < v) v = d[up + x] + dy;
          if (d[up + wrap(x - 1)] + dd < v) v = d[up + wrap(x - 1)] + dd;
          if (d[up + wrap(x + 1)] + dd < v) v = d[up + wrap(x + 1)] + dd;
        }
        const left = y * w + wrap(x - 1);
        if (d[left] + dx < v) v = d[left] + dx;
        d[i] = v;
      }
    }
    for (let y = h - 1; y >= 0; y--) {
      for (let x = w - 1; x >= 0; x--) {
        const i = y * w + x;
        let v = d[i];
        const down = y < h - 1 ? (y + 1) * w : -1;
        if (down >= 0) {
          if (d[down + x] + dy < v) v = d[down + x] + dy;
          if (d[down + wrap(x - 1)] + dd < v) v = d[down + wrap(x - 1)] + dd;
          if (d[down + wrap(x + 1)] + dd < v) v = d[down + wrap(x + 1)] + dd;
        }
        const right = y * w + wrap(x + 1);
        if (d[right] + dx < v) v = d[right] + dx;
        d[i] = v;
      }
    }
  }
  return d;
}

/**
 * Döşenebilir MODÜLASYON dokusu: opak, orta gri çevresinde salınan bir alan.
 * overlay'de %50 gri birim eleman olduğu için ortalaması 128 olan bir doku
 * taban rengin ortalamasını korur, yalnız yerel yoğunluğunu oynatır.
 * `warmth` aydınlığı sıcağa, gölgeyi soğuğa çeker.
 */
function modulationTexture({ size = 256, seed = 1, octaves = [4, 8, 16], amplitude = 0.25, warmth = 0.2 }) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const field = fbm(size, size, octaves, makeRng(seed));
  for (let i = 0; i < field.length; i++) {
    const d = (field[i] - 0.5) * amplitude;
    const v = clamp(0.5 + d, 0, 1);
    const t = d * warmth;
    const p = i * 4;
    data[p] = clamp(v + t, 0, 1) * 255;
    data[p + 1] = v * 255;
    data[p + 2] = clamp(v - t, 0, 1) * 255;
    data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

/**
 * Dünya dikdörtgenini AYGIT pikseline oturtur. Kırpma sınırı kesirli kalırsa
 * komşu dilimler arasında dikiş görünür.
 */
function snapRect(ctx, rect) {
  const m = ctx.getTransform();
  const sx = m.a || 1;
  const sy = m.d || 1;
  return {
    minX: (Math.round(rect.minX * sx + m.e) - m.e) / sx,
    maxX: (Math.round(rect.maxX * sx + m.e) - m.e) / sx,
    minY: (Math.round(rect.minY * sy + m.f) - m.f) / sy,
    maxY: (Math.round(rect.maxY * sy + m.f) - m.f) / sy,
  };
}

export class LandMaterial {
  constructor() {
    this.cache = null;
    this.grain = null;
    this.textures = null;
    /** Hata ayıklama anahtarları; konsoldan kapatılabilir. */
    this.debug = { field: true, grain: true, sea: true };
  }

  invalidate() {
    this.cache = null;
    this.build = null;
  }

  /**
   * İki rasteri de pişirir (dünya başına bir kez).
   *
   * Sıra önemlidir: önce yükseklik rasteri kurulup YUMUŞATILIR, eğim ondan
   * SONRA hesaplanır. İlk sürüm eğimi hex başına hesaplayıp sonucu
   * yumuşatıyordu; bu, sırt yapısını silip yerine yumuşak lekeler bırakıyordu.
   * Sürekli bir yüzeyin gradyanı ise gerçek bir rölyeftir.
   */
  ensureWorld(world) {
    if (this.cache?.world === world) return this.cache;
    while (!this.buildStep(world));
    return this.cache;
  }

  /**
   * Pişirmenin BİR aşaması. Tamamlandığında true döner.
   *
   * Neden aşamalı: tek parça hâlinde 207 ms tutuyor (ölçüldü, 160x96 dünya)
   * ve bu tek karede ödendiğinde görünür bir takılma. water.js'in doku
   * üretimi aynı sebeple aşamalara bölünmüştü; menü perdesi arkasındaki
   * ısıtma döngüsü (bkz. Renderer.warmup) her çağrıda bir aşama ilerletir.
   */
  buildStep(world) {
    if (this.build?.world !== world) this.build = { world, stage: 0 };
    const B = this.build;
    switch (B.stage) {
      case 0: this.stageRaster(B); break;
      case 1: this.stageFields(B); break;
      case 2: this.stageLight(B); break;
      default: this.stageSea(B); this.build = null; return true;
    }
    B.stage++;
    return false;
  }

  /** 1. aşama: hex verisini rastere yaz, yükseklik yüzeyini yumuşat. */
  stageRaster(B) {
    const world = B.world;
    const cols = world.cols;
    const rows = world.rows;
    const w = cols * SUB;
    const h = rows * SUB;
    const n = w * h;

    const elev = new Float32Array(n);
    const land = new Uint8Array(n);
    const sea = new Uint8Array(n);
    const relief = new Float32Array(n);
    const grainAmt = new Float32Array(n);
    const tone = new Float32Array(n);
    const warmAmt = new Float32Array(n);

    // Hex -> teksel bloğu. Satır tekliği yarım hex kaydırır (offsetToAxial),
    // blok tam oraya oturur: SUB yarım-hex katı olduğu için tam sayı kayma.
    const half = SUB / 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tile = world.tiles[row * cols + col];
        if (!tile) continue;
        const isSea = tile.terrain.water;
        const ch = isSea ? DEFAULT_CHARACTER : (CHARACTER[tile.terrain.id] ?? DEFAULT_CHARACTER);
        // Deniz yüksekliği kara tabanına kenetlenir: gerçek değeriyle
        // bırakılsa kıyıda sahte bir uçurum ışığı beliriyor ve her kıyı
        // parlıyordu. İstediğimiz kıyı ışığı değil, kıyı KONTRASTI.
        const e = isSea ? SEA_LEVEL : tile.elevation;
        const x0 = 2 * col * half + (row & 1) * half;
        const y0 = row * SUB;
        for (let sy = 0; sy < SUB; sy++) {
          const yy = y0 + sy;
          if (yy >= h) continue;
          const rowBase = yy * w;
          for (let sx = 0; sx < SUB; sx++) {
            const i = rowBase + (((x0 + sx) % w) + w) % w;
            elev[i] = e;
            land[i] = isSea ? 0 : 1;
            sea[i] = isSea ? 1 : 0;
            relief[i] = ch.relief;
            grainAmt[i] = ch.grain;
            tone[i] = ch.tone;
            warmAmt[i] = ch.warm;
          }
        }
      }
    }

    // Yükseklik yüzeyi: blok kenarları silinip süreklileşsin. Yarıçap 1 =
    // çeyrek hex; sırtı korur, basamağı siler.
    const surface = blurWrapped(blurWrapped(elev, w, h, 1), w, h, 1);
    Object.assign(B, { cols, rows, w, h, n, land, sea, relief, grainAmt, tone, warmAmt, surface });
  }

  /** 2. aşama: gürültü alanları ve kıyı uzaklığı. */
  stageFields(B) {
    const world = B.world;
    const { cols, w, h, land, sea } = B;

    // Gürültü tohumu dünyadan türer: aynı tohum aynı ışığı verir.
    const seedText = String(world.seed ?? 'hexwar');
    let seed = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
      seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
    }
    const rng = makeRng(seed >>> 0);
    const ambient = valueNoise(w, h, Math.max(3, Math.round(cols / 30)), rng);
    const pigment = valueNoise(w, h, Math.max(8, Math.round(cols / 5)), rng);
    const fine = valueNoise(w, h, Math.max(24, Math.round(cols)), rng);
    // Kıyı bozucuları: sığlık bandının genişliğini yerinden oynatır.
    // Bozucuların FREKANS DENGESİ. İlk ayarda geniş bozucu (±2.1 hex, ~14 hex
    // periyot) baskındı: şelfin genişliği yavaşça değiştiği için kıyı yine
    // "genişliği değişen düzgün bir hale" okunuyordu. İnce bozucu öne alındı
    // — şelf artık kıyı boyunca kesilip yeniden başlıyor.
    const warpBroad = valueNoise(w, h, Math.max(7, Math.round(cols / 9)), rng);
    const warpFine = valueNoise(w, h, Math.max(28, Math.round(cols / 1.9)), rng);
    const foamNoise = valueNoise(w, h, Math.max(40, cols * 2), rng);
    const seaMood = valueNoise(w, h, Math.max(3, Math.round(cols / 34)), rng);

    // Kıyı uzaklığı: denizde karaya, karada denize.
    const toLand = distanceField(land, w, h);
    const toSea = distanceField(sea, w, h);
    Object.assign(B, {
      ambient, pigment, fine, warpBroad, warpFine, foamNoise, seaMood, toLand, toSea,
    });
  }

  /** 3. aşama: ışık alanı (kabartma + pigment + kenar payı). */
  stageLight(B) {
    const {
      w, h, n, land, relief, grainAmt, tone, warmAmt, surface,
      ambient, pigment, fine, toSea,
    } = B;
    const lum = new Float32Array(n);
    const warmOut = new Float32Array(n);
    // Eğim ±2 teksel üzerinden ölçülür: tek teksellik fark yumuşatılmış
    // yüzeyde gürültü tabanının altında kalıyor.
    const SPAN = 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!land[i]) {
          // Denizde ışık alanı neredeyse nötr: derinliğin RENGİ deniz
          // rasterinin işi, buradan yalnız çok geniş ölçekli aydınlık/gölge
          // geçer (§3 "broad organic variation").
          lum[i] = 0.5 + (ambient[i] - 0.5) * 0.07;
          warmOut[i] = 0;
          continue;
        }
        const xl = ((x - SPAN) % w + w) % w;
        const xr = (x + SPAN) % w;
        const yu = Math.max(0, y - SPAN) * w;
        const yd = Math.min(h - 1, y + SPAN) * w;
        const gx = (surface[y * w + xl] - surface[y * w + xr]) / (2 * SPAN * TEX_W);
        const gy = (surface[yu + x] - surface[yd + x]) / (2 * SPAN * TEX_H);
        // Eğim birimi "yükseklik / dünya birimi"; hex ölçeğine getirilir.
        const shade = (gx * SUN.x + gy * SUN.y) * HEX_STEP * 5.2 * relief[i];
        // Kara kenarında koyu bir pay: kıyı, parlayan bir hale değil kesilmiş
        // bir kenar gibi okunsun (§4 "dark edge shadow").
        const rim = -0.13 * (1 - smoothstep(0, HEX_STEP * 0.55, toSea[i]));
        const v = 0.5
          + shade * W_RELIEF
          + (ambient[i] - 0.5) * W_AMBIENT
          + (pigment[i] - 0.5) * W_PIGMENT
          + (fine[i] - 0.5) * grainAmt[i] * W_GRAIN
          + tone[i]
          + rim;
        lum[i] = softClip(v);
        warmOut[i] = warmAmt[i];
      }
    }
    // Çok hafif yumuşatma: teksel gürültüsünü alır, sırtı bırakır.
    const softLum = blurWrapped(lum, w, h, 1);
    const softWarm = blurWrapped(warmOut, w, h, 1);

    const lightCanvas = document.createElement('canvas');
    lightCanvas.width = w;
    lightCanvas.height = h;
    const lctx = lightCanvas.getContext('2d');
    const limg = lctx.createImageData(w, h);
    for (let i = 0; i < n; i++) {
      const v = softLum[i];
      // Aydınlık taraf sıcağa, gölge soğuğa: ışık yalnız parlaklık değil
      // RENK bilgisi de taşır (§2 "cool shadows, warm highlights").
      const t = (v - 0.5) * 0.55 + softWarm[i] * 0.5;
      const p = i * 4;
      limg.data[p] = clamp(v + t * 0.10, 0, 1) * 255;
      limg.data[p + 1] = v * 255;
      limg.data[p + 2] = clamp(v - t * 0.10, 0, 1) * 255;
      limg.data[p + 3] = 255;
    }
    lctx.putImageData(limg, 0, 0);
    B.lightCanvas = lightCanvas;
  }

  /** 4. aşama: deniz rasteri (kıyı uzaklığından üç derinlik bölgesi). */
  stageSea(B) {
    const world = B.world;
    const { cols, rows, w, h, n, sea, toLand, warpBroad, warpFine, foamNoise, seaMood } = B;
    const seaCanvas = document.createElement('canvas');
    seaCanvas.width = w;
    seaCanvas.height = h;
    const sctx = seaCanvas.getContext('2d');
    const simg = sctx.createImageData(w, h);
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      if (!sea[i]) {
        simg.data[p + 3] = 0;
        continue;
      }
      // Uzaklık İKİ frekansta bozulur: geniş bozulma şelfi yer yer açar yer
      // yer kapatır, ince bozulma kenarını tırtıklar. Düzgün halka böyle
      // kırılır — istenen şey "her kıyıyı saran turkuaz hale" DEĞİL.
      const d = toLand[i]
        + (warpBroad[i] - 0.5) * HEX_STEP * 1.25
        + (warpFine[i] - 0.5) * HEX_STEP * 1.05;
      const shelf = 1 - smoothstep(HEX_STEP * 0.15, SHELF, d);
      const deep = smoothstep(SHELF * 0.8, SEA_REACH, d);
      const mood = (seaMood[i] - 0.5);
      // Üç bölge: sığlık (kısık turkuaz) → geçiş → abis (petrol/kömür).
      // Doygun mavi ve turkuaz parıltı YOK (§12).
      const hue = 191 + deep * 10 - shelf * 2;
      const sat = 21 + deep * 11 + shelf * 2;
      // Abis SİYAH DEĞİL koyu petroldür: taban %7.5'te ezik okunuyordu ve
      // geniş salınım (±4.2) bu tabanda oransal olarak devasaydı — deniz
      // "koyu bulutlar" gibi lekeleniyordu. Taban kaldırıldı, salınım kısıldı;
      // sığlık payı da düşürüldü, ışığı artık şelfin kendi rengi taşıyor.
      let light = 10.5 + shelf * 7.5 - deep * 2.2 + mood * 2.0;
      // Kırık köpük: yalnız dar bir bantta ve yalnız gürültü eşiği aşarsa.
      // Sürekli bir kenar çizgisi değil, dağınık parıltı.
      const band = shelf * (1 - smoothstep(HEX_STEP * 0.45, HEX_STEP * 1.0, d));
      const foam = band * Math.max(0, foamNoise[i] - 0.62) * 2.6;
      light += foam * 9;
      const rgb = hslToRgb(hue, clamp(sat + foam * 8, 0, 60), clamp(light, 3, 34));
      simg.data[p] = rgb[0];
      simg.data[p + 1] = rgb[1];
      simg.data[p + 2] = rgb[2];
      simg.data[p + 3] = 255;
    }
    sctx.putImageData(simg, 0, 0);

    this.cache = {
      world, light: B.lightCanvas, sea: seaCanvas, w, h,
      // Kıyı uzaklığı alanı ve yükseklik yüzeyi SAKLANIR: WebGL yüzey katmanı
      // ikisini de doku olarak yükler (bkz. surfaceGL.setWorld). Chamfer
      // dönüşümünü ve yükseklik rasterini iki kez kurmanın anlamı yok, ayrıca
      // iki katmanın kıyısı böylece bit bit aynı yerde durur.
      toLand,
      surface: B.surface,
      x0: WRAP_X0,
      y0: -ROW_H / 2,
      width: cols * HEX_STEP,
      height: rows * ROW_H,
    };
  }

  /**
   * Kara greni. textures.makeTexture KULLANILMAZ: o üretici saydam ve tek
   * renge boyalı bir katman verir, soft-light/overlay altında yalnız kendi
   * rengine iter ve haritayı soldurur. Modülasyon dokusu opak ve orta gri
   * çevresindedir.
   */
  ensureTextures() {
    if (this.textures) return this.textures;
    this.textures = {
      pigment: modulationTexture({
        size: 512, seed: 5150233, octaves: [5, 11, 23, 47],
        amplitude: 0.19, warmth: 0.34,
      }),
      fibre: modulationTexture({
        size: 256, seed: 8813077, octaves: [32, 72, 128],
        amplitude: 0.11, warmth: 0.10,
      }),
    };
    return this.textures;
  }

  /** Bir çağrı bir adım; iş kaldıysa true (bkz. Renderer.warmup). */
  warmStep(ctx, world) {
    if (world && this.cache?.world !== world) {
      this.buildStep(world);
      return true;
    }
    if (!this.textures) {
      this.ensureTextures();
      return true;
    }
    if (!this.grain) {
      this.patterns(ctx);
      return true;
    }
    return false;
  }

  patterns(ctx) {
    if (!this.grain) {
      const tex = this.ensureTextures();
      this.grain = {
        pigment: ctx.createPattern(tex.pigment, 'repeat'),
        fibre: ctx.createPattern(tex.fibre, 'repeat'),
      };
    }
    return this.grain;
  }

  /** Sarmal kopyalar: görünür dikdörtgene düşen her periyot ayrı basılır. */
  blitCopies(ctx, cache, image, rect, P) {
    const k0 = Math.floor((rect.minX - cache.x0) / P);
    const k1 = Math.floor((rect.maxX - cache.x0) / P);
    for (let k = k0; k <= k1; k++) {
      ctx.drawImage(image, cache.x0 + k * P, cache.y0, cache.width, cache.height);
    }
  }

  /**
   * DENİZ katmanı. Deniz dolgusunun üstüne, KARA dolgusunun ALTINA serilir:
   * yumuşatılmış kenarı karaya taşar, üstünü kara dolgusu kapatır. Kırpma
   * yolu gerekmez — binlerce hexlik kırpma bu borunun en pahalı işlemiydi.
   */
  paintSea(ctx, world, rect) {
    if (!this.debug.sea) return;
    const cache = this.ensureWorld(world);
    const P = world.wrapWidth || cache.width;
    const snapped = snapRect(ctx, rect);
    ctx.save();
    ctx.beginPath();
    ctx.rect(snapped.minX, snapped.minY, snapped.maxX - snapped.minX, snapped.maxY - snapped.minY);
    ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    this.blitCopies(ctx, cache, cache.sea, snapped, P);
    ctx.restore();
  }

  /**
   * IŞIK + GREN katmanı. Çağıran DÜNYA uzayındadır, bu yüzden desenler
   * dünyaya kilitlenir ve kamera kaydıkça yüzeyin üzerinden geçilir.
   *
   * Kırpma şart: alan görüntüsü ve döndürülmüş gren geçişi dikdörtgenin
   * dışına taşar (bkz. renderer.stepFarBake iki süpürme notu).
   */
  paint(ctx, world, rect, scale = 1) {
    const cache = this.ensureWorld(world);
    const P = world.wrapWidth || cache.width;
    const snapped = snapRect(ctx, rect);
    const w = snapped.maxX - snapped.minX;
    const h = snapped.maxY - snapped.minY;
    if (w <= 0 || h <= 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(snapped.minX, snapped.minY, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'overlay';
    if (this.debug.field) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      this.blitCopies(ctx, cache, cache.light, snapped, P);
    }
    if (this.debug.grain && scale > 0.3) {
      const { pigment, fibre } = this.patterns(ctx);
      if (pigment) {
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = pigment;
        ctx.fillRect(snapped.minX, snapped.minY, w, h);
        // İkinci geçiş: 2.7 kat büyük, 31° dönük — döşeme izini kırar (§23).
        // Çapa DÜNYA ORİJİNİ: dikdörtgen köşesine çapalanırsa desen her
        // dilimde başka faza kayar ve dilimler arasında dikiş kalır.
        ctx.save();
        ctx.rotate(0.541);
        ctx.scale(2.7, 2.7);
        const reach = (Math.max(Math.abs(snapped.minX), Math.abs(snapped.maxX))
          + Math.max(Math.abs(snapped.minY), Math.abs(snapped.maxY))) / 2.7 + 8;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = pigment;
        ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
        ctx.restore();
      }
      // Lif yalnız yakında: uzak zoomda teksel altına iner ve moiré üretir.
      if (fibre && scale > 0.55) {
        ctx.globalAlpha = 0.65;
        ctx.fillStyle = fibre;
        ctx.fillRect(snapped.minX, snapped.minY, w, h);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}

/** HSL (0-360, 0-100, 0-100) -> 0-255 RGB. */
function hslToRgb(h, s, l) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; } else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; } else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
  const m = L - c / 2;
  return [
    Math.round(clamp(r + m, 0, 1) * 255),
    Math.round(clamp(g + m, 0, 1) * 255),
    Math.round(clamp(b + m, 0, 1) * 255),
  ];
}
