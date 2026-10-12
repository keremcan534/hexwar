// TEKNOLOJİ ve araştırma (TASARIM.md §13).
//
// Beş dal × iki klasör (Ordu'da üç: havacılık) × beş kademe (havacılıkta altı) = 56 teknoloji,
// 1900-1940. 1836-1890 ağacı MİRAS'tır: herkes bilir, araştırılmaz. Klasör
// içinde DOĞRUSAL ilerleyiş (Vic2 kuralı). Her teknolojinin etkisi somuttur
// ve modifiers.js anahtarlarına yazılır — "+%2'lik dolgu düğme" yoktur; her
// anahtarın okuyucusu MODIFIER_KEYS tablosunda yazar.
//
// Takvim ÜST SINIR değil, maliyet çarpanıdır: aktivasyon yılından önce
// araştırmak pahalıdır (yıl başına ×1.15, tavan 8 kat). Yayılım: temas ettiğin
// komşuların sahip olduğu teknoloji %35'e kadar ucuzlar.
//
// Katman notu: saf veri + hesap; ekonomiyi import ETMEZ.

import { makeRng } from '../core/rng.js';
import { MODIFIER_KEYS, mod, refreshModifiers, registerModifierSource } from './modifiers.js';
import { START_YEAR, yearOfTurn } from './calendar.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const TECH_CATEGORIES = {
  industry: { id: 'industry', name: 'Industry', icon: '⚙' },
  infrastructure: { id: 'infrastructure', name: 'Infrastructure', icon: '🛤' },
  army: { id: 'army', name: 'Army', icon: '⚔' },
  navy: { id: 'navy', name: 'Navy', icon: '⚓' },
  society: { id: 'society', name: 'Society', icon: '🎓' },
};

export const TECH_FOLDERS = {
  industry: ['Production', 'Materials'],
  infrastructure: ['Transport', 'Agriculture'],
  army: ['Doctrine', 'Arms', 'Aviation'],
  navy: ['Shipbuilding', 'Naval Doctrine'],
  society: ['Politics', 'Science'],
};

/** Teknoloji etkileri modifiers.js anahtarlarıdır; ekran adları oradan. */
export const TECH_MODS = Object.fromEntries(
  Object.entries(MODIFIER_KEYS).map(([key, meta]) => [key, meta.label]),
);

function t(id, name, year, effects, desc = '', extra = {}) {
  return { id, name, year, effects, desc, ...extra };
}

/**
 * MİRAS: 1836-1890 ağacının 40 düğümü. 1900 dünyası bunları zaten bilir;
 * araştırılmaz, etkileri her ulusa aynı sırayla yazılır (değiştirici toplamı
 * eski "hepsi araştırılmış" haliyle kayan noktası kayan noktasına aynı —
 * katlama parmak iziyle kanıtlandı). Ekran ve ipucu onları adlarıyla gösterir:
 * "+%12 savunma" makineli tüfekten gelir.
 */
export const HERITAGE_TREE = {
  industry: {
    Power: [
      t('stationary_steam', 'Stationary Steam Engine', 1836, { ic: 0.08 }, 'Steam replaces the water wheel in the mills.'),
      t('mechanical_production', 'Mechanical Production', 1846, { ic: 0.08, lineEfficiency: 0.05 }, 'Machine tools raise the efficiency of every production line.'),
      t('compound_engines', 'Compound Steam Engines', 1860, { ic: 0.10 }, 'More power from the same coal.'),
      t('electrical_power', 'Electrical Power', 1880, { ic: 0.12, oilIc: 0.05 }, 'Dynamos light the factory floor; oil lubricates every shaft.'),
    ],
    Metallurgy: [
      t('coke_smelting', 'Coke Smelting', 1840, { resources: 0.10 }, 'Coke furnaces raise iron and coal output.'),
      t('bessemer_process', 'Bessemer Process', 1856, { lineEfficiency: 0.05, resources: 0.05 }, 'Cheap steel for arsenals.'),
      t('open_hearth', 'Open Hearth Furnace', 1868, { lineEfficiency: 0.05, ic: 0.05, oilIc: 0.10 }, 'Better steel, steadier output — and the first oil-fired furnaces.'),
      t('alloy_steel', 'Alloy Steel', 1890, { lineEfficiency: 0.05, resources: 0.10 }, 'Hard steels for guns and machines.'),
    ],
  },
  infrastructure: {
    Railways: [
      t('early_railways', 'Early Railways', 1836, { construction: 0.10, constructionSlots: 1 }, 'The first lines between mine and port.'),
      t('iron_railways', 'Iron Railways', 1848, { developmentCap: 1, supply: 0.15 }, 'Rails tie the provinces together.'),
      t('steel_railways', 'Steel Railways', 1862, { construction: 0.15, developmentCap: 1 }, 'Heavier trains, cheaper building.'),
      t('integral_rail', 'Integral Rail System', 1878, { construction: 0.1, supply: 0.15, rubberArmy: 0.05 }, 'A national network, with insulated telegraph along every line.'),
    ],
    Agriculture: [
      t('crop_rotation', 'Crop Rotation', 1838, { food: 0.03 }, 'Four-field rotation raises yields.'),
      t('mechanized_farming', 'Mechanised Farming', 1852, { food: 0.03, growth: 0.05 }, 'Reapers and threshers.'),
      t('fertilizers', 'Chemical Fertilisers', 1868, { saltpeterFood: 0.15 }, 'Guano and Chilean nitrate: richer harvests for whoever controls the saltpeter.'),
      t('refrigeration', 'Refrigeration', 1884, { food: 0.03, consumerNeed: -0.05, developmentCap: 1 }, 'Food travels across the world.'),
    ],
  },
  army: {
    Doctrine: [
      t('post_napoleonic', 'Post-Napoleonic Thought', 1836, { attack: 0.05, manpower: 0.05 }, 'Mass armies and columns.'),
      t('field_fortifications', 'Field Fortifications', 1846, { defense: 0.08 }, 'Trenches and earthworks.'),
      t('general_staff', 'General Staff', 1860, { attack: 0.06, organization: 0.15, reinforce: 0.15 }, 'Planning wins wars before they start.'),
      t('modern_doctrine', 'Modern Doctrine', 1882, { defense: 0.08, attack: 0.06, training: 0.15, rubberArmy: 0.10 }, 'Firepower, dispersion and the field telegraph.'),
    ],
    Arms: [
      t('percussion_caps', 'Percussion Caps', 1840, { attack: 0.05 }, 'Muskets that fire in the rain.'),
      t('breech_loaders', 'Breech-Loading Rifles', 1852, { attack: 0.08 }, 'Reload lying down.'),
      t('rifled_artillery', 'Rifled Artillery', 1864, { attack: 0.06, defense: 0.05 }, 'Guns that hit what they aim at.'),
      t('machine_guns', 'Machine Guns', 1884, { defense: 0.12 }, 'The defence dominates the field.'),
    ],
  },
  navy: {
    Shipbuilding: [
      t('clipper_design', 'Clipper Design', 1838, { naval: 0.08 }, 'Fast sailing hulls.'),
      t('steam_screw', 'Screw Propulsion', 1850, { naval: 0.08 }, 'Steam frigates.'),
      t('ironclads', 'Ironclads', 1860, { naval: 0.15, ironclad: 1 }, 'Armoured steamships: built from iron and coal instead of timber.'),
      t('steel_hulls', 'Steel Hulls', 1880, { naval: 0.12 }, 'Pre-dreadnought battleships.'),
    ],
    'Naval Doctrine': [
      t('naval_gunnery', 'Naval Gunnery', 1842, { naval: 0.06 }, 'Broadsides at range.'),
      t('merchant_marine', 'Merchant Marine', 1856, { exportIncome: 0.10 }, 'A trading fleet earns its keep.'),
      t('fleet_in_being', 'Fleet in Being', 1870, { naval: 0.08 }, 'A fleet that need not sail to matter.'),
      t('modern_naval_doctrine', 'Modern Naval Doctrine', 1890, { naval: 0.10, exportIncome: 0.05 }, 'Command of the sea.'),
    ],
  },
  society: {
    Philosophy: [
      t('rationalism', 'Rationalism', 1836, { research: 0.05 }, 'Reason over tradition.'),
      t('positivism', 'Positivism', 1848, { stability: 0.03, research: 0.05 }, 'The science of society.'),
      t('social_reform', 'Social Reform', 1866, { consumerNeed: -0.05, stability: 0.03 }, 'Factory acts and poor relief.'),
      t('mass_politics', 'Mass Politics', 1884, { power: 0.5 }, 'Parties, rallies and newspapers.'),
    ],
    'Public Instruction': [
      t('public_schools', 'Public Schools', 1840, { literacy: 0.05 }, 'Every village a schoolhouse.'),
      t('university_reform', 'University Reform', 1854, { research: 0.10, developmentCap: 1 }, 'Research universities.'),
      t('mass_press', 'Mass Press', 1868, { warSupport: 0.05, literacy: 0.05 }, 'Cheap newspapers shape opinion.'),
      t('modern_bureaucracy', 'Modern Bureaucracy', 1882, { tax: 0.08, developmentCap: 1 }, 'Census, cadastre, civil service.'),
    ],
  },
};

/** Mirasın düz listesi: değiştirici kaynağının sırası. */
export const HERITAGE = Object.values(HERITAGE_TREE).flatMap((folders) => Object.values(folders).flat());

/**
 * 1900-1945 AĞACI. Kademeler ~8-9 yıl arayla; son kademe 1935-40'tadır ki
 * sanayi ülkesi ağacı savaşın içinde bitirebilsin, tarım ülkesi yarıda
 * kalsın (araştırma hızı okuryazarlıkla 3'ten 7'ye: makas buradan da açılır).
 * İki kademe birim AÇAR (`unlocks`): tank Landships'le, uçak Military
 * Aviation'la. Açılan kolun gücü kendi anahtarıyla büyür (armor, air).
 */
export const TECHNOLOGIES = {
  industry: {
    Production: [
      t('electric_motors', 'Electric Motors', 1901, { ic: 0.06 }, 'Every machine its own motor; the line shaft comes down.'),
      t('assembly_line', 'Assembly Line', 1909, { ic: 0.08, lineEfficiency: 0.05 }, 'Moving belts and interchangeable parts.'),
      t('mass_production', 'Mass Production', 1917, { ic: 0.08, lineGain: 0.25 }, 'Whole factories retooled for war in weeks.'),
      t('machine_tools', 'Precision Machine Tools', 1926, { ic: 0.10, lineEfficiency: 0.05 }, 'Tolerances measured in thousandths of an inch.'),
      t('flow_production', 'Flow Production', 1935, { ic: 0.12, lineGain: 0.25 }, 'Factories that never stop.'),
    ],
    Materials: [
      t('electric_steel', 'Electric Steel', 1902, { resources: 0.08 }, 'Arc furnaces turn scrap into fine steel.'),
      t('refined_petroleum', 'Refined Petroleum', 1910, { oilIc: 0.10 }, 'Cracking towers turn crude into fuel — for the factories that can get it.'),
      t('industrial_chemistry', 'Industrial Chemistry', 1918, { saltpeterFood: 0.10, resources: 0.05 }, 'Nitrogen from the air: fertiliser and explosives.'),
      t('light_alloys', 'Light Alloys', 1927, { lineEfficiency: 0.05, air: 0.10 }, 'Aluminium for engines and airframes.'),
      t('synthetic_fuel', 'Synthetic Fuel', 1936, { oilIc: 0.10, resources: 0.05 }, 'Coal hydrogenated into petrol.'),
    ],
  },
  infrastructure: {
    Transport: [
      t('trunk_lines', 'Trunk Lines', 1903, { construction: 0.10, supply: 0.10 }, 'Double track between every capital and its ports.'),
      t('motor_lorries', 'Motor Lorries', 1911, { supply: 0.15, constructionSlots: 1 }, 'Supply moves on where the rails end.'),
      t('paved_highways', 'Paved Highways', 1920, { construction: 0.10, developmentCap: 1 }, 'Concrete roads open the interior.'),
      t('electrified_railways', 'Electrified Railways', 1929, { construction: 0.10, supply: 0.10, developmentCap: 1 }, 'Heavier trains, faster turnaround.'),
      t('motorised_logistics', 'Motorised Logistics', 1938, { supply: 0.15, constructionSlots: 1 }, 'Divisions fed by columns of trucks.'),
    ],
    Agriculture: [
      t('steam_threshers', 'Steam Threshers', 1902, { food: 0.03 }, 'The harvest is brought in by engine.'),
      t('agricultural_colleges', 'Agricultural Colleges', 1912, { food: 0.03, growth: 0.05 }, 'Science reaches the village.'),
      t('tractors', 'Tractors', 1921, { food: 0.04, growth: 0.05 }, 'One machine does the work of ten horses.'),
      t('hybrid_crops', 'Hybrid Crops', 1930, { food: 0.04, developmentCap: 1 }, 'Bred for yield, sown by the million.'),
      t('mechanised_agriculture', 'Mechanised Agriculture', 1939, { food: 0.04, consumerNeed: -0.05 }, 'Cheap bread leaves money for everything else.'),
    ],
  },
  army: {
    Doctrine: [
      t('fire_and_movement', 'Fire and Movement', 1901, { attack: 0.05 }, 'Rushes covered by rifle fire.'),
      t('trench_warfare', 'Trench Warfare', 1912, { defense: 0.10, organization: 0.10 }, 'Dig in, wire in, hold.'),
      t('infiltration_tactics', 'Infiltration Tactics', 1918, { attack: 0.08, reinforce: 0.10 }, 'Storm troops bypass the strongpoints.'),
      t('combined_arms', 'Combined Arms', 1928, { attack: 0.05, defense: 0.05, armor: 0.10, training: 0.10 }, 'Infantry, guns and tanks fight as one.'),
      t('mobile_warfare', 'Mobile Warfare', 1937, { attack: 0.08, armor: 0.15, organization: 0.10 }, 'Break through, then never stop moving.'),
    ],
    Arms: [
      t('smokeless_powder', 'Smokeless Powder', 1900, { attack: 0.04, defense: 0.04 }, 'Longer range, and no cloud to give the rifleman away.'),
      t('light_machine_guns', 'Light Machine Guns', 1909, { defense: 0.08 }, 'A machine gun every section can carry.'),
      t('landships', 'Landships', 1916, {}, 'Armoured tractors that cross the trenches.', { unlocks: 'ARMOR' }),
      t('light_tanks', 'Light Tanks', 1926, { armor: 0.20 }, 'Turreted, sprung and fast.'),
      t('medium_tanks', 'Medium Tanks', 1936, { armor: 0.20, attack: 0.03 }, 'A gun that can kill other tanks.'),
    ],
    // Uçağın öncülü balondur: açılım ilk kademe olsaydı (kademe çarpanı 1.0)
    // "erken" seçeneklerin en ucuzu olur, YZ 1910'un uçağını 1904'te alırdı.
    Aviation: [
      t('observation_balloons', 'Observation Balloons', 1900, { attack: 0.02, defense: 0.02 }, 'Tethered eyes above the guns.'),
      t('military_aviation', 'Military Aviation', 1910, {}, 'Kites with engines: the eyes of the army.', { unlocks: 'AIRCRAFT' }),
      t('fighter_aircraft', 'Fighter Aircraft', 1916, { air: 0.20 }, 'Guns that fire through the propeller.'),
      t('metal_airframes', 'All-Metal Airframes', 1924, { air: 0.20 }, 'Duralumin replaces wood and canvas.'),
      t('close_air_support', 'Close Air Support', 1932, { air: 0.15, attack: 0.03 }, 'Dive bombers as flying artillery.'),
      t('monoplane_fighters', 'Monoplane Fighters', 1939, { air: 0.25 }, 'Retractable gear, closed cockpits, 500 km an hour.'),
    ],
  },
  navy: {
    Shipbuilding: [
      t('pre_dreadnoughts', 'Pre-Dreadnoughts', 1901, { naval: 0.06 }, 'Steel battleships with mixed batteries.'),
      // Sınıf yükseltir (navy.js SHIP_CLASSES), 'naval' değil: eski gövdeyi
      // güçlendirmez, ilk dretnot herkesin filosunu eskitir.
      t('dreadnoughts', 'Dreadnoughts', 1906, { shipClass: 1 }, 'All big guns, turbine-driven. New warships are dreadnoughts; every older battleship is obsolete.'),
      t('submarines', 'Submarines', 1914, { naval: 0.10 }, 'The torpedo boat that hides under the sea.'),
      t('aircraft_carriers', 'Aircraft Carriers', 1924, { shipClass: 1, air: 0.05 }, 'An airfield that sails with the fleet. New warships are carrier groups; battleships are outclassed.'),
      t('radar', 'Radar', 1937, { naval: 0.10, defense: 0.03 }, 'Seeing through night and fog.'),
    ],
    'Naval Doctrine': [
      t('blue_water_doctrine', 'Blue-Water Doctrine', 1902, { naval: 0.05, exportIncome: 0.05 }, 'A fleet built to fight on the high seas.'),
      t('fire_control', 'Fire Control', 1912, { naval: 0.08 }, 'Range-keeping clocks and gun directors.'),
      t('convoy_system', 'Convoy System', 1918, { exportIncome: 0.10 }, 'Merchantmen sail in escorted groups.'),
      t('naval_aviation', 'Naval Aviation', 1928, { naval: 0.08, air: 0.05 }, 'Scouts and torpedo bombers from the deck.'),
      t('carrier_task_forces', 'Carrier Task Forces', 1940, { naval: 0.12 }, 'The carrier becomes the capital ship.'),
    ],
  },
  society: {
    Politics: [
      t('social_insurance', 'Social Insurance', 1903, { stability: 0.03, consumerNeed: -0.03 }, 'Pensions and sickness pay buy loyalty.'),
      t('total_mobilisation', 'Total Mobilisation', 1913, { manpower: 0.10, warSupport: 0.04 }, 'The nation in arms.'),
      t('propaganda_ministry', 'Propaganda Ministry', 1919, { warSupport: 0.06, power: 0.25 }, 'Posters, newsreels and the wireless.'),
      t('planned_economy', 'Planned Economy', 1929, { ic: 0.05, construction: 0.05 }, 'Five-year plans and state trusts.'),
      t('welfare_state', 'Welfare State', 1937, { stability: 0.05, growth: 0.05 }, 'From the cradle to the grave.'),
    ],
    Science: [
      t('wireless_telegraphy', 'Wireless Telegraphy', 1901, { research: 0.05 }, 'Messages across the ocean in seconds.'),
      t('research_laboratories', 'Research Laboratories', 1910, { research: 0.08 }, 'Industry hires the chemists.'),
      t('mass_higher_education', 'Mass Higher Education', 1920, { research: 0.05, literacy: 0.05 }, 'Universities for the many.'),
      t('electronics', 'Electronics', 1930, { research: 0.07, defense: 0.02 }, 'Valves, radio and the first computing machines.'),
      t('nuclear_physics', 'Nuclear Physics', 1940, { research: 0.10 }, 'The atom is split.'),
    ],
  },
};

const INDEX = new Map();
for (const [categoryId, folders] of Object.entries(TECHNOLOGIES)) {
  for (const [folder, list] of Object.entries(folders)) {
    list.forEach((tech, level) => INDEX.set(tech.id, { tech, categoryId, folder, level }));
  }
}

export function techById(id) {
  return INDEX.get(id) ?? null;
}

/** Birim tipi → onu açan teknoloji (tek kaynak: ağaçtaki `unlocks`). */
const UNLOCKS = new Map();
for (const [id, entry] of INDEX) if (entry.tech.unlocks) UNLOCKS.set(entry.tech.unlocks, id);

/** Bu kolu açan teknolojinin kimliği; teknolojisiz kol için null. */
export function unlockTechOf(typeId) {
  return UNLOCKS.get(typeId) ?? null;
}

/** Ulus bu kolu kurabilir mi (teknolojisi gerekmiyorsa her zaman). */
export function unitUnlocked(nation, typeId) {
  const techId = UNLOCKS.get(typeId);
  return !techId || !!nation?.research?.done?.includes(techId);
}

export function ensureResearch(nation) {
  const research = nation.research ??= { points: 0, current: null, done: [], queue: [] };
  research.done ??= [];
  if (!Array.isArray(research.queue)) research.queue = [];
  if (!Number.isFinite(research.points)) research.points = 0;
  // Ağaçta olmayan eski kimlikler (önceki ağaç) düşer.
  research.done = research.done.filter((id) => INDEX.has(id));
  research.queue = research.queue.filter((id) => INDEX.has(id));
  if (research.current && !INDEX.has(research.current)) research.current = null;
  return research;
}

export function hasTech(nation, techId) {
  return !!nation.research?.done?.includes(techId);
}

// Teknoloji etkileri değiştirici kaynağıdır (modifiers.js toplar). Miras
// önce: araştırılan teknolojiler onun üstüne eklenir.
registerModifierSource((nation) => {
  const out = HERITAGE.map((tech) => ({ label: tech.name, effects: tech.effects }));
  for (const techId of nation?.research?.done ?? []) {
    const entry = INDEX.get(techId);
    if (entry) out.push({ label: entry.tech.name, effects: entry.tech.effects });
  }
  return out;
});

export function canResearch(nation, techId) {
  const entry = INDEX.get(techId);
  if (!entry || hasTech(nation, techId)) return false;
  if (entry.level === 0) return true;
  const previous = TECHNOLOGIES[entry.categoryId][entry.folder][entry.level - 1];
  return hasTech(nation, previous.id);
}

export function availableTechs(nation) {
  const out = [];
  for (const [id, entry] of INDEX) {
    if (canResearch(nation, id)) out.push({ id, ...entry });
  }
  return out;
}

/**
 * Liste fiyatı: kademe ileri teknolojiyi pahalılaştırır, aktivasyon yılından
 * önce araştırmak yıl başına ×1.15 (tavan 8×) daha pahalıdır, ve teknolojinin KENDİ
 * yılı fiyatı büyütür (kampanyanın ilk yılından sonra yılda %3). Yıl çarpanı
 * olmadan ağaç 1866'ya dek takvimi izleyip sonra koşuyordu: araştırma puanı
 * okuryazarlıkla ~2.5'ten ~5.5'e çıkarken 1870 sonrası teknolojiler erken
 * olanlar kadar ucuzdu ve orta ülke 40 teknolojiyi 1881-86'da bitirip son on
 * beş yılı boş geçiriyordu (erken ceza %12/3× denendi, yetmedi).
 */
export const TECH_BASE_COST = 110;
// 0.02'de herkes 40 teknolojiyi ~1892'de bitirip 320-440 hafta boş kalıyordu
// ve 1900'de değiştirici toplamları uluslar arasında aynıydı. 0.03: ortanca
// ~1897'de biter, boş hafta %60-80 azalır (3 tohum, eşli).
const TECH_YEAR_SCALE = 0.03;
/**
 * ERKEN ARAŞTIRMA: yıl başına ×1.15, tavan 8 (HOI4'ün "zamanından önce"
 * kuralının yumuşağı). 1836 ağacında yılda +%6 / tavan 2.5× yetiyordu çünkü
 * araştırma yavaştı; 1900'ün okuryazar dünyası 2-3 kat hızlı araştırıyor ve
 * ölçümde 1910'un uçağı 1900'de açıldı. Üstel ceza birkaç yıl öne geçmeye
 * izin verir, on yıl öne (×4) geçmeye vermez.
 */
const EARLY_BASE = 1.15;
const EARLY_CAP = 8;
/**
 * Fiyatın çarpanları, ekranın "neden bu kadar" dökümü için. techCost AYNI
 * çarpanları aynı sırayla çarpar: döküm ile motor ayrışamaz.
 */
export function techCostFactors(techId, year) {
  const entry = INDEX.get(techId);
  if (!entry) return null;
  const techYear = entry.tech.year ?? START_YEAR;
  const earlyYears = Math.max(0, techYear - year);
  return {
    base: TECH_BASE_COST,
    level: 1 + entry.level * 0.6,
    yearScale: 1 + Math.max(0, techYear - START_YEAR) * TECH_YEAR_SCALE,
    earlyYears,
    early: Math.min(EARLY_CAP, EARLY_BASE ** earlyYears),
  };
}

export function techCost(techId, year) {
  const f = techCostFactors(techId, year);
  if (!f) return Infinity;
  return Math.round(f.base * f.level * f.yearScale * f.early);
}

/**
 * Haftalık araştırma puanı: taban 1 + okuryazarlık × 6 + üniversite kademesi
 * × 0.3; teknoloji, danışman ve parti çarpar.
 */
export function researchPointsOf(nation, world = null) {
  const economy = nation.economy;
  if (!economy) return 0;
  const literacy = clamp(economy.literacy ?? 0, 0, 1);
  let universities = 0;
  if (world) {
    for (const province of world.provinces ?? []) {
      if (province.owner === nation.id) universities += province.econ?.buildings?.university ?? 0;
    }
    economy.universities = universities;
  } else {
    universities = economy.universities ?? 0;
  }
  const base = 1 + literacy * 6 + universities * 0.3;
  return base * Math.max(0.2, 1 + mod(nation, 'research'));
}

export function startResearch(nation, techId) {
  if (!canResearch(nation, techId)) return false;
  const research = ensureResearch(nation);
  research.current = techId;
  if (research.queue.includes(techId)) research.queue = research.queue.filter((id) => id !== techId);
  return true;
}

/** Bir teknolojiyi dünyada ilk bulan ulusun prestiji. */
export const FIRST_TECH_PRESTIGE = 5;

/** Bu teknolojiyi henüz kimse bulmadı mı (ilk keşif prestiji açık mı)? */
export function firstDiscoveryOpen(world, techId) {
  return !(world?.nations ?? []).some((other) => other.alive !== false && other.research?.done?.includes(techId));
}

/** Bir haftalık araştırma; tamamlanan teknolojinin kimliğini döndürür. */
export function advanceResearch(nation, year, world = null) {
  const research = ensureResearch(nation);
  research.points += researchPointsOf(nation, world);
  const techId = research.current;
  if (!techId) return null;
  const cost = world ? effectiveTechCost(world, nation, techId, year) : techCost(techId, year);
  if (research.points < cost) return null;
  research.points -= cost;
  research.done.push(techId);
  research.current = null;
  // DÜNYADA İLK (Vic2): bulan ilk ulus prestij alır, prestij zafer skoruna
  // girer. Yokken araştırma hızı 1900 skorunu gürültünün üstünde hiç
  // oynatmıyordu (+%50 araştırma → skor +%1.5, gürültü ±%1.7): herkes her
  // teknolojiyi er geç alıyor, "önce almak" hiçbir sayıya yazılmıyordu.
  if (world && !world.nations.some((other) => other !== nation && other.research?.done?.includes(techId))) {
    nation.prestige = (nation.prestige ?? 0) + FIRST_TECH_PRESTIGE;
    research.firsts = (research.firsts ?? 0) + 1;
  }
  refreshModifiers(nation, world?.turn ?? 0);
  return techId;
}

export const RESEARCH_QUEUE_LIMIT = 10;

export function researchPath(nation, techId) {
  const entry = INDEX.get(techId);
  if (!entry || hasTech(nation, techId)) return [];
  const list = TECHNOLOGIES[entry.categoryId][entry.folder];
  const path = [];
  for (let level = 0; level <= entry.level; level++) {
    if (!hasTech(nation, list[level].id)) path.push(list[level].id);
  }
  return path;
}

export function queueResearch(nation, techId) {
  const research = ensureResearch(nation);
  let added = 0;
  for (const id of researchPath(nation, techId)) {
    if (id === research.current || research.queue.includes(id)) continue;
    if (research.queue.length >= RESEARCH_QUEUE_LIMIT) break;
    research.queue.push(id);
    added++;
  }
  return added;
}

export function dequeueResearch(nation, techId) {
  const research = ensureResearch(nation);
  const entry = INDEX.get(techId);
  if (!entry) return false;
  const before = research.queue.length;
  research.queue = research.queue.filter((id) => {
    const other = INDEX.get(id);
    return !(other && other.categoryId === entry.categoryId
      && other.folder === entry.folder && other.level >= entry.level);
  });
  return research.queue.length !== before;
}

export function researchNow(nation, techId) {
  const research = ensureResearch(nation);
  const path = researchPath(nation, techId);
  if (!path.length || !canResearch(nation, path[0])) return false;
  const [first, ...rest] = path;
  research.current = first;
  research.queue = [...rest, ...research.queue.filter((id) => id !== first && !rest.includes(id))]
    .slice(0, RESEARCH_QUEUE_LIMIT);
  return true;
}

export function nextQueuedTech(nation) {
  const research = ensureResearch(nation);
  while (research.queue.length) {
    const id = research.queue.shift();
    if (canResearch(nation, id)) return id;
  }
  return null;
}

// ------------------------------------------------------------- YAYILIM ---

export const DIFFUSION_MAX = 0.35;

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

export function effectiveTechCost(world, nation, techId, year) {
  const base = techCost(techId, year) * (1 - diffusionDiscount(world, nation, techId));
  return Math.max(1, Math.round(base));
}

// ------------------------------------------------------- AKILLI SEÇİCİ ---

/**
 * Ulusun durumundan araştırma ağırlıkları: savaşta ordu, tüketim malı
 * eksikse sanayi, gıda açığında tarım, kıyı ve ablukada donanma.
 */
export function researchPriorities(nation) {
  const economy = nation.economy ?? {};
  const weights = {};
  const war = (economy.warFronts ?? 0) > 0;
  weights.attack = war ? 2.5 : 1;
  weights.defense = war ? 2.5 : 1;
  weights.ic = (economy.consumer?.ratio ?? 1) < 1 ? 2 : 1.4;
  weights.food = (economy.resources?.FOOD?.ratio ?? 1) < 1 ? 2.5 : 0.8;
  weights.naval = economy.coastal ? ((economy.blockade ?? 0) > 0 ? 2.5 : 1) : 0.2;
  weights.ironclad = economy.coastal ? 0.1 : 0;
  // Bir sınıf eskiden 'naval +0.15'ti: değerleme aynı ölçekte kalır.
  weights.shipClass = 0.15 * weights.naval;
  weights.research = 1.3;
  // Açılan kolun gücü: savaşta ve sanayisi olan ülkede değerli.
  const industrial = (economy.ic?.total ?? 0) >= 20;
  weights.armor = war ? 1.5 : industrial ? 1 : 0.5;
  weights.air = weights.armor;
  weights.unlocks = war || industrial ? 1.5 : 0.6;
  weights.developmentCap = 0.12;
  weights.constructionSlots = 0.08;
  weights.power = 0.12;
  return { weights };
}

export const SCHOOL_BONUS = 1.4;
const VALUE_FLOOR = 0.01;
/**
 * Yeni kol açmanın değeri, etki toplamıyla aynı ölçekte. Yokken açılım
 * teknolojilerinin etkisi boş olduğundan değeri tabanda kalıyordu. 0.2'de
 * (güçlü bir kademe) erken yıllarda her şeyden cazipti: ölçümde 1910'un
 * uçağı 1902'de, 1916'nın tankı 1909'da açıldı.
 */
const UNLOCK_VALUE = 0.08;

/** Teknolojinin bu ulusa değeri ve değeri taşıyan kalem (`lead`). */
export function techValue(tech, priorities = null) {
  const weights = priorities?.weights ?? {};
  let value = 0;
  let lead = null;
  let leadValue = 0;
  for (const [key, amount] of Object.entries(tech.effects ?? {})) {
    if (!Number.isFinite(amount) || amount === 0) continue;
    const part = Math.abs(amount) * (weights[key] ?? 1);
    value += part;
    if (part > leadValue) { leadValue = part; lead = key; }
  }
  if (tech.unlocks) {
    const part = UNLOCK_VALUE * (weights.unlocks ?? 1);
    value += part;
    if (part > leadValue) { leadValue = part; lead = 'unlocks'; }
  }
  return { value, lead };
}

function schoolOf(nation, world) {
  const research = ensureResearch(nation);
  if (!research.school && world?.seed != null) {
    const ids = Object.keys(TECH_CATEGORIES);
    research.school = makeRng(`${world.seed}-school-${nation.id}`).pick(ids);
  }
  return research.school ?? null;
}

export function pickNextTech(nation, year, world, priorities = null) {
  const candidates = availableTechs(nation);
  if (!candidates.length) return null;
  const school = schoolOf(nation, world);
  let best = null;
  for (const entry of candidates) {
    const cost = world ? effectiveTechCost(world, nation, entry.id, year) : techCost(entry.id, year);
    const { value, lead } = techValue(entry.tech, priorities);
    const score = Math.max(VALUE_FLOOR, value) * (entry.categoryId === school ? SCHOOL_BONUS : 1)
      / Math.max(1, cost);
    const tieYear = entry.tech.year ?? 9999;
    if (!best
      || score > best.score
      || (score === best.score && (cost < best.cost
        || (cost === best.cost && (tieYear < best.year
          || (tieYear === best.year && entry.id < best.id)))))) {
      best = { id: entry.id, lead, score, cost, year: tieYear };
    }
  }
  return best ? { id: best.id, lead: best.lead } : null;
}

/**
 * Haftalık araştırma döngüsü (turn.js ekonomi fazından önce): yayılım
 * tablosu, puan, tamamlanan teknoloji, boş kuyruğa otomatik seçim. Oyuncu
 * kuyruğu her zaman önce gelir; kuyruk boşsa AUTO ve YZ aynı seçiciyi kullanır.
 */
export function runResearch(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const year = yearOfTurn(turn);
  refreshDiffusion(world);
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    const research = ensureResearch(nation);
    const done = advanceResearch(nation, year, world);
    if (done && nation.id === game.turns?.playerNation) {
      game.turns.addLog(`Research complete: ${INDEX.get(done).tech.name}.`, { kind: 'RESEARCH' });
    }
    if (!research.current) {
      const queued = nextQueuedTech(nation);
      if (queued) startResearch(nation, queued);
      else {
        const isPlayer = nation.id === game.turns?.playerNation;
        const auto = !isPlayer || nation.delegation?.research !== false;
        const pick = auto ? pickNextTech(nation, year, world, researchPriorities(nation)) : null;
        if (pick) startResearch(nation, pick.id);
      }
    }
  }
}
