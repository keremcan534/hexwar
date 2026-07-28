// Şehirler ve ekonomi. Şehirler gelir üretir, birim satın alma noktasıdır,
// düşman birimi girdiğinde el değiştirir.

import { hexDistance, hexesInRange } from '../core/hex.js';

/** Yeni şehir kurma bedeli (altın) ve şehirler arası asgari mesafe. */
export const CITY_COST = 80;
export const CITY_MIN_DISTANCE = 4;

/** Birim satın alma bedelleri. */
export const UNIT_PRICES = {
  SCOUT: 20,
  INFANTRY: 35,
  CAVALRY: 55,
  WARSHIP: 45,
};

const NAME_A = ['Ak', 'Kara', 'Gök', 'Yeni', 'Eski', 'Tuz', 'Demir', 'Alt', 'Yüce', 'Kızıl'];
const NAME_B = ['şehir', 'kale', 'liman', 'köprü', 'geçit', 'burç', 'ova', 'tepe', 'pınar', 'sur'];

export function cityName(rng, used) {
  for (let i = 0; i < 40; i++) {
    const name = rng.pick(NAME_A) + rng.pick(NAME_B);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  return `Şehir-${used.size + 1}`;
}

export function createCity(world, tile, nationId, name, level = 1) {
  const city = { id: world.cities.length + 1, name, tile, nationId, level };
  tile.city = city;
  world.cities.push(city);
  return city;
}

/** Bir karede şehir kurulabilir mi? (kendi toprağın, karada, şehirlerden uzakta) */
export function canFoundCity(world, tile, nationId) {
  if (!tile || tile.city || !tile.terrain.passable || tile.owner !== nationId) return false;
  return world.cities.every(
    (c) => hexDistance(c.tile.q, c.tile.r, tile.q, tile.r) >= CITY_MIN_DISTANCE,
  );
}

/** Birim başına tur bakım gideri. Sonsuz ordu birikmesini engeller. */
export const UNIT_UPKEEP = 2;

/**
 * Büyüyen imparatorluğun verim kaybı (yolsuzluk/mesafe).
 * Olmazsa ilk fetheden ülke katlanarak büyüyüp oyunu 100. turda bitiriyor.
 */
function corruption(cityCount) {
  return 12 / (12 + Math.max(0, cityCount - 1));
}

/**
 * Ulusun tur bütçesi: şehirler ana kaynak, topraktan gelen verim ikincil,
 * ordunun bakımı gider. Tek yerde durması denge ayarını kolaylaştırır.
 * @returns {{ gross: number, upkeep: number, net: number }}
 */
export function nationBudget(world, nation) {
  let gold = 0;
  let cityCount = 0;
  for (const city of world.cities) {
    if (city.nationId !== nation.id) continue;
    cityCount++;
    gold += 2 + city.level * 2;
  }
  let fertility = 0;
  world.forEach((t) => {
    if (t.owner === nation.id) fertility += t.terrain.fertility;
  });

  // Katsayı düşük tutuldu: birim almak gerçek bir tercih olsun, her tur bedava olmasın.
  const gross = Math.round((gold + fertility * 0.05) * corruption(cityCount));
  let army = 0;
  for (const u of world.units) if (u.nationId === nation.id) army++;
  const upkeep = army * UNIT_UPKEEP;
  return { gross, upkeep, net: gross - upkeep };
}

/** Şehir el değiştirir; çevresindeki kareler de yeni sahibe geçer. */
export function captureCity(game, city, nationId) {
  const world = game.world;
  const old = city.nationId;
  city.nationId = nationId;
  for (const { q, r } of hexesInRange(city.tile.q, city.tile.r, 1)) {
    const t = world.get(q, r);
    if (t) game.turns.claim(t, nationId);
  }
  return old;
}
