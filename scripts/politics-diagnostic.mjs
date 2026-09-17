// Siyaset tanilamasi: hukumet ve bes yasa (bkz. src/game/politics.js).
//
// Her satir bir sozlesme maddesidir; biri dusunce cikis kodu 1 olur.
//   npm run diagnose:politics

import { headless, run } from './audit/harness.mjs';
import {
  GOVERNMENT_TERM, IDEOLOGY_IDS, LAWS, LAW_TERM, PARTIES, POLITICAL_POLICIES,
  canInvestInFactory, ensurePolitics, fiscalPolicyLimits, formGovernment, governmentBlocker,
  lawChangeBlocker, lawIndex, lawModifiers, legitimacyOf, nextLawStep, preferredGovernment,
  rulingParty, setLaw,
} from '../src/game/politics.js';
import {
  FACTORIES, buildFactory, canBuildFactory, runEconomy, setBudgetPolicy,
} from '../src/game/economy.js';
import { constructionAtlas, ensureConstruction } from '../src/game/construction.js';
import { deserialize, serialize } from '../src/game/save.js';

const game = headless('POLITICS');
const mirror = headless('POLITICS');
run(game, 2);
run(mirror, 2);
const world = game.world;
const nation = world.nations.find((n) => n.alive && n.economy);
game.turns.playerNation = nation.id;
const partyOf = (ideology) => nation.politics.parties.find((party) => party.ideology === ideology);

// --- PARTILER ---------------------------------------------------------------
const supportTotal = nation.politics.parties.reduce((sum, party) => sum + party.support, 0);
const sameEverywhere = world.nations.every((n) => n.politics.parties
  .map((party) => party.ideology).join() === IDEOLOGY_IDS.join());
const programmesValid = Object.values(PARTIES).every((party) => (
  Object.entries(party.policies).every(([axis, id]) => Boolean(POLITICAL_POLICIES[axis]?.[id]))
  && LAWS.every((law) => {
    const cap = party.laws[law.id];
    return cap && cap.prefer <= cap.max && cap.max < law.levels.length;
  })
));
const deterministic = JSON.stringify(world.nations.map((n) => n.politics.laws))
  === JSON.stringify(mirror.world.nations.map((n) => n.politics.laws));

// --- HUKUMET KAPISI ---------------------------------------------------------
nation.politics.governmentLockUntil = 0;
const liberal = partyOf('liberal');
const socialist = partyOf('socialist');
const nationalist = partyOf('nationalist');
const formedLiberal = formGovernment(game, nation, liberal.id);
const lockStarted = nation.politics.governmentLockUntil === world.turn + GOVERNMENT_TERM;
const lockedReason = governmentBlocker(world, nation, socialist.id);
const lockedRefused = !formGovernment(game, nation, socialist.id);
const alreadyReason = governmentBlocker(world, nation, liberal.id);

// --- LIBERAL PROGRAMI: laissez-faire, serbest ticaret, ordu tavani ----------
const region = constructionAtlas(world, nation.id).regions[0];
Object.assign(nation, { gold: 1000 });
nation.politics.privateCapital = 1000;
const buildable = Object.keys(FACTORIES).find(
  (typeId) => canBuildFactory(world, nation, region.id, typeId, 'private'),
);
const stateBlocked = !canBuildFactory(world, nation, region.id, buildable);
const privateAllowed = canBuildFactory(world, nation, region.id, buildable, 'private');
const treasuryBefore = nation.gold;
const capitalBefore = nation.politics.privateCapital;
const privateBuilt = buildFactory(game, nation, region.id, buildable, { actor: 'private' });
const privateProject = ensureConstruction(nation).projects.find(
  (project) => project.kind === 'factory' && project.typeId === buildable,
);
const treasuryAfterBuild = nation.gold;
runEconomy(game);
const capitalAfter = nation.politics.privateCapital;
setBudgetPolicy(nation, 'tariff', 50);
setBudgetPolicy(nation, 'armyFunding', 100);
const liberalLimits = fiscalPolicyLimits(nation);
// Istenen deger saklanir, yururlukteki bantta kirpilir: korumaci hukumet
// gelince 50 geri doner (asagida), o yuzden simdi okunur.
const liberalTariff = nation.economy.tariff;
const wantedTariff = nation.economy.tariffWanted;

// --- YASA KAPISI ------------------------------------------------------------
for (const law of LAWS) nation.politics.lawLocks[law.id] = 0;
const capReason = lawChangeBlocker(world, nation, 'labour', 'strong_labour_rights');
const basicLabour = setLaw(game, nation, 'labour', 'basic_labour_rights');
const lawLockReason = lawChangeBlocker(world, nation, 'labour', 'no_labour_rights');
const democracy = setLaw(game, nation, 'constitution', 'democracy');
const researchAfterDemocracy = lawModifiers(nation).researchRate;

// Tavan daraltan hukumet: demokrasi askiya alinir, secim kayitta durur.
formGovernment(game, nation, nationalist.id, { force: true });
const suspended = lawIndex(nation, 'constitution') === 0
  && nation.politics.laws.constitution === 'democracy';
const researchSuspended = lawModifiers(nation).researchRate;
const nationalistLimits = fiscalPolicyLimits(nation);
formGovernment(game, nation, socialist.id, { force: true });
const restored = lawIndex(nation, 'constitution') === 2;
const plannedStateAllowed = canInvestInFactory(nation, 'build', 'state');
const plannedPrivateBlocked = !canInvestInFactory(nation, 'build', 'private');

// --- MESRUIYET --------------------------------------------------------------
for (const party of nation.politics.parties) party.support = party.id === socialist.id ? 40 : 20;
const leaderFree = legitimacyOf(nation).hit === 0;
for (const party of nation.politics.parties) party.support = party.id === socialist.id ? 10 : 30;
const laggardHit = legitimacyOf(nation).hit;
run(game, 1);
const breakdownHasLegitimacy = Number.isFinite(nation.economy.stabilityBreakdown?.legitimacy);

// --- YZ GUNDEMI -------------------------------------------------------------
const ai = world.nations.find((n) => n.alive && n.economy && n.id !== nation.id);
const conservativeAi = ai.politics.parties.find((party) => party.ideology === 'conservative');
formGovernment(game, ai, conservativeAi.id, { force: true });
ai.politics.governmentLockUntil = 0;
ai.politics.governmentSince = world.turn;
for (const party of ai.politics.parties) party.support = party.id === conservativeAi.id ? 10 : 30;
const patientBeforeTerm = preferredGovernment(world, ai) === null;
ai.politics.governmentSince = world.turn - GOVERNMENT_TERM;
const switchesAfterTerm = preferredGovernment(world, ai) !== null;
ai.politics.lastLawChange = world.turn - LAW_TERM;
for (const law of LAWS) ai.politics.lawLocks[law.id] = 0;
ai.politics.laws.welfare = 'no_welfare';
ai.politics.laws.labour = 'basic_labour_rights';
const step = nextLawStep(world, ai);
// Muhafazakar isci hakkini "None" ister ama YZ yasa geri almaz; refahi kurar.
const onlyRaises = step?.lawId === 'welfare' && step.levelId === 'basic_welfare';

// --- KAYIT ------------------------------------------------------------------
const saved = serialize(game);
const before = JSON.stringify({
  ruling: nation.politics.rulingPartyId, laws: nation.politics.laws, lock: nation.politics.governmentLockUntil,
});
const loaded = deserialize(game, JSON.parse(JSON.stringify(saved)));
const reloaded = game.world.nations[nation.id];
const preserved = JSON.stringify({
  ruling: reloaded.politics.rulingPartyId, laws: reloaded.politics.laws, lock: reloaded.politics.governmentLockUntil,
}) === before;

const missing = JSON.parse(JSON.stringify(saved));
for (const savedNation of missing.nations) delete savedNation.politics;
const missingLoaded = deserialize(game, missing);
ensurePolitics(game.world);
const missingRebuilt = game.world.nations.every((n) => n.politics?.parties?.length === 4 && n.politics.laws);

const legacy = JSON.parse(JSON.stringify(saved));
legacy.version = 20;
for (const savedNation of legacy.nations) {
  savedNation.politics = {
    parties: [
      { id: 'old-a', name: 'Royalist Party', ideology: 'reactionary', policies: { citizenship: 'residency' }, popularity: 1, support: 60 },
      { id: 'old-b', name: 'Workers Party', ideology: 'communist', policies: { citizenship: 'full_citizenship' }, popularity: 1, support: 40 },
    ],
    rulingPartyId: 'old-b',
    nextElectionTurn: 49,
    electionInterval: 48,
    privateCapital: 321,
    reforms: {
      vote_franchise: 'universal_voting', press_rights: 'free_press', minimum_wage: 'good_minimum_wage',
      work_hours: 'eight_hour_day', conscription: 'conscription_by_requirement',
    },
    reformCooldown: 10,
  };
}
const legacyLoaded = deserialize(game, legacy);
const migrated = game.world.nations[nation.id].politics;
const legacyMigrated = rulingParty(game.world.nations[nation.id])?.ideology === 'socialist'
  && migrated.laws.constitution === 'democracy'
  && migrated.laws.labour === 'strong_labour_rights'
  && migrated.laws.citizenship === 'full_citizenship'
  && migrated.laws.conscription === 'mass_conscription'
  && migrated.privateCapital === 321
  && !('reforms' in migrated) && !('nextElectionTurn' in migrated);

const results = {
  parties: {
    fourFixedParties: nation.politics.parties.length === 4 && sameEverywhere,
    programmesValid,
    deterministic,
    supportTotalsOneHundred: Math.abs(supportTotal - 100) < 0.01,
  },
  government: {
    formedWhenUnlocked: formedLiberal,
    fourYearLock: lockStarted,
    lockedRefusedWithReason: lockedRefused && /term runs/.test(lockedReason ?? ''),
    alreadyInGovernment: alreadyReason === 'Already in government',
  },
  liberalProgramme: {
    stateBlocked,
    privateAllowed,
    privateBuilt,
    projectQueued: Boolean(privateProject),
    stateTreasuryUntouched: treasuryAfterBuild === treasuryBefore,
    privateCapitalPaid: capitalAfter < capitalBefore && privateProject.funded > 0,
    freeTradeTariffBand: liberalLimits.tariffMax === 25 && liberalLimits.tariffMin === -50
      && liberalTariff === 25 && wantedTariff === 50,
    protectionReturnsWantedTariff: nation.economy.tariff === 50,
    armyCap75: liberalLimits.armySpendingMax === 75,
    nationalistArmyCap100: nationalistLimits.armySpendingMax === 100,
  },
  laws: {
    beyondCapRefusedWithReason: /programme stops at Basic/.test(capReason ?? ''),
    enactedWithinCap: basicLabour && democracy,
    yearlyLockWithReason: /again in 52 weeks/.test(lawLockReason ?? ''),
    pressFeedsResearch: researchAfterDemocracy === 0.25,
    narrowerGovernmentSuspends: suspended && researchSuspended === 0,
    widerGovernmentRestores: restored,
    plannedStateAllowed,
    plannedPrivateBlocked,
  },
  legitimacy: {
    leaderCostsNothing: leaderFree,
    // 30'a 10: fark 0.20 x agirlik 0.25 = istikrardan 5 puan.
    laggardCostsStability: Math.abs(laggardHit + 0.05) < 1e-9,
    stabilityBreakdownLine: breakdownHasLegitimacy,
  },
  ai: {
    patientBeforeTerm,
    switchesAfterTerm,
    onlyRaises,
  },
  save: {
    loaded,
    preserved,
    missingLoaded,
    missingRebuilt,
    legacyLoaded,
    legacyMigrated,
  },
};
results.passed = Object.values(results).every((section) => Object.values(section).every(Boolean));

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
