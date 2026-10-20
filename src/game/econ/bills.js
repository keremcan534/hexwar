// FATURALAR — çıktının önünden düşen devlet giderleri (TASARIM.md §6).
//
// Ordu ve donanmanın ikmali, okullar ve sıkıyönetim her hafta çıktıdan
// önce ödenir. Eskiden ordu bakımı altın gelirinin %3-6'sıydı ve hiçbir
// şeyi sıkıştırmıyordu (istatistik panosu); şimdi her alay halkın ve
// kalkınmanın payından yer: büyük barış ordusu büyümeyi yavaşlatır.
//
// Faturalar çıktının en çok BILL_CAP'ini alabilir. Aşan ülke İKMAL KRİZİNDEDİR:
// her fatura aynı oranda (s) ödenir, ödenmeyen kısım silinir; takviye, eğitim
// ve düzen toparlanması `0.5 + 0.5·s` ile çarpılır, istikrar düşer. İflasın
// yerine geçer: 52 haftalık uçurum yok, faturalar sığdığı hafta biter.

import { BILL_CAP, POP_UNIT, SUPPLY } from './defs.js';
import { lawOption } from '../laws.js';
import { mod } from '../modifiers.js';
import { eraProgress } from '../calendar.js';

/**
 * Ulusun kara alayı ve gemi sayısı (gemiler filodadır, haritada değil).
 * Denizaltı yarım gemi, kura alayı yarım alay ikmali yer.
 */
export function regimentsOf(world, nation) {
  let land = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId !== nation.id) continue;
    if (!unit.regiments?.length) {
      land += 1;
      continue;
    }
    for (const regiment of unit.regiments) {
      land += regiment.militia ? SUPPLY.militia : regiment.conscript ? SUPPLY.conscript : 1;
    }
  }
  let sea = 0;
  for (const ship of nation.navy?.ships ?? []) sea += ship.kind === 'sub' ? SUPPLY.sub / SUPPLY.sea : 1;
  return { land, sea };
}

/** Alay başına ikmalin çağ çarpanı: 1900'de 1, 1945'te 1 + eraGrowth. */
export function supplyEra(turn) {
  return 1 + SUPPLY.eraGrowth * eraProgress(turn);
}

/** Bir alayın/geminin haftalık ikmali: `kind` 'land' | 'sea' | 'sub'; savaşta ×SUPPLY.war. */
export function unitSupply(nation, kind, turn, war = false) {
  const base = kind === 'sub' ? SUPPLY.sub : kind === 'sea' ? SUPPLY.sea : SUPPLY.land;
  return base * supplyEra(turn) * (war ? SUPPLY.war : 1) * Math.max(0.3, 1 + mod(nation, 'upkeep'));
}

/**
 * Barış şartı ödemesi: ödeyenin ÇIKTISININ payı, faturalara girer (tavana
 * tabi). Eskiden fondan ödeniyordu ve fon tabanını yok sayıyordu: tazminat
 * ödeyen ülkenin fonu beş yıl eksiye gidip ithalatı kesiyor, ulus-haftaların
 * %5'i tabanda kalıyordu (ölçüldü, 160×96 × 45 yıl). Alan ülkenin fonuna
 * turn.payTreaties yazar.
 */
export const TREATY_SHARE = { REPARATIONS: 0.1, VASSALIZE: 0.075 };

/** Faturaların çıktıdan alabileceği en büyük pay (kararla artar). */
export function billCap(nation) {
  return Math.max(0.1, BILL_CAP + mod(nation, 'obligationCap'));
}

/**
 * Bu haftanın faturaları. `output` haftanın toplam çıktısıdır; sıkıyönetim
 * hareket evresinde (movements.js) `economy.martialBill`e yazılır.
 */
export function billsOf(world, nation, output, turn = world.turn ?? 0) {
  const { land, sea } = regimentsOf(world, nation);
  const atWar = (nation.economy?.warFronts ?? 0) > 0;
  const war = atWar ? SUPPLY.war : 1;
  const era = supplyEra(turn);
  const mods = Math.max(0.3, 1 + mod(nation, 'upkeep'));
  const army = land * SUPPLY.land * era * war * mods;
  const navy = sea * SUPPLY.sea * era * war * mods;
  const schools = (nation.economy?.population ?? 0) / POP_UNIT * (lawOption(nation, 'education').cost ?? 0);
  const martial = Math.max(0, nation.economy?.martialBill ?? 0);
  const treaties = [];
  let treaty = 0;
  for (const entry of nation.treaties ?? []) {
    const share = TREATY_SHARE[entry.type];
    if (!share || (entry.until ?? Infinity) <= turn || !world.nations?.[entry.partner]?.alive) continue;
    const due = share * Math.max(0, output);
    treaties.push({ partner: entry.partner, owed: due });
    treaty += due;
  }
  const owed = army + navy + schools + martial + treaty;
  const room = Math.max(0, billCap(nation) * Math.max(0, output));
  const paid = Math.min(owed, room);
  const s = owed > 1e-9 ? paid / owed : 1;
  return {
    land, sea, war, era, mods, army, navy, schools, martial, treaty, treaties, owed, room, paid, s, atWar,
  };
}

/** İkmal krizinin çarpanı (takviye, eğitim, düzen): krizsiz 1, tam krizde 0.5. */
export function supplyFactor(nation) {
  const s = nation?.economy?.bills?.s ?? 1;
  return 0.5 + 0.5 * Math.max(0, Math.min(1, s));
}

/** Ulus ikmal krizinde mi (faturalar tavanı aştı)? */
export function inSupplyCrisis(nation) {
  return (nation?.economy?.bills?.s ?? 1) < 1 - 1e-6;
}

/**
 * Faturalara eklenebilecek pay (sıkıyönetim, yeni alay): geçen haftanın
 * tavanından ödenmiş olanı düşer. Krizdeki ülkenin payı yoktur.
 */
export function billHeadroom(nation) {
  const bills = nation?.economy?.bills;
  if (!bills) return Infinity;
  return Math.max(0, bills.room - bills.owed);
}
