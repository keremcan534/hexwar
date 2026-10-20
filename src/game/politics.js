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
//   nation.warSupport  0-1: İRADE — savaşın başında toplanır, düşman
//                      topraktayken sertleşir; savaş yasalarını ÇIKARMA kapısı
//   politics.exhaustion 0-1: YORGUNLUK — savaşın bedeli (kayıp, yıl, işgal,
//                      yenilgi, kıtlık, silah altındaki insan). Barışı,
//                      devrimi ve imparatorluğun dağılmasını bu getirir
//                      (redesign D5; merdiven EXHAUSTION_LADDER).
//
// Yasa VERİSİ laws.js'tedir (ekonomi/kültür/ordu oradan okur); burası
// değiştirme kurallarını ve siyasi döngüyü tutar.

import { makeRng } from '../core/rng.js';
import { LAWS, LAW_IDS, lawIndex, lawSum } from './laws.js';
import { mod, refreshModifiers, registerModifierSource } from './modifiers.js';
import { consumerStability } from './econ/industry.js';
import { START_EDUCATION, START_GOVERNMENT } from './era.js';
import { worldPartyTargets, worldWarTension } from './worldEvents.js';
import { IC_SCALE } from './econ/defs.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    effects: { output: 0.03, research: 0.1 },
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
    limits: { education: [1, 2], labour: [0, 1] },
    pitch: 'Bread, schools and the eight-hour day.',
  },
};
export const PARTY_IDS = Object.keys(PARTIES);

/** Danışman türleri: yuva başına beş-altı kişilik, her biri tek bonus. */
export const ADVISOR_SLOTS = {
  economy: { name: 'Economy', types: [
    { id: 'industrialist', title: 'Industrialist', effects: { ic: 0.08 } },
    { id: 'railway_baron', title: 'Railway Baron', effects: { investment: 0.15 } },
    { id: 'free_trader', title: 'Free Trader', effects: { exportIncome: 0.2, importCost: -0.1 } },
    { id: 'agronomist', title: 'Agronomist', effects: { food: 0.1, growth: 0.1 } },
    { id: 'financier', title: 'Financier', effects: { output: 0.05 } },
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
  const tier = Math.max(0, Math.min(2, nation.devTier ?? 0));
  const government = START_GOVERNMENT[tier];
  // 1900: sosyalist hareket kurulmuştur; destek ilk haftadan hedefe yaklaşır.
  const support = { conservative: 40, liberal: 25, nationalist: 25, socialist: 10 };
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
    // Devletin rotası merkezden başlar: yön çizilmedikçe hiçbir partiyi çekmez.
    course: { x: 0, y: 0 },
    heading: null,
    courseBudget: 0,
    recentLosses: 0,
    warWeeks: 0,
    exhaustion: 0,
    exhaustionTarget: 0,
    exhaustionParts: [],
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
  if (!Number.isFinite(politics.exhaustion)) politics.exhaustion = 0;
  return politics;
}

export function initPolitics(world) {
  for (const nation of world.nations) {
    nation.politics = null;
    ensurePolitics(world, nation);
    // Eğitim yasası başlangıç okuryazarlığını taşır (era.js): yoksa okuryazarlık
    // ilk on yılda yasanın hedefine geri akar.
    nation.politics.laws.education = START_EDUCATION[Math.max(0, Math.min(2, nation.devTier ?? 0))];
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
  // Rota: düzen yarısı seçilmiş bir militarizasyon (savaş desteği), reform
  // yarısı halkların sükûneti. Döngü değil seçim: rotayı oyuncu/YZ çizer.
  const y = politics.course?.y ?? 0;
  if (y < -0.01) out.push({ label: 'Course of the state: order', effects: { warSupport: COURSE.ORDER_WILL * -y } });
  if (y > 0.01) out.push({ label: 'Course of the state: reform', effects: { unrest: COURSE.REFORM_UNREST * y } });
  return out;
});

// ------------------------------------------------------------- YASALAR ---

export function lawCost(nation) {
  return Math.round(LAW_COST * Math.max(0.3, 1 + mod(nation, 'lawCost')));
}

function atWarWithAnyone(world, nation) {
  return (nation.economy?.warFronts ?? 0) > 0;
}

/** Savaş kaydının KÖK nedeni: müttefik çağrısıyla girilen savaş, saldırganın savaşının nedenini taşır. */
function rootReason(world, rec) {
  if (rec?.reason !== 'alliance') return rec?.reason ?? null;
  // Çağrı kaydı `calledBy`'ı saklamaz (diplomacy.setState); asıl saldırganın
  // (rec.aggressor) kriz savaşı varsa çağrılan müttefik de büyük savaştadır.
  const row = world.relations?.[rec.aggressor] ?? [];
  for (let id = 0; id < row.length; id++) {
    const other = row[id];
    if (other?.state === 'war' && other.reason === 'crisis') return 'crisis';
  }
  return 'alliance';
}

/** Ulusun savaş kayıtları (yalnız açık savaş, canlı düşman), ulus kimliği sırasıyla. */
function warRecords(world, nation) {
  const out = [];
  for (const other of world.nations) {
    if (other.id === nation.id || !other.alive) continue;
    const rec = world.relations?.[nation.id]?.[other.id];
    if (rec?.state === 'war') out.push({ other, rec });
  }
  return out;
}

/** Toplam savaşın canlı nedeni (yoksa null): 'soil' | 'crisis' | 'year'. */
function totalWarCause(world, nation) {
  if ((nation.economy?.occupiedShare ?? 0) >= TOTAL_WAR.OCCUPIED) return 'soil';
  if (warRecords(world, nation).some(({ rec }) => rootReason(world, rec) === 'crisis')) return 'crisis';
  if ((nation.politics?.warWeeks ?? 0) >= TOTAL_WAR.WEEKS) return 'year';
  return null;
}

/** Toplam savaş eşikleri (redesign D5). */
export const TOTAL_WAR = { OCCUPIED: 0.05, WEEKS: 52 };
export const TOTAL_WAR_BLOCKER = 'Only in a total war — the enemy on our soil, a year of war, or a great war';

/**
 * TOPLAM SAVAŞ: savaşta VE (düşman toprağımızın %5'inde YA DA bir yıldır
 * savaşıyoruz YA DA kök nedeni kriz olan bir savaştayız). 3. kademe yasalar
 * yalnız burada çıkar.
 *
 * YAPIŞKAN: bir kez toplam savaşa giren ülke barışa kadar orada kalır
 * (`politics.totalWarSince`, runPolitics yazar, barışta siler). Neden: yasa
 * kilidi savaş yasalarını barışa kadar tutar; işgal %5'in altına çekilince
 * hâl düşseydi ya Total Mobilisation savaşın ortasında ZORLA inerdi (kilit
 * yalan olurdu) ya da yasa toplam savaşın dışında dururdu. İki kabul hedefi
 * (savaşta zorla düşüş 0, toplam savaş dışında 3. kademe %0) aynı anda ancak
 * böyle tutar: savaş bir kez topyekûn olduysa barışa kadar topyekûndur.
 */
export function totalWarState(world, nation) {
  if (!atWarWithAnyone(world, nation)) return false;
  if (nation.politics?.totalWarSince != null) return true;
  return totalWarCause(world, nation) != null;
}

/** Oyuncuya okunan toplam savaş gerekçesi ("the enemy holds 18% of our land"). */
function totalWarReason(world, nation) {
  const cause = totalWarCause(world, nation);
  if (cause === 'soil') return `the enemy holds ${Math.round((nation.economy?.occupiedShare ?? 0) * 100)}% of our land`;
  if (cause === 'crisis') return 'a great war';
  if (cause === 'year') return 'a year of war';
  return 'the war has become total';
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
  const atWar = atWarWithAnyone(world, nation);
  // Savaşta bir savaş yasasını YÜKSELTMEK 26 haftalık kilide takılmaz: kilit
  // gidip gelmeyi önler, savaşta ise yasa barışa kadar zaten inmez. Kilit
  // tırmanışı tutuyordu: Extensive 4-8. haftada çıkınca toprağı işgal edilen
  // savunan Total Mobilisation'a ancak 30-34. haftada geçebiliyordu.
  const raising = atWar && WAR_LAW_LOCK.raiseAtWar && WAR_LAW_IDS.includes(lawId) && index > lawIndex(nation, lawId);
  const lock = politics.lawLocks?.[lawId] ?? 0;
  if (lock > turn && !raising) out.push(`Changed recently (${lock - turn} weeks)`);
  const limits = rulingParty(nation).limits?.[lawId];
  if (limits && (index < limits[0] || index > limits[1])) {
    out.push(`${rulingParty(nation).name} will not pass it`);
  }
  const option = law.options[index];
  if (option.warSupport && (nation.warSupport ?? 0) < option.warSupport
    && !(option.atWarOr && atWar)) {
    out.push(`Needs war support ${Math.round(option.warSupport * 100)}%`);
  }
  // Toplam savaş şartı "yalnız savaşta"yı kapsar: iki satır aynı şeyi söylemesin.
  if (option.needsTotalWar && !totalWarState(world, nation)) out.push(TOTAL_WAR_BLOCKER);
  else if (option.needsWar && !atWar) out.push('Only at war');
  const cost = lawCost(nation);
  if ((nation.power ?? 0) < cost) out.push(`Needs ${cost} political power`);
  return out;
}

/** `log`: oyuncuya basılan satır (AUTO'nun tırmanışı gerekçesiyle duyurulur). */
export function setLaw(game, nation, lawId, index, { log = null } = {}) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (lawBlockers(world, nation, lawId, index, turn).length) return false;
  nation.power -= lawCost(nation);
  nation.politics.laws[lawId] = index;
  nation.politics.lawLocks[lawId] = turn + LAW_LOCK;
  // Toplam savaş yasası çıktıysa hâl o anda yapışır: YZ evresi geçen haftanın
  // işgal payını okuyabilir, siyaset evresi bu haftanınkini — arada hâl
  // düşerse kilitli yasa savaşın ortasında zorla inerdi.
  if (LAWS[lawId].options[index].needsTotalWar) nation.politics.totalWarSince ??= turn;
  refreshModifiers(nation, turn);
  if (nation.id === game.turns?.playerNation) {
    game.turns.addLog(log ?? `New law: ${LAWS[lawId].options[index].name}.`, { kind: 'POLITICS' });
  }
  game.emit?.('politics', nation.id);
  return true;
}

/**
 * Savaş kilidi. `enabled` false = eski kural (savaşta da irade testi; kol
 * mechanic-health 'war-law-lock'). `raiseAtWar`: savaşta savaş yasasını
 * yükseltmek değişiklik kilidine takılmaz (bkz. lawBlockers).
 */
export const WAR_LAW_LOCK = { enabled: true, raiseAtWar: true };
const WAR_LAW_IDS = ['conscription', 'economy'];

/**
 * Artık tutulamayan yasa kendiliğinden geri iner — bedava ve kilitsiz.
 *
 * SAVAŞ KİLİDİ (redesign D5): savaşta irade testi YAPILMAZ; yalnız
 * needsWar/needsTotalWar sorulur (toplam savaş yapışkan olduğu için savaşta
 * ikisi de tutar). Eskiden irade şartın 0.1 altına inince Extensive savaşın
 * ortasında Limited'e iniyordu: STAT1|STAT2'de 31|34 kez, %84'ü saldıran,
 * ortanca savaş haftası 50-62 (u5) — "savaşıyoruz, o yüzden silahsızlanıyoruz".
 * Terhis barıştan sonradır: barışta düşen yasa oyuncuya gerekçesiyle yazılır.
 */
function enforceLawRequirements(game, world, nation) {
  const atWar = atWarWithAnyone(world, nation);
  const locked = atWar && WAR_LAW_LOCK.enabled;
  const ws = nation.warSupport ?? 0;
  for (const id of ['conscription', 'economy']) {
    const from = lawIndex(nation, id);
    let index = from;
    let why = null;
    while (index > 0) {
      const option = LAWS[id].options[index];
      const warOk = (!option.needsWar || atWar) && (!option.needsTotalWar || totalWarState(world, nation));
      const willOk = locked || !option.warSupport || ws >= option.warSupport - 0.1
        || (option.atWarOr && atWar);
      if (warOk && willOk) break;
      why ??= !warOk ? 'it was a war measure'
        : `war support ${Math.round(ws * 100)}% < ${Math.round((option.warSupport - 0.1) * 100)}%`;
      index--;
    }
    nation.politics.laws[id] = index;
    if (index < from && nation.id === game.turns?.playerNation) {
      const options = LAWS[id].options;
      const after = (nation.politics.warWeeks ?? 0) > 0 && !atWar ? 'With the peace, ' : '';
      const to = index < from - 1 ? ` to ${options[index].name}` : '';
      game.turns.addLog(`${after}${options[from].name} lapses${to} (${why}).`, { kind: 'POLITICS' });
    }
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

export function setRuling(game, nation, partyId, turn) {
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

// ------------------------------------------------------ DEVLETİN ROTASI ---
//
// TASARIM D4 (Kerem 2026-10-15: "partileri sürekli tıklayarak ilerletmek
// tasarım hatası — PP'nin bir kısmını verip ya da HOI3 usülü karede bir
// tarafa ilerlemeyi seçerek"). Propaganda tık başına +12 ham puan veriyordu;
// %3'lük haftalık yaklaşmada etkisi 1. yıl +4.4, 3. yıl +0.3'e eriyordu ve
// bir duruşu tutmak kampanya başına ~45 tıktı; YZ onu hiç kullanmıyordu
// (ölçüldü). Kare: x seçkin (−1) ↔ halk (+1), y düzen (−1) ↔ reform (+1);
// köşelerde dört parti. Oyuncu bir YÖN seçer ve PP gelirinin bir payıyla
// (%15/%30) rotayı oraya sürükler; rotayı TUTMAK bedavadır. Rota yakın
// partilerin desteğini çeker; düzen yarısı savaş desteği, reform yarısı
// halkların sükûneti verir.

export const COURSE = {
  CORNERS: { conservative: [-1, -1], nationalist: [1, -1], socialist: [1, 1], liberal: [-1, 1] },
  /** Haftalık adım = SPEED × finansman (merkezden köşeye Yüksek'te ~94 hafta). */
  SPEED: 0.05,
  /** Köşedeki partiye +24, ötekilere −8 ham puan; merkezde 0. */
  PULL: 8,
  BUDGETS: [0, 0.15, 0.30],
  ORDER_WILL: 0.10,
  REFORM_UNREST: -0.10,
};

const courseWeight = (course, id) => {
  const [cx, cy] = COURSE.CORNERS[id];
  return ((1 + course.x * cx) / 2) * ((1 + course.y * cy) / 2);
};

/** Rotanın en yakın partisi (köşe ağırlığı en büyük). */
export function courseLeaning(course) {
  return PARTY_IDS.reduce((best, id) => (courseWeight(course, id) > courseWeight(course, best) ? id : best), PARTY_IDS[0]);
}

/** Oyuncunun ve YZ'nin tek kapısı: yön (null = dur) ve finansman. */
export function setCourse(nation, heading, budget = COURSE.BUDGETS[1]) {
  const politics = nation?.politics;
  if (!politics) return false;
  politics.heading = heading ? { x: clamp(heading.x, -1, 1), y: clamp(heading.y, -1, 1) } : null;
  if (budget != null) politics.courseBudget = clamp(budget, 0, COURSE.BUDGETS.at(-1));
  return true;
}

/** Haftalık adım: PP gelirinin payı ödenir, rota yöne kayar. Döner: ödenen SG. */
function stepCourse(nation, income) {
  const politics = nation.politics;
  const heading = politics.heading;
  const budget = politics.courseBudget ?? 0;
  if (!heading || !(budget > 0) || !politics.course) return 0;
  const dx = heading.x - politics.course.x;
  const dy = heading.y - politics.course.y;
  const dist = Math.hypot(dx, dy);
  if (dist <= 0.01) return 0;
  const step = Math.min(dist, COURSE.SPEED * budget);
  politics.course = { x: politics.course.x + (dx / dist) * step, y: politics.course.y + (dy / dist) * step };
  return income * budget;
}

/** Ekranın okuduğu rota durumu (sayıyı ekran kurmaz). */
export function courseView(nation) {
  const politics = nation.politics ?? {};
  const course = politics.course ?? { x: 0, y: 0 };
  const heading = politics.heading ?? null;
  const budget = politics.courseBudget ?? 0;
  const income = powerIncome(nation).total;
  const dist = heading ? Math.hypot(heading.x - course.x, heading.y - course.y) : 0;
  const moving = Boolean(heading) && budget > 0 && dist > 0.01;
  return {
    course, heading, budget, budgets: COURSE.BUDGETS,
    leaning: courseLeaning(course),
    toward: heading ? courseLeaning(heading) : null,
    weeklyCost: moving ? income * budget : 0,
    weeks: moving ? Math.ceil(dist / (COURSE.SPEED * budget)) : null,
    corners: COURSE.CORNERS,
  };
}

// Propaganda kalktı (rota yerine geçti); eski dışa aktarımlar ekran ve
// denetim içe aktarmaları kırılmasın diye kapalı kapı olarak durur.
export const PROPAGANDA_COST = 50;
export function propagandaBlockers() {
  return ['Replaced by the course of the state.'];
}
export function runPropaganda() {
  return false;
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

/**
 * İRREDENTA tablosu (redesign D5, P5b): her ulus için ana halkının SINIRIMIZA
 * KOMŞU yabancı kümelerde yaşayan nüfusu. Soydaş terimi (kinAbroadShare)
 * halkın NEREDE olursa olsun yabancı yönetimdeki payını sayıyordu ve kültürler
 * iki ulusa bir düşecek kadar büyük olduğu için ulusların 50-56'sında 0.2
 * tavanına yapışıktı (P0: ortalama 0.18 her dünyada) — irade için sabit bir
 * zemin, kaldıraç değil. Bitişik kayıp toprak gerçek bir "geri alınacak yer"dir.
 * @returns {Float64Array} ulus kimliğine göre sınır ötesi soydaş nüfusu
 */
function irredentaTable(world) {
  const nations = world.nations;
  const border = new Float64Array(nations.length);
  const provinces = world.provinces ?? [];
  const seen = new Set();
  for (const province of provinces) {
    const owner = province.owner;
    if (owner < 0 || !province.econ) continue;
    seen.clear();
    for (const id of province.neighbors ?? []) {
      const other = provinces[id]?.owner;
      if (other == null || other < 0 || other === owner || seen.has(other)) continue;
      seen.add(other);
      const culture = nations[other]?.culture;
      if (culture == null) continue;
      const rows = province.cultures?.length ? province.cultures : [{ id: province.culture, share: 1 }];
      for (const row of rows) {
        if (row.id === culture) border[other] += province.econ.population * row.share;
      }
    }
  }
  return border;
}

/** Ana halkın sınırımıza komşu yabancı kümelerde yaşayan payı (0-1). */
export function irredentaShare(world, nation, border = irredentaTable(world), table = kinTable(world)) {
  const owners = table.get(nation.culture);
  if (!owners) return 0;
  let total = 0;
  for (const people of owners.values()) total += people;
  return total > 0 ? Math.min(1, (border[nation.id] ?? 0) / total) : 0;
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
export function supportTargets(world, nation, { turn, kin, wave = {} }) {
  const economy = nation.economy ?? {};
  const literacy = economy.literacy ?? 0.1;
  const stability = nation.stability ?? 0.5;
  const consumer = economy.consumer?.ratio ?? 1;
  // Sanayi birimi eski fabrika IC'sinin IC_SCALE katı: işçi sınıfının ağırlığı aynı kalsın.
  const icPerUnit = (economy.ic?.total ?? 0) / IC_SCALE / Math.max(1, (economy.population ?? 0) / 100000);
  const minority = 1 - (economy.acceptedShare ?? 1);
  const raw = {
    conservative: 30 + (stability - 0.5) * 30 + (1 - literacy) * 15
      + (nation.politics.government === 'absolutism' ? 10 : 0),
    liberal: 10 + literacy * 45 + clamp(consumer - 1, 0, 0.5) * 20
      + (lawIndex(nation, 'trade') >= 2 ? 5 : 0) + (wave.liberal ?? 0),
    nationalist: 15 + kin * 40 + ((nation.warSupport ?? 0.5) - 0.5) * 20 + minority * 15
      + (wave.nationalist ?? 0),
    socialist: 5 + Math.min(20, icPerUnit * 60) + clamp(1 - consumer, 0, 0.4) * 40 + (1 - stability) * 10
      + (wave.socialist ?? 0),
  };
  // Devletin rotası yakın partileri çeker (köşede +24/−8, merkezde 0).
  const course = nation.politics.course;
  if (course) for (const id of PARTY_IDS) raw[id] += COURSE.PULL * (4 * courseWeight(course, id) - 1);
  let sum = 0;
  for (const id of PARTY_IDS) {
    raw[id] = Math.max(2, raw[id]);
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
  // İkmal krizi iflasın yerine: faturaların ödenmeyen payı oranında.
  push('Supply crisis', -0.2 * (1 - (economy.bills?.s ?? 1)));
  push('Repression', economy.repressionHit ?? 0);
  // Yorgunluğun istikrara TEK kapısı (redesign §3 #13): 0.3'ün üstünde,
  // en çok −0.105. Devrim (0.75), huzursuzluğun savaş terimi ve levée ayrı
  // kanallardır; bu terim savaşın kendisinin bedelidir.
  push('War exhaustion', -EXHAUSTION.STABILITY * Math.max(0, (nation.politics?.exhaustion ?? 0) - EXHAUSTION.STABILITY_FROM));
  push('Government, advisors, events', mod(nation, 'stability'));
  const target = clamp(parts.reduce((sum, part) => sum + part.value, 0), 0, 1);
  return { parts, target };
}

// ------------------------------------------------- İRADE VE YORGUNLUK ---
//
// redesign D5. Savaş desteği ulusun İRADESİDİR: savaşın başında toplanır,
// düşman topraktayken sertleşir. Kayıp ve savaş yılı artık iradeyi değil
// YORGUNLUĞU besler; yorgunluk barışı, devrimi ve dağılmayı getirir. Eskiden
// ikisi tek sayıydı: saldıranın iradesi yalnız düşüyordu (104. haftada .40/.43,
// u5) ve düşen irade savaş yasalarını savaşın ortasında indiriyordu.

/** İrade hedefinin sabitleri (redesign D5 tablosu). */
export const WILL = {
  BASE: 0.25,
  KIN_RATE: 0.4,
  KIN_CAP: 0.2,
  // P5b: soydaş terimi yerine bitişik irredenta (bkz. irredentaTable);
  // false = P5'in soydaş terimi (kol). Tavan, redesign'ın düğmesi (0.10-0.20):
  // BORDER1-6 × 45 yıl barış iradesi medyanı soydaş kolunda 0.643; irredenta
  // 0.10 → 0.569, 0.15 → 0.592, 0.20 → 0.608 (P5'in ±0.05'i yalnız 0.20'de).
  // Oran sabittir: irredenta payının ortalaması 0.18-0.23, terim ~0.09-0.10.
  irredenta: true,
  IRREDENTA_RATE: 0.5,
  IRREDENTA_CAP: 0.20,
  // Bayrak etrafında toplanma: savunan her zaman, saldıran yalnız haklı
  // gerekçeyle (kriz, bağımsızlık, hedef kümede kendi halkımız). Tekdüze
  // yükseltme saldıranı güçlendirip sınır kartopunu yeniden açardı.
  RALLY_DEFENDER: 0.15,
  RALLY_ATTACKER: 0.08,
  RALLY_WEEKS: 52,
  // Eskiden düz +0.20'ydi ve savunanın bütün iradesi oydu; artık toplanma,
  // toprak ve savunma üç ayrı parçadır.
  DEFENDING: 0.10,
  SOIL_RATE: 1.25,
  SOIL_CAP: 0.25,
  // İrade ancak yorgunluk 0.5'i aşınca çatlar: −0.25'e kadar.
  CRACK: 0.25,
  CRACK_FROM: 0.5,
  // Savaşta hedef yukarıdaysa haftada 0.03 (toplanma 4-8 haftada görünür;
  // 0.01'de 13-26 hafta sürüyordu), başka her durumda 0.01.
  STEP_UP_AT_WAR: 0.03,
  STEP: 0.01,
};

/** Yorgunluk hedefinin sabitleri (redesign D5 tablosu). */
export const EXHAUSTION = {
  // Kayıp: recentLosses güç puanıdır (alay 1000 puan = 30.000 kişi); nüfusa
  // bölünür ki seferberlik payı sulandırmasın (eski irade terimi ordu
  // boyuna bölünüyordu: küçük ordu hemen doyuyordu).
  // Katsayı P5'te oturtuldu (STAT1-3, 160×96): 25'te parça 52. haftada p75
  // tavana (0.40) dayanıyor, kaybedenin barıştaki yorgunluğu p50 .57/.57/.66,
  // savaş haftalarının %5-7'si ≥ 0.99'du; 12'de .46/.47/.47 ve %3-5.
  CASUALTY: 12,
  CASUALTY_CAP: 0.40,
  MEN_PER_POINT: 30,
  YEAR_RATE: 0.10,
  YEAR_CAP: 0.30,
  YEAR_DEPTH: 0.05,
  YEAR_FLOOR: 0.33,
  SOIL: 0.40,
  DEFEAT: 0.20,
  DEFEAT_SCALE: 50,
  SHORTAGE: 0.15,
  BURDEN: 3,
  BURDEN_FREE: 0.06,
  LEVEE: 0.10,
  UP: 0.02,
  DOWN: 0.01,
  STABILITY: 0.15,
  STABILITY_FROM: 0.3,
};

/**
 * YORGUNLUK MERDİVENİ — tek tablo; arayüz bunu basar (P10), okuyucular aynı
 * eşikleri kullanır (ai.js 0.30/0.85, eventCards 0.45/0.75, identity 0.6,
 * movements 0.5/0.6/0.85).
 */
export const EXHAUSTION_LADDER = [
  { at: 0.30, key: 'noNewWars', text: 'no new wars' },
  { at: 0.45, key: 'weariness', text: 'weariness' },
  { at: 0.50, key: 'falters', text: 'our peoples\' breaking point falls' },
  { at: 0.60, key: 'peacefulExit', text: 'they leave peacefully' },
  { at: 0.75, key: 'revolution', text: 'revolution risk' },
  { at: 0.85, key: 'capitulation', text: 'capitulation, the old order collapses' },
];

/**
 * Haklı gerekçe: kriz (büyük savaşın kıvılcımı), bağımsızlık ya da hedef
 * kümede kendi halkımız / anayurdumuz. Saldıranın toplanması yalnız bununla.
 */
function justCause(world, nation, rec) {
  const reason = rootReason(world, rec);
  if (reason === 'crisis' || reason === 'independence') return true;
  const goal = world.provinces?.[rec.goals?.[nation.id] ?? -1];
  return Boolean(goal) && (goal.culture === nation.culture || goal.homeland === nation.culture);
}

/**
 * Toplanma ve duruş. Her savaşın kendi toplanması `since`'ten 52 haftada
 * söner; en büyüğü alınır (en genç savunma savaşı hep en büyüktür, böylece
 * "en genç savaşımız" kuralı haklı gerekçesiz yeni bir saldırının eski
 * savunmanın toplanmasını silmesine yol açmaz).
 */
function warRally(world, nation, turn) {
  let defensive = false;
  let rally = 0;
  for (const { rec } of warRecords(world, nation)) {
    const defender = rec.aggressor !== nation.id;
    if (defender) defensive = true;
    const size = defender ? WILL.RALLY_DEFENDER : justCause(world, nation, rec) ? WILL.RALLY_ATTACKER : 0;
    if (!size) continue;
    const fade = Math.max(0, 1 - Math.max(0, turn - (rec.since ?? turn)) / WILL.RALLY_WEEKS);
    rally = Math.max(rally, size * fade);
  }
  return { defensive, rally };
}

/** Savaş desteği (irade) hedefinin dökümü. */
export function warSupportBreakdown(world, nation, { kin = 0, irredenta = null, turn = world.turn ?? 0 } = {}) {
  const politics = nation.politics;
  // Taban 0.4'teyken dağılım düzdü (barış p50 0.66, savaş 0.64) ve onu okuyan
  // bütün kapılar (YZ savaş 0.3, teslim 0.2, bezginlik 0.35) p10'un altında
  // kalıyordu: savaş desteği ölü bir frendi. Tekdüze yükseltme yok (D5).
  const parts = [{ label: 'Base', value: WILL.BASE }];
  const push = (label, value) => {
    if (Math.abs(value) >= 0.005) parts.push({ label, value });
  };
  push('National temperament', ((nation.aggression ?? 1) - 1) * 0.2);
  if (WILL.irredenta) {
    const share = irredenta ?? irredentaShare(world, nation);
    push('Irredenta', Math.min(WILL.IRREDENTA_CAP, share * WILL.IRREDENTA_RATE));
  } else {
    push('Kin under foreign rule', Math.min(WILL.KIN_CAP, kin * WILL.KIN_RATE));
  }
  const { defensive, rally } = warRally(world, nation, turn);
  push('Rally round the flag', rally);
  if (defensive) push('Defending the homeland', WILL.DEFENDING);
  push('Enemy on our soil', Math.min(WILL.SOIL_CAP, WILL.SOIL_RATE * (nation.economy?.occupiedShare ?? 0)));
  push('War exhaustion', -WILL.CRACK * clamp(((politics.exhaustion ?? 0) - WILL.CRACK_FROM) / (1 - WILL.CRACK_FROM), 0, 1));
  push('Nationalist support', (politics.support.nationalist ?? 0) / 100 * 0.2);
  push('Government, advisors, events', mod(nation, 'warSupport'));
  const target = clamp(parts.reduce((sum, part) => sum + part.value, 0), 0, 1);
  return { parts, target };
}

/**
 * Yorgunluk hedefinin dökümü. Parçalar zaten sönen ve zaten saklanan
 * sayaçlardan kurulur: recentLosses (×0.985/hafta), warWeeks (barışta
 * −4/hafta), işgal payı, savaş dengesi (peace.updateWarBalance, 4 haftada
 * bir; barışta yok), fatura ödeme oranı, silah altındaki insan.
 */
export function exhaustionBreakdown(world, nation) {
  const politics = nation.politics ?? {};
  const economy = nation.economy ?? {};
  const population = Math.max(1, economy.population ?? 0);
  const parts = [];
  const push = (label, value) => {
    if (Math.abs(value) >= 0.005) parts.push({ label, value });
  };
  push('Casualties', Math.min(EXHAUSTION.CASUALTY_CAP,
    EXHAUSTION.CASUALTY * (politics.recentLosses ?? 0) * EXHAUSTION.MEN_PER_POINT / population));
  // Savaşın yılları toplumu ancak seferber ettiği kadar yorar: nüfusun %5'i
  // silah altındaysa tam, küçük sınır savaşında üçte bir. Saf takvimken
  // 1900'lerin yerel savaşları 3-4 yılda yorgunluğu 0.55-0.81'e çıkarıyor,
  // çok halklı imparatorluklar Büyük Savaş'tan on yıl önce dağılıyordu
  // (STAT3 78×62: 1900-04'te 15 ayaklanma; ölçüldü).
  const depth = clamp(((economy.soldiers ?? 0) / population) / EXHAUSTION.YEAR_DEPTH, EXHAUSTION.YEAR_FLOOR, 1);
  push('Years of war', Math.min(EXHAUSTION.YEAR_CAP, (politics.warWeeks ?? 0) / 52 * EXHAUSTION.YEAR_RATE * depth));
  push('Enemy on our soil', EXHAUSTION.SOIL * clamp(economy.occupiedShare ?? 0, 0, 1));
  push('Defeats', EXHAUSTION.DEFEAT * clamp(-(politics.warBalance?.worst ?? 0) / EXHAUSTION.DEFEAT_SCALE, 0, 1));
  push('Shortages', EXHAUSTION.SHORTAGE * clamp(1 - (economy.bills?.s ?? 1), 0, 1));
  push('Men under arms', EXHAUSTION.BURDEN * Math.max(0, (economy.soldiers ?? 0) / population - EXHAUSTION.BURDEN_FREE));
  // Call to Arms (D6, P6'ya kadar uyur): levée ayaktayken.
  push('Call to Arms', nation.mobilization?.levee?.active ? EXHAUSTION.LEVEE : 0);
  const target = clamp(parts.reduce((sum, part) => sum + part.value, 0), 0, 1);
  return { parts, target };
}

/** Merdivenin geçilmiş en yüksek basamağı (yoksa null). */
export function exhaustionStage(nation) {
  const exhaustion = nation?.politics?.exhaustion ?? 0;
  let stage = null;
  for (const step of EXHAUSTION_LADDER) if (exhaustion >= step.at) stage = step;
  return stage;
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
  // İrredenta tablosu yalnız P5b kolu açıkken kurulur (kümelerin komşuluk taraması).
  const border = WILL.irredenta ? irredentaTable(world) : null;
  // Dünya olayının dalgası (kızıl yıllar, buhran): parti hedeflerine eklenir.
  const wave = worldPartyTargets(world, turn);
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const politics = ensurePolitics(world, nation);
    const economy = nation.economy ?? {};
    const kinShare = kinAbroadShare(world, nation, kin);
    economy.kinAbroad = kinShare;
    const irredenta = border ? irredentaShare(world, nation, border, kin) : null;
    if (border) economy.irredenta = irredenta;

    // Parti desteği hedefe ayda ~%12 yaklaşır.
    const targets = supportTargets(world, nation, { turn, kin: kinShare, wave });
    for (const id of PARTY_IDS) politics.support[id] += (targets[id] - politics.support[id]) * 0.03;

    // Savaş sayaçları: kayıp yılda yarıya iner, savaş haftası barışta söner.
    const atWar = (economy.warFronts ?? 0) > 0;
    politics.recentLosses = (politics.recentLosses ?? 0) * 0.985;
    politics.warWeeks = atWar ? (politics.warWeeks ?? 0) + 1
      : Math.max(0, (politics.warWeeks ?? 0) - 4);
    // Toplam savaş barışa kadar yapışır (bkz. totalWarState).
    if (!atWar) delete politics.totalWarSince;
    else if (politics.totalWarSince == null && totalWarCause(world, nation)) politics.totalWarSince = turn;

    // Yorgunluk önce: istikrar ve irade onu okur. Yukarı 0.02, aşağı 0.01:
    // savaşın bedeli çabuk birikir, barışta iki yılda söner (0.8 → ~0).
    const exhaustion = exhaustionBreakdown(world, nation);
    politics.exhaustionParts = exhaustion.parts;
    politics.exhaustionTarget = exhaustion.target;
    politics.exhaustion = clamp(politics.exhaustion + clamp(exhaustion.target - politics.exhaustion,
      -EXHAUSTION.DOWN, EXHAUSTION.UP), 0, 1);

    const stability = stabilityBreakdown(world, nation, turn);
    politics.stabilityParts = stability.parts;
    politics.stabilityTarget = stability.target;
    nation.stability = approach(nation.stability ?? 0.5, stability.target, 0.01);

    const war = warSupportBreakdown(world, nation, { kin: kinShare, irredenta, turn });
    politics.warSupportParts = war.parts;
    politics.warSupportTarget = war.target;
    const up = atWar && war.target > (nation.warSupport ?? 0.4) ? WILL.STEP_UP_AT_WAR : WILL.STEP;
    nation.warSupport = approach(nation.warSupport ?? 0.4, war.target, up);

    const income = powerIncome(nation).total;
    const paid = stepCourse(nation, income);
    politics.coursePaid = paid;
    // Rota kaydıysa düzen/reform etkisi değiştirici toplamına girsin: önbellek
    // eski rotayı tutuyordu, yüklemede ise yeniden kuruluyordu — kaydet-yükle
    // ilk haftada dallanıyordu (save-audit, ölçüldü).
    if (paid > 0) refreshModifiers(nation, turn);
    nation.power = Math.min(POWER_CAP, (nation.power ?? 0) + income - paid);

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
    enforceLawRequirements(game, world, nation);
    advisorCandidates(world, nation, turn);
  }
  game.emit?.('politics', null);
}

// ------------------------------------------------------------------- YZ ---

/** YZ'nin 3. kademeye tırmanış eşikleri (redesign D5 "AI and AUTO"). */
export const AI_ESCALATION = {
  // Merdivenin 0.75 basamağı: devrim riski, YZ tırmanmayı bırakır.
  MAX_EXHAUSTION: 0.75,
  // Total War Economy istikrar −5 alır: çökmekte olan devlete yüklenmez.
  MIN_STABILITY: 0.45,
  INVADED: 0.05,
  CRISIS_WEEKS: 26,
  TWE_NEEDS_PRESSURE: true,
};

/**
 * YZ ve AUTO'nun siyaset kararı: ayda bir, tek adım. Sıra: danışman (boş
 * yuva; savaşta savaş yasalarından sonra), duruma göre yasa (savaşta
 * seferberlik ve toplam savaşta 3. kademe, barışta geri dönüş, eğitim,
 * ticaret), mutlakiyette en sevilen partiyi iktidara almak.
 * 3. kademeye tırmanınca `{text, why}` notu döner (AUTO duyurusu, ai.js);
 * başka her yolda undefined.
 */
export function politicsAI(game, nation, { appoint = true } = {}) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if ((turn + nation.id) % 4 !== 0) return;
  const politics = ensurePolitics(world, nation);
  const economy = nation.economy ?? {};
  const atWar = (economy.warFronts ?? 0) > 0;
  const tryLaw = (lawId, index, log = null) => index >= 0 && index < LAWS[lawId].options.length
    && !lawBlockers(world, nation, lawId, index, turn).length
    && setLaw(game, nation, lawId, index, { log });

  // 0. Devletin rotası: YZ yılda bir yön seçer (düşük finansman). Oyuncunun
  // rotasına AUTO DOKUNMAZ: rota oyuncunun siyasi iradesidir.
  if (nation.id !== game.turns?.playerNation && (turn + nation.id) % 52 === 0) {
    const pick = nation.focus === 'military' && (nation.aggression ?? 1) > 1.1 ? 'nationalist'
      : nation.focus === 'admin' ? 'conservative'
        : nation.focus === 'economy' ? 'liberal'
          : (nation.stability ?? 0.5) < 0.45 && (economy.consumer?.ratio ?? 1) < 0.95 ? 'socialist' : null;
    if (pick) {
      const [x, y] = COURSE.CORNERS[pick];
      setCourse(nation, { x, y: atWar ? Math.min(y, -0.5) : y }, (nation.power ?? 0) >= 40 ? COURSE.BUDGETS[1] : 0);
    } else {
      setCourse(nation, null, 0);
    }
  }

  // 1. Boş danışman yuvası — savaşta savaş yasalarından SONRA. P5 ölçümü:
  // toprağı %15'ten fazla işgal edilen savunanın Total Mobilisation'a
  // geçemediği haftalarda iki baş engel SG yokluğu ve hiç Extensive'e
  // çıkamamaktı (STAT1-3: 777/490/583 ve 753/302/564 hafta); SG önce danışmana
  // gidiyordu.
  const hireEmptySlot = () => {
    const pool = advisorCandidates(world, nation, turn);
    const order = nation.focus === 'military' ? ['military', 'economy', 'political']
      : nation.focus === 'admin' ? ['political', 'economy', 'military'] : ['economy', 'military', 'political'];
    for (const slot of order) {
      if (politics.advisors[slot] || (nation.power ?? 0) < ADVISOR_COST + 20) continue;
      if (hireAdvisor(game, nation, pool[slot][0].id)) return true;
    }
    return false;
  };
  if (!atWar && hireEmptySlot()) return;
  // 2. Savaş yasaları.
  const conscription = lawIndex(nation, 'conscription');
  const economyLaw = lawIndex(nation, 'economy');
  if (atWar) {
    // Toprağı işgal edilen savunan önce insan gücünü seferber eder: SG kıtken
    // ilk 50 SG ekonomiye gidince Extensive'e hiç çıkamayan savunan TM
    // engellerinin başıydı (P5: 427-687 hafta).
    const occupied = economy.occupiedShare ?? 0;
    const invaded = warPosture(world, nation).defensive && occupied >= AI_ESCALATION.INVADED;
    const raiseEconomy = () => economyLaw < 2 && tryLaw('economy', economyLaw + 1);
    const raiseConscription = () => conscription < 2 && tryLaw('conscription', conscription + 1);
    if (invaded ? (raiseConscription() || raiseEconomy()) : (raiseEconomy() || raiseConscription())) return;
    // TIRMANIŞ (redesign D5): 3. kademe ~39 bin ulus-savaş-haftasının hiçbirinde
    // yoktu çünkü YZ 2. kademede duruyordu (u5). Toplam savaşta ve yorgunluk
    // merdivenin 0.75 basamağının altındayken: toprağı işgal edilen savunan önce
    // insan gücünü, sonra sanayiyi; diğerleri önce sanayiyi seferber eder.
    // Liberal kabinenin askerlik tavanı [0,2] lawBlockers'ta bağlar.
    const exhausted = (politics.exhaustion ?? 0) >= AI_ESCALATION.MAX_EXHAUSTION;
    if (!exhausted && totalWarState(world, nation)) {
      const greatWar = warRecords(world, nation).some(({ rec }) => rootReason(world, rec) === 'crisis')
        && (politics.warWeeks ?? 0) >= AI_ESCALATION.CRISIS_WEEKS;
      // Oyuncunun AUTO kabinesi tırmanışı gerekçesiyle duyurur:
      // "Total Mobilisation: the enemy holds 18% of our land."
      let note = null;
      const escalate = (lawId) => {
        const text = `${LAWS[lawId].options[3].name}: ${totalWarReason(world, nation)}.`;
        if (!tryLaw(lawId, 3, text)) return false;
        note = text;
        return true;
      };
      const mobilise = () => conscription === 2 && (invaded || greatWar) && escalate('conscription');
      // Sanayi ancak baskı altında seferber edilir: toprağımızda düşman, büyük
      // savaş ya da bir cephede geride olmak. Yalnız "bir yıldır savaştayız"
      // kazanılan uzun savaşı da TWE'ye sokuyordu (P5 ölçümü: TWE ulus-savaş-
      // haftalarının %29-36'sı).
      const pressed = !AI_ESCALATION.TWE_NEEDS_PRESSURE || occupied >= AI_ESCALATION.INVADED
        || warRecords(world, nation).some(({ rec }) => rootReason(world, rec) === 'crisis')
        || (politics.warBalance?.worst ?? 0) < 0;
      const industry = () => economyLaw === 2 && pressed
        && (nation.stability ?? 0.5) >= AI_ESCALATION.MIN_STABILITY && escalate('economy');
      if (invaded ? (mobilise() || industry()) : (industry() || mobilise())) {
        return { text: note, why: 'The war has become total.' };
      }
    }
    if (hireEmptySlot()) return;
  } else if ((politics.warWeeks ?? 0) === 0) {
    // Barışta depo hedefin altındaysa (Auto hat kara/hava teçhizatı istiyor)
    // ya da dünya geriliyorsa (barut fıçısı, savaşa giden yol) ve halk
    // doyuyorsa kısmi seferberlik; depo doluysa ve dünya sakinse sivil
    // ekonomi. Doyurma kolu AUTO'da 1.05 olduğu için eşik 0.98'dir (eski
    // 1.1 tüketim malı fazlası artık yoktur: halkın payı bir karardır).
    const rearming = ['rifles', 'guns', 'tanks', 'aircraft']
      .some((id) => (economy.lines?.[id]?.weight ?? 0) > 0);
    const tension = worldWarTension(world, turn).declare > 1;
    const fed = economy.consumer?.ratio ?? 1;
    if ((rearming ? fed >= 0.98 : tension && fed >= 0.9) && economyLaw === 0
      && tryLaw('economy', 1)) return;
    if (!rearming && !tension && economyLaw > 0 && tryLaw('economy', 0)) return;
    if (economyLaw > 1 && tryLaw('economy', 1)) return;
    if (conscription > 1 && tryLaw('conscription', 1)) return;
  }
  // 3. Barış yasaları: halk aç kalıyorsa sivil ekonomi, okul, emek.
  if (!atWar && (economy.consumer?.ratio ?? 1) < 0.9 && economyLaw > 0 && tryLaw('economy', economyLaw - 1)) return;
  // Okul faturası ancak faturalar sığıyor ve kalkınmaya pay kalıyorsa büyür.
  // Bütün state'leri tavanda olan ülkenin kalkınma payı halka döner (pay
  // sıfır görünür); onun tavanını yalnız okul açar, okul tek yatırımıdır.
  const alloc = economy.alloc;
  const education = lawIndex(nation, 'education');
  const capped = economy.investTarget === null;
  if (!atWar && education < 2 && (economy.bills?.s ?? 1) >= 1 && alloc
    && (alloc.invest >= 0.3 * alloc.free || capped) && tryLaw('education', education + 1)) return;
  // Emek: savaşta uzun mesai (istikrar yetiyorsa), barışta standart hafta;
  // istikrar çökerse bir kademe kısalır.
  const labour = lawIndex(nation, 'labour');
  if ((nation.stability ?? 0.5) < 0.35 && labour > 0 && tryLaw('labour', labour - 1)) return;
  if (atWar && labour < 2 && (nation.stability ?? 0.5) >= 0.5 && tryLaw('labour', 2)) return;
  if (!atWar && labour === 2 && tryLaw('labour', 1)) return;
  // 4. Mutlakiyette halkın partisi (fark 8 puanı aşınca: ceza 8 istikrar).
  const legitimacy = legitimacyOf(nation);
  if (appoint && legitimacy.gap > 8 && appointGovernment(game, nation, legitimacy.leader)) return;
}

/** Siyaset ekranının modeli. */
export function governmentView(world, nation, turn = world.turn ?? 0) {
  const politics = ensurePolitics(world, nation);
  // İlk hafta kapanmadan haftalık döküm yok: Stability/War support panelleri
  // yalnız başlıkla boş açılıyor, "heading to" bugünkü değeri söylüyordu.
  // Saf dökümlerden okunur; durum YAZILMAZ (simülasyon aynı kalır).
  const stabilityNow = politics.stabilityParts ? null : stabilityBreakdown(world, nation, turn);
  const warNow = politics.warSupportParts ? null
    : warSupportBreakdown(world, nation, { kin: nation.economy?.kinAbroad ?? 0, irredenta: nation.economy?.irredenta ?? null, turn });
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
    course: courseView(nation),
    power: nation.power ?? 0,
    powerIncome: powerIncome(nation),
    stability: nation.stability ?? 0,
    stabilityTarget: politics.stabilityTarget ?? stabilityNow?.target ?? nation.stability,
    stabilityParts: politics.stabilityParts ?? stabilityNow?.parts ?? [],
    warSupport: nation.warSupport ?? 0,
    warSupportTarget: politics.warSupportTarget ?? warNow?.target ?? nation.warSupport,
    warSupportParts: politics.warSupportParts ?? warNow?.parts ?? [],
    // Yorgunluk paneli (P10): değer, hedef, parçalar, merdiven, toplam savaş.
    exhaustion: politics.exhaustion ?? 0,
    exhaustionTarget: politics.exhaustionTarget ?? politics.exhaustion ?? 0,
    exhaustionParts: politics.exhaustionParts ?? [],
    exhaustionLadder: EXHAUSTION_LADDER.map((step) => ({ ...step, passed: (politics.exhaustion ?? 0) >= step.at })),
    totalWar: totalWarState(world, nation),
    // Savaşta yasa barışa kadar durur: ekran "Held until the peace" basar.
    lawsHeld: atWarWithAnyone(world, nation),
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
