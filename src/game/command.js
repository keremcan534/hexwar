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

import { DIRS, hexesInRange } from '../core/hex.js';
import { settle } from './treasury.js';
import { atWar } from './diplomacy.js';
import { estimateBattle, selectAssault, startBattle } from './battles.js';
import { hasDirective, orderMove } from './movement.js';
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

/**
 * Subayın kolu. Donanma cephe tutmaz (bkz. runGroup), bu yüzden amiral ayrı
 * bir sistem değil aynı subayın deniz kadrosudur: filoya atanır, muharebe
 * çarpanını aynı yoldan verir, ama kara cephesine sürüklenmez.
 */
export const BRANCH = { ARMY: 'army', NAVY: 'navy' };

/**
 * Denizde anlamı olan nitelikler. Süvari/topçu uzmanlığı ve istihkâm bir
 * filoda karşılıksızdır; olmayan bonusu listelemektense havuz daraltılır.
 */
export const NAVAL_TRAIT_IDS = ['OFFENSIVE', 'DEFENSIVE', 'TRICKSTER', 'LOGISTICIAN', 'PLANNER'];

export function branchOf(general) {
  return general?.branch === BRANCH.NAVY ? BRANCH.NAVY : BRANCH.ARMY;
}

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

/**
 * Komuta tercihleri. Kadro yenilemesi ve boşta tümen dağıtımı oyuncunun
 * elinde olmalı: ikisi de haftalık ve otomatik çalışır, ama açık kapalıdır.
 */
export function ensureCommandOptions(nation) {
  const options = nation.command ?? (nation.command = {});
  if (typeof options.autoCreate !== 'boolean') options.autoCreate = true;
  // autoAssign VARSAYILAN ACIK. Kapali varsayilan, mobil-once bir oyunda her
  // yeni alayi elle generale baglamak demekti; beta kampanyayi 57 komutasiz
  // tumenle bitirdi ve "yanlis varsayilan" diye isaretledi (B2 §7-2, §24).
  // Elle yonetmek isteyen tek tikla kapatir; kayittaki acik tercih korunur.
  if (typeof options.autoAssign !== 'boolean') options.autoAssign = true;
  return options;
}

export function setCommandOption(nation, key, value) {
  const options = ensureCommandOptions(nation);
  if (key !== 'autoCreate' && key !== 'autoAssign') return null;
  options[key] = Boolean(value);
  return options[key];
}

export function initCommand(world) {
  world.commandSystem = { nextId: 1 };
  for (const nation of world.nations) {
    nation.generals = [];
    ensureCommandOptions(nation);
  }
}

export function ensureCommand(world) {
  if (!world.commandSystem) world.commandSystem = { nextId: 1 };
  for (const nation of world.nations) {
    if (!Array.isArray(nation.generals)) nation.generals = [];
    ensureCommandOptions(nation);
    for (const general of nation.generals) {
      if (!Array.isArray(general.divisions)) general.divisions = [];
      if (!Array.isArray(general.front)) general.front = [];
      if (!general.stance) general.stance = STANCE.HOLD;
      if (general.target === undefined) general.target = null;
      if (typeof general.planning !== 'number') general.planning = 0;
      if (!Number.isFinite(general.nextAssaultAt)) general.nextAssaultAt = 0;
      // Eski kayıtlarda kol yok: bütün subaylar karacıydı.
      if (general.branch !== BRANCH.NAVY) general.branch = BRANCH.ARMY;
    }
  }
  return world.commandSystem;
}

export function createGeneral(world, nation, rng, { branch = BRANCH.ARMY } = {}) {
  const system = ensureCommand(world);
  const skill = 1 + Math.floor(rng() * 3);
  // Nitelik sayisi yetenekle birlikte artar: iyi general hem guclu hem renkli.
  const count = skill >= 3 ? 2 : 1;
  const pool = branch === BRANCH.NAVY ? [...NAVAL_TRAIT_IDS] : [...TRAIT_IDS];
  const traits = [];
  for (let i = 0; i < count && pool.length; i++) {
    traits.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  // Komuta paneli yalniz ILK adi basar; iki "Kastor" ayirt edilemiyordu
  // (Open Beta 4, B-12). Kadro icinde once ilk ad, sonra tam ad tekil olsun;
  // havuz biterse (24 ad) tekrar kabul edilir, oyun durmaz.
  const taken = new Set((nation.generals ?? []).map((g) => g.name));
  const takenFirst = new Set([...taken].map((full) => full.split(' ')[0]));
  let name = null;
  for (let attempt = 0; attempt < 40 && !name; attempt++) {
    const candidate = `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
    const first = candidate.split(' ')[0];
    if (attempt < 24 ? !takenFirst.has(first) : !taken.has(candidate)) name = candidate;
  }
  name ??= `${FIRST[Math.floor(rng() * FIRST.length)]} ${LAST[Math.floor(rng() * LAST.length)]}`;
  const general = {
    id: system.nextId++,
    nationId: nation.id,
    branch: branch === BRANCH.NAVY ? BRANCH.NAVY : BRANCH.ARMY,
    name,
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

/** Tek kolun subayları. Kara komuta paneli amiralleri göstermemeli. */
export function officersOf(nation, branch = BRANCH.ARMY) {
  return generalsOf(nation).filter((general) => branchOf(general) === branch);
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
export function reconcileCommand(world, unitById = null) {
  // Kimlik tablosu: `world.units.some` taraması O(tümen × birim) yapıyordu
  // (ölçüldü: 655 birimlik dünyada komuta fazının görünür payı).
  const lookup = unitById ?? new Map(world.units.map((unit) => [unit.id, unit]));
  let released = 0;
  for (const nation of world.nations) {
    for (const general of generalsOf(nation)) {
      const before = general.divisions.length;
      general.divisions = general.divisions.filter((id) => {
        const unit = lookup.get(id);
        return !!unit && unit.nationId === nation.id;
      });
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
 * ILERLEMEDEN tutmaya donmek plani sifirlar (yeniden toparlanma). TUTMADAN
 * ilerlemeye gecmek plani KORUR: bekleyip hazirlanan ordunun taarruza
 * biriktirdigiyle girmesi tam da planlama sayacinin vaadidir — eski hali her
 * gecisi sifirlayip HOLD'da biriken plani asla odetmiyordu (sayac sahte umut
 * satiyordu). Ac-kapa istismari yine olmaz: ADVANCE->HOLD sifirladigindan
 * dongu her turda birikimi yakar, bedavaya stok yapilamaz.
 */
export function setStance(world, general, stance) {
  if (!general || !Object.values(STANCE).includes(stance)) return null;
  if (general.stance === stance) return general.stance;
  general.stance = stance;
  if (stance === STANCE.HOLD) general.planning = 0;
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
  // world.neighbors kare basina dizi kurar; haftalik tam taramada ~0.9 MB
  // coptu (olculdu). Yon tablosu dogrudan gezilir, ziyaret sirasi ayni.
  world.forEach((tile) => {
    const owner = controllerOf(tile);
    if (owner < 0 || !tile.terrain.passable) return;
    const entry = out[owner];
    if (!entry) return;
    let foreign = false;
    let hostile = false;
    let frontier = false;
    for (let d = 0; d < DIRS.length; d++) {
      const near = world.get(tile.q + DIRS[d][0], tile.r + DIRS[d][1]);
      if (!near) continue;
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
// assignPosts'un karalama depolari: general basina haftada bir kosan bu
// dagitim, cephe uzunlugu kadar Map/dizi kurup atiyordu (olculdu ~0.5 MB/
// hafta). Omurleri TEK cagridir; cagri disina referans sizmaz.
const postIndexScratch = new Map();
const postCountScratch = [];
const postGapScratch = [];
const homelessScratch = [];

function assignPosts(world, divisions, front) {
  if (!front.length) {
    for (const unit of divisions) unit.post = null;
    return;
  }
  const index = postIndexScratch;
  index.clear();
  for (let i = 0; i < front.length; i++) index.set(front[i], i);
  // Tumen sayisi cepheyi asarsa mevkiler katlanir; yigin tavani asilmaz.
  const capacity = Math.max(1, Math.min(MAX_STACK, Math.ceil(divisions.length / front.length)));
  const count = postCountScratch;
  const gap = postGapScratch;
  count.length = front.length;
  gap.length = front.length;
  for (let i = 0; i < front.length; i++) {
    count[i] = 0;
    // gap[i]: i numarali kareye en yakin *dolu* mevkinin uzakligi. Buyukse
    // orasi cephenin zayif yeridir.
    gap[i] = SPREAD;
  }

  const claim = (i) => {
    count[i]++;
    if (count[i] > 1) return;
    const tile = front[i];
    for (let j = 0; j < front.length; j++) {
      const distance = world.wrapDistance(tile.q, tile.r, front[j].q, front[j].r);
      if (distance < gap[j]) gap[j] = distance;
    }
  };

  const homeless = homelessScratch;
  homeless.length = 0;
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
        - world.wrapDistance(unit.tile.q, unit.tile.r, front[i].q, front[i].r);
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
  // Karalamalar olu birim/kare referansi tutmasin diye bosaltilir.
  homeless.length = 0;
  index.clear();
}

// --- Suda kalan tumenin kurtarilmasi ---------------------------------------

/** Cikarma noktasi bu yaricapa kadar aranir. */
const STRAND_RESCUE_RADIUS = 6;

/** Halka taramasi bosa cikarsa denenecek en yakin kendi-toprak sayisi. */
const STRAND_RESCUE_FALLBACK = 12;

/**
 * Suda kalmis kara tumenini en yakin cikarma noktasina yonlendirir.
 *
 * NEDEN GEREKLI: `runGroup` embarked tumeni `divisions` listesine ALMAZ —
 * hakli olarak, cunku denizdeki tumen cephe mevkisi tutamaz. Ama bunun yan
 * etkisi sahiplenilmemis bir birimdi: `assignPosts` ona mevki vermiyor,
 * `march` onu yurutmuyor, `advance` gormuyor. Yol bir kez dusunce
 * (movement.js `reroute`, MAX_REROUTES sonrasi `clearPath`) tumen kalici
 * olarak okyanusta kaliyordu.
 *
 * Olculdu (military-strategy-audit, 400 hafta): 17 tumen suda yetim, en uzun
 * **277 hafta**, hepsinin generali vardi. Karaya donus emri bu dongunun tek
 * cikisi.
 */
function rescueStranded(game, unit) {
  const world = game.world;
  const canEnter = game.canEnterFor(unit);
  // Yakindan uzaga: ilk bulunan uygun kara karesi en yakin kiyidir.
  for (let radius = 1; radius <= STRAND_RESCUE_RADIUS; radius++) {
    let best = null;
    let bestDistance = Infinity;
    for (const { q, r } of hexesInRange(unit.tile.q, unit.tile.r, radius)) {
      const tile = world.get(q, r);
      if (!tile || tile.terrain.water || !tile.terrain.passable) continue;
      if (!canEnter(tile)) continue;
      const distance = world.wrapDistance(unit.tile.q, unit.tile.r, q, r);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = tile;
      }
    }
    if (best && orderMove(game, unit, best)) return true;
  }
  // Yaricap icinde cikarma yeri yok. Olculen kalan vaka tam olarak buydu:
  // tarafsiz bir ulkenin kiyisiyla cevrili korfezde embarked tumen — `allowed`
  // baristaki topraga girisi (dogru sekilde) reddediyor, dolayisiyla hicbir
  // komsu kare uygun degil. Cikis: kendi topragina donmek. Yalnizca halka
  // taramasi basarisiz olunca kosar, yani pratikte cok seyrek.
  const own = [];
  world.forEach((tile) => {
    if (tile.terrain.water || !tile.terrain.passable) return;
    if (controllerOf(tile) !== unit.nationId) return;
    own.push(tile);
  });
  own.sort((a, b) => world.wrapDistance(unit.tile.q, unit.tile.r, a.q, a.r)
    - world.wrapDistance(unit.tile.q, unit.tile.r, b.q, b.r));
  for (let i = 0; i < Math.min(own.length, STRAND_RESCUE_FALLBACK); i++) {
    if (canEnter(own[i]) && orderMove(game, unit, own[i])) return true;
  }
  return false;
}

// --- Haftalik isleyis ------------------------------------------------------

/** Yalniz gercekten muharebeye yazilacak, combat-width icindeki tumenlerin gucu. */
export function participatingAttackPower(units) {
  const list = Array.isArray(units) ? units : [units];
  return selectAssault(list).reduce((sum, unit) => sum + armyPower(unit), 0);
}

/**
 * Mevkisine yurumeyen tumenleri yola cikarir.
 *
 * NOT (olculdu, denendi, GERI ALINDI): ulasilamaz bir mevkiye giden arama
 * dugum tavanina kadar acilir ve tek basina 5.4 ms + megabaytlarca cop
 * harcar; her hafta tekrarlanir. Aramaya 3000 dugumluk bir tavan koymak
 * denendi — tahsisat DUSMEDI (19.3 MB/hafta) ama dunya durumu SAPTI: capsiz
 * bulunabilen mesru yollar kayboldu, ordu bilesimi ve fabrika sayisi 530
 * haftada farklilasti. Kazanci olmayan bir davranis degisikligi tutulmaz.
 */
function march(game, divisions) {
  for (const unit of divisions) {
    if (unit.battleId || (unit.retreatUntil ?? 0) > game.turns.turn) continue;
    // HOLD emri komutani da baglar: "yerinde dur" diyen oyuncunun tumenini
    // general ertesi hafta cepheye geri yuruyordu — dugmenin vaadi sahteydi.
    // ('hold' degismezi orders.js ORDER.HOLD'dur; import etmek orders->ai->
    // command dongusu kurar, tek dizgi burada belgelenerek kullanilir.)
    if (unit.order?.type === 'hold') continue;
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
  // Kusatma genisligi: birden cok komsu kareden gelen tumenler daha genis
  // paket kurar (bkz. battles.selectAssault).
  return selectAssault(divisions.filter((unit) => (
    readyForOperation(game, unit)
    && game.world.wrapDistance(unit.tile.q, unit.tile.r, target.q, target.r) === 1
  )));
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
      // Operasyon SAVUNULAN kare icindir; savunmasiz dusman karesi yuruyus
      // pasinin isidir (pickWalkInTarget). Eskiden ikisi de buradan geciyor ve
      // bos bir kareye yurumek bile grubun tek operasyon hakkini yiyordu.
      if (!unitsOn(tile).some((other) => other.nationId !== unit.nationId)) continue;
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
    // Tartma muharebenin kendi terazisiyle yapilir (bkz. battles.estimateBattle):
    // ayri bir tahmin savunana arazi ve siperi sayip saldirana general, plan ve
    // butce carpanlarini vermiyordu; es-genislikte siperli yigin hicbir durusta
    // saldirilamaz oluyordu.
    const { attack, defense } = defenders.length
      ? estimateBattle(world, participants, defenders)
      : { attack: 0, defense: 0 };
    if (defense > 0 && attack < defense * info.risk) continue;

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

/**
 * Ilerleyen generalin onundeki savunulan hedefe bakisi: ekran icin.
 * pickOperation'la AYNI terazi (estimateBattle) ve ayni durus riski; ekran
 * kendi hesabini kurmaz. Planlama %100 gorunurken generalin neden dalmadigi
 * hicbir yerde yazmiyordu (Open Beta 4): "odds 1.04, Balanced needs 1.2".
 * Savunulan hedef yoksa null; oran ve esik ekranda cumleye doner.
 */
export function assaultOutlook(world, general, turn = world.turn ?? 0) {
  if (!general || general.stance !== STANCE.ADVANCE) return null;
  const nation = world.nations[general.nationId];
  const divisions = general.divisions
    .map((id) => world.units.find((unit) => unit.id === id))
    .filter((unit) => unit && unit.hp > 0 && unit.type.domain === 'land');
  const ready = (unit) => !unit.battleId && !isMoving(unit) && !unit.embarked
    && (unit.retreatUntil ?? 0) <= turn && (unit.attackReadyAt ?? 0) <= turn;
  const info = aggressionInfo(general.aggression);
  let best = null;
  for (const unit of divisions) {
    for (const tile of world.neighbors(unit.tile)) {
      const controller = controllerOf(tile);
      if (!tile.terrain.passable || controller < 0 || controller === nation.id) continue;
      if (general.target != null && controller !== general.target) continue;
      if (!atWar(world, controller, nation.id)) continue;
      const defenders = unitsOn(tile).filter((other) => other.nationId !== nation.id);
      if (!defenders.length) continue;
      // pickOperation ile ayni katilimci kurali: bitisik, hazir, combat width.
      const participants = selectAssault(divisions
        .filter((other) => ready(other)
          && world.wrapDistance(other.tile.q, other.tile.r, tile.q, tile.r) === 1));
      if (!participants.length) continue;
      const { attack, defense } = estimateBattle(world, participants, defenders);
      const ratio = defense > 0 ? attack / defense : Infinity;
      if (!best || ratio > best.ratio) {
        best = {
          tile, defenders: defenders.length, attackers: participants.length,
          ratio, needed: info.risk, posture: info.label,
          ready: general.planning >= MIN_ASSAULT_PLANNING
            && turn >= (general.nextAssaultAt ?? 0),
        };
      }
    }
  }
  return best;
}

/**
 * Haftada dusman topragina yuruyebilecek tumen payi: grubun 1/WALK_IN_SHARE'i
 * (en az bir). Yuruyusu SINIRSIZ acmak denendi ve OLCULDU: kartopu %39.8 ->
 * %58.7 (commit 8560122). Hic acmamak ise cepheyi dondurdu — 10 tumen, 3
 * general, agresiflik 3 ile bos cepheye ~1 hex/hafta (olculdu, 2026-09-04).
 * Pay, "hat kirilinca supurme" ile "bombos cephede bekleme" arasindaki gem.
 */
const WALK_IN_SHARE = 4;

function pickWalkInTarget(world, unit, reserved, { general = null, enemy = false } = {}) {
  let best = null;
  let bestScore = -Infinity;
  for (const tile of world.neighbors(unit.tile)) {
    if (!tile.terrain.passable || reserved.has(tile)) continue;
    const controller = controllerOf(tile);
    let hostileLand = false;
    if (controller >= 0) {
      // Sahipli toprak: yalniz savastigimiz ulkenin SAVUNMASIZ karesi ve
      // yalniz haftalik pay izin veriyorsa (bkz. WALK_IN_SHARE). Savunulan
      // kare operasyon ister (pickOperation).
      if (!enemy || controller === unit.nationId) continue;
      if (general?.target != null && controller !== general.target) continue;
      if (!atWar(world, controller, unit.nationId)) continue;
      hostileLand = true;
    }
    // Baska bir ulkenin tumeni oradaysa yuruyusle girilmez (barista gecit
    // yok, savasta orasi muharebedir).
    const defenders = unitsOn(tile).filter((other) => other.nationId !== unit.nationId);
    if (defenders.length) continue;
    if (world.battleSystem?.battles?.some((battle) => battle.q === tile.q && battle.r === tile.r)) continue;

    // Sehir degerlidir ama cephe sekli daha onemlidir: cok dost kenari olan
    // hedefler bosluk kapatir, tek kenardan uzanan hedefler cikinti yaratir.
    const ring = world.neighbors(tile).filter((near) => near.terrain.passable);
    const friendlySides = ring.filter((near) => controllerOf(near) === unit.nationId).length;
    const enemySides = hostileLand
      ? ring.filter((near) => controllerOf(near) === controller).length : 0;
    // "En az iki dost kenar" sarti denendi ve OLCULDU (audit:borders D):
    // kartopunu dusurmedi (%25/27/48 -> %37/29/48), yalniz cepheyi
    // yavaslatti; kaldirildi. Cikinti kurali (tek kenar, dort dusman kenar)
    // duruyor.
    if (hostileLand && friendlySides === 1 && enemySides >= 4) continue;
    const score = (tile.city ? 20 : 0) + friendlySides * 28 - enemySides * 14;
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
 *
 * IKI AYRI IS, IKI AYRI TEMPO — ve bunlar uzun sure ayni gemdeydi:
 *   1. YURUYUS: sahipsiz toprak ya da dusmanin SAVUNMASIZ karesi. Hazirlik
 *      istemez; bos araziye yurumek icin plan olgunlastirmanin anlami yok.
 *   2. TAARRUZ: savunulan hat. Plan ister (MIN_ASSAULT_PLANNING), cadence'e
 *      tabidir ve grup basina haftada tek operasyondur — bilerek kit.
 *
 * Eskiden savunmasiz dusman karesi de (2)'nin icindeydi: cephe bombos olsa
 * bile ordu grubu 0.32 plan biriktirmeyi bekliyor, sonra cadence basina TEK
 * hex aliyordu. Ustelik hazirliksiz baslayan taarruzda `maturity` cadence'i
 * 2'den 4'e cikardigi icin en agresif durusta bile dort haftada bir hex
 * dusuyordu. "Cephe bos ama ilerlemiyoruz" sikayetinin koku buydu.
 */
/**
 * Sabirsizlik: ilerleme durusundaki general, onunde savunulan hedef varken
 * bu kadar hafta operasyon acamazsa bir kademe daha saldirgan davranir
 * (risk esigi duser). KAPALI (Infinity): 12 hafta denendi ve olculdu —
 * donmus cepheyi (bully BULLY-1, en iyi sans 0.64-0.74, gereken 1.2)
 * ACMADI ama 50 yillik kartopunu 4-5 puan buyuttu (audit:borders A/B
 * karsilastirmasi). Mekanizma duruyor; acmak isteyen sayiyi yazsin ve
 * borders'i yeniden olcsun.
 */
const STALL_ESCALATION_WEEKS = Infinity;

function advance(game, general, divisions) {
  const world = game.world;
  const stalled = (general.stalledWeeks ?? 0) >= STALL_ESCALATION_WEEKS;
  const info = aggressionInfo(Math.min(3, general.aggression + (stalled ? 1 : 0)));
  // Hazirliksiz taarruz agir ilerler: olgunluk cadence'i kisaltir.
  const maturity = general.planning >= 1 ? 0 : general.planning >= 0.5 ? 1 : 2;
  const cadence = info.cadence + maturity;
  const reserved = new Set();

  // Siperli hatta once plan olgunlasir, sonra general tek bir yerel operasyon
  // acar. Birlik kimliklerini degistirerek ayni hafta ek taarruz acilamaz.
  // HAZIRLIK SARTI YALNIZ SAVUNULAN HEDEF ICINDIR. Savunmasiz bir kareye
  // girmek icin plan olgunlastirmak, cephe bombosken orduyu haftalarca
  // bekletiyordu; ustelik hazirliksiz baslayan taarruzda `maturity` cadence'i
  // 2'den 4'e cikardigi icin en agresif durusta bile dort haftada bir hex
  // dusuyordu. Bos kare artik yalniz TEMPOYA tabidir.
  let opened = false;
  if (game.turns.turn >= (general.nextAssaultAt ?? 0)
    && general.planning >= MIN_ASSAULT_PLANNING) {
    // Operasyon yalniz SAVUNULAN kareye acilir (pickOperation); savunmasiz
    // kare asagidaki yuruyus pasinindir ve grubun operasyon hakkini yemez.
    const operation = pickOperation(game, general, divisions, info);
    if (operation) {
      const [lead, ...support] = operation.participants;
      if (startBattle(game, lead, operation.tile)) {
        const committed = [lead];
        for (const unit of support) {
          if (startBattle(game, unit, operation.tile)) committed.push(unit);
        }
        for (const unit of committed) unit.post = { q: operation.tile.q, r: operation.tile.r };
        // Ayni kareyi asagidaki yuruyus pasi de secmesin.
        reserved.add(operation.tile);
        general.nextAssaultAt = game.turns.turn + cadence;
        opened = true;
      }
    }
  }
  // Sabirsizlik sayaci: savunulan hedef var, operasyon yok -> birikir.
  if (opened) general.stalledWeeks = 0;
  else if (assaultOutlook(world, general, game.turns.turn)) {
    general.stalledWeeks = (general.stalledWeeks ?? 0) + 1;
  } else general.stalledWeeks = 0;

  // YURUYUS: sahipsiz toprak ve savunmasiz dusman karesi. Tempo YALNIZ
  // agresiflikten gelir — `maturity` burada YOK, cunku hazirlik savunulan
  // hatta girmenin bedelidir, bos araziye yurumenin degil. Dusman karesine
  // haftada en fazla grubun WALK_IN_SHARE'de biri yurur: bos cephe ilerler
  // ama kirilan hat tek haftada supurulmez.
  const walkInCap = Math.max(1, Math.ceil(divisions.length / WALK_IN_SHARE));
  let enemyWalkIns = 0;
  for (let index = 0; index < divisions.length; index++) {
    const unit = divisions[index];
    if (!readyForOperation(game, unit)) continue;
    // Butun grup ayni hafta firlamasin: her tumen kendi sirasinda taarruz eder.
    // Faz, tumenin komuta icindeki SIRASIDIR — mutlak kimligi degil. Kimlik
    // surec omurlu bir sayactan geliyordu (units.js nextId), dolayisiyla ayni
    // tohumla kurulan ikinci dunya farkli bir cephe temposu aliyor ve bastan
    // sona baska bir oyun oluyordu (olculdu: ayni tohumdan 5 farkli sonuc).
    // Kayittan yuklemek de kimlikleri yeniden urettigi icin ayni dallanmayi
    // yaratiyordu. Sira ise dunyaya aittir: kayitta korunur, surecten bagimsizdir.
    if ((game.turns.turn + index) % info.cadence !== 0) continue;
    const target = pickWalkInTarget(world, unit, reserved, {
      general, enemy: enemyWalkIns < walkInCap,
    });
    if (!target) continue;
    if (!orderMove(game, unit, target)) continue;
    reserved.add(target);
    if (controllerOf(target) >= 0) enemyWalkIns++;
    // Mevki ileri tasinir, yoksa tumen aldigi kareden hemen geri cagriliyordu.
    unit.post = { q: target.q, r: target.r };
  }
}

/** Bir ordu grubunun haftalik isleyisi. */
function runGroup(game, nation, general, context) {
  const world = game.world;
  // Amiralin cephesi yok: filo sinir tutmaz. Hattini turetmek, haritada
  // amirale ait olmayan bir kara cephesi cizdiriyordu.
  if (branchOf(general) === BRANCH.NAVY) {
    general.front = [];
    general.planning = 0;
    return;
  }
  // Donanma cephe tutmaz: gemiler oyuncunun ve birim YZ'sinin elinde kalir.
  // Kimlik tablosundan cozulur: divisionsOf'un world.units.find'i general
  // basina O(tumen × birim) tarama biriktiriyordu.
  const divisions = [];
  for (const id of general.divisions) {
    const unit = context.unitById.get(id);
    if (!unit || unit.hp <= 0 || unit.type.domain !== 'land') continue;
    if (unit.embarked) {
      // Denizdeki tumen cephe tutamaz ama sahipsiz de kalamaz: emri dusmusse
      // karaya cikarilir (bkz. rescueStranded).
      if (!isMoving(unit) && !unit.battleId) rescueStranded(game, unit);
      continue;
    }
    divisions.push(unit);
  }
  const front = frontFor(general, context.borders);
  general.front = front.map((tile) => ({ q: tile.q, r: tile.r }));

  if (!divisions.length) {
    general.planning = 0;
    return;
  }

  // OYUNCUNUN EMRI KOMUTANI BAGLAR. Emir yuruten tumen mevki dagitimina da
  // yuruyuse de girmez: `assignPosts` onu her hafta "mevkisiz" sayip cepheye
  // geri postalıyor, `march` da oraya yürütüyordu — oyuncunun hedefi bir daha
  // hic denenmiyordu (bkz. movement.resumeDirectives'teki olcum).
  const directed = [];
  const managed = [];
  for (const unit of divisions) {
    if (hasDirective(unit)) { unit.post = null; directed.push(unit); }
    else managed.push(unit);
  }

  // Hafif profil: turun en pahalı grubu parça dökümüyle kaydedilir
  // (world.commandWorst; beginCommand sıfırlar). Donma avında "hangi general,
  // hangi parça?" sorusunu tur başına birkaç performance.now ile yanıtlar.
  const t0 = performance.now();
  assignPosts(world, managed, front);
  const t1 = performance.now();
  march(game, managed);
  const t2 = performance.now();

  // Plan, tumenler mevkilerine oturdukca olgunlasir. Hazirlik "beklemek" degil
  // "yerlesmek"tir; boylece gosterge oyuncuya hattin oturdugunu da soyler.
  const settled = managed.filter((unit) => {
    const post = postTileOf(world, unit);
    return post && unit.tile === post && !unit.battleId;
  }).length;
  const staff = traitSum(general, 'planning');
  general.planning = Math.max(0, Math.min(1, (general.planning ?? 0)
    + PLANNING_RATE * (settled / Math.max(1, managed.length)) * (1 + staff)));

  if (general.stance === STANCE.ADVANCE) advance(game, general, divisions);
  const t3 = performance.now();
  if (!world.commandWorst || t3 - t0 > world.commandWorst.total) {
    world.commandWorst = {
      nation: nation.name, divisions: divisions.length, front: front.length,
      assign: t1 - t0, march: t2 - t1, advance: t3 - t2, total: t3 - t0,
    };
  }
}

/**
 * Haftalik komuta isleyisi. Hareketten *once* cagrilir ki verilen emirler
 * ayni hafta yol alsin.
 */
/**
 * Subay kadrosunun yenilenmesi. Ölçüm: ülkeler 109 yıl boyunca kurulustaki
 * *tam olarak üç* generalle kalıyordu — ne yenisi yetişiyor ne eskisi
 * ayrılıyordu, yani `createGeneral`/`generalCost` ölü koddu ve komuta katmanı
 * yüzyıl boyunca donuktu.
 *
 * Artık kadro yaşlanır: her general yılda bir yaşlanır, yaşlananın ayrılma
 * ihtimali artar. YZ de tümen sayısına göre yeni subay yetiştirir.
 */
const GENERAL_RETIRE_AGE = 30;
export const MAX_GENERALS = 8;
export const MAX_ADMIRALS = 4;

/** Bir kolda kaç subay isteniyor: kadro emrettiği tümen sayısıyla büyür. */
function wantedOfficers(world, nation, branch) {
  let units = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id) continue;
    const naval = unit.type.domain === 'sea';
    if (naval === (branch === BRANCH.NAVY)) units++;
  }
  if (branch === BRANCH.NAVY) {
    // Filosu olmayan ülke amiral yetiştirmez; deniz kadrosu donanmayı izler.
    return units ? Math.min(MAX_ADMIRALS, Math.max(1, Math.ceil(units / 3))) : 0;
  }
  return Math.min(MAX_GENERALS, Math.max(2, Math.ceil(units / 4)));
}

function refreshOfficerCorps(game, nation, rng) {
  const world = game.world;
  if (world.turn % 52 === 0) {
    for (const general of [...generalsOf(nation)]) {
      general.age = (general.age ?? 0) + 1;
      // Otuz hizmet yılından sonra her yıl artan bir ayrılma şansı.
      const odds = (general.age - GENERAL_RETIRE_AGE) * 0.08;
      if (odds <= 0 || rng() > odds) continue;
      for (const armyId of [...general.divisions]) releaseArmy(nation, armyId);
      nation.generals = generalsOf(nation).filter((other) => other.id !== general.id);
      if (nation.id === game.turns.playerNation) {
        const rank = branchOf(general) === BRANCH.NAVY ? 'Admiral' : 'General';
        game.turns.addLog(`${rank} ${general.name} retired after ${general.age} years.`,
          { kind: 'COMMANDER' });
      }
    }
  }
  // Otomatik kadro kapalıysa boşalan yer boş kalır: subayı oyuncu yetiştirir.
  if (!ensureCommandOptions(nation).autoCreate) return;
  // Komutasız tümen kalmasın: ordu büyüdükçe kadro da büyür. Kontrol HER
  // HAFTA — yılda bir yetmiyordu: seferberlik orduyu sekiz haftada iki-uc
  // katina cikariyor ve yeni tumenler bir yila kadar komutansiz bekliyordu
  // (olculdu, military-strategy-audit: 44 tumen >=8 hafta atil, en uzun 45).
  for (const branch of [BRANCH.ARMY, BRANCH.NAVY]) {
    const wanted = wantedOfficers(world, nation, branch);
    if (officersOf(nation, branch).length >= wanted) continue;
    const cost = generalCost(nation);
    if (nation.gold < cost.gold) return;
    settle(nation, 'outlay', -cost.gold);
    // createGeneral kadroya kendisi yazar; burada ikinci kez push edilince
    // ayni subay listede iki kez duruyordu — dockta "JORUND / JORUND" ve
    // subay sayisinin fazla gorunmesi buradandi (Open Beta 4, B-12).
    createGeneral(world, nation, rng, { branch });
  }
}

/**
 * Boşta kalan tümenleri kadroya dağıtır. Mikro yönetim mobilde en pahalı
 * kalemdir (bkz. CLAUDE.md): yeni yetişen her alayı elle bir generale bağlamak
 * kuyruk sisteminin kazandırdığı zamanı geri alırdı.
 *
 * Dağıtım deterministiktir — tümenler kimlik sırasıyla, en az yüklü subaya.
 */
/** Tek subayın komuta edebileceği tümen tavanı; otomatik dağıtım bunu aşmaz. */
export const MAX_COMMAND_SIZE = 12;

export function autoAssignCommands(world, nation, unitById = null) {
  if (!ensureCommandOptions(nation).autoAssign) return 0;
  const held = new Set();
  for (const general of generalsOf(nation)) {
    for (const id of general.divisions) held.add(id);
  }
  let assigned = 0;
  for (const branch of [BRANCH.ARMY, BRANCH.NAVY]) {
    const officers = officersOf(nation, branch);
    if (!officers.length) continue;
    const naval = branch === BRANCH.NAVY;
    const loose = world.units
      .filter((unit) => unit.nationId === nation.id && !held.has(unit.id)
        && (unit.type.domain === 'sea') === naval)
      .sort((a, b) => a.id - b.id);
    for (const unit of loose) {
      // Her seferinde en az tümeni olan subay; eşitlikte kimliği küçük olan.
      const target = officers.reduce((best, other) => (
        other.divisions.length < best.divisions.length ? other : best
      ), officers[0]);
      if (target.divisions.length >= MAX_COMMAND_SIZE) break;
      assignDivisions(nation, target.id, [unit]);
      held.add(unit.id);
      assigned++;
    }
  }
  if (assigned && unitById) reconcileCommand(world, unitById);
  return assigned;
}

/**
 * Komuta fazının dilimlenebilir üçlüsü. Ölçüldü: atomik runCommand 62 uluslu
 * dünyada 12-20 ms tutuyor ve turnSteps'in kare bütçesini (7 ms) tek başına
 * aşıyordu — haftalık tikte görülen takılmanın en büyük tek parçasıydı.
 * Sınır taraması bir kez yapılır (beginCommand), uluslar sırayla işlenir
 * (runNationCommand) — işlem sırası senkron yolla birebir aynı, determinizm
 * korunur.
 */
export function beginCommand(game) {
  const world = game.world;
  ensureCommand(world);
  const unitById = new Map();
  for (const unit of world.units) unitById.set(unit.id, unit);
  reconcileCommand(world, unitById);
  world.commandWorst = null;
  return { borders: scanBorders(world), rng: game.turns.rng, unitById };
}

/**
 * General başına bir dilim: dev imparatorlukta TEK ulusun komuta fazı bile
 * 20+ ms tutabiliyor (ölçüldü: lastWorstStep "command:Wynovia" 23.7 ms) —
 * ilerleme emirleri (advance → orderMove) yol bulma maliyeti taşır ve
 * generaller arası bağımlılık yoktur; sıra korunur, determinizm değişmez.
 */
export function* runNationCommandSteps(game, nation, context) {
  if (!nation.alive) return;
  refreshOfficerCorps(game, nation, context.rng);
  autoAssignCommands(game.world, nation, context.unitById);
  for (const general of generalsOf(nation)) {
    runGroup(game, nation, general, context);
    yield;
  }
}

export function runNationCommand(game, nation, context) {
  // Senkron boşaltma: sıra ve sonuç dilimli yolla birebir aynı.
  // eslint-disable-next-line no-unused-vars
  for (const _ of runNationCommandSteps(game, nation, context)) { /* boşalt */ }
}

export function finishCommand(game) {
  game.emit('command', game.activeGeneral ?? null);
}

/** Senkron sarmalayıcı: tanılama betikleri ve testler için değişmedi. */
export function runCommand(game) {
  const context = beginCommand(game);
  for (const nation of game.world.nations) runNationCommand(game, nation, context);
  finishCommand(game);
}
