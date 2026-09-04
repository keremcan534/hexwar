// Victoria tarzı nüfus, fabrika ve küresel piyasa katmanı.
// Arazi ekonomisi şehir bütçesinde kalır; bu dosya o üretimi dünya pazarında
// fiyatlanan mallara, sınıf gelirlerine ve sanayi kârına dönüştürür.

import { canAfford, pay } from './cities.js';
import { POPULATION_SCALE } from './populationScale.js';
import {
  RGO_TYPES, provinceOutput, provincePopulation, provinceSoldiers, rgoJobsOf,
} from './provinces.js';
import { delegationActive, noteDelegated } from './delegation.js';
import { atWar } from './diplomacy.js';
import { controllerOf } from './control.js';
import {
  PROGRAMMES, abandonProgramme, adoptProgramme, advanceResearch, ensureResearch,
  nextTechFor, programmeFloorOf, programmeLapsed, programmeOf, refreshDiffusion,
  refreshTechModifiers, researchPointsOf, scoreProgrammes, startResearch, techById,
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
import {
  LEDGER_LINES, closeWeek, emptyLedger, openWeek, settle, settleAffordable,
  weekTotals,
} from './treasury.js';

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

/**
 * SEPETIN GIDA YARISI. Hane parasi yetmedigi zaman once bunlari alir.
 *
 * Bu ayrim olmadan model soyle davraniyordu: sepetin karsilanma orani TEK bir
 * sayiydi (`needsMet`) ve nufus buyumesi onu okuyordu — yani sarap ya da
 * telefon alamayan ulke ACLIKTAN oluyordu. Victoria'da boyle bir sey yok;
 * karsilanmayan ihtiyac nufusu oldurmez, sinif atlamayi ve buyumeyi yavaslatir.
 *
 * `tradeLedger.js` ayni kumeyi zaten bagimlilik hesabinda kullaniyor.
 */
export const FOOD_GOODS = new Set(['food', 'fish', 'cattle', 'fruit', 'groceries']);

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
    // Cikti artik dogrudan yakit: eski `synthetic_oil` mali hicbir tuketiciye
    // baglanmamisti ve bosluga uretiliyordu (olculdu: 300 turda ne uretim ne
    // talep). Tesisin stratejik anlami korunur — petrolsuz ulke komurden
    // yakit yapar — ama zincir gercek tuketiciye (ordu yakiti) baglanir.
    cost: { gold: 220 }, inputs: { coal: 2 }, outputs: { fuel: 0.8 },
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
    // Askeri uretim hatti ikinci bir gizli sanayi zincirine dayanmamali
    // (bkz. Logistics ekranindaki hat secimi): hat ham pazar mallarini
    // dogrudan tuketir.
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
// Nufus olcegiyle carpilir: kadro nufusa oranli bir buyukluktur. Carpilmasa
// sanayi on kat buyuyen nufusun yaninda gorunmez kalirdi ve isgucu tavani
// (LOWER_WORKFORCE_SHARE) baglayici olmaktan cikardi — olculdu: kadro %40
// sisiyor, doluluk kisitsiz kaliyordu. Cikti zaten seviye basina normalize
// edildigi icin (employees / WORKERS_PER_LEVEL) mal dengesi degismez.
export const WORKERS_PER_LEVEL = 2000 * POPULATION_SCALE;
export const HIRING_INTERVAL = 4;
// 0.0008 -> 0.0018: nüfus artışı Vic2 ölçeğine (yüzyılda ~2 kat) inince eski
// akış sanayiyi açlıktan öldürüyordu — doluluk 40. yılda %38'e düşmüştü.
// Sanayileşme artık doğum fazlasından değil, kırdan gelen göçten beslenir.
// 0.0018 -> 0.0012: okuryazarlık çarpanı üstel olunca (schooling) geç yüzyıl
// akışı zaten hızlanıyor; taban akış düşmezse erken yüzyıl da hızlı kalıyor ve
// eğrinin biçimi yine düzleşiyordu.
const MONTHLY_HIRE_RATE = 0.0012;
/** Tek tesisin ayda alabilecegi kadro payi: sifirdan tam kadro en az ~10 ay. */
const FACTORY_HIRE_CAP = 0.10;
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

/**
 * Kapitalistin aynı anda yürüttüğü şantiye sayısı. Sınır SERMAYENİN gerçekten
 * aktığı projeleri sayar: parası akmayan proje şantiye değil, niyettir.
 *
 * Eski sürüm açık projelerin hepsini sayıyordu ve `autoUpgradeFactory` kuyruğa
 * sınırsız yükseltme koyabiliyordu. Tavana dayanmış yedi tesis yedi yükseltme
 * açıyor, hiçbiri bitmiyor, kapı bir daha açılmıyordu: kör beta kampanyasında
 * ölçülen sonuç 60 yıl boyunca sabit 7 tesisti (bkz.
 * PRIVATE_INVESTMENT_DEADLOCK_REPORT.md).
 */
const PRIVATE_ACTIVE_LIMIT = 2;
/** Uyuyanlar dâhil kuyruk tavanı: kuyruk da sınırsız büyümemeli. */
const PRIVATE_QUEUE_LIMIT = 6;
/** Bu kadar hafta hiç para akmayan özel proje uykuya geçer. */
const PRIVATE_STALL_WEEKS = 52;

/**
 * ODEME GUCU KAPISI. Sayi tavani tek basina yetmiyordu: iki tavan da "kac
 * santiye" sorusunu cevapliyor, "bu santiyeleri neyle odeyecegiz" sorusunu
 * hic sormuyordu.
 *
 * Olculdu (tohum ui-opening, 52 hafta, 27 ulus): ulusların HEPSI acik defterini
 * odeyemiyor. Medyan ozel sermaye akisi 1.23/hafta, acik defter 528-1098,
 * defterin kapanma suresi 210-648 HAFTA. Dunyada 52 haftada biten fabrika: 1.
 * Kuyruktaki alti santiye ilerlemiyordu cunku kapitalist onlari acarken parasi
 * olup olmadigina hic bakmamisti.
 *
 * Kural artik su: yeni santiye ancak ACIK DEFTER bu ufukta kapanabiliyorsa
 * acilir. Kapitalist ne kadar kazaniyorsa o kadar taahhut eder.
 */
const PRIVATE_FUNDING_HORIZON = 40;
/**
 * Akis olculemeyecek kadar kucukse (yeni kurulan ulus, savas sonrasi yikim)
 * kapi tamamen kapanmasin diye kullanilan taban. Bir santiyeyi bu tabanla
 * acmak hala PRIVATE_FUNDING_HORIZON hafta surer.
 */
const PRIVATE_MIN_INFLOW = 0.5;

/**
 * Kapitalistin BU HAFTA taahhut edebilecegi tutar. Iki cagri yeri var (yeni
 * tesis ve seviye atlatma) ve ikisi de ayni kapidan gecmeli: eskiden yalnizca
 * proje SAYISI sinirliydi, ikisi birden sayiyi doldurup defteri odenemez hale
 * getiriyordu.
 *
 * @returns {number} acik deftere eklenebilecek en fazla tutar (0 ise kapali)
 */
function privateCommitRoom(nation) {
  const projects = ensureConstruction(nation).projects;
  let owed = 0;
  for (const project of projects) {
    if (project.actor !== 'private') continue;
    owed += Math.max(0, (project.cost ?? 0) - (project.funded ?? 0));
  }
  const inflow = Math.max(PRIVATE_MIN_INFLOW, nation.politics?.privateInflow ?? 0);
  return Math.max(0, inflow * PRIVATE_FUNDING_HORIZON - owed);
}
/** Bir birim throughput'un ücret maliyeti; kâr hesabıyla beklenen marj paylaşır. */


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

// Sinif hareketliliginin kuantumu. Nufus olcegiyle carpilir: yoksa 1000
// kisilik adim on kat buyumus bir hanede olculemez kalirdi.
export const POPULATION_COHORT = 1000 * POPULATION_SCALE;

// Nufusa oranli kalemlerin BIRIMI: "on bin kisi basina". Vergi matrahi,
// sosyal program gideri ve hane sepeti hep bu birimden okunur; olcekle
// carpilir ki buyuyen sayi butceyi degistirmesin.
export const POPULATION_UNIT = 10000 * POPULATION_SCALE;
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
/**
 * Sınıf sepetleri. Ticaret defteri de bunu okur: seçili malın nüfus talebi
 * uydurma bir pay değil, populationDemand'ın kullandığı tablonun kendisinden
 * türetilsin (aynı gerekçe: CLASS_IDEOLOGY, bkz. politics.js).
 */
/**
 * UC KADEME: yasam, gunluk, luks.
 *
 * Victoria'nin asil mekanigi budur ve eksik olan da buydu. Para yetmeyince
 * kesinti butun sepete ESIT uygulaniyordu; yani vergiyi tavana ceken oyuncu
 * hanenin sarabini degil EKMEGINI de kesiyor, `canAffordNeeds` deviriliyor ve
 * sinif dort hafta sonra kalici olarak dusuyordu. Olculdu: tam vergiyle 400
 * haftada ust sinif 45.6K'dan 9.0K'ya iniyordu ve "hicbir sey yapmamak" iyi
 * oynamayi yeniyordu.
 *
 * Simdi butce SIRAYLA harcanir: once yasam, sonra gunluk, en son luks.
 * Yuksek vergi artik once luksu, sonra gunlugu yer — bedeli MORAL'dir,
 * nufus imhasi degil. Gecim tabani (`canAffordNeeds`) yalniz YASAM kademesine
 * bakar; ekmegi varsa sinif dusmez.
 */
export const NEED_TIERS = ['life', 'everyday', 'luxury'];

export const CLASS_NEEDS = {
  lower: {
    food: { amount: 0.26, tier: 'life' },
    fish: { amount: 0.02, tier: 'life' },
    groceries: { amount: 0.07, tier: 'everyday' },
    clothes: { amount: 0.04, tier: 'everyday' },
    liquor: { amount: 0.02, from: 624, tier: 'luxury' },
  },
  middle: {
    food: { amount: 0.2, tier: 'life' },
    groceries: { amount: 0.12, tier: 'everyday' },
    clothes: { amount: 0.08, tier: 'everyday' },
    furniture: { amount: 0.04, from: 728, tier: 'everyday' },
    paper: { amount: 0.03, tier: 'everyday' },
    wine: { amount: 0.02, from: 728, tier: 'luxury' },
    telephone: { amount: 0.012, from: 2297, tier: 'luxury' },
    radio: { amount: 0.012, from: 3341, tier: 'luxury' },
  },
  upper: {
    // Yasam kademesi DUZ YIYECEKTIR. Once `groceries` (konserve) atanmisti ve
    // bu iki kez yanlisti: konserve 1836'da yok, ve bir malikanenin ekmegi
    // fabrika mali degil. Konserve gunluk kademeye indi.
    food: { amount: 0.12, tier: 'life' },
    groceries: { amount: 0.15, tier: 'everyday' },
    clothes: { amount: 0.1, tier: 'everyday' },
    furniture: { amount: 0.07, from: 728, tier: 'everyday' },
    wine: { amount: 0.05, from: 728, tier: 'luxury' },
    luxuries: { amount: 0.05, from: 988, tier: 'luxury' },
    luxury_furniture: { amount: 0.035, from: 1248, tier: 'luxury' },
    automobile: { amount: 0.02, from: 3341, tier: 'luxury' },
    telephone: { amount: 0.02, from: 2297, tier: 'luxury' },
  },
};

/** Kalemin kademesi; belirtilmemisse gunluk sayilir. */
export function needTier(need) {
  return (typeof need === 'object' && need?.tier) || 'everyday';
}

/**
 * Bir ihtiyacin o hafta gecerli miktari. Telefon/radyo/otomobil 1836'da
 * *talep edilemez*: hem tarihsel olarak yoklar hem de karsilanamayan talep
 * fiyatlarini kalici olarak tavana yapistiriyordu (olculdu: 80. turda 43
 * malin 30'u fiyat sinirinda takiliydi, hicbirinin fiyati oynamiyordu).
 */
export function needAmount(need, turn) {
  if (typeof need === 'number') return need;
  return turn >= (need.from ?? 0) ? need.amount : 0;
}

const DEFAULT_TAXES = { lower: 20, middle: 15, upper: 10 };
export const PRICE_SPEED = 0.09;
/**
 * Fiyatin taban fiyatina donme hizi (bkz. updatePrices).
 *
 * DENGE KAPALI FORMDA. `dengesizlik x PRICE_SPEED + capa = 0` cozulurse,
 * r = arz/talep ve x = fiyat/taban icin:
 *     x = 1 - K (r-1)/(r+1),   K = PRICE_SPEED / PRICE_ANCHOR
 * Yani K, kalici bir arz fazlasinin fiyati ne kadar ezdigini belirleyen TEK
 * sayidir (17 malda gozlenen fiyata karsi RMS hata 0.06 ile dogrulandi).
 *
 * 0.018 -> 0.060, yani K 5'ten 1.5'e. Eski deger "%22 kalici fazla fiyati
 * YARIYA indirir, %50 fazla mali banda civiler" demekti ve dengenin taban
 * fiyatin yarisinda kurulmasinin sebebi buydu; gelir nominal oldugu icin
 * (RGO degeri x pay + bordro) hanenin alim gucu de oradan asagi cekiliyordu.
 *
 * KITLIK MEKANIGI OLMEDI: gercek bir kitlikta dengesizlik sinyali +0.09'a
 * kadar cikar, capa ise tavanda en fazla ((1-8)/8) x 0.06 = -0.053 ceker —
 * fiyat hala tavana tasinabilir. Capa kitligi degil, KALICI FAZLANIN
 * biriktirdigi cokusu sinirlar.
 *
 * Olculdu (`npm run audit:growth`, 100 yil x 2 tohum, INCOME_POOL_SHARE 0.70
 * ile birlikte): H1 0.94/1.01 -> 1.03/1.05 · H2 %5.85/%3.84 -> %13.83/%11.63.
 * Tek basina degil, gelir payiyla BIRLIKTE kalibre edildi — tek tek denenen
 * her kaldirac daha once elenmisti (bkz. MEKANIK_KILAVUZU 4.3).
 */
export const PRICE_ANCHOR = 0.060;

/**
 * Gümrüğün ithalat iştahını ne kadar kıstığı. %10 tarife iştahı ~%14, %50
 * tarife ~%44 düşürür. 0 olsaydı tarife yine yalnız bir vergi olurdu;
 * korumacılığın "koruyan" kısmı bu katsayıdır.
 */
export const IMPORT_ELASTICITY = 1.6;

/**
 * Gumrugun ithalat istahi. Payda 0.05'te tabanlanir: -62.5'te payda sifir,
 * altinda negatif olurdu (audit:boundary). Denetim de bu fonksiyonu okur,
 * kendi kopyasini tutmaz.
 */
export function importAppetite(tariff) {
  return 1 / Math.max(0.05, 1 + ((tariff ?? 0) / 100) * IMPORT_ELASTICITY);
}

/**
 * Yuksek gumrugun IHRACAT bedeli: kapali ekonomiden kimse mal almak istemez —
 * ticaret ortaklari once acik ekonomilerden alir. %100 tarife ihracat payini
 * ~%33 dusurur (1/(1+0.5)). Bu katsayi olmadan %100 tarife OLCULEN bir bedava
 * paraydi (YUKSEK-4: 200 haftada +10.872 altin, sifir bedel; YZ uluslarin
 * %99'u tavanda). Keyfi bir istikrar cezasi degil, gercek iktisadi kanal:
 * misilleme/pazar erisimi.
 */
export const EXPORT_RETALIATION = 0.5;

/**
 * Sanayi karinin BEYANLI dagilimi (korunum: kaynak yaratilamaz):
 *   0.50 → sermayedar hanesine (asagida, fiscalBalance)
 *   0.30 → privateCapital yeniden-yatirim fonuna (politics.collectPrivateCapital)
 *   0.20 → beyanli YIPRANMA/ithal makine sogurmasi — modellenmeyen gider.
 * Toplam ≤ 1: para iki kez dogmaz; kalan kasitli bir BATAKTIR (kaynak degil
 * gider — korunum yonunden guvenli taraf) ve ledger-audit bunu dogrular.
 *
 * YENIDEN-YATIRIM PAYI 0.08 -> 0.30. Olculdu (tohum ui-opening, 52 hafta, 27
 * ulus): 0.08 ile ulusal sermaye olusumu ~1.2/hafta iken en ucuz tesis £113,
 * en ucuz seviye atlatma £145 idi. Yani kapitalist bir tesisi ancak ~120
 * haftada odeyebiliyordu ve odeme gucu kapisi konunca HICBIR SEY insa
 * edemez hale geldi — dunyada 52 haftada biten fabrika zaten 1 taneydi.
 * Fark BATAKTAN karsilanir (0.42 -> 0.20), sermayedar hanesine dokunulmaz:
 * hicbir yerde yeni para dogmaz, yalnizca modellenmeyen gidere gidecek olanin
 * bir kismi sanayiye doner.
 */
export const PROFIT_TO_CAPITAL = 0.5;
export const PROFIT_TO_REINVEST = 0.30;

/**
 * Hane birikimi (bkz. populationDemand).
 *
 * `DRAW_RATE` bir haftada birikimin ne kadarinin harcanabilecegi: yastik
 * aniden bosalmasin, kriz haftalara yayilsin. `RATE` artan gelirin birikime
 * giden payi. `CAP_WEEKS` tavan — yarim yillik sepet; olmasaydi ust sinif
 * sonsuz yastik biriktirip kitliga tamamen bagisik olurdu.
 */
export const SAVINGS_DRAW_RATE = 0.25;
export const SAVINGS_RATE = 0.5;
export const SAVINGS_CAP_WEEKS = 26;

/** Tam issizlikte alt sinif memnuniyetinden dusen puan (orta sinif yarisi). */
export const UNEMPLOYMENT_MOOD = 0.22;

/**
 * HANE DEFTERI ARTIK TEK HIKAYE: butce = net gelir + BEYAN EDILMIS gecimlik.
 *
 * Eski model iki bagimsiz formulun harmaniydi (INCOME_BUDGET_WEIGHT = 0.35):
 * kimlik denetimi %658 sapiyor, hane gelirinin 7-9 katini harciyordu —
 * dunya butceleri (14k/hf) dunya GSYH'sinin (9.2k/hf) 1.5 kati, yani para
 * yoktan varoluyordu. R-17'nin "ani gecis aclik zinciri tetikler" bulgusu
 * dogruydu; cozum gecisi yumusatmak degil GELIR TARAFINI gercek yapmakti:
 * fabrika ucretleri artik katma degerden odeniyor (LABOR_SHARE) ve sinif
 * gelirine akiyor; kirsalin kendi urettigini tuketmesi ise acik bir ayni
 * (in-kind) kanal olarak beyan ediliyor — famineDeaths gibi denetlenebilir.
 *
 * SUBSISTENCE_SHARE: formul butcesinin ne kadari parasal olmayan gecimlik
 * sayilir. Ust sinifin gecimligi yoktur (parasi vardir); orta sinifin kucuk
 * bir zanaat/takas payi, alt sinifin tarla payi vardir.
 */
// UST SINIFIN GECIMLIGI SIFIR DEGIL. Eski yorum "ust sinifin gecimligi yoktur
// (parasi vardir)" diyordu; bu modern bir varsayim. 19. yuzyilin toprakli
// seckini kendi malikanesinden beslenir ve bu gelir vergilendirilemez.
// Olculdu: pay 0 iken %100 vergide ust sinifin butcesi TAM OLARAK sifir
// oluyor, yasam kademesi karsilanamiyor ve sinif dort haftada dusuyordu —
// yani kaydiracin en ust ucu bir yok etme dugmesiydi.
export const SUBSISTENCE_SHARE = { lower: 0.30, middle: 0.15, upper: 0.12 };

/**
 * Fabrika katma degerinin emege giden payi. Eski sabit ucret
 * (WAGE_PER_THROUGHPUT = 1.2) katma degerin %2.5'iydi ve ODENMIYORDU:
 * kardan dusuluyor ama hicbir sinifin gelirine yazilmiyordu — para imha.
 * Pay modeli fiyat seviyesiyle kendiliginden olceklenir (taban fiyatta
 * kucuk ucret, tavan fiyatta buyuk) ve isci/katip gelirine gercekten akar.
 */
export const LABOR_SHARE = 0.55;
/** Ucret bordrosunun sinif dagilimi: gövde isci (alt), beyaz yaka (orta). */
export const WAGE_SPLIT = { lower: 0.8, middle: 0.2 };

/**
 * Net dis dengenin hazineden gecen orani (bkz. settleGlobalTrade).
 *
 * Devlet, ulkenin dis pozisyonunun ARTIK finansorudur: acigin bir kismi
 * hazineden kapanir, kalani ozel sermaye hareketi olarak sogurulur. 1.0
 * "hazine butun hanelerin ithalat faturasini haftalik oder" demek olurdu ki
 * fazla siddetli.
 *
 * Para yaratmaz/yok etmez: dunya ticareti sifir toplamli oldugu icin
 * (`Simport == Sexport`, olculdu 2.3e-13) `Sbalance * oran` da her oranda
 * sifirdir. Korunum ORANDAN BAGIMSIZDIR; oran yalnizca isirma siddetidir.
 *
 * Oran STANDART DUNYADA (160x96, 65 ulke, tohum BETA1836) olculerek secildi.
 * Denetim haritasi (78x62, 31 ulke) baska bir cevap veriyordu (orada 0.5 en
 * iyisiydi, 1.0 asiri duzeltiyordu) — URUN yapilandirmasi esas alindi:
 *
 *   oran  hf156 iflas  hf520 iflas  hf156 oran  hf520 oran
 *   0.00  -            -            0.06        0.06   <- TERS (eski davranis)
 *   0.50  0/65         6/65         0.81        1.05   <- yetersiz
 *   1.00  1/65         4/65         5.90        2.95   <- secilen
 *   1.50  5/65         8/65        12.32        4.36   <- iflas artiyor
 *   2.00  9/65        12/65         6.31        3.18   <- bozuluyor
 *
 * ("oran" = ticaret fazlasi verenlerin ort. hazinesi / acik verenlerinki;
 * 1'in altinda dis acik ODULLENDIRILIYOR demektir.)
 *
 * 1.0 hem isareti en net duzelten hem de 520. haftada EN AZ iflas ureten
 * deger. Ayni zamanda ilkesel tavan: devlet fiili acigin fazlasini kapatamaz.
 *
 * --- 1.0 -> 0.25 (gida onceligi geldikten sonra yeniden olculdu) ---
 *
 * Yukaridaki tablo, hanenin sepetinin ancak %40'ini aldigi bir dunyada
 * olculmustu. `FOOD_GOODS` onceligi gelince hane once EKMEGINI aliyor ve onu
 * TAM aliyor: gercek ithalat faturasi buyudu. 1.0'da bunun tamami hazineden
 * cikiyor, yani devlet herkesin market alisverisini oduyor. Olculdu (120 hafta,
 * hic dokunulmayan oyuncu ulusu + dunya):
 *
 *   oran   oyuncu hazine/borc      dunya medyan altin   batik ulke   medyan foodMet
 *   1.00   0 / 692-912             70-72                3/29-31      0.80-0.84
 *   0.50   0 / 802-1377            75-88                1/29-31      0.86-0.93
 *   0.25   221 ve 18 / 0 ve 13     63-118               1/29-31      0.84-0.92
 *
 * 0.25 tek basina "daha zengin dunya" demek DEGIL — medyan haftalik net her uc
 * oranda ayni (2.3-3.7). Degisen tek sey hazinenin dis acigin ne kadarini
 * ustlendigi. Hanenin ekmegini devlet degil hane oder; geri kalani ozel sermaye
 * hareketi olarak sogurulur. Korunum yine oranin disindadir (Simport==Sexport).
 */
export const EXTERNAL_SETTLEMENT = 0.25;

/**
 * Sürekli sosyal harcamalar. Geç oyunda hazine doluyordu çünkü bütün giderler
 * tek seferlikti; bunlar nüfusla birlikte büyüyen, kapatılabilir ama kapatınca
 * bedeli olan kalemler. Maliyet 10.000 kişi başına, %100 seviyede haftalık.
 */
export const SOCIAL_PROGRAMS = {
  education: {
    id: 'education', name: 'Education', rate: 0.34, ledgerLine: 'education',
    desc: 'Schools raise literacy, and literacy is what produces research.',
  },
  // SAGLIK REFAHA KATILDI (silinmedi, BIRLESTIRILDI). Tek gercek tuketicileri
  // nufus buyume carpani (provinces.js) ve `standardOfLiving` terimiydi;
  // olculdu: 700 haftada tam fonlama %1.4-2.0 nufus getiriyor, nufusun kendi
  // tohum gurultusu ise %39.1 — kaydiracin butun menzili gurultunun yirmide
  // biri. Iki etki de refaha tasindi, oran ikisinin toplami (0.30 + 0.46).
  welfare: {
    id: 'welfare', name: 'Welfare', rate: 0.76, ledgerLine: 'welfare',
    desc: 'Relief and public health: satisfaction, wellbeing and population growth.',
  },
};

const DEFAULT_SOCIAL = { education: 0, welfare: 0 };

/** Tek bir programin bu haftaki altin gideri. */
export function programmeCost(nation, programId) {
  const program = SOCIAL_PROGRAMS[programId];
  if (!program || !nation?.economy) return 0;
  return (nation.economy.population / POPULATION_UNIT)
    * socialLevel(nation, programId) * program.rate;
}
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
  // Yelkenli konvoylar: 1836'nin donanmasi bununla kurulur. Eskiden savas
  // gemisi vapur konvoyu istiyor ve vapur tersanesi 1850'ye kilitli oldugu
  // icin donanma ilk 14 yil YAPISAL olarak imkansizdi (bkz. P2-7) — ekran da
  // nedenini soylemiyordu. Clippers ayrica CLIPPER_YARD'in gercek tuketicisi.
  // defaultStock BIR GEMIYE YETMELI (kurulus 6 konvoy): baslangic stogu 4
  // olarak denendi ve kilitlendi — tedarik hedefi ihtiyatta (3) durdugu icin
  // stok hic 6'ya cikmiyor, hicbir ulke ILK gemisini kuramiyordu (olculdu).
  clippers: {
    id: 'clippers', name: 'Clipper Convoys', icon: '⛵', stockCap: 16, defaultStock: 8,
    factoryRate: 0.6, importLimit: 1.2, reserve: 4,
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

/**
 * Eksik alanlari varsayilanla tamamlar, NESNEYI YERINDE birakir. ensureEconomy
 * her hafta kosar ve eski `{ ...varsayilan, ...mevcut }` kalibi hicbir sey
 * degismese de ulke basina onlarca yeni nesne uretiyordu (olculdu:
 * ~2.4 MB/hafta). Deger davranisi spread ile birebir ayni: mevcut anahtar
 * (undefined olsa bile) korunur, yalniz hic olmayan anahtar doldurulur.
 */
function fillMissing(target, defaults) {
  for (const key in defaults) {
    if (!(key in target)) target[key] = defaults[key];
  }
  return target;
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
    settlement: 0,
  };
}

function emptyProfessionCounts() {
  return Object.fromEntries(Object.keys(PROFESSION_INFO).map((id) => [id, 0]));
}

// `emptyLedger` artik treasury.js'ten gelir: defterin sekli defteri YAZAN
// modulun sorumlulugudur, iki yerde ayri ayri tanimlanirsa kacinilmaz olarak
// ayrisir (eski surumde tam olarak bu olmustu).

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

// Yerinde doldurmanin (fillMissing) referans varsayilanlari. Yalniz okunur.
const GOOD_FLOW_DEFAULTS = emptyGoodFlow();
const TRADE_SUMMARY_DEFAULTS = emptyTradeSummary();
const LEDGER_DEFAULTS = emptyLedger();

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
  return 0.08 * (0.5 + (nation.economy.armyFunding ?? 100) / 200);
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Kurulu sanayinin toplam kadro kapasitesi (dolu olsun olmasin). */
export function industrialJobs(nation) {
  return (nation.economy?.factories ?? []).reduce(
    (sum, factory) => sum + (factory.jobs ?? factory.level * WORKERS_PER_LEVEL), 0,
  );
}

/** Kadronun ne kadari dolu. 1 = butun tezgahlar calisiyor. */
export function laborFill(nation) {
  const jobs = industrialJobs(nation);
  if (jobs <= 0) return 1;
  const employed = (nation.economy?.factories ?? []).reduce(
    (sum, factory) => sum + (factory.employees ?? 0), 0,
  );
  return employed / jobs;
}

const CLASS_IDS = Object.keys(CLASS_INFO);
const PROFESSION_IDS = Object.keys(PROFESSION_INFO);
// ensurePopulationModel'in yerinde doldurdugu alanlar; id ve population
// sinifa/nufusa ozel oldugu icin ayri ele alinir.
const CLASS_DEFAULTS = {
  income: 0,
  taxPaid: 0,
  satisfaction: 0.62,
  needsCost: 0,
  needsBudget: 0,
  canAffordNeeds: true,
  hardshipWeeks: 0,
};

/**
 * ISLER ARTIK SAKLANMIYOR, ZEMINDEN TURETILIYOR.
 *
 * Eskiden `economy.professionCounts` diye sekiz ulusal sayac vardi ve sinif
 * nufuslari ONLARDAN turetiliyordu (`syncClassPopulations`). Sayaclari nufusla
 * hizada tutmak dokuz ayri fonksiyon gerektiriyordu ve — asil sorun — sayaclar
 * SANAYILESMEYI GORMUYORDU. Olculdu (3340 hafta, tek tohum):
 *
 *   dunyada tesis      135 -> 659   (toplam seviye 135 -> 956, yedi kat)
 *   ciftci payi      %50.0 -> %61.6   ARTIYOR
 *   fabrika iscisi   %24.2 -> %21.6   DUSUYOR
 *
 * Yani dunya yedi kat sanayilesirken nufus ekrani oyuncuya ulkenin
 * TARIMSALLASTIGINI soyluyordu. Sayaclar kaymiyordu (sinif sapmasi her
 * kontrolde tam 0) — dogru calisiyor ama yanlis seyi anlatiyorlardi.
 *
 * Yeni kural tek cumle: **is, insanin uzerindeki etiket degil, bulundugu
 * yerin ozelligidir.** Madencilik kumesindeki alt sinif madencidir, fabrikali
 * sehirdeki fabrika iscisidir. Saklanan sey UC SINIFTIR; meslek dagilimi her
 * sorulduğunda gercek fabrika kadrosundan ve gercek RGO istihdamindan
 * hesaplanir. Boylece sayim tablosu YAPISI GEREGI yalan soyleyemez.
 */

/** Orta ve ust sinifin ic dagilimi. Bunlarin zemini yok: hicbirinin mekanik
 *  etkisi yoktur ve oyuncu hicbirini secmez, o yuzden sabit pay durustur. */
const DERIVED_SHARES = {
  middle: { clerks: 0.45, artisans: 0.35, officers: 0.20 },
  upper: { capitalists: 0.45, aristocrats: 0.55 },
};

/**
 * Ulusun is dagilimi — TURETILIR, saklanmaz.
 * @returns {Record<string, number>} meslek -> kisi
 */
export function jobTotalsOf(world, nation) {
  const economy = nation?.economy;
  const out = Object.fromEntries(PROFESSION_IDS.map((id) => [id, 0]));
  if (!economy?.classes) return out;

  // --- ALT SINIF: gercek isten okunur ---------------------------------------
  const lower = Math.max(0, economy.classes.lower?.population ?? 0);
  // Fabrikada FIILEN calisan. Tek kaynak: tesisin kendi kadrosu.
  const inFactories = Math.min(lower, (economy.factories ?? [])
    .reduce((sum, factory) => sum + (factory.employees ?? 0), 0));
  // Fabrika disinda kalan alt sinif, kirin IKI kolu arasinda GERCEK is
  // kapasitesi oraninda bolunur: tarim kumeleri ciftci, maden/kesim kumeleri
  // amele. Oran sabit degil, ulkenin kendi cografyasidir -- madenli bir ulke
  // gercekten daha cok ameleye sahip olur.
  //
  // "Once amele dolsun, ciftci artik kalsin" YAPILMADI: o sekil ameleyi
  // kapasitesine kadar doldurup ciftciyi kalana indirirdi, yani ciftci sayisi
  // maden kapasitesinin golgesi olurdu. Oransal bolme ikisini de kendi
  // zemininde tutar.
  let agJobs = 0;
  let exJobs = 0;
  for (const province of world?.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const track = RGO_TYPES[province.econ.rgo]?.track;
    if (track === 'agriculture') agJobs += rgoJobsOf(province.econ);
    else if (track === 'extraction') exJobs += rgoJobsOf(province.econ);
  }
  const rural = Math.max(0, lower - inFactories);
  const ruralJobs = agJobs + exJobs;
  out.workers = inFactories;
  // Zemini hic olmayan ulkede (butun kumeler isgal altinda vb.) herkes koyde.
  out.laborers = ruralJobs > 0 ? rural * (exJobs / ruralJobs) : 0;
  out.farmers = rural - out.laborers;

  // --- ORTA VE UST SINIF: sabit pay ----------------------------------------
  for (const classId of ['middle', 'upper']) {
    const population = Math.max(0, economy.classes[classId]?.population ?? 0);
    for (const [id, share] of Object.entries(DERIVED_SHARES[classId])) {
      out[id] = population * share;
    }
  }
  return out;
}

/**
 * ISCI TAVANI. Alt sinifin bu payindan fazlasi fabrikada calisamaz: kalanlar
 * tarlada, madende, evde. Eskiden tavan `professionCounts.workers` sayaciydi;
 * ayni sayi, artik sinftan dogrudan.
 */
export const LOWER_WORKFORCE_SHARE = 0.23;

/**
 * Sanayiye adam verebilecek alt sinif: silah altindakiler DUSULUR. Askerler
 * artik nufusun icinde sayildigi icin (bkz. provinces.claimSoldiers) tavan
 * onlari da kapsardi ve seferber olmus bir ulke, olmayan isciyi ise
 * alabilirdi. Asker ordunun tamamina yakini alt siniftandir; pay ayirmak
 * yerine tamami alt siniftan dusulur — fark gurultu, kural okunur kalir.
 */
function civilianLower(economy) {
  const lower = Math.max(0, economy?.classes?.lower?.population ?? 0);
  return Math.max(0, lower - Math.max(0, economy?.soldiersUnderArms ?? 0));
}

/**
 * ISCI KORUNUMU: Sfabrika kadrosu <= alt sinifin calisabilir payi.
 *
 * Ise alim tavani zaten uygular ama nufusu SONRADAN dusuren yollar (nufus
 * kucultmesi, sinif yukselmesi, kurulusta acilan kadro) tesis kadrosuna
 * dokunmuyordu — olculdu: 1. haftada 5000 kadro / 4000 isci, 260. haftada
 * ulusal fark 4900. Kadro artik sinif nufusuna gore kirpilir; olen ya da
 * yukselen calisani tesis tutamaz.
 */
function alignWorkforce(nation) {
  const economy = nation?.economy;
  if (!economy?.classes) return;
  const factories = economy.factories ?? [];
  const employed = factories.reduce((sum, factory) => sum + (factory.employees ?? 0), 0);
  const cap = civilianLower(economy) * LOWER_WORKFORCE_SHARE;
  if (employed <= cap || employed <= 0) return;
  const scale = cap / employed;
  for (const factory of factories) factory.employees = (factory.employees ?? 0) * scale;
}

export function ensurePopulationModel(
  nation, population = nation?.economy?.population ?? POPULATION_UNIT,
) {
  const economy = nation.economy;
  economy.classes ??= {};
  for (const classId of CLASS_IDS) {
    const existing = economy.classes[classId];
    if (!existing) {
      economy.classes[classId] = {
        id: classId,
        population: Math.round(population * CLASS_INFO[classId].share),
        income: 0,
        taxPaid: 0,
        satisfaction: 0.62,
        needsCost: 0,
        needsBudget: 0,
        canAffordNeeds: true,
        hardshipWeeks: 0,
      };
    } else {
      // Eksik alan yalniz eski kayit gocunde cikar; haftalik yolda nesne
      // yeniden kurulmaz (deger davranisi eski spread ile ayni).
      fillMissing(existing, CLASS_DEFAULTS);
      if (!('id' in existing)) existing.id = classId;
      if (!('population' in existing)) {
        existing.population = Math.round(population * CLASS_INFO[classId].share);
      }
    }
  }
  // ESKI KAYIT GOCU: `professionCounts` artik yok. Kayitta varsa sessizce
  // atilir -- sinif nufuslari zaten kayitta ve kanonik olan onlar.
  if (economy.professionCounts) delete economy.professionCounts;
  economy.mobility ??= {
    lastUpdated: 0,
    demotedUpper: 0,
    demotedMiddle: 0,
  };
  economy.cohortPopulation = CLASS_IDS.reduce(
    (sum, id) => sum + (economy.classes[id]?.population ?? 0), 0,
  );
  return economy.classes;
}

export function reconcilePopulation(nation, population) {
  ensurePopulationModel(nation, population);
  const economy = nation.economy;
  // KOHORT KUANTUMU KALKTI. Sinif nufusu artik 1000'lik bloklarda degil, tam
  // sayida tutulur. Kuantum meslek sayaclari icin vardi (kohortlar meslekler
  // arasinda blok blok tasiniyordu); sayaclar gidince tek etkisi sinif
  // toplamini gercek nufustan 999'a kadar geride birakmakti. Olculdu:
  // kur/dagit dongusu 200 turda 3.000 kisi kaybediyor, kume nufusu ile sinif
  // toplami arasindaki fark %7.3'e cikiyordu. Sinif atlamasi hala 1000
  // kisilik adimlarla olur (POPULATION_COHORT) -- orada kuantum bir TASARIM
  // karari, burada ise sadece hataydi.
  const target = Math.max(0, Math.round(population));
  const classes = economy.classes;
  let current = CLASS_IDS.reduce((sum, id) => sum + (classes[id].population ?? 0), 0);
  if (current <= 0) {
    for (const id of CLASS_IDS) classes[id].population = Math.round(target * CLASS_INFO[id].share);
  } else if (target !== current) {
    // Olcekleme SINIF PAYLARINI KORUR: nufus dususu/artisi siniflari
    // birbirine cevirmez. Sinif degistiren tek yol hareketliliktir
    // (runPopulationMobility) -- orada da sebebi vardir.
    const scale = target / current;
    let assigned = 0;
    for (let i = 0; i < CLASS_IDS.length; i++) {
      const id = CLASS_IDS[i];
      if (i === CLASS_IDS.length - 1) classes[id].population = Math.max(0, target - assigned);
      else {
        classes[id].population = Math.max(0, Math.round(classes[id].population * scale));
        assigned += classes[id].population;
      }
    }
  }
  economy.cohortPopulation = CLASS_IDS.reduce((sum, id) => sum + classes[id].population, 0);
  // Nufus kuculduyse tesis kadrosu da kuculmeli: ayni insan iki yerde sayilmaz.
  alignWorkforce(nation);
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
  const total = Math.max(1, economy.cohortPopulation);
  // Egitim niteligi artirir: okullu nufus daha kolay sinif atlar. Carpan
  // artik okuryazarlik STOGUNDAN gelir (advanceLiteracy), kaydiracin anlik
  // degerinden degil: kaydirac kapanınca nesil okumayi unutmaz. Olculdu
  // (audit:budget): anlik carpanla egitim 0 ve 100 arasinda 260 haftada orta
  // sinif farki %0.0 — kapi (asagida) hic acilmadigi icin carpan bosa donuyordu.
  const literacy = clamp(economy.literacy ?? 0, 0, 1);
  const schooling = 1 + literacy * 1.0 + socialLevel(nation, 'education') * 0.25;
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
    // Okuryazar sinif daha kucuk artikla yukselir: Victoria'da sinif
    // atlamanin asil kapisi okuryazarliktir, servet degil.
    const surplusNeeded = 0.35 * (1 - literacy * 0.6);
    const thriving = source.canAffordNeeds && surplus > (source.needsCost ?? 0) * surplusNeeded
      && (source.satisfaction ?? 0) > 0.55 - literacy * 0.15;
    source.prosperityWeeks = thriving
      ? (source.prosperityWeeks ?? 0) + schooling
      : Math.max(0, (source.prosperityWeeks ?? 0) - 2);
    if (source.prosperityWeeks < 8) continue;
    source.population -= POPULATION_COHORT;
    target.population += POPULATION_COHORT;
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
    socialClass.population -= POPULATION_COHORT;
    economy.classes[targetClass].population += POPULATION_COHORT;
    economy.mobility[mobilityKey] = POPULATION_COHORT;
    socialClass.hardshipWeeks = 0;
  }
  economy.cohortPopulation = CLASS_IDS.reduce(
    (sum, id) => sum + (economy.classes[id].population ?? 0), 0,
  );
  // Alt siniftan yukselen insan fabrikadan da cikmis olabilir; kadro
  // korunumu burada da kapanmali.
  alignWorkforce(nation);
  return economy.mobility;
}

function marketGood(id) {
  const good = GOODS[id];
  return {
    id,
    // Taban fiyat piyasa durumunda da tasinir: provinces.js RGO gelisimini
    // fiyat sinyaline baglarken orani buradan okur ve economy.js'i import
    // etmek zorunda kalmaz (economy zaten provinces'i import ediyor — ters
    // yon dongu olurdu).
    basePrice: good.basePrice,
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
  // Taban YOK: nufus kare toplamidir. Eski `max(10000, ...)` tabani her
  // kucuk ulkeye ve ozellikle TOPRAKSIZ kalinti devlete 10.000 hayalet insan
  // uyduruyordu; sayac-kohort sapmasi denetimindeki "6.000 kisilik" YUKSEK
  // bulgu tamamen bu hayaletlerdi (kohort katmani dagitacak kare bulamiyor,
  // sayac dolu goruluyordu). Payda kullanan tuketiciler max(1,...) korumali.
  return Math.max(0, provincePopulation(world, nation.id));
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
    // UC SINIF, UC ORAN. Kimin ne odedigi oyuncunun kararidir; hukumetin
    // ideolojisi artik bir kilit degil, yalnizca YZ'nin tercihi (adjustFiscalAI)
    // ve acilis degerleri. Ekran uc orandan "artan/duz/azalan" etiketini kendi
    // TURETIR (bkz. taxStructureOf) — etiket bir girdi degil, bir sonuctur.
    tax: { lower: 20, middle: 25, upper: 30 },
    social: { ...DEFAULT_SOCIAL },
    socialCost: 0,
    tariff: 10,
    // TEK ORDU BUTCESI. Maas ve tedarik ayri kaydiraclardi ama ikisi de ayni
    // yone bakiyor, ayni parayla odeniyor, ayni parti bandina takiliyordu:
    // iki kaydirac tek karardi.
    armyFunding: 100,
    military: { ...DEFAULT_MILITARY },
    factories: [],
    cohortPopulation: Math.max(10, Math.floor(population / POPULATION_COHORT)) * POPULATION_COHORT,
    mobility: { lastUpdated: 0, demotedUpper: 0, demotedMiddle: 0 },
    goodsFlow: emptyGoodsFlow(),
    trade: emptyTradeSummary(),
    ledger: emptyLedger(),
    gdp: 0,
    realGdp: 0,
    taxRevenue: 0,
    tariffRevenue: 0,
    importCost: 0,
    factoryProfit: 0,
    standardOfLiving: 10,
    stability: 0.62,
  };
  ensurePopulationModel(nation, population);
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
      // Kuruluş tesisleri KADROSUZA YAKIN doğar. Yarı kadro ölçüldü ve
      // 1836'da ulusal doluluğu %61'e çıkarıyordu: sanayi daha ilk haftada
      // dolu görünüyor, yüzyıl boyunca yalnız seyreliyordu (H4 = 0.89x).
      // Vic2'de 1836 sanayisi cılızdır; doluluk okuryazarlıkla sonradan gelir.
      employees: WORKERS_PER_LEVEL * 0.15,
      profit: 0,
      margin: 0,
      throughput: 0,
      fundedBy: 'state',
      ...(typeId === 'ARMS_FACTORY' ? {
        lineEquipment: 'arms', lineEfficiency: 0.5, lineOutput: 0,
      } : {}),
    });
  }
  // Kurulus kadrosu meslek sayacina HIC sorulmuyordu: 1. haftada 5000
  // kadro / 4000 isci ile dogan cift sayim buradan basliyordu.
  alignWorkforce(nation);
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
  // Katalogdan cikmis mal (orn. synthetic_oil) eski kayittan gelirse dusulur:
  // updatePrices bilinmeyen malin taban fiyatini bulamayip cokuyordu.
  for (const id of Object.keys(world.market.goods)) {
    if (!GOODS[id]) delete world.market.goods[id];
  }
  for (const nation of world.nations) {
    if (!nation.economy) initNationEconomy(world, nation);
    // Eski kayıtlar sosyal harcama alanını tanımıyor; eksik alan çökertmesin.
    else fillMissing(nation.economy.social ??= {}, DEFAULT_SOCIAL);
    // Eski kayıt göçü: tek armySpending kaydıracı iki yeni kaydırağa açılır,
    // oyuncunun ayarı iki tarafta da korunmuş olur. Yönetim varsayılan tam.
    nation.economy.armyFunding ??= 100;
    // Eski kayit tek oranla geliyorsa uc orana acilir (save v17).
    const economy = nation.economy;
    if (!economy.tax || typeof economy.tax !== 'object') {
      const legacy = Number.isFinite(economy.taxRate) ? economy.taxRate : 25;
      const weights = taxWeightsFor(nation);
      economy.tax = {
        lower: clamp(Math.round(legacy * weights.lower), 0, 100),
        middle: clamp(Math.round(legacy * weights.middle), 0, 100),
        upper: clamp(Math.round(legacy * weights.upper), 0, 100),
      };
    }
    for (const id of TAX_CLASS_IDS) {
      if (!Number.isFinite(economy.tax[id])) economy.tax[id] = 25;
      economy.tax[id] = clamp(Math.round(economy.tax[id]), 0, 100);
    }
    delete economy.taxRate;
    // `inventory` kaldirildi: her hafta yazilan ama hicbir sistemin okumadigi
    // olu bir kopyaydi (olculdu). Eski kayittan gelirse dusurulur.
    delete nation.economy.inventory;
    nation.economy.goodsFlow ??= emptyGoodsFlow();
    for (let i = 0; i < GOOD_IDS.length; i++) {
      const id = GOOD_IDS[i];
      const flow = nation.economy.goodsFlow[id];
      if (!flow) nation.economy.goodsFlow[id] = emptyGoodFlow();
      else fillMissing(flow, GOOD_FLOW_DEFAULTS);
    }
    if (!nation.economy.trade) nation.economy.trade = emptyTradeSummary();
    else fillMissing(nation.economy.trade, TRADE_SUMMARY_DEFAULTS);
    if (!nation.economy.ledger) nation.economy.ledger = emptyLedger();
    else fillMissing(nation.economy.ledger, LEDGER_DEFAULTS);
    // Haftalik toplayici ve acilis isareti: ilk haftadan itibaren
    // `ledger.unreconciled` anlamli olsun diye burada kurulur.
    if (!nation.economy.ledgerWeek) openWeek(nation);
    ensurePopulationModel(nation, populationOf(world, nation));
    ensureMilitaryEconomy(nation);
    ensureInitialMilitaryIndustry(world, nation);
    // Tanınmayan tür kayıttan düşer; çapası kurulamayan (toprağı kalmamış)
    // fabrika ise silinmez, yalnız state'siz kalır — kayıp veri sürprizi olmasın.
    // Filtre yalnız gerçekten düşecek kayıt varsa kopyalar: her hafta yeni
    // dizi kurmak boşuna çöptü.
    nation.economy.factories ??= [];
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

/** Sosyal programın 0–1 aralığındaki etkin seviyesi. */
export function socialLevel(nation, programId) {
  return clamp((nation?.economy?.social?.[programId] ?? 0) / 100, 0, 1);
}

export function priceOf(world, goodId) {
  return world.market?.goods?.[goodId]?.price ?? GOODS[goodId]?.basePrice ?? 0;
}

/**
 * Malın SABIT (taban) fiyatı — reel değerleme için. Cari fiyat serbest
 * değişken olduğu için nominal bir toplam büyümeyi ölçemez: hacim %30 artarken
 * fiyat yarıya inince sayı düşer. Reel seri bu yüzden ayrı bir fonksiyondan
 * okunur; ikisi karışırsa "büyüme" ölçüsü yine fiyata bağlanır.
 */
export function basePriceOf(goodId) {
  return GOODS[goodId]?.basePrice ?? 0;
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
  // Katsayı 0.12 -> 0.05 -> 0.035. Aynı sebep her seferinde: eğim kurulu sayıyla
  // çarpıldığı için sanayileşmeyi kendi başarısı durduruyor.
  //
  // 0.05 -> 0.035 OLCULDU (audit:growth + tarama). Kapitalistin bütçesi
  // (`privateCommitRoom` = akış × PRIVATE_FUNDING_HORIZON) fiyat seviyesiyle
  // birlikte düşerken bedel kurulu sayıyla tırmanıyordu; makas 1838-46 arasında
  // kapanıyor ve bir daha açılmıyordu — 1838'de 27 ülkenin 24'ü fabrika
  // açabiliyorken 1846'da SIFIR. 20 fabrikalı bir ülkede çarpan 2.0x yerine
  // 1.4x olur.
  //
  // DEGER FIYAT KARARLILIGIYLA SINIRLI. Egim ne kadar ucuzsa o kadar cok
  // fabrika, o kadar cok arz — ve arz fazlasi tam da kapatmaya calistigimiz
  // sey. Olculdu (100 yil x 2 tohum, audit:growth + audit:price-stability):
  //   0.02  -> uc hedef yesil AMA fiyat capasi testi KALIYOR (kayma -0.29)
  //   0.03  -> H1 kaciyor (0.99) ve capa testi yine kaliyor
  //   0.035 -> uc hedef yesil VE capa testi temiz  <-- secilen
  //     H1 1.19/1.14 · H2 %12.99/%13.25 · H3 1.34x/1.30x
  // 0.01 daha cok tesis verir (624) ama arz/talep'i 2.03'e iter: fazla ucuz
  // fabrika, kapatmaya calistigimiz makasi yeniden acar.
  const scale = 1 + built * 0.035;
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
    // Devlet fabrika yatirimi bir INSAAT kalemidir; `pay()` hangi satira
    // yazacagini artik parametreden ogrenir, sonradan duzeltme gerekmez.
    return pay(nation, cost, 'construction');
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
  if (nation && techUnlocksFactory(nation, typeId, turn)) return true;
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
    const by = actor === 'private' ? ' by private investors' : '';
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
        game.turns.addLog(
          `${FACTORIES[factory.typeId].name} reached level ${factory.level}.`,
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
      const by = project.actor === 'private' ? ' by private investors' : '';
      game.turns.addLog(
        `${FACTORIES[project.typeId].name} opened in ${project.regionName}${by}.`,
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
 * ============================ BUTCE SOZLESMESI ============================
 *
 * BUTCE SAHIPTIR      tax.{lower,middle,upper}, tariff, armyFunding, social.education,
 *                     social.welfare
 * BUTCE OKUR          vergi matrahi (sinif gelirleri), ithalat degeri, nufus,
 *                     ordu olcegi, hukumet kisitlari (politics)
 * BUTCE URETIR        vergi geliri, gumruk geliri, program giderleri, ordu
 *                     gideri, idari gider, haftalik bakiye, hazine islemleri
 * BUTCE SAHIP DEGILDIR nufus, arastirma ilerlemesi, askeri birimler, piyasa
 *                     fiyatlari, siyasi destek
 *
 * BES KONTROL, her birinin BIR faydasi ve BIR bedeli var:
 *   tax.*      + gelir            - memnuniyet
 *   tariff     + gelir            - ithal mal pahalilanir
 *   armyFunding+ hazirlik         - hazine
 *   education  + arastirma        - hazine
 *   welfare    + memnuniyet/buyume- hazine
 * ==========================================================================
 */
export const BUDGET_POLICIES = ['taxLower', 'taxMiddle', 'taxUpper', 'tariff', 'armyFunding', 'education', 'welfare'];

/** Kaydirac adi -> sinif kimligi. */
export const TAX_POLICY_CLASS = { taxLower: 'lower', taxMiddle: 'middle', taxUpper: 'upper' };

/**
 * VERGI YAPISI = "KIMIN odedigi". Oran "NE KADAR"i, yapi "KIM"i belirler.
 *
 * Ayri bir kaydirac DEGIL, iktidarin ideolojisinden turer: politics.js'te
 * vergi ekseni yok ve mimarisini degistirmek bu gecisin kapsami disinda.
 * Boylece secim sonucu butceye dogrudan dokunur — oran ayni kalsa bile
 * yuku kimin tasidigi degisir.
 */
export const TAX_STRUCTURES = {
  progressive: { id: 'progressive', label: 'Progressive', weights: { lower: 0.45, middle: 0.95, upper: 1.85 } },
  flat: { id: 'flat', label: 'Flat', weights: { lower: 1, middle: 1, upper: 1 } },
  regressive: { id: 'regressive', label: 'Regressive', weights: { lower: 1.4, middle: 1.1, upper: 0.5 } },
};

const IDEOLOGY_TAX_STRUCTURE = {
  socialist: 'progressive',
  communist: 'progressive',
  liberal: 'flat',
  conservative: 'regressive',
  reactionary: 'regressive',
  fascist: 'regressive',
};

export const TAX_CLASS_IDS = ['lower', 'middle', 'upper'];

/** Hukumetin tercih ettigi agirliklar: acilis ve YZ hedefi icin. */
export function taxWeightsFor(nation) {
  const ideology = rulingParty(nation)?.ideology ?? 'conservative';
  return TAX_STRUCTURES[IDEOLOGY_TAX_STRUCTURE[ideology] ?? 'flat'].weights;
}

/**
 * Vergi sisteminin ADI artik bir girdi degil, uc orandan TURETILEN bir
 * sonuctur: oyuncu ustten cok aliyorsa sistem artandir, alttan cok aliyorsa
 * azalan. Eskiden etiketi iktidarin ideolojisi belirliyordu ve oyuncu
 * kaydiraci ne yaparsa yapsin etiket degismiyordu — ekran, oyuncunun kendi
 * kararini yanlis adlandiriyordu.
 */
export function taxStructureOf(nation) {
  const tax = nation?.economy?.tax;
  const lower = tax?.lower ?? 0;
  const upper = tax?.upper ?? 0;
  if (upper > lower + 4) return TAX_STRUCTURES.progressive;
  if (lower > upper + 4) return TAX_STRUCTURES.regressive;
  return TAX_STRUCTURES.flat;
}

/** Uc oranin duz ortalamasi: gunluk/ozet metinleri icin tek sayi. */
export function averageTaxRate(nation) {
  const tax = nation?.economy?.tax;
  if (!tax) return 0;
  return TAX_CLASS_IDS.reduce((sum, id) => sum + (tax[id] ?? 0), 0) / TAX_CLASS_IDS.length;
}

/** Bir sinifin fiilen odedigi oran (%). */
export function classTaxRate(nation, classId) {
  return clamp(nation?.economy?.tax?.[classId] ?? 0, 0, 100);
}

/**
 * BES KONTROLUN SINIRLARI — TEK YER. Oyuncu ve YZ ayni kapidan gecer; eskiden
 * YZ'nin kendi tavanlari (vergi 35/42/45) yalnizca adjustFiscalAI'nin icinde
 * yasiyordu ve oyuncunun kaydiraci 0-100'du. Artik boyle bir ayrim yok.
 */
export function budgetPolicyLimits(nation) {
  const party = fiscalPolicyLimits(nation);
  return {
    taxLower: { min: 0, max: 100 },
    taxMiddle: { min: 0, max: 100 },
    taxUpper: { min: 0, max: 100 },
    tariff: { min: party.tariffMin, max: party.tariffMax },
    armyFunding: { min: party.armySpendingMin, max: party.armySpendingMax },
    education: { min: socialFloorOf(nation, 'education'), max: 100 },
    welfare: { min: socialFloorOf(nation, 'welfare'), max: 100 },
  };
}

/**
 * TEK AYAR KAPISI. Arayuz de YZ de burayi cagirir; alan dogrudan yazilmaz.
 * @returns {boolean} deger degisti mi
 */
export function setBudgetPolicy(nation, policy, value) {
  // Eski betikler icin takma ad: iki askeri kaydirac tek `armyFunding` oldu.
  if (policy === 'armySpending') policy = 'armyFunding';
  if (!nation?.economy || !BUDGET_POLICIES.includes(policy)) return false;
  // NaN/Infinity SESSIZCE GECMEZ. `clamp(Math.round(NaN))` NaN dondurur ve
  // deger alana oyle yazilirdi; oradan sonra butun butce NaN olurdu. Bozuk
  // girdi degeri hic degistirmez (sozlesme denetimi bunu yakaladi).
  if (!Number.isFinite(value)) return false;
  const limits = budgetPolicyLimits(nation)[policy];
  const next = clamp(Math.round(value), limits.min, limits.max);
  const taxClass = TAX_POLICY_CLASS[policy];
  if (taxClass) {
    if (nation.economy.tax[taxClass] === next) return false;
    nation.economy.tax[taxClass] = next;
    return true;
  }
  if (policy === 'education' || policy === 'welfare') {
    if (nation.economy.social[policy] === next) return false;
    nation.economy.social[policy] = next;
    return true;
  }
  // Istenen deger bandin disinda da hatirlanir: parti bandi daralip geri
  // genisleyince kaydirac oyuncunun/YZ'nin secimine doner (politics.js
  // applyGovernmentLimits). Bant disi istek kaydiracin mutlak araliginda
  // tutulur; efektif deger yine banttan gecer.
  if (policy === 'armyFunding' || policy === 'tariff') {
    nation.economy[`${policy}Wanted`] = clamp(Math.round(value), policy === 'tariff' ? -50 : 0, 100);
  }
  if (nation.economy[policy] === next) return false;
  nation.economy[policy] = next;
  return true;
}

/**
 * BUTCE DOKUMU — ekranin okudugu TEK kaynak.
 *
 * Arayuz burada hicbir formulu yeniden kurmaz. Eski surumde kuruyordu ve
 * ikisi ayrisiyordu: takviye notu `max(25,tedarik) x ikmal` yaziyordu, oysa
 * simulasyon `0.25 + fon x 0.75` kullaniyor — ekran %10 diyorken gercek %32.5
 * idi. Iyilesme notu ise ikmal terimini tamamen atlamisti.
 *
 * Her kontrol icin: NE DEGISTIRIR, NEYE MAL OLUR, NEYI IYILESTIRIR.
 */
/**
 * BIR SINIFIN VERGI ESIKLERI — iki sayi, ikisi de modelden turer, hicbiri
 * uydurulmaz.
 *
 *   survival — sinifin sepetinin %60 tabanini hala karsilayabildigi EN YUKSEK
 *              oran. Tabani `canAffordNeeds` koyar (needsBudget >= needsCost
 *              * 0.6); altina dusen sinif "sinif dususu" koluna girer.
 *   comfort  — sepetin TAMAMINI karsilayabildigi en yuksek oran, yani sinifin
 *              olagan hayatini surdurdugu tavan.
 *
 * Turetme: hane butcesi = net gelir + gecimlik; net gelir = gelir - vergi ve
 * vergi = gelir x oran (bkz. socialClass.taxPaid). Butceyi hedefe esitleyen
 * orani cozersen:
 *
 *     oran = (gelir - (hedef - gecimlik)) / gelir
 *
 * Geliri olmayan sinifta oran anlamsizdir; o durumda null doner ve ekran
 * isaret koymaz.
 */
/**
 * VERGI TUTMA KIPI — kaydiraci esige kilitler.
 *
 *   'safe' — yesil isaret: sinif sepetinin TAMAMINI karsilayabildigi en yuksek
 *            oran. Hazine az kazanir, nufus yukselir.
 *   'edge' — kirmizi isaret: gecim tabanini hala tutturabildigi en yuksek oran.
 *            Hazine cok kazanir, sinif dusmez ama zenginlesmez de.
 *
 * Neden gerekli: esikler her hafta oynuyor (sepet fiyati, gelir, refah), yani
 * elle kurulan bir oran birkac hafta sonra kirmizinin ustune kayabiliyor ve
 * oyuncu bunu ancak sinif dustugunde fark ediyordu (olculdu: tam vergiyle
 * 400 haftada ust sinif 45.6K -> 9.0K). Kilit, oyuncunun niyetini koruyor.
 *
 * Devirden AYRIDIR: Budget AUTO butun defteri YZ'ye verir, bu yalniz bir
 * kaydiraci bir esige baglar.
 */
export const TAX_HOLD_MODES = ['safe', 'edge'];

export function taxHold(nation, classId) {
  return nation?.economy?.taxHold?.[classId] ?? null;
}

export function setTaxHold(nation, classId, mode) {
  if (!nation?.economy) return false;
  const holds = nation.economy.taxHold ?? (nation.economy.taxHold = {});
  holds[classId] = TAX_HOLD_MODES.includes(mode) ? mode : null;
  return true;
}

/** Kilitli kaydiraclari bu haftanin esigine cek. Haftalik fazdan cagrilir. */
export function applyTaxHolds(nation) {
  const holds = nation?.economy?.taxHold;
  if (!holds) return;
  for (const [classId, mode] of Object.entries(holds)) {
    if (!mode) continue;
    const th = classTaxThresholds(nation, classId);
    if (!th) continue;
    const reachable = mode === 'safe' ? th.comfortReachable : th.survivalReachable;
    if (!reachable) continue;
    const policy = Object.keys(TAX_POLICY_CLASS).find((id) => TAX_POLICY_CLASS[id] === classId);
    if (policy) setBudgetPolicy(nation, policy, mode === 'safe' ? th.comfort : th.survival);
  }
}

export function classTaxThresholds(nation, classId) {
  const socialClass = nation?.economy?.classes?.[classId];
  const income = socialClass?.income ?? 0;
  if (!socialClass || income <= 0) return null;
  const need = socialClass.needsCost ?? 0;
  const subsistence = socialClass.subsistence ?? 0;
  const limits = budgetPolicyLimits(nation);
  const policy = Object.keys(TAX_POLICY_CLASS).find((id) => TAX_POLICY_CLASS[id] === classId);
  const span = limits[policy] ?? { min: 0, max: 100 };
  const rateFor = (target) => {
    const netNeeded = Math.max(0, target - subsistence);
    return Math.floor(((income - netNeeded) / income) * 100);
  };
  const survivalRaw = rateFor(need * 0.6);
  const comfortRaw = rateFor(need);
  // ULASILABILIRLIK. Vergiyi sifira indirmek bile esigi tutturmuyorsa vergi
  // O SINIF ICIN KALDIRAC DEGILDIR: sepetin kendisi gelirin ustundedir.
  // Olculdu (hafta 26, 29 ulus): orta sinifin butcesi sepetinin %45'i,
  // yani her iki esik de tabana cakili cikiyordu. Iki isareti solda ust uste
  // gostermek oyuncuya "surekli acliktan oluyorlar ve suc sende" diyordu;
  // dogrusu "bu kaydiracin buraya gucu yetmez"tir.
  return {
    survival: clamp(survivalRaw, span.min, span.max),
    comfort: clamp(comfortRaw, span.min, span.max),
    survivalReachable: survivalRaw >= span.min,
    comfortReachable: comfortRaw >= span.min,
  };
}

export function budgetBreakdown(world, nation) {
  const economy = nation?.economy;
  if (!economy) return null;
  const ledger = economy.ledger ?? emptyLedger();
  const structure = taxStructureOf(nation);
  const limits = budgetPolicyLimits(nation);
  const scale = (economy.population ?? 0) / POPULATION_UNIT;

  // --- vergi: matrah x oran, sinif sinif -------------------------------------
  const classes = Object.keys(CLASS_INFO).map((id) => {
    const socialClass = economy.classes?.[id] ?? {};
    return {
      id,
      name: CLASS_INFO[id]?.name ?? id,
      population: socialClass.population ?? 0,
      income: socialClass.income ?? 0,
      rate: classTaxRate(nation, id),
      // Beyan edilen tutar TAM OLARAK hazineye giren tutardir; eskiden sinif
      // satirlari brut, gelir toplami netti ve ikisi tutmuyordu.
      collected: socialClass.taxPaid ?? 0,
    };
  });
  const taxBase = classes.reduce((sum, c) => sum + c.income, 0);
  const collected = classes.reduce((sum, c) => sum + c.collected, 0);

  // --- ordu: tek fon, uc gorunur sonuc --------------------------------------
  const funding = (economy.armyFunding ?? 100) / 100;
  const supply = clamp(economy.military?.supplyIndex ?? 1, 0, 1);

  // --- egitim: okuryazarlik stogu ve arastirma ------------------------------
  const educationLevel = socialLevel(nation, 'education');
  const literacy = clamp(economy.literacy ?? 0, 0, 1);

  const line = (id) => ledger[id] ?? 0;
  // GELIR/GIDER AYRIMI ISARETE GORE, BEYANA GORE DEGIL — `closeWeek` de aynisini
  // yapar (treasury.js: financing kind'a gore, gerisi `value >= 0` ile). Ikisi
  // ayrilinca ekran defterle tutmuyordu: `settlement` satiri "income" beyan
  // edilmisti ama dis denge EKSIYE de duser; eksi degerdeki satir gelir
  // toplamini dusuruyor, gider toplamina ise hic girmiyordu. Olculdu (butce
  // sozlesmesi §5): iki tarafta da 0.94 sapma. Tek kavramin tek dogrusu olur.
  const rows = (kind) => Object.entries(LEDGER_LINES)
    .filter(([id, meta]) => (kind === 'financing'
      ? meta.kind === 'financing'
      : meta.kind !== 'financing'
        && (kind === 'income' ? line(id) >= 0 : line(id) < 0)))
    .map(([id, meta]) => ({ id, label: meta.label, amount: line(id) }))
    .filter((row) => Math.abs(row.amount) > 0.005);

  return {
    treasury: nation.gold ?? 0,
    debt: nation.debt ?? 0,
    balance: ledger.net ?? 0,
    income: ledger.income ?? 0,
    expenses: ledger.expenses ?? 0,
    unreconciled: ledger.unreconciled ?? 0,
    incomeRows: rows('income'),
    expenseRows: rows('expense'),
    financingRows: rows('financing'),
    controls: {
      ...Object.fromEntries(TAX_CLASS_IDS.map((id) => {
        const policy = `tax${id[0].toUpperCase()}${id.slice(1)}`;
        const row = classes.find((c) => c.id === id);
        return [policy, {
          value: economy.tax?.[id] ?? 0,
          ...limits[policy],
          classId: id,
          className: row?.name ?? id,
          // Oyuncuya duz cumle. Sayilar canli, cumle sabit: ikisi de buradan
          // gelir, ekran hicbirini uydurmaz.
          explain: `The share of ${row?.name ?? id} income taken as tax. Raising it `
            + 'fills the treasury and makes that class poorer and angrier; lowering '
            + 'it does the reverse.',
          base: row?.income ?? 0,
          collected: row?.collected ?? 0,
          population: row?.population ?? 0,
          // Kaydiracin uzerine konan iki isaret; ekran bunlari hesaplamaz.
          thresholds: classTaxThresholds(nation, id),
          hold: taxHold(nation, id),
        }];
      })),
      taxSummary: {
        structure: structure.label,
        structureId: structure.id,
        base: taxBase,
        collected,
        classes,
      },
      tariff: {
        value: economy.tariff ?? 0,
        ...limits.tariff,
        explain: 'A tax on imported goods. It earns money, but every factory and '
          + 'household that buys from abroad pays more — so factories that depend '
          + 'on imports earn less. A negative tariff subsidises imports instead: '
          + 'the treasury pays, and import-dependent factories earn more.',
        imports: economy.trade?.importValue ?? 0,
        revenue: line('tariff'),
        // Ithal malin sepetteki fiyatini bu kadar buyutur (populationDemand).
        priceEffect: economy.tariff ?? 0,
      },
      armyFunding: {
        value: economy.armyFunding ?? 100,
        ...limits.armyFunding,
        explain: 'Soldier pay and supply. Higher funding means your divisions fight '
          + 'harder, recover faster and train quicker — and cost more every week. '
          + 'Your government sets the legal ceiling.',
        cost: Math.abs(line('army')) + Math.abs(line('procurement')),
        supply,
        // GERCEK formuller (battles.js, reinforcement.js, turn.js, recruitment.js)
        combatPower: 0.55 + funding * 0.45,
        reinforcement: 0.25 + Math.max(0.25, funding) * supply * 0.75,
        training: 0.45 + 0.4 * funding + 0.15 * supply,
      },
      education: {
        value: economy.social?.education ?? 0,
        ...limits.education,
        explain: 'Schools. Literacy climbs slowly toward the target this budget '
          + 'sets, and literacy is what produces research. More research means '
          + 'technology arrives earlier. The cost grows with your population.',
        cost: programmeCost(nation, 'education'),
        literacy,
        literacyTarget: literacyTargetOf(nation),
        researchPoints: researchPointsOf(nation),
      },
      welfare: {
        value: economy.social?.welfare ?? 0,
        ...limits.welfare,
        explain: 'Relief and public health. People are more satisfied and the '
          + 'population grows faster. Satisfaction holds the country stable and '
          + 'keeps your government in power. The cost grows with your population.',
        cost: programmeCost(nation, 'welfare'),
        // Memnuniyet formulundeki gercek terim (populationDemand).
        satisfaction: socialLevel(nation, 'welfare') * 0.14,
        // Nufus buyume carpani (provinces.js).
        growth: 1 + socialLevel(nation, 'welfare') * 0.35,
      },
    },
    scale,
  };
}

/** Bir politikanin su anki degeri (arayuz ve YZ ayni okumayi paylassin). */
export function budgetPolicyValue(nation, policy) {
  const taxClass = TAX_POLICY_CLASS[policy];
  if (taxClass) return nation?.economy?.tax?.[taxClass] ?? 0;
  if (policy === 'education' || policy === 'welfare') return nation?.economy?.social?.[policy] ?? 0;
  return nation?.economy?.[policy] ?? 0;
}

/**
 * SUBVANSIYON — TEK KURAL, IKI TARAF ICIN AYNI.
 *
 * Eskiden oyuncunun bir acilir menusu (`subsidyPolicy`), YZ'nin ise bambaska
 * bir kod yolu vardi: ayni saklanan alan sahibine gore FARKLI anlama geliyordu.
 * Ustelik butcesini devreden oyuncunun sectigi politika ayni fonksiyon
 * cagrisinda YZ tarafindan eziliyordu.
 *
 * Kural artik tek cumle: savasta silah ve muhimmat fabrikalari zarar
 * ediyorsa desteklenir, baris gelince destek kalkar. Kaydirac degil, devlet
 * refleksi. Tekil isaretleme Fabrikalar ekranindan yapilmaya devam eder.
 */
const STRATEGIC_FACTORY_TYPES = new Set(['ARMS_FACTORY', 'AMMUNITION_FACTORY']);

/** Korumaci YZ hukumetinin surundugu gumruk (%). */
const PROTECTIONIST_TARIFF = 50;

function applySubsidyPolicy(world, nation) {
  const wartime = world.nations.some(
    (other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id),
  );
  for (const factory of nation.economy.factories ?? []) {
    if (!STRATEGIC_FACTORY_TYPES.has(factory.typeId)) continue;
    factory.subsidized = wartime && factory.profit < 0;
  }
}

/** Sosyal programların bu haftaki toplam altın gideri. */
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
  if (programId !== 'education') return 0;
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
  const scale = (economy.population ?? 0) / POPULATION_UNIT;
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
  const scale = economy.population / POPULATION_UNIT;
  let total = 0;
  for (const program of Object.values(SOCIAL_PROGRAMS)) {
    total += scale * socialLevel(nation, program.id) * program.rate;
  }
  // Yasayla verilen hak kaydıraçtan ayrıdır ve kısılamaz.
  return total + scale * reformModifiers(nation).socialBurden;
}

function addFlow(market, goodId, kind, amount) {
  if (!market.goods[goodId] || !Number.isFinite(amount) || amount <= 0) return;
  market.goods[goodId][kind] += amount;
}

/**
 * Akis nesneleri YERINDE sifirlanir, kimlikleri korunur: her hafta ulke basina
 * 43 yeni nesne kurmak olculebilir cop uretiyordu (~1.8 MB/hafta) ve akislari
 * elinde tutan hicbir okuyucu (UI, defter) taze nesne beklemiyor.
 */
function resetNationGoodsFlow(nation) {
  const flows = nation.economy.goodsFlow ??= emptyGoodsFlow();
  for (let i = 0; i < GOOD_IDS.length; i++) {
    const id = GOOD_IDS[i];
    const flow = flows[id] ??= emptyGoodFlow();
    // This is last week's import reliance. Population prices use it until the
    // current week's world market has been cleared below.
    const importShare = clamp(flow.importShare ?? 0, 0, 1);
    // Geçen haftanın ülke bazlı karşılanma oranı. Şimdilik yalnız kayıt:
    // fabrika girdisine bağlamak iki kez denendi ve geri alındı (bkz.
    // runFactories'teki not) — dünya arzı yapısal olarak kıtken her ülkeyi
    // kronik cezalandırıyordu. Arz sorunu çözülünce (RGO kapasitesi) erişim
    // cezası buradan yeniden kurulmalı.
    const fulfilledShare = (flow.demand ?? 0) > 0
      ? clamp((flow.fulfilled ?? 0) / flow.demand, 0, 1)
      : 1;
    flow.production = 0;
    flow.demand = 0;
    flow.retained = 0;
    flow.domestic = 0;
    flow.imports = 0;
    flow.exports = 0;
    flow.fulfilled = 0;
    flow.shortage = 0;
    flow.importShare = importShare;
    flow.fulfilledShare = fulfilledShare;
  }
  resetTradeSummary(nation);
}

/** Ticaret ozetini yerinde sifirlar (bkz. resetNationGoodsFlow gerekcesi). */
function resetTradeSummary(nation) {
  const trade = nation.economy.trade ??= emptyTradeSummary();
  trade.lastUpdated = 0;
  trade.imports = 0;
  trade.exports = 0;
  trade.importValue = 0;
  trade.exportValue = 0;
  trade.balance = 0;
  trade.tariffRevenue = 0;
  trade.settlement = 0;
  return trade;
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
  // Silah altindakiler nufusun ICINDEDIR; isgucu tavani icin ayrica bilinir
  // (bkz. civilianLower). Asker tarlada da fabrikada da calismaz.
  economy.soldiersUnderArms = provinceSoldiers(world, nation.id);
  reconcilePopulation(nation, population);
}

/**
 * Province'lerin ham üretimi. Eskiden yalnız dört kalem (bütçeden food/timber/
 * iron, karelerden coal) pazara giriyordu; artık RGO tablosundaki her mal
 * doğrudan buradan akar, yoksa yeni hammaddeler hiç üretilmemiş olurdu.
 */
// provinceOutput icin tekrar kullanilan karalama nesnesi. Omru TEK
// rawProduction cagrisiyla sinirlidir; disari referans verilmez.
const provinceOutputScratch = {};

// runNationEconomy'nin ulusal cikti biriktirici karalamasi (bkz. oradaki not).
const nationOutputScratch = emptyGoods();

function rawProduction(world, nation, market, output) {
  // Gübre tarımı besler: sanayi → tarım yönünde tek bağ budur ve gübre
  // fabrikasına gerçek bir müşteri kazandırır. Geçen haftanın karşılanma
  // oranı kullanılır, bu haftaki pazar henüz temizlenmedi.
  const fertilizer = nation.economy.goodsFlow?.fertilizer;
  const fertilized = fertilizer?.demand > 0
    ? clamp((fertilizer.fulfilled ?? 0) / fertilizer.demand, 0, 1) : 0;
  const farmBonus = 1 + fertilized * 0.25;
  // Cikarim isletmelerinin haftalik pazar degeri. Sirket katmani madenlerin
  // sahibini buradan okur: ayri bir tarama
  // yapilmaz, zaten donulen kumeler uzerinde tek carpim biriktirilir.
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
        const value = amount * priceOf(world, id);
        extraction.value += value;
        extraction.byGood[id] = (extraction.byGood[id] ?? 0) + amount;
      }
    }
  }
  // Talep, ekilen alana orantılı: büyük tarım ülkesi daha çok gübre ister.
  let farmland = 0;
  for (const id in output) {
    if (AGRICULTURE_GOODS.has(id)) farmland += output[id];
  }
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
  for (const id in output) {
    const amount = output[id];
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
/**
 * OYUNCUNUN ELIYLE SEVIYE ATLATMASI. Otomatik yukseltme (asagida) kapitalistin
 * kendi kararidir ve kendi kapilari vardir; bu ise devletin hazineden odedigi
 * bir insaat kalemidir. Ikisi ayni kuyruga, ayni PROJECT_KIND.UPGRADE
 * projesine girer — tek fark parayi kimin verdigidir.
 *
 * @returns {string|null} engel sebebi; null ise proje acildi
 */
export function upgradeFactory(game, nation, factoryId) {
  const factory = (nation.economy?.factories ?? []).find((f) => f.id === factoryId);
  if (!factory) return 'No such plant';
  if (factory.level >= MAX_FACTORY_LEVEL) return 'Already at the maximum level';
  const state = ensureConstruction(nation);
  if (state.projects.some((project) => project.kind === PROJECT_KIND.UPGRADE
    && project.factoryId === factory.id)) return 'An expansion is already queued';
  if (!factoryInvestmentRules(nation).stateExpand) return 'Policy forbids state investment';
  const cost = expansionCost(factory);
  if ((nation.gold ?? 0) < (cost.gold ?? 0)) {
    return `Treasury short by £${Math.ceil((cost.gold ?? 0) - (nation.gold ?? 0))}`;
  }
  if (!payFactoryCost(nation, cost, 'state')) return 'The treasury could not pay';
  queueIndustryProject(game, nation, {
    kind: PROJECT_KIND.UPGRADE,
    typeId: factory.typeId,
    factoryId: factory.id,
    regionName: FACTORIES[factory.typeId].name,
    q: factory.q,
    r: factory.r,
    work: Math.max(6, Math.round((cost.gold ?? 0) * WORK_PER_GOLD * 0.8)),
    cost: cost.gold ?? 0,
    funded: cost.gold ?? 0,
    actor: 'state',
  });
  return null;
}

/**
 * TESISI KAPATMA. Yikim degil TASFIYE: kadro serbest kalir, uretim durur,
 * tesis kayittan duser. IADE YOKTUR — kurulusa harcanan para gitmistir; iade
 * verseydik "kur-boz" bedava bir para kaynagi olurdu.
 *
 * Bekleyen yukseltme projesi de duser ve ODENMIS pay hazineye geri yazilir:
 * o para henuz harcanmamis bir taahhuttu (bkz. cancelConstruction ile ayni
 * kural).
 */
export function closeFactory(game, nation, factoryId) {
  const factories = nation.economy?.factories ?? [];
  const index = factories.findIndex((f) => f.id === factoryId);
  if (index < 0) return false;
  const [factory] = factories.splice(index, 1);
  const state = ensureConstruction(nation);
  for (let i = state.projects.length - 1; i >= 0; i--) {
    const project = state.projects[i];
    if (project.kind !== PROJECT_KIND.UPGRADE || project.factoryId !== factoryId) continue;
    if (project.actor === 'private') refundPrivateProject(nation, project);
    else if (project.funded > 0) settle(nation, 'construction', project.funded);
    state.projects.splice(i, 1);
  }
  // Kadro ulusal havuza doner; province sayaci bir sonraki `runFactories`ta
  // zaten sifirdan kurulur, burada elle duzeltmek cift sayim olurdu.
  if (nation.id === game.turns.playerNation) {
    game.turns.addLog(`${FACTORIES[factory.typeId]?.name ?? factory.typeId} closed;`
      + ` ${Math.round(factory.employees ?? 0)} workers released.`, { kind: 'INDUSTRY' });
    game.emit('economy', nation.economy);
  }
  return true;
}

/**
 * OLU TESISI TASFIYE ET. `closeFactory` yalnizca oyuncunun ekranindan
 * cagriliyordu; YZ'nin kapatma yolu YOKTU. Sonuc olculdu (2 tohum, 1936):
 * dunyadaki 550 tesisin 350'si beklenen marji <= 0 oldugu icin ise alima
 * kapaliydi, ortalama %32 doluluktaydi ve kapasitenin %57'sini tutuyordu.
 * Ulusal dolulugun yuzyil boyunca %45'te takilmasinin sebebi buydu: paydada
 * hic dolmayacak kapasite birikiyordu (H4).
 *
 * Kapanma kosulu iki katli — tesis hem SURELI zararda hem de BOS olmali.
 * Tek kosul yetmez: yeni biten tesis kadrosuz dogar (bos ama olu degil),
 * gecici fiyat cukurunda kalan dolu tesis de zararda olabilir.
 */
const DEAD_FACTORY_MONTHS = 240;
const DEAD_FACTORY_FILL = 0.05;

function retireDeadFactories(game, nation) {
  const factories = nation.economy?.factories ?? [];
  let closed = 0;
  for (const factory of [...factories]) {
    const jobs = factoryJobs(factory);
    const bos = (factory.employees ?? 0) <= jobs * DEAD_FACTORY_FILL;
    if (!bos || expectedMargin(game.world, nation, factory) > 0) {
      factory.deadMonths = 0;
      continue;
    }
    factory.deadMonths = (factory.deadMonths ?? 0) + 1;
    // Ayda en fazla bir tasfiye: bir ulkenin sanayisi tek ayda cokmesin.
    // Sirada bekleyen tesis sayacini tutar, gelecek ay kapanir.
    if (factory.deadMonths < DEAD_FACTORY_MONTHS || closed) continue;
    if (closeFactory(game, nation, factory.id)) closed++;
  }
}

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
  // Odeme gucu kapisi yukseltmede de gecerli — olculdu: kuyrugu dolduran sey
  // yeni tesis degil, tam da bu yukseltmelerdi (3 proje, £435 defter, haftalik
  // sermaye £0.58 → 750 hafta).
  if (actor === 'private' && (cost.gold ?? 0) > privateCommitRoom(nation)) return false;
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
 *
 * Sıra KUYRUK sırası değil, BİTMEYE KALAN sırasıdır. Kuyruk sırasıyla dağıtan
 * eski sürümde baştaki pahalı yükseltme (kalan £218, haftalık sermaye ~£0.17)
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
  //
  // TERK EDILEN SANTIYE DUSER. Uyku tek başına yetmiyordu: bir yıl boyunca
  // neredeyse hiç para akmamış proje kuyrukta SONSUZA KADAR kalıyor, ekranda
  // "inşaat var" diye görünüyor ve oyuncunun kendi kuyruğunu okunmaz hale
  // getiriyordu (ölçüldü: 27 ulusun hepsinde 2-6 böyle şantiye). Bir yılda
  // maliyetin onda birini bile toplayamamış defter kapanır, ödenen iade edilir.
  for (let i = state.projects.length - 1; i >= 0; i--) {
    const project = state.projects[i];
    if (project.actor !== 'private') continue;
    const stalled = privateStalled(project, turn);
    if (Boolean(project.dormant) !== stalled) project.dormant = stalled;
    if (!stalled || project.funded >= project.cost * 0.1) continue;
    refundPrivateProject(nation, project);
    state.projects.splice(i, 1);
  }
}

/** Iade ulusal ozel sermaye havuzuna doner. */
function refundPrivateProject(nation, project) {
  if (!(project.funded > 0) || !nation.politics) return;
  nation.politics.privateCapital = (nation.politics.privateCapital ?? 0) + project.funded;
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
        // Ayrimi tutmasak iade sessiz bir sermaye transferi olurdu.
        refundPrivateProject(nation, project);
      } else {
        // Iade defterli: eski surumde bu satir hazineyi buyutuyor ama
        // hicbir kaleme yazmiyordu ve L9 kimligi tam iade kadar bozuluyordu.
        settle(nation, 'construction', project.funded);
      }
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
  settle(nation, 'construction', -paid);
  // Hazine desteği projeyi uyandırır: oyuncunun parası da "sermaye akışı"dır.
  project.fundedTurn = game.world.turn;
  project.dormant = false;
  // Proje desteği inşaat kalemine yazılır (settle: 'construction').
  game.emit('construction', state);
  game.emit('economy', nation.economy);
  return true;
}

/**
 * Tesisin bir birim throughput için çıktı tablosu. Silah fabrikasının çıktısı
 * seçili üretim hattına bağlıdır, tabloya doğrudan bakmak yetmez.
 */
export function factoryOutputs(factory, type) {
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
  // Beklenen marj emek payindan SONRAKI kar: ise alim/buyume kararlari
  // sahibin eline gecen parayla ayni olcutu kullansin.
  return ((revenue - cost) * (1 - LABOR_SHARE)) / revenue;
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

  // Once tasfiye: kapanan tesisin kapasitesi bu ayin doluluk hesabina girmesin.
  retireDeadFactories(game, nation);

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

  // Eğitim ve yüksekögretim kurumu işgücünü niteliklendirir: aynı nüfus daha
  // hızlı akar (eski üniversite binasının sayacı kurum seviyesine taşındı).
  // Okuryazarlik stogu ise alimi da surer (bkz. runPromotion notu).
  // Okuryazarlık DOĞRUSAL değil ÜSTEL sürer. Doğrusal çarpanla (1 + oku×0.5)
  // cahil ülke de işçi akıtıyordu; Vic2'de fabrikaya adam gelmesi
  // okuryazarlık eşiğini geçince ivmelenir. Kare alınca ilk yarım yüzyıl
  // yavaş, sonrası hızlı olur — reel GSYH eğrisiyle aynı biçim.
  const schooling = 1 + clamp(economy.literacy ?? 0, 0, 1) ** 2 * 2.5
    + socialLevel(nation, 'education') * 0.25
    + higherEducationBonus(nation);
  const lower = civilianLower(economy);
  const employed = factories.reduce((sum, factory) => sum + factory.employees, 0);
  // KIRDAN SANAYIYE GECIS ARTIK BIR SAYAC ISLEMI DEGIL. Eskiden burada
  // `farmers` sayacindan bir kohort dusup `workers` sayacina ekleniyordu;
  // artik ciftci ile isciyi ayiran sey tesisin kendi kadrosudur (jobTotalsOf).
  // Ise alim tesise adam yazar, ciftci sayisi kendiliginden azalir.
  // Memnuniyetsiz nüfus fabrikaya akmaz; açlık sınırındaki işçi göç eder.
  const willingness = 0.65 + (economy.classes.lower.satisfaction ?? 0.6) * 0.5;
  const pool = Math.max(0, Math.min(
    lower * MONTHLY_HIRE_RATE * schooling * willingness,
    // Tavan artık soyut bir oran değil, gerçekten işçi olan nüfus.
    // Tavan iki kapinin dari: sinifin calisabilir payi ve mutlak tavan.
    Math.min(lower * LOWER_WORKFORCE_SHARE, lower * MAX_WORKER_SHARE) - employed,
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
  // Ama tek tesis ayda kadrosunun en fazla FACTORY_HIRE_CAP'i kadar alir:
  // isci yetismesi, tasinmasi, egitilmesi zaman ister. Tavansiz olculdu
  // (2026-09-04, 2 tohum): sonradan kurulan tesislerin dortte biri 13
  // haftadan kisa surede %90'a doluyordu — Vic2'de fabrika doldurmak
  // yillar alir ve sonradan ivmelenir. Siralama korunur: en karli tesis
  // yine ilk payi alir, ikinci ve ucuncu ayni ay pay gorur.
  let left = pool;
  for (const factory of hiring) {
    if (left <= 0) break;
    const monthly = Math.max(1, factoryJobs(factory) * FACTORY_HIRE_CAP);
    const hired = Math.min(left, factoryVacancies(factory), monthly);
    factory.employees += hired;
    economy.industrialHiring += hired;
    left -= hired;
  }

  for (const factory of factories) autoUpgradeFactory(game, nation, factory);
}

function runFactories(world, nation, market, ownOutput, inputAvailability) {
  const economy = nation.economy;
  const reformMods = reformModifiers(nation);
  let totalProfit = 0;
  // SANAYININ GSYH'YE KATKISI KATMA DEGERDIR, HASILAT DEGIL. Eskiden burada
  // `industrialOutput += fiyat × miktar` birikiyordu, yani fabrika hasilatinin
  // tamami. Demir cevheri RGO'da bir kez, celigin hasilatinda bir daha, aletin
  // hasilatinda bir daha sayiliyordu — klasik cift sayim. Olculdu (2 tohum,
  // 30 yil): GSYH 1.64x/1.69x sisiyor, sanayinin payi 6.65x/7.61x abartiliyor
  // ve buyuk guc siralamasinda 16/31 ve 13/26 ulke yer degistiriyor. Dogru
  // sayi (`valueAdded`) zaten asagida hesaplaniyordu ve yalnizca bordroda
  // kullaniliyordu.
  let industrialValueAdded = 0;
  // Ayni toplam TABAN fiyatlarla: buyume egrisini ancak reel seri gosterir.
  let industrialReal = 0;
  // Bordro bu hafta sifirdan birikir; fiscalBalance sinif gelirine dagitir.
  economy.wagesPaid = 0;

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

  // BANLIYO DUZELTMESI. Kadro ULUSAL havuzdan dolar ama tamamı fabrika
  // province'ine yazilir; kadro yerel nufusu asinca (olculdu: 12.797 kadro /
  // 8.989 nufus) fazlasi baska provinslerde oturan insanlardir. Eskiden bu
  // fazla HICBIR yerden dusulmuyordu: fabrika province'inin kirsali sifira
  // kirpilirken komsu provinsler tam kirsal nufusla RGO isletiyordu — emek
  // yoktan var oluyordu. Fazla, ulkenin diger provinslerine nufus oraninda
  // "banliyoculuk" olarak yazilir; provinces.js kirsali hesaplarken duser.
  {
    const mine = (world.provinces ?? [])
      .filter((province) => province.owner === nation.id && province.econ)
      .map((province) => province.econ);
    for (const econ of mine) econ.industrialCommuters = 0;
    const overfull = new Set();
    let overflow = 0;
    for (const factory of economy.factories) {
      const econ = world.get(factory.q, factory.r)?.province;
      if (econ && !overfull.has(econ)
        && econ.industrialEmployees > Math.max(0, econ.population)) {
        overfull.add(econ);
        overflow += econ.industrialEmployees - Math.max(0, econ.population);
      }
    }
    if (overflow > 0) {
      const hosts = mine.filter((econ) => !overfull.has(econ));
      const totalPop = hosts.reduce((sum, econ) => sum + Math.max(0, econ.population), 0);
      if (totalPop > 0) {
        for (const econ of hosts) {
          econ.industrialCommuters = overflow * (Math.max(0, econ.population) / totalPop);
        }
      }
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
    let inputFulfillment = 1;
    for (const id in type.inputs) {
      inputFulfillment = Math.min(inputFulfillment, inputAvailability[id] ?? 1);
    }
    // Çalışma saati / güvenlik / çocuk işçi yasaları üretimi bir miktar kısar;
    // teknoloji buyutur. `factoryThroughput` hesaplanip hic okunmuyordu (P1-6).
    const techMods = economy.techMods ?? null;
    const throughput = laborThroughput * inputFulfillment * reformMods.throughput
      * (1 + (techMods?.factoryThroughput ?? 0));
    factory.throughput = throughput;
    factory.inputFulfillment = inputFulfillment;

    // Girdi verimi: ayni cikti daha az hammaddeyle. Bu ayni zamanda P1-1b'nin
    // talep-tarafi adayi — sanayi buyudukce girdi talebi CIKTIDAN yavas
    // buyusun diye tam bu kanal onerilmisti. Tavan 0.5: verim girdiyi yaridan
    // fazla silemez, yoksa zincirin alt katmani issiz kalir.
    const inputScale = clamp(1 - (techMods?.inputEfficiency ?? 0), 0.5, 1);

    let revenue = 0;
    let inputCost = 0;
    // Reel ikizler TABAN fiyatla degerlenir ve TARIFE ICERMEZ: gumruk bir
    // transferdir, uretilen mal degil. Nominal maliyet tarifeyi icermeye devam
    // eder cunku bordronun tabani odur (bkz. valueAdded) ve o dengeye dokunmak
    // bu duzeltmenin isi degil.
    let realRevenue = 0;
    let realInputCost = 0;
    for (const id in type.inputs) {
      const amount = type.inputs[id] * inputScale;
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
      realInputCost += basePriceOf(id) * consumed;
    }
    if (factory.typeId === 'ARMS_FACTORY') {
      const line = ensureProductionLine(factory);
      if (throughput > 0.05) line.lineEfficiency = Math.min(1, line.lineEfficiency + 0.025);
      line.lineOutput = 0;
    }
    const outputs = factoryOutputs(factory, type);
    for (const id in outputs) {
      const qty = outputs[id] * throughput;
      addFlow(market, id, 'supply', qty);
      addNationFlow(nation, id, 'production', qty);
      ownOutput[id] = (ownOutput[id] ?? 0) + qty;
      revenue += priceOf(world, id) * qty;
      realRevenue += basePriceOf(id) * qty;
      if (factory.typeId === 'ARMS_FACTORY') factory.lineOutput += qty;
    }
    // İşçi, girdi kıtlığında üretim düşse de fabrikada kalır ve ücretini alır.
    // Reformun faturası burada somutlaşır: kâr daralır, üretim değil.
    // Ucret = katma degerin emek payi (bkz. LABOR_SHARE): fiyat seviyesiyle
    // olceklenir ve fiscalBalance'ta sinif gelirine GERCEKTEN odenir.
    const valueAdded = Math.max(0, revenue - inputCost);
    // TEK TANIM: ayni katma deger hem bordronun tabani hem GSYH'nin sanayi
    // terimi. Iki ayri yerde yazilsaydi biri kayinca ekran defteri tutmazdi.
    industrialValueAdded += valueAdded;
    industrialReal += Math.max(0, realRevenue - realInputCost);
    const wages = valueAdded * Math.min(0.85, LABOR_SHARE * reformMods.wageCost);
    economy.wagesPaid += wages;
    // Tesis basina bordro sahada dursun: denetim VA = ucret + kar kimligini
    // tesis tesis dogrulayabilir, ekran "ucret gideri" gosterebilir.
    factory.wages = wages;
    factory.profit = revenue - inputCost - wages;
    // Sübvansiyon: işaretli tesisin zararını devlet kapatır. Sahte sabit
    // maliyet yok — ödeme gerçekleşen zararın kendisidir ve kâr 0'a çekilir
    // ki kâr eğilimi (işten çıkarma) tesisi desteklenmiş görsün. Bedel
    // deftere subsidyCost olarak düşer; kapatmak tek tık (bkz. ekran).
    factory.subsidyPaid = 0;
    if (factory.subsidized && factory.profit < 0) {
      const support = -factory.profit;
      settle(nation, 'subsidy', -support);
      factory.subsidyPaid = support;
      factory.profit = 0;
    }
    factory.margin = revenue > 0 ? factory.profit / revenue : 0;
    totalProfit += factory.profit;
  }

  economy.factoryProfit = totalProfit;
  return { value: industrialValueAdded, real: industrialReal };
}

// Sinif sepetlerinin onceden acilmis [goodId, need] listeleri: tablo statik,
// her hafta ulke basina Object.entries kurmak bosuna coptu.
const CLASS_NEEDS_ENTRIES = CLASS_IDS.map(
  (classId) => [classId, Object.entries(CLASS_NEEDS[classId])],
);

/**
 * Istikrarin agirliklari. Hepsi ORANDIR (0-1) ve dogrudan istikrardan duser;
 * boylece ekranda "isgal -12" gibi gercek bir kalem gosterilebilir.
 */
const STABILITY_WEIGHTS = {
  occupation: 0.38,
  war: 0.14,
  unemployment: 0.22,
};

/**
 * Ulusal istikrar ve NEDEN o seviyede oldugu.
 *
 * Eskiden tek satirdi: `stability = satisfactionWeighted / population`. Yani
 * girdisi yalnizca hane memnuniyetiydi — ve memnuniyet de yavas hareket eden
 * odenebilirlik/vergi teriminden geliyordu. Beta'nin gozlemi tam olarak bunun
 * sonucu: **60 yil boyunca %44'te dondu**, uc esz amanli savas, isgal ve
 * nufusun ucte ikisinin dusman kontrolunde olmasi hicbir sey degistirmedi.
 * Isgal, savas yorgunlugu ve issizlik girdi DEGILDI.
 *
 * `breakdown` gercek simulasyon degerleridir (uydurma yok): butce/siyaset
 * ekrani "WHY THE PRICE MOVES" kalibini buradan besler.
 */
/**
 * Issizlik: sanayi kapasitesine gore is arayan var ama tezgah yok.
 *
 * TEK KAYNAK — hem istikrar hem hane memnuniyeti buradan okur. Iki yerde iki
 * ayri formul olsaydi ekrandaki "issizlik -6" ile hanenin hissettigi issizlik
 * birbirini tutmazdi.
 */
function unemploymentOf(nation) {
  const economy = nation.economy;
  const jobs = industrialJobs(nation);
  const workers = economy.classes?.lower?.population ?? 0;
  const employed = (economy.factories ?? []).reduce((s, f) => s + (f.employees ?? 0), 0);
  const seeking = Math.max(0, Math.min(workers, jobs) - employed);
  return { rate: jobs > 0 ? clamp(seeking / jobs, 0, 1) : 0, seeking };
}

function updateStability(world, nation, base) {
  const economy = nation.economy;
  const occupation = clamp(economy.occupiedShare ?? 0, 0, 1);
  const war = clamp(economy.warStrain ?? 0, 0, 1);
  const { rate: unemployment, seeking } = unemploymentOf(nation);

  const occupationHit = -occupation * STABILITY_WEIGHTS.occupation;
  const warHit = -war * STABILITY_WEIGHTS.war;
  const unemploymentHit = -unemployment * STABILITY_WEIGHTS.unemployment;

  economy.stability = clamp(base + occupationHit + warHit + unemploymentHit, 0.03, 0.98);
  economy.stabilityBreakdown = {
    base,
    occupation: occupationHit,
    war: warHit,
    unemployment: unemploymentHit,
    occupiedShare: occupation,
    occupiedTiles: economy.occupiedTiles ?? 0,
    warFronts: economy.warFronts ?? 0,
    unemploymentShare: unemployment,
    unemployed: Math.round(seeking),
    total: economy.stability,
  };
}

function populationDemand(world, nation, market) {
  const economy = nation.economy;
  let totalCost = 0;
  let satisfactionWeighted = 0;
  let metWeighted = 0;
  let foodWeighted = 0;
  const welfare = socialLevel(nation, 'welfare');
  // Sinif dongusunden ONCE: memnuniyet bunu okuyacak (istikrar da ayni
  // fonksiyondan okur, bkz. unemploymentOf).
  const { rate: unemployment } = unemploymentOf(nation);

  for (let c = 0; c < CLASS_NEEDS_ENTRIES.length; c++) {
    const classId = CLASS_NEEDS_ENTRIES[c][0];
    const needsEntries = CLASS_NEEDS_ENTRIES[c][1];
    const socialClass = economy.classes[classId];
    const scale = socialClass.population / POPULATION_UNIT;
    let basket = 0;
    let basketAtBase = 0;
    // Kademe basina PARA maliyeti; butce bu sirayla harcanir.
    const tierCost = { life: 0, everyday: 0, luxury: 0 };
    // BIRINCI GECIS: sepetin *istenen* hali. Pazara henuz hicbir sey yazilmaz —
    // ne kadarini karsilayabildigini bilmeden talebi yazmak, tuketimi butceden
    // tamamen kopariyordu. Olculdu: alt sinif vergisi %0 -> %100 arasinda gecim
    // butcesi 330.1 -> 0.0 duserken sepet harcamasi 153.7 -> 160.2 CIKIYORDU;
    // yani parasi olmayan hane ayni mali almaya devam ediyordu. Bu kopukluk
    // verginin, gumrugun, refahin ve kitligin butun asagi yonlu etkilerini
    // birden olduruyordu (bkz. SYSTEM_AUDIT_REPORT KRITIK-2).
    let onShelf = 0;
    // Gida yarisi ayri tutulur: hane once bunu alir (bkz. FOOD_GOODS).
    let foodCost = 0;
    let foodAtBase = 0;
    let foodOnShelf = 0;
    for (let n = 0; n < needsEntries.length; n++) {
      const goodId = needsEntries[n][0];
      const need = needsEntries[n][1];
      const amount = needAmount(need, world.turn ?? 1);
      if (amount <= 0) continue;
      const quantity = amount * scale;
      // Tariffs only raise the imported share of a household basket. Last
      // week's share is used because this week's trade clears after all
      // nations have submitted supply and demand.
      const importShare = clamp(economy.goodsFlow?.[goodId]?.importShare ?? 0, 0, 1);
      // Taban 0: UI bandi disindan (raw) yazilan asiri negatif tarife sepet
      // bedelini eksiye cevirebiliyordu — eksi bedel, eksi gecimlik ve eksi
      // butce demekti (boundary denetimi yakaladi). Subvansiyon bedava
      // yapabilir, PARA ODEYEN sepet yapamaz.
      const tariffFactor = Math.max(0, 1 + (economy.tariff / 100) * importShare);
      const cost = priceOf(world, goodId) * quantity * tariffFactor;
      const baseCost = GOODS[goodId].basePrice * quantity;
      basket += cost;
      basketAtBase += baseCost;
      tierCost[needTier(need)] += cost;
      if (FOOD_GOODS.has(goodId)) { foodCost += cost; foodAtBase += baseCost; }
      // Rafta var mi: gecen haftanin karsilanma orani (bu haftanin ticareti
      // henuz kapanmadi). Parasi yetmek ile mal BULMAK ayri seylerdir; dunya
      // tahil uretimi tamamen kesildiginde hane hala "karsilayabiliyor"
      // gorunuyordu cunku fiyat artinca ucret endeksi de artiyor.
      //
      // Agirlik GUNCEL fiyat degil TABAN fiyattir. Guncel fiyatla olcunce
      // tavana yapismis kucuk bir luks (uretilmeyen likor, tabanda 0.16 pay)
      // sepetin %17'sini kapliyor, tabana cakili tahil ise %0.8'e dusuyordu:
      // beslenme endeksi fiyat bandinin patolojisini (bkz. rapor YUKSEK-16)
      // miras aliyordu. Taban fiyat sepetin TASARLANMIS bilesimidir.
      const shelf = baseCost * clamp(economy.goodsFlow?.[goodId]?.fulfilledShare ?? 1, 0, 1);
      onShelf += shelf;
      if (FOOD_GOODS.has(goodId)) foodOnShelf += shelf;
    }
    const availability = basketAtBase > 1e-9 ? clamp(onShelf / basketAtBase, 0, 1) : 1;
    const foodAvailability = foodAtBase > 1e-9 ? clamp(foodOnShelf / foodAtBase, 0, 1) : 1;
    // Ücretler fiyatları kısmen takip eder. Etmezse: geçim bütçesi sabit bir
    // sayı, geçim masrafı ise fiyatla 8 katına çıkabilen bir sayı olur ve ilk
    // ciddi kıtlıkta bütün sınıflar iflas eder. Ölçüldü: üst sınıf tamamen
    // yok oluyor, dolayısıyla kapitalist ve özel sermaye de kalmıyordu.
    // Katsayı 1 değil 0.6: enflasyon hâlâ acıtır, ama yok etmez.
    // HANE KIMLIGI: butce = net gelir + BEYAN EDILMIS gecimlik. Baska kanal
    // yok; para ya kazanilmistir ya ayni-gecimliktir. `subsistence` alani
    // denetim ve ekran icin acikta durur — famineDeaths gibi kayitli kanal.
    //
    // GECIMLIK GERCEGE DEMIRLIDIR: sinif, kendi sepetinin sabit bir REEL
    // payini (SUBSISTENCE_SHARE) kendi uretiminden karsilar — para degeri
    // guncel sepet fiyatiyla olur. Eski hali ucret-endeksli formul butcesine
    // carpandi ve fiyatla birlikte SONUYORDU; 100 yillik kosuda bu, deflasyon
    // sarmalina donustu (olculdu: GSYH 16k→2.6k, needsMet 0.43→0.26, 37 mal
    // fiyat TABANINDA acliga ragmen — parasal talep gelirle birlikte cokuyor,
    // geliri fiyat, fiyati talep belirliyor, demir yoktu). Sepet-payli
    // gecimlik reel talebe taban koyar: fiyat duserse ayni reel pay daha az
    // paraya karsilanir, sarmal kirilir. Vergi/refah/reform etkileri artik
    // butceye GERCEK kanallardan girer (vergi net geliri, reform ucreti,
    // refah cepten cikani degistirir) — eski formul carpanlari kalkti.
    //
    // Gelir GECEN HAFTANINDIR: `fiscalBalance` bu fonksiyondan SONRA kosar.
    // Bir haftalik gecikme butun ulkeleri esit etkiler (ayni kalip fabrika
    // girdi musaitliginde de kullaniliyor).
    const netIncome = Math.max(0, (socialClass.income ?? 0) - (socialClass.taxPaid ?? 0));
    // Vergi orani asagida ruh haline (memnuniyet) girer; butceye etkisi
    // zaten taxPaid uzerinden net gelirde.
    const taxRate = classTaxRate(nation, classId) / 100;
    const subsistence = basket * (SUBSISTENCE_SHARE[classId] ?? 0);
    socialClass.subsistence = subsistence;
    const needsBudget = netIncome + subsistence;
    // Refah sepetin bir kısmını devlet cebinden öder; parası zaten
    // socialSpendingCost ile hazineden çıkıyor. Bu bağ yokken sosyal harcama
    // memnuniyeti DÜŞÜRÜYORDU (0.50 -> 0.46, ölçüldü): para gidiyor, sepete
    // hiç dokunmuyor, ekonomiyi ısıtıp fiyatları yukarı itiyordu. Kademe
    // sınıfa göre: yoksul en çok yararlanır, aristokrasiye sosyal yardım yok.
    const reliefRate = classId === 'lower' ? 0.35 : classId === 'middle' ? 0.12 : 0;
    const outOfPocket = basket * (1 - welfare * reliefRate);
    const affordability = 1 / (1 + outOfPocket / Math.max(1, scale * 2.5));
    // IKINCI GECIS: hane ancak odeyebildigi kadarini satin alir. Oran butun
    // sepete esit uygulanir; kalem sirasi (once luks kesilsin) bilerek
    // yapilmadi — bu duzeltmenin isi bagi KURMAK, dengeyi yeniden yazmak degil.
    //
    // needsCost ve canAffordNeeds ISTENEN sepeti gostermeye devam eder: yoksa
    // ac kalan sinif "sepetini karsiliyor" gibi gorunur ve sinif dususu,
    // memnuniyet, hareketlilik zincirlerinin hepsi yanilir.
    // BIRIKIM: iyi yillar kotu yillari tasir.
    //
    // Eskiden sinif her hafta sifirdan basliyordu: `savings`/`wealth` diye bir
    // alan yoktu (audit:population HIGH). Sonucu iki yonluydu — gecmis refah
    // gelecege tasinmiyor, ve kitlik "birikimi eriten" bir sey olmuyordu.
    // Artik acik once birikimden kapanir; kapanmazsa sepet kisilir.
    socialClass.savings = Number.isFinite(socialClass.savings) ? socialClass.savings : 0;
    const gap = Math.max(0, outOfPocket - needsBudget);
    const drawn = Math.min(socialClass.savings * SAVINGS_DRAW_RATE, gap);
    const spendable = needsBudget + drawn;
    const affordShare = outOfPocket > 1e-9
      ? clamp(spendable / outOfPocket, 0, 1)
      : 1;
    // UC KADEMELI SELALE: once yasam, sonra gunluk, en son luks.
    //
    // Eskiden iki kova vardi (gida / gerisi) ve `canAffordNeeds` BUTUN sepetin
    // %60'ina bakiyordu; yani vergiyi tavana ceken oyuncu sinifi dogrudan
    // geciminin altina itiyordu. Victoria'da boyle degildi: yuksek vergi once
    // luksu, sonra gunluk ihtiyaci yerdi, bedeli MORAL'di. Selale o davranisi
    // geri getirir — sirasi bozulmadikca ekmek en son kesilir.
    const rate = (cost) => (cost > 1e-9 ? clamp(spendable / cost, 0, 1) : 1);
    const share = (cost) => (basket > 1e-9 ? outOfPocket * (cost / basket) : 0);
    const lifeCost = share(tierCost.life);
    const dayCost = share(tierCost.everyday);
    const luxCost = share(tierCost.luxury);
    const lifeAfford = rate(lifeCost);
    let left = Math.max(0, spendable - lifeCost * lifeAfford);
    const dayAfford = dayCost > 1e-9 ? clamp(left / dayCost, 0, 1) : 1;
    left = Math.max(0, left - dayCost * dayAfford);
    const luxAfford = luxCost > 1e-9 ? clamp(left / luxCost, 0, 1) : 1;
    socialClass.tierMet = { life: lifeAfford, everyday: dayAfford, luxury: luxAfford };
    // Beslenme endeksi yasam kademesinden okunur; gida kalemleri orada.
    const foodOutOfPocket = outOfPocket * (basket > 1e-9 ? foodCost / basket : 0);
    const foodAfford = foodOutOfPocket > 1e-9 ? Math.min(1, lifeAfford) : 1;
    const restAfford = clamp(
      (dayCost * dayAfford + luxCost * luxAfford) / Math.max(1e-9, dayCost + luxCost),
      0,
      1,
    );
    // Karnin doymasi iki kapiya birden bakar: parasi yetti mi, mal var miydi.
    socialClass.foodMet = foodAfford * foodAvailability;
    // Artan gelirin bir kismi birikir; tavan ~yarim yillik sepettir, yoksa
    // zengin sinif sonsuz bir yastik biriktirip kitliga bagisik olurdu.
    const surplus = Math.max(0, needsBudget - outOfPocket);
    socialClass.savings = clamp(
      socialClass.savings - drawn + surplus * SAVINGS_RATE,
      0,
      outOfPocket * SAVINGS_CAP_WEEKS,
    );
    socialClass.savingsDrawn = drawn;
    // Ikinci gecis sepeti listeye biriktirmek yerine ayni tablodan yeniden
    // yurur: amount * scale ayni carpim, sonuc bit bit ayni, gecici dizi yok.
    for (let n = 0; n < needsEntries.length; n++) {
      const goodId = needsEntries[n][0];
      const amount = needAmount(needsEntries[n][1], world.turn ?? 1);
      if (amount <= 0) continue;
      const quantity = amount * scale;
      const bought = quantity * (FOOD_GOODS.has(goodId) ? foodAfford : restAfford);
      addFlow(market, goodId, 'demand', bought);
      addNationFlow(nation, goodId, 'demand', bought);
    }
    socialClass.needsCost = outOfPocket;
    socialClass.needsBudget = needsBudget;
    // Sepetin fiilen alinan orani. Ekranlar ve tanilar icin: "istedigi" ile
    // "aldigi" arasindaki fark artik gorunur bir sayidir.
    // Sepetin fiilen KARSILANAN orani iki kapiya birden bakar: parasi yetti mi
    // (affordShare) ve mal var miydi (availability). Talep yalnizca ilkiyle
    // kisilir — parasi olup mal bulamayan hane yine de talep eder ve fiyati
    // yukari iter; ama karni doymaz.
    socialClass.needsMet = affordShare * availability;
    socialClass.needsAvailable = availability;
    socialClass.needsSpent = outOfPocket * affordShare * availability;
    // Sepet tam yaşam standardını temsil eder; sınıf bunun temel %60'ını dahi
    // karşılayamıyorsa durum sınıf düşüşüne dönüşür. Lüks açığı memnuniyeti
    // azaltır fakat tek başına aristokrasiyi birkaç ayda yok etmez.
    // GECIM TABANI ARTIK YASAM KADEMESIDIR. Eskiden butun sepetin %60'iydi:
    // yani sarabini alamayan aristokrat da "gecim altinda" sayilip sinif
    // dusuyordu. Victoria'da olcut yasam ihtiyaclariydi ve dogrusu budur —
    // ekmegi varsa sinif dusmez, yalnizca kufreder (memnuniyet duser).
    // Pay 0.95: son kirinti icin sinif dusurmek gurultuye ceza kesmek olur.
    // Iki kapi birden: PARASI yetti mi ve MAL var miydi. Yalniz odenebilirlige
    // bakinca dunyada tahil kalmadiginda bile hicbir sinif dusmuyordu — aclik
    // bir basarisizlik bicimi olarak tamamen kaybolmustu. Vergi artik sinif
    // dusurmez (o moral ve istikrar bedeli oder), ama GERCEK kitlik dusurur.
    socialClass.canAffordNeeds = (socialClass.tierMet?.life ?? 1) * foodAvailability >= 0.95;
    // Issizlik memnuniyeti dusurur. Eskiden memnuniyet YALNIZ sepet fiyatina
    // ve vergiye bakiyordu; olculdu (audit:population): istihdam %73.5 ->
    // %64.0 dustugunde memnuniyet 0.68 -> 0.65, yani sanayi kapanmasi haneyi
    // neredeyse hic etkilemiyordu. Bedel calisan siniflara biner —
    // sermayedar issiz kalmaz, tesisi zarar edince KARINDAN kaybeder
    // (bkz. PROFIT_TO_CAPITAL).
    const joblessBite = classId === 'upper' ? 0
      : unemployment * (classId === 'lower' ? UNEMPLOYMENT_MOOD : UNEMPLOYMENT_MOOD * 0.5);
    socialClass.satisfaction = clamp(
      0.35 + affordability * 0.5 - taxRate * 0.28 + welfare * 0.14
        + reformMoodShift(nation, classId) - joblessBite,
      0.08,
      0.95,
    );
    totalCost += basket;
    satisfactionWeighted += socialClass.satisfaction * socialClass.population;
    metWeighted += socialClass.needsMet * socialClass.population;
    foodWeighted += (socialClass.foodMet ?? 1) * socialClass.population;
  }

  economy.standardOfLiving = 5 + 15 * (satisfactionWeighted / Math.max(1, economy.population))
    + socialLevel(nation, 'welfare') * 2.5;
  updateStability(world, nation, satisfactionWeighted / Math.max(1, economy.population));
  // Ulusal beslenme endeksi: sepetinin ne kadarini fiilen alabilen bir nufus.
  // provinces.js bunu okur (economy.js'i import etmek katman dongusu olurdu,
  // ayni kalip saglik harcamasinda da kullaniliyor).
  economy.needsMet = clamp(metWeighted / Math.max(1, economy.population), 0, 1);
  // Nufus buyumesinin okudugu SAYI budur, `needsMet` degil (provinces.js).
  // Karsilanmayan luks buyumeyi yavaslatmaz; karsilanmayan GIDA yavaslatir.
  economy.foodMet = clamp(foodWeighted / Math.max(1, economy.population), 0, 1);
  return totalCost;
}

/**
 * Kirsal/temel uretimin haneye akan payi ve sinif agirliklari. Sabit olarak
 * DISARI ACILDI: sirket katmani cikarim sahibinin hakkini ayni sayidan
 * turetir. Iki yerde ayri ayri yazilsaydi
 * biri kayinca temettu ust sinif gelirinden farkli bir tutar duserdi.
 *
 * 0.35 -> 0.70. GEREKCE MUHASEBEDIR, ayar degil: bu sayi kirsal uretimin
 * PAZARLANAN payidir, `SUBSISTENCE_SHARE.lower` (0.30) ise hanenin kendi
 * uretiminden karsiladigi paydir. Ikisi ayni bolusumun iki yarisi oldugu
 * halde toplamlari 0.65 tutuyordu; kalan %35 ne pazara ne haneye yaziliyordu.
 * 0.70 + 0.30 = 1.00 ile bolusum kapaniyor.
 *
 * BU SAYI DAHA ONCE YANLIS METRIKLE ELENMISTI. d9d05e9 0.35 -> 0.6 denemis ve
 * "GSYH ayni kaldi" diye reddetmisti; oysa GSYH'nin degismemesi BEKLENEN
 * seydir — havuz bir transferdir, uretim yaratmaz. Reel olcutlerle (bkz.
 * audit:growth) ayni kaldirac uc hedefi de iyilestiriyor ve sanayiyi en cok
 * buyuten varyant cikiyor.
 *
 * Olculdu (100 yil x 2 tohum, PRICE_ANCHOR 0.060 ile BIRLIKTE):
 *   H1 reel tuketim/kisi   0.94 / 1.01  ->  1.03 / 1.05   (gecti)
 *   H2 orta+ust payi       %5.85 / %3.84 -> %13.83 / %11.63 (gecti)
 *   H3 tesis buyumesi      1.12x / 1.03x ->  1.19x / 1.16x  (hala kirmizi)
 * H3 ACIK KALIYOR ve kilidi burada degil: yeni tesisin bedeli kurulu sayiyla
 * tirmanirken kapitalistin butcesi fiyatla birlikte cokuyor (bkz. factoryCost
 * ve privateCommitRoom).
 */
export const INCOME_POOL_SHARE = 0.70;
export const INCOME_WEIGHTS = { lower: 0.42, middle: 0.33, upper: 0.25 };

function fiscalBalance(nation, baseOutputValue) {
  const economy = nation.economy;
  // GELIR ARTIK UC GERCEK KANALDIR:
  //   1. Kirsal/temel uretimin pazarlanan payi (incomePool) — RGO degeri.
  //      Sanayi terimi (eski 0.22×industrialOutput) KALKTI: sanayinin haneye
  //      akan parasi artik gercek bordro, hayali bir pay degil.
  //   2. Bordro (economy.wagesPaid, runFactories katma deger × LABOR_SHARE):
  //      govde isciye (alt), beyaz yaka katibe (orta) — bkz. WAGE_SPLIT.
  //   3. Sanayi kari sermayedara (PROFIT_TO_CAPITAL, ustte).
  // Taban pay 0.18 → 0.35: sanayi payinin cikmasiyla kirsal gelirin
  // pazarlanan payi gercekci olcege cekildi (kalibrasyon: needsMet bandi
  // korunacak sekilde olculdu, bkz. CORE_STABILIZATION_LOG FAZ 3).
  const incomePool = Math.max(1, baseOutputValue * INCOME_POOL_SHARE);
  const incomeWeights = INCOME_WEIGHTS;
  const wagesPaid = Math.max(0, economy.wagesPaid ?? 0);
  const profitShare = (economy.factoryProfit ?? 0) * PROFIT_TO_CAPITAL;
  let taxes = 0;
  for (const [classId, weight] of Object.entries(incomeWeights)) {
    const socialClass = economy.classes[classId];
    socialClass.income = incomePool * weight
      + wagesPaid * (WAGE_SPLIT[classId] ?? 0)
      + (classId === 'upper' ? profitShare : 0);
    // Zarar geliri negatife cekmesin: vergi matrahi negatif olamaz ve
    // `needsBudget` zaten ayri bir kanaldan geliyor.
    socialClass.income = Math.max(0, socialClass.income);
    socialClass.taxPaid = socialClass.income * (classTaxRate(nation, classId) / 100);
    taxes += socialClass.taxPaid;
  }
  // Tahsilat verimi ARTIK YOK. Eski `taxEfficiency` bir kaydiracin (adminFunding)
  // ciktisiydi ve olculdu: butun menzili hazineyi %0.6 oynatiyordu, yani gurultu
  // tabaninin 85 kati altinda. Ustelik hane BRUT vergiyi dususuyor, hazine ise
  // net aliyordu; aradaki %0-31.5 modelden sessizce siliniyordu ve ekranda
  // sinif satirlari toplami gelir satirini tutmuyordu. Vergi artik ne
  // toplaniyorsa odur.
  const construction = constructionUpkeep(nation);
  economy.taxRevenue = taxes;
  economy.constructionUpkeep = construction;

  // TEK PARA YOLU. Her kalem kendi defter satirina yazilir; `fiscalNet` diye
  // ikinci bir bakiye tanimi YOK — bakiye haftalik kapanista tek yerde cikar.
  settle(nation, 'tax', taxes);
  settle(nation, 'construction', -construction);
  for (const program of Object.values(SOCIAL_PROGRAMS)) {
    const cost = programmeCost(nation, program.id);
    if (cost > 0) settle(nation, program.ledgerLine, -cost);
  }
  // Yasayla verilen hak kaydiractan ayridir ve kisilamaz; refah satirina yazilir.
  const mandated = (economy.population / POPULATION_UNIT)
    * reformModifiers(nation).socialBurden;
  if (mandated > 0) settle(nation, 'welfare', -mandated);
  economy.socialCost = socialSpendingCost(nation);
}

/** TEK BAKIYE TANIMI (dis dunya icin de: bkz. treasury.weeklyBalance). */
export function weeklyBalanceOf(nation) {
  return nation?.economy?.ledger?.net ?? 0;
}

/**
 * IFLAS/BOLLUK TANIMI — TEK YER. Esik ULKENIN KENDI OLCEGINE goredir: mutlak
 * bir `gold < 80` esigi buyuk ulkeyi asla, kucuk ulkeyi surekli tetikliyordu.
 * Olcut sekiz haftalik sosyal gider; boylece "iki haftalik rezervim kalmadi"
 * her olcekte ayni anlama gelir.
 */
export function fiscalStance(nation) {
  const weekly = weeklyBalanceOf(nation);
  const reserve = Math.max(8 * socialSpendingCost(nation), 40);
  return {
    weekly,
    reserve,
    broke: nation.gold < reserve * 0.25 || (weekly < 0 && nation.gold < reserve * 0.5),
    rich: nation.gold > reserve * 1.5 && weekly > 0,
    // Vergi GEVSETME esigi `rich`ten dusuk: rezerv doldu ve butce BELIRGIN
    // fazla veriyorsa oranlar iner. Yalniz `rich`te inen vergi bir circir
    // kuruyordu — kisa bir iflas dalgasi +5/hafta ile oranlari yukari
    // surukluyor, 1.5 × rezerv esigi nadiren tutunca geri inmiyor ve ust oran
    // 100'e dayaniyordu (olculdu: IND-1 devredilmis butce, 1866'da 55/82/100;
    // bkz. OPEN_BETA_4_PLAYTEST.md). Fazla marji sart: "haftalik > 0" ile
    // gevseyen YZ gumruk geliri yettigi icin oranlari sifira kadar indiriyor
    // ve on yil sifir vergiyle oturuyordu (olculdu). Rezervin %5'i/hafta,
    // rezervi yirmi haftada bir daha dolduran fazladir. Histerezis korunur:
    // 0.5 × rezervde artar, 1 × rezervde iner, arada durur.
    easing: nation.gold > reserve && weekly > reserve * 0.05,
  };
}

/**
 * Kesme sirasi. Refah once, egitim EN SON gider: egitim tek basina
 * arastirmanin yakitidir (okuryazarlik -> researchPointsOf) ve bir kez
 * sifirlandiginda okuryazarlik stogu insan omru olceginde geri gelir.
 */
const CUT_ORDER = ['welfare', 'education'];

/**
 * Hazine biriktikçe açılan sosyal harcama. YZ oyuncuyla aynı kaldıraçları
 * kullanmazsa geç oyunda tek başına para yığar; istikrar düşükse refah,
 * hazine bolsa eğitim/sağlık açar, para biterse kısar.
 */
function adjustSocialAI(nation, report = null) {
  const economy = nation.economy;
  // TEK BAKIYE. Gecen haftanin KAPANMIS net'i okunur — bilerek. Eski kod
  // `budget.net.gold + fiscalNet` topluyordu ve o toplam gumruk gelirini
  // GORMUYORDU (fiscalBalance tariffRevenue'yu sifirliyor, ticaret sonra
  // dolduruyordu, YZ tam arada kosuyordu). Gumruk gelirin ~%40'iydi: korumaci
  // bir YZ dolu hazineyle kendini iflas etmis sanip okullari kesiyordu.
  // Yukseltme kapisi vergiyle AYNI gevseme esigidir (fiscalStance.easing):
  // yalniz `rich`te (1.5 × rezerv) acilan egitim bir circir kuruyordu — kisa
  // bir darlik egitimi sifira indiriyor, rezerv bir daha 1.5 katina cikmadigi
  // icin on yillarca orada kaliyordu (audit:research: 1870 sonrasi
  // onyillarda ulkelerin %48-83'u egitimde sifirda). Rezerv dolu ve butce
  // belirgin fazla veriyorsa okul acilir; histerezis korunur.
  const { broke, rich, easing } = fiscalStance(nation);
  const step = broke ? -10 : (rich || easing) ? 10 : 0;
  if (!step) return;
  // Yukseltme sirasi istikrara gore degisir. KESME sirasi ise artik sabittir:
  // eskiden yukseltme sirasi ters cevrilerek turetiliyordu ve bu, istikrar
  // 0.5'in altindayken EGITIMI ILK kesiyordu — yani ulke tam da zordayken.
  const raiseOrder = economy.stability < 0.5
    ? ['welfare', 'education']
    : ['education', 'welfare'];
  const order = broke ? CUT_ORDER : raiseOrder;
  for (const id of order) {
    const current = economy.social[id] ?? 0;
    if (step > 0 && current < 100) {
      // Kaydiracin tavani 100; YZ 95'ten 105'e cikabiliyordu ve ekran
      // "Education 105%" yaziyordu (Open Beta 4, B-7). Ayni kapi, ayni sinir.
      const next = Math.min(100, current + step);
      economy.social[id] = next;
      report?.('budget', `${SOCIAL_PROGRAMS[id]?.name ?? id} spending ${current}% \u2192 ${next}%.`,
        'The treasury could afford more.');
      return;
    }
    if (step < 0) {
      const floor = socialFloorOf(nation, id);
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
  // save-audit dallanmasi, +77. haftada £229'luk CANNERY baska state'e).
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
 * `setBudgetPolicy` çağrısı yoktu, yani ekonomik kaldıraçları yalnız oyuncu
 * kullanıyordu. Artık YZ de krizde vergi artırır, bollukta indirir ve ticaret
 * politikasına göre gümrüğünü ayarlar.
 */
function adjustFiscalAI(nation, areas = FULL_FISCAL) {
  const economy = nation.economy;
  const weekly = weeklyBalanceOf(nation);
  // IFLAS TANIMI TEK. Eskiden adjustSocialAI olcek-goreli (ulkenin kendi
  // sosyal giderine gore), adjustFiscalAI ise MUTLAK (gold < 80) tanimliyordu;
  // aradaki not mutlak esiklerin OLCULEN hata oldugunu yaziyordu ama duzeltme
  // yalniz birine uygulanmisti. Ikisi de artik ayni fonksiyonu cagirir.
  const { broke, rich, easing } = fiscalStance(nation);
  if (areas.budget && (broke || rich || easing)) {
    // OYUNCUYLA AYNI KAPI. Eskiden YZ'nin kendine ozel tavanlari vardi
    // (alt 35 / orta 42 / ust 45) ve bunlar YALNIZCA bu fonksiyonun icinde
    // yasiyordu; oyuncunun kaydiraci 0-100'du. Ayni kurallar, uc kaydirac.
    const before = averageTaxRate(nation);
    // Ezilen hane varken vergi artirilmaz: bu fren olmadan YZ hazine sikisinca
    // tavana cikip sinifi eritiyordu (olculdu).
    const strained = Object.values(economy.classes ?? {}).some(
      (c) => !c.canAffordNeeds || (c.hardshipWeeks ?? 0) > 0,
    );
    const step = broke ? (strained ? 0 : 5) : -5;
    // UC ORAN BIRLIKTE OYNAR ama esit degil: hukumet kendi doktrinine gore
    // agirlik verir (sosyalist ustten, muhafazakar alttan alir). Oyuncuyla YZ
    // yine ayni kapidan gecer; tek fark hangi kaydiraci ne kadar ittigidir.
    const weights = taxWeightsFor(nation);
    let moved = false;
    if (step) {
      for (const id of TAX_CLASS_IDS) {
        const policy = `tax${id[0].toUpperCase()}${id.slice(1)}`;
        const delta = Math.round(step * (weights[id] ?? 1));
        if (delta && setBudgetPolicy(nation, policy, economy.tax[id] + delta)) moved = true;
      }
    }
    if (moved) {
      areas.report?.('budget',
        `Taxes ${before.toFixed(0)}% -> ${averageTaxRate(nation).toFixed(0)}% on average.`,
        broke ? 'Treasury reserves were falling.' : 'The treasury could afford relief.');
    }
  }
  // Korumacı hükümet sanayisini kollar, serbest ticaretçi gümrüğü SIFIRA
  // indirir — tabana değil. Taban artık −50 (ithalat sübvansiyonu) ve oraya
  // sürüklenen YZ hazinesini kalıcı olarak ithalata akıtıyordu.
  if (areas.trade) {
    // Korumaci hedef doktrinin duzeyidir, kaydiracin fiziksel tavani degil:
    // tavana (%100) suruklenen YZ ithalati ucte ikiye kesiyor ve 302 YZ
    // devletinin 298'i ayni %99+ gumrukte donuyordu (ai-audit patoloji
    // taramasi). Oyuncunun bandi degismez; YZ ayni setBudgetPolicy'den gecer.
    const limits = fiscalPolicyLimits(nation);
    const wanted = policyOf(nation, 'trade') === 'protectionism'
      ? Math.min(PROTECTIONIST_TARIFF, limits.tariffMax) : 0;
    // SALINIM FRENI. Gumruk haftada en fazla iki puan surunur. AUTO acildiginda
    // oyuncunun kurdugu %30 bir haftada %80'e sicramaz; hukumet aylar icinde
    // kendi doktrinine kayar ve oyuncu her an anahtari kapatip yerinde durdurur.
    const drift = Math.sign(wanted - economy.tariff) * 2;
    if (drift) {
      const before = economy.tariff;
      setBudgetPolicy(nation, 'tariff', economy.tariff + drift);
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
    setBudgetPolicy(nation, key, current + Math.sign(target - current) * step);
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
    for (const programId of Object.keys(economy.social ?? {})) {
      const level = economy.social[programId] ?? 0;
      if (level > 0) setBudgetPolicy(nation, programId, level - 10);
    }
    drift('armyFunding', wartime ? limits.armySpendingMax : 45);
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
    drift('armyFunding', limits.armySpendingMax);
    // Sosyal harcama savaşta yarıya süzülür; barış gelince zenginlik geri açar.
    const welfare = economy.social.welfare ?? 0;
    if (welfare > 30) setBudgetPolicy(nation, 'welfare', welfare - 10);
    return;
  }

  // Barış: tedarik %60-75 bandına gevşer (stoklar doluysa para israfıdır),
  // zengin hazine eğitimi besler, her fabrika sübvansiyonu kalkmaz ama
  // stratejik olmayanlar bırakılır.
  drift('armyFunding', Math.min(limits.armySpendingMax, 75));
  if (nation.gold > 400) {
    const education = economy.social.education ?? 0;
    if (education < 60) setBudgetPolicy(nation, 'education', education + 10);
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

  // ODEME GUCU KAPISI (bkz. PRIVATE_FUNDING_HORIZON). Acik defter zaten ufkun
  // otesindeyse yeni santiye ACILMAZ — kapitalist kazandigi kadar taahhut eder.
  const room = privateCommitRoom(nation);
  if (room <= 0) return;

  const options = investmentOptions(game.world, nation);
  for (const option of options) {
    // Tek tesis bile ufka sigmiyorsa o tesis bu ulusun kapitalistine gore
    // degildir; siradaki daha ucuz secenege bakilir.
    if ((factoryCost(nation, option.typeId).gold ?? 0) > room) continue;
    const region = regions.find((candidate) => canBuildFactory(
      game.world, nation, candidate.id, option.typeId, 'private',
    ));
    if (!region) continue;
    if (buildFactory(game, nation, region.id, option.typeId, { actor: 'private' })) {
      const factory = economy.factories[economy.factories.length - 1];
      nation.politics.lastPrivateInvestment = {
        action: 'build',
        factoryId: factory.id,
        typeId: option.typeId,
        regionName: region.name,
      };
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
  // Kilitler HER ZAMAN once uygulanir: devir kapaliyken de oyuncunun kendi
  // niyeti korunmali, acikken de YZ kilitlenmis kaydiraci bulmali.
  applyTaxHolds(nation);
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
  const scale = (nation.economy?.armyFunding ?? 100) / 100;
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
      const field = MILITARY_FIELD[id];
      military[field.imported] = 0;
      // Tedarik kaydırağı ithalat hedefini de ölçekler: %50 fonlanan ordu
      // yarım depoyla idare etmeye çalışır, hazine de yarım öder.
      const procurement = (nation.economy.armyFunding ?? 100) / 100;
      const target = Math.min(
        equipment.stockCap,
        (equipment.reserve + Math.min(
          equipment.stockCap - equipment.reserve,
          military[field.demand] ?? 0,
        )) * procurement,
      );
      const shortage = Math.max(0, target - equipmentStock(nation, id));
      if (shortage <= 0 || available[id] <= 0) continue;
      const tariffFactor = 1 + nation.economy.tariff / 100;
      const unitPrice = priceOf(world, id) * tariffFactor;
      const affordable = nation.gold / Math.max(0.01, unitPrice);
      const amount = Math.min(
        equipment.importLimit, shortage, available[id], affordable,
      );
      if (amount <= 0) continue;
      const cost = amount * unitPrice;
      setEquipmentStock(nation, id, equipmentStock(nation, id) + amount);
      military[field.imported] = amount;
      settle(nation, 'imports', -cost);
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
  for (const nation of nations) resetTradeSummary(nation);

  // Mal basina ulke satirlari nesne dizisi olarak kuruluyordu (43 mal x ulke
  // sayisi = haftada binlerce kisa omurlu kayit, olculdu ~0.9 MB/hafta).
  // Ayni degerler tur boyunca geri kullanilan uc sutuna yazilir; islem ve
  // toplama sirasi degismedigi icin sonuc bit bit aynidir.
  const count = nations.length;
  const domesticCol = new Float64Array(count);
  const surplusCol = new Float64Array(count);
  const bidCol = new Float64Array(count);
  // Agirlik sutunu teklifin kendisidir. Sirket katmani kaldirilana kadar burada
  // "ayricalikli erisim" carpani vardi; hissedar ulke ayni hacimden daha buyuk
  // pay cekiyordu. Katman gidince carpan da gitti — dagitim yeniden duz teklif
  // oranidir. Iki gecisli su-doldurma DURUYOR: kirpma artik olusmasa da
  // korunum ispati (Stahsis === crossBorderTrade) ayni yazimda kaliyor.
  const weightCol = new Float64Array(count);
  const allocCol = new Float64Array(count);

  for (let g = 0; g < GOOD_IDS.length; g++) {
    const id = GOOD_IDS[g];
    let totalSurplus = 0;
    let totalBid = 0;
    let totalWeight = 0;
    for (let i = 0; i < count; i++) {
      const nation = nations[i];
      const flow = nation.economy.goodsFlow[id];
      const marketProduction = Math.max(0, flow.production - flow.retained);
      const domestic = Math.min(marketProduction, flow.demand);
      const deficit = Math.max(0, flow.demand - domestic);
      // Gümrük ithalat iştahını kısar. Bu bağ yokken tarife ölü bir kaldıraçtı:
      // ticaret saf fiziksel eşleşmeydi, %0 ile %50 arasında ithalat MİKTARI
      // %0.9 oynuyordu (ölçüldü, bkz. mechanics-audit). Korumacılık artık
      // gerçekten koruyor; bedeli de gerçek — karşılanmayan talep büyüyor.
      // Payda 0.05'in altina inemez: formul −%62.5 tarifede sonsuza, altinda
      // NEGATIFE gidiyor. UI bandi (taban −50) bugun oraya girmiyor ama
      // matematiksel koruma bantla birlikte tasinmamali.
      const appetite = importAppetite(nation.economy.tariff);
      // Yuksek tarifeli ulkenin ihracat erisimi kisilir (bkz. EXPORT_RETALIATION).
      // Fiziksel mal yok olmaz: satilamayan fazla, zaten satilamayan fazlanin
      // yanina duser (crossBorderTrade = min(surplus, bid) korunumu bozulmaz).
      const access = 1 / (1 + Math.max(0, nation.economy.tariff / 100) * EXPORT_RETALIATION);
      domesticCol[i] = domestic;
      surplusCol[i] = Math.max(0, marketProduction - domestic) * access;
      bidCol[i] = deficit * appetite;
      weightCol[i] = bidCol[i];
    }
    // Toplamlar eski reduce ile ayni sirada birikir (ulke dizisi sirasi).
    for (let i = 0; i < count; i++) totalSurplus += surplusCol[i];
    for (let i = 0; i < count; i++) totalBid += bidCol[i];
    for (let i = 0; i < count; i++) totalWeight += weightCol[i];
    const crossBorderTrade = Math.min(totalSurplus, totalBid);

    // ITHALAT TAHSISI — iki gecisli su-doldurma.
    //
    // NEDEN IKI GECIS: dis hesap kapanisi (trade.settlement) dunya toplaminda
    // Sithalat == Sihracat oldugu icin para yaratmaz. Oncelik agirligi tek
    // gecisle uygulaninca ayricalikli ulkenin payi KENDI talebini asiyor,
    // fazlasi kirpiliyor ve Sithalat < Sihracat kaliyordu — aradaki fark
    // hazinelere NET POZITIF olarak dagiliyordu, yani sifirdan para. Denetim
    // bunu yakaladi (kaldirilan sirket denetimi, K5).
    //
    // Ikinci gecis kirpilan artigi hala talebi karsilanmamis ulkeler arasinda
    // bosluklari oraninda dagitir. Artik <= toplam bosluk oldugu icin (Steklif
    // >= crossBorderTrade) tek ek gecis TAM kapanir: Stahsis === crossBorderTrade.
    //
    // Ayricalik yokken birinci gecis zaten kirpmaz (raw <= teklif), artik
    // sifirdir ve ikinci gecis etkisizdir — eski davranis bit bit korunur.
    if (crossBorderTrade > 0 && totalWeight > 0) {
      let allocated = 0;
      for (let i = 0; i < count; i++) {
        const raw = weightCol[i] * crossBorderTrade / totalWeight;
        allocCol[i] = raw < bidCol[i] ? raw : bidCol[i];
        allocated += allocCol[i];
      }
      let leftover = crossBorderTrade - allocated;
      if (leftover > 1e-12) {
        let headroom = 0;
        for (let i = 0; i < count; i++) headroom += bidCol[i] - allocCol[i];
        if (headroom > 1e-12) {
          if (leftover > headroom) leftover = headroom;
          for (let i = 0; i < count; i++) {
            allocCol[i] += leftover * (bidCol[i] - allocCol[i]) / headroom;
          }
        }
      }
    } else {
      for (let i = 0; i < count; i++) allocCol[i] = 0;
    }

    for (let i = 0; i < count; i++) {
      const nation = nations[i];
      const flow = nation.economy.goodsFlow[id];
      flow.domestic = domesticCol[i];
      flow.exports = totalSurplus > 0 ? surplusCol[i] * crossBorderTrade / totalSurplus : 0;
      flow.imports = allocCol[i];
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
    // DIS HESABIN KAPANISI. Gumruk tek basina TERS TESVIKTI: geliri ithalat
    // HACMIYLE buyudugu icin cokmus, her seyi ithal eden ekonomi en zengin
    // hazineyi topluyordu (olculdu: acik veren 12 ulke ort. 18.259 altin,
    // fazla veren 17 ulke ort. 1.968 — dokuz kat). Karsi kalemi yoktu.
    //
    // Net dis denge artik hazineden gecer: devlet, ulkenin dis pozisyonunu
    // kapatan taraftir (1836-1936 altin standardi hazinesinin fiili isi).
    // Hane hala kendi sepetini oder; degisen sey GAYRISAFI degil NET akis.
    //
    // Bu para YARATMAZ: `crossBorderTrade = min(totalSurplus, totalBid)` ve
    // iki taraf ayni fiyattan degerlenir, dolayisiyla dunya toplaminda
    // `Simport == Sexport` (olculdu: 200. haftada fark 2.3e-13). Bir
    // hazineden cikan, baska bir hazineye girer.
    trade.settlement = trade.balance * EXTERNAL_SETTLEMENT;
    trade.lastUpdated = world.turn;
    nation.economy.tariffRevenue = trade.tariffRevenue;
    nation.economy.externalSettlement = trade.settlement;
    // (Defter satiri asagida `settle('settlement', ...)` ile yazilir; bu alan
    // yalnizca ticaret ekraninin gosterdigi ham dis pozisyondur.)
    settle(nation, 'tariff', trade.tariffRevenue);
    settle(nation, 'settlement', trade.settlement);
  }
}

/**
 * Mal basina "istenen ne kadari bulunabildi" orani. Sanayi ekrani da bunu okur
 * (bkz. industryView.scarcestInput): kitligi adlandiran ayni sayidir, ekran
 * kendi kitlik olcusunu kurmaz.
 */
export function marketInputAvailability(market) {
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
  // GECEN HAFTANIN KAPANMIS geliri — bilerek. Yarim kalmis bir haftanin
  // toplamini okumak, kapasiteyi cagri yerine gore degistirirdi (eski surumde
  // tam bu oluyordu: settleDebt bir vintage, ekran baska bir vintage
  // goruyordu). Kapanmis defter her yerde ayni sayidir.
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
 */
function settleDebt(nation) {
  const economy = nation.economy;
  nation.debt = Math.max(0, nation.debt ?? 0);
  const interest = nation.debt * debtInterestRate(nation) / 52;
  settle(nation, 'interest', -interest);
  let defaulted = 0;
  economy.creditPenalty = clamp(economy.creditPenalty ?? 0, 0, 0.85);

  if (nation.gold < 0) {
    const room = Math.max(0, debtCapacity(nation) - nation.debt);
    const borrow = Math.min(-nation.gold, room);
    nation.debt += borrow;
    settle(nation, 'borrow', borrow);
    // Kapasite dolduysa devlet TEMERRUDE duser: kalan acik odenmez, hazine
    // sifira oturur. Eskiden bu acik hazinede sinirsiz negatif olarak
    // birikiyordu (olculdu: -23.350 altin, geri donusu olmayan bir cukur;
    // 1040. haftada ulkelerin %30'u oradaydi). Temerrut bedavaya degildir:
    // kredi itibari duser, kapasite daralir, faiz tirmanir.
    if (nation.gold < 0) {
      defaulted = -nation.gold;
      // Temerrut BIR BILANCO HAREKETIDIR: odenmeyen acik hazineyi sifira
      // cikarir ve defterde kendi satirinda gorunur.
      settle(nation, 'default', defaulted);
      economy.creditPenalty = clamp(
        economy.creditPenalty + defaulted / Math.max(1, debtCapacity(nation)),
        0,
        0.85,
      );
      // YENIDEN YAPILANDIRMA: temerrutteki devletin kapasite ustu borcu
      // yavasca silinir (alacakli zarari yazar; bedeli zaten yuksek cezada).
      // Bu kapi olmadan cikis yoktu: ceza kapasiteyi kuculttugu icin eski
      // savas borcu sonsuza dek odenemez kaliyordu — gold 0'da cokelen ulke
      // ne ceza eritebiliyor ne borc odeyebiliyordu (olculdu: 1300. haftada
      // 13/26 ulke bu kilitte; taban cizgide ayni kilit 2/26'ydi).
      const excess = nation.debt - debtCapacity(nation);
      if (excess > 0) nation.debt -= excess * 0.02;
    }
  } else if (nation.debt > 0 && nation.gold > DEBT_CUSHION) {
    // Geri ödeme otomatik ve ılımlı: hazine yastığın üstündeyse fazlanın
    // çeyreği borca gider. Oyuncu isterse bütçeyi sıkıp hızlandırır.
    const repay = Math.min(nation.debt, (nation.gold - DEBT_CUSHION) * 0.25);
    nation.debt -= repay;
    settle(nation, 'repay', -repay);
  }
  // Itibar borcunu odeyen ulkede yavasca geri gelir: temerrut kalici bir olum
  // cezasi degil, yillar suren bir bedeldir (yarilanma ~70 hafta).
  if (defaulted <= 0 && nation.gold > DEBT_CUSHION) {
    economy.creditPenalty = Math.max(0, economy.creditPenalty - 0.01);
  }
}

/** Geri ödemeye başlamadan önce hazinede tutulan yastık. */
const DEBT_CUSHION = 25;

/**
 * HAFTALIK KAPANIS. Defteri KURMAZ, TOPLAR.
 *
 * Eski `updateLedger` haftanin gercegini on bir ayri cizik alandan yeniden
 * insa etmeye calisiyordu; her unutulan karsi kayit sessiz bir sapmaydi.
 * Artik her para hareketi olustugu anda `settle()` ile kendi satirina yazildi,
 * burada yalnizca toplanir. `ledger.unreconciled` sifirdan farkliysa bir yerde
 * hazineye settle() disindan dokunulmus demektir.
 */
/**
 * Nufus ekranindaki egilim cizgilerinin tuttugu ornek sayisi. 52 hafta = bir
 * yil; hazine izi (treasury.js) ile ayni uzunluk ve ayni gerekce.
 */
export const POPULATION_HISTORY = 52;

/**
 * Haftalik nufus/okuryazarlik/istihdam izi.
 *
 * YENI BIR GERCEK URETMEZ — halihazirda hesaplanmis sayilari bir halkaya
 * yazar. Ekran "buyuyor mu, kuculuyor mu" sorusunu ancak gecmise bakarak
 * cevaplayabilir ve bu gecmisi UI katmaninda tutmak, kayittan donunce grafigi
 * sifirlardi.
 */
function recordPopulationTrend(nation, population) {
  const economy = nation.economy;
  if (!economy) return;
  economy.popHistory ??= [];
  economy.popHistory.push({
    pop: Math.round(population),
    // GSYH ayni halkaya yazilir: ust cubuktaki gecmis grafigi bunu okur.
    // Yeni bir gercek degil, hesaplanmis degerin kaydi.
    gdp: Math.round(economy.gdp ?? 0),
    lit: Number((economy.literacy ?? 0).toFixed(4)),
    // Sepetin karsilanma orani sinif nufusuyla agirliklandirilir; ekranin
    // "needs met" kartiyla ayni tanim (bkz. populationView).
    needs: Number(weightedNeedsMet(economy).toFixed(4)),
  });
  if (economy.popHistory.length > POPULATION_HISTORY) economy.popHistory.shift();
}

/** Sinif nufusuyla agirliklandirilmis sepet karsilanmasi. TEK TANIM. */
export function weightedNeedsMet(economy) {
  let people = 0;
  let met = 0;
  for (const socialClass of Object.values(economy?.classes ?? {})) {
    const size = Math.max(0, socialClass.population ?? 0);
    people += size;
    met += clamp(socialClass.needsMet ?? 1, 0, 1) * size;
  }
  return people > 0 ? met / people : 1;
}

function closeNationWeek(world, nation, turn) {
  // Borc kapanisi defterden ONCE: faiz, borclanma ve geri odeme bu haftanin
  // kaydina girsin.
  settleDebt(nation);
  recordPopulationTrend(nation, populationOf(world, nation));
  closeWeek(nation, turn);
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
    // FIYAT CAPASI. Eski kural saf bir INTEGRATORDU: fiyat yalnizca dengesizligi
    // biriktiriyor, taban fiyata donduren hicbir kuvvet yoktu. Kucuk ama SUREKLI
    // bir arz fazlasi (olculdu: dunya arzi talebin %5 ustunde) haftada %0.2
    // dusus demek ve 130 haftada 0.75 kat; 20 yilda fiyat endeksi 1.86'dan
    // 0.47'ye iniyordu. Gelir de nominal oldugu icin (RGO degeri x pay + bordro)
    // sinif geliri 10 KAT eriyor, vergi 77'den 8'e duşuyor ve oyunun orta oyunu
    // yok oluyordu — "gelir egrisi yok" bulgusunun asil sebebi buydu.
    //
    // Artik fiyat taban fiyatina dogru zayifca cekilir. Cekim dengesizlik
    // sinyalinin altinda tutuldu (0.018 vs 0.09): gercek kitlik hala fiyati
    // tavana tasir, ama bir mali BANTTA TUTMAK icin surekli ve buyuk bir
    // dengesizlik gerekir — gecici bolluk kalici cokus uretmez.
    const anchor = clamp(
      (base - state.price) / Math.max(base, state.price), -1, 1,
    ) * PRICE_ANCHOR;
    // Band 0.25-4'ten 0.12-8'e genisletildi. Zincir 12 maldan 43'e cikinca
    // kitlik ve bolluk cok daha keskin oluyor; dar bandda fiyatlar raya yapisip
    // hic hareket etmiyordu (olculdu: 80. turda 43 maldan yalniz 1'i oynuyordu).
    state.price = clamp(
      state.price * (1 + imbalance * PRICE_SPEED + anchor), base * 0.12, base * 8,
    );
    state.trend = state.price - state.previousPrice;
    state.traded = Math.min(state.supply, state.demand);
    totalGdp += state.traded * state.price;
  }
  market.totalGdp = totalGdp;
}

/**
 * Haftalık ekonomi üç adıma bölündü: beginEconomy → ulus başına
 * runNationEconomy → finishEconomy. Neden: kapanışın en pahalı kalemi
 * ekonomiydi (ölçüldü: 72 ms'lik turun 51 ms'i) ve maliyet tek bir sıcak
 * noktada değil ulus sayısına yayılıyordu. Bölünmüş yapı, turn.js'in tur
 * üretecinin ulusları KARE BÜTÇESİYLE dilimlemesine izin verir — mantık ve
 * işlem sırası bire bir aynıdır, yalnız zamanlama kareler arasına yayılır.
 * Piyasa akümülasyonu sıra-bağımsız tasarlandığı için (girdi bolluğu geçen
 * haftadan okunur, bkz. inputAvailability) dilimleme sonucu değiştirmez.
 */
export function beginEconomy(game) {
  const world = game.world;
  ensureEconomy(world);
  // Yasa çarpanları haftada BİR KEZ, ekonomi fazının başında hesaplanır;
  // sıcak yol sonra yalnız düz alan okur. Politika fazından çağırmak
  // politics.js ile reforms.js arasında döngüsel içe aktarma kuruyordu.
  for (const nation of world.nations) {
    if (!nation.alive || !nation.politics) continue;
    // Sayac erimesi ulus basina haftada TAM BIR KEZ, burada (bkz.
    // reforms.decayReformCounters — kaydet/yukle dallanmasinin sebebiydi).
    decayReformCounters(nation);
    refreshReformModifiers(nation);
  }
  refreshNationalStrain(world);
  // Egitim -> okuryazarlik -> arastirma puani -> teknoloji zinciri. Sira
  // onemli: okuryazarlik once ilerler, arastirma o haftanin stogunu okur.
  // Yayilim tablosu da arastirmadan ONCE kurulur (temas matrisi turn.js'te
  // bu evreden once hesaplanmistir, deterministiktir).
  const year = 1836 + Math.floor(((world.turn ?? 1) - 1) * 7 / 365);
  refreshDiffusion(world);
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    advanceLiteracy(nation);
    ensureResearch(nation);
    // Nobetci EN YENI anahtar: eski kayittaki techMods yeni anahtarlari
    // tasimaz; eksikse yeniden kurulur (bkz. save.js — economy butun gider).
    if (!nation.economy.techMods || !('literacyReach' in nation.economy.techMods)) {
      refreshTechModifiers(nation);
    }
    const isPlayer = nation.id === game.turns.playerNation;
    // YZ program secimi: vade doldugunda ya da program yokken. Oyuncu kendi
    // ilanini verir; suresi dolan programi surdurmek de mesru bir tercihtir.
    // Program secimi: YZ her zaman, oyuncu YALNIZ arastirma devredildiyse.
    // AUTO kapaliyken oyuncunun programi kendiliginden degismez; suresi dolan
    // programi surdurmek ya da degistirmek onun karari kalir.
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
        // Taahhut aninda baglar (oyuncu tarafiyla ayni kural).
        setBudgetPolicy(nation, 'education',
          Math.max(nation.economy.social?.education ?? 0, PROGRAMMES[pick]?.floor ?? 0));
      } else if (nation.research.programme) {
        // Ayni program yeniden taahhut edildi: vade tazelenir.
        nation.research.programmeSince = world.turn ?? 0;
      }
    }
    // Bosalan kuyrugu program doldurur — OYUNCU DAHIL. Bu, eski "oyuncunun
    // secimini ezme" sorununu geri getirmez: program oyuncunun KENDI ilan
    // ettigi yondur; nextTechFor o yonu yurutur, elle secim hala serbest
    // (startResearch her an yeniden yonlendirebilir). Kor beta B-018'in
    // (dokuz kacan secim, 5671 bos RP) yapisal cozumu budur.
    if (!nation.research.current) {
      const pick = nextTechFor(nation, year, world);
      if (pick) startResearch(nation, pick);
    }
    const done = advanceResearch(nation, year, world);
    if (done && !nation.research.current) {
      // Biten teknoloji kuyrugu BOSALTIR; yukaridaki doldurma advanceResearch'ten
      // once kostugu icin burada doldurulmazsa asagidaki kart her seferinde
      // "nothing left to research" der (olculdu: 56 kartta 56, agac doluyken)
      // ve puan bir hafta bosta birikir.
      const pick = nextTechFor(nation, year, world);
      if (pick) startResearch(nation, pick);
    }
    if (done && isPlayer) {
      const entry = techById(done);
      const next = nation.research.current
        ? techById(nation.research.current)?.tech.name ?? null : null;
      const opens = [
        ...(entry?.tech.unlock ?? []).map((id) => id.replace(/_/g, ' ').toLowerCase()),
        ...(entry?.tech.unlockUnit ?? []).map((id) => `${id.toLowerCase()} divisions`),
      ];
      if (opens.length) {
        // KILOMETRE TASI: yeni bir yetenek acan teknoloji vakayinameye girer
        // (tier 2, durdurmaz). Yuzyilda ~10 boyle an var — "major research
        // milestones" tam olarak bunlar; +%6'lik ara kademeler DEGIL.
        announce(game, nation, {
          kind: 'RESEARCH', tier: TIER.MAJOR, key: 'research-done', ttl: 0,
          title: `${entry?.tech.name ?? done} achieved`,
          detail: `Opens ${opens.join(', ')}.`
            + (next ? ` Research continues with ${next}.` : ''),
        });
      } else {
        // Kart KALICI (ttl 0) — okunana kadar durur (B-018). Metin devami da
        // soyluyor: kuyruk programa gore kendini doldurdu.
        game.turns.addLog(
          `${entry?.tech.name ?? done} researched`
          + (next ? ` — continuing with ${next}.` : ' — nothing left to research.'),
          { kind: 'RESEARCH', ttl: 0, key: 'research-done' },
        );
      }
    }
  }
  const market = world.market;
  const ctx = { world, market, profile: {} };
  let markT = performance.now();
  ctx.mark = (name) => {
    const now = performance.now();
    ctx.profile[name] = (ctx.profile[name] ?? 0) + (now - markT);
    markT = now;
  };
  // Kareler arasında geçen duvar süresi profile karışmasın (bkz. turnSteps).
  ctx.stamp = () => {
    markT = performance.now();
  };
  // Fabrikalar geçen haftanın küresel arz/talep gerçekleşmesine göre çalışır.
  // Bir haftalık gecikme bütün ülkeleri aynı oranda etkiler ve dizi sırasının
  // piyasada kimin girdiyi kapacağını belirlemesini engeller.
  ctx.inputAvailability = marketInputAvailability(market);
  for (const state of Object.values(market.goods)) {
    state.supply = 0;
    state.demand = 0;
    state.traded = 0;
  }
  ctx.mark('setup');
  return ctx;
}

/**
 * Isgal payi ve savas yuku: haftada BIR KEZ, TEK dunya taramasiyla.
 *
 * Neden burada: istikrarin girdisi olarak lazim ve ulke basina province
 * taramasi yapilamaz (30 ulke x ~300 kume = haftada on binlerce yineleme,
 * hazir optimize edilmis sicak yolu geri bozardi). Tek kare taramasi ~5K
 * yineleme ve butun ulkeleri ayni gecisde doldurur.
 */
/**
 * OKURYAZARLIK ARTIK BIR STOKTUR.
 *
 * Eskiden `census.literacyOf` saf bir formuldu — sinif × egitim yuzdesi ×
 * sehirlesme — ve dosyanin kendi yorumu bunu itiraf ediyordu: *"Simule edilen
 * bir istatistik DEGILDIR."* Biriktirmedigi icin egitim butcesi sabit
 * kaldiginda carpan da sabit kaliyor, geriye yalnizca SINIF BILESIMI etkisi
 * kaliyordu.
 *
 * Beta'nin 62 yillik gizemi tam olarak buydu (BUG-019): oyuncu egitimi %40'ta
 * tuttu, sanayilesme koyluyu dusuk okuryazarlikli isci sinifina tasidi ve
 * okuryazarlik %24 → %23 DUSTU. Para harcandi, hicbir sey birikmedi.
 *
 * Artik stok: egitim harcamasi ve universiteler bir HEDEF belirler, stok
 * oraya yillar icinde yaklasir. Hedefe varis ~40 yil surer (yarilanma ~14
 * yil) — bir insan omru boyunca gorunur, tek secimde donmez.
 */
/**
 * Okuryazarlik stogunun hedefe yaklasma hizi (haftalik pay).
 *
 * 0.001 -> 0.004. ESKI DEGER EGITIMI OLU BIR KALDIRAC YAPIYORDU: yarilanma
 * ~693 hafta, yani 13 oyun yili. Olculdu (egitim %100'de sabit, 360 hafta):
 * okuryazarlik ancak 0.21'e cikiyor, arastirma 2.06/hafta kaliyor ve en ucuz
 * teknoloji 215 puana mal oldugu icin BIR teknoloji 105 hafta suruyordu.
 * Egitimi %25'ten %100'e cikarmak 900 haftada ortalama +0.33 teknoloji
 * getiriyordu — matematiksel olarak %60 daha fazla arastirma, stratejik
 * olarak hicbir sey.
 *
 * Yeni deger yarilanmayi ~173 haftaya (3.3 oyun yili) indirir: hala uzun
 * vadeli bir yatirim, ama SONUCU AYNI KAMPANYADA gorunur. Teknoloji agacina,
 * maliyetlere ve on kosullara dokunulmadi — tikanan tek halka buydu.
 */
const LITERACY_APPROACH = 0.004;

/**
 * Okuryazarlik HEDEFI (disa acik: tech-effect denetimi saf yoklar).
 * Universite carpani okul tabanini yukseltir; `literacyReach` teknolojileri
 * (Public Instruction) tavani buyutur. Mekanik azami eskiden 0.8488 idi —
 * 0.95 kirpmasi OLU idi; literacyReach ile ilk kez ulasilabilir.
 */
export function literacyTargetOf(nation) {
  const economy = nation.economy;
  const schooling = clamp(economy.social?.education ?? 0, 0, 100) / 100;
  const reach = economy.techMods?.literacyReach ?? 0;
  const budgeted = 0.08 + schooling * 0.62 * (1 + higherEducationBonus(nation));
  // OKUL YASASI BIR TABANDIR, BIR KALEM DEGIL. Butce ile TOPLANMAZ: zorunlu
  // egitim yasasi cikaran ulke, hazinesi egitime sifir ayirsa bile bu
  // seviyenin altina dusmez. Boylece yasa ile kaydirac ayni sayiyi iki kez
  // odemez ve ikisinin cumlesi ayri kalir: yasa tabani, butce hedefi.
  const floor = reformModifiers(nation).literacyFloor ?? 0;
  return clamp(Math.max(budgeted, floor) + reach, 0, 0.95);
}

function advanceLiteracy(nation) {
  const economy = nation.economy;
  const target = literacyTargetOf(nation);
  const current = Number.isFinite(economy.literacy) ? economy.literacy : target * 0.35;
  economy.literacy = current + (target - current) * LITERACY_APPROACH;
  economy.literacyTarget = target;
}

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
    // Seferberlik tek basina bir yuktur: tarla ve tezgah bosalir, halk
    // silah altindadir. Savas olmasa da (ultimatom) hissedilir; bu yuzden
    // seferberligi barista acik birakmak bedava degildir.
    if (nation.mobilization?.active) strain += 0.35;
    nation.economy.warFronts = fronts;
    nation.economy.warStrain = clamp(strain / 2, 0, 1);
  }
}

const OCCUPIED_SCRATCH = [];

export function runNationEconomy(game, nation, ctx) {
  if (!nation.alive) return;
  const { world, market, inputAvailability, mark } = ctx;
  ctx.stamp();
  {
    // Geçen haftanın inşaat kuyruğunda biten tesisler önce gerçeğe dönüşür.
    commitCompletedProjects(game, nation);
    // Subvansiyon politikasi (yalniz oyuncu: YZ kendi maliyesinde yonetiyor).
    // Herkes icin ayni: sahibine gore degisen bir kural degil.
    applySubsidyPolicy(world, nation);
    resetNationGoodsFlow(nation);
    updateClasses(world, nation);
    mark('classes');
    // Ulusun haftalik toplam ciktisi (ham + sanayi) karalama nesnesinde
    // birikir; omru bu fonksiyon cagrisi kadardir, kapanista inventory'ye
    // DEGER olarak kopyalanir. Referansi disari verme.
    const ownOutput = nationOutputScratch;
    for (let i = 0; i < GOOD_IDS.length; i++) ownOutput[GOOD_IDS[i]] = 0;
    rawProduction(world, nation, market, ownOutput);
    // RGO'nun katma degeri brut ciktisina esittir: bu modelde tarlanin
    // piyasadan aldigi bir girdi yok (gubre TALEP olarak yazilir ama RGO'ya
    // maliyet olarak islenmez). Sanayi icin ayni sey DOGRU DEGILDIR — bkz.
    // runFactories.
    let baseOutputValue = 0;
    let baseOutputReal = 0;
    for (const id in ownOutput) {
      baseOutputValue += priceOf(world, id) * ownOutput[id];
      baseOutputReal += basePriceOf(id) * ownOutput[id];
    }
    mark('raw');
    const industry = runFactories(world, nation, market, ownOutput, inputAvailability);
    // İşe alım ve seviye atlama aylıktır: bu haftanın kârı görüldükten sonra,
    // dört haftada bir. Sanayinin 100 yıla yayılmasını sağlayan tempo budur.
    if ((world.turn ?? 1) % HIRING_INTERVAL === 0) runFactoryEmployment(game, nation);
    mark('factories');
    const military = ensureMilitaryEconomy(nation);
    // Stok yatırımının haftalık bütçesi: geçen haftanın gelirinin çeyreği ×
    // tedarik kaydırağı. Sınırsız hızda stoklama, kuruluş yıllarında bütün
    // ülkeleri borç tavanına yığıyordu (ölçüldü: 53. haftada 12/15 ülke
    // kapasitede, ortalama hazine −652). Bütçeyi aşan üretim depoya değil
    // piyasaya gider — silahlanma bir on yıla yayılır, bir yıla değil.
    let retainedBudget = Math.max(2, (nation.economy.ledger?.income ?? 20) * 0.25)
      * ((nation.economy.armyFunding ?? 100) / 100);
    for (let e = 0; e < MILITARY_EQUIPMENT_IDS.length; e++) {
      const id = MILITARY_EQUIPMENT_IDS[e];
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
      const producedField = MILITARY_FIELD[id].produced;
      military[producedField] = retainedFactory + retainedWorkshop;
      setEquipmentStock(
        nation,
        id,
        equipmentStock(nation, id) + military[producedField],
      );
      // Equipment retained by the state cannot also be sold on the market.
      market.goods[id].supply = Math.max(0, market.goods[id].supply - retainedFactory);
      addNationFlow(nation, id, 'retained', retainedFactory);
      // Devlet fabrika çıktısını artık BEDAVA almaz: alıkonan teçhizat piyasa
      // fiyatından hazineden ödenir. Fabrika bu geliri zaten yazıyordu
      // (runFactories bütün çıktıyı fiyatlandırır) ama karşısında hiçbir
      // ödeme yoktu — bütçe ile sanayi arasındaki delik buydu.
      const retainedCost = retainedFactory * price;
      settle(nation, 'procurement', -retainedCost);
      retainedBudget = Math.max(0, retainedBudget - retainedCost);
    }
    mark('military');
    populationDemand(world, nation, market);
    mark('popDemand');

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

    const { demand: armyDemand, fullDemand } = armyWeeklyDemand(world, nation);
    let armySupplyWeighted = 0;
    let armySupplyTotal = 0;
    for (const id in armyDemand) {
      const amount = armyDemand[id];
      addFlow(market, id, 'demand', amount);
      addNationFlow(nation, id, 'demand', amount);
      // Ordunun tükettiğini devlet öder: geçen haftanın karşılanma oranı
      // üzerinden (bu haftanın ticareti daha kapanmadı). Karşılanmayan pay
      // ödenmez ama ikmal endeksini düşürür.
      const fulfilled = clamp(nation.economy.goodsFlow?.[id]?.fulfilledShare ?? 1, 0, 1);
      const consumptionCost = amount * fulfilled * priceOf(world, id);
      // ZORUNLU GIDER, bilerek: ordu yedigini yer. Hazine yetmezse hafta
      // eksiye doner ve borclanma devralir (settleDebt) — sessizce kirpmak
      // "ordum neden acti" sorusunu cevapsiz birakirdi.
      settle(nation, 'procurement', -consumptionCost);
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

    // GSYH = RGO katma degeri + SANAYI KATMA DEGERI. Cari fiyatlarla.
    nation.economy.gdp = baseOutputValue + industry.value;
    // REEL GSYH ayni toplam TABAN fiyatlarla. Buyume egrisini yalniz bu
    // gosterebilir: nominal seride hacim artisi ile fiyat dususu birbirini
    // goturuyor ve "buyume yok" bulgusu yillarca fiyat cokusuyle karisti.
    nation.economy.realGdp = baseOutputReal + industry.real;
    // Korunum denetimi gelir bilesimini yeniden hesaplayabilsin diye taban
    // uretim degeri ayrica saklanir (gdp = taban + sanayi tek basina yetmez).
    nation.economy.baseOutputValue = baseOutputValue;
    fiscalBalance(nation, baseOutputValue);
    runPopulationMobility(nation, world.turn);
    mark('fiscal');
    runPrivateSector(game, nation);
    mark('privateSector');
    runEconomicAI(game, nation);
    // Bina kararı da bir harcamadır ve defter bu haftanın kaydını yazmadan
    // önce verilmeli; construction.js yalnız işi ilerletir.
    planConstructionAI(game, nation);
    mark('econAI');
  }
}

export function finishEconomy(game, ctx) {
  const { world, market, mark } = ctx;
  ctx.stamp();
  // Dünya piyasasındaki gerçek alımlar stratejik stokları doldurur ve fiyatı
  // yukarı iter; böylece ekrandaki piyasa ile inşaat ekonomisi aynı sistemdir.
  procureStrategicGoods(world);
  settleGlobalTrade(world);
  mark('trade');
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    updateMilitaryAverages(nation);
    closeNationWeek(world, nation, world.turn);
  }
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

export function formatPopulation(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return String(Math.round(value));
}
