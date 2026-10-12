// Ülke özeti ekranının (Nation Overview) dökümü.
//
// Ekran sayı üretmez: buradaki her alan dünyanın kendi alanlarından okunur
// (TASARIM.md ilke 2). Düzyazı satırları (tanıtım, stratejik görünüm) elle
// yazılmış kalıplardır; içlerindeki her sayı aşağıdaki ölçülerden gelir,
// hiçbir cümle durumdan bağımsız "atmosfer" söylemez.
//
// Katman: game. DOM yok; Node'da çağrılabilir.

import { alliesOf } from './alliances.js';
import { ensureChronicle } from './chronicle.js';
import { END_YEAR, calendarYear } from './calendar.js';
import { atWar, nationStrength } from './diplomacy.js';
import { weeklyBalanceOf } from './economy.js';
import { RESOURCES, RESOURCE_IDS } from './econ/defs.js';
import { GOALS, goalMet, scoreboard } from './hegemony.js';
import { characterLine } from './identity.js';
import { INFAMY_COALITION } from './infamy.js';
import { warScore } from './peace.js';
import { governmentType, rulingParty } from './politics.js';

/** Son olaylar kutusu hep bu kadar satır tutar; kutu değerle boy değiştirmez. */
export const RECENT_EVENTS = 5;

/** Yokluk sıkıntısı bu oranın altında görünüm satırına girer. */
const SHORTAGE = 0.9;

function ordinal(n) {
  const tail = n % 100;
  if (tail >= 11 && tail <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function listNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names.length > 3 ? 'others' : names[names.length - 1]}`;
}

/**
 * İlişkiler: müttefik, rakip, savaş. Rakip iki yönlüdür — bizim seçtiğimiz
 * rakip ve bizi rakip seçenler (alliances.refreshRivals). Müttefik rakip
 * sayılmaz.
 */
function relationsOf(world, nation) {
  const alive = (id) => world.nations[id]?.alive;
  const allies = alliesOf(nation).filter(alive);
  const allied = new Set(allies);
  const rivals = [];
  if (nation.rivalId != null && alive(nation.rivalId)) rivals.push(nation.rivalId);
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id || other.rivalId !== nation.id) continue;
    if (!rivals.includes(other.id) && !allied.has(other.id)) rivals.push(other.id);
  }
  const wars = world.nations
    .filter((other) => other.alive && other.id !== nation.id && atWar(world, nation.id, other.id))
    .map((other) => other.id);
  // Savaş skoru üst çubuktaki savaş çipiyle aynı kaynaktan (peace.warScore).
  const warScores = Object.fromEntries(wars.map((id) => [id, warScore(world, nation.id, id)]));
  return { allies, rivals, wars, warScores };
}

/** Yıllık eğilim: haftalık tarih (economy.history, en çok 104 hafta). */
function trendOf(history, key) {
  const list = (history ?? []).map((row) => row[key]).filter(Number.isFinite);
  if (list.length < 26) return null;
  const span = Math.min(52, list.length - 1);
  const from = list[list.length - 1 - span];
  const to = list[list.length - 1];
  if (!(Math.abs(from) > 1e-9)) return null;
  return { from, to, change: (to - from) / Math.abs(from), weeks: span };
}

/**
 * Stratejik görünüm: sorunlar önce (savaş, kıtlık, açık, istikrar, kötü şöhret;
 * en çok iki), sonra gidişat ve yarış. Her satır bir ölçüden doğar; ölçü
 * yoksa satır da yoktur.
 */
function outlookOf(ctx) {
  const { nation, world, relations, resources, board, rank, trend, goal } = ctx;
  const name = (id) => world.nations[id]?.name ?? '?';
  const problems = [];
  if (relations.wars.length) {
    problems.push({ tone: 'war', text: `At war with ${listNames(relations.wars.map(name))}; war support stands at ${Math.round((nation.warSupport ?? 0) * 100)}%.` });
  }
  const short = resources
    .filter((row) => row.ratio != null && row.ratio < SHORTAGE)
    .sort((a, b) => a.ratio - b.ratio)[0];
  if (short) {
    problems.push({ tone: short.ratio < 0.5 ? 'bad' : 'warn', text: `${short.name} covers only ${Math.round(short.ratio * 100)}% of national need; imports or new production must close the gap.` });
  }
  const weekly = weeklyBalanceOf(nation);
  if (weekly < 0) problems.push({ tone: 'bad', text: `The treasury runs a deficit of ${Math.abs(weekly).toFixed(1)} gold a week.` });
  if ((nation.stability ?? 1) < 0.4) problems.push({ tone: 'bad', text: `Stability has fallen to ${Math.round((nation.stability ?? 0) * 100)}%.` });
  if ((nation.infamy ?? 0) >= INFAMY_COALITION * 0.6) {
    problems.push({ tone: 'warn', text: `Infamy stands at ${Math.round(nation.infamy)} of ${INFAMY_COALITION}; at ${INFAMY_COALITION} the powers form a coalition.` });
  }

  const lines = problems.slice(0, 2);
  if (trend) {
    const pct = Math.abs(trend.change * 100);
    const span = trend.weeks >= 52 ? 'the past year' : `the past ${trend.weeks} weeks`;
    lines.push({
      tone: trend.change >= 0 ? 'good' : 'bad',
      text: pct < 1
        ? `Industry has held steady over ${span} at ${trend.to.toFixed(1)} IC.`
        : `Industry has ${trend.change >= 0 ? 'grown' : 'shrunk'} ${pct.toFixed(0)}% over ${span}, from ${trend.from.toFixed(1)} to ${trend.to.toFixed(1)} IC.`,
    });
  }
  const years = Math.max(0, END_YEAR - calendarYear(world.turn ?? 1));
  const leader = board[0];
  const mine = board[rank - 1];
  if (leader && mine) {
    if (rank === 1) {
      const second = board[1];
      lines.push({ tone: 'good', text: `We lead the powers${second ? ` by ${leader.total - second.total} points over ${second.nation.name}` : ''}; ${years} years remain until ${END_YEAR}.` });
    } else {
      lines.push({ tone: 'info', text: `${leader.nation.name} leads the powers, ${leader.total - mine.total} points ahead of us; ${years} years remain until ${END_YEAR}.` });
    }
  }
  if (goal && lines.length < 4) {
    lines.push({
      tone: goal.met ? 'good' : 'info',
      text: goal.met
        ? `The national goal is achieved: ${goal.name} adds ${goal.bonus} points while it holds.`
        : `The national goal, ${goal.name}, adds ${goal.bonus} points once achieved.`,
    });
  }
  return lines.slice(0, 4);
}

/**
 * Son olaylar: vakayiname (ulusal olaylar, kayda girer) + oturumun bildirim
 * halkası (her türden, yalnız bu oturum) + tur günlüğü (yalnız metin; halka
 * boşsa — yükleme sonrası — yedek). Aynı başlık iki kez yazılmaz.
 *
 * @param {Array<{turn, kind, title}>} session UI'nin topladığı bildirimler
 * @param {string[]} log `turns.log` ("T12: metin")
 */
export function recentEvents(nation, session = [], log = [], limit = RECENT_EVENTS) {
  const rows = [];
  const seen = new Set();
  const add = (row) => {
    const key = `${row.turn}|${row.title}`;
    if (!row.title || seen.has(key)) return;
    seen.add(key);
    rows.push(row);
  };
  for (const entry of session) add({ turn: entry.turn, kind: entry.kind ?? 'INFO', title: entry.title });
  for (const entry of ensureChronicle(nation).slice(-limit * 2)) {
    add({ turn: entry.turn, kind: entry.kind ?? 'INFO', title: entry.title });
  }
  if (!session.length) {
    for (const line of log) {
      const match = /^T(\d+): (.*)$/.exec(line);
      if (match) add({ turn: Number(match[1]), kind: 'INFO', title: match[2] });
    }
  }
  // Kararlı sıra: aynı haftanın olayları geliş sırasını korur.
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => b.row.turn - a.row.turn || a.index - b.index)
    .slice(0, limit)
    .map(({ row }) => row);
}

/**
 * Ekranın bütün verisi tek taramada.
 * @returns {object} kimlik, ilişkiler, altı gösterge, kaynaklar, durum satırları, görünüm
 */
export function nationOverview(world, nation) {
  const board = scoreboard(world);
  const rank = board.findIndex((row) => row.nation.id === nation.id) + 1;
  const mine = board[rank - 1] ?? null;
  const cities = world.cities.filter((city) => city.nationId === nation.id);
  const capital = cities.find((city) => city.tile === nation.capital) ?? cities[0] ?? null;
  const divisions = world.units.filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land').length;
  const ships = nation.navy?.ships?.length ?? 0;
  const culture = world.cultures?.[nation.culture]?.name ?? 'Unknown';
  const government = governmentType(nation);
  const party = rulingParty(nation)?.name ?? 'No government';
  const relations = relationsOf(world, nation);
  const resources = RESOURCE_IDS.map((id) => {
    const record = nation.economy?.resources?.[id];
    return {
      id,
      name: RESOURCES[id].name,
      // İhtiyacı olmayan kaynak oran taşımaz: "%100" yanıltır, "—" doğrudur.
      ratio: record?.need > 0.01 ? record.ratio : null,
    };
  });
  const goalDef = GOALS[nation.goal];
  const goal = goalDef ? {
    name: goalDef.name, desc: goalDef.desc, bonus: goalDef.bonus,
    met: goalMet(world, nation, board.map((row) => row.nation)),
  } : null;
  const trend = trendOf(nation.economy?.history, 'ic');
  const capitalName = capital?.name ?? null;

  const intro = `${article(government).replace(/^a/, 'A')} ${government.toLowerCase()} of the ${culture} people, ranked ${rank ? ordinal(rank) : '—'} of ${board.length} powers${capitalName ? ` and governed from ${capitalName}` : ''}.`;

  return {
    id: nation.id,
    name: nation.name,
    fullName: nation.fullName ?? nation.name,
    culture,
    government,
    party,
    intro,
    line: characterLine(world, nation),
    relations,
    score: {
      total: mine?.total ?? 0,
      rank,
      of: board.length,
      leader: board[0]?.total ?? 0,
      leaderName: board[0]?.nation.name ?? '',
      parts: mine ? { industry: mine.industry, population: mine.population, land: mine.land, prestige: mine.prestige, goal: mine.goal } : null,
    },
    industry: { ic: nation.economy?.ic?.total ?? 0, points: mine?.industry ?? 0, trend },
    population: { total: nation.economy?.population ?? 0, cities: cities.length },
    forces: { divisions, ships, power: nationStrength(world, nation) },
    prestige: Math.round(nation.prestige ?? 0),
    land: { cores: mine?.land ?? 0, provinces: nation.provinces ?? 0 },
    resources,
    state: {
      capital: capitalName,
      treasury: Math.round(nation.gold ?? 0),
      weekly: weeklyBalanceOf(nation),
      stability: nation.stability ?? 0,
      warSupport: nation.warSupport ?? 0,
      infamy: nation.infamy ?? 0,
      infamyCap: INFAMY_COALITION,
      wars: relations.wars.map((id) => world.nations[id].name),
    },
    goal,
    outlook: outlookOf({ nation, world, relations, resources, board, rank, trend, goal }),
    year: calendarYear(world.turn ?? 1),
    endYear: END_YEAR,
  };
}
