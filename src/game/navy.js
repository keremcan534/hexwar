// DONANMA — deniz hâkimiyeti (TASARIM.md §11).
//
// Gemi haritada sürülen birim DEĞİLDİR. Eski modelde (ölçüldü 2026-10-12,
// 160×96, 2 tohum × 45 yıl) bütün dünyada 12-18 savaş gemisi vardı, filolar
// haftada 0.01 hex kıpırdıyordu, muharebe kazanan gemi kara hexine
// yerleşebiliyordu (bir dünyada 5 gemiden biri 30 yıl karada oturdu), abluka
// kıyılı savaş haftalarının ~%2'sindeydi ve ordular her an 20-80 alayla denizi
// bedavaya geçiyordu. Şimdi ulusun filosu bir HAVUZDUR: oyuncu deniz
// bölgelerine öncelik verir (üretim hatlarıyla aynı kademeler), amirallik
// gemileri önceliğe göre böler, gemiler bölgeye kendileri gider (bölge
// grafında iki adım bir hafta). Her bölgenin tek sayısı HÂKİMİYETTİR; abluka,
// denizdeki ordunun kaybı ve muharebe ondan okunur.
//
// Haftalık sıra (turn.js 'navy' fazı, yürüyüşten sonra ekonomiden önce):
// ölü ulusun gemileri → öncelik ve dağıtım → varış → amiraller → muharebe →
// hâkimiyet ve abluka → denizdeki ordular → onarım. Zar ayrı akıştan çekilir
// (`${seed}-navy-${tur}`): donanma dünyanın geri kalanının zar dizisini
// kaydırmaz.

import { makeRng } from '../core/rng.js';
import { UNIT_EQUIPMENT } from './econ/defs.js';
import { LINE_PRIORITIES, equipmentStock, linePriorityOf } from './econ/industry.js';
import { mod } from './modifiers.js';
import { atWar } from './diplomacy.js';
import { isAllied } from './alliances.js';
import { BRANCH, addExperience, generalModifier, officersOf } from './command.js';
import { applyArmyLosses, soldiersOf } from './units.js';
import { releaseDraw } from './levy.js';
import {
  seaZonesOf, zoneDistances, zonesOfProvince,
} from '../world/seaZones.js';

/** Öncelik kademeleri üretim hatlarıyla aynıdır: oyuncu tek dil öğrenir. */
export const NAVY_PRIORITIES = LINE_PRIORITIES;
/** Klavye ve düğme sırası. */
export const NAVY_STEPS = ['auto', ...LINE_PRIORITIES.map((level) => level.id)];

/** Limanda haftalık onarım (sağlık payı); tersanesiz ülke yarı hızda. */
export const REPAIR_PER_WEEK = 0.05;
/** Bu sağlığın altına düşen gemi limana döner; şu sağlıkta yeniden çıkar. */
export const RETURN_BELOW = 0.4;
export const RESUME_AT = 0.85;
/**
 * Muharebe: tarafın verdiği hasar = sağlığı × nitelik oranı × bu × zar
 * (gemi-sağlık birimi). 0.5: denk iki filo muharebe başına ~1-2 gemi yitirir.
 */
export const BATTLE_DAMAGE = 0.5;
/** Hasar parça parça dağılır: parça başına bir geminin sağlığından düşen. */
const SHOT = 0.2;
/**
 * Yenilen filo bölgeden çekilir; bu kadar hafta geri gelmez. 3 haftayken
 * aynı denizi paylaşan iki filo her ay yeniden çarpışıyordu (ölçüldü, 2 tohum
 * × 45 yıl: ~1.180 muharebe, ~1.100 batan gemi; tek ülke 161 gemi yitirdi).
 */
export const WITHDRAW_WEEKS = 6;
/**
 * FLEET IN BEING: güçler oranı bunun altındaysa zayıf filo çatışmaya
 * girmez, limana çekilir ve denizi bırakır. Gerçek deniz savaşlarının çoğu
 * böyledir: zayıf filo limanda kalır, güçlüsü ablukayı kurar; kesin
 * muharebe ancak denk filolar arasında olur.
 */
export const EVADE_RATIO = 0.5;
/** İç sular: kendi kıyısına değen bölgede filo güçlüdür (üs, kıyı topçusu). */
export const HOME_WATERS = 0.2;
/** Abluka için düşman kıyısının province başına istenen filo gücü. */
export const BLOCKADE_COVER = 0.6;
/**
 * Düşmanın tam tuttuğu denizde bindirilmiş ordunun haftalık kaybı; yalnız
 * düşman denizi gerçekten tutuyorsa (payı TRANSPORT_HOLD üstü). %20'yken
 * 45 yılda 20-27 milyon asker denizde ölüyordu (YZ riski bilmeden geçiyor):
 * Büyük Savaş'ın bütün ölüsünün iki katı.
 */
export const TRANSPORT_LOSS = 0.04;
export const TRANSPORT_HOLD = 0.5;
/** Yol: bölge grafında bu kadar adım bir hafta sürer. */
export const ZONES_PER_WEEK = 2;
/** Muharebe raporu bu kadar hafta ekranda kalır. */
const REPORT_WEEKS = 26;
/** Diplomatik güç: gemi başına (eski WARSHIP birimiyle aynı ağırlık). */
export const SHIP_POWER = 6;

const SHIP_NAMES = [
  'Resolute', 'Vigilant', 'Dauntless', 'Indomitable', 'Invincible', 'Thunderer', 'Defiance',
  'Valiant', 'Intrepid', 'Formidable', 'Majestic', 'Victorious', 'Implacable', 'Relentless',
  'Sovereign', 'Audacious', 'Courageous', 'Glorious', 'Illustrious', 'Triumph', 'Superb',
  'Swiftsure', 'Tenacious', 'Steadfast', 'Fearless', 'Gallant', 'Redoubtable', 'Colossus',
  'Monarch', 'Conqueror', 'Orion', 'Neptune', 'Vanguard', 'Ajax', 'Agincourt', 'Revenge',
];

// ------------------------------------------------------------------ DURUM ---

export function ensureNavy(nation) {
  const navy = nation.navy ??= { ships: [], zones: {}, nextId: 1 };
  if (!Array.isArray(navy.ships)) navy.ships = [];
  navy.zones ??= {};
  if (!Number.isFinite(navy.nextId)) navy.nextId = 1;
  return navy;
}

export function shipsOf(nation) {
  return nation?.navy?.ships ?? [];
}

/** Dünyanın türetilmiş deniz durumu: hafta hafta yeniden kurulur, kayda girmez. */
function ensureNavyState(world) {
  world.navyState ??= { presence: new Map(), blockade: [], reports: [], losses: [] };
  return world.navyState;
}

export function navyState(world) {
  return world.navyState ?? null;
}

/**
 * Yeni gemi: eğitim kuyruğundan (recruitment.recruit) ya da kuruluştan gelir.
 * Mürettebat nüfustan çekilmiştir (`draws`); gemi batarsa onlar da ölür.
 */
export function commissionShip(world, nation, { home, hp = 1, draws = [], turn = 0 }) {
  const navy = ensureNavy(nation);
  const id = navy.nextId++;
  const ship = {
    id,
    name: shipName(world, nation, id),
    hp: Math.max(0.1, Math.min(1, hp)),
    built: turn,
    home,
    zone: -1,
    at: -1,
    eta: turn,
    repairing: hp < RESUME_AT,
    draws,
  };
  navy.ships.push(ship);
  return ship;
}

function shipName(world, nation, id) {
  const rng = makeRng(`${world.seed}-ship-${nation.id}-${id}`);
  const own = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.name);
  const base = own.length && rng() < 0.45 ? rng.pick(own).name : rng.pick(SHIP_NAMES);
  const taken = new Set(shipsOf(nation).map((ship) => ship.name));
  if (!taken.has(base)) return base;
  for (const suffix of ['II', 'III', 'IV', 'V', 'VI']) {
    if (!taken.has(`${base} ${suffix}`)) return `${base} ${suffix}`;
  }
  return `${base} ${id}`;
}

/** Gemi batar: mürettebat ölür, nüfustan düşer. */
function sinkShip(world, nation, ship) {
  for (const draw of ship.draws ?? []) releaseDraw(world, nation.id, draw, draw.men ?? 0, true);
  ship.draws = [];
  nation.navy.ships = nation.navy.ships.filter((other) => other !== ship);
  nation.shipsLost = (nation.shipsLost ?? 0) + 1;
}

/** Ölen ya da kıyısız kalan ulusun gemisi dağılır: mürettebat eve döner. */
function scrapNavy(world, nation) {
  for (const ship of shipsOf(nation)) {
    for (const draw of ship.draws ?? []) releaseDraw(world, nation.id, draw, draw.men ?? 0);
  }
  if (nation.navy) nation.navy.ships = [];
}

// --------------------------------------------------------------- ÖNCELİK ---

/** Bölgenin öncelik kaydı: {mode, weight}. Kayıt yoksa Auto. */
export function zonePriority(nation, zoneId) {
  const entry = nation?.navy?.zones?.[zoneId];
  return entry?.mode === 'manual'
    ? { mode: 'manual', weight: entry.weight ?? 0 }
    : { mode: 'auto', weight: null };
}

/** Oyuncunun seçimi: 'auto' ya da LINE_PRIORITIES kimliği. */
export function setZonePriority(nation, zoneId, priority) {
  const navy = ensureNavy(nation);
  if (priority === 'auto') {
    delete navy.zones[zoneId];
    return true;
  }
  const level = LINE_PRIORITIES.find((p) => p.id === priority);
  if (!level) return false;
  navy.zones[zoneId] = { mode: 'manual', weight: level.weight };
  return true;
}

/** Bütün elle seçimleri Auto'ya döndürür. */
export function resetZonePriorities(nation) {
  ensureNavy(nation).zones = {};
}

/**
 * Ulusun kıyısının değdiği bölgeler: bölge → kıyı kenarı (province başına
 * toplam). İç sular budur.
 */
export function homeZones(world, nationId) {
  const out = new Map();
  for (const province of world.provinces ?? []) {
    if (province.owner !== nationId || !province.coastal) continue;
    for (const { zoneId, edges } of zonesOfProvince(world, province.id)) {
      out.set(zoneId, (out.get(zoneId) ?? 0) + edges);
    }
  }
  return out;
}

/** Ulusun bir bölgeye değen kıyı province sayısı (abluka kapsamı). */
function coastProvincesIn(world, nationId, zone) {
  let count = 0;
  for (const { provinceId } of zone.coast) {
    if (world.provinces?.[provinceId]?.owner === nationId) count++;
  }
  return count;
}

/** Limanda bekleyen gemi: onarımda ya da yenilip çekilmiş (hold haftasına dek). */
export function docked(ship, turn) {
  return ship.repairing || (ship.hold ?? 0) > turn;
}

/**
 * Filonun toplam savaş gücü (teknolojiyle). YZ cesaret ölçüsü ve diplomasi.
 * `turn` verilirse yalnız denize çıkabilen gemiler sayılır.
 */
export function fleetStrength(nation, turn = null) {
  const naval = Math.max(0.3, 1 + mod(nation, 'naval'));
  return shipsOf(nation).reduce((sum, ship) => (
    turn != null && docked(ship, turn) ? sum : sum + ship.hp
  ), 0) * naval;
}

/**
 * Düşmanın bulunduğu denize YZ ancak hazır filosunun bu payı oradaki düşmanı
 * geçiyorsa girer; geçmiyorsa filo limanda kalır (fleet in being) ve ancak
 * tersane açığı kapatınca döner. Eskiden "düşman iki kat güçlü değilse git"
 * kuralıyla yenilen filo her altı haftada aynı denize dönüyordu (ölçüldü:
 * 15 yılda tekrar eden muharebelerin yarısı tam altı hafta arayla).
 */
export const CONTEST_RATIO = 0.75;

/**
 * OTOMATİK AMİRALLİK. YZ ve oyuncunun Auto bölgeleri aynı kural.
 * Barışta iç sular (en geniş kıyı Normal, ötekiler Low). Savaşta filo
 * TOPLANIR: yalnız en geniş iç su Normal kalır, düşmanla paylaşılan iç sular
 * High, filomuz yetiyorsa düşman kıyısı Normal (abluka); düşman gemisinin
 * olduğu deniz CONTEST_RATIO ile ya High ya hiç. Barıştaki dağınık düzen
 * savaşta bir-iki gemilik çatışmalar doğuruyordu (ölçüldü: muharebelerin
 * %93'ü toplam 2-3 gemi). Ulaşılamayan bölge (başka su kütlesi) yok.
 */
export function autoZoneWeights(world, nation, presence = null) {
  const out = new Map();
  const home = homeZones(world, nation.id);
  if (!home.size) return out;
  const sorted = [...home.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const enemies = (world.nations ?? []).filter((other) => other.alive
    && other.id !== nation.id && atWar(world, nation.id, other.id));
  sorted.forEach(([zoneId], index) => {
    if (index === 0) out.set(zoneId, 3);
    else if (!enemies.length) out.set(zoneId, 1);
  });
  if (!enemies.length) return out;
  const turn = world.turn ?? 0;
  const ours = fleetStrength(nation, turn);
  const reach = reachableZones(world, home);
  for (const enemy of enemies) {
    const confident = ours > 0 && ours >= fleetStrength(enemy, turn) * 0.8;
    for (const [zoneId] of homeZones(world, enemy.id)) {
      if (!reach.has(zoneId) || (reach.get(zoneId) ?? 99) > 4) continue;
      if (home.has(zoneId)) out.set(zoneId, 6);
      else if (confident) out.set(zoneId, Math.max(out.get(zoneId) ?? 0, 3));
    }
  }
  if (!presence) return out;
  for (const zoneId of new Set([...home.keys(), ...out.keys()])) {
    const there = zoneBalance(world, presence, nation.id, zoneId).hostile;
    if (there <= 0) continue;
    out.set(zoneId, ours * CONTEST_RATIO >= there ? 6 : 0);
  }
  return out;
}

/** İç sulardan bölge grafında ulaşılabilen bölgeler → en kısa adım. */
function reachableZones(world, home) {
  const out = new Map();
  for (const [zoneId] of home) {
    const distances = zoneDistances(world, zoneId);
    distances.forEach((d, id) => {
      if (Number.isFinite(d) && d < (out.get(id) ?? Infinity)) out.set(id, d);
    });
  }
  return out;
}

/**
 * Auto filoyu en az bu kadar gemilik kollar hâlinde tutar: N hazır gemi en
 * çok N/3 denizi tutar (en az bir). Dağınık düzende savaşan iki donanma
 * denizlere birer gemi serpiyor, "muharebe"lerin %93'ü toplam 2-3 gemilik
 * çatışma oluyordu (ölçüldü, 2 tohum × 15 yıl). Elle seçilen deniz kolu sayılır
 * ama kuralın dışındadır: oyuncunun tercihi bölünmez.
 */
export const SQUADRON = 3;

function readyCount(nation, turn) {
  return shipsOf(nation).filter((ship) => !docked(ship, turn) && ship.hp >= RETURN_BELOW).length;
}

/** Bölgelerin etkin ağırlığı: elle seçilen kalır, gerisi otomatik. */
export function zoneWeights(world, nation, presence = null, override = null) {
  const auto = autoZoneWeights(world, nation, presence);
  const manual = new Map();
  for (const [key, entry] of Object.entries(nation?.navy?.zones ?? {})) {
    if (entry?.mode === 'manual') manual.set(Number(key), entry.weight ?? 0);
  }
  if (override) for (const [zoneId, weight] of Object.entries(override)) manual.set(Number(zoneId), weight);
  // Ulaşılamayan bölgeye gemi gönderilmez (başka su kütlesi).
  const reach = reachableZones(world, homeZones(world, nation.id));
  const home = homeZones(world, nation.id);
  const used = [...manual].filter(([zoneId, weight]) => weight > 0 && reach.has(zoneId)).length;
  const slots = Math.max(0, Math.max(1, Math.floor(readyCount(nation, world.turn ?? 0) / SQUADRON)) - used);
  const ranked = [...auto].filter(([zoneId, weight]) => weight > 0 && !manual.has(zoneId) && reach.has(zoneId))
    .sort((a, b) => b[1] - a[1] || (home.get(b[0]) ?? 0) - (home.get(a[0]) ?? 0) || a[0] - b[0]);
  const out = new Map();
  for (const [zoneId, weight] of auto) if (!manual.has(zoneId) && reach.has(zoneId)) out.set(zoneId, weight);
  ranked.forEach(([zoneId], index) => { if (index >= slots) out.set(zoneId, 0); });
  for (const [zoneId, weight] of manual) if (reach.has(zoneId)) out.set(zoneId, weight);
  return out;
}

/**
 * Hazır gemilerin bölgelere hedef sayısı (en büyük kalan yöntemi). Önizleme
 * de bunu çağırır (`override`): ekran oyunla ayrışamaz.
 */
export function navyTargets(world, nation, presence = null, override = null) {
  const ready = readyCount(nation, world.turn ?? 0);
  const weights = [...zoneWeights(world, nation, presence, override).entries()]
    .filter(([, weight]) => weight > 0).sort((a, b) => a[0] - b[0]);
  const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
  const targets = new Map();
  if (!ready || total <= 0) return { targets, ready, weights: new Map(weights) };
  let given = 0;
  const rest = [];
  for (const [zoneId, weight] of weights) {
    const quota = ready * weight / total;
    const whole = Math.floor(quota);
    targets.set(zoneId, whole);
    given += whole;
    rest.push({ zoneId, weight, left: quota - whole });
  }
  rest.sort((a, b) => b.left - a.left || b.weight - a.weight || a.zoneId - b.zoneId);
  for (let i = 0; given < ready && i < rest.length; i++, given++) {
    targets.set(rest[i].zoneId, targets.get(rest[i].zoneId) + 1);
  }
  return { targets, ready, weights: new Map(weights) };
}

// ------------------------------------------------------------- DAĞITIM ---

/** Geminin limanının bölgesi (limanı kaybedildiyse ulusun ilk kıyısı). */
function homeZoneOf(world, nation, ship) {
  const province = world.provinces?.[ship.home];
  if (!province || province.owner !== nation.id || !province.coastal) {
    const fallback = (world.provinces ?? []).find((p) => p.owner === nation.id && p.coastal
      && zonesOfProvince(world, p.id).length);
    ship.home = fallback?.id ?? -1;
  }
  // Göl kıyısındaki liman denize açılmaz: limanın en büyük suyu esas alınır.
  const zones = seaZonesOf(world).zones;
  return zonesOfProvince(world, ship.home)
    .reduce((best, row) => (best < 0 || zones[row.zoneId].size > zones[best].size ? row.zoneId : best), -1);
}

function travelWeeks(world, from, to) {
  if (from < 0 || to < 0) return 1;
  const d = zoneDistances(world, from)[to];
  return Number.isFinite(d) ? 1 + Math.floor(d / ZONES_PER_WEEK) : Infinity;
}

/**
 * Geminin bölgeye yolu. Limandaki gemi ulusun EN YAKIN limanından çıkar
 * (filo bir üsse bağlı değildir); denizdeki gemi bulunduğu yerden gider,
 * oradan yol yoksa (başka su kütlesi) önce limana döner.
 */
function shipTravel(world, nation, ship, to, home) {
  const from = ship.at >= 0 ? ship.at : ship.zone;
  if (from >= 0) {
    const direct = travelWeeks(world, from, to);
    if (Number.isFinite(direct)) return direct;
  }
  let best = Infinity;
  for (const [zoneId] of home) best = Math.min(best, travelWeeks(world, zoneId, to));
  return from >= 0 && Number.isFinite(best) ? best + 1 : best;
}

function sendHome(world, nation, ship, turn) {
  if (ship.zone < 0 && ship.at < 0) return;
  const from = ship.at >= 0 ? ship.at : ship.zone;
  ship.zone = -1;
  ship.at = -1;
  const weeks = travelWeeks(world, from, homeZoneOf(world, nation, ship));
  ship.eta = turn + (Number.isFinite(weeks) ? weeks : 1);
}

function allocate(world, nation, turn, presence) {
  const ships = shipsOf(nation);
  const home = homeZones(world, nation.id);
  for (const ship of ships) {
    if (!ship.repairing && ship.hp < RETURN_BELOW) ship.repairing = true;
    if (docked(ship, turn)) sendHome(world, nation, ship, turn);
  }
  const { targets } = navyTargets(world, nation, presence);
  const ready = ships.filter((ship) => !docked(ship, turn));
  const count = new Map();
  const free = [];
  // Yerinde kalan kalır: kotası dolu bölgenin fazlası serbest bırakılır.
  for (const ship of [...ready].sort((a, b) => b.hp - a.hp || a.id - b.id)) {
    const want = targets.get(ship.zone) ?? 0;
    if (ship.zone >= 0 && (count.get(ship.zone) ?? 0) < want) {
      count.set(ship.zone, (count.get(ship.zone) ?? 0) + 1);
    } else {
      free.push(ship);
    }
  }
  const deficits = [...targets.entries()]
    .filter(([zoneId, want]) => want > (count.get(zoneId) ?? 0))
    .sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [zoneId, want] of deficits) {
    let missing = want - (count.get(zoneId) ?? 0);
    while (missing > 0 && free.length) {
      let best = 0;
      let bestWeeks = Infinity;
      free.forEach((ship, index) => {
        const weeks = shipTravel(world, nation, ship, zoneId, home);
        if (weeks < bestWeeks || (weeks === bestWeeks && ship.id < free[best].id)) {
          best = index;
          bestWeeks = weeks;
        }
      });
      const [ship] = free.splice(best, 1);
      if (!Number.isFinite(bestWeeks)) continue;
      if (ship.zone !== zoneId || ship.at !== zoneId) {
        const travel = ship.at === zoneId ? 0 : bestWeeks;
        ship.zone = zoneId;
        if (travel > 0) {
          ship.at = -1;
          ship.eta = turn + travel;
        }
      }
      missing--;
    }
  }
  for (const ship of free) sendHome(world, nation, ship, turn);
}

// -------------------------------------------------------- GÜÇ TABLOSU ---

/** Geminin bölgedeki gücü: sağlık × teknoloji × iç sular × amiral. */
function shipStrength(nation, ship, home, admiral) {
  const naval = Math.max(0.3, 1 + mod(nation, 'naval'));
  return ship.hp * naval * (home ? 1 + HOME_WATERS : 1)
    * generalModifier(admiral, { defending: home });
}

function assignAdmirals(nation) {
  const admirals = officersOf(nation, BRANCH.NAVY)
    .sort((a, b) => b.skill - a.skill || a.id - b.id);
  const counts = new Map();
  for (const ship of shipsOf(nation)) if (ship.at >= 0) counts.set(ship.at, (counts.get(ship.at) ?? 0) + 1);
  const zones = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([zoneId]) => zoneId);
  admirals.forEach((admiral, index) => { admiral.seaZone = zones[index] ?? null; });
  return new Map(admirals.filter((a) => a.seaZone != null).map((a) => [a.seaZone, a]));
}

/** Bölge → ulus → {strength, ships}. Yalnız varmış (at ≥ 0) gemiler. */
function buildPresence(world) {
  const presence = new Map();
  for (const nation of world.nations ?? []) {
    if (!nation.alive || !shipsOf(nation).length) continue;
    const admirals = assignAdmirals(nation);
    const home = homeZones(world, nation.id);
    for (const ship of shipsOf(nation)) {
      if (ship.at < 0) continue;
      if (!presence.has(ship.at)) presence.set(ship.at, new Map());
      const zone = presence.get(ship.at);
      if (!zone.has(nation.id)) zone.set(nation.id, { strength: 0, ships: [], admiral: admirals.get(ship.at) ?? null });
      const entry = zone.get(nation.id);
      entry.strength += shipStrength(nation, ship, home.has(ship.at), entry.admiral);
      entry.ships.push(ship);
    }
  }
  return presence;
}

/**
 * Bir ulusun bölgedeki dost (kendisi + müttefikleri) ve düşman (savaştığı)
 * gücü. Hâkimiyet `friendly / (friendly + hostile)`.
 */
export function zoneBalance(world, presence, nationId, zoneId) {
  const zone = presence?.get(zoneId);
  let friendly = 0;
  let hostile = 0;
  if (!zone) return { friendly, hostile, control: 0 };
  const nation = world.nations[nationId];
  for (const [otherId, entry] of zone) {
    if (otherId === nationId || isAllied(nation, otherId)) friendly += entry.strength;
    else if (atWar(world, nationId, otherId)) hostile += entry.strength;
  }
  const control = friendly + hostile > 0 ? friendly / (friendly + hostile) : 0;
  return { friendly, hostile, control };
}

const NO_SEAS = new Set();

/**
 * Düşmanın tuttuğu denizler (payı TRANSPORT_HOLD üstü): ordu oraya binemez,
 * başka bir bölgeden de geçemez. Yalnız zaten o denizdeki ordu içinde yürüyüp
 * kıyıya çıkabilir (game.canEnterFor). Kayıp tek başına yetmiyordu: YZ riski
 * bilmeden geçiyor, 45 yılda 12 milyon asker denizde ölüyordu (ölçüldü).
 * Hâkimiyet tablosundan ulus başına haftada bir kurulur.
 */
export function closedSeas(world, nationId) {
  const state = world.navyState;
  if (!state?.presence?.size || nationId == null || nationId < 0) return NO_SEAS;
  state.closed ??= new Map();
  let closed = state.closed.get(nationId);
  if (closed) return closed;
  closed = new Set();
  for (const zoneId of state.presence.keys()) {
    const { friendly, hostile } = zoneBalance(world, state.presence, nationId, zoneId);
    if (hostile > 0 && hostile / (hostile + friendly) > TRANSPORT_HOLD) closed.add(zoneId);
  }
  state.closed.set(nationId, closed);
  return closed;
}

/** Düşmanın bu kıyıya uyguladığı abluka (0-1): hâkimiyet payı × kapsam. */
function blockadeShare(world, presence, nationId, zone) {
  const { friendly, hostile } = zoneBalance(world, presence, nationId, zone.id);
  if (hostile <= 0) return 0;
  const cover = Math.min(1, hostile / (BLOCKADE_COVER * Math.max(1, coastProvincesIn(world, nationId, zone))));
  return hostile / (hostile + friendly) * cover;
}

function computeBlockade(world, presence) {
  const blockade = new Array(world.nations.length).fill(0);
  const coastal = new Array(world.nations.length).fill(0);
  const zones = seaZonesOf(world).zones;
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.coastal) continue;
    coastal[province.owner]++;
    let best = 0;
    for (const { zoneId } of zonesOfProvince(world, province.id)) {
      if (!presence.has(zoneId)) continue;
      best = Math.max(best, blockadeShare(world, presence, province.owner, zones[zoneId]));
    }
    blockade[province.owner] += best;
  }
  return blockade.map((sum, id) => (coastal[id] ? sum / coastal[id] : 0));
}

// ----------------------------------------------------------- MUHAREBE ---

function applyDamage(entries, damage, rng) {
  let left = damage;
  while (left > 1e-9) {
    const alive = entries.filter((entry) => entry.ship.hp > 0);
    if (!alive.length) break;
    const target = alive[Math.floor(rng() * alive.length)];
    const shot = Math.min(SHOT, left);
    target.ship.hp = Math.max(0, target.ship.hp - shot);
    left -= shot;
  }
}

function sideOf(world, presence, zone, nationIds) {
  const entries = [];
  let strength = 0;
  const admirals = [];
  for (const id of nationIds) {
    const entry = presence.get(zone.id).get(id);
    strength += entry.strength;
    if (entry.admiral) admirals.push(entry.admiral);
    for (const ship of entry.ships) entries.push({ nationId: id, ship, hp: ship.hp });
  }
  return { nationIds, entries, strength, admirals };
}

function fight(game, zone, presence, friendIds, hostileIds, rng, turn) {
  const world = game.world;
  const sides = [sideOf(world, presence, zone, friendIds), sideOf(world, presence, zone, hostileIds)];
  const [a, b] = sides;
  // Hasar = karşı tarafın SAĞLIĞI × nitelik oranı. Nitelik (güç ÷ sağlık:
  // teknoloji, amiral, iç sular) kimin kazanacağını söyler, dönemin
  // ölümcüllüğünü değil. Güçle orantılıyken bütün dünyanın deniz teknolojisi
  // 1940'a dek ~2.5 katına çıkıyor, sağlık sabit kaldığından muharebe başına
  // batan gemi 2'den 3.4'e tırmanıyordu (ölçüldü, 2 tohum × 45 yıl).
  const hp = (side) => side.entries.reduce((sum, entry) => sum + entry.hp, 0);
  const hpA = hp(a);
  const hpB = hp(b);
  const quality = (a.strength / Math.max(1e-9, hpA)) / Math.max(1e-9, b.strength / Math.max(1e-9, hpB));
  const damageToB = BATTLE_DAMAGE * hpA * quality * (0.75 + rng() * 0.5);
  const damageToA = BATTLE_DAMAGE * hpB / quality * (0.75 + rng() * 0.5);
  applyDamage(b.entries, damageToB, rng);
  applyDamage(a.entries, damageToA, rng);
  const report = {
    turn,
    zone: zone.id,
    name: `Battle of ${zone.place ?? zone.name}`,
    sides: sides.map((side) => ({
      nations: side.nationIds,
      ships: side.entries.length,
      sunk: [],
      damaged: 0,
      before: side.strength,
      after: 0,
    })),
    winner: 0,
  };
  sides.forEach((side, index) => {
    const row = report.sides[index];
    let hpBefore = 0;
    let hpAfter = 0;
    for (const entry of side.entries) {
      hpBefore += entry.hp;
      const nation = world.nations[entry.nationId];
      if (entry.ship.hp <= 0.02) {
        row.sunk.push({ nation: entry.nationId, name: entry.ship.name });
        sinkShip(world, nation, entry.ship);
      } else {
        if (entry.ship.hp < entry.hp) row.damaged++;
        hpAfter += entry.ship.hp;
      }
    }
    // Güç sağlıkla doğru orantılıdır: kalan güç = önceki × kalan sağlık payı.
    row.after = side.strength * hpAfter / Math.max(1e-9, hpBefore);
  });
  report.winner = report.sides[0].after >= report.sides[1].after ? 0 : 1;
  // Yenilen taraf bölgeden çekilir; ağır yaralı gemi her iki tarafta limana döner.
  sides.forEach((side, index) => {
    for (const entry of side.entries) {
      if (entry.ship.hp <= 0.02) continue;
      const nation = world.nations[entry.nationId];
      if (entry.ship.hp < RETURN_BELOW) {
        entry.ship.repairing = true;
        sendHome(world, nation, entry.ship, turn);
      }
    }
    if (index !== report.winner) withdraw(world, side.nationIds, zone.id, turn);
    const enemySunk = report.sides[1 - index].sunk.length;
    for (const admiral of side.admirals) addExperience(admiral, 8 + 6 * enemySunk);
  });
  return report;
}

/**
 * Yenilen ya da kaçınan ulusların o denize atanmış BÜTÜN gemileri (yoldakiler
 * dahil) limana döner ve WITHDRAW_WEEKS orada kalır (onarılır). Yalnız
 * muharebedekiler dönünce yoldaki gemiler ertesi hafta tek tek gelip yeniden
 * çarpışıyordu (ölçüldü: aynı denizde tekrar eden muharebelerin yarısı altı
 * haftadan kısa arayla, neredeyse hepsi toplam 2-3 gemi).
 */
function withdraw(world, nationIds, zoneId, turn) {
  for (const id of nationIds) {
    const nation = world.nations[id];
    for (const ship of shipsOf(nation)) {
      if (ship.zone !== zoneId && ship.at !== zoneId) continue;
      ship.hold = Math.max(ship.hold ?? 0, turn + WITHDRAW_WEEKS);
      sendHome(world, nation, ship, turn);
    }
  }
}

function resolveBattles(game, presence, rng, turn) {
  const world = game.world;
  const zones = seaZonesOf(world).zones;
  const reports = [];
  for (const zoneId of [...presence.keys()].sort((a, b) => a - b)) {
    const present = presence.get(zoneId);
    if (present.size < 2) continue;
    const engaged = new Set();
    const order = [...present.keys()]
      .sort((x, y) => present.get(y).strength - present.get(x).strength || x - y);
    for (const first of order) {
      if (engaged.has(first)) continue;
      const hostile = order.filter((other) => other !== first && !engaged.has(other)
        && atWar(world, first, other));
      if (!hostile.length) continue;
      const friends = order.filter((other) => other !== first && !engaged.has(other)
        && !hostile.includes(other) && !atWar(world, first, other)
        && hostile.some((enemy) => atWar(world, other, enemy)));
      const side = [first, ...friends];
      for (const id of [...side, ...hostile]) engaged.add(id);
      const strength = (ids) => ids.reduce((sum, id) => sum + present.get(id).strength, 0);
      const a = strength(side);
      const b = strength(hostile);
      if (Math.min(a, b) < EVADE_RATIO * Math.max(a, b)) {
        // Zayıf taraf çatışmaya girmez: limana çekilir, deniz güçlünündür.
        withdraw(world, a < b ? side : hostile, zoneId, turn);
        continue;
      }
      reports.push(fight(game, zones[zoneId], presence, side, hostile, rng, turn));
    }
  }
  return reports;
}

// ------------------------------------------------- DENİZDEKİ ORDULAR ---

/**
 * Bindirilmiş ordu düşmanın tuttuğu denizde adam kaybeder (Gelibolu).
 * Kayıp hâkimiyet payıyla orantılı; haftalık, ulus başına toplanır.
 */
function interceptTransports(game, presence) {
  const world = game.world;
  const losses = new Map();
  for (const unit of [...world.units]) {
    if (!unit.embarked || unit.hp <= 0 || !unit.tile?.terrain?.water) continue;
    const zoneId = unit.tile.seaZone ?? -1;
    if (zoneId < 0 || !presence.has(zoneId)) continue;
    const { friendly, hostile } = zoneBalance(world, presence, unit.nationId, zoneId);
    const share = hostile > 0 ? hostile / (hostile + friendly) : 0;
    if (share <= TRANSPORT_HOLD) continue;
    const before = soldiersOf(unit);
    const casualties = before * TRANSPORT_LOSS * share;
    if (!(casualties > 0)) continue;
    applyArmyLosses(unit, casualties, 10, world);
    const row = losses.get(unit.nationId) ?? { men: 0, zone: zoneId, sunk: 0 };
    const regiment = unit.regiments?.[0];
    const menPer = regiment ? (regiment.manpower ?? 0) / Math.max(1, regiment.maxStrength) : 0;
    row.men += casualties * menPer;
    if (soldiersOf(unit) <= 0) {
      row.sunk++;
      game.turns.killUnit(unit);
    }
    losses.set(unit.nationId, row);
  }
  return losses;
}

// --------------------------------------------------------------- ONARIM ---

function repair(world, nation, turn) {
  const ships = shipsOf(nation);
  if (!ships.length) return;
  const dockyards = nation.economy?.ic?.dockyards ?? 0;
  const speed = REPAIR_PER_WEEK * (dockyards > 0 ? 1 : 0.5);
  const perShip = UNIT_EQUIPMENT.WARSHIP?.ships ?? 10;
  for (const ship of ships) {
    if (ship.zone >= 0 || ship.at >= 0 || ship.eta > turn || ship.hp >= 1) {
      if (ship.repairing && ship.hp >= RESUME_AT) ship.repairing = false;
      continue;
    }
    let amount = Math.min(1 - ship.hp, speed);
    const need = amount * perShip;
    const have = equipmentStock(nation, 'ships');
    if (have < need) amount *= Math.max(0, have) / Math.max(1e-9, need);
    if (amount <= 0) continue;
    nation.economy.stock.ships = Math.max(0, have - amount * perShip);
    ship.hp = Math.min(1, ship.hp + amount);
    if (ship.repairing && ship.hp >= RESUME_AT) ship.repairing = false;
  }
}

// ------------------------------------------------------------- HAFTALIK ---

/** Haftalık donanma fazı (turn.js). */
export function runNavy(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const rng = makeRng(`${world.seed}-navy-${turn}`);
  seaZonesOf(world);
  const state = ensureNavyState(world);
  state.reports = state.reports.filter((report) => turn - report.turn <= REPORT_WEEKS);
  const previous = state.presence ?? new Map();

  for (const nation of world.nations) {
    if (!nation.navy) continue;
    if (!nation.alive) {
      scrapNavy(world, nation);
      continue;
    }
    allocate(world, nation, turn, previous);
    for (const ship of shipsOf(nation)) {
      if (ship.zone >= 0 && ship.at < 0 && turn >= ship.eta) ship.at = ship.zone;
    }
  }

  let presence = buildPresence(world);
  const reports = resolveBattles(game, presence, rng, turn);
  if (reports.length) presence = buildPresence(world);
  state.presence = presence;
  state.closed = new Map();
  state.blockade = computeBlockade(world, presence);
  state.losses = [...interceptTransports(game, presence).entries()];
  for (const report of reports) state.reports.push(report);
  for (const nation of world.nations) if (nation.alive) repair(world, nation, turn);
  announce(game, reports, state.losses);
  return reports;
}

/**
 * Yüklemeden sonra türetilmiş durumu kurar (muharebe ve onarım olmadan):
 * ekran ve ekonominin ilk haftası boş tablo okumasın.
 */
export function refreshNavyState(world) {
  seaZonesOf(world);
  const state = ensureNavyState(world);
  state.presence = buildPresence(world);
  state.closed = new Map();
  state.blockade = computeBlockade(world, state.presence);
  return state;
}

function announce(game, reports, losses) {
  const player = game.turns?.playerNation ?? -1;
  if (player < 0) return;
  const world = game.world;
  const zones = seaZonesOf(world).zones;
  for (const report of reports) {
    const mine = report.sides.findIndex((side) => side.nations.includes(player));
    if (mine < 0) continue;
    const us = report.sides[mine];
    const them = report.sides[1 - mine];
    const won = report.winner === mine;
    const enemy = them.nations.map((id) => world.nations[id]?.name).filter(Boolean).join(', ');
    const lost = us.sunk.length ? ` We lost ${us.sunk.map((s) => s.name).join(', ')}.` : '';
    const theirs = them.sunk.length ? ` Sunk: ${them.sunk.map((s) => s.name).join(', ')}.` : '';
    const zone = zones[report.zone];
    game.turns.addLog(
      `${report.name} (${zone?.name ?? 'sea'}): ${won ? 'victory' : 'defeat'} against ${enemy}.${theirs}${lost}`,
      { kind: 'NAVAL', key: `naval-${report.zone}-${report.turn}` },
    );
  }
  for (const [nationId, row] of losses) {
    if (nationId !== player || row.men < 1) continue;
    game.turns.addLog(
      `Transports attacked in ${zones[row.zone]?.name ?? 'enemy waters'}: ${Math.round(row.men).toLocaleString('en-US')} men lost at sea${row.sunk ? `, ${row.sunk} division${row.sunk === 1 ? '' : 's'} gone` : ''}.`,
      { kind: 'NAVAL', key: `transport-${row.zone}` },
    );
  }
}

// --------------------------------------------------------------- DÖKÜM ---

/**
 * Donanma ekranının bütün sayıları (ekran formül kurmaz). İlgili bölgeler:
 * iç sular, savaştığımız ulusların kıyısı, gemimizin olduğu ve elle seçilen
 * bölgeler. `override` önizleme ağırlığıdır ({zoneId: weight}).
 */
export function navyView(world, nation, override = null) {
  const state = world.navyState ?? refreshNavyState(world);
  const presence = state.presence;
  const zones = seaZonesOf(world).zones;
  const home = homeZones(world, nation.id);
  const ships = shipsOf(nation);
  const { targets, ready } = navyTargets(world, nation, presence, override);
  const weights = zoneWeights(world, nation, presence);
  const auto = autoZoneWeights(world, nation, presence);
  const enemies = (world.nations ?? []).filter((other) => other.alive && other.id !== nation.id
    && atWar(world, nation.id, other.id));
  const interest = new Set([...home.keys()]);
  for (const enemy of enemies) for (const [zoneId] of homeZones(world, enemy.id)) interest.add(zoneId);
  for (const ship of ships) {
    if (ship.zone >= 0) interest.add(ship.zone);
    if (ship.at >= 0) interest.add(ship.at);
  }
  for (const key of Object.keys(nation.navy?.zones ?? {})) interest.add(Number(key));
  const reach = reachableZones(world, home);
  const rows = [...interest].filter((zoneId) => zones[zoneId] && reach.has(zoneId)).map((zoneId) => {
    const zone = zones[zoneId];
    const balance = zoneBalance(world, presence, nation.id, zoneId);
    const here = presence.get(zoneId)?.get(nation.id);
    const assigned = ships.filter((ship) => ship.zone === zoneId).length;
    const sailing = ships.filter((ship) => ship.zone === zoneId && ship.at !== zoneId).length;
    const enemyShips = [];
    for (const [otherId, entry] of presence.get(zoneId) ?? []) {
      if (otherId !== nation.id && atWar(world, nation.id, otherId)) {
        enemyShips.push({ nation: otherId, ships: entry.ships.length, strength: entry.strength });
      }
    }
    // Bu bölgede kıyısı olan düşmanlara uyguladığımız abluka.
    const blockading = enemies.map((enemy) => {
      const coast = coastProvincesIn(world, enemy.id, zone);
      return coast ? { nation: enemy.id, coast, share: blockadeShare(world, presence, enemy.id, zone) } : null;
    }).filter(Boolean);
    const ourCoast = coastProvincesIn(world, nation.id, zone);
    return {
      zone,
      home: home.has(zoneId),
      ourCoast,
      priority: zonePriority(nation, zoneId),
      weight: weights.get(zoneId) ?? 0,
      autoWeight: auto.get(zoneId) ?? 0,
      target: targets.get(zoneId) ?? 0,
      assigned,
      sailing,
      present: here?.ships.length ?? 0,
      strength: here?.strength ?? 0,
      friendly: balance.friendly,
      hostile: balance.hostile,
      control: balance.control,
      enemyShips,
      blockading,
      ourBlockade: ourCoast ? blockadeShare(world, presence, nation.id, zone) : 0,
      transportRisk: balance.hostile > 0 && balance.hostile / (balance.hostile + balance.friendly) > TRANSPORT_HOLD
        ? TRANSPORT_LOSS * balance.hostile / (balance.hostile + balance.friendly) : 0,
      admiral: officersOf(nation, BRANCH.NAVY).find((a) => a.seaZone === zoneId) ?? null,
    };
  }).sort((a, b) => (b.weight - a.weight) || (b.ourCoast - a.ourCoast) || (a.zone.id - b.zone.id));
  const inPort = ships.filter((ship) => ship.zone < 0 && ship.at < 0);
  const turn = world.turn ?? 0;
  return {
    ships,
    ready,
    total: ships.length,
    atSea: ships.filter((ship) => ship.at >= 0).length,
    sailing: ships.filter((ship) => ship.zone >= 0 && ship.at < 0).length,
    inPort: inPort.length,
    repairing: ships.filter((ship) => ship.repairing).length,
    withdrawn: ships.filter((ship) => !ship.repairing && (ship.hold ?? 0) > turn).length,
    strength: fleetStrength(nation),
    blockade: state.blockade?.[nation.id] ?? 0,
    rows,
    reports: (state.reports ?? []).filter((report) => report.sides.some((side) => side.nations.includes(nation.id))),
    priorityOf: (weight) => linePriorityOf(weight ?? 0),
  };
}
