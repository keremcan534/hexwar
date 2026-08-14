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
import { policyOf } from './politics.js';
import { controllerOf } from './control.js';
import { DEFAULT_ZONE, ZONE_RULES } from '../world/macro.js';

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
  SULPHUR: {
    id: 'SULPHUR', goodId: 'sulphur', name: 'Sulphur Mines', icon: '🜍', hue: 48,
    track: 'extraction', baseOutput: 0.18,
  },
  OIL: {
    id: 'OIL', goodId: 'oil', name: 'Oil Derricks', icon: '🛢', hue: 12,
    track: 'extraction', baseOutput: 0.162,
  },
};

export const MIGRATION_INTERVAL = 4;
export const MIGRATION_COHORT = 100;
export const MIGRATION_RATE = 0.04;


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Tek karenin RGO ağırlık vektörü; küme seçimi üyelerin toplamından yapılır. */
function rgoWeightsOf(tile) {
  const yields = tile.terrain.yields;
  const terrain = tile.terrain.id;
  const rugged = terrain === 'HILLS' || terrain === 'MOUNTAIN';
  const tropical = terrain === 'JUNGLE';
  const open = terrain === 'PLAINS' || terrain === 'GRASSLAND';
  const arid = terrain === 'DESERT' || terrain === 'TUNDRA';
  // Tahılın ağırlığı bilerek yüksek: erzak çökerse ordular dağılır. Egzotik
  // kaynaklar yalnız kendi arazilerinde ve düşük ağırlıkla çıkar.
  return [
    ['GRAIN', 2.5 + yields.food * 5 + (open ? 2 : 0)],
    ['CATTLE', 0.5 + (open ? 2 : 0) + (terrain === 'TUNDRA' ? 0.8 : 0)],
    ['FISH', tile.coastal ? 3 : 0],
    ['FRUIT', 0.3 + (open ? 1 : 0) + (tropical ? 1.2 : 0)],
    ['COTTON', 0.2 + (open ? 1.2 : 0) + (terrain === 'BEACH' ? 0.6 : 0)],
    ['SILK', 0.15 + (tropical ? 0.7 : 0)],
    ['DYE', 0.2 + (tropical ? 0.6 : 0) + (open ? 0.3 : 0)],
    ['TIMBER', 0.6 + yields.timber * 5.5],
    ['TROPICAL_WOOD', tropical ? 2.2 : 0],
    ['RUBBER', tropical ? 2 : 0],
    ['IRON', 0.6 + yields.iron * 5 + (rugged ? 1.5 : 0)],
    ['COAL', 0.35 + (rugged ? 4 : 0) + (terrain === 'FOREST' ? 0.5 : 0)],
    ['SULPHUR', 0.15 + (rugged ? 1.2 : 0) + (terrain === 'DESERT' ? 0.5 : 0)],
    ['OIL', 0.1 + (arid ? 1.4 : 0)],
  ];
}

/**
 * Kümenin TEK RGO'su (Vic2 kuralı). Zar, rastgele seçilen bir ÜYENİN eski
 * kare ağırlıklarıyla atılır — ağırlıkları toplamak çoğunluk arazisini
 * kayırıyor, dağınık azınlık kaynakları (tepe kömürü, karışık orman) dünya
 * genelinde eksiliyor du (ölçüldü: kömür −%30, kereste −%22). Üye örneklemesi
 * beklenen dağılımı kare-tabanlı eski dağılıma birebir oturtur. Zar kümenin
 * merkez koordinatına bağlı dalla atılır: kayıt/yükleme arasında kaymaz.
 */
function weightedRgo(world, province) {
  const rng = makeRng(`${world.seed}-rgo-${province.center.q}:${province.center.r}`);
  const sample = world.tiles[province.tileIdx[rng.int(0, province.tileIdx.length - 1)]];
  const weights = rgoWeightsOf(sample);
  let roll = rng() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  let rgo = 'GRAIN';
  for (const [id, weight] of weights) {
    roll -= weight;
    if (roll <= 0) { rgo = id; break; }
  }
  return { id: rgo, quality: rng.range(0.85, 1.15), jobsRatio: rng.range(0.72, 0.88) };
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
  population *= rule.popMul;
  const selected = weightedRgo(world, province);
  const track = RGO_TYPES[selected.id].track;
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
    rgo: selected.id,
    rgoQuality: selected.quality,
    rgoBaseJobs: Math.max(1000, Math.round(population * selected.jobsRatio / 100) * 100),
    rgoBaseDevelopment: track === 'agriculture' ? agriculture : extraction,
    migration: 0,
    industrialEmployees: 0,
    industrialJobs: 0,
  };
}

function ensureProvinceRgo(world, province) {
  const econ = province.econ;
  if (!econ) return null;
  const selected = weightedRgo(world, province);
  if (!RGO_TYPES[econ.rgo]) econ.rgo = selected.id;
  if (!Number.isFinite(econ.rgoQuality)) econ.rgoQuality = selected.quality;
  if (!Number.isFinite(econ.rgoBaseJobs)) {
    econ.rgoBaseJobs = Math.max(
      1000,
      Math.round(econ.population * selected.jobsRatio / 100) * 100,
    );
  }
  const type = RGO_TYPES[econ.rgo];
  if (!Number.isFinite(econ.rgoBaseDevelopment)) {
    econ.rgoBaseDevelopment = econ[type.track] ?? 0;
  }
  if (!Number.isFinite(econ.migration)) econ.migration = 0;
  if (!Number.isFinite(econ.hexes)) econ.hexes = province.tileIdx.length;
  return econ;
}

export function initProvinces(world) {
  world.forEach((tile) => { tile.province = null; });
  for (const province of world.provinces ?? []) {
    province.econ = initialProvinceEcon(world, province);
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

export function ensureProvinces(world) {
  for (const province of world.provinces ?? []) {
    if (!province.econ) {
      province.econ = initialProvinceEcon(world, province);
    }
    ensureProvinceRgo(world, province);
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

/**
 * Kümenin hukuki sahibi üye çoğunluğundan türetilir. Savaşta kareler tek tek
 * el değiştirebildiği için (hex hex işgal) küme geçici olarak karışık
 * kalabilir; ekonomi çoğunluğun devletine akar.
 */
export function refreshProvinceOwner(world, province) {
  const votes = new Map();
  for (const idx of province.tileIdx) {
    const owner = world.tiles[idx].owner;
    votes.set(owner, (votes.get(owner) ?? 0) + 1);
  }
  let winner = -1;
  let winnerVotes = -1;
  for (const [owner, count] of votes) {
    if (count > winnerVotes || (count === winnerVotes && owner < winner)) {
      winner = owner;
      winnerVotes = count;
    }
  }
  province.owner = winner;
  return winner;
}

/** İşgal payı: sahibinden başkasının fiilen kontrol ettiği üye oranı. */
export function occupiedShareOf(world, province) {
  if (province.owner < 0) return 0;
  let occupied = 0;
  for (const idx of province.tileIdx) {
    if (controllerOf(world.tiles[idx]) !== province.owner) occupied++;
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

/** Küme econ'unun RGO kadrosu; gelişim kadroyu 500'lük adımlarla açar. */
export function rgoJobsOf(econ) {
  const type = RGO_TYPES[econ?.rgo];
  if (!econ || !type) return 0;
  const developed = Math.max(0, (econ[type.track] ?? 0) - (econ.rgoBaseDevelopment ?? 0));
  return Math.max(1000, Math.round((econ.rgoBaseJobs + developed * 500) / 100) * 100);
}

/** Kare üzerinden okuma: tile.province paylaşılan küme econ'udur. */
export function provinceRgoJobs(tile) {
  return rgoJobsOf(tile?.province);
}

/**
 * RGO gelişimi: tarla ve maden kendiliğinden verimlenmez, barış ve istikrar
 * ister. Bu olmadan `agriculture`/`extraction` dünya üretiminde bir kez atanıp
 * bir daha hiç değişmiyor, dolayısıyla `provinceRgoJobs`teki `developed * 500`
 * terimi yapısal olarak hep 0 kalıyordu. Sonucu ölçüldü: 40 yılda hammadde
 * arzı +%14, sanayi talebi +%489, bütün hammaddeler fiyat tavanında ve alt
 * zincirler ölü (bkz. market-diagnostic).
 *
 * Hız, iyi yönetilen bir province'in yüzyılda ~6 kademe kazanacağı şekilde
 * seçildi: kapasite ~1.8, verim ~1.8 kat artar. Oyuncuya iş çıkarmaz —
 * mikro yönetim mobilde en pahalı maliyet (bkz. CLAUDE.md).
 */
const RGO_DEVELOPMENT_PER_WEEK = 0.0011;
const RGO_DEVELOPMENT_CAP = 10;

/**
 * Sepetinin bu oranindan azini alabilen nufus aclik cekmeye baslar. %50 bilerek
 * comert: eksik luks tuketim olum demek degildir, asil kirilma temel gidanin
 * alinamamasidir.
 */
const FAMINE_THRESHOLD = 0.5;
/**
 * Tam aclikta haftalik nufus kaybi. 0.0012 ile bes yillik (260 hafta) toplam
 * aclik nufusu ~%27 eritir: gorunur ve geri donulebilir bir felaket, anlik
 * cokus degil.
 */
const FAMINE_DECLINE = 0.0012;

/**
 * Fazla nüfusun RGO çıktısını ne kadar büyütebileceğinin tavanı. Sınırsız
 * olsaydı kalabalık province tek başına dünya arzını karşılardı.
 */
const RGO_LABOR_CAP = 3;

/** Fazla işgücünün azalan getirisi; 1 doğrusal, 0 hiç katkı yok demektir. */
const RGO_LABOR_FALLOFF = 0.75;

/**
 * RGO işgücü ölçeği. Kadro dolana kadar doluluk oranıdır — yani eksik nüfuslu
 * province eskisi gibi az üretir. Kadro dolduktan sonrası yeni: gelen fazla
 * nüfus azalan getiriyle çıktıyı büyütmeye devam eder.
 *
 * Bu bağ yokken çıktı `development`e çakılıydı ve development dünya üretiminde
 * bir kez atanıp bir daha hiç artmıyordu. Sonuç ölçüldü: 40 yılda hammadde
 * arzı +%14, sanayi talebi +%489; bütün hammaddeler fiyat tavanına yapışıyor,
 * girdisi 8 katına çıkan fabrikalar işçi alamıyordu (bkz. market-diagnostic).
 */
export function rgoLaborScale(province, jobs) {
  if (!province || jobs <= 0) return 0;
  // Fabrikada çalışan tarlada çalışmıyor. Bu ayrım olmadan şehir province'i
  // nüfusuyla birlikte hem sanayi hem hammadde üretiyor gibi görünüyordu.
  const rural = Math.max(0, province.population - (province.industrialEmployees ?? 0));
  // Ölçü *kuruluş* kadrosudur, güncel kadro değil. Güncel kadroya bölünürken
  // gelişme çıktıya hiç yansımıyordu: kapasite artıyor, göç kırsal nüfusu yeni
  // kadroya eşitliyor, oran 1'de kalıyor, üretim yerinde sayıyordu.
  const base = Math.max(1, province.rgoBaseJobs ?? jobs);
  const ratio = rural / base;
  if (ratio <= 1) return ratio;
  return Math.min(RGO_LABOR_CAP, ratio ** RGO_LABOR_FALLOFF);
}

/** Küme econ'unun RGO istihdam durumu. */
export function rgoStatusOf(econ) {
  const type = RGO_TYPES[econ?.rgo];
  if (!econ || !type) return {
    type: null, jobs: 0, employed: 0, unemployed: 0, vacancies: 0, efficiency: 0,
  };
  const jobs = rgoJobsOf(econ);
  const employed = Math.min(Math.max(0, econ.population), jobs);
  return {
    type,
    jobs,
    employed,
    unemployed: Math.max(0, econ.population - jobs),
    vacancies: Math.max(0, jobs - econ.population),
    efficiency: jobs > 0 ? employed / jobs : 0,
  };
}

/** Kare üzerinden okuma: aynı kümenin her karesi aynı durumu döndürür. */
export function provinceRgoStatus(tile) {
  return rgoStatusOf(tile?.province);
}

/**
 * Kümenin haftalık ulusal bütçe katkısı. Çıktı üye sayısıyla (hexes) ölçekli:
 * eskiden her kare kendi RGO'suyla üretiyordu, şimdi tek RGO kümenin tüm
 * toprağını işliyor. Kısmi işgal üretimi payı kadar keser — hex hex ilerleyen
 * ordu ekonomiyi kademeli boğar, barış masasını beklemez.
 */
export function provinceOutput(world, province) {
  const econ = province?.econ;
  // Üretmeyen küme de kendi malını anahtar olarak taşımalı: çağıran taraf
  // `output[rgo.goodId]` okuyor ve eksik anahtar undefined dönüyordu.
  const output = { gold: 0, food: 0, timber: 0, iron: 0, coal: 0 };
  if (econ) output[RGO_TYPES[econ.rgo]?.goodId ?? 'food'] ??= 0;
  if (!econ || province.owner < 0) return output;
  const occupied = occupiedShareOf(world, province);
  if (occupied >= 1) return output;
  const control = clamp(econ.control / 100, 0, 1) * (1 - occupied);
  const status = rgoStatusOf(econ);
  if (!status.type) return output;
  const development = econ[status.type.track] ?? 0;
  output[status.type.goodId] = status.type.baseOutput
    * econ.rgoQuality * (1 + development * 0.18)
    * rgoLaborScale(econ, status.jobs) * control * econ.hexes;
  // Vergi tabanı kare başına eski ölçekte: nüfus hex payına indirgenir,
  // toplam hex sayısıyla geri çarpılır.
  const taxpayerScale = clamp(econ.population / (7000 * econ.hexes), 0, 2.2);
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
      .map((province) => ({ province, surplus: rgoStatusOf(province.econ).unemployed }))
      .filter((row) => row.surplus >= MIGRATION_COHORT)
      .sort((a, b) => b.surplus - a.surplus);
    const receivers = provinces.map((province) => ({
      province,
      city: cityOf(province),
      vacancies: province.econ.control >= 50
        ? rgoStatusOf(province.econ).vacancies + (factoryVacancies.get(province.id) ?? 0)
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
        const open = rgoStatusOf(receiver.province.econ).vacancies
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

export function runProvinces(game) {
  const world = game.world;

  for (const province of world.provinces ?? []) {
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
    const citizenship = policyOf(nation, 'citizenship');
    const minorityControl = citizenship === 'full_citizenship'
      ? 1.25
      : citizenship === 'limited_citizenship' ? 0.85 : 0.6;
    // Kısmi işgal sadakati aşındırır: kazanım payı, sağlam kalan toprağın oranı.
    econ.control = clamp(
      econ.control + ((province.culture === nation.culture ? 1.5 : minorityControl)
        * (0.45 + stability)) * (1 - occupied) - occupied * 2,
      0,
      100,
    );
    const peace = world.nations.every(
      (other) => !other.alive || other.id === nation.id
        || world.relations?.[nation.id]?.[other.id]?.state !== 'war',
    );
    // Sağlık harcaması büyümeyi hızlandırır (bkz. economy.js SOCIAL_PROGRAMS);
    // veri doğrudan okunuyor, economy.js'i import etmek katman döngüsü olurdu.
    const health = 1 + Math.min(100, nation.economy?.social?.health ?? 0) / 100 * 0.35;
    // Beslenme: sepetinin ne kadarini fiilen alabildigi (bkz. economy.js
    // populationDemand). Bu bag yokken kitligin nufusta hicbir karsiligi
    // yoktu — dunya tahil uretimi TAMAMEN kesildiginde bile 120 haftalik
    // nufus farki %0.0 olcusundeydi. Ac nufus once buyumeyi durdurur, uzayan
    // aclik ise nufusu eritir.
    const nourishment = clamp(nation.economy?.needsMet ?? 1, 0, 1);
    const famine = nourishment < FAMINE_THRESHOLD
      ? (FAMINE_THRESHOLD - nourishment) / FAMINE_THRESHOLD : 0;
    // Taban Vic2 ölçeğinde: en iyi koşulda yılda ~%0.9, yüzyılda ~2.3 kat
    // (1836-1936 gerçeği ~1.75 kat). Eski katsayılar yüzyılda ~4.6 kat
    // veriyordu ve hiçbir RGO kapasitesi bunu kovalayamıyordu (ölçüldü,
    // bkz. market-diagnostic). İşgal payı büyümeyi de payı kadar keser.
    const weeklyGrowth = ((0.00006 + econ.agriculture * 0.00003)
      * (peace ? 1 : 0.55) * (0.45 + stability) * health
      * (0.25 + 0.75 * nourishment)) * (1 - occupied)
      - famine * FAMINE_DECLINE;
    econ.population = Math.max(
      0,
      Math.round(econ.population * (1 + weeklyGrowth)),
    );

    // Gelişme yalnız düzenin oturduğu yerde birikir: savaş, işgal ve kaos durdurur.
    const track = RGO_TYPES[econ.rgo]?.track;
    if (track && peace && occupied === 0 && econ.control > 80) {
      // Nüfus baskısı gelişmeyi hızlandırır: kadroyu aşan her el yeni tarla
      // açar, yeni kuyu kazar (gerekçe ölçümleri için git geçmişine bakınız).
      const jobs = rgoJobsOf(econ);
      const rural = Math.max(0, econ.population - (econ.industrialEmployees ?? 0));
      const pressure = jobs > 0 ? clamp(rural / jobs - 1, 0, 2) : 0;
      econ[track] = Math.min(
        RGO_DEVELOPMENT_CAP,
        (econ[track] ?? 0)
          + RGO_DEVELOPMENT_PER_WEEK * stability * (1 + pressure * 1.5),
      );
    }
  }
  // Küme sayaçları: HUD ve hegemonya gerçek province sayısını okur.
  for (const nation of world.nations) nation.provinces = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner >= 0 && world.nations[province.owner]) {
      world.nations[province.owner].provinces++;
    }
  }
  runProvinceMigration(world);
  game.emit('provinces', null);
}
