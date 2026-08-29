// Z. ESKI / TERK EDILMIS SISTEM DENETIMI
//
// Soru: kaldirilmis ya da yarim kalmis bir mekanik hala simulasyonu
// etkiliyor mu? Budama gecisinden (v15) sonra bu dosyanin isi tersine dondu:
// artik olu mekanik ARAMAZ, kaldirilanlarin GERI SIZMADIGINI dogrular.
// (Eski bulgular: EQUIPMENT_TIERS, city.foodStore, economy.inventory,
// armySpending alani — hepsi kaldirildi; bkz. MECHANIC_PRUNING_IMPLEMENTATION_LOG.)

import {
  headless, run, pickNation, section, sub, table, finding,
  reportFindings, n1,
} from './harness.mjs';
import { IRON_UPKEEP_TYPES, nationBudget } from '../../src/game/cities.js';
import { RESOURCES } from '../../src/world/terrain.js';
import { setBudgetPolicy } from '../../src/game/economy.js';

const SEED = 'legacy-audit';

section('Z. ESKI SISTEM DENETIMI');

const game = headless(SEED);
run(game, 300);
const world = game.world;
const nation = pickNation(game);

// ------------------------------------------- 1) KALDIRILANLAR GERI SIZMASIN ---
sub('1. Kaldirilan olu alanlar (tier / foodStore / inventory / armySpending)');
{
  const tiered = world.units.some((u) => (u.regiments ?? []).some((r) => 'tier' in r));
  const foodStores = world.cities.some((c) => 'foodStore' in c);
  const inventories = world.nations.some((n) => n.economy && 'inventory' in n.economy);
  console.log(`  regiment.tier tasiyan birim: ${tiered ? 'VAR' : 'yok'}`
    + ` · city.foodStore: ${foodStores ? 'VAR' : 'yok'}`
    + ` · economy.inventory: ${inventories ? 'VAR' : 'yok'}`);
  if (tiered || foodStores || inventories) {
    finding('MEDIUM', 'Kaldirilan olu alan geri sizmis',
      'v15 budamasinda silinen alanlar simulasyonda yeniden belirmemeli',
      `tier=${tiered} foodStore=${foodStores} inventory=${inventories}`, '');
  }
}

// ------------------------------------------- 2) ESKI KAYNAK HAVUZU ---
sub('2. Eski kaynak havuzu: food / timber / iron');
{
  console.log(`  nation.food tanimli mi: ${nation.food !== undefined}`
    + ` · nation.timber: ${nation.timber !== undefined}`
    + ` · nation.iron: ${nation.iron !== undefined}`);
  const budget = nationBudget(world, nation);
  console.log(table([budget], [
    { label: 'olcum', get: () => 'bu hafta', right: false },
    ...RESOURCES.map((r) => ({ label: `uretim.${r}`, get: (b) => n1(b.production[r]) })),
    ...RESOURCES.map((r) => ({ label: `net.${r}`, get: (b) => n1(b.net[r]) })),
  ]));
  console.log(`  net.food'un tuketicileri: growCities ve workerWeights;`
    + ` net.timber/iron yalniz workerWeights (bilinen sinirlilik, bkz. REMAINING_MECHANIC_DEBT)`);
  console.log(`  IRON_UPKEEP_TYPES: ${JSON.stringify(IRON_UPKEEP_TYPES)}`);
}

// ------------------------------------------- 3) ESKI KAYDIRAC UYUMLULUGU ---
sub("3. setBudgetPolicy('armySpending') geriye donuk davranisi");
{
  const before = {
    wages: nation.economy.militaryWages,
    procurement: nation.economy.militaryProcurement,
  };
  setBudgetPolicy(nation, 'armySpending', 55);
  const drivesBoth = nation.economy.militaryWages === 55
    && nation.economy.militaryProcurement === 55;
  console.log(`  armySpending=55 -> wages ${nation.economy.militaryWages},`
    + ` procurement ${nation.economy.militaryProcurement} (eski betikler icin surer)`);
  if (!drivesBoth) {
    finding('LOW', 'Eski armySpending anahtari iki kaydiraci surmuyor',
      'geriye donuk API iki yeni kaydiraci birden kurmali', '', '');
  }
  setBudgetPolicy(nation, 'armyFunding', before.wages);
  setBudgetPolicy(nation, 'armyFunding', before.procurement);
}

// ------------------------------------------- 4) ESKI BIRIM TIPLERI ---
sub('4. Kaldirilmis birim tipleri ve sehir adlari (kayit gocu)');
{
  const { LEGACY_UNIT_TYPES } = await import('../../src/game/units.js');
  const { englishCityName } = await import('../../src/game/cities.js');
  console.log(`  LEGACY_UNIT_TYPES: ${JSON.stringify(LEGACY_UNIT_TYPES)}`);
  console.log(`  eski Turkce sehir adi cevirisi: "Akşehir" -> "${englishCityName('Akşehir')}"`);
  console.log('  ikisi de yalniz eski kayit gocu icin: aktif simulasyonda etkisi yok.');
}

// ------------------------------------------- 5) OLU URETIM HALKALARI ---
sub('5. Uretim zincirinin hic kurulmayan halkalari (300 hafta)');
{
  const built = new Map();
  for (const n of world.nations) {
    for (const f of n.economy?.factories ?? []) {
      built.set(f.typeId, (built.get(f.typeId) ?? 0) + 1);
    }
  }
  const { FACTORIES } = await import('../../src/game/economy.js');
  const never = Object.keys(FACTORIES)
    .filter((id) => !built.has(id) && (FACTORIES[id].availableFrom ?? 0) <= world.turn);
  console.log(`  300. turda acik olup HIC kurulmamis tesis: ${never.length ? never.join(', ') : 'yok'}`);
  // Cag kapisi ARKASINDAKI mal olu sayilmaz (telefon 1841'de uretilmez); yalniz
  // BUGUN uretilebilir olup hic akmayan mal bulgudur.
  const producibleNow = new Set();
  for (const type of Object.values(FACTORIES)) {
    if ((type.availableFrom ?? 0) > world.turn) continue;
    for (const id of Object.keys(type.outputs)) producibleNow.add(id);
  }
  const { RGO_TYPES } = await import('../../src/game/provinces.js');
  for (const rgo of Object.values(RGO_TYPES)) producibleNow.add(rgo.goodId);
  const goods = Object.entries(world.market.goods)
    .filter(([id, g]) => producibleNow.has(id) && g.supply < 1e-9 && g.demand < 1e-9)
    .map(([id]) => id);
  console.log(`  bugun uretilebilir olup ne uretilen ne talep edilen mal: ${goods.length}`
    + ` -> ${goods.join(', ') || 'yok'}`);
  if (goods.length) {
    finding('MEDIUM', 'Tuketicisiz/ureticisiz mal var',
      'bugun uretilebilir her malin en az bir gercek akisi olmali (budama kurali)',
      goods.join(', '),
      'uretim zincirinin bu halkalari olu: ya tuketici baglanmali ya mal katalogdan cikmali');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
