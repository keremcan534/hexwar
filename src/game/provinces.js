// Province katmanı — TEK POP. Nüfus, kalkınma, binalar, uyum ve huzursuzluk
// world.provinces'teki kümelerin `econ` nesnesinde yaşar (sınıf, meslek, iş
// kadrosu yok; bkz. TASARIM.md §2).
//
// Temsil: her kümenin tek `econ` nesnesi vardır ve üye karelerin
// `tile.province` alanı AYNI nesneye işaret eder (paylaşılan referans). Kare
// döngüsüyle TOPLAYAN her yer üye sayısı kadar çift sayar — toplayıcılar
// world.provinces üzerinden dolaşır.

import { makeRng } from '../core/rng.js';
import { lawOption } from './laws.js';
import { mod } from './modifiers.js';
import { controllerOf } from './control.js';
import { DEFAULT_ZONE, ZONE_RULES } from '../world/macro.js';
import { CULTURE, isAccepted, runProvinceCulture } from './culture.js';
import { POPULATION_SCALE } from './populationScale.js';
import { assignDeposits } from './econ/deposits.js';
import { BUILDING_IDS, DEVELOPMENT_MAX, POP_UNIT } from './econ/defs.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** 25 yıl elde tutulan province çekirdek olur (Victoria 2 kuralı). */
export const CORE_WEEKS = 1300;

/**
 * Nüfus gürültüsü. Şablon (ZONE_RULES.popMul) bölgenin ROLÜNÜ verir; bölge
 * çarpanı tohum başına ±%10, küme çarpanı lognormal σ = 0.35 (ortalaması
 * korunur). İkisi de tohum ve küme merkezine bağlıdır.
 */
const POP_ZONE_JITTER = 0.10;
const POP_PROVINCE_SIGMA = 0.35;
function populationNoise(world, province) {
  const zone = province.zone ?? DEFAULT_ZONE;
  const zoneRng = makeRng(`${world.seed}-pop-zone-${zone}`);
  const zoneFactor = 1 + (zoneRng() * 2 - 1) * POP_ZONE_JITTER;
  const rng = makeRng(`${world.seed}-pop-${province.center.q}:${province.center.r}`);
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  const normal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const provinceFactor = Math.exp(POP_PROVINCE_SIGMA * normal)
    / Math.exp((POP_PROVINCE_SIGMA * POP_PROVINCE_SIGMA) / 2);
  return zoneFactor * provinceFactor;
}

/** Boş bina kaydı: her tür 0. */
export function emptyBuildings() {
  const out = {};
  for (const id of BUILDING_IDS) out[id] = 0;
  return out;
}

/**
 * Kümenin başlangıç durumu. Nüfus formülü eski kare formülünün üye
 * toplamıdır — dünya nüfusu (≈290 milyon) ve bölgelerin rolü korunur.
 *
 * Kalkınma bölgenin kuruluş gelişmişliğinden (yoğun batı 2, ova 0), kıyıdan
 * ve yoğunluktan gelir: 1836'nın sanayi çekirdekleri kalkınmış, iç bozkır
 * geri başlar. Başkent ayrıca +1 alır (bkz. economy.initEconomy).
 */
function initialProvinceEcon(world, province) {
  const members = province.tileIdx.map((idx) => world.tiles[idx]);
  let population = 0;
  let coastal = false;
  for (const tile of members) {
    const yields = tile.terrain.yields;
    const tileAg = yields.food >= 3 ? 2 : yields.food > 0 ? 1 : 0;
    const tileEx = Math.max(yields.timber, yields.iron) >= 2 ? 2
      : Math.max(yields.timber, yields.iron) > 0 ? 1 : 0;
    const tileCom = tile.coastal || yields.gold > 0 ? 1 : 0;
    population += 1800 + yields.food * 1200 + (tile.coastal ? 900 : 0)
      + (tileAg + tileEx + tileCom) * 450;
    if (tile.coastal) coastal = true;
  }
  const rule = ZONE_RULES[province.zone ?? DEFAULT_ZONE] ?? ZONE_RULES[DEFAULT_ZONE];
  population *= rule.popMul * POPULATION_SCALE * populationNoise(world, province);
  const density = Math.log2(Math.max(1, population) / 250000);
  const development = clamp(Math.round(
    1 + (rule.dev ?? 0) * 0.9 + (coastal ? 0.5 : 0) + clamp(density, -1, 2) * 0.6,
  ), 1, 5);
  return {
    population: Math.round(population),
    hexes: members.length,
    development,
    buildings: emptyBuildings(),
    // UYUM (0-100). Çekirdek dışı province vergi, asker ve sanayiyi bu oranda
    // verir; çekirdekte yalnız huzursuzluğu ve asimilasyonu besler.
    control: province.owner >= 0 ? 100 : 0,
    // Sahiplik saati: 25 yıl elde tutulan province çekirdek olur.
    ownedSince: -CORE_WEEKS,
    // Kültür sayaçları (culture.js). Kuruluşta sıfır: 1836 dünyası oturmuştur.
    unrest: 0,
    revoltWeeks: 0,
    // Silah altındaki insan. Nüfusun İÇİNDE durur: asker de vatandaştır.
    soldiers: 0,
  };
}

/** Eksik alanları tamamlar (kayıttan gelen econ'a da uygulanır). */
function ensureProvinceEcon(world, province) {
  const econ = province.econ;
  if (!econ) return null;
  if (!Number.isFinite(econ.development)) econ.development = 1;
  econ.development = clamp(econ.development, 1, DEVELOPMENT_MAX);
  const buildings = econ.buildings && typeof econ.buildings === 'object' ? econ.buildings : {};
  econ.buildings = { ...emptyBuildings(), ...buildings };
  if (!Number.isFinite(econ.control)) econ.control = province.owner >= 0 ? 100 : 0;
  if (!Number.isFinite(econ.ownedSince)) econ.ownedSince = -CORE_WEEKS;
  if (!Number.isFinite(econ.unrest)) econ.unrest = 0;
  if (!Number.isFinite(econ.revoltWeeks)) econ.revoltWeeks = 0;
  if (!Number.isFinite(econ.soldiers)) econ.soldiers = 0;
  if (!Number.isFinite(econ.hexes)) econ.hexes = province.tileIdx.length;
  return econ;
}

export function initProvinces(world) {
  world.forEach((tile) => { tile.province = null; });
  for (const province of world.provinces ?? []) {
    province.econ = initialProvinceEcon(world, province);
  }
  assignDeposits(world);
  for (const province of world.provinces ?? []) {
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

/** Yüklemede: yataklar yeniden türetilir, eksik alanlar dolar. */
export function ensureProvinces(world) {
  if ((world.provinces ?? []).some((province) => !province.deposits)) assignDeposits(world);
  for (const province of world.provinces ?? []) {
    if (!province.econ) province.econ = initialProvinceEcon(world, province);
    ensureProvinceEcon(world, province);
    for (const idx of province.tileIdx) world.tiles[idx].province = province.econ;
  }
}

// Oy sayımı karalaması: küme en çok 7 üyeli; Map kurmak haftada yüzlerce
// gereksiz tahsisti. Ömrü tek çağrıdır.
const voteOwnersScratch = [];
const voteCountsScratch = [];

/**
 * Kümenin hukuki sahibi üye çoğunluğundan türetilir. Sahip değişince
 * sahiplik saati sıfırlanır (çekirdek sayacı yeniden başlar).
 */
export function refreshProvinceOwner(world, province) {
  const owners = voteOwnersScratch;
  const counts = voteCountsScratch;
  let distinct = 0;
  for (let t = 0; t < province.tileIdx.length; t++) {
    const owner = world.tiles[province.tileIdx[t]].owner;
    let at = -1;
    for (let i = 0; i < distinct; i++) {
      if (owners[i] === owner) { at = i; break; }
    }
    if (at < 0) {
      owners[distinct] = owner;
      counts[distinct] = 1;
      distinct++;
    } else {
      counts[at]++;
    }
  }
  let winner = -1;
  let winnerVotes = -1;
  for (let i = 0; i < distinct; i++) {
    if (counts[i] > winnerVotes || (counts[i] === winnerVotes && owners[i] < winner)) {
      winner = owners[i];
      winnerVotes = counts[i];
    }
  }
  setProvinceOwner(world, province, winner);
  return winner;
}

/**
 * Hukuki sahip değişimi. Çekirdek saati (ownedSince) sahiple BİRLİKTE
 * sıfırlanır; sahibi doğrudan yazan barış devri, isyan ve kopuş yolları bunu
 * atlıyordu ve fethedilen küme kuruluş değeri (−1300) ile ANINDA çekirdek
 * oluyordu: tam vergi, tam insan gücü, uyum cezası yok (kayıt denetimi
 * yakaladı — yükleme saati sıfırladığı için iki koşu ayrışıyordu).
 */
export function setProvinceOwner(world, province, nationId) {
  if (province.owner !== nationId && province.econ && Number.isFinite(world.turn)) {
    province.econ.ownedSince = world.turn;
  }
  province.owner = nationId;
}

/** İşgal payı: sahibinden başkasının fiilen kontrol ettiği üye oranı. */
export function occupiedShareOf(world, province) {
  if (province.owner < 0) return 0;
  let occupied = 0;
  for (let t = 0; t < province.tileIdx.length; t++) {
    if (controllerOf(world.tiles[province.tileIdx[t]]) !== province.owner) occupied++;
  }
  return occupied / Math.max(1, province.tileIdx.length);
}

/**
 * Çekirdek mi? Dört yol (Victoria 2): üretimden gelen tarihî çekirdek,
 * çoğunluğu kabul edilmiş halk, ana kültürün ana yurdu, 25 yıl elde tutma.
 */
export function isCore(world, province, nationId = province?.owner) {
  if (!province || nationId < 0) return false;
  if (province.coreOf === nationId) return true;
  const nation = world.nations?.[nationId];
  if (!nation) return false;
  if (isAccepted(nation, province.culture)) return true;
  if (province.homeland >= 0 && province.homeland === nation.culture) return true;
  if (province.owner === nationId && province.econ
    && (world.turn ?? 0) - (province.econ.ownedSince ?? 0) >= CORE_WEEKS) return true;
  return false;
}

/**
 * Province'in devlete verdiği pay (0-1): vergi, insan gücü, sanayi ve kaynak
 * bununla çarpılır. Çekirdek tam, çekirdek dışı uyum oranında; işgal payı
 * kadar düşer. Haftalık runProvinces yazar; okuyan her yer `econ.status`.
 */
export function provinceStatus(world, province) {
  const econ = province?.econ;
  if (!econ || province.owner < 0) return 0;
  const base = isCore(world, province) ? 1 : 0.25 + 0.75 * clamp(econ.control, 0, 100) / 100;
  return base * (1 - occupiedShareOf(world, province));
}

/** Nüfus birimi (100 bin kişi); ekonomi formüllerinin ortak ölçeği. */
export function popUnits(econ) {
  return Math.max(0, econ?.population ?? 0) / POP_UNIT;
}

/** Toplam bina kademesi ve yuva tavanı (kalkınma + 1). */
export function buildingLevels(econ) {
  let total = 0;
  for (const id of BUILDING_IDS) total += econ?.buildings?.[id] ?? 0;
  return total;
}
export function buildingSlots(econ) {
  return Math.round(econ?.development ?? 1) + 1;
}

// Durum adları için hece tabloları: yönetim ekranlarının ilk sütunu okunur
// bir ad olmalı, koordinat değil.
const LAND_NAME_A = [
  'Aster', 'Bram', 'Cald', 'Dorn', 'Elm', 'Fen', 'Gar', 'Hald', 'Ilm', 'Jor',
  'Kesh', 'Lund', 'Mar', 'Norr', 'Oster', 'Pell', 'Quen', 'Rav', 'Sten', 'Tor',
  'Ulm', 'Vard', 'Wehr', 'Yar', 'Zel',
];
const LAND_NAME_B = [
  'mark', 'land', 'gau', 'thal', 'burg', 'stead', 'moor', 'vale', 'reach', 'holm',
  'wick', 'fell', 'heim', 'garde', 'ford',
];

/** Kareye bağlı, deterministik ad. */
export function provinceName(tile) {
  if (tile.city) return `${tile.city.name} Province`;
  const rng = makeRng(`province-name-${tile.q}:${tile.r}`);
  return rng.pick(LAND_NAME_A) + rng.pick(LAND_NAME_B);
}

export function provincePopulation(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ) total += province.econ.population;
  }
  return Math.round(total);
}

/** Bir ulusun silah altındaki toplam insanı (nüfusun içindedir). */
export function provinceSoldiers(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nationId && province.econ) total += province.econ.soldiers ?? 0;
  }
  return Math.round(total);
}

/**
 * Alayın bir province'ten TUTTUĞU insan sayısını artırır. Nüfusa dokunmaz:
 * askere alma bir insanı yok etmez, yalnızca ne iş yaptığını değiştirir.
 */
export function claimSoldiers(econ, men) {
  if (!econ || !(men > 0)) return;
  econ.soldiers = (econ.soldiers ?? 0) + men;
}

/** Tutulan insanları bırakır; `died` ise adam ölmüştür ve nüfustan da düşer. */
export function releaseSoldiers(econ, men, died = false) {
  if (!econ || !(men > 0)) return;
  econ.soldiers = Math.max(0, (econ.soldiers ?? 0) - men);
  if (died) econ.population = Math.max(0, (econ.population ?? 0) - men);
}

/**
 * Haftalık nüfus artışı. Taban yılda ~%0.6 (1836-1900 gerçeği ~1.5 kat);
 * gıda, tüketim malı, istikrar, barış ve kalkınma çarpar. Gıda oranı 0.7'nin
 * altına inerse KITLIK: nüfus erir.
 */
const GROWTH_BASE = 0.00012;
const FAMINE_THRESHOLD = 0.7;
const FAMINE_RATE = 0.0006;

export function growthRateOf(nation, econ, { peace = true, occupied = 0 } = {}) {
  const economy = nation?.economy;
  const food = economy?.resources?.FOOD?.ratio ?? 1;
  if (food < FAMINE_THRESHOLD) return -FAMINE_RATE * (FAMINE_THRESHOLD - food) / FAMINE_THRESHOLD;
  const foodFactor = food >= 1 ? 1 : (food - FAMINE_THRESHOLD) / (1 - FAMINE_THRESHOLD);
  const consumer = 0.7 + 0.3 * Math.min(1.2, economy?.consumer?.ratio ?? 1);
  const stability = 0.5 + clamp(nation?.stability ?? 0.5, 0, 1);
  const development = 1 + 0.05 * (econ?.development ?? 1);
  const law = 1 + (lawOption(nation, 'tax').growth ?? 0);
  const mods = Math.max(0.1, 1 + mod(nation, 'growth'));
  return GROWTH_BASE * foodFactor * consumer * stability * development * law * mods
    * (peace ? 1 : 0.6) * (1 - occupied);
}

// Barış durumu ulus başına bir kez (province başına bütün ulusları taramak
// O(küme × ulus) fazladan iş).
const atPeaceScratch = [];

export function runProvinces(game) {
  const world = game.world;
  const atPeace = atPeaceScratch;
  atPeace.length = world.nations.length;
  for (const nation of world.nations) {
    let peace = true;
    for (const other of world.nations) {
      if (!other.alive || other.id === nation.id) continue;
      if (world.relations?.[nation.id]?.[other.id]?.state === 'war') {
        peace = false;
        break;
      }
    }
    atPeace[nation.id] = peace;
    if (nation.economy) nation.economy.famineDeaths = 0;
  }

  const provinces = world.provinces ?? [];
  const recolored = [];
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    const econ = province.econ;
    if (!econ) continue;
    refreshProvinceOwner(world, province);
    if (province.owner < 0) {
      econ.status = 0;
      econ.core = false;
      continue;
    }
    const nation = world.nations[province.owner];
    if (!nation?.alive) continue;
    const occupied = occupiedShareOf(world, province);
    econ.core = isCore(world, province);
    econ.status = (econ.core ? 1 : 0.25 + 0.75 * clamp(econ.control, 0, 100) / 100) * (1 - occupied);
    if (occupied >= 1) {
      econ.control = clamp(econ.control - 2, 5, 100);
      continue;
    }
    const stability = clamp(nation.stability ?? 0.5, 0.1, 1);
    const citizenship = lawOption(nation, 'citizenship');
    const accepted = isAccepted(nation, province.culture);
    // UYUM TAVANI: kabul edilmiş halk tam oturur; azınlık vatandaşlık
    // yasasının izin verdiği kadar.
    const ceiling = accepted ? 100 : 100 * citizenship.ceiling;
    const drag = (econ.unrest ?? 0) * CULTURE.CONTROL_DRAG;
    econ.control = clamp(
      econ.control + (((accepted ? 1.5 : citizenship.control) * (0.45 + stability)) - drag)
        * (1 - occupied) - occupied * 2,
      0,
      ceiling,
    );

    const rate = growthRateOf(nation, econ, { peace: atPeace[nation.id], occupied });
    const before = econ.population;
    econ.population = Math.max(0, Math.round(before * (1 + rate)));
    if (econ.population < before && nation.economy) {
      nation.economy.famineDeaths += before - econ.population;
    }

    // KÜLTÜR: huzursuzluk birikir, asimilasyon payları kaydırır. İsyan
    // halk halk bir HAREKETTİR ve bu döngünün dışında ilerler.
    const culture = runProvinceCulture(world, province, nation, {
      occupied, turn: game.turns.turn,
    });
    if (culture.recolored) recolored.push(province);
  }
  if (recolored.length) {
    const tiles = [];
    for (const province of recolored) {
      for (const idx of province.tileIdx ?? []) tiles.push(world.tiles[idx]);
    }
    game.renderer.invalidateTiles(tiles.filter(Boolean));
  }
  for (const nation of world.nations) nation.provinces = 0;
  for (let p = 0; p < provinces.length; p++) {
    const province = provinces[p];
    if (province.owner >= 0 && world.nations[province.owner]) {
      world.nations[province.owner].provinces++;
    }
  }
  game.emit('provinces', null);
}
