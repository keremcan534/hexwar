// KUŞATMA (HOI4'ün en sevilen anı). Motor bunu zaten yapıyordu: kaçış yolu
// kalmayan yenik tümen teslim olur (battles.js retreatArmy). Ama hiçbir yerde
// görünmüyordu — cep oluşurken harita sessiz, teslimde günlüğe tümen başına
// kuru bir satır düşüyordu. Bu dosya yalnız OKUR ve duyurur, simülasyonu
// değiştirmez:
//
//   - her hafta oyuncunun savaşlarındaki cepler bulunur (world.pockets, kayda
//     girmez — türetilir) ve harita onları halkayla işaretler;
//   - yeni cep oyuncuya duyurulur (bizimki tehlike, düşmanınki fırsat);
//   - haftanın teslimleri tek bildirime toplanır: "4 tümen, 120 bin kişi".

import { atWar } from './diplomacy.js';
import { isEncircled } from './battles.js';
import { provinceName } from './provinces.js';
import { formatPopulation } from './economy.js';
import { menUnderArms } from './units.js';

/** Teslim olan tümeni haftanın defterine yazar (battles.js çağırır). */
export function recordSurrender(world, unit, tile, captor = -1) {
  world.surrenders ??= [];
  world.surrenders.push({
    nationId: unit.nationId,
    captor,
    q: tile?.q ?? unit.tile?.q,
    r: tile?.r ?? unit.tile?.r,
    men: menUnderArms(unit),
  });
}

/**
 * Oyuncunun savaşlarındaki cepler: kaçış yolu olmayan, cephedeki kara
 * tümenleri, kare başına gruplu. Yalnız oyuncu ve onunla savaşanlar
 * taranır — başkalarının cepleri oyuncuya bir şey söylemez.
 */
export function findPockets(world, playerNation) {
  if (playerNation == null || playerNation < 0) return [];
  const sides = new Set([playerNation]);
  for (const nation of world.nations) {
    if (nation.alive && nation.id !== playerNation && atWar(world, nation.id, playerNation)) sides.add(nation.id);
  }
  if (sides.size === 1) return [];
  // Tanım motorunkidir (battles.isEncircled): halka ile ceza aynı kuraldan
  // gelir. Bayrağa yazmaz — o, haftanın muharebesinden önce kurulur.
  const pockets = new Map();
  for (const unit of world.units) {
    if (!sides.has(unit.nationId) || !isEncircled(world, unit)) continue;
    const key = `${unit.nationId}:${unit.tile.q}:${unit.tile.r}`;
    const pocket = pockets.get(key) ?? {
      key, nationId: unit.nationId, q: unit.tile.q, r: unit.tile.r, units: [], men: 0,
    };
    pocket.units.push(unit.id);
    pocket.men += menUnderArms(unit);
    pockets.set(key, pocket);
  }
  return [...pockets.values()];
}

/**
 * Haftalık: teslimleri duyur, cepleri yeniden bul, YENİ cepleri duyur.
 * Savaş çözüldükten sonra çağrılır (turn.js).
 */
export function updatePockets(game) {
  const world = game.world;
  const me = game.turns?.playerNation ?? -1;
  flushSurrenders(game, me);
  const before = new Set((world.pockets ?? []).map((pocket) => pocket.key));
  world.pockets = findPockets(world, me);
  for (const pocket of world.pockets) {
    if (before.has(pocket.key)) continue;
    const tile = world.get(pocket.q, pocket.r);
    const count = pocket.units.length;
    const what = `${count} ${count === 1 ? 'division' : 'divisions'}`;
    if (pocket.nationId === me) {
      game.turns.addLog(`ENCIRCLED at ${provinceName(tile)}: ${what} (${formatPopulation(pocket.men)} men) have no way out. Break through or they will surrender.`,
        { kind: 'ENCIRCLED', tile, key: `pocket:${pocket.key}` });
    } else {
      const name = world.nations[pocket.nationId]?.name ?? 'The enemy';
      game.turns.addLog(`Pocket at ${provinceName(tile)}: ${name}'s ${what} (${formatPopulation(pocket.men)} men) are cut off. Beat them and they surrender.`,
        { kind: 'POCKET', tile, key: `pocket:${pocket.key}` });
    }
  }
}

/** Haftanın teslimlerini kare ve taraf başına tek satıra toplar. */
function flushSurrenders(game, me) {
  const world = game.world;
  const list = world.surrenders ?? [];
  world.surrenders = [];
  if (!list.length) return;
  const groups = new Map();
  for (const row of list) {
    const key = `${row.nationId}:${row.captor}:${row.q}:${row.r}`;
    const group = groups.get(key) ?? { ...row, count: 0, men: 0 };
    group.count++;
    group.men += row.men;
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const tile = world.get(group.q, group.r);
    const ours = group.nationId === me;
    const captured = group.captor === me;
    const what = `${group.count} ${group.count === 1 ? 'division' : 'divisions'} (${formatPopulation(group.men)} men)`;
    const loser = world.nations[group.nationId]?.name ?? 'A nation';
    const winner = world.nations[group.captor]?.name ?? 'the enemy';
    game.turns.addLog(
      ours ? `Our ${what} surrendered at ${provinceName(tile)} — the pocket closed.`
        : `${loser}'s ${what} surrendered at ${provinceName(tile)} to ${winner}.`,
      {
        kind: captured ? 'POCKET' : 'BATTLE',
        silent: !ours && !captured,
        tile,
        key: `surrender:${group.nationId}:${group.q}:${group.r}`,
      },
    );
  }
}
