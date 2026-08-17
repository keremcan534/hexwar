// Reform kapisinin tanilamasi: yasa ZOR, SIYASI ve KADEMELI olmali.
//
// Spec'teki A-E senaryolari kontrollu kosulur. Yontem: ayni tohumda ulusun
// siyasi iklimi tek tek oynatilir (meclis bilesimi, huzursuzluk, sayac) ve
// kapinin dogru sebeple acilip kapandigi olculur.
//
// Bu dosya URETIM KODU DEGILDIR.

import { headless, run } from './audit/harness.mjs';
import {
  REFORMS, SEVERITY_RULES, enactReform, ensureReforms, reformBoard, reformSeverity,
  reformStatus,
} from '../src/game/reforms.js';

const SEED = 'REFORM-GATE';

function subjectOf(game, ideology = null) {
  const alive = game.world.nations.filter((n) => n.alive);
  // Partiler ulus basina yalnizca dort tanedir; istenen ideolojinin partisi
  // her ulusta bulunmaz. Meclisi o ideolojiye kilitleyecek testler, partisi
  // GERCEKTEN olan bir ulus secmek zorunda.
  const pool = ideology
    ? alive.filter((n) => n.politics?.parties?.some((p) => p.ideology === ideology))
    : alive;
  return (pool.length ? pool : alive).sort((a, b) => b.tiles - a.tiles)[0];
}

/** Meclisi tek bir ideolojiye kilitler: "Ruling Party Only" yasasi + iktidar. */
function setLegislature(nation, ideology) {
  ensureReforms(nation);
  nation.politics.reforms.upper_house = 'party_appointed';
  const party = nation.politics.parties.find((p) => p.ideology === ideology);
  if (party) nation.politics.rulingPartyId = party.id;
  return Boolean(party);
}

/** Sinif memnuniyetini zorlayarak ulusal huzursuzlugu ayarlar. */
function setUnrest(nation, satisfaction) {
  for (const c of Object.values(nation.economy?.classes ?? {})) c.satisfaction = satisfaction;
}

function freshGame(weeks = 10, ideology = null) {
  const game = headless(SEED);
  const subject = subjectOf(game, ideology);
  game.turns.playerNation = subject.id;   // YZ ajandasi ozneye dokunmasin
  run(game, weeks);
  ensureReforms(subject);
  return { game, subject };
}

const out = {};

// --- TEST A: durgun muhafazakar ulke -> buyuk reform cok zor ---------------
{
  const { subject } = freshGame(10, 'reactionary');
  const ok = setLegislature(subject, 'reactionary');
  setUnrest(subject, 0.90);                       // huzur var, baski yok
  subject.politics.reformCooldown = 0;
  const board = reformBoard(subject);
  const constitutional = board.filter((r) => r.severity === 'constitutional' && r.next);
  out.A_stableConservative = {
    openConstitutional: constitutional.filter((r) => r.canEnact).length,
    sampleSupport: constitutional[0]
      ? `${(constitutional[0].support * 100).toFixed(0)}% / ${(constitutional[0].threshold * 100).toFixed(0)}%`
      : 'n/a',
    // BEKLENEN: gerici meclis + huzurlu toplum = anayasal reform kapali.
    legislatureLocked: ok,
    pass: ok && constitutional.length > 0 && constitutional.every((r) => !r.canEnact),
  };
}

// --- TEST B: liberal meclis -> gecer, ama merdiven bir tirmanista bitmez ---
{
  const { game, subject } = freshGame();
  setLegislature(subject, 'liberal');
  subject.politics.reformCooldown = 0;
  let passed = 0;
  for (const group of REFORMS) if (enactReform(game, subject, group.id)) passed++;
  const after = reformBoard(subject);
  out.B_liberalLegislature = {
    passedInOneSitting: passed,
    blockedByCooldown: after.filter((r) => r.blocked === 'cooldown').length,
    cooldownWeeks: subject.politics.reformCooldown,
    // BEKLENEN: en fazla BIR yasa; geri kalani bekleme sayacina takilir.
    pass: passed === 1 && subject.politics.reformCooldown > 0,
  };
}

// --- TEST C: istikrarsiz ulke -> muhafazakarlar uzlasir -------------------
{
  const { subject } = freshGame(10, 'conservative');
  setLegislature(subject, 'conservative');
  subject.politics.reformCooldown = 0;
  setUnrest(subject, 0.92);
  const calm = reformBoard(subject).filter((r) => r.next);
  const calmOpen = calm.filter((r) => r.canEnact).length;
  const calmSample = calm.find((r) => r.group.category === 'social');
  setUnrest(subject, 0.10);                       // sokak isindi
  const hot = reformBoard(subject).filter((r) => r.next);
  const hotOpen = hot.filter((r) => r.canEnact).length;
  const hotSample = hot.find((r) => r.group.id === calmSample?.group.id);
  out.C_pressureMovesConservatives = {
    openWhenCalm: calmOpen,
    openWhenUnrest: hotOpen,
    sample: calmSample
      ? `${calmSample.group.name}: ${(calmSample.support * 100).toFixed(0)}% -> ${(hotSample.support * 100).toFixed(0)}%`
      : 'n/a',
    unlockedByPressure: hot.filter((r) => r.canEnact).length
      - calm.filter((r) => r.canEnact).length,
    // BEKLENEN: baski statukocu meclisin destegini YUKSELTIR. Kapinin acilmasi
    // esige ne kadar yakin olunduguna bagli; olculen sey mekanizmadir.
    pass: hotSample.support > calmSample.support * 1.5 && hotOpen >= calmOpen,
  };
}

// --- TEST D: reform spam denemesi ----------------------------------------
{
  const { game, subject } = freshGame();
  setLegislature(subject, 'socialist');
  subject.politics.reformCooldown = 0;
  let passed = 0;
  for (let i = 0; i < 5; i++) {
    for (const group of REFORMS) if (enactReform(game, subject, group.id)) passed++;
  }
  out.D_reformSpam = {
    passedInFiveSweeps: passed,
    fatigue: +(subject.politics.reformFatigue ?? 0).toFixed(1),
    // BEKLENEN: tek yasa. Bes tur denemek fark yaratmamali.
    pass: passed === 1,
  };
}

// --- TEST E: sayac dolunca kapi yeniden acilir ----------------------------
{
  const { game, subject } = freshGame();
  setLegislature(subject, 'socialist');
  subject.politics.reformCooldown = 0;
  const first = REFORMS.find((g) => enactReform(game, subject, g.id));
  const lockedNow = reformBoard(subject).filter((r) => r.blocked === 'cooldown').length;
  const wait = subject.politics.reformCooldown;
  run(game, wait + 2);                            // sayac issin
  const openAgain = reformBoard(subject).filter((r) => r.canEnact).length;
  out.E_cooldownExpires = {
    firstLaw: first?.name ?? null,
    lockedWhileCooling: lockedNow,
    cooldownWeeks: wait,
    openAfterWait: openAgain,
    // BEKLENEN: beklerken kilitli, sure dolunca yeniden mumkun.
    pass: lockedNow > 0 && openAgain > 0,
  };
}

// --- Siddet kademeleri dogru mu ------------------------------------------
{
  const rows = REFORMS.map((g) => [g.id, reformSeverity(g)]);
  const constitutional = rows.filter(([, s]) => s === 'constitutional').map(([id]) => id);
  out.severity = {
    constitutional,
    thresholds: Object.fromEntries(
      Object.entries(SEVERITY_RULES).map(([k, v]) => [k, `${v.threshold * 100}% / ${v.cooldown}w`]),
    ),
    pass: constitutional.includes('vote_franchise') && constitutional.includes('upper_house'),
  };
}

out.passed = Object.values(out).every((r) => r.pass !== false);
console.log(JSON.stringify(out, null, 2));
if (!out.passed) process.exitCode = 1;
