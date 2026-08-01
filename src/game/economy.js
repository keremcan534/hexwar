// Victoria tarzı nüfus, fabrika ve küresel piyasa katmanı.
// Arazi ekonomisi şehir bütçesinde kalır; bu dosya o üretimi dünya pazarında
// fiyatlanan mallara, sınıf gelirlerine ve sanayi kârına dönüştürür.

import { canAfford, pay } from './cities.js';
import { provinceOutput, provincePopulation } from './provinces.js';
import {
  applyModernization, armyTier, modernizeCost, regimentCount, tierInfo,
} from './units.js';

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
  furniture: { id: 'furniture', name: 'Furniture', icon: '▤', basePrice: 14, category: 'consumer' },
  luxuries: { id: 'luxuries', name: 'Luxury Goods', icon: '◆', basePrice: 24, category: 'luxury' },
};

export const GOOD_IDS = Object.keys(GOODS);

export const FACTORIES = {
  CANNERY: {
    id: 'CANNERY', name: 'Food Industries', icon: '🥫',
    cost: { gold: 90, timber: 4 }, inputs: { food: 2 }, outputs: { groceries: 2 },
  },
  TEXTILE_MILL: {
    id: 'TEXTILE_MILL', name: 'Textile Mill', icon: '🧵',
    cost: { gold: 110, timber: 5 }, inputs: { food: 1, tools: 0.25 }, outputs: { clothes: 1.5 },
  },
  TOOLWORKS: {
    id: 'TOOLWORKS', name: 'Tooling Workshop', icon: '⚒',
    cost: { gold: 130, timber: 6, iron: 3 }, inputs: { timber: 1, iron: 1 }, outputs: { tools: 1.5 },
  },
  STEEL_MILL: {
    id: 'STEEL_MILL', name: 'Steel Mill', icon: '▰',
    cost: { gold: 170, timber: 5, iron: 5 }, inputs: { iron: 1.5, coal: 1 }, outputs: { steel: 1.5 },
  },
  ARMS_FACTORY: {
    id: 'ARMS_FACTORY', name: 'Arms Industry', icon: '⚔',
    cost: { gold: 210, timber: 6, iron: 6 }, inputs: { steel: 1, tools: 0.5 }, outputs: { arms: 1.25 },
  },
  FURNITURE_FACTORY: {
    id: 'FURNITURE_FACTORY', name: 'Furniture Manufactory', icon: '▤',
    cost: { gold: 150, timber: 7 }, inputs: { timber: 2, tools: 0.25 }, outputs: { furniture: 1.25 },
  },
  LUXURY_WORKSHOP: {
    id: 'LUXURY_WORKSHOP', name: 'Luxury Workshop', icon: '◆',
    cost: { gold: 260, timber: 8, iron: 4 }, inputs: { clothes: 1, furniture: 0.5 }, outputs: { luxuries: 0.8 },
  },
};

export const CLASS_INFO = {
  lower: { name: 'Lower Class', share: 0.78, color: '#b8a56a' },
  middle: { name: 'Middle Class', share: 0.17, color: '#62a7c8' },
  upper: { name: 'Upper Class', share: 0.05, color: '#c79a51' },
};

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
    desc: 'Trains the workforce: factories hire faster and research is cheaper.',
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

function emptyGoods() {
  return Object.fromEntries(GOOD_IDS.map((id) => [id, 0]));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
    }])),
    taxes: { ...DEFAULT_TAXES },
    social: { ...DEFAULT_SOCIAL },
    socialCost: 0,
    tariff: 10,
    armySpending: 100,
    authority: 60,
    factories: [],
    inventory: emptyGoods(),
    gdp: 0,
    taxRevenue: 0,
    tariffRevenue: 0,
    importCost: 0,
    factoryProfit: 0,
    fiscalNet: 0,
    standardOfLiving: 10,
    stability: 0.62,
  };
  return nation.economy;
}

export function initEconomy(world) {
  initMarket(world);
  for (const nation of world.nations) initNationEconomy(world, nation);
}

export function ensureEconomy(world) {
  if (!world.market?.goods) initMarket(world);
  for (const nation of world.nations) {
    if (!nation.economy) initNationEconomy(world, nation);
    // Eski kayıtlar sosyal harcama alanını tanımıyor; eksik alan çökertmesin.
    else nation.economy.social = { ...DEFAULT_SOCIAL, ...(nation.economy.social ?? {}) };
  }
}

/** Sosyal programın 0–1 aralığındaki etkin seviyesi. */
export function socialLevel(nation, programId) {
  return clamp((nation?.economy?.social?.[programId] ?? 0) / 100, 0, 1);
}

/** Eğitim harcamasının araştırma maliyetine indirimi (en çok %20). */
export function educationResearchDiscount(nation) {
  return socialLevel(nation, 'education') * 0.2;
}

/** Sağlık harcamasının nüfus büyüme çarpanı. */
export function healthGrowthFactor(nation) {
  return 1 + socialLevel(nation, 'health') * 0.35;
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
    timber: 2 + factory.level,
    iron: Math.floor(factory.level / 2),
  };
}

export function canBuildFactory(world, nation, city, typeId) {
  const type = FACTORIES[typeId];
  if (!type || !city || city.nationId !== nation.id) return false;
  if (!canAfford(nation, factoryCost(nation, typeId))) return false;
  const inCity = nation.economy.factories.filter((factory) => factory.cityId === city.id);
  return inCity.length < 4;
}

export function buildFactory(game, nation, cityId, typeId) {
  const city = game.world.cities.find((candidate) => candidate.id === cityId);
  const type = FACTORIES[typeId];
  if (!type || !canBuildFactory(game.world, nation, city, typeId)) return false;
  if (!pay(nation, factoryCost(nation, typeId))) return false;
  nation.economy.factories.push({
    id: `${nation.id}-${city.id}-${game.world.turn}-${nation.economy.factories.length}`,
    typeId,
    cityId,
    level: 1,
    employees: 0,
    profit: 0,
    margin: 0,
    throughput: 0,
  });
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`${city.name}: ${type.name} opened.`);
    game.emit('economy', nation.economy);
  }
  return true;
}

export function expandFactory(game, nation, factoryId) {
  const factory = nation.economy.factories.find((candidate) => candidate.id === factoryId);
  if (!factory) return false;
  if (factory.level >= MAX_FACTORY_LEVEL || !pay(nation, expansionCost(factory))) return false;
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
    nation.economy.tariff = clamp(Math.round(value), -25, 50);
    return true;
  }
  if (key === 'armySpending') {
    nation.economy.armySpending = clamp(Math.round(value), 25, 100);
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

/**
 * Ordu modernizasyonu: teçhizat kademesini yükseltir. Tek seferlik bedelin
 * yanında kalıcı bakım da artar (bkz. units.js EQUIPMENT_TIERS).
 */
export function modernizeArmy(game, nation, unit) {
  const cost = modernizeCost(unit);
  if (!cost || unit.nationId !== nation.id || !pay(nation, cost)) return false;
  applyModernization(unit);
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`An army was re-equipped to ${tierInfo(armyTier(unit)).name}.`);
    game.emit('economy', nation.economy);
  }
  return true;
}

function addFlow(market, goodId, kind, amount) {
  if (!market.goods[goodId] || !Number.isFinite(amount) || amount <= 0) return;
  market.goods[goodId][kind] += amount;
}

function updateClasses(world, nation) {
  const economy = nation.economy;
  const population = populationOf(world, nation);
  economy.population = population;
  for (const [id, info] of Object.entries(CLASS_INFO)) {
    economy.classes[id].population = Math.round(population * info.share);
  }
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
  for (const [id, amount] of Object.entries(output)) addFlow(market, id, 'supply', amount);
  return output;
}

function runFactories(world, nation, market, ownOutput) {
  const economy = nation.economy;
  let totalProfit = 0;
  let industrialOutput = 0;
  // Eğitim harcaması işgücünü niteliklendirir: aynı nüfus daha çok fabrika doldurur.
  const schooling = 1 + socialLevel(nation, 'education') * 0.25;
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
    const throughput = factory.employees / 18000;
    factory.throughput = throughput;

    let revenue = 0;
    let inputCost = 0;
    for (const [id, amount] of Object.entries(type.inputs)) {
      const qty = amount * throughput;
      addFlow(market, id, 'demand', qty);
      inputCost += priceOf(world, id) * qty;
    }
    for (const [id, amount] of Object.entries(type.outputs)) {
      const qty = amount * throughput;
      addFlow(market, id, 'supply', qty);
      ownOutput[id] = (ownOutput[id] ?? 0) + qty;
      revenue += priceOf(world, id) * qty;
      industrialOutput += priceOf(world, id) * qty;
    }
    const wages = throughput * 1.2;
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
      const tariffFactor = 1 + economy.tariff / 100;
      basket += priceOf(world, goodId) * quantity * tariffFactor;
    }
    const taxRate = economy.taxes[classId] / 100;
    const affordability = 1 / (1 + basket / Math.max(1, scale * 2.5));
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

export function socialStability(nation) {
  return clamp(nation?.economy?.stability ?? 0.6, 0, 1);
}

function fiscalBalance(nation, baseOutputValue, industrialOutput, consumptionCost) {
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
  const tariffs = consumptionCost * (economy.tariff / 100) * 0.12;
  const social = socialSpendingCost(nation);
  economy.taxRevenue = taxes;
  economy.tariffRevenue = tariffs;
  economy.socialCost = social;
  economy.fiscalNet = taxes + tariffs - social;
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

/** Zenginleşen YZ ordusunu modernize eder; en güçlü yığından başlar. */
function modernizeAI(game, nation) {
  // Eşik, birim satın alma ve fabrika yatırımının üstünde: modernizasyon
  // artan paranın gideceği yer olsun, ordunun büyümesinin önüne geçmesin.
  if (nation.gold < 200) return;
  const armies = game.world.units
    .filter((unit) => unit.nationId === nation.id && unit.regiments?.length)
    .sort((a, b) => armyTier(a) - armyTier(b) || regimentCount(b) - regimentCount(a));
  for (const army of armies) {
    if (modernizeArmy(game, nation, army)) return;
  }
}

function runEconomicAI(game, nation) {
  if (nation.id === game.turns.playerNation || !nation.alive) return;
  const economy = nation.economy;
  const cities = game.world.cities.filter((city) => city.nationId === nation.id);
  if (!cities.length) return;
  adjustSocialAI(nation);
  modernizeAI(game, nation);

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
    timber: world.market.goods.timber.supply,
    iron: world.market.goods.iron.supply,
  };
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    nation.economy.importCost = 0;
    for (const goodId of ['timber', 'iron']) {
      const shortage = Math.max(0, 20 - (nation[goodId] ?? 0));
      if (shortage <= 0 || available[goodId] <= 0) continue;
      const tariffFactor = 1 + nation.economy.tariff / 100;
      const unitPrice = priceOf(world, goodId) * tariffFactor;
      const affordable = Math.floor(nation.gold / Math.max(0.01, unitPrice));
      const amount = Math.min(4, shortage, available[goodId], affordable);
      if (amount <= 0) continue;
      const cost = amount * unitPrice;
      nation[goodId] += amount;
      nation.gold -= cost;
      nation.economy.importCost += cost;
      available[goodId] -= amount;
      addFlow(world.market, goodId, 'demand', amount);
    }
  }
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
  for (const state of Object.values(market.goods)) {
    state.supply = 0;
    state.demand = 0;
    state.traded = 0;
  }

  for (const nation of world.nations) {
    if (!nation.alive) continue;
    updateClasses(world, nation);
    const ownOutput = emptyGoods();
    const raw = rawProduction(world, nation, market);
    for (const [id, amount] of Object.entries(raw)) ownOutput[id] += amount;
    const baseOutputValue = Object.entries(raw)
      .reduce((sum, [id, amount]) => sum + priceOf(world, id) * amount, 0);
    const industrialOutput = runFactories(world, nation, market, ownOutput);
    const consumptionCost = populationDemand(world, nation, market);

    const landUnits = world.units
      .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land')
      .reduce((sum, unit) => sum + regimentCount(unit), 0);
    addFlow(market, 'arms', 'demand', landUnits * 0.08 * (nation.economy.armySpending / 100));
    addFlow(market, 'groceries', 'demand', landUnits * 0.05);

    nation.economy.gdp = baseOutputValue + industrialOutput;
    fiscalBalance(nation, baseOutputValue, industrialOutput, consumptionCost);
    for (const [id, amount] of Object.entries(ownOutput)) {
      nation.economy.inventory[id] = amount;
    }
    runEconomicAI(game, nation);
  }

  // Dünya piyasasındaki gerçek alımlar stratejik stokları doldurur ve fiyatı
  // yukarı iter; böylece ekrandaki piyasa ile inşaat ekonomisi aynı sistemdir.
  procureStrategicGoods(world);
  updatePrices(market);
  market.lastUpdated = world.turn;
  game.emit('economy', market);
}

export function formatPopulation(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(Math.round(value));
}
