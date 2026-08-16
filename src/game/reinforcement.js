// Muharebe kayiplarini ekonomiyle baglar. Moral dinlenerek geri gelir; asker
// gucu ise province nufusu ve Small Arms stogu olmadan yukselemez.

import {
  MILITARY_EQUIPMENT, MILITARY_EQUIPMENT_IDS, MILITARY_FIELD, ensureMilitaryEconomy,
  equipmentStock, setEquipmentStock, workshopArmsOutput,
} from './economy.js';
import { generalOfArmy, generalRecoveryBonus } from './command.js';
import { nationManpower, provinceManpower } from './recruitment.js';
import { UNIT_TYPES, refreshArmy, resolveTypeId } from './units.js';
import { occupiedShareOf } from './provinces.js';

export const BASE_REINFORCEMENT_RATE = 24;
export const REINFORCEMENT_EQUIPMENT = {
  INFANTRY: { arms: 0.002 },
  CAVALRY: { arms: 0.0025 },
  ARTILLERY: { arms: 0.001, artillery: 0.003 },
  WARSHIP: { arms: 0.005, steamers: 0.003 },
  ARMOR: { arms: 0.001, tanks: 0.004 },
  AIRCRAFT: { arms: 0.0005, airplane: 0.004 },
};
// Sicak donguler tabloyu [id, miktar] cifti dizisi olarak okur: alay basina
// Object.entries cagirmak haftada yuz binlerce gecici dizi uretiyordu.
const REINFORCEMENT_EQUIPMENT_ENTRIES = Object.fromEntries(
  Object.keys(REINFORCEMENT_EQUIPMENT).map(
    (typeId) => [typeId, Object.entries(REINFORCEMENT_EQUIPMENT[typeId])],
  ),
);
const DEFAULT_EQUIPMENT_ENTRIES = [['arms', 0.002]];

function missingStrength(regiment) {
  return Math.max(0, (regiment.maxStrength ?? 0) - (regiment.strength ?? 0));
}

function menPerStrength(regiment) {
  return (regiment.manpower ?? UNIT_TYPES[resolveTypeId(regiment.typeId)].manpower)
    / Math.max(1, regiment.maxStrength);
}

function appendDraw(regiment, tile, men) {
  if (!regiment.draws) {
    const representedMen = (regiment.manpower ?? 0)
      * ((regiment.strength ?? 0) / Math.max(1, regiment.maxStrength));
    regiment.draws = regiment.home && representedMen > 0
      ? [{ ...regiment.home, men: representedMen }]
      : [];
  }
  const existing = regiment.draws.find((draw) => draw.q === tile.q && draw.r === tile.r);
  if (existing) existing.men += men;
  else regiment.draws.push({ q: tile.q, r: tile.r, men });
}

/**
 * Once alayin yurdu ve komsu kumeler, sonra ulkenin kalan kumeleri askere
 * verir. Kumeler MERKEZ kareleriyle temsil edilir: ayni havuz iki kez
 * listelenmez ve tarama kare sayisi degil kume sayisi kadardir (32k haritada
 * alay basina tam dunya taramasi kare butcesini yiyordu).
 */
function manpowerSources(world, nationId, regiment) {
  const preferred = [];
  const seen = new Set();
  const addCluster = (province) => {
    if (!province?.econ || province.owner !== nationId || seen.has(province.id)) return;
    if (occupiedShareOf(world, province) > 0) return;
    seen.add(province.id);
    preferred.push(province.center);
  };
  const home = regiment.home ? world.get(regiment.home.q, regiment.home.r) : null;
  const homeCluster = home ? world.provinces?.[home.provinceId] : null;
  addCluster(homeCluster);
  if (homeCluster) {
    for (const neighborId of homeCluster.neighbors) addCluster(world.provinces[neighborId]);
  }

  const rest = [];
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ && !seen.has(province.id)
      && occupiedShareOf(world, province) === 0) rest.push(province.center);
  }
  rest.sort((a, b) => provinceManpower(world, b) - provinceManpower(world, a));
  return preferred.concat(rest);
}

function drawManpower(world, nationId, regiment, requested) {
  let remaining = Math.max(0, Math.ceil(requested));
  let drawn = 0;
  for (const tile of manpowerSources(world, nationId, regiment)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, provinceManpower(world, tile));
    if (take <= 0) continue;
    tile.province.population -= take;
    appendDraw(regiment, tile, take);
    drawn += take;
    remaining -= take;
  }
  return drawn;
}

export function reinforcementNeed(world, nation) {
  let strength = 0;
  let manpower = 0;
  const equipment = Object.fromEntries(MILITARY_EQUIPMENT_IDS.map((id) => [id, 0]));
  for (const unit of world.units) {
    if (unit.nationId !== nation.id || !unit.regiments?.length) continue;
    for (const regiment of unit.regiments) {
      const missing = missingStrength(regiment);
      strength += missing;
      manpower += missing * menPerStrength(regiment);
      const cost = REINFORCEMENT_EQUIPMENT_ENTRIES[resolveTypeId(regiment.typeId)]
        ?? DEFAULT_EQUIPMENT_ENTRIES;
      for (const [id, amount] of cost) equipment[id] += missing * amount;
    }
  }
  return {
    strength: Math.round(strength),
    manpower: Math.ceil(manpower),
    equipment,
    arms: equipment.arms,
    artillery: equipment.artillery,
    availableManpower: nationManpower(world, nation.id),
  };
}

/** HOI-style equipment ledger. New equipment families can be added as real stocks appear. */
export function equipmentLogistics(world, nation) {
  const military = ensureMilitaryEconomy(nation);
  const need = reinforcementNeed(world, nation);
  return MILITARY_EQUIPMENT_IDS.map((id) => {
    const type = MILITARY_EQUIPMENT[id];
    const samples = military[`${id}AverageSamples`] ?? 0;
    const workshop = id === 'arms' ? workshopArmsOutput(nation) : 0;
    const producedWeekly = samples > 0
      ? military[`${id}ProducedAverage`]
      : Math.max(military[`${id}Produced`], workshop);
    const importedWeekly = samples > 0
      ? military[`${id}ImportedAverage`]
      : military[`${id}Imported`];
    const supplyWeekly = samples > 0
      ? military[`${id}SupplyAverage`]
      : producedWeekly + importedWeekly;
    const stock = equipmentStock(nation, id);
    const required = Math.max(0, need.equipment[id] ?? 0);
    const balance = stock - required;
    const deficit = Math.max(0, -balance);
    const supplyPerDay = Math.max(0, supplyWeekly) / 7;
    return {
      id,
      name: type.name,
      icon: type.icon,
      stock,
      required,
      balance,
      producedPerDay: Math.max(0, producedWeekly) / 7,
      importedPerDay: Math.max(0, importedWeekly) / 7,
      supplyPerDay,
      etaDays: deficit > 0 && supplyPerDay > 0
        ? Math.ceil(deficit / supplyPerDay)
        : null,
    };
  });
}

/** Bir ulusun uygun tumenlerine haftalik insan ve techizat dagitir. */
function reinforceNation(game, nation) {
  const world = game.world;
  const military = ensureMilitaryEconomy(nation);
  const need = reinforcementNeed(world, nation);
  military.reinforcementDemand = need.strength;
  military.manpowerDemand = need.manpower;
  military.reinforced = 0;
  military.manpowerUsed = 0;
  for (const id of MILITARY_EQUIPMENT_IDS) {
    military[MILITARY_FIELD[id].demand] = need.equipment[id] ?? 0;
    military[MILITARY_FIELD[id].used] = 0;
  }

  const units = world.units.filter((unit) => (
    unit.nationId === nation.id && unit.regiments?.length
    && !unit.battleId && (unit.retreatUntil ?? 0) <= game.turns.turn
  )).sort((a, b) => {
    const deficit = (unit) => unit.regiments.reduce(
      (sum, regiment) => sum + missingStrength(regiment), 0,
    ) / Math.max(1, unit.maxHp);
    return deficit(b) - deficit(a) || a.id - b.id;
  });

  // Takviye hızını TEDARİK belirler: adam maaşla değil, mühimmat ve ikmalle
  // cepheye taşınır. Uzayan kıtlık da yavaşça bastırır (supplyIndex, EMA) —
  // tek kötü hafta değil, süregiden açlık hissedilsin.
  const supply = Math.max(0.4, nation.economy.military?.supplyIndex ?? 1);
  const funding = Math.max(0.25, (nation.economy.militaryProcurement ?? 100) / 100) * supply;
  for (const unit of units) {
    const general = generalOfArmy(nation, unit);
    const rate = BASE_REINFORCEMENT_RATE
      * (0.25 + funding * 0.75)
      * (1 + generalRecoveryBonus(general));
    for (const regiment of unit.regiments) {
      const missing = missingStrength(regiment);
      if (missing <= 0) continue;
      const typeId = resolveTypeId(regiment.typeId);
      const equipmentCost = REINFORCEMENT_EQUIPMENT_ENTRIES[typeId]
        ?? DEFAULT_EQUIPMENT_ENTRIES;
      let equipmentLimit = Infinity;
      for (const [id, amount] of equipmentCost) {
        const limit = equipmentStock(nation, id) / Math.max(0.0001, amount);
        if (limit < equipmentLimit) equipmentLimit = limit;
      }
      const wantedStrength = Math.floor(Math.min(
        missing,
        rate,
        equipmentLimit,
      ));
      if (wantedStrength <= 0) continue;

      const ratio = menPerStrength(regiment);
      const men = drawManpower(world, nation.id, regiment, wantedStrength * ratio);
      const gained = Math.min(wantedStrength, men / Math.max(0.0001, ratio));
      if (gained <= 0) continue;
      regiment.strength = Math.min(regiment.maxStrength, regiment.strength + gained);
      for (const [id, amount] of equipmentCost) {
        const used = gained * amount;
        setEquipmentStock(nation, id, equipmentStock(nation, id) - used);
        military[MILITARY_FIELD[id].used] += used;
      }
      military.reinforced += gained;
      military.manpowerUsed += men;
    }
    refreshArmy(unit);
  }
}

export function runReinforcements(game) {
  for (const nation of game.world.nations) {
    if (nation.alive) reinforceNation(game, nation);
  }
  game.emit('economy', game.world.market);
}
