// Sürekli emirler. Amaç mikro yönetimi azaltmak: oyuncu her turu her birimi
// tek tek dolaştırmak zorunda kalmasın.
//
//   AUTO  — birimi yapay zekâya devreder
//   HOLD  — bekler; "sıradaki birim" döngüsünde de çıkmaz
//
// Eski GOTO emri kaldırıldı: uzak hedefe yürümek artık emir değil, ordunun
// normal hâli. Yolu `movement.js` haftalık olarak ilerletir.

import { runUnitAI } from './ai.js';
import { clearDirective } from './movement.js';
import { isMoving } from './units.js';

export const ORDER = { AUTO: 'auto', HOLD: 'hold' };

export function setOrder(unit, type, target = null) {
  // HOLD ve AUTO oyuncunun onceki hedefini gecersiz kilar: "dur" diyen de
  // "sen bilirsin" diyen de o emirden vazgecmis demektir.
  clearDirective(unit);
  unit.order = type ? { type, target, blocked: 0 } : null;
  return unit.order;
}

export function clearOrder(unit) {
  // Sağ tık emri de düşer: düşmezse tümen ertesi hafta eski hedefe yeniden
  // yol buluyordu ve "dur" demenin hiçbir yolu yoktu.
  clearDirective(unit);
  unit.order = null;
}

/**
 * Emri, yolu ve GENERALİ olmayan kara tümenleri: "sıradaki birim" döngüsünün
 * kaynağı. Generalin tümeni boşta değildir (general onu cephesine dizer) ve
 * gemi limanda beklemekle boşta sayılmaz; ikisi sayılınca N bütün orduyu
 * dolaşıyordu.
 */
export function idleUnits(world, nationId) {
  const commanded = new Set();
  for (const general of world.nations[nationId]?.generals ?? []) {
    for (const id of general.divisions ?? []) commanded.add(id);
  }
  return world.units.filter(
    (u) => u.nationId === nationId && !u.order && !u.battleId && !isMoving(u)
      && u.type?.domain !== 'sea' && !commanded.has(u.id),
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
