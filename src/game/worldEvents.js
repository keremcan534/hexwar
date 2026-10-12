// DÜNYA OLAYLARI — çağın büyük anları (1900-1945).
//
// Harita uydurma bir dünya olduğu için olaylar ULUS seçmez: tarihin
// AKINTISINI değiştirirler. Barut fıçısı savaşı kimin açacağını söylemez;
// savaş desteğini ve milliyetçiliği yükseltir, YZ'nin savaş eşiğini indirir —
// ittifak zincirleri gerisini yapar. Buhran kimseyi seçmez; herkesin ihracatını
// ve vergisini keser, aşırı partileri besler.
//
// Her olay tohuma bağlı bir yılda (yıl ± jitter) başlar, `weeks` sürer ve
// başlarken her ulusa kendi kartını yollar (eventCards.js `card`). Süresince
// okunan dört kanal: geçici değiştirici (`effects`, başlarken yazılır),
// milliyetçilik çağı (culture.nationalismEra), parti hedefleri
// (politics.supportTargets) ve savaş gerilimi (ai.js savaş eşiği ve zarı).
//
// Saf veri + hesap: DOM yok, sistem import etmez (döngü riski yok).

import { makeRng } from '../core/rng.js';
import { turnOfYear } from './calendar.js';

export const WORLD_EVENTS = {
  powder_keg: {
    title: 'The Powder Keg',
    log: 'The powder keg: the great powers arm, and every frontier is a fuse.',
    year: 1913, jitter: 1, weeks: 260,
    effects: { warSupport: 0.08 },
    nationalism: 0.3,
    parties: { nationalist: 8 },
    // YZ'nin savaş kararı: güç oranı eşiği ×0.85, aylık ilan zarı ×2.
    war: { threshold: 0.85, declare: 2 },
    card: 'mobilisation',
  },
  // KIVILCIM: barut fıçısının içinde, en güçlü devletlerden gerilimli bir çift
  // savaşa girer; ittifak çağrıları dünyayı içine çeker (eventCards.js
  // sparkGreatWar). Fıçı tek başına yetmiyordu: ölçümde (2 tohum, 1912-17)
  // ilanlar yılda 4-9'da kaldı, büyük güçler 1.5× üstünlük bulamıyordu.
  great_war: {
    title: 'The Great War',
    log: 'The great powers go to war, and the alliances drag the world in after them.',
    year: 1914, jitter: 1, weeks: 208,
    effects: { warSupport: 0.05 },
    spark: true,
  },
  red_years: {
    title: 'The Red Years',
    log: 'The red years: strikes and soldiers\' councils spread from city to city.',
    year: 1917, jitter: 1, weeks: 208,
    parties: { socialist: 12 },
  },
  influenza: {
    title: 'The Great Influenza',
    log: 'A new influenza sweeps the world and kills the young.',
    year: 1918, jitter: 0, weeks: 52,
    effects: { growth: -0.5, stability: -0.03 },
    card: 'influenza',
  },
  depression: {
    title: 'The Great Depression',
    log: 'The exchanges crash: trade collapses and the unemployed queue for bread.',
    year: 1929, jitter: 1, weeks: 208,
    effects: { exportIncome: -0.3, tax: -0.1, stability: -0.04 },
    parties: { socialist: 6, nationalist: 8 },
    card: 'depression',
  },
};
export const WORLD_EVENT_IDS = Object.keys(WORLD_EVENTS);

/** Takvim: tohuma bağlı başlangıç haftaları (bir kez kurulur, kayda girer). */
export function worldEventSchedule(world) {
  if (world.worldEvents) return world.worldEvents;
  const rng = makeRng(`${world.seed}-world-events`);
  const schedule = {};
  for (const id of WORLD_EVENT_IDS) {
    const event = WORLD_EVENTS[id];
    // Yıl içinde rastgele hafta, ± jitter yıl: her dünyada aynı yıl olmasın.
    const shift = Math.round((rng() * 2 - 1) * event.jitter * 52 + rng() * 52);
    const start = Math.max(2, turnOfYear(event.year) + shift);
    schedule[id] = { start, until: start + event.weeks, fired: false };
  }
  world.worldEvents = schedule;
  return schedule;
}

/** Bu hafta süren olaylar. */
export function activeWorldEvents(world, turn) {
  const schedule = world?.worldEvents;
  if (!schedule) return [];
  return WORLD_EVENT_IDS.filter((id) => schedule[id] && schedule[id].start <= turn && turn < schedule[id].until);
}

export function worldEventActive(world, id, turn) {
  const entry = world?.worldEvents?.[id];
  return !!entry && entry.start <= turn && turn < entry.until;
}

/** Milliyetçilik çağına eklenen pay (0 = olay yok). */
export function worldNationalism(world, turn) {
  let total = 0;
  for (const id of activeWorldEvents(world, turn)) total += WORLD_EVENTS[id].nationalism ?? 0;
  return total;
}

/** Parti destek hedeflerine eklenen puanlar. */
export function worldPartyTargets(world, turn) {
  const out = {};
  for (const id of activeWorldEvents(world, turn)) {
    for (const [party, points] of Object.entries(WORLD_EVENTS[id].parties ?? {})) {
      out[party] = (out[party] ?? 0) + points;
    }
  }
  return out;
}

/** Savaş gerilimi: YZ'nin güç oranı eşiği ve ilan zarı çarpanları. */
export function worldWarTension(world, turn) {
  let threshold = 1;
  let declare = 1;
  for (const id of activeWorldEvents(world, turn)) {
    const war = WORLD_EVENTS[id].war;
    if (!war) continue;
    threshold *= war.threshold ?? 1;
    declare *= war.declare ?? 1;
  }
  return { threshold, declare };
}
