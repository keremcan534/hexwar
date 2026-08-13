// Silindirik sarmal denetimi: dogu-bati sarmali topolojide, mesafede, yol
// bulmada ve uretimde gercekten kapali mi?
//
// Kanitlar:
//   1. world.get periyodiklik: get(q + k*cols, r) her k icin ayni kareyi verir
//   2. Kutup disindaki her karenin tam 6 komsusu var (dogu-bati duvari yok)
//   3. wrapDistance simetrik, hexDistance'tan buyuk degil, dikis komsulugu 1
//   4. Deniz yolu dikisi asar ve icten dolasmaktan uzun degil (A* sezgiseli)
//   5. Dikise bitisik kara ciftleri ayni kitada (labelContinents sarmal calisti)
//   6. Periyotlu gurultu gercekten periyotlu (noise ve fbm)
//   7. Ayni tohum ayni dunyayi verir (uretim determinizmi)

import { generateWorld } from '../../src/world/worldgen.js';
import { hexDistance, offsetToAxial } from '../../src/core/hex.js';
import { makeNoise2D, fbm } from '../../src/core/noise.js';
import { makeRng } from '../../src/core/rng.js';
import { findPath } from '../../src/core/pathfind.js';
import { finding, reportFindings, section, sub } from './harness.mjs';

const SEED = 'wrap-audit';
const SIZES = [
  { cols: 78, rows: 62 },
  { cols: 41, rows: 33 }, // tek sayili cols: parite varsayimi kalmasin
];

for (const size of SIZES) {
  section(`SARMAL TOPOLOJI — ${size.cols}x${size.rows}`);
  const world = generateWorld(SEED, size);
  const rng = makeRng(`${SEED}-probe`);

  sub('1. get periyodikligi');
  let periodBad = 0;
  for (let i = 0; i < 500; i++) {
    const tile = world.tiles[rng.int(0, world.tiles.length - 1)];
    for (const k of [-2, -1, 1, 2]) {
      if (world.get(tile.q + k * world.cols, tile.r) !== tile) periodBad++;
    }
  }
  if (periodBad) {
    finding('CRITICAL', 'get periyodikligi', 'q + k*cols ayni kare', `${periodBad} sapma`);
  } else console.log('  500 orneklem x 4 kayma: hepsi ayni kareye dustu.');

  sub('2. komsu sayisi');
  let neighborBad = 0;
  world.forEach((tile) => {
    if (tile.row === 0 || tile.row === world.rows - 1) return;
    if (world.neighbors(tile).length !== 6) neighborBad++;
  });
  if (neighborBad) {
    finding('CRITICAL', 'komsu sayisi', 'ic satirlarda 6 komsu', `${neighborBad} karede eksik`);
  } else console.log('  Kutup disindaki her karede 6 komsu.');

  sub('3. wrapDistance metrigi');
  let metricBad = 0;
  for (let i = 0; i < 400; i++) {
    const a = world.tiles[rng.int(0, world.tiles.length - 1)];
    const b = world.tiles[rng.int(0, world.tiles.length - 1)];
    const d1 = world.wrapDistance(a.q, a.r, b.q, b.r);
    const d2 = world.wrapDistance(b.q, b.r, a.q, a.r);
    if (d1 !== d2) metricBad++;
    if (d1 > hexDistance(a.q, a.r, b.q, b.r)) metricBad++;
  }
  // Dikis komsulugu: ayni satirda col 0 ile col cols-1 yan yana olmali.
  const midRow = Math.floor(world.rows / 2);
  const west = offsetToAxial(0, midRow);
  const east = offsetToAxial(world.cols - 1, midRow);
  const seamDist = world.wrapDistance(west.q, west.r, east.q, east.r);
  if (seamDist !== 1) {
    finding('CRITICAL', 'dikis komsulugu', 'col 0 ~ col cols-1 mesafesi 1', String(seamDist));
  }
  if (metricBad) {
    finding('CRITICAL', 'wrapDistance', 'simetrik ve <= hexDistance', `${metricBad} ihlal`);
  } else console.log(`  400 cift: simetrik, duz mesafeyi asmiyor; dikis mesafesi ${seamDist}.`);

  sub('4. dikisi asan yol (A*)');
  // Dikisten birkac kolon iceriden iki deniz karesi sec: yol dikisi gercekten
  // kat etmek zorunda kalsin. Deniz, dikisi asan en guvenilir yuzeydir.
  const inset = 3;
  let seaRow = -1;
  for (let row = 1; row < world.rows - 1; row++) {
    if (world.tileAt(inset, row)?.terrain.navigable
      && world.tileAt(world.cols - 1 - inset, row)?.terrain.navigable) {
      seaRow = row;
      break;
    }
  }
  if (seaRow < 0) {
    finding('MEDIUM', 'dikis yolu', 'iki ucu deniz bir satir', 'bulunamadi (tohum tumuyle kara kenarli?)');
  } else {
    const from = world.tileAt(inset, seaRow);
    const to = world.tileAt(world.cols - 1 - inset, seaRow);
    const shortcut = world.wrapDistance(from.q, from.r, to.q, to.r); // dikisten ~7
    const path = findPath(world, from, to, {
      canEnter: (t) => t.terrain.navigable,
      costOf: () => 1,
    });
    if (!path) {
      finding('CRITICAL', 'dikis yolu', 'dikisi asan deniz yolu', 'yol bulunamadi');
    } else if (path.length > shortcut * 3) {
      finding('HIGH', 'dikis yolu', `dikisten kisa yol (~${shortcut})`,
        `uzunluk ${path.length} — icten dolasmis olabilir`);
    } else {
      console.log(`  satir ${seaRow}: ${path.length} adim (dikis mesafesi ${shortcut}).`);
    }
  }

  sub('5. kita etiketleri dikiste');
  let continentBad = 0;
  world.forEach((tile) => {
    if (tile.terrain.water || tile.col !== world.cols - 1) return;
    for (const n of world.neighbors(tile)) {
      if (!n.terrain.water && n.col === 0 && n.continent !== tile.continent) continentBad++;
    }
  });
  if (continentBad) {
    finding('CRITICAL', 'kita etiketi', 'dikiste ayni kita id', `${continentBad} kirik cift`);
  } else console.log('  Dikiste bitisik kara ciftlerinin kita id\'leri tutarli.');
}

section('GURULTU PERIYODU');
{
  const noise = makeNoise2D(makeRng('noise-probe'));
  const rng = makeRng('noise-sample');
  let noiseBad = 0;
  for (let i = 0; i < 300; i++) {
    const x = rng.range(0, 4);
    const y = rng.range(0, 64);
    for (const period of [3, 4, 5, 12]) {
      if (Math.abs(noise(x, y, period) - noise(x + period, y, period)) > 1e-9) noiseBad++;
      const a = fbm(noise, x, y, { octaves: 5, periodX: period });
      const b = fbm(noise, x + period, y, { octaves: 5, periodX: period });
      if (Math.abs(a - b) > 1e-9) noiseBad++;
    }
  }
  if (noiseBad) {
    finding('CRITICAL', 'gurultu periyodu', 'noise(x)=noise(x+P)', `${noiseBad} sapma`);
  } else console.log('  300 orneklem x 4 periyot: noise ve fbm x ekseninde kapali.');

  // Parametresiz cagri eski davranista kalmali (periyotsuz dunyalar/testler).
  const plain = Math.abs(noise(1.37, 2.61) - noise(1.37 + 256, 2.61));
  if (plain > 1e-9) {
    finding('HIGH', 'parametresiz gurultu', '256 orgu periyodu korunur', String(plain));
  }
}

section('URETIM DETERMINIZMI');
{
  const fingerprint = (world) => {
    let h = 0;
    world.forEach((t) => {
      h = (h * 31 + t.terrain.id.length * 7 + t.owner + 3 + (t.culture + 3) * 5
        + (t.continent + 3) * 11 + Math.round(t.elevation * 1e6)) % 2147483647;
    });
    return h;
  };
  const a = fingerprint(generateWorld(SEED, SIZES[0]));
  const b = fingerprint(generateWorld(SEED, SIZES[0]));
  if (a !== b) {
    finding('CRITICAL', 'uretim determinizmi', 'ayni tohum ayni dunya', `${a} != ${b}`);
  } else console.log(`  Ayni tohum iki uretimde ayni parmak izi: ${a}.`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
