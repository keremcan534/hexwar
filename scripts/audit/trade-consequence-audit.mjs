// Dis hesap denetimi: ticaret acigi devlete ve haneye ne yapiyor?
//
// Beta raporunun en agir iddiasi: butce ekrani haftada -824 net ticaret
// gosterirken hazine her hafta buyuyor. Mimari "ozel takas" (mallari hane ve
// firmalar oder, hazineye yalnizca gumruk girer) -- bu tutarli OLABILIR.
// Bu denetim tutarli olup olmadigini ve sonucun gercekten isirip isirmadigini
// olcer. Iddiayi degil, sayiyi esas alir.

import {
  headless, run, alive, snapshotNation, n1, n0, pct, section, sub, table,
  finding, reportFindings,
} from './harness.mjs';

const WEEKS = Number(process.argv[2] ?? 520);

section('DIS HESAP / TICARET SONUCU DENETIMI');

// URUN YAPILANDIRMASI (160x96, ~65 ulke). Diger denetimler hiz icin 78x62
// kullanir ama bu denetimin sordugu soru "SEVKEDILEN dunyada dis pozisyonun
// mali yonu dogru mu" — ve cevap haritaya duyarli. Olculdu: RGO kitlik
// onarimindan (bkz. LOG R-10) sonra kucuk haritada oran 0.93, urun
// haritasinda 3.90. Kucuk harita 30 ulkeyle daha kapali bir ekonomidir;
// ticaret her ulkenin GSYH'sinde daha kucuk pay tutar, dolayisiyla kapanis
// gumruge gore zayif kalir. Dogru cevap kucuk haritayi kabul etmek degil,
// dogru dunyayi olcmek.
const game = headless('TRADECONS', { cols: 160, rows: 96 });
const world = game.world;

// Haftalik iz: hazine kimligi + dis bagimlilik + hane refahi.
const trace = [];
let identityBreaks = 0;
let worstBreak = 0;

const prev = new Map();
for (const n of alive(game)) prev.set(n.id, n.gold);

for (let w = 0; w < WEEKS; w++) {
  game.turns.endTurn();
  for (const nation of alive(game)) {
    const L = nation.economy.ledger ?? {};
    const before = prev.get(nation.id) ?? 0;
    const after = nation.gold;
    // KIMLIK URETIM KODUNDAN OKUNUR, ELDE YENIDEN KURULMAZ.
    //
    // Burada `L.borrowed`, `L.repaid`, `L.defaulted` okunuyordu; DEFTERDEKI
    // KALEMLERIN ADI `borrow`, `repay`, `default`. Ucu de sessizce 0 donuyor,
    // yani kimlik yillardir yalnizca `net` ile kiyaslaniyordu ve borclanan ya
    // da temerrude dusen HER ULKE HER HAFTA "ihlal" sayiliyordu. Testin
    // kirmizisi simulasyonun degil, uc yazim hatasinin sonucuydu.
    // (Ayni aile: ledger L1'de gomulu sabit, L5'te var olmayan alan adlari,
    // price-stability'de elle yazilmis K.)
    //
    // `closeWeek` kimligi zaten kuruyor: delta = net + financing, ve kendi
    // sapmasini `unreconciled` olarak yayinliyor. Denetim ikisini de kullanir.
    const expected = L.delta ?? 0;
    const drift = Math.max(
      Math.abs((after - before) - expected),
      Math.abs(L.unreconciled ?? 0),
    );
    if (drift > 0.5) {
      identityBreaks++;
      worstBreak = Math.max(worstBreak, drift);
    }
    prev.set(nation.id, after);
  }
  if (w % 26 === 0 || w === WEEKS - 1) {
    const rows = alive(game).map((n) => snapshotNation(world, n));
    const totalGold = rows.reduce((s, r) => s + r.gold, 0);
    const totalDebt = rows.reduce((s, r) => s + r.debt, 0);
    const totalImports = rows.reduce((s, r) => s + r.importValue, 0);
    const totalExports = rows.reduce((s, r) => s + r.exportValue, 0);
    const avgNeeds = rows.reduce((s, r) => s + r.needsMet, 0) / rows.length;
    trace.push({
      week: w, year: 1836 + Math.floor(w / 52),
      gold: totalGold, debt: totalDebt,
      imports: totalImports, exports: totalExports,
      needs: avgNeeds,
      indebted: rows.filter((r) => r.debt > 1).length,
      nations: rows.length,
    });
  }
}

sub('DUNYA TOPLAMI ZAMAN ICINDE');
console.log(table(trace, [
  { label: 'yil', get: (r) => r.year },
  { label: 'hazine', get: (r) => n0(r.gold) },
  { label: 'borc', get: (r) => n0(r.debt) },
  { label: 'borclu', get: (r) => `${r.indebted}/${r.nations}` },
  { label: 'ithalat', get: (r) => n0(r.imports) },
  { label: 'ihracat', get: (r) => n0(r.exports) },
  { label: 'ihtiyac', get: (r) => pct(r.needs) },
]));

// --- 1. Hazine kimligi ---
sub('HAZINE KIMLIGI');
if (identityBreaks > 0) {
  finding('HIGH', 'hazine kimligi',
    'dHazine = net + borclanilan - odenen + temerrut, her hafta her ulke',
    `${identityBreaks} ihlal, en buyuk sapma ${n1(worstBreak)}`);
} else {
  console.log(`  Kimlik ${WEEKS} hafta x ${alive(game).length} ulke boyunca kapaniyor.`);
}

// --- 2. Ithalat bagimliligi hazineyi ODULLENDIRIYOR MU? ---
sub('ITHALAT BAGIMLILIGI vs HAZINE');
const rows = alive(game).map((n) => {
  const s = snapshotNation(world, n);
  const gdp = Math.max(1, s.gdp);
  return {
    ...s,
    dependency: s.importValue / Math.max(1, s.importValue + s.gdp),
    tradeBalance: s.exportValue - s.importValue,
    tariffShare: s.income > 0 ? s.tariffRevenue / s.income : 0,
    externalSettlement: n.economy.ledger?.externalSettlement ?? 0,
  };
}).sort((a, b) => a.tradeBalance - b.tradeBalance);

const worst = rows.slice(0, 8);
console.log('  En agir ticaret acigi olan 8 ulke:');
console.log(table(worst, [
  { label: 'ulke', get: (r) => r.name, right: false },
  { label: 'tic.dengesi', get: (r) => n1(r.tradeBalance) },
  { label: 'hazine', get: (r) => n0(r.gold) },
  { label: 'borc', get: (r) => n0(r.debt) },
  { label: 'net', get: (r) => n1(r.net) },
  { label: 'gumruk', get: (r) => n1(r.tariffRevenue) },
  { label: 'kapanis', get: (r) => n1(r.externalSettlement) },
  { label: 'ihtiyac', get: (r) => pct(r.needsMet) },
]));

// Acik veren ulkelerin hazinesi buyuyor mu?
const deficit = rows.filter((r) => r.tradeBalance < -1);
const surplus = rows.filter((r) => r.tradeBalance > 1);
const avg = (list, key) => (list.length ? list.reduce((s, r) => s + r[key], 0) / list.length : 0);
console.log(`\n  Acik veren ${deficit.length} ulke: ort. hazine ${n0(avg(deficit, 'gold'))}, `
  + `ort. net ${n1(avg(deficit, 'net'))}, ort. borc ${n0(avg(deficit, 'debt'))}`);
console.log(`  Fazla veren ${surplus.length} ulke: ort. hazine ${n0(avg(surplus, 'gold'))}, `
  + `ort. net ${n1(avg(surplus, 'net'))}, ort. borc ${n0(avg(surplus, 'debt'))}`);
// TANI: mutlak borc OLCEKLE karisir. Buyuk sanayi ulkesi fazla verirken insaat
// icin cok borclanabilir; bu, borcun "yanlis tarafta" oldugu anlamina gelmez.
// Olcekten arindirilmis hali de basilir ki hukum dogru sayiya dayansin.
const borcOran = (list) => (list.length
  ? list.reduce((s, r) => s + (r.debt ?? 0) / Math.max(1, r.gdp ?? 1), 0) / list.length : 0);
console.log(`  Olcekten arindirilmis: acik borc/GSYH ${n1(borcOran(deficit))}, `
  + `fazla borc/GSYH ${n1(borcOran(surplus))}`);

// ASIL SINAV, GORELI: fazla veren ulke acik verenden mali olarak daha iyi
// durumda olmali. Mutlak esik ("acigin neti negatif olsun") yanlis testti —
// kucuk acik veren zengin bir ulke vergisiyle rahatca dengede kalabilir ve
// bunda yanlis bir sey yok. Kotu olan SIRALAMANIN tersine donmesiydi.
if (deficit.length >= 3 && surplus.length >= 3) {
  const goldRatio = avg(surplus, 'gold') / Math.max(1, avg(deficit, 'gold'));
  if (goldRatio < 1) {
    finding('CRITICAL', 'dis pozisyonun mali yonu',
      'ticaret fazlasi veren ulke, acik verenden daha zengin olmali',
      `fazla/acik hazine orani ${goldRatio.toFixed(2)} (tersine donmus)`,
      `acik ${n0(avg(deficit, 'gold'))} vs fazla ${n0(avg(surplus, 'gold'))}`);
  } else {
    console.log(`\n  Fazla/acik hazine orani ${goldRatio.toFixed(2)}x — yon dogru.`);
  }
  // HUKUM OLCEKTEN ARINDIRILMIS SAYIYA DAYANIR. Once MUTLAK borc kiyaslaniyordu
  // ve o sayi ULKE BUYUKLUGUYLE karisir: fazla veren sanayi devi, insaat icin
  // acik veren kucuk ulkeden cok daha fazla borclanir; bu borcun "yanlis
  // tarafta" oldugu anlamina gelmez. Olculdu (160x96, 520 hafta): mutlak borc
  // acik 254 / fazla 548 (tersine donmus GORUNUYOR) ama borc/GSYH acik 11.7 /
  // fazla 2.4 — yani acik verenler ekonomilerine oranla BES KAT borclu. Iddia
  // dogruydu, olcusu yanlisti. Iki sayi da yukarida basilir.
  if (borcOran(deficit) < borcOran(surplus)) {
    finding('HIGH', 'borcun dagilimi',
      'borc yuku (GSYH\'ye oranla) agirlikla acik verenlerde olmali',
      `acik ${n1(borcOran(deficit))} < fazla ${n1(borcOran(surplus))}`,
      `mutlak borc: acik ${n0(avg(deficit, 'debt'))} vs fazla ${n0(avg(surplus, 'debt'))}`);
  } else {
    console.log(`  Borc yuku acik verenlerde: ${n1(borcOran(deficit) / Math.max(0.01, borcOran(surplus)))}x`
      + ` daha agir (GSYH'ye oranla) — yon dogru.`);
  }
}

// Dis hesabin NET katkisi: gumruk tek basina degil, kapanisla birlikte.
sub('DIS HESABIN NET MALI KATKISI');
const netExternal = (r) => r.tariffRevenue + r.externalSettlement;
console.log(table(rows.slice(0, 6), [
  { label: 'ulke', get: (r) => r.name, right: false },
  { label: 'tic.dengesi', get: (r) => n1(r.tradeBalance) },
  { label: 'gumruk', get: (r) => n1(r.tariffRevenue) },
  { label: 'kapanis', get: (r) => n1(r.externalSettlement) },
  { label: 'net dis', get: (r) => n1(netExternal(r)) },
]));
// Acik verip yine de dis hesaptan KAZANAN ulke mumkundur ve yanlis degildir:
// yuksek gumruk kendi hanesinden vergi toplar. Ama bedava olmamali — bedeli
// HANEYE binmeli. Test bunu arar: devlet kazaniyorsa halk odemis olmali.
const worldNeeds = rows.reduce((s, r) => s + r.needsMet, 0) / rows.length;
const extractive = rows.filter((r) => r.tradeBalance < -5 && netExternal(r) > 0);
const freeLunch = extractive.filter((r) => r.needsMet >= worldNeeds);
console.log(`\n  Dunya ort. ihtiyac karsilanmasi ${pct(worldNeeds)}.`);
console.log(`  Acik verip dis hesaptan kazanan ${extractive.length} ulke; `
  + `bunlarin ${extractive.length - freeLunch.length} tanesinde hane ortalamanin altinda.`);
// INFO, kusur degil: kucuk acik + yuksek gumruk + genis vergi tabani olan
// zengin ulke dis hesaptan kazanip halkini da rahat tutabilir (19. yy
// Britanyasi tam olarak buydu). Izlenir, cunku bu grup buyurse ters tesvik
// geri gelmis demektir; tek basina bir hata degil.
if (freeLunch.length) {
  finding('INFO', 'gumruk cikarimi yapan zengin ulkeler',
    'izleme kalemi — grup buyurse ters tesvik geri donmus olur',
    `${freeLunch.length}/${rows.length} ulke dis hesaptan kazaniyor ve hanesi ortalama ustu`,
    freeLunch.slice(0, 3).map((r) => `${r.name}: net dis +${n1(netExternal(r))}, ihtiyac ${pct(r.needsMet)}`).join(' · '));
}

// --- 3. Para yaratimi: dunya toplaminda altin nereden geliyor? ---
sub('BORC KULLANIMI');
const last = trace[trace.length - 1];
console.log(`  ${last.year}: ${last.indebted}/${last.nations} ulke borclu, toplam borc ${n0(last.debt)}`);
if (last.indebted <= 1 && WEEKS >= 260) {
  finding('HIGH', 'mali baski',
    'uzun kosuda bazi ulkeler borclanmali (dis acik, savas, cokus)',
    `${last.year} yilinda yalnizca ${last.indebted} ulke borclu`);
}

process.exit(reportFindings() > 0 ? 1 : 0);
