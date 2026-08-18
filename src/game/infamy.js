// Kötü şöhret (infamy) ve fethedilen toprağın maliyeti.
//
// Bu dosya tasarımın taşıyıcı fikrini uygular: fetih pahalıdır çünkü **dünya
// tepki verir**, biz katsayı koyduk diye değil. Şimdiye kadarki elle konmuş
// frenler (yolsuzluk, bakım) yerine buradaki mekanikler çalışır.
//
// Ürettiği kural: bir şehir + çevresini almak ~14 infamy, güvenli.
// Bir ülkeyi yutmak ~70, dünyayı üstüne çeker.

import {
  MAX_ATTACKERS_ON_TARGET, atWar, declareWar, nationStrength,
} from './diplomacy.js';
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

/**
 * ILHAK sohreti — fethin KALICI diplomatik bedeli.
 *
 * NEDEN: Open Beta 3'te olculdu (64 yillik kampanya, tohum OB3-1836): 40 yilda
 * ~48 kume ilhak eden oyuncunun sohreti hic 6,5'i gecmedi, koalisyon esigi ise
 * 22. Sebep yapisaldi — sohret yalniz ISGAL sirasinda birikiyordu, savaslar
 * 11 hafta suruyordu ve aradaki barista oransal azalma her seyi siliyordu.
 * Yani dunya, fethin kendisini hic gormuyordu; yalniz cephenin gecici izini
 * goruyordu.
 *
 * Artik asil kaynak masadir: ne kadar toprak, kac sehir, kac insan aldiysan
 * dunya onu hatirlar. Isgal sohreti oldugu gibi kalir (savasin kendisi de
 * rahatsiz edicidir) ama artik ikincil kalemdir.
 *
 * Olcek KALIBRE EDILDI. Ilk deneme iki kat yuksekti ve kacak bir dongu kurdu
 * (olculdu: zirve sohret 118-187, esik ustunde 2000+ ulke-hafta, koalisyonlar
 * surekli ates ediyor, o savaslar yeni ilhak uretiyor). Simdiki olcek: bos bir
 * sinir kumesi ~3, sehirli bir kume ~7; uc kumelik bir baris esigin (22)
 * eteklerine getiriyor, art arda iki boyle baris esigi asiyor.
 */
export const INFAMY_ANNEX = {
  PER_TILE: 0.4,
  PER_CITY: 3,
  /** Bu kadar nufus basina bir puan: kalabalik toprak daha cok rahatsiz eder. */
  POP_PER_POINT: 100000,
  /** Yabanci halki ilhak etmek pahalidir; kendi halkini kurtarmak ucuz. */
  FOREIGN: 1.4,
  OWN_CULTURE: 0.5,
};

export function addInfamy(nation, amount) {
  nation.infamy = Math.max(0, (nation.infamy ?? 0) + amount);
}

/** Tek kumeyi ilhak etmenin sohret bedeli. */
export function provinceAnnexInfamy(world, province, nation) {
  if (!province?.tileIdx?.length) return 0;
  let cities = 0;
  for (const idx of province.tileIdx) {
    if (world.tiles[idx]?.city) cities++;
  }
  const base = province.tileIdx.length * INFAMY_ANNEX.PER_TILE
    + cities * INFAMY_ANNEX.PER_CITY
    + (province.econ?.population ?? 0) / INFAMY_ANNEX.POP_PER_POINT;
  const ownPeople = province.culture >= 0 && province.culture === nation.culture;
  return base * (ownPeople ? INFAMY_ANNEX.OWN_CULTURE : INFAMY_ANNEX.FOREIGN);
}

/**
 * Baris masasinda devredilen kumelerin sohret bedelini uygular.
 * `signPeace` bunu devirden HEMEN SONRA cagirir; donen sayi toplam bedeldir.
 */
/**
 * @param {number} repeatScale Ayni kurbana TEKRARLANAN savasin carpani.
 *   Salam taktiginin olculen deligi buydu: yillik tek-kume barislari (~7 puan)
 *   baris donemi azalmasiyla tamamen siliniyor, esik (22) hic dolmuyordu.
 *   Dunya seri saldirgani hatirlar: ikinci savas x1.5, ucuncusu x2...
 */
export function annexInfamy(world, nation, provinces, repeatScale = 1) {
  if (!nation) return 0;
  let total = 0;
  for (const province of provinces ?? []) {
    total += provinceAnnexInfamy(world, province, nation);
  }
  total *= Math.max(1, repeatScale);
  if (total > 0) addInfamy(nation, total);
  return total;
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
    // Savas surerken dunya unutmaz: oransal azalma yalniz gercek bariste
    // isler. Yillik salam savaslarinda azalma pencereleri esigi hep bosaltip
    // freni olu birakiyordu (Beta 3 I-1: 40 yillik seri fetihte zirve 6.5/22).
    const atWarNow = world.nations.some((other) => other.alive
      && other.id !== nation.id && atWar(world, nation.id, other.id));
    const rate = INFAMY.DECAY_PER_TURN + (atWarNow ? 0 : current * INFAMY.DECAY_RATIO);
    addInfamy(nation, -rate);
  }
}

/**
 * Karenin verim çarpanı: taze işgal sıfır, yabancı halk eksik üretir.
 * Fethin 45-50 turda kâra geçmesini sağlayan yer burası.
 *
 * `cultureOrNation` bir kültür id'si YA DA ülke nesnesi olabilir: ülke
 * verilirse kabul edilen kültür listesi (accepted) tam sayılır — bileşik
 * monarşinin ikinci halkı "yabancı" değildir.
 */
export function tileEfficiency(tile, cultureOrNation, turn) {
  if (tile.owner < 0) return 1;
  if (isOccupied(tile)) return 0;
  const held = turn - (tile.heldSince ?? 0);
  if (held < OCCUPATION_TURNS) return 0;
  const nation = typeof cultureOrNation === 'object' && cultureOrNation !== null
    ? cultureOrNation : null;
  const primary = nation ? nation.culture : cultureOrNation;
  if (tile.culture >= 0 && primary >= 0 && tile.culture !== primary) {
    if (nation?.accepted?.includes(tile.culture)) return 1;
    return 1 - FOREIGN_YIELD_PENALTY;
  }
  return 1;
}

/**
 * Eşiği aşan ülkeye karşı koalisyon: temas hâlindeki barışçı komşular
 * birlikte savaş ilan eder. Kartopunun asıl freni bu.
 */
/**
 * Koalisyonun kendi erken cikisi. Nihai tavan `diplomacy.MAX_ATTACKERS_ON_TARGET`
 * ile AYNI sayidir ve asil koruma oradadir; buradaki kontrol yalnizca bosuna
 * zar atmayi onler.
 *
 * NEDEN NIHAI TAVAN BURADA DEGIL: koalisyon `ai.js`'in hedef kapisindan
 * gecmez. Ilhak sohreti devreye girince bu kacak bir yol oldu — olculdu
 * (tohum OB3-1836, tur 755): oyuncu uc cephedeyken dordunculeri eklendi.
 */
export const MAX_COALITION_ATTACKERS = MAX_ATTACKERS_ON_TARGET;

/**
 * Koalisyon zarinin haftalik gecme olasiligi. 0.5'ten 0.08'e: yarim ihtimal,
 * esigi gecen ulkeye birkac hafta icinde butun komsularini birden bindiriyordu.
 * Koalisyon nadir ve dramatik bir olay olmali, haftalik bir vergi degil.
 */
const COALITION_CHANCE = 0.08;

export function checkCoalitions(game, rng) {
  const world = game.world;
  const contacts = world.contacts;
  if (!contacts) return 0;
  let declared = 0;

  for (const target of world.nations) {
    if (!target.alive || (target.infamy ?? 0) < INFAMY_COALITION) continue;
    let fronts = 0;
    for (const other of world.nations) {
      if (other.alive && other.id !== target.id && atWar(world, other.id, target.id)) fronts++;
    }

    for (const other of world.nations) {
      if (!other.alive || other.id === target.id) continue;
      // Oyuncu koalisyona UYE yapilmaz (nihai kapi diplomacy.declareWar'dadir;
      // burada da eliyoruz ki bosuna zar atilmasin). Koalisyon oyuncuya KARSI
      // kurulabilir — hedef dongusu oyuncuyu haric tutmaz.
      if (other.id === game.turns?.playerNation) continue;
      if (atWar(world, other.id, target.id)) continue;
      if (fronts >= MAX_COALITION_ATTACKERS) break;
      if (!contacts[other.id][target.id]) continue;
      // Umutsuz derecede zayıf olan katılmaz; koalisyon intihar değil.
      if (nationStrength(world, other) < nationStrength(world, target) * 0.25) continue;
      if (rng() > COALITION_CHANCE) continue;
      if (declareWar(game, other.id, target.id, { reason: 'coalition' })) {
        declared++;
        fronts++;
        // Koalisyon OYUNCUYA karsi kurulduysa bu bir KRIZDIR: oyun durur.
        // CRISIS turu bastan beri tanimliydi ve hicbir yerden yayilmiyordu;
        // "esik 22, sohretim 33, hicbir sey olmadi" bulgusunun gorunur yuzu.
        if (target.id === game.turns?.playerNation) {
          game.turns.addLog(
            `${world.nations[other.id].name} joined a coalition against us — our infamy has united our neighbours.`,
            { kind: 'CRISIS' },
          );
        }
      }
    }
  }
  return declared;
}
