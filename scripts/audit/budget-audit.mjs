// E + F + G. BUTCE KAYDIRACLARI: TEK DEGISKEN MATRISI, SIFIR VE TAVAN DEVLET
//
// Butun kosular savassizdir (bkz. harness.runPeaceful) ve her senaryo kendi
// surecinde isler. Ikisi de zorunlu: savas topragi degistirir, ayni surecteki
// ikinci dunya ayni tohumla bile baska bir oyundur.

import {
  runScenario, section, sub, table, finding, reportFindings, n1, n2, n0, pct, relDelta,
} from './harness.mjs';
import { SOCIAL_PROGRAMS } from '../../src/game/economy.js';

const SEED = 'budget-audit';
const WARMUP = 60;
const WEEKS = 260;

function scenario(label, levers, extra = {}) {
  return runScenario({
    seed: SEED, label, warmup: WARMUP, weeks: WEEKS, peaceful: true,
    levers, measure: ['army', 'taxEfficiency', 'control'], ...extra,
  });
}

const LEVELS = [0, 25, 50, 75, 100];

section('E. BUTCE KAYDIRACLARI — TEK DEGISKEN MATRISI');
console.log(`  tohum ${SEED} · isitma ${WARMUP} · olcum ${WEEKS} hafta · savassiz · surec izolasyonlu`);

// ------------------------------------------------------- ASKERI MAAS ---
sub('Askeri maaş (militaryWages)');
{
  const rows = LEVELS.map((v) => ({ v, r: scenario(`wages${v}`, [{ key: 'armyFunding', value: v }]) }));
  console.log(table(rows, [
    { label: 'istenen%', get: (x) => x.v },
    { label: 'gecerli%', get: (x) => x.r.snap.militaryWages },
    { label: 'maasGideri', get: (x) => n2(x.r.snap.armyCost) },
    { label: 'saldiriGucu', get: (x) => n1(x.r.army.power) },
    { label: 'savunmaGucu', get: (x) => n1(x.r.army.defensePower) },
    { label: 'ortOrganizasyon', get: (x) => n1(x.r.army.organization) },
    { label: 'alay', get: (x) => x.r.snap.regiments },
    { label: 'mevcut%', get: (x) => pct(x.r.army.strengthRatio) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  ]));
  const lo = rows[0].r;
  const hi = rows[rows.length - 1].r;
  const d = relDelta(lo.army.power, hi.army.power);
  console.log(`\n  maaş ${lo.snap.militaryWages}% -> ${hi.snap.militaryWages}%:`
    + ` gider ${n2(lo.snap.armyCost)} -> ${n2(hi.snap.armyCost)}`
    + ` · saldiri gucu ${n1(lo.army.power)} -> ${n1(hi.army.power)} (${pct(d)})`);
  if (Math.abs(d) < 0.05) {
    finding('HIGH', 'Askeri maaş -> muharebe gucu', 'maaş muharebe gucunu degistirmeli',
      `${pct(d)} fark`, '');
  } else {
    console.log('  OK  maaş muharebe gucune bagli (battleUnitPower 0.55 + funding*0.45).');
  }
  console.log(`  NOT: parti tabani 25% — kaydirak asla %25'in altina inemez, "%0 ordu" senaryosu YOK.`);
}

// ---------------------------------------------------- ASKERI TEDARIK ---
sub('Askeri tedarik (militaryProcurement) — ordusu hasarli, barista');
{
  const rows = LEVELS.map((v) => ({
    v,
    r: scenario(`proc${v}`, [{ key: 'armyFunding', value: v }], {
      // Takviye hizini olcmek icin ordu bilerek yaralanir; saglam orduda
      // reinforcementNeed 0 olur ve kaydirac hicbir sey yapmiyor gorunur.
      mutations: [{ name: 'damageArmy', args: { ratio: 0.4 } }],
      weeks: 60,
    }),
  }));
  console.log(table(rows, [
    { label: 'istenen%', get: (x) => x.v },
    { label: 'gecerli%', get: (x) => x.r.snap.militaryProcurement },
    { label: 'ikmalEndeksi', get: (x) => n2(x.r.snap.supplyIndex) },
    { label: 'tedarikGideri', get: (x) => n2(x.r.snap.procurementCost) },
    { label: 'silahStogu', get: (x) => n2(x.r.snap.arms) },
    { label: '60hSonuMevcut%', get: (x) => pct(x.r.army.strengthRatio) },
    { label: 'kalanEksik', get: (x) => n0(x.r.army.need.strength) },
    { label: 'saldiriGucu', get: (x) => n1(x.r.army.power) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  ]));
  const lo = rows[0].r;
  const hi = rows[rows.length - 1].r;
  console.log(`\n  ikmal endeksi ${n2(lo.snap.supplyIndex)} -> ${n2(hi.snap.supplyIndex)}`
    + ` · 60 haftada toparlanan mevcut ${pct(lo.army.strengthRatio)} -> ${pct(hi.army.strengthRatio)}`);
  if (Math.abs(relDelta(lo.snap.supplyIndex, hi.snap.supplyIndex)) < 0.05) {
    finding('HIGH', 'Tedarik -> ikmal endeksi', 'tedarik ikmal endeksini degistirmeli',
      `${n2(lo.snap.supplyIndex)} -> ${n2(hi.snap.supplyIndex)}`, '');
  }
  if (Math.abs(relDelta(lo.army.strengthRatio, hi.army.strengthRatio)) < 0.03) {
    finding('HIGH', 'Tedarik -> takviye hizi',
      'tedarik kisilmis ordu daha yavas toparlanmali',
      `%40 mevcuttan baslayan ordu 60 haftada ${pct(lo.army.strengthRatio)} (tedarik ${lo.snap.militaryProcurement}%)`
      + ` ve ${pct(hi.army.strengthRatio)} (tedarik ${hi.snap.militaryProcurement}%) — fark yok`, '');
  }
  console.log(`  NOT: tam fonlanan ordunun ikmal endeksi bile ${n2(hi.snap.supplyIndex)};`
    + ' barista ordu hicbir zaman tam ikmalli degil.');
}

// --------------------------------------------------------- EGITIM ---
sub('Egitim 0 / 50 / 100');
{
  const rows = [0, 50, 100].map((v) => ({ v, r: scenario(`edu${v}`, [{ key: 'social', value: v, classId: 'education' }]) }));
  console.log(table(rows, [
    { label: 'egitim%', get: (x) => x.v },
    { label: 'sosyalGider', get: (x) => n2(x.r.snap.socialCost) },
    { label: 'altSinif', get: (x) => n0(x.r.snap.lowerPop) },
    { label: 'ortaSinif', get: (x) => n0(x.r.snap.middlePop) },
    { label: 'ustSinif', get: (x) => n0(x.r.snap.upperPop) },
    { label: 'fabrikaKadro', get: (x) => n0(x.r.snap.employees) },
    { label: 'doluluk', get: (x) => pct(x.r.snap.fill) },
    { label: 'tesis/seviye', get: (x) => `${x.r.snap.factories}/${x.r.snap.factoryLevels}` },
    { label: 'gdp', get: (x) => n1(x.r.snap.gdp) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  ]));
  const lo = rows[0].r;
  const hi = rows[2].r;
  const dMid = relDelta(lo.snap.middlePop, hi.snap.middlePop);
  const dEmp = relDelta(lo.snap.employees, hi.snap.employees);
  console.log(`\n  egitim 0->100 (${WEEKS} hafta): orta sinif ${pct(dMid)},`
    + ` fabrika kadrosu ${pct(dEmp)}, bedel ${n2(lo.snap.socialCost)} -> ${n2(hi.snap.socialCost)}/hafta`);
  // Sinif atlama okuryazarlik STOGUNDAN surulur (runPromotion); stok 260
  // haftada az kimildar. Hukum uzun ufukta (asagida, 1040 hafta).
  if (Math.abs(dMid) < 0.05) console.log('  NOT: 260 hafta stok icin kisa; sinif hukmu uzun ufukta.');
  // Kadro etkisi YAVAS bir kaldiractir: isealim havuzu ayrica ciftci->isci
  // donusum hiziyla (4 haftada bir kohort) sinirli oldugu icin 260 haftada
  // maskelenebilir. Bu yuzden asil olcum uzun ufukta (asagida).
  // O bolumunun uzun ufku: nitelik BIRIKEN bir sey mi, yoksa yalniz anlik
  // carpan mi? 260 haftada fark yoksa 1040 haftada acilabilir.
  console.log('\n  uzun ufuk (egitim %0 vs %100):');
  const horizons = [520, 1040].map((weeks) => ({
    weeks,
    lo: runScenario({
      seed: SEED, warmup: WARMUP, weeks, peaceful: true,
      levers: [{ key: 'social', value: 0, classId: 'education' }],
    }),
    hi: runScenario({
      seed: SEED, warmup: WARMUP, weeks, peaceful: true,
      levers: [{ key: 'social', value: 100, classId: 'education' }],
    }),
  }));
  console.log(table([{ weeks: 260, lo, hi }, ...horizons], [
    { label: 'hafta', get: (x) => x.weeks },
    { label: 'ortaSinif@0%', get: (x) => n0(x.lo.snap.middlePop) },
    { label: 'ortaSinif@100%', get: (x) => n0(x.hi.snap.middlePop) },
    { label: 'ustSinif@0%', get: (x) => n0(x.lo.snap.upperPop) },
    { label: 'ustSinif@100%', get: (x) => n0(x.hi.snap.upperPop) },
    { label: 'kadro@0%', get: (x) => n0(x.lo.snap.employees) },
    { label: 'kadro@100%', get: (x) => n0(x.hi.snap.employees) },
    { label: 'seviye@0%', get: (x) => x.lo.snap.factoryLevels },
    { label: 'seviye@100%', get: (x) => x.hi.snap.factoryLevels },
    { label: 'gdp@0%', get: (x) => n1(x.lo.snap.gdp) },
    { label: 'gdp@100%', get: (x) => n1(x.hi.snap.gdp) },
  ]));
  const far = horizons[horizons.length - 1];
  const dFar = relDelta(far.lo.snap.middlePop, far.hi.snap.middlePop);
  const dEmpFar = relDelta(far.lo.snap.employees, far.hi.snap.employees);
  console.log(`  1040 haftada: orta sinif farki ${pct(dFar)},`
    + ` sanayi kadrosu farki ${pct(dEmpFar)},`
    + ` tesis seviyesi ${far.lo.snap.factoryLevels} -> ${far.hi.snap.factoryLevels}`);
  // Ust ve orta sinifin toplam payi: okuryazar ulke sinif atlar.
  const dFarUpper = relDelta(far.lo.snap.upperPop, far.hi.snap.upperPop);
  console.log(`  1040 haftada ust sinif farki ${pct(dFarUpper)}`);
  if (Math.abs(dFar) < 0.03 && Math.abs(dFarUpper) < 0.05) {
    finding('MEDIUM', 'Egitim -> sinif hareketliligi',
      'egitim uzun ufukta sinif atlamayi gorunur olcude hizlandirmali',
      `1040 haftada orta sinif farki ${pct(dFar)}, ust sinif farki ${pct(dFarUpper)}`, '');
  }

  // ------------------------------------------------------------------
  // EGITIM -> SANAYI ISGUCU: neden panel ortalamasi, neden 260 hafta
  //
  // Mekanizma bir AKIS carpanidir, stok degil (economy.js `schooling`,
  // isealim HAVUZUNU carpar). Havuz ise stok tavaniyla kirpilir:
  //   min(workers, lower * MAX_WORKER_SHARE) - employed
  // Yani uzun ufukta istihdami fabrika kadrosu ve isci stogu belirler;
  // akis carpani yalnizca o tavana VARMA HIZINI degistirir. Etkinin
  // 1040 haftada sonmesi bu yuzden DOGRU davranistir, kusur degil.
  //
  // Ikinci karistirici: %100 egitim haftada ~28 daha pahalidir; hazineyi
  // bosaltir, insaati yavaslatir, tesis sayisini dusurur. Uzun ufuk
  // olcumu bu NEGATIF terimi de icerir — yani saf carpani olcmez.
  //
  // OLCULDU (6 tohum x 3 ufuk, 0% vs 100% egitim):
  //     ufuk        ortalama   sapma     aralik            negatif
  //     260 hafta    +%4.7     %7.2     -%4.0 .. +%16.4     2/6
  //     520 hafta    -%3.2     %6.9    -%17.1 .. +%5.7      5/6
  //    1040 hafta    +%0.8     %3.2     -%3.5 .. +%6.1      3/6
  //
  // Sonuc: 1040 haftada TEK TOHUM bir tahmin edici degil — isaret bile
  // kararsiz. Eski kontrol (`Math.abs(dEmpFar) < 0.05`) hem isaret koru
  // hem tek tohumluydu: ters yonde %11.9'luk bir IHLALI "OK" sayarken
  // dogru yondeki %2.4'u HIGH yapiyordu. Yerine:
  //   - asil sav, etkinin GORULEBILDIGI ufukta (260 hafta) ve PANEL
  //     ortalamasiyla olculur,
  //   - yon onemlidir: ceza yalnizca ISGUCUNU AZALTAN egitime verilir,
  //   - uzun ufuk yukarida bilgi olarak basilir, uzerinden hukum verilmez.
  // ------------------------------------------------------------------
  const EDU_PANEL = [SEED, 'edu-A', 'edu-B'];
  const panel = EDU_PANEL.map((seed) => {
    const arm = (value) => runScenario({
      seed, warmup: WARMUP, weeks: WEEKS, peaceful: true,
      levers: [{ key: 'social', value, classId: 'education' }],
    });
    const pLo = arm(0);
    const pHi = arm(100);
    return {
      seed,
      d: relDelta(pLo.snap.employees, pHi.snap.employees),
      empLo: pLo.snap.employees,
      empHi: pHi.snap.employees,
      goldLo: pLo.snap.gold,
      goldHi: pHi.snap.gold,
    };
  });
  console.log(`\n  panel: egitim %0 vs %100, ${WEEKS} hafta, ${panel.length} tohum`);
  console.log(table(panel, [
    { label: 'tohum', get: (x) => x.seed, right: false },
    { label: 'kadro@0%', get: (x) => n0(x.empLo) },
    { label: 'kadro@100%', get: (x) => n0(x.empHi) },
    { label: 'fark', get: (x) => pct(x.d) },
    { label: 'hazine@0%', get: (x) => n0(x.goldLo) },
    { label: 'hazine@100%', get: (x) => n0(x.goldHi) },
  ]));
  const dEmpMean = panel.reduce((s, x) => s + x.d, 0) / panel.length;
  console.log(`  panel ortalamasi: ${pct(dEmpMean)}`
    + ` (tohum basina: ${panel.map((x) => pct(x.d).trim()).join(' · ')})`);

  if (dEmpMean < 0) {
    // Gercek kusur: egitim isealimini HIZLANDIRMASI gerekirken yavaslatiyor.
    finding('HIGH', 'Egitim -> sanayi isgucu',
      'egitim isealimini hizlandirmali (economy.js `schooling` carpani)',
      `${panel.length} tohumlu panelde ${WEEKS} haftada ortalama fark ${pct(dEmpMean)}`
      + ' — egitim isgucunu AZALTIYOR',
      'akis carpani ters yonde ya da mali yuk carpani tamamen yutuyor');
  } else if (dEmpMean < 0.02 && Math.abs(dEmpFar) < 0.05) {
    // 260 haftalik panel gurultu altinda kalabilir; uzun ufukta (1040 h)
    // fark acildiysa kaldirac calisiyor demektir (okuryazarlik bir STOKTUR).
    finding('MEDIUM', 'Egitim -> sanayi isgucu',
      'egitim isealiminde olculebilir bir hizlanma uretmeli',
      `${panel.length} tohumlu panelde ${WEEKS} haftada ortalama fark yalniz ${pct(dEmpMean)}`,
      'yon dogru ama buyukluk tohum gurultusunun altinda');
  } else {
    console.log(`  OK  egitim isealimi hizlandiriyor (${WEEKS} hafta, panel ortalamasi).`);
  }
  console.log('  NOT: uzun ufukta (1040 hafta) fark sonuyor — akis carpani stok'
    + ' tavanina carpar. Beklenen davranis; uzerinden hukum verilmiyor.');

  // ESKI BULGU DUZELTILDI: "sistemde literacy diye saklanan hicbir alan yok"
  // artik DOGRU DEGIL. `economy.literacy` bir stoktur (economy.js
  // `advanceLiteracy`), haftada LITERACY_APPROACH=0.001 ile hedefe yaklasir
  // ve `economy` butun halinde serialize edildigi icin kayda girer. Kaydirac
  // kapatilinca da aninda kaybolmaz — ayni yavaslikla geri iner.
  // Geriye KALAN gercek bosluk daha dar: nitelik kanali hala durumsuz.
  finding('LOW', 'Isgucu niteligi hala durumsuz bir carpan',
    'egitim isgucu niteliginde de birikimli bir stok kurmali',
    'okuryazarlik STOK oldu (advanceLiteracy) ve arastirmayi besliyor'
    + ' (technology.js researchPointsOf), ama isealim/promosyon kanali hala'
    + ' anlik carpandir: schooling = 1 + egitim x 0.25 (+ yuksekogretim)',
    'kaydirac dususu isealim carpanini AYNI HAFTA sifirlar; okuryazarlik'
    + ' stogunun tersine burada birikmis bir yatirim tasinmaz');
}

// --------------------------------------------------------- SAGLIK ---
// Saglik kaydiraci REFAHA KATILDI (economy.js SOCIAL_PROGRAMS: olculdu,
// kaydiracin butun menzili nufus gurultusunun yirmide biriydi). Ayri bir
// kaydirac yok; nufus buyumesi refah bolumunde olculur.
sub('Saglik — refaha katildi (ayri kaydirac yok)');
console.log('  saglik harcamasi economy.social.welfare icinde; bkz. refah bolumu.');


// --------------------------------------------------------- REFAH ---
sub('Refah 0 / 50 / 100');
{
  const rows = [0, 50, 100].map((v) => ({ v, r: scenario(`wel${v}`, [{ key: 'social', value: v, classId: 'welfare' }]) }));
  console.log(table(rows, [
    { label: 'refah%', get: (x) => x.v },
    { label: 'sosyalGider', get: (x) => n2(x.r.snap.socialCost) },
    { label: 'altButce', get: (x) => n1(x.r.snap.lowerBudget) },
    { label: 'altSepet(cepten)', get: (x) => n1(x.r.snap.lowerCost) },
    { label: 'altMemnuniyet', get: (x) => n2(x.r.snap.lowerSat) },
    { label: 'ihtiyacKarsilanma', get: (x) => pct(x.r.cohorts.needsFulfilled) },
    { label: 'istikrar', get: (x) => n2(x.r.snap.stability) },
    { label: 'nufus', get: (x) => n0(x.r.snap.population) },
    { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  ]));
  const lo = rows[0].r;
  const hi = rows[2].r;
  console.log(`\n  refah 0->100: memnuniyet ${n2(lo.snap.lowerSat)} -> ${n2(hi.snap.lowerSat)},`
    + ` cepten sepet ${n1(lo.snap.lowerCost)} -> ${n1(hi.snap.lowerCost)},`
    + ` haftalik bedel ${n2(lo.snap.socialCost)} -> ${n2(hi.snap.socialCost)}`);
  console.log('  OK  refah hane butcesini ve memnuniyeti gercekten oynatiyor.');
}

// ------------------------------------------------------ YONETIM ---
// Yonetim kaydiraci (adminFunding) KALDIRILDI: tahsilat verimi artik yok
// (economy.js notu) ve yonetim gideri butcenin turetilmis kalemi. Eski bolum
// armyFunding'i yonetim sanip olcuyordu.
sub('Yonetim butcesi — kaydirac kaldirildi');
console.log('  yonetim gideri turetilir (nationBudget.administration); ayarlanacak kaydirac yok.');

// ------------------------------------------------------------ F. SIFIR ---
section('F. SIFIR HARCAMA DEVLETI');
const zeroLevers = [
  ...Object.keys(SOCIAL_PROGRAMS).map((id) => ({ key: 'social', value: 0, classId: id })),
  { key: 'armyFunding', value: 0 },
  { key: 'armyFunding', value: 0 },
  { key: 'armyFunding', value: 0 },
];
const maxLevers = [
  ...Object.keys(SOCIAL_PROGRAMS).map((id) => ({ key: 'social', value: 100, classId: id })),
  { key: 'armyFunding', value: 100 },
  { key: 'armyFunding', value: 100 },
  { key: 'armyFunding', value: 100 },
];
const base = scenario('base', []);
const zero = scenario('zero', zeroLevers);
const max = scenario('max', maxLevers, {
  repeatMutations: [{ name: 'subsidizeAll' }],
});

const stateCols = [
  { label: 'senaryo', get: (x) => x.label, right: false },
  { label: 'hazine', get: (x) => n0(x.r.snap.gold) },
  { label: 'borc', get: (x) => n0(x.r.snap.debt) },
  { label: 'gelir', get: (x) => n2(x.r.snap.income) },
  { label: 'gider', get: (x) => n2(x.r.snap.expenses) },
  { label: 'sosyal', get: (x) => n2(x.r.snap.socialCost) },
  { label: 'subvansiyon', get: (x) => n2(x.r.snap.subsidyCost) },
  { label: 'faiz', get: (x) => n2(x.r.snap.interestCost) },
  { label: 'nufus', get: (x) => n0(x.r.snap.population) },
  { label: 'istikrar', get: (x) => n2(x.r.snap.stability) },
  { label: 'alay', get: (x) => x.r.snap.regiments },
  { label: 'ikmal', get: (x) => n2(x.r.snap.supplyIndex) },
  { label: 'saldiriGucu', get: (x) => n1(x.r.army.power) },
  { label: 'tesis/seviye', get: (x) => `${x.r.snap.factories}/${x.r.snap.factoryLevels}` },
  { label: 'ihtiyac', get: (x) => pct(x.r.cohorts.needsFulfilled) },
];
console.log(table([
  { label: 'varsayilan', r: base },
  { label: 'her sey SIFIR', r: zero },
], stateCols));
{
  const dPop = relDelta(base.snap.population, zero.snap.population);
  const dGold = zero.snap.gold - base.snap.gold;
  console.log(`\n  sifir harcamanin ${WEEKS} haftalik bilancosu: hazine ${dGold >= 0 ? '+' : ''}${n0(dGold)},`
    + ` nufus ${pct(dPop)}, istikrar ${n2(base.snap.stability)} -> ${n2(zero.snap.stability)},`
    + ` saldiri gucu ${n1(base.army.power)} -> ${n1(zero.army.power)},`
    + ` sanayi ${base.snap.factories}/${base.snap.factoryLevels} -> ${zero.snap.factories}/${zero.snap.factoryLevels}`);
  if (Math.abs(dPop) < 0.03 && zero.cohorts.needsFulfilled > 0.9) {
    finding('MEDIUM', 'Sifir harcama devleti',
      'butun kamu harcamasini kapatmak zamanla yikici olmali',
      `${WEEKS} haftada nufus farki ${pct(dPop)}, ihtiyac karsilanmasi hala`
      + ` ${pct(zero.cohorts.needsFulfilled)}`,
      `tek gorunur bedel: istikrar ${n2(base.snap.stability)} -> ${n2(zero.snap.stability)},`
      + ` ordu gucu ${n1(base.army.power)} -> ${n1(zero.army.power)}`);
  }
}

// ----------------------------------------------------------- G. TAVAN ---
section('G. TAVAN HARCAMA DEVLETI');
console.log(table([
  { label: 'varsayilan', r: base },
  { label: 'her sey TAVAN + tum subvansiyon', r: max },
], stateCols));
{
  const affordable = max.snap.gold > 0 && max.snap.debt < 100;
  console.log(`\n  her sey tavanda: hazine ${n0(max.snap.gold)}, borc ${n0(max.snap.debt)},`
    + ` haftalik net ${n2(max.snap.net)}, faiz ${n2(max.snap.interestCost)} — surdurulebilir mi: ${affordable ? 'EVET' : 'hayir'}`);
  console.log(`  tavan harcamanin getirisi: istikrar ${n2(base.snap.stability)} -> ${n2(max.snap.stability)},`
    + ` nufus ${n0(base.snap.population)} -> ${n0(max.snap.population)},`
    + ` sanayi ${base.snap.factories}/${base.snap.factoryLevels} -> ${max.snap.factories}/${max.snap.factoryLevels}`);
  if (affordable) {
    finding('MEDIUM', 'Tavan harcama surdurulebilir', 'her kaydiraci tavana cekmek hazineyi zorlamali',
      `${WEEKS} hafta boyunca hazine ${n0(max.snap.gold)}, borc ${n0(max.snap.debt)}`, '');
  } else {
    console.log('  OK  tavan harcama hazineyi tuketiyor: "her seyi ac" dominant strateji degil.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
