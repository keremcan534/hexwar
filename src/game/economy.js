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
  BUILDINGS, BUILDING_IDS, CROWN_REVENUE, DEBT, EQUIPMENT_IDS, INFLATION, POP_UNIT, RESOURCE_IDS,
  SALTPETER_PER_FOOD, TAX_PER_DEVELOPMENT, TAX_PER_UNIT, UPKEEP,
} from './econ/defs.js';
import { lawOption } from './laws.js';
import { mod, refreshModifiers } from './modifiers.js';
import {
  battleSaltpeterNeed, emptyResourceMap, emptyResourceRecord, foodNeed,
  nationProduction, unitResourceNeeds, workforceShare,
} from './econ/resources.js';
import {
  addEquipment, autoLineWeights, computeIC, consumerGoods, consumerTaxBonus, ensureIndustry, runLines,
} from './econ/industry.js';
import { clearTrade, computeBlockades, ensureMarket } from './econ/trade.js';
import { closeWeek, emptyLedger, openWeek, settle } from './treasury.js';
import { buildingLevels, buildingSlots, emptyBuildings, occupiedShareOf } from './provinces.js';
import { fertilityOf } from './econ/deposits.js';
import { constructionResourceNeeds } from './construction.js';
import { treatiesOf } from './peace.js';
import { isDelegated } from './delegation.js';
import { focusBonus } from './focus.js';
import {
  START_BUILDINGS, START_DEVELOPMENT, START_DEVELOPMENT_CAP, START_GOLD, START_LITERACY, START_STOCK,
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

/** Geçen haftanın kapanmış net bakiyesi (tahmin değil). */
export function weeklyBalanceOf(nation) {
  return nation?.economy?.ledger?.net ?? 0;
}

/** Borç tavanı: haftalık gelirin katı, mutlak tabanla. */
export function debtCapacity(nation) {
  return Math.max(DEBT.capFloor, DEBT.capWeeks * Math.max(0, nation?.economy?.incomeAvg ?? 0));
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
 * Kuruluşta bir binayı sıralı province'lere kademe kademe dağıtır: önce her
 * uygun province'e birer kademe, sonra ikinciler. Yuva (kalkınma + 1), bina
 * tavanı ve binanın kendi şartları (kalkınma, kıyı, yatak) korunur — kuruluş
 * oyuncunun kendi kuramayacağı bir province bırakmaz.
 */
function placeBuildings(ranked, id, levels) {
  const info = BUILDINGS[id];
  let left = Math.round(levels);
  for (let level = 1; left > 0 && level <= info.max; level++) {
    let placed = false;
    for (const province of ranked) {
      if (left <= 0) break;
      const econ = province.econ;
      if ((econ.buildings[id] ?? 0) >= level) continue;
      if (buildingLevels(econ) >= buildingSlots(econ)) continue;
      if (info.minDevelopment && econ.development < info.minDevelopment) continue;
      if (info.coastal && !province.coastal) continue;
      if (info.needsDeposit && !province.deposits?.length) continue;
      econ.buildings[id] = (econ.buildings[id] ?? 0) + 1;
      left--;
      placed = true;
    }
    if (!placed) break;
  }
}

/**
 * ÇAĞ KURULUŞU (era.js): kalkınma, sanayi, demiryolu, maden, okul, kale,
 * tersane, teçhizat deposu ve hazine — kademeye göre. Bir kez, `turns.start`ta.
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
    // Sanayi kalkınmışa: önce başkent, sonra kalkınma ve nüfus sırası.
    const ranked = [...own].sort((a, b) => (
      (b === capital) - (a === capital)
      || b.econ.development - a.econ.development
      || b.econ.population - a.econ.population
      || a.id - b.id));
    const units = own.reduce((sum, p) => sum + p.econ.population, 0) / POP_UNIT;
    // Başkent kalesiz ve kışlasız kalmaz; kalan kademeler tabloya göre dağılır.
    capital.econ.buildings.fort = Math.max(1, capital.econ.buildings.fort ?? 0);
    capital.econ.buildings.barracks = Math.max(1, capital.econ.buildings.barracks ?? 0);
    const coastal = ranked.filter((p) => p.coastal);
    const fertile = [...own].sort((a, b) => fertilityOf(b) - fertilityOf(a) || a.id - b.id);
    // Kıyısı olan büyük ya da denizci ulus tersanesiz başlamaz (eski kural).
    const yardFloor = coastal.length && (units >= 10 || nation.coastal) ? 1 : 0;
    // Tablo sırası yerleşim sırasıdır (era.START_BUILDINGS): yuva önce gelene.
    const plan = {
      dockyard: [coastal, Math.max(yardFloor, coastal.length * START_BUILDINGS.dockyard[tier])],
      university: [ranked, own.length * START_BUILDINGS.university[tier]],
      factory: [ranked, Math.max(tier >= 1 ? 1 : 0, units * START_BUILDINGS.factory[tier])],
      railway: [ranked, own.length * START_BUILDINGS.railway[tier]],
      mine: [ranked, own.filter((p) => p.deposits?.length).length * START_BUILDINGS.mine[tier]],
      farm: [fertile, own.length * START_BUILDINGS.farm[tier]],
      fort: [ranked, own.length * START_BUILDINGS.fort[tier] - 1],
      barracks: [ranked, own.length * START_BUILDINGS.barracks[tier] - 1],
    };
    for (const id of Object.keys(START_BUILDINGS)) placeBuildings(plan[id][0], id, plan[id][1]);
    const economy = nation.economy;
    economy.stock.rifles = 40 + units * START_STOCK.rifles[tier];
    economy.stock.guns = 4 + units * START_STOCK.guns[tier];
    economy.stock.ships = coastal.length ? 10 + units * START_STOCK.ships[tier] : 0;
    economy.population = populationOf(world, nation);
    nation.gold = START_GOLD.base + Math.round(units * START_GOLD.perUnit);
    // Kuruluş hazinesi defterin açılış bakiyesidir: hafta initNationEconomy'de
    // 100 altınla açılmıştı, yeniden açılmazsa fark "uzlaşmamış" kalır.
    openWeek(nation);
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

/**
 * Bir state'in vergi tabanı (ulusal çarpanlardan önce). Silah altındaki vergi
 * vermez (econ/resources.js workforceShare); vergi odağı çarpar (focus.js).
 */
export function provinceTaxBase(econ) {
  return econ.population * workforceShare(econ) / POP_UNIT * TAX_PER_UNIT
    * (1 + TAX_PER_DEVELOPMENT * econ.development) * (econ.status ?? 1)
    * (1 + focusBonus(econ, 'tax'));
}

/** Haftalık vergi, dökümüyle (ekran aynı döküm fonksiyonunu okur). */
export function taxBreakdown(world, nation) {
  // Taç gelirleri devlet yaşadıkça akar. Başkente bağlıyken başkentini
  // barışta veren küçük devlet bir daha hiç kalkamıyordu: iflasların %74'ü
  // başkentsiz artık devletlerin tekrar tekrar batmasıydı (ölçüldü, 6 tohum).
  let base = CROWN_REVENUE;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    base += provinceTaxBase(province.econ);
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

/** Bina bakımı (altın/hafta): kademe başına BUILDINGS[*].upkeep. */
export function maintenanceCost(world, nation) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nation.id || !province.econ) continue;
    for (const id of BUILDING_IDS) {
      total += (province.econ.buildings?.[id] ?? 0) * (BUILDINGS[id].upkeep ?? 0);
    }
  }
  return total;
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
  // İşgal altındaki halkı işgalci besler: o pay da ithal edilince savaştaki
  // gerçek iflasların neredeyse hepsi borç tavanına dayanmış gıda ithalatıydı
  // (son 26 haftada ithalat altınının %75-83'ü; 43 → 13, 6 tohum).
  needs.FOOD = foodNeed(population * (1 - (economy.occupiedShare ?? 0)));
  // Gübre: gıda bonusu güherçile ister (bkz. SALTPETER_PER_FOOD).
  if (mod(nation, 'saltpeterFood') > 0) needs.SALTPETER += produced.FOOD * SALTPETER_PER_FOOD;

  // 3. IC ve tüketim malı.
  const ic = computeIC(world, nation);
  economy.ic = ic;
  needs.COAL += ic.coalNeed;
  needs.IRON += ic.ironNeed ?? 0;
  needs.TIMBER += ic.timberNeed ?? 0;
  needs.OIL += ic.oilNeed ?? 0;
  economy.consumer = consumerGoods(nation, {
    population, workforce: Math.max(0, population - soldiers),
    development: economy.development, civil: ic.civil, turn,
  });

  // 4. Üretim hatları (teçhizat stoğa girer; demir/kereste ihtiyacı yazılır).
  // Oyuncunun Auto hatları, ekonomi otomasyonu KAPALIYKEN de çalışsın: o
  // zaman kural burada (YZ ve devredilmiş oyuncu için ai.economyAI içinde).
  if (nation.id === game.turns?.playerNation && !isDelegated(nation, 'economy') && (turn + nation.id) % 4 === 0) {
    autoLineWeights(world, nation);
  }
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
  economy.maintenance = maintenanceCost(world, nation);
  settle(nation, 'maintenance', -economy.maintenance);
  if ((nation.debt ?? 0) > 0) settle(nation, 'interest', -nation.debt * DEBT.interest);

  // 8. Okuryazarlık hedefe ORANSAL yaklaşır (zaman sabiti ~15 yıl: bir
  // nesil). Eskiden sabit ±0.0003/hafta adımdı ve hedef iki kolda da aynı
  // taraftayken yasa görünmezdi: %9'luk ülke "okulsuz" (%12) ve "herkese
  // okul" (%75) altında AYNI hızla tırmanıyordu (audit:mechanics: ölü).
  const target = literacyTarget(world, nation);
  economy.literacyTarget = target;
  economy.literacy += (target - economy.literacy) * LITERACY_RATE;
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
/** Enflasyon rezervi: bunun üstündeki altın her hafta erir (bkz. INFLATION). */
export function inflationReserve(nation) {
  return Math.max(INFLATION.floor, INFLATION.reserveWeeks * Math.max(0, nation?.economy?.incomeAvg ?? 0));
}

function closeTreasury(nation, turn) {
  const economy = nation.economy;
  const bankrupt = (nation.bankruptUntil ?? 0) > turn;
  const idle = (nation.gold ?? 0) - inflationReserve(nation);
  if (idle > 0) settle(nation, 'inflation', -idle * INFLATION.rate);
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
    maintenance: economy?.maintenance ?? maintenanceCost(world, nation),
    inflationReserve: inflationReserve(nation),
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
