// H + M. PIYASA KORUNUM VE KITLIK TESTI
//
// Bu ekonomide kalici mal STOKU yoktur: her hafta uretilen ayni hafta akar.
// O yuzden "onceki envanter + uretim - tuketim = yeni envanter" yerine
// haftalik AKIS kimlikleri denetlenir:
//
//   dunya arzi        = sum(ulke uretimi) - devletin alikoydugu
//   dunya talebi      = sum(ulke talebi)
//   toplam ithalat    = toplam ihracat        (sinir otesi ticaret kapanmali)
//   ulke karsilanmasi = yerli + ithalat <= talep
//
// Ayrica uretim zincirinin gercekten girdiye bagli olup olmadigi olculur:
// hammaddeyi kesince ust katman duruyor mu, yoksa yoktan mi uretiyor?

import {
  headless, run, pickNation, section, sub, table, finding, reportFindings,
  n1, n2, n0, pct, GOOD_IDS, GOODS,
} from './harness.mjs';
import { FACTORIES, priceOf } from '../../src/game/economy.js';
import { RGO_TYPES } from '../../src/game/provinces.js';

const SEED = 'market-audit';

section('H. PIYASA KORUNUM DENETIMI');

// -------------------------------------------------- 1) AKIS KIMLIKLERI ---
sub('Haftalik akis kimlikleri (60 hafta isitma, sonraki 20 hafta taranir)');
{
  const game = headless(SEED);
  run(game, 60);
  const rows = [];
  const worst = { supply: 0, demand: 0, trade: 0, overfill: 0 };
  for (let week = 0; week < 20; week++) {
    game.turns.endTurn();
    const world = game.world;
    const nations = world.nations.filter((n) => n.alive && n.economy);
    for (const id of GOOD_IDS) {
      let production = 0;
      let retained = 0;
      let demand = 0;
      let imports = 0;
      let exports = 0;
      let overfill = 0;
      for (const n of nations) {
        const f = n.economy.goodsFlow[id];
        production += f.production;
        retained += f.retained;
        demand += f.demand;
        imports += f.imports;
        exports += f.exports;
        // Bir ulke talebinden fazlasini "karsilanmis" sayamaz.
        overfill = Math.max(overfill, f.fulfilled - f.demand);
      }
      const m = world.market.goods[id];
      const supplyDrift = Math.abs(m.supply - (production - retained));
      const demandDrift = Math.abs(m.demand - demand);
      const tradeDrift = Math.abs(imports - exports);
      worst.supply = Math.max(worst.supply, supplyDrift);
      worst.demand = Math.max(worst.demand, demandDrift);
      worst.trade = Math.max(worst.trade, tradeDrift);
      worst.overfill = Math.max(worst.overfill, overfill);
      if (week === 19) {
        rows.push({
          id, production, retained, demand, imports, exports,
          supply: m.supply, marketDemand: m.demand, supplyDrift, demandDrift, tradeDrift,
        });
      }
    }
  }
  const shown = rows.filter((r) => r.production > 0 || r.demand > 0)
    .sort((a, b) => b.demand - a.demand).slice(0, 14);
  console.log(table(shown, [
    { label: 'mal', get: (r) => r.id, right: false },
    { label: 'ulkeUretim', get: (r) => n2(r.production) },
    { label: 'alikonan', get: (r) => n2(r.retained) },
    { label: 'pazarArz', get: (r) => n2(r.supply) },
    { label: 'sapmaArz', get: (r) => n2(r.supplyDrift) },
    { label: 'ulkeTalep', get: (r) => n2(r.demand) },
    { label: 'pazarTalep', get: (r) => n2(r.marketDemand) },
    { label: 'sapmaTalep', get: (r) => n2(r.demandDrift) },
    { label: 'ithalat', get: (r) => n2(r.imports) },
    { label: 'ihracat', get: (r) => n2(r.exports) },
    { label: 'sapmaTicaret', get: (r) => n2(r.tradeDrift) },
  ]));
  console.log(`\n  20 haftalik EN KOTU sapmalar: arz ${n2(worst.supply)} · talep ${n2(worst.demand)}`
    + ` · ithalat-ihracat ${n2(worst.trade)} · talebi asan karsilanma ${n2(worst.overfill)}`);
  if (worst.supply > 0.01 || worst.demand > 0.01) {
    finding('HIGH', 'Piyasa arz/talep kimligi',
      'pazar toplami = ulke toplamlari', `arz sapmasi ${n2(worst.supply)}, talep sapmasi ${n2(worst.demand)}`,
      'mal yoktan var oluyor ya da kayboluyor');
  }
  if (worst.trade > 0.01) {
    finding('HIGH', 'Sinir otesi ticaret kapanmiyor',
      'toplam ithalat = toplam ihracat', `sapma ${n2(worst.trade)}`, '');
  }
  if (worst.overfill > 1e-6) {
    finding('HIGH', 'Karsilanma talebi asiyor', 'fulfilled <= demand', `${n2(worst.overfill)}`, '');
  }
  if (worst.supply <= 0.01 && worst.demand <= 0.01 && worst.trade <= 0.01 && worst.overfill <= 1e-6) {
    console.log('  OK  butun akis kimlikleri tutuyor (sapma < 0.01).');
  }
}

// ------------------------------------------- 2) GIRDISIZ URETIM TESTI ---
sub('Girdiyi kes: ust katman gercekten duruyor mu?');
{
  // Iki dunya, ayni tohum. B dunyasinda demir ve komur RGO'lari sifirlanir
  // (province cikti carpanini 0 yapmak icin RGO turu degistirilmez, kalite 0'a
  // cekilir — boylece meslek dagilimi ve nufus aynen kalir).
  const control = headless(SEED);
  const cut = headless(SEED);
  cut.world.forEach((tile) => {
    const rgo = RGO_TYPES[tile.province?.rgo];
    if (rgo && (rgo.goodId === 'iron' || rgo.goodId === 'coal')) tile.province.rgoQuality = 0;
  });
  run(control, 80);
  run(cut, 80);
  const cmp = (world, id) => {
    const g = world.market.goods[id];
    return { supply: g.supply, demand: g.demand, price: g.price };
  };
  const chain = ['iron', 'coal', 'steel', 'tools', 'arms', 'cement', 'glass'];
  console.log(table(chain.map((id) => ({
    id,
    a: cmp(control.world, id),
    b: cmp(cut.world, id),
  })), [
    { label: 'mal', get: (r) => r.id, right: false },
    { label: 'arz(normal)', get: (r) => n2(r.a.supply) },
    { label: 'arz(kesik)', get: (r) => n2(r.b.supply) },
    { label: 'arzFark%', get: (r) => (r.a.supply > 0 ? pct((r.b.supply - r.a.supply) / r.a.supply) : '-') },
    { label: 'fiyat(normal)', get: (r) => n2(r.a.price) },
    { label: 'fiyat(kesik)', get: (r) => n2(r.b.price) },
  ]));
  const ironA = control.world.market.goods.iron.supply;
  const ironB = cut.world.market.goods.iron.supply;
  const steelA = control.world.market.goods.steel.supply;
  const steelB = cut.world.market.goods.steel.supply;
  console.log(`\n  demir arzi ${n2(ironA)} -> ${n2(ironB)} (${pct((ironB - ironA) / Math.max(1e-9, ironA))})`);
  console.log(`  celik arzi ${n2(steelA)} -> ${n2(steelB)} (${pct((steelB - steelA) / Math.max(1e-9, steelA))})`);
  if (ironB < ironA * 0.35 && steelB > steelA * 0.7) {
    finding('HIGH', 'Uretim zinciri girdi kisitini gormuyor',
      'demir/komur kesilince celik uretimi de dusmeli',
      `demir arzi %${(((ironB - ironA) / Math.max(1e-9, ironA)) * 100).toFixed(0)} dustu`
      + ` ama celik arzi yalniz %${(((steelB - steelA) / Math.max(1e-9, steelA)) * 100).toFixed(0)} dustu`,
      'girdi kapisi (marketInputAvailability) KURESEL arz/talep oranidir; bir ulkenin'
      + ' kendi girdisi bitse bile dunya orani iyiyse fabrika tam kapasite uretir');
  }
}

// --------------------------------------- 3) URETICISI/TUKETICISI OLMAYAN ---
sub('Uretim zincirinin olu halkalari (120 hafta)');
{
  const game = headless(SEED);
  run(game, 120);
  const world = game.world;
  const producers = new Set();
  const consumers = new Set();
  for (const type of Object.values(FACTORIES)) {
    for (const id of Object.keys(type.outputs)) producers.add(id);
    for (const id of Object.keys(type.inputs)) consumers.add(id);
  }
  for (const rgo of Object.values(RGO_TYPES)) producers.add(rgo.goodId);
  const rows = GOOD_IDS.map((id) => {
    const g = world.market.goods[id];
    const base = GOODS[id].basePrice;
    return {
      id,
      supply: g.supply,
      demand: g.demand,
      price: g.price,
      ratio: g.price / base,
      ceiling: g.price >= base * 8 - 1e-6,
      floor: g.price <= base * 0.12 + 1e-6,
      built: world.nations.some((n) => (n.economy?.factories ?? [])
        .some((f) => Object.keys(FACTORIES[f.typeId].outputs).includes(id))),
    };
  });
  const dead = rows.filter((r) => r.supply < 1e-6 && r.demand < 1e-6);
  const stuck = rows.filter((r) => r.ceiling || r.floor);
  console.log(`  hic uretilmeyen VE hic talep edilmeyen mal: ${dead.length}/${GOOD_IDS.length}`
    + (dead.length ? ` -> ${dead.map((r) => r.id).join(', ')}` : ''));
  console.log(`  fiyati sinirda cakili mal: ${stuck.length}/${GOOD_IDS.length}`
    + (stuck.length ? ` -> ${stuck.map((r) => `${r.id}(${r.ceiling ? 'tavan' : 'taban'})`).join(', ')}` : ''));
  const noSupply = rows.filter((r) => r.demand > 0.5 && r.supply < 1e-6);
  if (noSupply.length) {
    console.log(`  talebi olup hic arzi olmayan: ${noSupply.map((r) => r.id).join(', ')}`);
  }
  console.log('');
  console.log(table(rows.filter((r) => r.ceiling || r.floor || (r.demand > 0.5 && r.supply < 0.01)), [
    { label: 'mal', get: (r) => r.id, right: false },
    { label: 'arz', get: (r) => n2(r.supply) },
    { label: 'talep', get: (r) => n2(r.demand) },
    { label: 'fiyat', get: (r) => n2(r.price) },
    { label: 'tabanFiyatX', get: (r) => n2(r.ratio) },
    { label: 'tesisKurulu', get: (r) => (r.built ? 'evet' : 'HAYIR') },
  ]));
  if (stuck.length > GOOD_IDS.length * 0.25) {
    finding('MEDIUM', 'Fiyat bandi doygun',
      'fiyatlar arz/talebe gore hareket etmeli',
      `${stuck.length}/${GOOD_IDS.length} mal fiyat sinirinda cakili`,
      stuck.map((r) => r.id).slice(0, 12).join(', '));
  }
}

// ------------------------------------------------- M. KITLIK / BOLLUK ---
section('M. KITLIK VE BOLLUK TESTI');

/** Bir malin dunya uretimini keser ya da katlar; sonuclari nufusta olcer. */
function supplyShock(goodId, factor, weeks = 120, nationId = null) {
  const game = headless(SEED);
  run(game, 60);
  const world = game.world;
  // Olculecek ulke SOKTAN ONCE ve sabit kimlikle secilir. pickNation'i sonda
  // cagirmak senaryolar arasinda farkli ulkeleri karsilastirmaya yol aciyordu.
  const watched = nationId == null ? pickNation(game).id : nationId;
  const populationStart = world.nations[watched].economy.population;
  // Kume dongusu: paylasilan econ'da kare basina `*=` carpani uye sayisi
  // kadar uygulanip kaliteyi factor^hexes'e cekiyordu.
  for (const province of world.provinces ?? []) {
    const rgo = RGO_TYPES[province.econ?.rgo];
    if (rgo?.goodId === goodId) province.econ.rgoQuality *= factor;
  }
  // RGO'su olmayan mallar icin (or. clothes) fabrika kadrosu uzerinden vurulur.
  if (!Object.values(RGO_TYPES).some((r) => r.goodId === goodId)) {
    for (const n of world.nations) {
      for (const f of n.economy?.factories ?? []) {
        if (Object.keys(FACTORIES[f.typeId].outputs).includes(goodId)) {
          f.employees *= factor;
          f.suppressed = factor === 0;
        }
      }
    }
  }
  for (let i = 0; i < weeks; i++) {
    game.turns.endTurn();
    if (factor === 0) {
      for (const n of world.nations) {
        for (const f of n.economy?.factories ?? []) if (f.suppressed) f.employees = 0;
      }
    }
  }
  const nation = world.nations[watched];
  const g = world.market.goods[goodId];
  const flow = nation.economy.goodsFlow[goodId];
  return {
    watched,
    factor,
    price: g.price,
    ratio: g.price / GOODS[goodId].basePrice,
    supply: g.supply,
    demand: g.demand,
    fulfilled: flow.demand > 0 ? flow.fulfilled / flow.demand : 1,
    lowerSat: nation.economy.classes.lower.satisfaction,
    stability: nation.economy.stability,
    population: nation.economy.population,
    populationStart,
    lowerCost: nation.economy.classes.lower.needsCost,
    lowerBudget: nation.economy.classes.lower.needsBudget,
    migration: nation.economy.lastInternalMigration ?? 0,
    factories: nation.economy.factories.length,
  };
}

// Butun soklar AYNI ulkeyi izler; yoksa senaryolar farkli ulkeleri karsilastirir.
const WATCHED = (() => {
  const g = headless(SEED);
  run(g, 60);
  return pickNation(g).id;
})();

for (const goodId of ['food', 'clothes', 'groceries']) {
  sub(`${goodId}: uretim x0 / x1 / x4 (60 hafta isitma + 120 hafta, izlenen ulke #${WATCHED})`);
  const rows = [0, 1, 4].map((f) => supplyShock(goodId, f, 120, WATCHED));
  console.log(table(rows, [
    { label: 'uretimCarpani', get: (r) => `x${r.factor}` },
    { label: 'fiyat', get: (r) => n2(r.price) },
    { label: 'tabanX', get: (r) => n2(r.ratio) },
    { label: 'dunyaArz', get: (r) => n2(r.supply) },
    { label: 'dunyaTalep', get: (r) => n2(r.demand) },
    { label: 'karsilanma', get: (r) => pct(r.fulfilled) },
    { label: 'altSepet', get: (r) => n1(r.lowerCost) },
    { label: 'altButce', get: (r) => n1(r.lowerBudget) },
    { label: 'altMemnun', get: (r) => n2(r.lowerSat) },
    { label: 'istikrar', get: (r) => n2(r.stability) },
    { label: 'nufus', get: (r) => n0(r.population) },
    { label: 'icGoc', get: (r) => n0(r.migration) },
  ]));
  const zero = rows[0];
  const base = rows[1];
  const popDrop = (base.population - zero.population) / Math.max(1, base.population);
  console.log(`\n  ${goodId} tamamen kesildiginde: karsilanma ${pct(base.fulfilled)} -> ${pct(zero.fulfilled)},`
    + ` nufus farki ${pct(popDrop)}, istikrar ${n2(base.stability)} -> ${n2(zero.stability)}`);
  // Esik duz degil: bedel malin SEPETTEKI PAYIYLA orantili olmali. Tahil alt
  // sinif sepetinin (taban fiyatlarla) ~%35'i, konserve ~%28, kiyafet ~%24 —
  // yani tahil kaybi en agir bedeli odetmeli. Olculen: -%8.1 / -%2.8 / -%3.3.
  // TASARIM: kitlik nufusu OLDURMEZ, buyumeyi durdurur ve sinif atlamayi
  // askiya alir (provinces.js "ACLIKTAN OLUM KALDIRILDI"). Olcut bu yuzden
  // mutlak nufus dususu degil, taban kosunun buyumesinin ne kadarinin
  // silindigidir: gida kesilince buyumenin en az yarisi gitmeli.
  const baseGrowth = (base.population - base.populationStart) / Math.max(1, base.populationStart);
  const zeroGrowth = (zero.population - zero.populationStart) / Math.max(1, zero.populationStart);
  const halted = baseGrowth > 0 ? 1 - zeroGrowth / baseGrowth : 0;
  console.log(`  buyume: taban ${pct(baseGrowth)} · kitlik ${pct(zeroGrowth)} · silinen pay ${pct(halted)}`);
  const EXPECTED_HALT = { food: 0.5, clothes: 0.15, groceries: 0.15 };
  if (zero.fulfilled < 0.5 && baseGrowth > 0 && halted < (EXPECTED_HALT[goodId] ?? 0.2)) {
    finding(goodId === 'food' ? 'HIGH' : 'MEDIUM', `${goodId} kitligi -> nufus buyumesi`,
      'temel malin kesilmesi nufus buyumesini gorunur olcude durdurmali',
      `karsilanma ${pct(zero.fulfilled)}'e dustu ama buyumenin yalniz ${pct(halted)}'i silindi`,
      `hane sepeti ${n1(base.lowerCost)} -> ${n1(zero.lowerCost)}, memnuniyet ${n2(base.lowerSat)} -> ${n2(zero.lowerSat)}`);
  }
  const abundant = rows[2];
  if (abundant.ratio <= 0.13) {
    console.log(`  NOT: x4 bollukta ${goodId} fiyati taban sinirina (${n2(abundant.price)}) oturdu.`);
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
