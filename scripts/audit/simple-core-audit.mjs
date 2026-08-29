// BASIT CEKIRDEK DENETIMI — tek betik, iki is:
//
//   1. DEGISMEZLER  nufus/isgucu/istihdam/fiyat/para sonlu ve tutarli mi?
//   2. OLCUM        nufus, piyasa, ticaret, butce, egitim icin ONCE/SONRA
//                   karsilastirmasina giren sayilar.
//
// Deney (SIMPLE_CORE_NOTES.md) "40 yeni denetim betigi acma" diyor: bu betik
// eski `audit:*` ailesinin yerine gecmez, yalnizca yeni cekirdegin kendi
// kimliklerini olcer. Cikti duz metindir, tohum sabittir, kosu deterministiktir.
//
// Kullanim:  node scripts/audit/simple-core-audit.mjs [hafta]

import { headless, run, runPeaceful, alive } from './harness.mjs';
import { GOODS, GOOD_IDS, industrialJobs, priceOf } from '../../src/game/economy.js';
import { researchPointsOf } from '../../src/game/technology.js';
import { provincePopulation } from '../../src/game/provinces.js';

const WEEKS = Number(process.argv[2] ?? 156);
const SEED = 'SIMPLE-CORE';

const findings = [];
const fail = (level, title, expected, measured) => {
  findings.push({ level, title });
  console.log(`  [${level}] ${title}`);
  console.log(`      beklenen: ${expected}`);
  console.log(`      olculen : ${measured}`);
};
const n2 = (v) => (Math.round(v * 100) / 100).toLocaleString('en-US');
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const head = (title) => {
  console.log(`\n${'='.repeat(74)}`);
  console.log(title);
  console.log('='.repeat(74));
};

const finite = (v) => Number.isFinite(v);

// ---------------------------------------------------------------- KOSU ---

head(`BASIT CEKIRDEK — ${WEEKS} hafta, tohum ${SEED}`);
const game = headless(SEED);
run(game, WEEKS);
const world = game.world;
const nations = alive(game);
console.log(`  ulke: ${nations.length} · tur: ${world.turn}`);

// ------------------------------------------------------- 1. DEGISMEZLER ---

head('1. DEGISMEZLER');
{
  let worstPopDrift = 0;
  let workforceViolations = 0;
  let employmentViolations = 0;
  let jobViolations = 0;
  let negativePop = 0;
  let nan = 0;
  const nanWhere = [];

  for (const nation of nations) {
    const e = nation.economy;
    const provincePop = provincePopulation(world, nation.id);
    const drift = Math.abs((e.population ?? 0) - provincePop) / Math.max(1, provincePop);
    worstPopDrift = Math.max(worstPopDrift, drift);
    if ((e.population ?? 0) < 0) negativePop++;

    const workforce = e.workforce ?? null;
    const employees = (e.factories ?? []).reduce((s, f) => s + (f.employees ?? 0), 0);
    if (workforce != null) {
      if (workforce > (e.population ?? 0) + 1) workforceViolations++;
      if (employees > workforce + 1) employmentViolations++;
    }
    if (employees > industrialJobs(nation) + 1) jobViolations++;

    for (const [key, value] of Object.entries(e)) {
      if (typeof value === 'number' && !finite(value)) {
        nan++;
        if (nanWhere.length < 8) nanWhere.push(`${nation.name}.economy.${key}=${value}`);
      }
    }
    if (!finite(nation.gold)) { nan++; nanWhere.push(`${nation.name}.gold`); }
  }

  // Sahipsiz tesis: capasi artik ulkenin olmayan kare uzerinde duran fabrika.
  let orphanFactories = 0;
  for (const nation of nations) {
    for (const factory of nation.economy.factories ?? []) {
      const tile = world.get(factory.q, factory.r);
      if (!tile || tile.owner !== nation.id) orphanFactories++;
    }
  }

  let badPrice = 0;
  let badFlow = 0;
  for (const id of GOOD_IDS) {
    const state = world.market.goods[id];
    if (!finite(state.price) || state.price <= 0) badPrice++;
    for (const key of ['supply', 'demand', 'traded']) {
      const v = state[key];
      if (!finite(v) || v < 0) badFlow++;
    }
  }

  console.log(`  nufus tekligi (ulusal vs province) en kotu sapma: ${pct(worstPopDrift)}`);
  console.log(`  isgucu <= nufus ihlali    : ${workforceViolations}`);
  console.log(`  istihdam <= isgucu ihlali : ${employmentViolations}`);
  console.log(`  kadro <= is ihlali        : ${jobViolations}`);
  console.log(`  negatif nufus             : ${negativePop}`);
  console.log(`  sonsuz/NaN ekonomi alani  : ${nan}${nanWhere.length ? ` (${nanWhere.join(', ')})` : ''}`);
  console.log(`  gecersiz fiyat            : ${badPrice}/${GOOD_IDS.length}`);
  console.log(`  gecersiz piyasa akisi     : ${badFlow}`);
  console.log(`  sahipsiz tesis            : ${orphanFactories}`);

  if (worstPopDrift > 0.01) {
    fail('HIGH', 'Ulusal nufus province toplamindan sapiyor',
      'economy.population = Sprovince.econ.population', pct(worstPopDrift));
  }
  if (workforceViolations) fail('HIGH', 'Isgucu nufusu asiyor', '0', String(workforceViolations));
  if (employmentViolations) fail('HIGH', 'Istihdam isgucunu asiyor', '0', String(employmentViolations));
  if (jobViolations) fail('HIGH', 'Fabrika kadrosu is sayisini asiyor', '0', String(jobViolations));
  if (negativePop) fail('HIGH', 'Negatif nufus', '0', String(negativePop));
  if (nan) fail('HIGH', 'Sonsuz/NaN ekonomi degeri', '0', String(nan));
  if (badPrice) fail('HIGH', 'Gecersiz fiyat', '0', String(badPrice));
  if (badFlow) fail('HIGH', 'Gecersiz piyasa akisi', '0', String(badFlow));
  // Sahipsiz tesis bir BULGU degil olcumdur: savasta el degistiren kare
  // fabrikayi silmez (kayip veri surprizi olmasin diye, bkz. ensureFactoryAnchor).

}

// ------------------------------------------------- 2. PARA KORUNUMU -------

head('2. PARA KORUNUMU');
{
  // Dunya ticareti sifir toplamli mi? (ithalat degeri == ihracat degeri)
  let importValue = 0;
  let exportValue = 0;
  for (const nation of nations) {
    importValue += nation.economy.trade?.importValue ?? 0;
    exportValue += nation.economy.trade?.exportValue ?? 0;
  }
  const tradeGap = Math.abs(importValue - exportValue) / Math.max(1, importValue);
  console.log(`  dunya ithalat degeri: ${n2(importValue)}`);
  console.log(`  dunya ihracat degeri: ${n2(exportValue)}`);
  console.log(`  sapma               : ${pct(tradeGap)}`);
  if (tradeGap > 0.001) {
    fail('HIGH', 'Dunya ticareti sifir toplamli degil', 'Sithalat == Sihracat', pct(tradeGap));
  }

  // HAZINE KAPANISI: bir hafta boyunca hazine degisimi deftere uymali.
  const before = nations.map((n) => ({ id: n.id, gold: n.gold }));
  game.turns.endTurn();
  let worstClose = 0;
  let worstName = '';
  for (const snap of before) {
    const nation = world.nations[snap.id];
    if (!nation?.alive || !nation.economy) continue;
    const L = nation.economy.ledger ?? {};
    const expected = (L.net ?? 0) + (L.borrowed ?? 0) - (L.repaid ?? 0) + (L.defaulted ?? 0);
    const actual = nation.gold - snap.gold;
    const err = Math.abs(actual - expected) / Math.max(10, Math.abs(expected));
    if (err > worstClose) { worstClose = err; worstName = nation.name; }
  }
  console.log(`  hazine kapanisi en kotu sapma: ${pct(worstClose)}${worstName ? ` (${worstName})` : ''}`);
  console.log('    kimlik: Dhazine = defter.net + borclanilan - odenen + temerrut');
  if (worstClose > 0.01) {
    fail('HIGH', 'Hazine kapanisi tutmuyor',
      'Dhazine = net + borclanilan - odenen + temerrut', pct(worstClose));
  }
}

// ----------------------------------------------------- 3. NUFUS OLCUMU ---

head('3. NUFUS');
{
  let population = 0;
  let workforce = 0;
  let employed = 0;
  for (const nation of nations) {
    const e = nation.economy;
    population += e.population ?? 0;
    workforce += e.workforce ?? 0;
    employed += e.employed ?? (e.factories ?? []).reduce((s, f) => s + (f.employees ?? 0), 0);
  }
  console.log(`  dunya nufusu      : ${n2(population)}`);
  console.log(`  isgucu            : ${n2(workforce)} (${pct(workforce / Math.max(1, population))})`);
  console.log(`  istihdam          : ${n2(employed)} (${pct(employed / Math.max(1, workforce))} isgucunun)`);
  const sample = nations.slice(0, 5);
  for (const nation of sample) {
    const e = nation.economy;
    const shares = e.classShares ?? {};
    const classes = e.classes ?? {};
    const shareText = Object.keys(classes).map((id) => {
      const share = shares[id] ?? (classes[id].population / Math.max(1, e.population));
      return `${id[0]}${pct(share)}`;
    }).join(' ');
    console.log(`    ${nation.name.padEnd(16)} pop ${String(Math.round(e.population)).padStart(8)}`
      + ` · sinif ${shareText} · needsMet ${(e.needsMet ?? 0).toFixed(2)}`
      + ` · foodMet ${(e.foodMet ?? e.needsMet ?? 0).toFixed(2)}`);
  }
}

// ---------------------------------------------------- 4. PIYASA OLCUMU ---

head('4. PIYASA');
{
  let ceiling = 0;
  let floor = 0;
  const rows = [];
  for (const id of GOOD_IDS) {
    const state = world.market.goods[id];
    const base = GOODS[id].basePrice;
    const ratio = state.price / base;
    if (ratio >= 7.9) ceiling++;
    if (ratio <= 0.13) floor++;
    rows.push({ id, ratio, supply: state.supply, demand: state.demand });
  }
  console.log(`  mal sayisi              : ${GOOD_IDS.length}`);
  console.log(`  fiyat TAVANINDA takili  : ${ceiling}`);
  console.log(`  fiyat TABANINDA takili  : ${floor}`);
  console.log(`  oynayan (bant icinde)   : ${GOOD_IDS.length - ceiling - floor}`);
  const chain = ['coal', 'iron', 'steel', 'arms', 'food', 'fabric', 'clothes'];
  console.log('  zincir ornegi (fiyat/taban · arz · talep):');
  for (const id of chain) {
    if (!world.market.goods[id]) continue;
    const state = world.market.goods[id];
    console.log(`    ${id.padEnd(10)} ${(state.price / GOODS[id].basePrice).toFixed(2)}x`
      + ` · arz ${n2(state.supply).padStart(9)} · talep ${n2(state.demand).padStart(9)}`);
  }
}

// --------------------------------------------------- 5. TICARET OLCUMU ---

head('5. TICARET');
{
  const sample = nations.slice(0, 4);
  for (const nation of sample) {
    const t = nation.economy.trade ?? {};
    console.log(`    ${nation.name.padEnd(16)} ithalat ${n2(t.importValue ?? 0).padStart(9)}`
      + ` · ihracat ${n2(t.exportValue ?? 0).padStart(9)}`
      + ` · gumruk ${n2(t.tariffRevenue ?? 0).padStart(7)}`
      + ` · tarife ${nation.economy.tariff}%`);
  }
  // Tek mal icin izlenebilirlik: uretim + ithalat - ihracat = mevcut
  const nation = nations[0];
  const id = 'steel';
  const flow = nation.economy.goodsFlow?.[id];
  if (flow) {
    console.log(`\n  ${nation.name} · ${id}`);
    console.log(`    uretim   ${n2(flow.production ?? 0)}`);
    console.log(`    ithalat  ${n2(flow.imports ?? 0)}`);
    console.log(`    ihracat  ${n2(flow.exports ?? 0)}`);
    console.log(`    talep    ${n2(flow.demand ?? 0)}`);
    console.log(`    acik     ${n2(flow.shortage ?? 0)}`);
    console.log(`    fiyat    ${n2(priceOf(world, id))}`);
  }
}

// ---------------------------------------------------- 6. BUTCE OLCUMU ----

head('6. BUTCE');
{
  const sample = nations.slice(0, 5);
  for (const nation of sample) {
    const L = nation.economy.ledger ?? {};
    console.log(`    ${nation.name.padEnd(16)} hazine ${n2(nation.gold).padStart(9)}`
      + ` · gelir ${n2(L.income ?? 0).padStart(7)} · gider ${n2(L.expenses ?? 0).padStart(7)}`
      + ` · net ${n2(L.net ?? 0).padStart(7)} · borc ${n2(nation.debt ?? 0).padStart(7)}`);
  }
  const bankrupt = nations.filter((n) => (n.gold ?? 0) < 0).length;
  console.log(`  hazinesi eksi olan ulke: ${bankrupt}/${nations.length}`);
}

// ------------------------------------------------- 7. EGITIM %10 vs %90 ---

head('7. EGITIM %10 vs %90');
{
  const EDU_WEEKS = 260;
  const measure = (level) => {
    const g = headless(`${SEED}-EDU`);
    // Butun ulkelerde ayni seviye: YZ kaydiraci geri surukleyemesin diye
    // her hafta yeniden dayatilir (butce-audit ile ayni kalip).
    for (let i = 0; i < EDU_WEEKS; i++) {
      for (const nation of g.world.nations) {
        if (nation.economy?.social) nation.economy.social.education = level;
      }
      g.turns.endTurn();
    }
    const list = alive(g);
    let literacy = 0;
    let rp = 0;
    let techs = 0;
    let socialCost = 0;
    let gold = 0;
    for (const nation of list) {
      literacy += nation.economy.literacy ?? 0;
      rp += researchPointsOf(nation);
      techs += nation.research?.done?.length ?? 0;
      socialCost += nation.economy.socialCost ?? 0;
      gold += nation.gold ?? 0;
    }
    const k = Math.max(1, list.length);
    return {
      literacy: literacy / k, rp: rp / k, techs: techs / k, socialCost: socialCost / k, gold: gold / k,
    };
  };
  const lo = measure(10);
  const hi = measure(90);
  console.log(`  ${EDU_WEEKS} hafta sonunda, ulke ortalamasi:`);
  console.log(`    okuryazarlik   %10: ${lo.literacy.toFixed(3)}   %90: ${hi.literacy.toFixed(3)}`
    + `   ->  x${(hi.literacy / Math.max(1e-6, lo.literacy)).toFixed(2)}`);
  console.log(`    arastirma/hf   %10: ${lo.rp.toFixed(2)}   %90: ${hi.rp.toFixed(2)}`
    + `   ->  x${(hi.rp / Math.max(1e-6, lo.rp)).toFixed(2)}`);
  console.log(`    tamamlanan tek %10: ${lo.techs.toFixed(1)}   %90: ${hi.techs.toFixed(1)}`
    + `   ->  x${(hi.techs / Math.max(1e-6, lo.techs)).toFixed(2)}`);
  console.log(`    sosyal gider   %10: ${lo.socialCost.toFixed(2)}   %90: ${hi.socialCost.toFixed(2)}`
    + `   ->  x${(hi.socialCost / Math.max(1e-6, lo.socialCost)).toFixed(2)}`);
  console.log(`    hazine         %10: ${lo.gold.toFixed(0)}   %90: ${hi.gold.toFixed(0)}`);
  if (hi.rp < lo.rp * 1.5) {
    fail('HIGH', 'Egitim %10 ile %90 arasinda arastirma farki gorunmuyor',
      'x1.5 ve uzeri', `x${(hi.rp / Math.max(1e-6, lo.rp)).toFixed(2)}`);
  }
  if (hi.socialCost <= lo.socialCost) {
    fail('HIGH', 'Egitim harcamasi butceye yansimiyor', 'gider artmali',
      `${lo.socialCost.toFixed(2)} -> ${hi.socialCost.toFixed(2)}`);
  }
}

// ----------------------------------------------------------- SONUC -------

head('SONUC');
if (!findings.length) console.log('  Bulgu yok: butun degismezler ve olculer gecti.');
else {
  for (const f of findings) console.log(`  [${f.level}] ${f.title}`);
  console.log(`\n  toplam ${findings.length} bulgu`);
}
console.log('');
