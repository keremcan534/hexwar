// Sürekli yürüyüş. Tur bazlı hamle bütçesi kaldırıldı: ordu bir hedef alır ve
// haftalar boyunca yol boyunca ilerler. Bir haftalık adımda `speedOf` kadar
// ilerleme birikir, komşu province'in maliyeti dolunca ordu oraya geçer.
//
// Yürüyüşü kesen üç şey var: düşmana çarpmak (muharebe), yolun kapanması
// (yeniden hesap) ve hedefe varmak.

import { findPath } from '../core/pathfind.js';
import { atWar } from './diplomacy.js';
import { startBattle } from './battles.js';
import { clearPath, isMoving, speedOf, stackFull } from './units.js';

/** Yol tıkanınca bu kadar kez yeniden hesaplanır, sonra emir düşer. */
const MAX_REROUTES = 2;

/** Ordunun hedefi: yolun son karesi. */
export function destinationOf(unit) {
  return unit.path?.length ? unit.path[unit.path.length - 1] : null;
}

/**
 * Hedefe giden yolu kurar. Yolun ilk elemanı ordunun *bir sonraki* karesidir;
 * bulunduğu kare yola dahil edilmez.
 */
export function orderMove(game, unit, target) {
  if (!unit || !target || unit.battleId || unit.tile === target) return false;
  const path = findPath(game.world, unit.tile, target, {
    canEnter: game.canEnterFor(unit),
    costOf: game.costForUnit(unit),
  });
  if (!path?.length) return false;
  unit.path = [...path];
  unit.progress = 0;
  unit.reroutes = 0;
  return true;
}

/** Ordunun bu hafta yürüyebilir durumda olup olmadığı. */
function canWalk(game, unit) {
  return isMoving(unit)
    && unit.hp > 0
    && !unit.battleId
    && (unit.retreatUntil ?? 0) <= game.turns.turn;
}

/**
 * Bir sonraki kareye girişi dener.
 * @returns {'moved'|'blocked'|'battle'|'merged'}
 */
function stepInto(game, unit, next) {
  const enemy = next.unit && next.unit.nationId !== unit.nationId;
  if (enemy) {
    // Savaştaysak çarpışma muharebeye döner; değilsek sınır bizi durdurur.
    if (!unit.embarked && atWar(game.world, unit.nationId, next.unit.nationId)) {
      clearPath(unit);
      startBattle(game, unit, next.unit);
      return 'battle';
    }
    return 'blocked';
  }

  // Dost tümenler *birleşmez*: aynı province'i paylaşırlar (HOI4 modeli).
  // Yığın doluysa giriş engellenir.
  if (next.unit && next.unit !== unit && stackFull(next)) return 'blocked';

  game.enterTile(unit, next);
  unit.path.shift();
  if (!unit.path.length) clearPath(unit);
  return 'moved';
}

/**
 * Yol kapandıysa yeniden hesapla; olmuyorsa emri düşür.
 * Sayaç `orderMove`den *sonra* geri yazılır: orderMove onu sıfırlıyor ve bu,
 * kapalı bir yolda sonsuz yeniden-hesap döngüsüne yol açıyordu.
 */
function reroute(game, unit) {
  const target = destinationOf(unit);
  const tries = (unit.reroutes ?? 0) + 1;
  if (!target || tries > MAX_REROUTES) {
    clearPath(unit);
    return false;
  }
  const ok = orderMove(game, unit, target);
  unit.reroutes = tries;
  if (!ok) clearPath(unit);
  return ok;
}

/** Bir haftalık yürüyüş. Haftalık tick'te bir kez çağrılır. */
export function advanceMovement(game) {
  const costOf = game.costForUnit();
  let moved = false;

  // Kopya üzerinde gez: birleşme ve muharebe birim listesini değiştirebilir.
  for (const unit of [...game.world.units]) {
    if (!canWalk(game, unit)) continue;
    let budget = speedOf(unit);

    while (budget > 0 && canWalk(game, unit)) {
      const next = unit.path[0];
      if (!game.canEnterFor(unit)(next)) {
        if (!reroute(game, unit)) break;
        continue;
      }
      // Alt sınır şart: birikmiş ilerleme maliyeti aşarsa need negatife düşer
      // ve bütçe azalmak yerine büyür — döngü hiç bitmez.
      const need = Math.max(0.01, Math.max(0.01, costOf(next)) - unit.progress);
      if (budget < need) {
        unit.progress += budget;
        budget = 0;
        break;
      }
      const result = stepInto(game, unit, next);
      if (result === 'battle') { moved = true; break; }
      if (result === 'blocked') {
        if (!reroute(game, unit)) break;
        continue;
      }
      budget -= need;
      unit.progress = 0;
      moved = true;
    }
  }

  if (moved) game.requestRender();
  return moved;
}
