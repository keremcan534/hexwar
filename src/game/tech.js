// Teknoloji: altının kalan gideri ve fetih dışı büyüme yolu.
//
// Üç dal (ekonomi, askerî, idare), her dalda dört kademe. Kademe maliyeti
// katlanarak arttığı için 300 turluk oyunda bir ülke 6-9 teknoloji alabilir;
// yani dal seçmek zorunda kalır.
//
// Etkiler mevcut sistemlere doğrudan bağlanır: yeni mekanik eklemek yerine
// var olanların katsayılarını oynatır (tasarım § 8).

import { canAfford, pay } from './cities.js';

export const TECHS = {
  // --- Ekonomi ---
  FARMING: {
    id: 'FARMING', name: 'Agriculture', branch: 'economy', tier: 1,
    cost: { gold: 80 }, desc: '+1 food per city',
  },
  ROADS: {
    id: 'ROADS', name: 'Roads', branch: 'economy', tier: 2,
    cost: { gold: 150, timber: 8 }, requires: ['FARMING'], desc: '+1 gold per city',
  },
  BANKING: {
    id: 'BANKING', name: 'Banking', branch: 'economy', tier: 3,
    cost: { gold: 280 }, requires: ['ROADS'], desc: '+2 gold per city',
  },
  ACCOUNTING: {
    id: 'ACCOUNTING', name: 'Accounting', branch: 'economy', tier: 4,
    cost: { gold: 450 }, requires: ['BANKING'], desc: 'reduces efficiency loss in large empires',
  },

  // --- Askerî ---
  SMITHING: {
    id: 'SMITHING', name: 'Smithing', branch: 'military', tier: 1,
    cost: { gold: 80, iron: 4 }, desc: '+1 iron per city',
  },
  ARMOR: {
    id: 'ARMOR', name: 'Armor', branch: 'military', tier: 2,
    cost: { gold: 150, iron: 10 }, requires: ['SMITHING'], desc: '+15 unit strength',
  },
  TACTICS: {
    id: 'TACTICS', name: 'Tactics', branch: 'military', tier: 3,
    cost: { gold: 280, iron: 12 }, requires: ['ARMOR'], desc: '+1 unit attack',
  },
  SIEGE: {
    id: 'SIEGE', name: 'Siegecraft', branch: 'military', tier: 4,
    cost: { gold: 450, iron: 16 }, requires: ['TACTICS'], desc: 'halves enemy city defense',
  },

  // --- İdare ---
  CLERKS: {
    id: 'CLERKS', name: 'Civil Service', branch: 'admin', tier: 1,
    cost: { gold: 80, timber: 4 }, desc: '+25 storage capacity',
  },
  ASSIMILATION: {
    id: 'ASSIMILATION', name: 'Assimilation', branch: 'admin', tier: 2,
    cost: { gold: 150 }, requires: ['CLERKS'],
    desc: 'foreign territories begin to assimilate',
  },
  DIPLOMACY: {
    id: 'DIPLOMACY', name: 'Diplomacy', branch: 'admin', tier: 3,
    cost: { gold: 280 }, requires: ['ASSIMILATION'], desc: 'infamy decays faster',
  },
  GOVERNANCE: {
    id: 'GOVERNANCE', name: 'Governance', branch: 'admin', tier: 4,
    cost: { gold: 450, timber: 12 }, requires: ['DIPLOMACY'], desc: '+1 building slot per city',
  },
};

export function hasTech(nation, id) {
  return Boolean(nation.techs?.includes(id));
}

export function canResearch(nation, id) {
  const tech = TECHS[id];
  if (!tech || hasTech(nation, id)) return false;
  return (tech.requires ?? []).every((req) => hasTech(nation, req));
}

export function availableTechs(nation) {
  return Object.values(TECHS).filter((t) => canResearch(nation, t.id));
}

export function researchCost(nation, idOrTech) {
  const tech = typeof idOrTech === 'string' ? TECHS[idOrTech] : idOrTech;
  if (!tech) return {};
  const discount = Math.min(0.32, nation.budget?.researchDiscount ?? 0);
  return {
    ...tech.cost,
    gold: Math.ceil((tech.cost.gold ?? 0) * (1 - discount)),
  };
}

export function research(nation, id) {
  if (!canResearch(nation, id)) return false;
  if (!pay(nation, researchCost(nation, id))) return false;
  nation.techs.push(id);
  return true;
}

export function affordableTechs(nation) {
  return availableTechs(nation).filter((t) => canAfford(nation, researchCost(nation, t)));
}

// --- Etki kancaları. Her biri tek satır: nereye dokunduğu açık kalsın. ---

export const techFoodPerCity = (n) => (hasTech(n, 'FARMING') ? 1 : 0);

export const techGoldPerCity = (n) => (hasTech(n, 'ROADS') ? 1 : 0) + (hasTech(n, 'BANKING') ? 2 : 0);

export const techIronPerCity = (n) => (hasTech(n, 'SMITHING') ? 1 : 0);

export const techStorageBonus = (n) => (hasTech(n, 'CLERKS') ? 25 : 0);

/** Yolsuzluk formülünün tabanı; büyüdükçe verim kaybı azalır. */
export const techCorruptionBase = (n) => (hasTech(n, 'ACCOUNTING') ? 24 : 12);

/**
 * Asimilasyon idari bir yatırımdır. Bu teknoloji olmadan fethedilen toprak
 * kalıcı olarak yabancı ve eksik verimli kalır — fethin bedelini süreklileştiren
 * ve barışçı yolu yarışta tutan asıl kural.
 */
export const canAssimilate = (n) => hasTech(n, 'ASSIMILATION');
export const techAssimilationFactor = () => 0.6;

export const techInfamyDecayFactor = (n) => (hasTech(n, 'DIPLOMACY') ? 1.8 : 1);

export const techBuildingSlots = (n) => (hasTech(n, 'GOVERNANCE') ? 1 : 0);

export const techHpBonus = (n) => (hasTech(n, 'ARMOR') ? 15 : 0);

export const techAttackBonus = (n) => (hasTech(n, 'TACTICS') ? 1 : 0);

/** Kuşatma bilen saldırganın karşısında şehir surları yarı etkili. */
export const techSiegeFactor = (n) => (hasTech(n, 'SIEGE') ? 0.5 : 1);
