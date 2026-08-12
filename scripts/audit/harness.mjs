// Ortak denetim tezgahi.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz. Yaptigi
// tek sey: ayni tohumla bassiz bir dunya kurmak, haftalari isletmek ve
// sonuclari karsilastirilabilir sayilara indirmek.
//
// Tasarim kurali: her olcum ayni tohumdan baslar, tek degisken oynatilir.
// Iki kosunun farki yalnizca o degiskene atfedilebilir olmali.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Game } from '../../src/game/game.js';
import { TurnManager } from '../../src/game/turn.js';
import { generateWorld } from '../../src/world/worldgen.js';
import { generateNations } from '../../src/world/nations.js';
import {
  FACTORIES, GOOD_IDS, GOODS, MILITARY_EQUIPMENT_IDS, factoryJobs,
  industrialJobs, populationOf, priceOf,
} from '../../src/game/economy.js';
import { nationCohorts, summarize } from '../../src/game/population.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { regimentCount, soldiersOf } from '../../src/game/units.js';
import { atWar } from '../../src/game/diplomacy.js';
import { ensureConstruction } from '../../src/game/construction.js';

/** Bassiz oyun. DOM, zamanlayici, cizim yok; simulasyon tam calisir. */
export function headless(seed, options = {}) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed, options);
  generateNations(game.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    hovered: null, marquee: null, reachable: null,
    autosaveEnabled: false, dirty: false, frameHandle: 0,
    peaceOffers: [], nextPeaceOfferId: 1,
    listeners: {},
    notifications: { push() {} },
    renderer: { invalidateCache() {}, resize() {} },
    camera: { setBounds() {}, fit() {}, centerOn() {} },
    clock: { speed: 0, accumulator: 0, lastTime: 0, day: 0 },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  // -1 = hicbir ulke oyuncu degil; butun ulkeler YZ olarak isler.
  game.turns.playerNation = -1;
  return game;
}

export function run(game, weeks) {
  for (let i = 0; i < weeks; i++) game.turns.endTurn();
  return game;
}

/**
 * Savassiz kosu. Ekonomik kaldirac olcerken zorunlu: savas topragi degistirir,
 * toprak nufusu degistirir, nufus her seyi degistirir. O zaman iki kosu
 * arasindaki fark artik kaldiraca degil, kimin kimi fethettigine baglanir
 * (olculdu: ayni refah testinin iki seviyesi 575K ve 954K nufusla bitiyordu).
 *
 * Iliskiler her haftanin sonunda barisa cekilir; ilan edilen savas ayni hafta
 * soner, ordu yerinde kalir, sinirlar sabit kalir.
 */
export function runPeaceful(game, weeks) {
  const world = game.world;
  for (let i = 0; i < weeks; i++) {
    game.turns.endTurn();
    for (let a = 0; a < world.nations.length; a++) {
      for (let b = a + 1; b < world.nations.length; b++) {
        const rec = world.relations[a]?.[b];
        if (rec && rec.state === 'war') rec.state = 'peace';
      }
    }
    if (world.battleSystem?.battles?.length) {
      for (const battle of world.battleSystem.battles) {
        for (const id of [...battle.attackers, ...battle.defenders]) {
          const unit = world.units.find((u) => u.id === id);
          if (unit) unit.battleId = null;
        }
      }
      world.battleSystem.battles = [];
    }
  }
  return game;
}

/** Denetim ozgesi: en cok fabrikasi olan canli ulke (en zengin sinyal). */
export function pickNation(game) {
  return game.world.nations
    .filter((n) => n.alive && n.economy)
    .sort((a, b) => (b.economy.factories?.length ?? 0) - (a.economy.factories?.length ?? 0))[0];
}

/** Ulkeyi oyuncu yapar: YZ maliye/sosyal kaydiraclarini geri surukleyemez. */
export function asPlayer(game, nation) {
  game.turns.playerNation = nation.id;
  return nation;
}

export const alive = (game) => game.world.nations.filter((n) => n.alive && n.economy);

// ------------------------------------------------------------- OLCUMLER ---

/** Bir ulkenin genis kesiti. Butun denetimler ayni sozlugu kullanir. */
export function snapshotNation(world, nation) {
  const e = nation.economy ?? {};
  const L = e.ledger ?? {};
  const cls = e.classes ?? {};
  const factories = e.factories ?? [];
  const employees = factories.reduce((s, f) => s + (f.employees ?? 0), 0);
  const jobs = industrialJobs(nation);
  const units = world.units.filter((u) => u.nationId === nation.id);
  const landRegiments = units
    .filter((u) => u.type.domain === 'land')
    .reduce((s, u) => s + regimentCount(u), 0);
  const trade = e.trade ?? {};
  const mil = e.military ?? {};
  return {
    id: nation.id,
    name: nation.name,
    turn: world.turn,
    gold: nation.gold ?? 0,
    debt: nation.debt ?? 0,
    tiles: nation.tiles ?? 0,
    population: e.population ?? 0,
    cohortPopulation: e.cohortPopulation ?? 0,
    // --- defter ---
    income: L.income ?? 0,
    expenses: L.expenses ?? 0,
    net: L.net ?? 0,
    taxRevenue: L.taxRevenue ?? 0,
    tariffRevenue: L.tariffRevenue ?? 0,
    cityRevenue: L.cityRevenue ?? 0,
    socialCost: L.socialCost ?? 0,
    armyCost: L.armyCost ?? 0,
    procurementCost: L.procurementCost ?? 0,
    subsidyCost: L.subsidyCost ?? 0,
    interestCost: L.interestCost ?? 0,
    constructionCost: L.constructionCost ?? 0,
    administrationCost: L.administrationCost ?? 0,
    importCost: L.importCost ?? 0,
    borrowed: L.borrowed ?? 0,
    repaid: L.repaid ?? 0,
    defaulted: L.defaulted ?? 0,
    creditPenalty: L.creditPenalty ?? 0,
    // --- politika ---
    taxLower: e.taxes?.lower ?? 0,
    taxMiddle: e.taxes?.middle ?? 0,
    taxUpper: e.taxes?.upper ?? 0,
    tariff: e.tariff ?? 0,
    education: e.social?.education ?? 0,
    health: e.social?.health ?? 0,
    welfare: e.social?.welfare ?? 0,
    militaryWages: e.militaryWages ?? 0,
    militaryProcurement: e.militaryProcurement ?? 0,
    adminFunding: e.adminFunding ?? 0,
    // --- sinif haneleri ---
    lowerPop: cls.lower?.population ?? 0,
    middlePop: cls.middle?.population ?? 0,
    upperPop: cls.upper?.population ?? 0,
    lowerIncome: cls.lower?.income ?? 0,
    lowerTax: cls.lower?.taxPaid ?? 0,
    lowerBudget: cls.lower?.needsBudget ?? 0,
    lowerCost: cls.lower?.needsCost ?? 0,
    // needsCost ISTENEN sepettir; needsSpent fiilen alinandir. Ikisini ayirmak
    // sart: duzeltme oncesi olcumde "sepet" degismiyor gorunuyordu cunku
    // istenen sepet zaten butceden bagimsizdi.
    lowerSpent: cls.lower?.needsSpent ?? cls.lower?.needsCost ?? 0,
    lowerMet: cls.lower?.needsMet ?? 1,
    needsMet: e.needsMet ?? 1,
    lowerSat: cls.lower?.satisfaction ?? 0,
    middleBudget: cls.middle?.needsBudget ?? 0,
    middleCost: cls.middle?.needsCost ?? 0,
    upperBudget: cls.upper?.needsBudget ?? 0,
    upperCost: cls.upper?.needsCost ?? 0,
    upperSat: cls.upper?.satisfaction ?? 0,
    stability: e.stability ?? 0,
    standardOfLiving: e.standardOfLiving ?? 0,
    privateCapital: nation.politics?.privateCapital ?? 0,
    // --- sanayi ---
    factories: factories.length,
    factoryLevels: factories.reduce((s, f) => s + (f.level ?? 0), 0),
    employees,
    jobs,
    fill: jobs > 0 ? employees / jobs : 1,
    factoryProfit: e.factoryProfit ?? 0,
    gdp: e.gdp ?? 0,
    subsidized: factories.filter((f) => f.subsidized).length,
    // --- ticaret ---
    imports: trade.imports ?? 0,
    exports: trade.exports ?? 0,
    importValue: trade.importValue ?? 0,
    exportValue: trade.exportValue ?? 0,
    // --- ordu ---
    units: units.length,
    regiments: landRegiments,
    soldiers: units.reduce((s, u) => s + soldiersOf(u), 0),
    manpower: nationManpower(world, nation.id),
    supplyIndex: mil.supplyIndex ?? 1,
    arms: mil.arms ?? 0,
    reinforced: mil.reinforced ?? 0,
    reinforcementDemand: mil.reinforcementDemand ?? 0,
    // --- insaat ---
    projects: ensureConstruction(nation).projects.length,
    buildings: ensureConstruction(nation).buildings.length,
    atWar: world.nations.some((o) => o.alive && o.id !== nation.id && atWar(world, nation.id, o.id)),
  };
}

/** POP kohort ozeti: ihtiyac karsilanmasi ve istihdam gercekten oradan okunur. */
export function cohortSummary(world, nation) {
  return summarize(nationCohorts(world, nation));
}

export function marketSnapshot(world) {
  const out = {};
  for (const id of GOOD_IDS) {
    const g = world.market.goods[id];
    out[id] = {
      price: g.price,
      base: GOODS[id].basePrice,
      ratio: g.price / GOODS[id].basePrice,
      supply: g.supply,
      demand: g.demand,
      atCeiling: g.price >= GOODS[id].basePrice * 8 - 1e-6,
      atFloor: g.price <= GOODS[id].basePrice * 0.12 + 1e-6,
    };
  }
  return out;
}

// ------------------------------------------------------------ DEGISMEZLER ---

/**
 * Her hafta calisabilen degismez taramasi. Ihlali oldugu yerde yakalar:
 * hafta, ulke, sistem, deger.
 */
export function scanInvariants(world) {
  const bad = [];
  const push = (system, nationId, field, value, note = '') => bad.push({
    turn: world.turn, nationId, system, field, value, note,
  });
  const finite = (v) => Number.isFinite(v);

  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const e = nation.economy;
    if (!e) continue;
    if (!finite(nation.gold)) push('treasury', nation.id, 'gold', nation.gold);
    if (!finite(nation.debt ?? 0)) push('debt', nation.id, 'debt', nation.debt);
    if ((nation.debt ?? 0) < 0) push('debt', nation.id, 'debt<0', nation.debt);
    if (!finite(e.population) || e.population < 0) push('population', nation.id, 'population', e.population);
    for (const [cid, c] of Object.entries(e.classes ?? {})) {
      if (!finite(c.population) || c.population < 0) push('population', nation.id, `class.${cid}`, c.population);
      if (!finite(c.satisfaction)) push('population', nation.id, `sat.${cid}`, c.satisfaction);
      if (!finite(c.needsBudget)) push('population', nation.id, `budget.${cid}`, c.needsBudget);
      if (c.needsBudget < 0) push('population', nation.id, `budget<0.${cid}`, c.needsBudget);
    }
    for (const f of e.factories ?? []) {
      if (!finite(f.employees) || f.employees < 0) push('factory', nation.id, `${f.typeId}.employees`, f.employees);
      if (f.employees > factoryJobs(f) + 1e-6) {
        push('factory', nation.id, `${f.typeId}.overstaffed`, f.employees, `jobs=${factoryJobs(f)}`);
      }
      if (!finite(f.profit)) push('factory', nation.id, `${f.typeId}.profit`, f.profit);
      if (!finite(f.level) || f.level < 1) push('factory', nation.id, `${f.typeId}.level`, f.level);
    }
    for (const id of MILITARY_EQUIPMENT_IDS) {
      const v = e.military?.[id];
      if (!finite(v) || v < 0) push('military', nation.id, `stock.${id}`, v);
    }
    const mp = nationManpower(world, nation.id);
    if (!finite(mp) || mp < 0) push('military', nation.id, 'manpower', mp);
    for (const [k, v] of Object.entries(e.ledger ?? {})) {
      if (!finite(v)) push('ledger', nation.id, k, v);
    }
    for (const p of ensureConstruction(nation).projects) {
      if (!finite(p.progress) || p.progress < 0) push('construction', nation.id, 'progress', p.progress);
      if (!finite(p.work) || p.work <= 0) push('construction', nation.id, 'work', p.work);
      if (!finite(p.funded) || p.funded < 0) push('construction', nation.id, 'funded', p.funded);
    }
    if (!finite(e.tariff)) push('trade', nation.id, 'tariff', e.tariff);
    for (const [cid, v] of Object.entries(e.taxes ?? {})) {
      if (!finite(v) || v < 0 || v > 100) push('tax', nation.id, `tax.${cid}`, v);
    }
  }

  for (const id of GOOD_IDS) {
    const g = world.market.goods[id];
    if (!finite(g.price) || g.price < 0) push('market', -1, `price.${id}`, g.price);
    if (!finite(g.supply) || g.supply < 0) push('market', -1, `supply.${id}`, g.supply);
    if (!finite(g.demand) || g.demand < 0) push('market', -1, `demand.${id}`, g.demand);
  }

  for (const unit of world.units) {
    for (const r of unit.regiments ?? []) {
      if (!finite(r.strength) || r.strength < 0) push('army', unit.nationId, 'strength', r.strength);
      if (!finite(r.organization)) push('army', unit.nationId, 'organization', r.organization);
    }
  }

  world.forEach((tile) => {
    const p = tile.province;
    if (!p) return;
    if (!finite(p.population) || p.population < 0) {
      push('province', tile.owner, `pop@${tile.q}:${tile.r}`, p.population);
    }
    if (!finite(p.control) || p.control < 0 || p.control > 100) {
      push('province', tile.owner, `control@${tile.q}:${tile.r}`, p.control);
    }
  });

  return bad;
}

/** Butun haftalari tarayarak isletir; ilk ihlalleri toplar. */
export function runWatched(game, weeks, limit = 12) {
  const violations = [];
  for (let i = 0; i < weeks; i++) {
    game.turns.endTurn();
    if (violations.length < limit) violations.push(...scanInvariants(game.world).slice(0, limit));
  }
  // Ayni alan tekrar tekrar bagirmasin.
  const seen = new Set();
  return violations.filter((v) => {
    const key = `${v.system}|${v.nationId}|${v.field}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ------------------------------------------------------------- BICIMLEME ---

// ------------------------------------------------------ SUREC IZOLASYONU ---

/**
 * Senaryoyu ayri bir Node surecinde isletir ve olcumu dondurur.
 *
 * ZORUNLU: units.js'teki `nextId` sayaci modul duzeyindedir ve dunyalar
 * arasinda sifirlanmaz; command.js `(turn + unit.id) % cadence` ile hareket
 * sirasini belirler. Ayni surecte kurulan ikinci dunya, ayni tohumla bile
 * baska bir oyundur (olculdu: id kaydirmasinin PARITESI bile province nufus
 * ozetini degistiriyor). Karsilastirmali olcumun tek gecerli yolu izolasyon.
 */
export function runScenario(spec) {
  const out = execFileSync(
    process.execPath,
    [fileURLToPath(new URL('./scenario-runner.mjs', import.meta.url)), JSON.stringify(spec)],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

/** Bir dizi senaryoyu sirayla isletir (her biri kendi surecinde). */
export function runScenarios(specs) {
  return specs.map((spec) => runScenario(spec));
}

export const n2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
export const n1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : String(v));
export const n0 = (v) => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : String(v));
export const pct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(1)}%` : String(v));

export function relDelta(lo, hi) {
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1e-9);
  return (hi - lo) / scale;
}

/** Kolonlu tablo. Genis ciktilari terminale sigacak sekilde kirpar. */
export function table(rows, columns) {
  if (!rows.length) return '  (bos)';
  const head = columns.map((c) => c.label);
  const body = rows.map((r) => columns.map((c) => String(c.get(r))));
  const width = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const line = (cells) => '  ' + cells.map((c, i) => (
    columns[i].right === false ? c.padEnd(width[i]) : c.padStart(width[i])
  )).join('  ');
  return [line(head), '  ' + width.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

export function section(title) {
  console.log(`\n${'='.repeat(74)}\n${title}\n${'='.repeat(74)}`);
}

export function sub(title) {
  console.log(`\n-- ${title} ${'-'.repeat(Math.max(0, 68 - title.length))}`);
}

/**
 * Bulgu kaydi. Denetimler bunu doldurur; sonunda tek liste halinde basilir ve
 * rapora tasinir.
 */
export const findings = [];
export function finding(severity, mechanic, expected, actual, evidence = '') {
  findings.push({ severity, mechanic, expected, actual, evidence });
  console.log(`  [${severity}] ${mechanic}`);
  console.log(`      beklenen: ${expected}`);
  console.log(`      olculen : ${actual}`);
  if (evidence) console.log(`      kanit   : ${evidence}`);
}

export function reportFindings() {
  section('BULGU OZETI');
  if (!findings.length) {
    console.log('  Bu kosuda bulgu yok.');
    return 0;
  }
  const order = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'];
  for (const sev of order) {
    const list = findings.filter((f) => f.severity === sev);
    if (!list.length) continue;
    console.log(`\n${sev} (${list.length})`);
    for (const f of list) console.log(`  - ${f.mechanic}: ${f.actual}`);
  }
  return findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;
}

export { FACTORIES, GOOD_IDS, GOODS, priceOf, populationOf };
