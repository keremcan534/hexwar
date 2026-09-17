// Siyaset: hükûmet ve yasalar.
//
// SADELEŞTİRME (2026-09). Bu katman Victoria 2'nin Politics penceresini
// birebir izliyordu: 18 yasa merdiveni (75 basamak), üst meclis kapısı, dört
// ağırlık sınıfı (eşik/bekleme/yorgunluk), kriz kuralı, ülkeden ülkeye zarla
// adlandırılıp zarla programlanan dört parti, 48 haftalık seçim, erken seçim
// penceresi, seçmen/halk pastaları, meseleler ve hareketler. Oyuncu için
// hepsi ev ödeviydi — ve seçim bir bedel bile değildi: parti atamak bedava ve
// anlıktı, kaybedilen seçimin ertesi günü aynı parti yeniden atanabiliyordu.
//
// Şimdi oyuncunun iki kararı var:
//
//   HÜKÛMET  Her ülkede aynı dört parti, sabit programla. Oyuncu seçer,
//            hükûmet dört yıl görevde kalır, seçim yoktur. Bedeli MEŞRUİYET:
//            halkın en çok desteklediği parti iktidarda değilse aradaki fark
//            istikrardan düşer (bkz. legitimacyOf).
//   YASALAR  Beş yasa, üçer kademe, kademe doğrudan seçilir. İktidarın
//            programı her yasada izin verdiği en yüksek kademeyi söyler; her
//            yasa yılda bir değişir.
//
// Simülasyona giden kanallar AYNI katsayılarla korundu: bir yasanın tavan
// kademesi, katlandığı eski merdivenlerin hepsi tavandayken ne veriyorsa onu
// verir (bkz. computeLawModifiers). Değişen yalnız oyuncunun oraya nasıl
// vardığı.
//
// DOM bilmez. economy/culture/provinces/recruitment/technology buradan okur;
// bu dosya onlardan hiçbir şey içe aktarmaz (import halkası).

import { makeRng } from '../core/rng.js';
import { TIER, announce } from './chronicle.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const CLASS_IDS = ['lower', 'middle', 'upper'];

/* --------------------------------------------------------------------------
   İDEOLOJİLER
   -------------------------------------------------------------------------- */

export const IDEOLOGIES = {
  conservative: { id: 'conservative', name: 'Conservative', color: '#8b8065' },
  liberal: { id: 'liberal', name: 'Liberal', color: '#d1b84f' },
  socialist: { id: 'socialist', name: 'Socialist', color: '#c5534f' },
  nationalist: { id: 'nationalist', name: 'Nationalist', color: '#7a5f96' },
};

export const IDEOLOGY_IDS = Object.keys(IDEOLOGIES);

/**
 * Sınıfların ideoloji eğilimi. Eski altı ideoloji dörde katlandı: komünist
 * sosyaliste, faşist ve gerici milliyetçiye; paylar toplandı, yani bir sınıfın
 * "düzen" ya da "radikal" eğilimi değişmedi. Nüfus ekranı da bu tabloyu okur
 * (census.js) — pasta ile destek aynı halkın aynı hikâyesini anlatsın.
 */
export const CLASS_IDEOLOGY = {
  lower: { conservative: 0.23, liberal: 0.16, socialist: 0.46, nationalist: 0.15 },
  middle: { conservative: 0.28, liberal: 0.35, socialist: 0.21, nationalist: 0.16 },
  upper: { conservative: 0.35, liberal: 0.25, socialist: 0.06, nationalist: 0.34 },
};

/** Eski kayıtların altı ideolojisi: göç her birini dört partiden birine bağlar. */
const LEGACY_IDEOLOGY = {
  conservative: 'conservative',
  liberal: 'liberal',
  socialist: 'socialist',
  communist: 'socialist',
  fascist: 'nationalist',
  reactionary: 'nationalist',
};

/* --------------------------------------------------------------------------
   PARTİ PROGRAMLARININ EKONOMİ EKSENLERİ
   -------------------------------------------------------------------------- */

export const POLITICAL_POLICIES = {
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
    jingoism: { id: 'jingoism', name: 'Jingoism', desc: 'Army spending may reach 100%.' },
  },
};

export function policyLabel(category, id) {
  return POLITICAL_POLICIES[category]?.[id]?.name ?? id ?? 'Unknown';
}

/* --------------------------------------------------------------------------
   YASALAR — beş yasa, üçer kademe

   Her yasa eski merdivenlerden birkaçının katlanmış hâlidir:
     Constitution  oy hakkı, seçim sistemi, partiler, üst meclis, toplanma, basın
     Labour        asgari ücret, çalışma saati, iş güvenliği, sendika, çocuk
                   işçi, kölelik
     Welfare       işsizlik yardımı, emeklilik, sağlık, okul
     Citizenship   azınlık hakları + partinin eski vatandaşlık ekseni
     Conscription  askerlik (yön ters çevrildi: kademe arttıkça daha çok asker)
   -------------------------------------------------------------------------- */

const law = (id, name, icon, levels) => ({
  id,
  name,
  icon,
  levels: levels.map(([levelId, levelName, effect], index) => ({
    id: levelId, name: levelName, effect, index,
  })),
});

export const LAWS = [
  law('constitution', 'Constitution', 'house', [
    ['absolute', 'Absolute', 'The crown rules and only the propertied count. The press prints what it is told.'],
    ['constitutional', 'Constitutional', 'A charter and a chamber; property votes; the press is censored, not silenced.'],
    ['democracy', 'Democracy', 'Every adult votes and the press is free.'],
  ]),
  law('labour', 'Labour Rights', 'union', [
    ['no_labour_rights', 'None', 'Wages, hours and safety are the owner’s business. Slavery is legal.'],
    ['basic_labour_rights', 'Basic', 'A wage floor, a shorter day, guarded machines; unions tolerated.'],
    ['strong_labour_rights', 'Strong', 'A living wage, the eight-hour day, free unions; no child or slave labour.'],
  ]),
  law('welfare', 'Welfare State', 'health', [
    ['no_welfare', 'None', 'The jobless, the old and the sick depend on charity; literacy is a private accident.'],
    ['basic_welfare', 'Basic', 'A modest dole, pensions, public clinics and parish schools.'],
    ['full_welfare', 'Full', 'The state keeps the jobless, the old and the sick, and schools every child.'],
  ]),
  law('citizenship', 'Citizenship', 'rights', [
    ['residency', 'Residency', 'Political rights belong to the national culture alone.'],
    ['limited_citizenship', 'Limited', 'Minorities hold restricted political rights.'],
    ['full_citizenship', 'Full', 'Every incorporated citizen holds equal rights.'],
  ]),
  law('conscription', 'Conscription', 'conscript', [
    ['volunteer_army', 'Volunteer', 'Only those who choose to serve.'],
    ['limited_draft', 'Limited', 'A short draft for part of every cohort.'],
    ['mass_conscription', 'Mass', 'Every eligible man serves his years.'],
  ]),
];

export const LAW_BY_ID = Object.fromEntries(LAWS.map((item) => [item.id, item]));
export const LAW_IDS = LAWS.map((item) => item.id);
const TOP_LEVEL = 2;

/** Bir yasa, yılda bir değişir. Oyuncu da YZ de aynı saatten geçer. */
export const LAW_TERM = 52;

/* --------------------------------------------------------------------------
   PARTİLER — dört parti, dört sabit program
   -------------------------------------------------------------------------- */

/**
 * PARTİ = PROGRAM. Her ülkede aynı dört parti, aynı programla; oyuncu bir kez
 * öğrenir. Eskiden parti adı da dört eksenli programı da ülkeden ülkeye zarla
 * seçiliyordu ve iki "Liberal" parti başka şeyler savunabiliyordu.
 *
 * `laws[id].max` iktidarın izin verdiği en yüksek kademedir (taban yok);
 * `prefer` YZ'nin ve devredilmiş kabinenin sürdüğü kademe. Her partinin
 * başka hiçbir partide olmayan bir şeyi var: muhafazakâr fabrikayı hem
 * devlete hem sermayeye kurdurur ve ordu bütçesini sınırlamaz, liberal
 * ticareti açar ve anayasayı demokrasiye taşır, sosyalist işçi hakkını ve
 * refahı tavana çıkarır, milliyetçi seferber ordu kurar.
 */
export const PARTIES = {
  conservative: {
    id: 'conservative',
    name: 'Conservatives',
    pitch: 'Throne, altar and property.',
    policies: { economy: 'state_capitalism', trade: 'protectionism', military: 'pro_military' },
    // Bismarck muhafazakârı: sandığı açmaz ama refahı kurar. Refahı tercih
    // etmeyen ilk yazım ölçüldü: YZ muhafazakârı hiçbir sosyal yasa çıkarmayınca
    // 20 yılda alt sınıf memnuniyeti eski dünyanın 0.08 altında kaldı (eski
    // meclis muhafazakâra da yavaş yavaş sosyal yasa çıkartıyordu).
    laws: {
      constitution: { max: 1, prefer: 0 },
      labour: { max: 1, prefer: 0 },
      welfare: { max: 1, prefer: 1 },
      citizenship: { max: 1, prefer: 1 },
      conscription: { max: 1, prefer: 1 },
    },
  },
  liberal: {
    id: 'liberal',
    name: 'Liberals',
    pitch: 'Free trade, a free press and a small state.',
    policies: { economy: 'laissez_faire', trade: 'free_trade', military: 'anti_military' },
    // 19. yüzyıl liberali sayım usulü oyu ister, genel oyu değil: YZ liberali
    // meşrutiyette durur. Oyuncu demokrasiye kadar gidebilir.
    laws: {
      constitution: { max: 2, prefer: 1 },
      labour: { max: 1, prefer: 1 },
      welfare: { max: 1, prefer: 1 },
      citizenship: { max: 2, prefer: 2 },
      conscription: { max: 1, prefer: 0 },
    },
  },
  socialist: {
    id: 'socialist',
    name: 'Socialists',
    pitch: 'The worker protected, industry planned, the army small.',
    policies: { economy: 'planned_economy', trade: 'protectionism', military: 'pacifism' },
    laws: {
      constitution: { max: 2, prefer: 2 },
      labour: { max: 2, prefer: 2 },
      welfare: { max: 2, prefer: 2 },
      citizenship: { max: 2, prefer: 2 },
      conscription: { max: 1, prefer: 0 },
    },
  },
  nationalist: {
    id: 'nationalist',
    name: 'Nationalists',
    pitch: 'One people, one will, a nation in arms.',
    policies: { economy: 'state_capitalism', trade: 'protectionism', military: 'jingoism' },
    laws: {
      constitution: { max: 0, prefer: 0 },
      labour: { max: 1, prefer: 1 },
      welfare: { max: 1, prefer: 1 },
      citizenship: { max: 0, prefer: 0 },
      conscription: { max: 2, prefer: 2 },
    },
  },
};

/** Hükûmet dört yıl görevde kalır. Bu, seçimin yerini alan kilittir. */
export const GOVERNMENT_TERM = 208;

/**
 * YZ, en çok desteklenen parti iktidarı bu kadar puan geçmedikçe hükûmet
 * değiştirmez; eşik anayasa kademesine göredir (mutlak / meşruti / demokrasi).
 * Eski seçimdeki histerezisin aynı fikri: 33.3'e 32.8 ile hükûmeti çevirmek
 * 30 yılda 20 devir üretiyordu (Open Beta 4). Tek eşik (3) ölçüldü ve yetmedi:
 * yeni katmanda ilk yıl tohum başına 15 hükûmet değişti, eski dünyada 0.
 * Mutlak monarşi kolay el değiştirmez; demokrasi değiştirir.
 */
const SWITCH_MARGIN = [8, 5, 3];

function makeParty(nation, ideology) {
  return {
    id: `${nation.id}-${ideology}`,
    ideology,
    name: PARTIES[ideology].name,
    support: 0,
  };
}

export function rulingParty(nation) {
  const politics = nation?.politics;
  const parties = politics?.parties;
  if (!parties?.length) return null;
  for (const party of parties) {
    if (party.id === politics.rulingPartyId) return party;
  }
  return parties[0];
}

/** İktidarın programı (PARTIES girdisi). Siyaset kurulmamışsa null. */
export function programmeOf(nation) {
  const ruling = rulingParty(nation);
  return ruling ? PARTIES[ruling.ideology] ?? null : null;
}

export function policyOf(nation, category) {
  return programmeOf(nation)?.policies?.[category] ?? null;
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

/** Savaş politikasının ordu fonu tavanı (%). */
const ARMY_CAP = { pacifism: 60, anti_military: 75, pro_military: 100, jingoism: 100 };

export function fiscalPolicyLimits(nation) {
  const trade = policyOf(nation, 'trade');
  return {
    // Negatif tarife ithalat sübvansiyonudur: hazine farkı öder. Serbest
    // ticaret partisi sübvansiyona geniş, gümrüğe dar bakar; korumacı tersi.
    tariffMin: trade === 'free_trade' ? -50 : -15,
    tariffMax: trade === 'free_trade' ? 25 : 100,
    armySpendingMin: 25,
    armySpendingMax: ARMY_CAP[policyOf(nation, 'military')] ?? 100,
  };
}

/* --------------------------------------------------------------------------
   YASA DURUMU — nation.politics.laws

   Kayıtta SEÇİLEN kademe durur; yürürlükteki kademe iktidarın tavanıyla
   kırpılmış hâlidir. Bütçedeki gümrük/ordu bandıyla aynı kavram: tavan
   daralınca seçim askıya alınır, genişleyince kendiliğinden geri gelir.
   -------------------------------------------------------------------------- */

function levelIndex(item, levelId) {
  const levels = item.levels;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i].id === levelId) return i;
  }
  return -1;
}

/** Oyuncunun (ya da YZ'nin) seçtiği kademe, tavan uygulanmadan. */
export function chosenLawIndex(nation, lawId) {
  const item = LAW_BY_ID[lawId];
  const saved = nation?.politics?.laws?.[lawId];
  if (!item || saved == null) return 0;
  return Math.max(0, levelIndex(item, saved));
}

/** İktidarın bu yasada izin verdiği en yüksek kademe. */
export function lawCap(nation, lawId) {
  return programmeOf(nation)?.laws?.[lawId]?.max ?? TOP_LEVEL;
}

/** Yürürlükteki kademe (0–2). */
export function lawIndex(nation, lawId) {
  return Math.min(chosenLawIndex(nation, lawId), lawCap(nation, lawId));
}

/** Yürürlükteki kademenin kimliği — yasa okuyan sistemler için kısa yol. */
export function lawValue(nation, lawId) {
  return LAW_BY_ID[lawId]?.levels[lawIndex(nation, lawId)]?.id ?? null;
}

export function lawLockWeeks(world, nation, lawId) {
  const until = nation?.politics?.lawLocks?.[lawId] ?? 0;
  return Math.max(0, until - (world?.turn ?? 0));
}

export function governmentLockWeeks(world, nation) {
  const until = nation?.politics?.governmentLockUntil ?? 0;
  return Math.max(0, until - (world?.turn ?? 0));
}

/* --------------------------------------------------------------------------
   KURULUŞ VE GÖÇ
   -------------------------------------------------------------------------- */

/**
 * 1836 başlangıcı: muhafazakâr hükûmet, mirası küçük yasalar. Zar ülkeye
 * sabittir (aynı dünya aynı başlangıcı verir); iki muhafazakâr ülke aynı
 * yasa listesiyle başlamasın diye anayasa ve vatandaşlıkta dalgalanma var.
 *
 * Kilit sıfırdır: oyuncu ülkesini seçer seçmez hükûmetini kurabilir. Devralınan
 * hükûmetin görevdeki YAŞI ise zarla dağılır; YZ tam bir dönem dolmadan
 * hükûmet değiştirmediği için ilk değişimler dört yıla yayılır, hepsi ilk
 * çeyrekte birden gelmez.
 */
function freshPolitics(world, nation) {
  const rng = makeRng(`${world.seed}-politics-${nation.id}`);
  const parties = IDEOLOGY_IDS.map((ideology) => makeParty(nation, ideology));
  return {
    parties,
    rulingPartyId: parties[0].id,
    governmentSince: (world.turn ?? 1) - Math.floor(rng() * GOVERNMENT_TERM),
    governmentLockUntil: 0,
    laws: {
      constitution: rng() < 0.3 ? 'constitutional' : 'absolute',
      labour: 'no_labour_rights',
      welfare: 'no_welfare',
      citizenship: rng() < 0.5 ? 'limited_citizenship' : 'residency',
      conscription: 'limited_draft',
    },
    lawLocks: {},
    // YZ yılda bir yasa değiştirir; son değişikliğin tarihi de zarla dağılır
    // ki bütün dünya aynı çeyrekte aynı yasayı çıkarmasın.
    lastLawChange: (world.turn ?? 1) - Math.floor(rng() * LAW_TERM),
    privateCapital: 0,
    privateInflow: 0,
    lastPrivateInvestment: null,
  };
}

/**
 * Eski kaydın merdivenleri, basamak sırasıyla. Yalnız göç okur: bir yasanın
 * kademesi, katlandığı merdivenlerin ortalama ilerlemesinin en yakın
 * kademesidir. Askerlik merdiveni TERS yazıldı ki ilerleme asker demek olsun.
 */
const LEGACY_LADDERS = {
  constitution: {
    vote_franchise: ['none_voting', 'landed_voting', 'weighted_wealth_voting', 'wealth_voting', 'weighted_universal_voting', 'universal_voting'],
    voting_system: ['first_past_the_post', 'jefferson_method', 'proportional_representation'],
    political_parties: ['underground_parties', 'harassment', 'gerrymandering', 'non_secret_ballots', 'secret_ballots'],
    upper_house: ['party_appointed', 'appointed', 'state_equal_weight', 'population_equal_weight'],
    public_meetings: ['no_meeting', 'yes_meeting'],
    press_rights: ['state_press', 'censored_press', 'free_press'],
  },
  labour: {
    minimum_wage: ['no_minimum_wage', 'trinket_minimum_wage', 'low_minimum_wage', 'acceptable_minimum_wage', 'good_minimum_wage'],
    work_hours: ['unlimited_work_day', 'fourteen_hour_day', 'twelve_hour_day', 'ten_hour_day', 'eight_hour_day'],
    safety: ['no_safety', 'minimal_safety', 'limited_safety', 'regular_safety', 'good_safety'],
    trade_unions: ['no_trade_unions', 'state_controlled_unions', 'non_socialist_unions', 'all_trade_unions'],
    child_labor: ['child_labor_legal', 'child_labor_restricted', 'child_labor_illegal'],
    slavery: ['yes_slavery', 'freedom_of_womb', 'no_slavery'],
  },
  welfare: {
    unemployment: ['no_subsidies', 'trinket_subsidies', 'low_subsidies', 'extended_subsidies', 'generous_subsidies'],
    pensions: ['no_pensions', 'trinket_pensions', 'low_pensions', 'acceptable_pensions', 'good_pensions'],
    health_care: ['no_health_care', 'trinket_health_care', 'low_health_care', 'acceptable_health_care', 'good_health_care'],
    school_system: ['no_schools', 'basic_schools', 'acceptable_schools', 'good_schools'],
  },
  citizenship: {
    political_rights: ['restricted_rights', 'cultural_rights', 'all_allowed_rights'],
  },
  conscription: {
    conscription: ['no_draft', 'one_year_draft', 'two_year_draft', 'four_year_draft', 'conscription_by_requirement'],
  },
};

function migrateLegacyLaws(old, legacyCitizenship) {
  const laws = {};
  for (const item of LAWS) {
    let sum = 0;
    let count = 0;
    for (const [ladderId, steps] of Object.entries(LEGACY_LADDERS[item.id])) {
      const at = steps.indexOf(old?.[ladderId]);
      if (at < 0) continue;
      sum += at / (steps.length - 1);
      count++;
    }
    const level = count ? clamp(Math.round((sum / count) * TOP_LEVEL), 0, TOP_LEVEL) : 0;
    laws[item.id] = item.levels[level].id;
  }
  // Vatandaşlık eskiden partinin programıydı; iktidarın ekseni yasadan önce gelir.
  if (LAW_BY_ID.citizenship.levels.some((level) => level.id === legacyCitizenship)) {
    laws.citizenship = legacyCitizenship;
  }
  return laws;
}

/**
 * Eski biçimdeki bir siyaset nesnesini yenisine çevirir (kayıt v20 ve öncesi).
 * Özel sermaye akışı aynen taşınır; seçim ve reform sayaçları düşer.
 */
function migratePolitics(world, nation, old) {
  const fresh = freshPolitics(world, nation);
  const oldRuling = old.parties?.find((party) => party.id === old.rulingPartyId) ?? old.parties?.[0];
  const ideology = LEGACY_IDEOLOGY[oldRuling?.ideology] ?? 'conservative';
  fresh.rulingPartyId = `${nation.id}-${ideology}`;
  if (old.reforms) fresh.laws = migrateLegacyLaws(old.reforms, oldRuling?.policies?.citizenship);
  fresh.privateCapital = Math.max(0, old.privateCapital ?? 0);
  fresh.privateInflow = Math.max(0, old.privateInflow ?? 0);
  fresh.lastPrivateInvestment = old.lastPrivateInvestment ?? null;
  return fresh;
}

/** Doğrulanmış siyaset nesneleri: haftalık çağrı listeyi tekrar dolaşmasın. */
const ready = new WeakSet();

function isCurrentShape(politics) {
  return Boolean(politics?.laws)
    && politics.parties?.length === IDEOLOGY_IDS.length
    && politics.parties.every((party, index) => party.ideology === IDEOLOGY_IDS[index]);
}

export function ensurePolitics(world) {
  for (const nation of world.nations) {
    const current = nation.politics;
    if (current && ready.has(current)) continue;
    let politics = current;
    if (!politics) politics = freshPolitics(world, nation);
    else if (!isCurrentShape(politics)) politics = migratePolitics(world, nation, politics);
    // Alan alan doğrulama: kayıttan dönen nesne elle bozulmuş olabilir.
    for (const party of politics.parties) {
      party.name = PARTIES[party.ideology].name;
      party.support = Number.isFinite(party.support) ? Math.max(0, party.support) : 0;
    }
    if (!politics.parties.some((party) => party.id === politics.rulingPartyId)) {
      politics.rulingPartyId = politics.parties[0].id;
    }
    for (const item of LAWS) {
      if (levelIndex(item, politics.laws[item.id]) < 0) politics.laws[item.id] = item.levels[0].id;
    }
    politics.lawLocks ??= {};
    politics.governmentLockUntil = Number.isFinite(politics.governmentLockUntil) ? politics.governmentLockUntil : 0;
    politics.lastLawChange = Number.isFinite(politics.lastLawChange) ? politics.lastLawChange : -LAW_TERM;
    politics.privateCapital = Math.max(0, politics.privateCapital ?? 0);
    politics.privateInflow = Math.max(0, politics.privateInflow ?? 0);
    politics.lastPrivateInvestment ??= null;
    nation.politics = politics;
    ready.add(politics);
    // Yeni kurulan ya da göçen nesne ekrana 0% ile düşmesin.
    if (politics !== current && nation.alive) updateNationSupport(nation);
  }
}

export function initPolitics(world) {
  for (const nation of world.nations) nation.politics = null;
  ensurePolitics(world);
  updatePoliticalSupport(world);
}

/* --------------------------------------------------------------------------
   DESTEK VE MEŞRUİYET
   -------------------------------------------------------------------------- */

/**
 * KİMİN SESİNİN SAYILDIĞI anayasadan gelir — eski oy hakkı tablosunun üç
 * kademeye inmiş hâli. Mutlak monarşide saray (seçkin ağır, burjuva hafif),
 * meşrutiyette mülk sahibi (sayım usulü oy), demokraside herkes. Böylece
 * demokratikleşmenin siyasi faturası da modelin içinde: halk sosyaliste
 * yakınsa, muhafazakâr hükûmet sandığı açınca meşruiyetini kaybeder.
 *
 * İki ölçüm bu tabloyu kurdu:
 *  - Meşrutiyet alt sınıfı da saydığında ({1,2,3}) 30 haftada 30 ülkenin 9'u
 *    sosyalist demokrasiye geçti — tam da meşrutiyetle başlayan %30.
 *  - Mutlak monarşi orta sınıfı yarım saydığında ({0,.5,3}) liberal ilk yılda
 *    dünyanın %60'ını aldı: üst sınıf ilk yılda alt sınıfa oranla 0.064'ten
 *    0.016'ya iniyor, orta sınıf onu dokuz kat geçiyor. Yalnız seçkin
 *    sayılınca muhafazakâr 55 ülkenin 49'unda önde (backing-probe, 2 tohum).
 */
const BACKING_WEIGHTS = [
  { lower: 0, middle: 0, upper: 1 },
  { lower: 0, middle: 1, upper: 1 },
  { lower: 1, middle: 1, upper: 1 },
];

/** Anayasa kademesine göre kimin desteğinin sayıldığı — ekran cümlesi. */
export const BACKING_NOTE = [
  'Under absolute rule only the elite counts.',
  'Under a constitutional charter property votes: the middle and upper classes count, the lower classes do not.',
  'Under democracy every adult counts once.',
];

const RADICAL = new Set(['socialist', 'nationalist']);
const MODERATE = new Set(['conservative', 'liberal']);

function supportScore(nation, party, ruling, weights) {
  let score = 0;
  for (const classId of CLASS_IDS) {
    const socialClass = nation.economy?.classes?.[classId];
    const weight = weights[classId];
    if (!socialClass || !weight) continue;
    let affinity = CLASS_IDEOLOGY[classId][party.ideology] ?? 0.02;
    const satisfaction = socialClass.satisfaction ?? 0.5;
    // Yoksul ve öfkeli sınıf radikale, müreffeh sınıf düzene kayar.
    if (satisfaction < 0.4 && RADICAL.has(party.ideology)) {
      affinity *= 1 + (0.4 - satisfaction) * 2.4;
    }
    if (satisfaction > 0.58 && MODERATE.has(party.ideology)) {
      affinity *= 1 + (satisfaction - 0.58) * 1.4;
    }
    score += Math.max(0, socialClass.population ?? 0) * affinity * weight;
  }
  // SAVAŞ İKTİDARA FATURA KESER. Yıpratan savaş ve işgal iktidar partisinin
  // desteğini oyar; meşruiyet üzerinden istikrara da yansır.
  if (ruling && party.id === ruling.id) {
    const strain = clamp(nation.economy?.warStrain ?? 0, 0, 1);
    const occupied = clamp(nation.economy?.occupiedShare ?? 0, 0, 1);
    score *= 1 - Math.min(0.45, strain * 0.3 + occupied * 0.4);
  }
  return score;
}

function updateNationSupport(nation) {
  const parties = nation.politics?.parties;
  if (!parties?.length) return;
  const ruling = rulingParty(nation);
  const weights = BACKING_WEIGHTS[lawIndex(nation, 'constitution')];
  let total = 0;
  const scores = parties.map((party) => {
    const score = supportScore(nation, party, ruling, weights);
    total += score;
    return score;
  });
  parties.forEach((party, index) => {
    // Sınıf verisi henüz yoksa (dünya kuruluşu) destek eşit bölünür.
    party.support = total > 0 ? (scores[index] / total) * 100 : 100 / parties.length;
  });
}

export function updatePoliticalSupport(world) {
  ensurePolitics(world);
  for (const nation of world.nations) {
    if (nation.alive) updateNationSupport(nation);
  }
}

/** İstikrardan düşen pay / destek farkı (0–1). */
export const LEGITIMACY_WEIGHT = 0.25;

/**
 * MEŞRUİYET — seçimin yerine geçen tek kural. İktidar, halkın en çok
 * desteklediği partinin gerisinde kaldığı fark kadar istikrar kaybeder.
 * İktidar zaten en çok desteklenen partiyse bedel sıfırdır.
 *
 * `hit` istikrara doğrudan eklenen negatif sayıdır (economy.updateStability).
 */
export function legitimacyOf(nation) {
  const parties = nation?.politics?.parties;
  const ruling = rulingParty(nation);
  if (!parties?.length || !ruling) return { ruling: null, leader: null, gap: 0, hit: 0 };
  let leader = ruling;
  for (const party of parties) {
    if (party.support > leader.support) leader = party;
  }
  const gap = Math.max(0, leader.support - ruling.support) / 100;
  return { ruling, leader, gap, hit: -gap * LEGITIMACY_WEIGHT };
}

/** Halkın ideoloji dağılımı: ağırlık yok, herkes bir. Nüfus ekranı okur. */
export function peopleMix(nation) {
  const totals = new Map();
  let sum = 0;
  for (const classId of CLASS_IDS) {
    const mass = Math.max(0, nation.economy?.classes?.[classId]?.population ?? 0);
    if (mass <= 0) continue;
    for (const [ideologyId, share] of Object.entries(CLASS_IDEOLOGY[classId])) {
      totals.set(ideologyId, (totals.get(ideologyId) ?? 0) + mass * share);
      sum += mass * share;
    }
  }
  if (sum <= 0) return [];
  return [...totals]
    .map(([id, value]) => ({ id, name: IDEOLOGIES[id]?.name ?? id, share: value / sum }))
    .sort((a, b) => b.share - a.share);
}

/* --------------------------------------------------------------------------
   HÜKÛMET BİÇİMİ — ayrı bir alan değil, anayasanın okunuşu
   -------------------------------------------------------------------------- */

const AUTOCRACY = {
  conservative: 'Absolute Monarchy',
  nationalist: 'Absolute Monarchy',
  liberal: 'Presidential Dictatorship',
  socialist: 'Presidential Dictatorship',
};

export function governmentType(nation) {
  const level = lawIndex(nation, 'constitution');
  if (level >= 2) return 'Democracy';
  if (level === 1) return 'Constitutional Monarchy';
  return AUTOCRACY[rulingParty(nation)?.ideology] ?? 'Absolute Monarchy';
}

/* --------------------------------------------------------------------------
   KARARLAR — hükûmet kurmak ve yasa değiştirmek

   Oyuncu, YZ ve devredilmiş kabine aynı iki fonksiyondan geçer. Engel her
   zaman ADIYLA döner: gri düğme nedenini söylemezse oyuncu neyi bekleyeceğini
   bilemez.
   -------------------------------------------------------------------------- */

export function governmentBlocker(world, nation, partyId) {
  const party = nation?.politics?.parties?.find((item) => item.id === partyId);
  if (!party) return 'No such party';
  if (party.id === nation.politics.rulingPartyId) return 'Already in government';
  const wait = governmentLockWeeks(world, nation);
  if (wait > 0) return `The government's term runs another ${wait} week${wait === 1 ? '' : 's'}`;
  return null;
}

/** Programın tek satırlık özeti: kart ve haber aynı cümleyi kullanır. */
export function programmeSummary(ideology) {
  const programme = PARTIES[ideology];
  if (!programme) return '';
  const rules = programme.policies.economy === 'laissez_faire' ? 'private factories only'
    : programme.policies.economy === 'planned_economy' ? 'state factories only'
      : 'state and private factories';
  const trade = programme.policies.trade === 'free_trade' ? 'free trade' : 'protection';
  return `${rules} · ${trade} · army up to ${ARMY_CAP[programme.policies.military] ?? 100}%`;
}

/**
 * Hükûmeti kurar. Dört yıllık kilit başlar; bütçe bantları ve yasa tavanları
 * hemen bağlar. `force` yalnız tanılama betikleri içindir (kilidi atlar).
 */
export function formGovernment(game, nation, partyId, { force = false } = {}) {
  const world = game?.world;
  const politics = nation?.politics;
  const party = politics?.parties?.find((item) => item.id === partyId);
  if (!party || party.id === politics.rulingPartyId) return false;
  if (!force && governmentLockWeeks(world, nation) > 0) return false;
  const previous = rulingParty(nation);
  const turn = world?.turn ?? 0;
  politics.rulingPartyId = party.id;
  politics.governmentSince = turn;
  politics.governmentLockUntil = turn + GOVERNMENT_TERM;
  applyGovernmentLimits(nation, game);
  refreshLawModifiers(nation);
  // Kimin sesi sayılır, anayasa kırpıldıysa hemen değişir: destek ekranı bir
  // hafta eski hükûmetin tablosunu göstermesin.
  updateNationSupport(nation);

  const suspended = LAWS
    .filter((item) => chosenLawIndex(nation, item.id) > lawIndex(nation, item.id))
    .map((item) => `${item.levels[chosenLawIndex(nation, item.id)].name} ${item.name.toLowerCase()}`);
  if (game) {
    announce(game, nation, {
      kind: 'POLITICS',
      tier: TIER.MAJOR,
      key: 'government',
      title: `${party.name} form the government${previous && previous.id !== party.id ? `, replacing the ${previous.name}` : ''}`,
      detail: `${programmeSummary(party.ideology)}.${suspended.length
        ? ` Suspended by its programme: ${suspended.join(', ')}.` : ''} The next change of government is possible in four years.`,
    });
    game.emit?.('politics', turn);
  }
  return true;
}

export function lawChangeBlocker(world, nation, lawId, levelId) {
  const item = LAW_BY_ID[lawId];
  if (!item || !nation?.politics) return 'No such law';
  const index = levelIndex(item, levelId);
  if (index < 0) return 'No such level';
  const cap = lawCap(nation, lawId);
  if (index > cap) {
    const ruling = rulingParty(nation);
    return `The ${ruling?.name ?? 'government'}' programme stops at ${item.levels[cap].name}`;
  }
  if (index === chosenLawIndex(nation, lawId)) return 'Already in force';
  const wait = lawLockWeeks(world, nation, lawId);
  if (wait > 0) return `Changed recently — again in ${wait} week${wait === 1 ? '' : 's'}`;
  return null;
}

/** Yasayı kademeye getirir; kapı kapalıysa hiçbir şey olmaz ve `false` döner. */
export function setLaw(game, nation, lawId, levelId) {
  const world = game?.world;
  if (lawChangeBlocker(world, nation, lawId, levelId)) return false;
  const item = LAW_BY_ID[lawId];
  const turn = world?.turn ?? 0;
  const before = lawIndex(nation, lawId);
  const politics = nation.politics;
  politics.laws[lawId] = levelId;
  politics.lawLocks[lawId] = turn + LAW_TERM;
  politics.lastLawChange = turn;
  // Çarpanlar hemen tazelenir: haftalık faz beklenirse yasa bir hafta boyunca
  // yürürlükte ama etkisiz görünür.
  refreshLawModifiers(nation);
  if (lawId === 'constitution') updateNationSupport(nation);
  if (game) {
    const level = item.levels[lawIndex(nation, lawId)];
    announce(game, nation, {
      kind: 'POLITICS',
      tier: TIER.MAJOR,
      key: `law-${lawId}`,
      title: `${item.name} ${before < level.index ? 'raised' : 'lowered'} to ${level.name}`,
      detail: level.effect,
    });
    game.emit?.('politics', turn);
  }
  return true;
}

/* --------------------------------------------------------------------------
   YZ — hükûmet ve yasa gündemi. Devredilmiş oyuncu kabinesi de bunları okur.
   -------------------------------------------------------------------------- */

/**
 * YZ'nin hükûmet tercihi: hükûmet tam bir dönem görev yaptıysa ve halk başka
 * bir partiyi anayasanın istediği farkla öndeyse o parti.
 */
export function preferredGovernment(world, nation) {
  const politics = nation?.politics;
  if (!politics || governmentLockWeeks(world, nation) > 0) return null;
  if ((world?.turn ?? 0) - (politics.governmentSince ?? 0) < GOVERNMENT_TERM) return null;
  const { ruling, leader } = legitimacyOf(nation);
  if (!ruling || !leader || leader.id === ruling.id) return null;
  const margin = SWITCH_MARGIN[lawIndex(nation, 'constitution')];
  return leader.support - ruling.support >= margin ? leader : null;
}

/**
 * Programın istediği yöndeki TEK adım: bir yasa, bir kademe, yalnız YUKARI.
 * YZ yılda bir yasadan fazlasını değiştirmez (eski meclis yavaşlığının
 * karşılığı) ve yasa GERİ ALMAZ — eski merdivenler de geri gitmiyordu;
 * hükûmet değiştikçe birbirinin yasasını söken dünya sarkaç gibi sallanır.
 * Programın tavanı yine bağlar (lawCap).
 */
export function nextLawStep(world, nation) {
  const programme = programmeOf(nation);
  if (!programme) return null;
  if ((world?.turn ?? 0) - (nation.politics.lastLawChange ?? -LAW_TERM) < LAW_TERM) return null;
  for (const item of LAWS) {
    if (lawLockWeeks(world, nation, item.id) > 0) continue;
    const current = lawIndex(nation, item.id);
    if (current >= programme.laws[item.id].prefer) continue;
    return { lawId: item.id, levelId: item.levels[current + 1].id };
  }
  return null;
}

/* --------------------------------------------------------------------------
   BANTLAR VE ÖZEL SERMAYE — haftalık faz
   -------------------------------------------------------------------------- */

/**
 * Hükûmet değişince bütçe kaydıraçları yeni bandın içine çekilir. Kırpma
 * İSTENEN değere uygulanır, yerinde ezmez: istenen değer setBudgetPolicy'de
 * yazılır (economy.*Wanted) ve band genişleyince geri döner.
 */
function applyGovernmentLimits(nation, game = null) {
  if (!nation.economy) return;
  const limits = fiscalPolicyLimits(nation);
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
      title: `The ${party?.name ?? 'government'} hold army funding at ${economy.armyFunding}%`,
      detail: `Their programme allows ${limits.armySpendingMin}–${limits.armySpendingMax}%; your ${economy.armyFundingWanted}% returns under a government that allows it.`,
    });
  }
  if (economy.tariff !== before.tariff
    && economy.tariff !== (economy.tariffWanted ?? before.tariff)) {
    announce(game, nation, {
      kind: 'POLITICS', tier: TIER.IMPORTANT, key: 'band-tariff',
      title: `The ${party?.name ?? 'government'} hold the tariff at ${economy.tariff}%`,
      detail: `Their programme allows ${limits.tariffMin}–${limits.tariffMax}%; your ${economy.tariffWanted}% returns under a government that allows it.`,
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
  const room = Math.max(0, 1200 - nation.politics.privateCapital);
  nation.politics.privateCapital += Math.min(Math.max(0, inflow), room);
  // KAPITALISTIN GUCU BAKIYE DEGIL AKISTIR. Havuz her hafta bosaliyor (gelen
  // para ayni hafta santiyeye gidiyor), dolayisiyla bakiyeye bakan bir kapi
  // ulkeyi surekli "bes parasiz" okur. Yatirim kapisi (economy.runPrivateSector)
  // bunu okur. Ceyrek yillik duzlestirme: tek haftanin kar sicramasi taahhut
  // ettirmesin.
  const smoothed = nation.politics.privateInflow;
  nation.politics.privateInflow = Number.isFinite(smoothed) && smoothed > 0
    ? smoothed + (inflow - smoothed) / 12
    : Math.max(0, inflow);
}

export function runPolitics(game) {
  const world = game.world;
  updatePoliticalSupport(world);
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    collectPrivateCapital(nation);
    applyGovernmentLimits(nation, game);
  }
  game.emit('politics', world.turn);
}

/* --------------------------------------------------------------------------
   YASALARIN SİMÜLASYON KARŞILIĞI

   MİMARİ KARARI — çarpanlar haftada BİR KEZ (ve yasa ya da hükûmet değişince)
   hesaplanır, ulus başına bir nesneye yazılır; sıcak yol yalnız düz alan okur.
   Sıcak yoldan hesaplamak haftalık tahsisatı 8.7 MB'den 32.6 MB'ye çıkarmıştı
   (ölçüldü, AUTONOMOUS_DEV_REPORT.md).

   TASARIM KURALLARI
   1. Her yasanın kazananı ve kaybedeni var. İşçi hakkı işçiyi memnun eder,
      bordroyu büyütür; refah halkı tutar, hazineye kısılamaz yük bindirir.
   2. Katsayılar eski merdivenlerin toplamıdır: yasa tavandayken, katlandığı
      bütün merdivenler tavandaymış gibi davranır. Denge yeniden yazılmadı.
   -------------------------------------------------------------------------- */

/**
 * Turetilmis carpanlar KAYDA GIRMEZ: kayda sizan turetilmis veri yukleme
 * sonrasi simulasyonu dallandiriyordu (save-audit). WeakMap ile kayit bicimi
 * degismez; yuklemede save.js her ulus icin yeniden hesaplar.
 */
const modsByNation = new WeakMap();

export const NEUTRAL_MODIFIERS = Object.freeze({
  lowerMood: 0, middleMood: 0, upperMood: 0,
  throughput: 1, wageCost: 1, socialBurden: 0,
  // Askerlik yasasinin insan gucu carpani (recruitment.js okur).
  manpower: 1,
  // Refah yasasinin okuryazarlik TABANI (economy.js `literacyTargetOf` okur).
  literacyFloor: 0,
  // Anayasanin (basin ozgurlugu) arastirma carpani (technology.js okur).
  researchRate: 0,
  // Vatandaslik yasasinin tasra sadakat TAVANI (provinces.js okur).
  minorityCeiling: 1,
});

/**
 * SAF ÇEKİRDEK: yasa ilerlemelerinden (0–1) çarpanları kurar, hiçbir şey
 * saklamaz. Ayrı durur çünkü ekranın "bu kademe ne verir" sorusu VARSAYIMSAL
 * bir yasa setiyle aynı hesabı ister (bkz. lawPreview) — ekran katsayı
 * bilseydi vaadi ile motorun gerçeği ilk denge değişikliğinde ayrışırdı.
 */
export function computeLawModifiers(progress) {
  const constitution = progress.constitution ?? 0;
  const labour = progress.labour ?? 0;
  const welfare = progress.welfare ?? 0;
  const citizenship = progress.citizenship ?? 0;
  const draft = progress.conscription ?? 0;
  // Kölelik işçi hakkının en alt kademesinde yasaldır: emek ucuz, alt sınıf
  // ezilir. Hak yükseldikçe kalkar.
  const slavery = 1 - labour;
  return {
    // İşçi hakkı: saat .13 + güvenlik .07 + çocuk .06 + asgari ücret .11 +
    // sendika .07. Refah: işsizlik .12 + emeklilik .10 + sağlık .10.
    // Anayasa (temsil) .22. Askerlik ve kölelik halka yüktür.
    lowerMood: labour * 0.44 + welfare * 0.32 + constitution * 0.22
      - draft * 0.06 - slavery * 0.08,
    // Orta sınıfın siyasi kanalı: temsil .16 + basın .07, azınlık hakları .09,
    // sağlık .02.
    middleMood: constitution * 0.23 + citizenship * 0.09 + welfare * 0.02,
    // Seçkin faturayı öder: ücret .05 + güvenlik .03 + sendika .04, temsil .12.
    upperMood: -(labour * 0.12 + constitution * 0.12),
    // Kısa gün ve güvenli makine üretimi biraz yavaşlatır.
    throughput: 1 - labour * 0.054,
    // Ücret .14 + sendika .05 + saat .06 + güvenlik .04; kölelik bordroyu
    // %10 ucuzlatır.
    wageCost: 1 + labour * 0.29 - slavery * 0.10,
    // Sosyal yasa KAYDIRAÇTAN AYRI bir taahhüttür: kaydıraç isteğe bağlı
    // harcama, yasa kısılamaz. İşsizlik .10 + emeklilik .12 + sağlık .10 +
    // okul .09.
    socialBurden: welfare * 0.41,
    // Seferberlik havuzu: gönüllü orduda 0.85, seferber ulusta 1.30.
    manpower: 0.85 + draft * 0.45,
    // OKUL — bütçe TAVANI belirler, yasa TABANI. İkisi toplanmaz.
    literacyFloor: welfare * 0.35,
    // BASIN — sansürlü ülke aynı okuryazarlıkla daha az araştırır.
    researchRate: constitution * 0.25,
    // AZINLIK HAKLARI — yabancı kültürlü taşranın ulaşabileceği en yüksek
    // sadakat. Hız değil tavan: üretim sadakatle ölçeklenir (provinces.js).
    minorityCeiling: 0.7 + citizenship * 0.3,
  };
}

function lawProgress(nation, overrides = null) {
  const progress = {};
  for (const item of LAWS) {
    const index = overrides?.[item.id] ?? lawIndex(nation, item.id);
    progress[item.id] = index / TOP_LEVEL;
  }
  return progress;
}

/** Ulusun güncel çarpanlarını hesaplar ve önbelleğe yazar. */
export function refreshLawModifiers(nation) {
  if (!nation?.politics) return NEUTRAL_MODIFIERS;
  const mods = computeLawModifiers(lawProgress(nation));
  modsByNation.set(nation, mods);
  return mods;
}

/** Sıcak yolun okuduğu tek şey. HESAP YAPMAZ. */
export function lawModifiers(nation) {
  return modsByNation.get(nation) ?? NEUTRAL_MODIFIERS;
}

/** Sınıfa göre memnuniyet kayması. */
export function lawMoodShift(nation, classId) {
  const mods = lawModifiers(nation);
  if (classId === 'lower') return mods.lowerMood;
  if (classId === 'middle') return mods.middleMood;
  return mods.upperMood;
}

/**
 * BU KADEME NE VERİR — ölçülmüş cevap. Kademe yürürlükteymiş gibi çarpanlar
 * yeniden kurulur ve bugünküyle FARKI döner. Ekran hiçbir katsayı bilmez.
 */
export function lawPreview(nation, lawId, index) {
  if (!LAW_BY_ID[lawId]) return null;
  const now = computeLawModifiers(lawProgress(nation));
  const after = computeLawModifiers(lawProgress(nation, { [lawId]: index }));
  const delta = {};
  for (const key of Object.keys(after)) {
    const change = (after[key] ?? 0) - (now[key] ?? 0);
    if (Math.abs(change) > 0.0005) delta[key] = change;
  }
  return delta;
}

/* --------------------------------------------------------------------------
   EKRAN VERİSİ — ekran yalnız çizer, hiçbir eşik hesaplamaz
   -------------------------------------------------------------------------- */

export function governmentView(world, nation) {
  const ruling = rulingParty(nation);
  const legitimacy = legitimacyOf(nation);
  const lock = governmentLockWeeks(world, nation);
  const parties = (nation.politics?.parties ?? []).map((party) => {
    const programme = PARTIES[party.ideology];
    return {
      id: party.id,
      ideology: party.ideology,
      name: party.name,
      color: IDEOLOGIES[party.ideology]?.color ?? '#7b7568',
      pitch: programme.pitch,
      summary: programmeSummary(party.ideology),
      support: party.support,
      ruling: party.id === ruling?.id,
      leader: party.id === legitimacy.leader?.id,
      caps: LAWS.map((item) => ({
        lawId: item.id,
        law: item.name,
        max: programme.laws[item.id].max,
        cap: item.levels[programme.laws[item.id].max].name,
      })),
      blocked: governmentBlocker(world, nation, party.id),
      // Bu partiyle hükûmet kurulsaydı istikrardan düşecek pay.
      hit: -Math.max(0, (legitimacy.leader?.support ?? 0) - party.support) / 100 * LEGITIMACY_WEIGHT,
    };
  });
  return {
    government: governmentType(nation),
    ruling: parties.find((party) => party.ruling) ?? null,
    parties,
    legitimacy: {
      backing: (ruling?.support ?? 0) / 100,
      leader: parties.find((party) => party.leader) ?? null,
      gap: legitimacy.gap,
      hit: legitimacy.hit,
      note: BACKING_NOTE[lawIndex(nation, 'constitution')],
    },
    lockWeeks: lock,
    lockTurn: nation.politics?.governmentLockUntil ?? 0,
    term: GOVERNMENT_TERM,
  };
}

export function lawBoard(world, nation) {
  return LAWS.map((item) => {
    const chosen = chosenLawIndex(nation, item.id);
    const current = lawIndex(nation, item.id);
    const cap = lawCap(nation, item.id);
    return {
      law: item,
      chosen,
      current,
      cap,
      suspended: chosen > current,
      lockWeeks: lawLockWeeks(world, nation, item.id),
      levels: item.levels.map((level) => ({
        ...level,
        state: level.index === current ? 'current'
          : level.index > cap ? 'beyond'
            : 'open',
        wanted: level.index === chosen && chosen !== current,
        blocked: lawChangeBlocker(world, nation, item.id, level.id),
        delta: level.index === current ? null : lawPreview(nation, item.id, level.index),
      })),
    };
  });
}
