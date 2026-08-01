// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import { hexDistance, hexesInRange } from '../core/hex.js';
import { ROAD_MAX_LEVEL, buildRoad, canBuildRoad } from './infrastructure.js';
import {
  CITY_COST, UNIT_COSTS, UNIT_UPKEEP, WORK_RADIUS, canAfford, canFoundCity,
} from './cities.js';
import { BUILDINGS, canBuild } from './buildings.js';
import {
  MIN_WAR_TURNS, atWar, declareWar, makePeace, nationStrength, relation, truceLeft,
} from './diplomacy.js';
import { INFAMY_COALITION } from './infamy.js';
import { affordableTechs, research } from './tech.js';
import { isMoving, regimentCount } from './units.js';
import { destinationOf, orderMove } from './movement.js';
import { canDevelopProvince, developProvince } from './provinces.js';

/** Savaş ilanı için gereken güç üstünlüğü. */
const WAR_THRESHOLD = 1.30;

/**
 * Diplomatik karar: sınır komşusu zayıfsa savaş, savaş kaybediliyorsa barış.
 * Sadece temas hâlindeki ülkelerle ilgilenir.
 */
function diplomacy(game, nation, rng) {
  const world = game.world;
  const contacts = world.contacts;
  if (!contacts) return;
  // Gerçek zaman başlar başlamaz sınır komşularının oyuncuya yığılması karar
  // vermeye fırsat bırakmıyordu; ilk üç ay seferberlik hazırlığıdır.
  if (game.turns.turn < 27) return;
  // Diplomasi haftalık zar atmaz. Her ülke ayda bir, farklı haftada değerlendirme
  // yapar; aksi halde %25 haftalık ihtimal birkaç ay içinde neredeyse kesin savaştı.
  if ((game.turns.turn + nation.id) % 4 !== 0) return;

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

  // Tek savaş yeterli. Aylık hazırlık kontrolünün yalnız %2'si ilan aşamasına gelir.
  if (wars.length >= 1 || rng() > 0.02) return;
  const regiments = world.units
    .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land')
    .reduce((sum, unit) => sum + regimentCount(unit), 0);
  if (regiments < 4 || nation.gold < 45 || (nation.economy?.stability ?? 0.6) < 0.40) return;
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

/**
 * Sıradaki kol. Topçu destek sınıfıdır: ordunun gövdesi piyade, hızı süvari,
 * ateş gücü topçudur. Her üçüncü alay topçu olsun ki YZ dengeli ordu kursun.
 */
function affordableUnit(nation, army) {
  const wantsArtillery = army >= 3 && army % 3 === 0;
  const order = wantsArtillery
    ? ['ARTILLERY', 'INFANTRY', 'CAVALRY']
    : ['INFANTRY', 'CAVALRY', 'ARTILLERY'];
  for (const id of order) {
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
  if (net.food < 4) wishlist.push('GRANARY', 'FARM_ESTATE');
  if (nation.iron < 10) wishlist.push('MINE', 'FORGE');
  if (nation.timber < 10) wishlist.push('SAWMILL');
  if (atWar) wishlist.push('WALLS', 'BARRACKS', 'SUPPLY_DEPOT');
  if ((nation.techs?.length ?? 0) < 6) wishlist.push('UNIVERSITY');
  wishlist.push(
    'MARKET', 'WORKSHOP', 'ADMIN_CENTER', 'HARBOR', 'SHIPYARD', 'GRANARY',
    'FARM_ESTATE', 'SAWMILL', 'MINE', 'FORGE', 'BARRACKS', 'SUPPLY_DEPOT', 'WALLS',
  );

  const cities = world.cities.filter((c) => c.nationId === nation.id);
  // Turda en fazla iki bina: hazine boşalsın ama tek turda her şey bitmesin.
  for (let built = 0; built < 2; built++) {
    let done = false;
    for (const id of wishlist) {
      // Listede tanımsız bir kimlik olursa (yazım hatası, kaldırılmış bina)
      // sessizce atla: eskiden tüm turu çökertiyordu.
      const building = BUILDINGS[id];
      if (!building || !canAfford(nation, building.cost)) continue;
      const city = cities.find((c) => canBuild(world, c, id, WORK_RADIUS));
      if (city && game.turns.build(city, id)) {
        done = true;
        break;
      }
    }
    if (!done) return;
  }
}

/**
 * Araştırma: altının son gider kalemi. Ülke kendi dalını tercih eder ama
 * karşılayabildiği başka dalı da alır; yoksa hazine yine şişiyor.
 */
function researchSomething(nation) {
  const options = affordableTechs(nation);
  if (!options.length) return;
  // Ucuzdan pahalıya, kendi dalı öncelikli.
  options.sort((a, b) => {
    const focusDiff = (b.branch === nation.focus) - (a.branch === nation.focus);
    return focusDiff || a.tier - b.tier;
  });
  research(nation, options[0].id);
}

/**
 * Yol yatırımı. Yol sistemi yazıldığında yalnız oyuncuya açılmıştı; 30 oyunluk
 * ölçümde YZ hiç yol yapmıyordu, yani harita genelinde ölü bir sistemdi.
 * Şehir çevresinden başlar: asıl faydası üretim bölgesindeki hareket.
 */
function investInRoads(game, nation) {
  const world = game.world;
  // Ordu ve bina önce gelir; yol artan altının gideri.
  if (nation.gold < 140) return;

  let best = null;
  let bestLevel = ROAD_MAX_LEVEL;
  for (const city of world.cities) {
    if (city.nationId !== nation.id) continue;
    for (const { q, r } of hexesInRange(city.tile.q, city.tile.r, 1)) {
      const tile = world.get(q, r);
      if (!tile || !canBuildRoad(tile, nation.id)) continue;
      const level = tile.roadLevel ?? 0;
      // En geri kalmış kareyi yükselt: ağ dengeli büyüsün.
      if (level < bestLevel) {
        bestLevel = level;
        best = tile;
      }
    }
  }
  if (best) buildRoad(game, best, nation.id);
}

/** Dar boğaza göre bir province'i uzmanlaştır; YZ de aynı idari bütçeyi kullanır. */
function investInProvince(game, nation) {
  if ((nation.economy?.authority ?? 0) < 20 || nation.gold < 45) return;
  const net = nation.budget?.net ?? {};
  const preferred = net.food < 2 ? 'agriculture'
    : nation.iron < 8 || nation.timber < 8 ? 'extraction'
      : 'commerce';
  let best = null;
  let bestScore = -Infinity;
  game.world.forEach((tile) => {
    if (!canDevelopProvince(game.world, nation, tile, preferred)) return;
    const yields = tile.terrain.yields;
    const score = preferred === 'agriculture' ? yields.food
      : preferred === 'extraction' ? yields.iron + yields.timber
        : yields.gold + (tile.coastal ? 2 : 0);
    if (score > bestScore) {
      best = tile;
      bestScore = score;
    }
  });
  if (best) developProvince(game, best, preferred, nation.id);
}

function spend(game, nation) {
  const world = game.world;
  const cities = world.cities.filter((c) => c.nationId === nation.id).length;

  researchSomething(nation);
  buildSomething(game, nation);
  investInProvince(game, nation);
  investInRoads(game, nation);

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
  let army = world.units
    .filter((u) => u.nationId === nation.id)
    .reduce((sum, unit) => sum + regimentCount(unit), 0);
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
    const typeId = affordableUnit(nation, army);
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
  if (unit.hp <= 0 || unit.battleId || (unit.retreatUntil ?? 0) > game.turns.turn) return;

  // 1) Bitişikte düşman varsa saldır (denizdeki kara birimi saldıramaz).
  const target = adjacentEnemy(world, unit);
  if (target && !unit.embarked) {
    game.attack(unit, target.tile);
    return;
  }

  // 2) Değilse hedefe ilerle: gemiler denizi, kara birimleri sınırı kollar.
  const goal = unit.type.domain === 'sea'
    ? navalGoal(world, unit)
    : (enemyCityNear(world, unit) ?? nearestFrontier(world, unit.tile, unit.nationId));
  if (!goal || goal === unit.tile) return;

  // Yürüyüş sürekli olduğu için her hafta yeniden yol aramaya gerek yok:
  // yalnız hedef değiştiyse ya da ordu duruyorsa yeni yol kurulur.
  if (isMoving(unit) && destinationOf(unit) === goal) return;
  orderMove(game, unit, goal);
}

export function runNationAI(game, nation, rng) {
  const world = game.world;
  diplomacy(game, nation, rng);
  spend(game, nation);
  for (const unit of [...world.units].filter((u) => u.nationId === nation.id)) {
    runUnitAI(game, unit, rng);
  }
}
