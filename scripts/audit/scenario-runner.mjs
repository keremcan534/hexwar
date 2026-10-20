// Tek senaryoyu KENDI SURECINDE isletir ve olcumu JSON olarak basar.
//
// Neden ayri surec: units.js'teki `nextId` modul duzeyinde ve dunyalar arasinda
// sifirlanmiyor; command.js `(turn + unit.id) % cadence` ile hangi tumenin o
// hafta hareket edecegine karar veriyor. Ayni surecte kurulan ikinci dunya,
// ayni tohumla bile FARKLI bir oyun olur. Karsilastirmali olcum icin her
// senaryo temiz bir surecte baslamak zorunda.
//
// Kullanim:  node scenario-runner.mjs '<json-spec>'
//
// Kaldiraclar (Uluslar Cagi): `{ law: 'labour', index: 2 }` yasayi kilitsiz ve
// bedelsiz yazar (olcum icin), `{ line: 'rifles', weight: 5 }` hat agirligi,
// `{ feed: 1.15 }` halkin doyurma kolu (elle; 'auto' otomasyona geri verir).
//
// Yeniden tasarim kaldiraclari (redesign §5; API adlari §6 P0). Her biri
// KORUMALIDIR: API yoksa kosu `{ skip }` doner, asla sessizce bos kol kosmaz.
//   `{ course: {x,y}, budget }`         politics.setCourse (D4, P7)
//   `{ nationalities: 'repress'|... }`  politics.nationalities (D1, P4; culture.standingOf ile tanınır)
//   `{ grant: 'subject'|'none' }`       culture.acceptCulture, %15-25'lik tebaa halka BIR KEZ hak
//   `{ warLawLock: 'on'|'off' }`        savasta yasa kilidi: 'on' zorla dususu geri yazar,
//                                       'off' eski kurali (WS < sart − 0.1 → bir kademe in) uygular
//   `{ tier3: 'base'|'redesign' }`      LAWS 3. kademe esikleri 0.8/0.7 ↔ 0.65/0.6 + needsTotalWar
//   `{ levee: true|false }`             mobilization.LEVEE.enabled (D6, P6)
//   `{ consent: true|false }`           provinces.CONSENT.enabled (D8, P9)

import {
  headless, run, runPeaceful, snapshotNation, marketSnapshot, scanInvariants,
} from './harness.mjs';
import { LAWS, lawIndex } from '../../src/game/laws.js';
import { addIdea, refreshModifiers } from '../../src/game/modifiers.js';
import { setFeed, setLinePriority, setLineWeight } from '../../src/game/econ/industry.js';
import { settle } from '../../src/game/treasury.js';
import { battleUnitPower } from '../../src/game/battles.js';
import { reinforcementNeed } from '../../src/game/reinforcement.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { declareWarNow, nationStrength } from '../../src/game/diplomacy.js';
import * as politics from '../../src/game/politics.js';
import * as culture from '../../src/game/culture.js';
import * as mobilization from '../../src/game/mobilization.js';
import * as provinces from '../../src/game/provinces.js';
import { installClaimTracker, drainClaims, standingShares } from './peoples-observer.mjs';

const spec = JSON.parse(process.argv[2]);

/** API'si henuz olmayan kaldirac: kol kosulmaz, SKIP doner. */
class LeverMissing extends Error {}

/** Ulusun tebaa (hak sahibi olmayan, ana halk disi) halki, payi [lo, hi] arasinda olan en buyugu. */
function subjectPeople(world, nation, lo = 0.15, hi = 0.25) {
  const rows = culture.cultureMix(world, nation).filter((r) => !r.primary && !r.accepted);
  return rows.find((r) => r.share >= lo && r.share <= hi) ?? null;
}

function chooseNation(game, mode) {
  const list = game.world.nations.filter((n) => n.alive && n.economy);
  if (typeof mode === 'number') return game.world.nations[mode];
  if (mode === 'first') return list[0];
  if (mode === 'median') {
    const sorted = [...list].sort((a, b) => a.economy.population - b.economy.population);
    return sorted[Math.floor(sorted.length / 2)];
  }
  if (mode === 'largest') {
    return [...list].sort((a, b) => b.economy.population - a.economy.population || a.id - b.id)[0];
  }
  // Hak verme/milliyetler kaldiraci: %15-25'lik tebaa halki olan en kalabalik ulus.
  if (mode === 'subject-people') {
    const fit = list.filter((n) => subjectPeople(game.world, n))
      .sort((a, b) => b.economy.population - a.economy.population || a.id - b.id);
    return fit[0] ?? list.filter((n) => culture.cultureMix(game.world, n).some((r) => !r.primary && !r.accepted && r.share >= 0.08))
      .sort((a, b) => b.economy.population - a.economy.population || a.id - b.id)[0] ?? list[0];
  }
  // varsayılan: en çok sanayisi olan (en zengin ekonomik sinyal; harness.pickNation ile aynı)
  return list.sort((a, b) => (b.economy.ic?.total ?? 0) - (a.economy.ic?.total ?? 0) || a.id - b.id)[0];
}

// Kalkınmayı donduran fikrin kimliği: tavan −10 her zaman 1'e kırpılır, hiçbir
// state uygun kalmaz ve yatırım payı halka döner (economy.splitOutput).
const FREEZE_IDEA = 'audit_freeze_development';

const MUTATIONS = {
  /**
   * Fonu bir değere sabitler. Fark defterden ('grant') geçer: doğrudan
   * yazılsa haftanın kapanışı onu kayıtsız para sayar (unreconciled).
   */
  setFund(game, { nationId, fund }) {
    const nation = game.world.nations[nationId];
    settle(nation, 'grant', fund - (nation.fund ?? 0));
  },
  /** Fona küçük bir dürtü: kaldıraç taramasının gürültü kolu (kelebek etkisi). */
  nudgeFund(game, { nationId, amount = 1 }) {
    settle(game.world.nations[nationId], 'grant', amount);
  },
  /** Bir yatak türünün dünya çıktısını çarpar (0 = tamamen kes). */
  depositScale(game, { resourceId, factor }) {
    for (const province of game.world.provinces ?? []) {
      for (const line of province.deposits ?? []) {
        if (line.id === resourceId) line.size *= factor;
      }
    }
  },
  /** Bütün province nüfuslarını çarpar. */
  populationScale(game, { factor }) {
    for (const province of game.world.provinces ?? []) {
      if (!province.econ) continue;
      province.econ.population = Math.max(0, Math.round(province.econ.population * factor));
    }
  },
  /** Province nüfusunu alay taban seviyesine indirir (insan gücü ~0). */
  drainManpower(game, { nationId }) {
    for (const province of game.world.provinces ?? []) {
      if (province.owner === nationId && province.econ) province.econ.soldiers = province.econ.population;
    }
  },
  /**
   * İzlenen ulus İŞGAL EDİLEN savunan olur: temaslı komşuların en güçlüsü
   * (ordu gücü) savaş açar. Levée kaldıracının koşulu (D6: işgal altındaki
   * savunan) böyle kurulur.
   */
  forceInvasion(game, { nationId }) {
    const world = game.world;
    const nation = world.nations[nationId];
    const rivals = world.nations
      .filter((o) => o.alive && o.id !== nationId && world.contacts?.[nationId]?.[o.id] > 0
        && world.relations[nationId]?.[o.id]?.state !== 'war')
      .sort((a, b) => nationStrength(world, b) - nationStrength(world, a) || a.id - b.id);
    for (const attacker of rivals) {
      attacker.power = Math.max(attacker.power ?? 0, 100);
      if (declareWarNow(game, attacker.id, nation.id, { manual: true })) return;
    }
  },
  /** İzlenen ulusa savaş açar (en yakın temaslı komşu). */
  forceWar(game, { nationId, foes = 1 }) {
    const world = game.world;
    let opened = 0;
    for (const other of world.nations) {
      if (opened >= foes) break;
      if (!other.alive || other.id === nationId) continue;
      if (world.relations[nationId]?.[other.id]?.state === 'war') continue;
      if (!(world.contacts?.[nationId]?.[other.id] > 0)) continue;
      world.nations[nationId].power = Math.max(world.nations[nationId].power ?? 0, 100);
      if (declareWarNow(game, nationId, other.id, { manual: true })) opened++;
    }
  },
  /** Bütün tümenlerin gücünü kırpar: takviye ölçülebilsin. */
  damageArmy(game, { nationId, ratio = 0.5 }) {
    for (const unit of game.world.units) {
      if (unit.nationId !== nationId) continue;
      for (const r of unit.regiments ?? []) {
        r.strength = Math.max(1, Math.round(r.maxStrength * ratio));
        r.organization = 50;
        r.morale = 50;
      }
    }
  },
  /** Teçhizat stoğunu sıfırlar. */
  stripEquipment(game, { nationId }) {
    const stock = game.world.nations[nationId].economy.stock;
    for (const id of Object.keys(stock)) stock[id] = 0;
  },
  /** Teçhizat stoğunu doldurur. */
  floodEquipment(game, { nationId, amount = 500 }) {
    const stock = game.world.nations[nationId].economy.stock;
    for (const id of Object.keys(stock)) stock[id] = amount;
  },
  /**
   * Kalkınmayı dondurur: o andan sonra hiçbir kademe alınamaz, kalan çıktı
   * halka gider. Var olan kademeler kalır (eski fabrika silmenin yerine:
   * bina yok, sanayi kalkınmanın kendisi).
   */
  freezeDevelopment(game, { nationId }) {
    const nation = game.world.nations[nationId];
    addIdea(nation, FREEZE_IDEA, 'Audit: development frozen', { developmentCap: -10 });
    refreshModifiers(nation, game.turns.turn);
  },
};

/** 3. kademe eşikleri: tabandaki 0.8/0.7 ya da D5'in 0.65/0.6 + toplam savaş şartı. */
const TIER3 = {
  base: { conscription: 0.8, economy: 0.7, needsTotalWar: false },
  redesign: { conscription: 0.65, economy: 0.6, needsTotalWar: true },
};

/** Kaldıracın bir kez uygulanan durumu (hak verilen halk gibi): kol boyunca sabit. */
const leverState = new Map();

/**
 * Savaşta yasa kilidi, bütün dünyada (u5 'lock' kolunun öykünmesi). Tur
 * öncesi yasalar ve kilitler okunur; tur sonrası:
 *   on  — savaştaki ulusun kilidi değişmeden inen kademesi geri yazılır
 *         (runPolitics'in zorla düşüşü; seçilen düşüş kilidi değiştirir)
 *   off — eski kural uygulanır: savaş desteği şartın 0.1 altındaysa kademe
 *         iner (src kilitliyse bu kol kilidin YOKLUĞUNU öykünür; kilitsiz
 *         src'de zaten aynı şeyi yapar)
 */
function warLawLockHooks(game, mode) {
  const world = game.world;
  let before = new Map();
  const atWar = (nation) => (nation.economy?.warFronts ?? 0) > 0;
  return {
    before() {
      before = new Map(world.nations.filter((n) => n.alive && n.politics).map((n) => [n.id, {
        laws: { conscription: lawIndex(n, 'conscription'), economy: lawIndex(n, 'economy') },
        locks: { conscription: n.politics.lawLocks?.conscription ?? 0, economy: n.politics.lawLocks?.economy ?? 0 },
      }]));
    },
    after() {
      for (const nation of world.nations) {
        if (!nation.alive || !nation.politics || !atWar(nation)) continue;
        for (const id of ['conscription', 'economy']) {
          const was = before.get(nation.id);
          if (mode === 'on') {
            if (!was) continue;
            const forced = lawIndex(nation, id) < was.laws[id]
              && (nation.politics.lawLocks?.[id] ?? 0) === was.locks[id];
            if (forced) nation.politics.laws[id] = was.laws[id];
          } else {
            let index = lawIndex(nation, id);
            while (index > 0) {
              const option = LAWS[id].options[index];
              const ok = !option.warSupport || (nation.warSupport ?? 0) >= option.warSupport - 0.1 || option.atWarOr;
              if (ok) break;
              index--;
            }
            nation.politics.laws[id] = index;
          }
        }
      }
    },
  };
}

/** Süreç düzeyi sabit kaldıraçları: kol başında bir kez (LAWS, LEVEE, CONSENT). */
function applyConstants(levers) {
  for (const l of levers ?? []) {
    if (l.tier3) {
      const t = TIER3[l.tier3];
      if (!t) throw new Error(`taninmayan tier3 kolu: ${l.tier3}`);
      LAWS.conscription.options[3].warSupport = t.conscription;
      LAWS.economy.options[3].warSupport = t.economy;
      LAWS.conscription.options[3].needsTotalWar = t.needsTotalWar;
      LAWS.economy.options[3].needsTotalWar = t.needsTotalWar;
    } else if (l.levee !== undefined) {
      if (!mobilization.LEVEE) throw new LeverMissing('mobilization.LEVEE yok (D6, P6)');
      mobilization.LEVEE.enabled = Boolean(l.levee);
    } else if (l.consent !== undefined) {
      if (!provinces.CONSENT) throw new LeverMissing('provinces.CONSENT yok (D8, P9)');
      provinces.CONSENT.enabled = Boolean(l.consent);
    }
  }
}

/** Yasa ve hat kaldıraçları: ölçüm için kilitsiz/bedelsiz yazılır. */
function applyLevers(game, nation, levers) {
  for (const [index, l] of (levers ?? []).entries()) {
    if (l.tier3 || l.levee !== undefined || l.consent !== undefined || l.warLawLock) {
      continue; // süreç sabiti ya da haftalık kanca: applyConstants / warLawLockHooks
    } else if (l.course) {
      if (typeof politics.setCourse !== 'function') throw new LeverMissing('politics.setCourse yok (D4, P7)');
      // Rota bir HEDEFTİR: haftalık yeniden yazmak yürüyüşü sıfırlamaz, aynı başlığı korur.
      politics.setCourse(nation, l.course, l.budget ?? 0.30);
    } else if (l.nationalities) {
      if (typeof culture.standingOf !== 'function') throw new LeverMissing('culture.standingOf yok: milliyetler politikasi henuz okunmuyor (D1, P4)');
      nation.politics.nationalities = l.nationalities;
    } else if (l.grant) {
      if (l.grant === 'none' || leverState.has(index)) continue;
      const row = subjectPeople(game.world, nation) ?? subjectPeople(game.world, nation, 0.08, 1);
      leverState.set(index, row?.id ?? null);
      if (!row) throw new Error(`kaldirac uygulanamadi: ${nation.name} icinde tebaa halk yok`);
      // Ölçülen şey hakkın etkisidir, bedelin karşılanabilirliği değil.
      nation.power = Math.max(nation.power ?? 0, 400);
      if (!culture.acceptCulture(game, nation, row.id)) {
        throw new Error(`kaldirac uygulanamadi: ${JSON.stringify(l)} → ${culture.acceptBlockers(game.world, nation, row.id).join('; ')}`);
      }
    } else if (l.law) {
      if (!LAWS[l.law] || !(l.index >= 0 && l.index < LAWS[l.law].options.length)) {
        throw new Error(`kaldirac uygulanamadi: ${JSON.stringify(l)}`);
      }
      nation.politics.laws[l.law] = l.index;
    } else if (l.line) {
      // `priority` hattı ELLE kipine alır: otomasyon dört haftada bir ezmez.
      if (l.priority) setLinePriority(nation, l.line, l.priority);
      else setLineWeight(nation, l.line, l.weight);
    } else if (l.feed !== undefined) {
      // Elle kip: ai.autoFeed yalnız 'auto' kipine yazar, kol yerinde kalır.
      if (!setFeed(nation, l.feed)) throw new Error(`kaldirac uygulanamadi: ${JSON.stringify(l)}`);
    } else if (l.field) {
      nation[l.field] = l.value;
    } else {
      throw new Error(`taninmayan kaldirac: ${JSON.stringify(l)}`);
    }
  }
  refreshModifiers(nation, game.turns.turn);
}

/** API'si henüz olmayan kaldıraç (dünya kurulmadan bakılır). */
function leverMissing(levers) {
  for (const l of levers ?? []) {
    if (l.course && typeof politics.setCourse !== 'function') return 'politics.setCourse yok (D4, P7)';
    if (l.nationalities && typeof culture.standingOf !== 'function') return 'culture.standingOf yok: milliyetler politikasi henuz okunmuyor (D1, P4)';
    if (l.levee !== undefined && !mobilization.LEVEE) return 'mobilization.LEVEE yok (D6, P6)';
    if (l.consent !== undefined && !provinces.CONSENT) return 'provinces.CONSENT yok (D8, P9)';
  }
  return null;
}
const missing = leverMissing(spec.levers);
if (missing) {
  process.stdout.write(JSON.stringify({ seed: spec.seed, label: spec.label ?? '', skip: missing }));
  process.exit(0);
}

const game = headless(spec.seed, spec.worldOptions ?? {});
const warmup = spec.warmup ?? 60;
if (spec.peacefulWarmup) runPeaceful(game, warmup);
else run(game, warmup);

const nation = chooseNation(game, spec.nation ?? 'industry');
if (spec.asPlayer !== false) {
  game.turns.playerNation = nation.id;
  // Oyuncu ulusunda AUTO kapalıdır: kaldıraçları YZ geri sürüklemesin.
  nation.delegation = null;
}

for (const m of spec.mutations ?? []) {
  MUTATIONS[m.name](game, { nationId: nation.id, ...(m.args ?? {}) });
}
applyConstants(spec.levers);
applyLevers(game, nation, spec.levers);
const warLock = (spec.levers ?? []).find((l) => l.warLawLock)?.warLawLock ?? null;
const hooks = warLock ? warLawLockHooks(game, warLock) : null;
const measure = new Set(spec.measure ?? []);
if (measure.has('peoples')) { installClaimTracker(); drainClaims(); }

// Haftalık dünya sayaçları: savaş yasaları ve savaş dönemleri ('warlaws'),
// ölçülen ulusun halk kanalından kaybettiği küme ('peoples').
const warlaws = { natWarWeeks: 0, ext: 0, tm: 0, twe: 0, spells: [], open: new Map() };
const peoples = { lost: 0, owner: game.world.provinces.map((p) => p.owner) };
const trace = [];
const violations = [];
const weeks = spec.weeks ?? 0;
const step = spec.peaceful ? runPeaceful : run;
const invasionAcc = { weeks: 0, warWeeks: 0, occupied: 0 };
for (let i = 0; i < weeks; i++) {
  hooks?.before();
  step(game, 1);
  hooks?.after();
  // Yasa şartı (savaş desteği) düşürürse kaldıraç her hafta yeniden yazılır.
  if (spec.reapply !== false) applyLevers(game, nation, spec.levers);
  for (const m of spec.repeatMutations ?? []) {
    MUTATIONS[m.name](game, { nationId: nation.id, ...(m.args ?? {}) });
  }
  // İşgal kolu (levée): savaş 78 haftada barışla bitebilir; son hafta işgal 0
  // ve savaş haftaları sönmüş olur (kaldıraç 'ölü' görünüyordu). Savaş
  // boyunca ortalama işgal ve savaş haftası sayılır.
  if (measure.has('invasion')) {
    invasionAcc.weeks++;
    if ((nation.economy?.warFronts ?? 0) > 0) {
      invasionAcc.warWeeks++;
      invasionAcc.occupied += nation.economy?.occupiedShare ?? 0;
    }
  }
  if (measure.has('warlaws')) {
    const turn = game.world.turn;
    for (const n of game.world.nations) {
      if (!n.alive || !n.politics) continue;
      const atWar = (n.economy?.warFronts ?? 0) > 0;
      if (atWar) {
        warlaws.natWarWeeks++;
        if (lawIndex(n, 'conscription') >= 2) warlaws.ext++;
        if (lawIndex(n, 'conscription') === 3) warlaws.tm++;
        if (lawIndex(n, 'economy') === 3) warlaws.twe++;
        if (!warlaws.open.has(n.id)) warlaws.open.set(n.id, turn);
      } else if (warlaws.open.has(n.id)) {
        warlaws.spells.push(turn - warlaws.open.get(n.id));
        warlaws.open.delete(n.id);
      }
    }
  }
  if (measure.has('peoples')) {
    const claims = drainClaims();
    game.world.provinces.forEach((p, idx) => {
      if (peoples.owner[idx] === nation.id && p.owner !== nation.id && !claims.has(p.id)) peoples.lost++;
    });
    peoples.owner = game.world.provinces.map((p) => p.owner);
  }
  if (spec.watchInvariants) violations.push(...scanInvariants(game.world));
  if (spec.trace && (i + 1) % spec.trace === 0) {
    trace.push({ week: game.world.turn, ...snapshotNation(game.world, nation) });
  }
}

const world = game.world;
const out = {
  seed: spec.seed,
  label: spec.label ?? '',
  nationId: nation.id,
  turn: world.turn,
  snap: snapshotNation(world, nation),
};
if (measure.has('warlaws')) {
  const lengths = [...warlaws.spells, ...[...warlaws.open.values()].map((start) => world.turn - start)].sort((a, b) => a - b);
  out.warlaws = {
    natWarWeeks: warlaws.natWarWeeks,
    extensiveAtWar: warlaws.natWarWeeks ? warlaws.ext / warlaws.natWarWeeks : 0,
    tmShare: warlaws.natWarWeeks ? warlaws.tm / warlaws.natWarWeeks : 0,
    tweShare: warlaws.natWarWeeks ? warlaws.twe / warlaws.natWarWeeks : 0,
    spells: lengths.length,
    lengthP50: lengths.length ? lengths[Math.floor((lengths.length - 1) / 2)] : 0,
  };
}
if (measure.has('support')) out.support = { ...(nation.politics?.support ?? {}) };
if (measure.has('peoples')) {
  let pop = 0;
  let foreign = 0;
  for (const p of world.provinces) {
    if (p.owner !== nation.id || !p.econ) continue;
    pop += p.econ.population;
    foreign += culture.foreignShareOf(p, nation) * p.econ.population;
  }
  out.peoples = { lost: peoples.lost, subjectShare: pop ? foreign / pop : 0, world: standingShares(world) };
}
if (measure.has('invasion')) {
  const capital = nation.capital;
  const held = !capital || capital.owner !== nation.id || (capital.controller ?? capital.owner) === nation.id;
  out.invasion = {
    occupiedShare: invasionAcc.warWeeks ? invasionAcc.occupied / invasionAcc.warWeeks : 0,
    capitalHeld: held ? 1 : 0,
    atWar: (nation.economy?.warFronts ?? 0) > 0 ? 1 : 0,
    warWeeks: invasionAcc.warWeeks,
    alive: nation.alive ? 1 : 0,
  };
}

if (spec.measure?.includes('market')) out.market = marketSnapshot(world);
if (spec.measure?.includes('trace')) out.trace = trace;
if (spec.measure?.includes('invariants')) {
  const seen = new Set();
  out.violations = violations.filter((v) => {
    const k = `${v.system}|${v.nationId}|${v.field}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 40);
}
if (spec.measure?.includes('war')) {
  const foes = world.nations.filter((n) => n.alive && n.id !== nation.id
    && world.relations[nation.id]?.[n.id]?.state === 'war');
  let occupiedByUs = 0;
  let occupiedFromUs = 0;
  world.forEach((t) => {
    if (!t.terrain.passable || t.owner < 0) return;
    const controller = t.controller ?? t.owner;
    if (controller === nation.id && t.owner !== nation.id) occupiedByUs++;
    if (t.owner === nation.id && controller !== nation.id) occupiedFromUs++;
  });
  out.war = {
    foes: foes.map((f) => f.id),
    battles: (world.battleSystem?.battles ?? []).filter(
      (b) => b.attackerNation === nation.id || b.defenderNation === nation.id,
    ).length,
    occupiedByUs,
    occupiedFromUs,
    tiles: nation.tiles,
  };
}
if (spec.measure?.includes('army')) {
  const units = world.units.filter((u) => u.nationId === nation.id && u.type.domain === 'land');
  out.army = {
    power: units.reduce((s, u) => s + battleUnitPower(world, u, false, 0), 0),
    defensePower: units.reduce((s, u) => s + battleUnitPower(world, u, true, 0), 0),
    organization: units.flatMap((u) => u.regiments ?? [])
      .reduce((s, r, _, a) => s + (r.organization ?? 0) / a.length, 0),
    strengthRatio: units.length
      ? units.flatMap((u) => u.regiments ?? []).reduce((s, r, _, a) => s + r.strength / r.maxStrength / a.length, 0)
      : 0,
    need: reinforcementNeed(world, nation),
    manpower: nationManpower(world, nation.id),
    units: units.length,
  };
}
if (spec.measure?.includes('nations')) {
  out.nations = world.nations.filter((n) => n.alive && n.economy)
    .map((n) => snapshotNation(world, n));
}
if (spec.measure?.includes('control')) {
  let sum = 0;
  let count = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id && province.econ) { sum += province.econ.control; count++; }
  }
  out.control = count ? sum / count : 0;
}
if (spec.measure?.includes('unrest')) {
  let weighted = 0;
  let people = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    weighted += (province.econ.unrest ?? 0) * province.econ.population;
    people += province.econ.population;
  }
  out.unrest = people ? weighted / people : 0;
}

process.stdout.write(JSON.stringify(out));
