// BİRLEŞME — Victoria 2'nin ulus inşası, sade hâli (TASARIM.md §10).
//
// Bölünmüş bir halkın devletleri iki yoldan birleşir:
//   SAVAŞ   soydaş province'i tutan ülkeye savaş gerekçesi ucuzdur
//           (diplomacy.hasClaimOn), barış masasında KURTARMA hedefi vardır.
//   BARIŞ   küçük soydaş devlet, güç farkı büyükse ve savaşta değilse
//           birleşme davetini kabul eder (SG bedeli, az şöhret).
// Ana yurdun %80'i tek elde toplanınca "BÜYÜK X" kurulur: ad, kalıcı fikir,
// prestij, ana yurdun hepsi çekirdek olur. Her halk için bir kez.

import { addIdea, refreshModifiers } from './modifiers.js';
import { addInfamy } from './infamy.js';
import { atWar } from './diplomacy.js';
import { disband } from './recruitment.js';

/** Büyük X için ana yurdun tutulması gereken payı. */
export const FORMATION_SHARE = 0.8;
/** Kurulabilir sayılmak için ana yurdun asgari province sayısı. */
export const FORMATION_MIN_PROVINCES = 5;
export const FORMATION_POWER = 100;
export const UNION_POWER = 120;
/** Barış birleşmesi için asgari nüfus oranı (biz / onlar). */
export const UNION_RATIO = 3;

function homeland(world, cultureId) {
  return (world.provinces ?? []).filter((p) => p.homeland === cultureId && p.econ);
}

/** Ana kültürün ana yurdunda nerede duruyoruz. */
export function unificationStatus(world, nation) {
  const provinces = homeland(world, nation.culture);
  const owned = provinces.filter((p) => p.owner === nation.id).length;
  const holders = new Set(provinces.map((p) => p.owner).filter((id) => id >= 0 && id !== nation.id));
  return {
    culture: world.cultures?.[nation.culture]?.name ?? 'our people',
    total: provinces.length,
    owned,
    share: provinces.length ? owned / provinces.length : 0,
    holders: [...holders],
    formed: world.formedNations?.[nation.culture] ?? null,
  };
}

export function formationBlockers(world, nation) {
  const status = unificationStatus(world, nation);
  const out = [];
  if (status.formed != null) return [status.formed === nation.id ? 'Already formed' : 'Another state claimed the name'];
  if (status.total < FORMATION_MIN_PROVINCES) out.push(`Homeland too small (${status.total} provinces)`);
  if (status.share < FORMATION_SHARE) {
    out.push(`Hold ${Math.round(FORMATION_SHARE * 100)}% of the ${status.culture} homeland (now ${Math.round(status.share * 100)}%)`);
  }
  if ((nation.power ?? 0) < FORMATION_POWER) out.push(`Needs ${FORMATION_POWER} political power`);
  return out;
}

/** BÜYÜK X: ad, kalıcı fikir, prestij; ana yurdun hepsi çekirdek olur. */
export function formNation(game, nation) {
  const world = game.world;
  if (formationBlockers(world, nation).length) return false;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  nation.power -= FORMATION_POWER;
  world.formedNations ??= {};
  world.formedNations[nation.culture] = nation.id;
  const cultureName = world.cultures?.[nation.culture]?.name ?? nation.name;
  nation.formerName = nation.fullName;
  nation.fullName = `Great ${cultureName} Empire`;
  nation.prestige = (nation.prestige ?? 0) + 50;
  for (const province of homeland(world, nation.culture)) province.coreOf = nation.id;
  addIdea(nation, 'unified-nation', `Unified ${cultureName} Nation`,
    { stability: 0.05, warSupport: 0.05, power: 0.25, research: 0.05 });
  refreshModifiers(nation, turn);
  game.turns?.addLog?.(`${nation.name} proclaims the ${nation.fullName}!`, { kind: 'NATION' });
  game.renderer?.invalidateCache?.();
  game.emit?.('politics', nation.id);
  return true;
}

/** Barışla katılabilecek soydaş devletler. */
export function unionCandidates(world, nation) {
  return world.nations.filter((other) => other.alive && other.id !== nation.id
    && other.culture === nation.culture && other.archetype !== 'rebel');
}

export function unionBlockers(world, nation, other, turn = world.turn ?? 0, playerId = -1) {
  const out = [];
  if (!other?.alive || other.culture !== nation.culture) return ['Not a kindred state'];
  if (other.id === playerId) out.push('They will not give up their crown');
  if (atWar(world, nation.id, other.id)) out.push('We are at war with them');
  const mine = nation.economy?.population ?? 0;
  const theirs = Math.max(1, other.economy?.population ?? 0);
  if (mine / theirs < UNION_RATIO) out.push(`We must be ${UNION_RATIO}× their size (now ${(mine / theirs).toFixed(1)}×)`);
  if ((other.treaties ?? []).some((t) => t.type === 'ALLIANCE' && (t.until ?? Infinity) > turn
    && (world.nations[t.partner]?.economy?.population ?? 0) > mine)) {
    out.push('A stronger ally guarantees their independence');
  }
  if ((nation.power ?? 0) < UNION_POWER) out.push(`Needs ${UNION_POWER} political power`);
  return out;
}

/** Barışla birleşme: bütün toprakları devredilir, devlet tarihe karışır. */
export function proposeUnion(game, nation, otherId) {
  const world = game.world;
  const other = world.nations[otherId];
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (unionBlockers(world, nation, other, turn, game.turns?.playerNation ?? -1).length) return false;
  nation.power -= UNION_POWER;
  for (const province of world.provinces ?? []) {
    if (province.owner === other.id && province.center) game.turns.claimAtPeace(province.center, nation.id);
  }
  // Ordusu terhis olur: askerler artık yeni devletin nüfusudur.
  for (const unit of [...world.units]) {
    if (unit.nationId === other.id) disband(game, unit);
  }
  addInfamy(nation, 2);
  nation.prestige = (nation.prestige ?? 0) + 10;
  game.turns?.addLog?.(`${other.name} joins ${nation.name} in a union of the ${world.cultures?.[nation.culture]?.name ?? ''} people.`,
    { kind: 'NATION' });
  game.renderer?.invalidateCache?.();
  return true;
}

/** YZ: ayda bir, uygunsa birleşme daveti ya da Büyük X. */
export function unificationAI(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if ((turn + nation.id) % 13 !== 0) return;
  if (!formationBlockers(world, nation).length && formNation(game, nation)) return;
  for (const other of unionCandidates(world, nation)) {
    if (other.id === game.turns?.playerNation) continue;
    if (!unionBlockers(world, nation, other, turn, game.turns?.playerNation ?? -1).length
      && proposeUnion(game, nation, other.id)) return;
  }
}
