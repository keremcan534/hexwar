// EKONOMİ — haftalık kapanışın orkestrasyonu.
//
// Bu dosya artık ekonominin *kendisi* değil, sırasıdır. Beş alan kendi
// modülünde durur ve birbirini yalnız küçük, açık çıktılardan tanır:
//
//   econ/content.js   mal, tarif, sınıf, sepet, program, teçhizat  (veri)
//   econ/pop.js       nüfus, işgücü, istihdam, hane talebi, sınıf
//   econ/market.js    arz/talep havuzu (kaynaklarıyla), fiyat
//   econ/trade.js     fazla/açık eşleşmesi, gümrük, dış kapanış
//   econ/industry.js  fabrika üretimi, kadro, ücret, kâr
//   econ/budget.js    hazinenin TEK yazarı ve TEK kapanışı
//
// Burada kalanlar: kuruluş, fabrika inşası, özel sektör, mali YZ, askerî
// tedarik, borç ve haftalık faz sırası. Ekonomik gerçeğin kendisi değil,
// oyunun bu gerçeğe bağlanan kararları.
//
// HAFTALIK FAZ SIRASI (bkz. SIMPLE_CORE_NOTES §2.4):
//   1 nüfus → 2 işgücü → 3 üretim → 4 talep → 5 ticaret → 6 fiyat
//   → 7 tesis kapanışı → 8 bütçe → 9 büyüme (provinces.js) → 10 defter
//
// Tick içi geri besleme yoktur: talep geçen haftanın fiyatını, fabrika geçen
// haftanın girdi bolluğunu okur. Yakınsama çözücüsü yok.

import { canAfford, pay } from './cities.js';
import {
  RGO_TYPES, provinceOutput, provincePopulation, rgoJobsOf,
} from './provinces.js';
import {
  companyById, companyForFactoryType, refreshPriorityAccess, runCompanies,
  runInvestmentAI,
} from './companies.js';
import { delegationActive, noteDelegated } from './delegation.js';
import { atWar } from './diplomacy.js';
import { controllerOf } from './control.js';
import {
  PROGRAMMES, abandonProgramme, adoptProgramme, advanceResearch, ensureResearch,
  nextTechFor, programmeFloorOf, programmeLapsed, programmeOf, refreshDiffusion,
  refreshTechModifiers, scoreProgrammes, startResearch, techById,
  techUnlocksFactory,
} from './technology.js';
import { TIER, announce } from './chronicle.js';
import { treatiesOf } from './peace.js';
import { regimentCount } from './units.js';
import {
  canInvestInFactory, factoryInvestmentRules, fiscalPolicyLimits, policyOf,
  rulingParty,
} from './politics.js';
import {
  NATIONAL_INVESTMENTS, PROJECT_KIND, constructionAtlas, constructionPower,
  constructionUpkeep, dropInvestmentLevel, ensureConstruction, fundProject,
  higherEducationBonus, investmentLevel, planConstructionAI, queueIndustryProject,
} from './construction.js';
import {
  decayReformCounters, refreshReformModifiers, reformModifiers, reformMoodShift,
} from './reforms.js';

// --- BASİT ÇEKİRDEK ---------------------------------------------------------
import {
  CLASS_INFO, CLASS_NEEDS, CLASS_PROFESSIONS, DEFAULT_SOCIAL, DEFAULT_TAXES,
  FACTORIES, FOOD_GOODS, GOODS, GOOD_IDS, MAX_FACTORY_LEVEL, MILITARY_EQUIPMENT,
  MILITARY_EQUIPMENT_IDS, POPULATION_COHORT, PROFESSION_INFO, PROFESSION_SHARES,
  SOCIAL_PROGRAMS, WORKERS_PER_LEVEL, needAmount,
} from './econ/content.js';
import {
  PRICE_HISTORY, addDemand, addSupply, ensureFlows, ensureMarket, initMarket,
  inputAvailability, priceExplain, priceOf, resetMarketFlows, resetNationFlows,
  retain, updatePrices,
} from './econ/market.js';
import {
  CLASS_IDS, INCOME_POOL_SHARE, INCOME_WEIGHTS, PROFIT_TO_CAPITAL, WAGE_SPLIT,
  WORKFORCE_RATE, distributeIncome, ensurePopulation, enforceWorkforceCap,
  LABOR_SHARE, costOfLivingOf, hiringHeadroom, householdBreakdown, householdDemand,
  industrialEmployedOf,
  professionCountsOf, runClassMobility, setPopulation, updateEmployment,
  updateStability,
} from './econ/pop.js';
import {
  EXPANSION_FILL_FLOOR, HIRING_INTERVAL, ensureProductionLine, expectedMargin,
  factoryAtCapacity, factoryBreakdown, factoryJobs, factoryMargin, factoryOutputs,
  factoryVacancies, industrialJobs, laborFill, runFactories, runHiring,
} from './econ/industry.js';
import {
  EXPORT_RETALIATION, EXTERNAL_SETTLEMENT, IMPORT_ELASTICITY, ensureTradeSummary,
  settleGlobalTrade, tradeBreakdown,
} from './econ/trade.js';
import {
  borrow, closeTreasury, declareDefault, earn, ensureBook, ledgerBreakdown,
  refund, repay, spend,
} from './econ/budget.js';

// Oyunun geri kalanı ekonomiyi TEK kapıdan tanır: bu dosya. Alanlar
// bölündü ama dışarıdaki 17 modülün import satırı değişmedi.
export {
  CLASS_INFO, CLASS_NEEDS, CLASS_PROFESSIONS, FACTORIES, FOOD_GOODS, GOODS, GOOD_IDS,
  MAX_FACTORY_LEVEL, MILITARY_EQUIPMENT, MILITARY_EQUIPMENT_IDS, POPULATION_COHORT,
  PROFESSION_INFO, PROFESSION_SHARES, SOCIAL_PROGRAMS, WORKERS_PER_LEVEL, needAmount,
  PRICE_HISTORY, initMarket, priceOf, priceExplain,
  CLASS_IDS, INCOME_POOL_SHARE, INCOME_WEIGHTS, PROFIT_TO_CAPITAL, WAGE_SPLIT,
  WORKFORCE_RATE, LABOR_SHARE, householdBreakdown, professionCountsOf, costOfLivingOf,
  ensureProductionLine, expectedMargin, factoryAtCapacity, factoryBreakdown,
  factoryJobs, factoryMargin, factoryVacancies, industrialJobs, laborFill,
  EXPORT_RETALIATION, EXTERNAL_SETTLEMENT, IMPORT_ELASTICITY, settleGlobalTrade,
  tradeBreakdown, ledgerBreakdown, earn, spend, refund,
  setPopulation, ensurePopulation, updateEmployment, industrialEmployedOf,
  distributeIncome, updateStability, runClassMobility,
};

/**
 * Sanayi kârının yeniden yatırıma giden payı (politics.collectPrivateCapital
 * okur). Kârın kalanı beyan edilmiş bir giderdir — kaynak yaratılmaz.
 */
export const PROFIT_TO_REINVEST = 0.08;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Eksik alanı yerinde doldurur (eski kayıt göçü). */
function fillMissing(target, defaults) {
  for (const key in defaults) {
    if (!(key in target)) target[key] = defaults[key];
  }
  return target;
}


/* ==========================================================================
   ASKERÎ EKONOMİ — stok, üretim hattı, ortalamalar
   ========================================================================== */

/**
 * Baslangic degerleri tablodan turetilir. Elle yazilmis liste yeni bir ekipman
 * ailesi eklenince eksik kalir ve stok NaN'a doner.
 */
const DEFAULT_MILITARY = {
  reinforcementDemand: 0,
  manpowerDemand: 0,
  reinforced: 0,
  manpowerUsed: 0,
  // Ordu ihtiyacının karşılanma endeksi (EMA). 1 = tam ikmal.
  supplyIndex: 1,
  ...Object.fromEntries(MILITARY_EQUIPMENT_IDS.flatMap((id) => [
    [id, MILITARY_EQUIPMENT[id].defaultStock],
    [`${id}Produced`, 0],
    [`${id}Imported`, 0],
    [`${id}ProducedAverage`, 0],
    [`${id}ImportedAverage`, 0],
    [`${id}SupplyAverage`, 0],
    [`${id}AverageSamples`, 0],
    [`${id}Demand`, 0],
    [`${id}Used`, 0],
  ])),
};
/**
 * Anahtar listesi bir kez cikarilir: ensureMilitaryEconomy her stok
 * okumasinda cagrilir ve Object.entries burada tek basina haftada ~10 MB
 * gecici dizi uretiyordu (olculdu, bkz. alloc-audit).
 */
const DEFAULT_MILITARY_KEYS = Object.keys(DEFAULT_MILITARY);

/**
 * Ekipman basina alan adlari (`armsProduced` gibi) bir kez uretilir. Sicak
 * dongulerde her erisimde sablon dizgi kurmak haftada yuz binlerce kisa
 * omurlu string demekti; tablo hem burada hem reinforcement.js'te okunur.
 */
export const MILITARY_FIELD = Object.fromEntries(MILITARY_EQUIPMENT_IDS.map((id) => [id, {
  produced: `${id}Produced`,
  imported: `${id}Imported`,
  producedAverage: `${id}ProducedAverage`,
  importedAverage: `${id}ImportedAverage`,
  supplyAverage: `${id}SupplyAverage`,
  averageSamples: `${id}AverageSamples`,
  demand: `${id}Demand`,
  used: `${id}Used`,
}]));
export function ensureMilitaryEconomy(nation) {
  const military = nation.economy.military ?? (nation.economy.military = {});
  // Indeksli dongu bilerek: bu fonksiyon her stok okumasinda kosar ve for-of
  // yineleyicisi bu kadar sicak bir yerde kacis analizinden kacabiliyor.
  for (let i = 0; i < DEFAULT_MILITARY_KEYS.length; i++) {
    const key = DEFAULT_MILITARY_KEYS[i];
    if (!Number.isFinite(military[key])) military[key] = DEFAULT_MILITARY[key];
  }
  for (let i = 0; i < MILITARY_EQUIPMENT_IDS.length; i++) {
    const id = MILITARY_EQUIPMENT_IDS[i];
    const clamped = Math.max(0, Math.min(MILITARY_EQUIPMENT[id].stockCap, military[id]));
    // Yalniz gercekten kirpilan deger yazilir: degismeyen ondalik degeri her
    // okumada geri yazmak V8'de yeni HeapNumber kutusu demekti (olculdu).
    if (clamped !== military[id]) military[id] = clamped;
  }
  return military;
}

export function workshopArmsOutput(nation) {
  return 0.08 * (0.5 + (nation.economy.militaryProcurement ?? 100) / 200);
}

export function equipmentStock(nation, equipmentId) {
  // Sicak okuma yolu: her stok okumasinda ensureMilitaryEconomy kosturmak,
  // 77 alanlik dogrulama dongusunun megamorfik double okumalari yuzunden
  // olculebilir HeapNumber copu uretiyordu. Deger gecerliyse ayni kirpma
  // dogrudan uygulanir (ensure da tam bunu depolayip donduruyordu); bozuk/
  // eksik degerde tam dogrulama kosar.
  const type = MILITARY_EQUIPMENT[equipmentId];
  const stock = nation.economy.military?.[equipmentId];
  if (type && Number.isFinite(stock)) return Math.max(0, Math.min(type.stockCap, stock));
  return Math.max(0, ensureMilitaryEconomy(nation)[equipmentId] ?? 0);
}

export function setEquipmentStock(nation, equipmentId, value) {
  if (!MILITARY_EQUIPMENT[equipmentId]) return false;
  // Yazim yolunda da tam dogrulama yalniz askeri kayit hic yokken gerekir;
  // alan bazli tutarliligi haftalik ensureEconomy zaten sagliyor.
  const military = nation.economy.military ?? ensureMilitaryEconomy(nation);
  military[equipmentId] = Math.max(0, Math.min(
    MILITARY_EQUIPMENT[equipmentId].stockCap,
    value,
  ));
  return true;
}
export function setMilitaryProductionLine(game, nation, factoryId, equipmentId) {
  if (!MILITARY_EQUIPMENT[equipmentId]) return false;
  const factory = nation.economy.factories.find((candidate) => candidate.id === factoryId);
  if (!ensureProductionLine(factory) || factory.lineEquipment === equipmentId) return false;
  factory.lineEquipment = equipmentId;
  factory.lineEfficiency = 0.5;
  factory.lineOutput = 0;
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`Production line switched to ${MILITARY_EQUIPMENT[equipmentId].name}.`,
      { kind: 'INDUSTRY' });
  }
  game.emit('economy', nation.economy);
  return true;
}

function updateMilitaryAverages(nation) {
  const military = ensureMilitaryEconomy(nation);
  for (const id of MILITARY_EQUIPMENT_IDS) {
    const field = MILITARY_FIELD[id];
    const sampled = military[field.averageSamples] > 0;
    const blend = (previous, current) => (sampled
      ? previous * 0.75 + current * 0.25
      : current);
    military[field.producedAverage] = blend(
      military[field.producedAverage],
      military[field.produced],
    );
    military[field.importedAverage] = blend(
      military[field.importedAverage],
      military[field.imported],
    );
    military[field.supplyAverage] = military[field.producedAverage]
      + military[field.importedAverage];
    military[field.averageSamples]++;
  }
}
/* ==========================================================================
   KURULUŞ VE KAYIT GÖÇÜ
   ========================================================================== */

export function populationOf(world, nation) {
  return provincePopulation(world, nation.id);
}

export function initNationEconomy(world, nation) {
  const population = populationOf(world, nation);
  nation.economy = {
    population,
    classes: {},
    classShares: Object.fromEntries(
      Object.entries(CLASS_INFO).map(([id, info]) => [id, info.share]),
    ),
    taxes: { ...DEFAULT_TAXES },
    social: { ...DEFAULT_SOCIAL },
    socialCost: 0,
    tariff: 10,
    // Ordu bütçesi iki ayrı karardır: maaş (muharebe gücü, moral, toparlanma)
    // ve tedarik (devletin piyasadan fiilen satın aldığı mühimmat/yakıt).
    militaryWages: 100,
    militaryProcurement: 100,
    // Yönetim bütçesi: vergi tahsilat verimi ve province kontrol desteği.
    adminFunding: 100,
    military: { ...DEFAULT_MILITARY },
    factories: [],
    goodsFlow: {},
    gdp: 0,
    taxRevenue: 0,
    factoryProfit: 0,
    wagesPaid: 0,
    standardOfLiving: 10,
    stability: 0.62,
  };
  ensurePopulation(nation, population);
  ensureFlows(nation);
  ensureTradeSummary(nation);
  ensureBook(nation);
  closeTreasury(nation, 0);
  return nation.economy;
}

/**
 * Kuruluş sanayisi. 1836'da hiç fabrika olmayınca nüfusun istediği bütün
 * üretim malları sıfır arzla açılıyor ve fiyatları ilk yirmi haftada tavana
 * yapışıyordu. Her ülke bu yüzden temel tüketim zincirini kuran küçük bir
 * çekirdekle başlar.
 */
const STARTING_INDUSTRY = ['ARMS_FACTORY', 'CANNERY', 'TEXTILE_MILL', 'LUMBER_MILL', 'FABRIC_MILL'];

function ensureInitialMilitaryIndustry(world, nation) {
  const economy = nation.economy;
  if (!nation.alive || economy.factories?.length) return;
  const city = world.cities.find((candidate) => candidate.nationId === nation.id);
  if (!city) return;
  for (const typeId of STARTING_INDUSTRY) {
    economy.factories.push({
      id: `${nation.id}-${city.id}-initial-${typeId}`,
      typeId,
      q: city.tile.q,
      r: city.tile.r,
      level: 1,
      // Kuruluş tesisleri yarı kadro başlar: ilk yıllarda üretim var ama az.
      employees: WORKERS_PER_LEVEL * 0.5,
      profit: 0,
      margin: 0,
      throughput: 0,
      fundedBy: 'state',
      ...(typeId === 'ARMS_FACTORY' ? {
        lineEquipment: 'arms', lineEfficiency: 0.5, lineOutput: 0,
      } : {}),
    });
  }
  // Kuruluş kadrosu işgücü tavanını aşamaz: eski modelde bu kadro meslek
  // sayacına hiç sorulmuyordu ve çift sayım 1. haftada başlıyordu.
  enforceWorkforceCap(nation);
}

/**
 * Eski kayıtlar fabrikayı şehre bağlıyordu (cityId). Kare çapasına taşı;
 * şehir kaybolmuşsa ülkenin herhangi bir karesine tuttur.
 */
function ensureFactoryAnchor(world, nation, factory) {
  if (!Number.isFinite(factory.q) || !Number.isFinite(factory.r)) {
    const city = world.cities.find((candidate) => candidate.id === factory.cityId);
    const tile = city?.tile
      ?? world.tiles.find((candidate) => candidate.owner === nation.id
        && candidate.terrain.passable);
    if (!tile) return null;
    factory.q = tile.q;
    factory.r = tile.r;
    delete factory.cityId;
  }
  factory.level = clamp(Math.round(factory.level ?? 1), 1, MAX_FACTORY_LEVEL);
  factory.employees = clamp(factory.employees ?? 0, 0, factoryJobs(factory));
  return factory;
}

export function initEconomy(world) {
  initMarket(world);
  for (const nation of world.nations) {
    initNationEconomy(world, nation);
    ensureInitialMilitaryIndustry(world, nation);
  }
}

/**
 * Kayıt göçü. Basit çekirdeğe geçişte düşen alanlar: `professionCounts`,
 * `cohortPopulation`, `mobility` sayaçları, sınıf `savings`/`hardshipWeeks`,
 * `industrialCommuters`, `inventory`. Hepsi artık türetiliyor.
 */
const LEGACY_ECONOMY_FIELDS = [
  'professionCounts', 'cohortPopulation', 'inventory', 'fiscalNet',
  'outlayGold', 'procurementGold', 'subsidyGold', 'projectGold', 'dividendGold',
  'shareCostGold', 'shareSaleGold', 'borrowedGold', 'repaidGold', 'defaultedGold',
];
const LEGACY_CLASS_FIELDS = [
  'savings', 'savingsDrawn', 'hardshipWeeks', 'prosperityWeeks',
  'needsAvailable', 'needsSpent', 'canAffordNeeds',
];

export function ensureEconomy(world) {
  ensureMarket(world);
  for (const nation of world.nations) {
    if (!nation.economy) {
      initNationEconomy(world, nation);
    } else {
      const economy = nation.economy;
      fillMissing(economy.social ??= {}, DEFAULT_SOCIAL);
      fillMissing(economy.taxes ??= {}, DEFAULT_TAXES);
      // Eski kayıt: tek armySpending kaydırağı iki yeni kaydırağa açılır.
      economy.militaryWages ??= economy.armySpending ?? 100;
      economy.militaryProcurement ??= economy.armySpending ?? 100;
      economy.adminFunding ??= 100;
      economy.tariff ??= 10;
      economy.factories ??= [];
      for (const key of LEGACY_ECONOMY_FIELDS) delete economy[key];
      for (const classId of CLASS_IDS) {
        const socialClass = economy.classes?.[classId];
        if (socialClass) for (const key of LEGACY_CLASS_FIELDS) delete socialClass[key];
      }
      ensurePopulation(nation, populationOf(world, nation));
      ensureFlows(nation);
      ensureTradeSummary(nation);
      ensureBook(nation);
      economy.ledger ??= {};
    }
    ensureMilitaryEconomy(nation);
    ensureInitialMilitaryIndustry(world, nation);
    // Tanınmayan tür kayıttan düşer; çapası kurulamayan fabrika silinmez.
    if (nation.economy.factories.some((factory) => !FACTORIES[factory.typeId])) {
      nation.economy.factories = nation.economy.factories
        .filter((factory) => FACTORIES[factory.typeId]);
    }
    for (const factory of nation.economy.factories) {
      ensureFactoryAnchor(world, nation, factory);
      ensureProductionLine(factory);
    }
  }
}


/* ==========================================================================
   POLİTİKA KALDIRAÇLARI
   ========================================================================== */

/**
 * Vergi tahsilat verimi: yönetim bütçesinin görünür sonucu. %100 fonlama tam
 * tahsilat, taban %30 fonlama ~%68 verir. Bütçe ekranı bu sayıyı gösterir.
 */
export function taxEfficiency(nation) {
  const funding = clamp((nation.economy?.adminFunding ?? 100) / 100, 0.3, 1);
  return 0.55 + 0.45 * funding;
}

/** Sosyal programın 0–1 aralığındaki etkin seviyesi. */
export function socialLevel(nation, programId) {
  return clamp((nation?.economy?.social?.[programId] ?? 0) / 100, 0, 1);
}
/**
 * YAKIT DUZELTMESI — A/B bayragi.
 *
 * Olculdu (audit:research, A kolu): 1860'tan sonra ulkelerin %60-85'i egitim
 * harcamasinda SIFIRDA kaliyor, egitim IQR'i alti onyil-tohumda tam sifira
 * yozlasiyor ve 1900 medyan okuryazarligi %8.5-10.7'ye iniyor. Okuryazarlik
 * arastirma puaninin ana terimi oldugu icin (technology.js `researchPointsOf`)
 * bu, teknolojinin yakit deposunun kurumasi demek: hicbir YZ teknoloji lideri
 * olamiyor.
 *
 * Bayrak, A/B'nin TEK farki olsun diye var (`audit:research --no-fuel-fix`).
 */
// Tarayicida `process` YOKTUR — dogrudan process.env okumak butun oyunu
// acilista dusuruyordu (Chromium smoke yakaladi; bassiz denetim yakalayamaz).
export const FUEL_FIX = typeof process === 'undefined'
  || process.env?.HEXWAR_NO_FUEL_FIX !== '1';

/**
 * Bir sosyal programin ALT SINIRI.
 *
 * Fikir: `educationFloor` bugun bir GIRIS kapisi (universite acmak icin
 * egitim butcesi sarti, construction.js `investmentBlocker`). Ayni esigi
 * CIKIS kapisi da yapiyoruz — satin alinan kurum yapiskanlasir. Boylece
 * taban DUZ degil, ulkenin kendi yatirim gecmisine gore FARKLILASIR.
 *
 * Duz taban yanlis cozumdu ve olculdu: %70'lik duz taban okuryazarligi
 * ikiye katliyor ama teknolojik yayilimi 6'dan 3'e, farkli teknoloji kumesi
 * sayisini 7'den 4'e cokertiyor — yakiti tektiplestirmek sonucu
 * tektiplestiriyor.
 *
 * Kredi cezasi altindaki devlet muaftir: geri kalan DUSEBILMELI, yoksa
 * "teknoloji lideri olmak" risksiz bir bahis olur.
 */
export function socialFloorOf(nation, programId) {
  if (!FUEL_FIX || programId !== 'education') return 0;
  if ((nation?.economy?.creditPenalty ?? 0) > 0.05) return 0;
  const floors = NATIONAL_INVESTMENTS.HIGHER_EDUCATION?.educationFloor;
  let floor = 0;
  if (floors?.length) {
    const level = investmentLevel(nation, 'HIGHER_EDUCATION');
    floor = floors[Math.min(Math.max(0, level), floors.length - 1)] ?? 0;
  }
  // IKINCI KAYNAK — ulusal program taahhudu. Ilk olcum tek kaynagin (kurum)
  // yetmedigini gosterdi: HE seviyesi 0 olan ulkenin tabani da 0'di ve HE'ye
  // girmek %25 egitim istedigi icin erken coken ulke KALICI kilitleniyordu.
  // Program tabani bu kısır donguyu kirar: taahhut eden ulke egitimi acar,
  // acilan egitim HE kapisini acar. Programsiz ulke yine cokebilir — bu
  // "ara sira basarisiz devlet" tasarim geregi korunur.
  return Math.max(floor, programmeFloorOf(nation));
}

/**
 * YZ program degerlendirmesinin baglami. scoreProgrammes SAF kalir
 * (technology.js economy'yi import edemez); butun okumalar burada.
 */
export function programmeContext(world, nation) {
  const economy = nation.economy;
  const income = Math.max(1, economy.ledger?.income ?? 0);
  const scale = (economy.population ?? 0) / 10000;
  const eduRate = SOCIAL_PROGRAMS.education?.rate ?? 0.34;
  let hasNavy = false;
  for (const unit of world.units ?? []) {
    if (unit.nationId === nation.id && unit.regiments?.some((r) => r.typeId === 'WARSHIP')) {
      hasNavy = true;
      break;
    }
  }
  const party = rulingParty(nation);
  const ideology = party?.ideology ?? '';
  const military = policyOf(nation, 'military');
  return {
    income,
    // Taban F'nin HAFTALIK bedeli. socialLevel 0..1 dondurur (kaydirac/100);
    // rate "10.000 kisi basina, %100 seviyede haftalik" tanimlidir.
    floorCost: (floor) => scale * (floor / 100) * eduRate,
    debtLoad: (nation.debt ?? 0) / Math.max(1, debtCapacity(nation)),
    atWar: economy.atWarCache ?? false,
    warStrain: clamp(economy.warStrain ?? 0, 0, 1),
    militarist: military === 'jingoism' || military === 'pro_military',
    pacifist: military === 'pacifism' || military === 'anti_military',
    constructionStrained: nation.gold > 900 && (economy.ledger?.net ?? 0) > 0,
    shortSteel: (economy.goodsFlow?.steel?.shortage ?? 0) > 0,
    shortMachine: (economy.goodsFlow?.tools?.shortage ?? 0) > 0,
    stability: economy.stability ?? 0.5,
    hasNavy,
    freeTrade: policyOf(nation, 'trade') === 'free_trade',
    literacy: economy.literacy ?? 0,
    rich: nation.gold > 500,
    progressive: ideology === 'liberal' || ideology === 'socialist',
  };
}

export function socialSpendingCost(nation) {
  const economy = nation?.economy;
  if (!economy) return 0;
  const scale = economy.population / 10000;
  let total = 0;
  for (const program of Object.values(SOCIAL_PROGRAMS)) {
    total += scale * socialLevel(nation, program.id) * program.rate;
  }
  // Yasayla verilen hak kaydıraçtan ayrıdır ve kısılamaz.
  return total + scale * reformModifiers(nation).socialBurden;
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
  if (key === 'militaryWages' || key === 'militaryProcurement') {
    const limits = fiscalPolicyLimits(nation);
    // İki kaydıraç da parti askerî politikasının sınırına tabidir: pasifist
    // hükümet ne maaşı ne tedariki tavana çekebilir.
    nation.economy[key] = clamp(
      Math.round(value), limits.armySpendingMin, limits.armySpendingMax,
    );
    return true;
  }
  if (key === 'adminFunding') {
    // Tabanda %30: devlet aygıtı tamamen kapatılamaz, sadece ihmal edilir.
    nation.economy.adminFunding = clamp(Math.round(value), 30, 100);
    return true;
  }
  if (key === 'armySpending') {
    // Eski anahtar iki yeni kaydıracı birden sürer: tek kaydıraç dönemine
    // yazılmış çağrılar (eski YZ/betikler) davranış kaybetmesin.
    const limits = fiscalPolicyLimits(nation);
    const level = clamp(Math.round(value), limits.armySpendingMin, limits.armySpendingMax);
    nation.economy.armySpending = level;
    nation.economy.militaryWages = level;
    nation.economy.militaryProcurement = level;
    return true;
  }
  if (key === 'social' && SOCIAL_PROGRAMS[classId]) {
    // Taban: satin alinmis yuksekogretim kurumu egitim butcesini bagliyor
    // (bkz. socialFloorOf). Bu yol oyuncuyu VE kriz dalini baglar; haftalik
    // YZ cirti `economy.social`a dogrudan yazdigi icin oraya AYRICA kondu.
    nation.economy.social[classId] = clamp(
      Math.round(value), socialFloorOf(nation, classId), 100,
    );
    return true;
  }
  if (key === 'subsidyPolicy' && SUBSIDY_POLICIES.includes(value)) {
    nation.economy.subsidyPolicy = value;
    return true;
  }
  return false;
}

/**
 * Subvansiyon POLITIKASI: tesisi tek tek isaretleme yerine niyet.
 *
 * Beta olcumu: tesis basina ¤ dugmesi haftalik bir bakim isiydi (isaretle,
 * unut, hazine sessizce akar — YZ'nin kendi temizleyicisi vardi, oyuncunun
 * yoktu). "manual" eski davranistir; "strategic" savas sanayisini savasta
 * korur ve son subvansiyonlari kendi kaldirir; "none" hepsini kapatir.
 * Tekil isaretleme "manual"da aynen durur — anlamli tekil karar korunur.
 */
export const SUBSIDY_POLICIES = ['manual', 'strategic', 'none'];
const STRATEGIC_FACTORY_TYPES = new Set(['ARMS_FACTORY', 'AMMUNITION_FACTORY']);

function applySubsidyPolicy(world, nation) {
  const policy = nation.economy.subsidyPolicy ?? 'manual';
  if (policy === 'manual') return;
  const wartime = world.nations.some(
    (other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id),
  );
  for (const factory of nation.economy.factories ?? []) {
    factory.subsidized = policy === 'strategic'
      && wartime && STRATEGIC_FACTORY_TYPES.has(factory.typeId);
  }
}

/* ==========================================================================
   FABRİKA İNŞASI VE ÖZEL SEKTÖR
   ========================================================================== */

/**
 * Kapitalistin aynı anda yürüttüğü şantiye sayısı. Sınır SERMAYENİN gerçekten
 * aktığı projeleri sayar: parası akmayan proje şantiye değil, niyettir.
 */
const PRIVATE_ACTIVE_LIMIT = 2;
/** Uyuyanlar dâhil kuyruk tavanı: kuyruk da sınırsız büyümemeli. */
const PRIVATE_QUEUE_LIMIT = 6;
/** Bu kadar hafta hiç para akmayan özel proje uykuya geçer. */
const PRIVATE_STALL_WEEKS = 52;


/**
 * Sanayileşme maliyeti kurulu kapasiteyle birlikte artar. Sabit fiyat, bir
 * noktadan sonra ülkenin harcayacak yer bulamamasının asıl sebebiydi; artan
 * maliyet tavana gerek bırakmadan getiriyi kendiliğinden azaltır.
 */
export function factoryCost(nation, typeId) {
  const type = FACTORIES[typeId];
  if (!type) return null;
  const built = nation.economy?.factories?.length ?? 0;
  // Katsayı 0.12'den 0.05'e indi: tesis türü 7'den 29'a çıkınca kurulu sayı da
  // çok arttı ve eski eğim 40. fabrikada maliyeti 5 katına çıkarıp
  // sanayileşmeyi tamamen durduruyordu.
  const scale = 1 + built * 0.05;
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
  if (actor !== 'private') {
    // Devlet fabrika yatırımı bir İNŞAAT kalemidir: `pay` tek seferlik alıma
    // yazardı, burada doğru satıra yazılır (tek yol, aktarım yok).
    if (!canAfford(nation, cost)) return false;
    for (const [resource, amount] of Object.entries(cost)) {
      if (resource === 'gold') spend(nation, 'projectCost', amount);
      else nation[resource] -= amount;
    }
    return true;
  }
  if (!canPayFactoryCost(nation, cost, actor)) return false;
  nation.politics.privateCapital -= cost.gold ?? 0;
  return true;
}
/**
 * Fabrikanın hangi state'te durduğu her seferinde yeniden türetilir. Bölgeler
 * sahip olunan karelerden hesaplandığı için sınır değişince kimlikleri de
 * kayar; saklanan regionId yanıltır, kare çapası (q/r) yanıltmaz.
 * Aynı kalıp construction.js'te de kullanılıyor.
 */
export function factoryAtlas(world, nationId) {
  const atlas = constructionAtlas(world, nationId);
  const regions = new Map();
  for (const factory of world.nations[nationId]?.economy?.factories ?? []) {
    const tile = world.get(factory.q, factory.r);
    const region = tile ? atlas.tileRegions.get(tile) : null;
    if (region) regions.set(factory, region);
  }
  return { atlas, regions };
}

export function factoriesInRegion(world, nationId, regionId) {
  const { regions } = factoryAtlas(world, nationId);
  return [...regions.entries()]
    .filter(([, region]) => region.id === regionId)
    .map(([factory]) => factory);
}

/**
 * "Bu state'te bu türden tesis var mı?" sorusunun O(1) dizini.
 *
 * Neden gerekli: soru bir kez değil, YATIRIM ARAMASI boyunca sorulur — özel
 * sermaye ve YZ her hafta 29 tür × state sayısı kadar aday dener. Her aday
 * `factoriesInRegion` çağırıyordu, o da ülkenin BÜTÜN fabrikaları üzerinde
 * yeni bir Map kurup diziye yayıyordu. Ölçüldü (195 fabrikalı ülke, 11 state):
 * aday başına 0.052 ms × 319 aday = tek ülke için 16.6 ms/hafta; ekonomi
 * fazının %75'i (privateSector 17.2 + econAI 16.5 ms) buradan geliyordu.
 *
 * Dizin ulus başına haftada en fazla bir kez kurulur ve imzası değişene dek
 * (fabrika ya da proje sayısı) yeniden kullanılır.
 */
const industryIndexCache = new WeakMap();

function industryIndex(world, nation) {
  const factories = nation.economy?.factories ?? [];
  const projects = ensureConstruction(nation).projects;
  const atlas = constructionAtlas(world, nation.id);
  const signature = `${atlas.regions.length}:${factories.length}:${projects.length}`;
  let perWorld = industryIndexCache.get(world);
  if (!perWorld) {
    perWorld = new Map();
    industryIndexCache.set(world, perWorld);
  }
  const cached = perWorld.get(nation.id);
  // Atlas kimliği de imzaya girer: sınır değişince bölgeler yeniden kurulur ve
  // eski dizin yanlış state'i işaret eder.
  if (cached && cached.signature === signature && cached.atlas === atlas) return cached.taken;
  const taken = new Set();
  for (const factory of factories) {
    const tile = world.get(factory.q, factory.r);
    const region = tile ? atlas.tileRegions.get(tile) : null;
    if (region) taken.add(`${region.id}|${factory.typeId}`);
  }
  for (const project of projects) {
    if (project.kind !== PROJECT_KIND.FACTORY) continue;
    taken.add(`${project.regionId}|${project.typeId}`);
  }
  perWorld.set(nation.id, { signature, atlas, taken });
  return taken;
}

/** O state'te aynı türde kurulmuş ya da kurulmakta olan tesis var mı. */
/**
 * Bu state'te bu turden tesis (ya da kuyrukta projesi) var mi?
 *
 * DISA ACIK cunku insa menusu de bunu kullanmalidir. Eskiden ekran
 * `factoriesInRegion` (factoryAtlas) ile suzuyor, motor ise burada
 * `constructionAtlas` ile bakiyordu — IKI AYRI ATLAS. Anlasmazlik oldugunda
 * ekran kart gosteriyor, `canBuildFactory` reddediyor ve kart tek kelimeye
 * dusuyordu: "unavailable". Beta'nin "kapitalistler Steel Mill kuruyor ama
 * bana yasak" celiskisi buydu (BUG-015).
 */
export function industryTaken(world, nation, regionId, typeId) {
  return industryIndex(world, nation).has(`${regionId}|${typeId}`);
}

/** Tesis o tur kurulabilir mi? Otomobil fabrikasi 1836'da kurulamaz. */
export function factoryUnlocked(typeId, turn, nation = null) {
  // Takvim UST SINIRDIR, tek belirleyici degil: arastirma tarihi one ceker.
  // Ulke verilmezse eski davranis (saf takvim) korunur — cagri yerlerinin
  // hepsi ayni anda guncellenmek zorunda kalmasin.
  if (nation && techUnlocksFactory(nation, typeId)) return true;
  return (FACTORIES[typeId]?.availableFrom ?? 0) <= turn;
}

export function canBuildFactory(world, nation, regionId, typeId, actor = 'state') {
  const type = FACTORIES[typeId];
  if (!type || !nation?.alive || !nation.economy) return false;
  if (!factoryUnlocked(typeId, world.turn ?? 1, nation)) return false;
  if (!canInvestInFactory(nation, 'build', actor)) return false;
  // Devlet parayı peşin öder; kapitalistler projeyi açıp sermayelerini
  // haftalar içinde akıtır, bu yüzden onlardan peşin tam bedel istenmez.
  if (actor !== 'private' && !canPayFactoryCost(nation, factoryCost(nation, typeId), actor)) {
    return false;
  }
  const region = constructionAtlas(world, nation.id).regions
    .find((candidate) => candidate.id === regionId);
  if (!region) return false;
  // Victoria kuralı: bir state'te aynı türden tek tesis olur. Büyüme yeni bina
  // dikmekle değil, o tesisin seviye atlamasıyla gelir.
  return !industryTaken(world, nation, regionId, typeId);
}
/**
 * Bir altın biriminin kaç hafta-iş ettiği. Fabrika artık anında belirmez:
 * ulusal inşaat gücüyle kurulur, yani Construction Sector yatırımı doğrudan
 * sanayileşme hızına dönüşür. Oran, tipik bir tesisin taban inşaat gücünde
 * (5) yaklaşık 10-20 hafta sürmesi için seçildi.
 */
const WORK_PER_GOLD = 0.22;

export function buildFactory(game, nation, regionId, typeId, options = {}) {
  const actor = options.actor ?? 'state';
  const world = game.world;
  const type = FACTORIES[typeId];
  if (!type || !canBuildFactory(world, nation, regionId, typeId, actor)) return false;
  const region = constructionAtlas(world, nation.id).regions
    .find((candidate) => candidate.id === regionId);
  const cost = factoryCost(nation, typeId);
  // Devlet bedeli peşin yatırır; özel sermaye projeye haftalar içinde akar.
  if (actor !== 'private' && !payFactoryCost(nation, cost, actor)) return false;
  // Ozel yatirimin YUZU: proje bir sirkete yazilir. "Ozel sermaye bir celik
  // fabrikasi kurdu" yerine "Aldemar Steel Union Torford'da celik fabrikasi
  // acti" denebilmesinin tek sebebi bu satirdir.
  const owner = actor === 'private' ? companyForFactoryType(nation, typeId) : null;
  queueIndustryProject(game, nation, {
    kind: PROJECT_KIND.FACTORY,
    typeId,
    regionId,
    companyId: owner?.id ?? null,
    regionName: region.name,
    q: region.center.q,
    r: region.center.r,
    work: Math.max(8, Math.round((cost.gold ?? 0) * WORK_PER_GOLD)),
    cost: cost.gold ?? 0,
    funded: actor === 'private' ? 0 : (cost.gold ?? 0),
    actor,
  });
  if (nation.id === game.turns.playerNation) {
    const by = owner ? ` by ${owner.name}` : actor === 'private' ? ' by private investors' : '';
    game.turns.addLog(`${region.name}: ${type.name} started${by}.`,
      { kind: 'INDUSTRY' });
    game.emit('economy', nation.economy);
  }
  return true;
}

/**
 * Kuyrukta biten fabrika ve seviye projelerini gerçeğe çevirir. Ayrı bir adım
 * olması gerekiyor: construction.js FACTORIES'i tanımaz (katman kuralı).
 */
function commitCompletedProjects(game, nation) {
  const state = ensureConstruction(nation);
  const done = state.completedFactories ?? [];
  if (!done.length) return;
  state.completedFactories = [];
  for (const project of done) {
    if (project.kind === PROJECT_KIND.UPGRADE) {
      const factory = nation.economy.factories.find(
        (candidate) => candidate.id === project.factoryId,
      );
      if (!factory || factory.level >= MAX_FACTORY_LEVEL) continue;
      factory.level++;
      factory.fundedBy = project.actor;
      factory.lastUpgrade = game.world.turn;
      if (nation.id === game.turns.playerNation) {
        const owner = companyById(nation, project.companyId);
        game.turns.addLog(owner
          ? `${owner.name} expanded its ${FACTORIES[factory.typeId].name} to level ${factory.level}.`
          : `${FACTORIES[factory.typeId].name} reached level ${factory.level}.`,
        { kind: 'INDUSTRY' });
      }
      continue;
    }
    if (!FACTORIES[project.typeId]) continue;
    nation.economy.factories.push({
      id: `${nation.id}-${project.q}:${project.r}-${project.id}`,
      typeId: project.typeId,
      q: project.q,
      r: project.r,
      level: 1,
      employees: 0,
      profit: 0,
      margin: 0,
      throughput: 0,
      fundedBy: project.actor,
      ...(project.typeId === 'ARMS_FACTORY' ? {
        lineEquipment: 'arms', lineEfficiency: 0.5, lineOutput: 0,
      } : {}),
    });
    if (nation.id === game.turns.playerNation) {
      // Ozel yatirimin sahibi varsa haber onun adiyla verilir.
      const owner = companyById(nation, project.companyId);
      game.turns.addLog(owner
        ? `${owner.name} opened a ${FACTORIES[project.typeId].name} in ${project.regionName}.`
        : `${FACTORIES[project.typeId].name} opened in ${project.regionName}.`,
      { kind: 'INDUSTRY' });
    }
  }
}

/**
 * Seviye atlamak elle yapılan bir alım değildir: tesis kadrosunu doldurunca
 * kendi kendine büyür (bkz. autoUpgradeFactory). Bu fonksiyon yalnız ekranda
 * "bir sonraki seviye ne zaman, kimin parasıyla" bilgisini üretir.
 */
export function upgradeOutlook(nation, factory) {
  if (!factory) return null;
  const rules = factoryInvestmentRules(nation);
  const cost = expansionCost(factory);
  const payers = [
    rules.privateExpand ? 'private' : null,
    rules.stateExpand ? 'state' : null,
  ].filter(Boolean);
  const funded = payers.find((actor) => canPayFactoryCost(nation, cost, actor)) ?? null;
  return {
    cost,
    payers,
    funded,
    maxed: factory.level >= MAX_FACTORY_LEVEL,
    ready: factoryAtCapacity(factory),
    profitable: factory.profit > 0,
  };
}
/**
 * Tavana dayanan kârlı tesis kendini büyütür. Parayı kimin verdiğini ekonomi
 * politikası belirler: planlı ekonomide hazine, laissez-faire'de kapitalistler,
 * ikisinin de serbest olduğu düzende önce özel sermaye. Kasa yetmiyorsa tesis
 * tavanda bekler — sanayileşmenin gerçek freni budur.
 */
function autoUpgradeFactory(game, nation, factory) {
  if (factory.level >= MAX_FACTORY_LEVEL || !factoryAtCapacity(factory)) return false;
  // Zarar eden tesise kimse sermaye koymaz.
  if (factory.profit <= 0) return false;
  // Yeni tesise koyulan işgücü kapısı seviye atlamada da geçerli: tek tesisin
  // dolu olması ülkenin kadro bulabileceği anlamına gelmez. Bu kapı yokken
  // dolu fabrikalar büyüyüp ulusal doluluğu seyreltiyordu (ölçüldü: 15. yılda
  // %58.7'ye çıkan doluluk 40. yılda %38.9'a geriliyordu).
  if (laborFill(nation) < EXPANSION_FILL_FLOOR) return false;
  const state = ensureConstruction(nation);
  if (state.projects.some((project) => project.kind === PROJECT_KIND.UPGRADE
    && project.factoryId === factory.id)) return false;
  const rules = factoryInvestmentRules(nation);
  const cost = expansionCost(factory);
  // Özel sermaye bedeli peşin bulmak zorunda değil: projeyi açar, kasası
  // doldukça akıtır. Devlet ise peşin öder, ödeyemiyorsa proje açılmaz.
  const actor = rules.privateExpand ? 'private' : rules.stateExpand ? 'state' : null;
  if (!actor) return false;
  // Kuyruk tavanı yükseltmeler için de geçerli: tavana dayanmış her tesis
  // kuyruğa bir yükseltme koyarsa kuyruk sınırsız büyür ve sermaye dağılır.
  if (actor === 'private' && state.projects.filter(
    (project) => project.actor === 'private',
  ).length >= PRIVATE_QUEUE_LIMIT) return false;
  if (actor === 'state' && !payFactoryCost(nation, cost, 'state')) return false;
  queueIndustryProject(game, nation, {
    kind: PROJECT_KIND.UPGRADE,
    typeId: factory.typeId,
    factoryId: factory.id,
    companyId: actor === 'private' ? companyForFactoryType(nation, factory.typeId)?.id ?? null : null,
    regionName: FACTORIES[factory.typeId].name,
    q: factory.q,
    r: factory.r,
    work: Math.max(6, Math.round((cost.gold ?? 0) * WORK_PER_GOLD * 0.8)),
    cost: cost.gold ?? 0,
    funded: actor === 'private' ? 0 : (cost.gold ?? 0),
    actor,
  });
  return true;
}

/**
 * Kapitalistler açtıkları projelere her hafta ellerindeki sermayeyi akıtır.
 * Para bitince proje durur ve oyuncunun desteğini bekler (bkz. supportProject).
 *
 * Sıra KUYRUK sırası değil, BİTMEYE KALAN sırasıdır. Kuyruk sırasıyla dağıtan
 * eski sürümde baştaki pahalı yükseltme (kalan ¤218, haftalık sermaye ~¤0.17)
 * arkasındaki her projeyi aç bırakıyordu: kör betada oyuncunun sanayisi 20.
 * yıldan 80. yıla kadar 7 tesiste dondu. Ucuzu önce bitirmek her hafta bir
 * şeyin BİTMESİNİ garanti eder; toplam harcanan sermaye aynıdır.
 */
function fundPrivateProjects(nation, turn) {
  const state = ensureConstruction(nation);
  const open = state.projects
    .filter((project) => project.actor === 'private' && project.funded < project.cost)
    .sort((a, b) => (a.cost - a.funded) - (b.cost - b.funded) || a.id - b.id);
  for (const project of open) {
    // ONCE SIRKET KASASI. Karli sirket kendi santiyesini kendi parasiyla
    // yurutur; ulusal havuz onun icin beklemez. Bu ikinci bir sermaye
    // ekonomisi degildir: kasadaki para zaten havuza gitmeyen yeniden-yatirim
    // payidir (bkz. companies.runCompanies ve politics.collectPrivateCapital).
    const company = companyById(nation, project.companyId);
    if (company && company.cash > 0) {
      const own = fundProject(project, company.cash);
      if (own > 0) {
        company.cash -= own;
        project.fundedTurn = turn;
        project.dormant = false;
      }
    }
    if (project.funded >= project.cost) continue;
    const available = Math.max(0, nation.politics?.privateCapital ?? 0);
    if (available <= 0) continue;
    const paid = fundProject(project, available);
    if (paid <= 0) continue;
    nation.politics.privateCapital -= paid;
    project.fundedTurn = turn;
    project.dormant = false;
  }
  // Uyuyan proje kuyrukta kalır (oyuncu supportProject ile uyandırabilir) ama
  // şantiye sayılmaz: parası akmayan proje "açık şantiye" değildir.
  for (const project of state.projects) {
    if (project.actor !== 'private') continue;
    const stalled = privateStalled(project, turn);
    if (Boolean(project.dormant) !== stalled) project.dormant = stalled;
  }
}

/** Bir yıldır tek kuruş akmamış özel proje: uykuda. */
function privateStalled(project, turn) {
  if (project.funded >= project.cost) return false;
  return turn - (project.fundedTurn ?? project.started ?? 0) >= PRIVATE_STALL_WEEKS;
}

/**
 * Hedefi kalmamış sanayi projesini kuyruktan düşürür, ödenmiş parayı sahibine
 * iade eder. Yoksa kaybolan bir tesisin yükseltmesi (savaşta el değiştiren
 * bölge, satılan tesis) şantiye slotunu sonsuza kadar tutar.
 */
function dropInvalidProjects(nation) {
  const state = ensureConstruction(nation);
  const factories = nation.economy?.factories ?? [];
  let dropped = 0;
  for (let i = state.projects.length - 1; i >= 0; i--) {
    const project = state.projects[i];
    const industrial = project.kind === PROJECT_KIND.UPGRADE
      || project.kind === PROJECT_KIND.FACTORY;
    if (!industrial) continue;
    const orphanUpgrade = project.kind === PROJECT_KIND.UPGRADE
      && !factories.some((factory) => factory.id === project.factoryId);
    if (!orphanUpgrade && FACTORIES[project.typeId]) continue;
    if (project.funded > 0) {
      if (project.actor === 'private' && nation.politics) {
        // Iade sahibine gider: sirket parasi sirkete, havuz parasi havuza.
        // Ayrimi tutmasak iade sessiz bir sermaye transferi olurdu.
        const company = companyById(nation, project.companyId);
        if (company) company.cash += project.funded;
        else nation.politics.privateCapital = (nation.politics.privateCapital ?? 0) + project.funded;
      } else refund(nation, 'projectCost', project.funded);
    }
    state.projects.splice(i, 1);
    dropped++;
  }
  return dropped;
}

/**
 * Oyuncunun hazineden kapitalist projesine destek vermesi. Vic2'deki gibi:
 * bir tık kısmi, shift ile kalanın tamamı (hazine yettiği kadar).
 */
export function supportProject(game, nation, projectId, options = {}) {
  const state = ensureConstruction(nation);
  const project = state.projects.find((candidate) => candidate.id === projectId);
  if (!project || project.funded >= project.cost) return false;
  const remaining = project.cost - project.funded;
  const wanted = options.full ? remaining : Math.max(1, Math.ceil(remaining * 0.25));
  const amount = Math.min(wanted, remaining, nation.gold);
  if (amount <= 0) return false;
  const paid = fundProject(project, amount);
  spend(nation, 'projectCost', paid);
  // Hazine desteği projeyi uyandırır: oyuncunun parası da "sermaye akışı"dır.
  project.fundedTurn = game.world.turn;
  project.dormant = false;
  game.emit('construction', state);
  game.emit('economy', nation.economy);
  return true;
}
/* ==========================================================================
   ÜRETİM — haftanın 3. adımı
   ========================================================================== */

/** Gübrenin beslediği kalemler (RGO_TYPES'taki 'agriculture' izi). */
const AGRICULTURE_GOODS = new Set(
  Object.values(RGO_TYPES).filter((r) => r.track === 'agriculture').map((r) => r.goodId),
);

// provinceOutput icin tekrar kullanilan karalama nesnesi. Omru TEK
// rawProduction cagrisiyla sinirlidir; disari referans verilmez.
const provinceOutputScratch = {};

// Ulusal cikti biriktiricisi. Omru tek runNationEconomy cagrisidir.
const nationOutputScratch = Object.fromEntries(GOOD_IDS.map((id) => [id, 0]));

/**
 * Province'lerin ham üretimi (RGO). Çıktı `output`a birikir, pazara `rgo`
 * kaynağıyla yazılır ve haftalık pazar değeri döner — sınıf gelirinin birinci
 * kanalı budur (bkz. pop.distributeIncome).
 */
function rawProduction(world, nation, market, output) {
  // Gübre tarımı besler: sanayi → tarım yönünde tek bağ budur. Geçen haftanın
  // karşılanma oranı kullanılır, bu haftaki pazar henüz temizlenmedi.
  const fertilizer = nation.economy.goodsFlow?.fertilizer;
  const fertilized = clamp(fertilizer?.fulfilledShare ?? 0, 0, 1);
  const farmBonus = 1 + fertilized * 0.25;
  // Çıkarım işletmelerinin haftalık pazar değeri; şirket katmanı madenlerin
  // sahibini buradan okur (ayrı bir tarama yapılmaz).
  const extraction = nation.economy.extraction
    ?? (nation.economy.extraction = { value: 0, jobs: 0, count: 0, byGood: {} });
  extraction.value = 0;
  extraction.jobs = 0;
  extraction.count = 0;
  for (const id in extraction.byGood) extraction.byGood[id] = 0;

  const provinces = world.provinces ?? [];
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    if (province.owner !== nation.id || !province.econ) continue;
    const produced = provinceOutput(world, province, provinceOutputScratch);
    const track = RGO_TYPES[province.econ.rgo]?.track;
    const mine = track === 'extraction';
    if (mine) {
      extraction.count++;
      extraction.jobs += rgoJobsOf(province.econ);
    }
    for (const id in produced) {
      const amount = produced[id];
      if (id === 'gold' || !GOODS[id] || !(amount > 0)) continue;
      output[id] += track === 'agriculture' ? amount * farmBonus : amount;
      if (mine) {
        extraction.value += amount * priceOf(world, id);
        extraction.byGood[id] = (extraction.byGood[id] ?? 0) + amount;
      }
    }
  }

  // Talep ekilen alana orantılı: büyük tarım ülkesi daha çok gübre ister.
  let farmland = 0;
  for (const id in output) if (AGRICULTURE_GOODS.has(id)) farmland += output[id];
  if (farmland > 0) addDemand(market, nation, 'fertilizer', 'industry', farmland * 0.06);

  // Kaynak imtiyazı: yenilen taraf ham üretiminin bir kısmını galibe teslim
  // eder; mal dünya pazarına GALİP adına girer.
  const concession = treatiesOf(nation).find(
    (treaty) => treaty.type === 'CONCESSION' && (treaty.until ?? 0) > (world.turn ?? 0),
  );
  const holder = concession ? world.nations[concession.partner] : null;
  let value = 0;
  for (const id in output) {
    const amount = output[id];
    if (!(amount > 0)) continue;
    const shipped = holder?.alive ? amount * 0.2 : 0;
    if (shipped > 0) {
      output[id] -= shipped;
      addSupply(market, holder, id, 'rgo', shipped);
    }
    addSupply(market, nation, id, 'rgo', amount - shipped);
    value += priceOf(world, id) * (amount - shipped);
  }
  return value;
}

/**
 * Sanayi işgücünün haritaya yazılması. İki AYRI sayı, iki AYRI iş:
 *
 *   `industrialJobs`      tesislerin GERÇEKTEN bulunduğu yerdeki kadro —
 *                         kohort yerleşimi ve göç çekimi bunu okur.
 *   `industrialEmployees` kümenin ULUSAL sanayi işgücündeki nüfus PAYI —
 *                         kırsal nüfus bundan düşer (bkz. ruralPopulation).
 *
 * Payla yazmak emeğin iki kez sayılmasını yapısal olarak imkânsız kılar:
 * hiçbir kümenin sanayi payı kendi nüfusunu aşamaz.
 */
function writeProvinceLabor(world, nation) {
  const share = clamp(nation.economy.industrialShare ?? 0, 0, 1);
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    province.econ.industrialJobs = 0;
    province.econ.industrialEmployees = Math.max(0, province.econ.population) * share;
  }
  for (const factory of nation.economy.factories) {
    const econ = world.get(factory.q, factory.r)?.province;
    if (econ) econ.industrialJobs += Math.max(0, factoryJobs(factory));
  }
}

/* ==========================================================================
   TALEP — haftanın 4. adımı: ordu, inşaat, devlet
   ========================================================================== */

/**
 * Devletin askerî stoğa alıkoyduğu üretim. Alıkonan teçhizat pazardan
 * DÜŞÜLÜR (aynı tüfek hem depoya hem pazara gidemez) ve piyasa fiyatından
 * hazineden ödenir.
 */
function retainEquipment(world, nation, market, ownOutput) {
  const economy = nation.economy;
  const military = ensureMilitaryEconomy(nation);
  // Stok yatırımının haftalık bütçesi: geçen haftanın gelirinin çeyreği ×
  // tedarik kaydırağı. Sınırsız stoklama bütün ülkeleri borç tavanına yığıyordu.
  let budget = Math.max(2, (economy.ledger?.income ?? 20) * 0.25)
    * ((economy.militaryProcurement ?? 100) / 100);
  for (const id of MILITARY_EQUIPMENT_IDS) {
    const equipment = MILITARY_EQUIPMENT[id];
    const factoryOutput = Math.max(0, ownOutput[id] ?? 0);
    // Küçük bir atölye tabanı: ilk askerî fabrikasından önce ordu kuramamak
    // kalıcı bir kilit olurdu.
    const workshopOutput = id === 'arms' ? workshopArmsOutput(nation) : 0;
    if (workshopOutput > 0) addSupply(market, nation, id, 'workshop', workshopOutput);
    const room = Math.max(0, equipment.stockCap - equipmentStock(nation, id));
    const price = Math.max(0.01, priceOf(world, id));
    const affordable = budget / price;
    const fromFactory = Math.min(factoryOutput, room, affordable);
    const fromWorkshop = Math.min(workshopOutput, Math.max(0, room - fromFactory));
    military[MILITARY_FIELD[id].produced] = fromFactory + fromWorkshop;
    setEquipmentStock(nation, id, equipmentStock(nation, id) + fromFactory + fromWorkshop);
    retain(market, nation, id, fromFactory + fromWorkshop);
    const cost = (fromFactory + fromWorkshop) * price;
    spend(nation, 'procurementCost', cost);
    budget = Math.max(0, budget - cost);
  }
}

/** Ordunun haftalık tüketimi. Devlet öder; karşılanmayan pay ikmali düşürür. */
function armyDemand(world, nation, market) {
  const economy = nation.economy;
  const military = ensureMilitaryEconomy(nation);
  const { demand, fullDemand } = armyWeeklyDemand(world, nation);
  let weighted = 0;
  let total = 0;
  for (const id in demand) {
    const amount = demand[id];
    addDemand(market, nation, id, 'army', amount);
    // Bedeli geçen haftanın karşılanma oranı üzerinden ödenir: bu haftanın
    // ticareti henüz kapanmadı. Karşılanmayan pay ödenmez.
    const fulfilled = clamp(economy.goodsFlow[id]?.fulfilledShare ?? 1, 0, 1);
    spend(nation, 'procurementCost', amount * fulfilled * priceOf(world, id));
    weighted += fulfilled * amount;
    total += fullDemand[id] ?? amount;
  }
  // İkmal endeksi: EMA (~7 hafta yarı ömür) süregiden kıtlığı cezalandırır.
  const week = total > 0 ? clamp(weighted / total, 0, 1) : 1;
  military.supplyIndex = clamp((military.supplyIndex ?? 1) * 0.85 + week * 0.15, 0, 1);
}

/** Çimento şantiyeye gider: inşaat kuyruğunun o haftaki işi kadar talep. */
function constructionDemand(nation, market) {
  const power = constructionPower(nation);
  let work = 0;
  for (const project of ensureConstruction(nation).projects) {
    work += Math.min(power, Math.max(0, project.work - project.progress));
  }
  if (work > 0) addDemand(market, nation, 'cement', 'construction', Math.min(work, power) * 0.06);
}

/**
 * Devletin stratejik teçhizat alımı (dünya pazarından). Ticaretten ÖNCE koşar
 * ki alım aynı haftanın fiyatını itsin.
 */
function procureStrategicGoods(world) {
  const available = Object.fromEntries(MILITARY_EQUIPMENT_IDS.map(
    (id) => [id, world.market.goods[id]?.supply ?? 0],
  ));
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const economy = nation.economy;
    const military = ensureMilitaryEconomy(nation);
    for (const id of MILITARY_EQUIPMENT_IDS) {
      const equipment = MILITARY_EQUIPMENT[id];
      const field = MILITARY_FIELD[id];
      military[field.imported] = 0;
      const procurement = (economy.militaryProcurement ?? 100) / 100;
      const target = Math.min(
        equipment.stockCap,
        (equipment.reserve + Math.min(
          equipment.stockCap - equipment.reserve, military[field.demand] ?? 0,
        )) * procurement,
      );
      const shortage = Math.max(0, target - equipmentStock(nation, id));
      if (shortage <= 0 || available[id] <= 0) continue;
      const unitPrice = priceOf(world, id) * (1 + economy.tariff / 100);
      const affordable = nation.gold / Math.max(0.01, unitPrice);
      // Ayrıcalıklı erişim burada da geçerli: havuz değişmez, sıra değişir.
      const priority = 1 + (economy.priorityAccess?.[id] ?? 0);
      const amount = Math.min(
        equipment.importLimit * priority, shortage, available[id], affordable,
      );
      if (amount <= 0) continue;
      setEquipmentStock(nation, id, equipmentStock(nation, id) + amount);
      military[field.imported] = amount;
      spend(nation, 'importCost', amount * unitPrice);
      available[id] -= amount;
      addDemand(world.market, nation, id, 'state', amount);
    }
  }
}

/* ==========================================================================
   OKURYAZARLIK VE ARAŞTIRMA KÖPRÜSÜ
   ========================================================================== */

/**
 * OKURYAZARLIK BİR STOKTUR ama yavaş bir stok değildir.
 *
 * Eski yaklaşma hızı 0.001'di: yarılanma ~14 yıl, hedefe varış ~40 yıl. Yani
 * eğitim bütçesini %10'dan %90'a çekmenin ölçülebilir karşılığı bir insan ömrü
 * sonra geliyordu ve oyuncu bağı kuramıyordu (ölçüldü: 260 haftada araştırma
 * farkı yalnız ×1.55). 0.006 ile yarılanma ~2.2 yıla iner: karar bir seçim
 * dönemi içinde görünür, ama yine de anlık değildir — okuryazarlık hâlâ
 * yıllarca biriktirilen bir sermayedir.
 */
const LITERACY_APPROACH = 0.006;

/**
 * Okuryazarlık HEDEFİ. Üniversite çarpanı okul tabanını yükseltir;
 * `literacyReach` teknolojileri tavanı büyütür.
 */
export function literacyTargetOf(nation) {
  const economy = nation.economy;
  const schooling = clamp(economy.social?.education ?? 0, 0, 100) / 100;
  const reach = economy.techMods?.literacyReach ?? 0;
  return clamp(0.08 + schooling * 0.62 * (1 + higherEducationBonus(nation)) + reach, 0, 0.95);
}

function advanceLiteracy(nation) {
  const economy = nation.economy;
  const target = literacyTargetOf(nation);
  const current = Number.isFinite(economy.literacy) ? economy.literacy : target * 0.35;
  economy.literacy = current + (target - current) * LITERACY_APPROACH;
  economy.literacyTarget = target;
}

/* ==========================================================================
   BORÇ
   ========================================================================== */

/**
 * Haftalık borç kapanışı. Sıra: faiz → açığı borçlanmayla kapat → fazlayla öde.
 * Bütün hareketler defter yardımcılarından geçer, yani hazine kimliği bozulmaz.
 */
function settleDebt(nation) {
  const economy = nation.economy;
  const capacity = debtCapacity(nation);
  const rate = debtInterestRate(nation);
  economy.creditPenalty = Math.max(0, (economy.creditPenalty ?? 0) * 0.998);

  const interest = Math.max(0, (nation.debt ?? 0) * rate / 52);
  spend(nation, 'interestCost', interest);
  economy.interestGold = interest;

  if (nation.gold < 0) {
    const need = -nation.gold;
    const room = Math.max(0, capacity - (nation.debt ?? 0));
    const taken = Math.min(need, room);
    borrow(nation, taken);
    if (nation.gold < 0) {
      // Kapasitesi dolan devlet temerrüde düşer: açık silinir, kredi itibarı
      // yıllarca yara alır. Para yaratılmaz — ödenmeyen borç BEYAN EDİLİR.
      const written = -nation.gold;
      declareDefault(nation, written);
      economy.creditPenalty = clamp((economy.creditPenalty ?? 0) + 0.15, 0, 0.85);
      economy.defaultedTurn = nation.economy.ledger?.lastUpdated ?? 0;
    }
  } else if ((nation.debt ?? 0) > 0 && nation.gold > DEBT_CUSHION) {
    repay(nation, Math.min(nation.debt, nation.gold - DEBT_CUSHION));
  }
}

/* ==========================================================================
   HAFTALIK AKIŞ
   ========================================================================== */


/**
 * EĞİTİM → OKURYAZARLIK → ARAŞTIRMA. Sıra önemli: okuryazarlık önce ilerler,
 * araştırma o haftanın stoğunu okur. Yayılım tablosu da araştırmadan önce
 * kurulur (temas matrisi turn.js'te bu evreden önce hesaplanmıştır).
 */
function runResearch(game, world) {
  const year = 1836 + Math.floor(((world.turn ?? 1) - 1) * 7 / 365);
  refreshDiffusion(world);
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    advanceLiteracy(nation);
    ensureResearch(nation);
    const isPlayer = nation.id === game.turns.playerNation;
    // Program seçimi: YZ her zaman, oyuncu YALNIZ araştırma devredildiyse.
    const autoResearch = !isPlayer
      || delegationActive(nation, 'research', world.turn ?? 0);
    if (autoResearch && programmeLapsed(nation, world.turn ?? 0)) {
      const pick = scoreProgrammes(nation, programmeContext(world, nation));
      if (pick && pick !== nation.research.programme) {
        adoptProgramme(nation, pick, world.turn ?? 0);
        if (isPlayer) {
          noteDelegated(game, nation, 'research', `National programme: ${PROGRAMMES[pick]?.name ?? pick}.`,
            'The previous commitment had run its term.');
        }
        // Taahhüt anında bağlar (oyuncu tarafıyla aynı kural).
        setFiscalPolicy(nation, 'social',
          Math.max(nation.economy.social?.education ?? 0, PROGRAMMES[pick]?.floor ?? 0),
          'education');
      } else if (nation.research.programme) {
        nation.research.programmeSince = world.turn ?? 0;
      }
    }
    // Boşalan kuyruğu program doldurur — OYUNCU DÂHİL. Program oyuncunun
    // kendi ilan ettiği yöndür; elle seçim hâlâ serbesttir (startResearch).
    if (!nation.research.current) {
      const pick = nextTechFor(nation, year, world);
      if (pick) startResearch(nation, pick);
    }
    const done = advanceResearch(nation, year, world);
    if (done && isPlayer) announceResearch(game, nation, done);
  }
}

/** Tamamlanan teknolojinin oyuncuya duyurusu. */
function announceResearch(game, nation, done) {
  const entry = techById(done);
  const next = nation.research.current
    ? techById(nation.research.current)?.tech.name ?? null : null;
  const opens = [
    ...(entry?.tech.unlock ?? []).map((id) => id.replace(/_/g, ' ').toLowerCase()),
    ...(entry?.tech.unlockUnit ?? []).map((id) => `${id.toLowerCase()} divisions`),
  ];
  if (opens.length) {
    // KİLOMETRE TAŞI: yeni bir yetenek açan teknoloji vakayinameye girer.
    announce(game, nation, {
      kind: 'RESEARCH', tier: TIER.MAJOR, key: 'research-done', ttl: 0,
      title: `${entry?.tech.name ?? done} achieved`,
      detail: `Opens ${opens.join(', ')}.`
        + (next ? ` Research continues with ${next}.` : ''),
    });
  } else {
    game.turns.addLog(
      `${entry?.tech.name ?? done} researched`
      + (next ? ` — continuing with ${next}.` : ' — nothing left to research.'),
      { kind: 'RESEARCH', ttl: 0, key: 'research-done' },
    );
  }
}

/**
 * Haftalık ekonomi üç adıma bölünür: `beginEconomy` → ulus başına
 * `runNationEconomy` → `finishEconomy`. Bölünme yalnız ZAMANLAMA içindir
 * (turn.js kareler arasında dilimler); mantık ve sıra bire bir aynıdır.
 */
export function beginEconomy(game) {
  const world = game.world;
  ensureEconomy(world);
  // Yasa ve teknoloji çarpanları haftada BİR KEZ hesaplanır; sıcak yol sonra
  // yalnız düz alan okur.
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    if (nation.politics) {
      // Sayaç erimesi ulus başına haftada TAM BİR KEZ, burada.
      decayReformCounters(nation);
      refreshReformModifiers(nation);
    }
    // Nöbetçi EN YENİ anahtar: eski kayıttaki techMods yeni anahtarları
    // taşımaz; eksikse yeniden kurulur.
    if (!nation.economy.techMods || !('literacyReach' in nation.economy.techMods)) {
      refreshTechModifiers(nation);
    }
    nation.economy.atWarCache = world.nations.some(
      (other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id),
    );
  }
  refreshNationalStrain(world);
  refreshLabor(world);
  runResearch(game, world);

  const market = world.market;
  // Girdi bolluğu GEÇEN HAFTADAN okunur; sıfırlamadan önce alınır ki ulus
  // sırası sonucu değiştirmesin (dilimleme güvenli).
  const availability = inputAvailability(market);
  resetMarketFlows(market);

  const profile = {};
  let markT = performance.now();
  const ctx = {
    world,
    market,
    availability,
    profile,
    mark(name) {
      const now = performance.now();
      profile[name] = (profile[name] ?? 0) + (now - markT);
      markT = now;
    },
    stamp() { markT = performance.now(); },
  };
  ctx.mark('setup');
  return ctx;
}

/**
 * RGO kadrosu ulus başına: TEK dünya taramasıyla. Ülke başına province taramak
 * 65 ülke × ~300 küme = haftada on binlerce yineleme demekti.
 */
function refreshLabor(world) {
  for (const nation of world.nations) {
    if (nation.economy) nation.economy.rgoJobs = 0;
  }
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.econ) continue;
    const economy = world.nations[province.owner]?.economy;
    if (economy) economy.rgoJobs += rgoJobsOf(province.econ);
  }
  for (const nation of world.nations) {
    const economy = nation.economy;
    if (!economy) continue;
    // RGO kadrosu KİŞİ ölçeğinde tanımlıdır (`rgoLaborScale` kırsal NÜFUSA
    // böler). İşgücü tavanına çevirmek için aynı orana indirilir; yoksa tarla
    // bütün işgücünü soğurur ve işsizlik yapısal olarak sıfır kalır (ölçüldü:
    // rgoJobs/işgücü = 1.9).
    economy.ruralCapacity = (economy.rgoJobs ?? 0) * WORKFORCE_RATE;
  }
}

/** Eğitimin işgücü niteliğine katkısı: okullu nüfus fabrikaya daha hızlı akar. */
function schoolingOf(nation) {
  return 1 + socialLevel(nation, 'education') * 0.25 + higherEducationBonus(nation);
}

/** Sosyal programların ve şehir bütçesinin hazineye yazılması. */
function payGovernment(nation) {
  const budget = nation.budget ?? {};
  earn(nation, 'cityRevenue', Math.max(0, budget.production?.gold ?? 0));
  spend(nation, 'armyCost', Math.max(0, budget.armyGold ?? 0));
  spend(nation, 'administrationCost', Math.max(0, budget.administration ?? 0));
  const social = socialSpendingCost(nation);
  nation.economy.socialCost = social;
  spend(nation, 'socialCost', social);
  const construction = constructionUpkeep(nation);
  nation.economy.constructionUpkeep = construction;
  spend(nation, 'constructionCost', construction);
}

export function runNationEconomy(game, nation, ctx) {
  if (!nation.alive) return;
  const { world, market, availability, mark } = ctx;
  ctx.stamp();
  const economy = nation.economy;

  // 1. NÜFUS ANLIK GÖRÜNTÜSÜ — tek gerçek province toplamıdır.
  commitCompletedProjects(game, nation);
  if (nation.id === game.turns.playerNation) applySubsidyPolicy(world, nation);
  resetNationFlows(nation);
  setPopulation(nation, provincePopulation(world, nation.id));
  mark('population');

  // 2. İŞGÜCÜ — istihdam işgücü TÜKETİR, yaratmaz.
  enforceWorkforceCap(nation);
  updateEmployment(nation, economy.ruralCapacity ?? 0);
  mark('labor');

  // 3. ÜRETİM — ham + sanayi, ikisi de aynı arz havuzuna.
  const ownOutput = nationOutputScratch;
  for (let i = 0; i < GOOD_IDS.length; i++) ownOutput[GOOD_IDS[i]] = 0;
  const baseOutputValue = rawProduction(world, nation, market, ownOutput);
  const industrialOutput = runFactories(
    world, nation, market, ownOutput, availability, reformModifiers(nation),
  );
  // İşe alım ve seviye atlama aylıktır: sanayileşmenin temposu budur.
  if ((world.turn ?? 1) % HIRING_INTERVAL === 0) {
    runHiring(world, nation, schoolingOf(nation),
      (factory) => autoUpgradeFactory(game, nation, factory));
  }
  writeProvinceLabor(world, nation);
  mark('production');

  // 4. TALEP — devlet, ordu, şantiye, hane.
  retainEquipment(world, nation, market, ownOutput);
  armyDemand(world, nation, market);
  constructionDemand(nation, market);
  householdDemand(world, nation, market, socialLevel(nation, 'welfare'), reformMoodShift);
  updateStability(nation);
  mark('demand');

  // 7-8. KAPANIŞ — gelir dağıtımı, vergi, harcama. (5-6 küresel: finishEconomy)
  economy.baseOutputValue = baseOutputValue;
  economy.gdp = baseOutputValue + industrialOutput;
  // Şirket kapanışı maliyeden ÖNCE: yabancı ortağa ödenen temettü burada
  // ödenir ve `capitalWithheld` olarak gelir dağıtımına bırakılır.
  runCompanies(game, nation);
  const taxes = distributeIncome(nation, baseOutputValue, taxEfficiency(nation));
  earn(nation, 'taxRevenue', taxes);
  payGovernment(nation);
  runClassMobility(nation, socialLevel(nation, 'education'));
  mark('fiscal');

  runPrivateSector(game, nation);
  runEconomicAI(game, nation);
  // Bina kararı da bir harcamadır ve defter yazılmadan önce verilmeli.
  planConstructionAI(game, nation);
  mark('econAI');
}

export function finishEconomy(game, ctx) {
  const { world, market, mark } = ctx;
  ctx.stamp();
  // Devletin gerçek alımı stratejik stokları doldurur ve fiyatı yukarı iter.
  procureStrategicGoods(world);
  // Ayrıcalıklı erişim tablosu ticaretten hemen önce tazelenir.
  refreshPriorityAccess(world);
  // 5. TİCARET
  settleGlobalTrade(world);
  mark('trade');
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    runInvestmentAI(game, nation);
    updateMilitaryAverages(nation);
    // 10. DEFTER KAPANIŞI — borç önce, çünkü faiz bu haftanın kaydına girmeli.
    settleDebt(nation);
    closeTreasury(nation, world.turn);
  }
  // 6. FİYAT
  updatePrices(market);
  market.lastUpdated = world.turn;
  mark('ledger');
  game.turns.lastEconomyProfile = ctx.profile;
  game.emit('economy', market);
}

/** Senkron kompozisyon: tanılama betikleri ve testler tek çağrıyla koşar. */
export function runEconomy(game) {
  const ctx = beginEconomy(game);
  for (const nation of game.world.nations) runNationEconomy(game, nation, ctx);
  finishEconomy(game, ctx);
}


/* ==========================================================================
   BORÇ KAPASİTESİ
   ========================================================================== */

/**
 * Borçlanma kapasitesi: yıllık gelirin ~yarısı. GSYH değil gelir esas alınır
 * çünkü faizi ödeyecek olan hazinedir; zengin ama vergisiz ülke borç bulamaz.
 */
export function debtCapacity(nation) {
  const weekly = Math.max(0, nation.economy?.ledger?.income ?? 0);
  // Temerrude dusen devlete daha az borc verilir. Bu carpan olmadan iflasin
  // hicbir bedeli olmuyordu (bkz. settleDebt).
  const credit = 1 - clamp(nation.economy?.creditPenalty ?? 0, 0, 0.85);
  // Mali teknolojiler (Financial Institutions) kapasiteyi buyutur. Faiz
  // ayrica dokunulmaz: debtInterestRate load=borc/kapasite okudugu icin
  // ayni anahtar faiz yukunu de kendiliginden dusurur — tek anahtar, iki
  // gorunur sonuc.
  const tech = 1 + (nation.economy?.techMods?.debtCapacityBonus ?? 0);
  return Math.max(50, weekly * 26 * credit * tech);
}

/** Yıllık faiz: taban %4, kapasite doldukça %12'ye tırmanır; temerrüt ekler. */
export function debtInterestRate(nation) {
  const debt = Math.max(0, nation.debt ?? 0);
  const load = clamp(debt / Math.max(1, debtCapacity(nation)), 0, 1);
  const credit = clamp(nation.economy?.creditPenalty ?? 0, 0, 0.85);
  return 0.04 + 0.08 * load + 0.10 * credit;
}

/**
 * Hazine kapanışı: faiz tahakkuk eder, açık borçlanmayla kapanır, bolluk
 * borcu geri öder. Sıfırda oyun bitmez — devlet borçlanır ve faiz bütçeye
 * gider olarak düşer; kapasite dolunca hazine eksiye sıkışır ve harcama
 * kapıları (canAfford) kendiliğinden kapanır.

/** Geri ödemeye başlamadan önce hazinede tutulan yastık. */
const DEBT_CUSHION = 25;

/* ==========================================================================
   SAVAŞ YÜKÜ
   ========================================================================== */

function refreshNationalStrain(world) {
  const occupied = OCCUPIED_SCRATCH;
  occupied.length = world.nations.length;
  occupied.fill(0);
  world.forEach((tile) => {
    if (tile.owner < 0 || !tile.terrain.passable) return;
    if (controllerOf(tile) !== tile.owner) occupied[tile.owner]++;
  });
  const turn = world.turn ?? 0;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    const owned = Math.max(1, nation.tiles ?? 1);
    nation.economy.occupiedTiles = occupied[nation.id] ?? 0;
    nation.economy.occupiedShare = clamp((occupied[nation.id] ?? 0) / owned, 0, 1);
    // Savas yuku: cephe sayisi ve suresi birlikte. Tek kisa savas kimseyi
    // yildirmaz; uc yil suren iki cephe yildirir.
    let strain = 0;
    let fronts = 0;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (!atWar(world, nation.id, other.id)) continue;
      fronts++;
      const since = world.relations?.[nation.id]?.[other.id]?.since ?? turn;
      strain += 0.35 + clamp((turn - since) / 156, 0, 1) * 0.65;
    }
    nation.economy.warFronts = fronts;
    nation.economy.warStrain = clamp(strain / 2, 0, 1);
  }
}

const OCCUPIED_SCRATCH = [];

/* ==========================================================================
   ORDUNUN HAFTALIK TÜKETİMİ
   ========================================================================== */

/**
 * Ordunun haftalık mal tüketimi. Mühimmat ve yakıt bilerek listede: onları
 * üreten tesisler kuruluyordu ama hiçbir tüketicisi olmadığı için fiyat
 * tabana çakılıp fabrikalar zarar ediyordu (ölçüldü).
 *
 * Tedarik kaydırağı devletin orduya ne kadar mal aldığını belirler; grocery
 * kalemi de ölçeklenir (aç orduyu az beslemek bir karardır). Barış ordusu
 * talim tüketir, savaş ordusu cephane yakar — bu çarpan olmadan tedarik
 * faturası barışta bile geliri ikiye katlıyordu (ölçüldü).
 *
 * `fullDemand` ordunun TAM ihtiyacıdır (kaydıraçtan bağımsız payda): hazırlık
 * kısılmış talebe göre ölçülünce %25 tedarik "daha iyi ikmal" görünüyordu.
 *
 * Dışa açık çünkü ticaret defteri de okur: ekrandaki "ordu tüketimi" satırı
 * bu tablonun kendisinden gelir, kopyasından değil.
 */
const ARMY_CONSUMPTION_RATES = {
  // Patlayici da eklendi: EXPLOSIVES_FACTORY kurulabiliyordu ama malin hicbir
  // tuketicisi yoktu (olculdu) — ordu istihkam/kusatma isinde patlayici yakar.
  arms: 0.08, groceries: 0.05, ammunition: 0.06, fuel: 0.04, explosives: 0.02,
};

/**
 * Bindirilmis (denizdeki) alay basina haftalik konvoy gideri. Vapur
 * konvoylarinin gercek tuketicisi budur: orduyu denizden tasimak filo ister.
 * Bu bag yokken `steamers` yalniz gemi insasinda bir kez harcaniyordu ve
 * uretim hatti kurulu ulkede stok tavanda curuyordu.
 */
const CONVOY_PER_EMBARKED_REGIMENT = 0.15;

export function armyWeeklyDemand(world, nation) {
  let landUnits = 0;
  let embarked = 0;
  for (const unit of world.units) {
    if (unit.nationId === nation.id && unit.type.domain === 'land') {
      landUnits += regimentCount(unit);
      if (unit.embarked) embarked += regimentCount(unit);
    }
  }
  const wartime = world.nations.some(
    (other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id),
  );
  const tempo = wartime ? 1 : 0.35;
  const scale = (nation.economy?.militaryProcurement ?? 100) / 100;
  // Demiryolu/ikmal teknolojileri tuketimi dusurur (negatif toplam).
  const supplyTech = clamp(1 + (nation.economy?.techMods?.supplyConsumption ?? 0), 0.5, 1);
  const demand = {};
  const fullDemand = {};
  for (const id in ARMY_CONSUMPTION_RATES) {
    const base = landUnits * ARMY_CONSUMPTION_RATES[id] * tempo * supplyTech;
    fullDemand[id] = base;
    demand[id] = id === 'groceries' ? base * (0.5 + scale * 0.5) : base * scale;
  }
  // Denizdeki ordu konvoy tuketir; tempo carpani yok — tasima baris/savas
  // ayirmaz, gemideki tumen her hafta beslenir.
  if (embarked > 0) {
    const convoys = embarked * CONVOY_PER_EMBARKED_REGIMENT * supplyTech;
    fullDemand.steamers = (fullDemand.steamers ?? 0) + convoys;
    demand.steamers = (demand.steamers ?? 0) + convoys * scale;
  }
  return { demand, fullDemand, landUnits, wartime };
}

/* ==========================================================================
   MALİ VE SANAYİ YZ'Sİ — oyuncuyla AYNI kaldıraçlar
   ========================================================================== */

/**
 * Kesme sirasi. Refah once, egitim EN SON gider: egitim tek basina
 * arastirmanin yakitidir (okuryazarlik -> researchPointsOf) ve bir kez
 * sifirlandiginda okuryazarlik stogu insan omru olceginde geri gelir.
 */
const CUT_ORDER = ['welfare', 'health', 'education'];

/**
 * Hazine biriktikçe açılan sosyal harcama. YZ oyuncuyla aynı kaldıraçları
 * kullanmazsa geç oyunda tek başına para yığar; istikrar düşükse refah,
 * hazine bolsa eğitim/sağlık açar, para biterse kısar.
 */
function adjustSocialAI(nation, report = null) {
  const economy = nation.economy;
  // Tek defter olduğu için haftalık toplam değişim doğrudan okunur; eskiden
  // şehir bütçesi ayrı bir kalemdi ve iki parçayı toplamak gerekiyordu.
  const weekly = economy.ledger?.net ?? 0;
  let rich;
  let broke;
  if (FUEL_FIX) {
    // CIRT KIRILDI. Eski esikler MUTLAKTI (`gold > 200` / `gold < 60`) ve
    // asimetrikti: `weekli < 0` TEK BASINA kesmeye yetiyordu, yani herhangi
    // bir kotu hafta on iyi haftanin kazanimini geri aliyordu. Olcum: 1860'ta
    // medyan egitim 0'a iniyor ve yuzyilin kalanini orada geciriyordu.
    // Yeni esik ULKENIN KENDI OLCEGINE gore: sekiz haftalik sosyal gider.
    // Ikinci ayar (on-kayitli plan: "(a) duser, (k) gecerse once reserve/rich
    // duyarliligi"): savas-yogun tohumlarda weekly<0 tek basina cok sik ates
    // ediyordu — kesme kosulu yari rezerve, yukselme esigi 1.5x'e cekildi.
    const reserve = 8 * socialSpendingCost(nation);
    broke = nation.gold < reserve * 0.25 || (weekly < 0 && nation.gold < reserve * 0.5);
    rich = nation.gold > reserve * 1.5 && weekly > 0;
  } else {
    rich = nation.gold > 200;
    broke = nation.gold < 60 || weekly < 0;
  }
  const step = broke ? -10 : rich ? 10 : 0;
  if (!step) return;
  // Yukseltme sirasi istikrara gore degisir. KESME sirasi ise artik sabittir:
  // eskiden yukseltme sirasi ters cevrilerek turetiliyordu ve bu, istikrar
  // 0.5'in altindayken EGITIMI ILK kesiyordu — yani ulke tam da zordayken.
  const raiseOrder = economy.stability < 0.5
    ? ['welfare', 'health', 'education']
    : ['education', 'health', 'welfare'];
  const order = broke
    ? (FUEL_FIX ? CUT_ORDER : [...raiseOrder].reverse())
    : raiseOrder;
  for (const id of order) {
    const current = economy.social[id] ?? 0;
    if (step > 0 && current < 100) {
      economy.social[id] = current + step;
      report?.('budget', `${SOCIAL_PROGRAMS[id]?.name ?? id} spending ${current}% \u2192 ${current + step}%.`,
        'The treasury could afford more.');
      return;
    }
    if (step < 0) {
      const floor = FUEL_FIX ? socialFloorOf(nation, id) : 0;
      if (current > floor) {
        const next = Math.max(floor, current + step);
        economy.social[id] = next;
        if (next !== current) {
          report?.('budget', `${SOCIAL_PROGRAMS[id]?.name ?? id} spending ${current}% \u2192 ${next}%.`,
            'The treasury was under strain.');
        }
        return;
      }
      // Tabandaysa ATLA, `return` etme: yoksa egitim tabanina oturunca
      // adjustSocialAI haftalik bir no-op'a doner ve mali YZ kaldiracini
      // tumden kaybeder.
      continue;
    }
  }
}

/**
 * Yatırım yapılacak state'ler: kârlı türü henüz kurulmamış, kalabalık olan
 * önce gelir. Seviye atlatma burada yok — o kadro dolunca kendiliğinden olur.
 */
function investmentTargets(world, nation) {
  // KOPYA + DETERMINISTIK ESITLIK BOZUCU. Eski hali atlasin KENDI dizisini
  // yerinde siraliyordu ve esit nufuslu bolgelerde sira, onceki cagrilarin
  // birakigi dizilime bagliydi — yuklenen oyunda atlas taze kuruldugu icin
  // ayni durumdaki iki kosu FARKLI bolgeye yatirim seciyordu (olculdu:
  // save-audit dallanmasi, +77. haftada ¤229'luk CANNERY baska state'e).
  return [...constructionAtlas(world, nation.id).regions]
    .sort((a, b) => b.population - a.population
      || String(a.id).localeCompare(String(b.id)));
}

/**
 * Yatırım sırası. Yalnız marja bakmak zinciri çökertiyordu: ülke en kârlı tek
 * türü bütün state'lere dikiyor, inşaat gücü tükeniyor ve tablodaki 29 türün
 * ancak 7'si kuruluyordu. Sonuç ölçüldü — ara mallar (yakıt, mühimmat, tank)
 * ne üretiliyor ne tüketiliyordu, fiyatları taban fiyatta çakılı kalıyordu.
 *
 * Bu yüzden önce *hiç kurulmamış* tür gelir; eşitlikte marj karar verir. Ülke
 * böylece zincirin tamamını kurar, sonra kârlı olanı çoğaltır.
 */
function investmentOptions(world, nation) {
  const owned = new Map();
  for (const factory of nation.economy.factories ?? []) {
    owned.set(factory.typeId, (owned.get(factory.typeId) ?? 0) + 1);
  }
  for (const project of ensureConstruction(nation).projects) {
    if (project.kind !== PROJECT_KIND.FACTORY) continue;
    owned.set(project.typeId, (owned.get(project.typeId) ?? 0) + 1);
  }
  return Object.keys(FACTORIES)
    .map((typeId) => ({
      typeId,
      margin: factoryMargin(world, typeId),
      built: owned.get(typeId) ?? 0,
    }))
    .filter((option) => option.margin > 0)
    .sort((a, b) => a.built - b.built || b.margin - a.margin);
}

/**
 * Maliye politikası. Ölçümde 15 ülkenin hepsi 109 yıl boyunca aynı varsayılan
 * değerlerde kalıyordu (vergi 20/15/10, tarife %10): kodda YZ tarafında hiç
 * `setFiscalPolicy` çağrısı yoktu, yani ekonomik kaldıraçları yalnız oyuncu
 * kullanıyordu. Artık YZ de krizde vergi artırır, bollukta indirir ve ticaret
 * politikasına göre gümrüğünü ayarlar.
 */
function adjustFiscalAI(nation, areas = FULL_FISCAL) {
  const economy = nation.economy;
  const weekly = economy.ledger?.net ?? 0;
  const broke = nation.gold < 80 || weekly < 0;
  const rich = nation.gold > 600 && weekly > 0;
  if (areas.budget && (broke || rich)) {
    // Vergiyi önce en varlıklı sınıftan artır, indirirken en yoksuldan başla:
    // hem gelir hem memnuniyet açısından en ucuz sıra budur.
    const order = broke ? ['upper', 'middle', 'lower'] : ['lower', 'middle', 'upper'];
    const step = broke ? 5 : -5;
    for (const classId of order) {
      const socialClass = economy.classes[classId];
      // Zorlanan sınıfın vergisi artırılmaz. Bu fren olmadan YZ hazine
      // sıkışınca doğrudan tavana çıkıyor ve üst sınıfı 200 turda tamamen
      // eritiyordu (ölçüldü) — sonra da kapitalist ve özel sermaye kalmıyor.
      if (step > 0 && (!socialClass.canAffordNeeds || (socialClass.hardshipWeeks ?? 0) > 0)) {
        continue;
      }
      const current = economy.taxes[classId];
      // Tavanlar düşük tutuldu: yüksek vergi sınıfı eritir (bkz. pop.js SUBSISTENCE_SHARE).
      const limit = classId === 'lower' ? 35 : classId === 'middle' ? 42 : 45;
      const next = clamp(current + step, 5, limit);
      if (next !== current) {
        economy.taxes[classId] = next;
        areas.report?.('budget',
          `${CLASS_INFO[classId]?.name ?? classId} tax ${current}% \u2192 ${next}%.`,
          broke ? 'Treasury reserves were falling.' : 'The treasury could afford relief.');
        break;
      }
    }
  }
  // Korumacı hükümet sanayisini kollar, serbest ticaretçi gümrüğü SIFIRA
  // indirir — tabana değil. Taban artık −50 (ithalat sübvansiyonu) ve oraya
  // sürüklenen YZ hazinesini kalıcı olarak ithalata akıtıyordu.
  if (areas.trade) {
    const limits = fiscalPolicyLimits(nation);
    const wanted = policyOf(nation, 'trade') === 'protectionism' ? limits.tariffMax : 0;
    // SALINIM FRENI. Gumruk haftada en fazla iki puan surunur. AUTO acildiginda
    // oyuncunun kurdugu %30 bir haftada %80'e sicramaz; hukumet aylar icinde
    // kendi doktrinine kayar ve oyuncu her an anahtari kapatip yerinde durdurur.
    const drift = Math.sign(wanted - economy.tariff) * 2;
    if (drift) {
      const before = economy.tariff;
      economy.tariff = clamp(economy.tariff + drift, limits.tariffMin, limits.tariffMax);
      if (economy.tariff !== before) {
        areas.report?.('trade',
          `Tariff ${before}% \u2192 ${economy.tariff}%.`,
          policyOf(nation, 'trade') === 'protectionism'
            ? 'The government protects domestic industry.'
            : 'The government is opening the ports.');
      }
    }
  }
  if (areas.budget) adjustWarFiscalAI(nation);
}

/** YZ ulkeleri her kaldiraci kullanir; devirde alanlar ayri ayri acilir. */
const FULL_FISCAL = { budget: true, trade: true, report: null };

/**
 * Savaş/barış/kriz maliyesi. Kusursuz değil, makul: savaşta ordu fonlanır ve
 * kontrollü açık kabul edilir; barışta tedarik gevşer, zenginlik eğitime
 * akar; kriz (borç kapasiteyi yarıladı) her şeyi keser.
 */
function adjustWarFiscalAI(nation) {
  const economy = nation.economy;
  // Savaş bilgisi runEconomicAI'da bağlanır (economy dünyayı tutmaz).
  const wartime = economy.atWarCache ?? false;
  const limits = fiscalPolicyLimits(nation);
  const debt = Math.max(0, nation.debt ?? 0);
  const crisis = debt > debtCapacity(nation) * 0.5 && nation.gold < 50;

  const drift = (key, target, step = 5) => {
    const current = economy[key] ?? 100;
    if (Math.abs(current - target) < step) return;
    setFiscalPolicy(nation, key, current + Math.sign(target - current) * step);
  };

  if (crisis) {
    // KRIZ PROGRAMI FESHEDER — sosyal kesintiden ONCE. Fesih egitim tabanini
    // kaldirir (asagidaki kesinti ancak boyle inebilir), puanin yarisini
    // yakar ve bir yil yeni ilan yasagi baslatir. Cokus boylece SILINMEDI:
    // okunur bir basarisizlik durumu oldu (bkz. TECHNOLOGY_DESIGN §4).
    // Fesih esigi kriz esiginden DERINDIR (0.8 > 0.5): her nakit sikismasi
    // programi dusurseydi ulkeler adopt->kriz->52 hafta yasak dongusune
    // giriyordu (olculdu: dunyanin yarisi surekli programsiz). Kriz yine
    // kaydiraclari kisar; program ancak gercek batakta feshedilir.
    if (nation.research?.programme && debt > debtCapacity(nation) * 0.8) {
      abandonProgramme(nation, economy.turnCache ?? 0, 'crisis');
    }
    // Önce isteğe bağlı harcamalar: sübvansiyonlar kapanır, sosyal kısılır,
    // tedarik tabana iner. Vergi tarafını mevcut "broke" dalı zaten sıkıyor.
    for (const factory of economy.factories ?? []) factory.subsidized = false;
    for (const programId of Object.keys(economy.social ?? {})) {
      const level = economy.social[programId] ?? 0;
      if (level > 0) setFiscalPolicy(nation, 'social', level - 10, programId);
    }
    drift('militaryProcurement', wartime ? 60 : 40);
    drift('militaryWages', wartime ? limits.armySpendingMax : 60);
    // Kriz yonetimi idareyi de kisar: tahsilat duser ama gider de duser —
    // yonetim butcesi artik nufusla buyudugu icin bu gercek bir tasarruf.
    drift('adminFunding', 60);
    // TASFIYE: akis kisintisi yetmiyorsa STOK erir. Zengin donemde kurulan
    // kapasite/egitim seviyeleri sabit bakimdir; dunya fakirlesince bu yuk
    // temerrut sarmalina donusuyordu (olculdu: 1300. haftada 19/26 ulke
    // kalici kredi cezasinda, cikis yolu yok). Haftada en fazla bir seviye,
    // bakim gelirin %25'inin altina inince durur; son kapasite seviyesi ve
    // ilk egitim kademesi korunur (kurumlar tamamen silinmez).
    const income = Math.max(1, economy.ledger?.income ?? 0);
    if (constructionUpkeep(nation) > income * 0.25) {
      const state = ensureConstruction(nation);
      // Derin krizde (bakim gelirin yarisini yiyor — sehirsiz kalinti devlet)
      // son seviye de gider: taban insaat gucu (5) zaten seviyesiz yasar,
      // toparlanan ulke ilk kapasite kuralindan yeniden baslar.
      const floor = constructionUpkeep(nation) > income * 0.5 ? 0 : 1;
      if ((state.capacity.construction ?? 0) > floor) {
        dropInvestmentLevel(nation, 'CONSTRUCTION_CAPACITY');
      } else if ((state.capacity.education ?? 0) > floor) {
        dropInvestmentLevel(nation, 'HIGHER_EDUCATION');
      }
    }
    return;
  }

  if (wartime) {
    drift('militaryWages', limits.armySpendingMax);
    drift('militaryProcurement', limits.armySpendingMax);
    // Sosyal harcama savaşta yarıya süzülür; barış gelince zenginlik geri açar.
    const welfare = economy.social.welfare ?? 0;
    if (welfare > 30) setFiscalPolicy(nation, 'social', welfare - 10, 'welfare');
    // Savaş kasası: yalnız stratejik tesisler (silah/mühimmat) desteklenir.
    for (const factory of economy.factories ?? []) {
      const strategic = factory.typeId === 'ARMS_FACTORY'
        || factory.typeId === 'AMMUNITION_FACTORY';
      if (strategic && factory.profit < 0) factory.subsidized = true;
    }
    return;
  }

  // Barış: tedarik %60-75 bandına gevşer (stoklar doluysa para israfıdır),
  // zengin hazine eğitimi besler, her fabrika sübvansiyonu kalkmaz ama
  // stratejik olmayanlar bırakılır.
  drift('militaryProcurement', 65);
  drift('militaryWages', Math.min(limits.armySpendingMax, 85));
  // Baris ve bolluk idareyi tam fonlamaya geri getirir.
  if (nation.gold > 200) drift('adminFunding', 100);
  if (nation.gold > 400) {
    const education = economy.social.education ?? 0;
    if (education < 60) setFiscalPolicy(nation, 'social', education + 10, 'education');
  }
  for (const factory of economy.factories ?? []) {
    if (factory.subsidized && factory.typeId !== 'ARMS_FACTORY'
      && factory.typeId !== 'AMMUNITION_FACTORY') {
      factory.subsidized = false;
    }
  }
}

function runPrivateSector(game, nation) {
  if (!nation.alive || !nation.politics) return;
  nation.politics.lastPrivateInvestment = null;
  // Hedefi kalmamış proje her şeyden önce kuyruktan düşer: ölü bir şantiye
  // hem parayı hem slotu tutar.
  dropInvalidProjects(nation);
  // Açık projeler politikadan bağımsız beslenir. Aksi halde seçim ekonomiyi
  // planlıya çevirdiğinde önceki hükümetten kalan şantiyeler kuyrukta sonsuza
  // kadar yarım kalırdı.
  fundPrivateProjects(nation, game.world.turn);
  const rules = factoryInvestmentRules(nation);
  if (!rules.privateBuild) return;
  const economy = nation.economy;
  const regions = investmentTargets(game.world, nation);
  if (!regions.length) return;
  // Kapitalistler sınırsız şantiye açmaz; ama UYUYAN proje kapıyı tutmaz.
  const projects = ensureConstruction(nation).projects.filter(
    (project) => project.actor === 'private',
  );
  const active = projects.filter((project) => !project.dormant).length;
  if (active >= PRIVATE_ACTIVE_LIMIT || projects.length >= PRIVATE_QUEUE_LIMIT) return;

  const options = investmentOptions(game.world, nation);
  for (const option of options) {
    const region = regions.find((candidate) => canBuildFactory(
      game.world, nation, candidate.id, option.typeId, 'private',
    ));
    if (!region) continue;
    if (buildFactory(game, nation, region.id, option.typeId, { actor: 'private' })) {
      const factory = economy.factories[economy.factories.length - 1];
      const owner = companyForFactoryType(nation, option.typeId);
      nation.politics.lastPrivateInvestment = {
        action: 'build',
        factoryId: factory.id,
        typeId: option.typeId,
        companyId: owner?.id ?? null,
        companyName: owner?.name ?? null,
        regionName: region.name,
      };
      if (owner) {
        owner.lastInvestment = {
          turn: game.world.turn ?? 0, typeId: option.typeId, regionName: region.name,
        };
      }
      return;
    }
  }
}

/**
 * Ulusal ekonomi yonetimi. YZ ulkeleri icin hepsi, oyuncu icin YALNIZ
 * devredilmis alanlar kosar (bkz. delegation.js).
 *
 * OYUNCUYA GIZLI BONUS YOKTUR: burada cagrilan her fonksiyon ayni hazineyi,
 * ayni yasa tavanlarini (fiscalPolicyLimits), ayni insaat kapisini
 * (canBuildFactory) ve ayni teçhizat kisitini kullanir. Devir bir kolaylik,
 * bir avantaj degil.
 */
function runEconomicAI(game, nation) {
  if (!nation.alive) return;
  const player = nation.id === game.turns.playerNation;
  const turn = game.world.turn ?? 0;
  const budget = !player || delegationActive(nation, 'budget', turn);
  const trade = !player || delegationActive(nation, 'trade', turn);
  const construction = !player || delegationActive(nation, 'construction', turn);
  if (!budget && !trade && !construction) return;
  const report = player
    ? (areaId, text, reason) => noteDelegated(game, nation, areaId, text, reason)
    : null;
  const economy = nation.economy;
  // Maliye YZ'sinin savaş/barış kararı için: economy dünyayı bilmez, bağ
  // burada kurulur.
  economy.atWarCache = game.world.nations.some(
    (other) => other.alive && other.id !== nation.id
      && atWar(game.world, nation.id, other.id),
  );
  // Kriz dalindaki program feshi tur numarasi ister; economy dunyayi
  // tutmadigi icin atWarCache ile ayni kalipla burada baglanir.
  economy.turnCache = game.world.turn ?? 0;
  if (budget) adjustSocialAI(nation, report);
  adjustFiscalAI(nation, { budget, trade, report });
  if (!construction) return;
  // Yatirim hedefi kalmamis (sehirsiz) devlet MALIYESIZ kalmasin: erken cikis
  // fiscal YZ'nin ustundeyken kriz modu hic kosmuyordu — kalinti devlet eski
  // bolluk gunlerinin kapasite bakimini odemeye devam edip kalici temerrutte
  // kilitleniyordu (olculdu: 1300. haftada 12 kalintinin cogu bu yuzden).
  const regions = investmentTargets(game.world, nation);
  if (!regions.length) return;

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
      const region = regions.find((candidate) => canBuildFactory(
        game.world, nation, candidate.id, 'ARMS_FACTORY',
      ));
      if (region && buildFactory(game, nation, region.id, 'ARMS_FACTORY')) {
        const factory = economy.factories[economy.factories.length - 1];
        if (desiredLine !== 'arms') setMilitaryProductionLine(game, nation, factory.id, desiredLine);
        return;
      }
      // Kritik ekipman, başka bir yatırım öncesinde bütçesini bekler.
      if (region) return;
    }
  }

  // Seviye atlatma artık bir YZ kararı değil; kadro dolunca kendiliğinden olur.
  // Geriye kalan tek sanayi kararı, yeni bir state'i sanayileştirmek.
  if (nation.gold < 170) return;
  // Altın tek başına yetmez: doldurulamayan kadro varken yeni tesis açmak
  // sanayiyi büyütmez, sadece boş fabrika sayar.
  if (laborFill(nation) < EXPANSION_FILL_FLOOR) return;
  const options = investmentOptions(game.world, nation);
  for (const option of options) {
    const region = regions.find((candidate) => canBuildFactory(
      game.world, nation, candidate.id, option.typeId,
    ));
    if (region && buildFactory(game, nation, region.id, option.typeId)) return;
  }
}
export function formatPopulation(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(Math.round(value));
}
