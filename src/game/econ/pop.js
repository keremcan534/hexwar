// NÜFUS — tek gerçek, türetilmiş her şey.
//
// Kanonik nüfus `province.econ.population`dur. Ulusal nüfus onun toplamıdır,
// sınıf nüfusu paydan, işgücü nüfustan, meslek sayaçları gerçek istihdamdan
// türetilir. Bu yüzden "10.000 nüfus / 96.000 işçi" yapısal olarak mümkün
// değildir ve haftalık bir onarım süpürgesine ihtiyaç yoktur.
//
//   nüfus        province toplamı                    (kanonik)
//   sınıf        nüfus × classShares[id]              (3 sayılık durum)
//   işgücü       nüfus × WORKFORCE_RATE               (türetme)
//   istihdam     Σfabrika kadrosu + RGO kadrosu       (türetme)
//   işsizlik     işgücü − istihdam                    (türetme)
//   meslek       gerçek istihdam + sabit paylar       (türetme)
//
// Hane talebi de burada: sepet → bütçe → alınan. İstihdam nüfus YARATMAZ.
//
// Katman notu: içerik ve piyasa dışında hiçbir şey içe aktarmaz. DOM bilmez.

import {
  CLASS_INFO, CLASS_NEEDS, CLASS_PROFESSIONS, FOOD_GOODS,
  PROFESSION_INFO, PROFESSION_SHARES, needAmount,
} from './content.js';
import { addDemand, priceOf } from './market.js';

export const CLASS_IDS = Object.keys(CLASS_INFO);
const PROFESSION_IDS = Object.keys(PROFESSION_INFO);

/**
 * Nüfusun iş tutabilecek payı. Çocuk, yaşlı ve hane içi emek dışarıda kalır;
 * 19. yüzyıl için ~%45 makul bir ölçektir. Tek sayı, tek anlam.
 */
export const WORKFORCE_RATE = 0.45;

/**
 * Sanayinin işgücünden alabileceği en büyük pay. Tarla ve maden de işçi
 * ister; bu tavan olmadan sanayi bütün işgücünü yutar ve hammadde biter.
 *
 * 0.7 = nüfusun ~%31'i (0.7 × WORKFORCE_RATE). Eski modelin tavanı "alt
 * sınıfın %40'ı" = nüfusun ~%31'iydi; aynı yere denk gelsin diye ölçüldü.
 * 0.55 ile 100 yıllık koşuda kurulu tesis sayısı 1065'te kalıyordu (eski
 * çekirdek 1468) — sanayileşme tavana çarpıyordu, iştahsızlıktan değil.
 */
export const MAX_INDUSTRIAL_SHARE = 0.7;

/** Sınıf tavanları: yukarı geçiş serbest kalırsa alt sınıf (işgücü) erir. */
export const CLASS_CEILING = { middle: 0.34, upper: 0.11 };

/** Haftalık sınıf geçiş hızı. Yüzyılda görünür, on yılda değil. */
const MOBILITY_RATE = 0.0006;

/** Sepetin parasal olmayan payı: sınıf kendi ürettiğinin bir kısmını yer. */
export const SUBSISTENCE_SHARE = { lower: 0.30, middle: 0.15, upper: 0 };

/** Refahın sepetten düştüğü pay (sınıfa göre). Aristokrasiye sosyal yardım yok. */
const WELFARE_RELIEF = { lower: 0.35, middle: 0.12, upper: 0 };

/** Tam işsizlikte alt sınıf memnuniyetinden düşen puan (orta sınıf yarısı). */
export const UNEMPLOYMENT_MOOD = 0.22;

/**
 * Fabrika katma değerinin emeğe giden payı — TEK ücret formülü.
 *
 * Kişi başına sabit bir "geçim ücreti" denendi ve ÖLÇÜLEREK geri alındı:
 * bu oyunun ölçeğinde bir işçinin ürettiği katma değer, geçim sepetinin çok
 * üstünde. Sabit ücret bordoyu katma değerin %4'üne indiriyor, sanayi kârının
 * neredeyse tamamı üst sınıfa gidiyor ve tüketici talebi ölüyordu (156. hafta:
 * bordro 26, kâr 618; 42 malın 22'si fiyat tabanında). Pay modeli hem tek
 * satırlık bir hesap hem de fiyat seviyesiyle kendiliğinden ölçekleniyor.
 */
export const LABOR_SHARE = 0.55;

/** İstikrarın ekonomik olmayan cezaları. */
const STABILITY_WEIGHTS = { occupation: 0.35, war: 0.18, unemployment: 0.16 };

/** Sınıf gelirinin üç kanalı (bkz. distributeIncome). */
export const INCOME_POOL_SHARE = 0.35;
export const INCOME_WEIGHTS = { lower: 0.42, middle: 0.33, upper: 0.25 };
export const WAGE_SPLIT = { lower: 0.8, middle: 0.2 };
export const PROFIT_TO_CAPITAL = 0.5;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const FOOD_SET = new Set(FOOD_GOODS);

// Sınıf sepetlerinin önceden açılmış listeleri: tablo statik, her hafta ülke
// başına Object.entries kurmak boşuna çöp.
const NEEDS_ENTRIES = CLASS_IDS.map((id) => [id, Object.entries(CLASS_NEEDS[id] ?? {})]);

const emptyClass = (id) => ({
  id,
  population: 0,
  income: 0,
  taxPaid: 0,
  satisfaction: 0.62,
  needsCost: 0,
  needsBudget: 0,
  needsMet: 1,
  foodMet: 1,
});

/**
 * Nüfus durumunu kurar/tamamlar. Eski kayıttan gelen `professionCounts`,
 * `cohortPopulation`, `savings` gibi alanlar düşürülür: artık türetiliyorlar.
 */
export function ensurePopulation(nation, population = nation?.economy?.population ?? 0) {
  const economy = nation.economy;
  economy.classes ??= {};
  for (const id of CLASS_IDS) {
    const existing = economy.classes[id];
    if (!existing) economy.classes[id] = emptyClass(id);
    else {
      const defaults = emptyClass(id);
      for (const key in defaults) existing[key] ??= defaults[key];
    }
  }
  if (!economy.classShares || !CLASS_IDS.every((id) => Number.isFinite(economy.classShares[id]))) {
    // Eski kayıt: sınıf nüfuslarından pay türet, yoksa katalog varsayılanı.
    const total = CLASS_IDS.reduce((sum, id) => sum + (economy.classes[id].population ?? 0), 0);
    economy.classShares = total > 0
      ? Object.fromEntries(CLASS_IDS.map((id) => [id, economy.classes[id].population / total]))
      : Object.fromEntries(CLASS_IDS.map((id) => [id, CLASS_INFO[id].share]));
  }
  normalizeShares(economy.classShares);
  setPopulation(nation, population);
  return economy;
}

function normalizeShares(shares) {
  let total = 0;
  for (const id of CLASS_IDS) {
    shares[id] = clamp(Number.isFinite(shares[id]) ? shares[id] : 0, 0, 1);
    total += shares[id];
  }
  if (total <= 0) {
    for (const id of CLASS_IDS) shares[id] = CLASS_INFO[id].share;
    return;
  }
  for (const id of CLASS_IDS) shares[id] /= total;
}

/**
 * NÜFUS ANLIK GÖRÜNTÜSÜ — haftanın 1. adımı.
 * Ulusal nüfus province toplamıdır; sınıf nüfusu ondan türer. Başka hiçbir
 * yerde nüfus yazılmaz.
 */
export function setPopulation(nation, population) {
  const economy = nation.economy;
  const value = Math.max(0, Math.round(Number.isFinite(population) ? population : 0));
  economy.population = value;
  const shares = economy.classShares;
  for (const id of CLASS_IDS) economy.classes[id].population = value * shares[id];
  economy.workforce = value * WORKFORCE_RATE;
  return value;
}

/** Fabrikalarda fiilen çalışan sayısı. */
export function industrialEmployedOf(nation) {
  let sum = 0;
  for (const factory of nation.economy?.factories ?? []) sum += Math.max(0, factory.employees ?? 0);
  return sum;
}

/**
 * İSTİHDAM DEFTERİ — işgücü tükenir, yaratılmaz.
 *
 *   sanayi   = Σ fabrika kadrosu  (işgücü tavanıyla sınırlı)
 *   kırsal   = kalan işgücünün RGO kadrosuna sığan kısmı
 *   işsiz    = işgücü − sanayi − kırsal
 *
 * `rgoJobs` çağıran taraftan gelir (provinces.js); bu modül harita bilmez.
 */
export function updateEmployment(nation, rgoJobs = 0) {
  const economy = nation.economy;
  const workforce = Math.max(0, economy.workforce ?? 0);
  const industrial = Math.min(industrialEmployedOf(nation), workforce);
  const rural = Math.min(Math.max(0, workforce - industrial), Math.max(0, rgoJobs));
  economy.industrialEmployed = industrial;
  economy.ruralEmployed = rural;
  economy.employed = industrial + rural;
  economy.unemployed = Math.max(0, workforce - economy.employed);
  economy.unemploymentRate = workforce > 0 ? clamp(economy.unemployed / workforce, 0, 1) : 0;
  // Sanayinin nüfustaki payı: provinces.js kırsal nüfusu bununla düşer, yani
  // aynı insan hem tarlada hem fabrikada sayılamaz (banliyö onarımı gereksiz).
  economy.industrialShare = economy.population > 0
    ? clamp(industrial / economy.population, 0, 1) : 0;
  return economy.employed;
}

/**
 * İşgücü tavanı fabrika kadrosunu aşarsa (nüfus çöktü, toprak kaybedildi)
 * kadro küçülür. Bu bir onarım değil açık bir kanaldır: insan kalmayınca
 * tesis işçi tutamaz; düşen kadro sayılır ve ekranda görünür.
 */
export function enforceWorkforceCap(nation) {
  const economy = nation.economy;
  const cap = Math.max(0, (economy.workforce ?? 0) * MAX_INDUSTRIAL_SHARE);
  const employed = industrialEmployedOf(nation);
  economy.workforceLayoffs = 0;
  if (employed <= cap || employed <= 0) return 0;
  const scale = cap / employed;
  for (const factory of economy.factories ?? []) factory.employees *= scale;
  economy.workforceLayoffs = employed - cap;
  return economy.workforceLayoffs;
}

/** İşe alım havuzunun tavanı: boşta duran işgücünün sanayiye ayrılan payı. */
export function hiringHeadroom(nation) {
  const economy = nation.economy;
  const cap = Math.max(0, (economy.workforce ?? 0) * MAX_INDUSTRIAL_SHARE);
  return Math.max(0, cap - industrialEmployedOf(nation));
}

/**
 * GELİR — üç açık kanal, başka yok.
 *
 *   1. kırsal/ham üretimin pazarlanan payı   (baseOutputValue × 0.35)
 *   2. fabrika bordrosu                       (gövde işçi %80, beyaz yaka %20)
 *   3. sanayi kârının sermayedar payı         (kârın %50'si, üst sınıfa)
 *
 * `withheld`: şirketin yabancı ortağına bu hafta ödenen temettü. Bir
 * TRANSFERDİR ve yurt içi üst sınıfın gelirinden düşülür, yoksa aynı para iki
 * hanede birden görünürdü.
 */
export function distributeIncome(nation, baseOutputValue, taxEfficiency = 1) {
  const economy = nation.economy;
  const pool = Math.max(1, baseOutputValue * INCOME_POOL_SHARE);
  const wages = Math.max(0, economy.wagesPaid ?? 0);
  const profitShare = (economy.factoryProfit ?? 0) * PROFIT_TO_CAPITAL;
  const withheld = Math.max(0, economy.capitalWithheld ?? 0);
  let taxes = 0;
  for (const id of CLASS_IDS) {
    const socialClass = economy.classes[id];
    socialClass.income = Math.max(0, pool * INCOME_WEIGHTS[id]
      + wages * (WAGE_SPLIT[id] ?? 0)
      + (id === 'upper' ? profitShare - withheld : 0));
    socialClass.taxPaid = socialClass.income * (economy.taxes[id] / 100);
    taxes += socialClass.taxPaid;
  }
  economy.taxRevenue = taxes * taxEfficiency;
  return economy.taxRevenue;
}

/**
 * HANE TALEBİ — haftanın 4. adımı.
 *
 * Sınıf başına tek geçiş:
 *
 *   istenen sepet   = sınıfNüfusu/10000 × ihtiyaç
 *   cepten          = sepet bedeli × (1 − refah indirimi)
 *   bütçe           = net gelir + geçimlik payı
 *   alınan          = istenen × min(1, bütçe / cepten)
 *
 * Gelir GEÇEN HAFTANINDIR (`distributeIncome` bu fonksiyondan sonra koşar);
 * gecikme bütün ülkeleri eşit etkiler ve tick içi döngüyü keser.
 */
export function householdDemand(world, nation, market, welfare = 0, moodShift = () => 0) {
  const economy = nation.economy;
  const turn = world.turn ?? 1;
  const tariff = (economy.tariff ?? 0) / 100;
  const unemployment = clamp(economy.unemploymentRate ?? 0, 0, 1);
  let basketTotal = 0;
  let satisfactionWeighted = 0;
  let metWeighted = 0;
  let foodWeighted = 0;

  for (let c = 0; c < NEEDS_ENTRIES.length; c++) {
    const classId = NEEDS_ENTRIES[c][0];
    const entries = NEEDS_ENTRIES[c][1];
    const socialClass = economy.classes[classId];
    const scale = socialClass.population / 10000;

    // 1. GEÇİŞ — istenen sepetin bedeli ve rafta bulunma oranı.
    // Gıda ve gıda dışı AYRI toplanır: hane önce karnını doyurur.
    let foodCost = 0;
    let restCost = 0;
    let foodBase = 0;
    let restBase = 0;
    let foodShelf = 0;
    let restShelf = 0;
    for (let n = 0; n < entries.length; n++) {
      const goodId = entries[n][0];
      const amount = needAmount(entries[n][1], turn);
      if (amount <= 0) continue;
      const quantity = amount * scale;
      const flow = economy.goodsFlow[goodId];
      const importShare = clamp(flow?.importShare ?? 0, 0, 1);
      // Gümrük yalnız ithal payına biner; taban 0 çünkü para ödeyen sepetin
      // bedeli eksiye dönemez (sübvansiyon bedava yapar, negatif yapmaz).
      const cost = priceOf(world, goodId) * quantity * Math.max(0, 1 + tariff * importShare);
      // Ağırlık TABAN fiyattır: sepetin tasarlanmış bileşimi budur. Güncel
      // fiyatla ölçünce tavana yapışmış küçük bir lüks sepeti ele geçirir.
      const base = market.goods[goodId].basePrice * quantity;
      // Rafta var mıydı: geçen haftanın karşılanma oranı (bu haftanın
      // ticareti henüz kapanmadı).
      const shelf = base * clamp(flow?.fulfilledShare ?? 1, 0, 1);
      if (FOOD_SET.has(goodId)) {
        foodCost += cost;
        foodBase += base;
        foodShelf += shelf;
      } else {
        restCost += cost;
        restBase += base;
        restShelf += shelf;
      }
    }
    const basket = foodCost + restCost;

    // 2. BÜTÇE — net gelir + beyan edilmiş geçimlik; refah cepten çıkanı düşürür.
    const relief = 1 - welfare * (WELFARE_RELIEF[classId] ?? 0);
    const foodOutOfPocket = foodCost * relief;
    const restOutOfPocket = restCost * relief;
    const netIncome = Math.max(0, (socialClass.income ?? 0) - (socialClass.taxPaid ?? 0));
    const subsistence = basket * (SUBSISTENCE_SHARE[classId] ?? 0);
    const budget = netIncome + subsistence;

    // 3. ÖNCE KARIN DOYAR. Bütçe önce gıdaya gider, artanı gıda dışına.
    // Bu sıra olmadan pahalı bir lüks (şarap, telefon) bütün sepeti eşit
    // oranda kısıyor ve nüfus, tahıl bedavayken açlıktan ölüyordu.
    const foodAfford = foodOutOfPocket > 1e-9
      ? clamp(budget / foodOutOfPocket, 0, 1) : 1;
    const left = Math.max(0, budget - foodOutOfPocket * foodAfford);
    const restAfford = restOutOfPocket > 1e-9 ? clamp(left / restOutOfPocket, 0, 1) : 1;

    // 4. ALINAN — hane ancak ödeyebildiği kadarını satın alır.
    for (let n = 0; n < entries.length; n++) {
      const goodId = entries[n][0];
      const amount = needAmount(entries[n][1], turn);
      if (amount <= 0) continue;
      const share = FOOD_SET.has(goodId) ? foodAfford : restAfford;
      addDemand(market, nation, goodId, 'households', amount * scale * share);
    }

    // 5. KARŞILANMA — iki kapı: parası yetti mi, mal var mıydı.
    const foodAvailability = foodBase > 1e-9 ? clamp(foodShelf / foodBase, 0, 1) : 1;
    const restAvailability = restBase > 1e-9 ? clamp(restShelf / restBase, 0, 1) : 1;
    const totalBase = foodBase + restBase;
    const outOfPocket = foodOutOfPocket + restOutOfPocket;
    const affordShare = outOfPocket > 1e-9
      ? (foodOutOfPocket * foodAfford + restOutOfPocket * restAfford) / outOfPocket : 1;
    socialClass.needsCost = outOfPocket;
    socialClass.foodCost = foodOutOfPocket;
    socialClass.needsBudget = budget;
    socialClass.subsistence = subsistence;
    socialClass.affordShare = affordShare;
    socialClass.needsMet = totalBase > 1e-9
      ? (foodBase * foodAfford * foodAvailability
        + restBase * restAfford * restAvailability) / totalBase
      : 1;
    socialClass.foodMet = foodAfford * foodAvailability;
    socialClass.satisfaction = clamp(
      0.35 + socialClass.needsMet * 0.5
        - (economy.taxes[classId] / 100) * 0.28
        + welfare * 0.14
        + moodShift(nation, classId)
        - (classId === 'upper' ? 0
          : unemployment * (classId === 'lower' ? UNEMPLOYMENT_MOOD : UNEMPLOYMENT_MOOD * 0.5)),
      0.08, 0.95,
    );

    basketTotal += basket;
    satisfactionWeighted += socialClass.satisfaction * socialClass.population;
    metWeighted += socialClass.needsMet * socialClass.population;
    foodWeighted += socialClass.foodMet * socialClass.population;
  }

  const population = Math.max(1, economy.population);
  economy.needsMet = clamp(metWeighted / population, 0, 1);
  // BESLENME AYRI BİR KANALDIR. Nüfus artışı YALNIZ bunu okur; karşılanamayan
  // bir lüks açlık yaratamaz (eski modelin en pahalı hatası buydu).
  economy.foodMet = clamp(foodWeighted / population, 0, 1);
  economy.satisfaction = clamp(satisfactionWeighted / population, 0, 1);
  economy.standardOfLiving = 5 + 15 * economy.satisfaction;
  return basketTotal;
}

/** İSTİKRAR: memnuniyet eksi işgal, savaş ve işsizlik. */
export function updateStability(nation) {
  const economy = nation.economy;
  const base = clamp(economy.satisfaction ?? 0.5, 0, 1);
  const occupation = clamp(economy.occupiedShare ?? 0, 0, 1);
  const war = clamp(economy.warStrain ?? 0, 0, 1);
  const unemployment = clamp(economy.unemploymentRate ?? 0, 0, 1);
  const occupationHit = -occupation * STABILITY_WEIGHTS.occupation;
  const warHit = -war * STABILITY_WEIGHTS.war;
  const unemploymentHit = -unemployment * STABILITY_WEIGHTS.unemployment;
  economy.stability = clamp(base + occupationHit + warHit + unemploymentHit, 0.03, 0.98);
  economy.stabilityBreakdown = {
    base,
    occupation: occupationHit,
    war: warHit,
    unemployment: unemploymentHit,
    occupiedShare: occupation,
    occupiedTiles: economy.occupiedTiles ?? 0,
    warFronts: economy.warFronts ?? 0,
    unemploymentShare: unemployment,
    unemployed: Math.round(economy.unemployed ?? 0),
    total: economy.stability,
  };
  return economy.stability;
}

/**
 * SINIF HAREKETLİLİĞİ — kohort taşımak yerine PAY kaydırmak.
 *
 * Refah yukarı taşır, yoksulluk aşağı. Eğitim yükselişi hızlandırır. Sayaç
 * yok, kuantum yok, hizalama yok: üç sayı toplamı her zaman 1'dir.
 */
export function runClassMobility(nation, schooling = 0) {
  const economy = nation.economy;
  const shares = economy.classShares;
  const speed = MOBILITY_RATE * (1 + schooling);
  const move = (from, to, amount) => {
    const value = Math.min(amount, shares[from] * 0.5);
    if (!(value > 0)) return 0;
    shares[from] -= value;
    shares[to] += value;
    return value;
  };
  const mobility = { promotedLower: 0, promotedMiddle: 0, demotedMiddle: 0, demotedUpper: 0 };
  const met = (id) => economy.classes[id].needsMet ?? 1;
  const total = 1;

  if (met('lower') > 0.75 && shares.middle < CLASS_CEILING.middle * total) {
    mobility.promotedLower = move('lower', 'middle', shares.lower * speed);
  } else if (met('middle') < 0.5) {
    mobility.demotedMiddle = move('middle', 'lower', shares.middle * speed * 2);
  }
  if (met('middle') > 0.8 && shares.upper < CLASS_CEILING.upper * total) {
    mobility.promotedMiddle = move('middle', 'upper', shares.middle * speed);
  } else if (met('upper') < 0.5) {
    mobility.demotedUpper = move('upper', 'middle', shares.upper * speed * 2);
  }
  normalizeShares(shares);
  economy.mobility = mobility;
  setPopulation(nation, economy.population);
  return mobility;
}

/**
 * MESLEK SAYAÇLARI — türetme, depo değil.
 *
 * Gerçek istihdamı bilinen meslekler işin kendisinden gelir (işçi = fabrika
 * kadrosu, çiftçi/madenci = RGO kadrosu payı); kalanı sabit paylarla bölünür.
 * Toplam her zaman nüfusa eşittir, çünkü nüfustan bölünüyor.
 */
export function professionCountsOf(nation, extractionShare = 0.3) {
  const economy = nation.economy;
  const counts = {};
  for (const id of PROFESSION_IDS) counts[id] = 0;
  const lower = Math.max(0, economy.classes?.lower?.population ?? 0);
  const workers = Math.min(lower, Math.max(0, economy.industrialEmployed ?? 0));
  const rest = Math.max(0, lower - workers);
  counts.workers = workers;
  counts.laborers = rest * clamp(extractionShare, 0, 1);
  counts.farmers = rest - counts.laborers;
  for (const classId of ['middle', 'upper']) {
    const population = Math.max(0, economy.classes?.[classId]?.population ?? 0);
    for (const id of CLASS_PROFESSIONS[classId]) {
      counts[id] = population * (PROFESSION_SHARES[classId][id] ?? 0);
    }
  }
  return counts;
}

/**
 * Hane sepetinin dökümü — ekranın ve raporun okuduğu açıklama.
 * Hiçbir sayı burada yeniden hesaplanmaz.
 */
export function householdBreakdown(nation, classId) {
  const socialClass = nation?.economy?.classes?.[classId];
  if (!socialClass) return null;
  return {
    classId,
    population: socialClass.population,
    basket: socialClass.needsCost,
    income: Math.max(0, (socialClass.income ?? 0) - (socialClass.taxPaid ?? 0)),
    subsistence: socialClass.subsistence ?? 0,
    budget: socialClass.needsBudget,
    affordShare: socialClass.affordShare ?? 1,
    needsMet: socialClass.needsMet,
    foodMet: socialClass.foodMet,
    satisfaction: socialClass.satisfaction,
    // Sepetin gıda kısmı ayrı: "önce karnını doyurur" kuralı ekranda görünsün.
    foodCost: socialClass.foodCost ?? 0,
  };
}
