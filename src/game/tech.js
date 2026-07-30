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
    id: 'FARMING', name: 'Tarım', branch: 'economy', tier: 1,
    cost: { gold: 80 }, desc: 'her şehir +1 erzak',
  },
  ROADS: {
    id: 'ROADS', name: 'Yollar', branch: 'economy', tier: 2,
    cost: { gold: 150, timber: 8 }, requires: ['FARMING'], desc: 'her şehir +1 altın',
  },
  BANKING: {
    id: 'BANKING', name: 'Bankacılık', branch: 'economy', tier: 3,
    cost: { gold: 280 }, requires: ['ROADS'], desc: 'her şehir +2 altın',
  },
  ACCOUNTING: {
    id: 'ACCOUNTING', name: 'Muhasebe', branch: 'economy', tier: 4,
    cost: { gold: 450 }, requires: ['BANKING'], desc: 'büyük imparatorlukta verim kaybı azalır',
  },

  // --- Askerî ---
  SMITHING: {
    id: 'SMITHING', name: 'Demircilik', branch: 'military', tier: 1,
    cost: { gold: 80, iron: 4 }, desc: 'her şehir +1 demir',
  },
  ARMOR: {
    id: 'ARMOR', name: 'Zırh', branch: 'military', tier: 2,
    cost: { gold: 150, iron: 10 }, requires: ['SMITHING'], desc: 'birimler +15 can',
  },
  TACTICS: {
    id: 'TACTICS', name: 'Taktik', branch: 'military', tier: 3,
    cost: { gold: 280, iron: 12 }, requires: ['ARMOR'], desc: 'birimler +1 saldırı',
  },
  SIEGE: {
    id: 'SIEGE', name: 'Kuşatma', branch: 'military', tier: 4,
    cost: { gold: 450, iron: 16 }, requires: ['TACTICS'], desc: 'şehir savunması yarı etkili',
  },

  // --- İdare ---
  CLERKS: {
    id: 'CLERKS', name: 'Kâtiplik', branch: 'admin', tier: 1,
    cost: { gold: 80, timber: 4 }, desc: 'ambar kapasitesi +25',
  },
  ASSIMILATION: {
    id: 'ASSIMILATION', name: 'Asimilasyon', branch: 'admin', tier: 2,
    cost: { gold: 150 }, requires: ['CLERKS'],
    desc: 'yabancı topraklar asimile olmaya başlar (bu teknoloji olmadan hiç olmaz)',
  },
  DIPLOMACY: {
    id: 'DIPLOMACY', name: 'Diplomasi', branch: 'admin', tier: 3,
    cost: { gold: 280 }, requires: ['ASSIMILATION'], desc: 'kötü şöhret daha hızlı unutulur',
  },
  GOVERNANCE: {
    id: 'GOVERNANCE', name: 'Yönetim', branch: 'admin', tier: 4,
    cost: { gold: 450, timber: 12 }, requires: ['DIPLOMACY'], desc: 'şehir başına +1 bina yuvası',
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

export function research(nation, id) {
  if (!canResearch(nation, id)) return false;
  if (!pay(nation, TECHS[id].cost)) return false;
  nation.techs.push(id);
  return true;
}

export function affordableTechs(nation) {
  return availableTechs(nation).filter((t) => canAfford(nation, t.cost));
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
