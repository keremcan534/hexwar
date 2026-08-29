import { Game } from '../src/game/game.js';
import { TurnManager } from '../src/game/turn.js';
import { generateWorld } from '../src/world/worldgen.js';
import { generateNations } from '../src/world/nations.js';
import {
  POLITICAL_POLICIES, canInvestInFactory, ensurePolitics, fiscalPolicyLimits, runPolitics,
  rulingParty,
} from '../src/game/politics.js';
import {
  FACTORIES, buildFactory, canBuildFactory, runEconomy, setBudgetPolicy,
} from '../src/game/economy.js';
import { constructionAtlas, ensureConstruction } from '../src/game/construction.js';
import { deserialize, serialize } from '../src/game/save.js';

function headless(seed) {
  const game = Object.create(Game.prototype);
  game.world = generateWorld(seed);
  generateNations(game.world, { seed: `${seed}-nations` });
  game.selected = null;
  game.selectedUnit = null;
  game.reachable = null;
  game.autosaveEnabled = false;
  game.listeners = {};
  game.renderer = { invalidateCache() {}, invalidateTiles() {} };
  game.emit = () => {};
  game.requestRender = () => {};
  game.autosave = () => {};
  game.turns = new TurnManager(game);
  game.turns.start(game.world);
  return game;
}

function makeReloadable(game) {
  game.newWorld = function newWorld(seed, options = {}) {
    this.world = generateWorld(seed, options);
    generateNations(this.world, {
      seed: `${seed}-nations`, count: options.nationCount ?? null,
    });
    this.selected = null;
    this.selectedUnit = null;
    this.turns.start(this.world);
    return this.world;
  };
  game.setSpeed = () => 0;
  return game;
}

const game = makeReloadable(headless('POLITICS'));
const mirror = headless('POLITICS');
const nation = game.world.nations[0];
const mirrorNation = mirror.world.nations[0];
const supportTotal = nation.politics.parties.reduce((sum, party) => sum + party.support, 0);
const policiesValid = nation.politics.parties.every((party) => (
  Object.entries(party.policies).every(([category, id]) => Boolean(POLITICAL_POLICIES[category]?.[id]))
));
const deterministic = JSON.stringify(nation.politics.parties.map((party) => ({
  name: party.name, ideology: party.ideology, policies: party.policies,
}))) === JSON.stringify(mirrorNation.politics.parties.map((party) => ({
  name: party.name, ideology: party.ideology, policies: party.policies,
})));

const liberal = nation.politics.parties.find((party) => party.ideology === 'liberal');
nation.politics.rulingPartyId = liberal.id;
liberal.policies.economy = 'laissez_faire';
liberal.policies.trade = 'free_trade';
liberal.policies.military = 'anti_military';
// Fabrika artik sehre degil state'e kurulur (bkz. economy.js canBuildFactory).
const region = constructionAtlas(game.world, nation.id).regions[0];
Object.assign(nation, { gold: 1000, timber: 1000, iron: 1000 });
nation.politics.privateCapital = 1000;
// Ulkeler artik kurulus sanayisiyle basliyor (bkz. STARTING_INDUSTRY), bu
// yuzden tur sabit secilemez: o state'te henuz olmayan bir tesis bulunur.
const buildable = Object.keys(FACTORIES).find(
  (typeId) => canBuildFactory(game.world, nation, region.id, typeId, 'private'),
);
const stateBlocked = !canBuildFactory(game.world, nation, region.id, buildable);
const privateAllowed = canBuildFactory(game.world, nation, region.id, buildable, 'private');
const treasuryBefore = nation.gold;
const capitalBefore = nation.politics.privateCapital;
const privateBuilt = buildFactory(game, nation, region.id, buildable, { actor: 'private' });
// Fabrika artik aninda dogmaz: insaat kuyruguna proje olarak girer ve ozel
// sermaye ona haftalar icinde akar (bkz. economy.js fundPrivateProjects).
const privateProject = ensureConstruction(nation).projects.find(
  (project) => project.kind === 'factory' && project.typeId === buildable,
);
// Hazine kurulum aninda hic dokunulmamis olmali; asagidaki runEconomy vergi
// geliri de ekledigi icin karsilastirma o cagridan once alinir.
const treasuryAfterBuild = nation.gold;
runEconomy(game);
const capitalAfter = nation.politics.privateCapital;

setBudgetPolicy(nation, 'tariff', 50);
setBudgetPolicy(nation, 'armySpending', 100);
const limits = fiscalPolicyLimits(nation);

const socialist = nation.politics.parties.find((party) => party.ideology === 'socialist');
socialist.policies.economy = 'planned_economy';
nation.politics.rulingPartyId = socialist.id;
const plannedStateAllowed = canInvestInFactory(nation, 'build', 'state');
const plannedPrivateBlocked = !canInvestInFactory(nation, 'build', 'private');

for (const party of nation.politics.parties) party.popularity = party === socialist ? 100 : 0.5;
nation.politics.rulingPartyId = liberal.id;
nation.politics.nextElectionTurn = game.world.turn;
runPolitics(game);
const electionChangedGovernment = rulingParty(nation).id === socialist.id;

const saved = serialize(game);
const politicsIdBeforeSave = nation.politics.rulingPartyId;
const loaded = deserialize(game, saved);
const politicsPreserved = game.world.nations[nation.id].politics.rulingPartyId === politicsIdBeforeSave;
const legacy = JSON.parse(JSON.stringify(saved));
for (const savedNation of legacy.nations) delete savedNation.politics;
const legacyLoaded = deserialize(game, legacy);
ensurePolitics(game.world);
const legacyMigrated = game.world.nations.every((candidate) => candidate.politics?.parties?.length === 4);
const legacyElectionScheduled = game.world.nations.every(
  (candidate) => candidate.politics.nextElectionTurn > game.world.turn,
);

const results = {
  parties: {
    fourParties: nation.politics.parties.length === 4,
    deterministic,
    supportTotalsOneHundred: Math.abs(supportTotal - 100) < 0.01,
    policiesValid,
    fullCitizenshipExists: nation.politics.parties.some(
      (party) => party.policies.citizenship === 'full_citizenship',
    ),
  },
  laissezFaire: {
    stateBlocked,
    privateAllowed,
    privateBuilt,
    projectQueued: Boolean(privateProject),
    // Hazineye dokunulmadi: parayi kapitalistler koydu.
    stateTreasuryUntouched: treasuryAfterBuild === treasuryBefore,
    privateCapitalPaid: capitalAfter < capitalBefore && privateProject.funded > 0,
    markedPrivate: privateProject.actor === 'private',
  },
  policyLimits: {
    // Serbest ticaret tavani 10'dan 25'e cikti ve taban -50 oldu (ithalat
    // subvansiyonu); beklenti bilincli tasarim degisikligiyle guncellendi.
    freeTradeTariffCap: limits.tariffMax === 25 && limits.tariffMin === -50
      && nation.economy.tariff <= 25,
    antiMilitaryFundingCap: limits.armySpendingMax === 75 && nation.economy.armySpending === 75,
    plannedStateAllowed,
    plannedPrivateBlocked,
  },
  electionsAndSave: {
    electionChangedGovernment,
    loaded,
    politicsPreserved,
    legacyLoaded,
    legacyMigrated,
    legacyElectionScheduled,
  },
};
results.passed = Object.values(results).every((section) => Object.values(section).every(Boolean));

console.log(JSON.stringify(results, null, 2));
if (!results.passed) process.exitCode = 1;
