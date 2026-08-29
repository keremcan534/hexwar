// I + J. FABRIKA ISTISMAR VE SUBVANSIYON TESTI

import {
  headless, run, pickNation, asPlayer, snapshotNation, section, sub, table,
  finding, reportFindings, n1, n2, n0, pct, GOODS,
} from './harness.mjs';
import {
  FACTORIES, MAX_FACTORY_LEVEL, WORKERS_PER_LEVEL, expansionCost, factoryCost,
  factoryJobs, factoryMargin, priceOf,
} from '../../src/game/economy.js';

const SEED = 'factory-audit';

section('I. FABRIKA KARLILIK TABLOSU');

// -------------------------------------------------- 1) KARLILIK TABLOSU ---
sub('Taban fiyatlarla ve 200 haftalik gercek dunya fiyatlariyla marj');
{
  const game = headless(SEED);
  run(game, 200);
  const world = game.world;
  const built = new Map();
  for (const n of world.nations) {
    for (const f of n.economy?.factories ?? []) {
      built.set(f.typeId, (built.get(f.typeId) ?? 0) + 1);
    }
  }
  const baseMargin = (typeId) => {
    const t = FACTORIES[typeId];
    const rev = Object.entries(t.outputs).reduce((s, [id, a]) => s + GOODS[id].basePrice * a, 0);
    const inp = Object.entries(t.inputs).reduce((s, [id, a]) => s + GOODS[id].basePrice * a, 0);
    return { rev, inp, margin: rev - inp - 1.2 };
  };
  const rows = Object.keys(FACTORIES).map((typeId) => {
    const b = baseMargin(typeId);
    const live = factoryMargin(world, typeId);
    return {
      typeId,
      from: FACTORIES[typeId].availableFrom ?? 0,
      baseRev: b.rev,
      baseInp: b.inp,
      baseMargin: b.margin,
      liveMargin: live,
      built: built.get(typeId) ?? 0,
    };
  }).sort((a, b) => b.liveMargin - a.liveMargin);
  console.log(table(rows, [
    { label: 'tesis', get: (r) => r.typeId, right: false },
    { label: 'acilisTuru', get: (r) => r.from },
    { label: 'tabanGelir', get: (r) => n2(r.baseRev) },
    { label: 'tabanGirdi', get: (r) => n2(r.baseInp) },
    { label: 'tabanMarj', get: (r) => n2(r.baseMargin) },
    { label: 'canliMarj@200', get: (r) => n2(r.liveMargin) },
    { label: 'dunyadaKurulu', get: (r) => r.built },
  ]));
  const neverProfitable = rows.filter((r) => r.baseMargin <= 0);
  const neverBuilt = rows.filter((r) => r.built === 0 && r.from <= 200);
  const dominant = rows.filter((r) => r.built >= 10);
  console.log(`\n  taban fiyatlarda ZATEN zararli tesis: ${neverProfitable.length}`
    + (neverProfitable.length ? ` -> ${neverProfitable.map((r) => `${r.typeId}(${n2(r.baseMargin)})`).join(', ')}` : ''));
  console.log(`  200 turda acik olup dunyada HIC kurulmamis tesis: ${neverBuilt.length}`
    + (neverBuilt.length ? ` -> ${neverBuilt.map((r) => r.typeId).join(', ')}` : ''));
  console.log(`  10+ ornekle baskin tesis: ${dominant.map((r) => `${r.typeId} x${r.built}`).join(', ') || 'yok'}`);
  if (neverProfitable.length) {
    finding('MEDIUM', 'Matematiksel olarak hep zararli tesisler',
      'her tesis taban fiyatlarda pozitif (dar da olsa) marj vermeli',
      `${neverProfitable.length} tesis taban fiyatlarda zararli`,
      neverProfitable.map((r) => `${r.typeId} ${n2(r.baseMargin)}`).join(' · '));
  }
  if (neverBuilt.length) {
    finding('MEDIUM', 'Hic kurulmayan tesis turleri',
      'acilan her tesis turunun dunyada en az bir ornegi olmali',
      `${neverBuilt.length} tur 200 turda hic kurulmadi`,
      neverBuilt.map((r) => `${r.typeId} (canliMarj ${n2(r.liveMargin)})`).join(' · '));
  }
}

// ------------------------------------------------- 2) ISCI MUHASEBESI ---
sub('Isci muhasebesi: kadro > nufus mumkun mu, ayni isci iki tesise sayiliyor mu');
{
  const game = headless(SEED);
  run(game, 200);
  const world = game.world;
  let worstProvince = null;
  let doubleCount = 0;
  let overJobs = 0;
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const factories = nation.economy.factories ?? [];
    const employed = factories.reduce((s, f) => s + f.employees, 0);
    // Ulusal: fabrika kadrosu ISGUCUNU asamaz (basit cekirdek: meslek
    // sayaci artik depo degil turetme, tavan dogrudan isgucudur).
    const workforce = nation.economy.workforce ?? 0;
    if (employed > workforce + 1) doubleCount = Math.max(doubleCount, employed - workforce);
    for (const f of factories) {
      if (f.employees > factoryJobs(f) + 1e-6) overJobs = Math.max(overJobs, f.employees - factoryJobs(f));
    }
  }
  // Mekansal korunum: kadronun yerel nufusu asan kismi BANLIYOCULUKTUR ve
  // ayni ulkenin diger provinslerinden dusulmelidir (economy.runFactories
  // banliyo duzeltmesi). Eski "kadro ≤ yerel nufus" beklentisi yanlis
  // degismezdi: kadro ulusal havuzdan dolar, fazlanin kaybolmamasi gerekir.
  // DUNYA duzeyinde olculur: isgal altindaki karede yabanci fabrika, fazlayi
  // KENDI ulkesinin provinslerine banliyo olarak yazar — ulke bazli gruplama
  // bu karisimda yaniltici. Emegin korunmasi kuresel bir kimliktir:
  // Σ(yerel nufusu asan kadro) = Σ(banliyoculuk).
  let overflow = 0;
  let commuters = 0;
  for (const province of world.provinces ?? []) {
    const econ = province.econ;
    if (!econ) continue;
    overflow += Math.max(0, (econ.industrialEmployees ?? 0) - Math.max(0, econ.population));
    commuters += Math.max(0, econ.industrialCommuters ?? 0);
  }
  const mismatch = Math.abs(overflow - commuters);
  console.log(`  fabrika kadrosu > seviye kapasitesi: en kotu ${n2(overJobs)} kisi`);
  console.log(`  ulusal fabrika kadrosu > 'workers' meslek sayaci: en kotu ${n0(doubleCount)} kisi`);
  console.log(`  yerel nufusu asan kadro ${n0(overflow)} kisi vs banliyoculuk ${n0(commuters)}`
    + ` (sapma ${n2(mismatch)})`);
  if (overJobs > 1e-6) {
    finding('HIGH', 'Fabrika kadrosu kapasiteyi asiyor', 'employees <= level*2000', `${n2(overJobs)} fazla`, '');
  }
  if (doubleCount > 1) {
    finding('HIGH', 'Ayni isci birden fazla yerde sayiliyor',
      'toplam fabrika kadrosu ulusal isci sayacini asamaz', `${n0(doubleCount)} kisi fazla`, '');
  }
  // Tolerans nufus adimlarindan: hafta icinde nufus/kadro degisir, banliyo
  // haftada bir runFactories'te tazelenir — bir haftalik kayma normaldir.
  if (mismatch > Math.max(500, overflow * 0.1)) {
    finding('HIGH', 'Banliyo emegi korunmuyor',
      'yerel nufusu asan kadro toplami = banliyoculuk toplami (dunya)',
      `fazla ${n0(overflow)} vs banliyo ${n0(commuters)}`, '');
  }
}

// ----------------------------------------- 3) URETIM/YUKSELME KACAGI ---
sub('Kontrolsuz buyume: seviye tavani ve maliyet egrisi gercekten frenliyor mu');
{
  const game = headless(SEED);
  run(game, 400);
  const world = game.world;
  const rows = world.nations.filter((n) => n.alive).map((n) => {
    const f = n.economy.factories ?? [];
    return {
      id: n.id,
      count: f.length,
      levels: f.reduce((s, x) => s + x.level, 0),
      maxed: f.filter((x) => x.level >= MAX_FACTORY_LEVEL).length,
      topLevel: f.reduce((m, x) => Math.max(m, x.level), 0),
      fill: n.economy.factories.length
        ? f.reduce((s, x) => s + x.employees, 0) / Math.max(1, f.reduce((s, x) => s + factoryJobs(x), 0))
        : 1,
      profit: n.economy.factoryProfit,
      gold: n.gold,
    };
  }).sort((a, b) => b.levels - a.levels);
  console.log(table(rows.slice(0, 8), [
    { label: 'ulke', get: (r) => r.id },
    { label: 'tesis', get: (r) => r.count },
    { label: 'toplamSeviye', get: (r) => r.levels },
    { label: 'enUstSeviye', get: (r) => r.topLevel },
    { label: 'tavandaki', get: (r) => r.maxed },
    { label: 'doluluk', get: (r) => pct(r.fill) },
    { label: 'fabrikaKar', get: (r) => n1(r.profit) },
    { label: 'hazine', get: (r) => n0(r.gold) },
  ]));
  const nation = world.nations[rows[0].id];
  const sample = nation.economy.factories[0];
  if (sample) {
    console.log(`\n  maliyet egrisi: yeni tesis ${JSON.stringify(factoryCost(nation, sample.typeId))}`
      + ` · seviye atlama (lv${sample.level}) ${JSON.stringify(expansionCost(sample))}`
      + ` · lv9 ${JSON.stringify(expansionCost({ level: 9 }))}`);
  }
  console.log(`  400 haftada en buyuk sanayi: ${rows[0].count} tesis / ${rows[0].levels} seviye`
    + ` (tavan seviye ${MAX_FACTORY_LEVEL}, kadro ${WORKERS_PER_LEVEL}/seviye)`);
}

// --------------------------------------- 4) FABRIKA KARININ VARIS YERI ---
sub('Fabrika kari nereye gidiyor? (hazine, hane geliri, ozel sermaye)');
{
  const game = headless(SEED);
  run(game, 150);
  const nation = pickNation(game);
  const s = snapshotNation(game.world, nation);
  console.log(`  haftalik fabrika kari ${n1(s.factoryProfit)} · devlet geliri ${n2(s.income)}`
    + ` · vergi ${n2(s.taxRevenue)} · ozel sermaye ${n1(s.privateCapital)} (tavan 1200)`);
  console.log(`  ust sinif gelir ${n2(nation.economy.classes.upper.income)} / hafta`);
  const ratio = s.factoryProfit / Math.max(1, s.income);
  console.log(`  fabrika kari / devlet geliri orani: ${n1(ratio)}x`);
  if (ratio > 2) {
    finding('HIGH', 'Sanayi kari hicbir yere akmiyor',
      'fabrika kari hane gelirine ya da hazineye baglanmali',
      `haftalik ${n1(s.factoryProfit)} altin kar uretiliyor; hazineye 0, hane gelirine 0 gidiyor,`
      + ` yalniz %8'i ozel sermayeye (tavan 1200) yaziliyor`,
      `sinif geliri incomePool = uretimDegeri x 0.18/0.22 formulunden gelir, kardan degil`
      + ` — kar/zarar hane butcesini hic degistirmez`);
  }
}

// ------------------------------------------------------ J. SUBVANSIYON ---
section('J. SUBVANSIYON ISTISMAR TESTI');

sub('Kasten zararli tesisler kur, sübvansiyonu ac, 100 hafta isle');
{
  const game = headless(SEED);
  run(game, 80);
  const nation = asPlayer(game, pickNation(game));
  const world = game.world;
  const before = snapshotNation(world, nation);

  // Kasten zararli tesis: girdi/cikti orani kotu olan turlerden secilir ve
  // seviyesi yukseltilir ki zarar buyusun.
  const worst = Object.keys(FACTORIES)
    .map((typeId) => ({ typeId, m: factoryMargin(world, typeId) }))
    .sort((a, b) => a.m - b.m).slice(0, 4);
  const capital = world.cities.find((c) => c.nationId === nation.id);
  for (const { typeId } of worst) {
    nation.economy.factories.push({
      id: `audit-${typeId}`, typeId, q: capital.tile.q, r: capital.tile.r,
      level: 5, employees: 5 * 2000, profit: 0, margin: 0, throughput: 0,
      fundedBy: 'state', subsidized: true,
      ...(typeId === 'ARMS_FACTORY' ? { lineEquipment: 'arms', lineEfficiency: 1, lineOutput: 0 } : {}),
    });
  }
  console.log(`  eklenen zararli tesisler: ${worst.map((w) => `${w.typeId}(marj ${n2(w.m)})`).join(', ')}`);

  let paid = 0;
  let produced = 0;
  const goldStart = nation.gold;
  for (let i = 0; i < 100; i++) {
    // Kadroyu zorla tut: normal isten cikarma tesisi bosaltip zarari sifirlar,
    // o zaman subvansiyonun bedeli de olculemez.
    for (const f of nation.economy.factories) {
      if (f.id.startsWith('audit-')) {
        f.employees = factoryJobs(f);
        f.subsidized = true;
      }
    }
    game.turns.endTurn();
    paid += nation.economy.ledger?.subsidyCost ?? 0;
    for (const f of nation.economy.factories) {
      if (!f.id.startsWith('audit-')) continue;
      const t = FACTORIES[f.typeId];
      for (const [id, a] of Object.entries(t.outputs)) produced += a * (f.throughput ?? 0) * priceOf(world, id);
    }
  }
  const after = snapshotNation(world, nation);
  const audited = nation.economy.factories.filter((f) => f.id.startsWith('audit-'));
  console.log(table(audited, [
    { label: 'tesis', get: (f) => f.typeId, right: false },
    { label: 'seviye', get: (f) => f.level },
    { label: 'kadro', get: (f) => n0(f.employees) },
    { label: 'throughput', get: (f) => n2(f.throughput) },
    { label: 'kar', get: (f) => n2(f.profit) },
    { label: 'sonHaftaSubvansiyon', get: (f) => n2(f.subsidyPaid ?? 0) },
  ]));
  console.log(`\n  100 haftada odenen toplam subvansiyon: ${n1(paid)} altin`);
  console.log(`  ayni surede bu tesislerin urettigi mal degeri: ${n1(produced)} altin`);
  console.log(`  hazine ${n0(goldStart)} -> ${n0(after.gold)} (borc ${n0(before.debt)} -> ${n0(after.debt)})`);
  const allZero = audited.every((f) => Math.abs(f.profit) < 1e-9);
  console.log(`  butun destekli tesislerin kari tam 0'a cekildi mi: ${allZero ? 'evet' : 'HAYIR'}`);
  if (paid < 1) {
    finding('HIGH', 'Subvansiyon bedeli tahsil edilmiyor',
      'devlet isaretli tesisin zararini gercekten odemeli',
      `100 haftada yalnizca ${n2(paid)} altin odendi`, '');
  } else {
    console.log(`  OK  subvansiyon gercek bir hazine gideri (haftalik ort. ${n2(paid / 100)}).`);
  }
  if (produced > paid * 3 && paid > 0) {
    finding('MEDIUM', 'Subvansiyon fiyat/performans',
      'zarar kapatmak, uretilen mal degerinden ucuz olmamali',
      `${n1(paid)} altin subvansiyonla ${n1(produced)} altinlik mal uretildi (${n1(produced / paid)}x)`,
      'kasten zararli tesisleri destekleyip mal basmak net kazanc olabilir');
  }
}

// --------------------------------- J2. YZ kendini subvansiyonla oldurur mu ---
sub('YZ subvansiyon davranisi (400 hafta, butun uluslar)');
{
  const game = headless(SEED);
  run(game, 400);
  const rows = game.world.nations.filter((n) => n.alive).map((n) => ({
    id: n.id,
    factories: n.economy.factories.length,
    subsidized: n.economy.factories.filter((f) => f.subsidized).length,
    subsidyCost: n.economy.ledger?.subsidyCost ?? 0,
    gold: n.gold,
    debt: n.debt ?? 0,
    atWar: game.world.nations.some((o) => o.alive && o.id !== n.id
      && game.world.relations?.[n.id]?.[o.id]?.state === 'war'),
  })).sort((a, b) => b.subsidized - a.subsidized);
  console.log(table(rows, [
    { label: 'ulke', get: (r) => r.id },
    { label: 'tesis', get: (r) => r.factories },
    { label: 'destekli', get: (r) => r.subsidized },
    { label: 'haftalikBedel', get: (r) => n2(r.subsidyCost) },
    { label: 'hazine', get: (r) => n0(r.gold) },
    { label: 'borc', get: (r) => n0(r.debt) },
    { label: 'savasta', get: (r) => (r.atWar ? 'evet' : '-') },
  ]));
  const suicidal = rows.filter((r) => r.subsidyCost > 20 && r.debt > 500);
  if (suicidal.length) {
    finding('MEDIUM', 'YZ subvansiyonla batiyor', 'YZ borc krizinde destekleri kesmeli',
      `${suicidal.length} ulke hem yuksek subvansiyon hem yuksek borc tasiyor`, '');
  } else {
    console.log('  YZ hicbir ulkede subvansiyonla borc sarmalina girmedi.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
