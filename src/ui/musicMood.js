// Oyunun hâlinden müziğin ruh hâlini okur. Saf okuma: dünyaya yazmaz, zar
// atmaz, DOM'a dokunmaz; audit:music aynı fonksiyonu Node'da sınar.

import { controllerOf } from '../game/control.js';
import { atWar, hostileNations, inCrisis } from '../game/diplomacy.js';
import { warScore } from '../game/peace.js';
import { activeWorldEvents, WORLD_EVENTS, WORLD_EVENT_IDS } from '../game/worldEvents.js';

// Eşikler arasındaki boşluk kasıtlı: skor sınırda gidip gelirken müzik
// savrulmasın. Giriş eşiği zor, çıkış eşiği daha da zor.
const WINNING_ENTER = 35;
const WINNING_EXIT = 20;
const LOSING_ENTER = -30;
const LOSING_EXIT = -15;

/** Savaşın gidişi: skor ortalaması, başkent işgali her skoru ezer. */
export function warMood(balance, capitalOccupied, previous = null) {
  if (capitalOccupied) return 'warLosing';
  if (previous === 'warLosing' && balance <= LOSING_EXIT) return 'warLosing';
  if (previous === 'warWinning' && balance >= WINNING_EXIT) return 'warWinning';
  if (balance <= LOSING_ENTER) return 'warLosing';
  if (balance >= WINNING_ENTER) return 'warWinning';
  return 'war';
}

function capitalTile(world, nation) {
  const capital = nation?.capital;
  return capital ? world.get?.(capital.q, capital.r) ?? null : null;
}

/** Dünya olayı başladı mı: takvim kaydı, kart sırasından bağımsız. */
export function firedWorldEvents(world) {
  const schedule = world?.worldEvents;
  if (!schedule) return [];
  return WORLD_EVENT_IDS.filter((id) => schedule[id]?.fired);
}

/**
 * @returns {{mood: string, balance: number, capitalOccupied: boolean,
 *   capitalsHeld: number, fired: string[]} | null}
 */
export function readMusicState(world, playerId, turn, previous = null) {
  const me = world?.nations?.[playerId];
  if (!me) return null;
  const foes = hostileNations(world, me.id);
  const enemies = foes.filter((other) => atWar(world, me.id, other.id));
  const own = capitalTile(world, me);
  const capitalOccupied = Boolean(own) && controllerOf(own) !== me.id;
  const capitalsHeld = enemies.filter((other) => {
    const tile = capitalTile(world, other);
    return Boolean(tile) && controllerOf(tile) === me.id;
  }).length;

  let balance = 0;
  let mood = 'peace';
  if (enemies.length) {
    balance = enemies.reduce((sum, other) => sum + warScore(world, me.id, other.id), 0) / enemies.length;
    mood = warMood(balance, capitalOccupied, previous);
  } else if (foes.some((other) => inCrisis(world, me.id, other.id))) {
    mood = 'tension';
  } else if (activeWorldEvents(world, turn).some((id) => WORLD_EVENTS[id].war || WORLD_EVENTS[id].spark)) {
    // Barut fıçısı ve dünya savaşları: oyuncu barışta olsa da dünya gergindir.
    mood = 'uneasy';
  }
  return { mood, balance, capitalOccupied, capitalsHeld, fired: firedWorldEvents(world) };
}
