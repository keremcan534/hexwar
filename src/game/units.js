// Tumen ve alay: ordunun veri katmani. Yeni birim tipi eklemek icin burasi yeter.
//
// Muharebe burada degil battles.js'te cozulur; burasi yalniz "ordu nedir, ne
// kadar guclu, kaybi nasil dagilir" sorularini yanitlar. Katman notu: DOM yok,
// dunya nesnesi disinda bagimlilik yok.

import { controllerOf } from './control.js';

/** Kara birimi denize girdiginde bu hizla yol alir (bindirilmis hali). */
export const EMBARKED_MOVES = 4;

/** Stationary land divisions dig in by this amount each weekly tick. */
export const ENTRENCHMENT_RATE = 0.05;
export const MAX_ENTRENCHMENT = 0.35;

/**
 * Techizat kademeleri. Gec oyunda ulke butun teknolojiyi bitirdikten sonra
 * altinini harcayacak yer bulamiyordu; modernizasyon hem tek seferlik hem de
 * *kalici* bir gider acar. Bakim carpani gucten daha hizli buyur: ust kademe
 * ordu tutmak bilincli bir butce tercihi olsun, otomatik dogru cevap olmasin.
 */
export const EQUIPMENT_TIERS = [
  { level: 1, name: 'Levy', power: 1, upkeep: 1, cost: null },
  { level: 2, name: 'Regular', power: 1.15, upkeep: 1.6, cost: { gold: 45, iron: 2 } },
  { level: 3, name: 'Drilled', power: 1.32, upkeep: 2.4, cost: { gold: 95, iron: 4 } },
  { level: 4, name: 'Modern', power: 1.52, upkeep: 3.6, cost: { gold: 185, iron: 7 } },
];

export const MAX_TIER = EQUIPMENT_TIERS.length;

export function tierInfo(level) {
  return EQUIPMENT_TIERS[Math.max(0, Math.min(MAX_TIER, Math.round(level ?? 1)) - 1)];
}

export function regimentTier(regiment) {
  return Math.max(1, Math.min(MAX_TIER, Math.round(regiment?.tier ?? 1)));
}

/** Ordunun en dusuk kademesi: modernizasyon hep en geriden ilerler. */
export function armyTier(unit) {
  if (!unit?.regiments?.length) return 1;
  return Math.min(...unit.regiments.map(regimentTier));
}

/** Ordunun altin bakimi, alay sayisi yerine techizat agirligiyla olculur. */
export function upkeepWeight(unit) {
  if (!unit?.regiments?.length) return tierInfo(unit?.tier ?? 1).upkeep;
  return unit.regiments.reduce((sum, regiment) => sum + tierInfo(regimentTier(regiment)).upkeep, 0);
}

/**
 * Kara ordusunun uc kolu. `manpower` alayin topladigi asker sayisidir: kurulusta
 * ciktigi province'in nufusundan duser, dagitilinca geri doner, savasta olurse
 * kalici kayiptir (bkz. recruitment.js).
 */
export const UNIT_TYPES = {
  INFANTRY: {
    id: 'INFANTRY', name: 'Infantry', glyph: 'I', domain: 'land',
    moves: 3, attack: 5, hp: 110, manpower: 3000,
    /** Savunmada arazi bonusunu iki kati kullanir. */
    entrenched: true,
  },
  CAVALRY: {
    id: 'CAVALRY', name: 'Cavalry', glyph: 'C', domain: 'land',
    moves: 6, attack: 6, hp: 90, manpower: 2000,
  },
  ARTILLERY: {
    id: 'ARTILLERY', name: 'Artillery', glyph: 'A', domain: 'land',
    moves: 2, attack: 9, hp: 70, manpower: 1500,
    /** Topcu ates destegidir: yalniz kaldiginda kirilgan, yigin icinde belirleyici. */
    support: true,
  },
  WARSHIP: {
    id: 'WARSHIP', name: 'Warship', glyph: 'W', domain: 'sea',
    moves: 7, attack: 6, hp: 80, manpower: 1000,
  },
  // Modern kollar yuzyilin ortasinda sahneye cikar. `availableFrom` olmasaydi
  // 1836'da tank kurulabilirdi; ayrica bunlar tank/ucak fabrikalarinin tek
  // musterisidir, o mallar aksi halde fiyat tabaninda cakili kaliyordu.
  ARMOR: {
    id: 'ARMOR', name: 'Armour', glyph: 'T', domain: 'land',
    moves: 5, attack: 11, hp: 130, manpower: 1200,
    availableFrom: 4176,
  },
  AIRCRAFT: {
    id: 'AIRCRAFT', name: 'Air Wing', glyph: 'P', domain: 'land',
    moves: 8, attack: 8, hp: 60, manpower: 800,
    support: true,
    availableFrom: 3654,
  },
};

/** Bu tur o birim tipi kurulabilir mi? (tarihsel acilis) */
export function unitAvailable(typeId, turn) {
  return (UNIT_TYPES[typeId]?.availableFrom ?? 0) <= turn;
}

/** Kaldirilan birim tipleri: eski kayitlar yuklenirken bunlara cevrilir. */
export const LEGACY_UNIT_TYPES = { SCOUT: 'INFANTRY' };

export function resolveTypeId(typeId) {
  return UNIT_TYPES[typeId] ? typeId : (LEGACY_UNIT_TYPES[typeId] ?? 'INFANTRY');
}

/**
 * Ordunun haftalik hareket hizi (hex-maliyeti cinsinden). Tur bazli hamle
 * butcesi yok: bu deger yol boyunca *biriktirilen* ilerlemedir, en yavas alay
 * butun yigini yavaslatir.
 */
export function speedOf(unit) {
  if (unit.embarked) return EMBARKED_MOVES;
  if (unit.regiments?.length) {
    return Math.min(...unit.regiments.map(
      (regiment) => UNIT_TYPES[resolveTypeId(regiment.typeId)].moves,
    ));
  }
  return unit.type.moves;
}

/** Can tavani: zirh teknolojisiyle birlikte uretilen birimlerde daha yuksek. */
export function maxHpOf(unit) {
  return unit.maxHp ?? unit.type.hp;
}

export function regimentCount(unit) {
  return unit.regiments?.length ?? 1;
}

export function soldiersOf(unit) {
  if (!unit) return 0;
  if (!unit.regiments?.length) return Math.max(0, Math.round(unit.hp ?? 0));
  return Math.max(0, Math.round(unit.regiments.reduce(
    (sum, regiment) => sum + Math.max(0, regiment.strength),
    0,
  )));
}

/**
 * Tumenin muharebede kalma kapasitesi. Eski kayitlarda bu alan `morale`
 * adindaydi; ilk yenilemede organization'a tasinir.
 */
export function organizationOf(unit) {
  if (!unit?.regiments?.length) return unit?.organization ?? unit?.morale ?? 100;
  const soldiers = Math.max(1, soldiersOf(unit));
  return unit.regiments.reduce(
    (sum, regiment) => sum + (regiment.organization ?? regiment.morale ?? 100)
      * Math.max(0, regiment.strength),
    0,
  ) / soldiers;
}

export function strengthRatio(unit) {
  return soldiersOf(unit) / Math.max(1, maxHpOf(unit));
}

/** Eski alanlari yeni ordu yiginiyla senkron tutar; UI ve butce tek veri gorur. */
export function refreshArmy(unit) {
  if (!unit.regiments?.length) return unit;
  const counts = new Map();
  for (const regiment of unit.regiments) {
    regiment.typeId = resolveTypeId(regiment.typeId);
    regiment.maxStrength = Math.max(1, regiment.maxStrength ?? 1000);
    regiment.strength = Math.max(0, Math.min(regiment.maxStrength, regiment.strength ?? 0));
    regiment.organization = Math.max(0, Math.min(
      100,
      regiment.organization ?? regiment.morale ?? 100,
    ));
    // Eski save/UI okuyuculari morale bekliyor. Tek gercek organization'dir.
    regiment.morale = regiment.organization;
    counts.set(regiment.typeId, (counts.get(regiment.typeId) ?? 0) + 1);
  }
  // Yiginin simgesi en kalabalik koldur; topcu destek sinifi oldugu icin
  // esitlikte one cikmaz, yigin "piyade" gorunur.
  unit.type = UNIT_TYPES[[...counts.entries()].sort((a, b) => (
    b[1] - a[1]
    || (UNIT_TYPES[a[0]].support ? 1 : 0) - (UNIT_TYPES[b[0]].support ? 1 : 0)
    || UNIT_TYPES[b[0]].attack - UNIT_TYPES[a[0]].attack
  ))[0][0]];
  unit.hp = soldiersOf(unit);
  unit.maxHp = unit.regiments.reduce((sum, regiment) => sum + regiment.maxStrength, 0);
  unit.organization = organizationOf(unit);
  unit.morale = unit.organization;
  unit.tier = armyTier(unit);
  return unit;
}

/**
 * Alay. `manpower` kurulusta province nufusundan dusen asker sayisidir;
 * `home` o province'in koordinatidir, dagitimda nufus oraya geri verilir.
 */
function createRegiment(typeId, nation, home = null) {
  const id = resolveTypeId(typeId);
  const maxStrength = 1000;
  return {
    typeId: id,
    strength: maxStrength,
    maxStrength,
    organization: 100,
    morale: 100,
    tier: 1,
    manpower: UNIT_TYPES[id].manpower,
    home: home ? { q: home.q, r: home.r } : null,
  };
}

/**
 * Tumenin ham muharebe gucu. Alay basina: kol saldirisi × mevcut × moral ×
 * techizat. Arazi, general ve plan carpanlari battles.js'te uygulanir.
 */
export function armyPower(unit) {
  if (!unit) return 0;
  if (!unit.regiments?.length) {
    return unit.type.attack * Math.max(0, unit.hp / maxHpOf(unit)) * 100;
  }
  return unit.regiments.reduce((sum, regiment) => {
    const type = UNIT_TYPES[regiment.typeId];
    const strength = regiment.strength / Math.max(1, regiment.maxStrength);
    const equipment = tierInfo(regimentTier(regiment)).power;
    const organization = regiment.organization ?? regiment.morale ?? 100;
    return sum + type.attack * strength * (0.45 + organization / 180) * equipment;
  }, 0);
}

export function applyArmyLosses(unit, casualties, organizationLoss = 0) {
  if (!unit?.regiments?.length) return false;
  const total = Math.max(1, soldiersOf(unit));
  for (const regiment of unit.regiments) {
    const share = regiment.strength / total;
    const strengthLoss = Math.min(regiment.strength, casualties * share);
    if (regiment.draws?.length && strengthLoss > 0) {
      const representedMen = regiment.draws.reduce((sum, draw) => sum + Math.max(0, draw.men ?? 0), 0);
      const menLoss = strengthLoss * ((regiment.manpower ?? 0) / Math.max(1, regiment.maxStrength));
      const keep = representedMen > 0 ? Math.max(0, representedMen - menLoss) / representedMen : 0;
      for (const draw of regiment.draws) draw.men = Math.max(0, (draw.men ?? 0) * keep);
      regiment.draws = regiment.draws.filter((draw) => draw.men > 0.01);
    }
    regiment.strength = Math.max(0, regiment.strength - strengthLoss);
    regiment.organization = Math.max(
      0,
      (regiment.organization ?? regiment.morale ?? 100) - organizationLoss,
    );
    regiment.morale = regiment.organization;
  }
  // Iskelet kadro listede kalir: max strength degismez ve alay sonradan
  // takviye alabilir. Division yalniz toplam strength tamamen sifirsa oludur.
  if (soldiersOf(unit) <= 0) {
    unit.hp = 0;
    unit.organization = 0;
    unit.morale = 0;
    return false;
  }
  refreshArmy(unit);
  return true;
}

// Strength varsayilan olarak asla bedava dolmaz; asker takviyesi reinforcement.js'tedir.
export function recoverArmy(unit, soldiers = 0, organization = 10) {
  if (!unit?.regiments?.length || unit.battleId) return;
  for (const regiment of unit.regiments) {
    regiment.strength = Math.min(regiment.maxStrength, regiment.strength + soldiers);
    regiment.organization = Math.min(
      100,
      (regiment.organization ?? regiment.morale ?? 100) + organization,
    );
    regiment.morale = regiment.organization;
  }
  refreshArmy(unit);
}

let nextId = 1;

export function createUnit(typeId, nationId, tile, nation, home = null) {
  const id = resolveTypeId(typeId);
  const type = UNIT_TYPES[id];
  const regiment = createRegiment(id, nation, home ?? tile);
  const unit = {
    id: nextId++,
    type,
    nationId,
    tile,
    regiments: [regiment],
    maxHp: regiment.maxStrength,
    hp: regiment.strength,
    organization: 100,
    morale: 100,
    embarked: type.domain === 'land' && tile.terrain.water,
    // Hareket haftalik hamle butcesi degil: yol boyunca biriken ilerleme.
    path: null,
    progress: 0,
    order: null,
    battleId: null,
    retreatUntil: 0,
    attackReadyAt: 0,
    entrenchment: 0,
    // Cephede tuttugu province (bkz. command.js). Kalicidir: cephe yeniden
    // hesaplansa da mevkisi duran tumen yerinden oynamaz.
    post: null,
  };
  tile.units = tile.units ?? [];
  tile.units.push(unit);
  tile.unit = tile.units[0];
  return unit;
}

export function clearPath(unit) {
  unit.path = null;
  unit.progress = 0;
}

/** Ordunun yuruyusunu surduruyor mu? Cizim ve "bosta birim" listesi bunu sorar. */
export function isMoving(unit) {
  return Boolean(unit.path?.length) && !unit.battleId;
}

export function resetEntrenchment(unit) {
  if (unit) unit.entrenchment = 0;
}

/** Advance persistent defensive preparation for one deterministic weekly tick. */
export function advanceEntrenchment(unit, turn) {
  if (!unit) return 0;
  const friendlyLand = unit.type?.domain === 'land'
    && !unit.embarked
    && unit.tile?.terrain?.passable
    && !unit.tile.terrain.water
    && controllerOf(unit.tile) === unit.nationId;
  const canDigIn = friendlyLand
    && !isMoving(unit)
    && !unit.battleId
    && (unit.retreatUntil ?? 0) <= turn;
  if (!canDigIn) {
    resetEntrenchment(unit);
    return 0;
  }
  unit.entrenchment = Math.min(
    MAX_ENTRENCHMENT,
    Math.max(0, unit.entrenchment ?? 0) + ENTRENCHMENT_RATE,
  );
  return unit.entrenchment;
}

/**
 * Bir province'te yan yana durabilecek tumen sayisi. Tumenler birlesmez,
 * ayni province'i paylasir; tavan doomstack'i engeller.
 */
export const MAX_STACK = 4;

/** Bir province'teki tumenler. Eski tek-birim alaniyla uyumlu okur. */
export function unitsOn(tile) {
  if (!tile) return [];
  if (Array.isArray(tile.units)) return tile.units;
  return tile.unit ? [tile.unit] : [];
}

/** `tile.unit` yiginin ilk tumeni: eski okuyucular bozulmasin. */
function syncTile(tile) {
  if (!tile) return;
  tile.units = tile.units ?? [];
  tile.unit = tile.units[0] ?? null;
}

/** Tumeni durdugu province'ten cikarir. */
function detach(unit) {
  const tile = unit.tile;
  if (!tile) return;
  if (Array.isArray(tile.units)) {
    const index = tile.units.indexOf(unit);
    if (index >= 0) tile.units.splice(index, 1);
  }
  syncTile(tile);
}

/** Yigin doldu mu? Dost tumen icin giris kontrolu bunu sorar. */
export function stackFull(tile) {
  return unitsOn(tile).length >= MAX_STACK;
}

export function removeUnit(world, unit) {
  detach(unit);
  const i = world.units.indexOf(unit);
  if (i >= 0) world.units.splice(i, 1);
}

export function placeUnit(unit, tile) {
  if (unit.tile !== tile) resetEntrenchment(unit);
  detach(unit);
  unit.tile = tile;
  tile.units = tile.units ?? [];
  if (!tile.units.includes(unit)) tile.units.push(unit);
  syncTile(tile);
  if (unit.type.domain === 'land') unit.embarked = tile.terrain.water;
}
