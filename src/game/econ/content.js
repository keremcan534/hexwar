// İÇERİK VERİSİ — simülasyon mantığı yok.
//
// Mal kataloğu, fabrika tarifleri, sınıf/meslek tanımları, sınıf sepetleri,
// sosyal programlar ve askerî teçhizat burada durur. Bu dosya hiçbir şey
// hesaplamaz ve hiçbir şeyi içe aktarmaz: yeni bir mal, tarif ya da program
// eklemek için yalnız buraya bakmak yeter (bkz. SIMPLE_CORE_NOTES §2.5).
//
// Katman notu: veri. DOM bilmez, Node'da sınanabilir, döngüsel bağı yoktur.

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
 * Bir fabrika seviyesinin kadrosu. Çıktı seviye başına normalize edilir
 * (employees / WORKERS_PER_LEVEL), yani bu sabiti değiştirmek mal dengesini
 * bozmaz, yalnız sanayinin *hızını* değiştirir.
 */
export const WORKERS_PER_LEVEL = 2000;

/** Bir tesisin çıkabileceği en yüksek seviye. */
export const MAX_FACTORY_LEVEL = 10;


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

/**
 * Sınıf içi meslek dağılımı. Yalnız *türetme* zeminidir: gerçek istihdamı
 * bilinen meslekler (çiftçi, madenci, işçi) sayaçtan değil işin kendisinden
 * gelir, geri kalanı bu paylarla bölünür (bkz. econ/pop.js professionCountsOf).
 */
export const PROFESSION_SHARES = {
  lower: { farmers: 0.52, laborers: 0.25, workers: 0.23 },
  middle: { clerks: 0.45, artisans: 0.35, officers: 0.20 },
  upper: { capitalists: 0.45, aristocrats: 0.55 },
};

/**
 * Sınıf sepetleri: 10.000 kişinin haftada istediği mal. Zincir derinleştiği
 * için sepetler katmanlı — alt sınıf temel gıda ve giyim, orta sınıf dayanıklı
 * tüketim, üst sınıf lüks; böylece üst katman fabrikaların gerçek bir iç
 * talebi olur. Ticaret defteri de aynı tabloyu okur (uydurma pay yok).
 */
export const CLASS_NEEDS = {
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
export function needAmount(need, turn) {
  if (typeof need === 'number') return need;
  return turn >= (need.from ?? 0) ? need.amount : 0;
}



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

export const DEFAULT_SOCIAL = { education: 0, health: 0, welfare: 0 };
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

/** Varsayılan vergi oranları (%). */
export const DEFAULT_TAXES = { lower: 20, middle: 15, upper: 10 };

/**
 * HAYAT MALLARI. Nüfusun beslenmesi (ve dolayısıyla büyümesi) YALNIZ bunlara
 * bakar; hane bütçesi de önce bunlara harcanır.
 *
 * Konserve (groceries) bilerek DIŞARIDA: o bir kolaylık malıdır, tahıl ise
 * hayattır. İçeride olduğu ölçüldü — konserve fiyatı taban fiyatın 3.3 katına
 * çıkınca "gıda sepeti"nin %90'ını tek başına kaplıyor ve tahıl bedavayken
 * nüfus açlık çekiyor görünüyordu. Vic2'nin life needs / everyday needs
 * ayrımıyla aynı sebep.
 */
export const FOOD_GOODS = ['food', 'fish'];
