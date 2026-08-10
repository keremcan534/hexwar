// Asker alımı. Vic2 mantığı: alay bir province'in *nüfusundan* çıkar. Asker
// haritadaki insanlardır, ayrı bir sayaç değil — bu yüzden nüfus ordunun
// gerçek tavanıdır ve savaş kaybı ülkeyi kalıcı olarak küçültür.
//
//   kuruluş  → province nüfusu düşer
//   dağıtım  → nüfus çıktığı province'e geri döner
//   ölüm     → kalıcı kayıp, kimseye geri dönmez

import { UNIT_TYPES, createUnit, removeUnit, resolveTypeId, stackFull } from './units.js';
import { orderMove } from './movement.js';
import {
  MILITARY_EQUIPMENT, ensureMilitaryEconomy, equipmentStock, setEquipmentStock,
} from './economy.js';
import { controllerOf } from './control.js';

export const RECRUITMENT_EQUIPMENT = {
  INFANTRY: { arms: 4 },
  CAVALRY: { arms: 6 },
  ARTILLERY: { arms: 2, artillery: 4 },
  WARSHIP: { arms: 10, steamers: 6 },
  ARMOR: { arms: 2, tanks: 5 },
  AIRCRAFT: { arms: 1, airplane: 5 },
};
export const RECRUITMENT_ARMS = Object.fromEntries(
  Object.entries(RECRUITMENT_EQUIPMENT).map(([id, cost]) => [id, cost.arms ?? 0]),
);

export function recruitmentEquipmentCost(typeId) {
  return RECRUITMENT_EQUIPMENT[resolveTypeId(typeId)] ?? {};
}

export function equipmentCostLabel(typeId) {
  return Object.entries(recruitmentEquipmentCost(typeId))
    .map(([id, amount]) => `${amount}${MILITARY_EQUIPMENT[id]?.icon ?? id}`)
    .join(' ');
}

/** Bir province'in altına inemeyeceği nüfus. Ülke kendi taşrasını boşaltamasın. */
export const PROVINCE_POPULATION_FLOOR = 2000;

/** Bir province'in verebileceği asker sayısı. */
export function provinceManpower(tile) {
  if (!tile?.province) return 0;
  return Math.max(0, tile.province.population - PROVINCE_POPULATION_FLOOR);
}

/** Ulusun toplam insan gücü: bütün province'lerin verebileceğinin toplamı. */
export function nationManpower(world, nationId) {
  let total = 0;
  world.forEach((tile) => {
    if (tile.owner === nationId && controllerOf(tile) === nationId) total += provinceManpower(tile);
  });
  return total;
}

/**
 * Alayın toplandığı bölge: çıkış province'i ve ona bitişik kendi province'leri.
 * Tek province'in bütün alayı beslemesi şartı orduları imkânsız kılıyordu
 * (ölçüm: alay sayısı 151'den 65'e düşmüştü) — asker civardan toplanır.
 */
export function recruitmentRegion(world, tile) {
  const region = [tile];
  for (const near of world.neighbors(tile)) {
    if (near.owner === tile.owner && near.province) region.push(near);
  }
  return region;
}

export function regionManpower(world, tile) {
  return recruitmentRegion(world, tile).reduce(
    (sum, province) => sum + provinceManpower(province), 0,
  );
}

/**
 * Alayın çıkacağı province: bölgesi en kalabalık olan. Şehir province'i
 * eşitlikte öncelikli — asker toplamak şehirde daha kolaydır.
 */
export function recruitmentSource(world, nation, typeId) {
  const need = UNIT_TYPES[resolveTypeId(typeId)].manpower;
  let best = null;
  let bestScore = 0;
  world.forEach((tile) => {
    if (tile.owner !== nation.id || controllerOf(tile) !== nation.id
      || !tile.terrain.passable || !tile.province) return;
    const available = regionManpower(world, tile);
    if (available < need) return;
    const score = available + (tile.city ? 3000 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = tile;
    }
  });
  return best;
}

export function canRecruit(world, nation, typeId) {
  const id = resolveTypeId(typeId);
  ensureMilitaryEconomy(nation);
  return Object.entries(recruitmentEquipmentCost(id))
    .every(([equipmentId, amount]) => equipmentStock(nation, equipmentId) >= amount)
    && Boolean(recruitmentSource(world, nation, id));
}

/**
 * İnsan gücünü bölgeden toplar: her province verebildiği kadarıyla orantılı
 * katkı yapar. Nereden ne kadar alındığı dağıtımda geri vermek için döner.
 */
function drawManpower(world, source, amount) {
  const region = recruitmentRegion(world, source)
    .filter((tile) => provinceManpower(tile) > 0)
    .sort((a, b) => provinceManpower(b) - provinceManpower(a));
  const draws = [];
  let remaining = amount;
  for (const tile of region) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, provinceManpower(tile));
    if (take <= 0) continue;
    tile.province.population -= take;
    draws.push({ q: tile.q, r: tile.r, men: take });
    remaining -= take;
  }
  return draws;
}

/** Alayın haritaya çıkacağı kare: kaynağın kendisi ya da boş bir komşusu. */
function deploymentTile(world, source, typeId) {
  const domain = UNIT_TYPES[resolveTypeId(typeId)].domain;
  if (domain === 'sea') {
    return world.neighbors(source).find(
      (tile) => tile.terrain.navigable && !stackFull(tile),
    ) ?? null;
  }
  // Tümenler birleşmediği için dolu olmayan yığına inmek serbest.
  if (!stackFull(source)) return source;
  return world.neighbors(source).find(
    (tile) => tile.terrain.passable && !stackFull(tile)
      && controllerOf(tile) === source.owner,
  ) ?? null;
}

/** Ulusun toplanma noktası: yeni alaylar oraya yürür. */
export function setRallyPoint(nation, tile) {
  nation.rallyPoint = tile ? { q: tile.q, r: tile.r } : null;
  return nation.rallyPoint;
}

export function rallyTile(world, nation) {
  const point = nation.rallyPoint;
  return point ? world.get(point.q, point.r) : null;
}

/**
 * Bir alay kurar: nüfusu düşer, birim haritaya çıkar, toplanma noktası varsa
 * oraya yürümeye başlar.
 * @returns {object|null} yaratılan ya da takviye edilen ordu
 */
export function recruit(game, nation, typeId) {
  const world = game.world;
  const id = resolveTypeId(typeId);
  ensureMilitaryEconomy(nation);
  const equipmentCost = recruitmentEquipmentCost(id);
  if (!Object.entries(equipmentCost)
    .every(([equipmentId, amount]) => equipmentStock(nation, equipmentId) >= amount)) return null;
  const source = recruitmentSource(world, nation, id);
  if (!source) return null;
  const tile = deploymentTile(world, source, id);
  if (!tile) return null;

  const draws = drawManpower(world, source, UNIT_TYPES[id].manpower);
  if (!draws.length) return null;
  const unit = createUnit(id, nation.id, tile, nation, source);
  for (const [equipmentId, amount] of Object.entries(equipmentCost)) {
    setEquipmentStock(nation, equipmentId, equipmentStock(nation, equipmentId) - amount);
  }
  // Nereden kaç asker alındığı alayda durur: dağıtımda aynı yerlere döner.
  unit.regiments[0].draws = draws;
  world.units.push(unit);

  const rally = rallyTile(world, nation);
  if (rally && rally !== tile) orderMove(game, unit, rally);
  return unit;
}

/**
 * Orduyu dağıtır: her alayın askeri çıktığı province'e geri döner. Province
 * kaybedilmişse insan gücü de kaybolur — geri dönecek yurt kalmamıştır.
 */
export function disband(game, unit) {
  const world = game.world;
  if (!unit?.regiments?.length) return false;
  for (const regiment of unit.regiments) {
    // Yalnız hayatta kalanlar döner: ölenler kalıcı kayıptır.
    // Askerin toplandığı province'ler biliniyorsa oraya, bilinmiyorsa
    // (eski kayıt) alayın kurulduğu province'e döner.
    const draws = regiment.draws ?? (regiment.home
      ? [{ ...regiment.home, men: (regiment.manpower ?? 0)
        * Math.max(0, regiment.strength / Math.max(1, regiment.maxStrength)) }]
      : []);
    for (const draw of draws) {
      const tile = world.get(draw.q, draw.r);
      // Province kaybedildiyse dönecek yurt kalmamıştır: insan gücü de kaybolur.
      if (!tile?.province || tile.owner !== unit.nationId
        || controllerOf(tile) !== unit.nationId) continue;
      tile.province.population += Math.round(draw.men);
    }
  }
  removeUnit(world, unit);
  game.emit('units', null);
  game.requestRender();
  return true;
}
