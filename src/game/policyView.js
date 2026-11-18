// POLİTİKA EKRANININ TEK KAYNAĞI — ekran yalnız bunu basar, formül kurmaz.
//
// Her satır "bu duruş bugün ne getirir, ne götürür" sorusunun sayılarıdır:
// haraç oyunun kendi fatura payından, işgal geliri `occupiedYield`dan, kamp
// getirisi rejim tablosundan okunur. Katman: game. DOM yok.

import { cultureMix, isAccepted } from './culture.js';
import {
  campBlockers, campCap, campRegimeOf, campsOf, fusionBlockers, inmatesOf, intakeBlockers,
} from './culturePolicy.js';
import { HAND_OUTPUT, POP_UNIT } from './econ/defs.js';
import { provinceName } from './provinces.js';
import { controllerOf } from './control.js';
import { policyOrder } from './orders.js';
import {
  doctrineOf, occupationBlockers, occupationLawOf, occupiedYield, stanceBlockers, vassalRows,
} from './policies.js';
import {
  CAMP, CAMP_REGIMES, CAMP_REGIME_IDS, FUSION, OCCUPATION, OCCUPATION_LAWS, OCCUPATION_LAW_IDS,
  POLICY_AREAS, POLICY_AREA_IDS, STANCE_RULES, VASSAL_STANCES, VASSAL_STANCE_IDS, stanceOfTreaty,
} from './policyDefs.js';

function stanceRow(stance, output) {
  return {
    id: stance.id,
    name: stance.name,
    tone: stance.tone,
    desc: stance.desc,
    tribute: stance.tribute,
    weekly: stance.tribute * output,
    autonomy: stance.autonomy,
    infamy: stance.infamy,
    regard: stance.regard,
  };
}

function vassalsView(world, nation, turn) {
  const rows = vassalRows(world, nation, turn).map(({ vassal, treaty }) => {
    const stance = stanceOfTreaty(treaty);
    const output = Math.max(0, vassal.economy?.ic?.output ?? 0);
    return {
      id: vassal.id,
      name: vassal.name,
      population: vassal.economy?.population ?? 0,
      output,
      stance: stance.id,
      stanceName: stance.name,
      tone: stance.tone,
      manual: Boolean(treaty.stanceManual),
      autonomy: treaty.autonomy ?? 0,
      tribute: stance.tribute * output,
      // Birikmiş sonuçlar: ekranın "ne oldu" satırı.
      toll: {
        hungerDead: treaty.hungerDead ?? 0,
        abducted: treaty.abducted ?? 0,
        abductDead: treaty.abductDead ?? 0,
        levied: treaty.levied ?? 0,
        stripped: treaty.stripped ?? 0,
        subsidised: treaty.subsidised ?? 0,
      },
      options: VASSAL_STANCE_IDS.map((id) => ({
        ...stanceRow(VASSAL_STANCES[id], output),
        blockers: stanceBlockers(world, nation, vassal, id, turn),
      })),
    };
  });
  return {
    doctrine: doctrineOf(nation),
    doctrines: VASSAL_STANCE_IDS.map((id) => stanceRow(VASSAL_STANCES[id], rows.reduce((sum, row) => sum + row.output, 0))),
    power: STANCE_RULES.POWER,
    rows,
    weekly: rows.reduce((sum, row) => sum + row.tribute, 0),
  };
}

function occupationView(world, nation, turn) {
  const held = [];
  let income = 0;
  const law = occupationLawOf(nation);
  for (const province of world.provinces ?? []) {
    if (!province.econ || province.owner < 0 || province.owner === nation.id) continue;
    let tiles = 0;
    for (const idx of province.tileIdx) if (controllerOf(world.tiles[idx]) === nation.id) tiles++;
    if (!tiles) continue;
    const share = tiles / province.tileIdx.length;
    const resistance = province.econ.resistance ?? 0;
    const yielded = occupiedYield(province) * (1 - OCCUPATION.RESIST_DRAG * resistance / 100) * share * (law?.extract ?? 0);
    income += yielded;
    held.push({
      id: province.id,
      name: provinceName(province.center),
      owner: world.nations[province.owner]?.name ?? '?',
      share,
      resistance,
      income: yielded,
      population: province.econ.population ?? 0,
    });
  }
  held.sort((a, b) => b.income - a.income || a.id - b.id);
  return {
    law: law?.id ?? null,
    income,
    held: held.slice(0, 12),
    heldCount: held.length,
    power: OCCUPATION.POWER,
    laws: OCCUPATION_LAW_IDS.map((id) => {
      const row = OCCUPATION_LAWS[id];
      return {
        id, name: row.name, tone: row.tone, desc: row.desc,
        extract: row.extract, resistance: row.resistance, infamy: row.infamy,
        afterControl: row.afterControl, pop: row.pop, labour: row.labour, ruin: row.ruin,
        blockers: occupationBlockers(nation, id, turn),
      };
    }),
  };
}

function campsView(world, nation) {
  const regime = campRegimeOf(nation);
  const camps = campsOf(world, nation).map((province) => {
    const inmates = inmatesOf(province, nation);
    return {
      id: province.id,
      name: provinceName(province.center),
      inmates,
      capacity: CAMP.CAPACITY,
      output: inmates / POP_UNIT * regime.output * HAND_OUTPUT,
      deaths: inmates * regime.mortality,
      unrest: province.econ.unrest ?? 0,
    };
  });
  const inmates = camps.reduce((sum, row) => sum + row.inmates, 0);
  const units = inmates / POP_UNIT;
  const intake = nation.policies?.intake ?? [];
  const peoples = cultureMix(world, nation)
    .filter((row) => !row.primary && !isAccepted(nation, row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      people: row.people,
      share: row.share,
      on: intake.includes(row.id),
      progress: nation.movements?.[row.id]?.progress ?? 0,
      blockers: intake.includes(row.id) ? [] : intakeBlockers(world, nation, row.id),
    }));
  // Aday state'ler: en az engeli olan, en kalabalık yabancı state önce.
  const candidates = (world.provinces ?? [])
    .filter((p) => p.owner === nation.id && p.econ && p.econ.camp !== nation.id)
    .map((province) => ({
      id: province.id,
      name: provinceName(province.center),
      population: province.econ.population ?? 0,
      foreign: 1 - (province.cultures ?? []).reduce((sum, row) => sum + (isAccepted(nation, row.id) ? row.share : 0), 0),
      blockers: campBlockers(world, nation, province),
    }))
    .sort((a, b) => a.blockers.length - b.blockers.length || b.foreign - a.foreign || b.population - a.population || a.id - b.id)
    .slice(0, 6);
  return {
    camps,
    cap: campCap(world, nation),
    regime: regime.id,
    regimes: CAMP_REGIME_IDS.map((id) => {
      const row = CAMP_REGIMES[id];
      return {
        id, name: row.name, short: row.short ?? row.name, desc: row.desc, mortality: row.mortality,
        yearlyToll: 1 - (1 - row.mortality) ** 52,
        yieldPerUnit: row.output * HAND_OUTPUT,
        severity: row.severity,
        output: units * row.output * HAND_OUTPUT,
        infamy: (CAMP.INFAMY_BASE * camps.length + CAMP.INFAMY_PER_UNIT * units) * row.severity,
        penal: row.penal,
      };
    }),
    inmates,
    output: units * regime.output * HAND_OUTPUT,
    weeklyDeaths: inmates * regime.mortality,
    totalDeaths: nation.policies?.campDeaths ?? 0,
    infamy: (CAMP.INFAMY_BASE * camps.length + CAMP.INFAMY_PER_UNIT * units) * regime.severity,
    stability: CAMP.STABILITY * camps.length,
    openPower: CAMP.POWER,
    openInfamy: CAMP.OPEN_INFAMY,
    intakeInfamy: CAMP.INTAKE_INFAMY,
    peoples,
    candidates,
  };
}

function fusionView(world, nation, turn) {
  const plan = nation.policies?.fusion ?? null;
  const mix = cultureMix(world, nation);
  const current = plan ? {
    culture: plan.culture,
    name: world.cultures?.[plan.culture]?.name ?? '?',
    share: mix.find((row) => row.id === plan.culture)?.share ?? 0,
    from: plan.from ?? 0,
    finish: FUSION.FINISH_SHARE,
    weeks: turn - (plan.since ?? turn),
  } : null;
  const candidates = mix.filter((row) => row.accepted && !row.primary).map((row) => ({
    id: row.id,
    name: row.name,
    share: row.share,
    people: row.people,
    blockers: fusionBlockers(world, nation, row.id),
  }));
  return {
    current,
    candidates,
    fused: (nation.policies?.fused ?? []).map((id) => world.cultures?.[id]?.name ?? '?'),
    power: FUSION.POWER,
    prestige: FUSION.PRESTIGE,
  };
}

/** Politika ekranının bütün sayıları. */
export function policiesView(world, nation, turn = world.turn ?? 0) {
  return {
    power: nation.power ?? 0,
    infamy: nation.infamy ?? 0,
    vassals: vassalsView(world, nation, turn),
    occupation: occupationView(world, nation, turn),
    camps: campsView(world, nation),
    fusion: fusionView(world, nation, turn),
    orders: POLICY_AREA_IDS.map((id) => ({
      id, name: POLICY_AREAS[id].name, desc: POLICY_AREAS[id].desc, mode: policyOrder(nation, id),
    })),
  };
}
