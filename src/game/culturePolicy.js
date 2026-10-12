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
import { settle } from './treasury.js';
import { POP_UNIT } from './econ/defs.js';
import { formatPopulation } from './economy.js';

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
  /** Nüfus birimi (100 bin) göçmen başına peşin altın. */
  SETTLE_GOLD: 6,
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
function addCulture(province, cultureId, people) {
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
function settleMajority(world, province) {
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
  return { targets, people, need, gold: Math.ceil(unitOf(people) * POLICY.SETTLE_GOLD) };
}

export function resettleBlockers(world, nation) {
  if (nation.resettlement?.targets?.length) return ['Settlers are already on their way.'];
  const plan = resettlementPlan(world, nation);
  if (!plan.people) return ['No province of ours stands empty.'];
  if ((nation.gold ?? 0) < plan.gold) return [`The treasury needs ${plan.gold} gold for the settlers.`];
  return [];
}

/** İskânı başlatır: altın peşin, göç SETTLE_WEEKS boyunca haftalık. */
export function startResettlement(world, nation) {
  if (resettleBlockers(world, nation).length) return null;
  const plan = resettlementPlan(world, nation);
  settle(nation, 'outlay', -plan.gold);
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
    game.turns?.addLog?.(`Settlers set out: ${count(plan.people)} of our people will fill ${plan.targets.length} empty province${plan.targets.length === 1 ? '' : 's'} over two years (${plan.gold} gold).`,
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
