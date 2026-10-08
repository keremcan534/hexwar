// Basit ülke yapay zekâsı: sınıra yürü, toprak al, komşudaki düşmana vur.
// Amaç zekâ değil, dünyanın canlı hissettirmesi; strateji katmanı sonra gelir.

import { UNIT_COSTS, canAfford } from './cities.js';
import {
  MIN_WAR_TURNS, atWar, attackerCount, declareWar, hostile, hostileNations, nationStrength,
  recordWarProgress, relation, truceLeft,
} from './diplomacy.js';
import { manageMobilization } from './mobilization.js';
import { manageAcceptance, manageBrokenProvinces } from './culture.js';
import { manageMovements } from './movements.js';
import {
  buildOffer, demandLimit, occupiedProvincesOf, offerCost, offerMeetsExpectation, provinceKeyOf,
  signPeace, suggestWarGoal, warScore,
} from './peace.js';
import { INFAMY_COALITION } from './infamy.js';
import {
  UNIT_TYPES, isConscript, isMoving, regimentCount, unitAvailable, unitsOn,
} from './units.js';
import { destinationOf, orderMove } from './movement.js';
import { controllerOf } from './control.js';
import {
  canRecruit, disband, nationManpower, trainingCount, trainingQueue,
} from './recruitment.js';
import {
  BRANCH, STANCE, assignDivisions, commandSize, generalOfArmy, officersOf, setStance,
} from './command.js';
import { equipmentStock, setLineWeight } from './econ/industry.js';
import { ARMY_BUDGET_CAP, ARMY_BUDGET_SHARE, UNIT_EQUIPMENT, UPKEEP } from './econ/defs.js';
import { mod } from './modifiers.js';
import { LAWS, lawIndex } from './laws.js';
import { politicsAI, setLaw } from './politics.js';
import { planConstruction } from './construction.js';
import { unificationAI } from './unification.js';
import { decisionsAI } from './decisions.js';
import { delegationActive, noteDelegated } from './delegation.js';
import { nodeNeighbors } from '../world/provinceGraph.js';

/** Savaş ilanı için gereken güç üstünlüğü. */
// 1.4 -> 1.6 -> 1.8 (2026-09-04: kusatma ve bos cepheye yuruyus savaslari
// kesinlestirdi, 50 yilda %39-45 kume el degistirdi): 50 yilda haritanin ucte birinden fazlasi el degistiriyordu
// (audit:borders %35-39); daha kesin ustunluk ister, daha az savas acar.
const WAR_THRESHOLD = 1.8;

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
  if (regiments < 4 || (nation.gold ?? 0) < 20 || (nation.stability ?? 0.6) < 0.35
    || (nation.warSupport ?? 0.5) < 0.3 || (nation.power ?? 0) < 20) return;
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
 * Ülke başına hedeflenen tümen sayısı. Tümenler artık birleşmediği için bir
 * birim = bir alay; eski hedef (2 + tiles/25) yığınlar birleşirken anlamlıydı,
 * şimdi ülkeleri savunmasız bırakıp savaş zincirini tetikliyordu.
 */
function desiredArmy(world, nation) {
  const byLand = 4 + Math.floor(nation.tiles / 12);
  // Bütçe: zengin ülke toprağından büyük ordu tutabilir (bkz. ARMY_BUDGET_SHARE).
  const tax = Math.max(0, nation.economy?.ledger?.tax ?? 0);
  const byBudget = Math.floor(tax * ARMY_BUDGET_SHARE / (UPKEEP.land * Math.max(0.3, 1 + mod(nation, 'upkeep'))));
  // İnsan gücü tavanı: askerlik yasasının havuzu (silah altındakiler dahil)
  // ordunun gerçek sınırıdır; havuzun beşte biri takviyeye kalsın.
  const soldiers = nation.economy?.soldiers ?? 0;
  const byPeople = Math.floor((nationManpower(world, nation.id) + soldiers) * 0.8
    / UNIT_TYPES.INFANTRY.manpower);
  return Math.max(2, Math.min(Math.max(byLand, Math.min(byBudget, byLand * ARMY_BUDGET_CAP)), byPeople || 2));
}

/**
 * Sıradaki kol. Gövde piyade, hız süvari, ateş gücü topçu: her üçüncü alay
 * topçu (top stoğu varsa), her beşinci süvari (at açığı yoksa).
 */
function affordableUnit(game, nation, army) {
  const world = game.world;
  const horses = nation.economy?.resources?.HORSES?.ratio ?? 1;
  const order = army >= 3 && army % 3 === 0 && equipmentStock(nation, 'guns') >= UNIT_EQUIPMENT.ARTILLERY.guns
    ? ['ARTILLERY', 'INFANTRY']
    : army >= 4 && army % 5 === 0 && horses >= 0.9 ? ['CAVALRY', 'INFANTRY'] : ['INFANTRY'];
  for (const id of order) {
    if (!unitAvailable(id, game.turns.turn, nation)) continue;
    if (canAfford(nation, UNIT_COSTS[id]) && canRecruit(world, nation, id)) return id;
  }
  return null;
}

/** Kuyrukta teçhizat bekleyen sipariş sayısı. */
function waitingForEquipment(nation) {
  return trainingQueue(nation).filter((item) => Object.keys(item.missing ?? {}).length).length;
}

/**
 * Harcama: önce yeterli ordu. Teçhizat yoksa sipariş vermez (kuyrukta
 * bekleyen iki siparişten fazlası depoyu bekler, kışlayı değil). İflastaki
 * barış devleti ordusunu küçültür.
 */
function spend(game, nation) {
  const world = game.world;
  const cities = world.cities.filter((c) => c.nationId === nation.id).length;
  const turn = game.turns?.turn ?? 0;
  const atWarNow = world.nations.some((other) => other.alive && other.id !== nation.id
    && atWar(world, other.id, nation.id));
  if ((nation.bankruptUntil ?? 0) > turn && !atWarNow) {
    const units = world.units.filter((u) => u.nationId === nation.id && u.type.domain !== 'sea');
    const total = units.reduce((sum, unit) => sum + regimentCount(unit), 0);
    if (total > 2) {
      const weakest = units.reduce(
        (worst, unit) => (regimentCount(unit) < regimentCount(worst) ? unit : worst), units[0],
      );
      if (weakest) disband(game, weakest);
    }
    return;
  }
  if (waitingForEquipment(nation) >= 2) return;

  const target = desiredArmy(world, nation);
  let army = world.units
    .filter((u) => u.nationId === nation.id && !isConscript(u))
    .reduce((sum, unit) => sum + regimentCount(unit), 0)
    + trainingCount(nation);

  // Kıyı ülkeleri mütevazı bir donanma tutar (gemi stoğu varsa).
  const hasPort = world.cities.some((c) => c.nationId === nation.id && c.tile.coastal);
  const fleet = world.units.filter(
    (u) => u.nationId === nation.id && u.type.domain === 'sea',
  ).length + trainingCount(nation, 'WARSHIP');
  if (hasPort && fleet < 1 + Math.floor(cities / 3)
    && equipmentStock(nation, 'ships') >= UNIT_EQUIPMENT.WARSHIP.ships
    && canAfford(nation, UNIT_COSTS.WARSHIP)
    && game.turns.buyUnit(nation, 'WARSHIP')) {
    army++;
  }

  for (let i = 0; i < 3; i++) {
    const surplus = (nation.gold ?? 0) > 200 && army < Math.ceil(target * 1.25);
    if (army >= target && !surplus) break;
    if (equipmentStock(nation, 'rifles') < UNIT_EQUIPMENT.INFANTRY.rifles
      && waitingForEquipment(nation) >= 1) break;
    const typeId = affordableUnit(game, nation, army);
    if (!typeId || !game.turns.buyUnit(nation, typeId)) break;
    army++;
  }
}

/**
 * EKONOMİ YZ'si — oyuncunun AUTO'suyla aynı kapı. Ayda bir: hat ağırlıkları
 * ordunun ihtiyacına göre, ticaret yasası kaynak dengesine göre. İnşaat her
 * hafta (bütçe ve yuva sınırında).
 */
export function economyAI(game, nation) {
  const world = game.world;
  const turn = game.turns?.turn ?? 0;
  if ((turn + nation.id) % 4 !== 0) return null;
  const economy = nation.economy;
  if (!economy) return null;
  const war = (economy.warFronts ?? 0) > 0;
  let regiments = 0;
  let guns = 0;
  for (const unit of world.units) {
    if (unit.nationId !== nation.id) continue;
    regiments += regimentCount(unit);
    for (const regiment of unit.regiments ?? []) if (regiment.typeId === 'ARTILLERY') guns++;
  }
  // Depo doluysa hat durur: barışta yığılan tüfek demir yer ama kimseyi
  // silahlandırmaz (ölçüldü: 1900'de dünya demiri %40'ta, depolar taşkın).
  const rifles = equipmentStock(nation, 'rifles');
  const wantRifles = rifles < regiments * 4 + 30 ? (war ? 5 : 3)
    : rifles < regiments * 10 + 80 ? 1 : 0;
  const wantGuns = equipmentStock(nation, 'guns') < guns * 3 + 6 ? (war ? 2 : 1) : 0;
  const wantShips = economy.coastal ? ((economy.blockade ?? 0) > 0 || nation.focus === 'military' ? 2 : 1) : 0;
  setLineWeight(nation, 'rifles', wantRifles);
  setLineWeight(nation, 'guns', wantGuns);
  setLineWeight(nation, 'ships', wantShips);
  // Ticaret yasası: satacak fazlası olan açılır, açığı çok ve altını az
  // olan (ithalat bedeli ×1.5) kapanmaz; ablukadaki savaşan küçültmez.
  let surplusValue = 0;
  let deficitValue = 0;
  for (const record of Object.values(economy.resources ?? {})) {
    surplusValue += Math.max(0, record.produced - record.need) * (record.price || 1);
    deficitValue += Math.max(0, record.need - record.produced) * (record.price || 1);
  }
  const trade = lawIndex(nation, 'trade');
  const income = Math.max(1, economy.incomeAvg ?? 1);
  let wanted = trade;
  // Fazlası olan açılır: kapalı pazar dünyanın kıtlığını büyütür (ölçüldü:
  // dünya demiri ihtiyacın 3-5 katıyken ulus-haftaların %19'unda demir kıttı;
  // ihracat payı %25'te kalan üreticiler açığı kapatamıyordu).
  if (surplusValue > income * 0.04 && trade < 2) wanted = trade + 1;
  else if (trade === 0 && deficitValue > 0) wanted = 1;
  if (wanted !== trade && (nation.power ?? 0) >= 60) {
    if (setLaw(game, nation, 'trade', wanted)) return { action: 'trade', text: `Trade law set to ${LAWS.trade.options[wanted].name}.` };
  }
  return null;
}

/**
 * KEMER SIKMA. Borç tavanın %30'unu aşınca ya da hazine boşken açık
 * sürerse, ayda bir tek adım: vergi yükselir, eğitim kısılır, barışta en
 * küçük tümen terhis edilir. Ölçüldü: bu rutin yokken gelirinin üstünde
 * ordu ve bina bakımı taşıyan küçük devletler 10 yılda 0.029/ulus-yıl
 * iflas ediyordu (audit:econ).
 */
export function austerityAI(game, nation) {
  const economy = nation.economy;
  const turn = game.turns?.turn ?? 0;
  if (!economy || (turn + nation.id) % 4 !== 1) return null;
  const cap = economy.debtCap ?? 150;
  const net = economy.ledger?.net ?? 0;
  const stressed = (nation.debt ?? 0) > cap * 0.3 || (net < 0 && (nation.gold ?? 0) < 20);
  if (!stressed) return null;
  const tax = lawIndex(nation, 'tax');
  if (tax < 2 && setLaw(game, nation, 'tax', tax + 1)) return 'Taxes raised to balance the books.';
  const education = lawIndex(nation, 'education');
  if (education > 0 && setLaw(game, nation, 'education', education - 1)) return 'School spending cut to balance the books.';
  const world = game.world;
  const atWarNow = (economy.warFronts ?? 0) > 0;
  if (!atWarNow) {
    const units = world.units.filter((u) => u.nationId === nation.id && u.type.domain !== 'sea' && !u.battleId);
    const total = units.reduce((sum, unit) => sum + regimentCount(unit), 0);
    if (total > 2) {
      const weakest = units.reduce((worst, unit) => (regimentCount(unit) < regimentCount(worst) ? unit : worst), units[0]);
      if (weakest && disband(game, weakest)) return 'A regiment was stood down to save its upkeep.';
    }
  }
  return null;
}

/** İnşaat YZ'si: her hafta bir proje (yedek altını koruyarak). */
function constructionAI(game, nation) {
  const war = (nation.economy?.warFronts ?? 0) > 0;
  return planConstruction(game, nation, { reserve: war ? 120 : 50 });
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
  austerityAI(game, nation);
  spend(game, nation);
  politicsAI(game, nation);
  economyAI(game, nation);
  constructionAI(game, nation);
  unificationAI(game, nation);
  decisionsAI(game, nation);
  manageCommand(game, nation);
  // Kara tümenleri komuta katmanından yönetilir; burada yalnız donanma kalır.
  for (const unit of [...world.units]) {
    if (unit.nationId === nation.id && unit.type.domain === 'sea') runUnitAI(game, unit, rng);
  }
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
    const saved = austerityAI(game, nation);
    if (saved) noteDelegated(game, nation, 'economy', saved, 'Debt was climbing toward the ceiling.');
    const result = economyAI(game, nation);
    if (result) noteDelegated(game, nation, 'economy', result.text, 'The resource balance asked for it.');
  }
  if (delegationActive(nation, 'construction', turn)) {
    const project = constructionAI(game, nation);
    if (project) {
      noteDelegated(game, nation, 'construction',
        project.kind === 'develop' ? 'A province is being developed.' : `A ${project.building} was ordered.`,
        'It answers the shortage the country feels most.');
    }
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
      const lines = {
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
    if (manageMobilization(game, nation)) {
      noteDelegated(game, nation, 'recruitment',
        mobilizedBefore ? 'The reserve was stood down.' : 'The reserve was mobilized.',
        mobilizedBefore ? 'No enemy remains.' : 'The enemy in the field outweighs the standing army.');
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
