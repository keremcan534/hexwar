// Fiziksel cografya denetimi: STANDART DUNYA (160x96) uzerinde cok tohumlu
// olcum. Kita bicimi iddialari kod okuyarak degil SAYIYLA dogrulanir.
//
//   npm run audit:geography            -> 24 tohum
//   node scripts/audit/geography-audit.mjs 40
//
// Olculenler (bkz. docs/cografya.md "Dogrulama"):
//   1. Kara orani hedef bantta mi (%34-38)?
//   2. Uc ayri buyuk kitasal sistem var mi, paylari dengeli mi?
//   3. Kiyi karmasikligi saglikli mi (daire ~6.93; patates < 8.6)?
//   4. Ada denetimi: mikro ada ve tek-hex ada sifir mi?
//   5. Anlamsiz ic delik var mi?
//   6. Ic deniz, bogaz, yarimada sayilari tasarim bandinda mi?
//   7. Dikis: sarmal kenarda sureksizlik var mi?
//   8. Tohumlar birbirinden farkli mi (ayni dunya iki kez cikmasin)?
//   9. Uretim suresi butcede mi?

import { buildGeography } from '../../src/world/geography.js';
import { generateWorld, STANDARD_COLS, STANDARD_ROWS, TARGET_LAND } from '../../src/world/worldgen.js';
import { finding, n0, reportFindings, section, sub } from './harness.mjs';

const COUNT = Number(process.argv[2]) || 24;
const SEEDS = Array.from({ length: COUNT }, (_, i) => `GEO-${String(i + 1).padStart(2, '0')}`);

section(`FIZIKSEL COGRAFYA — ${COUNT} tohum · ${STANDARD_COLS}x${STANDARD_ROWS}`);

const rows = [];
let totalMs = 0;
for (const seed of SEEDS) {
  const t0 = Date.now();
  const geo = buildGeography(seed, STANDARD_COLS, STANDARD_ROWS, { targetLand: TARGET_LAND });
  const ms = Date.now() - t0;
  totalMs += ms;
  rows.push({ seed, geo, ms, s: geo.stats });
}

sub('1. tohum tablosu');
console.log('  tohum      ms  den  puan  kara%  buyuk  ilk3%        cevre endeksi   ada  mikro  delik  yar  bog  kistak  kiyi');
for (const r of rows) {
  const s = r.s;
  console.log(
    `  ${r.seed}  ${String(r.ms).padStart(4)}  ${r.geo.attempt}    `
    + `${r.geo.score.toFixed(0).padStart(3)}  `
    + `${(s.landRatio * 100).toFixed(1).padStart(5)}  `
    + `${String(s.majors.length).padStart(4)}   `
    + `${s.top3.map((v) => (v * 100).toFixed(0).padStart(2)).join('/')}       `
    + `${s.majors.map((m) => m.perimIndex.toFixed(1)).join('/').padEnd(15)} `
    + `${String(s.islandCount).padStart(3)}  ${String(s.tinyIslands).padStart(5)}  `
    + `${String(s.smallHoles).padStart(5)}  ${String(s.peninsulas).padStart(3)}  `
    + `${String(s.straits).padStart(3)}  ${String(s.isthmuses).padStart(6)}  ${String(s.coastEdges).padStart(5)}`,
  );
}

const avg = (fn) => rows.reduce((a, r) => a + fn(r), 0) / rows.length;
const min = (fn) => Math.min(...rows.map(fn));
const max = (fn) => Math.max(...rows.map(fn));

sub('2. kara orani');
console.log(`  ort %${(avg((r) => r.s.landRatio) * 100).toFixed(2)}`
  + ` · en az %${(min((r) => r.s.landRatio) * 100).toFixed(1)}`
  + ` · en cok %${(max((r) => r.s.landRatio) * 100).toFixed(1)}`
  + ` · okyanus ort %${(100 - avg((r) => r.s.landRatio) * 100).toFixed(1)}`);
const outOfBand = rows.filter((r) => r.s.landRatio < 0.34 || r.s.landRatio > 0.38);
if (outOfBand.length) {
  finding('HIGH', 'kara orani', '%34-38 bandi',
    outOfBand.map((r) => `${r.seed}:%${(r.s.landRatio * 100).toFixed(1)}`).join(', '));
} else console.log('  Butun tohumlar %34-38 bandinda.');

sub('3. kitasal sistemler');
const badMajors = rows.filter((r) => r.s.majors.length !== 3);
console.log(`  buyuk sistem: ort ${avg((r) => r.s.majors.length).toFixed(2)}`
  + ` · ilk3 ort %${rows.length ? [0, 1, 2].map((i) => (avg((r) => r.s.top3[i] ?? 0) * 100).toFixed(1)).join(' / %') : ''}`);
if (badMajors.length > rows.length * 0.15) {
  finding('HIGH', 'kitasal sistem', 'tohumlarin >= %85inde tam 3 buyuk sistem',
    `${badMajors.length}/${rows.length} sapti: ${badMajors.map((r) => `${r.seed}:${r.s.majors.length}`).join(', ')}`);
} else console.log(`  Uc sistem kurali tutuyor (${rows.length - badMajors.length}/${rows.length}).`);
const merged = rows.filter((r) => r.s.largestShare > 0.52);
if (merged.length) {
  finding('CRITICAL', 'kita birlesmesi', 'en buyuk kutle <= karanin %52si',
    merged.map((r) => `${r.seed}:%${(r.s.largestShare * 100).toFixed(0)}`).join(', '));
}

sub('4. kiyi karmasikligi (daire = 6.93)');
const perims = rows.flatMap((r) => r.s.majors.map((m) => m.perimIndex));
console.log(`  buyuk kutle cevre endeksi: ort ${(perims.reduce((a, b) => a + b, 0) / perims.length).toFixed(1)}`
  + ` · en dusuk ${Math.min(...perims).toFixed(1)} · en yuksek ${Math.max(...perims).toFixed(1)}`);
const potato = rows.filter((r) => r.s.majors.some((m) => m.perimIndex < 8.6));
if (potato.length) {
  finding('HIGH', 'patates kita', 'her buyuk kutle cevre endeksi >= 8.6',
    potato.map((r) => r.seed).join(', '));
} else console.log('  Hicbir buyuk kutle daireye yaklasmiyor.');

sub('5. ada ve delik denetimi');
console.log(`  ada ort ${avg((r) => r.s.islandCount).toFixed(1)}`
  + ` (${min((r) => r.s.islandCount)}-${max((r) => r.s.islandCount)})`
  + ` · mikro ada toplam ${rows.reduce((a, r) => a + r.s.tinyIslands, 0)}`
  + ` · tek-hex ada toplam ${rows.reduce((a, r) => a + r.s.oneHexIslands, 0)}`
  + ` · kucuk ic delik toplam ${rows.reduce((a, r) => a + r.s.smallHoles, 0)}`
  + ` · gol ort ${avg((r) => r.s.lakes).toFixed(1)}`);
if (rows.some((r) => r.s.oneHexIslands > 0)) {
  finding('HIGH', 'tek-hex ada', 'temizlik sonrasi sifir olmali',
    rows.filter((r) => r.s.oneHexIslands).map((r) => r.seed).join(', '));
} else console.log('  Tek-hex ada yok.');
if (rows.some((r) => r.s.smallHoles > 2)) {
  finding('MEDIUM', 'ic delik', 'tohum basina <= 2 kucuk delik',
    rows.filter((r) => r.s.smallHoles > 2).map((r) => `${r.seed}:${r.s.smallHoles}`).join(', '));
} else console.log('  Anlamsiz ic delik yok.');
if (max((r) => r.s.islandCount) > 40) {
  finding('MEDIUM', 'ada spami', '<= 40 ada', String(max((r) => r.s.islandCount)));
}

sub('6. stratejik cografya');
console.log(`  yarimada ort ${avg((r) => r.s.peninsulas).toFixed(1)}`
  + ` (${min((r) => r.s.peninsulas)}-${max((r) => r.s.peninsulas)})`
  + ` · bogaz ort ${avg((r) => r.s.straits).toFixed(1)}`
  + ` (${min((r) => r.s.straits)}-${max((r) => r.s.straits)})`
  + ` · kistak ort ${avg((r) => r.s.isthmuses).toFixed(1)}`);
console.log(`  ic deniz: havza ort %${(avg((r) => r.geo.sea.basin) * 100).toFixed(0)}`
  + ` · cevre halka kara ort %${(avg((r) => r.geo.sea.ring) * 100).toFixed(0)}`);
const noSea = rows.filter((r) => !r.geo.sea.ok);
if (noSea.length) {
  finding('HIGH', 'ic deniz', 'her tohumda okunur ic deniz',
    noSea.map((r) => `${r.seed}:${(r.geo.sea.basin * 100).toFixed(0)}/${(r.geo.sea.ring * 100).toFixed(0)}`).join(', '));
} else console.log('  Her tohumda ic deniz okunuyor.');
const fewStraits = rows.filter((r) => r.s.straits < 2);
if (fewStraits.length) {
  finding('MEDIUM', 'bogaz', 'tohum basina >= 2 bogaz', fewStraits.map((r) => r.seed).join(', '));
}

sub('7. dikis (sarmal kenar)');
console.log(`  dikis degisimi / komsu sutun ortalamasi: ort ${avg((r) => r.geo.seam.ratio).toFixed(2)}x`
  + ` · dikisin sutun siralamasindaki yeri: ort %${(avg((r) => r.geo.seam.rank) * 100).toFixed(0)}`
  + ` (rastgele bir sutun sinirinin beklentisi %50)`);
const seamBad = rows.filter((r) => r.geo.seam.broken);
if (seamBad.length) {
  finding('HIGH', 'dikis sureksizligi', 'dikis komsu sutunlar gibi davranmali',
    seamBad.map((r) => `${r.seed}:${r.geo.seam.seam} vs p95 ${r.geo.seam.p95}`).join(', '));
} else console.log('  Dikis siradan bir sutun sinirindan ayirt edilemiyor.');

sub('8. tohum cesitliligi');
// Ayni iki dunya cikmamali: kara maskelerinin kare kare ortusme orani.
let worstPair = { a: '', b: '', same: 0 };
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    const A = rows[i].geo.land; const B = rows[j].geo.land;
    let same = 0;
    for (let k = 0; k < A.length; k++) if (A[k] === B[k]) same++;
    const share = same / A.length;
    if (share > worstPair.same) worstPair = { a: rows[i].seed, b: rows[j].seed, same: share };
  }
}
console.log(`  en benzer cift: ${worstPair.a} ~ ${worstPair.b} · kare ortusmesi %${(worstPair.same * 100).toFixed(1)}`
  + '  (rastgele iki dunya taban ~%54: kara/su oranindan)');
if (worstPair.same > 0.9) {
  finding('HIGH', 'tohum cesitliligi', 'iki dunya %90dan fazla ortusmemeli',
    `%${(worstPair.same * 100).toFixed(1)}`);
} else console.log('  Dunyalar birbirinden ayirt edilebilir.');

sub('9. performans');
console.log(`  cografya: ort ${(totalMs / rows.length).toFixed(0)} ms/dunya`
  + ` (en kotu ${max((r) => r.ms)} ms) · deneme ort ${avg((r) => r.geo.attempt).toFixed(2)}`);
const t1 = Date.now();
const world = generateWorld('GEO-PERF', { cols: STANDARD_COLS, rows: STANDARD_ROWS });
const fullMs = Date.now() - t1;
console.log(`  tam dunya (iklim + arazi + kultur + province): ${fullMs} ms`
  + ` · ${n0(world.tiles.length)} kare · ${n0(world.provinces.length)} province`);
if (avg((r) => r.ms) > 250) {
  finding('MEDIUM', 'uretim suresi', 'ort <= 250 ms/dunya', `${(totalMs / rows.length).toFixed(0)} ms`);
}
if (fullMs > 900) {
  finding('MEDIUM', 'tam uretim suresi', '<= 900 ms', `${fullMs} ms`);
}

sub('10. kabul edilen dunya orani');
const rejected = rows.filter((r) => r.geo.reasons.length);
console.log(`  dogrulamayi gecen: ${rows.length - rejected.length}/${rows.length}`);
for (const r of rejected) console.log(`    ${r.seed}: ${r.geo.reasons.join(' · ')}`);
if (rejected.length > rows.length * 0.1) {
  finding('HIGH', 'dogrulama', 'tohumlarin >= %90i deneme sinirinda kabul almali',
    `${rejected.length}/${rows.length} en iyi adaya dustu`);
} else if (rejected.length) {
  console.log('  (Kalanlar deneme sinirina takilip en iyi adaya dustu — kabul edilebilir.)');
}

process.exit(reportFindings() > 0 ? 1 : 0);
