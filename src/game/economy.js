// EKONOMİ — haftalık kapanışın orkestrası (TASARIM.md §1-§8).
//
// Eski dosya 5.400 satırdı: 42 mal, 29 fabrika türü, üç sınıf, fiyat bandı,
// şirketler. Yerine gelen model altı kaynak, IC ve altındır; hesabın kendisi
// econ/ altındaki küçük dosyalardadır, burası yalnız SIRAYI tutar:
//
//   beginEconomy   abluka, değiştiriciler, savaş yükü
//   runNationEconomy (ulus başına) kaynak üretimi → IC → tüketim malı →
//                  hatlar → ihtiyaçlar → ticaret teklifi → vergi ve giderler
//   finishEconomy  dünya ticareti → oranlar → borç/iflas → defter kapanışı
//
// Kaynak oranının etkisi bir hafta gecikir (mal bir haftada gelir); döngüsüz
// ve deterministik kalmanın bedeli budur.

import {
  BUILDINGS, DEBT, EQUIPMENT_IDS, POP_UNIT, RESOURCE_IDS, TAX_PER_DEVELOPMENT,
  TAX_PER_UNIT, UPKEEP,
} from './econ/defs.js';
import { lawOption } from './laws.js';
import { mod, refreshModifiers } from './modifiers.js';
import {
  battleSaltpeterNeed, emptyResourceMap, emptyResourceRecord, foodNeed,
  nationProduction, unitResourceNeeds,
} from './econ/resources.js';
import {
  addEquipment, computeIC, consumerGoods, consumerTaxBonus, ensureIndustry, runLines,
} from './econ/industry.js';
import { clearTrade, computeBlockades, ensureMarket } from './econ/trade.js';
import { closeWeek, emptyLedger, openWeek, settle } from './treasury.js';
import { emptyBuildings, occupiedShareOf } from './provinces.js';
import { constructionResourceNeeds } from './construction.js';
import { treatiesOf } from './peace.js';

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

/** Geçen haftanın kapanmış net bakiyesi (tahmin değil). */
export function weeklyBalanceOf(nation) {
  return nation?.economy?.ledger?.net ?? 0;
}

/** Borç tavanı: haftalık gelirin katı, mutlak tabanla. */
export function debtCapacity(nation) {
  return Math.max(DEBT.capFloor, DEBT.capWeeks * Math.max(0, nation?.economy?.incomeAvg ?? 0));
}

/** Başlangıç okuryazarlığı: 1836'nın gelişmiş çekirdeği daha okur-yazar. */
const START_LITERACY = [0.08, 0.16, 0.28];
/** Nüfus birimi başına başlangıç fabrikası (gelişmişlik kademesine göre). */
const START_FACTORIES = [0.025, 0.05, 0.09];

/** Ulusun ekonomi kaydı. Kayıttan gelen alanlar korunur, eksikler dolar. */
export function initNationEconomy(world, nation) {
  const economy = nation.economy ?? {};
  nation.economy = economy;
  economy.population ??= populationOf(world, nation);
  economy.literacy ??= START_LITERACY[clamp(nation.devTier ?? 0, 0, 2)];
  economy.resources ??= {};
  for (const id of RESOURCE_IDS) economy.resources[id] ??= emptyResourceRecord();
  economy.ledger ??= emptyLedger();
  economy.incomeAvg ??= 0;
  economy.history ??= [];
  economy.blockade ??= 0;
  economy.coastal ??= false;
  economy.famineDeaths ??= 0;
  ensureIndustry(economy);
  nation.gold ??= 0;
  nation.debt ??= 0;
  nation.embargoes ??= [];
  if (!economy.ledgerWeek) openWeek(nation);
  return economy;
}

/**
 * 1836 kuruluşu: başkent kalkınması, ilk fabrikalar, kale, kışla, tersane,
 * başlangıç teçhizat deposu. Bir kez, `turns.start`ta.
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
    if (capital?.econ) {
      capital.econ.development = Math.min(6, capital.econ.development + 1 + tier);
      capital.econ.buildings.fort = 1;
      capital.econ.buildings.barracks = 1;
      if (tier >= 2) capital.econ.buildings.university = 1;
      if (tier >= 2) capital.econ.buildings.railway = 1;
    }
    const units = own.reduce((sum, p) => sum + p.econ.population, 0) / POP_UNIT;
    let factories = Math.round(units * START_FACTORIES[tier]);
    if (tier >= 1) factories = Math.max(1, factories);
    // Fabrikalar kalkınmışa: önce başkent, sonra kalkınma ve nüfus sırası.
    const ranked = [...own].sort((a, b) => (
      (b === capital) - (a === capital)
      || b.econ.development - a.econ.development
      || b.econ.population - a.econ.population
      || a.id - b.id));
    for (let pass = 0; pass < 2 && factories > 0; pass++) {
      for (const province of ranked) {
        if (factories <= 0) break;
        if (province.econ.development < BUILDINGS.factory.minDevelopment) continue;
        province.econ.buildings.factory++;
        factories--;
      }
    }
    const coastal = ranked.find((p) => p.coastal);
    if (coastal && (units >= 10 || nation.coastal)) coastal.econ.buildings.dockyard = 1;
    const economy = nation.economy;
    economy.stock.rifles = 40 + units * 1.0;
    economy.stock.guns = 4 + units * 0.1;
    economy.stock.ships = coastal ? 10 + units * 0.3 : 0;
    economy.population = populationOf(world, nation);
  }
}

/** Yüklemede: eksik alanlar (kayıt şeması bu sürümün kendisidir). */
export function ensureEconomy(world) {
  ensureMarket(world);
  for (const nation of world.nations) initNationEconomy(world, nation);
  for (const province of world.provinces ?? []) {
    if (province.econ && !province.econ.buildings) province.econ.buildings = emptyBuildings();
  }
}

/** Ulusun kara ve deniz alayı sayısı. */
function regimentsOf(world, nation) {
  let land = 0;
  let sea = 0;
  for (const unit of world.units ?? []) {
    if (unit.nationId !== nation.id) continue;
    const count = unit.regiments?.length ?? 1;
    if (unit.type?.domain === 'sea') sea += count;
    else land += count;
  }
  return { land, sea };
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

/** Haftalık vergi, dökümüyle (ekran aynı döküm fonksiyonunu okur). */
export function taxBreakdown(world, nation) {
  let base = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    const econ = province.econ;
    base += econ.population / POP_UNIT * TAX_PER_UNIT
      * (1 + TAX_PER_DEVELOPMENT * econ.development) * (econ.status ?? 1);
  }
  const law = lawOption(nation, 'tax').tax;
  const stability = 0.8 + 0.4 * clamp(nation.stability ?? 0.5, 0, 1);
  const consumer = 1 + consumerTaxBonus(nation.economy?.consumer?.ratio ?? 1);
  const mods = Math.max(0.2, 1 + mod(nation, 'tax'));
  return {
    base, law, stability, consumer, mods,
    total: base * law * stability * consumer * mods,
  };
}

/** Ordu ve donanma bakımı (altın/hafta). */
export function upkeepBreakdown(world, nation) {
  const { land, sea } = regimentsOf(world, nation);
  const war = (nation.economy?.warFronts ?? 0) > 0 ? UPKEEP.warMultiplier : 1;
  const mods = Math.max(0.3, 1 + mod(nation, 'upkeep'));
  return {
    land, sea, war,
    army: land * UPKEEP.land * war * mods,
    navy: sea * UPKEEP.sea * war * mods,
  };
}

/** Eğitim gideri (altın/hafta): nüfus × yasanın birim bedeli. */
export function educationCost(nation) {
  return (nation.economy?.population ?? 0) / POP_UNIT * (lawOption(nation, 'education').cost ?? 0);
}

/** Okuryazarlık hedefi: eğitim yasası + üniversite + teknoloji. */
export function literacyTarget(world, nation) {
  let universities = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner === nation.id) universities += province.econ?.buildings?.university ?? 0;
  }
  return clamp(lawOption(nation, 'education').literacy + Math.min(0.15, universities * 0.02)
    + mod(nation, 'literacy'), 0.02, 0.98);
}

export function runNationEconomy(game, nation, ctx) {
  const world = game.world;
  if (!nation.alive || !nation.economy) return;
  const economy = nation.economy;
  const turn = ctx.turn;

  // 1. Nüfus ve ortalama kalkınma (el tezgâhı için).
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
    const rows = province.cultures?.length ? province.cultures : [{ id: province.culture, share: 1 }];
    for (const row of rows) if (acceptedIds.includes(row.id)) accepted += people * row.share;
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
  needs.FOOD = foodNeed(population);

  // 3. IC ve tüketim malı.
  const ic = computeIC(world, nation);
  economy.ic = ic;
  needs.COAL += ic.coalNeed;
  economy.consumer = consumerGoods(nation, {
    population, development: economy.development, civil: ic.civil, turn,
  });

  // 4. Üretim hatları (teçhizat stoğa girer; demir/kereste ihtiyacı yazılır).
  runLines(nation, ic.military, ic.dockyards, needs);

  // 5. Ordu ve inşaat ihtiyacı.
  unitResourceNeeds(world, nation, needs);
  needs.SALTPETER += battleSaltpeterNeed(world, nation);
  constructionResourceNeeds(nation, needs);

  // 6. Ticaret teklifi: fazla, yasanın payına kadar satılır; açık alınır.
  const exportShare = lawOption(nation, 'trade').export;
  for (const id of RESOURCE_IDS) {
    const record = economy.resources[id];
    record.produced = produced[id];
    record.need = needs[id];
    const surplus = produced[id] - needs[id];
    record.offered = surplus > 0 ? Math.min(surplus, produced[id] * exportShare) : 0;
    record.wanted = surplus < 0 ? -surplus : 0;
  }

  // 7. Hazine: vergi, bakım, eğitim, faiz.
  const tax = taxBreakdown(world, nation);
  economy.tax = tax;
  settle(nation, 'tax', tax.total);
  const upkeep = upkeepBreakdown(world, nation);
  economy.upkeep = upkeep;
  settle(nation, 'army', -upkeep.army);
  settle(nation, 'navy', -upkeep.navy);
  settle(nation, 'education', -educationCost(nation));
  if ((nation.debt ?? 0) > 0) settle(nation, 'interest', -nation.debt * DEBT.interest);

  // 8. Okuryazarlık hedefe yavaşça (yılda ~%3) yaklaşır.
  const target = literacyTarget(world, nation);
  economy.literacyTarget = target;
  economy.literacy += clamp(target - economy.literacy, -0.0004, 0.0006);
}

/**
 * Haftanın kapanışı: ticaret, oranlar, borç ve iflas, defter. Oran
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
  for (const nation of world.nations) {
    const economy = nation.economy;
    if (!economy || !nation.alive) continue;
    for (const id of RESOURCE_IDS) {
      const record = economy.resources[id];
      const available = record.produced + record.imported - record.exported;
      record.balance = available - record.need;
      record.ratio = record.need > 1e-9 ? clamp(available / record.need, 0, 1) : 1;
    }
    closeTreasury(nation, turn);
    economy.history.push({
      turn,
      population: Math.round(economy.population),
      gold: Math.round(nation.gold),
      ic: Number((economy.ic?.total ?? 0).toFixed(2)),
      income: Number((economy.ledger?.income ?? 0).toFixed(2)),
    });
    if (economy.history.length > 104) economy.history.shift();
  }
  game.emit?.('economy', null);
}

/**
 * Borç ve iflas, sonra defter. Altın eksiye düşerse açık otomatik borçla
 * kapanır; fazla altının bir kısmı borcu öder. Borç tavanı aşılırsa İFLAS:
 * borç silinir, 52 hafta borç yok, istikrar ve ordu düzeni çöker
 * (politics/turn okur: `nation.bankruptUntil`).
 */
function closeTreasury(nation, turn) {
  const economy = nation.economy;
  const bankrupt = (nation.bankruptUntil ?? 0) > turn;
  if ((nation.gold ?? 0) < 0 && !bankrupt) {
    const borrow = -nation.gold;
    settle(nation, 'borrow', borrow);
    nation.debt = (nation.debt ?? 0) + borrow;
  } else if ((nation.gold ?? 0) > 50 && (nation.debt ?? 0) > 0) {
    const repay = Math.min(nation.debt, (nation.gold - 50) * 0.25);
    settle(nation, 'repay', -repay);
    nation.debt -= repay;
  }
  const ledger = closeWeek(nation, turn);
  const income = Math.max(0, ledger?.income ?? 0);
  economy.incomeAvg = economy.incomeAvg > 0 ? economy.incomeAvg * 0.9 + income * 0.1 : income;
  economy.debtCap = debtCapacity(nation);
  if (!bankrupt && (nation.debt ?? 0) > economy.debtCap) {
    nation.debt = 0;
    nation.bankruptUntil = turn + DEBT.bankruptcyWeeks;
    economy.bankruptcies = (economy.bankruptcies ?? 0) + 1;
    economy.justBankrupt = turn;
  }
}

/**
 * Ekonomi ekranının döküm modeli: altın satırları, IC dağılımı, tüketim malı,
 * kaynaklar. Ekran bunu basar, formül kurmaz.
 */
export function economyView(world, nation) {
  const economy = nation.economy;
  const ledger = economy?.ledger ?? emptyLedger();
  return {
    gold: nation.gold ?? 0,
    debt: nation.debt ?? 0,
    debtCap: economy?.debtCap ?? debtCapacity(nation),
    bankruptUntil: nation.bankruptUntil ?? 0,
    ledger,
    tax: economy?.tax ?? taxBreakdown(world, nation),
    upkeep: economy?.upkeep ?? upkeepBreakdown(world, nation),
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
