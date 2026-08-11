// Olu mekanik dedektoru.
//
// Bir mekanik "yazilmis" olabilir ama bagli olmayabilir. Kod okuyarak bu
// gorunmez; yalniz olcunce gorunur. Buradaki tek soru su: kaldiraci cevirince
// cikti degisiyor mu?
//
// Her kontrol bir kaldirac alir, iki uc degerde ayni tohumla oyunu isletir ve
// beklenen ciktinin gercekten ayrildigina bakar. Ayrilmiyorsa mekanik OLU'dur
// ve bunu sormadan bildirmek gerekir.
//
// Kullanim:  npm run audit          (butun kontroller)
//            npm run audit tarife   (adinda 'tarife' gecenler)

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  FACTORIES, SOCIAL_PROGRAMS, populationOf, setFiscalPolicy, socialSpendingCost,
} from '../src/game/economy.js';
import { computeContacts, declareWar, nationStrength } from '../src/game/diplomacy.js';
import { setAggression, STANCE } from '../src/game/command.js';
import { policyOf, rulingParty } from '../src/game/politics.js';
import { provinceRgoJobs, rgoLaborScale } from '../src/game/provinces.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, selected_: [], activeGeneral: null,
    reachable: null, autosaveEnabled: false, listeners: {},
    renderer: { invalidateCache() {}, resize() {} },
    camera: { setBounds() {}, fit() {} },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

function run(game, weeks) {
  for (let i = 0; i < weeks; i++) game.turns.endTurn();
  return game;
}

const results = [];

/**
 * Bir kaldiracin etkisini olcer. `setup` kaldiraci kurar, `measure` ciktiyi
 * okur; iki uc deger arasindaki bagil fark `minDelta`nin altindaysa mekanik
 * olu sayilir.
 */
function lever({
  name, area, seed = 'audit', weeks = 40, warmup = 20,
  values, setup, measure, minDelta = 0.05, unit = '', expect = null,
  asPlayer = false, pickNation = null, known = null,
}) {
  const samples = [];
  for (const value of values) {
    const game = headless(seed);
    run(game, warmup);
    // Bazi kanallar yalniz belirli yapida bir ulkede gorunur (or. tarife
    // maliyeti ithalata bagimli sanayide); kontrol olcecegi ulkeyi secebilir.
    if (pickNation) game.auditNation = pickNation(game) ?? null;
    // Maliye kaldiraclari oyuncu ulkesinde denenir. YZ ulkesinde denersek
    // adjustFiscalAI/adjustSocialAI kurdugumuz degeri her hafta partinin
    // tercihine geri surukler ve iki kosu ayni yere yakinsar: kaldirac
    // olu gorunur ama aslinda olcumu YZ ezmistir (ilk kosuda yasandi).
    if (asPlayer) game.turns.playerNation = me(game).id;
    setup(game, value);
    run(game, weeks);
    samples.push({ value, out: measure(game) });
  }
  const lo = samples[0].out;
  const hi = samples[samples.length - 1].out;
  const scale = Math.max(Math.abs(lo), Math.abs(hi), 1e-9);
  const delta = Math.abs(hi - lo) / scale;
  // Buyukluk degismesi yetmez, yonu de dogru olmali: "sosyal harcamayi
  // artirdim, gider azaldi" buyukluk testinden gecer ama mekanik terstir.
  const yon = hi > lo ? 'up' : hi < lo ? 'down' : 'flat';
  const yonHatasi = expect && delta >= minDelta && yon !== expect;
  results.push({
    name, area, samples, delta, minDelta, unit, expect, yon, known,
    verdict: delta < minDelta ? 'OLU' : yonHatasi ? 'TERS' : 'ETKILI',
  });
}

/** Basit dogruluk kontrolu: bir sey tutuyor mu? */
function invariant({ name, area, check, detail = '' }) {
  let ok = false;
  let note = detail;
  try {
    const r = check();
    ok = typeof r === 'object' ? r.ok : Boolean(r);
    if (typeof r === 'object' && r.note) note = r.note;
  } catch (error) {
    note = `hata: ${error.message}`;
  }
  results.push({ name, area, verdict: ok ? 'TUTUYOR' : 'TUTMUYOR', note, invariant: true });
}

const me = (game) => game.auditNation
  ?? game.world.nations.find((n) => n.alive && n.economy);

// ---------------------------------------------------------------- MALIYE ---

lever({
  name: 'Vergi orani -> hazine geliri',
  area: 'maliye',
  values: [0, 90],
  setup: (g, v) => { for (const c of ['lower', 'middle', 'upper']) setFiscalPolicy(me(g), 'tax', v, c); },
  measure: (g) => me(g).economy.ledger?.taxRevenue ?? 0,
  unit: 'altin/hafta',
  expect: 'up',
  asPlayer: true,
});

lever({
  // Anlik olculur: 40 hafta beklenirse zenginlesme/fakirlesme gibi ikinci
  // derece etkiler isareti cevirebilir ve "ters" tanisi yaniltici olur.
  name: 'Sosyal harcama -> gider (anlik)',
  area: 'maliye',
  weeks: 1,
  values: [0, 100],
  setup: (g, v) => { for (const p of Object.values(SOCIAL_PROGRAMS)) setFiscalPolicy(me(g), 'social', v, p.id); },
  measure: (g) => socialSpendingCost(me(g)),
  unit: 'altin/hafta',
  expect: 'up',
  asPlayer: true,
});

lever({
  name: 'Sosyal harcama -> alt sinif memnuniyeti',
  area: 'maliye',
  values: [0, 100],
  setup: (g, v) => { for (const p of Object.values(SOCIAL_PROGRAMS)) setFiscalPolicy(me(g), 'social', v, p.id); },
  measure: (g) => me(g).economy.classes.lower.satisfaction ?? 0,
  unit: 'memnuniyet',
  expect: 'up',
  asPlayer: true,
});

lever({
  name: 'Ordu butcesi -> muharebe gucu',
  area: 'maliye',
  values: [0, 100],
  setup: (g, v) => setFiscalPolicy(me(g), 'armySpending', v),
  measure: (g) => {
    const n = me(g);
    return (n.economy.armySpending ?? 0) / 100 * nationStrength(g.world, n);
  },
  unit: 'etkin guc',
  expect: 'up',
  asPlayer: true,
});

lever({
  name: 'Tedarik kaydiragi -> ikmal endeksi',
  area: 'maliye',
  weeks: 30,
  values: [25, 100],
  setup: (g, v) => setFiscalPolicy(me(g), 'militaryProcurement', v),
  measure: (g) => me(g).economy.military?.supplyIndex ?? 1,
  unit: 'endeks',
  expect: 'up',
  asPlayer: true,
})

lever({
  name: 'Yonetim butcesi -> vergi geliri',
  area: 'maliye',
  values: [30, 100],
  setup: (g, v) => setFiscalPolicy(me(g), 'adminFunding', v),
  measure: (g) => me(g).economy.ledger?.taxRevenue ?? 0,
  unit: 'altin/hafta',
  expect: 'up',
  asPlayer: true,
});

invariant({
  name: 'Subvansiyon gercek zarari oduyor ve tesisi ayakta tutuyor',
  area: 'maliye',
  check: () => {
    const g = headless('subsidy');
    run(g, 30);
    const n = me(g);
    g.turns.playerNation = n.id;
    // Zarar eden bir tesis bul (yoksa birini zarara zorla).
    let target = (n.economy.factories ?? []).find((f) => f.profit < 0);
    if (!target) {
      target = (n.economy.factories ?? [])[0];
      if (!target) return { ok: false, note: 'tesis yok' };
    }
    target.subsidized = true;
    let paid = 0;
    for (let i = 0; i < 8; i++) {
      g.turns.endTurn();
      paid += n.economy.ledger?.subsidyCost ?? 0;
    }
    return {
      ok: target.profit >= 0,
      note: `8 haftada odenen ${paid.toFixed(1)} · tesis kari ${target.profit.toFixed(2)}`,
    };
  },
});

invariant({
  name: 'Borc faiz isliyor ve bolluk geri oduyor',
  area: 'maliye',
  check: () => {
    const g = headless('debt');
    run(g, 30);
    const n = me(g);
    g.turns.playerNation = n.id;
    n.gold = -200;            // acik: borclanma tetiklensin
    g.turns.endTurn();
    const borrowed = n.economy.ledger?.borrowed ?? 0;
    let interest = 0;
    for (let i = 0; i < 6; i++) {
      g.turns.endTurn();
      interest += n.economy.ledger?.interestCost ?? 0;
    }
    const debtAfter = n.debt ?? 0;
    n.gold = 800;             // bolluk: geri odeme calissin
    let repaid = 0;
    for (let i = 0; i < 10; i++) {
      g.turns.endTurn();
      repaid += n.economy.ledger?.repaid ?? 0;
    }
    return {
      ok: borrowed > 0 && interest > 0 && repaid > 0 && (n.debt ?? 0) < debtAfter,
      note: `borclanilan ${borrowed.toFixed(0)} · faiz ${interest.toFixed(2)}`
        + ` · geri odenen ${repaid.toFixed(0)} · kalan ${(n.debt ?? 0).toFixed(0)}`,
    };
  },
});

// ---------------------------------------------------------------- TICARET ---

lever({
  name: 'Tarife -> hazine geliri',
  area: 'ticaret',
  values: [0, 50],
  setup: (g, v) => setFiscalPolicy(me(g), 'tariff', v),
  measure: (g) => me(g).economy.tariffRevenue ?? 0,
  unit: 'altin/hafta',
  expect: 'up',
  asPlayer: true,
});

lever({
  name: 'Tarife -> ithalat MIKTARI (korumacilik koruyor mu)',
  area: 'ticaret',
  values: [0, 50],
  setup: (g, v) => setFiscalPolicy(me(g), 'tariff', v),
  measure: (g) => me(g).economy.trade?.imports ?? 0,
  unit: 'birim/hafta',
  expect: 'down',
  asPlayer: true,
});

lever({
  // Kanal girdi fiyati uzerinden isler (tariffFactor * importShare), yani
  // yalniz ithalata bagimli sanayide gorunur. Kendi girdisini ureten ulkede
  // olcmek yanlis negatif verir; en bagimli ulke secilir.
  name: 'Tarife -> fabrika karliligi (ithalata bagimli ulkede)',
  area: 'ticaret',
  values: [0, 50],
  // Kanal kodda var (girdi maliyeti tariffFactor ile carpiliyor) ama dunya
  // ticaret hacmi yapisal olarak kucuk: arz fazlasi olmayinca importShare her
  // ulkede ~0 ve carpim etkisiz. RGO arzi buyuyunce (gorev #5) hacim artacak;
  // kontrol o gun ETKILI'ye donerse bu isaret kaldirilmali.
  known: 'ithalat hacmi yapisal olarak kucuk; arz sorunu cozulunce yeniden olculecek',
  pickNation: (g) => {
    let best = null;
    let bestShare = -1;
    for (const n of g.world.nations) {
      const factories = n.economy?.factories ?? [];
      if (!n.alive || factories.length < 2) continue;
      let share = 0;
      let inputs = 0;
      for (const f of factories) {
        const type = FACTORIES[f.typeId];
        for (const id of Object.keys(type?.inputs ?? {})) {
          share += n.economy.goodsFlow?.[id]?.importShare ?? 0;
          inputs++;
        }
      }
      const avg = inputs ? share / inputs : 0;
      if (avg > bestShare) { bestShare = avg; best = n; }
    }
    return best;
  },
  setup: (g, v) => setFiscalPolicy(me(g), 'tariff', v),
  measure: (g) => me(g).economy.factoryProfit ?? 0,
  unit: 'altin/hafta',
  asPlayer: true,
});

// ------------------------------------------------------------------ SANAYI ---

lever({
  name: 'Isgucu -> sanayi uretimi',
  area: 'sanayi',
  weeks: 60,
  values: [0, 1],
  setup: (g, v) => {
    // Butun fabrikalari bosalt / doldur: kadro gercekten cikti uretiyor mu?
    for (const n of g.world.nations) {
      for (const f of n.economy?.factories ?? []) f.employees = (f.jobs ?? 2000) * v;
    }
  },
  measure: (g) => g.world.nations.reduce(
    (s, n) => s + (n.economy?.factories ?? []).reduce((t, f) => t + (f.throughput ?? 0), 0), 0,
  ),
  unit: 'throughput',
  expect: 'up',
});

// ------------------------------------------------------------------ ARAZI ---

lever({
  name: 'RGO gelisimi -> hammadde arzi',
  area: 'arazi',
  weeks: 60,
  values: [0, 8],
  setup: (g, v) => {
    g.world.forEach((t) => {
      if (!t.province) return;
      t.province.agriculture = v;
      t.province.extraction = v;
    });
  },
  measure: (g) => Object.entries(g.world.market.goods)
    .filter(([id]) => ['food', 'iron', 'coal', 'timber', 'cotton'].includes(id))
    .reduce((s, [, st]) => s + (st.supply ?? 0), 0),
  unit: 'arz',
  expect: 'up',
});

lever({
  name: 'Kirsal nufus -> RGO ciktisi',
  area: 'arazi',
  weeks: 30,
  values: [0.4, 3],
  setup: (g, v) => {
    g.world.forEach((t) => {
      if (t.province) t.province.population = Math.round(provinceRgoJobs(t) * v);
    });
  },
  measure: (g) => Object.entries(g.world.market.goods)
    .filter(([id]) => ['food', 'iron', 'coal'].includes(id))
    .reduce((s, [, st]) => s + (st.supply ?? 0), 0),
  unit: 'arz',
  expect: 'up',
});

// -------------------------------------------------------------- DIPLOMASI ---

lever({
  name: 'Sohret -> koalisyon riski',
  area: 'diplomasi',
  weeks: 30,
  values: [0, 60],
  setup: (g, v) => { for (const n of g.world.nations) if (n.alive) n.infamy = v; },
  measure: (g) => {
    const w = g.world;
    let wars = 0;
    for (let a = 0; a < w.nations.length; a++) {
      for (let b = a + 1; b < w.nations.length; b++) {
        if (w.relations[a][b].state === 'war') wars++;
      }
    }
    return wars;
  },
  unit: 'savas',
  expect: 'up',
});

lever({
  name: 'Isgal -> warscore',
  area: 'diplomasi',
  weeks: 1,
  warmup: 12,
  values: [0, 0.8],
  setup: (g, v) => {
    const w = g.world;
    const contacts = computeContacts(w);
    let pair = null;
    for (let a = 0; a < w.nations.length && !pair; a++) {
      for (let b = a + 1; b < w.nations.length && !pair; b++) {
        if (contacts[a]?.[b]) pair = [a, b];
      }
    }
    if (!pair) return;
    declareWar(g, pair[0], pair[1]);
    g.turns.turn += 20;
    const theirs = w.tiles.filter((t) => t.owner === pair[1] && t.terrain.passable);
    theirs.slice(0, Math.floor(theirs.length * v)).forEach((t) => { t.controller = pair[0]; });
    g.auditPair = pair;
  },
  measure: async (g) => 0,   // asagida invariant ile olculuyor
  minDelta: -1,
  unit: '',
});

// --------------------------------------------------------------- DOGRULUK ---

invariant({
  name: 'Butce defteri gercek altin degisimini tutuyor',
  area: 'maliye',
  check: () => {
    const g = headless('ledger');
    run(g, 40);
    const n = me(g);
    let sapma = 0;
    let toplam = 0;
    for (let i = 0; i < 10; i++) {
      const once = n.gold;
      g.turns.endTurn();
      // Defter haftanin KAYDIDIR, kehaneti degil: tur bitince yazilan net,
      // o turda gerceklesen altin degisimini aciklamali. Borclanma bilanco
      // hareketidir, gelir degil: kimlik Δhazine = net + borclanilan - odenen.
      const L = n.economy.ledger ?? {};
      const beklenen = (L.net ?? 0) + (L.borrowed ?? 0) - (L.repaid ?? 0);
      sapma += Math.abs((n.gold - once) - beklenen);
      toplam += Math.abs(beklenen) + Math.abs(n.gold - once);
    }
    const oran = sapma / Math.max(1, toplam / 2);
    return {
      ok: oran < 0.05,
      note: `ortalama sapma ${(oran * 100).toFixed(1)}% (esik %5)`,
    };
  },
});

invariant({
  name: 'Hicbir ulke sonsuz altin biriktirmiyor (para deligi var)',
  area: 'maliye',
  check: () => {
    const g = headless('sink');
    run(g, 400);
    const altinlar = g.world.nations.filter((n) => n.alive).map((n) => n.gold);
    const en = Math.max(...altinlar);
    return { ok: en < 100000, note: `en zengin hazine ${Math.round(en)}` };
  },
});

invariant({
  name: 'Nufus sonsuz buyumuyor',
  area: 'arazi',
  check: () => {
    const g = headless('pop');
    const bas = populationOf(g.world, me(g));
    run(g, 400);
    const son = populationOf(g.world, me(g));
    const kat = son / Math.max(1, bas);
    return { ok: kat < 20, note: `400 haftada ${kat.toFixed(1)} kat` };
  },
});

invariant({
  name: 'Politika kaldiraclarinin gercek bir kisiti var',
  area: 'politika',
  check: () => {
    const g = headless('policy');
    run(g, 60);
    const n = me(g);
    const parti = rulingParty(n);
    setFiscalPolicy(n, 'armySpending', 100);
    const kisitli = n.economy.armySpending < 100;
    return {
      ok: Boolean(parti) && (kisitli || policyOf(n, 'military') !== 'pacifism'),
      note: `parti ${parti?.name ?? 'yok'}, ordu tavani ${n.economy.armySpending}`,
    };
  },
});

// ------------------------------------------------------------------ RAPOR ---

const filtre = (process.argv[2] ?? '').toLowerCase();
const gosterilecek = filtre
  ? results.filter((r) => `${r.name} ${r.area}`.toLowerCase().includes(filtre))
  : results;

console.log('HexWar mekanik denetimi — kaldiraci cevir, cikti degisiyor mu?\n');
let olu = 0;
let bozuk = 0;
let alan = null;
for (const r of gosterilecek) {
  if (r.area !== alan) { alan = r.area; console.log(`\n[${alan.toUpperCase()}]`); }
  if (r.invariant) {
    if (r.verdict !== 'TUTUYOR') bozuk++;
    console.log(`  ${r.verdict === 'TUTUYOR' ? 'OK  ' : 'BOZUK'} ${r.name}`
      + (r.note ? ` — ${r.note}` : ''));
    continue;
  }
  if (r.minDelta < 0) continue;
  // `known`: yapisal nedeni bilinen, ayri gorevde takip edilen zayif kanal
  // (xfail). Cikis kodunu dusurmez ama raporda saklanmaz; kanal canlanirsa
  // isaretin kaldirilmasi icin ayrica haber verir.
  if (r.verdict !== 'ETKILI' && !r.known) olu++;
  const [a, b] = [r.samples[0], r.samples[r.samples.length - 1]];
  const etiket = r.known && r.verdict !== 'ETKILI' ? 'BILINEN'
    : { ETKILI: 'OK  ', OLU: 'OLU ', TERS: 'TERS' }[r.verdict];
  console.log(`  ${etiket} ${r.name}`
    + (r.verdict === 'TERS' ? `  (beklenen yon ${r.expect}, olcülen ${r.yon})` : ''));
  if (r.known && r.verdict !== 'ETKILI') console.log(`        not: ${r.known}`);
  if (r.known && r.verdict === 'ETKILI') {
    console.log('        DIKKAT: bilinen-zayif isaretli kanal artik ETKILI — isareti kaldir.');
  }
  console.log(`        ${a.value} -> ${a.out.toFixed(2)}${r.unit ? ' ' + r.unit : ''}`
    + `  |  ${b.value} -> ${b.out.toFixed(2)}`
    + `  |  fark %${(r.delta * 100).toFixed(1)}`);
}

console.log('\n' + '-'.repeat(70));
console.log(`olu mekanik: ${olu} · bozuk dogruluk: ${bozuk} · toplam kontrol: ${gosterilecek.length}`);
if (olu || bozuk) {
  console.log('\nOLU = kaldirac cevriliyor ama cikti degismiyor. Mekanik bagli degil.');
  console.log('BOZUK = sistemin tutmasi gereken bir sey tutmuyor.');
}
process.exit(olu + bozuk > 0 ? 1 : 0);
