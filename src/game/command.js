// Komuta katmani. Bir general = bir ordu grubu = bir cephe. Ucu ayri nesne
// degil, tek nesnedir.
//
// Neden boyle: eski sistemde "kim nerede durur" uc ayri yerde sakliniyordu
// (general.divisions, front.armies, cephenin sirali kare zinciri) ve her hafta
// birbirleriyle uzlastiriliyordu. Zincir, sinir tek bir kare degisince bastan
// sona ters donebiliyordu; tumenler zincirdeki *indekse* gore yerlestigi icin
// butun cephe her hafta yer degistiriyor, hicbir tumen mevkisine varamiyordu.
//
// Yeni model uc kurala dayanir:
//   1. Komuta listesi tektir: general.divisions.
//   2. Cephe saklanmaz, turetilir — dusmana bakan kendi province'lerimiz.
//   3. Her tumenin kalici bir mevkisi (post) vardir. Mevki hala cephedeyse
//      tumen yerinde kalir; cephe yeniden hesaplansa da onun icin hicbir sey
//      degismez. Istikrar buradan gelir.
//
// Hat "itilmez": taarruzda tumen onundeki dusman province'ine yurur, orayi
// alinca sinir kendiliginden ilerler. Tek gercek sinirdir.
//
// Katman notu: burasi saf veri + hesap + emir. DOM'a dokunmaz.

import { hexDistance } from '../core/hex.js';
import { atWar } from './diplomacy.js';
import { MAX_ASSAULT_DIVISIONS, startBattle } from './battles.js';
import { orderMove } from './movement.js';
import { controllerOf } from './control.js';
import { MAX_STACK, armyPower, isMoving, unitsOn } from './units.js';

const FIRST = [
  'Aleron', 'Bertran', 'Casimir', 'Dorian', 'Edric', 'Faelan', 'Gideon', 'Halvard',
  'Ivor', 'Jorund', 'Kastor', 'Lucan', 'Merrick', 'Norvald', 'Osric', 'Perrin',
  'Quintus', 'Roderic', 'Stellan', 'Tancred', 'Ulric', 'Valen', 'Wystan', 'Yoren',
];
const LAST = [
  'Vance', 'Holt', 'Marsh', 'Thorne', 'Ashcroft', 'Bellamy', 'Carrow', 'Delacroix',
  'Ebert', 'Falkner', 'Grieve', 'Harrow', 'Ivanov', 'Jarnac', 'Kessler', 'Lindqvist',
  'Moreau', 'Novak', 'Oster', 'Pryce', 'Rennick', 'Sandoval', 'Varga', 'Weiss',
];

/**
 * Nitelikler. Her biri tek bir carpani etkiler; birlesimleri generali
 * "saldirgan piyade komutani" ya da "temkinli mustahkem savunmaci" yapar.
 */
export const TRAITS = {
  OFFENSIVE: {
    id: 'OFFENSIVE', name: 'Offensive Doctrine', icon: '⚔',
    desc: 'Attacks harder, defends no better.', attack: 0.16,
  },
  DEFENSIVE: {
    id: 'DEFENSIVE', name: 'Defensive Doctrine', icon: '🛡',
    desc: 'Holds ground far better than it takes it.', defense: 0.2,
  },
  TRICKSTER: {
    id: 'TRICKSTER', name: 'Trickster', icon: '🎭',
    desc: 'Unpredictable: wider swing on every combat roll.', variance: 0.5,
  },
  LOGISTICIAN: {
    id: 'LOGISTICIAN', name: 'Logistician', icon: '📦',
    desc: 'Marches faster and recovers strength quicker.', march: 1, recovery: 0.5,
  },
  ENGINEER: {
    id: 'ENGINEER', name: 'Engineer', icon: '⚒',
    desc: 'Ignores part of the terrain and fortification bonus.', siege: 0.35,
  },
  CAVALRY_LEADER: {
    id: 'CAVALRY_LEADER', name: 'Cavalry Leader', icon: '🐎',
    desc: 'Cavalry regiments in the stack fight harder.', armBonus: 'CAVALRY', arm: 0.25,
  },
  GUNNER: {
    id: 'GUNNER', name: 'Master Gunner', icon: '💥',
    desc: 'Artillery regiments in the stack fight harder.', armBonus: 'ARTILLERY', arm: 0.3,
  },
  PLANNER: {
    id: 'PLANNER', name: 'Staff Planner', icon: '🗺',
    desc: 'Battle plans of this command mature faster.', planning: 0.5,
  },
};

export const TRAIT_IDS = Object.keys(TRAITS);

/** Yetenek tavani. Tecrube bu kademeleri doldurur. */
export const MAX_SKILL = 5;
const XP_PER_SKILL = 100;

/** Ordu grubunun durusu. Ucuncu bir kip yok: ya tutulur ya ilerlenir. */
export const STANCE = { HOLD: 'hold', ADVANCE: 'advance' };

/**
 * Saldirganlik kademesi. `cadence` bir tumenin kac haftada bir taarruza
 * kalkabildigi, `risk` ise dalmak icin gereken guc ustunlugudur. Sayilar
 * kasten yuksek: cephe WW1 gibi yavas ilerlemeli, ve tek tek dalan tumen
 * cepheyi parcalamamali.
 */
const AGGRESSION = {
  1: { label: 'Careful', cadence: 5, risk: 1.6 },
  2: { label: 'Balanced', cadence: 3, risk: 1.2 },
  3: { label: 'Aggressive', cadence: 2, risk: 0.9 },
};

export function aggressionInfo(level) {
  return AGGRESSION[Math.max(1, Math.min(3, Math.round(level) || 2))];
}

/** Plan bu hizda olgunlasir; tumenler mevkilerine oturdukca dolar. */
const PLANNING_RATE = 0.08;
/** Savunulan hatta taarruz emri icin gereken asgari hazirlik. */
const MIN_ASSAULT_PLANNING = 0.32;
/** Her yerel taarruz plan havuzunun bir kismini harcar. */
const ASSAULT_PLANNING_COST = 0.08;

/** Mevki dagitiminda "cok uzak" sayilan mesafe tavani. */
const SPREAD = 99;

// --- Kurulus ---------------------------------------------------------------

export function initCommand(world) {
  world.commandSystem = { nextId: 1 };
  for (const nation of world.nations) nation.generals = [];
}

export function ensureCommand(world) {
  if (!world.commandSystem) world.commandSystem = { nextId: 1 };
  for (const nation of world.nations) {
    if (!Array.isArray(nation.generals)) nation.generals = [];
    for (const general of nation.generals) {
      if (!Array.isArray(general.divisions)) general.divisions = [];
      if (!Array.isArray(general.front)) general.front = [];
      if (!general.stance) general.stance = STANCE.HOLD;
      if (general.target === undefined) general.target = null;
      if (typeof general.planning !== 'number') general.planning = 0;
      if (!Number.isFinite(general.nextAssaultAt)) general.nextAssaultAt = 0;
    }
  }
  return world.commandSystem;
}

export function createGeneral(world, nation, rng) {
  const system = ensureCommand(world);
  const skill = 1 + Math.floor(rng() * 3);
  // Nitelik sayisi yetenekle birlikte artar: iyi general hem guclu hem renkli.
  const count = skill >= 3 ? 2 : 1;
  const pool = [...TRAIT_IDS];
  const traits = [];
  for (let i = 0; i < count && pool.length; i++) {
    traits.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  const general = {
    id: system.nextId++,
    nationId: nation.id,
    name: `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`,
    skill,
    xp: 0,
    traits,
    // Komuta ettigi tumenlerin kimlikleri. Bir tumen yalniz tek generalde olur.
    divisions: [],
    // Duruş ve hedef: cephenin *tamami* bu ikisinden turetilir.
    stance: STANCE.HOLD,
    target: null,          // izlenen dusman ulus; null = savasta oldugumuz herkes
    planning: 0,
    nextAssaultAt: 0,
    // Son hesaplanan cephe kareleri. Turetilmis veridir; cizim ve panel bunu
    // her kare yeniden taramasin diye haftalik olarak burada saklanir.
    front: [],
    aggression: 2,         // 1 temkinli · 2 dengeli · 3 saldirgan
    battles: 0,
  };
  nation.generals.push(general);
  return general;
}

/** Kurulusta her ulkeye bir cekirdek subay kadrosu. */
export function seedGenerals(world, rng, perNation = 3) {
  ensureCommand(world);
  for (const nation of world.nations) {
    while (nation.generals.length < perNation) createGeneral(world, nation, rng);
  }
}

// --- Sorgular --------------------------------------------------------------

export function generalsOf(nation) {
  return nation?.generals ?? [];
}

export function generalById(nation, generalId) {
  return generalsOf(nation).find((candidate) => candidate.id === generalId) ?? null;
}

/** Bir tumenin bagli oldugu general. */
export function generalOfArmy(nation, army) {
  if (!army) return null;
  return generalsOf(nation).find((general) => general.divisions.includes(army.id)) ?? null;
}

/** Generalin komuta ettigi tumenler. */
export function divisionsOf(world, general) {
  if (!general) return [];
  return general.divisions
    .map((id) => world.units.find((unit) => unit.id === id))
    .filter(Boolean);
}

export function commandSize(general) {
  return general?.divisions?.length ?? 0;
}

/** Generalin son hesaplanan cephe kareleri. */
export function frontTilesOf(world, general) {
  if (!general?.front?.length) return [];
  return general.front.map((point) => world.get(point.q, point.r)).filter(Boolean);
}

/** Bir tumenin tuttugu province. */
export function postTileOf(world, unit) {
  return unit?.post ? world.get(unit.post.q, unit.post.r) : null;
}

// --- Komuta devri ----------------------------------------------------------

/**
 * Tumenleri bir generalin komutasina verir: eski komutanlarindan duserler,
 * hepsi yeni generalin altinda toplanir. Mevkileri silinir — yeni grubun
 * cephesine gore bastan dagitilacaklar.
 * @returns {number} devredilen tumen sayisi
 */
export function assignDivisions(nation, generalId, armies) {
  const general = generalById(nation, generalId);
  if (!general) return 0;
  const list = (Array.isArray(armies) ? armies : [armies])
    .filter((army) => army && army.nationId === nation.id);
  if (!list.length) return 0;
  const ids = new Set(list.map((army) => army.id));
  for (const other of generalsOf(nation)) {
    if (other.id === general.id) continue;
    other.divisions = other.divisions.filter((id) => !ids.has(id));
  }
  for (const army of list) {
    if (!general.divisions.includes(army.id)) general.divisions.push(army.id);
    army.post = null;
  }
  return ids.size;
}

/** Geriye donuk tek tumenlik atama. */
export function assignGeneral(nation, generalId, army) {
  return assignDivisions(nation, generalId, [army]) > 0;
}

/** Generalin komutasini tamamen bosaltir. */
export function unassignGeneral(world, nation, generalId) {
  const general = generalById(nation, generalId);
  if (!general) return false;
  for (const unit of divisionsOf(world, general)) unit.post = null;
  general.divisions = [];
  general.front = [];
  general.planning = 0;
  return true;
}

/** Belirli bir tumeni her komutadan cikarir (dagilan/olen tumen). */
export function releaseArmy(nation, armyId) {
  for (const general of generalsOf(nation)) {
    general.divisions = general.divisions.filter((id) => id !== armyId);
  }
}

/**
 * Guvenlik supurgesi: artik var olmayan tumenleri komutadan duşurur. Tumen
 * birden cok yoldan yok olabiliyor (muharebe, kitlik, dagitim); tek tek
 * kancalamak yerine haftada bir toparlamak daha saglam.
 */
export function reconcileCommand(world) {
  let released = 0;
  for (const nation of world.nations) {
    for (const general of generalsOf(nation)) {
      const before = general.divisions.length;
      general.divisions = general.divisions.filter(
        (id) => world.units.some((unit) => unit.id === id && unit.nationId === nation.id),
      );
      released += before - general.divisions.length;
    }
  }
  return released;
}

// --- Durus ve hedef --------------------------------------------------------

/** Saldirganlik kademesi: 1 temkinli, 2 dengeli, 3 saldirgan. */
export function setAggression(general, level) {
  if (!general) return null;
  general.aggression = Math.max(1, Math.min(3, Math.round(level) || 2));
  return general.aggression;
}

/**
 * Duruş degisimi plani sifirlar: yeni durus yeniden hazirlanmali. Ilerlemeden
 * tutmaya donmek de plani harcar, yoksa oyuncu taarruzu acip kapatarak
 * hazirligi bedavaya biriktirebiliyordu.
 */
export function setStance(world, general, stance) {
  if (!general || !Object.values(STANCE).includes(stance)) return null;
  if (general.stance === stance) return general.stance;
  general.stance = stance;
  general.planning = 0;
  return general.stance;
}

export function toggleStance(world, general) {
  return setStance(
    world, general,
    general?.stance === STANCE.ADVANCE ? STANCE.HOLD : STANCE.ADVANCE,
  );
}

/**
 * Grubun izleyecegi dusman. null = savasta oldugumuz herkes. Hedef degisince
 * cephe hemen yeniden hesaplanir; oyuncu hafta sonunu beklemesin.
 */
export function setTarget(world, general, nationId) {
  if (!general) return null;
  general.target = nationId == null ? null : Number(nationId);
  general.planning = 0;
  refreshFront(world, general);
  return general.target;
}

// --- Muharebe carpanlari ---------------------------------------------------

function traitSum(general, key) {
  if (!general?.traits?.length) return 0;
  return general.traits.reduce((sum, id) => sum + (TRAITS[id]?.[key] ?? 0), 0);
}

/**
 * Generalin muharebe carpani. Yetenek her kademede %6, nitelikler kendi
 * alanlarinda ekler. Generalsiz ordu 1.0 alir — ceza degil, sadece bonussuz.
 */
export function generalModifier(general, { defending = false, army = null } = {}) {
  if (!general) return 1;
  let bonus = general.skill * 0.06;
  bonus += defending ? traitSum(general, 'defense') : traitSum(general, 'attack');
  // Kol bonusu yigindaki o koldan alaylarin payi kadar etki eder.
  const armTrait = general.traits?.find((id) => TRAITS[id]?.armBonus);
  if (armTrait && army?.regiments?.length) {
    const wanted = TRAITS[armTrait].armBonus;
    const share = army.regiments.filter((r) => r.typeId === wanted).length / army.regiments.length;
    bonus += TRAITS[armTrait].arm * share;
  }
  return 1 + bonus;
}

/** Muhendis generalin gormezden geldigi arazi/tahkimat payi. */
export function generalSiegeRelief(general) {
  return Math.min(0.6, traitSum(general, 'siege'));
}

/** Muharebe zarindaki ek oynaklik (Trickster). */
export function generalVariance(general) {
  return traitSum(general, 'variance');
}

/** Yuruyus hizina ek (Logistician). */
export function generalMarchBonus(general) {
  return traitSum(general, 'march');
}

/** Lojistikci komutanin haftalik takviye hizina ek orani. */
export function generalRecoveryBonus(general) {
  return traitSum(general, 'recovery');
}

/**
 * Olgunlasmis planin muharebe bonusu. Yalniz *ilerleyen* grup alir: hazirlik
 * taarruz icindir, savunmada beklemenin odulu degil.
 */
export function planningBonus(nation, army) {
  const general = generalOfArmy(nation, army);
  if (!general || general.stance !== STANCE.ADVANCE) return 1;
  return 1 + (general.planning ?? 0) * 0.25;
}

/** Yeni bir province muharebesi plani harcar; takviye ayni plani ikinci kez yemez. */
export function consumeAssaultPlanning(nation, army, turn = null) {
  const general = generalOfArmy(nation, army);
  if (!general) return 0;
  if (Number.isFinite(turn)) {
    const maturity = general.planning >= 1 ? 0 : general.planning >= 0.5 ? 1 : 2;
    const cadence = aggressionInfo(general.aggression).cadence + maturity;
    general.nextAssaultAt = Math.max(general.nextAssaultAt ?? 0, turn + cadence);
  }
  if (general.stance !== STANCE.ADVANCE) return general.planning ?? 0;
  general.planning = Math.max(0, (general.planning ?? 0) - ASSAULT_PLANNING_COST);
  return general.planning;
}

/** Muharebeden tecrube: her raund bir miktar, kademe dolunca yetenek artar. */
export function addExperience(general, amount) {
  if (!general || general.skill >= MAX_SKILL) return false;
  general.xp += amount;
  let promoted = false;
  while (general.xp >= XP_PER_SKILL && general.skill < MAX_SKILL) {
    general.xp -= XP_PER_SKILL;
    general.skill++;
    promoted = true;
  }
  if (general.skill >= MAX_SKILL) general.xp = 0;
  return promoted;
}

/** Yeni subay yetistirmenin bedeli; kadro buyudukce pahalanir. */
export function generalCost(nation) {
  return { gold: 60 + generalsOf(nation).length * 25 };
}

// --- Cephenin turetilmesi --------------------------------------------------

/**
 * Butun dunyayi tek gecişte tarayip her ulusun sinir karelerini cikarir.
 * General basina ayri tarama yapmak 6500 kareli haritada haftada milyonlarca
 * islem demekti; tarama bir kez yapilir, gruplar payini buradan alir.
 *
 * @returns {Array<{ byNation: Map<number, object[]>, hostile: object[], foreign: object[] }>}
 */
function scanBorders(world) {
  const out = world.nations.map(() => ({
    byNation: new Map(), hostile: [], foreign: [], frontier: [],
  }));
  world.forEach((tile) => {
    const owner = controllerOf(tile);
    if (owner < 0 || !tile.terrain.passable) return;
    const entry = out[owner];
    if (!entry) return;
    let foreign = false;
    let hostile = false;
    let frontier = false;
    for (const near of world.neighbors(tile)) {
      const nearOwner = controllerOf(near);
      if (!near.terrain.passable || nearOwner === owner) continue;
      // Sahipsiz toprak da bir sinirdir: baristaki ordu grubunun ilerledigi yer.
      if (nearOwner < 0) {
        frontier = true;
        continue;
      }
      foreign = true;
      const list = entry.byNation.get(nearOwner);
      if (!list) entry.byNation.set(nearOwner, [tile]);
      else if (list[list.length - 1] !== tile) list.push(tile);
      if (atWar(world, owner, nearOwner)) hostile = true;
    }
    if (foreign) entry.foreign.push(tile);
    if (hostile) entry.hostile.push(tile);
    // Yabanci sinira da bakan kare iki listede birden olmasin.
    if (frontier && !foreign) entry.frontier.push(tile);
  });
  return out;
}

/** Barista ya da savasta dogrudan sinir paylastigimiz hedef ulkeler. */
export function borderNationIds(world, nationId) {
  const entry = scanBorders(world)[nationId];
  return entry ? [...entry.byNation.keys()] : [];
}

/**
 * Bir grubun cephesi.
 *
 *   hedef varsa  → o ulkeyle olan sinirimiz
 *   savastaysak  → dusmana bakan butun sinirimiz
 *   baristaysak  → yabanci sinir + sahipsiz toprak sinirimiz
 *
 * Son satir onemli: savas yokken de grubun bir hatti olur, ilerleme kipinde
 * bos topraga dogru genisler. Genisleme ayri bir davranis degil, ayni cephenin
 * savas ilan edilmemis hali.
 */
function frontFor(general, borders) {
  const entry = borders[general.nationId];
  if (!entry) return [];
  if (general.target != null) return entry.byNation.get(general.target) ?? [];
  if (entry.hostile.length) return entry.hostile;
  return entry.foreign.concat(entry.frontier);
}

/** Tek bir grubun cephesini yeniden hesaplar (hedef degisince gerekir). */
export function refreshFront(world, general) {
  if (!general) return [];
  const front = frontFor(general, scanBorders(world));
  general.front = front.map((tile) => ({ q: tile.q, r: tile.r }));
  return front;
}

// --- Mevki dagitimi --------------------------------------------------------

/**
 * Tumenleri cepheye dagitir. Iki kural:
 *
 *   1. Mevkisi hala cephede olan tumen yerinde kalir. Cephe her hafta yeniden
 *      hesaplansa da onun icin hicbir sey degismez; oturmus hat bozulmaz.
 *      Eski sistemin asil hatasi buydu — hat sirali bir liste oldugu icin
 *      sinirdaki tek bir degisiklik butun tumenleri yeniden yurutuyordu.
 *   2. Bostaki tumen cephenin *en zayif* yerine gider: dolu mevkilere hex
 *      mesafesi en buyuk olan kare. Olcu mesafedir, hattaki sira degil; sinir
 *      ters siralansa bile sonuc ayni kalir.
 */
function assignPosts(world, divisions, front) {
  if (!front.length) {
    for (const unit of divisions) unit.post = null;
    return;
  }
  const index = new Map(front.map((tile, i) => [tile, i]));
  // Tumen sayisi cepheyi asarsa mevkiler katlanir; yigin tavani asilmaz.
  const capacity = Math.max(1, Math.min(MAX_STACK, Math.ceil(divisions.length / front.length)));
  const count = new Array(front.length).fill(0);
  // gap[i]: i numarali kareye en yakin *dolu* mevkinin uzakligi. Buyukse orasi
  // cephenin zayif yeridir.
  const gap = new Array(front.length).fill(SPREAD);

  const claim = (i) => {
    count[i]++;
    if (count[i] > 1) return;
    const tile = front[i];
    for (let j = 0; j < front.length; j++) {
      const distance = hexDistance(tile.q, tile.r, front[j].q, front[j].r);
      if (distance < gap[j]) gap[j] = distance;
    }
  };

  const homeless = [];
  for (const unit of divisions) {
    const post = postTileOf(world, unit);
    const at = post ? index.get(post) : undefined;
    if (at === undefined || count[at] >= capacity) homeless.push(unit);
    else claim(at);
  }

  for (const unit of homeless) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < front.length; i++) {
      if (count[i] >= capacity) continue;
      // Zayiflik birincil, orduya yakinlik ikincil.
      const score = gap[i] * 10
        - hexDistance(unit.tile.q, unit.tile.r, front[i].q, front[i].r);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0) {
      unit.post = null;
      continue;
    }
    claim(best);
    unit.post = { q: front[best].q, r: front[best].r };
  }
}

// --- Haftalik isleyis ------------------------------------------------------

/** Yalniz gercekten muharebeye yazilacak, combat-width icindeki tumenlerin gucu. */
export function participatingAttackPower(units) {
  const list = Array.isArray(units) ? units : [units];
  return list.slice(0, MAX_ASSAULT_DIVISIONS)
    .reduce((sum, unit) => sum + armyPower(unit), 0);
}

/** Mevkisine yurumeyen tumenleri yola cikarir. */
function march(game, divisions) {
  for (const unit of divisions) {
    if (unit.battleId || (unit.retreatUntil ?? 0) > game.turns.turn) continue;
    const post = postTileOf(game.world, unit);
    if (!post || unit.tile === post) continue;
    // Zaten oraya yuruyorsa yolu yeniden kurmayiz: her hafta yeni yol vermek
    // orduyu ilerledigi yerde durdurup bastan baslatiyordu.
    if (isMoving(unit)) continue;
    orderMove(game, unit, post);
  }
}

/**
 * Tumenin onundeki hedef province: bitisikteki dusman topragi ya da sahipsiz
 * toprak. Sayica ustun degilsek dalmayiz — tek tek dalan tumen hem oluyor hem
 * sinirlari parcaliyordu (bordergore).
 */
function readyForOperation(game, unit) {
  return unit && !unit.battleId && !isMoving(unit) && !unit.embarked
    && (unit.retreatUntil ?? 0) <= game.turns.turn
    && (unit.attackReadyAt ?? 0) <= game.turns.turn;
}

/** Hedefe bitisik, ayni komutadaki gercek katilimcilar; en fazla combat width. */
function operationParticipants(game, divisions, target) {
  return divisions.filter((unit) => (
    readyForOperation(game, unit)
    && hexDistance(unit.tile.q, unit.tile.r, target.q, target.r) === 1
  )).sort((a, b) => armyPower(b) - armyPower(a) || a.id - b.id)
    .slice(0, MAX_ASSAULT_DIVISIONS);
}

/** AI'nin gorebildigi savunma: arazi, sehir ve gercek tahkimat. */
function estimatedDefense(tile, defenders) {
  const cover = (tile.terrain.defense ?? 0)
    + (tile.city ? 0.12 + tile.city.level * 0.04 : 0);
  return defenders.reduce((sum, unit) => (
    sum + armyPower(unit) * (1 + cover) * (1 + (unit.entrenchment ?? 0))
  ), 0);
}

/**
 * Bir general cadence penceresinde yalniz bir dusman province'ine operasyon
 * acar. Devam eden savasa yeni bir "hayali" paket hesaplanmaz.
 */
function pickOperation(game, general, divisions, info) {
  const world = game.world;
  const targets = new Set();
  for (const unit of divisions) {
    if (!readyForOperation(game, unit)) continue;
    for (const tile of world.neighbors(unit.tile)) {
      const controller = controllerOf(tile);
      if (!tile.terrain.passable || controller < 0 || controller === unit.nationId) continue;
      if (general.target != null && controller !== general.target) continue;
      if (!atWar(world, controller, unit.nationId)) continue;
      const active = world.battleSystem?.battles?.some(
        (battle) => battle.q === tile.q && battle.r === tile.r,
      );
      if (!active) targets.add(tile);
    }
  }

  let best = null;
  let bestScore = -Infinity;
  for (const tile of targets) {
    const participants = operationParticipants(game, divisions, tile);
    if (!participants.length) continue;
    const defenders = unitsOn(tile).filter((unit) => unit.nationId !== general.nationId);
    if (defenders.some((unit) => !atWar(world, unit.nationId, general.nationId))) continue;
    const defense = estimatedDefense(tile, defenders);
    if (defense > 0 && participatingAttackPower(participants) < defense * info.risk) continue;

    const ring = world.neighbors(tile).filter((near) => near.terrain.passable);
    const targetController = controllerOf(tile);
    const friendlySides = ring.filter((near) => controllerOf(near) === general.nationId).length;
    const enemySides = ring.filter((near) => controllerOf(near) === targetController).length;
    if (friendlySides === 1 && enemySides >= 4) continue;

    const score = (tile.city ? 36 : 0) - defense
      + friendlySides * 28 - enemySides * 14;
    if (score > bestScore) {
      bestScore = score;
      best = {
        tile,
        held: defenders.length > 0,
        participants: defenders.length ? participants : [participants[0]],
      };
    }
  }
  return best;
}

function pickFrontierTarget(world, unit, reserved) {
  let best = null;
  let bestScore = -Infinity;
  for (const tile of world.neighbors(unit.tile)) {
    // Sahipli toprak ancak savasla alinir; sahipsiz topraga yurunur.
    if (!tile.terrain.passable || controllerOf(tile) >= 0 || reserved.has(tile)) continue;
    // Barista oldugumuz birinin tumeni oradaysa gecemeyiz.
    const defenders = unitsOn(tile).filter((other) => other.nationId !== unit.nationId);
    if (defenders.length) continue;

    // Sehir degerlidir ama cephe sekli daha onemlidir: cok dost kenari olan
    // hedefler bosluk kapatir, tek kenardan uzanan hedefler cikinti yaratir.
    const ring = world.neighbors(tile).filter((near) => near.terrain.passable);
    const friendlySides = ring.filter((near) => controllerOf(near) === unit.nationId).length;
    const score = (tile.city ? 20 : 0) + friendlySides * 28;
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  }
  return best;
}

/**
 * Taarruz. Hat itilmez — tumen onundeki province'e yurur. Orayi alinca sinir
 * kendiliginden ilerler ve gelecek hafta mevkisi yeniden ileriye dagitilir.
 */
function advance(game, general, divisions) {
  const world = game.world;
  const info = aggressionInfo(general.aggression);
  // Hazirliksiz taarruz agir ilerler: olgunluk cadence'i kisaltir.
  const maturity = general.planning >= 1 ? 0 : general.planning >= 0.5 ? 1 : 2;
  const cadence = info.cadence + maturity;
  const reserved = new Set();

  // Siperli hatta once plan olgunlasir, sonra general tek bir yerel operasyon
  // acar. Birlik kimliklerini degistirerek ayni hafta ek taarruz acilamaz.
  if (general.planning >= MIN_ASSAULT_PLANNING
    && game.turns.turn >= (general.nextAssaultAt ?? 0)) {
    const operation = pickOperation(game, general, divisions, info);
    if (operation) {
      const [lead, ...support] = operation.participants;
      const ok = operation.held
        ? startBattle(game, lead, operation.tile)
        : orderMove(game, lead, operation.tile);
      if (ok) {
        const committed = [lead];
        if (operation.held) {
          for (const unit of support) {
            if (startBattle(game, unit, operation.tile)) committed.push(unit);
          }
        }
        for (const unit of committed) unit.post = { q: operation.tile.q, r: operation.tile.r };
        general.nextAssaultAt = game.turns.turn + cadence;
      }
    }
  }

  // Sahipsiz toprak askeri operasyondan ayridir; eski dalgali yerlesim temposu
  // korunur ve iki tumen ayni bos province'i rezerve edemez.
  for (const unit of divisions) {
    if (!readyForOperation(game, unit)) continue;
    // Butun grup ayni hafta firlamasin: her tumen kendi sirasinda taarruz eder.
    // Kimlige gore kaydirmak cepheyi dalga dalga ilerletir.
    if ((game.turns.turn + unit.id) % cadence !== 0) continue;
    const target = pickFrontierTarget(world, unit, reserved);
    if (!target) continue;
    // Savunulan kareye yuruyusle girilmez (yol bulma dolu kareyi kapali sayar);
    // orasi dogrudan muharebedir. Bos kareye ise yurunur ve isgal edilir.
    if (!orderMove(game, unit, target)) continue;
    reserved.add(target);
    // Mevki ileri tasinir, yoksa tumen aldigi kareden hemen geri cagriliyordu.
    unit.post = { q: target.q, r: target.r };
  }
}

/** Bir ordu grubunun haftalik isleyisi. */
function runGroup(game, nation, general, borders) {
  const world = game.world;
  // Donanma cephe tutmaz: gemiler oyuncunun ve birim YZ'sinin elinde kalir.
  const divisions = divisionsOf(world, general).filter(
    (unit) => unit.hp > 0 && unit.type.domain === 'land' && !unit.embarked,
  );
  const front = frontFor(general, borders);
  general.front = front.map((tile) => ({ q: tile.q, r: tile.r }));

  if (!divisions.length) {
    general.planning = 0;
    return;
  }

  assignPosts(world, divisions, front);
  march(game, divisions);

  // Plan, tumenler mevkilerine oturdukca olgunlasir. Hazirlik "beklemek" degil
  // "yerlesmek"tir; boylece gosterge oyuncuya hattin oturdugunu da soyler.
  const settled = divisions.filter((unit) => {
    const post = postTileOf(world, unit);
    return post && unit.tile === post && !unit.battleId;
  }).length;
  const staff = traitSum(general, 'planning');
  general.planning = Math.max(0, Math.min(1, (general.planning ?? 0)
    + PLANNING_RATE * (settled / divisions.length) * (1 + staff)));

  if (general.stance === STANCE.ADVANCE) advance(game, general, divisions);
}

/**
 * Haftalik komuta isleyisi. Hareketten *once* cagrilir ki verilen emirler
 * ayni hafta yol alsin.
 */
export function runCommand(game) {
  const world = game.world;
  ensureCommand(world);
  reconcileCommand(world);
  const borders = scanBorders(world);
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const general of generalsOf(nation)) runGroup(game, nation, general, borders);
  }
  game.emit('command', game.activeGeneral ?? null);
}
