// Cephe hatları ve muharebe planları (HOI4 modeli).
//
// Oyuncu haritada sağ tuşu basılı tutup bir hat çizer. Hatta atanan ordular
// kendi kendine hat boyunca dağılır; plan olgunlaştıkça bonus birikir ve
// "Execute" denince hat düşman toprağına doğru ilerler.
//
// Üç plan tipi var:
//   ADVANCE — cephe hattı, düşman toprağına doğru itilir
//   HOLD    — geri çekilme (fallback) hattı, kendi toprağımızda tutulur
//   ARROW   — taarruz oku: hattan seçilen hedefe doğru yönlü saldırı
//
// Muharebenin kendisi hâlâ battles.js'in province muharebesidir; cephe yalnız
// kimin nerede duracağını ve ne zaman ilerleyeceğini yönetir.

import { hexDistance } from '../core/hex.js';
import { atWar } from './diplomacy.js';
import { generalOfArmy, generalPlanningBonus, generalsOf } from './generals.js';
import { destinationOf, orderMove } from './movement.js';
import { isMoving } from './units.js';

export const PLAN = { ADVANCE: 'advance', HOLD: 'hold', ARROW: 'arrow' };

/** Saldırganlık kademesinin ilerleme sıklığına ve menziline etkisi. */
const AGGRESSION = {
  1: { label: 'Careful', cadence: 3, reach: 1 },
  2: { label: 'Balanced', cadence: 2, reach: 2 },
  3: { label: 'Aggressive', cadence: 1, reach: 3 },
};

export function aggressionInfo(level) {
  return AGGRESSION[Math.max(1, Math.min(3, level ?? 2))];
}

/** Plan bu hızda olgunlaşır; 1.0'da tam bonus verir. */
const PLANNING_RATE = 0.06;
/** Hattın taşıyabileceği en fazla province. Çok uzun hat yönetilemez olur. */
export const MAX_FRONT_TILES = 24;

export function initFronts(world) {
  world.frontSystem = { fronts: [], nextId: 1 };
}

export function ensureFronts(world) {
  if (!world.frontSystem) initFronts(world);
  const system = world.frontSystem;
  for (const front of system.fronts) {
    if (!Array.isArray(front.armies)) front.armies = [];
  }
  return system;
}

export function frontsOf(world, nationId) {
  return ensureFronts(world).fronts.filter((front) => front.nationId === nationId);
}

export function frontById(world, id) {
  return ensureFronts(world).fronts.find((front) => front.id === id) ?? null;
}

/** Bir ordunun bağlı olduğu cephe. */
export function frontOfArmy(world, army) {
  if (!army) return null;
  return ensureFronts(world).fronts.find((front) => front.armies.includes(army.id)) ?? null;
}

/** Bir generalin planları. */
export function frontsOfGeneral(world, general) {
  if (!general) return [];
  return ensureFronts(world).fronts.filter((front) => front.generalId === general.id);
}

export function frontTiles(world, front) {
  return front.tiles.map((point) => world.get(point.q, point.r)).filter(Boolean);
}

/**
 * Hattı çizilen karelerden kurar. Aynı kare iki kez sayılmaz, sıra korunur
 * (hat boyunca dağıtım sırayı kullanır) ve uzunluk sınırlanır.
 */
export function createFront(game, nation, tiles, plan = PLAN.ADVANCE, generalId = null) {
  const system = ensureFronts(game.world);
  const seen = new Set();
  const points = [];
  for (const tile of tiles) {
    if (!tile?.terrain?.passable) continue;
    const key = `${tile.q}:${tile.r}`;
    if (seen.has(key)) continue;
    seen.add(key);
    points.push({ q: tile.q, r: tile.r });
    if (points.length >= MAX_FRONT_TILES) break;
  }
  if (points.length < 2) return null;

  const front = {
    id: system.nextId++,
    nationId: nation.id,
    // Plan bir generalindir: onun tümenleri hatta dağılır, saldırganlığı
    // ilerleme hızını belirler (HOI4'te plan komutana bağlıdır).
    generalId,
    tiles: points,
    armies: [],
    plan,
    active: false,
    planning: 0,
    created: game.turns.turn,
  };
  system.fronts.push(front);
  game.emit('fronts', front);
  return front;
}

export function deleteFront(game, front) {
  const system = ensureFronts(game.world);
  system.fronts = system.fronts.filter((candidate) => candidate.id !== front.id);
  game.emit('fronts', null);
  game.requestRender();
}

/** Orduyu cepheye bağlar; bir ordu aynı anda tek cephede olabilir. */
export function assignArmy(world, front, army) {
  if (!front || !army || army.nationId !== front.nationId) return false;
  for (const other of ensureFronts(world).fronts) {
    other.armies = other.armies.filter((id) => id !== army.id);
  }
  front.armies.push(army.id);
  return true;
}

export function removeArmy(world, army) {
  for (const front of ensureFronts(world).fronts) {
    front.armies = front.armies.filter((id) => id !== army.id);
  }
}

export function setPlan(game, front, plan) {
  if (!front || !PLAN[plan.toUpperCase?.()] && !Object.values(PLAN).includes(plan)) return false;
  front.plan = plan;
  // Plan değişince olgunluk sıfırlanır: yeni plan yeniden hazırlanmalı.
  front.planning = 0;
  front.active = false;
  game.emit('fronts', front);
  return true;
}

export function toggleExecution(game, front) {
  front.active = !front.active;
  game.emit('fronts', front);
  game.requestRender();
  return front.active;
}

function armiesOf(world, front) {
  return front.armies
    .map((id) => world.units.find((unit) => unit.id === id))
    .filter((army) => army && army.hp > 0);
}

/** Hattın önündeki düşman kareleri: ilerleme buraya doğru olur. */
function advanceTargets(world, front) {
  const targets = [];
  const seen = new Set();
  for (const tile of frontTiles(world, front)) {
    for (const near of world.neighbors(tile)) {
      if (!near.terrain.passable || seen.has(near)) continue;
      const hostile = near.owner >= 0
        && near.owner !== front.nationId
        && atWar(world, near.owner, front.nationId);
      if (!hostile && near.owner >= 0) continue;
      if (near.owner === front.nationId) continue;
      seen.add(near);
      targets.push(near);
    }
  }
  return targets;
}

/**
 * Orduları hat boyunca dağıtır. Her ordu kendisine en yakın *boş* hat karesine
 * yürür; böylece hat kendiliğinden doldurulur ve oyuncu tek tek yürütmez.
 */
function distribute(game, front) {
  const world = game.world;
  const armies = armiesOf(world, front);
  if (!armies.length) return;
  const slots = frontTiles(world, front);
  if (!slots.length) return;

  const taken = new Set();
  // Yakınlık sırasına göre eşle: en yakın ordu en yakın slotu kapsın.
  const pairs = [];
  for (const army of armies) {
    for (const slot of slots) {
      pairs.push({
        army,
        slot,
        distance: hexDistance(army.tile.q, army.tile.r, slot.q, slot.r),
      });
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  const assigned = new Set();
  for (const pair of pairs) {
    if (assigned.has(pair.army.id) || taken.has(pair.slot)) continue;
    assigned.add(pair.army.id);
    taken.add(pair.slot);
    if (pair.army.battleId) continue;
    if (pair.army.tile === pair.slot) continue;
    // Zaten oraya yürüyorsa yeniden yol arama.
    if (isMoving(pair.army) && destinationOf(pair.army) === pair.slot) continue;
    orderMove(game, pair.army, pair.slot);
  }
}

/**
 * Taarruz: hat, önündeki düşman karelerine kayar ve ordular yeni hatta yürür.
 * Hattın uzunluğu korunur; her kare kendi önündeki en yakın hedefe taşınır.
 */
function advanceLine(game, front, reach = 2) {
  const world = game.world;
  const targets = advanceTargets(world, front);
  if (!targets.length) {
    front.active = false;
    return false;
  }
  const used = new Set();
  const next = [];
  for (const tile of frontTiles(world, front)) {
    let best = null;
    let bestDistance = Infinity;
    for (const target of targets) {
      if (used.has(target)) continue;
      const distance = hexDistance(tile.q, tile.r, target.q, target.r);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = target;
      }
    }
    // Önünde hedef kalmayan kare yerinde durur: hat kopmaz. Saldırgan komutan
    // daha uzaktaki hedefi de kabul eder, temkinli olan yalnız bitişiği.
    const chosen = best && bestDistance <= reach ? best : tile;
    if (best && bestDistance <= reach) used.add(best);
    next.push({ q: chosen.q, r: chosen.r });
  }
  front.tiles = next;
  return true;
}

/**
 * Taarruz oku: hattın tamamını itmek yerine, oku çizilen hedefe doğru en yakın
 * hat karesini ilerletir. Dar ve derin bir hamledir — HOI4'teki offensive line.
 */
function advanceArrow(game, front, reach = 2) {
  const world = game.world;
  const target = front.target ? world.get(front.target.q, front.target.r) : null;
  if (!target) return advanceLine(game, front, reach);

  const tiles = frontTiles(world, front);
  let leadIndex = 0;
  let bestDistance = Infinity;
  tiles.forEach((tile, index) => {
    const distance = hexDistance(tile.q, tile.r, target.q, target.r);
    if (distance < bestDistance) {
      bestDistance = distance;
      leadIndex = index;
    }
  });
  if (bestDistance === 0) {
    front.active = false;
    return false;
  }

  // Uç kare hedefe bir adım yaklaşır; komşuları onu izler ki hat kopmasın.
  const lead = tiles[leadIndex];
  const step = world.neighbors(lead)
    .filter((near) => near.terrain.passable)
    .sort((a, b) => hexDistance(a.q, a.r, target.q, target.r)
      - hexDistance(b.q, b.r, target.q, target.r))[0];
  if (!step) return false;

  const next = tiles.map((tile, index) => {
    if (index === leadIndex) return { q: step.q, r: step.r };
    if (Math.abs(index - leadIndex) <= reach - 1) {
      const follow = world.neighbors(tile)
        .filter((near) => near.terrain.passable)
        .sort((a, b) => hexDistance(a.q, a.r, step.q, step.r)
          - hexDistance(b.q, b.r, step.q, step.r))[0];
      if (follow) return { q: follow.q, r: follow.r };
    }
    return { q: tile.q, r: tile.r };
  });
  front.tiles = next;
  return true;
}

/** Haftalık cephe işleyişi. Hareketten *önce* çağrılır ki emirler aynı hafta işlesin. */
export function runFronts(game) {
  const world = game.world;
  const system = ensureFronts(world);

  for (const front of [...system.fronts]) {
    const nation = world.nations[front.nationId];
    if (!nation?.alive) {
      system.fronts = system.fronts.filter((item) => item.id !== front.id);
      continue;
    }
    // Ölen/dağılan ordular hattan düşer.
    front.armies = front.armies.filter(
      (id) => world.units.some((unit) => unit.id === id && unit.nationId === front.nationId),
    );

    const armies = armiesOf(world, front);
    // Plan olgunlaşması: kurmay generali olan cepheler daha hızlı hazırlanır.
    const staff = armies.reduce(
      (best, army) => Math.max(best, generalPlanningBonus(generalOfArmy(nation, army))), 0,
    );
    if (!front.active && armies.length) {
      front.planning = Math.min(1, (front.planning ?? 0) + PLANNING_RATE * (1 + staff));
    }

    if (front.active && front.plan !== PLAN.HOLD) {
      // İlerleme hem planlama olgunluğuna hem komutanın saldırganlığına bağlı:
      // hazırlıksız ya da temkinli taarruz ağır ilerler.
      const general = front.generalId != null
        ? generalsOf(nation).find((item) => item.id === front.generalId)
        : null;
      const aggression = aggressionInfo(general?.aggression);
      const maturity = front.planning >= 1 ? 0 : front.planning >= 0.5 ? 1 : 2;
      const cadence = aggression.cadence + maturity;
      if ((game.turns.turn - front.created) % cadence === 0) {
        if (front.plan === PLAN.ARROW) advanceArrow(game, front, aggression.reach);
        else advanceLine(game, front, aggression.reach);
      }
      // Taarruz planı harcanır: ilerledikçe hazırlık erir.
      front.planning = Math.max(0, front.planning - 0.08);
    }

    distribute(game, front);
  }
  game.emit('fronts', system.fronts);
}
