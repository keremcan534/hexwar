// Birim tipleri ve savaş çözümü. Tek yerde tanımlı: yeni birim eklemek için burası yeter.

import { buildingDefense } from './buildings.js';
import { techAttackBonus, techHpBonus, techSiegeFactor } from './tech.js';
import { mergeCommand } from './generals.js';

/** Kara birimi denize girdiğinde bu hızla yol alır (bindirilmiş hâli). */
export const EMBARKED_MOVES = 4;

/**
 * Teçhizat kademeleri. Geç oyunda ülke bütün teknolojiyi bitirdikten sonra
 * altınını harcayacak yer bulamıyordu; modernizasyon hem tek seferlik hem de
 * *kalıcı* bir gider açar. Bakım çarpanı güçten daha hızlı büyür: üst kademe
 * ordu tutmak bilinçli bir bütçe tercihi olsun, otomatik doğru cevap olmasın.
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

/** Ordunun en düşük kademesi: modernizasyon hep en geriden ilerler. */
export function armyTier(unit) {
  if (!unit?.regiments?.length) return 1;
  return Math.min(...unit.regiments.map(regimentTier));
}

/** Ordunun altın bakımı, alay sayısı yerine teçhizat ağırlığıyla ölçülür. */
export function upkeepWeight(unit) {
  if (!unit?.regiments?.length) return tierInfo(unit?.tier ?? 1).upkeep;
  return unit.regiments.reduce((sum, regiment) => sum + tierInfo(regimentTier(regiment)).upkeep, 0);
}

/**
 * Bir kademe yükseltmenin bedeli: yalnızca en geride kalan alaylar ödenir,
 * böylece karışık ordu tek seferde uçurulmaz.
 */
export function modernizeCost(unit) {
  if (!unit?.regiments?.length) return null;
  const tier = armyTier(unit);
  if (tier >= MAX_TIER) return null;
  const next = tierInfo(tier + 1);
  const count = unit.regiments.filter((regiment) => regimentTier(regiment) === tier).length;
  return Object.fromEntries(
    Object.entries(next.cost).map(([resource, amount]) => [resource, amount * count]),
  );
}

/** Bedeli ödenmiş modernizasyonu uygular; ödeme çağıranın işi (bkz. economy.js). */
export function applyModernization(unit) {
  const tier = armyTier(unit);
  if (tier >= MAX_TIER) return false;
  for (const regiment of unit.regiments) {
    if (regimentTier(regiment) === tier) regiment.tier = tier + 1;
  }
  refreshArmy(unit);
  return true;
}

/**
 * Kara ordusunun üç kolu. `manpower` alayın topladığı asker sayısıdır: kuruluşta
 * çıktığı province'in nüfusundan düşer, dağıtılınca geri döner, savaşta ölürse
 * kalıcı kayıptır (bkz. recruitment.js).
 */
export const UNIT_TYPES = {
  INFANTRY: {
    id: 'INFANTRY', name: 'Infantry', glyph: 'I', domain: 'land',
    moves: 3, attack: 5, hp: 110, manpower: 3000,
    /** Savunmada arazi bonusunu iki katı kullanır. */
    entrenched: true,
  },
  CAVALRY: {
    id: 'CAVALRY', name: 'Cavalry', glyph: 'C', domain: 'land',
    moves: 6, attack: 6, hp: 90, manpower: 2000,
  },
  ARTILLERY: {
    id: 'ARTILLERY', name: 'Artillery', glyph: 'A', domain: 'land',
    moves: 2, attack: 9, hp: 70, manpower: 1500,
    /** Topçu ateş desteğidir: yalnız kaldığında kırılgan, yığın içinde belirleyici. */
    support: true,
  },
  WARSHIP: {
    id: 'WARSHIP', name: 'Warship', glyph: 'W', domain: 'sea',
    moves: 7, attack: 6, hp: 80, manpower: 1000,
  },
};

/** Kaldırılan birim tipleri: eski kayıtlar yüklenirken bunlara çevrilir. */
export const LEGACY_UNIT_TYPES = { SCOUT: 'INFANTRY' };

export function resolveTypeId(typeId) {
  return UNIT_TYPES[typeId] ? typeId : (LEGACY_UNIT_TYPES[typeId] ?? 'INFANTRY');
}

/**
 * Ordunun haftalık hareket hızı (hex-maliyeti cinsinden). Tur bazlı hamle
 * bütçesi kalktı: bu değer artık bir haftada yol boyunca *biriktirilen*
 * ilerlemedir, en yavaş alay bütün yığını yavaşlatır.
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

/** Can tavanı: zırh teknolojisiyle birlikte üretilen birimlerde daha yüksek. */
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

export function moraleOf(unit) {
  if (!unit?.regiments?.length) return unit?.morale ?? 100;
  const soldiers = Math.max(1, soldiersOf(unit));
  return unit.regiments.reduce(
    (sum, regiment) => sum + regiment.morale * Math.max(0, regiment.strength),
    0,
  ) / soldiers;
}

/** Eski alanları yeni ordu yığınıyla senkron tutar; UI ve bütçe tek veri görür. */
export function refreshArmy(unit) {
  if (!unit.regiments?.length) return unit;
  const counts = new Map();
  for (const regiment of unit.regiments) {
    regiment.typeId = resolveTypeId(regiment.typeId);
    counts.set(regiment.typeId, (counts.get(regiment.typeId) ?? 0) + 1);
  }
  // Yığının simgesi en kalabalık koldur; topçu destek sınıfı olduğu için
  // eşitlikte öne çıkmaz, yığın "piyade" görünür.
  unit.type = UNIT_TYPES[[...counts.entries()].sort((a, b) => (
    b[1] - a[1]
    || (UNIT_TYPES[a[0]].support ? 1 : 0) - (UNIT_TYPES[b[0]].support ? 1 : 0)
    || UNIT_TYPES[b[0]].attack - UNIT_TYPES[a[0]].attack
  ))[0][0]];
  unit.hp = soldiersOf(unit);
  unit.maxHp = unit.regiments.reduce((sum, regiment) => sum + regiment.maxStrength, 0);
  unit.morale = moraleOf(unit);
  unit.tier = armyTier(unit);
  return unit;
}

/**
 * Alay. `manpower` kuruluşta province nüfusundan düşen asker sayısıdır;
 * `home` o province'in koordinatıdır, dağıtımda nüfus oraya geri verilir.
 */
function createRegiment(typeId, nation, home = null) {
  const id = resolveTypeId(typeId);
  const maxStrength = 1000 + (nation ? techHpBonus(nation) * 5 : 0);
  return {
    typeId: id,
    strength: maxStrength,
    maxStrength,
    morale: 100,
    tier: 1,
    manpower: UNIT_TYPES[id].manpower,
    home: home ? { q: home.q, r: home.r } : null,
  };
}

export function addRegiment(unit, typeId, nation, home = null) {
  const type = UNIT_TYPES[typeId];
  if (!type || type.domain !== unit.type.domain) return false;
  unit.regiments = unit.regiments ?? [createRegiment(unit.type.id, nation)];
  unit.regiments.push(createRegiment(typeId, nation, home));
  refreshArmy(unit);
  return true;
}

export function mergeArmies(world, target, source) {
  if (!target || !source || target === source || target.nationId !== source.nationId) return false;
  if (target.type.domain !== source.type.domain || target.battleId || source.battleId) return false;
  target.regiments = target.regiments ?? [createRegiment(target.type.id)];
  const incoming = source.regiments ?? [createRegiment(source.type.id)];
  target.regiments.push(...incoming.map((regiment) => ({ ...regiment })));
  target.order = null;
  refreshArmy(target);
  // Birleşen iki ordunun komutanlarından yetenekli olan yığının başına geçer,
  // diğeri boşta kadroya döner. Yoksa general yok olan orduya bağlı kalıyordu.
  mergeCommand(world.nations?.[target.nationId], target, source);
  removeUnit(world, source);
  return target;
}

export function armyPower(unit) {
  if (!unit) return 0;
  if (!unit.regiments?.length) {
    return unit.type.attack * Math.max(0, unit.hp / maxHpOf(unit)) * 100;
  }
  return unit.regiments.reduce((sum, regiment) => {
    const type = UNIT_TYPES[regiment.typeId];
    const strength = regiment.strength / Math.max(1, regiment.maxStrength);
    const equipment = tierInfo(regimentTier(regiment)).power;
    return sum + type.attack * strength * (0.45 + regiment.morale / 180) * equipment;
  }, 0);
}

export function applyArmyLosses(unit, casualties, moraleLoss = 0) {
  if (!unit?.regiments?.length) return false;
  const total = Math.max(1, soldiersOf(unit));
  for (const regiment of unit.regiments) {
    const share = regiment.strength / total;
    regiment.strength = Math.max(0, regiment.strength - casualties * share);
    regiment.morale = Math.max(0, regiment.morale - moraleLoss);
  }
  unit.regiments = unit.regiments.filter((regiment) => regiment.strength > 50);
  if (!unit.regiments.length) {
    unit.hp = 0;
    unit.morale = 0;
    return false;
  }
  refreshArmy(unit);
  return true;
}

export function recoverArmy(unit, soldiers = 24, morale = 10) {
  if (!unit?.regiments?.length || unit.battleId) return;
  for (const regiment of unit.regiments) {
    regiment.strength = Math.min(regiment.maxStrength, regiment.strength + soldiers);
    regiment.morale = Math.min(100, regiment.morale + morale);
  }
  refreshArmy(unit);
}

export function removeWeakestRegiment(unit, typeIds = null) {
  if (!unit?.regiments?.length) return null;
  const candidates = unit.regiments
    .map((regiment, index) => ({ regiment, index }))
    .filter(({ regiment }) => !typeIds || typeIds.includes(regiment.typeId))
    .sort((a, b) => a.regiment.strength - b.regiment.strength);
  if (!candidates.length) return null;
  const [removed] = unit.regiments.splice(candidates[0].index, 1);
  refreshArmy(unit);
  return removed;
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
    morale: 100,
    embarked: type.domain === 'land' && tile.terrain.water,
    // Hareket artık haftalık hamle bütçesi değil: yol boyunca biriken ilerleme.
    path: null,
    progress: 0,
    order: null,
    battleId: null,
    retreatUntil: 0,
  };
  tile.units = tile.units ?? [];
  tile.units.push(unit);
  tile.unit = tile.units[0];
  return unit;
}

/** Orduya bir yürüyüş yolu verir. Yol boşsa hareket durur. */
export function setPath(unit, path) {
  unit.path = path?.length ? [...path] : null;
  unit.progress = 0;
  return unit.path;
}

export function clearPath(unit) {
  unit.path = null;
  unit.progress = 0;
}

/** Ordunun yürüyüşünü sürdürüyor mu? Çizim ve "boşta birim" listesi bunu sorar. */
export function isMoving(unit) {
  return Boolean(unit.path?.length) && !unit.battleId;
}

/**
 * Bir province'te yan yana durabilecek tümen sayısı. HOI4'te tümenler
 * birleşmez, aynı province'i paylaşır; tavan doomstack'i engeller.
 */
export const MAX_STACK = 4;

/** Bir province'teki tümenler. Eski tek-birim alanıyla uyumlu okur. */
export function unitsOn(tile) {
  if (!tile) return [];
  if (Array.isArray(tile.units)) return tile.units;
  return tile.unit ? [tile.unit] : [];
}

/** `tile.unit` artık yığının ilk tümeni: eski okuyucular bozulmasın. */
function syncTile(tile) {
  if (!tile) return;
  tile.units = tile.units ?? [];
  tile.unit = tile.units[0] ?? null;
}

/** Tümeni durduğu province'ten çıkarır. */
function detach(unit) {
  const tile = unit.tile;
  if (!tile) return;
  if (Array.isArray(tile.units)) {
    const index = tile.units.indexOf(unit);
    if (index >= 0) tile.units.splice(index, 1);
  }
  syncTile(tile);
}

/** Yığın doldu mu? Dost tümen için giriş kontrolü bunu sorar. */
export function stackFull(tile) {
  return unitsOn(tile).length >= MAX_STACK;
}

export function removeUnit(world, unit) {
  detach(unit);
  const i = world.units.indexOf(unit);
  if (i >= 0) world.units.splice(i, 1);
}

export function placeUnit(unit, tile) {
  detach(unit);
  unit.tile = tile;
  tile.units = tile.units ?? [];
  if (!tile.units.includes(unit)) tile.units.push(unit);
  syncTile(tile);
  if (unit.type.domain === 'land') unit.embarked = tile.terrain.water;
}

/**
 * Bir saldırı turu. Saldıran ve savunan aynı anda hasar alır;
 * savunan arazinin savunma bonusundan yararlanır.
 * @returns {{ attackerDamage: number, defenderDamage: number, defenderDied: boolean, attackerDied: boolean }}
 */
export function resolveCombat(attacker, defender, rng, world) {
  const attackerNation = world?.nations?.[attacker.nationId];
  const defenderNation = world?.nations?.[defender.nationId];
  const atkBonus = attackerNation ? techAttackBonus(attackerNation) : 0;
  const defBonus = defenderNation ? techAttackBonus(defenderNation) : 0;
  const siege = attackerNation ? techSiegeFactor(attackerNation) : 1;
  return combat(attacker, defender, rng, { atkBonus, defBonus, siege });
}

function combat(attacker, defender, rng, { atkBonus, defBonus, siege }) {
  // Şehir surları araziden bağımsız sabit bir savunma katkısı verir.
  const city = defender.tile.city;
  // Kuşatma bilen saldırganın karşısında surlar yarı etkili.
  const cityBonus = city ? (0.3 + city.level * 0.1 + buildingDefense(city)) * siege : 0;
  const terrainBonus = defender.tile.terrain.defense * (defender.type.entrenched ? 2 : 1) + cityBonus;
  const roll = () => 0.75 + rng() * 0.5;
  // Denizdeki kara birimi savunmasızdır: karaya çıkmadan yakalanmak pahalıya patlar.
  const exposed = defender.embarked ? 1.6 : 1;

  const atk = (attacker.type.attack + atkBonus) * tierInfo(armyTier(attacker)).power;
  const def = (defender.type.attack + defBonus) * tierInfo(armyTier(defender)).power;
  const defenderDamage = Math.round(atk * 10 * roll() * exposed * (1 - Math.min(0.7, terrainBonus)));
  // Karşı saldırı daha zayıf: saldıran inisiyatifi elinde tutar.
  const attackerDamage = Math.round(def * 10 * roll() * (defender.embarked ? 0.2 : 0.6));

  defender.hp -= defenderDamage;
  attacker.hp -= attackerDamage;

  return {
    defenderDamage,
    attackerDamage,
    defenderDied: defender.hp <= 0,
    attackerDied: attacker.hp <= 0,
  };
}
