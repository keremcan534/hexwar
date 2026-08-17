// Makro dünya ROLLERİ: bölge kuralları, arketip ülke planı, kültür yoğunluğu.
//
// Bölgelerin fiziksel BİÇİMİ burada değil geography.js'te yaşar; burası o
// bölge kimliklerinin siyasi/ekonomik anlamını taşır. Coğrafya şablonu
// değişse de roller (yoğun-batı, kuzey imparatorluğu, kavşak, doğu devi,
// yarımada kolonisi, güney kıtası, ada zincirleri) sabit kalır.
//
// Tasarım: docs/makro-dunya.md · Fiziksel üretim: docs/cografya.md
//
// Katman notu: saf veri; DOM'suz, game'siz.

/**
 * Bölge kuralları: province boyu (kıyı/iç), nüfus çarpanı, gelişim kademesi.
 * Boy hedefi bölünme kotasıdır; sınır/iç bölge iri province'lerle okunur kalır.
 */
export const ZONE_RULES = {
  'yogun-bati': { size: [4, 5], popMul: 1.6, dev: 2 },
  'dogu-adalari': { size: [4, 4], popMul: 1.3, dev: 2 },
  'kavsak': { size: [6, 7], popMul: 1.3, dev: 1 },
  // İri province: koloni sayısı yönetilebilir kalsın, nüfus çarpanı devleşsin.
  'guney-yarimada': { size: [8, 10], popMul: 2.6, dev: 0 },
  'dogu-ovasi': { size: [6, 8], popMul: 3.0, dev: 0 },
  'yeni-guney': { size: [7, 10], popMul: 0.8, dev: 0 },
  'yeni-kuzey': { size: [8, 13], popMul: 0.55, dev: 1 },
  'kistak': { size: [5, 6], popMul: 0.8, dev: 0 },
  'korsan-adalari': { size: [3, 3], popMul: 0.8, dev: 0 },
  'baharat-adalari': { size: [3, 3], popMul: 0.9, dev: 0 },
  'kuzey-bozkiri': { size: [11, 15], popMul: 0.6, dev: 0 },
  'guney-kita': { size: [9, 15], popMul: 0.7, dev: 0 },
  'acik-deniz': { size: [5, 8], popMul: 0.6, dev: 0 },
};

/** Bölgesiz (başıboş gürültü adası) kareler için varsayılan. */
export const DEFAULT_ZONE = 'acik-deniz';

/**
 * Arketip ülke planı. Sıra yerleşim önceliğidir: büyükler yer kapar,
 * küçükler kalan dokuyu doldurur. provinces = çekirdek hedefi (küme).
 */
export function archetypePlan(rng) {
  return [
    {
      role: 'denizci-imparatorluk', zone: 'yogun-bati', coastal: true,
      provinces: rng.int(14, 18), dev: 2, extraCity: true,
      // Yarımadanın ~üçte biri: 15-25 koloni province'i — yönetilebilir ama
      // nüfus çarpanıyla imparatorluğun ekonomik bel kemiği.
      colony: { zone: 'guney-yarimada', share: 0.3 },
      bases: { zone: 'baharat-adalari', provinces: 2 },
    },
    {
      role: 'dogu-devi', zone: 'dogu-ovasi',
      provinces: rng.int(24, 32), dev: 0, extraCity: true,
    },
    {
      role: 'kuzey-imparatorlugu', zone: 'kuzey-bozkiri',
      provinces: rng.int(24, 31), dev: 0, extraCity: true, acceptNeighbors: 1,
    },
    {
      role: 'bilesik-monarsi', zone: 'yogun-bati',
      provinces: rng.int(14, 20), dev: 1, extraCity: true, acceptNeighbors: 2,
    },
    {
      role: 'kavsak-imparatorlugu', zone: 'kavsak',
      provinces: rng.int(12, 18), dev: 1, acceptNeighbors: 1,
    },
    {
      role: 'yeni-federasyon', zone: 'yeni-kuzey', coastal: true,
      provinces: rng.int(10, 16), dev: 1, extraCity: true,
    },
    {
      role: 'ada-modernlesicisi', zone: 'dogu-adalari',
      provinces: rng.int(5, 8), dev: 2,
    },
    {
      role: 'dogu-kralligi', zone: 'dogu-ovasi',
      provinces: rng.int(5, 9), dev: 0,
    },
    // Devin gölgesindeki beylikler: haraç kuşağı, ileride nüfuz sahası.
    ...Array.from({ length: 2 }, () => ({
      role: 'dogu-beyligi', zone: 'dogu-ovasi', provinces: rng.int(3, 6), dev: 0,
    })),
    // Doku ülkeleri: rol adı taşımazlar, bölgesel çeşitliliği verirler.
    ...Array.from({ length: rng.int(4, 6) }, () => ({
      role: 'guney-cumhuriyeti', zone: 'yeni-guney', provinces: rng.int(5, 9), dev: 0,
    })),
    ...Array.from({ length: rng.int(7, 10) }, () => ({
      role: 'bati-devleti', zone: 'yogun-bati', provinces: rng.int(3, 12), dev: 1,
    })),
    ...Array.from({ length: rng.int(3, 4) }, () => ({
      role: 'kiyi-kralligi', zone: 'guney-kita', coastal: true, provinces: rng.int(4, 7), dev: 0,
    })),
    {
      role: 'yarimada-beyligi', zone: 'guney-yarimada', provinces: rng.int(3, 6), dev: 0,
    },
    // Bozkırın güney ucunda hanlık: kuzey devinin yumuşak karnı.
    {
      role: 'bozkir-hanligi', zone: 'kuzey-bozkiri', provinces: rng.int(4, 7), dev: 0,
    },
    // Kıstağın kapı bekçisi: ince köprünün stratejik sahibi.
    {
      role: 'kistak-devleti', zone: 'kistak', provinces: rng.int(2, 4), dev: 0,
    },
    // Doku kuyruğu: standart dünyayı ~70 devlete taşıyan küçük prenslikler.
    // Vic2 yoğunluğu referansı — büyük güçler yerleştikten sonra doğdukları
    // için harita rollerini bozmaz, diplomasiye yem ve tampon olurlar.
    // Güney kıtasına BİLEREK dokunulmaz: orası kolonizasyon alanıdır ve
    // audit:world içinin %70'inin gelişmemiş yerelde kalmasını şart koşar.
    ...Array.from({ length: rng.int(3, 5) }, () => ({
      role: 'bozkir-boyu', zone: 'kuzey-bozkiri', provinces: rng.int(2, 5), dev: 0,
    })),
    ...Array.from({ length: rng.int(3, 4) }, () => ({
      role: 'dogu-koyu-beyligi', zone: 'dogu-ovasi', provinces: rng.int(2, 5), dev: 0,
    })),
    ...Array.from({ length: rng.int(2, 3) }, () => ({
      role: 'kavsak-beyligi', zone: 'kavsak', provinces: rng.int(2, 4), dev: 0,
    })),
  ];
}

/**
 * Bölge başına kültür sayısı: kimlik dokusunun yoğunluğu.
 *
 * Sayılar bilinçli olarak yüksek. Eskiden toplam 22 kültür vardı ve harita
 * kocaman tek renk bloklar hâlinde okunuyordu; gerçek atlasta bir kıtada
 * onlarca halk yaşar ve sınırlar onların üstünden geçer. Yoğun-batı en
 * parçalı olan (Avrupa rolü), kavşak en karışık olan; kolonizasyon bölgeleri
 * seyrek kalır. Tohum sayısı ayrıca bölgenin kara alanıyla kısılır, yani
 * küçük haritada bu tavana ulaşılmaz (bkz. cultures.generateCultures).
 */
export const ZONE_CULTURES = {
  'yogun-bati': 6,
  'kuzey-bozkiri': 3,
  'kavsak': 4,
  'dogu-ovasi': 3,
  'guney-yarimada': 3,
  'yeni-kuzey': 2,
  'yeni-guney': 3,
  'guney-kita': 7,
  'dogu-adalari': 2,
  'kistak': 2,
  'baharat-adalari': 2,
  'korsan-adalari': 1,
};

/**
 * Bölgenin dil ailesi. Aynı ailedeki halklar birbirine kolay karışır, yabancı
 * aile zor (bkz. cultures.diffuse). Aile adı kültür adının da ekini belirler,
 * böylece komşu halkların adları akraba duyulur.
 */
export const ZONE_FAMILY = {
  'yogun-bati': 'Valdic',
  'kuzey-bozkiri': 'Torvic',
  'kavsak': 'Sarnic',
  'dogu-ovasi': 'Eshan',
  'guney-yarimada': 'Meridic',
  'yeni-kuzey': 'Norric',
  'yeni-guney': 'Aurenic',
  'guney-kita': 'Zanhari',
  'dogu-adalari': 'Kelani',
  'kistak': 'Sarnic',
  'baharat-adalari': 'Kelani',
  'korsan-adalari': 'Aurenic',
};
