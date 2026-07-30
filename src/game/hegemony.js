// Hegemonya puanı ve zafer. Oyunun amacı budur: eleme değil, üstünlük.
//
// Puan üç ayaklı, çünkü tasarımın kabul ölçütü "oyunların en az %40'ı fetih
// dışı bir yolla kazanılabilmeli" (docs/tasarim.md § 10). Toprak puana katkı
// verir ama tek yol değildir; ekonomi ve teknoloji kendi başına yeter.

import { atPeace } from './diplomacy.js';
import { TECHS } from './tech.js';

/**
 * Bu puana ilk ulaşan kazanır; kimse ulaşmazsa 300. turda en yüksek kazanır.
 * 220 iken oyunlar 100-151. turda bitiyordu; seçilen 250-300 turluk ufka göre
 * erken. Eşik ölçümle bu değere çekildi.
 */
export const HEGEMONY_TARGET = 420;
export const FINAL_TURN = 300;

/**
 * @returns {{ total:number, economy:number, technology:number, prestige:number }}
 */
export function hegemonyScore(world, nation) {
  const budget = nation.budget;
  // Ekonomi: ürettiğin, sahip olduğun değil.
  const production = budget
    ? budget.production.gold + budget.production.food
      + budget.production.timber + budget.production.iron
    : 0;
  const economy = production * 1.2;

  // Teknoloji: kademe ağırlıklı, ileri teknoloji daha değerli.
  let technology = 0;
  for (const id of nation.techs ?? []) technology += (TECHS[id]?.tier ?? 1) * 7;

  // Prestij: şehirler, barışçı ilişkiler, toprak (en zayıf katsayı toprakta).
  let cities = 0;
  for (const city of world.cities) if (city.nationId === nation.id) cities += 2 + city.pop * 0.3;
  let partners = 0;
  for (const other of world.nations) {
    if (other.alive && other.id !== nation.id && atPeace(world, nation.id, other.id)) partners++;
  }
  // Toprağın katsayısı kasten en zayıf: geniş olmak tek yol olmasın.
  const prestige = cities + partners * 2 + nation.tiles * 0.04;

  return {
    total: Math.round(economy + technology + prestige),
    economy: Math.round(economy),
    technology: Math.round(technology),
    prestige: Math.round(prestige),
  };
}

export function scoreboard(world) {
  return world.nations
    .filter((n) => n.alive)
    .map((n) => ({ nation: n, ...hegemonyScore(world, n) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Zafer kontrolü.
 * @returns {{ nation: object, score: number, byConquest: boolean, reason: string }|null}
 */
export function checkVictory(world, turn) {
  const board = scoreboard(world);
  if (!board.length) return null;
  const leader = board[0];

  const reachedTarget = leader.total >= HEGEMONY_TARGET;
  const timeUp = turn >= FINAL_TURN;
  if (!reachedTarget && !timeUp) return null;

  // Kazanan aynı zamanda en geniş ülke mi? Tasarım ölçütü bunu sorar.
  const maxTiles = Math.max(...board.map((b) => b.nation.tiles));
  return {
    nation: leader.nation,
    score: leader.total,
    byConquest: leader.nation.tiles === maxTiles,
    reason: reachedTarget ? 'hegemonya' : 'süre',
    board,
  };
}
