// EARTH bölge kalibrasyonu: prosedürel standart dünya (160×96) ölçülür,
// Earth'te her bölgenin province SAYISI ve toplam NÜFUSU ona eşitlenir.
//
//   node scripts/earth/calibrate-earth.mjs [--ref 8] [--earth 4] [--write]
//
// Neden ikisi birden: arketip ve doldurma devleti boyları province sayısıyla,
// nüfus ağırlığı bölge çarpanıyla yazılıdır. İkisi eşitlenince province başına
// nüfus da tasarımdaki gibi kalır; Earth yalnız biçimi değiştirir, rollerin
// ağırlığını değil. Province boyu bölgenin kıyı/iç oranını korur.
//
// Province sayısı boyla doğrusal değildir (büyüme toleransı, dağ eklentisi,
// verim çarpanı): ayar ölçüp düzelterek birkaç turda oturur. --write
// sonucu src/world/earthRules.js'e yazar.

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateWorld, STANDARD_COLS, STANDARD_ROWS } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import { initProvinces } from '../../src/game/provinces.js';
import { ZONE_RULES } from '../../src/world/macro.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
const REF_SEEDS = Array.from({ length: Number(args.ref ?? 8) }, (_, i) => `KALIBRE-${i + 1}`);
const EARTH_SEEDS = Array.from({ length: Number(args.earth ?? 4) }, (_, i) => `KALIBRE-EARTH-${i + 1}`);
/** Bundan küçük Earth bölgesi kalibre edilmez (Hawaii, Karayipler): örnek yetmez. */
const MIN_EARTH_HEXES = 12;
/**
 * Mercekle bilerek büyütülen bölgeler (Kerem: "Avrupa küçük kalırsa sıkıcı",
 * "Türkiye de önemli") prosedürel kuralda kalır: büyüdükleri için DAHA ÇOK
 * province taşırlar, istenen ayrıntı budur. Sayıya eşitlemek Anadolu'yu
 * 12-14 hexlik dev province'lere bölüyordu.
 */
const FAVORED = new Set(['yogun-bati', 'kavsak']);
/** Ada bölgesinde province adayı aşamaz: boy büyütmek sayıyı düşürmez, iriltir. */
const ISLANDS = new Set(['baharat-adalari', 'dogu-adalari', 'korsan-adalari', 'acik-deniz']);
/** Boy en çok bu kat büyür: Miller'ın şişirdiği Sibirya okunur kalsın. */
const MAX_GROWTH = 2;
/** Province sayısında kabul edilen sapma; yuvarlanan tamsayı boy bundan iyisini vermiyor. */
const COUNT_TOLERANCE = 0.12;
const ROUNDS = 5;

function measure(world) {
  const rules = world.zoneRules ?? ZONE_RULES;
  const zones = {};
  let total = 0;
  for (const p of world.provinces) {
    const z = (zones[p.zone] ??= { hexes: 0, provinces: 0, pop: 0, base: 0 });
    z.hexes += p.tileIdx.length;
    z.provinces += 1;
    z.pop += p.econ.population;
    // Taban nüfus: çarpandan önceki değer (gürültünün ortalaması 1).
    z.base += p.econ.population / rules[p.zone].popMul;
    total += p.econ.population;
  }
  return { zones, total };
}

function averaged(seeds, options) {
  const sum = {};
  let total = 0;
  for (const seed of seeds) {
    const world = generateWorld(seed, options);
    generateNations(world, { seed: `${seed}-nations` });
    initProvinces(world);
    const m = measure(world);
    total += m.total / seeds.length;
    for (const [zone, z] of Object.entries(m.zones)) {
      const s = (sum[zone] ??= { hexes: 0, provinces: 0, pop: 0, base: 0 });
      for (const k of Object.keys(s)) s[k] += z[k] / seeds.length;
    }
  }
  return { zones: sum, total };
}

const ref = averaged(REF_SEEDS, { cols: STANDARD_COLS, rows: STANDARD_ROWS });
console.log(`prosedürel referans: ${REF_SEEDS.length} tohum · nüfus ${(ref.total / 1e6).toFixed(0)}M`);

let overrides = {};
let earth = null;
for (let round = 1; round <= ROUNDS; round++) {
  earth = averaged(EARTH_SEEDS, { map: 'earth', zoneOverrides: overrides });
  let worst = 0;
  const next = {};
  for (const [zone, e] of Object.entries(earth.zones)) {
    const r = ref.zones[zone];
    if (!r || FAVORED.has(zone) || e.hexes < MIN_EARTH_HEXES || r.provinces < 3) continue;
    const base = ZONE_RULES[zone];
    const current = overrides[zone]?.size ?? base.size;
    // Sayı fazlaysa province büyür: ortalama boy sayı oranıyla ölçeklenir,
    // kıyı/iç oranı prosedürel kuraldan kalır.
    const meanNow = (current[0] + current[1]) / 2;
    const meanNext = Math.max(2, meanNow * (e.provinces / r.provinces));
    const share = [base.size[0], base.size[1]].map((v) => (2 * v) / (base.size[0] + base.size[1]));
    const size = share.map((s, k) => {
      const cap = ISLANDS.has(zone) ? base.size[k] : base.size[k] * MAX_GROWTH;
      return Math.max(2, Math.min(cap, Math.round(meanNext * s)));
    });
    // Nüfus: bölgenin prosedürel toplamı, dünya toplamı da aynı kalsın diye.
    const popMul = Math.round((r.pop / e.base) * 100) / 100;
    next[zone] = { size, popMul };
    // Boy sınırına dayanan bölge (adalar, Sibirya, en küçük boydaki Çin)
    // sayıya ulaşamaz: sapması yakınsamayı bekletmesin.
    const pinned = size.every((v, k) => v === 2 || v === (ISLANDS.has(zone) ? base.size[k] : base.size[k] * MAX_GROWTH));
    if (!pinned) worst = Math.max(worst, Math.abs(e.provinces - r.provinces) / r.provinces);
  }
  console.log(`tur ${round}: en büyük province sayısı sapması %${(worst * 100).toFixed(0)}`);
  const stable = JSON.stringify(next) === JSON.stringify(overrides);
  overrides = next;
  if (worst <= COUNT_TOLERANCE || stable) break;
}
earth = averaged(EARTH_SEEDS, { map: 'earth', zoneOverrides: overrides });

console.log('\nbölge             prov ref→earth   nüfus ref→earth (M)   boy        çarpan');
const rows = [];
for (const zone of Object.keys({ ...ref.zones, ...earth.zones }).sort()) {
  const r = ref.zones[zone] ?? { provinces: 0, pop: 0 };
  const e = earth.zones[zone] ?? { provinces: 0, pop: 0, hexes: 0 };
  const o = overrides[zone];
  const line = `${zone.padEnd(17)} ${r.provinces.toFixed(0).padStart(4)} → ${e.provinces.toFixed(0).padEnd(5)}   `
    + `${(r.pop / 1e6).toFixed(1).padStart(6)} → ${(e.pop / 1e6).toFixed(1).padEnd(7)}   `
    + `${o ? `[${o.size.join(', ')}]`.padEnd(10) : '(aynı)    '} ${o ? o.popMul : ''}`;
  console.log(line);
  if (o) rows.push({ zone, o, r, e });
}
console.log(`dünya nüfusu: prosedürel ${(ref.total / 1e6).toFixed(0)}M · Earth ${(earth.total / 1e6).toFixed(0)}M`);

if (args.write) {
  const file = resolve(import.meta.dirname, '../../src/world/earthRules.js');
  const body = rows.map(({ zone, o, r, e }) => `  '${zone}': { size: [${o.size.join(', ')}], popMul: ${o.popMul} }, `
    + `// province ${r.provinces.toFixed(0)}→${e.provinces.toFixed(0)}, nüfus ${(r.pop / 1e6).toFixed(0)}M→${(e.pop / 1e6).toFixed(0)}M`).join('\n');
  const stamp = `// scripts/earth/calibrate-earth.mjs: ${REF_SEEDS.length} prosedürel, ${EARTH_SEEDS.length} Earth tohumu.\n`
    + '// Satır sonu: prosedürel → Earth (province sayısı, bölge nüfusu).\n';
  const src = readFileSync(file, 'utf8').replace(
    /(\/\*\* Bölge başına üzerine yazılan alanlar[^\n]*\n)(?:\/\/[^\n]*\n)*export const EARTH_ZONE_OVERRIDES = \{[\s\S]*?\n?\};/,
    `$1${stamp}export const EARTH_ZONE_OVERRIDES = {\n${body}\n};`,
  );
  writeFileSync(file, src);
  console.log(`\nyazıldı: ${file}`);
}
