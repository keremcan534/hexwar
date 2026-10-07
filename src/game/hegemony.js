// ZAFER — 1900'de en yüksek puan (TASARIM.md §14).
//
// Puan dört eksenden: SANAYİ (IC), NÜFUS, ÇEKİRDEK TOPRAK ve PRESTİJ.
// Toprak tek yol değildir; sanayi ve prestij barışçı bir yol açar. Her
// ulusun bir de ULUSAL HEDEFİ vardır (kuruluşta, durumuna göre): tutarsa
// büyük bonus — küçük ülke de kendi hikâyesini kazanabilir.
//
// Erken zafer yoktur: kampanya 1900'de biter (önceki ölçüm: 1910 sonrası
// harita donuyordu, oyuncunun önüne gelen karar sıfıra yaklaşıyordu).

import { isCore } from './provinces.js';

export const FINAL_TURN = 3340;

export const SCORE_WEIGHTS = { ic: 4, population: 3, core: 1, prestige: 1 };

/** Ulusal hedefler ve bonusları. */
export const GOALS = {
  unify: {
    id: 'unify', name: 'United Nation', bonus: 100,
    desc: 'Our people are divided. Gather the homeland and proclaim the Great nation.',
  },
  empire: {
    id: 'empire', name: 'Preserve the Empire', bonus: 80,
    desc: 'Many peoples, one crown. Hold at least 90% of our 1836 provinces in 1900.',
  },
  industry: {
    id: 'industry', name: 'Industrial Giant', bonus: 80,
    desc: 'Become one of the three greatest industrial powers by 1900.',
  },
};

/**
 * Kuruluşta hedef seçimi: bölünmüş halk → birleşme; çok uluslu devlet →
 * imparatorluğu koru; geri kalan → sanayi devi. Başlangıç province sayısı
 * hedefin ölçüsü için saklanır.
 */
export function assignGoals(world) {
  const homelandOwners = new Map();
  for (const province of world.provinces ?? []) {
    if (province.homeland == null || province.homeland < 0 || province.owner < 0) continue;
    let set = homelandOwners.get(province.homeland);
    if (!set) homelandOwners.set(province.homeland, (set = new Set()));
    set.add(province.owner);
  }
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const own = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ);
    nation.startProvinces = own.length;
    const foreign = own.filter((p) => !(nation.accepted ?? [nation.culture]).includes(p.culture)).length;
    const split = (homelandOwners.get(nation.culture)?.size ?? 0) >= 2;
    nation.goal = split ? 'unify' : (own.length >= 8 && foreign / Math.max(1, own.length) >= 0.25 ? 'empire' : 'industry');
  }
}

/** Hedef tuttu mu (şu an)? */
export function goalMet(world, nation, board = null) {
  switch (nation.goal) {
    case 'unify':
      return world.formedNations?.[nation.culture] === nation.id;
    case 'empire': {
      const own = (world.provinces ?? []).filter((p) => p.owner === nation.id).length;
      return own >= Math.ceil((nation.startProvinces ?? own) * 0.9);
    }
    case 'industry': {
      const ranked = (board ?? world.nations.filter((n) => n.alive))
        .map((row) => row.nation ?? row)
        .sort((a, b) => (b.economy?.ic?.total ?? 0) - (a.economy?.ic?.total ?? 0));
      return ranked.slice(0, 3).some((n) => n.id === nation.id);
    }
    default:
      return false;
  }
}

/**
 * @returns {{ total, industry, population, land, prestige, goal }}
 */
export function hegemonyScore(world, nation, board = null) {
  const industry = (nation.economy?.ic?.total ?? 0) * SCORE_WEIGHTS.ic;
  const population = (nation.economy?.population ?? 0) / 1e6 * SCORE_WEIGHTS.population;
  let cores = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id && isCore(world, province, nation.id)) cores++;
  }
  const land = cores * SCORE_WEIGHTS.core;
  const prestige = (nation.prestige ?? 0) * SCORE_WEIGHTS.prestige;
  const goal = goalMet(world, nation, board) ? GOALS[nation.goal]?.bonus ?? 0 : 0;
  return {
    total: Math.round(industry + population + land + prestige + goal),
    industry: Math.round(industry),
    population: Math.round(population),
    land,
    prestige: Math.round(prestige),
    goal,
    // Eski okuyucular (dosya kartı) için iki toplam.
    economy: Math.round(industry + population),
  };
}

export function scoreboard(world) {
  const alive = world.nations.filter((n) => n.alive);
  return alive
    .map((n) => ({ nation: n, ...hegemonyScore(world, n, alive) }))
    .sort((a, b) => b.total - a.total);
}

/** Zafer kontrolü: yalnız son turda. */
export function checkVictory(world, turn) {
  if (turn < FINAL_TURN) return null;
  const board = scoreboard(world);
  if (!board.length) return null;
  const leader = board[0];
  const maxTiles = Math.max(...board.map((b) => b.nation.tiles));
  return {
    nation: leader.nation,
    score: leader.total,
    byConquest: leader.nation.tiles === maxTiles,
    reason: 'time',
    board,
  };
}
