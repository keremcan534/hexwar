// Şehirler: adlı yerleşimler. Başkent ve kentler alayın doğduğu yer, kuşatma
// hedefi, teslim (zafer puanı) ve prestij kaynağıdır. Ekonominin motoru
// DEĞİLDİR artık — işçi kareleri ve şehir altını kalktı (bkz. TASARIM.md);
// şehrin boyu bulunduğu province'in nüfusundan okunur.

import { RECRUIT_GOLD } from './econ/defs.js';
import { settle } from './treasury.js';

/** Alay kuruluş bedeli (altın). Asıl bedel teçhizat ve insan gücüdür. */
export const UNIT_COSTS = Object.fromEntries(
  Object.entries(RECRUIT_GOLD).map(([id, gold]) => [id, { gold }]),
);

export function canAfford(nation, cost) {
  return (nation?.gold ?? 0) >= (cost?.gold ?? 0);
}

/** Altını TEK KAPIDAN öder (treasury.settle); yetmiyorsa hiçbir şey yapmaz. */
export function pay(nation, cost, line = 'outlay') {
  if (!canAfford(nation, cost)) return false;
  if (cost?.gold) settle(nation, line, -cost.gold);
  return true;
}

export function formatCost(cost) {
  return cost?.gold ? `${cost.gold} gold` : '';
}

const NAME_A = ['White', 'Black', 'Blue', 'New', 'Old', 'Salt', 'Iron', 'High', 'Grand', 'Red'];
const NAME_B = ['haven', 'keep', 'port', 'bridge', 'pass', 'watch', 'field', 'hill', 'spring', 'wall'];
/** Ikinci havuz: ilk yuz ad bitince sirayla (bkz. cityName). */
const NAME_C = ['Green', 'Stone', 'Gold', 'Silver', 'Ash', 'Oak', 'Elm', 'Fair', 'Long', 'North'];
const NAME_D = ['ford', 'gate', 'mouth', 'mere', 'wick', 'stead', 'dale', 'moor', 'burgh', 'march'];
const LEGACY_NAME_A = new Map([
  ['Ak', 'White'], ['Kara', 'Black'], ['Gök', 'Blue'], ['Yeni', 'New'], ['Eski', 'Old'],
  ['Tuz', 'Salt'], ['Demir', 'Iron'], ['Alt', 'High'], ['Yüce', 'Grand'], ['Kızıl', 'Red'],
]);
const LEGACY_NAME_B = new Map([
  ['şehir', 'haven'], ['kale', 'keep'], ['liman', 'port'], ['köprü', 'bridge'],
  ['geçit', 'pass'], ['burç', 'watch'], ['ova', 'field'], ['tepe', 'hill'],
  ['pınar', 'spring'], ['sur', 'wall'],
]);

export function cityName(rng, used) {
  for (let i = 0; i < 40; i++) {
    const name = rng.pick(NAME_A) + rng.pick(NAME_B);
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
  }
  // Rastgele deneme havuz dolmadan pes ediyordu ve 66 ulkeli standart dunya
  // "City-101" gibi adlarla doluyordu (Open Beta 4, B-13). Kalan havuz sirayla
  // taranir (RNG tuketmez, eski tohumlarin dizilimi degismez), sonra ikinci
  // havuz; ancak ikisi de bitince numara.
  for (const a of NAME_A) {
    for (const b of NAME_B) {
      const name = a + b;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  }
  for (const a of NAME_C) {
    for (const b of NAME_D) {
      const name = a + b;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
    }
  }
  return `City-${used.size + 1}`;
}

/** Eski Türkçe kayıtlardaki şehir adlarını oyuncuya İngilizce gösterir. */
export function englishCityName(name) {
  const numbered = /^Şehir-(\d+)$/.exec(name);
  if (numbered) return `City-${numbered[1]}`;
  for (const [oldPrefix, prefix] of LEGACY_NAME_A) {
    if (!name.startsWith(oldPrefix)) continue;
    const suffix = LEGACY_NAME_B.get(name.slice(oldPrefix.length));
    if (suffix) return prefix + suffix;
  }
  return name;
}

export function createCity(world, tile, nationId, name, level = 1, pop = 2) {
  const city = {
    id: world.cities.length + 1,
    name,
    tile,
    nationId,
    level,          // tahkimat kademesi: savunma ve çizim
    pop,            // boy: province nüfusundan (refreshCities)
  };
  tile.city = city;
  world.cities.push(city);
  return city;
}

/** Şehir boyu province nüfusundan (çizim ve prestij için): 100 bin kişi başına 1. */
export const CITY_MAX_POP = 20;

export function refreshCities(world) {
  for (const city of world.cities ?? []) {
    const population = city.tile?.province?.population ?? 0;
    city.pop = Math.max(1, Math.min(CITY_MAX_POP, Math.round(population / 100000)));
  }
}
