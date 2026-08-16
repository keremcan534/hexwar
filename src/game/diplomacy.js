// Diplomasi: ülkeler arası savaş/barış durumu.
// Herkesin doğuştan savaşta olması haritayı erken mop-up'a çeviriyordu;
// barış varsayılan, savaş bir karar.

import { DIRS } from '../core/hex.js';
import { armyPower } from './units.js';
import { captureConstructionAt } from './construction.js';
import { controllerOf } from './control.js';

export const WAR = 'war';
export const PEACE = 'peace';

/** Barış görüşmesi için savaşın en az sürmesi gereken tur sayısı. */
export const MIN_WAR_TURNS = 8;

/**
 * Barıştan sonra yeniden savaş ilan edilemeyen tur sayısı. Ateşkes olmadan
 * barış yapıp ertesi tur yeniden saldırmak serbestti; tempoyu bu tutuyor.
 */
export const TRUCE_TURNS = 40;

/**
 * Simetrik ilişki tablosu: world.relations[a][b] ile [b][a] *aynı* nesnedir.
 * Kopyalarsak bir yönü güncelleyip diğerini unutmak mümkün olur.
 */
export function initRelations(world) {
  const n = world.nations.length;
  world.relations = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = { state: PEACE, since: 1 };
      world.relations[a][b] = rec;
      world.relations[b][a] = rec;
    }
  }
}

export function relation(world, a, b) {
  if (a === b) return null;
  return world.relations?.[a]?.[b] ?? null;
}

export function atWar(world, a, b) {
  return relation(world, a, b)?.state === WAR;
}

export function atPeace(world, a, b) {
  return a !== b && !atWar(world, a, b);
}

function setState(world, a, b, state, turn, extra = {}) {
  const rec = { state, since: turn, ...extra };
  world.relations[a][b] = rec;
  world.relations[b][a] = rec;
}

/** Ateşkes sürüyorsa savaş ilan edilemez. */
export function truceLeft(world, a, b, turn) {
  const rec = relation(world, a, b);
  if (!rec || rec.state === WAR) return 0;
  return Math.max(0, (rec.truceUntil ?? 0) - turn);
}

export function declareWar(game, a, b) {
  const world = game.world;
  if (a === b || atWar(world, a, b)) return false;
  if (truceLeft(world, a, b, game.turns.turn) > 0) return false;
  setState(world, a, b, WAR, game.turns.turn);
  // Savaş ilanının anlık harita izi yok (sınır rengi değişmez; işgal
  // taraması ancak kareler el değiştirince başlar) — tam geçersizleme
  // YZ'nin her ilanında tüm önbelleği boşuna yakıyordu.
  if (a === game.turns.playerNation || b === game.turns.playerNation) {
    const other = world.nations[a === game.turns.playerNation ? b : a];
    // Savaş ilanı kendiliğinden kapanmaz (NOTIFY.WAR ttl 0): görülmeden geçmemeli.
    game.turns.addLog(a === game.turns.playerNation
      ? `War declared on ${other.name}.`
      : `${other.name} declared war on us!`, { kind: 'WAR' });
  }
  return true;
}

/** Baris masasi: yalniz karsi taraftan fiilen isgal edilen province'ler devredilir. */
export function settleOccupations(game, a, b) {
  const world = game.world;
  let transferred = 0;
  const changedTiles = [];
  for (const tile of world.tiles) {
    const controller = controllerOf(tile);
    const validTransfer = (tile.owner === a && controller === b)
      || (tile.owner === b && controller === a);
    if (!validTransfer) continue;
    const oldOwner = tile.owner;
    captureConstructionAt(world, tile, controller);
    world.nations[oldOwner].tiles = Math.max(0, world.nations[oldOwner].tiles - 1);
    world.nations[controller].tiles++;
    tile.owner = controller;
    tile.controller = controller;
    tile.heldSince = game.turns.turn;
    if (tile.province) tile.province.control = 25;
    if (tile.city) tile.city.nationId = controller;
    changedTiles.push(tile);
    transferred++;
  }
  // Yalnız el değiştiren kareler mürekkeplenir; küme 512'yi aşarsa
  // invalidateTiles kendisi tam pişirmeye düşer.
  if (changedTiles.length) game.renderer.invalidateTiles(changedTiles);
  return transferred;
}

/**
 * Barisi imzalar. `settle: false` ile cagrildiginda isgalleri otomatik
 * devretmez: toprak degisimini peace.js'teki anlasma belirler (bkz. signPeace).
 */
export function makePeace(game, a, b, options = {}) {
  const world = game.world;
  if (!atWar(world, a, b)) return false;
  const transferred = options.settle === false ? 0 : settleOccupations(game, a, b);
  setState(world, a, b, PEACE, game.turns.turn, {
    truceUntil: game.turns.turn + TRUCE_TURNS,
  });
  // Toprak devri settleOccupations/claimAtPeace içinde nokta geçersizleme
  // ile işaretlendi; barışın kendisinin ayrıca harita izi yok.
  if (a === game.turns.playerNation || b === game.turns.playerNation) {
    const other = world.nations[a === game.turns.playerNation ? b : a];
    // `settle: false` geldiginde toprak devrini anlasma yapar; isgal sayisini
    // burada bildirmek yaniltici olur (her zaman 0 yazardi).
    game.turns.addLog(options.settle === false
      ? `Peace signed with ${other.name}.`
      : `Peace signed with ${other.name}; ${transferred} occupied provinces changed sovereignty.`,
    { kind: 'PEACE' });
  }
  return true;
}

/** Kaba askerî güç: ordu + şehir gücü. Savaş/barış kararlarının ölçütü. */
export function nationStrength(world, nation) {
  let power = 0;
  for (const unit of world.units) {
    if (unit.nationId === nation.id) power += armyPower(unit);
  }
  for (const city of world.cities) {
    if (city.nationId === nation.id) power += 3;
  }
  return power;
}

/**
 * Ülkelerin kaç kareden temas ettiği. Savaş ilanı ancak komşuya yapılır,
 * yoksa YZ haritanın öbür ucundaki ülkeye savaş açıyor.
 */
export function computeContacts(world) {
  const n = world.nations.length;
  const contacts = Array.from({ length: n }, () => new Int32Array(n));
  // world.neighbors kare basina yeni dizi kurar; 15k+ hexlik haftalik tam
  // taramada bu tek basina ~0.8 MB coptu (olculdu). Yon tablosuyla dogrudan
  // gezilir, ziyaret sirasi birebir ayni.
  world.forEach((tile) => {
    if (tile.owner < 0) return;
    for (let d = 0; d < DIRS.length; d++) {
      const nb = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
      if (nb && nb.owner >= 0 && nb.owner !== tile.owner) contacts[tile.owner][nb.owner]++;
    }
  });
  return contacts;
}
