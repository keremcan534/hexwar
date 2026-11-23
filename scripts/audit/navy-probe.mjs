// DONANMA SONDASI — YZ donanmasını ne kadar ve nasıl kullanıyor?
//
// Kerem (2026-11-23): "gemi kısmı galiba full rework yiyecek". Rework'ten önce
// ve sonra aynı sayılar: dünya filosu, denizde/limanda gemi-haftası, tutulan
// deniz sayısı, muharebe, kaçınma, batan, abluka, denizaltı, kol başına gemi
// ve bir geminin denizini ne sıklıkla değiştirdiği (filo "kıpırdıyor mu").
// Yalnız okur: zar çekmez, dünyaya yazmaz.
//
//   node scripts/audit/navy-probe.mjs [yıl] [tohum,tohum] [big]

import { headless } from './harness.mjs';
import { atWar } from '../../src/game/diplomacy.js';

const YEARS = Number(process.argv[2] ?? 20);
const SEEDS = (process.argv[3] ?? 'NAVY1').split(',');
const BIG = process.argv[4] !== 'small';

const pct = (v) => `${(100 * v).toFixed(1)}%`;
const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));

function coastal(world, nation) {
  return (world.provinces ?? []).some((p) => p.owner === nation.id && p.coastal);
}

function runSeed(seed) {
  const t0 = Date.now();
  const game = headless(seed, BIG ? { cols: 160, rows: 96 } : {});
  const w = game.world;
  const acc = {
    shipWeeks: 0, atSea: 0, sailing: 0, inPort: 0, docked: 0,
    warShipWeeks: 0, warAtSea: 0,
    zoneWeeks: 0, squadronWeeks: 0, squadronShips: 0,
    moves: 0, battles: 0, evasions: 0, sunk: 0, blockWeeks: 0, coastWarWeeks: 0, blockSum: 0,
    subs: 0, subsAtSea: 0, maxFleet: 0, fleetsAtWar: 0, idleWarFleets: 0,
    byYear: [],
  };
  const lastZone = new Map();
  const seenReports = new Set();
  const seenEvasions = new Set();
  for (let wk = 1; wk <= YEARS * 52; wk++) {
    game.turns.endTurn();
    const turn = w.turn;
    const state = w.navyState;
    let worldShips = 0;
    let navies = 0;
    for (const n of w.nations) {
      if (!n.alive) continue;
      const ships = (n.navy?.ships ?? []).filter((s) => s.kind !== 'sub');
      const subs = (n.navy?.ships ?? []).filter((s) => s.kind === 'sub');
      acc.subs += subs.length;
      acc.subsAtSea += subs.filter((s) => s.at >= 0).length;
      if (!ships.length) continue;
      navies++;
      acc.navyWeeks = (acc.navyWeeks ?? 0) + 1;
      worldShips += ships.length;
      const war = w.nations.some((o) => o.alive && o.id !== n.id && atWar(w, n.id, o.id) && coastal(w, o));
      const zones = new Set();
      for (const s of ships) {
        acc.shipWeeks++;
        const docked = s.repairing || (s.hold ?? 0) > turn;
        if (docked) acc.docked++;
        if (s.at >= 0) { acc.atSea++; zones.add(s.at); } else if (s.zone >= 0) acc.sailing++; else acc.inPort++;
        if (war) { acc.warShipWeeks++; if (s.at >= 0) acc.warAtSea++; }
        const key = `${n.id}:${s.id}`;
        const prev = lastZone.get(key);
        if (prev !== undefined && s.zone >= 0 && prev !== s.zone) acc.moves++;
        if (s.zone >= 0) lastZone.set(key, s.zone);
      }
      acc.zoneWeeks += zones.size;
      if (zones.size) { acc.squadronWeeks += zones.size; acc.squadronShips += ships.filter((s) => s.at >= 0).length; }
      if (war) {
        acc.fleetsAtWar++;
        if (!ships.some((s) => s.at >= 0 || s.zone >= 0)) acc.idleWarFleets++;
      }
    }
    acc.maxFleet = Math.max(acc.maxFleet, worldShips);
    for (const r of state?.reports ?? []) {
      const id = r.id ?? `${r.turn}-${r.zone}`;
      if (seenReports.has(id)) continue;
      seenReports.add(id);
      acc.battles++;
      acc.sunk += r.sides.reduce((s, side) => s + side.sunk.length, 0);
    }
    for (const r of state?.evasions ?? []) {
      const id = r.id ?? `${r.turn}-${r.zone}`;
      if (seenEvasions.has(id)) continue;
      seenEvasions.add(id);
      acc.evasions++;
    }
    for (const n of w.nations) {
      if (!n.alive || !coastal(w, n)) continue;
      const war = w.nations.some((o) => o.alive && o.id !== n.id && atWar(w, n.id, o.id));
      if (!war) continue;
      acc.coastWarWeeks++;
      const b = state?.blockade?.[n.id] ?? 0;
      acc.blockSum += b;
      if (b >= 0.1) acc.blockWeeks++;
    }
    if (wk % 52 === 0) {
      acc.byYear.push({ year: 1900 + wk / 52, ships: worldShips, navies, battles: acc.battles, sunk: acc.sunk });
    }
  }
  return { seed, secs: Math.round((Date.now() - t0) / 1000), acc, weeks: YEARS * 52 };
}

for (const seed of SEEDS) {
  const { acc, secs, weeks } = runSeed(seed);
  const sw = Math.max(1, acc.shipWeeks);
  console.log(`\n== ${seed} · ${YEARS} yıl · ${BIG ? '160×96' : '78×62'} · ${secs} s`);
  console.log(`dünya filosu (yıl sonu): ${acc.byYear.map((y) => y.ships).join(' ')}`);
  console.log(`donanmalı ulus (yıl sonu): ${acc.byYear.map((y) => y.navies).join(' ')}`);
  console.log(`gemi-haftası ${acc.shipWeeks}: denizde ${pct(acc.atSea / sw)}, yolda ${pct(acc.sailing / sw)}, limanda ${pct(acc.inPort / sw)} (onarım/çekilme ${pct(acc.docked / sw)})`);
  console.log(`savaşta gemi-haftası ${acc.warShipWeeks}: denizde ${pct(acc.warAtSea / Math.max(1, acc.warShipWeeks))}`);
  console.log(`savaştaki donanma-haftası ${acc.fleetsAtWar}: hiç gemisi denizde/yolda olmayan ${pct(acc.idleWarFleets / Math.max(1, acc.fleetsAtWar))}`);
  console.log(`tutulan deniz (donanma-haftası başına): ${n1(acc.zoneWeeks / Math.max(1, acc.navyWeeks ?? 0))} · kol başına gemi ${n1(acc.squadronShips / Math.max(1, acc.squadronWeeks))}`);
  console.log(`deniz değiştirme: gemi-yılı başına ${n1(acc.moves / (sw / 52))}`);
  console.log(`muharebe ${acc.battles} (yılda ${n1(acc.battles / YEARS)}), batan ${acc.sunk}, kaçınma ${acc.evasions}`);
  console.log(`kıyılı savaş-haftası ${acc.coastWarWeeks}: abluka ≥%10 ${pct(acc.blockWeeks / Math.max(1, acc.coastWarWeeks))}, ortalama ${pct(acc.blockSum / Math.max(1, acc.coastWarWeeks))}`);
  console.log(`denizaltı-haftası ${acc.subs}: denizde ${pct(acc.subsAtSea / Math.max(1, acc.subs))}`);
  console.log(`yıllık: ${acc.byYear.map((y) => `${y.year}:${y.ships}g/${y.battles}m`).join(' ')}`);
}
