// Barış görüşmesi. EU4'teki gibi: savaş bir yerde biter, ama *neyin* el
// değiştireceği pazarlıkla belirlenir.
//
// Eskiden `makePeace` işgal altındaki her kareyi otomatik devrediyordu; oyuncu
// ne isteyeceğini seçemiyor, karşı taraf da hiçbir şey teklif edemiyordu.
// Burada iki şey var: savaşın kim tarafından kazanıldığını ölçen **warscore**
// ve o puanın satın alabileceği kadar toprak isteyen bir **teklif**.
//
// Katman notu: saf hesap. DOM'a dokunmaz, çizim bilmez.

import { atWar, makePeace, nationStrength, relation, warLossesOf } from './diplomacy.js';
import { controllerOf } from './control.js';
import { soldiersOf } from './units.js';
import { annexInfamy } from './infamy.js';

/** Warscore 0-100 arasıdır; 100 tam teslimiyet demektir. */
export const MAX_WAR_SCORE = 100;

/**
 * Bir barışta alınabilecek azami province (küme) sayısı — MUTLAK tavan.
 * Fiilen bağlayan sınır `demandLimit(score)`tur; bu sabit yalnız hiçbir
 * anlaşmanın aşamayacağı üst çizgidir.
 */
export const MAX_DEMAND_PROVINCES = 4;

/**
 * Warscore'un satın alabileceği küme sayısı. Victoria'da savaşlar ülke
 * yutmaz, sınır düzeltir: küçük bir zafer bir-üç eyalet, ezici bir zafer daha
 * fazlasını getirir — ama hiçbir zafer haritayı silmez.
 *
 * NEDEN KADEMELİ: tek bir sabit tavan (eski 3) iki hatayı birden yapıyordu.
 * Küçük başarıya üç eyalet fazlaydı, ezici zafere üç eyalet azdı. Tavan artık
 * kazanılan üstünlükle büyür; 10'un altında hiç toprak yoktur (sınır kımıldatan
 * her savaş "kazanılmış" sayılmasın).
 */
/**
 * SAVAS HEDEFI (wargoal) — Victoria'nin savas amaci, HexWar olceginde.
 *
 * Bir savasin NEDEN acildigi hicbir yerde yaziyordu. Ilan ediliyor, yillarca
 * suruyor, masaya oturuluyor ve masada "ne istiyordum?" sorusunun cevabi
 * yoktu; oyuncu isgal ettigi kumelere bakip o an karar veriyordu. Hedef, bu
 * soruyu savasin BASINDA sorar ve masada geri gosterir.
 *
 * Kapsam bilerek dar: bir savasin bir hedefi olur ve o hedef bir KUMEDIR.
 * Vic2'nin CB agaci (humiliate, dismantle, free peoples...) burada yok --
 * `PEACE_TERMS` zaten o isi goruyor. Hedef yalnizca "bu savas su topragi
 * almak icin acildi" der ve masada birinci sirada durur.
 *
 * Saklama yeri iliskinin kendisi: savas biterken hedef de silinir.
 */
export function setWarGoal(world, a, b, provinceId) {
  const rec = relation(world, a, b);
  if (!rec) return false;
  (rec.goals ??= {})[a] = provinceId ?? null;
  return true;
}

/** Bu savasta `a`nin hedefledigi kume (yoksa null). */
export function warGoalOf(world, a, b) {
  const id = relation(world, a, b)?.goals?.[a];
  return id == null ? null : (world.provinces?.[id] ?? null);
}

/**
 * YZ ve "hedefsiz ilan" icin makul bir hedef secer: kendi sinirina KOMSU,
 * dusmanin en degerli kumesi. Komsu yoksa en degerlisi.
 */
export function suggestWarGoal(world, a, b) {
  const mine = new Set();
  for (const province of world.provinces ?? []) {
    if (province.owner === a) for (const id of province.neighbors ?? []) mine.add(id);
  }
  let best = null;
  let bestScore = -Infinity;
  for (const province of world.provinces ?? []) {
    if (province.owner !== b || !province.econ) continue;
    // Bitisik kume daha degerli: alindiginda harita temiz kalir.
    const score = provinceValue(world, province) * (mine.has(province.id) ? 2 : 1);
    if (score > bestScore) { bestScore = score; best = province; }
  }
  return best;
}

export function demandLimit(score) {
  const s = Math.max(0, score);
  // Basamaklar bes puan yukari cekildi: 50 yilda haritanin %33-36'si el
  // degistiriyordu (audit:war-pressure / borders "kartopu" esigi ucte bir).
  // Kazanan hala kazanir, ama ayni puanla bir kume daha az alir.
  // Tavan 6'dan 4'e: 50 yilda uc tohumdan birinde haritanin %44'u el
  // degistiriyordu (audit:borders). Savas sinir duzeltir, ulke yutmaz.
  if (s < 12) return 0;
  if (s < 25) return 1;
  if (s < 45) return 2;
  if (s < 70) return 3;
  return MAX_DEMAND_PROVINCES;
}

/**
 * Bir kümenin barış masasındaki fiyat aralığı ve kuru.
 *
 * ÖLÇÜLDÜ (beta 2, 68 yıl): tek bir kümenin bedeli 80-85'e kadar çıkıyordu ama
 * warscore tavanı 100'dü ve orta ölçekli bir ülkenin bütün kümelerinin toplam
 * bedeli 700-900'ü buluyordu. Yani iki büyüklük AYNI PARA BİRİMİNDE DEĞİLDİ:
 * fiyat mutlak (nüfus + gelişim + şehir), warscore ise oransal (düşmanın
 * toprağının yüzdesi). Sonuç, 68 yılda hiçbir sınırın değişmemesiydi.
 *
 * Fiyat artık düşmanın ÜLKESİNE ORANLA hesaplanır: bir küme, sahibinin
 * varlığının ne kadarıysa o kadar warscore eder. Böylece fiyat ile skor aynı
 * para birimindedir ve "warscore'um 40, ne alabilirim" sorusunun cevabı
 * gerçekten haritaya bakarak verilebilir.
 */
export const PROVINCE_PRICE = {
  /** Her kümenin taban bedeli: bomboş sınır kümesi bile bedava değildir. */
  base: 5,
  /** Ülke payının warscore karşılığı. */
  shareWeight: 130,
  /**
   * Pay büyüdükçe fiyat yavaşlar. Sönümleme olmadan üç kümeli bir devletin her
   * kümesi 48 ederdi: küçük devletler hiçbir zaman parçalanamaz, üstelik sert
   * bir tavan koyduğumuzda o devletin şehirli kümesi ile bomboş kümesi AYNI
   * fiyata düşerdi (ölçüldü). Sönümleme sırayı korur, tavan yalnız güvenliktir.
   */
  shareDamping: 1.5,
  floor: 6,
  cap: 45,
  /** Fiilen işgal edilen kümenin indirimi (tamamı tutuluyorsa %40). */
  occupationDiscount: 0.4,
};

/**
 * Masada istenebilmesi için kümenin en az bu kadarının işgal altında olması
 * gerekir. Tam işgal şartı ölçümde ölü bir kapıydı: 50 yıllık koşuda hiçbir
 * taraf hiçbir kümeyi TAMAMEN işgal edemedi (cephe hex hex ilerliyor, kümenin
 * son karesi hep savunanın elinde kalıyor). Üçte bir, cephenin gerçekten
 * geçtiği kümeyi masaya taşır; kalan kısım fiyata yansır.
 */
export const OCCUPATION_CLAIM_SHARE = 1 / 3;

/**
 * Warscore'un bileşenleri. Toplamları 1'dir.
 *
 * Eski dağılım işgal 0.75 / güç 0.25'ti ve iki gerçek olguyu hiç saymıyordu:
 * düşman başkentini tutmak ve düşman ordusunu yok etmek. Ölçümde 105 tümenle,
 * 6.1 kat üstünlükle üç yıl savaşan taraf yalnız +28 topluyordu.
 */
export const WAR_SCORE_WEIGHTS = {
  occupation: 0.55,
  capital: 0.15,
  attrition: 0.18,
  strength: 0.12,
};

/**
 * İşgal payının doyum noktası: düşman varlığının %55'ini tutmak tam işgal
 * sayılır. Aksi halde büyük bir ülkenin sınırında kazanılan gerçek bir zafer
 * skora hiç yansımıyor (payı %5, katkısı 4 puan).
 */
const OCCUPATION_GAIN = 1.8;

/** Toprak dışı talepler. Hepsinin gerçek bir oyun etkisi vardır. */
export const PEACE_TERMS = {
  REPARATIONS: {
    id: 'REPARATIONS', name: 'War Reparations', icon: '¤', cost: 18, turns: 260,
    desc: 'They pay you a share of their treasury income for five years.',
  },
  DEMILITARIZE: {
    id: 'DEMILITARIZE', name: 'Demilitarisation', icon: '⚔', cost: 24, turns: 208,
    desc: 'They cannot raise new divisions for four years.',
  },
  CONCESSION: {
    id: 'CONCESSION', name: 'Resource Concession', icon: '⛏', cost: 20, turns: 312,
    desc: 'A fifth of their raw production is shipped to you for six years.',
  },
  // FACTORY_RIGHTS kaldirildi: sart satin alinabiliyordu ama hicbir sistem
  // okumuyordu (industrialRightsOn'un tuketicisi yoktu) — warscore karsiligi
  // hicbir sey vermeyen bir tuzakti. Yabanci toprakta yatirim gercekten
  // kurulursa sart geri gelir.
  LIBERATE: {
    id: 'LIBERATE', name: 'Liberate Minorities', icon: '⚑', cost: 35,
    desc: 'Provinces of a culture foreign to them break away and become independent.',
  },
  VASSALIZE: {
    id: 'VASSALIZE', name: 'Vassalise', icon: '👑', cost: 65,
    desc: 'They become your vassal: permanent peace and a tribute of their income.',
  },
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Bir province KÜMESİNİN ham değeri. Kalabalık, gelişmiş ve şehirli küme
 * değerlidir; kimsenin yaşamadığı sınır kümesi değersiz. Bu sayı bir FİYAT
 * DEĞİLDİR: warscore hesabında kümeleri birbirine göre tartar, fiyatı
 * `provinceWarCost` bundan türetir.
 */
export function provinceValue(world, province) {
  const econ = province?.econ;
  if (!econ || province.owner < 0) return 0;
  let cities = 0;
  for (const idx of province.tileIdx) {
    if (world.tiles[idx].city) cities++;
  }
  const development = (econ.agriculture ?? 0) + (econ.extraction ?? 0) + (econ.commerce ?? 0);
  return Math.max(1, Math.round(
    2 * econ.hexes + econ.population / 3000 + development * 0.6 * econ.hexes + cities * 12,
  ));
}

/**
 * Ülke başına toplam ham değer. Tur başına bir kez hesaplanır: fiyat sorgusu
 * (barış ekranı, teklif kurma, YZ kararı) haftada onlarca kez gelir ve her
 * seferinde bütün kümeleri taramak gereksiz.
 */
const realmCache = new WeakMap();

function realmValues(world) {
  const cached = realmCache.get(world);
  if (cached && cached.turn === (world.turn ?? 0)) return cached.values;
  const values = new Float64Array(world.nations.length);
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.econ) continue;
    values[province.owner] += provinceValue(world, province);
  }
  realmCache.set(world, { turn: world.turn ?? 0, values });
  return values;
}

/** Toprak el değiştirdi: fiyat tablosu aynı tur içinde bile tazelenmeli. */
export function invalidateWarCosts(world) {
  realmCache.delete(world);
}

/** Kümenin kaçta kaçı sahibinden başkasının kontrolünde? */
function occupiedShareOf(world, province) {
  let held = 0;
  for (const idx of province.tileIdx) {
    if (controllerOf(world.tiles[idx]) !== province.owner) held++;
  }
  return held / Math.max(1, province.tileIdx.length);
}

/**
 * Bir province KÜMESİNİN barış masasındaki bedeli — WARSCORE cinsinden.
 *
 * İki kural: (1) fiyat kümenin sahibinin ülkesindeki payından gelir, yani
 * warscore ile aynı para birimindedir; (2) fiilen işgal edilen küme ucuzlar —
 * cephede kanıtlanan şeyi masada ikinci kez satın almazsın.
 */
export function provinceWarCost(world, province) {
  const value = provinceValue(world, province);
  if (!value) return 0;
  const realm = Math.max(value, realmValues(world)[province.owner] ?? value);
  const share = value / realm;
  const damped = share / (1 + PROVINCE_PRICE.shareDamping * share);
  const price = clamp(
    PROVINCE_PRICE.base + damped * PROVINCE_PRICE.shareWeight,
    PROVINCE_PRICE.floor, PROVINCE_PRICE.cap,
  );
  const discount = 1 - PROVINCE_PRICE.occupationDiscount * occupiedShareOf(world, province);
  return Math.max(1, Math.round(price * discount));
}

/** Küme anahtarı: barış teklifi listeleri bu kimlikle taşınır. */
export function provinceKeyOf(province) {
  return `p${province.id}`;
}

/** Anahtardan küme kaydı; tanınmayan anahtar null döner. */
export function provinceFromKey(world, key) {
  if (typeof key !== 'string' || !key.startsWith('p')) return null;
  return world.provinces?.[Number(key.slice(1))] ?? null;
}

/**
 * `holder`, `owner`in başkentini fiilen tutuyor mu? Başkenti düşmüş ülke
 * savaşı kazanıyor sayılamaz; masadaki en görünür koz budur.
 */
function holdsCapital(world, holder, owner) {
  const capital = world.nations[owner]?.capital;
  // Eski fetihlerden kalan bayat başkent kaydı puan üretmemeli.
  if (!capital || capital.owner !== owner) return 0;
  return controllerOf(capital) === holder ? 1 : 0;
}

/** Ulusun sahadaki toplam asker mevcudu; yıpranma payının paydası. */
function soldiersOfNation(world, nationId) {
  let men = 0;
  for (const unit of world.units) {
    if (unit.nationId === nationId) men += soldiersOf(unit);
  }
  return men;
}

/**
 * Bir tarafın bu savaşta eriyen ordu payı: kaybettiği asker / (kaybettiği +
 * hâlâ sahada duran). Ordusunu yeniden kuran ülke payını geri kazanır — bu
 * kasıtlıdır, "toparlandı" demektir.
 */
function attritionShareOf(world, a, b, side) {
  const losses = warLossesOf(world, a, b);
  const fallen = losses[side] ?? 0;
  if (fallen <= 0) return 0;
  return fallen / Math.max(1, fallen + soldiersOfNation(world, side));
}

/**
 * Savaşın gidişatı. Dört kaynaktan beslenir: işgal ettiğin toprak, düşman
 * başkenti, yok ettiğin ordu ve kaba askerî üstünlük. Pozitif değer `a` önde
 * demektir.
 *
 * NEDEN DÖRT: eski hesap yalnız işgal + güçtü ve savaşın iki en somut
 * sonucunu görmüyordu. Ölçümde 6.1 kat üstün, 105 tümenlik bir ordu düşmanın
 * başkentini alıp ordusunu dağıttığı hâlde üç yılda +28 topluyordu; o skorla
 * tek bir sınır kümesi bile satın alınamıyordu.
 */
export function warScore(world, a, b) {
  if (!atWar(world, a, b)) return 0;
  let held = 0;
  let lost = 0;
  let theirTotal = 0;
  let ourTotal = 0;
  // Küme döngüsü; kısmi işgal payı kadar puan kımıldatır — savaş temposu
  // "son kareyi de al" şartına kilitlenmez, cephe ilerledikçe skor akar.
  // Tartı HAM değerdir: masadaki fiyatın tavanı/indirimi cepheyi eğmesin.
  const shareControlledBy = (province, nationId) => {
    let count = 0;
    for (const idx of province.tileIdx) {
      if (controllerOf(world.tiles[idx]) === nationId) count++;
    }
    return count / Math.max(1, province.tileIdx.length);
  };
  for (const province of world.provinces ?? []) {
    if (province.owner === b) {
      const value = provinceValue(world, province);
      theirTotal += value;
      held += value * shareControlledBy(province, a);
    } else if (province.owner === a) {
      const value = provinceValue(world, province);
      ourTotal += value;
      lost += value * shareControlledBy(province, b);
    }
  }
  // İşgal payı asıl belirleyicidir: toprak tutmadan savaş kazanılmış sayılmaz.
  // Doyum noktası var (bkz. OCCUPATION_GAIN): büyük bir imparatorluğun
  // sınırında kazanılan gerçek zafer, yüzde olarak küçük diye silinmesin.
  const gain = (share) => clamp(share * OCCUPATION_GAIN, 0, 1);
  const occupation = gain(held / Math.max(1, theirTotal)) - gain(lost / Math.max(1, ourTotal));
  const capital = holdsCapital(world, a, b) - holdsCapital(world, b, a);
  const attrition = attritionShareOf(world, a, b, b) - attritionShareOf(world, a, b, a);
  const mine = nationStrength(world, world.nations[a]);
  const theirs = nationStrength(world, world.nations[b]);
  const edge = (mine - theirs) / Math.max(1, mine + theirs);
  const total = occupation * WAR_SCORE_WEIGHTS.occupation
    + capital * WAR_SCORE_WEIGHTS.capital
    + attrition * WAR_SCORE_WEIGHTS.attrition
    + edge * WAR_SCORE_WEIGHTS.strength;
  return clamp(Math.round(total * MAX_WAR_SCORE), -MAX_WAR_SCORE, MAX_WAR_SCORE);
}

/** Teklifin toplam bedeli: istenen kümeler + talepler eksi verilen kümeler. */
export function offerCost(world, offer) {
  const provinces = (list) => (list ?? []).reduce((sum, key) => (
    sum + provinceWarCost(world, provinceFromKey(world, key))
  ), 0);
  const terms = (offer?.terms ?? []).reduce(
    (sum, id) => sum + (PEACE_TERMS[id]?.cost ?? 0), 0,
  );
  return provinces(offer?.demands) + terms - provinces(offer?.concessions);
}

/** Vassallik yalnız açık ara zayıf düşmandan istenebilir. */
export function canVassalize(world, a, b) {
  const mine = nationStrength(world, world.nations[a]);
  const theirs = nationStrength(world, world.nations[b]);
  return mine > theirs * 2.5 && world.nations[b].tiles > 0;
}

export function termAvailable(world, a, b, termId) {
  if (termId === 'VASSALIZE') return canVassalize(world, a, b);
  if (termId === 'LIBERATE') {
    const target = world.nations[b];
    return (world.provinces ?? []).some(
      (province) => province.owner === b && province.econ
        && province.culture !== target.culture,
    );
  }
  return true;
}

/**
 * Haritadaki kareden masadaki küme: barış ekranı hexe tıklatır, teklif
 * kümeyi taşır. Yalnız karşı tarafın *egemenliğindeki* kümeler istenebilir.
 */
export function demandKeyForTile(world, tile, targetId) {
  const province = world.provinces?.[tile?.provinceId];
  if (!province || province.owner !== targetId) return null;
  return provinceKeyOf(province);
}

export function concedeKeyForTile(world, tile, ownId) {
  const province = world.provinces?.[tile?.provinceId];
  if (!province || province.owner !== ownId) return null;
  return provinceKeyOf(province);
}

/**
 * Karşı taraf bu teklifi kabul eder mi? Kural basit ve okunur: istediğin
 * toprağın bedeli, elindeki warscore'u aşamaz. Verdiğin toprak bedeli düşürür,
 * yani kaybeden taraf da masaya bir şey koyarak anlaşma satın alabilir.
 */
/**
 * Teklifi ALAN tarafin masadan kalkma esigi. Kazanan taraf bedava imzalamaz;
 * ikinci cephe, coken istikrar ve uzayan savas esigi gevsetir.
 *
 * Yorgunluk tavani 15 puan / 312 hafta (6 yil): boylece gercek bir tikanma
 * eninde sonunda beyaz barisla kapanabilir (donmus savas gec oyunun en buyuk
 * karar bosluguydu) ama TAZE bir zafer asla bedavaya geri verilmez.
 */
/** En ucuz barış şartı: hiç toprak tutmayan kazananın bile bir beklentisi var. */
const CHEAPEST_TERM = Math.min(...Object.values(PEACE_TERMS).map((term) => term.cost));

/**
 * Kazananın masada bekleyebileceği azami değer.
 *
 * Warscore tek başına yetmez. Fiyatlar artık düşmanın ülkesindeki paydan
 * türüyor ve tavanlı; bir ülkeden bir anlaşmayla alınabilecek TOPLAM da bu
 * yüzden sınırlı. Beklentiyi bu sınırla kesmezsek kazanan taraf masanın hiç
 * veremeyeceği bir bedeli bekler ve savaş donar.
 *
 * Ölçüt neden yalnız toprak: şart (tazminat, imtiyaz, vassallık) her zaman
 * TEKLİFİ VERENİN lehinedir, yani kaybeden taraf şart sunamaz. Kaybedenin
 * masaya koyabileceği tek şey topraktır; beklenti ondan büyük olamaz.
 */
export function warExpectation(world, receiverId, proposerId) {
  const score = warScore(world, receiverId, proposerId);
  if (score <= 0) return score;
  let held = 0;
  for (const { cost } of occupiedProvincesOf(world, receiverId, proposerId)
    .slice(0, demandLimit(score))) held += cost;
  // Hiç toprak tutmuyorsa bile bedavaya imzalamaz: en ucuz şart kadarını bekler.
  return Math.min(score, Math.max(held, CHEAPEST_TERM));
}

export function acceptanceTolerance(world, receiverId, proposerId) {
  const receiver = world.nations[receiverId];
  let fronts = 0;
  for (const other of world.nations) {
    if (other.alive && other.id !== receiverId && atWar(world, other.id, receiverId)) fronts++;
  }
  const rec = world.relations?.[receiverId]?.[proposerId];
  const weeks = Math.max(0, (world.turn ?? 0) - (rec?.since ?? 0));
  const weariness = clamp(weeks / 312, 0, 1) * 15;
  const raw = 10 + Math.max(0, fronts - 1) * 15
    + ((receiver?.economy?.stability ?? 0.6) < 0.4 ? 15 : 0)
    + weariness;
  // TAVAN: tolerans, kazanilan ustunlugun tamamini silemez.
  //
  // Bu kapi canli oyunda yakalandi (seed BETA1836, 1840, Vasheim-Draesh):
  // Draesh 37-0 ondeydi ama iki cephede savasiyor ve istikrari %40'in
  // altindaydi; tolerans 45.9'a cikip 37'lik ustunlugu tamamen yutuyor ve
  // BEDAVA BEYAZ BARIS yine kabul ediliyordu — BUG-009 baska bir yoldan geri
  // gelmisti. Yorgunluk talebi ucuzlatmali, SIFIRLAMAMALI.
  //
  // Kazanan taraf ustunlugunun en az %40'ini masada ister.
  const lead = warExpectation(world, receiverId, proposerId);
  return lead > 0 ? Math.min(raw, lead * 0.6) : raw;
}

/**
 * Teklif, ALICININ beklentisini karsiliyor mu? Tek dogruluk kaynagi budur:
 * oyuncu masasi ve YZ karari ayni fonksiyondan gecer.
 *
 * NEDEN TEK KAYNAK: iki ayri yol vardi. `ai.js` zaten "kazanan beyaz barisi
 * reddeder" kuralini isletiyordu, ama YALNIZ YZ-YZ arasinda; oyuncunun
 * masasindaki `offerRefusal` bedeli sifir olan her teklifi kosulsuz kabul
 * ediyordu (`if (cost <= 0) return null`). Beta bunu tam olarak boyle yakaladi:
 * -25 skorla, iki sehri isgal altindayken bedava beyaz baris.
 */
export function offerMeetsExpectation(world, receiverId, proposerId, offer) {
  const hope = warExpectation(world, receiverId, proposerId);
  const tolerance = acceptanceTolerance(world, receiverId, proposerId);
  return offerValueFor(world, offer) >= hope - tolerance;
}

/** Teklifin neden reddedildiği; kabul edilirse null. */
export function offerRefusal(world, a, b, offer) {
  const demands = offer?.demands ?? [];
  const score = Math.max(0, warScore(world, a, b));
  const limit = demandLimit(score);
  if (demands.length > limit) {
    return limit === 0
      ? 'They will not cede an inch: your war score buys no territory yet.'
      : `Your war score supports no more than ${limit} province${limit === 1 ? '' : 's'}.`;
  }
  for (const termId of offer?.terms ?? []) {
    if (!termAvailable(world, a, b, termId)) {
      return `${PEACE_TERMS[termId]?.name ?? 'That demand'} cannot be imposed on them.`;
    }
  }
  const cost = offerCost(world, offer);
  if (cost > score) return `They refuse: the demand exceeds your war score by ${cost - score}.`;
  if (!offerMeetsExpectation(world, b, a, offer)) {
    const shortfall = Math.max(1, Math.ceil(
      warExpectation(world, b, a) - acceptanceTolerance(world, b, a) + cost,
    ));
    return `They are winning and will not sign for nothing — they expect about ${shortfall} more at the table.`;
  }
  return null;
}

export function offerAcceptable(world, a, b, offer) {
  return offerRefusal(world, a, b, offer) === null;
}

/**
 * Masada istenebilecek şey, cephede tutulan şeydir: `a`nın en az
 * `OCCUPATION_CLAIM_SHARE` kadarını işgal ettiği `b` kümeleri, değerlisinden
 * ucuzuna. Devir küme bütünüyle olur (sınır kümeyi bölmez), o yüzden tutulmayan
 * kısım fiyata biner — bkz. `provinceWarCost` işgal indirimi.
 *
 * TAM işgal şartı ölçümde ölü bir kapıydı: 50 yıllık koşuda hiçbir taraf
 * hiçbir kümenin son karesini alamadığı için YZ hep boş teklif kuruyor ve her
 * savaş beyaz barışla kapanıyordu.
 */
export function occupiedProvincesOf(world, a, b) {
  const held = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== b || !province.econ) continue;
    let count = 0;
    for (const idx of province.tileIdx) {
      if (controllerOf(world.tiles[idx]) === a) count++;
    }
    const share = count / Math.max(1, province.tileIdx.length);
    if (share < OCCUPATION_CLAIM_SHARE) continue;
    held.push({ province, share, cost: provinceWarCost(world, province) });
  }
  return held.sort((x, y) => y.cost - x.cost);
}

/**
 * TOPRAK SECIMI BITISIK OLUR — "border gore" buradan cikiyordu.
 *
 * Eski secim `occupiedProvincesOf`u maliyete gore siralayip butcenin yettigi
 * EN PAHALI kumeleri aliyordu; bitisiklige hic bakmiyordu. Sonucu haritanin
 * obur ucunda birakilan ada kumelerdi. Olculdu (800 hafta, iki tohum):
 * savasli dunyada ulke basina ortalama parca sayisi 1.89-2.38, barisci
 * dunyada 1.18-1.40 — ve en kotu ornekler 48 kumeyi ALTI ayri parcada
 * tasiyordu.
 *
 * Yeni kural: her adimda, alanin BUGUNKU sinirina (ya da bu masada daha once
 * secilmis bir kumeye) komsu olan adaylardan en degerlisi alinir. Komsu aday
 * kalmadiginda secim durur -- kalan butce sartlara akar. Bilerek: "bitisik
 * kalamiyorsam toprak yerine tazminat" bir devletin makul davranisidir,
 * kopuk bir cep acmaktan iyidir.
 */
function contiguousPick(world, taker, candidates, canAfford) {
  const picked = [];
  if (!candidates.length) return picked;
  // Alanin mevcut sinirina komsu olan her kume "ulasılabilir" sayilir.
  const reachable = new Set();
  const addNeighbours = (province) => {
    for (const id of province.neighbors ?? []) reachable.add(id);
  };
  for (const province of world.provinces ?? []) {
    if (province.owner === taker) addNeighbours(province);
  }
  const rest = [...candidates];
  let spent = 0;
  for (;;) {
    // Adaylar zaten deger sirasinda (occupiedProvincesOf maliyete gore
    // siralar). Iki kapi: bana KOMSU olacak, ve dusmani IKIYE BOLMEYECEK.
    // Bitisiklik TERCIHTIR, SART DEGIL. Sart yapinca muzaffer saldirgan
    // hicbir sey alamiyordu: isgal ettigi kume kendi kume grafina komsu
    // degilse masadan eli bos kalkiyordu (audit:war-outcome CRITICAL verdi,
    // "Your war score supports no more than 1 province"). Once komsu adaya
    // bakilir; yoksa en degerli uygun adaya dusulur.
    let index = rest.findIndex((entry) => reachable.has(entry.province.id)
      && canAfford(entry, spent, picked.length));
    if (index < 0) index = rest.findIndex((entry) => canAfford(entry, spent, picked.length));
    if (index < 0) break;
    const [entry] = rest.splice(index, 1);
    picked.push(entry);
    spent += entry.cost;
    addNeighbours(entry.province);
  }
  return picked;
}

/**
 * Şartların istenme sırası. Kalıcı olanlar (vassallık, bağımsızlık) önce
 * denenir; bütçe yetmezse süreli olanlara düşülür.
 */
const TERM_PRIORITY = [
  'VASSALIZE', 'LIBERATE', 'REPARATIONS', 'CONCESSION', 'DEMILITARIZE',
];

/**
 * Warscore bütçesiyle bir teklif kurar. Oyuncunun masada elle yaptığının
 * aynısı: önce tutulan toprak, kalan bütçe şartlara. Bütçe yoksa sonuç beyaz
 * barıştır — "savaşı bitirelim, kimse bir şey almasın".
 *
 * `appetite` bütçenin ne kadarının harcanacağını söyler; YZ her seferinde
 * son kuruşuna kadar dayatmasın diye vardır.
 */
export function buildOffer(world, a, b, options = {}) {
  const score = Math.max(0, warScore(world, a, b));
  const { appetite = 1, maxTiles = demandLimit(score), termShare = 0 } = options;
  const offer = { demands: [], concessions: [], terms: [] };
  const budget = Math.floor(score * clamp(appetite, 0, 1));
  if (budget <= 0) return offer;

  // Toprak her zaman önce gelirse şartlar hiç alınmaz: en ucuz şart bile birkaç
  // province ediyor. `termShare` bütçenin bir kısmını masada tutar, böylece
  // "toprak yerine tazminat" diyen bir barış da mümkün olur.
  const reserved = Math.floor(budget * clamp(termShare, 0, 1));
  let left = budget - reserved;
  // NOT: sayim `contiguousPick`in KENDI sayacindan gelir. Ilk yazimda burada
  // `offer.demands.length` okunuyordu, ama demands secim BITTIKTEN sonra
  // dolduruluyor: sayac hep 0 kaliyor, tavan hic uygulanmiyor ve teklif
  // warscore'un izin verdiginden fazla kume istiyordu. Muzaffer saldirgan
  // masadan eli bos kalkiyordu (audit:war-outcome CRITICAL).
  for (const { province, cost } of contiguousPick(world, a, occupiedProvincesOf(world, a, b),
    (entry, spent, count) => spent + entry.cost <= left && count < maxTiles)) {
    offer.demands.push(provinceKeyOf(province));
    left -= cost;
  }
  // Toprağa harcanmayan bütçe de şartlara akar; hiçbir puan boşa gitmez.
  left += reserved;
  for (const termId of TERM_PRIORITY) {
    const term = PEACE_TERMS[termId];
    if (!term || term.cost > left) continue;
    if (!termAvailable(world, a, b, termId)) continue;
    offer.terms.push(termId);
    left -= term.cost;
  }
  return offer;
}

/**
 * Teklifin *alıcı* için net değeri. Negatif sayı "bu kadarını kaybediyorum"
 * demektir. `offerCost` teklifi verenin gözünden bakar; masanın iki tarafı
 * olduğu için karşı tarafın hesabı da gerekli.
 */
export function offerValueFor(world, offer) {
  return -offerCost(world, offer);
}

/**
 * Süreli anlaşma şartını kaydeder. Etkiler tek yerde tutulur ki hangi ülkenin
 * neye tabi olduğu tek bakışta okunsun ve süre dolunca temizlenebilsin.
 */
function addTreaty(nation, treaty) {
  nation.treaties = (nation.treaties ?? []).filter(
    (existing) => existing.type !== treaty.type || existing.partner !== treaty.partner,
  );
  nation.treaties.push(treaty);
}

export function treatiesOf(nation) {
  return nation?.treaties ?? [];
}

/** Bir ülke şu an bu şarta tabi mi? */
export function underTreaty(nation, type, turn) {
  return treatiesOf(nation).some(
    (treaty) => treaty.type === type && (treaty.until ?? Infinity) > turn,
  );
}

/** Süresi dolan şartlar temizlenir; her tur bir kez çağrılır. */
export function expireTreaties(world, turn) {
  for (const nation of world.nations) {
    if (!nation.treaties?.length) continue;
    nation.treaties = nation.treaties.filter((treaty) => (treaty.until ?? Infinity) > turn);
  }
}

/** Toprak dışı şartların uygulanması. */
function applyTerms(game, a, b, terms) {
  const world = game.world;
  const turn = game.turns.turn;
  const winner = world.nations[a];
  const loser = world.nations[b];
  for (const termId of terms ?? []) {
    const term = PEACE_TERMS[termId];
    if (!term || !termAvailable(world, a, b, termId)) continue;
    if (termId === 'LIBERATE') {
      // Yabancı kültürlü kümeler bağımsızlaşır: imparatorluk küçülür ama
      // toprak fatihe geçmez — Victoria'daki "ulus serbest bırakma" bunu yapar.
      // Küme bütün olarak çözülür; sınır hiçbir kümeyi ikiye bölmez.
      for (const province of world.provinces ?? []) {
        if (province.owner !== b || !province.econ) continue;
        if (province.culture === loser.culture) continue;
        province.owner = -1;
        loser.provinces = Math.max(0, (loser.provinces ?? 0) - 1);
        for (const idx of province.tileIdx) {
          const tile = world.tiles[idx];
          loser.tiles = Math.max(0, loser.tiles - 1);
          tile.owner = -1;
          tile.controller = -1;
        }
        province.econ.control = 60;
        game.renderer.invalidateTiles(province.tileIdx.map((idx) => world.tiles[idx]));
      }
      continue;
    }
    if (termId === 'VASSALIZE') {
      addTreaty(loser, { type: 'VASSALIZE', partner: a, since: turn });
      continue;
    }
    addTreaty(loser, {
      type: termId, partner: a, since: turn, until: turn + (term.turns ?? 0),
    });
  }
  game.turns.addLog?.(`${winner.name} imposed terms on ${loser.name}.`, { silent: true });
}

/**
 * Anlaşmayı uygular. `settleOccupations` yerine *yalnız anlaşılan* kareler el
 * değiştirir; geri kalan işgaller barışla birlikte kalkar.
 */
export function signPeace(game, a, b, offer) {
  const world = game.world;
  if (!atWar(world, a, b)) return false;
  if (!offerAcceptable(world, a, b, offer)) return false;

  // Ayni kurbana kacinci savas? Seri yagma masada pahalilasir (salam freni).
  // Tavan x2.5: sinirsiz birakinca 14-tekrarli ciftler x7.5'e cikip kacak
  // dongu kuruyordu (koalisyon savasi -> ilhak -> daha cok sohret; olculdu:
  // zirve 286, esik ustu 1175 ulke-hafta/520hf). Fren isirmali, dunyayi yakmamali.
  const repeats = relation(world, a, b)?.wars ?? 1;
  const repeatScale = Math.min(2.5, 1 + 0.5 * Math.max(0, repeats - 1));
  const transfer = (keys, from, to) => {
    const taken = [];
    for (const key of keys ?? []) {
      const province = provinceFromKey(world, key);
      if (!province || province.owner !== from) continue;
      taken.push(province);
      // Devir küme bütünüyle: sınır hiçbir kümeyi ikiye bölmez.
      game.turns.claimAtPeace(province.center, to);
    }
    // Fethin KALICI diplomatik bedeli masada ödenir. İşgal şöhreti yerinde
    // kalır ama asıl kaynak burasıdır — bkz. infamy.annexInfamy.
    annexInfamy(world, world.nations[to], taken, repeatScale);
  };
  transfer(offer?.demands, b, a);
  transfer(offer?.concessions, a, b);
  applyTerms(game, a, b, offer?.terms);
  // Egemenlik degisti: fiyatlar ulke toplamindan turedigi icin tablo bayat.
  invalidateWarCosts(world);
  // Anlaşma dışında kalan işgaller sahibine döner: barış cepheyi siler.
  for (const tile of world.tiles) {
    const controller = controllerOf(tile);
    if (controller === tile.owner) continue;
    if ((tile.owner === a && controller === b) || (tile.owner === b && controller === a)) {
      tile.controller = tile.owner;
    }
  }
  // Baris bir SONUCTUR: kim ne aldi, ne odedi. Tek satirlik "terms imposed"
  // kor beta testcisine savasin nasil bittigini soylemiyordu.
  const player = game.turns.playerNation;
  if (a === player || b === player) {
    const other = world.nations[a === player ? b : a];
    const gained = (offer?.demands ?? []).length;
    const given = (offer?.concessions ?? []).length;
    const parts = [];
    if (a === player ? gained : given) parts.push(`${a === player ? gained : given} provinces annexed`);
    if (a === player ? given : gained) parts.push(`${a === player ? given : gained} provinces ceded`);
    for (const termId of offer?.terms ?? []) {
      const term = PEACE_TERMS[termId];
      if (term) parts.push(term.name.toLowerCase());
    }
    game.turns.addLog(`Peace signed with ${other?.name ?? 'a rival'}.`, {
      kind: 'PEACE',
      tier: 2,
      title: `Peace with ${other?.name ?? 'a rival'}`,
      body: parts.length ? `${parts.join(' · ')}.` : 'A white peace: the borders stand as they are.',
    });
  }
  return makePeace(game, a, b, { settle: false });
}
