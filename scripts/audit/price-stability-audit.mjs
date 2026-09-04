// Fiyat kararliligi ve gelir egrisi denetimi.
//
// BULGU (2026-09-04, olculdu): eski fiyat kurali saf bir INTEGRATORDU —
// `price *= 1 + imbalance * PRICE_SPEED`, taban fiyata donduren kuvvet yok.
// Dunya arzi talebi TABAN FIYATLA degerlendiginde 1.9 katliyor; sabit bir
// arz fazlasi haftada kucuk bir dusus demek ve yirmi yilda fiyat endeksi
// 1.86'dan 0.47'ye iniyordu. Gelir nominal oldugu icin (RGO degeri x pay +
// bordro) sinif geliri ON KAT, vergi dokuz kat eriyordu. "Oyunun orta oyunu
// yok" bulgusunun sebebi buydu.
//
// Dort test:
//   1. Fiyat endeksi bir DENGEYE oturmali (surekli asagi kaymamali).
//   2. Mallarin cogu bantta cakili kalmamali.
//   3. Nominal gelir yuzyilin ikinci yarisinda cokmemeli.
//   4. REEL kisi basi tuketim buyumeli. (2026-09-04 eklendi.)
//
// TEST 4 NEDEN GEREKTI. Ilk uc test 2026-09-04'te hepsi YESILDI ve ekonomi yine
// de bozuktu: fiyat oturuyor, gelir ayakta, ama insanlar her yil biraz daha az
// tuketiyordu. Sebep, olculen sayinin NOMINAL olmasiydi — 100 yillik kosuda
// reel takas 1.32 katina cikarken nominal 2376'dan 524'e iniyor. Nominal seri
// hacim artisi ile fiyat dususunu birbirine goturur, yani buyumeyi tanim
// geregi gosteremez. "Buyume egrisi yok" bulgusunun yillarca fiyat cokusuyle
// karismasinin sebebi tam olarak buydu.
//
// ACIK KALAN (bu denetim artik OLCER ve BULGU YAZAR, ama cozmez): dunya uretim
// kapasitesi tuketimini asiyor ve makas aciliyor (30. yilda ~1.9, 100. yilda
// 3.2-3.7). Fiyat capasi bunu bir DENGEYE cevirir ama dengenin yeri taban
// fiyatin yarisidir. Kok sebep talep tarafinda: `bought = quantity * afford`
// ve afford <= 1, yani talep SABIT sepetin (CLASS_NEEDS) uzerine cikamaz.
// Gelir arttiginda talep artmaz. Victoria 3'te bu ok vardir (gelir -> yasam
// standardi -> ihtiyac -> talep); bizde yok. Gercek bir BUYUME egrisi icin RGO
// verimi / kisi basi sepet / sanayinin emisi birlikte kalibre edilmeli — ayri
// bir pass.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import {
  headless, runPeaceful, pickNation, section, sub, table, n2, finding, reportFindings,
} from './harness.mjs';
import { GOODS } from '../../src/game/economy.js';

// 1560 hafta (30 yil). KISA UFUK YANILTIR: dunya yapay olarak yuksek
// fiyatlarla acilir (1836'da hicbir fabrika yok, her mal kit) ve denge
// seviyesine ~15 yilda iner. 1040 haftalik kosuda "ikinci yari" hala o
// INISI icerir ve mekanigi haksiz yere "kaciyor" diye isaretler; olculdu:
// ayni kodda 1040'ta kayma -0.52, 1560'ta -0.08.
const WEEKS = Number(process.argv[2] ?? 1560);
const SEEDS = (process.argv[3] ?? 'PRICE-A,PRICE-B').split(',');

section(`FIYAT KARARLILIGI / GELIR EGRISI — ${WEEKS} hafta x ${SEEDS.length} tohum`);

/** Dunya piyasasinin tek satirlik kesiti; arz/talep TABAN FIYATLA degerlenir. */
function marketSlice(world) {
  let supply = 0;
  let demand = 0;
  let index = 0;
  let counted = 0;
  let pinned = 0;
  // Fiilen el degistiren mal, SABIT fiyatla: reel tuketim budur. Cari fiyatla
  // olcmek daireseldir — fiyat zaten fazlanin sonucu.
  let realTraded = 0;
  for (const [id, good] of Object.entries(world.market.goods)) {
    const base = good.basePrice ?? GOODS[id]?.basePrice ?? 0;
    if (!(base > 0)) continue;
    supply += good.supply * base;
    demand += good.demand * base;
    realTraded += Math.min(good.supply, good.demand) * base;
    index += good.price / base;
    counted++;
    if (good.price <= base * 0.12 + 1e-6 || good.price >= base * 8 - 1e-6) pinned++;
  }
  // Reel URETIM ulke defterinden gelir (economy.js realGdp): katma deger,
  // taban fiyatlarla. Reel TUKETIM piyasadan. Ikisi ayri sorulara cevaptir ve
  // aralarindaki makas tam olarak "asiri kapasite"nin tanimidir.
  let realOutput = 0;
  for (const nation of world.nations) {
    if (nation.alive && nation.economy) realOutput += nation.economy.realGdp ?? 0;
  }
  // Payda DUNYA nufusudur (sahipsiz province dahil), pay ise yalniz yasayan
  // ulkelerin defteri. Kolonilesme paydayi buyutmeden payi buyutur, yani
  // sapma buyume LEHINEDIR: test bu yuzden temkinli, yanlis alarm vermez.
  let population = 0;
  for (const province of world.provinces ?? []) {
    population += province.econ?.population ?? 0;
  }
  const people = Math.max(1, population);
  return {
    index: counted > 0 ? index / counted : 0,
    pinned,
    goods: counted,
    ratio: demand > 0 ? supply / demand : 0,
    realOutputPerCapita: realOutput / people,
    realTradedPerCapita: realTraded / people,
  };
}

const rows = [];
for (const seed of SEEDS) {
  const game = headless(seed);
  const world = game.world;
  runPeaceful(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
  // Buyume bir SEVIYE degil bir ORANDIR: baslangic kesiti olmadan olculemez.
  const start = marketSlice(world);
  const half = Math.floor(WEEKS / 2);
  runPeaceful(game, half);
  const mid = marketSlice(world);
  const midIncome = nation.economy?.ledger?.income ?? 0;
  runPeaceful(game, WEEKS - half);
  const end = marketSlice(world);
  const endIncome = nation.economy?.ledger?.income ?? 0;
  rows.push({
    seed,
    ortaEndeks: mid.index,
    sonEndeks: end.index,
    kayma: end.index - mid.index,
    cakili: `${end.pinned}/${end.goods}`,
    arzTalep: end.ratio,
    ortaGelir: midIncome,
    sonGelir: endIncome,
    gelirOran: midIncome > 0 ? endIncome / midIncome : 0,
    reelUretimBuyume: start.realOutputPerCapita > 0
      ? end.realOutputPerCapita / start.realOutputPerCapita : 0,
    reelTuketimBuyume: start.realTradedPerCapita > 0
      ? end.realTradedPerCapita / start.realTradedPerCapita : 0,
  });
}

sub('OLCUM');
console.log(table(rows, [
  { label: 'tohum', get: (r) => r.seed, right: false },
  { label: 'endeks(orta)', get: (r) => n2(r.ortaEndeks) },
  { label: 'endeks(son)', get: (r) => n2(r.sonEndeks) },
  { label: 'kayma', get: (r) => n2(r.kayma) },
  { label: 'cakili', get: (r) => r.cakili, right: false },
  { label: 'arz/talep', get: (r) => n2(r.arzTalep) },
  { label: 'gelir(orta)', get: (r) => n2(r.ortaGelir) },
  { label: 'gelir(son)', get: (r) => n2(r.sonGelir) },
  { label: 'gelir orani', get: (r) => n2(r.gelirOran) },
  { label: 'reel uretim/kisi', get: (r) => n2(r.reelUretimBuyume) },
  { label: 'reel tuketim/kisi', get: (r) => n2(r.reelTuketimBuyume) },
]));

sub('TEST 1 — fiyat endeksi bir dengeye oturuyor mu?');
{
  // Ikinci yaridaki kayma ilk yarininkinin bir kesri olmali: integrator
  // davranisinda kayma HIZLANIR, dengede soner.
  const worst = rows.reduce((a, b) => (Math.abs(b.kayma) > Math.abs(a.kayma) ? b : a));
  console.log(`  ikinci yaridaki endeks kaymasi en fazla ${n2(worst.kayma)} (${worst.seed})`);
  if (worst.kayma < -0.25) {
    finding('HIGH', 'fiyat capasi',
      'kosunun ikinci yarisinda endeks -0.25\'ten fazla kaymamali',
      n2(worst.kayma), 'fiyat kurali dengesizligi biriktiriyor, dengeye oturmuyor');
  } else {
    console.log('  -> Fiyat seviyesi bir dengeye oturuyor. DOGRU.');
  }
}

sub('TEST 2 — mallar bantta cakili mi?');
{
  const worst = rows.reduce((a, b) => (
    Number(b.cakili.split('/')[0]) > Number(a.cakili.split('/')[0]) ? b : a));
  const [pinned, goods] = worst.cakili.split('/').map(Number);
  console.log(`  en kotu tohumda cakili mal ${pinned}/${goods}`);
  if (pinned > goods * 0.5) {
    finding('HIGH', 'fiyat bandi',
      'mallarin yarisindan fazlasi banda cakili kalmamali', worst.cakili);
  } else {
    console.log('  -> Mallarin cogunun fiyati hala hareket ediyor. DOGRU.');
  }
}

sub('TEST 3 — nominal gelir cokuyor mu?');
{
  const worst = rows.reduce((a, b) => (b.gelirOran < a.gelirOran ? b : a));
  console.log(`  ikinci yarida gelir orani en dusuk ${n2(worst.gelirOran)} (${worst.seed})`);
  if (worst.gelirOran < 0.5) {
    finding('HIGH', 'gelir cokuyor',
      'kosunun ikinci yarisinda gelir yarisindan fazlasini kaybetmemeli',
      n2(worst.gelirOran));
  } else {
    console.log('  -> Gelir ikinci yarida ayakta kaliyor. DOGRU.');
  }
}

sub('TEST 4 — reel buyume egrisi var mi?');
{
  // BU TESTIN OLCTUGU SEY NOMINAL DEGILDIR ve olmamalidir. Nominal seride
  // hacim artisi ile fiyat dususu birbirini goturur: 100 yillik kosuda reel
  // takas 1.32 katina cikarken nominal 2376'dan 524'e iniyordu. "Buyume yok"
  // bulgusunun yillarca fiyat cokusuyle karismasinin sebebi buydu.
  //
  // Iki ayri oran, cunku iki ayri soru:
  //   uretim/kisi  — ulke defterindeki reel katma deger (economy.js realGdp)
  //   tuketim/kisi — piyasada fiilen el degistiren mal
  // Uretim buyurken tuketim buyumuyorsa aradaki makas ASIRI KAPASITEDIR.
  const enKotuUretim = rows.reduce((a, b) => (b.reelUretimBuyume < a.reelUretimBuyume ? b : a));
  const enKotuTuketim = rows.reduce((a, b) => (b.reelTuketimBuyume < a.reelTuketimBuyume ? b : a));
  console.log(`  reel uretim/kisi  en dusuk ${n2(enKotuUretim.reelUretimBuyume)}x (${enKotuUretim.seed})`);
  console.log(`  reel tuketim/kisi en dusuk ${n2(enKotuTuketim.reelTuketimBuyume)}x (${enKotuTuketim.seed})`);
  // Olcut: BARIS icinde gecen ~30 yilda insanlar daha iyi yasamali. Duz bir
  // cizgi bile basarisizliktir — Victoria kalibinda bu donem sanayi devrimidir.
  if (enKotuTuketim.reelTuketimBuyume < 1) {
    finding('HIGH', 'reel buyume',
      `${WEEKS} haftalik barista reel kisi basi tuketim en az 1.00x olmali`,
      `${n2(enKotuTuketim.reelTuketimBuyume)}x (${enKotuTuketim.seed})`,
      'kalibrasyon acigi: RGO verimi + kisi basi sepet + sanayinin emisi'
        + ' birlikte ayarlanmadikca talep sabit sepet tavanina yaslanir'
        + ' (bkz. CLASS_NEEDS, CLASS_CEILING) ve arz onu gecer');
  } else {
    console.log('  -> Reel kisi basi tuketim buyuyor. DOGRU.');
  }
}

sub('ACIK BULGU — yapisal asiri kapasite');
{
  const avg = rows.reduce((s, r) => s + r.arzTalep, 0) / Math.max(1, rows.length);
  console.log(`  dunya arzi / talebi (taban fiyatla): ${n2(avg)}`);
  console.log('  Bu bir DENGE sorunu degil KALIBRASYON sorunudur: fiyat capasi');
  console.log('  cokusu durdurur ama dengenin yeri taban fiyatin yarisidir.');
  console.log('  Denge kapali formda: x = 1 - K(r-1)/(r+1), K = PRICE_SPEED /');
  console.log('  PRICE_ANCHOR = 5. Yani %22 kalici fazla fiyati YARIYA indirir,');
  console.log('  %50 fazla mali banda civiler. Olculdu: 17 malda RMS hata 0.06.');
  console.log('  UYARI: bu toplam oran cakili ve talebi sifir mallarla kirlenir');
  console.log('  (baris arenasinda topcu/tufek talebi yok; fazlanin ~%30\'u orada).');
  console.log('  Buyume icin bakilacak sayi TEST 4\'tur, bu oran degil.');
}

reportFindings();
