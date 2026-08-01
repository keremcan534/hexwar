// Şehirler ve ekonomi. Şehirler gelir üretir, birim satın alma noktasıdır,
// düşman birimi girdiğinde el değiştirir.

import { hexDistance, hexesInRange } from '../core/hex.js';
import { CITY_CENTER_YIELD, RESOURCES } from '../world/terrain.js';
import {
  applyBuildings, buildingArmyUpkeepRelief, buildingResearchDiscount, buildingStorage,
  buildingMaintenance, hasBuilding,
} from './buildings.js';
import { tileEfficiency } from './infamy.js';
import {
  techCorruptionBase, techFoodPerCity, techGoldPerCity, techIronPerCity, techStorageBonus,
} from './tech.js';
import { provinceOutput } from './provinces.js';
import { regimentCount, upkeepWeight } from './units.js';

/** Yeni şehir kurma bedeli ve şehirler arası asgari mesafe. */
export const CITY_COST = { gold: 60, timber: 4 };
export const CITY_MIN_DISTANCE = 4;

/** Şehrin işçi yerleştirebileceği yarıçap. */
export const WORK_RADIUS = 2;

/**
 * Birim bedelleri. Altın tek darboğaz olmasın diye maliyet dört kaynağa
 * bölündü; İzci kasten demirsiz, demirsiz doğan ülke kilitlenmesin.
 */
export const UNIT_COSTS = {
  INFANTRY: { gold: 25, iron: 1 },
  CAVALRY: { gold: 40, iron: 2 },
  ARTILLERY: { gold: 55, iron: 3, timber: 2 },
  WARSHIP: { gold: 30, iron: 1, timber: 3 },
};

/** Birim başına tur bakımı. Ordunun asıl freni artık erzak. */
export const UNIT_UPKEEP = { gold: 1, food: 1 };

/**
 * Ağır birimlerin demir gideri. Ölçümde demirin hiç sürekli gideri yoktu:
 * üretilip ambar tavanında ziyan oluyordu. Zırhlı birlik ve donanma artık
 * demir yer, böylece demir stratejik bir kısıt hâline gelir.
 */
export const IRON_UPKEEP_TYPES = { CAVALRY: 1, ARTILLERY: 2, WARSHIP: 1 };

/**
 * Bina onarımı: her iki bina bir kereste ister. Keresteye de sürekli bir gider
 * bağlanmadan şehir geliştirmek tek yönlü bir merdivendi.
 */
export function timberRepair(buildingCount) {
  return Math.floor(buildingCount / 2);
}

/** İşçi başına tüketim. İşçi net katkısı azalsın ki nüfus sonsuz büyümesin. */
export const WORKER_FOOD = 2;

/** Yeni şehir bu kadar erzakla başlar: kötü arazide doğan ülke ilk turda çökmesin. */
export const STARTING_FOOD_STORE = 60;

/**
 * Ambar kapasitesi. Tavan olmazsa demir/kereste birikip anlamsızlaşıyor
 * (ölçüm: 150 turda 2968 demir, 7464 kereste). Fazlası ziyan olur; bu,
 * ileride ticaretin de sebebi olacak.
 */
export function storageCap(cityCount, nation) {
  return 30 + cityCount * 5
    + (nation ? techStorageBonus(nation) : 0)
    + (nation?.budget?.storageBonus ?? 0);
}

export function emptyPool() {
  return { gold: 0, food: 0, timber: 0, iron: 0 };
}

export function canAfford(nation, cost) {
  return RESOURCES.every((r) => (nation[r] ?? 0) >= (cost[r] ?? 0));
}

export function pay(nation, cost) {
  if (!canAfford(nation, cost)) return false;
  for (const r of RESOURCES) nation[r] -= cost[r] ?? 0;
  return true;
}

export function formatCost(cost) {
  const parts = [];
  if (cost.gold) parts.push(`${cost.gold}⬤`);
  if (cost.iron) parts.push(`${cost.iron}⛏`);
  if (cost.timber) parts.push(`${cost.timber}🪵`);
  return parts.join(' ');
}

const NAME_A = ['White', 'Black', 'Blue', 'New', 'Old', 'Salt', 'Iron', 'High', 'Grand', 'Red'];
const NAME_B = ['haven', 'keep', 'port', 'bridge', 'pass', 'watch', 'field', 'hill', 'spring', 'wall'];
const LEGACY_NAME_A = new Map([
  ['Ak', 'White'], ['Kara', 'Black'], ['Gök', 'Blue'], ['Yeni', 'New'], ['Eski', 'Old'],
  ['Tuz', 'Salt'], ['Demir', 'Iron'], ['Alt', 'High'], ['Yüce', 'Grand'], ['Kızıl', 'Red'],
]);
const LEGACY_NAME_B = new Map([
  ['şehir', 'haven'], ['kale', 'keep'], ['liman', 'port'], ['köprü', 'bridge'],
  ['geçit', 'pass'], ['burç', 'watch'], ['ova', 'field'], ['tepe', 'hill'],
  ['pınar', 'spring'], ['sur', 'wall'],
]);

export function cityName(rng, used) {
  for (let i = 0; i < 40; i++) {
    const name = rng.pick(NAME_A) + rng.pick(NAME_B);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `City-${used.size + 1}`;
}

/** Eski Türkçe kayıtlardaki şehir adlarını oyuncuya İngilizce gösterir. */
export function englishCityName(name) {
  const numbered = /^Şehir-(\d+)$/.exec(name);
  if (numbered) return `City-${numbered[1]}`;
  for (const [oldPrefix, prefix] of LEGACY_NAME_A) {
    if (!name.startsWith(oldPrefix)) continue;
    const suffix = LEGACY_NAME_B.get(name.slice(oldPrefix.length));
    if (suffix) return prefix + suffix;
  }
  return name;
}

export function createCity(world, tile, nationId, name, level = 1, pop = 2) {
  const city = {
    id: world.cities.length + 1,
    name,
    tile,
    nationId,
    level,          // tahkimat kademesi: savunma ve çizim
    pop,            // işçi sayısı: ekonominin motoru
    // Nüfusun etnik bileşimi. Şehir el değiştirince **değişmez**: fethedilen
    // toprakta yabancı halkla yaşamak zorunda kalmak tasarımın çekirdeği.
    pops: { [tile.culture]: pop },
    worked: [],     // işlenen kareler; uzunluğu pop kadar
    buildings: [],
    foodStore: STARTING_FOOD_STORE,
    manualWorkers: false, // elle atama geldiğinde otomatik dağıtımı kilitler
  };
  tile.city = city;
  world.cities.push(city);
  return city;
}

/** Bir karede şehir kurulabilir mi? (kendi toprağın, karada, şehirlerden uzakta) */
export function canFoundCity(world, tile, nationId) {
  if (!tile || tile.city || !tile.terrain.passable || tile.owner !== nationId) return false;
  return world.cities.every(
    (c) => hexDistance(c.tile.q, c.tile.r, tile.q, tile.r) >= CITY_MIN_DISTANCE,
  );
}

/**
 * Büyüyen imparatorluğun verim kaybı (yolsuzluk/mesafe). Yalnız altına uygulanır;
 * erzak/kereste/demir fiziksel mallar, onları mesafe değil taşıma sınırlar.
 * Not: kültür ve infamy katmanı gelince bu elle konmuş fren kaldırılacak.
 */
function corruption(cityCount, nation) {
  const base = techCorruptionBase(nation);
  return base / (base + Math.max(0, cityCount - 1));
}

/** İdari giderin ilk kaç şehri bedava saydığı. Küçük ülke boğulmasın. */
const ADMIN_FREE_CITIES = 3;
// Ülkeler zaten ~85 province ile başlıyor; eşik bunun üstünde olmalı ki
// idari gider erken oyunun sabit vergisi değil, genişlemenin bedeli olsun.
const ADMIN_FREE_PROVINCES = 120;
/** Başkente bu mesafeden uzak şehir ayrıca idari yük getirir. */
const ADMIN_FREE_DISTANCE = 6;

/**
 * İdari gider: imparatorluk büyüdükçe artan *görünür* bir altın kalemi.
 * Yolsuzluk geliri yalnızca oransal kısıyordu, bu yüzden büyümenin bütçede
 * okunabilir bir bedeli yoktu ve geç oyunda altın birikip duruyordu.
 * Şehir sayısı süperdoğrusal, taşra ve başkente uzaklık doğrusal artar.
 */
function administrationCost(cityCount, provinceCount, distanceLoad) {
  const scale = Math.max(0, cityCount - ADMIN_FREE_CITIES) ** 1.45 * 0.9;
  const provinces = Math.max(0, provinceCount - ADMIN_FREE_PROVINCES) * 0.06;
  return Math.round((scale + provinces + distanceLoad) * 10) / 10;
}

/**
 * Bir karenin bir işçiye verdiği üretim. Taze işgal ve yabancı halk verim
 * kaybettirir (bkz. infamy.js), o yüzden bağlam gerekir.
 */
export function tileYield(tile, ctx) {
  const base = tile.terrain.yields;
  // Yol karenin ticaretini artırır: seviye başına +1 altın. Ölçümde yol yapan
  // ülkeler kaybediyordu çünkü yolun tek faydası hareketti ve YZ onu
  // kullanmıyordu — yatırımın kendini ödemesi gerek.
  const roadGold = tile.roadLevel ?? 0;
  if (!ctx) return roadGold ? { ...base, gold: base.gold + roadGold } : base;

  const factor = tileEfficiency(tile, ctx.culture, ctx.turn);
  if (factor === 1 && !roadGold) return base;
  return {
    food: base.food * factor,
    timber: base.timber * factor,
    iron: base.iron * factor,
    gold: (base.gold + roadGold) * factor,
  };
}

/** Şehrin sahibine göre üretim bağlamı. */
function cityContext(world, city) {
  return {
    culture: world?.nations?.[city.nationId]?.culture ?? -1,
    turn: world?.turn ?? 0,
  };
}

/**
 * Şehrin işçilerini çevresindeki en iyi karelere dağıtır.
 * Ağırlıklar ulusun o anki açığına göre gelir: erzak eksiyse tarlaya,
 * demir bitmişse madene yönelir. Elle atama kilidi varsa dokunmaz.
 */
export function assignWorkers(world, city, weights) {
  if (city.manualWorkers) {
    // Elle atanmış kareler sahiplik değişmediyse korunur.
    city.worked = city.worked.filter((t) => t.owner === city.nationId && !t.workedBy);
    for (const tile of city.worked) tile.workedBy = city;
    return;
  }
  const candidates = [];
  const ctx = cityContext(world, city);
  for (const { q, r } of hexesInRange(city.tile.q, city.tile.r, WORK_RADIUS)) {
    const tile = world.get(q, r);
    if (!tile || tile === city.tile) continue;
    if (tile.owner !== city.nationId) continue;
    // Başka şehrin işlediği kare paylaşılmaz.
    if (tile.workedBy && tile.workedBy !== city) continue;
    // İşçi taze işgal edilmiş kareye gitmez: orada verim sıfır.
    const yields = tileYield(tile, ctx);
    const score = yields.food * weights.food + yields.gold * weights.gold
      + yields.timber * weights.timber + yields.iron * weights.iron;
    if (score > 0) candidates.push({ tile, score });
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const tile of city.worked) {
    if (tile.workedBy === city) tile.workedBy = null;
  }
  city.worked = candidates.slice(0, city.pop).map((c) => c.tile);
  for (const tile of city.worked) tile.workedBy = city;
}

/**
 * İşçi dağıtım ağırlıkları: neyi eksikse ona yönel. Otomatik işçinin
 * "akıllı" hissetmesini sağlayan tek yer burası.
 */
export function workerWeights(nation) {
  const weights = { food: 1.5, gold: 1, timber: 0.7, iron: 0.7 };
  if ((nation.budget?.net.food ?? 0) < 2) weights.food = 4;
  if ((nation.gold ?? 0) < 20) weights.gold = 2;
  if ((nation.timber ?? 0) < 3) weights.timber = 2;
  if ((nation.iron ?? 0) < 3) weights.iron = 2.5;
  return weights;
}

/**
 * Tüm şehirlerin işçilerini yeniden dağıtır. Önce bütün işaretler silinir,
 * yoksa el değiştiren şehirlerin eski işaretleri kareleri kilitler.
 */
export function assignAllWorkers(world) {
  world.forEach((t) => { t.workedBy = null; });
  const weights = new Map();
  for (const nation of world.nations) weights.set(nation.id, workerWeights(nation));
  for (const city of world.cities) assignWorkers(world, city, weights.get(city.nationId));
}

/** Şehrin bu turki üretimi: merkez bedavası + işlenen kareler. */
export function cityProduction(city, world) {
  const out = { ...CITY_CENTER_YIELD };
  const ctx = cityContext(world, city);
  for (const tile of city.worked) {
    const yields = tileYield(tile, ctx);
    for (const r of RESOURCES) out[r] += yields[r];
  }
  // Şehrin kendisi bir pazar: tahkimat kademesi altın tabanı verir.
  out.gold += 2 + city.level * 2;
  applyBuildings(city, out);
  return out;
}

/**
 * Ulusun tur bilançosu. Erzak stoklanmaz: üretilir, işçiler ve ordu yer,
 * artan şehir ambarlarına gidip nüfusu büyütür.
 * @returns {{ production, upkeep, net, cities }}
 */
export function nationBudget(world, nation) {
  const production = emptyPool();
  let cityCount = 0;
  let workers = 0;
  let buildingCount = 0;
  const buildingCosts = emptyPool();
  let storageBonus = 0;
  let researchDiscount = 0;
  let armyUpkeepRelief = 0;
  let roadMaintenance = 0;
  let provinceCount = 0;
  let distanceLoad = 0;

  for (const city of world.cities) {
    if (city.nationId !== nation.id) continue;
    cityCount++;
    if (nation.capital) {
      const distance = hexDistance(city.tile.q, city.tile.r, nation.capital.q, nation.capital.r);
      distanceLoad += Math.max(0, distance - ADMIN_FREE_DISTANCE) * 0.25;
    }
    workers += city.pop;
    buildingCount += city.buildings?.length ?? 0;
    const maintenance = buildingMaintenance(city);
    for (const resource of RESOURCES) {
      buildingCosts[resource] += maintenance[resource] ?? 0;
    }
    storageBonus += buildingStorage(city);
    researchDiscount += buildingResearchDiscount(city);
    armyUpkeepRelief += buildingArmyUpkeepRelief(city);
    const out = cityProduction(city, world);
    for (const r of RESOURCES) production[r] += out[r];
  }
  // İşlenen yol seviyesi +1 altın üretir. Aynı miktardaki bakım, kullanılan
  // altyapıyı kendi kendine yeterli; atıl askerî ağı ise gerçek gider yapar.
  world.forEach((tile) => {
    if (tile.owner !== nation.id) return;
    provinceCount++;
    roadMaintenance += tile.roadLevel ?? 0;
    const provincial = provinceOutput(tile);
    production.gold += provincial.gold;
    production.food += provincial.food;
    production.timber += provincial.timber;
    production.iron += provincial.iron;
  });
  // Teknoloji şehir başına sabit katkı verir: yüzde değil, kartopu yapmasın.
  production.food += cityCount * techFoodPerCity(nation);
  production.gold += cityCount * techGoldPerCity(nation);
  production.iron += cityCount * techIronPerCity(nation);

  for (const r of RESOURCES) production[r] = Math.round(production[r]);
  production.gold = Math.round(production.gold * corruption(cityCount, nation));

  let army = 0;
  let armyWeight = 0;
  let armyIron = 0;
  for (const u of world.units) {
    if (u.nationId !== nation.id) continue;
    army += regimentCount(u);
    armyWeight += upkeepWeight(u);
    if (u.regiments?.length) {
      for (const regiment of u.regiments) {
        armyIron += IRON_UPKEEP_TYPES[regiment.typeId] ?? 0;
      }
    } else {
      armyIron += IRON_UPKEEP_TYPES[u.type.id] ?? 0;
    }
  }

  const upkeep = emptyPool();
  const armyFunding = (nation.economy?.armySpending ?? 100) / 100;
  // Bakım artık alay *sayısına* değil teçhizat ağırlığına bağlı: modern ordu
  // sürekli para yer, ordu modernizasyonu geç oyunun asıl gider kalemi olur.
  const armyGold = Math.max(0, armyWeight * UNIT_UPKEEP.gold * armyFunding - armyUpkeepRelief);
  const administration = administrationCost(cityCount, provinceCount, distanceLoad);
  upkeep.gold = armyGold + administration + buildingCosts.gold + roadMaintenance;
  upkeep.food = army * UNIT_UPKEEP.food + workers * WORKER_FOOD + buildingCosts.food;
  upkeep.timber = buildingCosts.timber + timberRepair(buildingCount);
  upkeep.iron = buildingCosts.iron + armyIron;

  const net = emptyPool();
  for (const r of RESOURCES) net[r] = production[r] - upkeep[r];
  return {
    production,
    upkeep,
    net,
    cities: cityCount,
    workers,
    army,
    armyGold,
    provinces: provinceCount,
    administration,
    buildings: buildingCount,
    buildingMaintenance: buildingCosts,
    roadMaintenance,
    storageBonus,
    researchDiscount: Math.min(0.32, researchDiscount),
    armyUpkeepRelief,
  };
}

/**
 * Yeni doğan işçinin kültürü: şehrin işlediği toprakların halkından gelir.
 * Böylece yabancı araziye yayılan şehir zamanla karışık nüfuslu olur.
 */
export function growPop(city, rng) {
  const weights = new Map();
  for (const tile of city.worked) {
    if (tile.culture < 0) continue;
    weights.set(tile.culture, (weights.get(tile.culture) ?? 0) + 1);
  }
  if (city.tile.culture >= 0) {
    // Şehir merkezi iki kat ağırlıklı: çekirdek halk baskın kalır ama tek olmaz.
    weights.set(city.tile.culture, (weights.get(city.tile.culture) ?? 0) + 2);
  }
  if (!weights.size) weights.set(city.tile.culture, 1);

  // Ağırlıklı **rastgele** seçim. En yükseği almak, merkez bonusu yüzünden
  // her şehri tek kültüre kilitliyordu: etnik karışım hiç oluşmuyordu.
  let total = 0;
  for (const weight of weights.values()) total += weight;
  let roll = rng() * total;
  let chosen = city.tile.culture;
  for (const [culture, weight] of weights) {
    roll -= weight;
    if (roll <= 0) { chosen = culture; break; }
  }

  city.pop++;
  city.pops[chosen] = (city.pops[chosen] ?? 0) + 1;
}

/** Şehir nüfusunun ulusun kurucu kültüründen olmayan kısmı. */
export function foreignPop(city, nationCulture) {
  let foreign = 0;
  for (const [culture, count] of Object.entries(city.pops)) {
    if (Number(culture) !== nationCulture) foreign += count;
  }
  return foreign;
}

/** Nüfusun bir kademe büyümesi için gereken erzak; ambar eşiği düşürür. */
export function growthCost(city) {
  const base = 15 + city.pop * 10;
  return Math.round(base * (hasBuilding(city, 'GRANARY') ? 0.8 : 1));
}

/** Şehir el değiştirir; çevresindeki kareler de yeni sahibe geçer. */
export function captureCity(game, city, nationId) {
  const world = game.world;
  const old = city.nationId;
  city.nationId = nationId;
  for (const { q, r } of hexesInRange(city.tile.q, city.tile.r, 1)) {
    const t = world.get(q, r);
    if (t) game.turns.claim(t, nationId);
  }
  // Şehrin haritaya yerleştirilmiş dış binaları da şehirle birlikte devredilir.
  world.forEach((tile) => {
    if (tile.structure?.cityId === city.id) game.turns.claim(tile, nationId);
  });
  return old;
}
