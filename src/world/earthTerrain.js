// EARTH arazi kuralı: hex başına ham ölçü → oyunun arazi tipi, yüksekliği,
// sıcaklığı ve nemi.
//
// Ölçü (src/world/earth/*.js): ortalama yükseklik ya da deniz derinliği,
// engebe (hex içindeki p90−p10 yükseklik farkı), 1901–1930 Köppen iklimi, buz.
//
// Prosedürel sınıflandırıcıyla (terrain.classify) AYNI eşikler kullanılır:
// dağ/tepe payını gerçek engebenin SIRALAMASI belirler, biyomu Köppen iklimi.
// Böylece dağ, tepe ve ova oranları oyunun dengelendiği dağılımda kalır (dünyanın
// ~%11'i dağ), ama dağ gerçek sıradağda, çöl gerçek çölde durur.
//
// Katman notu: saf veri dönüşümü; DOM'suz.

import { SEA_LEVEL, TERRAIN } from './terrain.js';

export const KOPPEN = [
  '', 'Af', 'Am', 'Aw', 'BWh', 'BWk', 'BSh', 'BSk', 'Csa', 'Csb', 'Csc', 'Cwa', 'Cwb', 'Cwc',
  'Cfa', 'Cfb', 'Cfc', 'Dsa', 'Dsb', 'Dsc', 'Dsd', 'Dwa', 'Dwb', 'Dwc', 'Dwd', 'Dfa', 'Dfb',
  'Dfc', 'Dfd', 'ET', 'EF',
];

/**
 * Sınıf başına tipik yıllık ortalama sıcaklık (°C) ve nem (0..1). Sıcaklık
 * oyun ölçeğine (T + 20) / 50 ile iner: tundra (−9 °C) 0.22'ye, buz kalkanı
 * 0'a, tropik 0.92'ye düşer — terrain.classify'ın 0.14/0.28/0.74 eşikleriyle
 * aynı kuşaklar. Nem, render'ın bitki örtüsü karışımını (terrainBake
 * vegetation) ve kıyı kumsalını besler.
 */
const CLIMATE = {
  Af: [26, 0.9], Am: [26, 0.8], Aw: [25, 0.55],
  BWh: [24, 0.06], BWk: [12, 0.1], BSh: [23, 0.24], BSk: [9, 0.26],
  Csa: [16, 0.4], Csb: [13, 0.5], Csc: [8, 0.5],
  Cwa: [20, 0.62], Cwb: [16, 0.6], Cwc: [10, 0.6],
  Cfa: [16, 0.66], Cfb: [10, 0.68], Cfc: [5, 0.72],
  Dsa: [9, 0.36], Dsb: [6, 0.4], Dsc: [1, 0.45], Dsd: [-6, 0.45],
  Dwa: [7, 0.52], Dwb: [3, 0.55], Dwc: [-4, 0.55], Dwd: [-12, 0.5],
  Dfa: [9, 0.58], Dfb: [5, 0.62], Dfc: [-2, 0.6], Dfd: [-11, 0.5],
  ET: [-9, 0.45], EF: [-25, 0.3],
};

// classify'ın yükseklik eşikleri, kara sıralamasının karesine çevrilmiş hâli
// (yükseklik = SEA_LEVEL + sıra² · (1 − SEA_LEVEL), worldgen ile aynı eğri).
const rankAt = (elevation) => Math.sqrt((elevation - SEA_LEVEL) / (1 - SEA_LEVEL));
/**
 * Kutup çölü: bu enlemin kuzeyindeki tundra (Kanada takımadaları, Taymır'ın
 * ucu, Svalbard, Severnaya Zemlya) 1900'de ıssızdır; buz sayılır, province
 * olmaz. Yoksa Miller'ın şişirdiği değersiz kıyılar onlarca province ve kopuk
 * doldurma devleti üretiyordu (audit:world -- --earth, 36 çekirdekli konfederasyon).
 */
const POLAR_DESERT_LAT = 72;
const PEAK_RANK = rankAt(0.94);
const MOUNTAIN_RANK = rankAt(0.88);
const HILL_RANK = rankAt(0.70);

/**
 * Dağlık puanı: engebe ağırlıklı. Yalnız yükseklik olsaydı Tibet ve And
 * yaylasının düz içi tek dev dağ bloğu olurdu (dağ province tohumu olmaz,
 * komşusuna katılır); yalnız engebe olsaydı 4.5 km'lik plato ova sayılırdı.
 */
export function ruggedness(elev, relief) {
  return relief + 0.25 * Math.max(0, elev - 500);
}

/** Orman mı otlak mı: ılıman ve soğuk iklimde engebeli ve kuzey hex ormandır. */
function temperateCover(k, relief, lat) {
  switch (k) {
    case 'Cfc': case 'Cwc': case 'Dsc': case 'Dsd': case 'Dwc': case 'Dwd': case 'Dfc': case 'Dfd':
      return TERRAIN.FOREST;
    case 'Dfb': case 'Dwb':
      return Math.abs(lat) > 56 || relief > 300 ? TERRAIN.FOREST : TERRAIN.GRASSLAND;
    case 'Cfb': case 'Cfa':
      return relief > 420 ? TERRAIN.FOREST : TERRAIN.GRASSLAND;
    default:
      return TERRAIN.GRASSLAND;
  }
}

function biome(k, relief, lat) {
  switch (k) {
    case 'Af': case 'Am': return TERRAIN.JUNGLE;
    case 'Aw': return TERRAIN.PLAINS;
    case 'BWh': case 'BWk': return TERRAIN.DESERT;
    case 'BSh': case 'BSk': return TERRAIN.PLAINS;
    case 'ET': return TERRAIN.TUNDRA;
    case 'EF': return TERRAIN.ICE;
    default: return temperateCover(k, relief, lat);
  }
}

/** Deniz derinliği (m) → oyun yüksekliği: sahanlık COAST, açık deniz OCEAN, havza DEEP_OCEAN. */
export function seaElevation(depth) {
  const d = Math.max(0, depth);
  if (d < 200) return SEA_LEVEL - 0.012 - (d / 200) * 0.03;
  if (d < 2200) return SEA_LEVEL - 0.052 - ((d - 200) / 2000) * 0.08;
  return SEA_LEVEL - 0.142 - Math.min(0.2, (d - 2200) / 30000);
}

/**
 * Bütün dünyayı sınıflandırır.
 * @param {object} m  n, land, elev (m; su için derinlik), relief (m), koppen, ice, lat
 * @param {object} [o] polarDesert: Earth kural sürümü 1'in kayıtları için kapatılır
 * @returns {{ terrain: object[], elevation: Float32Array, temperature: Float32Array, moisture: Float32Array }}
 */
export function classifyEarth(m, { polarDesert = true } = {}) {
  const { n } = m;
  const polarLat = polarDesert ? POLAR_DESERT_LAT : Infinity;
  const terrain = new Array(n);
  const elevation = new Float32Array(n);
  const temperature = new Float32Array(n);
  const moisture = new Float32Array(n);

  // Kara sıralaması: dağlık puanının göreli konumu.
  const scores = [];
  for (let i = 0; i < n; i++) if (m.land[i]) scores.push(ruggedness(m.elev[i], m.relief[i]));
  scores.sort((a, b) => a - b);
  const rank = (v) => {
    let lo = 0;
    let hi = scores.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (scores[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    return lo / Math.max(1, scores.length);
  };

  for (let i = 0; i < n; i++) {
    const lat = m.lat[i];
    if (!m.land[i]) {
      elevation[i] = seaElevation(m.elev[i]);
      const e = elevation[i];
      terrain[i] = e < SEA_LEVEL - 0.14 ? TERRAIN.DEEP_OCEAN : e < SEA_LEVEL - 0.05 ? TERRAIN.OCEAN : TERRAIN.COAST;
      // Deniz yüzeyi enlemle soğur; nem sabit (render suyu bundan boyamaz).
      temperature[i] = Math.max(0, Math.min(1, 1 - Math.pow(Math.abs(lat) / 90, 1.25)));
      moisture[i] = 0.6;
      continue;
    }
    const k = KOPPEN[m.koppen[i]] || 'Cfb';
    const [tC, wet] = CLIMATE[k];
    const lr = rank(ruggedness(m.elev[i], m.relief[i]));
    elevation[i] = SEA_LEVEL + lr * lr * (1 - SEA_LEVEL);
    temperature[i] = Math.max(0, Math.min(1, (tC + 20) / 50));
    moisture[i] = wet;

    let t;
    if (m.ice[i] || k === 'EF' || (k === 'ET' && lat >= polarLat)) t = TERRAIN.ICE;
    else if (lr > PEAK_RANK) t = temperature[i] < 0.45 ? TERRAIN.SNOW_PEAK : TERRAIN.MOUNTAIN;
    else if (lr > MOUNTAIN_RANK) t = TERRAIN.MOUNTAIN;
    else if (k === 'ET') t = TERRAIN.TUNDRA;
    else if (lr > HILL_RANK) t = TERRAIN.HILLS;
    else t = biome(k, m.relief[i], lat);
    terrain[i] = t;
  }
  return { terrain, elevation, temperature, moisture };
}
