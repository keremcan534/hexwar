// ULUSUN DOĞUŞU — bir halkın topraklarıyla ayrılması (TASARIM D7).
//
// Bırakma eskiden yalnız "kırık province" ve bitişik soydaş devlet varken
// açıktı; brokenSince hiçbir yerde set edilmediği için düğme Ekim başından
// beri ölüydü (ölçüldü: 5 yılda 52/54 çiftin hiçbiri açık değil) ve barış
// şartı LIBERATE varisi olmayan province'leri sessizce atlıyordu (STAT1'de
// yabancı çoğunluklu province'lerin %26'sı). Her halkın dünya üretiminde
// ayrılmış bir uyuyan "Free State" yuvası vardır (nations.js
// appendRebelStates): bırakma HER ZAMAN mümkündür — soydaş komşuya, yoksa
// halkın kendi devletine. Çalışma sırasında yeni ulus nesnesi YARATILMAZ:
// kayıt dünyayı tohumdan kurar ve ulusları kimlikle eşler (yeni bir ulus
// yüklemede çöker, ölçüldü).
//
// Kim ayrılabilir (tek tanım): halkın ÇOĞUNLUK olduğu province'ler, başkent
// province'i hariç. Ana halkın izi yoktur: tek kültürlü devlet bu yolla
// toprak kaybetmez.

import { atWar, makePeace, relation } from './diplomacy.js';
import { addInfamy } from './infamy.js';
import { TIER, announce } from './chronicle.js';
import { disband, recruit } from './recruitment.js';
import { clearPath, placeUnit, stackFull, unitsOn } from './units.js';
import { controllerOf } from './control.js';
import { nodeNeighbors } from '../world/provinceGraph.js';
import { registerLiberationFallback } from './peace.js';
import { MOVEMENT, awaken, raiseRebels, rebelStateOf, transfer } from './movements.js';

const turnOf = (game) => game.turns?.turn ?? game.world.turn ?? 0;
const capitalProvinceOf = (world, nation) => world.provinces?.[nation.capital?.provinceId] ?? null;
const peopleName = (world, id) => world.cultures?.[id]?.name ?? 'a people';

/** Bırakılabilecek province'ler: halkın çoğunluk olduğu, başkent hariç. */
export function releaseProvincesOf(world, nation, cultureId) {
  if (!nation?.alive || cultureId === nation.culture) return [];
  const capital = capitalProvinceOf(world, nation);
  return (world.provinces ?? []).filter((province) => province.owner === nation.id
    && province.econ && province.culture === cultureId && province !== capital);
}

/** Bitişik, yaşayan, bizimle savaşta olmayan soydaş devlet. */
function adjacentKin(world, nation, provinces, cultureId) {
  for (const province of provinces) {
    for (const neighborId of province.neighbors ?? []) {
      const neighbor = world.provinces?.[neighborId];
      if (!neighbor || neighbor.owner < 0 || neighbor.owner === nation.id) continue;
      const other = world.nations[neighbor.owner];
      if (other?.alive && other.culture === cultureId && !atWar(world, other.id, nation.id)) return other;
    }
  }
  return null;
}

/**
 * Mirasçı: bitişik soydaş, yoksa halkın Free State yuvası (uyuyan ya da
 * yaşayan). Dominion yalnız yuvaya gider: soydaş komşu bize bağlı olmaz.
 */
export function heirFor(world, nation, cultureId, { dominion = false } = {}) {
  const provinces = releaseProvincesOf(world, nation, cultureId);
  if (!provinces.length) return null;
  if (!dominion) {
    const kin = adjacentKin(world, nation, provinces, cultureId);
    if (kin) return kin;
  }
  const slot = rebelStateOf(world, cultureId);
  return slot && slot.id !== nation.id ? slot : null;
}

export function releasePeopleBlockers(world, nation, cultureId, options = {}) {
  if (cultureId === nation?.culture) return ['They are our own people.'];
  if (!releaseProvincesOf(world, nation, cultureId).length) {
    return ['They are the majority in none of our provinces.'];
  }
  // Dünya üretimi her halka bir yuva verir (ölçüldü: 0 yuvasız halk); bu
  // engel yalnız bozuk bir kayıt için vardır.
  if (!heirFor(world, nation, cultureId, options)) return ['They have no state to form.'];
  return [];
}

/** Bırakmanın oyuncuya okunan adı (düğme). */
export function releaseLabel(world, nation, cultureId, { dominion = false } = {}) {
  const heir = heirFor(world, nation, cultureId, { dominion });
  if (!heir) return null;
  if (heir.alive && atWar(world, heir.id, nation.id)) return 'Release and make peace';
  if (dominion) return `Release as the Dominion of the ${peopleName(world, cultureId)}`;
  if (heir.archetype !== 'rebel') return `Release to ${heir.name} (their kin)`;
  return heir.alive ? `Release to ${heir.name}` : `Proclaim the Free State of the ${peopleName(world, cultureId)}`;
}

/**
 * KURTARICI GEÇİŞİ (Kerem 2026-10-15: "kopunca askerlerim pocketta kalabilir,
 * bu ülke bana access vermeli"). Savaşın ortasında kopan halkın toprağında
 * eski efendisinin düşmanlarının ordusu durur; yeni devlet onlarla savaşta
 * olmadığı için o kareler kapanıyor, ordu cepte kalıyordu. İttifak değil
 * (yeni devleti savaşa sürüklerdi), vassallık değil: eski efendiyle savaşan
 * her ülkeye o savaş sürdükçe askerî geçiş; savaş bitince 13 hafta içinde
 * çıkılır, kalan tümen en yakın kendi karesine döner (HOI4).
 */
export const PASSAGE_GRACE = 13;

export function grantLiberatorPassage(world, heir, formerOwner) {
  for (const other of world.nations) {
    if (!other.alive || other.id === heir.id || other.id === formerOwner.id) continue;
    if (!atWar(world, other.id, formerOwner.id) || atWar(world, other.id, heir.id)) continue;
    heir.passage ??= {};
    heir.passage[other.id] = { from: formerOwner.id, until: null };
  }
}

/** `grantee` ordusu `granterId` toprağından geçebilir mi? */
export function hasPassage(world, granterId, granteeId, turn = world.turn ?? 0) {
  const entry = world.nations[granterId]?.passage?.[granteeId];
  return Boolean(entry) && (entry.until == null || turn < entry.until);
}

/** Geçiş izni bitince içeride kalan tümen en yakın kendi karesine döner. */
function evict(game, unit) {
  const world = game.world;
  const seen = new Set([unit.tile]);
  const queue = [unit.tile];
  for (let head = 0; head < queue.length && head < 4000; head++) {
    const tile = queue[head];
    if (tile !== unit.tile && controllerOf(tile) === unit.nationId && tile.terrain.passable
      && !stackFull(tile) && !unitsOn(tile).some((other) => other.nationId !== unit.nationId)) {
      unit.order = null;
      unit.post = null;
      clearPath(unit);
      placeUnit(unit, tile);
      return true;
    }
    for (const near of nodeNeighbors(world, tile)) {
      if (seen.has(near)) continue;
      seen.add(near);
      queue.push(near);
    }
  }
  return disband(game, unit);
}

/** Haftalık: biten savaşın geçişi 13 hafta sonra kapanır; kalanlar eve döner. */
export function runPassages(game) {
  const world = game.world;
  const turn = turnOf(game);
  for (const granter of world.nations) {
    if (!granter.passage) continue;
    for (const key of Object.keys(granter.passage)) {
      const entry = granter.passage[key];
      const grantee = world.nations[Number(key)];
      const over = !granter.alive || !grantee?.alive || atWar(world, granter.id, grantee.id)
        || !atWar(world, grantee.id, entry.from);
      if (entry.until == null && over) entry.until = turn + PASSAGE_GRACE;
      if (entry.until != null && turn >= entry.until) {
        delete granter.passage[key];
        if (!grantee?.alive || atWar(world, granter.id, grantee.id)) continue;
        for (const unit of world.units.filter((u) => u.nationId === grantee.id && u.tile
          && u.type?.domain !== 'sea' && controllerOf(u.tile) === granter.id && !u.battleId)) {
          evict(game, unit);
        }
      }
    }
    if (!Object.keys(granter.passage).length) delete granter.passage;
  }
}

/** Yeni doğan devlete bir muhafız: ordusuz devlet ilk hafta elenir (turn.js). */
function guard(game, heir, provinces, awakened) {
  const unit = recruit(game, heir, 'INFANTRY', { source: provinces[0].center, charge: false });
  if (!unit && awakened) raiseRebels(game, heir, provinces.slice(0, 1));
}

/**
 * Halkı topraklarıyla bırakır. Savaş yok: 52 haftalık ateşkes, şöhret düşer
 * (dünya iadeyi hatırlar). Dominion kalıcı barış ve çıktının %7.5'i haraçla
 * bize bağlıdır (econ/bills.js TREATY_SHARE). Halkın devleti bizimle zaten
 * savaştaysa bırakmak o savaşın barışıdır.
 */
export function releasePeople(game, nation, cultureId, { dominion = false } = {}) {
  const world = game.world;
  if (releasePeopleBlockers(world, nation, cultureId, { dominion }).length) return false;
  const turn = turnOf(game);
  const provinces = releaseProvincesOf(world, nation, cultureId);
  const heir = heirFor(world, nation, cultureId, { dominion });
  if (heir.alive && atWar(world, heir.id, nation.id)) makePeace(game, nation.id, heir.id, { settle: false });
  const awakened = !heir.alive;
  transfer(game, nation, heir, provinces);
  if (awakened) awaken(game, heir, provinces, { path: dominion ? 'dominion' : 'release' });
  if (awakened || dominion) guard(game, heir, provinces, awakened);
  grantLiberatorPassage(world, heir, nation);
  if (dominion) {
    heir.treaties = (heir.treaties ?? []).filter((t) => !(t.type === 'VASSALIZE' && t.partner === nation.id));
    heir.treaties.push({ type: 'VASSALIZE', partner: nation.id, since: turn });
  }
  const rec = relation(world, nation.id, heir.id);
  if (rec) rec.truceUntil = Math.max(rec.truceUntil ?? 0, turn + 52);
  addInfamy(nation, -(dominion ? 1 : 2) * provinces.length);
  const state = nation.movements?.[cultureId];
  if (state) {
    state.progress = 0;
    state.trend = 0;
    state.calmUntil = turn + MOVEMENT.COOLDOWN;
  }
  world.cultureReleases = (world.cultureReleases ?? 0) + provinces.length;
  if (nation.id === game.turns?.playerNation) {
    const n = provinces.length;
    announce(game, nation, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `release-${cultureId}-${turn}`,
      title: dominion ? `${heir.fullName ?? heir.name} released as our dominion` : `The ${peopleName(world, cultureId)} go free`,
      detail: `${n} province${n === 1 ? '' : 's'} now answer to ${heir.name}`
        + (dominion ? ', in permanent peace, paying us 7.5% of their output.' : '. The world thinks better of us.'),
      tile: provinces[0].center ?? null,
    });
  }
  game.emit?.('provinces', null);
  return true;
}

// LIBERATE (barış şartı): yaşayan soydaşı olmayan province halkın kendi
// yuvasına gider; yuva aynı çağrıda uyanır (uyuyan yuva tur evreleri ya da
// kayıt arasında toprak tutmaz).
registerLiberationFallback({
  heir(world, province, a, b) {
    const slot = rebelStateOf(world, province.culture);
    if (!slot || slot.id === a || slot.id === b) return -1;
    if (slot.alive && (atWar(world, slot.id, a) || atWar(world, slot.id, b))) return -1;
    return slot.id;
  },
  claim(game, province, heirId, { b }) {
    const world = game.world;
    const heir = world.nations[heirId];
    const loser = world.nations[b];
    if (!heir || !loser) return false;
    const awakened = !heir.alive;
    transfer(game, loser, heir, [province]);
    if (awakened) {
      awaken(game, heir, [province], { path: 'war' });
      guard(game, heir, [province], true);
    }
    return true;
  },
});
