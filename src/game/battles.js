// EU4 tarzı province muharebesi. Haritadaki ordu yığınları düşman province'inde
// karşılaşır; savaş haftalık turlarda güç ve moral aşındırır, kaybeden geri çekilir.

import { atWar } from './diplomacy.js';
import {
  applyArmyLosses, armyPower, moraleOf, placeUnit, recoverArmy, soldiersOf, stackFull,
} from './units.js';
import {
  addExperience, generalModifier, generalOfArmy, generalSiegeRelief, generalVariance,
} from './generals.js';

// WW1 dengesi: muharebe uzun sürer, moral yavaş kırılır, savunan üstündür.
// Kısa ve kesin muharebeler cepheyi haftalar içinde uçuruyordu (bordergore).
const MAX_ROUNDS = 12;
const BREAK_MORALE = 12;
/** Savunanın kazandığı kalıcı üstünlük: siper avantajı. */
const ENTRENCHMENT = 1.35;

export function initBattles(world) {
  world.battleSystem = { battles: [], nextId: 1 };
}

export function ensureBattles(world) {
  if (!world.battleSystem) initBattles(world);
  return world.battleSystem;
}

function findArmy(world, id) {
  return world.units.find((army) => army.id === id);
}

function terrainDefense(army) {
  const tile = army.tile;
  return (tile.terrain.defense ?? 0) + (tile.city ? 0.12 + tile.city.level * 0.04 : 0);
}

export function startBattle(game, attacker, defender) {
  const system = ensureBattles(game.world);
  if (!attacker || !defender || attacker.battleId || defender.battleId) return false;
  if (attacker.nationId === defender.nationId) return false;
  if (!atWar(game.world, attacker.nationId, defender.nationId)) return false;

  const battle = {
    id: system.nextId++,
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerNation: attacker.nationId,
    defenderNation: defender.nationId,
    q: defender.tile.q,
    r: defender.tile.r,
    started: game.turns.turn,
    nextRound: game.turns.turn + 1,
    rounds: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastRoll: null,
  };
  attacker.battleId = battle.id;
  defender.battleId = battle.id;
  attacker.order = null;
  defender.order = null;
  system.battles.push(battle);
  game.turns.addLog(
    `${game.world.nations[attacker.nationId].name} engaged at ${defender.tile.q}, ${defender.tile.r}.`,
  );
  game.emit('battles', battle);
  game.requestRender();
  return true;
}

/**
 * Muharebe gücü. Ordunun ham gücü × bütçe × arazi × general.
 * Saldıran mühendis general, savunanın arazi/tahkimat bonusunun bir kısmını
 * silebilir — kuşatmanın karşılığı budur.
 */
function battlePower(world, army, defending = false, foeGeneral = null) {
  const nation = world.nations[army.nationId];
  const funding = (nation.economy?.armySpending ?? 100) / 100;
  const general = generalOfArmy(nation, army);
  const relief = defending ? generalSiegeRelief(foeGeneral) : 0;
  const terrain = defending
    ? (1 + terrainDefense(army) * (1 - relief)) * ENTRENCHMENT
    : 1;
  return armyPower(army)
    * (0.55 + funding * 0.45)
    * terrain
    * generalModifier(general, { defending, army })
    * planningBonus(world, army);
}

/** Cephe planı olgunlaştıysa saldırıya katılan ordu bonus alır (bkz. fronts.js). */
function planningBonus(world, army) {
  const front = world.frontSystem?.fronts?.find(
    (candidate) => candidate.armies.includes(army.id) && candidate.active,
  );
  if (!front) return 1;
  return 1 + (front.planning ?? 0) * 0.25;
}

function retreatDestination(world, army, awayFrom) {
  const queue = [{ tile: army.tile, depth: 0 }];
  const seen = new Set([army.tile]);
  const candidates = [];
  for (let head = 0; head < queue.length; head++) {
    const { tile, depth } = queue[head];
    if (depth > 0 && tile.owner === army.nationId && tile.terrain.passable) {
      if (!tile.unit || (tile.unit.nationId === army.nationId && !stackFull(tile))) {
        const distance = Math.abs(tile.q - awayFrom.q) + Math.abs(tile.r - awayFrom.r);
        candidates.push({ tile, depth, distance });
      }
    }
    if (depth >= 4) continue;
    for (const near of world.neighbors(tile)) {
      if (seen.has(near) || !near.terrain.passable) continue;
      if (near.owner !== army.nationId) continue;
      seen.add(near);
      queue.push({ tile: near, depth: depth + 1 });
    }
  }
  candidates.sort((a, b) => a.depth - b.depth || b.distance - a.distance);
  return candidates[0]?.tile ?? null;
}

function retreatArmy(game, army, awayFrom) {
  if (!army || !game.world.units.includes(army)) return;
  const target = retreatDestination(game.world, army, awayFrom);
  army.retreatUntil = game.turns.turn + 3;
  army.order = null;
  if (!target) return;
  // Geri çekilen tümen dost yığına *katılır*, onunla birleşmez.
  placeUnit(army, target);
}

function occupyAfterBattle(game, attacker, battleTile) {
  if (!attacker || !game.world.units.includes(attacker) || battleTile.unit) return;
  game.enterTile(attacker, battleTile);
}

function finishBattle(game, battle, attacker, defender, attackerWon) {
  const system = ensureBattles(game.world);
  let winner = attackerWon ? attacker : defender;
  const loser = attackerWon ? defender : attacker;
  const battleTile = game.world.get(battle.q, battle.r);

  if (attacker) attacker.battleId = null;
  if (defender) defender.battleId = null;
  if (winner && soldiersOf(winner) <= 0) {
    game.turns.killUnit(winner);
    winner = null;
  } else if (winner) {
    recoverArmy(winner, 0, 8);
  }

  if (loser && game.world.units.includes(loser)) {
    if (soldiersOf(loser) <= 0) game.turns.killUnit(loser);
    else retreatArmy(game, loser, winner?.tile ?? battleTile);
  }
  if (attackerWon && attacker && battleTile) {
    occupyAfterBattle(game, attacker, battleTile);
  }

  system.battles = system.battles.filter((item) => item.id !== battle.id);
  const winnerNation = winner ? game.world.nations[winner.nationId] : null;
  if (winnerNation) {
    game.turns.addLog(
      `${winnerNation.name} won the battle at ${battle.q}, ${battle.r}; the enemy retreated.`,
    );
  }
  game.emit('battles', battle);
  game.renderer.invalidateCache();
}

function resolveRound(game, battle) {
  const world = game.world;
  const attacker = findArmy(world, battle.attackerId);
  const defender = findArmy(world, battle.defenderId);
  if (!attacker || !defender || !atWar(world, battle.attackerNation, battle.defenderNation)) {
    finishBattle(game, battle, attacker, defender, Boolean(attacker && !defender));
    return;
  }

  const attackerGeneral = generalOfArmy(world.nations[attacker.nationId], attacker);
  const defenderGeneral = generalOfArmy(world.nations[defender.nationId], defender);
  const attackerBase = battlePower(world, attacker, false, defenderGeneral);
  const defenderBase = battlePower(world, defender, true, attackerGeneral);
  // Trickster generalin zar aralığı geniştir: hem daha iyi hem daha kötü çeker.
  const swing = (general) => 0.36 * (1 + generalVariance(general));
  const roll = (general) => 1 - swing(general) / 2 + game.turns.rng() * swing(general);
  const attackerRoll = attackerBase * roll(attackerGeneral);
  const defenderRoll = defenderBase * roll(defenderGeneral);
  const total = Math.max(1, attackerRoll + defenderRoll);
  // Raund başına kayıp düşük, raund sayısı yüksek: muharebe kısa ve kesin
  // değil, uzun ve aşındırıcıdır. Toplam kayıp artar, ilerleme yavaşlar.
  const attackerCasualties = Math.round(45 + (defenderRoll / total) * 130);
  const defenderCasualties = Math.round(30 + (attackerRoll / total) * 105);
  const attackerMoraleLoss = 5 + (defenderRoll / total) * 10;
  const defenderMoraleLoss = 4 + (attackerRoll / total) * 9;

  applyArmyLosses(attacker, attackerCasualties, attackerMoraleLoss);
  applyArmyLosses(defender, defenderCasualties, defenderMoraleLoss);
  battle.rounds++;
  battle.attackerLosses += attackerCasualties;
  battle.defenderLosses += defenderCasualties;
  battle.lastRoll = {
    attacker: attackerRoll,
    defender: defenderRoll,
    turn: game.turns.turn,
  };

  // Komutanlar her raundda tecrübe kazanır; terfi oyuncunun günlüğüne düşer.
  for (const [general, army] of [[attackerGeneral, attacker], [defenderGeneral, defender]]) {
    if (!general) continue;
    general.battles = (general.battles ?? 0) + 1;
    if (addExperience(general, 9) && army.nationId === game.turns.playerNation) {
      game.turns.addLog(`${general.name} was promoted to skill ${general.skill}.`);
    }
  }

  const attackerBroken = soldiersOf(attacker) <= 0 || moraleOf(attacker) <= BREAK_MORALE;
  const defenderBroken = soldiersOf(defender) <= 0 || moraleOf(defender) <= BREAK_MORALE;
  const timedOut = battle.rounds >= MAX_ROUNDS;
  if (attackerBroken || defenderBroken || timedOut) {
    const attackerScore = armyPower(attacker) * (0.5 + moraleOf(attacker) / 200);
    const defenderScore = armyPower(defender) * (0.5 + moraleOf(defender) / 200);
    finishBattle(game, battle, attacker, defender, !attackerBroken && (
      defenderBroken || attackerScore > defenderScore
    ));
  }
}

export function runBattles(game) {
  const system = ensureBattles(game.world);
  for (const battle of [...system.battles]) {
    if (game.turns.turn < battle.nextRound) continue;
    resolveRound(game, battle);
    battle.nextRound = game.turns.turn + 1;
  }
  game.emit('battles', system.battles);
}

export function battlesFor(world, nationId) {
  return ensureBattles(world).battles.filter(
    (battle) => battle.attackerNation === nationId || battle.defenderNation === nationId,
  );
}
