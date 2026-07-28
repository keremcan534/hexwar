// Birim tipleri ve savaş çözümü. Tek yerde tanımlı: yeni birim eklemek için burası yeter.

export const UNIT_TYPES = {
  SCOUT: {
    id: 'SCOUT', name: 'İzci', glyph: 'İ',
    moves: 5, attack: 2, hp: 60, cost: 1,
  },
  INFANTRY: {
    id: 'INFANTRY', name: 'Piyade', glyph: 'P',
    moves: 3, attack: 5, hp: 110, cost: 2,
    /** Savunmada arazi bonusunu iki katı kullanır. */
    entrenched: true,
  },
  CAVALRY: {
    id: 'CAVALRY', name: 'Süvari', glyph: 'S',
    moves: 6, attack: 6, hp: 90, cost: 3,
  },
};

let nextId = 1;

export function createUnit(typeId, nationId, tile) {
  const type = UNIT_TYPES[typeId];
  const unit = {
    id: nextId++,
    type,
    nationId,
    tile,
    hp: type.hp,
    movesLeft: type.moves,
  };
  tile.unit = unit;
  return unit;
}

export function removeUnit(world, unit) {
  if (unit.tile?.unit === unit) unit.tile.unit = null;
  const i = world.units.indexOf(unit);
  if (i >= 0) world.units.splice(i, 1);
}

export function placeUnit(unit, tile) {
  if (unit.tile?.unit === unit) unit.tile.unit = null;
  unit.tile = tile;
  tile.unit = unit;
}

/**
 * Bir saldırı turu. Saldıran ve savunan aynı anda hasar alır;
 * savunan arazinin savunma bonusundan yararlanır.
 * @returns {{ attackerDamage: number, defenderDamage: number, defenderDied: boolean, attackerDied: boolean }}
 */
export function resolveCombat(attacker, defender, rng) {
  const terrainBonus = defender.tile.terrain.defense * (defender.type.entrenched ? 2 : 1);
  const roll = () => 0.75 + rng() * 0.5;

  const defenderDamage = Math.round(attacker.type.attack * 10 * roll() * (1 - Math.min(0.7, terrainBonus)));
  // Karşı saldırı daha zayıf: saldıran inisiyatifi elinde tutar.
  const attackerDamage = Math.round(defender.type.attack * 10 * roll() * 0.6);

  defender.hp -= defenderDamage;
  attacker.hp -= attackerDamage;

  return {
    defenderDamage,
    attackerDamage,
    defenderDied: defender.hp <= 0,
    attackerDied: attacker.hp <= 0,
  };
}
