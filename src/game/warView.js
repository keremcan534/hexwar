// SAVAŞ GÖRÜNÜMÜ — HOI4'ün sağ üst savaş kutuları (DOM yok).
//
// Oyunda "savaş nesnesi" yoktur: her savaş iki ulus arasındaki ilişki
// kaydıdır (diplomacy.js `world.relations`). Bu modül oyuncunun kayıtlarını
// okuyup panelin sorduğu soruları cevaplar: kime karşı, kim önde (savaş
// puanı), kaç adam kaybettik/kaybettirdik, kim kimin toprağını tutuyor, kaç
// haftadır, hedef ne, masa açık mı. Dünya satırı: kaç savaş sürüyor, hangi
// dünya olayı (barut fıçısı, büyük savaş) etkin.
//
// Kayıp birimi: ilişki kaydı kayıpları GÜÇ PUANI olarak tutar (alay başına
// 1000 puan). Piyade/süvari/topçu alayı 3000 kişidir ve nüfus ölçeği ×10 →
// puan başına 30 kişi (battleView.menPerStrength ile aynı oran; zırh ve
// uçakta daha azdır, bu yüzden toplam "yaklaşık"tır ve öyle yazılır).

import { MIN_WAR_TURNS, atWar, crisisLeft, inCrisis, relation, warLossesOf } from './diplomacy.js';
import { occupiedProvincesOf, warGoalOf, warScore } from './peace.js';
import { activeWorldEvents, WORLD_EVENTS } from './worldEvents.js';
import { isAllied } from './alliances.js';
import { battlesFor } from './battles.js';
import { POPULATION_SCALE } from './populationScale.js';

/** Güç puanı → insan (piyade oranı; bkz. dosya başı). */
export const MEN_PER_STRENGTH = 3 * POPULATION_SCALE;

/** Dünyadaki süren savaş çiftleri (ilişki matrisinin üst üçgeni). */
function worldWarCount(world) {
  let count = 0;
  const alive = world.nations.filter((n) => n.alive);
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      if (atWar(world, alive[i].id, alive[j].id)) count++;
    }
  }
  return count;
}

/**
 * DÜNYANIN SAVAŞLARI (oyuncunun olmadığı), ÇATIŞMA olarak. Kerem 2026-10-14:
 * "dünyadaki savaşları hala göremiyorum" — panel yalnız sayıyı yazıyordu.
 *
 * Savaş ikili kayıttır; ittifak çağrısı A+B'ye karşı C'yi üç kayda böler.
 * Panelde üç satır yerine tek çatışma okunur: savaş çizgesinin bağlı
 * bileşenleri, iki taraf 2-boyama ile (ilk kaydın saldırganı A tarafı).
 * Puan bileşenin İLK (en eski) kaydından, saldırgan gözüyle; kayıp ve
 * işgal taraf toplamı. Sıra sabit: başlangıç turu, sonra en küçük kimlik.
 */
export function worldConflicts(world, playerId = -1, turn = world.turn ?? 0) {
  const alive = world.nations.filter((n) => n.alive && n.id !== playerId);
  const edges = new Map();
  for (let i = 0; i < alive.length; i++) {
    for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i].id;
      const b = alive[j].id;
      if (!atWar(world, a, b)) continue;
      (edges.get(a) ?? edges.set(a, []).get(a)).push(b);
      (edges.get(b) ?? edges.set(b, []).get(b)).push(a);
    }
  }
  const seen = new Set();
  const out = [];
  for (const start of [...edges.keys()].sort((x, y) => x - y)) {
    if (seen.has(start)) continue;
    // Bileşen + taraf (BFS 2-boyama; tek sayılı döngüde ilk renk kalır).
    const side = new Map([[start, 0]]);
    const queue = [start];
    seen.add(start);
    const pairs = [];
    while (queue.length) {
      const n = queue.shift();
      for (const m of edges.get(n)) {
        if (n < m) pairs.push([n, m]);
        if (!side.has(m)) {
          side.set(m, 1 - side.get(n));
          seen.add(m);
          queue.push(m);
        }
      }
    }
    // En eski kayıt çatışmanın adını ve yönünü verir.
    let first = null;
    for (const [n, m] of pairs) {
      const since = relation(world, n, m)?.since ?? turn;
      if (!first || since < first.since || (since === first.since && n < first.n)) first = { n, m, since };
    }
    const rec = relation(world, first.n, first.m);
    const aggressor = rec?.aggressor === first.m ? first.m : first.n;
    const aSide = side.get(aggressor);
    const members = [[], []];
    for (const [id, s] of side) members[s === aSide ? 0 : 1].push(id);
    members[0].sort((x, y) => x - y);
    members[1].sort((x, y) => x - y);
    const lead = [aggressor, aggressor === first.n ? first.m : first.n];
    let lossA = 0;
    let lossB = 0;
    let holdA = 0;
    let holdB = 0;
    // İkili savaşlar (ayrıntı penceresi): her satır A tarafından okunur.
    const fronts = [];
    for (const [n, m] of pairs) {
      const losses = warLossesOf(world, n, m);
      const nA = side.get(n) === aSide;
      lossA += (nA ? losses[n] : losses[m]) ?? 0;
      lossB += (nA ? losses[m] : losses[n]) ?? 0;
      const nHold = occupiedProvincesOf(world, n, m).length;
      const mHold = occupiedProvincesOf(world, m, n).length;
      holdA += nA ? nHold : mHold;
      holdB += nA ? mHold : nHold;
      const [x, y] = nA ? [n, m] : [m, n];
      fronts.push({
        a: x, b: y,
        score: warScore(world, x, y),
        weeks: Math.max(0, turn - (relation(world, x, y)?.since ?? turn)),
        lossesA: Math.round((losses[x] ?? 0) * MEN_PER_STRENGTH),
        lossesB: Math.round((losses[y] ?? 0) * MEN_PER_STRENGTH),
        holdA: nA ? nHold : mHold,
        holdB: nA ? mHold : nHold,
      });
    }
    let battles = 0;
    for (const battle of world.battleSystem?.battles ?? []) {
      if (side.has(battle.attackerNation) && side.has(battle.defenderNation)) battles++;
    }
    const nameOf = (id) => world.nations[id]?.name ?? '?';
    // Kamera hedefi: önce A'nın tuttuğu bir state (cephe orada), yoksa
    // savunanın başkenti.
    const held = occupiedProvincesOf(world, lead[0], lead[1])[0]
      ?? occupiedProvincesOf(world, lead[1], lead[0])[0] ?? null;
    out.push({
      key: `${lead[0]}-${lead[1]}`,
      attackers: members[0].map((id) => ({ id, name: nameOf(id) })),
      defenders: members[1].map((id) => ({ id, name: nameOf(id) })),
      lead,
      since: first.since,
      weeks: Math.max(0, turn - first.since),
      score: warScore(world, lead[0], lead[1]),
      lossesA: Math.round(lossA * MEN_PER_STRENGTH),
      lossesB: Math.round(lossB * MEN_PER_STRENGTH),
      holdA,
      holdB,
      reason: rec?.reason ?? null,
      focusProvince: held?.province?.id ?? null,
      fronts,
      battles,
    });
  }
  out.sort((x, y) => x.since - y.since || x.lead[0] - y.lead[0]);
  return out;
}

/**
 * Oyuncunun savaş tablosu. `wars` en tehlikeliden (en düşük puan) başlamaz:
 * SIRA SABİTTİR (savaşın başladığı tur, sonra ulus kimliği) — panel her
 * hafta yeniden yazılır ve kutular yer değiştirirse imlecin altından kaçar.
 */
export function warOverview(world, playerId, turn = world.turn ?? 0) {
  const me = world.nations?.[playerId];
  if (!me?.alive) return { world: { wars: worldWarCount(world), events: [], conflicts: worldConflicts(world, -1, turn) }, wars: [], crises: [] };
  const battles = battlesFor(world, playerId);
  const wars = [];
  const crises = [];
  for (const other of world.nations) {
    if (!other.alive || other.id === playerId) continue;
    if (inCrisis(world, playerId, other.id)) {
      crises.push({ enemyId: other.id, name: other.name, color: other.color, weeksLeft: crisisLeft(world, playerId, other.id, turn) });
      continue;
    }
    if (!atWar(world, playerId, other.id)) continue;
    const rec = relation(world, playerId, other.id);
    const losses = warLossesOf(world, playerId, other.id);
    const weeks = Math.max(0, turn - (rec.since ?? turn));
    const goal = warGoalOf(world, playerId, other.id);
    const theirGoal = warGoalOf(world, other.id, playerId);
    const fighting = battles.filter((b) => b.attackerNation === other.id || b.defenderNation === other.id).length;
    // Ortak düşman: bu düşmanla savaşan müttefiklerimiz (ittifak çağrısı).
    const allies = world.nations
      .filter((n) => n.alive && n.id !== playerId && isAllied(me, n.id) && atWar(world, n.id, other.id))
      .map((n) => n.name);
    wars.push({
      enemyId: other.id,
      name: other.name,
      color: other.color,
      since: rec.since ?? turn,
      weeks,
      score: warScore(world, playerId, other.id),
      lossesOurs: Math.round((losses[playerId] ?? 0) * MEN_PER_STRENGTH),
      lossesTheirs: Math.round((losses[other.id] ?? 0) * MEN_PER_STRENGTH),
      holdTheirs: occupiedProvincesOf(world, playerId, other.id).length,
      holdOurs: occupiedProvincesOf(world, other.id, playerId).length,
      goal: goal?.name ?? null,
      theirGoal: theirGoal?.name ?? null,
      aggressor: rec.aggressor === playerId ? 'us' : rec.aggressor === other.id ? 'them' : null,
      reason: rec.reason ?? null,
      battles: fighting,
      allies,
      talksIn: Math.max(0, MIN_WAR_TURNS - weeks),
    });
  }
  wars.sort((a, b) => a.since - b.since || a.enemyId - b.enemyId);
  crises.sort((a, b) => a.weeksLeft - b.weeksLeft || a.enemyId - b.enemyId);
  const events = activeWorldEvents(world, turn)
    .filter((id) => WORLD_EVENTS[id]?.war || WORLD_EVENTS[id]?.spark)
    .map((id) => WORLD_EVENTS[id].title);
  return { world: { wars: worldWarCount(world), events, conflicts: worldConflicts(world, playerId, turn) }, wars, crises };
}
