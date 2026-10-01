// ULUSAL HAREKETLER — isyan bir an degil, bir SUREC.
//
// Kerem: "isyanlar giderek ilerleyecekler, patlayana kadar devam edecek; bazi
// seyleri feda edip bastirabilecegiz, ya gecici ya kalici; sona gelirse
// isyan eden yerler bizden ayrilip baska ulkeler gibi bize savas acacak.
// Balkan savaslari gibi etnikleri bir arada tutmak zor olacak; buyuk ulkeler
// asimilasyon yapmazlarsa canli bombaya donusur."
//
// Eski isyan kume kume, sessizce birikip tek haftada patliyordu ve sonucu
// "kirik kume"ydi: toprak el degistirmez, kume calismaz olurdu. Oyuncu neyin
// yaklastigini goremiyor, araya giremiyordu.
//
// MODEL. Hareket ULUS x HALK basinadir, kume basina degil (ev odevi testi:
// kirk kumeli imparatorluk kirk sayac okumaz, uc hareket okur). Uyeleri,
// halkin kabul edilmeyenlerin en buyugu oldugu ve yabanci payin isyan esigini
// gectigi kumelerdir (culture.movementProvinces) — tek kulturlu devlette
// hareket DOGMAZ, guvenlik kilidi korunur.
//
//   ilerleme 0-100, haftalik: (huzursuzluk - SAKIN) x BUYUME, altinda soner
//   asama   Grievances 0 · Agitation 25 · Resistance 50 · Insurgency 75
//           her asama uye kumelerin sadakatini (uretim, vergi, asker) daha
//           hizli asindirir — hareket patlamadan once HISSEDILIR
//   100     AYAKLANMA: kumeler kopar. Bitisik akraba devlet varsa ona katilir
//           ve o devlet savas acar; yoksa halkin uyuyan devleti uyanir
//           (world/nations.js appendRebelStates), ordusunu o kumelerden
//           toplar ve ultimatomsuz savas acar.
//
// FEDA EDILEN SEYLER (oyuncu ve YZ ayni kapidan):
//   gecici  SIKIYONETIM  26 hafta: ilerleme geriler, haftalik para + istikrar
//           TAVIZ         bir kerelik para: ilerleme -25, yilda bir
//   kalici  KATLIAM       halkin %15'i olur: ilerleme -45, sohret, istikrar,
//                         diger hareketler radikallesir
//           KABUL / SURGUN culture.js'teki mevcut kapilar
//           VASSAL BIRAK  kumeler halkin devleti olur, haraci bize oder
//
// Katman: game. DOM yok; ekran movementView'u okur, hicbir sayiyi kendisi kurmaz.

import {
  CULTURE, acceptBlockers, acceptCulture, cultureMix, expelBlockers, expelCulture,
  isAccepted, movementProvinces,
} from './culture.js';
import { atWar, relation, startRebellionWar } from './diplomacy.js';
import { addInfamy } from './infamy.js';
import { TIER, announce } from './chronicle.js';
import { openWeek, settle } from './treasury.js';
import { cityName, createCity } from './cities.js';
import { recruit } from './recruitment.js';
import { initNationEconomy } from './economy.js';
import { POPULATION_SCALE } from './populationScale.js';

export const MOVEMENT = {
  /** Bu huzursuzlugun altinda hareket soner, ustunde buyur. */
  CALM: 6,
  /** Esigin ustundeki her huzursuzluk puani icin haftalik ilerleme. */
  GROWTH: 0.6,
  /** Esigin altindaki her puan icin haftalik sonme. */
  FADE: 0.5,
  /** Ayaklanmadan sonra hareketin yeniden buyumedigi sure (hafta). */
  COOLDOWN: 104,
  /** Asama esikleri ve uye kumelerde haftalik sadakat asinmasi. */
  STAGES: [
    { id: 'grievances', name: 'Grievances', at: 0, drag: 0 },
    { id: 'agitation', name: 'Agitation', at: 25, drag: 0.3 },
    { id: 'resistance', name: 'Resistance', at: 50, drag: 0.8 },
    { id: 'insurgency', name: 'Insurgency', at: 75, drag: 1.6 },
  ],

  MARTIAL_WEEKS: 26,
  MARTIAL_BASE_COST: 0.5,
  MARTIAL_COST_PER_PROVINCE: 0.4,
  MARTIAL_PULL: 1.2,
  MARTIAL_STABILITY: 0.03,

  CONCESSION_DROP: 25,
  CONCESSION_UNREST: 1.5,
  CONCESSION_COOLDOWN: 52,
  CONCESSION_MIN_COST: 10,
  CONCESSION_INCOME_WEEKS: 2,

  CRACKDOWN_MIN_PROGRESS: 25,
  CRACKDOWN_KILL: 0.15,
  CRACKDOWN_DROP: 45,
  CRACKDOWN_RADICALIZE: 10,
  CRACKDOWN_INFAMY_MIN: 10,
  CRACKDOWN_STABILITY: 0.05,
  CRACKDOWN_WEEKS: 26,
  CRACKDOWN_COOLDOWN: 52,

  /** Toplam baski (sikiyonetim + katliam) istikrardan en fazla bu kadar yer. */
  REPRESSION_CAP: 0.12,
  /** Ayaklanmanin ordusu: kume basina alay, alt/ust sinir. */
  ARMY_PER_PROVINCE: 0.8,
  ARMY_MIN: 2,
  ARMY_MAX: 6,
};

const turnOf = (game) => game.turns?.turn ?? game.world.turn ?? 0;
const cultureName = (world, id) => world.cultures?.[id]?.name ?? 'a foreign people';

/** Ilerlemenin asamasi (indeks ve kayit). */
export function stageOf(progress) {
  let index = 0;
  for (let i = 0; i < MOVEMENT.STAGES.length; i++) {
    if (progress >= MOVEMENT.STAGES[i].at) index = i;
  }
  return { index, ...MOVEMENT.STAGES[index] };
}

function stateOf(nation, cultureId) {
  const all = nation.movements ?? (nation.movements = {});
  return all[cultureId] ?? (all[cultureId] = { progress: 0 });
}

/** Uye kumelerin nufus agirlikli huzursuzlugu: hareketin yakiti. */
function pressureOf(provinces) {
  let weighted = 0;
  let people = 0;
  for (const province of provinces) {
    const size = Math.max(1, province.econ?.population ?? 0);
    weighted += (province.econ?.unrest ?? 0) * size;
    people += size;
  }
  return people > 0 ? weighted / people : 0;
}

/** Halkin uye kumelerdeki insan sayisi (kume nufusu x halk payi). */
function peopleOf(provinces, cultureId) {
  let total = 0;
  for (const province of provinces) {
    const share = province.cultures?.find((row) => row.id === cultureId)?.share
      ?? (province.culture === cultureId ? 1 : 0);
    total += Math.max(0, province.econ?.population ?? 0) * share;
  }
  return total;
}

function martialCost(provinces) {
  return MOVEMENT.MARTIAL_BASE_COST + MOVEMENT.MARTIAL_COST_PER_PROVINCE * provinces.length;
}

function concessionCost(nation) {
  return Math.max(
    MOVEMENT.CONCESSION_MIN_COST,
    Math.max(0, nation.economy?.ledger?.income ?? 0) * MOVEMENT.CONCESSION_INCOME_WEEKS,
  );
}

/* --------------------------------------------------------------------------
   HAFTALIK ISLEYIS — turn.js, runProvinces'tan sonra
   -------------------------------------------------------------------------- */

export function runMovements(game) {
  const world = game.world;
  const turn = turnOf(game);
  const uprisings = [];
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const groups = movementProvinces(world, nation);
    const all = nation.movements ?? {};
    // Uyesi kalmayan hareket soner; sifira inince kayit silinir.
    for (const key of Object.keys(all)) {
      if (groups.has(Number(key))) continue;
      const state = all[key];
      state.progress = Math.max(0, (state.progress ?? 0) - MOVEMENT.FADE * 2);
      state.trend = -MOVEMENT.FADE * 2;
      if (state.progress <= 0 && (state.martialUntil ?? 0) <= turn) delete all[key];
    }
    let repression = 0;
    for (const [cultureId, provinces] of groups) {
      const state = stateOf(nation, cultureId);
      const pressure = pressureOf(provinces);
      const martial = (state.martialUntil ?? 0) > turn;
      let delta = pressure >= MOVEMENT.CALM
        ? (pressure - MOVEMENT.CALM) * MOVEMENT.GROWTH
        : -(MOVEMENT.CALM - pressure) * MOVEMENT.FADE;
      // Ayaklanmadan sonra hareket bir sure toparlanir: yenilgi hafizasi.
      if ((state.calmUntil ?? 0) > turn) delta = Math.min(delta, 0);
      if (martial) {
        delta = Math.min(delta, 0) - MOVEMENT.MARTIAL_PULL;
        settle(nation, 'unrest', -martialCost(provinces));
        repression += MOVEMENT.MARTIAL_STABILITY;
      }
      if ((state.crackdownAt ?? -Infinity) + MOVEMENT.CRACKDOWN_WEEKS > turn) {
        repression += MOVEMENT.CRACKDOWN_STABILITY;
      }
      state.pressure = pressure;
      state.trend = delta;
      state.progress = Math.max(0, Math.min(100, (state.progress ?? 0) + delta));
      // ASAMA HISSEDILIR: sadakat asinir, sadakatle olcekli uretim, vergi ve
      // asker havuzu dusur. Sikiyonetim altinda ordu duzeni tutar.
      const drag = martial ? 0 : stageOf(state.progress).drag;
      if (drag > 0) {
        for (const province of provinces) {
          province.econ.control = Math.max(0, (province.econ.control ?? 0) - drag);
        }
      }
      if (state.progress >= 100) uprisings.push({ nation, cultureId, provinces });
    }
    if (nation.economy) {
      nation.economy.repressionHit = Math.min(MOVEMENT.REPRESSION_CAP, repression);
    }
  }
  // Sahiplik degisimi tarama BITTIKTEN sonra: ayni dongude okunan uyelik
  // bozulmasin (resolveRevolts ile ayni kural).
  for (const { nation, cultureId, provinces } of uprisings) {
    if (nation.alive) uprising(game, nation, cultureId, provinces);
  }
  return uprisings.length;
}

/* --------------------------------------------------------------------------
   AYAKLANMA — kopus ve savas
   -------------------------------------------------------------------------- */

/** Halkin uyuyan (ya da yasayan) isyanci devleti. */
export function rebelStateOf(world, cultureId) {
  return world.nations.find((nation) => nation.archetype === 'rebel'
    && nation.rebelCulture === cultureId) ?? null;
}

/** Kumelere bitisik, ayni halktan, yasayan bir devlet. */
function adjacentKin(world, nation, provinces, cultureId) {
  for (const province of provinces) {
    for (const neighborId of province.neighbors ?? []) {
      const neighbor = world.provinces?.[neighborId];
      if (!neighbor || neighbor.owner < 0 || neighbor.owner === nation.id) continue;
      const other = world.nations[neighbor.owner];
      if (other?.alive && other.culture === cultureId) return other;
    }
  }
  return null;
}

function bound(world, a, b, turn) {
  const ties = (n, pid) => (n?.treaties ?? []).some((t) =>
    (t.type === 'ALLIANCE' || t.type === 'VASSALIZE') && t.partner === pid
    && (t.until ?? Infinity) > turn);
  return ties(world.nations[a], b) || ties(world.nations[b], a);
}

/** Kumeleri yeni sahibine gecirir; degisen kareleri doner. */
function transfer(game, nation, heir, provinces) {
  const world = game.world;
  const turn = turnOf(game);
  const tiles = [];
  for (const province of provinces) {
    for (const idx of province.tileIdx ?? []) {
      const tile = world.tiles[idx];
      if (!tile) continue;
      if (tile.owner === nation.id) nation.tiles = Math.max(0, nation.tiles - 1);
      tile.owner = heir.id;
      tile.controller = heir.id;
      tile.heldSince = turn;
      if (tile.city) tile.city.nationId = heir.id;
      heir.tiles = (heir.tiles ?? 0) + 1;
      tiles.push(tile);
    }
    province.owner = heir.id;
    nation.provinces = Math.max(0, (nation.provinces ?? 0) - 1);
    heir.provinces = (heir.provinces ?? 0) + 1;
    // Yeni devlet kendi halkini yonetir: sadakat orta, huzursuzluk dusuk.
    province.econ.control = Math.max(province.econ.control ?? 0, 55);
    province.econ.unrest = Math.min(province.econ.unrest ?? 0, CULTURE.AFTER_REVOLT_UNREST);
    province.econ.revoltWeeks = 0;
    province.econ.brokenSince = null;
    province.econ.brokenCulture = null;
  }
  game.renderer?.invalidateTiles?.(tiles);
  game.renderer?.invalidateCache?.();
  return tiles;
}

/**
 * Uyuyan devleti uyandirir: ekonomi kaydi sifirdan, baskent en kalabalik
 * kume, sehri yoksa o kumede bir oturak. Hazine eskisi gibi kalir (yeni para
 * uydurulmaz; uyuyan devlet 1836 kurulus hazinesini tasir).
 */
function awaken(game, rebel, provinces) {
  const world = game.world;
  const seat = [...provinces].sort((a, b) => (b.econ?.population ?? 0) - (a.econ?.population ?? 0)
    || a.id - b.id)[0];
  rebel.alive = true;
  rebel.infamy = 0;
  rebel.mobilization = null;
  rebel.treaties = [];
  rebel.accepted = [rebel.rebelCulture ?? rebel.culture];
  rebel.capital = seat.center;
  rebel.movements = {};
  initNationEconomy(world, rebel);
  openWeek(rebel);
  rebel.budget = null;
  const hasCity = provinces.some((province) => province.tileIdx
    ?.some((idx) => world.tiles[idx]?.city));
  if (!hasCity && seat.center && !seat.center.city) {
    const used = new Set(world.cities.map((city) => city.name));
    createCity(world, seat.center, rebel.id, cityName(game.turns.rng, used), 1, 2);
  }
}

/** Ayaklanmanin ordusu kopan kumelerin kendi insanlarindan toplanir. */
function raiseRebels(game, heir, provinces) {
  const want = Math.max(MOVEMENT.ARMY_MIN, Math.min(MOVEMENT.ARMY_MAX,
    Math.round(provinces.length * MOVEMENT.ARMY_PER_PROVINCE)));
  let raised = 0;
  for (let i = 0; i < want; i++) {
    const province = provinces[i % provinces.length];
    // Silahi halk kendi getirir (teçhizat dusulmez); adam GERCEK nufustan
    // cekilir — kurulus ordusuyla ayni kural (turn.js start).
    const unit = recruit(game, heir, 'INFANTRY', { source: province.center, charge: false });
    if (!unit) break;
    raised++;
  }
  return raised;
}

function uprising(game, nation, cultureId, provinces) {
  const world = game.world;
  const turn = turnOf(game);
  const state = stateOf(nation, cultureId);
  const player = game.turns?.playerNation;
  let heir = adjacentKin(world, nation, provinces, cultureId);
  let awakened = false;
  if (!heir) {
    heir = rebelStateOf(world, cultureId);
    if (!heir || heir.id === nation.id) return false;
    if (!heir.alive) awakened = true;
  }
  transfer(game, nation, heir, provinces);
  if (awakened) awaken(game, heir, provinces);
  const raised = heir.id === player ? 0 : raiseRebels(game, heir, provinces);
  // Savas: akraba devlet ittifak/vasallikla bagliysa kopus barisci kalir;
  // oyuncu akraba ise karar onundur (oyuncu adina savas ilan edilmez).
  let war = false;
  if (heir.id !== player && !bound(world, heir.id, nation.id, turn)) {
    war = startRebellionWar(game, heir.id, nation.id) || atWar(world, heir.id, nation.id);
  }
  state.progress = 0;
  state.trend = 0;
  state.calmUntil = turn + MOVEMENT.COOLDOWN;
  state.martialUntil = 0;
  state.uprisings = (state.uprisings ?? 0) + 1;
  world.uprisings = (world.uprisings ?? 0) + 1;
  world.uprisingProvinces = (world.uprisingProvinces ?? 0) + provinces.length;

  const name = cultureName(world, cultureId);
  const where = provinces.length === 1
    ? (provinces[0].name ?? 'a province') : `${provinces.length} provinces`;
  if (nation.id === player) {
    announce(game, nation, {
      kind: 'WAR', tier: TIER.MAJOR, key: `uprising-${cultureId}-${turn}`, ttl: 0,
      title: `The ${name} rise — ${where} break away`,
      detail: war
        ? `${heir.name} ${awakened ? 'is proclaimed and' : ''} takes up arms against us`
          + ` with ${raised} regiment${raised === 1 ? '' : 's'}. Retake the land, or make peace and let it go.`
        : `${where} now answer to ${heir.name}.`,
      tile: provinces[0].center ?? null,
    });
  } else if (heir.id === player) {
    announce(game, world.nations[player], {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `irredenta-${nation.id}-${turn}`,
      title: `Our kin in ${nation.name} have joined us`,
      detail: `${where} of our people rose against ${nation.name} and swore to us.`,
      tile: provinces[0].center ?? null,
    });
  }
  game.emit?.('provinces', null);
  return true;
}

/* --------------------------------------------------------------------------
   FEDA EDILEN SEYLER — oyuncu ve YZ ayni kapidan
   -------------------------------------------------------------------------- */

function liveMovement(world, nation, cultureId) {
  const provinces = movementProvinces(world, nation, cultureId);
  const state = nation.movements?.[cultureId] ?? null;
  return { provinces, state };
}

export function martialBlockers(world, nation, cultureId, turn = world.turn ?? 0) {
  const { provinces, state } = liveMovement(world, nation, cultureId);
  if (!provinces.length) return ['No national movement of theirs in our lands.'];
  if ((state?.martialUntil ?? 0) > turn) return ['Martial law is already in force.'];
  const weekly = martialCost(provinces);
  if ((nation.gold ?? 0) < weekly * 4) {
    return [`Treasury short: martial law needs four weeks of upkeep (£${(weekly * 4).toFixed(0)}).`];
  }
  return [];
}

/** GECICI: 26 hafta sikiyonetim. Haftalik bedel runMovements'ta odenir. */
export function declareMartialLaw(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  if (martialBlockers(world, nation, cultureId, turn).length) return false;
  const state = stateOf(nation, cultureId);
  state.martialUntil = turn + MOVEMENT.MARTIAL_WEEKS;
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MINOR, key: `martial-${cultureId}`,
      title: `Martial law over the ${cultureName(world, cultureId)}`,
      detail: `For ${MOVEMENT.MARTIAL_WEEKS} weeks the movement loses ground — at a weekly cost and some stability.`,
    });
  }
  game.emit?.('provinces', null);
  return true;
}

export function concessionBlockers(world, nation, cultureId, turn = world.turn ?? 0) {
  const { provinces, state } = liveMovement(world, nation, cultureId);
  if (!provinces.length) return ['No national movement of theirs in our lands.'];
  const next = (state?.concessionAt ?? -Infinity) + MOVEMENT.CONCESSION_COOLDOWN;
  if (next > turn) return [`Concessions were made recently; again in ${next - turn} weeks.`];
  if ((nation.gold ?? 0) < concessionCost(nation)) {
    return [`Treasury short: concessions cost £${concessionCost(nation).toFixed(0)}.`];
  }
  return [];
}

/** GECICI: bir kerelik para, ilerleme -25 ve uye kumelerde huzursuzluk iner. */
export function grantConcessions(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  if (concessionBlockers(world, nation, cultureId, turn).length) return false;
  const { provinces } = liveMovement(world, nation, cultureId);
  const state = stateOf(nation, cultureId);
  settle(nation, 'unrest', -concessionCost(nation));
  state.progress = Math.max(0, (state.progress ?? 0) - MOVEMENT.CONCESSION_DROP);
  state.concessionAt = turn;
  for (const province of provinces) {
    province.econ.unrest = Math.max(0, (province.econ.unrest ?? 0) - MOVEMENT.CONCESSION_UNREST);
  }
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.MINOR, key: `concession-${cultureId}`,
      title: `Concessions to the ${cultureName(world, cultureId)}`,
      detail: 'Schools in their tongue, local offices, a lighter levy. The movement cools — for now.',
    });
  }
  game.emit?.('provinces', null);
  return true;
}

export function crackdownBlockers(world, nation, cultureId, turn = world.turn ?? 0) {
  const { provinces, state } = liveMovement(world, nation, cultureId);
  if (!provinces.length) return ['No national movement of theirs in our lands.'];
  if ((state?.progress ?? 0) < MOVEMENT.CRACKDOWN_MIN_PROGRESS) {
    return ['The movement is still only grievances; there is no one to crush.'];
  }
  const next = (state?.crackdownAt ?? -Infinity) + MOVEMENT.CRACKDOWN_COOLDOWN;
  if (next > turn) return [`The last crackdown is too recent; again in ${next - turn} weeks.`];
  return [];
}

/**
 * KALICI: halkin uye kumelerdeki %15'i olur. Hareket geriler, ama halk
 * kalmadikca kok kurumaz; dunya hatirlar, kalan halklar radikallesir.
 * Olumler beyanli kanaldir (economy.repressionDeaths), hayalet kayip yok.
 */
export function crackdown(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  if (crackdownBlockers(world, nation, cultureId, turn).length) return 0;
  const { provinces } = liveMovement(world, nation, cultureId);
  let killed = 0;
  for (const province of provinces) {
    const rows = province.cultures?.length
      ? province.cultures : [{ id: province.culture, share: 1 }];
    const row = rows.find((item) => item.id === cultureId);
    if (!row) continue;
    const population = Math.max(0, province.econ.population ?? 0);
    const dead = Math.round(population * row.share * MOVEMENT.CRACKDOWN_KILL);
    if (dead <= 0) continue;
    killed += dead;
    province.econ.population = population - dead;
    // Paylar yeniden olculur: olen halkin payi kuculur, digerleri buyur.
    const left = population - dead;
    if (left > 0 && province.cultures?.length) {
      province.cultures = province.cultures.map((item) => ({
        id: item.id,
        share: item.id === cultureId
          ? (item.share * population - dead) / left
          : (item.share * population) / left,
      })).filter((item) => item.share > 0)
        .sort((a, b) => b.share - a.share || a.id - b.id);
      province.culture = province.cultures[0]?.id ?? province.culture;
    }
  }
  if (!killed) return 0;
  if (nation.economy) {
    nation.economy.repressionDeaths = (nation.economy.repressionDeaths ?? 0) + killed;
  }
  const state = stateOf(nation, cultureId);
  state.progress = Math.max(0, (state.progress ?? 0) - MOVEMENT.CRACKDOWN_DROP);
  state.crackdownAt = turn;
  addInfamy(nation, Math.max(MOVEMENT.CRACKDOWN_INFAMY_MIN,
    (killed / CULTURE.EXPEL_INFAMY_PER_POP) * 1.5));
  // Korku yayilir ama ofke de: diger halklarin hareketleri bir adim ileri.
  for (const [key, other] of Object.entries(nation.movements ?? {})) {
    if (Number(key) === cultureId) continue;
    other.progress = Math.min(99, (other.progress ?? 0) + MOVEMENT.CRACKDOWN_RADICALIZE);
  }
  world.crackdowns = (world.crackdowns ?? 0) + 1;
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `crackdown-${cultureId}-${turn}`,
      title: `The ${cultureName(world, cultureId)} are crushed`,
      detail: `${Math.round(killed / POPULATION_SCALE).toLocaleString('en-US')} dead. The movement`
        + ' is broken for now; the world remembers, and our other peoples grow bolder.',
    });
  }
  game.emit?.('provinces', null);
  return killed;
}

export function vassalBlockers(world, nation, cultureId) {
  const { provinces } = liveMovement(world, nation, cultureId);
  if (!provinces.length) return ['No national movement of theirs in our lands.'];
  const rebel = rebelStateOf(world, cultureId);
  if (!rebel) return ['They have no state to form.'];
  if (rebel.alive && atWar(world, rebel.id, nation.id)) {
    return [`${rebel.name} is already at war with us.`];
  }
  if (provinces.length >= (nation.provinces ?? 0)) return ['That would be every province we have.'];
  return [];
}

/**
 * KALICI, BARISCI: hareketin kumeleri halkin devleti olur ve bize baglanir —
 * kalici baris ve gelirinin %15'i haraç (turn.js payTreaties). Toprak gider,
 * savas gelmez; dunya iadeyi hatirlar (sohret duser).
 */
export function releaseAsVassal(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  if (vassalBlockers(world, nation, cultureId).length) return false;
  const { provinces } = liveMovement(world, nation, cultureId);
  const rebel = rebelStateOf(world, cultureId);
  const awakened = !rebel.alive;
  transfer(game, nation, rebel, provinces);
  if (awakened) awaken(game, rebel, provinces);
  // Kucuk bir muhafiz: devlet ordusuz dogarsa ilk hafta elenir.
  const unit = recruit(game, rebel, 'INFANTRY', { source: provinces[0].center, charge: false });
  if (!unit && awakened) raiseRebels(game, rebel, provinces.slice(0, 1));
  rebel.treaties = (rebel.treaties ?? []).filter((t) => !(t.type === 'VASSALIZE' && t.partner === nation.id));
  rebel.treaties.push({ type: 'VASSALIZE', partner: nation.id, since: turn });
  const relationRec = relation(world, nation.id, rebel.id);
  if (relationRec) relationRec.truceUntil = Math.max(relationRec.truceUntil ?? 0, turn + 52);
  addInfamy(nation, -provinces.length);
  const state = stateOf(nation, cultureId);
  state.progress = 0;
  state.calmUntil = turn + MOVEMENT.COOLDOWN;
  world.vassalReleases = (world.vassalReleases ?? 0) + 1;
  world.vassalProvinces = (world.vassalProvinces ?? 0) + provinces.length;
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'DIPLOMACY', tier: TIER.MAJOR, key: `vassal-${cultureId}-${turn}`,
      title: `${rebel.name} released as our vassal`,
      detail: `${provinces.length} province${provinces.length === 1 ? '' : 's'} now rule themselves`
        + ' and pay us 15% of their income every week, in permanent peace.',
    });
  }
  game.emit?.('provinces', null);
  return true;
}

/* --------------------------------------------------------------------------
   EKRANIN TEK KAYNAGI
   -------------------------------------------------------------------------- */

/**
 * Oyuncunun (ya da herhangi bir ulusun) hareketleri, ilerlemeye gore. Ekran
 * ve YZ ayni listeyi okur; satir basina engeller (blockers) ve bedeller hazir.
 */
export function movementView(world, nation) {
  if (!nation?.alive) return [];
  const turn = world.turn ?? 0;
  const groups = movementProvinces(world, nation);
  const ids = new Set([...groups.keys(),
    ...Object.keys(nation.movements ?? {}).map(Number)]);
  const mix = cultureMix(world, nation);
  const rows = [];
  for (const cultureId of ids) {
    const provinces = groups.get(cultureId) ?? [];
    const state = nation.movements?.[cultureId] ?? { progress: 0 };
    if (!provinces.length && (state.progress ?? 0) <= 0) continue;
    const progress = state.progress ?? 0;
    const trend = state.trend ?? 0;
    const stage = stageOf(progress);
    const next = MOVEMENT.STAGES[stage.index + 1] ?? null;
    const rebel = rebelStateOf(world, cultureId);
    rows.push({
      cultureId,
      name: cultureName(world, cultureId),
      color: world.cultures?.[cultureId]?.color ?? null,
      provinces: provinces.map((province) => ({ id: province.id, name: province.name, center: province.center })),
      people: peopleOf(provinces, cultureId),
      share: mix.find((row) => row.id === cultureId)?.share ?? 0,
      pressure: state.pressure ?? pressureOf(provinces),
      calm: MOVEMENT.CALM,
      progress,
      trend,
      stage,
      nextStage: next,
      // Bu hizla patlamaya kalan hafta (yalniz buyuyorsa).
      eta: trend > 0.01 ? Math.ceil((100 - progress) / trend) : null,
      martialLeft: Math.max(0, (state.martialUntil ?? 0) - turn),
      calmLeft: Math.max(0, (state.calmUntil ?? 0) - turn),
      heir: rebel ? { id: rebel.id, name: rebel.name, alive: rebel.alive } : null,
      actions: {
        martial: { blockers: martialBlockers(world, nation, cultureId, turn), cost: martialCost(provinces), weeks: MOVEMENT.MARTIAL_WEEKS },
        concessions: { blockers: concessionBlockers(world, nation, cultureId, turn), cost: concessionCost(nation), drop: MOVEMENT.CONCESSION_DROP },
        crackdown: {
          blockers: crackdownBlockers(world, nation, cultureId, turn),
          dead: Math.round(peopleOf(provinces, cultureId) * MOVEMENT.CRACKDOWN_KILL),
          drop: MOVEMENT.CRACKDOWN_DROP,
        },
        accept: { blockers: acceptBlockers(world, nation, cultureId, turn) },
        vassal: { blockers: vassalBlockers(world, nation, cultureId), provinces: provinces.length },
        expel: { blockers: expelBlockers(world, nation, cultureId), people: peopleOf(provinces, cultureId) },
      },
    });
  }
  return rows.sort((a, b) => b.progress - a.progress || b.provinces.length - a.provinces.length
    || a.cultureId - b.cultureId);
}

/* --------------------------------------------------------------------------
   YZ — ayni kapilar, ucuzdan pahaliya
   -------------------------------------------------------------------------- */

/**
 * Hukumetin hareket politikasi. YZ ulkeleri ve "reforms" devri bunu kosar.
 * Sira: kabul (en kalici, en ucuz) -> taviz -> sikiyonetim -> vassal birak ->
 * katliam (yalniz sert hukumetler, son care). Dort haftada bir.
 *
 * `crackdown: false` — oyuncunun devri katliam YAPMAZ: halkin bir kismini
 * oldurmek oyuncunun adina verilecek bir karar degildir (diplomasinin
 * varsayilan devir disinda kalmasiyla ayni gerekce, bkz. delegation.js).
 * @returns {{action: string, culture: number}|null}
 */
export function manageMovements(game, nation, { crackdown: allowCrackdown = true } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  if ((turn + nation.id) % 4 !== 0) return null;
  for (const row of movementView(world, nation)) {
    if (!row.provinces.length) continue;
    const { actions, progress } = row;
    if (progress >= 60 && !actions.accept.blockers.length && !isAccepted(nation, row.cultureId)
      && acceptCulture(game, nation, row.cultureId)) {
      return { action: 'accept', culture: row.cultureId };
    }
    if (progress >= 70 && !actions.concessions.blockers.length
      && grantConcessions(game, nation, row.cultureId)) {
      return { action: 'concessions', culture: row.cultureId };
    }
    if (progress >= 80 && !actions.martial.blockers.length
      && (nation.gold ?? 0) >= actions.martial.cost * 8
      && declareMartialLaw(game, nation, row.cultureId)) {
      return { action: 'martial', culture: row.cultureId };
    }
    if (progress >= 90 && !actions.vassal.blockers.length
      && row.provinces.length * 4 <= (nation.provinces ?? 0)
      && releaseAsVassal(game, nation, row.cultureId)) {
      return { action: 'vassal', culture: row.cultureId };
    }
    if (allowCrackdown && progress >= 92 && (nation.aggression ?? 1) > 1.25
      && !actions.crackdown.blockers.length
      && crackdown(game, nation, row.cultureId)) {
      return { action: 'crackdown', culture: row.cultureId };
    }
  }
  return null;
}

/** Surgun de bir hareket araci; ekran expelCulture'u dogrudan cagirir. */
export { expelCulture };
