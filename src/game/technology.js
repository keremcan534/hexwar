// Teknoloji ve arastirma.
//
// Model Victoria 2'nin iskeleti: 5 kategori x 5 klasor x 6 kademe, klasor
// icinde DOGRUSAL ilerleyis. Arastirma puani okuryazarliktan, orta siniftan
// ve ulusal rutbeden gelir.
//
// EN ONEMLI TASARIM KARARI — takvim ATILMIYOR:
// `availableFrom` (economy.js/units.js) Vic2'nin "activation year"idir ve
// UST SINIR olarak kalir. Arastirma o tarihi ONE CEKER, yerine gecmez.
//   - Arastiran ulke yillar once kurar  -> teknolojik ustunluk ilk kez mumkun.
//   - Arastirmayan ulke yil gelince yine acar -> kimse kalici geride kalmaz.
// Beta'nin begendigi "dunya kendi tarihini yaziyor" hissi boylece korunur
// (bkz. rapor: celik/telefon/otomobil onyillar icinde makul sirayla geldi).
//
// Katman notu: saf veri + hesap. DOM yok, economy.js'i IMPORT ETMEZ
// (economy bunu import eder; ters yon dongu olurdu).

import { reformModifiers } from './reforms.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const TECH_CATEGORIES = {
  army: { id: 'army', name: 'Army', icon: '⚔' },
  navy: { id: 'navy', name: 'Navy', icon: '⚓' },
  commerce: { id: 'commerce', name: 'Commerce', icon: '⚖' },
  culture: { id: 'culture', name: 'Culture', icon: '🎭' },
  industry: { id: 'industry', name: 'Industry', icon: '⚙' },
};

/**
 * Klasorler. Vic2'nin kendi bolumlemesi — isimler bilerek birebir, cunku
 * oyuncu zaten bu haritayi biliyor.
 */
// Klasor listesi YAZILMIS icerige gore kirpildi: bos sutun cizdirmek
// "yarim oyun" hissi verir (eski hali 5 kategoride 25 klasor vaat ediyordu,
// yalniz 5'i doluydu). Icerik eklendikce klasor da eklenir.
export const TECH_FOLDERS = {
  army: ['Army Doctrine', 'Military Science'],
  navy: ['Ship Construction'],
  commerce: ['Financial Institutions', 'Communications'],
  culture: ['Philosophy', 'Public Instruction'],
  industry: ['Power', 'Mechanization', 'Metallurgy', 'Infrastructure', 'Chemistry & Electricity'],
};

/**
 * Degistirici anahtarlari. Her teknoloji EN AZ birini tasimali — beta raporu
 * "+%2'lik dolgu dugmeler" istemedigini acikca yazdi.
 *
 * Hepsi TOPLANIR (additive); `refreshTechModifiers` haftada bir kez toplayip
 * `economy.techMods` duz nesnesine yazar, sicak yol yalnizca o alani okur.
 */
// `literacyCap` ve `morale` anahtarlari silindi: hicbir teknoloji tasimiyordu
// ve hicbir sistem okumuyordu — sifir tuketicili degistirici tutulmaz (P1-6).
// HEPSININ gercek tuketicisi var (audit:tech-effect AC/KAPA ile dogrular):
//   rgoOutput          -> provinces.provinceOutput
//   constructionPower  -> construction.constructionPower
//   factoryThroughput  -> economy.runFactories
//   inputEfficiency    -> economy.runFactories (girdi tuketimi; tavan 0.5,
//                         agac toplami 0.50'ye kirpildi — olu kuyruk yok)
//   researchRate       -> researchPointsOf (asagida)
//   supplyConsumption  -> economy.armyWeeklyDemand
//   literacyReach      -> economy.literacyTargetOf (okuryazarlik tavani;
//                         0.95 kirpmasi ilk kez ULASILABILIR oluyor)
//   debtCapacityBonus  -> economy.debtCapacity (borc kapasitesi; faiz yuku
//                         load=debt/kapasite uzerinden kendiliginden duser)
//   trainingCapacity   -> recruitment.trainingCapacity (es zamanli egitim
//                         kadrosu, DUZ slot — yuzde degil)
//   reinforcementRate  -> reinforcement.reinforcementRateOf
export const TECH_MODS = {
  rgoOutput: 'RGO output',
  constructionPower: 'Construction power',
  factoryThroughput: 'Factory throughput',
  inputEfficiency: 'Factory input efficiency',
  researchRate: 'Research speed',
  supplyConsumption: 'Army supply consumption',
  literacyReach: 'Literacy ceiling',
  debtCapacityBonus: 'Debt capacity',
  trainingCapacity: 'Training slots',
  reinforcementRate: 'Reinforcement rate',
};

/** `t(...)` kisa yazim: teknoloji kaydi. */
function t(id, name, year, effects = {}) {
  return { id, name, year, ...effects };
}

/**
 * INDUSTRY kategorisi — tam dolu (5 klasor x 6 kademe).
 *
 * Diger dort kategori ayni sekilde doldurulacak; iskelet ve kosum yolu
 * hazir (bkz. TECHNOLOGY_GAMEPLAY_AUDIT "EK: UYGULAMA TASARIMI" G bolumu).
 * Icerik once OLCULEN kategoriden buyutulur — 150 dugumu tek seferde
 * yazmak dolguya davetiyedir.
 *
 * `year` = Vic2'nin activation year'i; `unlock` = economy.js FACTORIES id'si.
 */
export const TECHNOLOGIES = {
  industry: {
    'Power': [
      t('water_wheel_power', 'Water Wheel Power', 1836, { rgoOutput: 0.04 }),
      t('stationary_steam_engine', 'Stationary Steam Engine', 1840, { factoryThroughput: 0.08 }),
      t('mechanical_production', 'Mechanical Production', 1850, { factoryThroughput: 0.10 }),
      t('compound_engines', 'Compound Steam Engines', 1860, { factoryThroughput: 0.10, inputEfficiency: 0.04 }),
      // 1875 -> 1866: kilit acacagi fabrikanin takviminden (1870) SONRAYA
      // tarihlenmisti, yani arastirmak hicbir zaman one gecirmiyordu —
      // modulun kendi sozlesmesinin (bkz. dosya basi) ihlaliydi. 1866 hem
      // sirayi bozmaz (1860 < 1866 < 1895) hem tarihsel (Siemens dinamosu).
      t('electrical_power', 'Electrical Power Generation', 1866, { factoryThroughput: 0.12, unlock: ['ELECTRIC_GEAR_FACTORY'] }),
      t('combustion_engine', 'Combustion Engine', 1895, { factoryThroughput: 0.12, unlock: ['AUTOMOBILE_FACTORY'] }),
    ],
    'Mechanization': [
      t('basic_mechanization', 'Basic Mechanization', 1836, { factoryThroughput: 0.06 }),
      t('interchangeable_parts', 'Interchangeable Parts', 1845, { inputEfficiency: 0.06 }),
      // 1855 -> 1848: ayni hata (fabrika takvimi 1850). 1845 < 1848 < 1870.
      t('precision_work', 'Precision Work', 1848, { inputEfficiency: 0.06, unlock: ['MACHINE_PARTS_FACTORY'] }),
      t('assembly_line', 'Assembly Line', 1870, { factoryThroughput: 0.14 }),
      t('scientific_management', 'Scientific Management', 1885, { factoryThroughput: 0.10, inputEfficiency: 0.04 }),
      t('mass_production', 'Mass Production', 1900, { factoryThroughput: 0.16, inputEfficiency: 0.05 }),
    ],
    'Metallurgy': [
      t('publishing_industry', 'Charcoal Smelting', 1836, { rgoOutput: 0.05 }),
      // `unlock: ['STEEL_MILL']` KALDIRILDI: STEEL_MILL'in `availableFrom`u
      // yok, yani ilk haftadan herkese acik — kilit hicbir sey acmiyordu ama
      // ekran "Unlocks steel mill" diye SAHTE bir vaat basiyordu. Fabrikaya
      // takvim vermek yerine vaadi kaldirmak secildi: kilit eklemek butun
      // sanayi zamanlamasini (ve piyasa taban cizgisini) oynatirdi.
      t('coke_smelting', 'Coke Smelting', 1842, { rgoOutput: 0.08 }),
      t('bessemer_process', 'Bessemer Process', 1855, { inputEfficiency: 0.06 }),
      t('open_hearth', 'Open Hearth Furnace', 1868, { factoryThroughput: 0.10 }),
      t('electric_furnace', 'Electric Furnace', 1885, { factoryThroughput: 0.10, inputEfficiency: 0.05 }),
      t('alloy_steel', 'Alloy Steel', 1900, { inputEfficiency: 0.06, unlock: ['TANK_FACTORY'] }),
    ],
    'Infrastructure': [
      t('early_railways', 'Early Railways', 1836, { constructionPower: 0.10 }),
      t('iron_railways', 'Iron Railways', 1845, { constructionPower: 0.12, rgoOutput: 0.04 }),
      t('steel_railways', 'Steel Railways', 1860, { constructionPower: 0.14, supplyConsumption: -0.05 }),
      t('integral_rail', 'Integral Rail System', 1875, { constructionPower: 0.14, supplyConsumption: -0.05 }),
      t('limited_access_roads', 'Limited Access Roads', 1890, { constructionPower: 0.12, supplyConsumption: -0.05 }),
      t('national_rail_network', 'National Rail Network', 1905, { constructionPower: 0.16, supplyConsumption: -0.06 }),
    ],
    'Chemistry & Electricity': [
      t('practical_chemistry', 'Practical Chemistry', 1836, { rgoOutput: 0.04 }),
      t('fertilizer_chemistry', 'Fertilizer', 1848, { rgoOutput: 0.10 }),
      t('organic_chemistry', 'Organic Chemistry', 1860, { unlock: ['REFINERY'], inputEfficiency: 0.04 }),
      t('electricity', 'Electricity', 1872, { researchRate: 0.08 }),
      t('synthetic_polymers', 'Synthetic Polymers', 1888, { unlock: ['SYNTHETIC_OIL_PLANT'] }),
      t('nitroglycerin', 'Nitroglycerin', 1900, { inputEfficiency: 0.04 }),
    ],
  },

  // ARMY — savas modeline DOKUNMADAN durustce yapilabilenler: egitim kadrosu
  // (duz slot), takviye hizi, tedarik tuketimi ve iki tarih-kapili birimin
  // (ARMOR 1916, AIRCRAFT 1906) one cekilmesi. "Tufek I/II/III" yok: piyade/
  // suvari/topcu takvimsizdir, "acan" bir teknoloji sahte olurdu.
  army: {
    'Army Doctrine': [
      t('professional_officers', 'Professional Officer Corps', 1836, { trainingCapacity: 1 }),
      t('staff_college', 'Staff College', 1848, { trainingCapacity: 1, supplyConsumption: -0.03 }),
      t('general_staff', 'General Staff System', 1860, { reinforcementRate: 0.08 }),
      t('universal_conscription', 'Universal Conscription', 1872, { trainingCapacity: 2 }),
      t('field_telegraph', 'Field Telegraph', 1885, { reinforcementRate: 0.10, supplyConsumption: -0.03 }),
      t('motorised_logistics', 'Motorised Logistics', 1908, { supplyConsumption: -0.08, reinforcementRate: 0.10 }),
    ],
    'Military Science': [
      t('military_medicine', 'Military Medicine', 1850, { reinforcementRate: 0.12 }),
      t('breech_loading', 'Breech-Loading Arms', 1866, { supplyConsumption: -0.04 }),
      t('smokeless_powder', 'Smokeless Powder', 1884, { supplyConsumption: -0.05 }),
      t('combined_arms', 'Combined Arms Doctrine', 1900, { trainingCapacity: 1, reinforcementRate: 0.08 }),
      t('military_aviation', 'Military Aviation', 1902, { unlockUnit: ['AIRCRAFT'], unlock: ['AIRCRAFT_FACTORY'] }),
      t('armoured_warfare', 'Armoured Warfare', 1912, { unlockUnit: ['ARMOR'] }),
    ],
  },

  // NAVY — bilerek ince: bir klasor, dort teknoloji. Deniz savasi/abluka
  // mekanigi olmadigi icin derinlik taklidi yapilmadi. Gercek tuketiciler:
  // STEAMER_YARD kilidi, tersane cikti/verimi, bindirilmis alay konvoy
  // talebi (supplyConsumption onu da olcekler) ve gemi onarimi (takviye).
  navy: {
    'Ship Construction': [
      t('steam_navigation', 'Steam Navigation', 1845, { unlock: ['STEAMER_YARD'] }),
      t('screw_propulsion', 'Screw Propulsion', 1855, { supplyConsumption: -0.03 }),
      t('modern_shipyards', 'Modern Shipyards', 1875, { factoryThroughput: 0.06 }),
      t('wireless_at_sea', 'Wireless at Sea', 1898, { supplyConsumption: -0.04, reinforcementRate: 0.06 }),
    ],
  },

  // COMMERCE — mali teknolojiler borc KAPASITESINI buyutur (faiz yuku
  // load = borc/kapasite uzerinden kendiliginden duser: tek anahtar, iki
  // gorunur sonuc). Haberlesme teknolojileri yuzyilin en gorunur iki
  // fabrikasini (telefon, radyo) ilk kez arastirilabilir yapar.
  commerce: {
    'Financial Institutions': [
      t('private_banking', 'Private Banking', 1836, { debtCapacityBonus: 0.10 }),
      t('joint_stock', 'Joint-Stock Companies', 1850, { debtCapacityBonus: 0.12 }),
      t('limited_liability', 'Limited Liability', 1862, { debtCapacityBonus: 0.12 }),
      t('central_banking', 'Central Banking', 1875, { debtCapacityBonus: 0.16 }),
      t('modern_credit', 'Modern Credit Markets', 1890, { debtCapacityBonus: 0.20 }),
    ],
    'Communications': [
      t('commercial_telegraphy', 'Commercial Telegraphy', 1848, { constructionPower: 0.06 }),
      t('transoceanic_cables', 'Transoceanic Cables', 1866, { constructionPower: 0.08 }),
      t('telephone_exchange', 'Telephone Exchange', 1877, { unlock: ['TELEPHONE_FACTORY'] }),
      t('wireless_telegraphy', 'Wireless Telegraphy', 1896, { unlock: ['RADIO_FACTORY'] }),
    ],
  },

  // CULTURE — arastirmanin kendisini ve okuryazarlik TAVANINI buyutur.
  // literacyReach sayesinde advanceLiteracy'nin 0.95 kirpmasi ilk kez
  // ulasilabilir oluyor (mekanik tavan 0.8488 idi — olu kirpma canlandi).
  culture: {
    'Philosophy': [
      t('scientific_method', 'The Scientific Method', 1836, { researchRate: 0.05 }),
      t('positivism', 'Positivism', 1852, { researchRate: 0.06 }),
      t('research_university', 'The Research University', 1868, { researchRate: 0.08, literacyReach: 0.02 }),
      t('professional_societies', 'Professional Societies', 1884, { researchRate: 0.08 }),
      t('modern_physics', 'Modern Physics', 1902, { researchRate: 0.10 }),
    ],
    'Public Instruction': [
      t('normal_schools', 'Normal Schools', 1840, { literacyReach: 0.03 }),
      t('compulsory_primary', 'Compulsory Primary Schooling', 1858, { literacyReach: 0.04 }),
      t('public_libraries', 'Public Libraries', 1872, { literacyReach: 0.03, researchRate: 0.04 }),
      t('mass_press', 'The Mass Press', 1886, { literacyReach: 0.04 }),
      t('universal_schooling', 'Universal Schooling', 1900, { literacyReach: 0.05 }),
    ],
  },
};

/** Duz arama tablosu: id -> { tech, categoryId, folder, level }. */
const INDEX = new Map();
for (const [categoryId, folders] of Object.entries(TECHNOLOGIES)) {
  for (const [folder, list] of Object.entries(folders)) {
    list.forEach((tech, level) => INDEX.set(tech.id, { tech, categoryId, folder, level }));
  }
}

/** Bir fabrika tipini acan teknoloji (varsa). */
const UNLOCKS = new Map();
for (const { tech } of INDEX.values()) {
  for (const typeId of tech.unlock ?? []) UNLOCKS.set(typeId, tech.id);
}

/** Bir birim tipini acan teknoloji (varsa) — ayni kalip, units.js tuketir. */
const UNLOCKS_UNIT = new Map();
for (const { tech } of INDEX.values()) {
  for (const typeId of tech.unlockUnit ?? []) UNLOCKS_UNIT.set(typeId, tech.id);
}

export function techById(id) {
  return INDEX.get(id) ?? null;
}

export function ensureResearch(nation) {
  const research = nation.research ??= { points: 0, current: null, done: [] };
  research.done ??= [];
  if (!Number.isFinite(research.points)) research.points = 0;
  // Ulusal program alanlari (bkz. PROGRAMMES). Eski kayitlar bu alanlari
  // tasimaz; varsayilanlar burada dolar, surum yukseltmesi gerekmez.
  research.programme ??= null;
  research.programmeSince ??= 0;
  research.programmeCooldown ??= 0;
  research.programmeHistory ??= [];
  return research;
}

export function hasTech(nation, techId) {
  return !!nation.research?.done?.includes(techId);
}

/**
 * Fabrika tipi arastirmayla ERKEN acildi mi?
 * economy.js `factoryUnlocked` bunu takvimin YANINA koyar, yerine degil.
 */
export function techUnlocksFactory(nation, typeId) {
  const techId = UNLOCKS.get(typeId);
  return techId ? hasTech(nation, techId) : false;
}

/**
 * Birim tipi arastirmayla ERKEN acildi mi? units.js `unitAvailable` bunu
 * takvimin YANINA koyar — fabrika kapisiyla ayni VEYA kalibi. Boylece modulun
 * dosya basindaki sozlesmesi ("economy.js/units.js") ilk kez iki yariyla da
 * dogru: tank fabrikasini erken kuran ulke tanki da erken egitebilir.
 */
export function techUnlocksUnit(nation, typeId) {
  const techId = UNLOCKS_UNIT.get(typeId);
  return techId ? hasTech(nation, techId) : false;
}

/**
 * Bir teknolojinin arastirilabilir olmasi: klasorde sirasi gelmis olmali.
 * Vic2 kurali — ucuncuyu almadan dorduncu yok.
 */
export function canResearch(nation, techId) {
  const entry = INDEX.get(techId);
  if (!entry || hasTech(nation, techId)) return false;
  if (entry.level === 0) return true;
  const previous = TECHNOLOGIES[entry.categoryId][entry.folder][entry.level - 1];
  return hasTech(nation, previous.id);
}

/** O an arastirilabilecek butun teknolojiler. */
export function availableTechs(nation) {
  const out = [];
  for (const [id, entry] of INDEX) {
    if (canResearch(nation, id)) out.push({ id, ...entry });
  }
  return out;
}

/**
 * Maliyet. Iki carpan var:
 *   - kademe: ileri teknoloji pahalidir (Vic2'de de oyle),
 *   - ERKEN ARASTIRMA CEZASI: aktivasyon yilindan once arastirmak pahaliya
 *     patlar. Ceza olmasaydi 1836'da tank arastirilirdi; ceza SONSUZ olsaydi
 *     takvim yine tek belirleyici olurdu ve oyuncunun karari yok olurdu.
 *     Yilda %12 birikir, tavan 4 kat.
 */
/**
 * Taban teknoloji maliyeti. 260 -> 120.
 *
 * ARASTIRMA LAGIMININ ASIL SEBEBI BUYDU. Olculdu: egitim %10'a karsi %90,
 * ayni tohum, 1500 hafta (29 oyun yili) — okuryazarlik 0.235'e karsi 0.637,
 * arastirma 2.1'e karsi 4.1 puan/hafta, yani TAM IKI KATI. Tamamlanan
 * teknoloji: 7'ye karsi 8. Fazladan uretilen ~600 puan hicbir seye
 * donusmeden bekliyordu, cunku bir sonraki teknoloji ~500-800 puana mal
 * oluyor ve maliyet kademeyle (1 + level*0.55) arastirmadan hizli buyuyor.
 *
 * Agac degismedi: 65 teknolojinin hepsi, on kosullari, aktivasyon yillari ve
 * erken arastirma cezasi aynen duruyor. Yalnizca puanin ALIM GUCU degisti,
 * boylece "daha fazla arastirma" gercekten "daha erken teknoloji" demek
 * oluyor. 65 teknoloji / 100 yil temposu icin dogru buyukluk de budur.
 */
export const TECH_BASE_COST = 120;
export function techCost(techId, year) {
  const entry = INDEX.get(techId);
  if (!entry) return Infinity;
  const levelScale = 1 + entry.level * 0.55;
  const early = Math.max(0, (entry.tech.year ?? 1836) - year);
  // ERKEN ARASTIRMA CEZASI YUMUSATILDI (0.12/yil, tavan 4x -> 0.06/yil,
  // tavan 2.5x). Fazla arastirmanin donusebilecegi TEK yer takvimin onune
  // gecmektir; 4 kat ceza bu kapiyi fiilen kapatiyor ve artan puani
  // biriktiriyordu. Ceza SILINMEDI — silinseydi 1836'da tank arastirilirdi.
  const earlyPenalty = clamp(1 + early * 0.06, 1, 2.5);
  return Math.round(TECH_BASE_COST * levelScale * earlyPenalty);
}

/**
 * Haftalik arastirma puani. Vic2 formulunun bizdeki karsiligi:
 *
 *   RP = (okuryazarlik + egitimli orta sinif + sabit taban) x (1 + teknoloji)
 *
 * ("ulusal rutbe" terimi kaldirildi — bkz. asagidaki not; formul metni
 * uzun sure silinmis bir terimi anlatmaya devam etmisti.)
 *
 * Okuryazarlik ARTIK BIR STOK (bkz. economy.js `advanceLiteracy`); bu bag
 * olmadan arastirma sabit bir sayiya baglanirdi ve egitim yine olu kalirdi.
 */
export function researchPointsOf(nation) {
  const economy = nation.economy;
  if (!economy) return 0;
  const literacy = clamp(economy.literacy ?? 0, 0, 1);
  const population = Math.max(1, economy.population ?? 1);
  // Egitimli orta sinif: Vic2'nin ruhban + katip kalemi. Katip payi ancak
  // okuryazarlik yeterliyse sayilir (Vic2'de esik %50).
  const middleShare = clamp((economy.classes?.middle?.population ?? 0) / population, 0, 1);
  const clerks = literacy >= 0.5 ? middleShare * 2 : 0;
  // Eski "ulusal rutbe" bonusu kaldirildi: `nation.rank` hicbir yerde
  // atanmiyordu, carpan her zaman 1'di (olu buyuk-guc terimi). Sabit 1 taban
  // olarak korunur ki puan uretimi degismesin.
  const base = literacy * 4 + middleShare * 1.5 + clerks + 1;
  // BASIN OZGURLUGU AYNI CARPANDA. Sansur okuryazari yok etmez, fikri
  // yavaslatir: ayni nufus, ayni okul, daha az arastirma. Basin merdiveni
  // daha once yalnizca orta sinif moraline giriyordu ve olculdu
  // (audit:mechanics): butun menzil gurultunun 0.44 kati.
  const press = reformModifiers(nation).researchRate ?? 0;
  return base * (1 + (economy.techMods?.researchRate ?? 0) + press);
}

/**
 * Arastirilmis teknolojilerin toplam degistiricileri. Haftada bir kez
 * hesaplanip `economy.techMods`a yazilir; sicak yol duz alan okur
 * (reformModifiers ile ayni kalip — kapanis maliyeti olculmustu).
 */
export function refreshTechModifiers(nation) {
  const mods = {};
  for (const key of Object.keys(TECH_MODS)) mods[key] = 0;
  for (const techId of nation.research?.done ?? []) {
    const entry = INDEX.get(techId);
    if (!entry) continue;
    for (const key of Object.keys(TECH_MODS)) {
      if (Number.isFinite(entry.tech[key])) mods[key] += entry.tech[key];
    }
  }
  if (nation.economy) nation.economy.techMods = mods;
  return mods;
}

// `techModifiers(nation)` KALDIRILDI: sicak yollar (provinces.js, economy.js,
// construction.js) katman kurali geregi `economy.techMods` alanini dogrudan
// okuyor; sarmalayicinin src/ ve scripts/ altinda tek cagirani kalmamisti.

export function startResearch(nation, techId) {
  if (!canResearch(nation, techId)) return false;
  ensureResearch(nation).current = techId;
  return true;
}

/**
 * Bir haftalik arastirma. Puan birikir; secili teknolojinin maliyeti dolunca
 * tamamlanir ve artan puan bir sonrakine devreder (puan bosa gitmez).
 *
 * Maliyet artik ETKIN maliyettir (program indirimi + yayilim); `world`
 * verilmezse liste fiyatina duser — eski cagri yerleri ve denetimler kirilmaz.
 */
export function advanceResearch(nation, year, world = null) {
  const research = ensureResearch(nation);
  research.points += researchPointsOf(nation);
  const techId = research.current;
  if (!techId) return null;
  const cost = world
    ? effectiveTechCost(world, nation, techId, year)
    : techCost(techId, year);
  if (research.points < cost) return null;
  research.points -= cost;
  research.done.push(techId);
  research.current = null;
  refreshTechModifiers(nation);
  return techId;
}

// ===========================================================================
// ULUSAL PROGRAM — "sirada ne" degil "ne tur ulke olacagim" karari.
//
// Oyuncu (ve YZ) sekiz yilligina bir programa baglanir. Program uc sey birden
// soyler: YON (odak klasorler ucuz, ihmal edilenler pahali), BEDEL (egitim
// taban sarti — socialFloorOf'un ikinci kaynagi; yakit cokusunun asil
// cozumu buradadir) ve TAAHHUT (erken fesih puan yakar).
//
// Tek tek teknoloji secimi KALKMADI — program icinde yon degistirmek serbest.
// Kalkan sey zorunlu mikro: `nextTechFor` bosalan kuyrugu oyuncu icin de
// programa gore doldurur (kor beta B-018: dokuz secim kacti, 5671 RP bosta).
// ===========================================================================

export const PROGRAMME_TERM = 416;      // 8 yil
export const PROGRAMME_COOLDOWN = 52;   // fesihten sonra yeni ilan yasagi

export const PROGRAMMES = {
  IRON_AND_RAIL: {
    id: 'IRON_AND_RAIL', name: 'Iron & Rail', icon: '🛤', floor: 25,
    line: 'The state binds itself to metal and distance.',
    focus: [['industry', 'Metallurgy'], ['industry', 'Infrastructure']],
    neglect: [['culture', 'Philosophy'], ['army', 'Military Science']],
  },
  WORKSHOP: {
    id: 'WORKSHOP', name: 'Workshop of the World', icon: '⚙', floor: 25,
    line: 'Whatever the world buys, we shall make more of it.',
    focus: [['industry', 'Power'], ['industry', 'Mechanization']],
    neglect: [['army', 'Army Doctrine'], ['navy', 'Ship Construction']],
  },
  ARSENAL: {
    id: 'ARSENAL', name: 'The Arsenal', icon: '⚔', floor: 25,
    line: 'Peace, if it comes, will find us armed.',
    focus: [['army', 'Army Doctrine'], ['army', 'Military Science']],
    neglect: [['culture', 'Public Instruction'], ['commerce', 'Financial Institutions']],
  },
  BLUE_WATER: {
    id: 'BLUE_WATER', name: 'Blue Water', icon: '⚓', floor: 25,
    line: 'The sea is not a border. It is a road.',
    focus: [['navy', 'Ship Construction'], ['industry', 'Infrastructure']],
    neglect: [['army', 'Army Doctrine']],
  },
  COUNTING_HOUSE: {
    id: 'COUNTING_HOUSE', name: 'The Counting House', icon: '⚖', floor: 40,
    line: 'Credit is the sinew of the modern state.',
    focus: [['commerce', 'Financial Institutions'], ['commerce', 'Communications']],
    neglect: [['army', 'Military Science']],
  },
  NATIONAL_INSTRUCTION: {
    id: 'NATIONAL_INSTRUCTION', name: 'National Instruction', icon: '🎓', floor: 55,
    line: 'A century is won in its classrooms.',
    focus: [['culture', 'Public Instruction'], ['culture', 'Philosophy']],
    neglect: [['army', 'Army Doctrine'], ['navy', 'Ship Construction']],
  },
};

const FOCUS_FACTOR = 0.6;
const NEGLECT_FACTOR = 1.6;

export function programmeOf(nation) {
  const id = nation.research?.programme;
  return id ? PROGRAMMES[id] ?? null : null;
}

/** Programin egitim taban sarti (socialFloorOf'un ikinci kaynagi). */
export function programmeFloorOf(nation) {
  return programmeOf(nation)?.floor ?? 0;
}

/** Bir teknolojinin bu ulke icin fiyat carpani: odak / notr / ihmal. */
export function programmeCostFactor(nation, techId) {
  const programme = programmeOf(nation);
  if (!programme) return 1;
  const entry = INDEX.get(techId);
  if (!entry) return 1;
  const match = (list) => list.some(([cat, folder]) => cat === entry.categoryId && folder === entry.folder);
  if (match(programme.focus)) return FOCUS_FACTOR;
  if (match(programme.neglect)) return NEGLECT_FACTOR;
  return 1;
}

export function adoptProgramme(nation, id, turn) {
  if (!PROGRAMMES[id]) return false;
  const research = ensureResearch(nation);
  if (turn < (research.programmeCooldown ?? 0)) return false;
  if (research.programme === id) return false;
  if (research.programme) {
    research.programmeHistory.push({
      id: research.programme, from: research.programmeSince, to: turn, reason: 'replaced',
    });
  }
  research.programme = id;
  research.programmeSince = turn;
  if (research.programmeHistory.length > 24) research.programmeHistory.shift();
  return true;
}

/**
 * Fesih. Vadeden once birakmanin bedeli: birikmis puanin yarisi yanar ve
 * bir yil yeni ilan yasagi baslar. Kriz dali (economy.js) da bunu cagirir —
 * cokus SILINMEDI, okunur bir basarisizlik durumu oldu.
 */
export function abandonProgramme(nation, turn, reason = 'abandoned') {
  const research = ensureResearch(nation);
  if (!research.programme) return false;
  research.programmeHistory.push({
    id: research.programme, from: research.programmeSince, to: turn, reason,
  });
  if (research.programmeHistory.length > 24) research.programmeHistory.shift();
  research.programme = null;
  research.programmeSince = 0;
  research.programmeCooldown = turn + PROGRAMME_COOLDOWN;
  if (turn < (nationTermEnd(research) ?? Infinity)) research.points *= 0.5;
  return true;
}

function nationTermEnd(research) {
  return research.programmeSince ? research.programmeSince + PROGRAMME_TERM : null;
}

/** Vade doldu mu? (Dolan program surer ama YZ yeniden degerlendirir.) */
export function programmeLapsed(nation, turn) {
  const research = nation.research;
  if (!research?.programme) return true;
  return turn >= research.programmeSince + PROGRAMME_TERM;
}

/**
 * YZ program secimi — SAF puanlama. `ctx`yi economy.js kurar (katman kurali:
 * bu dosya economy.js'i import edemez). En ucuzu secmek YASAK davranisti;
 * burada maliyet bir terim bile degil: ulke DURUMU secer.
 * Deterministik; esitlikte id sirasi.
 */
export function scoreProgrammes(nation, ctx) {
  const scores = {};
  const research = ensureResearch(nation);
  const ids = Object.keys(PROGRAMMES).sort();
  for (const programme of Object.values(PROGRAMMES)) {
    // Odenebilirlik kapisi: taban maliyeti gelirin %35'ini asan ulkeye o
    // program KAPALIDIR. Borc kapisi KADEMELI: agir borc yalniz yuksek
    // tabanli (pahali) programlari kapatir; ancak kapasiteyi fiilen doldurmus
    // devlet hicbirini tasiyamaz. Yoksul ulke Ulusal Egitim'den teknoloji
    // kapisiyla degil, KENDI BUTCESIYLE menedilir — yapisal geri-kalan
    // ureteci budur. (Ilk yazimda borc>%60 HER SEYI kapatiyordu: 10 yillik
    // kosuda dunyanin yarisi programsiz kaldi — olculdu, gevsetildi.)
    if ((ctx.floorCost?.(programme.floor) ?? 0) > ctx.income * 0.35
      || (ctx.debtLoad > 0.6 && programme.floor >= 40)
      || ctx.debtLoad > 0.9) {
      scores[programme.id] = -Infinity;
      continue;
    }
    let s = 1;
    // Ulusal egilim: ayni kosullardaki iki ulke ayni programa kosmasin diye
    // kimlikten turetilen DETERMINISTIK yatkinlik (gelenek gibi dusun).
    // Rastgelelik degil: ayni tohum ayni dunyada ayni egilimi verir. Agirlik
    // bilerek belirgin — olculen dunyada partiler tekduze (hepsi ayni
    // politika), dolayisiyla cesitliligin ana kaynagi kosullar + gelenek.
    if (ids[nation.id % ids.length] === programme.id) s += 0.6;
    if (programme.id === 'ARSENAL') {
      // Yalniz SUREGIDEN, yipratan savasa tepki. Bu dunya savas-yogun
      // (50 yilda 55-99 savas): "savastayim" duz ikramiyesi her incelemede
      // Arsenal'i kazandiriyordu (olculdu: iki tohumda 11/13 ve 17/17).
      // Parti terimi de kucuk tutulur — olculen dunyada TUM partiler
      // pro_military (tekduze), buyuk agirlik verilirse ayirt etmez, yigar.
      if (ctx.warStrain > 0.15) s += 0.8 + ctx.warStrain * 2;
      if (ctx.militarist) s += 0.25;
      if (!ctx.atWar) s *= 0.55;
      if (ctx.pacifist) s = 0;
    }
    if (programme.id === 'IRON_AND_RAIL') {
      s += (ctx.constructionStrained ? 1.0 : 0) + (ctx.shortSteel ? 0.8 : 0);
    }
    if (programme.id === 'WORKSHOP') {
      s += (ctx.shortMachine ? 0.8 : 0) + (ctx.stability > 0.6 ? 0.3 : 0);
    }
    if (programme.id === 'BLUE_WATER') {
      s = ctx.hasNavy ? s + 0.4 : 0.2;
    }
    if (programme.id === 'COUNTING_HOUSE') {
      s += (ctx.freeTrade ? 1.0 : 0) + (ctx.debtLoad > 0.3 ? 0.6 : 0);
    }
    if (programme.id === 'NATIONAL_INSTRUCTION') {
      s += (ctx.literacy < 0.3 ? 0.8 : 0) + (ctx.rich ? 0.6 : 0)
        + (ctx.progressive ? 0.5 : 0);
      if (ctx.stability < 0.45) s *= 0.4;
    }
    // Yuksek tabanli programlar sallanan devlete agir gelir.
    if (programme.floor >= 40 && ctx.stability < 0.45) s *= 0.5;
    // Yerlesik program kolay birakilmaz (savrulma freni). TEK istisna:
    // barista Arsenal — savas bitti diye ordu programina yapisip kalmak,
    // "YZ hep askeri secer" yasagini arka kapidan geri getiriyordu.
    if (research.programme === programme.id
      && !(programme.id === 'ARSENAL' && !ctx.atWar && !ctx.militarist)) {
      s += 0.6;
    }
    scores[programme.id] = s;
  }
  let best = null;
  for (const id of Object.keys(PROGRAMMES).sort()) {
    if (best === null || (scores[id] ?? -Infinity) > (scores[best] ?? -Infinity)) best = id;
  }
  return (scores[best] ?? -Infinity) > 0 ? best : null;
}

// ===========================================================================
// YAYILIM — geri kalan yakalayabilir, lider one gecmis kalir.
//
// Temas ettigin komsularin cogu bir teknolojiye sahipse o teknoloji sana
// UCUZLAR (azami %35). Sinir tanimayan buyuk sistem yok: yalniz world.contacts
// (bitisik hex sayimi, diplomacy.computeContacts) ve `research.done` okunur.
// ===========================================================================

export const DIFFUSION_MAX = 0.35;

/**
 * world.techHolders'i kurar: techId -> Set<nationId>. Haftada bir cagrilir
 * (economy.js, arastirma dongusunden once). KAYDA GIRMEZ — `research.done`
 * ve temas matrisi zaten deterministik oldugundan her tikta yeniden kurulur.
 */
export function refreshDiffusion(world) {
  const holders = new Map();
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const techId of nation.research?.done ?? []) {
      let set = holders.get(techId);
      if (!set) holders.set(techId, set = new Set());
      set.add(nation.id);
    }
  }
  world.techHolders = holders;
  return holders;
}

export function diffusionDiscount(world, nation, techId) {
  const holders = world?.techHolders?.get(techId);
  const contacts = world?.contacts?.[nation.id];
  if (!holders?.size || !contacts) return 0;
  let neighbours = 0;
  let holding = 0;
  for (let i = 0; i < contacts.length; i++) {
    if (i === nation.id || contacts[i] <= 0) continue;
    if (!world.nations[i]?.alive) continue;
    neighbours++;
    if (holders.has(i)) holding++;
  }
  if (!neighbours) return 0;
  return DIFFUSION_MAX * (holding / neighbours);
}

/**
 * ETKIN maliyet — herkesin (UI dahil) alinti yapmasi gereken TEK fiyat.
 * liste fiyati (techCost) x program carpani x (1 - yayilim indirimi).
 */
export function effectiveTechCost(world, nation, techId, year) {
  const base = techCost(techId, year)
    * programmeCostFactor(nation, techId)
    * (1 - diffusionDiscount(world, nation, techId));
  return Math.max(1, Math.round(base));
}

/**
 * Siradaki teknoloji — oyuncu ve YZ icin AYNI yol. Once odak klasorler,
 * sonra notr, en son ihmal edilenler; kademe icinde etkin maliyet, sonra
 * aktivasyon yili, sonra id (deterministik).
 *
 * Programa sabit bir "order" dizisi BILEREK verilmedi: ayni programdaki iki
 * ulke, farkli komsuluklar yuzunden farkli yayilim indirimi gorur ve ayni
 * programda bile farkli rota izler — ayrisma buradan dogar.
 */
export function nextTechFor(nation, year, world) {
  const candidates = availableTechs(nation);
  if (!candidates.length) return null;
  const programme = programmeOf(nation);
  const tierOf = (entry) => {
    if (!programme) return 1;
    const match = (list) => list.some(([cat, folder]) => cat === entry.categoryId && folder === entry.folder);
    if (match(programme.focus)) return 0;
    if (match(programme.neglect)) return 2;
    return 1;
  };
  let best = null;
  let bestKey = null;
  for (const entry of candidates) {
    const key = [
      tierOf(entry),
      world ? effectiveTechCost(world, nation, entry.id, year) : techCost(entry.id, year),
      entry.tech.year ?? 9999,
      entry.id,
    ];
    if (!bestKey
      || key[0] < bestKey[0]
      || (key[0] === bestKey[0] && (key[1] < bestKey[1]
        || (key[1] === bestKey[1] && (key[2] < bestKey[2]
          || (key[2] === bestKey[2] && key[3] < bestKey[3])))))) {
      bestKey = key;
      best = entry.id;
    }
  }
  return best;
}
