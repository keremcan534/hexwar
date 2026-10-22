// Surekli yuruyus. Tur bazli hamle butcesi yok: ordu bir hedef alir ve haftalar
// boyunca yol boyunca ilerler. Bir haftalik adimda `speedOf` kadar ilerleme
// birikir, komsu province'in maliyeti dolunca ordu oraya gecer.
//
// Yol PROVINCE grafindadir (world/provinceGraph): karada ordu province
// merkezinden komsu province merkezine yurur, denizde hex hex gider. Adim
// maliyeti merkezler arasi hex mesafesi x arazidir; tempo hex yuruyusuyle ayni.
//
// Yuruyusu kesen uc sey var: dusmana carpmak (muharebe), yolun kapanmasi
// (yeniden hesap) ve hedefe varmak.

import { findPath } from '../core/pathfind.js';
import { nodeNeighbors, nodeOf, nodesAdjacent } from '../world/provinceGraph.js';
import { atWar, inCrisis } from './diplomacy.js';
import { controllerOf } from './control.js';
import { startBattle } from './battles.js';
import { generalMarchBonus, generalOfArmy } from './command.js';
import {
  EMBARKED_MOVES, clearPath, isMoving, marchSpeedOf, resetEntrenchment, speedOf, stackFull, unitsOn,
} from './units.js';
import { zoneStatus } from './navy.js';
import { seaZonesOf } from '../world/seaZones.js';

/**
 * Yolun bacakları: karada yürüyüş hızıyla, denizde bindirilmiş hızla
 * (adımın ÇIKTIĞI kare suysa deniz adımıdır: haftanın bütçesi haftanın
 * başındaki hâle göredir). Birikmiş ilerleme ilk adımın bacağından düşer.
 */
function pathLegs(game, unit) {
  const costOf = game.costForUnit();
  const legs = { coast: 0, sea: 0, ashore: 0 };
  let from = unit.tile;
  let progress = unit.progress ?? 0;
  let sailed = false;
  for (const step of unit.path ?? []) {
    let cost = Math.max(0.01, costOf(step, from));
    if (progress > 0) {
      const used = Math.min(cost, progress);
      cost -= used;
      progress = 0;
    }
    if (from.terrain?.water) {
      legs.sea += cost;
      sailed = true;
    } else if (sailed) {
      legs.ashore += cost;
    } else {
      legs.coast += cost;
    }
    from = step;
  }
  return legs;
}

/**
 * Yürüyüşün kalan haftası: bacak bedelleri bacak hızına (komutan bonusu
 * dahil) bölünür. Eskiden bütün yol tümenin O ANKİ hızına bölünüyordu:
 * karadan verilen deniz aşırı emir 3-4'lük yürüyüş hızıyla hesaplanıp
 * "22 wk" yazıyordu, gerçek yolculuk 12 hafta sürdü (ölçüldü, plan5c).
 */
export function etaWeeks(game, unit) {
  if (!isMoving(unit)) return 0;
  const weeks = legWeeks(game, unit);
  return Math.max(1, Math.ceil(weeks.coast + weeks.sea + weeks.ashore));
}

function legWeeks(game, unit) {
  const legs = pathLegs(game, unit);
  const general = generalOfArmy(game.world.nations[unit.nationId], unit);
  const bonus = generalMarchBonus(general);
  const land = Math.max(0.1, marchSpeedOf(unit) + bonus);
  const sea = Math.max(0.1, EMBARKED_MOVES + bonus);
  return { coast: legs.coast / land, sea: legs.sea / sea, ashore: legs.ashore / land };
}

/**
 * DENİZ AŞIRI EMRİN DÖKÜMÜ (sağ tık makbuzu, ordu paneli): nereden biner,
 * hangi denizlerden geçer (her birinin hâkimiyeti), nereye çıkar, bacak
 * bacak kaç hafta. Yolu suya değmeyen emir için null. `detour` yalnız
 * istenince: hâkimiyetsiz en kısa yol kapalı bir denizden geçiyor ve
 * gerçek yol onu dolaşıyorsa o deniz ve tutanları.
 */
export function crossingOf(game, unit, { detour = false } = {}) {
  const path = unit?.path ?? [];
  const world = game.world;
  if (!path.length || !(unit.embarked || path.some((step) => step.terrain?.water))) return null;
  const zones = seaZonesOf(world).zones;
  let embark = null;
  let land = null;
  let sawWater = false;
  const seas = [];
  let prev = unit.tile;
  for (const step of path) {
    if (step.terrain?.water) {
      if (!sawWater && !unit.embarked) embark = prev;
      sawWater = true;
      const zoneId = step.seaZone ?? -1;
      if (zoneId >= 0 && !seas.some((s) => s.zone === zoneId)) {
        seas.push({ zone: zoneId, name: zones[zoneId]?.name ?? 'open sea', status: zoneStatus(world, unit.nationId, zoneId) });
      }
    } else if (prev?.terrain?.water) {
      land = step;
    }
    prev = step;
  }
  if (unit.embarked && unit.tile?.seaZone >= 0 && !seas.some((s) => s.zone === unit.tile.seaZone)) {
    seas.unshift({ zone: unit.tile.seaZone, name: zones[unit.tile.seaZone]?.name ?? 'open sea', status: zoneStatus(world, unit.nationId, unit.tile.seaZone) });
  }
  const out = { embark, land, seas, weeks: legWeeks(game, unit), detour: null };
  if (detour) out.detour = detourOf(game, unit, path[path.length - 1], seas);
  return out;
}

/** Hâkimiyetsiz yol kapalı bir denizden geçiyor ve gerçek yol onu dolaşıyor mu. */
function detourOf(game, unit, target, seas) {
  const world = game.world;
  const free = findPath(world, unit.tile, target, {
    canEnter: game.canEnterFor(unit, { seaControl: false }),
    costOf: game.costForUnit(unit),
    neighbors: (tile) => nodeNeighbors(world, tile),
  });
  const used = new Set(seas.map((s) => s.zone));
  for (const step of free ?? []) {
    if (!step.terrain?.water || used.has(step.seaZone)) continue;
    const status = zoneStatus(world, unit.nationId, step.seaZone);
    if (status.state === 'held') {
      return { zone: step.seaZone, name: seaZonesOf(world).zones[step.seaZone]?.name ?? 'the sea', holders: status.holders, share: status.share };
    }
  }
  return null;
}

/** Hedefin oyuncuya okunan adı: state'in adı (yoksa province adı). */
function placeOf(world, tile) {
  if (!tile) return 'its objective';
  if (tile.terrain?.water) return seaZonesOf(world).zones[tile.seaZone]?.name ?? 'the open sea';
  return world.provinces?.[tile.provinceId]?.name ?? 'its objective';
}

const holdersText = (world, status) => {
  const names = (status?.holders ?? []).map((id) => world.nations[id]?.name).filter(Boolean).join(', ');
  return names ? `${names}, ${Math.round((status.share ?? 0) * 100)}%` : `${Math.round((status?.share ?? 0) * 100)}%`;
};

/**
 * Sağ tık makbuzu (game.handleRightTap → 'orderNote'): deniz aşırı emrin
 * tek cümlesi. Modelin kendisi söylenir: tümen her kıyıdan biner, nakliye
 * ve liman gerekmez, denizde savaşamaz, düşmanın tuttuğu denize giremez.
 */
export function crossingReceipt(game, unit, target, count = 1) {
  const world = game.world;
  const crossing = crossingOf(game, unit, { detour: true });
  if (!crossing) return null;
  const who = count > 1 ? `${count} divisions` : `${unit.type?.name ?? 'Infantry'} Division`;
  const goal = placeOf(world, target);
  const wk = (value) => `~${Math.max(1, Math.round(value))} wk`;
  const toWater = target?.terrain?.water;
  const statusWord = (s) => (s.status.state === 'ours' ? 'ours' : s.status.state === 'open' ? 'open'
    : s.status.state === 'contested' ? `contested: ${holdersText(world, s.status)}, passable below half`
      : `held: ${holdersText(world, s.status)}`);
  if (toWater) {
    const last = crossing.seas[crossing.seas.length - 1];
    return `${who} ${count > 1 ? 'sail' : 'sails'} to ${goal}${last ? ` (${statusWord(last)})` : ''} ${wk(crossing.weeks.coast + crossing.weeks.sea)}. ${count > 1 ? 'They' : 'It'} cannot fight while at sea.`;
  }
  const contested = crossing.seas.filter((s) => s.status.state === 'contested');
  const seasText = crossing.seas.length === 1
    ? `${crossing.seas[0].name} (${statusWord(crossing.seas[0])})`
    : `${crossing.seas.length} seas${contested.length
      ? ` (${contested.map((s) => `${s.name} ${statusWord(s)}`).join('; ')})`
      : crossing.seas.every((s) => s.status.state === 'ours') ? ', all ours' : ', all open'}`;
  const parts = [];
  if (crossing.weeks.coast >= 0.5) parts.push(`${wk(crossing.weeks.coast)} to the coast`);
  parts.push(`${wk(crossing.weeks.sea)} at sea through ${seasText}`);
  if (crossing.land) parts.push(`lands at ${placeOf(world, crossing.land)}`);
  let text = `${who} → ${goal}: ${parts.join(' · ')}.`;
  if (crossing.detour) {
    const by = crossing.detour.holders.map((id) => world.nations[id]?.name).filter(Boolean).join(', ') || 'the enemy';
    text += ` Routed around ${crossing.detour.name}: ${by} ${crossing.detour.holders.length > 1 ? 'hold' : 'holds'} ${Math.round((crossing.detour.share ?? 0) * 100)}% of it.`;
  }
  // Savunulan kıyıya denizden saldırılmaz: emir kıyının açığında biter.
  const path = unit.path ?? [];
  const beforeGoal = path.length >= 2 ? path[path.length - 2] : unit.tile;
  if (target && !target.terrain?.water && beforeGoal?.terrain?.water
    && unitsOn(target).some((other) => other.nationId !== unit.nationId)) {
    text += ` ${goal} is defended now: a division cannot attack from the sea. If defenders are still there on arrival the order ends off the beach — land on a free coast beside it.`;
  }
  return text;
}

/** Yol tikaninca bu kadar kez yeniden hesaplanir, sonra emir duser. */
const MAX_REROUTES = 2;

/**
 * OYUNCUNUN EMRI (directive). Ordunun yolu birçok sebeple düşer: hedefe giden
 * güzergâh kapanır, `MAX_REROUTES` tükenir, adım "blocked" döner. Yol düşünce
 * emir de unutuluyordu — general ertesi hafta tümeni kendi mevkisine, çoğu
 * zaman HEDEFİN TERS YÖNÜNE geri yürütüyordu.
 *
 * Ölçüldü (tohum war-probe): oyuncu 15 kare ötedeki düşman karesine taarruz
 * emri verdi, tümen 4 hafta yürüdü, 27. haftada yolu düştü ve 12 hafta boyunca
 * hedeften UZAKLAŞARAK mevkisine gitti. Hedef hiç alınmadı.
 *
 * Emir artık tümenin üstünde durur: yol düşse de hedef durur, ertesi hafta
 * yeniden yol kurulur ve komuta katmanı bu tümene karışmaz (bkz.
 * command.runGroup). Hedefe varınca ya da denetim bize geçince kendiliğinden
 * düşer; ulaşılamıyorsa `DIRECTIVE_TRIES` hafta sonra bırakılır.
 */
const DIRECTIVE_TRIES = 6;

/** Oyuncunun sürekli hedefi. `null` tile emri kaldırır. */
export function setDirective(unit, tile) {
  if (!unit) return;
  if (!tile) { unit.directive = null; return; }
  unit.directive = { q: tile.q, r: tile.r, tries: 0 };
}

export function clearDirective(unit) {
  if (unit) unit.directive = null;
}

/** Tümen oyuncunun verdiği bir emri yürütüyor mu? */
export function hasDirective(unit) {
  return Boolean(unit?.directive);
}

/**
 * Yolu düşmüş ama emri duran tümenleri yeniden yola çıkarır. Yürüyüşten ÖNCE
 * çağrılır ki emir aynı hafta yol alsın.
 */
export function resumeDirectives(game) {
  const world = game.world;
  for (const unit of world.units) {
    const directive = unit.directive;
    if (!directive) continue;
    if (unit.hp <= 0) { unit.directive = null; continue; }
    const tile = world.get(directive.q, directive.r);
    if (!tile || unit.tile === tile) {
      unit.directive = null;
      continue;
    }
    // Suyu aşan emir bir YOLCULUKTUR: tümen hedefin üstünde durana dek sürer.
    // Eskiden hedef bizimse emir tümen kıyıdan kalkmadan düşüyor, düşman
    // kıyısına çıkınca yürüyüş bitiyor ve kimse yeniden vermiyordu: tümen
    // sahilde duruyordu, mesaj yoktu (ölçüldü, plan5c: Lundford'a gönderilen
    // tümen (38,38)'de kaldı). Bayrak tıklamadan sonraki ilk geçişte (yol hâlâ
    // su içerirken) "bizim" denetiminden ÖNCE konur; kara emri eskisi gibi.
    if (unit.embarked || unit.path?.some((step) => step.terrain?.water)) directive.sea = true;
    // Hedef bizim olduysa emir tamamlanmistir: tumen generaline geri doner.
    if (controllerOf(tile) === unit.nationId && !directive.sea) {
      unit.directive = null;
      continue;
    }
    if (unit.battleId || (unit.retreatUntil ?? 0) > game.turns.turn) continue;
    if (isMoving(unit)) { directive.tries = 0; continue; }
    let hopeless = null;
    // Ultimatomdaki hedef: sinir kapali, emir bekler ve deneme SAYILMAZ
    // (sekiz haftalik bekleme alti denemede emri dusururdu).
    const holder = controllerOf(tile);
    if (holder >= 0 && holder !== unit.nationId && inCrisis(world, holder, unit.nationId)) continue;
    // Bitisikteki dusmana yuruyusle degil taarruzla girilir.
    if (nodesAdjacent(world, unit.tile, tile)
      && unitsOn(tile).some((other) => other.nationId !== unit.nationId)) {
      // Oyuncunun emri generalin temposunu beklemez (manual); toparlanma ve
      // duzen gibi fiziksel engeller beklenir ve deneme sayilmaz — yalniz
      // umutsuz engel (barista, denizde) emri dusurur.
      const blockers = game.attackBlockers(unit, tile, { manual: true });
      if (!blockers.length && game.attack(unit, tile, { manual: true })) {
        directive.tries = 0;
        continue;
      }
      if (blockers.some((b) => !b.wait)) {
        directive.tries = DIRECTIVE_TRIES;
        hopeless = blockers.find((b) => !b.wait)?.text ?? null;
      }
    } else if (orderMove(game, unit, tile)) {
      directive.tries = 0;
      continue;
    } else {
      directive.tries++;
      // Bekleyen emir sebebini söyler: kapalı deniz ilk haftada bir kez.
      if (directive.tries === 1 && unit.nationId === game.turns.playerNation) {
        const why = game.noRoadReason?.(unit, tile, null);
        if (why) {
          game.turns.addLog(`${unit.type.name}'s order to ${placeOf(world, tile)} waits: ${why}. It sails when the sea opens (up to ${DIRECTIVE_TRIES} weeks).`,
            { kind: 'ARMY', tier: 1, tile: unit.tile, key: `order:${unit.id}` });
        }
      }
    }
    if (directive.tries >= DIRECTIVE_TRIES) {
      unit.directive = null;
      if (unit.nationId === game.turns.playerNation) {
        const reason = hopeless ?? game.noRoadReason?.(unit, tile, 'no route leads there') ?? 'no route leads there';
        game.turns.addLog(`${unit.type.name} cannot reach ${placeOf(world, tile)}: ${reason}. Released to its commander.`,
          { kind: 'ARMY', tier: 1, tile: unit.tile, key: `order:${unit.id}` });
      }
    }
  }
}

/** Ordunun hedefi: yolun son karesi. */
export function destinationOf(unit) {
  return unit.path?.length ? unit.path[unit.path.length - 1] : null;
}

/**
 * Hedefe giden yolu kurar. Yolun ilk elemani ordunun *bir sonraki* karesidir;
 * bulundugu kare yola dahil edilmez.
 */
export function orderMove(game, unit, target) {
  const world = game.world;
  // Hedef karesi province'in merkez dugumune cekilir: hangi kareye
  // tiklanmis olursa olsun ordu o province'e yurur.
  target = nodeOf(world, target);
  // attackReadyAt yeni saldiriyi kilitler, dost toprakta yeniden konuslanmayi degil.
  if (!unit || !target || unit.battleId || unit.tile === target) return false;
  const path = findPath(world, unit.tile, target, {
    canEnter: game.canEnterFor(unit),
    costOf: game.costForUnit(unit),
    neighbors: (tile) => nodeNeighbors(world, tile),
  });
  if (!path?.length) return false;
  resetEntrenchment(unit);
  unit.path = [...path];
  unit.progress = 0;
  unit.reroutes = 0;
  return true;
}

/** Ordunun bu hafta yuruyebilir durumda olup olmadigi. */
function canWalk(game, unit) {
  return isMoving(unit)
    && unit.hp > 0
    && !unit.battleId
    && (unit.retreatUntil ?? 0) <= game.turns.turn;
}

/**
 * Bir sonraki kareye girisi dener.
 * @returns {'moved'|'blocked'|'battle'|'waiting'}
 */
function stepInto(game, unit, next) {
  // Savunma takviyesi hedefteki dost tumen nedeniyle "bos" bir kare gorur.
  // Fiziksel olarak province'e girmeden once suren muharebeye yazilmalidir.
  if (unitsOn(next).some((other) => other.battleId)) {
    clearPath(unit);
    return startBattle(game, unit, next) ? 'battle' : 'blocked';
  }

  const foe = unitsOn(next).find((other) => other.nationId !== unit.nationId);
  if (foe) {
    // Savastaysak carpisma muharebeye doner; degilsek sinir bizi durdurur.
    if (!unit.embarked && atWar(game.world, unit.nationId, foe.nationId)) {
      if ((unit.attackReadyAt ?? 0) > game.turns.turn) return 'waiting';
      if (game.attack(unit, next)) return 'battle';
      // General cadence'i veya organization henuz hazir degilse hedef unutulmaz.
      return 'waiting';
    }
    return 'blocked';
  }

  // Dost tumenler *birlesmez*: ayni province'i paylasirlar. Yigin doluysa
  // giris engellenir.
  if (stackFull(next)) return 'blocked';

  const wasAtSea = Boolean(unit.embarked);
  const conquered = game.enterTile(unit, next);
  noteSeaCrossing(game, unit, wasAtSea, next);
  // Dusman province'inde yuruyus biter: tumen ikmal kurmadan ayni hafta birden
  // cok kareyi yutup ince bir koridor acamaz.
  if (conquered) {
    clearPath(unit);
    return 'moved';
  }
  unit.path.shift();
  if (!unit.path.length) clearPath(unit);
  return 'moved';
}

/**
 * Biniş haftası tümene yazılır; oyuncunun tümeni karaya çıkınca bir not:
 * kıyıya varış sessizdi, oyuncu yolculuğun bittiğini haritadan sezmek
 * zorundaydı. Simülasyon bu alanı okumaz.
 */
function noteSeaCrossing(game, unit, wasAtSea, tile) {
  const turn = game.turns?.turn ?? game.world.turn ?? 0;
  if (!wasAtSea && unit.embarked) {
    unit.embarkedAt = turn;
    return;
  }
  if (!wasAtSea || unit.embarked) return;
  const since = unit.embarkedAt;
  delete unit.embarkedAt;
  if (unit.nationId !== game.turns?.playerNation) return;
  const weeks = since != null ? turn - since : null;
  game.turns.addLog(`${unit.type.name} landed at ${placeOf(game.world, tile)}${weeks > 0 ? ` after ${weeks} week${weeks === 1 ? '' : 's'} at sea` : ''}.`,
    { kind: 'ARMY', tier: 0, tile, key: 'landed' });
}

/**
 * Yol kapandiysa yeniden hesapla; olmuyorsa emri dusur.
 * Sayac `orderMove`den *sonra* geri yazilir: orderMove onu sifirliyor ve bu,
 * kapali bir yolda sonsuz yeniden-hesap dongusune yol aciyordu.
 */
function reroute(game, unit) {
  const target = destinationOf(unit);
  const tries = (unit.reroutes ?? 0) + 1;
  if (!target || tries > MAX_REROUTES) {
    clearPath(unit);
    return false;
  }
  const ok = orderMove(game, unit, target);
  unit.reroutes = tries;
  if (!ok) clearPath(unit);
  return ok;
}

/** Bir haftalik yuruyus. Haftalik tick'te bir kez cagrilir. */
export function advanceMovement(game) {
  const costOf = game.costForUnit();
  let moved = false;

  // Kopya uzerinde gez: muharebe birim listesini degistirebilir.
  for (const unit of [...game.world.units]) {
    if (!canWalk(game, unit)) continue;
    // Lojistikci komutanin grubu daha hizli yuruyur.
    const general = generalOfArmy(game.world.nations[unit.nationId], unit);
    let budget = speedOf(unit) + generalMarchBonus(general);

    while (budget > 0 && canWalk(game, unit)) {
      const next = unit.path[0];
      // Dusman dolu hedef canEnter'a gore kapali olsa da burada muharebeye
      // donusmelidir. Eski sirada yol iki kez hesaplanip sonra sessizce dusuyordu.
      const contested = unitsOn(next).some((other) => (
        other.nationId !== unit.nationId || other.battleId
      ));
      if (contested) {
        const result = stepInto(game, unit, next);
        if (result === 'battle') { moved = true; break; }
        if (result === 'waiting') break;
        if (!reroute(game, unit)) break;
        continue;
      }
      if (!game.canEnterFor(unit)(next)) {
        if (!reroute(game, unit)) break;
        continue;
      }
      // Alt sinir sart: birikmis ilerleme maliyeti asarsa need negatife duser
      // ve butce azalmak yerine buyur — dongu hic bitmez.
      const need = Math.max(0.01, Math.max(0.01, costOf(next, unit.tile)) - unit.progress);
      if (budget < need) {
        unit.progress += budget;
        budget = 0;
        break;
      }
      const result = stepInto(game, unit, next);
      if (result === 'battle') { moved = true; break; }
      if (result === 'waiting') break;
      if (result === 'blocked') {
        if (!reroute(game, unit)) break;
        continue;
      }
      budget -= need;
      unit.progress = 0;
      moved = true;
    }
  }

  if (moved) game.requestRender();
  return moved;
}
