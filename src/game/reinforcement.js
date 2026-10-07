// TAKVİYE — muharebe kaybını ekonomiye bağlar. Düzen dinlenerek geri gelir;
// asker gücü ise province insan gücü ve TEÇHİZAT stoğu olmadan dolmaz:
// kaybolan her güç puanı, alayın kuruluş teçhizatından payını yer
// (UNIT_EQUIPMENT / maxStrength). Üretim hattı durursa ordu erir.

import { EQUIPMENT, EQUIPMENT_IDS, UNIT_EQUIPMENT } from './econ/defs.js';
import { equipmentStock } from './econ/industry.js';
import { mod } from './modifiers.js';
import { generalOfArmy, generalRecoveryBonus } from './command.js';
import { nationManpower, provinceManpower, trainingQueue } from './recruitment.js';
import { UNIT_TYPES, refreshArmy, resolveTypeId } from './units.js';
import { claimSoldiers, occupiedShareOf } from './provinces.js';

export const BASE_REINFORCEMENT_RATE = 24;

/** Haftalık takviye hızı (güç puanı): komutan, teknoloji, iflas. */
export function reinforcementRateOf(nation, general = null) {
  const bankrupt = (nation.bankruptUntil ?? 0) > (nation.economy?.ledger?.lastUpdated ?? 0);
  return BASE_REINFORCEMENT_RATE
    * (1 + generalRecoveryBonus(general))
    * Math.max(0.2, 1 + mod(nation, 'reinforce'))
    * (bankrupt ? 0.5 : 1);
}

/** Güç puanı başına teçhizat: kuruluş teçhizatı / alayın tam gücü. */
function perStrength(regiment) {
  const recipe = UNIT_EQUIPMENT[resolveTypeId(regiment.typeId)] ?? {};
  const max = Math.max(1, regiment.maxStrength ?? 1000);
  return Object.entries(recipe).map(([id, amount]) => [id, amount / max]);
}

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
 * Önce alayın yurdu ve komşu kümeler, sonra ülkenin kalan kümeleri askere
 * verir. Kümeler MERKEZ kareleriyle temsil edilir.
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
    claimSoldiers(tile.province, take);
    appendDraw(regiment, tile, take);
    drawn += take;
    remaining -= take;
  }
  return drawn;
}

/** Ordunun eksik gücünün insan ve teçhizat karşılığı. */
export function reinforcementNeed(world, nation) {
  let strength = 0;
  let manpower = 0;
  const equipment = {};
  for (const id of EQUIPMENT_IDS) equipment[id] = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id || !unit.regiments?.length) continue;
    for (const regiment of unit.regiments) {
      const missing = missingStrength(regiment);
      if (missing <= 0) continue;
      strength += missing;
      manpower += missing * menPerStrength(regiment);
      for (const [id, per] of perStrength(regiment)) equipment[id] += missing * per;
    }
  }
  return {
    strength: Math.round(strength),
    manpower: Math.ceil(manpower),
    equipment,
    availableManpower: nationManpower(world, nation.id),
  };
}

/**
 * Teçhizat defteri (ordu ekranı): stok, ihtiyaç (takviye + eğitim kuyruğunun
 * eksiği), haftalık üretim ve eksik kapanana kadar kalan hafta.
 */
export function equipmentLogistics(world, nation) {
  const need = reinforcementNeed(world, nation);
  const queued = {};
  for (const id of EQUIPMENT_IDS) queued[id] = 0;
  for (const item of trainingQueue(nation)) {
    for (const [id, amount] of Object.entries(item.missing ?? {})) queued[id] = (queued[id] ?? 0) + amount;
  }
  return EQUIPMENT_IDS.map((id) => {
    const stock = equipmentStock(nation, id);
    const required = Math.max(0, (need.equipment[id] ?? 0) + (queued[id] ?? 0));
    const produced = nation.economy?.lines?.[id]?.output ?? 0;
    const deficit = Math.max(0, required - stock);
    return {
      id,
      name: EQUIPMENT[id].name,
      icon: EQUIPMENT[id].glyph,
      stock,
      required,
      balance: stock - required,
      producedPerWeek: produced,
      etaWeeks: deficit > 0 && produced > 0 ? Math.ceil(deficit / produced) : null,
    };
  });
}

/** Bir ulusun uygun tümenlerine haftalık insan ve teçhizat dağıtır. */
function reinforceNation(game, nation) {
  const world = game.world;
  const stock = nation.economy?.stock;
  if (!stock) return;
  const log = { demand: 0, reinforced: 0, manpowerUsed: 0, equipmentUsed: {} };
  const units = world.units.filter((unit) => (
    unit.nationId === nation.id && unit.regiments?.length
    && !unit.battleId && (unit.retreatUntil ?? 0) <= game.turns.turn
  )).sort((a, b) => {
    const deficit = (unit) => unit.regiments.reduce(
      (sum, regiment) => sum + missingStrength(regiment), 0,
    ) / Math.max(1, unit.maxHp);
    return deficit(b) - deficit(a) || a.id - b.id;
  });
  for (const unit of units) {
    const general = generalOfArmy(nation, unit);
    const rate = reinforcementRateOf(nation, general);
    for (const regiment of unit.regiments) {
      const missing = missingStrength(regiment);
      if (missing <= 0) continue;
      log.demand += missing;
      const recipe = perStrength(regiment);
      let equipmentLimit = Infinity;
      for (const [id, per] of recipe) {
        const limit = (stock[id] ?? 0) / Math.max(1e-6, per);
        if (limit < equipmentLimit) equipmentLimit = limit;
      }
      const wanted = Math.floor(Math.min(missing, rate, equipmentLimit));
      if (wanted <= 0) continue;
      const ratio = menPerStrength(regiment);
      const men = drawManpower(world, nation.id, regiment, wanted * ratio);
      const gained = Math.min(wanted, men / Math.max(1e-6, ratio));
      if (gained <= 0) continue;
      regiment.strength = Math.min(regiment.maxStrength, regiment.strength + gained);
      for (const [id, per] of recipe) {
        const used = gained * per;
        stock[id] = Math.max(0, stock[id] - used);
        log.equipmentUsed[id] = (log.equipmentUsed[id] ?? 0) + used;
      }
      log.reinforced += gained;
      log.manpowerUsed += men;
    }
    refreshArmy(unit);
  }
  nation.economy.reinforcement = log;
}

export function runReinforcements(game) {
  for (const nation of game.world.nations) {
    if (nation.alive) reinforceNation(game, nation);
  }
}
