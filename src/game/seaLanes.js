// DENİZ YOLLARI ve DENİZALTI AKINI (TASARIM.md §11).
//
// Kara komşusu olmayan iki ülkenin ticareti, kıyılarının değdiği denizler
// arasında bölge grafındaki en ucuz yoldan akar. Yol düşmanın tuttuğu bir
// denizden (payı TRANSPORT_HOLD üstü) geçiyorsa yük o payda kesilir — boğazı
// tutan arkasındaki ticareti de tutar. Gemiler dolaşabiliyorsa dolaşır:
// kesilen denizin yol maliyeti yüksektir (LANE_DETOUR). Uç denizler ablukaya
// aittir (navy.computeBlockade), burada iki kez sayılmaz.
//
// DENİZALTI hâkimiyet aramaz ve muharebeye girmez. Savaşta düşman yollarının
// en çok kesiştiği, eskortu en zayıf denizlere kendiliğinden gider (oyuncuya
// iş yok: Auto) ve oradan geçen düşman yükünü batırır (RAID_CAP'e dek); o
// denizdeki düşman savaş gemileri onu avlar (ASW). Karşı hamle aynı dildir:
// yükünün geçtiği denize öncelik veren oyuncu denizaltıyı avlar.
//
// Haftalık sıra (turn.js 'navy' fazı, runNavy'den SONRA): denizaltı dağıtımı
// → akın tablosu → eskort kayıpları → yol katsayıları (ekonomi bu hafta
// okur). Hedef seçimi kayıttaki dünyadan türetilir (yapısal yollar), geçen
// haftanın akışından değil: akış kayda girmez, kayıttan dönen oyun ayrışırdı.
// Çizilecek yollar trade.clearTrade'in yazdığı akıştan kurulur (yalnız ekran).

import { makeRng } from '../core/rng.js';
import { atWar } from './diplomacy.js';
import { mod } from './modifiers.js';
import { seaZonesOf, zoneDistances, zonesOfProvince } from '../world/seaZones.js';
import {
  RETURN_BELOW, TRANSPORT_HOLD, docked, sendHome, shipTravel, sinkShip, subsOf, zoneBalance,
} from './navy.js';

/** Kesilen denizin yol maliyeti çarpanı: gemi mümkünse onu dolaşır. */
export const LANE_DETOUR = 10;
/** Bir denizdeki akının batırabileceği en büyük yük payı. */
export const RAID_CAP = 0.6;
/** Eskort: bir birim yüzey gücü iki birim denizaltıyı karşılar. */
export const ESCORT_WEIGHT = 2;
/** Haftalık eskort hasarı: düşman yüzey gücü × bu × zar (denizaltı sağlığı). */
export const ASW_DAMAGE = 0.06;
const ASW_SHOT = 0.25;
/** Denizaltı sürüsü: N hazır denizaltı en çok N/2 denizde avlanır. */
export const WOLFPACK = 2;

// ------------------------------------------------------------ TABLOLAR ---

/** Ulus → iç sular (bölge → kıyı kenarı). Haftada bir, tek province geçişi. */
function homeTable(world) {
  const table = world.nations.map(() => new Map());
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.coastal) continue;
    const home = table[province.owner];
    if (!home) continue;
    for (const { zoneId, edges } of zonesOfProvince(world, province.id)) {
      home.set(zoneId, (home.get(zoneId) ?? 0) + edges);
    }
  }
  return table;
}

function subStrength(nation, ship) {
  return ship.hp * Math.max(0.3, 1 + mod(nation, 'naval'));
}

/** Bölge → ulus → {strength, ships}: varmış (at ≥ 0) denizaltılar. */
function buildSubPresence(world) {
  const subs = new Map();
  for (const nation of world.nations ?? []) {
    if (!nation.alive) continue;
    for (const ship of subsOf(nation)) {
      if (ship.at < 0) continue;
      if (!subs.has(ship.at)) subs.set(ship.at, new Map());
      const zone = subs.get(ship.at);
      if (!zone.has(nation.id)) zone.set(nation.id, { strength: 0, ships: [] });
      const entry = zone.get(nation.id);
      entry.strength += subStrength(nation, ship);
      entry.ships.push(ship);
    }
  }
  return subs;
}

/**
 * X'in yükünün bu denizde batırılan payı: X'le savaşan denizaltılar ÷
 * (denizaltılar + 2 × X'in ve müttefiklerinin yüzey gücü), RAID_CAP tavanlı.
 */
function raidShare(world, state, zoneId, nationId) {
  const zone = state.subs?.get(zoneId);
  if (!zone) return 0;
  let raiders = 0;
  for (const [otherId, entry] of zone) if (atWar(world, otherId, nationId)) raiders += entry.strength;
  if (!(raiders > 0)) return 0;
  const escort = zoneBalance(world, state.presence, nationId, zoneId).friendly;
  return RAID_CAP * raiders / (raiders + ESCORT_WEIGHT * escort);
}

/** X'in yükü için kapalı deniz payı (düşman payı TRANSPORT_HOLD üstüyse o pay). */
function closedShare(world, state, zoneId, nationId) {
  if (!state.presence?.has(zoneId)) return 0;
  const { friendly, hostile } = zoneBalance(world, state.presence, nationId, zoneId);
  const share = hostile > 0 ? hostile / (hostile + friendly) : 0;
  return share > TRANSPORT_HOLD ? share : 0;
}

/**
 * Ulus başına kesinti tablosu {closed, raid} (bölge dizileri). Savaşta
 * olmayan ulusun yükü kesilmez: null. Hafta içinde bir kez kurulur.
 */
function cutsOf(world, state, nationId) {
  state.cuts ??= new Map();
  if (state.cuts.has(nationId)) return state.cuts.get(nationId);
  const nation = world.nations[nationId];
  const enemies = nation?.alive && world.nations.some((other) => other.alive && other.id !== nationId
    && atWar(world, nationId, other.id));
  let out = null;
  if (enemies) {
    const count = seaZonesOf(world).zones.length;
    const closed = new Float64Array(count);
    const raid = new Float64Array(count);
    let any = false;
    for (let z = 0; z < count; z++) {
      closed[z] = closedShare(world, state, z, nationId);
      raid[z] = raidShare(world, state, z, nationId);
      if (closed[z] > 0 || raid[z] > 0) any = true;
    }
    out = any ? { closed, raid } : null;
  }
  state.cuts.set(nationId, out);
  return out;
}

// --------------------------------------------------------------- YOLLAR ---

/**
 * İki iç su kümesi arasında en ucuz bölge yolu (çok kaynaklı Dijkstra; 31
 * bölgede O(V²) yeter). `cost(z)` bölgeye girmenin bedeli. Yol yoksa null.
 */
function cheapestPath(world, from, to, cost) {
  const zones = seaZonesOf(world).zones;
  const n = zones.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  for (const z of from) dist[z] = cost(z);
  for (;;) {
    let best = -1;
    for (let z = 0; z < n; z++) if (!done[z] && dist[z] < Infinity && (best < 0 || dist[z] < dist[best])) best = z;
    if (best < 0) return null;
    if (to.has(best)) {
      const path = [];
      for (let z = best; z >= 0; z = prev[z]) path.push(z);
      return path.reverse();
    }
    done[best] = 1;
    for (const next of zones[best].neighbors) {
      if (done[next]) continue;
      const d = dist[best] + cost(next);
      if (d < dist[next]) { dist[next] = d; prev[next] = best; }
    }
  }
}

/**
 * Kesintisiz en kısa yol, hafta içinde çift başına bir kez (av ağırlığı ve
 * çizim aynı yolu yüzlerce kez sorar).
 */
function plainPath(world, state, homes, a, b) {
  state.paths ??= new Map();
  const key = pairKey(world, a, b);
  if (state.paths.has(key)) return state.paths.get(key);
  const path = cheapestPath(world, [...homes[a].keys()], new Set(homes[b].keys()), () => 1);
  state.paths.set(key, path);
  return path;
}

/** Çiftin bu denizdeki kesinti payı; uç denizde yalnız akın sayılır (abluka orada). */
function pairCut(cutA, cutB, zoneId, end) {
  let keep = 1;
  for (const cut of [cutA, cutB]) {
    if (!cut) continue;
    if (!end) keep *= 1 - cut.closed[zoneId];
    keep *= 1 - cut.raid[zoneId];
  }
  return 1 - keep;
}

/** Çiftin yolu ve yük katsayısı (kesintiler varsa onları dolaşarak). */
function laneOf(world, state, homes, a, b) {
  const homeA = homes[a];
  const homeB = homes[b];
  if (!homeA?.size || !homeB?.size) return null;
  const cutA = cutsOf(world, state, a);
  const cutB = cutsOf(world, state, b);
  const cost = (z) => 1 + LANE_DETOUR * pairCut(cutA, cutB, z, false);
  const path = cutA || cutB
    ? cheapestPath(world, [...homeA.keys()], new Set(homeB.keys()), cost)
    : plainPath(world, state, homes, a, b);
  if (!path) return null;
  let factor = 1;
  if (cutA || cutB) {
    path.forEach((z, index) => {
      factor *= 1 - pairCut(cutA, cutB, z, index === 0 || index === path.length - 1);
    });
  }
  return { path, factor };
}

/** Deniz yolu olan çift mi: ikisi de kıyılı, kara komşusu değil, birbiriyle barışta. */
function seaPair(world, homes, a, b) {
  return homes[a]?.size && homes[b]?.size && !(world.contacts?.[a]?.[b] > 0)
    && !atWar(world, a, b);
}

const pairKey = (world, a, b) => (a < b ? a * world.nations.length + b : b * world.nations.length + a);

/**
 * Yol katsayıları: yalnız en az bir tarafının yükü kesilen çiftler (savaştaki
 * uluslar). trade.routeFactor okur; kayıtta yoktur, her hafta kurulur.
 */
function buildLaneFactors(world, state, homes) {
  const factors = new Map();
  const alive = world.nations.filter((n) => n.alive && homes[n.id]?.size);
  for (const nation of alive) {
    if (!cutsOf(world, state, nation.id)) continue;
    for (const other of alive) {
      if (other.id === nation.id) continue;
      // Her iki tarafı da kesilen çift bir kez (küçük kimlikten) kurulur.
      if (cutsOf(world, state, other.id) && other.id < nation.id) continue;
      if (!seaPair(world, homes, nation.id, other.id)) continue;
      const lane = laneOf(world, state, homes, nation.id, other.id);
      if (lane && lane.factor < 1) factors.set(pairKey(world, nation.id, other.id), lane.factor);
    }
  }
  return factors;
}

// ------------------------------------------------------------ DENİZALTI ---

/**
 * Denizaltının av ağırlığı: düşmanın YAPISAL yolları. Her düşman X için X'in
 * deniz ortağı olabilecek her ulusa giden yol; yolun geçtiği her deniz bir
 * puan, X'in iç suları ayrıca kıyısı kadar. Eskortu güçlü deniz bölünür.
 */
function huntWeights(world, state, homes, nation, enemies) {
  const weights = new Map();
  const add = (z, w) => weights.set(z, (weights.get(z) ?? 0) + w);
  const alive = world.nations.filter((n) => n.alive && homes[n.id]?.size);
  for (const enemy of enemies) {
    for (const [z, edges] of homes[enemy.id]) add(z, 1 + edges / 4);
    for (const partner of alive) {
      if (partner.id === enemy.id || partner.id === nation.id || !seaPair(world, homes, enemy.id, partner.id)) continue;
      for (const z of plainPath(world, state, homes, enemy.id, partner.id) ?? []) add(z, 1);
    }
  }
  const reach = new Set();
  for (const [z] of homes[nation.id]) zoneDistances(world, z).forEach((d, id) => { if (Number.isFinite(d)) reach.add(id); });
  for (const z of [...weights.keys()]) {
    if (!reach.has(z)) { weights.delete(z); continue; }
    const escort = state.presence?.has(z) ? zoneBalance(world, state.presence, nation.id, z).hostile : 0;
    weights.set(z, weights.get(z) / (1 + escort));
  }
  return weights;
}

/** Hazır denizaltıları sürülere böler ve yollar (barışta liman). */
function allocateSubs(world, state, homes, nation, turn) {
  const subs = subsOf(nation);
  if (!subs.length) return;
  for (const ship of subs) {
    if (!ship.repairing && ship.hp < RETURN_BELOW) ship.repairing = true;
    if (docked(ship, turn)) sendHome(world, nation, ship, turn);
  }
  const ready = subs.filter((ship) => !docked(ship, turn));
  const enemies = world.nations.filter((other) => other.alive && other.id !== nation.id
    && atWar(world, nation.id, other.id) && homes[other.id]?.size);
  if (!enemies.length) {
    for (const ship of ready) sendHome(world, nation, ship, turn);
    return;
  }
  const weights = [...huntWeights(world, state, homes, nation, enemies)]
    .filter(([, w]) => w > 0).sort((x, y) => y[1] - x[1] || x[0] - y[0])
    .slice(0, Math.max(1, Math.floor(ready.length / WOLFPACK)));
  const total = weights.reduce((sum, [, w]) => sum + w, 0);
  if (!(total > 0)) {
    for (const ship of ready) sendHome(world, nation, ship, turn);
    return;
  }
  // En büyük kalan: sürü başına hedef sayı.
  const targets = new Map();
  let given = 0;
  const rest = [];
  for (const [z, w] of weights) {
    const quota = ready.length * w / total;
    targets.set(z, Math.floor(quota));
    given += Math.floor(quota);
    rest.push({ z, left: quota - Math.floor(quota) });
  }
  rest.sort((x, y) => y.left - x.left || x.z - y.z);
  for (let i = 0; given < ready.length && i < rest.length; i++, given++) targets.set(rest[i].z, targets.get(rest[i].z) + 1);
  // Yerinde olan kalır; gerisi en yakın açığa.
  const count = new Map();
  const free = [];
  for (const ship of [...ready].sort((x, y) => y.hp - x.hp || x.id - y.id)) {
    if (ship.zone >= 0 && (count.get(ship.zone) ?? 0) < (targets.get(ship.zone) ?? 0)) {
      count.set(ship.zone, (count.get(ship.zone) ?? 0) + 1);
    } else free.push(ship);
  }
  for (const [z, want] of [...targets].sort((x, y) => y[1] - x[1] || x[0] - y[0])) {
    let missing = want - (count.get(z) ?? 0);
    while (missing > 0 && free.length) {
      let best = 0;
      let bestWeeks = Infinity;
      free.forEach((ship, index) => {
        const weeks = shipTravel(world, nation, ship, z, homes[nation.id]);
        if (weeks < bestWeeks || (weeks === bestWeeks && ship.id < free[best].id)) { best = index; bestWeeks = weeks; }
      });
      const [ship] = free.splice(best, 1);
      if (!Number.isFinite(bestWeeks)) continue;
      if (ship.zone !== z) {
        ship.zone = z;
        ship.at = -1;
        ship.eta = turn + Math.max(1, bestWeeks);
      }
      missing--;
    }
  }
  for (const ship of free) sendHome(world, nation, ship, turn);
}

/**
 * Eskort kayıpları: denizaltının olduğu denizdeki düşman yüzey gücü onu
 * avlar. Batan denizaltı mürettebatıyla gider; 0.4 altı limana döner.
 * @returns {Array<{nation, zone, name, by}>} batan denizaltılar
 */
function huntSubs(world, state, rng) {
  const sunk = [];
  for (const zoneId of [...(state.subs?.keys() ?? [])].sort((a, b) => a - b)) {
    for (const [nationId, entry] of [...state.subs.get(zoneId)].sort((a, b) => a[0] - b[0])) {
      const hostile = state.presence?.has(zoneId) ? zoneBalance(world, state.presence, nationId, zoneId).hostile : 0;
      if (!(hostile > 0)) continue;
      let left = ASW_DAMAGE * hostile * (0.5 + rng());
      const nation = world.nations[nationId];
      while (left > 1e-9) {
        const alive = entry.ships.filter((ship) => ship.hp > 0.02);
        if (!alive.length) break;
        const target = alive[Math.floor(rng() * alive.length)];
        const shot = Math.min(ASW_SHOT, left);
        target.hp = Math.max(0, target.hp - shot);
        left -= shot;
      }
      for (const ship of entry.ships) {
        if (ship.hp <= 0.02) {
          const hunters = [...(state.presence.get(zoneId) ?? [])]
            .filter(([otherId]) => atWar(world, otherId, nationId)).map(([otherId]) => otherId);
          sunk.push({ nation: nationId, zone: zoneId, name: ship.name, by: hunters });
          sinkShip(world, nation, ship);
        } else if (ship.hp < RETURN_BELOW) {
          ship.repairing = true;
          sendHome(world, nation, ship, world.turn ?? 0);
        }
      }
    }
  }
  return sunk;
}

// ------------------------------------------------------------- HAFTALIK ---

/** Denizaltı ve yol fazı (turn.js, runNavy'den sonra). */
export function runSeaLanes(game) {
  const world = game.world;
  const state = world.navyState;
  if (!state) return;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const rng = makeRng(`${world.seed}-raid-${turn}`);
  const homes = homeTable(world);
  // Yol önbelleği haftalıktır: kıyılar fetihle değişir.
  state.paths = new Map();
  for (const nation of world.nations) {
    if (nation.alive && nation.navy) allocateSubs(world, state, homes, nation, turn);
  }
  state.subs = buildSubPresence(world);
  const sunk = huntSubs(world, state, rng);
  if (sunk.length) state.subs = buildSubPresence(world);
  refreshCuts(world, state, homes);
  announceSubs(game, sunk);
}

/** Akın, kesinti ve yol katsayıları (yüklemeden sonra da: ekran boş okumasın). */
function refreshCuts(world, state, homes) {
  state.cuts = new Map();
  state.raid = new Map();
  for (const zoneId of state.subs?.keys() ?? []) {
    const row = new Map();
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const share = raidShare(world, state, zoneId, nation.id);
      if (share > 0) row.set(nation.id, share);
    }
    if (row.size) state.raid.set(zoneId, row);
  }
  state.laneFactor = buildLaneFactors(world, state, homes);
}

/** Yüklemeden sonra türetilmiş denizaltı/yol durumunu kurar (hareketsiz). */
export function refreshSeaLanes(world) {
  const state = world.navyState;
  if (!state) return null;
  state.paths = new Map();
  state.subs = buildSubPresence(world);
  refreshCuts(world, state, homeTable(world));
  return state;
}

function announceSubs(game, sunk) {
  const player = game.turns?.playerNation ?? -1;
  if (player < 0 || !sunk.length) return;
  const zones = seaZonesOf(game.world).zones;
  const ours = sunk.filter((row) => row.nation === player);
  const theirs = sunk.filter((row) => row.by.includes(player));
  if (ours.length) {
    game.turns.addLog(`Escorts sank our submarine${ours.length === 1 ? '' : 's'} ${ours.map((row) => `${row.name} (${zones[row.zone]?.name ?? 'at sea'})`).join(', ')}.`,
      { kind: 'NAVAL', key: 'subs-lost' });
  }
  if (theirs.length) {
    game.turns.addLog(`Our warships sank ${theirs.length} enemy submarine${theirs.length === 1 ? '' : 's'} in ${[...new Set(theirs.map((row) => zones[row.zone]?.name ?? 'our waters'))].join(', ')}.`,
      { kind: 'NAVAL', key: 'subs-hunted' });
  }
}

// ---------------------------------------------------------------- DÖKÜM ---

/**
 * Çizilecek ve panelde sayılacak yollar: trade.clearTrade'in son haftalık
 * akışından (`navyState.flows`: çift → {value, lost}). Yol ve katsayı bu
 * haftanın tablosundan. Ekran içindir; simülasyon okumaz.
 */
export function seaLaneView(world) {
  const state = world.navyState;
  if (!state?.flows?.size) return [];
  if (state.laneView?.turn === world.turn && state.laneView.flows === state.flows) return state.laneView.lanes;
  const homes = homeTable(world);
  const n = world.nations.length;
  const lanes = [];
  for (const [key, flow] of state.flows) {
    const a = Math.floor(key / n);
    const b = key % n;
    if (!world.nations[a]?.alive || !world.nations[b]?.alive) continue;
    const lane = laneOf(world, state, homes, a, b);
    if (!lane) continue;
    lanes.push({ a, b, value: flow.value, lost: flow.lost, path: lane.path, factor: lane.factor });
  }
  state.laneView = { turn: world.turn, flows: state.flows, lanes };
  return lanes;
}

/** Ulusun deniz ticaretinin yollarda (kapalı deniz + akın) kaybettiği pay. */
export function seaTradeLoss(world, nationId) {
  let value = 0;
  let lost = 0;
  for (const lane of seaLaneView(world)) {
    if (lane.a !== nationId && lane.b !== nationId) continue;
    value += lane.value;
    lost += lane.lost;
  }
  return value + lost > 0 ? lost / (value + lost) : 0;
}
