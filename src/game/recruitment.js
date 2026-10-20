// Asker alımı. Vic2 mantığı: alay bir province'in *nüfusundan* çıkar. Asker
// haritadaki insanlardır, ayrı bir sayaç değil — bu yüzden nüfus ordunun
// gerçek tavanıdır ve savaş kaybı ülkeyi kalıcı olarak küçültür.
//
//   kuruluş  → province nüfusu düşer
//   dağıtım  → nüfus çıktığı province'e geri döner
//   ölüm     → kalıcı kayıp, kimseye geri dönmez

import {
  UNIT_TYPES, createUnit, removeUnit, resolveTypeId, stackFull, unitAvailable, unitsOn,
} from './units.js';
import { orderMove } from './movement.js';
import { mod } from './modifiers.js';
import { CONSCRIPT_KIT, EQUIPMENT, UNIT_EQUIPMENT } from './econ/defs.js';
import { addEquipment, equipmentStock, takeEquipment } from './econ/industry.js';
import { supplyFactor } from './econ/bills.js';
import { underTreaty } from './peace.js';
import { controllerOf } from './control.js';
import { levyAvailable, levyExcluded, releaseDraw, takeLevy } from './levy.js';
import { occupiedShareOf } from './provinces.js';
import { nodeNeighbors, nodeOf } from '../world/provinceGraph.js';
import { techById, unlockTechOf } from './technology.js';
import { commissionShip } from './navy.js';

/** Alayın kuruluş teçhizatı (econ/defs.js UNIT_EQUIPMENT). */
export function recruitmentEquipmentCost(typeId) {
  return UNIT_EQUIPMENT[resolveTypeId(typeId)] ?? {};
}

export function equipmentCostLabel(typeId) {
  return Object.entries(recruitmentEquipmentCost(typeId))
    .map(([id, amount]) => `${amount}${EQUIPMENT[id]?.glyph ?? id}`)
    .join(' ');
}


/**
 * Kümenin verebileceği asker sayısı. Havuz ASKERLİK YASASININ oranıdır
 * (nüfusun %2-15'i); kışla ve teknoloji büyütür. Kabul edilmemiş halk
 * vatandaşlık yasasının izin verdiği kadar gelir (Vic2), huzursuz küme az
 * verir, çekirdek dışı küme uyumu oranında. Silah altındakiler havuzdan düşer.
 * Halk halk açılımı ve kura kutuları levy.js'tedir: yalnız işaretli halklar sayılır.
 */
export function provinceManpower(world, tile) {
  if (!tile?.province) return 0;
  const cluster = world?.provinces?.[tile.provinceId];
  if (!cluster || cluster.owner < 0) return 0;
  const nation = world.nations?.[cluster.owner];
  if (!nation) return 0;
  return Math.max(0, Math.round(levyAvailable(world, cluster, nation)));
}

/** Ulusun toplam insan gücü: sahip olunan, işgalsiz kümelerin toplamı. */
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

/** Kıyı province'i: merkezinin bir komşusu denize değiyorsa tersane olur. */
function coastal(world, center) {
  return nodeNeighbors(world, center).some((tile) => tile.terrain.navigable);
}

/**
 * Alayın çıkacağı küme (merkez karesiyle): bölgesi en kalabalık olan. Şehirli
 * küme eşitlikte öncelikli — asker toplamak şehirde daha kolaydır. Kuyruktaki
 * siparişler insanlarını zaten tutar (queueRecruit), havuz onları düşmüştür:
 * ikinci sipariş kendiliğinden bir sonraki kalabalık bölgeye gider.
 */
export function recruitmentSource(world, nation, typeId) {
  const id = resolveTypeId(typeId);
  const need = UNIT_TYPES[id].manpower;
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
    const available = regionManpower(world, center);
    if (available < need) continue;
    if (naval && !coastal(world, center)) continue;
    const hasCity = province.tileIdx.some((idx) => world.tiles[idx].city);
    const score = available + (hasCity ? 3000 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = province.center;
    }
  }
  return best;
}

/**
 * Eğitimi biten alayın sahaya çıkacağı küme. İnsanları sipariş anında
 * toplanmıştır; burada yalnız YER aranır: söz verilen küme hâlâ bizim ve
 * işgalsizse o, değilse elimizdeki ilk işgalsiz küme (şehirli önce; gemi
 * için kıyı).
 */
function deploySource(world, nation, id, preferred) {
  const naval = UNIT_TYPES[id].domain === 'sea';
  const usable = (province) => province?.owner === nation.id && province.econ
    && occupiedShareOf(world, province) === 0 && (!naval || coastal(world, province.center));
  if (preferred?.province && usable(world.provinces?.[preferred.provinceId])) return preferred;
  let fallback = null;
  for (const province of world.provinces ?? []) {
    if (!usable(province)) continue;
    if (province.tileIdx.some((idx) => world.tiles[idx].city)) return province.center;
    fallback ??= province.center;
  }
  return fallback;
}

// TECHIZAT ARTIK KAPI DEGIL (Victoria usulu). Depoda yoksa siparis yine
// verilir; eksik dunya pazarindan alinir (economy.procureStrategicGoods) ve
// alay teçhizat gelene kadar egitime baslamaz. Eskiden depo bos diye dugme
// kapaniyordu: silah uretmeyen ulke hic alay kuramiyordu, dunya fiyatlari da
// savas talebini hic gormuyordu.
export function canRecruit(world, nation, typeId) {
  return Boolean(recruitmentSource(world, nation, resolveTypeId(typeId)));
}

/**
 * Eksik teçhizatla çıkan alayın en düşük gücü. Sıfır güçlü alay haritada
 * savaşamayan bir hayalet olurdu; HOI4'te de tümen en az bir avuç adamla çıkar.
 */
export const DEPLOY_FLOOR = 0.1;

/** Siparişin teçhizat doluluğu (0-1): en eksik kalemin oranı. */
export function orderFill(item) {
  let fill = 1;
  for (const [id, missing] of Object.entries(item.missing ?? {})) {
    const have = item.equipment?.[id] ?? 0;
    const total = have + Math.max(0, missing);
    if (total > 0) fill = Math.min(fill, have / total);
  }
  return fill;
}

/** Depoda bulunani siparisin eksigine aktarir; eksik kaldiysa false. */
function fillOrder(nation, item) {
  let complete = true;
  for (const [id, need] of Object.entries(item.missing ?? {})) {
    if (need <= 0) continue;
    const take = Math.min(need, equipmentStock(nation, id));
    if (take > 0) {
      nation.economy.stock[id] -= take;
      (item.equipment ??= {})[id] = (item.equipment[id] ?? 0) + take;
      item.missing[id] = need - take;
    }
    if (item.missing[id] > 1e-9) complete = false;
    else delete item.missing[id];
  }
  return complete;
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
    const cluster = world.provinces[tile.provinceId];
    const by = takeLevy(world, cluster, world.nations[cluster.owner], take);
    draws.push({ q: tile.q, r: tile.r, men: take, by });
    remaining -= take;
  }
  return draws;
}

/**
 * Alayın haritaya çıkacağı düğüm: kaynak province'in merkezi ya da komşu bir
 * province (bkz. world/provinceGraph). Gemi province'e değen deniz karesine iner.
 */
function deploymentTile(world, source) {
  // Eski kuyruk kaydı province'in herhangi bir karesini tutabilir.
  source = nodeOf(world, source);
  // Tümenler birleşmediği için dolu olmayan yığına inmek serbest — ama
  // yalnız kendi kontrolümüzde ve yabancı tümen yokken: işgal edilmiş
  // kaynakta alay düşman yığınının ÜSTÜNE doğuyordu.
  const own = (tile) => controllerOf(tile) === source.owner
    && unitsOn(tile).every((unit) => unit.nationId === source.owner);
  if (!stackFull(source) && own(source)) return source;
  return nodeNeighbors(world, source).find(
    (tile) => tile.terrain.passable && !stackFull(tile) && own(tile),
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
 * düşülmüştür; ikinci kez alınmaz. `options.draws` sipariş anında toplanmış
 * insanlardır: verilirse havuza bir daha bakılmaz, yalnız yer aranır.
 * @returns {object|null} yaratılan ya da takviye edilen ordu
 */
export function recruit(game, nation, typeId, options = {}) {
  const { source: preferred = null, charge = true, fill = 1, draws: held = null } = options;
  const world = game.world;
  const id = resolveTypeId(typeId);
  const equipmentCost = recruitmentEquipmentCost(id);
  if (charge && !Object.entries(equipmentCost)
    .every(([equipmentId, amount]) => equipmentStock(nation, equipmentId) >= amount)) return null;
  const need = UNIT_TYPES[id].manpower;
  // Söz verilen kaynak savaşta işgal edildiyse taze kaynak seçilir
  // (recruitmentSource da işgalli kümeyi atlar).
  const usable = !held && preferred && preferred.province
    && world.provinces?.[preferred.provinceId]?.owner === nation.id
    && occupiedShareOf(world, world.provinces[preferred.provinceId]) === 0
    && regionManpower(world, preferred) >= need
      ? preferred : null;
  const source = held ? deploySource(world, nation, id, preferred)
    : usable ?? recruitmentSource(world, nation, id);
  if (!source) return null;
  const naval = UNIT_TYPES[id].domain === 'sea';
  const tile = naval ? source : deploymentTile(world, source);
  if (!tile) return null;

  // Eksik teçhizatla çıkan alay o oranda güçle ve o oranda insanla çıkar;
  // takviye (reinforcement.js) ikisini birlikte tamamlar — insan/güç oranı
  // korunur, takviye aynı insanı ikinci kez çekmez. Sipariş anında tutulan
  // insanların fazlası evine döner.
  const share = Math.max(DEPLOY_FLOOR, Math.min(1, fill));
  let draws;
  if (held) {
    if (share < 1) for (const draw of held) releaseDraw(world, nation.id, draw, (draw.men ?? 0) * (1 - share));
    draws = held.filter((draw) => draw.men > 0.01);
  } else {
    draws = drawManpower(world, source, Math.ceil(need * share));
  }
  if (!draws.length) return null;
  if (naval) {
    // Gemi haritaya inmez: ulusun filosuna katılır (navy.js), limanı bu kıyı.
    // Eksik teçhizatla çıkan gemi o sağlıkla doğar ve limanda onarılır.
    if (charge) takeEquipment(nation, equipmentCost);
    return commissionShip(world, nation, {
      home: source.provinceId, hp: share, draws, turn: game.turns?.turn ?? world.turn ?? 0,
      kind: id === 'SUBMARINE' ? 'sub' : 'ship',
    });
  }
  const unit = createUnit(id, nation.id, tile, nation, source);
  if (share < 1) {
    const regiment = unit.regiments[0];
    regiment.strength = regiment.maxStrength * share;
    unit.hp = regiment.strength;
  }
  if (charge) takeEquipment(nation, equipmentCost);
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
  const nation = world.nations?.[unit.nationId];
  for (const regiment of unit.regiments) {
    // Silah depoya döner (HOI4), hayatta kalan güç oranında: kayıp güç
    // takviyede zaten teçhizat yemişti. Kura alayı yalnız aldığı yarım
    // takımı geri verir. Eskiden terhis teçhizatı siliyordu: seferberliğin
    // her bitişi kura başına 15 tüfeği yok ediyordu.
    // Milis (levée) teçhizatsız çıkar: terhisi depoya tüfek İADE ETMEZ (yoksa
    // her levée sonu yoktan 30 tüfek/alay yaratıyordu).
    const kit = regiment.militia ? {} : regiment.conscript ? CONSCRIPT_KIT
      : UNIT_EQUIPMENT[resolveTypeId(regiment.typeId)] ?? {};
    const alive = Math.max(0, Math.min(1, (regiment.strength ?? 0) / Math.max(1, regiment.maxStrength ?? 1)));
    for (const [equipmentId, amount] of Object.entries(kit)) addEquipment(nation, equipmentId, amount * alive);
    // Yalnız hayatta kalanlar döner: ölenler kalıcı kayıptır.
    // Askerin toplandığı province'ler biliniyorsa oraya, bilinmiyorsa
    // (eski kayıt) alayın kurulduğu province'e döner.
    const draws = regiment.draws ?? (regiment.home
      ? [{ ...regiment.home, men: (regiment.manpower ?? 0)
        * Math.max(0, regiment.strength / Math.max(1, regiment.maxStrength)) }]
      : []);
    for (const draw of draws) {
      // Terhis artik nufusa insan EKLEMEZ, cunku askere alma da nufustan
      // insan CIKARMAMISTI: yalnizca tutma birakilir, adam sivil hayata doner.
      // Province el degistirmis olsa bile tutmayi birakmak dogrudur — o
      // insanlar artik yeni sahibin nufusunun parcasidir.
      releaseDraw(world, unit.nationId, draw, draw.men);
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

   Altın, teçhizat ve İNSAN sıraya GİRERKEN düşülür: sipariş verilmiştir,
   kışladaki adam askerdir (HOI4). Eskiden insan alay sahaya çıkarken
   toplanıyordu; komşu bölgeler aynı havuzu paylaştığı ve takviye her hafta
   havuzu önden içtiği için eğitimi biten alay "asker yok" diye bekliyordu.
   Ölçüldü (NAVY2, 160×96): kuyruğun %52-74'ü bu bekleyişteydi, ortanca 50-80
   hafta, p90 450 hafta; altını ve teçhizatı yıllarca kilitli kalıyordu. */

/**
 * Bir alayın kaç haftada yetiştiği. Piyade taban; süvari at, topçu top,
 * gemi tersane ister — sayılar birimin karmaşıklığıyla artar.
 */
export const TRAINING_WEEKS = {
  INFANTRY: 8,
  CAVALRY: 10,
  ARTILLERY: 12,
  WARSHIP: 16,
  SUBMARINE: 10,
  ARMOR: 14,
  AIRCRAFT: 12,
};

/** Kuyruk tavanı: sıra sonsuz uzayıp planlamayı anlamsızlaştırmasın. */
export const MAX_TRAINING_QUEUE = 24;

/** Şehirsiz ülkenin bile kışlası vardır; taban kapasite budur. */
// Kışla binası 2026-10-15'te kalktı (her iki kademesi bir yuvaydı; YZ hiç
// kurmuyordu, kuruluşta başkentte bir kademe vardı): taban bir arttı.
export const BASE_TRAINING_CAPACITY = 3;

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
 * Haftada kaç haftalık eğitim ilerler: teknoloji ve danışman hızlandırır,
 * ikmal krizindeki devletin kışlası yavaşlar. 1.0 = ilan edilen süre.
 */
export function trainingSpeed(nation) {
  return Math.max(0.2, 1 + mod(nation, 'training')) * supplyFactor(nation);
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
  if (!unitAvailable(id, nation)) {
    // Kapali dugme sebepsiz olmaz: hangi teknoloji acar, adiyla.
    const tech = techById(unlockTechOf(id))?.tech;
    blockers.push({ id: 'era', text: `Requires ${tech ? `${tech.name} (${tech.year})` : 'research'}.` });
  }
  if (underTreaty(nation, 'DEMILITARIZE', turn)) {
    blockers.push({ id: 'treaty', text: 'A peace treaty forbids raising new divisions.' });
  }
  if (!source) {
    blockers.push({
      id: 'source',
      text: (UNIT_TYPES[id].domain === 'sea'
        ? `No coastal province can spare ${UNIT_TYPES[id].manpower} men for a crew.`
        : `No province can spare ${UNIT_TYPES[id].manpower} men.`)
        // Kura kutusu kapalıysa sebep çoğu zaman odur: oyuncu kendi kararını
        // "asker yok" diye okumasın.
        + (levyExcluded(nation).length ? ' Some peoples are exempt from the levy (Who is drafted).' : ''),
    });
  }
  if (trainingQueue(nation).length >= MAX_TRAINING_QUEUE) {
    blockers.push({ id: 'queue', text: `Training queue is full (${MAX_TRAINING_QUEUE}).` });
  }
  return blockers;
}

/**
 * Sıraya bir alay ekler. Altın, teçhizat ve insan burada düşer: sipariş
 * verilmiştir, kışladaki adam havuzdan çıkmıştır (draws).
 * @returns {object|null} kuyruk kaydı
 */
export function queueRecruit(game, nation, typeId) {
  const world = game.world;
  const id = resolveTypeId(typeId);
  if (recruitBlockers(game, nation, id).length) return null;
  const source = recruitmentSource(world, nation, id);
  if (!source) return null;
  const draws = drawManpower(world, source, UNIT_TYPES[id].manpower);
  // Depodan alınabilen alınır; eksik siparişe yazılır ve üretim hattından
  // geldikçe dolar (alay teçhizatı tamamlanmadan eğitime başlamaz).
  const equipment = {};
  const missing = {};
  for (const [equipmentId, amount] of Object.entries(recruitmentEquipmentCost(id))) {
    const take = Math.min(amount, Math.max(0, equipmentStock(nation, equipmentId)));
    if (take > 0) nation.economy.stock[equipmentId] -= take;
    equipment[equipmentId] = take;
    if (amount - take > 1e-9) missing[equipmentId] = amount - take;
  }
  const training = ensureTraining(nation);
  const item = {
    id: training.nextId++,
    typeId: id,
    weeks: trainingWeeks(id),
    progress: 0,
    q: source.q,
    r: source.r,
    equipment,
    missing,
    draws,
    queuedAt: game.turns?.turn ?? world.turn ?? 0,
    // Bu hafta ilerleyemiyorsa nedeni: 'capacity' (kışla dolu) ya da
    // 'deploy' (eğitim bitti, çıkacak boş kare yok).
    waiting: null,
  };
  training.queue.push(item);
  return item;
}

/**
 * Siparişi iptal eder. İade harcanmamış paydır: yarısı eğitilmiş alayın
 * silahı da yarı yarıya tüketilmiştir. Tam iade olsaydı kuyruk bedava bir
 * depo olurdu. (Alayın altın bedeli 2026-10-15'te kalktı: bedeli insan,
 * teçhizat ve haftalık ikmaldir.)
 */
export function cancelTraining(game, nation, itemId) {
  const training = ensureTraining(nation);
  const index = training.queue.findIndex((item) => item.id === Number(itemId));
  if (index < 0) return false;
  const [item] = training.queue.splice(index, 1);
  const share = Math.max(0, 1 - item.progress / Math.max(1, item.weeks));
  for (const [equipmentId, amount] of Object.entries(item.equipment ?? {})) {
    addEquipment(nation, equipmentId, amount * share);
  }
  // Kışladaki adamların hepsi evine döner: insan harcanmış pay değildir.
  releaseQueued(game.world, nation, item);
  return true;
}

/** Siparişin tuttuğu insanları bırakır (iptal, ülkenin silinmesi). */
export function releaseQueued(world, nation, item) {
  for (const draw of item.draws ?? []) releaseDraw(world, nation.id, draw, draw.men ?? 0);
  item.draws = [];
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
      // HOI4 USULÜ: teçhizat eğitimi BEKLETMEZ. Depoda olan her hafta alınır;
      // eğitim biterken eksik kalan teçhizat oranında alay düşük güçle çıkar
      // (Kerem: "ekipman olmasa bile recruitle, STR düşük gelsin"). Eskiden
      // teçhizatı tamamlanmayan sipariş kışlaya hiç girmiyordu.
      fillOrder(nation, item);
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
      fillOrder(nation, item);
      const fill = orderFill(item);
      // Eski kayıttan gelen siparişin insanı tutulmamıştır: havuzdan çekilir.
      const draws = item.draws?.length ? item.draws : null;
      const unit = recruit(game, nation, item.typeId, { source, charge: false, fill, draws });
      if (!unit) {
        item.waiting = 'deploy';
        continue;
      }
      item.finished = true;
      done = true;
      completed++;
      if (nation.id === game.turns?.playerNation && UNIT_TYPES[item.typeId].domain === 'sea') {
        game.turns.addLog(`${item.typeId === 'SUBMARINE' ? `Submarine ${unit.name} joined the flotilla` : `The ${unit.name} joined the fleet`}${fill < 0.999
          ? ` at ${Math.round(Math.max(DEPLOY_FLOOR, fill) * 100)}% — short of ships equipment, she repairs in port`
          : ''}.`, { kind: 'NAVAL', key: 'commissioned' });
      } else if (nation.id === game.turns?.playerNation) {
        game.turns.addLog(
          `${UNIT_TYPES[item.typeId].name} joined the army${fill < 0.999
            ? ` at ${Math.round(Math.max(DEPLOY_FLOOR, fill) * 100)}% strength — short of equipment, reinforcements will fill it`
            : ` (${UNIT_TYPES[item.typeId].manpower} men)`}.`,
          { kind: 'ARMY', tile: unit.tile },
        );
      }
    }
    if (done) training.queue = training.queue.filter((item) => !item.finished);
  }
  if (completed) game.emit('units', game.selectedUnit ?? null);
  return completed;
}
