// KAYNAK YATAKLARI ve TOPRAK VERİMİ.
//
// HER PROVINCE BİR KAYNAK ÇIKARIR (Victoria'nın RGO'su gibi): gıda ambarı,
// kömür, demir, kereste, at ya da güherçile. Eski hex yatağı modelinde
// province'lerin %39-45'i boştu ("deposits: none") ve maden kurulamıyordu;
// kaynaksız ülke iflas etmiyordu (ölçüldü: vergi kaynaktan bağımsız, ithalat
// bütçeyle sınırlı) ama haritada kimliksizdi. Üstüne çağ kaynakları gelir:
// province'lerin bir kısmında PETROL ya da KAUÇUK ikinci satırı vardır;
// 1836'da alıcısı yoktur, teknoloji yayıldıkça değerlenir (petrol patlaması).
//
// İkisi de tohum + arazi + koordinattan türer, KAYDA GİRMEZ: yüklemede aynı
// dünya aynı yatakları yeniden üretir.
//
// Dağılım iki katmanlı:
//   1. ARAZİ: kaynak ancak ona uygun karelerin province'inde çıkar (kömür
//      tepe, kereste orman, at bozkır, güherçile çöl ve dağ, gıda ova).
//   2. DAMAR: her türün düşük frekanslı gürültü alanı vardır; kömür kuşak,
//      sürü bölge olur — tek tek serpilmez. Kıtlık coğrafidir, ticareti ve
//      savaş hedefini o doğurur.
// Paylar kotayla TAM verilir (argmax kesikli olduğu için yakınsamıyordu).

import { makeRng } from '../../core/rng.js';
import { fbm, makeNoise2D } from '../../core/noise.js';
import { DEPOSIT_IDS, ERA_DEPOSIT_IDS } from './defs.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Arazi uygunluğu; tabloda olmayan arazi o kaynağa oy vermez. */
const DEPOSIT_TERRAIN = {
  FOOD: { PLAINS: 2.4, GRASSLAND: 1.8, BEACH: 0.6, JUNGLE: 0.5, HILLS: 0.3, FOREST: 0.3 },
  COAL: { HILLS: 2.6, MOUNTAIN: 1.3, FOREST: 0.7, TUNDRA: 0.5, PLAINS: 0.25, GRASSLAND: 0.15 },
  IRON: { MOUNTAIN: 2.8, HILLS: 2.2, SNOW_PEAK: 1.4, TUNDRA: 0.35, DESERT: 0.3, FOREST: 0.2 },
  TIMBER: { FOREST: 4.0, JUNGLE: 1.6, HILLS: 0.7, TUNDRA: 0.6, MOUNTAIN: 0.4, GRASSLAND: 0.2 },
  HORSES: { GRASSLAND: 2.4, PLAINS: 1.6, TUNDRA: 0.8, DESERT: 0.4, HILLS: 0.5 },
  SALTPETER: { DESERT: 2.0, MOUNTAIN: 1.2, HILLS: 0.8, SNOW_PEAK: 0.4, BEACH: 0.3 },
  OIL: { DESERT: 3.0, TUNDRA: 1.4, BEACH: 1.0, PLAINS: 0.7, GRASSLAND: 0.3, HILLS: 0.3 },
  RUBBER: { JUNGLE: 4.0, BEACH: 0.4, FOREST: 0.3 },
};

/** Damar eğilimi: büyük değer = güçlü kuşak. */
const DEPOSIT_CLUMP = {
  FOOD: 0.6, COAL: 1.8, IRON: 1.6, TIMBER: 0.5, HORSES: 0.7, SALTPETER: 1.8, OIL: 2.0, RUBBER: 0.8,
};

/**
 * Ana kaynağın province payları (toplam 1: her province bir tane alır).
 * Kömür ve demir sanayinin iki ayağı; güherçile seyrek ama kuşaklı — savaşta
 * kıtlığı hissedilsin.
 */
const PRIMARY_SHARE = { FOOD: 0.24, TIMBER: 0.18, COAL: 0.19, HORSES: 0.16, IRON: 0.17, SALTPETER: 0.06 };

/** Çağ kaynağı ikinci satırının province payı (uygun arazi yoksa dolmaz). */
const ERA_SHARE = { OIL: 0.10, RUBBER: 0.06 };

const DEPOSIT_PERIOD = 12;

/** Province skorları: üyelerin arazi uygunluğu ortalaması × damar × titreşim. */
function scoreProvinces(world, provinces, ids) {
  const fields = ids.map((id) => makeNoise2D(makeRng(`${world.seed}-deposit-${id}`)));
  const aspect = (world.rows ?? 1) / Math.max(1, world.cols ?? 1);
  const k = ids.length;
  const score = new Float64Array(provinces.length * k);
  provinces.forEach((province, p) => {
    const center = province.center ?? world.tiles[province.tileIdx[0]];
    const u = center.col / world.cols;
    const v = center.row / world.rows;
    const jitter = makeRng(`${world.seed}-province-resource-${province.id}`);
    for (let r = 0; r < k; r++) {
      const id = ids[r];
      let weight = 0;
      for (const idx of province.tileIdx) weight += DEPOSIT_TERRAIN[id]?.[world.tiles[idx].terrain.id] ?? 0;
      weight /= Math.max(1, province.tileIdx.length);
      if (weight > 0) {
        const field = fbm(fields[r], u * DEPOSIT_PERIOD, v * DEPOSIT_PERIOD * aspect, {
          octaves: 2, periodX: DEPOSIT_PERIOD,
        });
        const contrast = clamp((field - 0.5) * 3 + 0.5, 0, 1);
        weight *= Math.exp(DEPOSIT_CLUMP[id] * (contrast - 0.5) * 2.5);
        weight *= 0.92 + jitter() * 0.16;
      }
      score[p * k + r] = weight;
    }
  });
  return score;
}

/**
 * Kotalı atama: skor türün kendi dağılımının üst dilimine bölünür ki kömürün
 * 2.6'sı ile güherçilenin 2.0'ı kıyaslanabilsin; çiftler en uygundan kotaya
 * kadar. `fill` true ise kotada açıkta kalan province en iyi türünü alır.
 */
function allocate(provinces, ids, score, share, fill) {
  const k = ids.length;
  const n = provinces.length;
  const reference = new Float64Array(k);
  for (let r = 0; r < k; r++) {
    const positive = [];
    for (let p = 0; p < n; p++) if (score[p * k + r] > 0) positive.push(score[p * k + r]);
    positive.sort((a, b) => a - b);
    reference[r] = positive.length ? positive[Math.floor((positive.length - 1) * 0.9)] : 1;
  }
  const pairs = [];
  for (let p = 0; p < n; p++) {
    for (let r = 0; r < k; r++) {
      const value = score[p * k + r];
      if (value > 0) pairs.push({ value: value / reference[r], p, r });
    }
  }
  pairs.sort((a, b) => b.value - a.value || a.p - b.p || a.r - b.r);
  const quota = ids.map((id) => Math.round(share[id] * n));
  const filled = new Int32Array(k);
  const choice = new Int32Array(n).fill(-1);
  for (const pair of pairs) {
    if (choice[pair.p] >= 0 || filled[pair.r] >= quota[pair.r]) continue;
    choice[pair.p] = pair.r;
    filled[pair.r]++;
  }
  if (fill) {
    // Kota dolunca açıkta kalan: kendi en uygun türü (yoksa gıda — buz ve
    // zirve province'i bile bir şey çıkarır).
    for (let p = 0; p < n; p++) {
      if (choice[p] >= 0) continue;
      let best = 0;
      let bestValue = -1;
      for (let r = 0; r < k; r++) {
        const value = score[p * k + r] / reference[r];
        if (value > bestValue) { best = r; bestValue = value; }
      }
      choice[p] = bestValue > 0 ? best : ids.indexOf('FOOD');
    }
  }
  return choice;
}

/**
 * Province kaynaklarını atar, her province'in kaynak satırlarını ve toprak
 * verimini kurar. Deterministik; `world.provinces` hazır olmalı.
 */
export function assignDeposits(world) {
  const provinces = (world.provinces ?? []).filter((province) => province.tileIdx?.length);
  const primary = allocate(provinces, DEPOSIT_IDS,
    scoreProvinces(world, provinces, DEPOSIT_IDS), PRIMARY_SHARE, true);
  const era = allocate(provinces, ERA_DEPOSIT_IDS,
    scoreProvinces(world, provinces, ERA_DEPOSIT_IDS), ERA_SHARE, false);
  const linesOf = new Map();
  provinces.forEach((province, p) => {
    const mainId = DEPOSIT_IDS[primary[p]];
    const eraId = era[p] >= 0 ? ERA_DEPOSIT_IDS[era[p]] : null;
    const main = { id: mainId, hexes: 0, size: 0 };
    const extra = eraId ? { id: eraId, hexes: 0, size: 0, era: true } : null;
    for (const idx of province.tileIdx) {
      const tile = world.tiles[idx];
      const quality = makeRng(`${world.seed}-quality-${tile.q}:${tile.r}`).range(0.85, 1.15);
      tile.resourceQuality = quality;
      main.hexes++;
      main.size += quality;
      // Çağ kaynağı yalnız ona uygun karelerde yatar: haritada petrol sahası
      // province'in çöl/kıyı lekesi olarak görünür, bütün province değil.
      if (extra && (DEPOSIT_TERRAIN[eraId][tile.terrain.id] ?? 0) > 0) {
        extra.hexes++;
        extra.size += quality;
        tile.resource = eraId;
      } else {
        tile.resource = mainId;
      }
    }
    linesOf.set(province.id, extra?.hexes ? [main, extra] : [main]);
  });

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
    const lines = linesOf.get(province.id) ?? [];
    Object.defineProperty(province, 'fertility', {
      value: fertility, enumerable: false, writable: true, configurable: true,
    });
    Object.defineProperty(province, 'deposits', {
      value: lines, enumerable: false, writable: true, configurable: true,
    });
  }
}

/** Province'in kaynak satırları: önce ana kaynak, varsa çağ kaynağı (atanmamışsa boş). */
export function depositsOf(province) {
  return province?.deposits ?? [];
}

/** Province'in ana kaynağı ya da null. */
export function primaryDepositOf(province) {
  return depositsOf(province)[0]?.id ?? null;
}

/** Toprak verimi (1 = dünya ortalaması). */
export function fertilityOf(province) {
  return province?.fertility ?? 1;
}
