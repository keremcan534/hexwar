// TEKNOLOJI ETKI DENETIMI
//
// Kural: hicbir arac ipucu simulasyonun kullanmadigi bir etki VAAT EDEMEZ ve
// hicbir degistirici tuketicisiz var olamaz. Her TECH_MODS anahtari icin
// kontrollu bir AC/KAPA olcumu yapilir: ayni dunya, ayni ulus, tek fark
// degistirici. Etki olculemiyorsa denetim bulgu verir.

import {
  headless, pickNation, section, sub, table, finding, reportFindings, n1, n2,
} from './harness.mjs';
import { TECH_MODS, refreshTechModifiers } from '../../src/game/technology.js';
import {
  armyWeeklyDemand, debtCapacity, literacyTargetOf, runEconomy,
} from '../../src/game/economy.js';
import { constructionPower } from '../../src/game/construction.js';
import { provinceOutput } from '../../src/game/provinces.js';
import { trainingCapacity } from '../../src/game/recruitment.js';
import { reinforcementRateOf } from '../../src/game/reinforcement.js';
import { unitAvailable } from '../../src/game/units.js';

const SEED = 'tech-effect';

section('TEKNOLOJI ETKI DENETIMI (AC/KAPA)');

const game = headless(SEED);
for (let i = 0; i < 30; i++) game.turns.endTurn();
const world = game.world;
const nation = pickNation(game);

/** Degistiriciyi elle kurup dunyayi BIR hafta isletir, olcumu dondurur. */
function probe(mods, measure) {
  const savedResearch = nation.research ? { ...nation.research, done: [...nation.research.done] } : null;
  const savedMods = nation.economy.techMods ? { ...nation.economy.techMods } : null;
  nation.economy.techMods = { ...Object.fromEntries(Object.keys(TECH_MODS).map((k) => [k, 0])), ...mods };
  const out = measure();
  nation.economy.techMods = savedMods;
  nation.research = savedResearch;
  return out;
}

const rows = [];
const check = (key, level, measure, unit) => {
  const off = probe({}, measure);
  const on = probe({ [key]: level }, measure);
  const delta = off !== 0 ? (on - off) / Math.abs(off) : (on === 0 ? 0 : Infinity);
  rows.push({ key, level, off, on, delta, unit });
  return { off, on, delta };
};

// Her olcum saf fonksiyon uzerinden: tek haftalik tam kosunun gurultusu yok.
const rgoTotal = () => {
  let sum = 0;
  const scratch = {};
  for (const province of world.provinces) {
    if (province.owner !== nation.id || !province.econ) continue;
    const out = provinceOutput(world, province, scratch);
    for (const k in out) if (k !== 'gold') sum += out[k];
  }
  return sum;
};
check('rgoOutput', 0.2, rgoTotal, 'ham cikti');
check('constructionPower', 0.5, () => constructionPower(nation), 'insaat gucu');
check('supplyConsumption', -0.2, () => {
  const { fullDemand } = armyWeeklyDemand(world, nation);
  return Object.values(fullDemand).reduce((s, v) => s + v, 0);
}, 'ordu tuketimi');
// Fabrika ciktisi/girdisi tam kosuyla olculur: runFactories'in yolu uzun.
const factoryProbe = (mods) => probe(mods, () => {
  // techMods'u runEconomy'nin refreshTechModifiers'i ezmesin diye research'e
  // sahte kayit koymak yerine olcumden once yeniden yazariz. refresh yalniz
  // techMods yokken kosar (beginEconomy) — varsa dokunmaz.
  runEconomy(game);
  const f = nation.economy.factories[0];
  return { throughput: nation.economy.factories.reduce((s, x) => s + x.throughput, 0),
    demand: nation.economy.goodsFlow[Object.keys(f ? {} : {})] };
});
{
  const off = factoryProbe({}).throughput;
  const on = factoryProbe({ factoryThroughput: 0.5 }).throughput;
  rows.push({ key: 'factoryThroughput', level: 0.5, off, on, delta: off ? (on - off) / off : 0, unit: 'toplam throughput' });
}
{
  const inputDemand = () => {
    runEconomy(game);
    return nation.economy.goodsFlow.iron.demand + nation.economy.goodsFlow.coal.demand
      + nation.economy.goodsFlow.cotton.demand + nation.economy.goodsFlow.timber.demand;
  };
  const off = probe({}, inputDemand);
  const on = probe({ inputEfficiency: 0.3 }, inputDemand);
  rows.push({ key: 'inputEfficiency', level: 0.3, off, on, delta: off ? (on - off) / off : 0, unit: 'girdi talebi' });
}
// Yeni anahtarlar — hepsi SAF fonksiyon uzerinden (tam kosu gurultusu yok).
check('literacyReach', 0.15, () => literacyTargetOf(nation), 'okuryazarlik hedefi');
check('debtCapacityBonus', 0.5, () => debtCapacity(nation), 'borc kapasitesi');
check('trainingCapacity', 2, () => trainingCapacity(world, nation), 'egitim kadrosu');
check('reinforcementRate', 0.3, () => reinforcementRateOf(nation), 'takviye hizi');
// Birim kilidi: arastirmasiz ARMOR 1836'da kapali, arastirmayla ACIK olmali.
{
  const offAvail = unitAvailable('ARMOR', 1, nation) ? 1 : 0;
  const saved = nation.research ? { ...nation.research, done: [...nation.research.done] } : null;
  nation.research = { points: 0, current: null, done: ['armoured_warfare'] };
  const onAvail = unitAvailable('ARMOR', 1, nation) ? 1 : 0;
  nation.research = saved;
  rows.push({ key: 'unlockUnit(ARMOR)', level: 1, off: offAvail, on: onAvail, delta: onAvail - offAvail, unit: 'erisim (0/1)' });
}

console.log(table(rows, [
  { label: 'degistirici', get: (r) => r.key, right: false },
  { label: 'seviye', get: (r) => n2(r.level) },
  { label: 'kapali', get: (r) => n2(r.off) },
  { label: 'acik', get: (r) => n2(r.on) },
  { label: 'fark', get: (r) => `${(r.delta * 100).toFixed(1)}%` },
  { label: 'olcut', get: (r) => r.unit, right: false },
]));

for (const row of rows) {
  const expectSign = row.key === 'supplyConsumption' || row.key === 'inputEfficiency' ? -1 : 1;
  if (!(row.delta * expectSign > 0.01)) {
    finding('HIGH', `TECH_MODS.${row.key} olcumde etkisiz`,
      'her degistirici anahtarinin olculebilir bir simulasyon tuketicisi olmali',
      `seviye ${row.level} verildi, ${row.unit} ${n1(row.off)} -> ${n1(row.on)} (${(row.delta * 100).toFixed(1)}%)`,
      'ya kablo kopuk ya degistirici olu — P1-6 kurali: tuketicisiz degistirici tutulmaz');
  }
}

// Anahtar kumesi ile tasinan etkiler birbirini tutmali: tabloda olmayan
// anahtar tasiyan teknoloji de, hic tasinmayan anahtar da bulgu.
import('../../src/game/technology.js').then(({ TECHNOLOGIES }) => {
  const carried = new Set();
  for (const folders of Object.values(TECHNOLOGIES)) {
    for (const list of Object.values(folders)) {
      for (const tech of list) {
        for (const key of Object.keys(tech)) {
          if (key in TECH_MODS) carried.add(key);
        }
      }
    }
  }
  sub('Anahtar kapsamasi');
  for (const key of Object.keys(TECH_MODS)) {
    console.log(`  ${key}: ${carried.has(key) ? 'en az bir teknoloji tasiyor' : 'HIC TASINMIYOR'}`);
    if (!carried.has(key)) {
      finding('MEDIUM', `TECH_MODS.${key} anahtarini hicbir teknoloji tasimiyor`,
        'tabloda duran her anahtar en az bir teknolojide gecmeli',
        `${key} TECH_MODS icinde ama TECHNOLOGIES icinde hic kullanilmiyor`, '');
    }
  }
  process.exit(reportFindings() > 0 ? 1 : 0);
});
