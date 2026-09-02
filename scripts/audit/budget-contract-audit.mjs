// BUTCE SOZLESMESI — hedefli dogrulama.
//
// Yeni bir denetim ailesi DEGIL: sadelestirmenin dayandigi degismezleri
// koruyan tek dosya. Her iddia calisan simulasyondan olculur.
//
//   npm run audit:budget-contract

import { headless, run, runPeaceful, pickNation, section, sub, finding, reportFindings, n2, pct } from './harness.mjs';
import {
  LEDGER_LINES, settle, weeklyBalance,
} from '../../src/game/treasury.js';
import {
  BUDGET_POLICIES, budgetBreakdown, budgetPolicyLimits, setBudgetPolicy,
  budgetPolicyValue,
} from '../../src/game/economy.js';

const WEEKS = 60;

section('BUTCE SOZLESMESI');

// ---------------------------------------------------------------- 1. DEFTER
sub('1. Defter kimligi: gelir - gider = net, ve Δhazine = Σ islem');
{
  const game = headless('contract-a');
  runPeaceful(game, WEEKS);
  let worstNet = 0;
  let worstDelta = 0;
  let checked = 0;
  for (const nation of game.world.nations) {
    if (!nation.alive || !nation.economy?.ledger) continue;
    const L = nation.economy.ledger;
    checked++;
    worstNet = Math.max(worstNet, Math.abs((L.income - L.expenses) - L.net));
    // `unreconciled` closeWeek'te hesaplanir: hazineye settle() disindan
    // dokunulduysa sifirdan farkli olur.
    worstDelta = Math.max(worstDelta, Math.abs(L.unreconciled ?? 0));
  }
  console.log(`  ${checked} ulke · gelir-gider=net sapmasi ${worstNet.toExponential(2)}`
    + ` · Δhazine=Σislem sapmasi ${worstDelta.toExponential(2)}`);
  if (worstNet > 1e-6) finding('HIGH', 'Defter kimligi', 'gelir - gider = net', `sapma ${worstNet}`);
  if (worstDelta > 1e-6) {
    finding('HIGH', 'Hazine mutabakati', 'Δhazine = Σ islem',
      `sapma ${worstDelta} — bir yerde settle() disindan hazineye dokunuluyor`);
  }
}

// ------------------------------------------------------- 2. KAYITSIZ IADE YOK
sub('2. Iade eden her yol defterli');
{
  const game = headless('contract-b');
  run(game, 12);
  const nation = pickNation(game);
  const before = nation.gold;
  const week = nation.economy.ledgerWeek;
  const lineBefore = week.outlay;
  settle(nation, 'outlay', -40);
  settle(nation, 'outlay', 25);
  const goldDelta = nation.gold - before;
  const lineDelta = week.outlay - lineBefore;
  console.log(`  hazine ${n2(goldDelta)} · defter satiri ${n2(lineDelta)}`);
  if (Math.abs(goldDelta - lineDelta) > 1e-9) {
    finding('HIGH', 'Iade muhasebesi', 'hazine hareketi = defter hareketi',
      `${goldDelta} vs ${lineDelta}`);
  }
}

// ------------------------------------------------------- 3. TEK BAKIYE TANIMI
sub('3. Tek bakiye: weeklyBalance === ledger.net');
{
  const game = headless('contract-c');
  runPeaceful(game, 30);
  let bad = 0;
  for (const nation of game.world.nations) {
    if (!nation.alive || !nation.economy?.ledger) continue;
    if (Math.abs(weeklyBalance(nation) - nation.economy.ledger.net) > 1e-9) bad++;
  }
  console.log(`  uyusmayan ulke: ${bad}`);
  if (bad) finding('HIGH', 'Bakiye tanimi', 'her yerde ayni sayi', `${bad} ulke sapiyor`);
}

// ---------------------------------------------- 4. SINIR: OYUNCU = YZ, NaN YOK
sub('4. Politika sinirlari ve saglamlik');
{
  const game = headless('contract-d');
  run(game, 8);
  const nation = pickNation(game);
  let violations = 0;
  for (const policy of BUDGET_POLICIES) {
    const limits = budgetPolicyLimits(nation)[policy];
    for (const attempt of [-9999, -1, 0, 50, 101, 9999, Number.NaN, Infinity]) {
      setBudgetPolicy(nation, policy, attempt);
      // Deger okumasi TEK KAPIDAN: alanin nerede durdugunu (economy.tax.*,
      // economy.social.*, economy.*) denetim degil, alan katmani bilir.
      const value = budgetPolicyValue(nation, policy);
      if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
        violations++;
        finding('HIGH', `Sinir: ${policy}`, `${limits.min}-${limits.max} araliginda kalmali`,
          `deger ${value} (denenen ${attempt})`);
      }
    }
    setBudgetPolicy(nation, policy, limits.min);
  }
  console.log(`  ${BUDGET_POLICIES.length} politika × 8 uc deger · ihlal ${violations}`);
}

// ------------------------------------------------- 5. DOKUM = SIMULASYON
sub('5. Ekran dokumu simulasyonla ayni sayiyi veriyor');
{
  const game = headless('contract-e');
  runPeaceful(game, 40);
  const nation = pickNation(game);
  const view = budgetBreakdown(game.world, nation);
  const L = nation.economy.ledger;
  const sumIncome = view.incomeRows.reduce((s, r) => s + r.amount, 0);
  const sumExpense = view.expenseRows.reduce((s, r) => s + r.amount, 0);
  console.log(`  dokum geliri ${n2(sumIncome)} vs defter ${n2(L.income)}`
    + ` · dokum gideri ${n2(-sumExpense)} vs defter ${n2(L.expenses)}`);
  if (Math.abs(sumIncome - L.income) > 0.02) {
    finding('HIGH', 'Dokum geliri', 'satirlar toplami = gelir', `${sumIncome} vs ${L.income}`);
  }
  if (Math.abs(-sumExpense - L.expenses) > 0.02) {
    finding('HIGH', 'Dokum gideri', 'satirlar toplami = gider', `${-sumExpense} vs ${L.expenses}`);
  }
  // Sinif vergi satirlari toplami TAM OLARAK tahsil edileni vermeli: eski
  // ekranda satirlar brut, toplam netti ve %30 idari fonlamada 1.46 kat
  // sapiyordu.
  const classSum = view.controls.taxSummary.classes.reduce((s, c) => s + c.collected, 0);
  console.log(`  sinif satirlari ${n2(classSum)} vs tahsilat ${n2(view.controls.taxSummary.collected)}`);
  if (Math.abs(classSum - view.controls.taxSummary.collected) > 1e-6) {
    finding('HIGH', 'Vergi satirlari', 'satirlar toplami = tahsilat',
      `${classSum} vs ${view.controls.taxSummary.collected}`);
  }
}

// ------------------------------------------------------- 6. KALDIRAC YONLERI
sub('6. Her kaldirac dogru yone hareket ediyor');
{
  const probe = (levers, weeks = 90) => {
    const game = headless('contract-f');
    runPeaceful(game, 40);
    const nation = pickNation(game);
    game.turns.playerNation = nation.id;
    const apply = () => { for (const [k, v] of levers) setBudgetPolicy(nation, k, v); };
    apply();
    for (let i = 0; i < weeks; i++) { runPeaceful(game, 1); apply(); }
    const view = budgetBreakdown(game.world, nation);
    return { nation, view, e: nation.economy };
  };
  const lo = probe([['taxLower', 5], ['taxMiddle', 5], ['taxUpper', 5], ['education', 0], ['welfare', 0], ['armyFunding', 25]]);
  const hi = probe([['taxLower', 70], ['taxMiddle', 70], ['taxUpper', 70], ['education', 100], ['welfare', 100], ['armyFunding', 100]]);

  // VERGI IZOLE OLCULUR: yukaridaki iki kol refahi da oynatiyor ve refahin
  // +0.14'luk memnuniyet terimi verginin -0.28'lik terimini maskeliyordu.
  const taxLo = probe([['taxLower', 5], ['taxMiddle', 5], ['taxUpper', 5], ['education', 0], ['welfare', 0], ['armyFunding', 25]]);
  const taxHi = probe([['taxLower', 70], ['taxMiddle', 70], ['taxUpper', 70], ['education', 0], ['welfare', 0], ['armyFunding', 25]]);
  const satLo = taxLo.e.classes.lower.satisfaction;
  const satHi = taxHi.e.classes.lower.satisfaction;
  console.log(`  vergi IZOLE: %5 -> %70 · alt sinif memnuniyeti ${n2(satLo)} -> ${n2(satHi)}`
    + ` · tahsilat ${n2(taxLo.view.controls.taxSummary.collected)} -> ${n2(taxHi.view.controls.taxSummary.collected)}`);
  if (!(satHi < satLo)) {
    finding('HIGH', 'Verginin bedeli', 'yuksek vergi memnuniyeti DUSURMELI', `${satLo} -> ${satHi}`);
  }

  const rows = [
    ['vergi geliri', lo.view.controls.taxSummary.collected, hi.view.controls.taxSummary.collected, 'up'],
    ['egitim gideri', lo.view.controls.education.cost, hi.view.controls.education.cost, 'up'],
    ['okuryazarlik hedefi', lo.view.controls.education.literacyTarget, hi.view.controls.education.literacyTarget, 'up'],
    ['refah gideri', lo.view.controls.welfare.cost, hi.view.controls.welfare.cost, 'up'],
    ['refah memnuniyet terimi', lo.view.controls.welfare.satisfaction, hi.view.controls.welfare.satisfaction, 'up'],
    ['ordu muharebe gucu', lo.view.controls.armyFunding.combatPower, hi.view.controls.armyFunding.combatPower, 'up'],
    ['ordu takviye', lo.view.controls.armyFunding.reinforcement, hi.view.controls.armyFunding.reinforcement, 'up'],
  ];
  for (const [label, a, b, dir] of rows) {
    const ok = dir === 'up' ? b > a : true;
    console.log(`  ${label.padEnd(26)} dusuk ${n2(a).padStart(9)} -> yuksek ${n2(b).padStart(9)} ${ok ? '' : '  <-- YON YANLIS'}`);
    if (!ok) finding('HIGH', label, 'yuksek ayar daha buyuk deger vermeli', `${a} -> ${b}`);
  }
}

// ------------------------------------------------------------ 7. GUMRUK
sub('7. Gumruk geliri gercek ithalatla mutabik');
{
  const game = headless('contract-g');
  runPeaceful(game, 50);
  let worst = 0;
  let checked = 0;
  for (const nation of game.world.nations) {
    if (!nation.alive || !nation.economy?.ledger) continue;
    const e = nation.economy;
    const expected = (e.trade?.importValue ?? 0) * ((e.tariff ?? 0) / 100);
    const actual = e.ledger.tariff ?? 0;
    if (Math.abs(expected) < 0.01 && Math.abs(actual) < 0.01) continue;
    checked++;
    worst = Math.max(worst, Math.abs(expected - actual) / Math.max(1, Math.abs(expected)));
  }
  console.log(`  ${checked} ulke · en buyuk bagil sapma ${pct(worst)}`);
  if (worst > 0.02) {
    finding('MEDIUM', 'Gumruk mutabakati', 'gumruk = ithalat degeri x oran', `sapma ${pct(worst)}`);
  }
}

// ------------------------------------------------------- 8. OLU DURUM YOK
sub('8. Kaldirilan alanlar geri gelmemis');
{
  const game = headless('contract-h');
  runPeaceful(game, 20);
  const dead = ['taxes', 'taxRate', 'militaryWages', 'militaryProcurement', 'adminFunding',
    'armySpending', 'subsidyPolicy', 'fiscalNet', 'outlayGold', 'procurementGold',
    'subsidyGold', 'projectGold', 'dividendGold', 'shareCostGold', 'shareSaleGold',
    'interestGold', 'borrowedGold', 'repaidGold', 'defaultedGold'];
  const found = new Set();
  for (const nation of game.world.nations) {
    if (!nation.economy) continue;
    for (const key of dead) if (key in nation.economy) found.add(key);
  }
  console.log(`  ${dead.length} olu alan kontrol edildi · geri gelen ${found.size}`);
  if (found.size) {
    finding('MEDIUM', 'Olu durum', 'kaldirilan alanlar yeniden yazilmamali',
      [...found].join(', '));
  }
  console.log(`  defter satiri sayisi: ${Object.keys(LEDGER_LINES).length}`);
}

reportFindings();
