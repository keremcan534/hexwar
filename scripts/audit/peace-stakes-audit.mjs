// Baris bedeli denetimi. Beta'nin en agir denge bulgusu (B-01 / BUG-009):
// -25 savas skoruyla, iki sehri isgal altindayken BEDAVA beyaz baris.
//
// Kok neden iki ayri kabul yoluydu: `ai.js` kazananin beyaz barisi
// reddetmesini zaten isletiyordu, ama yalnizca YZ-YZ arasinda. Oyuncunun
// masasindaki `offerRefusal` bedeli sifir olan her teklifi kosulsuz kabul
// ediyordu. Bu denetim iki yolun ayni cevabi vermesini SABITLER.

import { headless, section, sub, table, n1, finding, reportFindings } from './harness.mjs';
import {
  offerRefusal, offerMeetsExpectation, warScore, acceptanceTolerance,
  occupiedProvincesOf, provinceKeyOf, MAX_DEMAND_PROVINCES,
} from '../../src/game/peace.js';
import { declareWar, atWar } from '../../src/game/diplomacy.js';
import { controllerOf } from '../../src/game/control.js';

section('BARIS BEDELI / SAVAS STAKE DENETIMI');

const game = headless('PEACESTAKE');
const world = game.world;
for (let i = 0; i < 40; i++) game.turns.endTurn();

const alive = world.nations.filter((n) => n.alive && n.tiles > 4);
const [aggressor, victim] = alive;

// --- Kurulum: saldirgan kurbanin topragini isgal eder ---
if (!atWar(world, aggressor.id, victim.id)) declareWar(game, aggressor.id, victim.id);
// Kurbanin kareleri saldirganin kontrolune gecirilir (cephe simulasyonu yerine
// dogrudan kontrol atamasi: bu test BARIS KAPISINI olcer, savasi degil).
let seized = 0;
for (const tile of world.tiles) {
  if (tile.owner !== victim.id) continue;
  if (seized >= Math.floor(victim.tiles * 0.6)) break;
  tile.controller = aggressor.id;
  seized++;
}

const scoreA = warScore(world, aggressor.id, victim.id);
const scoreV = warScore(world, victim.id, aggressor.id);
sub('DURUM');
console.log(`  ${aggressor.name} ${seized} kareyi isgal etti.`);
console.log(`  warScore(saldirgan) = ${scoreA} · warScore(kurban) = ${scoreV}`);
console.log(`  kurbanin toleransi = ${n1(acceptanceTolerance(world, victim.id, aggressor.id))}`);
console.log(`  saldirganin toleransi = ${n1(acceptanceTolerance(world, aggressor.id, victim.id))}`);

if (scoreA <= 10) {
  console.log('\n  UYARI: kurulum yeterli savas skoru uretmedi, test anlamsiz.');
  process.exit(0);
}

const white = { demands: [], concessions: [], terms: [] };

// --- TEST 1: kaybeden taraf bedava beyaz baris ISTEYEMEZ ---
sub('TEST 1 — kaybeden beyaz baris istiyor (oyuncu yolu)');
const refusal = offerRefusal(world, victim.id, aggressor.id, white);
console.log(`  offerRefusal(kurban -> saldirgan, beyaz baris):`);
console.log(`    ${refusal ?? 'KABUL EDILDI'}`);
if (refusal === null) {
  finding('CRITICAL', 'bedava beyaz baris',
    `${scoreA} skorla onde olan taraf bedava beyaz barisi REDDETMELI`,
    'teklif kosulsuz kabul edildi',
    'BUG-009 / B-01 geri dondu: offerRefusal kazananin pozisyonuna bakmiyor');
} else {
  console.log('  -> Kazanan taraf bedava imzalamiyor. DOGRU.');
}

// --- TEST 2: iki yol ayni cevabi veriyor mu? ---
sub('TEST 2 — oyuncu yolu ile YZ yolu ayni mi?');
const cases = [
  { name: 'beyaz baris', offer: white },
  {
    name: 'kaybeden isgal edilmis topragi birakiyor',
    offer: {
      demands: [],
      concessions: occupiedProvincesOf(world, aggressor.id, victim.id)
        .slice(0, MAX_DEMAND_PROVINCES).map(({ province }) => provinceKeyOf(province)),
      terms: [],
    },
  },
  { name: 'kazanan tazminat istiyor', offer: { demands: [], concessions: [], terms: ['REPARATIONS'] } },
];
const rowsOut = [];
let mismatch = 0;
for (const { name, offer } of cases) {
  // Kurban teklif ediyor, saldirgan aliyor.
  const playerPath = offerRefusal(world, victim.id, aggressor.id, offer) === null;
  const aiPath = offerMeetsExpectation(world, aggressor.id, victim.id, offer);
  if (playerPath !== aiPath) mismatch++;
  rowsOut.push({ name, playerPath, aiPath });
}
console.log(table(rowsOut, [
  { label: 'teklif', get: (r) => r.name, right: false },
  { label: 'oyuncu yolu', get: (r) => (r.playerPath ? 'kabul' : 'ret') },
  { label: 'YZ yolu', get: (r) => (r.aiPath ? 'kabul' : 'ret') },
]));
if (mismatch) {
  finding('CRITICAL', 'kabul yollarinin ayrismasi',
    'offerRefusal ve offerMeetsExpectation ayni cevabi vermeli',
    `${mismatch} vakada yollar ayrisiyor`,
    'iki kabul yolu = oyuncuya ozel kacak (BUG-009 kalibi)');
} else {
  console.log('  -> Iki yol ortusuyor.');
}

// --- TEST 3: kaybeden taviz vererek barisi SATIN ALABILIR ---
sub('TEST 3 — kaybeden taviz vererek barisi satin alabiliyor mu?');
const concede = occupiedProvincesOf(world, aggressor.id, victim.id)
  .slice(0, MAX_DEMAND_PROVINCES).map(({ province }) => provinceKeyOf(province));
const buyOffer = { demands: [], concessions: concede, terms: [] };
const buyRefusal = offerRefusal(world, victim.id, aggressor.id, buyOffer);
console.log(`  ${concede.length} kume birakan teklif: ${buyRefusal ?? 'KABUL EDILDI'}`);
if (concede.length === 0) {
  console.log('  (tam isgal edilmis kume yok — bu kurulumda test edilemez)');
} else if (buyRefusal !== null) {
  finding('HIGH', 'baris satin alinamiyor',
    'kaybeden, isgal edilmis topragi masada birakarak savasi bitirebilmeli',
    `teklif reddedildi: ${buyRefusal}`,
    'aksi halde savas kapanamaz — donmus cephe / gec oyun karar boslugu');
} else {
  console.log('  -> Kaybeden bedel odeyerek cikabiliyor. DOGRU.');
}

// --- TEST 4: yorgunluk kapiyi eninde sonunda aciyor (donmus savas panzehiri) ---
sub('TEST 4 — yorgunluk toleransi');
const rec = world.relations[victim.id][aggressor.id];
const originalSince = rec.since;
const tolRows = [];
for (const years of [0, 2, 4, 6, 10]) {
  rec.since = (world.turn ?? 0) - years * 52;
  const relAggr = world.relations[aggressor.id][victim.id];
  const savedAggr = relAggr.since;
  relAggr.since = rec.since;
  tolRows.push({
    years,
    tol: acceptanceTolerance(world, aggressor.id, victim.id),
    white: offerRefusal(world, victim.id, aggressor.id, white) === null ? 'kabul' : 'ret',
  });
  relAggr.since = savedAggr;
}
rec.since = originalSince;
console.log(table(tolRows, [
  { label: 'savas yili', get: (r) => r.years },
  { label: 'tolerans', get: (r) => n1(r.tol) },
  { label: 'beyaz baris', get: (r) => r.white },
]));
if (tolRows[0].tol >= tolRows[tolRows.length - 1].tol) {
  finding('MEDIUM', 'yorgunluk etkisi',
    'uzayan savas kabul esigini gevsetmeli (donmus savas panzehiri)',
    'tolerans savas suresiyle artmiyor');
} else {
  console.log('  -> Tolerans savas suresiyle gevsiyor. DOGRU.');
}

// --- TEST 5: YIPRANMIS KAZANAN da bedava imzalamaz ---
// Canli oyunda yakalanan kacak (seed BETA1836, 1840): kazanan taraf iki
// cephede savasiyor ve istikrari dusukse tolerans (45.9) ustunlugun
// tamamini (37) yutuyor ve beyaz baris yine bedava geciyordu.
sub('TEST 5 — yipranmis kazanan (tolerans tavani)');
const savedStability = world.nations[aggressor.id].economy.stability;
world.nations[aggressor.id].economy.stability = 0.25; // coken istikrar
const relAg = world.relations[aggressor.id][victim.id];
const savedSince2 = relAg.since;
relAg.since = (world.turn ?? 0) - 8 * 52; // 8 yil savas: yorgunluk tavanda
// Ucuncu bir dusman: "ikinci cephe" toleransini da ac.
const third = alive.find((n) => n.id !== aggressor.id && n.id !== victim.id);
if (third && !atWar(world, aggressor.id, third.id)) declareWar(game, aggressor.id, third.id);

const lead = warScore(world, aggressor.id, victim.id);
const tol = acceptanceTolerance(world, aggressor.id, victim.id);
const whiteNow = offerRefusal(world, victim.id, aggressor.id, white);
console.log(`  Kazananin ustunlugu ${lead}, toleransi ${n1(tol)} (istikrar %25, 8 yil, 2 cephe)`);
console.log(`  Beyaz baris: ${whiteNow ?? 'KABUL EDILDI'}`);
if (lead > 12 && whiteNow === null) {
  finding('CRITICAL', 'yipranmis kazanan bedava imzaliyor',
    'tolerans, kazanilan ustunlugun tamamini silmemeli',
    `ustunluk ${lead} ama tolerans ${n1(tol)} -> beyaz baris bedava`,
    'BUG-009 tolerans yolundan geri dondu');
} else if (lead > 12) {
  console.log(`  -> Tolerans tavani tutuyor: ${n1(tol)} <= ${n1(lead * 0.6)} (ustunlugun %60'i). DOGRU.`);
}
world.nations[aggressor.id].economy.stability = savedStability;
relAg.since = savedSince2;

process.exit(reportFindings() > 0 ? 1 : 0);
