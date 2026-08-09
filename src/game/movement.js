// Surekli yuruyus. Tur bazli hamle butcesi yok: ordu bir hedef alir ve haftalar
// boyunca yol boyunca ilerler. Bir haftalik adimda `speedOf` kadar ilerleme
// birikir, komsu province'in maliyeti dolunca ordu oraya gecer.
//
// Yuruyusu kesen uc sey var: dusmana carpmak (muharebe), yolun kapanmasi
// (yeniden hesap) ve hedefe varmak.

import { findPath } from '../core/pathfind.js';
import { atWar } from './diplomacy.js';
import { startBattle } from './battles.js';
import { generalMarchBonus, generalOfArmy } from './command.js';
import {
  clearPath, isMoving, resetEntrenchment, speedOf, stackFull, unitsOn,
} from './units.js';

/** Yol tikaninca bu kadar kez yeniden hesaplanir, sonra emir duser. */
const MAX_REROUTES = 2;

/** Ordunun hedefi: yolun son karesi. */
export function destinationOf(unit) {
  return unit.path?.length ? unit.path[unit.path.length - 1] : null;
}

/**
 * Hedefe giden yolu kurar. Yolun ilk elemani ordunun *bir sonraki* karesidir;
 * bulundugu kare yola dahil edilmez.
 */
export function orderMove(game, unit, target) {
  // attackReadyAt yeni saldiriyi kilitler, dost toprakta yeniden konuslanmayi degil.
  if (!unit || !target || unit.battleId || unit.tile === target) return false;
  const path = findPath(game.world, unit.tile, target, {
    canEnter: game.canEnterFor(unit),
    costOf: game.costForUnit(unit),
  });
  if (!path?.length) return false;
  resetEntrenchment(unit);
  unit.path = [...path];
  unit.progress = 0;
  unit.reroutes = 0;
  return true;
}

/** Ordunun bu hafta yuruyebilir durumda olup olmadigi. */
function canWalk(game, unit) {
  return isMoving(unit)
    && unit.hp > 0
    && !unit.battleId
    && (unit.retreatUntil ?? 0) <= game.turns.turn;
}

/**
 * Bir sonraki kareye girisi dener.
 * @returns {'moved'|'blocked'|'battle'|'waiting'}
 */
function stepInto(game, unit, next) {
  // Savunma takviyesi hedefteki dost tumen nedeniyle "bos" bir kare gorur.
  // Fiziksel olarak province'e girmeden once suren muharebeye yazilmalidir.
  if (unitsOn(next).some((other) => other.battleId)) {
    clearPath(unit);
    return startBattle(game, unit, next) ? 'battle' : 'blocked';
  }

  const foe = unitsOn(next).find((other) => other.nationId !== unit.nationId);
  if (foe) {
    // Savastaysak carpisma muharebeye doner; degilsek sinir bizi durdurur.
    if (!unit.embarked && atWar(game.world, unit.nationId, foe.nationId)) {
      if ((unit.attackReadyAt ?? 0) > game.turns.turn) return 'waiting';
      if (game.attack(unit, next)) return 'battle';
      // General cadence'i veya organization henuz hazir degilse hedef unutulmaz.
      return 'waiting';
    }
    return 'blocked';
  }

  // Dost tumenler *birlesmez*: ayni province'i paylasirlar. Yigin doluysa
  // giris engellenir.
  if (stackFull(next)) return 'blocked';

  const conquered = game.enterTile(unit, next);
  // Dusman province'inde yuruyus biter: tumen ikmal kurmadan ayni hafta birden
  // cok kareyi yutup ince bir koridor acamaz.
  if (conquered) {
    clearPath(unit);
    return 'moved';
  }
  unit.path.shift();
  if (!unit.path.length) clearPath(unit);
  return 'moved';
}

/**
 * Yol kapandiysa yeniden hesapla; olmuyorsa emri dusur.
 * Sayac `orderMove`den *sonra* geri yazilir: orderMove onu sifirliyor ve bu,
 * kapali bir yolda sonsuz yeniden-hesap dongusune yol aciyordu.
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

/** Bir haftalik yuruyus. Haftalik tick'te bir kez cagrilir. */
export function advanceMovement(game) {
  const costOf = game.costForUnit();
  let moved = false;

  // Kopya uzerinde gez: muharebe birim listesini degistirebilir.
  for (const unit of [...game.world.units]) {
    if (!canWalk(game, unit)) continue;
    // Lojistikci komutanin grubu daha hizli yuruyur.
    const general = generalOfArmy(game.world.nations[unit.nationId], unit);
    let budget = speedOf(unit) + generalMarchBonus(general);

    while (budget > 0 && canWalk(game, unit)) {
      const next = unit.path[0];
      // Dusman dolu hedef canEnter'a gore kapali olsa da burada muharebeye
      // donusmelidir. Eski sirada yol iki kez hesaplanip sonra sessizce dusuyordu.
      const contested = unitsOn(next).some((other) => (
        other.nationId !== unit.nationId || other.battleId
      ));
      if (contested) {
        const result = stepInto(game, unit, next);
        if (result === 'battle') { moved = true; break; }
        if (result === 'waiting') break;
        if (!reroute(game, unit)) break;
        continue;
      }
      if (!game.canEnterFor(unit)(next)) {
        if (!reroute(game, unit)) break;
        continue;
      }
      // Alt sinir sart: birikmis ilerleme maliyeti asarsa need negatife duser
      // ve butce azalmak yerine buyur — dongu hic bitmez.
      const need = Math.max(0.01, Math.max(0.01, costOf(next)) - unit.progress);
      if (budget < need) {
        unit.progress += budget;
        budget = 0;
        break;
      }
      const result = stepInto(game, unit, next);
      if (result === 'battle') { moved = true; break; }
      if (result === 'waiting') break;
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
