// SEKME DEFTERİ (Victoria 2 üst menüsü, Kerem 2026-10-13: "researchte research
// gözüküyor, ilerliyor; her karede genel bilgileri görüyoruz"). Yönetim
// sekmelerinin her biri kendi alanının canlı özetini taşır. Bu dosya yalnız
// OKUR ve sayı döndürür: biçim ve renk ui/tabLedger.js'tedir. Her değer bir
// ekranın zaten okuduğu görünüm fonksiyonundan gelir; burada yeni formül
// yazılmaz, yalnız "sekmede hangisi görünür" seçimi yapılır.

import { isDelegated, lastDelegatedAction } from './delegation.js';
import { equipmentLogistics } from './reinforcement.js';
import { militarySummary, trainingRows } from './military.js';
import { growthFactors, provinceName } from './provinces.js';
import { developmentCap, fundFloor, investEfficiency } from './econ/investment.js';
import { atWar } from './diplomacy.js';
import { unificationStatus } from './unification.js';
import { movementView } from './movements.js';
import { unrestSummary } from './culture.js';
import { agendaView } from './agenda.js';
import { PARTIES, governmentOf, governmentType, legitimacyOf, rulingParty } from './politics.js';
import { decisionsView } from './decisions.js';
import {
  TECHNOLOGIES, effectiveTechCost, firstDiscoveryOpen, researchPointsOf, techById, techCostFactors,
} from './technology.js';
import { scoreboard } from './hegemony.js';
import { CAMPAIGN_TURNS, END_YEAR, calendarYear, eraProgress, yearOfTurn } from './calendar.js';
import { RESOURCE_IDS } from './econ/defs.js';

/** Sekmelerin sırası index.html #tab-bar ile aynıdır. */
export const TAB_SUMMARY_IDS = [
  'construction', 'industry', 'trade', 'budget', 'military',
  'population', 'cultures', 'politics', 'technology', 'chronicle',
];

const TECH_TOTAL = Object.values(TECHNOLOGIES).reduce(
  (sum, folders) => sum + Object.values(folders).reduce((s, list) => s + list.length, 0), 0,
);

/** Teçhizat açığı 0.5'in altında gürültüdür (ordu ekranının eşiği). */
const SHORT_EPS = 0.5;

/**
 * Bütün sekmelerin özeti. `game` gerekir: eğitim kuyruğu yeri `world.get` ile
 * çözer (military.trainingRows). Ölü ya da ekonomisi kurulmamış ulus null.
 */
export function tabSummary(game, nation) {
  const world = game?.world;
  if (!world || !nation?.alive || !nation.economy) return null;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const logistics = equipmentLogistics(world, nation);
  return {
    turn,
    construction: constructionSummary(world, nation, turn),
    industry: industrySummary(nation, logistics),
    trade: tradeSummary(world, nation),
    budget: budgetSummary(nation, turn),
    military: militaryTab(game, nation),
    population: populationSummary(world, nation),
    cultures: culturesSummary(world, nation),
    politics: politicsSummary(world, nation, turn),
    technology: technologySummary(world, nation, turn),
    chronicle: chronicleSummary(world, nation, turn),
  };
}

/** En kötü teçhizat açığı: eksik / gerekli oranı en büyük olan. */
export function worstShortfall(logistics) {
  let worst = null;
  for (const row of logistics) {
    const deficit = row.required - row.stock;
    if (deficit <= SHORT_EPS) continue;
    const share = deficit / Math.max(1, row.required);
    if (!worst || share > worst.share) worst = { ...row, deficit, share };
  }
  return worst;
}

// ----------------------------------------------------------- KALKINMA ---

/**
 * Kalkınma sekmesi (eski inşaat): fonun hedefi ve doluluğu, haftalık
 * yatırım, tavan. Kademe kendiliğinden alınır (econ/investment.js): sekmenin
 * "araştırması" sıradaki kademedir.
 */
function constructionSummary(world, nation, turn) {
  const economy = nation.economy;
  const target = economy.investTarget;
  const province = target ? world.provinces?.[target.provinceId] : null;
  const invest = (economy.alloc?.invest ?? 0) * investEfficiency(nation);
  const fund = nation.fund ?? 0;
  const left = target ? Math.max(0, target.cost - fund) : 0;
  const last = isDelegated(nation, 'economy') ? lastDelegatedAction(nation, 'economy') : null;
  return {
    auto: isDelegated(nation, 'economy'),
    fund,
    floor: fundFloor(nation),
    invest,
    developmentCap: developmentCap(nation),
    next: target && province && {
      name: `${provinceName(province.center)} → ${target.level}`,
      province: provinceName(province.center),
      level: target.level,
      cost: target.cost,
      progress: target.cost > 0 ? Math.max(0, Math.min(1, fund / target.cost)) : 0,
      weeksLeft: invest > 0.01 ? Math.ceil(left / invest) : null,
    },
    timber: economy.resources?.TIMBER?.ratio ?? 1,
    lastAuto: last && { text: last.text, ago: Math.max(0, turn - (last.turn ?? turn)) },
  };
}

// ------------------------------------------------------------ SANAYİ ---

function industrySummary(nation, logistics) {
  const economy = nation.economy;
  const ic = economy.ic ?? { total: 0, civil: 0, military: 0 };
  const consumer = economy.consumer ?? { ratio: 1 };
  let topLine = null;
  let lineIc = 0;
  for (const [id, line] of Object.entries(economy.lines ?? {})) {
    lineIc += line.ic ?? 0;
    if ((line.output ?? 0) > 0.05 && (!topLine || line.output > topLine.output)) topLine = { id, output: line.output };
  }
  const short = worstShortfall(logistics);
  return {
    consumer: consumer.ratio ?? 1,
    ic: ic.total ?? 0,
    civil: ic.civil ?? 0,
    military: ic.military ?? 0,
    idle: Math.max(0, (ic.military ?? 0) - lineIc),
    topLine,
    short: short && {
      id: short.id, name: short.name, stock: short.stock, required: short.required,
      deficit: short.deficit, etaWeeks: short.etaWeeks, producedPerWeek: short.producedPerWeek,
    },
  };
}

// ----------------------------------------------------------- TİCARET ---

function tradeSummary(world, nation) {
  const economy = nation.economy;
  const ledger = economy.ledger ?? {};
  const resources = economy.resources ?? {};
  let topExport = null;
  let topImport = null;
  let dependency = null;
  for (const id of RESOURCE_IDS) {
    const r = resources[id];
    if (!r) continue;
    if ((r.exported ?? 0) > 0.05 && (!topExport || r.exported > topExport.amount)) topExport = { id, amount: r.exported };
    if ((r.imported ?? 0) > 0.05 && (!topImport || r.imported > topImport.amount)) topImport = { id, amount: r.imported };
    // Tek tedarikçiye bağımlılık: uyarı eşiği alerts.js ile aynı (%50).
    if ((r.need ?? 0) > 0.01 && (r.topShare ?? 0) >= 0.5 && r.topPartner != null
      && (!dependency || r.topShare > dependency.share)) {
      dependency = { id, share: r.topShare, partner: world.nations[r.topPartner]?.name ?? null };
    }
  }
  const exports = ledger.exports ?? 0;
  const imports = ledger.imports ?? 0;
  return {
    exports,
    imports,
    // Ticaret ekranının KPI'ı ile aynı: ihracat geliri − ithalat bedeli.
    balance: exports + imports,
    topExport,
    topImport,
    dependency,
    blockade: economy.blockade ?? 0,
    embargoes: (nation.embargoes ?? []).length,
  };
}

// ----------------------------------------------------------- EKONOMİ ---

/**
 * Ekonomi sekmesi (eski bütçe): çubuğun haftalık paylaşımı ve fonun izi.
 * Sayılar economy.alloc ve econ/bills.js'ten okunur.
 */
function budgetSummary(nation, turn) {
  const economy = nation.economy;
  const alloc = economy.alloc ?? { output: 0, bills: 0, army: 0, people: 0, invest: 0, free: 0 };
  const bills = economy.bills ?? { owed: 0, paid: 0, room: 0, s: 1 };
  const history = economy.fundHistory ?? [];
  return {
    output: alloc.output,
    bills: alloc.bills,
    owed: bills.owed,
    room: bills.room,
    supplyShare: bills.s,
    army: alloc.army,
    people: alloc.people,
    invest: alloc.invest,
    feed: economy.feed?.target ?? 1,
    feedAuto: (economy.feed?.mode ?? 'auto') === 'auto',
    consumer: economy.consumer?.ratio ?? 1,
    fund: nation.fund ?? 0,
    floor: fundFloor(nation),
    // Kopya: arayüz izi çizerken defterin dizisi değişmesin.
    history: history.slice(),
    weeks: history.length,
    treaty: economy.ledger?.treaty ?? 0,
    turn,
  };
}

// ------------------------------------------------------------- ORDU ---

function militaryTab(game, nation) {
  const world = game.world;
  const summary = militarySummary(world, nation);
  const rows = trainingRows(game, nation);
  // Sahaya en önce çıkacak alay: yürüyen (sırada beklemeyen, donmamış) ve
  // en az haftası kalan. Biten ama yer bulamayan alay ayrıca sayılır.
  let next = null;
  for (const row of rows) {
    if (row.queued || row.frozen || row.stalled) continue;
    if (!next || row.left < next.left || (row.left === next.left && row.share > next.share)) next = row;
  }
  return {
    training: next && { name: next.name, typeId: next.typeId, share: next.share, left: next.left, fill: next.fill },
    queue: rows.length,
    stalled: rows.filter((row) => row.stalled).length,
    frozen: rows.filter((row) => row.frozen).length,
    capacity: summary.trainingCapacity,
    divisions: summary.divisions,
    regiments: summary.regiments,
    strength: summary.strength,
    organization: summary.organization,
    inBattle: summary.inBattle,
    fleet: summary.fleet,
    unassigned: summary.unassigned,
    mobilization: summary.mobilization.active
      ? { conscripts: summary.mobilization.conscripts, target: summary.mobilization.target } : null,
    wars: summary.wars.length,
  };
}

// ------------------------------------------------------------- NÜFUS ---

function populationSummary(world, nation) {
  const economy = nation.economy;
  const peace = !world.nations.some((other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id));
  // Nüfus ekranının KPI'ı ile aynı çağrı (peoplesView): ulusun ortalama
  // kalkınması ve barış durumu.
  const growth = growthFactors(nation, { development: economy.development ?? 1 }, { peace });
  const history = economy.history ?? [];
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  const unification = unificationStatus(world, nation);
  return {
    population: economy.population ?? 0,
    // Haftalık oran; ekran yıllığı ×52 yazar.
    growth: growth.rate,
    famine: Boolean(growth.famine),
    war: !peace,
    literacy: economy.literacy ?? 0,
    literacyTarget: economy.literacyTarget ?? economy.literacy ?? 0,
    week: last && prev ? last.population - prev.population : null,
    kinAbroad: economy.kinAbroad ?? 0,
    unification: {
      culture: unification.culture, owned: unification.owned, total: unification.total,
      share: unification.share, formed: unification.formed,
    },
  };
}

// ------------------------------------------------------------ KÜLTÜR ---

function culturesSummary(world, nation) {
  const rows = movementView(world, nation);
  const lead = rows[0] ?? null;
  const unrest = unrestSummary(world, nation);
  return {
    movement: lead && {
      name: lead.name, stage: lead.stage.name, stageIndex: lead.stage.index, progress: lead.progress,
      eta: lead.eta, martialLeft: lead.martialLeft, calmLeft: lead.calmLeft, trend: lead.trend,
    },
    movements: rows.length,
    unrest: unrest.unrest,
    boiling: unrest.boiling,
    citizens: nation.economy.acceptedShare ?? 1,
  };
}

// ------------------------------------------------------------ SİYASET ---

function politicsSummary(world, nation, turn) {
  const view = agendaView(world, nation, turn);
  const auto = isDelegated(nation, 'agenda');
  const party = rulingParty(nation);
  const legitimacy = legitimacyOf(nation);
  const ready = decisionsView(nation, turn).filter((row) => row.blockers.length === 0).length;
  const politics = nation.politics ?? {};
  return {
    agenda: view.current && { name: view.current.name, progress: view.current.progress, weeksLeft: view.current.weeksLeft },
    // Elle yönetilen gündem seçim bekler ve süre işlemez (agenda.runAgenda).
    waiting: !view.current && !auto ? view.options.length : 0,
    auto,
    party: { name: party.name, color: party.color },
    government: governmentType(nation),
    legitimacy: { gap: legitimacy.gap, leader: PARTIES[legitimacy.leader]?.name ?? legitimacy.leader },
    decisions: ready,
    // Mutlakiyette seçim yoktur; nextElection yine de tohumlanmış durur.
    election: governmentOf(nation).elections && Number.isFinite(politics.nextElection)
      ? Math.max(0, politics.nextElection - turn) : null,
  };
}

// ---------------------------------------------------------- TEKNOLOJİ ---

function technologySummary(world, nation, turn) {
  const research = nation.research ?? { points: 0, current: null, done: [], queue: [] };
  const year = yearOfTurn(turn);
  // Teknoloji ekranının KPI'ı ile aynı hesap (technologyScreen.js): etkin
  // maliyet (yayılım indirimi dahil), önbellekli üniversite sayısıyla hız.
  const rate = researchPointsOf(nation);
  const entry = research.current ? techById(research.current) : null;
  const points = research.points ?? 0;
  let tech = null;
  if (entry) {
    const cost = effectiveTechCost(world, nation, entry.tech.id, year);
    const factors = techCostFactors(entry.tech.id, year);
    tech = {
      id: entry.tech.id,
      name: entry.tech.name,
      categoryId: entry.categoryId,
      cost,
      points,
      progress: cost > 0 ? Math.min(1, points / cost) : 0,
      weeksLeft: Math.max(0, Math.ceil((cost - points) / Math.max(1e-6, rate))),
      first: firstDiscoveryOpen(world, entry.tech.id),
      earlyYears: factors.earlyYears ?? 0,
    };
  }
  return {
    tech,
    rate,
    done: (research.done ?? []).length,
    total: TECH_TOTAL,
    queue: (research.queue ?? []).length,
    next: research.queue?.[0] ? techById(research.queue[0])?.tech?.name ?? null : null,
    auto: isDelegated(nation, 'research'),
  };
}

// ----------------------------------------------------------- KRONİK ---

function chronicleSummary(world, nation, turn) {
  const board = scoreboard(world);
  const index = board.findIndex((row) => row.nation.id === nation.id);
  const mine = index >= 0 ? board[index] : null;
  const leader = board[0] ?? null;
  const above = index > 0 ? board[index - 1] : null;
  const below = index >= 0 ? board[index + 1] ?? null : null;
  const entries = Array.isArray(nation.chronicle) ? nation.chronicle : [];
  const latest = entries[entries.length - 1] ?? null;
  return {
    rank: index + 1,
    of: board.length,
    score: mine?.total ?? 0,
    leader: leader && { name: leader.nation.name, score: leader.total, me: leader.nation.id === nation.id },
    above: above && { name: above.nation.name, gap: above.total - (mine?.total ?? 0) },
    below: below && { name: below.nation.name, gap: (mine?.total ?? 0) - below.total },
    era: eraProgress(turn),
    yearsLeft: Math.max(0, END_YEAR - calendarYear(turn)),
    weeksLeft: Math.max(0, CAMPAIGN_TURNS - turn),
    endYear: END_YEAR,
    latest: latest && { title: latest.title, year: calendarYear(latest.turn), ago: Math.max(0, turn - latest.turn) },
  };
}
