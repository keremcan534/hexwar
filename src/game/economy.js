// EKONOMİ — haftalık kapanışın orkestrası (TASARIM.md §1-§8, "Tek Çubuk").
//
// Tek akış: state'ler ÇIKTI üretir → FATURALAR önden düşer (ikmal, okul,
// sıkıyönetim) → ORDU hatları ekonomi yasasının tavanına kadar sanayiden
// çeker → HALK doyurma hedefi kadar alır → KALAN kalkınma fonuna akar. Altın,
// vergi, borç, enflasyon ve binalar yoktur (2026-10-15; eski model ölçümü
// econ/defs.js başında). Hesabın kendisi econ/ altındaki küçük dosyalardadır,
// burası yalnız SIRAYI tutar:
//
//   beginEconomy   abluka, değiştiriciler, savaş yükü
//   runNationEconomy (ulus başına) kaynak üretimi → çıktı → faturalar →
//                  hatlar → halk → yatırım → ihtiyaçlar → ticaret teklifi
//   finishEconomy  dünya ticareti (fondan) → oranlar → kademe alımı → defter
//
// Kaynak oranının etkisi bir hafta gecikir (mal bir haftada gelir); döngüsüz
// ve deterministik kalmanın bedeli budur.

import {
  EQUIPMENT_IDS, FUND_RESERVE_WEEKS, POP_UNIT, RESOURCE_IDS, SALTPETER_PER_FOOD,
} from './econ/defs.js';
import { lawOption } from './laws.js';
import { mod, refreshModifiers } from './modifiers.js';
import {
  battleSaltpeterNeed, emptyResourceMap, emptyResourceRecord, foodNeed,
  nationProduction, unitResourceNeeds,
} from './econ/resources.js';
import {
  addEquipment, consumerNeed, ensureIndustry, feedTarget, runLines,
} from './econ/industry.js';
import { computeOutput } from './econ/output.js';
import { billsOf } from './econ/bills.js';
import {
  buyDevelopment, developmentCap, fundFloor, investEfficiency, investmentNeeds, investmentTarget,
} from './econ/investment.js';
import { clearTrade, computeBlockades, ensureMarket } from './econ/trade.js';
import { closeWeek, emptyLedger, openWeek, settle } from './treasury.js';
import { occupiedShareOf } from './provinces.js';
import { treatiesOf } from './peace.js';
import {
  START_DEVELOPMENT, START_DEVELOPMENT_CAP, START_FORT, START_LITERACY, START_STOCK,
} from './era.js';

/** Kaynak imtiyazı (barış şartı): yenilen yatak üretiminin beşte birini verir. */
const CONCESSION_SHARE = 0.2;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Sayıyı ekran biçimine çevirir: 1.23M, 45K. */
export function formatPopulation(value) {
  const n = Math.max(0, Math.round(value ?? 0));
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(n);
}

/** Ulusun nüfusu (sahip olduğu province'ler). */
export function populationOf(world, nation) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id && province.econ) total += province.econ.population;
  }
  return total;
}

/** Geçen haftanın kapanmış fon hareketi (tahmin değil). */
export function weeklyBalanceOf(nation) {
  return nation?.economy?.ledger?.net ?? 0;
}

/**
 * Province'teki kabul edilmiş nüfusu toplama ekler (haftalık defter ve ekran
 * aynı formül). Toplam dışarıdan taşınır: toplama sırası eskisiyle birebir
 * aynı kalsın, kayan nokta sonucu (determinizm) değişmesin.
 */
function addAcceptedPeople(total, province, acceptedIds) {
  const people = province.econ.population;
  const rows = province.cultures?.length ? province.cultures : [{ id: province.culture, share: 1 }];
  for (const row of rows) if (acceptedIds.includes(row.id)) total += people * row.share;
  return total;
}

/**
 * Kabul edilmiş halkın payı, defteri beklemeden. İlk hafta kapanmadan
 * `economy.acceptedShare` yok ve ekran "Full citizens 100%" diyordu (gerçek
 * %86). Saf okuma; haftalık defter aynı alt formülü kullanır.
 */
export function acceptedShareOf(world, nation) {
  const acceptedIds = nation.accepted?.length ? nation.accepted : [nation.culture];
  let population = 0;
  let accepted = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    population += province.econ.population;
    accepted = addAcceptedPeople(accepted, province, acceptedIds);
  }
  return population > 0 ? accepted / population : 1;
}

/** Okuryazarlığın hedefe haftalık yaklaşma payı: 15 yılda açığın %63ü, 30 yılda %86sı. */
const LITERACY_RATE = 0.0013;

/** Ulusun ekonomi kaydı. Kayıttan gelen alanlar korunur, eksikler dolar. */
export function initNationEconomy(world, nation) {
  const economy = nation.economy ?? {};
  nation.economy = economy;
  economy.population ??= populationOf(world, nation);
  economy.literacy ??= START_LITERACY[clamp(nation.devTier ?? 0, 0, 2)];
  economy.resources ??= {};
  for (const id of RESOURCE_IDS) economy.resources[id] ??= emptyResourceRecord();
  economy.ledger ??= emptyLedger();
  economy.outputAvg ??= 0;
  economy.history ??= [];
  economy.blockade ??= 0;
  economy.coastal ??= false;
  economy.famineDeaths ??= 0;
  ensureIndustry(economy);
  nation.fund ??= 0;
  nation.embargoes ??= [];
  if (!economy.ledgerWeek) openWeek(nation);
  return economy;
}

/**
 * ÇAĞ KURULUŞU (era.js): kalkınma, kaleler, teçhizat deposu — kademeye göre.
 * Bir kez, `turns.start`ta. Fon sıfırdan başlar: ilk kademe ilk haftaların
 * yatırımıdır.
 */
export function initEconomy(world) {
  ensureMarket(world);
  for (const nation of world.nations) {
    initNationEconomy(world, nation);
    if (!nation.alive) continue;
    const own = (world.provinces ?? []).filter((p) => p.owner === nation.id && p.econ);
    if (!own.length) continue;
    const tier = clamp(nation.devTier ?? 0, 0, 2);
    const capital = world.provinces[nation.capital?.provinceId] ?? own[0];
    for (const province of own) {
      const bonus = START_DEVELOPMENT[tier] + (province === capital ? 1 + tier : 0);
      const dev = province.econ.development;
      province.econ.development = Math.max(dev, Math.min(START_DEVELOPMENT_CAP, dev + bonus));
    }
    // Kale haritanın sabit bir özelliğidir (inşa edilmez): başkent en az bir
    // kademe, kalanı kademe tablosuna göre en kalabalık state'lere.
    const ranked = [...own].sort((a, b) => (
      (b === capital) - (a === capital)
      || b.econ.population - a.econ.population
      || a.id - b.id));
    capital.econ.fort = Math.max(1, capital.econ.fort ?? 0);
    let forts = Math.round(own.length * START_FORT[tier]) - 1;
    for (const province of ranked) {
      if (forts <= 0) break;
      if (province === capital) continue;
      province.econ.fort = Math.min(3, (province.econ.fort ?? 0) + 1);
      forts--;
    }
    const units = own.reduce((sum, p) => sum + p.econ.population, 0) / POP_UNIT;
    const coastal = own.some((p) => p.coastal);
    const economy = nation.economy;
    economy.stock.rifles = 40 + units * START_STOCK.rifles[tier];
    economy.stock.guns = 4 + units * START_STOCK.guns[tier];
    economy.stock.ships = coastal ? 10 + units * START_STOCK.ships[tier] : 0;
    economy.population = populationOf(world, nation);
    nation.fund = 0;
    openWeek(nation);
  }
}

/** Yüklemede: eksik alanlar (kayıt şeması bu sürümün kendisidir). */
export function ensureEconomy(world) {
  ensureMarket(world);
  for (const nation of world.nations) initNationEconomy(world, nation);
  for (const province of world.provinces ?? []) {
    if (province.econ && !Number.isFinite(province.econ.fort)) province.econ.fort = 0;
  }
}

/**
 * Haftanın başı: abluka (deniz ticareti), değiştirici toplamları, savaş yükü.
 * `ctx` ulus döngüsüne taşınan ortak bilgidir.
 */
export function beginEconomy(game) {
  const world = game.world;
  const turn = game.turns?.turn ?? world.turn ?? 0;
  ensureMarket(world);
  computeBlockades(world);
  const occupied = new Float64Array(world.nations.length);
  const population = new Float64Array(world.nations.length);
  for (const province of world.provinces ?? []) {
    if (province.owner < 0 || !province.econ) continue;
    population[province.owner] += province.econ.population;
    occupied[province.owner] += province.econ.population * occupiedShareOf(world, province);
  }
  for (const nation of world.nations) {
    if (!nation.economy) initNationEconomy(world, nation);
    refreshModifiers(nation, turn);
    const economy = nation.economy;
    economy.occupiedShare = population[nation.id] > 0 ? occupied[nation.id] / population[nation.id] : 0;
    let fronts = 0;
    for (const other of world.nations) {
      if (other.alive && other.id !== nation.id
        && world.relations?.[nation.id]?.[other.id]?.state === 'war') fronts++;
    }
    economy.warFronts = fronts;
  }
  return { turn };
}

/** Okul faturası (IC/hafta): nüfus × yasanın birim bedeli. */
export function educationCost(nation) {
  return (nation.economy?.population ?? 0) / POP_UNIT * (lawOption(nation, 'education').cost ?? 0);
}

/**
 * Okuryazarlık hedefi: eğitim yasası + teknoloji. Okullar faturanın ödenen
 * payı kadar çalışır (ikmal krizinde hedef o oranda düşer).
 */
export function literacyTarget(world, nation) {
  const paid = nation.economy?.bills?.s ?? 1;
  return clamp((lawOption(nation, 'education').literacy + mod(nation, 'literacy')) * paid, 0.02, 0.98);
}

/**
 * ÇUBUK: haftanın çıktısının paylaşımı. Saf hesap; runNationEconomy uygular,
 * ekran aynı sonucu `economy.alloc`tan okur. `drawn` hatların fiilen çektiği
 * askerî IC'dir (tavanın altında kalabilir: depo doluysa hatlar durur).
 */
export function splitOutput({ output, billsPaid, armyCap, drawn, need, feed, investable }) {
  const free = Math.max(0, output - billsPaid);
  const army = Math.min(drawn, armyCap, free);
  let people = Math.min(feed * need, free - army);
  let invest = free - army - people;
  // Yatırılacak state yoksa (hepsi tavanda ya da işgalde) kalan halka döner.
  if (!investable) {
    people += invest;
    invest = 0;
  }
  return { output, bills: billsPaid, free, army, armyCap, people, invest };
}

export function runNationEconomy(game, nation, ctx) {
  const world = game.world;
  if (!nation.alive || !nation.economy) return;
  const economy = nation.economy;
  const turn = ctx.turn;

  // 1. Nüfus ve ortalama kalkınma.
  let population = 0;
  let devWeighted = 0;
  let soldiers = 0;
  let accepted = 0;
  const acceptedIds = nation.accepted?.length ? nation.accepted : [nation.culture];
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const people = province.econ.population;
    population += people;
    devWeighted += people * province.econ.development;
    soldiers += province.econ.soldiers ?? 0;
    accepted = addAcceptedPeople(accepted, province, acceptedIds);
  }
  economy.population = population;
  economy.soldiers = soldiers;
  // Kabul edilmiş halkın payı: milliyetçi desteği ve kimlik okur.
  economy.acceptedShare = population > 0 ? accepted / population : 1;
  economy.development = population > 0 ? devWeighted / population : 1;

  // 2. Kaynak üretimi. İmtiyaz (barış şartı): geçen hafta gelen yatak
  // kaynağı eklenir; borçlu ülkenin yatak üretiminin beşte biri gider.
  const produced = nationProduction(world, nation);
  for (const [id, amount] of Object.entries(economy.concessionIn ?? {})) produced[id] += amount;
  economy.concessionIn = {};
  economy.concessionOut = null;
  for (const treaty of treatiesOf(nation)) {
    if (treaty.type !== 'CONCESSION' || (treaty.until ?? Infinity) <= turn) continue;
    const out = {};
    for (const id of RESOURCE_IDS) {
      if (id === 'FOOD') continue;
      out[id] = produced[id] * CONCESSION_SHARE;
      produced[id] -= out[id];
    }
    economy.concessionOut = { partner: treaty.partner, resources: out };
    break;
  }
  const needs = emptyResourceMap();
  // İşgal altındaki halkı işgalci besler: o pay da ithal edilince savaştaki
  // gerçek iflasların neredeyse hepsi borç tavanına dayanmış gıda ithalatıydı.
  needs.FOOD = foodNeed(population * (1 - (economy.occupiedShare ?? 0)));
  // Gübre: gıda bonusu güherçile ister (bkz. SALTPETER_PER_FOOD).
  if (mod(nation, 'saltpeterFood') > 0) needs.SALTPETER += produced.FOOD * SALTPETER_PER_FOOD;

  // 3. Çıktı (el + sanayi + taç) ve sanayinin kaynak ihtiyacı.
  const ic = computeOutput(world, nation, turn);
  economy.ic = ic;
  needs.COAL += ic.coalNeed;
  needs.IRON += ic.ironNeed;
  needs.TIMBER += ic.timberNeed;
  needs.OIL += ic.oilNeed;

  // 4. Faturalar önden düşer.
  const bills = billsOf(world, nation, ic.output, turn);
  economy.bills = bills;

  // 5. Ordu: hatlar yasanın tavanına kadar sanayiden çeker, serbest çıktıyı
  // aşamaz. Çekilmeyen pay halka ve kalkınmaya kalır.
  const armyCap = Math.min(ic.military, Math.max(0, ic.output - bills.paid));
  runLines(nation, armyCap, ic.dockyards, needs);
  let drawn = 0;
  for (const id of EQUIPMENT_IDS) drawn += economy.lines[id].ic;

  // 6. Halk ve kalkınma.
  const { need, era } = consumerNeed(nation, population, turn);
  const feed = feedTarget(nation);
  const target = investmentTarget(world, nation);
  // Uygun state yoksa (hepsi tavanda) kalan halka döner, ama fon önce
  // FUND_RESERVE_WEEKS haftalık çıktılık yedeğe dolar: yoksa tavandaki ülkenin
  // fonuna hiç para girmez ve ithalat onu tabana çeker (audit:econ, tavan
  // bağlayınca fonu tabanda ulus-hafta %0.1 → %1.5).
  const investable = Boolean(target)
    || (nation.fund ?? 0) < FUND_RESERVE_WEEKS * Math.max(0, economy.outputAvg ?? 0);
  economy.investable = investable;
  const alloc = splitOutput({
    output: ic.output, billsPaid: bills.paid, armyCap, drawn, need, feed, investable,
  });
  economy.alloc = alloc;
  economy.consumer = { need, supply: alloc.people, ratio: need > 0 ? alloc.people / need : 1, feed, era };
  // Eski okuyucular için: sivil = halkın payı, dönen = tavanın çekilmeyen kısmı.
  ic.civil = alloc.people;
  ic.drawn = alloc.army;
  ic.returned = Math.max(0, armyCap - alloc.army);
  const efficiency = investEfficiency(nation);
  economy.investEfficiency = efficiency;
  investmentNeeds(alloc.invest, needs, turn);
  if (alloc.invest > 0) settle(nation, 'investment', alloc.invest * efficiency);

  // 7. Ordunun kaynak ihtiyacı.
  unitResourceNeeds(world, nation, needs);
  needs.SALTPETER += battleSaltpeterNeed(world, nation);

  // 8. Ticaret teklifi: fazla, yasanın payına kadar satılır; açık alınır.
  const exportShare = lawOption(nation, 'trade').export;
  for (const id of RESOURCE_IDS) {
    const record = economy.resources[id];
    record.produced = produced[id];
    record.need = needs[id];
    const surplus = produced[id] - needs[id];
    record.offered = surplus > 0 ? Math.min(surplus, produced[id] * exportShare) : 0;
    record.wanted = surplus < 0 ? -surplus : 0;
  }

  // 9. Okuryazarlık hedefe ORANSAL yaklaşır (zaman sabiti ~15 yıl: bir
  // nesil). Eskiden sabit ±0.0003/hafta adımdı ve hedef iki kolda da aynı
  // taraftayken yasa görünmezdi (audit:mechanics: ölü).
  const literacy = literacyTarget(world, nation);
  economy.literacyTarget = literacy;
  economy.literacy += (literacy - economy.literacy) * LITERACY_RATE;
}

/**
 * Haftanın kapanışı: ticaret, oranlar, kademe alımı, defter. Oran
 * `(üretim + ithalat − ihracat) / ihtiyaç`; ihtiyacı olmayan kaynak 1 sayılır.
 */
export function finishEconomy(game, ctx) {
  const world = game.world;
  const turn = ctx.turn;
  clearTrade(world, turn);
  // İmtiyaz akışı alana bir sonraki haftanın üretimine yazılır.
  for (const nation of world.nations) {
    const flow = nation.economy?.concessionOut;
    const holder = flow ? world.nations[flow.partner]?.economy : null;
    if (!holder) continue;
    holder.concessionIn ??= {};
    for (const [id, amount] of Object.entries(flow.resources)) {
      holder.concessionIn[id] = (holder.concessionIn[id] ?? 0) + amount;
    }
  }
  const raised = [];
  for (const nation of world.nations) {
    const economy = nation.economy;
    if (!economy || !nation.alive) continue;
    for (const id of RESOURCE_IDS) {
      const record = economy.resources[id];
      const available = record.produced + record.imported - record.exported;
      record.balance = available - record.need;
      record.ratio = record.need > 1e-9 ? clamp(available / record.need, 0, 1) : 1;
    }
    for (const province of buyDevelopment(world, nation)) raised.push(province);
    closeFund(nation, turn);
    economy.history.push({
      turn,
      population: Math.round(economy.population),
      fund: Math.round(nation.fund),
      ic: Number((economy.ic?.total ?? 0).toFixed(2)),
      output: Number((economy.ic?.output ?? 0).toFixed(2)),
    });
    if (economy.history.length > 104) economy.history.shift();
  }
  if (raised.length) {
    const tiles = [];
    for (const province of raised) {
      for (const idx of province.tileIdx ?? []) tiles.push(world.tiles[idx]);
    }
    game.renderer?.invalidateTiles?.(tiles.filter(Boolean), false);
  }
  game.emit?.('economy', null);
}

/** Haftanın fon defteri ve çıktı ortalaması (fon tabanı, YZ ve ekran okur). */
function closeFund(nation, turn) {
  const economy = nation.economy;
  closeWeek(nation, turn);
  const output = Math.max(0, economy.ic?.output ?? 0);
  economy.outputAvg = economy.outputAvg > 0 ? economy.outputAvg * 0.9 + output * 0.1 : output;
}

/**
 * Ekonomi ekranının döküm modeli: çubuk, faturalar, fon, IC, tüketim malı,
 * kaynaklar. Ekran bunu basar, formül kurmaz.
 */
export function economyView(world, nation) {
  const economy = nation.economy;
  const ledger = economy?.ledger ?? emptyLedger();
  return {
    fund: nation.fund ?? 0,
    fundFloor: fundFloor(nation),
    ledger,
    // İlk hafta kapanmadan defter boştur: ekran sıfırları "geçen hafta"
    // diye sunmasın.
    settled: Boolean(economy?.ledger?.lastUpdated),
    alloc: economy?.alloc ?? null,
    bills: economy?.bills ?? null,
    feed: economy?.feed ?? null,
    investTarget: economy?.investTarget ?? null,
    investEfficiency: economy?.investEfficiency ?? 1,
    developmentCap: developmentCap(nation),
    education: educationCost(nation),
    ic: economy?.ic,
    consumer: economy?.consumer,
    lines: economy?.lines,
    stock: economy?.stock,
    resources: economy?.resources,
    prices: world.market?.prices,
    blockade: economy?.blockade ?? 0,
    literacy: economy?.literacy ?? 0,
    literacyTarget: economy?.literacyTarget ?? 0,
  };
}

/** Teçhizat kimlikleri (ekranlar için yeniden ihraç). */
export { EQUIPMENT_IDS, addEquipment };
