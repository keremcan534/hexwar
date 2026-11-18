// POLİTİKA PAKETİ SABİTLERİ — vassal merdiveni, işgal yasaları, ceza kampları,
// kültür kaynaşması (TASARIM §18).
//
// Bu dosya HİÇBİR ŞEY import etmez (dipDefs.js, econ/defs.js gibi): bills.js,
// economy.js, culture.js ve levy.js modül yüklenirken buradan okur; içe-alma
// döngüsü TDZ'ye düşürmesin.
//
// Her satırın bedeli yanında durur. Sert uçların kazancı bugündür, bedeli
// yarındır: özerklik yükselir, ilişki defteri kirlenir, şöhret birikir.
//
// ŞÖHRET ÖLÇEĞİ: haftalık sönme `0.05 + 0.012 × şöhret`tir (infamy.js). Haftada
// 0.05'in altındaki bedel hiç birikmez; denge değeri (haftalık − 0.05) ÷ 0.012.
// Sayılar buna göre seçildi: tek vassalı soymak 2-14, koalisyon eşiği 22.

/**
 * YZ KOLLARI. Oyunda hepsi açık. Denetim tezgâhı `POLICY_ARMS` ile kapatır
 * (scripts/audit/harness.mjs): hepsi kapalıyken dünya bu paketten önceki
 * kararların AYNISINI verir; sınır ölçüsünün tabanı budur.
 */
export const POLICY_AI = {
  vassals: true,    // YZ vassal duruşu seçer
  occupation: true, // işgal yasaları işler (kapalıyken işgal eskisi gibi gelir vermez)
  camps: true,      // YZ ceza kampı açar
  fusion: true,     // YZ kabul ettiği halkla kaynaşır
};
export const POLICY_ARM_IDS = Object.keys(POLICY_AI);

/** Sürekli politika emri (orders.js): kabine mi yürütür, oyuncu mu tutar? */
export const POLICY_ORDER = { AUTO: 'auto', HOLD: 'hold' };

/** Devredilebilir politika alanları. Sıra ekrandaki sıradır. */
export const POLICY_AREAS = {
  vassals: { name: 'Vassals', desc: 'The cabinet sets how each vassal is treated. Handed to the cabinet, it never goes beyond Resource Extraction.' },
  occupation: { name: 'Occupation', desc: 'The cabinet sets the law for occupied land. Handed to the cabinet, it never orders Total Plunder.' },
  camps: { name: 'Penal states', desc: 'The cabinet can only wind penal states down. It never opens one for you and never sends a people there.' },
  fusion: { name: 'Fusion', desc: 'The cabinet begins fusing an accepted people with ours when the country is calm and at peace.' },
};
export const POLICY_AREA_IDS = Object.keys(POLICY_AREAS);

// ------------------------------------------------------- VASSAL MERDİVENİ ---

/**
 * Sertten iyiye. `rung` ekran sırasıdır (0 nötr). Alanlar:
 *   tribute    vassal çıktısının faturaya giren payı (efendinin fonuna akar)
 *   resources  gıda dışı yatak üretiminin efendiye giden payı
 *   food       gıda üretiminin efendiye giden payı
 *   hunger     nüfusun haftalık kaybı (gıda oranı düştükçe iki katına dek)
 *   abduct     nüfusun haftada efendinin topraklarına taşınan payı
 *   levy       savaşta vassal insanından efendiye alay toplanır
 *   strip      yarım yılda bir en kalkınmış state bir kademe sökülür
 *   subsidy    efendinin çıktısından vassalın fonuna akan pay
 *   autonomy   özerklik hedefine eklenen
 *   regard     vassalın defterine haftalık yazılan (denge ≈ değer ÷ 0.01)
 *   infamy     efendiye haftalık şöhret
 *   mods       vassalın ulusal değiştiricileri
 */
export const VASSAL_STANCES = {
  strip: {
    id: 'strip', rung: -6, name: 'Asset Stripping', tone: 'harsh',
    tribute: 0.10, strip: true, autonomy: 22, regard: -0.4, infamy: 0.22,
    mods: { stability: -0.12, output: -0.10, unrest: 0.30 },
    desc: 'Plant and rails are dismantled and shipped home. A one-time gain paid for with their development.',
  },
  abduct: {
    id: 'abduct', rung: -5, name: 'Labour Deportation', tone: 'harsh',
    tribute: 0.075, abduct: 0.0015, autonomy: 18, regard: -0.35, infamy: 0.18,
    mods: { stability: -0.10, unrest: 0.30 },
    desc: 'Workers are shipped to our states, or to a penal state if we run one.',
  },
  starve: {
    id: 'starve', rung: -4, name: 'Grain Requisition', tone: 'harsh',
    tribute: 0.15, food: 0.40, hunger: 0.0008, autonomy: 16, regard: -0.3, infamy: 0.16,
    mods: { stability: -0.10, growth: -0.50, unrest: 0.25 },
    desc: 'Their harvest feeds us first. Their population shrinks every week.',
  },
  levy: {
    id: 'levy', rung: -3, name: 'Forced Levy', tone: 'harsh',
    tribute: 0.075, levy: true, autonomy: 12, regard: -0.2, infamy: 0.11,
    mods: { stability: -0.06, unrest: 0.15 },
    desc: 'While we are at war their men are raised into our regiments. Their dead are their own.',
  },
  industry: {
    id: 'industry', rung: -2, name: 'Industrial Levy', tone: 'harsh',
    tribute: 0.22, autonomy: 10, regard: -0.15, infamy: 0.09,
    mods: { stability: -0.05, growth: -0.10 },
    desc: 'A large share of their output comes to us. It can push them into a supply crisis.',
  },
  extract: {
    id: 'extract', rung: -1, name: 'Resource Extraction', tone: 'harsh',
    tribute: 0.10, resources: 0.30, autonomy: 8, regard: -0.1, infamy: 0.07,
    mods: { stability: -0.03 },
    desc: 'Our concessions take a share of their mines and forests.',
  },
  tribute: {
    id: 'tribute', rung: 0, name: 'Standard Tribute', tone: 'neutral',
    tribute: 0.075, autonomy: 0, regard: 0, infamy: 0, mods: null,
    desc: 'The treaty terms and nothing more.',
  },
  protect: {
    id: 'protect', rung: 1, name: 'Protectorate', tone: 'kind',
    tribute: 0.05, autonomy: -8, regard: 0.15, infamy: 0,
    mods: { stability: 0.05, growth: 0.10, unrest: -0.15 },
    desc: 'Our officials keep order. They grow calmer and lean on us.',
  },
  invest: {
    id: 'invest', rung: 2, name: 'Development Partnership', tone: 'kind',
    tribute: 0.03, subsidy: 0.06, autonomy: 4, regard: 0.25, infamy: 0,
    // Tavan da yükselir: tek state'lik vassal üç yılda tavana dayanıyor, para
    // orada kademe alamıyordu (ölçüldü, POL2 haraç kolu 131. hafta).
    mods: { stability: 0.03, investment: 0.25, developmentCap: 2 },
    desc: 'We pay into their development fund and send engineers and teachers. A richer vassal, and a friendlier one.',
  },
  selfrule: {
    id: 'selfrule', rung: 3, name: 'Self-Government', tone: 'kind',
    tribute: 0.02, autonomy: 20, regard: 0.35, infamy: 0,
    mods: { stability: 0.06, output: 0.05 },
    desc: 'They run their own affairs. Loyal while it lasts, and close to leaving.',
  },
};
export const VASSAL_STANCE_IDS = Object.keys(VASSAL_STANCES)
  .sort((a, b) => VASSAL_STANCES[a].rung - VASSAL_STANCES[b].rung);
export const DEFAULT_STANCE = 'tribute';

export const STANCE_RULES = {
  /** Duruş değiştirmenin SG bedeli: toplu doktrin de tek bedel öder. */
  POWER: 15,
  /** Aynı vassalın duruşu bu kadar haftada bir değişir (sarkaç olmasın). */
  COOLDOWN: 26,
  /** Yolda ölen pay: kaçırılanların hepsi varmaz. */
  TRANSIT_LOSS: 0.1,
  /** Savaşta bir alayın toplanma aralığı ve vassal başına eş zamanlı tavan. */
  LEVY_WEEKS: 8,
  LEVY_MAX: 4,
  /**
   * Söküm aralığı, turda sökülen state ve kademe bedelinin efendiye kalan payı.
   * Yarım yılda bir kademe büyük vassalın kalkınmasını üç yılda %4 oynatıyordu
   * (ölçüldü): hissedilmeyen bir "yağma" olurdu.
   */
  STRIP_WEEKS: 13,
  STRIP_STATES: 2,
  STRIP_VALUE: 0.25,
  /** İlişki defterine yazma aralığı: küçük kayıt budanmasın diye birikerek yazılır. */
  REGARD_WEEKS: 13,
  /** Kaçırılanların varabileceği en kalkınmış state sayısı. */
  ABDUCT_TARGETS: 3,
};

/** Vassalın yürürlükteki VASSALIZE anlaşması. */
export function vassalTreaty(nation, turn = 0) {
  return (nation?.treaties ?? []).find((t) => t.type === 'VASSALIZE' && (t.until ?? Infinity) > turn) ?? null;
}

/** Anlaşmanın duruşu; yazılmamışsa standart haraç (eski kayıt). */
export function stanceOfTreaty(treaty) {
  return VASSAL_STANCES[treaty?.stance] ?? VASSAL_STANCES[DEFAULT_STANCE];
}

// ---------------------------------------------------------- İŞGAL YASALARI ---

/**
 *   extract        işgal edilen işgücünün çıktısından işgalcinin fonuna giden pay
 *   resistance     haftalık direniş artışı (eksi: söner)
 *   infamy         işgal edilen province başına haftalık şöhret
 *   pop            haftalık nüfus kaybı
 *   labour         nüfusun haftada işgalcinin topraklarına taşınan payı
 *   ruin           yılda bir kalkınma kademesi söker
 *   afterControl   barışta alınan state'in başlangıç uyumuna eklenen
 *   regard         sahibinin defterine province başına haftalık yazılan
 */
export const OCCUPATION_LAWS = {
  plunder: {
    id: 'plunder', rung: -2, name: 'Total Plunder', tone: 'harsh',
    extract: 0.5, resistance: 2.0, infamy: 0.05, pop: 0.0008, labour: 0.0006, ruin: true,
    afterControl: -20, regard: -0.12,
    desc: 'Everything that can be moved is moved. Resistance grows fast and the land is ruined for whoever holds it next.',
  },
  requisition: {
    id: 'requisition', rung: -1, name: 'Requisition', tone: 'harsh',
    extract: 0.28, resistance: 0.9, infamy: 0.02, pop: 0.0002, labour: 0, ruin: false,
    afterControl: -10, regard: -0.05,
    desc: 'The army lives off the land. Good income, a hostile population.',
  },
  military: {
    id: 'military', rung: 0, name: 'Military Government', tone: 'neutral',
    extract: 0.1, resistance: 0.2, infamy: 0, pop: 0, labour: 0, ruin: false,
    afterControl: 0, regard: 0,
    desc: 'Martial order and a modest levy on the occupied economy.',
  },
  civil: {
    id: 'civil', rung: 1, name: 'Civil Administration', tone: 'kind',
    extract: 0.04, resistance: -0.8, infamy: 0, pop: 0, labour: 0, ruin: false,
    afterControl: 30, regard: 0,
    desc: 'Local officials stay in place. Little income, little resistance, and a land that accepts us faster if we keep it.',
  },
};
export const OCCUPATION_LAW_IDS = Object.keys(OCCUPATION_LAWS)
  .sort((a, b) => OCCUPATION_LAWS[a].rung - OCCUPATION_LAWS[b].rung);
export const DEFAULT_OCCUPATION = 'military';

export const OCCUPATION = {
  POWER: 10,
  COOLDOWN: 13,
  /** Tam direniş çıktının bu payını saklar. */
  RESIST_DRAG: 0.7,
  /** Tam direnişte işgal gücünün haftada yitirdiği pay. */
  RESIST_ATTRITION: 0.004,
  /** Direnişin işgal bitince haftalık sönmesi. */
  RESIST_DECAY: 2,
  /** Ruin aralığı (hafta) ve tabanı. */
  RUIN_WEEKS: 52,
  /** Barışta devralınan state'in şikâyeti: direniş ÷ bu sayı. */
  GRIEVANCE_DIV: 10,
  /** Sahibin huzursuzluk hedefine tam direnişte eklenen. */
  RESIST_UNREST: 1.5,
};

// ------------------------------------------------------------ CEZA KAMPLARI ---

/**
 * Rejim ulus başınadır (ev ödevi testi): kamp kamp ayar yoktur.
 *   mortality  mahkûmların haftalık kaybı
 *   output     100 bin mahkûm başına el emeği çarpanı (HAND_OUTPUT × bu)
 *   severity   şöhretin, hareketin ve soydaş tepkisinin çarpanı
 *   penal      mahkûmların kuraya girebilen payı
 */
export const CAMP_REGIMES = {
  detention: {
    id: 'detention', rung: 0, name: 'Detention', mortality: 0.0003, output: 0.25, severity: 0.5, penal: 0,
    desc: 'Held behind the wire. Little work, the lowest toll.',
  },
  labour: {
    id: 'labour', rung: 1, name: 'Forced Labour', mortality: 0.0012, output: 1.0, severity: 1, penal: 0,
    desc: 'Inmates work the state\'s quarries and yards.',
  },
  penal: {
    id: 'penal', rung: 2, name: 'Penal Battalions', mortality: 0.0006, output: 0.3, severity: 1.2, penal: 0.25,
    desc: 'A quarter of the inmates can be drafted, whatever the citizenship law says.',
  },
  exhaustion: {
    id: 'exhaustion', rung: 3, name: 'Labour to Exhaustion', short: 'Exhaustion', mortality: 0.0035, output: 1.8, severity: 2, penal: 0,
    desc: 'The highest output and by far the highest toll. The world will not forget it.',
  },
};
export const CAMP_REGIME_IDS = Object.keys(CAMP_REGIMES)
  .sort((a, b) => CAMP_REGIMES[a].rung - CAMP_REGIMES[b].rung);
export const DEFAULT_REGIME = 'labour';

export const CAMP = {
  POWER: 60,
  OPEN_INFAMY: 6,
  /** Bir halkı kamplara göndermeye başlamanın şöhreti. */
  INTAKE_INFAMY: 3,
  /** Kamp sayısının tavanı: 1 + her 12 state için bir, en çok 3. */
  MAX: 3,
  PER_STATES: 12,
  /** İşaretli halkın her state'te haftada kampa taşınan payı. */
  INTAKE: 0.004,
  /** Taşınırken ölen pay. */
  TRANSIT_LOSS: 0.03,
  /** Kamp başına mahkûm tavanı (kişi). */
  CAPACITY: 1200000,
  /** Kamp state'inin huzursuzluk hedefine eklenen. */
  UNREST: 4,
  /** Gönderilen halkın yaşadığı her state'te pay × bu kadar huzursuzluk. */
  KIN_UNREST: 2,
  /** Haftalık şöhret: (taban + 100 bin mahkûm başına) × rejim. */
  INFAMY_BASE: 0.08,
  INFAMY_PER_UNIT: 0.01,
  /** Gönderilen halkın hareketine haftada eklenen (rejimle çarpılır). */
  MOVEMENT: 0.1,
  /** Soydaş devletin defterine haftada yazılan (rejimle çarpılır). */
  KIN_REGARD: 0.1,
  REGARD_WEEKS: 13,
  /** Kamp başına ulusal istikrar. */
  STABILITY: -0.015,
  /** Kamp düşman eline geçince bir kerelik şöhret. */
  EXPOSED_INFAMY: 12,
  /** Hareket bu ilerlemede ya da savaşta / Residency yasasında kapı açılır. */
  CRISIS_PROGRESS: 25,
};

// ------------------------------------------------------- KÜLTÜR KAYNAŞMASI ---

export const FUSION = {
  POWER: 120,
  /** Kaynaşacak halkın ulusal payı en az bu kadar olmalı. */
  MIN_SHARE: 0.03,
  MIN_STABILITY: 0.5,
  MIN_LITERACY: 0.15,
  /** Haftalık geçiş payı × (0.6 + okuryazarlık): yarı ömür ~4-5 yıl. */
  RATE: 0.0025,
  /** Ulusal pay bunun altına inince kaynaşma biter. */
  FINISH_SHARE: 0.02,
  /** Kaynaşan halkın yaşadığı state'lerde pay × bu kadar huzursuzluk. */
  UNREST: 0.6,
  /** Hak talebi haftada bu kadar söner. */
  DEMAND_FADE: 0.15,
  PRESTIGE: 5,
  AI_SHARE: 0.08,
  AI_STABILITY: 0.6,
};
