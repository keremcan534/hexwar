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
import { RESOURCE_IDS, EQUIPMENT_IDS } from '../../src/game/econ/defs.js';
import { populationOf } from '../../src/game/economy.js';
import { nationManpower } from '../../src/game/recruitment.js';
import { regimentCount, soldiersOf } from '../../src/game/units.js';
import { atWar } from '../../src/game/diplomacy.js';
import { ensureConstruction } from '../../src/game/construction.js';

/**
 * Bassiz oyun. DOM, zamanlayici, cizim yok; simulasyon tam calisir.
 *
 * Boyut 78x62'ye SABITLENIR: urun varsayilani 200x160'a cikti ama denetim
 * taban cizgileri ve kosu sureleri kucuk haritada kurulu. Olcek testleri
 * boyutu acikca gecer (bkz. scale-audit.mjs).
 */
export function headless(seed, options = {}) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed, { cols: 78, rows: 62, ...options });
  generateNations(game.world, { seed: `${seed}-nations`, count: options.nationCount ?? null });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    hovered: null, marquee: null, reachable: null,
    autosaveEnabled: false, dirty: false, frameHandle: 0,
    peaceOffers: [], nextPeaceOfferId: 1,
    listeners: {},
    notifications: { push() {} },
    renderer: { invalidateCache() {}, invalidateTiles() {}, resize() {} },
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
  // Savas ancak TUR SONRASI bastirilabiliyor: bir haftalik "savas parlamasi"
  // icinde gercek muharebe olumleri yasanabilir. Cagiran, hangi haftalarin
  // gercekten barisci olmadigini bilsin diye sayac tutulur.
  game.peacefulWarFlashes = 0;
  for (let i = 0; i < weeks; i++) {
    game.turns.endTurn();
    let flash = world.battleSystem?.battles?.length ? 1 : 0;
    for (let a = 0; a < world.nations.length; a++) {
      for (let b = a + 1; b < world.nations.length; b++) {
        const rec = world.relations[a]?.[b];
        if (rec && rec.state === 'war') {
          rec.state = 'peace';
          flash = 1;
        }
      }
    }
    game.peacefulWarFlashes += flash;
    game.lastWeekWarFlash = flash > 0;
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

/** Denetim özgesi: en çok IC'si olan canlı ülke (en zengin sinyal). */
export function pickNation(game) {
  return game.world.nations
    .filter((n) => n.alive && n.economy)
    .sort((a, b) => (b.economy.ic?.raw ?? 0) - (a.economy.ic?.raw ?? 0) || a.id - b.id)[0];
}

/** Ulkeyi oyuncu yapar: YZ maliye/sosyal kaydiraclarini geri surukleyemez. */
export function asPlayer(game, nation) {
  game.turns.playerNation = nation.id;
  return nation;
}

export const alive = (game) => game.world.nations.filter((n) => n.alive && n.economy);

// ------------------------------------------------------------- OLCUMLER ---

/** Bir ülkenin geniş kesiti. Bütün denetimler aynı sözlüğü kullanır. */
export function snapshotNation(world, nation) {
  const e = nation.economy ?? {};
  const L = e.ledger ?? {};
  const units = world.units.filter((u) => u.nationId === nation.id);
  const landRegiments = units
    .filter((u) => u.type.domain === 'land')
    .reduce((s, u) => s + regimentCount(u), 0);
  const resources = {};
  for (const id of RESOURCE_IDS) resources[id] = { ...(e.resources?.[id] ?? {}) };
  return {
    id: nation.id,
    name: nation.name,
    turn: world.turn,
    gold: nation.gold ?? 0,
    debt: nation.debt ?? 0,
    bankrupt: (nation.bankruptUntil ?? 0) > (world.turn ?? 0),
    tiles: nation.tiles ?? 0,
    provinces: nation.provinces ?? 0,
    population: e.population ?? 0,
    literacy: e.literacy ?? 0,
    // --- defter (treasury.LEDGER_LINES, işaretli) ---
    income: L.income ?? 0,
    expenses: L.expenses ?? 0,
    net: L.net ?? 0,
    taxRevenue: L.tax ?? 0,
    exportRevenue: L.exports ?? 0,
    treatyFlow: L.treaty ?? 0,
    armyCost: Math.abs(L.army ?? 0),
    navyCost: Math.abs(L.navy ?? 0),
    importCost: Math.abs(L.imports ?? 0),
    constructionCost: Math.abs(L.construction ?? 0),
    maintenanceCost: Math.abs(L.maintenance ?? 0),
    educationCost: Math.abs(L.education ?? 0),
    interestCost: Math.abs(L.interest ?? 0),
    borrowed: L.borrow ?? 0,
    repaid: Math.abs(L.repay ?? 0),
    unreconciled: L.unreconciled ?? 0,
    // --- siyaset ---
    stability: nation.stability ?? 0,
    warSupport: nation.warSupport ?? 0,
    power: nation.power ?? 0,
    laws: { ...(nation.politics?.laws ?? {}) },
    ruling: nation.politics?.ruling ?? null,
    government: nation.politics?.government ?? null,
    prestige: nation.prestige ?? 0,
    // --- sanayi ---
    ic: e.ic?.total ?? 0,
    factories: e.ic?.raw ?? 0,
    civilIC: e.ic?.civil ?? 0,
    militaryIC: e.ic?.military ?? 0,
    consumer: e.consumer?.ratio ?? 1,
    stock: { ...(e.stock ?? {}) },
    resources,
    // --- ordu ---
    units: units.length,
    regiments: landRegiments,
    soldiers: units.reduce((s, u) => s + soldiersOf(u), 0),
    manpower: nationManpower(world, nation.id),
    // --- inşaat ---
    projects: ensureConstruction(nation).queue.length,
    atWar: world.nations.some((o) => o.alive && o.id !== nation.id && atWar(world, nation.id, o.id)),
  };
}

/** Dünya pazarı kesiti: fiyat, teklif, talep, hacim. */
export function marketSnapshot(world) {
  const out = {};
  const market = world.market ?? {};
  for (const id of RESOURCE_IDS) {
    out[id] = {
      price: market.prices?.[id] ?? 0,
      offered: market.offered?.[id] ?? 0,
      wanted: market.wanted?.[id] ?? 0,
      volume: market.volume?.[id] ?? 0,
    };
  }
  return out;
}

// ------------------------------------------------------------ DEGISMEZLER ---

/**
 * Her hafta çalışabilen değişmez taraması (TASARIM.md §17). İhlali olduğu
 * yerde yakalar: hafta, ülke, sistem, değer.
 */
export function scanInvariants(world) {
  const bad = [];
  const push = (system, nationId, field, value, note = '') => bad.push({
    turn: world.turn, nationId, system, field, value, note,
  });
  const finite = (v) => Number.isFinite(v);
  const imported = {};
  const exported = {};
  for (const id of RESOURCE_IDS) { imported[id] = 0; exported[id] = 0; }

  for (const nation of world.nations) {
    // Takas korunumu: bu haftanın takasına katılan herkes (aynı hafta elense de).
    const traded = nation.economy?.tradeTurn === world.turn;
    if (traded) {
      for (const id of RESOURCE_IDS) {
        imported[id] += nation.economy.resources?.[id]?.imported ?? 0;
        exported[id] += nation.economy.resources?.[id]?.exported ?? 0;
      }
    }
    if (!nation.alive) continue;
    const e = nation.economy;
    if (!e) continue;
    if (!finite(nation.gold)) push('treasury', nation.id, 'gold', nation.gold);
    if (!finite(nation.debt ?? 0) || (nation.debt ?? 0) < 0) push('debt', nation.id, 'debt', nation.debt);
    if (Math.abs(e.ledger?.unreconciled ?? 0) > 1e-6) push('treasury', nation.id, 'unreconciled', e.ledger.unreconciled);
    if (!finite(e.population) || e.population < 0) push('population', nation.id, 'population', e.population);
    for (const key of ['stability', 'warSupport']) {
      const v = nation[key];
      if (!finite(v) || v < 0 || v > 1) push('politics', nation.id, key, v);
    }
    if (!finite(nation.power) || nation.power < 0) push('politics', nation.id, 'power', nation.power);
    for (const id of EQUIPMENT_IDS) {
      const v = e.stock?.[id];
      if (!finite(v) || v < 0) push('military', nation.id, `stock.${id}`, v);
    }
    for (const key of ['total', 'civil', 'military']) {
      if (!finite(e.ic?.[key]) || e.ic[key] < 0) push('industry', nation.id, `ic.${key}`, e.ic?.[key]);
    }
    for (const id of RESOURCE_IDS) {
      const r = e.resources?.[id];
      if (!r) continue;
      for (const k of ['produced', 'need', 'imported', 'exported', 'ratio']) {
        if (!finite(r[k]) || r[k] < -1e-9) push('resources', nation.id, `${id}.${k}`, r[k]);
      }
      if (r.ratio > 1 + 1e-9) push('resources', nation.id, `${id}.ratio>1`, r.ratio);
      // Kaynak dengesi: ihracat fazladan, fazla üretimden büyük olamaz.
      if (r.exported > r.produced + 1e-6) push('resources', nation.id, `${id}.exported>produced`, r.exported);
    }
    const mp = nationManpower(world, nation.id);
    if (!finite(mp) || mp < 0) push('military', nation.id, 'manpower', mp);
    for (const [k, v] of Object.entries(e.ledger ?? {})) {
      if (typeof v === 'number' && !finite(v)) push('ledger', nation.id, k, v);
    }
    for (const p of ensureConstruction(nation).queue) {
      if (!finite(p.progress) || p.progress < 0) push('construction', nation.id, 'progress', p.progress);
    }
  }
  // Dünya ticareti kapanır: Σ ithalat = Σ ihracat (miktar).
  for (const id of RESOURCE_IDS) {
    if (Math.abs(imported[id] - exported[id]) > 1e-6 * Math.max(1, imported[id])) {
      push('trade', -1, `${id}.imported≠exported`, imported[id] - exported[id]);
    }
    const price = world.market?.prices?.[id];
    if (!finite(price) || price <= 0) push('trade', -1, `price.${id}`, price);
  }

  for (const unit of world.units) {
    for (const r of unit.regiments ?? []) {
      if (!finite(r.strength) || r.strength < 0) push('army', unit.nationId, 'strength', r.strength);
      if (!finite(r.organization)) push('army', unit.nationId, 'organization', r.organization);
    }
  }

  for (const province of world.provinces ?? []) {
    const p = province.econ;
    if (!p) continue;
    if (!finite(p.population) || p.population < 0) push('province', province.owner, `pop#${province.id}`, p.population);
    if (!finite(p.control) || p.control < 0 || p.control > 100) push('province', province.owner, `control#${province.id}`, p.control);
    if (!finite(p.development) || p.development < 1 || p.development > 10) push('province', province.owner, `dev#${province.id}`, p.development);
    if ((p.soldiers ?? 0) < 0) push('province', province.owner, `soldiers#${province.id}`, p.soldiers);
  }

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

export { populationOf };
