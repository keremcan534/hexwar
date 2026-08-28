// SANAYİ — üretim, kadro, ücret, kâr.
//
// Tesis kapanışı tek kimliktir ve ekranda satır satır aynı görünür:
//
//     GELİR        = Σ çıktı × fiyat
//   − GİRDİ        = Σ girdi × fiyat × (1 + gümrük × ithal payı)
//   = KATMA DEĞER
//   − ÜCRET        = katma değer × %55            (reform bu payı oynatır)
//   = KÂR
//
// Beş satır, tek çarpan zinciri, ekranda birebir aynı görünür. Girdi
// çıktısındaki verim ve teknoloji çarpanları üretim MİKTARINA girer; para
// tarafında gizli bir katsayı yoktur.
//
// Kadro ULUSAL İŞGÜCÜNDEN gelir: `hiringHeadroom` tavanı aşılamaz.
//
// Katman notu: içerik ve piyasa dışında hiçbir şey içe aktarmaz. DOM bilmez.

import {
  FACTORIES, MAX_FACTORY_LEVEL, MILITARY_EQUIPMENT, WORKERS_PER_LEVEL,
} from './content.js';
import { addDemand, addSupply, priceOf } from './market.js';
import { LABOR_SHARE, hiringHeadroom } from './pop.js';

/** İşe alım ve seviye atlama aylıktır: sanayileşme 100 yıla yayılsın. */
export const HIRING_INTERVAL = 4;

/** İşgücünün ayda sanayiye akabilecek payı. Eğitim bunu hızlandırır. */
const MONTHLY_HIRE_RATE = 0.003;

/** Zarar eden tesisin aylık kadro kaybı. */
const LAYOFF_RATE = 0.06;

/**
 * Kâr eğiliminin hafızası (üstel hareketli ortalama). 0.25 ile eğilim ~bir
 * yıllık hafızaya sahip olur: tek kötü ay kadroyu dağıtmaz, üst üste gelen
 * zarar dağıtır. Bu tampon olmadan ölçülen testere dişi %20.9'du.
 */
const PROFIT_TREND_WEIGHT = 0.25;

/** Reform ne kadar yükseltirse yükseltsin, bordro katma değeri geçemez. */
const WAGE_CAP = 0.85;

/** Kadrosu bu oranın altında olan ülke yeni tesis açmaz, önce eldekini doldurur. */
export const EXPANSION_FILL_FLOOR = 0.7;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function factoryJobs(factory) {
  return Math.max(0, (factory?.level ?? 0)) * WORKERS_PER_LEVEL;
}

export function factoryVacancies(factory) {
  return Math.max(0, factoryJobs(factory) - (factory?.employees ?? 0));
}

export function factoryAtCapacity(factory) {
  return factoryJobs(factory) > 0 && factory.employees + 1 >= factoryJobs(factory);
}

export function industrialJobs(nation) {
  let sum = 0;
  for (const factory of nation.economy?.factories ?? []) sum += factoryJobs(factory);
  return sum;
}

export function laborFill(nation) {
  const jobs = industrialJobs(nation);
  if (jobs <= 0) return 1;
  let employed = 0;
  for (const factory of nation.economy.factories) employed += factory.employees ?? 0;
  return employed / jobs;
}

/** Silah fabrikasının üretim hattı: hangi teçhizatı yaptığı oyuncunun kararı. */
export function ensureProductionLine(factory) {
  if (factory.typeId !== 'ARMS_FACTORY') return null;
  factory.lineEquipment ??= 'arms';
  factory.lineEfficiency ??= 0.5;
  factory.lineOutput ??= 0;
  if (!MILITARY_EQUIPMENT[factory.lineEquipment]) factory.lineEquipment = 'arms';
  return factory;
}

export function factoryOutputs(factory, type) {
  if (factory.typeId !== 'ARMS_FACTORY') return type.outputs;
  ensureProductionLine(factory);
  const equipment = MILITARY_EQUIPMENT[factory.lineEquipment];
  return {
    [factory.lineEquipment]:
      (type.outputs.arms ?? 1.25) * equipment.factoryRate * factory.lineEfficiency,
  };
}

/** Ülkenin girdi maliyetine binen gümrük payı (yalnız ithal edilen kısma). */
function tariffFactor(economy, goodId) {
  const importShare = clamp(economy.goodsFlow?.[goodId]?.importShare ?? 0, 0, 1);
  return 1 + (economy.tariff ?? 0) / 100 * importShare;
}

/**
 * BEKLENEN MARJ — işe alım sırasının ölçütü, gerçekleşen kârla AYNI formül.
 *
 * Gerçekleşen marj yetmez: kadrosu olmayan tesiste kâr her zaman 0'dır, o
 * yüzden yeni kurulan çelik fabrikası hiç işçi alamaz, alamadığı için hiç
 * üretmez, üretmediği için marjını hiç gösteremezdi.
 */
export function expectedMargin(world, nation, factory) {
  const type = FACTORIES[factory.typeId];
  if (!type) return 0;
  const economy = nation.economy;
  let revenue = 0;
  for (const [id, amount] of Object.entries(factoryOutputs(factory, type))) {
    revenue += priceOf(world, id) * amount;
  }
  if (revenue <= 0) return 0;
  let cost = 0;
  for (const [id, amount] of Object.entries(type.inputs)) {
    cost += priceOf(world, id) * amount * tariffFactor(economy, id);
  }
  // Beklenen marj EMEK PAYINDAN SONRAKİ kârdır: işe alım kararı, sahibin
  // eline geçen parayla aynı ölçütü kullansın.
  return ((revenue - cost) * (1 - LABOR_SHARE)) / revenue;
}

/** Katalog marjı (ekran): tesis türü bugünün fiyatlarında kâr eder mi? */
export function factoryMargin(world, typeId, nation = null) {
  const type = FACTORIES[typeId];
  if (!type) return 0;
  let revenue = 0;
  for (const [id, amount] of Object.entries(type.outputs)) revenue += priceOf(world, id) * amount;
  let cost = 0;
  for (const [id, amount] of Object.entries(type.inputs)) cost += priceOf(world, id) * amount;
  return (revenue - cost) * (1 - LABOR_SHARE);
}

/**
 * ÜRETİM VE KAPANIŞ — haftanın 3. ve 7. adımı tek geçişte.
 *
 * `mods` dışarıdan gelir: `{ throughput, wageCost }` reformlardan,
 * `techMods` ekonomiden okunur. Başka çarpan yoktur.
 */
export function runFactories(world, nation, market, ownOutput, availability, mods) {
  const economy = nation.economy;
  const techMods = economy.techMods ?? null;
  const throughputMod = (mods?.throughput ?? 1) * (1 + (techMods?.factoryThroughput ?? 0));
  const inputScale = clamp(1 - (techMods?.inputEfficiency ?? 0), 0.5, 1);
  const laborShare = Math.min(WAGE_CAP, LABOR_SHARE * (mods?.wageCost ?? 1));
  economy.wagesPaid = 0;
  let totalProfit = 0;
  let industrialOutput = 0;

  for (const factory of economy.factories) {
    const type = FACTORIES[factory.typeId];
    if (!type) continue;
    factory.employees = clamp(factory.employees, 0, factoryJobs(factory));
    factory.jobs = factoryJobs(factory);

    // Girdi kapısı geçen haftanın küresel bolluğudur: bu haftanın ticareti
    // henüz kapanmadı, tick içi döngü kurulmaz.
    let fulfillment = 1;
    for (const id in type.inputs) fulfillment = Math.min(fulfillment, availability[id] ?? 1);
    const laborThroughput = factory.employees / WORKERS_PER_LEVEL;
    const throughput = laborThroughput * fulfillment * throughputMod;
    factory.throughput = throughput;
    factory.inputFulfillment = fulfillment;

    let revenue = 0;
    let inputCost = 0;
    for (const id in type.inputs) {
      const amount = type.inputs[id] * inputScale;
      // Fiyat karşılanamayan talebi de görür; maliyet yalnız kullanılana yazılır.
      addDemand(market, nation, id, 'industry', amount * laborThroughput);
      inputCost += priceOf(world, id) * amount * throughput * tariffFactor(economy, id);
    }
    if (factory.typeId === 'ARMS_FACTORY') {
      ensureProductionLine(factory);
      if (throughput > 0.05) factory.lineEfficiency = Math.min(1, factory.lineEfficiency + 0.025);
      factory.lineOutput = 0;
    }
    const outputs = factoryOutputs(factory, type);
    for (const id in outputs) {
      const qty = outputs[id] * throughput;
      addSupply(market, nation, id, 'factory', qty);
      ownOutput[id] = (ownOutput[id] ?? 0) + qty;
      revenue += priceOf(world, id) * qty;
      industrialOutput += priceOf(world, id) * qty;
      if (factory.typeId === 'ARMS_FACTORY') factory.lineOutput += qty;
    }

    // ÜCRET: katma değerin emeğe giden payı — tek satır, tek sabit.
    // Girdisi kesilen tesis üretmese de kadrosunu tutar; katma değer sıfıra
    // inince bordro da sıfırlanır ve zarar sahibin üstünde kalır.
    const valueAdded = Math.max(0, revenue - inputCost);
    const wages = valueAdded * laborShare;
    economy.wagesPaid += wages;
    factory.revenue = revenue;
    factory.inputCost = inputCost;
    factory.wages = wages;
    // İşçi başına haftalık ücret: ekranda "bu tesis ne ödüyor" sorusunun cevabı.
    factory.wagePerWorker = factory.employees > 0 ? wages / factory.employees : 0;
    factory.profit = revenue - inputCost - wages;
    factory.subsidyPaid = 0;
    factory.margin = revenue > 0 ? factory.profit / revenue : 0;
    totalProfit += factory.profit;
  }

  economy.factoryProfit = totalProfit;
  economy.industrialOutput = industrialOutput;
  economy.laborShare = laborShare;
  economy.wageRate = economy.industrialEmployed > 0
    ? economy.wagesPaid / economy.industrialEmployed : 0;
  return industrialOutput;
}

/**
 * KADRO — ayda bir. Havuz ULUSAL İŞGÜCÜNDEN gelir ve `hiringHeadroom` tavanını
 * aşamaz; istihdam işgücü yaratmaz, tüketir.
 */
export function runHiring(world, nation, schooling = 1, upgrade = null) {
  const economy = nation.economy;
  const factories = economy.factories ?? [];
  economy.industrialHiring = 0;
  economy.industrialLayoffs = 0;
  if (!factories.length) return;

  // İşten çıkarma ve işe alım AYNI sinyale bakar; ayrı sinyaller aynı tesisi
  // aynı ay hem doldurup hem boşaltıyordu.
  for (const factory of factories) {
    const previous = factory.profitTrend ?? factory.profit ?? 0;
    factory.profitTrend = previous * (1 - PROFIT_TREND_WEIGHT)
      + (factory.profit ?? 0) * PROFIT_TREND_WEIGHT;
    if (factory.profitTrend >= 0) continue;
    // Fiyatlar toparlanma vaat ediyorsa kadro daha uzun tutulur: işçi
    // yetiştirmek pahalıdır. Veto değil fren.
    const recovering = expectedMargin(world, nation, factory) > 0;
    const laid = factory.employees * LAYOFF_RATE * (recovering ? 0.25 : 1);
    factory.employees = Math.max(0, factory.employees - laid);
    economy.industrialLayoffs += laid;
  }

  const pool = Math.min(
    hiringHeadroom(nation),
    Math.max(0, economy.workforce ?? 0) * MONTHLY_HIRE_RATE * schooling,
  );
  if (pool > 0) {
    // Kârlı tesis önce dolar: kıt işgücünü piyasa sinyali yönlendirir.
    const hiring = factories
      .filter((factory) => factoryVacancies(factory) > 0)
      .map((factory) => ({ factory, score: expectedMargin(world, nation, factory) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
    let left = pool;
    for (const row of hiring) {
      if (left <= 0) break;
      const hired = Math.min(left, factoryVacancies(row.factory));
      row.factory.employees += hired;
      economy.industrialHiring += hired;
      left -= hired;
    }
  }

  if (upgrade) for (const factory of factories) upgrade(factory);
}

/** Tesis kapanışının dökümü — ekranın ve raporun okuduğu açıklama. */
export function factoryBreakdown(factory) {
  const wages = factory.wages ?? 0;
  const jobs = factoryJobs(factory);
  return {
    id: factory.id,
    typeId: factory.typeId,
    level: factory.level,
    employees: factory.employees ?? 0,
    jobs,
    fill: jobs > 0 ? (factory.employees ?? 0) / jobs : 0,
    throughput: factory.throughput ?? 0,
    inputFulfillment: factory.inputFulfillment ?? 1,
    revenue: factory.revenue ?? 0,
    inputCost: -(factory.inputCost ?? 0),
    valueAdded: (factory.revenue ?? 0) - (factory.inputCost ?? 0),
    wages: -wages,
    wagePerWorker: factory.wagePerWorker ?? 0,
    subsidy: factory.subsidyPaid ?? 0,
    profit: factory.profit ?? 0,
    margin: factory.margin ?? 0,
  };
}

export { MAX_FACTORY_LEVEL };
