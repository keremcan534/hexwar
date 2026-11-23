// FİLO SONDASI — oyuncunun filo emri Auto'ya göre ne değiştiriyor?
//
// Rework (2026-11-23) oyuncuya filo verdi: "bu gemiler şu denize". Mekanik
// iddia ölçülür: aynı tohumda iki koşu, oyuncu ulusu (başta en çok gemisi
// olan kıyı ulusu) 26. haftada en güçlü deniz komşusuna savaş açar.
//   auto   — filolara hiç dokunmaz (bütün gemiler Auto: YZ'nin kuralı)
//   active — dört haftada bir düşünen oyuncu: kıyımızı tutan düşmanı yenecek
//            gücü varsa oraya, yoksa düşmanın tutulmayan en geniş kıyısına
//            (abluka) bütün filoyu yollar; barışta Auto.
// Ölçülen (oyuncu, savaş haftaları): uğradığı ve uyguladığı abluka, muharebe
// (kazanılan/kaybedilen), batan gemimiz ve düşmanınki, kaçınma, emir sayısı.
// Yalnız oyuncunun filo emri farklıdır; YZ aynıdır.
//
//   node scripts/audit/navy-fleet-probe.mjs [yıl] [tohum,tohum]

import { headless, passivePlayer } from './harness.mjs';
import { atWar, declareWarNow } from '../../src/game/diplomacy.js';
import {
  fleetStrength, homeZones, surfaceOf, zoneBalance,
} from '../../src/game/navy.js';
import { FLEET_ORDER, fleetsToAuto, setFleetOrder } from '../../src/game/orders.js';
import { seaZonesOf, zoneDistances } from '../../src/world/seaZones.js';

const YEARS = Number(process.argv[2] ?? 10);
const SEEDS = (process.argv[3] ?? 'NAVY1,NAVY2,AUDIT1').split(',');
const WAR_WEEK = 26;

const pct = (v) => `${(100 * v).toFixed(1)}%`;

function setup(seed) {
  const game = headless(seed, { cols: 160, rows: 96 });
  const w = game.world;
  const coastal = (n) => homeZones(w, n.id).size > 0;
  const player = w.nations.filter((n) => n.alive && coastal(n))
    .sort((a, b) => surfaceOf(b).length - surfaceOf(a).length || a.id - b.id)[0];
  w.playerNation = player.id;
  const after = passivePlayer(game);
  return { game, w, player, after };
}

/** Oyuncunun deniz rakibi: iç suyunu paylaşan, en güçlü filolu ulus. */
function rival(w, player) {
  const home = homeZones(w, player.id);
  return w.nations.filter((n) => n.alive && n.id !== player.id
    && [...homeZones(w, n.id).keys()].some((z) => home.has(z)))
    .sort((a, b) => fleetStrength(b) - fleetStrength(a) || a.id - b.id)[0] ?? null;
}

/** Dört haftada bir: kıyımızı tutan düşmanı kov, yoksa düşman kıyısını ablukaya al. */
function think(game, player, state) {
  const w = game.world;
  const enemies = w.nations.filter((n) => n.alive && n.id !== player.id && atWar(w, player.id, n.id));
  if (!enemies.length) {
    if (fleetsToAuto(player)) state.orders++;
    return;
  }
  const presence = w.navyState?.presence;
  const turn = w.turn;
  const ours = fleetStrength(player, turn);
  const home = homeZones(w, player.id);
  const zones = seaZonesOf(w).zones;
  // 1) Kıyımızı tutan düşman: yenebileceksek (1.1×) oraya.
  let target = null;
  for (const [zoneId] of home) {
    const { hostile } = zoneBalance(w, presence, player.id, zoneId);
    if (hostile > 0 && ours >= hostile * 1.1 && (!target || hostile > target.hostile)) target = { zone: zoneId, hostile };
  }
  // 2) Yoksa: düşmanın tutulmayan en geniş kıyısı (ulaşılabilir, en çok 4 adım).
  if (!target) {
    let best = null;
    for (const enemy of enemies) {
      for (const [zoneId, edges] of homeZones(w, enemy.id)) {
        const { hostile } = zoneBalance(w, presence, player.id, zoneId);
        if (hostile > ours * 0.5) continue;
        const d = Math.min(...[...home.keys()].map((h) => zoneDistances(w, h)[zoneId] ?? Infinity));
        if (!Number.isFinite(d) || d > 4) continue;
        const score = edges - d;
        if (!best || score > best.score) best = { zone: zoneId, score };
      }
    }
    if (best) target = { zone: best.zone, hostile: 0 };
  }
  if (!target || !zones[target.zone]) return;
  const current = player.navy?.fleets?.[0]?.order;
  if (current?.mode === 'sea' && current.zone === target.zone) return;
  if (setFleetOrder(player, 0, FLEET_ORDER.SEA, target.zone) != null) state.orders++;
}

function runMode(seed, mode) {
  const t0 = Date.now();
  const { game, w, player, after } = setup(seed);
  const acc = {
    warWeeks: 0, sufferSum: 0, inflictSum: 0, battlesWon: 0, battlesLost: 0, evadedUs: 0, evadedThem: 0,
    ourSunk: 0, theirSunk: 0, orders: 0,
  };
  const seen = new Set();
  let foe = null;
  for (let wk = 1; wk <= YEARS * 52; wk++) {
    if (wk === WAR_WEEK) {
      foe = rival(w, player);
      if (foe) {
        player.power = (player.power ?? 0) + 500;
        declareWarNow(game, player.id, foe.id, { manual: true, allowBreach: true });
      }
    }
    if (mode === 'active' && wk % 4 === 0 && player.alive) think(game, player, acc);
    game.turns.endTurn();
    after();
    if (!player.alive) break;
    const enemies = w.nations.filter((n) => n.alive && n.id !== player.id && atWar(w, player.id, n.id));
    if (enemies.length) {
      acc.warWeeks++;
      acc.sufferSum += w.navyState?.blockade?.[player.id] ?? 0;
      acc.inflictSum += Math.max(0, ...enemies.map((n) => w.navyState?.blockade?.[n.id] ?? 0));
    }
    for (const r of [...(w.navyState?.reports ?? []), ...(w.navyState?.evasions ?? [])]) {
      const id = r.id ?? `${r.turn}-${r.zone}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const mine = r.sides.findIndex((s) => s.nations.includes(player.id));
      if (mine < 0) continue;
      if (r.evaded) {
        if (mine === 0) acc.evadedUs++; else acc.evadedThem++;
        continue;
      }
      if (r.winner === mine) acc.battlesWon++; else acc.battlesLost++;
      acc.ourSunk += r.sides[mine].sunk.length;
      acc.theirSunk += r.sides[1 - mine].sunk.length;
    }
  }
  return { seed, mode, player: player.name, foe: foe?.name ?? '-', secs: Math.round((Date.now() - t0) / 1000), acc, ships: surfaceOf(player).length };
}

console.log(`FİLO SONDASI — ${SEEDS.length} tohum × ${YEARS} yıl, 160×96, savaş ${WAR_WEEK}. haftada`);
for (const seed of SEEDS) {
  for (const mode of ['auto', 'active']) {
    const r = runMode(seed, mode);
    const a = r.acc;
    const ww = Math.max(1, a.warWeeks);
    console.log(`${seed} ${mode.padEnd(6)} ${r.player} vs ${r.foe}: savaş ${a.warWeeks} hf · uğranan abluka ${pct(a.sufferSum / ww)} · uygulanan ${pct(a.inflictSum / ww)} · muharebe ${a.battlesWon}K/${a.battlesLost}Y · batan bizim ${a.ourSunk} onların ${a.theirSunk} · kaçınma biz ${a.evadedUs} onlar ${a.evadedThem} · emir ${a.orders} · son filo ${r.ships} · ${r.secs} s`);
  }
}
