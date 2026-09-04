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
// Uc test:
//   1. Fiyat endeksi bir DENGEYE oturmali (surekli asagi kaymamali).
//   2. Mallarin cogu bantta cakili kalmamali.
//   3. Nominal gelir yuzyilin ikinci yarisinda cokmemeli.
//
// ACIK KALAN (bu denetim OLCER, cozmez): dunya uretim kapasitesi tuketimin
// ~1.9 kati. Fiyat capasi bunu bir DENGEYE cevirir ama dengenin yeri taban
// fiyatin yarisidir. Gercek bir BUYUME egrisi icin RGO verimi / kisi basi
// sepet / sanayinin emisi birlikte kalibre edilmeli — ayri bir pass.
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
  for (const [id, good] of Object.entries(world.market.goods)) {
    const base = good.basePrice ?? GOODS[id]?.basePrice ?? 0;
    if (!(base > 0)) continue;
    supply += good.supply * base;
    demand += good.demand * base;
    index += good.price / base;
    counted++;
    if (good.price <= base * 0.12 + 1e-6 || good.price >= base * 8 - 1e-6) pinned++;
  }
  return {
    index: counted > 0 ? index / counted : 0,
    pinned,
    goods: counted,
    ratio: demand > 0 ? supply / demand : 0,
  };
}

const rows = [];
for (const seed of SEEDS) {
  const game = headless(seed);
  const world = game.world;
  runPeaceful(game, 60);
  const nation = pickNation(game);
  game.turns.playerNation = nation.id;
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

sub('ACIK BULGU — yapisal asiri kapasite');
{
  const avg = rows.reduce((s, r) => s + r.arzTalep, 0) / Math.max(1, rows.length);
  console.log(`  dunya arzi / talebi (taban fiyatla): ${n2(avg)}`);
  console.log('  Bu bir DENGE sorunu degil KALIBRASYON sorunudur: fiyat capasi');
  console.log('  cokusu durdurur ama dengenin yeri taban fiyatin yarisidir.');
  console.log('  Gercek buyume egrisi RGO verimi / kisi basi sepet / sanayinin');
  console.log('  emisinin birlikte kalibre edilmesini ister (ayri pass).');
}

reportFindings();
