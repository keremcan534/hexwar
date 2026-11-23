// Kötü şöhret (infamy) ve fethedilen toprağın maliyeti.
//
// Bu dosya tasarımın taşıyıcı fikrini uygular: fetih pahalıdır çünkü **dünya
// tepki verir**, biz katsayı koyduk diye değil. Şimdiye kadarki elle konmuş
// frenler (yolsuzluk, bakım) yerine buradaki mekanikler çalışır.
//
// Ürettiği kural: bir şehir + çevresini almak ~14 infamy, güvenli.
// Bir ülkeyi yutmak ~70, dünyayı üstüne çeker.

import {
  MAX_ATTACKERS_ON_TARGET, atWar, declareWar, nationStrength, attackerCount,
} from './diplomacy.js';
import { POPULATION_SCALE } from './populationScale.js';
import { mod } from './modifiers.js';
import { regardOf } from './relations.js';
import { DIP_AI, READ } from './dipDefs.js';

export const INFAMY = {
  /** Kendi halkının yaşadığı kareyi almak ucuz: haklı talep sayılır. */
  // 2026-11-23 (Kerem: "infamy çok kanser"): işgal izi masadaki bedelle
  // aynı boydaydı (aktif fatih sondası: 10 yılda işgal 122-145, masa 123-126)
  // ve geri verilen toprak da ödetiyordu. Kalıcı bedel masada kalır; işgal
  // savaşın geçici rahatsızlığıdır: 0.5/1/6 → 0.2/0.4/2.5.
  OWN_CULTURE_TILE: 0.2,
  FOREIGN_CULTURE_TILE: 0.4,
  CITY: 2.5,
  /**
   * Sabit azalma 1'den 0.05'e indirildi. 300 turluk oyunda savaşlar sıkışıktı
   * ve 1/tur işe yarıyordu; 5740 turluk ufukta fetih seyrekleşince azalma her
   * zaman kazanıyordu. Ölçüm: 109 yılda 471 kare el değiştirdi, hiçbir ülkenin
   * şöhreti 0'ın üstüne çıkmadı — yani fethin diplomatik bedeli hiç işlemedi.
   *
   * Artık asıl fren oransaldır (DECAY_RATIO, bugün %1.2/tur; ilk sürüm %3
   * idi): fethi bırakan ülke 1-3 yılda temizlenir (ölçüldü: tek ilhaklık
   * ~4.4 şöhret 62 haftada sıfırlandı).
   */
  // 0.05 → 0.08 ve oran 0.012 → 0.016 (2026-11-23): yeni barış kuralı
  // barış başına 2-3 küme verdiriyor; eski sönümle dört barışlık on yılın
  // %71-75'i koalisyon eşiğinin üstünde geçiyordu (sonda, bkz. TASARIM §12).
  DECAY_PER_TURN: 0.08,
  /**
   * 0.02'den 0.012'ye. Salam denge hesabi: yillik tek-kume barisi (ilhak ~7 x
   * tekrar carpani <=2.5 + isgal izi ~8) 0.02'de ~14'luk bir dengeye oturuyor
   * ve esik (22) HIC dolmuyordu (Beta 3 I-1: 40 yil seri fetih, zirve 6.5).
   * 0.012 ile seri saldirganin dengesi ~30'a cikar (fren isirir), tek savaslik
   * "bir sehir + cevresi" ~18'de kalir (guvenli kural korunur).
   *
   * NOT: "savasta oransal azalma dursun" denendi ve GERI ALINDI — donmus
   * savaslar on yillarca "savas hali" sayildigi icin sohret sinirsiz birikti
   * (olculdu: zirve 519-1141, esik ustu 4.7k-13k ulke-hafta, cullanma 6'ya
   * cikti). Azalma her hafta isler; fren orani, durdurma degil.
   */
  DECAY_RATIO: 0.016,
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
  // 0.4 -> 0.5 (2026-09-04): bos cepheye yuruyus acilinca (command.js
  // WALK_IN_SHARE) savaslar daha kesin bitiyor ve 50 yilda el degistiren
  // kume payi %31'den %39'a cikti (audit:war-pressure). Gem ordunun hizinda
  // degil dunyanin tepkisinde: seri fatih koalisyon esigine daha erken varir.
  // 0.5 → 0.4 (2026-11-23): barış kuralı küme başına daha geniş toprak verdiriyor.
  PER_TILE: 0.4,
  PER_CITY: 3,
  /** Bu kadar nufus basina bir puan: kalabalik toprak daha cok rahatsiz eder. */
  POP_PER_POINT: 100000 * POPULATION_SCALE,
  /** Yabanci halki ilhak etmek pahalidir; kendi halkini kurtarmak ucuz. */
  FOREIGN: 1.4,
  OWN_CULTURE: 0.5,
  /**
   * ANA YURT CARPANI. Bir halkin YURDUNU almak, sinir boyundan bir kasaba
   * almakla ayni fiyatta olamaz: dunya birincisini bir ulusun bogazlanmasi
   * sayar, ikincisini sinir duzeltmesi. Ayrim `province.homeland` uzerinden
   * kurulur (bkz. world/cultures.js) ve yalniz KABUL ETMEDIGIMIZ bir halkin
   * yurdu icin isler — kendi halkimizin ya da ortak ettigimiz bir halkin
   * yurdunu almak zaten ucuzdur.
   */
  HOMELAND: 1.4,
};

/**
 * Aynı kurbana TEKRARLANAN savaşın masa çarpanı (barış ve talep aynı kuralı
 * okur). 0.5 adım / ×2.5 tavan → 0.35 / ×2 (2026-11-23): iki komşuyla dönüşümlü
 * savaşan oyuncu üçüncü barışta ×2'ye çıkıp eşiği tek masada aşıyordu.
 */
export function repeatScaleOf(wars) {
  return Math.min(2, 1 + 0.35 * Math.max(0, (wars ?? 1) - 1));
}

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
  // `isAccepted` culture.js'tedir ama o dosya bu dosyayi import eder; kural
  // burada acikca kurulur ki import dongusu olusmasin (bkz. acceptedCultures).
  const accepted = nation.accepted?.length ? nation.accepted : [nation.culture];
  const homeland = province.homeland ?? -1;
  const foreignHomeland = homeland >= 0 && !accepted.includes(homeland);
  return base
    * (ownPeople ? INFAMY_ANNEX.OWN_CULTURE : INFAMY_ANNEX.FOREIGN)
    * (foreignHomeland ? INFAMY_ANNEX.HOMELAND : 1);
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

/**
 * Haftalık unutulma. Devlet adamı danışmanı hızlandırır (modifiers
 * 'infamyDecay'). Tek kaynak: bilgi kartı da bunu okur — eskiden kart
 * danışman çarpanını atlayıp yanlış hız gösteriyordu.
 */
export function infamyDecayOf(nation) {
  return (INFAMY.DECAY_PER_TURN + (nation?.infamy ?? 0) * INFAMY.DECAY_RATIO)
    * Math.max(0.2, 1 + mod(nation, 'infamyDecay'));
}

export function decayInfamy(world) {
  for (const nation of world.nations) {
    if (!nation.alive) continue;
    addInfamy(nation, -infamyDecayOf(nation));
  }
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
/**
 * DAIRESEL IMPORT TUZAGI. Eskiden `export const MAX_COALITION_ATTACKERS =
 * MAX_ATTACKERS_ON_TARGET;` yaziyordu ve bu, MODUL YUKLENIRKEN diplomacy.js'in
 * sabitini okuyordu. diplomacy.js de infamy.js'i import ettigi icin, giris
 * noktasi once diplomacy.js'e ulastiginda sabit henuz kurulmamis oluyor ve
 * yukleme "Cannot access 'MAX_ATTACKERS_ON_TARGET' before initialization" ile
 * cokuyordu (olculdu: `import('src/game/diplomacy.js')` ve hegemony.js tek
 * baslarina patliyor; oyunun kendi girisi game.js sirayi maskeliyor).
 * Fonksiyon CAGRILDIGINDA okur, yuklenirken degil.
 */
export function maxCoalitionAttackers() {
  return MAX_ATTACKERS_ON_TARGET;
}

/**
 * Koalisyon zarinin haftalik gecme olasiligi. 0.5'ten 0.08'e: yarim ihtimal,
 * esigi gecen ulkeye birkac hafta icinde butun komsularini birden bindiriyordu.
 * Koalisyon nadir ve dramatik bir olay olmali, haftalik bir vergi degil.
 */
export const COALITION_CHANCE = 0.06;

/**
 * KADEMELİ koalisyon (2026-11-23). Eskiden eşiğin bir puan üstü de iki katı da
 * haftada %8 zardı: eşiğe değen fatih bütün komşularını aynı hızla üstüne
 * çekiyordu. Artık eşikte uyarı kadar (%1.5), eşik + 10'da tam zar (%6),
 * eşik + 25'te kaçak fatihin bedeli (%10).
 */
export const COALITION_TIERS = [
  { over: 0, chance: 0.015, label: 'Wary' },
  { over: 10, chance: COALITION_CHANCE, label: 'Hostile' },
  { over: 25, chance: 0.10, label: 'United against' },
];

/** Şöhretin haftalık koalisyon zarı (eşiğin altında 0). */
export function coalitionChanceOf(infamy) {
  let chance = 0;
  for (const tier of COALITION_TIERS) {
    if ((infamy ?? 0) >= INFAMY_COALITION + tier.over) chance = tier.chance;
  }
  return chance;
}

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
      // Iki cephesi olan devlet koalisyona da binmez: ai.js'teki ayni kural,
      // yoksa ucuncu-dorduncu savas buradan geliyordu (audit:war-pressure).
      if (attackerCount(world, other.id) >= 2) continue;
      if (fronts >= maxCoalitionAttackers()) break;
      if (!contacts[other.id][target.id]) continue;
      // Umutsuz derecede zayıf olan katılmaz; koalisyon intihar değil.
      if (nationStrength(world, other) < nationStrength(world, target) * 0.25) continue;
      // Sevilen ülkeye koalisyon zor kurulur (R3): yalnız OLUMLU ilişki zarı
      // küçültür, kimsenin sevilmediği yerde taban aynı; zar sayısı değişmez.
      const liked = DIP_AI.relations
        ? 1 - Math.max(0, Math.min(READ.COALITION_CAP, regardOf(world, other.id, target.id))) / READ.COALITION_DIV
        : 1;
      if (rng() > coalitionChanceOf(target.infamy) * liked) continue;
      if (declareWar(game, other.id, target.id, { reason: 'coalition' })) {
        declared++;
        fronts++;
        // Koalisyon OYUNCUYA karsi kurulduysa bu bir KRIZDIR: oyun durur.
        // CRISIS turu bastan beri tanimliydi ve hicbir yerden yayilmiyordu;
        // "esik 22, sohretim 33, hicbir sey olmadi" bulgusunun gorunur yuzu.
        if (target.id === game.turns?.playerNation) {
          game.turns.addLog(
            `${world.nations[other.id].name} joined a coalition against us — our infamy has united our neighbours.`,
            { kind: 'CRISIS', urgent: true },
          );
        }
      }
    }
  }
  return declared;
}
