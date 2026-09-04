
// Ticaret defteri: Trade ekranının okuduğu türetme katmanı.
//
// Bu dosya SİMÜLASYON DEĞİLDİR. Hiçbir sayaç ilerletmez, pazara hiçbir şey
// yazmaz; kanonik veriyi ekranın istediği dört şekle çevirir:
//
//   1. mal satırları    fiyat, akış, karşılanma, durum         (katalog)
//   2. ulusal özet      denge, ihracat/ithalat, baskı           (üst şerit)
//   3. mal dosyası      üretici, tüketici, neden, stok, gümrük  (sağ panel)
//   4. ticaret yapısı   en çok alınan/satılan, bağımlılık       (alt şerit)
//
// Bütün sayılar gerçek simülasyon durumundan gelir (bkz. denetim):
// world.market.goods (fiyat/arz/talep/geçmiş), nation.economy.goodsFlow
// (üretim/talep/ithalat/ihracat/karşılanma), economy.trade, askeri stoklar.
// Tüketici kırılımı simülasyonun KENDİ tablolarından türetilir — CLASS_NEEDS,
// armyWeeklyDemand, fabrika girdileri — kopyalarından değil; bilinemeyen pay
// "Other" satırına düşer ki toplam her zaman gerçek talebi tutsun.
//
// Katman notu: yalnız okur. DOM bilmez, Node'da sınanabilir.

import {
  CLASS_NEEDS, FACTORIES, GOODS, GOOD_IDS, IMPORT_ELASTICITY,
  MILITARY_EQUIPMENT, MILITARY_EQUIPMENT_IDS, POPULATION_UNIT, WORKERS_PER_LEVEL,
  armyWeeklyDemand, equipmentStock, needAmount, workshopArmsOutput,
} from './economy.js';
import { RGO_TYPES, provinceOutput } from './provinces.js';
import { constructionPower, ensureConstruction } from './construction.js';

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/** Fiyat bandın ucuna yapışmış mı? Eşikler updatePrices'ın 0.12–8 bandından. */
export function pricePin(price, base) {
  const ratio = price / base;
  if (ratio >= 7.9) return 'ceiling';
  if (ratio <= 0.13) return 'floor';
  return null;
}

/** Geçmiş dilimi üzerinden yüzde değişim; veri yoksa null. */
function trendOver(history, weeks) {
  if (!history || history.length < 2) return null;
  const slice = history.slice(-weeks);
  const first = slice[0];
  if (!(first > 0)) return null;
  return (slice[slice.length - 1] - first) / first;
}

/**
 * Tek malın katalog satırı. Durum sınıflaması ekranın diline çevrilmiş
 * gerçek ölçülerdir: karşılanma oranı, band ucu, net akış.
 */
export function goodRow(world, nation, id) {
  const good = GOODS[id];
  const state = world.market.goods[id];
  const flow = nation.economy?.goodsFlow?.[id] ?? {};
  const demand = flow.demand ?? 0;
  const production = flow.production ?? 0;
  const coverage = demand > 0.005 ? clamp01((flow.fulfilled ?? 0) / demand) : null;
  const pinned = pricePin(state.price, good.basePrice);
  const active = demand > 0.005 || production > 0.005;

  let status;
  // Kitlik ULKENIN karsilanma oranindan okunur, dunya fiyatindan degil: tavana
  // yapismis bir mal bu ulkede %100 karsilaniyor ve ihrac ediliyor olabilir.
  // Tavan tek basina "severe" verince Sulphur "SEVERE SHORTAGE · 100% met"
  // diye listeleniyor, en buyuk ihracat kalemi kitlik sayisina giriyordu
  // (Open Beta 4, B-6). Fiyat sutunu tavani zaten gosterir.
  if (!active) status = { id: 'idle', label: 'inactive' };
  else if (coverage != null && coverage < 0.55) {
    status = { id: 'severe', label: 'severe shortage' };
  } else if (coverage != null && coverage < 0.925) {
    status = { id: 'short', label: 'shortage' };
  } else if ((flow.exports ?? 0) > 0.05 && (flow.exports ?? 0) > (flow.imports ?? 0)) {
    status = { id: 'export', label: 'export surplus' };
  } else if (pinned === 'floor' || production > demand * 1.3) {
    status = { id: 'surplus', label: 'surplus' };
  } else status = { id: 'balanced', label: 'balanced' };

  // Durumun yanındaki küçük ölçü: kıtlıkta açık, bollukta fazla.
  const detail = status.id === 'severe' || status.id === 'short'
    ? `${Math.round((coverage ?? 0) * 100)}% met · short ${(flow.shortage ?? 0).toFixed(1)}/wk`
    : status.id === 'export' ? `sells ${(flow.exports ?? 0).toFixed(1)}/wk`
      : status.id === 'surplus' ? `spare ${Math.max(0, production - demand).toFixed(1)}/wk`
        : status.id === 'balanced' && coverage != null ? `${Math.round(coverage * 100)}% met` : '';

  // DUZ CUMLE: rozetin altinda "neden boyle" tek satirda durur. Sayilar
  // `detail`de; burasi oyuncunun rakama bakmadan anlayacagi hal. Cumle de
  // sayi da AYNI olculerden turer, ekran hicbirini kendisi yazmaz.
  const importShare = demand > 0.005 ? (flow.imports ?? 0) / demand : 0;
  const reason = !active ? 'No domestic use'
    : status.id === 'severe' ? (importShare > 0.35
      ? 'Imports cannot cover the gap' : 'Demand far exceeds supply')
      : status.id === 'short' ? (importShare > 0.35
        ? 'Import dependent' : 'Demand exceeds supply')
        : status.id === 'export' ? 'Strong exports'
          : status.id === 'surplus' ? 'Strong domestic output'
            : importShare > 0.35 ? 'Balanced, but bought abroad' : 'Balanced market';

  return {
    id,
    name: good.name,
    category: good.category,
    reason,
    importShare,
    price: state.price,
    base: good.basePrice,
    trend: state.trend ?? 0,
    trend36: trendOver(state.history, 36),
    flow,
    coverage,
    pinned,
    active,
    status,
    detail,
    importValue: (flow.imports ?? 0) * state.price,
    exportValue: (flow.exports ?? 0) * state.price,
  };
}

export function goodRows(world, nation) {
  return GOOD_IDS.map((id) => goodRow(world, nation, id));
}

/** Üst şerit: ulusal ticaret künyesi. */
export function tradeSummary(world, nation, rows) {
  const market = world.market;
  const trade = nation.economy?.trade ?? {};
  let pressure = null;
  for (const id of GOOD_IDS) {
    const state = market.goods[id];
    const gap = state.demand - state.supply;
    if (state.demand > 0.05 && (!pressure || gap > pressure.gap)) {
      pressure = { id, name: GOODS[id].name, gap };
    }
  }
  return {
    balance: trade.balance ?? 0,
    exportValue: trade.exportValue ?? 0,
    importValue: trade.importValue ?? 0,
    tariffRevenue: trade.tariffRevenue ?? 0,
    worldTrade: market.totalGdp ?? 0,
    tariff: nation.economy?.tariff ?? 0,
    pressure,
    shortages: rows.filter((row) => row.status.id === 'severe' || row.status.id === 'short').length,
    exportables: rows.filter((row) => row.status.id === 'export').length,
    awaiting: !(trade.lastUpdated > 0),
  };
}

/** Bir tesisin bu haftaki kadro oranı; girdi talebi bununla ölçekleniyor. */
const laborThroughput = (factory) => (factory.employees ?? 0) / WORKERS_PER_LEVEL;

/**
 * Seçili malın yerli üreticileri. Üç gerçek kaynak: RGO'lar (provinceOutput),
 * fabrikalar (tür başına toplanır) ve silah atölyeleri. Kalan fark — gübre
 * verim bonusu, barış anlaşması sevkiyatı — "Other" satırına düşer ki liste
 * toplamı goodsFlow.production'ı tutsun.
 */
function producersOf(world, nation, id, flow) {
  const rows = [];
  let rgoAmount = 0;
  let rgoProvinces = 0;
  let rgoName = null;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const type = RGO_TYPES[province.econ.rgo];
    if (type?.goodId !== id) continue;
    rgoProvinces++;
    rgoName = type.name;
    rgoAmount += provinceOutput(world, province)[id] ?? 0;
  }
  if (rgoProvinces > 0) {
    rows.push({ name: rgoName, amount: rgoAmount, note: `${rgoProvinces} provinces` });
  }

  const byType = new Map();
  for (const factory of nation.economy?.factories ?? []) {
    const type = FACTORIES[factory.typeId];
    if (!type) continue;
    // Silah fabrikasının çıktısı seçili hatta bağlıdır; haftalık gerçek
    // üretim lineOutput'ta hazır durur.
    const amount = factory.typeId === 'ARMS_FACTORY'
      ? ((factory.lineEquipment ?? 'arms') === id ? factory.lineOutput ?? 0 : 0)
      : (type.outputs[id] ?? 0) * (factory.throughput ?? 0);
    if (amount <= 0.001) continue;
    const entry = byType.get(type.name) ?? { name: type.name, amount: 0, count: 0 };
    entry.amount += amount;
    entry.count++;
    byType.set(type.name, entry);
  }
  for (const entry of byType.values()) {
    rows.push({
      name: entry.name,
      amount: entry.amount,
      note: entry.count > 1 ? `${entry.count} plants` : 'factory',
    });
  }
  if (id === 'arms') {
    const workshop = workshopArmsOutput(nation);
    if (workshop > 0.001) rows.push({ name: 'State workshops', amount: workshop, note: 'floor output' });
  }

  const known = rows.reduce((sum, row) => sum + row.amount, 0);
  const residual = (flow.production ?? 0) - known;
  if (residual > 0.05) rows.push({ name: 'Other', amount: residual, note: 'treaties, bonuses' });
  rows.sort((a, b) => b.amount - a.amount);
  return rows;
}

/**
 * Seçili malın yerli tüketicileri. Her satır simülasyonun kendi formülünün
 * okunuşudur: fabrika talebi runFactories'in girdi isteği, nüfus talebi
 * populationDemand'ın sepet × ödeyebilme payı, ordu armyWeeklyDemand,
 * çimento inşaat kuyruğunun bu haftaki işi. Bilinmeyen pay "Other".
 */
function consumersOf(world, nation, id, flow) {
  const rows = [];
  const economy = nation.economy ?? {};

  const byType = new Map();
  for (const factory of economy.factories ?? []) {
    const type = FACTORIES[factory.typeId];
    const need = type?.inputs?.[id];
    if (!need) continue;
    const amount = need * laborThroughput(factory);
    if (amount <= 0.001) continue;
    const entry = byType.get(type.name) ?? { name: type.name, amount: 0, count: 0 };
    entry.amount += amount;
    entry.count++;
    byType.set(type.name, entry);
  }
  for (const entry of byType.values()) {
    rows.push({
      name: entry.name,
      amount: entry.amount,
      note: entry.count > 1 ? `${entry.count} plants` : 'factory input',
      group: 'factories',
    });
  }

  // Nüfus: istenen miktar × ödeyebilme payı (needsMet = öde × bul; buradan
  // yalnız ödeme kapısı geri çıkarılır çünkü talep yalnız onunla kısılır).
  let population = 0;
  for (const [classId, needs] of Object.entries(CLASS_NEEDS)) {
    const need = needs[id];
    if (!need) continue;
    const socialClass = economy.classes?.[classId];
    if (!socialClass) continue;
    const amount = needAmount(need, world.turn ?? 1) * (socialClass.population / POPULATION_UNIT);
    const availability = socialClass.needsAvailable ?? 1;
    const afford = availability > 0 ? clamp01((socialClass.needsMet ?? 1) / availability) : 1;
    population += amount * afford;
  }
  if (population > 0.001) {
    rows.push({ name: 'Population', amount: population, note: 'household baskets', group: 'population' });
  }

  const army = armyWeeklyDemand(world, nation).demand[id] ?? 0;
  if (army > 0.001) rows.push({ name: 'Army upkeep', amount: army, note: 'weekly consumption', group: 'government' });

  const imported = economy.military?.[`${id}Imported`] ?? 0;
  if (imported > 0.001) {
    rows.push({ name: 'Strategic procurement', amount: imported, note: 'stockpile imports', group: 'government' });
  }

  if (id === 'cement') {
    const power = constructionPower(nation);
    const buildWork = ensureConstruction(nation).projects.reduce(
      (sum, project) => sum + Math.min(power, Math.max(0, project.work - project.progress)),
      0,
    );
    const cement = Math.min(buildWork, power) * 0.06;
    if (cement > 0.001) rows.push({ name: 'Construction sites', amount: cement, note: 'building queue', group: 'government' });
  }

  const known = rows.reduce((sum, row) => sum + row.amount, 0);
  const residual = (flow.demand ?? 0) - known;
  if (residual > 0.05) {
    rows.push({
      name: id === 'fertilizer' ? 'Agriculture' : 'Other',
      amount: residual,
      note: id === 'fertilizer' ? 'farm demand' : 'indirect demand',
      group: 'other',
    });
  }
  rows.sort((a, b) => b.amount - a.amount);
  return rows;
}

/**
 * "Fiyat neden oynuyor" — kural tabanlı teşhis. Her cümle gerçek bir ölçüye
 * dayanır; hiçbir neden bulunamıyorsa bunu da açıkça söyler.
 */
function priceReasons(world, nation, row) {
  const reasons = [];
  const state = world.market.goods[row.id];
  const worldGap = state.demand - state.supply;
  const worldTotal = Math.max(1, state.supply + state.demand);

  if (row.pinned === 'ceiling') {
    reasons.push({ tone: 'bad', text: 'Price is pinned at the ceiling — world supply cannot reach this demand.' });
  } else if (row.pinned === 'floor') {
    reasons.push({ tone: 'dim', text: 'Price sits at the floor — almost nobody wants this good.' });
  }
  if (Math.abs(worldGap) / worldTotal > 0.15) {
    reasons.push(worldGap > 0
      ? { tone: 'bad', text: `World demand outruns supply by ${Math.round((worldGap / worldTotal) * 100)}%.` }
      : { tone: 'pos', text: `World supply exceeds demand by ${Math.round((-worldGap / worldTotal) * 100)}%.` });
  }
  if (row.coverage != null && row.coverage < 0.925 && (row.flow.production ?? 0) < (row.flow.demand ?? 0)) {
    reasons.push({
      tone: 'bad',
      text: `Domestic output covers ${Math.round(((row.flow.production ?? 0) / Math.max(0.01, row.flow.demand)) * 100)}% of national need.`,
    });
  }

  // Girdi maliyeti: bu malı üreten tesislerin pahalanan girdileri.
  const inputs = new Set();
  for (const type of Object.values(FACTORIES)) {
    if (type.outputs[row.id]) for (const inputId of Object.keys(type.inputs)) inputs.add(inputId);
  }
  const expensive = [...inputs]
    .map((inputId) => ({ inputId, ratio: world.market.goods[inputId].price / GOODS[inputId].basePrice }))
    .filter((entry) => entry.ratio >= 1.6)
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, 2);
  for (const entry of expensive) {
    reasons.push({ tone: 'warn', text: `${GOODS[entry.inputId].name} input costs ${entry.ratio.toFixed(1)}× base.` });
  }

  const importShare = clamp01(row.flow.importShare ?? 0);
  const tariff = nation.economy?.tariff ?? 0;
  if (importShare > 0.4) {
    reasons.push({
      tone: tariff >= 15 ? 'warn' : 'dim',
      text: `${Math.round(importShare * 100)}% of demand is met abroad${tariff > 0
        ? ` — the ${tariff}% tariff adds +${Math.round(tariff * importShare)}% to its cost` : ''}.`,
    });
  }
  if (row.trend36 != null && Math.abs(row.trend36) > 0.08 && reasons.length < 5) {
    reasons.push({
      tone: row.trend36 > 0 ? 'warn' : 'pos',
      text: `${row.trend36 > 0 ? 'Up' : 'Down'} ${Math.abs(row.trend36 * 100).toFixed(0)}% over the charted weeks.`,
    });
  }
  if (!reasons.length) reasons.push({ tone: 'dim', text: 'Supply and demand are close to balance.' });
  return reasons.slice(0, 5);
}

/**
 * Sağ panelin tamamı: seçili malın dosyası. Ekran hiçbir toplamı kendisi
 * hesaplamaz; buradan hazır alır.
 */
export function goodDossier(world, nation, id) {
  const row = goodRow(world, nation, id);
  const state = world.market.goods[id];
  const flow = row.flow;
  const economy = nation.economy ?? {};

  // Dünya sıralaması: kim üretiyor, biz neredeyiz.
  const board = world.nations
    .filter((other) => other.alive && (other.economy?.goodsFlow?.[id]?.production ?? 0) > 0.01)
    .map((other) => ({ nation: other, production: other.economy.goodsFlow[id].production }))
    .sort((a, b) => b.production - a.production);
  const myRank = board.findIndex((entry) => entry.nation.id === nation.id);
  const worldProduction = board.reduce((sum, entry) => sum + entry.production, 0);

  // Gümrük matematiği simülasyonun kendisi: tariffFactor = 1 + t × ithal payı.
  const tariff = economy.tariff ?? 0;
  const importShare = clamp01(flow.importShare ?? 0);
  const tariffAdd = state.price * (tariff / 100) * importShare;
  const appetite = 1 / Math.max(0.05, 1 + (tariff / 100) * IMPORT_ELASTICITY);

  // Stok yalnız askeri teçhizatta gerçek; sivil mallar haftalık temizlenir.
  const equipment = MILITARY_EQUIPMENT[id];
  const military = economy.military ?? {};
  const stockpile = equipment ? {
    stock: equipmentStock(nation, id),
    cap: equipment.stockCap,
    reserve: equipment.reserve,
    produced: military[`${id}Produced`] ?? 0,
    imported: military[`${id}Imported`] ?? 0,
    used: Number.isFinite(military[`${id}Used`]) ? military[`${id}Used`] : null,
  } : null;

  return {
    row,
    world: { supply: state.supply, demand: state.demand, traded: state.traded },
    history: state.history ?? [],
    producers: producersOf(world, nation, id, flow),
    consumers: consumersOf(world, nation, id, flow),
    reasons: priceReasons(world, nation, row),
    board: board.slice(0, 5),
    myRank: myRank >= 0 ? myRank + 1 : null,
    myShare: worldProduction > 0 && myRank >= 0
      ? board[myRank].production / worldProduction : null,
    boardSize: board.length,
    tariffView: {
      tariff,
      importShare,
      worldPrice: state.price,
      tariffAdd,
      domesticPrice: state.price + tariffAdd,
      appetite,
    },
    stockpile,
  };
}

/** Fabrika girdisi olan mallar — bağımlılık kovaları bunun üstüne kurulur. */
const INPUT_GOODS = new Set(
  Object.values(FACTORIES).flatMap((type) => Object.keys(type.inputs)),
);
const FOOD_GOODS = new Set(['food', 'fish', 'cattle', 'fruit', 'groceries']);
const MILITARY_GOODS = new Set([...MILITARY_EQUIPMENT_IDS, 'ammunition', 'fuel']);

function dependencyOf(rows, filter) {
  let imports = 0;
  let demand = 0;
  for (const row of rows) {
    if (!filter.has(row.id)) continue;
    imports += row.flow.imports ?? 0;
    demand += row.flow.demand ?? 0;
  }
  return demand > 0.05 ? clamp01(imports / demand) : null;
}

/** Alt şerit: ülkenin ticaret yapısı tek bakışta. */
export function tradeStructure(world, nation, rows) {
  const valued = rows.filter((row) => row.active);
  return {
    topImports: [...valued].filter((row) => row.importValue > 0.05)
      .sort((a, b) => b.importValue - a.importValue).slice(0, 3),
    topExports: [...valued].filter((row) => row.exportValue > 0.05)
      .sort((a, b) => b.exportValue - a.exportValue).slice(0, 3),
    dependency: {
      inputs: dependencyOf(rows, INPUT_GOODS),
      food: dependencyOf(rows, FOOD_GOODS),
      military: dependencyOf(rows, MILITARY_GOODS),
    },
  };
}
