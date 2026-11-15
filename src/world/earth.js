// EARTH coğrafya kaynağı: gerçek Dünya, prosedürel şablonun (geography.js)
// yerine geçen BİÇİM kaynağı.
//
// Veri src/world/earth/earth-160x96.js'tedir (scripts/earth/build-earth.mjs
// üretir; kaynaklar ve lisanslar orada). Burası onu çözer ve worldgen'e
// buildGeography ile aynı sözleşmeyi verir: kara maskesi, kıyı uzaklıkları,
// bölgeler, çapalar, karne. Arazi tipi, yükseklik, sıcaklık ve nem
// earthTerrain.classifyEarth'ten gelir; nehirler veride hazırdır (hex kenarı).
//
// Dünya sabittir, tohum yalnız siyaseti belirler: çözüm bir kez yapılır ve
// saklanır. Çağıran sakladığı dizileri DEĞİŞTİRMEZ (worldgen değerleri
// karelere kopyalar).
//
// Katman notu: world katmanı; DOM'suz, Node'da test edilir.

import DATA from './earth/earth-160x96.js';
import { EARTH_GRID, earthFrame } from './earthGrid.js';
import { classifyEarth } from './earthTerrain.js';
import { EARTH_RULES_LATEST } from './earthRules.js';
import { analyzeGeography } from './geoscore.js';
import { distanceField } from './geography.js';

export const EARTH_COLS = DATA.cols;
export const EARTH_ROWS = DATA.rows;

/** base64 → bayt dizisi (tarayıcıda da Node'da da atob var). */
function bytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Çift bayt (değer, tekrar) dizisini açar. */
function unrle(b64, n) {
  const src = bytes(b64);
  const out = new Uint8Array(n);
  let k = 0;
  for (let i = 0; i + 1 < src.length; i += 2) {
    out.fill(src[i], k, k + src[i + 1]);
    k += src[i + 1];
  }
  if (k !== n) throw new Error(`earth: katman boyu ${k}, beklenen ${n}`);
  return out;
}

const cache = new Map();

/**
 * Çözülmüş Earth verisi (kural sürümü başına bir kez). Sürüm 1, kutup çölü
 * kuralından önceki araziyi verir: o sürümle başlamış kayıt aynı dünyayı kurar.
 */
export function earthData(version = EARTH_RULES_LATEST) {
  const key = version >= 2 ? 2 : 1;
  if (cache.has(key)) return cache.get(key);
  const { cols, rows } = DATA;
  if (cols !== EARTH_GRID.cols || rows !== EARTH_GRID.rows || DATA.lon0 !== EARTH_GRID.lon0) {
    // Veri ile projeksiyon ayrışırsa çapalar ve nehirler kayar: sessizce değil, yüksek sesle düş.
    throw new Error('earth: veri modülü EARTH_GRID ile uyuşmuyor; build-earth.mjs yeniden koşulmalı');
  }
  const n = cols * rows;
  const frame = earthFrame(cols, rows);
  const land = unrle(DATA.land, n);
  const ice = unrle(DATA.ice, n);
  const koppen = unrle(DATA.koppen, n);
  const zoneIdx = unrle(DATA.zone, n);
  const elevB = bytes(DATA.elev);
  const reliefB = bytes(DATA.relief);
  const elev = new Float32Array(n);
  const relief = new Float32Array(n);
  const lat = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    // Karekök ölçekli bayt: kara yüksekliği 0..9000 m, deniz derinliği 0..11000 m.
    elev[i] = (elevB[i] / 255) ** 2 * (land[i] ? 9000 : 11000);
    relief[i] = reliefB[i] * 32;
    lat[i] = frame.centerOf(i % cols, (i / cols) | 0).lat;
  }
  const climate = classifyEarth({ n, land, elev, relief, koppen, ice, lat }, { polarDesert: key >= 2 });
  const zones = Array.from(zoneIdx, (z) => (z ? DATA.zones[z] : null));

  const riverB = bytes(DATA.rivers);
  const rivers = [];
  for (let i = 0; i + 3 < riverB.length; i += 4) {
    rivers.push({ a: riverB[i] | (riverB[i + 1] << 8), dir: riverB[i + 2], flow: riverB[i + 3] / 255 });
  }

  /** [enlem, boylam] → nations.js'in okuduğu {u, v} (hex merkezine oturtulmuş). */
  const anchorOf = ([la, lo]) => {
    const t = frame.tileOf(lo, la);
    const col = t % cols;
    const row = (t / cols) | 0;
    return { u: (col + 0.5) / cols, v: (row + 0.5) / rows };
  };
  const mapAnchors = (src) => Object.fromEntries(Object.entries(src).map(([k, ll]) => [k, anchorOf(ll)]));

  const decoded = {
    cols, rows, land, zones, rivers,
    terrain: climate.terrain,
    elevation: climate.elevation,
    temperature: climate.temperature,
    moisture: climate.moisture,
    toWater: distanceField(land, cols, rows, false),
    toLand: distanceField(land, cols, rows, true),
    anchors: mapAnchors(DATA.anchors),
    roleAnchors: mapAnchors(DATA.roleAnchors),
    stats: analyzeGeography(land, cols, rows),
    build: DATA.stats,
  };
  cache.set(key, decoded);
  return decoded;
}
