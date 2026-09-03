// Tek senaryoyu KENDI SURECINDE isletir ve olcumu JSON olarak basar.
//
// Neden ayri surec: units.js'teki `nextId` modul duzeyinde ve dunyalar arasinda
// sifirlanmiyor; command.js:723 ise `(turn + unit.id) % cadence` ile hangi
// tumenin o hafta hareket edecegine karar veriyor. Ayni surecte kurulan ikinci
// dunya, ayni tohumla bile FARKLI bir oyun olur (olculdu: ayni senaryonun iki
// kosusu 585K ve 954K nufusla bitti). Karsilastirmali olcum icin her senaryo
// temiz bir surecte baslamak zorunda.
//
// Kullanim:  node scenario-runner.mjs '<json-spec>'

import {
  headless, run, runPeaceful, snapshotNation, cohortSummary, marketSnapshot,
  scanInvariants,
} from './harness.mjs';
import {
  FACTORIES, factoryJobs, factoryMargin, priceOf, setBudgetPolicy, BUDGET_POLICIES,
} from '../../src/game/economy.js';
import { RGO_TYPES } from '../../src/game/provinces.js';
import { rulingParty } from '../../src/game/politics.js';
import { battleUnitPower } from '../../src/game/battles.js';
import { reinforcementNeed } from '../../src/game/reinforcement.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { declareWar } from '../../src/game/diplomacy.js';
import { ensureConstruction, queueConstruction, constructionAtlas, constructionPower } from '../../src/game/construction.js';

const spec = JSON.parse(process.argv[2]);

// --------------------------------------------------------------- OLCULEN ---

function chooseNation(game, mode) {
  const list = game.world.nations.filter((n) => n.alive && n.economy);
  if (typeof mode === 'number') return game.world.nations[mode];
  if (mode === 'protectionist') {
    return list.find((n) => rulingParty(n)?.policies?.trade === 'protectionism') ?? list[0];
  }
  if (mode === 'first') return list[0];
  // varsayilan: en cok fabrikasi olan (en zengin ekonomik sinyal)
  return list.sort((a, b) => (b.economy.factories?.length ?? 0) - (a.economy.factories?.length ?? 0))[0];
}

// --------------------------------------------------------------- MUTASYON ---
// Seri hale getirilemeyen kod bloklari burada, adlandirilmis olarak durur.

const MUTATIONS = {
  /** Bir malin dunya RGO uretimini carpar (0 = tamamen kes). */
  rgoScale(game, { goodId, factor }) {
    // Kume dongusu: kare basina `*=` uye sayisi kadar tekrar uygulaniyordu.
    for (const province of game.world.provinces ?? []) {
      const rgo = RGO_TYPES[province.econ?.rgo];
      if (rgo?.goodId === goodId) province.econ.rgoQuality *= factor;
    }
  },
  /** Belirli mallari ureten fabrikalarin kadrosunu carpar. */
  factoryScale(game, { goodId, factor }) {
    for (const n of game.world.nations) {
      for (const f of n.economy?.factories ?? []) {
        if (Object.keys(FACTORIES[f.typeId].outputs).includes(goodId)) f.employees *= factor;
      }
    }
  },
  /** Kasten zararli tesisler kurar ve destekler. */
  badFactories(game, { nationId, count = 4, level = 5 }) {
    const nation = game.world.nations[nationId];
    const city = game.world.cities.find((c) => c.nationId === nationId);
    if (!city) return;
    const worst = Object.keys(FACTORIES)
      .map((typeId) => ({ typeId, m: factoryMargin(game.world, typeId) }))
      .sort((a, b) => a.m - b.m).slice(0, count);
    for (const { typeId } of worst) {
      nation.economy.factories.push({
        id: `audit-${typeId}`, typeId, q: city.tile.q, r: city.tile.r,
        level, employees: level * 2000, profit: 0, margin: 0, throughput: 0,
        fundedBy: 'state', subsidized: true,
        ...(typeId === 'ARMS_FACTORY' ? { lineEquipment: 'arms', lineEfficiency: 1, lineOutput: 0 } : {}),
      });
    }
  },
  /** Butun fabrikalari destekle. */
  subsidizeAll(game, { nationId }) {
    for (const f of game.world.nations[nationId].economy.factories) f.subsidized = true;
  },
  /** Hazineyi bir degere sabitler. */
  setGold(game, { nationId, gold }) {
    game.world.nations[nationId].gold = gold;
  },
  /** Butun piyasa fiyatlarini bir degere sabitler. */
  setPrices(game, { price }) {
    for (const state of Object.values(game.world.market.goods)) {
      state.price = price;
      state.previousPrice = price;
    }
  },
  /** Piyasa arz/talebini bir degere sabitler. */
  setMarketFlow(game, { supply, demand }) {
    for (const state of Object.values(game.world.market.goods)) {
      if (supply != null) state.supply = supply;
      if (demand != null) state.demand = demand;
    }
  },
  /** Ulkenin butun fabrikalarini siler. */
  wipeFactories(game, { nationId }) {
    game.world.nations[nationId].economy.factories = [];
  },
  /** Fabrikalari cogaltir (yuzlerce tesis senaryosu). */
  cloneFactories(game, { nationId, copies }) {
    const nation = game.world.nations[nationId];
    const base = [...nation.economy.factories];
    if (!base.length) return;
    for (let c = 0; c < copies; c++) {
      for (const f of base) {
        nation.economy.factories.push({ ...f, id: `${f.id}-clone${c}` });
      }
    }
  },
  /** Province nufuslarini asker alim tabanina indirir (insan gucu ~0). */
  drainManpower(game, { nationId }) {
    // Taban hex basina olceklenir; kume nufusu tam tabana cekilir.
    for (const province of game.world.provinces ?? []) {
      if (province.owner === nationId && province.econ) {
        province.econ.population = 2000 * (province.econ.hexes ?? 1);
      }
    }
  },
  /** Province nufusunu hex basina sabit degere ceker (eski kalibrasyonla ayni). */
  setProvincePopulation(game, { nationId, population }) {
    for (const province of game.world.provinces ?? []) {
      if (province.owner === nationId && province.econ) {
        province.econ.population = population * (province.econ.hexes ?? 1);
      }
    }
  },
  /** Butun province nufuslarini carpar. */
  populationScale(game, { factor }) {
    // Kume dongusu: kare basina carpan uye sayisi kadar tekrar uygulaniyordu.
    for (const province of game.world.provinces ?? []) {
      if (!province.econ) continue;
      province.econ.population = Math.max(0, Math.round(province.econ.population * factor));
    }
  },
  /** Insaat kapasitesi seviyesi verir (bedava: kapasitenin etkisini izole etmek icin). */
  grantConstructionSectors(game, { nationId, count }) {
    const nation = game.world.nations[nationId];
    const state = ensureConstruction(nation);
    state.capacity.construction += count;
  },
  /** Izlenen ulkeye savas acar (en yakin temasli komsu). */
  forceWar(game, { nationId, foes = 1 }) {
    const world = game.world;
    let opened = 0;
    for (const other of world.nations) {
      if (opened >= foes) break;
      if (!other.alive || other.id === nationId) continue;
      if (world.relations[nationId]?.[other.id]?.state === 'war') continue;
      // Sinir komsusu olsun ki cepheler gercekten temas etsin.
      const touching = world.tiles.some((t) => t.owner === nationId
        && world.neighbors(t).some((nb) => nb.owner === other.id));
      if (!touching) continue;
      declareWar(game, nationId, other.id);
      opened++;
    }
  },
  /** Butun tumenlerin gucunu kirpar: takviye sistemi olculebilsin. */
  damageArmy(game, { nationId, ratio = 0.5 }) {
    for (const unit of game.world.units) {
      if (unit.nationId !== nationId) continue;
      for (const r of unit.regiments ?? []) {
        r.strength = Math.max(1, Math.round(r.maxStrength * ratio));
        r.organization = 50;
        r.morale = 50;
      }
    }
  },
  /** Butun askeri stoku sifirlar (mumkun oldugunca ikmalsiz ordu). */
  stripEquipment(game, { nationId }) {
    const military = game.world.nations[nationId].economy.military;
    for (const id of Object.keys(military)) {
      if (RGO_TYPES[id]) continue;
      if (['arms', 'artillery', 'tanks', 'airplane', 'steamers'].includes(id)) military[id] = 0;
    }
    military.supplyIndex = 0;
  },
  /** Askeri stoku tavana doldurur. */
  floodEquipment(game, { nationId }) {
    const military = game.world.nations[nationId].economy.military;
    for (const id of ['arms', 'artillery', 'tanks', 'airplane', 'steamers']) military[id] = 40;
    military.supplyIndex = 1;
  },
  /** Dunyada muhimmat/silah uretimini durdurur. */
  killMilitaryIndustry(game) {
    for (const n of game.world.nations) {
      for (const f of n.economy?.factories ?? []) {
        if (['ARMS_FACTORY', 'AMMUNITION_FACTORY'].includes(f.typeId)) f.employees = 0;
      }
    }
  },
  /** Fabrika kadrosunu zorla tam/bos tutar. */
  pinEmployment(game, { nationId, fill }) {
    for (const f of game.world.nations[nationId].economy.factories) {
      f.employees = factoryJobs(f) * fill;
    }
  },
};

// ------------------------------------------------------------- KALDIRACLAR ---

function applyLevers(nation, levers) {
  for (const l of levers ?? []) {
    if (l.raw) {
      // Politika bandini asan SINIR testleri icin dogrudan yazim.
      nation.economy[l.key] = l.value;
    } else {
      // Denetimler kaldiraci `{key:'social', classId:'education'}` ya da
      // `{key:'tax', classId:'lower'}` bicimiyle de verir; setBudgetPolicy
      // yalniz duz politika adini tanir. Eskiden bu satir sessizce false
      // donuyordu ve egitim 0/50/100 senaryolari birebir ayni cikiyordu.
      const policy = l.key === 'social' && l.classId ? l.classId
        : l.key === 'tax' && l.classId
          ? `tax${l.classId[0].toUpperCase()}${l.classId.slice(1)}`
          : l.key;
      // setBudgetPolicy degismeyen degerde de false doner; hata yalniz
      // TANINMAYAN politika icindir.
      if (!BUDGET_POLICIES.includes(policy) && policy !== 'armySpending') {
        throw new Error(`kaldirac uygulanamadi: ${JSON.stringify(l)} (politika ${policy})`);
      }
      setBudgetPolicy(nation, policy, l.value);
    }
  }
}

// ------------------------------------------------------------------ KOSU ---

const game = headless(spec.seed, spec.worldOptions ?? {});
const warmup = spec.warmup ?? 60;
if (spec.peacefulWarmup) runPeaceful(game, warmup);
else run(game, warmup);

const nation = chooseNation(game, spec.nation ?? 'factories');
if (spec.asPlayer !== false) game.turns.playerNation = nation.id;

for (const m of spec.mutations ?? []) {
  MUTATIONS[m.name](game, { nationId: nation.id, ...(m.args ?? {}) });
}
applyLevers(nation, spec.levers);

const trace = [];
const violations = [];
const weeks = spec.weeks ?? 0;
const step = spec.peaceful ? runPeaceful : run;
for (let i = 0; i < weeks; i++) {
  step(game, 1);
  // Kaldiraclar her hafta tazelenir: applyGovernmentLimits ve secim kaydiraci
  // partinin bandina geri kirpar, YZ ise oyuncu olmayan ulkede zaten oynatir.
  if (spec.reapply !== false) applyLevers(nation, spec.levers);
  for (const m of spec.repeatMutations ?? []) {
    MUTATIONS[m.name](game, { nationId: nation.id, ...(m.args ?? {}) });
  }
  if (spec.watchInvariants) violations.push(...scanInvariants(game.world));
  if (spec.trace && (i + 1) % spec.trace === 0) {
    trace.push({ week: game.world.turn, ...snapshotNation(game.world, nation) });
  }
}

// ----------------------------------------------------------------- OLCUM ---

const world = game.world;
const out = {
  seed: spec.seed,
  label: spec.label ?? '',
  nationId: nation.id,
  turn: world.turn,
  snap: snapshotNation(world, nation),
  cohorts: cohortSummary(world, nation),
};

if (spec.measure?.includes('market')) out.market = marketSnapshot(world);
if (spec.measure?.includes('trace')) out.trace = trace;
if (spec.measure?.includes('invariants')) {
  const seen = new Set();
  out.violations = violations.filter((v) => {
    const k = `${v.system}|${v.nationId}|${v.field}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 40);
}
if (spec.measure?.includes('war')) {
  const foes = world.nations.filter((n) => n.alive && n.id !== nation.id
    && world.relations[nation.id]?.[n.id]?.state === 'war');
  let occupiedByUs = 0;
  let occupiedFromUs = 0;
  world.forEach((t) => {
    if (!t.terrain.passable || t.owner < 0) return;
    const controller = t.controller ?? t.owner;
    if (controller === nation.id && t.owner !== nation.id) occupiedByUs++;
    if (t.owner === nation.id && controller !== nation.id) occupiedFromUs++;
  });
  out.war = {
    foes: foes.map((f) => f.id),
    battles: (world.battleSystem?.battles ?? []).filter(
      (b) => b.attackerNation === nation.id || b.defenderNation === nation.id,
    ).length,
    occupiedByUs,
    occupiedFromUs,
    tiles: nation.tiles,
  };
}
if (spec.measure?.includes('army')) {
  const units = world.units.filter((u) => u.nationId === nation.id && u.type.domain === 'land');
  out.army = {
    power: units.reduce((s, u) => s + battleUnitPower(world, u, false, 0), 0),
    defensePower: units.reduce((s, u) => s + battleUnitPower(world, u, true, 0), 0),
    organization: units.flatMap((u) => u.regiments ?? [])
      .reduce((s, r, _, a) => s + (r.organization ?? 0) / a.length, 0),
    strengthRatio: units.length
      ? units.flatMap((u) => u.regiments ?? []).reduce((s, r, _, a) => s + r.strength / r.maxStrength / a.length, 0)
      : 0,
    need: reinforcementNeed(world, nation),
    manpower: nationManpower(world, nation.id),
    units: units.length,
  };
}
if (spec.measure?.includes('factories')) {
  out.factories = nation.economy.factories.map((f) => ({
    id: f.id, typeId: f.typeId, level: f.level, employees: f.employees,
    jobs: factoryJobs(f), throughput: f.throughput, profit: f.profit,
    subsidized: !!f.subsidized, subsidyPaid: f.subsidyPaid ?? 0,
    inputFulfillment: f.inputFulfillment ?? 1,
  }));
}
if (spec.measure?.includes('construction')) {
  const state = ensureConstruction(nation);
  out.construction = {
    power: constructionPower(nation),
    projects: state.projects.map((p) => ({
      id: p.id, kind: p.kind, typeId: p.typeId, work: p.work,
      progress: p.progress, cost: p.cost, funded: p.funded,
    })),
    buildings: state.buildings.length,
    sectors: state.capacity.construction ?? 0,
    education: state.capacity.education ?? 0,
    upkeep: nation.economy.constructionUpkeep ?? 0,
  };
}
if (spec.measure?.includes('nations')) {
  out.nations = world.nations.filter((n) => n.alive && n.economy)
    .map((n) => snapshotNation(world, n));
}
if (spec.measure?.includes('control')) {
  let sum = 0;
  let count = 0;
  world.forEach((t) => {
    if (t.owner === nation.id && t.province) { sum += t.province.control; count++; }
  });
  out.control = count ? sum / count : 0;
}
if (spec.measure?.includes('trade')) {
  const flow = nation.economy.goodsFlow;
  const ids = Object.keys(world.market.goods);
  let inputSpend = 0;
  let inputSpendTariffed = 0;
  for (const f of nation.economy.factories ?? []) {
    for (const [id, amount] of Object.entries(FACTORIES[f.typeId].inputs)) {
      const qty = amount * (f.throughput ?? 0);
      const share = Math.max(0, Math.min(1, flow?.[id]?.importShare ?? 0));
      inputSpend += priceOf(world, id) * qty;
      inputSpendTariffed += priceOf(world, id) * qty * (1 + (nation.economy.tariff / 100) * share);
    }
  }
  const demand = ids.reduce((s, id) => s + (flow[id]?.demand ?? 0), 0);
  const shortage = ids.reduce((s, id) => s + (flow[id]?.shortage ?? 0), 0);
  out.trade = {
    inputSpend,
    inputSpendTariffed,
    importShareAvg: ids.reduce((s, id) => s + (flow[id]?.importShare ?? 0), 0) / ids.length,
    demand,
    shortage,
    fulfilled: demand > 0 ? 1 - shortage / demand : 1,
    priceIndex: ids.reduce((s, id) => s + priceOf(world, id) / world.market.goods[id].price
      * 0 + priceOf(world, id), 0),
  };
}
if (spec.measure?.includes('prices')) {
  out.prices = Object.fromEntries(Object.keys(world.market.goods)
    .map((id) => [id, priceOf(world, id)]));
}

process.stdout.write(JSON.stringify(out));
