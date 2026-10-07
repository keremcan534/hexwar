// ULUSLAR ÇAĞI ekonomisinin veri tabloları. Formül YOK — yalnız sabitler.
//
// Bir sayı değişecekse burada değişir; sistem dosyaları (resources, industry,
// trade, construction) bu tablolardan okur. Sayıların gerekçesi TASARIM.md'de,
// ölçülmüş ayarları ise yanlarındaki notta durur.
//
// Katman notu: hiçbir şey import etmez (döngü riski sıfır).

/** Nüfus birimi: ekonomi formüllerinin hepsi "100 bin kişi başına" yazılır. */
export const POP_UNIT = 100000;

/**
 * Altı kaynak. Akış olarak işler: stok yoktur, her hafta üretilir, tüketilir,
 * fazlası satılır, açığı alınır. `price` dünya fiyatının tabanıdır (altın/birim).
 */
export const RESOURCES = {
  FOOD: { id: 'FOOD', name: 'Food', glyph: '🌾', color: '#c9a13a', hue: 45, sat: 45, price: 1.0 },
  COAL: { id: 'COAL', name: 'Coal', glyph: '⬛', color: '#4a4a52', hue: 230, sat: 8, price: 1.6 },
  IRON: { id: 'IRON', name: 'Iron', glyph: '⛏', color: '#8a6f62', hue: 12, sat: 35, price: 2.0 },
  TIMBER: { id: 'TIMBER', name: 'Timber', glyph: '🪵', color: '#6f8a3a', hue: 95, sat: 38, price: 1.2 },
  HORSES: { id: 'HORSES', name: 'Horses', glyph: '🐎', color: '#a0703c', hue: 30, sat: 45, price: 2.2 },
  SALTPETER: { id: 'SALTPETER', name: 'Saltpeter', glyph: '✦', color: '#d8d0c0', hue: 280, sat: 30, price: 3.0 },
};
export const RESOURCE_IDS = Object.keys(RESOURCES);

/** Yataktan çıkan kaynaklar (gıda araziden gelir, yatağı yoktur). */
export const DEPOSIT_IDS = ['COAL', 'IRON', 'TIMBER', 'HORSES', 'SALTPETER'];

/**
 * Yatak hex'i başına haftalık çıktı (maden ve demiryolundan önce). Kömür en
 * bol: sanayinin yakıtı; yine de 64 yıllık koşuda dünya kömürü sanayiyi
 * frenler (ölçüldü: tek çıktıyla 1900'de medyan kömür oranı 0.09).
 */
export const DEPOSIT_OUTPUT = { COAL: 0.45, IRON: 0.35, TIMBER: 0.3, HORSES: 0.3, SALTPETER: 0.3 };

/**
 * Gıda: nüfus birimi başına üretim `FOOD_BASE + FOOD_FERTILITY × verim`.
 * Nüfusla ölçeklenir (tarlayı insan sürer) ama verimsiz toprak hep açık verir:
 * çöl ve dağ ithalatçı, ova ve bozkır ihracatçı doğar.
 */
export const FOOD_BASE = 0.45;
export const FOOD_FERTILITY = 0.55;
/** Nüfus birimi başına haftalık gıda ihtiyacı. */
export const FOOD_NEED = 1.0;

/**
 * Bina tablosu. `max` kademe tavanı; yuva toplamı kalkınma + 1. `upkeep`
 * kademe başına haftalık bakım (altın): genişleyen devlet onu taşımalı —
 * yoksa geç oyunda altın birikip anlamsızlaşıyordu (ölçüldü: 1900 medyan
 * hazine 29 bin).
 */
export const BUILDINGS = {
  farm: { id: 'farm', name: 'Farm', cost: 80, upkeep: 0.05, weeks: 12, max: 3, effect: 'Food +25%' },
  mine: { id: 'mine', name: 'Mine', cost: 120, upkeep: 0.15, weeks: 16, max: 3, effect: 'Deposit output +50%', needsDeposit: true },
  factory: { id: 'factory', name: 'Factory', cost: 250, upkeep: 0.4, weeks: 26, max: 5, effect: '+1 industrial capacity', minDevelopment: 2 },
  dockyard: { id: 'dockyard', name: 'Dockyard', cost: 200, upkeep: 0.4, weeks: 30, max: 3, effect: 'Ships line +1 IC cap, naval base', coastal: true },
  barracks: { id: 'barracks', name: 'Barracks', cost: 100, upkeep: 0.2, weeks: 16, max: 2, effect: 'Manpower +20%, training faster' },
  fort: { id: 'fort', name: 'Fort', cost: 120, upkeep: 0.2, weeks: 20, max: 3, effect: 'Defence +15%' },
  railway: { id: 'railway', name: 'Railway', cost: 150, upkeep: 0.15, weeks: 20, max: 5, effect: 'Resources +10%, supply, movement', costGrowth: 0.5 },
  university: { id: 'university', name: 'University', cost: 200, upkeep: 0.4, weeks: 30, max: 2, effect: 'Research +0.3, literacy', minDevelopment: 4 },
};
export const BUILDING_IDS = Object.keys(BUILDINGS);

/** Her fabrika bir sonrakini %3 pahalılaştırır: sanayi hamlesi hep artan bedeldir. */
export const FACTORY_COST_GROWTH = 0.05;

/**
 * Kalkınma: bir kademe 12 hafta, bedel 10 × (hedef)² × √(nüfus birimi).
 * Kalabalık province'i kalkındırmak pahalı ama en hızlı geri döner.
 */
export const DEVELOPMENT_WEEKS = 12;
export const DEVELOPMENT_COST = 20;
export const DEVELOPMENT_MAX = 10;
/** Kalkınma tavanının tabanı (teknoloji ve okuryazarlık ekler). */
export const DEVELOPMENT_CAP_BASE = 3;

/** İnşaat süresince proje başına haftalık kereste (eksikse yavaşlar). */
export const CONSTRUCTION_TIMBER = 0.3;
/** Demiryolu inşaatı ayrıca demir yer. */
export const RAILWAY_IRON = 0.4;

/**
 * Teçhizat. `ic` bir parçanın sanayi bedeli, `resources` parça başına kaynak.
 * Gemi yelken çağında kereste, zırhlı teknolojisiyle demir ve kömür yer.
 */
export const EQUIPMENT = {
  rifles: { id: 'rifles', name: 'Rifles', glyph: '🔫', ic: 0.1, resources: { IRON: 0.1, TIMBER: 0.05 } },
  guns: { id: 'guns', name: 'Artillery', glyph: '💣', ic: 0.4, resources: { IRON: 0.4 } },
  ships: {
    id: 'ships', name: 'Ships', glyph: '⚓', ic: 0.6, resources: { TIMBER: 0.6 },
    ironclad: { IRON: 0.5, COAL: 0.2 },
    needsDockyard: true,
  },
};
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);

/** Alay başına kuruluş teçhizatı; takviye kaybolan güç oranında aynısını yer. */
export const UNIT_EQUIPMENT = {
  INFANTRY: { rifles: 10 },
  CAVALRY: { rifles: 6 },
  ARTILLERY: { rifles: 4, guns: 6 },
  WARSHIP: { ships: 10 },
};

/** Alay başına haftalık kaynak bakımı (at sürüsü). */
export const UNIT_RESOURCES = {
  CAVALRY: { HORSES: 0.5 },
  ARTILLERY: { HORSES: 0.25 },
};

/** Muharebedeki alay başına haftalık barut (güherçile). */
export const BATTLE_SALTPETER = 0.5;

/** Fabrika kademesi başına IC ve IC başına kömür. */
export const FACTORY_IC = 1.0;
/** Tersane kademesi başına gemi hattına girebilen IC. */
export const DOCKYARD_IC = 1.0;
export const COAL_PER_IC = 0.35;

/**
 * Tüketim malı: ihtiyaç ve el tezgâhı arzı nüfus birimi başına. Çağ çarpanı
 * 1836'da 1, 1900'de CONSUMER_ERA_GROWTH + 1 — beklenti büyür, sanayisiz ülke
 * geride kalır.
 */
export const CONSUMER_NEED = 0.6;
export const CONSUMER_ERA_GROWTH = 0.8;
export const COTTAGE_OUTPUT = 0.5;
export const COTTAGE_PER_DEVELOPMENT = 0.03;

/** Üretim hattı verimi: tavan, taban, haftalık artış ve boşta erime. */
export const LINE_EFFICIENCY = { start: 0.5, floor: 0.2, cap: 0.8, gain: 0.01, decay: 0.005 };

/** Vergi: nüfus birimi başına taban; kalkınma kademesi başına artış. */
export const TAX_PER_UNIT = 0.45;
export const TAX_PER_DEVELOPMENT = 0.25;

/** Alay başına haftalık bakım (altın); savaşta seferi gider çarpanı. */
export const UPKEEP = { land: 0.6, sea: 1.0, warMultiplier: 1.5 };

/** Alay kuruluş bedeli (altın). Asıl bedel teçhizat ve insan gücüdür. */
export const RECRUIT_GOLD = { INFANTRY: 12, CAVALRY: 20, ARTILLERY: 22, WARSHIP: 30 };

/** Borç: haftalık faiz, tavan (haftalık gelirin katı, mutlak taban). */
export const DEBT = { interest: 0.003, capWeeks: 20, capFloor: 150, bankruptcyWeeks: 52 };

/** Ticaret: fiyat bandı ve haftalık yaklaşma. */
export const TRADE = { minPrice: 0.6, maxPrice: 2.0, priceSpeed: 0.1 };

/** Oyunun son turu (1900); çağ çarpanları buna göre ölçeklenir. */
export const ERA_TURNS = 3340;
