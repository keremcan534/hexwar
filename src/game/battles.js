// Province muharebesi. Muharebe bir *kareye* aittir, iki tumene degil: o
// province'te savunan butun tumenler ile oraya saldiran butun tumenler tek bir
// muharebede toplanir.
//
// Eskiden muharebe tumen ciftiydi. Bir karede dort tumen durabildigi icin
// saldiran birine vururken digerleri seyrediyor, cephe boyunca gelen tumenler
// ayni province'e ayri ayri dalip tek tek eziliyordu. Kare anahtarli muharebe
// hem bunu cozer hem de cephenin toplu davranmasini mumkun kilar.
//
// Denge WW1'e bakar: muharebe uzun surer, moral yavas kirilir, savunan ustundur.

import { atWar } from './diplomacy.js';
import {
  MAX_STACK, applyArmyLosses, armyPower, clearPath, organizationOf, placeUnit, recoverArmy,
  resetEntrenchment, soldiersOf, stackFull, unitsOn,
} from './units.js';
import {
  addExperience, consumeAssaultPlanning, generalModifier, generalOfArmy,
  generalSiegeRelief, generalVariance, planningBonus,
} from './command.js';
import { fortDefenseAt } from './construction.js';
import { MILITARY_EQUIPMENT, equipmentStock } from './economy.js';
import { controllerOf } from './control.js';

/** Muharebe bu kadar raunttan sonra zorla biter; kazanan guce gore belirlenir. */
export const MAX_ROUNDS = 20;
/** Tek province muharebesinin combat width'i; sonsuz tumen yigmayi engeller. */
export const MAX_ASSAULT_DIVISIONS = 3;
export const MAX_DEFENSE_DIVISIONS = MAX_STACK;
/** Bu organization seviyesine dusen division tek basina kirilir ve cekilir. */
export const BREAK_ORGANIZATION = 15;

export function initBattles(world) {
  world.battleSystem = { battles: [], nextId: 1 };
}

export function ensureBattles(world) {
  if (!world.battleSystem) initBattles(world);
  if (!Array.isArray(world.battleSystem.battles)) world.battleSystem.battles = [];
  for (const battle of world.battleSystem.battles) {
    if (!Array.isArray(battle.attackers)) battle.attackers = [];
    if (!Array.isArray(battle.defenders)) battle.defenders = [];
    if (!Number.isFinite(battle.attackerCommitted)) {
      battle.attackerCommitted = battle.attackers.length;
    }
    if (!Number.isFinite(battle.defenderCommitted)) {
      battle.defenderCommitted = battle.defenders.length;
    }
  }
  return world.battleSystem;
}

function armiesByIds(world, ids) {
  return ids.map((id) => world.units.find((unit) => unit.id === id)).filter(Boolean);
}

/** Bir karede suren muharebe. */
export function battleAt(world, tile) {
  if (!tile) return null;
  return ensureBattles(world).battles.find(
    (battle) => battle.q === tile.q && battle.r === tile.r,
  ) ?? null;
}

/** Muharebenin iki tarafi, canli tumenler olarak. */
export function battleSides(world, battle) {
  return {
    attackers: armiesByIds(world, battle.attackers ?? []),
    defenders: armiesByIds(world, battle.defenders ?? []),
  };
}

function terrainDefense(world, army) {
  const tile = army.tile;
  return (tile.terrain.defense ?? 0) + (tile.city ? 0.12 + tile.city.level * 0.04 : 0)
    + fortDefenseAt(world, army.nationId, tile);
}

/** Bir tarafin en yetenekli komutani: zar oynakligi ve kusatma ondan gelir. */
function leadGeneral(world, units) {
  let best = null;
  for (const unit of units) {
    const general = generalOfArmy(world.nations[unit.nationId], unit);
    if (general && (!best || general.skill > best.skill)) best = general;
  }
  return best;
}

/**
 * Bir tumenin muharebe gucu. Ham guc × butce × arazi × general × plan.
 * Saldiran muhendis general, savunanin arazi/tahkimat bonusunun bir kismini
 * silebilir — kusatmanin karsiligi budur.
 */
export function battleUnitPower(world, unit, defending, relief = 0) {
  const nation = world.nations[unit.nationId];
  // Maaş muharebe iradesini alır: aç asker savaşmaz.
  const funding = (nation.economy?.militaryWages ?? 100) / 100;
  // Cephanesi olmayan ordu dövüşemez. Ölçüt ihtiyat stoğudur: stok ihtiyatın
  // altına inince güç doğrusal olarak düşer. Bu bağ yokken teçhizat muharebeye
  // hiç girmiyordu — stoğu sıfır olan ve askerî sanayisi tamamen kapalı bir
  // ordu, deposu dolu orduyla neredeyse aynı güçte dövüşüyor (fark %3.6) ve
  // aynı savaşta DAHA FAZLA toprak işgal ediyordu (59'a 52, ölçüldü).
  const reserve = Math.max(1, MILITARY_EQUIPMENT.arms.reserve);
  const readiness = Math.max(0, Math.min(1, equipmentStock(nation, 'arms') / reserve));
  const general = generalOfArmy(nation, unit);
  const terrain = defending
    ? (1 + terrainDefense(world, unit) * (1 - relief)) * (1 + (unit.entrenchment ?? 0))
    : 1;
  return armyPower(unit)
    * (0.55 + funding * 0.45)
    * (0.65 + readiness * 0.35)
    * terrain
    * generalModifier(general, { defending, army: unit })
    * (defending ? 1 : planningBonus(nation, unit));
}

function sidePower(world, units, defending, relief) {
  return units.reduce((sum, unit) => sum + battleUnitPower(world, unit, defending, relief), 0);
}

/**
 * Bir tumeni muharebeye sokar. Karede zaten bir muharebe varsa ona katilir —
 * cephe boyunca gelen takviyeler ayri muharebeler acmasin.
 * @returns {boolean} muharebeye girildi mi
 */
export function startBattle(game, attacker, tile) {
  const world = game.world;
  const system = ensureBattles(world);
  if (!attacker || !tile || attacker.hp <= 0
    || organizationOf(attacker) <= BREAK_ORGANIZATION) return false;

  const existing = battleAt(world, tile);
  if (existing) return joinBattle(game, existing, attacker);

  const defenders = unitsOn(tile).filter((unit) => unit.nationId !== attacker.nationId);
  if (!defenders.length || attacker.battleId) return false;
  const defenderNation = defenders[0].nationId;
  if (!atWar(world, attacker.nationId, defenderNation)) return false;
  consumeAssaultPlanning(world.nations[attacker.nationId], attacker, game.turns.turn);

  const battle = {
    id: system.nextId++,
    q: tile.q,
    r: tile.r,
    attackerNation: attacker.nationId,
    defenderNation,
    attackers: [],
    defenders: [],
    attackerCommitted: 0,
    defenderCommitted: 0,
    started: game.turns.turn,
    nextRound: game.turns.turn + 1,
    rounds: 0,
    attackerLosses: 0,
    defenderLosses: 0,
    lastRoll: null,
  };
  system.battles.push(battle);
  enlist(battle, attacker, true);
  for (const unit of defenders.slice(0, MAX_DEFENSE_DIVISIONS)) {
    if (unit.nationId === defenderNation) enlist(battle, unit, false);
  }

  // Dünyadaki her muharebe günlüğe düşer ama kart yalnız oyuncununkiler için
  // açılır: 15 ülke savaşırken ekran başka türlü okunmaz olurdu.
  const mine = attacker.nationId === game.turns.playerNation
    || defenderNation === game.turns.playerNation;
  game.turns.addLog(
    `${world.nations[attacker.nationId].name} engaged at ${tile.q}, ${tile.r}.`,
    { kind: 'BATTLE', silent: !mine, tile },
  );
  game.emit('battles', battle);
  game.requestRender();
  return true;
}

/** Tumeni muharebenin bir tarafina yazar; yuruyusu ve emri duser. */
function enlist(battle, unit, attacking) {
  const list = attacking ? battle.attackers : battle.defenders;
  if (!list.includes(unit.id)) {
    list.push(unit.id);
    const key = attacking ? 'attackerCommitted' : 'defenderCommitted';
    battle[key] = (battle[key] ?? 0) + 1;
  }
  unit.battleId = battle.id;
  if (attacking) resetEntrenchment(unit);
  unit.order = null;
  clearPath(unit);
}

/** Suren bir muharebeye takviye. Ucuncu ulus katilamaz. */
export function joinBattle(game, battle, unit) {
  if (!battle || !unit || unit.battleId === battle.id) return false;
  if (unit.battleId || organizationOf(unit) <= BREAK_ORGANIZATION) return false;
  if (unit.nationId === battle.attackerNation) {
    if ((battle.attackerCommitted ?? battle.attackers.length) >= MAX_ASSAULT_DIVISIONS) {
      return false;
    }
    enlist(battle, unit, true);
  } else if (unit.nationId === battle.defenderNation) {
    if ((battle.defenderCommitted ?? battle.defenders.length) >= MAX_DEFENSE_DIVISIONS) {
      return false;
    }
    enlist(battle, unit, false);
  } else {
    return false;
  }
  game.emit('battles', battle);
  return true;
}

/** Olen ya da dagilan tumeni butun muharebelerden duşurur. */
export function removeFromBattles(world, unit) {
  for (const battle of ensureBattles(world).battles) {
    battle.attackers = battle.attackers.filter((id) => id !== unit.id);
    battle.defenders = battle.defenders.filter((id) => id !== unit.id);
  }
  unit.battleId = null;
}

/**
 * Cekilecek province: kendi topragimizda, dusman baskisi az ve muharebenin
 * gerisinde kalan yer. Bir karelik geri ziplamak ayni savasi hemen yeniden
 * aciyordu; iki province derinlik duzenli bir ikinci hat kurar.
 */
function retreatDestination(world, army, awayFrom) {
  const queue = [{ tile: army.tile, depth: 0 }];
  const seen = new Set([army.tile]);
  const candidates = [];
  for (let head = 0; head < queue.length; head++) {
    const { tile, depth } = queue[head];
    if (depth > 0 && controllerOf(tile) === army.nationId
      && tile.terrain.passable && !stackFull(tile)) {
      const hostile = unitsOn(tile).some((unit) => unit.nationId !== army.nationId);
      if (!hostile) {
        const distance = world.wrapDistance(tile.q, tile.r, awayFrom.q, awayFrom.r);
        const pressure = world.neighbors(tile).filter((near) => (
          controllerOf(near) >= 0 && controllerOf(near) !== army.nationId
          && atWar(world, controllerOf(near), army.nationId)
        )).length;
        candidates.push({ tile, depth, distance, pressure });
      }
    }
    for (const near of world.neighbors(tile)) {
      if (seen.has(near) || !near.terrain.passable) continue;
      if (controllerOf(near) !== army.nationId) continue;
      seen.add(near);
      queue.push({ tile: near, depth: depth + 1 });
    }
  }
  candidates.sort((a, b) => a.pressure - b.pressure
    || Math.abs(a.depth - 2) - Math.abs(b.depth - 2)
    || b.distance - a.distance);
  return candidates[0]?.tile ?? null;
}

function retreatArmy(game, army, awayFrom) {
  if (!army || !game.world.units.includes(army)) return false;
  const target = retreatDestination(game.world, army, awayFrom);
  // Cep, ada veya dolu geri hat: province'ten cikamayan maglup tumen teslim
  // olur. Aksi halde karede kalip kazananin isgalini sonsuza dek engelliyordu.
  if (!target) {
    const nation = game.world.nations[army.nationId];
    game.turns.addLog(
      `${nation?.name ?? 'A division'} surrendered at ${awayFrom.q}, ${awayFrom.r}; no retreat route remained.`,
      {
        kind: 'BATTLE',
        silent: army.nationId !== game.turns.playerNation,
        tile: awayFrom,
      },
    );
    game.turns.killUnit(army);
    return false;
  }
  army.retreatUntil = game.turns.turn + 4;
  resetEntrenchment(army);
  army.attackReadyAt = Math.max(army.attackReadyAt ?? 0, army.retreatUntil);
  army.order = null;
  clearPath(army);
  // Cekilen tumen mevkisini birakir: cephe onu geride yeniden konumlandirsin.
  army.post = null;
  army.lastRetreat = {
    turn: game.turns.turn,
    from: { q: awayFrom.q, r: awayFrom.r },
    to: { q: target.q, r: target.r },
    distance: game.world.wrapDistance(target.q, target.r, awayFrom.q, awayFrom.r),
  };
  placeUnit(army, target);
  return true;
}

/** Kazanan saldirgan bosalan province'e girer; girisi ilk giden tumen yapar. */
function occupyAfterBattle(game, attackers, tile) {
  if (!tile || unitsOn(tile).length) return;
  const winner = attackers
    .filter((unit) => game.world.units.includes(unit) && soldiersOf(unit) > 0)
    .sort((a, b) => armyPower(b) - armyPower(a))[0];
  if (winner) game.enterTile(winner, tile);
}

function finishBattle(game, battle, attackerWon) {
  const world = game.world;
  const system = ensureBattles(world);
  const { attackers, defenders } = battleSides(world, battle);
  const tile = world.get(battle.q, battle.r);
  const winners = attackerWon ? attackers : defenders;
  const losers = attackerWon ? defenders : attackers;

  for (const unit of [...attackers, ...defenders]) unit.battleId = null;
  system.battles = system.battles.filter((item) => item.id !== battle.id);

  for (const unit of winners) {
    if (soldiersOf(unit) <= 0) game.turns.killUnit(unit);
    else {
      recoverArmy(unit, 0, 8);
      // Kazanan da hemen sonraki province'e zincirleme kosmaz; ikmal ve yeniden
      // orgutlenme iki hafta surer. Yavas cephe temposunun ikinci kapisi budur.
      unit.attackReadyAt = Math.max(unit.attackReadyAt ?? 0, game.turns.turn + 2);
    }
  }
  const awayFrom = tile ?? losers[0]?.tile;
  for (const unit of losers) {
    if (!world.units.includes(unit)) continue;
    if (soldiersOf(unit) <= 0) game.turns.killUnit(unit);
    else retreatArmy(game, unit, awayFrom);
  }
  if (attackerWon) occupyAfterBattle(game, attackers, tile);

  const nation = world.nations[attackerWon ? battle.attackerNation : battle.defenderNation];
  if (nation) {
    const me = game.turns.playerNation;
    const involved = battle.attackerNation === me || battle.defenderNation === me;
    game.turns.addLog(
      `${nation.name} won the battle at ${battle.q}, ${battle.r}; the enemy was forced out.`,
      {
        // Kazanan biz miyiz: zafer ve yenilgi aynı tonda görünmemeli.
        kind: nation.id === me ? 'FIELD_WIN' : 'BATTLE',
        silent: !involved,
        tile,
      },
    );
  }
  game.emit('battles', battle);
  game.renderer.invalidateCache();
}

/** Kayiplari tarafa gucu oraninda dagitir. */
function distributeLosses(units, casualties, organizationLoss) {
  const total = units.reduce((sum, unit) => sum + armyPower(unit), 0);
  for (const unit of units) {
    const share = total > 0 ? armyPower(unit) / total : 1 / units.length;
    applyArmyLosses(unit, casualties * share, organizationLoss);
  }
}

function resolveRound(game, battle) {
  const world = game.world;
  const { attackers, defenders } = battleSides(world, battle);
  // Bir taraf tamamen yok olduysa muharebe biter.
  if (!attackers.length || !defenders.length
    || !atWar(world, battle.attackerNation, battle.defenderNation)) {
    finishBattle(game, battle, attackers.length > 0 && defenders.length === 0);
    return;
  }

  const attackerLead = leadGeneral(world, attackers);
  const defenderLead = leadGeneral(world, defenders);
  // Bir general ayni muharebede kac tumen yonetirse yonetsin raund basina bir
  // kez tecrube kazanir. Katilim kayiplar uygulanmadan once kaydedilir.
  const participatingGenerals = new Map();
  for (const unit of [...attackers, ...defenders]) {
    const general = generalOfArmy(world.nations[unit.nationId], unit);
    if (general) participatingGenerals.set(general, unit.nationId);
  }
  const relief = generalSiegeRelief(attackerLead);
  const attackerBase = sidePower(world, attackers, false, 0);
  const defenderBase = sidePower(world, defenders, true, relief);
  // Trickster generalin zar araligi genistir: hem daha iyi hem daha kotu ceker.
  const swing = (general) => 0.36 * (1 + generalVariance(general));
  const roll = (general) => 1 - swing(general) / 2 + game.turns.rng() * swing(general);
  const attackerRoll = attackerBase * roll(attackerLead);
  const defenderRoll = defenderBase * roll(defenderLead);
  const total = Math.max(1, attackerRoll + defenderRoll);

  // Raund basina kayip dusuk, raund sayisi yuksek: muharebe kisa ve kesin
  // degil, uzun ve asindiricidir. Kayip tumen basinadir, boylece kalabalik
  // taraf toplamda daha cok kaybeder ama tumen basina ayni asinmayi yasar.
  const attackerCasualties = (16 + (defenderRoll / total) * 34) * attackers.length;
  const defenderCasualties = (12 + (attackerRoll / total) * 28) * defenders.length;
  const attackerOrganizationLoss = 6 + (defenderRoll / total) * 5;
  const defenderOrganizationLoss = 5.5 + (attackerRoll / total) * 4.5;

  distributeLosses(attackers, attackerCasualties, attackerOrganizationLoss);
  distributeLosses(defenders, defenderCasualties, defenderOrganizationLoss);

  battle.rounds++;
  battle.attackerLosses += Math.round(attackerCasualties);
  battle.defenderLosses += Math.round(defenderCasualties);
  battle.lastRoll = { attacker: attackerRoll, defender: defenderRoll, turn: game.turns.turn };

  // Sifirlanan tumen bir sonraki raundun sayi/casualty carpaninda kalmasin.
  for (const unit of [...attackers, ...defenders]) {
    if (soldiersOf(unit) <= 0 && world.units.includes(unit)) game.turns.killUnit(unit);
  }

  // Komutanlar her raundda bir kez tecrube kazanir; terfi oyuncunun gunlugune duser.
  for (const [general, nationId] of participatingGenerals) {
    general.battles = (general.battles ?? 0) + 1;
    if (addExperience(general, 4) && nationId === game.turns.playerNation) {
      game.turns.addLog(`${general.name} was promoted to skill ${general.skill}.`,
        { kind: 'COMMANDER' });
    }
  }

  // HOI tarzi kirilma division bazindadir. Dusuk org'lu birlik, tarafin
  // ortalamasi yuksek diye cephede kalip strength'i sifirlanana dek dovusmez.
  const battleTile = world.get(battle.q, battle.r);
  for (const unit of [...attackers, ...defenders]) {
    if (!world.units.includes(unit) || soldiersOf(unit) <= 0) continue;
    if (organizationOf(unit) > BREAK_ORGANIZATION) continue;
    removeFromBattles(world, unit);
    retreatArmy(game, unit, battleTile ?? unit.tile);
  }

  const { attackers: liveAttackers, defenders: liveDefenders } = battleSides(world, battle);
  if (!liveAttackers.length || !liveDefenders.length) {
    finishBattle(game, battle, liveAttackers.length > 0 && liveDefenders.length === 0);
  } else if (battle.rounds >= MAX_ROUNDS) {
    const attackerScore = sidePower(world, liveAttackers, false, 0);
    const defenderScore = sidePower(world, liveDefenders, true, relief);
    finishBattle(game, battle, attackerScore > defenderScore);
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
