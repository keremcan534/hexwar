// Şirketler ve küresel borsa.
//
// BU KATMAN YENİ BİR EKONOMİ DEĞİLDİR. Fabrika simülasyonu, dünya pazarı,
// özel yatırım ve kapitalist geliri olduğu gibi durur; şirket katmanı onlara
// yalnız SAHİP verir. "Özel sermaye bir çelik fabrikası kurdu" cümlesi
// "Aldemar Steel Union Torford'da yeni bir çelik fabrikası açtı" olur.
//
// Üç korunum kuralı bütün dosyayı yönetir:
//
//  1. TEMETTÜ PARA BASMAZ. Şirket kârı zaten var olan bir akıştır: sanayide
//     `factory.profit × PROFIT_TO_CAPITAL` (bugün üst sınıf gelirine yazılır),
//     çıkarımda ham üretim değerinin üst sınıfa düşen payı. Yabancı ortağa
//     ödenen temettü o gelirden DÜŞÜLÜR — yaratılmaz, yön değiştirir.
//  2. HİSSE ALIMI PARA BASMAZ. Alıcının hazinesinden çıkan, ev sahibi ülkenin
//     özel sermaye havuzuna girer. Şirket bu paranın hiçbirini almaz.
//  3. SAHİPLİK BEDAVA MAL VERMEZ. %30 hisse %30 demir değildir. Sahiplik
//     temettü hakkı ve SINIRLI bir alım önceliği verir; mal yine piyasadan,
//     yine parayla alınır (bkz. priorityAccessOf ve settleGlobalTrade).
//
// Hiçbir yerde rastgelelik yoktur: değerleme gerçek kâr ve varlıktan türer ve
// yumuşatılır. "randomEvent = -%12" diye bir kanal yok.

import { makeRng } from '../core/rng.js';
import { settle } from './treasury.js';
import { RGO_TYPES, provinceName } from './provinces.js';
import { atWar } from './diplomacy.js';
import { addInfamy } from './infamy.js';
import { remember } from './chronicle.js';
import { policyOf } from './politics.js';
import {
  FACTORIES, INCOME_POOL_SHARE, INCOME_WEIGHTS, PROFIT_TO_CAPITAL, PROFIT_TO_REINVEST,
  priceOf,
} from './economy.js';

/* ==========================================================================
   1. SEKTÖRLER VE YABANCI SAHİPLİK TAVANLARI
   ========================================================================== */

/**
 * Sektör = stratejik hassasiyet kademesi. Tavanlar oradan gelir: tüketim
 * sanayisine yabancı sermaye normaldir, silah fabrikasına değildir.
 */
export const SECTORS = {
  LIGHT: {
    id: 'LIGHT', name: 'Consumer Industry', short: 'Consumer', cap: 0.49,
    words: ['Mills', 'Manufacturing', 'Trading Company', 'Works'],
  },
  HEAVY: {
    id: 'HEAVY', name: 'Heavy Industry', short: 'Heavy', cap: 0.35,
    words: ['Steel Union', 'Ironworks', 'Foundries', 'Industrial Union'],
  },
  EXTRACTION: {
    id: 'EXTRACTION', name: 'Mining & Resources', short: 'Mining', cap: 0.30,
    words: ['Mining Company', 'Collieries', 'Extraction Company', 'Mining Union'],
  },
  SHIPPING: {
    id: 'SHIPPING', name: 'Shipping & Transport', short: 'Transport', cap: 0.20,
    words: ['Shipping Line', 'Yards', 'Transport Company', 'Navigation Company'],
  },
  ARMS: {
    id: 'ARMS', name: 'Armaments', short: 'Arms', cap: 0.10,
    words: ['Arsenal', 'Ordnance Works', 'Armament Company', 'Defence Works'],
  },
};

export const SECTOR_IDS = Object.keys(SECTORS);

/** Fabrika türü -> sektör. Tablo burada durur: bu şirket alanının bilgisidir. */
const FACTORY_SECTOR = {
  CANNERY: 'LIGHT', WINERY: 'LIGHT', DISTILLERY: 'LIGHT',
  LUMBER_MILL: 'LIGHT', PAPER_MILL: 'LIGHT', FABRIC_MILL: 'LIGHT',
  TEXTILE_MILL: 'LIGHT', LUXURY_WORKSHOP: 'LIGHT', FURNITURE_FACTORY: 'LIGHT',
  LUXURY_FURNITURE_FACTORY: 'LIGHT', TELEPHONE_FACTORY: 'LIGHT', RADIO_FACTORY: 'LIGHT',

  STEEL_MILL: 'HEAVY', MACHINE_PARTS_FACTORY: 'HEAVY', CEMENT_WORKS: 'HEAVY',
  GLASSWORKS: 'HEAVY', DYE_WORKS: 'HEAVY', ELECTRIC_GEAR_FACTORY: 'HEAVY',
  REFINERY: 'HEAVY', SYNTHETIC_OIL_PLANT: 'HEAVY', FERTILIZER_PLANT: 'HEAVY',

  CLIPPER_YARD: 'SHIPPING', STEAMER_YARD: 'SHIPPING', AUTOMOBILE_FACTORY: 'SHIPPING',

  ARMS_FACTORY: 'ARMS', AMMUNITION_FACTORY: 'ARMS', EXPLOSIVES_FACTORY: 'ARMS',
  TANK_FACTORY: 'ARMS', AIRCRAFT_FACTORY: 'ARMS',
};

export function sectorOfFactory(typeId) {
  return FACTORY_SECTOR[typeId] ?? 'LIGHT';
}

/**
 * Yabancı sermaye yasası AYRI BİR YASA DEĞİLDİR: iktidar partisinin ekonomi
 * ve ticaret politikasından türer. Planlı ekonomi yabancı hisseye kapalıdır,
 * laissez-faire açıktır; korumacılık her sektörde kapıyı daraltır.
 *
 * Böylece Örnek C kendiliğinden çalışır: milliyetçi hükûmet seçilince tavan
 * düşer ve tavanın üstünde kalan yabancı pay ZORLA elden çıkarılır
 * (bkz. enforceOwnershipCaps).
 */
export const OPENNESS = {
  OPEN: { id: 'OPEN', name: 'Open', factor: 1 },
  RESTRICTED: { id: 'RESTRICTED', name: 'Restricted', factor: 0.65 },
  PROTECTED: { id: 'PROTECTED', name: 'Protected', factor: 0.35 },
  CLOSED: { id: 'CLOSED', name: 'Closed', factor: 0 },
};

export function opennessOf(nation) {
  const economy = policyOf(nation, 'economy');
  const trade = policyOf(nation, 'trade');
  if (economy === 'planned_economy') return OPENNESS.CLOSED;
  if (economy === 'laissez_faire') {
    return trade === 'protectionism' ? OPENNESS.RESTRICTED : OPENNESS.OPEN;
  }
  if (economy === 'interventionism') {
    return trade === 'protectionism' ? OPENNESS.PROTECTED : OPENNESS.RESTRICTED;
  }
  // state_capitalism
  return trade === 'protectionism' ? OPENNESS.PROTECTED : OPENNESS.RESTRICTED;
}

/**
 * Kamulaştırma sonrası güven kaybı. Tazminatsız el koyan ülkeye yabancı
 * sermaye bir daha kolay girmez; etki zamanla erir (bkz. decayConfidence).
 */
export function confidenceOf(nation) {
  return Math.max(0, Math.min(1, 1 - (nation?.economy?.investmentDistrust ?? 0)));
}

/** Bu sektörde yabancı sermayenin toplam tavanı. */
export function foreignOwnershipCap(nation, sectorId) {
  const sector = SECTORS[sectorId];
  if (!sector) return 0;
  const raw = sector.cap * opennessOf(nation).factor * confidenceOf(nation);
  // Kuruş kırıntısı tavan sayılmasın: %2'nin altı sıfırdır.
  return raw < 0.02 ? 0 : Math.min(sector.cap, Math.round(raw * 1000) / 1000);
}

/* ==========================================================================
   2. KORUNUM SABİTLERİ
   ========================================================================== */

/**
 * KORUNUM NOTU. Aşağıdaki iki oran şirketin sahiplerine düşen haftalık hakkı
 * verir ve ikisi de ZATEN VAR OLAN kanallardır:
 *
 *   sanayi   : factory.profit × PROFIT_TO_CAPITAL  → economy.classes.upper
 *   çıkarım  : ham üretim değeri × INCOME_POOL_SHARE × INCOME_WEIGHTS.upper
 *
 * Yani şirket kârı yeni bir gelir değil, mevcut üst sınıf sermaye gelirinin
 * SAHİPLENDİRİLMİŞ hâlidir. Yabancıya ödenen kısmı üst sınıf gelirinden
 * düşülür (bkz. fiscalBalance ve audit:companies K2).
 */
/**
 * NOT: sabit degil FONKSIYON. economy.js ile companies.js karsilikli import
 * eder (battles<->command'daki gibi); modul govdesinde economy'nin sabitini
 * okumak yukleme sirasina gore `undefined` verirdi. Fonksiyon govdesinde
 * okumak her zaman guvenlidir.
 */
export function rgoCapitalShare() {
  return INCOME_POOL_SHARE * INCOME_WEIGHTS.upper;
}

/**
 * Dağıtılan pay. Kalanı dağıtılmamış kâr olarak yurt içi hissedarda kalır —
 * kimseye ödenmez, dolayısıyla üst sınıf gelirinden de düşülmez. Kâr
 * tamamının temettüye dönmemesi kasıtlıdır.
 */
export const PAYOUT_RATIO = 0.65;

/** Kurucu blok satılmaz: şirketin bu payı hiçbir zaman borsada değildir. */
export const CORE_HOLDING = 0.55;

/** Bir alıcının tek şirkette haftada alabileceği en büyük pay (likidite). */
export const WEEKLY_TRADE_LIMIT = 0.05;

/** Alım/satım makası: alıcı orta fiyatın üstünde öder, satıcı altında alır. */
export const SPREAD = 0.02;

/** Değerlemenin kazanç çarpanı (hafta) ve yumuşatma katsayısı. */
export const EARNINGS_WEEKS = 208;
const BOOK_WEEKS = 26;
const VALUE_SMOOTH = 0.08;
const PROFIT_EMA = 0.06;
/** Büyük alımın fiyata dokunuşu. Spekülasyon değil, derinlik cezası. */
const PRICE_IMPACT = 0.6;
/** Değer izinin uzunluğu (hafta). Sınırlı: kayıt ve bellek şişmesin. */
const HISTORY_LEN = 26;

/** Ayrıcalıklı erişim: sahiplik payının teklif ağırlığına dönüşme oranı. */
export const ACCESS_FACTOR = 0.35;
/** Tek malda kazanılabilecek en büyük öncelik ağırlığı. */
export const ACCESS_CAP = 0.20;

/** Zorla elden çıkarmanın haftalık hızı (tavan düştüğünde). */
const DIVEST_STEP = 0.01;

/**
 * Şirket kasasının tavanı, defter değerinin katı olarak. Sınırsız bırakılsaydı
 * kârlı şirket yüz yılda para dağı biriktirir ve ulusal sermaye havuzunu
 * kurutur — bileşik büyümenin frenlerinden biri budur.
 */
const CASH_CAP_RATIO = 0.6;
const CASH_CAP_FLOOR = 120;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/* ==========================================================================
   3. KAYIT: KURULUŞ VE VARLIK EŞLEMESİ
   ========================================================================== */

const NAME_PREFIX = [
  'Imperial', 'United', 'Northern', 'Southern', 'Grand', 'Royal', 'Continental',
  'Eastern', 'Western', 'Consolidated', 'Anchor', 'Crown', 'Meridian', 'Union',
];

function companyName(world, nation, sectorId) {
  const rng = makeRng(`${world.seed}-company-${nation.id}-${sectorId}`);
  const sector = SECTORS[sectorId];
  const stem = String(nation.name ?? 'State').split(/\s+/)[0];
  // İki kalıp: "Aldemar Steel Union" ve "Imperial Aldemar Collieries".
  return rng.chance(0.5)
    ? `${stem} ${rng.pick(sector.words)}`
    : `${rng.pick(NAME_PREFIX)} ${stem} ${rng.pick(sector.words)}`;
}

function newCompany(world, nation, sectorId) {
  return {
    id: `c${nation.id}-${sectorId}`,
    name: companyName(world, nation, sectorId),
    home: nation.id,
    sector: sectorId,
    founded: world.turn ?? 0,
    factoryIds: [],
    revenue: 0,
    grossProfit: 0,
    capitalReturn: 0,
    profitAvg: 0,
    dividend: 0,
    employees: 0,
    levels: 0,
    cash: 0,
    book: 0,
    value: 0,
    owners: {},
    outputs: {},
    history: [],
    lastInvestment: null,
    lastSeizure: null,
    failingWeeks: 0,
  };
}

export function ensureCompanyState(nation) {
  const economy = nation.economy;
  if (!economy) return null;
  economy.companies ??= [];
  // Eski kayıt / bozuk satır temizliği: tanınmayan sektör düşer.
  if (economy.companies.some((company) => !SECTORS[company.sector])) {
    economy.companies = economy.companies.filter((company) => SECTORS[company.sector]);
  }
  for (const company of economy.companies) {
    company.owners ??= {};
    company.factoryIds ??= [];
    company.outputs ??= {};
    company.history ??= [];
    company.cash = Math.max(0, company.cash ?? 0);
    company.value = Math.max(0, company.value ?? 0);
  }
  economy.portfolio ??= { value: 0, dividend: 0, stakes: 0 };
  economy.priorityAccess ??= {};
  return economy.companies;
}

export function companiesOf(nation) {
  return nation?.economy?.companies ?? [];
}

/** Bu fabrika türünün sahibi olacak yerli şirket (yoksa null). */
export function companyForFactoryType(nation, typeId) {
  const sectorId = sectorOfFactory(typeId);
  return companiesOf(nation).find((company) => company.sector === sectorId) ?? null;
}

export function companyById(nation, companyId) {
  if (!companyId) return null;
  return companiesOf(nation).find((company) => company.id === companyId) ?? null;
}

/** Bütün dünyadaki şirketler. Sıra sabittir: ülke sırası, sonra sektör sırası. */
export function allCompanies(world) {
  const out = [];
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const company of companiesOf(nation)) out.push(company);
  }
  return out;
}

export function findCompany(world, companyId) {
  for (const nation of world.nations) {
    const hit = companiesOf(nation).find((company) => company.id === companyId);
    if (hit) return hit;
  }
  return null;
}

/**
 * Fabrikaları sektör şirketlerine dağıtır ve gerekiyorsa şirket kurar.
 *
 * SINIRLI SAYIDA ŞİRKET: ülke başına en çok beş (dört sanayi sektörü + bir
 * çıkarım). Binlerce mikro şirket ne okunur ne yönetilir; stratejik ölçek
 * budur.
 */
export function ensureCompanies(world, nation) {
  const economy = nation.economy;
  if (!economy || !nation.alive) return [];
  const companies = ensureCompanyState(nation);
  const bySector = new Map(companies.map((company) => [company.sector, company]));

  // 1) Sanayi: her fabrikayı sektörüne yaz.
  const wanted = new Map();
  for (const factory of economy.factories ?? []) {
    const sectorId = sectorOfFactory(factory.typeId);
    if (!wanted.has(sectorId)) wanted.set(sectorId, []);
    wanted.get(sectorId).push(factory.id);
  }
  // 2) Çıkarım: ülkenin madenleri tek şirkette toplanır (bkz. economy.extraction).
  const extraction = economy.extraction;
  if ((extraction?.count ?? 0) > 0) wanted.set('EXTRACTION', []);

  for (const [sectorId, ids] of wanted) {
    let company = bySector.get(sectorId);
    if (!company) {
      company = newCompany(world, nation, sectorId);
      companies.push(company);
      bySector.set(sectorId, company);
    }
    company.factoryIds = ids;
  }
  // Varlığı kalmayan şirket kayıttan DÜŞMEZ (hisseleri var): boşta kalır,
  // değeri erir ve `defunct` işaretlenir. Sahiplik sessizce buharlaşmamalı.
  for (const company of companies) {
    const alive = wanted.has(company.sector);
    company.defunct = !alive;
    if (!alive) company.factoryIds = [];
  }
  // Varlığı da hissedarı da kalmamış, değeri erimiş kabuk kayıttan düşer:
  // kayıt sınırlı kalsın. Hissedarı olan kabuk DURUR — sahiplik sessizce
  // buharlaşmaz; ülke o sektöre yeniden fabrika kurarsa şirket aynı kimlik
  // ve aynı hissedarlarla canlanır.
  for (let i = companies.length - 1; i >= 0; i--) {
    const company = companies[i];
    if (company.defunct && company.value < 1 && !Object.keys(company.owners).length) {
      companies.splice(i, 1);
    }
  }
  // Sıra determinizmi: sektör tablosunun sırası.
  companies.sort((a, b) => SECTOR_IDS.indexOf(a.sector) - SECTOR_IDS.indexOf(b.sector));
  return companies;
}

/* ==========================================================================
   4. SAHİPLİK
   ========================================================================== */

/** Yurt içi özel hissedarların payı: %100'den ortakların payı düşülür. */
export function domesticShare(company) {
  let owned = 0;
  for (const key in company.owners) owned += company.owners[key];
  return clamp(1 - owned, 0, 1);
}

/** Yabancı sermayenin toplam payı (ev sahibi devletin kendi payı hariç). */
export function foreignShare(company) {
  let owned = 0;
  for (const key in company.owners) {
    if (Number(key) !== company.home) owned += company.owners[key];
  }
  return clamp(owned, 0, 1);
}

export function stakeOf(company, nationId) {
  return company?.owners?.[nationId] ?? 0;
}

/** Borsada gerçekten alınabilir pay: kurucu blok ve mevcut ortaklar dışı. */
export function freeFloat(company) {
  let owned = 0;
  for (const key in company.owners) owned += company.owners[key];
  return clamp(1 - CORE_HOLDING - owned, 0, 1);
}

/**
 * `buyer`ın bu şirkette bu hafta alabileceği en büyük pay. Dört kapı birden:
 * serbest dolaşım, sektör/yasa tavanı, haftalık likidite, ve savaş.
 */
export function purchasableShare(world, buyer, company) {
  if (!company || company.defunct) return 0;
  const home = world.nations[company.home];
  if (!home?.alive || !buyer?.alive) return 0;
  if (buyer.id !== company.home && atWar(world, buyer.id, company.home)) return 0;
  let limit = freeFloat(company);
  if (buyer.id !== company.home) {
    const cap = foreignOwnershipCap(home, company.sector);
    limit = Math.min(limit, Math.max(0, cap - foreignShare(company)));
  }
  return Math.max(0, Math.min(limit, WEEKLY_TRADE_LIMIT));
}

/** Payın orta fiyatı. Alıcı makas kadar üstünü, satıcı altını görür. */
export function sharePrice(company, share) {
  return Math.max(0, company.value ?? 0) * Math.max(0, share);
}

/* ==========================================================================
   5. ALIM / SATIM — para transferdir, yaratılmaz
   ========================================================================== */

function creditSellerPool(home, amount) {
  // Satan yurt içi hissedardır: parası ülkenin özel sermaye havuzuna girer ve
  // oradan sanayiye döner. Şirket bu paranın hiçbirini ALMAZ (aksi hâlde aynı
  // para hem satıcıda hem şirkette olurdu).
  if (!home.politics) return;
  home.politics.privateCapital = Math.max(0, (home.politics.privateCapital ?? 0) + amount);
}

/**
 * Yabancı (ya da yerli devlet) sermayesiyle hisse alımı.
 * @returns {{share:number, cost:number}|null}
 */
export function buyShares(game, buyer, company, requested) {
  const world = game.world;
  const home = world.nations[company.home];
  if (!home?.alive) return null;
  const share = Math.min(Math.max(0, requested), purchasableShare(world, buyer, company));
  if (share < 0.0005) return null;
  const cost = sharePrice(company, share) * (1 + SPREAD);
  if (!(cost > 0) || buyer.gold < cost) return null;

  settle(buyer, 'share', -cost);
  creditSellerPool(home, cost);

  company.owners[buyer.id] = clamp(stakeOf(company, buyer.id) + share, 0, 1);
  // Derinlik cezası: büyük alım fiyatı iter, sonraki dilim pahalanır.
  company.value = Math.max(0, company.value * (1 + share * PRICE_IMPACT));
  game.emit?.('companies', company);
  return { share, cost };
}

/**
 * Elden çıkarma. Likidite gerçektir: yurt içi sermaye havuzu ne kadar
 * ödeyebiliyorsa o kadar hisse satılır.
 */
export function sellShares(game, seller, company, requested) {
  const world = game.world;
  const home = world.nations[company.home];
  const held = stakeOf(company, seller.id);
  let share = Math.min(Math.max(0, requested), held, WEEKLY_TRADE_LIMIT);
  if (share < 0.0005 || !home?.alive) return null;
  const pool = Math.max(0, home.politics?.privateCapital ?? 0);
  const unit = sharePrice(company, 1) * (1 - SPREAD);
  if (!(unit > 0)) return null;
  // Havuz yetmiyorsa satış KISMİDİR: pozisyonu bir haftada boşaltmak yok.
  share = Math.min(share, pool / unit);
  if (share < 0.0005) return null;
  const proceeds = unit * share;

  home.politics.privateCapital = Math.max(0, pool - proceeds);
  settle(seller, 'share', proceeds);

  const left = clamp(held - share, 0, 1);
  if (left < 0.0005) delete company.owners[seller.id];
  else company.owners[seller.id] = left;
  company.value = Math.max(0, company.value * (1 - share * PRICE_IMPACT * 0.5));
  game.emit?.('companies', company);
  return { share, proceeds };
}

/* ==========================================================================
   6. HAFTALIK ÇEVRİM
   ========================================================================== */

/** Şirketin bu haftaki gerçek üretim sayıları. Uydurma kalem yoktur. */
function measureCompany(world, nation, company) {
  const economy = nation.economy;
  company.revenue = 0;
  company.grossProfit = 0;
  company.employees = 0;
  company.levels = 0;
  company.book = 0;
  const outputs = company.outputs;
  for (const key in outputs) delete outputs[key];

  if (company.sector === 'EXTRACTION') {
    const extraction = economy.extraction ?? null;
    const value = Math.max(0, extraction?.value ?? 0);
    company.revenue = value;
    // Çıkarımda tesis kârı yoktur; sahibin hakkı ham üretim değerinin üst
    // sınıfa düşen payıdır — zaten var olan kanal (bkz. RGO_CAPITAL_SHARE).
    company.grossProfit = value * rgoCapitalShare();
    company.capitalReturn = company.grossProfit;
    company.employees = Math.round(extraction?.jobs ?? 0);
    company.book = value * BOOK_WEEKS;
    for (const id in extraction?.byGood ?? {}) {
      outputs[id] = extraction.byGood[id];
    }
    return;
  }

  const wanted = new Set(company.factoryIds);
  for (const factory of economy.factories ?? []) {
    if (!wanted.has(factory.id)) continue;
    const type = FACTORIES[factory.typeId];
    if (!type) continue;
    company.grossProfit += factory.profit ?? 0;
    company.employees += Math.max(0, factory.employees ?? 0);
    company.levels += Math.max(0, factory.level ?? 0);
    company.book += (type.cost?.gold ?? 100) * Math.max(0, factory.level ?? 0);
    const throughput = Math.max(0, factory.throughput ?? 0);
    for (const id in type.outputs) {
      const qty = type.outputs[id] * throughput;
      outputs[id] = (outputs[id] ?? 0) + qty;
      company.revenue += qty * priceOf(world, id);
    }
  }
  company.capitalReturn = company.grossProfit * PROFIT_TO_CAPITAL;
}

function revalue(company) {
  const earnings = company.profitAvg * EARNINGS_WEEKS;
  const book = Math.max(0, company.book);
  // Zarar eden şirket sıfıra düşmez: varlığının hurda değeri kalır.
  const target = Math.max(book * 0.25, book * 0.45 + earnings * 0.55) + company.cash;
  company.value = Math.max(0, company.value + (target - company.value) * VALUE_SMOOTH);
  company.history.push(Number(company.value.toFixed(1)));
  if (company.history.length > HISTORY_LEN) company.history.shift();
}

/**
 * Tavanın altına inmeyen yabancı payı yavaşça elden çıkarılır. Milliyetçi
 * hükûmetin seçilmesi bir gecede müsadere değildir; kapı kapanır, pozisyon
 * piyasa değerinden ve havuzun yettiği kadar boşaltılır.
 */
function enforceOwnershipCaps(game, home, company) {
  const world = game.world;
  const cap = foreignOwnershipCap(home, company.sector);
  let excess = foreignShare(company) - cap;
  if (excess <= 0.0005) return;
  // En büyük yabancı ortaktan başla; sıra ülke kimliğine göre sabittir.
  const holders = Object.keys(company.owners)
    .map(Number)
    .filter((id) => id !== company.home && company.owners[id] > 0)
    .sort((a, b) => (company.owners[b] - company.owners[a]) || (a - b));
  for (const id of holders) {
    if (excess <= 0.0005) break;
    const owner = world.nations[id];
    if (!owner?.alive) { delete company.owners[id]; continue; }
    const step = Math.min(DIVEST_STEP, company.owners[id], excess);
    const sold = sellShares(game, owner, company, step);
    if (!sold) {
      // Havuz ödeyemiyorsa pay yine de düşer ama TAZMİNATSIZ değil: bu
      // durumda hiç düşmez, tavan baskısı gelecek haftaya kalır.
      break;
    }
    excess -= sold.share;
  }
}

/**
 * Bir ülkenin şirketlerinin haftalık kapanışı. `fiscalBalance`ten ÖNCE koşar:
 * üst sınıf gelirinden düşülecek temettü bu hafta belli olmalıdır.
 */
export function runCompanies(game, nation) {
  const world = game.world;
  const economy = nation.economy;
  if (!economy || !nation.alive) return;
  const companies = ensureCompanies(world, nation);
  economy.capitalWithheld = 0;
  economy.dividendsOut = 0;
  if (!companies.length) return;

  // Yabancıya ödenebilecek toplamın tavanı: üst sınıfın bu haftaki sermaye
  // geliri. Bundan fazlası ödenirse para yoktan var olurdu.
  const upperCapital = Math.max(0,
    Math.max(1, (economy.baseOutputValue ?? 0) * INCOME_POOL_SHARE) * INCOME_WEIGHTS.upper
    + (economy.factoryProfit ?? 0) * PROFIT_TO_CAPITAL);
  let budget = upperCapital;

  // YENIDEN-YATIRIM KANALININ YENIDEN YONLENDIRILMESI (yeni para DEGIL).
  // Bugun `factoryProfit x PROFIT_TO_REINVEST` dogrudan ulusal ozel sermaye
  // havuzuna akiyor (bkz. politics.collectPrivateCapital). Ayni tutarin
  // sanayi sirketlerine dusen payi artik SIRKET KASASINA gider ve o sirketin
  // kendi santiyesini fonlar; havuza giden kisim tam o kadar azalir. Boylece
  // "karli sirket daha cok buyur" kurali ikinci bir sermaye ekonomisi
  // kurmadan calisir.
  const reinvestPool = Math.max(0, economy.factoryProfit ?? 0) * PROFIT_TO_REINVEST;
  economy.reinvestToCompanies = 0;
  // Pay tabani BU HAFTANIN tesis karlarindan cikar; olcum donguden once
  // yapilir ki dagitim sirasi sonucu degistirmesin (determinizm).
  let profitBase = 0;
  for (const company of companies) {
    measureCompany(world, nation, company);
    if (company.sector !== 'EXTRACTION') profitBase += Math.max(0, company.grossProfit ?? 0);
  }

  for (const company of companies) {
    company.profitAvg += (company.capitalReturn - company.profitAvg) * PROFIT_EMA;
    revalue(company);
    company.failingWeeks = company.capitalReturn < 0
      ? Math.min(520, company.failingWeeks + 1) : 0;

    if (company.sector !== 'EXTRACTION' && profitBase > 0 && reinvestPool > 0) {
      const claim = reinvestPool * (Math.max(0, company.grossProfit) / profitBase);
      const room = Math.max(0, Math.max(CASH_CAP_FLOOR, company.book * CASH_CAP_RATIO) - company.cash);
      const taken = Math.min(claim, room);
      company.cash += taken;
      economy.reinvestToCompanies += taken;
    }

    // Donma her hafta yeniden olculur: baris imzalandiginda temettu kendiliginden
    // akmaya baslar, ayri bir "coz" eylemi gerekmez.
    company.frozen = false;
    const distributable = Math.max(0, company.capitalReturn) * PAYOUT_RATIO;
    company.dividend = distributable;
    if (distributable <= 0) {
      enforceOwnershipCaps(game, nation, company);
      continue;
    }

    for (const key in company.owners) {
      const ownerId = Number(key);
      const share = company.owners[key];
      if (!(share > 0)) continue;
      const owner = world.nations[ownerId];
      if (!owner?.alive) continue;
      // SAVAŞ: düşman ortağa temettü ödenmez. Pay durur, akış donar; para
      // yurt içi hissedarda kalır (üst sınıf gelirinden düşülmez).
      if (ownerId !== company.home && atWar(world, ownerId, company.home)) {
        company.frozen = true;
        continue;
      }
      const amount = Math.min(distributable * share, budget);
      if (amount <= 0) break;
      budget -= amount;
      economy.capitalWithheld += amount;
      economy.dividendsOut += amount;
      settle(owner, 'dividend', amount);
    }
    enforceOwnershipCaps(game, nation, company);
  }
  decayConfidence(nation);
}

/** Kamulaştırma izi zamanla silinir: yasak kalıcı değil, hafızası uzundur. */
function decayConfidence(nation) {
  const distrust = nation.economy.investmentDistrust ?? 0;
  if (distrust <= 0) return;
  nation.economy.investmentDistrust = distrust > 0.002 ? distrust * 0.995 : 0;
}

/* ==========================================================================
   7. AYRICALIKLI ERİŞİM — mal yine parayla alınır
   ========================================================================== */

/**
 * Sahipliğin tek fiziksel karşılığı: dünya pazarındaki ithalat sırasında
 * ÖNCELİK. Bedava mal yok, indirim yok — yalnız kıtlıkta payını daha önce
 * alma hakkı. Ağırlık `settleGlobalTrade` içinde aynı toplam ticaret
 * hacminin yeniden dağıtımıdır (bkz. oradaki not): mal yaratmaz.
 */
export function refreshPriorityAccess(world) {
  let any = false;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    const table = nation.economy.priorityAccess ?? (nation.economy.priorityAccess = {});
    for (const key in table) delete table[key];
  }
  for (const host of world.nations) {
    if (!host.alive) continue;
    for (const company of companiesOf(host)) {
      if (company.defunct) continue;
      for (const key in company.owners) {
        const ownerId = Number(key);
        if (ownerId === company.home) continue;
        const share = company.owners[key];
        if (!(share > 0)) continue;
        const owner = world.nations[ownerId];
        if (!owner?.alive || !owner.economy) continue;
        // Savaşta ayrıcalık yoktur: bağımlılık tam da burada tehlikeye döner.
        if (atWar(world, ownerId, company.home)) continue;
        const table = owner.economy.priorityAccess;
        for (const goodId in company.outputs) {
          if (!(company.outputs[goodId] > 0)) continue;
          const next = Math.min(ACCESS_CAP, (table[goodId] ?? 0) + share * ACCESS_FACTOR);
          table[goodId] = next;
          if (next > 0) any = true;
        }
      }
    }
  }
  world.market.hasPriority = any;
  return any;
}

/* ==========================================================================
   8. KAMULAŞTIRMA
   ========================================================================== */

/**
 * Tazminat kademeleri. Diplomatik bedel UYDURMA BIR MODIFIER DEGILDIR: oyunda
 * zaten dunyanin tepkisini tasiyan kanal sohrettir (infamy -> koalisyon esigi,
 * bkz. infamy.js INFAMY_COALITION = 22). Tazminatsiz el koyma tek basina bir
 * sehir fethi kadar sohret yakar; ustune yatirim guveni cokerek yabancı
 * sermayeyi yillarca uzak tutar.
 */
export const SEIZURE_MODES = {
  compensated: {
    id: 'compensated', name: 'Compensated Purchase', rate: 1, infamy: 1, distrust: 0.05,
    desc: 'The treasury buys every foreign share at market value.',
  },
  partial: {
    id: 'partial', name: 'Partial Compensation', rate: 0.4, infamy: 5, distrust: 0.22,
    desc: 'Foreign holders are paid two fifths of market value and told to accept it.',
  },
  seizure: {
    id: 'seizure', name: 'Outright Seizure', rate: 0, infamy: 12, distrust: 0.45,
    desc: 'Foreign shares are confiscated without payment. The world will remember.',
  },
};

/**
 * Ev sahibi devlet yabancı payı devralır. Sonucu politik: tazminatsız el koyma
 * ilişkiyi yerle bir eder ve ülkeye yıllarca yabancı sermaye girmez.
 * Hazine ödemeyi karşılayamıyorsa TAM tazminat seçilemez.
 */
export function nationalize(game, nation, company, modeId = 'compensated') {
  const world = game.world;
  const mode = SEIZURE_MODES[modeId];
  if (!mode || !company || company.home !== nation.id) return null;
  const victims = Object.keys(company.owners)
    .map(Number)
    .filter((id) => id !== nation.id && company.owners[id] > 0)
    .sort((a, b) => a - b);
  if (!victims.length) return null;

  const taken = victims.reduce((sum, id) => sum + company.owners[id], 0);
  const due = sharePrice(company, taken) * mode.rate;
  if (due > nation.gold) return null;

  let paid = 0;
  for (const id of victims) {
    const owner = world.nations[id];
    const amount = sharePrice(company, company.owners[id]) * mode.rate;
    delete company.owners[id];
    if (!owner?.alive) continue;
    if (amount > 0) {
      // Kamulastirma tazminati bir TRANSFERDIR: iki tarafi da defterli.
      settle(nation, 'share', -amount);
      settle(owner, 'share', amount);
      paid += amount;
    }
    // Diplomatik hafıza: mağdurun ülke paneli bunu yıllarca gösterir. Ayrı
    // bir talep/tazminat sistemi kurulmaz — hafıza ve şöhret zaten vardır.
    remember(owner, world.turn ?? 0, 'industry_seized_by', nation.id);
    remember(nation, world.turn ?? 0, 'seized_industry_of', id);
  }
  // Dünyanın tepkisi: şöhret. Tazminatsız el koyan ülke koalisyon eşiğine
  // yaklaşır; tazminatlı devralma neredeyse bedelsizdir.
  if (mode.infamy > 0) addInfamy(nation, mode.infamy);
  nation.economy.investmentDistrust = clamp(
    (nation.economy.investmentDistrust ?? 0) + mode.distrust, 0, 0.9,
  );
  company.lastSeizure = { turn: world.turn ?? 0, mode: mode.id, share: taken, paid };
  company.frozen = false;
  game.emit?.('companies', company);
  return { share: taken, paid, mode: mode.id };
}

/* ==========================================================================
   9. PORTFÖY VE EKRAN YARDIMCILARI (sıcak yolda değil)
   ========================================================================== */

export function portfolioOf(world, nation) {
  let value = 0;
  let dividend = 0;
  let stakes = 0;
  let frozen = 0;
  for (const host of world.nations) {
    if (!host.alive) continue;
    for (const company of companiesOf(host)) {
      const share = stakeOf(company, nation.id);
      if (!(share > 0)) continue;
      stakes++;
      value += sharePrice(company, share);
      const cut = atWar(world, nation.id, company.home) && company.home !== nation.id;
      if (cut) frozen++;
      else dividend += (company.dividend ?? 0) * share;
    }
  }
  return { value, dividend, stakes, frozen };
}

/** Bu ülkenin sanayisinde yabancı sermayenin ağırlığı (değer ağırlıklı). */
export function foreignPresenceOf(nation) {
  let owned = 0;
  let total = 0;
  for (const company of companiesOf(nation)) {
    total += company.value;
    owned += company.value * foreignShare(company);
  }
  return { share: total > 0 ? owned / total : 0, value: owned, total };
}

/** Şirketin işlettiği yerler. Ekran içindir; haftalık döngüde çağrılmaz. */
export function companySites(world, nation, company) {
  if (company.sector === 'EXTRACTION') {
    const sites = [];
    for (const province of world.provinces ?? []) {
      if (province.owner !== nation.id || !province.econ) continue;
      if (RGO_TYPES[province.econ.rgo]?.track !== 'extraction') continue;
      const centre = world.get(province.center.q, province.center.r);
      if (!centre) continue;
      sites.push({ name: provinceName(centre), detail: RGO_TYPES[province.econ.rgo].name });
      if (sites.length >= 8) break;
    }
    return sites;
  }
  const wanted = new Set(company.factoryIds);
  return (nation.economy?.factories ?? [])
    .filter((factory) => wanted.has(factory.id))
    .slice(0, 12)
    .map((factory) => ({
      name: FACTORIES[factory.typeId]?.name ?? factory.typeId,
      detail: `level ${factory.level}`,
      profit: factory.profit ?? 0,
    }));
}

/**
 * Şirketin bu haftaki en kırılgan girdisi: fabrikaların karşılanma oranı en
 * düşük girdisi. "Onu ne tehdit ediyor" sorusunun gerçek cevabı.
 */
export function inputThreatOf(nation, company) {
  let worst = null;
  const wanted = new Set(company.factoryIds);
  for (const factory of nation.economy?.factories ?? []) {
    if (!wanted.has(factory.id)) continue;
    const type = FACTORIES[factory.typeId];
    for (const id in type?.inputs ?? {}) {
      const flow = nation.economy.goodsFlow?.[id];
      const share = flow?.demand > 0 ? clamp((flow.fulfilled ?? 0) / flow.demand, 0, 1) : 1;
      if (!worst || share < worst.share) worst = { goodId: id, share };
    }
  }
  return worst;
}

/* ==========================================================================
   10. YZ'NİN YABANCI YATIRIMI
   ========================================================================== */

/** Ülke başına değerlendirme aralığı (hafta) ve hazine eşiği. */
const INVEST_INTERVAL = 13;
const INVEST_FLOOR = 620;
/** Tek değerlendirmede ayrılan en büyük tutar ve alınan en büyük pay. */
const INVEST_BUDGET_SHARE = 0.25;
const INVEST_TRANCHE = 0.03;
/** Bu doygunluğun üstünde pozisyona dokunulmaz: portföy çalkalanmasın. */
const INVEST_SATIATION = 0.8;

/**
 * Ne kadar muhtaç olduğumuz: geçen haftanın karşılanmayan talebi. Uydurma bir
 * "stratejik mal" listesi yok — ülkenin kendi kıtlığı listeyi kendisi yazar.
 */
function scarcityOf(nation, goodId) {
  const flow = nation.economy?.goodsFlow?.[goodId];
  if (!flow || !(flow.demand > 0)) return 0;
  return clamp((flow.shortage ?? 0) / flow.demand, 0, 1);
}

/**
 * YZ'nin yabancı hisse alımı. Kasıtla SADE ve YAPIŞKAN: üç ayda bir bakar,
 * tek bir küçük dilim alır, sattığı hiç olmaz (satışı yalnız tavan zorlar).
 * Portföy çevirme diye bir davranış yoktur.
 *
 * OYUNCU İÇİN ÇALIŞMAZ — devir anahtarları finansal yatırımı kapsamaz
 * (bkz. delegation.js ve görevin "AUTO + COMPANIES" bölümü).
 */
export function runInvestmentAI(game, nation) {
  const world = game.world;
  const turn = world.turn ?? 0;
  if (!nation.alive || !nation.economy) return null;
  if (nation.id === game.turns?.playerNation) return null;
  if ((turn + nation.id) % INVEST_INTERVAL !== 0) return null;
  // Fazla sermaye şartı: borçsuz, temerrütsüz, hazinesi bol.
  if (nation.gold < INVEST_FLOOR) return null;
  if ((nation.debt ?? 0) > 0) return null;
  if ((nation.economy.creditPenalty ?? 0) > 0.05) return null;
  const budget = Math.max(0, (nation.gold - INVEST_FLOOR) * INVEST_BUDGET_SHARE);
  if (budget <= 0) return null;

  let best = null;
  let bestScore = 0;
  for (const host of world.nations) {
    if (!host.alive || host.id === nation.id) continue;
    if (atWar(world, nation.id, host.id)) continue;
    for (const company of companiesOf(host)) {
      if (company.defunct || !(company.value > 0)) continue;
      const cap = foreignOwnershipCap(host, company.sector);
      if (cap <= 0) continue;
      const held = stakeOf(company, nation.id);
      if (held >= cap * INVEST_SATIATION) continue;
      const room = purchasableShare(world, nation, company);
      if (room < 0.005) continue;
      // 1) Bağımlılık: bu şirketin ürettiği mallardan hangisi bize eksik?
      let need = 0;
      for (const goodId in company.outputs) {
        if (company.outputs[goodId] > 0) need = Math.max(need, scarcityOf(nation, goodId));
      }
      // 2) Getiri: gerçek temettü / gerçek değer.
      const yieldRate = clamp((company.dividend * 52) / company.value, 0, 1);
      // 3) Risk: geçmişte savaştığımız ülkenin sanayisine para bağlamayız.
      const wars = relationWars(world, nation.id, host.id);
      const risk = 1 / (1 + wars * 0.8 + (nation.rivalId === host.id ? 2 : 0));
      const score = (0.35 + need * 1.6 + yieldRate * 2.2) * risk;
      if (score > bestScore) {
        bestScore = score;
        best = { company, room };
      }
    }
  }
  if (!best) return null;
  const affordable = best.company.value > 0 ? budget / (best.company.value * (1 + SPREAD)) : 0;
  const share = Math.min(best.room, INVEST_TRANCHE, affordable);
  if (share < 0.005) return null;
  return buyShares(game, nation, best.company, share);
}

/** Kaçıncı savaş: ilişki kaydının sayacı (bkz. diplomacy.declareWar). */
function relationWars(world, a, b) {
  return world.relations?.[a]?.[b]?.wars ?? 0;
}

/* ==========================================================================
   11. EKRAN TURETME — yalniz OKUR, haftalik dongude cagrilmaz
   ==========================================================================
   Kalip tradeLedger.js ile ayni: butun sayilar burada cikarilir, ui/ katmani
   yalniz cizer. Boylece ekran ile simulasyon ayni halkin iki farkli
   hikayesini anlatmaz.
   ========================================================================== */

/** Deger egilimi: 13 hafta once neredeydi? */
function trendOf(company) {
  const history = company.history ?? [];
  if (history.length < 4) return 0;
  const past = history[Math.max(0, history.length - 14)];
  if (!(past > 0)) return 0;
  return (company.value - past) / past;
}

/**
 * Borsa listesi. Sutunlar gorevin istedigi kadar; UYDURMA SUTUN YOK — borc
 * gibi bu mimaride karsiligi olmayan alanlar hic gosterilmez.
 */
export function exchangeRows(world, viewer) {
  const rows = [];
  for (const host of world.nations) {
    if (!host.alive) continue;
    for (const company of companiesOf(host)) {
      const stake = stakeOf(company, viewer.id);
      const foreign = foreignShare(company);
      rows.push({
        id: company.id,
        name: company.name,
        home: host.id,
        homeName: host.name,
        sector: company.sector,
        sectorName: SECTORS[company.sector].short,
        value: company.value,
        profit: company.capitalReturn,
        profitAvg: company.profitAvg,
        dividend: company.dividend,
        dividendYield: company.value > 0 ? (company.dividend * 52) / company.value : 0,
        foreign,
        stake,
        employees: company.employees,
        trend: trendOf(company),
        defunct: Boolean(company.defunct),
        failing: (company.failingWeeks ?? 0) > 26,
        domestic: host.id === viewer.id,
        atWar: host.id !== viewer.id && atWar(world, host.id, viewer.id),
        frozen: Boolean(company.frozen) && stake > 0,
        cap: foreignOwnershipCap(host, company.sector),
        room: purchasableShare(world, viewer, company),
        goods: Object.keys(company.outputs).filter((id) => company.outputs[id] > 0),
      });
    }
  }
  return rows;
}

/** Tek sirketin dosyasi: "ne sahibim, ne uretiyor, kim sahip, ne odiyor". */
export function companyDossier(world, viewer, companyId) {
  const company = findCompany(world, companyId);
  if (!company) return null;
  const host = world.nations[company.home];
  const stake = stakeOf(company, viewer.id);
  const foreign = foreignShare(company);
  const holders = Object.keys(company.owners).map(Number)
    .filter((id) => company.owners[id] > 0)
    .sort((a, b) => (company.owners[b] - company.owners[a]) || (a - b))
    .map((id) => ({
      id,
      name: world.nations[id]?.name ?? '?',
      share: company.owners[id],
      you: id === viewer.id,
      frozen: id !== company.home && atWar(world, id, company.home),
    }));
  const outputs = Object.keys(company.outputs)
    .filter((id) => company.outputs[id] > 0)
    .sort((a, b) => company.outputs[b] - company.outputs[a])
    .map((id) => ({
      id,
      qty: company.outputs[id],
      value: company.outputs[id] * priceOf(world, id),
      access: viewer.economy?.priorityAccess?.[id] ?? 0,
    }));
  return {
    id: company.id,
    name: company.name,
    home: company.home,
    homeName: host?.name ?? '?',
    sector: company.sector,
    sectorName: SECTORS[company.sector].name,
    founded: company.founded,
    value: company.value,
    cash: company.cash,
    book: company.book,
    revenue: company.revenue,
    grossProfit: company.grossProfit,
    profit: company.capitalReturn,
    profitAvg: company.profitAvg,
    margin: company.revenue > 0 ? company.capitalReturn / company.revenue : 0,
    dividend: company.dividend,
    dividendYield: company.value > 0 ? (company.dividend * 52) / company.value : 0,
    yourDividend: company.dividend * stake,
    employees: company.employees,
    levels: company.levels,
    trend: trendOf(company),
    history: [...(company.history ?? [])],
    stake,
    foreign,
    domesticHolders: domesticShare(company),
    cap: foreignOwnershipCap(host, company.sector),
    openness: opennessOf(host),
    float: freeFloat(company),
    room: purchasableShare(world, viewer, company),
    unitPrice: sharePrice(company, 0.01) * (1 + SPREAD),
    // Hazine ekrana GELIR: "neden alamiyorum" sorusunun cevabi dugmenin
    // yaninda dursun (BUG-015: sebebi yazilmayan kapali dugme).
    treasury: viewer.gold ?? 0,
    sellerPool: host?.politics?.privateCapital ?? 0,
    holders,
    outputs,
    sites: companySites(world, host, company),
    threat: inputThreatOf(host, company),
    lastInvestment: company.lastInvestment,
    lastSeizure: company.lastSeizure,
    defunct: Boolean(company.defunct),
    failingWeeks: company.failingWeeks ?? 0,
    atWar: company.home !== viewer.id && atWar(world, company.home, viewer.id),
    frozen: Boolean(company.frozen),
    isHome: company.home === viewer.id,
    seizable: company.home === viewer.id && foreign > 0.001,
    distrust: host?.economy?.investmentDistrust ?? 0,
  };
}

/**
 * Ulke panelinin sikistirilmis maliye blogu. Uc soru: bu ulke disarida neye
 * sahip, sanayisinin ne kadari yabanciya ait, en buyuk sirketleri kim.
 */
export function financeProfile(world, nation) {
  const abroad = portfolioOf(world, nation);
  const presence = foreignPresenceOf(nation);
  const largest = [...companiesOf(nation)]
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)
    .map((c) => ({ id: c.id, name: c.name, value: c.value, foreign: foreignShare(c) }));
  const investors = new Map();
  for (const company of companiesOf(nation)) {
    for (const key in company.owners) {
      const id = Number(key);
      if (id === nation.id) continue;
      investors.set(id, (investors.get(id) ?? 0) + sharePrice(company, company.owners[key]));
    }
  }
  const topInvestors = [...investors.entries()]
    .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))
    .slice(0, 3)
    .map(([id, value]) => ({ id, name: world.nations[id]?.name ?? '?', value }));
  return { abroad, presence, largest, topInvestors, openness: opennessOf(nation) };
}
