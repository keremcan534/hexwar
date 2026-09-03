// Kara yüzeyinin MALZEMESİ: ışık alanı, kabartma ve pigment.
//
// Sorun şuydu: ülke rengi tek bir `fillStyle` idi. Bir ülkenin toprağı, ne
// kadar büyük olursa olsun, tek düz renk okunuyordu — vektör poligonu gibi.
// Boyalı bir atlasta ise aynı pigment her yerde aynı yoğunlukta değildir:
// sırtlar ışık alır, vadiler gölgede kalır, boya kalınlığı geniş ölçekte
// dalgalanır. Bu dosya o farkı üretir.
//
// Yöntem: her dünya için KÜÇÜK bir ışık alanı (hex başına birkaç teksel)
// pişirilir ve haritanın üstüne `overlay` ile TEK `drawImage` olarak gerilir.
// Neden küçük ve tek çağrı:
//
//   - Hex başına ayrı dolgu, ölçüldüğü gibi (bkz. renderer.paintAtlas notu)
//     binlerce yolda süper-doğrusal pahalıdır.
//   - Alan yumuşatılarak büyütülünce hex basamağı kaybolur; kabartma
//     "altıgen mozaik" değil "boyanmış rölyef" okunur.
//   - Deniz tekselleri NÖTR GRİ bırakılır. overlay'de %50 gri HER zeminde
//     birim elemandır: alan tüm dünyaya tek dikdörtgen olarak serilse bile
//     suya dokunmaz, dolayısıyla kırpma yolu (yani asıl maliyet) hiç
//     gerekmez. Karışım seçiminin gerekçesi için bkz. CLAMP_LO.
//
// Alan dünya başına bir kez kurulur, statik katman/uzak önbellek pişerken
// kullanılır — kare başına değil.
//
// Katman notu: DOM'a dokunur (canvas üretir), oyun durumuna dokunmaz.

import { SQRT3 } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { makeRng, valueNoise, fbm } from './textures.js';

const HEX_STEP = SQRT3 * HEX_SIZE;
const ROW_H = HEX_SIZE * 1.5;
/** Sarmal periyodunun sol kenarı; renderer.WRAP_X0 ile aynı orijin. */
const WRAP_X0 = -HEX_STEP / 2;

/**
 * Alanın hex başına teksel sayısı. 2 = yatayda hexin yarısı, dikeyde satırın
 * yarısı. 1'de tek dağ hexi büyütülünce baklava biçimli bir leke oluyordu
 * (çift doğrusal örneklemenin üçgen kusuru); 2 + bulanıklık onu yumuşak bir
 * sırta çeviriyor. 4 ölçülebilir bir görsel fark vermeden belleği dörtlüyor.
 */
const SUB = 2;

/**
 * Güneş yönü (ekran uzayı, y aşağı). Kuzeybatıdan: kartografik gelenek —
 * insan gözü ışığı yukarıdan bekler, tersi kabartmayı çukur okutur.
 */
const SUN = { x: -0.66, y: -0.75 };

/**
 * Arazi başına kabartma kazancı ve pigment karakteri.
 *
 * `relief` eğimin ışığa katkısı: dağ sert, ova sakin. `grain` yerel kırıklık
 * (orman lekeli, çöl düz). `warm` pigmentin sıcaklığa kayması — kurak arazi
 * sarıya, orman maviye çekilir. Hiçbiri ülke rengini DEĞİŞTİRMEZ, yalnız
 * yoğunluğunu oynatır: siyasi okuma bozulmaz (bkz. VICTORIA_LITE "okunurluk").
 */
const CHARACTER = {
  SNOW_PEAK: { relief: 1.35, grain: 0.30, warm: 0.10 },
  MOUNTAIN: { relief: 1.30, grain: 0.34, warm: 0.06 },
  HILLS: { relief: 0.95, grain: 0.30, warm: 0.10 },
  FOREST: { relief: 0.55, grain: 0.46, warm: -0.20 },
  JUNGLE: { relief: 0.55, grain: 0.50, warm: -0.24 },
  GRASSLAND: { relief: 0.45, grain: 0.20, warm: -0.05 },
  PLAINS: { relief: 0.40, grain: 0.16, warm: 0.06 },
  DESERT: { relief: 0.42, grain: 0.12, warm: 0.30 },
  BEACH: { relief: 0.30, grain: 0.14, warm: 0.26 },
  TUNDRA: { relief: 0.45, grain: 0.22, warm: -0.02 },
  ICE: { relief: 0.60, grain: 0.16, warm: 0.02 },
};
const DEFAULT_CHARACTER = { relief: 0.5, grain: 0.2, warm: 0 };

/**
 * KARIŞIM: `overlay`, `soft-light` değil.
 *
 * İlk sürüm soft-light kullanıyordu ve harita puslanıyordu. Sebebi ölçülebilir:
 * soft-light koyu zeminde simetrik değildir. b=0.1 (derin deniz) için aynı
 * büyüklükteki sapma yukarı 0.196, aşağı 0.09 taşır — yani ortalaması tam %50
 * gri olan bir alan bile koyu suyu iki kat daha güçlü AÇAR. Denizin derinliği
 * ve ülkelerin pigmenti bu yüzden griye kaçıyordu.
 *
 * overlay'de ise s=%50 gri HER zeminde birim elemandır (b<0.5 için 2bs, üstü
 * için simetriği; ikisi de s=0.5'te b verir). Böylece siyahlar siyah kalır
 * (§12 "rich blacks"), deniz derinliğini korur ve alan yalnız YEREL kontrast
 * ekler. Karşılığında overlay daha güçlüdür: sapma tavanı daraltılır.
 */
const CLAMP_LO = 0.28;
const CLAMP_HI = 0.72;
/**
 * Bulanıklık sonrası kontrast açılımı. Bulanıklık hex basamağını sildiği gibi
 * tepe gölgelemesini de yassıltıyor; açılım sırtları geri getirir.
 */
const FIELD_CONTRAST = 1.18;

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

/**
 * Sarmalı kutu bulanıklığı. Hex basamağını yumuşatır; yatayda sarmal,
 * dikeyde kenarına kenetlenir (kutuplar sarmal değildir).
 */
function blurWrapped(src, w, h, radius) {
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
      for (let k = -radius; k <= radius; k++) {
        sum += tmp[clamp(y + k, 0, h - 1) * w + x];
      }
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

/**
 * Döşenebilir MODÜLASYON dokusu: opak, orta gri çevresinde salınan bir alan.
 *
 * overlay karışımında %50 gri birim elemandır; bu yüzden ortalaması 128 olan
 * bir doku taban rengin ortalamasını korur, yalnız yerel yoğunluğunu oynatır. `warmth` aydınlık noktaları sıcağa, gölgeleri soğuğa çeker —
 * kâğıdın kendi rengi değil, üstündeki ışığın rengi.
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
 * Dünya dikdörtgenini AYGIT pikseline oturtur (dönüşüm ölçekli-ötelemeli
 * varsayılır; harita boru hattında döndürme yoktur). Kırpma sınırının kesirli
 * kalması komşu dilimler arasında dikiş bırakır.
 */
function snapRect(ctx, rect) {
  const m = ctx.getTransform();
  const sx = m.a || 1;
  const sy = m.d || 1;
  const toWorldX = (px) => (px - m.e) / sx;
  const toWorldY = (py) => (py - m.f) / sy;
  return {
    minX: toWorldX(Math.round(rect.minX * sx + m.e)),
    maxX: toWorldX(Math.round(rect.maxX * sx + m.e)),
    minY: toWorldY(Math.round(rect.minY * sy + m.f)),
    maxY: toWorldY(Math.round(rect.maxY * sy + m.f)),
  };
}

export class LandMaterial {
  constructor() {
    this.cache = null;
    this.grain = null;
    /** Hata ayıklama için katman anahtarları (konsoldan kapatılabilir). */
    this.debug = { field: true, grain: true };
  }

  /** Dünya değişince alan yeniden pişer. */
  invalidate() {
    this.cache = null;
  }

  /**
   * Işık alanını pişirir (dünya başına bir kez).
   *
   * Üç bileşen toplanır:
   *   1. Tepe gölgelemesi — yükseklik eğiminin güneşe izdüşümü.
   *   2. Ortam ışığı — çok geniş ölçekli gürültü; kıta çapında aydınlık ve
   *      gölgeli bölgeler (§16'nın istediği "non-uniform illumination").
   *   3. Pigment — orta ölçekli gürültü; boyanın kalınlık dalgalanması.
   */
  ensureWorld(world) {
    if (this.cache?.world === world) return this.cache;

    const cols = world.cols;
    const rows = world.rows;
    const w = cols * SUB;
    const h = rows * SUB;
    const lum = new Float32Array(w * h).fill(0.5);
    const warm = new Float32Array(w * h);

    // Gürültü tohumu dünyadan türer: aynı tohum aynı ışığı verir.
    const seedText = String(world.seed ?? 'hexwar');
    let seed = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
      seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
    }
    const rng = makeRng(seed >>> 0);
    // Kıta ölçeği (kaba) ve boya ölçeği (orta). İkisi AYRI frekans: tek
    // gürültü ekranda "kum" okunur (bkz. textures.js açılış notu).
    const ambient = valueNoise(w, h, Math.max(3, Math.round(cols / 26)), rng);
    const pigment = valueNoise(w, h, Math.max(6, Math.round(cols / 7)), rng);
    const fine = valueNoise(w, h, Math.max(12, Math.round(cols / 2.2)), rng);

    const at = (col, row) => world.tiles[row * cols + (((col % cols) + cols) % cols)];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const tile = world.tiles[row * cols + col];
        if (!tile) continue;
        const sea = tile.terrain.water;
        const ch = sea ? DEFAULT_CHARACTER : (CHARACTER[tile.terrain.id] ?? DEFAULT_CHARACTER);

        // Eğim: doğu-batı ve kuzey-güney yükseklik farkı. Deniz düz sayılır,
        // yoksa kıyıda sahte bir uçurum ışığı beliriyor.
        let shade = 0;
        if (!sea) {
          const eL = at(col - 1, row).elevation;
          const eR = at(col + 1, row).elevation;
          const eU = world.tiles[Math.max(0, row - 1) * cols + col].elevation;
          const eD = world.tiles[Math.min(rows - 1, row + 1) * cols + col].elevation;
          const gx = (eL - eR) * 3.6;
          const gy = (eU - eD) * 3.6;
          shade = (gx * SUN.x + gy * SUN.y) * ch.relief;
        }

        // Alanın bu hexe düşen teksel bloğu: satır tekliği yarım hex kaydırır
        // (bkz. offsetToAxial), blok tam oraya oturur.
        const x0 = (2 * col + (row & 1)) * (SUB / 2);
        const y0 = row * SUB;
        for (let sy = 0; sy < SUB; sy++) {
          const yy = y0 + sy;
          if (yy >= h) continue;
          for (let sx = 0; sx < SUB; sx++) {
            const xx = (((x0 + sx) % w) + w) % w;
            const i = yy * w + xx;
            const amb = (ambient[i] - 0.5);
            if (sea) {
              // Denize yalnız ortam ışığı: okyanus da tek düz yüzey değildir
              // ama DESENİ water.js'in işi; buradan gelen yalnız geniş
              // ölçekli aydınlık/gölge lekeleri (§7 "atmospheric clouding").
              // overlay nötr olduğu için pay yükseltildi: soft-light'ta aynı
              // pay suyu açıyordu, overlay'de yalnız yerel kontrast ekliyor.
              lum[i] = 0.5 + amb * 0.24;
              warm[i] = 0;
              continue;
            }
            const pig = (pigment[i] - 0.5);
            const grn = (fine[i] - 0.5);
            const v = 0.5 + shade * 0.62 + amb * 0.46 + pig * 0.34 + grn * ch.grain * 0.55;
            lum[i] = clamp(v, CLAMP_LO, CLAMP_HI);
            warm[i] = ch.warm;
          }
        }
      }
    }

    // Bulanıklık hex basamağını siler: alan büyütüldüğünde altıgen kenarı
    // değil yumuşak bir rölyef görünür.
    const soft = blurWrapped(lum, w, h, 1);
    const softWarm = blurWrapped(warm, w, h, 1);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    const data = image.data;
    for (let i = 0; i < soft.length; i++) {
      const v = clamp(0.5 + (soft[i] - 0.5) * FIELD_CONTRAST, CLAMP_LO, CLAMP_HI);
      // Sıcaklık: aydınlık taraf sıcağa, gölge tarafı soğuğa kayar. Böylece
      // ışık yalnız parlaklık değil RENK bilgisi de taşır — §12'nin istediği
      // "cool shadows / warm highlights" tek katmanda çıkar.
      const tone = (v - 0.5) * 0.5 + softWarm[i] * 0.5;
      const p = i * 4;
      data[p] = clamp(v + tone * 0.09, 0, 1) * 255;
      data[p + 1] = v * 255;
      data[p + 2] = clamp(v - tone * 0.09, 0, 1) * 255;
      data[p + 3] = 255;
    }
    ctx.putImageData(image, 0, 0);

    this.cache = {
      world, canvas, w, h,
      x0: WRAP_X0,
      y0: -ROW_H / 2,
      width: cols * HEX_STEP,
      height: rows * ROW_H,
    };
    return this.cache;
  }

  /**
   * Kara greni. textures.makeTexture KULLANILMAZ: o üretici SAYDAM ve tek
   * renge boyalı bir katman verir (alfa dalgalanır, renk sabit). soft-light
   * altında böyle bir katman yalnız KENDİ rengine doğru iter — açık bej bir
   * tint haritayı topluca soldurmuştu (ölçüldü: ülke renkleri pastele döndü,
   * deniz turkuazını kaybetti). Modülasyon dokusu OPAK ve orta gri
   * çevresindedir: aynı doku hem koyultur hem açar, ortalama rengi kaydırmaz.
   *
   *   pigment — boyanın kalınlık lekesi (orta frekans, geniş)
   *   fibre   — kâğıdın lifi (ince gren)
   */
  ensureTextures() {
    if (this.textures) return this.textures;
    this.textures = {
      pigment: modulationTexture({
        size: 512, seed: 5150233, octaves: [3, 6, 11, 23],
        amplitude: 0.22, warmth: 0.30,
      }),
      fibre: modulationTexture({
        size: 256, seed: 8813077, octaves: [24, 64, 128],
        amplitude: 0.12, warmth: 0.10,
      }),
    };
    return this.textures;
  }

  /**
   * Ağır işleri kareye yaymak için: bir çağrı bir adım, iş kaldıysa true.
   * Renderer.warmup menü perdesi arkasında çağırır — dokular ~120 ms tutuyor
   * ve ilk statik katman pişirmesinde tek karede ödenirse harita takılıyor.
   */
  warmStep(ctx, world) {
    if (world && this.cache?.world !== world) {
      this.ensureWorld(world);
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

  /** Desenler dünya uzayına sabitlenir; bir kez üretilip saklanır. */
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

  /**
   * Malzemeyi verilen dünya dikdörtgenine serer. Çağıran DÜNYA uzayındadır
   * (ctx dönüşümü kamera dönüşümüdür), bu yüzden desenler dünyaya kilitlenir
   * ve kamera kaydıkça yüzeyin üzerinden geçilir — doku ekrana yapışmaz.
   *
   * @param rect kopya-yerel görünür dikdörtgen
   * @param scale çizim ölçeği (zoom); ince gren yalnız yakında anlamlı
   */
  paint(ctx, world, rect, scale = 1) {
    const cache = this.ensureWorld(world);
    const P = world.wrapWidth || cache.width;

    // KIRPMA ŞART. Hem alan görüntüsü (dünya yüksekliğince) hem döndürülmüş
    // gren geçişi verilen dikdörtgenin dışına taşar. Uzak önbellek SATIR
    // BANTLARI hâlinde pişer; taşan geçişler her bantta bütün dünyayı
    // yeniden boyuyordu ve overlay sekiz kez katlanıp ülkeleri beyaza/siyaha
    // patlatıyordu (görsel hata: uzak zoomda kıtalar yanmış görünüyordu).
    //
    // Sınır PİKSELE OTURTULUR. Kesirli bir kırpma sınırında kenar yumuşatma
    // iki komşu bandın ortak satırını ya yarım örtüyor ya yarım boş
    // bırakıyordu; sonuç haritayı boydan boya kesen soluk yatay dikişlerdi.
    // İki bant aynı dünya değerini aynı şekilde yuvarladığı için oturtulmuş
    // sınır kusursuz döşenir.
    const snapped = snapRect(ctx, rect);
    const w = snapped.maxX - snapped.minX;
    const h = snapped.maxY - snapped.minY;
    if (w <= 0 || h <= 0) return;
    rect = snapped;

    ctx.save();
    ctx.beginPath();
    ctx.rect(rect.minX, rect.minY, w, h);
    ctx.clip();
    ctx.globalCompositeOperation = 'overlay';
    if (this.debug.field) {
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // Sarmal: görünür dikdörtgene düşen her periyot kopyası ayrı basılır.
      const k0 = Math.floor((rect.minX - cache.x0) / P);
      const k1 = Math.floor((rect.maxX - cache.x0) / P);
      for (let k = k0; k <= k1; k++) {
        ctx.drawImage(
          cache.canvas,
          cache.x0 + k * P, cache.y0, cache.width, cache.height,
        );
      }
    }

    // Kâğıt: pigment lekesi + lif. Desen dünya uzayına kilitlidir, ülke
    // sınırında kesilmez — tek parça bir yüzey gibi davranır.
    if (this.debug.grain && scale > 0.3) {
      const { pigment, fibre } = this.patterns(ctx);
      if (pigment) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = pigment;
        ctx.fillRect(rect.minX, rect.minY, w, h);
        // İkinci geçiş: 2.7 kat büyük ve 31° dönük. Aynı dokudan ikinci bir
        // ölçek maliyetsizdir ve 512 birimlik döşeme izini kırar (§23).
        //
        // Çapa DÜNYA ORİJİNİ, dikdörtgenin köşesi DEĞİL. Desen o anki
        // dönüşüme göre döşendiği için köşeye çapalamak deseni her dilimde
        // başka faza kaydırıyordu; uzak önbelleğin satır bantları arasında
        // haritayı boydan boya kesen soluk yatay dikişler bundandı. Orijine
        // çapalanınca faz bütün dilimlerde aynıdır.
        ctx.save();
        ctx.rotate(0.541);
        ctx.scale(2.7, 2.7);
        const reach = (Math.max(Math.abs(rect.minX), Math.abs(rect.maxX))
          + Math.max(Math.abs(rect.minY), Math.abs(rect.maxY))) / 2.7 + 8;
        ctx.globalAlpha = 0.5;
        ctx.fillStyle = pigment;
        ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
        ctx.restore();
      }
      // Lif yalnız yakında: uzak zoomda teksel altına iner ve moiré üretir.
      if (fibre && scale > 0.55) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = fibre;
        ctx.fillRect(rect.minX, rect.minY, w, h);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
