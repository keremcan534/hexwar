// Victoria tarzı nüfus, fabrika ve küresel piyasa katmanı.
// Arazi ekonomisi şehir bütçesinde kalır; bu dosya o üretimi dünya pazarında
// fiyatlanan mallara, sınıf gelirlerine ve sanayi kârına dönüştürür.

import { canAfford, pay } from './cities.js';
import { RGO_TYPES, provinceOutput, provincePopulation } from './provinces.js';
import { atWar } from './diplomacy.js';
import { treatiesOf } from './peace.js';
import { regimentCount } from './units.js';
import {
  canInvestInFactory, factoryInvestmentRules, fiscalPolicyLimits, policyOf,
} from './politics.js';
import {
  PROJECT_KIND, constructionAtlas, constructionPower, constructionTaxMultiplier,
  constructionUpkeep, ensureConstruction, fundProject, queueIndustryProject,
  universityWorkforceBonus,
} from './construction.js';

/**
 * Victoria 2'nin üretim zinciri. Mevcut kimlikler bilerek korundu (food =
 * Grain, groceries = Canned Food, tools = Machine Parts, clothes = Regular
 * Clothes, luxuries = Luxury Clothes): eski kayıtlar ve MILITARY_EQUIPMENT
 * bu id'lere bağlı, yeniden adlandırmak bütün dosyaları dolaşırdı.
 *
 * Zincir derinliği tasarımın özüdür: Kömür+Demir → Çelik → Makine Parçası →
 * Otomobil → Tank. Bir halkadaki kıtlık bütün üst katmanları yavaşlatır.
 */
export const GOODS = {
  // --- Hammadde (RGO) ---
  food: { id: 'food', name: 'Grain', icon: '🌾', basePrice: 2, category: 'raw' },
  fish: { id: 'fish', name: 'Fish', icon: '🐟', basePrice: 2, category: 'raw' },
  cattle: { id: 'cattle', name: 'Cattle', icon: '🐄', basePrice: 3, category: 'raw' },
  fruit: { id: 'fruit', name: 'Fruit', icon: '🍇', basePrice: 3, category: 'raw' },
  cotton: { id: 'cotton', name: 'Cotton', icon: '🌱', basePrice: 3, category: 'raw' },
  silk: { id: 'silk', name: 'Silk', icon: '🕸', basePrice: 12, category: 'raw' },
  timber: { id: 'timber', name: 'Timber', icon: '🪵', basePrice: 3, category: 'raw' },
  tropical_wood: { id: 'tropical_wood', name: 'Tropical Wood', icon: '🌴', basePrice: 8, category: 'raw' },
  rubber: { id: 'rubber', name: 'Rubber', icon: '⬤', basePrice: 6, category: 'raw' },
  iron: { id: 'iron', name: 'Iron', icon: '⛏', basePrice: 5, category: 'raw' },
  coal: { id: 'coal', name: 'Coal', icon: '◆', basePrice: 4, category: 'raw' },
  sulphur: { id: 'sulphur', name: 'Sulphur', icon: '🜍', basePrice: 6, category: 'raw' },
  oil: { id: 'oil', name: 'Oil', icon: '🛢', basePrice: 8, category: 'raw' },
  // Boya hem tarlada hem fabrikada üretilir (Vic2'de de öyledir).
  dye: { id: 'dye', name: 'Dye', icon: '🎨', basePrice: 6, category: 'raw' },

  // --- Ara mallar ---
  lumber: { id: 'lumber', name: 'Lumber', icon: '▬', basePrice: 5, category: 'industrial' },
  paper: { id: 'paper', name: 'Paper', icon: '📄', basePrice: 6, category: 'industrial' },
  fabric: { id: 'fabric', name: 'Fabric', icon: '🧶', basePrice: 6, category: 'industrial' },
  cement: { id: 'cement', name: 'Cement', icon: '⬛', basePrice: 8, category: 'industrial' },
  glass: { id: 'glass', name: 'Glass', icon: '🔷', basePrice: 6, category: 'industrial' },
  steel: { id: 'steel', name: 'Steel', icon: '▰', basePrice: 12, category: 'industrial' },
  tools: { id: 'tools', name: 'Machine Parts', icon: '⚙', basePrice: 18, category: 'industrial' },
  electric_gear: { id: 'electric_gear', name: 'Electric Gear', icon: '⚡', basePrice: 20, category: 'industrial' },
  fuel: { id: 'fuel', name: 'Fuel', icon: '⛽', basePrice: 10, category: 'industrial' },
  synthetic_oil: { id: 'synthetic_oil', name: 'Synthetic Oil', icon: '🧪', basePrice: 12, category: 'industrial' },
  fertilizer: { id: 'fertilizer', name: 'Fertilizer', icon: '🧫', basePrice: 8, category: 'industrial' },
  ammunition: { id: 'ammunition', name: 'Ammunition', icon: '🔩', basePrice: 10, category: 'industrial' },
  explosives: { id: 'explosives', name: 'Explosives', icon: '💥', basePrice: 14, category: 'industrial' },

  // --- Tüketim ---
  groceries: { id: 'groceries', name: 'Canned Food', icon: '🥫', basePrice: 6, category: 'consumer' },
  wine: { id: 'wine', name: 'Wine', icon: '🍷', basePrice: 10, category: 'consumer' },
  liquor: { id: 'liquor', name: 'Liquor', icon: '🥃', basePrice: 8, category: 'consumer' },
  clothes: { id: 'clothes', name: 'Regular Clothes', icon: '🧵', basePrice: 9, category: 'consumer' },
  furniture: { id: 'furniture', name: 'Furniture', icon: '▤', basePrice: 12, category: 'consumer' },
  telephone: { id: 'telephone', name: 'Telephone', icon: '☎', basePrice: 26, category: 'consumer' },
  radio: { id: 'radio', name: 'Radio', icon: '📻', basePrice: 24, category: 'consumer' },
  automobile: { id: 'automobile', name: 'Automobile', icon: '🚗', basePrice: 40, category: 'consumer' },

  // --- Lüks ---
  luxuries: { id: 'luxuries', name: 'Luxury Clothes', icon: '👗', basePrice: 30, category: 'luxury' },
  luxury_furniture: { id: 'luxury_furniture', name: 'Luxury Furniture', icon: '🪑', basePrice: 34, category: 'luxury' },

  // --- Askeri ---
  arms: { id: 'arms', name: 'Small Arms', icon: '⚔', basePrice: 16, category: 'military' },
  artillery: { id: 'artillery', name: 'Artillery Equipment', icon: '●', basePrice: 30, category: 'military' },
  tanks: { id: 'tanks', name: 'Tanks', icon: '🛡', basePrice: 60, category: 'military' },
  airplane: { id: 'airplane', name: 'Aeroplanes', icon: '✈', basePrice: 55, category: 'military' },
  clippers: { id: 'clippers', name: 'Clipper Convoys', icon: '⛵', basePrice: 20, category: 'military' },
  steamers: { id: 'steamers', name: 'Steamer Convoys', icon: '🚢', basePrice: 30, category: 'military' },
};

export const GOOD_IDS = Object.keys(GOODS);

/** Gubrenin besledigi kalemler (RGO_TYPES'taki 'agriculture' izi). */
const AGRICULTURE_GOODS = new Set(
  Object.values(RGO_TYPES).filter((r) => r.track === 'agriculture').map((r) => r.goodId),
);

/**
 * Tesisler. Girdi/çıktı oranları taban fiyatlarla tek tek hesaplandı: her
 * tesisin marjı başlangıçta pozitif ama dar. Kıtlık girdi fiyatını yükseltince
 * marj hızla eksiye döner — zincirin üst katmanları en kırılgan olanlardır.
 */
export const FACTORIES = {
  // --- Gıda ve içecek ---
  CANNERY: {
    id: 'CANNERY', name: 'Canned Food Factory', icon: '🥫',
    cost: { gold: 90 }, inputs: { food: 1.5, fish: 0.5, cattle: 0.5 }, outputs: { groceries: 1.5 },
  },
  WINERY: {
    id: 'WINERY', name: 'Winery', icon: '🍷',
    cost: { gold: 110 }, inputs: { fruit: 1.5, glass: 0.3 }, outputs: { wine: 0.9 },
  },
  DISTILLERY: {
    id: 'DISTILLERY', name: 'Distillery', icon: '🥃',
    cost: { gold: 100 }, inputs: { food: 1.5, glass: 0.3 }, outputs: { liquor: 1 },
  },

  // --- Orman ve tekstil ---
  LUMBER_MILL: {
    id: 'LUMBER_MILL', name: 'Lumber Mill', icon: '▬',
    cost: { gold: 90 }, inputs: { timber: 2 }, outputs: { lumber: 2 },
  },
  PAPER_MILL: {
    id: 'PAPER_MILL', name: 'Paper Mill', icon: '📄',
    cost: { gold: 100 }, inputs: { timber: 1.5 }, outputs: { paper: 1.2 },
  },
  FABRIC_MILL: {
    id: 'FABRIC_MILL', name: 'Fabric Mill', icon: '🧶',
    cost: { gold: 110 }, inputs: { cotton: 1.5, dye: 0.15 }, outputs: { fabric: 1.5 },
  },
  TEXTILE_MILL: {
    id: 'TEXTILE_MILL', name: 'Clothing Factory', icon: '🧵',
    cost: { gold: 120 }, inputs: { fabric: 1, dye: 0.1 }, outputs: { clothes: 1.2 },
  },
  LUXURY_WORKSHOP: {
    id: 'LUXURY_WORKSHOP', name: 'Luxury Clothes Workshop', icon: '👗',
    cost: { gold: 260 }, inputs: { silk: 0.5, clothes: 0.5 }, outputs: { luxuries: 0.5 },
  },
  FURNITURE_FACTORY: {
    id: 'FURNITURE_FACTORY', name: 'Furniture Manufactory', icon: '▤',
    cost: { gold: 150 }, inputs: { lumber: 1, timber: 0.5 }, outputs: { furniture: 0.8 },
  },
  LUXURY_FURNITURE_FACTORY: {
    id: 'LUXURY_FURNITURE_FACTORY', name: 'Luxury Furniture Factory', icon: '🪑',
    cost: { gold: 280 }, inputs: { tropical_wood: 0.5, furniture: 0.5 }, outputs: { luxury_furniture: 0.5 },
  },

  // --- Ağır sanayi ---
  STEEL_MILL: {
    id: 'STEEL_MILL', name: 'Steel Mill', icon: '▰',
    cost: { gold: 170 }, inputs: { iron: 1.5, coal: 1 }, outputs: { steel: 1.5 },
  },
  MACHINE_PARTS_FACTORY: {
    id: 'MACHINE_PARTS_FACTORY', availableFrom: 732, name: 'Machine Parts Factory', icon: '⚙',
    cost: { gold: 200 }, inputs: { steel: 1, coal: 0.5 }, outputs: { tools: 1 },
  },
  CEMENT_WORKS: {
    id: 'CEMENT_WORKS', name: 'Cement Works', icon: '⬛',
    cost: { gold: 120 }, inputs: { coal: 1.5 }, outputs: { cement: 1.2 },
  },
  GLASSWORKS: {
    id: 'GLASSWORKS', name: 'Glassworks', icon: '🔷',
    cost: { gold: 110 }, inputs: { coal: 1.5 }, outputs: { glass: 1.5 },
  },
  DYE_WORKS: {
    id: 'DYE_WORKS', name: 'Dye Works', icon: '🎨',
    cost: { gold: 110 }, inputs: { coal: 1 }, outputs: { dye: 1.2 },
  },
  ELECTRIC_GEAR_FACTORY: {
    id: 'ELECTRIC_GEAR_FACTORY', availableFrom: 1776, name: 'Electric Gear Factory', icon: '⚡',
    cost: { gold: 240 }, inputs: { coal: 1, rubber: 0.5, steel: 0.5 }, outputs: { electric_gear: 0.8 },
  },
  REFINERY: {
    id: 'REFINERY', availableFrom: 1776, name: 'Oil Refinery', icon: '⛽',
    cost: { gold: 190 }, inputs: { oil: 1.5 }, outputs: { fuel: 1.5 },
  },
  SYNTHETIC_OIL_PLANT: {
    id: 'SYNTHETIC_OIL_PLANT', availableFrom: 3341, name: 'Synthetic Oil Plant', icon: '🧪',
    cost: { gold: 220 }, inputs: { coal: 2 }, outputs: { synthetic_oil: 1 },
  },
  FERTILIZER_PLANT: {
    id: 'FERTILIZER_PLANT', name: 'Fertilizer Plant', icon: '🧫',
    cost: { gold: 130 }, inputs: { sulphur: 1 }, outputs: { fertilizer: 1.2 },
  },
  AMMUNITION_FACTORY: {
    id: 'AMMUNITION_FACTORY', name: 'Ammunition Factory', icon: '🔩',
    cost: { gold: 160 }, inputs: { sulphur: 0.8, iron: 0.5 }, outputs: { ammunition: 1 },
  },
  EXPLOSIVES_FACTORY: {
    id: 'EXPLOSIVES_FACTORY', name: 'Explosives Factory', icon: '💥',
    cost: { gold: 190 }, inputs: { sulphur: 0.6, ammunition: 0.5 }, outputs: { explosives: 0.8 },
  },

  // --- İleri sanayi ---
  TELEPHONE_FACTORY: {
    id: 'TELEPHONE_FACTORY', availableFrom: 2297, name: 'Telephone Factory', icon: '☎',
    cost: { gold: 300 }, inputs: { glass: 0.5, electric_gear: 0.5 }, outputs: { telephone: 0.6 },
  },
  RADIO_FACTORY: {
    id: 'RADIO_FACTORY', availableFrom: 3341, name: 'Radio Factory', icon: '📻',
    cost: { gold: 300 }, inputs: { glass: 0.5, electric_gear: 0.5 }, outputs: { radio: 0.65 },
  },
  AUTOMOBILE_FACTORY: {
    id: 'AUTOMOBILE_FACTORY', availableFrom: 3341, name: 'Automobile Factory', icon: '🚗',
    cost: { gold: 360 },
    inputs: {
      steel: 1, rubber: 0.5, electric_gear: 0.4, tools: 0.4,
    },
    outputs: { automobile: 0.9 },
  },

  // --- Askeri sanayi ---
  ARMS_FACTORY: {
    id: 'ARMS_FACTORY', name: 'Arms Industry', icon: '⚔',
    // The military-only Production screen must not depend on a second, hidden
    // industrial chain. Arms lines consume the raw market goods directly.
    cost: { gold: 210 }, inputs: { iron: 1.5, coal: 0.5 }, outputs: { arms: 1.25 },
  },
  TANK_FACTORY: {
    id: 'TANK_FACTORY', availableFrom: 4176, name: 'Tank Factory', icon: '🛡',
    cost: { gold: 420 },
    inputs: {
      steel: 1.5, electric_gear: 0.5, tools: 0.6, rubber: 0.4,
    },
    outputs: { tanks: 0.75 },
  },
  AIRCRAFT_FACTORY: {
    id: 'AIRCRAFT_FACTORY', availableFrom: 3654, name: 'Aeroplane Factory', icon: '✈',
    cost: { gold: 400 },
    inputs: {
      rubber: 0.6, steel: 0.8, tools: 0.7, electric_gear: 0.4,
    },
    outputs: { airplane: 0.7 },
  },
  CLIPPER_YARD: {
    id: 'CLIPPER_YARD', name: 'Clipper Shipyard', icon: '⛵',
    cost: { gold: 170 }, inputs: { fabric: 0.8, lumber: 1 }, outputs: { clippers: 0.6 },
  },
  STEAMER_YARD: {
    id: 'STEAMER_YARD', availableFrom: 732, name: 'Steamer Shipyard', icon: '🚢',
    cost: { gold: 320 }, inputs: { steel: 1, tools: 0.5, coal: 0.5 }, outputs: { steamers: 0.9 },
  },
};

/**
 * Sanayileşme 100 yıla yayılır. Fabrika *dikmek* bir haftalık karardır; onu
 * çalışır hale getirmek yılların işidir. İşe alım ayda bir ve fakir nüfusun
 * küçük bir oranı kadar olduğu için 1836'da açılan tesis ancak 1840'larda tam
 * kapasiteye ulaşır, tavan da oyun ortasından önce görülmez.
 *
 * Çıktı seviye başına normalize edilir (employees / WORKERS_PER_LEVEL), yani
 * bu sabiti değiştirmek mal dengesini bozmaz, yalnız sanayinin *hızını* değiştirir.
 */
export const WORKERS_PER_LEVEL = 2000;
export const HIRING_INTERVAL = 4;
// 0.0008 -> 0.0018: nüfus artışı Vic2 ölçeğine (yüzyılda ~2 kat) inince eski
// akış sanayiyi açlıktan öldürüyordu — doluluk 40. yılda %38'e düşmüştü.
// Sanayileşme artık doğum fazlasından değil, kırdan gelen göçten beslenir.
const MONTHLY_HIRE_RATE = 0.0018;
// Sanayi fakir nüfusun tamamını yutamaz: tarla ve maden de işçi ister.
const MAX_WORKER_SHARE = 0.4;

/**
 * Sermaye işe alamayacağı fabrikayı kurmaz. Bu eşiğin altında kadro doluluğu
 * olan ülke yeni tesis açmaz, önce eldekini doldurur.
 *
 * Eskiden tek koşul hazinede altın olmasıydı; sanayi işgücü akışının onlarca
 * katı hızda büyüyor, kadro %30'da takılıyordu (bkz. employment-diagnostic).
 * Sınır burada olunca doluluk kendiliğinden bu eşiğe oturur ve fabrika sayısı
 * işgücünün hızıyla artar.
 */
const EXPANSION_FILL_FLOOR = 0.7;
/** Bir birim throughput'un ücret maliyeti; kâr hesabıyla beklenen marj paylaşır. */
const WAGE_PER_THROUGHPUT = 1.2;

// Zarar eden fabrika işçi salar. Serbest kalan işgücü aynı ay kârlı olana akar.
const LAYOFF_RATE = 0.06;

/**
 * Aylık kârın kâr eğilimine katkısı (üstel hareketli ortalama). 0.25 ile
 * eğilim yaklaşık bir yıllık hafızaya sahip olur: tek kötü ay kadroyu
 * dağıtmaz, üst üste gelen zarar dağıtır.
 */
const PROFIT_TREND_WEIGHT = 0.25;

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
/**
 * Sınıfların 10.000 kişi başına haftalık geçim bütçesi.
 *
 * Üst sınıfın bütçesi 20'den 11'e indirildi. 20'de sepeti (taban fiyatlarla
 * ~5.4) o kadar rahat karşılıyordu ki vergi ancak %84'ün üstünde bir şey ifade
 * ediyordu: slider'ı çekmenin görünür etkisi yoktu. 11 ile eşikler anlamlı
 * yerlere düşer — ~%50 üzerinde yatırım sermayesi birikmez, ~%70 üzerinde
 * sınıf küçülmeye başlar. "Sanayiyi kim finanse edecek" böylece gerçek bir
 * tercih olur.
 */
const CLASS_NEEDS_BUDGET = { lower: 4, middle: 8, upper: 11 };

/**
 * Sınıfların tükettiği mallar. Zincir derinleştiği için sepetler de katmanlandı:
 * alt sınıf temel gıda ve giyim, orta sınıf dayanıklı tüketim ve iletişim, üst
 * sınıf lüks. Böylece üst katman fabrikaların (telefon, radyo, otomobil, lüks)
 * gerçek bir iç talebi olur — yoksa yalnız ihracat için üretilirlerdi.
 */
const CLASS_NEEDS = {
  lower: {
    food: 0.26, fish: 0.02, groceries: 0.07, clothes: 0.04, liquor: 0.02,
  },
  middle: {
    food: 0.2,
    groceries: 0.12,
    clothes: 0.08,
    furniture: 0.04,
    paper: 0.03,
    wine: 0.02,
    telephone: { amount: 0.012, from: 2297 },
    radio: { amount: 0.012, from: 3341 },
  },
  upper: {
    groceries: 0.15,
    clothes: 0.1,
    furniture: 0.07,
    wine: 0.05,
    luxuries: 0.05,
    luxury_furniture: 0.035,
    automobile: { amount: 0.02, from: 3341 },
    telephone: { amount: 0.02, from: 2297 },
  },
};

/**
 * Bir ihtiyacin o hafta gecerli miktari. Telefon/radyo/otomobil 1836'da
 * *talep edilemez*: hem tarihsel olarak yoklar hem de karsilanamayan talep
 * fiyatlarini kalici olarak tavana yapistiriyordu (olculdu: 80. turda 43
 * malin 30'u fiyat sinirinda takiliydi, hicbirinin fiyati oynamiyordu).
 */
function needAmount(need, turn) {
  if (typeof need === 'number') return need;
  return turn >= (need.from ?? 0) ? need.amount : 0;
}

const DEFAULT_TAXES = { lower: 20, middle: 15, upper: 10 };
const PRICE_SPEED = 0.09;

/**
 * Gümrüğün ithalat iştahını ne kadar kıstığı. %10 tarife iştahı ~%14, %50
 * tarife ~%44 düşürür. 0 olsaydı tarife yine yalnız bir vergi olurdu;
 * korumacılığın "koruyan" kısmı bu katsayıdır.
 */
export const IMPORT_ELASTICITY = 1.6;

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
  // Tank, ucak ve vapur da birer ekipman ailesidir: fabrika ciktilari dogrudan
  // askeri stoka akar ve ilgili birim tipi onlari tuketir. Boylece uretim
  // zincirinin ucu bos kalmaz (olculdu: tuketicisi olmayan mal fiyat tabaninda
  // cakili kaliyor ve onu ureten tesis surekli zarar ediyordu).
  tanks: {
    id: 'tanks', name: 'Tanks', icon: '🛡', stockCap: 12, defaultStock: 0,
    factoryRate: 0.35, importLimit: 0.6, reserve: 2,
  },
  airplane: {
    id: 'airplane', name: 'Aeroplanes', icon: '✈', stockCap: 12, defaultStock: 0,
    factoryRate: 0.4, importLimit: 0.7, reserve: 2,
  },
  steamers: {
    id: 'steamers', name: 'Steamer Convoys', icon: '🚢', stockCap: 16, defaultStock: 2,
    factoryRate: 0.6, importLimit: 1, reserve: 3,
  },
};
export const MILITARY_EQUIPMENT_IDS = Object.keys(MILITARY_EQUIPMENT);
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
    constructionCost: 0,
    treatyCost: 0,
    treatyRevenue: 0,
    outlayCost: 0,
    procurementCost: 0,
    subsidyCost: 0,
    projectCost: 0,
    interestCost: 0,
    borrowed: 0,
    repaid: 0,
    debt: 0,
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
  return 0.08 * (0.5 + (nation.economy.militaryProcurement ?? 100) / 200);
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
    game.turns.addLog(`Production line switched to ${MILITARY_EQUIPMENT[equipmentId].name}.`,
      { kind: 'INDUSTRY' });
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

/** Ülkedeki toplam fabrika kadrosu — meslek dağılımının gerçek talebi. */
export function industrialJobs(nation) {
  return (nation.economy?.factories ?? []).reduce(
    (sum, factory) => sum + (factory.jobs ?? factory.level * WORKERS_PER_LEVEL), 0,
  );
}

/** Mevcut tesislerin kadro doluluğu (0-1). Kadro yoksa 1: kısıt yok demektir. */
export function laborFill(nation) {
  const jobs = industrialJobs(nation);
  if (jobs <= 0) return 1;
  const employed = (nation.economy?.factories ?? []).reduce(
    (sum, factory) => sum + (factory.employees ?? 0), 0,
  );
  return employed / jobs;
}

function automaticProfession(nation, classId) {
  if (classId === 'lower') {
    // Yeni nüfus, fabrikaların *gerçekten* açık kadrosu varsa işçi olur.
    // Eskiden burada seviye sayısından türetilen bir tahmin vardı ve
    // professionCounts.workers ile factory.employees birbirinden bağımsız
    // sürükleniyordu: ekranda 300 bin işçi, meslek tablosunda 80 bin.
    const workers = nation.economy.professionCounts.workers ?? 0;
    return workers < industrialJobs(nation) ? 'workers' : 'farmers';
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

/**
 * Sınıf tavanları. Yukarı geçiş serbest bırakılırsa herkes zamanla üst sınıfa
 * çıkar ve alt sınıf (yani işgücü) erir; Victoria'da da bu oranlar dar kalır.
 */
const CLASS_CEILING = { middle: 0.34, upper: 0.11 };

/**
 * Refah yukarı taşır. Vergiden ve geçim masrafından *sonra* elinde kayda değer
 * artık kalan sınıf zamanla bir üst sınıfa geçer; eğitim harcaması bunu
 * hızlandırır. Eskiden yalnız düşüş vardı — vergi sıfır olsa bile kimse
 * yükselemiyordu, yani bütün refah politikaları tek yönlü çalışıyordu.
 */
function runPromotion(nation, mobility) {
  const economy = nation.economy;
  const counts = economy.professionCounts;
  const total = Math.max(1, economy.cohortPopulation);
  // Eğitim niteliği artırır: okullu nüfus daha kolay sınıf atlar.
  const schooling = 1 + socialLevel(nation, 'education') * 0.5;
  for (const [sourceClass, targetClass, key] of [
    ['lower', 'middle', 'promotedLower'],
    ['middle', 'upper', 'promotedMiddle'],
  ]) {
    const source = economy.classes[sourceClass];
    const target = economy.classes[targetClass];
    if (source.population < POPULATION_COHORT * 2) continue;
    // Tavana dayanmış sınıfa daha fazla insan çekilmez.
    if (target.population / total >= CLASS_CEILING[targetClass]) continue;
    // Yükselmenin şartı: hem geçimini karşılamak hem gerçek artık bırakmak.
    const surplus = (source.needsBudget ?? 0) - (source.needsCost ?? 0);
    const thriving = source.canAffordNeeds && surplus > (source.needsCost ?? 0) * 0.35
      && (source.satisfaction ?? 0) > 0.55;
    source.prosperityWeeks = thriving
      ? (source.prosperityWeeks ?? 0) + schooling
      : Math.max(0, (source.prosperityWeeks ?? 0) - 2);
    if (source.prosperityWeeks < 8) continue;
    const from = CLASS_PROFESSIONS[sourceClass]
      .filter((id) => counts[id] >= POPULATION_COHORT)
      .sort((a, b) => counts[b] - counts[a])[0];
    if (!from) continue;
    counts[from] -= POPULATION_COHORT;
    counts[automaticProfession(nation, targetClass)] += POPULATION_COHORT;
    mobility[key] = POPULATION_COHORT;
    source.prosperityWeeks = 0;
  }
}

export function runPopulationMobility(nation, turn) {
  ensurePopulationModel(nation);
  const economy = nation.economy;
  economy.mobility = {
    lastUpdated: turn,
    demotedUpper: 0,
    demotedMiddle: 0,
    promotedLower: 0,
    promotedMiddle: 0,
  };
  for (const classId of ['middle', 'upper']) {
    const socialClass = economy.classes[classId];
    socialClass.hardshipWeeks = socialClass.canAffordNeeds
      ? Math.max(0, (socialClass.hardshipWeeks ?? 0) - 2)
      : (socialClass.hardshipWeeks ?? 0) + 1;
  }
  if (turn % 4 !== 0) return economy.mobility;
  runPromotion(nation, economy.mobility);

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
    // Eski tek kaydıraç: yalnız geriye dönük kayıtlar için duruyor, hiçbir
    // sistem artık okumuyor (bkz. militaryWages / militaryProcurement).
    armySpending: 100,
    // Ordu bütçesi iki ayrı karardır: maaş (muharebe gücü, moral, toparlanma)
    // ve tedarik (devletin piyasadan fiilen satın aldığı mühimmat/yiyecek/
    // yakıt). Tek kaydıraç ikisini birden oynatıyordu ve "ordu güçlü ama
    // ikmalsiz" gibi bir durum kurulamıyordu.
    militaryWages: 100,
    militaryProcurement: 100,
    // Yönetim bütçesi: vergi tahsilat verimi ve province kontrol desteği.
    adminFunding: 100,
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

/**
 * Kuruluş sanayisi. 1836'da hiç fabrika olmayınca nüfusun istediği bütün
 * üretim malları sıfır arzla açılıyor ve fiyatları ilk yirmi haftada tavana
 * yapışıyordu; hammaddeler de alıcısız kalıp tabana iniyordu. Ölçüm: 80. turda
 * 43 malın 30'u fiyat sınırında takılıydı. Her ülke bu yüzden temel tüketim
 * zincirini kuran küçük bir çekirdekle başlar.
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
}

/**
 * Eski kayıtlar fabrikayı şehre bağlıyordu (cityId) ve seviye başına 18.000
 * işçi tutuyordu. Kare çapasına ve yeni kadroya taşı; şehir kaybolmuşsa
 * ülkenin herhangi bir karesine tuttur ki fabrika state'siz kalmasın.
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

export function ensureEconomy(world) {
  if (!world.market?.goods) initMarket(world);
  for (const id of GOOD_IDS) world.market.goods[id] ??= marketGood(id);
  for (const nation of world.nations) {
    if (!nation.economy) initNationEconomy(world, nation);
    // Eski kayıtlar sosyal harcama alanını tanımıyor; eksik alan çökertmesin.
    else nation.economy.social = { ...DEFAULT_SOCIAL, ...(nation.economy.social ?? {}) };
    // Eski kayıt göçü: tek armySpending kaydıracı iki yeni kaydırağa açılır,
    // oyuncunun ayarı iki tarafta da korunmuş olur. Yönetim varsayılan tam.
    nation.economy.militaryWages ??= nation.economy.armySpending ?? 100;
    nation.economy.militaryProcurement ??= nation.economy.armySpending ?? 100;
    nation.economy.adminFunding ??= 100;
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
    // Tanınmayan tür kayıttan düşer; çapası kurulamayan (toprağı kalmamış)
    // fabrika ise silinmez, yalnız state'siz kalır — kayıp veri sürprizi olmasın.
    nation.economy.factories = (nation.economy.factories ?? [])
      .filter((factory) => FACTORIES[factory.typeId]);
    for (const factory of nation.economy.factories) {
      ensureFactoryAnchor(world, nation, factory);
      ensureProductionLine(factory);
    }
  }
}

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
    if (!pay(nation, cost)) return false;
    // pay() tutari outlayGold'a yazdi; devlet fabrika yatirimi insaat
    // kalemidir — dogru satira tasinir (cifte sayim yok, aktarim).
    const gold = cost.gold ?? 0;
    if (gold && nation.economy) {
      nation.economy.outlayGold = Math.max(0, (nation.economy.outlayGold ?? 0) - gold);
      nation.economy.projectGold = (nation.economy.projectGold ?? 0) + gold;
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

/** O state'te aynı türde kurulmuş ya da kurulmakta olan tesis var mı. */
function industryTaken(world, nation, regionId, typeId) {
  const queued = ensureConstruction(nation).projects.some(
    (project) => project.kind === PROJECT_KIND.FACTORY
      && project.typeId === typeId && project.regionId === regionId,
  );
  return queued || factoriesInRegion(world, nation.id, regionId)
    .some((factory) => factory.typeId === typeId);
}

/** Tesis o tur kurulabilir mi? Otomobil fabrikasi 1836'da kurulamaz. */
export function factoryUnlocked(typeId, turn) {
  return (FACTORIES[typeId]?.availableFrom ?? 0) <= turn;
}

/** Sanayi hakki anlasmasi: baska ulkenin topraginda fabrika kurabilmek. */
export function industrialRightsOn(world, nation, ownerId) {
  if (nation.id === ownerId) return true;
  const owner = world.nations[ownerId];
  return treatiesOf(owner).some(
    (treaty) => treaty.type === 'FACTORY_RIGHTS' && treaty.partner === nation.id
      && (treaty.until ?? 0) > (world.turn ?? 0),
  );
}

export function canBuildFactory(world, nation, regionId, typeId, actor = 'state') {
  const type = FACTORIES[typeId];
  if (!type || !nation?.alive || !nation.economy) return false;
  if (!factoryUnlocked(typeId, world.turn ?? 1)) return false;
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
  queueIndustryProject(game, nation, {
    kind: PROJECT_KIND.FACTORY,
    typeId,
    regionId,
    regionName: region.name,
    q: region.center.q,
    r: region.center.r,
    work: Math.max(8, Math.round((cost.gold ?? 0) * WORK_PER_GOLD)),
    cost: cost.gold ?? 0,
    funded: actor === 'private' ? 0 : (cost.gold ?? 0),
    actor,
  });
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`${region.name}: ${type.name} started${actor === 'private' ? ' by private investors' : ''}.`,
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
        game.turns.addLog(`${FACTORIES[factory.typeId].name} reached level ${factory.level}.`,
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
      game.turns.addLog(`${FACTORIES[project.typeId].name} opened in ${project.regionName}.`,
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
    // Geçen haftanın ülke bazlı karşılanma oranı. Şimdilik yalnız kayıt:
    // fabrika girdisine bağlamak iki kez denendi ve geri alındı (bkz.
    // runFactories'teki not) — dünya arzı yapısal olarak kıtken her ülkeyi
    // kronik cezalandırıyordu. Arz sorunu çözülünce (RGO kapasitesi) erişim
    // cezası buradan yeniden kurulmalı.
    fulfilledShare: (previous[id]?.demand ?? 0) > 0
      ? clamp((previous[id].fulfilled ?? 0) / previous[id].demand, 0, 1)
      : 1,
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

/**
 * Province'lerin ham üretimi. Eskiden yalnız dört kalem (bütçeden food/timber/
 * iron, karelerden coal) pazara giriyordu; artık RGO tablosundaki her mal
 * doğrudan buradan akar, yoksa yeni hammaddeler hiç üretilmemiş olurdu.
 */
function rawProduction(world, nation, market) {
  const output = emptyGoods();
  // Gübre tarımı besler: sanayi → tarım yönünde tek bağ budur ve gübre
  // fabrikasına gerçek bir müşteri kazandırır. Geçen haftanın karşılanma
  // oranı kullanılır, bu haftaki pazar henüz temizlenmedi.
  const fertilizer = nation.economy.goodsFlow?.fertilizer;
  const fertilized = fertilizer?.demand > 0
    ? clamp((fertilizer.fulfilled ?? 0) / fertilizer.demand, 0, 1) : 0;
  const farmBonus = 1 + fertilized * 0.25;
  world.forEach((tile) => {
    if (tile.owner !== nation.id) return;
    const produced = provinceOutput(tile);
    const track = RGO_TYPES[tile.province?.rgo]?.track;
    for (const [id, amount] of Object.entries(produced)) {
      if (id === 'gold' || !GOODS[id] || !(amount > 0)) continue;
      output[id] += track === 'agriculture' ? amount * farmBonus : amount;
    }
  });
  // Talep, ekilen alana orantılı: büyük tarım ülkesi daha çok gübre ister.
  const farmland = Object.entries(output).reduce((sum, [id, amount]) => (
    AGRICULTURE_GOODS.has(id) ? sum + amount : sum), 0);
  // Katsayi 0.35'ten 0.06'ya: gubre verimi %25 artiran bir destektir, ekonominin
  // ana talep kalemi degil. 0.35'te tek basina 20+ birimlik karsilanamayan
  // talep yaratip fiyati tavana yapistiriyordu (olculdu: %2 karsilanma).
  if (farmland > 0) {
    const need = farmland * 0.06;
    addFlow(market, 'fertilizer', 'demand', need);
    addNationFlow(nation, 'fertilizer', 'demand', need);
  }
  // Kaynak imtiyazi: yenilen taraf ham uretiminin bir kismini galibe teslim
  // eder. Mal dunya pazarina *galip* adina girer, yani anlasma gercekten bir
  // tedarik zinciri kazanci saglar.
  const concession = treatiesOf(nation).find(
    (treaty) => treaty.type === 'CONCESSION' && (treaty.until ?? 0) > (world.turn ?? 0),
  );
  const holder = concession ? world.nations[concession.partner] : null;
  for (const [id, amount] of Object.entries(output)) {
    if (!(amount > 0)) continue;
    const shipped = holder?.alive ? amount * 0.2 : 0;
    if (shipped > 0) {
      output[id] -= shipped;
      addNationFlow(holder, id, 'production', shipped);
    }
    addFlow(market, id, 'supply', amount);
    addNationFlow(nation, id, 'production', amount - shipped);
  }
  return output;
}

/** Fabrikanın bu seviyede alabileceği toplam işçi. */
export function factoryJobs(factory) {
  return Math.max(0, (factory?.level ?? 0)) * WORKERS_PER_LEVEL;
}

export function factoryVacancies(factory) {
  return Math.max(0, factoryJobs(factory) - (factory?.employees ?? 0));
}

/** Tesis tam kadro çalışıyor; bir sonraki seviyeye hazır demektir. */
export function factoryAtCapacity(factory) {
  return factoryJobs(factory) > 0 && factory.employees + 1 >= factoryJobs(factory);
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
  if (actor === 'state' && !payFactoryCost(nation, cost, 'state')) return false;
  queueIndustryProject(game, nation, {
    kind: PROJECT_KIND.UPGRADE,
    typeId: factory.typeId,
    factoryId: factory.id,
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
 */
function fundPrivateProjects(nation) {
  const state = ensureConstruction(nation);
  for (const project of state.projects) {
    if (project.actor !== 'private' || project.funded >= project.cost) continue;
    const available = Math.max(0, nation.politics?.privateCapital ?? 0);
    if (available <= 0) break;
    nation.politics.privateCapital -= fundProject(project, available);
  }
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
  nation.gold -= paid;
  // Proje desteği inşaat kalemine yazılır (bkz. updateLedger projectCost).
  nation.economy.projectGold = (nation.economy.projectGold ?? 0) + paid;
  game.emit('construction', state);
  game.emit('economy', nation.economy);
  return true;
}

/**
 * Tesisin bir birim throughput için çıktı tablosu. Silah fabrikasının çıktısı
 * seçili üretim hattına bağlıdır, tabloya doğrudan bakmak yetmez.
 */
function factoryOutputs(factory, type) {
  if (factory.typeId !== 'ARMS_FACTORY') return type.outputs;
  const line = ensureProductionLine(factory);
  const equipment = MILITARY_EQUIPMENT[line.lineEquipment];
  return {
    [line.lineEquipment]:
      (type.outputs.arms ?? 1.25) * equipment.factoryRate * line.lineEfficiency,
  };
}

/**
 * Fiyatlara göre *beklenen* kâr marjı — `factoryMargin`in tesis düzeyindeki
 * karşılığı: oran döndürür, silah fabrikasının hat çıktısını ve ülkenin
 * gümrüğünü hesaba katar.
 *
 * Neden gerçekleşen marj yetmiyor: kadrosu olmayan tesiste `margin` her zaman
 * 0'dır. İşe alım sırası ona bakınca yeni kurulan çelik fabrikası hiç işçi
 * alamıyor, alamadığı için hiç üretmiyor, üretmediği için de marjını hiç
 * gösteremiyordu. Beklenen marj bu kısır döngüyü kırar.
 */
function expectedMargin(world, nation, factory) {
  const type = FACTORIES[factory.typeId];
  if (!type) return 0;
  let revenue = 0;
  for (const [id, amount] of Object.entries(factoryOutputs(factory, type))) {
    revenue += priceOf(world, id) * amount;
  }
  if (revenue <= 0) return 0;
  let cost = 0;
  for (const [id, amount] of Object.entries(type.inputs)) {
    const importShare = clamp(nation.economy.goodsFlow?.[id]?.importShare ?? 0, 0, 1);
    cost += priceOf(world, id) * amount * (1 + (nation.economy.tariff / 100) * importShare);
  }
  return (revenue - cost - WAGE_PER_THROUGHPUT) / revenue;
}

/**
 * Aylık işgücü akışı. Köyden fabrikaya geçiş nüfusun küçük bir oranı kadardır;
 * bu yüzden bir tesisin dolması yıllar alır ve sanayi 100 yıla yayılır.
 * Kârlılık akışı yönlendirir: zarar eden işçi salar, kârlı olan işe alır.
 */
function runFactoryEmployment(game, nation) {
  const economy = nation.economy;
  const factories = economy.factories ?? [];
  economy.industrialHiring = 0;
  economy.industrialLayoffs = 0;
  if (!factories.length) return;

  // İşten çıkarma da işe alımla aynı sinyale bakar. Eskiden alım ileriye
  // dönük beklenen marja, çıkarma tek ayın gerçekleşen kârına bakıyordu:
  // aynı tesis aynı ay hem "kârlı" diye doluyor hem "zararda" diye
  // boşalıyordu. Testere dişinin motoru buydu (ölçüldü: tepe-dip %20.9).
  for (const factory of factories) {
    // Kâr eğilimi: tek kötü ay kadroyu dağıtmasın, ısrarlı zarar dağıtsın.
    const previous = factory.profitTrend ?? factory.profit ?? 0;
    factory.profitTrend = previous * (1 - PROFIT_TREND_WEIGHT)
      + (factory.profit ?? 0) * PROFIT_TREND_WEIGHT;
    if (factory.profitTrend >= 0) continue;
    // Fiyatlar toparlanma vaat ediyorsa kadro daha uzun tutulur: işçi
    // yetiştirmek pahalıdır ve kapıda kuyruk yoktur. Veto değil fren —
    // girdisi kesilen tesis (beklenen marj olumlu ama üretim yok) sonsuza
    // kadar ücret ödemesin.
    const recovering = expectedMargin(game.world, nation, factory) > 0;
    // Zararın derinliğiyle orantılı çıkarma denendi ve GERİ ALINDI: kadroyu
    // koruduğu için sanayi büyüdü (100. yılda doluluk %69) ama hammadde
    // talebi arzı üçe katladı — arz/talep 0.74'ten 0.36'ya, tavandaki mal
    // 16'dan 22'ye çıktı. İstihdam ile piyasa aynı kısıttan besleniyor;
    // sanayiyi işgücü tarafından büyütmek arz sorununu yalnız taşıyor.
    const laid = factory.employees * LAYOFF_RATE * (recovering ? 0.25 : 1);
    factory.employees = Math.max(0, factory.employees - laid);
    economy.industrialLayoffs += laid;
  }

  // Eğitim ve üniversite işgücünü niteliklendirir: aynı nüfus daha hızlı akar.
  const schooling = 1 + socialLevel(nation, 'education') * 0.25
    + universityWorkforceBonus(nation);
  const lower = Math.max(0, economy.classes.lower.population);
  const employed = factories.reduce((sum, factory) => sum + factory.employees, 0);
  // Kırdan sanayiye geçiş: açık kadro varsa ayda bir kohort çiftçi işçiye
  // döner. Fabrika istihdamı artık bu havuzdan beslenir, havadan değil.
  const counts = economy.professionCounts;
  if ((counts.workers ?? 0) < industrialJobs(nation)
    && (counts.farmers ?? 0) >= POPULATION_COHORT) {
    counts.farmers -= POPULATION_COHORT;
    counts.workers += POPULATION_COHORT;
    syncClassPopulations(nation);
  }
  // Memnuniyetsiz nüfus fabrikaya akmaz; açlık sınırındaki işçi göç eder.
  const willingness = 0.65 + (economy.classes.lower.satisfaction ?? 0.6) * 0.5;
  const pool = Math.max(0, Math.min(
    lower * MONTHLY_HIRE_RATE * schooling * willingness,
    // Tavan artık soyut bir oran değil, gerçekten işçi olan nüfus.
    Math.min(counts.workers ?? 0, lower * MAX_WORKER_SHARE) - employed,
  ));
  if (pool <= 0) return;

  // Kârlı tesis önce dolar: piyasa sinyali istihdamı yönlendirir. Ölçüt
  // gerçekleşen değil beklenen marj (bkz. expectedMargin).
  const hiring = factories
    .filter((factory) => factoryVacancies(factory) > 0)
    .map((factory) => ({ factory, score: expectedMargin(game.world, nation, factory) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.factory);
  if (!hiring.length) return;

  // Havuz *sırayla* dağıtılır. Orantılı dağıtımda aylık kontenjan ülkedeki
  // bütün boş kadrolara bölünüyordu: yüz fabrikanın her birine ayda birkaç
  // işçi düşüyor, hiçbiri dolmuyor, marja göre yapılan sıralama da boşa
  // gidiyordu. Kıt işgücü önce en kârlı tesisi doldurur.
  let left = pool;
  for (const factory of hiring) {
    if (left <= 0) break;
    const hired = Math.min(left, factoryVacancies(factory));
    factory.employees += hired;
    economy.industrialHiring += hired;
    left -= hired;
  }

  for (const factory of factories) autoUpgradeFactory(game, nation, factory);
}

function runFactories(world, nation, market, ownOutput, inputAvailability) {
  const economy = nation.economy;
  let totalProfit = 0;
  let industrialOutput = 0;

  // Kentli işgücü province'e yazılır: provinces.js RGO çıktısını *kırsal*
  // nüfusla ölçer ve economy.js'i import edemez (katman döngüsü olurdu).
  // `factory.jobs` ile aynı kanal — veri nesne üzerinden taşınır.
  for (const factory of economy.factories) {
    const tile = world.get(factory.q, factory.r);
    if (tile?.province) {
      tile.province.industrialEmployees = 0;
      tile.province.industrialJobs = 0;
    }
  }
  for (const factory of economy.factories) {
    const tile = world.get(factory.q, factory.r);
    if (tile?.province) {
      tile.province.industrialEmployees += Math.max(0, factory.employees ?? 0);
      // Kapasite de yazılır: POP kohortları işçiyi işin OLDUĞU yere dağıtır,
      // dolu kadroya göre değil (bkz. population.js weightOf).
      tile.province.industrialJobs += Math.max(0, factoryJobs(factory));
    }
  }

  for (const factory of economy.factories) {
    const type = FACTORIES[factory.typeId];
    if (!type) continue;
    factory.employees = clamp(factory.employees, 0, factoryJobs(factory));
    // Kadro sayısı nesneye yazılır: provinces.js göç hesabında buna bakar ve
    // böylece economy.js'i import etmek (katman döngüsü) gerekmez.
    factory.jobs = factoryJobs(factory);
    const laborThroughput = factory.employees / WORKERS_PER_LEVEL;
    // Girdi kapısı küresel bolluktur. Ülke bazlı erişim cezası (fulfilledShare
    // ile min) iki kez denendi ve geri alındı: dünya arzı yapısal olarak kıt
    // olduğu için kronik kıtlıktaki HER ülke sürekli cezalanıyor, sanayi 40
    // yılda %52'den %31-35 doluluğa geriliyordu. O bağ, arz sorunu (RGO
    // kapasitesi) çözüldükten sonra yeniden denenmeli; tarifenin sanayiye
    // maliyeti şimdilik yalnız girdi fiyatı kanalından (aşağıda tariffFactor).
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
      // Tarife sanayiyi de bağlar: gümrük yalnız *ithal edilen* girdi payına
      // biner. Korumacılık yerli tedarik zincirini kayırır, serbest ticaret
      // ithal girdiyle çalışan fabrikayı ucuzlatır. Eskiden fabrikalar
      // girdisini her zaman dünya fiyatından alıyordu, yani ticaret politikası
      // sanayi için hiçbir şey ifade etmiyordu.
      const importShare = clamp(economy.goodsFlow?.[id]?.importShare ?? 0, 0, 1);
      const tariffFactor = 1 + (economy.tariff / 100) * importShare;
      inputCost += priceOf(world, id) * consumed * tariffFactor;
    }
    if (factory.typeId === 'ARMS_FACTORY') {
      const line = ensureProductionLine(factory);
      if (throughput > 0.05) line.lineEfficiency = Math.min(1, line.lineEfficiency + 0.025);
      line.lineOutput = 0;
    }
    const outputs = factoryOutputs(factory, type);
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
    const wages = laborThroughput * WAGE_PER_THROUGHPUT;
    factory.profit = revenue - inputCost - wages;
    // Sübvansiyon: işaretli tesisin zararını devlet kapatır. Sahte sabit
    // maliyet yok — ödeme gerçekleşen zararın kendisidir ve kâr 0'a çekilir
    // ki kâr eğilimi (işten çıkarma) tesisi desteklenmiş görsün. Bedel
    // deftere subsidyCost olarak düşer; kapatmak tek tık (bkz. ekran).
    factory.subsidyPaid = 0;
    if (factory.subsidized && factory.profit < 0) {
      const support = -factory.profit;
      nation.gold -= support;
      economy.subsidyGold = (economy.subsidyGold ?? 0) + support;
      factory.subsidyPaid = support;
      factory.profit = 0;
    }
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
    let basketAtBase = 0;
    for (const [goodId, need] of Object.entries(needs)) {
      const amount = needAmount(need, world.turn ?? 1);
      if (amount <= 0) continue;
      const quantity = amount * scale;
      addFlow(market, goodId, 'demand', quantity);
      addNationFlow(nation, goodId, 'demand', quantity);
      // Tariffs only raise the imported share of a household basket. Last
      // week's share is used because this week's trade clears after all
      // nations have submitted supply and demand.
      const importShare = clamp(economy.goodsFlow?.[goodId]?.importShare ?? 0, 0, 1);
      const tariffFactor = 1 + (economy.tariff / 100) * importShare;
      basket += priceOf(world, goodId) * quantity * tariffFactor;
      basketAtBase += GOODS[goodId].basePrice * quantity;
    }
    // Ücretler fiyatları kısmen takip eder. Etmezse: geçim bütçesi sabit bir
    // sayı, geçim masrafı ise fiyatla 8 katına çıkabilen bir sayı olur ve ilk
    // ciddi kıtlıkta bütün sınıflar iflas eder. Ölçüldü: üst sınıf tamamen
    // yok oluyor, dolayısıyla kapitalist ve özel sermaye de kalmıyordu.
    // Katsayı 1 değil 0.6: enflasyon hâlâ acıtır, ama yok etmez.
    const priceLevel = basketAtBase > 0 ? basket / basketAtBase : 1;
    const wageIndex = 1 + (priceLevel - 1) * 0.6;
    const taxRate = economy.taxes[classId] / 100;
    const needsBudget = scale * Math.max(0.35, wageIndex) * CLASS_NEEDS_BUDGET[classId]
      * (1 - taxRate) * (1 + welfare * 0.22);
    // Refah sepetin bir kısmını devlet cebinden öder; parası zaten
    // socialSpendingCost ile hazineden çıkıyor. Bu bağ yokken sosyal harcama
    // memnuniyeti DÜŞÜRÜYORDU (0.50 -> 0.46, ölçüldü): para gidiyor, sepete
    // hiç dokunmuyor, ekonomiyi ısıtıp fiyatları yukarı itiyordu. Kademe
    // sınıfa göre: yoksul en çok yararlanır, aristokrasiye sosyal yardım yok.
    const reliefRate = classId === 'lower' ? 0.35 : classId === 'middle' ? 0.12 : 0;
    const outOfPocket = basket * (1 - welfare * reliefRate);
    const affordability = 1 / (1 + outOfPocket / Math.max(1, scale * 2.5));
    socialClass.needsCost = outOfPocket;
    socialClass.needsBudget = needsBudget;
    // Sepet tam yaşam standardını temsil eder; sınıf bunun temel %60'ını dahi
    // karşılayamıyorsa durum sınıf düşüşüne dönüşür. Lüks açığı memnuniyeti
    // azaltır fakat tek başına aristokrasiyi birkaç ayda yok etmez.
    socialClass.canAffordNeeds = needsBudget + 0.01 >= outOfPocket * 0.6;
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
  // Tahsilat verimi yönetim bütçesine bağlıdır: %100'te tam, %30'da %68.
  // Gizli ceza değil — bütçe ekranı bu oranı açıkça gösterir.
  taxes *= taxEfficiency(nation);
  const construction = constructionUpkeep(nation);
  economy.taxRevenue = taxes;
  // Trade is cleared after every country has submitted its weekly orders.
  // Tariff income is applied by settleGlobalTrade so domestic consumption is
  // never taxed as an import.
  economy.tariffRevenue = 0;
  economy.socialCost = social;
  economy.constructionUpkeep = construction;
  economy.fiscalNet = taxes - social - construction;
  // Kelepçe yok: açık görünür kalır, kapanışta borçlanma devralır (settleDebt).
  nation.gold += economy.fiscalNet;
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

/**
 * Yatırım yapılacak state'ler: kârlı türü henüz kurulmamış, kalabalık olan
 * önce gelir. Seviye atlatma burada yok — o kadro dolunca kendiliğinden olur.
 */
function investmentTargets(world, nation) {
  return constructionAtlas(world, nation.id).regions
    .sort((a, b) => b.population - a.population);
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
function adjustFiscalAI(nation) {
  const economy = nation.economy;
  const weekly = (nation.budget?.net?.gold ?? 0) + economy.fiscalNet;
  const broke = nation.gold < 80 || weekly < 0;
  const rich = nation.gold > 600 && weekly > 0;
  if (broke || rich) {
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
      // Tavanlar düşük tutuldu: yüksek vergi sınıfı eritir (bkz. CLASS_NEEDS_BUDGET).
      const limit = classId === 'lower' ? 35 : classId === 'middle' ? 42 : 45;
      const next = clamp(current + step, 5, limit);
      if (next !== current) { economy.taxes[classId] = next; break; }
    }
  }
  // Korumacı hükümet sanayisini kollar, serbest ticaretçi gümrüğü SIFIRA
  // indirir — tabana değil. Taban artık −50 (ithalat sübvansiyonu) ve oraya
  // sürüklenen YZ hazinesini kalıcı olarak ithalata akıtıyordu.
  const limits = fiscalPolicyLimits(nation);
  const wanted = policyOf(nation, 'trade') === 'protectionism' ? limits.tariffMax : 0;
  const drift = Math.sign(wanted - economy.tariff) * 2;
  if (drift) economy.tariff = clamp(economy.tariff + drift, limits.tariffMin, limits.tariffMax);

  adjustWarFiscalAI(nation);
}

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
    // Önce isteğe bağlı harcamalar: sübvansiyonlar kapanır, sosyal kısılır,
    // tedarik tabana iner. Vergi tarafını mevcut "broke" dalı zaten sıkıyor.
    for (const factory of economy.factories ?? []) factory.subsidized = false;
    for (const programId of Object.keys(economy.social ?? {})) {
      const level = economy.social[programId] ?? 0;
      if (level > 0) setFiscalPolicy(nation, 'social', level - 10, programId);
    }
    drift('militaryProcurement', wartime ? 60 : 40);
    drift('militaryWages', wartime ? limits.armySpendingMax : 60);
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
  // Açık projeler politikadan bağımsız beslenir. Aksi halde seçim ekonomiyi
  // planlıya çevirdiğinde önceki hükümetten kalan şantiyeler kuyrukta sonsuza
  // kadar yarım kalırdı.
  fundPrivateProjects(nation);
  const rules = factoryInvestmentRules(nation);
  if (!rules.privateBuild) return;
  const economy = nation.economy;
  const regions = investmentTargets(game.world, nation);
  if (!regions.length) return;
  // Kapitalistler sınırsız şantiye açmaz; açık proje varken yenisine girmez.
  const openPrivate = ensureConstruction(nation).projects.filter(
    (project) => project.actor === 'private',
  ).length;
  if (openPrivate >= 2) return;

  const options = investmentOptions(game.world, nation);
  for (const option of options) {
    const region = regions.find((candidate) => canBuildFactory(
      game.world, nation, candidate.id, option.typeId, 'private',
    ));
    if (!region) continue;
    if (buildFactory(game, nation, region.id, option.typeId, { actor: 'private' })) {
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
  const regions = investmentTargets(game.world, nation);
  if (!regions.length) return;
  // Maliye YZ'sinin savaş/barış kararı için: economy dünyayı bilmez, bağ
  // burada kurulur.
  economy.atWarCache = game.world.nations.some(
    (other) => other.alive && other.id !== nation.id
      && atWar(game.world, nation.id, other.id),
  );
  adjustSocialAI(nation);
  adjustFiscalAI(nation);

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

function procureStrategicGoods(world) {
  // Tablodan türetilir. Elle yazılan iki kalemlik liste, tank/uçak/vapur
  // eklenince onlar için `undefined` döndürüyor ve hazineyi NaN yapıyordu.
  const available = Object.fromEntries(MILITARY_EQUIPMENT_IDS.map(
    (id) => [id, world.market.goods[id]?.supply ?? 0],
  ));
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    nation.economy.importCost = 0;
    const military = ensureMilitaryEconomy(nation);
    for (const id of MILITARY_EQUIPMENT_IDS) {
      const equipment = MILITARY_EQUIPMENT[id];
      military[`${id}Imported`] = 0;
      // Tedarik kaydırağı ithalat hedefini de ölçekler: %50 fonlanan ordu
      // yarım depoyla idare etmeye çalışır, hazine de yarım öder.
      const procurement = (nation.economy.militaryProcurement ?? 100) / 100;
      const target = Math.min(
        equipment.stockCap,
        (equipment.reserve + Math.min(
          equipment.stockCap - equipment.reserve,
          military[`${id}Demand`] ?? 0,
        )) * procurement,
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
      const deficit = Math.max(0, flow.demand - domestic);
      // Gümrük ithalat iştahını kısar. Bu bağ yokken tarife ölü bir kaldıraçtı:
      // ticaret saf fiziksel eşleşmeydi, %0 ile %50 arasında ithalat MİKTARI
      // %0.9 oynuyordu (ölçüldü, bkz. mechanics-audit). Korumacılık artık
      // gerçekten koruyor; bedeli de gerçek — karşılanmayan talep büyüyor.
      const appetite = 1 / (1 + (nation.economy.tariff / 100) * IMPORT_ELASTICITY);
      return {
        nation,
        flow,
        domestic,
        surplus: Math.max(0, marketProduction - domestic),
        deficit,
        bid: deficit * appetite,
      };
    });
    const totalSurplus = rows.reduce((sum, row) => sum + row.surplus, 0);
    const totalBid = rows.reduce((sum, row) => sum + row.bid, 0);
    const crossBorderTrade = Math.min(totalSurplus, totalBid);

    for (const row of rows) {
      const { nation, flow } = row;
      flow.domestic = row.domestic;
      flow.exports = totalSurplus > 0 ? row.surplus * crossBorderTrade / totalSurplus : 0;
      flow.imports = totalBid > 0 ? row.bid * crossBorderTrade / totalBid : 0;
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
    // Goods are paid for by households and firms. Only the tariff is a
    // treasury flow; keeping that distinction prevents exports from becoming
    // a magic state-money exploit. Tahsilat tamdır: eski 0.12 katsayısı
    // geliri öldürüyordu (%50 tarife haftada 0.15 altın topluyordu, ölçüldü)
    // ve hane sepetine binen gümrük bedeli hazineye hiç ulaşmıyordu.
    trade.tariffRevenue = trade.importValue * (nation.economy.tariff / 100);
    trade.lastUpdated = world.turn;
    nation.economy.tariffRevenue = trade.tariffRevenue;
    nation.economy.fiscalNet += trade.tariffRevenue;
    nation.gold += trade.tariffRevenue;
  }
}

function marketInputAvailability(market) {
  const hasHistory = (market.lastUpdated ?? 0) > 0;
  return Object.fromEntries(Object.entries(market.goods).map(([id, state]) => {
    if (!hasHistory || state.demand <= 0) return [id, 1];
    return [id, clamp(state.supply / state.demand, 0, 1)];
  }));
}

/**
 * Borçlanma kapasitesi: yıllık gelirin ~yarısı. GSYH değil gelir esas alınır
 * çünkü faizi ödeyecek olan hazinedir; zengin ama vergisiz ülke borç bulamaz.
 */
export function debtCapacity(nation) {
  const weekly = Math.max(0, nation.economy?.ledger?.income ?? 0);
  return Math.max(50, weekly * 26);
}

/** Yıllık faiz: taban %4, kapasite doldukça %12'ye tırmanır. */
export function debtInterestRate(nation) {
  const debt = Math.max(0, nation.debt ?? 0);
  const load = clamp(debt / Math.max(1, debtCapacity(nation)), 0, 1);
  return 0.04 + 0.08 * load;
}

/**
 * Hazine kapanışı: faiz tahakkuk eder, açık borçlanmayla kapanır, bolluk
 * borcu geri öder. Sıfırda oyun bitmez — devlet borçlanır ve faiz bütçeye
 * gider olarak düşer; kapasite dolunca hazine eksiye sıkışır ve harcama
 * kapıları (canAfford) kendiliğinden kapanır.
 */
function settleDebt(nation) {
  const economy = nation.economy;
  nation.debt = Math.max(0, nation.debt ?? 0);
  const interest = nation.debt * debtInterestRate(nation) / 52;
  nation.gold -= interest;
  economy.interestGold = interest;
  economy.borrowedGold = 0;
  economy.repaidGold = 0;

  if (nation.gold < 0) {
    const room = Math.max(0, debtCapacity(nation) - nation.debt);
    const borrow = Math.min(-nation.gold, room);
    nation.debt += borrow;
    nation.gold += borrow;
    economy.borrowedGold = borrow;
  } else if (nation.debt > 0 && nation.gold > DEBT_CUSHION) {
    // Geri ödeme otomatik ve ılımlı: hazine yastığın üstündeyse fazlanın
    // çeyreği borca gider. Oyuncu isterse bütçeyi sıkıp hızlandırır.
    const repay = Math.min(nation.debt, (nation.gold - DEBT_CUSHION) * 0.25);
    nation.debt -= repay;
    nation.gold -= repay;
    economy.repaidGold = repay;
  }
}

/** Geri ödemeye başlamadan önce hazinede tutulan yastık. */
const DEBT_CUSHION = 25;

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
  // Barış anlaşmalarının para tarafı: ödenen tazminat/haraç gider, alınan gelir.
  const treatyCost = Math.max(0, economy.treatyCost ?? 0);
  const treatyRevenue = Math.max(0, economy.treatyRevenue ?? 0);
  // Haftanın tek seferlik alımları (birim, şehir, general, proje desteği).
  // Biriktirme satın alma anında yapılır (bkz. cities.js pay); burada okunur
  // ve sıfırlanır ki her hafta yalnız kendi harcamasını göstersin.
  const outlayCost = Math.max(0, economy.outlayGold ?? 0);
  economy.outlayGold = 0;
  // Askeri tedarik: alıkonan teçhizat + ordunun haftalık tüketimi, piyasa
  // fiyatından. armyCost yalnız MAAŞTIR; ikisini ayırmak "ordu neden pahalı"
  // sorusunun cevabını ekranda görünür kılar.
  const procurementCost = Math.max(0, economy.procurementGold ?? 0);
  economy.procurementGold = 0;
  const subsidyCost = Math.max(0, economy.subsidyGold ?? 0);
  economy.subsidyGold = 0;
  // Devlet insaat/fabrika fonlamasi tek seferlik alimlardan ayri gosterilir:
  // "State purchases" birim/sehir/general, "Project funding" santiyedir.
  const projectCost = Math.max(0, economy.projectGold ?? 0);
  economy.projectGold = 0;
  // Borç kapanışı gelir/gider bilinmeden ÖNCE koşamaz (kapasite gelire
  // bakar) ama defter yazılmadan önce koşmalı ki faiz ve finansman satırları
  // bu haftanın kaydına girsin.
  settleDebt(nation);
  const interestCost = Math.max(0, economy.interestGold ?? 0);
  // 52 haftalık hazine izi: bütçe ekranındaki grafik buradan çizilir.
  economy.treasuryHistory ??= [];
  economy.treasuryHistory.push(Number(nation.gold.toFixed(1)));
  if (economy.treasuryHistory.length > 52) economy.treasuryHistory.shift();
  const income = cityRevenue + (economy.taxRevenue ?? 0)
    + Math.max(0, tariffRevenue) + treatyRevenue;
  const expenses = armyCost + administrationCost + socialCost + importCost
    + constructionCost + treatyCost + outlayCost + procurementCost
    + subsidyCost + projectCost + interestCost + Math.max(0, -tariffRevenue);
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
    treatyCost,
    treatyRevenue,
    outlayCost,
    procurementCost,
    subsidyCost,
    projectCost,
    interestCost,
    // Finansman satırları gelir/gider DEĞİLDİR (bilanço hareketi): kimlik
    // Δhazine = net + borçlanılan − ödenen şeklinde kapanır.
    borrowed: economy.borrowedGold ?? 0,
    repaid: economy.repaidGold ?? 0,
    debt: nation.debt ?? 0,
    income,
    expenses,
    net: income - expenses,
  };
}

/** Fiyat grafiginin tuttugu ornek sayisi (haftalik). */
export const PRICE_HISTORY = 60;

function updatePrices(market) {
  let totalGdp = 0;
  for (const [id, state] of Object.entries(market.goods)) {
    const base = GOODS[id].basePrice;
    state.previousPrice = state.price;
    // Gecmis, ticaret ekranindaki grafik icin tutulur; sabit uzunlukta bir
    // halka, kayit boyutunu buyutmesin diye kisa.
    state.history ??= [];
    state.history.push(Number(state.price.toFixed(3)));
    if (state.history.length > PRICE_HISTORY) state.history.shift();
    const total = Math.max(1, state.supply + state.demand);
    const imbalance = (state.demand - state.supply) / total;
    // Band 0.25-4'ten 0.12-8'e genisletildi. Zincir 12 maldan 43'e cikinca
    // kitlik ve bolluk cok daha keskin oluyor; dar bandda fiyatlar raya yapisip
    // hic hareket etmiyordu (olculdu: 80. turda 43 maldan yalniz 1'i oynuyordu).
    state.price = clamp(state.price * (1 + imbalance * PRICE_SPEED), base * 0.12, base * 8);
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
    // Geçen haftanın inşaat kuyruğunda biten tesisler önce gerçeğe dönüşür.
    commitCompletedProjects(game, nation);
    resetNationGoodsFlow(nation);
    updateClasses(world, nation);
    const ownOutput = emptyGoods();
    const raw = rawProduction(world, nation, market);
    for (const [id, amount] of Object.entries(raw)) ownOutput[id] += amount;
    const baseOutputValue = Object.entries(raw)
      .reduce((sum, [id, amount]) => sum + priceOf(world, id) * amount, 0);
    const industrialOutput = runFactories(world, nation, market, ownOutput, inputAvailability);
    // İşe alım ve seviye atlama aylıktır: bu haftanın kârı görüldükten sonra,
    // dört haftada bir. Sanayinin 100 yıla yayılmasını sağlayan tempo budur.
    if ((world.turn ?? 1) % HIRING_INTERVAL === 0) runFactoryEmployment(game, nation);
    const military = ensureMilitaryEconomy(nation);
    // Stok yatırımının haftalık bütçesi: geçen haftanın gelirinin çeyreği ×
    // tedarik kaydırağı. Sınırsız hızda stoklama, kuruluş yıllarında bütün
    // ülkeleri borç tavanına yığıyordu (ölçüldü: 53. haftada 12/15 ülke
    // kapasitede, ortalama hazine −652). Bütçeyi aşan üretim depoya değil
    // piyasaya gider — silahlanma bir on yıla yayılır, bir yıla değil.
    let retainedBudget = Math.max(2, (nation.economy.ledger?.income ?? 20) * 0.25)
      * ((nation.economy.militaryProcurement ?? 100) / 100);
    for (const id of MILITARY_EQUIPMENT_IDS) {
      const equipment = MILITARY_EQUIPMENT[id];
      const factoryOutput = Math.max(0, ownOutput[id] ?? 0);
      // Small Arms has a minimal workshop floor so a nation cannot become
      // permanently unable to field an army before its first military factory.
      const workshopOutput = id === 'arms' ? workshopArmsOutput(nation) : 0;
      const room = Math.max(0, equipment.stockCap - equipmentStock(nation, id));
      const price = Math.max(0.01, priceOf(world, id));
      const affordable = retainedBudget / price;
      const retainedFactory = Math.min(factoryOutput, room, affordable);
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
      // Devlet fabrika çıktısını artık BEDAVA almaz: alıkonan teçhizat piyasa
      // fiyatından hazineden ödenir. Fabrika bu geliri zaten yazıyordu
      // (runFactories bütün çıktıyı fiyatlandırır) ama karşısında hiçbir
      // ödeme yoktu — bütçe ile sanayi arasındaki delik buydu.
      const retainedCost = retainedFactory * price;
      nation.gold -= retainedCost;
      retainedBudget = Math.max(0, retainedBudget - retainedCost);
      nation.economy.procurementGold = (nation.economy.procurementGold ?? 0) + retainedCost;
    }
    populationDemand(world, nation, market);

    // Çimento şantiyeye gider: inşaat kuyruğunda o hafta yapılan iş kadar
    // talep doğar. Çimento fabrikasının tek müşterisi budur ve aynı zamanda
    // sanayileşme ile inşaat sistemi arasındaki ikinci bağdır.
    const buildWork = ensureConstruction(nation).projects.reduce(
      (sum, project) => sum + Math.min(
        constructionPower(nation),
        Math.max(0, project.work - project.progress),
      ), 0,
    );
    if (buildWork > 0) {
      const cementNeed = Math.min(buildWork, constructionPower(nation)) * 0.06;
      addFlow(market, 'cement', 'demand', cementNeed);
      addNationFlow(nation, 'cement', 'demand', cementNeed);
    }

    const landUnits = world.units
      .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land')
      .reduce((sum, unit) => sum + regimentCount(unit), 0);
    // Ordunun haftalık tüketimi. Mühimmat ve yakıt buraya eklendi: onları
    // üreten tesisler kuruluyordu ama hiçbir tüketicisi olmadığı için fiyat
    // tabana çakılıp fabrikalar zarar ediyordu (ölçüldü).
    // Tedarik kaydiragi devletin orduya ne kadar mal aldigini belirler;
    // grocery kalemi de artik olceklenir (ac orduyu az beslemek bir karardir).
    const armyScale = (nation.economy.militaryProcurement ?? 100) / 100;
    // Barış ordusu talim tüketir, savaş ordusu cephane yakar. Bu çarpan
    // olmadan tedarik faturası barışta bile geliri ikiye katlıyordu (ölçüldü:
    // ~100/hafta gider, ~35 gelir) ve her hazine kalıcı sıfırdaydı. Savaşın
    // "ne kadarını karşılayabilirim" sorusu tam bu farktan doğar.
    const wartime = world.nations.some(
      (other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id),
    );
    const tempo = wartime ? 1 : 0.35;
    const armyDemand = {
      arms: landUnits * 0.08 * armyScale * tempo,
      groceries: landUnits * 0.05 * (0.5 + armyScale * 0.5) * tempo,
      ammunition: landUnits * 0.06 * armyScale * tempo,
      fuel: landUnits * 0.04 * armyScale * tempo,
    };
    // Hazırlık, ordunun TAM ihtiyacına göre ölçülür (tedarik kaydıracından
    // bağımsız payda). Kısılmış talebe göre ölçülünce %25 tedarik "daha iyi
    // ikmal" görünüyordu: az isteyen, istediğinin çoğunu alıyor (ölçüldü,
    // TERS). Az almak ordunun ihtiyacını küçültmez.
    const fullDemand = {
      arms: landUnits * 0.08 * tempo,
      groceries: landUnits * 0.05 * tempo,
      ammunition: landUnits * 0.06 * tempo,
      fuel: landUnits * 0.04 * tempo,
    };
    let armySupplyWeighted = 0;
    let armySupplyTotal = 0;
    for (const [id, amount] of Object.entries(armyDemand)) {
      addFlow(market, id, 'demand', amount);
      addNationFlow(nation, id, 'demand', amount);
      // Ordunun tükettiğini devlet öder: geçen haftanın karşılanma oranı
      // üzerinden (bu haftanın ticareti daha kapanmadı). Karşılanmayan pay
      // ödenmez ama ikmal endeksini düşürür.
      const fulfilled = clamp(nation.economy.goodsFlow?.[id]?.fulfilledShare ?? 1, 0, 1);
      const consumptionCost = amount * fulfilled * priceOf(world, id);
      nation.gold -= consumptionCost;
      nation.economy.procurementGold = (nation.economy.procurementGold ?? 0) + consumptionCost;
      armySupplyWeighted += fulfilled * amount;
      armySupplyTotal += fullDemand[id] ?? amount;
    }
    // İkmal endeksi: EMA (~7 hafta yarı ömür) tek kötü haftayı değil
    // süregiden kıtlığı cezalandırır; takviye ve toparlanma bunu okur.
    const weekSupply = armySupplyTotal > 0
      ? clamp(armySupplyWeighted / armySupplyTotal, 0, 1) : 1;
    military.supplyIndex = clamp(
      (military.supplyIndex ?? 1) * 0.85 + weekSupply * 0.15, 0, 1,
    );

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
