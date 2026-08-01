// Sürekli emirler. Amaç mikro yönetimi azaltmak: oyuncu her turu her birimi
// tek tek dolaştırmak zorunda kalmasın.
//
//   AUTO  — birimi yapay zekâya devreder
//   HOLD  — bekler; "sıradaki birim" döngüsünde de çıkmaz
//
// Eski GOTO emri kaldırıldı: uzak hedefe yürümek artık emir değil, ordunun
// normal hâli. Yolu `movement.js` haftalık olarak ilerletir.

import { runUnitAI } from './ai.js';
import { isMoving } from './units.js';

export const ORDER = { AUTO: 'auto', HOLD: 'hold' };

export function setOrder(unit, type, target = null) {
  unit.order = type ? { type, target, blocked: 0 } : null;
  return unit.order;
}

export function clearOrder(unit) {
  unit.order = null;
}

/** Emri de yolu da olmayan ordular: "sıradaki birim" döngüsünün kaynağı. */
export function idleUnits(world, nationId) {
  return world.units.filter(
    (u) => u.nationId === nationId && !u.order && !u.battleId && !isMoving(u),
  );
}

/** Bir ulusun tüm sürekli emirlerini işler. Tur başında çağrılır. */
export function executeOrders(game, nationId, rng) {
  // Kopya üzerinde gez: saldırı sırasında birim listesi değişebilir.
  for (const unit of [...game.world.units]) {
    if (
      unit.nationId !== nationId || !unit.order || unit.hp <= 0 || unit.battleId
      || (unit.retreatUntil ?? 0) > game.turns.turn
    ) continue;
    if (unit.order.type === ORDER.AUTO) runUnitAI(game, unit, rng);
  }
}
