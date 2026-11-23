// BARIŞTA YABANCI TOPRAKTA TÜMEN DURMAZ.
//
// Kerem: "barışa geçince bir anda askerler başka ülkelerin içinde kalıyor ve
// kurtaramıyorum". Barış canEnterFor'u yabancı toprağa kapatır; içeride kalan
// tümenin ne ilerleyecek ne geri dönecek kapısı kalmaz. Eskiden tek çıkış
// haftanın SONUNDAKİ tarama (turn.withdrawTrespassers) idi ve o da önce
// yürüyüş deniyordu: masada (tur arası) imzalanan barışın tümeni bütün bir
// hafta düşman toprağında, emir alamadan duruyordu; yürüyüşe çıkan tümen de
// hafta sonunda hâlâ oradaydı (ölçüldü: scripts/audit/war-end-audit.mjs).
//
// Kural Vic2'ninkidir: barış orduyu AİT OLDUĞU YERE KOYAR, imza anında. En
// yakın boş kendi düğümü hareket grafında (kara + deniz) aranır, doluysa bir
// sonraki; hepsi doluysa en yakın kendi düğümü (yığın taşar, tümen kaybolmaz).
// Kendi toprağı hiç kalmamış devletin ordusu dağılır (adam ve silah eve döner).
// Denizde, rotası barıştaki bir kıyıda biten tümen eve dönen bir rota alır.
//
// Katman: game. Zar çekmez, yalnız tümenlerin yerini ve emrini yazar.

import { atWar } from './diplomacy.js';
import { controllerOf } from './control.js';
import { hasPassage } from './nationBirth.js';
import { DIP_AI } from './dipDefs.js';
import { clearPath, isMilitia, placeUnit, stackFull, unitsOn } from './units.js';
import { clearDirective, orderMove } from './movement.js';
import { disband } from './recruitment.js';
import { dissolvePeaceBattles, removeFromBattles } from './battles.js';
import { nodeNeighbors } from '../world/provinceGraph.js';

/** Bu tümen barışta bu karede durabilir mi? (sahipsiz, kendi, savaş, geçiş) */
function lawful(world, unit, tile) {
  const holder = controllerOf(tile);
  if (holder < 0 || holder === unit.nationId) return true;
  if (atWar(world, holder, unit.nationId)) return true;
  return DIP_AI.passage && hasPassage(world, holder, unit.nationId);
}

/** Savaşmadığı ve geçişi olmadığı ülkenin karasında duran kara tümeni. */
export function trespasses(world, unit) {
  if (unit?.type?.domain !== 'land' || !unit.tile || unit.tile.terrain.water) return false;
  return !lawful(world, unit, unit.tile);
}

/** Denizdeki tümenin gittiği yer barıştaki bir ülkenin karası mı? */
export function deadCourse(world, unit) {
  if (unit?.type?.domain !== 'land' || !unit.embarked) return false;
  const goal = unit.path?.length ? unit.path[unit.path.length - 1]
    : unit.directive ? world.get(unit.directive.q, unit.directive.r) : null;
  if (!goal || goal.terrain.water) return false;
  return !lawful(world, unit, goal);
}

/** Tümenin konabileceği kendi karası; `room` false ise yığın tavanı aranmaz. */
function homeGround(unit, tile, room) {
  if (tile.terrain.water || !tile.terrain.passable) return false;
  if (controllerOf(tile) !== unit.nationId) return false;
  // Milis yalnız kendi ulusunun SAHİP olduğu toprakta durur (TASARIM D6).
  if (isMilitia(unit) && tile.owner !== unit.nationId) return false;
  if (room && stackFull(tile)) return false;
  return unitsOn(tile).every((other) => other.nationId === unit.nationId);
}

/**
 * Hareket grafında (kara ve deniz düğümleri) genişleyen arama: ilk uygun kendi
 * düğümü. Kuş uçuşu uzaklık (eski kural) dar boğazın öbür yakasındaki kareyi
 * seçebiliyordu; graf mesafesi tümenin gerçekten yakın olduğu yeri verir.
 */
function nearest(world, from, accept, waterOnly = false) {
  const seen = new Set([from]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    for (const near of nodeNeighbors(world, queue[head])) {
      if (seen.has(near)) continue;
      seen.add(near);
      if (accept(near)) return near;
      if (!waterOnly || near.terrain.water) queue.push(near);
    }
  }
  return null;
}

/** Tümeni en yakın kendi düğümüne koyar. Dönüş: 'placed' | 'disbanded'. */
export function sendHome(game, unit) {
  const world = game.world;
  if (unit.battleId) removeFromBattles(world, unit);
  unit.post = null;
  clearDirective(unit);
  clearPath(unit);
  const home = nearest(world, unit.tile, (tile) => homeGround(unit, tile, true))
    ?? nearest(world, unit.tile, (tile) => homeGround(unit, tile, false));
  if (!home) {
    // Toprağı kalmamış devletin ordusu dönecek yer bulamaz: dağılır.
    disband(game, unit);
    return 'disbanded';
  }
  const from = unit.tile;
  placeUnit(unit, home);
  game.renderer?.invalidateTiles?.([from, home], false);
  return 'placed';
}

/**
 * Denizdeki tümenin rotası barıştaki kıyıda bitiyordu: en yakın kendi
 * kıyısına (yalnız deniz üzerinden aranır) döner. Kapalı deniz yüzünden yol
 * kurulamazsa kendi toprağına konur — denizde emirsiz kalmak da bir kilittir.
 */
function sailHome(game, unit) {
  const world = game.world;
  unit.post = null;
  clearDirective(unit);
  clearPath(unit);
  const landing = nearest(world, unit.tile, (tile) => homeGround(unit, tile, true), true);
  if (landing && orderMove(game, unit, landing)) return 'sailing';
  return sendHome(game, unit);
}

/**
 * Bütün dünyanın taraması. Hem barışın imza anında hem haftanın sonunda
 * (değişmez: üçüncü bir tarafın altımızdaki toprağı alması, geçişin bitmesi
 * aynı kapıdan geçer) koşar. Dönen liste: yeri ya da rotası değişen tümenler.
 */
export function withdrawTrespassers(game) {
  const world = game.world;
  const moved = [];
  // Kopya üzerinde: dağılan tümen diziden yerinde silinir.
  for (const unit of [...world.units]) {
    if (trespasses(world, unit)) {
      const holder = controllerOf(unit.tile);
      moved.push({ unit, holder, result: sendHome(game, unit) });
    } else if (deadCourse(world, unit)) {
      const goal = unit.path?.length ? unit.path[unit.path.length - 1] : null;
      moved.push({ unit, holder: goal ? controllerOf(goal) : -1, result: sailHome(game, unit) });
    }
  }
  return moved;
}

/** Barışın imza anı (diplomacy.makePeace): muharebe dağılır, ordular eve. */
export function armiesHomeAfterPeace(game) {
  dissolvePeaceBattles(game);
  return withdrawTrespassers(game);
}
