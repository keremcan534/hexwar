// SAVAŞ DESTEĞİ DENETİMİ — irade, yorgunluk, savaş yasaları ve levée.
//
// redesign §5 (2026-10-15), u5-ws-probe sondasından. Kerem'in şikâyeti
// "savaşıyoruz, o yüzden silahsızlanıyoruz": ölçüldü (u5, STAT1|STAT2) —
// saldıranın savaş desteği 104. haftada .40/.43, Extensive savaş içinde
// 31|34 kez ZORLA düşüyor, Total Mobilisation ve Total War Economy ~39 bin
// ulus-savaş-haftasının hiçbirinde yok. Bu denetim o tabanı aynı tanımla basar
// ki D5 (irade + yorgunluk) ve D6 (Call to Arms) aynı cetvelle ölçülsün.
//
// Ölçülenler (kampanya boyu, 160×96, edilgen AUTO oyuncu — u5 ile aynı kurulum):
//   * savaş haftasına göre irade (warSupport) ve yorgunluk (politics.exhaustion,
//     D5 yoksa SKIP), saldıran / savunan ayrı
//   * savaşta ve barışta ortalama irade, 5 yıllık kova
//   * savaşta zorla yasa düşüşü (kilit değişmeden inen kademe); yasa payları
//   * 3. kademe (Total Mobilisation / Total War Economy) kullanımı totalWarState
//     içinde ve dışında (politics.totalWarState yoksa denetimin kendi tanımı:
//     savaşta VE (işgal ≥ %5 YA DA 52 savaş haftası YA DA kriz savaşı))
//   * barış imzasında yorgunluk: kaybeden, kazanan, dünya savaşı katılımcısı
//   * savaş süresi p50/p90 (ulus savaş dönemi), dönem sayısı, devrim (kart),
//     teslim (yorgunluk ≥ 0.85 ile kaybedilen barış; D5 yoksa SKIP),
//     donmuş savaşın beyaz barışı (≥ 104 hafta)
//   * P0'ın EK verisi: saldıranın savaş dengesi (warScore en iyi/en kötü)
//     52. haftada; işgal payının savaş haftasına göre dağılımı; dünya barış
//     istikrarı
//   * levée bölümü (D6 yoksa SKIP) ve `--arm leveeOff` (LEVEE.enabled=false)
//
//   node scripts/audit/war-support-audit.mjs [--seeds STAT1,STAT2,STAT3] [--weeks N]
//        [--arm base|leveeOff] [--json dosya]

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  headless, passivePlayer, section, sub, table, n2, pct, finding, reportFindings,
  runWorkers, skip, requireEvents, mean, quantile,
} from './harness.mjs';
import * as politics from '../../src/game/politics.js';
import * as mobilization from '../../src/game/mobilization.js';
import { CAMPAIGN_TURNS, calendarYear, exactYearOfTurn } from '../../src/game/calendar.js';
import { lawIndex } from '../../src/game/laws.js';
import { PEACE_TERMS, warScore } from '../../src/game/peace.js';
import { installClaimTracker, drainClaims, isRebel } from './peoples-observer.mjs';

const SELF = fileURLToPath(import.meta.url);
// Antlaşma bırakan barış şartları (LIBERATE antlaşma bırakmaz, küme devriyle görünür).
const PEACE_TERMS_IDS = Object.keys(PEACE_TERMS).filter((id) => id !== 'LIBERATE');
const OFFSETS = [0, 4, 13, 26, 52, 78, 104, 156, 208, 312];
const FROZEN_WAR_WEEKS = 104;
const part = (nation, label) => (nation.politics?.warSupportParts ?? []).find((p) => p.label === label)?.value ?? 0;
const HAS_EXHAUSTION = (world) => world.nations.some((n) => typeof n.politics?.exhaustion === 'number');
const HAS_LEVEE = Boolean(mobilization.LEVEE);

/** Toplam savaş hâli: D5'in totalWarState'i varsa o, yoksa aynı tanım burada. */
function totalWarState(world, nation) {
  if (typeof politics.totalWarState === 'function') return politics.totalWarState(world, nation);
  if (!((nation.economy?.warFronts ?? 0) > 0)) return false;
  if ((nation.economy?.occupiedShare ?? 0) >= 0.05) return true;
  if ((nation.politics?.warWeeks ?? 0) >= 52) return true;
  for (const other of world.nations) {
    const rec = world.relations?.[nation.id]?.[other.id];
    if (rec?.state === 'war' && rec.reason === 'crisis') return true;
  }
  return false;
}

function foesOf(world, nation) {
  const out = [];
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id) continue;
    if (world.relations?.[nation.id]?.[other.id]?.state === 'war') out.push(other);
  }
  return out;
}

function posture(world, nation) {
  let offensive = false;
  let defensive = false;
  let fronts = 0;
  for (const other of foesOf(world, nation)) {
    fronts++;
    if (world.relations[nation.id][other.id].aggressor === nation.id) offensive = true;
    else defensive = true;
  }
  return { offensive, defensive, fronts };
}

function capitalHeld(nation) {
  const capital = nation.capital;
  if (!capital || capital.owner !== nation.id) return true;
  return (capital.controller ?? capital.owner) === nation.id;
}

function campaignWorker(seed, weeks, arm) {
  const t0 = Date.now();
  if (arm === 'leveeOff') mobilization.LEVEE.enabled = false;
  installClaimTracker();
  const game = headless(seed, { cols: 160, rows: 96 });
  const world = game.world;
  const afterWeek = passivePlayer(game);
  const player = afterWeek.player;
  drainClaims();
  const hasExh = () => HAS_EXHAUSTION(world);

  const spells = [];
  const open = new Map();
  const prev = new Map();
  const lawWeeks = { all: {}, firstYear: {}, later: {}, attacker: {}, defender: {} };
  const tier3 = { inside: { weeks: 0, c3: 0, e3: 0 }, outside: { weeks: 0, c3: 0, e3: 0 } };
  const changes = [];
  const yearly = {};
  const bins = {};
  let natWarWeeks = 0;
  let revolutions = 0;
  const revolutionYears = [];
  const lastRevolution = new Map(world.nations.map((n) => [n.id, n.cards?.last?.revolution ?? null]));
  const pairs = new Map(); // `${a}:${b}` → { since, reason, aggressor }
  const peaces = [];
  const ww = { great_war: null, second_great_war: null };
  const wwMembers = { great_war: new Set(), second_great_war: new Set() };
  const levee = { episodes: [], eligibleWeeks: 0, eligibleSpells: new Set(), prevActive: new Map() };
  const bump = (obj, key) => { obj[key] = (obj[key] ?? 0) + 1; };

  for (let week = 1; week <= weeks; week++) {
    game.turns.endTurn();
    afterWeek();
    const turn = world.turn;
    const year = calendarYear(turn);
    const claims = drainClaims();
    const regs = new Map();
    const militia = new Map();
    for (const unit of world.units) {
      if (unit.type?.domain !== 'land') continue;
      const n = unit.regiments?.length ?? 1;
      regs.set(unit.nationId, (regs.get(unit.nationId) ?? 0) + n);
      const m = (unit.regiments ?? []).filter((r) => r.militia).length;
      if (m) militia.set(unit.nationId, (militia.get(unit.nationId) ?? 0) + m);
    }

    // --- savaş çiftleri: başlangıç ve barış ---
    const N = world.nations.length;
    const adjacency = new Map();
    const atWarNow = new Set();
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        const rec = world.relations[a]?.[b];
        const key = `${a}:${b}`;
        const war = rec?.state === 'war' && world.nations[a].alive && world.nations[b].alive;
        if (war) {
          atWarNow.add(a); atWarNow.add(b);
          (adjacency.get(a) ?? adjacency.set(a, []).get(a)).push(b);
          (adjacency.get(b) ?? adjacency.set(b, []).get(b)).push(a);
          if (!pairs.has(key)) pairs.set(key, { since: turn, reason: rec.reason ?? null, aggressor: rec.aggressor ?? a });
          continue;
        }
        const was = pairs.get(key);
        if (!was) continue;
        pairs.delete(key);
        const length = turn - was.since;
        if (!world.nations[a].alive || !world.nations[b].alive) {
          peaces.push({ turn, year, a, b, length, eliminated: true });
          continue;
        }
        // Kim ne aldı: bu hafta barış masasından el değiştiren küme ve yeni şartlar.
        let gainA = 0;
        let gainB = 0;
        let liberated = 0;
        for (const claim of claims.values()) {
          if (claim.cause === 'peace' && claim.from === b && claim.to === a) gainA++;
          if (claim.cause === 'peace' && claim.from === a && claim.to === b) gainB++;
          if (claim.cause === 'liberate' && (claim.from === a || claim.from === b)) liberated++;
        }
        const terms = (loser, winner) => (world.nations[loser].treaties ?? [])
          .filter((t) => t.partner === winner && PEACE_TERMS_IDS.includes(t.type) && (t.since ?? -1) >= turn - 1).length;
        gainA += terms(b, a);
        gainB += terms(a, b);
        const white = gainA === 0 && gainB === 0 && liberated === 0;
        const exhA = world.nations[a].politics?.exhaustion;
        const exhB = world.nations[b].politics?.exhaustion;
        const loser = gainA > gainB ? b : gainB > gainA ? a : null;
        peaces.push({
          turn, year, a, b, length, reason: was.reason, white, gainA, gainB, liberated,
          frozen: white && length >= FROZEN_WAR_WEEKS,
          loser, exhA: typeof exhA === 'number' ? exhA : null, exhB: typeof exhB === 'number' ? exhB : null,
          spark: [a, b].some((id) => wwMembers.great_war.has(id) || wwMembers.second_great_war.has(id)),
        });
      }
    }
    // Dünya savaşı ağı: kıvılcımın kriz çiftlerinden savaş grafında BFS (u2 ile aynı).
    for (const id of ['great_war', 'second_great_war']) {
      const e = world.worldEvents?.[id];
      if (!e || turn < e.start || turn >= e.until) continue;
      if (!ww[id]) {
        const sparks = [...pairs.entries()].filter(([, v]) => v.reason === 'crisis' && v.since >= e.start && v.since <= e.start + 12);
        if (sparks.length) ww[id] = sparks.map(([k]) => k.split(':').map(Number));
      }
      if (!ww[id]) continue;
      const queue = ww[id].flat().filter((x) => atWarNow.has(x));
      const seen = new Set(queue);
      while (queue.length) {
        const x = queue.shift();
        wwMembers[id].add(x);
        for (const y of adjacency.get(x) ?? []) if (!seen.has(y)) { seen.add(y); queue.push(y); }
      }
    }

    for (const nation of world.nations) {
      // Devrim kartı (eventCards.revolution): son ateşleme haftası değiştiyse.
      const last = nation.cards?.last?.revolution ?? null;
      if (last != null && last !== lastRevolution.get(nation.id)) { revolutions++; revolutionYears.push(year); }
      lastRevolution.set(nation.id, last);
      if (!nation.alive || !nation.politics) {
        if (open.has(nation.id)) { const s = open.get(nation.id); s.end = turn; s.died = true; open.delete(nation.id); spells.push(s); }
        continue;
      }
      const atWar = (nation.economy?.warFronts ?? 0) > 0;
      const ws = nation.warSupport ?? 0;
      const before = prev.get(nation.id);
      const consc = lawIndex(nation, 'conscription');
      const econ = lawIndex(nation, 'economy');
      const r = regs.get(nation.id) ?? 0;
      const y = (yearly[year] ??= { warWs: 0, warN: 0, peaceWs: 0, peaceN: 0 });
      const binKey = Math.floor((year - 1900) / 5) * 5 + 1900;
      const bin = (bins[binKey] ??= { warWs: 0, warN: 0, peaceWs: 0, peaceN: 0, peaceStab: 0, peaceStabN: 0 });
      if (atWar) { y.warWs += ws; y.warN++; bin.warWs += ws; bin.warN++; } else {
        y.peaceWs += ws; y.peaceN++; bin.peaceWs += ws; bin.peaceN++;
        if (!isRebel(nation)) { bin.peaceStab += nation.stability ?? 0; bin.peaceStabN++; }
      }

      let spell = open.get(nation.id);
      if (atWar && !spell) {
        const p = posture(world, nation);
        spell = {
          nation: nation.id, name: nation.name, player: nation.id === player.id, start: turn,
          startYear: +exactYearOfTurn(turn).toFixed(2), end: null, attacker: p.offensive, defender: p.defensive,
          pre: before ? { ws: before.ws, consc: before.laws.conscription, econ: before.laws.economy } : null,
          samples: {}, minWs: ws, lawDrops: 0, lawRaises: 0, enforced: 0, eligible: false, called: null,
        };
        open.set(nation.id, spell);
      } else if (!atWar && spell) {
        spell.end = turn; spell.endWs = ws; open.delete(nation.id); spells.push(spell); spell = null;
      }
      if (spell) {
        const w = turn - spell.start;
        spell.minWs = Math.min(spell.minWs, ws);
        spell.len = w + 1;
        if (OFFSETS.includes(w)) {
          const p = posture(world, nation);
          const scores = foesOf(world, nation).map((foe) => warScore(world, nation.id, foe.id));
          const exh = nation.politics.exhaustion;
          spell.samples[w] = {
            ws: +ws.toFixed(3), target: +(nation.politics.warSupportTarget ?? 0).toFixed(3),
            cas: +part(nation, 'Casualties').toFixed(3), wear: +part(nation, 'War weariness').toFixed(3),
            def: +part(nation, 'Defending the homeland').toFixed(3), mods: +part(nation, 'Government, advisors, events').toFixed(3),
            consc, econ, att: p.offensive, dfd: p.defensive, fronts: p.fronts, stab: +(nation.stability ?? 0).toFixed(3), regs: r,
            occ: +(nation.economy?.occupiedShare ?? 0).toFixed(4),
            best: scores.length ? Math.max(...scores) : null, worst: scores.length ? Math.min(...scores) : null,
            balance: nation.politics.warBalance ? { ...nation.politics.warBalance } : null,
            exh: typeof exh === 'number' ? +exh.toFixed(4) : null,
            capital: capitalHeld(nation),
          };
        }
        natWarWeeks++;
        const phase = w < 52 ? 'firstYear' : 'later';
        for (const key of ['all', phase, spell.attacker ? 'attacker' : 'defender']) {
          bump(lawWeeks[key], `c${consc}`); bump(lawWeeks[key], `e${econ}`);
        }
        const tws = totalWarState(world, nation) ? tier3.inside : tier3.outside;
        tws.weeks++;
        if (consc === 3) tws.c3++;
        if (econ === 3) tws.e3++;
        // Levée uygunluğu (D6): kapı açık hafta ve bu dönemde çağrı.
        if (HAS_LEVEE && typeof mobilization.leveeBlockers === 'function'
          && !mobilization.leveeBlockers(world, nation).length) {
          levee.eligibleWeeks++;
          spell.eligible = true;
        }
      }
      if (HAS_LEVEE) {
        const active = Boolean(nation.mobilization?.levee?.active);
        if (active && !levee.prevActive.get(nation.id)) {
          levee.episodes.push({
            nation: nation.id, turn, year, inWar: Boolean(spell), spellStart: spell?.start ?? null,
            occ: nation.economy?.occupiedShare ?? 0, capital: capitalHeld(nation),
            target: nation.mobilization.levee.target ?? null, pop: nation.economy?.population ?? 0,
            standing0: (regs.get(nation.id) ?? 0) - (militia.get(nation.id) ?? 0),
          });
          if (spell) spell.called = turn;
        }
        levee.prevActive.set(nation.id, active);
        for (const episode of levee.episodes) {
          if (episode.nation !== nation.id) continue;
          const age = turn - episode.turn;
          if (age === 8) {
            let soldiers = 0;
            for (const p of world.provinces) if (p.owner === nation.id) soldiers += p.econ?.soldiers ?? 0;
            episode.underArms8 = soldiers / Math.max(1, nation.economy?.population ?? 1);
            episode.militia8 = militia.get(nation.id) ?? 0;
            episode.standing8 = (regs.get(nation.id) ?? 0) - episode.militia8;
            episode.raised = nation.mobilization?.levee?.raised ?? null;
          }
          if (age === 26) episode.occ26 = nation.economy?.occupiedShare ?? 0;
        }
      }

      if (before) {
        for (const id of ['conscription', 'economy']) {
          const was = before.laws[id];
          const now = lawIndex(nation, id);
          if (was === now) continue;
          const chosen = (nation.politics.lawLocks?.[id] ?? 0) !== (before.locks[id] ?? 0);
          changes.push({ turn, nation: nation.id, law: id, from: was, to: now, atWar, chosen, ws: +ws.toFixed(3), warWeek: spell ? turn - spell.start : null, attacker: spell?.attacker ?? null });
          if (spell) {
            if (now < was) { spell.lawDrops++; if (!chosen) spell.enforced++; } else spell.lawRaises++;
          }
        }
      }
      prev.set(nation.id, {
        ws, laws: { conscription: consc, economy: econ },
        locks: { conscription: nation.politics.lawLocks?.conscription ?? 0, economy: nation.politics.lawLocks?.economy ?? 0 },
      });
    }
    if (week % 260 === 0) process.stderr.write(`[war ${seed} ${arm}] hafta ${week}/${weeks} ${Math.round((Date.now() - t0) / 1000)} s\n`);
  }
  for (const spell of open.values()) { spell.openAtEnd = true; spells.push(spell); }
  for (const episode of levee.episodes) {
    const spell = spells.find((s) => s.nation === episode.nation && s.start === episode.spellStart);
    episode.warAfter = spell ? (spell.end ?? world.turn) - episode.turn : null;
  }
  return {
    seed, weeks, arm, secs: Math.round((Date.now() - t0) / 1000), player: player.id, playerName: player.name,
    hasExhaustion: hasExh(), aliveEnd: world.nations.filter((n) => n.alive).length,
    spells, lawWeeks, tier3, changes, natWarWeeks, yearly, bins, revolutions, revolutionYears, peaces,
    worldWar: Object.fromEntries(Object.entries(wwMembers).map(([k, v]) => [k, [...v]])),
    worldEvents: Object.fromEntries(Object.entries(world.worldEvents ?? {}).map(([k, v]) => [k, { start: v.start, until: v.until }])),
    levee: HAS_LEVEE ? { episodes: levee.episodes, eligibleWeeks: levee.eligibleWeeks, eligibleSpells: spells.filter((s) => s.eligible).length, calledSpells: spells.filter((s) => s.called != null).length } : null,
  };
}

if (process.argv[2] === '--worker') {
  const [, seed, weeks, arm] = process.argv.slice(2);
  process.stdout.write(JSON.stringify(campaignWorker(seed, Number(weeks), arm)));
  process.exit(0);
}

// --------------------------------------------------------------- ANA AKIŞ ---

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : fallback;
};
const SEEDS = opt('--seeds', 'STAT1,STAT2,STAT3').split(',');
const WEEKS = Number(opt('--weeks', CAMPAIGN_TURNS));
const ARM = opt('--arm', 'base');
const JSON_OUT = opt('--json', null);
const pc = (v) => (Number.isFinite(v) ? pct(v) : '-');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '-');

section(`SAVAS DESTEGI DENETIMI — ${SEEDS.join(',')} 160x96 · ${WEEKS} hafta · kol ${ARM}`
  + ` · levée ${HAS_LEVEE ? 'var' : 'yok'}`);

if (ARM === 'leveeOff' && !HAS_LEVEE) {
  skip('leveeOff kolu', 'mobilization.LEVEE yok (D6, P6)');
  process.exit(reportFindings() > 0 ? 1 : 0);
}

const runs = await runWorkers(SELF, SEEDS.map((seed) => ['--worker', seed, WEEKS, ARM]));
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(runs));
const hasExh = runs.some((r) => r.hasExhaustion);

const groupsOf = (run) => {
  const spells = run.spells.filter((s) => (s.len ?? 0) >= 1);
  return {
    all: spells,
    attacker: spells.filter((s) => s.attacker && !s.defender),
    defender: spells.filter((s) => s.defender && !s.attacker),
  };
};

sub('Savas donemleri (ulus basina; u5 tanimi: economy.warFronts > 0)');
// u5 sondasi elenen ulusun acik donemini listeye hic eklemiyordu: taban
// sayilari (241 | 275, p50 60 | 73) elenenler HARIC tanimdir; ikisi de basilir.
const survived = (r) => r.spells.filter((s) => !s.died);
console.log(table(runs, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'donem (elenen haric)', get: (r) => `${r.spells.length} (${survived(r).length})` },
  { label: 'saldiran/savunan', get: (r) => { const g = groupsOf(r); return `${g.attacker.length}/${g.defender.length}`; } },
  { label: 'uzunluk p50 (elenen haric)', get: (r) => `${quantile(r.spells.map((s) => s.len), 0.5)} (${quantile(survived(r).map((s) => s.len), 0.5)})` },
  { label: 'p90', get: (r) => `${quantile(r.spells.map((s) => s.len), 0.9)} (${quantile(survived(r).map((s) => s.len), 0.9)})` },
  { label: 'ulus-savas-haftasi', get: (r) => r.natWarWeeks },
  { label: 'devrim', get: (r) => `${r.revolutions} (${[...new Set(r.revolutionYears)].join(',') || '-'})` },
  { label: 'oyuncu', get: (r) => r.playerName, right: false },
  { label: 'sn', get: (r) => r.secs },
]));
requireEvents('savas donemi', runs.reduce((s, r) => s + r.spells.length, 0), 'savas donemi');

sub('Savas haftasina gore irade (warSupport): ortalama / p50, saldiran | savunan');
{
  const rows = OFFSETS.map((k) => {
    const out = { k };
    for (const side of ['attacker', 'defender']) {
      out[side] = runs.map((r) => {
        const xs = groupsOf(r)[side].map((s) => s.samples[k]?.ws).filter(Number.isFinite);
        return xs.length ? `${f2(mean(xs))}/${f2(quantile(xs, 0.5))}(${xs.length})` : '-';
      }).join(' ');
    }
    out.exh = runs.map((r) => {
      const xs = groupsOf(r).all.map((s) => s.samples[k]?.exh).filter(Number.isFinite);
      return xs.length ? f2(quantile(xs, 0.5)) : '-';
    }).join('/');
    return out;
  });
  const pre = (side) => runs.map((r) => f2(mean(groupsOf(r)[side].filter((s) => s.pre).map((s) => s.pre.ws)))).join(' ');
  console.log(`  savas oncesi: saldiran ${pre('attacker')} · savunan ${pre('defender')}`);
  console.log(table(rows, [
    { label: 'hafta', get: (r) => `w${r.k}` },
    { label: `saldiran ort/p50(n) ${SEEDS.join(' ')}`, get: (r) => r.attacker, right: false },
    { label: 'savunan', get: (r) => r.defender, right: false },
    { label: 'yorgunluk p50', get: (r) => r.exh },
  ]));
  console.log(`  taban (u5): saldiran w104 ortalama .40 | .43 (STAT1 | STAT2); savunan w52 .72 | .77`);
  if (!hasExh) skip('yorgunluk yorungesi', 'politics.exhaustion yok (D5, P5)');
}

sub('Savasta ve barista ortalama irade (5 yillik kova)');
{
  const keys = [...new Set(runs.flatMap((r) => Object.keys(r.bins)))].sort();
  console.log(table(keys.map((key) => ({ key })), [
    { label: 'kova', get: (r) => r.key, right: false },
    { label: 'savasta', get: (r) => runs.map((x) => { const b = x.bins[r.key]; return b?.warN ? f2(b.warWs / b.warN) : '-'; }).join('/') },
    { label: 'barista', get: (r) => runs.map((x) => { const b = x.bins[r.key]; return b?.peaceN ? f2(b.peaceWs / b.peaceN) : '-'; }).join('/') },
    { label: 'barista istikrar (duzenli uluslar)', get: (r) => runs.map((x) => { const b = x.bins[r.key]; return b?.peaceStabN ? f2(b.peaceStab / b.peaceStabN) : '-'; }).join('/') },
  ]));
  const peaceStab = runs.map((r) => {
    const list = Object.values(r.bins);
    return list.reduce((s, b) => s + b.peaceStab, 0) / Math.max(1, list.reduce((s, b) => s + b.peaceStabN, 0));
  });
  console.log(`  dunya baris istikrari (kampanya, ulus-hafta agirlikli) ${peaceStab.map(f2).join('/')}`);
}

sub('Yasalar: savasta zorla dusus ve kademe paylari');
{
  console.log(table(runs, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'zorla Extensive→Limited (savasta)', get: (r) => {
      const forced = r.changes.filter((c) => c.atWar && c.law === 'conscription' && c.to < c.from && !c.chosen);
      return `${forced.length} (saldiran ${forced.filter((c) => c.attacker).length}) hafta p50 ${quantile(forced.map((c) => c.warWeek), 0.5)}`;
    }, right: false },
    { label: 'zorla ekonomi dususu', get: (r) => r.changes.filter((c) => c.atWar && c.law === 'economy' && c.to < c.from && !c.chosen).length },
    { label: 'secilen dusus (savasta)', get: (r) => r.changes.filter((c) => c.atWar && c.to < c.from && c.chosen).length },
    { label: 'askerlik V/L/E/T savas haftasi', get: (r) => { const c = r.lawWeeks.all; const t = ['c0', 'c1', 'c2', 'c3'].reduce((s, k) => s + (c[k] ?? 0), 0) || 1; return ['c0', 'c1', 'c2', 'c3'].map((k) => pc((c[k] ?? 0) / t)).join('/'); }, right: false },
    { label: 'ekonomi C/P/W/T', get: (r) => { const c = r.lawWeeks.all; const t = ['e0', 'e1', 'e2', 'e3'].reduce((s, k) => s + (c[k] ?? 0), 0) || 1; return ['e0', 'e1', 'e2', 'e3'].map((k) => pc((c[k] ?? 0) / t)).join('/'); }, right: false },
    { label: 'saldiran Extensive', get: (r) => { const c = r.lawWeeks.attacker; const t = ['c0', 'c1', 'c2', 'c3'].reduce((s, k) => s + (c[k] ?? 0), 0) || 1; return pc(((c.c2 ?? 0) + (c.c3 ?? 0)) / t); } },
  ]));
  console.log('  taban (u5): zorla 31 | 34 · Extensive payi %58.7 | %68.0 · Total %0');
  const rows = runs.map((r) => ({ seed: r.seed, ...r.tier3 }));
  console.log(table(rows, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'toplam savas haftasi', get: (r) => r.inside.weeks },
    { label: 'TM/TWE icinde', get: (r) => `${pc(r.inside.c3 / Math.max(1, r.inside.weeks))}/${pc(r.inside.e3 / Math.max(1, r.inside.weeks))}` },
    { label: 'disinda haftasi', get: (r) => r.outside.weeks },
    { label: 'TM/TWE disinda', get: (r) => `${pc(r.outside.c3 / Math.max(1, r.outside.weeks))}/${pc(r.outside.e3 / Math.max(1, r.outside.weeks))}` },
  ]));
  console.log(`  toplam savas hali tanimi: ${typeof politics.totalWarState === 'function' ? 'politics.totalWarState' : 'denetimin kendi tanimi (D5 yok)'}`);
}

sub('EK (P0): saldiranin savas dengesi ve isgal payi, savas haftasina gore');
{
  const rows = OFFSETS.filter((k) => k <= 208).map((k) => ({ k }));
  const stat = (side, k, get) => runs.map((r) => {
    const xs = groupsOf(r)[side].map((s) => s.samples[k]).filter(Boolean).map(get).filter(Number.isFinite);
    return xs.length ? f2(quantile(xs, 0.5)) : '-';
  }).join('/');
  const share = (side, k, lo) => runs.map((r) => {
    const xs = groupsOf(r)[side].map((s) => s.samples[k]?.occ).filter(Number.isFinite);
    return xs.length ? pc(xs.filter((x) => x >= lo).length / xs.length) : '-';
  }).join('/');
  console.log(table(rows, [
    { label: 'hafta', get: (r) => `w${r.k}` },
    { label: 'saldiran en iyi skor p50', get: (r) => stat('attacker', r.k, (x) => x.best) },
    { label: 'saldiran en kotu p50', get: (r) => stat('attacker', r.k, (x) => x.worst) },
    { label: 'savunan en iyi p50', get: (r) => stat('defender', r.k, (x) => x.best) },
    { label: 'isgal p50 sal/sav', get: (r) => `${stat('attacker', r.k, (x) => x.occ)} | ${stat('defender', r.k, (x) => x.occ)}`, right: false },
    { label: 'isgal p90 sav', get: (r) => runs.map((x) => f2(quantile(groupsOf(x).defender.map((s) => s.samples[r.k]?.occ).filter(Number.isFinite), 0.9))).join('/') },
    { label: 'sav >=%5/%10/%25', get: (r) => `${share('defender', r.k, 0.05)} ${share('defender', r.k, 0.10)} ${share('defender', r.k, 0.25)}`, right: false },
    { label: 'baskent dusmus sav', get: (r) => runs.map((x) => { const xs = groupsOf(x).defender.map((s) => s.samples[r.k]).filter(Boolean); return xs.length ? pc(xs.filter((s) => !s.capital).length / xs.length) : '-'; }).join('/') },
  ]));
  const best52 = runs.map((r) => quantile(groupsOf(r).attacker.map((s) => s.samples[52]?.best).filter(Number.isFinite), 0.5));
  console.log(`  saldiranin 52. haftadaki en iyi savas skoru p50 ${best52.map(f2).join('/')} — D5 "Zaferler" terimi yalniz >= 10 ise eklenir`);
}

sub('Baris imzalari');
{
  console.log(table(runs, [
    { label: 'tohum', get: (r) => r.seed, right: false },
    { label: 'baris', get: (r) => r.peaces.filter((p) => !p.eliminated).length },
    { label: 'beyaz', get: (r) => r.peaces.filter((p) => p.white).length },
    { label: 'donmus savas beyaz (>=104 hf)', get: (r) => r.peaces.filter((p) => p.frozen).length },
    { label: 'dayatilan', get: (r) => r.peaces.filter((p) => !p.eliminated && !p.white).length },
    { label: 'LIBERATE iceren', get: (r) => r.peaces.filter((p) => p.liberated > 0).length },
    { label: 'eleme', get: (r) => r.peaces.filter((p) => p.eliminated).length },
    { label: 'cift savas suresi p50/p90', get: (r) => { const l = r.peaces.map((p) => p.length); return `${quantile(l, 0.5)}/${quantile(l, 0.9)}`; } },
  ]));
  if (!hasExh) {
    skip('baris imzasinda yorgunluk', 'politics.exhaustion yok (D5, P5)');
    skip('teslim (yorgunluk >= 0.85)', 'politics.exhaustion yok (D5, P5)');
  } else {
    const loserExh = [];
    const winnerExh = [];
    const sparkExh = [];
    let capitulations = 0;
    for (const r of runs) {
      for (const p of r.peaces) {
        if (p.eliminated) continue;
        const exhOf = (id) => (id === p.a ? p.exhA : p.exhB);
        if (p.loser != null) {
          loserExh.push(exhOf(p.loser));
          winnerExh.push(exhOf(p.loser === p.a ? p.b : p.a));
          if ((exhOf(p.loser) ?? 0) >= 0.85) capitulations++;
        }
        if (p.spark) sparkExh.push(p.exhA, p.exhB);
      }
    }
    console.log(`  barista yorgunluk p50: kaybeden ${f2(quantile(loserExh, 0.5))} · kazanan ${f2(quantile(winnerExh, 0.5))}`
      + ` · dunya savasi katilimcisi ${f2(quantile(sparkExh, 0.5))} · teslim ${capitulations}`);
  }
}

sub('Levée (Call to Arms, D6)');
if (!HAS_LEVEE) {
  skip('levée bolumu', 'mobilization.LEVEE yok (D6, P6)');
} else {
  const episodes = runs.flatMap((r) => r.levee.episodes.map((e) => ({ seed: r.seed, ...e })));
  const eligible = runs.reduce((s, r) => s + r.levee.eligibleSpells, 0);
  const called = runs.reduce((s, r) => s + r.levee.calledSpells, 0);
  console.log(`  cagri ${episodes.length} · uygun donem ${eligible} · cagrilan donem ${called} (${pc(called / Math.max(1, eligible))})`
    + ` · isgalsiz cagri ${episodes.filter((e) => e.occ < 0.10 && e.capital).length}`);
  console.log(`  +8 hafta silah altinda p50 ${pc(quantile(episodes.map((e) => e.underArms8), 0.5))}`
    + ` · milis/duzenli p50 ${f2(quantile(episodes.map((e) => (e.standing8 > 0 ? e.militia8 / e.standing8 : NaN)), 0.5))}`
    + ` · cagri sonrasi savas p50 ${quantile(episodes.map((e) => e.warAfter), 0.5)} hf`
    + ` · +26 hafta isgal p50 ${pc(quantile(episodes.map((e) => e.occ26), 0.5))}`);
  requireEvents('levée', episodes.length, 'Call to Arms cagrisi');
}

process.exit(reportFindings() > 0 ? 1 : 0);
