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
import { SHIP_CLASSES, applyArmyLosses, shipClassOf, soldiersOf } from './units.js';
import { releaseDraw } from './levy.js';
import { dateOfTurn } from './calendar.js';
import { HISTORY_KIND, TIER, recordChronicle, recordHistory } from './chronicle.js';
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
/** Muharebe raporu (ve kaçınma kaydı) bu kadar hafta ekranda kalır. */
export const REPORT_WEEKS = 26;
/**
 * KAÇINMA HAFIZASI (Auto). Zayıf kol varır, yarıdan zayıfsa aynı hafta
 * limana döner; altı hafta sonra bütün hazır filo yine "yeter" görünür ve
 * aynı kol yine yola çıkardı. Ölçüldü (2 tohum × 20 yıl): 59-71 gemi-kaçınma,
 * tek bir ulusun aynı denizden 14 kez dönüşü; denizi bir hafta bile tutmayan,
 * abluka da kurmayan boş bir döngü. Hafıza raporla aynı ömürdedir (oyuncunun
 * okuyabildiği kayıt kadar): ortanca savaş ~20 hafta, pratikte "bu savaş boyu".
 */
export const REFUSE_WEEKS = REPORT_WEEKS;
/**
 * Hafızanın çözülmesi için dengenin çeyrek kayması gerekir: beş gemilik
 * filoya bir dretnot +%20-35, batan ya da limana giren bir düşman gövdesi
 * −%20 ve üstü. Daha küçük oynama sağlık gürültüsüdür (onarım haftada %5) ve
 * döngüyü yeniden başlatırdı.
 */
export const REFUSE_MARGIN = 1.25;
/*
 * ZAFER HAFIZASI (S1b) aynı ömrü kullanır (REFUSE_WEEKS). Ölçüldü (AUDIT1,
 * 160×96, 20 yıl, S1 sonrası): 52 kaçınmanın 45'i ZAYIFIN KENDİ İÇ SUYUNDA,
 * 41'inde güçlü taraf oraya yalnız "orada düşman var" (contest) diye gelmişti.
 * Zayıf kaçınca deniz boşalıyor, güçlünün sebebi kalkıyor, o da limana
 * dönüyordu; zayıf geri geliyor, güçlü yine geliyordu (bir ulus aynı denizden
 * 11 haftada bir, 10 kez). S1 yalnız zayıfı bağlıyordu ve düşman denizi
 * bırakınca bağlamıyordu (tasarım gereği). Kovan taraf denizi tutar: abluka
 * kurar, zayıf da artık limanda kalır (fleet in being'in gerçek hâli).
 */
/**
 * NÖBET DEĞİŞİMİ: sakin istasyon, yerine gelen gemi yoldayken en çok bu kadar
 * hafta bir gövde eksik kalabilir. İç sular en yakın limandan 0-2 adımdır
 * (1 + adım/2 ≤ 2 hafta); abluka kapsamı kıyı state'i başına 0.6 güç ister,
 * tek gövde onu nadiren 1'in altına indirir. Ölçüldü (2 tohum × 20 yıl):
 * yarı hasarlı gövde 265-473 hafta onarılmadan nöbette kalıyordu; çekişmeli
 * denize gönderilenler de onlardı (Osterstead 0.54 battı).
 */
export const RELIEF_WEEKS = 2;
/**
 * BULUŞMA (S2): düşmanın bulunduğu denize giden kolun önden varan gemileri
 * en çok bu kadar hafta sonuncuyu bekler, denize birlikte girer. Ölçüldü
 * (160×96 × 20 yıl, S1 sonrası): kaçınmaların %21 (NAVY2) ve %38'inde
 * (AUDIT1) aynı kolun gemileri hâlâ yoldaydı — önden gelen tek başına bütün
 * düşman filosuyla karşılaşıp çekiliyor, withdraw() yoldakileri de eve
 * çekiyordu. En uzak Auto istasyonu ≤ 4 adım: varışlar ≤ 3 hafta arayla.
 */
export const RENDEZVOUS_WEEKS = 3;
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

/** Bütün gövdeler (bakım, mürettebat, onarım, ad). */
export function shipsOf(nation) {
  return nation?.navy?.ships ?? [];
}

/**
 * Denizaltı (seaLanes.js) havuzdadır ama hâkimiyet aramaz: deniz kontrolü,
 * muharebe, abluka ve amirallik yalnız YÜZEY gemilerini sayar.
 */
export const isSub = (ship) => ship?.kind === 'sub';

/** Yüzey filosu: hâkimiyet, muharebe, abluka, dağıtım. */
export function surfaceOf(nation) {
  return shipsOf(nation).filter((ship) => !isSub(ship));
}

export function subsOf(nation) {
  return shipsOf(nation).filter(isSub);
}

/**
 * Dünyanın türetilmiş deniz durumu: hafta hafta yeniden kurulur. Kayda
 * yalnız raporlar ve kaçınma kayıtları girer (save.js navyReports/navyEvasions).
 */
function ensureNavyState(world) {
  world.navyState ??= { presence: new Map(), blockade: [], reports: [], evasions: [], losses: [] };
  world.navyState.evasions ??= [];
  return world.navyState;
}

export function navyState(world) {
  return world.navyState ?? null;
}

/**
 * Yeni gemi: eğitim kuyruğundan (recruitment.recruit) ya da kuruluştan gelir.
 * Mürettebat nüfustan çekilmiştir (`draws`); gemi batarsa onlar da ölür.
 */
export function commissionShip(world, nation, { home, hp = 1, draws = [], turn = 0, kind = 'ship' }) {
  const navy = ensureNavy(nation);
  const id = navy.nextId++;
  const sub = kind === 'sub';
  // Denizaltının sınıfı yoktur: dretnot onu eskitmez.
  const gen = sub ? 0 : classIndexOf(nation);
  const ship = {
    id,
    name: sub ? subName(nation) : shipName(world, nation, id),
    hp: Math.max(0.1, Math.min(1, hp)),
    built: turn,
    gen,
    ...(sub ? { kind: 'sub' } : {}),
    home,
    zone: -1,
    at: -1,
    eta: turn,
    repairing: hp < RESUME_AT,
    draws,
  };
  navy.ships.push(ship);
  // DÜNYADA İLK: yeni sınıfın ilk gemisi bir kez, adıyla duyurulur (announce).
  world.navyFirsts ??= {};
  if (gen > 0 && !world.navyFirsts[gen]) {
    world.navyFirsts[gen] = { nation: nation.id, ship: ship.name, turn, announced: false };
  }
  return ship;
}

// ------------------------------------------------------------ SINIF ---

/** Ulusun şu an kızağa koyabildiği sınıf (teknoloji: shipClass toplamı). */
export function classIndexOf(nation) {
  return Math.max(0, Math.min(SHIP_CLASSES.length - 1, Math.round(mod(nation, 'shipClass'))));
}

/** Gemi ulusun kurabildiği sınıfın gerisinde mi (eskimiş). */
export function isObsolete(nation, ship) {
  return !isSub(ship) && (ship.gen ?? 0) < classIndexOf(nation);
}

/**
 * Filonun bugünkü sınıf cinsinden gemi eşdeğeri: eski gövde sınıf gücü
 * oranında sayılır. YZ filo hedefini bununla ölçer; gövde sayısıyla ölçünce
 * dretnotlu düşmana karşı eski zırhlılarıyla "yeterli" sanıyordu.
 */
export function fleetEquivalent(nation) {
  const top = SHIP_CLASSES[classIndexOf(nation)].power;
  return surfaceOf(nation).reduce((sum, ship) => sum + shipClassOf(ship).power / top, 0);
}

/**
 * Gemileri hurdaya ayırır: mürettebat eve döner, gemi teçhizatının %30'u
 * (sağlıkla) depoya geri gelir. Eski gövde aynı bakımı yer, aynı mürettebatı
 * tutar; yer açmanın tek yolu budur.
 */
export const SCRAP_REFUND = 0.3;

export function scrapShips(world, nation, ships) {
  const gone = new Set(ships);
  if (!gone.size) return 0;
  let refund = 0;
  for (const ship of gone) {
    for (const draw of ship.draws ?? []) releaseDraw(world, nation.id, draw, draw.men ?? 0);
    ship.draws = [];
    refund += hullEquipment(ship) * SCRAP_REFUND * ship.hp;
  }
  nation.navy.ships = nation.navy.ships.filter((ship) => !gone.has(ship));
  if (nation.economy?.stock) nation.economy.stock.ships = (nation.economy.stock.ships ?? 0) + refund;
  return gone.size;
}

/** Gövdenin kuruluş teçhizatı (onarım ve hurda oranı buna göre). */
export function hullEquipment(ship) {
  return UNIT_EQUIPMENT[isSub(ship) ? 'SUBMARINE' : 'WARSHIP']?.ships ?? 10;
}

/**
 * Oyuncunun seçerek hurdası (Kerem 2026-10-15: "gemi silme yok"): yalnız
 * eskimiş gövde gidebiliyordu, fazla filonun bakımından kurtulmanın yolu
 * yoktu. Grup bir sınıftır (`gen`) ya da `'sub'`. Önce limandaki, sonra en
 * hasarlı, sonra en eski gövde gider: denizde nöbet tutan filo yarıda boşalmasın.
 */
export function scrapPicks(nation, group, count = Infinity) {
  const inGroup = (ship) => (group === 'sub' ? isSub(ship) : !isSub(ship) && (ship.gen ?? 0) === group);
  const atSea = (ship) => (ship.zone >= 0 || ship.at >= 0 ? 1 : 0);
  return shipsOf(nation).filter(inGroup)
    .sort((a, b) => atSea(a) - atSea(b) || a.hp - b.hp || a.built - b.built || a.id - b.id)
    .slice(0, Math.max(0, count));
}

export function scrapGroup(world, nation, group, count = Infinity) {
  return scrapShips(world, nation, scrapPicks(nation, group, count));
}

/** Bütün eskimiş gemileri hurdaya ayırır (panel düğmesi). */
export function scrapObsolete(world, nation) {
  return scrapShips(world, nation, shipsOf(nation).filter((ship) => isObsolete(nation, ship)));
}

/** Denizaltı adı: U-1, U-2... (ulus başına sayaç). */
function subName(nation) {
  const navy = ensureNavy(nation);
  navy.nextSub = (navy.nextSub ?? 0) + 1;
  return `U-${navy.nextSub}`;
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
export function sinkShip(world, nation, ship) {
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
  return surfaceOf(nation).reduce((sum, ship) => (
    turn != null && docked(ship, turn) ? sum : sum + ship.hp * shipClassOf(ship).power
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
  return autoZonePlan(world, nation, presence).weights;
}

/** Bölgede bizimle savaşan, gücü en büyük ulus (gerekçe cümlesinin öznesi). */
function strongestHostile(world, presence, nationId, zoneId) {
  let best = null;
  for (const [otherId, entry] of presence?.get(zoneId) ?? []) {
    if (otherId === nationId || !atWar(world, nationId, otherId)) continue;
    if (!best || entry.strength > best.strength) best = { id: otherId, strength: entry.strength, ships: entry.ships.length };
  }
  return best;
}

/**
 * Auto'nun ağırlıkları GEREKÇESİYLE: `weights` amiralliğin kullandığı tablo,
 * `why` her denizin cümlesi (panel Auto düğmesinin ipucu). Ekran kuralı
 * kendisi yazmaz; "neden boş" sorusunun cevabı burada üretilir.
 */
export function autoZonePlan(world, nation, presence = null) {
  const weights = new Map();
  const why = new Map();
  const home = homeZones(world, nation.id);
  if (!home.size) return { weights, why };
  const sorted = [...home.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const enemies = (world.nations ?? []).filter((other) => other.alive
    && other.id !== nation.id && atWar(world, nation.id, other.id));
  const zones = seaZonesOf(world).zones;
  sorted.forEach(([zoneId], index) => {
    if (index === 0) {
      weights.set(zoneId, 3);
      why.set(zoneId, { code: 'home-main', weight: 3, coast: coastProvincesIn(world, nation.id, zones[zoneId]) });
    } else if (!enemies.length) {
      weights.set(zoneId, 1);
      why.set(zoneId, { code: 'home', weight: 1 });
    } else {
      // Savaşta filo toplanır: bu iç su boş kalır (ağırlık yok, yalnız cümle).
      why.set(zoneId, { code: 'gathered', weight: 0 });
    }
  });
  if (!enemies.length) return { weights, why };
  const turn = world.turn ?? 0;
  const ours = fleetStrength(nation, turn);
  const reach = reachableZones(world, home);
  for (const enemy of enemies) {
    const theirs = fleetStrength(enemy, turn);
    const confident = ours > 0 && ours >= theirs * 0.8;
    for (const [zoneId] of homeZones(world, enemy.id)) {
      if (!reach.has(zoneId) || (reach.get(zoneId) ?? 99) > 4) continue;
      if (home.has(zoneId)) {
        weights.set(zoneId, 6);
        if (why.get(zoneId)?.code !== 'shared') why.set(zoneId, { code: 'shared', weight: 6, enemy: enemy.id });
      } else if (confident) {
        if ((weights.get(zoneId) ?? 0) < 3) why.set(zoneId, { code: 'blockade', weight: 3, enemy: enemy.id, ours, theirs });
        weights.set(zoneId, Math.max(weights.get(zoneId) ?? 0, 3));
      } else if (!weights.has(zoneId) && !why.has(zoneId)) {
        // Ağırlık YOK (tablo bugünküyle aynı); yalnız cümlesi kaydedilir.
        why.set(zoneId, { code: 'unconfident', weight: 0, enemy: enemy.id, ours, theirs });
      }
    }
  }
  // ESKORT: düşman denizaltısının yükümüzü batırdığı deniz Normal
  // (seaLanes.js raid tablosu); yüzey gemisi orada denizaltıyı avlar.
  for (const [zoneId, row] of world.navyState?.raid ?? []) {
    const share = row.get(nation.id) ?? 0;
    if (share > 0.05 && reach.has(zoneId)) {
      if ((weights.get(zoneId) ?? 0) < 3) why.set(zoneId, { code: 'escort', weight: 3, share });
      weights.set(zoneId, Math.max(weights.get(zoneId) ?? 0, 3));
    }
  }
  // ZAFER HAFIZASI (S1b): düşman filosunu kaçırdığımız denizi o savaş
  // boyunca (REFUSE_WEEKS) High tutarız — çekişmenin ağırlığıyla aynı.
  // Normal (3) ölçüldü ve işe yaramadı: küçük filoda kol kuralı (SQUADRON)
  // eşit ağırlıkta en geniş iç suyu seçiyor, kovan kol yine eve dönüyordu
  // (AUDIT1: aynı deniz 10 kez). Orada yeniden düşman belirirse aşağıdaki
  // çekişme kuralı karar verir (6 ya da 0).
  for (const [key, memo] of Object.entries(nation.navy?.drove ?? {})) {
    const zoneId = Number(key);
    if (!reach.has(zoneId) || (weights.get(zoneId) ?? 0) >= 6) continue;
    if (!activeMemo(world, nation, zoneId, turn, 'drove')) continue;
    weights.set(zoneId, 6);
    why.set(zoneId, { code: 'hold', weight: 6, enemy: memo.by[0] ?? null, since: memo.turn, expires: memo.turn + REFUSE_WEEKS });
  }
  if (!presence) return { weights, why };
  for (const zoneId of new Set([...home.keys(), ...weights.keys()])) {
    const there = zoneBalance(world, presence, nation.id, zoneId).hostile;
    if (there <= 0) {
      // Kovan filo denizden çekilmiş ama gücü yerinde (S1c): kol yine
      // gitse bir-iki haftada yine kovulurdu. Ölçüldü (save-1905, Irigrad
      // Auto): Turland'ın 5 gemisi iki deniz arasında gidip gelirken bizim
      // 2 gemilik kol Osterfell'e 12 haftada bir dönüp kaçınıyordu.
      const idle = activeMemo(world, nation, zoneId, turn);
      if (idle && weights.get(zoneId) > 0 && chasersStill(world, idle, turn) && ours < idle.ours * REFUSE_MARGIN) {
        const enemy = world.nations[idle.by[0]] ? idle.by[0] : null;
        weights.set(zoneId, 0);
        why.set(zoneId, {
          code: 'refused', weight: 0, need: idle.ours * REFUSE_MARGIN, there: 0, ours, enemy, memo: idle, away: true,
          retakeBelow: idle.fleet / REFUSE_MARGIN, expires: idle.turn + REFUSE_WEEKS,
        });
      }
      continue;
    }
    const enemy = strongestHostile(world, presence, nation.id, zoneId);
    // HAFIZA (S1): burada yakın zamanda kaçındıysa denge çeyrek kaymadan
    // dönülmez — ya hazır filomuz o günkünden %25 güçlü, ya oradaki düşman
    // o günkünden %20 zayıf, ya süre doldu / o savaş bitti. Düşman denizi
    // tamamen bırakırsa (there = 0) hafıza bağlamaz: tek bir büyük filoyu
    // bir kez göstermek denizi kalıcı kapatamaz.
    const memo = activeMemo(world, nation, zoneId, turn);
    const binding = Boolean(memo) && there > memo.theirs / REFUSE_MARGIN;
    const need = binding ? Math.max(there / CONTEST_RATIO, memo.ours * REFUSE_MARGIN) : there / CONTEST_RATIO;
    const ok = ours * CONTEST_RATIO >= there && (!binding || ours >= memo.ours * REFUSE_MARGIN);
    weights.set(zoneId, ok ? 6 : 0);
    why.set(zoneId, {
      code: ok ? 'contest' : binding ? 'refused' : 'outgunned', weight: ok ? 6 : 0, need, there, ours,
      enemy: enemy?.id ?? null,
      ...(binding ? {
        memo,
        retakeBelow: Math.min(memo.theirs / REFUSE_MARGIN, ours * CONTEST_RATIO),
        expires: memo.turn + REFUSE_WEEKS,
      } : {}),
    });
  }
  return { weights, why };
}

/**
 * Ulusun bu denizdeki geçerli hafızası (`refused`: kaçındığımız, `drove`:
 * düşmanı kaçırdığımız): süresi dolmamış ve karşı taraftan biri hâlâ
 * bizimle savaşta.
 */
function activeMemo(world, nation, zoneId, turn, field = 'refused') {
  const memo = nation.navy?.[field]?.[zoneId];
  if (!memo || turn - memo.turn >= REFUSE_WEEKS) return null;
  return memo.by.some((id) => world.nations[id]?.alive && atWar(world, nation.id, id)) ? memo : null;
}

/**
 * Bizi kovanların hazır filosu (iç sular ve amiral hariç) hâlâ o günkünün
 * çeyreğinden fazla düşmedi mi. Eski kayıtta (`fleet` yok) bağlamaz.
 */
function chasersStill(world, memo, turn) {
  if (!(memo.fleet > 0)) return false;
  const now = memo.by.reduce((sum, id) => sum + (world.nations[id]?.alive ? fleetStrength(world.nations[id], turn) : 0), 0);
  return now > memo.fleet / REFUSE_MARGIN;
}

/** Süresi dolan ya da savaşı biten hafızayı siler (artan anahtar sırası). */
function pruneRefusals(world, nation, turn) {
  for (const field of ['refused', 'drove']) {
    const table = nation.navy?.[field];
    if (!table) continue;
    for (const key of Object.keys(table)) {
      if (!activeMemo(world, nation, Number(key), turn, field)) delete table[key];
    }
    if (!Object.keys(table).length) delete nation.navy[field];
  }
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

/**
 * Denize çıkabilecek gemi sayısı. Barışta 0.85 altı gövde onarıma döner
 * (S3, allocate önce onu limana yollar); sayım bunu bilir ki ön izleme
 * amiralliğin göreceği sayıyı görsün.
 */
function readyCount(world, nation, turn) {
  const peace = atPeace(world, nation);
  return surfaceOf(nation).filter((ship) => !docked(ship, turn) && ship.hp >= RETURN_BELOW
    && !(peace && ship.hp < RESUME_AT)).length;
}

/** Bölgelerin etkin ağırlığı: elle seçilen kalır, gerisi otomatik. */
export function zoneWeights(world, nation, presence = null, override = null) {
  return zonePlan(world, nation, presence, override).weights;
}

/**
 * Etkin ağırlıklar ve Auto'nun gerekçeleri. Kol kuralının kestiği denize
 * `pooled` gerekçesi yazılır; elle seçilen deniz kolu aldıysa adı da
 * (`by`): eskiden ipucu "daha büyük filo bekliyor" diyordu, gerçek sebep
 * oyuncunun kendi High'ıydı.
 */
export function zonePlan(world, nation, presence = null, override = null) {
  const plan = autoZonePlan(world, nation, presence);
  const auto = plan.weights;
  const why = new Map(plan.why);
  const manual = new Map();
  for (const [key, entry] of Object.entries(nation?.navy?.zones ?? {})) {
    if (entry?.mode === 'manual') manual.set(Number(key), entry.weight ?? 0);
  }
  if (override) for (const [zoneId, weight] of Object.entries(override)) manual.set(Number(zoneId), weight);
  // Ulaşılamayan bölgeye gemi gönderilmez (başka su kütlesi).
  const home = homeZones(world, nation.id);
  const reach = reachableZones(world, home);
  const usedZones = [...manual].filter(([zoneId, weight]) => weight > 0 && reach.has(zoneId)).map(([zoneId]) => zoneId);
  const used = usedZones.length;
  const ready = readyCount(world, nation, world.turn ?? 0);
  const autoSlots = Math.max(1, Math.floor(ready / SQUADRON));
  // Elle seçilen deniz Auto'nun bütün kollarını yemez: en üstteki Auto denizi
  // (çoğu zaman abluka kuran ya da en geniş iç su) kalır. Eskiden tek bir
  // High, küçük filoda bütün Auto denizlerini sıfırlıyordu; iki abluka birden
  // düşüyor, iki filo savaşmadan denizlerini değişiyordu (ölçüldü, Irigrad 1905).
  // Elle seçim yoksa (bütün YZ) değer eskisiyle aynı.
  const slots = Math.max(used > 0 ? 1 : 0, autoSlots - used);
  const ranked = [...auto].filter(([zoneId, weight]) => weight > 0 && !manual.has(zoneId) && reach.has(zoneId))
    .sort((a, b) => b[1] - a[1] || (home.get(b[0]) ?? 0) - (home.get(a[0]) ?? 0) || a[0] - b[0]);
  const weights = new Map();
  for (const [zoneId, weight] of auto) if (!manual.has(zoneId) && reach.has(zoneId)) weights.set(zoneId, weight);
  ranked.forEach(([zoneId, weight], index) => {
    if (index < slots) return;
    weights.set(zoneId, 0);
    why.set(zoneId, {
      code: 'pooled', weight: 0, wanted: weight, ready, slots: autoSlots, used, by: usedZones,
      cause: why.get(zoneId) ?? null,
    });
  });
  for (const [zoneId, weight] of manual) {
    if (!reach.has(zoneId)) continue;
    weights.set(zoneId, weight);
    why.set(zoneId, { code: 'manual', weight, auto: plan.why.get(zoneId) ?? null, autoWeight: auto.get(zoneId) ?? 0 });
  }
  return { weights, why, auto, manual, reach, home, ready, autoSlots, used, usedZones };
}

/**
 * Hazır gemilerin bölgelere hedef sayısı (en büyük kalan yöntemi). Önizleme
 * de bunu çağırır (`override`): ekran oyunla ayrışamaz.
 */
export function navyTargets(world, nation, presence = null, override = null) {
  const ready = readyCount(world, nation, world.turn ?? 0);
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

export function travelWeeks(world, from, to) {
  if (from < 0 || to < 0) return 1;
  const d = zoneDistances(world, from)[to];
  return Number.isFinite(d) ? 1 + Math.floor(d / ZONES_PER_WEEK) : Infinity;
}

/**
 * Geminin bölgeye yolu. Limandaki gemi ulusun EN YAKIN limanından çıkar
 * (filo bir üsse bağlı değildir); denizdeki gemi bulunduğu yerden gider,
 * oradan yol yoksa (başka su kütlesi) önce limana döner.
 */
export function shipTravel(world, nation, ship, to, home) {
  const from = ship.at >= 0 ? ship.at : ship.zone;
  if (from >= 0) {
    const direct = travelWeeks(world, from, to);
    if (Number.isFinite(direct)) return direct;
  }
  let best = Infinity;
  for (const [zoneId] of home) best = Math.min(best, travelWeeks(world, zoneId, to));
  return from >= 0 && Number.isFinite(best) ? best + 1 : best;
}

export function sendHome(world, nation, ship, turn) {
  if (ship.zone < 0 && ship.at < 0) return;
  const from = ship.at >= 0 ? ship.at : ship.zone;
  ship.zone = -1;
  ship.at = -1;
  const weeks = travelWeeks(world, from, homeZoneOf(world, nation, ship));
  ship.eta = turn + (Number.isFinite(weeks) ? weeks : 1);
}

/**
 * Yolculuğun çıkış denizi (haritadaki rota çizgisi): denizdeki gemi
 * bulunduğu yerden, limandaki en yakın iç sudan çıkar (shipTravel'in seçtiği).
 */
function departureOf(world, ship, to, home) {
  const from = ship.at >= 0 ? ship.at : ship.zone;
  if (from >= 0 && Number.isFinite(travelWeeks(world, from, to))) return from;
  let best = -1;
  let bestWeeks = Infinity;
  for (const [zoneId] of home) {
    const weeks = travelWeeks(world, zoneId, to);
    if (weeks < bestWeeks) { best = zoneId; bestWeeks = weeks; }
  }
  return best;
}

/** Limanda bekleyecek gemi (gerçekte ya da bu hafta 0.4 altına düştüğü için). */
const willDock = (ship, turn) => docked(ship, turn) || ship.hp < RETURN_BELOW;

/** Ulus yaşayan hiçbir ulusla savaşta değil. */
function atPeace(world, nation) {
  return !(world.nations ?? []).some((other) => other.alive && other.id !== nation.id
    && atWar(world, nation.id, other.id));
}

/**
 * NÖBET DEĞİŞİMİ (S3): barışta 0.85 altındaki her gövde onarıma döner; savaşta
 * yalnız düşmansız denizdeki yaralı gövde, yerine ≤ RELIEF_WEEKS uzaklıkta
 * sağlam bir gemi varsa. Eskiden kotanın içindeki 0.55'lik gövde yıllarca
 * nöbette kalıyordu (onarım limanda olur) ve çekişmeli denize ilk o gidiyordu.
 */
const peaceDock = (ship, turn, peace) => peace && !docked(ship, turn) && ship.hp < RESUME_AT;

/**
 * AMİRALLİĞİN PLANI — saf: gemilere dokunmaz. `allocate` bunu uygular,
 * önizleme ve öngörü de aynı planı okur: ekran amiralliğin göndereceği
 * gemileri gösterir, bir ortalamayı değil. Döndürür: yerinde kalan (`stay`),
 * yola çıkan (`send`: gemi → {zone, weeks}), limana dönen (`home`), yolu
 * olmayan (`stuck`: hiçbir şey yapılmaz) ve hedef sayıları.
 */
export function planAllocation(world, nation, turn, presence, override = null) {
  const ships = surfaceOf(nation);
  const home = homeZones(world, nation.id);
  const peace = atPeace(world, nation);
  const { targets } = navyTargets(world, nation, presence, override);
  const goesHome = (ship) => willDock(ship, turn) || peaceDock(ship, turn, peace);
  const ready = ships.filter((ship) => !goesHome(ship));
  const count = new Map();
  const stay = new Set();
  const free = [];
  // Yerinde kalan kalır: kotası dolu bölgenin fazlası serbest bırakılır.
  for (const ship of [...ready].sort((a, b) => b.hp - a.hp || a.id - b.id)) {
    const want = targets.get(ship.zone) ?? 0;
    if (ship.zone >= 0 && (count.get(ship.zone) ?? 0) < want) {
      count.set(ship.zone, (count.get(ship.zone) ?? 0) + 1);
      stay.add(ship);
    } else {
      free.push(ship);
    }
  }
  const send = new Map();
  const stuck = [];
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
        // Eşit yakınlıkta en SAĞLAM gemi: çekişmeli denize yarı yaralı gövde gitmesin.
        const rival = free[best];
        if (weeks < bestWeeks || (weeks === bestWeeks
          && (ship.hp > rival.hp || (ship.hp === rival.hp && ship.id < rival.id)))) {
          best = index;
          bestWeeks = weeks;
        }
      });
      const [ship] = free.splice(best, 1);
      if (!Number.isFinite(bestWeeks)) { stuck.push(ship); continue; }
      send.set(ship, { zone: zoneId, weeks: bestWeeks });
      missing--;
    }
  }
  // Savaşta nöbet değişimi: düşmansız denizde nöbetteki yaralı gövdenin yerine
  // ≤ RELIEF_WEEKS uzaklıktaki sağlam serbest gemi gelir, yaralı onarıma döner.
  // Çekişmeli deniz hiç zayıflatılmaz.
  const relieve = [];
  if (!peace) {
    const relief = free.filter((ship) => ship.hp >= RESUME_AT).sort((a, b) => b.hp - a.hp || a.id - b.id);
    const damaged = [...stay].filter((ship) => ship.hp < RESUME_AT && ship.zone >= 0 && ship.at === ship.zone
      && zoneBalance(world, presence, nation.id, ship.zone).hostile <= 0)
      .sort((a, b) => a.hp - b.hp || a.id - b.id);
    for (const ship of damaged) {
      if (!relief.length) break;
      let best = -1;
      let bestWeeks = Infinity;
      // relief sağlamdan zayıfa sıralı: eşit yakınlıkta ilk bulunan en sağlamıdır.
      relief.forEach((candidate, index) => {
        const weeks = shipTravel(world, nation, candidate, ship.zone, home);
        if (weeks < bestWeeks) { best = index; bestWeeks = weeks; }
      });
      if (best < 0 || bestWeeks > RELIEF_WEEKS) continue;
      const [by] = relief.splice(best, 1);
      free.splice(free.indexOf(by), 1);
      stay.delete(ship);
      send.set(by, { zone: ship.zone, weeks: bestWeeks });
      relieve.push({ ship, by, zone: ship.zone, weeks: bestWeeks });
    }
  }
  return { targets, stay, send, home: free, stuck, relieve, docked: ships.filter(goesHome) };
}

function allocate(world, nation, turn, presence) {
  const ships = surfaceOf(nation);
  const home = homeZones(world, nation.id);
  pruneRefusals(world, nation, turn);
  const peace = atPeace(world, nation);
  for (const ship of ships) {
    if (!ship.repairing && ship.hp < RETURN_BELOW) ship.repairing = true;
    // Barışta 0.85 altı her gövde onarıma döner (S3): savaşı yarım gövdeyle karşılamasın.
    if (peaceDock(ship, turn, peace)) ship.repairing = true;
    if (docked(ship, turn)) sendHome(world, nation, ship, turn);
  }
  const plan = planAllocation(world, nation, turn, presence);
  for (const { ship } of plan.relieve) {
    ship.repairing = true;
    sendHome(world, nation, ship, turn);
  }
  for (const [ship, { zone: zoneId, weeks }] of plan.send) {
    if (ship.zone === zoneId && ship.at === zoneId) continue;
    const travel = ship.at === zoneId ? 0 : weeks;
    if (travel > 0) ship.from = departureOf(world, ship, zoneId, home);
    ship.zone = zoneId;
    if (travel > 0) {
      ship.at = -1;
      ship.eta = turn + travel;
    }
  }
  for (const ship of plan.home) sendHome(world, nation, ship, turn);
}

// -------------------------------------------------------- GÜÇ TABLOSU ---

/** Geminin bölgedeki gücü: sağlık × teknoloji × sınıf × iç sular × amiral. */
function shipStrength(nation, ship, home, admiral) {
  const naval = Math.max(0.3, 1 + mod(nation, 'naval'));
  return ship.hp * naval * shipClassOf(ship).power * (home ? 1 + HOME_WATERS : 1)
    * generalModifier(admiral, { defending: home });
}

function assignAdmirals(nation) {
  const admirals = officersOf(nation, BRANCH.NAVY)
    .sort((a, b) => b.skill - a.skill || a.id - b.id);
  const counts = new Map();
  for (const ship of surfaceOf(nation)) if (ship.at >= 0) counts.set(ship.at, (counts.get(ship.at) ?? 0) + 1);
  const zones = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([zoneId]) => zoneId);
  // Oyuncunun elle bağladığı amiral denizinde kalır; kalanlar en kalabalık boş denizlere.
  // YZ bağlamaz: bağ yoksa dağıtım eskisinin aynısıdır (zar çekilmez, sıra aynı).
  const taken = new Set();
  for (const admiral of admirals) {
    if (admiral.seaPin == null) continue;
    admiral.seaZone = admiral.seaPin;
    taken.add(admiral.seaPin);
  }
  const free = zones.filter((zoneId) => !taken.has(zoneId));
  let next = 0;
  for (const admiral of admirals) {
    if (admiral.seaPin == null) admiral.seaZone = free[next++] ?? null;
  }
  return new Map(admirals.filter((a) => a.seaZone != null).map((a) => [a.seaZone, a]));
}

/** Amirali bir denize elle bağlar; zoneId null ise yeniden otomatiğe bırakır. */
export function pinAdmiral(nation, admiralId, zoneId) {
  const admiral = officersOf(nation, BRANCH.NAVY).find((a) => a.id === admiralId);
  if (!admiral) return false;
  if (zoneId == null) {
    delete admiral.seaPin;
  } else {
    admiral.seaPin = zoneId;
    admiral.seaZone = zoneId;
  }
  return true;
}

/** Bölge → ulus → {strength, ships}. Yalnız varmış (at ≥ 0) gemiler. */
function buildPresence(world) {
  const presence = new Map();
  for (const nation of world.nations ?? []) {
    if (!nation.alive || !shipsOf(nation).length) continue;
    const admirals = assignAdmirals(nation);
    const home = homeZones(world, nation.id);
    for (const ship of surfaceOf(nation)) {
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
  const admiralOwner = new Map();
  for (const id of nationIds) {
    const entry = presence.get(zone.id).get(id);
    strength += entry.strength;
    if (entry.admiral) {
      admirals.push(entry.admiral);
      admiralOwner.set(entry.admiral, id);
    }
    for (const ship of entry.ships) entries.push({ nationId: id, ship, hp: ship.hp });
  }
  return { nationIds, entries, strength, admirals, admiralOwner };
}

/**
 * Muharebenin "neden böyle gitti" satırları: tarafın girişleri üzerinden
 * sağlık ağırlıklı sınıf, deniz teknolojisi, iç sular payı ve en iyi amiral.
 * Muharebenin kendi kullandığı değerlerden türer; simülasyona geri dönmez.
 */
function sideFactors(world, side, zoneId) {
  let hp = 0;
  let cls = 0;
  let naval = 0;
  let homeShare = 0;
  const homes = new Map();
  for (const entry of side.entries) {
    const nation = world.nations[entry.nationId];
    if (!homes.has(entry.nationId)) homes.set(entry.nationId, homeZones(world, entry.nationId).has(zoneId));
    hp += entry.hp;
    cls += entry.hp * shipClassOf(entry.ship).power;
    naval += entry.hp * Math.max(0.3, 1 + mod(nation, 'naval'));
    if (homes.get(entry.nationId)) homeShare += entry.hp;
  }
  const best = [...side.admirals].sort((x, y) => y.skill - x.skill || x.id - y.id)[0] ?? null;
  const admiralHome = best ? homes.get(side.admiralOwner.get(best)) ?? false : false;
  return {
    cls: hp > 0 ? cls / hp : 1,
    naval: hp > 0 ? naval / hp : 1,
    home: hp > 0 ? homeShare / hp : 0,
    admiral: best ? { name: best.name, skill: best.skill, mod: generalModifier(best, { defending: admiralHome }) } : null,
  };
}

/** Taraftaki sınıf karışımı (muharebe anında; gemi sonra batar ya da hurdaya gider). */
function sideClasses(side) {
  const counts = new Map();
  for (const entry of side.entries) {
    const gen = entry.ship.gen ?? 0;
    counts.set(gen, (counts.get(gen) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[0] - a[0]).map(([gen, count]) => ({ gen, count }));
}

function fight(game, zone, presence, friendIds, hostileIds, rng, turn) {
  const world = game.world;
  const sides = [sideOf(world, presence, zone, friendIds), sideOf(world, presence, zone, hostileIds)];
  const [a, b] = sides;
  // Kayıt alanları zarı çekmeden ÖNCE: sınıf ve etkenler muharebeye girenin.
  const factors = sides.map((side) => sideFactors(world, side, zone.id));
  const classes = sides.map(sideClasses);
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
    id: `b${turn}-${zone.id}`,
    turn,
    zone: zone.id,
    name: `Battle of ${zone.place ?? zone.name}`,
    sides: sides.map((side, index) => ({
      nations: side.nationIds,
      ships: side.entries.length,
      sunk: [],
      damaged: 0,
      returned: 0,
      before: side.strength,
      after: 0,
      hp: { before: 0, after: 0 },
      classes: classes[index],
      factors: factors[index],
    })),
    ratio: a.strength / Math.max(1e-9, b.strength),
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
        if (entry.ship.hp < RETURN_BELOW) row.returned++;
        hpAfter += entry.ship.hp;
      }
    }
    // Güç sağlıkla doğru orantılıdır: kalan güç = önceki × kalan sağlık payı.
    row.after = side.strength * hpAfter / Math.max(1e-9, hpBefore);
    row.hp = { before: hpBefore, after: hpAfter };
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
    for (const ship of surfaceOf(nation)) {
      if (ship.zone !== zoneId && ship.at !== zoneId) continue;
      ship.hold = Math.max(ship.hold ?? 0, turn + WITHDRAW_WEEKS);
      // Panel "nereden, neden döndü" diyebilsin (kayıtla bölge + hafta üstünden eşlenir).
      ship.heldAt = zoneId;
      sendHome(world, nation, ship, turn);
    }
  }
}

/** Bu uluslardan o denize atanmış ama henüz varmamış yüzey gemisi sayısı. */
function sailingTo(world, nationIds, zoneId) {
  let count = 0;
  for (const id of nationIds) {
    for (const ship of surfaceOf(world.nations[id])) if (ship.zone === zoneId && ship.at !== zoneId) count++;
  }
  return count;
}

function resolveBattles(game, presence, rng, turn) {
  const world = game.world;
  const zones = seaZonesOf(world).zones;
  const reports = [];
  const evasions = [];
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
        // KAYIT: eskiden sessizdi; oyuncunun High'ı "hiçbir şey yapmıyor"
        // görünüyordu, düşmanı denizden kovduğunu da hiç öğrenmiyordu.
        // Sayım withdraw'dan ÖNCE (varmış ve yoldaki gemiler); ilk taraf hep çekilendir.
        const weakIds = a < b ? side : hostile;
        const strongIds = a < b ? hostile : side;
        const count = (ids) => ids.reduce((sum, id) => sum + present.get(id).ships.length, 0);
        evasions.push({
          id: `e${turn}-${zoneId}`,
          turn,
          zone: zoneId,
          evaded: true,
          until: turn + WITHDRAW_WEEKS,
          sides: [
            { nations: weakIds, ships: count(weakIds), sailing: sailingTo(world, weakIds, zoneId), before: Math.min(a, b) },
            { nations: strongIds, ships: count(strongIds), sailing: 0, before: Math.max(a, b) },
          ],
        });
        rememberRefusal(world, weakIds, strongIds, zoneId, Math.max(a, b), turn);
        rememberDrive(world, strongIds, weakIds, zoneId, turn);
        withdraw(world, weakIds, zoneId, turn);
        continue;
      }
      reports.push(fight(game, zones[zoneId], presence, side, hostile, rng, turn));
    }
  }
  return { reports, evasions };
}

/**
 * S1: kaçınan ulus denizi hatırlar (Auto). withdraw'dan ÖNCE çağrılır:
 * hazır filo gücü kaçanları da sayar (hafızanın "o günkü biz"i).
 */
function rememberRefusal(world, weakIds, strongIds, zoneId, strong, turn) {
  for (const id of weakIds) {
    const nation = world.nations[id];
    if (!nation?.navy) continue;
    (nation.navy.refused ??= {})[zoneId] = {
      turn, ours: fleetStrength(nation, turn), theirs: strong, by: [...strongIds].sort((x, y) => x - y),
      // Kovanların o günkü hazır filosu (S1c: deniz boşken de bağlar mı).
      fleet: strongIds.reduce((sum, sid) => sum + fleetStrength(world.nations[sid], turn), 0),
    };
  }
}

/** S1b: düşman filosunu kaçıran ulus denizi hatırlar (Auto orayı tutar). */
function rememberDrive(world, strongIds, weakIds, zoneId, turn) {
  for (const id of strongIds) {
    const nation = world.nations[id];
    if (!nation?.navy) continue;
    (nation.navy.drove ??= {})[zoneId] = { turn, by: [...weakIds].sort((x, y) => x - y) };
  }
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
  for (const ship of ships) {
    const perShip = hullEquipment(ship);
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
  state.evasions = state.evasions.filter((record) => turn - record.turn <= REPORT_WEEKS);
  const previous = state.presence ?? new Map();
  // Abluka geçişlerinin duyurusu için geçen haftanın tablosu (kayda girmez;
  // yüklemeden sonra refreshNavyState kurar, eski "abluka başladı" çıkmaz).
  const before = { blockade: state.blockade ?? [], presence: previous };

  for (const nation of world.nations) {
    if (!nation.navy) continue;
    if (!nation.alive) {
      scrapNavy(world, nation);
      continue;
    }
    allocate(world, nation, turn, previous);
    arrive(world, nation, turn, previous);
  }

  let presence = buildPresence(world);
  const { reports, evasions } = resolveBattles(game, presence, rng, turn);
  // Kaçınan da denizden çıkmıştır: eskiden yalnız muharebeden sonra yeniden
  // kuruluyordu, limana dönen kol o hafta hâkimiyette, ablukada ve haritada
  // (rozet) denizde sayılıyordu — panel "withdrawn" derken harita "orada".
  if (reports.length || evasions.length) presence = buildPresence(world);
  state.presence = presence;
  state.closed = new Map();
  state.marks = null;
  state.blockade = computeBlockade(world, presence);
  state.losses = [...interceptTransports(game, presence).entries()];
  for (const report of reports) state.reports.push(report);
  for (const record of evasions) state.evasions.push(record);
  for (const nation of world.nations) if (nation.alive) repair(world, nation, turn);
  announce(game, reports, state.losses, evasions, before);
  return reports;
}

/**
 * Varış. Denizaltı varış haftasında girer (kendi başına avlanır). Yüzey kolu
 * düşmanın tuttuğu (geçen haftanın tablosu) ve bizim kimsenin olmadığı denize
 * birlikte girer: önden gelen en çok RENDEZVOUS_WEEKS sonuncuyu bekler (S2).
 * Zar yok; bekleme eta'dan türer, kayda yeni alan girmez.
 */
function arrive(world, nation, turn, previous) {
  const groups = new Map();
  for (const ship of shipsOf(nation)) {
    if (!(ship.zone >= 0) || ship.at >= 0) continue;
    if (isSub(ship)) {
      if (turn >= ship.eta) ship.at = ship.zone;
      continue;
    }
    if (docked(ship, turn)) continue;
    if (!groups.has(ship.zone)) groups.set(ship.zone, []);
    groups.get(ship.zone).push(ship);
  }
  for (const [zoneId, list] of groups) {
    let first = Infinity;
    let last = -Infinity;
    for (const ship of list) {
      first = Math.min(first, ship.eta ?? turn);
      last = Math.max(last, ship.eta ?? turn);
    }
    const contested = zoneBalance(world, previous, nation.id, zoneId).hostile > 0
      && !surfaceOf(nation).some((ship) => ship.at === zoneId);
    const wait = contested && turn < last && turn < first + RENDEZVOUS_WEEKS;
    if (wait) continue;
    for (const ship of list) if (turn >= ship.eta) ship.at = zoneId;
  }
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
  state.marks = null;
  state.blockade = computeBlockade(world, state.presence);
  return state;
}

/**
 * Yeni sınıfın dünyadaki ilk gemisi: herkese duyurulur, bir kez. Oyuncunun
 * filosu o gün eskir; haber bunu söylemeli, yoksa güç düşüşü sessiz kalır.
 */
function announceFirsts(game) {
  const world = game.world;
  const player = game.turns?.playerNation ?? -1;
  for (const [key, first] of Object.entries(world.navyFirsts ?? {})) {
    if (first.announced) continue;
    first.announced = true;
    const gen = Number(key);
    const cls = SHIP_CLASSES[gen];
    const older = SHIP_CLASSES[gen - 1];
    if (!cls || !older) continue;
    // Dünya tarihi: sınıfın ilk gemisi bütün donanmaları bir günde eskitir.
    const owner = world.nations[first.nation]?.name ?? 'A rival';
    recordHistory(world, {
      turn: first.turn ?? world.turn, kind: HISTORY_KIND.NAVAL, tier: TIER.MAJOR,
      title: gen === 1 ? 'The Dreadnought Revolution' : 'The carrier age begins',
      detail: `${owner} commissions ${first.ship}, the world's first ${cls.name.toLowerCase()}. ${older.plural[0].toUpperCase()}${older.plural.slice(1)} now fight at ${Math.round(older.power / cls.power * 100)}% of her.`,
      actors: [first.nation], at: null, key: `first-class-${gen}`,
    });
    if (player < 0) continue;
    const ratio = Math.round(older.power / cls.power * 100);
    const who = world.nations[first.nation]?.name ?? 'A rival';
    const text = first.nation === player
      ? `Our ${first.ship} is the world's first ${cls.name.toLowerCase()}. Every ${older.name.toLowerCase()} afloat — ours too — now fights at ${ratio}% of her.`
      : gen === 1
        ? `The Dreadnought Revolution: ${who} commissions ${first.ship}, the first all-big-gun battleship. Every fleet afloat is obsolete — ${older.plural} fight at ${ratio}% of a dreadnought.`
        : `The carrier age: ${who} commissions ${first.ship}, a capital ship with its own air wing. ${older.plural[0].toUpperCase()}${older.plural.slice(1)} fight at ${ratio}% of a carrier group.`;
    game.turns.addLog(text, { kind: 'NAVAL', key: `first-class-${gen}` });
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "23 Jan": haftanın takvim günü (bildirim ve döküm cümleleri). */
export function dayMonth(turn) {
  const date = dateOfTurn(turn);
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

const nameOf = (world, ids) => ids.map((id) => world.nations[id]?.name).filter(Boolean).join(', ') || 'the enemy';
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const str1 = (value) => (value ?? 0).toFixed(1);

/**
 * KESİN muharebe: toplam üç batan ya da en az iki gemilik bir taraf yarısını
 * yitirdi. Ölçüldü: 27-32 muharebede 20-22 batan (muharebe başına 0.7),
 * 20 yılda 3-4 tek taraflı sonuç → muharebelerin ~%10-15'i; fiilen savaşan
 * her deniz savaşına bir vakayiname satırı.
 */
export function decisiveBattle(report) {
  const sunk = report.sides.reduce((sum, side) => sum + side.sunk.length, 0);
  return sunk >= 3 || report.sides.some((side) => side.ships >= 2 && side.sunk.length * 2 >= side.ships);
}

/** Muharebe kaydının oyuncu açısından başlığı ve gövdesi (bildirim + vakayiname). */
export function battleNarrative(world, report, playerId) {
  const zones = seaZonesOf(world).zones;
  const mine = report.sides.findIndex((side) => side.nations.includes(playerId));
  const sea = zones[report.zone]?.name ?? 'the sea';
  const place = report.name.replace(/^Battle of /, '');
  const decisive = decisiveBattle(report);
  if (mine < 0) {
    const [a, b] = report.sides;
    const winner = report.sides[report.winner];
    return {
      decisive,
      title: `${decisive ? 'Decisive battle' : 'Battle'} of ${place}`,
      body: `${nameOf(world, a.nations)} (${a.ships}) against ${nameOf(world, b.nations)} (${b.ships}) in ${sea}: ${nameOf(world, winner.nations)} held the sea. Sunk: ${a.sunk.length + b.sunk.length}.`,
    };
  }
  const us = report.sides[mine];
  const them = report.sides[1 - mine];
  const won = report.winner === mine;
  const enemy = nameOf(world, them.nations);
  const until = dayMonth(report.turn + WITHDRAW_WEEKS);
  const theirLoss = them.sunk.length ? ` Sunk: ${them.sunk.map((s) => s.name).join(', ')}.` : '';
  const ourLoss = us.sunk.length ? ` We lost ${us.sunk.map((s) => s.name).join(', ')}.` : '';
  const damaged = us.damaged ? ` ${us.damaged} of ours damaged${us.returned ? `, ${us.returned} sent home for repair` : ''}.` : '';
  const aftermath = won
    ? ` ${enemy}'s fleet is in port until ${until}.`
    : ` Our squadron returns to port until ${until}.`;
  const title = decisive
    ? (won ? `Decisive victory at ${place}` : `Disaster at ${place}`)
    : `${report.name} — ${won ? 'victory' : 'defeat'}`;
  return {
    decisive,
    won,
    title,
    body: `Our ${plural(us.ships, 'ship')} (${str1(us.before)}) against ${enemy}'s ${them.ships} (${str1(them.before)}) in ${sea}.${theirLoss}${ourLoss}${damaged}${aftermath}`,
  };
}

/** Kaçınma kaydının oyuncu açısından cümlesi. `auto`: Auto denizi mi. */
export function evasionNarrative(world, record, playerId, { memo = null } = {}) {
  const zones = seaZonesOf(world).zones;
  const sea = zones[record.zone]?.name ?? 'the sea';
  const [weak, strong] = record.sides;
  const weWithdrew = weak.nations.includes(playerId);
  const until = dayMonth(record.until);
  if (weWithdrew) {
    const enemy = nameOf(world, strong.nations);
    return {
      ours: true,
      title: `No battle in ${sea}`,
      body: `Our squadron (${plural(weak.ships, 'ship')}${weak.sailing ? ` + ${weak.sailing} still sailing` : ''}, ${str1(weak.before)}) refused ${enemy}'s fleet (${plural(strong.ships, 'ship')}, ${str1(strong.before)}): less than half as strong. In port until ${until}.${memo ? ` Auto keeps away until our ready fleet reaches ${str1(memo.need)} or ${dayMonth(memo.expires)}.` : ''}`,
    };
  }
  const enemy = nameOf(world, weak.nations);
  return {
    ours: false,
    title: `${enemy}'s fleet refused battle`,
    body: `${enemy}'s ${plural(weak.ships, 'ship')} (${str1(weak.before)}) withdrew from ${sea} before our ${strong.ships} (${str1(strong.before)}): the sea is ours. They cannot return before ${until}.`,
  };
}

/** Ulusun kıyısını ablukaya alanlar ve en ağır deniz (bildirim cümlesi). */
function blockersOf(world, presence, nationId) {
  const zones = seaZonesOf(world).zones;
  let worst = null;
  for (const [zoneId] of homeZones(world, nationId)) {
    if (!presence?.has(zoneId)) continue;
    const share = blockadeShare(world, presence, nationId, zones[zoneId]);
    if (share <= 0.01) continue;
    if (!worst || share > worst.share) {
      const by = [...presence.get(zoneId).keys()].filter((id) => id !== nationId && atWar(world, nationId, id));
      worst = { zone: zoneId, share, by };
    }
  }
  return worst;
}

function announce(game, reports, losses, evasions = [], before = null) {
  announceFirsts(game);
  const world = game.world;
  const turn = world.turn ?? game.turns?.turn ?? 0;
  const zones = seaZonesOf(world).zones;
  const player = game.turns?.playerNation ?? -1;
  // DÜNYA TARİHİ: bütün deniz muharebeleri (kesin olanı büyük harfle) ve
  // ulusal ablukanın başlaması. Kaçınma tarihe girmez: haftalık gürültü.
  for (const report of reports) {
    const story = battleNarrative(world, report, -1);
    recordHistory(world, {
      turn, kind: HISTORY_KIND.NAVAL, tier: story.decisive ? TIER.MAJOR : TIER.IMPORTANT,
      title: story.title, detail: story.body,
      actors: report.sides.flatMap((side) => side.nations),
      at: anchorAt(world, report.zone), key: report.id,
    });
  }
  if (before) {
    const now = world.navyState?.blockade ?? [];
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const was = before.blockade[nation.id] ?? 0;
      const is = now[nation.id] ?? 0;
      if (!(was < 0.10 && is >= 0.10)) continue;
      const worst = blockersOf(world, world.navyState.presence, nation.id);
      if (!worst) continue;
      recordHistory(world, {
        turn, kind: HISTORY_KIND.NAVAL, tier: TIER.IMPORTANT,
        title: `Blockade of ${nation.name}`,
        detail: `${nameOf(world, worst.by)} hold${worst.by.length === 1 ? 's' : ''} ${zones[worst.zone]?.name ?? 'the sea'}: ${nation.name}'s sea trade with partners it does not border loses ${Math.round(is * 100)}%.`,
        actors: [...worst.by, nation.id], at: anchorAt(world, worst.zone), key: `blockade-${nation.id}-${turn}`,
      });
    }
  }
  if (player < 0) return;
  const me = world.nations[player];
  for (const report of reports) {
    const mine = report.sides.findIndex((side) => side.nations.includes(player));
    if (mine < 0) continue;
    const story = battleNarrative(world, report, player);
    const meta = {
      kind: 'NAVAL', tier: story.decisive ? TIER.MAJOR : TIER.IMPORTANT, title: story.title, body: story.body,
      tone: story.won ? 'good' : 'bad', tile: anchorTile(world, report.zone),
      key: `naval-${report.zone}-${report.turn}`, report: report.id,
    };
    if (story.decisive && me) recordChronicle(me, { turn, kind: 'NAVAL', tier: TIER.MAJOR, title: story.title, detail: story.body });
    game.turns.addLog(`${story.title} — ${story.body}`, meta);
  }
  for (const record of evasions) {
    const involved = record.sides.findIndex((side) => side.nations.includes(player));
    if (involved < 0) continue;
    const auto = involved === 0 && zonePriority(me, record.zone).mode !== 'manual';
    const memo = auto ? refusalMemo(world, me, record.zone, turn) : null;
    const story = evasionNarrative(world, record, player, { memo });
    game.turns.addLog(`${story.title} — ${story.body}`, {
      kind: 'NAVAL',
      // Elle verilen emrin kaçınması önemlidir (emir "hiçbir şey yapmadı"
      // görünmesin); Auto'nunki ve düşmanın kaçması akışta geçer.
      tier: story.ours && !auto ? TIER.IMPORTANT : TIER.AMBIENT,
      tone: story.ours ? 'bad' : 'good',
      title: story.title, body: story.body + (story.ours && !auto ? ' Your order stays.' : ''),
      tile: anchorTile(world, record.zone),
      key: story.ours ? `naval-evade-${record.zone}` : `naval-drove-${record.zone}`,
      report: record.id,
    });
  }
  if (before && me) announceBlockades(game, me, before);
  for (const [nationId, row] of losses) {
    if (nationId !== player || row.men < 1) continue;
    game.turns.addLog(
      `Transports attacked in ${zones[row.zone]?.name ?? 'enemy waters'}: ${Math.round(row.men).toLocaleString('en-US')} men lost at sea${row.sunk ? `, ${row.sunk} division${row.sunk === 1 ? '' : 's'} gone` : ''}.`,
      { kind: 'NAVAL', key: `transport-${row.zone}` },
    );
  }
}

/** Bölgenin derin noktası (haritada işaretin ve bildirimin yeri). */
export function anchorTile(world, zoneId) {
  const zone = seaZonesOf(world).zones[zoneId];
  return zone ? world.tiles[zone.anchor] ?? null : null;
}

function anchorAt(world, zoneId) {
  const tile = anchorTile(world, zoneId);
  return tile ? { q: tile.q, r: tile.r } : null;
}

/**
 * Oyuncunun abluka geçişleri: kıyımız ablukada / kalktı, ablukamız başladı.
 * Geçen haftanın tablosuyla kıyaslanır (kayda yeni alan girmez).
 */
function announceBlockades(game, me, before) {
  const world = game.world;
  const state = world.navyState;
  const zones = seaZonesOf(world).zones;
  const was = before.blockade[me.id] ?? 0;
  const is = state.blockade[me.id] ?? 0;
  if (was < 0.10 && is >= 0.10) {
    const worst = blockersOf(world, state.presence, me.id);
    const sea = worst ? zones[worst.zone]?.name ?? 'the sea' : 'our waters';
    const by = worst ? nameOf(world, worst.by) : 'The enemy';
    game.turns.addLog(`Our coast is blockaded — ${by} holds ${sea}.`, {
      kind: 'NAVAL', tier: TIER.IMPORTANT, tone: 'bad', title: 'Our coast is blockaded',
      body: `${by} holds ${sea}: sea trade with partners we do not border −${Math.round(is * 100)}%. Win that sea to lift it.`,
      tile: worst ? anchorTile(world, worst.zone) : null, key: 'blockade-us',
    });
  } else if (was >= 0.05 && is < 0.05) {
    game.notifications?.dismissKeys?.('blockade-us');
    game.turns.addLog('The blockade of our coast is lifted.', {
      kind: 'NAVAL', tier: TIER.AMBIENT, tone: 'good', title: 'Blockade lifted',
      body: 'No enemy fleet holds the seas off our coast: sea trade flows again.', key: 'blockade-lifted',
    });
  }
  for (const enemy of world.nations) {
    if (!enemy.alive || enemy.id === me.id || !atWar(world, me.id, enemy.id)) continue;
    for (const [zoneId] of homeZones(world, enemy.id)) {
      if (!state.presence.get(zoneId)?.has(me.id)) continue;
      const zone = zones[zoneId];
      const now = blockadeShare(world, state.presence, enemy.id, zone);
      const then = before.presence?.has(zoneId) ? blockadeShare(world, before.presence, enemy.id, zone) : 0;
      if (!(then < 0.5 && now >= 0.5)) continue;
      game.turns.addLog(`We blockade ${enemy.name} in ${zone.name}.`, {
        kind: 'NAVAL', tier: TIER.AMBIENT, tone: 'good', title: `We blockade ${enemy.name}`,
        body: `${zone.name}: ${Math.round(now * 100)}% of ${enemy.name}'s coast there; ${enemy.name}'s sea trade −${Math.round((state.blockade[enemy.id] ?? 0) * 100)}%.`,
        tile: anchorTile(world, zoneId), key: `blockading-${enemy.id}`,
      });
    }
  }
}

/**
 * Auto'nun bu denizdeki etkin kaçınma hafızası, oyuncuya okunacak hâliyle:
 * ne zaman, kime karşı; dönmek için gereken hazır filo gücü, düşmanın
 * düşmesi gereken güç ve hafızanın bittiği hafta. Elle seçilen denizde yok.
 */
export function refusalMemo(world, nation, zoneId, turn = world.turn ?? 0) {
  if (!nation || zonePriority(nation, zoneId).mode === 'manual') return null;
  const memo = activeMemo(world, nation, zoneId, turn);
  if (!memo) return null;
  const ours = fleetStrength(nation, turn);
  return {
    ...memo, now: ours, need: Math.max(memo.ours * REFUSE_MARGIN, memo.theirs / CONTEST_RATIO),
    retakeBelow: Math.min(memo.theirs / REFUSE_MARGIN, ours * CONTEST_RATIO), expires: memo.turn + REFUSE_WEEKS,
  };
}

// --------------------------------------------------------------- DÖKÜM ---

/** Haritadaki muharebe ve kaçınma işaretinin ömrü (hafta). */
export const MARK_WEEKS = 2;

/**
 * Bir ulus için denizin hâli: 'ours' (dost gemi var, düşman yok), 'open'
 * (savaş gemisi yok), 'contested' (düşman payı yarının altında: ordu
 * geçebilir), 'held' (düşman yarıdan fazlasını tutuyor: kapalı deniz,
 * closedSeas ile aynı eşik). Hâkimiyet tablosundan; ekran bunu okur.
 */
export function zoneStatus(world, nationId, zoneId) {
  const presence = world.navyState?.presence;
  const { friendly, hostile } = zoneBalance(world, presence, nationId, zoneId);
  if (!(hostile > 0)) return { state: friendly > 0 ? 'ours' : 'open', share: 0, holders: [], friendly, hostile };
  const holders = [...(presence.get(zoneId) ?? [])]
    .filter(([otherId]) => otherId !== nationId && atWar(world, nationId, otherId))
    .sort((a, b) => b[1].strength - a[1].strength || a[0] - b[0]).map(([otherId]) => otherId);
  const share = hostile / (friendly + hostile);
  return { state: share > TRANSPORT_HOLD ? 'held' : 'contested', share, holders, friendly, hostile };
}

/** Denizdeki tümenin bu denizdeki haftalık adam kaybı payı (interceptTransports ile aynı kural). */
export function transportRiskAt(world, nationId, zoneId) {
  const { share } = zoneStatus(world, nationId, zoneId);
  return share > TRANSPORT_HOLD ? TRANSPORT_LOSS * share : 0;
}

/**
 * ÖNGÖRÜ: plan uygulanınca bu denizde olacak kolumuz (iç sular bonusuyla,
 * amiral bilinmediği için hariç; müttefik gücü eklenir) ile oradaki düşman.
 * Bantlar: muharebe zarı iki tarafta U(0.75, 1.25); %10'luk fark tek zar
 * oynamasının içindedir → "denk". Yarının altı kaçınır, iki katın üstü kovar.
 */
export function forecastZone(world, nation, zoneId, plan, presence) {
  const home = homeZones(world, nation.id).has(zoneId);
  let ours = 0;
  let ships = 0;
  let weeks = 0;
  for (const ship of plan.stay) {
    if (ship.zone !== zoneId) continue;
    ours += shipStrength(nation, ship, home, null);
    ships++;
    if (ship.at !== zoneId) weeks = Math.max(weeks, Math.max(0, (ship.eta ?? 0) - (world.turn ?? 0)));
  }
  for (const [ship, order] of plan.send) {
    if (order.zone !== zoneId) continue;
    ours += shipStrength(nation, ship, home, null);
    ships++;
    weeks = Math.max(weeks, order.weeks);
  }
  const balance = zoneBalance(world, presence, nation.id, zoneId);
  const ownHere = presence?.get(zoneId)?.get(nation.id)?.strength ?? 0;
  const allies = Math.max(0, balance.friendly - ownHere);
  ours += allies;
  const theirs = balance.hostile;
  const ratio = theirs > 0 ? ours / theirs : Infinity;
  let verdict = 'hold';
  if (theirs > 0) {
    if (ours <= 0) verdict = 'none';
    else if (ratio < EVADE_RATIO) verdict = 'refuse';
    else if (ratio > 1 / EVADE_RATIO) verdict = 'drive';
    else if (ratio < 0.9) verdict = 'unfavourable';
    else if (ratio <= 1.1) verdict = 'even';
    else verdict = 'favourable';
  }
  return {
    ours, theirs, ships, weeks, allies, ratio, verdict,
    // Kaçınmamak için gereken ve "üstün" sayılmak için gereken güç.
    needFight: theirs * EVADE_RATIO, needFavour: theirs * 1.1,
    enemy: strongestHostile(world, presence, nation.id, zoneId),
  };
}

/**
 * HARİTA İŞARETLERİ (seaLayer okur, hesap kurmaz): bölge başına kapalı
 * deniz, kıyımıza ve bizim düşman kıyısına uyguladığımız abluka, yoldaki
 * gemilerimiz (çıkış denizine göre), son iki haftanın muharebe/kaçınması.
 * Haftada bir kurulur; runNavy ve refreshNavyState önbelleği siler.
 */
export function seaZoneMarks(world, playerId) {
  const state = world.navyState;
  if (!state) return new Map();
  const turn = world.turn ?? 0;
  if (state.marks?.turn === turn && state.marks.player === playerId) {
    return state.marks.list;
  }
  const list = new Map();
  const zones = seaZonesOf(world).zones;
  const get = (zoneId) => {
    if (!list.has(zoneId)) {
      list.set(zoneId, { zone: zoneId, closed: false, onUs: 0, byUs: [], underway: [], battle: null, evaded: null });
    }
    return list.get(zoneId);
  };
  const player = world.nations[playerId];
  if (player?.alive) {
    for (const zoneId of closedSeas(world, playerId)) get(zoneId).closed = true;
    const presence = state.presence;
    const enemies = world.nations.filter((other) => other.alive && other.id !== playerId && atWar(world, playerId, other.id));
    for (const zoneId of presence?.keys() ?? []) {
      const zone = zones[zoneId];
      if (!zone) continue;
      if (coastProvincesIn(world, playerId, zone)) {
        const share = blockadeShare(world, presence, playerId, zone);
        if (share > 0.01) get(zoneId).onUs = share;
      }
      if (!presence.get(zoneId).has(playerId)) continue;
      for (const enemy of enemies) {
        if (!coastProvincesIn(world, enemy.id, zone)) continue;
        const share = blockadeShare(world, presence, enemy.id, zone);
        if (share > 0.01) get(zoneId).byUs.push({ nation: enemy.id, share });
      }
    }
    const groups = new Map();
    for (const ship of surfaceOf(player)) {
      if (ship.zone < 0 || ship.at >= 0 || docked(ship, turn)) continue;
      const key = `${ship.zone}:${ship.from ?? -1}`;
      const row = groups.get(key) ?? { zone: ship.zone, from: ship.from ?? -1, count: 0, eta: Infinity };
      row.count++;
      row.eta = Math.min(row.eta, ship.eta ?? turn);
      groups.set(key, row);
    }
    for (const row of groups.values()) get(row.zone).underway.push({ from: row.from, count: row.count, eta: row.eta });
    for (const report of state.reports ?? []) {
      if (turn - report.turn > MARK_WEEKS) continue;
      const mine = report.sides.findIndex((side) => side.nations.includes(playerId));
      if (mine < 0) continue;
      get(report.zone).battle = {
        id: report.id ?? `b${report.turn}-${report.zone}`, turn: report.turn, won: report.winner === mine,
        sunk: report.sides[1 - mine].sunk.length, lost: report.sides[mine].sunk.length,
      };
    }
    for (const record of state.evasions ?? []) {
      if (turn - record.turn > MARK_WEEKS) continue;
      const side = record.sides.findIndex((s) => s.nations.includes(playerId));
      if (side < 0) continue;
      get(record.zone).evaded = { id: record.id, turn: record.turn, us: side === 0 };
    }
  }
  state.marks = { turn, player: playerId, list };
  return list;
}

/** Bir kaydın (muharebe ya da kaçınma) kimliği; eski kayıtlarda türetilir. */
export function actionId(record) {
  return record.id ?? `${record.evaded ? 'e' : 'b'}${record.turn}-${record.zone}`;
}

/** Kimlikle kayıt (panelin rapor kartı, bildirim tıklaması). */
export function navalAction(world, id) {
  const state = world.navyState;
  if (!state || !id) return null;
  return [...(state.reports ?? []), ...(state.evasions ?? [])].find((record) => actionId(record) === id) ?? null;
}

/** Limanda onarım hızı (haftalık sağlık payı): tersanesiz ülke yarı hızda. */
export function repairSpeed(nation) {
  return REPAIR_PER_WEEK * ((nation.economy?.ic?.dockyards ?? 0) > 0 ? 1 : 0.5);
}

/**
 * Donanma ekranının bütün sayıları (ekran formül kurmaz). İlgili bölgeler:
 * iç sular, savaştığımız ulusların kıyısı, gemimizin olduğu, elle seçilen ve
 * haritada tıklanan (`pin`) bölgeler. `override` önizleme ağırlığıdır
 * ({zoneId: weight}).
 */
export function navyView(world, nation, override = null, { pin = null } = {}) {
  const state = world.navyState ?? refreshNavyState(world);
  const presence = state.presence;
  const zones = seaZonesOf(world).zones;
  const turn = world.turn ?? 0;
  const home = homeZones(world, nation.id);
  const ships = surfaceOf(nation);
  const real = zonePlan(world, nation, presence);
  const preview = override ? zonePlan(world, nation, presence, override) : real;
  const { targets, ready } = navyTargets(world, nation, presence, override);
  const weights = real.weights;
  const auto = real.auto;
  const alloc = planAllocation(world, nation, turn, presence, override);
  const enemies = (world.nations ?? []).filter((other) => other.alive && other.id !== nation.id
    && atWar(world, nation.id, other.id));
  const reach = reachableZones(world, home);
  const interest = new Set([...home.keys()]);
  for (const enemy of enemies) for (const [zoneId] of homeZones(world, enemy.id)) interest.add(zoneId);
  for (const ship of ships) {
    if (ship.zone >= 0) interest.add(ship.zone);
    if (ship.at >= 0) interest.add(ship.at);
  }
  for (const key of Object.keys(nation.navy?.zones ?? {})) interest.add(Number(key));
  // Denizaltı (seaLanes.js): bizimkinin avlandığı ve yükümüzün batırıldığı denizler.
  for (const ship of subsOf(nation)) if (ship.at >= 0) interest.add(ship.at);
  for (const [zoneId, row] of state.raid ?? []) if (row.has(nation.id)) interest.add(zoneId);
  // Denizdeki tümenlerimizin denizi de ilgilidir: oyuncu onları koruyabilmeli.
  for (const unit of world.units ?? []) {
    if (unit.nationId === nation.id && unit.embarked && unit.tile?.seaZone >= 0) interest.add(unit.tile.seaZone);
  }
  let pinRefused = null;
  if (pin != null && zones[pin]) {
    if (reach.has(pin)) interest.add(pin);
    else pinRefused = { zone: zones[pin], why: 'other-water' };
  }
  // Planın bu denize koyduğu gemiler (yerinde kalan + yola çıkan).
  const planned = new Map();
  for (const ship of alloc.stay) planned.set(ship.zone, (planned.get(ship.zone) ?? 0) + 1);
  const plannedWeeks = new Map();
  for (const [, order] of alloc.send) {
    planned.set(order.zone, (planned.get(order.zone) ?? 0) + 1);
    plannedWeeks.set(order.zone, Math.max(plannedWeeks.get(order.zone) ?? 0, order.weeks));
  }
  const ours = (record) => record.sides.some((side) => side.nations.includes(nation.id));
  const actions = [...(state.reports ?? []), ...(state.evasions ?? [])].filter(ours)
    .sort((a, b) => b.turn - a.turn || String(actionId(a)).localeCompare(String(actionId(b))));
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
    enemyShips.sort((a, b) => b.strength - a.strength || a.nation - b.nation);
    // Bu bölgede kıyısı olan düşmanlara uyguladığımız abluka.
    const blockading = enemies.map((enemy) => {
      const coast = coastProvincesIn(world, enemy.id, zone);
      return coast ? { nation: enemy.id, coast, share: blockadeShare(world, presence, enemy.id, zone) } : null;
    }).filter(Boolean);
    const ourCoast = coastProvincesIn(world, nation.id, zone);
    const ourBlockade = ourCoast ? blockadeShare(world, presence, nation.id, zone) : 0;
    const raidedShare = state.raid?.get(zoneId)?.get(nation.id) ?? 0;
    const ourSubs = state.subs?.get(zoneId)?.get(nation.id)?.ships.length ?? 0;
    const target = targets.get(zoneId) ?? 0;
    const present = here?.ships.length ?? 0;
    const forecastOn = balance.hostile > 0 || (override && Object.prototype.hasOwnProperty.call(override, zoneId));
    const refusals = (state.evasions ?? []).filter((record) => record.zone === zoneId
      && record.sides[0].nations.includes(nation.id));
    const held = new Map();
    for (const ship of ships) {
      if (ship.heldAt !== zoneId || !((ship.hold ?? 0) > turn)) continue;
      const row = held.get(ship.hold) ?? { count: 0, until: ship.hold, why: withdrawalCause(state, nation.id, zoneId, ship.hold) };
      row.count++;
      held.set(ship.hold, row);
    }
    const why = real.why.get(zoneId) ?? null;
    const status = zoneStatus(world, nation.id, zoneId);
    return {
      zone,
      home: home.has(zoneId),
      ourCoast,
      priority: zonePriority(nation, zoneId),
      weight: weights.get(zoneId) ?? 0,
      autoWeight: auto.get(zoneId) ?? 0,
      previewWeight: preview.weights.get(zoneId) ?? 0,
      target,
      assigned,
      sailing,
      present,
      strength: here?.strength ?? 0,
      friendly: balance.friendly,
      hostile: balance.hostile,
      control: balance.control,
      status,
      enemyShips,
      blockading,
      ourBlockade,
      transportRisk: status.share > TRANSPORT_HOLD ? TRANSPORT_LOSS * status.share : 0,
      admiral: officersOf(nation, BRANCH.NAVY).find((a) => a.seaZone === zoneId) ?? null,
      // Akın: yükümüzün bu denizde batırılan payı ve oradaki düşman denizaltısı;
      // bizim denizaltımız ve düşman yükünden batırdığı en büyük pay.
      raidedShare,
      enemySubs: [...(state.subs?.get(zoneId) ?? [])]
        .filter(([otherId]) => atWar(world, nation.id, otherId)).reduce((sum, [, entry]) => sum + entry.ships.length, 0),
      ourSubs,
      raidingShare: enemies.reduce((best, enemy) => Math.max(best, state.raid?.get(zoneId)?.get(enemy.id) ?? 0), 0),
      why: (override && Object.prototype.hasOwnProperty.call(override, zoneId)) ? preview.why.get(zoneId) ?? why : why,
      previewWhy: preview.why.get(zoneId) ?? null,
      forecast: forecastOn ? forecastZone(world, nation, zoneId, alloc, presence) : null,
      planned: planned.get(zoneId) ?? 0,
      pending: (planned.get(zoneId) ?? 0) - assigned,
      plannedWeeks: plannedWeeks.get(zoneId) ?? 0,
      // Nöbet değişimi (S3): bu denizde yaralı gövdenin yerine gelen gemi.
      relief: alloc.relieve.filter((r) => r.zone === zoneId)
        .map((r) => ({ ship: r.ship.name, hp: r.ship.hp, by: r.by.name, weeks: r.weeks })),
      refusals: { count: refusals.length, first: refusals[0] ?? null, last: refusals[refusals.length - 1] ?? null },
      memo: refusalMemo(world, nation, zoneId, turn),
      quiet: zonePriority(nation, zoneId).mode !== 'manual' && target === 0 && present === 0 && sailing === 0
        && balance.hostile <= 0 && !blockading.some((b) => b.share > 0.01) && ourBlockade <= 0.01
        && raidedShare <= 0.01 && !ourSubs && zoneId !== pin,
      pinned: zoneId === pin,
      held: [...held.values()],
    };
  }).sort((a, b) => (b.pinned - a.pinned) || (b.weight - a.weight) || (b.ourCoast - a.ourCoast) || (a.zone.id - b.zone.id));
  const inPort = ships.filter((ship) => ship.zone < 0 && ship.at < 0);
  const hullSum = ships.reduce((sum, ship) => sum + ship.hp, 0);
  const enemyRows = enemies.filter((enemy) => homeZones(world, enemy.id).size
    && [...homeZones(world, enemy.id).keys()].some((zoneId) => reach.has(zoneId)))
    .map((enemy) => {
      const fleet = surfaceOf(enemy);
      return {
        id: enemy.id,
        name: enemy.name,
        ships: fleet.length,
        inPort: fleet.filter((ship) => ship.zone < 0 && ship.at < 0).length,
        strength: fleetStrength(enemy),
        classes: SHIP_CLASSES.map((cls, gen) => ({ name: cls.name, plural: cls.plural, count: fleet.filter((ship) => (ship.gen ?? 0) === gen).length }))
          .filter((row) => row.count > 0).reverse(),
        coastBlockade: state.blockade?.[enemy.id] ?? 0,
        mainSea: [...homeZones(world, enemy.id).entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null,
      };
    }).sort((a, b) => b.strength - a.strength || a.id - b.id);
  const squadrons = squadronsOf(world, nation, ships, rows, turn);
  const idleShips = ships.filter((ship) => !docked(ship, turn) && ship.hp >= RETURN_BELOW
    && ship.zone < 0 && ship.at < 0 && (ship.eta ?? 0) <= turn);
  const anyTarget = [...targets.values()].some((value) => value > 0);
  let idle = null;
  if (idleShips.length) {
    const refused = rows.filter((row) => ['outgunned', 'refused'].includes(row.why?.code)
      || ['outgunned', 'refused'].includes(row.why?.cause?.code));
    idle = {
      count: idleShips.length,
      why: anyTarget ? 'next-week' : refused.length ? 'fleet-in-being'
        : rows.every((row) => row.weight <= 0) ? 'all-off' : 'no-reach',
      seas: refused.map((row) => ({ zone: row.zone, code: row.why?.code, need: row.why?.need ?? row.why?.cause?.need ?? 0, there: row.why?.there ?? 0 })),
    };
  }
  // Kıyımızı ablukaya alan denizler (TRADE satırı) ve bizim ablukalarımız.
  const blockers = rows.filter((row) => row.ourBlockade > 0.01).map((row) => ({
    zone: row.zone, share: row.ourBlockade, coast: row.ourCoast, by: row.enemyShips.map((e) => e.nation),
  })).sort((a, b) => b.share - a.share || a.zone.id - b.zone.id);
  const ourBlockades = enemies.map((enemy) => {
    const seas = rows.map((row) => {
      const b = row.blockading.find((entry) => entry.nation === enemy.id);
      return b && b.share > 0.01 && row.present > 0 ? { zone: row.zone, share: b.share, coast: b.coast, strength: row.friendly } : null;
    }).filter(Boolean);
    return seas.length ? {
      nation: enemy.id, name: enemy.name, seas, national: state.blockade?.[enemy.id] ?? 0,
      coastal: (world.provinces ?? []).filter((p) => p.owner === enemy.id && p.coastal).length,
    } : null;
  }).filter(Boolean);
  const transports = new Map();
  for (const unit of world.units ?? []) {
    if (unit.nationId !== nation.id || !unit.embarked || unit.hp <= 0) continue;
    const zoneId = unit.tile?.seaZone ?? -1;
    if (zoneId < 0) continue;
    const row = transports.get(zoneId) ?? {
      zone: zones[zoneId], units: [], status: zoneStatus(world, nation.id, zoneId),
      riskPerWeek: transportRiskAt(world, nation.id, zoneId),
    };
    row.units.push(unit);
    transports.set(zoneId, row);
  }
  const closed = [...closedSeas(world, nation.id)].filter((zoneId) => zones[zoneId]).map((zoneId) => {
    const status = zoneStatus(world, nation.id, zoneId);
    return { zone: zones[zoneId], holders: status.holders, share: status.share };
  });
  return {
    ships,
    ready,
    total: ships.length,
    atSea: ships.filter((ship) => ship.at >= 0).length,
    sailing: ships.filter((ship) => ship.zone >= 0 && ship.at < 0).length,
    inPort: inPort.length,
    repairing: ships.filter((ship) => ship.repairing).length,
    withdrawn: ships.filter((ship) => !ship.repairing && (ship.hold ?? 0) > turn).length,
    subs: subsOf(nation).length,
    subsAtSea: subsOf(nation).filter((ship) => ship.at >= 0).length,
    // Sınıf dökümü (yeniden eskiye) ve eskimiş gövde sayısı.
    classes: SHIP_CLASSES.map((cls, gen) => ({ ...cls, gen, count: ships.filter((ship) => (ship.gen ?? 0) === gen).length }))
      .filter((row) => row.count > 0).reverse(),
    current: SHIP_CLASSES[classIndexOf(nation)],
    obsolete: ships.filter((ship) => isObsolete(nation, ship)).length,
    // Hurda satırları (navyDock "Fleet"): grup başına gövde, limandaki pay.
    fleet: [
      ...SHIP_CLASSES.map((cls, gen) => {
        const hulls = ships.filter((ship) => (ship.gen ?? 0) === gen);
        return {
          group: gen, name: cls.name, plural: cls.plural, count: hulls.length, power: cls.power,
          inPort: hulls.filter((ship) => ship.zone < 0 && ship.at < 0).length,
          hull: hulls.length ? hulls.reduce((sum, ship) => sum + ship.hp, 0) / hulls.length : 0,
          obsolete: gen < classIndexOf(nation),
        };
      }).filter((row) => row.count > 0).reverse(),
      ...(subsOf(nation).length ? [{
        group: 'sub', name: 'Submarine', plural: 'submarines', count: subsOf(nation).length,
        inPort: subsOf(nation).filter((ship) => ship.zone < 0 && ship.at < 0).length, obsolete: false,
        hull: subsOf(nation).reduce((sum, ship) => sum + ship.hp, 0) / subsOf(nation).length,
      }] : []),
    ],
    strength: fleetStrength(nation),
    readyStrength: fleetStrength(nation, turn),
    hull: ships.length ? hullSum / ships.length : 0,
    naval: Math.max(0.3, 1 + mod(nation, 'naval')),
    enemies: enemyRows,
    enemyStrength: enemyRows.reduce((sum, row) => sum + row.strength, 0),
    atWar: enemies.length > 0,
    squadrons,
    idle,
    actions,
    blockade: state.blockade?.[nation.id] ?? 0,
    trade: { blockade: state.blockade?.[nation.id] ?? 0, blockers },
    ourBlockades,
    transports: [...transports.values()].sort((a, b) => b.units.length - a.units.length || a.zone.id - b.zone.id),
    closed,
    repairSpeed: repairSpeed(nation),
    repairStock: equipmentStock(nation, 'ships'),
    rows,
    pinRefused,
    autoSlots: real.autoSlots,
    usedZones: preview.usedZones,
    reports: (state.reports ?? []).filter((report) => report.sides.some((side) => side.nations.includes(nation.id))),
    priorityOf: (weight) => linePriorityOf(weight ?? 0),
  };
}

/** Geri çekilmenin sebebi: o hafta orada kaçınma mı, yenilgi mi oldu. */
function withdrawalCause(state, nationId, zoneId, hold) {
  const week = hold - WITHDRAW_WEEKS;
  if ((state.evasions ?? []).some((record) => record.zone === zoneId && record.turn === week
    && record.sides[0].nations.includes(nationId))) return 'refused';
  if ((state.reports ?? []).some((report) => report.zone === zoneId && report.turn === week)) return 'beaten';
  return null;
}

/**
 * FİLO NEREDE: gemi gemi değil, grup grup (deniz ve hâl başına bir satır).
 * Sıra: nöbette → yolda → limana dönen → onarımda → çekilmiş → limanda boşta.
 */
function squadronsOf(world, nation, ships, rows, turn) {
  const out = [];
  const byZone = (list) => {
    const map = new Map();
    for (const ship of list) {
      const key = ship.zone;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ship);
    }
    return map;
  };
  const rowOf = new Map(rows.map((row) => [row.zone.id, row]));
  const zones = seaZonesOf(world).zones;
  const hull = (list) => list.reduce((sum, ship) => sum + ship.hp, 0) / Math.max(1, list.length);
  const station = byZone(ships.filter((ship) => ship.at >= 0 && ship.at === ship.zone && !docked(ship, turn)));
  for (const [zoneId, list] of [...station].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])) {
    out.push({ kind: 'station', zone: zones[zoneId], row: rowOf.get(zoneId) ?? null, ships: list, hull: hull(list) });
  }
  const underway = byZone(ships.filter((ship) => ship.zone >= 0 && ship.at < 0 && !docked(ship, turn)));
  for (const [zoneId, list] of [...underway].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])) {
    const eta = Math.max(...list.map((ship) => ship.eta ?? turn));
    // S2: önden varan gemiler kolun sonuncusunu bekliyor (düşmanın denizine birlikte).
    const assembling = list.some((ship) => (ship.eta ?? turn) <= turn);
    out.push({ kind: 'underway', zone: zones[zoneId], row: rowOf.get(zoneId) ?? null, ships: list, hull: hull(list), eta, weeks: Math.max(0, eta - turn), assembling });
  }
  const returning = ships.filter((ship) => ship.zone < 0 && ship.at < 0 && (ship.eta ?? 0) > turn && !docked(ship, turn));
  if (returning.length) {
    const eta = Math.max(...returning.map((ship) => ship.eta));
    out.push({ kind: 'returning', zone: null, ships: returning, hull: hull(returning), eta, weeks: eta - turn });
  }
  const repairing = ships.filter((ship) => ship.repairing);
  if (repairing.length) {
    const speed = repairSpeed(nation);
    const weeks = Math.max(...repairing.map((ship) => Math.ceil(Math.max(0, RESUME_AT - ship.hp) / speed)));
    const travel = Math.max(0, ...repairing.map((ship) => (ship.eta ?? turn) - turn));
    out.push({
      kind: 'repairing', zone: null, ships: repairing, hull: hull(repairing), weeks: weeks + travel,
      readyAt: turn + weeks + travel, stalled: equipmentStock(nation, 'ships') < 0.01,
    });
  }
  const withdrawn = ships.filter((ship) => !ship.repairing && (ship.hold ?? 0) > turn);
  const byHeld = new Map();
  for (const ship of withdrawn) {
    const key = `${ship.heldAt ?? -1}`;
    if (!byHeld.has(key)) byHeld.set(key, []);
    byHeld.get(key).push(ship);
  }
  const state = world.navyState ?? {};
  for (const list of byHeld.values()) {
    const zoneId = list[0].heldAt ?? -1;
    const until = Math.max(...list.map((ship) => ship.hold));
    out.push({
      kind: 'withdrawn', zone: zones[zoneId] ?? null, ships: list, hull: hull(list), until,
      why: zoneId >= 0 ? withdrawalCause(state, nation.id, zoneId, until) : null,
    });
  }
  const idle = ships.filter((ship) => !docked(ship, turn) && ship.zone < 0 && ship.at < 0 && (ship.eta ?? 0) <= turn);
  if (idle.length) out.push({ kind: 'idle', zone: null, ships: idle, hull: hull(idle) });
  return out;
}
