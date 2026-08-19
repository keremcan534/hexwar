// Reform defteri: yasa merdivenleri, üst meclis oylaması ve seçmen kütüğü.
//
// Victoria 2'nin Politics penceresindeki üç sütun burada tanımlıdır: Social
// Reforms, Political Reforms, Matters of State. Her yasa bir MERDİVENDİR —
// kademeler tek yönlü sıralıdır, ileri yön daima daha özgürlükçü olandır ve
// oyuncu yalnız bir sonraki basamağa çıkabilir. Atlamak, geri dönmek yok.
//
// Kapı üst meclistir. Bir kademeyi çıkarabilmek için o kademeyi İSTEYEN
// ideolojilerin meclisteki payı %50'yi geçmeli. Meclisin bileşimi de bir
// yasadır (upper_house): "Ruling Party Only" mecliste tek ses bırakır,
// "Based on Population" halkı yansıtır. Yani yasa yasayı açar — ekranın
// gerçek mekaniği budur.
//
// Bu dosya DOM bilmez ve ekonomiye DOKUNMAZ. Yasaların iktisadi karşılığını
// bağlama denemesi ölçümle geri alındı: haftalık tahsisat 8.7 MB'den
// 32.6 MB'ye, tur süresi 22 ms'den 43 ms'ye çıkıyordu (bkz.
// AUTONOMOUS_DEV_REPORT.md). Bağ, sıcak yol maliyeti çözüldükten sonra
// yeniden kurulmalı.
//
// Katman: game/politics.js'ten okur, kimse buradan politics.js'e dönmez.

import { makeRng } from '../core/rng.js';
import { CLASS_IDEOLOGY, IDEOLOGIES, POLITICAL_POLICIES, rulingParty } from './politics.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/* --------------------------------------------------------------------------
   YASA MERDİVENLERİ
   -------------------------------------------------------------------------- */

export const REFORM_CATEGORIES = {
  social: { id: 'social', name: 'Social Reforms' },
  political: { id: 'political', name: 'Political Reforms' },
  state: { id: 'state', name: 'Matters of State' },
};

/**
 * Merdiven kurucusu: kademe adları sırayla, ilk ad daima "yasa yok" halidir.
 *
 * `desire` bu merdivene özel ideoloji tercihidir ve kategori varsayılanını
 * ezer (bkz. IDEOLOGY_DESIRE). Gerekli: liberal siyasi reformu topluca ister
 * ama asgari ücreti istemez, muhafazakâr emekliliği ister ama sendikayı
 * istemez. Tek bir kategori sayısıyla bütün merdivenlerde aynı koalisyon
 * çıkıyordu — hareketler de meclis oyları da birbirinin kopyasıydı.
 */
const ladder = (id, name, category, icon, steps, desire = null) => ({
  id,
  name,
  category,
  icon,
  desire,
  steps: steps.map(([stepId, stepName, effect], index) => ({
    id: stepId, name: stepName, effect, index,
  })),
});

export const REFORMS = [
  // --- Sosyal reformlar: hane bütçesi, fabrika koşulları, okul --------------
  ladder('minimum_wage', 'Minimum Wage', 'social', 'wage', [
    ['no_minimum_wage', 'No Minimum Wage', 'Wages are whatever the factory offers.'],
    ['trinket_minimum_wage', 'Trinket Minimum Wage', 'A token floor under factory wages.'],
    ['low_minimum_wage', 'Low Minimum Wage', 'Lower-class income rises; factory margins narrow.'],
    ['acceptable_minimum_wage', 'Acceptable Minimum Wage', 'Workers can cover their basket in most weeks.'],
    ['good_minimum_wage', 'Good Minimum Wage', 'Wages track the cost of living; industry pays for it.'],
  ], { liberal: 0.25, conservative: 0.20, fascist: 0.50 }),
  ladder('work_hours', 'Max. Work Hours', 'social', 'clock', [
    ['unlimited_work_day', 'Unlimited Work Day', 'The working day ends when the owner says so.'],
    ['fourteen_hour_day', '14 Hour Work Day', 'A first ceiling on the working day.'],
    ['twelve_hour_day', '12 Hour Work Day', 'Output per worker falls, satisfaction rises.'],
    ['ten_hour_day', '10 Hour Work Day', 'The classic demand of the trade unions.'],
    ['eight_hour_day', '8 Hour Work Day', 'Three eights: work, rest, and what you will.'],
  ], { liberal: 0.50, conservative: 0.25, fascist: 0.60 }),
  ladder('safety', 'Safety Regulations', 'social', 'safety', [
    ['no_safety', 'No Safety Regulations', 'The machine is never at fault.'],
    ['minimal_safety', 'Minimal Safety Regulations', 'Guards on the worst machinery.'],
    ['limited_safety', 'Limited Safety Regulations', 'Inspectors may enter the factory floor.'],
    ['regular_safety', 'Regular Safety Regulations', 'Accidents fall; upkeep rises.'],
    ['good_safety', 'Good Safety Regulations', 'The factory answers for the bodies it breaks.'],
  ], { liberal: 0.60, conservative: 0.40, fascist: 0.60, reactionary: 0.15 }),
  ladder('unemployment', 'Unemployment Subsidies', 'social', 'unemployment', [
    ['no_subsidies', 'No Subsidies', 'The unemployed live on charity.'],
    ['trinket_subsidies', 'Trinket Subsidies', 'A parish dole, barely bread.'],
    ['low_subsidies', 'Low Subsidies', 'Idle workers keep part of their basket.'],
    ['extended_subsidies', 'Extended Subsidies', 'Unemployment no longer means hunger.'],
    ['generous_subsidies', 'Generous Subsidies', 'The state carries the jobless; the treasury feels it.'],
  ], { liberal: 0.20, conservative: 0.20, fascist: 0.50 }),
  ladder('pensions', 'Pensions', 'social', 'pension', [
    ['no_pensions', 'No Pensions', 'You work until you cannot.'],
    ['trinket_pensions', 'Trinket Pensions', 'A coin for the oldest of the poor.'],
    ['low_pensions', 'Low Pensions', 'Old age stops being destitution.'],
    ['acceptable_pensions', 'Acceptable Pensions', 'A pension worth retiring on.'],
    ['good_pensions', 'Good Pensions', 'The state keeps its elderly.'],
  ], { liberal: 0.35, conservative: 0.45, fascist: 0.70 }),
  ladder('health_care', 'Health Care', 'social', 'health', [
    ['no_health_care', 'No Health Care', 'Physicians are for those who can pay.'],
    ['trinket_health_care', 'Trinket Healthcare', 'A public ward in the largest cities.'],
    ['low_health_care', 'Low Healthcare', 'Epidemics are fought, not merely counted.'],
    ['acceptable_health_care', 'Acceptable Healthcare', 'Clinics reach the provinces.'],
    ['good_health_care', 'Good Healthcare', 'Care for all; the budget pays every week.'],
  ], { liberal: 0.50, conservative: 0.35, fascist: 0.65 }),
  ladder('school_system', 'School System', 'social', 'school', [
    ['no_schools', 'No School System', 'Literacy is a private accident.'],
    ['basic_schools', 'Basic School System', 'Parish schools teach letters and little else.'],
    ['acceptable_schools', 'Acceptable School System', 'Compulsory schooling in the towns.'],
    ['good_schools', 'Good School System', 'A literate nation, funded out of taxes.'],
  ], { liberal: 0.90, conservative: 0.50, fascist: 0.70, reactionary: 0.15 }),
  ladder('penal_system', 'Penal System', 'social', 'penal', [
    ['capital_punishment', 'Capital Punishment', 'The gallows answers most crimes.'],
    ['transportation', 'Transportation', 'Convicts are shipped out of sight.'],
    ['incarceration', 'Incarceration', 'Prisons replace the rope.'],
    ['rehabilitation', 'Rehabilitation', 'Punishment aims at return, not removal.'],
  ], { liberal: 0.75, conservative: 0.25, fascist: 0, reactionary: 0, socialist: 0.85, communist: 0.70 }),

  // --- Siyasi reformlar: sandık, meclis, ordu, basın ------------------------
  ladder('political_parties', 'Political Parties', 'political', 'party', [
    ['underground_parties', 'Only Underground', 'Parties exist, but never in daylight.'],
    ['harassment', 'Harassment', 'Opposition is legal and hounded.'],
    ['gerrymandering', 'Gerrymandering', 'The map is drawn by the winner.'],
    ['non_secret_ballots', 'Non-Secret Ballots', 'You may vote; your landlord will know how.'],
    ['secret_ballots', 'Secret Ballots', 'The booth closes behind the voter.'],
  ]),
  ladder('upper_house', 'Upper House', 'political', 'house', [
    ['party_appointed', 'Ruling Party Only', 'The chamber is the government by another name.'],
    ['appointed', 'Appointed', 'Seats are granted, and the grantor is the crown.'],
    ['state_equal_weight', 'Two per State', 'Every state sends the same two men, whatever its size.'],
    ['population_equal_weight', 'Based on Population', 'The chamber finally counts heads.'],
  ], { conservative: 0.30, communist: 0.50 }),
  ladder('conscription', 'Conscription', 'political', 'conscript', [
    ['conscription_by_requirement', 'Service by Requirement', 'The army takes whom it needs, when it needs.'],
    ['four_year_draft', 'Four Year Draft', 'Four years taken from every eligible man.'],
    ['two_year_draft', 'Two Year Draft', 'A shorter term; a smaller reserve.'],
    ['one_year_draft', 'One Year Draft', 'One year under arms, then home.'],
    ['no_draft', 'No Draft', 'A volunteer army only.'],
  ], { reactionary: 0, conservative: 0.15, fascist: 0, liberal: 0.85, socialist: 0.95, communist: 0.40 }),
  ladder('vote_franchise', 'Vote Franchise', 'political', 'franchise', [
    ['none_voting', 'No Voting', 'There is no electorate.'],
    ['landed_voting', 'Only Landed', 'Property votes, not people.'],
    ['weighted_wealth_voting', 'Weighted Wealth', 'Everyone with money votes; the rich vote thrice.'],
    ['wealth_voting', 'Wealth', 'Property qualification, equal weight.'],
    ['weighted_universal_voting', 'Weighted Universal', 'All men vote; the rich still count for more.'],
    ['universal_voting', 'Universal', 'One adult, one vote.'],
  ]),
  ladder('voting_system', 'Voting System', 'political', 'ballot', [
    ['first_past_the_post', 'First Past the Post', 'The largest party takes everything.'],
    ['jefferson_method', 'Jefferson Method', 'Seats by quota, rounded to the strong.'],
    ['proportional_representation', 'Proportional Representation', 'The chamber mirrors the returns.'],
  ], { conservative: 0, liberal: 0.60, socialist: 1, communist: 0.50 }),
  ladder('trade_unions', 'Trade Unions', 'political', 'union', [
    ['no_trade_unions', 'Illegal', 'Combination is a crime.'],
    ['state_controlled_unions', 'State Controlled', 'Unions exist and answer to the ministry.'],
    ['non_socialist_unions', 'Non-Socialist Allowed', 'Organise, but not under the red flag.'],
    ['all_trade_unions', 'All Allowed', 'Labour may organise as it pleases.'],
  ], { reactionary: 0, conservative: 0.20, fascist: 0.35, liberal: 0.55, socialist: 1, communist: 1 }),
  ladder('debt_law', 'Debt Law', 'political', 'debt', [
    ['serfdom', 'Serfdom', 'The debtor belongs to the land and to the creditor.'],
    ['peonage', 'Peonage', 'Debt is worked off, generation by generation.'],
    ['debtors_prisons', "Debtor's Prisons", 'The insolvent are jailed, not freed.'],
    ['bankruptcy', 'Bankruptcy', 'Debt can be discharged; capital takes the risk.'],
  ], { reactionary: 0.10, conservative: 0.55, fascist: 0.50, liberal: 1, socialist: 0.90, communist: 0.80 }),
  ladder('slavery', 'Slavery', 'political', 'slavery', [
    ['yes_slavery', 'Allowed', 'Persons are property.'],
    ['freedom_of_womb', 'Freedom of Womb', 'Those born from now on are born free.'],
    ['no_slavery', 'Outlawed', 'The institution is abolished.'],
  ], { reactionary: 0, conservative: 0.45, fascist: 0.30, liberal: 1, socialist: 1, communist: 1 }),
  ladder('public_meetings', 'Public Meetings', 'political', 'meeting', [
    ['no_meeting', 'Meetings Not Allowed', 'Assembly requires permission that is never given.'],
    ['yes_meeting', 'Meetings Allowed', 'The square belongs to whoever fills it.'],
  ]),

  // --- Devlet meseleleri: hane, kimlik, sınır, basın ------------------------
  ladder('child_labor', 'Child Labor', 'state', 'child', [
    ['child_labor_legal', 'Child Labor Legal', 'Small hands reach into small machines.'],
    ['child_labor_restricted', 'Child Labor Restricted', 'Age and hours are capped, and inspected badly.'],
    ['child_labor_illegal', 'Child Labor Illegal', 'The factory floor is closed to children.'],
  ], { conservative: 0.45, fascist: 0.50, liberal: 0.85 }),
  ladder('political_rights', 'Political Rights', 'state', 'rights', [
    ['restricted_rights', 'Restricted Rights', 'Rights follow the ruling culture alone.'],
    ['cultural_rights', 'Cultural Rights', 'Minorities keep their language and schools.'],
    ['all_allowed_rights', 'All Allowed Rights', 'Rights do not ask where you were born.'],
  ], { conservative: 0.30, fascist: 0, liberal: 0.90 }),
  ladder('border_policy', 'Border Policy', 'state', 'border', [
    ['closed_borders', 'Closed Borders', 'Nobody enters, nobody leaves.'],
    ['immigration_quotas', 'Immigration Quotas', 'A measured stream, counted at the port.'],
    ['open_borders', 'Open Borders', 'Migration follows work.'],
  ], { reactionary: 0.10, conservative: 0.40, fascist: 0, liberal: 1, socialist: 0.70, communist: 0.60 }),
  ladder('press_rights', 'Press Rights', 'state', 'press', [
    ['state_press', 'State Press Only', 'One printer, one voice.'],
    ['censored_press', 'Censored Press', 'Print freely, then submit the proofs.'],
    ['free_press', 'Free Press', 'The censor is dismissed.'],
  ], { conservative: 0.25, fascist: 0, liberal: 1, socialist: 0.90, communist: 0.40 }),
];

export const REFORM_BY_ID = Object.fromEntries(REFORMS.map((group) => [group.id, group]));

/** Kategorinin merdivenleri, ekranın sütun sırasıyla. */
export function reformsIn(category) {
  return REFORMS.filter((group) => group.category === category);
}

/* --------------------------------------------------------------------------
   İDEOLOJİLERİN İSTEDİĞİ NOKTA

   Her ideolojinin her merdivende durmak istediği yer, merdiven boyunun oranı
   olarak. Vic2'nin reform başına ideoloji destek tablosunun sıkıştırılmışı:
   liberal siyasi reformu ister ama sosyal reformu ancak ılımlı destekler,
   komünist sandığa liberalden az değer verir, faşist ikisini de istemez.

   Bir ideoloji, istediği nokta hedef kademeye ULAŞIYORSA o kademeyi destekler.
   Böylece "%50'yi geçen destek" tek bir toplama işine iner.
   -------------------------------------------------------------------------- */
const IDEOLOGY_DESIRE = {
  reactionary: { social: 0.00, political: 0.00, state: 0.00 },
  conservative: { social: 0.25, political: 0.20, state: 0.30 },
  fascist: { social: 0.45, political: 0.00, state: 0.10 },
  liberal: { social: 0.40, political: 0.95, state: 0.90 },
  socialist: { social: 1.00, political: 0.85, state: 1.00 },
  communist: { social: 1.00, political: 0.35, state: 1.00 },
};

/** İdeolojinin bu merdivende durmak istediği kademe. */
export function desiredIndex(group, ideologyId) {
  const desire = group.desire?.[ideologyId]
    ?? IDEOLOGY_DESIRE[ideologyId]?.[group.category] ?? 0.2;
  return Math.round(desire * (group.steps.length - 1));
}

/* --------------------------------------------------------------------------
   DURUM — nation.politics.reforms

   Kayıt politics nesnesinin içinde yaşar; save.js zaten `n.politics`i olduğu
   gibi yazıyor, dolayısıyla ayrı bir kayıt alanı gerekmez. Eski kayıtlarda
   alan yoktur: ensureReforms başlangıç kademelerini kurar.
   -------------------------------------------------------------------------- */

/**
 * 1836 başlangıcı. Sosyal yasalar hemen hiç yoktur; siyasi yasalar iktidardaki
 * ideolojinin istediği yerin küçük bir kesridir — devrim değil, miras.
 */
const START_REACH = { social: 0.14, political: 0.38, state: 0.34 };

function startIndex(rng, group, ideologyId) {
  const target = desiredIndex(group, ideologyId);
  const reach = target * START_REACH[group.category];
  // Yarım basamaklık dalgalanma: aynı ideolojiyle yönetilen iki ülke aynı
  // yasa listesine sahip olmasın.
  return clamp(Math.round(reach + (rng() < 0.3 ? 1 : 0)), 0, group.steps.length - 1);
}

/**
 * Kurulmuş siyaset nesneleri. Yüklemede politics YENİ bir nesnedir, yani
 * kayıt açıldığında her ulus bir kez daha doğrulanır — istenen davranış.
 */
const ensured = new WeakSet();

export function ensureReforms(nation) {
  const politics = nation?.politics;
  if (!politics) return null;
  // Hızlı yol. Doğrulama 21 merdiveni dolaşıp kademe kimliği arar; bu
  // fonksiyon YZ ve ekran tarafından sık çağrılıyor ve tek başına haftalık
  // tahsisatın 1.9 MB'ını üretiyordu (ölçüldü, alloc-audit).
  if (ensured.has(politics)) return politics.reforms;

  if (!politics.reforms) politics.reforms = {};
  const ideology = rulingParty(nation)?.ideology ?? 'conservative';
  // Tohum ülkeye sabittir: aynı ülke her yüklemede aynı yasalarla başlar.
  const rng = makeRng(`reforms-${nation.id}-${nation.name ?? ''}`);
  for (const group of REFORMS) {
    const saved = politics.reforms[group.id];
    // Kademe adı kayıtta yazılıdır, sırası değil: merdivene yeni basamak
    // eklenirse eski kayıt yanlış yasaya kaymasın. Kapanış yerine düz
    // döngü — findIndex burada çağrı başına 21 kapanış demekti.
    let valid = false;
    if (typeof saved === 'string') {
      for (let i = 0; i < group.steps.length; i++) {
        if (group.steps[i].id === saved) { valid = true; break; }
      }
    }
    if (!valid) {
      politics.reforms[group.id] = group.steps[startIndex(rng, group, ideology)].id;
    }
  }
  politics.reformLog ??= [];
  // Eski kayıtlarda bu alanlar yok: reform hemen mümkün, yorgunluk sıfır.
  politics.reformCooldown ??= 0;
  politics.reformFatigue ??= 0;
  ensured.add(politics);
  return politics.reforms;
}

/** Yürürlükteki kademe. */
export function currentStep(nation, groupId) {
  const group = REFORM_BY_ID[groupId];
  if (!group) return null;
  const reforms = ensureReforms(nation);
  const id = reforms?.[groupId];
  return group.steps.find((step) => step.id === id) ?? group.steps[0];
}

/** Yürürlükteki kademenin kimliği — yasa okuyan sistemler için kısa yol. */
export function reformValue(nation, groupId) {
  return currentStep(nation, groupId)?.id ?? null;
}

/* --------------------------------------------------------------------------
   SINIF KARIŞIMLARI — meclis, seçmen, halk

   Üçü de aynı işi yapar: sınıf nüfuslarını ağırlıklandırıp CLASS_IDEOLOGY
   üzerinden ideoloji payına çevirir. Fark ağırlıklardadır ve ağırlıkları
   YASALAR belirler (upper_house, vote_franchise). Ekrandaki üç pasta bu
   yüzden birbirinden farklı çıkar.
   -------------------------------------------------------------------------- */

const CLASS_IDS = ['lower', 'middle', 'upper'];

function classPopulation(nation, classId) {
  return Math.max(0, nation.economy?.classes?.[classId]?.population ?? 0);
}

/** Ağırlıklı sınıf karışımından ideoloji payları. Toplam 1'e normalize. */
function ideologyMix(nation, weights) {
  const totals = new Map();
  let sum = 0;
  for (const classId of CLASS_IDS) {
    const mass = classPopulation(nation, classId) * (weights[classId] ?? 0);
    if (mass <= 0) continue;
    for (const [ideologyId, share] of Object.entries(CLASS_IDEOLOGY[classId])) {
      totals.set(ideologyId, (totals.get(ideologyId) ?? 0) + mass * share);
      sum += mass * share;
    }
  }
  if (sum <= 0) return [];
  return [...totals]
    .map(([id, value]) => ({
      id, name: IDEOLOGIES[id]?.name ?? id, share: value / sum,
    }))
    .filter((slice) => slice.share > 0.0005)
    .sort((a, b) => b.share - a.share);
}

/** Oy hakkı yasasının sınıf ağırlıkları. Kütük yasadan doğar. */
const FRANCHISE_WEIGHTS = {
  none_voting: { lower: 0, middle: 0, upper: 0 },
  landed_voting: { lower: 0, middle: 0, upper: 1 },
  weighted_wealth_voting: { lower: 0, middle: 1, upper: 3 },
  wealth_voting: { lower: 0, middle: 1, upper: 1 },
  weighted_universal_voting: { lower: 1, middle: 2, upper: 3 },
  universal_voting: { lower: 1, middle: 1, upper: 1 },
};

/** Üst meclis yasasının sınıf ağırlıkları; "Ruling Party Only" ayrı ele alınır. */
const HOUSE_WEIGHTS = {
  appointed: { lower: 0, middle: 0.35, upper: 1 },
  // İki üye/eyalet: küçük kırsal eyaletler büyük sanayi eyaletiyle eşit sayılır,
  // yani toprak sahibi taşra mecliste orantısız güçlüdür.
  state_equal_weight: { lower: 0.55, middle: 0.6, upper: 1 },
  population_equal_weight: { lower: 1, middle: 1, upper: 1 },
};

/**
 * Üst meclisin bileşimi. "Ruling Party Only" mecliste tek ideoloji bırakır;
 * "Appointed" iktidarı korur ama üst sınıfa da yer verir. Reform kapısı bu
 * listeden geçtiği için meclis yasası bütün öbür yasaların anahtarıdır.
 */
export function upperHouse(nation) {
  ensureReforms(nation);
  const law = reformValue(nation, 'upper_house');
  const ruling = rulingParty(nation)?.ideology ?? 'conservative';
  if (law === 'party_appointed') {
    return [{ id: ruling, name: IDEOLOGIES[ruling]?.name ?? ruling, share: 1 }];
  }
  const mix = ideologyMix(nation, HOUSE_WEIGHTS[law] ?? HOUSE_WEIGHTS.population_equal_weight);
  if (law !== 'appointed' || !mix.length) return mix;
  // Atanmış meclis: koltukların yarısı doğrudan iktidarındır, kalanı üst
  // sınıfın eğilimini yansıtır.
  const held = 0.5;
  const merged = new Map(mix.map((slice) => [slice.id, slice.share * (1 - held)]));
  merged.set(ruling, (merged.get(ruling) ?? 0) + held);
  return [...merged]
    .map(([id, share]) => ({ id, name: IDEOLOGIES[id]?.name ?? id, share }))
    .filter((slice) => slice.share > 0.0005)
    .sort((a, b) => b.share - a.share);
}

/** Seçmen kütüğünün ideoloji dağılımı. Oy hakkı yoksa liste boştur. */
export function voterMix(nation) {
  ensureReforms(nation);
  const weights = FRANCHISE_WEIGHTS[reformValue(nation, 'vote_franchise')]
    ?? FRANCHISE_WEIGHTS.none_voting;
  return ideologyMix(nation, weights);
}

/** Halkın ideoloji dağılımı: ağırlık yok, herkes bir. */
export function peopleMix(nation) {
  return ideologyMix(nation, { lower: 1, middle: 1, upper: 1 });
}

/** Seçmen sayısı ve nüfusa oranı — kütüğün büyüklüğü de bir yasa sonucudur. */
export function electorate(nation) {
  ensureReforms(nation);
  const weights = FRANCHISE_WEIGHTS[reformValue(nation, 'vote_franchise')]
    ?? FRANCHISE_WEIGHTS.none_voting;
  let voters = 0;
  let people = 0;
  for (const classId of CLASS_IDS) {
    const population = classPopulation(nation, classId);
    people += population;
    // Ağırlık oy SAYISI değil, oyun AĞIRLIĞIdır: kütüğe giren kişi sayısı için
    // ağırlığın sıfırdan büyük olması yeter.
    if ((weights[classId] ?? 0) > 0) voters += population;
  }
  return { voters, people, share: people > 0 ? voters / people : 0 };
}

/* --------------------------------------------------------------------------
   REFORM KAPISI
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   REFORM KAPISI — destek, baskı, atalet

   Kapı tek bir sayı değildir. Bir yasanın çıkması için meclisin o kademeyi
   İSTEMESİ yetmez; kurumların değişime hazır olması da gerekir. Dört ayrı
   koşul birlikte çalışır:

     1. meclis desteği   — ideolojilerin isteği + baskı altında uzlaşması
     2. eşik             — yasanın ağırlığına göre %50 / %55 / %60
     3. bekleme          — önceki reformdan bu yana geçen süre
     4. yorgunluk        — arka arkaya reform kurumları yıpratır

   Tasarımın kalbi 1. maddedir: STATÜKOCU GRUPLAR BASKI ALTINDA UZLAŞIR.
   Muhafazakâr bir meclis normalde oy hakkını istemez, ama sokak yeterince
   ısındığında istemeye istemez kabul eder. Oyuncunun asıl ikilemi budur —
   reformu geçir ya da devrimi göze al.
   -------------------------------------------------------------------------- */

/**
 * Yasanın ağırlığı. Rejimin kendi kurallarını değiştiren yasalar anayasaldır
 * ve en yüksek eşiği ister; devlet meseleleri idari düzenlemedir, en hafifi.
 */
const CONSTITUTIONAL = new Set([
  'upper_house', 'vote_franchise', 'political_parties', 'voting_system',
]);
const CATEGORY_SEVERITY = { state: 'minor', social: 'normal', political: 'major' };

/** Eşik ve bekleme (hafta). Bekleme kabaca 6 / 12 / 18 / 24 aydır. */
export const SEVERITY_RULES = {
  minor: { threshold: 0.50, cooldown: 26, fatigue: 15 },
  normal: { threshold: 0.50, cooldown: 52, fatigue: 25 },
  major: { threshold: 0.55, cooldown: 78, fatigue: 30 },
  constitutional: { threshold: 0.60, cooldown: 104, fatigue: 38 },
};

/** Kriz, bekleme sayacından en fazla bu kadar hafta düşer (~6 ay). */
const EMERGENCY_RELIEF = 26;

export function reformSeverity(group) {
  return CONSTITUTIONAL.has(group.id) ? 'constitutional'
    : CATEGORY_SEVERITY[group.category] ?? 'normal';
}

/**
 * Bir ideolojinin baskı altında fikir değiştirme eğilimi.
 *
 * Muhafazakâr pragmatiktir: düzen bozulmasın diye taviz verir. Gerici taviz
 * vermez, düzeni geri istemektedir. Komünist reformu zaten yetersiz bulur —
 * baskı onu uzlaşmaya değil devrime iter, o yüzden düşük.
 */
const PRESSURE_OPENNESS = {
  conservative: 0.65,
  liberal: 0.55,
  socialist: 0.60,
  fascist: 0.20,
  communist: 0.35,
  reactionary: 0.08,
};

/** Hükûmet biçiminin eşiğe etkisi: rejimler aynı yasayı aynı kolaylıkta çıkarmaz. */
function governmentShift(nation, group) {
  const franchise = REFORM_BY_ID.vote_franchise.steps
    .findIndex((step) => step.id === reformValue(nation, 'vote_franchise'));
  const autocratic = franchise <= 0;
  if (!autocratic) return 0;
  // Otokraside taht idari düzenlemeyi tek kalemde yapar; ama kendi yetkisini
  // budayan siyasi yasa seçkin direncine çarpar.
  if (group.category === 'state') return -0.05;
  if (group.category === 'political') return 0.08;
  return 0;
}

/** Ulusun reform iklimi. Tahta başına BİR KEZ hesaplanır, satırlara paylaştırılır. */
export function reformClimate(nation) {
  const politics = nation.politics ?? {};
  return {
    militancy: clamp(nationalMilitancy(nation) / 10, 0, 1),
    fatigue: clamp((politics.reformFatigue ?? 0) / 100, 0, 1),
    people: peopleMix(nation),
    house: upperHouse(nation),
    cooldown: Math.max(0, politics.reformCooldown ?? 0),
  };
}

/** Bu kademeyi isteyen halkın payı — hareket baskısı MESELEYE ÖZELdir. */
function movementDemand(group, index, people) {
  let demand = 0;
  for (const slice of people) {
    if (desiredIndex(group, slice.id) >= index) demand += slice.share;
  }
  return demand;
}

/**
 * Meclisin bir kademeye verdiği destek, 0–1, ve dökümü.
 *
 * İsteyen ideoloji payını tam verir. İSTEMEYEN ideoloji baskı altında kısmen
 * verir: sokak ne kadar sıcaksa ve o yasayı isteyen halk ne kadar kalabalıksa
 * o kadar. Tavan 0.75 — hiçbir baskı gerici bir meclisi tam ikna etmez.
 */
function tallySupport(group, index, climate, rows) {
  const movement = movementDemand(group, index, climate.people);
  const heat = climate.militancy * 0.55 + movement * 0.45;
  let support = 0;
  for (const seat of climate.house) {
    const wants = desiredIndex(group, seat.id) >= index;
    const willingness = wants
      ? 1
      : clamp((PRESSURE_OPENNESS[seat.id] ?? 0.3) * heat, 0, 0.75);
    const points = seat.share * willingness;
    support += points;
    if (rows) {
      rows.push({
        id: seat.id, name: seat.name, share: seat.share, wants, willingness, points,
      });
    }
  }
  return { support: clamp(support, 0, 1), movement, heat };
}

/** Geriye dönük uyum: eski imza (tanılama betikleri kullanıyor). */
export function houseSupport(nation, groupId, index) {
  const group = REFORM_BY_ID[groupId];
  if (!group) return 0;
  return tallySupport(group, index, reformClimate(nation), null).support;
}

/**
 * Bir merdivenin tam durumu. Ekran bunun dışında bir şey bilmez; engelin
 * ADI ve dökümü buradan gelir (bkz. politicsScreen — oyuncu neden geçmediğini
 * tahmin etmek zorunda kalmamalı).
 */
export function reformStatus(nation, groupId, climate = null) {
  const group = REFORM_BY_ID[groupId];
  if (!group) return null;
  const env = climate ?? reformClimate(nation);
  const current = currentStep(nation, groupId);
  const next = group.steps[current.index + 1] ?? null;
  const severity = reformSeverity(group);
  const rules = SEVERITY_RULES[severity];

  if (!next) {
    return {
      group, current, next: null, complete: true, severity,
      support: 0, threshold: rules.threshold, canEnact: false,
      blocked: 'complete', contributions: [], cooldownLeft: 0,
      pressure: { militancy: env.militancy, movement: 0, fatigue: env.fatigue, government: 0 },
    };
  }

  const contributions = [];
  const { support, movement, heat } = tallySupport(group, next.index, env, contributions);
  const government = governmentShift(nation, group);
  // Yorgunluk desteği aşağı çeker: arka arkaya reform meclisi yorar.
  const effective = clamp(support - env.fatigue * 0.25, 0, 1);
  const threshold = clamp(rules.threshold + government, 0.35, 0.85);

  // Bekleme geri sayımdır: enactReform yasanın ağırlığına göre kurar, haftalık
  // faz bir azaltır (bkz. refreshReformModifiers). Tur numarası taşımaya gerek
  // yok, dolayısıyla kayıt biçimi de sade kalır.
  //
  // Olağanüstü baskı kurumsal ataleti kırar ama sıfırlamaz: kriz altı aya
  // kadar atlatır, bedeli enactReform'da ödenir (ek yorgunluk, sert tepki).
  const emergency = env.militancy >= 0.70 && movement >= 0.50;
  const cooldownLeft = Math.max(0, env.cooldown - (emergency ? EMERGENCY_RELIEF : 0));

  const hasSupport = effective >= threshold;
  const blocked = cooldownLeft > 0 ? 'cooldown' : !hasSupport ? 'support' : null;

  return {
    group,
    current,
    next,
    complete: false,
    severity,
    support: effective,
    rawSupport: support,
    threshold,
    canEnact: blocked === null,
    blocked,
    cooldownLeft,
    emergency,
    contributions,
    pressure: { militancy: env.militancy, movement, heat, fatigue: env.fatigue, government },
  };
}

/** Bütün merdivenlerin durumu; iklim BİR KEZ kurulur ve paylaşılır. */
export function reformBoard(nation) {
  ensureReforms(nation);
  const climate = reformClimate(nation);
  return REFORMS.map((group) => reformStatus(nation, group.id, climate));
}

/**
 * "Can't enact social reforms" satırı. Vic2'de bu, o kategoride HERHANGİ bir
 * reformun meclisten geçip geçemeyeceğini söyler — tek tek bakmaya gerek
 * kalmadan meclisin havasını verir.
 */
export function canEnactCategory(nation, category, board) {
  const rows = board ?? reformBoard(nation);
  return rows.some((row) => row.group.category === category && row.canEnact);
}

/**
 * Bir sonraki kademeyi yürürlüğe koyar. Kapı kapalıysa hiçbir şey olmaz ve
 * `false` döner — çağıran yeri ayrıca kontrol etmek zorunda kalmasın.
 */
export function enactReform(game, nation, groupId) {
  const status = reformStatus(nation, groupId);
  if (!status?.canEnact) return false;
  const politics = nation.politics;
  const rules = SEVERITY_RULES[status.severity];
  politics.reforms[groupId] = status.next.id;

  // Kurumsal atalet: bir sonraki yasa bu sayaç bitmeden gelmez.
  politics.reformCooldown = rules.cooldown;
  // Yorgunluk arka arkaya reformu cezalandırır; haftalık faz eritir.
  politics.reformFatigue = clamp((politics.reformFatigue ?? 0) + rules.fatigue, 0, 100);
  // Kriz reformu ucuz değildir: ataleti kıran hükûmet fazladan yıpranır.
  if (status.emergency) {
    politics.reformFatigue = clamp(politics.reformFatigue + 12, 0, 100);
  }

  // SİYASİ ŞOK. Reform tarafsız bir iyileştirme değil, koalisyonun yeniden
  // dizilmesidir: talebi karşılanan taraf yatışır ve kısmen dağılır, karşı
  // taraf öfkelenip toparlanır. Parti popülaritesi zaten seçim desteğini
  // besliyor, yani bu kayma doğrudan sandığa yansır.
  const backlash = status.severity === 'constitutional' ? 1.09 : 1.05;
  for (const party of politics.parties ?? []) {
    const wanted = desiredIndex(status.group, party.ideology) >= status.next.index;
    party.popularity = clamp(party.popularity * (wanted ? 0.96 : backlash), 0.4, 3);
  }
  nation.politics.reformLog ??= [];
  nation.politics.reformLog.push({
    turn: game?.world?.turn ?? 0, group: groupId, step: status.next.id,
  });
  // Defter uzamasın: ekran yalnız son birkaç yasayı gösteriyor.
  if (nation.politics.reformLog.length > 24) nation.politics.reformLog.shift();
  // Çarpanlar hemen tazelenir: haftalık faz beklenirse yasa bir hafta
  // boyunca yürürlükte ama etkisiz görünür.
  if (modsByNation.has(nation)) refreshReformModifiers(nation);
  if (game && nation.id === game.turns?.playerNation) {
    game.turns.addLog(`${status.next.name} enacted (${status.group.name}).`, { kind: 'POLITICS' });
  }
  game?.emit?.('politics', game.world?.turn);
  return true;
}

/* --------------------------------------------------------------------------
   HÜKÛMET BİÇİMİ

   Ayrı bir alan değil, yasaların okunuşu: sandık ve parti yasası ne diyorsa
   rejimin adı odur. Ekranın başlığı bundan gelir.
   -------------------------------------------------------------------------- */

const DICTATORSHIP = {
  fascist: 'Fascist Dictatorship',
  communist: 'Proletarian Dictatorship',
  socialist: 'Presidential Dictatorship',
  liberal: 'Presidential Dictatorship',
  conservative: 'Absolute Monarchy',
  reactionary: 'Absolute Monarchy',
};

export function governmentType(nation) {
  ensureReforms(nation);
  const franchise = REFORM_BY_ID.vote_franchise.steps
    .findIndex((step) => step.id === reformValue(nation, 'vote_franchise'));
  const parties = REFORM_BY_ID.political_parties.steps
    .findIndex((step) => step.id === reformValue(nation, 'political_parties'));
  const ruling = rulingParty(nation)?.ideology ?? 'conservative';
  if (franchise <= 0 || parties <= 0) return DICTATORSHIP[ruling] ?? 'Absolute Monarchy';
  if (franchise <= 1) return 'Constitutional Monarchy';
  if (franchise <= 2 || parties <= 2) return 'Prussian Constitutionalism';
  return 'Democracy';
}

/* --------------------------------------------------------------------------
   HAREKETLER

   Vic2'nin Movements sekmesi: bir yasayı isteyen ama alamayan halkın örgütlü
   kısmı. Burada TÜRETİLİR, saklanmaz — desteği isteyen ideolojilerin halk
   içindeki payından, hararetini sınıf memnuniyetsizliğinden alır.
   Simülasyona geri beslenmez; ekranın göstergesidir.
   -------------------------------------------------------------------------- */

/** Sınıf memnuniyetsizliğinden türetilen ulusal militanlık, 0–10. */
export function nationalMilitancy(nation) {
  let weighted = 0;
  let total = 0;
  for (const classId of CLASS_IDS) {
    const socialClass = nation.economy?.classes?.[classId];
    if (!socialClass) continue;
    const population = Math.max(0, socialClass.population ?? 0);
    weighted += (1 - clamp(socialClass.satisfaction ?? 0.62, 0, 1)) * population;
    total += population;
  }
  return total > 0 ? clamp((weighted / total) * 10, 0, 10) : 0;
}

export function reformMovements(nation, { limit = 8, board: given = null } = {}) {
  const board = given ?? reformBoard(nation);
  const people = peopleMix(nation);
  const militancy = nationalMilitancy(nation);
  // Hareket ancak huzursuzluk varsa örgütlenir: memnun halkta talep vardır,
  // sokak yoktur.
  const heat = clamp(militancy / 10, 0, 1);
  const rows = [];
  for (const row of board) {
    if (!row.next) continue;
    let demand = 0;
    // Halkın gerçekten istediği en uzak kademe. Talebin ŞİDDETİ mesafeyle
    // artar: bir sonraki basamağı isteyen iki kalabalık aynı büyüklükte olsa
    // bile, merdivenin dört basamak gerisinde duran daha sert örgütlenir.
    // Bu ayrım olmadan bütün hareketler aynı yüzdeyi veriyordu (ölçüldü).
    let reach = row.current.index;
    for (const slice of people) {
      const desired = desiredIndex(row.group, slice.id);
      if (desired >= row.next.index) demand += slice.share;
      // Tek tük destekçinin uç talebi hareketi temsil etmez.
      if (desired > reach && slice.share >= 0.05) reach = desired;
    }
    if (demand <= 0.02) continue;
    const gap = clamp((reach - row.current.index) / 3, 0, 1);
    rows.push({
      groupId: row.group.id,
      name: row.group.name,
      icon: row.group.icon,
      step: row.next.name,
      demand,
      gap: reach - row.current.index,
      // Örgütlü destek: talep × huzursuzluk × mesafe.
      support: demand * (0.3 + 0.7 * heat) * (0.7 + 0.3 * gap),
      militancy: clamp(militancy * (0.6 + demand * 0.5 + gap * 0.3), 0, 10),
      blocked: !row.canEnact,
      houseSupport: row.support,
    });
  }
  rows.sort((a, b) => b.support - a.support || b.gap - a.gap);
  return { militancy, movements: rows.slice(0, limit) };
}

/* --------------------------------------------------------------------------
   ÖNEMLİ MESELELER

   Vic2'nin Important Issues tablosu iki kaynağı karıştırır: partilerin
   programı (dört eksen) ve halkın istediği bir sonraki yasa. Sütunlar seçmen
   ile halkı yan yana koyar — aradaki fark oy hakkı yasasının resmidir.
   -------------------------------------------------------------------------- */

const ISSUE_AXES = Object.keys(POLITICAL_POLICIES);

function partyByIdeology(nation) {
  const map = new Map();
  for (const party of nation.politics?.parties ?? []) {
    if (!map.has(party.ideology)) map.set(party.ideology, party);
  }
  return map;
}

/** Bir ideoloji dağılımının mesele ağırlıkları. */
function issueWeights(nation, mix, board) {
  const parties = partyByIdeology(nation);
  const weights = new Map();
  const add = (id, name, value) => {
    const entry = weights.get(id) ?? { id, name, value: 0 };
    entry.value += value;
    weights.set(id, entry);
  };
  for (const slice of mix) {
    const party = parties.get(slice.id);
    if (party) {
      for (const axis of ISSUE_AXES) {
        const option = party.policies?.[axis];
        const info = POLITICAL_POLICIES[axis]?.[option];
        // Dört eksen tek listeye girer, her biri çeyrek ağırlık taşır.
        if (info) add(option, info.name, slice.share / ISSUE_AXES.length);
      }
    }
    for (const row of board) {
      if (!row.next) continue;
      if (desiredIndex(row.group, slice.id) >= row.next.index) {
        // Yasa talebi parti programından hafiftir: gündemi programlar kurar,
        // reform talebi onun üstüne biner.
        add(row.next.id, row.next.name, slice.share * 0.12);
      }
    }
  }
  return weights;
}

export function importantIssues(nation, { limit = 14, board: given = null } = {}) {
  const board = given ?? reformBoard(nation);
  const voters = issueWeights(nation, voterMix(nation), board);
  const people = issueWeights(nation, peopleMix(nation), board);
  const ids = new Set([...voters.keys(), ...people.keys()]);
  return [...ids]
    .map((id) => {
      const entry = voters.get(id) ?? people.get(id);
      return {
        id,
        name: entry.name,
        voters: voters.get(id)?.value ?? 0,
        people: people.get(id)?.value ?? 0,
      };
    })
    .sort((a, b) => (b.people + b.voters) - (a.people + a.voters))
    .slice(0, limit);
}

/* --------------------------------------------------------------------------
   SERBEST BIRAKILABİLİR ULUSLAR

   Vic2'nin Release Nations sekmesi. Burada YALNIZ LİSTELENİR: oyunda henüz
   ulus bırakma mekaniği yok, o yüzden ekran da düğmesini kapalı gösterir ve
   nedenini söyler. Liste gerçek veridir — kendi toprağındaki yabancı kültürler.
   -------------------------------------------------------------------------- */

export function releasableNations(world, nation) {
  const byCulture = new Map();
  for (const province of world?.provinces ?? []) {
    if (province.owner !== nation.id) continue;
    const culture = province.culture;
    if (culture == null || culture < 0 || culture === nation.culture) continue;
    const entry = byCulture.get(culture) ?? {
      culture,
      name: world.cultures?.[culture]?.name ?? 'Stateless',
      color: world.cultures?.[culture]?.color ?? '#6f7778',
      provinces: 0,
      population: 0,
    };
    entry.provinces += 1;
    entry.population += province.econ?.population ?? 0;
    byCulture.set(culture, entry);
  }
  return [...byCulture.values()].sort((a, b) => b.provinces - a.provinces);
}

/* --------------------------------------------------------------------------
   YASALARIN SİMÜLASYON KARŞILIĞI

   Yukarısı yasanın DURUMUnu tutar; burası onu ekonomiye bağlar. Bağ olmadan
   merdiven ölü mekanikti: oyuncu yirmi bir yasayı da çıkarabiliyor, hiçbir
   sayı kıpırdamıyordu.

   MİMARİ KARARI — çarpanlar HAFTADA BİR KEZ hesaplanır ve ulusa yazılır;
   tüketiciler düz bir alan okur. Önceki denemede çarpan fonksiyonu sıcak
   yoldan çağrılıyor, o da `ensureReforms` üzerinden 21 merdivende findIndex
   kapanışı kuruyordu: haftalık tahsisat 8.7 MB'den 32.6 MB'ye çıkmış ve
   değişiklik geri alınmıştı. Şimdi sıcak yolda hiçbir hesap yok, yalnız
   nesne okuma var.

   TASARIM KURALLARI
   1. Her merdivenin en alt kademesi tam nötrdür (çarpan 1, ekleme 0), yani
      hiç reform yapmayan ülke eski davranışın aynısını yaşar.
   2. Her yasanın kazananı ve kaybedeni olmalı. Asgari ücret işçinin bütçesini
      büyütür ve fabrikanın ücret faturasını da büyütür. Tek yönlü "+%5 iyi
      şey" listesi karar değil, düğmedir.
   3. Katsayılar küçük tutulur; bu katmanın işi bağı kurmaktır, dengeyi
      yeniden yazmak değil.
   -------------------------------------------------------------------------- */

/**
 * Turetilmis carpanlar KAYDA GIRMEZ. nation.politics uzerinde tutuluyordu ve
 * save/load denetimi dustu: turetilmis veri kayda sizinca yukleme sonrasi
 * simulasyon dalleniyordu (battles/population/prices). WeakMap ile kayit
 * bicimi hic degismiyor, dolayisiyla goc de gerekmiyor.
 */
const modsByNation = new WeakMap();

// `lowerBudget`/`middleBudget` SILINDI: hesaplaniyordu ama tek erisimcisi
// (reformBudgetFactor) hicbir yerden cagrilmiyordu — hane butcesi
// needsBudget = netIncome + subsistence formulunde reform terimi yok.
// Tuketicisiz degistirici tutulmaz (P1-6). Baglamak hane muhasebesini
// (dondurulmus cekirdek) yeniden acmak olurdu; kayit REMAINING listesinde.
export const NEUTRAL_MODIFIERS = Object.freeze({
  lowerMood: 0, middleMood: 0, upperMood: 0,
  throughput: 1, wageCost: 1, socialBurden: 0,
});

/** Kademe sırasının 0–1'e indirgenmiş hâli; merdiven boyları farklı. */
function ladderProgress(reforms, groupId) {
  const group = REFORM_BY_ID[groupId];
  const span = group.steps.length - 1;
  if (span <= 0) return 0;
  const id = reforms[groupId];
  for (let i = 0; i < group.steps.length; i++) {
    if (group.steps[i].id === id) return i / span;
  }
  return 0;
}

/**
 * Yürürlükteki yasaların sayısal karşılığını hesaplar ve ulusa yazar.
 * Haftalık siyaset fazından ve yasa çıkarıldığı anda çağrılır.
 */
export function refreshReformModifiers(nation) {
  const reforms = ensureReforms(nation);
  if (!reforms) return NEUTRAL_MODIFIERS;
  // Haftalık sayaçlar burada işler: bu fonksiyon ulus başına haftada tam bir
  // kez çağrılıyor (bkz. economy.beginEconomy), ayrı bir faz açmaya gerek yok.
  const politics = nation.politics;
  if (politics.reformCooldown > 0) politics.reformCooldown -= 1;
  if (politics.reformFatigue > 0) politics.reformFatigue = Math.max(0, politics.reformFatigue - 0.6);
  const p = (id) => ladderProgress(reforms, id);
  const wage = p('minimum_wage');
  const hours = p('work_hours');
  const safety = p('safety');
  const dole = p('unemployment');
  const pension = p('pensions');
  const health = p('health_care');
  const school = p('school_system');
  const child = p('child_labor');
  const unions = p('trade_unions');
  const rights = p('political_rights');
  const press = p('press_rights');

  const mods = {
    // Memnuniyet — omurgaya doğrudan bağlanan terim: memnuniyet → stability
    // → parti desteği → seçim. Reformun siyasi sonucu budur.
    //
    // Katsayılar 260 haftalık A/B ile kalibre edildi. Üçte biri kadarken
    // ölçüldü: reform yapan ülkenin alt sınıfı reform yapmayandan DAHA
    // memnuniyetsiz çıkıyordu, çünkü sanayinin kısılması ücret tabanını
    // yıllarca aşındırıyordu. Yani "işçiyi koruyan yasa işçiyi vurur"
    // tuzağıydı; doğrudan kazanım dolaylı sürüklemeyi açıkça geçmeli.
    lowerMood: hours * 0.13 + safety * 0.07 + dole * 0.12 + pension * 0.10
      + health * 0.10 + child * 0.06,
    middleMood: rights * 0.02 + press * 0.02 + health * 0.02,
    // Üst sınıf faturayı öder.
    upperMood: -(wage * 0.05 + safety * 0.03 + unions * 0.04),
    // Sanayi: ceza KÜÇÜK. Fatura toplam üretimde değil sermayenin kârında
    // olmalı, yoksa üretim düşüşü bileşiklenip işçiyi de vuruyor.
    throughput: 1 - hours * 0.03 - safety * 0.012 - child * 0.012,
    wageCost: 1 + wage * 0.14 + unions * 0.05 + hours * 0.06 + safety * 0.04,
    // Sosyal yasa KAYDIRAÇTAN AYRI bir taahhüttür: kaydıraç isteğe bağlı
    // harcama, yasa kısılamaz.
    // Katsayilar kaydirac oranlarinin ucte biri mertebesinde. Ilk yazimda
    // tam kaydirac mertebesindeydi ve olculdu: bes sosyal yasa cikaran ulke
    // 52 haftada hazinesini tamamen tuketiyordu (-%100). Yasa anlamli bir
    // taahhut olmali, yikici degil.
    socialBurden: dole * 0.10 + pension * 0.12 + health * 0.10 + school * 0.09,
  };
  modsByNation.set(nation, mods);
  return mods;
}

/**
 * Sıcak yolun okuduğu tek şey. HESAP YAPMAZ — haftalık fazın yazdığı nesneyi
 * döndürür (bkz. refreshReformModifiers).
 */
export function reformModifiers(nation) {
  return modsByNation.get(nation) ?? NEUTRAL_MODIFIERS;
}

// `reformBudgetFactor` SILINDI: sifir cagirani vardi (bkz. NEUTRAL_MODIFIERS
// notu). Ekranin vaadi ile motorun gercegi ayni olsun.

/** Sınıfa göre memnuniyet kayması. */
export function reformMoodShift(nation, classId) {
  const mods = reformModifiers(nation);
  if (classId === 'lower') return mods.lowerMood;
  if (classId === 'middle') return mods.middleMood;
  return mods.upperMood;
}
