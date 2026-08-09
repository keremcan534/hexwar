// Hegemonya puanı ve zafer. Oyunun amacı budur: eleme değil, üstünlük.
//
// Toprak puana katkı verir ama tek yol değildir; ekonomi ve prestij de
// barışçı bir zafer yolu sağlar.

import { atPeace } from './diplomacy.js';

/**
 * Bu puana ilk ulaşan kazanır; kimse ulaşmazsa 300. turda en yüksek kazanır.
 * Eşik ölçümle seçilir: hedef, güçlü bir ülkenin 220-300. hafta arasında
 * ulaşabileceği ama 50. haftada ulaşamayacağı yerde durmalı. 12 oyunluk
 * koşuda 400 eşiği ortalama 235. haftada ve oyunların %83'ünde gerçekten
 * eşiğe ulaşarak bitiyor; 440 ortalamayı 277'ye çekiyor ama oyunların
 * yarıdan fazlası süre dolarak bitiyordu.
 */
export const HEGEMONY_TARGET = 400;
export const FINAL_TURN = 300;

/**
 * Kurulu sanayi kapasitesinin puan ağırlığı. Ham üretim ve prestij ilk elli
 * haftada donuyor (toprak neredeyse hiç el değiştirmiyor, şehir nüfusu sabit);
 * fabrika seviyesi ise yatırımla oyun boyunca büyüyen tek eksen. Puanın zamanla
 * yükselmesi bu yüzden buradan gelir ve geç oyunda skorun çoğunluğunu sanayi
 * oluşturur. Fetih ya da province gelişimi tekrar büyümeye başlarsa bu ağırlık
 * yeniden ölçülmeli.
 */
const INDUSTRY_WEIGHT = 10;

/**
 * @returns {{ total:number, economy:number, prestige:number }}
 */
export function hegemonyScore(world, nation) {
  const budget = nation.budget;
  // Ekonomi: ürettiğin, sahip olduğun değil.
  const production = budget
    ? budget.production.gold + budget.production.food
      + budget.production.timber + budget.production.iron
    : 0;
  const industry = (nation.economy?.factories ?? []).reduce(
    (sum, factory) => sum + factory.level, 0,
  );
  const economy = production * 1.2 + industry * INDUSTRY_WEIGHT;

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
    total: Math.round(economy + prestige),
    economy: Math.round(economy),
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
    reason: reachedTarget ? 'hegemony' : 'time',
    board,
  };
}
