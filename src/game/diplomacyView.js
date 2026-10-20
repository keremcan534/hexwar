// DİPLOMASİ GÖRÜNÜMÜ — diplomasi ekranının sayıları (DOM yok).
//
// Ekran eskiden 63 ulusluk bir isim listesiydi ve her satırda tek bir şey
// söylüyordu: savaş mı barış mı (Kerem: "diplomasi ekranı çok zayıf"). Bu
// döküm her ulus için oyuncunun kararını besleyen soruları oyunun KENDİ
// fonksiyonlarıyla cevaplar: ilişki (savaş, ültimatom, ateşkes, müttefik,
// rakip), komşu mu, güç oranı, ittifaka yanaşır mı (allianceAppeal — YZ'nin
// kendi ölçüsü), savaş gerekçesi ve bedeli (warDeclarationCost), ambargo.

import {
  MIN_WAR_TURNS, atWar, crisisLeft, hasClaimOn, inCrisis, nationStrength, overlordOf, relation, truceLeft,
  warBlockers, warDeclarationCost,
} from './diplomacy.js';
import { annexBlockers, annexCost } from './vassals.js';
import { MAX_ALLIES, allianceAppeal, alliesOf, isAllied } from './alliances.js';
import { warScore } from './peace.js';
import { INFAMY_COALITION } from './infamy.js';
import { borderNationIds } from './command.js';
import { embargoed } from './econ/trade.js';

/** İttifak teklifini YZ'nin kabul ettiği eşik (screens.js [data-ally] ile aynı). */
export const ALLY_APPEAL = 1.5;

/** İlişki sırası: önce ilgilendiğin ülkeler (ekran grupları bu sırayla). */
export const STANDINGS = ['war', 'crisis', 'ally', 'vassal', 'overlord', 'truce', 'rival', 'neighbour', 'other'];

/**
 * İttifak neden olmaz? allianceAppeal −Infinity döndüğünde (kesin engel) ya
 * da eşiğin altında kaldığında oyuncuya söylenecek tek cümle.
 */
function allyBlocker(world, me, other, appeal) {
  if (isAllied(me, other.id)) return 'Already allied.';
  if (atWar(world, me.id, other.id)) return 'You are at war.';
  if (me.rivalId === other.id || other.rivalId === me.id) return 'Rivals never ally.';
  if (alliesOf(me).length >= MAX_ALLIES) return `You already have ${MAX_ALLIES} allies.`;
  if (alliesOf(other).length >= MAX_ALLIES) return `They already have ${MAX_ALLIES} allies.`;
  if (appeal < ALLY_APPEAL) {
    return (me.infamy ?? 0) > 15 ? 'Your infamy frightens them.'
      : 'They see no reason: a shared enemy, rival or threatening neighbour would change that.';
  }
  return null;
}

export function diplomacyView(world, me, turn = world.turn ?? 0) {
  if (!me?.alive) return null;
  const myPower = Math.max(1, nationStrength(world, me));
  const neighbours = new Set(borderNationIds(world, me.id));
  const rows = [];
  for (const other of world.nations) {
    if (!other.alive || other.id === me.id) continue;
    const war = atWar(world, me.id, other.id);
    const crisis = !war && inCrisis(world, me.id, other.id);
    const truce = truceLeft(world, me.id, other.id, turn);
    const ally = isAllied(me, other.id);
    const rival = me.rivalId === other.id || other.rivalId === me.id;
    const neighbour = neighbours.has(other.id);
    const vassal = overlordOf(world, other.id, turn) === me.id;
    const overlord = overlordOf(world, me.id, turn) === other.id;
    const standing = war ? 'war' : crisis ? 'crisis' : ally ? 'ally' : vassal ? 'vassal' : overlord ? 'overlord'
      : truce > 0 ? 'truce' : rival ? 'rival' : neighbour ? 'neighbour' : 'other';
    // Karşı tarafın gözünden: bizimle ittifaka ne kadar yanaşır.
    const appeal = allianceAppeal(world, other, me);
    const power = nationStrength(world, other);
    rows.push({
      id: other.id,
      name: other.name,
      color: other.color,
      standing,
      neighbour,
      rival,
      rivalOfUs: other.rivalId === me.id,
      ratio: power / myPower,
      claim: hasClaimOn(world, me.id, other.id),
      warCost: warDeclarationCost(world, me.id, other.id),
      // İlanı ne engelliyor: düğme sessizce reddetmesin, nedenini söylesin.
      warBlockers: war || crisis ? [] : warBlockers(world, me.id, other.id, turn),
      annexCost: vassal ? annexCost(world, other) : null,
      annexBlockers: vassal ? annexBlockers(world, me, other, turn) : null,
      truce,
      crisis: crisis ? crisisLeft(world, me.id, other.id, turn) : 0,
      score: war ? warScore(world, me.id, other.id) : null,
      // Barış masası savaşın ilk MIN_WAR_TURNS haftasında açılmaz.
      talksIn: war ? Math.max(0, MIN_WAR_TURNS - (turn - (relation(world, me.id, other.id)?.since ?? turn))) : null,
      appeal: Number.isFinite(appeal) ? appeal : null,
      allyBlocker: ally || war ? null : allyBlocker(world, me, other, Number.isFinite(appeal) ? appeal : -Infinity),
      embargoByUs: (me.embargoes ?? []).includes(other.id),
      embargoByThem: (other.embargoes ?? []).includes(me.id),
      trades: !embargoed(world, me.id, other.id),
      infamy: other.infamy ?? 0,
      tiles: other.tiles ?? 0,
    });
  }
  // Grup sırası, grup içinde güçlüden zayıfa; eşitlikte kimlik (sabit sıra).
  rows.sort((a, b) => STANDINGS.indexOf(a.standing) - STANDINGS.indexOf(b.standing)
    || b.ratio - a.ratio || a.id - b.id);
  const count = (standing) => rows.filter((row) => row.standing === standing).length;
  return {
    infamy: me.infamy ?? 0,
    infamyCap: INFAMY_COALITION,
    wars: count('war'),
    crises: count('crisis'),
    allies: alliesOf(me).length,
    maxAllies: MAX_ALLIES,
    truces: count('truce'),
    embargoes: (me.embargoes ?? []).length,
    rival: me.rivalId != null ? world.nations[me.rivalId]?.name ?? null : null,
    rivalsOfUs: rows.filter((row) => row.rivalOfUs).map((row) => row.name),
    neighbours: neighbours.size,
    rows,
  };
}

