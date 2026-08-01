// Province katmanı: her kara hex'i nüfus, kontrol ve uzmanlaşma taşıyan
// ekonomik bir karar alanına dönüştürür. Şehirler sanayi merkezidir; province
// ise hammadde, vergi tabanı ve nüfus sağlar.

export const PROVINCE_TRACKS = {
  agriculture: {
    id: 'agriculture', name: 'Farms', icon: '🌾',
    desc: 'More grain, faster population growth',
  },
  extraction: {
    id: 'extraction', name: 'Extraction', icon: '⛏',
    desc: 'More timber, iron and coal',
  },
  commerce: {
    id: 'commerce', name: 'Market Towns', icon: '¤',
    desc: 'More local taxes and trade value',
  },
};

export const AUTHORITY_CAP = 100;
export const AUTHORITY_REGEN = 2;
export const DEVELOPMENT_AUTHORITY = 20;
export const DEVELOPMENT_MAX = 5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const canAfford = (nation, cost) => Object.entries(cost).every(
  ([resource, amount]) => (nation[resource] ?? 0) >= amount,
);
const pay = (nation, cost) => {
  if (!canAfford(nation, cost)) return false;
  for (const [resource, amount] of Object.entries(cost)) nation[resource] -= amount;
  return true;
};

function initialProvince(tile) {
  const yields = tile.terrain.yields;
  const agriculture = yields.food >= 3 ? 2 : yields.food > 0 ? 1 : 0;
  const extraction = Math.max(yields.timber, yields.iron) >= 2 ? 2
    : Math.max(yields.timber, yields.iron) > 0 ? 1 : 0;
  const commerce = tile.coastal || yields.gold > 0 ? 1 : 0;
  const population = Math.round(
    1800 + yields.food * 1200 + (tile.coastal ? 900 : 0)
      + (agriculture + extraction + commerce) * 450,
  );
  return {
    population,
    agriculture,
    extraction,
    commerce,
    control: tile.owner >= 0 ? 100 : 0,
    lastInvestment: 0,
  };
}

export function initProvinces(world) {
  world.forEach((tile) => {
    tile.province = tile.terrain.passable ? initialProvince(tile) : null;
  });
}

export function ensureProvinces(world) {
  world.forEach((tile) => {
    if (tile.terrain.passable && !tile.province) tile.province = initialProvince(tile);
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

/** Province'in haftalık ulusal bütçe katkısı. */
export function provinceOutput(tile) {
  const province = tile?.province;
  if (!province || tile.owner < 0) return {
    gold: 0, food: 0, timber: 0, iron: 0, coal: 0,
  };
  const base = tile.terrain.yields;
  const populationScale = clamp(province.population / 7000, 0.35, 2.2);
  const control = clamp(province.control / 100, 0, 1);
  const outputScale = populationScale * control;
  const coalTerrain = tile.terrain.id === 'HILLS' || tile.terrain.id === 'MOUNTAIN';
  return {
    gold: (0.08 + base.gold * 0.05 + province.commerce * 0.09) * outputScale,
    food: base.food * (0.045 + province.agriculture * 0.035) * outputScale,
    timber: base.timber * (0.04 + province.extraction * 0.035) * outputScale,
    iron: base.iron * (0.035 + province.extraction * 0.03) * outputScale,
    coal: coalTerrain ? province.extraction * 0.045 * outputScale : 0,
  };
}

export function provinceDevelopmentCost(tile, trackId) {
  const province = tile?.province;
  const level = province?.[trackId] ?? 0;
  return {
    gold: 20 + level * 14,
    timber: trackId === 'agriculture' ? 1 : 2 + Math.floor(level / 2),
  };
}

export function canDevelopProvince(world, nation, tile, trackId) {
  const province = tile?.province;
  if (!province || !PROVINCE_TRACKS[trackId] || tile.owner !== nation.id) return false;
  if (province.control < 50 || province[trackId] >= DEVELOPMENT_MAX) return false;
  if ((nation.economy?.authority ?? 0) < DEVELOPMENT_AUTHORITY) return false;
  return canAfford(nation, provinceDevelopmentCost(tile, trackId));
}

export function developProvince(game, tile, trackId, nationId = game.turns.playerNation) {
  const nation = game.world.nations[nationId];
  if (!nation || !canDevelopProvince(game.world, nation, tile, trackId)) return false;
  if (!pay(nation, provinceDevelopmentCost(tile, trackId))) return false;
  nation.economy.authority -= DEVELOPMENT_AUTHORITY;
  tile.province[trackId]++;
  tile.province.lastInvestment = game.turns.turn;
  if (trackId === 'agriculture') tile.province.population += 350;
  game.recomputeEconomy();
  if (nationId === game.turns.playerNation) {
    game.turns.addLog(`${provinceName(tile)} developed ${PROVINCE_TRACKS[trackId].name}.`);
  }
  game.emit('provinces', tile);
  game.emit('economy', nation.economy);
  game.requestRender();
  return true;
}

export function runProvinces(game) {
  const world = game.world;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    const stability = Math.max(0.1, Math.min(1, nation.economy.stability ?? 0.6));
    nation.economy.authority = clamp(
      (nation.economy.authority ?? 50) + AUTHORITY_REGEN * (0.55 + stability * 0.75),
      0,
      AUTHORITY_CAP,
    );
  }

  world.forEach((tile) => {
    const province = tile.province;
    if (!province || tile.owner < 0) return;
    const nation = world.nations[tile.owner];
    if (!nation?.alive) return;
    const stability = Math.max(0.1, Math.min(1, nation.economy?.stability ?? 0.6));
    province.control = clamp(
      province.control + (tile.culture === nation.culture ? 1.5 : 0.6)
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
  game.emit('provinces', null);
}
