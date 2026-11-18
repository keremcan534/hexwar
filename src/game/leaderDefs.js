// LİDER SABİTLERİ — kişilik özellikleri, okudukları YZ kapıları, ad bankaları
// (TASARIM §12b).
//
// Bu dosya yalnız dipDefs.js'i import eder (o da hiçbir şeyi): ai.js,
// alliances.js, pacts.js, peace.js modül yüklenirken buradan okur, içe-alma
// döngüsü kurulmaz.
//
// KURAL: bir özellik ancak bir YZ KARARINI değiştiriyorsa yaşar (TASARIM ilke
// 5). Her kaldıraç mevcut bir eşiği oynatır; yeni karar, yeni ilişki sayacı
// yoktur. `npm run audit:leaders` özelliği bütün uluslara zorlar, kendi
// ölçütündeki farkı HX_PLACEBO tabanıyla karşılaştırır; tabanı geçemeyen silinir.

import { DIP_AI } from './dipDefs.js';

/**
 * Kaldıraçların nötr değeri. `DIP_AI.leaders` kapalıyken hepsi buradan okunur
 * ve YZ liderlerden önceki kararların bit bit aynısını verir: çarpanlar 1,
 * eklenenler 0 (x × 1 ve x + 0 kayan noktada x'tir).
 */
const NEUTRAL = {
  warRatio: 1, // savaş kapısının istediği üstünlük (pacts.aggressionOdds)
  declare: 1, // aylık ilan zarı (ai.diplomacy)
  breakLine: 0, // ittifak bozma ve pakt feshi çizgisine eklenir (READ.BREAK)
  desert: 0, // 1: güçlü saldırgan karşısında müttefik çağrısına gelmez
  allianceBias: 0, // ittifak çekiciliğine eklenir
  napBias: 0, // pakt hükmüne eklenir
  followRatio: 1, // reddedilen talebi savaşla izleme eşiği (DEMAND.FOLLOW_RATIO)
  yieldBias: 0, // talebin hükmüne eklenir: artı verir, eksi direnir
  sueScore: 0, // barış isteme eşiğine eklenir (ai.PEACE_LOSS_SCORE)
  sueRatio: 1, // güç oranıyla barış isteme eşiği
  tolerance: 0, // barış masasında kabul toleransına eklenir (warscore puanı)
};

/**
 * ÖZELLİKLER. Dört eksen; lider en çok üç eksende kutup taşır, kalanında nötrdür. `line` oyuncuya basılan cümledir (cümle testi):
 * özelliğin HANGİ kararı NASIL değiştirdiğini söyler.
 */
export const TRAITS = {
  warlike: {
    axis: 'war', name: 'Warlike',
    line: 'Goes to war on thinner odds (needs ×1.4 superiority, not ×1.8) and looks for the chance twice as often.',
    levers: { warRatio: 0.78, declare: 2 },
  },
  cautious: {
    axis: 'war', name: 'Cautious',
    line: 'Will not fight without a wide margin (needs ×2.3 superiority, not ×1.8) and weighs war half as often.',
    levers: { warRatio: 1.3, declare: 0.5 },
  },
  opportunist: {
    axis: 'word', name: 'Opportunist',
    line: 'Leaves an ally to fight alone when the aggressor outweighs them both, and walks out at the first coolness (relations −5).',
    levers: { breakLine: 20, desert: 1 },
  },
  conciliator: {
    axis: 'company', name: 'Conciliator',
    line: 'Seeks partners: alliances and pacts both weigh +1 in this leader\'s judgement.',
    levers: { allianceBias: 1, napBias: 1 },
  },
  isolationist: {
    axis: 'company', name: 'Isolationist',
    line: 'Wants no entanglements: alliances weigh −1.5, though a quiet border pact still weighs +0.5.',
    levers: { allianceBias: -1.5, napBias: 0.5 },
  },
  pragmatist: {
    axis: 'table', name: 'Pragmatist',
    line: 'Yields what cannot be held, backs down from a bad bluff, and sues for peace once the war score reaches −15.',
    levers: { followRatio: 1.35, yieldBias: 0.8, sueScore: 15, sueRatio: 1.25, tolerance: 10 },
  },
};

export const TRAIT_IDS = Object.keys(TRAITS);

/**
 * Eksenler: [sert kutup, yumuşak kutup]. Tek kutuplu eksende öbür uç nötrdür:
 * "Faithful" ölçüldü ve silindi (4 tohum × 20 yıl, bütün liderlere zorlanınca
 * bozulan ittifak farkı +0.0): ittifakların bozulma sebebi şöhret ve rakipliktir,
 * ilişki çizgisini uzatmak hiçbir kararı döndürmüyordu.
 * "Vengeful" ve "Forgiving" de ölçüldü ve silindi (6 tohum × 30 yıl, iki ayrı
 * kaldıraçla: kin sıralaması ve eski düşmana düşük savaş eşiği): saldırı sayısı
 * ve hedefler nötr dünyayla birebir aynı kaldı. "Hardliner" ilk altı tohumda
 * geçti, görmediği altı tohumda tekrarlanmadı (barış skoru +0.6, 3/6 tohum).
 */
export const AXES = {
  war: ['warlike', 'cautious'],
  word: ['opportunist'],
  company: ['conciliator', 'isolationist'],
  table: ['pragmatist'],
};

/** Denetim tezgâhı: bütün liderlere zorlanan özellikler (HX_LEADER_TRAIT). */
export const LEADER_TEST = { force: null };

/** Bu ulusun liderinin kaldıraç değeri; lider yoksa ya da kol kapalıysa nötr. */
export function leverOf(nation, key) {
  const base = NEUTRAL[key];
  if (!DIP_AI.leaders) return base;
  const traits = nation?.leader?.traits;
  if (!traits) return base;
  for (const id of traits) {
    const value = TRAITS[id]?.levers[key];
    if (value !== undefined) return value;
  }
  return base;
}

/** Hüküm satırının etiketi: kararı oynatan özellik ve liderin adı. */
export function leverLabel(nation, key) {
  const leader = nation?.leader;
  const id = leader?.traits?.find((trait) => TRAITS[trait]?.levers[key] !== undefined);
  return id ? `${leader.title} ${leader.name} is ${TRAITS[id].name.toLowerCase()}` : 'Their leader';
}

/**
 * ÖMÜR VE GÖREV. Ölüm yıllık `BASE × GROWTH^(yaş − 40)`: 60'ında %3, 70'inde
 * %7, 80'inde %16. Çeyrekte bir bakılır (haftalık zar gereksiz iş olurdu).
 */
export const LIFE = {
  CHECK_EVERY: 13,
  DEATH_BASE: 0.006,
  DEATH_GROWTH: 1.085,
  /** Seçilmiş lider iki seçim dönemi görev yapar. */
  TERMS: 2,
  /** Kaç eski lider hatırlanır (dosyadaki "önceki" satırı). */
  PAST: 8,
};

/**
 * DARBE. Devlet sarsılmışken (istikrar ya da yorgunluk eşiği) ve lider en az
 * iki yıldır görevdeyken çeyrekte %5: darbe bir kriz sonucudur, rutin değil.
 */
export const COUP = {
  STABILITY: 0.3,
  EXHAUSTION: 0.55,
  CHANCE: 0.05,
  MIN_TENURE: 104,
};

/** Rol başına göreve geliş yaşı [en genç, en yaşlı]. */
export const ROLE_AGE = {
  monarch: [24, 62],
  statesman: [46, 70],
  marshal: [44, 64],
  firebrand: [32, 56],
};

/** Portre sayfası başına yüz sayısı (10 × 5); son satır (41-50) kadın yüzleridir. */
export const FACES = { PER_SHEET: 50, WOMEN_FROM: 41 };

/** Rollere göre kadın lider payı: dönemin tarihine yakın, sıfır değil. */
export const WOMEN_SHARE = { monarch: 0.14, statesman: 0, marshal: 0, firebrand: 0.16 };

/**
 * AD BANKALARI, kültürün dil ailesine göre (world/cultures.js FAMILY_TAIL ile
 * aynı aileler): aynı dil kuşağının liderleri akraba duyulur.
 */
export const NAME_BANKS = {
  Valdic: {
    men: ['Aldren', 'Corvin', 'Edmar', 'Harlan', 'Leopold', 'Marek', 'Osmund', 'Rainer', 'Theobald', 'Viktor'],
    women: ['Adela', 'Isolde', 'Margarethe', 'Sibylla', 'Theresia'],
    family: ['Ardenmar', 'Valdmar', 'Kestrand', 'Morvaine', 'Dunmarch', 'Selwen', 'Tarneth', 'Ilvermar', 'Brandeth', 'Haldane'],
  },
  Torvic: {
    men: ['Bogdan', 'Dragan', 'Fyodor', 'Grigor', 'Kazimir', 'Lazar', 'Miroslav', 'Radomir', 'Stanimir', 'Yaroslav'],
    women: ['Darina', 'Ludmila', 'Milena', 'Vesna', 'Zorana'],
    family: ['Volkov', 'Kurganov', 'Morvsky', 'Varnovic', 'Sirnov', 'Daskalov', 'Orvsky', 'Kaldurov', 'Tarnsky', 'Jarnovic'],
  },
  Sarnic: {
    men: ['Bahram', 'Daryan', 'Farhad', 'Jalil', 'Kamran', 'Nasir', 'Rustam', 'Sohrab', 'Tahir', 'Zaman'],
    women: ['Azadeh', 'Laleh', 'Parisa', 'Roxane', 'Soraya'],
    family: ['Sarnani', 'Hesharan', 'Peshiya', 'Rishani', 'Amrani', 'Kurdani', 'Fasqari', 'Thalesh', 'Yrnani', 'Urkesh'],
  },
  Eshan: {
    men: ['Bao', 'Chen', 'Haoran', 'Jian', 'Kaito', 'Liang', 'Minh', 'Renshu', 'Tao', 'Wei'],
    women: ['Hana', 'Lian', 'Mei', 'Suyin', 'Xia'],
    family: ['Eshai', 'Lemshan', 'Wang', 'Thalang', 'Morshan', 'Dunei', 'Selang', 'Kurshan', 'Nolai', 'Tarang'],
  },
  Meridic: {
    men: ['Alessio', 'Benedek', 'Cosimo', 'Dario', 'Emilio', 'Fabrizio', 'Giorgos', 'Lorenzo', 'Matteo', 'Stavros'],
    women: ['Bianca', 'Eleni', 'Isabella', 'Livia', 'Serafina'],
    family: ['Meridos', 'Corvene', 'Selora', 'Ithos', 'Lemora', 'Varnis', 'Pesqueira', 'Nolene', 'Amoros', 'Dralis'],
  },
  Norric: {
    men: ['Anders', 'Bjarne', 'Einar', 'Gunnar', 'Halvar', 'Ingvar', 'Leif', 'Sigurd', 'Torsten', 'Ulf'],
    women: ['Astrid', 'Freya', 'Ingrid', 'Sigrid', 'Solveig'],
    family: ['Norheim', 'Haldvik', 'Brandfjord', 'Kaldness', 'Thalard', 'Ormvik', 'Sellheim', 'Jarnard', 'Vestness', 'Rennvik'],
  },
  Aurenic: {
    men: ['Aurel', 'Bastien', 'Cedric', 'Emeric', 'Gaspard', 'Lucien', 'Mathis', 'Octave', 'Rémy', 'Thibault'],
    women: ['Adèle', 'Celestine', 'Élise', 'Maelle', 'Vivienne'],
    family: ['Aurelaun', 'Corwyn', 'Elnore', 'Girnael', 'Ilvaun', 'Lemiel', 'Morwyn', 'Serlaun', 'Tarnore', 'Vesiel'],
  },
  Zanhari: {
    men: ['Abasi', 'Baraka', 'Chike', 'Dumaka', 'Jabari', 'Kwame', 'Mosi', 'Obi', 'Sefu', 'Tendai'],
    women: ['Amara', 'Nia', 'Sanaa', 'Zahara', 'Zuri'],
    family: ['Zanhari', 'Mbande', 'Kurzai', 'Nolambo', 'Tarika', 'Selande', 'Orvizai', 'Dunmbo', 'Hesiri', 'Kaldande'],
  },
  Kelani: {
    men: ['Akoni', 'Hemi', 'Kahale', 'Keanu', 'Manaia', 'Nalu', 'Rangi', 'Tane', 'Tavita', 'Wiremu'],
    women: ['Aroha', 'Leilani', 'Malia', 'Moana', 'Tala'],
    family: ['Kelanai', 'Tarasim', 'Lemoa', 'Morlai', 'Orvanu', 'Selatara', 'Hesimu', 'Nolai', 'Dunoa', 'Rishtara'],
  },
};

export const DEFAULT_NAME_BANK = {
  men: ['Anton', 'Casimir', 'Dominik', 'Emil', 'Ferdinand', 'Julian', 'Konrad', 'Nikolai', 'Oskar', 'Stefan'],
  women: ['Anna', 'Clara', 'Helena', 'Irina', 'Sofia'],
  family: ['Arden', 'Brandt', 'Corvin', 'Dragan', 'Halden', 'Korda', 'Marek', 'Novar', 'Sandor', 'Varga'],
};
