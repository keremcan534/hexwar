// Birim tipleri ve savaş çözümü. Tek yerde tanımlı: yeni birim eklemek için burası yeter.

import { buildingDefense } from './buildings.js';
import { techAttackBonus, techHpBonus, techSiegeFactor } from './tech.js';

/** Kara birimi denize girdiğinde bu hızla yol alır (bindirilmiş hâli). */
export const EMBARKED_MOVES = 4;

export const UNIT_TYPES = {
  SCOUT: {
    id: 'SCOUT', name: 'İzci', glyph: 'İ', domain: 'land',
    moves: 5, attack: 2, hp: 60,
  },
  INFANTRY: {
    id: 'INFANTRY', name: 'Piyade', glyph: 'P', domain: 'land',
    moves: 3, attack: 5, hp: 110,
    /** Savunmada arazi bonusunu iki katı kullanır. */
    entrenched: true,
  },
  CAVALRY: {
    id: 'CAVALRY', name: 'Süvari', glyph: 'S', domain: 'land',
    moves: 6, attack: 6, hp: 90,
  },
  WARSHIP: {
    id: 'WARSHIP', name: 'Savaş Gemisi', glyph: 'G', domain: 'sea',
    moves: 7, attack: 6, hp: 80,
  },
};

/** Birimin bu turdaki hareket hakkı: denizdeki kara birimi yavaşlar. */
export function movesFor(unit) {
  return unit.embarked ? EMBARKED_MOVES : unit.type.moves;
}

/** Can tavanı: zırh teknolojisiyle birlikte üretilen birimlerde daha yüksek. */
export function maxHpOf(unit) {
  return unit.maxHp ?? unit.type.hp;
}

let nextId = 1;

export function createUnit(typeId, nationId, tile, nation) {
  const type = UNIT_TYPES[typeId];
  // Zırh teknolojisi can tavanını yükseltir; birim başına saklanır ki
  // teknoloji sonradan gelse eski birimler etkilenmesin.
  const maxHp = type.hp + (nation ? techHpBonus(nation) : 0);
  const unit = {
    id: nextId++,
    type,
    nationId,
    tile,
    maxHp,
    hp: maxHp,
    embarked: type.domain === 'land' && tile.terrain.water,
    movesLeft: type.moves,
    order: null,
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

  const atk = attacker.type.attack + atkBonus;
  const def = defender.type.attack + defBonus;
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
