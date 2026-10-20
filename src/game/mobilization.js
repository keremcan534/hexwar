// Seferberlik. Vic2 mantığı: barış ordusu küçüktür, savaşta yedek silah
// altına alınır ve barışta eve döner. Tek ulusal anahtar — tümen tümen
// düğme yok (bkz. TASARIM.md "ev ödevi testi").
//
// NEDEN VAR (ölçüldü, 2026-09-04): büyük ülkeler nüfusunun %1-3'ünü silah
// altında tutuyor, boş havuz ordunun ~40 katı; YZ yılda ~1 alay büyütüyor.
// 2.5-3.4× üstün komşu savaş açınca kurbanın ordusu savaş boyunca hiç
// büyümüyordu (3→3 alay). İnsan var, tempo yoktu.
//
// Bedeli üç kanaldan akar, hiçbiri burada yazılmaz:
//   - insan: alay province nüfusundan çıkar (claimSoldiers), tarla ve tezgah
//     boşalır, vergi düşer (econ/resources.js workforceShare)
//   - ikmal: alay faturası düzenli alayla aynıdır (econ/bills.js)
//   - teçhizat: her yedek alay depodan yarım tüfek takımı (5) çeker
// Seferber alay 0.7 güçle dövüşür (units.js CONSCRIPT_POWER).

import { UNIT_TYPES, isConscript, isMilitia, refreshArmy } from './units.js';
import { disband, nationManpower, recruit } from './recruitment.js';
import { claimSoldiers, occupiedShareOf } from './provinces.js';
import { releaseDraw } from './levy.js';
import { addTimedModifier } from './modifiers.js';
import { hostileNations, nationStrength } from './diplomacy.js';
import { underTreaty } from './peace.js';
import { addEquipment, takeEquipment } from './econ/industry.js';
import { CONSCRIPT_KIT, SUPPLY } from './econ/defs.js';
import { unitSupply } from './econ/bills.js';
import { TIER, announce } from './chronicle.js';

export const MOBILIZATION = {
  /** Kalan insan gücü havuzunun bu payı silah altına alınır. Havuz zaten
   * askerlik yasasının oranıdır (nüfusun %2-15'i). Yarısıyken seferberlik
   * ortanca 1 alaydı, nüfusun %0.6-0.9'u (221 seferberlik, ölçüldü; Kerem:
   * "seferberlik devasa olmalı"): %80'i çağırır, kalan takviyeye. */
  SHARE: 0.8,
  /** Yedek alay yarım tüfek takımıyla çıkar (eski tüfekler, ev silahı). */
  // Kura alayının tüfeği: kara kitleri üç katına çıkınca (econ/defs
  // UNIT_EQUIPMENT) seferberlik de aynı oranda depo yer.
  RIFLES: CONSCRIPT_KIT.rifles,
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

/**
 * CALL TO ARMS — levée en masse (TASARIM D6; Kerem: "seferberlik devasa
 * olmalı, halkı topyekûn savaşa sürüklemeli, son umut"). Yedek seferberliği
 * pratikte küçük bir takviyeydi: ortanca 1 alay, nüfusun %0.6-0.9'u; kaybeden
 * ülkenin havuzunda çağıracak adam kalmıyordu (ölçüldü, 221 seferberlik).
 * Levée askerlik havuzunu DEĞİL halkın kendisini çağırır: işgalsiz nüfusun
 * %8'i, her halktan tam oranda, milis olarak. Milis 0.4 güçle dövüşür, takviye
 * almaz, generale bağlanmaz, yalnız kendi toprağında yürür (saldırmaz, terk
 * edilmiş toprağı geri alır). Bedeli yorgunluk (+0.10 ve silah altındaki
 * insan), istikrar ve tebaanın sabrıdır (huzursuzluk, culture.js levee).
 */
export const LEVEE = {
  RATE: 0.08,
  CAP: 60,
  ARMY_RATIO: 3,
  ARMY_BASE: 6,
  PER_PROVINCE: 2,
  RAISE_WEEKS: 4,
  WEEKS: 104,
  COOLDOWN: 260,
  WILL: 0.55,
  OCCUPIED: 0.10,
  EXHAUSTION_MAX: 0.85,
  /** AUTO (oyuncunun kabinesi) yalnız çaresizken çağırır. */
  DIRE: 0.25,
  ORGANIZATION: 35,
  DESERT_AFTER: 26,
  DESERT_EXHAUSTION: 0.6,
  DESERT_RATE: 0.03,
  enabled: true,
};

const capitalLost = (world, nation) => {
  const tile = nation.capital;
  return Boolean(tile) && tile.controller != null && tile.controller !== nation.id;
};

export function leveeActive(nation) {
  return Boolean(nation?.mobilization?.levee?.active);
}

/** Levée'nin kuracağı milis alayı: işgalsiz nüfusun %8'i, ordunun 3 katı + 6, en çok 60. */
export function leveeTarget(world, nation) {
  let people = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    if (occupiedShareOf(world, province) > 0) continue;
    people += Math.max(0, province.econ.population ?? 0);
  }
  const byPeople = Math.floor(people * LEVEE.RATE / UNIT_TYPES.INFANTRY.manpower);
  const byArmy = standingRegiments(world, nation.id) * LEVEE.ARMY_RATIO + LEVEE.ARMY_BASE;
  return Math.max(0, Math.min(byPeople, byArmy, LEVEE.CAP));
}

export function leveeBlockers(world, nation, turn = world.turn ?? 0) {
  const out = [];
  if (!LEVEE.enabled) return ['Disabled.'];
  if (!hostileNations(world, nation.id).length) return ['Only in a war.'];
  if (leveeActive(nation)) return ['The nation is already in arms.'];
  const occupied = nation.economy?.occupiedShare ?? 0;
  if (occupied < LEVEE.OCCUPIED && !capitalLost(world, nation)) {
    out.push('Only when the enemy holds a tenth of our land or our capital.');
  }
  const will = nation.warSupport ?? 0;
  if (will < LEVEE.WILL) {
    out.push(`The people have lost the will to fight (war support ${Math.round(will * 100)}%, ${Math.round(LEVEE.WILL * 100)}% needed).`);
  }
  if ((nation.politics?.exhaustion ?? 0) >= LEVEE.EXHAUSTION_MAX) out.push('The nation is too exhausted to rise.');
  const last = nation.politics?.leveeAt;
  if (last != null && turn - last < LEVEE.COOLDOWN) out.push(`The nation was called to arms ${turn - last} weeks ago.`);
  if (underTreaty(nation, 'DEMILITARIZE', turn)) out.push('A demilitarization treaty forbids it.');
  if (!out.length && leveeTarget(world, nation) < 1) out.push('Too few free people to raise a single regiment.');
  return out;
}

/** Bütün ulusu silaha çağırır (iki tıklı karar; bkz. militaryScreen). */
export function callToArms(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (leveeBlockers(world, nation, turn).length) return false;
  const target = leveeTarget(world, nation);
  nation.mobilization ??= { active: false, since: turn, target: 0, raised: 0 };
  nation.mobilization.levee = { active: true, since: turn, until: turn + LEVEE.WEEKS, target, raised: 0, by: {} };
  if (nation.politics) nation.politics.leveeAt = turn;
  // Silah altındaki ulus topyekûn savaş ekonomisidir: fatura tavanı +%15
  // (ekonomiye el koyma kararıyla aynı). Yokken savaştaki ikmal krizi
  // haftalarının %60'ı levée açıkken geçiyordu (ölçüldü, audit:econ %19.8).
  addTimedModifier(nation, 'levee-strain', 'The nation in arms', 52, { stability: -0.05, obligationCap: 0.15 }, turn);
  addTimedModifier(nation, 'levee-rally', 'The nation in arms', 26, { warSupport: 0.10 }, turn);
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'ARMY', tier: TIER.MAJOR, key: 'levee',
      title: 'Call to Arms!',
      detail: `${target} militia regiments rise to defend the homeland over ${LEVEE.RAISE_WEEKS} weeks.`
        + ' They fight at 40% on our own soil and never attack.',
    });
  }
  return true;
}

/** Milis alayı halktan doğrudan çekilir: askerlik havuzu değil, province nüfusu. */
function raiseMilitia(game, nation, province) {
  const world = game.world;
  const men = UNIT_TYPES.INFANTRY.manpower;
  const econ = province.econ;
  const free = Math.max(0, (econ.population ?? 0) - (econ.soldiers ?? 0));
  if (free < men * 4) return null;
  const rows = province.cultures?.length ? province.cultures : [{ id: province.culture, share: 1 }];
  const by = {};
  econ.levied ??= {};
  for (const row of rows) {
    const take = men * row.share;
    by[row.id] = take;
    econ.levied[row.id] = (econ.levied[row.id] ?? 0) + take;
  }
  claimSoldiers(econ, men);
  const draw = { q: province.center.q, r: province.center.r, men, by };
  const unit = recruit(game, nation, 'INFANTRY', { source: province.center, charge: false, draws: [draw] });
  if (!unit) {
    releaseDraw(world, nation.id, draw, men);
    return null;
  }
  for (const regiment of unit.regiments) {
    regiment.militia = true;
    regiment.organization = LEVEE.ORGANIZATION;
    regiment.morale = LEVEE.ORGANIZATION;
  }
  refreshArmy(unit);
  // Konuşlanma karesi kendi toprağımız değilse (komşu boş kare) milis doğmaz.
  if (unit.tile?.owner !== nation.id) {
    disband(game, unit);
    return null;
  }
  return unit;
}

/** Milisin çıkacağı province'ler: işgal edilmiş kendi toprağına komşu olanlar önce. */
function leveeSources(world, nation) {
  const owned = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ
    && occupiedShareOf(world, p) === 0);
  const nearFront = (p) => (p.neighbors ?? []).some((id) => {
    const n = world.provinces[id];
    return n && n.owner === nation.id && occupiedShareOf(world, n) > 0;
  });
  return owned.sort((a, b) => (nearFront(b) - nearFront(a))
    || (b.econ.population ?? 0) - (a.econ.population ?? 0) || a.id - b.id);
}

export function militiaUnits(world, nationId) {
  return world.units.filter((unit) => unit.nationId === nationId && isMilitia(unit));
}

/** Haftalık levée: kurar, yorgunlukta firar eder, barışta ya da süresi dolunca dağılır. */
function runLevee(game, nation, record) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const levee = record.levee;
  const over = !hostileNations(world, nation.id).length || turn >= levee.until;
  if (levee.active && over) {
    levee.active = false;
    levee.endedAt = turn;
    if (nation.id === game.turns?.playerNation) {
      game.turns.addLog('The militia go home: the nation in arms stands down.', { kind: 'ARMY' });
    }
  }
  // Milis yalnız kendi toprağında durur: barış ya da kopuşla toprak el
  // değiştirince üstündeki milis evine döner (değişmez: harness "militia off
  // own soil"; ilk sürümde 78×62 × 10 yılda 20 ihlal, ölçüldü).
  for (const unit of militiaUnits(world, nation.id)) {
    if (!unit.battleId && unit.tile && unit.tile.owner !== nation.id) disband(game, unit);
  }
  if (levee.active) {
    const have = militiaUnits(world, nation.id).length;
    const perWeek = Math.max(1, Math.ceil(levee.target / LEVEE.RAISE_WEEKS));
    let raised = 0;
    for (const province of leveeSources(world, nation)) {
      if (have + raised >= levee.target || raised >= perWeek) break;
      if ((levee.by[province.id] ?? 0) >= LEVEE.PER_PROVINCE) continue;
      if (!raiseMilitia(game, nation, province)) continue;
      levee.by[province.id] = (levee.by[province.id] ?? 0) + 1;
      raised++;
    }
    levee.raised += raised;
    // Firar: yarım yıldan sonra tükenmiş ulusun milisi evine döner.
    if (turn - levee.since >= LEVEE.DESERT_AFTER
      && (nation.politics?.exhaustion ?? 0) > LEVEE.DESERT_EXHAUSTION) {
      for (const unit of militiaUnits(world, nation.id)) {
        if (unit.battleId) continue;
        for (const regiment of unit.regiments) {
          const loss = regiment.strength * LEVEE.DESERT_RATE;
          const share = loss / Math.max(1, regiment.strength);
          for (const draw of regiment.draws ?? []) releaseDraw(world, nation.id, draw, (draw.men ?? 0) * share);
          regiment.strength -= loss;
        }
        refreshArmy(unit);
      }
    }
    return true;
  }
  let held = 0;
  for (const unit of militiaUnits(world, nation.id)) {
    if (unit.battleId) {
      held++;
      continue;
    }
    disband(game, unit);
  }
  if (!held) delete record.levee;
  return held > 0;
}

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
  return Math.max(0, Math.min(byPeople, byArmy, mobilizationBySupply(world, nation)));
}

/**
 * Faturaların SAVAŞ fiyatıyla taşıyabileceği kura alayı: seferberlik ülkeyi
 * ikmal krizine itmez (econ/bills.js tavanı). Yokken savaştaki ulus-haftaların
 * %21'i krizdeydi (audit:econ, 78×62 × 10 yıl): yedek, besleyemeyeceği kadar
 * alay kuruyordu. Geçen haftanın faturalarından okunur.
 */
export function mobilizationBySupply(world, nation) {
  const bills = nation.economy?.bills;
  if (!bills) return Infinity;
  const toWar = SUPPLY.war / (bills.war || 1);
  const owedAtWar = (bills.army + bills.navy) * toWar + bills.schools + bills.martial + (bills.treaty ?? 0);
  const each = unitSupply(nation, 'land', world.turn ?? 0, true) * SUPPLY.conscript;
  return Math.max(0, Math.floor((bills.room - owedAtWar) / Math.max(1e-6, each)));
}

/**
 * Seferberliğin depodan isteyeceği tüfek. Otomatik hat barışta bunu da
 * biriktirir (industry.autoLineWeights): yedek, deposu dolu olduğu kadar
 * silahlanır — tüfek hattının barıştaki işi budur.
 */
export function mobilizationRifleReserve(world, nation) {
  return isMobilized(nation) ? 0 : mobilizationTarget(world, nation) * MOBILIZATION.RIFLES;
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
    blockers.push(mobilizationBySupply(world, nation) < 1
      ? 'The state cannot supply a single more regiment: its bills are at the ceiling.'
      : 'The manpower pool cannot fill a single regiment.');
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
 *
 * `options.delegated` (redesign D6, P1 dikişi): oyuncunun AUTO 'recruitment'
 * alanı `true` geçer. P6 levée'yi AUTO'da yalnız çaresizken (işgal ≥ %25 ya
 * da başkent düşmüş) çağırmak için okur ve o zaman `{ note: {text, why} }`
 * döndürür; ai.js notu olduğu gibi geçirir. Şimdilik okunmaz: YZ ve AUTO
 * aynı kararı verir, dönüş true/false.
 */
// eslint-disable-next-line no-unused-vars
export function manageMobilization(game, nation, options = {}) {
  const world = game.world;
  const foes = hostileNations(world, nation.id);
  if (!foes.length) return isMobilized(nation) ? demobilize(game, nation) : false;
  const mine = nationStrength(world, nation);
  const threat = foes.reduce((sum, foe) => sum + nationStrength(world, foe), 0);
  // SON UMUT: YZ işgal altında ve düşman daha güçlüyse; oyuncunun kabinesi
  // yalnız çaresizken (toprağın %25'i ya da başkent düştü) — kararın ağırlığı
  // oyuncunundur, kabine yalnız felakette ona vekâlet eder.
  if (!leveeBlockers(world, nation).length) {
    const dire = (nation.economy?.occupiedShare ?? 0) >= LEVEE.DIRE || capitalLost(world, nation);
    if (options.delegated ? dire : threat >= mine * 1.2) {
      const done = callToArms(game, nation);
      if (done && options.delegated) {
        return { note: { text: 'The nation was called to arms.', why: `The enemy holds ${Math.round((nation.economy?.occupiedShare ?? 0) * 100)}% of our land.` } };
      }
      if (done) return true;
    } else if (options.delegated && nation.mobilization) {
      nation.mobilization.leveeReady = true;
    }
  }
  if (isMobilized(nation)) return false;
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
    if (record.levee) runLevee(game, nation, record);
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
        // Yedek yarım takımla çıkar: depo boşsa seferberlik de durur — tüfek
        // hattı savaş öncesi hazırlığın asıl ölçüsüdür.
        if (takeEquipment(nation, { rifles: MOBILIZATION.RIFLES }) < 1) break;
        const unit = recruit(game, nation, 'INFANTRY', { charge: false });
        if (!unit) {
          addEquipment(nation, 'rifles', MOBILIZATION.RIFLES);
          break;
        }
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
    // Levée sürerken kayıt durur (milis ayrı sayılır, bkz. runLevee).
    if (!held && !record.levee) nation.mobilization = null;
  }
}
