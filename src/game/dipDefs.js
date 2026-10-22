// DİPLOMASİ SABİTLERİ — ilişki defteri, elçi, ittifak, garanti, saldırmazlık,
// toprak talebi, vassal özerkliği (TASARIM §12; şartname
// scripts/audit/_tmp/pass/design/diplomacy.md).
//
// Bu dosya HİÇBİR ŞEY import etmez (econ/defs.js gibi): ai.js, alliances.js,
// diplomacy.js, politics.js modül yüklenirken buradan sabit okur ve bir
// içe-alma döngüsü TDZ'ye ("before initialization") düşürmesin.
//
// Her sayının gerekçesi yanında: bir sayı ancak okuyan bir eşik varsa
// yaşar (TASARIM ilke 5); okuyucusu ölçümde ölü çıkan kol kapatılır,
// ayarlanmaz.

/**
 * YZ KOLLARI. Oyunda hepsi açık. Denetim tezgâhı `DIP_ARMS` ortam
 * değişkeniyle kapatır (scripts/audit/harness.mjs): hepsi kapalıyken YZ
 * bugünkü kararların AYNISINI verir (parmak izi bayt bayt, şartname §18.1).
 * Oyuncunun kendi elle yaptığı (elçi, garanti, pakt) kollardan bağımsızdır.
 */
export const DIP_AI = {
  alliances: true,  // allianceAppeal: bozulma bekleme süresi + şöhret > 30 kapısı (DIP-03)
  relations: true,  // defterin YZ okuyucuları: ittifak çekiciliği, kin, koalisyon, ittifak bozma
  guarantees: true, // YZ garanti verir (oyuncunun verdiği her zaman sayılır)
  pacts: true,      // YZ oyuncuya pakt önerir, paktı feshi bildirir (YZ-YZ paktı ölçüldü, silindi; mevcut pakt her zaman bağlar)
  demands: true,    // YZ savaştan önce toprak talep eder
  vassals: true,    // vassal-efendi savunma bağı, özerklik, vassalın kendi dış siyaseti yok
  envoys: true,     // YZ elçi gönderir
  proposals: true,  // YZ → oyuncu bekleyen teklifler (ittifak, pakt, garanti isteği)
  passage: true,    // aynı cephedekilere geçiş + withdrawTrespassers / ikmal / runPassages düzeltmesi
};

/** Kol adları (tezgâh ve denetim listesi için). */
export const DIP_ARM_IDS = Object.keys(DIP_AI);

/**
 * SAVAŞ KAPISI. Değerler ai.js'in bugünkü sabitleridir (taşındılar, değişmediler).
 * ai.js kendi adlarını buradan tanımlar ki diğer kullanımları aynı kalsın.
 */
export const WAR_GATE = {
  THRESHOLD: 1.8,
  ALLY_WEIGHT: 0.5,
  MAX_ATTACKERS: 2,
  MIN_REGIMENTS: 4,
  BILL_STRAIN: 0.45,
  MIN_STABILITY: 0.35,
  MIN_WAR_SUPPORT: 0.3,
  MIN_POWER: 20,
  NO_WAR_EXHAUSTION: 0.30,
  INFAMY_SHARE: 0.6,
};

/**
 * Çeyreklik YZ diplomasi adımının haftası (turn % 13). İttifak taraması
 * turn % 13 === 0'da koşar: ikisi aynı haftaya binmesin, tur dilimi şişmesin.
 */
export const QUARTER_OFFSET = 7;
export const QUARTER = 13;

/**
 * İLİŞKİ DEFTERİ. Gözlemci başka bir ulusun ona ne yaptığını hatırlar; her
 * kayıt haftada %1 söner (yarı ömür 69 hafta): bir ilişki yaklaşık bir
 * yıllık iştir ve yılların kini kalıcı değildir.
 */
export const REGARD = {
  DECAY: 0.99,
  /** Bu mutlak değerin altına inen kayıt silinir: defter kendi kendini budar. */
  PRUNE: 0.5,
  MIN: -100,
  MAX: 100,
  /** "fades by" satırı: |değer| bu sayının altına inince iz gitmiş sayılır. */
  FADE: 5,
};

/**
 * Defterin TEK yazıcıları. Etiket gözlemcinin ağzından ("How X regards us").
 * Büyüklükler okuyuculara göre (şartname §4.2):
 *   +25 tek bir onurlu çağrı ≈ bir ittifak çekiciliği puanı.
 *   −30 tarafsız bir müttefiği −25 bozma çizgisinin altına iter: reddedilen
 *       çağrı bir sonraki çeyreklik taramada ortaklığı bitirir. +25 kredisi
 *       olan müttefik bir reddi (−5) atlatır, ikincisini atlatamaz.
 *   −40 sebepsiz bozma çifti yaklaşık bir yıl ayrı tutar.
 *   −60 sırttan bıçak kurbanı 87 hafta −25'in altında tutar.
 */
export const DEEDS = {
  envoy: { d: 0.8, label: 'Envoy at our court' },
  honoured_call: { d: 25, label: 'Answered our call' },
  refused_call: { d: -30, label: 'Left us alone when we were attacked' },
  broke_alliance: { d: -40, label: 'Broke our alliance' },
  guaranteed_us: { d: 20, label: 'Guarantees our independence' },
  revoked: { d: -15, label: 'Withdrew their guarantee' },
  abandoned: { d: -40, label: 'Abandoned us under threat' },
  pact: { d: 10, label: 'Non-aggression pact' },
  denounced: { d: -15, label: 'Denounced our pact' },
  pact_broken: { d: -60, label: 'Broke our pact and attacked' },
  faithless: { d: -10, label: 'Broke faith with others' },
  attacked_us: { d: -30, label: 'Declared war on us' },
  demanded: { d: -20, label: 'Demanded our land' },
  yielded_to: { d: -20, label: 'Forced a cession on us' },
  took_land: { d: -10, label: 'Took our land' },
  vassalized: { d: -20, label: 'Made us their vassal' },
  freed_us: { d: 30, label: 'Granted us freedom' },
  embargoed_us: { d: -20, label: 'Embargoes us' },
  named_rival: { d: -20, label: 'Named us their rival' },
  declined_offer: { d: -10, label: 'Rebuffed our proposal' },
};

/** Toprak kaybı kaydı province başına −10, tek barışta en çok 4 province (−40). */
export const TOOK_LAND_MAX = 4;
/** Sözünden dönen ortağın diğer ortaklarına yazılan kayıt: terk −10, pakt ihlali −20. */
export const FAITHLESS = { abandoned: 1, pact_broken: 2 };

/**
 * DEFTERİN OKUYUCULARI (şartname §4.3). Her biri oyuncunun bir bilgi
 * kartında gördüğü sayıdır.
 *   ALLIANCE_DIV: +40 elçi = +1.6 çekicilik. Tek başına eşiğe (2) varmaz,
 *     bir yapısal sebeple (ortak rakip 1.5, ortak tehdit 1.5) varır: elçi
 *     ittifakı MÜMKÜN kılar, bedava değil.
 *   (BAR_DIV yok: sevilene saldırmak için ×(1 + ilişki/100) üstünlük, R2a,
 *     dokuz koşuda tek kararı döndürmedi ve silindi; bkz. pacts.aggressionOdds.)
 *   GRUDGE_DIV: olumsuz kayıt, uygun hedefler arasında öne geçirir (uygun
 *     olmayanı uygun yapmaz).
 *   COALITION_CAP/DIV: sevilen ülkeye koalisyon zarı en çok yarıya iner
 *     (+25'te; şartnamenin geri dönüşü §18.7-3, ilk sürüm +50'de sıfırdı).
 *     ÖLÇÜM: bu değişiklik 160×96 × 3 tohum × 20 yılda tek koalisyon ilanını
 *     değiştirmedi (45 / 60 / 55, aynen); census'taki −%24 / −%27 koalisyon
 *     farkı savaş gidişatından gelir, aynı kurallarla zar kayması da −%18 /
 *     −%22 / −%26 veriyor. YZ-YZ'de etkisi görülmedi; oyuncu için (şöhretli
 *     oyuncunun elçisi) ölçülmedi.
 */
export const READ = {
  ALLIANCE_DIV: 25,
  GRUDGE_DIV: 100,
  COALITION_CAP: 25,
  COALITION_DIV: 50,
  /** Bu değerin altında YZ ittifakı bozar, paktı feshi bildirir, garanti kabul etmez. */
  BREAK: -25,
  NAP_DIV: 25,
  DEMAND_DIV: 50,
};

/**
 * ELÇİ — barışın kaldıracı (DIP-05'in bilgi kartı nihayet çekilebilir bir
 * kola işaret eder). RATE 0.8: ilişki ~bir yıllık iş (+25 37 haftada, +40
 * 69 haftada). UPKEEP 0.2: iki elçi gelirin ~%30'u. SLOTS 2: iki kalıcı
 * görev, ulus başına tık değil (ev ödevi testi).
 */
export const ENVOY = {
  SLOTS: 2,
  RATE: 0.8,
  CAP: 40,
  UPKEEP: 0.2,
  /** YZ elçiyi ancak yasaları finanse ederken gönderir. */
  AI_MIN_POWER: 60,
  AI_TWO_POWER: 200,
  AI_RECALL_POWER: 30,
  /** YZ önce bu özerkliği aşan kendi vassalına gönderir. */
  AI_AUTONOMY: 40,
};

/**
 * İTTİFAK KURALLARI. Tek eşik (DIP-08): oyuncunun teklifi de YZ-YZ de 2.
 * BREAK_POWER 10: sebepsiz bozmanın bir fiyatı olsun, bir ceza değil.
 * COOLDOWN 104: bozulan çift iki yıl yeniden kurulmaz (DIP-03 sarkacı:
 * Marirria-Kazoria 18 ayda 4 tur). 52 ile audit:diplomacy "kur → boz → kur
 * 104 hafta içinde" değişmezini iki çiftte deldi (kuruldu 66, bozuldu 92,
 * yeniden 157): kısa ömürlü ittifak bir yıl sonra geri geliyordu.
 */
export const ALLIANCE_RULES = {
  APPEAL: 2,
  /** YZ oyuncuya ancak oyuncunun gözünden bu çekicilik varsa teklif eder (oyuncu kendi karar verir). */
  PLAYER_PLAUSIBLE: 0,
  BREAK_POWER: 10,
  BREAK_INFAMY: 30,
  COOLDOWN: 104,
  /** Bu kadar yeni bir "bizi yalnız bıraktı" kaydı bozmaya sebeptir. */
  CAUSE_WEEKS: 104,
  /** Sebepli bozma: −40'ın 15/40'ı = −15. */
  CAUSE_SCALE: 15 / 40,
};

/** Oyuncuya düşen çağrı: savaşın başlamasından bu kadar hafta sonra cevapsız sayılır. */
export const CALL = { AFTER_WAR: 4 };

/**
 * OYUNCUNUN MASASI. Panel bir yapılacaklar listesine dönmesin: en çok üç açık
 * teklif, teklifler arası 4 hafta, aynı gönderen yılda bir.
 * Çağrı ve talep KAPIYA TAKILMAZ: onlar sonuçtur, öneri değil.
 */
// Şartname geri dönüşü §18.7-6, ölçümle (160×96, STAT1-3 × 20 yıl, pasif
// oyuncu): GAP 8 / aynı gönderen 52 → yılda 0.45-0.70 teklif; GAP 4 /
// 26 → 0.65-1.0 (kapı bağlamıyordu, kaynak bağlıyordu); paktın "rakip de
// meşguliyettir" kolu eklenince (pacts.aiPacts) 2.9-3.5, 58-70 teklifin
// 48-62'si pakt: aynı komşu her 26 haftada bir yeniden sorabiliyordu.
// Gönderen bekleme süresi bu yüzden yine 52 (yılda bir kez).
export const DESK = {
  ANSWER: 13,
  MAX_OPEN: 3,
  GAP: 4,
  SENDER_COOLDOWN: 52,
};

/**
 * BAĞIMSIZLIK GARANTİSİ — tek yönlü savunma sözü.
 * COST 20 = haklı savaş: garanti önceden ödenmiş savunma gerekçesidir.
 * UPKEEP 0.15: tampon devlet sistemi süren bir siyasi faturadır.
 * MAX 3: ev ödevi sınırı, çağrıları da sınırlar.
 * RATIO 1.5: yalnız açık ara güçlü devlet garanti verir; 0.5 ağırlıkla
 * 1.8 kat üstün bir saldırganı eşiğin altına çekmeye yeter.
 */
export const GUARANTEE = {
  COST: 20,
  UPKEEP: 0.15,
  MAX: 3,
  RATIO: 1.5,
  AI_GREAT_POWERS: 8,
  AI_MAX: 2,
  AI_MIN_POWER: 100,
  AI_MAX_EXHAUSTION: 0.3,
  ABANDON_PRESTIGE: 5,
  /** Devredilmiş bakanlık garanti isteğini ancak bu SG ile kabul eder. */
  DELEGATED_MIN_POWER: 60,
};

/**
 * SALDIRMAZLIK PAKTI — beş yıl.
 * COST 15 < haklı savaş 20: barış satın almak savaştan ucuz.
 * WEEKS 260: en uzun ateşkesin (208) bir adım ötesi.
 * NOTICE 26: fesih bir uyarıdır, pusu değil; pusu ayrı ve fiyatlı ihlaldir.
 * BREACH_INFAMY 8: bir sırttan bıçak ≈ koalisyon eşiğinin üçte biri.
 * AI_MIN_POWER 35 = pakt 15 + YZ'nin savaşa hazır kalmak için tuttuğu 20.
 */
export const NAP = {
  COST: 15,
  WEEKS: 260,
  NOTICE: 26,
  RENEW_WINDOW: 26,
  EXPIRY_CARD: 13,
  VERDICT: 1,
  PLAYER_PLAUSIBLE: -1,
  BREACH_INFAMY: 8,
  MAX: 3,
  AI_MAX: 2,
  AI_MIN_POWER: 35,
  AI_PEER: 0.5,
  AI_DENOUNCE_INFAMY: 22,
};

/**
 * TOPRAK TALEBİ — "{province}'i ver ya da savaş".
 * COST 25 = haklı savaş + 5 diplomatik sermaye; ret savaşı bedava yapar.
 * YIELD_INFAMY_SHARE 0.75 × ilhak şöhreti: bırakılan province savaş yolunun
 * bedeline yakın (işgal şöhreti yok, ilhak şöhreti var).
 * TRUCE 104: verilen province iki yıllık sükûnet alır; 52 olsaydı aynı çift
 * her yıl sıkıştırılırdı.
 * FOLLOW_RATIO 1.5: YZ reddi 1.5'te savaşla izler (1.8 açılış eşiğinin
 * hemen altı: söz vermiştir); müttefikler oranı çökerttiyse geri adım atar.
 */
export const DEMAND = {
  COST: 25,
  ISSUE_INFAMY: 2,
  WINDOW: 4,
  CB_WEEKS: 52,
  TRUCE: 104,
  YIELD_INFAMY_SHARE: 0.75,
  PRESTIGE: 5,
  FOLLOW_RATIO: 1.5,
  MAX_EXHAUSTION: 0.30,
  SHOWN: 3,
  MAX_TARGET_ATTACKERS: 3,
  MAX_OWN_HOSTILE: 2,
};

/**
 * VASSAL ÖZERKLİĞİ (0-100, VASSALIZE anlaşmasında saklanır).
 * hedef = 10 (haraç) + 60 × min(1.5, güç oranı) − 0.5 × ilişki + 40 × efendinin yorgunluğu.
 * Masadan çıkan tipik vassal (efendi 2.5× güçlü) barışta 34-44'te durur,
 * efendisi yorulunca 50'yi geçer. STEP 0.5: 0'dan 50'ye 100 hafta.
 */
export const AUTONOMY = {
  BASE: 10,
  POWER: 60,
  POWER_CAP: 1.5,
  REGARD: 0.5,
  EXHAUSTION: 40,
  STEP: 0.5,
  WARN: 50,
  NO_ANNEX: 50,
  PLAYER_INDEPENDENCE: 60,
  BREAK: 80,
  LEAVE_EXHAUSTION: 0.6,
  AI_RELEASE: 90,
  START_DOMINION: 30,
};

/** RAKİP İLANI (DIP-05): 25 SG, iki yıl kilit, refreshRivals'ın güç tabanı. */
export const RIVAL = { COST: 25, LOCK: 104, MIN_RATIO: 0.6 };
