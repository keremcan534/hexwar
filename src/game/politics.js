// SİYASET — Siyasi Güç, istikrar, savaş desteği, partiler, hükûmet biçimi,
// yasalar ve danışmanlar (TASARIM.md §9).
//
// Üç sayaç oyunun siyasi nabzıdır ve hepsi HEDEFE YAKLAŞIR (haftada 1 puan):
// hedef dökümüyle hesaplanır, ekran dökümü basar. Böylece "neden düştü"
// sorusunun cevabı hep tek bir tabloda durur.
//
//   nation.power       Siyasi Güç: yasa, hükûmet, danışman, kültür politikası,
//                      savaş gerekçesi ve ambargonun ortak para birimi
//   nation.stability   0-1: SG, vergi, IC, huzursuzluk; düşükse isyan
//   nation.warSupport  0-1: askerlik ve ekonomi yasalarının kapısı; düşükse
//                      ülke kötü barışı kabul eder
//
// Yasa VERİSİ laws.js'tedir (ekonomi/kültür/ordu oradan okur); burası
// değiştirme kurallarını ve siyasi döngüyü tutar.

import { makeRng } from '../core/rng.js';
import { LAWS, LAW_IDS, lawIndex, lawSum } from './laws.js';
import { mod, refreshModifiers, registerModifierSource } from './modifiers.js';
import { consumerStability } from './econ/industry.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 1848: sosyalistler sahneye çıkar (Ulusların Baharı yılı). */
export const SOCIALIST_TURN = 625;
export const POWER_CAP = 500;
export const LAW_COST = 50;
export const LAW_LOCK = 26;
export const ELECTION_WEEKS = 208;

export const GOVERNMENTS = {
  absolutism: {
    id: 'absolutism', name: 'Absolute Monarchy', elections: false,
    effects: { power: 0.5 },
    desc: 'No elections: the crown appoints the government. Political power +0.5.',
  },
  constitutional: {
    id: 'constitutional', name: 'Constitutional Monarchy', elections: true,
    effects: { power: 0.25, stability: 0.03 },
    desc: 'Elections every four years; the crown keeps conservatives close to power.',
  },
  republic: {
    id: 'republic', name: 'Republic', elections: true,
    effects: { stability: 0.05, research: 0.05, warSupport: -0.05 },
    desc: 'Elections every four years; the most popular party governs.',
  },
};

/**
 * Dört parti. `effects` iktidardayken verilen değiştiriciler; `limits` iktidar
 * partisinin yasa aralığı (yalnız YENİ değişikliği sınırlar, eldekini bozmaz).
 */
export const PARTIES = {
  conservative: {
    id: 'conservative', name: 'Conservatives', color: '#4a6fa5',
    effects: { stability: 0.05, power: 0.25 },
    limits: { citizenship: [0, 1], education: [0, 1] },
    pitch: 'Order, crown and church.',
  },
  liberal: {
    id: 'liberal', name: 'Liberals', color: '#d9a73b',
    effects: { tax: 0.05, research: 0.1 },
    limits: { trade: [1, 3], conscription: [0, 2] },
    pitch: 'Free trade, free press, constitutional rights.',
  },
  nationalist: {
    id: 'nationalist', name: 'Nationalists', color: '#8b3a3a',
    effects: { warSupport: 0.1, manpower: 0.1 },
    limits: { citizenship: [0, 1] },
    pitch: 'One people, one state — kin abroad must come home.',
  },
  socialist: {
    id: 'socialist', name: 'Socialists', color: '#c0392b',
    effects: { consumerNeed: -0.1, stability: 0.03 },
    limits: { education: [1, 2], tax: [1, 2] },
    pitch: 'Bread, schools and the eight-hour day.',
  },
};
export const PARTY_IDS = Object.keys(PARTIES);

/** Danışman türleri: yuva başına beş-altı kişilik, her biri tek bonus. */
export const ADVISOR_SLOTS = {
  economy: { name: 'Economy', types: [
    { id: 'industrialist', title: 'Industrialist', effects: { ic: 0.08 } },
    { id: 'railway_baron', title: 'Railway Baron', effects: { construction: 0.15 } },
    { id: 'free_trader', title: 'Free Trader', effects: { exportIncome: 0.2, importCost: -0.1 } },
    { id: 'agronomist', title: 'Agronomist', effects: { food: 0.1, growth: 0.1 } },
    { id: 'financier', title: 'Financier', effects: { tax: 0.08 } },
  ] },
  military: { name: 'Military', types: [
    { id: 'drill_master', title: 'Drill Master', effects: { training: 0.25 } },
    { id: 'quartermaster', title: 'Quartermaster', effects: { reinforce: 0.25, lineEfficiency: 0.05 } },
    { id: 'strategist', title: 'Strategist', effects: { attack: 0.06 } },
    { id: 'fortifier', title: 'Military Engineer', effects: { defense: 0.08 } },
    { id: 'recruiter', title: 'Recruiting Sergeant', effects: { manpower: 0.15 } },
    { id: 'admiral', title: 'Naval Reformer', effects: { naval: 0.12 } },
  ] },
  political: { name: 'Political', types: [
    { id: 'statesman', title: 'Statesman', effects: { infamyDecay: 0.3 } },
    { id: 'propagandist', title: 'Propagandist', effects: { warSupport: 0.08 } },
    { id: 'reformer', title: 'Reformer', effects: { lawCost: -0.3, power: 0.2 } },
    { id: 'interior', title: 'Interior Minister', effects: { unrest: -0.15, stability: 0.03 } },
    { id: 'educator', title: 'Educator', effects: { literacy: 0.05, research: 0.08 } },
  ] },
};
export const ADVISOR_COST = 50;
const ADVISOR_EPOCH = 260;

const FIRST_NAMES = ['Anton', 'Basil', 'Casimir', 'Dorian', 'Edmund', 'Felix', 'Gustav', 'Henrik',
  'Ignatz', 'Julius', 'Konrad', 'Leopold', 'Matthias', 'Nikolai', 'Otto', 'Pavel', 'Rudolf',
  'Stefan', 'Theodor', 'Viktor', 'Wilhelm', 'Aurel', 'Bertram', 'Cyril'];
const LAST_NAMES = ['Ardent', 'Bellmar', 'Corvin', 'Dravic', 'Eslow', 'Falke', 'Gravin', 'Hollis',
  'Istvan', 'Jessop', 'Kerr', 'Lomax', 'Morrow', 'Nadler', 'Orrin', 'Pryce', 'Quill', 'Rennick',
  'Sallow', 'Thorne', 'Ulbrecht', 'Vance', 'Wexley', 'Zoltan'];

// ------------------------------------------------------------------ DURUM ---

function freshPolitics(world, nation) {
  const tier = nation.devTier ?? 0;
  const government = tier >= 2 ? 'constitutional' : 'absolutism';
  const support = { conservative: 45, liberal: 25, nationalist: 30, socialist: 0 };
  return {
    government,
    ruling: 'conservative',
    support,
    laws: Object.fromEntries(LAW_IDS.map((id) => [id, LAWS[id].default])),
    lawLocks: {},
    rulingLock: 0,
    nextElection: 52 + ((nation.id * 37) % ELECTION_WEEKS),
    advisors: { economy: null, military: null, political: null },
    candidates: null,
    candidatesEpoch: -1,
    propaganda: null,
    recentLosses: 0,
    warWeeks: 0,
    stabilityParts: [],
    warSupportParts: [],
  };
}

export function ensurePolitics(world, nation) {
  nation.politics ??= freshPolitics(world, nation);
  const politics = nation.politics;
  const fresh = freshPolitics(world, nation);
  for (const key of Object.keys(fresh)) politics[key] ??= fresh[key];
  for (const id of LAW_IDS) if (!Number.isInteger(politics.laws[id])) politics.laws[id] = LAWS[id].default;
  for (const id of PARTY_IDS) if (!Number.isFinite(politics.support[id])) politics.support[id] = 0;
  if (!Number.isFinite(nation.power)) nation.power = 25;
  if (!Number.isFinite(nation.stability)) nation.stability = 0.6;
  if (!Number.isFinite(nation.warSupport)) nation.warSupport = 0.45;
  return politics;
}

export function initPolitics(world) {
  for (const nation of world.nations) {
    nation.politics = null;
    ensurePolitics(world, nation);
    // Gelişmiş çekirdek okullu başlar; geri kalanlar okulsuz.
    if ((nation.devTier ?? 0) >= 2) nation.politics.laws.education = 1;
    nation.stability = 0.6;
    nation.warSupport = clamp(0.4 + ((nation.aggression ?? 1) - 1) * 0.3, 0.25, 0.6);
    nation.power = 25;
    refreshModifiers(nation, world.turn ?? 0);
  }
}

// ------------------------------------------------------------ OKUYUCULAR ---

export function rulingParty(nation) {
  return PARTIES[nation?.politics?.ruling] ?? PARTIES.conservative;
}

export function governmentOf(nation) {
  return GOVERNMENTS[nation?.politics?.government] ?? GOVERNMENTS.absolutism;
}

/** Ekran adı: "Constitutional Monarchy". */
export function governmentType(nation) {
  return governmentOf(nation).name;
}

/** Halkın önde gelen partisi. */
export function leadingParty(nation) {
  const support = nation?.politics?.support ?? {};
  let best = 'conservative';
  for (const id of PARTY_IDS) if ((support[id] ?? 0) > (support[best] ?? 0)) best = id;
  return best;
}

/**
 * MEŞRUİYET: halkın istediği parti iktidarda değilse aradaki destek farkı
 * istikrardan düşer (puan × 0.4). Mutlakiyette de geçerlidir — taç halka
 * rağmen yönetebilir, bedelsiz değil.
 */
export function legitimacyOf(nation) {
  const politics = nation?.politics;
  if (!politics) return { gap: 0, hit: 0, leader: 'conservative' };
  const leader = leadingParty(nation);
  const gap = Math.max(0, (politics.support[leader] ?? 0) - (politics.support[politics.ruling] ?? 0));
  // 0.004 ölçümde gürültüydü: muhafazakârlar ulus-haftaların %92-98'inde
  // iktidardaydı, sosyalist ve cumhuriyet hiç görülmedi.
  return { gap, hit: -gap * 0.01, leader };
}

// Değiştirici kaynakları: iktidar partisi, hükûmet biçimi, danışmanlar.
registerModifierSource((nation) => {
  const out = [];
  const politics = nation?.politics;
  if (!politics) return out;
  const party = rulingParty(nation);
  out.push({ label: `${party.name} in government`, effects: party.effects });
  const government = governmentOf(nation);
  out.push({ label: government.name, effects: government.effects });
  for (const slot of Object.keys(ADVISOR_SLOTS)) {
    const advisor = politics.advisors?.[slot];
    if (advisor) out.push({ label: `${advisor.title} ${advisor.name}`, effects: advisor.effects });
  }
  return out;
});

// ------------------------------------------------------------- YASALAR ---

export function lawCost(nation) {
  return Math.round(LAW_COST * Math.max(0.3, 1 + mod(nation, 'lawCost')));
}

function atWarWithAnyone(world, nation) {
  return (nation.economy?.warFronts ?? 0) > 0;
}

/**
 * Neden bu kademeye geçilemez? Boş liste = geçilebilir. Ekran ve YZ aynı
 * listeyi okur.
 */
export function lawBlockers(world, nation, lawId, index, turn = world.turn ?? 0) {
  const law = LAWS[lawId];
  const politics = nation.politics;
  const out = [];
  if (!law || index < 0 || index >= law.options.length) return ['Unknown law'];
  if (lawIndex(nation, lawId) === index) return ['Already in force'];
  const lock = politics.lawLocks?.[lawId] ?? 0;
  if (lock > turn) out.push(`Changed recently (${lock - turn} weeks)`);
  const limits = rulingParty(nation).limits?.[lawId];
  if (limits && (index < limits[0] || index > limits[1])) {
    out.push(`${rulingParty(nation).name} will not pass it`);
  }
  const option = law.options[index];
  if (option.warSupport && (nation.warSupport ?? 0) < option.warSupport
    && !(option.atWarOr && atWarWithAnyone(world, nation))) {
    out.push(`Needs war support ${Math.round(option.warSupport * 100)}%`);
  }
  if (option.needsWar && !atWarWithAnyone(world, nation)) out.push('Only at war');
  const cost = lawCost(nation);
  if ((nation.power ?? 0) < cost) out.push(`Needs ${cost} political power`);
  return out;
}

export function setLaw(game, nation, lawId, index) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (lawBlockers(world, nation, lawId, index, turn).length) return false;
  nation.power -= lawCost(nation);
  nation.politics.laws[lawId] = index;
  nation.politics.lawLocks[lawId] = turn + LAW_LOCK;
  refreshModifiers(nation, turn);
  if (nation.id === game.turns?.playerNation) {
    game.turns.addLog(`New law: ${LAWS[lawId].options[index].name}.`, { kind: 'POLITICS' });
  }
  game.emit?.('politics', nation.id);
  return true;
}

/**
 * Savaş desteği ya da savaş düşünce artık izin verilmeyen yasa (topyekûn
 * seferberlik, savaş ekonomisi) kendiliğinden bir kademe geri iner — bedava
 * ve kilitsiz: yasa tutulamıyorsa tutulamaz.
 */
function enforceLawRequirements(world, nation) {
  for (const id of ['conscription', 'economy']) {
    let index = lawIndex(nation, id);
    while (index > 0) {
      const option = LAWS[id].options[index];
      const atWar = atWarWithAnyone(world, nation);
      const ok = (!option.needsWar || atWar)
        && (!option.warSupport || (nation.warSupport ?? 0) >= option.warSupport - 0.1
          || (option.atWarOr && atWar));
      if (ok) break;
      index--;
    }
    nation.politics.laws[id] = index;
  }
}

// ----------------------------------------------------------- HÜKÛMET ---

export const RULING_CHANGE_COST = 80;

/** Mutlakiyette iktidar partisini taç seçer (SG + 52 hafta kilit). */
export function rulingBlockers(world, nation, partyId, turn = world.turn ?? 0) {
  const politics = nation.politics;
  const out = [];
  if (!PARTIES[partyId]) return ['Unknown party'];
  if (politics.ruling === partyId) return ['Already in government'];
  if (governmentOf(nation).elections) out.push('Decided by elections');
  if (partyId === 'socialist' && turn < SOCIALIST_TURN) out.push('No socialist movement yet');
  if ((politics.rulingLock ?? 0) > turn) out.push(`Government formed recently (${politics.rulingLock - turn} weeks)`);
  if ((nation.power ?? 0) < RULING_CHANGE_COST) out.push(`Needs ${RULING_CHANGE_COST} political power`);
  return out;
}

export function appointGovernment(game, nation, partyId) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (rulingBlockers(world, nation, partyId, turn).length) return false;
  nation.power -= RULING_CHANGE_COST;
  setRuling(game, nation, partyId, turn);
  nation.politics.rulingLock = turn + 52;
  return true;
}

function setRuling(game, nation, partyId, turn) {
  if (nation.politics.ruling === partyId) return;
  nation.politics.ruling = partyId;
  refreshModifiers(nation, turn);
  if (nation.id === game.turns?.playerNation) {
    game.turns.addLog(`${PARTIES[partyId].name} now form the government.`, { kind: 'POLITICS' });
  }
  game.emit?.('politics', nation.id);
}

/** Hükûmet biçimi kararları: anayasa, cumhuriyet, mutlakiyete dönüş. */
export const REGIME_DECISIONS = {
  constitution: {
    from: 'absolutism', to: 'constitutional', cost: 120, name: 'Grant a Constitution',
    needs: (nation) => (nation.politics.support.liberal ?? 0) >= 20,
    needText: 'Liberal support 20%',
    effects: { stability: 0.06 }, weeks: 52,
  },
  republic: {
    from: 'constitutional', to: 'republic', cost: 150, name: 'Proclaim the Republic',
    needs: (nation) => (nation.politics.support.liberal ?? 0) + (nation.politics.support.socialist ?? 0) >= 50,
    needText: 'Liberal + socialist support 50%',
    effects: { stability: 0.04, warSupport: 0.05 }, weeks: 52,
  },
  restoration: {
    from: 'constitutional', to: 'absolutism', cost: 150, name: 'Restore Royal Authority',
    needs: (nation) => (nation.politics.support.conservative ?? 0) >= 40,
    needText: 'Conservative support 40%',
    effects: { stability: -0.1 }, weeks: 52,
  },
};

export function regimeBlockers(world, nation, decisionId) {
  const decision = REGIME_DECISIONS[decisionId];
  if (!decision) return ['Unknown decision'];
  const out = [];
  if (nation.politics.government !== decision.from) out.push(`Only from ${GOVERNMENTS[decision.from].name}`);
  if (!decision.needs(nation)) out.push(`Needs ${decision.needText}`);
  if ((nation.power ?? 0) < decision.cost) out.push(`Needs ${decision.cost} political power`);
  return out;
}

export function enactRegime(game, nation, decisionId) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (regimeBlockers(world, nation, decisionId).length) return false;
  const decision = REGIME_DECISIONS[decisionId];
  nation.power -= decision.cost;
  changeGovernment(game, nation, decision.to, turn, decision);
  return true;
}

/** Hükûmet biçimini değiştirir (karar ya da devrim olayı). */
export function changeGovernment(game, nation, to, turn, { effects = null, weeks = 0, name = null } = {}) {
  nation.politics.government = to;
  if (GOVERNMENTS[to].elections) nation.politics.nextElection = turn + 4;
  if (effects) {
    nation.timed = (nation.timed ?? []).filter((entry) => entry.id !== 'regime');
    nation.timed.push({ id: 'regime', label: name ?? GOVERNMENTS[to].name, until: turn + weeks, effects });
  }
  refreshModifiers(nation, turn);
  if (nation.id === game.turns?.playerNation) {
    game.turns.addLog(`${nation.name} is now a ${GOVERNMENTS[to].name}.`, { kind: 'POLITICS' });
  }
  game.emit?.('politics', nation.id);
}

// ---------------------------------------------------------- PROPAGANDA ---

export const PROPAGANDA_COST = 50;
const PROPAGANDA_WEEKS = 52;

export function propagandaBlockers(world, nation, partyId, turn = world.turn ?? 0) {
  const out = [];
  if (!PARTIES[partyId]) return ['Unknown party'];
  if (partyId === 'socialist' && turn < SOCIALIST_TURN) out.push('No socialist movement yet');
  if ((nation.politics.propaganda?.until ?? 0) > turn) out.push('A campaign is already running');
  if ((nation.power ?? 0) < PROPAGANDA_COST) out.push(`Needs ${PROPAGANDA_COST} political power`);
  return out;
}

/** Bir partinin hedef desteğine 52 hafta +12 puan. */
export function runPropaganda(game, nation, partyId) {
  const turn = game.turns?.turn ?? game.world.turn ?? 0;
  if (propagandaBlockers(game.world, nation, partyId, turn).length) return false;
  nation.power -= PROPAGANDA_COST;
  nation.politics.propaganda = { party: partyId, until: turn + PROPAGANDA_WEEKS };
  game.emit?.('politics', nation.id);
  return true;
}

// ---------------------------------------------------------- DANIŞMANLAR ---

/** Yuva başına iki aday; her 5 yılda yenilenir (tohumdan, deterministik). */
export function advisorCandidates(world, nation, turn = world.turn ?? 0) {
  const politics = nation.politics;
  const epoch = Math.floor(Math.max(0, turn) / ADVISOR_EPOCH);
  if (politics.candidates && politics.candidatesEpoch === epoch) return politics.candidates;
  const rng = makeRng(`${world.seed}-advisors-${nation.id}-${epoch}`);
  const candidates = {};
  for (const [slot, info] of Object.entries(ADVISOR_SLOTS)) {
    const pool = [...info.types];
    candidates[slot] = [];
    for (let i = 0; i < 2 && pool.length; i++) {
      const type = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      candidates[slot].push({
        id: `${slot}-${epoch}-${i}`, slot, type: type.id, title: type.title,
        name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`, effects: type.effects,
      });
    }
  }
  politics.candidates = candidates;
  politics.candidatesEpoch = epoch;
  return candidates;
}

export function hireBlockers(world, nation, candidate) {
  const out = [];
  if (!candidate) return ['Unknown advisor'];
  if (nation.politics.advisors?.[candidate.slot]?.id === candidate.id) return ['Already hired'];
  if ((nation.power ?? 0) < ADVISOR_COST) out.push(`Needs ${ADVISOR_COST} political power`);
  return out;
}

export function hireAdvisor(game, nation, candidateId) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const pool = advisorCandidates(world, nation, turn);
  const candidate = Object.values(pool).flat().find((entry) => entry.id === candidateId);
  if (!candidate || hireBlockers(world, nation, candidate).length) return false;
  nation.power -= ADVISOR_COST;
  nation.politics.advisors[candidate.slot] = { ...candidate, since: turn };
  refreshModifiers(nation, turn);
  game.emit?.('politics', nation.id);
  return true;
}

export function dismissAdvisor(game, nation, slot) {
  if (!nation.politics.advisors?.[slot]) return false;
  nation.politics.advisors[slot] = null;
  refreshModifiers(nation, game.turns?.turn ?? 0);
  game.emit?.('politics', nation.id);
  return true;
}

// ------------------------------------------------------------- KAYIPLAR ---

/** Muharebe kaybı (güç puanı): savaş desteğini aşındırır (diplomacy yazar). */
export function noteCasualties(nation, points) {
  if (!nation?.politics || !(points > 0)) return;
  nation.politics.recentLosses = (nation.politics.recentLosses ?? 0) + points;
}

// -------------------------------------------------------- HAFTALIK DÖNGÜ ---

/**
 * Soydaşlar: her halkın nüfusu sahibine göre. Ulusun ana halkının ne kadarı
 * yabancı yönetimde — milliyetçiliğin ve savaş desteğinin yakıtı.
 */
function kinTable(world) {
  const byCulture = new Map();
  for (const province of world.provinces ?? []) {
    const econ = province.econ;
    if (!econ || province.owner < 0) continue;
    const rows = province.cultures?.length ? province.cultures : [{ id: province.culture, share: 1 }];
    for (const row of rows) {
      if (row.id == null || row.id < 0) continue;
      let owners = byCulture.get(row.id);
      if (!owners) byCulture.set(row.id, (owners = new Map()));
      owners.set(province.owner, (owners.get(province.owner) ?? 0) + econ.population * row.share);
    }
  }
  return byCulture;
}

export function kinAbroadShare(world, nation, table = kinTable(world)) {
  const owners = table.get(nation.culture);
  if (!owners) return 0;
  let home = 0;
  let abroad = 0;
  for (const [owner, people] of owners) {
    if (owner === nation.id) home += people;
    else abroad += people;
  }
  return home + abroad > 0 ? abroad / (home + abroad) : 0;
}

/** Halkın ağırlıklı ortalama huzursuzluğu (0-10). */
function averageUnrest(world, nation) {
  let weighted = 0;
  let people = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    weighted += (province.econ.unrest ?? 0) * province.econ.population;
    people += province.econ.population;
  }
  return people > 0 ? weighted / people : 0;
}

/** Saldırgan olduğumuz savaş var mı; savunduğumuz var mı? */
function warPosture(world, nation) {
  let offensive = false;
  let defensive = false;
  for (const other of world.nations) {
    if (other.id === nation.id || !other.alive) continue;
    const rec = world.relations?.[nation.id]?.[other.id];
    if (rec?.state !== 'war') continue;
    if (rec.aggressor === nation.id) offensive = true;
    else defensive = true;
  }
  return { offensive, defensive };
}

/** Parti desteği hedefleri (toplam 100'e normalize). */
export function supportTargets(world, nation, { turn, kin, spring }) {
  const economy = nation.economy ?? {};
  const literacy = economy.literacy ?? 0.1;
  const stability = nation.stability ?? 0.5;
  const consumer = economy.consumer?.ratio ?? 1;
  const icPerUnit = (economy.ic?.total ?? 0) / Math.max(1, (economy.population ?? 0) / 100000);
  const minority = 1 - (economy.acceptedShare ?? 1);
  const raw = {
    conservative: 30 + (stability - 0.5) * 30 + (1 - literacy) * 15
      + (nation.politics.government === 'absolutism' ? 10 : 0),
    liberal: 10 + literacy * 45 + clamp(consumer - 1, 0, 0.5) * 20
      + (lawIndex(nation, 'trade') >= 2 ? 5 : 0) + (spring ? 12 : 0),
    nationalist: 15 + kin * 40 + ((nation.warSupport ?? 0.5) - 0.5) * 20 + minority * 15
      + (spring ? 8 : 0),
    socialist: turn < SOCIALIST_TURN ? 0
      : 5 + Math.min(20, icPerUnit * 60) + clamp(1 - consumer, 0, 0.4) * 40 + (1 - stability) * 10,
  };
  const propaganda = nation.politics.propaganda;
  if (propaganda && propaganda.until > turn && raw[propaganda.party] > 0) raw[propaganda.party] += 12;
  let sum = 0;
  for (const id of PARTY_IDS) {
    raw[id] = id === 'socialist' && turn < SOCIALIST_TURN ? 0 : Math.max(2, raw[id]);
    sum += raw[id];
  }
  for (const id of PARTY_IDS) raw[id] = raw[id] / sum * 100;
  return raw;
}

/** İstikrar hedefinin dökümü (0-1 ölçeğinde parçalar). */
export function stabilityBreakdown(world, nation, turn = world.turn ?? 0) {
  const economy = nation.economy ?? {};
  const parts = [{ label: 'Base', value: 0.5 }];
  const push = (label, value) => {
    if (Math.abs(value) >= 0.005) parts.push({ label, value });
  };
  push('Consumer goods', consumerStability(economy.consumer?.ratio ?? 1));
  const food = economy.resources?.FOOD?.ratio ?? 1;
  push('Food supply', food < 1 ? Math.max(-0.2, (food - 1) * 0.4) : 0);
  push('Laws', lawSum(nation, 'stability'));
  const posture = warPosture(world, nation);
  if (posture.offensive) push('War of aggression', -0.08 * (1 - (nation.warSupport ?? 0.5)));
  push('Occupation', -0.15 * (economy.occupiedShare ?? 0));
  push('Unrest', -0.02 * averageUnrest(world, nation));
  push('Legitimacy', legitimacyOf(nation).hit);
  if ((nation.bankruptUntil ?? 0) > turn) push('Bankruptcy', -0.2);
  push('Repression', economy.repressionHit ?? 0);
  push('Government, advisors, events', mod(nation, 'stability'));
  const target = clamp(parts.reduce((sum, part) => sum + part.value, 0), 0, 1);
  return { parts, target };
}

/** Savaş desteği hedefinin dökümü. */
export function warSupportBreakdown(world, nation, { kin = 0 } = {}) {
  const politics = nation.politics;
  // Taban 0.4'teyken dağılım düzdü (barış p50 0.66, savaş 0.64) ve onu okuyan
  // bütün kapılar (YZ savaş 0.3, teslim 0.2, bezginlik 0.35) p10'un altında
  // kalıyordu: savaş desteği ölü bir frendi.
  const parts = [{ label: 'Base', value: 0.25 }];
  const push = (label, value) => {
    if (Math.abs(value) >= 0.005) parts.push({ label, value });
  };
  push('National temperament', ((nation.aggression ?? 1) - 1) * 0.2);
  push('Kin under foreign rule', Math.min(0.2, kin * 0.4));
  const posture = warPosture(world, nation);
  if (posture.defensive) push('Defending the homeland', 0.2);
  let strength = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId === nation.id) strength += (unit.regiments?.length ?? 1) * 1000;
  }
  push('Casualties', -Math.min(0.3, (politics.recentLosses ?? 0) / Math.max(4000, strength) * 0.6));
  push('War weariness', -Math.min(0.2, (politics.warWeeks ?? 0) / 26 * 0.03));
  push('Nationalist support', (politics.support.nationalist ?? 0) / 100 * 0.2);
  push('Government, advisors, events', mod(nation, 'warSupport'));
  const target = clamp(parts.reduce((sum, part) => sum + part.value, 0), 0, 1);
  return { parts, target };
}

/** Haftalık SG geliri ve dökümü. */
export function powerIncome(nation) {
  const base = 1.0;
  const bonus = mod(nation, 'power');
  const stability = 0.5 + clamp(nation.stability ?? 0.5, 0, 1);
  return { base, bonus, stability, total: Math.max(0, (base + bonus) * stability) };
}

const approach = (value, target, step) => value + clamp(target - value, -step, step);

export function runPolitics(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const kin = kinTable(world);
  const spring = (world.spring?.until ?? 0) > turn;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const politics = ensurePolitics(world, nation);
    const economy = nation.economy ?? {};
    const kinShare = kinAbroadShare(world, nation, kin);
    economy.kinAbroad = kinShare;

    // Parti desteği hedefe ayda ~%12 yaklaşır.
    const targets = supportTargets(world, nation, { turn, kin: kinShare, spring });
    for (const id of PARTY_IDS) politics.support[id] += (targets[id] - politics.support[id]) * 0.03;

    // Savaş sayaçları: kayıp yılda yarıya iner, savaş haftası barışta söner.
    politics.recentLosses = (politics.recentLosses ?? 0) * 0.985;
    politics.warWeeks = (economy.warFronts ?? 0) > 0 ? (politics.warWeeks ?? 0) + 1
      : Math.max(0, (politics.warWeeks ?? 0) - 4);

    const stability = stabilityBreakdown(world, nation, turn);
    politics.stabilityParts = stability.parts;
    politics.stabilityTarget = stability.target;
    nation.stability = approach(nation.stability ?? 0.5, stability.target, 0.01);

    const war = warSupportBreakdown(world, nation, { kin: kinShare });
    politics.warSupportParts = war.parts;
    politics.warSupportTarget = war.target;
    nation.warSupport = approach(nation.warSupport ?? 0.4, war.target, 0.01);

    nation.power = Math.min(POWER_CAP, (nation.power ?? 0) + powerIncome(nation).total);

    // Seçim: dört yılda bir, en çok destek alan parti kurar. Meşrutiyette
    // taç muhafazakârları 10 puan farka kadar iktidarda tutar.
    if (governmentOf(nation).elections && turn >= (politics.nextElection ?? 0)) {
      politics.nextElection = turn + ELECTION_WEEKS;
      const leader = leadingParty(nation);
      const keepCrown = politics.government === 'constitutional'
        && politics.ruling === 'conservative'
        && (politics.support[leader] ?? 0) - (politics.support.conservative ?? 0) <= 10;
      const winner = keepCrown ? 'conservative' : leader;
      if (nation.id === game.turns?.playerNation) {
        game.turns.addLog(`Elections: ${PARTIES[winner].name} win ${Math.round(politics.support[winner])}% of the vote.`,
          { kind: 'POLITICS' });
      }
      setRuling(game, nation, winner, turn);
    }
    enforceLawRequirements(world, nation);
    advisorCandidates(world, nation, turn);
  }
  game.emit?.('politics', null);
}

// ------------------------------------------------------------------- YZ ---

/**
 * YZ ve AUTO'nun siyaset kararı: ayda bir, tek adım. Sıra: danışman (boş
 * yuva), duruma göre yasa (savaşta seferberlik, barışta geri dönüş, eğitim,
 * ticaret), mutlakiyette en sevilen partiyi iktidara almak.
 */
export function politicsAI(game, nation, { appoint = true } = {}) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if ((turn + nation.id) % 4 !== 0) return;
  const politics = ensurePolitics(world, nation);
  const economy = nation.economy ?? {};
  const atWar = (economy.warFronts ?? 0) > 0;
  const tryLaw = (lawId, index) => index >= 0 && index < LAWS[lawId].options.length
    && !lawBlockers(world, nation, lawId, index, turn).length
    && setLaw(game, nation, lawId, index);

  // 1. Boş danışman yuvası.
  const pool = advisorCandidates(world, nation, turn);
  const order = nation.focus === 'military' ? ['military', 'economy', 'political']
    : nation.focus === 'admin' ? ['political', 'economy', 'military'] : ['economy', 'military', 'political'];
  for (const slot of order) {
    if (politics.advisors[slot] || (nation.power ?? 0) < ADVISOR_COST + 20) continue;
    if (hireAdvisor(game, nation, pool[slot][0].id)) return;
  }
  // 2. Savaş yasaları.
  const conscription = lawIndex(nation, 'conscription');
  const economyLaw = lawIndex(nation, 'economy');
  if (atWar) {
    if (economyLaw < 2 && tryLaw('economy', economyLaw + 1)) return;
    if (conscription < 2 && tryLaw('conscription', conscription + 1)) return;
  } else if ((politics.warWeeks ?? 0) === 0) {
    // Barışta sivil ekonomiye döner: kısmi seferberlikte IC'nin ~%25'i hiçbir
    // şey üretmiyordu (teçhizat hiç bağlamıyor; ölçüldü), tüketim malı açığı
    // %11-20'ydi. Sivile dönünce açık %3-6, IC ve sınırlar gürültü içinde.
    if (economyLaw > 0 && tryLaw('economy', 0)) return;
    if (conscription > 1 && tryLaw('conscription', 1)) return;
  }
  // 3. Barış yasaları: tüketim malı eksikse sivil ekonomi, okul, ticaret.
  if (!atWar && (economy.consumer?.ratio ?? 1) < 0.95 && economyLaw > 0 && tryLaw('economy', economyLaw - 1)) return;
  const education = lawIndex(nation, 'education');
  if (education < 2 && (economy.ledger?.net ?? 0) > economy.population / 100000 * 0.15
    && tryLaw('education', education + 1)) return;
  if ((nation.stability ?? 0.5) < 0.35 && lawIndex(nation, 'tax') === 2 && tryLaw('tax', 1)) return;
  if ((nation.gold ?? 0) < 0 && lawIndex(nation, 'tax') === 0 && tryLaw('tax', 1)) return;
  // 4. Mutlakiyette halkın partisi (fark 8 puanı aşınca: ceza 8 istikrar).
  const legitimacy = legitimacyOf(nation);
  if (appoint && legitimacy.gap > 8 && appointGovernment(game, nation, legitimacy.leader)) return;
}

/** Siyaset ekranının modeli. */
export function governmentView(world, nation, turn = world.turn ?? 0) {
  const politics = ensurePolitics(world, nation);
  return {
    government: governmentOf(nation),
    ruling: rulingParty(nation),
    leader: PARTIES[leadingParty(nation)],
    legitimacy: legitimacyOf(nation),
    support: PARTY_IDS.map((id) => ({
      ...PARTIES[id],
      support: politics.support[id] ?? 0,
      ruling: politics.ruling === id,
      appointBlockers: rulingBlockers(world, nation, id, turn),
      propagandaBlockers: propagandaBlockers(world, nation, id, turn),
    })),
    nextElection: governmentOf(nation).elections ? politics.nextElection : null,
    propaganda: politics.propaganda && politics.propaganda.until > turn ? politics.propaganda : null,
    power: nation.power ?? 0,
    powerIncome: powerIncome(nation),
    stability: nation.stability ?? 0,
    stabilityTarget: politics.stabilityTarget ?? nation.stability,
    stabilityParts: politics.stabilityParts ?? [],
    warSupport: nation.warSupport ?? 0,
    warSupportTarget: politics.warSupportTarget ?? nation.warSupport,
    warSupportParts: politics.warSupportParts ?? [],
    laws: LAW_IDS.map((id) => ({
      ...LAWS[id],
      current: lawIndex(nation, id),
      lock: Math.max(0, (politics.lawLocks?.[id] ?? 0) - turn),
      options: LAWS[id].options.map((option, index) => ({
        ...option, index, blockers: lawBlockers(world, nation, id, index, turn),
      })),
    })),
    lawCost: lawCost(nation),
    advisors: Object.entries(ADVISOR_SLOTS).map(([slot, info]) => ({
      slot,
      name: info.name,
      hired: politics.advisors?.[slot] ?? null,
      candidates: (advisorCandidates(world, nation, turn)[slot] ?? []).map((candidate) => ({
        ...candidate, blockers: hireBlockers(world, nation, candidate),
      })),
    })),
    regimes: Object.entries(REGIME_DECISIONS)
      .filter(([, decision]) => decision.from === politics.government)
      .map(([id, decision]) => ({ id, ...decision, blockers: regimeBlockers(world, nation, id) })),
  };
}
