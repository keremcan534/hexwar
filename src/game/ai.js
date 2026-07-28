// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import { hexDistance } from '../core/hex.js';
import { CITY_COST, UNIT_PRICES, UNIT_UPKEEP, canFoundCity } from './cities.js';

/** Ülke başına hedeflenen birim sayısı: toprak büyüdükçe ordu büyür. */
function desiredArmy(nation) {
  return 2 + Math.floor(nation.tiles / 25);
}

/** Hazinenin alabileceği en güçlü birim. */
function affordableUnit(nation) {
  if (nation.gold >= UNIT_PRICES.CAVALRY) return 'CAVALRY';
  if (nation.gold >= UNIT_PRICES.INFANTRY) return 'INFANTRY';
  if (nation.gold >= UNIT_PRICES.SCOUT) return 'SCOUT';
  return null;
}

/**
 * Harcama önceliği: önce yeterli ordu, sonra yeni şehir, artan altınla yine ordu.
 * Hazine biriktirmek YZ'yi pasifleştirdiği için son adım önemli.
 */
function spend(game, nation) {
  const world = game.world;
  const cities = world.cities.filter((c) => c.nationId === nation.id).length;

  if (nation.gold >= CITY_COST + UNIT_PRICES.INFANTRY && cities < 1 + nation.tiles / 45) {
    const unit = world.units.find(
      (u) => u.nationId === nation.id && canFoundCity(world, u.tile, nation.id),
    );
    if (unit) game.turns.foundCity(unit);
  }

  // Tek alım yetmiyor: geliri yüksek ülkelerde hazine şişip YZ pasifleşiyor.
  // Ama bakım giderini karşılayamayacağı orduyu da kurmamalı.
  const target = desiredArmy(nation);
  let army = world.units.filter((u) => u.nationId === nation.id).length;
  let projectedNet = nation.income ?? 0;

  for (let i = 0; i < 3; i++) {
    const surplus = nation.gold > 150;
    if (army >= target && !surplus) break;
    if (projectedNet - UNIT_UPKEEP < 0) break;
    const typeId = nation.gold >= UNIT_PRICES.CAVALRY && (nation.tiles > 80 || surplus)
      ? 'CAVALRY'
      : affordableUnit(nation);
    if (!typeId || !game.turns.buyUnit(nation, typeId)) break;
    army++;
    projectedNet -= UNIT_UPKEEP;
  }
}

/** Ulusun sahip olmadığı en yakın geçilebilir kare (BFS). */
function nearestFrontier(world, from, nationId, maxNodes = 900) {
  const seen = new Set([from]);
  const queue = [from];
  let head = 0;
  while (head < queue.length && head < maxNodes) {
    const tile = queue[head++];
    if (tile.owner !== nationId && tile.terrain.passable) return tile;
    for (const n of world.neighbors(tile)) {
      if (seen.has(n) || !n.terrain.passable) continue;
      seen.add(n);
      queue.push(n);
    }
  }
  return null;
}

function adjacentEnemy(world, unit) {
  let best = null;
  for (const n of world.neighbors(unit.tile)) {
    const other = n.unit;
    if (!other || other.nationId === unit.nationId) continue;
    // En zayıfına vur: birim düşürme şansı yüksek olsun.
    if (!best || other.hp < best.unit.hp) best = { tile: n, unit: other };
  }
  return best;
}

/**
 * Yakındaki düşman şehri varsa asıl hedef odur; toprak kapmaktan değerli.
 * Menzil dar tutuldu: geniş olunca herkes ilk 20 turda birbirinin başkentine
 * koşuyor ve harita üç ülkeye iniyor.
 */
function enemyCityNear(world, unit, maxDistance = 7) {
  let best = null;
  let bestDist = maxDistance;
  for (const city of world.cities) {
    if (city.nationId === unit.nationId) continue;
    const d = hexDistance(city.tile.q, city.tile.r, unit.tile.q, unit.tile.r);
    if (d < bestDist) {
      bestDist = d;
      best = city.tile;
    }
  }
  return best;
}

export function runNationAI(game, nation, rng) {
  const world = game.world;
  spend(game, nation);
  const units = world.units.filter((u) => u.nationId === nation.id);

  for (const unit of units) {
    if (unit.hp <= 0) continue;

    // 1) Bitişikte düşman varsa saldır.
    let target = adjacentEnemy(world, unit);
    if (target && unit.movesLeft > 0) {
      game.attack(unit, target.tile);
      continue;
    }

    // 2) Değilse yakındaki düşman şehrine, yoksa en yakın yabancı kareye ilerle.
    const goal = enemyCityNear(world, unit) ?? nearestFrontier(world, unit.tile, nation.id);
    if (!goal) continue;

    const { costs } = game.getReachable(unit);
    let bestTile = null;
    let bestScore = Infinity;
    for (const [tile, cost] of costs) {
      if (tile === unit.tile) continue;
      // Hedefe yakınlık birincil, ucuzluk ikincil; küçük rastgelelik tekdüzeliği kırar.
      const score = hexDistance(tile.q, tile.r, goal.q, goal.r) + cost * 0.05 + rng() * 0.3;
      if (score < bestScore) {
        bestScore = score;
        bestTile = tile;
      }
    }
    if (bestTile) game.moveUnit(unit, bestTile);

    // 3) Hareketten sonra hâlâ hakkı varsa ve düşman bitişikse vur.
    target = adjacentEnemy(world, unit);
    if (target && unit.movesLeft > 0) game.attack(unit, target.tile);
  }
}
