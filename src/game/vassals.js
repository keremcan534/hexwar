// VASSALLAR — efendinin vassalıyla yapabileceği iki iş (TASARIM.md §10).
//
// Barış masasında VASSALIZE alınınca çift kalıcı barışa bağlanır
// (diplomacy.warBlockers): efendi vassalına savaş ilan edemez. Eskiden bu bir
// çıkmazdı — vassallığı bitirmenin de, vassalı yutmanın da yolu yoktu, düğme
// etkin görünüp ilan sessizce reddediliyordu (Kerem 2026-10-15, Ravoya).
//   BIRAK    anlaşma düşer; vassal bağımsızdır, istersen sonra savaşırsın.
//   İLHAK    HOI4'ün kuklayı yutması: SG bedeli, en az iki yıllık bağ, ikimiz
//            de barıştayken. Yabancı halkı içeri alır (hareketler büyür) ve
//            masadaki ilhakın dörtte biri kadar şöhret yazar.
// YZ bu iki kapıyı kullanmaz: sınır dinamiğine yeni kanal açmadan önce ölçmek
// gerekir (audit:borders).

import { atWar, overlordOf } from './diplomacy.js';
import { endVassalage } from './peace.js';
import { addInfamy, provinceAnnexInfamy } from './infamy.js';
import { disband } from './recruitment.js';
import { TIER, announce, remember } from './chronicle.js';

export const ANNEX = {
  POWER_BASE: 40,
  POWER_PER_PROVINCE: 4,
  /**
   * Bağ en az bu kadar sürmeli: yoksa masada 65 puanlık VASSALIZE alıp
   * ertesi hafta ilhak etmek, toprak taleplerinin şöhret ve puan bedelini
   * atlayan bir kestirme olurdu.
   */
  MIN_WEEKS: 104,
  /**
   * Masadaki ilhakın şöhret payı: diplomatik yutma fetihten az ürkütür ama
   * bedava değildir. 0.5'te 12 province'lik yabancı vassal tek başına 18
   * yazıyordu (eşik 22): bağı iki yıl sürmüş bir vassalı almak koalisyon
   * çağırmamalı.
   */
  INFAMY_SHARE: 0.25,
};

const turnOf = (game) => game.turns?.turn ?? game.world.turn ?? 0;

function treatyOf(vassal, overlordId) {
  return (vassal?.treaties ?? []).find((t) => t.type === 'VASSALIZE' && t.partner === overlordId) ?? null;
}

function provincesOf(world, nationId) {
  return (world.provinces ?? []).filter((p) => p.owner === nationId && p.econ && p.center);
}

/** Bu efendinin yaşayan vassalları (kimlik sırasıyla). */
export function vassalsOf(world, overlordId, turn = world.turn ?? 0) {
  return world.nations.filter((n) => n.alive && overlordOf(world, n.id, turn) === overlordId);
}

export function annexCost(world, vassal) {
  return ANNEX.POWER_BASE + ANNEX.POWER_PER_PROVINCE * provincesOf(world, vassal.id).length;
}

export function annexBlockers(world, overlord, vassal, turn = world.turn ?? 0) {
  if (!vassal?.alive || overlordOf(world, vassal.id, turn) !== overlord.id) return ['Not our vassal'];
  const out = [];
  const held = turn - (treatyOf(vassal, overlord.id)?.since ?? turn);
  if (held < ANNEX.MIN_WEEKS) out.push(`Bound for ${held} weeks: annexation needs ${ANNEX.MIN_WEEKS}`);
  // Birleşmeyle aynı kural: savaşın ortasında devlet el değiştirmez, yoksa
  // vassalın işgal ettiği ya da kaybettiği toprak ganimetsiz kayar.
  const fighting = (n) => world.nations.some((o) => o.alive && o.id !== n.id && atWar(world, n.id, o.id));
  if (fighting(overlord)) out.push('We are at war: annexation waits for the peace');
  if (fighting(vassal)) out.push('They are at war: annexation waits for the peace');
  const cost = annexCost(world, vassal);
  if ((overlord.power ?? 0) < cost) out.push(`Needs ${cost} political power`);
  return out;
}

/** Vassallığı bitirir; bağımsız devlet kalır. Bedeli yoktur, şöhret de yazmaz. */
export function releaseVassal(game, overlord, vassalId) {
  const world = game.world;
  const vassal = world.nations[vassalId];
  if (!vassal?.alive || !treatyOf(vassal, overlord.id)) return false;
  vassal.treaties = vassal.treaties.filter((t) => !(t.type === 'VASSALIZE' && t.partner === overlord.id));
  const turn = turnOf(game);
  remember(overlord, turn, 'vassal_released', vassal.id);
  remember(vassal, turn, 'vassal_released', overlord.id);
  announce(game, overlord, {
    kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `vassal-free:${vassal.id}`,
    title: `${vassal.name} is no longer our vassal`,
    detail: 'The tribute stops; they answer to no one now.',
  });
  game.emit?.('diplomacy');
  return true;
}

/** Vassalı yutar: bütün province'leri devredilir, ordusu terhis olur. */
export function annexVassal(game, overlord, vassalId) {
  const world = game.world;
  const vassal = world.nations[vassalId];
  const turn = turnOf(game);
  if (annexBlockers(world, overlord, vassal, turn).length) return false;
  const provinces = provincesOf(world, vassal.id);
  // Şöhret devirden ÖNCE ölçülür: provinceAnnexInfamy halkı ve yurdu
  // yeni sahibin kabul ettikleriyle karşılaştırır.
  let infamy = 0;
  for (const province of provinces) infamy += provinceAnnexInfamy(world, province, overlord);
  overlord.power -= annexCost(world, vassal);
  // Vassalın kendi vassalları serbest kalır: zincir ilhakla devralınmaz.
  endVassalage(world, vassal.id);
  vassal.treaties = vassal.treaties.filter((t) => !(t.type === 'VASSALIZE' && t.partner === overlord.id));
  for (const province of provinces) game.turns.claimAtPeace(province.center, overlord.id);
  // Askerleri yeni devletin nüfusudur (birleşmedeki gibi).
  for (const unit of [...world.units]) {
    if (unit.nationId === vassal.id) disband(game, unit);
  }
  addInfamy(overlord, infamy * ANNEX.INFAMY_SHARE);
  remember(overlord, turn, 'took_land_from', vassal.id);
  announce(game, overlord, {
    kind: 'NATION', tier: TIER.MAJOR, key: `vassal-annex:${vassal.id}`,
    title: `${vassal.name} is annexed`,
    detail: `${provinces.length} provinces join us; their peoples are now ours to keep.`,
  });
  game.renderer?.invalidateCache?.();
  game.emit?.('diplomacy');
  return true;
}
