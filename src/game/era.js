// ÇAĞ BAŞLANGICI — 1900 dünyasının kuruluş tabloları. Saf veri, import yok.
//
// Tablolar kademe başınadır: [0 tarım ülkesi, 1 yarı sanayi, 2 sanayileşmiş]
// (nation.devTier, macro.js arketip planından). Kuruluşu yazan dosyalar
// (economy.initEconomy, politics.initPolitics, turn.start) buradan okur;
// dönemin başlangıcı değişirse yalnız bu dosya ve calendar.js değişir.
//
// NEREDEN GELDİ. Orta kademe, 1836 dünyasının başsız 64 yılda vardığı 1900
// halidir (3 tohum × 160×96, kademe medyanı): okuryazarlık ~%55, nüfus birimi
// başına ~0.6 fabrika, province başına ~2.9 demiryolu ve ~1 maden, kalkınma
// ~6.5, nüfus ×1.35-1.42, silah altında nüfusun ~%6'sı. Simülasyon oraya
// kademeleri ERİTEREK varıyordu — 64 yılda üç kademe de aynı yere yığılır.
// 1900 kuruluşu farkı geri getirir: sanayileşmiş çekirdekle tarım ülkesi
// arasındaki makas çağın ana gerilimidir ("sanayileş ya da ezil").

/** 1836 nüfus şablonunun katı (1836-1900 dünya nüfusu ~1.4 kat). */
export const START_POPULATION = 1.4;

/** Başlangıç okuryazarlığı ve onu taşıyan eğitim yasası (laws.js kademesi). */
export const START_LITERACY = [0.25, 0.5, 0.8];
export const START_EDUCATION = [0, 1, 2];

/** Kademeye göre hükûmet: 1900'de sanayi ülkeleri anayasalıdır. */
export const START_GOVERNMENT = ['absolutism', 'constitutional', 'constitutional'];

/**
 * Her province'e eklenen kalkınma (başkent ayrıca +1+kademe alır).
 * Kalkınma yuvayı (kalkınma + 1) da belirler: simülasyonun 1900 sanayi ülkesi
 * ~7 kalkınmada province başına ~2.8 fabrika, ~2.7 demiryolu ve ~1 madene yer
 * buluyordu; +3'te fabrika ve demiryolu yuvayı doldurup tersaneyi dışarıda
 * bırakıyordu (denizci imparatorluk tersanesiz başladı, ölçüldü).
 */
export const START_DEVELOPMENT = [1, 3, 4];
/** Kuruluşta kalkınma bu tavanı geçmez: üst kademeler çağın yatırımıdır. */
export const START_DEVELOPMENT_CAP = 8;

/**
 * Bina kademeleri. `factory` nüfus birimi (100 bin) başına; diğerleri
 * province başına ortalama (mine yataklı, dockyard kıyı province başına).
 * Yuva (kalkınma + 1) ve bina tavanı her zaman korunur. Tablo sırası
 * yerleşim sırasıdır: yuva önce gelene düşer.
 */
export const START_BUILDINGS = {
  // Az ve vazgeçilmez olanlar önce: tersane ve üniversite yuvasız kalmasın.
  dockyard: [0.1, 0.25, 0.4],
  university: [0, 0.05, 0.1],
  // Sanayi ülkesinin 0.6'sı simülasyonun 1900 tavanıdır (yuva bağlar).
  factory: [0.12, 0.35, 0.6],
  railway: [0.6, 2.0, 2.7],
  mine: [0.3, 0.8, 1.1],
  farm: [0.3, 0.5, 0.4],
  fort: [0.15, 0.3, 0.45],
  barracks: [0.05, 0.1, 0.1],
};

/** Nüfus birimi başına başlangıç teçhizat deposu. */
export const START_STOCK = {
  rifles: [2.0, 3.5, 5.0],
  guns: [0.2, 0.4, 0.6],
  ships: [0.5, 1.2, 1.8],
};

/**
 * Kuruluş ordusu: nüfus birimi başına alay (1 alay = 30 bin asker; 0.15 →
 * nüfusun ~%4.5'i). Simülasyonun 1900 dengesi ~0.25'ti (%6-7): YZ orduyu
 * havuz tavanına dek doldurur. Kuruluş onun altında kalır ki seferberlik
 * (askerlik yasası) bir karar olsun.
 */
export const START_ARMY = [0.12, 0.15, 0.17];
/** Kıyısında tersanesi olan ulusun kuruluş donanması (savaş gemisi alayı). */
export const START_FLEET = [0, 1, 3];

/** Başlangıç hazinesi: taban + nüfus birimi başına. */
export const START_GOLD = { base: 100, perUnit: 8 };
