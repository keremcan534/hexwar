// Ozel sermaye yatirim boru hatti denetimi.
//
// Kor Beta #2'de oyuncunun ulkesi 20. yildan 80. yila kadar 7 fabrikada
// dondu: hazine ¤16-25k, karli firsat var, ama YENI ozel yatirim yok.
// Bu denetim o kilitlenmenin imzasini olcer ve bir daha donmesin diye
// nobet tutar.
//
// Kilit imzasi: acik ozel proje >= kapi ESIGI, haftalarca hicbir projeye
// para akmiyor, buna ragmen yeni yatirim de baslamiyor.

import {
  headless, runPeaceful, asPlayer, alive, section, sub, table,
  finding, reportFindings, n0, n1,
} from './harness.mjs';
import { ensureConstruction } from '../../src/game/construction.js';
import { FACTORIES } from '../../src/game/economy.js';

/** Duz nesne satirlarini tezgahin kolon sozlesmesine cevirir. */
function show(rows, keys) {
  console.log(table(rows, keys.map((key, i) => ({
    label: key, get: (row) => row[key] ?? '', right: i !== 0,
  }))));
}

/** Bir ulkenin ozel proje kesiti. */
function privateSnapshot(nation) {
  const projects = ensureConstruction(nation).projects.filter((p) => p.actor === 'private');
  return {
    open: projects.length,
    funded: projects.reduce((sum, p) => sum + p.funded, 0),
    // Insaat ilerlemesi de HAREKETTIR: tam fonlanmis iki santiye calisirken
    // sermayenin birikmesi kilit degil, sirada bekleyen yatirimdir.
    progress: projects.reduce((sum, p) => sum + (p.progress ?? 0), 0),
    // Parasi eksik ve bu hafta para almamis proje: kilidin gercek imzasi.
    underfunded: projects.filter((p) => p.funded < p.cost).length,
    cost: projects.reduce((sum, p) => sum + p.cost, 0),
    dormant: projects.filter((p) => p.dormant).length,
    capital: nation.politics?.privateCapital ?? 0,
    factories: nation.economy?.factories?.length ?? 0,
    levels: (nation.economy?.factories ?? []).reduce((sum, f) => sum + f.level, 0),
  };
}

/**
 * Uzun kosuda kilitlenme izi surer. Her hafta ozel projelerin toplam
 * fonlamasina bakar; artmayan her hafta "durgun" sayilir.
 */
function trackNation(game, nation, weeks) {
  const trace = {
    stallStreak: 0, maxStall: 0, blockedWeeks: 0,
    completions: 0, starts: 0, lastFunded: -1, lastFactories: -1, lastProgress: -1,
    firstBlockedTurn: 0, weeks,
  };
  for (let i = 0; i < weeks; i++) {
    runPeaceful(game, 1);
    if (!nation.alive) break;
    const snap = privateSnapshot(nation);
    if (trace.lastFactories >= 0 && snap.factories > trace.lastFactories) trace.completions++;
    if (trace.lastFunded >= 0) {
      // HAREKET: para aktı, ya santiye ilerledi, ya bir tesis bitti. Ucu de
      // yoksa ozel sanayi gercekten durmus demektir.
      const moved = snap.funded > trace.lastFunded + 0.001
        || snap.progress > trace.lastProgress + 0.001
        || snap.factories !== trace.lastFactories;
      if (moved) {
        trace.stallStreak = 0;
      } else {
        trace.stallStreak++;
        trace.maxStall = Math.max(trace.maxStall, trace.stallStreak);
      }
      // Kilit imzasi: kapi kapali, parasi eksik proje var, sermaye elde
      // duruyor — ama hicbir sey kimildamiyor.
      const gateShut = snap.open - snap.dormant >= 2 && snap.underfunded > 0;
      if (gateShut && trace.stallStreak > 4 && snap.capital > 1) {
        if (!trace.blockedWeeks) trace.firstBlockedTurn = game.world.turn;
        trace.blockedWeeks++;
      }
    }
    trace.lastFunded = snap.funded;
    trace.lastProgress = snap.progress;
    trace.lastFactories = snap.factories;
  }
  return trace;
}

section('private-investment-audit — Ozel sermaye kilitlenmesi');

// --------------------------------------------------------------- UZUN KOSU --
sub('TEST 1 — 60 yillik oyuncu ulkesi (kilit imzasi)');

const rows = [];
let worstBlocked = 0;
let worstSeed = '';
for (const seed of ['PRIV1', 'PRIV2', 'PRIV3']) {
  const game = headless(seed);
  runPeaceful(game, 30);
  const nation = alive(game)
    .sort((a, b) => (b.economy.factories?.length ?? 0) - (a.economy.factories?.length ?? 0))[0];
  asPlayer(game, nation);
  const before = privateSnapshot(nation);
  const trace = trackNation(game, nation, 3100);
  const after = privateSnapshot(nation);
  rows.push({
    seed,
    tesis: `${before.factories} -> ${after.factories}`,
    seviye: `${before.levels} -> ${after.levels}`,
    acik: after.open,
    uyuyan: after.dormant,
    tamamlanan: trace.completions,
    'en uzun durgunluk': trace.maxStall,
    'kilitli hafta': trace.blockedWeeks,
    sermaye: n0(after.capital),
  });
  if (trace.blockedWeeks > worstBlocked) {
    worstBlocked = trace.blockedWeeks;
    worstSeed = seed;
  }
}
show(rows, ['seed', 'tesis', 'seviye', 'acik', 'uyuyan', 'tamamlanan', 'en uzun durgunluk', 'kilitli hafta', 'sermaye']);

// 60 yilda hicbir ulke yillarca "kapi kapali + para akmiyor" halinde kalmamali.
const BLOCK_LIMIT = 260; // 5 yil
if (worstBlocked > BLOCK_LIMIT) {
  finding('CRITICAL', 'ozel yatirim kilidi',
    `kapi kapali + fonlama durgun hali ${BLOCK_LIMIT} haftayi asmamali`,
    `${worstSeed} tohumunda ${worstBlocked} hafta`,
    'durmus proje ozel yatirim kapisini kalici isgal ediyor');
}

// --------------------------------------------------- SENARYO A-G (KONTROLLU) --
sub('TEST 2 — kontrollu senaryolar A-G');

/** Tek ulkeli kontrollu tezgah: oyuncu ulkesi, savassiz. */
function scenarioGame(seed = 'PRIVSC') {
  const game = headless(seed);
  runPeaceful(game, 40);
  const nation = alive(game)
    .sort((a, b) => (b.economy.factories?.length ?? 0) - (a.economy.factories?.length ?? 0))[0];
  asPlayer(game, nation);
  return { game, nation };
}

const scenarios = [];
function scenario(id, title, verdict, detail) {
  scenarios.push({ id, senaryo: title, sonuc: verdict, kanit: detail });
}

// A — gecerli proje normal tamamlanir.
{
  const { game, nation } = scenarioGame('SC-A');
  const state = ensureConstruction(nation);
  const before = nation.economy.factories.length;
  // Kapitalistlere nakit ver: acik proje normal hizda bitmeli.
  nation.politics.privateCapital = 1200;
  runPeaceful(game, 260);
  const grew = nation.economy.factories.length > before || state.projects.length === 0;
  scenario('A', 'nakitli proje tamamlanir', grew ? 'GECTI' : 'KALDI',
    `tesis ${before} -> ${nation.economy.factories.length}`);
}

// B — gecici parasiz kalan proje sonra devam eder.
{
  const { game, nation } = scenarioGame('SC-B');
  nation.politics.privateCapital = 0;
  runPeaceful(game, 120);
  const mid = ensureConstruction(nation).projects.filter((p) => p.actor === 'private');
  const midFunded = mid.reduce((s, p) => s + p.funded, 0);
  nation.politics.privateCapital = 900;
  runPeaceful(game, 120);
  const late = ensureConstruction(nation).projects.filter((p) => p.actor === 'private');
  const lateFunded = late.reduce((s, p) => s + p.funded, 0);
  const resumed = lateFunded > midFunded || nation.economy.factories.length > 0;
  scenario('B', 'gecici parasiz proje devam eder', resumed ? 'GECTI' : 'KALDI',
    `fonlama ${n1(midFunded)} -> ${n1(lateFunded)}`);
}

// C — kalici gecersiz proje slotu sonsuza kadar tutamaz.
{
  const { game, nation } = scenarioGame('SC-C');
  const state = ensureConstruction(nation);
  // Iki sahte, hicbir zaman fonlanamayacak ozel proje: kapiyi kapatir.
  for (let i = 0; i < 2; i++) {
    state.projects.push({
      id: state.nextId++, kind: 'upgrade', typeId: 'CANNERY',
      factoryId: 'yok-boyle-bir-tesis', regionName: 'Hayalet', q: 1, r: 1,
      work: 400, cost: 5000, funded: 0, actor: 'private', started: game.world.turn,
    });
  }
  nation.politics.privateCapital = 0;
  const before = nation.economy.factories.length;
  runPeaceful(game, 400);
  const ghosts = ensureConstruction(nation).projects.filter(
    (p) => p.factoryId === 'yok-boyle-bir-tesis',
  );
  const freed = ghosts.length === 0 || ghosts.every((p) => p.dormant);
  scenario('C', 'kalici gecersiz proje slotu birakir', freed ? 'GECTI' : 'KALDI',
    `hayalet proje ${ghosts.length}, uyuyan ${ghosts.filter((p) => p.dormant).length}, tesis ${before} -> ${nation.economy.factories.length}`);
}

// D — yukseltme hedefi kaybolursa proje temizlenir.
{
  const { game, nation } = scenarioGame('SC-D');
  const state = ensureConstruction(nation);
  state.projects.push({
    id: state.nextId++, kind: 'upgrade', typeId: 'CANNERY',
    factoryId: 'kaybolan-tesis', regionName: 'Kayip', q: 2, r: 2,
    work: 200, cost: 300, funded: 150, actor: 'private', started: game.world.turn,
  });
  runPeaceful(game, 120);
  const orphan = ensureConstruction(nation).projects.find((p) => p.factoryId === 'kaybolan-tesis');
  scenario('D', 'hedefi kaybolan yukseltme temizlenir', !orphan ? 'GECTI' : 'KALDI',
    orphan ? `proje duruyor (uyuyan: ${Boolean(orphan.dormant)})` : 'proje kuyruktan dustu');
}

// E — yillarca suren malzeme/para kitligi.
{
  const { game, nation } = scenarioGame('SC-E');
  nation.politics.privateCapital = 0;
  const before = privateSnapshot(nation);
  // 5 yil boyunca sermayeyi her hafta sifirla: hicbir proje ilerleyemez.
  for (let i = 0; i < 260; i++) {
    nation.politics.privateCapital = 0;
    runPeaceful(game, 1);
  }
  const mid = privateSnapshot(nation);
  nation.politics.privateCapital = 1200;
  runPeaceful(game, 200);
  const after = privateSnapshot(nation);
  const recovered = after.factories > mid.factories || after.funded > mid.funded;
  scenario('E', 'uzun kitliktan sonra toparlanma', recovered ? 'GECTI' : 'KALDI',
    `tesis ${before.factories} -> ${mid.factories} -> ${after.factories}`);
}

// F — bir proje dururken karli firsat varsa yatirim devam etmeli.
{
  const { game, nation } = scenarioGame('SC-F');
  const state = ensureConstruction(nation);
  state.projects.push({
    id: state.nextId++, kind: 'upgrade', typeId: 'CANNERY',
    factoryId: 'donmus-1', regionName: 'Donmus', q: 3, r: 3,
    work: 900, cost: 9000, funded: 0, actor: 'private', started: game.world.turn,
  });
  const before = nation.economy.factories.length;
  nation.politics.privateCapital = 1200;
  runPeaceful(game, 400);
  const after = nation.economy.factories.length;
  scenario('F', 'durmus proje varken yatirim surer', after > before ? 'GECTI' : 'KALDI',
    `tesis ${before} -> ${after}`);
}

// G — iki durmus proje + karli firsat.
{
  const { game, nation } = scenarioGame('SC-G');
  const state = ensureConstruction(nation);
  for (let i = 0; i < 2; i++) {
    state.projects.push({
      id: state.nextId++, kind: 'upgrade', typeId: 'CANNERY',
      factoryId: `donmus-${i}`, regionName: 'Donmus', q: 4 + i, r: 4,
      work: 900, cost: 9000, funded: 0, actor: 'private', started: game.world.turn,
    });
  }
  const before = nation.economy.factories.length;
  nation.politics.privateCapital = 1200;
  runPeaceful(game, 400);
  const after = nation.economy.factories.length;
  scenario('G', 'iki durmus proje + firsat', after > before ? 'GECTI' : 'KALDI',
    `tesis ${before} -> ${after}`);
}

show(scenarios, ['id', 'senaryo', 'sonuc', 'kanit']);
const failed = scenarios.filter((s) => s.sonuc === 'KALDI');
if (failed.length) {
  finding('CRITICAL', 'ozel yatirim senaryolari',
    'A-G senaryolarinin tamami gecmeli',
    `${failed.length} senaryo kaldi: ${failed.map((s) => s.id).join(', ')}`,
    'durmus proje kalici olarak yeni yatirimi engelliyor');
}

// ------------------------------------------------------- DUNYA GENELI SAGLIK --
sub('TEST 3 — dunya geneli sanayi buyumesi (60 yil)');

{
  const game = headless('PRIVWORLD');
  runPeaceful(game, 3100);
  const nations = alive(game);
  const frozen = nations.filter((nation) => {
    const snap = privateSnapshot(nation);
    return snap.open >= 2 && snap.open - snap.dormant >= 2 && snap.capital > 200;
  });
  const totals = nations.reduce((sum, n) => sum + (n.economy.factories?.length ?? 0), 0);
  show([{
    ulke: nations.length,
    'toplam tesis': totals,
    'tesis/ulke': n1(totals / Math.max(1, nations.length)),
    'kapisi kapali + parasi olan': frozen.length,
  }], ['ulke', 'toplam tesis', 'tesis/ulke', 'kapisi kapali + parasi olan']);
  if (frozen.length > nations.length * 0.25) {
    finding('HIGH', 'dunya ozel yatirimi',
      'ulkelerin dortte birinden fazlasi ayni anda kapali+parali olmamali',
      `${frozen.length}/${nations.length}`,
      'kilit tek ulkeye ozgu degil, sistemik');
  }
}

reportFindings();
console.log(`\n  (tesis turu sayisi: ${Object.keys(FACTORIES).length})`);
