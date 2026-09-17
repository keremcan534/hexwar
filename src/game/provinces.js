// Province katmanı: nüfus, kontrol ve uzmanlaşma artık tek hex değil,
// world.provinces'teki 2-7 hexlik KÜMELER üzerinde yaşar (CK3 modeli).
// Ordular hex hex yürür ve işgal eder; ekonomi kümeyi okur.
//
// Temsil: her kümenin tek `econ` nesnesi vardır ve üye karelerin
// `tile.province` alanı AYNI nesneye işaret eder (paylaşılan referans).
// Böylece kare üzerinden okuyan eski kod (hud, denetimler) kırılmaz; ama
// kare döngüsüyle TOPLAYAN her yer üye sayısı kadar çift sayar — o yüzden
// bütün toplayıcılar bu dosyayla birlikte küme döngüsüne taşındı
// (cities.collectProvinceTotals, economy.rawProduction, population, census,
// recruitment). Yenisini yazarken world.provinces üzerinden dolaş.

import { makeRng } from '../core/rng.js';
import { fbm, makeNoise2D } from '../core/noise.js';
import { lawModifiers, lawValue } from './politics.js';
import { controllerOf } from './control.js';
import { DEFAULT_ZONE, ZONE_RULES } from '../world/macro.js';
import { CULTURE, resolveRevolts, runProvinceCulture } from './culture.js';
import { POPULATION_SCALE } from './populationScale.js';

/**
 * Province kaynakları. Tahıl kasten baskın tutuldu: ordunun erzağı ve nüfusun
 * temel gıdası buradan gelir, egzotik kaynaklar onu ezerse ülkeler açlıktan
 * çöker. Kauçuk/tropik ağaç/ipek gibi kalemler nadirdir ve araziye bağlıdır —
 * kıtlıkları ticaretin ve sömürge hırsının asıl sebebidir.
 *
 * Verimler zincir derinleşince ~1.8 katına çıkarıldı: kömür artık sekiz ayrı
 * tesisin girdisi ve eski 0.16'lık province verimi toplam fabrika talebinin
 * otuzda birini karşılıyordu — bütün ham mallar fiyat tavanına yapışıyordu.
 */
export const RGO_TYPES = {
  GRAIN: {
    id: 'GRAIN', goodId: 'food', name: 'Grain Farms', icon: '🌾', hue: 91,
    track: 'agriculture', baseOutput: 0.54,
  },
  CATTLE: {
    id: 'CATTLE', goodId: 'cattle', name: 'Cattle Ranches', icon: '🐄', hue: 74,
    track: 'agriculture', baseOutput: 0.324,
  },
  FISH: {
    id: 'FISH', goodId: 'fish', name: 'Fishing Wharfs', icon: '🐟', hue: 195,
    track: 'agriculture', baseOutput: 0.54,
  },
  FRUIT: {
    id: 'FRUIT', goodId: 'fruit', name: 'Orchards', icon: '🍇', hue: 300,
    track: 'agriculture', baseOutput: 0.396,
  },
  COTTON: {
    id: 'COTTON', goodId: 'cotton', name: 'Cotton Plantations', icon: '🌱', hue: 52,
    track: 'agriculture', baseOutput: 0.54,
  },
  SILK: {
    id: 'SILK', goodId: 'silk', name: 'Silk Farms', icon: '🕸', hue: 330,
    track: 'agriculture', baseOutput: 0.144,
  },
  DYE: {
    id: 'DYE', goodId: 'dye', name: 'Dye Plantations', icon: '🎨', hue: 275,
    track: 'agriculture', baseOutput: 0.396,
  },
  TIMBER: {
    id: 'TIMBER', goodId: 'timber', name: 'Logging Camps', icon: '🪵', hue: 139,
    track: 'extraction', baseOutput: 0.396,
  },
  TROPICAL_WOOD: {
    id: 'TROPICAL_WOOD', goodId: 'tropical_wood', name: 'Tropical Logging', icon: '🌴', hue: 158,
    track: 'extraction', baseOutput: 0.18,
  },
  RUBBER: {
    id: 'RUBBER', goodId: 'rubber', name: 'Rubber Plantations', icon: '⬤', hue: 120,
    track: 'extraction', baseOutput: 0.198,
  },
  IRON: {
    id: 'IRON', goodId: 'iron', name: 'Iron Mines', icon: '⛏', hue: 211,
    track: 'extraction', baseOutput: 0.324,
  },
  COAL: {
    id: 'COAL', goodId: 'coal', name: 'Coal Mines', icon: '◆', hue: 28,
    track: 'extraction', baseOutput: 0.288,
  },
  // Verim 0.18 -> 0.36: tek RGO doneminde 40 yil boyunca kitti (arz talebin
  // 0.4-0.8'i, fiyat 1.3-2.8 kat). Hex payini iki katina cikarmak yerine
  // madenin verimi artti; dunya kukurt kusagina donmesin.
  SULPHUR: {
    id: 'SULPHUR', goodId: 'sulphur', name: 'Sulphur Mines', icon: '🜍', hue: 48,
    track: 'extraction', baseOutput: 0.36,
  },
  OIL: {
    id: 'OIL', goodId: 'oil', name: 'Oil Derricks', icon: '🛢', hue: 12,
    track: 'extraction', baseOutput: 0.162,
  },
};

export const MIGRATION_INTERVAL = 4;
export const MIGRATION_COHORT = 100 * POPULATION_SCALE;
export const MIGRATION_RATE = 0.04;


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// ============================================================================
// HEX KAYNAKLARI (2026-09)
//
// Kaynak artık KÜMENİN değil HEX'in özelliğidir: her geçilebilir hex kendi
// RGO'sunu taşır, küme üyelerinin toplamını üretir. Tek RGO'lu kümede iki
// sorun ölçüldü (standart dünya, 3 tohum):
//   - Paylar zara bağlıydı ve talebi izlemiyordu: 40 yılda meyve, ipek, boya,
//     tropik ağaç ve kauçuk taban fiyata çakılı (arz talebin 3-20 katı),
//     kükürt kıt (arz talebin 0.4-0.8'i, fiyat 1.3-2.8 kat).
//   - Gıda dünyada fazlayken (arz talebin 1.1-1.6 katı) ülkelerin yarısı aç
//     kalıyordu: korumacı gümrük (%50) açığın yalnız %56'sını ithal ettiriyor
//     ve yerli tahıl tek RGO zarına bağlıydı (10. yıl: 66 ülkenin 24'ünde
//     raftaki gıda <%90).
//
// Dağılım iki katmanlı:
//   1. ARAZİ + İKLİM: kaynak ancak ona uygun karede çıkar (tahıl ova, kömür
//      tepe, kauçuk tropik orman; balık yalnız kıyıda).
//   2. DAMAR: her kaynağın düşük frekanslı gürültü alanı vardır; maden
//      kuşakları ve plantasyon bölgeleri tek tek serpilmez, öbek olur.
// Dünya payları TALEPTEN ölçülerek hedeflenir ve her dünya üretiminde KOTA
// ataması ile birebir verilir (bkz. assignHexResources): hiçbir mal yapısal
// kıt doğmaz.
// Atama tohum + arazi + koordinattan türer, KAYDA GİRMEZ: yüklemede aynı
// dünya aynı kaynakları yeniden üretir.
// ============================================================================

/** Arazi uygunluğu. Tabloda olmayan arazide o kaynak çıkmaz. */
const RESOURCE_TERRAIN = {
  GRAIN: { GRASSLAND: 3.2, PLAINS: 3.0, BEACH: 0.8, HILLS: 0.8, FOREST: 0.6, JUNGLE: 0.5, TUNDRA: 0.35, DESERT: 0.1, MOUNTAIN: 0.05 },
  CATTLE: { GRASSLAND: 2.2, PLAINS: 1.5, TUNDRA: 1.0, HILLS: 0.8, DESERT: 0.3, BEACH: 0.3, FOREST: 0.3, MOUNTAIN: 0.15, JUNGLE: 0.1 },
  // Balık kıyı karesine bağlıdır (aşağıda); tablo kıyıdaki arazinin payıdır.
  FISH: { BEACH: 3.0, PLAINS: 1.4, GRASSLAND: 1.4, HILLS: 1.2, FOREST: 1.2, JUNGLE: 1.2, TUNDRA: 1.2, DESERT: 1.2, MOUNTAIN: 0.6, SNOW_PEAK: 0.4 },
  FRUIT: { JUNGLE: 1.4, PLAINS: 1.0, GRASSLAND: 0.8, BEACH: 0.8, HILLS: 0.5 },
  COTTON: { PLAINS: 1.6, GRASSLAND: 0.9, BEACH: 0.7, DESERT: 0.4 },
  SILK: { JUNGLE: 1.0, PLAINS: 0.5, HILLS: 0.4, GRASSLAND: 0.3 },
  DYE: { JUNGLE: 1.3, PLAINS: 0.6, GRASSLAND: 0.4, BEACH: 0.4 },
  TIMBER: { FOREST: 4.0, JUNGLE: 0.9, HILLS: 0.7, TUNDRA: 0.6, MOUNTAIN: 0.4, GRASSLAND: 0.2 },
  TROPICAL_WOOD: { JUNGLE: 2.6 },
  RUBBER: { JUNGLE: 2.2 },
  IRON: { MOUNTAIN: 2.8, HILLS: 2.2, SNOW_PEAK: 1.4, TUNDRA: 0.35, DESERT: 0.3, FOREST: 0.2 },
  COAL: { HILLS: 2.6, MOUNTAIN: 1.3, FOREST: 0.7, TUNDRA: 0.5, PLAINS: 0.25, GRASSLAND: 0.15 },
  SULPHUR: { MOUNTAIN: 1.3, DESERT: 1.0, HILLS: 0.9, SNOW_PEAK: 0.5, BEACH: 0.2 },
  OIL: { DESERT: 2.2, TUNDRA: 1.3, BEACH: 0.5, PLAINS: 0.3, JUNGLE: 0.25, GRASSLAND: 0.15 },
};

/** Sıcak iklim mahsulleri: serin karede zayıflar (tile.temperature). */
const WARM_CROPS = new Set(['FRUIT', 'COTTON', 'SILK', 'DYE', 'RUBBER', 'TROPICAL_WOOD']);

/**
 * Damar eğilimi: 0 = her yere serpilir, 2 = güçlü kuşak. Madenler kuşak
 * kuşak, plantasyonlar bölge bölge, temel gıda neredeyse her yerde.
 */
const RESOURCE_CLUMP = {
  GRAIN: 0.3, CATTLE: 0.6, FISH: 0.2, FRUIT: 0.8, COTTON: 1.0, SILK: 1.2, DYE: 1.0,
  TIMBER: 0.4, TROPICAL_WOOD: 0.8, RUBBER: 1.2, IRON: 1.6, COAL: 1.8, SULPHUR: 1.8, OIL: 2.0,
};

/**
 * DÜNYA HEX PAYLARI — talepten. Türetme: 40 yıllık taban koşuda her malın
 * ölçülen arz/talep oranı ve fiyatı; alıcısız malın tarlası kendiliğinden
 * küçüldüğü için (bkz. updateDemandScale) potansiyel oran = oran / √fiyat.
 * Pay, potansiyel oranı ~1.3'e getirecek biçimde ölçeklendi ve toplam 1'e
 * normalize edildi; artan hex payı RGO_OUTPUT_SCALE ile dengelenir.
 * Kauçuk ve petrolün talebi geç doğar (otomobil, tank, rafineri): pay,
 * doğduğu gün kıtlık olmayacak kadar tutuldu.
 *
 * DEMİR KOTASI BİLEREK DÜŞÜK: karlı zirvelerde yalnız demir/kükürt çıkar ve
 * kotalar dolunca artan zirve demire düşer. Kota %6.5 iken gerçekleşen pay
 * %8.8'di; %4.5 kota ≈ %7 gerçek pay verir.
 */
const RESOURCE_SHARE = {
  GRAIN: 0.488, CATTLE: 0.09, FISH: 0.069, FRUIT: 0.008, COTTON: 0.05, SILK: 0.0065,
  DYE: 0.006, TIMBER: 0.045, TROPICAL_WOOD: 0.005, RUBBER: 0.0105, IRON: 0.045,
  COAL: 0.066, SULPHUR: 0.085, OIL: 0.026,
};

/**
 * Hex başına çıktı ölçeği: paylar normalize edilince toplam arz talebi izlesin.
 * 0.9 ile ölçüldü (3 tohum × 20 yıl): gıda arz/talebi ~1.0'a sıkıştı, pamuk ve
 * kömür ilk yıllarda kısaydı (0.67 ve 0.80); 1.0 ile paylar yeniden dağıtıldı.
 */
const RGO_OUTPUT_SCALE = 1.0;

/** Damar alanının periyodu (yatay sarmal): ~13 hexlik öbekler. */
const DEPOSIT_PERIOD = 12;

const RESOURCE_IDS = Object.keys(RGO_TYPES);

/**
 * Hex kaynaklarını atar ve her kümenin kaynak satırlarını (`province.deposits`)
 * kurar. Deterministik: tohum, arazi, sıcaklık ve koordinattan türer.
 */
export function assignHexResources(world) {
  const tiles = [];
  for (const province of world.provinces ?? []) {
    for (const idx of province.tileIdx) tiles.push(world.tiles[idx]);
  }
  const count = tiles.length;
  const k = RESOURCE_IDS.length;
  if (!count) return;
  const fields = RESOURCE_IDS.map((id) => makeNoise2D(makeRng(`${world.seed}-deposit-${id}`)));
  const aspect = (world.rows ?? 1) / Math.max(1, world.cols ?? 1);
  const score = new Float64Array(count * k);
  for (let t = 0; t < count; t++) {
    const tile = tiles[t];
    const u = tile.col / world.cols;
    const v = tile.row / world.rows;
    const warm = clamp(((tile.temperature ?? 0.5) - 0.35) / 0.3, 0.05, 1);
    // Sınırda şerit oluşmasın: kare başına küçük, deterministik sapma.
    const jitter = makeRng(`${world.seed}-resource-${tile.q}:${tile.r}`);
    for (let r = 0; r < k; r++) {
      const id = RESOURCE_IDS[r];
      let weight = RESOURCE_TERRAIN[id]?.[tile.terrain.id] ?? 0;
      if (id === 'FISH' && !tile.coastal) weight = 0;
      if (WARM_CROPS.has(id)) weight *= warm;
      if (weight > 0) {
        const field = fbm(fields[r], u * DEPOSIT_PERIOD, v * DEPOSIT_PERIOD * aspect, {
          octaves: 2, periodX: DEPOSIT_PERIOD,
        });
        const contrast = clamp((field - 0.5) * 3 + 0.5, 0, 1);
        weight *= Math.exp((RESOURCE_CLUMP[id] ?? 0.5) * (contrast - 0.5) * 2.5);
        weight *= 0.92 + jitter() * 0.16;
      }
      score[t * k + r] = weight;
    }
  }

  // KOTA ATAMASI. İlk yazım çarpan yinelemesiydi (tür çarpanı payı hedefe
  // yaklaştırana dek) ve ölçüldü: yakınsamadı. Argmax ataması kesiklidir —
  // küçük bir çarpan değişimi ikinci sıradaki binlerce kareyi birden çeviriyor,
  // 30 tur sonunda meyve %18.9'da (hedef %1.3), ipek ve tropik ağaç sıfırda
  // kalıyordu. Kota ataması payı TAM verir: her türün skoru kendi dağılımının
  // üst dilimine bölünür (tahılın 3.2'si ile kükürdün 1.3'ü kıyaslanabilir
  // olsun), (kare, tür) çiftleri en uygundan başlayarak kotaya kadar atanır.
  // Uygun karesi kotadan az olan tür (tropik ormansız dünya) eksik kalır;
  // artan kare en uygun türüne düşer.
  const reference = new Float64Array(k);
  for (let r = 0; r < k; r++) {
    const positive = [];
    for (let t = 0; t < count; t++) if (score[t * k + r] > 0) positive.push(score[t * k + r]);
    positive.sort((a, b) => a - b);
    reference[r] = positive.length ? positive[Math.floor((positive.length - 1) * 0.9)] : 1;
  }
  const pairs = [];
  for (let t = 0; t < count; t++) {
    for (let r = 0; r < k; r++) {
      const value = score[t * k + r];
      if (value > 0) pairs.push({ value: value / reference[r], t, r });
    }
  }
  pairs.sort((a, b) => b.value - a.value || a.t - b.t || a.r - b.r);
  const quota = RESOURCE_IDS.map((id) => Math.round((RESOURCE_SHARE[id] ?? 0) * count));
  const filled = new Int32Array(k);
  const choice = new Int32Array(count).fill(-1);
  for (const pair of pairs) {
    if (choice[pair.t] >= 0 || filled[pair.r] >= quota[pair.r]) continue;
    choice[pair.t] = pair.r;
    filled[pair.r]++;
  }
  // Artan kare once KOTASI DOLMAMIS uygun ture gider; yoksa en uygununa.
  // Tek gecisli argmax yalniz demir/kukurt cikabilen zirveleri demire
  // yigiyordu (hedef %6.5, gerceklesen %8.8).
  for (let t = 0; t < count; t++) {
    if (choice[t] >= 0) continue;
    let best = -1;
    let bestScore = 0;
    let fallback = 0;
    let fallbackScore = -1;
    for (let r = 0; r < k; r++) {
      const value = score[t * k + r] / reference[r];
      if (value > fallbackScore) {
        fallback = r;
        fallbackScore = value;
      }
      if (value > bestScore && filled[r] < quota[r]) {
        best = r;
        bestScore = value;
      }
    }
    choice[t] = best >= 0 ? best : fallback;
    filled[choice[t]]++;
  }

  for (let t = 0; t < count; t++) {
    const tile = tiles[t];
    tile.resource = RESOURCE_IDS[choice[t]];
    tile.resourceQuality = makeRng(`${world.seed}-quality-${tile.q}:${tile.r}`).range(0.85, 1.15);
  }
  for (const province of world.provinces ?? []) {
    province.deposits = depositLines(world, province);
    if (province.econ) attachDeposits(province.econ, province.deposits);
  }
}

/** Kümenin kaynak satırları: tür başına hex sayısı ve ortalama nitelik. */
function depositLines(world, province) {
  const byId = new Map();
  for (const idx of province.tileIdx) {
    const tile = world.tiles[idx];
    const id = RGO_TYPES[tile.resource] ? tile.resource : 'GRAIN';
    const line = byId.get(id) ?? { id, hexes: 0, quality: 0 };
    line.hexes++;
    line.quality += tile.resourceQuality ?? 1;
    byId.set(id, line);
  }
  return [...byId.values()]
    .map((line) => ({ id: line.id, hexes: line.hexes, quality: line.quality / line.hexes }))
    .sort((a, b) => b.hexes - a.hexes || (a.id < b.id ? -1 : 1));
}

/**
 * Satırlar econ'a SAYILAMAZ alan olarak bağlanır: kayıt `{...econ}` ile
 * yazar ve türetilebilen bu listeyi taşımaz; yüklemede dünya aynı listeyi
 * yeniden kurar.
 */
function attachDeposits(econ, lines) {
  Object.defineProperty(econ, 'deposits', {
    value: lines, enumerable: false, writable: true, configurable: true,
  });
}

/** Kaynak satırları; bağlanmamış econ (eski betik kopyası) tek tahıl satırı sayılır. */
export function depositsOf(econ) {
  if (econ?.deposits?.length) return econ.deposits;
  return [{ id: 'GRAIN', hexes: Math.max(1, econ?.hexes ?? 1), quality: 1 }];
}

/** Bir izin (agriculture/extraction) kümedeki hex payı. */
export function trackShareOf(econ, track) {
  const lines = depositsOf(econ);
  let total = 0;
  let hexes = 0;
  for (let i = 0; i < lines.length; i++) {
    total += lines[i].hexes;
    if (RGO_TYPES[lines[i].id]?.track === track) hexes += lines[i].hexes;
  }
  return total > 0 ? hexes / total : 0;
}

/** Kümenin baskın kaynağı (en çok hex); ekranların tek etiketi. */
export function primaryResourceOf(econ) {
  return RGO_TYPES[depositsOf(econ)[0]?.id] ?? null;
}

/**
 * Nüfus gürültüsü. Şablon (ZONE_RULES.popMul) bölgenin ROLÜNÜ verir; iki
 * dünya arasında aynı bölge hep aynı ağırlıkta doğuyordu ve bölge içinde her
 * küme arazi formülünün verdiği sayıyla, komşusuna benzer başlıyordu.
 *
 *   bölge çarpanı  : tohum başına ±%10 (roller korunur: doğu devi doğu devi
 *                    kalır, world-audit'in "doğu ≥ batı × 1.5" şartı en kötü
 *                    çekilişte bile tutar: 3.0×0.9 / 1.6×1.1 = 1.53)
 *   küme çarpanı   : lognormal, σ = 0.35 — kalabalık vadi, seyrek yayla.
 *                    Ortalama exp(σ²/2) ile bölünür ki dünya toplamı değişmesin.
 *
 * Her ikisi de tohum ve küme merkezine bağlıdır: kayıt/yükleme arasında
 * kaymaz (initialProvinceEcon yalnız dünya doğarken çalışır).
 */
const POP_ZONE_JITTER = 0.10;
const POP_PROVINCE_SIGMA = 0.35;
function populationNoise(world, province) {
  const zone = province.zone ?? DEFAULT_ZONE;
  const zoneRng = makeRng(`${world.seed}-pop-zone-${zone}`);
  const zoneFactor = 1 + (zoneRng() * 2 - 1) * POP_ZONE_JITTER;
  const rng = makeRng(`${world.seed}-pop-${province.center.q}:${province.center.r}`);
  // Box–Muller: iki düzgün çekilişten bir normal.
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const provinceFactor = Math.exp(POP_PROVINCE_SIGMA * normal)
    / Math.exp((POP_PROVINCE_SIGMA * POP_PROVINCE_SIGMA) / 2);
  return zoneFactor * provinceFactor;
}

/**
 * Kümenin başlangıç ekonomisi. Nüfus, eski kare formülünün üye toplamıdır —
 * dünya toplam nüfusu hex-tabanlı sürümle birebir aynı kalır. Gelişim
 * kademeleri üye verim ORTALAMASINA eşiklenir (küme tek karar alanıdır).
 */
function initialProvinceEcon(world, province) {
  const members = province.tileIdx.map((idx) => world.tiles[idx]);
  let population = 0;
  let foodSum = 0;
  let timberSum = 0;
  let ironSum = 0;
  let goldSum = 0;
  let coastal = false;
  for (const tile of members) {
    const yields = tile.terrain.yields;
    const tileAg = yields.food >= 3 ? 2 : yields.food > 0 ? 1 : 0;
    const tileEx = Math.max(yields.timber, yields.iron) >= 2 ? 2
      : Math.max(yields.timber, yields.iron) > 0 ? 1 : 0;
    const tileCom = tile.coastal || yields.gold > 0 ? 1 : 0;
    population += 1800 + yields.food * 1200 + (tile.coastal ? 900 : 0)
      + (tileAg + tileEx + tileCom) * 450;
    foodSum += yields.food;
    timberSum += yields.timber;
    ironSum += yields.iron;
    goldSum += yields.gold;
    if (tile.coastal) coastal = true;
  }
  const n = Math.max(1, members.length);
  const avgFood = foodSum / n;
  const avgOre = Math.max(timberSum / n, ironSum / n);
  const agriculture = avgFood >= 3 ? 2 : avgFood > 0 ? 1 : 0;
  const extraction = avgOre >= 2 ? 2 : avgOre > 0 ? 1 : 0;
  // Makro asimetri: nüfus ve gelişim bölgeden gelir. Doğu ovası nüfus devi,
  // yoğun-batı ticaret/sanayi çekirdeği, sınır bölgeleri seyrek başlar.
  const rule = ZONE_RULES[province.zone ?? DEFAULT_ZONE] ?? ZONE_RULES[DEFAULT_ZONE];
  let commerce = coastal || goldSum > 0 ? 1 : 0;
  if (rule.dev >= 1) commerce = Math.max(commerce, 1);
  if (rule.dev >= 2 && coastal) commerce = 2;
  population *= rule.popMul * POPULATION_SCALE * populationNoise(world, province);
  return {
    population: Math.round(population),
    // Kaç hexlik küme: kare başına pay isteyen eski okuyucular (barış bedeli
    // gibi) toplamı buna böler.
    hexes: members.length,
    baseGold: goldSum / n,
    agriculture,
    extraction,
    commerce,
    control: province.owner >= 0 ? 100 : 0,
    lastInvestment: 0,
    // HERKES İŞLE BAŞLAR (Vic2). Kuruluş kadrosu kümenin alt sınıf iş gücüne
    // göre açılır; eskiden nüfusun %72-88'iydi ve orta/üst sınıf da iş
    // arayan sayılıyordu. Küçük pay (RGO_JOB_SLACK) ilk yılın nüfus artışını
    // karşılar.
    rgoBaseJobs: Math.max(1000 * POPULATION_SCALE, Math.round(
      population * LOWER_SHARE_DEFAULT * RGO_JOB_SLACK / (100 * POPULATION_SCALE),
    ) * 100 * POPULATION_SCALE),
    // Gelişim kademelerinin kuruluş değeri: kadro yalnız bunun üstündeki
    // kazanımla büyür (bkz. rgoCapacityOf).
    agricultureBase: agriculture,
    extractionBase: extraction,
    // Mal başına talep ölçeği (bkz. updateDemandScale); 1 = tam tarla.
    demand: {},
    lowerShare: LOWER_SHARE_DEFAULT,
    migration: 0,
    // Kultur sayaclari (bkz. culture.js). Kurulusta SIFIR: 1836 imparatorlugu
    // oturmus bir dunyadir, huzursuzluk oyun boyunca birikir.
    unrest: 0,
    revoltWeeks: 0,
    // Silah altindaki insan. Nufusun ICINDE durur, ondan DUSULMEZ: asker de
    // vatandastir. Bu sayac yalnizca "bu insanlar simdilik baska bir ise
    // bagli" der — ne tarlada calisir ne ikinci kez askere alinabilir.
    soldiers: 0,
    industrialEmployees: 0,
    industrialJobs: 0,
  };
}

/**
 * Eski kayıt (tek RGO'lu küme) yeni biçime göçer ve eksik alanlar dolar.
 * Göç kayıpsızdır: eski izin gelişim tabanı ve talep ölçeği kendi malına
 * taşınır, öbür iz bugünkü değerini taban alır (henüz kazanımı yoktur).
 */
function ensureProvinceResources(world, province) {
  const econ = province.econ;
  if (!econ) return null;
  if (!province.deposits) province.deposits = depositLines(world, province);
  attachDeposits(econ, province.deposits);
  const legacy = RGO_TYPES[econ.rgo] ?? null;
  if (!Number.isFinite(econ.agricultureBase)) {
    econ.agricultureBase = legacy?.track === 'agriculture' && Number.isFinite(econ.rgoBaseDevelopment)
      ? econ.rgoBaseDevelopment : (econ.agriculture ?? 0);
  }
  if (!Number.isFinite(econ.extractionBase)) {
    econ.extractionBase = legacy?.track === 'extraction' && Number.isFinite(econ.rgoBaseDevelopment)
      ? econ.rgoBaseDevelopment : (econ.extraction ?? 0);
  }
  if (!econ.demand || typeof econ.demand !== 'object') econ.demand = {};
  if (legacy && Number.isFinite(econ.rgoDemandScale) && !(legacy.goodId in econ.demand)) {
    econ.demand[legacy.goodId] = econ.rgoDemandScale;
  }
  delete econ.rgo;
  delete econ.rgoQuality;
  delete econ.rgoBaseDevelopment;
  delete econ.rgoDemandScale;
  // ESKI KAYIT HERKESI ISE ALIR. Tek RGO donemindeki kadro 1836 nufusuyla
  // kurulmustu; kayit yillar sonra acilinca buyuyen ve goc eden nufus yeni
  // is gucu tanimiyla bir anda yuzde elli issiz gorunuyordu (olculdu: 1842
  // kaydi, istihdam %47). Goc aninda kadro bugunku is gucune acilir.
  if (legacy) {
    // Pay sahibinin gercek sinif dagilimindan: varsayilan 0.78 yillar sonra
    // alt sinifi eksik sayiyor ve kadroyu yine dar aciyordu.
    const owner = world.nations?.[province.owner]?.economy;
    if (owner?.population > 0 && Number.isFinite(owner.classes?.lower?.population)) {
      econ.lowerShare = clamp(owner.classes.lower.population / owner.population, 0, 1);
    }
    const workforce = rgoWorkforceOf(econ);
    econ.rgoBaseJobs = Math.max(econ.rgoBaseJobs ?? 0, Math.round(
      workforce * RGO_JOB_SLACK / (100 * POPULATION_SCALE),
    ) * 100 * POPULATION_SCALE);
  }
  if (!Number.isFinite(econ.rgoBaseJobs)) {
    econ.rgoBaseJobs = Math.max(1000 * POPULATION_SCALE, Math.round(
      Math.max(0, econ.population ?? 0) * LOWER_SHARE_DEFAULT * RGO_JOB_SLACK / (100 * POPULATION_SCALE),
    ) * 100 * POPULATION_SCALE);
  }
  if (!Number.isFinite(econ.lowerShare)) econ.lowerShare = LOWER_SHARE_DEFAULT;
  if (!Number.isFinite(econ.migration)) econ.migration = 0;
  // Kultur sayaclari (bkz. culture.js). Eski kayitta yoktur: sifirdan baslar
  // ve ilk haftalarda kendi hedefine yaklasir.
  if (!Number.isFinite(econ.unrest)) econ.unrest = 0;
  if (!Number.isFinite(econ.revoltWeeks)) econ.revoltWeeks = 0;
  if (!Number.isFinite(econ.hexes)) econ.hexes = province.tileIdx.length;
  return econ;
}

export function initProvinces(world) {
  world.forEach((tile) => { tile.province = null; });
  for (const province of world.provinces ?? []) {
    province.econ = initialProvinceEcon(world, province);
  }
  // Kaynaklar econ kurulduktan SONRA atanır: satırlar econ'a bağlanır.
  assignHexResources(world);
  for (const province of world.provinces ?? []) {
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

export function ensureProvinces(world) {
  const needsResources = (world.provinces ?? []).some((province) => !province.deposits);
  if (needsResources) assignHexResources(world);
  for (const province of world.provinces ?? []) {
    if (!province.econ) {
      province.econ = initialProvinceEcon(world, province);
    }
    ensureProvinceResources(world, province);
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

/**
 * Kümenin hukuki sahibi üye çoğunluğundan türetilir. Savaşta kareler tek tek
 * el değiştirebildiği için (hex hex işgal) küme geçici olarak karışık
 * kalabilir; ekonomi çoğunluğun devletine akar.
 */
// Oy sayimi karalamasi: kume en cok 7 uyeli, Map kurmak haftada 658 kez
// gereksiz tahsisti. Omru tek cagridir.
const voteOwnersScratch = [];
const voteCountsScratch = [];

export function refreshProvinceOwner(world, province) {
  const owners = voteOwnersScratch;
  const counts = voteCountsScratch;
  let distinct = 0;
  for (let t = 0; t < province.tileIdx.length; t++) {
    const owner = world.tiles[province.tileIdx[t]].owner;
    let at = -1;
    for (let i = 0; i < distinct; i++) {
      if (owners[i] === owner) { at = i; break; }
    }
    if (at < 0) {
      owners[distinct] = owner;
      counts[distinct] = 1;
      distinct++;
    } else {
      counts[at]++;
    }
  }
  // Ilk gorulme sirasi Map yineleme sirasiyla ayni: esitlik kirilimi degismez.
  let winner = -1;
  let winnerVotes = -1;
  for (let i = 0; i < distinct; i++) {
    if (counts[i] > winnerVotes || (counts[i] === winnerVotes && owners[i] < winner)) {
      winner = owners[i];
      winnerVotes = counts[i];
    }
  }
  province.owner = winner;
  return winner;
}

/** İşgal payı: sahibinden başkasının fiilen kontrol ettiği üye oranı. */
export function occupiedShareOf(world, province) {
  if (province.owner < 0) return 0;
  let occupied = 0;
  for (let t = 0; t < province.tileIdx.length; t++) {
    if (controllerOf(world.tiles[province.tileIdx[t]]) !== province.owner) occupied++;
  }
  return occupied / Math.max(1, province.tileIdx.length);
}

// State adları için hece tabloları. "Forest 18:15" bir ad değil, koordinattı;
// yönetim ekranlarında ilk sütun olduğu için okunur bir şey olmalı.
const LAND_NAME_A = [
  'Aster', 'Bram', 'Cald', 'Dorn', 'Elm', 'Fen', 'Gar', 'Hald', 'Ilm', 'Jor',
  'Kesh', 'Lund', 'Mar', 'Norr', 'Oster', 'Pell', 'Quen', 'Rav', 'Sten', 'Tor',
  'Ulm', 'Vard', 'Wehr', 'Yar', 'Zel',
];
const LAND_NAME_B = [
  'mark', 'land', 'gau', 'thal', 'burg', 'stead', 'moor', 'vale', 'reach', 'holm',
  'wick', 'fell', 'heim', 'garde', 'ford',
];

/**
 * Kareye bağlı, deterministik ad. Aynı kare her zaman aynı adı verir; dünya
 * yeniden üretilmedikçe kayıt ile ekran arasında ad kayması olmaz.
 */
export function provinceName(tile) {
  if (tile.city) return `${tile.city.name} Province`;
  const rng = makeRng(`province-name-${tile.q}:${tile.r}`);
  return rng.pick(LAND_NAME_A) + rng.pick(LAND_NAME_B);
}

export function provincePopulation(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ) total += province.econ.population;
  }
  return Math.round(total);
}

/**
 * Bir ulusun silah altindaki toplam insani. Nufusun ICINDEDIR; sivil nufus
 * istendiginde nufustan bu cikarilir (bkz. economy.js isgucu tavani).
 */
export function provinceSoldiers(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ) total += province.econ.soldiers ?? 0;
  }
  return Math.round(total);
}

/**
 * Alayin bir province'ten TUTTUGU insan sayisini artirir. Nufusa dokunmaz:
 * askere alma bir insani yok etmez, yalnizca ne is yaptigini degistirir.
 */
export function claimSoldiers(econ, men) {
  if (!econ || !(men > 0)) return;
  econ.soldiers = (econ.soldiers ?? 0) + men;
}

/**
 * Tutulan insanlari birakir. `died` ise adam gercekten olmustur ve nufustan
 * da duser — muharebe kaybi artik ulusal nufus sayacinda GORUNUR (eskiden
 * askerler zaten nufusun disindaydi, yani ordunun yok olmasi ulke nufusunu
 * hic degistirmiyordu).
 */
export function releaseSoldiers(econ, men, died = false) {
  if (!econ || !(men > 0)) return;
  econ.soldiers = Math.max(0, (econ.soldiers ?? 0) - men);
  if (died) econ.population = Math.max(0, (econ.population ?? 0) - men);
}

/**
 * Alt sınıfın nüfus payı: RGO'da yalnız alt sınıf çalışır. Varsayılan
 * economy.CLASS_INFO.lower.share ile aynıdır (import katman döngüsü olurdu);
 * gerçek değeri runProvinces haftada bir ulusun sınıf dağılımından yazar.
 */
const LOWER_SHARE_DEFAULT = 0.78;

/** Kuruluşta kadro iş gücünü bu kadar aşar: ilk yıl nüfus artışı işsiz kalmasın. */
const RGO_JOB_SLACK = 1.05;

/** Gelişim kademesi başına kadro büyümesi (kuruluş kadrosunun payı). */
const DEVELOPMENT_JOBS = 0.04;

/**
 * RGO iş gücü: kümenin alt sınıfı, fabrikada çalışanlar, banliyö işçileri
 * ve silah altındakiler düşülerek. Eskiden bütün nüfus (orta ve üst sınıf
 * dahil) RGO kadrosuyla kıyaslanıyordu: başkent kümesinde fabrika işçileri ve
 * kâtipler "2.47M işsiz" görünüyordu (oyuncu bildirimi).
 */
export function rgoWorkforceOf(econ) {
  const population = Math.max(0, econ?.population ?? 0);
  const share = Number.isFinite(econ?.lowerShare) ? clamp(econ.lowerShare, 0, 1) : LOWER_SHARE_DEFAULT;
  const lower = population * share;
  // Fabrikada çalışan tarlada çalışmaz; yerel kadro yerel nüfusla SINIRLI
  // düşülür, fazlası banliyöcülük olarak başka kümelerden düşer (bkz.
  // economy.runFactories banliyö düzeltmesi). Silah altındaki adam da
  // tarlada değildir: seferberlik üretimi DÜŞÜRÜR.
  const local = Math.min(Math.max(0, econ?.industrialEmployees ?? 0), lower);
  const commuters = Math.max(0, econ?.industrialCommuters ?? 0);
  const armed = Math.max(0, econ?.soldiers ?? 0);
  return Math.max(0, lower - local - commuters - armed);
}

/** Talep ölçeği (bkz. updateDemandScale): 1 = tam tarla. */
function demandScaleOf(econ, goodId) {
  const scale = econ?.demand?.[goodId];
  return Number.isFinite(scale) ? clamp(scale, RGO_DEMAND_MIN, 1) : 1;
}

/**
 * RGO KAPASİTESİ: kuruluş kadrosu × gelişim kazanımı. Talep ölçeği İÇERMEZ —
 * çıktı onu mal başına ayrıca görür; kadroya da bir kez girer (rgoJobsOf).
 */
function rgoCapacityOf(econ) {
  const lines = depositsOf(econ);
  let total = 0;
  let developed = 0;
  for (let i = 0; i < lines.length; i++) {
    const type = RGO_TYPES[lines[i].id];
    if (!type) continue;
    const gain = type.track === 'agriculture'
      ? (econ.agriculture ?? 0) - (econ.agricultureBase ?? 0)
      : (econ.extraction ?? 0) - (econ.extractionBase ?? 0);
    developed += lines[i].hexes * Math.max(0, gain);
    total += lines[i].hexes;
  }
  const levels = total > 0 ? developed / total : 0;
  return Math.max(0, econ.rgoBaseJobs ?? 0) * (1 + levels * DEVELOPMENT_JOBS);
}

export function rgoJobsOf(econ) {
  if (!econ) return 0;
  // Alıcısız malın tarlası küçülür: kadro, satırların talep ölçeğinin hex
  // ağırlıklı ortalamasıyla çarpılır.
  const lines = depositsOf(econ);
  let total = 0;
  let demand = 0;
  for (let i = 0; i < lines.length; i++) {
    const type = RGO_TYPES[lines[i].id];
    if (!type) continue;
    total += lines[i].hexes;
    demand += lines[i].hexes * demandScaleOf(econ, type.goodId);
  }
  const factor = total > 0 ? demand / total : 1;
  return Math.max(
    1000 * POPULATION_SCALE,
    Math.round(rgoCapacityOf(econ) * factor / (100 * POPULATION_SCALE)) * 100 * POPULATION_SCALE,
  );
}

/** Kare üzerinden okuma: tile.province paylaşılan küme econ'udur. */
export function provinceRgoJobs(tile) {
  return rgoJobsOf(tile?.province);
}

/**
 * RGO gelişimi: tarla ve maden kendiliğinden verimlenmez, barış ve istikrar
 * ister. Bu olmadan `agriculture`/`extraction` dünya üretiminde bir kez atanıp
 * bir daha hiç değişmiyor, dolayısıyla kadronun gelişim terimi yapısal olarak
 * hep 0 kalıyordu. Sonucu ölçüldü: 40 yılda hammadde arzı +%14, sanayi talebi
 * +%489, bütün hammaddeler fiyat tavanında ve alt zincirler ölü (bkz.
 * market-diagnostic).
 *
 * Hız, iyi yönetilen bir province'in yüzyılda ~6 kademe kazanacağı şekilde
 * seçildi: kapasite ~1.24, verim ~2 kat artar. Oyuncuya iş çıkarmaz — mikro
 * yönetim en pahalı maliyet (bkz. CLAUDE.md). Hex kaynakları gelince iki iz
 * (tarım, çıkarım) kümede birlikte bulunabilir; her iz kendi satırlarının
 * fiyatıyla gelişir.
 */
const RGO_DEVELOPMENT_PER_WEEK = 0.0011;
const RGO_DEVELOPMENT_CAP = 10;

/**
 * FIYAT SINYALI: sermaye karli cikarima akar.
 *
 * Onceki gecis gelisimi zamana bagladi (baris + istikrar + nufus baskisi) ama
 * FIYATA baglamadi: 8 kat fiyattaki kukurt madeni ile taban fiyattaki bugday
 * tarlasi tam ayni hizda gelisiyordu. Sonucu olculdu (supply-response-audit,
 * 520 hafta): kukurt %89.8, gubre %95.4, cimento %95.2 hafta boyunca fiyat
 * TAVANINDA — gubre tesisi 34 tane kurulu ve marji %100 hafta pozitif oldugu
 * halde arz 0.1'e karsi talep 37.6. Yani sorun yatirim istahi degildi;
 * zincirin en ustundeki hammadde hic buyumuyordu.
 *
 * Egri kasten ilimli: taban fiyatta carpan 1.0, tavanda 2.5, dip fiyatta
 * yavaslar — ucuz mal yavaslar, pahali mal hizlanir ama hicbiri anlik denge
 * kurmaz. Kitlik ve patlama iyidir; KALICI tavan degildir.
 */
const RGO_PRICE_DRIVE_MIN = 0.05;
const RGO_PRICE_DRIVE_MAX = 2.5;

function rgoPriceDrive(world, goodId) {
  const state = goodId ? world.market?.goods?.[goodId] : null;
  if (!state) return 1;
  // Eski kayitlarda basePrice yok: oran 1 kabul edilir (notr, eski davranis).
  const base = state.basePrice ?? state.price;
  if (!(base > 0)) return 1;
  // ORANIN KENDISI. Eski formul `0.5 + oran*0.5` idi ve TABANI 0.5'ti: fiyati
  // cokmus mal bile yarim hizla gelismeye devam ediyordu. Olculdu (1040 hafta,
  // rgo-sweep): dunya arz/talep orani 1.50'den 2.03'e TIRMANIYOR ve fiyat
  // endeksi 1.01'den 0.49'a iniyor — cunku degersiz tarlaya yatirim hic
  // durmuyordu. Yatirim urunun degeriyle orantilidir: taban fiyatta 1.0,
  // yarisinda 0.5, bantta cakili malda neredeyse durur.
  return clamp(state.price / base, RGO_PRICE_DRIVE_MIN, RGO_PRICE_DRIVE_MAX);
}

/**
 * ARZ TEPKISININ ASAGI YONU. `rgoPriceDrive` pahali mali hizlandirir ama
 * ucuz mal icin fren yoktu: 2026-09-04 `audit:market` 42 malin 17'sini bantta
 * cakili buldu, 14'u TABANDA. Alicisiz mal uretilmeye devam ediyor, kimse
 * tarlayi kucultmuyordu. Vic2'de bu tarlanin isleri erir, halk baska ise gocer.
 *
 * Olcek [RGO_DEMAND_MIN, 1] ve artik MAL BASINA: fiyat tabana indikce hedef
 * yarim tarlaya iner, fiyat toparlaninca 1'e doner; haftada
 * RGO_DEMAND_APPROACH kadar yaklasir (yariya inmek ~4 yil).
 */
const RGO_DEMAND_MIN = 0.5;
const RGO_DEMAND_APPROACH = 0.004;

function updateDemandScale(world, econ, goodId) {
  const state = goodId ? world.market?.goods?.[goodId] : null;
  const current = econ.demand?.[goodId];
  const scale = Number.isFinite(current) ? current : 1;
  if (!state) return;
  const base = state.basePrice ?? state.price;
  if (!(base > 0)) return;
  // Taban fiyatin yarisi ve alti tam frendir; taban fiyat ve ustu frensiz.
  const target = clamp(Math.sqrt(state.price / base), RGO_DEMAND_MIN, 1);
  const next = clamp(scale + (target - scale) * RGO_DEMAND_APPROACH, RGO_DEMAND_MIN, 1);
  // Tam tarlada alan yazilmaz: kayit ve kopya kucuk kalir, 1 varsayilandir.
  if (next >= 1 && !Number.isFinite(current)) return;
  (econ.demand ??= {})[goodId] = next;
}

/**
 * ACLIKTAN OLUM KALDIRILDI — Victoria'da boyle bir sey yok.
 *
 * Eski kural: `needsMet` (BUTUN sepetin karsilanma orani) 0.5'in altina
 * duserse nufus haftada `famine * 0.0012` oraninda ERIYORDU. Iki ayri hatasi
 * vardi ve ikisi de olculdu:
 *
 *   1. Yanlis kapi. Sepet gida + giyim + likor + mobilya + telefon demekti.
 *      Sarap alamayan ulke "aclik" sayiliyordu. (economy.js FOOD_GOODS artik
 *      gida yarisini ayiriyor ve hane once onu aliyor.)
 *   2. Yanlis sonuc. Erime MONOTONDU: taban yoktu, bir kez cizginin altina
 *      dusen ulke geri donemiyordu. 110 haftalik kampanyada dunya nufusu
 *      %62-70 eriyor, son haftada hala dusuyordu.
 *
 * Yerine Victoria'nin yaptigi sey: karsilanmayan ihtiyac nufusu OLDURMEZ,
 * buyumeyi durdurur ve sinif atlamayi (promotion) askiya alir. Nufus kaybi
 * artik yalnizca savas ve isgal yoluyla olur — yani oyuncunun gorebildigi bir
 * sebeple.
 *
 * `famineDeaths` alani KORUNUR: savas/isgal kaynakli dusus hala oraya yazilir
 * ve ekran onu okur.
 */
const FOOD_FLOOR = 0.25;

/**
 * RGO işgücü ölçeği: çalışan iş gücünün KURULUŞ kadrosuna oranı. Ölçü
 * güncel kadro değil kuruluş kadrosudur: güncel kadroya bölünürken gelişme
 * çıktıya hiç yansımıyordu (kapasite artıyor, oran 1'de kalıyordu).
 *
 * Kadro fazlası artık ÜRETMEZ. Eski model kadroyu aşan kırsal nüfusu azalan
 * getiriyle çıktıya katıyordu (3 kata kadar) ama aynı nüfusu işsiz de
 * sayıyordu — aynı insan hem tarlada hem kahvede. Fazla nüfusun yolu artık
 * gelişimdir: nüfus baskısı kadroyu büyüten gelişimi hızlandırır.
 */
export function rgoLaborScale(econ, jobs = rgoCapacityOf(econ)) {
  if (!econ || jobs <= 0) return 0;
  const employed = Math.min(rgoWorkforceOf(econ), jobs);
  return employed / Math.max(1, econ.rgoBaseJobs ?? jobs);
}

/** Küme econ'unun RGO istihdam durumu. `type` baskın kaynaktır. */
export function rgoStatusOf(econ) {
  const type = econ ? primaryResourceOf(econ) : null;
  if (!econ || !type) {
    return {
      type: null, jobs: 0, workforce: 0, employed: 0, unemployed: 0, vacancies: 0, efficiency: 0,
    };
  }
  const jobs = rgoJobsOf(econ);
  const workforce = rgoWorkforceOf(econ);
  const employed = Math.min(workforce, jobs);
  return {
    type,
    jobs,
    workforce,
    employed,
    unemployed: Math.max(0, workforce - jobs),
    vacancies: Math.max(0, jobs - workforce),
    efficiency: jobs > 0 ? employed / jobs : 0,
  };
}

/** Kare üzerinden okuma: aynı kümenin her karesi aynı durumu döndürür. */
export function provinceRgoStatus(tile) {
  return rgoStatusOf(tile?.province);
}

// rgoStatusOf'un tahsis yapmayan tekil okumalari: sicak donguler (haftalik
// uretim, dort haftalik goc) durum nesnesinin tek alanini istiyor; nesne
// kurmak olculebilir cop uretiyordu. Deger tanimlari rgoStatusOf ile birebir.
export function rgoUnemployedOf(econ) {
  if (!econ) return 0;
  return Math.max(0, rgoWorkforceOf(econ) - rgoJobsOf(econ));
}

export function rgoVacanciesOf(econ) {
  if (!econ) return 0;
  return Math.max(0, rgoJobsOf(econ) - rgoWorkforceOf(econ));
}

/**
 * Cikti nesnesinin olasi TUM anahtarlari (taban kalemler + butun RGO mallari).
 * Karalama nesnesi geri kullanilirken onceki cagridan kalan anahtarlar bu
 * listeyle sifirlanir; okuyucular 0 degeri zaten uretim yok sayar.
 */
const PROVINCE_OUTPUT_KEYS = [...new Set([
  'gold', 'food', 'timber', 'iron', 'coal',
  ...Object.values(RGO_TYPES).map((type) => type.goodId),
])];

/**
 * Kümenin haftalık çıktısı: kaynak satırlarının toplamı ve vergi tabanı.
 * Kısmi işgal üretimi payı kadar keser — hex hex ilerleyen ordu ekonomiyi
 * kademeli boğar, barış masasını beklemez.
 */
export function provinceOutput(world, province, out = null) {
  const econ = province?.econ;
  // Üretmeyen küme de kendi mallarını anahtar olarak taşımalı: çağıran taraf
  // `output[goodId]` okuyor ve eksik anahtar undefined dönüyordu.
  // `out` verilirse tahsis yerine karalama nesnesi sifirlanip doldurulur —
  // sicak toplayicilar (rawProduction, collectProvinceTotals) haftada binlerce
  // kez cagirir. Karalamanin omru cagri anidir; referansi saklama.
  let output;
  if (out) {
    output = out;
    for (const key of PROVINCE_OUTPUT_KEYS) output[key] = 0;
  } else {
    output = { gold: 0, food: 0, timber: 0, iron: 0, coal: 0 };
  }
  const lines = econ ? depositsOf(econ) : [];
  for (let i = 0; i < lines.length; i++) {
    const goodId = RGO_TYPES[lines[i].id]?.goodId;
    if (goodId) output[goodId] ??= 0;
  }
  if (!econ || province.owner < 0) return output;
  const occupied = occupiedShareOf(world, province);
  if (occupied >= 1) return output;
  const control = clamp(econ.control / 100, 0, 1) * (1 - occupied);
  // Teknoloji RGO verimini buyutur. Duz alan okumasi — technology.js import
  // edilmez (katman: world -> game yasak).
  const tech = 1 + (world.nations?.[province.owner]?.economy?.techMods?.rgoOutput ?? 0);
  const labor = rgoLaborScale(econ);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const type = RGO_TYPES[line.id];
    if (!type) continue;
    const development = type.track === 'agriculture' ? (econ.agriculture ?? 0) : (econ.extraction ?? 0);
    output[type.goodId] += type.baseOutput * RGO_OUTPUT_SCALE
      * line.quality * (1 + development * 0.18)
      * labor * control * line.hexes * tech
      * demandScaleOf(econ, type.goodId);
  }
  // Vergi tabanı kare başına eski ölçekte: nüfus hex payına indirgenir,
  // toplam hex sayısıyla geri çarpılır.
  const taxpayerScale = clamp(
    econ.population / (7000 * POPULATION_SCALE * econ.hexes), 0, 2.2,
  );
  // Çekirdek olmayan toprak (koloni, fetih) tam vergi vermez: sömürü gelir
  // getirir ama ev toprağı gibi işlemez — Vic2'nin non-core mantığı.
  const coreScale = province.coreOf === province.owner ? 1 : 0.55;
  output.gold = (0.08 + (econ.baseGold ?? 0) * 0.05 + econ.commerce * 0.09)
    * taxpayerScale * control * econ.hexes * coreScale;
  return output;
}

/**
 * Province migration is resolved as aggregated 100-person cohorts every four
 * weeks. No individual POP objects or pathfinding are created: unemployed
 * residents move to another RGO with vacancies inside the same country.
 */
export function runProvinceMigration(world, force = false) {
  const byNation = new Map();
  for (const nation of world.nations) {
    if (nation.economy) nation.economy.internalMigration = 0;
  }
  for (const province of world.provinces ?? []) {
    if (!province.econ) continue;
    province.econ.migration = 0;
    // Savaş bölgesi göçe kapalı: kısmen bile işgal edilmiş küme ne verir ne alır.
    if (province.owner < 0 || !world.nations[province.owner]?.alive
      || occupiedShareOf(world, province) > 0) continue;
    if (!byNation.has(province.owner)) byNation.set(province.owner, []);
    byNation.get(province.owner).push(province);
  }
  if (!force && (world.turn ?? 0) % MIGRATION_INTERVAL !== 0) return 0;

  let totalMoved = 0;
  for (const [nationId, provinces] of byNation) {
    // Sanayileşen küme de nüfus çeker. Fabrika kadrosu economy.js tarafından
    // `jobs` alanına yazılır; kümesi kare koordinatından çözülür — bu dosyanın
    // ekonomi katmanını import etmesi gerekmez.
    const factoryVacancies = new Map();
    for (const factory of world.nations[nationId]?.economy?.factories ?? []) {
      const tile = world.get(factory.q, factory.r);
      if (!tile || tile.provinceId < 0) continue;
      factoryVacancies.set(
        tile.provinceId,
        (factoryVacancies.get(tile.provinceId) ?? 0)
          + Math.max(0, (factory.jobs ?? 0) - (factory.employees ?? 0)),
      );
    }
    const cityOf = (province) => province.tileIdx.some((idx) => world.tiles[idx].city);
    const donors = provinces
      .map((province) => ({ province, surplus: rgoUnemployedOf(province.econ) }))
      .filter((row) => row.surplus >= MIGRATION_COHORT)
      .sort((a, b) => b.surplus - a.surplus);
    const receivers = provinces.map((province) => ({
      province,
      city: cityOf(province),
      vacancies: province.econ.control >= 50
        ? rgoVacanciesOf(province.econ) + (factoryVacancies.get(province.id) ?? 0)
        : 0,
    }))
      .filter((row) => row.vacancies >= MIGRATION_COHORT)
      .sort((a, b) => (
        (b.city ? 1 : 0) - (a.city ? 1 : 0)
        || b.province.econ.control - a.province.econ.control
        || b.vacancies - a.vacancies
      ));
    let receiverIndex = 0;
    let nationMoved = 0;
    for (const donor of donors) {
      let movable = Math.floor(Math.min(
        donor.surplus,
        Math.max(MIGRATION_COHORT, donor.province.econ.population * MIGRATION_RATE),
      ) / MIGRATION_COHORT) * MIGRATION_COHORT;
      while (movable >= MIGRATION_COHORT && receiverIndex < receivers.length) {
        const receiver = receivers[receiverIndex];
        if (receiver.province === donor.province) {
          receiverIndex++;
          continue;
        }
        const open = rgoVacanciesOf(receiver.province.econ)
          + (factoryVacancies.get(receiver.province.id) ?? 0);
        const vacancies = Math.floor(open / MIGRATION_COHORT) * MIGRATION_COHORT;
        if (vacancies < MIGRATION_COHORT) {
          receiverIndex++;
          continue;
        }
        const moved = Math.min(movable, vacancies);
        donor.province.econ.population -= moved;
        receiver.province.econ.population += moved;
        donor.province.econ.migration -= moved;
        receiver.province.econ.migration += moved;
        movable -= moved;
        nationMoved += moved;
        totalMoved += moved;
      }
      if (receiverIndex >= receivers.length) break;
    }
    world.nations[nationId].economy.internalMigration = nationMoved;
    world.nations[nationId].economy.lastInternalMigration = nationMoved;
    world.nations[nationId].economy.lastMigrationTurn = world.turn ?? 0;
  }
  return totalMoved;
}

// Ulus basina baris bayragi ve alt sinif payi karalamasi; omru tek
// runProvinces cagrisidir.
const atPeaceScratch = [];
const lowerShareScratch = [];

export function runProvinces(game) {
  const world = game.world;

  // Baris durumu ulus basina degismez; province basina butun uluslari
  // taramak hem O(kume x ulus) fazladan is hem kapanis (closure) copuydu.
  const atPeace = atPeaceScratch;
  atPeace.length = world.nations.length;
  for (const nation of world.nations) {
    let peace = true;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (world.relations?.[nation.id]?.[other.id]?.state === 'war') {
        peace = false;
        break;
      }
    }
    atPeace[nation.id] = peace;
    const economy = nation.economy;
    lowerShareScratch[nation.id] = economy?.population > 0
      && Number.isFinite(economy.classes?.lower?.population)
      ? clamp(economy.classes.lower.population / economy.population, 0, 1)
      : LOWER_SHARE_DEFAULT;
  }

  const provinces = world.provinces ?? [];
  // Kultur pasinin iki ciktisi dongu SONUNA birikir (bkz. culture.js):
  // asimilasyonla rengi degisen kumeler ve ayaklanan kumeler.
  const recolored = [];
  const revolts = [];
  // Kitlik olumleri ACIK bir muhasebe kanalidir: nufus dususu "kayip insan"
  // degil kayitli olumdur — korunum denetimi ve ekran bu sayaci okur.
  for (const nation of world.nations) {
    if (!nation.economy) continue;
    nation.economy.famineDeaths = 0;
  }
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    const econ = province.econ;
    if (!econ) continue;
    // Sahiplik türetmesi: savaşta üye kareler tek tek el değiştirir (hex hex
    // işgal); hukuk çoğunluğu izler. Barış devri bütün kümeyi taşıdığında bu
    // türetme değişmeden doğru kalır.
    refreshProvinceOwner(world, province);
    if (province.owner < 0) continue;
    const nation = world.nations[province.owner];
    if (!nation?.alive) continue;
    const occupied = occupiedShareOf(world, province);
    if (occupied >= 1) {
      econ.control = clamp(econ.control - 2, 5, 100);
      continue;
    }
    const stability = Math.max(0.1, Math.min(1, nation.economy?.stability ?? 0.6));
    // RGO yalnız alt sınıfı çalıştırır (bkz. rgoWorkforceOf); pay haftalık.
    econ.lowerShare = lowerShareScratch[nation.id];
    const citizenship = lawValue(nation, 'citizenship');
    const minorityControl = citizenship === 'full_citizenship'
      ? 1.25
      : citizenship === 'limited_citizenship' ? 0.85 : 0.6;
    // AZINLIK HAKLARI TAVANI. Vatandaslik yasasi hem sadakatin ne kadar HIZLI
    // oturdugunu hem NEREYE KADAR oturdugunu soyler. Eski `political_rights`
    // merdiveni yalnizca orta sinif moraline giriyordu ve olculdu
    // (audit:mechanics): butun menzil gurultunun 0.57 kati, yani yoktu. Hiz
    // vermek yetmezdi — baris zamaninda sadakat zaten tavana ciker. Tavan
    // kalicidir ve dogrudan uretimdedir (provinceOutput ciktiyi sadakatle
    // olcekler).
    const ceiling = province.culture === nation.culture
      ? 100
      : 100 * (lawModifiers(nation).minorityCeiling ?? 1);
    // Kısmi işgal sadakati aşındırır: kazanım payı, sağlam kalan toprağın oranı.
    // HUZURSUZLUK KAZANCI YER (bkz. culture.js): huzursuz kümede sadakat önce
    // yavaşlar, eşiğe yaklaşınca geriler — üretim ve vergi zaten sadakatle
    // ölçekli olduğu için mekanik isyandan ÖNCE hissedilir.
    const drag = (econ.unrest ?? 0) * CULTURE.CONTROL_DRAG;
    econ.control = clamp(
      econ.control + (((province.culture === nation.culture ? 1.5 : minorityControl)
        * (0.45 + stability)) - drag) * (1 - occupied) - occupied * 2,
      0,
      ceiling,
    );
    const peace = atPeace[nation.id];
    // Sağlık harcaması büyümeyi hızlandırır (bkz. economy.js SOCIAL_PROGRAMS);
    // veri doğrudan okunuyor, economy.js'i import etmek katman döngüsü olurdu.
    // Saglik refaha katildi: buyume carpani artik refah butcesinden gelir
  // (bkz. economy.js SOCIAL_PROGRAMS notu). Veri dogrudan okunuyor, economy.js
  // import etmek katman dongusu olurdu.
  const health = 1 + Math.min(100, nation.economy?.social?.welfare ?? 0) / 100 * 0.35;
    // Beslenme: sepetinin ne kadarini fiilen alabildigi (bkz. economy.js
    // populationDemand). Bu bag yokken kitligin nufusta hicbir karsiligi
    // yoktu — dunya tahil uretimi TAMAMEN kesildiginde bile 120 haftalik
    // nufus farki %0.0 olcusundeydi. Ac nufus once buyumeyi durdurur, uzayan
    // aclik ise nufusu eritir.
    // GIDA, sepet degil (bkz. economy.js FOOD_GOODS / foodMet).
    const nourishment = clamp(nation.economy?.foodMet ?? 1, 0, 1);
    // Taban Vic2 ölçeğinde: en iyi koşulda yılda ~%0.9, yüzyılda ~2.3 kat
    // (1836-1936 gerçeği ~1.75 kat). Eski katsayılar yüzyılda ~4.6 kat
    // veriyordu ve hiçbir RGO kapasitesi bunu kovalayamıyordu (ölçüldü,
    // bkz. market-diagnostic). İşgal payı büyümeyi de payı kadar keser.
    // Buyume ASLA EKSIYE DUSMEZ. Ac ulke buyumez, erimez: carpan 0'a yaklasir.
    // FOOD_FLOOR bilerek 0: gidasi hic karsilanmayan ulke tamamen durur.
    const foodFactor = Math.max(0, nourishment - FOOD_FLOOR) / (1 - FOOD_FLOOR);
    const weeklyGrowth = ((0.00006 + econ.agriculture * 0.00003)
      * (peace ? 1 : 0.55) * (0.45 + stability) * health
      * foodFactor) * (1 - occupied);
    const previousPopulation = econ.population;
    econ.population = Math.max(
      0,
      Math.round(econ.population * (1 + weeklyGrowth)),
    );
    if (econ.population < previousPopulation && nation.economy) {
      nation.economy.famineDeaths += previousPopulation - econ.population;
    }

    // Gelişme yalnız düzenin oturduğu yerde birikir: savaş, işgal ve kaos durdurur.
    const lines = depositsOf(econ);
    if (peace && occupied === 0 && econ.control > 80) {
      // Nüfus baskısı gelişmeyi hızlandırır: kadroyu aşan her el yeni tarla
      // açar, yeni kuyu kazar (gerekçe ölçümleri için git geçmişine bakınız).
      const jobs = rgoJobsOf(econ);
      const pressure = jobs > 0 ? clamp(rgoWorkforceOf(econ) / jobs - 1, 0, 2) : 0;
      const pace = RGO_DEVELOPMENT_PER_WEEK * stability * (1 + pressure * 1.5);
      // İki iz kümede birlikte bulunabilir; her iz kendi satırlarının hex
      // ağırlıklı fiyat sinyaliyle gelişir.
      let agHexes = 0;
      let agDrive = 0;
      let exHexes = 0;
      let exDrive = 0;
      for (let i = 0; i < lines.length; i++) {
        const type = RGO_TYPES[lines[i].id];
        if (!type) continue;
        const drive = rgoPriceDrive(world, type.goodId) * lines[i].hexes;
        if (type.track === 'agriculture') {
          agHexes += lines[i].hexes;
          agDrive += drive;
        } else {
          exHexes += lines[i].hexes;
          exDrive += drive;
        }
      }
      if (agHexes > 0) {
        econ.agriculture = Math.min(RGO_DEVELOPMENT_CAP, (econ.agriculture ?? 0) + pace * (agDrive / agHexes));
      }
      if (exHexes > 0) {
        econ.extraction = Math.min(RGO_DEVELOPMENT_CAP, (econ.extraction ?? 0) + pace * (exDrive / exHexes));
      }
    }
    // Piyasa her kosulda konusur: savas ve isgal gelismeyi durdurur ama
    // alicisiz tarlanin kuculmesini durdurmaz.
    for (let i = 0; i < lines.length; i++) {
      const goodId = RGO_TYPES[lines[i].id]?.goodId;
      if (goodId) updateDemandScale(world, econ, goodId);
    }

    // KULTUR: huzursuzluk birikir, asimilasyon paylari kaydirir. Isyan bu
    // dongude COZULMEZ — sahiplik degistirmek ayni taramada okunan durumu
    // bozar; kume kimligi kuyruga yazilir, dongu bitince cozulur.
    const culture = runProvinceCulture(world, province, nation, {
      occupied, turn: game.turns.turn,
    });
    if (culture.recolored) recolored.push(province);
    if (culture.revolt) revolts.push(province.id);
  }
  if (recolored.length) {
    const tiles = [];
    for (const province of recolored) {
      for (const idx of province.tileIdx ?? []) tiles.push(world.tiles[idx]);
    }
    game.renderer.invalidateTiles(tiles.filter(Boolean));
  }
  if (revolts.length) resolveRevolts(game, revolts);
  // Küme sayaçları: HUD ve hegemonya gerçek province sayısını okur.
  for (const nation of world.nations) nation.provinces = 0;
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    if (province.owner >= 0 && world.nations[province.owner]) {
      world.nations[province.owner].provinces++;
    }
  }
  runProvinceMigration(world);
  game.emit('provinces', null);
}
