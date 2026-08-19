// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import {
  CITY_COST, UNIT_COSTS, canAfford, canFoundCity,
} from './cities.js';
import {
  MIN_WAR_TURNS, atWar, attackerCount, declareWar, nationStrength, recordWarProgress,
  relation, truceLeft,
} from './diplomacy.js';
import {
  buildOffer, demandLimit, occupiedProvincesOf, offerCost, offerMeetsExpectation, provinceKeyOf,
  signPeace, warScore,
} from './peace.js';
import { INFAMY_COALITION } from './infamy.js';
import { isMoving, regimentCount, unitAvailable, unitsOn } from './units.js';
import { destinationOf, orderMove } from './movement.js';
import { controllerOf } from './control.js';
import { canRecruit, disband, trainingCount } from './recruitment.js';
import {
  BRANCH, STANCE, assignDivisions, commandSize, generalOfArmy, officersOf, setStance,
} from './command.js';
import {
  MILITARY_EQUIPMENT, ensureProductionLine, equipmentStock,
} from './economy.js';
import { desiredIndex, enactReform, reformBoard } from './reforms.js';
import { rulingParty } from './politics.js';

/** Savaş ilanı için gereken güç üstünlüğü. */
const WAR_THRESHOLD = 1.4;

/**
 * ZATEN SAVAŞTA olan bir ülkeye saldırmak için gereken üstünlük ve sınır.
 *
 * NEDEN VAR: eski kural "zaten savaşan ülkeye çullanılmaz"dı ve hedefe
 * uygulanıyordu. Amacı (kurbanı bekleyen kuyruğu kırmak) doğruydu ama yan
 * etkisi ölçüldü — Open Beta 3, 23.400 komşu-değerlendirmesi: SÜREKLİ SAVAŞAN
 * BİR ÜLKE SÜREKLİ DOKUNULMAZDI. Oyuncu 64 yıl boyunca her yıl savaş açtı ve
 * o yıllarda YZ için geçerli bir hedef bile olmadı; 27 savaşın 26'sı onun
 * ilanıydı. Salam taktiği hem toprak hem saldırılmazlık satın alıyordu.
 *
 * Artık ikinci cephe MÜMKÜN ama ucuz değil: sıradan bir üstünlük yetmez,
 * açık ara güç ve gerçek bir sınır ister. Üçüncü saldırgana hiç izin yok —
 * savaş zincirinin asıl sebebi oydu.
 */
const SECOND_FRONT_THRESHOLD = 2.2;
const SECOND_FRONT_CONTACT = 3;
const MAX_ATTACKERS = 2;

/**
 * Kazanan tarafın masaya oturmadan önce savaşı taşıması gereken asgari süre ve
 * cephenin "durdu" sayılması için gereken durgunluk. İlk ucuz küme
 * karşılanabilir olur olmaz imzalanan barış, savaşa gövde bırakmıyordu.
 */
const WAR_MIN_BODY = 26;
const WAR_STALL_WEEKS = 18;

/** Aylık hazırlık kontrolünün ilan aşamasına gelme ihtimali. */
const DECLARE_CHANCE = 0.03;

/**
 * Bu warscore'un üstünde YZ masaya oturup kazancını toplamak ister. 45 denendi
 * ve daha kötü çıktı: YZ eşiğe hiç ulaşamayınca savaşlar kazananın masaya
 * oturmasıyla değil kaybedenin teslim olmasıyla bitiyor, savaşlı hafta oranı
 * %84'ten %27'ye düşüyordu (bkz. war-tempo-diagnostic).
 */
const PEACE_WIN_SCORE = 25;

/** Bu warscore'un altında YZ savaşı ne pahasına olursa olsun kesmeye çalışır. */
const PEACE_LOSS_SCORE = -30;
// Uc yil sonuc uretmeyen savas masaya beyaz baris koyar (bkz. asagida
// donmus-savas dali). 8 yillik `stale` kapisi yalniz KAZANAN dalinda
// yasiyordu; 0-0 savasin teklif vereni hic yoktu.
const FROZEN_WAR_WEEKS = 156;

/**
 * Teklifi alan tarafın kararı. Ölçüt tek: masada verdiğim, cephede
 * kaybedeceğimden az mı? Warscore'u negatif olan ülke kaybını kabul eder,
 * kazanan taraf beyaz barışı reddeder — eskiden yenilen her ülke bedavaya
 * kurtuluyordu. Yorgunluk (ikinci cephe, çöken istikrar) eşiği gevşetir.
 */
function acceptsOffer(game, receiver, proposer, offer, rng) {
  // Esik artik peace.js'te: oyuncunun masasi ile YZ karari ayni fonksiyondan
  // gecer. Ayri durduklarinda YZ kazandigi savasi asla bedavaya vermiyordu ama
  // OYUNCU her seferinde bedava beyaz baris alabiliyordu (bkz. BUG-009).
  // Buradaki tek fazlalik kucuk rastgele paydir: iki inatci YZ'nin savasi
  // sonsuza kilitlenmesin.
  return offerMeetsExpectation(game.world, receiver.id, proposer.id, offer) || rng() < 0.08;
}

/**
 * Yenilen tarafın teklifi: cephede zaten kaybedilmiş kareleri masada bırakır.
 * "Elinde tuttuğun senin olsun" savaşı durdurmanın en ucuz yoludur; beyaz
 * barış kazanan tarafa artık yetmiyor.
 */
function surrenderOffer(world, nation, foe) {
  // Kaç küme bırakılacağını KAZANANIN skoru belirler: teslim olan taraf da
  // üstünlüğün satın alabileceğinden fazlasını masaya koymaz.
  const limit = demandLimit(warScore(world, foe.id, nation.id));
  const lost = occupiedProvincesOf(world, foe.id, nation.id).slice(0, limit);
  return { demands: [], concessions: lost.map(({ province }) => provinceKeyOf(province)), terms: [] };
}

/**
 * Barış girişimi. Oyuncuya giden teklif masaya düşer ve cevabı oyuncu verir;
 * YZ'ler arasında karar aynı turda verilir. Artık iki taraf da aynı `peace.js`
 * araçlarını kullanıyor — YZ'nin işgalleri otomatik devreden ayrı yolu kalktı.
 */
function offerPeace(game, nation, foe, offer, rng) {
  if (foe.id === game.turns.playerNation) {
    game.receivePeaceOffer(nation.id, foe.id, offer);
    return;
  }
  if (acceptsOffer(game, foe, nation, offer, rng)) signPeace(game, nation.id, foe.id, offer);
}

/**
 * Diplomatik karar: sınır komşusu zayıfsa savaş, savaş kaybediliyorsa barış.
 * Sadece temas hâlindeki ülkelerle ilgilenir.
 */
function diplomacy(game, nation, rng) {
  const world = game.world;
  const contacts = world.contacts;
  if (!contacts) return;
  // Gerçek zaman başlar başlamaz sınır komşularının oyuncuya yığılması karar
  // vermeye fırsat bırakmıyordu; ilk üç ay seferberlik hazırlığıdır.
  if (game.turns.turn < 27) return;
  // Diplomasi haftalık zar atmaz. Her ülke ayda bir, farklı haftada değerlendirme
  // yapar; aksi halde %25 haftalık ihtimal birkaç ay içinde neredeyse kesin savaştı.
  if ((game.turns.turn + nation.id) % 4 !== 0) return;

  const myPower = nationStrength(world, nation);
  const wars = world.nations.filter((n) => n.alive && atWar(world, n.id, nation.id));

  // Savaşları masaya taşı: kazanan talebini toplar, kaybeden zararı durdurur.
  for (const foe of wars) {
    const rec = relation(world, nation.id, foe.id);
    if (game.turns.turn - rec.since < MIN_WAR_TURNS) continue;
    // Oyuncu masadaki teklifi cevaplayana kadar aynı savaş için ikincisi gelmez.
    if (game.hasPeaceOffer(nation.id, foe.id)) continue;
    const score = warScore(world, nation.id, foe.id);
    if (score >= PEACE_WIN_SCORE) {
      // Kazanan taraf son kuruşuna kadar dayatmaz; bütçenin bir kısmı masada
      // kalır. Ülkelerin bir kısmı toprak yerine tazminat/imtiyaz ister ki
      // her barış aynı görünmesin.
      const offer = buildOffer(world, nation.id, foe.id, {
        appetite: 0.75 + rng() * 0.25,
        termShare: rng() < 0.35 ? 0.5 : 0,
      });
      // SAVAŞIN GÖVDESİ. Kazanan taraf, ilk ucuz küme karşılanabilir olur olmaz
      // masaya oturmaz: ya cephe durmuş olmalı, ya talep tavana dayanmalı.
      // Beta 3'te bu kapı yoktu ve savaşların ortancası 12 haftaydı.
      const stalled = recordWarProgress(world, nation.id, foe.id, score);
      const saturated = offer.demands.length >= demandLimit(score);
      const bodied = game.turns.turn - rec.since >= WAR_MIN_BODY;
      // ELİ BOŞ MASAYA OTURMAZ. Ölçümde savaşların tamamı tam böyle
      // kapanıyordu: kazanan taraf hiçbir şey isteyemediği için beyaz barış
      // teklif ediyor, 68 yılda tek bir sınır değişmiyordu. Talebi
      // karşılanmayan kazanan cephede kalır.
      //
      // Tek istisna donmuş savaş: sekiz yılı geçmiş bir tıkanma kapanabilmeli,
      // yoksa cephe sonsuza kilitlenir (gec oyunun eski karar boşluğu).
      const stale = game.turns.turn - rec.since > 8 * 52;
      const ripe = stale || (bodied && (saturated || stalled >= WAR_STALL_WEEKS));
      if ((offerCost(world, offer) > 0 || stale) && ripe) {
        offerPeace(game, nation, foe, offer, rng);
      }
    } else if (score <= PEACE_LOSS_SCORE
      || myPower < nationStrength(world, foe) * 0.6) {
      offerPeace(game, nation, foe, surrenderOffer(world, nation, foe), rng);
    } else if (game.turns.turn - rec.since >= FROZEN_WAR_WEEKS) {
      // DONMUS SAVAS KACAGI: iki esik arasinda sikisan savasin (kimse ±30'a
      // ulasamiyor, guc dengesi yakin) HIC teklif vereni yoktu — koalisyonun
      // actigi uzak, cephesiz savaslar boyle onyillarca acik kaliyordu
      // (olculdu: 1300. haftada 1186 haftalik savas; savas maliyesi 17/26
      // ulkeyi kalici temerrutte tutuyordu). Uc yildir sonuc uretmeyen savas
      // beyaz baris teklif eder; alici onde ise peace.js beklentisi korur,
      // yorgunluk toleransi zamanla masayi kapatir.
      offerPeace(game, nation, foe, { demands: [], concessions: [], terms: [] }, rng);
    }
  }

  // Tek cepheye kilitlenen YZ, fethin şöhret bedelini hiç ödeyemiyordu: denge
  // noktası ~1 kare/tur işgal ister, ölçümde zirve şöhret 21 ve koalisyon hiç
  // kurulmuyordu. Açık ara üstün ve mevcut cephesinde kazanan ülke ikinci
  // cepheyi göze alır; üçüncüsü savaş zinciri demektir, oraya gidilmez.
  const committed = wars.reduce((sum, foe) => sum + nationStrength(world, foe), 0);
  const canOpenSecond = wars.length === 1
    && myPower > committed * 2
    && warScore(world, nation.id, wars[0].id) > 20;
  if (wars.length >= 2 || (wars.length === 1 && !canOpenSecond)) return;
  if (rng() > DECLARE_CHANCE) return;
  const regiments = world.units
    .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land')
    .reduce((sum, unit) => sum + regimentCount(unit), 0);
  if (regiments < 4 || nation.gold < 45 || (nation.economy?.stability ?? 0.6) < 0.40) return;
  // Şöhreti kirlenmiş ülke yeni savaş açmaz: koalisyon riski taşıyor.
  if ((nation.infamy ?? 0) > INFAMY_COALITION * 0.6) return;

  let bestTarget = null;
  let bestScore = 0;
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id) continue;
    if (atWar(world, other.id, nation.id)) continue;
    const contact = contacts[nation.id][other.id];
    if (!contact) continue;
    if (truceLeft(world, nation.id, other.id, game.turns.turn) > 0) continue;
    const ratio = myPower / Math.max(1, nationStrength(world, other));
    if (ratio < WAR_THRESHOLD) continue;
    // Çullanma sınırı: üçüncü saldırgan hiç binmez, ikincisi ancak açık ara
    // üstünlük ve gerçek bir sınırla biner (bkz. SECOND_FRONT_THRESHOLD).
    const fronts = attackerCount(world, other.id);
    if (fronts >= MAX_ATTACKERS) continue;
    if (fronts > 0
      && (ratio < SECOND_FRONT_THRESHOLD || contact < SECOND_FRONT_CONTACT)) continue;
    // Uzun sınır + zayıf komşu = cazip hedef. Rakip (nation.rivalId) daha
    // cazip: stratejik dusmanlik hedef secimini yonlendirir — mana degil,
    // agirlik (bkz. alliances.refreshRivals).
    const score = ratio * Math.log(1 + contact)
      * (other.id === nation.rivalId ? 1.35 : 1);
    if (score > bestScore) {
      bestScore = score;
      bestTarget = other;
    }
  }
  if (bestTarget) declareWar(game, nation.id, bestTarget.id);
}

/**
 * Ülke başına hedeflenen tümen sayısı. Tümenler artık birleşmediği için bir
 * birim = bir alay; eski hedef (2 + tiles/25) yığınlar birleşirken anlamlıydı,
 * şimdi ülkeleri savunmasız bırakıp savaş zincirini tetikliyordu.
 */
function desiredArmy(nation) {
  return 4 + Math.floor(nation.tiles / 12);
}

/**
 * Sıradaki kol. Topçu destek sınıfıdır: ordunun gövdesi piyade, hızı süvari,
 * ateş gücü topçudur. Her üçüncü alay topçu olsun ki YZ dengeli ordu kursun.
 */
function affordableUnit(game, nation, army) {
  const world = game.world;
  const wantsArtillery = army >= 3 && army % 3 === 0;
  const order = wantsArtillery
    ? ['ARMOR', 'ARTILLERY', 'AIRCRAFT', 'INFANTRY', 'CAVALRY']
    : ['INFANTRY', 'ARMOR', 'CAVALRY', 'ARTILLERY', 'AIRCRAFT'];
  for (const id of order) {
    // Tarihsel acilis burada sorulur. Sorulmadigi surece YZ 1836'da tanki
    // "karsilanabilir" sayip siraya sokmayi deniyor, buyUnit reddediyor ve
    // haftanin butun alim dongusu kiriliyordu (her ucuncu alayda).
    if (!unitAvailable(id, game.turns.turn, nation)) continue;
    if (canAfford(nation, UNIT_COSTS[id]) && canRecruit(world, nation, id)) return id;
  }
  return null;
}

/**
 * Harcama önceliği: önce yeterli ordu, sonra yeni şehir, artan altınla yine ordu.
 * Hazine biriktirmek YZ'yi pasifleştirdiği için son adım önemli.
 */
function spend(game, nation) {
  const world = game.world;
  const cities = world.cities.filter((c) => c.nationId === nation.id).length;

  // SEFERBERLIKTEN DONUS: temerrutteki devlet bariste ordusunu kucultur.
  // desiredArmy maliyeye bakmaz; yenilgiden cikan kalinti devlet gelirinin
  // katini maas+tedarike verip her hafta kucuk kucuk temerrude dusuyordu —
  // alim kapilari kapaliyken eldeki stok kimseye sorulmadan duruyordu.
  // Haftada bir birim, iki alaylik cekirdek savunma korunur.
  if ((nation.economy?.creditPenalty ?? 0) > 0.3
    && !world.nations.some((other) => other.alive && other.id !== nation.id
      && atWar(world, other.id, nation.id))) {
    const units = world.units
      .filter((u) => u.nationId === nation.id && u.type.domain !== 'sea');
    const total = units.reduce((sum, unit) => sum + regimentCount(unit), 0);
    if (total > 2) {
      const weakest = units.reduce(
        (worst, unit) => (regimentCount(unit) < regimentCount(worst) ? unit : worst),
        units[0],
      );
      if (weakest) disband(game, weakest);
    }
    return;
  }

  const militaryLines = (nation.economy?.factories ?? [])
    .filter((factory) => factory.typeId === 'ARMS_FACTORY')
    .map((factory) => ensureProductionLine(factory));
  const uncoveredCriticalStock = Object.values(MILITARY_EQUIPMENT).some((equipment) => (
    equipmentStock(nation, equipment.id) < equipment.reserve
    && !militaryLines.some((factory) => factory.lineEquipment === equipment.id)
  ));
  // Do not spend the military-factory fund on another unit or local project.
  // runEconomicAI executes later in the same week and buys the missing line.
  if (uncoveredCriticalStock) return;

  // Yeni şehir: gelirin asıl kaynağı, orduyu beslemekten önce gelir.
  if (canAfford(nation, { gold: CITY_COST.gold + 25 })
    && cities < 1 + nation.tiles / 45) {
    const unit = world.units.find(
      (u) => u.nationId === nation.id && canFoundCity(world, u.tile, nation.id),
    );
    if (unit) game.turns.foundCity(unit);
  }

  // Ordu, erzak fazlasının beslediği kadar büyür; altın ikincil frendir.
  const target = desiredArmy(nation);
  // Eğitimdeki alaylar da orduya sayılır. Sayılmasaydı YZ, sipariş sahaya
  // çıkana kadar (8-16 hafta) her hafta yeniden sipariş verir ve kuyruğu
  // hazinesinin yettiği kadar şişirirdi — kuyruğun getirdiği ilk risk budur.
  let army = world.units
    .filter((u) => u.nationId === nation.id)
    .reduce((sum, unit) => sum + regimentCount(unit), 0)
    + trainingCount(nation);
  const canFeed = () => true;

  // Kıyı ülkeleri mütevazı bir donanma tutar: adalar ve kıyı şehirleri savunmasız kalmasın.
  const hasPort = world.cities.some((c) => c.nationId === nation.id && c.tile.coastal);
  const fleet = world.units.filter(
    (u) => u.nationId === nation.id && u.type.domain === 'sea',
  ).length + trainingCount(nation, 'WARSHIP');
  if (hasPort && fleet < 1 + Math.floor(cities / 3) && canFeed()
    && canAfford(nation, UNIT_COSTS.WARSHIP)
    && game.turns.buyUnit(nation, 'WARSHIP')) {
    army++;
  }

  for (let i = 0; i < 3; i++) {
    // Hazine fazlası orduya dönüşür ama sert bir tavan var: ölçümde tek ülke
    // 93 süvari yığıp tur süresini 22 ms'ye çıkarmıştı.
    const surplus = nation.gold > 180 && army < Math.ceil(target * 1.35);
    if (army >= target && !surplus) break;
    if (!canFeed()) break;
    const typeId = affordableUnit(game, nation, army);
    if (!typeId || !game.turns.buyUnit(nation, typeId)) break;
    army++;
  }
}

/** Kara birimi kesintisiz en fazla bu kadar su karesi geçmeyi göze alır. */
const MAX_SEA_CROSSING = 5;

/**
 * Ulusun sahip olmadığı en yakın kara karesi (BFS).
 * Arama denizden de geçer (yoksa YZ adaları hiç keşfetmiyor) ama sınırlı
 * derinlikte: serbest bırakınca ordular okyanus aşırı akın yapıp haritayı
 * 150 turda iki ülkeye indiriyor.
 */
function nearestFrontier(world, from, nationId, maxNodes = 900) {
  // Barış içindeki komşunun toprağı ne hedeftir ne de geçit.
  const open = (t) => controllerOf(t) < 0 || controllerOf(t) === nationId
    || atWar(world, controllerOf(t), nationId);
  const depth = new Map([[from, 0]]);
  const queue = [from];
  let head = 0;
  while (head < queue.length && head < maxNodes) {
    const tile = queue[head++];
    if (controllerOf(tile) !== nationId && tile.terrain.passable && open(tile)) return tile;
    const seaDepth = depth.get(tile);
    for (const n of world.neighbors(tile)) {
      if (depth.has(n)) continue;
      if (n.terrain.passable && open(n)) depth.set(n, 0);
      else if (n.terrain.navigable && seaDepth < MAX_SEA_CROSSING) depth.set(n, seaDepth + 1);
      else continue;
      queue.push(n);
    }
  }
  return null;
}

/** Gemiler için hedef: en yakın düşman gemisi ya da kıyı şehri. */
function navalGoal(world, unit) {
  let best = null;
  let bestDist = Infinity;
  const consider = (tile) => {
    const d = world.wrapDistance(tile.q, tile.r, unit.tile.q, unit.tile.r);
    if (d < bestDist) {
      bestDist = d;
      best = tile;
    }
  };
  for (const other of world.units) {
    if (other.nationId === unit.nationId || !atWar(world, other.nationId, unit.nationId)) continue;
    if (other.embarked || other.type.domain === 'sea') consider(other.tile);
  }
  for (const city of world.cities) {
    if (city.nationId === unit.nationId || !atWar(world, city.nationId, unit.nationId)) continue;
    if (city.tile.coastal) consider(city.tile);
  }
  return best;
}

function adjacentEnemy(world, unit) {
  let best = null;
  for (const n of world.neighbors(unit.tile)) {
    for (const other of unitsOn(n)) {
      if (other.nationId === unit.nationId) continue;
      if (!atWar(world, other.nationId, unit.nationId)) continue;
      // En zayıfına vur: birim düşürme şansı yüksek olsun.
      if (!best || other.hp < best.unit.hp) best = { tile: n, unit: other };
    }
  }
  return best;
}

/**
 * Yakındaki düşman şehri varsa asıl hedef odur; toprak kapmaktan değerli.
 * Menzil dar tutuldu: geniş olunca herkes ilk 20 turda birbirinin başkentine
 * koşuyor ve harita üç ülkeye iniyor.
 */
function enemyCityNear(world, unit, maxDistance = 7) {
  let best = null;
  let bestDist = maxDistance;
  for (const city of world.cities) {
    if (city.nationId === unit.nationId) continue;
    if (!atWar(world, city.nationId, unit.nationId)) continue;
    const d = world.wrapDistance(city.tile.q, city.tile.r, unit.tile.q, unit.tile.r);
    if (d < bestDist) {
      bestDist = d;
      best = city.tile;
    }
  }
  return best;
}

/**
 * Tek birimin tur davranışı. Ayrı durması önemli: oyuncu "otomatik" emri
 * verdiği birimleri de aynı rutine devrediyor.
 */
export function runUnitAI(game, unit, rng) {
  const world = game.world;
  if (unit.hp <= 0 || unit.battleId || (unit.retreatUntil ?? 0) > game.turns.turn) return;

  // 1) Bitişikte düşman varsa saldır (denizdeki kara birimi saldıramaz).
  const target = adjacentEnemy(world, unit);
  if (target && !unit.embarked) {
    game.attack(unit, target.tile);
    return;
  }

  // 2) Değilse hedefe ilerle: gemiler denizi, kara birimleri sınırı kollar.
  const goal = unit.type.domain === 'sea'
    ? navalGoal(world, unit)
    : (enemyCityNear(world, unit) ?? nearestFrontier(world, unit.tile, unit.nationId));
  if (!goal || goal === unit.tile) return;

  // Yürüyüş sürekli olduğu için her hafta yeniden yol aramaya gerek yok:
  // yalnız hedef değiştiyse ya da ordu duruyorsa yeni yol kurulur.
  if (isMoving(unit) && destinationOf(unit) === goal) return;
  orderMove(game, unit, goal);
}

/**
 * Ordu grubu yönetimi. YZ artık tümenleri tek tek gezdirmez: hepsini
 * generallerine dağıtır, her gruba bir düşman ve bir duruş verir, gerisini
 * komuta katmanına bırakır (bkz. command.js).
 *
 * Eski davranış — "her tümen en yakın sınıra koşsun" — orduları tek tek
 * daldırıp sınırları parçalıyordu; cephe diye bir şey oluşmuyordu.
 */
function manageCommand(game, nation) {
  const world = game.world;
  // Yalniz kara kadrosu: amiralin cephesi yoktur, ona tumen verilmez.
  const generals = officersOf(nation, BRANCH.ARMY);
  if (!generals.length) return;

  // Komutasız kalan tümen en küçük gruba katılır: gruplar dengeli büyüsün.
  for (const unit of world.units) {
    if (unit.nationId !== nation.id || unit.type.domain !== 'land') continue;
    if (generalOfArmy(nation, unit)) continue;
    const host = generals.reduce((a, b) => (commandSize(a) <= commandSize(b) ? a : b));
    assignDivisions(nation, host.id, [unit]);
  }

  const foes = world.nations.filter((other) => other.alive && atWar(world, other.id, nation.id));
  const myPower = nationStrength(world, nation);
  generals.forEach((general, index) => {
    if (!general.divisions.length) return;
    // Her grup bir düşmana bakar; düşman yoksa hedefsiz kalır ve sınırı tutar.
    const wanted = foes.length ? foes[index % foes.length].id : null;
    if (general.target !== wanted) {
      // setTarget yerine doğrudan yazılır: cepheyi zaten runCommand tazeleyecek,
      // general başına ayrı bir dünya taraması yaptırmaya değmez.
      general.target = wanted;
      general.planning = 0;
    }
    // Üstünsek ilerle, değilsek tut. Barışta ilerleme sahipsiz toprağa genişlemektir.
    const foe = wanted == null ? null : world.nations[wanted];
    const advancing = foe
      ? myPower > nationStrength(world, foe) * 0.9
      : true;
    setStance(world, general, advancing ? STANCE.ADVANCE : STANCE.HOLD);
  });
}

/**
 * Yasa çıkarma. Reform oyuncuya özel bir kaldıraç olmamalı: YZ de aynı
 * meclis kapısından geçer. Karar iktidar partisinin isteğidir — merdivende
 * partisinin durmak istediği noktanın gerisindeyse bir basamak ilerler.
 * Böylece sosyalist hükûmet sosyal yasaları, liberal hükûmet siyasi yasaları
 * kendiliğinden sürer; gerici hükûmet hiçbirini sürmez.
 *
 * Haftada en fazla bir yasa ve borçluyken hiç: yeni taahhüt hazineyi batırmasın.
 */
function reformAgenda(game, nation) {
  // Meclis her hafta toplanmaz. Ulus başına çeyrek yılda bir, farklı
  // haftalarda değerlendirilir — hem doğru tempo hem de zorunlu bir
  // performans kararı: reformBoard 21 merdivenin tamamını kurar ve haftalık
  // çağrı haftalık tahsisatı 9 MB'den 30 MB'ye çıkarıyor (ölçüldü).
  if ((game.turns.turn + nation.id) % 12 !== 0) return;
  if ((nation.gold ?? 0) < 0) return;
  const ruling = rulingParty(nation);
  if (!ruling) return;
  for (const row of reformBoard(nation)) {
    if (!row.canEnact) continue;
    if (desiredIndex(row.group, ruling.ideology) < row.next.index) continue;
    if (enactReform(game, nation, row.group.id)) return;
  }
}

export function runNationAI(game, nation, rng) {
  const world = game.world;
  diplomacy(game, nation, rng);
  spend(game, nation);
  reformAgenda(game, nation);
  manageCommand(game, nation);
  // Kara tümenleri komuta katmanından yönetilir; burada yalnız donanma kalır.
  for (const unit of [...world.units]) {
    if (unit.nationId === nation.id && unit.type.domain === 'sea') runUnitAI(game, unit, rng);
  }
}
