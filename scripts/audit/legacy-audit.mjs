// Z. ESKI / TERK EDILMIS SISTEM DENETIMI
//
// Soru: kaldirilmis ya da yarim kalmis bir mekanik hala simulasyonu
// etkiliyor mu? Kod okumak yetmez — her iddia olculur.

import {
  headless, run, runPeaceful, pickNation, section, sub, table, finding,
  reportFindings, n1, n2, n0, pct,
} from './harness.mjs';
import {
  EQUIPMENT_TIERS, MAX_TIER, armyPower, regimentTier, tierInfo, upkeepWeight,
} from '../../src/game/units.js';
import {
  IRON_UPKEEP_TYPES, STARTING_FOOD_STORE, UNIT_UPKEEP, WORKER_FOOD, nationBudget,
} from '../../src/game/cities.js';
import { RESOURCES } from '../../src/world/terrain.js';
import { provinceOutput } from '../../src/game/provinces.js';
import { setFiscalPolicy, priceOf } from '../../src/game/economy.js';

const SEED = 'legacy-audit';

section('Z. ESKI SISTEM DENETIMI');

const game = headless(SEED);
run(game, 300);
const world = game.world;
const nation = pickNation(game);

// ------------------------------------------- 1) TECHIZAT KADEMESI ---
sub('1. EQUIPMENT_TIERS (Levy/Regular/Drilled/Modern)');
{
  const tiers = new Map();
  for (const unit of world.units) {
    for (const r of unit.regiments ?? []) {
      const t = regimentTier(r);
      tiers.set(t, (tiers.get(t) ?? 0) + 1);
    }
  }
  console.log(table(EQUIPMENT_TIERS.map((t) => ({
    ...t,
    count: tiers.get(t.level) ?? 0,
  })), [
    { label: 'kademe', get: (r) => r.level },
    { label: 'ad', get: (r) => r.name, right: false },
    { label: 'gucCarpani', get: (r) => r.power },
    { label: 'bakimCarpani', get: (r) => r.upkeep },
    { label: 'bedeli', get: (r) => (r.cost ? JSON.stringify(r.cost) : '-'), right: false },
    { label: '300h sonra alay', get: (r) => r.count },
  ]));
  const advanced = [...tiers.keys()].filter((t) => t > 1);
  console.log(`  1'den yuksek kademede alay: ${advanced.length ? advanced.join(', ') : 'YOK'}`);
  if (!advanced.length) {
    finding('MEDIUM', 'Techizat kademesi sistemi tamamen olu',
      'ordular zamanla modernlesmeli (kademe 2-4)',
      `300 haftada dunyadaki ${world.units.length} tumenin butun alaylari hala kademe 1 (Levy)`,
      'createRegiment tier:1 verir ve hicbir kod yolu tier degerini yukseltmez.'
      + ' EQUIPMENT_TIERS[2..4] guc (1.15/1.32/1.52) ve bakim (1.6/2.4/3.6) carpanlari'
      + ' ile bedelleri ({gold, iron}) hic kullanilmaz. Ustelik bedel `iron` istiyor;'
      + ' nation.iron turn.start icinde SILINIYOR (delete nation.iron), yani bu bedel'
      + ' odenebilir bile degil.');
  }
}

// ------------------------------------- 2) ESKI KAYNAK HAVUZU (food/timber/iron) ---
sub('2. Eski kaynak havuzu: food / timber / iron');
{
  console.log(`  nation.food tanimli mi: ${nation.food !== undefined}`
    + ` · nation.timber: ${nation.timber !== undefined}`
    + ` · nation.iron: ${nation.iron !== undefined}`);
  const budget = nationBudget(world, nation);
  console.log(table([budget], [
    { label: 'olcum', get: () => 'bu hafta', right: false },
    ...RESOURCES.map((r) => ({ label: `uretim.${r}`, get: (b) => n1(b.production[r]) })),
    ...RESOURCES.map((r) => ({ label: `gider.${r}`, get: (b) => n1(b.upkeep[r]) })),
    ...RESOURCES.map((r) => ({ label: `net.${r}`, get: (b) => n1(b.net[r]) })),
  ]));
  // Ayni tahil hem eski havuzda hem dunya pazarinda sayiliyor mu?
  let marketFood = 0;
  world.forEach((tile) => {
    if (tile.owner !== nation.id) return;
    marketFood += provinceOutput(tile).food ?? 0;
  });
  console.log(`  province tahil uretimi: butce havuzunda ${n1(budget.production.food)},`
    + ` ayni hafta dunya pazarina arz olarak ${n1(marketFood)}`);
  if (budget.production.food > 0 && marketFood > 0) {
    finding('MEDIUM', 'Ayni ham uretim iki ayri ekonomide sayiliyor',
      'bir province\'in tahili ya eski butce havuzuna ya dunya pazarina gitmeli',
      `ayni hafta ayni tahil hem nationBudget.production.food (${n1(budget.production.food)})`
      + ` hem economy.js rawProduction -> market.supply (${n1(marketFood)}) olarak sayiliyor`,
      'cities.js nationBudget ve economy.js rawProduction ayni provinceOutput cagrisini'
      + ' kullanip birbirinden habersiz iki paralel ekonomi besliyor');
  }
  console.log(`  net.food'un tek tuketicisi: growCities (food < 0 ise sehir buyumez)`
    + ` ve workerWeights (isci dagitim agirligi)`);
  console.log(`  net.timber ve net.iron'un tek tuketicisi: workerWeights`);
  const dead = ['timber', 'iron'].filter((r) => budget.production[r] !== 0 || budget.upkeep[r] !== 0);
  if (dead.length) {
    finding('LOW', 'Kereste ve demir havuzlari yalniz kendilerini besliyor',
      'her kaynak bir karar ya da kisit uretmeli',
      `net.timber ${n1(budget.net.timber)} ve net.iron ${n1(budget.net.iron)} her hafta`
      + ' hesaplaniyor ama tek okuyucusu workerWeights: isciyi o kaynaga yonlendiriyor,'
      + ' o da yine ayni sayiyi buyutuyor',
      `IRON_UPKEEP_TYPES (${JSON.stringify(IRON_UPKEEP_TYPES)}) demir gideri uretiyor`
      + ' ama hicbir sey demirsizlikten etkilenmiyor');
  }
}

// ------------------------------------------- 3) SEHIR ERZAK AMBARI ---
sub('3. city.foodStore');
{
  const stores = world.cities.map((c) => c.foodStore);
  const unique = [...new Set(stores)];
  console.log(`  ${world.cities.length} sehir · foodStore degerleri: ${unique.join(', ')}`
    + ` (baslangic sabiti ${STARTING_FOOD_STORE})`);
  const changed = stores.some((v) => v !== STARTING_FOOD_STORE && v !== 0);
  console.log(`  300 haftada degisen var mi: ${changed ? 'evet' : 'HAYIR'}`);
  if (!changed) {
    finding('LOW', 'city.foodStore olu alan',
      'sehir ambari erzak biriktirip kitlikta tuketmeli',
      `300 hafta boyunca butun sehirlerin foodStore degeri ${STARTING_FOOD_STORE} olarak kaldi`,
      'createCity yaziyor, deserialize 0\'a cekiyor, baska hicbir kod okumuyor');
  }
}

// ------------------------------------------- 4) ESKI ORDU KAYDIRAGI ---
sub('4. economy.armySpending (tek kaydirac donemi)');
{
  const before = { ...nation.economy };
  setFiscalPolicy(nation, 'armySpending', 55);
  console.log(`  setFiscalPolicy('armySpending', 55) -> armySpending ${nation.economy.armySpending},`
    + ` militaryWages ${nation.economy.militaryWages},`
    + ` militaryProcurement ${nation.economy.militaryProcurement}`);
  setFiscalPolicy(nation, 'militaryWages', 90);
  console.log(`  sonra militaryWages=90 -> armySpending ${nation.economy.armySpending} (guncellenmiyor),`
    + ` militaryWages ${nation.economy.militaryWages}`);
  console.log(`  armySpending'i okuyan sistem sayisi: 0 (yalniz applyGovernmentLimits kirpiyor)`);
  finding('LOW', 'armySpending olu ama hala kirpiliyor',
    'kaldirilan kaydirac ya tamamen gitmeli ya da tek kaynak olmali',
    'economy.armySpending hicbir sistem tarafindan okunmuyor; yalniz'
    + ' applyGovernmentLimits her hafta onu da parti bandina kirpiyor ve'
    + ' setFiscalPolicy("armySpending") iki yeni kaydiraci birden eziyor',
    'yeni kaydiraclar degistiginde armySpending guncellenmiyor: eski kayittan'
    + ' gelen deger ile gercek ayar kalici olarak ayrisiyor');
  Object.assign(nation.economy, before);
}

// ------------------------------------------- 5) economy.inventory ---
sub('5. economy.inventory (ulusal mal stogu)');
{
  const inv = nation.economy.inventory;
  const nonZero = Object.entries(inv).filter(([, v]) => v > 0);
  console.log(`  sifirdan buyuk kalem: ${nonZero.length}/${Object.keys(inv).length}`);
  console.log(`  ornek: ${nonZero.slice(0, 6).map(([k, v]) => `${k}=${n2(v)}`).join(' · ')}`);
  const before = { ...inv };
  runPeaceful(game, 1);
  const after = nation.economy.inventory;
  const accumulating = Object.keys(before).some((k) => after[k] > before[k] * 1.5 + 1);
  console.log(`  bir hafta sonra birikiyor mu: ${accumulating ? 'evet' : 'HAYIR (uzerine yaziliyor)'}`);
  finding('LOW', 'economy.inventory bir STOK degil',
    'ad "envanter" ama davranis "bu haftaki uretim"',
    'runEconomy her hafta `inventory[id] = ownOutput[id]` ile UZERINE YAZAR;'
    + ' onceki hafta silinir, hicbir sey birikmez',
    'sonuc: oyunda kalici mal stogu yoktur — kitlik bir stogu eritemez,'
    + ' bolluk bir stok olusturamaz, savas oncesi stoklama mumkun degildir'
    + ' (tek istisna MILITARY_EQUIPMENT stoklari)');
}

// ------------------------------------------- 6) ESKI BIRIM TIPLERI ---
sub('6. Kaldirilmis birim tipleri ve sehir adlari');
{
  const { LEGACY_UNIT_TYPES } = await import('../../src/game/units.js');
  const { englishCityName } = await import('../../src/game/cities.js');
  console.log(`  LEGACY_UNIT_TYPES: ${JSON.stringify(LEGACY_UNIT_TYPES)}`);
  console.log(`  eski Turkce sehir adi cevirisi: "Akşehir" -> "${englishCityName('Akşehir')}"`
    + ` · "Şehir-3" -> "${englishCityName('Şehir-3')}"`);
  console.log('  ikisi de yalniz eski kayit gocu icin: aktif simulasyonda etkisi yok.');
}

// ------------------------------------------- 7) gold>0 KAPILARI ---
sub('7. `nation.gold > 0` kapisina bagli gizli sistemler');
{
  const { constructionPower, constructionTaxMultiplier, universityWorkforceBonus, fortDefenseAt } =
    await import('../../src/game/construction.js');
  const tile = world.tiles.find((t) => t.owner === nation.id && t.terrain.passable);
  const probe = (gold) => {
    const saved = nation.gold;
    nation.gold = gold;
    const out = {
      gold,
      power: constructionPower(nation),
      tax: constructionTaxMultiplier(nation),
      uni: universityWorkforceBonus(nation),
      fort: fortDefenseAt(world, nation.id, tile),
    };
    nation.gold = saved;
    return out;
  };
  console.log(table([probe(100), probe(1), probe(0), probe(-1)], [
    { label: 'hazine', get: (r) => r.gold },
    { label: 'insaatGucu', get: (r) => r.power },
    { label: 'vergiCarpani', get: (r) => n2(r.tax) },
    { label: 'universiteBonusu', get: (r) => n2(r.uni) },
    { label: 'kaleSavunmasi', get: (r) => pct(r.fort) },
  ]));
}

// ------------------------------------------- 8) OLU URETIM HALKALARI ---
sub('8. Uretim zincirinin hic kurulmayan halkalari (300 hafta)');
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
  const locked = Object.keys(FACTORIES).filter((id) => (FACTORIES[id].availableFrom ?? 0) > world.turn);
  console.log(`  300. turda acik olup HIC kurulmamis tesis: ${never.length ? never.join(', ') : 'yok'}`);
  console.log(`  henuz acilmamis tesis (availableFrom > ${world.turn}): ${locked.length}`
    + ` -> ${locked.map((id) => `${id}@${FACTORIES[id].availableFrom}`).join(', ')}`);
  const goods = Object.entries(world.market.goods)
    .filter(([, g]) => g.supply < 1e-9 && g.demand < 1e-9).map(([id]) => id);
  console.log(`  ne uretilen ne talep edilen mal: ${goods.length} -> ${goods.join(', ')}`);
  if (never.length) {
    finding('MEDIUM', 'Acik ama hic kurulmayan tesis turleri',
      'her acik tesis turunun en az bir ornegi olmali',
      `${never.join(', ')} 300 turda hicbir ulke tarafindan kurulmadi`,
      'investmentOptions yalniz `factoryMargin > 0` olan turleri secer; girdisi'
      + ' fiyat tavaninda olan tesis kalici olarak negatif marja duser ve kuyruga hic girmez');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
