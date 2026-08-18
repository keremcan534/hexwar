// Asker alımı. Vic2 mantığı: alay bir province'in *nüfusundan* çıkar. Asker
// haritadaki insanlardır, ayrı bir sayaç değil — bu yüzden nüfus ordunun
// gerçek tavanıdır ve savaş kaybı ülkeyi kalıcı olarak küçültür.
//
//   kuruluş  → province nüfusu düşer
//   dağıtım  → nüfus çıktığı province'e geri döner
//   ölüm     → kalıcı kayıp, kimseye geri dönmez

import {
  UNIT_TYPES, createUnit, removeUnit, resolveTypeId, stackFull, unitAvailable,
} from './units.js';
import { orderMove } from './movement.js';
import {
  MILITARY_EQUIPMENT, ensureMilitaryEconomy, equipmentStock, setEquipmentStock,
} from './economy.js';
import { UNIT_COSTS, canAfford, pay } from './cities.js';
import { underTreaty } from './peace.js';
import { controllerOf } from './control.js';
import { occupiedShareOf } from './provinces.js';

export const RECRUITMENT_EQUIPMENT = {
  INFANTRY: { arms: 4 },
  CAVALRY: { arms: 6 },
  ARTILLERY: { arms: 2, artillery: 4 },
  // Gemi yelkenli konvoyla kurulur: 1836'da donanma kurmak artik mumkun.
  // Eski `steamers: 6` sarti, vapur tersanesi 1850'ye kilitli oldugu icin
  // donanmayi ilk 14 yil yapisal olarak imkansiz kiliyordu (P2-7).
  WARSHIP: { arms: 8, clippers: 6 },
  ARMOR: { arms: 2, tanks: 5 },
  AIRCRAFT: { arms: 1, airplane: 5 },
};
export const RECRUITMENT_ARMS = Object.fromEntries(
  Object.entries(RECRUITMENT_EQUIPMENT).map(([id, cost]) => [id, cost.arms ?? 0]),
);

export function recruitmentEquipmentCost(typeId) {
  return RECRUITMENT_EQUIPMENT[resolveTypeId(typeId)] ?? {};
}

export function equipmentCostLabel(typeId) {
  return Object.entries(recruitmentEquipmentCost(typeId))
    .map(([id, amount]) => `${amount}${MILITARY_EQUIPMENT[id]?.icon ?? id}`)
    .join(' ');
}

/**
 * Bir kümenin hex başına altına inemeyeceği nüfus. Ülke kendi taşrasını
 * boşaltamasın; taban küme boyuna ölçeklenir ki toplam rezerv hex-tabanlı
 * eski dengeyle aynı kalsın.
 */
export const PROVINCE_POPULATION_FLOOR = 2000;

/**
 * Kümenin verebileceği asker sayısı. tile.province paylaşılan küme econ'udur.
 * Kültürü kabul edilmemiş toprak (koloni, fetih) tam asker vermez: halk
 * imparatorluğun ordusuna gönülsüzdür — Vic2'nin accepted-culture mantığı.
 */
export function provinceManpower(world, tile) {
  const econ = tile?.province;
  if (!econ) return 0;
  const base = Math.max(0, econ.population - PROVINCE_POPULATION_FLOOR * (econ.hexes ?? 1));
  const cluster = world?.provinces?.[tile.provinceId];
  if (!cluster || cluster.owner < 0) return base;
  const nation = world.nations?.[cluster.owner];
  const accepted = nation?.accepted?.length
    ? nation.accepted.includes(cluster.culture)
    : cluster.culture === nation?.culture;
  return Math.round(base * (accepted ? 1 : 0.35));
}

/** Ulusun toplam insan gücü: sahip olunan huzurlu kümelerin toplamı. */
export function nationManpower(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nationId || !province.econ) continue;
    if (occupiedShareOf(world, province) > 0) continue;
    total += provinceManpower(world, province.center);
  }
  return total;
}

/**
 * Alayın toplandığı bölge: çıkış kümesi ve komşu kendi kümeleri. Kümeler
 * MERKEZ kareleriyle temsil edilir — aynı havuz iki kez sayılmaz (paylaşılan
 * econ yüzünden üye kareleri saymak havuzu üye sayısı kadar şişirirdi).
 */
export function recruitmentRegion(world, tile) {
  const cluster = world.provinces?.[tile?.provinceId];
  if (!cluster) return tile?.province ? [tile] : [];
  const region = [cluster.center];
  for (const neighborId of cluster.neighbors) {
    const near = world.provinces[neighborId];
    if (near?.owner === cluster.owner && near.econ) region.push(near.center);
  }
  return region;
}

export function regionManpower(world, tile) {
  return recruitmentRegion(world, tile).reduce(
    (sum, center) => sum + provinceManpower(world, center), 0,
  );
}

/**
 * Kuyruğun her çıkış kümesine yazdığı yük: kaç sipariş, kaç asker. Sayılmasaydı
 * on sipariş de ülkenin EN KALABALIK tek kümesini gösterir, hepsi aynı havuza
 * yazılır ve sıra ilerledikçe sonrakiler "asker yok" diye takılırdı.
 */
function committedManpower(nation) {
  const promised = new Map();
  for (const item of trainingQueue(nation)) {
    const key = `${item.q}:${item.r}`;
    const entry = promised.get(key);
    const men = UNIT_TYPES[item.typeId]?.manpower ?? 0;
    if (entry) {
      entry.men += men;
      entry.orders++;
    } else {
      promised.set(key, { men, orders: 1 });
    }
  }
  return promised;
}

/**
 * Alayın çıkacağı küme (merkez karesiyle): bölgesi en kalabalık olan, kuyruğa
 * söz verilenler düşüldükten sonra. Şehirli küme eşitlikte öncelikli — asker
 * toplamak şehirde daha kolaydır.
 */
export function recruitmentSource(world, nation, typeId) {
  const id = resolveTypeId(typeId);
  const need = UNIT_TYPES[id].manpower;
  const promised = committedManpower(nation);
  // Gemi tersaneden çıkar: iç bölgedeki kalabalık küme donanmaya kaynak olamaz.
  // Kontrol burada, çünkü kuyruk "neden kuramıyorum"u kuruluş anında değil
  // sıraya girerken söylemeli.
  const naval = UNIT_TYPES[id].domain === 'sea';
  let best = null;
  let bestScore = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    if (occupiedShareOf(world, province) > 0) continue;
    const center = province.center;
    const load = promised.get(`${center.q}:${center.r}`);
    const available = regionManpower(world, center) - (load?.men ?? 0);
    if (available < need) continue;
    if (naval && !world.neighbors(center).some((tile) => tile.terrain.navigable)) continue;
    const hasCity = province.tileIdx.some((idx) => world.tiles[idx].city);
    // Meşgul kışla daha az çekicidir. Havuzu tek başına yeterli olsa bile beş
    // alayı aynı kasabadan toplamak hem gerçekçi değil hem de o bölgenin
    // RGO'sunu tek seferde çökertiyor; bölen kuyruğu eyaletlere yayar.
    const score = (available + (hasCity ? 3000 : 0)) / (1 + (load?.orders ?? 0));
    if (score > bestScore) {
      bestScore = score;
      best = province.center;
    }
  }
  return best;
}

export function canRecruit(world, nation, typeId) {
  const id = resolveTypeId(typeId);
  ensureMilitaryEconomy(nation);
  return Object.entries(recruitmentEquipmentCost(id))
    .every(([equipmentId, amount]) => equipmentStock(nation, equipmentId) >= amount)
    && Boolean(recruitmentSource(world, nation, id));
}

/**
 * İnsan gücünü bölgeden toplar: her province verebildiği kadarıyla orantılı
 * katkı yapar. Nereden ne kadar alındığı dağıtımda geri vermek için döner.
 */
function drawManpower(world, source, amount) {
  const region = recruitmentRegion(world, source)
    .filter((tile) => provinceManpower(world, tile) > 0)
    .sort((a, b) => provinceManpower(world, b) - provinceManpower(world, a));
  const draws = [];
  let remaining = amount;
  for (const tile of region) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, provinceManpower(world, tile));
    if (take <= 0) continue;
    tile.province.population -= take;
    draws.push({ q: tile.q, r: tile.r, men: take });
    remaining -= take;
  }
  return draws;
}

/** Alayın haritaya çıkacağı kare: kaynağın kendisi ya da boş bir komşusu. */
function deploymentTile(world, source, typeId) {
  const domain = UNIT_TYPES[resolveTypeId(typeId)].domain;
  if (domain === 'sea') {
    return world.neighbors(source).find(
      (tile) => tile.terrain.navigable && !stackFull(tile),
    ) ?? null;
  }
  // Tümenler birleşmediği için dolu olmayan yığına inmek serbest.
  if (!stackFull(source)) return source;
  return world.neighbors(source).find(
    (tile) => tile.terrain.passable && !stackFull(tile)
      && controllerOf(tile) === source.owner,
  ) ?? null;
}

/** Ulusun toplanma noktası: yeni alaylar oraya yürür. */
export function setRallyPoint(nation, tile) {
  nation.rallyPoint = tile ? { q: tile.q, r: tile.r } : null;
  return nation.rallyPoint;
}

export function rallyTile(world, nation) {
  const point = nation.rallyPoint;
  return point ? world.get(point.q, point.r) : null;
}

/**
 * Bir alay kurar: nüfusu düşer, birim haritaya çıkar, toplanma noktası varsa
 * oraya yürümeye başlar.
 *
 * `options.source` eğitim kuyruğunun seçtiği çıkış kümesidir — kuyruğa girerken
 * söz verilen yer hâlâ bizimse alay oradan çıkar, kaybedildiyse taze bir kaynak
 * seçilir. `options.charge` false ise teçhizat kuyruğa girerken zaten
 * düşülmüştür; ikinci kez alınmaz.
 * @returns {object|null} yaratılan ya da takviye edilen ordu
 */
export function recruit(game, nation, typeId, options = {}) {
  const { source: preferred = null, charge = true } = options;
  const world = game.world;
  const id = resolveTypeId(typeId);
  ensureMilitaryEconomy(nation);
  const equipmentCost = recruitmentEquipmentCost(id);
  if (charge && !Object.entries(equipmentCost)
    .every(([equipmentId, amount]) => equipmentStock(nation, equipmentId) >= amount)) return null;
  const need = UNIT_TYPES[id].manpower;
  const usable = preferred && preferred.province
    && world.provinces?.[preferred.provinceId]?.owner === nation.id
    && regionManpower(world, preferred) >= need
      ? preferred : null;
  const source = usable ?? recruitmentSource(world, nation, id);
  if (!source) return null;
  const tile = deploymentTile(world, source, id);
  if (!tile) return null;

  const draws = drawManpower(world, source, need);
  if (!draws.length) return null;
  const unit = createUnit(id, nation.id, tile, nation, source);
  if (charge) {
    for (const [equipmentId, amount] of Object.entries(equipmentCost)) {
      setEquipmentStock(nation, equipmentId, equipmentStock(nation, equipmentId) - amount);
    }
  }
  // Nereden kaç asker alındığı alayda durur: dağıtımda aynı yerlere döner.
  unit.regiments[0].draws = draws;
  world.units.push(unit);

  const rally = rallyTile(world, nation);
  if (rally && rally !== tile) orderMove(game, unit, rally);
  return unit;
}

/**
 * Orduyu dağıtır: her alayın askeri çıktığı province'e geri döner. Province
 * kaybedilmişse insan gücü de kaybolur — geri dönecek yurt kalmamıştır.
 */
export function disband(game, unit) {
  const world = game.world;
  if (!unit?.regiments?.length) return false;
  for (const regiment of unit.regiments) {
    // Yalnız hayatta kalanlar döner: ölenler kalıcı kayıptır.
    // Askerin toplandığı province'ler biliniyorsa oraya, bilinmiyorsa
    // (eski kayıt) alayın kurulduğu province'e döner.
    const draws = regiment.draws ?? (regiment.home
      ? [{ ...regiment.home, men: (regiment.manpower ?? 0)
        * Math.max(0, regiment.strength / Math.max(1, regiment.maxStrength)) }]
      : []);
    for (const draw of draws) {
      const tile = world.get(draw.q, draw.r);
      // Province kaybedildiyse dönecek yurt kalmamıştır: insan gücü de kaybolur.
      if (!tile?.province || tile.owner !== unit.nationId
        || controllerOf(tile) !== unit.nationId) continue;
      tile.province.population += Math.round(draw.men);
    }
  }
  removeUnit(world, unit);
  game.emit('units', null);
  game.requestRender();
  return true;
}

/* ==========================================================================
   EĞİTİM KUYRUĞU
   ==========================================================================

   Alay eskiden düğmeye basıldığı hafta haritada beliriyordu: ordu kurmak bir
   satın alma işlemiydi, bir karar değil. Kuyruk üç şeyi geri getirir:

     1. ZAMAN — hazine dolu olsa bile ordu bir gecede kurulmaz; savaşa
        girmeden önce hazırlanmak gerekir.
     2. TAVAN — aynı anda kaç alay yetiştirilebileceği ülkenin eğitim
        kapasitesiyle sınırlıdır, altınla değil. Öncelik oklarının anlamı budur.
     3. GÖRÜNÜRLÜK — "ne geliyor, ne zaman" sorusunun tek bir cevabı olur;
        oyuncu da YZ de aynı kuyruğu kullanır.

   Altın ve teçhizat sıraya GİRERKEN düşülür (sipariş verilmiştir), insan gücü
   ise alay sahaya çıkarken toplanır — asker yıllar önceden ambara konmaz. */

/**
 * Bir alayın kaç haftada yetiştiği. Piyade taban; süvari at, topçu top,
 * gemi tersane ister — sayılar birimin karmaşıklığıyla artar.
 */
export const TRAINING_WEEKS = {
  INFANTRY: 8,
  CAVALRY: 10,
  ARTILLERY: 12,
  WARSHIP: 16,
  ARMOR: 14,
  AIRCRAFT: 12,
};

/** Kuyruk tavanı: sıra sonsuz uzayıp planlamayı anlamsızlaştırmasın. */
export const MAX_TRAINING_QUEUE = 24;

/** Şehirsiz ülkenin bile kışlası vardır; taban kapasite budur. */
export const BASE_TRAINING_CAPACITY = 2;

export function trainingWeeks(typeId) {
  return TRAINING_WEEKS[resolveTypeId(typeId)] ?? 8;
}

export function ensureTraining(nation) {
  const training = nation.training ?? (nation.training = { queue: [], nextId: 1 });
  if (!Array.isArray(training.queue)) training.queue = [];
  if (!Number.isFinite(training.nextId)) training.nextId = 1;
  return training;
}

export function trainingQueue(nation) {
  return ensureTraining(nation).queue;
}

/**
 * Aynı anda kaç alay eğitilebilir. Kışla şehirdedir: kapasite ülkenin fiilen
 * elinde tuttuğu şehir sayısıyla büyür. İşgal edilmiş şehir asker yetiştirmez.
 */
export function trainingCapacity(world, nation) {
  let cities = 0;
  for (const city of world.cities ?? []) {
    if (city.nationId === nation.id && controllerOf(city.tile) === nation.id) cities++;
  }
  return Math.max(1, Math.min(12, BASE_TRAINING_CAPACITY + Math.floor(cities / 2)));
}

/**
 * Haftada kaç haftalık eğitim ilerler. Maaşı kısılan ordu yavaş yetişir,
 * ikmalsiz kışla daha da yavaş — bütçe kaydıracının kuyruktaki karşılığı.
 * Tam bütçe + tam ikmal = 1.0, yani ilan edilen süre.
 */
export function trainingSpeed(nation) {
  const wages = Math.max(0, Math.min(1, (nation.economy?.militaryWages ?? 100) / 100));
  const supply = Math.max(0, Math.min(1, nation.economy?.military?.supplyIndex ?? 1));
  return 0.45 + 0.4 * wages + 0.15 * supply;
}

/** Kuyruktaki alay sayısı; tip verilirse yalnız o tip. */
export function trainingCount(nation, typeId = null) {
  const queue = trainingQueue(nation);
  if (!typeId) return queue.length;
  const id = resolveTypeId(typeId);
  return queue.reduce((sum, item) => sum + (item.typeId === id ? 1 : 0), 0);
}

/**
 * Bir alayın sıraya girmesini engelleyen ne varsa, sırayla. Boş dizi = kurulabilir.
 *
 * Liste tek bir "hayır" değil çünkü ekranın işi nedeni söylemektir: oyuncu
 * düğmenin neden kapalı olduğunu tahmin etmek zorunda kalmamalı.
 */
export function recruitBlockers(game, nation, typeId, options = {}) {
  const world = game.world;
  const id = resolveTypeId(typeId);
  const turn = game.turns?.turn ?? world.turn ?? 0;
  // Kaynak taraması ülkenin bütün kümelerini gezer. Ekran altı birim tipini
  // birden soruyor; hesabı bir kez yapıp buraya vermek taramayı yarıya indirir.
  const source = 'source' in options ? options.source : recruitmentSource(world, nation, id);
  const blockers = [];
  if (!unitAvailable(id, turn)) {
    const year = 1836 + Math.floor(((UNIT_TYPES[id].availableFrom ?? 1) - 1) * 7 / 365);
    blockers.push({ id: 'era', text: `Not fielded before ${year}.` });
  }
  if (underTreaty(nation, 'DEMILITARIZE', turn)) {
    blockers.push({ id: 'treaty', text: 'A peace treaty forbids raising new divisions.' });
  }
  const cost = UNIT_COSTS[id];
  if (cost && !canAfford(nation, cost)) {
    blockers.push({
      id: 'gold',
      text: `Treasury short: ${cost.gold} needed, ${Math.floor(nation.gold ?? 0)} on hand.`,
    });
  }
  ensureMilitaryEconomy(nation);
  for (const [equipmentId, amount] of Object.entries(recruitmentEquipmentCost(id))) {
    const stock = equipmentStock(nation, equipmentId);
    if (stock >= amount) continue;
    blockers.push({
      id: `equipment:${equipmentId}`,
      text: `${MILITARY_EQUIPMENT[equipmentId]?.name ?? equipmentId} short:`
        + ` ${amount} needed, ${stock.toFixed(1)} in stock.`,
    });
  }
  if (!source) {
    blockers.push({
      id: 'source',
      text: UNIT_TYPES[id].domain === 'sea'
        ? `No coastal province can spare ${UNIT_TYPES[id].manpower} men for a crew.`
        : `No province can spare ${UNIT_TYPES[id].manpower} men.`,
    });
  }
  if (trainingQueue(nation).length >= MAX_TRAINING_QUEUE) {
    blockers.push({ id: 'queue', text: `Training queue is full (${MAX_TRAINING_QUEUE}).` });
  }
  return blockers;
}

/**
 * Sıraya bir alay ekler. Altın ve teçhizat burada düşer: sipariş verilmiştir.
 * @returns {object|null} kuyruk kaydı
 */
export function queueRecruit(game, nation, typeId) {
  const world = game.world;
  const id = resolveTypeId(typeId);
  if (recruitBlockers(game, nation, id).length) return null;
  const source = recruitmentSource(world, nation, id);
  if (!source) return null;
  const cost = UNIT_COSTS[id];
  if (cost && !pay(nation, cost)) return null;
  const equipment = { ...recruitmentEquipmentCost(id) };
  for (const [equipmentId, amount] of Object.entries(equipment)) {
    setEquipmentStock(nation, equipmentId, equipmentStock(nation, equipmentId) - amount);
  }
  const training = ensureTraining(nation);
  const item = {
    id: training.nextId++,
    typeId: id,
    weeks: trainingWeeks(id),
    progress: 0,
    q: source.q,
    r: source.r,
    gold: cost?.gold ?? 0,
    equipment,
    queuedAt: game.turns?.turn ?? world.turn ?? 0,
    // Bu hafta ilerleyemiyorsa nedeni: 'capacity' (kışla dolu) ya da
    // 'deploy' (eğitim bitti, çıkacak yer/insan yok).
    waiting: null,
  };
  training.queue.push(item);
  return item;
}

/**
 * Siparişi iptal eder. İade harcanmamış paydır: yarısı eğitilmiş alayın
 * silahı da yarı yarıya tüketilmiştir. Tam iade olsaydı kuyruk bedava bir
 * depo olurdu — sıraya sok, hazine sıkışınca boşalt.
 */
export function cancelTraining(game, nation, itemId) {
  const training = ensureTraining(nation);
  const index = training.queue.findIndex((item) => item.id === Number(itemId));
  if (index < 0) return false;
  const [item] = training.queue.splice(index, 1);
  const share = Math.max(0, 1 - item.progress / Math.max(1, item.weeks));
  nation.gold = (nation.gold ?? 0) + Math.floor((item.gold ?? 0) * share);
  for (const [equipmentId, amount] of Object.entries(item.equipment ?? {})) {
    setEquipmentStock(
      nation, equipmentId, equipmentStock(nation, equipmentId) + amount * share,
    );
  }
  return true;
}

/** Kuyrukta bir basamak yukarı/aşağı. Öncelik = kapasiteyi kimin yiyeceği. */
export function prioritizeTraining(nation, itemId, delta) {
  const queue = trainingQueue(nation);
  const index = queue.findIndex((item) => item.id === Number(itemId));
  const target = index + (delta < 0 ? -1 : 1);
  if (index < 0 || target < 0 || target >= queue.length) return false;
  [queue[index], queue[target]] = [queue[target], queue[index]];
  return true;
}

/**
 * Kaydi kuyrugun basina/sonuna tasir. Insaat kuyruguna R-11 ile gelen tek-tik
 * ziplatmanin egitim kuyrugundaki karsiligi: 20 kayitlik kuyrukta tek adimlik
 * ▲ ile basa cikmak 19 tikti (ayni SEVERE bulgu, ayni ilac).
 */
export function moveTrainingTo(nation, itemId, edge) {
  const queue = trainingQueue(nation);
  const index = queue.findIndex((item) => item.id === Number(itemId));
  if (index < 0) return false;
  const [item] = queue.splice(index, 1);
  if (edge === 'top') queue.unshift(item);
  else queue.push(item);
  return true;
}

/** Bir kaydın bitmesine kalan hafta; hız sıfırlanamaz, bölme güvenlidir. */
export function weeksLeft(nation, item) {
  return Math.max(0, Math.ceil((item.weeks - item.progress) / trainingSpeed(nation)));
}

/**
 * Haftalık eğitim adımı. Kapasite yalnız HÂLÂ eğitilenlere harcanır: eğitimi
 * bitmiş ama sahaya çıkacak yer/insan bulamayan kayıt sırayı tıkamaz, her
 * hafta yeniden dener.
 */
export function runTraining(game) {
  const world = game.world;
  let completed = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const training = ensureTraining(nation);
    if (!training.queue.length) continue;
    // Askersizleştirme yalnız yeni siparişi değil sırayı da dondurur. Yoksa
    // barış masasında imzayı atmadan önce yirmi dört alay sipariş etmek
    // şartı tamamen delerdi.
    if (underTreaty(nation, 'DEMILITARIZE', game.turns?.turn ?? world.turn ?? 0)) {
      for (const item of training.queue) item.waiting = 'treaty';
      continue;
    }
    const capacity = trainingCapacity(world, nation);
    const speed = trainingSpeed(nation);
    let slots = 0;
    for (const item of training.queue) {
      if (item.progress >= item.weeks) continue;
      if (slots >= capacity) {
        item.waiting = 'capacity';
        continue;
      }
      slots++;
      item.waiting = null;
      item.progress = Math.min(item.weeks, item.progress + speed);
    }
    let done = false;
    for (const item of training.queue) {
      if (item.progress < item.weeks) continue;
      const source = world.get(item.q, item.r);
      const unit = recruit(game, nation, item.typeId, { source, charge: false });
      if (!unit) {
        item.waiting = 'deploy';
        continue;
      }
      item.finished = true;
      done = true;
      completed++;
      if (nation.id === game.turns?.playerNation) {
        game.turns.addLog(
          `${UNIT_TYPES[item.typeId].name} joined the army (${UNIT_TYPES[item.typeId].manpower} men).`,
          { kind: 'ARMY', tile: unit.tile },
        );
      }
    }
    if (done) training.queue = training.queue.filter((item) => !item.finished);
  }
  if (completed) game.emit('units', game.selectedUnit ?? null);
  return completed;
}
