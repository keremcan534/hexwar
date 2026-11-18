// Partisyon: üç kaydın hangi bölümü hangi duyguyu taşır.
//
// Yeni ses üretilmez, bütün vurgular kayıtların içindeki gerçek anlardır.
// Sentezle yazılan vurgular oyuncu kulağında "8 bit" kaldı; orkestranın kendi
// vuruşu aynı salonda, aynı çalgılarla çalar.
//
// Saniyeler 250 ms zarf ölçümünden okundu (-dB değerleri tepe RMS):
//   Vanguard  69.5-71.2 nefes (-34), 71.6 tam orkestra girişi (-13)
//             218-220.9 sönüş (-40), 221.0 son vuruş (-10), 234'e dek söner
//   The Climb 172-200 içe çekilen orta bölüm (-24), 201.8 yeniden yükseliş
//             326.3 ve 330.3 yumuşak son vuruşlar, 344'te sessizlik
//   Age of Wonder 248-346 final, 346.5'te son akor söner
//   Legionnaire 12.7 tam giriş, sonra 5.65 sn'lik cümleler (41.0, 91.8, 148.3)
//   Absolution 92.7 yaylıların patlaması (+17.7 dB), 176-243 süzülen orta
//             bölüm, 244-292 son büyük cümle, 326'da sessizlik
//
// Yeni parça eklemek: TRACKS'e kayıt, burada bölüm, MOODS listesine ad.

import { TRACKS } from './musicTracks.js';

const {
  ageOfWonder: WONDER, vanguard: VANGUARD, theClimb: CLIMB, legionnaire: LEGION, absolution: SORROW,
} = TRACKS;

/** tail: bölüm sonundaki kısılma (sn). Kayıt kendi sönüyorsa kısa tutulur. */
const cut = (track, from, to, tail = 3) => ({ track, from, to, tail });

export const SECTIONS = {
  // Vanguard: savaşın ve gerginliğin omurgası.
  warOutbreak: cut(VANGUARD, 70.4, 218.8, 1.5),
  warLong: cut(VANGUARD, 22.6, 218.8, 1.5),
  warMiddle: cut(VANGUARD, 109.4, 218.8, 1.5),
  warLate: cut(VANGUARD, 141.7, 218.8, 1.5),
  dread: cut(VANGUARD, 0, 69.6, 1.5),
  dreadRising: cut(VANGUARD, 22.6, 69.6, 1.5),
  capitalFall: cut(VANGUARD, 220.7, 234.4, 0.5),
  worldShock: cut(VANGUARD, 22.7, 32, 3),

  // Legionnaire: yürüyen ordu, ikinci savaş sesi.
  legionFull: cut(LEGION, 0, 183.5, 1),
  legionOutbreak: cut(LEGION, 11.6, 183.5, 1),
  legionCharge: cut(LEGION, 40.6, 183.5, 1),
  legionMiddle: cut(LEGION, 91.4, 183.5, 1),
  legionLate: cut(LEGION, 147.9, 183.5, 1),

  // Absolution: yenilginin ve yasın sesi.
  sorrowBuild: cut(SORROW, 0, 88, 3),
  sorrowPeak: cut(SORROW, 92.2, 175.5, 3),
  sorrowFloat: cut(SORROW, 176.5, 243.5, 3),
  sorrowFinal: cut(SORROW, 244, 326, 1.5),
  sorrowEnd: cut(SORROW, 308, 326, 1.5),

  // The Climb: barış ve toparlanma.
  // İlk 31 saniye -40 dB: harita açılırken müzik hiç yokmuş gibi duyuluyordu.
  climbWhole: cut(CLIMB, 31, 344, 2),
  climbMiddle: cut(CLIMB, 172, 344, 2),
  climbRise: cut(CLIMB, 105.25, 170.5, 3),
  climbAscent: cut(CLIMB, 200.6, 296, 5),
  hush: cut(CLIMB, 172, 200.4, 3),
  climbOutro: cut(CLIMB, 296, 344, 2),
  climbWarm: cut(CLIMB, 304, 326, 4),
  uplift: cut(CLIMB, 200.6, 222, 5),

  // Age of Wonder: imparatorluk havası ve final.
  wonderWhole: cut(WONDER, 0, 348.6, 1),
  wonderMiddle: cut(WONDER, 164, 348.6, 1),
  wonderOpen: cut(WONDER, 0, 60, 4),
  wonderLull: cut(WONDER, 216, 244, 4),
  wonderFinale: cut(WONDER, 248, 348.6, 1),
  wonderLast: cut(WONDER, 330, 348.6, 1),
};
for (const [id, section] of Object.entries(SECTIONS)) section.id = id;

/**
 * Ruh hâlleri. `rank` yükselen gerilim anında, inen birkaç saniye oturunca
 * gelir. `list` sırayla döner; savaş listesindeki sakin bölümler kasıtlı:
 * savaş müziği uzun cephede kesintisiz çalınca kısa sürede bıktırır.
 * `gap`: bölümler arası sessizlik aralığı (sn).
 */
export const MOODS = {
  peace: { rank: 0, gap: [20, 45], list: ['climbWhole', 'wonderMiddle', 'climbMiddle', 'wonderWhole'] },
  uneasy: { rank: 1, gap: [12, 25], list: ['dread', 'wonderOpen', 'sorrowFloat', 'hush', 'wonderLull'] },
  tension: { rank: 2, gap: [2, 4], list: ['dreadRising', 'hush', 'dread'] },
  war: {
    rank: 3,
    gap: [1.5, 3],
    list: ['hush', 'legionFull', 'wonderLull', 'warLong', 'wonderOpen', 'legionCharge', 'hush', 'warMiddle'],
  },
  warWinning: {
    rank: 3,
    gap: [1.5, 3],
    list: ['legionMiddle', 'climbRise', 'wonderFinale', 'warLate', 'climbAscent', 'legionLate'],
  },
  warLosing: { rank: 3, gap: [2, 5], list: ['sorrowBuild', 'hush', 'sorrowPeak', 'dread', 'sorrowFloat'] },
  epilogue: { rank: 4, gap: [30, 60], list: ['climbOutro', 'wonderOpen', 'sorrowFloat'] },
};

/** Savaşın patlayışı sırayla değişir: kırk beş yılda aynı vuruş eskir. */
export const OUTBREAKS = ['warOutbreak', 'legionOutbreak'];

export const isWarMood = (mood) => mood === 'war' || mood === 'warWinning' || mood === 'warLosing';

/** Geçiş süreleri (sn): eski bölümün kısılışı ve yenisinin gelişi. */
export const FADES = {
  open: { out: 2, in: 3 },
  calm: { out: 7, in: 7 },
  rise: { out: 4, in: 4 },
  turn: { out: 6, in: 6 },
  // Vuruş kaydın içinde: yeni bölüm nefesin ortasından girer, eski hızla çekilir.
  hit: { out: 0.9, in: 0.15 },
  moment: { out: 1.5, in: 0.6 },
  resume: { out: 3, in: 5 },
};

/**
 * Anlık vurgular. Yatağın üstüne bindirilmez, onun yerini alır: iki ayrı
 * tondaki orkestra üst üste çalınca vurgu değil gürültü olur.
 * Büyük öncelik küçüğü keser; `cooldown` yüksek hızda üst üste gelen olayları
 * tek vurguya indirir.
 */
export const MOMENTS = {
  campaignWon: { section: 'wonderFinale', fade: 'moment', priority: 5, cooldown: 0 },
  campaignLost: { section: 'sorrowFinal', fade: 'moment', priority: 5, cooldown: 0 },
  capitalFall: { section: 'capitalFall', fade: 'hit', priority: 4, cooldown: 60 },
  capitalTaken: { section: 'uplift', fade: 'moment', priority: 2, cooldown: 60 },
  peaceWon: { section: 'wonderLast', fade: 'moment', priority: 2, cooldown: 30 },
  peaceLost: { section: 'sorrowEnd', fade: 'moment', priority: 2, cooldown: 30 },
  peaceWhite: { section: 'climbWarm', fade: 'moment', priority: 2, cooldown: 30 },
  worldShock: { section: 'worldShock', fade: 'moment', priority: 1, cooldown: 90 },
};
