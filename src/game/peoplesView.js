// HALKLAR EKRANININ TEK KAYNAĞI — Population ekranı yalnız bunu basar.
//
// Eski ekran üç satırlık halk listesi, sebebi yazılmamış bir huzursuzluk
// listesi ve hiçbir bilgi taşımayan "Propose union" düğmeleriydi (Kerem:
// "population ekranı da zayıf kaldı"). Oyunun elinde fazlası vardı: huzursuzluk
// dökümü (culture.unrestBreakdown), ulusal hareketler (movements.movementView),
// büyüme çarpanları (provinces.growthFactors). Burada tek dökümde toplanır.
//
// KABUL ÖNİZLEMESİ (arayüz ilkesi: basmadan önce sonucu göster): halk geçici
// olarak kabul edilmiş sayılır, oyunun kendi formülü (nationManpower,
// unrestBreakdown) yeniden okunur, liste birebir geri konur.
//
// Katman: game. DOM yok.

import {
  ACCEPT_POWER, CULTURE, acceptBlockers, acceptedCultures, cultureMix,
  releaseBlockers, unrestBreakdown,
} from './culture.js';
import {
  POLICY, concentrateBlockers, deportBlockers, deportDestinations, deportInfamy, emptiedProvinces,
  forceBlockers, forcedAssimilation, reservationFor, resettleBlockers, resettlementPlan,
} from './culturePolicy.js';
import { movementView } from './movements.js';
import { nationManpower } from './recruitment.js';
import { growthFactors, occupiedShareOf, provinceName } from './provinces.js';
import { UNION_POWER, UNION_RATIO, unionBlockers, unionCandidates, unificationStatus } from './unification.js';

/** Huzursuzluk dökümünün oyuncuya okunan adları (artı yönde besleyenler). */
const CAUSES = [
  ['culture', 'Foreign rule'],
  ['conquest', 'Fresh conquest'],
  ['war', 'War weariness'],
  ['occupation', 'Occupation'],
  ['backlash', 'Backlash'],
  ['levy', 'Unequal levy'],
  ['reservation', 'Reservation'],
  ['forced', 'Forced assimilation'],
];
/** Eksi yönde yatıştıranlar. */
const RELIEFS = [
  ['welfare', 'Consumer goods'],
  ['rights', 'Minority rights'],
  ['focus', 'Integration focus'],
];

function atPeace(world, nation) {
  const row = world.relations?.[nation.id];
  if (!row) return true;
  return !world.nations.some((other) => other.alive && other.id !== nation.id && row[other.id]?.state === 'war');
}

function shareIn(province, cultureId) {
  const rows = province.cultures;
  if (!rows?.length) return province.culture === cultureId ? 1 : 0;
  return rows.find((row) => row.id === cultureId)?.share ?? 0;
}

/** Halkın yaşadığı state'lerde nüfus ağırlıklı huzursuzluk HEDEFİ. */
function targetUnrest(world, nation, provinces, cultureId, turn) {
  let weighted = 0;
  let people = 0;
  for (const province of provinces) {
    const weight = Math.max(1, province.econ.population ?? 0) * shareIn(province, cultureId);
    if (weight <= 0) continue;
    const parts = unrestBreakdown(world, province, nation, { occupied: occupiedShareOf(world, province), turn });
    weighted += parts.target * weight;
    people += weight;
  }
  return people > 0 ? weighted / people : 0;
}

/**
 * Kabul etmenin getirisi, oyunun kendi formülüyle: asker havuzu ve halkın
 * state'lerindeki huzursuzluk hedefi önce/sonra. Kabul listesi birebir geri
 * konur (alan hiç yoksa silinir).
 */
function acceptPreview(world, nation, cultureId, provinces, turn) {
  const had = Object.prototype.hasOwnProperty.call(nation, 'accepted');
  const saved = nation.accepted;
  const before = { recruits: nationManpower(world, nation.id), unrest: targetUnrest(world, nation, provinces, cultureId, turn) };
  nation.accepted = [...acceptedCultures(nation), cultureId];
  let after;
  try {
    after = { recruits: nationManpower(world, nation.id), unrest: targetUnrest(world, nation, provinces, cultureId, turn) };
  } finally {
    if (had) nation.accepted = saved;
    else delete nation.accepted;
  }
  return {
    recruits: Math.max(0, after.recruits - before.recruits),
    unrestFrom: before.unrest,
    unrestTo: after.unrest,
    power: ACCEPT_POWER,
    backlash: CULTURE.BACKLASH_UNREST,
    backlashWeeks: CULTURE.BACKLASH_WEEKS,
  };
}

/**
 * Ekranın bütün sayıları. `limit` huzursuz state listesinin boyu.
 */
export function peoplesView(world, nation, turn, { limit = 10 } = {}) {
  const own = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ);
  const mix = cultureMix(world, nation);
  const movements = movementView(world, nation);
  const moveOf = new Map(movements.map((row) => [row.cultureId, row]));

  // Huzursuz state'ler, sebepleriyle.
  const restless = [];
  let weighted = 0;
  let people = 0;
  let boiling = 0;
  for (const province of own) {
    const econ = province.econ;
    const unrest = econ.unrest ?? 0;
    const size = Math.max(0, econ.population ?? 0);
    weighted += unrest * size;
    people += size;
    if (unrest >= CULTURE.REVOLT_UNREST) boiling++;
    if (unrest < 0.5) continue;
    const parts = unrestBreakdown(world, province, nation, { occupied: occupiedShareOf(world, province), turn });
    const causes = CAUSES.map(([key, label]) => ({ label, value: parts[key] * parts.policy }))
      .filter((c) => c.value > 0.05).sort((a, b) => b.value - a.value);
    const reliefs = RELIEFS.map(([key, label]) => ({ label, value: -parts[key] * parts.policy }))
      .filter((c) => c.value < -0.05);
    restless.push({
      id: province.id,
      center: province.center,
      name: provinceName(province.center),
      culture: province.culture,
      unrest,
      target: parts.target,
      causes,
      reliefs,
      compliance: econ.control ?? 0,
      foreign: parts.foreign,
    });
  }
  restless.sort((a, b) => b.unrest - a.unrest || a.id - b.id);

  // Halklar: nerede yaşıyor, ne kadar huzursuz, hareketi var mı, kabul ne getirir.
  const peoples = mix.map((row) => {
    const homes = own.filter((p) => shareIn(p, row.id) > 0.01);
    let unrestW = 0;
    let weight = 0;
    for (const province of homes) {
      const w = (province.econ.population ?? 0) * shareIn(province, row.id);
      unrestW += (province.econ.unrest ?? 0) * w;
      weight += w;
    }
    const movement = moveOf.get(row.id) ?? null;
    return {
      ...row,
      color: world.cultures?.[row.id]?.color ?? '#888',
      majority: homes.filter((p) => p.culture === row.id).length,
      states: homes.length,
      homeland: own.filter((p) => p.homeland === row.id).length,
      unrest: weight > 0 ? unrestW / weight : 0,
      movement,
      accept: row.accepted ? null : {
        blockers: acceptBlockers(world, nation, row.id, turn),
        preview: acceptPreview(world, nation, row.id, homes, turn),
      },
      release: row.accepted ? null : { blockers: releaseBlockers(world, nation, row.id) },
      expel: row.accepted ? null : { blockers: deportBlockers(world, nation, row.id) },
    };
  });

  // Büyüme: ulusun nüfus ağırlıklı kalkınmasıyla (başkentinki değil — o
  // ülkenin en kalkınmış yeri, oranı şişiriyordu) + gerçekleşen yıllık oran.
  const growth = growthFactors(nation, { development: nation.economy?.development ?? 1 }, { peace: atPeace(world, nation) });
  const history = nation.economy?.history ?? [];
  const last = history[history.length - 1];
  const yearAgo = history.length > 52 ? history[history.length - 53] : history[0];
  const realized = last && yearAgo && yearAgo.population > 0 && last.turn > yearAgo.turn
    ? (last.population / yearAgo.population) ** (52 / (last.turn - yearAgo.turn)) - 1 : null;

  // Birleşme: soydaş devletler, oranla.
  const status = unificationStatus(world, nation);
  const mine = nation.economy?.population ?? 0;
  const unions = unionCandidates(world, nation).map((other) => {
    const theirs = Math.max(1, other.economy?.population ?? 0);
    return {
      id: other.id,
      name: other.name,
      population: theirs,
      ratio: mine / theirs,
      need: UNION_RATIO,
      power: UNION_POWER,
      blockers: unionBlockers(world, nation, other, turn, -1),
    };
  }).sort((a, b) => b.ratio - a.ratio);

  return {
    peoples,
    movements: movements.filter((row) => row.progress > 0.5 || row.trend > 0),
    restless: restless.slice(0, limit),
    restlessMore: Math.max(0, restless.length - limit),
    unrest: people > 0 ? weighted / people : 0,
    boiling,
    revoltAt: CULTURE.REVOLT_UNREST,
    growth,
    realized,
    history: history.map((h) => h.population),
    status,
    unions,
  };
}

/**
 * SEÇİLİ HALK (Cultures ekranı): nerede yaşar, soydaşı kim, dört politikanın
 * engelleri ve önizlemesi. Sayılar culturePolicy'nin kendi fonksiyonlarından
 * gelir; ekran formül kurmaz.
 */
export function peopleDetail(world, nation, cultureId, turn = world.turn ?? 0) {
  const own = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ);
  const row = cultureMix(world, nation).find((item) => item.id === cultureId);
  if (!row) return null;
  const homes = own.map((province) => {
    const share = shareIn(province, cultureId);
    return {
      id: province.id,
      name: provinceName(province.center),
      people: Math.round((province.econ.population ?? 0) * share),
      share,
      majority: province.culture === cultureId,
      unrest: province.econ.unrest ?? 0,
      homeland: province.homeland === cultureId,
      focus: province.econ.focus ?? null,
      reservation: province.econ.reservation === cultureId,
    };
  }).filter((home) => home.people > 0).sort((a, b) => b.people - a.people || a.id - b.id);
  const people = homes.reduce((sum, home) => sum + home.people, 0);
  const kin = world.nations.filter((other) => other.alive && other.id !== nation.id && other.culture === cultureId)
    .map((other) => ({ id: other.id, name: other.name }));
  const destinations = deportDestinations(world, nation, cultureId).slice(0, 3)
    .map((id) => ({ id, name: world.nations[id]?.name ?? '?', kin: world.nations[id]?.culture === cultureId }));
  const reservation = reservationFor(world, nation, cultureId);
  const confined = reservation ? homes.filter((home) => home.id !== reservation.id).reduce((sum, home) => sum + home.people, 0) : 0;
  // Zorla asimilasyon: yılda eriyecek insan (haftalık oran × 52) ve o halkın
  // yaşadığı yerlerde huzursuzluk hedefine eklenecek ortalama.
  const forcedUnrest = people > 0
    ? homes.reduce((sum, home) => sum + home.share * CULTURE.FORCED_UNREST * home.people, 0) / people : 0;
  return {
    id: cultureId,
    name: world.cultures?.[cultureId]?.name ?? '?',
    color: world.cultures?.[cultureId]?.color ?? '#888',
    accepted: row.accepted,
    primary: row.primary,
    share: row.share,
    people,
    homes,
    kin,
    focusStates: homes.filter((home) => home.focus === 'assimilate').length,
    forced: forcedAssimilation(nation, cultureId),
    force: {
      blockers: forceBlockers(world, nation, cultureId),
      yearly: Math.round(people * (1 - (1 - CULTURE.FORCED_RATE) ** 52)),
      unrest: forcedUnrest,
      infamy: POLICY.FORCED_INFAMY,
    },
    deport: {
      blockers: deportBlockers(world, nation, cultureId),
      destinations,
      infamy: deportInfamy(people),
    },
    confine: {
      blockers: concentrateBlockers(world, nation, cultureId),
      target: reservation ? { id: reservation.id, name: provinceName(reservation.center) } : null,
      people: confined,
      infamy: deportInfamy(confined) / 2,
      unrest: CULTURE.RESERVATION_UNREST,
    },
    release: { blockers: releaseBlockers(world, nation, cultureId) },
    accept: row.accepted ? null : {
      blockers: acceptBlockers(world, nation, cultureId, turn),
      preview: acceptPreview(world, nation, cultureId, own.filter((p) => shareIn(p, cultureId) > 0.01), turn),
    },
  };
}

/** Boşalan province'ler ve iskân planı (Cultures ekranı). */
export function resettlementView(world, nation) {
  const emptied = emptiedProvinces(world, nation).map((province) => ({
    id: province.id,
    name: provinceName(province.center),
    population: province.econ.population ?? 0,
    from: province.econ.emptiedFrom ?? 0,
  })).sort((a, b) => (b.from - b.population) - (a.from - a.population) || a.id - b.id);
  const ongoing = nation.resettlement?.targets?.length ? {
    weeks: nation.resettlement.weeks,
    left: nation.resettlement.targets.reduce((sum, row) => sum + Math.max(0, row.left), 0),
  } : null;
  return { emptied, plan: resettlementPlan(world, nation), blockers: resettleBlockers(world, nation), ongoing };
}
