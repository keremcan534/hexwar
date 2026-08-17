// ASKERI EKRAN TANILAMASI
//
// Ekranin arkasindaki sistem gercekten calisiyor mu? Alti senaryo, hepsi
// bassiz: iddia kod okuyarak degil olcerek kanitlanir.
//
//   A  bol insan gucu + yeterli techizat  -> siparis kuyruga girer ve biter
//   B  insan gucu var, silah yok          -> engellenir ve NEDENI yazar
//   C  bes siparis                        -> kuyruk eyaletlere yayilir
//   D  subay yarat, ata, kaydet, yukle    -> atama korunur
//   E  buyuk ulke, cok subay, uzun kuyruk -> ekran verisi hizli turetilir
//   F  askeri butce dusuk                 -> egitim/takviye gercekten yavaslar
//
// Kosum:  npm run diagnose:military

import { headless, run, section, sub, table, n0, n1, n2, pct } from './audit/harness.mjs';
import { serialize, deserialize } from '../src/game/save.js';
import {
  cancelTraining, prioritizeTraining, queueRecruit, recruitBlockers, runTraining,
  trainingQueue, trainingSpeed, trainingCapacity,
} from '../src/game/recruitment.js';
import {
  BRANCH, assignDivisions, createGeneral, generalOfArmy, officersOf,
} from '../src/game/command.js';
import {
  armyComposition, commandRoster, militaryStats, militarySummary, recruitOptions,
  trainingRows, unassignedDivisions,
} from '../src/game/military.js';
import { equipmentStock, setEquipmentStock } from '../src/game/economy.js';

const SEED = 'military-screen';
const WARMUP = 80;

function biggest(game) {
  return game.world.nations.filter((n) => n.alive && n.economy)
    .sort((a, b) => b.tiles - a.tiles)[0];
}

/**
 * Ulkeyi test icin zengin ve tam techizatli yapar. Kuyruk da bosaltilir:
 * isitma haftalarinda YZ kendi siparislerini vermis olur ve olcum onlarin
 * uzerine yazilirsa "bir alay kuruldu" iddiasi kanitlanamaz.
 */
function stock(nation, { gold = 2000, arms = 40, artillery = 20, steamers = 16 } = {}) {
  nation.gold = gold;
  setEquipmentStock(nation, 'arms', arms);
  setEquipmentStock(nation, 'artillery', artillery);
  setEquipmentStock(nation, 'steamers', steamers);
  trainingQueue(nation).length = 0;
  return nation;
}

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'GECTI ' : 'KALDI '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// ------------------------------------------------------------------ TEST A ---
section('TEST A — bol insan gucu + yeterli techizat: siparis sahaya cikmali');
{
  const game = headless(SEED);
  run(game, WARMUP);
  const nation = stock(biggest(game));
  game.turns.playerNation = nation.id;

  const before = game.world.units.filter((u) => u.nationId === nation.id).length;
  const item = queueRecruit(game, nation, 'INFANTRY');
  const goldAfterOrder = nation.gold;
  console.log(`  siparis: ${item?.typeId} · ${item?.weeks} hafta · cikis ${item?.q}:${item?.r}`);
  check('siparis kuyruga girdi', Boolean(item));
  check('altin siparis aninda dustu', goldAfterOrder === 2000 - 25, `hazine ${goldAfterOrder}`);
  check('silah stogu siparis aninda dustu', equipmentStock(nation, 'arms') === 36,
    `stok ${equipmentStock(nation, 'arms').toFixed(1)}`);

  // Ilk hafta bitmemeli: ordu bir gecede kurulmaz.
  runTraining(game);
  const afterOneWeek = game.world.units.filter((u) => u.nationId === nation.id).length;
  check('bir hafta sonra HALA sahada yok', afterOneWeek === before,
    `birim ${before} -> ${afterOneWeek}`);

  let weeks = 1;
  while (trainingQueue(nation).length && weeks < 40) {
    runTraining(game);
    weeks++;
  }
  const after = game.world.units.filter((u) => u.nationId === nation.id).length;
  const expected = Math.ceil(8 / trainingSpeed(nation));
  check('alay sahaya cikti', after === before + 1, `birim ${before} -> ${after}`);
  check('sure ilan edilen egitim suresine uydu', Math.abs(weeks - expected) <= 1,
    `${weeks} hafta (beklenen ~${expected}, hiz ${n2(trainingSpeed(nation))})`);
}

// ------------------------------------------------------------------ TEST B ---
section('TEST B — insan gucu var, silah yok: sebep yazili olmali');
{
  const game = headless(SEED);
  run(game, WARMUP);
  const nation = stock(biggest(game), { arms: 0, artillery: 0, steamers: 0 });
  game.turns.playerNation = nation.id;

  const options = recruitOptions(game, nation);
  console.log(table(options, [
    { label: 'kol', get: (r) => r.id, right: false },
    { label: 'kurulur', get: (r) => (r.canBuild ? 'evet' : 'hayir') },
    { label: 'sebep', get: (r) => (r.blockers[0]?.text ?? '—'), right: false },
  ]));
  const infantry = options.find((row) => row.id === 'INFANTRY');
  check('piyade engellendi', !infantry.canBuild);
  check('engel silah kitligi', infantry.blockers.some((b) => b.id === 'equipment:arms'),
    infantry.blockers.map((b) => b.id).join(','));
  check('sebep okunabilir cumle', /Small Arms short/.test(infantry.blockers[0]?.text ?? ''),
    infantry.blockers[0]?.text);
  check('siparis gercekten reddedildi', queueRecruit(game, nation, 'INFANTRY') === null);
  check('insan gucu havuzu dolu', militarySummary(game.world, nation).manpower > 10000,
    n0(militarySummary(game.world, nation).manpower));
}

// ------------------------------------------------------------------ TEST C ---
section('TEST C — bes siparis: kuyruk eyaletlere yayilmali ve duzgun listelenmeli');
{
  const game = headless(SEED);
  run(game, WARMUP);
  const nation = stock(biggest(game));
  game.turns.playerNation = nation.id;
  for (let i = 0; i < 5; i++) queueRecruit(game, nation, 'INFANTRY');

  const rows = trainingRows(game, nation);
  console.log(table(rows, [
    { label: '#', get: (r) => r.index + 1 },
    { label: 'kol', get: (r) => r.name, right: false },
    { label: 'cikis', get: (r) => r.province, right: false },
    { label: 'eyalet', get: (r) => r.region, right: false },
    { label: 'ilerleme', get: (r) => pct(r.share) },
    { label: 'kalan', get: (r) => `${r.left}h` },
    { label: 'durum', get: (r) => (r.queued ? 'sirada' : r.stalled ? 'takildi' : 'egitimde'), right: false },
  ]));
  const places = new Set(rows.map((row) => `${row.province}`));
  check('bes satir listelendi', rows.length === 5);
  check('kuyruk tek province\'e yigilmadi', places.size > 1, `${places.size} ayri cikis`);
  const capacity = trainingCapacity(game.world, nation);
  runTraining(game);
  const advanced = trainingRows(game, nation).filter((row) => row.progress > 0).length;
  check('kapasite kadari ilerledi', advanced === Math.min(capacity, 5),
    `kapasite ${capacity}, ilerleyen ${advanced}`);
  check('kalanlar sira bekliyor', trainingRows(game, nation).some((row) => row.queued)
    || capacity >= 5, 'kapasite tavani calisiyor');

  // Oncelik ve iptal.
  const queue = trainingQueue(nation);
  const lastId = queue[queue.length - 1].id;
  prioritizeTraining(nation, lastId, -1);
  check('oncelik oklari kuyrugu tasidi', trainingQueue(nation)[3].id === lastId);
  const goldBefore = nation.gold;
  cancelTraining(game, nation, queue[0].id);
  check('iptal kuyrugu kisaltti', trainingQueue(nation).length === 4);
  check('iptal harcanmamis payi iade etti', nation.gold > goldBefore && nation.gold < goldBefore + 25,
    `hazine ${n1(goldBefore)} -> ${n1(nation.gold)}`);
}

// ------------------------------------------------------------------ TEST D ---
section('TEST D — subay yarat, ata, kaydet, yukle: atama ve kuyruk korunmali');
{
  const game = headless(SEED);
  run(game, WARMUP);
  const nation = stock(biggest(game));
  game.turns.playerNation = nation.id;

  const general = createGeneral(game.world, nation, game.turns.rng, { branch: BRANCH.ARMY });
  const armies = game.world.units.filter(
    (unit) => unit.nationId === nation.id && unit.type.domain === 'land',
  );
  assignDivisions(nation, general.id, armies);
  queueRecruit(game, nation, 'INFANTRY');
  queueRecruit(game, nation, 'ARTILLERY');
  runTraining(game);
  runTraining(game);

  const before = {
    officers: officersOf(nation, BRANCH.ARMY).length,
    commanded: general.divisions.length,
    queue: trainingQueue(nation).map((item) => [item.typeId, item.progress.toFixed(4)].join(':')),
    commander: generalOfArmy(nation, armies[0])?.name,
    auto: { ...nation.command },
  };

  const data = JSON.parse(JSON.stringify(serialize(game)));
  const loaded = headless(SEED);
  const ok = deserialize(loaded, data);
  const reloadedNation = loaded.world.nations[nation.id];
  const reloadedGeneral = officersOf(reloadedNation, BRANCH.ARMY)
    .find((candidate) => candidate.name === general.name);
  const reloadedArmy = loaded.world.units.find((unit) => unit.id === armies[0].id);
  const after = {
    officers: officersOf(reloadedNation, BRANCH.ARMY).length,
    commanded: reloadedGeneral?.divisions.length ?? 0,
    queue: trainingQueue(reloadedNation).map((item) => [item.typeId, item.progress.toFixed(4)].join(':')),
    commander: reloadedArmy ? generalOfArmy(reloadedNation, reloadedArmy)?.name : null,
    auto: { ...reloadedNation.command },
  };
  console.log(`  once : ${JSON.stringify(before)}`);
  console.log(`  sonra: ${JSON.stringify(after)}`);
  check('kayit yuklendi', ok);
  check('subay kadrosu korundu', before.officers === after.officers);
  check('komuta bagi korundu', before.commander === after.commander, `${after.commander}`);
  check('emrindeki tumen sayisi korundu', before.commanded === after.commanded);
  check('kuyruk ve ilerleme korundu', before.queue.join('|') === after.queue.join('|'),
    after.queue.join('|'));
  check('otomatik anahtarlar korundu',
    JSON.stringify(before.auto) === JSON.stringify(after.auto));

  // Amiral kolu da yuklemeden sag cikmali.
  const admiral = createGeneral(loaded.world, reloadedNation, loaded.turns.rng, { branch: BRANCH.NAVY });
  const second = JSON.parse(JSON.stringify(serialize(loaded)));
  const third = headless(SEED);
  deserialize(third, second);
  const admirals = officersOf(third.world.nations[nation.id], BRANCH.NAVY);
  check('amiral kolu korundu', admirals.some((row) => row.name === admiral.name),
    `${admirals.length} amiral`);
}

// ------------------------------------------------------------------ TEST E ---
section('TEST E — buyuk ulke, cok subay, uzun kuyruk: ekran verisi hizli turetilmeli');
{
  const game = headless(SEED);
  run(game, 220);
  const nation = stock(biggest(game), { gold: 20000, arms: 40, artillery: 20 });
  game.turns.playerNation = nation.id;
  while (officersOf(nation, BRANCH.ARMY).length < 8) {
    createGeneral(game.world, nation, game.turns.rng, { branch: BRANCH.ARMY });
  }
  let queued = 0;
  for (let i = 0; i < 24; i++) if (queueRecruit(game, nation, 'INFANTRY')) queued++;

  const t0 = performance.now();
  const rounds = 20;
  for (let i = 0; i < rounds; i++) {
    militarySummary(game.world, nation);
    commandRoster(game.world, nation);
    recruitOptions(game, nation);
    trainingRows(game, nation);
    militaryStats(game.world, nation);
    armyComposition(game.world, nation.id);
    unassignedDivisions(game.world, nation);
  }
  const perRender = (performance.now() - t0) / rounds;
  console.log(`  ulke: ${nation.name} · ${nation.tiles} kare · `
    + `${game.world.units.filter((u) => u.nationId === nation.id).length} tumen · `
    + `${officersOf(nation, BRANCH.ARMY).length} general · ${queued} siparis`);
  console.log(`  ekran verisi: ${n2(perRender)} ms/cizim`);
  check('cizim verisi kare butcesine sigiyor', perRender < 16, `${n2(perRender)} ms`);
}

// ------------------------------------------------------------------ TEST F ---
section('TEST F — askeri butce dusuk: egitim ve takviye gercekten yavaslamali');
{
  const measure = (wages) => {
    const game = headless(SEED);
    run(game, WARMUP);
    const nation = stock(biggest(game));
    game.turns.playerNation = nation.id;
    nation.economy.militaryWages = wages;
    nation.economy.militaryProcurement = wages;
    nation.economy.military.supplyIndex = wages / 100;
    queueRecruit(game, nation, 'INFANTRY');
    let weeks = 0;
    while (trainingQueue(nation).length && weeks < 80) {
      runTraining(game);
      weeks++;
    }
    const stats = militaryStats(game.world, nation);
    const read = (id) => stats.find((row) => row.id === id).value;
    return {
      wages,
      weeks,
      speed: trainingSpeed(nation),
      recruitTime: read('recruit-time'),
      reinforcement: read('reinforcement'),
      organization: read('organization'),
    };
  };
  const rows = [measure(100), measure(50), measure(0)];
  console.log(table(rows, [
    { label: 'butce', get: (r) => `${r.wages}%`, right: false },
    { label: 'egitimHizi', get: (r) => n2(r.speed) },
    { label: 'egitimSuresi', get: (r) => `${r.weeks}h` },
    { label: 'recruitTime', get: (r) => r.recruitTime, right: false },
    { label: 'takviye', get: (r) => r.reinforcement, right: false },
    { label: 'organizasyon', get: (r) => r.organization, right: false },
  ]));
  check('dusuk butce egitimi uzatti', rows[2].weeks > rows[0].weeks,
    `${rows[0].weeks}h -> ${rows[2].weeks}h`);
  check('recruit time gostergesi degisti', rows[0].recruitTime !== rows[2].recruitTime,
    `${rows[0].recruitTime} -> ${rows[2].recruitTime}`);
  check('takviye hizi dustu', rows[0].reinforcement !== rows[2].reinforcement,
    `${rows[0].reinforcement} -> ${rows[2].reinforcement}`);
}

sub('OZET');
console.log(`  ${failures ? `${failures} kontrol KALDI` : 'butun kontroller gecti'}`);
process.exit(failures ? 1 : 0);
