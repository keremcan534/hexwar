// Kötü şöhret (infamy) ve fethedilen toprağın maliyeti.
//
// Bu dosya tasarımın taşıyıcı fikrini uygular: fetih pahalıdır çünkü **dünya
// tepki verir**, biz katsayı koyduk diye değil. Şimdiye kadarki elle konmuş
// frenler (yolsuzluk, bakım) yerine buradaki mekanikler çalışır.
//
// Ürettiği kural: bir şehir + çevresini almak ~14 infamy, güvenli.
// Bir ülkeyi yutmak ~70, dünyayı üstüne çeker.

import { atWar, declareWar, nationStrength } from './diplomacy.js';
import { isOccupied } from './control.js';

export const INFAMY = {
  /** Kendi halkının yaşadığı kareyi almak ucuz: haklı talep sayılır. */
  OWN_CULTURE_TILE: 0.5,
  FOREIGN_CULTURE_TILE: 1,
  CITY: 6,
  /**
   * Sabit azalma 1'den 0.05'e indirildi. 300 turluk oyunda savaşlar sıkışıktı
   * ve 1/tur işe yarıyordu; 5740 turluk ufukta fetih seyrekleşince azalma her
   * zaman kazanıyordu. Ölçüm: 109 yılda 471 kare el değiştirdi, hiçbir ülkenin
   * şöhreti 0'ın üstüne çıkmadı — yani fethin diplomatik bedeli hiç işlemedi.
   *
   * Artık asıl fren oransaldır: %3/tur unutulma, sürekli fetihte ~33 puanlık
   * bir denge noktası verir ve bu tam da koalisyon eşiğidir (INFAMY_COALITION).
   * Fethi bırakan ülke birkaç on yılda temizlenir.
   */
  DECAY_PER_TURN: 0.05,
  /**
   * 0.03'ten 0.02'ye. Denge noktası kazanç/oran olduğu için 0.03, eşiğe
   * ulaşmayı ~0.95 kare/tur sürekli işgale bağlıyordu; savaş WW1 hızına
   * çekildikten sonra bu tempoya kimse ulaşamıyor (ölçüldü: 6 tohumda zirve
   * 11-24, koalisyon hiç kurulmadı).
   */
  DECAY_RATIO: 0.02,
};

/**
 * Bu eşikten sonra komşular birleşip savaş ilan eder.
 *
 * 30'dan 22'ye. Eşik, oyunun artık üretmediği bir fetih hızına göre
 * ayarlanmıştı. Kazancı büyütmek yerine eşiği indirdik: böylece yukarıdaki
 * "bir şehir + çevresi ~14, güvenli" kuralı korunur, ama sürekli fetheden
 * ülke gerçekten dünyayı üstüne çeker (bkz. war-tempo-diagnostic).
 */
export const INFAMY_COALITION = 22;

/** İşgalden sonra karenin hiç üretmediği tur sayısı. */
export const OCCUPATION_TURNS = 5;
/** Yabancı kültürlü karenin kalıcı verim kaybı. */
export const FOREIGN_YIELD_PENALTY = 0.3;

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
    const rate = INFAMY.DECAY_PER_TURN + current * INFAMY.DECAY_RATIO;
    addInfamy(nation, -rate);
  }
}

/**
 * Karenin verim çarpanı: taze işgal sıfır, yabancı halk eksik üretir.
 * Fethin 45-50 turda kâra geçmesini sağlayan yer burası.
 */
export function tileEfficiency(tile, nationCulture, turn) {
  if (tile.owner < 0) return 1;
  if (isOccupied(tile)) return 0;
  const held = turn - (tile.heldSince ?? 0);
  if (held < OCCUPATION_TURNS) return 0;
  if (tile.culture >= 0 && nationCulture >= 0 && tile.culture !== nationCulture) {
    return 1 - FOREIGN_YIELD_PENALTY;
  }
  return 1;
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
