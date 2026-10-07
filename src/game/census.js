// Nüfus sayımı: Population ekranının okuduğu türetme katmanı.
//
// Bu dosya SİMÜLASYON DEĞİLDİR. Hiçbir şey yazmaz, hiçbir sayacı ilerletmez;
// yalnız kanonik veriyi ekranın istediği iki şekle çevirir:
//
//   1. coğrafi ağaç      ülke → state → province   (constructionAtlas + province)
//   2. altı dağılım      meslek, kültür, mezhep, ideoloji, mesele, seçmen
//
// Neden ayrı dosya: population.js kohortları ÜRETİR ve ulusal toplamı tutmakla
// yükümlüdür (bkz. reconcile). Ekranın kırılımları oraya karışırsa o dosyanın
// tek işi bulanır. Burası yalnız okur ve DOM bilmez — renk seçimi UI'ya aittir
// (bkz. ui/populationScreen.js).
//
// Kaynağı olmayan alanlar (mezhep, okuryazarlık, militanlık) TÜRETİLMİŞ
// GÖSTERGEDİR: gerçek sinyallerden deterministik hesaplanır, simülasyona geri
// beslenmez ve kayda girmez. Her biri kendi yorumunda ayrıca işaretlidir.

import { makeRng } from '../core/rng.js';
import { constructionAtlas } from './construction.js';
import {
  CLASS_IDEOLOGY, IDEOLOGIES, PARTIES, POLITICAL_POLICIES,
} from './politics.js';
import { nationCohorts } from './population.js';
import { provinceName } from './provinces.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Bir province kümesinin ağaçtaki ve seçimdeki kimliği. */
export const provinceKey = (province) => `p${province.id}`;

// --- Bellekleme ---------------------------------------------------------
// Defterde binlerce satır var ve satır başına yapılan iş üç kalemde toplanıyor:
// `makeRng` (dizge hash'i), parti programı taraması ve ad üretimi. Üçü de
// deterministik ve az sayıda farklı sonuç veriyor — kültür başına bir mezhep,
// sınıf başına bir ideoloji karışımı, kare başına bir ad. Bellemeden önce tek
// tazeleme 340 ms sürüyordu (ölçüldü); sonuç değişmez, yalnız tekrar biter.
const confessionCache = new WeakMap(); // world → Map(cultureId → confession)
const politicsCache = new WeakMap();   // nation → { parties, byClass }

/**
 * Sayım defterinin mezhep hanesi. Oyunda henüz din sistemi YOK; bu tablo
 * yalnız ekranın hanesini doldurur ve kültürden deterministik atanır — tıpkı
 * `provinceName`in koordinattan ad üretmesi gibi. Bir kültürün mezhebi dünya
 * yeniden üretilmedikçe değişmez, dolayısıyla ekran tur başına oynamaz.
 */
export const CONFESSIONS = {
  orthodox: { id: 'orthodox', name: 'Orthodox', glyph: '✚' },
  reformed: { id: 'reformed', name: 'Reformed', glyph: '✜' },
  covenant: { id: 'covenant', name: 'Covenant', glyph: '✡' },
  crescent: { id: 'crescent', name: 'Crescent', glyph: '☾' },
  dharmic: { id: 'dharmic', name: 'Dharmic', glyph: '☸' },
  animist: { id: 'animist', name: 'Animist', glyph: '❂' },
};
const CONFESSION_IDS = Object.keys(CONFESSIONS);

/**
 * Kültürün mezhebi. Ana kültür çoğunlukla ülkenin resmî mezhebini paylaşır,
 * uzak kültürler ayrışır — sayım defterinde azınlık hanesi boş kalmasın.
 */
export function confessionOf(world, cultureId) {
  if (cultureId == null || cultureId < 0) return CONFESSIONS.animist;
  let byCulture = confessionCache.get(world);
  if (!byCulture) {
    byCulture = new Map();
    confessionCache.set(world, byCulture);
  }
  let confession = byCulture.get(cultureId);
  if (!confession) {
    confession = CONFESSIONS[makeRng(`${world.seed}-confession-${cultureId}`).pick(CONFESSION_IDS)];
    byCulture.set(cultureId, confession);
  }
  return confession;
}

/**
 * Okuryazarlık tahmini. Kaynağı gerçek üç sinyal: eğitim harcaması kaydıracı,
 * kohortun sınıfı ve karenin şehirleşmesi. Simüle edilen bir istatistik
 * DEĞİLDİR — eğitim bütçesinin defterde bir karşılığı olsun diye türetilir.
 */
/**
 * Sinifin ulusal okuryazarlik stoguna gore GORELI konumu. Aristokrasi her
 * zaman ortalamanin uzerinde, isci her zaman altindadir; egitim ORTALAMAYI
 * yukseltir, siniflar arasi mesafeyi degil.
 */
const CLASS_LITERACY_REL = { lower: 0.42, middle: 1.35, upper: 1.9 };

/**
 * Kohortun okuryazarligi. Artik ULUSAL STOKTAN turer (`economy.literacy`,
 * bkz. economy.js `advanceLiteracy`) — eskiden egitim yuzdesinden dogrudan
 * hesaplanan, hicbir sey biriktirmeyen saf bir formuldu.
 */
export function literacyOf(nation, cohort) {
  const stock = Number.isFinite(nation.economy?.literacy)
    ? nation.economy.literacy
    // Eski kayit / stok henuz kurulmadi: egitimden tek seferlik tahmin.
    : 0.08 + clamp(nation.economy?.social?.education ?? 0, 0, 100) / 100 * 0.62 * 0.35;
  const rel = CLASS_LITERACY_REL[cohort.classId] ?? 1;
  const urban = cohort.tile?.city ? 0.08 + cohort.tile.city.level * 0.02 : 0;
  return clamp(stock * rel + urban, 0, 0.99);
}

/**
 * Militanlık, 0–10. İki gerçek kohort ölçüsünden gelir: sepetinin karşılanmayan
 * kısmı ve işsizlik. Aç ve işsiz halk huzursuzdur; ikisi de doluysa sıfırdır.
 * Henüz hiçbir mekanik bunu okumaz, defterin hanesidir.
 */
export function militancyOf(cohort) {
  const hunger = 1 - clamp(cohort.needsFulfilled ?? 1, 0, 1);
  const idle = cohort.employed != null && cohort.size > 0
    ? clamp(cohort.unemployed / cohort.size, 0, 1) : 0;
  return clamp(hunger * 7 + idle * 3.5, 0, 10);
}

/** Bilinç, 0–10. Okuryazarlık ve şehir hayatının bileşkesi. */
export function consciousnessOf(nation, cohort) {
  const urban = cohort.tile?.city ? 0.25 + cohort.tile.city.level * 0.05 : 0;
  return clamp(literacyOf(nation, cohort) * 8 + urban * 4, 0, 10);
}

/**
 * Sayımın ham maddesi. Kohortlar BİR KEZ üretilir; ağaç da dağılımlar da aynı
 * deftere bakar. İkisi ayrı ayrı üretilince ekranda iki farklı nüfus çıkıyordu.
 */
export function censusSource(world, nation) {
  return nationCohorts(world, nation);
}

/**
 * Coğrafi tarayıcının ağacı: ülke → state → province.
 *
 * State'ler `constructionAtlas`tan gelir (oyunun tek state tanımı odur).
 * İşgal altındaki kare atlasa girmez ama halkı hâlâ senin halkındır: onlar
 * ayrı bir "Occupied Territory" hanesinde toplanır, yoksa sayımdan düşerler.
 *
 * Nüfus `province.population`dan DEĞİL kohortlardan sayılır. İkisi ulusal
 * toplamda birebir aynı, ama province düzeyinde ayrışır: meslek dağıtımı
 * kâtibi ve kapitalisti şehre yığar (bkz. population.js BASIS), o yüzden bir
 * şehir province'inin POP toplamı ham nüfusundan büyüktür. Tarayıcıda ham
 * nüfusu, toplam şeridinde kohort nüfusunu göstermek aynı kareye iki farklı
 * sayı yazmak olurdu.
 */
export function censusTree(world, nation, cohorts) {
  const atlas = constructionAtlas(world, nation.id);
  const pops = new Map();
  for (const cohort of cohorts) {
    const key = `p${cohort.provinceId}`;
    pops.set(key, (pops.get(key) ?? 0) + cohort.size);
  }
  const states = new Map();
  const stateOf = new Map();
  const seen = new Set();
  const push = (id, name, order, cluster) => {
    if (!states.has(id)) states.set(id, { id, name, order, provinces: [], population: 0 });
    const state = states.get(id);
    const key = provinceKey(cluster);
    seen.add(cluster.id);
    const population = pops.get(key) ?? 0;
    let city = null;
    for (const idx of cluster.tileIdx) {
      if (world.tiles[idx].city) {
        city = world.tiles[idx].city;
        break;
      }
    }
    state.provinces.push({
      key,
      province: cluster,
      tile: cluster.center,
      name: city ? `${city.name} Province` : cluster.name,
      population,
      city,
    });
    state.population += population;
    stateOf.set(key, id);
  };

  for (const region of atlas.regions) {
    for (const cluster of region.provinces) {
      push(region.id, region.name, region.index, cluster);
    }
  }
  // Atlasın dışında kalan (kısmen/tamamen işgal edilmiş) kendi kümelerimiz:
  // halkı hala senin halkındır, sayımdan düşmez.
  for (const cluster of world.provinces ?? []) {
    if (cluster.owner !== nation.id || !cluster.econ || seen.has(cluster.id)) continue;
    push('occupied', 'Occupied Territory', 9999, cluster);
  }

  const list = [...states.values()].sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name),
  );
  for (const state of list) state.provinces.sort((a, b) => b.population - a.population);
  return {
    name: nation.name,
    population: list.reduce((sum, state) => sum + state.population, 0),
    states: list,
    stateOf,
    keys: [...stateOf.keys()],
  };
}

const ISSUE_AXES = Object.keys(POLITICAL_POLICIES);

/**
 * Bir sınıfın ideoloji karışımı: sınıfın eğilimi, ülkede o ideolojinin partisi
 * varsa. Partisi olmayan ideoloji ağırlığı yeniden dağıtılır — yoksa pasta
 * %100 etmez ve dilimler sessizce küçülür.
 */
function buildIdeologyMix(parties, classId) {
  const table = CLASS_IDEOLOGY[classId] ?? CLASS_IDEOLOGY.lower;
  const present = new Set(parties.map((party) => party.ideology));
  const kept = Object.entries(table).filter(([id]) => present.size === 0 || present.has(id));
  const sum = kept.reduce((acc, [, weight]) => acc + weight, 0);
  return sum > 0 ? kept.map(([id, weight]) => [id, weight / sum]) : [];
}

/**
 * Sınıfın gündemi: ideolojisinin partisi hangi politikaları savunuyorsa onlar.
 * Üç eksen (ekonomi, ticaret, ordu) tek pastaya girer, her eksen eşit ağırlık
 * taşır. Yeni bir mekanik değil — sabit parti programlarının (politics.PARTIES)
 * nüfus tarafından okunuşu.
 */
function buildIssueMix(parties, ideology) {
  const present = new Set(parties.map((party) => party.ideology));
  const mix = new Map();
  for (const [id, weight] of ideology) {
    if (!present.has(id)) continue;
    for (const axis of ISSUE_AXES) {
      const option = PARTIES[id]?.policies?.[axis];
      if (!option) continue;
      mix.set(option, (mix.get(option) ?? 0) + weight / ISSUE_AXES.length);
    }
  }
  return [...mix];
}

/**
 * Sınıf başına siyaset. Üç sınıf var, kohort binlerce: sonuç sınıfa bağlıdır,
 * kohorta değil. Parti listesi değişirse (eski kayda siyaset eklenmesi) önbellek
 * kimlik değişiminden düşer.
 */
function classPolitics(nation, classId) {
  const parties = nation.politics?.parties ?? [];
  let entry = politicsCache.get(nation);
  if (!entry || entry.parties !== parties) {
    entry = { parties, byClass: new Map() };
    politicsCache.set(nation, entry);
  }
  let mix = entry.byClass.get(classId);
  if (!mix) {
    const ideology = buildIdeologyMix(parties, classId);
    const issues = buildIssueMix(parties, ideology);
    mix = {
      ideology,
      issues,
      // Tabloda kullanılan sıralı/adlandırılmış biçim de burada bir kez kurulur.
      display: {
        ideology: ideology.filter(([, weight]) => weight > 0)
          .sort((a, b) => b[1] - a[1])
          .map(([id, weight]) => ({ id, name: IDEOLOGIES[id]?.name ?? id, share: weight })),
        issues: [...issues].sort((a, b) => b[1] - a[1])
          .map(([id, weight]) => ({ id, name: issueName(id), share: weight })),
      },
    };
    entry.byClass.set(classId, mix);
  }
  return mix;
}

/**
 * Bir sınıfın siyasi karışımı. Nüfus ekranı da bunu okur (populationView):
 * ideoloji ve mesele ağırlıkları TEK yerde kurulur, ikinci bir kopya
 * zamanla sapardı.
 */
export function classPoliticsOf(nation, classId) {
  return classPolitics(nation, classId);
}

/** Politika seçeneğinin okunur adı; hangi eksende olduğunu aramaya gerek yok. */
export function issueName(id) {
  for (const axis of ISSUE_AXES) {
    const option = POLITICAL_POLICIES[axis][id];
    if (option) return option.name;
  }
  return id;
}
