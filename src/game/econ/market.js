// PİYASA — tek havuz, izlenebilir kaynak, tek fiyat kuralı.
//
// Her mal için hafta boyunca iki şey birikir: **arz** ve **talep**. İkisi de
// KAYNAĞIYLA BİRLİKTE yazılır (`supplyBy` / `demandBy`), böylece "çelik neden
// pahalı" sorusunun cevabı ekranda yeniden hesaplanmaz, defterden okunur.
//
// Fiyat yalnız arz/talep dengesizliğine bakar. Gizli fiyat terimi yoktur.
//
// Katman notu: yalnız içerik verisini içe aktarır. DOM bilmez.

import { GOODS, GOOD_IDS } from './content.js';

/** Arzın kaynakları — toplamları `supply`yi verir. */
export const SUPPLY_SOURCES = ['rgo', 'factory', 'workshop'];
/** Talebin kaynakları — toplamları `demand`ı verir. */
export const DEMAND_SOURCES = ['households', 'industry', 'army', 'construction', 'state'];

/** Fiyatın haftalık tepki hızı. */
export const PRICE_SPEED = 0.09;
/** Fiyat bandı: taban fiyatın kaç katı arasında gezinebilir. */
export const PRICE_FLOOR = 0.12;
export const PRICE_CEILING = 8;
/** Fiyat grafiğinin tuttuğu haftalık örnek sayısı. */
export const PRICE_HISTORY = 60;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function zeroed(keys) {
  const out = {};
  for (const key of keys) out[key] = 0;
  return out;
}

export function marketGood(id) {
  return {
    id,
    basePrice: GOODS[id].basePrice,
    price: GOODS[id].basePrice,
    previousPrice: GOODS[id].basePrice,
    supply: 0,
    demand: 0,
    traded: 0,
    trend: 0,
    supplyBy: zeroed(SUPPLY_SOURCES),
    demandBy: zeroed(DEMAND_SOURCES),
    history: [],
  };
}

export function initMarket(world) {
  world.market = {
    goods: Object.fromEntries(GOOD_IDS.map((id) => [id, marketGood(id)])),
    lastUpdated: 0,
    totalGdp: 0,
  };
  return world.market;
}

/** Eski kayıt göçü: eksik mal eklenir, katalogdan çıkmış mal düşer. */
export function ensureMarket(world) {
  if (!world.market?.goods) return initMarket(world);
  for (const id of GOOD_IDS) {
    const state = world.market.goods[id] ??= marketGood(id);
    state.basePrice ??= GOODS[id].basePrice;
    state.supplyBy ??= zeroed(SUPPLY_SOURCES);
    state.demandBy ??= zeroed(DEMAND_SOURCES);
    state.history ??= [];
    if (!(state.price > 0)) state.price = GOODS[id].basePrice;
  }
  for (const id of Object.keys(world.market.goods)) {
    if (!GOODS[id]) delete world.market.goods[id];
  }
  return world.market;
}

export function priceOf(world, goodId) {
  return world.market?.goods?.[goodId]?.price ?? GOODS[goodId]?.basePrice ?? 0;
}

/** Haftanın başında piyasa sayaçları sıfırlanır; fiyat ve geçmiş kalır. */
export function resetMarketFlows(market) {
  for (const id in market.goods) {
    const state = market.goods[id];
    state.supply = 0;
    state.demand = 0;
    for (const key of SUPPLY_SOURCES) state.supplyBy[key] = 0;
    for (const key of DEMAND_SOURCES) state.demandBy[key] = 0;
  }
}

/** Ulusun mal defteri. Tek yerde tanımlı: ticaret de ekran da bunu okur. */
export function emptyFlow() {
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
    // GEÇEN HAFTANIN karşılanma oranı. Haftalık sıfırlamadan MUAF: bu
    // haftanın ticareti kapanmadan "raf dolu muydu" sorusunun tek cevabı
    // odur (hane sepeti, ordu ikmali ve gübre bunu okur).
    fulfilledShare: 1,
    supplyBy: zeroed(SUPPLY_SOURCES),
    demandBy: zeroed(DEMAND_SOURCES),
  };
}

export function emptyFlows() {
  return Object.fromEntries(GOOD_IDS.map((id) => [id, emptyFlow()]));
}

export function ensureFlows(nation) {
  const economy = nation.economy;
  const flows = economy.goodsFlow ??= emptyFlows();
  for (const id of GOOD_IDS) {
    const flow = flows[id] ??= emptyFlow();
    flow.supplyBy ??= zeroed(SUPPLY_SOURCES);
    flow.demandBy ??= zeroed(DEMAND_SOURCES);
    for (const key of ['production', 'demand', 'retained', 'domestic', 'imports',
      'exports', 'fulfilled', 'shortage', 'importShare']) flow[key] ??= 0;
    flow.fulfilledShare ??= 1;
  }
  for (const id of Object.keys(flows)) if (!GOODS[id]) delete flows[id];
  return flows;
}

export function resetNationFlows(nation) {
  const flows = ensureFlows(nation);
  for (const id in flows) {
    const flow = flows[id];
    flow.production = 0;
    flow.demand = 0;
    flow.retained = 0;
    flow.domestic = 0;
    flow.imports = 0;
    flow.exports = 0;
    flow.fulfilled = 0;
    flow.shortage = 0;
    // `fulfilledShare` ve `importShare` BİLEREK sıfırlanmaz: ikisi de geçen
    // haftanın ticaret sonucudur ve bu haftanın kararlarına girer.
    for (const key of SUPPLY_SOURCES) flow.supplyBy[key] = 0;
    for (const key of DEMAND_SOURCES) flow.demandBy[key] = 0;
  }
  return flows;
}

/**
 * Arz yazımı: aynı çağrı hem küresel havuza hem ulusun defterine düşer.
 * İki ayrı çağrı olsaydı biri unutulduğunda ticaret ile ekran ayrışırdı.
 */
export function addSupply(market, nation, goodId, source, amount) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const state = market.goods[goodId];
  if (!state) return;
  state.supply += amount;
  state.supplyBy[source] += amount;
  const flow = nation?.economy?.goodsFlow?.[goodId];
  if (flow) {
    flow.production += amount;
    flow.supplyBy[source] += amount;
  }
}

/** Talep yazımı: kaynağıyla birlikte. */
export function addDemand(market, nation, goodId, source, amount) {
  if (!(amount > 0) || !Number.isFinite(amount)) return;
  const state = market.goods[goodId];
  if (!state) return;
  state.demand += amount;
  state.demandBy[source] += amount;
  const flow = nation?.economy?.goodsFlow?.[goodId];
  if (flow) {
    flow.demand += amount;
    flow.demandBy[source] += amount;
  }
}

/**
 * Devletin piyasadan çektiği (askerî stoğa alıkonan) mal. Arzdan düşülür:
 * aynı tüfek hem depoya hem pazara gidemez.
 */
export function retain(market, nation, goodId, amount) {
  if (!(amount > 0)) return;
  const state = market.goods[goodId];
  if (!state) return;
  state.supply = Math.max(0, state.supply - amount);
  const flow = nation?.economy?.goodsFlow?.[goodId];
  if (flow) flow.retained += amount;
}

/**
 * Geçen haftanın küresel bolluğu. Fabrika girdisi bunu okur — bu haftanın
 * ticareti henüz kapanmadığı için tek meşru ölçü geçen haftadır.
 */
export function inputAvailability(market) {
  const out = {};
  const hasHistory = (market.lastUpdated ?? 0) > 0;
  for (const id in market.goods) {
    const state = market.goods[id];
    out[id] = !hasHistory || state.demand <= 0
      ? 1 : clamp(state.supply / state.demand, 0, 1);
  }
  return out;
}

/**
 * FİYAT. Tek kural: talep mevcut arzı aşarsa fiyat yükselir, tersi düşürür.
 *
 *     fiyat ← fiyat × (1 + 0.09 × (talep − arz) / (talep + arz))
 *
 * Bant taban fiyatın 0.12–8 katıdır; bant olmadan kıt bir hammadde fiyatı
 * sınırsız kaçar ve bütün zinciri kilitler.
 */
export function updatePrices(market) {
  let totalGdp = 0;
  for (const id in market.goods) {
    const state = market.goods[id];
    const base = state.basePrice ?? GOODS[id].basePrice;
    state.previousPrice = state.price;
    state.history.push(Number(state.price.toFixed(3)));
    if (state.history.length > PRICE_HISTORY) state.history.shift();
    const total = Math.max(1, state.supply + state.demand);
    const imbalance = (state.demand - state.supply) / total;
    state.price = clamp(
      state.price * (1 + imbalance * PRICE_SPEED),
      base * PRICE_FLOOR,
      base * PRICE_CEILING,
    );
    state.trend = state.price - state.previousPrice;
    state.traded = Math.min(state.supply, state.demand);
    totalGdp += state.traded * state.price;
  }
  market.totalGdp = totalGdp;
}

/**
 * "Çelik neden pahalı?" — ekranın ve raporun okuduğu döküm. Hiçbir sayı
 * burada yeniden hesaplanmaz; hepsi haftanın defterinden gelir.
 */
export function priceExplain(world, nation, goodId) {
  const state = world.market.goods[goodId];
  const flow = nation?.economy?.goodsFlow?.[goodId] ?? emptyFlow();
  const available = flow.production - flow.retained + flow.imports - flow.exports;
  return {
    id: goodId,
    production: flow.production,
    retained: flow.retained,
    imports: flow.imports,
    exports: flow.exports,
    available,
    demand: flow.demand,
    shortage: flow.shortage,
    demandBy: { ...flow.demandBy },
    supplyBy: { ...flow.supplyBy },
    price: state.price,
    basePrice: state.basePrice,
    ratio: state.price / state.basePrice,
    worldSupply: state.supply,
    worldDemand: state.demand,
  };
}
