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
export const TECH_FOLDERS = {
  army: ['Army Doctrine', 'Light Armament', 'Heavy Armament', 'Military Science', 'Army Leadership'],
  navy: ['Naval Doctrine', 'Ship Construction', 'Naval Engineering', 'Naval Science', 'Naval Leadership'],
  commerce: ['Financial Institutions', 'Monetary System', 'Economic Thought', 'Market Functionality', 'Organization'],
  culture: ['Aesthetics', 'Philosophy', 'Social Thought', 'Political Thought', 'Psychology'],
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
// Kalan altisinin HEPSININ gercek tuketicisi var:
//   rgoOutput          -> provinces.provinceOutput
//   constructionPower  -> construction.constructionPower
//   factoryThroughput  -> economy.runFactories
//   inputEfficiency    -> economy.runFactories (girdi tuketimi)
//   researchRate       -> researchPointsOf (asagida)
//   supplyConsumption  -> economy.armyWeeklyDemand
export const TECH_MODS = {
  rgoOutput: 'RGO output',
  constructionPower: 'Construction power',
  factoryThroughput: 'Factory throughput',
  inputEfficiency: 'Factory input efficiency',
  researchRate: 'Research speed',
  supplyConsumption: 'Army supply consumption',
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
      t('scientific_management', 'Scientific Management', 1885, { factoryThroughput: 0.10, inputEfficiency: 0.05 }),
      t('mass_production', 'Mass Production', 1900, { factoryThroughput: 0.16, inputEfficiency: 0.06 }),
    ],
    'Metallurgy': [
      t('publishing_industry', 'Charcoal Smelting', 1836, { rgoOutput: 0.05 }),
      // `unlock: ['STEEL_MILL']` KALDIRILDI: STEEL_MILL'in `availableFrom`u
      // yok, yani ilk haftadan herkese acik — kilit hicbir sey acmiyordu ama
      // ekran "Unlocks steel mill" diye SAHTE bir vaat basiyordu. Fabrikaya
      // takvim vermek yerine vaadi kaldirmak secildi: kilit eklemek butun
      // sanayi zamanlamasini (ve piyasa taban cizgisini) oynatirdi.
      t('coke_smelting', 'Coke Smelting', 1842, { rgoOutput: 0.08 }),
      t('bessemer_process', 'Bessemer Process', 1855, { inputEfficiency: 0.08 }),
      t('open_hearth', 'Open Hearth Furnace', 1868, { factoryThroughput: 0.10 }),
      t('electric_furnace', 'Electric Furnace', 1885, { factoryThroughput: 0.10, inputEfficiency: 0.06 }),
      t('alloy_steel', 'Alloy Steel', 1900, { inputEfficiency: 0.08, unlock: ['TANK_FACTORY'] }),
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
      t('organic_chemistry', 'Organic Chemistry', 1860, { unlock: ['REFINERY'], inputEfficiency: 0.05 }),
      t('electricity', 'Electricity', 1872, { researchRate: 0.08 }),
      t('synthetic_polymers', 'Synthetic Polymers', 1888, { unlock: ['SYNTHETIC_OIL_PLANT'] }),
      t('nitroglycerin', 'Nitroglycerin', 1900, { inputEfficiency: 0.06 }),
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

export function techById(id) {
  return INDEX.get(id) ?? null;
}

export function ensureResearch(nation) {
  const research = nation.research ??= { points: 0, current: null, done: [] };
  research.done ??= [];
  if (!Number.isFinite(research.points)) research.points = 0;
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
export const TECH_BASE_COST = 260;
export function techCost(techId, year) {
  const entry = INDEX.get(techId);
  if (!entry) return Infinity;
  const levelScale = 1 + entry.level * 0.55;
  const early = Math.max(0, (entry.tech.year ?? 1836) - year);
  const earlyPenalty = clamp(1 + early * 0.12, 1, 4);
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
  return base * (1 + (economy.techMods?.researchRate ?? 0));
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
 */
export function advanceResearch(nation, year) {
  const research = ensureResearch(nation);
  research.points += researchPointsOf(nation);
  const techId = research.current;
  if (!techId) return null;
  const cost = techCost(techId, year);
  if (research.points < cost) return null;
  research.points -= cost;
  research.done.push(techId);
  research.current = null;
  refreshTechModifiers(nation);
  return techId;
}

/**
 * YZ secimi: en ucuz arastirilabilir teknoloji. Kasten basit — YZ'nin
 * teknolojik olarak YASAMASI yeterli; strateji katmani sonra eklenebilir.
 * Deterministik (id siralamasi tie-break).
 */
export function pickResearchAI(nation, year) {
  let best = null;
  let bestCost = Infinity;
  for (const { id } of availableTechs(nation)) {
    const cost = techCost(id, year);
    if (cost < bestCost || (cost === bestCost && best && id < best)) {
      bestCost = cost;
      best = id;
    }
  }
  return best;
}
