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
  CULTURE, acceptBlockers, acceptCulture, acceptPrice, cultureMix,
  isAccepted, isHomeRule, isRevoked, movementProvinces, nationalismEra, rightsHolders,
} from './culture.js';
import { addTimedModifier } from './modifiers.js';
import { endVassalage, onPeace } from './peace.js';
import { worldNationalism } from './worldEvents.js';
import { grantLiberatorPassage, releasePeople, runPassages } from './nationBirth.js';
import { atWar, relation, startRebellionWar } from './diplomacy.js';
import { ensurePolitics } from './politics.js';
import { addInfamy } from './infamy.js';
import { TIER, announce } from './chronicle.js';
import { openWeek } from './treasury.js';
import { billHeadroom } from './econ/bills.js';
import { cityName, createCity } from './cities.js';
import { recruit } from './recruitment.js';
import { initNationEconomy } from './economy.js';
import { POPULATION_SCALE } from './populationScale.js';
import { setProvinceOwner } from './provinces.js';
import { deport, deportBlockers } from './culturePolicy.js';
import { money } from './money.js';

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
  // Haftalık bedel (IC) faturalara girer (econ/bills.js): sıkıyönetim çıktının
  // önünden düşer, halkın ve kalkınmanın payından yer.
  MARTIAL_BASE_COST: 0.75,
  MARTIAL_COST_PER_PROVINCE: 0.6,
  MARTIAL_PULL: 1.2,
  MARTIAL_STABILITY: 0.03,

  CONCESSION_DROP: 25,
  CONCESSION_UNREST: 1.5,
  /** Taviz biriken şikâyetten de düşer (~4 yıllık Limited birikimi). */
  CONCESSION_GRIEVANCE: 1.5,
  CONCESSION_COOLDOWN: 52,

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

  // MERDİVEN (TASARIM D1). Barışta ayrılık hareketi UÇURUMUN KENARINDA durur:
  // devlet sarsılmadıkça 90'ı geçmez (barış gerilim biriktirir, savaş boşaltır).
  // Eskiden hareketler 1904-11'de patlıyordu, 1912-45 arası hiç (ölçüldü).
  BRINK: 90,
  // Hakkı olan halkın talebi (vatandaş → Home Rule, özerk → devlet) huzursuzluk
  // değil SİYASETTİR: haftalık sabit tırmanış, milliyetçilik çağı, yaşayan bir
  // soydaş devlet ve savaş yorgunluğuyla hızlanır. 1900'de ~3.6 puan/yıl: ~1907
  // vatandaşlığı barışta ~1925'te krize, Büyük Savaş yorgunluğuyla 1918-21'de.
  DEMAND_RATE: 0.07,
  DEMAND_FADE: 0.2,
  HOME_RULE_PACE: 0.6,
  /** Oyuncunun krize cevap süresi; sonra kabine duruşa göre cevaplar. */
  CRISIS_WEEKS: 13,
  REFUSE_CITIZEN: 60,
  REFUSE_HOME_RULE: 90,
  /** Taviz her seferinde pahalanır: 40 + 20 × (son 10 yıldaki taviz). */
  CONCESSION_STEP: 20,
  CONCESSION_WINDOW: 520,
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

/** Ödün ve baskı SİYASİ hamledir: altınla değil Siyasi Güçle ödenir. */
export const CONCESSION_POWER = 40;
export const CRACKDOWN_POWER = 30;

/** Bir halka verilen tavizler pahalanır (tek supap, sonsuz değil). */
function concessionCost(nation, cultureId = null, turn = 0) {
  if (cultureId == null) return CONCESSION_POWER;
  const log = nation.movements?.[cultureId]?.concessionLog ?? [];
  const recent = log.filter((at) => at > turn - MOVEMENT.CONCESSION_WINDOW).length;
  return CONCESSION_POWER + MOVEMENT.CONCESSION_STEP * recent;
}

/** Hakkı olan halkın talep izindeki province'leri: çoğunluk olduğu yerler. */
export function demandProvinces(world, nation, cultureId) {
  return (world.provinces ?? []).filter((province) => province.owner === nation.id
    && province.econ && province.culture === cultureId);
}

/**
 * Devlet SARSILIYOR mu: yorgunluk ≥ 0.55, istikrar < 0.15 (devrim düzeyi
 * çöküş) ya da ağır bir yenilginin ardından iki yıl. Sarsılmayan devlette
 * ayrılık uçurumda bekler: barış gerilim biriktirir, savaş boşaltır.
 * İstikrar eşiği 0.40 ve 0.30'dayken çok halklı imparatorluklar barışta da
 * sarsılıyordu: 160×96'da kopan province'lerin çoğu Büyük Savaş'tan ÖNCE
 * gidiyordu (kıvılcımdan önce 94/154/92, Büyük Savaş + 6 yılda 30/55/60;
 * kampanya başına 40-77 ayaklanma, 1903-13'e yayılmış; ölçüldü).
 */
export const FALTER_STABILITY = 0.15;
export const FALTER_EXHAUSTION = 0.55;
/**
 * Çalkantı çağının dışında yalnız felaket bir yenilgi sarsar. Oyunun 1900-13
 * yerel savaşları çok ve yıpratıcı (kaybedenin barıştaki yorgunluğu p50 0.58):
 * tek eşikle imparatorluklar Büyük Savaş'tan önce dağılıyordu (160×96,
 * kıvılcımdan önce 105/72/92 province; ölçüldü). Kerem: "kültürler WW1 ve
 * WW2'den sonra patlayıp gidecek".
 */
export const FALTER_EXHAUSTION_CALM = 0.70;

/**
 * Çalkantı çağı: barut fıçısından Büyük Savaş'ın kıvılcımı + 9 yıla
 * (savaş ve ardından gelen barışlar, 1913-23 civarı) ve yeniden silahlanmadan
 * İkinci Büyük Savaş + 10 yıla (kampanya sonu). Olay takvimi dünyada kayıtlı
 * (worldEvents.js); takvimsiz (eski) dünyada her zaman çalkantı sayılır.
 */
const UPHEAVAL = [['powder_keg', 'great_war', 9 * 52], ['rearmament', 'second_great_war', 10 * 52]];
export function upheaval(world, turn) {
  const schedule = world?.worldEvents;
  if (!schedule) return true;
  for (const [from, anchor, after] of UPHEAVAL) {
    const begin = schedule[from]?.start ?? schedule[anchor]?.start;
    const pivot = schedule[anchor]?.start ?? begin;
    if (begin != null && turn >= Math.min(begin, pivot) && turn < pivot + after) return true;
  }
  return false;
}

export function faltering(nation, turn, world = null) {
  const politics = nation.politics ?? {};
  const limit = upheaval(world, turn) ? FALTER_EXHAUSTION : FALTER_EXHAUSTION_CALM;
  return (politics.exhaustion ?? 0) >= limit || (nation.stability ?? 0.6) < FALTER_STABILITY
    || turn < (politics.lostPeaceUntil ?? 0);
}

/**
 * KIRILMA NOKTASI (TASARIM D2): yorgunluk 0.60'ın üstüne çıktıkça her halkın
 * kırıldığı ilerleme düşer — 0.70'te 70, 0.80'de 40, 0.85'te tabanı 25 (eski
 * düzen çöker: o hafta hareketi olan her halk gider; 1917). Altında 100'dür:
 * 0.50-0.60 arası devlet sarsılır (uçurum kalkar), hareketler normal hızla
 * tırmanır. Eğri 0.50'den başlarken uçurumdaki (90) her hareket 0.58'de
 * birden kopuyordu (Draheim 1904'te 26 → 8 province; ölçüldü). Kopuş
 * yorgunluk ≥ 0.60 iken SAVAŞSIZ olur: kopuş yeni savaşlara zincirlenmez.
 */
export const BREAK = { FLOOR: 25, START: 0.6, SPAN: 0.25, PEACEFUL: 0.6, SHOCK_BASE: 10, SHOCK_EXH: 40, LOST_PEACE: 104, LOST_PEACE_EXH: 0.4, LOST_PEACE_EXH_CALM: 0.6 };

export function breakAt(nation) {
  const exhaustion = nation.politics?.exhaustion ?? 0;
  const t = Math.max(0, Math.min(1, (exhaustion - BREAK.START) / BREAK.SPAN));
  return 100 - (100 - BREAK.FLOOR) * t;
}

/** Denetim sayaçları (kaydedilmez; world.uprisings gibi). */
function count(world, key, n) {
  world.breakaways ??= {};
  world.breakaways[key] = (world.breakaways[key] ?? 0) + n;
}

/**
 * YENİLGİ ŞOKU: kaybedenin her halkının talebi barış masasında sıçrar
 * (10 + 40 × yorgunluk); ayrılık 99'da durur, talep krizi açar. Kaybedilmiş
 * barış iki yıl devleti sarsılmış sayar; tükenmiş kaybedenin dominyonları
 * kendi yoluna gider. Beyaz barışta yorgunluğu ≥ 0.60 olan her taraf kaybeder.
 */
function defeatShock(game, nation, { white }) {
  const world = game.world;
  const turn = turnOf(game);
  const exhaustion = nation.politics?.exhaustion ?? 0;
  // Çağın milliyetçiliği şoku büyütür: barut fıçısı ve savaşa giden yol
  // (worldEvents) dünya savaşı yenilgisini halklar için yerel yenilgiden
  // ağır kılar — dünya savaşı katılımcılarının barıştaki yorgunluğu ancak
  // 0.33'tü (kaybeden yerel savaşta 0.58; ölçüldü), kopuş yerel yenilgilere
  // kayıyordu.
  const surge = 1 + worldNationalism(world, turn);
  const bump = (BREAK.SHOCK_BASE + BREAK.SHOCK_EXH * exhaustion) * surge;
  for (const [key, state] of Object.entries(nation.movements ?? {})) {
    if (Number(key) === nation.culture) continue;
    const demand = state.track === 'citizen' || state.track === 'homeRule';
    state.progress = Math.min(demand ? 100 : 99, (state.progress ?? 0) + bump);
    state.calmUntil = 0;
  }
  // Kaybedilmiş barış ancak ağır bir savaşın ardından devleti sarsar: küçük bir
  // sınır yenilgisi uçurumdaki her hareketi koparmasın.
  if (!white && nation.politics && exhaustion >= (upheaval(world, turn) ? BREAK.LOST_PEACE_EXH : BREAK.LOST_PEACE_EXH_CALM)) {
    nation.politics.lostPeaceUntil = turn + BREAK.LOST_PEACE;
  }
  if (exhaustion >= BREAK.PEACEFUL) {
    const freed = endVassalage(world, nation.id);
    if (freed?.length) count(world, 'freedDominions', freed.length);
  }
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `defeat-shock-${turn}`,
      title: 'Defeat stirs our peoples',
      detail: `Every people's demands rose by ${Math.round(bump)} at the peace table (exhaustion ${Math.round(exhaustion * 100)}%).`,
    });
  }
}

onPeace((game, event) => {
  const world = game.world;
  const losers = [];
  if (!event.white && event.loser != null) losers.push(event.loser);
  else {
    for (const id of [event.a, event.b]) {
      if ((world.nations[id]?.politics?.exhaustion ?? 0) >= BREAK.PEACEFUL) losers.push(id);
    }
  }
  for (const id of losers.sort((x, y) => x - y)) {
    const nation = world.nations[id];
    if (nation?.alive) defeatShock(game, nation, { white: event.white });
  }
});

/** Ulus şu an bir savaşta mı (cephesi var mı). */
const atWarNow = (nation) => (nation.economy?.warFronts ?? 0) > 0;

/** Halkların duruşu: oyuncu Kültürler ekranında seçer, YZ saldırganlığından. */
export function nationalitiesStance(nation) {
  const set = nation.politics?.nationalities;
  if (set) return set;
  const aggression = nation.aggression ?? 1;
  return aggression < 0.9 ? 'accommodate' : aggression > 1.2 ? 'repress' : 'balance';
}

function kinStateAlive(world, nation, cultureId) {
  return world.nations.some((other) => other.alive && other.id !== nation.id
    && other.culture === cultureId);
}

/**
 * Hakkı olan halkların talep izleri (merdivenin üst iki basamağı). Huzursuzluk
 * yok, sadakat aşınması yok: baskı siyasidir. 100'de kriz açılır.
 */
function runDemands(game, nation, turn, crises, frees) {
  const world = game.world;
  const exhaustion = nation.politics?.exhaustion ?? 0;
  const era = nationalismEra(turn, world) / 1.5;
  // Sarsılan devlette talep de kırılma noktasında patlar (TASARIM D2).
  const limit = faltering(nation, turn, world) ? breakAt(nation) : 100;
  for (const cultureId of rightsHolders(nation)) {
    const homeRule = isHomeRule(nation, cultureId);
    const state = stateOf(nation, cultureId);
    state.track = homeRule ? 'homeRule' : 'citizen';
    if (state.crisis) {
      state.trend = 0;
      crises.push({ nation, cultureId, state });
      continue;
    }
    const members = demandProvinces(world, nation, cultureId);
    const delta = !members.length ? -MOVEMENT.DEMAND_FADE
      : MOVEMENT.DEMAND_RATE * era * (kinStateAlive(world, nation, cultureId) ? 1.5 : 1)
        * (1 + 2 * exhaustion) * (homeRule ? MOVEMENT.HOME_RULE_PACE : 1);
    state.trend = delta;
    state.progress = Math.max(0, Math.min(100, (state.progress ?? 0) + delta));
    if (state.progress >= limit) {
      // Tükenmiş devlet özerk halkı tutamaz: sormadan gider (barışçıl).
      if (homeRule && exhaustion >= BREAK.PEACEFUL) {
        frees.push({ nation, cultureId });
        continue;
      }
      state.crisis = { kind: homeRule ? 'independence' : 'homeRule', since: turn };
      crises.push({ nation, cultureId, state, opened: true });
    }
  }
}

/* --------------------------------------------------------------------------
   KRİZLER — "halklar her zaman daha fazlasını ister"
   -------------------------------------------------------------------------- */

/** Krizin cevap seçenekleri ve engelleri (ekran ve YZ aynı listeyi okur). */
export function crisisOptions(world, nation, cultureId) {
  const state = nation.movements?.[cultureId];
  const crisis = state?.crisis;
  if (!crisis) return null;
  const turn = world.turn ?? 0;
  return {
    kind: crisis.kind,
    since: crisis.since,
    left: Math.max(0, crisis.since + MOVEMENT.CRISIS_WEEKS - turn),
    grant: { label: crisis.kind === 'homeRule' ? 'Grant Home Rule' : 'Release as Dominion', blockers: [] },
    concessions: { cost: concessionCost(nation, cultureId, turn), blockers: concessionBlockers(world, nation, cultureId, turn) },
    refuse: { label: 'Refuse', blockers: [] },
  };
}

/** Home Rule: halk kendini yönetir; asker isteği yarıya iner, talep sıfırdan devlete döner. */
export function grantHomeRule(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  if (!isAccepted(nation, cultureId) || isHomeRule(nation, cultureId)) return false;
  nation.homeRule = [...(nation.homeRule ?? []), cultureId];
  const state = stateOf(nation, cultureId);
  state.progress = 0;
  state.track = 'homeRule';
  state.crisis = null;
  nation.cultureBacklashUntil = Math.max(nation.cultureBacklashUntil ?? 0, turn + 52);
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.MAJOR, key: `homerule-${cultureId}`,
      title: `Home Rule for the ${cultureName(world, cultureId)}`,
      detail: 'They govern themselves now and send only half their recruits. In time they will ask for a state of their own.',
    });
  }
  game.emit?.('provinces', null);
  return true;
}

/** Bağımsızlık krizine "evet": Dominion olarak bırakılırlar. */
export function grantDominion(game, nation, cultureId) {
  const state = stateOf(nation, cultureId);
  const done = releasePeople(game, nation, cultureId, { dominion: true });
  if (!done) {
    // Çoğunluk olduğu province kalmadıysa talep söner: bırakılacak toprak yok.
    state.progress = 50;
    state.crisis = null;
  }
  return true;
}

/**
 * "Hayır": halk hakkını kaybeder ve talebi ayrılığa döner — vatandaş Direniş'ten
 * (60), özerk halk uçurumun kenarından (90; devlet sarsıldığı an ayaklanır).
 * Şikâyet birikir, istikrar bir süre düşer.
 */
export function refuseDemand(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  const wasHomeRule = isHomeRule(nation, cultureId);
  const next = (nation.accepted ?? [nation.culture]).filter((id) => id !== cultureId);
  if (next.length) nation.accepted = next;
  else delete nation.accepted;
  if (wasHomeRule) nation.homeRule = nation.homeRule.filter((id) => id !== cultureId);
  nation.revoked = [...new Set([...(nation.revoked ?? []), cultureId])].sort((a, b) => a - b);
  nation.movements[cultureId] = {
    progress: wasHomeRule ? MOVEMENT.REFUSE_HOME_RULE : MOVEMENT.REFUSE_CITIZEN,
  };
  for (const province of demandProvinces(world, nation, cultureId)) {
    province.econ.grievance = (province.econ.grievance ?? 0) + 3;
  }
  addTimedModifier(nation, `refused-${cultureId}`, `Refused the ${cultureName(world, cultureId)}`,
    wasHomeRule ? 52 : 26, { stability: wasHomeRule ? -0.05 : -0.03 }, turn);
  if (nation.id === game.turns?.playerNation) {
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: `refuse-${cultureId}`,
      title: `We refused the ${cultureName(world, cultureId)}`,
      detail: wasHomeRule
        ? 'They lose their self-rule and their rights. They will rise the moment the state falters.'
        : 'They lose their citizenship. Their movement returns at Resistance.',
    });
  }
  game.emit?.('provinces', null);
  return true;
}

/**
 * Krize duruşla cevap. YZ krizi açıldığı hafta cevaplar; oyuncunun kabinesi
 * 13 hafta bekler ve ASLA reddetmez (toprak ve hak kaybı oyuncunun kararıdır):
 * gücü yettikçe taviz, yetmezse "evet".
 */
export function answerCrisis(game, nation, cultureId, choice = { player: false }) {
  // Açık cevap (ekran ve denetim): 'grant' · 'concessions' · 'refuse'.
  if (typeof choice === 'string') {
    const kind = nation.movements?.[cultureId]?.crisis?.kind;
    if (!kind) return null;
    if (choice === 'grant') (kind === 'homeRule' ? grantHomeRule : grantDominion)(game, nation, cultureId);
    else if (choice === 'concessions') { if (!grantConcessions(game, nation, cultureId)) return null; }
    else if (choice === 'refuse') refuseDemand(game, nation, cultureId);
    else return null;
    return choice;
  }
  const { player } = choice;
  const world = game.world;
  const turn = turnOf(game);
  const state = nation.movements?.[cultureId];
  const kind = state?.crisis?.kind;
  if (!kind) return null;
  const stance = nationalitiesStance(nation);
  const exhaustion = nation.politics?.exhaustion ?? 0;
  const share = cultureMix(world, nation).find((row) => row.id === cultureId)?.share ?? 0;
  const atWarNow = (nation.economy?.warFronts ?? 0) > 0;
  const cheapConcession = concessionCost(nation, cultureId, turn) <= 80
    && !concessionBlockers(world, nation, cultureId, turn).length;
  const grant = () => (kind === 'homeRule' ? grantHomeRule : grantDominion)(game, nation, cultureId);
  // Savaşta toprak verilmez (tam çöküş hariç): bağımsızlık krizi barışı
  // bekler — taviz varsa zaman satın alınır, yoksa kriz açık kalır.
  if (kind === 'independence' && atWarNow && exhaustion < 0.85) {
    return cheapConcession && grantConcessions(game, nation, cultureId) ? 'concessions' : null;
  }
  if (player) {
    if (cheapConcession && grantConcessions(game, nation, cultureId)) return 'concessions';
    grant();
    return 'grant';
  }
  let answer;
  if (stance === 'accommodate') answer = 'grant';
  else if (stance === 'repress') {
    answer = kind === 'homeRule'
      ? (exhaustion >= 0.6 || (nation.stability ?? 0.6) < 0.45 ? 'grant' : 'refuse')
      : ((nation.stability ?? 0.6) >= 0.5 && !atWarNow ? 'refuse' : 'grant');
  } else if (kind === 'homeRule') {
    answer = share >= 0.15 || exhaustion >= 0.5 || atWarNow ? 'grant' : cheapConcession ? 'concessions' : 'grant';
  } else {
    answer = atWarNow || exhaustion >= 0.3 || (nation.stability ?? 0.6) < 0.5 ? 'grant'
      : cheapConcession ? 'concessions' : 'grant';
  }
  if (answer === 'concessions' && !grantConcessions(game, nation, cultureId)) answer = 'grant';
  if (answer === 'grant') grant();
  if (answer === 'refuse') refuseDemand(game, nation, cultureId);
  return answer;
}

function openCrisisNotice(game, nation, cultureId, kind) {
  const world = game.world;
  const name = cultureName(world, cultureId);
  announce(game, nation, {
    kind: 'CRISIS', tier: TIER.MAJOR, key: `crisis-${cultureId}`, ttl: MOVEMENT.CRISIS_WEEKS,
    title: kind === 'homeRule' ? `The ${name} demand Home Rule` : `The ${name} demand a state of their own`,
    detail: `Answer on the Cultures screen within ${MOVEMENT.CRISIS_WEEKS} weeks, or your cabinet answers by your Nationalities policy.`,
  });
}

/* --------------------------------------------------------------------------
   HAFTALIK ISLEYIS — turn.js, runProvinces'tan sonra
   -------------------------------------------------------------------------- */

export function runMovements(game) {
  const world = game.world;
  const turn = turnOf(game);
  runPassages(game);
  const uprisings = [];
  const crises = [];
  const frees = [];
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const groups = movementProvinces(world, nation);
    const all = nation.movements ?? {};
    // Uyesi kalmayan hareket soner; sifira inince kayit silinir.
    for (const key of Object.keys(all)) {
      if (groups.has(Number(key))) continue;
      const state = all[key];
      // Talep izleri (vatandaş/Home Rule) kendi döngüsünde yürür.
      if (state.track === 'citizen' || state.track === 'homeRule') continue;
      state.progress = Math.max(0, (state.progress ?? 0) - MOVEMENT.FADE * 2);
      state.trend = -MOVEMENT.FADE * 2;
      if (state.progress <= 0 && (state.martialUntil ?? 0) <= turn) delete all[key];
    }
    let repression = 0;
    let martialBill = 0;
    const shaken = faltering(nation, turn, world);
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
        // Sıkıyönetim YAVAŞLATIR, dondurmaz. Min(delta, 0) her hareketi 100'ün
        // altında tutuyordu: 24 koşuda tek ayaklanma, vergi bedeli %0.2.
        // Baskı yüksekse hareket sıkıyönetime rağmen büyür.
        delta -= MOVEMENT.MARTIAL_PULL;
        martialBill += martialCost(provinces);
        repression += MOVEMENT.MARTIAL_STABILITY;
      }
      if ((state.crackdownAt ?? -Infinity) + MOVEMENT.CRACKDOWN_WEEKS > turn) {
        repression += MOVEMENT.CRACKDOWN_STABILITY;
      }
      state.pressure = pressure;
      state.trend = delta;
      state.progress = Math.max(0, Math.min(100, (state.progress ?? 0) + delta));
      if (!shaken) state.progress = Math.min(state.progress, MOVEMENT.BRINK);
      // ASAMA HISSEDILIR: sadakat asinir, sadakatle olcekli uretim, vergi ve
      // asker havuzu dusur. Sikiyonetim altinda ordu duzeni tutar.
      const drag = martial ? 0 : stageOf(state.progress).drag;
      if (drag > 0) {
        for (const province of provinces) {
          province.econ.control = Math.max(0, (province.econ.control ?? 0) - drag);
        }
      }
      if (state.progress >= (shaken ? breakAt(nation) : 100)) uprisings.push({ nation, cultureId, provinces });
    }
    if (nation.economy) {
      nation.economy.repressionHit = Math.min(MOVEMENT.REPRESSION_CAP, repression);
      nation.economy.martialBill = martialBill;
    }
    runDemands(game, nation, turn, crises, frees);
  }
  // Krizler tarama bittikten sonra cevaplanır (sahiplik değişimi gibi).
  const player = game.turns?.playerNation;
  for (const { nation, cultureId, state, opened } of crises) {
    if (!nation.alive || !state.crisis) continue;
    if (nation.id !== player) answerCrisis(game, nation, cultureId, { player: false });
    else if (opened) openCrisisNotice(game, nation, cultureId, state.crisis.kind);
    else if (turn - state.crisis.since >= MOVEMENT.CRISIS_WEEKS) {
      const answer = answerCrisis(game, nation, cultureId, { player: true });
      // Savaşta bağımsızlık krizi barışı bekler (cevap yok): her hafta yazılmasın.
      if (answer) announce(game, nation, {
        kind: 'POLITICS', tier: TIER.MINOR, key: `cabinet-crisis-${cultureId}`,
        title: `Your cabinet answered the ${cultureName(world, cultureId)}`,
        detail: answer === 'concessions' ? 'It bought time with concessions, by your Nationalities policy.'
          : 'It granted their demand, by your Nationalities policy.',
      });
    }
  }
  // Sahiplik degisimi tarama BITTIKTEN sonra: ayni dongude okunan uyelik
  // bozulmasin (resolveRevolts ile ayni kural).
  // ÇÖZÜLME ADIM ADIM: uçurumda (90) bekleyen bütün halklar kırılma noktası
  // 90'ın altına indiği hafta BİRLİKTE gidiyordu (Sarland 1908, yorgunluk
  // 0.67-0.70: tek haftada bütün halkları; Kerem: "niye böyle patladı").
  // Tam çöküş (yorgunluk ≥ 0.85) dışında ülke başına 4 haftada bir halk,
  // en ileri hareket önce; ötekiler sırada bekler.
  const leaving = new Map();
  for (const entry of uprisings) {
    const list = leaving.get(entry.nation) ?? [];
    list.push(entry);
    leaving.set(entry.nation, list);
  }
  for (const [nation, list] of leaving) {
    if (!nation.alive) continue;
    const collapse = (nation.politics?.exhaustion ?? 0) >= 0.85;
    // SAVAŞ SÜRERKEN KOPUŞ YOK (tam çöküş hariç): kopuş barış masasından
    // sonra gelir. Savaşın ortasındaki kopuşlar oyuncunun ordusunu cepte
    // bırakıyor, düşmanını isyancılara yediriyordu (Kerem: "bu patlama işi
    // sıkıntı"; "WW1 ve WW2'den SONRA patlayıp gidecekler").
    if (!collapse && atWarNow(nation)) continue;
    if (!collapse && turn < (nation.politics?.nextBreakaway ?? 0)) continue;
    list.sort((a, b) => (nation.movements[b.cultureId]?.progress ?? 0) - (nation.movements[a.cultureId]?.progress ?? 0)
      || a.cultureId - b.cultureId);
    for (const { cultureId, provinces } of collapse ? list : list.slice(0, 1)) {
      if (nation.alive) uprising(game, nation, cultureId, provinces);
    }
    if (nation.politics) nation.politics.nextBreakaway = turn + 4;
  }
  for (const { nation, cultureId } of frees) {
    if (!nation.alive || (atWarNow(nation) && (nation.politics?.exhaustion ?? 0) < 0.85)) continue;
    if (releasePeople(game, nation, cultureId)) count(world, 'freed', 1);
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

/** Kumeleri yeni sahibine gecirir; degisen kareleri doner (nationBirth de kullanir). */
export function transfer(game, nation, heir, provinces) {
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
    setProvinceOwner(world, province, heir.id);
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
 *
 * İKİNCİ HAYAT: yuva bir kez uyanıp ölmüş olabilir (her halkın tek yuvası
 * var). Eski hayatın siyaseti, yasaları, hedefi ve hareket kayıtları yeni
 * devlete geçmesin diye sıfırlanır; ad, devletin doğduğu yola göre yazılır
 * (isyan/kopuş → Free State, Dominion, bırakma → Republic).
 */
export function awaken(game, rebel, provinces, { path = 'war' } = {}) {
  const world = game.world;
  const seat = [...provinces].sort((a, b) => (b.econ?.population ?? 0) - (a.econ?.population ?? 0)
    || a.id - b.id)[0];
  rebel.alive = true;
  rebel.infamy = 0;
  rebel.mobilization = null;
  rebel.treaties = [];
  rebel.accepted = [rebel.rebelCulture ?? rebel.culture];
  rebel.homeRule = [];
  rebel.capital = seat.center;
  rebel.movements = {};
  rebel.goal = 'industry';
  rebel.claims = [];
  rebel.politics = null;
  rebel.power = 25;
  rebel.stability = 0.6;
  rebel.warSupport = 0.5;
  ensurePolitics(world, rebel);
  const people = world.cultures?.[rebel.rebelCulture ?? rebel.culture]?.name;
  if (people) {
    rebel.fullName = path === 'dominion' ? `Dominion of the ${people}`
      : path === 'release' ? `Republic of ${rebel.name.replace(/^Free /, '')}`
        : `Free State of the ${people}`;
  }
  // Binalar province'te durur; isyancı devletin yalnız ekonomi kaydı kurulur.
  initNationEconomy(world, rebel);
  openWeek(rebel);
  const hasCity = provinces.some((province) => province.tileIdx
    ?.some((idx) => world.tiles[idx]?.city));
  if (!hasCity && seat.center && !seat.center.city) {
    const used = new Set(world.cities.map((city) => city.name));
    createCity(world, seat.center, rebel.id, cityName(game.turns.rng, used), 1, 2);
  }
}

/** Ayaklanmanin ordusu kopan kumelerin kendi insanlarindan toplanir. */
export function raiseRebels(game, heir, provinces) {
  const want = Math.max(MOVEMENT.ARMY_MIN, Math.min(MOVEMENT.ARMY_MAX,
    Math.round(provinces.length * MOVEMENT.ARMY_PER_PROVINCE)));
  let raised = 0;
  for (let i = 0; i < want; i++) {
    const province = provinces[i % provinces.length];
    // Silahi halk kendi getirir (teçhizat dusulmez); adam GERCEK nufustan
    // cekilir — kurulus ordusuyla ayni kural (turn.js start).
    const unit = recruit(game, heir, 'INFANTRY', { source: province.center, charge: false });
    // Kaynağında eski devletin garnizonu duran province atlanır (alay düşman
    // yığınının üstüne doğmaz, bkz. recruitment.deploymentTile); öbürleri denenir.
    if (!unit) continue;
    raised++;
  }
  return raised;
}

function uprising(game, nation, cultureId, provinces) {
  const world = game.world;
  const turn = turnOf(game);
  const state = stateOf(nation, cultureId);
  const player = game.turns?.playerNation;
  // GÜVENLİK KİLİDİ (TASARIM §2.0): ana halkın çoğulluk olduğu province ve
  // başkent hiçbir halk kanalıyla gitmez. Üye seçimi tebaa payının TOPLAMINA
  // bakar (iki azınlık 0.30 + 0.25 ≥ 0.5) ve ana halkın %45'lik çoğulluğunu
  // kopuşa katıyordu (audit:homeland T1: 9 küme; ölçüldü).
  const capital = world.provinces?.[nation.capital?.provinceId];
  provinces = provinces.filter((province) => province.culture !== nation.culture && province !== capital);
  if (!provinces.length) {
    state.progress = Math.min(state.progress ?? 0, MOVEMENT.BRINK);
    return false;
  }
  let heir = adjacentKin(world, nation, provinces, cultureId);
  let awakened = false;
  if (!heir) {
    heir = rebelStateOf(world, cultureId);
    if (!heir || heir.id === nation.id) return false;
    if (!heir.alive) awakened = true;
  }
  // Tükenmiş devlet (yorgunluk ≥ 0.60) kopanı tutamaz: savaşsız ayrılık.
  // Başka bir savaştaki devletten kopuş da SAVAŞSIZDIR: isyan savaşı ikinci
  // cephe açıyor, ordusu oyuncuyla meşgul efendinin boş toprağını isyancılar
  // alıyor ve efendi elenince oyuncunun iki yıllık savaşı ganimetsiz bitiyordu
  // (Kerem 2026-10-15: "çıkan ülke savaştığım ülkeyi yedi, yok oldu").
  const peaceful = (nation.politics?.exhaustion ?? 0) >= BREAK.PEACEFUL
    || (nation.economy?.warFronts ?? 0) > 0;
  transfer(game, nation, heir, provinces);
  if (awakened) awaken(game, heir, provinces);
  // Eski efendinin düşmanları yeni devletten geçebilir (cepte kalmasınlar).
  grantLiberatorPassage(world, heir, nation);
  const raised = heir.id === player ? 0 : (peaceful ? Math.min(1, raiseRebels(game, heir, provinces.slice(0, 1)))
    : raiseRebels(game, heir, provinces));
  // Savas: akraba devlet ittifak/vasallikla bagliysa kopus barisci kalir;
  // oyuncu akraba ise karar onundur (oyuncu adina savas ilan edilmez).
  let war = false;
  if (!peaceful && heir.id !== player && !bound(world, heir.id, nation.id, turn)) {
    war = startRebellionWar(game, heir.id, nation.id) || atWar(world, heir.id, nation.id);
  }
  if (peaceful) {
    const rec = relation(world, nation.id, heir.id);
    if (rec) rec.truceUntil = Math.max(rec.truceUntil ?? 0, turn + 52);
  }
  count(world, peaceful ? 'secession' : 'war', provinces.length);
  state.progress = 0;
  state.trend = 0;
  state.calmUntil = turn + MOVEMENT.COOLDOWN;
  state.martialUntil = 0;
  state.uprisings = (state.uprisings ?? 0) + 1;
  world.uprisings = (world.uprisings ?? 0) + 1;
  world.uprisingProvinces = (world.uprisingProvinces ?? 0) + provinces.length;
  // Kaybedilen toprak cogunlugu sertlestirir (society.js).

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
  } else if (player != null && player >= 0 && atWar(world, player, nation.id)) {
    // Düşmanımızın çözülmesi oyuncuya söylenir: haritada sebepsiz beliren
    // devlet kafa karıştırıyordu (Kerem 2026-10-15: "savaştığım ülkenin
    // içinden ülke çıktı").
    announce(game, world.nations[player], {
      kind: 'WAR', tier: TIER.MAJOR, key: `enemy-breakup-${nation.id}-${cultureId}-${turn}`,
      title: `${nation.name} is breaking apart`,
      detail: `Exhausted by the war, ${nation.name} lost ${where} to the ${name}: ${heir.fullName ?? heir.name}`
        + `${awakened ? ' is proclaimed' : ' takes them'}${peaceful ? ', without a fight' : ' and fights them'}.`
        + ` Our armies may pass through their land while our war with ${nation.name} lasts.`,
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
  if (billHeadroom(nation) < weekly) {
    return [`No room in the state's bills: martial law costs ${money(weekly, 1)} a week and would tip us into a supply crisis.`];
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

/** Tavizin dokunduğu province'ler: ayrılık hareketi ya da talep izi. */
function concessionProvinces(world, nation, cultureId) {
  const { provinces, state } = liveMovement(world, nation, cultureId);
  if (provinces.length || !(state?.track === 'citizen' || state?.track === 'homeRule')) return provinces;
  return demandProvinces(world, nation, cultureId);
}

export function concessionBlockers(world, nation, cultureId, turn = world.turn ?? 0) {
  const state = nation.movements?.[cultureId] ?? null;
  if (!concessionProvinces(world, nation, cultureId).length) return ['No national movement of theirs in our lands.'];
  const next = (state?.concessionAt ?? -Infinity) + MOVEMENT.CONCESSION_COOLDOWN;
  if (next > turn) return [`Concessions were made recently; again in ${next - turn} weeks.`];
  const cost = concessionCost(nation, cultureId, turn);
  if ((nation.power ?? 0) < cost) return [`Concessions cost ${cost} political power.`];
  return [];
}

/**
 * GECICI: ilerleme ya da talep -25, uye kumelerde huzursuzluk iner. Tek
 * supaptır: açık krizi kapatır (zaman satın alır) ve her seferinde pahalanır.
 */
export function grantConcessions(game, nation, cultureId) {
  const world = game.world;
  const turn = turnOf(game);
  if (concessionBlockers(world, nation, cultureId, turn).length) return false;
  const provinces = concessionProvinces(world, nation, cultureId);
  const state = stateOf(nation, cultureId);
  nation.power -= concessionCost(nation, cultureId, turn);
  state.progress = Math.max(0, (state.progress ?? 0) - MOVEMENT.CONCESSION_DROP);
  state.concessionAt = turn;
  state.concessionLog = [...(state.concessionLog ?? []), turn]
    .filter((at) => at > turn - MOVEMENT.CONCESSION_WINDOW);
  state.crisis = null;
  for (const province of provinces) {
    province.econ.unrest = Math.max(0, (province.econ.unrest ?? 0) - MOVEMENT.CONCESSION_UNREST);
    province.econ.grievance = Math.max(0, (province.econ.grievance ?? 0) - MOVEMENT.CONCESSION_GRIEVANCE);
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
  if ((nation.power ?? 0) < CRACKDOWN_POWER) return [`A crackdown costs ${CRACKDOWN_POWER} political power.`];
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
  nation.power -= CRACKDOWN_POWER;
  const recolored = [];
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
      const before = province.culture;
      province.culture = province.cultures[0]?.id ?? before;
      // Çoğunluk el değiştirdiyse kareler de (expelCulture gibi): harita,
      // fetih kötü şöhreti ve şehir nüfusu kareden okur.
      if (province.culture !== before) {
        for (const idx of province.tileIdx ?? []) {
          world.tiles[idx].culture = province.culture;
          recolored.push(world.tiles[idx]);
        }
      }
    }
  }
  if (recolored.length) game.renderer?.invalidateTiles(recolored);
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
  const shaken = faltering(nation, turn, world);
  for (const cultureId of ids) {
    const state = nation.movements?.[cultureId] ?? { progress: 0 };
    const track = state.track === 'citizen' || state.track === 'homeRule' ? state.track : 'subject';
    const provinces = track === 'subject' ? (groups.get(cultureId) ?? []) : demandProvinces(world, nation, cultureId);
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
      // Merdiven: tebaa (ayrılık), vatandaş (Home Rule ister), Home Rule (devlet ister).
      track,
      crisis: crisisOptions(world, nation, cultureId),
      // Barışta ayrılık uçurumda bekler: devlet sarsıldığı an ayaklanırlar.
      atBrink: track === 'subject' && !shaken && progress >= MOVEMENT.BRINK - 0.01,
      stage,
      nextStage: next,
      // Bu hizla patlamaya (ya da krize) kalan hafta (yalniz buyuyorsa).
      eta: trend > 0.01 && !(track === 'subject' && !shaken && progress >= MOVEMENT.BRINK - 0.01)
        ? Math.ceil(((track === 'subject' && !shaken ? MOVEMENT.BRINK : 100) - progress) / trend) : null,
      martialLeft: Math.max(0, (state.martialUntil ?? 0) - turn),
      calmLeft: Math.max(0, (state.calmUntil ?? 0) - turn),
      heir: rebel ? { id: rebel.id, name: rebel.name, alive: rebel.alive } : null,
      actions: {
        martial: { blockers: martialBlockers(world, nation, cultureId, turn), cost: martialCost(provinces), weeks: MOVEMENT.MARTIAL_WEEKS },
        concessions: { blockers: concessionBlockers(world, nation, cultureId, turn), cost: concessionCost(nation, cultureId, turn), drop: MOVEMENT.CONCESSION_DROP },
        crackdown: {
          blockers: crackdownBlockers(world, nation, cultureId, turn),
          dead: Math.round(peopleOf(provinces, cultureId) * MOVEMENT.CRACKDOWN_KILL),
          drop: MOVEMENT.CRACKDOWN_DROP,
        },
        accept: { blockers: acceptBlockers(world, nation, cultureId, turn) },
        vassal: { blockers: vassalBlockers(world, nation, cultureId), provinces: provinces.length },
        expel: { blockers: deportBlockers(world, nation, cultureId), people: peopleOf(provinces, cultureId) },
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
 * Hükümetin HALKLAR POLİTİKASI (TASARIM D1). YZ ülkeleri ve "reforms" devri
 * bunu koşar; dört haftada bir tek hamle. Duruş (accommodate · balance ·
 * repress) eşikleri seçer. Vatandaşlık artık takvimle değil yalnız hareketin
 * İsyan eşiğinde verilir (eskiden 1900-09'da 24-29 kabul; ölçüldü) ve bir
 * sonraki talebi başlatır. Krizler runMovements'ta cevaplanır.
 *
 * `crackdown: false` — oyuncunun devri katliam YAPMAZ, Dominion bırakmaz:
 * halkın bir kısmını öldürmek ya da toprak vermek oyuncunun adına verilecek
 * karar değildir (bkz. delegation.js).
 * @returns {{action: string, culture: number, note?: {text: string, why: string}}|null}
 */
export function manageMovements(game, nation, { crackdown: allowCrackdown = true } = {}) {
  const world = game.world;
  const turn = turnOf(game);
  if ((turn + nation.id) % 4 !== 0) return null;
  const stance = nationalitiesStance(nation);
  const shaken = faltering(nation, turn, world);
  const mix = cultureMix(world, nation);
  for (const row of movementView(world, nation)) {
    if (!row.provinces.length || row.crisis) continue;
    const { actions, progress } = row;
    const culture = row.cultureId;
    const cheap = !actions.concessions.blockers.length && actions.concessions.cost <= 80;
    let result;
    if (row.track !== 'subject') {
      if (stance !== 'repress' && progress >= 70 && cheap
        && (result = grantConcessions(game, nation, culture))) return actionResult('concessions', culture, result);
      continue;
    }
    const share = mix.find((item) => item.id === culture)?.share ?? 0;
    const grantAt = stance === 'accommodate' ? 60 : 75;
    const grantShare = stance === 'accommodate' ? 0.08 : stance === 'repress' ? 0.30 : 0.12;
    // Oyuncunun geri aldığı halkı devir yeniden kabul etmez (culture.revokeCulture).
    if (progress >= grantAt && share >= grantShare && !actions.accept.blockers.length
      && !isAccepted(nation, culture) && !isRevoked(nation, culture)
      && (result = acceptCulture(game, nation, culture))) {
      return actionResult('accept', culture, result);
    }
    if (stance !== 'repress' && progress >= 50 && cheap
      && (result = grantConcessions(game, nation, culture))) {
      return actionResult('concessions', culture, result);
    }
    const martialAt = stance === 'repress' ? 70 : 80;
    if (stance !== 'accommodate' && progress >= martialAt && !actions.martial.blockers.length
      && (stance === 'repress' || billHeadroom(nation) >= actions.martial.cost * 4)
      && (result = declareMartialLaw(game, nation, culture))) {
      return actionResult('martial', culture, result);
    }
    // Sarsılan devlet ayrılığı Dominion'a çevirir (yalnız YZ).
    if (allowCrackdown && shaken && !atWarNow(nation) && stance !== 'repress' && progress >= MOVEMENT.BRINK
      && row.provinces.length * 4 <= (nation.provinces ?? 0)
      && (result = releasePeople(game, nation, culture, { dominion: true }))) {
      return actionResult('vassal', culture, result);
    }
    if (allowCrackdown && stance === 'repress' && progress >= 85 && (nation.aggression ?? 1) > 1.25
      && !actions.crackdown.blockers.length
      && (result = crackdown(game, nation, culture))) {
      return actionResult('crackdown', culture, result);
    }
  }
  return null;
}

/**
 * AUTO notu geçişi (redesign D1, P1 dikişi): eylem `{ note: {text, why} }`
 * döndürürse not sonuca taşınır ve ai.js devir satırını ondan basar. Bugünkü
 * eylemler true döndürür; sonuç eskisiyle aynıdır ({action, culture}).
 */
function actionResult(action, culture, result) {
  return result?.note ? { action, culture, note: result.note } : { action, culture };
}

/** Sürgün de bir hareket aracı (culturePolicy.deport: soydaşa/komşuya). */
export { deport };
