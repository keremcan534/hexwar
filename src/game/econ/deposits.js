// KAYNAK YATAKLARI ve TOPRAK VERİMİ.
//
// Beş yatak türü (kömür, demir, kereste, at, güherçile) hex'e atanır; gıda
// yataktan değil toprağın veriminden gelir. İkisi de tohum + arazi +
// koordinattan türer, KAYDA GİRMEZ: yüklemede aynı dünya aynı yatakları
// yeniden üretir.
//
// Dağılım iki katmanlı (eski RGO atamasından devralındı, ölçülüp oturmuştu):
//   1. ARAZİ: yatak ancak ona uygun karede çıkar (kömür tepe, kereste orman,
//      at bozkır, güherçile çöl ve dağ).
//   2. DAMAR: her türün düşük frekanslı gürültü alanı vardır; madenler kuşak,
//      sürüler bölge olur — tek tek serpilmez. Kıtlık coğrafidir, ticareti ve
//      savaş hedefini o doğurur.
// Paylar kotayla TAM verilir (argmax kesikli olduğu için yakınsamıyordu).

import { makeRng } from '../../core/rng.js';
import { fbm, makeNoise2D } from '../../core/noise.js';
import { DEPOSIT_IDS } from './defs.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Arazi uygunluğu; tabloda olmayan arazide o yatak çıkmaz. */
const DEPOSIT_TERRAIN = {
  COAL: { HILLS: 2.6, MOUNTAIN: 1.3, FOREST: 0.7, TUNDRA: 0.5, PLAINS: 0.25, GRASSLAND: 0.15 },
  IRON: { MOUNTAIN: 2.8, HILLS: 2.2, SNOW_PEAK: 1.4, TUNDRA: 0.35, DESERT: 0.3, FOREST: 0.2 },
  TIMBER: { FOREST: 4.0, JUNGLE: 1.6, HILLS: 0.7, TUNDRA: 0.6, MOUNTAIN: 0.4, GRASSLAND: 0.2 },
  HORSES: { GRASSLAND: 2.4, PLAINS: 1.6, TUNDRA: 0.8, DESERT: 0.4, HILLS: 0.5 },
  SALTPETER: { DESERT: 2.0, MOUNTAIN: 1.2, HILLS: 0.8, SNOW_PEAK: 0.4, BEACH: 0.3 },
};

/** Damar eğilimi: büyük değer = güçlü kuşak. */
const DEPOSIT_CLUMP = { COAL: 1.8, IRON: 1.6, TIMBER: 0.5, HORSES: 0.7, SALTPETER: 1.8 };

/**
 * Kara hex'lerinin yatak payları; kalanı yataksızdır. Kömür ve demir sanayinin
 * iki ayağı olduğu için en geniş; güherçile seyrek ama kuşaklı — savaşta
 * kıtlığı hissedilsin.
 */
const DEPOSIT_SHARE = { COAL: 0.07, IRON: 0.065, TIMBER: 0.07, HORSES: 0.075, SALTPETER: 0.05 };

const DEPOSIT_PERIOD = 12;

/**
 * Hex yataklarını atar, her province'in yatak satırlarını ve toprak verimini
 * kurar. Deterministik; `world.provinces` hazır olmalı.
 */
export function assignDeposits(world) {
  const tiles = [];
  for (const province of world.provinces ?? []) {
    for (const idx of province.tileIdx) tiles.push(world.tiles[idx]);
  }
  const count = tiles.length;
  const k = DEPOSIT_IDS.length;
  if (count) {
    const fields = DEPOSIT_IDS.map((id) => makeNoise2D(makeRng(`${world.seed}-deposit-${id}`)));
    const aspect = (world.rows ?? 1) / Math.max(1, world.cols ?? 1);
    const score = new Float64Array(count * k);
    for (let t = 0; t < count; t++) {
      const tile = tiles[t];
      const u = tile.col / world.cols;
      const v = tile.row / world.rows;
      const jitter = makeRng(`${world.seed}-resource-${tile.q}:${tile.r}`);
      for (let r = 0; r < k; r++) {
        const id = DEPOSIT_IDS[r];
        let weight = DEPOSIT_TERRAIN[id]?.[tile.terrain.id] ?? 0;
        if (weight > 0) {
          const field = fbm(fields[r], u * DEPOSIT_PERIOD, v * DEPOSIT_PERIOD * aspect, {
            octaves: 2, periodX: DEPOSIT_PERIOD,
          });
          const contrast = clamp((field - 0.5) * 3 + 0.5, 0, 1);
          weight *= Math.exp(DEPOSIT_CLUMP[id] * (contrast - 0.5) * 2.5);
          weight *= 0.92 + jitter() * 0.16;
        }
        score[t * k + r] = weight;
      }
    }
    // Skor türün kendi dağılımının üst dilimine bölünür ki kömürün 2.6'sı ile
    // güherçilenin 2.0'ı kıyaslanabilsin; çiftler en uygundan kotaya kadar.
    const reference = new Float64Array(k);
    for (let r = 0; r < k; r++) {
      const positive = [];
      for (let t = 0; t < count; t++) if (score[t * k + r] > 0) positive.push(score[t * k + r]);
      positive.sort((a, b) => a - b);
      reference[r] = positive.length ? positive[Math.floor((positive.length - 1) * 0.9)] : 1;
    }
    const pairs = [];
    for (let t = 0; t < count; t++) {
      for (let r = 0; r < k; r++) {
        const value = score[t * k + r];
        if (value > 0) pairs.push({ value: value / reference[r], t, r });
      }
    }
    pairs.sort((a, b) => b.value - a.value || a.t - b.t || a.r - b.r);
    const quota = DEPOSIT_IDS.map((id) => Math.round(DEPOSIT_SHARE[id] * count));
    const filled = new Int32Array(k);
    const choice = new Int32Array(count).fill(-1);
    for (const pair of pairs) {
      if (choice[pair.t] >= 0 || filled[pair.r] >= quota[pair.r]) continue;
      choice[pair.t] = pair.r;
      filled[pair.r]++;
    }
    for (let t = 0; t < count; t++) {
      const tile = tiles[t];
      tile.resource = choice[t] >= 0 ? DEPOSIT_IDS[choice[t]] : null;
      tile.resourceQuality = makeRng(`${world.seed}-quality-${tile.q}:${tile.r}`).range(0.85, 1.15);
    }
  }

  // Toprak verimi: üyelerin gıda veriminin hex ortalaması, dünya ortalamasına
  // bölünür (1 = dünya ortalaması). Dünya ortalaması nüfus ağırlıklı değil
  // alan ağırlıklıdır: verimli ovalar zaten kalabalık doğar.
  let yieldSum = 0;
  let hexSum = 0;
  for (const province of world.provinces ?? []) {
    for (const idx of province.tileIdx) {
      yieldSum += world.tiles[idx].terrain.yields?.food ?? 0;
      hexSum++;
    }
  }
  const worldAverage = hexSum ? Math.max(0.1, yieldSum / hexSum) : 1;
  for (const province of world.provinces ?? []) {
    let food = 0;
    for (const idx of province.tileIdx) food += world.tiles[idx].terrain.yields?.food ?? 0;
    const fertility = clamp(food / Math.max(1, province.tileIdx.length) / worldAverage, 0.15, 2.2);
    const lines = depositLines(world, province);
    Object.defineProperty(province, 'fertility', {
      value: fertility, enumerable: false, writable: true, configurable: true,
    });
    Object.defineProperty(province, 'deposits', {
      value: lines, enumerable: false, writable: true, configurable: true,
    });
  }
}

/** Province'in yatak satırları: tür başına hex sayısı × ortalama nitelik. */
function depositLines(world, province) {
  const byId = new Map();
  for (const idx of province.tileIdx) {
    const tile = world.tiles[idx];
    if (!tile.resource) continue;
    const line = byId.get(tile.resource) ?? { id: tile.resource, hexes: 0, quality: 0 };
    line.hexes++;
    line.quality += tile.resourceQuality ?? 1;
    byId.set(tile.resource, line);
  }
  return [...byId.values()]
    .map((line) => ({ id: line.id, hexes: line.hexes, size: line.quality }))
    .sort((a, b) => b.hexes - a.hexes || (a.id < b.id ? -1 : 1));
}

/** Province'in yatak satırları (atanmamışsa boş). */
export function depositsOf(province) {
  return province?.deposits ?? [];
}

/** Province'in baskın yatağı (en çok hex) ya da null. */
export function primaryDepositOf(province) {
  return depositsOf(province)[0]?.id ?? null;
}

/** Toprak verimi (1 = dünya ortalaması). */
export function fertilityOf(province) {
  return province?.fertility ?? 1;
}
