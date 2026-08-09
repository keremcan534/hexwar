// Province katmanı: her kara hex'i nüfus, kontrol ve uzmanlaşma taşıyan
// ekonomik bir karar alanına dönüştürür. Şehirler sanayi merkezidir; province
// ise hammadde, vergi tabanı ve nüfus sağlar.

import { makeRng } from '../core/rng.js';
import { policyOf } from './politics.js';
import { controllerOf, isOccupied } from './control.js';

export const RGO_TYPES = {
  GRAIN: {
    id: 'GRAIN', goodId: 'food', name: 'Grain Farms', icon: '🌾', hue: 91,
    track: 'agriculture', baseOutput: 0.24,
  },
  TIMBER: {
    id: 'TIMBER', goodId: 'timber', name: 'Logging Camps', icon: '🪵', hue: 139,
    track: 'extraction', baseOutput: 0.22,
  },
  IRON: {
    id: 'IRON', goodId: 'iron', name: 'Iron Mines', icon: '⛏', hue: 211,
    track: 'extraction', baseOutput: 0.18,
  },
  COAL: {
    id: 'COAL', goodId: 'coal', name: 'Coal Mines', icon: '◆', hue: 28,
    track: 'extraction', baseOutput: 0.16,
  },
};

export const MIGRATION_INTERVAL = 4;
export const MIGRATION_COHORT = 100;
export const MIGRATION_RATE = 0.04;


const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function weightedRgo(world, tile) {
  const yields = tile.terrain.yields;
  const rng = makeRng(`${world.seed}-rgo-${tile.q}:${tile.r}`);
  const rugged = tile.terrain.id === 'HILLS' || tile.terrain.id === 'MOUNTAIN';
  const weights = [
    ['GRAIN', 1.5 + yields.food * 4.5 + (tile.coastal ? 1 : 0)],
    ['TIMBER', 1 + yields.timber * 5.5],
    ['IRON', 0.8 + yields.iron * 5 + (rugged ? 1.5 : 0)],
    ['COAL', 0.45 + (rugged ? 4.5 : 0) + (tile.terrain.id === 'FOREST' ? 0.5 : 0)],
  ];
  let roll = rng() * weights.reduce((sum, [, weight]) => sum + weight, 0);
  let rgo = 'GRAIN';
  for (const [id, weight] of weights) {
    roll -= weight;
    if (roll <= 0) { rgo = id; break; }
  }
  return { id: rgo, quality: rng.range(0.85, 1.15), jobsRatio: rng.range(0.72, 0.88) };
}

function initialProvince(world, tile) {
  const yields = tile.terrain.yields;
  const agriculture = yields.food >= 3 ? 2 : yields.food > 0 ? 1 : 0;
  const extraction = Math.max(yields.timber, yields.iron) >= 2 ? 2
    : Math.max(yields.timber, yields.iron) > 0 ? 1 : 0;
  const commerce = tile.coastal || yields.gold > 0 ? 1 : 0;
  const population = Math.round(
    1800 + yields.food * 1200 + (tile.coastal ? 900 : 0)
      + (agriculture + extraction + commerce) * 450,
  );
  const selected = weightedRgo(world, tile);
  const track = RGO_TYPES[selected.id].track;
  return {
    population,
    agriculture,
    extraction,
    commerce,
    control: tile.owner >= 0 ? 100 : 0,
    lastInvestment: 0,
    rgo: selected.id,
    rgoQuality: selected.quality,
    rgoBaseJobs: Math.max(1000, Math.round(population * selected.jobsRatio / 100) * 100),
    rgoBaseDevelopment: track === 'agriculture' ? agriculture : extraction,
    migration: 0,
  };
}

function ensureProvinceRgo(world, tile) {
  const province = tile.province;
  if (!province) return null;
  const selected = weightedRgo(world, tile);
  if (!RGO_TYPES[province.rgo]) province.rgo = selected.id;
  if (!Number.isFinite(province.rgoQuality)) province.rgoQuality = selected.quality;
  if (!Number.isFinite(province.rgoBaseJobs)) {
    province.rgoBaseJobs = Math.max(
      1000,
      Math.round(province.population * selected.jobsRatio / 100) * 100,
    );
  }
  const type = RGO_TYPES[province.rgo];
  if (!Number.isFinite(province.rgoBaseDevelopment)) {
    province.rgoBaseDevelopment = province[type.track] ?? 0;
  }
  if (!Number.isFinite(province.migration)) province.migration = 0;
  return province;
}

export function initProvinces(world) {
  world.forEach((tile) => {
    tile.province = tile.terrain.passable ? initialProvince(world, tile) : null;
  });
}

export function ensureProvinces(world) {
  world.forEach((tile) => {
    if (tile.terrain.passable && !tile.province) tile.province = initialProvince(world, tile);
    if (tile.province) ensureProvinceRgo(world, tile);
  });
}

export function provinceName(tile) {
  if (tile.city) return `${tile.city.name} Province`;
  return `${tile.terrain.name} ${tile.q}:${tile.r}`;
}

export function provincePopulation(world, nationId) {
  let total = 0;
  world.forEach((tile) => {
    if (tile.owner === nationId && tile.province) total += tile.province.population;
  });
  return Math.round(total);
}

export function provinceRgoJobs(tile) {
  const province = tile?.province;
  const type = RGO_TYPES[province?.rgo];
  if (!province || !type) return 0;
  const developed = Math.max(0, (province[type.track] ?? 0) - (province.rgoBaseDevelopment ?? 0));
  return Math.max(1000, Math.round((province.rgoBaseJobs + developed * 500) / 100) * 100);
}

export function provinceRgoStatus(tile) {
  const province = tile?.province;
  const type = RGO_TYPES[province?.rgo];
  if (!province || !type) return {
    type: null, jobs: 0, employed: 0, unemployed: 0, vacancies: 0, efficiency: 0,
  };
  const jobs = provinceRgoJobs(tile);
  const employed = Math.min(Math.max(0, province.population), jobs);
  return {
    type,
    jobs,
    employed,
    unemployed: Math.max(0, province.population - jobs),
    vacancies: Math.max(0, jobs - province.population),
    efficiency: jobs > 0 ? employed / jobs : 0,
  };
}

/** Province'in haftalık ulusal bütçe katkısı. */
export function provinceOutput(tile) {
  const province = tile?.province;
  if (!province || tile.owner < 0 || isOccupied(tile)) return {
    gold: 0, food: 0, timber: 0, iron: 0, coal: 0,
  };
  const base = tile.terrain.yields;
  const control = clamp(province.control / 100, 0, 1);
  const status = provinceRgoStatus(tile);
  const output = { gold: 0, food: 0, timber: 0, iron: 0, coal: 0 };
  if (!status.type) return output;
  const development = province[status.type.track] ?? 0;
  output[status.type.goodId] = status.type.baseOutput
    * province.rgoQuality * (1 + development * 0.18) * status.efficiency * control;
  const taxpayerScale = clamp(province.population / 7000, 0, 2.2);
  output.gold = (0.08 + base.gold * 0.05 + province.commerce * 0.09)
    * taxpayerScale * control;
  return output;
}

/**
 * Province migration is resolved as aggregated 100-person cohorts every four
 * weeks. No individual POP objects or pathfinding are created: unemployed
 * residents move to another RGO with vacancies inside the same country.
 */
export function runProvinceMigration(world, force = false) {
  const byNation = new Map();
  for (const nation of world.nations) {
    if (nation.economy) nation.economy.internalMigration = 0;
  }
  world.forEach((tile) => {
    if (!tile.province) return;
    tile.province.migration = 0;
    if (tile.owner < 0 || controllerOf(tile) !== tile.owner
      || !world.nations[tile.owner]?.alive) return;
    if (!byNation.has(tile.owner)) byNation.set(tile.owner, []);
    byNation.get(tile.owner).push(tile);
  });
  if (!force && (world.turn ?? 0) % MIGRATION_INTERVAL !== 0) return 0;

  let totalMoved = 0;
  for (const [nationId, tiles] of byNation) {
    const donors = tiles.map((tile) => ({ tile, surplus: provinceRgoStatus(tile).unemployed }))
      .filter((row) => row.surplus >= MIGRATION_COHORT)
      .sort((a, b) => b.surplus - a.surplus);
    const receivers = tiles.map((tile) => ({
      tile,
      vacancies: tile.province.control >= 50 ? provinceRgoStatus(tile).vacancies : 0,
    }))
      .filter((row) => row.vacancies >= MIGRATION_COHORT)
      .sort((a, b) => (
        (b.tile.city ? 1 : 0) - (a.tile.city ? 1 : 0)
        || b.tile.province.control - a.tile.province.control
        || b.vacancies - a.vacancies
      ));
    let receiverIndex = 0;
    let nationMoved = 0;
    for (const donor of donors) {
      let movable = Math.floor(Math.min(
        donor.surplus,
        Math.max(MIGRATION_COHORT, donor.tile.province.population * MIGRATION_RATE),
      ) / MIGRATION_COHORT) * MIGRATION_COHORT;
      while (movable >= MIGRATION_COHORT && receiverIndex < receivers.length) {
        const receiver = receivers[receiverIndex];
        const vacancies = Math.floor(provinceRgoStatus(receiver.tile).vacancies / MIGRATION_COHORT)
          * MIGRATION_COHORT;
        if (vacancies < MIGRATION_COHORT) {
          receiverIndex++;
          continue;
        }
        const moved = Math.min(movable, vacancies);
        donor.tile.province.population -= moved;
        receiver.tile.province.population += moved;
        donor.tile.province.migration -= moved;
        receiver.tile.province.migration += moved;
        movable -= moved;
        nationMoved += moved;
        totalMoved += moved;
      }
      if (receiverIndex >= receivers.length) break;
    }
    world.nations[nationId].economy.internalMigration = nationMoved;
    world.nations[nationId].economy.lastInternalMigration = nationMoved;
    world.nations[nationId].economy.lastMigrationTurn = world.turn ?? 0;
  }
  return totalMoved;
}

export function runProvinces(game) {
  const world = game.world;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
  }

  world.forEach((tile) => {
    const province = tile.province;
    if (!province || tile.owner < 0) return;
    const nation = world.nations[tile.owner];
    if (!nation?.alive) return;
    if (controllerOf(tile) !== tile.owner) {
      province.control = clamp(province.control - 2, 5, 100);
      return;
    }
    const stability = Math.max(0.1, Math.min(1, nation.economy?.stability ?? 0.6));
    const citizenship = policyOf(nation, 'citizenship');
    const minorityControl = citizenship === 'full_citizenship'
      ? 1.25
      : citizenship === 'limited_citizenship' ? 0.85 : 0.6;
    province.control = clamp(
      province.control + (tile.culture === nation.culture ? 1.5 : minorityControl)
        * (0.45 + stability),
      0,
      100,
    );
    const peace = world.nations.every(
      (other) => !other.alive || other.id === nation.id
        || world.relations?.[nation.id]?.[other.id]?.state !== 'war',
    );
    // Sağlık harcaması büyümeyi hızlandırır (bkz. economy.js SOCIAL_PROGRAMS);
    // veri doğrudan okunuyor, economy.js'i import etmek katman döngüsü olurdu.
    const health = 1 + Math.min(100, nation.economy?.social?.health ?? 0) / 100 * 0.35;
    const weeklyGrowth = (0.00018 + province.agriculture * 0.00006)
      * (peace ? 1 : 0.55) * (0.45 + stability) * health;
    province.population = Math.round(province.population * (1 + weeklyGrowth));
  });
  runProvinceMigration(world);
  game.emit('provinces', null);
}
