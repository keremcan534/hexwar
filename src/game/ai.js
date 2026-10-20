// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import {
  MIN_WAR_TURNS, atWar, attackerCount, declareWar, hostile, hostileNations, nationStrength,
  recordWarProgress, relation, truceLeft,
} from './diplomacy.js';
import { manageMobilization, mobilizationRifleReserve } from './mobilization.js';
import { manageAcceptance, manageBrokenProvinces } from './culture.js';
import { manageMovements } from './movements.js';
import {
  buildOffer, demandLimit, occupiedProvincesOf, offerCost, offerMeetsExpectation, provinceKeyOf,
  signPeace, suggestWarGoal, warScore,
} from './peace.js';
import { INFAMY_COALITION } from './infamy.js';
import {
  SHIP_CLASSES, UNIT_TYPES, isConscript, isMilitia, isMoving, isRegular, maxHpOf, menUnderArms, regimentCount,
  shipClassOf, unitAvailable, unitsOn,
} from './units.js';
import { destinationOf, orderMove } from './movement.js';
import { controllerOf } from './control.js';
import {
  canRecruit, disband, nationManpower, trainingCount, trainingQueue,
} from './recruitment.js';
import {
  BRANCH, STANCE, assignDivisions, commandSize, generalOfArmy, officersOf, setStance,
} from './command.js';
import { autoLineWeights, equipmentStock } from './econ/industry.js';
import {
  ARMY_POOL_SHARE, ARMY_SUPPLY_CAP, ARMY_SUPPLY_LIMIT, ARMY_SUPPLY_SHARE, FEED, FLEET_SUPPLY_LIMIT,
  IC_SCALE, UNIT_EQUIPMENT,
} from './econ/defs.js';
import { inSupplyCrisis, unitSupply } from './econ/bills.js';
import { LAWS, lawIndex } from './laws.js';
import { politicsAI, setLaw } from './politics.js';
import { unificationAI } from './unification.js';
import { decisionBlockers, decisionsAI, takeDecision } from './decisions.js';
import { delegationActive, isDelegated, noteDelegated } from './delegation.js';
import { nodeNeighbors } from '../world/provinceGraph.js';
import { autoFocus } from './stateFocus.js';
import { alliesOf } from './alliances.js';
import { worldWarTension } from './worldEvents.js';
import { planLandings } from './landings.js';
import {
  classIndexOf, fleetEquivalent, fleetStrength, isObsolete, scrapShips, shipsOf, subsOf, surfaceOf,
} from './navy.js';

/** Savaş ilanı için gereken güç üstünlüğü. */
// 1.4 -> 1.6 -> 1.8 (2026-09-04: kusatma ve bos cepheye yuruyus savaslari
// kesinlestirdi, 50 yilda %39-45 kume el degistirdi): 50 yilda haritanin ucte birinden fazlasi el degistiriyordu
// (audit:borders %35-39); daha kesin ustunluk ister, daha az savas acar.
const WAR_THRESHOLD = 1.8;
/** Hedefin müttefiklerinin güç oranındaki ağırlığı (bkz. diplomacy hedef seçimi). */
const ALLY_WEIGHT = 0.5;

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
// Iki yil (156 -> 104, 2026-09-04: seferberlikle donmus cephe sıklaştı) sonuc
// uretmeyen savas masaya beyaz baris koyar (bkz. asagida
// donmus-savas dali). 8 yillik `stale` kapisi yalniz KAZANAN dalinda
// yasiyordu; 0-0 savasin teklif vereni hic yoktu.
const FROZEN_WAR_WEEKS = 104;

/**
 * Yorgunluk merdiveninin YZ basamakları (redesign D5 "Exhaustion ladder";
 * tablo P5'te politics.js EXHAUSTION_LADDER olur). 0.30 üstünde yeni savaş
 * yok, 0.85'te teslim. P1'de `politics.exhaustion` yazılmaz; okuyucular
 * `?? 0` ile kapalı kalır.
 */
const EXHAUSTION_NO_WAR = 0.30;
const EXHAUSTION_SURRENDER = 0.85;

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
      || myPower < nationStrength(world, foe) * 0.6
      // TESLİM (redesign D5, P1'de uyur): yorgunluğu 0.85'e varan ülke kaybetmese
      // de teslim teklifiyle gelir. `exhaustion` yazılana dek 0 okunur, dal kapalı.
      || (nation.politics?.exhaustion ?? 0) >= EXHAUSTION_SURRENDER) {
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
  // Dünya gerilimi (barut fıçısı): ilan zarı ve güç eşiği gevşer; zar sayısı
  // değişmez (tek çekiliş) ki gerilimsiz yıllarda determinizm aynı kalsın.
  const tension = worldWarTension(world, game.turns.turn);
  if (rng() > DECLARE_CHANCE * tension.declare) return;
  // Milis savaş açtırmaz: yalnız kendi toprağını tutar (D6).
  const regiments = world.units
    .filter((unit) => unit.nationId === nation.id && unit.type.domain === 'land' && !isMilitia(unit))
    .reduce((sum, unit) => sum + regimentCount(unit), 0);
  // İkmali sıkışık ülke savaş açmaz: faturalar çıktının %45'ini aşıyorsa
  // seferberlik onu krize iter (eski kapı: hazinede 20 altın).
  const bills = nation.economy?.bills;
  const strained = bills && (bills.s < 1 || bills.owed > 0.45 * (nation.economy?.ic?.output ?? Infinity));
  if (regiments < 4 || strained || (nation.stability ?? 0.6) < 0.35
    || (nation.warSupport ?? 0.5) < 0.3 || (nation.power ?? 0) < 20
    // Yorgun ülke yeni savaş açmaz (redesign D5 merdiveni, P1'de uyur:
    // `exhaustion` yazılana dek 0 okunur). Zar yukarıda çekildi; kapı sırası
    // zar dizisini değiştirmez.
    || (nation.politics?.exhaustion ?? 0) > EXHAUSTION_NO_WAR) return;
  // Şöhreti kirlenmiş ülke yeni savaş açmaz: koalisyon riski taşıyor.
  if ((nation.infamy ?? 0) > INFAMY_COALITION * 0.6) return;

  // Iki cephesi olan devlet ucuncusunu kendisi acmaz: cullanma tavani
  // saldirganlari sayiyordu ama kurbanin KENDI ilani dorduncu savasi
  // dogurabiliyordu (audit:war-pressure: azami eszamanli saldirgan 4).
  if (attackerCount(world, nation.id) >= MAX_ATTACKERS) return;
  let bestTarget = null;
  let bestScore = 0;
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id) continue;
    if (hostile(world, other.id, nation.id)) continue;
    const contact = contacts[nation.id][other.id];
    if (!contact) continue;
    if (truceLeft(world, nation.id, other.id, game.turns.turn) > 0) continue;
    // HEDEFİN MÜTTEFİKLERİ yarım ağırlıkla sayılır: savaş ilanı onları da
    // çağırır (callAlliesToWar). Saymadığında kartopu %38'di; 0.5 ile %24
    // (6 tohumun 5'i <= %33). 0.25 gürültüde kaldı, 1.0 %19'a aşırı düşürdü.
    const allied = alliesOf(other).reduce((sum, id) => {
      const ally = world.nations[id];
      return ally?.alive && ally.id !== nation.id ? sum + nationStrength(world, ally) : sum;
    }, 0);
    const ratio = myPower / Math.max(1, nationStrength(world, other) + ALLY_WEIGHT * allied);
    if (ratio < WAR_THRESHOLD * tension.threshold) continue;
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
  // Devredilmis diplomasi oyuncu adina ilan verebilir; YZ icin bayrak
  // etkisizdir (zaten oyuncu degil).
  const delegated = nation.id === game.turns.playerNation;
  // YZ de hedefsiz savasa girmez: sinirina komsu, en degerli kumeyi hedefler
  // (bkz. peace.js suggestWarGoal). Boylece oyuncu masada karsi tarafin ne
  // istedigini de gorebilir.
  const goal = bestTarget ? suggestWarGoal(game.world, nation.id, bestTarget.id) : null;
  if (bestTarget && declareWar(game, nation.id, bestTarget.id,
    { delegated, goal: goal?.id ?? null })) {
    noteDelegated(game, nation, 'diplomacy', `War declared on ${bestTarget.name}.`,
      'The ministry judged them weaker and the border long.');
  }
}

/**
 * Ülke başına hedeflenen düzenli alay sayısı ve insan gücü tavanı. Tümenler
 * artık birleşmediği için bir birim = bir alay; eski hedef (2 + tiles/25)
 * yığınlar birleşirken anlamlıydı, şimdi ülkeleri savunmasız bırakıp savaş
 * zincirini tetikliyordu.
 *
 * Tavan askerlik yasasının havuzunun (silah altındakiler dahil) barışta
 * yarısı, savaşta ya da ültimatomda %80'idir (ARMY_POOL_SHARE): barış ordusu
 * yedeği tüketmez, seferberlik ve takviye ondan beslenir. Kura alayları
 * tavandan düşülür.
 */
function armyPlan(world, nation) {
  const war = hostileNations(world, nation.id).length > 0;
  const byLand = 4 + Math.floor(nation.tiles / 12);
  // Çıktı: zengin ülke toprağından büyük ordu tutabilir (bkz. ARMY_SUPPLY_SHARE):
  // çıktının bu payı kadar alay ikmali (barış fiyatıyla).
  const output = Math.max(0, nation.economy?.outputAvg ?? 0);
  const byBudget = Math.floor(output * ARMY_SUPPLY_SHARE / unitSupply(nation, 'land', world.turn ?? 0));
  const soldiers = nation.economy?.soldiers ?? 0;
  let conscripts = 0;
  // Milis (levée, D6) kanun havuzunun dışındadır: adamları silah altındakilere
  // (economy.soldiers, claimSoldiers) girse de düzenli ordunun tavanını ne
  // büyütür ne küçültür; kura gibi tavandan da düşülmez. Milis yokken 0.
  let militiaMen = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id) continue;
    if (isMilitia(unit)) militiaMen += menUnderArms(unit);
    else if (isConscript(unit)) conscripts += regimentCount(unit);
  }
  const share = war ? ARMY_POOL_SHARE.war : ARMY_POOL_SHARE.peace;
  const byPeople = Math.floor((nationManpower(world, nation.id) + soldiers - militiaMen) * share
    / UNIT_TYPES.INFANTRY.manpower) - conscripts;
  const cap = Math.max(2, byPeople);
  // Toprak tabanı (byLand) çıktıya bakmıyordu: geniş ama yoksul ülke
  // besleyemeyeceği orduyu tutup barışta ikmal krizine giriyordu (barış
  // ulus-haftalarının %1.8'i, audit:econ). Ordu ikmali en çok çıktının
  // ARMY_SUPPLY_LIMIT payı (savaş fiyatıyla, savaştaysa).
  const bySupply = Math.floor(output * ARMY_SUPPLY_LIMIT / unitSupply(nation, 'land', world.turn ?? 0, war));
  const target = Math.max(2, Math.min(Math.max(byLand, Math.min(byBudget, byLand * ARMY_SUPPLY_CAP)), cap, bySupply));
  return { target, cap, war };
}

/**
 * Barışta havuzun barış payını aşan düzenli ordu terhis edilir: savaşta
 * kurulan alaylar kalırsa ordu savaş boyunda kalır ve bir sonraki savaşın
 * yedeği olmaz. Ayda bir, en yıpranmış tek alay (muharebede ve yolda
 * olmayan); adamları havuza, silahları depoya döner (recruitment.disband).
 * Yalnız İNSAN tavanına bakar: çıktının taşıyamadığı ordunun kemeri
 * supplyAI'dır.
 */
function standDown(game, nation, army, cap) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  if (army <= cap + 1 || (turn + nation.id) % 4 !== 0) return false;
  let weakest = null;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id || unit.type.domain !== 'land' || !isRegular(unit)) continue;
    if (unit.battleId || isMoving(unit)) continue;
    const ratio = unit.hp / Math.max(1, maxHpOf(unit));
    if (!weakest || ratio < weakest.ratio || (ratio === weakest.ratio && unit.id > weakest.unit.id)) {
      weakest = { unit, ratio };
    }
  }
  return weakest ? disband(game, weakest.unit) : false;
}

/**
 * Sıradaki kol. Gövde piyade, hız süvari, ateş gücü topçu: her üçüncü alay
 * topçu (top stoğu varsa), her beşinci süvari (at açığı yoksa). Kol açıksa,
 * teçhizatı depodaysa ve petrolü yetiyorsa her dördüncü alay tank, her
 * altıncısı uçak: yakıtsız tank demirdir (battles.fuelFactor).
 */
function affordableUnit(game, nation, army) {
  const world = game.world;
  const horses = nation.economy?.resources?.HORSES?.ratio ?? 1;
  const oil = nation.economy?.resources?.OIL?.ratio ?? 1;
  const stocked = (typeId) => Object.entries(UNIT_EQUIPMENT[typeId])
    .every(([id, amount]) => equipmentStock(nation, id) >= amount);
  const order = army >= 3 && army % 4 === 1 && oil >= 0.7 && stocked('ARMOR') ? ['ARMOR', 'INFANTRY']
    : army >= 3 && army % 6 === 2 && oil >= 0.7 && stocked('AIRCRAFT') ? ['AIRCRAFT', 'INFANTRY']
      : army >= 3 && army % 3 === 0 && equipmentStock(nation, 'guns') >= UNIT_EQUIPMENT.ARTILLERY.guns
        ? ['ARTILLERY', 'INFANTRY']
        : army >= 4 && army % 5 === 0 && horses >= 0.9 ? ['CAVALRY', 'INFANTRY'] : ['INFANTRY'];
  for (const id of order) {
    if (!unitAvailable(id, nation)) continue;
    if (canRecruit(world, nation, id)) return id;
  }
  return null;
}

/** Kuyrukta teçhizat bekleyen sipariş sayısı. */
function waitingForEquipment(nation) {
  return trainingQueue(nation).filter((item) => Object.keys(item.missing ?? {}).length).length;
}

/**
 * Harcama: önce yeterli ordu. Teçhizat yoksa sipariş vermez (kuyrukta
 * bekleyen iki siparişten fazlası depoyu bekler, kışlayı değil). İkmal
 * krizindeki ülke yeni alay kurmaz; küçültmeyi supplyAI yapar.
 */
function spend(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? 0;
  const atWarNow = world.nations.some((other) => other.alive && other.id !== nation.id
    && atWar(world, other.id, nation.id));
  if (inSupplyCrisis(nation)) return;
  if (waitingForEquipment(nation) >= 2) return;

  const { target, cap, war } = armyPlan(world, nation);
  // Kuyruktaki gemi ordu sayılmaz: filoya katılır (navy.js).
  let army = world.units
    .filter((u) => u.nationId === nation.id && isRegular(u))
    .reduce((sum, unit) => sum + regimentCount(unit), 0)
    + trainingCount(nation) - trainingCount(nation, 'WARSHIP') - trainingCount(nation, 'SUBMARINE');

  // Donanma artık abluka ve geçiş kaybıyla ölçülen bir kaldıraçtır (navy.js):
  // hedef kıyı uzunluğu, sanayi ve savaştaki düşman filosuyla büyür. Hedef
  // gemi EŞDEĞERİdir (eski gövde sınıf gücü oranında sayılır); gövde tavanı
  // ayrıdır, bakımı ve mürettebatı o tutar.
  const building = trainingCount(nation, 'WARSHIP');
  const fleet = fleetEquivalent(nation) + building;
  const hulls = surfaceOf(nation).length + building;
  const wanted = desiredFleet(world, nation);
  if (fleet < wanted && hulls < fleetCap(nation)
    && equipmentStock(nation, 'ships') >= UNIT_EQUIPMENT.WARSHIP.ships) {
    game.turns.buyUnit(nation, 'WARSHIP');
  }
  // DENİZALTI (Submarines): ticaret akını filonun yerine değil yanınadır.
  const subs = subsOf(nation).length + trainingCount(nation, 'SUBMARINE');
  if (unitAvailable('SUBMARINE', nation) && subs < desiredSubs(world, nation)
    && equipmentStock(nation, 'ships') >= UNIT_EQUIPMENT.SUBMARINE.ships) {
    game.turns.buyUnit(nation, 'SUBMARINE');
  }
  // MODERNLEŞME (dretnot anı): barışta çeyrekte bir, gövde tavanı doluysa ya
  // da filo hedefi tutuyorsa en eski gövde hurdaya; boşalan yere yeni sınıf
  // kurulur. Yokken eski zırhlılar tavanı tutuyor, YZ hiç dretnot kurmuyordu.
  if (!atWarNow && (turn + nation.id) % 13 === 0) {
    const old = shipsOf(nation).filter((ship) => isObsolete(nation, ship));
    if (old.length && (hulls >= fleetCap(nation) || fleet >= wanted)) {
      const oldest = old.reduce((a, b) => ((b.gen ?? 0) < (a.gen ?? 0)
        || ((b.gen ?? 0) === (a.gen ?? 0) && b.hp < a.hp) ? b : a));
      scrapShips(world, nation, [oldest]);
      noteDelegated(game, nation, 'recruitment', `Scrapped the obsolete ${shipClassOf(oldest).name.toLowerCase()} ${oldest.name}.`,
        `A ${SHIP_CLASSES[classIndexOf(nation)].name.toLowerCase()} takes her berth.`);
    }
  }

  // Çıktı fazlası hedefi aşabilir ama insan gücü tavanını aşamaz: eskiden
  // aşıyordu ve barış ordusu yedeği de içiyordu.
  const ceiling = Math.min(Math.ceil(target * 1.25), cap);
  if (!war && !atWarNow && standDown(game, nation, army, cap)) {
    noteDelegated(game, nation, 'recruitment', 'A regiment was stood down into the reserve.',
      'In peacetime the standing army keeps to half the manpower; the rest mobilises in war.');
    return;
  }
  for (let i = 0; i < 3; i++) {
    // Faturalar rahat (çıktının dörtte birinin altında) ve fon artıdaysa.
    const bills = nation.economy?.bills;
    const surplus = army < ceiling && bills && bills.s >= 1
      && bills.owed < 0.25 * (nation.economy?.ic?.output ?? 0) && (nation.fund ?? 0) >= 0;
    if (army >= target && !surplus) break;
    if (equipmentStock(nation, 'rifles') < UNIT_EQUIPMENT.INFANTRY.rifles
      && waitingForEquipment(nation) >= 1) break;
    const typeId = affordableUnit(game, nation, army);
    if (!typeId || !game.turns.buyUnit(nation, typeId)) break;
    army++;
  }
}

/**
 * HALKIN DOYURULMASI — tek kolun YZ kuralı (oyuncunun AUTO'su aynı kapı).
 * Barışta kişiliğe göre ihtiyacın 0.95-1.10 katı, savaşta 0.85; istikrar
 * çökerken +0.10 (en çok 1.2). Yalnız 'auto' kipine yazar. Değiştiyse true.
 */
export function autoFeed(nation) {
  const economy = nation.economy;
  if (!economy) return false;
  economy.feed ??= { mode: 'auto', target: FEED.peace };
  if (economy.feed.mode !== 'auto') return false;
  const war = (economy.warFronts ?? 0) > 0;
  let target = war ? FEED.war
    : nation.focus === 'economy' ? 1.0
      : nation.focus === 'admin' ? 1.1
        : nation.focus === 'military' ? 0.95 : FEED.peace;
  if ((nation.stability ?? 0.5) < 0.4) target = Math.min(1.2, target + FEED.unrest);
  target = Math.round(target / FEED.step) * FEED.step;
  if (Math.abs(target - economy.feed.target) < 1e-9) return false;
  economy.feed.target = target;
  return true;
}

/**
 * EKONOMİ YZ'si — oyuncunun AUTO'suyla aynı kapı. Ayda bir: halkın
 * doyurulması, hat ağırlıkları ordunun ihtiyacına göre, ticaret yasası kaynak
 * dengesine göre. Kalkınma bir simülasyon kuralıdır (econ/investment.js).
 */
export function economyAI(game, nation) {
  const turn = game.turns?.turn ?? 0;
  if ((turn + nation.id) % 4 !== 0) return null;
  const economy = nation.economy;
  if (!economy) return null;
  // Hat ağırlıkları: yalnız 'auto' kipindeki hatlara (oyuncunun elle
  // seçtiğine dokunmaz). Çağrı YERİ eskisiyle aynı (YZ evresi): ekonomi
  // evresine taşınınca alay sayımı bir evre kayıyor ve kaotik simülasyon
  // bütünüyle ayrışıyordu (ölçüldü: sınır kartopu B3 %40.5 → %51.4).
  autoLineWeights(game.world, nation, { rifles: mobilizationRifleReserve(game.world, nation) });
  const fed = autoFeed(nation);
  // Ticaret yasası: satacak fazlası olan açılır, açığı çok ve altını az
  // olan (ithalat bedeli ×1.5) kapanmaz; ablukadaki savaşan küçültmez.
  let surplusValue = 0;
  let deficitValue = 0;
  for (const record of Object.values(economy.resources ?? {})) {
    surplusValue += Math.max(0, record.produced - record.need) * (record.price || 1);
    deficitValue += Math.max(0, record.need - record.produced) * (record.price || 1);
  }
  const trade = lawIndex(nation, 'trade');
  const income = Math.max(1, economy.outputAvg ?? 1);
  let wanted = trade;
  // Fazlası olan açılır: kapalı pazar dünyanın kıtlığını büyütür (ölçüldü:
  // dünya demiri ihtiyacın 3-5 katıyken ulus-haftaların %19'unda demir kıttı;
  // ihracat payı %25'te kalan üreticiler açığı kapatamıyordu).
  if (surplusValue > income * 0.04 && trade < 2) wanted = trade + 1;
  else if (trade === 0 && deficitValue > 0) wanted = 1;
  if (wanted !== trade && (nation.power ?? 0) >= 60) {
    if (setLaw(game, nation, 'trade', wanted)) return { action: 'trade', text: `Trade law set to ${LAWS.trade.options[wanted].name}.` };
  }
  if (fed) {
    return {
      action: 'feed',
      text: `The people are now fed at ${Math.round(economy.feed.target * 100)}% of their need.`,
    };
  }
  return null;
}

/**
 * İKMAL KEMERİ (eski kemer sıkmanın yerine). Faturalar tavanı aşınca (ikmal
 * krizi) ya da barışta çıktının %45'ini geçince, ayda bir tek adım. Barışta:
 * toprak hedefinin üstündeki en zayıf alay terhis, sonra okul, sonra uzun
 * mesai. Savaşta: uzun mesai (istikrar yetiyorsa), sonra ekonomiye el koyma
 * kararı, sonra okul.
 */
export function supplyAI(game, nation) {
  const economy = nation.economy;
  const turn = game.turns?.turn ?? 0;
  if (!economy?.bills || (turn + nation.id) % 4 !== 1) return null;
  const atWarNow = (economy.warFronts ?? 0) > 0;
  const output = Math.max(1e-9, economy.ic?.output ?? 0);
  const stressed = economy.bills.s < 1 || (!atWarNow && economy.bills.owed > 0.45 * output);
  if (!stressed) return null;
  const world = game.world;
  const education = lawIndex(nation, 'education');
  const labour = lawIndex(nation, 'labour');
  if (!atWarNow) {
    const byLand = 4 + Math.floor(nation.tiles / 12);
    const units = world.units.filter((u) => u.nationId === nation.id && u.type.domain !== 'sea'
      && !u.battleId && isRegular(u));
    const total = units.reduce((sum, unit) => sum + regimentCount(unit), 0);
    // Barış krizinde ayda üç alaya dek: tek alay ayları alıyordu ve savaş
    // sonrası şişkin ordu barışta krizde kalıyordu (ulus-haftaların %2-3'ü).
    let stood = 0;
    const pool = [...units].sort((a, b) => regimentCount(a) - regimentCount(b) || b.id - a.id);
    let left = total;
    for (const unit of pool) {
      if (stood >= (economy.bills.s < 1 ? 3 : 1) || left <= Math.max(2, byLand)) break;
      const size = regimentCount(unit);
      if (disband(game, unit)) {
        stood++;
        left -= size;
      }
    }
    if (stood) return `${stood === 1 ? 'A regiment was' : `${stood} regiments were`} stood down: the country could not supply them.`;
    const laidUp = layUpOldest(world, nation, economy.bills);
    if (laidUp) return laidUp;
    if (education > 0 && setLaw(game, nation, 'education', education - 1)) return 'School spending cut to make room for the army\'s bills.';
    if (labour < 2 && setLaw(game, nation, 'labour', 2)) return 'The working week was lengthened to pay the state\'s bills.';
    return null;
  }
  if (labour < 2 && (nation.stability ?? 0.5) >= 0.4 && setLaw(game, nation, 'labour', 2)) {
    return 'The working week was lengthened for the war.';
  }
  if ((nation.power ?? 0) >= 80 && !decisionBlockers(nation, 'requisition_economy', turn).length
    && takeDecision(game, nation, 'requisition_economy')) return 'The economy was requisitioned for the war.';
  if (education > 0 && setLaw(game, nation, 'education', education - 1)) return 'School spending cut for the war.';
  // Savaşta kriz sürüyorsa ordu değil filo küçülür: cephedeki alay savaşı
  // taşır, eski gövde ise faturanın yarısını yer (krizdeki savaşan
  // ülkelerde donanma faturası ordununkine yakındı; ölçüldü, kriz %10-12).
  if (economy.bills.s < 1) return layUpOldest(world, nation, economy.bills);
  return null;
}

/**
 * Gemi faturası ordununkinin yarısını aşıyorsa en eski (eşitse en hırpalı)
 * su üstü gövdesi hurdaya: donanma ordudan pahalıdır ve filo tavanı çıktıya
 * bağlanmadan önce kurulmuş olabilir.
 */
function layUpOldest(world, nation, bills) {
  const ships = surfaceOf(nation);
  if (!ships.length || bills.navy < bills.army * 0.5) return null;
  const oldest = ships.reduce((a, b) => ((b.gen ?? 0) < (a.gen ?? 0)
    || ((b.gen ?? 0) === (a.gen ?? 0) && b.hp < a.hp) ? b : a));
  scrapShips(world, nation, [oldest]);
  return `The ${shipClassOf(oldest).name.toLowerCase()} ${oldest.name} was laid up: the country could not supply her.`;
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
    // Province grafı: karada province'ten province'e, denizde hex hex.
    for (const n of nodeNeighbors(world, tile)) {
      if (depth.has(n)) continue;
      if (n.terrain.passable && open(n)) depth.set(n, 0);
      else if (n.terrain.navigable && seaDepth < MAX_SEA_CROSSING) depth.set(n, seaDepth + 1);
      else continue;
      queue.push(n);
    }
  }
  return null;
}

/**
 * DONANMA HEDEFİ (gemi sayısı). Kıyı province'i başına çeyrek gemi + her 60
 * IC'ye bir; savaşta kıyısı olan düşmanın filosunun %80'i. Tavan sanayiyle:
 * tersanesi zayıf ülke deniz yarışına girmez.
 */
export function desiredFleet(world, nation) {
  let coastal = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id && province.coastal) coastal++;
  }
  if (!coastal) return 0;
  const ic = nation.economy?.ic?.total ?? 0;
  // Savaşta bütün kıyılı düşmanların filosu birlikte sayılır: iki düşmana
  // karşı tek filonun %80'ini kuran ülke ikisine birden yeniliyordu. Düşman
  // gemisi bizim sınıfımız cinsinden sayılır: dretnot iki eski zırhlıdır.
  const top = SHIP_CLASSES[classIndexOf(nation)].power;
  let enemyShips = 0;
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id || !atWar(world, nation.id, other.id)) continue;
    if (!other.economy?.coastal) continue;
    for (const ship of shipsOf(other)) enemyShips += shipClassOf(ship).power / top;
  }
  const target = Math.max(Math.round(coastal * 0.25 + ic / (60 * IC_SCALE)), Math.ceil(enemyShips * 0.8));
  return Math.max(1, Math.min(target, fleetCap(nation)));
}

/**
 * Denizaltı hedefi: barışta küçük bir filotilla, savaşta gövde tavanının
 * yarısı; düşman yüzey filosu bizimkinden güçlüyse bir buçuk katı — zayıf
 * deniz gücünün cevabı ticaret akınıdır (1915-17'nin dersi).
 */
export function desiredSubs(world, nation) {
  if (!nation.economy?.coastal || !unitAvailable('SUBMARINE', nation)) return 0;
  const enemies = world.nations.filter((other) => other.alive && other.id !== nation.id
    && atWar(world, nation.id, other.id) && other.economy?.coastal);
  if (!enemies.length) return 2;
  const theirs = enemies.reduce((sum, enemy) => sum + fleetStrength(enemy), 0);
  const base = Math.max(2, Math.round(fleetCap(nation) / 2));
  return theirs > fleetStrength(nation) * 1.2 ? Math.round(base * 1.5) : base;
}

/** Gövde tavanı: bakım ve mürettebat sanayiyle ölçeklenir. */
export function fleetCap(nation) {
  const byIndustry = 4 + Math.round((nation.economy?.ic?.total ?? 0) / (25 * IC_SCALE));
  // Gövde ikmali çıktının FLEET_SUPPLY_LIMIT payını geçmez: "en az 4 gemi"
  // tabanı çıktısı haftada 8 IC olan devlete 13 IC'lik gemi faturası
  // yüklüyor, küçük kıyı devletlerini yıllarca ikmal krizinde tutuyordu
  // (ölçüldü, audit:econ ec3).
  const output = Math.max(0, nation.economy?.outputAvg ?? 0);
  // Gemi başına barış ikmali: çağ çarpanı geçen haftanın faturasından (bu
  // fonksiyon dünyayı almaz; tur 0'daki birim ikmali × çağ).
  const perShip = unitSupply(nation, 'sea', 0) * (nation.economy?.bills?.era ?? 1);
  const bySupply = Math.floor(output * FLEET_SUPPLY_LIMIT / perShip);
  return Math.max(0, Math.min(byIndustry, bySupply));
}

function adjacentEnemy(world, unit) {
  let best = null;
  for (const n of nodeNeighbors(world, unit.tile)) {
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

  // 2) Değilse hedefe ilerle: düşman şehri ya da sınır.
  const goal = enemyCityNear(world, unit) ?? nearestFrontier(world, unit.tile, unit.nationId);
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

  // Ültimatomdaki düşman da cephe ister: gruplar sınıra o hafta yerleşir,
  // savaş başlayınca yürüyüşle vakit kaybetmez. İlerleme ise yalnız savaşta.
  const foes = hostileNations(world, nation.id);
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
      ? atWar(world, foe.id, nation.id) && myPower > nationStrength(world, foe) * 0.9
      : true;
    setStance(world, general, advancing ? STANCE.ADVANCE : STANCE.HOLD);
  });
}


export function runNationAI(game, nation, rng) {
  const world = game.world;
  diplomacy(game, nation, rng);
  manageMobilization(game, nation);
  // Kultur kabulu de bir hukumet karari: oyuncu ile ayni kapi (culture.js).
  manageAcceptance(game, nation);
  // Kirik kumenin cikisi (ortak et / birak / sur) da ayni kapidan gecer.
  manageBrokenProvinces(game, nation);
  // Ulusal hareketler: taviz, sikiyonetim, vassal, katliam — oyuncuyla ayni kapi.
  manageMovements(game, nation);
  // State odakları: çeyrekte bir, boş yuvaya (stateFocus.js autoFocus).
  if (((game.turns?.turn ?? world.turn ?? 0) + nation.id) % 13 === 0) autoFocus(world, nation);
  supplyAI(game, nation);
  spend(game, nation);
  politicsAI(game, nation);
  economyAI(game, nation);
  unificationAI(game, nation);
  decisionsAI(game, nation);
  manageCommand(game, nation);
  // Çıkarma (landings.js): kara sınırı olmayan düşmana, dört haftada bir.
  if (((game.turns?.turn ?? world.turn ?? 0) + nation.id) % 4 === 0) planLandings(game, nation);
  // Kara tümenleri komuta katmanından, donanma deniz bölgelerinden yönetilir
  // (navy.js autoZoneWeights): burada birim birim iş kalmadı.
}

/**
 * OYUNCUNUN DEVREDİLMİŞ ALANLARI. `runNationAI`in aynı fonksiyonları çağrılır;
 * ayrı bir "oyuncu otomasyonu" yazılmadı çünkü yazılsaydı iki davranış
 * sessizce ayrışır ve biri diğerinden avantajlı olurdu.
 *
 * Ordu komutası (`manageCommand`) DEVREDİLMEZ; kendi otomatik anahtarlarını
 * zaten taşıyor (bkz. command.js ensureCommandOptions).
 *
 * Yasalar (`politicsAI`) devredilir; HÜKÛMET devredilmez. Hangi partiyle
 * yönetileceği oyuncunun kararıdır ve dört yıl bağlar — kabine yalnız
 * iktidarın programını yılda bir adım sürer.
 */
export function runDelegatedAI(game, nation, rng) {
  if (!nation?.alive) return;
  const turn = game.world.turn ?? 0;
  if (delegationActive(nation, 'diplomacy', turn)) {
    answerPeaceOffers(game, nation, rng);
    diplomacy(game, nation, rng);
  }
  if (delegationActive(nation, 'economy', turn)) {
    const saved = supplyAI(game, nation);
    if (saved) noteDelegated(game, nation, 'economy', saved, 'The state\'s bills had outgrown its output.');
    const result = economyAI(game, nation);
    if (result) {
      noteDelegated(game, nation, 'economy', result.text, result.action === 'feed'
        ? 'Peace, war and the mood of the people set how much of the output feeds them.'
        : 'The resource balance asked for it.');
    }
  } else if (!isDelegated(nation, 'economy') && (turn + nation.id) % 4 === 0) {
    // Ekonomi oyuncudayken de Auto kipindeki hatlar ve doyurma kolu aynı
    // kuralla döner (elle seçilene dokunulmaz). Eskiden ekonomi evresindeydi;
    // seferberlik deposu mobilization.js'ten okununca economy.js'in onu
    // import etmesi modül sırasını bozuyordu (battles.js MAX_STACK).
    autoLineWeights(game.world, nation, { rifles: mobilizationRifleReserve(game.world, nation) });
    autoFeed(nation);
  }
  if (delegationActive(nation, 'reforms', turn)) {
    const lawsBefore = JSON.stringify(nation.politics?.laws ?? {});
    politicsAI(game, nation, { appoint: false });
    const decided = decisionsAI(game, nation);
    if (decided) noteDelegated(game, nation, 'reforms', decided, 'Political power was piling up.');
    if (JSON.stringify(nation.politics?.laws ?? {}) !== lawsBefore) {
      noteDelegated(game, nation, 'reforms', 'The cabinet changed a law.', 'The situation demanded it.');
    }
    // Kultur kabulu yasalarla ayni kapida: ikisi de "kimin devleti"
    // sorusunun cevabi (bkz. culture.js manageAcceptance).
    if (manageAcceptance(game, nation)) {
      noteDelegated(game, nation, 'reforms', 'A minority was made an accepted culture.',
        'Their provinces were close to revolt and they are numerous enough to matter.');
    }
    // Boş odak yuvası da hükûmetin işidir; oyuncunun koyduğu odak yerinde kalır.
    // Oyuncu odak listesinden "kabine dokunmasın" derse (focusAuto false)
    // boşalttığı yuvalar boş kalır: yoksa sildiği odak bir çeyrekte geri geliyordu.
    if ((turn + nation.id) % 13 === 0 && nation.focusAuto !== false && autoFocus(game.world, nation)) {
      noteDelegated(game, nation, 'reforms', 'A state focus was set.',
        'A focus slot was empty.');
    }
    // Kirik kume bir hukumet sorunudur: devredilmisse hukumet cozer.
    const broken = manageBrokenProvinces(game, nation);
    if (broken) {
      const nasil = broken.action === 'accept'
        ? ['A broken province was settled by sharing the state.', 'Their people are now an accepted culture.']
        : broken.action === 'release'
          ? ['A broken province was handed to their kin.', 'It paid us nothing and would not be held.']
          : ['A people were driven out of a broken province.', 'No other way out was open to us.'];
      noteDelegated(game, nation, 'reforms', nasil[0], nasil[1]);
    }
    // Ulusal hareket de bir hukumet sorunudur (bkz. movements.manageMovements).
    const moved = manageMovements(game, nation, { crackdown: false });
    if (moved) {
      const name = game.world.cultures?.[moved.culture]?.name ?? 'a people';
      // Eylem kendi notunu taşıyorsa o basılır (redesign D1: merdivenin
      // basamakları ve kriz cevapları kendi cümlesini yazar); yoksa eski tablo.
      const lines = moved.note ? [moved.note.text, moved.note.why] : {
        accept: [`The ${name} were made an accepted culture.`, 'Their movement was close to rising.'],
        concessions: [`Concessions were made to the ${name}.`, 'Their movement was gathering pace.'],
        martial: [`Martial law was declared over the ${name}.`, 'Their movement had turned to insurgency.'],
        vassal: [`The ${name} were released as a vassal.`, 'They were about to rise and could not be held.'],
        crackdown: [`The ${name} were crushed.`, 'The government chose force over the loss of land.'],
      }[moved.action];
      if (lines) noteDelegated(game, nation, 'reforms', lines[0], lines[1]);
    }
  }
  if (delegationActive(nation, 'recruitment', turn)) {
    const mobilizedBefore = Boolean(nation.mobilization?.active);
    // `delegated`: AUTO'nun kendi kapısı (D6 levée yalnız çaresizken, P6).
    // Karar kendi notunu döndürürse o basılır; bugün dönüş true/false.
    const mobilized = manageMobilization(game, nation, { delegated: true });
    if (mobilized) {
      const note = mobilized.note;
      noteDelegated(game, nation, 'recruitment',
        note?.text ?? (mobilizedBefore ? 'The reserve was stood down.' : 'The reserve was mobilized.'),
        note?.why ?? (mobilizedBefore ? 'No enemy remains.' : 'The enemy in the field outweighs the standing army.'));
    }
    const before = trainingCount(nation);
    spend(game, nation);
    const after = trainingCount(nation);
    if (after > before) {
      noteDelegated(game, nation, 'recruitment',
        `${after - before} new regiment${after - before > 1 ? 's' : ''} ordered.`,
        'The standing army was below the staff’s target.');
    }
  }
}

/**
 * Masadaki teklifleri hükûmet cevaplar. Ölçüt YZ'nin kendi ölçütüyle aynı:
 * `offerMeetsExpectation`. Oyuncuya özel bir gevşeklik yoktur — kabul de
 * ret de gerçek `resolvePeaceOffer` kapısından geçer.
 */
function answerPeaceOffers(game, nation, rng) {
  const pending = (game.pendingPeace?.() ?? []).filter((entry) => entry.to === nation.id);
  for (const entry of pending) {
    const proposer = game.world.nations[entry.from];
    if (!proposer?.alive) continue;
    const accept = acceptsOffer(game, nation, proposer, entry.offer, rng);
    game.resolvePeaceOffer(entry.id, accept);
    noteDelegated(game, nation, 'diplomacy',
      accept ? `Peace signed with ${proposer.name}.` : `${proposer.name}'s terms rejected.`,
      accept ? 'The terms were no worse than the front promised.'
        : 'The terms cost more than the war does.');
  }
}
