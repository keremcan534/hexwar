// LİDERLER — her ulusun adlı, yüzlü, kişilikli başı (TASARIM §12b).
//
// Bir lider `nation.leader` kaydıdır; kararlarını `leaderDefs.leverOf` üzerinden
// mevcut YZ eşiklerine yazar. Lider ölür, seçimi kaybeder, darbeyle ya da
// devrimle gider; hangisi olursa olsun oyuncunun tek bir işi yoktur (ev ödevi
// testi): lider yönetilmez, tanınır.
//
// DETERMİNİZM: burada oyun zarı (`game.turns.rng`) ÇEKİLMEZ. Her sonuç dünyanın
// tohumu, ulus, lider sırası ve haftadan özetlenir. Bu yüzden `DIP_AI.leaders`
// kapalıyken dünya liderlerden önceki dünyanın bit bit aynısıdır ve kayıt
// yalnız `nation.leader` alanlarını taşır.
//
// Değişim DURUMDAN okunur: seçim, kart, devrim, karar hangi yoldan gelirse
// gelsin `politics.ruling` ve `politics.government` farkı yakalanır. politics.js
// bu dosyayı bilmez, içe-alma döngüsü kurulmaz.
//
// Katman: game — DOM yok.

import { calendarYear } from './calendar.js';
import { TIER, announce } from './chronicle.js';
import {
  AXES, COUP, DEFAULT_NAME_BANK, FACES, LEADER_TEST, LIFE, NAME_BANKS, ROLE_AGE, TRAITS, WOMEN_SHARE,
} from './leaderDefs.js';

/** Kararlı [0, 1) özeti: tohum + anahtar. Oyun zarından bağımsızdır. */
function roll(world, key) {
  const text = `${world.seed ?? 'world'}|${key}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // FNV'nin zayıf düşük bitleri kısa anahtarlarda kümelenir: son karıştırma.
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const pickFrom = (list, value) => list[Math.min(list.length - 1, Math.floor(value * list.length))];
const clamp01 = (value) => Math.max(0.05, Math.min(0.95, value));

/** Bu kökenden gelen liderin eksenin SERT kutbunu seçme payı. */
function hardShare(axis, nation, via) {
  const party = nation.politics?.ruling;
  const temper = (nation.aggression ?? 1) - 1.05;
  const coup = via === 'coup';
  const nationalist = party === 'nationalist';
  const liberal = party === 'liberal';
  if (axis === 'war') return 0.45 + temper + (coup ? 0.3 : 0) + (nationalist ? 0.2 : 0) - (liberal ? 0.15 : 0);
  if (axis === 'word') return 0.35 + (coup ? 0.2 : 0) - (party === 'conservative' ? 0.15 : 0);
  return 0.5 + (liberal ? 0.2 : 0) - (nationalist ? 0.2 : 0); // company: conciliator sert kutuptur
}

/** İki ya da üç eksen, eksen başına tek kutup; varis babasının bir huyunu alır. */
function rollTraits(world, nation, n, via, parent) {
  if (LEADER_TEST.force) return [...LEADER_TEST.force];
  const key = `${nation.id}:${n}`;
  const axes = Object.keys(AXES)
    .map((axis) => ({ axis, order: roll(world, `${key}:axis:${axis}`) }))
    .sort((a, b) => a.order - b.order)
    .map((row) => row.axis);
  const count = roll(world, `${key}:count`) < 0.45 ? 3 : 2;
  const traits = [];
  const taken = new Set();
  const inherited = parent?.traits?.length && roll(world, `${key}:blood`) < 0.5
    ? parent.traits[Math.floor(roll(world, `${key}:bloodpick`) * parent.traits.length)] : null;
  if (inherited && TRAITS[inherited]) {
    traits.push(inherited);
    taken.add(TRAITS[inherited].axis);
  }
  for (const axis of axes) {
    if (traits.length >= count) break;
    if (taken.has(axis)) continue;
    const [hard, soft] = AXES[axis];
    const pole = roll(world, `${key}:pole:${axis}`) < clamp01(hardShare(axis, nation, via)) ? hard : soft;
    // Tek kutuplu eksende öbür uç özellik taşımaz: sıradaki eksene geçilir.
    if (pole) traits.push(pole);
  }
  return traits;
}

/** Hükûmet biçimi ve gelişe göre rol. */
function roleFor(nation, via) {
  if (via === 'coup') return 'marshal';
  const government = nation.politics?.government;
  if (via === 'revolution' && nation.politics?.ruling === 'socialist') return 'firebrand';
  return government === 'absolutism' ? 'monarch' : 'statesman';
}

const MONARCH_TITLES = [
  ['Kingdom', 'King', 'Queen'], ['Empire', 'Emperor', 'Empress'], ['Principality', 'Prince', 'Princess'],
  ['Duchy', 'Grand Duke', 'Grand Duchess'], ['Khanate', 'Khan', 'Khatun'], ['Emirate', 'Emir', 'Emira'],
];

function titleFor(nation, role, female) {
  if (role === 'marshal') return 'Marshal';
  if (role === 'firebrand') return female ? 'Chairwoman' : 'Chairman';
  if (role === 'statesman') return nation.politics?.government === 'republic' ? 'President' : 'Prime Minister';
  const row = MONARCH_TITLES.find(([word]) => (nation.fullName ?? '').includes(word));
  if (row) return female ? row[2] : row[1];
  return female ? 'Lady Protector' : 'Lord Protector';
}

/** Yeni lider kaydı. `parent` hanedan varisinde soyadını ve bir huyu taşır. */
export function makeLeader(world, nation, { via = 'start', turn = world.turn ?? 1, parent = null } = {}) {
  const n = (nation.leaderCount ?? 0) + 1;
  const key = `${nation.id}:${n}`;
  const role = roleFor(nation, via);
  const female = roll(world, `${key}:woman`) < (WOMEN_SHARE[role] ?? 0);
  const family = world.cultures?.[nation.culture]?.family;
  const bank = NAME_BANKS[family] ?? DEFAULT_NAME_BANK;
  const given = pickFrom(female ? bank.women : bank.men, roll(world, `${key}:given`));
  const house = parent && role === 'monarch' ? parent.house : pickFrom(bank.family, roll(world, `${key}:house`));
  const [young, old] = ROLE_AGE[role];
  const age = young + Math.floor(roll(world, `${key}:age`) * (old - young + 1));
  // Yalnız kadın yüzü de taşıyan sayfalarda son satır erkeklere verilmez.
  const mixed = (WOMEN_SHARE[role] ?? 0) > 0;
  const span = female ? FACES.PER_SHEET - FACES.WOMEN_FROM + 1 : mixed ? FACES.WOMEN_FROM - 1 : FACES.PER_SHEET;
  const first = female ? FACES.WOMEN_FROM : 1;
  return {
    n,
    name: `${given} ${house}`,
    house,
    title: titleFor(nation, role, female),
    role,
    female,
    face: first + Math.floor(roll(world, `${key}:face`) * span),
    traits: rollTraits(world, nation, n, via, parent),
    born: calendarYear(turn) - age,
    since: turn,
    via,
    party: nation.politics?.ruling ?? null,
    government: nation.politics?.government ?? null,
    nextElection: nation.politics?.nextElection ?? null,
    terms: 0,
  };
}

/** Eksik lideri kurar (yeni dünya, eski kayıt, sonradan uyanan ulus). */
export function ensureLeader(world, nation, turn = world.turn ?? 1) {
  if (nation.leader || !nation.politics) return nation.leader ?? null;
  nation.leader = makeLeader(world, nation, { via: 'start', turn });
  nation.leaderCount = nation.leader.n;
  nation.leaderPast ??= [];
  return nation.leader;
}

export function seedLeaders(world) {
  for (const nation of world.nations) {
    if (nation.alive) ensureLeader(world, nation);
  }
}

export function leaderAge(leader, turn) {
  return Math.max(0, calendarYear(turn) - (leader?.born ?? calendarYear(turn)));
}

/** Kayıt kopyası: kayıtta yalnız düz alanlar durur. */
export function copyLeader(leader) {
  return leader ? { ...leader, traits: [...(leader.traits ?? [])] } : null;
}

const SUCCESSION_TEXT = {
  death: (old, next, nation) => ({
    title: `${old.title} ${old.name} of ${nation.name} is dead`,
    detail: `${next.title} ${next.name} succeeds to office.`,
  }),
  election: (old, next, nation) => ({
    title: `${nation.name} votes ${old.title} ${old.name} out`,
    detail: `${next.title} ${next.name} forms the new government.`,
  }),
  term: (old, next, nation) => ({
    title: `${old.title} ${old.name} of ${nation.name} steps down`,
    detail: `${next.title} ${next.name} takes office after the elections.`,
  }),
  coup: (old, next, nation) => ({
    title: `Coup in ${nation.name}: ${old.title} ${old.name} is overthrown`,
    detail: `${next.title} ${next.name} has seized power.`,
  }),
  revolution: (old, next, nation) => ({
    title: `Revolution in ${nation.name}: ${old.title} ${old.name} has fallen`,
    detail: `${next.title} ${next.name} now leads the country.`,
  }),
  reform: (old, next, nation) => ({
    title: `${nation.name} has a new constitution`,
    detail: `${next.title} ${next.name} replaces ${old.title} ${old.name}.`,
  }),
};

/** Oyuncu bu ülkeyi izler mi: komşu, müttefik, rakip ya da anlaşma ortağı. */
function playerWatches(world, player, nation) {
  if (!player?.alive || player.id === nation.id) return false;
  if (world.contacts?.[player.id]?.[nation.id]) return true;
  if (player.rivalId === nation.id || nation.rivalId === player.id) return true;
  return (player.treaties ?? []).some((t) => t.partner === nation.id);
}

function traitList(leader) {
  return leader.traits.map((id) => TRAITS[id]?.name).filter(Boolean).join(', ');
}

/** Görev değişimi: eskisi arşive, yenisi göreve, ilgili ekranlara haber. */
function succeed(game, nation, via, turn) {
  const world = game.world;
  const old = nation.leader;
  const dynastic = via === 'death' && old.role === 'monarch' && nation.politics?.government === 'absolutism';
  const next = makeLeader(world, nation, { via, turn, parent: dynastic ? old : null });
  nation.leaderPast ??= [];
  nation.leaderPast.push({
    name: old.name, title: old.title, since: old.since, until: turn, ended: via,
  });
  if (nation.leaderPast.length > LIFE.PAST) nation.leaderPast.shift();
  nation.leader = next;
  nation.leaderCount = next.n;

  const text = (SUCCESSION_TEXT[via] ?? SUCCESSION_TEXT.reform)(old, next, nation);
  const playerId = game.turns?.playerNation ?? -1;
  const player = world.nations[playerId];
  const traits = traitList(next);
  // Kendi vakayinamesine yazılır; oyuncunun ülkesiyse kart da buradan çıkar.
  announce(game, nation, {
    kind: 'POLITICS', tier: TIER.MAJOR, key: `leader:${nation.id}`,
    title: text.title, detail: `${text.detail} ${traits}.`, leader: nation.id,
  });
  if (playerWatches(world, player, nation)) {
    announce(game, player, {
      kind: 'POLITICS', tier: TIER.IMPORTANT, key: `leader:${nation.id}`,
      title: text.title,
      detail: `${text.detail} ${traits}.`,
      leader: nation.id,
    });
  }
  game.emit?.('diplomacy');
}

/** Bu hafta görevden düşüren siyasi değişim var mı? (Durumdan okunur.) */
function politicalChange(nation) {
  const leader = nation.leader;
  const politics = nation.politics;
  if (leader.government !== politics.government) {
    if (politics.government === 'absolutism') return 'coup';
    return leader.government === 'absolutism' && politics.government === 'republic' ? 'revolution' : 'reform';
  }
  const elected = politics.government !== 'absolutism';
  if (elected && leader.party !== politics.ruling) return 'election';
  if (!elected) leader.party = politics.ruling;
  if (elected && leader.nextElection !== politics.nextElection) {
    leader.nextElection = politics.nextElection;
    leader.terms = (leader.terms ?? 0) + 1;
    if (leader.terms >= LIFE.TERMS) return 'term';
  }
  return null;
}

/** Yıllık ölüm oranı yaşla üstel büyür; çeyreğe bölünür. */
function deathChance(age) {
  return Math.min(0.9, LIFE.DEATH_BASE * LIFE.DEATH_GROWTH ** (age - 40)) * (LIFE.CHECK_EVERY / 52);
}

/** Sarsılmış devlette çeyreklik darbe zarı. */
function coupRipe(nation, turn) {
  const shaken = (nation.stability ?? 1) < COUP.STABILITY
    || (nation.politics?.exhaustion ?? 0) >= COUP.EXHAUSTION;
  return shaken && turn - nation.leader.since >= COUP.MIN_TENURE;
}

/** HAFTALIK (turn.js, siyasetten hemen sonra). Zar çekmez, simülasyona yazmaz. */
export function runLeaders(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.politics) continue;
    if (!nation.leader) {
      ensureLeader(world, nation, turn);
      continue;
    }
    const change = politicalChange(nation);
    if (change) {
      succeed(game, nation, change, turn);
      continue;
    }
    if ((turn + nation.id) % LIFE.CHECK_EVERY !== 0) continue;
    const age = leaderAge(nation.leader, turn);
    if (roll(world, `${nation.id}:${nation.leader.n}:death:${turn}`) < deathChance(age)) {
      succeed(game, nation, 'death', turn);
    } else if (coupRipe(nation, turn) && roll(world, `${nation.id}:${nation.leader.n}:coup:${turn}`) < COUP.CHANCE) {
      succeed(game, nation, 'coup', turn);
    }
  }
}

/** Ekranın okuduğu özet: sayı üretmez, kaydı cümleye çevirir. */
export function leaderView(world, nation, turn = world.turn ?? 0) {
  const leader = nation?.leader;
  if (!leader) return null;
  const last = nation.leaderPast?.[nation.leaderPast.length - 1] ?? null;
  return {
    name: leader.name,
    title: leader.title,
    label: `${leader.title} ${leader.name}`,
    role: leader.role,
    female: leader.female,
    face: leader.face,
    age: leaderAge(leader, turn),
    sinceYear: calendarYear(leader.since),
    via: leader.via,
    traits: leader.traits.map((id) => ({ id, name: TRAITS[id]?.name ?? id, line: TRAITS[id]?.line ?? '' })),
    predecessor: last ? `${last.title} ${last.name}` : null,
  };
}
