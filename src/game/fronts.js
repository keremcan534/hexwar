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

/**
 * Saldırganlık kademesinin ilerleme sıklığına ve menziline etkisi.
 * Sayılar kasten yüksek: cephe WW1 gibi yavaş ilerlemeli — en saldırgan komutan
 * bile iki haftada bir province ısırabilsin, temkinli olan altı haftada bir.
 */
const AGGRESSION = {
  1: { label: 'Careful', cadence: 6, reach: 1 },
  2: { label: 'Balanced', cadence: 4, reach: 1 },
  3: { label: 'Aggressive', cadence: 2, reach: 1 },
};

export function aggressionInfo(level) {
  return AGGRESSION[Math.max(1, Math.min(3, level ?? 2))];
}

/** Plan bu hızda olgunlaşır; 1.0'da tam bonus verir. */
const PLANNING_RATE = 0.06;
/**
 * Hattın taşıyabileceği en fazla province. Cephe artık bir "combat zone" —
 * o ülkeyle olan sınırımızın tamamı — olduğu için sınır cömert tutuldu;
 * kuşatılmış cepler de hatta dahil olmalı.
 */
export const MAX_FRONT_TILES = 60;

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

/**
 * Bir ulusun belirli bir komsusuyla olan sinir hatti: kendi tarafimizdaki,
 * o ulkeye bitisik province'ler. HOI4'te cephe hatti elle cizilmez, sinira
 * oturur — bu fonksiyon o oturmayi saglar.
 */
export function borderTiles(world, nationId, foreignId) {
  const tiles = [];
  world.forEach((tile) => {
    if (tile.owner !== nationId || !tile.terrain.passable) return;
    const touches = world.neighbors(tile).some((near) => (
      foreignId === null ? near.owner !== nationId : near.owner === foreignId
    ));
    if (touches) tiles.push(tile);
  });
  return tiles;
}

/**
 * Dagimik kareleri tek bir zincire dizer: bir uctan baslayip her adimda en
 * yakin kullanilmamis kareye gecer. Cephe boyunca dagitim sirayi kullandigi
 * icin hattin sirali olmasi gerekir.
 */
export function chainTiles(tiles) {
  if (tiles.length < 2) return [...tiles];
  // Uc kare: en uzak ciftin bir ucu. Ortadan baslarsak zincir catallanir.
  let start = tiles[0];
  let best = -1;
  for (const a of tiles) {
    for (const b of tiles) {
      const distance = hexDistance(a.q, a.r, b.q, b.r);
      if (distance > best) {
        best = distance;
        start = a;
      }
    }
  }
  const remaining = new Set(tiles);
  remaining.delete(start);
  const chain = [start];
  while (remaining.size) {
    const last = chain[chain.length - 1];
    let next = null;
    let bestDistance = Infinity;
    for (const tile of remaining) {
      const distance = hexDistance(last.q, last.r, tile.q, tile.r);
      if (distance < bestDistance) {
        bestDistance = distance;
        next = tile;
      }
    }
    remaining.delete(next);
    chain.push(next);
  }
  return chain;
}

/**
 * Zincirdeki bosluklari doldurur. Oyuncu hattini kopuk cizerse (ya da sinir
 * dogal olarak kopuksa) aradaki kareler hayali olarak eklenir; boylece hat
 * her zaman sureklidir.
 */
export function fillGaps(world, chain) {
  if (chain.length < 2) return [...chain];
  const out = [chain[0]];
  for (let i = 1; i < chain.length; i++) {
    const from = out[out.length - 1];
    const to = chain[i];
    let cursor = from;
    let guard = 0;
    while (hexDistance(cursor.q, cursor.r, to.q, to.r) > 1 && guard++ < MAX_FRONT_TILES) {
      const step = world.neighbors(cursor)
        .filter((near) => near.terrain.passable)
        .sort((a, b) => hexDistance(a.q, a.r, to.q, to.r)
          - hexDistance(b.q, b.r, to.q, to.r))[0];
      if (!step || step === cursor) break;
      out.push(step);
      cursor = step;
    }
    out.push(to);
  }
  // Tekrarlari at, sirayi koru.
  const seen = new Set();
  return out.filter((tile) => {
    if (seen.has(tile)) return false;
    seen.add(tile);
    return true;
  });
}

/**
 * Tek kare secildiginde ondan bir hedef hatti uretir: ilerleme yonune dik,
 * her iki yana dogru uzatilir. Oyuncu tek province'e tiklayinca da anlamli
 * bir taarruz hatti olusur.
 */
export function spanObjective(world, origin, from, width = 3) {
  const line = [origin];
  // Ilerleme yonu; ona dik iki komsu yonde genisletiriz.
  const forward = { q: origin.q - from.q, r: origin.r - from.r };
  const sides = world.neighbors(origin).filter((near) => {
    if (!near.terrain.passable) return false;
    const dot = (near.q - origin.q) * forward.q + (near.r - origin.r) * forward.r;
    return dot <= 0;
  });
  for (const side of sides.slice(0, 2)) {
    let cursor = side;
    line.push(cursor);
    for (let i = 1; i < width; i++) {
      const step = world.neighbors(cursor).find((near) => (
        near.terrain.passable
        && !line.includes(near)
        && hexDistance(near.q, near.r, origin.q, origin.r) > hexDistance(cursor.q, cursor.r, origin.q, origin.r)
      ));
      if (!step) break;
      line.push(step);
      cursor = step;
    }
  }
  return chainTiles(line);
}

/**
 * Cephe ve geri cekilme hatti ayni generalde birlikte duramaz: biri kurulunca
 * digeri kalkar. Ikisi ayni tumenleri ters yonlere cekiyordu.
 */
function dropConflicting(system, front) {
  system.fronts = system.fronts.filter((other) => {
    if (other.id === front.id) return true;
    if (other.nationId !== front.nationId || other.generalId !== front.generalId) return true;
    // Yeni taarruz eskisinin yerine geçer; cephe ve geri çekilme hattı da
    // birbirini dışlar. Aynı generalin iki çelişkili planı olamaz.
    if (front.plan === PLAN.ARROW) return other.plan !== PLAN.ARROW;
    return other.plan === PLAN.ARROW;
  });
}

/**
 * Cepheyi güncel sınıra oturtur. Hat donmuş bir kare listesi değildir: her
 * hafta izlediği ülkeyle olan sınırımızdan yeniden kurulur. Böylece toprak
 * el değiştirince, ya da bir yerde kuşatılınca cephe kendiliğinden oraya uzar.
 *
 * Taarruz yürürken tazelenmez — o sırada hat kasten sınırın ötesindedir.
 */
export function refreshZone(world, front) {
  if (front.plan === PLAN.ARROW || front.active) return false;
  const fresh = borderTiles(world, front.nationId, front.foreignId ?? null);
  if (fresh.length < 2) return false;
  const chain = chainTiles(fresh).slice(0, MAX_FRONT_TILES);
  const before = front.tiles.map((t) => `${t.q}:${t.r}`).join(',');
  const after = chain.map((t) => `${t.q}:${t.r}`).join(',');
  if (before === after) return false;
  front.tiles = chain.map((tile) => ({ q: tile.q, r: tile.r }));
  return true;
}

export function frontTiles(world, front) {
  return front.tiles.map((point) => world.get(point.q, point.r)).filter(Boolean);
}

/**
 * Hattı çizilen karelerden kurar. Aynı kare iki kez sayılmaz, sıra korunur
 * (hat boyunca dağıtım sırayı kullanır) ve uzunluk sınırlanır.
 */
export function createFront(game, nation, tiles, plan = PLAN.ADVANCE, generalId = null, foreignId = null) {
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
  // Bir taarruz oku tek bir çıkış karesinden başlayabilir; düz cephe ve geri
  // çekilme hattı ise anlamlı bir hat oluşturmak için en az iki kare ister.
  const minimum = plan === PLAN.ARROW ? 1 : 2;
  if (points.length < minimum) return null;

  const front = {
    id: system.nextId++,
    nationId: nation.id,
    // Plan bir generalindir: onun tümenleri hatta dağılır, saldırganlığı
    // ilerleme hızını belirler (HOI4'te plan komutana bağlıdır).
    generalId,
    // Cephenin izlediği düşman. Hat her hafta bu ülkeyle olan sınırdan yeniden
    // hesaplanır; sınır değişince (fetih, kuşatma) cephe kendiliğinden uyar.
    foreignId,
    tiles: points,
    armies: [],
    plan,
    // Taarruzda ilerlenecek hedef hatti (bkz. advanceToObjective).
    objective: null,
    active: false,
    planning: 0,
    created: game.turns.turn,
  };
  system.fronts.push(front);
  dropConflicting(system, front);
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

/**
 * General değiştirilen ya da komutadan çıkarılan tümenleri eski planlarından
 * düşürür. Böylece cephe, artık başka bir ordu grubuna bağlı tümenleri gizlice
 * yürütmeye devam etmez.
 */
export function reconcileFronts(world) {
  const system = ensureFronts(world);
  for (const front of system.fronts) {
    const nation = world.nations[front.nationId];
    const general = front.generalId == null
      ? null
      : generalsOf(nation).find((item) => item.id === front.generalId);
    const commanded = front.generalId == null
      ? null
      : new Set(general?.divisions ?? []);
    front.armies = front.armies.filter((id) => {
      const army = world.units.find(
        (unit) => unit.id === id && unit.nationId === front.nationId && unit.hp > 0,
      );
      return Boolean(army) && (!commanded || commanded.has(id));
    });
  }
  return system.fronts;
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
 * Orduları hat boyunca dağıtır.
 *
 * Hattı zaten tutan ordular yerinde bırakılır — yeni bir tümen geldi diye
 * bütün cepheyi yeniden dizmek, oturmuş bir hattı boşaltıp haftalarca
 * yürütüyordu. Yalnız hatta olmayanlar hareket eder ve *en zayıf* yere,
 * yani dolu komşusu en uzak olan boşluğa gönderilir.
 */
function distribute(game, front) {
  const world = game.world;
  const armies = armiesOf(world, front);
  const slots = frontTiles(world, front);
  if (!armies.length || !slots.length) return;

  const index = new Map(slots.map((slot, i) => [slot, i]));
  const held = new Set();
  const idle = [];
  for (const army of armies) {
    const at = index.get(army.tile);
    if (at !== undefined) held.add(at);
    else if (!army.battleId) idle.push(army);
  }
  // Yolda olanların hedefi de dolu sayılır, yoksa hepsi aynı boşluğa koşar.
  for (const army of armies) {
    const destination = destinationOf(army);
    if (destination && index.has(destination)) held.add(index.get(destination));
  }
  if (!idle.length) return;

  // Boşluğun zayıflığı: en yakın dolu slota uzaklığı. Hiç dolu yoksa hat boştur,
  // o zaman eşit aralıklı yerleşim yapılır.
  const weakness = (i) => (held.size
    ? Math.min(...[...held].map((taken) => Math.abs(taken - i)))
    : slots.length);

  for (const army of idle) {
    let best = null;
    let bestScore = -Infinity;
    for (let i = 0; i < slots.length; i++) {
      if (held.has(i)) continue;
      // Zayıflık birincil, orduya yakınlık ikincil.
      const score = weakness(i) * 10
        - hexDistance(army.tile.q, army.tile.r, slots[i].q, slots[i].r) * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best === null) break;
    held.add(best);
    const target = slots[best];
    if (army.tile === target) continue;
    if (isMoving(army) && destinationOf(army) === target) continue;
    orderMove(game, army, target);
  }
}

/**
 * Cephe hattının ilerlemesi: her kare önündeki en yakın düşman karesine kayar.
 * Hattın uzunluğu korunur; önünde hedef kalmayan kare yerinde durur ki hat
 * kopmasın. Saldırgan komutan daha uzaktaki hedefi de kabul eder.
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
    const chosen = best && bestDistance <= reach ? best : tile;
    if (best && bestDistance <= reach) used.add(best);
    next.push({ q: chosen.q, r: chosen.r });
  }
  front.tiles = next;
  return true;
}

/**
 * Bir cephe karesinin hedef hattindaki karsiligi. Hat boyunca oransal eslesme:
 * soldaki kare soldaki hedefe, sagdaki sagdakine gider. Boylece hat kendi
 * icinde catallanmadan topluca ilerler.
 */
function objectiveFor(world, front, index) {
  const objective = front.objective ?? [];
  if (!objective.length) return null;
  const ratio = front.tiles.length > 1 ? index / (front.tiles.length - 1) : 0;
  const point = objective[Math.round(ratio * (objective.length - 1))];
  return point ? world.get(point.q, point.r) : null;
}

/**
 * Bir karenin hedefine giden bir sonraki adimi: hedefe *yaklasan*, gecilebilir
 * komsulardan en iyisi. Yaklasan komsu yoksa null (kare yerinde kalir).
 */
function stepToward(world, tile, target) {
  const current = hexDistance(tile.q, tile.r, target.q, target.r);
  if (current === 0) return null;
  return world.neighbors(tile)
    .filter((near) => near.terrain.passable
      && hexDistance(near.q, near.r, target.q, target.r) < current)
    .sort((a, b) => hexDistance(a.q, a.r, target.q, target.r)
      - hexDistance(b.q, b.r, target.q, target.r))[0] ?? null;
}

/**
 * Taarruz: hat, oyuncunun cizdigi hedef hattina dogru topluca kayar. HOI4'teki
 * offensive line budur — plan tek bir kareye degil bir *hedef hattina* gider.
 */
function advanceToObjective(game, front, reach = 2) {
  const world = game.world;
  if (!front.objective?.length) return advanceLine(game, front, reach);

  let moved = false;
  const next = frontTiles(world, front).map((tile, index) => {
    const target = objectiveFor(world, front, index);
    if (!target) return { q: tile.q, r: tile.r };
    let cursor = tile;
    // Saldirganlik kademesi bir haftada kac kare ilerleyecegini belirler.
    for (let step = 0; step < reach; step++) {
      const ahead = stepToward(world, cursor, target);
      if (!ahead) break;
      cursor = ahead;
      moved = true;
    }
    return { q: cursor.q, r: cursor.r };
  });
  front.tiles = next;
  // Hicbir kare ilerleyemediyse hedefe varilmistir: plan tamamlandi.
  if (!moved) front.active = false;
  return moved;
}

/**
 * Planin onizlemesi: her cephe karesinin hedefine giden yol. Oyuncu plani
 * calistirmadan once nereden gecilecegini gorur (HOI4'teki kesikli guzergah).
 */
export function plannedPath(world, front) {
  if (!front?.objective?.length) return [];
  const path = [];
  const seen = new Set();
  frontTiles(world, front).forEach((tile, index) => {
    const target = objectiveFor(world, front, index);
    if (!target) return;
    let cursor = tile;
    let guard = 0;
    while (cursor !== target && guard++ < MAX_FRONT_TILES) {
      const ahead = stepToward(world, cursor, target);
      if (!ahead) break;
      cursor = ahead;
      if (!seen.has(cursor)) {
        seen.add(cursor);
        path.push(cursor);
      }
    }
  });
  return path;
}

/** Haftalık cephe işleyişi. Hareketten *önce* çağrılır ki emirler aynı hafta işlesin. */
export function runFronts(game) {
  const world = game.world;
  const system = ensureFronts(world);
  reconcileFronts(world);

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
    // Cephe canlıdır: sınır değiştiyse hat oraya uzar/kısalır.
    refreshZone(world, front);

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
        if (front.plan === PLAN.ARROW) advanceToObjective(game, front, aggression.reach);
        else advanceLine(game, front, aggression.reach);
      }
      // Taarruz planı harcanır: ilerledikçe hazırlık erir.
      front.planning = Math.max(0, front.planning - 0.08);
    }

    distribute(game, front);
  }
  game.emit('fronts', system.fronts);
}
