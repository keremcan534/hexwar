// Seferberlik. Vic2 mantığı: barış ordusu küçüktür, savaşta yedek silah
// altına alınır ve barışta eve döner. Tek ulusal anahtar — tümen tümen
// düğme yok (bkz. VICTORIA_LITE.md "ev ödevi testi").
//
// NEDEN VAR (ölçüldü, 2026-09-04): büyük ülkeler nüfusunun %1-3'ünü silah
// altında tutuyor, boş havuz ordunun ~40 katı; YZ yılda ~1 alay büyütüyor.
// 2.5-3.4× üstün komşu savaş açınca kurbanın ordusu savaş boyunca hiç
// büyümüyordu (3→3 alay). İnsan var, tempo yoktu.
//
// Bedeli üç kanaldan akar, hiçbiri burada yazılmaz:
//   - insan: alay province nüfusundan çıkar (claimSoldiers), tarla ve tezgah
//     boşalır (rgoLaborScale / civilianLower zaten silah altındakini düşer)
//   - para: alay bakımı düzenli alayla aynıdır (cities.js UNIT_UPKEEP)
//   - istikrar: seferberlik savaş yüküne 0.35 ekler (economy.js warStrain)
// Seferber alay 0.7 güçle dövüşür (units.js CONSCRIPT_POWER).

import { UNIT_TYPES, isConscript, refreshArmy } from './units.js';
import { disband, nationManpower, recruit } from './recruitment.js';
import { hostileNations, nationStrength } from './diplomacy.js';
import { underTreaty } from './peace.js';
import { TIER, announce } from './chronicle.js';

export const MOBILIZATION = {
  /** Havuzun bu payı silah altına alınır. 0.06 × ~12M havuz ≈ 24 alay: büyük
   * devlette barış ordusunun iki katı; 3 alaylık mikro devlette 0. */
  SHARE: 0.06,
  /** Tam seferberlik bu kadar haftada tamamlanır — ültimatom süresine eşit
   * (diplomacy.js ULTIMATUM_WEEKS): ilanda seferber olan, ilk çatışmaya yetişir. */
  RAISE_WEEKS: 8,
  /**
   * Yedek, düzenli ordunun en fazla bu katı kadar olur (+2 alay taban).
   * Havuz payı tek başına yetmedi — ölçüldü (bully BULLY-1): 26 kümelik
   * devlet 10 alaylık ordusuna 41 yedek ekledi, cephe üç yıl dondu. Vic2'de
   * seferberlik orduyu 2-3 katına çıkarır, beş katına değil.
   */
  MAX_RATIO: 2,
  /** Yedek düzensiz çıkar; hafta hafta toparlar. */
  ORGANIZATION: 55,
  /** YZ, düşman gücü kendi gücünün bu katını aşınca seferber olur. */
  AI_THREAT: 0.6,
};

export function isMobilized(nation) {
  return Boolean(nation?.mobilization?.active);
}

export function conscriptUnits(world, nationId) {
  return world.units.filter((unit) => unit.nationId === nationId && isConscript(unit));
}

/** Düzenli kara alayı sayısı (yedek hariç): seferberlik tavanının ölçüsü. */
function standingRegiments(world, nationId) {
  let count = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nationId || unit.type.domain !== 'land' || isConscript(unit)) continue;
    count += unit.regiments?.length ?? 1;
  }
  return count;
}

/**
 * Seferberliğin kuracağı alay sayısı: havuz payı / piyade alayının insan
 * gücü, düzenli ordunun MAX_RATIO katıyla sınırlı. Havuz insanı, ordu
 * kadroyu verir — ikisinin küçüğü.
 */
export function mobilizationTarget(world, nation) {
  const pool = nationManpower(world, nation.id);
  const byPeople = Math.floor(pool * MOBILIZATION.SHARE / UNIT_TYPES.INFANTRY.manpower);
  const byArmy = standingRegiments(world, nation.id) * MOBILIZATION.MAX_RATIO + 2;
  return Math.max(0, Math.min(byPeople, byArmy));
}

/** Seferberliği engelleyen ne varsa, sırayla. Boş dizi = açılabilir. */
export function mobilizationBlockers(world, nation, turn = world.turn ?? 0) {
  const blockers = [];
  if (!hostileNations(world, nation.id).length) {
    blockers.push('Only during an ultimatum or a war.');
  }
  if (underTreaty(nation, 'DEMILITARIZE', turn)) {
    blockers.push('A demilitarization treaty forbids it.');
  }
  if (mobilizationTarget(world, nation) < 1) {
    blockers.push('The manpower pool cannot fill a single regiment.');
  }
  return blockers;
}

export function canMobilize(world, nation, turn = world.turn ?? 0) {
  return Boolean(nation?.alive) && !isMobilized(nation)
    && mobilizationBlockers(world, nation, turn).length === 0;
}

/**
 * Seferberliği açar. Hedef İLAN ANINDA saptanır ve saklanır: her kurulan alay
 * havuzu kendi kadar küçültür, hedefi her hafta yeniden hesaplamak seferberliği
 * yarıda keserdi.
 */
export function mobilize(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (!canMobilize(world, nation, turn)) return false;
  const target = mobilizationTarget(world, nation);
  nation.mobilization = { active: true, since: turn, target, raised: 0 };
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'ARMY', tier: TIER.MAJOR, key: 'mobilization',
      title: 'General mobilization',
      detail: `${target} conscript regiments arm over ${MOBILIZATION.RAISE_WEEKS} weeks.`
        + ' They fight at 70% and go home when the last war ends.',
    });
  }
  return true;
}

/** Terhis kararı: alaylar hemen değil, haftalık işleyişte dağılır (muharebedeki bekler). */
export function demobilize(game, nation) {
  const record = nation?.mobilization;
  if (!record?.active) return false;
  record.active = false;
  record.endedAt = game.turns?.turn ?? game.world.turn ?? 0;
  return true;
}

/**
 * YZ kararı. Oyuncu ile aynı kapıdan geçer (mobilize/demobilize); gizli
 * tavan yok. Tehdit, savaşta ya da ültimatomda olduğu ülkelerin toplam gücü.
 */
export function manageMobilization(game, nation) {
  const world = game.world;
  const foes = hostileNations(world, nation.id);
  if (!foes.length) return isMobilized(nation) ? demobilize(game, nation) : false;
  if (isMobilized(nation)) return false;
  const mine = nationStrength(world, nation);
  const threat = foes.reduce((sum, foe) => sum + nationStrength(world, foe), 0);
  if (threat < mine * MOBILIZATION.AI_THREAT) return false;
  return mobilize(game, nation);
}

/**
 * Haftalık işleyiş: açık seferberlik alay kurar, kapanan seferberlik alay
 * dağıtır. Son düşman da gidince seferberlik kendiliğinden kapanır — yedek
 * barışta silah altında tutulamaz (istikrar bedeli ödenmeye devam ederdi
 * ama oyuncunun "unuttum" demesine gerek kalmasın).
 */
export function runMobilization(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  for (const nation of world.nations) {
    const record = nation.mobilization;
    if (!record) continue;
    if (!nation.alive) {
      nation.mobilization = null;
      continue;
    }
    if (record.active
      && (!hostileNations(world, nation.id).length || underTreaty(nation, 'DEMILITARIZE', turn))) {
      record.active = false;
      record.endedAt = turn;
      if (nation.id === game.turns?.playerNation) {
        game.turns.addLog('The reserve stands down; conscript regiments go home.', { kind: 'ARMY' });
      }
    }
    if (record.active) {
      const have = conscriptUnits(world, nation.id).length;
      const perWeek = Math.max(1, Math.ceil(record.target / MOBILIZATION.RAISE_WEEKS));
      let raised = 0;
      while (have + raised < record.target && raised < perWeek) {
        // Teçhizat düşülmez: yedek depodan değil evden gelir. Ateş gücü
        // zaten CONSCRIPT_POWER ile kırpılı; hazırlık (arms/reserve) çarpanı
        // muharebede herkese uygulanır.
        const unit = recruit(game, nation, 'INFANTRY', { charge: false });
        if (!unit) break;
        for (const regiment of unit.regiments) {
          regiment.conscript = true;
          regiment.organization = MOBILIZATION.ORGANIZATION;
          regiment.morale = MOBILIZATION.ORGANIZATION;
        }
        refreshArmy(unit);
        raised++;
      }
      record.raised = (record.raised ?? 0) + raised;
      continue;
    }
    // Terhis: muharebedeki tümen bir sonraki haftaya kalır.
    let held = 0;
    for (const unit of conscriptUnits(world, nation.id)) {
      if (unit.battleId) {
        held++;
        continue;
      }
      disband(game, unit);
    }
    if (!held) nation.mobilization = null;
  }
}
