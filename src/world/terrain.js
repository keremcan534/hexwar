// Arazi tipleri tek yerde tanımlı: renk, hareket maliyeti, verimlilik.
// Yeni tip eklemek istersen sadece burayı genişlet.
//
// İki ayrı geçilebilirlik var: `passable` kara birimleri, `navigable` deniz
// yolu içindir. Kara birimi denize girince "bindirilmiş" (embarked) sayılır.
//
// `yield` bir işçinin o kareden çıkardığıdır (docs/tasarim.md). Dağ geçilmez
// ama işlenebilir: demirin ana kaynağı orasıdır.

/** Boş verim; eksik alan yazmamak için taban olarak kullanılır. */
const NO_YIELD = { food: 0, timber: 0, iron: 0, gold: 0 };
const y = (partial) => ({ ...NO_YIELD, ...partial });

export const TERRAIN = {
  DEEP_OCEAN: {
    id: 'DEEP_OCEAN', name: 'Deep Ocean', color: '#0a1a24',
    // Açık deniz pahalı: kıyı boyu seyretmek okyanusu kesmekten ucuz olsun.
    water: true, passable: false, navigable: true, seaCost: 2,
    moveCost: Infinity, defense: 0, yields: y({ food: 1, gold: 1 }),
  },
  OCEAN: {
    id: 'OCEAN', name: 'Ocean', color: '#0e2430',
    water: true, passable: false, navigable: true, seaCost: 1,
    moveCost: Infinity, defense: 0, yields: y({ food: 1, gold: 1 }),
  },
  COAST: {
    id: 'COAST', name: 'Shallow Water', color: '#14313d',
    water: true, passable: false, navigable: true, seaCost: 1,
    moveCost: Infinity, defense: 0, yields: y({ food: 2, gold: 1 }),
  },
  BEACH: {
    id: 'BEACH', name: 'Beach', color: '#d9c489',
    water: false, passable: true, moveCost: 1, defense: 0,
    yields: y({ food: 1, gold: 1 }),
  },
  DESERT: {
    id: 'DESERT', name: 'Desert', color: '#d7b667',
    water: false, passable: true, moveCost: 1, defense: 0, yields: y({}),
  },
  PLAINS: {
    id: 'PLAINS', name: 'Plains', color: '#8fae55',
    water: false, passable: true, moveCost: 1, defense: 0,
    yields: y({ food: 2, gold: 1 }),
  },
  GRASSLAND: {
    id: 'GRASSLAND', name: 'Grassland', color: '#71a04a',
    water: false, passable: true, moveCost: 1, defense: 0, yields: y({ food: 3 }),
  },
  FOREST: {
    id: 'FOREST', name: 'Forest', color: '#3f7442',
    water: false, passable: true, moveCost: 2, defense: 0.25,
    yields: y({ food: 1, timber: 3 }),
  },
  JUNGLE: {
    id: 'JUNGLE', name: 'Jungle', color: '#2f6b39',
    water: false, passable: true, moveCost: 2, defense: 0.25,
    yields: y({ food: 1, timber: 2 }),
  },
  HILLS: {
    id: 'HILLS', name: 'Hills', color: '#8a8a55',
    water: false, passable: true, moveCost: 2, defense: 0.35,
    yields: y({ food: 1, iron: 2 }),
  },
  MOUNTAIN: {
    id: 'MOUNTAIN', name: 'Mountain', color: '#7d7268',
    water: false, passable: false, moveCost: Infinity, defense: 0.6,
    yields: y({ iron: 3 }),
  },
  SNOW_PEAK: {
    id: 'SNOW_PEAK', name: 'Snowy Peak', color: '#e6e8ea',
    water: false, passable: false, moveCost: Infinity, defense: 0.6,
    yields: y({ iron: 1 }),
  },
  TUNDRA: {
    id: 'TUNDRA', name: 'Tundra', color: '#9aa48c',
    water: false, passable: true, moveCost: 1, defense: 0, yields: y({ food: 1 }),
  },
  ICE: {
    id: 'ICE', name: 'Ice Sheet', color: '#dfe9ef',
    water: false, passable: false, moveCost: Infinity, defense: 0, yields: y({}),
  },
};

/**
 * Politik harita kipinde arazinin ülke rengine kattığı parlaklık.
 * Ülke rengiyle araziyi *karıştırmak* yerine ülke renginin açıklığını arazi
 * kadar oynatıyoruz; böylece bir ülke her arazide aynı renk olarak okunur ama
 * dağ/orman/ova ayrımı yine görünür.
 */
export const TERRAIN_SHADE = {
  SNOW_PEAK: 1.34, ICE: 1.32, DESERT: 1.2, BEACH: 1.16, TUNDRA: 1.1,
  PLAINS: 1.04, GRASSLAND: 1, HILLS: 0.9, FOREST: 0.8, JUNGLE: 0.74,
  MOUNTAIN: 0.68,
};

export function terrainShade(terrain) {
  return TERRAIN_SHADE[terrain.id] ?? 1;
}

/** Şehir merkezinin bedava verimi: işçi harcanmadan gelir. */
export const CITY_CENTER_YIELD = { food: 2, timber: 1, iron: 0, gold: 1 };

export const RESOURCES = ['gold', 'food', 'timber', 'iron'];

export const SEA_LEVEL = 0.42;

/**
 * Yükseklik + nem + sıcaklıktan arazi tipi seçer.
 * elevation, moisture, temperature: 0..1
 */
export function classify(elevation, moisture, temperature) {
  if (elevation < SEA_LEVEL - 0.14) return TERRAIN.DEEP_OCEAN;
  if (elevation < SEA_LEVEL - 0.05) return TERRAIN.OCEAN;
  if (elevation < SEA_LEVEL) return TERRAIN.COAST;

  if (elevation > 0.94) return temperature < 0.45 ? TERRAIN.SNOW_PEAK : TERRAIN.MOUNTAIN;
  if (elevation > 0.88) return TERRAIN.MOUNTAIN;

  if (temperature < 0.14) return TERRAIN.ICE;
  if (temperature < 0.28) return TERRAIN.TUNDRA;

  if (elevation > 0.70) return TERRAIN.HILLS;

  // Kurak + ılık her enlemde çöl olabilir (at enlemleri kuşağı).
  if (moisture < 0.28 && temperature > 0.5) return TERRAIN.DESERT;

  if (temperature > 0.74) {
    if (moisture > 0.58) return TERRAIN.JUNGLE;
    return TERRAIN.PLAINS;
  }

  if (moisture < 0.3) return TERRAIN.PLAINS;
  if (moisture > 0.5) return TERRAIN.FOREST;
  return TERRAIN.GRASSLAND;
}
