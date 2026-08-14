// Cografya onizlemesi: makro silueti terminalde ASCII olarak cizer.
//
//   node scripts/audit/geography-preview.mjs [seed] [--zones] [--full]
//
// Amac: kita iskeletini kod okuyarak degil GOREREK ayarlamak. Sablon
// degistiginde once burasi bakilir (bkz. src/world/geography.js).

import { buildGeography } from '../../src/world/geography.js';

const args = process.argv.slice(2);
const seed = args.find((a) => !a.startsWith('--')) ?? 'ALFA';
const showZones = args.includes('--zones');
const full = args.includes('--full');
const COLS = 160;
const ROWS = 96;

const ZONE_CHAR = {
  'yogun-bati': 'W', 'kuzey-bozkiri': 'S', 'kavsak': 'K', 'dogu-ovasi': 'E',
  'guney-yarimada': 'P', 'dogu-adalari': 'J', 'guney-kita': 'A', 'yeni-kuzey': 'N',
  'kistak': 'I', 'yeni-guney': 'G', 'korsan-adalari': 'c', 'baharat-adalari': 's',
  'acik-deniz': 'o',
};

const t0 = Date.now();
const geo = buildGeography(seed, COLS, ROWS, { targetLand: 0.36 });
const ms = Date.now() - t0;

const step = full ? 1 : 2;
for (let row = 0; row < ROWS; row += step) {
  let line = '';
  for (let col = 0; col < COLS; col++) {
    const idx = row * COLS + col;
    if (!geo.land[idx]) {
      line += geo.toLand[idx] > 4 ? ' ' : '.';
    } else if (showZones) {
      line += ZONE_CHAR[geo.zones[idx]] ?? '?';
    } else {
      line += geo.height[idx] > 0.9 ? '^' : '#';
    }
  }
  console.log(line);
}

const s = geo.stats;
console.log(`\nseed ${seed} · ${ms}ms · deneme ${geo.attempt} · puan ${geo.score.toFixed(1)}`
  + ` · olcek ${geo.scaleUsed.toFixed(3)}`);
console.log(`kara %${(s.landRatio * 100).toFixed(1)} · kutle ${s.masses.length}`
  + ` (buyuk ${s.majors.length}) · ilk3 %${s.top3.map((v) => (v * 100).toFixed(0)).join(' %')}`
  + ` · cevre endeksi ${s.majors.map((m) => m.perimIndex.toFixed(1)).join('/')}`);
console.log(`ada ${s.islandCount} (mikro ${s.tinyIslands}, tek-hex ${s.oneHexIslands})`
  + ` · ic su ${s.enclosedWater.length} (delik ${s.smallHoles}, gol ${s.lakes})`
  + ` · yarimada ${s.peninsulas} · bogaz ${s.straits} · kistak ${s.isthmuses}`);
console.log(`ic deniz: havza %${(geo.sea.basin * 100).toFixed(0)} halka %${(geo.sea.ring * 100).toFixed(0)}`
  + ` · dikis ${geo.seam.seam}/${geo.seam.mean.toFixed(1)} (${geo.seam.ratio.toFixed(2)}x)`);
console.log(geo.reasons.length ? `RET: ${geo.reasons.join(' · ')}` : 'KABUL');
