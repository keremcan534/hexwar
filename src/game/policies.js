// POLİTİKA PAKETİ — vassal merdiveni ve işgal yasaları; kamplar ve kaynaşma
// culturePolicy.js'tedir, buradan haftalık çağrılır (TASARIM §18).
//
// Üç karar da ULUS düzeyindedir (ev ödevi testi): vassal doktrini, işgal yasası,
// kamp rejimi. Tek tek vassala elle duruş vermek mümkündür ama gerekli değildir.
// YZ ve oyuncu aynı kapıdan geçer; AUTO (orders.setPolicyOrder) `runPolicyAI`ın
// aynısını çalıştırır, yalnız sert uçlar ona kapalıdır.

import { addInfamy, INFAMY_COALITION } from './infamy.js';
import { deed } from './relations.js';
import { registerModifierSource } from './modifiers.js';
import { settle } from './treasury.js';
import { canSpend, levelCost, spend } from './econ/investment.js';
import { HAND_OUTPUT, INDUSTRY_PER_DEV, POP_UNIT } from './econ/defs.js';
import { workforceShare } from './econ/resources.js';
import { controllerOf } from './control.js';
import { UNIT_TYPES, applyArmyLosses, refreshArmy, unitsOn } from './units.js';
import { recruit } from './recruitment.js';
import { levyAvailable, releaseDraw, takeLevy } from './levy.js';
import { cultureMix } from './culture.js';
import {
  campBlockers, campsOf, closeCamp, fusionBlockers, intakeBlockers, movePeople,
  openCamp, reservationFor, runCamps, runFusions, setCampIntake, setCampRegime, startFusion,
} from './culturePolicy.js';
import {
  CAMP, DEFAULT_OCCUPATION, DEFAULT_STANCE, FUSION, OCCUPATION, OCCUPATION_LAWS, POLICY_AI,
  POLICY_ORDER, STANCE_RULES, VASSAL_STANCES, stanceOfTreaty, vassalTreaty,
} from './policyDefs.js';

const turnOf = (game) => game.turns?.turn ?? game.world.turn ?? 0;
const plansOf = (nation) => (nation.policies ??= {});
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const provincesOf = (world, nationId) => (world.provinces ?? []).filter((p) => p.owner === nationId && p.econ);

/**
 * Duruşun vassala ve kampın sahibine yazdığı değiştiriciler: tek değiştirici
 * toplamına girer, okuyucuları mevcut anahtarlardır (stability, growth, unrest,
 * output, investment).
 */
registerModifierSource((nation) => {
  const out = [];
  for (const treaty of nation.treaties ?? []) {
    if (treaty.type !== 'VASSALIZE') continue;
    const stance = stanceOfTreaty(treaty);
    if (stance.mods) out.push({ label: stance.name, effects: stance.mods });
  }
  const camps = nation.policies?.campCount ?? 0;
  if (camps > 0) out.push({ label: 'Penal states', effects: { stability: CAMP.STABILITY * camps } });
  return out;
});

// ------------------------------------------------------- VASSAL MERDİVENİ ---

/** Bu efendinin vassalları ve anlaşmaları. */
export function vassalRows(world, overlord, turn = world.turn ?? 0) {
  const rows = [];
  for (const vassal of world.nations) {
    if (!vassal.alive) continue;
    const treaty = vassalTreaty(vassal, turn);
    if (treaty?.partner === overlord.id) rows.push({ vassal, treaty });
  }
  return rows;
}

export function doctrineOf(nation) {
  return VASSAL_STANCES[nation?.policies?.doctrine]?.id ?? DEFAULT_STANCE;
}

export function stanceBlockers(world, overlord, vassal, stanceId, turn = world.turn ?? 0) {
  const treaty = vassalTreaty(vassal, turn);
  if (treaty?.partner !== overlord.id) return ['Not our vassal.'];
  if (!VASSAL_STANCES[stanceId]) return ['Unknown policy.'];
  if (stanceOfTreaty(treaty).id === stanceId) return ['Already in force.'];
  const out = [];
  const left = (treaty.stanceAt ?? -Infinity) + STANCE_RULES.COOLDOWN - turn;
  if (left > 0) out.push(`Changed recently: ${left} weeks until the next change.`);
  if ((overlord.power ?? 0) < STANCE_RULES.POWER) out.push(`Needs ${STANCE_RULES.POWER} political power.`);
  return out;
}

/** Tek vassala elle duruş: doktrin artık ona yazmaz. */
export function setVassalStance(game, overlord, vassalId, stanceId) {
  const world = game.world;
  const turn = turnOf(game);
  const vassal = world.nations[vassalId];
  if (stanceBlockers(world, overlord, vassal, stanceId, turn).length) return false;
  overlord.power -= STANCE_RULES.POWER;
  const treaty = vassalTreaty(vassal, turn);
  treaty.stance = stanceId;
  treaty.stanceAt = turn;
  treaty.stanceManual = true;
  game.emit?.('diplomacy');
  return true;
}

/**
 * DOKTRİN: bütün vassallara tek karar, tek bedel. Elle duruş verilmiş vassala
 * dokunmaz; bekleme süresindeki vassal süresi dolunca doktrine geçer.
 */
export function setVassalDoctrine(game, overlord, stanceId) {
  if (!VASSAL_STANCES[stanceId] || doctrineOf(overlord) === stanceId) return false;
  if ((overlord.power ?? 0) < STANCE_RULES.POWER) return false;
  overlord.power -= STANCE_RULES.POWER;
  plansOf(overlord).doctrine = stanceId;
  applyDoctrine(game.world, overlord, turnOf(game));
  game.emit?.('diplomacy');
  return true;
}

function applyDoctrine(world, overlord, turn) {
  const doctrine = doctrineOf(overlord);
  for (const { treaty } of vassalRows(world, overlord, turn)) {
    if (treaty.stanceManual || stanceOfTreaty(treaty).id === doctrine) continue;
    if ((treaty.stanceAt ?? -Infinity) + STANCE_RULES.COOLDOWN > turn) continue;
    treaty.stance = doctrine;
    treaty.stanceAt = turn;
  }
}

/** Kaçırılanların varış yeri: kampımız varsa kamp, yoksa en kalkınmış state'ler. */
function labourTargets(world, overlord) {
  const camps = campsOf(world, overlord);
  if (camps.length) return camps;
  return provincesOf(world, overlord.id)
    .filter((p) => p.econ.core !== false)
    .sort((a, b) => b.econ.development - a.econ.development || a.id - b.id)
    .slice(0, STANCE_RULES.ABDUCT_TARGETS);
}

function raiseLevy(game, overlord, vassal, treaty, turn) {
  const world = game.world;
  if (!((overlord.economy?.warFronts ?? 0) > 0)) return;
  if ((turn + vassal.id) % STANCE_RULES.LEVY_WEEKS !== 0) return;
  const held = world.units.filter((u) => u.nationId === overlord.id
    && u.regiments?.some((r) => r.auxOf === vassal.id)).length;
  if (held >= STANCE_RULES.LEVY_MAX) return;
  // Alay birkaç state'ten toplanır: tek state'in havuzu nadiren bir alay eder
  // (ölçüldü: tek kaynak arayınca hiçbir tohumda alay çıkmadı).
  const need = UNIT_TYPES.INFANTRY.manpower;
  const sources = provincesOf(world, vassal.id)
    .map((province) => ({ province, free: levyAvailable(world, province, vassal) }))
    .filter((row) => row.free >= 1)
    .sort((a, b) => b.free - a.free || a.province.id - b.province.id);
  if (sources.reduce((sum, row) => sum + row.free, 0) < need) return;
  const draws = [];
  let left = need;
  for (const { province, free } of sources) {
    if (left <= 0) break;
    const men = Math.min(left, free);
    draws.push({ q: province.center.q, r: province.center.r, men, by: takeLevy(world, province, vassal, men) });
    left -= men;
  }
  const unit = recruit(game, overlord, 'INFANTRY', { draws, charge: false });
  if (!unit) {
    for (const draw of draws) releaseDraw(world, vassal.id, draw, draw.men);
    return;
  }
  // Kura alayı: yarım ikmal, zayıf birlik; ölen vassalın kendi nüfusundan düşer.
  unit.regiments[0].conscript = true;
  unit.regiments[0].auxOf = vassal.id;
  treaty.levied = (treaty.levied ?? 0) + need;
}

function stripVassal(game, overlord, vassal, treaty, turn) {
  if ((turn + vassal.id) % STANCE_RULES.STRIP_WEEKS !== 0) return;
  const targets = provincesOf(game.world, vassal.id)
    .filter((p) => p.econ.development > 1)
    .sort((a, b) => b.econ.development - a.econ.development || a.id - b.id)
    .slice(0, STANCE_RULES.STRIP_STATES);
  for (const target of targets) {
    const value = levelCost(target, target.econ.development) * STANCE_RULES.STRIP_VALUE;
    target.econ.development -= 1;
    settle(overlord, 'treaty', value);
    treaty.stripped = (treaty.stripped ?? 0) + 1;
    treaty.strippedValue = (treaty.strippedValue ?? 0) + value;
  }
}

function runVassalStances(game) {
  const world = game.world;
  const turn = turnOf(game);
  for (const vassal of world.nations) {
    if (!vassal.alive) continue;
    const treaty = vassalTreaty(vassal, turn);
    if (!treaty) continue;
    const overlord = world.nations[treaty.partner];
    if (!overlord?.alive) continue;
    const stance = stanceOfTreaty(treaty);
    if (stance.id === DEFAULT_STANCE) continue;
    if (stance.regard && turn % STANCE_RULES.REGARD_WEEKS === 0) {
      deed(world, vassal.id, overlord.id, stance.regard < 0 ? 'abused_us' : 'aided_us', turn,
        Math.abs(stance.regard) * STANCE_RULES.REGARD_WEEKS);
    }
    if (stance.infamy) addInfamy(overlord, stance.infamy);
    if (stance.subsidy) {
      const pay = stance.subsidy * Math.max(0, overlord.economy?.ic?.output ?? 0);
      if (pay > 0 && canSpend(overlord, pay) && spend(overlord, pay)) {
        settle(vassal, 'grant', pay);
        treaty.subsidised = (treaty.subsidised ?? 0) + pay;
      }
    }
    if (stance.hunger) {
      const food = clamp(vassal.economy?.resources?.FOOD?.ratio ?? 1, 0, 1);
      const rate = stance.hunger * (2 - food);
      for (const province of provincesOf(world, vassal.id)) {
        const econ = province.econ;
        const lost = Math.min(Math.round(econ.population * rate), Math.max(0, econ.population - (econ.soldiers ?? 0)));
        econ.population -= lost;
        treaty.hungerDead = (treaty.hungerDead ?? 0) + lost;
      }
    }
    if (stance.abduct) {
      const targets = labourTargets(world, overlord);
      for (const province of provincesOf(world, vassal.id)) {
        const moved = movePeople(world, province, targets, stance.abduct, STANCE_RULES.TRANSIT_LOSS);
        treaty.abducted = (treaty.abducted ?? 0) + moved.moved;
        treaty.abductDead = (treaty.abductDead ?? 0) + moved.dead;
        if (moved.tiles.length) game.renderer?.invalidateTiles?.(moved.tiles.filter(Boolean));
      }
    }
    if (stance.levy) raiseLevy(game, overlord, vassal, treaty, turn);
    if (stance.strip) stripVassal(game, overlord, vassal, treaty, turn);
  }
}

// ---------------------------------------------------------- İŞGAL YASALARI ---

/** Ulusun işgal yasası. Kol kapalıyken ve oyuncu seçmediyse yasa yoktur. */
export function occupationLawOf(nation) {
  const set = OCCUPATION_LAWS[nation?.policies?.occupation];
  if (set) return set;
  return POLICY_AI.occupation ? OCCUPATION_LAWS[DEFAULT_OCCUPATION] : null;
}

export function occupationBlockers(nation, lawId, turn) {
  if (!OCCUPATION_LAWS[lawId]) return ['Unknown law.'];
  if (occupationLawOf(nation)?.id === lawId) return ['Already in force.'];
  const out = [];
  const left = (nation.policies?.occupationAt ?? -Infinity) + OCCUPATION.COOLDOWN - turn;
  if (left > 0) out.push(`Changed recently: ${left} weeks until the next change.`);
  if ((nation.power ?? 0) < OCCUPATION.POWER) out.push(`Needs ${OCCUPATION.POWER} political power.`);
  return out;
}

export function setOccupationLaw(game, nation, lawId) {
  const turn = turnOf(game);
  if (occupationBlockers(nation, lawId, turn).length) return false;
  nation.power -= OCCUPATION.POWER;
  const plans = plansOf(nation);
  plans.occupation = lawId;
  plans.occupationAt = turn;
  game.emit?.('politics', nation.id);
  return true;
}

/** Bir state'in işgalden haftalık verebileceği ham çıktı (statüsüz). */
export function occupiedYield(province) {
  const econ = province.econ;
  const work = Math.max(0, econ.population ?? 0) / POP_UNIT * workforceShare(econ);
  return work * (HAND_OUTPUT + INDUSTRY_PER_DEV * Math.max(0, (econ.development ?? 1) - 1));
}

/** İşgalci → elindeki hex payı (kimlik sırasıyla). */
function occupiersOf(world, province) {
  const counts = new Map();
  for (const idx of province.tileIdx) {
    const holder = controllerOf(world.tiles[idx]);
    if (holder >= 0 && holder !== province.owner) counts.set(holder, (counts.get(holder) ?? 0) + 1);
  }
  const total = Math.max(1, province.tileIdx.length);
  return [...counts].sort((a, b) => a[0] - b[0]).map(([id, n]) => ({ id, share: n / total }));
}

function occupationAttrition(world, province, occupierId, resistance) {
  const rate = OCCUPATION.RESIST_ATTRITION * resistance / 100;
  if (!(rate > 0)) return;
  for (const idx of province.tileIdx) {
    for (const unit of unitsOn(world.tiles[idx])) {
      if (unit.nationId !== occupierId || unit.type?.domain !== 'land') continue;
      const men = (unit.regiments ?? []).reduce((sum, r) => sum + r.strength, 0);
      applyArmyLosses(unit, men * rate, 0, world);
      refreshArmy(unit);
    }
  }
}

export function runOccupation(game) {
  const world = game.world;
  const turn = turnOf(game);
  // Sahibin kini çift başına toplanıp üç ayda bir yazılır (STANCE_RULES.REGARD_WEEKS).
  const grudges = new Map();
  for (const province of world.provinces ?? []) {
    const econ = province.econ;
    if (!econ || province.owner < 0) continue;
    const occupiers = occupiersOf(world, province);
    if (!occupiers.length) {
      if (econ.resistance > 0) econ.resistance = Math.max(0, econ.resistance - OCCUPATION.RESIST_DECAY);
      if (econ.occBy !== undefined) { delete econ.occBy; delete econ.occLaw; }
      continue;
    }
    const lead = occupiers.reduce((best, row) => (row.share > best.share ? row : best));
    const leadLaw = occupationLawOf(world.nations[lead.id]);
    if (!leadLaw) continue;
    econ.occBy = lead.id;
    econ.occLaw = leadLaw.id;
    const foreign = 1 - (province.cultures?.find((row) => row.id === world.nations[lead.id]?.culture)?.share ?? 0);
    econ.resistance = clamp((econ.resistance ?? 0) + leadLaw.resistance * (0.5 + foreign), 0, 100);
    const yielded = occupiedYield(province) * (1 - OCCUPATION.RESIST_DRAG * econ.resistance / 100);
    for (const { id, share } of occupiers) {
      const occupier = world.nations[id];
      const law = occupationLawOf(occupier);
      if (!occupier?.alive || !law) continue;
      const take = yielded * share * law.extract;
      if (take > 0) settle(occupier, 'treaty', take);
      if (law.infamy) addInfamy(occupier, law.infamy * share);
      if (law.regard) {
        const key = `${province.owner}:${id}`;
        grudges.set(key, (grudges.get(key) ?? 0) + Math.abs(law.regard) * share);
      }
      if (law.pop) econ.population = Math.max(econ.soldiers ?? 0, Math.round(econ.population * (1 - law.pop * share)));
      if (law.labour) {
        const moved = movePeople(world, province, labourTargets(world, occupier), law.labour * share, STANCE_RULES.TRANSIT_LOSS);
        if (moved.tiles.length) game.renderer?.invalidateTiles?.(moved.tiles.filter(Boolean));
      }
      if (law.ruin && (turn + province.id) % OCCUPATION.RUIN_WEEKS === 0 && econ.development > 1) econ.development -= 1;
      occupationAttrition(world, province, id, econ.resistance);
    }
  }
  if (turn % STANCE_RULES.REGARD_WEEKS !== 0) return;
  for (const [key, weight] of grudges) {
    const [owner, occupier] = key.split(':').map(Number);
    deed(world, owner, occupier, 'plundered_us', turn, weight * STANCE_RULES.REGARD_WEEKS);
  }
}

/**
 * Barışta el değiştiren state işgalin hafızasıyla gelir: yumuşak yasa uyumu
 * yükseltir, sert yasa direnişi şikâyet olarak devreder (turn.claimAtPeace).
 */
export function occupationAftermath(province, nationId) {
  const econ = province.econ;
  if (econ.occBy === nationId) {
    const law = OCCUPATION_LAWS[econ.occLaw];
    if (law) econ.control = clamp((econ.control ?? 25) + law.afterControl, 5, 100);
    econ.grievance = Math.max(econ.grievance ?? 0, (econ.resistance ?? 0) / OCCUPATION.GRIEVANCE_DIV);
  }
  delete econ.occBy;
  delete econ.occLaw;
}

// ------------------------------------------------------------ HAFTALIK GİRİŞ ---

/** Haftalık sıra: duruşlar → işgal → kamplar → kaynaşma (province fazında). */
export function runPolicies(game) {
  const world = game.world;
  const turn = turnOf(game);
  for (const nation of world.nations) {
    if (nation.alive && nation.policies?.doctrine) applyDoctrine(world, nation, turn);
  }
  runVassalStances(game);
  runOccupation(game);
  runCamps(game);
  runFusions(game);
}

// ---------------------------------------------------------------------- YZ ---

const QUARTER = 13;
const AI_OFFSET = 5;

/** YZ'nin bir vassal için seçtiği duruş. `cabinet`: oyuncu adına, sert uçlar kapalı. */
function chooseStance(world, overlord, treaty, cabinet) {
  const aggression = overlord.aggression ?? 1;
  const infamy = overlord.infamy ?? 0;
  if ((treaty.autonomy ?? 0) >= 60) return 'protect';
  if (infamy >= 15) return DEFAULT_STANCE;
  if (!cabinet && (overlord.economy?.warFronts ?? 0) > 0 && aggression >= 1.15) return 'levy';
  if (!cabinet && aggression >= 1.3) return 'industry';
  if (aggression >= 1.1) return 'extract';
  if (aggression < 0.85) return 'protect';
  return DEFAULT_STANCE;
}

function chooseOccupation(nation) {
  const aggression = nation.aggression ?? 1;
  const infamy = nation.infamy ?? 0;
  if (infamy >= 18 || aggression < 0.85) return 'civil';
  if (aggression >= 1.25 && infamy < 10) return 'requisition';
  return DEFAULT_OCCUPATION;
}

/** Kamp açılacak halk: hareketi Direniş'e varmış, kabul edilmemiş en büyük halk. */
function campCandidate(world, nation) {
  return cultureMix(world, nation)
    .filter((row) => !row.accepted && !row.primary && row.share >= 0.05
      && (nation.movements?.[row.id]?.progress ?? 0) >= 60)
    .sort((a, b) => b.people - a.people || a.id - b.id)[0] ?? null;
}

function campAI(game, nation, cabinet) {
  const world = game.world;
  const camps = campsOf(world, nation);
  // Dünya kapıya dayandıysa kamp kapanır: oyuncunun kabinesi de bunu yapabilir.
  if (camps.length && (nation.infamy ?? 0) >= INFAMY_COALITION) {
    for (const camp of camps) closeCamp(game, nation, camp.id);
    return cabinet ? 'The penal states were closed: the world was closing in on us.' : null;
  }
  if (cabinet || camps.length || (nation.aggression ?? 1) < 1.2 || (nation.stability ?? 0) < 0.45) return null;
  if ((nation.power ?? 0) < CAMP.POWER + 40) return null;
  const row = campCandidate(world, nation);
  if (!row) return null;
  const site = reservationFor(world, nation, row.id);
  if (!site || campBlockers(world, nation, site).length || !openCamp(game, nation, site.id)) return null;
  setCampRegime(nation, 'labour');
  if (!intakeBlockers(world, nation, row.id).length) setCampIntake(world, nation, row.id, true);
  return null;
}

function fusionAI(game, nation) {
  const world = game.world;
  if (nation.policies?.fusion || (nation.stability ?? 0) < FUSION.AI_STABILITY) return null;
  if ((nation.power ?? 0) < FUSION.POWER + 40) return null;
  const row = cultureMix(world, nation)
    .filter((item) => item.accepted && !item.primary && item.share >= FUSION.AI_SHARE)
    .sort((a, b) => b.people - a.people || a.id - b.id)
    .find((item) => !fusionBlockers(world, nation, item.id).length);
  if (!row || !startFusion(game, nation, row.id)) return null;
  return `Fusion with the ${row.name} began.`;
}

/**
 * Çeyreklik politika kararı. YZ her alanı kendi kolundan, oyuncu yalnız
 * devrettiği alanı yürütür. Dönen metinler devir notuna yazılır.
 */
export function runPolicyAI(game, nation, { cabinet = false } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  if ((turn + nation.id) % QUARTER !== AI_OFFSET || !nation.alive) return [];
  const notes = [];
  const allowed = (area) => (cabinet ? nation.policies?.orders?.[area] === POLICY_ORDER.AUTO : POLICY_AI[area]);
  if (allowed('vassals')) {
    for (const { vassal, treaty } of vassalRows(world, nation, turn)) {
      if (treaty.stanceManual && !cabinet) continue;
      const wanted = chooseStance(world, nation, treaty, cabinet);
      if (stanceOfTreaty(treaty).id === wanted) continue;
      if (!stanceBlockers(world, nation, vassal, wanted, turn).length && setVassalStance(game, nation, vassal.id, wanted)) {
        treaty.stanceManual = false;
        notes.push(`${vassal.name}: ${VASSAL_STANCES[wanted].name}.`);
      }
    }
  }
  if (allowed('occupation') && (nation.economy?.warFronts ?? 0) > 0) {
    const wanted = chooseOccupation(nation);
    if (occupationLawOf(nation)?.id !== wanted && setOccupationLaw(game, nation, wanted)) {
      notes.push(`Occupied land: ${OCCUPATION_LAWS[wanted].name}.`);
    }
  }
  if (allowed('camps')) {
    const note = campAI(game, nation, cabinet);
    if (note) notes.push(note);
  }
  if (allowed('fusion')) {
    const note = fusionAI(game, nation);
    if (note) notes.push(note);
  }
  return notes;
}
