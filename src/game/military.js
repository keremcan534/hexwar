// Askerî ekranın türetme katmanı.
//
// Bu dosya HİÇBİR ŞEY DEĞİŞTİRMEZ: ordu, komuta, ekonomi ve eğitim kuyruğu
// nerede yaşıyorsa orada kalır, burası yalnız onları tek bir sözlükte toplar.
// DOM bilmez, Node'da sınanabilir (bkz. scripts/military-diagnostic.mjs).
//
// Neden ayrı bir dosya: ekran üç sütun ve bir künye şeridi çizecek, hepsi aynı
// sayıları farklı kesitlerle isteyecek. Hesap çizim dosyasında yaşasaydı ya
// dört kez tekrarlanır ya da ekranı simülasyonun tek gerçek kaynağı hâline
// getirirdi. İkincisi bu projede kural ihlali: ui → game → world tek yönlüdür.
//
// Kural: uydurma sayı yok. Karşılığı olmayan gösterge (savaş yorgunluğu gibi)
// `live: false` ile işaretlenir ve ekran onu kapalı gösterir.

import {
  BRANCH, MAX_COMMAND_SIZE, TRAITS, aggressionInfo, branchOf, commandSize,
  ensureCommandOptions, generalsOf, officersOf,
  assaultOutlook,
} from './command.js';
import { MAX_ASSAULT_DIVISIONS, MAX_DEFENSE_DIVISIONS } from './battles.js';
import {
  MAX_ENTRENCHMENT, UNIT_TYPES, isMoving, maxHpOf, organizationOf, soldiersOf,
  unitAvailable,
} from './units.js';
import {
  MAX_TRAINING_QUEUE, nationManpower, recruitBlockers, recruitmentEquipmentCost,
  recruitmentSource, regionManpower, trainingCapacity, trainingQueue, trainingSpeed,
  trainingWeeks, weeksLeft,
} from './recruitment.js';
import { BASE_REINFORCEMENT_RATE, reinforcementNeed } from './reinforcement.js';
import {
  MOBILIZATION, conscriptUnits, isMobilized, mobilizationBlockers, mobilizationTarget,
} from './mobilization.js';
import { CONSCRIPT_POWER } from './units.js';
import { crisisLeft, inCrisis } from './diplomacy.js';
import { UNIT_COSTS, UNIT_UPKEEP } from './cities.js';
import {
  MILITARY_EQUIPMENT, MILITARY_EQUIPMENT_IDS, MILITARY_FIELD, equipmentStock,
} from './economy.js';
import { constructionAtlas } from './construction.js';
import { provinceName } from './provinces.js';
import { atWar } from './diplomacy.js';

/**
 * Kolun oyundaki rolü. Birimin ne yaptığını sayılar söylemez: topçu destek
 * sınıfıdır, süvari kanat kapatır, piyade hattı tutar. Ekranda tek satırlık
 * bu cümle "hangisini kurayım" sorusunun asıl cevabıdır.
 */
export const UNIT_ROLE = {
  INFANTRY: {
    category: 'line', role: 'Line of battle',
    desc: 'Holds ground. The only arm that doubles the terrain bonus while defending.',
  },
  CAVALRY: {
    category: 'horse', role: 'Manoeuvre',
    desc: 'Twice the marching speed of a line regiment; covers gaps and rides down a broken front.',
  },
  ARTILLERY: {
    category: 'guns', role: 'Fire support',
    desc: 'Highest attack in the army and the most fragile alone. Decisive inside a stack.',
  },
  ARMOR: {
    category: 'guns', role: 'Shock',
    desc: 'Breaks entrenched lines. Needs a tank industry before it can be fielded.',
  },
  AIRCRAFT: {
    category: 'support', role: 'Air support',
    desc: 'Support arm: adds weight to a battle without holding the province itself.',
  },
  WARSHIP: {
    category: 'naval', role: 'Fleet',
    desc: 'Screens the coast and carries the war beyond it. Raised in a coastal province.',
  },
};

export const UNIT_CATEGORIES = [
  ['all', 'All arms'],
  ['line', 'Infantry'],
  ['horse', 'Cavalry'],
  ['guns', 'Artillery'],
  ['support', 'Support'],
  ['naval', 'Naval'],
];

export function unitCategory(typeId) {
  return UNIT_ROLE[typeId]?.category ?? 'line';
}

/** Ülkenin kara tümenleri; sıralama kimliğe göre (kararlı liste). */
export function divisionsOfNation(world, nationId, { naval = false } = {}) {
  const out = [];
  for (const unit of world.units) {
    if (unit.nationId !== nationId) continue;
    if ((unit.type.domain === 'sea') !== naval) continue;
    out.push(unit);
  }
  return out.sort((a, b) => a.id - b.id);
}

function averageOrganization(units) {
  if (!units.length) return null;
  let soldiers = 0;
  let weighted = 0;
  for (const unit of units) {
    const men = Math.max(1, soldiersOf(unit));
    soldiers += men;
    weighted += organizationOf(unit) * men;
  }
  return weighted / Math.max(1, soldiers);
}

/**
 * Ülkenin askerî künyesi. Üst şeridin ve alt özet kutusunun tek kaynağı;
 * hepsi aynı taramadan çıkar ki sayılar birbirini tutsun.
 */
export function militarySummary(world, nation) {
  const army = divisionsOfNation(world, nation.id);
  const fleet = divisionsOfNation(world, nation.id, { naval: true });
  const queue = trainingQueue(nation);
  const military = nation.economy?.military ?? {};

  let soldiers = 0;
  let capacity = 0;
  let regiments = 0;
  let inBattle = 0;
  let marching = 0;
  for (const unit of army) {
    soldiers += soldiersOf(unit);
    capacity += maxHpOf(unit);
    regiments += unit.regiments?.length ?? 1;
    if (unit.battleId) inBattle++;
    else if (isMoving(unit)) marching++;
  }

  const wars = world.nations.filter(
    (other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id),
  );
  const turn = world.turn ?? 0;
  const crises = world.nations.filter(
    (other) => other.alive && other.id !== nation.id && inCrisis(world, nation.id, other.id),
  );
  const need = reinforcementNeed(world, nation);
  const mobilized = isMobilized(nation);
  const conscripts = conscriptUnits(world, nation.id).length;
  const officers = officersOf(nation, BRANCH.ARMY);
  const admirals = officersOf(nation, BRANCH.NAVY);
  const commanded = new Set();
  for (const general of generalsOf(nation)) {
    for (const id of general.divisions) commanded.add(id);
  }

  return {
    divisions: army.length,
    regiments,
    soldiers,
    capacity,
    strength: capacity > 0 ? soldiers / capacity : 1,
    organization: averageOrganization(army),
    navalOrganization: averageOrganization(fleet),
    inBattle,
    marching,
    fleet: fleet.length,
    manpower: nationManpower(world, nation.id),
    manpowerDemand: need.manpower,
    officers: officers.length,
    admirals: admirals.length,
    unassigned: army.filter((unit) => !commanded.has(unit.id)).length
      + fleet.filter((unit) => !commanded.has(unit.id)).length,
    training: queue.length,
    trainingCapacity: trainingCapacity(world, nation),
    trainingSpeed: trainingSpeed(nation),
    trainingManpower: queue.reduce(
      (sum, item) => sum + (UNIT_TYPES[item.typeId]?.manpower ?? 0), 0,
    ),
    queueLimit: MAX_TRAINING_QUEUE,
    wars: wars.map((other) => ({ id: other.id, name: other.name })),
    // Ültimatomlar: ilan edilmiş, henüz başlamamış savaşlar ve kalan hafta.
    crises: crises.map((other) => ({
      id: other.id, name: other.name, left: crisisLeft(world, nation.id, other.id, turn),
    })),
    // Seferberlik: tek anahtar, ekran yalnız durumu ve engeli yazar.
    mobilization: {
      active: mobilized,
      conscripts,
      target: mobilized ? (nation.mobilization?.target ?? 0) : mobilizationTarget(world, nation),
      blockers: mobilized ? [] : mobilizationBlockers(world, nation, turn),
      weeks: MOBILIZATION.RAISE_WEEKS,
      share: MOBILIZATION.SHARE,
      power: CONSCRIPT_POWER,
    },
    upkeepGold: nation.budget?.armyGold ?? 0,
    upkeepFood: nation.budget?.army ?? 0,
    armyCost: nation.economy?.ledger?.armyCost ?? 0,
    procurementCost: nation.economy?.ledger?.procurementCost ?? 0,
    wages: nation.economy?.armyFunding ?? 100,
    procurement: nation.economy?.armyFunding ?? 100,
    supplyIndex: military.supplyIndex ?? 1,
    reinforced: military.reinforced ?? 0,
    reinforcementDemand: military.reinforcementDemand ?? 0,
  };
}

/** Kuyruk kaydının çıkış kümesinin adı — "nereden çıkacak" sorusu. */
function placeOf(world, nationId, tile, atlas) {
  if (!tile) return { province: 'Lost province', region: '—' };
  return {
    province: provinceName(tile),
    region: atlas?.tileRegions.get(tile)?.name ?? '—',
  };
}

/**
 * Kurulabilir birim listesi. Her satır kendi engellerini taşır: ekran
 * "kurulamaz" demekle yetinmesin, NEDENİNİ yazsın.
 */
export function recruitOptions(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const atlas = constructionAtlas(world, nation.id);
  return Object.keys(UNIT_TYPES).map((id) => {
    const type = UNIT_TYPES[id];
    const source = recruitmentSource(world, nation, id);
    const blockers = recruitBlockers(game, nation, id, { source });
    const cost = UNIT_COSTS[id] ?? {};
    const equipment = Object.entries(recruitmentEquipmentCost(id))
      .map(([equipmentId, amount]) => ({
        id: equipmentId,
        name: MILITARY_EQUIPMENT[equipmentId]?.name ?? equipmentId,
        icon: MILITARY_EQUIPMENT[equipmentId]?.icon ?? '',
        amount,
        stock: equipmentStock(nation, equipmentId),
      }));
    const info = UNIT_ROLE[id] ?? {};
    return {
      id,
      name: type.name,
      glyph: type.glyph,
      domain: type.domain,
      category: unitCategory(id),
      role: info.role ?? '',
      desc: info.desc ?? '',
      manpower: type.manpower,
      weeks: trainingWeeks(id),
      gold: cost.gold ?? 0,
      equipment,
      attack: type.attack,
      hp: type.hp,
      moves: type.moves,
      support: Boolean(type.support),
      entrenched: Boolean(type.entrenched),
      upkeep: UNIT_UPKEEP.gold,
      available: unitAvailable(id, turn, nation),
      blockers,
      canBuild: blockers.length === 0,
      source: source ? placeOf(world, nation.id, source, atlas) : null,
      sourcePool: source ? regionManpower(world, source) : 0,
    };
  });
}

/** Kuyruk satırları: ilerleme, kalan süre, yer ve bekleme nedeni. */
export function trainingRows(game, nation) {
  const world = game.world;
  const atlas = constructionAtlas(world, nation.id);
  const capacity = trainingCapacity(world, nation);
  const queue = trainingQueue(nation);
  let active = 0;
  return queue.map((item, index) => {
    const type = UNIT_TYPES[item.typeId];
    const done = item.progress >= item.weeks;
    if (!done && active < capacity) active++;
    const place = placeOf(world, nation.id, world.get(item.q, item.r), atlas);
    return {
      id: item.id,
      typeId: item.typeId,
      name: type?.name ?? item.typeId,
      glyph: type?.glyph ?? '?',
      manpower: type?.manpower ?? 0,
      weeks: item.weeks,
      progress: item.progress,
      share: Math.max(0, Math.min(1, item.progress / Math.max(1, item.weeks))),
      left: weeksLeft(nation, item),
      province: place.province,
      region: place.region,
      // Eğitim bitti ama sahaya çıkamıyor: insan gücü ya da boş kare yok.
      stalled: done && item.waiting === 'deploy',
      queued: !done && item.waiting === 'capacity',
      // Askersizleştirme antlaşması sırayı dondurur (bkz. recruitment.js).
      frozen: item.waiting === 'treaty',
      index,
      first: index === 0,
      last: index === queue.length - 1,
    };
  });
}

function traitCards(general) {
  return (general.traits ?? []).map((id) => TRAITS[id]).filter(Boolean).map((trait) => ({
    id: trait.id, name: trait.name, icon: trait.icon, desc: trait.desc,
  }));
}

function traitSum(general, key) {
  return (general.traits ?? []).reduce((sum, id) => sum + (TRAITS[id]?.[key] ?? 0), 0);
}

/**
 * Subay kadrosu. Bonuslar command.js'teki formüllerin AYNISIDIR — burada
 * yeniden yorumlanmaz, yalnız okunur hâle getirilir: yetenek kademe başına
 * %6, nitelikler kendi alanlarında ekler.
 */
/**
 * Taarruz bakisini cumleye cevirir. Oran ve esik pickOperation'in kullandigi
 * sayilardir; "planning 100%" gorunurken generalin neden dalmadigi bu
 * satirdan okunur (Open Beta 4).
 */
function assaultLine(world, general) {
  const look = assaultOutlook(world, general);
  if (!look) return null;
  const odds = look.ratio === Infinity ? '∞' : look.ratio.toFixed(2);
  const where = provinceName(look.tile);
  if (look.ratio >= look.needed) {
    return look.ready
      ? `Assault on ${where} is on: odds ${odds} against ${look.defenders} defending, ${look.posture} needs ${look.needed}.`
      : `Assault on ${where} waits for the plan to mature (odds ${odds}, ${look.posture} needs ${look.needed}).`;
  }
  return `Holding before ${where}: odds ${odds} with ${look.attackers} in the line against ${look.defenders} dug in; ${look.posture} needs ${look.needed}. Raise the posture, bring artillery or wait for them to weaken.`;
}

export function commandRoster(world, nation) {
  const build = (general) => {
    const divisions = [];
    let soldiers = 0;
    for (const unit of world.units) {
      if (!general.divisions.includes(unit.id)) continue;
      divisions.push(unit);
      soldiers += soldiersOf(unit);
    }
    const naval = branchOf(general) === BRANCH.NAVY;
    const target = general.target == null ? null : world.nations[general.target]?.name ?? null;
    return {
      id: general.id,
      name: general.name,
      branch: branchOf(general),
      rank: naval ? 'Admiral' : 'General',
      skill: general.skill,
      xp: general.xp ?? 0,
      age: general.age ?? 0,
      battles: general.battles ?? 0,
      traits: traitCards(general),
      divisions: commandSize(general),
      soldiers,
      full: commandSize(general) >= MAX_COMMAND_SIZE,
      stance: general.stance,
      aggression: aggressionInfo(general.aggression).label,
      target,
      planning: general.planning ?? 0,
      front: general.front?.length ?? 0,
      // Ilerleyen komutanin onundeki savunulan hedefe bakisi: ekran "neden
      // saldirmiyor" sorusuna cevap verebilsin (bkz. command.assaultOutlook).
      assault: naval ? null : assaultLine(world, general),
      // Muharebe çarpanları: yüzde puanı olarak.
      attack: general.skill * 0.06 + traitSum(general, 'attack'),
      defense: general.skill * 0.06 + traitSum(general, 'defense'),
      siege: Math.min(0.6, traitSum(general, 'siege')),
      march: traitSum(general, 'march'),
      recovery: traitSum(general, 'recovery'),
      planningRate: traitSum(general, 'planning'),
      variance: traitSum(general, 'variance'),
      assignment: commandSize(general) === 0
        ? 'Unassigned'
        : naval
          ? `${commandSize(general)} ${commandSize(general) === 1 ? 'ship' : 'ships'}`
          : `${commandSize(general)} ${commandSize(general) === 1 ? 'division' : 'divisions'}`
            + (target ? ` · facing ${target}` : general.front?.length ? ' · holding the border' : ''),
    };
  };
  return {
    army: officersOf(nation, BRANCH.ARMY).map(build),
    navy: officersOf(nation, BRANCH.NAVY).map(build),
    options: ensureCommandOptions(nation),
  };
}

/** Komutanı olmayan tümenler — otomatik dağıtım kapalıyken oyuncunun işi. */
export function unassignedDivisions(world, nation) {
  const held = new Set();
  for (const general of generalsOf(nation)) {
    for (const id of general.divisions) held.add(id);
  }
  return world.units.filter(
    (unit) => unit.nationId === nation.id && !held.has(unit.id),
  ).sort((a, b) => a.id - b.id);
}

/**
 * Ulusal askerî göstergeler. Her satır ya gerçek bir simülasyon değerini
 * okur (`live: true`) ya da karşılığı olmadığını açıkça söyler — boş sayı
 * yazmak, ekranı çalışıyormuş gibi göstermenin en kolay yoludur.
 */
export function militaryStats(world, nation) {
  const summary = militarySummary(world, nation);
  const wages = Math.max(0, Math.min(1, summary.wages / 100));
  const supply = Math.max(0, Math.min(1, summary.supplyIndex));
  const funding = Math.max(0.25, summary.procurement / 100) * Math.max(0.4, summary.supplyIndex);
  const organizationRegain = 10 * (0.6 + 0.4 * wages) * (0.7 + 0.3 * supply);
  const reinforcement = BASE_REINFORCEMENT_RATE * (0.25 + funding * 0.75);
  const equipmentDemand = MILITARY_EQUIPMENT_IDS.reduce(
    (sum, id) => sum + (nation.economy?.military?.[MILITARY_FIELD[id].demand] ?? 0), 0,
  );
  const bestPlanning = Math.max(0, ...generalsOf(nation).map((g) => g.planning ?? 0));

  // "War Exhaustion" satiri KALDIRILDI: 'Not simulated' diye gri bir olu
  // gosterge tasiyordu. Savasin bedeli zaten hazine/insan/istikrar ve
  // warStrain -> iktidar destegi kanallarindan akiyor; olu metre sahte
  // derinlikti. (Ayri bir yorgunluk sayaci istenirse kaynagi once kurulmali.)
  return [
    {
      id: 'supply',
      label: 'Supply Consumption',
      value: `${equipmentDemand.toFixed(1)}/week`,
      live: true,
      note: `Equipment the army asks for each week. Supply index ${(supply * 100).toFixed(0)}%`
        + ' — the smoothed share of that demand actually met.',
    },
    {
      id: 'reinforcement',
      label: 'Reinforcement Rate',
      value: `${Math.round(reinforcement)} men/week`,
      live: true,
      note: 'Per regiment, before manpower and equipment limits. Scales with military'
        + ' procurement and the supply index.',
    },
    {
      id: 'organization',
      label: 'Organization Regain',
      value: `${organizationRegain.toFixed(1)}/week`,
      live: true,
      note: 'Recovered outside combat. Wages and supply both slow it down when cut.',
    },
    {
      id: 'land-org',
      label: 'Land Organization',
      value: summary.organization == null ? '—' : `${summary.organization.toFixed(0)}%`,
      live: summary.organization != null,
      note: 'Weighted average across every land division you field.',
    },
    {
      id: 'naval-org',
      label: 'Naval Organization',
      value: summary.navalOrganization == null ? '—' : `${summary.navalOrganization.toFixed(0)}%`,
      live: summary.navalOrganization != null,
      note: summary.navalOrganization == null
        ? 'You have no fleet at sea.'
        : 'Weighted average across the fleet.',
    },
    {
      id: 'recruit-time',
      label: 'Recruit Time',
      value: `${Math.round(100 / trainingSpeed(nation))}%`,
      live: true,
      note: 'Of the listed training time. Full military wages and full supply train'
        + ' at 100%; a starved budget stretches every order.',
    },
    {
      id: 'width',
      label: 'Combat Width',
      value: `${MAX_ASSAULT_DIVISIONS} / ${MAX_DEFENSE_DIVISIONS}`,
      live: true,
      note: 'Divisions that can attack a province at once, and the defenders that'
        + ' can answer. Extra divisions wait behind the line.',
    },
    {
      id: 'digin',
      label: 'Dig-in Cap',
      value: `${Math.round(MAX_ENTRENCHMENT * 100)}%`,
      live: true,
      note: 'Maximum entrenchment a stationary division builds up on friendly ground.',
    },
    {
      id: 'planning',
      label: 'Battle Planning',
      value: `+${Math.round(bestPlanning * 25)}% / +25%`,
      live: true,
      note: 'Best matured plan in your officer corps. Only an advancing command'
        + ' draws the bonus; a staff planner matures it faster.',
    },
  ];
}

/**
 * Kol başına alay sayısı. Tümen değil ALAY sayılır: bir tümen birden çok
 * koldan alay taşıyabilir ve alt banttaki "order of battle" ordunun gerçek
 * bileşimini göstermelidir.
 */
export function armyComposition(world, nationId) {
  const counts = new Map();
  for (const unit of world.units) {
    if (unit.nationId !== nationId) continue;
    for (const regiment of unit.regiments ?? [{ typeId: unit.type.id }]) {
      counts.set(regiment.typeId, (counts.get(regiment.typeId) ?? 0) + 1);
    }
  }
  return Object.keys(UNIT_TYPES)
    .filter((id) => counts.has(id))
    .map((id) => ({ id, name: UNIT_TYPES[id].name, count: counts.get(id) }));
}

