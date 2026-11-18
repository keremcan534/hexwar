// MÜZİK DENETİMİ
//
// Üç iddia:
//   1. Partisyon tutarlı: her bölüm kaydın içinde, her liste var olan bölümleri
//      sayar, hiçbir ruh hâli tek bölüme mahkûm değildir.
//   2. Savaşın gidişi eşikler arasında savrulmaz.
//   3. Müzik simülasyona dokunmaz: her hafta durum okuyan koşu ile hiç okumayan
//      koşu aynı dünyayı üretir. İki koşu ayrı süreçtedir (bkz. determinism-audit).

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { headless, section, sub, finding, reportFindings } from './harness.mjs';
import { declareWarNow, warBlockers } from '../../src/game/diplomacy.js';
import { readMusicState, warMood } from '../../src/ui/musicMood.js';
import { FADES, MOMENTS, MOODS, SECTIONS } from '../../src/ui/musicScore.js';

const SEED = 'music-audit';
const WEEKS = 40;

function runArm(arm) {
  const game = headless(SEED);
  const { world, turns } = game;
  // Başsız oyunun oyuncusu yoktur (-1): denetim ilk canlı ulusu oynar.
  const me = world.nations[turns.playerNation]?.id ?? world.nations.find((n) => n.alive).id;
  turns.playerNation = me;
  world.nations[me].power = 99999;
  const seen = {};
  let previous = null;
  const read = () => {
    if (arm !== 'read') return;
    const state = readMusicState(world, me, turns.turn, previous);
    previous = state.mood;
    seen[state.mood] = (seen[state.mood] ?? 0) + 1;
  };
  for (let week = 0; week < WEEKS; week++) {
    if (week === 6) {
      const target = world.nations.find((n) => n.alive && n.id !== me
        && warBlockers(world, me, n.id, turns.turn, null, { allowBreach: true }).length === 0);
      if (target) declareWarNow(game, me, target.id, { manual: true, allowBreach: true });
    }
    turns.endTurn();
    read();
  }
  const print = JSON.stringify({
    nations: world.nations.map((n) => [n.id, n.alive, n.tiles, Number((n.fund ?? 0).toFixed(6)), Number((n.power ?? 0).toFixed(6))]),
    units: world.units.map((u) => [u.id, u.nationId, u.tile?.q, u.tile?.r, Number((u.strength ?? 0).toFixed(6))]),
    relations: world.relations.map((row) => row.map((rec) => rec?.state ?? 0)),
    food: world.market?.prices?.FOOD ?? null,
    turn: turns.turn,
  });
  return { hash: createHash('sha1').update(print).digest('hex'), seen };
}

const armAt = process.argv.indexOf('--arm');
if (armAt >= 0) {
  console.log(JSON.stringify(runArm(process.argv[armAt + 1])));
  process.exit(0);
}

section('MÜZİK: partisyon, savaşın gidişi, simülasyondan bağımsızlık');

sub('Partisyon');
let cuts = 0;
for (const [id, cut] of Object.entries(SECTIONS)) {
  cuts++;
  if (!(cut.from >= 0 && cut.from < cut.to && cut.to <= cut.track.duration)) {
    finding('YUKSEK', `bölüm ${id}`, `0 ≤ başlangıç < bitiş ≤ ${cut.track.duration}`, `${cut.from}-${cut.to}`);
  }
  if (cut.tail >= cut.to - cut.from) finding('YUKSEK', `bölüm ${id}`, 'kısılma bölümden kısa', `${cut.tail} sn`);
}
for (const [id, mood] of Object.entries(MOODS)) {
  const missing = mood.list.filter((name) => !SECTIONS[name]);
  if (missing.length) finding('YUKSEK', `ruh hâli ${id}`, 'listedeki bölümler var', missing.join(', '));
  if (new Set(mood.list).size < 2) finding('ORTA', `ruh hâli ${id}`, 'en az iki farklı bölüm', mood.list.join(', '));
}
for (const [id, moment] of Object.entries(MOMENTS)) {
  if (!SECTIONS[moment.section]) finding('YUKSEK', `vurgu ${id}`, 'bölüm var', moment.section);
  if (!FADES[moment.fade]) finding('YUKSEK', `vurgu ${id}`, 'geçiş var', moment.fade);
}
console.log(`  ${cuts} bölüm, ${Object.keys(MOODS).length} ruh hâli, ${Object.keys(MOMENTS).length} vurgu`);

sub('Savaşın gidişi');
const cases = [
  [0, false, null, 'war'],
  [34, false, 'war', 'war'],
  [35, false, 'war', 'warWinning'],
  [25, false, 'warWinning', 'warWinning'],
  [19, false, 'warWinning', 'war'],
  [-29, false, 'war', 'war'],
  [-30, false, 'war', 'warLosing'],
  [-20, false, 'warLosing', 'warLosing'],
  [-14, false, 'warLosing', 'war'],
  [80, true, 'warWinning', 'warLosing'],
];
for (const [balance, occupied, previous, expected] of cases) {
  const actual = warMood(balance, occupied, previous);
  if (actual !== expected) {
    finding('YUKSEK', 'warMood', `${balance}/${occupied}/${previous} → ${expected}`, actual);
  }
}
console.log(`  ${cases.length} durum sınandı`);

sub(`Simülasyondan bağımsızlık (${WEEKS} hafta, 6. haftada savaş)`);
const self = fileURLToPath(import.meta.url);
const arm = (name) => JSON.parse(execFileSync(process.execPath, [self, '--arm', name], { encoding: 'utf8', maxBuffer: 1 << 26 }).trim().split('\n').pop());
const plain = arm('plain');
const reading = arm('read');
console.log(`  okumayan koşu  ${plain.hash}`);
console.log(`  okuyan koşu    ${reading.hash}`);
console.log(`  okunan hâller  ${JSON.stringify(reading.seen)}`);
if (plain.hash !== reading.hash) finding('YUKSEK', 'müzik okuması', 'iki koşu aynı dünya', 'parmak izleri farklı');
if (!reading.seen.war && !reading.seen.warWinning && !reading.seen.warLosing) {
  finding('ORTA', 'denetim kapsamı', 'savaş hâli okundu', JSON.stringify(reading.seen));
}

process.exit(reportFindings() > 0 ? 1 : 0);
