// EARTH verisini üretir: kaynak veri → 160×96 hex modülü.
//
//   node scripts/earth/build-earth.mjs --src <klasör> [--out <modül>] [--preview <klasör>]
//
// Kaynaklar fetch-earth.mjs ile iner (depoya girmez). Modül HAM ölçü taşır
// (kara, yükseklik, engebe, iklim, buz, bölge, nehir); arazi tipine oyun karar
// verir (src/world/earthTerrain.js). Betik bağımlılıksızdır.
//
// Adımlar:
//   1. ince eşdikdörtgen raster (0.05°): kara, göl, buz
//   2. hex başına alan payı (Miller'da izdüşüm alanı: hücre ağırlığı sec(0.8φ))
//   3. kara maskesi: pay ≥ 0.5; hex'in beşte birini dolduran ada korunur
//   4. dar geçitler (curation.mjs PASSAGES) + bağlantı denetimi
//   5. ETOPO1: ortalama yükseklik/derinlik ve engebe; Köppen 1901–1930: çoğunluk
//   6. bölgeler, nehirler (hex KENARINA oturur), çapalar
//   7. önizleme PNG'leri ve modül

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readZip } from './lib/zip.mjs';
import { readDbf, readShp } from './lib/shapefile.mjs';
import { readNetcdf3 } from './lib/netcdf3.mjs';
import { readTiff } from './lib/tiff.mjs';
import { encodePng } from './lib/png.mjs';
import { DIRS, HEX_CORNERS, SQRT3 } from '../../src/core/hex.js';
import { EARTH_GRID, earthFrame } from '../../src/world/earthGrid.js';
import { classifyEarth, KOPPEN } from '../../src/world/earthTerrain.js';
import {
  FALLBACK_ZONE, LAND_LINKS, LAND_SPLITS, PASSAGES, REGIONS, ROLE_ANCHORS, SEA_LINKS, ZONE_ANCHORS,
} from './curation.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return acc;
}, []));
if (!args.src) {
  console.error('kullanım: node scripts/earth/build-earth.mjs --src <klasör> [--out <modül>] [--preview <klasör>]');
  process.exit(1);
}
const SRC = resolve(args.src);
const OUT = resolve(args.out ?? 'src/world/earth/earth-160x96.js');
const PREVIEW = args.preview ? resolve(args.preview) : null;
const MAX_RIVER_RANK = Number(args.rivers ?? 5);

const D2R = Math.PI / 180;
// Deneme: --lens "boylam,enlem,a,b,m;..." mercekleri geçici olarak değiştirir (modül yine üretilir).
const frame = args.lens
  ? earthFrame(EARTH_GRID.cols, EARTH_GRID.rows, {
    ...EARTH_GRID,
    lenses: String(args.lens).split(';').map((spec) => Object.fromEntries(
      ['lon', 'lat', 'a', 'b', 'm'].map((k, i) => [k, Number(spec.split(',')[i])]),
    )),
  })
  : earthFrame();
const { cols: COLS, rows: ROWS } = frame;
const N = COLS * ROWS;
const T0 = Date.now();
const log = (msg) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s] ${msg}`);

// --- Hex komşuluğu (odd-r, yatay sarmal) ---------------------------------
const tileQ = new Int32Array(N);
const tileR = new Int32Array(N);
for (let t = 0; t < N; t++) {
  const row = (t / COLS) | 0;
  const col = t - row * COLS;
  tileR[t] = row;
  tileQ[t] = col - ((row - (row & 1)) >> 1);
}
const wrapCol = (c) => ((c % COLS) + COLS) % COLS;
const indexOfAxial = (q, r) => (r < 0 || r >= ROWS ? -1 : r * COLS + wrapCol(q + ((r - (r & 1)) >> 1)));
const nbr = (t, d) => indexOfAxial(tileQ[t] + DIRS[d][0], tileR[t] + DIRS[d][1]);
const centerPx = (t) => ({ x: SQRT3 * (tileQ[t] + tileR[t] / 2), y: 1.5 * tileR[t] });
const tileLatLon = new Array(N);
for (let t = 0; t < N; t++) tileLatLon[t] = frame.centerOf(t % COLS, (t / COLS) | 0);

// --- 1. Natural Earth → ince raster ----------------------------------------
function ne(name) {
  const zip = readZip(readFileSync(join(SRC, 'ne', `${name}.zip`)));
  return { shp: readShp(zip.read(`${name}.shp`)), dbf: readDbf(zip.read(`${name}.dbf`)) };
}
const RES = 0.05;
const RW = 7200;
const RH = 3600;
const LAND = 1;
const LAKE = 2;
const ICE = 4;
const fine = new Uint8Array(RW * RH);

/** Çokgen kümesini çift-tek kuralıyla tarar (halka delikleri kendiliğinden düşer). */
function rasterize(shapes, bit) {
  for (const shape of shapes) {
    if (shape.type !== 5) continue;
    const rows = new Map();
    for (const ring of shape.parts) {
      for (let k = 0; k + 3 < ring.length; k += 2) {
        const x1 = ring[k]; const y1 = ring[k + 1];
        const x2 = ring[k + 2]; const y2 = ring[k + 3];
        if (y1 === y2) continue;
        const i0 = Math.max(0, Math.ceil((90 - Math.max(y1, y2)) / RES - 0.5) - 1);
        const i1 = Math.min(RH - 1, Math.floor((90 - Math.min(y1, y2)) / RES - 0.5) + 1);
        for (let i = i0; i <= i1; i++) {
          const lat = 90 - (i + 0.5) * RES;
          if ((y1 > lat) === (y2 > lat)) continue;
          const x = x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1);
          let xs = rows.get(i);
          if (!xs) rows.set(i, (xs = []));
          xs.push(x);
        }
      }
    }
    for (const [i, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const j0 = Math.max(0, Math.ceil((xs[k] + 180) / RES - 0.5));
        const j1 = Math.min(RW - 1, Math.floor((xs[k + 1] + 180) / RES - 0.5));
        for (let j = j0; j <= j1; j++) fine[i * RW + j] |= bit;
      }
    }
  }
}

{
  const land = ne('ne_10m_land');
  rasterize(land.shp.filter((s, i) => land.dbf[i].featurecla !== 'Null island'), LAND);
  rasterize(ne('ne_10m_minor_islands').shp, LAND);
  const lakes = ne('ne_10m_lakes');
  // 1900'de baraj gölü yoktu: Nasır, Kuybişev, Kariba, Volta haritaya girmez.
  rasterize(lakes.shp.filter((s, i) => lakes.dbf[i].featurecla !== 'Reservoir'), LAKE);
  // Aral ve Çad 1900'de bugünkünden büyüktü; tarihî kıyılar 1950'ler/60'lar.
  const hist = ne('ne_10m_lakes_historic');
  rasterize(hist.shp.filter((s, i) => ['Aral Sea', 'Lake Chad'].includes(hist.dbf[i].name)), LAKE);
  rasterize(ne('ne_10m_glaciated_areas').shp, ICE);
  log('ince raster: kara, göl, buz');
}

// --- 2. Hex başına alan payı -------------------------------------------------
const cellTile = new Int32Array(RW * RH).fill(-1);
const wTot = new Float64Array(N);
const wLand = new Float64Array(N);
const wIce = new Float64Array(N);
const areaKm2 = new Float64Array(N);
{
  const xOf = new Float64Array(RW);
  for (let j = 0; j < RW; j++) xOf[j] = frame.baseX(-180 + (j + 0.5) * RES);
  for (let i = 0; i < RH; i++) {
    const lat = 90 - (i + 0.5) * RES;
    if (lat > frame.latTop + 1.5 || lat < frame.latBottom - 1.5) continue;
    const by = frame.baseY(lat);
    // Ağırlık hücrenin HARİTADAKİ alanıdır: Miller'ın sec(0.8φ)'si ve
    // merceğin yerel büyütmesi (hex alanına bölününce pay olur, mercek sadeleşir).
    const w = 1 / Math.cos(0.8 * lat * D2R);
    const km2 = (RES * 111.32) ** 2 * Math.cos(lat * D2R);
    for (let j = 0; j < RW; j++) {
      const p = frame.warp(xOf[j], by);
      const t = frame.tileAtPixel(p.x, p.y);
      if (t < 0) continue;
      const c = i * RW + j;
      cellTile[c] = t;
      wTot[t] += w;
      areaKm2[t] += km2;
      const v = fine[c];
      if ((v & LAND) && !(v & LAKE)) {
        wLand[t] += w;
        if (v & ICE) wIce[t] += w;
      }
    }
  }
  log('hex alan payları');
}
const landFrac = new Float64Array(N);
for (let t = 0; t < N; t++) landFrac[t] = wTot[t] > 0 ? wLand[t] / wTot[t] : 0;

// --- 3. Kara maskesi + ada koruması -------------------------------------------
const mask = new Uint8Array(N);
for (let t = 0; t < N; t++) mask[t] = landFrac[t] >= 0.5 ? 1 : 0;
const ISLAND_KEEP = 0.2;
const islands = [];
{
  // İnce rasterde kara bileşenleri (4-komşu, boylamda sarmal). Büyük bileşen
  // kıtadır; küçüklerin hangi hexi doldurduğu tutulur.
  const label = new Int32Array(RW * RH).fill(-1);
  const stack = new Int32Array(RW * RH);
  const isLand = (c) => cellTile[c] >= 0 && (fine[c] & LAND) && !(fine[c] & LAKE);
  let id = 0;
  for (let c0 = 0; c0 < RW * RH; c0++) {
    if (label[c0] >= 0 || !isLand(c0)) continue;
    let sp = 0;
    stack[sp++] = c0;
    label[c0] = id;
    let km2 = 0;
    const perTile = new Map();
    let big = false;
    while (sp) {
      const c = stack[--sp];
      const i = (c / RW) | 0;
      const j = c - i * RW;
      const a = (RES * 111.32) ** 2 * Math.cos((90 - (i + 0.5) * RES) * D2R);
      km2 += a;
      if (!big) {
        perTile.set(cellTile[c], (perTile.get(cellTile[c]) ?? 0) + a);
        if (km2 > 400000) { big = true; perTile.clear(); }
      }
      const nb = [i > 0 ? c - RW : -1, i < RH - 1 ? c + RW : -1, i * RW + ((j + 1) % RW), i * RW + ((j + RW - 1) % RW)];
      for (const n of nb) {
        if (n < 0 || label[n] >= 0 || !isLand(n)) continue;
        label[n] = id;
        stack[sp++] = n;
      }
    }
    if (!big && km2 >= 1500) {
      let best = -1;
      let bestA = 0;
      for (const [t, a] of perTile) if (a > bestA) { bestA = a; best = t; }
      islands.push({ id, km2, best, share: bestA / areaKm2[best], lat: tileLatLon[best].lat, lon: tileLatLon[best].lon });
    }
    id++;
  }
  let kept = 0;
  for (const isl of islands) {
    if (mask[isl.best]) continue;
    if (isl.km2 / areaKm2[isl.best] >= ISLAND_KEEP) { mask[isl.best] = 1; isl.kept = true; kept++; }
  }
  log(`kara bileşeni ${id} · ada adayı ${islands.length} · korunan küçük ada ${kept}`);
}

// --- 4. Dar geçitler -----------------------------------------------------------
function tilesAlong(line) {
  const out = [];
  const seen = new Set();
  let prev = null;
  for (let s = 0; s + 1 < line.length; s++) {
    const a = frame.toPixel(line[s][0], line[s][1]);
    const b = frame.toPixel(line[s + 1][0], line[s + 1][1]);
    let bx = b.x;
    if (bx - a.x > frame.period / 2) bx -= frame.period;
    if (a.x - bx > frame.period / 2) bx += frame.period;
    const len = Math.hypot(bx - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 0.05));
    for (let k = 0; k <= steps; k++) {
      const x = a.x + ((bx - a.x) * k) / steps;
      const y = a.y + ((b.y - a.y) * k) / steps;
      const t = frame.tileAtPixel(((x % frame.period) + frame.period) % frame.period, y);
      if (t < 0 || t === prev) continue;
      prev = t;
      if (!seen.has(t)) { seen.add(t); out.push(t); }
    }
  }
  return out;
}
const passageLog = [];
for (const p of PASSAGES) {
  const want = p.kind === 'land' ? 1 : 0;
  const changed = [];
  for (const t of tilesAlong(p.line)) {
    if (mask[t] !== want) { mask[t] = want; changed.push(t); }
  }
  passageLog.push({ name: p.name, kind: p.kind, changed: changed.length });
  const where = changed.map((t) => `${tileLatLon[t].lat.toFixed(1)},${tileLatLon[t].lon.toFixed(1)} %${Math.round(landFrac[t] * 100)}`);
  log(`geçit ${p.name} (${p.kind === 'land' ? 'kara' : 'su'}): ${where.join(' · ') || 'değişiklik yok'}`);
}

// --- Bağlantı yardımcıları --------------------------------------------------------
function component(start, want) {
  const seen = new Uint8Array(N);
  if (start < 0 || mask[start] !== want) return seen;
  const queue = [start];
  seen[start] = 1;
  for (let h = 0; h < queue.length; h++) {
    const t = queue[h];
    for (let d = 0; d < 6; d++) {
      const n = nbr(t, d);
      if (n < 0 || seen[n] || mask[n] !== want) continue;
      seen[n] = 1;
      queue.push(n);
    }
  }
  return seen;
}
/**
 * Noktanın hexi; istenen türde değilse komşulardan o türün en "dolu" olanı.
 * Kıyı kenti hexi 250 km'de suya düşebilir: denetim kenti değil kıyıyı sınar.
 */
function tileNear([lon, lat], want) {
  const t = frame.tileOf(lon, lat);
  if (t < 0 || mask[t] === want) return t;
  let best = -1;
  let bestF = -1;
  for (let d = 0; d < 6; d++) {
    const n = nbr(t, d);
    if (n < 0 || mask[n] !== want) continue;
    const f = want ? landFrac[n] : 1 - landFrac[n];
    if (f > bestF) { bestF = f; best = n; }
  }
  return best;
}
function linkReport() {
  const out = [];
  for (const [an, a, bn, b] of SEA_LINKS) {
    const ta = tileNear(a, 0); const tb = tileNear(b, 0);
    const ok = ta >= 0 && tb >= 0 && component(ta, 0)[tb] === 1;
    out.push({ kind: 'deniz yolu', what: `${an} ↔ ${bn}`, ok, note: ta < 0 || tb < 0 ? 'nokta karada' : '' });
  }
  for (const [an, a, bn, b] of LAND_LINKS) {
    const ta = tileNear(a, 1); const tb = tileNear(b, 1);
    const ok = ta >= 0 && tb >= 0 && component(ta, 1)[tb] === 1;
    out.push({ kind: 'kara yolu', what: `${an} ↔ ${bn}`, ok, note: ta < 0 || tb < 0 ? 'nokta suda' : '' });
  }
  for (const [an, a, bn, b] of LAND_SPLITS) {
    const ta = tileNear(a, 1); const tb = tileNear(b, 1);
    // Kara bulunamazsa kütle de yok demektir: ayrılık sınanamaz, hata say.
    const ok = ta >= 0 && tb >= 0 && component(ta, 1)[tb] !== 1;
    out.push({ kind: 'ayrı kara', what: `${an} ✕ ${bn}`, ok, note: ta < 0 || tb < 0 ? 'kara yok' : '' });
  }
  return out;
}
if (args.probe) {
  // Hata ayıklama: --probe "lon,lat;lon,lat" → çevredeki hexlerin pay ve maske dökümü.
  for (const spec of String(args.probe).split(';')) {
    const [plon, plat] = spec.split(',').map(Number);
    console.log(`== ${spec}`);
    const t0 = frame.tileOf(plon, plat);
    const ring = [t0, ...[0, 1, 2, 3, 4, 5].map((d) => nbr(t0, d))];
    for (const d of [0, 1, 2, 3, 4, 5]) for (const e of [0, 1, 2, 3, 4, 5]) ring.push(nbr(nbr(t0, d), e));
    for (const t of [...new Set(ring)].filter((x) => x >= 0)) {
      const c = tileLatLon[t];
      const ax = `${tileQ[t]},${tileR[t]}`;
      console.log(`  hex ${t} [${ax}] (${c.lon.toFixed(2)}, ${c.lat.toFixed(2)}) pay ${landFrac[t].toFixed(2)} maske ${mask[t]}`);
    }
  }
}

// --- 5a. ETOPO1: yükseklik ve derinlik -----------------------------------------------
const elevMean = new Float64Array(N);
const relief = new Float64Array(N);
{
  const nc = readNetcdf3(readFileSync(join(SRC, 'etopo', 'etopo1_0p1.nc')));
  const lat = nc.read('latitude');
  const lon = nc.read('longitude');
  const alt = nc.read('altitude');
  const nLat = lat.length;
  const nLon = lon.length - 1; // son sütun −180'in tekrarı (+180)
  const fineAt = (la, lo) => {
    const i = Math.min(RH - 1, Math.max(0, Math.floor((90 - la) / RES)));
    const j = Math.min(RW - 1, Math.max(0, Math.floor((lo + 180) / RES)));
    return fine[i * RW + j];
  };
  const landCount = new Int32Array(N);
  const waterCount = new Int32Array(N);
  const waterSum = new Float64Array(N);
  const allMax = new Float64Array(N).fill(-Infinity);
  const sampleTile = new Int32Array(nLat * nLon).fill(-1);
  const sampleLand = new Uint8Array(nLat * nLon);
  for (let i = 0; i < nLat; i++) {
    const la = lat[i];
    if (la > frame.latTop + 1.5 || la < frame.latBottom - 1.5) continue;
    for (let j = 0; j < nLon; j++) {
      const t = frame.tileOf(lon[j], la);
      if (t < 0) continue;
      const s = i * nLon + j;
      const v = alt[i * lon.length + j];
      sampleTile[s] = t;
      if (v > allMax[t]) allMax[t] = v;
      const f = fineAt(la, lon[j]);
      if ((f & LAND) && !(f & LAKE)) { sampleLand[s] = 1; landCount[t]++; } else { waterCount[t]++; waterSum[t] += Math.max(0, -v); }
    }
  }
  // Hex başına kara örnekleri: önce say, sonra doldur, sırala (yüzdelik için).
  const offset = new Int32Array(N + 1);
  for (let t = 0; t < N; t++) offset[t + 1] = offset[t] + landCount[t];
  const values = new Int16Array(offset[N]);
  const fill = Int32Array.from(offset.subarray(0, N));
  for (let s = 0; s < sampleTile.length; s++) {
    if (sampleTile[s] < 0 || !sampleLand[s]) continue;
    const i = (s / nLon) | 0;
    const j = s - i * nLon;
    values[fill[sampleTile[s]]++] = alt[i * lon.length + j];
  }
  for (let t = 0; t < N; t++) {
    if (mask[t]) {
      const n = landCount[t];
      if (n === 0) { elevMean[t] = Math.max(5, allMax[t]); relief[t] = 0; continue; }
      const slice = values.subarray(offset[t], offset[t + 1]).sort();
      let sum = 0;
      for (const v of slice) sum += v;
      elevMean[t] = Math.max(0, sum / n);
      relief[t] = slice[Math.min(n - 1, Math.floor(n * 0.9))] - slice[Math.floor(n * 0.1)];
    } else {
      elevMean[t] = waterCount[t] ? waterSum[t] / waterCount[t] : 30;
    }
  }
  log(`ETOPO1 ${nLat}×${nLon}: hex yükseklik ve engebe`);
}

// --- 5b. Köppen 1901–1930 ----------------------------------------------------------
const koppen = new Uint8Array(N);
{
  const zip = readZip(readFileSync(join(SRC, 'koppen', 'koppen_geiger_tif.zip')));
  const tif = readTiff(zip.read('1901_1930/koppen_geiger_0p1.tif'));
  const hist = new Float64Array(N * 31);
  for (let i = 0; i < tif.height; i++) {
    const la = tif.lat0 - (i + 0.5) * tif.dLat;
    if (la > frame.latTop + 1.5 || la < frame.latBottom - 1.5) continue;
    const w = 1 / Math.cos(0.8 * la * D2R);
    for (let j = 0; j < tif.width; j++) {
      const k = tif.data[i * tif.width + j];
      if (!k || k > 30) continue;
      const t = frame.tileOf(tif.lon0 + (j + 0.5) * tif.dLon, la);
      if (t >= 0) hist[t * 31 + k] += w;
    }
  }
  for (let t = 0; t < N; t++) {
    if (!mask[t]) continue;
    let best = 0;
    let bestW = 0;
    for (let k = 1; k <= 30; k++) if (hist[t * 31 + k] > bestW) { bestW = hist[t * 31 + k]; best = k; }
    koppen[t] = best;
  }
  // Verisi olmayan kara hexi (iklim haritasının kaçırdığı adacık, açılan
  // kıstak) en yakın verili hexin iklimini alır: önce karadan, sonra her yerden.
  const queue = [];
  const dist = new Int32Array(N).fill(-1);
  for (let t = 0; t < N; t++) if (koppen[t]) { dist[t] = 0; queue.push(t); }
  for (let h = 0; h < queue.length; h++) {
    const t = queue[h];
    for (let d = 0; d < 6; d++) {
      const n = nbr(t, d);
      if (n < 0 || dist[n] >= 0) continue;
      dist[n] = dist[t] + 1;
      if (mask[n] && !koppen[n]) koppen[n] = koppen[t];
      queue.push(n);
    }
  }
  log('Köppen 1901–1930 çoğunluk sınıfı');
}
const ice = new Uint8Array(N);
for (let t = 0; t < N; t++) ice[t] = mask[t] && wLand[t] > 0 && wIce[t] / wLand[t] >= 0.5 ? 1 : 0;

// --- 6a. Bölgeler -------------------------------------------------------------------
const ZONES = ['', 'yogun-bati', 'kuzey-bozkiri', 'kavsak', 'guney-yarimada', 'dogu-ovasi', 'dogu-adalari',
  'baharat-adalari', 'guney-kita', 'yeni-kuzey', 'kistak', 'korsan-adalari', 'yeni-guney', 'acik-deniz'];
const zone = new Uint8Array(N);
function inPolygon(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function regionOf(lon, lat) {
  for (const reg of REGIONS) {
    if (inPolygon(reg.polygon, lon, lat) || inPolygon(reg.polygon, lon + 360, lat)) return reg.zone;
  }
  return FALLBACK_ZONE;
}
{
  for (let t = 0; t < N; t++) {
    if (!mask[t]) continue;
    const { lon, lat } = tileLatLon[t];
    zone[t] = ZONES.indexOf(regionOf(lon, lat));
  }
  // Kara bileşenleri: küçük kütle (ada) tek bölgeye oturur; anakaradaki
  // bölgesiz hex komşu bölgeden dolar.
  const comp = new Int32Array(N).fill(-1);
  const sizes = [];
  for (let s = 0; s < N; s++) {
    if (!mask[s] || comp[s] >= 0) continue;
    const id = sizes.length;
    const queue = [s];
    comp[s] = id;
    for (let h = 0; h < queue.length; h++) {
      for (let d = 0; d < 6; d++) {
        const n = nbr(queue[h], d);
        if (n < 0 || !mask[n] || comp[n] >= 0) continue;
        comp[n] = id;
        queue.push(n);
      }
    }
    sizes.push(queue.length);
  }
  const fallback = ZONES.indexOf(FALLBACK_ZONE);
  const votes = new Map();
  for (let t = 0; t < N; t++) {
    if (!mask[t] || sizes[comp[t]] >= 300) continue;
    let v = votes.get(comp[t]);
    if (!v) votes.set(comp[t], (v = new Map()));
    v.set(zone[t], (v.get(zone[t]) ?? 0) + 1);
  }
  const winner = new Map();
  for (const [c, v] of votes) {
    let best = fallback;
    let bestN = -1;
    for (const [z, n] of v) if (n > bestN || (n === bestN && z < best)) { best = z; bestN = n; }
    winner.set(c, best);
  }
  for (let t = 0; t < N; t++) if (mask[t] && sizes[comp[t]] < 300) zone[t] = winner.get(comp[t]);
  const queue = [];
  for (let t = 0; t < N; t++) if (mask[t] && zone[t] !== fallback) queue.push(t);
  for (let h = 0; h < queue.length; h++) {
    const t = queue[h];
    for (let d = 0; d < 6; d++) {
      const n = nbr(t, d);
      if (n < 0 || !mask[n] || zone[n] !== fallback || sizes[comp[n]] < 300) continue;
      zone[n] = zone[t];
      queue.push(n);
    }
  }
  log(`bölgeler: ${sizes.length} kara kütlesi`);
}

// --- 6b. Nehirler: Natural Earth çizgileri hex kenarına ---------------------------------
// Köşe adlandırması rivers.js ve render/borderMesh.js ile aynı şemadır.
const CORNER_OWNER = [[5, 1], [1, 0], [-1, 1], [2, 0], [4, 1], [-1, 0]];
const cornerOf = (t, k) => {
  let q = tileQ[t];
  let r = tileR[t];
  const [d, type] = CORNER_OWNER[k];
  if (d >= 0) { q += DIRS[d][0]; r += DIRS[d][1]; }
  return ((r + 1) * COLS + wrapCol(q + ((r - (r & 1)) >> 1))) * 2 + type;
};
const riverEdges = new Map(); // kenar anahtarı → { a, b, dir, flow }
let riverSystems = 0;
{
  const cornerNbr = new Map(); // köşe → [[komşu köşe, kare, yön], ...]
  const link = (c1, c2, t, d) => {
    if (!cornerNbr.has(c1)) cornerNbr.set(c1, []);
    cornerNbr.get(c1).push([c2, t, d]);
  };
  for (let t = 0; t < N; t++) {
    for (let k = 0; k < 6; k++) {
      const c1 = cornerOf(t, k);
      const c2 = cornerOf(t, (k + 1) % 6);
      link(c1, c2, t, k);
      link(c2, c1, t, k);
    }
  }
  const nearestCorner = (x, y) => {
    const t = frame.tileAtPixel(((x % frame.period) + frame.period) % frame.period, y);
    if (t < 0) return -1;
    const c = centerPx(t);
    let dx0 = x - c.x;
    dx0 -= Math.round(dx0 / frame.period) * frame.period;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < 6; k++) {
      const d = (dx0 - HEX_CORNERS[k][0]) ** 2 + (y - c.y - HEX_CORNERS[k][1]) ** 2;
      if (d < bestD) { bestD = d; best = k; }
    }
    return cornerOf(t, best);
  };
  /** İki köşe arası en kısa kenar yolu (en çok 8 adım). */
  const bridge = (a, b) => {
    const prev = new Map([[a, null]]);
    let frontier = [a];
    for (let depth = 0; depth < 8 && frontier.length; depth++) {
      const next = [];
      for (const c of frontier) {
        for (const [o, t, d] of cornerNbr.get(c) ?? []) {
          if (prev.has(o)) continue;
          prev.set(o, [c, t, d]);
          if (o === b) {
            const path = [];
            let cur = b;
            while (prev.get(cur)) { const [p, tt, dd] = prev.get(cur); path.push([tt, dd]); cur = p; }
            return path.reverse();
          }
          next.push(o);
        }
      }
      frontier = next;
    }
    return null;
  };
  const FLOW = [1, 1, 0.9, 0.78, 0.64, 0.5, 0.4, 0.32];
  const rivers = ne('ne_10m_rivers_lake_centerlines');
  rivers.shp.forEach((shape, i) => {
    const row = rivers.dbf[i];
    if (!(row.scalerank <= MAX_RIVER_RANK)) return;
    if (row.featurecla !== 'River' && row.featurecla !== 'Lake Centerline') return;
    const flow = FLOW[row.scalerank] ?? 0.3;
    for (const part of shape.parts) {
      const corners = [];
      let px = null;
      let py = 0;
      for (let k = 0; k + 1 < part.length; k += 2) {
        const p = frame.toPixel(part[k], part[k + 1]);
        let x = p.x;
        if (px === null) {
          const c = nearestCorner(x, p.y);
          if (c >= 0) corners.push(c);
        } else {
          // Dikişi geçen parça kısa yoldan sarar.
          if (x - px > frame.period / 2) x -= frame.period;
          if (px - x > frame.period / 2) x += frame.period;
          const dx = x - px;
          const dy = p.y - py;
          const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 0.3));
          for (let s = 1; s <= steps; s++) {
            const c = nearestCorner(px + (dx * s) / steps, py + (dy * s) / steps);
            if (c >= 0 && c !== corners[corners.length - 1]) corners.push(c);
          }
        }
        px = x;
        py = p.y;
      }
      // Geri dönüşleri sil (A B A → A): kaba ızgarada kıvrım zikzaka döner.
      const clean = [];
      for (const c of corners) {
        if (clean.length >= 2 && clean[clean.length - 2] === c) clean.pop();
        else if (clean[clean.length - 1] !== c) clean.push(c);
      }
      for (let s = 0; s + 1 < clean.length; s++) {
        const path = bridge(clean[s], clean[s + 1]);
        if (!path) continue;
        for (const [t, d] of path) {
          const n = nbr(t, d);
          if (n < 0 || !mask[t] || !mask[n]) continue;
          const a = Math.min(t, n);
          const b = Math.max(t, n);
          const key = a * 8 + (a === t ? d : (d + 3) % 6);
          const prevEdge = riverEdges.get(key);
          if (!prevEdge || prevEdge.flow < flow) riverEdges.set(key, { a: t, b: n, dir: d, flow });
        }
      }
    }
  });
  // Nehir sistemi = kenar bileşeni (köşe üzerinden).
  const cornerOfEdge = new Map();
  const parent = new Map();
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  for (const e of riverEdges.values()) {
    const k = e.dir;
    const c1 = cornerOf(e.a, k);
    const c2 = cornerOf(e.a, (k + 1) % 6);
    for (const c of [c1, c2]) if (!parent.has(c)) parent.set(c, c);
    parent.set(find(c1), find(c2));
    cornerOfEdge.set(e, c1);
  }
  const roots = new Set();
  for (const c of cornerOfEdge.values()) roots.add(find(c));
  riverSystems = roots.size;
  log(`nehir: ${riverEdges.size} kenar, ${riverSystems} sistem (ölçek ≤ ${MAX_RIVER_RANK})`);
}

// --- 7. Rapor, önizleme, modül ---------------------------------------------------------
const links = linkReport();
const landCount = mask.reduce((a, v) => a + v, 0);
const lat = new Float32Array(N);
for (let t = 0; t < N; t++) lat[t] = tileLatLon[t].lat;
const classified = classifyEarth({ n: N, land: mask, elev: elevMean, relief, koppen, ice, lat });
const terrainCount = {};
for (let t = 0; t < N; t++) if (mask[t]) terrainCount[classified.terrain[t].id] = (terrainCount[classified.terrain[t].id] ?? 0) + 1;
const zoneCount = {};
for (let t = 0; t < N; t++) if (mask[t]) zoneCount[ZONES[zone[t]]] = (zoneCount[ZONES[zone[t]]] ?? 0) + 1;

console.log(`\nkara ${landCount} / ${N} = %${((landCount / N) * 100).toFixed(1)} · enlem ${frame.latTop}°K – ${(-frame.latBottom).toFixed(1)}°G`);
console.log('arazi:', Object.entries(terrainCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} %${((v / landCount) * 100).toFixed(1)}`).join(' · '));
console.log('bölge:', Object.entries(zoneCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · '));
for (const l of links) console.log(`  ${l.ok ? 'TAMAM' : 'HATA '} ${l.kind}: ${l.what}${l.note ? ` (${l.note})` : ''}`);
const failed = links.filter((l) => !l.ok);
const keptIslands = islands.filter((i) => i.kept).sort((a, b) => b.km2 - a.km2);
console.log(`korunan küçük adalar (${keptIslands.length}): ${keptIslands.slice(0, 40).map((i) => `${i.lat.toFixed(1)},${i.lon.toFixed(1)} ${Math.round(i.km2)}km²`).join(' · ')}`);

if (PREVIEW) {
  mkdirSync(PREVIEW, { recursive: true });
  const S = 4;
  const Wpx = Math.round(frame.period * S);
  const Hpx = Math.round((ROWS - 1) * 1.5 * S + 2 * S);
  const paint = (name, colorOf, overlay) => {
    const rgb = new Uint8Array(Wpx * Hpx * 3);
    for (let y = 0; y < Hpx; y++) {
      for (let x = 0; x < Wpx; x++) {
        const t = frame.tileAtPixel(x / S, y / S - 1);
        const c = t >= 0 ? colorOf(t) : [0, 0, 0];
        const o = (y * Wpx + x) * 3;
        rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      }
    }
    overlay?.(rgb, Wpx, Hpx, S);
    writeFileSync(join(PREVIEW, `${name}.png`), encodePng(Wpx, Hpx, rgb));
  };
  const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const KCOL = [[20, 40, 60], [0, 0, 255], [0, 120, 255], [70, 170, 250], [255, 0, 0], [255, 150, 150], [245, 165, 0], [255, 220, 100], [255, 255, 0], [200, 200, 0], [150, 150, 0], [150, 255, 150], [100, 200, 100], [50, 150, 50], [200, 255, 80], [100, 255, 80], [50, 200, 0], [255, 0, 255], [200, 0, 200], [150, 50, 150], [150, 100, 150], [170, 175, 255], [90, 120, 220], [75, 80, 180], [50, 0, 135], [0, 255, 255], [55, 200, 255], [0, 125, 125], [0, 70, 95], [178, 178, 178], [102, 102, 102]];
  const drawRivers = (rgb, w, h, s) => {
    for (const e of riverEdges.values()) {
      const c = centerPx(e.a);
      const a = HEX_CORNERS[e.dir];
      const b = HEX_CORNERS[(e.dir + 1) % 6];
      for (let k = 0; k <= 12; k++) {
        const x = Math.round((c.x + a[0] + ((b[0] - a[0]) * k) / 12) * s);
        const y = Math.round((c.y + a[1] + ((b[1] - a[1]) * k) / 12 + 1) * s);
        const xx = ((x % w) + w) % w;
        if (y < 0 || y >= h) continue;
        const o = (y * w + xx) * 3;
        rgb[o] = 40; rgb[o + 1] = 110; rgb[o + 2] = 255;
      }
    }
  };
  // Yakın önizleme: bir boylam/enlem kutusu, hex başına ~20 px. Denetim
  // noktaları kırmızı, dar geçit çizgileri sarı işaretlenir.
  const box = (name, [lonW, lonE, latS, latN], colorOf, overlay) => {
    const s = 14;
    const a = frame.toPixel(lonW, latN);
    const b = frame.toPixel(lonE, latS);
    let x1 = b.x;
    if (x1 < a.x) x1 += frame.period;
    const w = Math.round((x1 - a.x) * s);
    const h = Math.round((b.y - a.y) * s);
    const rgb = new Uint8Array(w * h * 3);
    // Gerçek kıyı çizgisi (ince raster sınırı) beyaz: hex kararı kıyıyla yan yana görünsün.
    const fineAtPx = (px, py) => {
      const { lon, lat: la } = frame.lonLatAt(px, py);
      const i = Math.min(RH - 1, Math.max(0, Math.floor((90 - la) / RES)));
      const j = ((Math.floor((lon + 180) / RES) % RW) + RW) % RW;
      const v = fine[i * RW + j];
      return (v & LAND) && !(v & LAKE) ? 1 : 0;
    };
    const coastRow = new Uint8Array(w);
    for (let y = 0; y < h; y++) {
      let left = -1;
      for (let x = 0; x < w; x++) {
        const px = (a.x + x / s) % frame.period;
        const t = frame.tileAtPixel(px, a.y + y / s);
        let c = t >= 0 ? colorOf(t) : [0, 0, 0];
        const f = fineAtPx(a.x + x / s, a.y + y / s);
        if ((left >= 0 && f !== left) || (y > 0 && f !== coastRow[x])) c = [255, 255, 255];
        left = f;
        coastRow[x] = f;
        const o = (y * w + x) * 3;
        rgb[o] = c[0]; rgb[o + 1] = c[1]; rgb[o + 2] = c[2];
      }
    }
    const dot = (lon, la, col, r = 2) => {
      const p = frame.toPixel(lon, la);
      let dx = p.x - a.x;
      if (dx < 0) dx += frame.period;
      const cx = Math.round(dx * s);
      const cy = Math.round((p.y - a.y) * s);
      for (let yy = -r; yy <= r; yy++) {
        for (let xx = -r; xx <= r; xx++) {
          if (cx + xx < 0 || cx + xx >= w || cy + yy < 0 || cy + yy >= h) continue;
          const o = ((cy + yy) * w + cx + xx) * 3;
          rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
        }
      }
    };
    for (const p of PASSAGES) {
      for (let k = 0; k + 1 < p.line.length; k++) {
        for (let u = 0; u <= 20; u++) {
          dot(p.line[k][0] + ((p.line[k + 1][0] - p.line[k][0]) * u) / 20,
            p.line[k][1] + ((p.line[k + 1][1] - p.line[k][1]) * u) / 20, [255, 230, 0], 1);
        }
      }
    }
    for (const list of [SEA_LINKS, LAND_LINKS, LAND_SPLITS]) {
      for (const [, pa, , pb] of list) { dot(pa[0], pa[1], [255, 40, 40]); dot(pb[0], pb[1], [255, 40, 40]); }
    }
    overlay?.(rgb, w, h, s, a);
    writeFileSync(join(PREVIEW, `${name}.png`), encodePng(w, h, rgb));
  };
  const maskColor = (t) => (mask[t]
    ? (landFrac[t] >= 0.5 ? [70 + 120 * landFrac[t], 140, 70] : [230, 200, 40])
    : (landFrac[t] >= 0.5 ? [230, 60, 60] : [20, 40 + 90 * landFrac[t], 90 + 100 * landFrac[t]]));
  for (const [name, bbox] of [
    ['box-europe', [-12, 45, 33, 66]],
    ['box-anatolia', [20, 50, 32, 47]],
    ['box-denmark', [3, 24, 52.5, 61]],
    ['box-redsea', [30, 62, 8, 32]],
    ['box-malaya', [94, 110, -3, 16]],
    ['box-eastasia', [95, 150, -10, 47]],
    ['box-americas', [-120, -55, -5, 35]],
  ]) box(name, bbox, maskColor);
  paint('earth-mask', (t) => (mask[t]
    ? (landFrac[t] >= 0.5 ? [90 + 120 * landFrac[t], 150, 80] : [230, 200, 40])
    : (landFrac[t] >= 0.5 ? [230, 60, 60] : [20, 40 + 60 * landFrac[t], 90 + 80 * landFrac[t]])));
  paint('earth-koppen', (t) => (mask[t] ? KCOL[koppen[t]] : [20, 30, 50]));
  paint('earth-relief', (t) => {
    if (!mask[t]) return [10, 20, 30 + Math.min(120, elevMean[t] / 40)];
    const v = Math.min(255, 40 + relief[t] / 12);
    return [v, v, v];
  }, drawRivers);
  const ZCOL = [[15, 25, 40], [200, 80, 80], [120, 90, 200], [220, 160, 60], [240, 120, 40], [200, 60, 120], [255, 90, 160], [60, 200, 160], [150, 110, 60], [80, 140, 230], [120, 200, 80], [60, 230, 230], [230, 230, 90], [160, 160, 160]];
  paint('earth-zones', (t) => (mask[t] ? ZCOL[zone[t]] : [15, 25, 40]));
  paint('earth-terrain', (t) => hex(classified.terrain[t].color), drawRivers);
  log(`önizleme: ${PREVIEW}`);
}

// Modül: ham ölçüler. Yükseklik/derinlik karekök ölçekli bir bayt (100 m'de ~7 m,
// 5 km'de ~50 m adım): sınıflandırma ve çizim için fazlasıyla yeter.
const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
function rle(u8) {
  const out = [];
  for (let i = 0; i < u8.length;) {
    const v = u8[i];
    let n = 1;
    while (i + n < u8.length && u8[i + n] === v && n < 255) n++;
    out.push(v, n);
    i += n;
  }
  return Uint8Array.from(out);
}
const elevByte = new Uint8Array(N);
const reliefByte = new Uint8Array(N);
for (let t = 0; t < N; t++) {
  const max = mask[t] ? 9000 : 11000;
  elevByte[t] = Math.round(Math.sqrt(Math.min(1, Math.max(0, elevMean[t]) / max)) * 255);
  reliefByte[t] = Math.min(255, Math.round(relief[t] / 32));
}
const riverBytes = new Uint8Array(riverEdges.size * 4);
[...riverEdges.values()].sort((x, y) => x.a - y.a || x.dir - y.dir).forEach((e, i) => {
  riverBytes[i * 4] = e.a & 255;
  riverBytes[i * 4 + 1] = e.a >> 8;
  riverBytes[i * 4 + 2] = e.dir;
  riverBytes[i * 4 + 3] = Math.round(e.flow * 255);
});
const latLon = (pairs) => Object.fromEntries(Object.entries(pairs).map(([k, [la, lo]]) => [k, [la, lo]]));
const data = {
  version: 1,
  cols: COLS, rows: ROWS, lon0: frame.lon0, latTop: frame.latTop,
  zones: ZONES,
  land: b64(rle(mask)),
  ice: b64(rle(ice)),
  koppen: b64(rle(koppen)),
  zone: b64(rle(zone)),
  elev: b64(elevByte),
  relief: b64(reliefByte),
  rivers: b64(riverBytes),
  anchors: latLon(ZONE_ANCHORS),
  roleAnchors: latLon(ROLE_ANCHORS),
  stats: {
    land: landCount,
    islandsKept: keptIslands.length,
    riverEdges: riverEdges.size,
    riverSystems,
    passages: passageLog,
    links: links.map((l) => [l.kind, l.what, l.ok]),
  },
};
const header = `// ÜRETİLDİ: scripts/earth/build-earth.mjs — elle düzenleme, betiği yeniden koş.
//
// Kaynak veri (hex ızgarasına indirgendi):
//   Natural Earth 1:10m kara, küçük adalar, göller, tarihî göller, nehirler, buzullar — kamu malı.
//   NOAA ETOPO1 Ice Surface (Amante & Eakins 2009), 0.1° alt örnek — ABD kamu malı.
//   Köppen-Geiger 1901–1930: Beck, H. E. vd. (2023), Scientific Data 10, 724 — CC BY 4.0.
`;
mkdirSync(resolve(OUT, '..'), { recursive: true });
writeFileSync(OUT, `${header}export default ${JSON.stringify(data, null, 1)};\n`);
log(`modül: ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
if (failed.length) {
  console.log(`\n${failed.length} bağlantı denetimi BAŞARISIZ`);
  process.exitCode = 2;
}
