// HALKLAR GÖZLEMCİSİ — audit:homeland, audit:peoples ve audit:culture-unrest'in
// ortak sayacı. Üretim kodu DEĞİLDİR; yalnız gözler, simülasyona dokunmaz.
//
// Neden ortak: aynı soruyu ("bu küme hangi kanaldan el değiştirdi, bu halk ne
// zaman hak aldı") üç denetim ayrı ayrı sayarsa tanımlar kayar ve paketler
// arası karşılaştırma bozulur (redesign §5: her eşik bir tabana kıyaslanır).
//
// KANAL SINIFLAMASI (sahiplik değişimi):
//   claim (TurnManager)          'war' / 'settle'      savaşta alım, boş toprağa yerleşme
//   claimAtPeace ← applyTerms    'liberate'            barış şartı LIBERATE
//   claimAtPeace ← signPeace     'peace'               barış masasında devir
//   claimAtPeace ← proposeUnion  'union'               barışçıl birleşme
//   claimAtPeace ← checkElim.    'elimination'         elenen ulusun mirası
//   doğrudan yazım (claim yok)   'people'              HALK KANALI: ayaklanma, vasal/
//                                                      Dominion bırakma, akrabaya bırakma,
//                                                      (D2) kopuş — movements/nationBirth
// Halk kanalı alt türü hareket kaydından okunur: ayaklanma sayacı arttıysa
// 'uprising', bu hafta bize VASSALIZE bağıyla doğan devlete gittiyse
// 'dominion', world.cultureReleases arttıysa 'release', world.breakaways
// (D2) arttıysa 'breakaway'.
//
// Bu tanım redesign §2.0 "kim ayrılabilir" ile aynı soruyu sorar: kopuş,
// bırakma ve LIBERATE ayrı sayılır ama hepsi "halk kanalı" toplamına girer.

import { TurnManager } from '../../src/game/turn.js';
import * as culture from '../../src/game/culture.js';
import * as movements from '../../src/game/movements.js';
import { calendarYear } from '../../src/game/calendar.js';
import { culturePools } from '../../src/game/levy.js';
import { provinceOutputBase } from '../../src/game/econ/output.js';
import { provinceStatus } from '../../src/game/provinces.js';
import { powerIncome } from '../../src/game/politics.js';
import { capitalProvinceOf } from '../../src/game/peace.js';
import { atWar } from '../../src/game/diplomacy.js';

// ------------------------------------------------------- SAHİPLİK KANALI ---

const pendingClaims = [];
let installed = false;

/**
 * claim/claimAtPeace sarılır (süreç başına bir kez). Yığın izi yalnız el
 * değiştiren nadir haftalarda alınır; simülasyonu değiştirmez.
 */
export function installClaimTracker() {
  if (installed) return;
  installed = true;
  const claimBase = TurnManager.prototype.claim;
  TurnManager.prototype.claim = function tracked(tile, nationId) {
    const province = this.world.provinces?.[tile?.provinceId];
    const before = province?.owner ?? -2;
    const done = claimBase.call(this, tile, nationId);
    if (done && province && province.owner !== before) {
      pendingClaims.push({ pid: province.id, from: before, to: province.owner, cause: before < 0 ? 'settle' : 'war' });
    }
    return done;
  };
  const peaceBase = TurnManager.prototype.claimAtPeace;
  TurnManager.prototype.claimAtPeace = function tracked(tile, nationId) {
    const province = this.world.provinces?.[tile?.provinceId];
    const before = province?.owner ?? -2;
    const done = peaceBase.call(this, tile, nationId);
    if (done && province && province.owner !== before) {
      const stack = new Error().stack ?? '';
      let cause = 'other-claim';
      if (stack.includes('applyTerms')) cause = 'liberate';
      else if (stack.includes('signPeace')) cause = 'peace';
      else if (stack.includes('proposeUnion')) cause = 'union';
      else if (stack.includes('checkElimination')) cause = 'elimination';
      pendingClaims.push({ pid: province.id, from: before, to: province.owner, cause });
    }
    return done;
  };
}

/** Bu haftanın talep kayıtlarını alır ve kuyruğu boşaltır. */
export function drainClaims() {
  const out = new Map();
  for (const claim of pendingClaims) out.set(claim.pid, claim);
  pendingClaims.length = 0;
  return out;
}

// ------------------------------------------------------------ KESİTLER ---

export const isRebel = (nation) => nation?.archetype === 'rebel';
export const rowsOf = (province) => (province.cultures?.length
  ? province.cultures
  : (province.culture >= 0 ? [{ id: province.culture, share: 1 }] : []));
const homeRuleOf = (nation) => (Array.isArray(nation?.homeRule) ? nation.homeRule : []);
export const binOf = (year) => Math.floor((year - 1900) / 5) * 5 + 1900;

/**
 * Dünya nüfusunun KONUM payları (redesign §2.0): ana halk, tebaa (hak yok),
 * vatandaş (hak var, özerk değil), özerk (Home Rule). `released` ayrı bir
 * kesittir: Özgür Devlet/Dominion (isyancı arketip) yönetimindeki nüfus.
 * `notAccepted` eski TEST 2 metriğidir (= tebaa payı; Home Rule ⊆ accepted).
 */
export function standingShares(world) {
  let pop = 0;
  const s = { primary: 0, subject: 0, citizen: 0, homeRule: 0, released: 0 };
  for (const province of world.provinces ?? []) {
    if (!province.econ || province.owner < 0) continue;
    const nation = world.nations[province.owner];
    if (!nation?.alive) continue;
    const w = Math.max(0, province.econ.population ?? 0);
    pop += w;
    const homeRule = homeRuleOf(nation);
    for (const row of rowsOf(province)) {
      const people = w * row.share;
      if (row.id === nation.culture) s.primary += people;
      else if (!culture.isAccepted(nation, row.id)) s.subject += people;
      else if (homeRule.includes(row.id)) s.homeRule += people;
      else s.citizen += people;
    }
    if (isRebel(nation)) s.released += w;
  }
  const out = {};
  for (const [k, v] of Object.entries(s)) out[k] = pop > 0 ? v / pop : 0;
  out.notAccepted = out.subject;
  out.nonPrimary = out.subject + out.citizen + out.homeRule;
  return out;
}

/**
 * "Bırakılabilir" çiftler (redesign D7/T3): (sahip × bizim topraklarımızda
 * çoğunluk olan, ana halkımız olmayan halk), başkent kümesi hariç. Engel
 * listesi D7'nin `nationBirth.releasePeopleBlockers`'ından okunur; o yoksa
 * eski `culture.releaseBlockers` (yalnız kırık küme + bitişik akraba) —
 * çıktıda hangisinin okunduğu yazılır. `subject` alt kümesi u3 sondasının
 * tanımıdır (kabul edilmemiş halk): taban 0/52 ve 0/54 bu kümeyle ölçüldü.
 */
export function releasePairs(world, birth = null) {
  const api = typeof birth?.releasePeopleBlockers === 'function'
    ? 'nationBirth.releasePeopleBlockers' : 'culture.releaseBlockers (legacy)';
  const blockersOf = typeof birth?.releasePeopleBlockers === 'function'
    ? (nation, id) => birth.releasePeopleBlockers(world, nation, id)
    : (nation, id) => culture.releaseBlockers(world, nation, id);
  const out = { api, pairs: 0, open: 0, subjectPairs: 0, subjectOpen: 0, reasons: {} };
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const capital = capitalProvinceOf(world, nation.id);
    const peoples = new Set();
    for (const province of world.provinces ?? []) {
      if (province.owner !== nation.id || !province.econ || province === capital) continue;
      if (province.culture >= 0 && province.culture !== nation.culture) peoples.add(province.culture);
    }
    for (const id of [...peoples].sort((a, b) => a - b)) {
      const blockers = blockersOf(nation, id);
      const subject = !culture.isAccepted(nation, id);
      out.pairs++;
      if (subject) out.subjectPairs++;
      if (!blockers.length) {
        out.open++;
        if (subject) out.subjectOpen++;
      }
      for (const why of blockers) out.reasons[why] = (out.reasons[why] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * Kabulün ANLIK kazancı (D8 başvurusu): aynı haftada, aynı durumda, halk
 * kabul edilmiş ve edilmemiş sayılarak ulusun kura havuzu (levy.culturePools)
 * ve el+sanayi taban çıktısı (statü provinceStatus'tan yeniden hesaplanır).
 * Kabul listesi geçici olarak değiştirilir ve HEMEN geri yazılır.
 */
export function acceptanceJump(world, nation, cultureId) {
  const owned = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ);
  const measure = () => {
    let levy = 0;
    let levyRow = 0;
    let output = 0;
    for (const province of owned) {
      const saved = province.econ.status;
      province.econ.status = provinceStatus(world, province);
      for (const row of culturePools(world, province, nation)) {
        levy += row.pool;
        if (row.id === cultureId) levyRow += row.pool;
      }
      const base = provinceOutputBase(province);
      output += base.hand + base.industry;
      province.econ.status = saved;
    }
    return { levy, levyRow, output };
  };
  const keep = nation.accepted;
  const withIt = measure();
  let without;
  try {
    nation.accepted = culture.acceptedCultures(nation).filter((id) => id !== cultureId);
    without = measure();
  } finally {
    nation.accepted = keep;
  }
  return {
    levyWith: withIt.levy, levyWithout: without.levy,
    levyRowWith: withIt.levyRow, levyRowWithout: without.levyRow,
    outputWith: withIt.output, outputWithout: without.output,
  };
}

/** Hak verme fiyatı: D1 kademesi (100 + 50 × hak sahibi halk) varsa o, yoksa düz. */
function acceptPrice(nation, rightsHolders) {
  if (typeof culture.acceptPrice === 'function') return culture.acceptPrice(nation, rightsHolders);
  const step = culture.ACCEPT_STEP ?? culture.CULTURE?.ACCEPT_STEP ?? 0;
  return (culture.ACCEPT_POWER ?? 100) + step * rightsHolders;
}

/** Taviz fiyatı: D1 kademesi (40 + 20k, son 520 hafta) varsa o, yoksa düz. */
function concessionPrice(previous) {
  const step = movements.CONCESSION_STEP ?? movements.MOVEMENT?.CONCESSION_STEP ?? 0;
  return (movements.CONCESSION_POWER ?? 40) + step * previous;
}

// ----------------------------------------------------------- GÖZLEMCİ ---

const ARCHETYPE_EMPIRES = ['kuzey-imparatorlugu', 'bilesik-monarsi', 'kavsak-imparatorlugu', 'dogu-devi'];

export class PeoplesObserver {
  /**
   * @param {object} game başsız oyun (turn 0, ilk endTurn'den önce)
   * @param {object} [options]
   * @param {number} [options.player] SG muhasebesi tutulacak oyuncu (-1 = yok)
   * @param {number[]} [options.standingYears] konum paylarının alınacağı yıllar
   * @param {object} [options.birth] nationBirth modülü (yoksa null)
   * @param {boolean} [options.jumps] kabul anında kazanç ölçülsün mü
   */
  constructor(game, {
    player = game.turns?.playerNation ?? -1,
    standingYears = [1900, 1905, 1910, 1914, 1915, 1920, 1925, 1930, 1935, 1939, 1940, 1945],
    birth = null, jumps = true,
  } = {}) {
    installClaimTracker();
    drainClaims();
    this.game = game;
    this.world = game.world;
    this.player = player;
    this.birth = birth;
    this.jumps = jumps;
    this.standingYears = new Set(standingYears);
    const world = this.world;
    this.owner = world.provinces.map((p) => p.owner);
    this.startOwner = [...this.owner];
    this.alive = world.nations.map((n) => Boolean(n.alive));
    this.accepted = world.nations.map((n) => [...culture.acceptedCultures(n)]);
    this.homeRule = world.nations.map((n) => [...homeRuleOf(n)]);
    this.mov = this.snapMovements();
    this.vassals = this.snapVassals();
    this.counters = this.snapCounters();
    this.lastYear = calendarYear(game.turns?.turn ?? world.turn ?? 0);
    // Güvenlik kilidi kümesi: en büyük halkı ≥ %95 olan uluslar (başlangıçta).
    this.mono = new Map();
    for (const nation of world.nations) {
      if (!nation.alive || isRebel(nation)) continue;
      const mix = culture.cultureMix(world, nation);
      if ((mix[0]?.share ?? 0) >= 0.95) this.mono.set(nation.id, mix[0].share);
    }
    this.startProvinces = world.nations.map((n) => this.owner.filter((o) => o === n.id).length);
    this.events = [];
    this.losses = [];
    this.bins = {};
    this.standing = [{ year: this.lastYear, turn: game.turns?.turn ?? 0, ...standingShares(world) }];
    this.pp = { spent: 0, income: 0, byYear: {} };
    this.concessionTurns = new Map(); // `${nation}:${culture}` → turn[]
    this.alivePoints = [{ year: this.lastYear, ...this.aliveCounts() }];
  }

  bin(year) {
    const key = binOf(year);
    return (this.bins[key] ??= {
      grants: 0, grantsOwnMajority: 0,
      homeRuleGrants: 0, crises: { homeRule: 0, independence: 0, other: 0 },
      dominions: 0, freedDominions: 0,
      uprisings: 0, warUprisings: 0, peacefulUprisings: 0,
      breakaways: {}, breakdowns: 0, breakdownsCounter: 0,
      transfer: {}, people: {}, liberate: { kin: 0, freeState: 0 },
      concessions: 0, martial: 0, crackdowns: 0,
      ppSpent: 0, ppIncome: 0,
    });
  }

  aliveCounts() {
    const nations = this.world.nations.filter((n) => n.alive);
    return { freeStates: nations.filter(isRebel).length, regular: nations.filter((n) => !isRebel(n)).length };
  }

  snapMovements() {
    const out = new Map();
    for (const nation of this.world.nations) {
      for (const [key, s] of Object.entries(nation.movements ?? {})) {
        out.set(`${nation.id}:${key}`, {
          progress: s?.progress ?? 0,
          uprisings: s?.uprisings ?? 0,
          martialUntil: s?.martialUntil ?? 0,
          concessionAt: s?.concessionAt ?? null,
          concessions: Array.isArray(s?.concessionLog) ? s.concessionLog.length : null,
          crisis: s?.crisis ? (s.crisis.kind ?? 'other') : null,
          calmUntil: s?.calmUntil ?? 0,
        });
      }
    }
    return out;
  }

  snapVassals() {
    const out = new Set();
    for (const nation of this.world.nations) {
      for (const t of nation.treaties ?? []) if (t.type === 'VASSALIZE') out.add(`${nation.id}>${t.partner}`);
    }
    return out;
  }

  snapCounters() {
    const w = this.world;
    const breakaways = w.breakaways && typeof w.breakaways === 'object' ? { ...w.breakaways } : null;
    return {
      uprisings: w.uprisings ?? 0,
      vassalReleases: w.vassalReleases ?? 0,
      cultureReleases: w.cultureReleases ?? 0,
      crackdowns: w.crackdowns ?? 0,
      breakdowns: w.breakdowns ?? 0,
      breakaways,
      breakawaySum: breakaways ? Object.values(breakaways).reduce((s, v) => s + (Number(v) || 0), 0) : 0,
    };
  }

  /** Her endTurn'den SONRA bir kez. */
  step() {
    const world = this.world;
    const turn = this.game.turns?.turn ?? world.turn ?? 0;
    const year = calendarYear(turn);
    const b = this.bin(year);
    const claims = drainClaims();
    const counters = this.snapCounters();
    const movNow = this.snapMovements();
    const vassalsNow = this.snapVassals();
    const awakened = new Set(world.nations.filter((n) => n.alive && !this.alive[n.id]).map((n) => n.id));

    // --- sahiplik ---
    const peopleLosses = new Map(); // from → Set(halk)
    for (const province of world.provinces) {
      const from = this.owner[province.id];
      const to = province.owner;
      if (to === from) continue;
      const claim = claims.get(province.id);
      const cause = claim?.cause ?? (from >= 0 ? 'people' : 'other');
      const heir = to >= 0 ? world.nations[to] : null;
      let kind = null;
      if (cause === 'people') {
        const heirCulture = heir?.rebelCulture ?? heir?.culture;
        const key = `${from}:${heirCulture}`;
        if ((movNow.get(key)?.uprisings ?? 0) > (this.mov.get(key)?.uprisings ?? 0)) kind = 'uprising';
        // Bu hafta kurulan (ya da yenilenen) VASSALIZE: releaseAsVassal eski bağı
        // silip since=turn ile yeniden yazar; yeniden bırakma da Dominion'dur.
        else if ((heir?.treaties ?? []).some((t) => t.type === 'VASSALIZE' && t.partner === from && (t.since ?? -1) >= turn - 1)) kind = 'dominion';
        else if (counters.cultureReleases > this.counters.cultureReleases) kind = 'release';
        else if (counters.breakawaySum > this.counters.breakawaySum) kind = 'breakaway';
        else kind = 'other';
        if (!peopleLosses.has(from)) peopleLosses.set(from, new Set());
        peopleLosses.get(from).add(heirCulture);
        b.people[kind] = (b.people[kind] ?? 0) + 1;
      }
      const rec = {
        turn, year, pid: province.id, from, to, cause, kind,
        heirType: isRebel(heir) ? 'freeState' : 'kin',
        awakened: awakened.has(to),
        culture: province.culture,
        fromPrimary: from >= 0 ? world.nations[from]?.culture : -1,
        wasStart: this.startOwner[province.id] === from,
      };
      this.losses.push(rec);
      b.transfer[cause] = (b.transfer[cause] ?? 0) + 1;
      if (cause === 'liberate') b.liberate[rec.heirType]++;
    }
    for (const [from, peoples] of peopleLosses) {
      if (peoples.size >= 2) b.breakdowns++;
      void from;
    }
    b.breakdownsCounter += counters.breakdowns - this.counters.breakdowns;
    if (counters.breakaways) {
      for (const [key, value] of Object.entries(counters.breakaways)) {
        const delta = (Number(value) || 0) - (Number(this.counters.breakaways?.[key]) || 0);
        if (delta) b.breakaways[key] = (b.breakaways[key] ?? 0) + delta;
      }
    }

    // --- ayaklanmalar: hareket kaydının sayacından, mirasçının savaşıyla ---
    for (const [key, now] of movNow) {
      if (now.uprisings <= (this.mov.get(key)?.uprisings ?? 0)) continue;
      const [nationId, cultureId] = key.split(':').map(Number);
      const lost = this.losses.filter((l) => l.turn === turn && l.from === nationId && l.kind === 'uprising');
      const heirId = lost.find((l) => (world.nations[l.to]?.rebelCulture ?? world.nations[l.to]?.culture) === cultureId)?.to ?? -1;
      const war = heirId >= 0 && atWar(world, heirId, nationId);
      b.uprisings++;
      if (war) b.warUprisings++;
      else b.peacefulUprisings++;
      this.events.push({ kind: 'uprising', turn, year, nation: nationId, culture: cultureId, heir: heirId, war, provinces: lost.length });
    }

    // --- haklar: kabul ve Home Rule ---
    for (const nation of world.nations) {
      if (!nation.alive) continue;
      const now = culture.acceptedCultures(nation);
      const before = this.accepted[nation.id];
      if (!awakened.has(nation.id)) {
        for (const cultureId of now) {
          if (before.includes(cultureId)) continue;
          const progress = this.mov.get(`${nation.id}:${cultureId}`)?.progress ?? 0;
          const share = culture.cultureMix(world, nation).find((r) => r.id === cultureId)?.share ?? 0;
          const rightsHolders = before.filter((id) => id !== nation.culture).length;
          const price = acceptPrice(nation, rightsHolders);
          const majority = world.provinces.filter((p) => p.owner === nation.id && p.econ).length > 0
            && culture.cultureMix(world, nation)[0]?.id === cultureId;
          const event = {
            kind: 'grant', turn, year, nation: nation.id, culture: cultureId,
            via: progress >= 59 ? 'movement' : 'yearly', progress: +progress.toFixed(1),
            share: +share.toFixed(3), price, ownMajority: majority,
            player: nation.id === this.player,
          };
          if (this.jumps) event.jump = acceptanceJump(world, nation, cultureId);
          this.events.push(event);
          b.grants++;
          if (majority) b.grantsOwnMajority++;
          if (nation.id === this.player) { this.pp.spent += price; b.ppSpent += price; }
        }
        const homeNow = homeRuleOf(nation);
        for (const cultureId of homeNow) {
          if (this.homeRule[nation.id].includes(cultureId)) continue;
          b.homeRuleGrants++;
          this.events.push({ kind: 'homeRule', turn, year, nation: nation.id, culture: cultureId });
        }
      }
      this.accepted[nation.id] = [...now];
      this.homeRule[nation.id] = [...homeRuleOf(nation)];
    }

    // --- hareket eylemleri: kriz, taviz, sıkıyönetim ---
    for (const [key, now] of movNow) {
      const before = this.mov.get(key);
      const [nationId, cultureId] = key.split(':').map(Number);
      if (now.crisis && !before?.crisis) {
        const kind = now.crisis === 'homeRule' || now.crisis === 'independence' ? now.crisis : 'other';
        b.crises[kind]++;
        this.events.push({ kind: 'crisis', crisis: now.crisis, turn, year, nation: nationId, culture: cultureId });
      }
      const conceded = now.concessions != null
        ? now.concessions > (before?.concessions ?? 0)
        : (now.concessionAt != null && now.concessionAt !== (before?.concessionAt ?? null));
      if (conceded) {
        b.concessions++;
        const list = this.concessionTurns.get(key) ?? [];
        const previous = list.filter((t) => turn - t < 520).length;
        list.push(turn);
        this.concessionTurns.set(key, list);
        if (nationId === this.player) {
          const price = concessionPrice(previous);
          this.pp.spent += price;
          b.ppSpent += price;
        }
      }
      if (now.martialUntil > (before?.martialUntil ?? 0) && now.martialUntil > turn) b.martial++;
    }
    b.crackdowns += counters.crackdowns - this.counters.crackdowns;

    // --- Dominion doğumu ve serbest kalan Dominion ---
    // Dominion = bu hafta halk kanalıyla küme alan ve bize VASSALIZE bağıyla
    // bağlanan devlet. Yalnız "yeni VASSALIZE + isyancı arketip" saymak barış
    // masasında vasallaştırılan Özgür Devletleri de sayıyordu (ölçüldü: STAT1
    // 25 sayım, oysa world.vassalReleases 15).
    const dominionPairs = new Set(this.losses
      .filter((l) => l.turn === turn && l.kind === 'dominion')
      .map((l) => `${l.to}>${l.from}`));
    b.dominions += dominionPairs.size;
    for (const key of this.vassals) {
      if (vassalsNow.has(key)) continue;
      const [vassal, overlord] = key.split('>').map(Number);
      if (isRebel(world.nations[vassal]) && world.nations[vassal].alive && world.nations[overlord]?.alive) b.freedDominions++;
    }

    // --- oyuncunun SG geliri ---
    if (this.player >= 0 && world.nations[this.player]?.alive) {
      const income = powerIncome(world.nations[this.player]).total;
      this.pp.income += income;
      b.ppIncome += income;
      const y = (this.pp.byYear[year] ??= { spent: 0, income: 0 });
      y.income += income;
    }

    // --- yıl dönümü kesitleri ---
    if (year !== this.lastYear) {
      if (this.standingYears.has(year)) this.standing.push({ year, turn, ...standingShares(world) });
      if (year % 5 === 0) this.alivePoints.push({ year, ...this.aliveCounts() });
      this.lastYear = year;
    }

    this.owner = world.provinces.map((p) => p.owner);
    this.alive = world.nations.map((n) => Boolean(n.alive));
    this.mov = movNow;
    this.vassals = vassalsNow;
    this.counters = counters;
  }

  /** Kampanya sonu kesiti ve özet. */
  finish() {
    const world = this.world;
    const turn = this.game.turns?.turn ?? world.turn ?? 0;
    this.standing.push({ year: calendarYear(turn), turn, end: true, ...standingShares(world) });
    this.alivePoints.push({ year: calendarYear(turn), end: true, ...this.aliveCounts() });
    return this.summary();
  }

  summary() {
    const world = this.world;
    const peopleLosses = this.losses.filter((l) => l.cause === 'people');
    // GÜVENLİK KİLİDİ (redesign §2.0): ana halkın izi yoktur, yani çoğunluğu
    // sahibinin ANA halkı olan küme halk kanalından GİDEMEZ — hangi ulus olursa
    // olsun. Kilidin ihlali budur.
    const primaryLosses = peopleLosses.filter((l) => l.culture === l.fromPrimary);
    // Tek halklı (en büyük halkı ≥ %95) ulusların başlangıç kümeleri: §5 T1'in
    // kümesi. Bunların AZINLIK çoğunluklu kümesi (%5'lik bir halkın yurdu)
    // §2.0 "kim ayrılabilir" tanımıyla ayrılabilir; ölçüldü (P0 tabanı):
    // HL 7 kampanyada 1, STAT1-3 YZ-yalnız 0/5/0 küme, hepsi azınlık yurdu,
    // hepsi eski vasal bırakmayla.
    const monoLosses = peopleLosses.filter((l) => this.mono.has(l.from) && l.wasStart);
    // Arketip imparatorlukların 1900 kümeleri: hangi kanaldan gitti?
    const empires = world.nations
      .filter((n) => ARCHETYPE_EMPIRES.includes(n.archetype))
      .map((n) => {
        const lost = this.losses.filter((l) => l.from === n.id && l.wasStart);
        const by = {};
        for (const l of lost) {
          const key = l.cause === 'people' ? `people:${l.kind}` : l.cause;
          by[key] = (by[key] ?? 0) + 1;
        }
        return {
          id: n.id, name: n.name, archetype: n.archetype, start: this.startProvinces[n.id],
          lostPeople: lost.filter((l) => l.cause === 'people').length,
          lostLiberate: lost.filter((l) => l.cause === 'liberate').length,
          lostOther: lost.filter((l) => l.cause !== 'people' && l.cause !== 'liberate').length,
          by, alive: n.alive,
        };
      });
    // Dünya savaşı pencereleri (worldEvents): kopan küme dönemlere bölünür.
    const schedule = world.worldEvents ?? {};
    const great = schedule.great_war;
    const second = schedule.second_great_war;
    const seceded = (lo, hi) => this.losses.filter((l) => (l.cause === 'people' || l.cause === 'liberate')
      && l.turn >= lo && l.turn < hi).length;
    const periods = great ? {
      beforeGreatWar: seceded(0, great.start),
      greatWarPlus312: seceded(great.start, great.start + 312),
      ww2ToEnd: second ? seceded(second.start, Infinity) : null,
      greatWarStart: great.start, ww2Start: second?.start ?? null,
    } : null;
    return {
      bins: this.bins,
      standing: this.standing,
      alive: this.alivePoints,
      events: this.events,
      grants: this.events.filter((e) => e.kind === 'grant').length,
      safety: {
        monoNations: this.mono.size,
        // Kilit ihlali: ana halk çoğunluklu küme halk kanalından gitti.
        violations: primaryLosses.length,
        examples: primaryLosses.slice(0, 5),
        // §5 T1 kümesi: tek halklı ulusun başlangıç kümelerinden gidenler.
        monoLosses: monoLosses.length,
        monoPrimaryLosses: monoLosses.filter((l) => l.culture === l.fromPrimary).length,
        monoExamples: monoLosses.slice(0, 5),
        peopleLossesWorld: peopleLosses.length,
      },
      empires,
      periods,
      pp: this.pp,
      provinces: world.provinces.length,
      changed: world.provinces.filter((p, i) => p.owner !== this.startOwner[i]).length,
      counters: this.snapCounters(),
    };
  }
}
