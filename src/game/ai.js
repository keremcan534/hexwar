// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import { hexDistance } from '../core/hex.js';
import {
  CITY_COST, UNIT_COSTS, UNIT_UPKEEP, WORK_RADIUS, canAfford, canFoundCity,
} from './cities.js';
import { BUILDINGS, canBuild } from './buildings.js';
import {
  MIN_WAR_TURNS, atWar, declareWar, makePeace, nationStrength, relation, truceLeft,
} from './diplomacy.js';
import { INFAMY_COALITION } from './infamy.js';

/** Savaş ilanı için gereken güç üstünlüğü. */
const WAR_THRESHOLD = 1.15;

/**
 * Diplomatik karar: sınır komşusu zayıfsa savaş, savaş kaybediliyorsa barış.
 * Sadece temas hâlindeki ülkelerle ilgilenir.
 */
function diplomacy(game, nation, rng) {
  const world = game.world;
  const contacts = world.contacts;
  if (!contacts) return;

  const myPower = nationStrength(world, nation);
  const wars = world.nations.filter((n) => n.alive && atWar(world, n.id, nation.id));

  // Kaybedilen savaşlardan çıkmayı dene.
  for (const foe of wars) {
    const rec = relation(world, nation.id, foe.id);
    if (game.turns.turn - rec.since < MIN_WAR_TURNS) continue;
    const foePower = nationStrength(world, foe);
    if (myPower >= foePower * 0.6) continue;
    // Karşı taraf da yorgunsa ya da başka cephesi varsa kabul eder.
    const foeWars = world.nations.filter((n) => n.alive && atWar(world, n.id, foe.id)).length;
    if (foeWars > 1 || rng() < 0.3) makePeace(game, nation.id, foe.id);
  }

  // Aynı anda ikiden fazla cephe açma.
  if (wars.length >= 2 || rng() > 0.25) return;
  // Şöhreti kirlenmiş ülke yeni savaş açmaz: koalisyon riski taşıyor.
  if ((nation.infamy ?? 0) > INFAMY_COALITION * 0.6) return;

  let bestTarget = null;
  let bestScore = 0;
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id) continue;
    if (atWar(world, other.id, nation.id)) continue;
    const contact = contacts[nation.id][other.id];
    if (!contact) continue;
    if (truceLeft(world, nation.id, other.id, game.turns.turn) > 0) continue;
    const ratio = myPower / Math.max(1, nationStrength(world, other));
    if (ratio < WAR_THRESHOLD) continue;
    // Uzun sınır + zayıf komşu = cazip hedef.
    const score = ratio * Math.log(1 + contact);
    if (score > bestScore) {
      bestScore = score;
      bestTarget = other;
    }
  }
  if (bestTarget) declareWar(game, nation.id, bestTarget.id);
}

/** Ülke başına hedeflenen birim sayısı: toprak büyüdükçe ordu büyür. */
function desiredArmy(nation) {
  return 2 + Math.floor(nation.tiles / 25);
}

/** Stokun alabileceği en güçlü birim; demir yoksa izciye düşer. */
function affordableUnit(nation) {
  for (const id of ['CAVALRY', 'INFANTRY', 'SCOUT']) {
    if (canAfford(nation, UNIT_COSTS[id])) return id;
  }
  return null;
}

/**
 * Harcama önceliği: önce yeterli ordu, sonra yeni şehir, artan altınla yine ordu.
 * Hazine biriktirmek YZ'yi pasifleştirdiği için son adım önemli.
 */
/**
 * Bina alımı: hazinenin asıl gideri. Ordu erzakla sınırlı olduğundan altının
 * başka çıkışı yok; bu adım olmadan hazine 2000 altını aşıyordu.
 * Öncelik ulusun o anki darboğazına göre.
 */
function buildSomething(game, nation) {
  const world = game.world;
  const net = nation.budget?.net ?? { food: 0, gold: 0, timber: 0, iron: 0 };
  const atWar = world.nations.some((n) => n.alive && n.id !== nation.id
    && world.relations?.[n.id]?.[nation.id]?.state === 'war');

  // Darboğazdan çıkmayı hedefleyen sıra.
  const wishlist = [];
  if (net.food < 4) wishlist.push('GRANARY');
  if (nation.iron < 10) wishlist.push('FORGE');
  if (nation.timber < 10) wishlist.push('SAWMILL');
  if (atWar) wishlist.push('WALLS');
  wishlist.push('MARKET', 'HARBOR', 'GRANARY', 'SAWMILL', 'FORGE', 'WALLS');

  const cities = world.cities.filter((c) => c.nationId === nation.id);
  // Turda en fazla iki bina: hazine boşalsın ama tek turda her şey bitmesin.
  for (let built = 0; built < 2; built++) {
    let done = false;
    for (const id of wishlist) {
      if (!canAfford(nation, BUILDINGS[id].cost)) continue;
      const city = cities.find((c) => canBuild(world, c, id, WORK_RADIUS));
      if (city && game.turns.build(city, id)) {
        done = true;
        break;
      }
    }
    if (!done) return;
  }
}

function spend(game, nation) {
  const world = game.world;
  const cities = world.cities.filter((c) => c.nationId === nation.id).length;

  buildSomething(game, nation);

  // Yeni şehir: gelirin asıl kaynağı, orduyu beslemekten önce gelir.
  if (canAfford(nation, { gold: CITY_COST.gold + 25, timber: CITY_COST.timber })
    && cities < 1 + nation.tiles / 45) {
    const unit = world.units.find(
      (u) => u.nationId === nation.id && canFoundCity(world, u.tile, nation.id),
    );
    if (unit) game.turns.foundCity(unit);
  }

  // Ordu, erzak fazlasının beslediği kadar büyür; altın ikincil frendir.
  const target = desiredArmy(nation);
  let army = world.units.filter((u) => u.nationId === nation.id).length;
  let food = nation.budget?.net.food ?? 0;
  const canFeed = () => food - UNIT_UPKEEP.food >= 0;

  // Kıyı ülkeleri mütevazı bir donanma tutar: adalar ve kıyı şehirleri savunmasız kalmasın.
  const hasPort = world.cities.some((c) => c.nationId === nation.id && c.tile.coastal);
  const fleet = world.units.filter(
    (u) => u.nationId === nation.id && u.type.domain === 'sea',
  ).length;
  if (hasPort && fleet < 1 + Math.floor(cities / 3) && canFeed()
    && canAfford(nation, UNIT_COSTS.WARSHIP)
    && game.turns.buyUnit(nation, 'WARSHIP')) {
    army++;
    food -= UNIT_UPKEEP.food;
  }

  for (let i = 0; i < 3; i++) {
    // Hazine fazlası orduya dönüşür ama sert bir tavan var: ölçümde tek ülke
    // 93 süvari yığıp tur süresini 22 ms'ye çıkarmıştı.
    const surplus = nation.gold > 120 && army < target * 2;
    if (army >= target && !surplus) break;
    if (!canFeed()) break;
    const typeId = canAfford(nation, UNIT_COSTS.CAVALRY) && (nation.tiles > 80 || surplus)
      ? 'CAVALRY'
      : affordableUnit(nation);
    if (!typeId || !game.turns.buyUnit(nation, typeId)) break;
    army++;
    food -= UNIT_UPKEEP.food;
  }
}

/** Kara birimi kesintisiz en fazla bu kadar su karesi geçmeyi göze alır. */
const MAX_SEA_CROSSING = 5;

/**
 * Ulusun sahip olmadığı en yakın kara karesi (BFS).
 * Arama denizden de geçer (yoksa YZ adaları hiç keşfetmiyor) ama sınırlı
 * derinlikte: serbest bırakınca ordular okyanus aşırı akın yapıp haritayı
 * 150 turda iki ülkeye indiriyor.
 */
function nearestFrontier(world, from, nationId, maxNodes = 900) {
  // Barış içindeki komşunun toprağı ne hedeftir ne de geçit.
  const open = (t) => t.owner < 0 || t.owner === nationId || atWar(world, t.owner, nationId);
  const depth = new Map([[from, 0]]);
  const queue = [from];
  let head = 0;
  while (head < queue.length && head < maxNodes) {
    const tile = queue[head++];
    if (tile.owner !== nationId && tile.terrain.passable && open(tile)) return tile;
    const seaDepth = depth.get(tile);
    for (const n of world.neighbors(tile)) {
      if (depth.has(n)) continue;
      if (n.terrain.passable && open(n)) depth.set(n, 0);
      else if (n.terrain.navigable && seaDepth < MAX_SEA_CROSSING) depth.set(n, seaDepth + 1);
      else continue;
      queue.push(n);
    }
  }
  return null;
}

/** Gemiler için hedef: en yakın düşman gemisi ya da kıyı şehri. */
function navalGoal(world, unit) {
  let best = null;
  let bestDist = Infinity;
  const consider = (tile) => {
    const d = hexDistance(tile.q, tile.r, unit.tile.q, unit.tile.r);
    if (d < bestDist) {
      bestDist = d;
      best = tile;
    }
  };
  for (const other of world.units) {
    if (other.nationId === unit.nationId || !atWar(world, other.nationId, unit.nationId)) continue;
    if (other.embarked || other.type.domain === 'sea') consider(other.tile);
  }
  for (const city of world.cities) {
    if (city.nationId === unit.nationId || !atWar(world, city.nationId, unit.nationId)) continue;
    if (city.tile.coastal) consider(city.tile);
  }
  return best;
}

function adjacentEnemy(world, unit) {
  let best = null;
  for (const n of world.neighbors(unit.tile)) {
    const other = n.unit;
    if (!other || other.nationId === unit.nationId) continue;
    if (!atWar(world, other.nationId, unit.nationId)) continue;
    // En zayıfına vur: birim düşürme şansı yüksek olsun.
    if (!best || other.hp < best.unit.hp) best = { tile: n, unit: other };
  }
  return best;
}

/**
 * Yakındaki düşman şehri varsa asıl hedef odur; toprak kapmaktan değerli.
 * Menzil dar tutuldu: geniş olunca herkes ilk 20 turda birbirinin başkentine
 * koşuyor ve harita üç ülkeye iniyor.
 */
function enemyCityNear(world, unit, maxDistance = 7) {
  let best = null;
  let bestDist = maxDistance;
  for (const city of world.cities) {
    if (city.nationId === unit.nationId) continue;
    if (!atWar(world, city.nationId, unit.nationId)) continue;
    const d = hexDistance(city.tile.q, city.tile.r, unit.tile.q, unit.tile.r);
    if (d < bestDist) {
      bestDist = d;
      best = city.tile;
    }
  }
  return best;
}

/**
 * Tek birimin tur davranışı. Ayrı durması önemli: oyuncu "otomatik" emri
 * verdiği birimleri de aynı rutine devrediyor.
 */
export function runUnitAI(game, unit, rng) {
  const world = game.world;
  if (unit.hp <= 0) return;

  // 1) Bitişikte düşman varsa saldır (denizdeki kara birimi saldıramaz).
  let target = adjacentEnemy(world, unit);
  if (target && unit.movesLeft > 0 && !unit.embarked) {
    game.attack(unit, target.tile);
    return;
  }

  // 2) Değilse hedefe ilerle: gemiler denizi, kara birimleri sınırı kollar.
  const goal = unit.type.domain === 'sea'
    ? navalGoal(world, unit)
    : (enemyCityNear(world, unit) ?? nearestFrontier(world, unit.tile, unit.nationId));
  if (!goal) return;

  const { costs } = game.getReachable(unit);
  let bestTile = null;
  let bestScore = Infinity;
  for (const [tile, cost] of costs) {
    if (tile === unit.tile) continue;
    // Hedefe yakınlık birincil, ucuzluk ikincil; küçük rastgelelik tekdüzeliği kırar.
    const score = hexDistance(tile.q, tile.r, goal.q, goal.r) + cost * 0.05 + rng() * 0.3;
    if (score < bestScore) {
      bestScore = score;
      bestTile = tile;
    }
  }
  if (bestTile) game.moveUnit(unit, bestTile);

  // 3) Hareketten sonra hâlâ hakkı varsa ve düşman bitişikse vur.
  target = adjacentEnemy(world, unit);
  if (target && unit.movesLeft > 0 && !unit.embarked) game.attack(unit, target.tile);
}

export function runNationAI(game, nation, rng) {
  const world = game.world;
  diplomacy(game, nation, rng);
  spend(game, nation);
  for (const unit of world.units.filter((u) => u.nationId === nation.id)) {
    runUnitAI(game, unit, rng);
  }
}
