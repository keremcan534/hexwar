// KÜLTÜR POLİTİKALARI — sürgün zinciri (TASARIM.md §10; Kerem 2026-10-12).
//
// Eski sürgün (culture.expelCulture) halkı bütün topraklarımızdan siliyordu:
// nüfus hiçbir yere gitmiyor, tamamen o halktan oluşan province 0 kişiyle
// kalıyor ve büyüme `nüfus × (1 + oran)` olduğu için sonsuza dek 0 kalıyordu.
// Zincir dört seçenektir ve hiçbiri insanı yok etmez:
//
//   SÜRGÜN (deport)      halk soydaş devlete, yoksa en çok sınır paylaştığımız
//                        komşuya gider; nüfus oraya eklenir. Şöhret bedeli.
//   TOPLAMA (concentrate) halk tek bir state'e toplanır (rezervasyon): öteki
//                        state'ler temizlenir, orada huzursuzluk ve ayrılıkçılık
//                        tavan yapar. Şöhret yarısı.
//   İSKÂN (resettle)     boşalan province'lere kendi halkımızdan göçmen gelir:
//                        altın peşin, göç iki yıl sürer, göçmeni veren
//                        province'ler o kadar azalır.
//   ZORLA ASİMİLASYON    yeni doğanlar bizden sayılır: o halkın erimesi
//                        hızlanır (ana yurt kilidini de aşar); onların
//                        yaşadığı her yerde huzursuzluk, ilanında şöhret.
//
// Toptan yok etme bilinçli olarak yoktur. Sürgün ve toplama eski sürgünün
// kapısından geçer (kırık province ya da yaşayan ulusal hareket): ucuz bir
// "azınlık temizliği" düğmesi değil, krizin pahalı çıkışıdır.

import {
  CULTURE, brokenProvinces, isAccepted, movementProvinces,
} from './culture.js';
import { addInfamy } from './infamy.js';
import { TIER, announce } from './chronicle.js';
import { canSpend, spend } from './econ/investment.js';
import { POP_UNIT } from './econ/defs.js';
import { formatPopulation } from './economy.js';
import { money } from './money.js';
import { lawIndex } from './laws.js';
import { controllerOf } from './control.js';
import { deed } from './relations.js';
import {
  CAMP, CAMP_REGIMES, DEFAULT_REGIME, FUSION,
} from './policyDefs.js';

// Rezervasyon ve zorla asimilasyonun huzursuzluk/erime sabitleri
// culture.CULTURE'dadır (RESERVATION_UNREST, FORCED_UNREST, FORCED_RATE):
// onları culture.js okur.
export const POLICY = {
  /** Zorla asimilasyon ilanının şöhreti. */
  FORCED_INFAMY: 5,
  /** İskân boşalan province'i eski nüfusunun bu payına dek doldurur. */
  SETTLE_TARGET: 0.6,
  /** Göçün süresi (hafta). */
  SETTLE_WEEKS: 104,
  /** Nüfus birimi (100 bin) göçmen başına peşin bedel (IC, kalkınma fonundan). */
  SETTLE_COST: 9,
  /** Bir donör province haftada en çok nüfusunun bu payını verir. */
  SETTLE_DONOR_CAP: 0.003,
  /**
   * Sürgünde bir varış devleti en çok kendi nüfusu kadar insan alır; kalan
   * sıradaki varışa akar. Tavansız ilk koşuda 10 milyon insan 267 binlik
   * soydaş devlete yığıldı (nüfusu 40 katına çıktı).
   */
  DEPORT_CAP: 1,
  /** Bu kadar boşalmış province iskân adayıdır (eski nüfusun payı). */
  EMPTIED_BELOW: 0.5,
};

const unitOf = (people) => people / POP_UNIT;

function peopleIn(province, cultureId) {
  const row = province.cultures?.find((item) => item.id === cultureId);
  return row ? Math.round((province.econ?.population ?? 0) * row.share) : 0;
}

function ownProvinces(world, nation) {
  return (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ);
}

/** Province'ten bir halkın payını çıkarır; kalanlar yeniden 1'e toplanır. */
function removeCulture(world, nation, province, cultureId) {
  const gone = peopleIn(province, cultureId);
  if (!gone) return 0;
  const before = province.econ.population ?? 0;
  province.econ.population = Math.max(0, before - gone);
  const rest = province.cultures.filter((item) => item.id !== cultureId);
  if (!rest.length) province.cultures = [{ id: nation.culture, share: 1 }];
  else {
    const total = rest.reduce((sum, item) => sum + item.share, 0);
    province.cultures = rest.map((item) => ({ id: item.id, share: item.share / total }));
  }
  // Boşalma kaydı: iskân bunu okur (eski nüfusun en büyüğü tutulur).
  province.econ.emptiedFrom = Math.max(province.econ.emptiedFrom ?? 0, before);
  if (province.homeland === cultureId) province.homeland = -1;
  if (province.econ.brokenCulture === cultureId) {
    province.econ.brokenSince = null;
    province.econ.brokenCulture = null;
    province.econ.unrest = Math.min(province.econ.unrest ?? 0, CULTURE.AFTER_REVOLT_UNREST);
  }
  return gone;
}

/** Province'e bir halktan nüfus ekler (payı birleştirerek). */
export function addCulture(province, cultureId, people) {
  if (!(people > 0)) return;
  const before = Math.max(0, province.econ.population ?? 0);
  const after = before + people;
  const rows = (province.cultures ?? []).map((item) => ({ id: item.id, share: item.share * before / after }));
  const row = rows.find((item) => item.id === cultureId);
  if (row) row.share += people / after;
  else rows.push({ id: cultureId, share: people / after });
  province.cultures = rows;
  province.econ.population = Math.round(after);
}

/** Çoğunluk değiştiyse kareleri yeniden boyar; boyanacak kareleri döndürür. */
export function settleMajority(world, province) {
  province.cultures.sort((a, b) => b.share - a.share || a.id - b.id);
  const before = province.culture;
  province.culture = province.cultures[0]?.id ?? before;
  if (province.culture === before) return [];
  const tiles = [];
  for (const idx of province.tileIdx ?? []) {
    world.tiles[idx].culture = province.culture;
    tiles.push(world.tiles[idx]);
  }
  return tiles;
}

/** Sürgün ve toplama: hareketin en az bu ilerlemesi (Agitation). */
const CRISIS_PROGRESS = 25;

/** Sürgün ve toplamanın ortak kapısı: kırık province ya da ilerlemiş hareket. */
function crisisBlockers(world, nation, cultureId) {
  if (cultureId === nation.culture) return ['They are our own people.'];
  if (isAccepted(nation, cultureId)) return ['They are an accepted culture of this state.'];
  // Hareketin var olması yetmez (her azınlığın "Grievances %0" hareketi
  // vardır, 1900'ün ilk haftasında dört halk sürülebiliyordu): en az
  // Agitation (%25) ya da kırık province.
  const progress = nation.movements?.[cultureId]?.progress ?? 0;
  if (!brokenProvinces(world, nation, cultureId).length
    && !(progress >= CRISIS_PROGRESS && movementProvinces(world, nation, cultureId).length)) {
    return [`Only a people in revolt, or whose movement has reached Agitation (${CRISIS_PROGRESS}%), can be driven out or confined.`];
  }
  return [];
}

// ---------------------------------------------------------------- SÜRGÜN ---

/**
 * Sürgünün varışları, sırayla: soydaş devletler (kara komşusu olan önce),
 * sonra onların yaşadığı province'lere en çok komşu olan yabancı devletler.
 */
export function deportDestinations(world, nation, cultureId) {
  const kin = world.nations.filter((other) => other.alive && other.id !== nation.id && other.culture === cultureId)
    .sort((a, b) => (world.contacts?.[nation.id]?.[b.id] > 0) - (world.contacts?.[nation.id]?.[a.id] > 0) || a.id - b.id)
    .map((other) => other.id);
  const votes = new Map();
  for (const province of ownProvinces(world, nation)) {
    const people = peopleIn(province, cultureId);
    if (!people) continue;
    for (const neighborId of province.neighbors ?? []) {
      const neighbor = world.provinces?.[neighborId];
      if (!neighbor || neighbor.owner < 0 || neighbor.owner === nation.id) continue;
      if (!world.nations[neighbor.owner]?.alive || kin.includes(neighbor.owner)) continue;
      votes.set(neighbor.owner, (votes.get(neighbor.owner) ?? 0) + people);
    }
  }
  const neighbors = [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
  return [...kin, ...neighbors];
}

/** İlk varış (ekran ve engel bunu söyler). */
export function deportDestination(world, nation, cultureId) {
  return deportDestinations(world, nation, cultureId)[0] ?? -1;
}

export function deportBlockers(world, nation, cultureId) {
  const out = crisisBlockers(world, nation, cultureId);
  if (!out.length && deportDestination(world, nation, cultureId) < 0) {
    out.push('No state will take them: no kin state and no foreign neighbour.');
  }
  return out;
}

/** Sürgünün bedeli: eski sürgünle aynı ölçü (insan sayısı, en az 8). */
export function deportInfamy(people) {
  return Math.max(CULTURE.EXPEL_INFAMY_MIN, people / CULTURE.EXPEL_INFAMY_PER_POP);
}

/**
 * SÜRGÜN. Halk topraklarımızdan çıkar ve varış devletine yerleşir: önce bize
 * komşu province'lerine, yoksa bütün province'lerine, nüfuslarıyla orantılı.
 * @returns {{people:number, destination:number, emptied:number, tiles:object[]}|null}
 */
export function deportPeople(world, nation, cultureId) {
  if (deportBlockers(world, nation, cultureId).length) return null;
  const destinations = deportDestinations(world, nation, cultureId);
  const destination = destinations[0];
  let people = 0;
  let emptied = 0;
  const tiles = [];
  const source = ownProvinces(world, nation);
  for (const province of source) {
    const gone = removeCulture(world, nation, province, cultureId);
    if (!gone) continue;
    people += gone;
    if ((province.econ.population ?? 0) < (province.econ.emptiedFrom ?? 0) * POLICY.EMPTIED_BELOW) emptied++;
    tiles.push(...settleMajority(world, province));
  }
  if (!people) return null;
  // Varış başına tavan (DEPORT_CAP × kendi nüfusu); hepsi dolarsa kalan
  // varışların nüfusuyla orantılı paylaşılır.
  const hosts = destinations.map((id) => {
    const theirs = (world.provinces ?? []).filter((p) => p.owner === id && p.econ);
    return { id, theirs, pop: theirs.reduce((sum, p) => sum + (p.econ.population ?? 0), 0), take: 0 };
  });
  let left = people;
  for (const host of hosts) {
    const take = Math.min(left, Math.floor(host.pop * POLICY.DEPORT_CAP));
    host.take += take;
    left -= take;
  }
  if (left > 0) {
    const total = hosts.reduce((sum, host) => sum + Math.max(1, host.pop), 0);
    for (const host of hosts) host.take += Math.round(left * Math.max(1, host.pop) / total);
  }
  const received = [];
  for (const host of hosts) {
    if (host.take <= 0) continue;
    const border = host.theirs.filter((p) => (p.neighbors ?? []).some((id) => world.provinces?.[id]?.owner === nation.id));
    const targets = border.length ? border : host.theirs;
    const weight = targets.reduce((sum, p) => sum + Math.max(1, p.econ.population ?? 0), 0);
    for (const province of targets) {
      addCulture(province, cultureId, Math.round(host.take * Math.max(1, province.econ.population ?? 0) / weight));
      tiles.push(...settleMajority(world, province));
    }
    received.push({ nation: host.id, people: host.take });
  }
  addInfamy(nation, deportInfamy(people));
  world.cultureExpulsions = (world.cultureExpulsions ?? 0) + 1;
  return { people, destination, received, emptied, tiles };
}

// --------------------------------------------------------------- TOPLAMA ---

/** Rezervasyon için önerilen state: o halkın en kalabalık olduğu. */
export function reservationFor(world, nation, cultureId) {
  let best = null;
  for (const province of ownProvinces(world, nation)) {
    const people = peopleIn(province, cultureId);
    if (people > 0 && (!best || people > best.people || (people === best.people && province.id < best.id))) {
      best = { id: province.id, people };
    }
  }
  return best ? world.provinces[best.id] : null;
}

export function concentrateBlockers(world, nation, cultureId) {
  const out = crisisBlockers(world, nation, cultureId);
  if (!out.length) {
    const target = reservationFor(world, nation, cultureId);
    if (!target) out.push('They live nowhere in our lands.');
    else if (ownProvinces(world, nation).filter((p) => peopleIn(p, cultureId) > 0).length < 2) {
      out.push(`They already live in a single state (${target.name}).`);
    }
  }
  return out;
}

/**
 * TOPLAMA. Halk bütün state'lerimizden tek bir state'e taşınır. O state
 * rezervasyondur: huzursuzluk hedefi +3 (bkz. culture.unrestBreakdown) —
 * ulusal hareket orada beslenir. Öteki state'ler temizlenir.
 */
export function concentratePeople(world, nation, cultureId) {
  if (concentrateBlockers(world, nation, cultureId).length) return null;
  const target = reservationFor(world, nation, cultureId);
  let people = 0;
  let emptied = 0;
  const tiles = [];
  for (const province of ownProvinces(world, nation)) {
    if (province === target) continue;
    const moved = removeCulture(world, nation, province, cultureId);
    if (!moved) continue;
    people += moved;
    if ((province.econ.population ?? 0) < (province.econ.emptiedFrom ?? 0) * POLICY.EMPTIED_BELOW) emptied++;
    tiles.push(...settleMajority(world, province));
  }
  if (!people) return null;
  addCulture(target, cultureId, people);
  tiles.push(...settleMajority(world, target));
  target.econ.reservation = cultureId;
  addInfamy(nation, deportInfamy(people) / 2);
  return { people, target: target.id, emptied, tiles };
}

// ----------------------------------------------------------------- İSKÂN ---

/** Boşalmış province'ler: eski nüfusunun yarısının altına inmiş olanlar. */
export function emptiedProvinces(world, nation) {
  return ownProvinces(world, nation).filter((p) => (p.econ.emptiedFrom ?? 0) > 0
    && (p.econ.population ?? 0) < p.econ.emptiedFrom * POLICY.EMPTIED_BELOW);
}

/** Göçmen verebilecek province'ler: ana kültürün çoğunlukta olduğu, boşalmamış. */
function donorsOf(world, nation, exclude = new Set()) {
  return ownProvinces(world, nation)
    .filter((p) => p.culture === nation.culture && !(p.econ.emptiedFrom > 0) && !exclude.has(p.id))
    .sort((a, b) => (b.econ.population ?? 0) - (a.econ.population ?? 0) || a.id - b.id);
}

/**
 * İskân planı: kaç göçmen, ne kadar altın. Göçmen sayısı donörlerin iki
 * yılda verebileceğiyle sınırlıdır: plan gelmeyecek insanı vaat etmez.
 * Ekran ve eylem aynı sayıyı okur.
 */
export function resettlementPlan(world, nation) {
  let targets = emptiedProvinces(world, nation).map((province) => ({
    id: province.id,
    need: Math.max(0, Math.round(province.econ.emptiedFrom * POLICY.SETTLE_TARGET - (province.econ.population ?? 0))),
  })).filter((row) => row.need > 0);
  const need = targets.reduce((sum, row) => sum + row.need, 0);
  const exclude = new Set(targets.map((row) => row.id));
  const capacity = donorsOf(world, nation, exclude).reduce((sum, p) => {
    const ours = (p.econ.population ?? 0) * (p.cultures?.find((row) => row.id === nation.culture)?.share ?? 0);
    return sum + Math.floor(ours * POLICY.SETTLE_DONOR_CAP) * POLICY.SETTLE_WEEKS;
  }, 0);
  const scale = need > 0 ? Math.min(1, capacity / need) : 0;
  targets = targets.map((row) => ({ id: row.id, need: Math.floor(row.need * scale) })).filter((row) => row.need > 0);
  const people = targets.reduce((sum, row) => sum + row.need, 0);
  return { targets, people, need, cost: Math.ceil(unitOf(people) * POLICY.SETTLE_COST) };
}

export function resettleBlockers(world, nation) {
  if (nation.resettlement?.targets?.length) return ['Settlers are already on their way.'];
  const plan = resettlementPlan(world, nation);
  if (!plan.people) return ['No province of ours stands empty.'];
  if (!canSpend(nation, plan.cost)) return [`The development fund cannot cover ${money(plan.cost, 0)} for the settlers.`];
  return [];
}

/** İskânı başlatır: bedel fondan peşin, göç SETTLE_WEEKS boyunca haftalık. */
export function startResettlement(world, nation) {
  if (resettleBlockers(world, nation).length) return null;
  const plan = resettlementPlan(world, nation);
  spend(nation, plan.cost);
  nation.resettlement = {
    targets: plan.targets.map((row) => ({ id: row.id, left: row.need })),
    weeks: POLICY.SETTLE_WEEKS,
  };
  return plan;
}

/**
 * Haftalık göç (turn.js, province fazından sonra). Göçmen kendi halkımızdandır
 * ve ana kültürümüzün çoğunlukta olduğu, boşalmamış province'lerden, en
 * kalabalıktan başlayarak gelir; donör başına haftalık tavan vardır.
 * @returns {object[]} çoğunluğu değişen karelerin listesi
 */
export function runResettlement(world, nation) {
  const plan = nation.resettlement;
  if (!plan?.targets?.length || !nation.alive) return [];
  const tiles = [];
  const live = plan.targets.filter((row) => row.left > 0 && world.provinces?.[row.id]?.owner === nation.id);
  if (!live.length || plan.weeks <= 0) {
    nation.resettlement = null;
    return tiles;
  }
  const weekly = live.reduce((sum, row) => sum + Math.ceil(row.left / Math.max(1, plan.weeks)), 0);
  const donors = donorsOf(world, nation, new Set(live.map((row) => row.id)));
  let pool = 0;
  for (const donor of donors) {
    if (pool >= weekly) break;
    const give = Math.min(weekly - pool, Math.floor((donor.econ.population ?? 0) * POLICY.SETTLE_DONOR_CAP));
    if (give <= 0) continue;
    const share = donor.cultures?.find((row) => row.id === nation.culture)?.share ?? 0;
    // Donörden yalnız bizim halkımız göçer: payları yeniden toplanır.
    const ours = Math.round((donor.econ.population ?? 0) * share);
    const taken = Math.min(give, ours);
    if (taken <= 0) continue;
    const before = donor.econ.population;
    donor.econ.population = before - taken;
    donor.cultures = donor.cultures.map((row) => ({
      id: row.id,
      share: (row.share * before - (row.id === nation.culture ? taken : 0)) / donor.econ.population,
    })).filter((row) => row.share > 1e-6);
    pool += taken;
  }
  for (const row of live) {
    const province = world.provinces[row.id];
    const arrive = Math.min(row.left, Math.round(pool * Math.ceil(row.left / Math.max(1, plan.weeks)) / Math.max(1, weekly)));
    if (arrive <= 0) continue;
    addCulture(province, nation.culture, arrive);
    row.left -= arrive;
    tiles.push(...settleMajority(world, province));
    // Doldukça boşalma kaydı silinir: province yeniden olağan bir yerdir.
    if ((province.econ.population ?? 0) >= province.econ.emptiedFrom * POLICY.SETTLE_TARGET) {
      province.econ.emptiedFrom = 0;
      row.left = 0;
    }
  }
  plan.weeks--;
  return tiles;
}

// ---------------------------------------------------- ZORLA ASİMİLASYON ---

export function forcedAssimilation(nation, cultureId) {
  return Boolean(nation?.forcedAssimilation?.includes(cultureId));
}

export function forceBlockers(world, nation, cultureId) {
  if (cultureId === nation.culture) return ['They are our own people.'];
  if (isAccepted(nation, cultureId)) return ['They are an accepted culture: their children are already ours.'];
  if (!ownProvinces(world, nation).some((p) => peopleIn(p, cultureId) > 0)) return ['They live nowhere in our lands.'];
  return [];
}

/**
 * Zorla asimilasyonu açar ya da kapatır. Açmak şöhrettir; kapatmak bedavadır
 * (eriyen eriyendir, geri dönmez). culture.assimilate ve unrestBreakdown okur.
 */
export function setForcedAssimilation(world, nation, cultureId, on) {
  const list = nation.forcedAssimilation ?? [];
  if (on) {
    if (list.includes(cultureId) || forceBlockers(world, nation, cultureId).length) return false;
    nation.forcedAssimilation = [...list, cultureId].sort((a, b) => a - b);
    addInfamy(nation, POLICY.FORCED_INFAMY);
    return true;
  }
  if (!list.includes(cultureId)) return false;
  nation.forcedAssimilation = list.filter((id) => id !== cultureId);
  return true;
}

// ---------------------------------------------------------- CEZA KAMPLARI ---
//
// Toplamanın (rezervasyon) devlet eliyle işletilen hâli (TASARIM §18). Kamp bir
// STATE'tir ve rejim ulusun tek kararıdır: kamp kamp ayar yoktur. Oraya hangi
// halkların gönderileceği de halk başına tek kutudur. Amaç emek ve askerdir;
// ölüm oranı rejimin bedelidir, başlı başına bir seçenek değildir: "toptan yok
// etme bilinçli olarak yoktur" kuralı burada da geçerlidir.

const plansOf = (nation) => (nation.policies ??= {});

export function campRegimeOf(nation) {
  return CAMP_REGIMES[nation?.policies?.campRegime] ?? CAMP_REGIMES[DEFAULT_REGIME];
}

/** Ulusun kamp state'leri (kimlik sırasıyla). */
export function campsOf(world, nation) {
  return ownProvinces(world, nation).filter((province) => province.econ.camp === nation.id);
}

/** Kamp tavanı: 1 + her 12 state için bir, en çok 3. */
export function campCap(world, nation) {
  return Math.min(CAMP.MAX, 1 + Math.floor(ownProvinces(world, nation).length / CAMP.PER_STATES));
}

/** Kampın halk satırları: kamp state'inde hakkı olmayan herkes mahkûmdur. */
function inmateRows(province, nation) {
  return (province.cultures ?? []).filter((row) => !isAccepted(nation, row.id));
}

/** Kampın mahkûm sayısı. */
export function inmatesOf(province, nation) {
  return inmateRows(province, nation)
    .reduce((sum, row) => sum + Math.round((province.econ.population ?? 0) * row.share), 0);
}

export function campBlockers(world, nation, province) {
  if (province?.owner !== nation.id || !province.econ) return ['Not one of our states.'];
  if (province.econ.camp === nation.id) return ['Already a penal state.'];
  const out = [];
  if (nation.capital?.provinceId === province.id) out.push('The capital cannot be a penal state.');
  if (province.homeland === nation.culture) out.push('This is the homeland of our own people.');
  if (province.tileIdx?.some((idx) => controllerOf(world.tiles[idx]) !== nation.id)) out.push('The state is under occupation.');
  if (lawIndex(nation, 'citizenship') >= 2) out.push('Full Citizenship forbids it: the law treats every people alike.');
  if (campsOf(world, nation).length >= campCap(world, nation)) out.push(`We hold as many penal states as we can run (${campCap(world, nation)}).`);
  if ((nation.power ?? 0) < CAMP.POWER) out.push(`Needs ${CAMP.POWER} political power.`);
  return out;
}

/** Bir state'i ceza kampına çevirir. Bedeli SG ve şöhret, sonrası haftalık. */
export function openCamp(game, nation, provinceId) {
  const province = game.world.provinces?.[provinceId];
  if (campBlockers(game.world, nation, province).length) return false;
  nation.power -= CAMP.POWER;
  addInfamy(nation, CAMP.OPEN_INFAMY);
  province.econ.camp = nation.id;
  plansOf(nation).campCount = campsOf(game.world, nation).length;
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `camp-${provinceId}`,
      title: `${stateName(province)} becomes a penal state`,
      detail: 'Choose which peoples are sent there. The world is already watching.',
    });
  }
  game.emit?.('provinces', null);
  return true;
}

/** Kampı kapatır: mahkûmlar olduğu yerde serbest kalır. Bedeli yoktur. */
export function closeCamp(game, nation, provinceId) {
  const province = game.world.provinces?.[provinceId];
  if (province?.econ?.camp !== nation.id) return false;
  clearCamp(province);
  plansOf(nation).campCount = campsOf(game.world, nation).length;
  game.emit?.('provinces', null);
  return true;
}

function clearCamp(province) {
  delete province.econ.camp;
  delete province.econ.campWorkers;
}

function stateName(province) {
  return province?.name ?? `State ${province?.id ?? '?'}`;
}

/**
 * Bir halkı kampa göndermenin kapısı. Sürgün gibi kriz ister: hareketi
 * ilerlemiş halk, savaş hâli ya da hak tanımayan Residency yasası. Sakin bir
 * barışta ucuz bir azınlık düğmesi olmasın.
 */
export function intakeBlockers(world, nation, cultureId) {
  if (cultureId === nation.culture) return ['They are our own people.'];
  if (isAccepted(nation, cultureId)) return ['They are citizens: the law protects them.'];
  const out = [];
  if (!campsOf(world, nation).length) out.push('We hold no penal state.');
  if (!ownProvinces(world, nation).some((p) => peopleIn(p, cultureId) > 0)) out.push('They live nowhere in our lands.');
  const progress = nation.movements?.[cultureId]?.progress ?? 0;
  const crisis = progress >= CAMP.CRISIS_PROGRESS || brokenProvinces(world, nation, cultureId).length > 0;
  if (!crisis && lawIndex(nation, 'citizenship') !== 0 && !((nation.economy?.warFronts ?? 0) > 0)) {
    out.push(`Needs war, the Residency law, or a movement at Agitation (${CAMP.CRISIS_PROGRESS}%).`);
  }
  return out;
}

/** Halkın kutusunu çevirir. Açmak şöhrettir; kapatmak sevkiyatı durdurur. */
export function setCampIntake(world, nation, cultureId, on) {
  const plans = plansOf(nation);
  const list = plans.intake ?? [];
  if (on) {
    if (list.includes(cultureId) || intakeBlockers(world, nation, cultureId).length) return false;
    plans.intake = [...list, cultureId].sort((a, b) => a - b);
    addInfamy(nation, CAMP.INTAKE_INFAMY);
    return true;
  }
  if (!list.includes(cultureId)) return false;
  plans.intake = list.filter((id) => id !== cultureId);
  return true;
}

export function setCampRegime(nation, regimeId) {
  if (!CAMP_REGIMES[regimeId]) return false;
  plansOf(nation).campRegime = regimeId;
  return true;
}

/** Province'ten bir halkın `people` kişisini çıkarır; payları korur. */
export function takePeople(province, cultureId, people) {
  const econ = province.econ;
  const before = Math.max(0, econ.population ?? 0);
  const rows = province.cultures ?? [];
  const row = rows.find((item) => item.id === cultureId);
  // Silah altındaki nüfusun içindedir: asker sayısının altına inilmez.
  const room = Math.max(0, before - Math.max(1, econ.soldiers ?? 0));
  const taken = Math.min(people, row ? before * row.share : 0, room);
  if (!(taken > 0)) return 0;
  const after = before - taken;
  province.cultures = rows.map((item) => ({
    id: item.id,
    share: (item.share * before - (item.id === cultureId ? taken : 0)) / after,
  })).filter((item) => item.share > 1e-6);
  econ.population = Math.round(after);
  return taken;
}

/**
 * NÜFUSU TAŞIR: kaynağın halklarından `share` kadarı hedeflere (nüfusları
 * oranında) gider, yolda `loss` payı ölür. Vassal kaçırma ve işgal emeğinin
 * ortak yolu.
 * @returns {{moved:number, dead:number, tiles:object[]}}
 */
export function movePeople(world, source, targets, share, loss = 0) {
  const result = { moved: 0, dead: 0, tiles: [] };
  if (!targets.length || !(share > 0)) return result;
  const weight = targets.reduce((sum, p) => sum + Math.max(1, p.econ.population ?? 0), 0);
  for (const row of [...(source.cultures ?? [])]) {
    const taken = takePeople(source, row.id, Math.round((source.econ.population ?? 0) * row.share * share));
    if (!(taken > 0)) continue;
    const arrive = taken * (1 - loss);
    result.moved += arrive;
    result.dead += taken - arrive;
    for (const target of targets) {
      addCulture(target, row.id, Math.round(arrive * Math.max(1, target.econ.population ?? 0) / weight));
    }
  }
  for (const target of targets) result.tiles.push(...settleMajority(world, target));
  result.tiles.push(...settleMajority(world, source));
  return result;
}

/** İşaretli halkın her state'ten kamplara haftalık sevkiyatı. */
function runIntake(world, nation, camps, tiles) {
  const open = camps.filter((camp) => inmatesOf(camp, nation) < CAMP.CAPACITY);
  if (!open.length) return 0;
  let dead = 0;
  for (const cultureId of nation.policies?.intake ?? []) {
    for (const province of ownProvinces(world, nation)) {
      if (province.econ.camp === nation.id) continue;
      const people = peopleIn(province, cultureId);
      if (people < 1) continue;
      const taken = takePeople(province, cultureId, Math.ceil(people * CAMP.INTAKE));
      if (!(taken > 0)) continue;
      dead += taken * CAMP.TRANSIT_LOSS;
      const arrive = taken * (1 - CAMP.TRANSIT_LOSS);
      for (const camp of open) addCulture(camp, cultureId, Math.round(arrive / open.length));
      tiles.push(...settleMajority(world, province));
    }
  }
  for (const camp of open) tiles.push(...settleMajority(world, camp));
  return dead;
}

/** Düşman eline geçen kamp kapanır; dünya içeride olanı öğrenir. */
function exposeLostCamps(game) {
  const world = game.world;
  for (const province of world.provinces ?? []) {
    const holder = province.econ?.camp;
    if (!(holder >= 0)) continue;
    const held = province.owner === holder
      && province.tileIdx.some((idx) => controllerOf(world.tiles[idx]) === holder);
    if (held) continue;
    clearCamp(province);
    const nation = world.nations[holder];
    if (!nation?.alive) continue;
    addInfamy(nation, CAMP.EXPOSED_INFAMY);
    plansOf(nation).campCount = campsOf(world, nation).length;
    if (holder === game.turns?.playerNation) {
      announce(game, nation, {
        kind: 'CRISIS', tier: TIER.MAJOR, key: `camp-lost-${province.id}`,
        title: `${stateName(province)} falls and the penal state is exposed`,
        detail: `The world sees what was done there: infamy +${CAMP.EXPOSED_INFAMY}.`,
      });
    }
  }
}

/** Haftalık kamp işleyişi: kayıp kamplar, sevkiyat, rejimin bedeli ve getirisi. */
export function runCamps(game) {
  const world = game.world;
  exposeLostCamps(game);
  const turn = game.turns?.turn ?? world.turn ?? 0;
  const tiles = [];
  for (const nation of world.nations) {
    if (!nation.alive || !nation.policies) continue;
    const camps = campsOf(world, nation);
    nation.policies.campCount = camps.length;
    if (!camps.length) continue;
    const regime = campRegimeOf(nation);
    let dead = runIntake(world, nation, camps, tiles);
    let units = 0;
    const held = new Set(nation.policies.intake ?? []);
    for (const camp of camps) {
      let inmates = 0;
      for (const row of inmateRows(camp, nation)) {
        const people = peopleIn(camp, row.id);
        dead += takePeople(camp, row.id, people * regime.mortality);
        inmates += people;
        held.add(row.id);
      }
      const inmateUnits = unitOf(inmates);
      units += inmateUnits;
      camp.econ.campWorkers = inmateUnits * regime.output;
    }
    nation.policies.campDeaths = (nation.policies.campDeaths ?? 0) + dead;
    addInfamy(nation, (CAMP.INFAMY_BASE * camps.length + CAMP.INFAMY_PER_UNIT * units) * regime.severity);
    for (const cultureId of [...held].sort((a, b) => a - b)) {
      const state = (nation.movements ??= {})[cultureId] ?? (nation.movements[cultureId] = { progress: 0 });
      state.progress = Math.min(99, (state.progress ?? 0) + CAMP.MOVEMENT * regime.severity);
      // Üç ayda bir, biriken ölçekle: haftalık küçük kayıt defterde budanır.
      if (turn % CAMP.REGARD_WEEKS !== 0) continue;
      for (const kin of world.nations) {
        if (kin.alive && kin.id !== nation.id && kin.culture === cultureId) {
          deed(world, kin.id, nation.id, 'interned_kin', turn, CAMP.KIN_REGARD * regime.severity * CAMP.REGARD_WEEKS);
        }
      }
    }
  }
  if (tiles.length) game.renderer?.invalidateTiles?.(tiles.filter(Boolean));
}

// ----------------------------------------------------- KÜLTÜR KAYNAŞMASI ---
//
// Asimilasyon yukarıdan aşağıdır, kaynaşma ortaklıktır: yalnız hak sahibi bir
// halk, barışta ve sakin bir devlette, yıllar içinde ana halka karışır. Ana
// yurt kilidini aşar çünkü halk artık devletin kendisidir.

function nationalShare(world, nation, cultureId) {
  let people = 0;
  let total = 0;
  for (const province of ownProvinces(world, nation)) {
    total += province.econ.population ?? 0;
    people += peopleIn(province, cultureId);
  }
  return total > 0 ? people / total : 0;
}

export function fusionBlockers(world, nation, cultureId) {
  if (cultureId === nation.culture) return ['They are already our people.'];
  if (!isAccepted(nation, cultureId)) return ['Only an accepted people can fuse with ours.'];
  const out = [];
  if (nation.policies?.fusion) out.push('A fusion is already under way.');
  if (nation.homeRule?.includes(cultureId)) out.push('They rule themselves: Home Rule must end first.');
  if (nation.movements?.[cultureId]?.crisis) out.push('Their demands are on the table.');
  const share = nationalShare(world, nation, cultureId);
  if (share < FUSION.MIN_SHARE) out.push(`Too few of them: ${(share * 100).toFixed(1)}% of the population, ${Math.round(FUSION.MIN_SHARE * 100)}% needed.`);
  if ((nation.stability ?? 0) < FUSION.MIN_STABILITY) out.push(`Stability must be ${Math.round(FUSION.MIN_STABILITY * 100)}% or more.`);
  if ((nation.economy?.literacy ?? 0) < FUSION.MIN_LITERACY) out.push(`Literacy must be ${Math.round(FUSION.MIN_LITERACY * 100)}% or more.`);
  if ((nation.economy?.warFronts ?? 0) > 0) out.push('Not while we are at war.');
  if ((nation.power ?? 0) < FUSION.POWER) out.push(`Needs ${FUSION.POWER} political power.`);
  return out;
}

export function startFusion(game, nation, cultureId) {
  const world = game.world;
  if (fusionBlockers(world, nation, cultureId).length) return false;
  nation.power -= FUSION.POWER;
  plansOf(nation).fusion = {
    culture: cultureId,
    since: game.turns?.turn ?? world.turn ?? 0,
    from: nationalShare(world, nation, cultureId),
  };
  return true;
}

/** Vazgeçmek bedavadır; karışmış olan karışmıştır. */
export function cancelFusion(nation) {
  if (!nation.policies?.fusion) return false;
  nation.policies.fusion = null;
  return true;
}

function finishFusion(game, nation, cultureId) {
  const world = game.world;
  const tiles = [];
  for (const province of ownProvinces(world, nation)) {
    const row = province.cultures?.find((item) => item.id === cultureId);
    if (row) {
      province.cultures = province.cultures.filter((item) => item.id !== cultureId);
      const host = province.cultures.find((item) => item.id === nation.culture);
      if (host) host.share += row.share;
      else province.cultures.push({ id: nation.culture, share: row.share });
      tiles.push(...settleMajority(world, province));
    }
    if (province.homeland === cultureId) province.homeland = nation.culture;
  }
  nation.accepted = (nation.accepted ?? []).filter((id) => id !== cultureId);
  if (nation.homeRule?.includes(cultureId)) nation.homeRule = nation.homeRule.filter((id) => id !== cultureId);
  if (nation.movements) delete nation.movements[cultureId];
  nation.prestige = (nation.prestige ?? 0) + FUSION.PRESTIGE;
  const plans = plansOf(nation);
  plans.fused = [...(plans.fused ?? []), cultureId];
  plans.fusion = null;
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.MAJOR, key: `fused-${cultureId}`,
      title: `The ${nameOf(world, cultureId)} and our people are now one`,
      detail: `Their homeland is ours by birth and they ask for nothing apart. Prestige +${FUSION.PRESTIGE}.`,
    });
  }
  return tiles;
}

/** Haftalık kaynaşma: pay ana halka geçer, talep söner, eşikte biter. */
export function runFusions(game) {
  const world = game.world;
  const tiles = [];
  for (const nation of world.nations) {
    const plan = nation.policies?.fusion;
    if (!nation.alive || !plan) continue;
    const cultureId = plan.culture;
    if (!isAccepted(nation, cultureId)) {
      nation.policies.fusion = null;
      continue;
    }
    const rate = FUSION.RATE * (0.6 + Math.max(0, Math.min(1, nation.economy?.literacy ?? 0)));
    for (const province of ownProvinces(world, nation)) {
      const row = province.cultures?.find((item) => item.id === cultureId);
      if (!row) continue;
      const moved = row.share * rate;
      row.share -= moved;
      const host = province.cultures.find((item) => item.id === nation.culture);
      if (host) host.share += moved;
      else province.cultures.push({ id: nation.culture, share: moved });
      tiles.push(...settleMajority(world, province));
    }
    const state = nation.movements?.[cultureId];
    if (state) state.progress = Math.max(0, (state.progress ?? 0) - FUSION.DEMAND_FADE);
    if (nationalShare(world, nation, cultureId) < FUSION.FINISH_SHARE) tiles.push(...finishFusion(game, nation, cultureId));
  }
  if (tiles.length) game.renderer?.invalidateTiles?.(tiles.filter(Boolean));
}

// ------------------------------------------------- OYUN EYLEMLERİ (ekran) ---

const nameOf = (world, cultureId) => world.cultures?.[cultureId]?.name ?? 'a foreign people';
const count = (people) => formatPopulation(people);

function repaint(game, tiles) {
  if (tiles?.length) game.renderer?.invalidateTiles?.(tiles.filter(Boolean));
  game.emit?.('provinces', null);
}

/** Sürgün: oyuncu ve YZ aynı kapı. Döndürür: giden insan sayısı. */
export function deport(game, nation, cultureId) {
  const world = game.world;
  const result = deportPeople(world, nation, cultureId);
  if (!result) return 0;
  repaint(game, result.tiles);
  const player = game.turns?.playerNation;
  const host = result.received.map((row) => world.nations[row.nation]?.name).filter(Boolean).slice(0, 3).join(', ') || 'abroad';
  if (nation.id === player) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `deport-${cultureId}`,
      title: `The ${nameOf(world, cultureId)} are driven out`,
      detail: `${count(result.people)} people cross into ${host}.`
        + (result.emptied ? ` ${result.emptied} of our provinces stand half empty — settlers can fill them (Cultures).` : '')
        + ' The world has taken note.',
    });
  } else {
    const ours = result.received.find((row) => row.nation === player);
    if (ours) {
      game.turns?.addLog?.(`${count(ours.people)} ${nameOf(world, cultureId)} driven out of ${nation.name} arrive in our lands.`,
        { kind: 'NATION', key: `refugees-${nation.id}-${cultureId}` });
    }
  }
  return result.people;
}

/** Toplama (rezervasyon). Döndürür: taşınan insan sayısı. */
export function concentrate(game, nation, cultureId) {
  const world = game.world;
  const result = concentratePeople(world, nation, cultureId);
  if (!result) return 0;
  repaint(game, result.tiles);
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `confine-${cultureId}`,
      title: `The ${nameOf(world, cultureId)} are confined to ${world.provinces[result.target]?.name ?? 'one state'}`,
      detail: `${count(result.people)} people are moved. Their other homes stand empty; the reservation will seethe.`,
    });
  }
  return result.people;
}

/** İskân. Döndürür: plan (göçmen sayısı ve altın) ya da null. */
export function resettle(game, nation) {
  const plan = startResettlement(game.world, nation);
  if (plan && nation.id === game.turns?.playerNation) {
    game.turns?.addLog?.(`Settlers set out: ${count(plan.people)} of our people will fill ${plan.targets.length} empty province${plan.targets.length === 1 ? '' : 's'} over two years (${money(plan.cost, 0)}).`,
      { kind: 'POLITICS', key: 'resettle' });
  }
  return plan;
}

/** Zorla asimilasyonu aç/kapat (oyuncu ekranı). */
export function forceAssimilation(game, nation, cultureId, on) {
  const ok = setForcedAssimilation(game.world, nation, cultureId, on);
  if (ok && nation.id === game.turns?.playerNation) {
    game.turns?.addLog?.(on
      ? `The ${nameOf(game.world, cultureId)} must raise their children in our tongue. They will not forgive it.`
      : `The ${nameOf(game.world, cultureId)} may teach their children their own tongue again.`,
    { kind: 'POLITICS', key: `forced-${cultureId}` });
  }
  return ok;
}

/** Haftalık iskân bütün uluslar için (turn.js, province fazı). */
export function runResettlements(game) {
  const tiles = [];
  for (const nation of game.world.nations) {
    if (nation.alive && nation.resettlement) tiles.push(...runResettlement(game.world, nation));
  }
  if (tiles.length) game.renderer?.invalidateTiles?.(tiles);
}
