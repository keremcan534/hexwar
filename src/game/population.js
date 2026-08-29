// POP kohortları: "bu ülkede kim, nerede, ne iş yaparak yaşıyor?"
//
// Bu dosya YENİ BİR NÜFUS SİSTEMİ DEĞİLDİR. Mevcut kanonik verinin üzerine
// kurulmuş bir türetme katmanıdır ve iki kaynağı birleştirir:
//
//   province.population        — nerede (kare başına gerçek nüfus)
//   professionCountsOf()       — ne iş (gerçek istihdamdan TÜRETİLİR)
//   tile.culture               — hangi kültür (kare başına)
//
// Neden türetme: ikinci bir nüfus deposu tutmak, iki sayacın zamanla
// birbirinden ayrılması demektir (ekranda 300 bin işçi, meslek tablosunda
// 80 bin — bu hata bu depoda bir kez yaşandı). Türetilen kohortların toplamı
// tanım gereği ulusal toplamı tutar; `reconcile` bunu her hafta kanıtlar.
//
// Dağıtım keyfi değil, gerçek zemine oturur:
//   farmers   -> tarım RGO istihdamı        (provinceRgoStatus)
//   laborers  -> madencilik RGO istihdamı   (provinceRgoStatus)
//   workers   -> province.industrialEmployees (runFactories yazar)
//   diğerleri -> nüfus payı, orta/üst sınıf şehirlere ağırlıklı
//
// Katman notu: yalnız okur. Simülasyonu değiştirmez, DOM bilmez.

import {
  CLASS_INFO, PROFESSION_INFO, factoryJobs, professionCountsOf,
} from './economy.js';
import { RGO_TYPES, rgoStatusOf } from './provinces.js';

/** Bu meslek hangi zemine göre dağıtılır? */
const BASIS = {
  farmers: 'agriculture',
  laborers: 'extraction',
  workers: 'industry',
  clerks: 'urban',
  artisans: 'urban',
  officers: 'population',
  capitalists: 'urban',
  aristocrats: 'population',
};

/**
 * Bir kümenin verilen zemindeki ağırlığı. Sıfır dönerse o meslek orada
 * yok demektir — kohort da üretilmez.
 */
function weightOf(entry, basis) {
  const econ = entry.province.econ;
  if (!econ) return 0;
  if (basis === 'population') return Math.max(0, econ.population);
  if (basis === 'urban') {
    // Kâtip, zanaatkâr ve kapitalist şehirde toplanır; şehirsiz küme
    // yine de az bir pay alır (kasaba esnafı).
    const urban = entry.city ? 3 + entry.city.level : 1;
    return Math.max(0, econ.population) * urban;
  }
  if (basis === 'industry') {
    // Zemin dolu kadro değil, KAPASITEDIR: işçi işin olduğu yere gider ve
    // boşta kalan kadro gerçek işsizliği verir. Dolu kadroya göre dağıtınca
    // işsizlik tanım gereği sıfırlanıyordu.
    const jobs = econ.industrialJobs ?? 0;
    return Math.max(0, jobs > 0 ? jobs : (econ.industrialEmployees ?? 0));
  }
  const status = rgoStatusOf(econ);
  const track = RGO_TYPES[econ.rgo]?.track;
  if (basis === 'agriculture') return track === 'agriculture' ? status.employed : 0;
  if (basis === 'extraction') return track === 'extraction' ? status.employed : 0;
  return 0;
}

/**
 * Tam sayı dağıtımı, en büyük artık yöntemiyle. Yuvarlama artığı kaybolmasın
 * ya da hayalet nüfus üretmesin: paylar toplamı her zaman `total`dir.
 */
function allocate(total, weights) {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const counts = new Array(weights.length).fill(0);
  if (total <= 0) return counts;
  if (sum <= 0) {
    // Zemin yoksa ilk province hepsini alır: nüfus buharlaşmaz.
    counts[0] = total;
    return counts;
  }
  const exact = weights.map((weight) => (weight / sum) * total);
  let used = 0;
  for (let i = 0; i < counts.length; i++) {
    counts[i] = Math.floor(exact[i]);
    used += counts[i];
  }
  // Kalanı en büyük kesirli artığa sahip olanlara dağıt.
  const order = exact
    .map((value, index) => ({ index, frac: value - Math.floor(value) }))
    .sort((a, b) => b.frac - a.frac);
  let remainder = total - used;
  for (let i = 0; remainder > 0; i = (i + 1) % order.length) {
    counts[order[i].index]++;
    remainder--;
  }
  return counts;
}

/**
 * Ülkenin sahip olduğu, nüfus taşıyan kümeler. Her girdi kümeyi, varsa
 * şehirli üyesini ve harita odağı için çapa karesini birlikte taşır (şehir
 * kümenin merkez karesinde olmayabilir).
 */
function ownedProvinces(world, nation) {
  const list = [];
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    let cityTile = null;
    for (const idx of province.tileIdx) {
      if (world.tiles[idx].city) {
        cityTile = world.tiles[idx];
        break;
      }
    }
    list.push({
      province,
      city: cityTile?.city ?? null,
      anchor: cityTile ?? province.center,
    });
  }
  if (list.length) return list;
  // KALINTI DEVLET: province sahipligi COGUNLUKLA belirlenir; birkac kareye
  // dusen ulke hicbir kumenin cogunlugunu tutmayabilir. Ekonomisi (tile
  // tabanli nufus, meslek sayaclari) yasarken kohort katmani bombos
  // kaliyordu — olculdu: 10.000 kisilik ulkede kohort toplami 0, "6.000
  // kisilik sapma". Kismi sahiplik burada zemin olur: ulkenin kare sahibi
  // oldugu kumeler uzerinden dagitilir ki turetilen toplam sayaci tutsun.
  const partial = new Map();
  for (const tile of world.tiles) {
    if (tile.owner !== nation.id || tile.provinceId == null || tile.provinceId < 0) continue;
    const province = world.provinces?.[tile.provinceId];
    if (!province?.econ) continue;
    const entry = partial.get(province.id) ?? { province, city: null, anchor: tile };
    if (tile.city && !entry.city) {
      entry.city = tile.city;
      entry.anchor = tile;
    }
    partial.set(province.id, entry);
  }
  return [...partial.values()];
}

/**
 * Bir kohortun ekonomisi. Sınıf düzeyindeki gerçek rakamlar kişi başına
 * indirgenip kohort boyutuyla çarpılır — uydurma yok, sınıfın kendi
 * geliri/vergisi/sepeti neyse kohorta o oranda düşer. Pay, kohort boyutu
 * değil ETKİNLİK ağırlığıdır (bkz. activityWeight): işsiz kohort daha az alır
 * ve sınıf toplamı yine de birebir korunur.
 */
/**
 * Issiz bir kohortun kisi basina geliri, calisanin bu kadari kadardir. Bu
 * agirlik yokken istihdam durumu hane ekonomisine hic girmiyordu: ayni
 * province'te calisan ve issiz isci kohortu kisi basi AYNI geliri ve AYNI
 * tuketimi gosteriyordu (olculdu).
 */
const UNEMPLOYED_INCOME_SHARE = 0.35;

/** Kohortun gelir agirligi: issizlik payi kadar dusuk. */
function activityWeight(size, employment) {
  if (!employment || employment.employed == null || size <= 0) return size;
  const employed = Math.min(size, Math.max(0, employment.employed));
  return employed + (size - employed) * UNEMPLOYED_INCOME_SHARE;
}

function cohortEconomics(nation, classId, size, share) {
  const socialClass = nation.economy?.classes?.[classId];
  if (!socialClass || !(socialClass.population > 0)) {
    return { income: 0, taxPaid: 0, consumption: 0, disposable: 0, needsFulfilled: 1 };
  }
  const consumption = (socialClass.needsCost ?? 0) * share;
  const disposable = (socialClass.needsBudget ?? 0) * share;
  return {
    income: (socialClass.income ?? 0) * share,
    taxPaid: (socialClass.taxPaid ?? 0) * share,
    consumption,
    disposable,
    // Sepetinin ne kadarını gerçekten aldı (1 = tamamı). İki kapıya birden
    // bakar: parası yetti mi ve mal var mıydı (bkz. economy.js needsMet).
    // Yalnız bütçeye bakan eski ölçü, tamamen boş bir pazarda bile "%99
    // karşılandı" diyordu — kohort katmanı ile ekonomi katmanı aynı hanenin
    // iki farklı hikâyesini anlatıyordu.
    needsFulfilled: socialClass.needsMet
      ?? (consumption > 0 ? Math.min(1, disposable / consumption) : 1),
  };
}

/**
 * Ülkenin POP kohortları. Bir kohort = province × meslek; kültür kareden
 * gelir (bir karede tek kültür yaşar, o yüzden ayrı kırılım gerekmez).
 * Boyu sıfır olan kohort üretilmez.
 */
export function nationCohorts(world, nation) {
  const economy = nation?.economy;
  if (!economy?.classes) return [];
  const entries = ownedProvinces(world, nation);
  if (!entries.length) return [];
  // Meslek sayaçları artık DEPO DEĞİL: gerçek istihdamdan türetiliyorlar
  // (bkz. econ/pop.js). Toplamları tanım gereği nüfusa eşittir.
  const professionCounts = professionCountsOf(nation);

  // Once butun kohortlar ve istihdamlari kurulur; gelir dagitimi ancak sinifin
  // TOPLAM etkinlik agirligi bilindiginde yapilabilir (yoksa paylar toplami
  // 1 etmez ve sinif geliri sizar).
  const draft = [];
  for (const [professionId, profession] of Object.entries(PROFESSION_INFO)) {
    const total = Math.max(0, Math.round(professionCounts[professionId] ?? 0));
    if (total <= 0) continue;
    const basis = BASIS[professionId] ?? 'population';
    let weights = entries.map((entry) => weightOf(entry, basis));
    // Zemin tamamen boşsa (ör. hiç fabrika yok ama işçi sayılmış) nüfusa düş:
    // meslek kaybolmasın, hepsi ilk kümeye yığılmasın.
    if (weights.every((value) => value <= 0)) {
      weights = entries.map((entry) => weightOf(entry, 'population'));
    }
    const sizes = allocate(total, weights);
    for (let i = 0; i < entries.length; i++) {
      const size = sizes[i];
      if (size <= 0) continue;
      const entry = entries[i];
      const employment = cohortEmployment(world, nation, entry, professionId, size);
      draft.push({
        // Kimlik küme id'sine bağlı: bölümleme deterministik olduğundan kayıt
        // ve ekran arasında kaymaz.
        id: `p${entry.province.id}:${professionId}`,
        provinceId: entry.province.id,
        provinceName: entry.province.name,
        // Harita odağı ve şehir bazlı türetmeler (okuryazarlık) için çapa kare.
        tile: entry.anchor,
        q: entry.anchor.q,
        r: entry.anchor.r,
        professionId,
        professionName: profession.name,
        classId: profession.classId,
        className: CLASS_INFO[profession.classId]?.name ?? profession.classId,
        culture: entry.province.culture,
        size,
        employment,
        weight: activityWeight(size, employment),
      });
    }
  }

  const classWeight = {};
  for (const cohort of draft) {
    classWeight[cohort.classId] = (classWeight[cohort.classId] ?? 0) + cohort.weight;
  }
  return draft.map(({ weight, employment, ...cohort }) => ({
    ...cohort,
    ...cohortEconomics(nation, cohort.classId, cohort.size,
      classWeight[cohort.classId] > 0 ? weight / classWeight[cohort.classId] : 0),
    ...employment,
  }));
}

/**
 * İstihdam. Yalnız gerçek iş yeri olan meslekler için anlamlı: fabrika işçisi
 * o province'teki tesis kadrosuna, çiftçi/madenci RGO kadrosuna bakar.
 * Diğer meslekler için istihdam kavramı yok (null) — uydurma oran üretilmez.
 */
function cohortEmployment(world, nation, entry, professionId, size) {
  if (professionId === 'workers') {
    // Fabrika kare koordinatıyla çapalı; kümesi provinceId üzerinden çözülür.
    const factories = (nation.economy?.factories ?? []).filter(
      (factory) => world.get(factory.q, factory.r)?.provinceId === entry.province.id,
    );
    const employed = Math.min(size, Math.round(
      factories.reduce((sum, factory) => sum + (factory.employees ?? 0), 0),
    ));
    const vacancies = Math.max(0, Math.round(
      factories.reduce((sum, factory) => sum + factoryJobs(factory) - (factory.employees ?? 0), 0),
    ));
    return {
      employed,
      unemployed: Math.max(0, size - employed),
      vacancies,
      workplaces: factories.length,
    };
  }
  if (professionId === 'farmers' || professionId === 'laborers') {
    const status = rgoStatusOf(entry.province.econ);
    const employed = Math.min(size, Math.round(status.employed));
    return {
      employed,
      unemployed: Math.max(0, size - employed),
      vacancies: Math.max(0, Math.round(status.vacancies)),
      workplaces: status.type ? 1 : 0,
    };
  }
  return { employed: null, unemployed: null, vacancies: 0, workplaces: 0 };
}

/**
 * Muhasebe kanıtı: kohort toplamı ulusal meslek sayaçlarını ve sınıf
 * toplamlarını tutuyor mu? Hayalet nüfus ya da kayıp nüfus varsa burada
 * görünür (bkz. population-cohort-diagnostic).
 */
export function reconcile(world, nation) {
  const cohorts = nationCohorts(world, nation);
  const economy = nation.economy ?? {};
  const professionCounts = professionCountsOf(nation);
  const byProfession = {};
  const byClass = {};
  let total = 0;
  for (const cohort of cohorts) {
    byProfession[cohort.professionId] = (byProfession[cohort.professionId] ?? 0) + cohort.size;
    byClass[cohort.classId] = (byClass[cohort.classId] ?? 0) + cohort.size;
    total += cohort.size;
  }
  const professionDrift = Object.entries(PROFESSION_INFO).map(([id]) => ({
    id,
    expected: Math.round(professionCounts[id] ?? 0),
    actual: byProfession[id] ?? 0,
  }));
  const classDrift = Object.keys(CLASS_INFO).map((id) => ({
    id,
    expected: Math.round(economy.classes?.[id]?.population ?? 0),
    actual: byClass[id] ?? 0,
  }));
  return {
    cohorts: cohorts.length,
    total,
    cohortPopulation: Math.round(economy.population ?? 0),
    professionDrift,
    classDrift,
    worstDrift: Math.max(
      0,
      ...professionDrift.map((row) => Math.abs(row.expected - row.actual)),
      ...classDrift.map((row) => Math.abs(row.expected - row.actual)),
    ),
  };
}

/** Ekranın üstündeki dağılımlar için toplayıcı. */
export function summarize(cohorts) {
  const bucket = (keyFn) => {
    const map = new Map();
    for (const cohort of cohorts) {
      const key = keyFn(cohort);
      map.set(key, (map.get(key) ?? 0) + cohort.size);
    }
    return [...map].sort((a, b) => b[1] - a[1]);
  };
  const total = cohorts.reduce((sum, cohort) => sum + cohort.size, 0);
  const employable = cohorts.filter((cohort) => cohort.employed !== null);
  const employed = employable.reduce((sum, cohort) => sum + cohort.employed, 0);
  const employableTotal = employable.reduce((sum, cohort) => sum + cohort.size, 0);
  return {
    total,
    byClass: bucket((cohort) => cohort.classId),
    byProfession: bucket((cohort) => cohort.professionId),
    byCulture: bucket((cohort) => cohort.culture),
    employment: employableTotal > 0 ? employed / employableTotal : null,
    employed,
    employableTotal,
    // Ağırlıklı ortalama ihtiyaç karşılama: küçük kohort büyüğü ezmesin.
    needsFulfilled: total > 0
      ? cohorts.reduce((sum, cohort) => sum + cohort.needsFulfilled * cohort.size, 0) / total
      : 1,
  };
}
