// Province katmanı: her kara hex'i nüfus, kontrol ve uzmanlaşma taşıyan
// ekonomik bir karar alanına dönüştürür. Şehirler sanayi merkezidir; province
// ise hammadde, vergi tabanı ve nüfus sağlar.

import { makeRng } from '../core/rng.js';
import { policyOf } from './politics.js';
import { controllerOf, isOccupied } from './control.js';

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
function weightedRgo(world, tile) {
  const yields = tile.terrain.yields;
  const rng = makeRng(`${world.seed}-rgo-${tile.q}:${tile.r}`);
  const terrain = tile.terrain.id;
  const rugged = terrain === 'HILLS' || terrain === 'MOUNTAIN';
  const tropical = terrain === 'JUNGLE';
  const open = terrain === 'PLAINS' || terrain === 'GRASSLAND';
  const arid = terrain === 'DESERT' || terrain === 'TUNDRA';
  // Tahılın ağırlığı bilerek yüksek: erzak çökerse ordular dağılır. Egzotik
  // kaynaklar yalnız kendi arazilerinde ve düşük ağırlıkla çıkar.
  const weights = [
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
  let roll = rng() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  let rgo = 'GRAIN';
  for (const [id, weight] of weights) {
    roll -= weight;
    if (roll <= 0) { rgo = id; break; }
  }
  return { id: rgo, quality: rng.range(0.85, 1.15), jobsRatio: rng.range(0.72, 0.88) };
}

function initialProvince(world, tile) {
  const yields = tile.terrain.yields;
  const agriculture = yields.food >= 3 ? 2 : yields.food > 0 ? 1 : 0;
  const extraction = Math.max(yields.timber, yields.iron) >= 2 ? 2
    : Math.max(yields.timber, yields.iron) > 0 ? 1 : 0;
  const commerce = tile.coastal || yields.gold > 0 ? 1 : 0;
  const population = Math.round(
    1800 + yields.food * 1200 + (tile.coastal ? 900 : 0)
      + (agriculture + extraction + commerce) * 450,
  );
  const selected = weightedRgo(world, tile);
  const track = RGO_TYPES[selected.id].track;
  return {
    population,
    agriculture,
    extraction,
    commerce,
    control: tile.owner >= 0 ? 100 : 0,
    lastInvestment: 0,
    rgo: selected.id,
    rgoQuality: selected.quality,
    rgoBaseJobs: Math.max(1000, Math.round(population * selected.jobsRatio / 100) * 100),
    rgoBaseDevelopment: track === 'agriculture' ? agriculture : extraction,
    migration: 0,
  };
}

function ensureProvinceRgo(world, tile) {
  const province = tile.province;
  if (!province) return null;
  const selected = weightedRgo(world, tile);
  if (!RGO_TYPES[province.rgo]) province.rgo = selected.id;
  if (!Number.isFinite(province.rgoQuality)) province.rgoQuality = selected.quality;
  if (!Number.isFinite(province.rgoBaseJobs)) {
    province.rgoBaseJobs = Math.max(
      1000,
      Math.round(province.population * selected.jobsRatio / 100) * 100,
    );
  }
  const type = RGO_TYPES[province.rgo];
  if (!Number.isFinite(province.rgoBaseDevelopment)) {
    province.rgoBaseDevelopment = province[type.track] ?? 0;
  }
  if (!Number.isFinite(province.migration)) province.migration = 0;
  return province;
}

export function initProvinces(world) {
  world.forEach((tile) => {
    tile.province = tile.terrain.passable ? initialProvince(world, tile) : null;
  });
}

export function ensureProvinces(world) {
  world.forEach((tile) => {
    if (tile.terrain.passable && !tile.province) tile.province = initialProvince(world, tile);
    if (tile.province) ensureProvinceRgo(world, tile);
  });
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
  world.forEach((tile) => {
    if (tile.owner === nationId && tile.province) total += tile.province.population;
  });
  return Math.round(total);
}

export function provinceRgoJobs(tile) {
  const province = tile?.province;
  const type = RGO_TYPES[province?.rgo];
  if (!province || !type) return 0;
  const developed = Math.max(0, (province[type.track] ?? 0) - (province.rgoBaseDevelopment ?? 0));
  return Math.max(1000, Math.round((province.rgoBaseJobs + developed * 500) / 100) * 100);
}

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
  const ratio = rural / jobs;
  if (ratio <= 1) return ratio;
  return Math.min(RGO_LABOR_CAP, ratio ** RGO_LABOR_FALLOFF);
}

export function provinceRgoStatus(tile) {
  const province = tile?.province;
  const type = RGO_TYPES[province?.rgo];
  if (!province || !type) return {
    type: null, jobs: 0, employed: 0, unemployed: 0, vacancies: 0, efficiency: 0,
  };
  const jobs = provinceRgoJobs(tile);
  const employed = Math.min(Math.max(0, province.population), jobs);
  return {
    type,
    jobs,
    employed,
    unemployed: Math.max(0, province.population - jobs),
    vacancies: Math.max(0, jobs - province.population),
    efficiency: jobs > 0 ? employed / jobs : 0,
  };
}

/** Province'in haftalık ulusal bütçe katkısı. */
export function provinceOutput(tile) {
  const province = tile?.province;
  if (!province || tile.owner < 0 || isOccupied(tile)) {
    // Üretmeyen kare de karenin *kendi* malını anahtar olarak taşımalı: çağıran
    // taraf `output[rgo.goodId]` okuyor ve eksik anahtar undefined dönüyordu
    // (14 RGO'ya geçince eski dört anahtarlık sabit nesne yetersiz kaldı).
    const idle = { gold: 0, food: 0, timber: 0, iron: 0, coal: 0 };
    const goodId = RGO_TYPES[province?.rgo]?.goodId;
    if (goodId) idle[goodId] = 0;
    return idle;
  }
  const base = tile.terrain.yields;
  const control = clamp(province.control / 100, 0, 1);
  const status = provinceRgoStatus(tile);
  // Eski dört kalem sıfırla hazır durur (bütçe onları doğrudan okuyor);
  // province'in gerçek malı aşağıda kendi anahtarına yazılır.
  const output = { gold: 0, food: 0, timber: 0, iron: 0, coal: 0 };
  if (!status.type) return output;
  output[status.type.goodId] ??= 0;
  const development = province[status.type.track] ?? 0;
  output[status.type.goodId] = status.type.baseOutput
    * province.rgoQuality * (1 + development * 0.18)
    * rgoLaborScale(province, status.jobs) * control;
  const taxpayerScale = clamp(province.population / 7000, 0, 2.2);
  output.gold = (0.08 + base.gold * 0.05 + province.commerce * 0.09)
    * taxpayerScale * control;
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
  world.forEach((tile) => {
    if (!tile.province) return;
    tile.province.migration = 0;
    if (tile.owner < 0 || controllerOf(tile) !== tile.owner
      || !world.nations[tile.owner]?.alive) return;
    if (!byNation.has(tile.owner)) byNation.set(tile.owner, []);
    byNation.get(tile.owner).push(tile);
  });
  if (!force && (world.turn ?? 0) % MIGRATION_INTERVAL !== 0) return 0;

  let totalMoved = 0;
  for (const [nationId, tiles] of byNation) {
    const donors = tiles.map((tile) => ({ tile, surplus: provinceRgoStatus(tile).unemployed }))
      .filter((row) => row.surplus >= MIGRATION_COHORT)
      .sort((a, b) => b.surplus - a.surplus);
    // Sanayileşen bölge de nüfus çeker. Eskiden göç yalnız RGO boşluklarına
    // bakıyordu; fabrika açmak bir province'i cazip hale getirmiyordu.
    // Fabrikanın kadrosu economy.js tarafından `jobs` alanına yazılır, böylece
    // bu dosyanın ekonomi katmanını import etmesi gerekmez.
    const factoryVacanciesAt = (tile) => {
      const factories = world.nations[tile.owner]?.economy?.factories ?? [];
      let free = 0;
      for (const factory of factories) {
        if (factory.q !== tile.q || factory.r !== tile.r) continue;
        free += Math.max(0, (factory.jobs ?? 0) - (factory.employees ?? 0));
      }
      return free;
    };
    const receivers = tiles.map((tile) => ({
      tile,
      vacancies: tile.province.control >= 50
        ? provinceRgoStatus(tile).vacancies + factoryVacanciesAt(tile)
        : 0,
    }))
      .filter((row) => row.vacancies >= MIGRATION_COHORT)
      .sort((a, b) => (
        (b.tile.city ? 1 : 0) - (a.tile.city ? 1 : 0)
        || b.tile.province.control - a.tile.province.control
        || b.vacancies - a.vacancies
      ));
    let receiverIndex = 0;
    let nationMoved = 0;
    for (const donor of donors) {
      let movable = Math.floor(Math.min(
        donor.surplus,
        Math.max(MIGRATION_COHORT, donor.tile.province.population * MIGRATION_RATE),
      ) / MIGRATION_COHORT) * MIGRATION_COHORT;
      while (movable >= MIGRATION_COHORT && receiverIndex < receivers.length) {
        const receiver = receivers[receiverIndex];
        const open = provinceRgoStatus(receiver.tile).vacancies
          + factoryVacanciesAt(receiver.tile);
        const vacancies = Math.floor(open / MIGRATION_COHORT) * MIGRATION_COHORT;
        if (vacancies < MIGRATION_COHORT) {
          receiverIndex++;
          continue;
        }
        const moved = Math.min(movable, vacancies);
        donor.tile.province.population -= moved;
        receiver.tile.province.population += moved;
        donor.tile.province.migration -= moved;
        receiver.tile.province.migration += moved;
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
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
  }

  world.forEach((tile) => {
    const province = tile.province;
    if (!province || tile.owner < 0) return;
    const nation = world.nations[tile.owner];
    if (!nation?.alive) return;
    if (controllerOf(tile) !== tile.owner) {
      province.control = clamp(province.control - 2, 5, 100);
      return;
    }
    const stability = Math.max(0.1, Math.min(1, nation.economy?.stability ?? 0.6));
    const citizenship = policyOf(nation, 'citizenship');
    const minorityControl = citizenship === 'full_citizenship'
      ? 1.25
      : citizenship === 'limited_citizenship' ? 0.85 : 0.6;
    province.control = clamp(
      province.control + (tile.culture === nation.culture ? 1.5 : minorityControl)
        * (0.45 + stability),
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
    const weeklyGrowth = (0.00018 + province.agriculture * 0.00006)
      * (peace ? 1 : 0.55) * (0.45 + stability) * health;
    province.population = Math.round(province.population * (1 + weeklyGrowth));
  });
  runProvinceMigration(world);
  game.emit('provinces', null);
}
