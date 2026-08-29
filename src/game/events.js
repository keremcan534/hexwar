// Ulusal olay saptayicisi: simulasyonun URETTIGI donum noktalarini bulur.
//
// Buradaki hicbir sey oyunun kurallarini degistirmez. Her hafta ulkenin
// durumuna bakar, gecen haftayla karsilastirir ve GECIS oldugunda konusur.
// Kor Beta #2'nin bir numarali sikayeti buydu: oyuncu borclandigini, ordusunun
// yok oldugunu, rejiminin degistigini ve baskentini kaybettigini oyundan
// ogrenemiyordu (OPEN_BETA_2_MASTER_VERDICT, soru 5).
//
// Tekrar engelleme tasarima gomulu: durum makinesi yalnizca DEGISIMDE konusur,
// borc surdugu her hafta degil.

import { TIER, announce, captureOpening } from './chronicle.js';
import { debtCapacity } from './economy.js';
import { governmentType } from './reforms.js';
import { rulingParty } from './politics.js';
import { controllerOf } from './control.js';
import { regimentCount } from './units.js';
import { scoreboard } from './hegemony.js';
import { atWar } from './diplomacy.js';

/** Kredinin bu kadari tukendiyse borc "kritik" sayilir. */
const DEBT_CRITICAL = 0.75;
/** Bunun altindaki borc gecici bir acik sayilir, ulusal olay degil. */
const DEBT_FLOOR = 120;
/** Ordunun bir haftada bu orandan fazlasi giderse bozgun sayilir. */
const ROUT_SHARE = 0.34;
/** Bozgun duyurusu icin gereken en az alay: iki alaylik kuvvette gurultu olur. */
const ROUT_FLOOR = 3;

/**
 * Ilk gozlem TEMEL CIZGIDIR, olay degil. Kayittan donen (ya da yeni kurulan)
 * ulke borclu/isgal altinda olabilir; bunu "yeni olmus" gibi duyurmak
 * yuklemeden sonra sahte tarih uretirdi.
 */
function ensureEventState(nation) {
  nation.events ??= {};
  const state = nation.events;
  state.debt ??= null;
  state.government ??= null;
  state.party ??= null;
  state.capital ??= null;
  state.regiments ??= -1;
  return state;
}

function money(value) {
  return `¤${Math.round(value).toLocaleString('en-US')}`;
}

/**
 * Ayni olayin kisa arayla tekrari tarihe yazilmaz. Temerrut cikip girebilir
 * (borc kapanir, yeniden birikir); vakayinamede "The state defaults" satirinin
 * bes kez tekrarlanmasi tarih degil gurultudur.
 */
const REPEAT_COOLDOWN = 156;

function throttled(state, key, turn, cooldown = REPEAT_COOLDOWN) {
  state.said ??= {};
  const last = state.said[key];
  if (Number.isFinite(last) && turn - last < cooldown) return true;
  state.said[key] = turn;
  return false;
}

/** Ulkenin sahadaki alay sayisi. */
function regimentsOf(world, nationId) {
  let total = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId === nationId) total += regimentCount(unit);
  }
  return total;
}

/**
 * Borc durumu: temiz → borclu → kritik → temerrut. Yalnizca gecis konusur;
 * "borcun var" diye her hafta uyarmak bildirim cehennemidir.
 *
 * Esik ANLAMLI olmali: bir haftalik ¤7'lik acik ulusal olay degildir. Bir
 * aylik gelir esigi hem histerezis saglar (kucuk acik gidip gelirken kart
 * ucusmaz) hem de olayi gercekten haber degeri olan yere baglar.
 */
function debtPhase(nation) {
  if ((nation.economy?.ledger?.default ?? 0) > 0.01) return 'default';
  const debt = Math.max(0, nation.debt ?? 0);
  if (debt <= 0.01) return 'clear';
  const monthlyIncome = Math.max(0, nation.economy?.ledger?.income ?? 0) * 4;
  if (debt < Math.max(DEBT_FLOOR, monthlyIncome)) return 'minor';
  return debt >= debtCapacity(nation) * DEBT_CRITICAL ? 'critical' : 'indebted';
}

function announceDebt(game, nation, state, from, to) {
  const ledger = nation.economy?.ledger ?? {};
  const weekly = ledger.net ?? 0;
  const interest = Math.abs(nation.economy?.ledger?.interest ?? 0);
  const line = `Debt ${money(nation.debt ?? 0)} · weekly ${weekly >= 0 ? '+' : ''}${money(weekly)} · interest ${money(interest)}/wk`;
  // 'minor' gecis konusmaz: kucuk acik gelir gider, haber degeri yoktur.
  if (to === 'minor') return;
  const turn = game.world?.turn ?? 0;
  if (to === 'indebted' && from !== 'critical' && from !== 'default') {
    if (throttled(state, 'debt-begins', turn)) return;
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: 'debt-begins',
      title: 'The treasury borrows',
      detail: `Revenue no longer covers the state's obligations. ${line}`,
      halt: false, ttl: 0,
    });
    return;
  }
  if (to === 'critical') {
    if (throttled(state, 'debt-critical', turn)) return;
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.MAJOR, key: 'debt-critical',
      title: 'Credit is running out',
      detail: `Lenders are close to refusing the state. ${line}`,
      halt: false, ttl: 0,
    });
    return;
  }
  if (to === 'default') {
    if (throttled(state, 'debt-default', turn)) return;
    announce(game, nation, {
      kind: 'CRISIS', tier: TIER.EXISTENTIAL, key: 'debt-default',
      title: 'The state defaults',
      detail: `Obligations went unpaid; creditors will lend less and charge more. ${line}`,
      halt: true, ttl: 0,
    });
    return;
  }
  // Borcun kapanmasi ancak GERCEK bir borctan sonra haberdir: 'minor'den
  // temizlige donus gunluk isleyistir.
  if (to === 'clear' && (from === 'indebted' || from === 'critical' || from === 'default')) {
    if (throttled(state, 'debt-clear', turn)) return;
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.MAJOR, key: 'debt-clear',
      title: 'The debt is cleared',
      detail: 'The treasury owes nothing. Credit recovers from here.',
    });
  }
}

/** Baskentin durumu: elde / isgal altinda / kaybedilmis. */
function capitalPhase(world, nation) {
  const capital = nation.capital;
  if (!capital) return 'lost';
  const tile = world.get?.(capital.q, capital.r);
  if (!tile) return 'held';
  if (tile.owner !== nation.id) return 'lost';
  return controllerOf(tile) === nation.id ? 'held' : 'occupied';
}

function capitalName(world, nation) {
  const city = (world.cities ?? []).find(
    (candidate) => candidate.tile === world.get?.(nation.capital?.q, nation.capital?.r),
  );
  return city?.name ?? 'The capital';
}

/**
 * Haftalik tarama. Yalnizca oyuncunun ulkesi icin kosar: YZ ulkelerinin ic
 * gecisleri oyuncuyu ilgilendirmez ve kaydi sisirir.
 */
export function runNationalEvents(game, nation) {
  if (!nation?.alive || !nation.economy) return;
  const world = game.world;
  const state = ensureEventState(nation);
  // Acilis kesiti ilk taramada alinir: kapanis ekrani yuzyilin iki ucunu
  // karsilastirabilsin (bkz. ui/endScreen.js).
  captureOpening(world, nation, governmentType(nation));

  // --- KAMPANYA SAYACLARI ------------------------------------------------
  // Kapanis ekraninin "savas sayisi / zirve hazine / en kotu borc" satirlari
  // icin ucuz, haftalik sayaclar (REMAINING_PRESENTATION_DEBT #3'un cozumu:
  // uydurma sayi gostermek yerine sayac tutuluyor). ~10 satir, kayda ~40 bayt.
  const tally = nation.tally ??= { warsFought: 0, peakGold: 0, worstDebt: 0 };
  tally.peakGold = Math.max(tally.peakGold, Math.round(nation.gold ?? 0));
  tally.worstDebt = Math.max(tally.worstDebt, Math.round(nation.debt ?? 0));
  state.atWarWith ??= {};
  for (const other of world.nations) {
    if (!other.alive || other.id === nation.id) continue;
    const fighting = atWar(world, nation.id, other.id);
    if (fighting && !state.atWarWith[other.id]) {
      state.atWarWith[other.id] = true;
      tally.warsFought++;
    } else if (!fighting && state.atWarWith[other.id]) {
      state.atWarWith[other.id] = false;
    }
  }

  // --- BORC / TEMERRUT ---------------------------------------------------
  const phase = debtPhase(nation);
  if (state.debt !== null && phase !== state.debt) announceDebt(game, nation, state, state.debt, phase);
  state.debt = phase;

  // --- ULUSAL PROGRAM DAVETI ---------------------------------------------
  // Programsiz oyuncu masaya cagrilir (kalici kart, durdurmaz). Sik degil:
  // ayni davet uc yilda bir. Fesih sogumasi bitmeden davet edilmez.
  const research = nation.research;
  if (research && !research.programme
    && (world.turn ?? 0) >= (research.programmeCooldown ?? 0)
    && !throttled(state, 'programme-prompt', world.turn ?? 0)) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.IMPORTANT, key: 'programme-prompt', ttl: 0,
      title: 'The nation has no programme',
      detail: 'Proclaim a National Programme on the Technology screen to set a direction for the decade.',
    });
  }

  // --- REJIM -------------------------------------------------------------
  const form = governmentType(nation);
  const party = rulingParty(nation);
  // Hukumet BICIMI iktidar partisinin ideolojisinden turer; yillik secimler
  // etiketi yil basi gidip getirebilir. Her salinim "rejim degisti" diye
  // zamani durdurursa oyun bir yuzyilda on uc kez bolunur (olculdu: EVT3'te
  // 13 kez). Gercek bir rejim degisimi nadirdir; kisa arali salinim degildir.
  // Sogutma BICIME baglidir, gecise degil: A→B→A salinimi ayni iki basligi
  // tekrarlar ve vakayiname bir sarkac gunlugune doner (olculdu: yuzyilda 6
  // kez ayni satir). Ayni bicime donus on yil boyunca sessizdir; tek yonlu
  // gercek bir degisim ise aninda duyurulur.
  // Sogutma anahtari YON GOZETMEZ: A→B ve B→A ayni cift, ayni fren. Savas→
  // siyaset baglantisi hukumetleri gercekten dusurmeye baslayinca salinim iki
  // AYRI anahtardan gecip yilasir olmustu (olculdu: ayni baslik yuzyilda 10
  // kez). Ayni ciftin gidis-gelisi TEK hikayedir ("istikrarsiz hukumet"),
  // dokuz ayri manset degil.
  if (state.government && form !== state.government) {
    const pair = [state.government, form].sort().join('|');
    // Ceyrek yuzyil: ayni ciftin ikinci flip'i tarih, besincisi gurultu
    // (butce: ayni baslik yuzyilda ≤4 — audit:events TEST 2, 100 yil olcer).
    if (!throttled(state, `regime:${pair}`, world.turn ?? 0, 1300)) {
      announce(game, nation, {
        kind: 'POLITICS', tier: TIER.MAJOR, key: 'regime',
        title: `${state.government} → ${form}`,
        detail: `The state now operates as a ${form.toLowerCase()} under the ${party?.name ?? 'ruling party'}. Fiscal limits follow its policy.`,
        halt: true, ttl: 0,
      });
    }
  }
  state.government = form;
  state.party = party?.id ?? null;

  // --- BASKENT -----------------------------------------------------------
  const capital = capitalPhase(world, nation);
  if (state.capital !== null && capital !== state.capital) {
    const name = capitalName(world, nation);
    if (capital === 'occupied') {
      announce(game, nation, {
        kind: 'CONQUEST', tier: TIER.MAJOR, key: 'capital',
        title: `${name} is occupied`,
        detail: 'The capital is under enemy control. Sovereignty is decided at the peace table.',
        tile: world.get?.(nation.capital?.q, nation.capital?.r) ?? null,
        halt: true, ttl: 0,
      });
    } else if (capital === 'lost') {
      announce(game, nation, {
        kind: 'CONQUEST', tier: TIER.EXISTENTIAL, key: 'capital',
        title: `${name} is lost`,
        detail: 'The capital has passed to another state by treaty.',
        halt: true, ttl: 0,
      });
    } else if (state.capital === 'occupied') {
      announce(game, nation, {
        kind: 'FIELD_WIN', tier: TIER.MAJOR, key: 'capital',
        title: `${name} is recovered`,
        detail: 'The capital is back under national control.',
        tile: world.get?.(nation.capital?.q, nation.capital?.r) ?? null,
      });
    }
    state.capital = capital;
  }

  // --- ORDU --------------------------------------------------------------
  const regiments = regimentsOf(world, nation.id);
  const before = state.regiments;
  if (before >= 0 && regiments < before) {
    const lost = before - regiments;
    if (regiments === 0) {
      announce(game, nation, {
        kind: 'ARMY', tier: TIER.EXISTENTIAL, key: 'army-gone',
        title: 'The army is gone',
        detail: `The last ${lost === 1 ? 'regiment' : `${lost} regiments`} of the standing army are destroyed. The country is undefended.`,
        halt: true, ttl: 0,
      });
    } else if (before >= ROUT_FLOOR && lost / before >= ROUT_SHARE) {
      announce(game, nation, {
        kind: 'ARMY', tier: TIER.MAJOR, key: 'army-rout',
        title: 'The army is broken',
        detail: `${lost} of ${before} regiments destroyed this week; ${regiments} remain.`,
        ttl: 0,
      });
    } else {
      announce(game, nation, {
        kind: 'ARMY', tier: TIER.IMPORTANT, key: 'army-loss',
        title: lost === 1 ? 'A regiment is destroyed' : `${lost} regiments destroyed`,
        detail: `${regiments} regiments remain in the field.`,
      });
    }
  }
  state.regiments = regiments;
}

// --------------------------------------------------------- DUNYA HABERLERI ---
// Kuresel gelismeler: buyuk guc giris/cikisi, yeni sanayi lideri, devlet
// cokusu. GECIS tetikler, durum degil — ilk kosu TABAN alir, duyurmaz
// (kayittan yukleme sonrasi da boyle: onbellek kayda girmez, sessiz kurulur).
// Amac gurultu degil "durun, onlara ne oldu?" ani; 13 haftada bir bakilir.

const STORY_EVERY = 13;

export function runWorldStories(game) {
  const world = game.world;
  const turn = world.turn ?? 0;
  if (turn % STORY_EVERY !== 0) return;
  const board = scoreboard(world);
  const greats = board.slice(0, 3).map((row) => row.nation.id);
  let topIndustry = null;
  let topLevels = 0;
  const aliveIds = [];
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    aliveIds.push(nation.id);
    const levels = (nation.economy?.factories ?? []).reduce((s, f) => s + (f.level ?? 1), 0);
    if (levels > topLevels || (levels === topLevels && topIndustry != null && nation.id < topIndustry)) {
      topLevels = levels;
      topIndustry = nation.id;
    }
  }
  const prev = world.storyState;
  world.storyState = { greats, topIndustry, alive: aliveIds };
  if (!prev) return; // taban — duyuru yok

  const say = (text, key) => game.turns.addLog(text, { kind: 'NATION', key });
  // Buyuk guc degisimi: ilk uce giren/cikan.
  for (const id of greats) {
    if (!prev.greats.includes(id)) {
      say(`${world.nations[id]?.name} now stands among the great powers.`, `story-gp:${id}`);
    }
  }
  for (const id of prev.greats) {
    if (!greats.includes(id) && world.nations[id]?.alive) {
      say(`${world.nations[id]?.name} has slipped from the ranks of the great powers.`, `story-gp:${id}`);
    }
  }
  // Sanayi liderligi el degistirdi.
  if (prev.topIndustry != null && topIndustry != null
    && prev.topIndustry !== topIndustry && topLevels > 10) {
    say(`${world.nations[topIndustry]?.name} is now the world's first industrial power.`, 'story-industry');
  }
  // Cokus: gecen bakista canli olan devlet artik yok.
  for (const id of prev.alive) {
    if (!aliveIds.includes(id)) {
      say(`${world.nations[id]?.name} has ceased to exist as a state.`, `story-dead:${id}`);
    }
  }
}
