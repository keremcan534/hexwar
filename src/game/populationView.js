// Nüfus ekranının VERİ KATMANI.
//
// Ekran hiçbir simülasyon formülünü yeniden kurmaz (bkz. VICTORIA_LITE
// değişmez #2). Nüfus ekranı okuryazarlığı, memnuniyeti, huzursuzluğu ya da
// "bu grup neden mutsuz" cümlesini kendi hesaplasaydı simülasyondan saparcadı;
// bütçede ölçülen sapma sınıfı tam olarak buydu.
//
// UYARI EŞİKLERİ TEK YERDE. Aynı uyarı üç yerde görünür (sol state gezgini,
// "Needs Attention" şeridi, tablodaki alarm sütunu) ve üçü de `ALERTS` +
// `alertsForState` / `alertsForGroup`tan gelir.
//
// Burası `game` katmanıdır: DOM'a dokunmaz, Node'da tek başına çalışır.

import { IDEOLOGIES } from './politics.js';
import { peopleMix } from './reforms.js';
import { acceptBlockers, brokenByCulture, cultureMix, unrestSummary } from './culture.js';
import { formatPopulation, populationOf, weightedNeedsMet } from './economy.js';
import {
  CONFESSIONS, censusSource, censusTree, classPoliticsOf, confessionOf,
  consciousnessOf, issueName, literacyOf, militancyOf,
} from './census.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/* ==========================================================================
   EŞİKLER — hepsi tek yerde
   ========================================================================== */

/** Bunun altındaki istihdam oranı işsizlik sorunudur. */
const EMPLOYMENT_FLOOR = 0.92;
/** Sepetinin bu kadarını alamayan halk yoksullaşıyordur. */
const NEEDS_FLOOR = 0.85;
/** Bu militanlığın üstü huzursuzluktur (0–10 ölçeği, bkz. census.militancyOf). */
const UNREST_CEILING = 3.5;
/** Bu okuryazarlığın altı geri kalmışlıktır. */
const LITERACY_FLOOR = 0.25;
/** Bir yılda bu kadar bile artmayan okuryazarlık duruyor demektir (puan). */
const LITERACY_STALL = 0.005;
/** Nüfusu bu oranda gerileyen bölge eriyordur. */
const DECLINE = -0.002;
/** Bu oranın üstünde büyüyen bölge hızlı büyüyordur. */
const FAST_GROWTH = 0.004;

const ALERTS = {
  FAMINE: { id: 'FAMINE', label: 'Famine', tone: 'bad', weight: 90 },
  LOW_NEEDS: { id: 'LOW_NEEDS', label: 'Needs Falling', tone: 'bad', weight: 70 },
  HIGH_UNEMPLOYMENT: { id: 'HIGH_UNEMPLOYMENT', label: 'High Unemployment', tone: 'bad', weight: 65 },
  RISING_UNREST: { id: 'RISING_UNREST', label: 'Radicalizing', tone: 'bad', weight: 60 },
  DECLINING_POPULATION: { id: 'DECLINING_POPULATION', label: 'Declining', tone: 'warn', weight: 50 },
  LOW_LITERACY: { id: 'LOW_LITERACY', label: 'Low Literacy', tone: 'warn', weight: 30 },
  GROWING_FAST: { id: 'GROWING_FAST', label: 'Growing Fast', tone: 'good', weight: 10 },
};

export const ALERT_IDS = Object.keys(ALERTS);

/* ==========================================================================
   YARDIMCILAR
   ========================================================================== */

/** Kohort kümesinin ağırlıklı ortalaması. Küçük kohort büyüğü ezmesin. */
function weighted(cohorts, valueOf) {
  let people = 0;
  let total = 0;
  for (const cohort of cohorts) {
    const size = Math.max(0, cohort.size ?? 0);
    if (size <= 0) continue;
    people += size;
    total += valueOf(cohort) * size;
  }
  return people > 0 ? total / people : null;
}

/** Yalnız istihdamı ANLAMLI olan kohortlar sayılır (bkz. cohortEmployment). */
function employmentOf(cohorts) {
  let employed = 0;
  let employable = 0;
  for (const cohort of cohorts) {
    if (cohort.employed == null) continue;
    employed += cohort.employed;
    employable += cohort.size;
  }
  return {
    rate: employable > 0 ? employed / employable : null,
    unemployed: Math.max(0, employable - employed),
    employable,
  };
}

/** Payları büyükten küçüğe, kuyruğu "Other"da toplayarak. */
function distribution(map, total, nameOf, keep = 5) {
  const rows = [...map.entries()]
    .map(([id, value]) => ({ id, name: nameOf(id), value, share: total > 0 ? value / total : 0 }))
    .sort((a, b) => b.value - a.value);
  if (rows.length <= keep + 1) return rows;
  const head = rows.slice(0, keep);
  const tail = rows.slice(keep);
  head.push({
    id: 'other',
    name: 'Other',
    value: tail.reduce((sum, row) => sum + row.value, 0),
    share: tail.reduce((sum, row) => sum + row.share, 0),
  });
  return head;
}

/* ==========================================================================
   UYARILAR
   ========================================================================== */

/**
 * Bir bölgenin (ya da ülkenin) uyarıları. Girdi ZATEN ÖLÇÜLMÜŞ değerlerdir;
 * burada yeni bir şey hesaplanmaz, yalnız eşikle karşılaştırılır.
 */
function alertsFor(stats) {
  const list = [];
  if (stats.needs != null && stats.needs < 0.5) list.push(ALERTS.FAMINE);
  else if (stats.needs != null && stats.needs < NEEDS_FLOOR) list.push(ALERTS.LOW_NEEDS);
  if (stats.employment != null && stats.employment < EMPLOYMENT_FLOOR) {
    list.push(ALERTS.HIGH_UNEMPLOYMENT);
  }
  if (stats.unrest != null && stats.unrest > UNREST_CEILING) list.push(ALERTS.RISING_UNREST);
  if (stats.growth != null && stats.growth < DECLINE) list.push(ALERTS.DECLINING_POPULATION);
  else if (stats.growth != null && stats.growth > FAST_GROWTH) list.push(ALERTS.GROWING_FAST);
  if (stats.literacy != null && stats.literacy < LITERACY_FLOOR) list.push(ALERTS.LOW_LITERACY);
  return list.sort((a, b) => b.weight - a.weight);
}

/* ==========================================================================
   EĞİLİM — kayıtlı haftalık izden
   ========================================================================== */

/**
 * 12 aylık iz. Kayıt yoksa BOŞ döner: uydurma bir eğri çizmektense grafiği hiç
 * göstermemek doğrudur (prompt: "do not fabricate trends").
 */
function trendOf(economy) {
  const history = economy?.popHistory ?? [];
  if (history.length < 2) return { samples: [], growth: null, literacyChange: null, needsChange: null };
  const first = history[0];
  const last = history[history.length - 1];
  const weeks = history.length - 1;
  // Haftalik bilesik degisimi AYLIK orana cevir (4.33 hafta = 1 ay).
  const rate = first.pop > 0 ? (last.pop / first.pop) ** (1 / weeks) - 1 : 0;
  return {
    samples: history.map((row) => row.pop),
    literacySamples: history.map((row) => row.lit),
    needsSamples: history.map((row) => row.needs),
    weeks,
    growth: rate * 4.33,
    monthlyPeople: last.pop * ((1 + rate) ** 4.33 - 1),
    literacyChange: last.lit - first.lit,
    needsChange: last.needs - first.needs,
  };
}

/* ==========================================================================
   ANA PROJEKSİYON
   ========================================================================== */

/**
 * EKRANIN OKUDUĞU TEK KAYNAK.
 *
 * @returns {object|null} `{ summary, alerts, tree, states, groups, distributions, trend, politics }`
 */
export function populationOverview(world, nation) {
  const economy = nation?.economy;
  if (!economy) return null;
  const cohorts = censusSource(world, nation);
  const tree = censusTree(world, nation, cohorts);
  const trend = trendOf(economy);

  const total = cohorts.reduce((sum, cohort) => sum + cohort.size, 0)
    || populationOf(world, nation);
  const employment = employmentOf(cohorts);
  const literacy = weighted(cohorts, (cohort) => literacyOf(nation, cohort)) ?? 0;
  const unrest = weighted(cohorts, militancyOf) ?? 0;
  const needs = weightedNeedsMet(economy);

  // Ulusun kultur bilesimi ve kabul durumu (bkz. culture.js). Nufus
  // dagilimindan AYRI tutulur: o kohortlardan, bu kume paylarindan gelir ve
  // "kimi vatandas sayiyoruz" sorusunun cevabi ikincisidir.
  const nationCultures = cultureMix(world, nation).map((row) => ({
    ...row,
    blockers: acceptBlockers(world, nation, row.id, world.turn ?? 0),
  }));

  // KIRIK KUMELER. Bastirilan ayaklanmanin biraktigi calismayan topraklar,
  // HALK HALK toplanir: karar kultur basinadir, kume basina degil. Ekran
  // kume nesnesi gormez — sayi ve engel listesi yeter.
  const brokenCultures = brokenByCulture(world, nation).map((row) => ({
    id: row.id,
    name: row.name,
    provinces: row.provinces.length,
    names: row.provinces.slice(0, 4).map((province) => province.name ?? `#${province.id}`),
    people: row.people,
    share: row.share,
    accept: row.accept,
    release: row.release,
    expel: row.expel,
  }));

  const summary = {
    total,
    unrestNation: unrestSummary(world, nation),
    growth: trend.growth,
    monthlyPeople: trend.monthlyPeople ?? null,
    employment: employment.rate,
    unemployed: employment.unemployed,
    needs,
    needsChange: trend.needsChange,
    literacy,
    literacyChange: trend.literacyChange,
    unrest,
    // 0-10 militanlik yuzdeye cevrilir: kart tek bir olcekte okunsun.
    unrestShare: clamp(unrest / 10, 0, 1),
  };

  // --- bölgeler: sol gezgin, STATES sekmesi ve uyarı şeridi aynı satırı okur -
  const byProvince = new Map();
  for (const cohort of cohorts) {
    if (!byProvince.has(cohort.provinceId)) byProvince.set(cohort.provinceId, []);
    byProvince.get(cohort.provinceId).push(cohort);
  }
  const states = tree.states.map((state) => {
    const list = state.provinces.flatMap((entry) => byProvince.get(entry.province.id) ?? []);
    const stateEmployment = employmentOf(list);
    const stats = {
      population: list.reduce((sum, cohort) => sum + cohort.size, 0),
      employment: stateEmployment.rate,
      unemployed: stateEmployment.unemployed,
      needs: weighted(list, (cohort) => clamp(cohort.needsFulfilled ?? 1, 0, 1)),
      literacy: weighted(list, (cohort) => literacyOf(nation, cohort)),
      unrest: weighted(list, militancyOf),
      // Bölge bazlı büyüme ölçülmüyor (iz yalnız ulusal): uydurmak yerine null.
      growth: null,
    };
    const alerts = alertsFor(stats);
    return {
      id: state.id,
      name: state.name,
      ...stats,
      alerts,
      alert: alerts[0] ?? null,
      provinces: state.provinces.map((entry) => ({
        key: entry.key,
        id: entry.province.id,
        name: entry.name,
        population: entry.population,
        city: entry.city ? entry.city.name : null,
      })),
    };
  }).sort((a, b) => b.population - a.population);

  // --- gruplar: kültür × meslek. Tablo bu satırları basar ------------------
  const groupMap = new Map();
  for (const cohort of cohorts) {
    const key = `${cohort.culture}:${cohort.professionId}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        id: key,
        culture: cohort.culture,
        cultureName: world.cultures?.[cohort.culture]?.name ?? 'Stateless',
        professionId: cohort.professionId,
        professionName: cohort.professionName,
        classId: cohort.classId,
        className: cohort.className,
        cohorts: [],
      });
    }
    groupMap.get(key).cohorts.push(cohort);
  }
  const groups = [...groupMap.values()].map((group) => {
    const list = group.cohorts;
    const size = list.reduce((sum, cohort) => sum + cohort.size, 0);
    const groupEmployment = employmentOf(list);
    // Nerede oturuyor: en kalabalık bölge adıyla anılır, "Multiple" değil.
    const places = new Map();
    for (const cohort of list) {
      places.set(cohort.provinceName, (places.get(cohort.provinceName) ?? 0) + cohort.size);
    }
    const ranked = [...places.entries()].sort((a, b) => b[1] - a[1]);
    const stats = {
      size,
      share: total > 0 ? size / total : 0,
      employment: groupEmployment.rate,
      unemployed: groupEmployment.unemployed,
      needs: weighted(list, (cohort) => clamp(cohort.needsFulfilled ?? 1, 0, 1)),
      literacy: weighted(list, (cohort) => literacyOf(nation, cohort)),
      unrest: weighted(list, militancyOf),
      consciousness: weighted(list, (cohort) => consciousnessOf(nation, cohort)),
      income: list.reduce((sum, cohort) => sum + (cohort.income ?? 0), 0),
      taxPaid: list.reduce((sum, cohort) => sum + (cohort.taxPaid ?? 0), 0),
      growth: null,
    };
    const alerts = alertsFor(stats);
    return {
      id: group.id,
      cultureId: group.culture,
      culture: group.cultureName,
      profession: group.professionName,
      classId: group.classId,
      className: group.className,
      confession: confessionOf(world, group.culture),
      home: ranked[0]?.[0] ?? '—',
      places: ranked.slice(0, 3).map(([name, people]) => ({
        name, people, share: size > 0 ? people / size : 0,
      })),
      stateIds: [...new Set(list.map((cohort) => cohort.provinceId))],
      ...stats,
      alerts,
      alert: alerts[0] ?? null,
      leaning: leaningOf(nation, group.classId),
    };
  }).sort((a, b) => b.size - a.size);

  // --- dağılımlar: sınıf, kültür, din, ideoloji ---------------------------
  const bucket = (keyOf, valueOf = (cohort) => cohort.size) => {
    const map = new Map();
    for (const cohort of cohorts) {
      const key = keyOf(cohort);
      if (key == null) continue;
      map.set(key, (map.get(key) ?? 0) + valueOf(cohort));
    }
    return map;
  };
  const professionMap = bucket((cohort) => cohort.professionId);
  const classMap = bucket((cohort) => cohort.classId);
  const cultureMap = bucket((cohort) => cohort.culture);
  const religionMap = bucket((cohort) => confessionOf(world, cohort.culture).id);

  const professionNames = new Map(cohorts.map((c) => [c.professionId, c.professionName]));
  const classNames = new Map(cohorts.map((c) => [c.classId, c.className]));

  const parties = [...(nation.politics?.parties ?? [])].sort((a, b) => b.support - a.support);
  // Halkin ideolojisi parti OYUNDAN degil sinif karisimindan okunur: oy hakki
  // darken parti destegi secmen kutugunu yansitir, halki degil (Open Beta 4
  // politika kesfi: cark %100 muhafazakar gorunuyordu, halk oyle degildi).
  const ideologyMap = new Map();
  for (const slice of peopleMix(nation)) {
    ideologyMap.set(slice.id, slice.share * total);
  }

  return {
    summary,
    // Ülke çapındaki uyarılar: şeridi bunlar doldurur.
    alerts: alertsFor({ ...summary, growth: trend.growth }),
    nationCultures,
    brokenCultures,
    states,
    groups,
    trend,
    distributions: {
      professions: distribution(professionMap, total,
        (id) => professionNames.get(id) ?? id, 6),
      classes: distribution(classMap, total, (id) => classNames.get(id) ?? id, 5),
      cultures: distribution(cultureMap, total,
        (id) => world.cultures?.[id]?.name ?? 'Stateless', 5),
      religions: distribution(religionMap, total,
        (id) => CONFESSIONS[id]?.name ?? id, 5),
      ideologies: distribution(ideologyMap, total,
        (id) => IDEOLOGIES[id]?.name ?? id, 6),
    },
    politics: {
      parties: parties.map((party) => ({
        id: party.id,
        name: party.name,
        ideology: party.ideology,
        ideologyName: IDEOLOGIES[party.ideology]?.name ?? party.ideology,
        color: IDEOLOGIES[party.ideology]?.color ?? null,
        support: party.support,
        ruling: party.id === nation.politics?.rulingPartyId,
      })),
      issues: topIssues(nation, cohorts, total),
    },
  };
}

/** Sınıfın baskın ideolojisi — `census.classPoliticsOf` zaten sıralı verir. */
function leaningOf(nation, classId) {
  const mix = classPoliticsOf(nation, classId).display.ideology;
  if (!mix.length) return '—';
  // İki baskın eğilim arasında gerçek bir yarış varsa ikisini de söyle:
  // "Conservative" yerine "Conservative → Socialist" daha çok şey anlatır.
  const [first, second] = mix;
  return second && second.share > first.share * 0.6
    ? `${first.name} → ${second.name}`
    : first.name;
}

/** Ülkenin en çok konuşulan meseleleri. Ağırlıklar sınıf karışımından gelir. */
function topIssues(nation, cohorts, total) {
  const map = new Map();
  for (const cohort of cohorts) {
    for (const [id, weight] of classPoliticsOf(nation, cohort.classId).issues) {
      map.set(id, (map.get(id) ?? 0) + weight * cohort.size);
    }
  }
  return distribution(map, total, issueName, 4);
}

/**
 * Seçili grubun dosyası: sağ paneldeki ayrıntı.
 * Sorunlar UYDURULMAZ — hepsi ölçülmüş alanlardan türer.
 */
export function populationGroupDetail(view, groupId) {
  const group = view?.groups.find((row) => row.id === groupId);
  if (!group) return null;
  const issues = [];
  if (group.needs != null && group.needs < NEEDS_FLOOR) {
    issues.push(`Only ${Math.round(group.needs * 100)}% of their basket is met`);
  }
  if (group.employment != null && group.employment < EMPLOYMENT_FLOOR) {
    issues.push(`${formatPopulation(group.unemployed)} of them cannot find work`);
  }
  if (group.unrest > UNREST_CEILING) {
    issues.push('Discontent is turning into agitation');
  }
  if (group.literacy != null && group.literacy < LITERACY_FLOOR) {
    issues.push('Most of them cannot read');
  }
  return { ...group, issues };
}
