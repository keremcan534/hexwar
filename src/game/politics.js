import { makeRng } from '../core/rng.js';
import { TIER, announce } from './chronicle.js';

/**
 * Secmen agirliklari: reforms.js FRANCHISE_WEIGHTS'in kopyasi (reforms ->
 * politics import halkasi yuzunden buraya tekrar yazildi; ikisi ayrisirsa
 * politics-play olcumu yakalar). Sandik yalniz oy hakki olan siniflari
 * sayar. Eskiden bir hafta ekranda "Voters' ideologies · 0 enrolled"
 * yazarken ayni hafta secim yapiliyor ve hukumet degisiyordu; "Only Landed"
 * ile alt sinif seçim kazandiriyordu (Open Beta 4 politika kesfi: 30 yilda
 * 32 secim, hepsi oy hakki yokken).
 */
const FRANCHISE_VOTE_WEIGHTS = {
  none_voting: { lower: 0, middle: 0, upper: 0 },
  landed_voting: { lower: 0, middle: 0, upper: 1 },
  weighted_wealth_voting: { lower: 0, middle: 1, upper: 3 },
  wealth_voting: { lower: 0, middle: 1, upper: 1 },
  weighted_universal_voting: { lower: 1, middle: 2, upper: 3 },
  universal_voting: { lower: 1, middle: 1, upper: 1 },
};

function voteWeightsOf(nation) {
  const franchise = nation.politics?.reforms?.vote_franchise;
  return FRANCHISE_VOTE_WEIGHTS[franchise] ?? FRANCHISE_VOTE_WEIGHTS.none_voting;
}

/** Oy hakki olan tek sinif bile yoksa sandik kurulmaz. */
export function hasElectorate(nation) {
  const w = voteWeightsOf(nation);
  return w.lower + w.middle + w.upper > 0;
}

/**
 * Iktidari devirmek icin gereken fark (puan). Duz cogunluk 33.3'e 32.8 ile
 * hukumeti her secimde ceviriyordu: 30 yilda 20 devir, her biri ekonomi
 * politikasini ve kaydirac bantlarini yaniyla surukluyordu (olculdu).
 * Meydan okuyan iktidari ancak bu kadar farkla gecerse kazanir; mali
 * YZ'deki histerezisle ayni fikir.
 */
const INCUMBENCY_MARGIN = 3;

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
    free_trade: { id: 'free_trade', name: 'Free Trade', desc: 'Open ports: the tariff slider is capped at 25% and import subsidies may go to −50%.' },
    protectionism: { id: 'protectionism', name: 'Protectionism', desc: 'Protect domestic production: the tariff slider may reach 100%; a delegated government settles at 50%.' },
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
    // Eski kayitta yok; ilk hafta olcumuyle dolar (bkz. collectPrivateCapital).
    nation.politics.privateInflow = Math.max(0, nation.politics.privateInflow ?? 0);
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
function applyGovernmentLimits(nation, game = null) {
  if (!nation.economy) return;
  const limits = fiscalPolicyLimits(nation);
  // Kirpma ISTENEN degere uygulanir, yerinde ezmez: Workers Party orduyu
  // 75'e kirpip gidince oyuncunun 100'u bir daha geri gelmiyordu ve hicbir
  // sey soylemiyordu (Open Beta 4 politika kesfi). Istenen deger
  // setBudgetPolicy'de yazilir (economy.*Wanted); band genisleyince geri doner.
  const economy = nation.economy;
  const before = { tariff: economy.tariff, armyFunding: economy.armyFunding ?? 100 };
  economy.tariff = Math.max(limits.tariffMin,
    Math.min(limits.tariffMax, economy.tariffWanted ?? economy.tariff));
  economy.armyFunding = Math.max(limits.armySpendingMin,
    Math.min(limits.armySpendingMax, economy.armyFundingWanted ?? economy.armyFunding ?? 100));
  if (!game || nation.id !== game.turns?.playerNation) return;
  const party = rulingParty(nation);
  if (economy.armyFunding !== before.armyFunding
    && economy.armyFunding !== (economy.armyFundingWanted ?? before.armyFunding)) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.IMPORTANT, key: 'band-army',
      title: `${party?.name ?? 'The government'} holds army funding at ${economy.armyFunding}%`,
      detail: `Its war policy allows ${limits.armySpendingMin}–${limits.armySpendingMax}%; your ${economy.armyFundingWanted}% returns when the band widens.`,
    });
  }
  if (economy.tariff !== before.tariff
    && economy.tariff !== (economy.tariffWanted ?? before.tariff)) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.IMPORTANT, key: 'band-tariff',
      title: `${party?.name ?? 'The government'} holds the tariff at ${economy.tariff}%`,
      detail: `Its trade policy allows ${limits.tariffMin}–${limits.tariffMax}%; your ${economy.tariffWanted}% returns when the band widens.`,
    });
  }
}

function supportScore(nation, party) {
  let score = 0;
  const weights = voteWeightsOf(nation);
  for (const classId of ['lower', 'middle', 'upper']) {
    const socialClass = nation.economy?.classes?.[classId];
    if (!socialClass || !weights[classId]) continue;
    let affinity = CLASS_IDEOLOGY[classId][party.ideology] ?? 0.02;
    const satisfaction = socialClass.satisfaction ?? 0.5;
    if (satisfaction < 0.4 && ['socialist', 'communist', 'fascist'].includes(party.ideology)) {
      affinity *= 1 + (0.4 - satisfaction) * 2.4;
    }
    if (satisfaction > 0.58 && ['liberal', 'conservative'].includes(party.ideology)) {
      affinity *= 1 + (satisfaction - 0.58) * 1.4;
    }
    score += socialClass.population * affinity * weights[classId];
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

/**
 * economy.PROFIT_TO_REINVEST'in kopyasi. Dogrudan import edilirse economy.js ile
 * politics.js karsilikli import halkasina girer; tek yer yerine iki yer olmasi
 * pahasina halka kirilir. Ikisi ayrisirsa ledger-audit yakalar.
 */
const REINVEST_SHARE = 0.30;

function collectPrivateCapital(nation) {
  const upper = nation.economy?.classes?.upper;
  if (!upper) return;
  // Korunum notu: REINVEST_SHARE = economy.PROFIT_TO_REINVEST (import katman
  // dongusu yaratirdi, sabit burada tekrarlanir — ledger-audit esitligi
  // dogrular). Hane artigi da bolusulmus bir akistir: SAVINGS_RATE birikime,
  // 0.22 yatirima, kalani tuketime — ayni artik iki kez harcanmaz.
  const householdSurplus = Math.max(0, (upper.needsBudget ?? 0) - (upper.needsCost ?? 0));
  const industrialReturn = Math.max(0, nation.economy?.factoryProfit ?? 0);
  const inflow = householdSurplus * 0.22 + industrialReturn * REINVEST_SHARE;
  // Tavan yalniz BU HAFTANIN akisina uygulanir. Eski yazim `min(1200, p+inflow)`
  // idi ve p tavani astiginda (hisse satisi buyuk bir tek seferlik girdidir)
  // farki sessizce YOK EDIYORDU — para kaybetmek de bir korunum ihlalidir.
  // p <= 1200 iken iki yazim birebir ayni sonucu verir.
  const room = Math.max(0, 1200 - nation.politics.privateCapital);
  nation.politics.privateCapital += Math.min(Math.max(0, inflow), room);
  // KAPITALISTIN GUCU BAKIYE DEGIL AKISTIR. Havuz her hafta bosaliyor (gelen
  // para ayni hafta santiyeye gidiyor), dolayisiyla bakiyeye bakan bir kapi
  // ulkeyi surekli "bes parasiz" okur ve kapitalist ne kadar kazanirsa kazansin
  // hicbir sey acamaz. Yatirim kapisi (economy.runPrivateSector) bunu okur.
  // Ceyrek yillik duzlestirme: tek haftanin kar sicramasi taahhut ettirmesin.
  const smoothed = nation.politics.privateInflow;
  nation.politics.privateInflow = Number.isFinite(smoothed) && smoothed > 0
    ? smoothed + (inflow - smoothed) / 12
    : Math.max(0, inflow);
}

/**
 * Sandığı açar: en çok desteklenen parti iktidara gelir ve saat sıfırlanır.
 * Haftalık tur da, oyuncunun erken seçim düğmesi de aynı yerden geçer —
 * iki ayrı yazımda sonuçlar sessizce ayrışıyordu.
 */
function resolveElection(game, nation) {
  const ranked = [...nation.politics.parties].sort((a, b) => b.support - a.support);
  const previous = rulingParty(nation);
  // Iktidar, meydan okuyan onu INCUMBENCY_MARGIN puan gecmedikce kalir.
  const challenger = ranked[0];
  const winner = previous && challenger.id !== previous.id
    && challenger.support < previous.support + INCUMBENCY_MARGIN
    ? previous : challenger;
  nation.politics.rulingPartyId = winner.id;
  nation.politics.lastElectionTurn = game.world.turn;
  nation.politics.nextElectionTurn = game.world.turn + nation.politics.electionInterval;
  // Sonuc her zaman haber: "Hold Election" tiklayip hicbir sey gormemek
  // oyuncuya dugmenin bozuk oldugunu dusundurtuyordu. Hukumet DEGISIMI
  // vakayinameye girer (MAJOR) — 30 yilda 20 hukumetin hicbiri tarihte yoktu;
  // iktidarin kalmasi yalniz karttir, yoksa yillik secim tarihi doldurur.
  const retained = previous?.id === winner.id;
  // Cekismesiz yenileme (meydan okuyan yok ya da uzak) yalniz akista gorunur;
  // yillik "retained power" karti gurultuydu (audit:events).
  const contested = retained && challenger.id !== winner.id;
  announce(game, nation, {
    kind: 'POLITICS', key: 'election',
    tier: !retained ? TIER.MAJOR : contested ? TIER.IMPORTANT : TIER.AMBIENT,
    title: retained
      ? `${winner.name} retained power with ${Math.round(winner.support)}% support`
      : `${winner.name} won the election with ${Math.round(winner.support)}% support`,
    detail: retained && challenger.id !== winner.id
      ? `${challenger.name} polled ${Math.round(challenger.support)}%, short of the ${INCUMBENCY_MARGIN}-point lead needed to unseat a government.`
      : retained ? 'The government continues with its policies.' : 'Fiscal bands and economic policy now follow the new party.',
  });
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
  if (!hasElectorate(nation)) return false;
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
    applyGovernmentLimits(nation, game);
    if (world.turn < nation.politics.nextElectionTurn) continue;
    // Secmeni olmayan ulkede sandik kurulmaz; vade yine ilerler ki ekrandaki
    // "next election due" ve erken secim penceresi bayat kalmasin.
    if (!hasElectorate(nation)) {
      nation.politics.nextElectionTurn = world.turn + nation.politics.electionInterval;
      continue;
    }
    resolveElection(game, nation);
  }
  game.emit('politics', world.turn);
}

export function policyLabel(category, id) {
  return POLITICAL_POLICIES[category]?.[id]?.name ?? id ?? 'Unknown';
}
