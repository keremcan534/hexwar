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
import { POLICY_AREAS, POLICY_ORDER } from './policyDefs.js';
import { ensureFleets, fleetsOf, setFleetMission } from './navy.js';

export const ORDER = { AUTO: 'auto', HOLD: 'hold' };

/**
 * FİLO EMRİ — birimin AUTO/HOLD'unun donanmadaki karşılığı (navy.js FİLOLAR).
 * AUTO filoyu amiralliğe bırakır (YZ'nin kuralının ta kendisi), SEA bütün
 * hazır gemilerini bir denize yollar ve orada tutar, PORT limanda yedek
 * bekletir. Ev ödevi testi: emir filo başınadır, gemi başına değil; varsayılan
 * tek filo Auto'dadır, on filo da tek fleetsToAuto ile devredilir.
 */
export const FLEET_ORDER = { AUTO: 'auto', SEA: 'sea', PORT: 'port' };

/**
 * Filoya emir. Kimlik 0, filo listesi henüz kurulmamış ulusun sanal "Home
 * Fleet"idir: ilk emir listeyi kurar. Döner: emri alan filonun kimliği ya da null.
 */
export function setFleetOrder(nation, fleetId, mode, zoneId = null) {
  if (!nation || !Object.values(FLEET_ORDER).includes(mode)) return null;
  ensureFleets(nation);
  const id = fleetId === 0 ? fleetsOf(nation)[0].id : fleetId;
  return setFleetMission(nation, id, mode, zoneId) ? id : null;
}

/** Bütün filolar amiralliğe (Auto). Döner: emri değişen filo sayısı. */
export function fleetsToAuto(nation) {
  let changed = 0;
  for (const fleet of fleetsOf(nation) ?? []) {
    if (fleet.order?.mode === FLEET_ORDER.AUTO) continue;
    if (setFleetMission(nation, fleet.id, FLEET_ORDER.AUTO)) changed++;
  }
  return changed;
}

/**
 * SÜREKLİ POLİTİKA EMRİ. Birimin AUTO/HOLD emrinin ulus düzeyindeki karşılığı:
 * vassal, işgal, kamp ve kaynaşma kararlarını kabineye bırakmak tek anahtardır
 * (ev ödevi testi: kırk vassalda kırk tık olmaz). AUTO, YZ'nin kullandığı
 * `policies.runPolicyAI`'ı oyuncu için çalıştırır; sert uçlar orada kapalıdır.
 */
export function policyOrder(nation, area) {
  return nation?.policies?.orders?.[area] === POLICY_ORDER.AUTO ? POLICY_ORDER.AUTO : POLICY_ORDER.HOLD;
}

export function setPolicyOrder(nation, area, mode) {
  if (!POLICY_AREAS[area] || !Object.values(POLICY_ORDER).includes(mode)) return false;
  const plans = (nation.policies ??= {});
  plans.orders = { ...(plans.orders ?? {}), [area]: mode };
  return true;
}

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
