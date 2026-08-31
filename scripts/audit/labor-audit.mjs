// Isgucu korunumu denetimi — cift sayimin geri donmemesi icin bekci.
//
// Degismezler (her hafta, her ulke):
//   I1  Sfactory.employees <= alt sinifin calisabilir payi        (cift sayim)
//   I2  factory.employees ≤ factoryJobs(factory)                 (kapasite)
//   I3  factory.employees ≥ 0, butun meslek sayaclari ≥ 0        (negatif emek)
//   I4  Σcounts = cohortPopulation                               (sinif esitligi)
//   I5  dunya: Σmax(0, kadro−nufus) ≈ Σbanliyoculuk              (mekansal korunum)
//
// Kontrollu senaryolar: fabrikasiz ulke (A), tek fabrika (B), ayni emege
// yarisan fabrikalar (C), kapanan fabrika (D), hizli buyume (E), yuksek
// issizlik (F), emek kitligi (G).

import { headless } from './harness.mjs';
import { LOWER_WORKFORCE_SHARE, factoryJobs, jobTotalsOf } from '../../src/game/economy.js';

const findings = [];
const finding = (level, title, expected, measured, note) => {
  findings.push({ level, title });
  console.log(`  [${level}] ${title}`);
  console.log(`      beklenen: ${expected}`);
  console.log(`      olculen : ${measured}`);
  if (note) console.log(`      kanit   : ${note}`);
};
const n0 = (v) => Math.round(v).toLocaleString('en-US');

const employedOf = (nation) => (nation.economy?.factories ?? [])
  .reduce((sum, factory) => sum + (factory.employees ?? 0), 0);

function checkInvariants(world, label, worst) {
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    const counts = jobTotalsOf(world, nation);
    const employed = employedOf(nation);
    const workers = counts.workers ?? 0;
    if (employed - workers > 1) {
      worst.I1 = Math.max(worst.I1 ?? 0, employed - workers);
      worst.I1At ??= `${label} ${nation.name}`;
    }
    for (const factory of nation.economy.factories ?? []) {
      if ((factory.employees ?? 0) - factoryJobs(factory) > 1e-6) {
        worst.I2 = Math.max(worst.I2 ?? 0, factory.employees - factoryJobs(factory));
      }
      if ((factory.employees ?? 0) < -1e-9) worst.I3 = Math.min(worst.I3 ?? 0, factory.employees);
    }
    let sum = 0;
    for (const value of Object.values(counts)) {
      if (value < 0) worst.I3 = Math.min(worst.I3 ?? 0, value);
      sum += value;
    }
    if (Math.abs(sum - (nation.economy.cohortPopulation ?? sum)) > 1) {
      worst.I4 = Math.max(worst.I4 ?? 0, Math.abs(sum - nation.economy.cohortPopulation));
    }
  }
  let overflow = 0;
  let commuters = 0;
  for (const province of world.provinces ?? []) {
    const econ = province.econ;
    if (!econ) continue;
    overflow += Math.max(0, (econ.industrialEmployees ?? 0) - Math.max(0, econ.population));
    commuters += Math.max(0, econ.industrialCommuters ?? 0);
  }
  const drift = Math.abs(overflow - commuters);
  if (drift > Math.max(500, overflow * 0.1)) {
    worst.I5 = Math.max(worst.I5 ?? 0, drift);
    worst.I5At ??= label;
  }
}

console.log('='.repeat(74));
console.log('ISGUCU KORUNUMU — surekli kosu + kontrollu senaryolar');
console.log('='.repeat(74));

// --- Surekli kosu: 260 hafta, her hafta butun degismezler -------------------
{
  const game = headless('LBR-1');
  const worst = {};
  checkInvariants(game.world, 'hafta 0', worst); // I1 kurulusta da tutmali
  for (let week = 1; week <= 260; week++) {
    game.turns.endTurn();
    checkInvariants(game.world, `hafta ${week}`, worst);
  }
  console.log(`  260 hafta: I1=${n0(worst.I1 ?? 0)} I2=${(worst.I2 ?? 0).toFixed(2)}`
    + ` I3=${(worst.I3 ?? 0).toFixed(2)} I4=${n0(worst.I4 ?? 0)} I5=${n0(worst.I5 ?? 0)}`);
  if (worst.I1 > 1) {
    finding('HIGH', 'Ayni isci birden fazla yerde sayiliyor',
      'Σkadro ≤ workers sayaci', `${n0(worst.I1)} fazla (${worst.I1At})`, '');
  }
  if (worst.I2 > 1e-6) finding('HIGH', 'Kadro kapasiteyi asiyor', 'employees ≤ jobs', `${worst.I2}`, '');
  if ((worst.I3 ?? 0) < -1e-9) finding('HIGH', 'Negatif emek', 'sayac/kadro ≥ 0', `${worst.I3}`, '');
  if (worst.I4 > 1) finding('HIGH', 'Sinif toplami sayaclardan kopuk', 'Σcounts = cohortPopulation', `${n0(worst.I4)}`, '');
  if (worst.I5 > 0) {
    finding('HIGH', 'Banliyo emegi korunmuyor', 'Σfazla ≈ Σbanliyo', `${n0(worst.I5)} (${worst.I5At})`, '');
  }
}

// --- Kontrollu senaryolar ---------------------------------------------------
{
  const game = headless('LBR-2');
  const world = game.world;
  const nations = world.nations.filter((n) => n.alive && n.economy);
  const [a, b, c] = nations;
  // A: fabrikasiz ulke — kadro sifir kalmali, sayaclar korunmali.
  a.economy.factories = [];
  // B/C: ayni emege yarisan fabrikalar — mevcut cekirdek + buyuk kapasite.
  for (const factory of c.economy.factories) factory.level = 8; // G: emek kitligi
  // F: yuksek issizlik — b'de kadrolar kucultulur, isci sayaci oldugu gibi.
  for (const factory of b.economy.factories) factory.employees = 0;
  const worst = {};
  for (let week = 1; week <= 60; week++) {
    game.turns.endTurn();
    checkInvariants(world, `senaryo hafta ${week}`, worst);
    if (week === 20) {
      // D: fabrika kapanir — kadrosu sayaca sizmadan yok olmali.
      if (c.economy.factories.length) c.economy.factories.pop();
      // E: hizli buyume — yeni buyuk tesis; ise alim yine havuzla sinirli.
      b.economy.factories.push({
        id: 'lbr-test', typeId: 'TEXTILE_MILL',
        q: b.economy.factories[0]?.q ?? world.cities.find((x) => x.nationId === b.id)?.tile.q,
        r: b.economy.factories[0]?.r ?? world.cities.find((x) => x.nationId === b.id)?.tile.r,
        level: 6, employees: 0, profit: 0, margin: 0, throughput: 0, fundedBy: 'state',
      });
    }
  }
  // A notu: fabrikasiz birakilan ulkeyi ensureInitialMilitaryIndustry BILEREK
  // yeniden cekirdekler (bkz. economy.js) — "sonsuza dek fabrikasiz" diye bir
  // durum yok. A'nin sinadigi sey yeniden cekirdeklemede korunum (I1) olur.
  const overC = employedOf(c) - ((c.economy.classes?.lower?.population ?? 0) * LOWER_WORKFORCE_SHARE);
  console.log(`  A yeniden cekirdeklendi (beklenen): kadro=${n0(employedOf(a))}`
    + ` · C kitlikta asim=${n0(Math.max(0, overC))}`
    + ` · I1=${n0(worst.I1 ?? 0)} I5=${n0(worst.I5 ?? 0)}`);
  if (worst.I1 > 1) {
    finding('HIGH', 'Senaryoda cift sayim',
      'kapanis/buyume/kitlik altinda Σkadro ≤ workers', `${n0(worst.I1)} (${worst.I1At})`, '');
  }
}

console.log('');
console.log('='.repeat(74));
console.log('BULGU OZETI');
console.log('='.repeat(74));
if (!findings.length) console.log('  Bu kosuda bulgu yok.');
for (const level of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
  const rows = findings.filter((f) => f.level === level);
  if (rows.length) console.log(`${level} (${rows.length})`);
  for (const row of rows) console.log(`  - ${row.title}`);
}
process.exit(findings.some((f) => f.level === 'CRITICAL' || f.level === 'HIGH') ? 1 : 0);
