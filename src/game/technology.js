// TEKNOLOJİ ve araştırma (TASARIM.md §13).
//
// Beş dal × iki klasör × dört kademe = 40 teknoloji, 1836-1890. Klasör
// içinde DOĞRUSAL ilerleyiş (Vic2 kuralı). Her teknolojinin etkisi somuttur
// ve modifiers.js anahtarlarına yazılır — "+%2'lik dolgu düğme" yoktur; her
// anahtarın okuyucusu MODIFIER_KEYS tablosunda yazar.
//
// Takvim ÜST SINIR değil, maliyet çarpanıdır: aktivasyon yılından önce
// araştırmak pahalıdır (yılda %6, tavan 2.5 kat). Yayılım: temas ettiğin
// komşuların sahip olduğu teknoloji %35'e kadar ucuzlar.
//
// Katman notu: saf veri + hesap; ekonomiyi import ETMEZ.

import { makeRng } from '../core/rng.js';
import { MODIFIER_KEYS, mod, refreshModifiers, registerModifierSource } from './modifiers.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const TECH_CATEGORIES = {
  industry: { id: 'industry', name: 'Industry', icon: '⚙' },
  infrastructure: { id: 'infrastructure', name: 'Infrastructure', icon: '🛤' },
  army: { id: 'army', name: 'Army', icon: '⚔' },
  navy: { id: 'navy', name: 'Navy', icon: '⚓' },
  society: { id: 'society', name: 'Society', icon: '🎓' },
};

export const TECH_FOLDERS = {
  industry: ['Power', 'Metallurgy'],
  infrastructure: ['Railways', 'Agriculture'],
  army: ['Doctrine', 'Arms'],
  navy: ['Shipbuilding', 'Naval Doctrine'],
  society: ['Philosophy', 'Public Instruction'],
};

/** Teknoloji etkileri modifiers.js anahtarlarıdır; ekran adları oradan. */
export const TECH_MODS = Object.fromEntries(
  Object.entries(MODIFIER_KEYS).map(([key, meta]) => [key, meta.label]),
);

function t(id, name, year, effects, desc = '') {
  return { id, name, year, effects, desc };
}

export const TECHNOLOGIES = {
  industry: {
    Power: [
      t('stationary_steam', 'Stationary Steam Engine', 1836, { ic: 0.08 }, 'Steam replaces the water wheel in the mills.'),
      t('mechanical_production', 'Mechanical Production', 1846, { ic: 0.08, lineGain: 0.2 }, 'Machine tools speed up every production line.'),
      t('compound_engines', 'Compound Steam Engines', 1860, { ic: 0.10 }, 'More power from the same coal.'),
      t('electrical_power', 'Electrical Power', 1880, { ic: 0.12 }, 'Dynamos light the factory floor.'),
    ],
    Metallurgy: [
      t('coke_smelting', 'Coke Smelting', 1840, { resources: 0.10 }, 'Coke furnaces raise iron and coal output.'),
      t('bessemer_process', 'Bessemer Process', 1856, { lineEfficiency: 0.05, resources: 0.05 }, 'Cheap steel for arsenals.'),
      t('open_hearth', 'Open Hearth Furnace', 1868, { lineEfficiency: 0.05, ic: 0.05 }, 'Better steel, steadier output.'),
      t('alloy_steel', 'Alloy Steel', 1890, { lineEfficiency: 0.05, resources: 0.10 }, 'Hard steels for guns and machines.'),
    ],
  },
  infrastructure: {
    Railways: [
      t('early_railways', 'Early Railways', 1836, { construction: 0.10, constructionSlots: 1 }, 'The first lines between mine and port.'),
      t('iron_railways', 'Iron Railways', 1848, { developmentCap: 1, supply: 0.15 }, 'Rails tie the provinces together.'),
      t('steel_railways', 'Steel Railways', 1862, { construction: 0.15, developmentCap: 1 }, 'Heavier trains, cheaper building.'),
      t('integral_rail', 'Integral Rail System', 1878, { constructionSlots: 1, supply: 0.15 }, 'A national network.'),
    ],
    Agriculture: [
      t('crop_rotation', 'Crop Rotation', 1838, { food: 0.10 }, 'Four-field rotation raises yields.'),
      t('mechanized_farming', 'Mechanised Farming', 1852, { food: 0.10, growth: 0.05 }, 'Reapers and threshers.'),
      t('fertilizers', 'Chemical Fertilisers', 1868, { food: 0.15 }, 'Guano and superphosphate.'),
      t('refrigeration', 'Refrigeration', 1884, { food: 0.10, consumerNeed: -0.05, developmentCap: 1 }, 'Food travels across the world.'),
    ],
  },
  army: {
    Doctrine: [
      t('post_napoleonic', 'Post-Napoleonic Thought', 1836, { attack: 0.05, manpower: 0.05 }, 'Mass armies and columns.'),
      t('field_fortifications', 'Field Fortifications', 1846, { defense: 0.08 }, 'Trenches and earthworks.'),
      t('general_staff', 'General Staff', 1860, { attack: 0.06, organization: 0.15, reinforce: 0.15 }, 'Planning wins wars before they start.'),
      t('modern_doctrine', 'Modern Doctrine', 1882, { defense: 0.08, attack: 0.06, training: 0.15 }, 'Firepower and dispersion.'),
    ],
    Arms: [
      t('percussion_caps', 'Percussion Caps', 1840, { attack: 0.05, lineGain: 0.1 }, 'Muskets that fire in the rain.'),
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

const INDEX = new Map();
for (const [categoryId, folders] of Object.entries(TECHNOLOGIES)) {
  for (const [folder, list] of Object.entries(folders)) {
    list.forEach((tech, level) => INDEX.set(tech.id, { tech, categoryId, folder, level }));
  }
}

export function techById(id) {
  return INDEX.get(id) ?? null;
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

/** Turun takvim yılı. */
export function yearOfTurn(turn) {
  return 1836 + Math.floor((Math.max(1, turn ?? 1) - 1) * 7 / 365);
}

// Teknoloji etkileri değiştirici kaynağıdır (modifiers.js toplar).
registerModifierSource((nation) => {
  const out = [];
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
 * önce araştırmak yılda %6 (tavan 2.5×) daha pahalıdır.
 */
export const TECH_BASE_COST = 110;
export function techCost(techId, year) {
  const entry = INDEX.get(techId);
  if (!entry) return Infinity;
  const levelScale = 1 + entry.level * 0.6;
  const early = Math.max(0, (entry.tech.year ?? 1836) - year);
  const earlyPenalty = clamp(1 + early * 0.06, 1, 2.5);
  return Math.round(TECH_BASE_COST * levelScale * earlyPenalty);
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
  weights.research = 1.3;
  weights.developmentCap = 0.12;
  weights.constructionSlots = 0.08;
  weights.power = 0.12;
  return { weights };
}

export const SCHOOL_BONUS = 1.4;
const VALUE_FLOOR = 0.01;

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
