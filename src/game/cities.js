// Şehirler ve ekonomi. Şehirler gelir üretir, birim satın alma noktasıdır,
// düşman birimi girdiğinde el değiştirir.

import { CITY_CENTER_YIELD, RESOURCES } from '../world/terrain.js';
import { tileEfficiency } from './infamy.js';
import { provinceOutput } from './provinces.js';
import { regimentCount, upkeepWeight } from './units.js';
import { controllerOf } from './control.js';
import { settle } from './treasury.js';

/** Yeni şehir kurma bedeli ve şehirler arası asgari mesafe. */
export const CITY_COST = { gold: 60 };
export const CITY_MIN_DISTANCE = 4;

/** Şehrin işçi yerleştirebileceği yarıçap. */
export const WORK_RADIUS = 2;

/**
 * Birim bedelleri. Altın tek darboğaz olmasın diye maliyet dört kaynağa
 * bölündü; İzci kasten demirsiz, demirsiz doğan ülke kilitlenmesin.
 */
export const UNIT_COSTS = {
  INFANTRY: { gold: 25 },
  CAVALRY: { gold: 40 },
  ARTILLERY: { gold: 55 },
  WARSHIP: { gold: 30 },
  ARMOR: { gold: 90 },
  AIRCRAFT: { gold: 80 },
};

/** Birim başına tur bakımı. Ordunun asıl freni artık erzak. */
// Altin bakimi 1 -> 1.4: ordu gercek bir butce kalemi olsun. Eski deger
// 27 alaylik bir imparatorluga haftada 27 altina mal oluyordu, yani 198
// altinlik gelirin %14'u — "ordu mu okul mu" diye bir soru dogmuyordu.
export const UNIT_UPKEEP = { gold: 1.4, food: 1 };

/**
 * Ağır birimlerin demir gideri. Ölçümde demirin hiç sürekli gideri yoktu:
 * üretilip ambar tavanında ziyan oluyordu. Zırhlı birlik ve donanma artık
 * demir yer, böylece demir stratejik bir kısıt hâline gelir.
 */
export const IRON_UPKEEP_TYPES = { CAVALRY: 1, ARTILLERY: 2, WARSHIP: 1 };

/** İşçi başına tüketim. İşçi net katkısı azalsın ki nüfus sonsuz büyümesin. */
export const WORKER_FOOD = 2;

export function emptyPool() {
  return { gold: 0, food: 0, timber: 0, iron: 0 };
}

export function canAfford(nation, cost) {
  return Object.entries(cost ?? {}).every(
    ([resource, amount]) => (nation[resource] ?? 0) >= amount,
  );
}

export function pay(nation, cost, line = 'outlay') {
  if (!canAfford(nation, cost)) return false;
  for (const [resource, amount] of Object.entries(cost ?? {})) {
    // ALTIN TEK KAPIDAN. Bu dongu eskiden altini da dogrudan dususuyordu ve
    // hicbir `.gold -=` aramasi burayi bulamiyordu — 27 hazine yazicisindan
    // gorunmeyeni tam olarak buydu.
    if (resource === 'gold') settle(nation, line, -amount);
    else nation[resource] -= amount;
  }
  return true;
}

export function formatCost(cost) {
  const parts = [];
  if (cost.gold) parts.push(`${cost.gold}⬤`);
  if (cost.iron) parts.push(`${cost.iron}⛏`);
  if (cost.timber) parts.push(`${cost.timber}🪵`);
  return parts.join(' ');
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
    pop,            // işçi sayısı: ekonominin motoru
    // Nüfusun etnik bileşimi. Şehir el değiştirince **değişmez**: fethedilen
    // toprakta yabancı halkla yaşamak zorunda kalmak tasarımın çekirdeği.
    pops: { [tile.culture]: pop },
    worked: [],     // işlenen kareler; uzunluğu pop kadar
    // foodStore kaldirildi: yazilan ama hicbir sistemin okumadigi olu alandi
    // (olculdu: 300 hafta boyunca butun sehirlerde baslangic degerinde kaldi).
    manualWorkers: false, // elle atama geldiğinde otomatik dağıtımı kilitler
  };
  tile.city = city;
  world.cities.push(city);
  return city;
}

/**
 * Şehir nüfusunun tavanı ve büyüme hızı.
 *
 * Şehirler yüz yıl boyunca kurulduğu boyutta (pop 2) donuyordu. Sonucu iki
 * ayrı semptomdu: prestij puanı hiç artmıyor (şehir puanı `pop`'a bağlı) ve
 * ham üretim hiç artmıyor (işlenen kare sayısı = `pop`). Geç oyunda büyüyen
 * tek eksen sanayi kalıyordu.
 *
 * Büyümeyi `standardOfLiving`'e bağlamak ikisini birden çözer ve o güne dek
 * yalnız ekranda duran, hiçbir şeyi etkilemeyen sayıyı oyuna sokar. Hız,
 * yüzyıl boyunca 2'den ~15'e çıkacak şekilde seçildi.
 */
export const CITY_MAX_POP = 20;
const CITY_GROWTH_RATE = 0.0006;

/**
 * Refah şehri büyütür. economy.js buradan import ediyor, tersi katman
 * döngüsü olurdu; bu yüzden yaşam standardı doğrudan veriden okunur
 * (aynı kalıp provinces.js'te de var).
 */
export function growCities(world) {
  for (const city of world.cities) {
    const nation = world.nations[city.nationId];
    if (!nation?.alive || controllerOf(city.tile) !== city.nationId) continue;
    if (city.pop >= CITY_MAX_POP) continue;
    const living = nation.economy?.standardOfLiving ?? 0;
    const food = nation.budget?.net?.food ?? 0;
    // Yoksulluk ve kıtlık büyümeyi durdurur: şehir beslenemediği kadar büyümez.
    if (living <= 10 || food < 0) continue;
    city.growth = (city.growth ?? 0) + (living - 10) * CITY_GROWTH_RATE * (food > 2 ? 1 : 0.5);
    if (city.growth < 1) continue;
    city.growth -= 1;
    city.pop++;
    // Yeni gelenler çevredeki kırdan gelir: şehrin bulunduğu karenin kültürü.
    const culture = city.tile.culture;
    city.pops[culture] = (city.pops[culture] ?? 0) + 1;
  }
}

/** Bir karede şehir kurulabilir mi? (kendi toprağın, karada, şehirlerden uzakta) */
export function canFoundCity(world, tile, nationId) {
  if (!tile || tile.city || !tile.terrain.passable || tile.owner !== nationId
    || controllerOf(tile) !== nationId) return false;
  return world.cities.every(
    (c) => world.wrapDistance(c.tile.q, c.tile.r, tile.q, tile.r) >= CITY_MIN_DISTANCE,
  );
}

/**
 * Büyüyen imparatorluğun verim kaybı (yolsuzluk/mesafe). Yalnız altına uygulanır;
 * erzak/kereste/demir fiziksel mallar, onları mesafe değil taşıma sınırlar.
 * Not: kültür ve infamy katmanı gelince bu elle konmuş fren kaldırılacak.
 */
function corruption(cityCount, nation) {
  const base = 12;
  return base / (base + Math.max(0, cityCount - 1));
}

/** Baskent bedava yonetilir; ikinci sehirden itibaren aygit buyur. */
const ADMIN_FREE_CITIES = 1;
/** Başkente bu mesafeden uzak şehir ayrıca idari yük getirir. */
const ADMIN_FREE_DISTANCE = 6;

/**
 * IDARI GIDER — imparatorlugun otomatik bedeli.
 *
 * Bu artik bir kaydirac DEGILDIR. Eski `adminFunding` olculdu: butun menzili
 * (30-100) hazineyi %0.6 oynatiyordu, yani gurultu tabaninin 85 kati altinda,
 * ve butun YZ ulkeleri istisnasiz %100'de oturuyordu — tek dogru cevabi olan
 * bir secim, yani secim degil. Kaldirac gitti, GIDER kaldi.
 *
 * Sekil bilerek KADEMELI: uc terim de imparatorlugun olcegine baglidir ama
 * sehir sayisi superdogrusaldir. Boylece tek sehirli minor devlet neredeyse
 * hic odemez (olculdu: gelirinin ~%12'si), alti sehirli imparatorluk
 * gelirinin dortte birini yonetime verir. Buyumenin gorunur bir bedeli olur
 * ve "her seyi ayni anda maksimize etme" secenegi kendiliginden kapanir.
 *
 * Uc girdi, hepsi oyuncunun ekranda gordugu seyler: sehir, tasra, nufus.
 */
// Kalibrasyon notu: ilk deneme (3.2 / 0.03 / 2.2) DUNYAYI FAKIRLESTIRDI —
// medyan gelir 29.6'dan 15.5'e dustu, cunku nufus terimi ve ordu bakimi
// birinci haftadan itibaren HERKESI vergilendiriyordu ve kimse buyuyemiyordu.
// Gider OLCEGI cezalandirmali, varolmayi degil: agirlik sehir sayisina
// (superdogrusal) kaydirildi, nufus ve tasra terimleri kucultuldu. Boylece
// tek sehirli minor gelirinin ~%5'ini, alti sehirli imparatorluk ~%30'unu oder.
// UC KALIBRASYON DENEMESI YAPILDI, IKISI GERI ALINDI — kayit icin:
//   (a) 3.2 / 0.03 / 2.2 + ordu 1.8: dunyayi fakirlestirdi, medyan gelir
//       29.6'dan 15.5'e dustu; nufus terimi birinci haftadan itibaren
//       HERKESI vergilendiriyor, kimse buyuyemiyordu.
//   (c) 4.0 / 0.05 / 1.5 (^0.85): daha da kotu. Nufus agirlikli gider buyuk
//       ekonomileri cokertti (bir ulke 249.7 gelirden 37.0'a dustu) ve 300.
//       haftada temerrutler basladi.
// Kalan (b) secildi: agirlik superdogrusal SEHIR teriminde, nufus ve tasra
// hafif. Dunya saglikli kaliyor, imparatorluk gelirinin ~%25'ini yonetime
// veriyor. Bilinen artik: cok nufuslu ama az sehirli ulke sekli hala
// gelirinin altinda gider oduyor (bkz. rapor "Bilinen sorunlar").
const ADMIN_CITY_RATE = 4.0;
const ADMIN_PROVINCE_RATE = 0.02;
const ADMIN_POPULATION_RATE = 0.8;

function administrationCost(cityCount, provinceCount, distanceLoad, population = 0) {
  const cities = Math.max(0, cityCount - ADMIN_FREE_CITIES) ** 1.6 * ADMIN_CITY_RATE;
  const provinces = Math.max(0, provinceCount) * ADMIN_PROVINCE_RATE;
  // Nufus terimi ALTDOGRUSAL: kalabalik ulke daha fazla oder ama nufusla
  // birebir degil, yoksa 1.9M nufuslu tek ulke tek basina iflas ederdi.
  const people = (Math.max(0, population) / 100000) ** 0.75 * ADMIN_POPULATION_RATE;
  return Math.round((cities + provinces + distanceLoad + people) * 10) / 10;
}

/**
 * Bir karenin bir işçiye verdiği üretim. Taze işgal ve yabancı halk verim
 * kaybettirir (bkz. infamy.js), o yüzden bağlam gerekir.
 */
export function tileYield(tile, ctx) {
  const base = tile.terrain.yields;
  if (!ctx) return base;

  // Ülke nesnesi geçilir: kabul edilen kültürler tam verimle çalışır.
  const factor = tileEfficiency(tile, ctx.nation ?? ctx.culture, ctx.turn);
  if (factor === 1) return base;
  return {
    food: base.food * factor,
    timber: base.timber * factor,
    iron: base.iron * factor,
    gold: base.gold * factor,
  };
}

/** Şehrin sahibine göre üretim bağlamı. */
function cityContext(world, city) {
  const nation = world?.nations?.[city.nationId] ?? null;
  return {
    nation,
    culture: nation?.culture ?? -1,
    turn: world?.turn ?? 0,
  };
}

/**
 * Şehrin işçilerini çevresindeki en iyi karelere dağıtır.
 * Ağırlıklar ulusun o anki açığına göre gelir: erzak eksiyse tarlaya,
 * demir bitmişse madene yönelir. Elle atama kilidi varsa dokunmaz.
 */
// assignWorkers'in karalama depolari (bkz. icindeki not); omru tek cagri.
const workerCandidatesScratch = [];
const workerRowPool = [];

export function assignWorkers(world, city, weights) {
  if (city.manualWorkers) {
    // Elle atanmış kareler sahiplik değişmediyse korunur.
    city.worked = city.worked.filter((t) => t.owner === city.nationId
      && controllerOf(t) === city.nationId && !t.workedBy);
    for (const tile of city.worked) tile.workedBy = city;
    return;
  }
  const candidates = workerCandidatesScratch;
  candidates.length = 0;
  const ctx = cityContext(world, city);
  // hexesInRange ile ayni gezinme sirasi, kare basina {q,r} nesnesi kurmadan.
  for (let dq = -WORK_RADIUS; dq <= WORK_RADIUS; dq++) {
    const lo = Math.max(-WORK_RADIUS, -dq - WORK_RADIUS);
    const hi = Math.min(WORK_RADIUS, -dq + WORK_RADIUS);
    for (let dr = lo; dr <= hi; dr++) {
      const tile = world.get(city.tile.q + dq, city.tile.r + dr);
      if (!tile || tile === city.tile) continue;
      if (tile.owner !== city.nationId || controllerOf(tile) !== city.nationId) continue;
      // Başka şehrin işlediği kare paylaşılmaz.
      if (tile.workedBy && tile.workedBy !== city) continue;
      // İşçi taze işgal edilmiş kareye gitmez: orada verim sıfır.
      const yields = tileYield(tile, ctx);
      const score = yields.food * weights.food + yields.gold * weights.gold
        + yields.timber * weights.timber + yields.iron * weights.iron;
      if (score <= 0) continue;
      // Satir havuzu: ayni kayit nesneleri her cagrida yeniden kullanilir
      // (kararli sort ayni ekleme sirasini gorur, sonuc birebir ayni).
      let row = workerRowPool[candidates.length];
      if (!row) {
        row = { tile: null, score: 0 };
        workerRowPool[candidates.length] = row;
      }
      row.tile = tile;
      row.score = score;
      candidates.push(row);
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  for (const tile of city.worked) {
    if (tile.workedBy === city) tile.workedBy = null;
  }
  const worked = [];
  const take = Math.min(city.pop, candidates.length);
  for (let i = 0; i < take; i++) worked.push(candidates[i].tile);
  city.worked = worked;
  for (const tile of city.worked) tile.workedBy = city;
  // Karalamalar olu kare referansi tutmasin.
  candidates.length = 0;
  for (const row of workerRowPool) row.tile = null;
}

/**
 * İşçi dağıtım ağırlıkları: neyi eksikse ona yönel. Otomatik işçinin
 * "akıllı" hissetmesini sağlayan tek yer burası.
 */
export function workerWeights(nation) {
  const weights = { food: 1.5, gold: 1, timber: 0.7, iron: 0.7 };
  if ((nation.budget?.net.food ?? 0) < 2) weights.food = 4;
  if ((nation.gold ?? 0) < 20) weights.gold = 2;
  if ((nation.budget?.net?.timber ?? 0) < 2) weights.timber = 2;
  if ((nation.budget?.net?.iron ?? 0) < 2) weights.iron = 2.5;
  return weights;
}

/**
 * Tüm şehirlerin işçilerini yeniden dağıtır. Önce bütün işaretler silinir,
 * yoksa el değiştiren şehirlerin eski işaretleri kareleri kilitler.
 */
export function assignAllWorkers(world) {
  world.forEach((t) => { t.workedBy = null; });
  const weights = new Map();
  for (const nation of world.nations) weights.set(nation.id, workerWeights(nation));
  for (const city of world.cities) assignWorkers(world, city, weights.get(city.nationId));
}

/** Şehrin bu turki üretimi: merkez bedavası + işlenen kareler. */
export function cityProduction(city, world) {
  const out = { ...CITY_CENTER_YIELD };
  const ctx = cityContext(world, city);
  for (const tile of city.worked) {
    const yields = tileYield(tile, ctx);
    for (const r of RESOURCES) out[r] += yields[r];
  }
  // Şehrin kendisi bir pazar: tahkimat kademesi altın tabanı verir.
  out.gold += 2 + city.level * 2;
  return out;
}

/**
 * Tüm ülkelerin province üretim toplamları TEK dünya taramasında.
 *
 * nationBudget ülke başına çağrılır; tarama içeride kalsaydı maliyet
 * ülke sayısıyla çarpılırdı (30 ülke x 32k kare ≈ haftada 1M provinceOutput).
 * Toplu çağıranlar (turn.produce, turns.start, recomputeEconomy) bunu bir
 * kez hesaplayıp parametre geçer.
 */
// provinceOutput'un bu dosyadaki karalamasi; omru tek cagri, referans sizmaz.
const provinceTotalsScratch = {};

export function collectProvinceTotals(world) {
  const totals = world.nations.map(() => ({
    gold: 0, food: 0, timber: 0, iron: 0, provinces: 0,
  }));
  for (const province of world.provinces ?? []) {
    if (province.owner < 0) continue;
    const sum = totals[province.owner];
    if (!sum) continue;
    // Yönetim yükü kare sayısıyla kalibre edildi; küme sayısı değil hex
    // toplamı sayılır ki idari maliyet eski ölçekte kalsın.
    sum.provinces += province.tileIdx.length;
    const out = provinceOutput(world, province, provinceTotalsScratch);
    sum.gold += out.gold;
    sum.food += out.food;
    sum.timber += out.timber;
    sum.iron += out.iron;
  }
  return totals;
}

/**
 * Ulusun tur bilançosu. Erzak stoklanmaz: üretilir, işçiler ve ordu yer,
 * artan şehir ambarlarına gidip nüfusu büyütür.
 * @returns {{ production, upkeep, net, cities }}
 */
export function nationBudget(world, nation, provinceTotals = null) {
  const production = emptyPool();
  let cityCount = 0;
  let workers = 0;
  let distanceLoad = 0;

  for (const city of world.cities) {
    if (city.nationId !== nation.id) continue;
    cityCount++;
    if (nation.capital) {
      const distance = world.wrapDistance(city.tile.q, city.tile.r, nation.capital.q, nation.capital.r);
      distanceLoad += Math.max(0, distance - ADMIN_FREE_DISTANCE) * 0.25;
    }
    workers += city.pop;
    const out = cityProduction(city, world);
    // Raw goods come only from province RGOs below. City worked-tile yields
    // remain useful for city placement/worker choice, but must not create a
    // second invisible grain/timber/iron source in the national market.
    production.gold += out.gold;
  }
  const provincial = (provinceTotals ?? collectProvinceTotals(world))[nation.id]
    ?? { gold: 0, food: 0, timber: 0, iron: 0, provinces: 0 };
  const provinceCount = provincial.provinces;
  production.gold += provincial.gold;
  production.food += provincial.food;
  production.timber += provincial.timber;
  production.iron += provincial.iron;
  for (const r of RESOURCES) production[r] = Math.round(production[r]);
  production.gold = Math.round(production.gold * corruption(cityCount, nation));

  let army = 0;
  let armyWeight = 0;
  let armyIron = 0;
  for (const u of world.units) {
    if (u.nationId !== nation.id) continue;
    army += regimentCount(u);
    armyWeight += upkeepWeight(u);
    if (u.regiments?.length) {
      for (const regiment of u.regiments) {
        armyIron += IRON_UPKEEP_TYPES[regiment.typeId] ?? 0;
      }
    } else {
      armyIron += IRON_UPKEEP_TYPES[u.type.id] ?? 0;
    }
  }

  const upkeep = emptyPool();
  // Bu kalem MAAŞTIR: asker/subay ücreti. Tedarik (mühimmat, yiyecek, yakıt)
  // ayrı bir kalemdir ve piyasadan gerçek fiyatla alınır (economy.js).
  const armyFunding = (nation.economy?.armyFunding ?? 100) / 100;
  // Bakım artık alay *sayısına* değil teçhizat ağırlığına bağlı: modern ordu
  // sürekli para yer, ordu modernizasyonu geç oyunun asıl gider kalemi olur.
  const armyGold = Math.max(0, armyWeight * UNIT_UPKEEP.gold * armyFunding);
  // Yönetim gideri bütçelenen kadarıyla ödenir; verimi de o oran belirler
  // (bkz. fiscalBalance'taki tahsilat verimi).
  const administration = administrationCost(
    cityCount, provinceCount, distanceLoad, nation.economy?.population ?? 0,
  );
  upkeep.gold = armyGold + administration;
  upkeep.food = army * UNIT_UPKEEP.food + workers * WORKER_FOOD;
  upkeep.iron = armyIron;

  const net = emptyPool();
  for (const r of RESOURCES) net[r] = production[r] - upkeep[r];
  return {
    production,
    upkeep,
    net,
    cities: cityCount,
    workers,
    army,
    armyGold,
    provinces: provinceCount,
    administration,
  };
}

