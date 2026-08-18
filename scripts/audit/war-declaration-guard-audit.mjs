// Savas ilani NIHAI KAPISI denetimi.
//
// Bulundugu yer onemli: cullanma tavani once yalniz `ai.js`'in hedef secme
// dongusundeydi ve `checkCoalitions` o kapidan GECMIYORDU. Open Beta 3 kor
// kampanyasinda olculdu (tohum OB3-1836, tur 755): oyuncu uc cephedeyken
// koalisyon dordunculeri ekledi — ve o dorduncu cepheyi OYUNCUNUN KENDISI
// ilan etti, cunku checkCoalitions oyuncuyu da koalisyon uyesi sayiyordu.
//
// Iki ders: (1) oyuncu adina asla otomatik savas ilan edilmez, (2) bir kural
// kurali cignebilecek her yolun ORTAK gectigi yerde durmalidir. Ikisi de
// `diplomacy.declareWar` icine tasindi; bu denetim oradaki kapiyi sabitler.

import {
  headless, section, sub, finding, reportFindings,
} from './harness.mjs';
import {
  MAX_ATTACKERS_ON_TARGET, MAX_PLAYER_INVOLUNTARY_FRONTS,
  atWar, attackerCount, declareWar, makePeace,
} from '../../src/game/diplomacy.js';
import { INFAMY_COALITION, checkCoalitions } from '../../src/game/infamy.js';

section('SAVAS ILANI NIHAI KAPISI');

/** Ortak kurulum: oyuncu ulusu ve temas halindeki komsulari. */
function setup(seed, weeks = 60) {
  const game = headless(seed);
  const world = game.world;
  for (let i = 0; i < weeks; i++) game.turns.endTurn();
  // Temas sayisi en yuksek olan ulus oyuncu olsun: komsusu bol olsun ki
  // koalisyon ve ikinci cephe testleri anlamli olsun.
  const player = world.nations
    .filter((n) => n.alive && n.tiles > 6)
    .sort((a, b) => (world.contacts?.[b.id]?.reduce((s, c) => s + (c > 0 ? 1 : 0), 0) ?? 0)
      - (world.contacts?.[a.id]?.reduce((s, c) => s + (c > 0 ? 1 : 0), 0) ?? 0))[0];
  game.turns.playerNation = player.id;
  const neighbours = world.nations.filter(
    (n) => n.alive && n.id !== player.id && world.contacts?.[player.id]?.[n.id] > 0,
  );
  return { game, world, player, neighbours };
}

/** Butun savaslari keser; ateskes de temizlenir ki kurulum tekrar kurulabilsin. */
function clearWars(game, world) {
  for (let a = 0; a < world.nations.length; a++) {
    for (let b = a + 1; b < world.nations.length; b++) {
      if (atWar(world, a, b)) makePeace(game, a, b, { settle: false });
      const rec = world.relations[a][b];
      if (rec) { rec.truceUntil = 0; rec.wars = 0; }
    }
  }
}

// --- TEST 1: koalisyon oyuncuyu UYE yapamaz ---
sub('TEST 1 — checkCoalitions oyuncu adina savas ilan ediyor mu?');
{
  const { game, world, player, neighbours } = setup('GUARD-1');
  clearWars(game, world);
  // Oyuncunun BASKA bir komsusu asiri genislemis olsun: oyuncu, koalisyona
  // katilmaya "uygun" hale gelsin. Kotu adam, OYUNCU DISINDA da yeterince
  // komsusu olan biri secilir — yoksa koalisyon kurulacak uye bulamaz ve test
  // kendi kurulumu yuzunden "kapi cok dar" der.
  const eligibleAllies = (n) => world.nations.filter(
    (o) => o.alive && o.id !== n.id && o.id !== player.id
      && world.contacts?.[o.id]?.[n.id] > 0,
  ).length;
  const villain = [...neighbours].sort((x, y) => eligibleAllies(y) - eligibleAllies(x))[0];
  console.log(`  kotu adam ${villain.name}: oyuncu disinda ${eligibleAllies(villain)} komsusu var`);
  villain.infamy = INFAMY_COALITION * 3;
  const before = attackerCount(world, villain.id);
  // Zar hep gecsin: sorulan sey "olur mu", "ne siklikta" degil.
  for (let i = 0; i < 30; i++) checkCoalitions(game, () => 0);
  const playerJoined = atWar(world, player.id, villain.id);
  const after = attackerCount(world, villain.id);
  console.log(`  ${villain.name} sohreti ${villain.infamy} (esik ${INFAMY_COALITION})`);
  console.log(`  ona saldiran ulke sayisi: ${before} -> ${after}`);
  console.log(`  oyuncu (${player.name}) savasa sokuldu mu: ${playerJoined ? 'EVET' : 'hayir'}`);
  if (playerJoined) {
    finding('CRITICAL', 'oyuncu rizasi',
      'koalisyon oyuncu adina savas ilan edememeli',
      `${player.name} kendi ilan etmedigi bir savasa sokuldu`,
      'OB3 tur 755: dorduncu cepheyi oyuncunun kendisi "ilan etti"');
  } else if (after <= before) {
    finding('MEDIUM', 'koalisyon islevi',
      'koalisyon YZ uyeleriyle yine de kurulabilmeli',
      'hic koalisyon ilani olmadi — kapi fazla genis kapaniyor olabilir');
  } else {
    console.log(`  -> Oyuncu uye yapilmadi, YZ koalisyonu ${after - before} ilanla kuruldu. DOGRU.`);
  }
}

// --- TEST 2: koalisyon oyuncuya KARSI kurulabilir ---
sub('TEST 2 — koalisyon oyuncuyu HEDEF alabiliyor mu?');
{
  const { game, world, player } = setup('GUARD-2');
  clearWars(game, world);
  player.infamy = INFAMY_COALITION * 3;
  for (let i = 0; i < 30; i++) checkCoalitions(game, () => 0);
  const fronts = attackerCount(world, player.id);
  console.log(`  oyuncu (${player.name}) sohreti ${player.infamy}`);
  console.log(`  oyuncuya saldiran ulke: ${fronts}`);
  if (fronts === 0) {
    finding('CRITICAL', 'koalisyon hedefi',
      'asiri genisleyen oyuncu koalisyonla karsilasmali',
      'hic saldiran olmadi',
      'yoksa sohret/koalisyon freni oyuncuya hic islemez');
  } else {
    console.log('  -> Oyuncu koalisyon hedefi olabiliyor. DOGRU.');
  }
}

// --- TEST 3: koalisyon cullanma tavanini asamaz ---
sub('TEST 3 — koalisyon ilanlari cullanma tavanini asiyor mu?');
{
  const { game, world, player } = setup('GUARD-3');
  clearWars(game, world);
  player.infamy = INFAMY_COALITION * 4;
  for (let i = 0; i < 60; i++) checkCoalitions(game, () => 0);
  const fronts = attackerCount(world, player.id);
  console.log(`  oyuncuya binen saldirgan: ${fronts}`
    + ` (istemsiz tavan ${MAX_PLAYER_INVOLUNTARY_FRONTS},`
    + ` dunya tavani ${MAX_ATTACKERS_ON_TARGET})`);
  if (fronts > MAX_PLAYER_INVOLUNTARY_FRONTS) {
    finding('CRITICAL', 'oyuncu cephe tavani',
      `oyuncuya istemsiz en fazla ${MAX_PLAYER_INVOLUNTARY_FRONTS} cephe acilabilmeli`,
      `${fronts} cephe acildi`);
  } else {
    console.log('  -> Oyuncunun istemsiz cephe tavani tutuyor. DOGRU.');
  }

  // YZ ulusu icin de dunya tavani gecerli mi?
  const victim = world.nations.find((n) => n.alive && n.id !== player.id && n.tiles > 6);
  victim.infamy = INFAMY_COALITION * 4;
  for (let i = 0; i < 60; i++) checkCoalitions(game, () => 0);
  const victimFronts = attackerCount(world, victim.id);
  console.log(`  YZ kurbani ${victim.name}: ${victimFronts} saldirgan`);
  if (victimFronts > MAX_ATTACKERS_ON_TARGET) {
    finding('CRITICAL', 'dunya cullanma tavani',
      `bir ulusa en fazla ${MAX_ATTACKERS_ON_TARGET} saldirgan binmeli`,
      `${victimFronts} saldirgan`);
  } else {
    console.log('  -> Dunya cullanma tavani tutuyor. DOGRU.');
  }
}

// --- TEST 4: savasta olan oyuncuya IKINCI cephe acilabilir ---
sub('TEST 4 — zaten savasta olan oyuncuya ikinci cephe acilabiliyor mu?');
{
  const { game, world, player, neighbours } = setup('GUARD-4');
  clearWars(game, world);
  const first = neighbours[0];
  const second = neighbours[1];
  const opened = declareWar(game, first.id, player.id);
  console.log(`  birinci cephe (${first.name}): ${opened ? 'acildi' : 'ACILAMADI'}`);
  const secondOpened = declareWar(game, second.id, player.id);
  console.log(`  ikinci cephe (${second.name}): ${secondOpened ? 'acildi' : 'ACILAMADI'}`);
  if (!opened || !secondOpened) {
    finding('CRITICAL', 'ikinci cephe',
      'savasta olmak dokunulmazlik saglamamali',
      `birinci ${opened}, ikinci ${secondOpened}`,
      'OB3 kok nedeni: surekli savasan oyuncu surekli dokunulmazdi');
  } else {
    console.log('  -> Savasta olmak kalkan degil. DOGRU.');
  }

  // --- TEST 5: ucuncu ISTEMSIZ cephe engellenmeli ---
  const third = neighbours[2];
  const thirdOpened = third ? declareWar(game, third.id, player.id) : false;
  console.log(`  ucuncu ISTEMSIZ cephe (${third?.name ?? '-'}): `
    + `${thirdOpened ? 'ACILDI' : 'engellendi'}`);
  if (thirdOpened) {
    finding('CRITICAL', 'istemsiz ucuncu cephe',
      `oyuncuya istemsiz ${MAX_PLAYER_INVOLUNTARY_FRONTS}den fazla cephe acilamamali`,
      'ucuncu cephe acildi');
  } else {
    console.log('  -> Ucuncu istemsiz cephe engellendi. DOGRU.');
  }

  // Oyuncunun KENDI ilani tavana takilmaz: kendi mezarini kazabilir.
  const fourth = neighbours[3];
  const manual = fourth ? declareWar(game, player.id, fourth.id, { manual: true }) : false;
  console.log(`  oyuncunun KENDI ilani (${fourth?.name ?? '-'}): `
    + `${manual ? 'acildi' : 'ACILAMADI'}`);
  if (fourth && !manual) {
    finding('HIGH', 'oyuncu iradesi',
      'oyuncu kendi karariyla savas acabilmeli (tavan istemsiz cephe icindir)',
      'elle ilan reddedildi');
  } else if (fourth) {
    console.log('  -> Oyuncunun kendi karari tavana takilmiyor. DOGRU.');
  }
}

process.exit(reportFindings() > 0 ? 1 : 0);
