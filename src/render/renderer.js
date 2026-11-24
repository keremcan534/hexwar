// Canvas2D hex çizimi. Görünmeyen hexler kırpılır, aynı renkler tek path'te toplanır,
// uzaklaşınca tüm dünya önceden pişirilmiş tek dokudan basılır.

import { FONT_DISPLAY, FONT_UI, whenFontsReady } from './fonts.js';
import { DIRS, HEX_CORNERS, SQRT3, wrapCol } from '../core/hex.js';
import { HEX_SIZE } from '../world/worldgen.js';
import { englishCityName } from '../game/cities.js';
import { POPULATION_SCALE } from '../game/populationScale.js';
import { drawFlag } from './flagPainter.js';
import { atWar, inCrisis, relation } from '../game/diplomacy.js';
import { isAllied } from '../game/alliances.js';
import { INFAMY_COALITION } from '../game/infamy.js';
import { maxHpOf, menUnderArms, organizationOf, soldiersOf, unitsOn } from '../game/units.js';
import { terrainShade } from '../world/terrain.js';
import { DEVELOPMENT_MAX, RESOURCES } from '../game/econ/defs.js';
import { controllerOf, isOccupied } from '../game/control.js';
import { battleView } from '../game/battleView.js';
import { WaterLayer } from './water.js';
import { SeaLayer } from './seaLayer.js';
import { MiniLayer } from './miniatures.js';
import {
  brassSymbol, drawInlay, drawNatoInlay, loadUnitSkin, paintBars, paintFlagChip, paintLabel, paintPlaque,
  paintStackTab, unitSkinStamp,
} from './unitSkin.js';
import { zoneStatus } from '../game/navy.js';
import { LandMaterial } from './material.js';
import { SurfaceGL } from './surfaceGL.js';
import { WarFx } from './warFx.js';
import { terrainBakeJob } from './terrainBake.js';
import { getGfxStyle, gfxStyleNames, readGfxParam } from './gfx/index.js';
import {
  buildBorderMesh, borderKeys, sameKeys, updateMeshGroups, meshGlTable, meshRegionData,
  bandFieldJob, BAND_REACH, LINE_COUNTRY, LINE_PROVINCE, LINE_COAST, cellAt, cellOutline, cellEdge,
} from './borderMesh.js';

/**
 * Karenin GÖRÜNEN sahibi. Geçilmez arazi (artık yalnız buz) hiçbir province'e
 * üye olmadığı için `owner` alanı hep -1'dir; bağlı olduğu province'in sahibini
 * gösteririz (bkz. provinces-gen.attachImpassableFringe). Böylece ülkelerin
 * ortasında gri delik kalmaz ve fetihten sonra da doğru kalır.
 */
function ownerOf(tile, world) {
  if (tile.owner >= 0) return tile.owner;
  if (tile.fringeOf >= 0) return world.provinces?.[tile.fringeOf]?.owner ?? -1;
  return -1;
}

/**
 * VERİ KİPLERİ: kara rengi simülasyondan gelir ve haftadan haftaya değişir
 * (hud.js her hafta `refreshModeColors` ister). Deniz bu kiplerde düz ve
 * koyudur — kıpırdayan su veriyi okumayı bozar (bkz. waterAnimatedMode).
 * Renkler TEK yerde; lejant çipleri hud.js'te aynı tablodan okunur.
 */
export const DATA_MODES = new Set(['diplomacy', 'unrest', 'industry', 'infamy']);

/**
 * Halk ısı haritası: state'teki payın alt eşikleri ve kademe renkleri. Ölçek
 * her halkta aynıdır (koyu mor → sarı): halkın kendi rengiyle boyamak soluk
 * tonlu halklarda kademeleri ayırt edilmez yapıyordu. Küçük paylar sık aralıklı,
 * çünkü sorulan çoğu zaman diasporanın nereye yayıldığıdır.
 */
export const CULTURE_HEAT_STOPS = [0.01, 0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.9];
export const CULTURE_HEAT_COLORS = ['#420a68', '#6a176e', '#932667', '#bc3754', '#dd513a', '#f37819', '#fca50a', '#f6d746'];
/** Payın kademesi; eşiğin altındaki pay için -1. */
export function cultureHeatStep(share) {
  for (let i = CULTURE_HEAT_STOPS.length - 1; i >= 0; i--) if (share >= CULTURE_HEAT_STOPS[i]) return i;
  return -1;
}
/** Bundan küçük halk kütlesi haritada ad almaz. */
const CULTURE_LABEL_MIN_HEXES = 6;
/** Isı haritasında state payının sayıyla yazılmaya başladığı zoom. */
const CULTURE_SHARE_MIN_ZOOM = 0.42;

/**
 * Diplomasi kipi: bakılan ülkeye göre herkesin yeri. Birim taraf renkleriyle
 * aynı aile (yeşil biz, mavi müttefik, kırmızı düşman), harita için
 * doygunluğu kısılmış. Sıra lejantın sırasıdır.
 */
export const DIPLOMACY_COLORS = {
  focus: 'hsl(140 30% 40%)',
  ally: 'hsl(208 42% 46%)',
  war: 'hsl(4 58% 44%)',
  crisis: 'hsl(28 64% 46%)',
  truce: 'hsl(265 22% 44%)',
  rival: 'hsl(44 44% 40%)',
  elsewhere: 'hsl(12 24% 30%)',
  neutral: 'hsl(210 8% 31%)',
};

/** Rampalar: [t, hue, sat, light]; t 0–1 aralığında, doğrusal karışım. */
export const UNREST_RAMP = [[0, 150, 18, 30], [0.35, 48, 44, 40], [0.7, 8, 58, 42], [1, 350, 64, 38]];
// Sanayi rampası kalkınma kademesini boyar (1 → t 0, 10 → t 1). İkinci durak
// tam 2. kademededir: eski rampada mavi→pirinç geçişi yeşilden geçiyordu ve
// haritanın çoğunu tutan 2-3. kademe state'ler "tarım" gibi yeşil okunuyordu.
export const INDUSTRY_RAMP = [[0, 215, 14, 24], [1 / 9, 28, 22, 28], [0.5, 36, 42, 40], [1, 46, 68, 58]];
export const INFAMY_RAMP = [[0, 210, 10, 30], [0.3, 46, 32, 36], [0.65, 30, 58, 42], [1, 2, 62, 42]];
const DATA_EMPTY = 'hsl(210 6% 21%)';

/** Rampadan renk; 24 kademeye yuvarlanır ki benzersiz renk dizesi sınırlı kalsın. */
export function rampColor(ramp, t) {
  const x = Math.round(Math.max(0, Math.min(1, t)) * 24) / 24;
  let i = 1;
  while (i < ramp.length - 1 && ramp[i][0] < x) i++;
  const [t0, h0, s0, l0] = ramp[i - 1];
  const [t1, h1, s1, l1] = ramp[i];
  const k = t1 > t0 ? Math.max(0, Math.min(1, (x - t0) / (t1 - t0))) : 0;
  // Ton kısa yoldan döner (350 → 8 arası kırmızıda kalır, maviye sapmaz).
  let dh = h1 - h0;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  const hue = (h0 + dh * k + 360) % 360;
  return `hsl(${Math.round(hue)} ${Math.round(s0 + (s1 - s0) * k)}% ${Math.round(l0 + (l1 - l0) * k)}%)`;
}

/**
 * Diplomasi kipi: her ülkenin bakılan ülkeye göre yeri. Öncelik sırası
 * anlamlıdır — savaşta olan müttefik değil düşmandır, ateşkesteki eski düşman
 * rakipten önce gelir. "elsewhere": bakılan ülkeyle değil başkasıyla savaşan.
 */
export function diplomacyStanding(world, focus) {
  const nations = world.nations ?? [];
  const out = new Array(nations.length).fill('neutral');
  const me = nations[focus];
  const turn = world.turn ?? 0;
  for (const other of nations) {
    if (!other?.alive) continue;
    const id = other.id;
    if (id === focus) out[id] = 'focus';
    else if (atWar(world, focus, id)) out[id] = 'war';
    else if (inCrisis(world, focus, id)) out[id] = 'crisis';
    else if (me && isAllied(me, id)) out[id] = 'ally';
    else if ((relation(world, focus, id)?.truceUntil ?? 0) > turn) out[id] = 'truce';
    else if (me?.rivalId === id || other.rivalId === focus) out[id] = 'rival';
    else if (nations.some((third) => third?.alive && third.id !== id && atWar(world, id, third.id))) {
      out[id] = 'elsewhere';
    }
  }
  return out;
}

/**
 * Sanayi kipinin rengi: kalkınma kademesi (1-10). Fabrika binası yoktur;
 * sanayi 1'in üstündeki her kademeden gelir (econ/output.js), o yüzden 1
 * rampanın soluk ucu, tavan (10) en parlak pirinç. Lejant (hud.js) aynı
 * fonksiyondan boyar: harita ile lejant tek dizeden okunur.
 */
export function developmentShade(level) {
  const t = (Math.max(1, Math.min(DEVELOPMENT_MAX, level ?? 1)) - 1) / (DEVELOPMENT_MAX - 1);
  return rampColor(INDUSTRY_RAMP, t);
}

const MAX_DPR = 2;            // mobilde 3x DPR gereksiz pahalı
/**
 * Sarmal periyodunun sol kenarı: 0. kolonun çift satır hexinin sol ucu.
 * Kopya bantları, önbellek dokusu ve k indeksleri hep bu orijine hizalanır;
 * farklı orijinler kullanılırsa aradaki şerit hiçbir kopyaya düşmez.
 */
const WRAP_X0 = -(SQRT3 * HEX_SIZE) / 2;
/** Aynı satırdaki komşu hex merkezleri arasındaki yatay uzaklık. */
const HEX_STEP = SQRT3 * HEX_SIZE;

/**
 * Bir satırdaki en geniş KESİNTİSİZ hex dizisi.
 *
 * Ülke etiketinin bandı bundan seçilir. Eskiden satırın yalnız en küçük ve en
 * büyük x'i tutuluyordu; ülkenin aynı satırda iki ayrı parçası varsa (ada,
 * boğazın iki yakası) "bant" aradaki YABANCI toprağı da kapsıyor ve ad o
 * boşluğun üstünden geçip komşu ülkeye yazılıyordu. Kesinti bir hex adımının
 * 1.5 katından büyük boşlukta sayılır — pay yuvarlama gürültüsü içindir.
 */
function widestRun(xs) {
  if (!xs.length) return null;
  xs.sort((a, b) => a - b);
  let best = null;
  let start = 0;
  for (let i = 1; i <= xs.length; i++) {
    if (i === xs.length || xs[i] - xs[i - 1] > HEX_STEP * 1.5) {
      const width = xs[i - 1] - xs[start];
      if (!best || width > best.width) {
        best = { min: xs[start], max: xs[i - 1], width, count: i - start };
      }
      start = i;
    }
  }
  return best;
}
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
 * Hiçbir dokunun yetişmediği anda serilen son çare zemin: derin okyanus tonu
 * (bkz. terrain.DEEP_OCEAN). Uygulama zemini siyaha yakındır ve orada
 * göründüğünde "siyah kutu" hatası olarak okunur; harita rengi ise yalnız
 * bir kare boyunca detaysız kalır.
 */
const VOID_FILL = '#0a2836';
/**
 * Bu zoom altında tüm dünya önbellekten tek seferde basılır. 0.55'ten 0.45'e:
 * büyük haritada önbellek ölçeği düştü, 0.55'te büyütme bulanıklığı görünür
 * oluyordu; 0.45'te yakın dal telefonda ~1000 hex çizer, hala bütçede.
 */
export const CACHE_ZOOM = 0.45;
/** Kare başına sayaç pişirme payı (ms); aşılınca kalan sayaçlar sonraki karelere kalır (unitSprite). */
const SPRITE_BAKE_BUDGET_MS = 3;
/**
 * Hex ızgarasının görünmeye başladığı zoom. CACHE_ZOOM 0.55'ten 0.45'e
 * inince yakın dal 0.45-0.55 bandını da çizer oldu; ızgara o bantta hem
 * kare bütçesini aşıyor (3k+ hex stroke) hem de uzak görünümle (ızgarasız
 * önbellek) arasında görsel sıçrama yaratıyordu. Eski eşik korunur.
 */
const GRID_MIN_ZOOM = 0.55;
/**
 * Ordu seçiliyken çevresinde beliren yerel ızgaranın yarıçapı (hex). Ordu hex
 * hex yürür (world/provinceGraph); ızgara kapalıyken oyuncu hedef kareyi
 * göremiyordu. ~6 hex bir-iki haftalık yürüyüş.
 */
const ARMY_GRID_RADIUS = 6;
/**
 * Ülke kenar gölgesi Canvas2D yedek yolunda: ülkenin yumuşak çokgenine
 * kırpılmış kademeli geniş darbeler (sınırda ~%24, BAND_REACH içinde söner).
 * GL yüzeyinde aynı gölgeyi shader uzaklık alanından çizer (bkz. surfaceGL).
 */
const BAND_STEPS = 6;
const BAND_STEP_ALPHA = 0.045;
/**
 * Azınlık taramasının eşikleri. Pay %15'in altındaysa çizgi haritayı
 * kirletir, bilgi vermez; zoom 0.28'in altında çizgi aralığı piksel altına
 * iner ve renkler çamura döner.
 */
const CULTURE_MINORITY_MIN = 0.10;
const CULTURE_STRIPE_MIN_ZOOM = 0.28;

/**
 * Azınlık taramasının yoğunluk kademeleri: pay büyüdükçe çizgi sıklaşır ve
 * kalınlaşır, yani haritanın kendisi "ne kadar karışık" olduğunu söyler.
 *
 * `period` iki çizgi arası, `width` çizgi kalınlığı (dünya birimi). Kaplama
 * oranı = width / period ve EN YOĞUN kademede bile ~%25'te tutulur: taban
 * renk daima görsel olarak kazanmalı, yoksa çoğunluk-azınlık ilişkisi ters
 * okunur. İlk sürümde tek sabit kademe vardı (period 11, dikişle birlikte
 * kalınlık 6) ve kaplama %55'e çıkıyordu — %24 azınlıklı bir küme mavi
 * zemine turuncu çizgi değil, turuncu zemine mavi gibi görünüyordu.
 */
const CULTURE_STRIPE_BANDS = [
  { upTo: 0.20, period: 26, width: 2.0 },
  { upTo: 0.30, period: 22, width: 2.6 },
  { upTo: 0.40, period: 18, width: 3.2 },
  { upTo: 1.00, period: 15, width: 3.8 },
];

function stripeBand(share) {
  for (let i = 0; i < CULTURE_STRIPE_BANDS.length; i++) {
    if (share < CULTURE_STRIPE_BANDS[i].upTo) return i;
  }
  return CULTURE_STRIPE_BANDS.length - 1;
}
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
/** Pinch bittikten bu kadar ms sonra net (1:1) görüntü için yeniden kurulur. */
const STATIC_SETTLE_MS = 150;
/** Statik katman dokusunun azami kenarı (piksel); pay gerekirse kısılır. */
const STATIC_MAX_SIDE = 5120;
/**
 * Zoom jesti sürerken statik katmanın pişirme ölçeği bu çarpanın kuvvetlerine
 * oturur (LOD kovası). Kova içinde katman HİÇ yeniden pişmez; ölçekli blit
 * yeter, en fazla √1.6 = %26 büyütme/küçültme olur — jest sırasında kodun
 * zaten kabul ettiği bant (mag 0.75-1.33). Jest yerleşince katman TAM zoom'da
 * yeniden pişer, yani durağan haritada bulanıklık yoktur.
 *
 * Neden: sürekli zoomda `uncovered`/`mag` eşikleri her karede tetikleniyor ve
 * 1461×1384 boyutlu KATMAN ÇİFTİ kare başına yeniden boyanıyordu. Ölçüldü
 * (10 sn zoom taraması, aynı dünya): pişirme açıkken dt p99 51.9 ms / 26 kare
 * >33 ms / 5.9 MB-sn çöp, pişirme kapatıldığında p99 7.5 ms / 0 kare >33 ms /
 * 0.29 MB-sn. Yani zoom takılmasının TAMAMI bu yeniden pişirmeydi.
 */

/**
 * Arazi karakteri — WebGL yüzey katmanına hex başına doku olarak gider.
 * `relief` eğimin ışığa katkısı, `grain` yerel kırıklık, `warm` sıcaklığa
 * çekiş. material.js'teki CHARACTER ile aynı ailedendir; orası Canvas2D
 * yedeği için duruyor, burası GPU yolu içindir.
 */
const SURFACE_CHARACTER = {
  SNOW_PEAK: { relief: 1.55, grain: 0.30, warm: 0.08 },
  MOUNTAIN: { relief: 1.60, grain: 0.38, warm: 0.04 },
  HILLS: { relief: 1.15, grain: 0.32, warm: 0.10 },
  FOREST: { relief: 0.62, grain: 0.52, warm: -0.18 },
  JUNGLE: { relief: 0.62, grain: 0.56, warm: -0.22 },
  GRASSLAND: { relief: 0.50, grain: 0.22, warm: -0.04 },
  PLAINS: { relief: 0.44, grain: 0.16, warm: 0.06 },
  DESERT: { relief: 0.46, grain: 0.11, warm: 0.28 },
  BEACH: { relief: 0.34, grain: 0.13, warm: 0.24 },
  TUNDRA: { relief: 0.52, grain: 0.24, warm: -0.02 },
  ICE: { relief: 0.70, grain: 0.15, warm: 0.02 },
};
const SURFACE_DEFAULT = { relief: 0.5, grain: 0.2, warm: 0 };

/** Şehir ve birim aynı karede: biri yukarı, biri aşağı kaydırılır. */
/**
 * Nehir kalınlık kademeleri: akış eşikleri ve CSS piksel kalınlığı (yakında
 * zoomla %45'e dek açılır). Kaynak kolu ince, ana kol kalın; eskiden üç sabit
 * kalınlık vardı ve nehir boydan boya aynı kablo gibi duruyordu.
 */
const RIVER_FLOW_STEPS = [0.14, 0.28, 0.45, 0.65];
const RIVER_WIDTH_NEAR = [1.1, 1.6, 2.2, 2.9, 3.7];
const RIVER_WIDTH_FAR = [0.9, 1.2, 1.6, 2.1, 2.7];

const CITY_OFFSET = 0.3;
const UNIT_ON_CITY_OFFSET = 0.22;
/** Muharebede sayacın sınıra yaslanması (hex boyu payı): saldıran çok, savunan az. */
const BATTLE_LEAN_ATTACK = 0.42;
const BATTLE_LEAN_DEFEND = 0.2;
/** Kareden kareye kayma süresi sınırları (ms); arası adımlar arasındaki gerçek süreye uyar. */
const GLIDE_MIN_MS = 160;
const GLIDE_MAX_MS = 900;

/** Emir rozetleri; orders.js'teki ORDER değerleriyle eşleşir. */
/**
 * Emir rozeti: 'hold' iki dikey çubuk, 'auto' dişli. Emoji metniydi; tuvalde
 * emoji her işletim sisteminde başka çizilir ve küçük boyda leke olur.
 */
function drawOrderBadge(ctx, order, x, y, size) {
  if (order !== 'hold' && order !== 'auto') return;
  ctx.save();
  if (order === 'hold') {
    const w = size * 0.28;
    ctx.fillRect(x - size * 0.42, y - size * 0.5, w, size);
    ctx.fillRect(x + size * 0.14, y - size * 0.5, w, size);
  } else {
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * size * 0.38, y + Math.sin(a) * size * 0.38);
      ctx.lineTo(x + Math.cos(a) * size * 0.56, y + Math.sin(a) * size * 0.56);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/**
 * Sayacın ekrandaki büyüme eğrisi (px). Sayaç dünya ölçüsüyle büyüyordu:
 * zoom 1'de 40×28 px, 45×52 px'lik hexin %65'i; cephe tek parça künye duvarı
 * gibi okunuyor, şehir adlarını örtüyordu (Kerem: "counter'lar çok büyük").
 * Önce 34 px'te SABİTLENDİ; bu kez yakınlaştıkça haritaya göre küçülüp
 * "minikleşiyordu" (Kerem: "yakınlaştıkça daha da minikleşiyor"). Şimdi
 * yumuşak tavan: dirseğe kadar haritayla aynı büyür, sonrasında haritanın
 * yarı hızıyla (zoom 1 → ~38 px, 1.6 → ~50 px, 2.5 → ~69 px).
 */
const COUNTER_KNEE_PX = 36;
const COUNTER_GROWTH = 0.5;
/**
 * Üçüncü tarafın (savaşta da müttefik de olmayan) sayacı küçük ve emayesiz,
 * koyu deri künyelidir. Saydam DEĞİL: %55 alfa
 * denendi, oyuncu "üniteler yarım gözüküyor" diye hata sandı (Kerem).
 */
const OTHER_COUNTER_SCALE = 0.74;
/** Bu zoomun altında üçüncü tarafın garnizonları hiç çizilmez (bkz. counterVisible). */
const OTHER_COUNTER_MIN_ZOOM = 0.34;
const SIDE_HALO = {
  own: 'rgba(104, 168, 94, 0.92)',
  ally: 'rgba(100, 148, 202, 0.90)',
  hostile: 'rgba(206, 76, 56, 0.95)',
};

/**
 * Gemi siluetleri (2026-11-20 levha sayfası assets/incoming/harita/birlik-levhalari.webp,
 * dilimleri assets/icons/map-plates). Sayaçta yalnız siluet kullanılır, emayeye gömülü
 * pirinç olarak (unitSkin.brassSymbol). Kara kollarının levhaları artık okunmaz: ince NATO
 * çizgileri 40 px'lik sayaçta soluyordu, simge tel olarak çizilir (unitSkin.drawNatoInlay).
 *
 * Yukleme ASENKRON, sprite pisirme SENKRON: goruntu hazir degilse sayac tel simgeyle
 * piser ve resim gelince onbellek bosaltilir.
 */
const UNIT_PLATE_FILES = {
  WARSHIP: 'map-plates/warship.webp', SUBMARINE: 'map-plates/submarine.webp',
};
const unitPlates = new Map();
let unitPlatesPending = 0;
const NAVAL_PLATE = new Set(Object.keys(UNIT_PLATE_FILES));

function loadUnitPlates(onReady) {
  if (unitPlates.size || unitPlatesPending) return;
  for (const [typeId, file] of Object.entries(UNIT_PLATE_FILES)) {
    const image = new Image();
    unitPlatesPending++;
    image.decoding = 'async';
    image.addEventListener('load', () => {
      unitPlates.set(typeId, image);
      if (--unitPlatesPending === 0) onReady?.();
    }, { once: true });
    image.addEventListener('error', () => { unitPlatesPending--; }, { once: true });
    image.src = `assets/icons/${file}`;
  }
}

/**
 * Harita savaş amblemleri (assets/icons/war-map, kaynak sayfa assets/incoming/harita/
 * savas-amblemleri.webp): saldırı kılıçları, savunma burcu, yürüyüş sancağı, kuşatma
 * mermisi. Yüklenmezse balon ve sancak vektör çizimine düşer.
 */
const WAR_EMBLEMS = new Map();
let warEmblemsAsked = false;
function warEmblem(name, onReady) {
  if (!warEmblemsAsked) {
    warEmblemsAsked = true;
    for (const id of ['attack', 'defend', 'goal', 'shell', 'pin-green', 'pin-amber', 'pin-red', 'pin-grey']) {
      const image = new Image();
      image.decoding = 'async';
      image.addEventListener('load', () => { WAR_EMBLEMS.set(id, image); onReady?.(); }, { once: true });
      image.src = `assets/icons/war-map/${id}.webp`;
    }
  }
  return WAR_EMBLEMS.get(name) ?? null;
}

/**
 * İğne resminin ölçüsü (assets/icons/war-map/pin-*.webp, 256 px kare, kaynak sayfa
 * assets/incoming/harita/muharebe-ignesi.webp): madalyon oyuğunun merkezi ve yarıçapı
 * resim eninin payı olarak. Ölçüldü (dört renk aynı kalıp).
 */
const PIN_ART = { cx: 0.317, cy: 0.503, well: 0.172 };

/**
 * Harita işaretleri (assets/icons/map-marks, kaynak assets/incoming/harita/
 * harita-isaretleri.webp; dilim scripts/art/slice-sheets.py). Yüklenmezse eski vektör
 * çizimi kalır; gelince önbellek boşaltılır (uzak zoom katmanı pişmiş olabilir).
 */
const MAP_ART = new Map();
function mapArt(name, onReady, dir = 'map-marks') {
  const key = `${dir}/${name}`;
  let entry = MAP_ART.get(key);
  if (!entry) {
    entry = { image: null };
    MAP_ART.set(key, entry);
    const image = new Image();
    image.decoding = 'async';
    image.addEventListener('load', () => { entry.image = image; onReady?.(); }, { once: true });
    image.src = `assets/icons/${dir}/${name}.webp`;
  }
  return entry.image;
}

/**
 * Doku şeridini (assets/icons/arrows/fill_*) yol boyunca büker: her kısa parça kendi
 * yönüne döndürülür ve şeridin sıradaki diliminden çizilir. createPattern deseni
 * döndürmez; şeridin parlak üst kenarı okun kıvrımını izlemiyordu. `length` yolun
 * başından ne kadarının boyanacağıdır (dolan yürüyüş oku).
 */
function stripAlong(ctx, pts, img, width, length = Infinity) {
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  const scale = ih / width;
  // Dış kıvrımda parçalar arasında yarık açılmasın: her parça biraz uzatılır.
  const over = width * 0.2;
  let walked = 0;
  for (let i = 0; i < pts.length - 1 && walked < length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[i + 1];
    const d = Math.hypot(bx - ax, by - ay);
    if (d < 1e-6) continue;
    const seg = Math.min(d, length - walked);
    const last = i === pts.length - 2 || seg < d;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(Math.atan2(by - ay, bx - ax));
    let x = 0;
    let rest = seg + (last ? 0 : over);
    let u = (walked * scale) % iw;
    while (rest > 1e-3) {
      const take = Math.min(rest, (iw - u) / scale);
      ctx.drawImage(img, u, 0, take * scale, ih, x, -width / 2, take + 0.02, width);
      x += take;
      rest -= take;
      u = 0;
    }
    ctx.restore();
    walked += seg;
  }
}

/**
 * Stil kalemi: [{w, color, dash?, cap?}] sırayla çizilir. Kalınlık ve kesik
 * ekran pikselinde verilir, burada dünyaya çevrilir: zoom değişse de çizgi
 * aynı incelikte kalsın (ctx dünya dönüşümünde).
 */
function strokePen(ctx, path, pen, scale) {
  for (const s of pen) {
    ctx.lineWidth = s.w / scale;
    ctx.strokeStyle = s.color;
    ctx.lineCap = s.cap ?? 'round';
    ctx.setLineDash(s.dash ? s.dash.map((v) => v / scale) : []);
    ctx.stroke(path);
  }
  ctx.setLineDash([]);
  ctx.lineCap = 'round';
}

/** Açılmış koordinatlı nokta dizisini `dx` kaydırarak yola ekler. */
function appendPts(path, pts, closed, dx = 0, reverse = false) {
  const m = pts.length / 2;
  if (m < 2) return;
  for (let k = 0; k < m; k++) {
    const i = reverse ? m - 1 - k : k;
    if (k === 0) path.moveTo(pts[i * 2] + dx, pts[i * 2 + 1]);
    else path.lineTo(pts[i * 2] + dx, pts[i * 2 + 1]);
  }
  if (closed) path.closePath();
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

/**
 * Haritada İNSAN sayısı, kısa: 30K, 570K, 1.2M. `soldiersOf` güç puanıdır
 * (alay başına 1000) ve plaka onu yazarken paneller insanı yazıyordu: aynı
 * ordu haritada "1.0K", panelde "30K men" okunuyordu (bkz. units.menUnderArms).
 * Dar plakaya sığsın diye milyon tek ondalık, bin tam sayı.
 */
function compactMen(men) {
  if (men >= 999500) return `${(men / 1e6).toFixed(1)}M`;
  if (men >= 1000) return `${Math.round(men / 1000)}K`;
  return String(Math.round(men));
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

/**
 * Stilin pişirme ayarlarının anahtarı; aynı ayarlı stiller araziyi paylaşır.
 * Stil nesnesinde bir kez hesaplanır: her karede JSON.stringify gereksiz.
 */
function bakeKey(style) {
  if (!style) return '{}';
  style.bakeKey ??= JSON.stringify(style.bakeOptions ?? {});
  return style.bakeKey;
}

export class Renderer {
  constructor(canvas, camera) {
    this.canvas = canvas;
    // Saydamlık AÇIK: hibrit su devredeyken deniz alanı boş bırakılır ve
    // alttaki WebGL tuvali oradan görünür (bkz. waterGL).
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.camera = camera;
    this.dpr = 1;
    /** Yakın zoomun birim minyatürleri (bkz. miniatures.js). */
    this.minis = new MiniLayer(this);
    // Kunyeler gelince pisirilmis sayaclar gecersizdir: onbellek bosaltilir
    // ve bir kare istenir, yoksa plakalar ilk zoom degisimine kadar cikmaz.
    loadUnitPlates(() => {
      this.unitSprites?.clear();
      this.invalidateCache();
      this.onPlatesReady?.();
    });
    // Künyenin emaye ve pirinç dokuları (unitSkin.js): gelince sayaç ve levhalar yeniden pişer.
    loadUnitSkin(() => {
      this.invalidateCache();
      this.onPlatesReady?.();
    });
    // Web fontu ilk kareden sonra iner: ölçü önbelleği, sayaç sprite'ları ve
    // uzak zoom önbelleği yedek fontla pişmişti. Bir kez boşaltılıp yeniden çizilir.
    whenFontsReady(() => {
      this.measureCache?.clear();
      this.unitSprites?.clear();
      this.invalidateCache();
      this.onPlatesReady?.();
    });
    // Hex ızgarası varsayılan KAPALI: harita birimi province'tir, hex altta
    // veri ızgarası olarak kalır. Katmanlar menüsünden açılır (hud.js
    // tercihi hatırlar).
    this.showGrid = false;
    /** Katmanlar menüsü: ülke ve province sınırları ayrı ayrı kapatılabilir. */
    this.showCountryBorders = true;
    this.showProvinceBorders = true;
    this.showLabels = true;
    // Sınır ağı (bkz. borderMesh.js). `meshCheck`: sahiplik ya da kip değişti,
    // bir sonraki istekte anahtarlar karşılaştırılsın.
    this.mesh = null;
    this.meshCheck = true;
    /**
     * 'political' | 'terrain' | 'geography' | 'cultures' | 'resources'
     * | 'population' | 'seas' | 'peace'
     *
     * 'geography': fiziksel coğrafya önizlemesi. Ülke, sınır, province kenarı,
     * ızgara ve etiket kapalı — yalnız kara, deniz ve arazi. Kıtaların biçimi
     * siyasi katmandan bağımsız değerlendirilebilsin diye vardır.
     */
    this.mapMode = 'political';
    // Deniz bölgeleri (Seas kipi) ve filo işaretleri (seaLayer.js).
    this.sea = new SeaLayer(this);
    /** (ülke,arazi) ve (kültür,arazi) renk önbelleği; her karede yeniden hesaplanmasın. */
    this.tintCache = new Map();
    this.corners = HEX_CORNERS.map(([x, y]) => [x * HEX_SIZE, y * HEX_SIZE]);
    this.cache = null;
    this.lastDrawn = 0;
    // Deniz yüzeyi ayrı bir katman nesnesidir: dokular, kıyı topolojisi ve
    // yerel bozulmalar orada yaşar (bkz. water.js).
    this.water = new WaterLayer();
    // Kara yüzeyinin malzemesi: ışık alanı + kabartma + pigment (bkz. material.js).
    this.material = new LandMaterial();
    /**
     * HİBRİT SU. Doluysa deniz WebGL2'de, ALTTAKİ ayrı tuvale çizilir ve
     * Canvas2D tarafı deniz karelerini hiç boyamaz — su oradan görünür, kara
     * dolgusu üstünü doğal olarak kapatır. Null ise (WebGL2 yok, ya da
     * kapatıldı) her şey eskisi gibi Canvas2D'de kalır.
     */
    this.waterGL = null;
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
    /**
     * GÖRSEL STİL (?gfx=, setGfxStyle). 'classic' iken hiçbir kanca çalışmaz.
     * `terrain` dünya başına arazi temeli (stiller arası ortak), `extra`
     * stilin kendi pişirmesi (stil adına göre), `job` dilimli pişirme.
     */
    this.gfxStyle = 'classic';
    this.gfx = { style: null, job: null, terrain: null, extra: new Map(), hexDirty: true, hexWorld: null, bakeLog: null };
    this.gfxTune = null;
    this.pendingGfx = readGfxParam();
    // Eğik kameranın iki geçişi (gfx/threeD.js): 'ink' zemine giydirilen
    // çizgiler, 'marks' ekrana dik basılan işaretler; `upright` o geçişin
    // iğnesi. Klasikte ikisi de null ve hiçbir dal çalışmaz.
    this.markPass = null;
    this.upright = null;
  }

  /**
   * Görsel stil anahtarı. Konsoldan:  game.renderer.setGfxStyle('debug-height')
   * Bilinmeyen ad klasiğe düşer. Stil değişince pişmiş her katman bayattır
   * (mürekkep geçişleri ve uOwner rengi stile bağlı olabilir).
   */
  setGfxStyle(name = 'classic') {
    let style = null;
    if (name !== 'classic') {
      style = getGfxStyle(name);
      if (!style) {
        console.warn(`[gfx] bilinmeyen stil "${name}"; seçenekler: ${gfxStyleNames().join(', ')}`);
        name = 'classic';
      }
    }
    const prev = this.gfx.style;
    if (prev && prev !== style) prev.detach?.(this);
    this.gfxStyle = name;
    this.gfx.style = style;
    this.gfx.hexDirty = true;
    this.gfx.job = null;
    this.gfxTune = style?.tune ?? null;
    this.waterGL?.setGfxStyle(style);
    if (!style) this.waterGL?.setGfxHexData(null);
    else {
      style.attach?.(this);
      // Bu dünyanın arazisi (ve stilin ekstrası) hazırsa hemen yüklenir.
      const world = this.renderWorld;
      if (world && !this.gfxNeedsBake(world)) this.gfxUpload(world);
    }
    this.invalidateCache();
    this.staticLayers = null;
    this.staticDirty = true;
    this.requestFrame?.();
    return name;
  }

  /** Bu dünya için arazi temeli ya da stilin ek pişirmesi eksik mi? */
  gfxNeedsBake(world) {
    const s = this.gfx.style;
    if (!s || !world) return false;
    if (s.terrain !== false && !this.gfxTerrainFor(world, s)) return true;
    if (s.bake && this.gfx.extra.get(s.name)?.world !== world) return true;
    return false;
  }

  /**
   * Arazi pişirmesini bütçe kadar ilerletir; bitince GL'ye yükler ve true
   * döner. Dilim ölçümü `gfx.bakeLog`ta (en uzun adım, adım sayısı, toplam).
   */
  stepGfxBake(world, budgetMs) {
    const g = this.gfx;
    const s = g.style;
    if (!s) return true;
    if (!g.job || g.job.world !== world || g.job.style !== s) {
      const renderer = this;
      const it = (function* () {
        let terrain = renderer.gfxTerrainFor(world, s);
        if (!terrain && s.terrain !== false) {
          terrain = yield* terrainBakeJob(world, s.bakeOptions);
          terrain.optsKey = bakeKey(s);
        }
        let extra = g.extra.get(s.name);
        if (s.bake && extra?.world !== world) {
          extra = { world, value: yield* s.bake(world, terrain, renderer) };
        }
        return { terrain, extra };
      })();
      g.job = { world, style: s, it, steps: 0, maxStep: 0, maxSlice: 0, busy: 0, t0: performance.now() };
    }
    const job = g.job;
    const t0 = performance.now();
    let done = null;
    // Bütçe ÖNGÖRÜLÜ: sıradaki dilim (yakın geçmişin en uzunu kadar) bütçeyi
    // taşıracaksa durulur. "Bütçe dolana dek" döngüsü son dilimi bütçenin
    // üstüne ekliyordu: 14 ms bütçe 23 ms adım veriyordu. Tahmin söner ki tek
    // soğuk (JIT/GC) dilim pişirmenin geri kalanını yavaşlatmasın.
    for (;;) {
      const s0 = performance.now();
      const r = job.it.next();
      const now = performance.now();
      const dt = now - s0;
      job.maxSlice = Math.max(job.maxSlice, dt);
      job.est = Math.max(dt, (job.est ?? 0) * 0.85);
      if (r.done) {
        done = r.value;
        break;
      }
      if (now - t0 + job.est > budgetMs) break;
    }
    const dt = performance.now() - t0;
    job.steps++;
    job.busy += dt;
    job.maxStep = Math.max(job.maxStep, dt);
    if (!done) {
      this.requestFrame?.();
      return false;
    }
    if (done.terrain) g.terrain = done.terrain;
    if (done.extra) g.extra.set(s.name, done.extra);
    g.bakeLog = {
      steps: job.steps, maxStepMs: +job.maxStep.toFixed(2), maxSliceMs: +job.maxSlice.toFixed(2),
      busyMs: +job.busy.toFixed(1),
      wallMs: +(performance.now() - job.t0).toFixed(0), timings: g.terrain?.timings,
    };
    g.job = null;
    this.gfxUpload(world);
    this.invalidateCache();
    this.requestFrame?.();
    return true;
  }

  /**
   * Stil açıkken kare başına: arazi eksikse bir dilim pişir (ısıtma bitmiş,
   * stil sonradan seçilmiş olabilir), hex verisi kirliyse yeniden kur.
   */
  gfxFrame(world) {
    const wgl = this.waterGL;
    if (this.gfxNeedsBake(world)) {
      const t = performance.now();
      this.stepGfxBake(world, 8);
      this.perf?.add('r.gfxbake', performance.now() - t);
    } else if (wgl.terrain?.world !== world && this.gfx.style.terrain !== false) {
      // Yeni bağlam ya da önceki dünyadan kalan arazi: hazır olanı yükle.
      this.gfxUpload(world);
    }
    const s = this.gfx.style;
    if (!s.hexData) return;
    // İnşaat ve nüfus artışı renderer'a haber vermez: stil ucuz bir imza
    // verirse (hexDataKey) değişim kendiliğinden yakalanır.
    const key = s.hexDataKey ? s.hexDataKey(world, this) : null;
    if (this.gfx.hexDirty || this.gfx.hexWorld !== world || key !== this.gfx.hexKey) {
      this.gfx.hexDirty = false;
      this.gfx.hexWorld = world;
      this.gfx.hexKey = key;
      wgl.setGfxHexData(s.hexData(world, this));
    }
  }

  /** Hazır arazi + stil ekstrasını GL'ye verir. */
  gfxUpload(world) {
    const s = this.gfx.style;
    if (!s || !this.waterGL) return;
    this.waterGL.setTerrain(this.gfxTerrainFor(world, s), this.gfx.extra.get(s.name)?.value ?? null);
  }

  /**
   * Bu dünya ve stilin pişirme ayarlarıyla kurulmuş arazi; yoksa null.
   * Arazi stiller arası paylaşılır, ayarları farklı bir stil kendi pişirir.
   */
  gfxTerrainFor(world, style = this.gfx.style) {
    const t = this.gfx.terrain;
    if (!t || t.world !== world) return null;
    return t.optsKey === bakeKey(style) ? t : null;
  }

  /** Stilin hex başına verisini (birim 13) bir sonraki karede yeniden kur. */
  gfxRefreshHexData() {
    this.gfx.hexDirty = true;
    this.requestFrame?.();
  }

  /**
   * Stilin Canvas2D mürekkep geçişi. 'under' ve 'over' statik katmana ve uzak
   * önbelleğe PİŞER (sınır çizgilerinin altı/üstü; değişince invalidateCache),
   * 'live' her karede şehirlerin altında çizilir. `clip`: statik katmanın
   * şerit/dilim kırpması (rect onun 2.5 hex yakalı hali; yoksa null) —
   * yoğun mürekkep yalnız görünecek alanı üretsin.
   */
  gfxInk(slot, ctx, world, rect, scale, far, clip = null) {
    const fn = this.gfx.style?.ink?.[slot];
    if (!fn) return;
    fn(ctx, {
      world, rect, clip, scale, far, renderer: this, mode: this.mapMode,
      terrain: this.gfxTerrainFor(world),
      extra: this.gfx.extra.get(this.gfx.style.name)?.value ?? null,
      tune: this.gfxTune,
    });
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

  /**
   * Hibrit su tuvalini bağlar. WebGL2 yoksa sessizce vazgeçilir ve her şey
   * Canvas2D'de kalır — katman silinmez, yalnız devreye girmez.
   */
  attachWaterCanvas(canvas) {
    if (!canvas) return false;
    this.waterGL = SurfaceGL.create(canvas);
    if (!this.waterGL) return false;
    this.warFx = WarFx.attach(this, canvas);
    // BAĞLAM KAYBI (bkz. SurfaceGL): kayıpta glWater() yanlışa döner ve
    // zemin Canvas2D'den boyanır; geri gelince dünya dokuları yeniden yüklenir.
    // İki yönde de bütün önbellekler baştan kurulur: GL kipinde pişen katmanlar
    // zemin taşımaz, Canvas2D kipinde pişenler taşır — biri ötekinin yerine
    // geçemez.
    this.waterGL.onLost = () => this.surfaceChanged();
    this.waterGL.onRestored = () => {
      const world = this.renderWorld;
      if (world && this.material.cache?.world === world) {
        this.waterGL.setWorld(world, this.material.cache, {
          owner: this.surfaceOwnerData(world),
          character: this.surfaceCharacterData(world),
        });
      }
      this.surfaceChanged();
    };
    // resize BURADA çağrılmaz: kurucu, düzen (layout) oturmadan çalışıyor ve
    // tuval o anda 0x0 ölçülüyor. Ölçüyü Game ilk kareden sonra verir.
    this.invalidateCache();
    // GPU süresi konsoldan/başsız ölçümden: son karelerin kayan ortalaması (ms).
    globalThis.__gpuMs = () => this.waterGL?.gpuMs() ?? null;
    // ?gfx= ile açılan stil yüzey bağlanınca devreye girer (klasikte hiçbir şey).
    if (this.pendingGfx && this.pendingGfx !== 'classic') this.setGfxStyle(this.pendingGfx);
    this.pendingGfx = null;
    return true;
  }

  /** Zemin GL ile Canvas2D arasında el değiştirdi: her pişmiş katman bayat. */
  surfaceChanged() {
    this.invalidateCache();
    this.staticLayers = null;
    this.requestFrame?.();
  }

  /**
   * Deniz Canvas2D'de mi çizilecek? WebGL katmanı devredeyken HAYIR: dolgu,
   * malzeme, gök gradyanı, desen ve kıyı hattı atlanır ve o alan SAYDAM
   * kalır. Tek karar noktası burasıdır; çağıran taraflar bunu sorar.
   */
  canvasWater() {
    return this.waterAnimatedMode() && !this.glSurface();
  }

  /**
   * WebGL yüzey katmanı bu karede geçerli mi?
   *
   * HARİTA KİPİNDEN BAĞIMSIZ. Eskiden yalnız "su animasyonlu" kiplerde
   * açılıyordu; kaynak/nüfus/barış/inşaat kiplerinde eski Canvas2D yoluna
   * düşülüyor ve harita bambaşka bir sunuma dönüyordu — aynı oyunda iki ayrı
   * sanat yönetimi. Artık zemin her kipte GPU'dan gelir; kipe göre değişen
   * tek şey denizin MALZEMELİ mi düz mü çizileceğidir (bkz. uSeaMaterial).
   */
  glWater() {
    // GL dokuları ÇİZİLEN dünyaya ait olmalı: yeni dünya ilk karelerde eski
    // dünyanın kara maskesi ve yüksekliğiyle boyanıyordu (ısıtma setWorld'ü
    // birkaç kare sonra çağırır). O aralıkta zemin Canvas2D'den çizilir.
    const wgl = this.waterGL;
    return !!wgl?.debug.enabled && !wgl.lost && !!wgl.world
      && (!this.renderWorld || wgl.world === this.renderWorld);
  }

  /** Okunurluk için takma ad; yüzey artık karayı da çiziyor. */
  glSurface() {
    return this.glWater();
  }

  /**
   * A/B anahtarı (deney dalı boyunca): 'gpu' WebGL yüzeyi, 'classic' eski
   * Canvas2D borusu. Konsoldan:  game.renderer.setSurfaceMode('classic')
   *
   * Eski yol SİLİNMEDİ; iki sunum yan yana karşılaştırılabilsin diye duruyor.
   */
  setSurfaceMode(mode) {
    if (!this.waterGL) return 'classic';
    this.waterGL.debug.enabled = mode !== 'classic';
    this.invalidateCache();
    this.staticLayers = null;
    this.staticDirty = true;
    this.requestFrame?.();
    return this.waterGL.debug.enabled ? 'gpu' : 'classic';
  }

  /**
   * Hex başına TABAN RENK, oyunun kendi renk borusundan.
   *
   * `tileColor` ne döndürüyorsa o: harita kipi, işgal, kültür, barış masası —
   * hepsi orada karara bağlanır ve shader kendi doğrusunu KURMAZ. Renk CSS
   * dizesi olduğu için cols×rows'luk bir tuvale hex başına bir piksel
   * boyanır ve tek `getImageData` ile okunur; 15360 hex için ~10 ms, dünya
   * başına ya da sahiplik değişince bir kez.
   */
  surfaceOwnerData(world) {
    const cols = world.cols;
    const rows = world.rows;
    const out = new Uint8Array(cols * rows * 4);
    const hook = this.gfx.style?.tileColor;
    for (let i = 0; i < cols * rows; i++) {
      const tile = world.tiles[i];
      if (!tile) continue;
      // Deniz de yazılır: düz-deniz kiplerinde shader rengi buradan okur.
      // Stil yalnız KARA rengini değiştirebilir: deniz pikselleri birebir kalsın.
      const css = hook && !tile.terrain.water
        ? (hook(tile, world, this) ?? this.tileColor(tile, world))
        : this.tileColor(tile, world);
      const rgb = this.cssToRgb(css);
      const p = i * 4;
      out[p] = rgb[0];
      out[p + 1] = rgb[1];
      out[p + 2] = rgb[2];
      out[p + 3] = 255;
    }
    return out;
  }

  /**
   * CSS renk dizesi -> RGB, BENZERSİZ dize başına bir kez.
   *
   * `tileColor` zaten sınırlı sayıda dize döndürür (bkz. tintCache): 15360
   * hex için birkaç yüz farklı renk. Her hex için tuvale boyayıp okumak
   * yerine dize başına bir kez çözülür — sahiplik tazelemesi böylece bir
   * kare bütçesinin altında kalır.
   */
  cssToRgb(css) {
    this.rgbCache ??= new Map();
    const hit = this.rgbCache.get(css);
    if (hit) return hit;
    if (!this.rgbProbe) {
      const k = document.createElement('canvas');
      k.width = 1;
      k.height = 1;
      this.rgbProbe = k.getContext('2d', { willReadFrequently: true });
    }
    const g = this.rgbProbe;
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    const rgb = [d[0], d[1], d[2]];
    this.rgbCache.set(css, rgb);
    return rgb;
  }

  /**
   * Yüzeyin renk dokusunu tazeler. Fetih, harita kipi değişimi, işgal — hepsi
   * `tileColor`ın çıktısını değiştirir ve GPU o çıktıyı bir dokudan okur;
   * doku tazelenmezse harita ESKİ sahibi göstermeye devam eder. Bu kozmetik
   * değil, yanlış bilgi.
   *
   * Yalnız BAYRAK kaldırılır; asıl yükleme bir sonraki karede yapılır ki aynı
   * tikte gelen onlarca değişiklik tek tazelemeye düşsün.
   */
  invalidateSurfaceColors() {
    this.surfaceColorsDirty = true;
  }

  /** Hex başına işgal: RGB işgalcinin mürekkebi, A bayrak. */
  surfaceOverlayData(world) {
    const n = world.cols * world.rows;
    const out = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) {
      const tile = world.tiles[i];
      if (!tile || tile.terrain.water || !isOccupied(tile)) continue;
      const holder = world.nations[controllerOf(tile)];
      const rgb = this.cssToRgb(holder ? this.nationInk(holder) : '#999999');
      const p = i * 4;
      out[p] = rgb[0];
      out[p + 1] = rgb[1];
      out[p + 2] = rgb[2];
      out[p + 3] = 255;
    }
    return out;
  }

  /** Hex başına arazi karakteri: R kabartma kazancı, G gren, B sıcaklık. */
  surfaceCharacterData(world) {
    const cols = world.cols;
    const rows = world.rows;
    const out = new Uint8Array(cols * rows * 4);
    for (let i = 0; i < cols * rows; i++) {
      const tile = world.tiles[i];
      const ch = SURFACE_CHARACTER[tile?.terrain?.id] ?? SURFACE_DEFAULT;
      const p = i * 4;
      out[p] = Math.round(Math.min(1, ch.relief / 2) * 255);
      out[p + 1] = Math.round(ch.grain * 255);
      out[p + 2] = Math.round((ch.warm * 0.5 + 0.5) * 255);
      out[p + 3] = 255;
    }
    return out;
  }

  /** Game bir sonraki animasyon karesini zamanlasın mı (bkz. Game.scheduleWaterFrame). */
  waterActive() {
    // Etiket erimesi de kare ister: su çizmeyen kiplerde yarıda donmasın.
    // waterSkipped: zoom jesti deniz katmanını atlattı — zincir sürsün ki
    // jest bitince su kendiliğinden geri gelsin.
    // GL su kendi zamanına göre akar; kare zinciri onu beslemek için sürer.
    // Ayrı bir rAF döngüsü AÇILMADI (bkz. CLAUDE.md): kamera senkronu tek
    // yerden gelsin diye su, haritanın kendi karesinde güncelleniyor. Canvas
    // tarafı bu karelerde yalnız hazır katmanları blit eder (p50 1.0 ms).
    // Yalnız MALZEMELİ kiplerde: veri/barış kiplerinde GL deniz düz ve
    // zamandan bağımsızdır (uSeaMaterial 0), zincir aynı kareyi boşuna
    // yeniden çiziyordu (ölçüldü: duraklatılmış haritada 5 sn'de 35 tam kare).
    if (this.glWater() && this.waterAnimatedMode()) return true;
    return this.water.animatedThisFrame || this.minis.live
      || this.labelFadePending === true || this.waterSkipped === true;
  }

  /**
   * Su tiki yalnız GL denizini çizebilir mi? GL deniz alttaki ayrı tuvaldedir;
   * 2B harita (statik blit, şehirler, cepheler, sayaçlar, etiketler) su
   * tikleri arasında AYNIDIR. Eskiden her tik tam kare çiziyordu: duraklatılmış
   * haritada uzak zoomda kare 3.3 ms (hedef < 2), 5 sn'de 75-150 tam kare,
   * maliyetin tamamı etiket + sayaç (ölçüldü; su kendisi ~0.005 ms).
   * Temkinli kapı: stil sarmalı/stil karesi, etiket erimesi, atlanmış su,
   * bekleyen dilim işi ya da yeni bitmiş jest varsa tam kare çizilir —
   * jestten sonraki "netle" kararı ve boşta ısıtma tam karede yürür.
   */
  canDrawWaterOnly() {
    if (!this.glWater() || !this.waterAnimatedMode() || this.gfx.style) return false;
    // Figürlerin kare sırası geldi: bu tik 2B katmanı da yenilesin.
    if (this.minis.due()) return false;
    if (this.labelFadePending === true || this.waterSkipped === true || this.hasPendingJobs()) return false;
    const rest = performance.now() - Math.max(this.zoomStamp?.at ?? 0, this.moveStamp?.at ?? 0);
    return rest > 600;
  }

  /** Yalnız GL deniz karesi; kamera ve deniz durumu son tam kareden kalır. */
  drawWaterOnly() {
    this.waterTime = performance.now() / 1000;
    this.waterGL.draw(this.camera, this.waterTime);
    this.warFx?.frame(this.renderWorld, this.viewPlayer);
  }

  /**
   * Dilimli arka plan işi kaldı mı? Game kare zincirini buna bakarak sürdürür:
   * statik katman ve uzak önbellek dilimleri yalnız çizim karesinde ilerler,
   * zincir kesilirse iş bir sonraki etkileşime dek yarım kalıyordu.
   */
  hasPendingJobs() {
    // Yalnız bu karede İLERLEYECEK işler sayılır. Yakın katman işi uzak zoomda,
    // gölge işi siyasi kip ya da GL yüzeyi dışında hiç ilerlemez; sayılırsa
    // kare zinciri duraklatılmış haritada bile sonsuza dek tam hızda dönüyordu.
    const near = this.camera.zoom >= CACHE_ZOOM;
    const band = !!this.bandJob && this.mapMode === 'political' && this.glSurface();
    // Stil arazisi pişiyorsa kare zinciri sürsün (klasikte style null, maliyet yok).
    const gfx = !!this.gfx.style && this.glSurface() && this.gfxNeedsBake(this.renderWorld);
    return (!!this.staticJob && near) || !!this.farJob || band || gfx;
  }

  /**
   * Ülke kenar gölgesi alanını dilim dilim kurar (bkz. borderMesh.bandFieldJob);
   * alan hazırsa true. Toplam ~20 ms sahiplik değişiminde tek kareye
   * sığdırılınca takılma oluyordu; bitene dek GL eski alanı gösterir —
   * gölgenin birkaç kare geç kayması görünmez.
   */
  stepBandJob(mesh, budgetMs) {
    if (mesh.band?.version === mesh.version) return true;
    let job = this.bandJob;
    if (!job || job.mesh !== mesh || job.version !== mesh.version) {
      job = { mesh, version: mesh.version, it: bandFieldJob(mesh) };
      this.bandJob = job;
    }
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (job.it.next().done) {
        this.bandJob = null;
        return true;
      }
    }
    this.requestFrame?.();
    return false;
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
    // Kara malzemesi de perde arkasında pişer: ışık alanı + iki doku birlikte
    // ~150 ms tutuyor ve ilk statik katmanda tek karede ödenirse takılıyor.
    if (this.material.warmStep(this.ctx, world)) return true;
    // WebGL su katmanı, malzemenin kıyı uzaklığı alanını doku olarak alır.
    // Kayıp bağlamda atlanır: setWorld yükleyemez ve ısıtma zinciri aynı
    // adımı sonsuza dek tekrar ederdi; bağlam dönünce onRestored kurar.
    if (this.waterGL && !this.waterGL.lost && this.waterGL.world !== world) {
      const wasGL = this.glSurface();
      this.waterGL.setWorld(world, this.material.cache, {
        owner: this.surfaceOwnerData(world),
        character: this.surfaceCharacterData(world),
      });
      // İlk yüklemede zemin Canvas2D'den GL'ye geçer: o kipte pişen katmanlar
      // dolgu taşıyıp GL yüzeyini örter, geçişi yarıda yakalayan uzak pişirme
      // ise iki kipi karıştırıp karayı dolgusuz, gri malzemeyle boyuyordu
      // (ölçüldü: uzak dokuda kara pikseli opak gri).
      if (this.glSurface() !== wasGL) this.surfaceChanged();
      return true;
    }
    // Sınır ağı (~15 ms) ve GL dolgu tablosu da perde arkasında kurulur;
    // ilk harita karesi onları ödemesin.
    if (this.mesh?.world !== world || this.meshCheck) {
      this.borderMeshFor(world);
      return true;
    }
    if (this.waterGL && !this.mesh.gl) {
      meshGlTable(this.mesh);
      return true;
    }
    if (this.waterGL && !this.stepBandJob(this.mesh, 10)) return true;
    // Görsel stilin arazisi de perde arkasında pişer (yalnız stil açıksa).
    if (this.waterGL && !this.waterGL.lost && this.gfxNeedsBake(world)) {
      this.stepGfxBake(world, 10);
      return true;
    }
    if (this.water.warmStep(this.ctx)) return true;
    if (!this.cache) {
      this.stepCacheBuild(world, 10);
      return !this.cache;
    }
    return false;
  }

  /**
   * Çizim ölçeği (Settings → Graphics → Render scale). Yalnız arka tamponu
   * küçültür: kamera ve isabet sınaması CSS pikselinde kaldığı için tıklama,
   * etiket yeri ve arayüz değişmez; tarayıcı tuvali pencereye geri büyütür.
   */
  setRenderScale(scale) {
    const next = Math.max(0.5, Math.min(1, Number(scale) || 1));
    if (next === (this.renderScale ?? 1)) return;
    this.renderScale = next;
    this.resize();
    this.invalidateCache();
    this.requestFrame?.();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1) * (this.renderScale ?? 1);
    this.waterGL?.resize(rect.width, rect.height, dpr);
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
    // Kip değişimi, dünya değişimi, sahiplik — hepsi buradan geçer.
    this.surfaceColorsDirty = true;
    this.surfaceOverlayDirty = true;
    this.meshCheck = true;
    this.cache = null;
    this.tintCache.clear();
    // Sprite'lar ulus rengine bağlı; yeni dünyada aynı id başka renktir.
    this.unitSprites?.clear();
    // Bayrak sprite'ı da ulus KİMLİĞİYLE anahtarlı: temizlenmezse yeni
    // kampanyada uzak zoomdaki her ordu önceki dünyanın aynı id'li ulusunun
    // bayrağını taşıyordu (ölçüldü: 109 sprite'ın 94'ü yanlış ulus).
    this.flagSprites?.clear();
    // Uzak rozet ve figür levhası da bayrağı taşır (aynı nedenle).
    this.farBadges?.clear();
    this.minis?.dropPlates();
    this.dirtyTiles?.clear();
    // Ülke biçimleri değişmiş olabilir: etiket yerleşimi yeniden kurulsun.
    this.labelsDirty = true;
    this.staticDirty = true;
    this.seaFrame = null;
    this.dropStaticJob();
    this.farJob = null;
    // Stilin hex verisi (gelişmişlik vb.) de sahiplik/kip ile değişebilir.
    if (this.gfx) this.gfx.hexDirty = true;
  }

  /**
   * Nokta geçersizleme: sahiplik/işgal değişen kareler tam pişirme yerine
   * önbelleğe yerinde boyanır. Savaş haftalarında invalidateCache fırtınası
   * 32k hexlik dünyayı haftada onlarca kez baştan pişiriyordu; artık yalnız
   * değişen kareler (+3 komşu halkası) yeniden mürekkeplenir.
   */
  invalidateTiles(tiles, ownershipChanged = true) {
    if (ownershipChanged) {
      this.surfaceColorsDirty = true;
      // Bölge (province, sahip) değişmiş olabilir; ağ ancak anahtarlar
      // gerçekten değiştiyse yeniden kurulur (bkz. borderMeshFor).
      this.meshCheck = true;
      this.gfx.hexDirty = true;
    }
    // İŞGAL DOKUSU HER ZAMAN KİRLENİR — sahiplik bayrağına BAĞLANAMAZ.
    // occupy() bilerek `ownershipChanged: false` geçer (etiket yerleşimi
    // kaymasın diye) ve işgal taraması GPU'ya taşındığında doku bu bayrağa
    // bağlanmıştı: yani savaşta değişen tek şey olan işgal, dokuyu hiç
    // tazelemiyordu. Sonuç sahada iki türlü görünüyordu — yeni işgal edilen
    // province boyanmıyor, çoktan kurtulmuş bir yer ise hâlâ taralı duruyordu.
    // Canvas2D yolu bu hatayı yapamazdı çünkü her kare canlı durumdan çizerdi.
    this.surfaceOverlayDirty = true;
    // Etiket çapaları yalnız EGEMENLİK değişince kayar (ownerOf owner'a
    // bakar, controller'a değil). İşgal (occupy) controller değiştirir;
    // onun için yerleşimi kirletmek, savaş haftalarında her turda 15k karelik
    // PCA taramasını tetikleyip etiketleri jest ortasında sıçratıyordu —
    // "haritada rastgele beliren isimler" şikâyetinin kökü buydu.
    if (ownershipChanged) this.labelsDirty = true;
    this.staticDirty = true;
    // Önbellek de pişirme işi de yoksa iş yok: ilk uzak-zoom karesi zaten
    // taze pişirir. Pişirme SÜRÜYORSA kayıt tutulur — dilimli iş bu kareleri
    // eski durumdan boyamış olabilir ve bitince buradan yerinde onarılır;
    // tutulmazsa bitmiş doku eski sınırı bir sonraki tam pişirmeye dek
    // taşıyordu (ölçüldü: devredilen kare eski sahibin renginde kaldı).
    if (!this.cache && !this.farJob) return;
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
    // Sınır mürekkebi komşuya taşar. Üç halka: yumuşak sınır kendi hexinden
    // yarım hex sapar ve ülke kenar gölgesi sınırdan ~74 birim içeri iner;
    // tek halkada eski gölge onarım bölgesinin dışında asılı kalıyordu.
    const affected = new Set(dirty);
    let ring = [...dirty];
    for (let k = 0; k < 3; k++) {
      const next = [];
      for (const tile of ring) {
        for (const n of world.neighbors(tile)) {
          if (affected.has(n)) continue;
          affected.add(n);
          next.push(n);
        }
      }
      ring = next;
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
    // Onarılan bölge kırpma yolunun İÇİNDE baştan boyanır; malzeme burada
    // dilimlenmediği için dikiş sorunu yoktur (bkz. stepFarBake üç süpürme).
    const rect = {
      minX: minX - HEX_SIZE * 2, maxX: maxX + HEX_SIZE * 2,
      minY: minY - HEX_SIZE * 2, maxY: maxY + HEX_SIZE * 2,
    };
    this.drawTerrain(ctx, list, world, rect);
    if (this.occupationMode() && !this.glSurface()) {
      this.drawOccupationOverlay(ctx, world, list, cache.scale);
    }
    if (this.mapMode === 'cultures') this.drawCultureMix(ctx, world, list, cache.scale, rect);
    this.drawMeshInk(ctx, world, rect, cache.scale, true);
    ctx.restore();
  }

  /** Siyasi katmanlar (sınır, province kenarı, etiket) çizilsin mi? */
  showsPolitics() {
    return this.mapMode !== 'terrain' && this.mapMode !== 'geography';
  }

  setMapMode(mode) {
    this.mapMode = mode;
    // Diplomasi kipinden çıkınca bakılan ülke unutulur: tekrar açılışta harita
    // oyuncunun kendi ilişkileriyle başlar.
    if (mode !== 'diplomacy') this.diplomacyFocus = null;
    this.modeCache = null;
    this.tintCache.clear();
    this.invalidateCache();
  }

  /** İşgal taraması hangi kiplerde çizilir: siyaset ve diplomasi (savaşın hâli). */
  occupationMode() {
    return this.showOccupation !== false && (this.mapMode === 'political' || this.mapMode === 'diplomacy');
  }

  /** Ayarlar: işgal taraması açık/kapalı. Pişmiş katmanlar da yeniden çizilir. */
  setOccupationShade(on) {
    this.showOccupation = !!on;
    this.invalidateCache();
  }

  /**
   * Veri kipinin renkleri yeniden okunsun (hafta kapandı, savaş ilan edildi,
   * bakılan ülke değişti). GPU yüzeyinde yalnız renk dokusu tazelenir; eski
   * Canvas2D yolunda önbellek baştan pişer.
   */
  refreshModeColors() {
    this.modeCache = null;
    if (this.glSurface()) this.invalidateSurfaceColors();
    else this.invalidateCache();
  }

  /** Diplomasi kipinde ilişkileri gösterilen ülke; null = oyuncu. */
  setDiplomacyFocus(nationId) {
    const next = nationId ?? null;
    if (next === (this.diplomacyFocus ?? null)) return;
    this.diplomacyFocus = next;
    this.refreshModeColors();
  }

  /** Bakılan ülkenin kimliği: seçilen yaşayan ülke, yoksa oyuncu. */
  diplomacyFocusId(world) {
    const focus = this.diplomacyFocus;
    if (focus != null && world.nations?.[focus]?.alive) return focus;
    return this.viewPlayer ?? 0;
  }

  /**
   * Veri kiplerinin kare başına okuduğu tablo. Kip, dünya ya da bakılan ülke
   * değişince yeniden kurulur; `refreshModeColors` onu da düşürür.
   */
  modeTable(world) {
    const focus = this.mapMode === 'diplomacy' ? this.diplomacyFocusId(world) : null;
    const cached = this.modeCache;
    if (cached && cached.world === world && cached.mode === this.mapMode && cached.focus === focus) {
      return cached;
    }
    const table = { world, mode: this.mapMode, focus };
    if (this.mapMode === 'diplomacy') table.relation = diplomacyStanding(world, focus);
    this.modeCache = table;
    return table;
  }

  /** Veri kiplerinde karanın rengi (deniz tileColor'da ayrılır). */
  dataTint(tile, world) {
    const owner = ownerOf(tile, world);
    if (owner < 0) return DATA_EMPTY;
    if (this.mapMode === 'diplomacy') {
      return DIPLOMACY_COLORS[this.modeTable(world).relation[owner]] ?? DIPLOMACY_COLORS.neutral;
    }
    if (this.mapMode === 'infamy') {
      return rampColor(INFAMY_RAMP, (world.nations[owner]?.infamy ?? 0) / INFAMY_COALITION);
    }
    // `tile.province` kümenin econ kaydıdır (provinces.initProvinces); buz
    // eteğinin kendi kümesi yok, bağlı olduğu kümeden okunur.
    const provinceId = tile.provinceId >= 0 ? tile.provinceId : tile.fringeOf;
    const econ = tile.province ?? world.provinces?.[provinceId]?.econ;
    if (!econ) return DATA_EMPTY;
    if (this.mapMode === 'unrest') return rampColor(UNREST_RAMP, (econ.unrest ?? 0) / 10);
    // Kademe kümenin econ kaydından okunur; hafta kapanışında alınır ve
    // hud.refreshDataMode → refreshModeColors önbelleği o anda düşürür.
    if (this.mapMode === 'industry') return developmentShade(econ.development);
    return DATA_EMPTY;
  }

  /**
   * Baris masasi kipi. Karsi tarafin topragi kirmizi, secilenler yesil yanar;
   * kendi verdigin topraklar turuncu: harita bir secim yuzeyine doner.
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
    const base = this.mineralize(owner.hue, owner.sat * 0.80, owner.light * shade * 0.9);
    // KÜRESEL DERECELENDİRME BURADA. Saydam siyah bir dikdörtgen sermek
    // yerine renk borusunun kaynağında bir eğri uygulanır: bant hem AŞAĞI
    // kaydırılır (dünya koyulaşır) hem de orta ton çevresinde açılır (yerel
    // kontrast artar). Sonuç tek tutarlı bir tabaka — her ülkeye ayrı filtre
    // değil.
    //
    // 34-60 → 27-64 → 22-53. İkinci aralık dünyayı yeterince koyulaştırmadı:
    // ekranda hâlâ pastel okunuyordu. Alt sınır siyah değil, üst sınır
    // kâğıt beyazı değil: ne ezilmiş gölge ne yanmış highlight.
    const PIVOT = 44;
    const graded = PIVOT + (base.light - PIVOT) * 1.16 - 8.5;
    const light = Math.max(22, Math.min(53, graded + step * 1.4));
    // Doygunluk parlaklıkla birlikte düşer: koyu bir yüzey aynı doygunlukta
    // kalırsa neon okunur. Olgun mineral pigment tam tersidir.
    const sat = Math.max(14, Math.min(42, base.sat * 0.92 + step * 0.8));
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
   * çıkartma gibi durmaz (bkz. drawMeshBands).
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
  /**
   * Karenin HÜCRESİNİ (organik hex, bkz. borderMesh.cellEdge) yola ekler.
   * Kara hücresi sınır ağının geometrisinden gelir: ızgara, imleç ve cephe
   * bandı dolgu ve tıklamayla aynı şekli çizer. Ağ henüz yoksa ya da kare
   * denizse düz hex (deniz hücreleri yalnız kıyıda eğilir).
   */
  cellPath(path, world, tile) {
    const base = tile.ghostOf ?? tile;
    const mesh = this.mesh?.world === world ? this.mesh : null;
    if (!mesh || base.terrain.water) {
      this.hexPath(path, tile.x, tile.y);
      return;
    }
    const loop = cellOutline(mesh, base.row * world.cols + base.col);
    const m = loop.length / 2;
    path.moveTo(tile.x + loop[0], tile.y + loop[1]);
    for (let i = 1; i < m; i++) path.lineTo(tile.x + loop[i * 2], tile.y + loop[i * 2 + 1]);
    path.closePath();
  }

  /** Dünya noktasının karesi, hücre geometrisine göre (tıklama ve imleç). */
  tileAtWorld(world, x, y) {
    const i = cellAt(this.borderMeshFor(world), x, y);
    return i >= 0 ? world.tiles[i] : null;
  }

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
      || L.dpr !== this.dpr || L.grid !== this.layerKey();
    if (hard) {
      this.dropStaticJob();
      return this.buildStaticLayers(world);
    }
    if (this.staticDirty) {
      // Oyun olayı (fetih, işgal) statiği bayatlattı: senkron tam pişirme
      // DEĞİL dilimli iş — zaman akarken her haftalık tikte 12-40 ms'lik
      // takılmanın kaynağı buydu. İçerik en fazla 3 kare (~120 ms) bayat
      // kalır; sınır çizgisinin yüz milisaniye geç güncellenmesi hissedilmez,
      // kare düşmesi hissedilir.
      //
      // Gösterilen katman BAYAT diye işaretlenir: iş bitene dek kaydırma onun
      // piksellerini taşıyamaz ve iş, zoom değişmedi diye yarıda bırakılamaz.
      this.staticDirty = false;
      L.stale = true;
      this.dropStaticJob();
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
    const uncovered = Math.abs(dx) > slackX || Math.abs(dy) > slackY;
    if (mag === 1) {
      // Bayat içerik ya da BU zoom'da yarım kalmış iş dilim dilim bitirilir.
      // Eskiden bu dal işi koşulsuz düşürüyordu: fetihten sonraki ilk dilim
      // boyanıyor, ertesi karede iş atılıyor ve kamera zoom yapmadıkça sınır
      // hiç tazelenmiyordu (ölçüldü: 2.5 sn sonra da, kaydırıp dönünce de eski
      // sahibin rengi — kaydırma bayat pikselleri yeni katmana taşıyordu).
      if (L.stale || this.staticJob?.zoom === cam.zoom) {
        this.stepStaticJob(world);
        return this.staticLayers;
      }
      this.dropStaticJob();
      if (uncovered) return this.buildStaticLayers(world);
      return L;
    }
    // Zoom değişti. Jest SÜRERKEN katman yeniden pişmez: ölçekli blit yeter.
    // Tek istisna kapsama kaybıdır — katman görüşü örtmüyorsa kenarda doku
    // kalmaz ve altına zemin serilir, o zaman ertelenemez.
    //
    // Eskiden büyütme ±%25-33'ü aştığında da pişiriliyordu ve sürekli zoomda
    // bu eşik her birkaç karede tetikleniyordu: 2 MP'lik katman ÇİFTİ yeniden
    // boyanıp GPU'ya yükleniyordu. Ölçüldü (aynı dünya, 10 sn zoom taraması):
    //
    //   eşikli (eski)          dt p95 22.0 · p99 54.5 · max 131.6 · 37 kare >33 ms · 16.1 MB/sn
    //   yalnız kapsama (yeni)  dt p95  7.2 · p99  7.4 · max  10.7 ·  0 kare >33 ms ·  1.1 MB/sn
    //
    // Yani ara pişirmeler tamamen israftı; jest boyunca ölçekli blit zaten
    // yeterince iyi görünüyordu. Jest yerleşince (STATIC_SETTLE_MS) katman TAM
    // zoom'da bir kez pişer, durağan haritada bulanıklık kalmaz.
    const settled = performance.now() - this.zoomStamp.at > STATIC_SETTLE_MS;
    if (settled || uncovered) this.stepStaticJob(world);
    return this.staticLayers;
  }

  /**
   * Yarım statik işi bırakır; tuval çifti yedeğe döner. Döndürülmezse her
   * yeniden başlatma tam ekranlık yeni bir çift ayırıyordu — savaşta her
   * işgal bir iş başlattığı için bu, olay başına onlarca MB çöp demekti
   * (ölçüldü: 5 işgalde 10 tuval, 1946×1216).
   */
  dropStaticJob() {
    const job = this.staticJob;
    if (!job) return;
    this.staticJob = null;
    if (!this.staticSpare) this.staticSpare = job.pair;
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
      if (stale) {
        this.dropStaticJob();
        job = null;
      }
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
        // Stil mürekkebi dilime iş ekler: altı dilimde kare başına yük yarıya
        // iner (klasikte üç, değişmedi).
        slice: 0, slices: this.gfx.style?.ink ? 6 : 3, tiles: 0,
        mode: this.mapMode, grid: this.layerKey(), dpr: this.dpr,
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
    } else {
      // IS BITMEDIYSE KENDI KARESINI ISTER. Dilimli pisirme kare basina bir
      // adim atiyor, ama render ISTEGE BAGLI: fetihten sonra tek kare cizilip
      // is yarim kaliyordu ve sinir, oyuncu zoom yapip yeni kare tetikleyene
      // kadar eski halinde donuyordu (kullanici bildirimi).
      this.requestFrame?.();
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

    if (this.glSurface()) {
      // ZEMİN HİÇ BOYANMAZ. Deniz de kara da WebGL yüzey katmanından gelir;
      // bu katmana yalnız mürekkep (tarama, ızgara, kenar, sınır) düşer.
    } else if (this.waterAnimatedMode()) {
      const land = [];
      const sea = [];
      for (const tile of tiles) (tile.terrain.water ? sea : land).push(tile);
      // SIRA KRİTİK. Deniz derinliği artık hex başına bir ton değil, sürekli
      // bir kıyı-uzaklığı rasteri (bkz. material.paintSea). O raster
      // yumuşatılarak büyütüldüğü için kenarı yarım teksel karaya taşar;
      // ARAYA GİRME sırası bunu bedavaya çözer:
      //   deniz dolgusu → deniz rasteri → KARA dolgusu (taşmayı kapatır)
      // Alternatifi binlerce hexlik kırpma yoluydu; bu borunun ölçülmüş en
      // pahalı işlemi tam olarak odur.
      this.paintTileFills(b, sea, world);
      this.material.paintSea(b, world, rect);
      this.paintLandFills(b, world, land, rect);
      this.water.paintStaticBase(b, world, sea);
      // MALZEME: ışık alanı, kabartma ve kâğıt greni. Dolgunun üstüne,
      // kıyı mürekkebinin altına biner — düz poligon burada yüzey olur.
      this.material.paint(b, world, rect, scale);
      // ÜST: kıyı mürekkebi çizgi katmanının en altına.
      if (sea.length) {
        const cache = this.water.ensureWorld(world);
        const coastal = sea.filter((tile) => cache.coastalSet.has(tile.ghostOf ?? tile));
        if (coastal.length) this.water.drawCoastline(t, cache, coastal, scale);
      }
    } else {
      const land = [];
      const sea = [];
      for (const tile of tiles) (tile.terrain.water ? sea : land).push(tile);
      this.paintTileFills(b, sea, world);
      this.paintLandFills(b, world, land, rect);
    }

    // ÜST: işgal/inşaat taraması, ızgara, province kenarı, ülke sınırı.
    // İşgal taraması GPU yüzeyinde (bkz. surfaceGL uOverlay); Canvas2D yalnız
    // yedek yolda çizer, yoksa iki kez binip alfası katlanır.
    if (this.occupationMode() && !this.glSurface()) {
      this.drawOccupationOverlay(t, world, tiles, scale);
    }
    if (this.mapMode === 'cultures') this.drawCultureMix(t, world, tiles, scale, rect);
    if (this.showGrid && scale >= GRID_MIN_ZOOM && this.mapMode !== 'geography') {
      this.drawGrid(t, world, tiles, scale);
    }
    if (this.gfx.style?.ink) this.gfxInk('under', t, world, rect, scale, false, clip);
    this.drawMeshInk(t, world, rect, scale);
    if (this.gfx.style?.ink) this.gfxInk('over', t, world, rect, scale, false, clip);

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
    // sürükleme sırasındaki "kasma" bu farktan geliyordu. Bayat katman
    // (bkz. ensureStaticLayers `stale`) kaydırılmaz: eski sınırı yeni şeridin
    // yanına taşır ve harita yarı eski yarı yeni kalırdı.
    const canScroll = prev && !prev.stale && !this.staticDirty && prev.world === world
      && prev.mode === this.mapMode && prev.dpr === dpr && prev.grid === this.layerKey()
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

    // Ya baştan boyanır ya da taze katmandan kaydırılır: iki durumda da güncel.
    Object.assign(L, {
      world, mode: this.mapMode, dpr, grid: this.layerKey(),
      zoom: cam.zoom, cx: cam.x, cy: cam.y, x0, y0, w, h, stale: false,
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
    this.spriteBakeMs = 0;
    // Stil kareyi sarmalayabilir (eğik kamera: mürekkep ekran dışına, yüzey
    // mesh'e; bkz. gfx/threeD.js). Klasikte ve sarmalamayan stilde dal yok.
    const wrap = this.gfx.style?.renderWrap;
    if (wrap && !this.inRenderWrap) {
      this.inRenderWrap = true;
      try {
        return wrap(this, world, state, () => this.render(world, state));
      } finally {
        this.inRenderWrap = false;
      }
    }
    const ctx = this.ctx;
    const cam = this.camera;
    // GL bağlamı geri geldiğinde dokular bu dünyadan yeniden kurulur.
    const wasGL = this.glSurface();
    this.renderWorld = world;
    // Dünya değiştiyse yüzey GL'den Canvas2D'ye (ya da geri) geçmiş olabilir:
    // pişmiş katmanlar diğer kipin zeminini taşıyor (bkz. surfaceChanged).
    if (this.glSurface() !== wasGL) this.surfaceChanged();
    // Diplomasi kipinin varsayılan bakış açısı; renk dokusu aşağıda bu kareden
    // önce tazelenirse doğru ülkeye göre kurulsun.
    if (state.playerNation != null && state.playerNation !== this.viewPlayer) {
      this.viewPlayer = state.playerNation;
      if (this.mapMode === 'diplomacy') this.refreshModeColors();
    }
    // Geçen zaman kare sayısından bağımsız: animasyon her FPS'te aynı hızda akar.
    this.waterTime = performance.now() / 1000;
    this.minis.frameStart(state.paused, state.selection, state.hovered);
    // Su önce çizilir: ayrı bir tuval olduğu için sıra bileşimi değiştirmez,
    // ama kamera değerleri Canvas2D karesiyle BİREBİR aynı kalır.
    if (this.glWater()) {
      this.waterGL.seaMaterial = this.waterAnimatedMode();
      this.waterGL.overlayOn = this.occupationMode();
      // Dolgu sınırı yumuşak eğriyi izlesin: tablo ağ değişince yüklenir.
      // Hex başına veri kiplerinde (arazi, kaynak) yalnız kıyı parçaları geçerli.
      const mesh = this.borderMeshFor(world);
      const wgl = this.waterGL;
      if (wgl.borderMesh !== mesh || wgl.regionVersion !== mesh.version) {
        const t = performance.now();
        if (wgl.borderMesh !== mesh) wgl.setBorderTable(meshGlTable(mesh), mesh);
        wgl.setRegionData(meshRegionData(mesh));
        wgl.regionVersion = mesh.version;
        this.perf?.add('r.meshgl', performance.now() - t);
      }
      wgl.remapOn = this.remapMode();
      const political = this.mapMode === 'political';
      if (political && (wgl.bandMesh !== mesh || wgl.bandVersion !== mesh.version)) {
        const t = performance.now();
        if (this.stepBandJob(mesh, 2)) wgl.setBandField(mesh.band, mesh);
        this.perf?.add('r.band', performance.now() - t);
      }
      wgl.bandOn = political && this.showCountryBorders && wgl.bandMesh?.world === world;
      // İki doku, iki ayrı ömür: taban rengi yalnız sahiplik/kip değişince,
      // işgal taraması ise kontrol her değiştiğinde tazelenir. Aynı bayrağa
      // bağlamak savaşta ya bedava tam tarama ya da bayat işgal demekti.
      if (this.surfaceColorsDirty) {
        this.surfaceColorsDirty = false;
        this.surfaceOverlayDirty = false;
        const t = performance.now();
        this.waterGL.updateOwners(this.surfaceOwnerData(world));
        this.waterGL.updateOverlay(this.surfaceOverlayData(world));
        this.perf?.add('r.surfacecolors', performance.now() - t);
      } else if (this.surfaceOverlayDirty) {
        this.surfaceOverlayDirty = false;
        const t = performance.now();
        this.waterGL.updateOverlay(this.surfaceOverlayData(world));
        this.perf?.add('r.surfaceoverlay', performance.now() - t);
      }
      if (this.gfx.style) this.gfxFrame(world);
      this.waterGL.draw(cam, this.waterTime);
    }
    this.warFx?.frame(world, state.playerNation);
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
    if (this.glWater()) {
      // Zemin BOŞALTILIR: su alttaki WebGL tuvalinden gelir.
      ctx.clearRect(0, 0, cam.viewWidth, cam.viewHeight);
    } else {
      // Harita zemini arayüz paletiyle aynı kömür-lacivert tonda.
      ctx.fillStyle = '#0b1115';
      ctx.fillRect(0, 0, cam.viewWidth, cam.viewHeight);
    }

    // Silindir dünya: görünür pencereye düşen her periyot kopyası ayrı çizilir.
    // Kopya başına yalnız görünür kareler işlendiğinden toplam maliyet sabittir.
    const P = world.wrapWidth;
    const rect = cam.visibleRect(HEX_SIZE * 2);
    const k0 = P ? Math.floor((rect.minX - WRAP_X0) / P) : 0;
    const k1 = P ? Math.floor((rect.maxX - WRAP_X0) / P) : 0;
    if (this.counterRects) this.counterRects.length = 0;
    if (this.unitHits) this.unitHits.length = 0;
    this.glideFresh = true;

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
    // Eğik kamerada bu kare ekran dışı mürekkep tuvalidir; kutu ve yazı
    // renderMarks'ta ekrana basılır.
    if (state.marquee && !this.markPass) this.drawMarquee(ctx, state.marquee);

    // Etiketler her zoomda: uzak görünümde ülke adları haritayı "atlas"
    // yapar; yoğunluğu zoom LOD'u ve çarpışma ayıklaması yönetir.
    if (this.showLabels && this.mapMode !== 'geography' && !this.markPass
      && world.nations?.length) {
      const t0 = performance.now();
      this.drawLabels(ctx, world);
      this.perf?.add('r.labels', performance.now() - t0);
    }
    this.perf?.bump('hex', this.lastDrawn);
    this.perf?.bump('copies', k1 - k0 + 1);
  }

  /**
   * Hiçbir dokunun yetişmediği alana serilen zemin: görünür dikdörtgenin
   * dünya sınırlarıyla kesişimi, derin okyanus tonunda. Dikey kırpma şart —
   * kutupların ötesi haritanın dışıdır ve orada uygulama zemini görünmelidir.
   */
  fillVoid(ctx, world, rect) {
    if (this.glWater()) return;
    const b = world.bounds;
    const y0 = Math.max(rect.minY, b.minY);
    const y1 = Math.min(rect.maxY, b.maxY);
    if (y1 <= y0) return;
    ctx.fillStyle = VOID_FILL;
    ctx.fillRect(rect.minX, y0, rect.maxX - rect.minX, y1 - y0);
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
      } else {
        // Pişirme sürüyor: satır bantları yukarıdan aşağı dolar, hazır kısım
        // gösterilir. Donmuş kare yerine 3-4 karede akan bir dolum.
        //
        // Hazır OLMAYAN bantların altına önce deniz tonu serilir. Serilmezse o
        // bantlar saydam kalıp uygulama zeminini gösteriyordu; kullanıcının
        // gördüğü "siyah kutular" buydu (ölçüldü: uzak kola geçilen ilk karede
        // örneklenen 576 pikselin 376'sı zemin rengindeydi).
        this.fillVoid(ctx, world, rect);
        if (this.farJob?.canvas) {
          const j = this.farJob;
          const b = world.bounds;
          const pad = CACHE_COLLAR / j.scale;
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(
            j.canvas,
            WRAP_X0 - pad, b.minY, (world.wrapWidth ?? b.maxX - b.minX) + pad * 2, b.maxY - b.minY,
          );
        }
      }
      perf?.add('r.far', performance.now() - t0);
      t0 = performance.now();
      if (this.cache && this.canvasWater()) {
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
      if (!covered) {
        // Zemin ASLA boş bırakılmaz. Üç kademe: pişmiş uzak doku, yarım pişmiş
        // iş tuvali, ikisi de yoksa düz derin su tonu.
        //
        // Eskiden yalnız ilk kademe vardı (`!covered && this.cache`) ve uzak
        // önbellek henüz pişmemişse — yeni dünya, kip değişimi ya da herhangi
        // bir invalidateCache'ten hemen sonra — kenarlarda uygulama zemini,
        // yani SİYAH kutular görünüyordu. Kullanıcının bildirdiği hata buydu.
        const backdrop = this.cache;
        if (backdrop) {
          const bpad = CACHE_COLLAR / backdrop.scale;
          ctx.drawImage(
            backdrop.canvas,
            backdrop.x - bpad, backdrop.y, backdrop.w + bpad * 2, backdrop.h,
          );
        } else if (this.farJob?.canvas) {
          const j = this.farJob;
          const b = world.bounds;
          const jpad = CACHE_COLLAR / j.scale;
          ctx.drawImage(
            j.canvas,
            WRAP_X0 - jpad, b.minY,
            (world.wrapWidth ?? b.maxX - b.minX) + jpad * 2, b.maxY - b.minY,
          );
        } else {
          this.fillVoid(ctx, world, rect);
        }
      }
      ctx.drawImage(layers.base, layers.x0 + shift, layers.y0, layers.w, layers.h);
      if (this.canvasWater()) {
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
    // ORDU SECILIYKEN EYALET VURGUSU YOK. Secili kare panelin baglamidir
    // (ordunun durdugu yer) ama haritada eyalet cercevesi cizmek, oyuncuya
    // "eyalet de secildi" diyordu (Kerem: asker seciliyken state secme bugu).
    // Orduyu gosteren isaret drawSelection'in halkasidir.
    const armySelected = (state.selection?.length ?? 0) > 0;
    // Seas kipi: bölge tonları ve adları suyun üstünde, şehir ve birimlerin altında.
    if (this.mapMode === 'seas') {
      this.sea.drawZones(ctx, world, rect, state.playerNation);
      this.sea.drawLanes(ctx, world, rect, state.playerNation);
      this.sea.drawUnderway(ctx, world, rect, state.playerNation);
    } else if (armySelected && this.mapMode !== 'geography') {
      // Ordu seçiliyken kapalı denizler taralı: sefer emri tam bu an verilir.
      this.sea.drawClosed(ctx, world, rect, state.playerNation);
    }
    // Kültür kipinde seçili halkın dağılımı (Cultures ekranı / province paneli).
    if (this.mapMode === 'cultures') this.drawCultureHighlight(ctx, world, rect);
    if (armySelected && !this.showGrid) this.drawArmyGrid(ctx, world, state.selection);
    // Izgara kapalıyken seçim ve imleç PROVINCE'i gösterir: hex çerçevesi,
    // gizlenen peteği tek karede geri getiriyordu. Province'i olmayan kare
    // (deniz) hex çerçevesiyle kalır — denizde yürüyüş hâlâ hex hex.
    const hexMarks = this.showGrid;
    const provinceOfTile = (tile) => (tile.provinceId >= 0 ? tile.provinceId : tile.fringeOf ?? -1);
    const selectedProvince = !armySelected && state.selected ? provinceOfTile(state.selected) : -1;
    if (selectedProvince >= 0) this.drawProvinceHighlight(ctx, world, selectedProvince, rect);
    if (!armySelected && state.selected && (hexMarks || selectedProvince < 0)) {
      this.drawHighlight(ctx, state.selected, '#ffffff', 3);
    }
    if (state.hovered && state.hovered !== state.selected) {
      const hovered = provinceOfTile(state.hovered);
      // Ordu seçiliyken imleç yürüyüş HEDEFİDİR ve hedef bir hextir.
      if (hexMarks || armySelected || hovered < 0) this.drawHighlight(ctx, state.hovered, 'rgba(255,255,255,0.45)', 2);
      else if (hovered !== selectedProvince) this.drawProvinceHighlight(ctx, world, hovered, rect, true);
    }
    if (this.gfx.style?.ink?.live) this.gfxInk('live', ctx, world, rect, cam.zoom, cam.zoom < CACHE_ZOOM);
    // Eğik kamerada (markPass 'ink') bu tuval araziye giydirilir: yalnız zemine
    // yatan çizgi kalır, işaretler drawMarkers'la ekrana dik basılır. Klasikte
    // markPass yok; sıra aynı.
    const marks = !this.markPass;
    if (marks) this.drawCities(ctx, world, rect);
    // Zafer puanı: ordu seçiliyken (hedef seçimi) ya da yakın zoomda.
    if (marks && (armySelected || this.camera.zoom >= 0.9)) this.drawVictoryPoints(ctx, world, rect);
    if (this.mapMode !== 'geography') {
      // Coğrafya kipi fiziksel dünyayı yalnız başına gösterir: ordu, cephe ve
      // muharebe de siyasettir (bkz. mapMode yorumu).
      this.drawFronts(ctx, world, state);
      this.drawWarFrontline(ctx, world, state.playerNation);
      this.drawCommandLines(ctx, world, state);
      // Seçimin TAMAMI parlar: yalnız ilk tümen geçtiğinde çoklu seçimde
      // diğer tümenlerin oku sönük kalıyordu (seçili olduğu okunmuyordu).
      this.drawMovement(ctx, world, state.selection?.length ? new Set(state.selection) : state.selectedUnit, state.playerNation);
      this.drawOffensiveArrows(ctx, world, state.playerNation);
      if (marks) {
        this.drawUnitCounters(ctx, world, state.selectedUnit, rect, state.playerNation);
        this.minis.drawFleets(ctx, world, rect, state.playerNation, this.mapMode === 'seas');
        this.sea.drawFleets(ctx, world, rect, state.playerNation, this.mapMode === 'seas');
        if (this.mapMode === 'seas') this.sea.drawSeaInfo(ctx, world, rect, state.playerNation);
        this.drawBattles(ctx, world, rect);
        this.drawPockets(ctx, world, state.playerNation, rect);
        this.drawFloaters(ctx, state.floaters);
        this.drawAssaultOdds(ctx, state.hoverOdds);
      }
    }
    if (marks) this.drawSelection(ctx, state.selection);
    perf?.add('r.actors', performance.now() - t0);
  }

  /**
   * Eğik kameralı stilin DİK İŞARET geçişi (gfx/threeD.js renderWrap çağırır).
   * Mürekkep geçişi yalnız zemine yatan çizgiyi çizdi; şehir, birim, künye,
   * bayrak ve yazılar burada ekran tuvaline basılır. `pin.pin(ctx, x, y)`
   * öğeyi dünya çapasının izdüşümüne (arazi yüksekliği dahil) dik oturtur,
   * ekran dışındaysa false döner; `pin.shift` sarmal kopyanın kaymasıdır.
   * bbox: görünür zemin (dünya birimi).
   */
  renderMarks(world, state, pin, bbox) {
    const ctx = this.ctx;
    const cam = this.camera;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cam.viewWidth, cam.viewHeight);
    this.upright = pin;
    this.markPass = 'marks';
    const t0 = performance.now();
    try {
      const P = world.wrapWidth || 0;
      const m = HEX_SIZE * 2;
      const rect = { minX: bbox.minX - m, maxX: bbox.maxX + m, minY: bbox.minY - m, maxY: bbox.maxY + m };
      const k0 = P ? Math.floor((rect.minX - WRAP_X0) / P) : 0;
      const k1 = P ? Math.floor((rect.maxX - WRAP_X0) / P) : 0;
      for (let k = k0; k <= k1; k++) {
        pin.shift = k * P;
        ctx.save();
        this.drawMarkers(ctx, world, state, {
          minX: rect.minX - k * P, maxX: rect.maxX - k * P, minY: rect.minY, maxY: rect.maxY,
        });
        ctx.restore();
      }
      pin.shift = 0;
      this.perf?.add('r.actors', performance.now() - t0);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      if (state.marquee) this.drawMarquee(ctx, state.marquee);
      if (this.showLabels && this.mapMode !== 'geography' && world.nations?.length) {
        const t1 = performance.now();
        this.drawLabels(ctx, world);
        this.perf?.add('r.labels', performance.now() - t1);
      }
    } finally {
      this.upright = null;
      this.markPass = null;
    }
  }

  /** renderCopy'nin işaret dizisi, aynı sırayla; yalnız dik geçişte (renderMarks). */
  drawMarkers(ctx, world, state, rect) {
    const armySelected = (state.selection?.length ?? 0) > 0;
    if (this.mapMode === 'seas') this.sea.drawZoneNames(ctx, world, rect, state.playerNation);
    this.drawCities(ctx, world, rect);
    if (armySelected || this.camera.zoom >= 0.9) this.drawVictoryPoints(ctx, world, rect);
    if (this.mapMode !== 'geography') {
      this.drawUnitCounters(ctx, world, state.selectedUnit, rect, state.playerNation);
      this.minis.drawFleets(ctx, world, rect, state.playerNation, this.mapMode === 'seas');
      this.sea.drawFleets(ctx, world, rect, state.playerNation, this.mapMode === 'seas');
      if (this.mapMode === 'seas') this.sea.drawSeaInfo(ctx, world, rect, state.playerNation);
      this.drawBattles(ctx, world, rect);
      this.drawPockets(ctx, world, state.playerNation, rect);
      this.drawFloaters(ctx, state.floaters);
      this.drawAssaultOdds(ctx, state.hoverOdds);
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
      // 'sea' -> deniz dolgusu, 'land' -> kara dolgusu, 'ink' -> tarama/sınır.
      phase: 'sea',
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
    if (j.phase === 'regions') {
      // Kara dolgusu (bölge kiplerinde province çokgeni) dilim dilim, sonra
      // malzeme: ışık alanı dolgunun üstüne biner.
      const rect = this.bakeRect(world, j.scale);
      if (this.remapMode()) {
        j.regionAt = this.paintRegionFills(j.ctx, world, rect, j.regionAt ?? 0, 2);
        if (j.regionAt < this.borderMeshFor(world).regions.length) return true;
      }
      this.material.paint(j.ctx, world, rect, j.scale);
      j.phase = 'ink';
      return true;
    }
    if (j.phase === 'mesh') {
      // Sınır ağı satır bandına bölünmez: zincir ve province çokgeni bantları
      // aşar, bant bant çizilseydi kesişen yerde yarı saydam mürekkep iki kez
      // binerdi. Kenar gölgesi ise ÜLKE ülke dilimlenir: bütün dünyanın
      // gölgesi tek adımda ~5 ms tutuyordu (ölçüldü) ve o kareyi bütçeden
      // taşırıyordu; çizgiler tek adımda ~0.4 ms.
      const rect = this.bakeRect(world, j.scale);
      if (this.mapMode === 'political' && this.showCountryBorders && !this.glSurface()) {
        const mesh = this.borderMeshFor(world);
        j.bandAt = this.drawMeshBands(j.ctx, world, mesh, rect, j.bandAt ?? 0, 1.5);
        if (j.bandAt < this.meshIndex(mesh).groupList.length) return true;
      }
      if (this.mapMode === 'cultures') this.drawCultureMix(j.ctx, world, null, j.scale, rect);
      if (this.gfx.style?.ink) this.gfxInk('under', j.ctx, world, rect, j.scale, true);
      this.drawMeshInk(j.ctx, world, rect, j.scale, true, false);
      if (this.gfx.style?.ink) this.gfxInk('over', j.ctx, world, rect, j.scale, true);
      const b = world.bounds;
      this.cache = {
        canvas: j.canvas, x: WRAP_X0, y: b.minY, w: P,
        h: b.maxY - b.minY, scale: j.scale, widthPx: j.widthPx, heightPx: j.heightPx,
      };
      this.farJob = null;
      return true;
    }
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
    // ÜÇ SÜPÜRME, aralarında dilimlenmeyen TEK geçişler:
    //
    //   sea  : bütün bantların deniz dolgusu   → [deniz rasteri, tek geçiş]
    //   land : bütün bantların kara dolgusu    → [ışık alanı + gren, tek geçiş]
    //   ink  : bütün bantların taraması/sınırı
    //
    // Neden dilimlenmiyor: malzeme bant bant sürülünce her bandın kırpma
    // sınırında soluk bir yatay dikiş kalıyordu — kenar yumuşatma ortak
    // pikselde iki kez uygulanıyor ve overlay orayı bir tık koyulaştırıyordu
    // (ölçüldü: yalnız ışık alanı açıkken de çıkıyor, yani gren değil
    // kırpmanın kendisi). Toplam iş aynı, sıra değişti.
    //
    // Deniz rasteri kara dolgusundan ÖNCE gelir: yumuşatılmış kenarı karaya
    // taşar, üstünü kara dolgusu kapatır (bkz. paintStaticContent).
    const water = this.canvasWater();
    if (j.phase === 'ink') {
      if (this.occupationMode() && !this.glSurface()) {
        this.drawOccupationOverlay(j.ctx, world, bakeTiles, j.scale);
      }
      // Kıyı hattı mürekkep süpürmesinde: kara dolgusundan SONRA gelmeli.
      if (water) this.water.bakeCoastline(j.ctx, world, bakeTiles.filter((t) => t.terrain.water));
    } else if (!water) {
      // GL yüzey devredeyken uzak doku da zemin taşımaz: yalnız mürekkep.
      // Bölge kiplerinde kara satır bandı değil province çokgeni olarak evre
      // sonunda dilim dilim basılır (bkz. 'regions').
      if (!this.glSurface() && j.phase === 'sea') {
        this.paintTileFills(j.ctx, this.remapMode()
          ? bakeTiles.filter((t) => t.terrain.water) : bakeTiles, world);
      }
    } else {
      const land = [];
      const sea = [];
      for (const t of bakeTiles) (t.terrain.water ? sea : land).push(t);
      if (j.phase === 'sea') {
        this.paintTileFills(j.ctx, sea, world);
        this.water.bakeStatic(j.ctx, world, sea, { coastline: false });
      } else if (!this.remapMode()) {
        this.paintTileFills(j.ctx, land, world);
      }
    }
    j.row = endRow;
    if (j.row < world.rows) return true;

    const rect = this.bakeRect(world, j.scale);
    j.row = 0;
    if (j.phase === 'sea') {
      if (water) {
        this.material.paintSea(j.ctx, world, rect);
        j.phase = 'land';
      } else if (this.glSurface()) {
        j.phase = 'ink';
      } else {
        j.phase = 'regions';
      }
    } else if (j.phase === 'land') {
      j.phase = 'regions';
    } else {
      j.phase = 'mesh';
    }
    return true;
  }

  /**
   * Uzak dokunun kapsadığı dünya dikdörtgeni — yakası dahil. Yaka olmadan
   * dikiş sütunları malzemesiz kalır ve kopya sınırında soluk bir şerit
   * görünür (bkz. CACHE_COLLAR).
   */
  bakeRect(world, scale) {
    const b = world.bounds;
    const pad = CACHE_COLLAR / scale;
    return {
      minX: WRAP_X0 - pad,
      maxX: WRAP_X0 + (world.wrapWidth ?? b.maxX - b.minX) + pad,
      minY: b.minY,
      maxY: b.maxY,
    };
  }

  /**
   * Zemin dolgusu. Kipe göre renk seçilir ama çizim tek geçişte, renge göre
   * gruplanarak yapılır (binlerce hex için tek fill çağrısı başına bir path).
   *
   */
  /** Zemin dolgularının kendisi: renge göre grupla, parçalı yollarla doldur. */
  paintTileFills(ctx, tiles, world) {
    const byColor = new Map();
    for (const t of tiles) {
      const color = this.fillColorOf(t, world);
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

  /**
   * Zemin + malzeme, TEK kırpma bölgesi için sırasıyla. Yalnız uzak
   * önbelleğin ONARIM yolu kullanır (repaintTiles): orada kirli kareler tek
   * bir kırpma yolunun içinde baştan boyanır, dolayısıyla dilimleme yoktur.
   *
   * Uzak önbelleğin ilk PİŞİRMESİ bu yoldan geçmez; orada aynı sıra üç
   * süpürmeye yayılır (bkz. stepFarBake), çünkü malzeme rasterleri
   * dilimlenirse kırpma sınırında dikiş bırakır.
   */
  drawTerrain(ctx, tiles, world, rect = null) {
    if (this.glSurface()) return;   // zemin GPU'da
    const land = [];
    const sea = [];
    for (const t of tiles) (t.terrain.water ? sea : land).push(t);
    if (!this.waterAnimatedMode()) {
      this.paintTileFills(ctx, sea, world);
      this.paintLandFills(ctx, world, land, rect);
      return;
    }
    this.paintTileFills(ctx, sea, world);
    if (rect) this.material.paintSea(ctx, world, rect);
    this.paintLandFills(ctx, world, land, rect);
    this.water.bakeStatic(ctx, world, sea);
    if (rect) this.material.paint(ctx, world, rect, 1);
  }

  /**
   * Kara dolgusu (Canvas2D). Bölge kiplerinde province ÇOKGENİ: renk zaten
   * province başına tek (bkz. fillColorOf) ve kenarı yumuşak sınırla aynı
   * eğri. Hex dolgusunun üstüne yama basmak iki kat çizim çağrısıydı (uzak
   * dokunun tek adımı 27 ms'ye çıkmıştı, ölçüldü) ve hex kenarı boyunca kenar
   * yumuşatma dikişi bırakıyordu.
   */
  paintLandFills(ctx, world, land, rect) {
    if (!rect || !this.remapMode()) {
      this.paintTileFills(ctx, land, world);
      return;
    }
    this.paintRegionFills(ctx, world, rect);
  }

  /**
   * Bölge çokgenlerini renge göre toplayıp doldurur; `from`/`budgetMs` uzak
   * doku pişirmesinin dilimlemesi içindir, sonraki bölgenin sırasını döner.
   * Çokgeni kapanmayan bölge (silindiri saran kutup kuşağı) hex hex boyanır.
   */
  paintRegionFills(ctx, world, rect, from = 0, budgetMs = Infinity) {
    const mesh = this.borderMeshFor(world);
    const index = this.meshIndex(mesh);
    const P = world.wrapWidth || 0;
    const shifts = (this.regionShifts ??= []);
    const byColor = new Map();
    const loose = [];
    const t0 = performance.now();
    let at = from;
    for (; at < mesh.regions.length; at++) {
      if (at > from && performance.now() - t0 > budgetMs) break;
      const region = mesh.regions[at];
      if (region.partial) {
        for (const ti of region.tiles) {
          const tile = world.tiles[ti];
          const box = [tile.x - HEX_SIZE, tile.y - HEX_SIZE, tile.x + HEX_SIZE, tile.y + HEX_SIZE];
          for (const dx of this.copyShifts(box, rect, P, shifts)) {
            loose.push(dx ? { ...tile, x: tile.x + dx, ghostOf: tile } : tile);
          }
        }
        continue;
      }
      if (!this.copyShifts(region.bbox, rect, P, shifts).length) continue;
      const color = this.tileColor(world.tiles[index.rep[region.id]], world);
      let path = byColor.get(color);
      if (!path) {
        path = new Path2D();
        byColor.set(color, path);
      }
      for (const dx of shifts) {
        for (const loop of this.regionLoops(region)) appendPts(path, loop, true, dx);
      }
    }
    for (const [color, path] of byColor) {
      ctx.fillStyle = color;
      ctx.fill(path);
    }
    if (loose.length) this.paintTileFills(ctx, loose, world);
    return at;
  }

  /** Kaynak kipi: her hex kendi kaynağının rengini taşır (hex kaynakları). */
  resourceTint(tile) {
    const type = tile.province ? RESOURCES[tile.resource] : null;
    if (!type) return 'hsl(210 6% 26%)';
    const quality = Math.max(0.85, Math.min(1.15, tile.resourceQuality ?? 1));
    const key = `res:${type.id}:${Math.round(quality * 10)}`;
    let color = this.tintCache.get(key);
    if (color) return color;
    const light = 34 + (quality - 0.85) * 40;
    color = `hsl(${type.hue} ${type.sat}% ${Math.round(light)}%)`;
    this.tintCache.set(key, color);
    return color;
  }

  /**
   * Logaritmik nufus skalasi: 15K koyu, 1.5M+ parlak sari-yesil.
   *
   * Band OLCULEREK secildi. Eski 800-20.000 araligi kare basina nufustan
   * kalmaydi; nufus province'e tasinince gercek dagilim cok yukari kaydi ve
   * canli dunyada province'lerin %63.7'si bandin USTUNDE cakiliyordu — kip
   * dunyanin ucte ikisini tek renk gosteriyordu. Yeni band gercek dagilimin
   * ucundan ucuna oturur (olculdu: p10 91K, medyan 270K, p90 860K, en buyuk 2.1M).
   */
  populationTint(tile) {
    const population = Math.max(0, tile.province?.population ?? 0);
    if (!population) return 'hsl(225 8% 20%)';
    const low = Math.log10(1500 * POPULATION_SCALE);
    const high = Math.log10(150000 * POPULATION_SCALE);
    const ratio = Math.max(0, Math.min(1, (Math.log10(population) - low) / (high - low)));
    const hue = 268 - ratio * 205;
    const saturation = 18 + ratio * 18;
    const light = 20 + ratio * 34;
    return `hsl(${Math.round(hue)} ${Math.round(saturation)}% ${Math.round(light)}%)`;
  }

  tileColor(tile, world) {
    if (DATA_MODES.has(this.mapMode)) {
      return tile.terrain.water ? 'hsl(207 32% 13%)' : this.dataTint(tile, world);
    }
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
  /**
   * Kültür kipinde azınlık taraması — Victoria 2'nin çizgili eyaletleri.
   *
   * Taban renk ÇOĞUNLUĞUN, çizgiler en büyük AZINLIĞIN. Çoğunluk el
   * değiştirince ikisi yer değiştirir, yani hangi halkın hâkim olduğu tek
   * bakışta okunur. Küme başına tek azınlık çizilir: iki ayrı çizgi ailesi
   * üst üste binince hangi rengin kime ait olduğu okunmaz oluyor.
   *
   * Yalnız yeterince yakında çizilir; uzak zoomda çizgi aralığı piksel altına
   * inip moiré üretir ve renk çamura döner.
   */
  /**
   * KÜLTÜR DAĞILIMI (Kerem 2026-10-12: "kültür mapmodunun dağılımını
   * geliştirebiliriz"). Seçili halkın (`cultureHighlight`) her province'teki
   * payı, sınır tanımadan: payı olmayan yer kararır, payı olan yer onun
   * renginde payı kadar doygun. Yurt dışındaki soydaşlar da görünür. Yollar
   * altı pay kovasında toplanır ve yalnız halk, hafta ya da sınır ağı
   * değişince kurulur; kare başına kova başına bir doldurma.
   */
  drawCultureHighlight(ctx, world, rect) {
    const id = this.cultureHighlight;
    if (id == null || this.mapMode !== 'cultures') return;
    const culture = world.cultures?.[id];
    if (!culture) return;
    const mesh = this.borderMeshFor(world);
    const key = `${id}:${world.turn ?? 0}`;
    if (this.cultureHi?.key !== key || this.cultureHi.mesh !== mesh) {
      const index = this.meshIndex(mesh);
      const buckets = CULTURE_HEAT_STOPS.map(() => new Path2D());
      const none = new Path2D();
      for (const [pid, entry] of index.provinces) {
        const share = world.provinces?.[pid]?.cultures?.find((row) => row.id === id)?.share ?? 0;
        const step = cultureHeatStep(share);
        const path = step >= 0 ? buckets[step] : none;
        for (const rid of entry.regions) {
          for (const loop of this.regionLoops(mesh.regions[rid])) appendPts(path, loop, true, 0);
        }
      }
      this.cultureHi = { key, mesh, buckets, none };
    }
    const P = world.wrapWidth || 0;
    ctx.save();
    for (const dx of P ? [-P, 0, P] : [0]) {
      ctx.save();
      ctx.translate(dx, 0);
      ctx.fillStyle = 'rgb(20, 23, 27)';
      ctx.strokeStyle = 'rgb(20, 23, 27)';
      // Aynı renkte ince kontur: komşu state'lerin arasında saç teli açılmasın.
      ctx.lineWidth = 1 / this.camera.zoom;
      ctx.fill(this.cultureHi.none);
      ctx.stroke(this.cultureHi.none);
      this.cultureHi.buckets.forEach((path, i) => {
        ctx.fillStyle = CULTURE_HEAT_COLORS[i];
        ctx.strokeStyle = CULTURE_HEAT_COLORS[i];
        ctx.fill(path);
        ctx.stroke(path);
      });
      ctx.restore();
    }
    ctx.restore();
  }

  drawCultureMix(ctx, world, tiles, scale, rect) {
    if (scale < CULTURE_STRIPE_MIN_ZOOM) return;
    // Tarama province'in YUMUŞAK çokgenine kırpılır: hex yoluna kırpılınca
    // çizgili alanın kenarı sınırın yanında petek gibi duruyordu.
    const mesh = this.borderMeshFor(world);
    const index = this.meshIndex(mesh);
    const P = world.wrapWidth || 0;
    const shifts = (this.cultureShifts ??= []);
    let ids;
    if (tiles) {
      ids = new Set();
      for (const tile of tiles) if (!tile.terrain.water && tile.provinceId >= 0) ids.add(tile.provinceId);
    } else {
      ids = index.provinces.keys();
    }
    const groups = new Map();
    for (const id of ids) {
      const province = world.provinces?.[id];
      const minority = province?.cultures?.[1];
      if (!minority || minority.share < CULTURE_MINORITY_MIN) continue;
      const entry = index.provinces.get(id);
      if (!entry?.bbox) continue;
      // Kümeler (azınlık kültürü × yoğunluk kademesi) çiftinde toplanır:
      // aynı halkın %12'lik ve %45'lik azınlığı aynı sıklıkta çizilmemeli.
      const band = stripeBand(minority.share);
      const key = minority.id * 8 + band;
      for (const dx of this.copyShifts(entry.bbox, rect, P, shifts)) {
        let group = groups.get(key);
        if (!group) {
          group = {
            id: minority.id,
            band,
            path: new Path2D(),
            minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity,
          };
          groups.set(key, group);
        }
        for (const rid of entry.regions) {
          for (const loop of this.regionLoops(mesh.regions[rid])) appendPts(group.path, loop, true, dx);
        }
        group.minX = Math.min(group.minX, entry.bbox[0] + dx);
        group.maxX = Math.max(group.maxX, entry.bbox[2] + dx);
        group.minY = Math.min(group.minY, entry.bbox[1]);
        group.maxY = Math.max(group.maxY, entry.bbox[3]);
      }
    }
    for (const group of groups.values()) {
      const culture = world.cultures?.[group.id];
      if (!culture) continue;
      const { period, width } = CULTURE_STRIPE_BANDS[group.band];
      ctx.save();
      ctx.clip(group.path);
      ctx.beginPath();
      const height = group.maxY - group.minY;
      for (let x = group.minX - height; x <= group.maxX + height; x += period) {
        ctx.moveTo(x, group.minY);
        ctx.lineTo(x + height, group.maxY);
      }
      // Çizgi önce ince bir koyu dikişle, sonra kültür rengiyle çizilir. Tek
      // kat renk, tonu zemine yakın bir azınlıkta görünmez oluyordu (yeşil
      // üstüne yeşil); dikiş çizgiyi hangi zeminde olursa olsun ayırır ama
      // artık yalnız yarım piksellik bir kenar — eskiden çizgiden KALINDI ve
      // kaplamanın çoğunu o yapıyordu.
      ctx.lineWidth = (width + 1) / scale;
      ctx.strokeStyle = 'rgba(8, 12, 14, 0.30)';
      ctx.stroke();
      ctx.lineWidth = width / scale;
      ctx.strokeStyle = culture.color;
      ctx.globalAlpha = 0.85;
      ctx.stroke();
      ctx.restore();
    }
  }

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
      ctx.globalAlpha = 0.18;
      const holder = world.nations[controller];
      const ink = holder ? this.nationInk(holder) : '#999';
      ctx.fillStyle = ink;
      ctx.fill(group.path);
      ctx.globalAlpha = 0.42;
      ctx.clip(group.path);
      ctx.beginPath();
      const height = group.maxY - group.minY;
      const spacing = 9 / scale;
      for (let x = group.minX - height; x <= group.maxX + height; x += spacing) {
        ctx.moveTo(x, group.minY);
        ctx.lineTo(x + height, group.maxY);
      }
      ctx.lineWidth = 2.2 / scale;
      ctx.strokeStyle = ink;
      ctx.stroke();
      ctx.restore();
    }
  }

  drawGrid(ctx, world, tiles, scale) {
    ctx.lineWidth = 1 / scale;
    // Hex ızgarası artık en alt kademe: üstünde province kenarı, onun
    // üstünde ülke sınırı var. Saf siyah değil koyu toprak tonu; üç kademeli
    // hiyerarşi (ızgara < province < ülke) için en sessiz seviye.
    //
    // Opaklık ZOOMA BAĞLI. Sabit 0.10'da ızgara haritanın hâkim dokusuydu:
    // oyuncu önce peteği, sonra ülkeyi görüyordu (§15'in tersi). Yakında
    // ızgara bir araçtır — hangi kareye tıklayacağını söyler — ama orta
    // mesafede yalnız bir doku ipucu olmalı, uzakta hiç olmamalı. Eşiğin
    // hemen üstünde (0.55) neredeyse yok, 1.6'da tam gücünde.
    const strength = 0.012 + 0.062 * Math.max(0, Math.min(1, (scale - 0.7) / 1.1));
    ctx.strokeStyle = `rgba(8, 12, 12, ${strength.toFixed(3)})`;
    // Deniz ızgara dışıdır: hex kenarları suyu petekli bir zemine çeviriyordu.
    // Su malzemesi komşu deniz hexlerini tek yüzeye köprüler; ızgara bunu bozar.
    const land = tiles.filter((t) => !t.terrain.water);
    // Parçalı yol: tek yolda binlerce hex kurmak karenin tamamını yiyordu
    // (bkz. chunkedHexPaths). Stroke olduğu için bölmek görüntüyü değiştirmez.
    // Hücreler organik: ızgara dolgu ve tıklamayla aynı şekli çizer.
    for (let i = 0; i < land.length; i += PATH_CHUNK) {
      const path = new Path2D();
      const end = Math.min(land.length, i + PATH_CHUNK);
      for (let k = i; k < end; k++) this.cellPath(path, world, land[k]);
      ctx.stroke(path);
    }
  }

  /**
   * Dolgu sınırı yumuşak eğriyi izlesin mi? Arazi, coğrafya ve kaynak
   * kiplerinde renk hexin KENDİ verisidir (arazi tipi, hex kaynağı); orada
   * komşunun rengini ödünç almak veriyi yanlış gösterirdi.
   */
  remapMode() {
    return this.mapMode !== 'terrain' && this.mapMode !== 'geography'
      && this.mapMode !== 'resources';
  }

  /**
   * Canvas2D dolgusunun rengi. Bölge kiplerinde kara province başına TEK
   * renktir: GL yolunda hex başına ton komşu merkezler arasında süzülüyor
   * (surfaceGL.hexBlend), Canvas2D'de süzme yok ve ton basamakları ızgara
   * kapalıyken bile peteği ele veriyordu. Arazi dokusunu orada malzeme
   * katmanının kabartması taşır.
   */
  fillColorOf(tile, world) {
    if (tile.terrain.water || this.glSurface() || !this.remapMode()) return this.tileColor(tile, world);
    const mesh = this.borderMeshFor(world);
    const real = tile.ghostOf ?? tile;
    const label = mesh.labels[real.row * world.cols + real.col];
    if (label < 0) return this.tileColor(tile, world);
    return this.tileColor(world.tiles[this.meshIndex(mesh).rep[label]], world);
  }

  /**
   * Geçerli sınır ağı. Büyük sınır kültür kipinde kültürden, diğerlerinde
   * sahipten çizilir. Sahiplik bayrağı kalktıysa anahtarlar yeniden okunur;
   * ağ (~15 ms) yalnız bölgeler gerçekten değiştiyse kurulur — savaş ilanı
   * gibi geçersizlemeler sınırı oynatmaz.
   */
  borderMeshFor(world) {
    const grouping = this.mapMode === 'cultures' ? 'culture' : 'owner';
    let cur = this.mesh;
    // Gruplama başına bir ağ saklanır: siyasi ↔ kültür kipi arasında gidip
    // gelmek her seferinde tam kurulum (~50 ms, hücre tablosuyla) ödemesin.
    // Geri dönülen ağın anahtarları bayat olabilir; aşağıda karşılaştırılır.
    if (!cur || cur.world !== world || cur.grouping !== grouping) {
      const kept = this.meshByGroup?.get(grouping);
      cur = kept?.world === world ? kept : null;
      if (cur) {
        this.mesh = cur;
        this.meshCheck = true;
      }
    }
    const same = !!cur;
    if (same && !this.meshCheck) return cur;
    const groupOf = grouping === 'culture'
      ? (tile) => tile.culture
      : (tile) => ownerOf(tile, world);
    const keys = borderKeys(world, groupOf);
    this.meshCheck = false;
    if (same && sameKeys(cur.keys, keys)) return cur;
    // Bütün province devri: bölümleme aynı, yalnız sahip değişti — ağ yerinde
    // güncellenir (geometri, GL tablosu ve yamalar aynen geçerli).
    if (same && updateMeshGroups(cur, keys)) return cur;
    const t0 = performance.now();
    const mesh = buildBorderMesh(world, groupOf, keys);
    mesh.grouping = grouping;
    this.mesh = mesh;
    this.meshByGroup ??= new Map();
    // Eski dünyanın ağları (hücre tablosuyla onlarca MB) tutulmasın.
    for (const [g, m] of this.meshByGroup) if (m.world !== world) this.meshByGroup.delete(g);
    this.meshByGroup.set(grouping, mesh);
    this.perf?.add('r.mesh', performance.now() - t0);
    return mesh;
  }

  /** Ağın grup (ülke/kültür) ve province dizini: bölgeler, sınır zincirleri, kutu. */
  meshIndex(mesh) {
    if (mesh.index) return mesh.index;
    const groups = new Map();
    const provinces = new Map();
    const entryOf = (map, key) => {
      let e = map.get(key);
      if (!e) {
        e = { regions: [], chains: [], bbox: null };
        map.set(key, e);
      }
      return e;
    };
    const grow = (e, box) => {
      if (!box) return;
      if (!e.bbox) e.bbox = [...box];
      else {
        e.bbox[0] = Math.min(e.bbox[0], box[0]);
        e.bbox[1] = Math.min(e.bbox[1], box[1]);
        e.bbox[2] = Math.max(e.bbox[2], box[2]);
        e.bbox[3] = Math.max(e.bbox[3], box[3]);
      }
    };
    for (const region of mesh.regions) {
      const g = entryOf(groups, region.group);
      g.regions.push(region.id);
      grow(g, region.bbox);
      if (region.province >= 0) {
        const p = entryOf(provinces, region.province);
        p.regions.push(region.id);
        grow(p, region.bbox);
      }
    }
    for (const ch of mesh.chains) {
      const a = ch.pos >= 0 ? mesh.regions[ch.pos] : null;
      const b = ch.neg >= 0 ? mesh.regions[ch.neg] : null;
      if (ch.cls !== LINE_PROVINCE) {
        if (a && a.group >= 0 && (!b || b.group !== a.group)) entryOf(groups, a.group).chains.push(ch.id);
        if (b && b.group >= 0 && (!a || a.group !== b.group)) entryOf(groups, b.group).chains.push(ch.id);
      }
      const pa = a ? a.province : -2;
      const pb = b ? b.province : -2;
      if (pa !== pb) {
        if (pa >= 0) entryOf(provinces, pa).chains.push(ch.id);
        if (pb >= 0) entryOf(provinces, pb).chains.push(ch.id);
      }
    }
    // Bölgenin temsilci karesi (classic tek renk dolgusu): province merkezi
    // bölgedeyse o — province'in adını taşıyan kare —, değilse ilk üye.
    const rep = new Int32Array(mesh.regions.length);
    const cols = mesh.world.cols;
    for (const region of mesh.regions) {
      const center = mesh.world.provinces?.[region.province]?.center;
      const ci = center ? center.row * cols + center.col : -1;
      rep[region.id] = ci >= 0 && mesh.labels[ci] === region.id ? ci : region.tiles[0];
    }
    // Kararlı sıra: uzak doku gölgeyi bu listede dilim dilim ilerletir.
    mesh.index = { groups, provinces, groupList: [...groups], rep };
    return mesh.index;
  }

  /** Statik katmanın görünüm anahtarı: menüdeki çizgi katmanları değişince yeniden pişer. */
  layerKey() {
    return (this.showGrid ? 1 : 0) | (this.showCountryBorders ? 2 : 0) | (this.showProvinceBorders ? 4 : 0);
  }

  /**
   * Nehirler (world.rivers): hücre kenarı boyunca, akışla kalınlaşan mavi.
   * Province çizgisinin ÜSTÜNDE, ülke çizgisinin ALTINDA çizilir: nehir çoğu
   * yerde province sınırının kendisidir (üreteç v2) ve sınırın koyu rengine
   * gömülmemeli; ülke sınırı ise nehirden de baskın kalmalı.
   */
  drawRivers(ctx, world, mesh, rect, scale, far = false) {
    if (!world.rivers?.edges?.length) return;
    const geo = this.riverGeometry(world, mesh);
    // Görsel stil nehri kendi mürekkebiyle çizebilir (bkz. gfx/registry.js
    // `rivers`); klasikte kanca yok, aşağıdaki yol birebir aynı.
    const styleRivers = this.gfx.style?.rivers;
    if (styleRivers) {
      styleRivers(ctx, { world, rect, scale, far, renderer: this, mode: this.mapMode, tune: this.gfxTune }, geo);
      return;
    }
    const P = world.wrapWidth || 0;
    const shifts = (this.riverShifts ??= []);
    // Beş kademe: kaynaktan ağza nehir İNCELİR. Üç sabit kalınlık nehri boydan
    // boya aynı kalınlıkta bir kablo gibi gösteriyordu (2026-11-16 incelemesi).
    const K = RIVER_FLOW_STEPS.length + 1;
    const paths = (this.riverPaths ??= []);
    const used = (this.riverUsed ??= []);
    for (let b = 0; b < K; b++) {
      paths[b] = new Path2D();
      used[b] = 0;
    }
    for (const g of geo) {
      // Uzak dokuda kaynak kolları atılır: 1 pikselin altında kılçık olurlar.
      if (far && g.flow < 0.18) continue;
      if (!this.copyShifts(g.bbox, rect, P, shifts).length) continue;
      let b = 0;
      while (b < K - 1 && g.flow >= RIVER_FLOW_STEPS[b]) b++;
      for (const dx of shifts) appendPts(paths[b], g.pts, false, dx);
      used[b]++;
    }
    const z = far ? 0 : Math.max(0, Math.min(1, (scale - 0.45) / 1.2));
    const grow = far ? 1 : 1 + 0.45 * z;
    const widths = far ? RIVER_WIDTH_FAR : RIVER_WIDTH_NEAR;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // İki geçiş: önce koyu KIYI (daha geniş), sonra su. Tek renkli sabit çizgi
    // kalemle haritanın üstüne çizilmiş gibi okunuyordu (Kerem: "paintten
    // çizilmiş"); koyu kenar nehri araziye gömer. Statik katmana pişer, kare
    // başına maliyet yok. Uzak dokuda kenar yok (1 pikselin altında çamur).
    if (!far) {
      ctx.strokeStyle = 'rgba(16, 26, 32, 0.46)';
      for (let b = 0; b < K; b++) {
        if (!used[b]) continue;
        ctx.lineWidth = (widths[b] * grow + 1.4) / scale;
        ctx.stroke(paths[b]);
      }
    }
    // Su tonu deniz ailesinden: açık "arayüz mavisi" (88,142,178) nehri
    // haritanın üstünde yüzdürüyordu; bir tık derin ve kısık ton araziye oturur.
    ctx.strokeStyle = 'rgba(74, 124, 154, 0.96)';
    for (let b = 0; b < K; b++) {
      if (!used[b]) continue;
      ctx.lineWidth = (widths[b] * grow) / scale;
      ctx.stroke(paths[b]);
    }
    ctx.restore();
  }

  /** Nehir kenarlarının hücre eğrileri (dünya koordinatı), ağ başına bir kez. */
  riverGeometry(world, mesh) {
    if (mesh.riverGeo) return mesh.riverGeo;
    const out = [];
    for (const e of world.rivers.edges) {
      const tile = world.tiles[e.a];
      const local = cellEdge(mesh, e.a, e.dir);
      const pts = new Float64Array(local.length);
      for (let i = 0; i < local.length; i += 2) {
        pts[i] = local[i] + tile.x;
        pts[i + 1] = local[i + 1] + tile.y;
      }
      const pad = HEX_SIZE * 1.2;
      out.push({ pts, flow: e.flow, bbox: [tile.x - pad, tile.y - pad, tile.x + pad, tile.y + pad] });
    }
    mesh.riverGeo = out;
    return out;
  }

  /**
   * Zincirin çizilecek eğrisi. Kıyı GL yüzeyinde yumuşaktır (shader kara/deniz
   * kararını aynı eğriden verir); Canvas2D yedeğinde deniz dolgusu, deniz
   * rasteri ve köpük hex kıyısıyla çizildiği için kıyı orada hex kenarında
   * kalır — yoksa kara ile deniz arasında boşluk ya da taşma açılır.
   */
  chainPts(ch) {
    return ch.cls === LINE_COAST && !this.glSurface() ? ch.H : ch.S;
  }

  /** Bölge çokgeni; kıyı kuralı chainPts ile aynı. */
  regionLoops(region) {
    return this.glSurface() ? region.loops : region.loopsHex;
  }

  /**
   * Açılmış koordinatlı bir kutunun `rect`e düşen sarmal kopyaları (k·P
   * kaymaları). Ağ dikişi aşan zincirleri bir periyodun dışında da taşır;
   * hangi kopyanın çizileceğini kutu söyler. `out` yeniden kullanılır.
   */
  copyShifts(bbox, rect, P, out) {
    out.length = 0;
    if (!bbox || bbox[3] < rect.minY || bbox[1] > rect.maxY) return out;
    if (!P) {
      if (bbox[2] >= rect.minX && bbox[0] <= rect.maxX) out.push(0);
      return out;
    }
    const k0 = Math.ceil((rect.minX - bbox[2]) / P);
    const k1 = Math.floor((rect.maxX - bbox[0]) / P);
    for (let k = k0; k <= k1; k++) out.push(k * P);
    return out;
  }

  /**
   * Sınır mürekkebi: kenar gölgesi, province çizgisi, ülke/kıyı çizgisi.
   *
   * Hiyerarşi (hex ızgarası < province < ülke) korunur ama province artık
   * hissedilen bir doku değil, okunan bir sınırdır: harita birimi province.
   * `far`: uzak doku — kalınlıklar doku pikselinde, gösterim 0.6-1x küçülür.
   */
  drawMeshInk(ctx, world, rect, scale, far = false, bands = true) {
    if (this.mapMode === 'geography') {
      // Coğrafya kipi siyasetsizdir ama nehir fiziksel dünyanın parçası.
      this.drawRivers(ctx, world, this.borderMeshFor(world), rect, scale, far);
      return;
    }
    const mesh = this.borderMeshFor(world);
    const P = world.wrapWidth || 0;
    // Ülke çizgisi kapalıysa ülke sınırı yine province sınırıdır: province
    // ağı açıkken o kenar ince çizgiyle kalır, harita delik görünmez.
    const politics = this.showsPolitics() && this.showCountryBorders;
    const provinces = this.showProvinceBorders;
    const shifts = (this.inkShifts ??= []);
    const prov = new Path2D();
    const major = new Path2D();
    let nProv = 0;
    let nMajor = 0;
    for (const ch of mesh.chains) {
      let toMajor;
      if (ch.cls === LINE_PROVINCE || (!politics && ch.cls === LINE_COUNTRY)) {
        if (!provinces) continue;
        toMajor = false;
      } else if (!politics) continue;
      else if (ch.cls === LINE_COUNTRY) toMajor = true;
      else {
        // Kıyı yalnız bir ülkenin (kültürün) kıyısıysa: sahipsiz kıyı çizgisiz.
        const land = mesh.regions[ch.pos >= 0 ? ch.pos : ch.neg];
        if (!land || land.group < 0) continue;
        toMajor = true;
      }
      if (!this.copyShifts(ch.bbox, rect, P, shifts).length) continue;
      const path = toMajor ? major : prov;
      for (const dx of shifts) appendPts(path, this.chainPts(ch), ch.closed, dx);
      if (toMajor) nMajor++;
      else nProv++;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
    // GL yüzeyinde kenar gölgesini shader çizer (uzaklık alanından).
    if (bands && this.mapMode === 'political' && this.showCountryBorders && !this.glSurface()) {
      this.drawMeshBands(ctx, world, mesh, rect);
    }
    // Görsel stil sınırı kendi kalemiyle çizebilir (gfx stil `lines`); stil
    // yoksa ya da null dönerse aşağıdaki klasik kalem aynen çalışır.
    const pen = this.gfx.style?.lines?.(this.mapMode, scale, far) ?? null;
    if (nProv && pen?.province) strokePen(ctx, prov, pen.province, scale);
    else if (nProv) {
      // Kalınlık zoomla açılır: uzakta province ağı ülke sınırını boğmasın,
      // yakında okunan kalın bir mürekkep olsun. Geniş ve soluk bir omuz,
      // üstüne çekirdek: kalın çizginin kenarı yumuşar, kâğıda sinmiş durur.
      const z = far ? 0 : Math.max(0, Math.min(1, (scale - 0.45) / 1.0));
      // Uzakta da okunmalı: harita birimi province. 0.24'te uzak dokuda ağ
      // seçilmiyordu, oyuncu province'i yalnız imleç vurgusunda görüyordu.
      // 2026-10-14 (Kerem: "paintten çizilmiş gibi"): yakında 2.4 px koyu
      // province çizgisi ülke sınırına yaklaşıp haritayı keçeli kalem ağına
      // çeviriyordu. Province artık ince ve yakında ATLAS gibi kesikli; ülke
      // sınırı tek baskın hat kalır.
      const width = far ? 1.35 : 1.15 + 0.35 * z;
      const alpha = far ? 0.42 : 0.34 + 0.06 * z;
      ctx.lineWidth = (width + 1.6) / scale;
      ctx.strokeStyle = `rgba(12, 16, 16, ${(alpha * 0.22).toFixed(3)})`;
      ctx.stroke(prov);
      if (!far && scale >= 0.8) ctx.setLineDash([5 / scale, 3.5 / scale]);
      ctx.lineWidth = width / scale;
      ctx.strokeStyle = `rgba(12, 16, 16, ${alpha.toFixed(3)})`;
      ctx.stroke(prov);
      ctx.setLineDash([]);
    }
    this.drawRivers(ctx, world, mesh, rect, scale, far);
    if (nMajor && pen?.country) strokePen(ctx, major, pen.country, scale);
    else if (nMajor) {
      // Ülke sınırı: tek yol, tek darbe. Eskiden her ülke kendi kenarını
      // çiziyordu ve ortak sınır iki kez boyanıp kıyıdan koyu çıkıyordu;
      // yumuşak ağda zincir tek, alfa ortak sınırın eski koyuluğunda.
      ctx.lineWidth = 3.4 / scale;
      ctx.strokeStyle = 'rgba(9, 13, 15, 0.88)';
      ctx.stroke(major);
      if (this.mapMode === 'cultures') this.drawMeshCultureEdges(ctx, world, mesh, rect, scale);
      else {
        // İç hat: baskıda hattın ortasında kalan açık mürekkep payı.
        ctx.lineWidth = 1.1 / scale;
        ctx.strokeStyle = 'rgba(206, 181, 126, 0.2)';
        ctx.stroke(major);
      }
    }
    ctx.restore();
  }

  /**
   * Ülke kenar gölgesi: sınıra doğru koyulaşan iki kademe. Ülkenin yumuşak
   * çokgenine kırpılmış geniş darbe — tek stroke çağrısı kendi üstüne binmez,
   * kavşakta ve dar kıvrımda alfa katlanmaz.
   */
  drawMeshBands(ctx, world, mesh, rect, from = 0, budgetMs = Infinity) {
    const index = this.meshIndex(mesh);
    const P = world.wrapWidth || 0;
    const a = (this.bandShiftsA ??= []);
    const b = (this.bandShiftsB ??= []);
    const reach = {
      minX: rect.minX - BAND_REACH, maxX: rect.maxX + BAND_REACH,
      minY: rect.minY - BAND_REACH, maxY: rect.maxY + BAND_REACH,
    };
    const list = index.groupList;
    const t0 = performance.now();
    let at = from;
    for (; at < list.length; at++) {
      if (at > from && performance.now() - t0 > budgetMs) break;
      const [g, entry] = list[at];
      if (g < 0 || !entry.chains.length) continue;
      const nation = world.nations[g];
      if (!nation || !this.copyShifts(entry.bbox, rect, P, a).length) continue;
      const band = new Path2D();
      let any = false;
      for (const cid of entry.chains) {
        const ch = mesh.chains[cid];
        for (const dx of this.copyShifts(ch.bbox, reach, P, b)) {
          appendPts(band, this.chainPts(ch), ch.closed, dx);
          any = true;
        }
      }
      if (!any) continue;
      const clip = new Path2D();
      for (const rid of entry.regions) {
        const region = mesh.regions[rid];
        for (const dx of this.copyShifts(region.bbox, rect, P, b)) {
          for (const loop of this.regionLoops(region)) appendPts(clip, loop, true, dx);
        }
      }
      ctx.save();
      ctx.clip(clip);
      ctx.strokeStyle = this.nationEdgeTone(nation);
      // Geniş darbede köşe sivri birleşirse kıvrımda gölge diken gibi taşar.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      // Altı ince kademe, dıştan içe: sınırda ~%24, içeri doğru doğrusal
      // söner. İki sert kademe (eski hex halkalarının birebir karşılığı)
      // yumuşak sınırın yanında içeride paralel kontur çizgileri bırakıyordu.
      ctx.globalAlpha = BAND_STEP_ALPHA;
      for (let i = BAND_STEPS; i >= 1; i--) {
        ctx.lineWidth = (BAND_REACH * 2 * i) / BAND_STEPS;
        ctx.stroke(band);
      }
      ctx.restore();
    }
    return at;
  }

  /**
   * Kültür kipinde sınırın iç hattı her iki yanda kendi kültürünün rengiyle:
   * kırpılmış darbenin yalnız iç yarısı görünür. Eskiden iki rengin ikisi de
   * hattın ortasına çiziliyor, sonra gelen öncekini örtüyordu.
   */
  drawMeshCultureEdges(ctx, world, mesh, rect, scale) {
    const index = this.meshIndex(mesh);
    const P = world.wrapWidth || 0;
    const a = (this.bandShiftsA ??= []);
    const b = (this.bandShiftsB ??= []);
    for (const [g, entry] of index.groups) {
      const culture = world.cultures?.[g];
      if (!culture || !entry.chains.length) continue;
      if (!this.copyShifts(entry.bbox, rect, P, a).length) continue;
      const edge = new Path2D();
      for (const cid of entry.chains) {
        const ch = mesh.chains[cid];
        for (const dx of this.copyShifts(ch.bbox, rect, P, b)) appendPts(edge, this.chainPts(ch), ch.closed, dx);
      }
      const clip = new Path2D();
      for (const rid of entry.regions) {
        const region = mesh.regions[rid];
        for (const dx of this.copyShifts(region.bbox, rect, P, b)) {
          for (const loop of this.regionLoops(region)) appendPts(clip, loop, true, dx);
        }
      }
      ctx.save();
      ctx.clip(clip);
      ctx.strokeStyle = culture.color;
      ctx.lineWidth = 4 / scale;
      ctx.stroke(edge);
      ctx.restore();
    }
  }

  /**
   * Seçili karenin province'i tek parça vurgulanır: hangi hexlerin aynı
   * kümede olduğu tıklamadan önce okunur. Ana hat yumuşak sınır ağından —
   * hex kenarından çizilince vurgu, altındaki sınırdan ayrı bir petek
   * çiziyordu.
   */
  drawProvinceHighlight(ctx, world, provinceId, rect = this.camera.visibleRect(HEX_SIZE * 2), hover = false) {
    const mesh = this.borderMeshFor(world);
    const entry = this.meshIndex(mesh).provinces.get(provinceId);
    if (!entry?.bbox) return;
    const P = world.wrapWidth || 0;
    const shifts = (this.highlightShifts ??= []);
    const fill = new Path2D();
    const outline = new Path2D();
    for (const rid of entry.regions) {
      const region = mesh.regions[rid];
      for (const dx of this.copyShifts(region.bbox, rect, P, shifts)) {
        for (const loop of this.regionLoops(region)) appendPts(fill, loop, true, dx);
      }
    }
    for (const cid of entry.chains) {
      const ch = mesh.chains[cid];
      for (const dx of this.copyShifts(ch.bbox, rect, P, shifts)) appendPts(outline, this.chainPts(ch), ch.closed, dx);
    }
    const zoom = this.camera.zoom;
    // İmleç seçimden bir kademe sessiz: dolgu yok denecek kadar hafif, çizgi
    // pirinç değil soluk beyaz — eski hex imlecinin tonu.
    ctx.globalAlpha = hover ? 0.05 : 0.08;
    ctx.fillStyle = '#ffffff';
    ctx.fill(fill);
    ctx.globalAlpha = 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = (hover ? 1.8 : 2.2) / zoom;
    ctx.strokeStyle = hover ? 'rgba(255, 255, 255, 0.45)' : 'rgba(229, 202, 132, 0.85)';
    ctx.stroke(outline);
  }

  /** Seçili ordular: altın çember. Çoklu seçimde hepsi işaretlenir. */
  drawSelection(ctx, selection) {
    // Sayacın dışındaki kare kalktı (Kerem: "ünitenin etrafında kare çıkmamalı, sayaç
    // seçilmeli"): seçili hâl sayacın kendisinde (paintCounterSprite), figürde zemin halkası.
    if (this.selectionFrame !== true) return;
    if (!selection?.length) return;
    const zoom = this.camera.zoom;
    // Çerçeve sayaçla aynı tavanlı ölçüde (bkz. counterZoom); seçili birim hep
    // oyuncununkidir, tam boy sayaç.
    const k = this.counterZoom() / zoom;
    const width = HEX_SIZE * 1.72 * k;
    const height = HEX_SIZE * 1.28 * k;
    ctx.lineWidth = 2.5 / zoom;
    ctx.strokeStyle = '#e5ca84';
    const U = this.upright;
    const base = ctx.globalAlpha;
    for (const unit of selection) {
      if (!unit?.tile) continue;
      // Figürü çizilen birimin seçimi zemin halkasıdır (miniatures.js); çerçeve yalnız
      // sayaçla birlikte görünür ve sayaç erirken o da erir.
      const fade = this.minis.ringed.has(unit) ? this.minis.counterAlpha : 1;
      if (fade <= 0.01) continue;
      if (U && !U.pin(ctx, unit.tile.x, unit.tile.y)) continue;
      const y = unit.tile.y + (unit.tile.city ? HEX_SIZE * UNIT_ON_CITY_OFFSET : 0);
      const frame = roundedRectPath(
        new Path2D(), unit.tile.x - width / 2, y - height / 2, width, height, 3 / zoom,
      );
      ctx.globalAlpha = base * fade;
      ctx.stroke(frame);
    }
    ctx.globalAlpha = base;
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
    // BÜTÜN CEPHELER görünür (HOI4): eskiden yalnız seçili generalin cephesi
    // çiziliyordu, savaşta haritada hiçbir cephe hattı yoktu. Seçili olan
    // dolgulu ve kalın; ötekiler ince çizgi. Generalin baş harfli rozeti kalktı
    // (Kerem 2026-11-20: "bir boka yaramıyor"); kimin cephesi olduğunu levha söyler.
    const fronts = state.fronts ?? [];
    const active = state.activeGeneral;
    // BOŞ CEPHE: düşmana bakan ama hiçbir generalin sektöründe olmayan
    // sınırımız kesik kırmızıyla — "burayı kimse tutmuyor".
    if (state.frontGaps?.length) this.drawFrontEdges(ctx, world, state.frontGaps, state.playerNation, { gap: true });
    if (!fronts.length) return;
    const zoom = this.camera.zoom;
    const order = [...fronts].sort((a, b) => Number(a.general === active) - Number(b.general === active));
    for (const { general, tiles } of order) {
      const isActive = general === active;
      const attack = general.stance === 'advance';
      const glow = attack ? '#ff9382' : '#8fcdef';
      // Seçili generalin sektörü hafif dolgulu (hangi kareler onun); cephenin
      // kendisi her generalde SINIRIN ÜSTÜNDE dişli çizgi (drawFrontEdges).
      if (isActive) {
        const band = new Path2D();
        for (const tile of tiles) this.cellPath(band, world, tile);
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = glow;
        ctx.fill(band);
        ctx.globalAlpha = 1;
      }
      this.drawFrontEdges(ctx, world, tiles, state.playerNation, {
        color: glow, active: isActive,
        // Çizilmiş cephe barışta da görünür: oyuncu o sınırı bu generale verdi.
        facing: general.line?.facing ? new Set(general.line.facing) : null,
      });
    }
  }

  /**
   * Savaşan iki tarafın denetim sınırı: bütün savaşlarda tek bakışta okunan kalın hat.
   * Generale atanmış cephe çizgisi yalnız oyuncunun kendi sektörünü gösteriyor, yabancı
   * savaşta harita üzerinde hiçbir hat kalmıyordu. Yol haftada bir kurulur.
   */
  warFrontPaths(world, playerNation) {
    const mesh = this.mesh?.world === world ? this.mesh : null;
    const key = `${world.turn ?? 0}|${world.battleSystem?.battles?.length ?? 0}|${playerNation}`;
    const kept = this.warFrontCache;
    if (kept?.world === world && kept.key === key && kept.mesh === mesh) return kept;
    const ours = new Path2D();
    const theirs = new Path2D();
    const pairs = new Map();
    let count = 0;
    for (const tile of world.tiles) {
      if (!tile || tile.terrain?.water) continue;
      const a = controllerOf(tile);
      if (a < 0) continue;
      for (let d = 0; d < 6; d++) {
        const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
        if (!near || near.terrain?.water) continue;
        const b = controllerOf(near);
        // Kenar iki kareden de görülür: küçük kimlikli taraf yazar.
        if (b <= a) continue;
        const pair = a * 65536 + b;
        let war = pairs.get(pair);
        if (war === undefined) {
          war = atWar(world, a, b);
          pairs.set(pair, war);
        }
        if (!war) continue;
        const path = a === playerNation || b === playerNation ? ours : theirs;
        const pts = mesh ? cellEdge(mesh, tile.row * world.cols + tile.col, d) : [
          HEX_CORNERS[d][0] * HEX_SIZE, HEX_CORNERS[d][1] * HEX_SIZE,
          HEX_CORNERS[(d + 1) % 6][0] * HEX_SIZE, HEX_CORNERS[(d + 1) % 6][1] * HEX_SIZE,
        ];
        path.moveTo(tile.x + pts[0], tile.y + pts[1]);
        for (let i = 1; i < pts.length / 2; i++) path.lineTo(tile.x + pts[i * 2], tile.y + pts[i * 2 + 1]);
        count++;
      }
    }
    this.warFrontCache = { world, key, mesh, ours, theirs, count };
    return this.warFrontCache;
  }

  drawWarFrontline(ctx, world, playerNation) {
    const { ours, theirs, count } = this.warFrontPaths(world, playerNation);
    if (!count) return;
    const zoom = this.camera.zoom;
    // Çizgi ekranda sabit kalınlıkta: uzakta ince ama seçilir, yakında haritayı kesmez.
    const px = Math.min(1.2, 0.72 + zoom * 0.35) / zoom;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6.5 * px;
    ctx.strokeStyle = 'rgba(8, 8, 10, 0.72)';
    ctx.stroke(theirs);
    ctx.lineWidth = 3 * px;
    ctx.strokeStyle = '#f2a83c';
    ctx.stroke(theirs);
    ctx.lineWidth = 8 * px;
    ctx.strokeStyle = 'rgba(8, 8, 10, 0.8)';
    ctx.stroke(ours);
    ctx.lineWidth = 4.4 * px;
    ctx.strokeStyle = '#ff4630';
    ctx.stroke(ours);
    ctx.lineWidth = 1.2 * px;
    ctx.strokeStyle = '#ffe2bc';
    ctx.stroke(ours);
    ctx.restore();
  }

  /**
   * TAARRUZ OKLARI (HOI4): düşman denetimindeki hedefe yürüyen tümenlerimizin
   * çıkış karesinden hedefe kalın, kavisli ok. Aynı çıkış-hedef çifti tek ok;
   * birden çok tümen varsa sayısı yazılır. Kesik yürüyüş çizgisi "nereye"
   * diyordu, "nereye vuruyoruz" demiyordu.
   */
  drawOffensiveArrows(ctx, world, playerNation) {
    if (playerNation == null || playerNation < 0) return;
    const P = world.wrapWidth;
    const arrows = new Map();
    const add = (from, to, side) => {
      if (!from || !to || from === to) return;
      const key = `${from.q},${from.r}>${to.q},${to.r}`;
      if (!arrows.has(key)) arrows.set(key, { from, to, side });
    };
    // SALDIRI OKU (HOI4). Oyuncunun içinde olduğu her muharebede saldıranın karesinden
    // hedefe kalın ok; seçili ordunun düşman karesine verdiği saldırı emri de. Başka
    // ulusların muharebesi yalnız balonla görünür: oklar bütün dünyaya yayılınca harita
    // kalabalıklaşıyordu (Kerem: "oklar rezalet"), yalnız seçilene inince de "okumuz yok".
    const unitById = new Map(world.units.map((army) => [army.id, army]));
    // Muharebenin yönünü iğne gösterir (HOI4); ok yalnız seçili ordunun saldırısında.
    const chosen = new Set(this.minis.selection ?? []);
    for (const battle of world.battleSystem?.battles ?? []) {
      const target = world.get(battle.q, battle.r);
      for (const id of battle.attackers ?? []) {
        const army = unitById.get(id);
        if (army && chosen.has(army)) add(army.tile, target, 'own');
      }
    }
    for (const unit of this.minis.selection ?? []) {
      if (unit.nationId !== playerNation || unit.type?.domain !== 'land' || unit.hp <= 0) continue;
      const end = unit.directive ? world.get(unit.directive.q, unit.directive.r)
        : unit.path?.[unit.path.length - 1];
      if (!end || end === unit.tile) continue;
      const owner = controllerOf(end);
      if (owner < 0 || owner === playerNation
        || !(atWar(world, owner, playerNation) || inCrisis(world, owner, playerNation))) continue;
      add(unit.tile, end, 'own');
    }
    if (!arrows.size) return;
    const zoom = this.camera.zoom;
    const u = 1 / zoom;
    const INK = { own: ['#ff6a45', '#ffd2b8'], ally: ['#f0a33c', '#ffe2b0'], hostile: ['#b73fd6', '#efc6ff'], other: ['#c9c2b4', '#ffffff'] };
    ctx.save();
    ctx.lineJoin = 'round';
    for (const { from, to, side } of arrows.values()) {
      let dx = to.x - from.x;
      if (P) dx -= P * Math.round(dx / P);
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 1) continue;
      const ux = dx / len;
      const uy = dy / len;
      const sx = from.x + ux * HEX_SIZE * 0.3;
      const sy = from.y + uy * HEX_SIZE * 0.3;
      const ex = from.x + dx - ux * HEX_SIZE * 0.32;
      const ey = to.y - uy * HEX_SIZE * 0.32;
      const span = Math.hypot(ex - sx, ey - sy);
      if (span < 4 * u) continue;
      // Ölçü ekran pikselidir ama ok hiçbir zaman iki kare arasından kalın olmaz.
      const head = Math.min(17 * u, span * 0.55);
      const body = Math.min(9 * u, head * 0.62);
      const bend = Math.min(span * 0.16, HEX_SIZE * 0.5);
      const cx = (sx + ex) / 2 - uy * bend;
      const cy = (sy + ey) / 2 + ux * bend;
      // Gövde: eğri boyunca örneklenip iki yana açılır; kuyrukta incelir.
      const N = 10;
      const left = [];
      const right = [];
      const at = (t) => {
        const it = 1 - t;
        return [it * it * sx + 2 * it * t * cx + t * t * ex, it * it * sy + 2 * it * t * cy + t * t * ey];
      };
      const stop = 1 - head / Math.max(span, 1e-6);
      for (let i = 0; i <= N; i++) {
        const t = (i / N) * stop;
        const [px, py] = at(t);
        const [qx, qy] = at(Math.min(1, t + 0.02));
        let tx = qx - px;
        let ty = qy - py;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const w = body * (0.42 + 0.58 * (i / N)) / 2;
        left.push([px - ty * w, py + tx * w]);
        right.push([px + ty * w, py - tx * w]);
      }
      const [bx, by] = at(stop);
      let hx = ex - bx;
      let hy = ey - by;
      const hl = Math.hypot(hx, hy) || 1;
      hx /= hl;
      hy /= hl;
      const shape = new Path2D();
      shape.moveTo(left[0][0], left[0][1]);
      for (const [px, py] of left) shape.lineTo(px, py);
      shape.lineTo(bx - hy * head * 0.62, by + hx * head * 0.62);
      shape.lineTo(ex, ey);
      shape.lineTo(bx + hy * head * 0.62, by - hx * head * 0.62);
      for (let i = right.length - 1; i >= 0; i--) shape.lineTo(right[i][0], right[i][1]);
      shape.closePath();
      const [fill, shine] = INK[side] ?? INK.other;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 4 * u * zoom;
      ctx.shadowOffsetY = 1.5;
      ctx.lineWidth = 3 * u;
      ctx.strokeStyle = 'rgba(12, 8, 6, 0.92)';
      ctx.stroke(shape);
      ctx.shadowColor = 'transparent';
      ctx.fillStyle = fill;
      ctx.fill(shape);
      // Kendi saldırımız kırmızı emaye: doku eğri boyunca bükülür, şekle kırpılır, pirinç
      // kenarla biter (yürüyüş okunun başıyla aynı malzeme).
      const red = side === 'own' ? this.arrowArt('fill_red') : null;
      if (red) {
        const spine = [];
        for (let i = 0; i <= 16; i++) spine.push(at(i / 16));
        ctx.save();
        ctx.clip(shape);
        stripAlong(ctx, spine, red, head * 1.4);
        ctx.restore();
        ctx.lineWidth = 1.4 * u;
        ctx.strokeStyle = 'rgba(236, 196, 116, 0.95)';
        ctx.stroke(shape);
        continue;
      }
      // Üstte ince ışık: düz renk bant gibi değil, kabartma bir ok gibi okunsun.
      ctx.beginPath();
      for (let i = 1; i < left.length; i++) {
        const [px, py] = left[i];
        const [rx, ry] = right[i];
        const mx = px * 0.7 + rx * 0.3;
        const my = py * 0.7 + ry * 0.3;
        if (i === 1) ctx.moveTo(mx, my);
        else ctx.lineTo(mx, my);
      }
      ctx.lineWidth = 1.2 * u;
      ctx.strokeStyle = shine;
      ctx.globalAlpha = 0.55;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /**
   * CEPLER (game/pockets.js): kaçış yolu kalmayan tümenlerin karesinde kesik
   * halka. Bizimki kırmızı ve "ENCIRCLED", düşmanınki altın ve "POCKET".
   */
  drawPockets(ctx, world, playerNation, rect = null) {
    const pockets = world.pockets;
    if (!pockets?.length) return;
    const zoom = this.camera.zoom;
    // Ekran dışı cep çizilmez: savaşta yüzlerce cep olur, her biri kesik yay + ölçülen
    // yazı demekti (ölçüldü: 8x akışta 13 sn'de 270 ms). Pay halka ile etiketi kapsar.
    const pad = Math.max(HEX_SIZE * 0.95, 16 / zoom) + 90 / zoom;
    ctx.save();
    for (const pocket of pockets) {
      const tile = world.get(pocket.q, pocket.r);
      if (!tile) continue;
      if (rect && (tile.x < rect.minX - pad || tile.x > rect.maxX + pad
        || tile.y < rect.minY - pad || tile.y > rect.maxY + pad)) continue;
      if (this.upright && !this.upright.pin(ctx, tile.x, tile.y)) continue;
      const ours = pocket.nationId === playerNation;
      const color = ours ? '#ff5a3c' : '#f0c75e';
      const r = Math.max(HEX_SIZE * 0.95, 16 / zoom);
      // Zincir hexi sarınca sayacı ve figürü örtüyordu (Kerem): halka kesik ve ince,
      // zincir yalnız etiketin yanında küçük simge.
      const chain = this.markArt('encircled');
      ctx.beginPath();
      ctx.arc(tile.x, tile.y, r, 0, Math.PI * 2);
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.lineWidth = 2.2 / zoom;
      ctx.strokeStyle = color;
      ctx.stroke();
      ctx.setLineDash([]);
      if (zoom < 0.34) continue;
      const text = `${ours ? 'ENCIRCLED' : 'POCKET'} · ${pocket.units.length}`;
      ctx.font = `800 ${(10 / zoom).toFixed(2)}px ${FONT_UI}`;
      const w = ctx.measureText(text).width + 10 / zoom;
      const h = 15 / zoom;
      const y = tile.y + r + 2 / zoom;
      ctx.fillStyle = 'rgba(10, 12, 14, 0.9)';
      ctx.fillRect(tile.x - w / 2, y, w, h);
      ctx.lineWidth = 1 / zoom;
      ctx.strokeStyle = color;
      ctx.strokeRect(tile.x - w / 2, y, w, h);
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, tile.x, y + h / 2 + 0.5 / zoom);
      if (chain) this.drawMark(ctx, chain, tile.x - w / 2 - 9 / zoom, y + h / 2, 16, zoom);
    }
    ctx.restore();
  }

  /** Muharebe sonucu: karenin üstünde yükselip sönen "VICTORY"/"DEFEAT". */
  drawFloaters(ctx, floaters) {
    if (!floaters?.length) return;
    const zoom = this.camera.zoom;
    const now = performance.now();
    ctx.save();
    for (const f of floaters) {
      const age = (now - f.t0) / 2400;
      if (age >= 1) continue;
      if (this.upright && !this.upright.pin(ctx, f.tile.x, f.tile.y)) continue;
      const alpha = age < 0.15 ? age / 0.15 : 1 - Math.max(0, (age - 0.55) / 0.45);
      const y = f.tile.y - HEX_SIZE * (1.3 + age * 0.9);
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `800 ${(17 / zoom).toFixed(2)}px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4 / zoom;
      ctx.strokeStyle = 'rgba(8, 10, 12, 0.85)';
      ctx.strokeText(f.text, f.tile.x, y);
      ctx.fillStyle = f.won ? '#f3d27a' : '#ff7a5c';
      ctx.fillText(f.text, f.tile.x, y);
    }
    ctx.restore();
  }

  /**
   * CEPHE ÇİZGİSİ (HOI4): sektör karelerinin düşman denetimindeki komşuya
   * bakan HÜCRE KENARLARI (borderMesh.cellEdge — haritadaki organik sınırın
   * kendisi) kalın çizgi, her kenarın ortasında düşmana dönük diş. Taarruzda
   * dişler büyür. `gap`: kimsenin tutmadığı sınır, kesik ve dişsiz.
   */
  drawFrontEdges(ctx, world, tiles, playerNation, { color = '#8fcdef', active = false, gap = false, facing = null } = {}) {
    if (!tiles?.length || playerNation == null || playerNation < 0) return;
    const zoom = this.camera.zoom;
    const mesh = this.mesh?.world === world ? this.mesh : null;
    const P = world.wrapWidth || 0;
    const line = new Path2D();
    let edges = 0;
    for (const tile of tiles) {
      if (tile.terrain?.water) continue;
      for (let d = 0; d < 6; d++) {
        const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
        if (!near || near.terrain.water) continue;
        const owner = controllerOf(near);
        if (owner < 0 || owner === playerNation) continue;
        if (!atWar(world, owner, playerNation) && !inCrisis(world, owner, playerNation) && !facing?.has(owner)) continue;
        let pts;
        if (mesh) pts = cellEdge(mesh, tile.row * world.cols + tile.col, d);
        else {
          const a = HEX_CORNERS[d];
          const b = HEX_CORNERS[(d + 1) % 6];
          pts = [a[0] * HEX_SIZE, a[1] * HEX_SIZE, b[0] * HEX_SIZE, b[1] * HEX_SIZE];
        }
        const m = pts.length / 2;
        line.moveTo(tile.x + pts[0], tile.y + pts[1]);
        for (let i = 1; i < m; i++) line.lineTo(tile.x + pts[i * 2], tile.y + pts[i * 2 + 1]);
        edges++;
      }
    }
    if (!edges) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (gap) {
      ctx.setLineDash([7 / zoom, 6 / zoom]);
      ctx.lineWidth = 2.4 / zoom;
      ctx.strokeStyle = 'rgba(255, 96, 70, 0.8)';
      ctx.stroke(line);
      ctx.restore();
      return;
    }
    // İnce: savaşta asıl hat drawWarFrontline'dır, bu çizgi generalin sektörünü anar.
    // Dişler yakın zoomda birimlerden büyüyordu.
    ctx.lineWidth = (active ? 3 : 1.8) / zoom;
    ctx.strokeStyle = color;
    ctx.globalAlpha = active ? 0.95 : 0.6;
    ctx.stroke(line);
    ctx.restore();
  }

  /**
   * ÇİZİLEN HATLAR (HOI4): geri çekilme hattı kare merkezlerinden geçen
   * kehribar çizgi (bekleyen: kesik, uygulanan: dolu ve kalın); seçili
   * generalin çizilmiş cephesinin iki ucu iğne; çizim sürerken çizginin
   * kendisi. Hepsi dünya koordinatında, cephe çizgisiyle aynı geçişte.
   */
  drawCommandLines(ctx, world, state) {
    const fallbacks = state.fallbacks ?? [];
    const stroke = state.drawStroke;
    const active = state.activeGeneral;
    if (!fallbacks.length && !stroke?.length && !active?.line) return;
    const zoom = this.camera.zoom;
    const P = world.wrapWidth || 0;
    const AMBER = '#e2b85a';
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const casing = (path, width) => {
      ctx.lineWidth = width + 3 / zoom;
      ctx.strokeStyle = 'rgba(6, 10, 14, 0.6)';
      ctx.stroke(path);
    };
    for (const { general, tiles } of fallbacks) {
      const path = new Path2D();
      let px = null;
      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        let x = tile.x;
        // Yatay sarmal: ardışık kare dikişin öbür yanındaysa aynı yana alınır.
        if (px !== null && P) x -= P * Math.round((x - px) / P);
        // Kopuk kare (araya düşman girdi) çizgiyi böler.
        const gap = i > 0 && world.wrapDistance(tiles[i - 1].q, tiles[i - 1].r, tile.q, tile.r) > 3;
        if (i === 0 || gap) path.moveTo(x, tile.y);
        else path.lineTo(x, tile.y);
        px = x;
      }
      const isActive = general === active;
      const width = (general.fallingBack ? 4.2 : isActive ? 3.2 : 2.4) / zoom;
      ctx.setLineDash(general.fallingBack ? [] : [9 / zoom, 6 / zoom]);
      casing(path, width);
      ctx.lineWidth = width;
      ctx.strokeStyle = AMBER;
      ctx.globalAlpha = isActive || general.fallingBack ? 1 : 0.75;
      ctx.stroke(path);
      ctx.globalAlpha = 1;
    }
    ctx.setLineDash([]);
    // Çizilmiş cephenin uçları: oyuncu hangi dilimi verdiğini görsün.
    if (active?.line && state.fronts?.some((f) => f.general === active)) {
      const r = Math.max(HEX_SIZE * 0.16, 5 / zoom);
      for (const point of [active.line.a, active.line.b]) {
        const tile = world.get(point.q, point.r);
        if (!tile) continue;
        ctx.beginPath();
        ctx.arc(tile.x, tile.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#8fcdef';
        ctx.fill();
        ctx.lineWidth = 1.6 / zoom;
        ctx.strokeStyle = 'rgba(6, 10, 14, 0.8)';
        ctx.stroke();
      }
    }
    if (stroke?.length > 1) {
      const path = new Path2D();
      path.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) path.lineTo(stroke[i].x, stroke[i].y);
      const width = 3.4 / zoom;
      casing(path, width);
      ctx.lineWidth = width;
      ctx.strokeStyle = state.drawTool === 'fallback' ? AMBER : '#8fcdef';
      ctx.stroke(path);
    }
    ctx.restore();
  }

  /**
   * Saldırı önizlemesi: imleçteki düşman karesinin üstünde oran etiketi.
   * Yeşil ≥ eşik (generalin duruşu), sarı ≥ 1.1, kırmızı altı. Bitişik seçili
   * tümen yoksa "move adjacent" der: oran ancak bitişikten okunur.
   */
  drawAssaultOdds(ctx, odds) {
    if (!odds?.tile) return;
    const zoom = this.camera.zoom;
    const { tile, ratio, count, needs } = odds;
    const text = ratio == null ? 'Move adjacent to attack'
      : `${ratio.toFixed(1)} : 1 · ${count} div${ratio >= needs ? ' · favourable' : ratio >= 1.1 ? ' · even' : ' · costly'}`;
    const color = ratio == null ? '#cfc4a4' : ratio >= needs ? '#9fd27a' : ratio >= 1.1 ? '#e7c46a' : '#ef8a6c';
    if (this.upright && !this.upright.pin(ctx, tile.x, tile.y)) return;
    const size = 12 / zoom;
    ctx.save();
    ctx.font = `700 ${size.toFixed(2)}px ${FONT_UI}`;
    const w = ctx.measureText(text).width + 14 / zoom;
    const h = 20 / zoom;
    const x = tile.x - w / 2;
    const y = tile.y - HEX_SIZE * 0.95 - h;
    ctx.fillStyle = 'rgba(10, 14, 16, 0.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 / zoom;
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, tile.x, y + h / 2 + 0.5 / zoom);
    ctx.restore();
  }

  /**
   * Seçili orduların çevresinde yerel hex ızgarası, uzaklıkla sönerek. Tam
   * ızgara haritayı yeniden petek yapar; burada ızgara yalnız yürüyüşün
   * hedeflendiği yerde bir araçtır. Halkalar seçim değişince bir kez kurulur.
   */
  drawArmyGrid(ctx, world, selection) {
    let key = '';
    for (const unit of selection) if (unit?.tile) key += `${unit.tile.q},${unit.tile.r};`;
    let rings = this.armyGrid?.world === world && this.armyGrid.key === key ? this.armyGrid.rings : null;
    if (!rings) {
      // Çok kaynaklı BFS: birbirine yakın ordular tek ızgara paylaşır.
      const dist = new Map();
      let frontier = [];
      for (const unit of selection) {
        if (unit?.tile && !dist.has(unit.tile)) {
          dist.set(unit.tile, 0);
          frontier.push(unit.tile);
        }
      }
      rings = [];
      for (let d = 1; d <= ARMY_GRID_RADIUS && frontier.length; d++) {
        const next = [];
        const path = new Path2D();
        for (const tile of frontier) {
          for (const n of world.neighbors(tile)) {
            if (!n || dist.has(n)) continue;
            dist.set(n, d);
            next.push(n);
            // Deniz ızgara dışı (bkz. drawGrid).
            if (!n.terrain.water) this.cellPath(path, world, n);
          }
        }
        rings.push(path);
        frontier = next;
      }
      // Halka 0 (ordunun karesi) da çizilir: kenarı komşularla ortak.
      const own = new Path2D();
      for (const [tile, d] of dist) if (d === 0 && !tile.terrain.water) this.cellPath(own, world, tile);
      rings.unshift(own);
      this.armyGrid = { world, key, rings };
    }
    const zoom = this.camera.zoom;
    ctx.save();
    ctx.lineWidth = 1.1 / zoom;
    ctx.lineJoin = 'round';
    for (let d = 0; d < rings.length; d++) {
      // Yakında okunur, kenarda sıfıra iner: ızgaranın bittiği yer çizgi olmasın.
      const a = 0.34 * (1 - d / (ARMY_GRID_RADIUS + 1)) ** 1.4;
      ctx.strokeStyle = `rgba(232, 222, 196, ${a.toFixed(3)})`;
      ctx.stroke(rings[d]);
    }
    ctx.restore();
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
    const rallyArt = rallyTile ? this.markArt('rally') : null;
    if (rallyTile && rallyArt) {
      this.drawMark(ctx, rallyArt, rallyTile.x + 4 / zoom, rallyTile.y - 10 / zoom, 26, zoom);
    } else if (rallyTile) {
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

    // YÜRÜYÜŞ OKU (HOI4). Eskiden ince beyaz kesik çizgi ve içi boş halkaydı:
    // açık arazide kayboluyor, yön söylemiyordu (Kerem: "daha iyi yürüme
    // ikonu"). Şimdi her zeminde okunan koyu kılıflı dolu bant, köşeleri
    // yuvarlanmış, hedefte ok başı. Seçili ordunun oku dolgun, ötekiler ince
    // ve soluk. Yol KARA ve DENİZ koşularına bölünür: deniz koşusu pirinç
    // kesik (düşman payı olan denizde kehribar), kıyıda çapa rozeti — deniz
    // aşırı emirde nereden binip nereye çıkacağı haritada görünsün.
    //
    // Oklar üsluba göre birkaç Path2D'de birikir: kare başına çizim çağrısı
    // birim sayısından bağımsız (~10) ve aynı torbada üst üste binen soluk
    // oklar alfa katlamaz (bir generalin kırk tümeni koyu bir yumak olmaz).
    // Yalnız seçili ordunun yolu (HOI4): bütün ordular yürürken haritayı soluk
    // çizgilerden bir ağ kaplıyordu (Kerem: "nereye gittiğini gösteren ikonlar dandik").
    const chosen = selectedUnit instanceof Set ? selectedUnit : new Set(selectedUnit ? [selectedUnit] : []);
    const moving = world.units.filter((unit) => unit.path?.length && unit.nationId === playerNation && chosen.has(unit));
    if (!moving.length) return;
    const goals = new Map();
    const routes = [];
    const P = world.wrapWidth;
    const status = new Map();
    const seaTone = (tile) => {
      const zoneId = tile.seaZone ?? -1;
      if (zoneId < 0) return 'open';
      if (!status.has(zoneId)) status.set(zoneId, zoneStatus(world, playerNation, zoneId).state);
      return status.get(zoneId);
    };
    const toneOf = (a, b) => (
      ['contested', 'held'].includes(seaTone(b.terrain?.water ? b : a)) ? 'amber' : 'sea');
    // Kalınlıklar ekran pikselidir (x / zoom), yakında hafifçe kalınlaşır:
    // sabit piksel ok büyüyen hexlerin içinde iplik gibi kalıyordu.
    const k = Math.min(2.2, Math.max(0.45, zoom)) ** 0.4 / zoom;
    const dim = this.marchSet(false, k);
    const lit = this.marchSet(true, k);
    // Görünmeyen ok kurulmaz: yakın zoomda ülkenin öbür ucundaki yürüyüşler
    // her karede boşuna yol inşa ediyordu. Görünür alan geçerli dönüşümden
    // (sarmal kopyanın kayması dahil) çıkar; dönüşüm bozuksa NaN hiçbir
    // oku elemez.
    const inv = ctx.getTransform().invertSelf();
    const cw = ctx.canvas.width;
    const ch = ctx.canvas.height;
    const xa = [inv.e, inv.a * cw + inv.e, inv.c * ch + inv.e, inv.a * cw + inv.c * ch + inv.e];
    const ya = [inv.f, inv.b * cw + inv.f, inv.d * ch + inv.f, inv.b * cw + inv.d * ch + inv.f];
    const pad = HEX_SIZE * 2;
    const vx0 = Math.min(...xa) - pad;
    const vx1 = Math.max(...xa) + pad;
    const vy0 = Math.min(...ya) - pad;
    const vy1 = Math.max(...ya) + pad;
    let coasts = null;
    for (const unit of moving) {
      // Dikişi aşan adım periyot kadar sıçramasın: her düğüm bir öncekine en
      // yakın sarmal temsilciyle alınır, hat kopyanın kenarından dışarı akar.
      const xs = [unit.tile.x];
      const ys = [unit.tile.y];
      const nodes = [unit.tile];
      let x0 = unit.tile.x;
      let x1 = x0;
      let y0 = unit.tile.y;
      let y1 = y0;
      for (const tile of unit.path) {
        const last = xs[xs.length - 1];
        const dx = tile.x - last;
        const nx = last + (P ? dx - P * Math.round(dx / P) : dx);
        if (Math.abs(nx - last) + Math.abs(tile.y - ys[ys.length - 1]) < 0.5) continue;
        xs.push(nx);
        ys.push(tile.y);
        nodes.push(tile);
        if (nx < x0) x0 = nx;
        else if (nx > x1) x1 = nx;
        if (tile.y < y0) y0 = tile.y;
        else if (tile.y > y1) y1 = tile.y;
      }
      if (nodes.length < 2) continue;
      if (x1 < vx0 || x0 > vx1 || y1 < vy0 || y0 > vy1) continue;
      const active = selectedUnit instanceof Set ? selectedUnit.has(unit) : unit === selectedUnit;
      const strike = this.marchStrikes(world, unit, playerNation);
      // Bitişik kareye kara saldırısında güzergâh kırmızı okun ta kendisi.
      if (strike && nodes.length === 2 && !nodes[0].terrain?.water) continue;
      // Kıyı çapaları için yol yine izlenir; çizimi HOI4 okudur (aşağıda).
      const found = this.traceMarch(active ? lit : dim, xs, ys, nodes, toneOf, !strike);
      if (active) coasts = found;
      routes.push({ xs, ys, strike, unit });
      if (!strike) goals.set(`${xs[xs.length - 1]},${ys[ys.length - 1]}`, [xs[xs.length - 1], ys[ys.length - 1]]);
    }
    // Aynı karede toplanan ordular aynı yolu paylaşır: tek ok yeter.
    const drawn = new Set();
    for (const route of routes) {
      const key = `${route.xs[0]},${route.ys[0]}>${route.xs[route.xs.length - 1]},${route.ys[route.ys.length - 1]}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      // İlerleme: sıradaki kareye yürünen pay (movement.js unit.progress / kare bedeli).
      const next = route.unit.path?.[0];
      const cost = Math.max(0.01, next?.terrain?.moveCost ?? 1);
      const fill = Math.max(0, Math.min(1, (route.unit.progress ?? 0) / cost));
      this.drawMarchArrow(ctx, route.xs, route.ys, zoom, route.strike, fill);
    }
    if (coasts) for (const [x, y] of coasts) this.drawAnchorBadge(ctx, x, y, zoom);
    for (const [x, y] of goals.values()) this.drawMarchGoal(ctx, x, y, zoom);
  }

  /**
   * HOI4 YÜRÜYÜŞ OKU (Kerem'in örneği). Hex hex kırık yol iki kez Chaikin ile
   * yumuşatılır, kalın turuncu bir bant olarak çizilir ve büyük bir ok başıyla biter.
   * Eski ok ince ve kesikliydi; kalabalık haritada nereye gittiği okunmuyordu.
   * Saldırıyla biten yolun başı yoktur: hedefi kırmızı saldırı oku söyler.
   */
  drawMarchArrow(ctx, xs, ys, zoom, strike, fill = 0) {
    // HOI4 gibi ok yürüdükçe dolar: boş gövde soluk, yürünen pay dolu turuncu.
    const firstLeg = xs.length > 1 ? Math.hypot(xs[1] - xs[0], ys[1] - ys[0]) : 0;
    let pts = xs.map((x, i) => [x, ys[i]]);
    for (let pass = 0; pass < 2 && pts.length > 2; pass++) {
      const next = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[i + 1];
        if (i > 0) next.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
        if (i < pts.length - 2) next.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
      }
      next.push(pts[pts.length - 1]);
      pts = next;
    }
    const W = Math.min(11 / zoom, HEX_SIZE * 0.5);
    const headLen = strike ? 0 : W * 2.1;
    const headHalf = W * 1.35;
    // Başlangıç birimin altından çıkmasın: ilk yarım hex kırpılır.
    const startCut = HEX_SIZE * 0.35;
    let walked = 0;
    while (pts.length > 2) {
      const d = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      if (walked + d > startCut) break;
      walked += d;
      pts.shift();
    }
    // Uçtan ok başı kadar geri: bant başın içine girmez.
    const end = pts[pts.length - 1];
    let tail = pts.length - 1;
    let back = 0;
    while (tail > 0 && back < headLen * 0.8) {
      back += Math.hypot(pts[tail][0] - pts[tail - 1][0], pts[tail][1] - pts[tail - 1][1]);
      tail--;
    }
    const body = pts.slice(0, tail + 1);
    const base = body[body.length - 1];
    let hx = end[0] - base[0];
    let hy = end[1] - base[1];
    const hl = Math.hypot(hx, hy) || 1;
    hx /= hl;
    hy /= hl;
    const shaft = new Path2D();
    shaft.moveTo(body[0][0], body[0][1]);
    for (let i = 1; i < body.length; i++) shaft.lineTo(body[i][0], body[i][1]);
    const head = new Path2D();
    if (!strike) {
      head.moveTo(end[0], end[1]);
      head.lineTo(base[0] - hy * headHalf, base[1] + hx * headHalf);
      head.lineTo(base[0] + hy * headHalf, base[1] - hx * headHalf);
      head.closePath();
    }
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalAlpha = 0.9;
    // Koyu kılıf: açık arazide de turuncu bant ayrılsın.
    ctx.lineWidth = W + 3 / zoom;
    ctx.strokeStyle = 'rgba(40, 22, 6, 0.75)';
    ctx.stroke(shaft);
    if (!strike) {
      ctx.lineWidth = 3 / zoom;
      ctx.stroke(head);
    }
    // Boş ok: koyu yarı saydam gövde, ince açık kenar.
    ctx.lineWidth = W;
    ctx.strokeStyle = 'rgba(70, 44, 12, 0.55)';
    ctx.stroke(shaft);
    if (!strike) {
      ctx.fillStyle = 'rgba(70, 44, 12, 0.55)';
      ctx.fill(head);
    }
    // Dolu pay: başlangıçtan yürünen boya kadar (kesik çizgi deseniyle ölçülür).
    const done = Math.max(0, fill * firstLeg - walked);
    // Emaye doku (ok-dokulari, 2026-11-20): gövde soluk emaye, yürünen pay tam parlak,
    // baş pirinç kenarlı resim. Düz turuncu bant Kerem'e "paint" gibi geliyordu.
    const tex = this.arrowArt('fill_orange');
    const tip = strike ? null : this.arrowArt('arrow_head');
    if (tex && (strike || tip)) {
      // Soluk pay şeffaflıkla değil karartmayla: üst üste binen parçalar yarı saydamda
      // çizgi çizgi koyulaşıyordu. Doku tam çizilir, yürünmemiş kısım koyu bir örtü alır.
      stripAlong(ctx, body, tex, W);
      ctx.lineCap = 'butt';
      ctx.lineWidth = W + 0.6 / zoom;
      ctx.strokeStyle = 'rgba(30, 16, 4, 0.5)';
      ctx.setLineDash(done > 0.5 ? [0, done, 1e7] : []);
      ctx.stroke(shaft);
      ctx.setLineDash([]);
      if (tip) {
        ctx.save();
        ctx.translate(base[0], base[1]);
        ctx.rotate(Math.atan2(hy, hx));
        ctx.globalAlpha = 0.95;
        ctx.drawImage(tip, -hl * 0.04, -headHalf * 1.08, hl * 1.08, headHalf * 2.16);
        ctx.restore();
      }
      ctx.restore();
      return;
    }
    const grad = ctx.createLinearGradient(body[0][0], body[0][1], end[0], end[1]);
    grad.addColorStop(0, '#d8952f');
    grad.addColorStop(1, '#f6bd45');
    if (done > 0.5) {
      ctx.setLineDash([done, 1e6]);
      ctx.lineWidth = W;
      ctx.strokeStyle = grad;
      ctx.stroke(shaft);
      ctx.setLineDash([]);
    }
    // Dolmamış gövdenin üstünde ince pirinç hat: yol yine okunsun.
    ctx.lineWidth = Math.max(1, W * 0.18);
    ctx.strokeStyle = 'rgba(246, 199, 110, 0.85)';
    ctx.stroke(shaft);
    if (!strike) {
      ctx.lineWidth = 1.6 / zoom;
      ctx.strokeStyle = 'rgba(246, 199, 110, 0.9)';
      ctx.stroke(head);
    }
    ctx.restore();
  }

  /**
   * Yürüyüşün hedefi: kareye dikilmiş pirinç direkli sancak. Eskiden yalnız okun başı
   * vardı; kalabalık cephede hangi okun nerede bittiği okunmuyordu.
   */
  drawMarchGoal(ctx, x, y, zoom) {
    const u = 1 / zoom;
    const medal = warEmblem('goal', () => this.onPlatesReady?.());
    if (medal) {
      const r = 13 * u;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - r * 1.2);
      ctx.lineWidth = 2 * u;
      ctx.strokeStyle = 'rgba(10, 12, 14, 0.8)';
      ctx.stroke();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
      ctx.shadowBlur = 5;
      ctx.drawImage(medal, x - r, y - r * 3.2, r * 2, r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y, 2.6 * u, 0, Math.PI * 2);
      ctx.fillStyle = '#e2c88a';
      ctx.fill();
      return;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.ellipse(x, y + 1 * u, 7 * u, 3 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 10, 12, 0.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - 24 * u);
    ctx.lineWidth = 4 * u;
    ctx.strokeStyle = 'rgba(10, 12, 14, 0.85)';
    ctx.stroke();
    ctx.lineWidth = 2 * u;
    ctx.strokeStyle = '#e2c88a';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 1 * u, y - 24 * u);
    ctx.lineTo(x + 15 * u, y - 19.5 * u);
    ctx.lineTo(x + 1 * u, y - 14 * u);
    ctx.closePath();
    ctx.lineWidth = 2.4 * u;
    ctx.strokeStyle = 'rgba(10, 12, 14, 0.85)';
    ctx.stroke();
    ctx.fillStyle = '#f6efdc';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, 2.4 * u, 0, Math.PI * 2);
    ctx.fillStyle = '#e2c88a';
    ctx.fill();
    ctx.restore();
  }

  /**
   * Yürüyüş okunun bir üslubu: ölçüler (k = ekran pikselinin dünya karşılığı),
   * renkler ve torbalar. Seçili ok dolgun ve kalkık (altında yumuşak gölge),
   * soluk ok ince; ikisinde de koyu kılıf zemin ne olursa olsun bandı ayırır.
   */
  marchSet(active, k) {
    const bag = () => ({ land: new Path2D(), sea: new Path2D(), amber: new Path2D() });
    return {
      body: (active ? 4.4 : 2.6) * k,
      edge: (active ? 1.7 : 1.1) * k,
      headLen: (active ? 17 : 11) * k,
      headHalf: (active ? 10 : 6.5) * k,
      dash: active ? [11 * k, 6 * k] : [7 * k, 5 * k],
      lift: active ? 1.8 * k : 0,
      ink: active
        ? { land: 'rgba(246, 239, 220, 0.97)', sea: 'rgba(230, 200, 122, 0.97)', amber: 'rgba(240, 152, 66, 0.98)' }
        : { land: 'rgba(236, 229, 210, 0.66)', sea: 'rgba(218, 192, 124, 0.66)', amber: 'rgba(232, 148, 72, 0.7)' },
      casing: active ? 'rgba(12, 14, 16, 0.82)' : 'rgba(12, 14, 16, 0.42)',
      // Bütünüyle karadan giden yol tek torbada: aynı yol önce kılıf, sonra
      // gövde olarak basılır. Kılıfı ayrı kurmak yol komutlarını ikiye
      // katlıyordu (200 okluk yükte maliyetin çoğu buydu).
      solo: new Path2D(),
      casingPath: new Path2D(),
      runs: bag(),
      heads: bag(),
      used: { land: false, sea: false, amber: false },
      hasSolo: false,
      hasMixed: false,
      any: false,
    };
  }

  /**
   * Taarruz okuyla biten yol (drawOffensiveArrows'un koşulu): yürüyüş oku o
   * zaman başsız ve hedefin ~1 hex gerisinde biter. Hedefte iki ok başı üst
   * üste biniyor, açık bant kırmızı ucun önünden taşıyordu; kırmızı ok
   * "nereye vuruyoruz"u zaten söylüyor, açık bant yalnız güzergâhı.
   */
  marchStrikes(world, unit, playerNation) {
    if (unit.type?.domain !== 'land' || unit.hp <= 0) return false;
    const end = unit.path[unit.path.length - 1];
    const goal = unit.directive ? world.get(unit.directive.q, unit.directive.r) : end;
    if (goal !== end) return false;
    const owner = controllerOf(end);
    return owner >= 0 && owner !== playerNation
      && (atWar(world, owner, playerNation) || inCrisis(world, owner, playerNation));
  }

  /**
   * Tek okun geometrisini üslubun torbalarına yazar; kıyı noktalarını
   * (biniş/çıkış) döndürür. Köşeler ikinci derece eğriyle yuvarlanır: kesim
   * noktaları komşu kenarların üstündedir (teğet sürekli, taşma yok); renk
   * değişen köşe eğri ortasından bölünür ki iki koşu tam köşede birleşsin.
   * Kıyıyı kesen kenar KIYIDA bölünür (su karesinin kara komşusuna bakan
   * kenarı, ~0.87 hex): renk ve çapa orada değişir, sayacın altında kalan
   * düğümde değil.
   */
  traceMarch(set, xs, ys, nodes, toneOf, head) {
    const n = xs.length;
    const L = n - 2;
    const len = [];
    const ux = [];
    const uy = [];
    for (let e = 0; e <= L; e++) {
      const dx = xs[e + 1] - xs[e];
      const dy = ys[e + 1] - ys[e];
      const l = Math.hypot(dx, dy);
      len.push(l);
      ux.push(dx / l);
      uy.push(dy / l);
    }
    const cut = new Array(n).fill(0);
    for (let i = 1; i <= L; i++) cut[i] = Math.min(HEX_SIZE * 0.9, len[i - 1] / 2, len[i] / 2);
    // Ok başı son kenarın DÜZ kısmına oturur: sığmazsa önce son köşe daralır,
    // sonra baş kısalır (en çok %40; altında baş gövdeden ayırt edilmiyor).
    // Başsız (taarruz) yol kırmızı ok başının gerisinde biter.
    const inset = HEX_SIZE * (head ? 0.14 : 0.9);
    const avail = len[L] - inset;
    let headLen = 0;
    if (head) {
      if (L > 0) cut[L] = Math.min(cut[L], Math.max(avail * 0.35, avail - set.headLen));
      headLen = Math.max(set.headLen * 0.6, Math.min(set.headLen, avail - cut[L]));
    }
    // Gövde başın içinde biter: düz uç başın iki yanından taşmasın.
    const stop = inset + headLen * 0.52;
    const coast = HEX_SIZE * 0.87;
    const solo = !nodes.some((tile) => tile.terrain?.water);
    const casing = solo ? null : set.casingPath;
    casing?.moveTo(xs[0], ys[0]);
    if (solo) set.hasSolo = true;
    else set.hasMixed = true;
    let pen = null;
    let penTone = null;
    const to = (tone, x, y) => {
      if (tone === penTone) return;
      pen = solo ? set.solo : set.runs[tone];
      pen.moveTo(x, y);
      penTone = tone;
      set.used[tone] = true;
    };
    const line = (x, y) => {
      pen.lineTo(x, y);
      casing?.lineTo(x, y);
    };
    const curve = (cx, cy, x, y) => {
      pen.quadraticCurveTo(cx, cy, x, y);
      casing?.quadraticCurveTo(cx, cy, x, y);
    };
    // Kenar tonları önce: köşe yalnız rengin değiştiği düğümde ikiye bölünür,
    // öteki köşeler tek eğridir (aynı eğri, yarı komut — 200 okluk yükte
    // maliyetin çoğu yol komutlarıydı, basma değil).
    const fromT = [];
    const toT = [];
    for (let e = 0; e <= L; e++) {
      const wa = Boolean(nodes[e].terrain?.water);
      const wb = Boolean(nodes[e + 1].terrain?.water);
      const sea = wa || wb ? toneOf(nodes[e], nodes[e + 1]) : 'land';
      fromT.push(wb && !wa ? 'land' : sea);
      toT.push(wa && !wb ? 'land' : sea);
    }
    const coasts = [];
    let atX = xs[0];
    let atY = ys[0];
    to(fromT[0], atX, atY);
    for (let e = 0; e <= L; e++) {
      const s0 = e === 0 ? 0 : cut[e];
      const s1 = Math.max(s0, len[e] - (e === L ? stop : cut[e + 1]));
      if (e > 0 && toT[e - 1] !== fromT[e]) {
        // Renk bu düğümde değişir: köşenin ikinci yarısı yeni torbada.
        to(fromT[e], atX, atY);
        const bx = xs[e] + ux[e] * cut[e];
        const by = ys[e] + uy[e] * cut[e];
        curve((xs[e] + bx) / 2, (ys[e] + by) / 2, bx, by);
      }
      if (fromT[e] !== toT[e]) {
        const s = Math.min(s1, Math.max(s0, nodes[e + 1].terrain?.water ? len[e] - coast : coast));
        const cx = xs[e] + ux[e] * s;
        const cy = ys[e] + uy[e] * s;
        line(cx, cy);
        coasts.push([cx, cy]);
        to(toT[e], cx, cy);
      }
      atX = xs[e] + ux[e] * s1;
      atY = ys[e] + uy[e] * s1;
      line(atX, atY);
      if (e < L) {
        const i = e + 1;
        const bx = xs[i] + ux[i] * cut[i];
        const by = ys[i] + uy[i] * cut[i];
        if (toT[e] === fromT[i]) {
          curve(xs[i], ys[i], bx, by);
          atX = bx;
          atY = by;
        } else {
          // Köşenin ilk yarısı: kesim noktasından eğrinin ortasına.
          const c1x = (atX + xs[i]) / 2;
          const c1y = (atY + ys[i]) / 2;
          atX = (c1x + (xs[i] + bx) / 2) / 2;
          atY = (c1y + (ys[i] + by) / 2) / 2;
          curve(c1x, c1y, atX, atY);
        }
      }
    }
    if (head) {
      const tx = xs[L + 1] - ux[L] * inset;
      const ty = ys[L + 1] - uy[L] * inset;
      const hw = set.headHalf * (headLen / set.headLen);
      const bx = tx - ux[L] * headLen;
      const by = ty - uy[L] * headLen;
      // Arkası çok hafif oyuk: düz tabanlı üçgen "trafik işareti" gibi,
      // derin oyuk fare imleci gibi duruyordu.
      const nx = bx + ux[L] * headLen * 0.12;
      const ny = by + uy[L] * headLen * 0.12;
      const path = set.heads[penTone];
      path.moveTo(tx, ty);
      path.lineTo(bx - uy[L] * hw, by + ux[L] * hw);
      path.lineTo(nx, ny);
      path.lineTo(bx + uy[L] * hw, by - ux[L] * hw);
      path.closePath();
    } else {
      // Başsız uç yuvarlak: gövdenin düz kesiği yarım kalmış gibi okunuyordu.
      const end = set.heads[penTone];
      end.moveTo(atX + set.body / 2, atY);
      end.arc(atX, atY, set.body / 2, 0, Math.PI * 2);
    }
    set.any = true;
    return coasts;
  }

  /** Bir üslubun torbalarını basar: gölge, kılıf, gövde, ok başı. */
  strokeMarch(ctx, set) {
    if (!set.any) return;
    const tones = ['land', 'sea', 'amber'].filter((tone) => set.used[tone]);
    const rims = [];
    if (set.hasMixed) rims.push(set.casingPath);
    if (set.hasSolo) rims.push(set.solo);
    if (set.lift) {
      ctx.save();
      ctx.translate(0, set.lift);
      ctx.lineCap = 'round';
      ctx.lineWidth = set.body + set.edge * 2;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
      for (const path of rims) ctx.stroke(path);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      for (const tone of tones) ctx.fill(set.heads[tone]);
      ctx.restore();
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = set.casing;
    ctx.lineWidth = set.body + set.edge * 2;
    for (const path of rims) ctx.stroke(path);
    // Ok başının kenarı aynı yoldan: başı iki ayrı torbada kurmak yol
    // komutlarını boşuna artırıyordu.
    ctx.lineWidth = set.edge * 2;
    for (const tone of tones) ctx.stroke(set.heads[tone]);
    // Koşular uç uca eklenir: yuvarlak uç komşu rengin üstüne taşardı.
    ctx.lineCap = 'butt';
    ctx.lineWidth = set.body;
    if (set.hasSolo) {
      ctx.strokeStyle = set.ink.land;
      ctx.stroke(set.solo);
    }
    if (set.hasMixed) {
      for (const tone of tones) {
        ctx.setLineDash(tone === 'land' ? [] : set.dash);
        ctx.strokeStyle = set.ink[tone];
        ctx.stroke(set.runs[tone]);
      }
    }
    ctx.setLineDash([]);
    for (const tone of tones) {
      ctx.fillStyle = set.ink[tone];
      ctx.fill(set.heads[tone]);
    }
  }

  /**
   * Kıyıdaki çapa rozeti: koyu disk, pirinç halka, çapa. Uzak zoomda en az
   * 9 px kalır (çapa çizgisi ekran pikseli, hex ise küçülüyor: rozetsiz
   * çapa uzakta tek bir leke oluyordu).
   */
  drawAnchorBadge(ctx, x, y, zoom) {
    const port = this.markArt('port');
    if (port) {
      this.drawMark(ctx, port, x, y, 20, zoom);
      return;
    }
    const r = HEX_SIZE * 0.4;
    const f = Math.max(1, 9 / (r * zoom));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, f);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(10, 16, 20, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.4 / (zoom * f);
    ctx.strokeStyle = 'rgba(230, 200, 122, 0.95)';
    ctx.stroke();
    this.drawAnchorGlyph(ctx, 0, r * 0.06, zoom * f);
    ctx.restore();
  }

  /** Çapa işareti (biniş/çıkış düğümü): halka + gövde + kol, 0.3 hex. */
  drawAnchorGlyph(ctx, x, y, zoom) {
    const r = HEX_SIZE * 0.3;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 4 / zoom;
    ctx.strokeStyle = 'rgba(6, 12, 16, 0.75)';
    const glyph = () => {
      ctx.beginPath();
      ctx.arc(x, y - r * 0.7, r * 0.22, 0, Math.PI * 2);
      ctx.moveTo(x, y - r * 0.48);
      ctx.lineTo(x, y + r * 0.75);
      ctx.moveTo(x - r * 0.45, y - r * 0.15);
      ctx.lineTo(x + r * 0.45, y - r * 0.15);
      ctx.moveTo(x - r * 0.6, y + r * 0.35);
      ctx.quadraticCurveTo(x - r * 0.4, y + r * 0.85, x, y + r * 0.75);
      ctx.quadraticCurveTo(x + r * 0.4, y + r * 0.85, x + r * 0.6, y + r * 0.35);
      ctx.stroke();
    };
    glyph();
    ctx.lineWidth = 1.8 / zoom;
    ctx.strokeStyle = 'rgba(240, 215, 149, 0.95)';
    glyph();
    ctx.restore();
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
  /**
   * ZAFER PUANI: her state'in merkez hexi. Warscore'un %75'i oradan gelir
   * (peace.VICTORY_POINT_SHARE); ordu hex hex yürüdüğü için oyuncu hangi
   * hexi alması gerektiğini haritada görmeli. Şehirli merkez zaten şehir
   * levhasıyla işaretli, ona ikinci işaret konmaz. İşgal edilmiş merkez
   * işgalcinin rengiyle dolar.
   */
  /** Harita işaret resmi; ilk istekte yüklenir, gelince önbellek tazelenir. */
  /**
   * Seçili sayacın pirinç çerçevesi (arrows/select_frame, 9 dilim): Kerem "ünitenin
   * etrafında kare değil, sayacın kendisi seçilsin" dedi; sprite'taki ışık tek başına
   * kalabalık cephede seçiliyi ayırmıyordu. Köşeler sayaç boyuyla ölçeklenir.
   */
  drawPickFrame(ctx, left, top, width, height) {
    const img = this.arrowArt('select_frame');
    if (!img) return;
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const s = Math.round(sw * 0.15);
    const c = height * 0.5;
    const o = height * 0.2;
    const x0 = left - o;
    const y0 = top - o;
    const x1 = left + width + o;
    const y1 = top + height + o;
    const mw = Math.max(0, x1 - x0 - 2 * c);
    const mh = Math.max(0, y1 - y0 - 2 * c);
    const piece = (sx, sy, sW, sH, dx, dy, dW, dH) => {
      if (dW > 0 && dH > 0) ctx.drawImage(img, sx, sy, sW, sH, dx, dy, dW, dH);
    };
    piece(0, 0, s, s, x0, y0, c, c);
    piece(sw - s, 0, s, s, x1 - c, y0, c, c);
    piece(0, sh - s, s, s, x0, y1 - c, c, c);
    piece(sw - s, sh - s, s, s, x1 - c, y1 - c, c, c);
    piece(s, 0, sw - 2 * s, s, x0 + c, y0, mw, c);
    piece(s, sh - s, sw - 2 * s, s, x0 + c, y1 - c, mw, c);
    piece(0, s, s, sh - 2 * s, x0, y0 + c, c, mh);
    piece(sw - s, s, s, sh - 2 * s, x1 - c, y0 + c, c, mh);
  }

  /** Ok dokuları (assets/icons/arrows): yalnız canlı katmanda, önbellek boşaltmaz. */
  arrowArt(name) {
    return mapArt(name, () => this.onPlatesReady?.(), 'arrows');
  }

  markArt(name) {
    return mapArt(name, () => { this.invalidateCache(); this.onPlatesReady?.(); });
  }

  /**
   * Resim işaretini (x, y) merkezine `px` ekran boyunda basar. İşgal edilen yerde altına
   * işgalcinin renginde ince bir halka: eskiden işaretin kendisi o renge boyanıyordu.
   */
  drawMark(ctx, image, x, y, px, zoom, ring = null) {
    const size = px / zoom;
    const w = image.width >= image.height ? size : size * (image.width / image.height);
    const h = image.width >= image.height ? size * (image.height / image.width) : size;
    if (ring) {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
      ctx.lineWidth = 2.4 / zoom;
      ctx.strokeStyle = ring;
      ctx.stroke();
    }
    ctx.drawImage(this.markAt(image, w * zoom, h * zoom), x - w / 2, y - h / 2, w, h);
  }

  /**
   * İşaret resminin ekran boyunda (cihaz pikseli, yarım piksel basamağı) önceden
   * küçültülmüş kopyası. Eskiden her işaret her karede büyük kaynaktan 'high' kaliteyle
   * küçülüyordu: şehir + state + liman işaretleri kare başına onlarca pahalı örnekleme
   * (ölçüldü: drawMark, zoom sırasında render süresinin ~%10'u). Küçültme yine 'high'
   * ile, kovada bir kez; karede yalnız ~1:1 blit kalır.
   */
  markAt(image, cssW, cssH) {
    const dpr = this.dpr || 1;
    const cw = Math.max(1, Math.round(cssW * dpr * 2) / 2);
    const ch = Math.max(1, Math.round(cssH * dpr * 2) / 2);
    // Kaynak hedeften küçükse küçültme yok: doğrudan basılır.
    if (!(image.width > cw * 1.5)) return image;
    this.markScaled ??= new WeakMap();
    let sizes = this.markScaled.get(image);
    if (!sizes) {
      sizes = new Map();
      this.markScaled.set(image, sizes);
    }
    const key = cw * 4096 + ch;
    let canvas = sizes.get(key);
    if (!canvas) {
      if (sizes.size > 64) sizes.clear();
      canvas = document.createElement('canvas');
      canvas.width = Math.ceil(cw);
      canvas.height = Math.ceil(ch);
      const g = canvas.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, 0, 0, canvas.width, canvas.height);
      sizes.set(key, canvas);
    }
    return canvas;
  }

  drawVictoryPoints(ctx, world, rect) {
    if (this.mapMode === 'geography') return;
    const zoom = this.camera.zoom;
    const minis = (this.minis?.blendAt?.(zoom) ?? 0) > 0.5;
    const r = HEX_SIZE * 0.2;
    const U = this.upright;
    ctx.save();
    ctx.lineWidth = 1.4 / zoom;
    for (const province of world.provinces ?? []) {
      const t = province.center;
      if (!t || province.owner < 0 || t.city) continue;
      if (t.x < rect.minX || t.x > rect.maxX || t.y < rect.minY || t.y > rect.maxY) continue;
      // Figür o karede duruyorsa işaret onun başına biniyordu: yakın zoomda çekilir.
      if (minis && unitsOn(t).length) continue;
      if (U && !U.pin(ctx, t.x, t.y)) continue;
      const holder = controllerOf(t);
      const occupied = holder >= 0 && holder !== province.owner;
      // State adı merkeze yazılır; işaret adın üstünde durur, yazıyı bölmez.
      const y = t.y - HEX_SIZE * 0.62;
      const stud = this.markArt('province');
      if (stud) {
        this.drawMark(ctx, stud, t.x, y, Math.min(14, Math.max(9, 11 * zoom)), zoom,
          occupied ? this.nationInk(world.nations[holder]) : null);
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(t.x, y - r);
      ctx.lineTo(t.x + r * 0.8, y);
      ctx.lineTo(t.x, y + r);
      ctx.lineTo(t.x - r * 0.8, y);
      ctx.closePath();
      ctx.fillStyle = occupied ? this.nationInk(world.nations[holder]) : '#baa064';
      ctx.fill();
      ctx.strokeStyle = 'rgba(8, 10, 12, 0.85)';
      ctx.stroke();
    }
    ctx.restore();
  }

  drawCities(ctx, world, rect) {
    // Coğrafya kipi fiziksel dünyayı yalnız başına gösterir: şehir de siyasettir.
    if (!world.cities?.length || this.mapMode === 'geography') return;
    const zoom = this.camera.zoom;
    // Çapa uzak zoomda okunmaz; orada yalnız işaret kalır.
    const detailed = zoom >= 0.3;
    const U = this.upright;

    for (const city of world.cities) {
      const t = city.tile;
      if (t.x < rect.minX || t.x > rect.maxX || t.y < rect.minY || t.y > rect.maxY) continue;
      if (U && !U.pin(ctx, t.x, t.y)) continue;
      const nation = world.nations[city.nationId];
      const isCapital = nation.capital === t;
      // KALE LEVHASI KALDIRILDI (Kerem: "şu kale gibi olan işareti kaldır"):
      // şehir artık state zafer puanıyla aynı dilde küçük pirinç bir
      // baklavadır, başkent pirinç yıldız; adı etiket katmanında yazar.
      // İşgal edilen şehir işgalcinin rengini alır (zafer puanıyla aynı).
      const s = HEX_SIZE * 0.44;
      const cy = t.y - HEX_SIZE * CITY_OFFSET;
      const holder = controllerOf(t);
      const occupied = holder >= 0 && holder !== city.nationId;
      const fill = occupied ? this.nationInk(world.nations[holder]) : isCapital ? '#dfc180' : '#baa064';
      ctx.lineWidth = Math.max(1 / zoom, HEX_SIZE * 0.035);
      ctx.strokeStyle = 'rgba(8, 10, 12, 0.85)';
      ctx.fillStyle = fill;
      const art = this.markArt(isCapital ? 'capital' : 'city');
      if (art) {
        const px = (isCapital ? 22 : 17) * Math.min(1.25, Math.max(0.8, zoom));
        this.drawMark(ctx, art, t.x, cy, px, zoom, occupied ? fill : null);
        if (detailed && this.isPort(world, city)) {
          const port = this.markArt('port');
          if (port) this.drawMark(ctx, port, t.x + px * 0.75 / zoom, cy + px * 0.25 / zoom, px * 0.62, zoom);
        }
        continue;
      }
      const mark = new Path2D();
      if (isCapital) this.starPath(mark, t.x, cy, HEX_SIZE * 0.3);
      else {
        const r = HEX_SIZE * (0.18 + 0.03 * Math.min(3, city.level ?? 0));
        mark.moveTo(t.x, cy - r);
        mark.lineTo(t.x + r * 0.8, cy);
        mark.lineTo(t.x, cy + r);
        mark.lineTo(t.x - r * 0.8, cy);
        mark.closePath();
      }
      ctx.fill(mark);
      ctx.stroke(mark);

      if (!detailed) continue;

      // Liman: işaretin sağında küçük çapa. Deniz ticareti tek bakışta okunur.
      if (this.isPort(world, city)) {
        const ax = t.x + s * 1.1;
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

  /**
   * Birimin oyuncuya göre tarafı; Ültimatomdaki düşman da düşmandır. "Bu kimin ordusu"nun
   * cevabı ulus rengi değil taraftır (elli ulusun paleti birbirine yakın, Kerem): künyenin
   * emayesi benim yeşil, müttefik çelik mavi, savaştığım kızıl, üçüncü taraf koyu deri
   * (unitSkin.js). Düşman ayrıca köşesi kesik çizilir: renk görmeyen göz biçimden ayırsın.
   */
  sideOf(world, nationId, playerNation) {
    if (playerNation == null || playerNation < 0 || !world) return 'other';
    if (nationId === playerNation) return 'own';
    if (atWar(world, nationId, playerNation) || inCrisis(world, nationId, playerNation)) return 'hostile';
    const me = world.nations?.[playerNation];
    return me && isAllied(me, nationId) ? 'ally' : 'other';
  }

  /**
   * Sayacın "etkin zoomu": sayaç bu zoomdaymış gibi pişer ve dünyaya s =
   * etkin/gerçek oranıyla küçültülerek basılır. Dirseğin altında s = 1, yani
   * eski görünüm birebir; üstünde sayaç haritanın yarı hızıyla büyür (bkz.
   * COUNTER_KNEE_PX). Üçüncü taraf ayrıca küçülür. Tıklama
   * (game.unitAtScreen) ve seçim çerçevesi aynı ölçüyü kullanır.
   */
  counterZoom(side = 'own') {
    const zoom = this.camera.zoom;
    const base = HEX_SIZE * 1.56;
    const linear = base * zoom;
    const px = linear <= COUNTER_KNEE_PX ? linear
      : COUNTER_KNEE_PX + (linear - COUNTER_KNEE_PX) * COUNTER_GROWTH;
    const eff = px / base;
    return side === 'other' ? eff * OTHER_COUNTER_SCALE : eff;
  }

  /**
   * Bu taraftaki sayaç bu zoomda çiziliyor mu? Uzak zoomda üçüncü tarafın
   * garnizonları çizilmez: varsayılan bakışta görünen 426 yığının 402'si
   * savaşla ilgisiz ulusların bayraklarıydı, oyuncunun 16 tümeni ve düşmanın
   * 6'sı bu halının içinde kayboluyordu (ölçüldü, AUDIT1 savaşı).
   */
  counterVisible(side) {
    return side !== 'other' || this.camera.zoom >= OTHER_COUNTER_MIN_ZOOM;
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
  drawUnitCounters(ctx, world, selectedUnit, rect, playerNation = null) {
    const chosen = new Set(this.minis.selection ?? []);
    if (!world.units?.length) return;
    // Sprite onbellegi bunlari okur; her karede bir atama, ayri bir kanal degil.
    this.viewWorld = world;
    this.playerNationId = playerNation;
    const zoom = this.camera.zoom;
    // Taraf ulus basina bir kez: kare icinde ayni ulusun onlarca rozeti var.
    const sides = new Map();
    const U = this.upright;
    // Sayaçların EKRAN kutuları: adlar (drawLabels) sayacın altına kaçar.
    // Dönüşüm döngü boyunca sabit; bir kez okunur. Eğik kamerada yok.
    const T = U ? null : ctx.getTransform();
    const sd = 1 / this.dpr;
    const boxes = (this.counterRects ??= []);
    // Yakın zoomda sayaç figüre erir; figürler döngü sonunda arkadan öne basılır.
    const miniBlend = this.minis.blendAt(zoom);
    this.minis.begin(world, zoom, miniBlend);
    // Tıklama kutuları (ekran CSS px): game.unitAtScreen sayacın ÇİZİLDİĞİ yere bakar.
    const hits = (this.unitHits ??= []);
    const now = this.glideFrame(world);
    const heads = (this.headQueue ??= []);
    heads.length = 0;

    for (const unit of world.units) {
      const tile = unit.tile;
      if (tile.x < rect.minX || tile.x > rect.maxX || tile.y < rect.minY || tile.y > rect.maxY) {
        continue;
      }
      const stack = unitsOn(tile);
      if (stack.length > 1 && stack[0] !== unit) continue;
      // Çizim yeri: muharebede sınıra yaslanır, yürüyüşte eski kareden kayar (yalnız görsel).
      const at = this.unitGlide(world, unit, stack, tile, now);
      if (U && !U.pin(ctx, at.x, at.y)) continue;
      const nation = world.nations[unit.nationId];
      let side = sides.get(unit.nationId);
      if (!side) {
        side = this.sideOf(world, unit.nationId, playerNation);
        sides.set(unit.nationId, side);
      }
      if (!this.counterVisible(side)) continue;
      this.minis.want(stack, zoom);
      let men = 0;
      for (const member of stack) men += menUnderArms(member);
      // Yön işareti: saldırının hedefi ya da yolun bir sonraki düğümü. Uzakta yalnız oyuncunun.
      const aim = !U && (side === 'own' || zoom >= 0.34) ? this.headingOf(world, stack, tile) : null;
      const mini = miniBlend > 0 ? this.minis.stack(ctx, stack, nation, at) : null;
      if (mini) {
        const plate = this.minis.plate(unit, stack, nation, side, stack.includes(selectedUnit), zoom,
          () => compactMen(men));
        // Kutu figürleri de kapsar: şehir ve state adı askerin üstüne yazılmasın.
        if (T) {
          const { left: footL, right: footR, top: footT } = this.minis.foot;
          const boxL = Math.min(plate.left, footL);
          const boxR = Math.max(plate.left + plate.w, footR);
          const box = {
            x: (T.a * boxL + T.e) * sd,
            y: (T.d * footT + T.f) * sd,
            w: T.a * (boxR - boxL) * sd,
            h: T.d * (plate.top + plate.h - footT) * sd,
          };
          boxes.push(box);
          hits.push({ unit, stack, x: box.x, y: box.y, w: box.w, h: box.h });
        }
        if (aim && miniBlend >= 1) {
          const { left: footL, right: footR, top: footT } = this.minis.foot;
          this.queueHeading(heads, at.x, at.y - (at.y - footT) * 0.35, (footR - footL) / 2, (at.y - footT) * 0.65, aim, side, zoom);
        }
        if (U) this.minis.flush(ctx);
        if (miniBlend >= 1) continue;
      }
      const ze = this.counterZoom(side);
      const k = ze / zoom;
      const width = HEX_SIZE * 1.56 * k;
      const height = HEX_SIZE * 1.08 * k;
      const left = at.x - width / 2;
      const top = at.y - height / 2;
      if (aim) this.queueHeading(heads, at.x, at.y, width / 2, height / 2, aim, side, zoom);

      // Uzak LOD: bu ölçekte sayaç ~7 px — köşe yuvarlağı, gradyan ve
      // çubuklar okunmaz ama maliyeti okunur (ölçüldü: 655 birimlik dünyada
      // su tiki başına ~2.7 ms). Plaka + kimlik şeridi yeter.
      // Uzakta sayac ~7 px: rakam da tur glifi de okunmuyor, geriye tek soru
      // kaliyor — "bu kimin ordusu". Cevabi en hizli veren sey ulusun
      // BAYRAGIDIR; renk seridi yalnizca paletten hatirlayabilene calisiyordu.
      // Bayrak ulus basina bir kez pisip blit edilir (bkz. flagSprite).
      if (zoom < 0.34) {
        // Uzakta sayaç yalnız bayraktır; kendi ve müttefik bayrağı ince pirinç çerçeveli,
        // yalnız düşman kızıl emaye çerçeve taşır (uzaktan cepheyi okutan o). Rozet gölgesi
        // ve çerçevesiyle birlikte pişer: karede tek drawImage (bkz. farBadge).
        const badge = this.farBadge(nation, side, width, height);
        ctx.drawImage(badge.canvas, left - badge.pad, top - badge.pad, width + badge.pad * 2, height + badge.pad * 2);
        if (T) this.pushUnitHit(hits, T, sd, unit, stack, left - badge.pad, top - badge.pad, width + badge.pad * 2, height + badge.pad * 2);
        continue;
      }

      if (T && !mini) boxes.push({ x: (T.a * left + T.e) * sd, y: (T.d * top + T.f) * sd, w: T.a * width * sd, h: T.d * height * sd });
      // Yığın etiketi sağ üstte sayaçtan taşar (paintCounterSprite tabX/tabY): o da tıklanır.
      if (T) {
        const tab = stack.length > 1 ? height * 0.21 : 0;
        this.pushUnitHit(hits, T, sd, unit, stack, left, top - tab, width + tab, height + tab);
      }
      // Çoklu seçimde de: yığının herhangi bir tümeni seçiliyse sayaç seçilidir.
      const picked = unit === selectedUnit || stack.some((member) => chosen.has(member));
      const sprite = this.unitSprite(unit, nation, Math.min(stack.length, 9), picked, side, ze, men);
      if (mini) ctx.globalAlpha = this.minis.counterAlpha;
      ctx.drawImage(sprite.canvas, left - sprite.margin * k, top - sprite.margin * k, sprite.w * k, sprite.h * k);
      if (picked) this.drawPickFrame(ctx, left, top, width, height);
      this.drawCounterState(ctx, world, stack, left, top, width, height, zoom);
      ctx.globalAlpha = 1;
    }
    this.minis.flush(ctx);
    this.drawHeadings(ctx, heads, zoom);
    // Kayma sürüyorsa bir kare daha; bitince istek kesilir (sürekli döngü yok).
    if (this.glideLive) this.requestFrame?.();
    // Pişmemiş sayaç kaldıysa bir kare daha (borç bitince istek kesilir).
    if (this.spriteDebt) {
      this.spriteDebt = false;
      this.requestFrame?.();
    }
  }

  pushUnitHit(hits, T, sd, unit, stack, x, y, w, h) {
    hits.push({ unit, stack, x: (T.a * x + T.e) * sd, y: (T.d * y + T.f) * sd, w: T.a * w * sd, h: T.d * h * sd });
  }

  /** Ekran noktasındaki çizili yığın (son çizilen üstte); kutu yoksa null. */
  unitHitAt(sx, sy, pad = 2) {
    const hits = this.unitHits;
    if (!hits?.length) return null;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (sx >= h.x - pad && sx <= h.x + h.w + pad && sy >= h.y - pad && sy <= h.y + h.h + pad) return h.unit;
    }
    return null;
  }

  /** Ekran kutusuna değen çizili yığınların tümenleri (kutu seçimi). */
  unitsInScreenBox(x0, y0, x1, y1) {
    const found = new Set();
    for (const h of this.unitHits ?? []) {
      if (h.x > x1 || h.x + h.w < x0 || h.y > y1 || h.y + h.h < y0) continue;
      for (const unit of h.stack) found.add(unit);
    }
    return found;
  }

  /** Yığının gittiği komşu kareye birim yön [dx, dy] ya da null: saldırı hedefi, yoksa yolun başı. */
  headingOf(world, stack, tile) {
    let to = null;
    for (const member of stack) {
      if (!member.battleId) continue;
      if (!this.glideBattles) this.battleLean(world, member, tile);
      const battle = this.glideBattles?.get(member.battleId);
      const target = battle && world.get(battle.q, battle.r);
      if (target && target !== tile) {
        to = target;
        break;
      }
    }
    if (!to) to = stack.find((member) => member.path?.length)?.path[0] ?? null;
    if (!to || to === tile) return null;
    const P = world.wrapWidth || 0;
    let dx = to.x - tile.x;
    if (P) dx -= P * Math.round(dx / P);
    const dy = to.y - tile.y;
    const l = Math.hypot(dx, dy);
    return l > 1e-6 ? [dx / l, dy / l] : null;
  }

  /** Yön işaretini sayacın/figürün kenarına kuyruğa alır (hw, hh: yarı boylar, dünya birimi). */
  queueHeading(heads, x, y, hw, hh, dir, side, zoom) {
    const [dx, dy] = dir;
    // Dikdörtgen kenarına uzaklık + ekranda 2 px boşluk.
    const edge = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
    const d = edge + 2 / zoom;
    heads.push({ x: x + dx * d, y: y + dy * d, dx, dy, side });
  }

  /**
   * Küçük yön okları (Kerem: "saldırdığı veya ilerlediği yere doğru minik ama gözüken bir ok"):
   * seçili birliğin uzun yürüyüş okundan (drawMarchArrow) ayrı, her yığında birkaç piksellik uç.
   * Boy ekranda sabit; koyu kontur + taraf rengi dolgu her zeminde okunur.
   */
  drawHeadings(ctx, heads, zoom) {
    if (!heads.length) return;
    const u = 1 / zoom;
    const len = 9 * u;
    const half = 5 * u;
    const fill = { own: '#9fe07a', ally: '#8fc3ef', hostile: '#f2735a', other: '#e8dcc0' };
    ctx.save();
    ctx.lineJoin = 'round';
    for (const h of heads) {
      const { x, y, dx, dy } = h;
      const nx = -dy;
      const ny = dx;
      ctx.beginPath();
      ctx.moveTo(x + dx * len, y + dy * len);
      ctx.lineTo(x + nx * half, y + ny * half);
      ctx.lineTo(x + dx * len * 0.3, y + dy * len * 0.3);
      ctx.lineTo(x - nx * half, y - ny * half);
      ctx.closePath();
      ctx.lineWidth = 2.6 * u;
      ctx.strokeStyle = 'rgba(8, 10, 12, 0.92)';
      ctx.stroke();
      ctx.fillStyle = fill[h.side] ?? fill.other;
      ctx.fill();
    }
    ctx.restore();
  }

  /** Kare başı: muharebe tablosu tembel kurulur, kayma bayrağı sıfırlanır. */
  glideFrame() {
    // Sarmal dünyanın her kopyası aynı saati okur: ikinci kopya kaymayı yeniden başlatmasın.
    if (!this.glideFresh && this.glideNow != null) return this.glideNow;
    this.glideFresh = false;
    this.glideNow = performance.now();
    this.glideLive = false;
    this.glideBattles = null;
    this.glideUnits = null;
    this.unitGlides ??= new Map();
    if (this.unitGlides.size > 6000) this.unitGlides.clear();
    return this.glideNow;
  }

  /**
   * Yığının çizim yeri (dünya birimi). Hedef: kare merkezi (şehirde biraz aşağı); muharebede
   * saldıran saldırdığı sınıra, savunan saldırana doğru kayar (HOI4). Hedef değişince eski
   * görünen yerden yeniye kayar: sim tümeni bir haftada kareden kareye atlatır, göz yürüyüş
   * görür. Süre iki değişim arasındaki gerçek zamana uyar: hızlı oyunda kayma bitmeden yeni
   * adım gelir ve hareket kesintisiz akar. Simülasyona yazmaz, zar çekmez.
   */
  unitGlide(world, unit, stack, tile, now) {
    let x = tile.x;
    let y = tile.y + (tile.city ? HEX_SIZE * UNIT_ON_CITY_OFFSET : 0);
    const fighting = stack.find((member) => member.battleId);
    if (fighting) {
      const lean = this.battleLean(world, fighting, tile);
      if (lean) {
        x += lean[0];
        y += lean[1];
      }
    }
    const P = world.wrapWidth || 0;
    let g = this.unitGlides.get(unit.id);
    if (!g) {
      g = { x, y, fx: x, fy: y, at: -1e9, span: GLIDE_MAX_MS, changed: now, out: { x, y } };
      this.unitGlides.set(unit.id, g);
      return g.out;
    }
    if (g.x !== x || g.y !== y) {
      const shown = this.glidePos(g, now);
      let jump = x - shown.x;
      if (P) jump -= P * Math.round(jump / P);
      // Çok uzun sıçrama (deniz aşırı, yeniden konuşlanma) kaymaz: harita boyunca süzülmesin.
      if (Math.hypot(jump, y - shown.y) < HEX_SIZE * 14) {
        g.span = Math.max(GLIDE_MIN_MS, Math.min(GLIDE_MAX_MS, (now - g.changed) * 0.9));
        g.fx = x - jump;
        g.fy = shown.y;
        g.at = now;
      } else g.at = -1e9;
      g.changed = now;
      g.x = x;
      g.y = y;
    }
    const pos = this.glidePos(g, now);
    if (now - g.at < g.span) this.glideLive = true;
    g.out.x = pos.x;
    g.out.y = pos.y;
    return g.out;
  }

  glidePos(g, now) {
    const t = Math.min(1, Math.max(0, (now - g.at) / g.span));
    // Yumuşak kalkış ve duruş; zincirlenen adımda hız sıfıra düşmesin diye hafif.
    const e = t * t * (3 - 2 * t) * 0.6 + t * 0.4;
    return { x: g.fx + (g.x - g.fx) * e, y: g.fy + (g.y - g.fy) * e };
  }

  /** Muharebedeki yığının sınıra yaslanma payı (dünya birimi) ya da null. */
  battleLean(world, unit, tile) {
    if (!this.glideBattles) {
      this.glideBattles = new Map();
      for (const battle of world.battleSystem?.battles ?? []) this.glideBattles.set(battle.id, battle);
    }
    const battle = this.glideBattles.get(unit.battleId);
    if (!battle) return null;
    const P = world.wrapWidth || 0;
    const target = world.get(battle.q, battle.r);
    if (!target) return null;
    let dx = 0;
    let dy = 0;
    let share = BATTLE_LEAN_ATTACK;
    if (target !== tile) {
      dx = target.x - tile.x;
      dy = target.y - tile.y;
    } else {
      // Savunan: saldıranların geldiği yöne, daha az.
      if (!this.glideUnits) this.glideUnits = new Map(world.units.map((u) => [u.id, u]));
      share = BATTLE_LEAN_DEFEND;
      for (const id of battle.attackers ?? []) {
        const from = (typeof id === 'object' ? id : this.glideUnits.get(id))?.tile;
        if (!from || from === tile) continue;
        let ex = from.x - tile.x;
        if (P) ex -= P * Math.round(ex / P);
        const ey = from.y - tile.y;
        const l = Math.hypot(ex, ey) || 1;
        dx += ex / l;
        dy += ey / l;
      }
    }
    if (P) dx -= P * Math.round(dx / P);
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return null;
    return [dx / l * HEX_SIZE * share, dy / l * HEX_SIZE * share];
  }

  /**
   * Sayaç durumu, sprite'ın ÜSTÜNE (önbelleğe girmez, her hafta değişir):
   *   siper  — sol altta 1-3 toprak çizgisi (giderek kazılan mevzi)
   *   «      — geri çekiliyor (amber), Z — toparlanıyor (mavi)
   * Siper simülasyondaydı ama hiçbir yerde görünmüyordu; saldırıyı tartan
   * oyuncu "bu tümen kazılı mı" sorusunu haritada okuyamıyordu.
   */
  drawCounterState(ctx, world, stack, left, top, width, height, zoom) {
    const turn = world.turn ?? 0;
    let dig = 0;
    let retreating = false;
    let reorganizing = false;
    for (const unit of stack) {
      dig = Math.max(dig, unit.entrenchment ?? 0);
      if ((unit.retreatUntil ?? 0) > turn) retreating = true;
      else if ((unit.attackReadyAt ?? 0) > turn && !unit.battleId) reorganizing = true;
    }
    const pips = dig >= 0.25 ? 3 : dig >= 0.14 ? 2 : dig >= 0.05 ? 1 : 0;
    if (pips) {
      const pw = 6 / zoom;
      const ph = 2.2 / zoom;
      const x = left + 2 / zoom;
      for (let i = 0; i < pips; i++) {
        const y = top + height + 2.5 / zoom + i * (ph + 1.2 / zoom);
        ctx.fillStyle = 'rgba(8, 10, 12, 0.85)';
        ctx.fillRect(x - 0.8 / zoom, y - 0.8 / zoom, pw + 1.6 / zoom, ph + 1.6 / zoom);
        ctx.fillStyle = '#b48a4e';
        ctx.fillRect(x, y, pw, ph);
      }
    }
    if (!retreating && !reorganizing) return;
    const r = 6 / zoom;
    const cx = left - 1 / zoom;
    const cy = top + height / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8, 10, 12, 0.9)';
    ctx.fill();
    ctx.lineWidth = 1.2 / zoom;
    ctx.strokeStyle = retreating ? '#e7b04a' : '#8fcdef';
    ctx.stroke();
    ctx.fillStyle = retreating ? '#e7b04a' : '#8fcdef';
    ctx.font = `800 ${(9 / zoom).toFixed(2)}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(retreating ? '«' : 'Z', cx, cy + 0.4 / zoom);
  }

  /**
   * Uzak zoom icin ulus bayragi sprite'i. Bayrak tarifi prosedureldir ve
   * dokuz fillRect'e kadar cikar; 655 birimlik dunyada bunu her karede
   * cizmek sayacin kendisinden pahali olurdu. Ulus + olcek basamagi basina
   * bir kez pisip blit edilir.
   */
  flagSprite(nation, width, height) {
    if (!nation?.flag) return null;
    // unitSprite ile ayni kova mantigi: 1.25 adimli olcek basamagi.
    const bucket = Math.max(-6, Math.min(10,
      Math.round(Math.log(this.camera.zoom * this.dpr) / Math.log(1.25))));
    // Boyut da anahtarda: uzak LOD rozeti ile sayaç köşesindeki bayrak çipi
    // farklı ölçüde ister; aynı anahtarla küçüğü büyüğe gerilip bulanıyordu.
    const key = `${nation.id}|${bucket}|${Math.round(width)}x${Math.round(height)}`;
    this.flagSprites ??= new Map();
    const hit = this.flagSprites.get(key);
    if (hit) return hit;

    const scale = Math.pow(1.25, bucket);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil(width * scale));
    canvas.height = Math.max(2, Math.ceil(height * scale));
    const ctx = canvas.getContext('2d');
    ctx.scale(canvas.width / width, canvas.height / height);
    drawFlag(ctx, nation.flag, 0, 0, width, height);
    this.flagSprites.set(key, canvas);
    return canvas;
  }

  /**
   * Uzak zoom rozeti: bayrak, çerçeve ve temas gölgesi tek sprite. Eskiden her karede üç ayrı
   * dikdörtgen basılıyordu (kaydırılmış koyu blok, düz kırmızı kutu, bayrak) ve rozet haritaya
   * yapıştırılmış bir çıkartma gibi duruyordu. Çerçeve künyenin malzemesidir: kendi/müttefik
   * ince pirinç, düşman kızıl emaye (pirinç kıl payıyla). Ulus + taraf + ölçek kovası başına pişer.
   */
  farBadge(nation, side, width, height) {
    const bucket = Math.max(-6, Math.min(10,
      Math.round(Math.log(this.camera.zoom * this.dpr) / Math.log(1.25))));
    const hostile = side === 'hostile';
    const key = `${nation.id}|${hostile ? 1 : 0}|${bucket}|${Math.round(width)}x${Math.round(height)}`;
    this.farBadges ??= new Map();
    let badge = this.farBadges.get(key);
    if (badge) return badge;
    const scale = Math.pow(1.25, bucket);
    const px = 1 / scale;
    const pad = Math.max(4 * px, height * 0.32);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(2, Math.ceil((width + pad * 2) * scale));
    canvas.height = Math.max(2, Math.ceil((height + pad * 2) * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(canvas.width / (width + pad * 2), canvas.height / (height + pad * 2));
    ctx.translate(pad, pad);
    // Düşman çerçevesi bayrağın DIŞINA taşar: bayrak kimliğini yemez.
    const ring = hostile ? Math.max(2.3 * px, height * 0.21) : Math.max(1 * px, height * 0.075);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 2.4;
    ctx.shadowOffsetY = 1.1;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(-ring, -ring, width + ring * 2, height + ring * 2);
    ctx.restore();
    const frame = ctx.createLinearGradient(0, -ring, 0, height + ring);
    if (hostile) {
      frame.addColorStop(0, '#e05a3e');
      frame.addColorStop(0.55, '#c23a26');
      frame.addColorStop(1, '#8c2416');
    } else {
      frame.addColorStop(0, '#f2d894');
      frame.addColorStop(0.5, '#c39646');
      frame.addColorStop(1, '#7d5a26');
    }
    ctx.fillStyle = frame;
    ctx.fillRect(-ring, -ring, width + ring * 2, height + ring * 2);
    if (hostile) {
      // Emayeyi tutan pirinç kıl payı: düz kırmızı kutu değil, çerçevelenmiş levha.
      ctx.lineWidth = px * 0.9;
      ctx.strokeStyle = 'rgba(226, 190, 118, 0.55)';
      ctx.strokeRect(-ring + px * 0.45, -ring + px * 0.45, width + ring * 2 - px * 0.9, height + ring * 2 - px * 0.9);
    }
    const flag = this.flagSprite(nation, width, height);
    if (flag) ctx.drawImage(flag, 0, 0, width, height);
    else {
      ctx.fillStyle = '#131a20';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = this.nationBand(nation);
      ctx.fillRect(0, 0, width, height * 0.3);
    }
    ctx.lineWidth = px * 0.8;
    ctx.strokeStyle = 'rgba(10, 6, 2, 0.7)';
    ctx.strokeRect(px * 0.4, px * 0.4, width - px * 0.8, height - px * 0.8);
    badge = { canvas, pad };
    if (this.farBadges.size > 600) this.farBadges.clear();
    this.farBadges.set(key, badge);
    return badge;
  }

  /** Sayaç sprite önbelleği; anahtar görsel durumun tamamını taşır. */
  unitSprite(unit, nation, stackLen, selected, side = null, zoomEff = this.camera.zoom, men = null) {
    // Zoom kovası: sprite 1.25 adımlı ölçek basamağında pişer, ara zoomlarda
    // blit ölçeklenir (≤%12 sapma — durağan kartta okunur fark bırakmıyor).
    // Kova ETKİN zoomdan: tavanlı sayaç o zoomun çizgi kalınlığıyla pişer.
    const bucket = Math.max(-6, Math.min(10,
      Math.round(Math.log(zoomEff * this.dpr) / Math.log(1.25))));
    const strengthQ = Math.round(
      20 * Math.max(0, Math.min(1, unit.hp / Math.max(1, maxHpOf(unit)))),
    );
    const orgQ = Math.round(Math.max(0, Math.min(100, organizationOf(unit))) / 5);
    // Yığının TOPLAM mevcudu (Kerem: "ünitenin her zaman 30k yazması mantıksız"); anahtara girer.
    const soldiers = compactMen(men ?? menUnderArms(unit));
    // KIMIN ORDUSU: kunye cercevesi bunu soyler. Ulus rengi seridi tek basina
    // yetmiyordu — elli beş ulusun paleti birbirine yakin ve oyuncu kendi
    // birimini dusmanininkinden ayiramiyordu (kullanici bildirimi).
    const allegiance = side ?? this.sideOf(this.viewWorld, unit.nationId, this.playerNationId);
    const key = `${bucket}|${nation.id}|${unit.type.id}|${soldiers}|${strengthQ}|${orgQ}|`
      + `${unit.battleId ? 1 : 0}|${selected ? 1 : 0}|${stackLen}|${unit.order?.type ?? ''}|`
      + `${unitPlates.size}|${allegiance}|${unitSkinStamp()}`;
    this.unitSprites ??= new Map();
    const shown = (this.shownSprites ??= new WeakMap());
    let sprite = this.unitSprites.get(key);
    if (sprite) {
      shown.set(unit, sprite);
      return sprite;
    }
    // PİŞİRME BÜTÇESİ. Zoom kovası değişince ya da hafta kapanınca (mevcut, düzen) ekrandaki
    // bütün sayaçların anahtarı birden değişir ve hepsi aynı karede pişiyordu (ölçüldü: 8x
    // akışta hafta başına ~20 ms'lik sıçrama). Bütçe dolunca birim bir kare daha önceki
    // sprite'ıyla basılır: ölçü dünya biriminde, eski kova yalnız çözünürlük farkıdır.
    // Kalanlar sonraki karelerde pişer, kare zinciri borç bitince kendiliğinden durur.
    const last = shown.get(unit);
    if (last && this.spriteBakeMs >= SPRITE_BAKE_BUDGET_MS) {
      this.spriteDebt = true;
      return last;
    }
    const bakeStart = performance.now();
    sprite = this.paintCounterSprite(Math.pow(1.25, bucket), {
      nation,
      allegiance,
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
    shown.set(unit, sprite);
    this.spriteBakeMs = (this.spriteBakeMs ?? 0) + performance.now() - bakeStart;
    return sprite;
  }

  /**
   * Sayacın kendisini (0,0) çapasına pişirir; drawUnitCounters blit eder.
   *
   * KÜNYE ARAYÜZÜN MALZEMESİDİR (2026-11-23, Kerem: "dandik", "düşük kaliteli png"): gövde
   * tarafın emayesi, çerçeve pirinç (assets/ui/skin, unitSkin.js), kol simgesi emayeye gömülü
   * pirinç. Eskiden siyah zeminli levha resmi basılıyor, taraf pirinç simgeyi 'color'
   * karışımıyla düz yeşil/kırmızı çizgiye boyuyor, sayı ve çubuklar simgenin çizgilerinin
   * üstüne biniyordu. Şimdi üç bölge ayrı: üstte bayrak + mevcut, ortada simge, altta yuva.
   * Taraf gövdeden okunur (yeşil/mavi/kırmızı emaye, üçüncü taraf koyu deri); düşman
   * ayrıca köşesi kesik kalır.
   */
  paintCounterSprite(scale, spec) {
    const width = HEX_SIZE * 1.56;
    const height = HEX_SIZE * 1.08;
    // Pay gölgeyi, yığın etiketini ve çerçeve taşmalarını kapsar.
    const margin = HEX_SIZE * 0.34;
    const w = width + margin * 2;
    const h = height + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(w * scale));
    canvas.height = Math.max(1, Math.ceil(h * scale));
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.scale(scale, scale);
    ctx.translate(margin, margin);
    // Çizgi kalınlıkları ekranda sabit kalsın: kovanın temsil ettiği zoom.
    const zoom = Math.max(0.2, scale / this.dpr);
    // Bir AYGIT pikseli (dünya biriminde): saç çizgisi bundan incelmez.
    const px = 1 / scale;
    // Mevcut yazısı ancak sayaç ~30 px'i geçince okunur; altında yazı yeri boş kalır, bayrak
    // ile simge yan yana büyür (zoom 0.6'da üç katman üst üste bulamaç gibi okunuyordu).
    const detailed = zoom > 0.75;
    const { nation, strength, organization } = spec;
    const side = spec.allegiance ?? 'other';
    const rim = Math.max(1.3 * px, height * 0.075);
    paintPlaque(ctx, {
      x: 0, y: 0, w: width, h: height, side, selected: spec.selected, rim, cut: height * 0.24, px,
    });

    // Bayrak "kimin ordusu"nu, emaye "hangi taraf"ı söyler; ikisi aynı yerde yarışmaz.
    const fh = height * (detailed ? 0.22 : 0.3);
    const fw = fh * 1.5;
    const fx = rim + height * (spec.allegiance === 'hostile' ? (detailed ? 0.2 : 0.12) : 0.07);
    const fy = detailed ? rim + height * 0.06 : height * 0.4 - fh / 2;
    const flag = this.flagSprite(nation, fw, fh);
    if (flag) paintFlagChip(ctx, flag, fx, fy, fw, fh, px);

    // Yığın etiketi sağ üst köşeye çakılı; mevcut onun SOLUNA yaslanır.
    // Etiket province'teki tümen sayısıdır ve uzakta da okunmalı (Kerem: "3 daha görünür
    // olsun"): eskiden sayacın üçte biri boyundaydı, rakam 4-5 px'e iniyordu.
    const tabH = height * 0.5;
    const tabW = tabH * 1.0;
    const tabX = width - tabW * 0.62;
    const tabY = -tabH * 0.42;
    if (detailed) {
      const right = spec.stackLen > 1 ? tabX - height * 0.06 : width - rim - height * 0.08;
      paintLabel(ctx, spec.soldiers, right, fy + fh / 2 + px * 0.3,
        `800 ${(height * 0.25).toFixed(2)}px ${FONT_UI}`, px);
    }

    // Kol simgesi emayeye gömülü pirinç: kara kolu tel NATO simgesi (unitSkin.drawNatoInlay),
    // gemiler levha resminin dolu silueti (ince tel yok, küçülünce de okunur).
    // Simge sayacın asıl bilgisidir (Kerem: "30K'da ünite simgesi minnacık"): ayrıntılı
    // kademede de üst satırla çubuk yuvası arasındaki bütün boyu alır.
    const symH = height * (detailed ? 0.37 : 0.42);
    const symY = height * (detailed ? 0.555 : 0.4);
    const symX = detailed ? width / 2 : width * 0.62;
    const symbol = NAVAL_PLATE.has(spec.typeId) ? brassSymbol(unitPlates.get(spec.typeId), spec.typeId) : null;
    if (symbol) drawInlay(ctx, symbol, symX, symY, symH * 1.2, px);
    // Pirinç tel yalnız yakın zoomda okunur; altında simge kalın fildişidir.
    else drawNatoInlay(ctx, spec.typeId, symX, symY, symH, px, { bold: zoom < 1.5 });

    // STR ve ORG iki ayrı durum çubuğudur; her zaman görünür.
    const barH = Math.max((detailed ? 1.2 : 1) * px, height * (detailed ? 0.058 : 0.05));
    const gap = Math.max((detailed ? 0.8 : 0.6) * px, height * 0.02);
    const barLeft = rim + height * 0.12;
    const barWidth = width - 2 * barLeft;
    const barTop = height - rim - barH * 2 - gap - Math.max(px * 0.8, barH * 0.35) - height * 0.03;
    paintBars(ctx, barLeft, barTop, barWidth, barH, gap, strength, organization, px);

    if (spec.order && detailed) {
      ctx.fillStyle = '#f2dfae';
      drawOrderBadge(ctx, spec.order, rim + height * 0.2, symY, height * 0.26);
    }

    if (spec.stackLen > 1) {
      paintStackTab(ctx, tabX, tabY, tabW, tabH, spec.stackLen,
        `900 ${(tabH * 0.8).toFixed(2)}px ${FONT_UI}`, px);
    }
    return { canvas, margin, w, h };
  }


  /** Province muharebesi: çatışma yerinde iki ordunun asker ve moral durumu. */
  drawBattles(ctx, world, rect) {
    const battles = world.battleSystem?.battles;
    this.battlePins = new Map();
    if (!battles?.length) return;
    const zoom = this.camera.zoom;
    const unitById = new Map(world.units.map((army) => [army.id, army]));
    const P = world.wrapWidth;

    for (const battle of battles) {
      const tile = world.get(battle.q, battle.r);
      if (!tile) continue;
      const x = tile.x;
      const y = tile.y - HEX_SIZE * 0.8;
      if (x < rect.minX || x > rect.maxX || y < rect.minY || y > rect.maxY) continue;
      const U = this.upright;
      if (U && !U.pin(ctx, tile.x, tile.y)) continue;

      const odds = this.battleOdds(world, battle);
      // Kuşatma: savunulan province'te tahkimat varsa mermi amblemi.
      const siege = (tile.province?.fort ?? 0) > 0;
      // SALDIRI YÖNÜ (HOI4): saldıran karelerden hedefe ortalama yön. İğne iki karenin
      // sınırına, saldıranın yanına oturur ve ucu hedefe bakar.
      let dx = 0;
      let dy = 0;
      for (const id of battle.attackers ?? []) {
        const from = unitById.get(id)?.tile;
        if (!from || from === tile) continue;
        let ex = tile.x - from.x;
        if (P) ex -= P * Math.round(ex / P);
        const ey = tile.y - from.y;
        const l = Math.hypot(ex, ey) || 1;
        dx += ex / l;
        dy += ey / l;
      }
      const dl = Math.hypot(dx, dy);
      const dir = dl > 0.01 && !U ? [dx / dl, dy / dl] : [0, 1];
      const at = U ? [x, y] : [tile.x - dir[0] * HEX_SIZE * 0.7, tile.y - dir[1] * HEX_SIZE * 0.7];
      this.battlePins.set(battle.id, { x: at[0], y: at[1] });
      this.drawBattleBalloon(ctx, at[0], at[1], zoom, odds, battle, siege, dir);
    }
  }

  /**
   * Muharebenin gidişatı 0-100: örgütlenme dengesi ve güç oranının yarı yarıya
   * karışımı, oyuncunun tarafından (oyuncu yoksa saldıranınki). battleView
   * zar çekmez; sonuç muharebe turu değişene dek önbellekte kalır.
   */
  battleOdds(world, battle) {
    this.oddsMemo ??= new Map();
    const key = `${this.playerNationId}:${battle.id}:${battle.rounds}:${battle.attackers?.length}:${battle.defenders?.length}`;
    const hit = this.oddsMemo.get(battle.id);
    if (hit?.key === key) return hit.odds;
    const view = battleView(world, battle, this.playerNationId);
    const ao = view.attacker?.organization ?? 0;
    const doo = view.defender?.organization ?? 0;
    const orgShare = ao + doo > 0 ? ao / (ao + doo) : 0.5;
    const ratio = Number.isFinite(view.ratio) ? view.ratio : 1;
    let p = 0.5 * orgShare + 0.5 * (ratio / (1 + ratio));
    if (view.mine === 'defender') p = 1 - p;
    const odds = { p: Math.max(0, Math.min(1, p)), mine: view.mine };
    if (this.oddsMemo.size > 400) this.oddsMemo.clear();
    this.oddsMemo.set(battle.id, { key, odds });
    return odds;
  }

  /**
   * MUHAREBE BALONU (HOI4). Eskiden karenin üstünde 74 px'lik "59K : 28K" levhası
   * duruyordu ve birimlerin levhalarını örtüyordu. Şimdi karenin üst köşesinde küçük
   * bir balon: halka gidişatı (oyuncu için yeşil kazanıyor, kırmızı kaybediyor), içinde
   * yüzde; kuyruğu muharebe karesini gösterir. Tıklanınca muharebe penceresi açılır.
   */
  drawBattleBalloon(ctx, x, y, zoom, odds, battle, siege = false, dir = [0, 1]) {
    // HOI4 İĞNESİ: emaye iğne (Kerem'in ChatGPT sayfası), ucu SALDIRI YÖNÜNE döner; renk
    // kimin kazandığı (oyuncu için yeşil kazanıyor, kehribar başa baş, kırmızı kaybediyor;
    // başkalarının muharebesi gri). Oyukta gidişat sayısı. Boy ekranda sabit.
    const u = 1 / zoom;
    const grow = Math.max(0, Math.min(1, (zoom - 0.3) / 0.7));
    // Oyuk sayıyı taşıyacak boyda: eskiden 6-10 px'lik oyukta amblem, sayı altta 9 px'lik
    // ayrı bir yuvadaydı ve okunmuyordu (Kerem: "minnacık yazıyor").
    let well = (9 + 4 * grow * grow * (3 - 2 * grow)) * u;
    // Üzerine gelince büyür, basınca kısa bir çökme (tıklama hissi).
    const hover = this.hoverBattleId === battle.id;
    const press = this.pressBattle?.id === battle.id ? (performance.now() - this.pressBattle.t) / 240 : 1;
    if (hover) well *= 1.14;
    if (press < 1) {
      well *= 0.86 + 0.14 * press;
      this.onPlatesReady?.();
    }
    const pct = Math.round(odds.p * 100);
    const color = odds.mine == null ? 'grey' : pct >= 55 ? 'green' : pct >= 45 ? 'amber' : 'red';
    const ring = { green: '#6fcf5a', amber: '#f0b53a', red: '#e8503a', grey: '#9aa4a8' }[color];
    const art = warEmblem(`pin-${color}`, () => this.onPlatesReady?.());
    const angle = Math.atan2(dir[1], dir[0]);
    ctx.save();
    // Büyük resimden küçültme yüksek kalitede: varsayılan 'low' iğneyi pikselli gösteriyordu.
    ctx.imageSmoothingQuality = 'high';
    if (hover) {
      ctx.beginPath();
      ctx.arc(x, y, well * 1.75, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 236, 190, 0.18)';
      ctx.fill();
    }
    if (art) {
      const S = well / PIN_ART.well;
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetY = 1.5;
      ctx.drawImage(art, -PIN_ART.cx * S, -PIN_ART.cy * S, S, S);
    } else {
      // Resim yüklenene dek: aynı biçimde düz damla.
      const R = well * 1.6;
      const L = R * 2.2;
      const t = Math.acos(Math.min(0.999, R / L));
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(L, 0);
      ctx.lineTo(Math.cos(t) * R, Math.sin(t) * R);
      ctx.arc(0, 0, R, t, -t, false);
      ctx.closePath();
      ctx.fillStyle = ring;
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    // Oyuğun koyu zemini sayıyı iğnenin emayesinden ayırır. Amblem kalktı; kuşatma bilgisi
    // kesik halkada kalır.
    ctx.beginPath();
    ctx.arc(x, y, well * 0.98, 0, Math.PI * 2);
    ctx.fillStyle = '#0d1114';
    ctx.fill();
    ctx.lineWidth = 1.3 * u;
    ctx.strokeStyle = ring;
    if (siege) ctx.setLineDash([2.2 * u, 1.6 * u]);
    ctx.stroke();
    ctx.setLineDash([]);
    const size = well * (pct === 100 ? 0.98 : 1.28);
    ctx.font = `800 ${size.toFixed(2)}px ${FONT_UI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#f6ecd2';
    ctx.fillText(String(pct), x, y + size * 0.06);
    ctx.restore();
  }

  drawHighlight(ctx, tile, color, width) {
    const path = new Path2D();
    if (this.mesh) this.cellPath(path, this.mesh.world, tile);
    else this.hexPath(path, tile.x, tile.y);
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
  /**
   * Verilen kolondan `dir` yönünde kaç hex denize taşınabilir.
   *
   * Su ve kendi toprağımız geçilir, yabancı toprakta durulur. Tavan çağıran
   * yerden gelir: daha fazlası adı kıyıdan koparıp açık denize düşürür.
   */
  seaRun(world, same, row, col, dir, reach = 3) {
    if (col == null) return 0;
    let n = 0;
    for (let i = 1; i <= reach; i++) {
      const tile = world.tileAt(col + dir * i, row);
      if (!tile) break;
      if (!tile.terrain.water && !same(tile)) break;
      n = i;
    }
    return n;
  }

  /**
   * Kültür kipinin ad birimleri: aynı halkın kara komşuluğuyla bitişik kütleleri.
   * Halk denizle bölünebildiği için ülke gibi tek ad almaz; her anlamlı kütle
   * kendi adını taşır, kırıntılar (en büyük kütlenin %15'i altı) yazılmaz.
   */
  cultureBlobs(world) {
    const blobOf = new Map();
    const blobs = [];
    for (const start of world.tiles) {
      if (!start || start.terrain.water || start.culture < 0 || blobOf.has(start)) continue;
      const id = blobs.length;
      const part = [start];
      blobOf.set(start, id);
      for (let head = 0; head < part.length; head++) {
        for (const next of world.neighbors(part[head])) {
          if (next.terrain.water || next.culture !== start.culture || blobOf.has(next)) continue;
          blobOf.set(next, id);
          part.push(next);
        }
      }
      blobs.push({ culture: start.culture, n: part.length, ref: start });
    }
    const largest = new Map();
    for (const blob of blobs) largest.set(blob.culture, Math.max(largest.get(blob.culture) ?? 0, blob.n));
    for (const blob of blobs) blob.named = blob.n >= CULTURE_LABEL_MIN_HEXES && blob.n >= largest.get(blob.culture) * 0.15;
    return { blobOf, blobs };
  }

  buildLabelLayout(world) {
    const P = world.wrapWidth || 0;
    const acc = new Map();
    // Kültür kipinde ad birimi ülke değil halk kütlesidir; yerleşim aynı kalır.
    const peoples = this.mapMode === 'cultures' ? this.cultureBlobs(world) : null;
    const groupOf = peoples
      ? (tile) => {
        const id = peoples.blobOf.get(tile) ?? -1;
        return id >= 0 && peoples.blobs[id].named ? id : -1;
      }
      : (tile) => ownerOf(tile, world);
    for (const t of world.tiles) {
      if (!t || t.terrain.water) continue;
      const owner = groupOf(t);
      if (owner < 0) continue;
      let a = acc.get(owner);
      if (!a) {
        a = { n: 0, sx: 0, sy: 0, sxx: 0, syy: 0, sxy: 0, rows: new Map() };
        acc.set(owner, a);
      }
      const cap = peoples ? peoples.blobs[owner].ref : world.nations[owner].capital;
      let dx = t.x - cap.x;
      if (P) dx -= P * Math.round(dx / P);
      const x = cap.x + dx;
      a.n++;
      a.sx += x; a.sy += t.y;
      a.sxx += x * x; a.syy += t.y * t.y; a.sxy += x * t.y;
      let r = a.rows.get(t.row);
      if (!r) {
        r = { y: t.y, row: t.row, xs: [], cols: new Map() };
        a.rows.set(t.row, r);
      }
      r.xs.push(x);
      // Denize taşma payı için kolon gerekir: dizi uçlarından dışarı doğru
      // yürünüp su karesi mi yabancı toprak mı olduğuna bakılır.
      r.cols.set(x, t.col);
    }

    const list = [];
    for (const [owner, a] of acc) {
      const cultureId = peoples ? peoples.blobs[owner].culture : null;
      const nation = peoples ? world.cultures[cultureId] : world.nations[owner];
      if (!nation) continue;
      const same = (tile) => groupOf(tile) === owner;
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
        const run = widestRun(r.xs);
        if (!run) continue;
        if (run.count < 2 && a.n > 6) continue;
        const score = run.width - Math.abs(r.y - my) * 1.35;
        if (score > bandScore) {
          bandScore = score;
          band = { ...run, y: r.y, row: r.row, cols: r.cols };
        }
      }
      // Denize taşma payı. Ad başka ÜLKEYE değmemeli; denize taşması ise
      // atlasın kendi âdetidir ve kıyı ülkelerinin adını okunur tutar. Dizinin
      // iki ucundan dışarı yürünür, su geçilir, yabancı toprakta durulur.
      // Pay dizinin kendi boyuyla da sınırlı: iki hexlik bir ülke üç hexlik
      // deniz payı alıp adını açık denize taşımasın.
      let landMin = 0;
      let landMax = 0;
      if (band) {
        landMin = band.min;
        landMax = band.max;
        const reach = Math.min(3, Math.ceil(band.count / 2));
        band.min -= this.seaRun(world, same, band.row, band.cols.get(band.min), -1, reach) * HEX_STEP;
        band.max += this.seaRun(world, same, band.row, band.cols.get(band.max), 1, reach) * HEX_STEP;
      }
      const bx = band ? (landMin + landMax) / 2 : mx;
      const by = band ? band.y : my;
      // Çapa KENDİ toprağımızda kalmalı. Ağırlık merkezi harmanı atlas hissi
      // verir ama L biçimli ya da dağınık ülkelerde çapayı komşunun içine
      // sürükleyebiliyor — ölçüldü: bir ülkenin adı bütünüyle komşusunun
      // üstüne düşüyordu. Harman kara dizisine, dikeyde de bant satırına
      // kenetlenir.
      const x = band
        ? Math.max(landMin, Math.min(landMax, bx * 0.62 + mx * 0.38))
        : mx;
      const y = band
        ? Math.max(by - HEX_SIZE * 0.75, Math.min(by + HEX_SIZE * 0.75, by * 0.62 + my * 0.38))
        : my;

      // Kullanılabilir genişlik, DÜNYA biriminde ve ÇAPANIN ETRAFINDA simetrik.
      //
      // Yazı çapada ortalanır, dolayısıyla kullanılabilir en, iki yandan kısa
      // olanın iki katıdır — çapa bandın ortasından kaydığı için bandın tam
      // eni yanıltıcıdır. min/max hex MERKEZLERİdir; gerçek toprak her uçta
      // yarım hex daha uzanır, o yüzden yarım adım eklenir.
      //
      // Eski hesap `max(bantEni, yayılım * 2.6)` idi: yayılım terimi derli
      // toplu ülkelerde bandı iki katına çıkarıyor ve ad komşuya taşıyordu.
      // Çapa ağırlık merkezine doğru harmanlandığı için bandın DIŞINA düşebilir;
      // o zaman simetrik pay eksiye iner ve sığdırma katsayısı negatif olurdu.
      // Taban bir hex: ad ya oraya sığar ya da hiç yazılmaz.
      const spread = Math.sqrt(Math.max(cxx, cyy));
      const avail = Math.max(HEX_STEP, band
        ? 2 * Math.min(x - band.min, band.max - x) + HEX_STEP
        : spread * 1.4);

      const name = nation.name.toUpperCase();
      // Büyük ülke büyük yazılır. Sığdırma BURADA yapılmaz: kutunun ekrandaki
      // eni zoom'a bağlıdır, yerleşim ise zoomdan bağımsız kurulur (bkz.
      // drawLabels — punto ve harf aralığı orada `avail * zoom`a göre kısılır).
      const size = Math.max(11, Math.min(32, 8.5 + Math.sqrt(a.n) * 1.15));
      list.push({
        x, y, tilt, size, spacing: size * 0.12, avail, vertical,
        name, flag: peoples ? null : nation.flag, priority: a.n,
        key: peoples ? `c${owner}` : name, culture: cultureId,
      });
    }
    list.sort((a, b) => b.priority - a.priority);
    return list;
  }

  /**
   * Metin genişliği: ada 100px referansında bir kez ölçülür, boyutla ölçeklenir.
   *
   * Ölçüm çizim durumunu KİRLETMEZ — eskiden kirletiyordu ve haftalardır
   * şikâyet edilen "adların bir kare dev olup küçülmesi" hatası buydu:
   *
   *   1. Önbellekte olmayan bir ad ölçülürken ctx.font 100px referansa
   *      çekiliyor ve öyle bırakılıyordu.
   *   2. State adları döngüsü fontu döngüden ÖNCE bir kez kuruyor (kare başına
   *      tek atama, bilinçli bir perf kararı).
   *   3. Sonuç: ilk kez ölçülen ad ve ondan SONRAKİ bütün state adları o kare
   *      10.5px yerine 100px çiziliyordu. Ertesi kare ölçüm önbellekte olduğu
   *      için her şey normale dönüyordu.
   *
   * Yeni ad ne zaman görünür? Kamera kaydırınca. Bu yüzden hata tam olarak
   * sağa-sola kaydırırken, tek karelik bir parlama gibi görünüyordu (ölçüldü:
   * önbellek boşaltılan karede 96 yazının 39'u 100px çizildi).
   *
   * Harf aralığı da ölçüm sırasında sıfırlanır: measureText onu genişliğe
   * katıyor, oysa çağıran taraf aralığı ayrıca ekliyor (bkz. state döngüsü).
   */
  measureLabel(ctx, refFont, text) {
    this.measureCache ??= new Map();
    const key = refFont + '|' + text;
    let w = this.measureCache.get(key);
    if (w === undefined) {
      const font = ctx.font;
      const spacing = ctx.letterSpacing;
      const hasSpacing = typeof spacing === 'string';
      ctx.font = refFont;
      if (hasSpacing) ctx.letterSpacing = '0px';
      w = ctx.measureText(text).width;
      if (hasSpacing) ctx.letterSpacing = spacing;
      ctx.font = font;
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
    const peopleLabels = this.mapMode === 'cultures';
    if (!this.labelLayout || this.labelLayout.world !== world
      || this.labelLayout.peoples !== peopleLabels
      || (this.labelsDirty && gestureIdle
        && performance.now() - (this.labelLayoutAt ?? 0) > 700)) {
      this.labelLayout = { world, peoples: peopleLabels, list: this.buildLabelLayout(world) };
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
    // Çapa gerçekten yer değiştirdi mi? Ölçü DÜNYA koordinatındadır, ekran
    // koordinatı değil.
    //
    // Ekranla ölçülüyordu ve bu yanlıştı: kaydırma, zoom ve sarmal temsilci
    // değişimi etiketin ekran x'ini meşru şekilde oynatır, dünya çapasını
    // oynatmaz. Sonuç sahte alarmdı — 60 karelik hızlı kaydırmada 174 kez
    // "ışınlandı" denip görünen yazılar tam alfadan sıfıra kesiliyordu
    // (ölçüldü). Patlamanın kaynağı buydu.
    //
    // Gerçek ışınlanma tek durumda olur: yerleşim yeniden kurulduğunda bir
    // ülkenin ağırlık merkezi fetihle kayar. Dünya ölçüsü yalnız onu yakalar.
    // Eşik yarım ekran genişliğinin dünya karşılığıdır; sarmalda periyoda
    // normalize edilir, yoksa dikişin iki yakası hep sıçrama sayılır.
    this.labelPos ??= new Map();
    const P = world.wrapWidth || 0;
    const jumpLimit = cam.viewWidth * 0.5 / cam.zoom;
    const anchorJump = (key, worldX) => {
      const last = this.labelPos.get(key);
      this.labelPos.set(key, worldX);
      if (last === undefined) return;
      let d = worldX - last;
      if (P) d -= P * Math.round(d / P);
      if (Math.abs(d) > jumpLimit) this.labelAlpha.set(key, 0);
    };
    // Ekrana düşen sarmal kopyaların x'leri, kameraya en yakını başta. Periyot
    // ekrandan dar olduğunda (geniş ekran, uzak zoom) harita aynı çapayı birden
    // çok yerde çizer; yalnız en yakınını yazmak tekrarlanan bandı adsız
    // bırakıyordu. Birincil kopya erime/çarpışma kararını verir, diğerleri
    // aynı alfayla ve yalnız yer varsa basılır. Dizi yeniden kullanılır: kare
    // başına yüzlerce çağrı çöp üretmesin.
    const copyStep = P * z;
    const copyXs = (this.labelCopyXs ??= []);
    // kr: eğik kamerada çapa derinliğinin ölçeği (worldToScreen'in p.kr'si);
    // derinlik x'ten bağımsız olduğundan kopyalar aynı satırda kr × adımla dizilir.
    const copiesOf = (x, margin, kr = 1) => {
      copyXs.length = 0;
      const hi = cam.viewWidth + margin;
      const step = copyStep * kr;
      if (x >= -margin && x <= hi) copyXs.push(x);
      if (step > 0) {
        for (let c = x - step; c >= -margin; c -= step) if (c <= hi) copyXs.push(c);
        for (let c = x + step; c <= hi; c += step) if (c >= -margin) copyXs.push(c);
      }
      return copyXs;
    };
    // Eğik kamerada yazı çapasının çevresinde p.k kadar ölçeklenir (uzak
    // yamaçta küçük, önde büyük; sınırlı). Düz kamerada p.k yok, dönüşüme
    // dokunulmaz.
    const dpr = this.dpr;
    const around = (k, x, y) => {
      if (k !== undefined) ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * x * (1 - k), dpr * y * (1 - k));
    };

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Görsel stil yazı mürekkebini değiştirebilir (açık kâğıt zeminde açık
    // renkli ad okunmuyor); stil yoksa aşağıdaki değerler birebir klasik.
    const ink = this.gfx.style?.labelInk ?? null;

    // --- 1. Ülke adları ---
    // Haritaya gömülü his: boyut zoomla birlikte hafifçe büyür (sabit ekran
    // boyu HUD yazısı gibi duruyordu) ama 0.8–1.2 bandında kalır.
    const zScale = 0.8 + 0.4 * Math.min(1, z);
    // Yakında ülke adı TAMAMEN söner (Paradox düzeni): 1.6 zoomda bile %55
    // alfayla başkentin, sayaçların ve state adlarının üstünden geçiyordu.
    // Yakında kimliği state adları, bayraklar ve sınır rengi verir.
    const countryAlpha = z <= 0.85 ? 1 : Math.max(0, 1 - (z - 0.85) / 0.45);
    const countryFont = `600 100px ${FONT_DISPLAY}`;
    const heatCulture = peopleLabels ? this.cultureHighlight ?? null : null;
    for (const L of this.labelLayout.list) {
      const key = 'n' + L.key;
      // Halk adı yakında da kalır (o kipte kimliği başka hiçbir şey vermez);
      // ısı haritası açıkken yalnız seçili halk konuşur.
      const groupAlpha = !peopleLabels ? countryAlpha
        : heatCulture == null || heatCulture === L.culture ? 1 : 0;
      if (groupAlpha <= 0 && !this.labelAlpha.has(key)) continue;
      const w100 = this.measureLabel(ctx, countryFont, L.name);
      const cos = Math.abs(Math.cos(L.tilt));
      const sin = Math.abs(Math.sin(L.tilt));
      // Nefes payı: kutular birbirine değebildiğinde iki komşu ülkenin adı
      // tek kelime gibi okunuyordu (CORMARK+TURLAND). Yatayda yarım harf,
      // dikeyde çeyrek satır tampon.
      const boxWidth = (s, sp) => cos * ((w100 * s) / 100 + sp * L.name.length) + sin * s + s;

      // SIĞDIRMA. Ülkenin o bandaki eni dünya birimindedir, yazı ise ekran
      // pikseliyle ölçülür; ikisini ancak zoom bağlar. Sığdırma eskiden
      // yerleşimde, yani zoom bilinmeden yapılıyordu — bu yüzden ölçü yalnız
      // zoom=1'de doğruydu ve uzaklaştıkça ad ülkeyi taşıp komşuya giriyordu
      // (ölçüldü: zoom 0.35'te adların %64'ü yabancı toprağa düşüyordu).
      const availPx = L.avail * z;
      let size = L.size * zScale;
      let spacing = L.spacing * zScale;
      const need = boxWidth(size, spacing);
      if (need > availPx) {
        // Punto ve harf aralığı AYNI oranda iner: dizgi orantısı bozulmasın.
        const k = availPx / need;
        size *= k;
        spacing *= k;
      } else {
        // Bolluk varsa harf aralığı açılıp ad ülkenin enine yayılır (atlas
        // dizgisi) — ama kutu ülkeyi yine aşmaz.
        const room = availPx * 0.82 - need;
        if (room > 0) {
          spacing = Math.min(size * 0.62, spacing + room / (cos * Math.max(1, L.name.length)));
        }
      }
      // Sığdırma sonrası okunmaz kalıyorsa ad hiç yazılmaz: Paradox düzeninde
      // de sığmayan ad küçültülmez, gizlenir ve yakınlaşınca gelir.
      if (size < 8) {
        this.labelAlpha.delete(key);
        continue;
      }
      const p = cam.worldToScreenWrapped(L.x, L.y);
      if (p.k !== undefined) {
        size *= p.k;
        spacing *= p.k;
      }
      const w = (w100 * size) / 100 + spacing * L.name.length;
      const xs = copiesOf(p.x, w, p.kr);
      if (!xs.length || p.y < -50 || p.y > cam.viewHeight + 50) {
        // Ekran dışı: alfa sıfırlanır ki dönüşte içeri "erirken" girsin.
        this.labelAlpha.delete(key);
        continue;
      }
      p.x = xs[0];
      const pad = size * 0.5;
      const bw = cos * w + sin * size + pad * 2;
      const bh = sin * w + size * 1.15 + pad * 0.6;
      const rx = p.x - bw / 2;
      const ry = p.y - bh / 2;
      // Küçük ulus keskin eşikte değil 8.5-10 px bandında erir.
      const sizeFactor = ramp(size, 8.5, 10);
      anchorJump(key, L.x);
      const fits = groupAlpha > 0 && sizeFactor > 0.04 && admits(key, rx, ry, bw, bh);
      if (fits) placed.push({ x: rx, y: ry, w: bw, h: bh });
      const a = fade(key, fits ? groupAlpha * sizeFactor : 0);
      if (a <= 0.01) continue;

      for (let i = 0; i < xs.length; i++) {
        const px = xs[i];
        if (i > 0) {
          if (collides(px - bw / 2, ry, bw, bh)) continue;
          placed.push({ x: px - bw / 2, y: ry, w: bw, h: bh });
        }
        ctx.save();
        ctx.translate(px, p.y);
        ctx.rotate(L.tilt);
        ctx.globalAlpha = a;
        ctx.font = `600 ${size.toFixed(1)}px ${FONT_DISPLAY}`;
        ctx.letterSpacing = spacing.toFixed(2) + 'px';
        // Kâğıda BASILMIŞ his: gölge daralır (blur 4 → 2.5), kontur incelir ve
        // koyulaşır. Geniş bir hale yazıyı zeminden koparıp "üstte yüzen HTML"
        // gibi gösteriyordu; dar ve koyu bir kontur ise harfi haritanın içine
        // oturtur. Mürekkep de ısıtıldı: nötr fildişi yerine hafif sıcak.
        ctx.shadowColor = ink ? ink.country.shadow : 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = ink ? ink.country.shadowBlur : 2.5;
        ctx.shadowOffsetY = ink ? 0 : 1;
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(1.2, size * (ink ? ink.country.strokeK : 0.075));
        ctx.strokeStyle = ink ? ink.country.stroke : 'rgba(8, 10, 11, 0.55)';
        ctx.strokeText(L.name, 0, 0);
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = ink ? ink.country.fill : 'rgba(240, 229, 200, 0.97)';
        ctx.fillText(L.name, 0, 0);
        ctx.letterSpacing = '0px';
        ctx.restore();
        // Bayrak uzak/orta zoomda kimlik verir; yakında şehir katmanı devralır.
        if (L.flag && z < 0.75) {
          ctx.globalAlpha = a;
          const fk = p.k ?? 1;
          drawFlag(ctx, L.flag, px - 9 * fk, p.y + bh / 2 + 3 * fk, 18 * fk, 12 * fk);
          ctx.globalAlpha = 1;
        }
      }
    }

    // Sayaçlar ülke adlarından SONRA engel olur: ülke adı ordunun üstünden
    // geçebilir (uzakta okunması gereken o), state ve şehir adı geçemez —
    // ad sayacın altına kayar, orada da yer yoksa yazılmaz. Eskiden şehir
    // adları sayacın tam ortasına basılıyordu (Lundholm, Keshvale...).
    const counters = this.counterRects ?? [];
    for (const c of counters) placed.push(c);

    // Isı haritasında her state'in payı sayıyla da okunur: renk kademesi
    // "%20 ile %34 arası" der, oyuncunun sorduğu ise "burada kaç".
    if (heatCulture != null && z >= CULTURE_SHARE_MIN_ZOOM) {
      ctx.font = `700 12px ${FONT_UI}`;
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(6, 8, 10, 0.85)';
      ctx.fillStyle = 'rgba(255, 248, 232, 0.96)';
      for (const pr of world.provinces ?? []) {
        const share = pr.cultures?.find((row) => row.id === heatCulture)?.share ?? 0;
        if (share < CULTURE_HEAT_STOPS[0]) continue;
        const p = cam.worldToScreenWrapped(pr.center.x, pr.center.y);
        if (p.x < -24 || p.x > cam.viewWidth + 24 || p.y < -12 || p.y > cam.viewHeight + 12) continue;
        const text = `${Math.round(share * 100)}%`;
        if (collides(p.x - 16, p.y - 8, 32, 16)) continue;
        placed.push({ x: p.x - 16, y: p.y - 8, w: 32, h: 16 });
        ctx.strokeText(text, p.x, p.y);
        ctx.fillText(text, p.x, p.y);
      }
    }
    const underCounter = (rx, ry, rw, rh) => {
      for (const c of counters) {
        if (rx < c.x + c.w && rx + rw > c.x && ry < c.y + c.h && ry + rh > c.y) return c.y + c.h;
      }
      return null;
    };

    // --- 2. State (province) adları ---
    // Geçiş 0.6'dan itibaren işler ki 0.68 eşiğinin altına inerken etiketler
    // "pat" diye silinmesin — hedef alfa 0'a düşer, erime payı kalır.
    if (z >= 0.6 && world.provinces?.length && this.showsPolitics()) {
      const zoomAlpha = Math.min(0.92, Math.max(0, (z - 0.68) * 4));
      const refFont = `400 small-caps 100px ${FONT_DISPLAY}`;
      // 10.5 px sabit punto small-caps'te küçük harfleri ~5 px'e indiriyordu:
      // orta zoomda state adları ülke renginin üstünde okunmuyordu (Kerem'e
      // gösterilen kusur 5). Punto zoomla 12 → 15 px açılır; kutu ve aralık
      // aynı oranda büyür.
      const size = 12 + 3 * ramp(z, 0.75, 1.9);
      const track = size * 0.1;
      const boxH = Math.round(size * 1.45);
      const visible = [];
      for (const pr of world.provinces) {
        if (!pr.name) continue;
        // Sahipsiz kırlar en yakın zoomda; önce devletlerin toprağı konuşsun.
        if (pr.owner < 0 && z < 1.1) continue;
        const p = cam.worldToScreenWrapped(pr.center.x, pr.center.y);
        const xs = copiesOf(p.x, 70, p.kr);
        if (!xs.length || p.y < -20 || p.y > cam.viewHeight + 20) {
          // Ekran dışı: alfa SIFIRLANIR. Bırakılınca ad 0.85'te donuyor ve
          // görüşe geri girdiğinde erimeden, tam alfayla beliriyordu — ülke ve
          // şehir döngüleri bunu zaten yapıyordu, eksik olan yalnız burasıydı
          // (ölçüldü: tek zoom jestinde 20 ada varan "pat" giriş).
          this.labelAlpha.delete('p' + pr.center.q + ':' + pr.center.r);
          continue;
        }
        p.x = xs[0];
        visible.push({ pr, p, more: xs.length > 1 ? xs.slice(1) : null });
      }
      visible.sort((a, b) => (b.pr.population ?? 0) - (a.pr.population ?? 0));
      // Font kare başına TEK kez kurulur (yüzlerce state'te atama başına
      // maliyet ölçülebilir). Döngü içindeki hiçbir yardımcı ctx.font'u
      // değiştirmemeli — measureLabel bu yüzden durumu geri yazar.
      ctx.font = `400 small-caps ${size.toFixed(1)}px ${FONT_DISPLAY}`;
      ctx.letterSpacing = track.toFixed(2) + 'px';
      ctx.lineJoin = 'round';
      const half = boxH / 2;
      for (const { pr, p, more } of visible) {
        const key = 'p' + pr.center.q + ':' + pr.center.r;
        const w = (this.measureLabel(ctx, refFont, pr.name) * size) / 100 + pr.name.length * track;
        const rx = p.x - w / 2 - 3;
        const below = underCounter(rx, p.y - half, w + 6, boxH);
        // Giriş histerezisi kutuyu %15 büyütür; dibine yapışık ad hep çarpışıyordu.
        if (below !== null) p.y = below + half + 4;
        const ry = p.y - half;
        anchorJump(key, pr.center.x);
        const fits = zoomAlpha > 0 && admits(key, rx, ry, w + 6, boxH);
        if (fits) placed.push({ x: rx, y: ry, w: w + 6, h: boxH });
        const a = fade(key, fits ? zoomAlpha : 0);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        // Koyu hale harfi zeminden ayırır: 1.6 px / %32'lik kontur açık
        // ülke renginde (kum, açık yeşil) yazıyı eritiyordu.
        ctx.lineWidth = ink ? ink.state.width : size * 0.22;
        ctx.strokeStyle = ink ? ink.state.stroke : 'rgba(10, 12, 12, 0.5)';
        around(p.k, p.x, p.y);
        ctx.strokeText(pr.name, p.x, p.y);
        ctx.fillStyle = ink ? ink.state.fill : 'rgba(236, 228, 206, 0.96)';
        ctx.fillText(pr.name, p.x, p.y);
        if (!more) continue;
        for (const mx of more) {
          if (collides(mx - w / 2 - 3, ry, w + 6, boxH)) continue;
          placed.push({ x: mx - w / 2 - 3, y: ry, w: w + 6, h: boxH });
          around(p.k, mx, p.y);
          ctx.strokeText(pr.name, mx, p.y);
          ctx.fillText(pr.name, mx, p.y);
        }
      }
      ctx.globalAlpha = 1;
      ctx.letterSpacing = '0px';
    }

    // --- 3. Şehir ve başkent adları ---
    // Keskin z eşikleri yerine rampalar: başkent 0.78-0.92, önemli şehir
    // 0.98-1.12, hepsi 1.22-1.36 bandında erir; fade artığı için tarama
    // 0.72'den başlar.
    if (z >= 0.72 && world.cities?.length) {
      // State adlarıyla aynı kural: punto zoomla açılır, koyu hale okutur.
      const grow = ramp(z, 0.9, 2.0);
      const capSize = 12.5 + 2 * grow;
      const citySize = 11.5 + 2 * grow;
      const capFont = `600 small-caps ${capSize.toFixed(1)}px ${FONT_DISPLAY}`;
      const cityFont = `italic 500 ${citySize.toFixed(1)}px ${FONT_DISPLAY}`;
      const boxH = Math.round(capSize * 1.35);
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
        const xs = copiesOf(p.x, 60, p.kr);
        if (!xs.length || p.y < -24 || p.y > cam.viewHeight + 24) {
          this.labelAlpha.delete(key);
          continue;
        }
        p.x = xs[0];
        const name = englishCityName(city.name);
        let ly = p.y + HEX_SIZE * z * 0.68;
        const refFont = isCapital
          ? `600 small-caps 100px ${FONT_DISPLAY}`
          : `italic 500 100px ${FONT_DISPLAY}`;
        const size = isCapital ? capSize : citySize;
        const w = (this.measureLabel(ctx, refFont, name) * size) / 100;
        const rx = p.x - w / 2 - 2;
        const half = boxH / 2;
        const below = underCounter(rx, ly - half, w + 4, boxH);
        if (below !== null) ly = below + half + 4;
        const ry = ly - half;
        anchorJump(key, city.tile.x);
        const fits = target > 0 && admits(key, rx, ry, w + 4, boxH);
        if (fits) placed.push({ x: rx, y: ry, w: w + 4, h: boxH });
        const a = fade(key, fits ? target : 0);
        if (a <= 0.01) continue;
        ctx.globalAlpha = a;
        ctx.font = isCapital ? capFont : cityFont;
        ctx.lineJoin = 'round';
        // Stil mürekkebi eski punto oranını korur (atlas açık kâğıt halesi).
        ctx.lineWidth = ink
          ? (isCapital ? 1.9 / 11.5 : 1.6 / 10) * size * ink.city.widthK
          : size * 0.22;
        ctx.strokeStyle = ink ? ink.city.stroke : 'rgba(8, 11, 11, 0.55)';
        around(p.k, p.x, p.y);
        ctx.strokeText(name, p.x, ly);
        ctx.fillStyle = ink
          ? (isCapital ? ink.city.capital : ink.city.fill)
          : (isCapital ? 'rgba(244, 235, 212, 0.98)' : 'rgba(232, 223, 200, 0.94)');
        ctx.fillText(name, p.x, ly);
        for (let i = 1; i < xs.length; i++) {
          if (collides(xs[i] - w / 2 - 2, ry, w + 4, boxH)) continue;
          placed.push({ x: xs[i] - w / 2 - 2, y: ry, w: w + 4, h: boxH });
          around(p.k, xs[i], p.y);
          ctx.strokeText(name, xs[i], ly);
          ctx.fillText(name, xs[i], ly);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }
}
