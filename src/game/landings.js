// ÇIKARMA HAREKÂTI (TASARIM.md §11).
//
// Kara sınırı olmayan iki düşman arasında savaş yalnız denizdeydi: generalin
// cephesi düşmanla kara sınırıdır, sınır yoksa grup kendi kıyısını tutar.
// Ölçüldü (NAVY1/NAVY2, 20 yıl): savaşan çiftlerin %28-43'ü kara sınırı
// paylaşmıyor ve bu çiftlerde işgal çift başına 1-3.5 hex (kara sınırlılarda
// 12-13). Çıkarma bu boşluğu doldurur: YZ, düşmanına güç üstünlüğü varsa
// generalinin en sağlam 2-3 tümenini açık denizden (kapalı denizden geçemez,
// navy.closedSeas) savunmasız bir düşman kıyısına yollar. Kıyı başı tutulunca
// yeni bir şey gerekmez: sınır taraması kontrole baktığı için o düşmana bakan
// generalin cephesi kıyı başı olur, grubun gerisi denizden ona katılır.
//
// Savunulan kıyıya çıkılmaz (denizdeki birlik saldıramaz): "onların olmadığı
// yere çık". Oyuncunun ordusuna dokunulmaz.

import { atWar, nationStrength } from './diplomacy.js';
import { BRANCH, officersOf } from './command.js';
import { closedSeas, homeZones, zoneBalance } from './navy.js';
import { orderMove, setDirective } from './movement.js';
import { controllerOf } from './control.js';
import { armyPower, clearPath, unitsOn } from './units.js';
import { nodeNeighbors } from '../world/provinceGraph.js';
import { zoneDistances, zonesOfProvince } from '../world/seaZones.js';

/** Aynı düşmana iki çıkarma denemesi arasındaki en kısa süre (hafta). */
export const LANDING_INTERVAL = 8;
/** İlk dalganın en çok tümen sayısı; ikiden azıyla denenmez. */
export const LANDING_PARTY = 3;
/** Güç eşiği: çıkarma ancak düşmanın bu katı güçteysek. */
export const LANDING_POWER = 1.0;
/** Tümenin en az sağlığı (mevcut payı): yorgun tümen denize binmez. */
const LANDING_FIT = 0.7;
/**
 * Çıkarma yolunun en çok düğüm sayısı. Sınırsızken YZ 47 hex ötedeki kıyıyı
 * seçiyor, öncü önce 11 hafta karada ters yöne yürüyüp sonra okyanusta
 * dolaşıyordu (ölçüldü, iz).
 */
export const LANDING_RANGE = 24;
/**
 * Çıkarma yönergesinin ömrü (hafta). Yol bulunup yürüyüş takılırsa yönerge
 * her hafta yeniden kuruluyor, deneme sayacı hiç dolmuyordu: öncü 10 hafta
 * yerinde sayıyordu. Süre dolunca tümen generaline döner.
 */
export const LANDING_WEEKS = 16;

/** Çıkarma için hazır tümen: karada, kendi toprağımızda, boşta, sağlam. */
function fit(unit, turn) {
  if (!unit || unit.hp <= 0 || unit.battleId || unit.embarked || unit.directive) return false;
  if (unit.type?.domain !== 'land' || (unit.retreatUntil ?? 0) > turn) return false;
  const max = unit.regiments?.reduce((sum, r) => sum + (r.maxStrength ?? 0), 0) ?? 0;
  if (max > 0 && unit.hp / max < LANDING_FIT) return false;
  return controllerOf(unit.tile) === unit.nationId;
}

/** Düşmanın bu düğümün iki adım çevresindeki tümen sayısı. */
function defendersNear(world, center, enemyId) {
  const seen = new Set([center]);
  let frontier = [center];
  let count = 0;
  for (let depth = 0; depth < 2; depth++) {
    const next = [];
    for (const tile of frontier) {
      for (const near of nodeNeighbors(world, tile)) {
        if (seen.has(near) || near.terrain.water) continue;
        seen.add(near);
        next.push(near);
        count += unitsOn(near).filter((unit) => unit.nationId === enemyId).length;
      }
    }
    frontier = next;
  }
  return count;
}

/**
 * Aday kıyılar, iyiden kötüye: düşmanın elindeki, boş, açık bir denize
 * değen kıyı province merkezleri. Puan: yakındaki düşman tümeni −4, şehir +3,
 * başkent +2, denizi bizim tutmamız +2, limanlarımızdan deniz uzaklığı −0.5/adım.
 */
function beaches(world, nation, enemy) {
  const closed = closedSeas(world, nation.id);
  const presence = world.navyState?.presence ?? null;
  const ours = [...homeZones(world, nation.id).keys()];
  const distance = (zoneId) => ours.reduce((best, z) => Math.min(best, zoneDistances(world, z)[zoneId]), Infinity);
  const out = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== enemy.id || !province.coastal || !province.center) continue;
    const center = province.center;
    if (!center.terrain.passable || controllerOf(center) !== enemy.id || unitsOn(center).length) continue;
    const zones = zonesOfProvince(world, province.id).filter(({ zoneId }) => !closed.has(zoneId));
    const near = zones.reduce((best, { zoneId }) => Math.min(best, distance(zoneId)), Infinity);
    if (!Number.isFinite(near)) continue;
    const held = zones.some(({ zoneId }) => presence?.has(zoneId)
      && zoneBalance(world, presence, nation.id, zoneId).control > 0.5);
    const score = -4 * defendersNear(world, center, enemy.id)
      + (center.city ? 3 : 0) + (enemy.capital === center ? 2 : 0) + (held ? 2 : 0) - 0.5 * near;
    out.push({ center, score, id: province.id });
  }
  return out.sort((a, b) => b.score - a.score || a.id - b.id);
}

/** Süresi dolan çıkarma yönergeleri düşer: tümen generaline döner. */
function expireLandings(world, nation, turn) {
  for (const unit of world.units) {
    if (unit.nationId !== nation.id || !unit.directive?.landing) continue;
    if (turn - unit.directive.landing >= LANDING_WEEKS) unit.directive = null;
  }
}

/** Düşmanın toprağında zaten kıyı başımız var mı (kontrol bizde, sahip o). */
function beachheadAgainst(world, nationId, enemyId) {
  for (const province of world.provinces ?? []) {
    if (province.owner !== enemyId || !province.center) continue;
    if (controllerOf(province.center) === nationId) return true;
  }
  return false;
}

/**
 * YZ ulusunun çıkarma kararı (ai.js, dört haftada bir). Döndürür: yola
 * çıkan tümen sayısı.
 */
export function planLandings(game, nation) {
  const world = game.world;
  if (!nation.alive || nation.id === game.turns?.playerNation) return 0;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  expireLandings(world, nation, turn);
  const contacts = world.contacts;
  const enemies = world.nations.filter((other) => other.alive && other.id !== nation.id
    && atWar(world, nation.id, other.id)
    && !(contacts?.[nation.id]?.[other.id] > 0) && !(contacts?.[other.id]?.[nation.id] > 0));
  if (!enemies.length) return 0;
  nation.landings ??= {};
  const myPower = nationStrength(world, nation);
  let sent = 0;
  for (const enemy of enemies) {
    if ((nation.landings[enemy.id] ?? -Infinity) + LANDING_INTERVAL > turn) continue;
    if (myPower < nationStrength(world, enemy) * LANDING_POWER) continue;
    if (beachheadAgainst(world, nation.id, enemy.id)) continue;
    const general = officersOf(nation, BRANCH.ARMY).find((g) => g.target === enemy.id && g.divisions.length);
    if (!general) continue;
    const byId = new Map(world.units.filter((u) => u.nationId === nation.id).map((u) => [u.id, u]));
    const party = general.divisions.map((id) => byId.get(id)).filter((unit) => fit(unit, turn))
      .sort((a, b) => armyPower(b) - armyPower(a) || a.id - b.id).slice(0, LANDING_PARTY);
    if (party.length < 2) continue;
    nation.landings[enemy.id] = turn;
    // İlk tümenin yolu olan ilk aday: yol kapalı denizden geçemez.
    const order = (unit, beach) => {
      setDirective(unit, beach.center);
      unit.directive.landing = turn;
    };
    for (const beach of beaches(world, nation, enemy).slice(0, 4)) {
      if (!orderMove(game, party[0], beach.center)) continue;
      // Uzak kıyı: öncü yola çıkmaz, sıradaki aday denenir.
      if ((party[0].path?.length ?? 0) > LANDING_RANGE) {
        clearPath(party[0]);
        continue;
      }
      order(party[0], beach);
      sent++;
      for (const unit of party.slice(1)) {
        if (orderMove(game, unit, beach.center)) {
          order(unit, beach);
          sent++;
        }
      }
      break;
    }
  }
  return sent;
}
