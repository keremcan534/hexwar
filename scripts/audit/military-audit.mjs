// R + S + T. SAVAS EKONOMISI, INSAN GUCU, SAVAS STRESI
//
// Zincirin kanitlanmasi gereken hali:
//   fabrika -> pazar -> tedarik -> stok -> takviye/organizasyon -> muharebe
// Her halkasi ayri ayri kesilip sonucun degisip degismedigi olculur.

import {
  runScenario, headless, run, section, sub, table, finding, reportFindings,
  n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import {
  MILITARY_EQUIPMENT_IDS, equipmentStock, priceOf,
} from '../../src/game/economy.js';
import { RECRUITMENT_EQUIPMENT } from '../../src/game/recruitment.js';
import { battleUnitPower } from '../../src/game/battles.js';

const SEED = 'military-audit';
const WARMUP = 120;

function war(label, opts = {}) {
  return runScenario({
    seed: SEED,
    label,
    warmup: WARMUP,
    weeks: opts.weeks ?? 80,
    peaceful: false,
    levers: opts.levers ?? [],
    mutations: [{ name: 'forceWar', args: { foes: opts.foes ?? 1 } }, ...(opts.mutations ?? [])],
    repeatMutations: opts.repeatMutations ?? [],
    measure: ['army', 'war', 'prices'],
  });
}

const WAR_COLS = [
  { label: 'senaryo', get: (r) => r.label, right: false },
  { label: 'alay', get: (r) => r.snap.regiments },
  { label: 'asker', get: (r) => n0(r.snap.soldiers) },
  { label: 'mevcut%', get: (r) => pct(r.army.strengthRatio) },
  { label: 'ortOrg', get: (r) => n1(r.army.organization) },
  { label: 'saldiriGucu', get: (r) => n1(r.army.power) },
  { label: 'ikmalEndeksi', get: (r) => n2(r.snap.supplyIndex) },
  { label: 'silahStogu', get: (r) => n2(r.snap.arms) },
  { label: 'takviyeTalebi', get: (r) => n0(r.army.need.strength) },
  { label: 'isgalEttigi', get: (r) => r.war.occupiedByUs },
  { label: 'isgalEdilen', get: (r) => r.war.occupiedFromUs },
  { label: 'toprak', get: (r) => r.war.tiles },
  { label: 'hazine', get: (r) => n0(r.snap.gold) },
  { label: 'borc', get: (r) => n0(r.snap.debt) },
  { label: 'tedarikGideri', get: (r) => n2(r.snap.procurementCost) },
];

section('R. SAVAS EKONOMISI — ayni tohum, ayni savas, tek degisken');
console.log(`  tohum ${SEED} · isitma ${WARMUP} hafta · savas 80 hafta · her senaryo ayri surecte`);

// ------------------------------------------------------------- MAAS ---
sub('Askeri maaş: taban (25%) vs tavan (100%) — ayni savas');
{
  const rows = [
    war('maas=taban', { levers: [{ key: 'armyFunding', value: 0 }] }),
    war('maas=tavan', { levers: [{ key: 'armyFunding', value: 100 }] }),
  ];
  console.log(table(rows, WAR_COLS));
  const d = relDelta(rows[0].army.power, rows[1].army.power);
  console.log(`\n  maaş -> saldiri gucu: ${n1(rows[0].army.power)} -> ${n1(rows[1].army.power)} (${pct(d)})`);
  console.log(`  maaş -> toprak: ${rows[0].war.tiles} -> ${rows[1].war.tiles} kare`);
  if (Math.abs(d) < 0.05) {
    finding('HIGH', 'Askeri maaş -> savas sonucu', 'maaş savas sonucunu degistirmeli',
      `guc farki ${pct(d)}`, '');
  }
}

// ---------------------------------------------------------- TEDARIK ---
sub('Askeri tedarik: taban vs tavan — ayni savas');
{
  const rows = [
    war('tedarik=taban', { levers: [{ key: 'armyFunding', value: 0 }] }),
    war('tedarik=tavan', { levers: [{ key: 'armyFunding', value: 100 }] }),
  ];
  console.log(table(rows, WAR_COLS));
  const dSupply = relDelta(rows[0].snap.supplyIndex, rows[1].snap.supplyIndex);
  const dStrength = relDelta(rows[0].army.strengthRatio, rows[1].army.strengthRatio);
  console.log(`\n  tedarik -> ikmal endeksi ${n2(rows[0].snap.supplyIndex)} -> ${n2(rows[1].snap.supplyIndex)} (${pct(dSupply)})`);
  console.log(`  tedarik -> ordu mevcudu ${pct(rows[0].army.strengthRatio)} -> ${pct(rows[1].army.strengthRatio)} (${pct(dStrength)})`);
  if (Math.abs(dSupply) < 0.05) {
    finding('HIGH', 'Tedarik -> ikmal', 'tedarik ikmali degistirmeli', `${pct(dSupply)}`, '');
  }
}

// ------------------------------------------------ MUHIMMAT ZINCIRI ---
sub('Zincir testi: askeri sanayi kapali vs stok tavanda');
{
  const rows = [
    war('sanayi kapali + stok sifir', {
      mutations: [{ name: 'stripEquipment' }, { name: 'killMilitaryIndustry' }],
      repeatMutations: [{ name: 'killMilitaryIndustry' }],
    }),
    war('stok tavanda', {
      repeatMutations: [{ name: 'floodEquipment' }],
    }),
  ];
  console.log(table(rows, WAR_COLS));
  const dry = rows[0];
  const wet = rows[1];
  console.log(`\n  ikmalsiz ordu: mevcut ${pct(dry.army.strengthRatio)} · org ${n1(dry.army.organization)}`
    + ` · saldiri gucu ${n1(dry.army.power)} · isgal ${dry.war.occupiedByUs}`);
  console.log(`  tam ikmalli ordu: mevcut ${pct(wet.army.strengthRatio)} · org ${n1(wet.army.organization)}`
    + ` · saldiri gucu ${n1(wet.army.power)} · isgal ${wet.war.occupiedByUs}`);
  const dPower = relDelta(dry.army.power, wet.army.power);
  if (Math.abs(dPower) < 0.1) {
    finding('HIGH', 'Techizat -> muharebe gucu bagi zayif',
      'mermisiz ordu belirgin daha zayif dovusmeli',
      `stok sifir vs stok tavanda saldiri gucu farki yalniz ${pct(dPower)}`,
      'battleUnitPower yalniz MAAS carpanina bakar; techizat stogu muharebe gucune'
      + ' dogrudan girmez, sadece takviye hizini ve organizasyon toparlanmasini etkiler');
  }
  const strengthGap = wet.army.strengthRatio - dry.army.strengthRatio;
  console.log(`  techizatin gercek kanali (mevcut farki): ${(strengthGap * 100).toFixed(1)} puan`);
}

// --------------------------------------------------- S. INSAN GUCU ---
section('S. INSAN GUCU / ASKER ALIMI');
sub('Techizat asker alimini gercekten sinirliyor mu');
{
  const game = headless(SEED);
  run(game, WARMUP);
  const nation = game.world.nations.filter((n) => n.alive && n.economy)
    .sort((a, b) => b.tiles - a.tiles)[0];
  game.turns.playerNation = nation.id;
  console.log(table(Object.entries(RECRUITMENT_EQUIPMENT).map(([typeId, cost]) => ({
    typeId, cost,
    stock: Object.keys(cost).map((id) => `${id}:${n1(equipmentStock(nation, id))}`).join(' '),
    can: Object.entries(cost).every(([id, amount]) => equipmentStock(nation, id) >= amount),
  })), [
    { label: 'birim', get: (r) => r.typeId, right: false },
    { label: 'techizatBedeli', get: (r) => Object.entries(r.cost).map(([k, v]) => `${v}${k}`).join('+'), right: false },
    { label: 'mevcutStok', get: (r) => r.stock, right: false },
    { label: 'kurulabilir', get: (r) => (r.can ? 'evet' : 'hayir') },
  ]));
  console.log(`\n  stok tavanlari: ${MILITARY_EQUIPMENT_IDS.map((id) => `${id}=${n1(equipmentStock(nation, id))}`).join(' · ')}`);
}

// ------------------------------------------------------ T. SAVAS STRESI ---
section('T. SAVAS STRESI');
sub('Tek cephe vs cok cephe vs uzun savas');
{
  // Bu bolumde ulke OYUNCU DEGIL: tam YZ olarak isler ki savas ekonomisi
  // (birim satin alma, borclanma, sanayi karari) gercekten devreye girsin.
  // Butun senaryolar 260 hafta — esit sure olmadan hazine/sanayi karsilastirmasi
  // anlamsizdir.
  const stress = (label, opts = {}) => runScenario({
    seed: SEED, label, warmup: WARMUP, weeks: 260, asPlayer: false,
    peaceful: opts.peaceful ?? false,
    mutations: opts.peaceful ? [] : [{ name: 'forceWar', args: { foes: opts.foes ?? 1 } }],
    // Savas her hafta tazelenir: barisa oturan cephe testi bitirmesin.
    repeatMutations: opts.peaceful ? [] : [{ name: 'forceWar', args: { foes: opts.foes ?? 1 } }],
    measure: ['army', 'war'],
  });
  const rows = [
    { label: 'baris 260h (kontrol)', r: stress('peace', { peaceful: true }) },
    { label: 'tek cephe 260h', r: stress('one', { foes: 1 }) },
    { label: 'cok cephe 260h', r: stress('multi', { foes: 3 }) },
    { label: 'tum komsular 260h', r: stress('total', { foes: 14 }) },
  ];
  console.log(table(rows, [
    { label: 'senaryo', get: (x) => x.label, right: false },
    { label: 'toprak', get: (x) => x.r.war.tiles },
    { label: 'alay', get: (x) => x.r.snap.regiments },
    { label: 'asker', get: (x) => n0(x.r.snap.soldiers) },
    { label: 'mevcut%', get: (x) => pct(x.r.army.strengthRatio) },
    { label: 'nufus', get: (x) => n0(x.r.snap.population) },
    { label: 'insanGucu', get: (x) => n0(x.r.army.manpower) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
    { label: 'borc', get: (x) => n0(x.r.snap.debt) },
    { label: 'gelir', get: (x) => n2(x.r.snap.income) },
    { label: 'gider', get: (x) => n2(x.r.snap.expenses) },
    { label: 'tedarik', get: (x) => n2(x.r.snap.procurementCost) },
    { label: 'istikrar', get: (x) => n2(x.r.snap.stability) },
    { label: 'ihtiyac', get: (x) => pct(x.r.cohorts.needsFulfilled) },
    { label: 'tesis/seviye', get: (x) => `${x.r.snap.factories}/${x.r.snap.factoryLevels}` },
  ]));
  const peace = rows[0].r;
  const total = rows[3].r;
  const dGold = total.snap.gold - peace.snap.gold;
  const dPop = relDelta(peace.snap.population, total.snap.population);
  console.log(`\n  260 hafta HERKESLE savas vs 260 hafta baris: hazine ${n0(peace.snap.gold)} -> ${n0(total.snap.gold)}`
    + ` (${n0(dGold)}), nufus ${pct(dPop)}, borc ${n0(peace.snap.debt)} -> ${n0(total.snap.debt)},`
    + ` tedarik ${n2(peace.snap.procurementCost)} -> ${n2(total.snap.procurementCost)}/hafta,`
    + ` sanayi ${peace.snap.factories}/${peace.snap.factoryLevels} -> ${total.snap.factories}/${total.snap.factoryLevels}`);
  if (total.snap.debt < 50 && dGold > -500 && Math.abs(dPop) < 0.05) {
    finding('MEDIUM', 'Surekli savas neredeyse bedelsiz',
      '260 hafta kesintisiz cok cepheli savas hazineyi ve nufusu yipratmali',
      `borc ${n0(total.snap.debt)}, hazine farki ${n0(dGold)}, nufus farki ${pct(dPop)}`,
      `savas tempo carpani (wartime 1.0 vs baris 0.35) tedarik faturasini`
      + ` ${n2(peace.snap.procurementCost)} -> ${n2(total.snap.procurementCost)} yapiyor`);
  }
  const multi = rows[2].r;
  console.log(`  cok cephe: ${multi.war.foes.length} dusman, isgal edilen kendi topragimiz ${multi.war.occupiedFromUs},`
    + ` ordu mevcudu ${pct(multi.army.strengthRatio)}, istikrar ${n2(multi.snap.stability)}`);
}

// ---------------------------------------- SAVAS -> PIYASA GERI BESLEMESI ---
sub('Savas askeri mallarin fiyatini oynatiyor mu');
{
  const peace = runScenario({ seed: SEED, warmup: WARMUP, weeks: 80, peaceful: true, measure: ['prices'] });
  const fight = war('fiyat', { foes: 3 });
  const goods = ['arms', 'ammunition', 'fuel', 'groceries', 'artillery'];
  console.log(table(goods.map((id) => ({
    id, peace: peace.prices[id], warp: fight.prices[id],
  })), [
    { label: 'mal', get: (r) => r.id, right: false },
    { label: 'barisFiyati', get: (r) => n2(r.peace) },
    { label: 'savasFiyati', get: (r) => n2(r.warp) },
    { label: 'fark', get: (r) => pct(relDelta(r.peace, r.warp)) },
  ]));
  const armsDelta = relDelta(peace.prices.arms, fight.prices.arms);
  if (Math.abs(armsDelta) < 0.05) {
    finding('MEDIUM', 'Savas -> askeri mal fiyati',
      'savasan ulke piyasadan daha cok mermi cekince fiyat oynamali',
      `silah fiyati fark ${pct(armsDelta)}`,
      'ordu talebi (landUnits x 0.08 x tempo) dunya talebine gore cok kucuk');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
