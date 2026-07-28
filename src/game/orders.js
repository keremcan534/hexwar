// Sürekli emirler. Amaç mikro yönetimi azaltmak: oyuncu her turu her birimi
// tek tek dolaştırmak zorunda kalmasın.
//
//   AUTO  — birimi yapay zekâya devreder
//   GOTO  — uzaktaki hedefe kaç tur sürerse sürsün yürür
//   HOLD  — bekler; "sıradaki birim" döngüsünde de çıkmaz

import { findPath } from '../core/pathfind.js';
import { runUnitAI } from './ai.js';
import { atWar } from './diplomacy.js';

export const ORDER = { AUTO: 'auto', GOTO: 'goto', HOLD: 'hold' };

/** Yol üst üste bu kadar tur tıkanırsa emir iptal edilir (birim kilitlenmesin). */
const MAX_BLOCKED_TURNS = 3;

export function setOrder(unit, type, target = null) {
  unit.order = type ? { type, target, blocked: 0 } : null;
  return unit.order;
}

export function clearOrder(unit) {
  unit.order = null;
}

/** Emri olmayan ve hâlâ hareket hakkı olan birimler: "sıradaki" döngüsünün kaynağı. */
export function idleUnits(world, nationId) {
  return world.units.filter(
    (u) => u.nationId === nationId && u.movesLeft > 0 && !u.order,
  );
}

/**
 * GOTO emrini bu turluk ilerletir: yol üzerinde bütçenin yettiği en uzak
 * kareye gider. Hedefe varınca ya da yol kalıcı tıkanınca emir düşer.
 */
function advanceGoto(game, unit) {
  const order = unit.order;
  const target = order.target;

  if (!target || unit.tile === target) {
    clearOrder(unit);
    return;
  }

  const path = findPath(game.world, unit.tile, target, {
    canEnter: game.canEnterFor(unit),
    costOf: game.costForUnit(unit),
  });

  if (!path || !path.length) {
    if (++order.blocked >= MAX_BLOCKED_TURNS) clearOrder(unit);
    return;
  }

  const { costs } = game.getReachable(unit);
  let furthest = null;
  for (const tile of path) {
    if (!costs.has(tile)) break;
    furthest = tile;
  }

  if (!furthest) {
    if (++order.blocked >= MAX_BLOCKED_TURNS) clearOrder(unit);
    return;
  }

  order.blocked = 0;
  game.moveUnit(unit, furthest);

  if (unit.tile === target) clearOrder(unit);

  // Varış karesinde düşman varsa saldırıyı oyuncuya bırakmayıp burada bitir.
  const enemy = target.unit;
  if (enemy && enemy.nationId !== unit.nationId && unit.movesLeft > 0 && !unit.embarked
    && atWar(game.world, enemy.nationId, unit.nationId)) {
    game.attack(unit, target);
  }
}

/** Bir ulusun tüm sürekli emirlerini işler. Tur başında çağrılır. */
export function executeOrders(game, nationId, rng) {
  // Kopya üzerinde gez: saldırı sırasında birim listesi değişebilir.
  for (const unit of [...game.world.units]) {
    if (unit.nationId !== nationId || !unit.order || unit.hp <= 0) continue;
    if (unit.order.type === ORDER.AUTO) runUnitAI(game, unit, rng);
    else if (unit.order.type === ORDER.GOTO) advanceGoto(game, unit);
  }
}
