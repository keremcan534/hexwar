// MEKANIK SAGLIK TARAMASI — "bu mekanik calisiyor mu?"
//
// Tek soru sorar ve her mekanige ayni soruyu sorar: kaldiraci TABANDAN
// TAVANA cekince oyunda olculebilir bir sey degisiyor mu?
//
// Uc sonuc vardir:
//   OLU            — hicbir olcut kimildamadi (bit bit ayni). Mekanik yok.
//   GURULTU ALTI   — kimildadi ama tohum gurultusunun altinda. Oyuncu hissedemez.
//   CALISIYOR      — gurultunun uzerinde. Mekanik var.
//
// Gurultu tabani butce gecisinde olculdu (6 tohum, 160 hafta, hicbir seye
// dokunulmadan): hazine %50.8 · gsyh %51.9 · nufus %39.1 · needsMet %26.5 ·
// istikrar %5.5 · memnuniyet %5.3. Bir mekanigin BUTUN menzili bu esigin
// altindaysa oyuncu icin yoktur.
//
// IKI OLCUT SONRADAN EKLENDI — okuryazarlik ve tamamlanan teknoloji. Sebep:
// yukaridaki altisi da KISA VADELI ekonomik olcutlerdir; egitim/basin/okul
// gibi yavas yanan mekanikler oralarda hicbir zaman gorunmez. Ayni yontemle
// olculdu (6 tohum, 150 hafta): okuryazarlik %0.0 (hicbir seye dokunulmayan
// ulkede tamamen belirlenimli), teknoloji %20.2, haftalik arastirma %4.8.
//
// Okuryazarligin gurultusu SIFIR ciktigi icin bolme anlamsizlasirdi; taban
// %5'te tutuluyor. Bu keyfi degil: olculen en kucuk taban memnuniyetin %5.3'u
// ve bu, bu oyundaki "insanin fark ettigi en kucuk degisim" olcegidir.
//
//   npm run audit:mechanics

import { headless, runPeaceful, pickNation, section, sub, finding, reportFindings } from './harness.mjs';
import { LAWS, refreshLawModifiers } from '../../src/game/politics.js';
import { BUDGET_POLICIES, budgetPolicyLimits, setBudgetPolicy } from '../../src/game/economy.js';
import { researchPointsOf } from '../../src/game/technology.js';

const WEEKS = 120;
const WARMUP = 30;
const SEEDS = ['mh1', 'mh2', 'mh3'];

/**
 * Gurultu tabani — butce gecisinde 6 tohumla olculdu.
 *
 * DIKKAT, `gdp` esigi BAYAT: 51.9 sayisi GSYH brut ciktiyken olculmustu.
 * 2026-09-04'te GSYH katma degere cevrildi (bkz. economy.js runFactories,
 * ACCOUNTING_INVARIANTS L15) ve sanayinin GSYH icindeki agirligi %46'dan
 * %11'e indi, yani seriden seriye yayilim da degismis olabilir. Bu kosuda
 * hicbir kaldiracin verdictini GSYH belirlemedi (hepsinin en guclu olcutu
 * sat/stab/rp/gold/lit) — o yuzden hukumler etkilenmedi. Yine de esik
 * yeniden olculmeli; olculene kadar GSYH ile verilen bir hukum supheli
 * sayilmalidir.
 */
const NOISE = {
  gold: 50.8, gdp: 51.9, pop: 39.1, needs: 26.5, stab: 5.5, sat: 5.3,
  lit: 5.0, tech: 20.2, rp: 5.0,
};

function measure(nation) {
  const e = nation.economy;
  return {
    gold: nation.gold ?? 0,
    gdp: e.gdp ?? 0,
    pop: e.population ?? 0,
    needs: e.needsMet ?? 0,
    stab: e.stability ?? 0,
    sat: e.classes?.lower?.satisfaction ?? 0,
    lit: e.literacy ?? 0,
    tech: nation.research?.done?.length ?? 0,
    // Haftalik arastirma URETIMI — tamamlanan teknoloji sayisi bunun 120
    // haftada yalnizca 2-3 kez zipladigi kaba bir sayacidir; uretimin
    // kendisi teknoloji ekraninda yazan ve her hafta degisen sayidir.
    rp: researchPointsOf(nation),
  };
}

/** Bir kolu kosar: `apply(nation)` her hafta cagrilir. */
function arm(seed, apply) {
  const game = headless(seed);
  runPeaceful(game, WARMUP);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  apply?.(nation);
  for (let i = 0; i < WEEKS; i++) {
    runPeaceful(game, 1);
    apply?.(nation);
  }
  return measure(nation);
}

/** Iki kolun en buyuk BAGIL farki (%), olcut olcut. */
function spread(a, b) {
  const out = {};
  let identical = true;
  let best = { key: null, pct: 0, ratio: 0 };
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) identical = false;
    const scale = Math.max(Math.abs(a[key]), Math.abs(b[key]), 1e-9);
    const pct = Math.abs(b[key] - a[key]) / scale * 100;
    out[key] = pct;
    const ratio = pct / NOISE[key];
    if (ratio > best.ratio) best = { key, pct, ratio };
  }
  return { out, identical, best };
}

function verdict(sp) {
  if (sp.identical) return 'OLU';
  return sp.best.ratio >= 1 ? 'CALISIYOR' : 'GURULTU ALTI';
}

const results = [];

/**
 * SAVAS KALDIRACLARI — barisci arenada olculemez.
 *
 * Bu tarama bilerek `runPeaceful` kosar: savas topragi, toprak nufusu, nufus
 * her seyi degistirir; savasli bir arenada iki kol arasindaki fark artik
 * kaldiraca degil kimin kimi fethettigine baglanir (bkz. harness.mjs). Bedeli
 * su: bir kaldiracin FAYDASI yalnizca muharebede goruluyorsa burada yalnizca
 * MALIYETI olculur ve mekanik hakkinda verilen hukum yanlis olur.
 *
 * `armyFunding` tam olarak boyledir. Uc ciktisinin ucu de muharebe yolundadir
 * (battles.js muharebe gucu, military.js takviye, recruitment.js egitim) ve
 * uctu de dogrulanmistir — `npm run audit:budget-contract` §6 her ucunun
 * dogru yone hareket ettigini olcer. Burada ALTI CIZILEREK ayri tutulur:
 * "olculemedi" ile "yok" ayni sey degildir.
 */
const WAR_LEVERS = new Set(['armyFunding']);

function probe(label, applyLow, applyHigh) {
  const lows = SEEDS.map((s) => arm(s, applyLow));
  const highs = SEEDS.map((s) => arm(s, applyHigh));
  const sps = lows.map((lo, i) => spread(lo, highs[i]));
  const identical = sps.every((s) => s.identical);
  // TOHUMLAR ARASINDA ORTALAMA ALINIR, EN IYISI SECILMEZ. Ilk surum her
  // olcut icin tohumlarin EN BUYUK sapmasini aliyordu; iki tohumun maksimumu
  // tohum gurultusunu olcume geri sokar ve esik civarindaki mekanikler kosudan
  // kosuya taraf degistirir (olculdu: armyFunding ayni kodda 1.31x ve 0.61x).
  // Once olcut olcut ORTALAMA, sonra en guclu olcut.
  const best = { key: '-', pct: 0, ratio: 0 };
  for (const key of Object.keys(NOISE)) {
    const pct = sps.reduce((sum, s) => sum + s.out[key], 0) / sps.length;
    const ratio = pct / NOISE[key];
    if (ratio > best.ratio) { best.key = key; best.pct = pct; best.ratio = ratio; }
  }
  let v = identical ? 'OLU' : (best.ratio >= 1 ? 'CALISIYOR' : 'GURULTU ALTI');
  if (WAR_LEVERS.has(label) && v !== 'OLU') v = 'SAVAS KALDIRACI';
  results.push({ label, verdict: v, key: best.key, pct: best.pct, ratio: best.ratio });
  const mark = v === 'OLU' ? '  <<< OLU'
    : v === 'GURULTU ALTI' ? '  <-- hissedilmez'
      : v === 'SAVAS KALDIRACI' ? '  <-- baris arenasinda yalniz MALIYETI gorunur'
        : '';
  console.log(`  ${label.padEnd(24)} ${v.padEnd(13)} en guclu: ${String(best.key).padEnd(6)}`
    + ` %${best.pct.toFixed(1).padStart(6)}  = gurultunun ${best.ratio.toFixed(2)} kati${mark}`);
}

// ============================================================= YASALAR
section('MEKANIK SAGLIK TARAMASI');
sub(`Yasalar — taban kademe vs tavan kademe (${WEEKS} hafta, ${SEEDS.length} tohum)`);

/**
 * Siyasi kapi ATLANIR: burada kapinin degil ETKININ olcusu yapiliyor. Yine de
 * yururlukteki kademe iktidarin tavaniyla kirpilir (politics.lawCap); tavani
 * o yasada en yuksek olan parti iki kolda da iktidarda tutulur ki olculen
 * fark yalniz yasadan gelsin.
 */
const TOP_PARTY = {
  constitution: 'liberal',
  labour: 'socialist',
  welfare: 'socialist',
  citizenship: 'liberal',
  conscription: 'nationalist',
};

function governLaw(nation, lawId, levelId) {
  const party = nation.politics.parties.find((item) => item.ideology === TOP_PARTY[lawId]);
  nation.politics.rulingPartyId = party.id;
  nation.politics.laws[lawId] = levelId;
  refreshLawModifiers(nation);
}

for (const law of LAWS) {
  const bottom = law.levels[0].id;
  const top = law.levels[law.levels.length - 1].id;
  probe(law.id, (nation) => governLaw(nation, law.id, bottom), (nation) => governLaw(nation, law.id, top));
}

// ============================================================ MESRUIYET
sub('Mesruiyet — halkin arkasinda olmayan hukumet istikrar oder mi?');
{
  // Destek her hafta siyaset fazinda yeniden hesaplanir; ekonomi bir SONRAKI
  // hafta okur. Kol her hafta sonunda destegi yazar: bir kolda iktidar
  // halkla esit, digerinde en onde giden partinin 30 puan gerisinde.
  const backing = (gap) => (nation) => {
    const ruling = nation.politics.rulingPartyId;
    const other = nation.politics.parties.find((party) => party.id !== ruling);
    for (const party of nation.politics.parties) {
      party.support = party.id === ruling ? 25 - gap / 2
        : party.id === other.id ? 25 + gap / 2 : 25;
    }
  };
  probe('mesruiyet (30 puan)', backing(0), backing(30));
}

// ============================================================ BUTCE
sub('Butce kaldiraclari — kontrol grubu (bunlarin calistigi ayrica dogrulandi)');
// TABAN VE TAVAN SABIT DEGIL, HUKUMETIN IZIN VERDIGI YERDIR. Ilk surum
// 0-100 (ordu icin 25-100) yaziyordu; oysa serbest ticaret partisi altinda
// tarife bandi -50..25, baris yanlisi hukumette ordu tavani 60'tir. Sabit
// sayilarla olculen sey oyuncunun cekebilecegi menzil DEGILDI: reform
// merdivenlerinde taban/tavan gercek kademelerdir, butcede de oyle olmali.
for (const policy of BUDGET_POLICIES) {
  probe(policy,
    (n) => setBudgetPolicy(n, policy, budgetPolicyLimits(n)[policy].min),
    (n) => setBudgetPolicy(n, policy, budgetPolicyLimits(n)[policy].max));
}

// ================================================ DOGRUDAN KANAL OLCUMU
sub('Dogrudan kanal — gurultunun altinda kalan mekanik BAGLI MI?');
{
  // "Hissedilmiyor" ile "bagli degil" ayni sey degildir. Yukaridaki tarama
  // kaba olcutlere bakar; burada her zayif mekanigin BAGLANDIGI sayi dogrudan
  // okunur. Gecerse mekanik vardir ve yonu dogrudur — yalnizca oyuncunun onu
  // ayirt etmesi zordur. Gecmezse mekanik gercekten yoktur.
  const channel = (label, lawId, lowStep, highStep, read) => {
    const one = (step) => {
      const game = headless(SEEDS[0]);
      runPeaceful(game, WARMUP);
      const nation = pickNation(game);
      game.turns.playerNation = nation.id;
      const set = () => governLaw(nation, lawId, step);
      set();
      for (let i = 0; i < WEEKS; i++) { runPeaceful(game, 1); set(); }
      return read(nation);
    };
    const lo = one(lowStep);
    const hi = one(highStep);
    const delta = (hi - lo) / Math.max(1e-9, Math.abs(lo)) * 100;
    const ok = Math.abs(delta) > 1;
    console.log(`  ${label.padEnd(34)} ${lo.toFixed(3).padStart(10)} -> ${hi.toFixed(3).padStart(10)}`
      + `  %${delta.toFixed(1).padStart(6)}  ${ok ? 'BAGLI' : 'BAGLI DEGIL'}`);
    if (!ok) {
      finding('HIGH', `Kanal: ${label}`, 'zayif mekanik bari BAGLI olmali',
        `${lo} -> ${hi}, degisim %${delta.toFixed(2)}`);
    }
  };
  // Eski `political_rights` merdiveni (0.57x) vatandaslik yasasina, asgari
  // ucret ve sendika merdivenleri isci hakki yasasina katlandi.
  channel('citizenship -> tasra geliri', 'citizenship',
    'residency', 'full_citizenship', (n) => n.economy.ledger.state ?? 0);
  channel('labour -> isci geliri', 'labour',
    'no_labour_rights', 'strong_labour_rights', (n) => n.economy.classes?.lower?.income ?? 0);
}

// ============================================================== OZET
sub('Ozet');
const dead = results.filter((r) => r.verdict === 'OLU');
const weak = results.filter((r) => r.verdict === 'GURULTU ALTI');
const live = results.filter((r) => r.verdict === 'CALISIYOR');
const war = results.filter((r) => r.verdict === 'SAVAS KALDIRACI');
console.log(`  toplam ${results.length} mekanik · CALISIYOR ${live.length}`
  + ` · GURULTU ALTI ${weak.length} · OLU ${dead.length}`
  + ` · SAVAS KALDIRACI ${war.length} (bu arenada olculemez)`);
if (war.length) {
  console.log(`  savas kaldiraclari ayrica dogrulanir: npm run audit:budget-contract §6`
    + ` — ${war.map((w) => w.label).join(', ')}`);
}

if (dead.length) {
  finding('HIGH', 'Olu mekanikler',
    'kaldiraci tabandan tavana cekmek olculebilir bir sey degistirmeli',
    `${dead.length} mekanikte HICBIR olcut kimildamadi: ${dead.map((d) => d.label).join(', ')}`);
}
if (weak.length) {
  finding('MEDIUM', 'Hissedilmeyen mekanikler',
    'butun menzil tohum gurultusunun uzerinde olmali',
    `${weak.length} mekanik gurultunun altinda: ${weak.map((w) => `${w.label} (${w.ratio.toFixed(2)}x)`).join(', ')}`);
}

reportFindings();
