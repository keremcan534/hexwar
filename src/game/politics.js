import { makeRng } from '../core/rng.js';

export const IDEOLOGIES = {
  conservative: { id: 'conservative', name: 'Conservative', color: '#8b8065' },
  liberal: { id: 'liberal', name: 'Liberal', color: '#d1b84f' },
  socialist: { id: 'socialist', name: 'Socialist', color: '#c5534f' },
  communist: { id: 'communist', name: 'Communist', color: '#8f2e32' },
  fascist: { id: 'fascist', name: 'Fascist', color: '#5b5144' },
  reactionary: { id: 'reactionary', name: 'Reactionary', color: '#67517d' },
};

export const POLITICAL_POLICIES = {
  citizenship: {
    residency: { id: 'residency', name: 'Residency', desc: 'Political rights favor the national culture. Foreign-culture provinces recover control at 40% of the national-culture rate.' },
    limited_citizenship: { id: 'limited_citizenship', name: 'Limited Citizenship', desc: 'Minorities receive restricted political rights. Foreign-culture provinces recover control at 57% of the national-culture rate.' },
    full_citizenship: { id: 'full_citizenship', name: 'Full Citizenship', desc: 'All incorporated citizens receive equal political rights. Foreign-culture provinces recover control at 83% of the national-culture rate.' },
  },
  economy: {
    laissez_faire: { id: 'laissez_faire', name: 'Laissez-Faire', desc: 'The state cannot build or expand factories; private capital decides.' },
    interventionism: { id: 'interventionism', name: 'Interventionism', desc: 'Private capital builds factories; the state may expand existing industry.' },
    state_capitalism: { id: 'state_capitalism', name: 'State Capitalism', desc: 'Both the state and private capital may invest in factories.' },
    planned_economy: { id: 'planned_economy', name: 'Planned Economy', desc: 'Only the state may build and expand factories.' },
  },
  trade: {
    free_trade: { id: 'free_trade', name: 'Free Trade', desc: 'Open imports; the tariff slider is capped at 10%.' },
    protectionism: { id: 'protectionism', name: 'Protectionism', desc: 'Protect domestic production; the tariff slider may reach 50%.' },
  },
  military: {
    pacifism: { id: 'pacifism', name: 'Pacifism', desc: 'The army-spending slider is capped at 60%.' },
    anti_military: { id: 'anti_military', name: 'Anti-Military', desc: 'The army-spending slider is capped at 75%.' },
    pro_military: { id: 'pro_military', name: 'Pro-Military', desc: 'Army spending may reach 100%.' },
    jingoism: { id: 'jingoism', name: 'Jingoism', desc: 'Army spending may reach 100%; no additional expansion bonus is active yet.' },
  },
};

const PARTY_TEMPLATES = {
  conservative: {
    names: ['Conservative Union', 'National Conservative Party', 'Traditional Bloc'],
    citizenship: ['residency', 'limited_citizenship'],
    economy: ['state_capitalism'],
    trade: ['protectionism'], military: ['pro_military'],
  },
  liberal: {
    names: ['Liberal League', 'Reform Party', 'Free Citizens Party'],
    citizenship: ['full_citizenship', 'limited_citizenship'],
    economy: ['laissez_faire', 'interventionism'],
    trade: ['free_trade'], military: ['anti_military', 'pro_military'],
  },
  socialist: {
    names: ['Workers Party', 'Social Democratic Party', 'Labour Union'],
    citizenship: ['full_citizenship'],
    economy: ['interventionism', 'planned_economy'],
    trade: ['protectionism'], military: ['anti_military', 'pacifism'],
  },
  communist: {
    names: ['Communist Party', 'Peoples Vanguard', 'Revolutionary Workers Party'],
    citizenship: ['full_citizenship'], economy: ['planned_economy'],
    trade: ['protectionism'], military: ['pro_military'],
  },
  fascist: {
    names: ['National Vanguard', 'Unity Front', 'National Revival Party'],
    citizenship: ['residency', 'limited_citizenship'], economy: ['state_capitalism'],
    trade: ['protectionism'], military: ['jingoism'],
  },
  reactionary: {
    names: ['Royalist Party', 'Restoration League', 'Old Order Bloc'],
    citizenship: ['residency'], economy: ['state_capitalism'],
    trade: ['protectionism'], military: ['jingoism', 'pro_military'],
  },
};

/**
 * Sınıfların ideoloji eğilimi. Nüfus ekranı da bunu okur: ideoloji pastası
 * uydurma bir tablo yerine desteği fiilen hesaplayan tablodan çizilsin,
 * yoksa ekran ile simülasyon aynı halkın iki farklı hikâyesini anlatır.
 */
export const CLASS_IDEOLOGY = {
  lower: { conservative: 0.23, liberal: 0.16, socialist: 0.34, communist: 0.12, fascist: 0.09, reactionary: 0.06 },
  middle: { conservative: 0.28, liberal: 0.35, socialist: 0.17, communist: 0.04, fascist: 0.10, reactionary: 0.06 },
  upper: { conservative: 0.35, liberal: 0.25, socialist: 0.05, communist: 0.01, fascist: 0.10, reactionary: 0.24 },
};

function pickPolicies(rng, ideology) {
  const template = PARTY_TEMPLATES[ideology];
  return {
    citizenship: rng.pick(template.citizenship),
    economy: rng.pick(template.economy),
    trade: rng.pick(template.trade),
    military: rng.pick(template.military),
  };
}

function createParty(rng, nation, ideology, index) {
  const template = PARTY_TEMPLATES[ideology];
  return {
    id: `${nation.id}-${ideology}-${index}`,
    name: rng.pick(template.names),
    ideology,
    policies: pickPolicies(rng, ideology),
    popularity: rng.range(0.86, 1.14),
    support: 0,
  };
}

function partyLineup(world, nation) {
  const rng = makeRng(`${world.seed}-politics-${nation.id}`);
  const ideologies = ['conservative', 'liberal', 'socialist', rng.pick(['fascist', 'reactionary', 'communist'])];
  return ideologies.map((ideology, index) => createParty(rng, nation, ideology, index));
}

export function initPolitics(world) {
  for (const nation of world.nations) {
    const parties = partyLineup(world, nation);
    const ruling = parties.find((party) => party.ideology === 'conservative') ?? parties[0];
    nation.politics = {
      parties,
      rulingPartyId: ruling.id,
      lastElectionTurn: 1,
      nextElectionTurn: 49,
      electionInterval: 48,
      privateCapital: 0,
      lastPrivateInvestment: null,
    };
  }
  updatePoliticalSupport(world);
}

export function ensurePolitics(world) {
  const initialized = [];
  for (const nation of world.nations) {
    if (!nation.politics?.parties?.length) {
      const parties = partyLineup(world, nation);
      nation.politics = {
        parties,
        rulingPartyId: (parties.find((party) => party.ideology === 'conservative') ?? parties[0]).id,
        lastElectionTurn: world.turn ?? 1,
        nextElectionTurn: (world.turn ?? 1) + 48,
        electionInterval: 48,
        privateCapital: 0,
        lastPrivateInvestment: null,
      };
      initialized.push(nation);
    }
    nation.politics.privateCapital = Math.max(0, nation.politics.privateCapital ?? 0);
    nation.politics.electionInterval ??= 48;
    nation.politics.nextElectionTurn ??= (world.turn ?? 1) + nation.politics.electionInterval;
    for (const party of nation.politics.parties) {
      party.popularity = Math.max(0.5, party.popularity ?? 1);
      party.support = Math.max(0, party.support ?? 0);
    }
    if (!nation.politics.parties.some((party) => party.id === nation.politics.rulingPartyId)) {
      nation.politics.rulingPartyId = nation.politics.parties[0].id;
    }
  }
  // Eski bir kayda siyaset ilk kez eklendiğinde ekran bir sonraki haftaya kadar
  // 0% göstermesin; mevcut sınıf nüfuslarından ilk desteği hemen hesapla.
  for (const nation of initialized) {
    if (!nation.alive) continue;
    const scores = nation.politics.parties.map((party) => supportScore(nation, party));
    const total = Math.max(1, scores.reduce((sum, value) => sum + value, 0));
    nation.politics.parties.forEach((party, index) => {
      party.support = (scores[index] / total) * 100;
    });
  }
}

export function rulingParty(nation) {
  return nation?.politics?.parties?.find((party) => party.id === nation.politics.rulingPartyId)
    ?? nation?.politics?.parties?.[0] ?? null;
}

export function policyOf(nation, category) {
  return rulingParty(nation)?.policies?.[category] ?? null;
}

export function factoryInvestmentRules(nation) {
  const policy = policyOf(nation, 'economy');
  return {
    policy: policy ?? 'state_capitalism',
    stateBuild: policy !== 'laissez_faire' && policy !== 'interventionism',
    stateExpand: policy !== 'laissez_faire',
    privateBuild: policy !== 'planned_economy',
    privateExpand: policy !== 'planned_economy',
  };
}

export function canInvestInFactory(nation, action = 'build', actor = 'state') {
  const rules = factoryInvestmentRules(nation);
  if (actor === 'private') return action === 'expand' ? rules.privateExpand : rules.privateBuild;
  return action === 'expand' ? rules.stateExpand : rules.stateBuild;
}

export function fiscalPolicyLimits(nation) {
  const trade = policyOf(nation, 'trade');
  const military = policyOf(nation, 'military');
  return {
    // Negatif tarife ithalat sübvansiyonudur: hazine farkı öder. Serbest
    // ticaret partisi sübvansiyona geniş, gümrüğe dar bakar; korumacı tersi.
    tariffMin: trade === 'free_trade' ? -50 : -15,
    tariffMax: trade === 'free_trade' ? 25 : 100,
    armySpendingMin: 25,
    armySpendingMax: military === 'pacifism' ? 60 : military === 'anti_military' ? 75 : 100,
  };
}

/**
 * Hukumet degisince butce kaydiraclari yeni bandin icine cekilir. Ordu ve
 * gumruk partinin doktrinine tabidir; oran ve sosyal harcama serbesttir.
 */
function applyGovernmentLimits(nation) {
  if (!nation.economy) return;
  const limits = fiscalPolicyLimits(nation);
  nation.economy.tariff = Math.max(limits.tariffMin, Math.min(limits.tariffMax, nation.economy.tariff));
  nation.economy.armyFunding = Math.max(
    limits.armySpendingMin,
    Math.min(limits.armySpendingMax, nation.economy.armyFunding ?? 100),
  );
}

function supportScore(nation, party) {
  let score = 0;
  for (const classId of ['lower', 'middle', 'upper']) {
    const socialClass = nation.economy?.classes?.[classId];
    if (!socialClass) continue;
    let affinity = CLASS_IDEOLOGY[classId][party.ideology] ?? 0.02;
    const satisfaction = socialClass.satisfaction ?? 0.5;
    if (satisfaction < 0.4 && ['socialist', 'communist', 'fascist'].includes(party.ideology)) {
      affinity *= 1 + (0.4 - satisfaction) * 2.4;
    }
    if (satisfaction > 0.58 && ['liberal', 'conservative'].includes(party.ideology)) {
      affinity *= 1 + (satisfaction - 0.58) * 1.4;
    }
    score += socialClass.population * affinity;
  }
  // SAVAS SIYASETE DOKUNUR (eksikti — olculdu: warStrain yalnizca stability'ye
  // akiyordu ve stability'yi hicbir siyaset kodu okumuyordu; kaybedilen savas
  // iktidara hic fatura kesmiyordu). Yipratan savas ve isgal IKTIDAR partisini
  // asindirir: hane muhasebesine dokunmadan, dogrudan siyasi katmanda.
  const ruling = rulingParty(nation);
  if (ruling && party.id === ruling.id) {
    const strain = Math.max(0, Math.min(1, nation.economy?.warStrain ?? 0));
    const occupied = Math.max(0, Math.min(1, nation.economy?.occupiedShare ?? 0));
    score *= 1 - Math.min(0.45, strain * 0.3 + occupied * 0.4);
  }
  return score * party.popularity;
}

export function updatePoliticalSupport(world) {
  ensurePolitics(world);
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const scores = nation.politics.parties.map((party) => supportScore(nation, party));
    const total = Math.max(1, scores.reduce((sum, value) => sum + value, 0));
    nation.politics.parties.forEach((party, index) => {
      party.support = (scores[index] / total) * 100;
    });
  }
}

function collectPrivateCapital(nation) {
  const upper = nation.economy?.classes?.upper;
  if (!upper) return;
  // Korunum notu: 0.08 = economy.PROFIT_TO_REINVEST (import katman dongusu
  // yaratirdi, sabit burada tekrarlanir — ledger-audit esitligi dogrular).
  // Hane artigi da bolusulmus bir akistir: SAVINGS_RATE birikime, 0.22
  // yatirima, kalani tuketime — ayni artik iki kez harcanmaz.
  const householdSurplus = Math.max(0, (upper.needsBudget ?? 0) - (upper.needsCost ?? 0));
  const industrialReturn = Math.max(0, nation.economy?.factoryProfit ?? 0);
  // Sirket katmani ayni 0.08'lik yeniden-yatirim payinin bir kismini dogrudan
  // sahibi sirketin kasasina yazdi (bkz. companies.runCompanies). O tutar
  // havuza IKINCI KEZ yazilmaz; toplam akis degismez, yalnizca kimin elinde
  // durdugu degisir.
  const claimed = Math.min(
    industrialReturn * 0.08,
    Math.max(0, nation.economy?.reinvestToCompanies ?? 0),
  );
  const inflow = householdSurplus * 0.22 + industrialReturn * 0.08 - claimed;
  // Tavan yalniz BU HAFTANIN akisina uygulanir. Eski yazim `min(1200, p+inflow)`
  // idi ve p tavani astiginda (hisse satisi buyuk bir tek seferlik girdidir)
  // farki sessizce YOK EDIYORDU — para kaybetmek de bir korunum ihlalidir.
  // p <= 1200 iken iki yazim birebir ayni sonucu verir.
  const room = Math.max(0, 1200 - nation.politics.privateCapital);
  nation.politics.privateCapital += Math.min(Math.max(0, inflow), room);
}

/**
 * Sandığı açar: en çok desteklenen parti iktidara gelir ve saat sıfırlanır.
 * Haftalık tur da, oyuncunun erken seçim düğmesi de aynı yerden geçer —
 * iki ayrı yazımda sonuçlar sessizce ayrışıyordu.
 */
function resolveElection(game, nation) {
  const winner = [...nation.politics.parties].sort((a, b) => b.support - a.support)[0];
  const previous = rulingParty(nation);
  nation.politics.rulingPartyId = winner.id;
  nation.politics.lastElectionTurn = game.world.turn;
  nation.politics.nextElectionTurn = game.world.turn + nation.politics.electionInterval;
  if (nation.id === game.turns.playerNation && previous?.id !== winner.id) {
    game.turns.addLog(`${winner.name} won the election with ${Math.round(winner.support)}% support.`,
      { kind: 'POLITICS' });
  }
  return winner;
}

/** Erken seçim penceresi, hafta. Vadeye bu kadar kalınca sandık açılabilir. */
export const EARLY_ELECTION_WINDOW = 12;

export function electionWindowOpen(world, nation) {
  const next = nation?.politics?.nextElectionTurn;
  return next != null && world.turn >= next - EARLY_ELECTION_WINDOW;
}

/**
 * Oyuncunun sandığı erken açması. Vadeden çok önce çağrılırsa hiçbir şey
 * olmaz: aksi halde beğenilmeyen sonuç tekrar tekrar atılabilirdi.
 */
export function holdElection(game, nation) {
  if (!nation?.politics?.parties?.length) return false;
  if (!electionWindowOpen(game.world, nation)) return false;
  updatePoliticalSupport(game.world);
  resolveElection(game, nation);
  game.emit('politics', game.world.turn);
  return true;
}

export function runPolitics(game) {
  const world = game.world;
  ensurePolitics(world);
  updatePoliticalSupport(world);
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    collectPrivateCapital(nation);
    applyGovernmentLimits(nation);
    if (world.turn < nation.politics.nextElectionTurn) continue;
    resolveElection(game, nation);
  }
  game.emit('politics', world.turn);
}

export function policyLabel(category, id) {
  return POLITICAL_POLICIES[category]?.[id]?.name ?? id ?? 'Unknown';
}
