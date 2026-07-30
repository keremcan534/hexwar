// Kötü şöhret (infamy) ve fethedilen toprağın maliyeti.
//
// Bu dosya tasarımın taşıyıcı fikrini uygular: fetih pahalıdır çünkü **dünya
// tepki verir**, biz katsayı koyduk diye değil. Şimdiye kadarki elle konmuş
// frenler (yolsuzluk, bakım) yerine buradaki mekanikler çalışır.
//
// Ürettiği kural: bir şehir + çevresini almak ~14 infamy, güvenli.
// Bir ülkeyi yutmak ~70, dünyayı üstüne çeker.

import { atWar, declareWar, nationStrength } from './diplomacy.js';

export const INFAMY = {
  /** Kendi halkının yaşadığı kareyi almak ucuz: haklı talep sayılır. */
  OWN_CULTURE_TILE: 0.5,
  FOREIGN_CULTURE_TILE: 1,
  CITY: 6,
  DECAY_PER_TURN: 1,
  /**
   * Şöhret ne kadar yüksekse o kadar hızlı unutulur. Sabit azalmayla ölçümde
   * 300. turda 1548'e çıkıyordu: eşik sistemi için anlamsız bir sayı ve fetihten
   * vazgeçen ülkenin toparlanma şansı yok. Oransal azalma doğal bir tavan verir.
   */
  DECAY_RATIO: 0.03,
};

/** Ticaret ortakları bu eşikten sonra anlaşmayı keser (6. adımda bağlanacak). */
export const INFAMY_TRADE_CUTOFF = 15;
/** Bu eşikten sonra komşular birleşip savaş ilan eder. */
export const INFAMY_COALITION = 30;

/** İşgalden sonra karenin hiç üretmediği tur sayısı. */
export const OCCUPATION_TURNS = 5;
/** Yabancı kültürlü karenin kalıcı verim kaybı. */
export const FOREIGN_YIELD_PENALTY = 0.3;
/** Bu kadar tur elde tutulan yabancı kare asimile olur. */
export const ASSIMILATION_TURNS = 40;

export function addInfamy(nation, amount) {
  nation.infamy = Math.max(0, (nation.infamy ?? 0) + amount);
}

/** Bir karenin ele geçirilmesinin şöhret bedeli. */
export function tileInfamy(tile, nation) {
  if (tile.culture >= 0 && tile.culture === nation.culture) return INFAMY.OWN_CULTURE_TILE;
  return INFAMY.FOREIGN_CULTURE_TILE;
}

export function decayInfamy(world) {
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    const current = nation.infamy ?? 0;
    addInfamy(nation, -(INFAMY.DECAY_PER_TURN + current * INFAMY.DECAY_RATIO));
  }
}

/**
 * Karenin verim çarpanı: taze işgal sıfır, yabancı halk eksik üretir.
 * Fethin 45-50 turda kâra geçmesini sağlayan yer burası.
 */
export function tileEfficiency(tile, nationCulture, turn) {
  if (tile.owner < 0) return 1;
  const held = turn - (tile.heldSince ?? 0);
  if (held < OCCUPATION_TURNS) return 0;
  if (tile.culture >= 0 && nationCulture >= 0 && tile.culture !== nationCulture) {
    return 1 - FOREIGN_YIELD_PENALTY;
  }
  return 1;
}

/** Uzun süre elde tutulan yabancı kareler sahibin kültürüne döner. */
export function runAssimilation(world, turn) {
  let converted = 0;
  world.forEach((tile) => {
    if (tile.owner < 0 || tile.culture < 0) return;
    const nation = world.nations[tile.owner];
    if (!nation?.alive || nation.culture < 0) return;
    if (tile.culture === nation.culture) return;
    if (turn - (tile.heldSince ?? 0) < ASSIMILATION_TURNS) return;
    // Yalnız kendi kültürüne komşu kareler asimile olur: yayılma kenardan gelir.
    const touching = world.neighbors(tile).some((n) => n.culture === nation.culture);
    if (!touching) return;
    tile.culture = nation.culture;
    tile.heldSince = turn;
    converted++;
  });
  return converted;
}

/**
 * Eşiği aşan ülkeye karşı koalisyon: temas hâlindeki barışçı komşular
 * birlikte savaş ilan eder. Kartopunun asıl freni bu.
 */
export function checkCoalitions(game, rng) {
  const world = game.world;
  const contacts = world.contacts;
  if (!contacts) return 0;
  let declared = 0;

  for (const target of world.nations) {
    if (!target.alive || (target.infamy ?? 0) < INFAMY_COALITION) continue;

    for (const other of world.nations) {
      if (!other.alive || other.id === target.id) continue;
      if (atWar(world, other.id, target.id)) continue;
      if (!contacts[other.id][target.id]) continue;
      // Umutsuz derecede zayıf olan katılmaz; koalisyon intihar değil.
      if (nationStrength(world, other) < nationStrength(world, target) * 0.25) continue;
      if (rng() > 0.5) continue;
      if (declareWar(game, other.id, target.id, { reason: 'coalition' })) declared++;
    }
  }
  return declared;
}
