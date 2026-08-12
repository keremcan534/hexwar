// DETERMINIZM DENETIMI
//
// Iddia: ayni tohum ayni oyunu vermeli. Olcum: vermiyor.
//
// Kok neden zinciri:
//   units.js:270   `let nextId = 1`  — modul duzeyi, dunyalar arasi paylasilan sayac
//   command.js:723 `(turn + unit.id) % cadence` — hangi tumenin o hafta taarruz
//                  edecegini birimin MUTLAK kimligine gore secer
//
// Sonuc: bir oturumda ikinci kez `newWorld(SEED)` cagirmak (ya da bir kayit
// yukleyip devam etmek) ayni tohumla FARKLI bir oyun uretir.

import {
  headless, run, section, sub, table, finding, reportFindings, n0, n2,
} from './harness.mjs';

const SEED = 'determinism-audit';
const WEEKS = 40;

/** Dunyanin kompakt parmak izi. */
function fingerprint(game) {
  let pop = 0;
  game.world.forEach((t) => { if (t.province) pop += t.province.population; });
  const nations = game.world.nations.filter((n) => n.alive)
    .map((n) => `${n.id}:${n.gold.toFixed(2)}:${n.tiles}:${n.economy.factories.length}`).join(',');
  return {
    population: pop,
    units: game.world.units.length,
    cities: game.world.cities.length,
    foodPrice: Number(game.world.market.goods.food.price.toFixed(6)),
    nations,
  };
}

section('DETERMINIZM: ayni tohum, ayni oyun mu?');

sub(`Ayni surecte arka arkaya ${5} dunya (hepsi tohum "${SEED}", ${WEEKS} hafta)`);
const rows = [];
for (let i = 0; i < 5; i++) {
  const game = headless(SEED);
  const firstUnitId = game.world.units[0].id;
  run(game, WEEKS);
  rows.push({ index: i + 1, firstUnitId, ...fingerprint(game) });
}
console.log(table(rows, [
  { label: 'kacinciDunya', get: (r) => r.index },
  { label: 'ilkBirimKimligi', get: (r) => r.firstUnitId },
  { label: 'toplamNufus', get: (r) => n0(r.population) },
  { label: 'birim', get: (r) => r.units },
  { label: 'sehir', get: (r) => r.cities },
  { label: 'tahilFiyati', get: (r) => n2(r.foodPrice) },
  { label: 'ilkUlkeler', get: (r) => r.nations.slice(0, 30), right: false },
]));

const distinct = new Set(rows.map((r) => JSON.stringify({
  p: r.population, u: r.units, c: r.cities, f: r.foodPrice, n: r.nations,
})));
console.log(`\n  5 kosuda farkli sonuc sayisi: ${distinct.size} (1 olmali)`);

if (distinct.size > 1) {
  finding('CRITICAL', 'Ayni tohum ayni oyunu vermiyor (surec ici durum sizintisi)',
    'ayni tohumla kurulan her dunya birebir ayni simulasyonu uretmeli',
    `ayni surecte arka arkaya kurulan 5 dunya ${distinct.size} farkli sonuc verdi;`
    + ` nufus ${rows.map((r) => n0(r.population)).join(' / ')}`,
    'units.js:270 `let nextId = 1` modul duzeyindedir ve dunya kurulunca sifirlanmaz;'
    + ' command.js:723 `(turn + unit.id) % cadence` hangi tumenin o hafta taarruz'
    + ' edecegine birimin MUTLAK kimligiyle karar verir. Ikinci dunyanin birimleri'
    + ' farkli kimlik araliginda dogar, cephe temposu kayar, savaslar baska sonuclanir.'
    + ' Ayni kok neden save/load dallanmasini da aciklar (bkz. save-audit).');
}

sub('Kanit: yalniz kimlik sayacini ilerletmek bile sonucu degistiriyor');
{
  const probe = [];
  for (const bump of [0, 1, 2, 3]) {
    // Onceki dunyalarda HIC tur isletilmez: tek degisen sey kimlik sayacinin
    // baslangic degeri. Simulasyona baska hicbir sey sizmaz.
    for (let i = 0; i < bump; i++) headless('throwaway');
    const game = headless(SEED);
    const firstUnitId = game.world.units[0].id;
    run(game, 30);
    probe.push({ bump, firstUnitId, ...fingerprint(game) });
  }
  console.log(table(probe, [
    { label: 'oncekiBosDunya', get: (r) => r.bump },
    { label: 'ilkBirimKimligi', get: (r) => r.firstUnitId },
    { label: 'toplamNufus', get: (r) => n0(r.population) },
    { label: 'birim', get: (r) => r.units },
    { label: 'tahilFiyati', get: (r) => n2(r.foodPrice) },
  ]));
  const unique = new Set(probe.map((r) => r.population));
  console.log(`\n  farkli nufus sonucu: ${unique.size}/4`);
  console.log('  NOT: onceki dunyalarda tek bir tur bile isletilmedi — tek fark birim kimlikleri.');
}

sub('Kontrol: ayri SURECLERDE ayni tohum ayni sonucu veriyor mu?');
console.log('  (bkz. harness.runScenario — butun denetimler bu yuzden surec izolasyonu kullanir)');
{
  const { runScenario } = await import('./harness.mjs');
  const out = [0, 1, 2].map(() => runScenario({
    seed: SEED, warmup: 0, weeks: WEEKS, asPlayer: false,
  }));
  const same = out.every((r) => r.snap.population === out[0].snap.population
    && r.snap.gold === out[0].snap.gold);
  console.log(`  3 ayri surec: nufus ${out.map((r) => n0(r.snap.population)).join(' / ')}`
    + ` · hazine ${out.map((r) => n2(r.snap.gold)).join(' / ')}`);
  console.log(`  ${same ? 'OK  ayri sureclerde determinizm TAM.' : 'BOZUK: ayri sureclerde de degisiyor.'}`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
