// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import { hexDistance } from '../core/hex.js';

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

export function runNationAI(game, nation, rng) {
  const world = game.world;
  const units = world.units.filter((u) => u.nationId === nation.id);

  for (const unit of units) {
    if (unit.hp <= 0) continue;

    // 1) Bitişikte düşman varsa saldır.
    let target = adjacentEnemy(world, unit);
    if (target && unit.movesLeft > 0) {
      game.attack(unit, target.tile);
      continue;
    }

    // 2) Değilse en yakın yabancı/sahipsiz kareye doğru ilerle.
    const goal = nearestFrontier(world, unit.tile, nation.id);
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
