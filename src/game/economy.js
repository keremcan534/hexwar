// Victoria tarzı nüfus, fabrika ve küresel piyasa katmanı.
// Arazi ekonomisi şehir bütçesinde kalır; bu dosya o üretimi dünya pazarında
// fiyatlanan mallara, sınıf gelirlerine ve sanayi kârına dönüştürür.

import { canAfford, pay } from './cities.js';
import { provinceOutput, provincePopulation } from './provinces.js';
import { regimentCount } from './units.js';
import {
  canInvestInFactory, factoryInvestmentRules, fiscalPolicyLimits,
} from './politics.js';
import {
  constructionTaxMultiplier, constructionUpkeep, universityWorkforceBonus,
} from './construction.js';

export const GOODS = {
  food: { id: 'food', name: 'Grain', icon: '🌾', basePrice: 2, category: 'raw' },
  timber: { id: 'timber', name: 'Timber', icon: '🪵', basePrice: 3, category: 'raw' },
  iron: { id: 'iron', name: 'Iron', icon: '⛏', basePrice: 5, category: 'raw' },
  coal: { id: 'coal', name: 'Coal', icon: '◆', basePrice: 4, category: 'raw' },
  groceries: { id: 'groceries', name: 'Groceries', icon: '🥫', basePrice: 6, category: 'consumer' },
  clothes: { id: 'clothes', name: 'Clothes', icon: '🧵', basePrice: 8, category: 'consumer' },
  tools: { id: 'tools', name: 'Tools', icon: '⚒', basePrice: 10, category: 'industrial' },
  steel: { id: 'steel', name: 'Steel', icon: '▰', basePrice: 12, category: 'industrial' },
  arms: { id: 'arms', name: 'Small Arms', icon: '⚔', basePrice: 16, category: 'military' },
  artillery: { id: 'artillery', name: 'Artillery Equipment', icon: '●', basePrice: 30, category: 'military' },
  furniture: { id: 'furniture', name: 'Furniture', icon: '▤', basePrice: 14, category: 'consumer' },
  luxuries: { id: 'luxuries', name: 'Luxury Goods', icon: '◆', basePrice: 24, category: 'luxury' },
};

export const GOOD_IDS = Object.keys(GOODS);

export const FACTORIES = {
  CANNERY: {
    id: 'CANNERY', name: 'Food Industries', icon: '🥫',
    cost: { gold: 90 }, inputs: { food: 2 }, outputs: { groceries: 2 },
  },
  TEXTILE_MILL: {
    id: 'TEXTILE_MILL', name: 'Textile Mill', icon: '🧵',
    cost: { gold: 110 }, inputs: { food: 1, tools: 0.25 }, outputs: { clothes: 1.5 },
  },
  TOOLWORKS: {
    id: 'TOOLWORKS', name: 'Tooling Workshop', icon: '⚒',
    cost: { gold: 130 }, inputs: { timber: 1, iron: 1 }, outputs: { tools: 1.5 },
  },
  STEEL_MILL: {
    id: 'STEEL_MILL', name: 'Steel Mill', icon: '▰',
    cost: { gold: 170 }, inputs: { iron: 1.5, coal: 1 }, outputs: { steel: 1.5 },
  },
  ARMS_FACTORY: {
    id: 'ARMS_FACTORY', name: 'Arms Industry', icon: '⚔',
    // The military-only Production screen must not depend on a second, hidden
    // industrial chain. Arms lines consume the raw market goods directly.
    cost: { gold: 210 }, inputs: { iron: 1.5, coal: 0.5 }, outputs: { arms: 1.25 },
  },
  FURNITURE_FACTORY: {
    id: 'FURNITURE_FACTORY', name: 'Furniture Manufactory', icon: '▤',
    cost: { gold: 150 }, inputs: { timber: 2, tools: 0.25 }, outputs: { furniture: 1.25 },
  },
  LUXURY_WORKSHOP: {
    id: 'LUXURY_WORKSHOP', name: 'Luxury Workshop', icon: '◆',
    cost: { gold: 260 }, inputs: { clothes: 1, furniture: 0.5 }, outputs: { luxuries: 0.8 },
  },
};

export const CLASS_INFO = {
  lower: { name: 'Lower Class', share: 0.78, color: '#b8a56a' },
  middle: { name: 'Middle Class', share: 0.17, color: '#62a7c8' },
  upper: { name: 'Upper Class', share: 0.05, color: '#c79a51' },
};

export const POPULATION_COHORT = 1000;
export const PROFESSION_INFO = {
  farmers: { id: 'farmers', name: 'Farmers', classId: 'lower' },
  laborers: { id: 'laborers', name: 'Laborers', classId: 'lower' },
  workers: { id: 'workers', name: 'Factory Workers', classId: 'lower' },
  clerks: { id: 'clerks', name: 'Clerks', classId: 'middle' },
  artisans: { id: 'artisans', name: 'Artisans', classId: 'middle' },
  officers: { id: 'officers', name: 'Officers', classId: 'middle' },
  capitalists: { id: 'capitalists', name: 'Capitalists', classId: 'upper' },
  aristocrats: { id: 'aristocrats', name: 'Aristocrats', classId: 'upper' },
};
export const CLASS_PROFESSIONS = Object.fromEntries(Object.keys(CLASS_INFO).map((classId) => [
  classId,
  Object.values(PROFESSION_INFO).filter((profession) => profession.classId === classId).map((profession) => profession.id),
]));

const PROFESSION_SHARES = {
  lower: { farmers: 0.52, laborers: 0.25, workers: 0.23 },
  middle: { clerks: 0.45, artisans: 0.35, officers: 0.20 },
  upper: { capitalists: 0.45, aristocrats: 0.55 },
};
// Sınıfların 10.000 kişi başına haftalık geçim bütçesi. Üst sınıfın sepeti
// lüks mallar yüzünden çok daha pahalıdır; bu ölçek normal vergide sınıfları
// korur, ağır vergi ve fiyat şokunda ise 1K'lık düşüşleri hâlâ tetikler.
const CLASS_NEEDS_BUDGET = { lower: 4, middle: 8, upper: 20 };

const CLASS_NEEDS = {
  lower: { food: 0.28, groceries: 0.08, clothes: 0.045 },
  middle: { food: 0.22, groceries: 0.13, clothes: 0.09, furniture: 0.045, tools: 0.02 },
  upper: { groceries: 0.18, clothes: 0.13, furniture: 0.1, luxuries: 0.08 },
};

const DEFAULT_TAXES = { lower: 20, middle: 15, upper: 10 };
const PRICE_SPEED = 0.09;

/**
 * Sürekli sosyal harcamalar. Geç oyunda hazine doluyordu çünkü bütün giderler
 * tek seferlikti; bunlar nüfusla birlikte büyüyen, kapatılabilir ama kapatınca
 * bedeli olan kalemler. Maliyet 10.000 kişi başına, %100 seviyede haftalık.
 */
export const SOCIAL_PROGRAMS = {
  education: {
    id: 'education', name: 'Education', rate: 0.34,
    desc: 'Trains the workforce so factories can hire and operate more efficiently.',
  },
  health: {
    id: 'health', name: 'Public Health', rate: 0.30,
    desc: 'Raises the standard of living and speeds up population growth.',
  },
  welfare: {
    id: 'welfare', name: 'Welfare', rate: 0.46,
    desc: 'Cushions household budgets: every class gains satisfaction.',
  },
};

const DEFAULT_SOCIAL = { education: 0, health: 0, welfare: 0 };
export const MILITARY_EQUIPMENT = {
  arms: {
    id: 'arms', name: 'Small Arms', icon: '⚔', stockCap: 40, defaultStock: 16,
    factoryRate: 1, importLimit: 2.5, reserve: 10,
  },
  artillery: {
    id: 'artillery', name: 'Artillery Equipment', icon: '●', stockCap: 20, defaultStock: 6,
    factoryRate: 0.55, importLimit: 1.25, reserve: 4,
  },
};
export const MILITARY_EQUIPMENT_IDS = Object.keys(MILITARY_EQUIPMENT);
const DEFAULT_MILITARY = {
  arms: 16,
  artillery: 6,
  armsProduced: 0,
  artilleryProduced: 0,
  armsImported: 0,
  artilleryImported: 0,
  armsProducedAverage: 0,
  artilleryProducedAverage: 0,
  armsImportedAverage: 0,
  artilleryImportedAverage: 0,
  armsSupplyAverage: 0,
  artillerySupplyAverage: 0,
  armsAverageSamples: 0,
  artilleryAverageSamples: 0,
  reinforcementDemand: 0,
  manpowerDemand: 0,
  armsDemand: 0,
  artilleryDemand: 0,
  reinforced: 0,
  manpowerUsed: 0,
  armsUsed: 0,
  artilleryUsed: 0,
};

function emptyGoods() {
  return Object.fromEntries(GOOD_IDS.map((id) => [id, 0]));
}

function emptyGoodFlow() {
  return {
    production: 0,
    demand: 0,
    retained: 0,
    domestic: 0,
    imports: 0,
    exports: 0,
    fulfilled: 0,
    shortage: 0,
    importShare: 0,
  };
}

function emptyGoodsFlow() {
  return Object.fromEntries(GOOD_IDS.map((id) => [id, emptyGoodFlow()]));
}

function emptyTradeSummary() {
  return {
    lastUpdated: 0,
    imports: 0,
    exports: 0,
    importValue: 0,
    exportValue: 0,
    balance: 0,
    tariffRevenue: 0,
  };
}

function emptyProfessionCounts() {
  return Object.fromEntries(Object.keys(PROFESSION_INFO).map((id) => [id, 0]));
}

function emptyLedger() {
  return {
    lastUpdated: 0,
    cityRevenue: 0,
    taxRevenue: 0,
    tariffRevenue: 0,
    armyCost: 0,
    administrationCost: 0,
    socialCost: 0,
    importCost: 0,
    income: 0,
    expenses: 0,
    net: 0,
  };
}

export function ensureMilitaryEconomy(nation) {
  const military = nation.economy.military ?? {};
  for (const [key, value] of Object.entries(DEFAULT_MILITARY)) {
    if (!Number.isFinite(military[key])) military[key] = value;
  }
  for (const id of MILITARY_EQUIPMENT_IDS) {
    military[id] = Math.max(0, Math.min(MILITARY_EQUIPMENT[id].stockCap, military[id]));
  }
  nation.economy.military = military;
  return military;
}

export function workshopArmsOutput(nation) {
  return 0.08 * (0.5 + (nation.economy.armySpending ?? 100) / 200);
}

export function equipmentStock(nation, equipmentId) {
  return Math.max(0, ensureMilitaryEconomy(nation)[equipmentId] ?? 0);
}

export function setEquipmentStock(nation, equipmentId, value) {
  if (!MILITARY_EQUIPMENT[equipmentId]) return false;
  const military = ensureMilitaryEconomy(nation);
  military[equipmentId] = Math.max(0, Math.min(
    MILITARY_EQUIPMENT[equipmentId].stockCap,
    value,
  ));
  return true;
}

export function ensureProductionLine(factory) {
  if (factory?.typeId !== 'ARMS_FACTORY') return null;
  if (!MILITARY_EQUIPMENT[factory.lineEquipment]) factory.lineEquipment = 'arms';
  if (!Number.isFinite(factory.lineEfficiency)) factory.lineEfficiency = 0.5;
  factory.lineEfficiency = Math.max(0.5, Math.min(1, factory.lineEfficiency));
  if (!Number.isFinite(factory.lineOutput)) factory.lineOutput = 0;
  return factory;
}

export function setMilitaryProductionLine(game, nation, factoryId, equipmentId) {
  if (!MILITARY_EQUIPMENT[equipmentId]) return false;
  const factory = nation.economy.factories.find((candidate) => candidate.id === factoryId);
  if (!ensureProductionLine(factory) || factory.lineEquipment === equipmentId) return false;
  factory.lineEquipment = equipmentId;
  factory.lineEfficiency = 0.5;
  factory.lineOutput = 0;
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`Production line switched to ${MILITARY_EQUIPMENT[equipmentId].name}.`);
  }
  game.emit('economy', nation.economy);
  return true;
}

function updateMilitaryAverages(nation) {
  const military = ensureMilitaryEconomy(nation);
  for (const id of MILITARY_EQUIPMENT_IDS) {
    const sampled = military[`${id}AverageSamples`] > 0;
    const blend = (previous, current) => (sampled
      ? previous * 0.75 + current * 0.25
      : current);
    military[`${id}ProducedAverage`] = blend(
      military[`${id}ProducedAverage`],
      military[`${id}Produced`],
    );
    military[`${id}ImportedAverage`] = blend(
      military[`${id}ImportedAverage`],
      military[`${id}Imported`],
    );
    military[`${id}SupplyAverage`] = military[`${id}ProducedAverage`]
      + military[`${id}ImportedAverage`];
    military[`${id}AverageSamples`]++;
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distributeClassPopulation(counts, classId, population) {
  const professions = CLASS_PROFESSIONS[classId];
  let remaining = Math.max(0, Math.floor(population / POPULATION_COHORT)) * POPULATION_COHORT;
  professions.forEach((id, index) => {
    const amount = index === professions.length - 1
      ? remaining
      : Math.floor((population * PROFESSION_SHARES[classId][id]) / POPULATION_COHORT)
        * POPULATION_COHORT;
    counts[id] += Math.min(remaining, amount);
    remaining -= Math.min(remaining, amount);
  });
}

function initialProfessionCounts(population) {
  const counts = emptyProfessionCounts();
  const chunks = Math.max(10, Math.floor(population / POPULATION_COHORT));
  const lowerChunks = Math.floor(chunks * CLASS_INFO.lower.share);
  const middleChunks = Math.floor(chunks * CLASS_INFO.middle.share);
  const upperChunks = Math.max(0, chunks - lowerChunks - middleChunks);
  distributeClassPopulation(counts, 'lower', lowerChunks * POPULATION_COHORT);
  distributeClassPopulation(counts, 'middle', middleChunks * POPULATION_COHORT);
  distributeClassPopulation(counts, 'upper', upperChunks * POPULATION_COHORT);
  return counts;
}

function classPopulation(counts, classId) {
  return CLASS_PROFESSIONS[classId].reduce((sum, id) => sum + (counts[id] ?? 0), 0);
}

function automaticProfession(nation, classId) {
  if (classId === 'lower') {
    const lower = Math.max(1, classPopulation(nation.economy.professionCounts, 'lower'));
    const industrial = (nation.economy.professionCounts.workers ?? 0)
      + (nation.economy.professionCounts.laborers ?? 0);
    const factoryLevels = (nation.economy.factories ?? [])
      .reduce((sum, factory) => sum + factory.level, 0);
    const industrialTarget = clamp(0.22 + factoryLevels * 0.025, 0.22, 0.58);
    return industrial / lower < industrialTarget ? 'workers' : 'farmers';
  }
  if (classId === 'middle') return 'clerks';
  return 'capitalists';
}

function syncClassPopulations(nation) {
  const counts = nation.economy.professionCounts;
  for (const classId of Object.keys(CLASS_INFO)) {
    nation.economy.classes[classId].population = classPopulation(counts, classId);
  }
  nation.economy.cohortPopulation = Object.values(counts).reduce((sum, value) => sum + value, 0);
}

export function ensurePopulationModel(nation, population = nation?.economy?.population ?? 10000) {
  const economy = nation.economy;
  economy.classes ??= {};
  for (const [classId, info] of Object.entries(CLASS_INFO)) {
    economy.classes[classId] = {
      id: classId,
      population: Math.round(population * info.share),
      income: 0,
      taxPaid: 0,
      satisfaction: 0.62,
      needsCost: 0,
      needsBudget: 0,
      canAffordNeeds: true,
      hardshipWeeks: 0,
      ...(economy.classes[classId] ?? {}),
    };
  }
  if (!economy.professionCounts) economy.professionCounts = initialProfessionCounts(population);
  else {
    const migrated = emptyProfessionCounts();
    for (const id of Object.keys(PROFESSION_INFO)) {
      const value = Math.max(0, economy.professionCounts[id] ?? 0);
      migrated[id] = Math.floor(value / POPULATION_COHORT) * POPULATION_COHORT;
    }
    economy.professionCounts = migrated;
    if (!Object.values(migrated).some((value) => value > 0)) {
      economy.professionCounts = initialProfessionCounts(population);
    }
  }
  economy.mobility ??= {
    lastUpdated: 0,
    demotedUpper: 0,
    demotedMiddle: 0,
  };
  syncClassPopulations(nation);
  return economy.professionCounts;
}

export function reconcilePopulation(nation, population) {
  const counts = ensurePopulationModel(nation, population);
  const target = Math.max(10, Math.floor(population / POPULATION_COHORT)) * POPULATION_COHORT;
  let current = Object.values(counts).reduce((sum, value) => sum + value, 0);
  while (current < target) {
    counts[automaticProfession(nation, 'lower')] += POPULATION_COHORT;
    current += POPULATION_COHORT;
  }
  while (current > target) {
    const removable = Object.keys(counts)
      .filter((id) => counts[id] >= POPULATION_COHORT)
      .sort((a, b) => counts[b] - counts[a])[0];
    if (!removable) break;
    counts[removable] -= POPULATION_COHORT;
    current -= POPULATION_COHORT;
  }
  syncClassPopulations(nation);
}

export function runPopulationMobility(nation, turn) {
  ensurePopulationModel(nation);
  const economy = nation.economy;
  economy.mobility = { lastUpdated: turn, demotedUpper: 0, demotedMiddle: 0 };
  for (const classId of ['middle', 'upper']) {
    const socialClass = economy.classes[classId];
    socialClass.hardshipWeeks = socialClass.canAffordNeeds
      ? Math.max(0, (socialClass.hardshipWeeks ?? 0) - 2)
      : (socialClass.hardshipWeeks ?? 0) + 1;
  }
  if (turn % 4 !== 0) return economy.mobility;

  for (const [sourceClass, targetClass, mobilityKey] of [
    ['upper', 'middle', 'demotedUpper'],
    ['middle', 'lower', 'demotedMiddle'],
  ]) {
    const socialClass = economy.classes[sourceClass];
    if (socialClass.canAffordNeeds || socialClass.hardshipWeeks < 4
      || socialClass.population < POPULATION_COHORT) continue;
    const source = CLASS_PROFESSIONS[sourceClass]
      .filter((id) => economy.professionCounts[id] >= POPULATION_COHORT)
      .sort((a, b) => economy.professionCounts[b] - economy.professionCounts[a])[0];
    if (!source) continue;
    economy.professionCounts[source] -= POPULATION_COHORT;
    economy.professionCounts[automaticProfession(nation, targetClass)] += POPULATION_COHORT;
    economy.mobility[mobilityKey] = POPULATION_COHORT;
    socialClass.hardshipWeeks = 0;
  }
  syncClassPopulations(nation);
  return economy.mobility;
}

function marketGood(id) {
  const good = GOODS[id];
  return {
    id,
    price: good.basePrice,
    previousPrice: good.basePrice,
    supply: 0,
    demand: 0,
    traded: 0,
    trend: 0,
  };
}

export function initMarket(world) {
  world.market = {
    goods: Object.fromEntries(GOOD_IDS.map((id) => [id, marketGood(id)])),
    totalGdp: 0,
    lastUpdated: world.turn ?? 1,
  };
  return world.market;
}

export function populationOf(world, nation) {
  return Math.max(10000, provincePopulation(world, nation.id));
}

export function initNationEconomy(world, nation) {
  const population = populationOf(world, nation);
  nation.economy = {
    population,
    classes: Object.fromEntries(Object.entries(CLASS_INFO).map(([id, info]) => [id, {
      id,
      population: Math.round(population * info.share),
      income: 0,
      taxPaid: 0,
      satisfaction: 0.62,
      needsCost: 0,
      needsBudget: 0,
      canAffordNeeds: true,
      hardshipWeeks: 0,
    }])),
    taxes: { ...DEFAULT_TAXES },
    social: { ...DEFAULT_SOCIAL },
    socialCost: 0,
    tariff: 10,
    armySpending: 100,
    military: { ...DEFAULT_MILITARY },
    factories: [],
    professionCounts: initialProfessionCounts(population),
    cohortPopulation: Math.max(10, Math.floor(population / POPULATION_COHORT)) * POPULATION_COHORT,
    mobility: { lastUpdated: 0, demotedUpper: 0, demotedMiddle: 0 },
    inventory: emptyGoods(),
    goodsFlow: emptyGoodsFlow(),
    trade: emptyTradeSummary(),
    ledger: emptyLedger(),
    gdp: 0,
    taxRevenue: 0,
    tariffRevenue: 0,
    importCost: 0,
    factoryProfit: 0,
    fiscalNet: 0,
    standardOfLiving: 10,
    stability: 0.62,
  };
  syncClassPopulations(nation);
  return nation.economy;
}

function ensureInitialMilitaryIndustry(world, nation) {
  const economy = nation.economy;
  if (!nation.alive || economy.factories?.length) return;
  const city = world.cities.find((candidate) => candidate.nationId === nation.id);
  if (!city) return;
  economy.factories.push({
    id: `${nation.id}-${city.id}-initial-arms`,
    typeId: 'ARMS_FACTORY',
    cityId: city.id,
    level: 1,
    employees: 0,
    profit: 0,
    margin: 0,
    throughput: 0,
    fundedBy: 'state',
    lineEquipment: 'arms',
    lineEfficiency: 0.5,
    lineOutput: 0,
  });
}

export function initEconomy(world) {
  initMarket(world);
  for (const nation of world.nations) {
    initNationEconomy(world, nation);
    ensureInitialMilitaryIndustry(world, nation);
  }
}

export function ensureEconomy(world) {
  if (!world.market?.goods) initMarket(world);
  for (const id of GOOD_IDS) world.market.goods[id] ??= marketGood(id);
  for (const nation of world.nations) {
    if (!nation.economy) initNationEconomy(world, nation);
    // Eski kayıtlar sosyal harcama alanını tanımıyor; eksik alan çökertmesin.
    else nation.economy.social = { ...DEFAULT_SOCIAL, ...(nation.economy.social ?? {}) };
    nation.economy.inventory ??= emptyGoods();
    for (const id of GOOD_IDS) nation.economy.inventory[id] ??= 0;
    nation.economy.goodsFlow ??= emptyGoodsFlow();
    for (const id of GOOD_IDS) {
      nation.economy.goodsFlow[id] = {
        ...emptyGoodFlow(),
        ...(nation.economy.goodsFlow[id] ?? {}),
      };
    }
    nation.economy.trade = {
      ...emptyTradeSummary(),
      ...(nation.economy.trade ?? {}),
    };
    nation.economy.ledger = { ...emptyLedger(), ...(nation.economy.ledger ?? {}) };
    ensurePopulationModel(nation, populationOf(world, nation));
    ensureMilitaryEconomy(nation);
    ensureInitialMilitaryIndustry(world, nation);
    for (const factory of nation.economy.factories ?? []) ensureProductionLine(factory);
  }
}

/** Sosyal programın 0–1 aralığındaki etkin seviyesi. */
export function socialLevel(nation, programId) {
  return clamp((nation?.economy?.social?.[programId] ?? 0) / 100, 0, 1);
}

export function priceOf(world, goodId) {
  return world.market?.goods?.[goodId]?.price ?? GOODS[goodId]?.basePrice ?? 0;
}

export function factoryMargin(world, typeId) {
  const type = FACTORIES[typeId];
  if (!type) return 0;
  const revenue = Object.entries(type.outputs)
    .reduce((sum, [id, amount]) => sum + priceOf(world, id) * amount, 0);
  const inputs = Object.entries(type.inputs)
    .reduce((sum, [id, amount]) => sum + priceOf(world, id) * amount, 0);
  return revenue - inputs - 1.2;
}

/** Fabrika seviyesi tavanı. Eskiden 5'ti; sanayi kalıcı bir para deliği olsun. */
export const MAX_FACTORY_LEVEL = 10;

/**
 * Sanayileşme maliyeti kurulu kapasiteyle birlikte artar. Sabit fiyat, bir
 * noktadan sonra ülkenin harcayacak yer bulamamasının asıl sebebiydi; artan
 * maliyet tavana gerek bırakmadan getiriyi kendiliğinden azaltır.
 */
export function factoryCost(nation, typeId) {
  const type = FACTORIES[typeId];
  if (!type) return null;
  const built = nation.economy?.factories?.length ?? 0;
  const scale = 1 + built * 0.12;
  return Object.fromEntries(
    Object.entries(type.cost).map(([resource, amount]) => [resource, Math.round(amount * scale)]),
  );
}

export function expansionCost(factory) {
  return {
    gold: Math.round(80 * (1 + factory.level * 0.55) ** 1.35),
  };
}

function canPayFactoryCost(nation, cost, actor) {
  if (actor !== 'private') return canAfford(nation, cost);
  return (nation.politics?.privateCapital ?? 0) >= (cost.gold ?? 0);
}

function payFactoryCost(nation, cost, actor) {
  if (actor !== 'private') return pay(nation, cost);
  if (!canPayFactoryCost(nation, cost, actor)) return false;
  nation.politics.privateCapital -= cost.gold ?? 0;
  return true;
}

export function canBuildFactory(world, nation, city, typeId, actor = 'state') {
  const type = FACTORIES[typeId];
  if (!type || !city || city.nationId !== nation.id) return false;
  if (!canInvestInFactory(nation, 'build', actor)) return false;
  if (!canPayFactoryCost(nation, factoryCost(nation, typeId), actor)) return false;
  const inCity = nation.economy.factories.filter((factory) => factory.cityId === city.id);
  return inCity.length < 4;
}

export function buildFactory(game, nation, cityId, typeId, options = {}) {
  const actor = options.actor ?? 'state';
  const city = game.world.cities.find((candidate) => candidate.id === cityId);
  const type = FACTORIES[typeId];
  if (!type || !canBuildFactory(game.world, nation, city, typeId, actor)) return false;
  if (!payFactoryCost(nation, factoryCost(nation, typeId), actor)) return false;
  nation.economy.factories.push({
    id: `${nation.id}-${city.id}-${game.world.turn}-${nation.economy.factories.length}`,
    typeId,
    cityId,
    level: 1,
    employees: 0,
    profit: 0,
    margin: 0,
    throughput: 0,
    fundedBy: actor,
    ...(typeId === 'ARMS_FACTORY' ? {
      lineEquipment: 'arms', lineEfficiency: 0.5, lineOutput: 0,
    } : {}),
  });
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`${city.name}: ${type.name} opened${actor === 'private' ? ' by private investors' : ''}.`);
    game.emit('economy', nation.economy);
  }
  return true;
}

export function canExpandFactory(nation, factory, actor = 'state') {
  return Boolean(factory && factory.level < MAX_FACTORY_LEVEL
    && canInvestInFactory(nation, 'expand', actor)
    && canPayFactoryCost(nation, expansionCost(factory), actor));
}

export function expandFactory(game, nation, factoryId, options = {}) {
  const actor = options.actor ?? 'state';
  const factory = nation.economy.factories.find((candidate) => candidate.id === factoryId);
  if (!canExpandFactory(nation, factory, actor)) return false;
  if (!payFactoryCost(nation, expansionCost(factory), actor)) return false;
  factory.level++;
  game.emit('economy', nation.economy);
  return true;
}

export function setFiscalPolicy(nation, key, value, classId = null) {
  if (!nation?.economy) return false;
  if (key === 'tax' && CLASS_INFO[classId]) {
    nation.economy.taxes[classId] = clamp(Math.round(value), 0, 100);
    return true;
  }
  if (key === 'tariff') {
    const limits = fiscalPolicyLimits(nation);
    nation.economy.tariff = clamp(Math.round(value), limits.tariffMin, limits.tariffMax);
    return true;
  }
  if (key === 'armySpending') {
    const limits = fiscalPolicyLimits(nation);
    nation.economy.armySpending = clamp(
      Math.round(value), limits.armySpendingMin, limits.armySpendingMax,
    );
    return true;
  }
  if (key === 'social' && SOCIAL_PROGRAMS[classId]) {
    nation.economy.social[classId] = clamp(Math.round(value), 0, 100);
    return true;
  }
  return false;
}

/** Sosyal programların bu haftaki toplam altın gideri. */
export function socialSpendingCost(nation) {
  const economy = nation?.economy;
  if (!economy) return 0;
  const scale = economy.population / 10000;
  let total = 0;
  for (const program of Object.values(SOCIAL_PROGRAMS)) {
    total += scale * socialLevel(nation, program.id) * program.rate;
  }
  return total;
}

function addFlow(market, goodId, kind, amount) {
  if (!market.goods[goodId] || !Number.isFinite(amount) || amount <= 0) return;
  market.goods[goodId][kind] += amount;
}

function resetNationGoodsFlow(nation) {
  const previous = nation.economy.goodsFlow ?? emptyGoodsFlow();
  nation.economy.goodsFlow = Object.fromEntries(GOOD_IDS.map((id) => [id, {
    ...emptyGoodFlow(),
    // This is last week's import reliance. Population prices use it until the
    // current week's world market has been cleared below.
    importShare: clamp(previous[id]?.importShare ?? 0, 0, 1),
  }]));
  nation.economy.trade = emptyTradeSummary();
}

function addNationFlow(nation, goodId, kind, amount) {
  const flow = nation.economy.goodsFlow?.[goodId];
  if (!flow || !Number.isFinite(amount) || amount <= 0) return;
  flow[kind] = (flow[kind] ?? 0) + amount;
}

function updateClasses(world, nation) {
  const economy = nation.economy;
  const population = populationOf(world, nation);
  economy.population = population;
  reconcilePopulation(nation, population);
}

function rawProduction(world, nation, market) {
  const production = nation.budget?.production ?? {};
  const output = {
    food: Math.max(0, production.food ?? 0),
    timber: Math.max(0, production.timber ?? 0),
    iron: Math.max(0, production.iron ?? 0),
    coal: 0,
  };
  world.forEach((tile) => {
    if (tile.owner === nation.id) output.coal += provinceOutput(tile).coal;
  });
  for (const [id, amount] of Object.entries(output)) {
    addFlow(market, id, 'supply', amount);
    addNationFlow(nation, id, 'production', amount);
  }
  return output;
}

function runFactories(world, nation, market, ownOutput, inputAvailability) {
  const economy = nation.economy;
  let totalProfit = 0;
  let industrialOutput = 0;
  // Eğitim harcaması işgücünü niteliklendirir: aynı nüfus daha çok fabrika doldurur.
  const schooling = 1 + socialLevel(nation, 'education') * 0.25
    + universityWorkforceBonus(nation);
  const workforce = economy.classes.lower.population * 0.56
    * (0.65 + (economy.classes.lower.satisfaction ?? 0.6) * 0.5) * schooling;
  const totalCapacity = economy.factories.reduce((sum, factory) => sum + factory.level * 18000, 0);

  for (const factory of economy.factories) {
    const type = FACTORIES[factory.typeId];
    if (!type) continue;
    const capacity = factory.level * 18000;
    const fairShare = totalCapacity ? workforce * (capacity / totalCapacity) : 0;
    const target = Math.min(capacity, fairShare);
    const unitMargin = factoryMargin(world, factory.typeId);
    const hiringTarget = unitMargin >= 0 ? target : target * 0.25;
    factory.employees += (hiringTarget - factory.employees) * 0.18;
    factory.employees = clamp(factory.employees, 0, capacity);
    const laborThroughput = factory.employees / 18000;
    const inputFulfillment = Object.keys(type.inputs).reduce(
      (lowest, id) => Math.min(lowest, inputAvailability[id] ?? 1),
      1,
    );
    const throughput = laborThroughput * inputFulfillment;
    factory.throughput = throughput;
    factory.inputFulfillment = inputFulfillment;

    let revenue = 0;
    let inputCost = 0;
    for (const [id, amount] of Object.entries(type.inputs)) {
      const requested = amount * laborThroughput;
      const consumed = amount * throughput;
      // Fiyat, karşılanamayan talebi de görür; maliyet yalnız gerçekten kullanılan
      // girdiye yazılır. Böylece kıtlık fiyatı yükseltirken hayali üretim yaratmaz.
      addFlow(market, id, 'demand', requested);
      addNationFlow(nation, id, 'demand', requested);
      inputCost += priceOf(world, id) * consumed;
    }
    let outputs = type.outputs;
    if (factory.typeId === 'ARMS_FACTORY') {
      const line = ensureProductionLine(factory);
      if (throughput > 0.05) line.lineEfficiency = Math.min(1, line.lineEfficiency + 0.025);
      const equipment = MILITARY_EQUIPMENT[line.lineEquipment];
      outputs = {
        [line.lineEquipment]: (type.outputs.arms ?? 1.25)
          * equipment.factoryRate * line.lineEfficiency,
      };
      line.lineOutput = 0;
    }
    for (const [id, amount] of Object.entries(outputs)) {
      const qty = amount * throughput;
      addFlow(market, id, 'supply', qty);
      addNationFlow(nation, id, 'production', qty);
      ownOutput[id] = (ownOutput[id] ?? 0) + qty;
      revenue += priceOf(world, id) * qty;
      industrialOutput += priceOf(world, id) * qty;
      if (factory.typeId === 'ARMS_FACTORY') factory.lineOutput += qty;
    }
    // İşçi, girdi kıtlığında üretim düşse de fabrikada kalır ve ücretini alır.
    const wages = laborThroughput * 1.2;
    factory.profit = revenue - inputCost - wages;
    factory.margin = revenue > 0 ? factory.profit / revenue : 0;
    totalProfit += factory.profit;
  }

  economy.factoryProfit = totalProfit;
  return industrialOutput;
}

function populationDemand(world, nation, market) {
  const economy = nation.economy;
  let totalCost = 0;
  let satisfactionWeighted = 0;
  const welfare = socialLevel(nation, 'welfare');

  for (const [classId, needs] of Object.entries(CLASS_NEEDS)) {
    const socialClass = economy.classes[classId];
    const scale = socialClass.population / 10000;
    let basket = 0;
    for (const [goodId, amount] of Object.entries(needs)) {
      const quantity = amount * scale;
      addFlow(market, goodId, 'demand', quantity);
      addNationFlow(nation, goodId, 'demand', quantity);
      // Tariffs only raise the imported share of a household basket. Last
      // week's share is used because this week's trade clears after all
      // nations have submitted supply and demand.
      const importShare = clamp(economy.goodsFlow?.[goodId]?.importShare ?? 0, 0, 1);
      const tariffFactor = 1 + (economy.tariff / 100) * importShare;
      basket += priceOf(world, goodId) * quantity * tariffFactor;
    }
    const taxRate = economy.taxes[classId] / 100;
    const needsBudget = scale * CLASS_NEEDS_BUDGET[classId]
      * (1 - taxRate) * (1 + welfare * 0.22);
    const affordability = 1 / (1 + basket / Math.max(1, scale * 2.5));
    socialClass.needsCost = basket;
    socialClass.needsBudget = needsBudget;
    // Sepet tam yaşam standardını temsil eder; sınıf bunun temel %60'ını dahi
    // karşılayamıyorsa durum sınıf düşüşüne dönüşür. Lüks açığı memnuniyeti
    // azaltır fakat tek başına aristokrasiyi birkaç ayda yok etmez.
    socialClass.canAffordNeeds = needsBudget + 0.01 >= basket * 0.6;
    socialClass.satisfaction = clamp(
      0.35 + affordability * 0.5 - taxRate * 0.28 + welfare * 0.14,
      0.08,
      0.95,
    );
    totalCost += basket;
    satisfactionWeighted += socialClass.satisfaction * socialClass.population;
  }

  economy.standardOfLiving = 5 + 15 * (satisfactionWeighted / Math.max(1, economy.population))
    + socialLevel(nation, 'health') * 2.5;
  economy.stability = satisfactionWeighted / Math.max(1, economy.population);
  return totalCost;
}

function fiscalBalance(nation, baseOutputValue, industrialOutput) {
  const economy = nation.economy;
  const incomePool = Math.max(1, baseOutputValue * 0.18 + industrialOutput * 0.22);
  const incomeWeights = { lower: 0.42, middle: 0.33, upper: 0.25 };
  let taxes = 0;
  for (const [classId, weight] of Object.entries(incomeWeights)) {
    const socialClass = economy.classes[classId];
    socialClass.income = incomePool * weight;
    socialClass.taxPaid = socialClass.income * (economy.taxes[classId] / 100);
    taxes += socialClass.taxPaid;
  }
  const social = socialSpendingCost(nation);
  taxes *= constructionTaxMultiplier(nation);
  const construction = constructionUpkeep(nation);
  economy.taxRevenue = taxes;
  // Trade is cleared after every country has submitted its weekly orders.
  // Tariff income is applied by settleGlobalTrade so domestic consumption is
  // never taxed as an import.
  economy.tariffRevenue = 0;
  economy.socialCost = social;
  economy.constructionUpkeep = construction;
  economy.fiscalNet = taxes - social - construction;
  nation.gold = Math.max(0, nation.gold + economy.fiscalNet);
}

/**
 * Hazine biriktikçe açılan sosyal harcama. YZ oyuncuyla aynı kaldıraçları
 * kullanmazsa geç oyunda tek başına para yığar; istikrar düşükse refah,
 * hazine bolsa eğitim/sağlık açar, para biterse kısar.
 */
function adjustSocialAI(nation) {
  const economy = nation.economy;
  const rich = nation.gold > 200;
  // fiscalNet tek başına yanıltıcı: şehir bütçesi ayrı bir gelir kalemi.
  // Sosyal harcamayı ölçerken haftalık *toplam* değişime bakılmalı.
  const weekly = (nation.budget?.net?.gold ?? 0) + economy.fiscalNet;
  const broke = nation.gold < 60 || weekly < 0;
  const step = broke ? -10 : rich ? 10 : 0;
  if (!step) return;
  const priority = economy.stability < 0.5
    ? ['welfare', 'health', 'education']
    : ['education', 'health', 'welfare'];
  for (const id of broke ? [...priority].reverse() : priority) {
    const current = economy.social[id] ?? 0;
    if (step > 0 && current < 100) { economy.social[id] = current + step; return; }
    if (step < 0 && current > 0) { economy.social[id] = current + step; return; }
  }
}

function runPrivateSector(game, nation) {
  if (!nation.alive || !nation.politics) return;
  nation.politics.lastPrivateInvestment = null;
  const rules = factoryInvestmentRules(nation);
  if (!rules.privateBuild && !rules.privateExpand) return;
  const economy = nation.economy;
  const cities = game.world.cities.filter((city) => city.nationId === nation.id);
  if (!cities.length) return;

  if (rules.privateExpand) {
    const expansion = economy.factories
      .filter((factory) => factory.margin > 0 && canExpandFactory(nation, factory, 'private'))
      .sort((a, b) => b.profit - a.profit)[0];
    if (expansion && expandFactory(game, nation, expansion.id, { actor: 'private' })) {
      nation.politics.lastPrivateInvestment = { action: 'expand', factoryId: expansion.id };
      return;
    }
  }

  if (!rules.privateBuild) return;
  const options = Object.keys(FACTORIES)
    .map((typeId) => ({ typeId, margin: factoryMargin(game.world, typeId) }))
    .filter((option) => option.margin > 0)
    .sort((a, b) => b.margin - a.margin);
  for (const option of options) {
    const city = cities.find((candidate) => canBuildFactory(
      game.world, nation, candidate, option.typeId, 'private',
    ));
    if (!city) continue;
    if (buildFactory(game, nation, city.id, option.typeId, { actor: 'private' })) {
      const factory = economy.factories[economy.factories.length - 1];
      nation.politics.lastPrivateInvestment = {
        action: 'build', factoryId: factory.id, typeId: option.typeId,
      };
      return;
    }
  }
}

function runEconomicAI(game, nation) {
  if (nation.id === game.turns.playerNation || !nation.alive) return;
  const economy = nation.economy;
  const cities = game.world.cities.filter((city) => city.nationId === nation.id);
  if (!cities.length) return;
  adjustSocialAI(nation);

  const military = ensureMilitaryEconomy(nation);
  const equipmentPriority = MILITARY_EQUIPMENT_IDS.map((id) => {
    const type = MILITARY_EQUIPMENT[id];
    const stock = equipmentStock(nation, id);
    const demand = military[`${id}Demand`] ?? 0;
    return {
      id,
      pressure: Math.max(demand - stock, type.reserve - stock),
    };
  }).sort((a, b) => b.pressure - a.pressure);
  const desiredLine = equipmentPriority.find((item) => item.pressure > 0)?.id ?? null;
  const militaryFactories = economy.factories
    .filter((factory) => factory.typeId === 'ARMS_FACTORY')
    .map((factory) => ensureProductionLine(factory));
  const matchingLine = desiredLine
    ? militaryFactories.find((factory) => factory.lineEquipment === desiredLine)
    : null;
  if (desiredLine && !matchingLine) {
    const switchable = militaryFactories
      .filter((factory) => {
        const current = MILITARY_EQUIPMENT[factory.lineEquipment];
        return equipmentStock(nation, current.id) >= current.reserve;
      })
      .sort((a, b) => a.lineEfficiency - b.lineEfficiency)[0];
    if (switchable && setMilitaryProductionLine(game, nation, switchable.id, desiredLine)) return;
  }
  if (desiredLine) {
    // Her ekipman için önce tek, beslenebilir hat kurulur. Mevcut hattın stoku
    // dolduramadığı durumda yeni hat yığmak yerine aşağıdaki normal genişletme
    // ve sivil tedarik yatırımları çalışmaya devam eder.
    if (!matchingLine) {
      const city = cities.find((candidate) => (
        economy.factories.filter((factory) => factory.cityId === candidate.id).length < 4
      ));
      if (city && canBuildFactory(game.world, nation, city, 'ARMS_FACTORY')
        && buildFactory(game, nation, city.id, 'ARMS_FACTORY')) {
        const factory = economy.factories[economy.factories.length - 1];
        if (desiredLine !== 'arms') setMilitaryProductionLine(game, nation, factory.id, desiredLine);
        return;
      }
      // Kritik ekipman, başka bir yatırım öncesinde bütçesini bekler.
      if (city) return;
    }
  }
  // Kurulu ve kârlı fabrikayı büyütmek, yeni fabrikadan önce gelir: artan
  // genişletme maliyeti hazineyi yeni şehir gerekmeden emer.
  const best = economy.factories
    .filter((factory) => factory.level < MAX_FACTORY_LEVEL && factory.margin > 0)
    .sort((a, b) => b.profit - a.profit)[0];
  if (best && canAfford(nation, expansionCost(best)) && nation.gold > 220) {
    expandFactory(game, nation, best.id);
    return;
  }

  if (nation.gold < 170) return;
  const options = Object.keys(FACTORIES)
    .map((typeId) => ({ typeId, margin: factoryMargin(game.world, typeId) }))
    .filter((option) => option.margin > 0)
    .sort((a, b) => b.margin - a.margin);
  for (const option of options) {
    const city = cities.find((candidate) => canBuildFactory(game.world, nation, candidate, option.typeId));
    if (city && buildFactory(game, nation, city.id, option.typeId)) return;
  }
}

function procureStrategicGoods(world) {
  const available = {
    arms: world.market.goods.arms.supply,
    artillery: world.market.goods.artillery.supply,
  };
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    nation.economy.importCost = 0;
    const military = ensureMilitaryEconomy(nation);
    for (const id of MILITARY_EQUIPMENT_IDS) {
      const equipment = MILITARY_EQUIPMENT[id];
      military[`${id}Imported`] = 0;
      const target = Math.min(
        equipment.stockCap,
        equipment.reserve + Math.min(
          equipment.stockCap - equipment.reserve,
          military[`${id}Demand`] ?? 0,
        ),
      );
      const shortage = Math.max(0, target - equipmentStock(nation, id));
      if (shortage <= 0 || available[id] <= 0) continue;
      const tariffFactor = 1 + nation.economy.tariff / 100;
      const unitPrice = priceOf(world, id) * tariffFactor;
      const affordable = nation.gold / Math.max(0.01, unitPrice);
      const amount = Math.min(equipment.importLimit, shortage, available[id], affordable);
      if (amount <= 0) continue;
      const cost = amount * unitPrice;
      setEquipmentStock(nation, id, equipmentStock(nation, id) + amount);
      military[`${id}Imported`] = amount;
      nation.gold -= cost;
      nation.economy.importCost += cost;
      available[id] -= amount;
      addFlow(world.market, id, 'demand', amount);
      addNationFlow(nation, id, 'demand', amount);
    }
  }
}

/**
 * Clears the world market without creating a second national stockpile.
 * Production first meets same-country demand; only the remaining surplus is
 * exported, and deficits receive imports in proportion to their orders. The
 * result is an auditable weekly flow, not a persistent pile of raw resources.
 */
export function settleGlobalTrade(world) {
  const nations = world.nations.filter((nation) => nation.alive && nation.economy);
  for (const nation of nations) nation.economy.trade = emptyTradeSummary();

  for (const id of GOOD_IDS) {
    const rows = nations.map((nation) => {
      const flow = nation.economy.goodsFlow[id];
      const marketProduction = Math.max(0, flow.production - flow.retained);
      const domestic = Math.min(marketProduction, flow.demand);
      return {
        nation,
        flow,
        domestic,
        surplus: Math.max(0, marketProduction - domestic),
        deficit: Math.max(0, flow.demand - domestic),
      };
    });
    const totalSurplus = rows.reduce((sum, row) => sum + row.surplus, 0);
    const totalDeficit = rows.reduce((sum, row) => sum + row.deficit, 0);
    const crossBorderTrade = Math.min(totalSurplus, totalDeficit);

    for (const row of rows) {
      const { nation, flow } = row;
      flow.domestic = row.domestic;
      flow.exports = totalSurplus > 0 ? row.surplus * crossBorderTrade / totalSurplus : 0;
      flow.imports = totalDeficit > 0 ? row.deficit * crossBorderTrade / totalDeficit : 0;
      flow.fulfilled = Math.min(flow.demand, flow.domestic + flow.imports);
      flow.shortage = Math.max(0, flow.demand - flow.fulfilled);
      flow.importShare = flow.demand > 0 ? clamp(flow.imports / flow.demand, 0, 1) : 0;

      const price = priceOf(world, id);
      const trade = nation.economy.trade;
      trade.imports += flow.imports;
      trade.exports += flow.exports;
      trade.importValue += flow.imports * price;
      trade.exportValue += flow.exports * price;
    }
  }

  for (const nation of nations) {
    const trade = nation.economy.trade;
    trade.balance = trade.exportValue - trade.importValue;
    // Goods are paid for by households and firms. Only the tariff/subsidy is
    // a treasury flow; keeping that distinction prevents exports from becoming
    // a magic state-money exploit.
    trade.tariffRevenue = trade.importValue * (nation.economy.tariff / 100) * 0.12;
    trade.lastUpdated = world.turn;
    nation.economy.tariffRevenue = trade.tariffRevenue;
    nation.economy.fiscalNet += trade.tariffRevenue;
    nation.gold = Math.max(0, nation.gold + trade.tariffRevenue);
  }
}

function marketInputAvailability(market) {
  const hasHistory = (market.lastUpdated ?? 0) > 0;
  return Object.fromEntries(Object.entries(market.goods).map(([id, state]) => {
    if (!hasHistory || state.demand <= 0) return [id, 1];
    return [id, clamp(state.supply / state.demand, 0, 1)];
  }));
}

function updateLedger(nation, turn) {
  const economy = nation.economy;
  const budget = nation.budget ?? {};
  const cityRevenue = Math.max(0, budget.production?.gold ?? 0);
  const tariffRevenue = economy.tariffRevenue ?? 0;
  const armyCost = Math.max(0, budget.armyGold ?? 0);
  const administrationCost = Math.max(0, budget.administration ?? 0);
  const socialCost = Math.max(0, economy.socialCost ?? 0);
  const importCost = Math.max(0, economy.importCost ?? 0);
  const constructionCost = Math.max(0, economy.constructionUpkeep ?? 0);
  const income = cityRevenue + (economy.taxRevenue ?? 0) + Math.max(0, tariffRevenue);
  const expenses = armyCost + administrationCost
    + socialCost + importCost + constructionCost + Math.max(0, -tariffRevenue);
  economy.ledger = {
    lastUpdated: turn,
    cityRevenue,
    taxRevenue: economy.taxRevenue ?? 0,
    tariffRevenue,
    armyCost,
    administrationCost,
    socialCost,
    importCost,
    constructionCost,
    income,
    expenses,
    net: income - expenses,
  };
}

function updatePrices(market) {
  let totalGdp = 0;
  for (const [id, state] of Object.entries(market.goods)) {
    const base = GOODS[id].basePrice;
    state.previousPrice = state.price;
    const total = Math.max(1, state.supply + state.demand);
    const imbalance = (state.demand - state.supply) / total;
    state.price = clamp(state.price * (1 + imbalance * PRICE_SPEED), base * 0.25, base * 4);
    state.trend = state.price - state.previousPrice;
    state.traded = Math.min(state.supply, state.demand);
    totalGdp += state.traded * state.price;
  }
  market.totalGdp = totalGdp;
}

export function runEconomy(game) {
  const world = game.world;
  ensureEconomy(world);
  const market = world.market;
  // Fabrikalar geçen haftanın küresel arz/talep gerçekleşmesine göre çalışır.
  // Bir haftalık gecikme bütün ülkeleri aynı oranda etkiler ve dizi sırasının
  // piyasada kimin girdiyi kapacağını belirlemesini engeller.
  const inputAvailability = marketInputAvailability(market);
  for (const state of Object.values(market.goods)) {
    state.supply = 0;
    state.demand = 0;
    state.traded = 0;
  }

  for (const nation of world.nations) {
    if (!nation.alive) continue;
    resetNationGoodsFlow(nation);
    updateClasses(world, nation);
    const ownOutput = emptyGoods();
    const raw = rawProduction(world, nation, market);
    for (const [id, amount] of Object.entries(raw)) ownOutput[id] += amount;
    const baseOutputValue = Object.entries(raw)
      .reduce((sum, [id, amount]) => sum + priceOf(world, id) * amount, 0);
    const industrialOutput = runFactories(world, nation, market, ownOutput, inputAvailability);
    const military = ensureMilitaryEconomy(nation);
    for (const id of MILITARY_EQUIPMENT_IDS) {
      const equipment = MILITARY_EQUIPMENT[id];
      const factoryOutput = Math.max(0, ownOutput[id] ?? 0);
      // Small Arms has a minimal workshop floor so a nation cannot become
      // permanently unable to field an army before its first military factory.
      const workshopOutput = id === 'arms' ? workshopArmsOutput(nation) : 0;
      const room = Math.max(0, equipment.stockCap - equipmentStock(nation, id));
      const retainedFactory = Math.min(factoryOutput, room);
      const retainedWorkshop = Math.min(workshopOutput, room - retainedFactory);
      military[`${id}Produced`] = retainedFactory + retainedWorkshop;
      setEquipmentStock(
        nation,
        id,
        equipmentStock(nation, id) + military[`${id}Produced`],
      );
      // Equipment retained by the state cannot also be sold on the market.
      market.goods[id].supply = Math.max(0, market.goods[id].supply - retainedFactory);
      addNationFlow(nation, id, 'retained', retainedFactory);
    }
    populationDemand(world, nation, market);

    const landUnits = world.units
      .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land')
      .reduce((sum, unit) => sum + regimentCount(unit), 0);
    addFlow(market, 'arms', 'demand', landUnits * 0.08 * (nation.economy.armySpending / 100));
    addFlow(market, 'groceries', 'demand', landUnits * 0.05);
    addNationFlow(nation, 'arms', 'demand', landUnits * 0.08 * (nation.economy.armySpending / 100));
    addNationFlow(nation, 'groceries', 'demand', landUnits * 0.05);

    nation.economy.gdp = baseOutputValue + industrialOutput;
    fiscalBalance(nation, baseOutputValue, industrialOutput);
    runPopulationMobility(nation, world.turn);
    for (const [id, amount] of Object.entries(ownOutput)) {
      nation.economy.inventory[id] = amount;
    }
    runPrivateSector(game, nation);
    runEconomicAI(game, nation);
  }

  // Dünya piyasasındaki gerçek alımlar stratejik stokları doldurur ve fiyatı
  // yukarı iter; böylece ekrandaki piyasa ile inşaat ekonomisi aynı sistemdir.
  procureStrategicGoods(world);
  settleGlobalTrade(world);
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    updateMilitaryAverages(nation);
    updateLedger(nation, world.turn);
  }
  updatePrices(market);
  market.lastUpdated = world.turn;
  game.emit('economy', market);
}

export function formatPopulation(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(Math.round(value));
}
