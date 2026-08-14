// Province bolumleme denetimi: 2-7 hexlik kumeler dunyayi gercekten ortuyor
// mu, bitisik mi, sinirlar ve kultur kumeye oturuyor mu?
//
// Kanitlar:
//   1. Tam ortme: her gecilebilir karede provinceId >= 0; deniz/gecilemezde -1
//   2. Boy histogrami: buyuk cogunluk 2-7, tavan 8; 1'lik yalniz ada/cep
//   3. Bitisiklik: her province BFS'te tek parca (sarmal komsulukla)
//   4. Komsuluk simetrik ve dogru
//   5. Sahiplik hizasi: uretim aninda kume uyeleri tek owner
//   6. Kultur: kume ici tek tip
//   7. Determinizm: ayni tohum ayni bolumleme
//   8. tileIdx <-> provinceId tutarli

import { generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import { DEFAULT_ZONE, ZONE_RULES } from '../../src/world/macro.js';
import { finding, headless, n0, reportFindings, run, section, sub } from './harness.mjs';

const SEED = 'province-audit';
const SIZES = [
  { cols: 78, rows: 62 },
  { cols: 200, rows: 160 },
];

function assignmentHash(world) {
  let h = 0;
  world.forEach((t) => { h = (h * 31 + (t.provinceId + 2)) % 2147483647; });
  return h;
}

for (const size of SIZES) {
  section(`PROVINCE BOLUMLEME — ${size.cols}x${size.rows}`);
  const world = generateWorld(SEED, size);
  generateNations(world, { seed: `${SEED}-nations` });
  const provinces = world.provinces ?? [];
  console.log(`  ${n0(provinces.length)} province · kara ${n0(world.landCount)}`
    + ` · ort boy ${(world.landCount / Math.max(1, provinces.length)).toFixed(2)}`);

  sub('1. tam ortme + tileIdx tutarliligi');
  let coverBad = 0;
  let refBad = 0;
  world.forEach((tile, i) => {
    if (tile.terrain.passable) {
      if (!(tile.provinceId >= 0)) coverBad++;
      else if (!provinces[tile.provinceId].tileIdx.includes(i)) refBad++;
    } else if (tile.provinceId !== -1) coverBad++;
  });
  for (const p of provinces) {
    for (const idx of p.tileIdx) {
      if (world.tiles[idx].provinceId !== p.id) refBad++;
    }
  }
  if (coverBad || refBad) {
    finding('CRITICAL', 'ortme/tutarlilik', 'tam ortme, cift yonlu tutarli id',
      `ortme ${coverBad}, referans ${refBad}`);
  } else console.log('  Her gecilebilir kare tam bir province\'te; id\'ler cift yonlu tutarli.');

  sub('2. boy histogrami (bolge hedefine gore)');
  // Boy hedefi makro bolgeden gelir: yogun-bati 4-5, bozkir/kolonizasyon
  // alani 11-15. Tavan = bolge hedefi + katilim toleransi (bkz. provinces-gen).
  const histogram = new Map();
  let over = 0;
  for (const p of provinces) {
    const n = p.tileIdx.length;
    histogram.set(n, (histogram.get(n) ?? 0) + 1);
    const rule = ZONE_RULES[p.zone ?? DEFAULT_ZONE] ?? ZONE_RULES[DEFAULT_ZONE];
    if (n > Math.max(rule.size[0], rule.size[1]) + 4) over++;
  }
  const sizes = [...histogram.keys()].sort((a, b) => a - b);
  console.log('  boy -> adet: ' + sizes.map((s) => `${s}:${histogram.get(s)}`).join('  '));
  console.log(`  ort boy ${(world.landCount / Math.max(1, provinces.length)).toFixed(2)}`);
  if (over) {
    finding('CRITICAL', 'boy tavani', 'bolge hedefi + 4 asilamaz', `${over} province tavan ustu`);
  } else console.log('  Hicbir province bolge tavanini asmiyor.');

  sub('3. bitisiklik');
  let splitBad = 0;
  for (const p of provinces) {
    const members = new Set(p.tileIdx.map((i) => world.tiles[i]));
    const queue = [world.tiles[p.tileIdx[0]]];
    const seen = new Set(queue);
    for (let head = 0; head < queue.length; head++) {
      for (const n of world.neighbors(queue[head])) {
        if (members.has(n) && !seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    if (seen.size !== members.size) splitBad++;
  }
  if (splitBad) finding('CRITICAL', 'bitisiklik', 'her province tek parca', `${splitBad} bolunmus`);
  else console.log('  Her province tek parca (sarmal komsulukla).');

  sub('4. komsuluk simetrisi');
  let adjBad = 0;
  for (const p of provinces) {
    for (const other of p.neighbors) {
      if (!provinces[other]?.neighbors.includes(p.id)) adjBad++;
    }
  }
  if (adjBad) finding('CRITICAL', 'komsuluk', 'simetrik graf', `${adjBad} tek yonlu kenar`);
  else console.log('  Komsuluk grafi simetrik.');

  sub('5. sahiplik hizasi (uretim ani)');
  let ownerBad = 0;
  for (const p of provinces) {
    const owners = new Set(p.tileIdx.map((i) => world.tiles[i].owner));
    if (owners.size !== 1) ownerBad++;
    else if (p.owner !== [...owners][0]) ownerBad++;
  }
  if (ownerBad) {
    finding('CRITICAL', 'sahiplik hizasi', 'kume uyeleri tek owner', `${ownerBad} karisik province`);
  } else console.log('  Ulke sinirlari hicbir province\'i bolmuyor.');

  sub('6. kultur tekligi');
  let cultureBad = 0;
  for (const p of provinces) {
    const cultures = new Set(p.tileIdx.map((i) => world.tiles[i].culture));
    if (cultures.size !== 1) cultureBad++;
  }
  if (cultureBad) finding('HIGH', 'kultur snap', 'kume ici tek kultur', `${cultureBad} karisik`);
  else console.log('  Her province tek kultur konusuyor.');
}

section('SAVAS SONRASI HIZA — 150 hafta serbest kosu');
{
  const game = headless(SEED);
  run(game, 150);
  const world = game.world;
  let mixed = 0;
  let counterBad = 0;
  const counted = world.nations.map(() => 0);
  for (const province of world.provinces ?? []) {
    const owners = new Set(province.tileIdx.map((i) => world.tiles[i].owner));
    if (owners.size > 1) mixed++;
    if (province.owner >= 0 && counted[province.owner] !== undefined) counted[province.owner]++;
  }
  for (const nation of world.nations) {
    if ((nation.provinces ?? 0) !== counted[nation.id]) counterBad++;
  }
  if (mixed) {
    finding('CRITICAL', 'savas sonrasi hiza',
      'sinir hicbir kumeyi bolmemeli (claim/claimAtPeace kume butunu)',
      `${mixed} karisik-sahipli kume`);
  } else console.log('  150 haftada hicbir kume karisik sahipli degil (bordergore sifir).');
  if (counterBad) {
    finding('HIGH', 'province sayaci', 'nation.provinces gercek sayimi tutmali',
      `${counterBad} ulkede sapma`);
  } else console.log('  nation.provinces sayaclari gercek sayimla birebir.');
}

section('DETERMINIZM');
{
  const a = generateWorld(SEED, SIZES[0]);
  const b = generateWorld(SEED, SIZES[0]);
  const ha = assignmentHash(a);
  const hb = assignmentHash(b);
  if (ha !== hb) {
    finding('CRITICAL', 'bolumleme determinizmi', 'ayni tohum ayni bolumleme', `${ha} != ${hb}`);
  } else console.log(`  Ayni tohum iki uretimde ayni bolumleme: ${ha}.`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
