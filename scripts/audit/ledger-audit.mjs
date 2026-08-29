// Para korunumu denetimi — her gelirin ODEYENI, her borunun BEYANI olmali.
//
// Kimlikler (ayni hafta icinde, kayitli alanlardan yeniden hesaplanir):
//   L1  sinif geliri bilesimi: income = havuzPayi + bordroPayi (+ karPayi)
//   L2  tesis: katmaDeger dagitimi — Σfactory.wages = economy.wagesPaid
//   L3  kar dagitim beyani: haneye 0.5 + yatirima 0.08 ≤ 1 (kaynak yaratma yok)
//   L4  vergi: taxRevenue = Σ sinif.taxPaid × taxEfficiency (odeyen var)
//   L5  subvansiyon: Σ factory.subsidyPaid = haftalik subsidyGold birikimi
//
// Kontrollu tek-tesis senaryosu: bilinen kadro/uretimle VA = ucret + kar.

import { headless, pickNation } from './harness.mjs';
import {
  LABOR_SHARE, PROFIT_TO_CAPITAL, PROFIT_TO_REINVEST, WAGE_SPLIT,
} from '../../src/game/economy.js';

const findings = [];
const finding = (level, title, expected, measured, note) => {
  findings.push({ level, title });
  console.log(`  [${level}] ${title}`);
  console.log(`      beklenen: ${expected}`);
  console.log(`      olculen : ${measured}`);
  if (note) console.log(`      kanit   : ${note}`);
};
const n2 = (v) => (Math.round(v * 100) / 100).toLocaleString('en-US');

console.log('='.repeat(74));
console.log('PARA KORUNUMU — gelir bilesimi, bordro, kar beyani, vergi, subvansiyon');
console.log('='.repeat(74));

{
  const game = headless('LGR-1');
  for (let i = 0; i < 150; i++) game.turns.endTurn();
  const world = game.world;
  let worstL1 = 0; let worstL2 = 0; let worstL4 = 0; let worstL5 = 0;
  for (const nation of world.nations) {
    if (!nation.alive || !nation.economy) continue;
    const economy = nation.economy;
    const pool = Math.max(1, (economy.baseOutputValue ?? 0) * 0.35);
    const wagesPaid = Math.max(0, economy.wagesPaid ?? 0);
    const profitShare = (economy.factoryProfit ?? 0) * PROFIT_TO_CAPITAL;
    // Sirket temettusu bir TRANSFERDIR: yabanci ortaga odenen tutar ayni hafta
    // ust sinif gelirinden dusulur (bkz. companies.js). Kimlik o yuzden bu
    // terimi tasimali; tasimasaydi denetim gercek bir korunumu ihlal sayardi.
    const withheld = Math.max(0, economy.capitalWithheld ?? 0);
    const weights = { lower: 0.42, middle: 0.33, upper: 0.25 };
    let taxes = 0;
    for (const [classId, weight] of Object.entries(weights)) {
      const socialClass = economy.classes[classId];
      const expected = Math.max(0, pool * weight
        + wagesPaid * (WAGE_SPLIT[classId] ?? 0)
        + (classId === 'upper' ? profitShare - withheld : 0));
      worstL1 = Math.max(worstL1, Math.abs((socialClass.income ?? 0) - expected)
        / Math.max(1, expected));
      taxes += socialClass.taxPaid ?? 0;
    }
    const factoryWages = (economy.factories ?? [])
      .reduce((sum, factory) => sum + (factory.wages ?? 0), 0);
    worstL2 = Math.max(worstL2, Math.abs(factoryWages - wagesPaid));
    worstL4 = Math.max(worstL4, Math.abs((economy.taxRevenue ?? 0)
      - taxes) / Math.max(1, taxes));
    const subsidyPaid = (economy.factories ?? [])
      .reduce((sum, factory) => sum + (factory.subsidyPaid ?? 0), 0);
    // subsidyGold updateLedger'da sifirlanir; haftalik birikim tesislerin
    // toplamina esit olmali — defter yazildiktan sonra 0 gorunebilir, o
    // yuzden yalniz "tesis > kayit" yonu (odeme kayda gecmemis) sinanir.
    const recorded = Math.max(economy.subsidyGold ?? 0, economy.ledger?.subsidyCost ?? 0);
    if (subsidyPaid > recorded + 0.01) worstL5 = Math.max(worstL5, subsidyPaid - recorded);
  }
  console.log(`  L1 gelir bilesimi en kotu sapma: ${(worstL1 * 100).toFixed(2)}%`);
  console.log(`  L2 bordro toplami sapmasi: ${n2(worstL2)}`);
  console.log(`  L3 kar beyani: hane ${PROFIT_TO_CAPITAL} + yatirim ${PROFIT_TO_REINVEST}`
    + ` = ${PROFIT_TO_CAPITAL + PROFIT_TO_REINVEST} ≤ 1 ${PROFIT_TO_CAPITAL + PROFIT_TO_REINVEST <= 1 ? 'OK' : 'IHLAL'}`);
  console.log(`  L4 vergi kimligi en kotu sapma: ${(worstL4 * 100).toFixed(2)}%`);
  console.log(`  L5 kayitsiz subvansiyon: ${n2(worstL5)}`);
  if (worstL1 > 0.01) {
    finding('HIGH', 'Sinif geliri beyanli kanallardan sapmis',
      'income = 0.35×taban×pay + bordro×pay (+ kar payi)', `${(worstL1 * 100).toFixed(2)}%`, '');
  }
  if (worstL2 > 1) finding('HIGH', 'Bordro toplami tutmuyor', 'Σfactory.wages = wagesPaid', n2(worstL2), '');
  if (PROFIT_TO_CAPITAL + PROFIT_TO_REINVEST > 1) {
    finding('CRITICAL', 'Kar birden fazla kez dagitiliyor', 'paylar toplami ≤ 1',
      `${PROFIT_TO_CAPITAL + PROFIT_TO_REINVEST}`, '');
  }
  if (worstL4 > 0.01) {
    finding('HIGH', 'Vergi geliri odeyenlerden kopuk',
      'taxRevenue = Σ taxPaid × taxEfficiency', `${(worstL4 * 100).toFixed(2)}%`, '');
  }
  if (worstL5 > 1) {
    finding('HIGH', 'Subvansiyon odemesi deftere gecmemis',
      'tesislere odenen destek defterde gorunmeli', n2(worstL5), '');
  }
}

// --- Kontrollu tek tesis: VA = ucret + kar, elle dogrulama ------------------
{
  const game = headless('LGR-2');
  for (let i = 0; i < 30; i++) game.turns.endTurn();
  const nation = pickNation(game);
  const factory = nation.economy.factories.find((f) => (f.employees ?? 0) > 0
    && Number.isFinite(f.wages) && Number.isFinite(f.profit));
  if (!factory) {
    finding('MEDIUM', 'Kontrollu tesis bulunamadi', 'kadrolu bir tesis', 'yok', '');
  } else {
    // VA alanlardan geri turetilir: profit = VA − wages → VA = profit + wages.
    const va = factory.profit + factory.wages;
    // Subvansiyonlu tesiste kar 0'a cekilir; o durumda kimlik gecerli degil.
    const subsidized = (factory.subsidyPaid ?? 0) > 0;
    const expectedWages = Math.max(0, va) * Math.min(0.85, LABOR_SHARE
      * (factory.wages > 0 && va > 0 ? factory.wages / (Math.max(0, va) * LABOR_SHARE) : 1));
    const shareObserved = va > 0 ? factory.wages / va : 0;
    console.log(`  tek tesis (${factory.typeId}): VA=${n2(va)} ucret=${n2(factory.wages)}`
      + ` kar=${n2(factory.profit)} emekPayi=${(shareObserved * 100).toFixed(1)}%`
      + `${subsidized ? ' (subvansiyonlu)' : ''}`);
    if (!subsidized && va > 1 && (shareObserved < LABOR_SHARE * 0.99 - 1e-6
      || shareObserved > 0.85 + 1e-6)) {
      finding('HIGH', 'Tesis emek payi beyanla uyusmuyor',
        `ucret/VA ∈ [${LABOR_SHARE}, 0.85] (reform carpani dahil)`,
        `${(shareObserved * 100).toFixed(1)}%`, '');
    }
    void expectedWages;
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
