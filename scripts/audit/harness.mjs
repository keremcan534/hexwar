// Ortak denetim tezgahi.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz. Yaptigi
// tek sey: ayni tohumla bassiz bir dunya kurmak, haftalari isletmek ve
// sonuclari karsilastirilabilir sayilara indirmek.
//
// Tasarim kurali: her olcum ayni tohumdan baslar, tek degisken oynatilir.
// Iki kosunun farki yalnizca o degiskene atfedilebilir olmali.

import { execFileSync, spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
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
import { fundFloor } from '../../src/game/econ/investment.js';
import { applyDefaultDelegation } from '../../src/game/delegation.js';
import { EVENT_CARDS, resolveCard } from '../../src/game/eventCards.js';

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

/**
 * EDİLGEN OYUNCU: gerçek oyundaki gibi seçilen ulus (world.playerNation),
 * AUTO varsayılanıyla (diplomasi hariç). Kartları YZ seçimiyle kapatır, ona
 * gelen barış teklifini kabul eder — "AUTO'ya bırakan oyuncu" (stats-dashboard
 * ve u5 sondasıyla aynı kurulum; ikisinin sayıları bu kurulumla ölçüldü).
 * Dönen fonksiyon her `endTurn`'den SONRA çağrılır.
 */
export function passivePlayer(game) {
  const world = game.world;
  const player = world.nations[world.playerNation];
  game.turns.playerNation = player.id;
  applyDefaultDelegation(player, world.turn ?? 1);
  const afterWeek = () => {
    if (!player.alive) return;
    for (const entry of [...(player.cards?.pending ?? [])]) {
      const card = EVENT_CARDS[entry.id];
      let best = 0;
      let bestWeight = -Infinity;
      card.options.forEach((option, index) => {
        if (option.available && !option.available(player)) return;
        const w = option.ai ? option.ai(player) : 1;
        if (w > bestWeight) { best = index; bestWeight = w; }
      });
      resolveCard(game, player, entry.key, best);
    }
    for (const offer of [...game.pendingPeace()]) {
      if (offer.to === player.id) game.resolvePeaceOffer(offer.id, true);
    }
  };
  afterWeek.player = player;
  return afterWeek;
}

/** Denetim özgesi: en çok sanayisi olan canlı ülke (en zengin sinyal). */
export function pickNation(game) {
  return game.world.nations
    .filter((n) => n.alive && n.economy)
    .sort((a, b) => (b.economy.ic?.total ?? 0) - (a.economy.ic?.total ?? 0) || a.id - b.id)[0];
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
    // Kalkınma fonu (eski hazine; IC) ve tabanı.
    fund: nation.fund ?? 0,
    fundFloor: fundFloor(nation),
    crisis: (e.bills?.s ?? 1) < 1 - 1e-6,
    tiles: nation.tiles ?? 0,
    provinces: nation.provinces ?? 0,
    population: e.population ?? 0,
    literacy: e.literacy ?? 0,
    // --- fon defteri (treasury.LEDGER_LINES, işaretli) ---
    income: L.income ?? 0,
    expenses: L.expenses ?? 0,
    net: L.net ?? 0,
    invested: L.investment ?? 0,
    exportRevenue: L.exports ?? 0,
    treatyFlow: L.treaty ?? 0,
    importCost: Math.abs(L.imports ?? 0),
    developmentCost: Math.abs(L.development ?? 0),
    outlay: Math.abs(L.outlay ?? 0),
    unreconciled: L.unreconciled ?? 0,
    // --- çubuk (economy.alloc) ve faturalar (econ/bills.js) ---
    output: e.ic?.output ?? 0,
    billsOwed: e.bills?.owed ?? 0,
    billsPaid: e.bills?.paid ?? 0,
    supplyShare: e.bills?.s ?? 1,
    armyCost: e.bills?.army ?? 0,
    navyCost: e.bills?.navy ?? 0,
    educationCost: e.bills?.schools ?? 0,
    peopleShare: e.alloc?.people ?? 0,
    investShare: e.alloc?.invest ?? 0,
    feed: e.feed?.target ?? 1,
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
    // Ordunun FİİLEN çektiği (hatlar), yasanın tavanı ayrı.
    militaryIC: e.alloc?.army ?? 0,
    militaryCap: e.ic?.military ?? 0,
    development: e.development ?? 1,
    consumer: e.consumer?.ratio ?? 1,
    stock: { ...(e.stock ?? {}) },
    resources,
    // --- ordu ---
    units: units.length,
    regiments: landRegiments,
    soldiers: units.reduce((s, u) => s + soldiersOf(u), 0),
    manpower: nationManpower(world, nation.id),
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
/** Milisin yabancı toprakta ilk görüldüğü tarama (bir haftalık pay için). */
const militiaForeign = new WeakMap();

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
    if (!finite(nation.fund)) push('fund', nation.id, 'fund', nation.fund);
    if (Math.abs(e.ledger?.unreconciled ?? 0) > 1e-6) push('fund', nation.id, 'unreconciled', e.ledger.unreconciled);
    // ÇUBUK KAPANIR (TASARIM §17): çıktı = faturalar + ordu + halk + kalkınma,
    // her pay ≥ 0; faturalar tavanı, ordu yasanın tavanını aşmaz.
    const a = e.alloc;
    if (a) {
      for (const key of ['output', 'bills', 'army', 'people', 'invest']) {
        if (!finite(a[key]) || a[key] < -1e-9) push('bar', nation.id, key, a[key]);
      }
      const sum = a.bills + a.army + a.people + a.invest;
      if (Math.abs(sum - a.output) > 1e-6 * Math.max(1, a.output)) push('bar', nation.id, 'Σshares≠output', sum - a.output);
      if (a.army > (e.ic?.military ?? 0) + 1e-6) push('bar', nation.id, 'army>law cap', a.army);
    }
    const b = e.bills;
    if (b) {
      if (!finite(b.s) || b.s < -1e-9 || b.s > 1 + 1e-9) push('bills', nation.id, 's', b.s);
      if (b.paid > b.room + 1e-6) push('bills', nation.id, 'paid>room', b.paid - b.room);
    }
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
    for (const key of ['total', 'output', 'civil', 'military']) {
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
  }
  // Dünya ticareti DEĞERDE de kapanır (TASARIM §17): Σ ihracat geliri =
  // Σ ithalat bedeli (IC, fondan fona). Eskiden ihracatçıya ödenen
  // ithalatçının ödediğinin 1.53-1.58 katıydı ve bu değişmez yalnız miktara
  // bakıyordu.
  let valueIn = 0;
  let valueOut = 0;
  for (const nation of world.nations) {
    if (nation.economy?.tradeTurn !== world.turn) continue;
    valueIn += nation.economy.ledger?.exports ?? 0;
    valueOut += nation.economy.ledger?.imports ?? 0;
  }
  if (Math.abs(valueIn + valueOut) > 1e-6 * Math.max(1, valueIn)) {
    push('trade', -1, 'exports≠imports (IC)', valueIn + valueOut);
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
    if (!Number.isInteger(p.development) || p.development < 1 || p.development > 10) push('province', province.owner, `dev#${province.id}`, p.development);
    if (!Number.isInteger(p.fort ?? 0) || (p.fort ?? 0) < 0 || (p.fort ?? 0) > 3) push('province', province.owner, `fort#${province.id}`, p.fort);
    if ((p.soldiers ?? 0) < 0) push('province', province.owner, `soldiers#${province.id}`, p.soldiers);
    // Silah altındaki nüfusun içindedir (provinces.claimSoldiers): asker
    // sayısı nüfusu aşarsa ölü adam askerde kalmış demektir.
    if ((p.soldiers ?? 0) > (p.population ?? 0) + 1e-6) push('province', province.owner, `soldiers>pop#${province.id}`, (p.soldiers ?? 0) - (p.population ?? 0));
    // Rıza (redesign D8): yalnız alan varsa denetlenir; yoksa mekanik henüz yok.
    if (typeof p.consent === 'number' && !(p.consent >= 0.5 - 1e-9 && p.consent <= 1 + 1e-9)) {
      push('province', province.owner, `consent#${province.id}`, p.consent);
    }
  }

  // YENİDEN TASARIMIN DEĞİŞMEZLERİ (redesign §5). Her biri KORUMALIDIR: alan
  // yoksa (paket henüz inmediyse) kontrol atlanır, sahte ihlal üretmez.
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const politics = nation.politics;
    if (typeof politics?.exhaustion === 'number'
      && !(politics.exhaustion >= -1e-9 && politics.exhaustion <= 1 + 1e-9)) {
      push('politics', nation.id, 'exhaustion', politics.exhaustion);
    }
    const course = politics?.course;
    if (course && typeof course === 'object'
      && ![course.x, course.y].every((v) => finite(v) && v >= -1 - 1e-9 && v <= 1 + 1e-9)) {
      push('politics', nation.id, 'course', `${course.x},${course.y}`);
    }
    for (const [cultureId, record] of Object.entries(nation.movements ?? {})) {
      const progress = record?.progress;
      if (progress != null && !(finite(progress) && progress >= -1e-9 && progress <= 100 + 1e-9)) {
        push('movements', nation.id, `progress#${cultureId}`, progress);
      }
    }
    if (Array.isArray(nation.homeRule)) {
      const accepted = nation.accepted?.length ? nation.accepted : [nation.culture];
      for (const cultureId of nation.homeRule) {
        if (!accepted.includes(cultureId)) push('culture', nation.id, `homeRule⊄accepted#${cultureId}`, cultureId);
      }
    }
  }
  // Milis yalnız kendi ulusunun sahip olduğu karede durur (redesign D6:
  // "yalnız kendi toprağında, asla taarruz etmez").
  for (const unit of world.units) {
    const regiments = unit.regiments ?? [];
    if (!regiments.length || !regiments.every((r) => r.militia)) continue;
    // Toprak bu hafta el değiştirdiyse ya da milis muharebedeyse bir haftalık
    // pay: milis bir sonraki seferberlik adımında evine döner (runLevee). Her
    // devir yolu `heldSince` yazmadığı için pay birimin kendisinden tutulur:
    // yalnız art arda iki taramada yabancı topraktaysa ihlaldir.
    const foreign = !unit.battleId && unit.tile?.owner !== unit.nationId;
    const seen = militiaForeign.get(unit);
    if (!foreign) militiaForeign.delete(unit);
    else if (seen == null || seen < (world.turn ?? 0) - 1) militiaForeign.set(unit, world.turn ?? 0);
    else push('army', unit.nationId, `militia off own soil#${unit.id}`, `${unit.tile?.q},${unit.tile?.r}`);
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

/** Aynı anda koşacak süreç sayısı: makinenin çekirdeklerinin ikisi boş kalsın. */
export function defaultConcurrency(jobs = Infinity) {
  const env = Number(process.env.AUDIT_JOBS);
  const cap = Number.isFinite(env) && env > 0 ? env : Math.max(1, availableParallelism() - 2);
  return Math.max(1, Math.min(jobs, cap));
}

/**
 * İşçi süreç havuzu. Her iş `node betik ...args` olarak KENDİ sürecinde koşar
 * (bkz. runScenario: aynı süreçteki ikinci dünya başka bir oyundur), stdout'u
 * JSON olarak döner. Sıra korunur; sonuçlar süreçten bağımsız olduğu için
 * paralellik ölçümü değiştirmez. stderr (ilerleme satırları) olduğu gibi akar.
 * @returns {Promise<object[]>}
 */
export function runWorkers(script, jobs, { concurrency = defaultConcurrency(jobs.length), cwd } = {}) {
  const results = new Array(jobs.length);
  let next = 0;
  const one = (index) => new Promise((resolveJob, rejectJob) => {
    const child = spawn(process.execPath, [script, ...jobs[index].map(String)], {
      cwd, stdio: ['ignore', 'pipe', 'inherit'],
    });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.on('error', rejectJob);
    child.on('close', (code) => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        results[index] = JSON.parse(text);
        resolveJob();
      } catch {
        rejectJob(new Error(`isci coktu (${script} ${jobs[index].join(' ')}), cikis ${code}: ${text.slice(0, 400)}`));
      }
    });
  });
  const lane = async () => {
    while (next < jobs.length) {
      const index = next++;
      await one(index);
    }
  };
  return Promise.all(Array.from({ length: Math.max(1, concurrency) }, lane)).then(() => results);
}

/** runScenario'nun paralel karşılığı: aynı sonuç, süreç havuzunda. */
export function runScenariosParallel(specs, options = {}) {
  const script = fileURLToPath(new URL('./scenario-runner.mjs', import.meta.url));
  return runWorkers(script, specs.map((spec) => [JSON.stringify(spec)]), options);
}

// ---------------------------------------------------------------- İSTATİSTİK ---

/** Sıralı yüzdelik (en yakın sıra, alt). Boş liste NaN. */
export function quantile(list, q) {
  const values = list.filter(Number.isFinite);
  if (!values.length) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
}
export const mean = (list) => {
  const values = list.filter(Number.isFinite);
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : NaN;
};

/**
 * MEKANİK YOK: test atlanır, asla GEÇTİ basılmaz (redesign §5 kuralı).
 * Özette ayrı sayılır; run-all bunu bulgu saymaz.
 */
export const skips = [];
export function skip(test, why) {
  skips.push({ test, why });
  console.log(`  SKIP (not present) — ${test}: ${why}`);
}

/**
 * BOŞ GEÇİŞ YOK: testin olay sayısı sıfırsa test bir şey ölçmemiştir; geçti
 * değil "vacuous" diye düşer (redesign §5).
 * @returns {boolean} olay var mı
 */
export function requireEvents(test, count, what) {
  if (count > 0) return true;
  finding('HIGH', `${test} vacuous`, `${what} > 0 (yoksa test hicbir sey olcmez)`, `${what} = ${count}`);
  return false;
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
  if (skips.length) {
    console.log(`  atlanan (mekanik yok) ${skips.length}: ${skips.map((s) => s.test).join(', ')}`);
  }
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
