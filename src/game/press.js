// YAZI İŞLERİ — dünyada olanı haftada bir okur, ayda bir gazete basar.
//
// Simülasyon çok şey üretiyor, oyuncu çoğunu görmüyor. Burası yeni olay
// YARATMAZ: geçen haftayla bu haftanın farkına bakar, olguyu not eder, ayın
// başında (ya da büyük olayda hemen) en önemlilerini sayıya dizer.
//
// YALNIZ OKUR. Dünyaya yazdığı tek alan `world.press`tir ve simülasyonun hiçbir
// yeri onu okumaz; zar çekmez, sıra değiştirmez. `npm run audit:press` aynı
// tohumu gazeteli ve gazetesiz koşup parmak izlerini karşılaştırır.
//
// Katman: game. DOM yok. Metin pressText.js'te; kayda yalnız olgu girer.

import { dateOfTurn } from './calendar.js';
import { CRISIS, WAR, relation, warLossesOf } from './diplomacy.js';
import { controllerOf } from './control.js';
import { scoreboard } from './hegemony.js';
import { rulingParty } from './politics.js';
import { WORLD_EVENTS, WORLD_EVENT_IDS } from './worldEvents.js';
import { EVENT_CARDS } from './eventCards.js';
import { occupiedProvincesOf } from './peace.js';
import { generalOfArmy, generalsOf } from './command.js';
import { provinceName } from './provinces.js';
import { stageOf } from './movements.js';
import { regimentCount } from './units.js';
import { MEN_PER_STRENGTH } from './warView.js';
import { RESOURCES, RESOURCE_IDS } from './econ/defs.js';
import { contextOf, headOptions, headText, paperName, photosFor } from './pressText.js';

/** İki olağanüstü sayı arasındaki en kısa süre (hafta): manşet enflasyonu olmasın. */
const EXTRA_GAP = 3;
/** Basılmamış olgu bu kadar hafta bekler; eski haber haber değildir. */
const POOL_WEEKS = 8;
/** Sayıda en çok: manşet + iki alt haber + dört kısa haber. */
const SUBS = 2;
const BRIEFS = 4;
/** Arşiv tavanı: 45 yıl × 12 ay + olağanüstü sayılar sığar. */
const MAX_ISSUES = 720;
/** Aynı başlığın geri dönmemesi için hatırlanan son başlık sayısı (kampanyanın çoğu). */
const HEAD_MEMORY = 1200;
/** Büyük güç sayılan ilk sıralar. */
const GREAT = 6;
/** Ayın kesiti olan olgular: basılmazsa beklemez, gelecek ay yenisi yazılır. */
const MONTHLY_KINDS = new Set(['front', 'abroad', 'market', 'rank', 'battle', 'annual', 'quiet', 'profile', 'arms', 'harvest', 'output', 'league']);

const MARKET_NAMES = { FOOD: 'Grain', COAL: 'Coal', IRON: 'Iron', TIMBER: 'Timber', HORSES: 'Horseflesh', SALTPETER: 'Saltpeter', OIL: 'Oil', RUBBER: 'Rubber' };

const RULERS = {
  Kingdom: 'the King', Empire: 'the Emperor', Principality: 'the Prince', Duchy: 'the Grand Duke',
  Confederation: 'the Chancellor', Khanate: 'the Khan', Emirate: 'the Emir', Republic: 'the President',
};

/**
 * Oyuncunun vakayinamesinden gazeteye geçen başlıklar. Savaş, barış, başkent
 * ve rejimi yazı işleri kendisi saptar; burası yalnız onların dışındakiler.
 */
const NOTICE_TITLES = /^(Home Rule for|The .+ demand|The .+ rise —|The .+ are crushed|Martial law over|Concessions to|.+ are now an accepted culture|.+ are no longer an accepted|We refused|Call to Arms|Our kin in|.+ is breaking apart|Defeat stirs|.+ handed to|.+ released as|The .+ go free|We answered|We left|.+ demands |We yielded|.+ refuses to yield|We refuse|We broke our pact|.+ broke its pact with us|.+ is no longer our vassal|.+ releases us|.+ is annexed)/;

/** Oyun terimi taşıyan cümle gazete sütununa girmez (arayüz yönergesi, kısayol). */
const UI_WORDS = /infamy|political power|\bPP\b|Diplomacy \(P\)|Answer (in|on)|\bscreen\b|\bweekly\b|×/i;

function hashOf(text) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// ------------------------------------------------------------- KAYIT ---

/** Gazetenin kayda giren hâli: arşiv ve tekrar defterleri. */
export function ensurePress(world, nationId) {
  if (!world.press || world.press.nation !== nationId) {
    world.press = {
      v: 1, nation: nationId, no: 0, issues: [], pool: [],
      used: {}, said: {}, stages: {}, heads: [], photos: [], lastExtra: -99, month: null,
    };
  }
  return world.press;
}

/**
 * Geçen haftanın görüntüsü: kayda girmez, yüklemeden sonra ilk hafta taban
 * olarak yeniden kurulur. Anahtar `press` nesnesidir; yüklenen kayıt yeni nesne
 * getirdiği için eski dünyanın görüntüsüyle karşılaştırma yapılamaz.
 */
const memos = new WeakMap();

// ------------------------------------------------------------- OKUMA ---

const nameOf = (world, id) => world.nations[id]?.name ?? 'an unknown state';
const placeName = (tile) => (tile ? (tile.city?.name ?? provinceName(tile).replace(/ Province$/, '')) : 'the front');

function capitalPhase(nation) {
  const tile = nation.capital;
  if (!tile) return 'lost';
  if (tile.owner !== nation.id) return 'lost';
  return controllerOf(tile) === nation.id ? 'held' : 'occupied';
}

function cityAt(world, tile) {
  return tile?.city?.name ?? (world.cities ?? []).find((city) => city.tile === tile)?.name ?? placeName(tile);
}

/** Gazetenin basıldığı şehir: başkent işgaldeyse elde kalan en büyük şehir. */
function printingCity(world, nation) {
  if (capitalPhase(nation) === 'held') return cityAt(world, nation.capital);
  let best = null;
  for (const city of world.cities ?? []) {
    if (city.nationId !== nation.id || controllerOf(city.tile) !== nation.id) continue;
    if (!best || (city.pop ?? 0) > (best.pop ?? 0)) best = city;
  }
  return best?.name ?? cityAt(world, nation.capital);
}

/** Rejimin sesi: iktidar partisi rejimden önce gelir, basını o yönetir. */
export function voiceOf(nation) {
  const ruling = nation.politics?.ruling;
  if (ruling === 'socialist') return 'labour';
  if (ruling === 'nationalist') return 'jingo';
  const government = nation.politics?.government;
  if (government === 'absolutism') return 'court';
  if (ruling === 'liberal' || government === 'republic') return 'free';
  return 'sober';
}

function rulerOf(nation) {
  const government = nation.politics?.government;
  if (government === 'republic') return 'the President';
  const title = String(nation.fullName ?? '').split(' ').pop();
  if (title === 'Republic') return government === 'absolutism' ? 'the Protector' : 'the Premier';
  return RULERS[title] ?? 'the Crown';
}

function familyOf(world, nation) {
  return world.cultures?.[nation.culture]?.family ?? 'Valdic';
}

/** Savaş cephesinde oyuncunun durumu (dört haftalık önbellekten: pahalı değil). */
function warMood(nation, foeHold, ownHeld) {
  if (foeHold > ownHeld + 1) return 'win';
  if (ownHeld > foeHold + 1) return 'lose';
  const balance = nation.politics?.warBalance;
  if (balance && balance.best > 25) return 'win';
  if (balance && balance.worst < -25) return 'lose';
  return 'even';
}

function greatSet(world) {
  return new Set(scoreboard(world).slice(0, GREAT).map((row) => row.nation.id));
}

function neighboursOf(world, nationId) {
  const out = new Set();
  for (const province of world.provinces ?? []) {
    if (province.owner !== nationId) continue;
    for (const near of province.neighbors ?? []) {
      const owner = world.provinces[near]?.owner;
      if (owner >= 0 && owner !== nationId) out.add(owner);
    }
  }
  return out;
}

function treatyPairs(world, type) {
  const out = new Set();
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    for (const treaty of nation.treaties ?? []) {
      if (treaty.type !== type) continue;
      const pair = type === 'ALLIANCE'
        ? `${Math.min(nation.id, treaty.partner)}:${Math.max(nation.id, treaty.partner)}`
        : `${treaty.partner}:${nation.id}`;
      out.add(pair);
    }
  }
  return out;
}

function snapshotNation(nation) {
  return {
    alive: Boolean(nation.alive),
    gov: nation.politics?.government ?? null,
    ruling: nation.politics?.ruling ?? null,
    capital: nation.alive ? capitalPhase(nation) : null,
    mob: Boolean(nation.mobilization?.active),
    tired: (nation.politics?.exhaustion ?? 0) >= 0.6,
    short: (nation.economy?.bills?.s ?? 1) < 1 - 1e-6,
    hunger: Boolean(nation.events?.hunger?.active),
  };
}

function baseline(world, me) {
  const memo = {
    turn: world.turn,
    rel: new Map(),
    nations: new Map(),
    owners: (world.provinces ?? []).map((province) => province.owner),
    allies: treatyPairs(world, 'ALLIANCE'),
    vassals: treatyPairs(world, 'VASSALIZE'),
    stages: new Map(),
    pockets: new Set((world.pockets ?? []).map((pocket) => pocket.key)),
    worldSeen: new Set(),
    worldDone: new Set(),
    battles: new Map(),
    fought: [],
    great: greatSet(world),
    near: neighboursOf(world, me.id),
    rank: scoreboard(world).findIndex((row) => row.nation.id === me.id) + 1,
    prices: { ...(world.market?.prices ?? {}) },
    pop: me.economy?.population ?? 0,
    lit: me.economy?.literacy ?? 0,
    yearOutput: me.economy?.ic?.output ?? 0,
    halfOutput: me.economy?.ic?.output ?? 0,
    frontHold: new Map(),
  };
  const n = world.nations.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = world.relations?.[a]?.[b];
      if (rec && rec.state !== 'peace') memo.rel.set(a * 4096 + b, relationMemo(rec));
    }
  }
  for (const nation of world.nations) memo.nations.set(nation.id, snapshotNation(nation));
  for (const id of WORLD_EVENT_IDS) {
    const entry = world.worldEvents?.[id];
    if (entry && entry.start <= world.turn) memo.worldSeen.add(id);
    if (entry && entry.until <= world.turn) memo.worldDone.add(id);
  }
  return memo;
}

function relationMemo(rec) {
  return { state: rec.state, since: rec.since ?? 0, aggressor: rec.aggressor ?? -1, reason: rec.reason ?? null, warAt: rec.warAt ?? 0 };
}

// ------------------------------------------------------- HAFTALIK TARAMA ---

/** Olguya önem puanı: oyuncuya, büyük güce ve komşuya yakınlığı puanlanır. */
function scorer(memo, meId) {
  return (ids, { us, great, near, far }) => {
    if (ids.includes(meId)) return us;
    const big = ids.filter((id) => memo.great.has(id)).length;
    if (big >= 2 || (big === 1 && ids.length === 1)) return great;
    if (big === 1 || ids.some((id) => memo.near.has(id))) return near;
    return far;
  };
}

function scanRelations(world, memo, meId, add, weigh, moved) {
  const n = world.nations.length;
  const declared = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const rec = world.relations?.[a]?.[b];
      const key = a * 4096 + b;
      const before = memo.rel.get(key);
      const state = rec?.state ?? 'peace';
      if ((before?.state ?? 'peace') === state) {
        if (rec && state !== 'peace') memo.rel.set(key, relationMemo(rec));
        continue;
      }
      if (state === 'peace') memo.rel.delete(key);
      else memo.rel.set(key, relationMemo(rec));
      const nationA = world.nations[a];
      const nationB = world.nations[b];
      if (!nationA || !nationB) continue;
      if (state === CRISIS || state === WAR) {
        const aggressor = rec.aggressor === b ? b : a;
        const target = aggressor === a ? b : a;
        const open = state === WAR;
        // Ültimatomla başlayan savaşın ikinci haberi sınırın geçilmesidir;
        // YZ'nin küçük ültimatomları her hafta manşet olmasın.
        const s = weigh([a, b], open
          ? { us: 94, great: 78, near: 46, far: 34 }
          : { us: 92, great: 66, near: 34, far: 18 });
        const fact = {
          k: 'war', a: nameOf(world, aggressor), b: nameOf(world, target),
          us: aggressor === meId ? 'a' : target === meId ? 'b' : '', ph: open ? 'open' : 'declared',
          s, key: `war:${Math.min(a, b)}:${Math.max(a, b)}:${open ? 1 : 0}`,
          x: (aggressor === meId || target === meId) || s >= 78,
        };
        if (!open) fact.wk = Math.max(0, (rec.warAt ?? world.turn) - world.turn);
        if (rec.reason) fact.why = rec.reason;
        declared.push(fact);
        continue;
      }
      if (before?.state !== WAR) continue;
      // Barış: toprağı bu haftanın sahiplik farkı söyler.
      const toA = moved.get(`${b}>${a}`) ?? 0;
      const toB = moved.get(`${a}>${b}`) ?? 0;
      const aWon = toA >= toB;
      const winner = aWon ? a : b;
      const loser = aWon ? b : a;
      const n_ = Math.abs(toA - toB);
      const vas = (world.nations[loser].treaties ?? []).some((t) => t.type === 'VASSALIZE' && t.partner === winner && t.since === world.turn);
      const s = weigh([a, b], { us: 92, great: 64, near: 40, far: 26 }) + Math.min(10, n_ * 2);
      add({
        k: 'peace', a: nameOf(world, winner), b: nameOf(world, loser),
        us: winner === meId ? 'a' : loser === meId ? 'b' : '', n: n_, wk: Math.max(1, world.turn - (before.since ?? world.turn)),
        ...(vas ? { vas: 1 } : {}),
        s, key: `peace:${Math.min(a, b)}:${Math.max(a, b)}`, x: winner === meId || loser === meId,
      });
    }
  }
  // İttifak zinciri aynı haftada onlarca çift açar: tek haber, kalanı sayı olur.
  const foreign = declared.filter((fact) => !fact.us).sort((p, q) => q.s - p.s);
  for (const fact of declared) if (fact.us) add(fact);
  if (foreign.length) {
    const head = foreign[0];
    if (foreign.length > 1) head.n = foreign.length - 1;
    add(head);
  }
}

function scanNations(world, memo, me, add, weigh, press) {
  for (const nation of world.nations) {
    const before = memo.nations.get(nation.id);
    const now = snapshotNation(nation);
    memo.nations.set(nation.id, now);
    const id = nation.id;
    const us = id === me.id;
    if (!before) {
      if (now.alive) announceBirth(world, memo, me, nation, add, weigh);
      continue;
    }
    if (before.alive && !now.alive) {
      const heir = nation.capital?.owner;
      add({
        k: 'state_ended', a: nation.name, ...(heir >= 0 && heir !== id ? { by: nameOf(world, heir) } : {}),
        s: weigh([id], { us: 99, great: 76, near: 52, far: 38 }), key: `end:${id}`, x: memo.great.has(id),
      });
      continue;
    }
    if (!before.alive && now.alive) {
      announceBirth(world, memo, me, nation, add, weigh);
      continue;
    }
    if (!now.alive) continue;

    if (before.capital === 'held' && now.capital === 'occupied') {
      const by = controllerOf(nation.capital);
      add({
        k: 'capital_fell', city: cityAt(world, nation.capital), a: nation.name, by: nameOf(world, by),
        us: us ? 'a' : by === me.id ? 'by' : '',
        s: weigh([id, by], { us: 98, great: 78, near: 50, far: 40 }), key: `capital:${id}`,
        x: us || by === me.id || memo.great.has(id),
      });
    } else if (before.capital === 'occupied' && now.capital === 'held') {
      add({
        k: 'capital_freed', city: cityAt(world, nation.capital), a: nation.name, us: us ? 1 : 0,
        s: weigh([id], { us: 80, great: 52, near: 40, far: 28 }), key: `capital:${id}`, x: us,
      });
    }
    if (before.gov && now.gov && before.gov !== now.gov) {
      const to = nation.politics?.government;
      add({
        k: 'regime', a: nation.name, to: governmentName(to), us: us ? 1 : 0,
        s: weigh([id], { us: 94, great: 66, near: 44, far: 30 }), key: `regime:${id}`,
        x: us || (memo.great.has(id) && to !== 'constitutional'),
      });
    } else if (before.ruling && now.ruling && before.ruling !== now.ruling && (us || memo.great.has(id))) {
      add({
        k: 'cabinet', a: nation.name, party: rulingParty(nation).name, us: us ? 1 : 0,
        s: us ? 56 : 34, key: `cabinet:${id}`,
      });
    }
    if (!before.mob && now.mob && (us || memo.great.has(id))) {
      add({ k: 'mobilise', a: nation.name, us: us ? 1 : 0, s: us ? 62 : 44, key: `mob:${id}` });
    }
    const enemy = (world.relations?.[Math.min(id, me.id)]?.[Math.max(id, me.id)]?.state === WAR);
    if (!before.tired && now.tired && (us || enemy)) {
      add({ k: 'weary', a: nation.name, us: us ? 1 : 0, wk: nation.politics?.warWeeks ?? 0, s: us ? 66 : 54, key: `weary:${id}` });
    }
    if (!before.short && now.short && (us || memo.great.has(id))) {
      add({
        k: 'supply', a: nation.name, us: us ? 1 : 0, pct: Math.round((nation.economy?.bills?.s ?? 1) * 100),
        s: us ? 84 : 36, key: `supply:${id}`, x: us,
      });
    } else if (before.short && !now.short && us) {
      add({ k: 'supply_ok', s: 44, key: 'supply_ok' });
    }
    if (us && !before.hunger && now.hunger) {
      const ratio = nation.economy?.resources?.FOOD?.ratio ?? 1;
      const blockade = Math.round((nation.economy?.blockade ?? 0) * 100);
      add({ k: 'hunger', pct: Math.round(ratio * 100), ...(blockade > 0 ? { blockade } : {}), s: 80, key: 'hunger' });
    } else if (us && before.hunger && !now.hunger) {
      const arc = nation.events?.hunger;
      add({ k: 'hunger_end', wk: Math.max(1, (arc?.ended ?? world.turn) - (arc?.since ?? world.turn)), worst: Math.round((arc?.worst ?? 1) * 100), s: 58, key: 'hunger_end' });
    }
    if (us || memo.great.has(id)) scanMovements(world, memo, nation, us, add, press);
  }
}

function governmentName(id) {
  return { absolutism: 'Absolute Monarchy', constitutional: 'Constitutional Monarchy', republic: 'Republic' }[id] ?? 'Republic';
}

function announceBirth(world, memo, me, nation, add, weigh) {
  const provinceId = nation.capital?.provinceId;
  const parent = provinceId != null ? memo.owners[provinceId] : -1;
  const from = parent >= 0 && parent !== nation.id ? parent : -1;
  add({
    k: 'born', a: nation.name, ...(from >= 0 ? { from: nameOf(world, from) } : {}),
    people: world.cultures?.[nation.culture]?.name ?? '', us: from === me.id ? 1 : 0,
    s: weigh(from >= 0 ? [from] : [nation.id], { us: 96, great: 68, near: 48, far: 36 }), key: `born:${nation.id}`,
    x: from === me.id,
  });
}

/** İlerleme eşikte gidip gelir: aynı halk için yılda bir haber yeter. */
const PEOPLE_QUIET = { us: 52, abroad: 104 };

function scanMovements(world, memo, nation, us, add, press) {
  for (const [cultureId, record] of Object.entries(nation.movements ?? {})) {
    const key = `${nation.id}:${cultureId}`;
    const stage = stageOf(record?.progress ?? 0);
    const before = memo.stages.get(key);
    memo.stages.set(key, stage.index);
    if (before == null || stage.index <= before || stage.index < 1) continue;
    const people = world.cultures?.[cultureId]?.name;
    if (!people) continue;
    const subject = `people:${key}`;
    if (world.turn - (press.said[subject] ?? -999) < (us ? PEOPLE_QUIET.us : PEOPLE_QUIET.abroad)) continue;
    // Aynı aşamaya geri dönmek haber değildir: yalnız daha ileri bir aşama yazılır.
    if (stage.index <= (press.stages[subject] ?? 0)) continue;
    press.stages[subject] = stage.index;
    press.said[subject] = world.turn;
    add({
      k: 'people', people, stage: stage.name, a: nation.name, us: us ? 1 : 0,
      s: (us ? 44 : 20) + stage.index * 6, key: subject,
    });
  }
}

/** Biten muharebeler: her hafta izlenir, ay sonunda en büyüğü haber olur. */
function scanBattles(world, memo) {
  const live = world.battleSystem?.battles ?? [];
  const units = live.length ? new Map(world.units.map((unit) => [unit.id, unit])) : null;
  const commander = (nationId, unitId) => {
    const unit = units?.get(unitId);
    return unit ? generalOfArmy(world.nations[nationId], unit)?.name ?? null : null;
  };
  for (const battle of live) {
    const seen = memo.battles.get(battle.id);
    if (seen) {
      seen.genA ??= commander(battle.attackerNation, battle.attackers[0]);
      seen.genD ??= commander(battle.defenderNation, battle.defenders[0]);
      continue;
    }
    memo.battles.set(battle.id, {
      battle,
      genA: commander(battle.attackerNation, battle.attackers[0]),
      genD: commander(battle.defenderNation, battle.defenders[0]),
    });
  }
  for (const [id, seen] of memo.battles) {
    if (live.includes(seen.battle)) continue;
    memo.battles.delete(id);
    const { battle } = seen;
    // Barışla dağılan muharebenin sonucu yoktur: haber de yoktur.
    if (!battle.result) continue;
    const attackerWon = battle.result === 'attacker';
    memo.fought.push({
      w: attackerWon ? battle.attackerNation : battle.defenderNation,
      l: attackerWon ? battle.defenderNation : battle.attackerNation,
      lw: (attackerWon ? battle.attackerLosses : battle.defenderLosses) * MEN_PER_STRENGTH,
      ll: (attackerWon ? battle.defenderLosses : battle.attackerLosses) * MEN_PER_STRENGTH,
      gen: attackerWon ? seen.genA : seen.genD,
      place: placeName(world.get(battle.q, battle.r)),
    });
  }
}

function scanTreaties(world, memo, meId, add, weigh) {
  const allies = treatyPairs(world, 'ALLIANCE');
  for (const pair of allies) {
    if (memo.allies.has(pair)) continue;
    const [a, b] = pair.split(':').map(Number);
    const s = weigh([a, b], { us: 64, great: 46, near: 30, far: 0 });
    if (s) add({ k: 'alliance', a: nameOf(world, a), b: nameOf(world, b), us: a === meId ? 'a' : b === meId ? 'b' : '', s, key: `ally:${pair}` });
  }
  memo.allies = allies;
  const vassals = treatyPairs(world, 'VASSALIZE');
  for (const pair of vassals) {
    if (memo.vassals.has(pair)) continue;
    const [a, b] = pair.split(':').map(Number);
    add({
      k: 'vassal', a: nameOf(world, a), b: nameOf(world, b), us: a === meId ? 'a' : b === meId ? 'b' : '',
      s: weigh([a, b], { us: 70, great: 42, near: 30, far: 20 }), key: `vassal:${pair}`,
    });
  }
  memo.vassals = vassals;
}

function scanWorldEvents(world, memo, add) {
  for (const id of WORLD_EVENT_IDS) {
    const entry = world.worldEvents?.[id];
    if (!entry) continue;
    if (entry.start <= world.turn && !memo.worldSeen.has(id)) {
      memo.worldSeen.add(id);
      add({ k: 'world', id, title: WORLD_EVENTS[id].title, log: WORLD_EVENTS[id].log, s: 100, key: `world:${id}`, x: true });
    }
    if (entry.until <= world.turn && !memo.worldDone.has(id)) {
      memo.worldDone.add(id);
      if (['influenza', 'depression', 'red_years'].includes(id)) {
        add({ k: 'world_end', id, title: WORLD_EVENTS[id].title, s: 50, key: `world_end:${id}` });
      }
    }
  }
}

/** Oyuncuya gelen olay kartı: `last` zaman aşımında kapanan kartı da gösterir. */
function scanCards(me, since, add) {
  for (const [id, turn] of Object.entries(me.cards?.last ?? {})) {
    if (turn <= since) continue;
    const card = EVENT_CARDS[id];
    if (!card) continue;
    add({ k: 'card', id, title: card.title, text: card.text, s: id === 'revolution' ? 86 : 60, key: `card:${id}`, x: id === 'revolution' });
  }
}

function scanPockets(world, memo, meId, add) {
  const pockets = world.pockets ?? [];
  const now = new Set();
  for (const pocket of pockets) {
    now.add(pocket.key);
    if (memo.pockets.has(pocket.key)) continue;
    const us = pocket.nationId === meId;
    add({
      k: 'pocket', a: nameOf(world, pocket.nationId), place: placeName(world.get(pocket.q, pocket.r)),
      n: pocket.units.length, m: Math.round(pocket.men), us: us ? 1 : 0, s: us ? 76 : 64, key: `pocket:${pocket.key}`,
    });
  }
  memo.pockets = now;
}

/** `turns.addLog` satırları: seçim sonucu, teknoloji, terfi, büyük güç sırası. */
function scanLog(game, since, meId, add) {
  const world = game.world;
  for (const line of game.turns?.log ?? []) {
    const stamp = /^T(\d+): (.*)$/.exec(line);
    if (!stamp || Number(stamp[1]) <= since) continue;
    const text = stamp[2];
    let m = /^Elections: (.+) win (\d+)% of the vote\.$/.exec(text);
    if (m) { add({ k: 'election', party: m[1], pct: Number(m[2]), s: 58, key: 'election' }); continue; }
    m = /^New law: (.+)\.$/.exec(text);
    if (m) { add({ k: 'law', name: m[1], s: 44, key: `law:${m[1]}` }); continue; }
    m = /^Research complete: (.+)\.$/.exec(text);
    if (m) { add({ k: 'research', tech: m[1], s: 30, key: `research:${m[1]}` }); continue; }
    m = /^(.+) was promoted to skill (\d+)\.$/.exec(text);
    if (m && generalsOf(world.nations[meId]).some((general) => general.name === m[1])) {
      add({ k: 'general', name: m[1], skill: Number(m[2]), s: 26, key: `general:${m[1]}:${m[2]}` });
      continue;
    }
    m = /^(.+) now stands among the great powers\.$/.exec(text);
    if (m) { add({ k: 'powers', a: m[1], up: 1, s: 54, key: `powers:${m[1]}` }); continue; }
    m = /^(.+) has slipped from the ranks of the great powers\.$/.exec(text);
    if (m) { add({ k: 'powers', a: m[1], up: 0, s: 50, key: `powers:${m[1]}` }); continue; }
    m = /^(.+) is now the world's first industrial power\.$/.exec(text);
    if (m) add({ k: 'industry', a: m[1], us: m[1] === world.nations[meId].name ? 1 : 0, s: 56, key: 'industry' });
  }
}

/** Oyuncunun vakayinamesi: saptanmayan ulusal olaylar başlığıyla gazeteye geçer. */
function scanChronicle(me, since, add) {
  const list = me.chronicle ?? [];
  for (let i = list.length - 1; i >= 0 && list[i].turn > since; i--) {
    const entry = list[i];
    if (!NOTICE_TITLES.test(entry.title)) continue;
    add({ k: 'notice', title: entry.title, sec: 'home', s: entry.tier >= 3 ? 72 : 48, key: `notice:${entry.title}` });
  }
}

/** Dünya tarihi defteri: deniz muharebeleri ve diplomasi satırları. */
function scanHistory(world, since, meId, add) {
  const list = world.history ?? [];
  for (let i = list.length - 1; i >= 0 && list[i].turn > since; i--) {
    const entry = list[i];
    const ours = (entry.actors ?? []).includes(meId);
    if (!ours && (entry.tier ?? 0) < 2) continue;
    const detail = entry.detail && !UI_WORDS.test(entry.detail) ? entry.detail : '';
    add({
      k: 'wire', title: entry.title, detail, sec: entry.kind === 'NAVAL' ? 'front' : 'abroad',
      s: (ours ? 62 : 38) + (entry.tier ?? 0) * 4, key: `wire:${entry.key ?? entry.title}`,
    });
  }
}

// --------------------------------------------------------- AYLIK DURUM ---

function monthlyFacts(world, memo, me, press, post) {
  let added = 0;
  const add = (fact) => { added++; post(fact); };
  const turn = world.turn;
  const quietFor = (key, weeks) => turn - (press.said[key] ?? -999) >= weeks;
  const date = dateOfTurn(turn);
  const board = scoreboard(world);
  memo.great = new Set(board.slice(0, GREAT).map((row) => row.nation.id));
  memo.near = neighboursOf(world, me.id);

  // Ayın muharebesi: oyuncununki önce, dünyanın en kanlısı ayrıca.
  const fought = memo.fought;
  memo.fought = [];
  const size = (row) => row.lw + row.ll;
  const ours = fought.filter((row) => row.w === me.id || row.l === me.id).sort((p, q) => size(q) - size(p))[0];
  const theirs = fought.filter((row) => row.w !== me.id && row.l !== me.id).sort((p, q) => size(q) - size(p))[0];
  for (const row of [ours, theirs]) {
    if (!row || size(row) < 2000) continue;
    const mine = row.w === me.id || row.l === me.id;
    add({
      k: 'battle', w: nameOf(world, row.w), l: nameOf(world, row.l), place: row.place, ...(row.gen ? { gen: row.gen } : {}),
      lw: Math.round(row.lw), ll: Math.round(row.ll), us: row.w === me.id ? 'w' : row.l === me.id ? 'l' : '',
      s: mine ? 70 : 30 + Math.min(18, size(row) / 12000), key: `battle:${row.place}`,
    });
  }

  // Oyuncunun cepheleri: en kanlı savaş, ay ay.
  const wars = [];
  for (const other of world.nations) {
    if (!other.alive || other.id === me.id) continue;
    const rec = relation(world, me.id, other.id);
    if (rec?.state !== WAR) continue;
    const losses = warLossesOf(world, me.id, other.id);
    wars.push({ other, rec, lo: (losses[me.id] ?? 0) * MEN_PER_STRENGTH, lt: (losses[other.id] ?? 0) * MEN_PER_STRENGTH });
  }
  wars.sort((p, q) => (q.lo + q.lt) - (p.lo + p.lt) || p.other.id - q.other.id);
  for (const war of wars.slice(0, 2)) {
    const hold = occupiedProvincesOf(world, me.id, war.other.id).length;
    const held = occupiedProvincesOf(world, war.other.id, me.id).length;
    const last = memo.frontHold.get(war.other.id);
    memo.frontHold.set(war.other.id, hold - held);
    const moved = last != null && last !== hold - held;
    const staff = [...generalsOf(me)].sort((p, q) => (q.divisions?.length ?? 0) - (p.divisions?.length ?? 0) || (q.skill ?? 0) - (p.skill ?? 0))[0];
    add({
      k: 'front', foe: war.other.name, wk: Math.max(1, turn - (war.rec.since ?? turn)), hold, held,
      lo: Math.round(war.lo), lt: Math.round(war.lt), mood: warMood(me, hold, held), ...(staff?.name ? { gen: staff.name } : {}),
      s: moved ? 60 : 46, key: `front:${war.other.id}`,
    });
  }

  // Dünyanın en kanlı yabancı savaşı.
  const n = world.nations.length;
  let far = null;
  for (let a = 0; a < n; a++) {
    if (a === me.id || !world.nations[a].alive) continue;
    for (let b = a + 1; b < n; b++) {
      if (b === me.id || !world.nations[b].alive) continue;
      const rec = world.relations?.[a]?.[b];
      if (rec?.state !== WAR) continue;
      const losses = rec.losses ?? {};
      const total = (losses[a] ?? 0) + (losses[b] ?? 0);
      if (!far || total > far.total) far = { a, b, rec, total, losses };
    }
  }
  if (far && far.total > 0 && quietFor(`abroad:${far.a}:${far.b}`, 17)) {
    const attacker = far.rec.aggressor === far.b ? far.b : far.a;
    const defender = attacker === far.a ? far.b : far.a;
    add({
      k: 'abroad', a: nameOf(world, attacker), b: nameOf(world, defender), wk: Math.max(1, turn - (far.rec.since ?? turn)),
      hold: occupiedProvincesOf(world, attacker, defender).length,
      la: Math.round((far.losses[attacker] ?? 0) * MEN_PER_STRENGTH), lb: Math.round((far.losses[defender] ?? 0) * MEN_PER_STRENGTH),
      s: 34 + (memo.great.has(attacker) || memo.great.has(defender) ? 12 : 0), key: `abroad:${far.a}:${far.b}`,
    });
  }

  // Güçler sıralaması. Sıra iki komşu arasında gidip gelir: üç ayda bir yazılır
  // ve taban ancak haber olunca taşınır, yoksa salınım her ay "yükseldi" derdi.
  const rank = board.findIndex((row) => row.nation.id === me.id) + 1;
  if (rank > 0 && memo.rank > 0 && rank !== memo.rank && (rank <= 12 || memo.rank <= 12) && quietFor('rank', 13)) {
    add({ k: 'rank', from: memo.rank, to: rank, yr: date.getUTCFullYear(), lead: board[0]?.nation.name ?? '', s: rank <= 3 && rank < memo.rank ? 66 : 42, key: 'rank' });
    memo.rank = rank;
  }

  // Borsa: ayın en çok oynayan malı.
  const prices = world.market?.prices ?? {};
  let mover = null;
  for (const id of RESOURCE_IDS) {
    const before = memo.prices[id];
    if (!before || !prices[id]) continue;
    const change = (prices[id] - before) / before;
    if (!mover || Math.abs(change) > Math.abs(mover.change)) mover = { id, change };
  }
  memo.prices = { ...prices };
  if (mover && Math.abs(mover.change) >= 0.08 && quietFor(`market:${mover.id}`, 13)) {
    const pct = Math.round(Math.abs(mover.change) * 100);
    add({ k: 'market', good: MARKET_NAMES[mover.id] ?? RESOURCES[mover.id]?.name ?? mover.id, pct, up: mover.change > 0 ? 1 : 0, s: 22 + Math.min(20, pct), key: `market:${mover.id}` });
  }

  // Barış ayının sayfası: her biri gerçek bir kesit, kendi sıklığında.
  const regiments = new Map();
  for (const unit of world.units) {
    if (unit.type?.domain === 'land') regiments.set(unit.nationId, (regiments.get(unit.nationId) ?? 0) + regimentCount(unit));
  }
  const month = date.getUTCMonth();
  // Haberin hiç olmadığı ay da sayfa dolar: boş gazete basılmaz.
  if (quietFor('profile', 8) || (!press.pool.length && !added)) {
    const candidates = board.slice(0, 16).filter((row) => row.nation.id !== me.id && row.nation.capital);
    const next = candidates.sort((p, q) => (press.said[`profile:${p.nation.id}`] ?? -1) - (press.said[`profile:${q.nation.id}`] ?? -1))[0]?.nation;
    if (next) {
      add({
        k: 'profile', a: next.name, capital: cityAt(world, next.capital), pop: Math.round(next.economy?.population ?? 0),
        gov: governmentName(next.politics?.government), party: rulingParty(next).name,
        lit: Math.round((next.economy?.literacy ?? 0) * 100), regs: regiments.get(next.id) ?? 0,
        ...(world.nations.some((o) => o.alive && relation(world, next.id, o.id)?.state === WAR) ? { war: 1 } : {}),
        s: 24, key: `profile:${next.id}`,
      });
      press.said.profile = turn;
    }
  }
  const rival = world.nations[me.rivalId] ?? board.find((row) => row.nation.id !== me.id)?.nation;
  if (rival?.alive && quietFor('arms', 21)) {
    add({
      k: 'arms', regs: regiments.get(me.id) ?? 0, rival: rival.name, rregs: regiments.get(rival.id) ?? 0,
      ships: me.navy?.ships?.length ?? 0, rships: rival.navy?.ships?.length ?? 0, s: 28, key: 'arms',
    });
  }
  if (month === 8) {
    const food = me.economy?.resources?.FOOD;
    if (food?.need > 0) add({ k: 'harvest', pct: Math.round((food.produced / food.need) * 100), yr: date.getUTCFullYear(), s: 32, key: `harvest:${date.getUTCFullYear()}` });
  }
  if (month === 3 || month === 9) {
    const output = me.economy?.ic?.output ?? 0;
    const pct = memo.halfOutput > 0 ? Math.round(((output - memo.halfOutput) / memo.halfOutput) * 100) : 0;
    memo.halfOutput = output;
    if (pct !== 0) add({ k: 'output', pct, yr: date.getUTCFullYear(), half: month === 3 ? 'winter' : 'summer', s: 30 + Math.min(10, Math.abs(pct)), key: `output:${month}` });
  }
  if ((month === 0 || month === 6) && board.length >= 3) {
    add({
      k: 'league', a: board[0].nation.name, b: board[1].nation.name, third: board[2].nation.name,
      sa: board[0].total, sb: board[1].total, yr: date.getUTCFullYear(), s: 29, key: `league:${month}`,
    });
  }

  // Dönüm noktaları: nüfus ve okuryazarlık eşikleri.
  const pop = me.economy?.population ?? 0;
  const step = pop < 2e7 ? 2e6 : 5e6;
  if (Math.floor(pop / step) > Math.floor(memo.pop / step)) {
    add({ k: 'milestone', what: 'pop', n: Math.floor(pop / step) * step, s: 36, key: `pop:${Math.floor(pop / step)}` });
  }
  memo.pop = pop;
  const lit = me.economy?.literacy ?? 0;
  if (Math.floor(lit * 20) > Math.floor(memo.lit * 20)) {
    add({ k: 'milestone', what: 'lit', n: Math.floor(lit * 20) * 5, s: 34, key: `lit:${Math.floor(lit * 20)}` });
  }
  memo.lit = lit;

  // Yıl başı bilançosu.
  if (date.getUTCMonth() === 0) {
    const output = me.economy?.ic?.output ?? 0;
    const change = memo.yearOutput > 0 ? Math.round(((output - memo.yearOutput) / memo.yearOutput) * 100) : 0;
    memo.yearOutput = output;
    add({
      k: 'annual', yr: date.getUTCFullYear() - 1, out: change, pop: Math.round(pop), lit: Math.round(lit * 100), rank,
      s: 48, key: `annual:${date.getUTCFullYear()}`,
    });
  }
  return { rank, pop };
}

// ---------------------------------------------------------------- BASKI ---

/** Son sayılarda manşet olmuş tür ve konu geri plana iner. */
function leadScore(fact, press) {
  let score = fact.s;
  const recent = press.issues.slice(-4);
  for (const issue of recent) {
    if (issue.lead.k === fact.k) score -= 10;
  }
  const said = press.said[fact.key];
  if (said != null && (press.lastTurn ?? 0) - said < 26) score -= 18;
  return score;
}

/** Az kullanılmış, yakın zamanda basılmamış manşet seçeneğini bulur. */
function chooseVariant(fact, ctx, press, salt) {
  const count = headOptions(fact, ctx);
  const tag = (i) => `${fact.k}|${ctx.voice}|${fact.us ?? ''}|${fact.ph ?? ''}|${i}`;
  const order = Array.from({ length: count }, (_, i) => i)
    .sort((p, q) => (press.used[tag(p)] ?? -1) - (press.used[tag(q)] ?? -1)
      || ((p + salt) % count) - ((q + salt) % count));
  const fresh = order.find((i) => !press.heads.includes(hashOf(headText(fact, ctx, i).toLowerCase())));
  const v = fresh ?? order[0];
  press.used[tag(v)] = press.no;
  press.heads.push(hashOf(headText(fact, ctx, v).toLowerCase()));
  if (press.heads.length > HEAD_MEMORY) press.heads.splice(0, press.heads.length - HEAD_MEMORY);
  return v;
}

/** Kayda girmeyecek çalışma alanları (puan, konu anahtarı, olağanüstü bayrağı). */
function strip(fact, v) {
  const { s, x, key, born, ...kept } = fact;
  return { ...kept, v };
}

/** Ulusun bugünkü gazetesi: dil ailesi, rejimin sesi ve basıldığı şehirden. */
export function paperOf(world, nation) {
  const family = familyOf(world, nation);
  const voice = voiceOf(nation);
  const city = printingCity(world, nation);
  return { family, voice, city, paper: paperName(family, voice, city, nation.name, hashOf(`${world.seed}:${nation.id}:${voice}`)) };
}

function printIssue(world, press, me, { extra, facts }) {
  const turn = world.turn;
  const { family, voice, city, paper } = paperOf(world, me);
  const header = {
    n: press.no + 1, t: turn, x: extra ? 1 : 0, fam: family, vo: voice, ci: city, na: me.name, ru: rulerOf(me),
    pa: paper,
  };
  const ctx = contextOf(header);
  press.lastTurn = turn;

  // Aynı konunun iki notu varsa yenisi geçerlidir.
  const latest = new Map();
  for (const fact of facts) latest.set(fact.key, fact);
  const ranked = [...latest.values()].sort((p, q) => leadScore(q, press) - leadScore(p, press) || p.key.localeCompare(q.key));
  const lead = extra ? (ranked.find((fact) => fact.x) ?? ranked[0]) : ranked[0];
  const rest = ranked.filter((fact) => fact !== lead && fact.key !== lead.key);
  const subs = [];
  const kinds = new Set([lead.k]);
  for (const fact of rest) {
    if (subs.length >= SUBS) break;
    if (kinds.has(fact.k)) continue;
    kinds.add(fact.k);
    subs.push(fact);
  }
  for (const fact of rest) {
    if (subs.length >= SUBS) break;
    if (!subs.includes(fact)) subs.push(fact);
  }
  const briefs = rest.filter((fact) => !subs.includes(fact)).slice(0, BRIEFS);
  const printed = [lead, ...subs, ...briefs];

  const salt = hashOf(`${world.seed}:${press.no}`);
  const dress = (fact, i) => strip(fact, chooseVariant(fact, ctx, press, salt + i));
  const issue = {
    ...header,
    lead: dress(lead, 0),
    subs: subs.map((fact, i) => dress(fact, i + 1)),
    briefs: briefs.map((fact, i) => dress(fact, i + 3)),
  };

  // Yan yana iki sayıda aynı fotoğraf olmasın.
  const photos = photosFor(issue.lead);
  issue.ph = photos.find((photo) => !press.photos.includes(photo)) ?? photos[salt % photos.length];
  press.photos.push(issue.ph);
  if (press.photos.length > 5) press.photos.shift();

  for (const fact of printed) press.said[fact.key] = turn;
  // Ayın durumu bir sonraki sayıya kalmaz: geçen ayın rakamı artık yanlıştır.
  const gone = new Set(printed.map((fact) => fact.key));
  press.pool = press.pool.filter((fact) => !gone.has(fact.key) && !MONTHLY_KINDS.has(fact.k));
  if (Object.keys(press.said).length > 400) {
    for (const [key, at] of Object.entries(press.said)) if (turn - at > 104) delete press.said[key];
  }
  press.no = issue.n;
  press.issues.push(issue);
  if (press.issues.length > MAX_ISSUES) press.issues.shift();
  return issue;
}

/**
 * Haftalık giriş. Her `turn` olayında bir kez çağrılır; basılan sayıyı döner.
 * Aynı hafta ikinci çağrı (kurulum, yükleme, ülke seçimi) hiçbir şey yapmaz.
 */
export function pressWeek(game) {
  const world = game.world;
  const meId = game.turns?.playerNation;
  const me = world?.nations?.[meId];
  if (!me?.alive || !me.economy) return null;
  const press = ensurePress(world, meId);
  const memo = memos.get(press);
  if (!memo) {
    memos.set(press, baseline(world, me));
    return null;
  }
  if (memo.turn === world.turn) return null;
  const since = memo.turn;
  memo.turn = world.turn;

  // Bu haftanın sahiplik farkı: barışın kaç province'e mal olduğunu söyler.
  const moved = new Map();
  (world.provinces ?? []).forEach((province, i) => {
    const before = memo.owners[i];
    if (before === province.owner) return;
    if (before >= 0 && province.owner >= 0) {
      const key = `${before}>${province.owner}`;
      moved.set(key, (moved.get(key) ?? 0) + 1);
    }
  });

  const fresh = [];
  const add = (fact) => { fresh.push({ ...fact, born: world.turn }); };
  const weigh = scorer(memo, meId);
  scanRelations(world, memo, meId, add, weigh, moved);
  scanNations(world, memo, me, add, weigh, press);
  memo.owners = (world.provinces ?? []).map((province) => province.owner);
  scanBattles(world, memo);
  scanTreaties(world, memo, meId, add, weigh);
  scanWorldEvents(world, memo, add);
  scanCards(me, since, add);
  scanPockets(world, memo, meId, add);
  scanLog(game, since, meId, add);
  scanChronicle(me, since, add);
  scanHistory(world, since, meId, add);
  press.pool.push(...fresh);
  press.pool = press.pool.filter((fact) => world.turn - (fact.born ?? world.turn) <= POOL_WEEKS);

  const month = dateOfTurn(world.turn).getUTCFullYear() * 12 + dateOfTurn(world.turn).getUTCMonth();
  press.month ??= month;
  const monthly = month !== press.month;

  // Olağanüstü sayı: büyük olay hemen basılır, ama iki sayı üst üste binmez.
  const urgent = press.pool.some((fact) => fact.x) && world.turn - press.lastExtra >= EXTRA_GAP;
  if (!urgent && !monthly) return null;

  let standing = null;
  if (monthly) {
    press.month = month;
    const gathered = [];
    standing = monthlyFacts(world, memo, me, press, (fact) => gathered.push({ ...fact, born: world.turn }));
    press.pool.push(...gathered);
  }
  if (urgent) press.lastExtra = world.turn;
  if (!press.pool.length) {
    press.pool.push({
      k: 'quiet', pop: Math.round(standing?.pop ?? me.economy?.population ?? 0), rank: standing?.rank ?? memo.rank,
      s: 10, key: `quiet:${month}`, born: world.turn,
    });
  }
  return printIssue(world, press, me, { extra: urgent, facts: press.pool });
}

/** Chronicle arşivi için son sayılar, en yeni başta. */
export function pressIssues(world) {
  return [...(world?.press?.issues ?? [])].reverse();
}

export function pressIssue(world, number) {
  return (world?.press?.issues ?? []).find((issue) => issue.n === number) ?? null;
}
