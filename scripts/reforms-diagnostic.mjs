// Reform defterinin tanilamasi.
//
// Iddia: yasa merdiveni gercek bir mekanik, ekrandaki suslemenin adi degil.
// Kanit sirasi:
//   1. Her ulke yasa durumuyla baslar, tohumu sabit ve ensure yeniden
//      cagrilinca deger degismez.
//   2. Kayit/yukleme yasayi tasir; yasasi olmayan eski kayit gocer.
//   3. Ust meclis yasasi meclisin bilesimini gercekten degistirir.
//   4. Oy hakki yasasi secmen kutugunu gercekten degistirir.
//   5. Reform kapisi calisir: cogunluk yoksa cikmaz, meclis degisince acilir.
//   6. Kademe atlanamaz, geri alinamaz.
//   7. Hukumet bicimi yasalardan okunur.
//
// Bu dosya URETIM KODU DEGILDIR ve src/ altina hicbir sey sizdirmaz.

import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import { ensurePolitics, rulingParty } from '../src/game/politics.js';
import {
  REFORMS, canEnactCategory, electorate, enactReform, ensureReforms, governmentType,
  houseSupport, importantIssues, peopleMix, reformBoard, reformMovements, reformStatus,
  reformValue, upperHouse, voterMix,
} from '../src/game/reforms.js';
import { deserialize, serialize } from '../src/game/save.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed, { cols: 78, rows: 62 });
  generateNations(game.world, { seed: `${seed}-nations` });
  Object.assign(game, {
    selected: null, selectedUnit: null, reachable: null, autosaveEnabled: false,
    listeners: {}, peaceOffers: [], nextPeaceOfferId: 1,
    notifications: { push() {} },
    renderer: { invalidateCache() {}, invalidateTiles() {}, resize() {} },
    camera: { setBounds() {}, fit() {}, centerOn() {} },
    clock: { speed: 0, accumulator: 0, lastTime: 0, day: 0 },
    emit() {}, requestRender() {}, autosave() {}, setSpeed() {},
  });
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  game.turns.playerNation = -1;
  return game;
}

const shareOf = (mix, id) => mix.find((slice) => slice.id === id)?.share ?? 0;
const sum = (mix) => mix.reduce((total, slice) => total + slice.share, 0);

const game = headless('REFORMS');
const mirror = headless('REFORMS');
const world = game.world;
const nation = world.nations.find((candidate) => candidate.alive && candidate.tiles > 4)
  ?? world.nations[0];
const twin = mirror.world.nations[nation.id];

// --- 1. Baslangic durumu -------------------------------------------------
const initial = { ...ensureReforms(nation) };
const everyLadderSet = REFORMS.every((group) => group.steps.some(
  (step) => step.id === initial[group.id],
));
// Ikinci cagri hicbir seyi oynatmamali: ensure idempotent olmazsa yasa
// haftada bir kendiliginden degisirdi.
ensureReforms(nation);
const idempotent = REFORMS.every((group) => nation.politics.reforms[group.id] === initial[group.id]);
const deterministic = REFORMS.every(
  (group) => ensureReforms(twin)[group.id] === initial[group.id],
);
// 1836 baslangici: sosyal yasa neredeyse yok.
const socialStartsLow = REFORMS.filter((group) => group.category === 'social')
  .every((group) => group.steps.findIndex((step) => step.id === initial[group.id]) <= 1);

// --- 2. Kayit / yukleme --------------------------------------------------
nation.politics.reforms.slavery = 'no_slavery';
const saved = serialize(game);
const loaded = deserialize(game, saved);
const afterLoad = world.nations[nation.id];
const savePreserved = reformValue(afterLoad, 'slavery') === 'no_slavery';
const legacy = JSON.parse(JSON.stringify(saved));
for (const savedNation of legacy.nations) delete savedNation.politics;
const legacyLoaded = deserialize(game, legacy);
ensurePolitics(world);
const legacyMigrated = world.nations
  .filter((candidate) => candidate.alive)
  .every((candidate) => Object.keys(ensureReforms(candidate)).length === REFORMS.length);

// --- 3. Ust meclis yasasi meclisi degistirir ------------------------------
const subject = world.nations[nation.id];
ensureReforms(subject);
const ruling = rulingParty(subject).ideology;
subject.politics.reforms.upper_house = 'party_appointed';
const houseRulingOnly = upperHouse(subject);
subject.politics.reforms.upper_house = 'population_equal_weight';
const housePopular = upperHouse(subject);
const houseFollowsLaw = shareOf(houseRulingOnly, ruling) === 1
  && housePopular.length > 1
  && Math.abs(sum(housePopular) - 1) < 1e-6;

// --- 4. Oy hakki yasasi kutugu degistirir ---------------------------------
subject.politics.reforms.vote_franchise = 'none_voting';
const noVoters = voterMix(subject);
const noRegister = electorate(subject);
subject.politics.reforms.vote_franchise = 'landed_voting';
const landedVoters = voterMix(subject);
const landedRegister = electorate(subject);
subject.politics.reforms.vote_franchise = 'universal_voting';
const allVoters = voterMix(subject);
const allRegister = electorate(subject);
const people = peopleMix(subject);
const franchiseFollowsLaw = noVoters.length === 0 && noRegister.voters === 0
  && landedRegister.voters > 0 && landedRegister.share < 0.35
  && Math.abs(allRegister.share - 1) < 1e-6
  // Kutuk sadece toprak sahibiyken gerici/muhafazakar pay halktakinden buyuk
  // olmali; genel oyda iki dagilim ayni olmali.
  && shareOf(landedVoters, 'reactionary') > shareOf(people, 'reactionary')
  && Math.abs(shareOf(allVoters, 'socialist') - shareOf(people, 'socialist')) < 1e-6;

// --- 5. Reform kapisi ----------------------------------------------------
// Sadece iktidar partisi mecliste: gerici bir iktidarda sosyal reform gecmez.
subject.politics.reforms.upper_house = 'party_appointed';
const reactionary = subject.politics.parties.find((party) => party.ideology === 'reactionary')
  ?? subject.politics.parties[0];
const previousRuler = subject.politics.rulingPartyId;
subject.politics.rulingPartyId = reactionary.id;
subject.politics.reforms.minimum_wage = 'no_minimum_wage';
const blockedStatus = reformStatus(subject, 'minimum_wage');
const blockedEnact = enactReform(game, subject, 'minimum_wage');
const blockedHeld = reformValue(subject, 'minimum_wage') === 'no_minimum_wage';

// Sosyalist bir iktidarda ayni meclis ayni yasayi gecirir.
const socialist = subject.politics.parties.find((party) => party.ideology === 'socialist');
let openedStatus = null;
let openedEnact = false;
if (socialist) {
  subject.politics.rulingPartyId = socialist.id;
  openedStatus = reformStatus(subject, 'minimum_wage');
  openedEnact = enactReform(game, subject, 'minimum_wage');
}
const gateWorks = blockedStatus.support <= 0.5 && blockedEnact === false && blockedHeld
  && Boolean(socialist) && openedStatus.support > 0.5 && openedEnact
  && reformValue(subject, 'minimum_wage') === 'trinket_minimum_wage';

// --- 6. Merdiven kurallari ----------------------------------------------
// Kademe atlanamaz VE arka arkaya cikarilmaz. Ilk yasa kurumsal bekleme
// sayacini kurar; ikinci deneme reddedilir ve kademe yerinde kalir.
// (Eskiden sayac yoktu ve bu test ard arda iki basamak bekliyordu; kapi
// bilerek sertlestirildi — bkz. reform-gate-diagnostic.mjs.)
const beforeStep = reformValue(subject, 'minimum_wage');
const secondTry = enactReform(game, subject, 'minimum_wage');
const oneStepOnly = secondTry === false
  && reformValue(subject, 'minimum_wage') === beforeStep
  && (subject.politics.reformCooldown ?? 0) > 0;
// Merdivenin sonunda kapi kapanir; geri donus yolu yok.
subject.politics.reforms.public_meetings = 'yes_meeting';
const finished = reformStatus(subject, 'public_meetings');
const terminates = finished.complete && finished.next === null
  && enactReform(game, subject, 'public_meetings') === false;

// --- 7. Hukumet bicimi ---------------------------------------------------
subject.politics.reforms.vote_franchise = 'none_voting';
subject.politics.reforms.political_parties = 'underground_parties';
const autocracy = governmentType(subject);
subject.politics.reforms.vote_franchise = 'universal_voting';
subject.politics.reforms.political_parties = 'secret_ballots';
const democracy = governmentType(subject);
const governmentReadsLaw = autocracy !== democracy && democracy === 'Democracy';

// --- 8. Ekranin okudugu turetmeler bosa dusmuyor -------------------------
const board = reformBoard(subject);
const issues = importantIssues(subject);
const movements = reformMovements(subject);
const derivationsValid = board.length === REFORMS.length
  && board.every((row) => row.support >= 0 && row.support <= 1)
  && issues.length > 0 && issues.every((issue) => issue.voters >= 0 && issue.people >= 0)
  && movements.militancy >= 0 && movements.militancy <= 10
  && movements.movements.every((movement) => movement.support >= 0 && movement.support <= 1);

// --- 9. Butun ulkeler icin gecerli mi ------------------------------------
// Tek ulkede calisan bir kapi, dunya genelinde patlamamali.
let scanned = 0;
let sane = 0;
for (const candidate of world.nations) {
  if (!candidate.alive) continue;
  scanned += 1;
  const rows = reformBoard(candidate);
  const house = upperHouse(candidate);
  const ok = rows.length === REFORMS.length
    && Math.abs(sum(house) - 1) < 1e-6
    && rows.every((row) => !row.next || Math.abs(
      row.rawSupport - houseSupport(candidate, row.group.id, row.next.index),
    ) < 1e-9)
    && typeof governmentType(candidate) === 'string';
  if (ok) sane += 1;
}

// Kapilarin bir kismi acik olmali: hicbiri acik degilse ekran olu bir tahtadir.
let anyOpen = 0;
for (const candidate of world.nations) {
  if (!candidate.alive) continue;
  if (canEnactCategory(candidate, 'social') || canEnactCategory(candidate, 'political')) anyOpen += 1;
}

subject.politics.rulingPartyId = previousRuler;

const results = {
  start: { everyLadderSet, idempotent, deterministic, socialStartsLow },
  persistence: { loaded, savePreserved, legacyLoaded, legacyMigrated },
  laws: { houseFollowsLaw, franchiseFollowsLaw, governmentReadsLaw },
  gate: { gateWorks, oneStepOnly, terminates },
  derivations: { derivationsValid, allNationsSane: scanned > 0 && sane === scanned },
  reach: {
    // Dunya kurulurken hic kapi acik degilse yasa merdiveni oynanamaz olurdu.
    someNationCanReform: anyOpen > 0,
  },
};
results.passed = Object.values(results)
  .every((section) => Object.values(section).every(Boolean));

console.log(JSON.stringify({
  ...results,
  detail: {
    nation: nation.name,
    ladders: REFORMS.length,
    nationsScanned: scanned,
    nationsWithOpenGate: anyOpen,
    autocracy,
    democracy,
    upperHouseTop: housePopular.slice(0, 3).map((slice) => `${slice.name} ${(slice.share * 100).toFixed(1)}%`),
    landedElectorateShare: `${(landedRegister.share * 100).toFixed(1)}%`,
    topIssues: issues.slice(0, 4).map((issue) => `${issue.name} ${(issue.people * 100).toFixed(1)}%`),
    topMovements: movements.movements.slice(0, 3).map((movement) => `${movement.step} ${(movement.support * 100).toFixed(1)}%`),
  },
}, null, 2));
if (!results.passed) process.exitCode = 1;
