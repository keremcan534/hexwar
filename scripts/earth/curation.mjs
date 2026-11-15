// EARTH için elle hazırlanan bilgi: bölgeler, çapalar, dar geçitler, denetim çiftleri.
//
// Koordinatlar [boylam, enlem] (derece). Bölge çokgenleri kaba çizilir: bölge
// bir ROLÜN alanıdır, ülke sınırı değil (ülkeleri tohum çizer). Çokgenler
// sırayla denenir, ilk eşleşen kazanır; küçük kara kütleleri (ada) sonra üye
// çoğunluğuyla tek bölgeye oturur, anakaradaki boşluk en yakın bölgeyle dolar.

// Ortak sınırlar: iki komşu çokgen aynı köşe dizisini paylaşsın, arada boşluk
// ya da bindirme kalmasın.
const DURAND = [ // Afganistan | Britanya Hindistanı (kuzeyden güneye)
  [74.9, 37.1], [71.5, 36.9], [71.0, 36.0], [71.5, 35.0], [70.0, 34.0], [69.5, 33.0],
  [69.3, 31.9], [68.0, 31.5], [66.5, 29.9], [62.5, 29.4], [61.0, 29.8], [62.4, 28.3],
  [63.3, 27.2], [61.8, 26.2], [61.6, 25.0],
];
const HIMALAYA = [ // Hindistan | Tibet ve Burma (batıdan doğuya)
  [74.9, 37.1], [77.0, 35.9], [79.6, 35.5], [79.2, 32.5], [81.0, 30.2], [85.0, 28.6],
  [88.2, 27.9], [92.0, 27.8], [95.5, 28.5], [97.3, 27.8], [95.0, 26.5], [94.2, 23.9],
  [93.3, 22.0], [92.6, 21.0],
];
const THRACE = [ // Doğu Trakya + Ege adaları | Balkanlar (kuzeyden güneye)
  [27.9, 42.0], [26.2, 41.7], [26.0, 40.6], [25.8, 39.9], [26.2, 37.0], [27.0, 35.3], [25.0, 33.6],
];
const US_MEXICO = [ // batıdan doğuya
  [-117.1, 32.53], [-114.7, 32.72], [-111.07, 31.33], [-108.21, 31.33], [-108.21, 31.78],
  [-106.53, 31.78], [-104.9, 30.6], [-104.5, 29.6], [-103.1, 29.0], [-102.4, 29.8],
  [-101.4, 29.77], [-100.3, 28.3], [-99.5, 27.5], [-99.1, 26.5], [-97.15, 25.95],
];
const rev = (list) => [...list].reverse();

/** Bölge kuralları: sırayla denenir. lonShift: çokgen 180°'yi aşıyorsa boylama 360 eklenerek de denenir. */
export const REGIONS = [
  {
    zone: 'kistak', // Meksika + Orta Amerika
    polygon: [
      ...US_MEXICO, [-96.0, 26.0], [-94.5, 22.0], [-90.0, 22.5], [-86.0, 22.0], [-86.5, 18.0],
      [-83.0, 16.0], [-82.0, 12.0], [-82.2, 9.6], [-79.9, 9.7], [-77.35, 8.7], [-77.9, 7.2],
      [-80.0, 6.5], [-86.0, 9.0], [-92.0, 13.0], [-96.0, 14.5], [-106.0, 18.5], [-112.0, 21.0],
      [-115.5, 27.0], [-118.5, 29.0], [-118.5, 32.53],
    ],
  },
  {
    zone: 'yeni-guney', // Güney Amerika
    polygon: [
      [-77.35, 8.7], [-75.5, 11.0], [-71.5, 12.8], [-68.0, 12.9], [-61.0, 11.2], [-58.0, 8.5],
      [-50.0, 5.5], [-28.0, -2.0], [-28.0, -60.0], [-82.0, -60.0], [-82.0, 1.0], [-79.5, 4.0],
      [-78.0, 6.9], [-77.9, 7.2],
    ],
  },
  {
    zone: 'yeni-kuzey', // Kuzey Amerika, Grönland, Arktik adalar
    polygon: [
      [-169.0, 84.0], [-10.0, 84.0], [-10.0, 77.0], [-17.0, 72.0], [-26.0, 68.0], [-30.0, 64.5],
      [-40.0, 58.5], [-50.0, 46.0], [-60.0, 40.0], [-74.0, 34.0], [-79.4, 27.6], [-79.6, 25.2],
      [-80.5, 24.3], [-82.5, 24.3], [-84.0, 24.8], [-90.0, 25.8], [-96.0, 26.0], ...rev(US_MEXICO),
      [-118.5, 32.53], [-125.0, 33.0], [-135.0, 50.0], [-160.0, 51.0], [-172.0, 50.5],
      [-180.0, 50.5], [-180.0, 60.0], [-174.0, 62.0], [-170.5, 64.1], [-169.0, 65.3],
    ],
  },
  { zone: 'yeni-kuzey', polygon: [[172.0, 50.5], [180.0, 50.5], [180.0, 55.5], [172.0, 55.5]] }, // batı Aleutlar
  {
    zone: 'korsan-adalari', // Karayipler (anakara yukarıda alındı)
    polygon: [
      [-86.0, 10.0], [-59.0, 10.0], [-59.0, 27.6], [-79.4, 27.6], [-79.6, 25.2], [-80.5, 24.3],
      [-86.0, 22.0],
    ],
  },
  // Avustralya ve Yeni Zelanda: yerleşimci sınırı (yeni-kuzey rolü).
  { zone: 'yeni-kuzey', polygon: [[112.0, -10.65], [154.5, -10.65], [154.5, -45.0], [112.0, -45.0]] },
  { zone: 'yeni-kuzey', polygon: [[165.0, -33.5], [179.99, -33.5], [179.99, -48.0], [165.0, -48.0]] },
  {
    zone: 'dogu-adalari', // Japonya ve güney Kuriller
    polygon: [
      [129.7, 33.0], [129.7, 34.8], [131.3, 35.5], [135.5, 36.0], [139.0, 38.8], [139.5, 41.3],
      [139.6, 42.5], [140.8, 45.6], [145.9, 45.6], [151.5, 46.8], [152.0, 45.5], [146.5, 42.5],
      [142.0, 35.5], [141.0, 33.0], [132.0, 29.5], [129.5, 29.5],
    ],
  },
  {
    zone: 'dogu-adalari', // Ryukyu ve Tayvan (1895'ten beri Japon)
    polygon: [
      [119.4, 21.5], [123.0, 21.5], [131.5, 28.0], [131.5, 31.0], [129.3, 31.0], [122.5, 25.8],
      [119.4, 25.6],
    ],
  },
  {
    zone: 'guney-yarimada', // Hindistan alt kıtası (Belucistan, Keşmir, Bengal, Seylan)
    polygon: [
      ...rev(DURAND), ...HIMALAYA, [92.0, 20.0], [90.0, 15.0], [82.0, 5.5], [78.0, 5.0],
      [72.5, 7.0], [66.0, 22.0],
    ],
  },
  {
    zone: 'kavsak', // Anadolu, Güney Kafkasya, Levant, Mezopotamya, Arabistan, İran, Afganistan, Mısır, Libya
    polygon: [
      [11.6, 33.2], [12.5, 33.9], ...rev(THRACE), [28.6, 42.2], [31.0, 42.1], [36.0, 42.3],
      [41.5, 42.0], [40.0, 43.45], [42.0, 43.25], [44.6, 42.75], [46.4, 41.9], [48.6, 41.85],
      [50.5, 41.0], [51.5, 39.0], [53.5, 37.4], [54.0, 37.35], [56.0, 38.1], [57.5, 37.9],
      [59.5, 37.3], [61.2, 36.6], [62.5, 35.3], [64.5, 36.2], [66.6, 37.35], [68.5, 37.2],
      [70.0, 37.6], [71.5, 37.9], ...DURAND, [60.5, 21.5], [56.0, 16.5], [52.5, 13.5],
      [45.0, 12.4], [43.4, 12.6], [41.5, 14.5], [38.5, 18.5], [36.8, 22.0], [31.3, 22.0],
      [25.0, 22.0], [24.0, 19.5], [16.0, 23.4], [11.6, 24.3], [10.0, 24.8], [9.4, 26.2],
      [9.8, 30.3],
    ],
  },
  {
    zone: 'dogu-ovasi', // Çin, Tibet, Doğu Türkistan, Mançurya, Kore, Çinhindi, Malaya
    polygon: [
      ...HIMALAYA, [92.0, 20.0], [94.2, 16.0], [97.0, 13.0], [97.8, 8.5], [98.2, 7.8],
      [99.3, 6.6], [100.0, 5.3], [100.6, 3.6], [101.4, 2.2], [103.3, 1.1], [104.5, 1.25],
      [104.5, 2.0], [104.0, 3.5], [102.8, 6.5], [104.2, 8.0], [106.0, 8.0], [109.5, 11.5],
      [109.5, 15.5], [107.5, 17.5], [108.0, 21.0], [109.5, 17.8], [111.5, 18.0], [111.5, 21.0],
      [114.5, 21.8], [117.0, 23.0], [118.8, 23.4], [119.4, 25.6], [121.8, 28.0], [122.6, 31.0],
      [122.5, 34.5], [123.0, 37.4], [124.0, 37.8], [125.0, 34.0], [126.5, 33.0], [129.0, 34.6],
      [129.6, 35.5], [129.7, 37.5], [130.0, 40.5], [130.8, 42.3], [131.2, 42.9], [131.3, 44.0],
      [133.0, 45.0], [134.7, 48.3], [132.0, 47.7], [130.6, 48.9], [127.5, 49.8], [125.5, 52.9],
      [121.0, 53.3], [119.7, 52.5], [117.8, 49.6], [116.0, 47.8], [119.5, 46.5], [114.0, 45.0],
      [111.8, 43.6], [105.0, 41.6], [96.5, 42.7], [91.0, 45.2], [87.8, 49.1], [85.5, 47.1],
      [82.6, 47.2], [80.2, 45.0], [80.2, 42.2], [75.5, 40.5], [73.6, 39.5],
    ],
  },
  {
    zone: 'baharat-adalari', // Endonezya, Filipinler, Borneo, Yeni Gine, Melanezya
    polygon: [[92.0, 21.2], [128.0, 21.2], [128.0, 3.0], [182.0, 3.0], [182.0, -23.0], [92.0, -23.0]],
  },
  {
    zone: 'yogun-bati', // Avrupa: Rus İmparatorluğu çekirdeğinin batısı (Finlandiya, Baltık, Lehistan dahil)
    polygon: [
      [-32.0, 36.5], [-30.0, 64.5], [-26.0, 68.0], [-17.0, 72.0], [-10.0, 77.0], [-10.0, 84.0],
      [35.0, 84.0], [35.0, 79.0], [32.0, 72.0], [30.9, 69.7], [29.0, 69.0], [30.0, 67.7],
      [29.0, 66.1], [30.0, 64.8], [31.6, 62.9], [30.0, 60.1], [28.2, 59.4], [27.4, 58.0],
      [28.0, 56.5], [26.6, 55.6], [24.5, 53.9], [23.5, 53.9], [24.0, 52.0], [24.1, 50.8],
      [22.6, 49.1], [22.1, 48.4], [24.0, 47.9], [26.6, 48.3], [28.2, 45.5], [29.7, 45.2],
      [30.5, 44.5], [28.6, 42.0], ...THRACE, [24.0, 34.5], [20.0, 35.0], [15.0, 35.6],
      [12.5, 35.3], [11.5, 36.6], [10.0, 37.6], [8.5, 37.4], [3.0, 37.2], [-1.5, 36.3],
      [-4.5, 36.05], [-5.6, 36.0], [-6.5, 36.2], [-10.0, 36.0],
    ],
  },
  { zone: 'guney-kita', polygon: [[-26.0, 37.6], [55.0, 37.6], [55.0, -36.0], [-26.0, -36.0]] }, // Afrika
  { zone: 'kuzey-bozkiri', polygon: [[20.0, 30.0], [191.0, 30.0], [191.0, 84.0], [20.0, 84.0]] }, // Avrasya'nın kalanı
];

/** Hiçbir çokgene düşmeyen ada: uzak okyanus. */
export const FALLBACK_ZONE = 'acik-deniz';

/** Bölge çapaları [enlem, boylam]: rolü bölge düzeyinde arayan arketipler ve koloni/üs havuzu. */
export const ZONE_ANCHORS = {
  'yogun-bati': [50.0, 8.0],
  'kuzey-bozkiri': [50.0, 75.0],
  'kavsak': [33.3, 44.4],
  'guney-yarimada': [23.0, 85.0], // Bengal: Britanya Hindistanı Kalküta'dan büyüdü
  'dogu-ovasi': [34.5, 113.5],
  'dogu-adalari': [36.0, 139.0],
  'baharat-adalari': [-2.0, 113.0],
  'guney-kita': [5.0, 20.0],
  'yeni-kuzey': [45.0, -95.0],
  'kistak': [19.4, -99.1],
  'korsan-adalari': [21.5, -79.0],
  'yeni-guney': [-23.5, -58.0],
  'acik-deniz': [21.3, -157.9],
  'ic-deniz': [35.5, 18.0], // Akdeniz
  'sicak-korfez': [27.0, 51.0], // Basra Körfezi
};

/**
 * Rol çapaları [enlem, boylam]: büyük gücün büyümeye başladığı gerçek yer.
 * Ülkeyi, adını ve sınırını yine tohum çizer; çapa yalnız başlangıç noktasıdır.
 */
export const ROLE_ANCHORS = {
  'denizci-imparatorluk': [52.5, -1.5], // İngiltere
  'bilesik-monarsi': [48.2, 16.4], // Tuna havzası
  'kuzey-imparatorlugu': [55.75, 37.6], // Moskova
  'kavsak-imparatorlugu': [40.0, 32.5], // Anadolu
  'dogu-devi': [34.5, 113.5], // Orta Ova
  'yeni-federasyon': [40.0, -76.0], // Atlantik kıyısı
  'ada-modernlesicisi': [35.7, 139.7], // Kantō
  'dogu-kralligi': [13.75, 100.5], // Menam ovası
  'dogu-beyligi': [37.5, 127.0], // Kore
  'dogu-koyu-beyligi': [20.0, 97.0], // Şan dağları ve Burma
  'kiyi-kralligi': [6.5, -1.5], // Gine kıyısı
  'yarimada-beyligi': [17.4, 78.5], // Dekken
  'bozkir-hanligi': [40.5, 64.5], // Maveraünnehir
  'bozkir-boyu': [47.5, 70.0], // Kazak bozkırı
  'kistak-devleti': [10.5, -85.0], // Orta Amerika kıstağı
  'kavsak-beyligi': [32.5, 51.7], // İran yaylası
};

/**
 * Dar geçitler: hex ~250 km iken rasterde kapanan ya da açılan yerler.
 * water: çizgi boyunca kara hex suya döner (deniz yolu açık kalsın).
 * land: çizgi boyunca su hex karaya döner (kıstak kopmasın).
 *
 * Çizgiler komşu hex MERKEZLERİNDEN geçer: iki komşu merkez arasındaki doğru
 * yalnız o iki hexe değer, böylece çizgi tam seçilen hexleri değiştirir. Uzun
 * serbest çizgi sağlam kara hexlerini de siliyordu (Hampshire %80, Bursa %79).
 * Merkezler projeksiyona bağlıdır: mercek değişirse --probe ile yeniden seç,
 * bağlantı denetimi (SEA_LINKS, LAND_LINKS) kaymayı yakalar.
 */
export const PASSAGES = [
  // Tanca (%55) suya döner; Alboran zaten su. Endülüs (Málaga %71) kalır.
  { name: 'Cebelitarık', kind: 'water', line: [[-7.65, 35.21], [-5.71, 35.39], [-3.85, 35.55]] },
  // Marmara hexi zaten su: Gelibolu (%69) Ege'ye, İzmit (%60) Karadeniz'e açar.
  // İstanbul hexi (%51) kara kalır, şehir boğazın başında durur.
  { name: 'Çanakkale-İstanbul', kind: 'water', line: [[24.79, 40.85], [26.26, 40.79], [27.67, 40.74], [29.03, 40.68], [29.58, 41.6]] },
  { name: 'Kerç', kind: 'water', line: [[36.4, 45.6], [36.6, 45.2], [36.7, 44.8]] },
  // Yalnız Dover boğazının hexi (bugün kendiliğinden su, %48): kapanmasın diye.
  { name: 'Manş', kind: 'water', line: [[1.1, 50.9], [1.5, 51.05]] },
  { name: 'Kuzey Kanalı', kind: 'water', line: [[-6.2, 54.3], [-5.6, 55.0], [-6.0, 55.6]] },
  // Kattegat → Sund → Baltık: korunan Zelanda kuzeyi (%31) suya döner, Fyn-Zelanda (%54) kalır.
  { name: 'Sund', kind: 'water', line: [[11.17, 57.09], [11.95, 56.12], [12.72, 55.16]] },
  { name: 'Otranto', kind: 'water', line: [[18.5, 40.6], [19.0, 40.0], [19.2, 39.5]] },
  // Kızıldeniz bir sütun su; Aden kıyı hexi (%52) Aden Körfezi'ne açar.
  { name: 'Bab-ül Mendeb', kind: 'water', line: [[48.13, 12.71], [45.58, 13.21], [43.06, 13.75]] },
  // Bugün kendiliğinden açık; kapanmasın diye Hürmüz hexinden geçer.
  { name: 'Hürmüz', kind: 'water', line: [[52.61, 26.5], [55.89, 25.63], [59.24, 24.82]] },
  // Singapur'da boğaz 15 km: Johor hexi (%65) suya döner, Sumatra kıyısı kalır.
  { name: 'Malakka', kind: 'water', line: [[99.2, 5.8], [100.9, 3.4], [102.1, 1.8], [104.4, 1.4]] },
  { name: 'Bering', kind: 'water', line: [[-169.0, 64.8], [-168.9, 65.8], [-168.8, 66.9]] },
  { name: 'Süveyş kıstağı', kind: 'land', line: [[32.2, 31.2], [32.4, 30.5], [32.5, 29.95]] },
  { name: 'Panama', kind: 'land', line: [[-83.5, 10.0], [-82.0, 9.0], [-80.5, 8.4], [-79.6, 9.1], [-78.5, 8.8], [-77.4, 8.1]] },
  { name: 'Orta Amerika', kind: 'land', line: [[-92.0, 15.5], [-89.0, 14.0], [-86.8, 13.2], [-85.5, 11.5], [-84.0, 10.3]] },
  // Kra kıstağı ve Patani: yarımada 250 km'lik hexte yer yer %30'a iner.
  { name: 'Kra', kind: 'land', line: [[98.75, 11.31], [99.88, 9.38], [101.0, 7.45], [102.13, 5.51]] },
];

/** Denetim: bu iki deniz noktası arasında su yolu OLMALI. */
export const SEA_LINKS = [
  ['Atlas Okyanusu', [-20, 40], 'Akdeniz', [18, 35]],
  ['Akdeniz', [18, 35], 'Karadeniz', [34, 43.5]],
  ['Karadeniz', [34, 43.5], 'Azak', [36.8, 46.0]],
  ['Kuzey Denizi', [3, 56], 'Baltık', [19, 57]],
  ['Akdeniz', [18, 35], 'Adriyatik', [15, 43]],
  ['Hint Okyanusu', [65, 10], 'Kızıldeniz', [38, 20]],
  ['Hint Okyanusu', [65, 10], 'Basra Körfezi', [51, 27]],
  ['Hint Okyanusu', [85, 5], 'Güney Çin Denizi', [112, 12]],
  ['Pasifik', [-170, 55], 'Arktik', [-170, 70]],
  ['Atlas Okyanusu', [-20, 40], 'Hudson Körfezi', [-85, 60]],
  ['Atlas Okyanusu', [-20, 40], 'Beyaz Deniz', [38, 65.5]],
  ['Atlas Okyanusu', [-20, 40], 'Meksika Körfezi', [-90, 25]],
  ['Atlas Okyanusu', [-20, 40], 'Pasifik', [-140, 20]],
];

/** Denetim: bu iki kara noktası arasında kara yolu OLMALI. */
export const LAND_LINKS = [
  ['Paris', [2.3, 48.8], 'Moskova', [37.6, 55.7]],
  ['Moskova', [37.6, 55.7], 'Pekin', [116.4, 39.9]],
  ['Pekin', [116.4, 39.9], 'Delhi', [77.2, 28.6]],
  ['Kahire', [31.2, 30.0], 'Kudüs', [35.2, 31.8]],
  ['Kahire', [31.2, 30.0], 'Karoo', [21.0, -32.0]],
  ['Madrid', [-3.7, 40.4], 'Paris', [2.3, 48.8]],
  ['Roma', [12.5, 41.9], 'Paris', [2.3, 48.8]],
  ['Jutland', [9.3, 56.2], 'Paris', [2.3, 48.8]],
  ['Stockholm', [18.0, 59.3], 'Helsinki', [25.0, 60.2]],
  ['Pahang', [102.5, 4.5], 'Bangkok', [100.5, 13.75]],
  ['Seul', [127.0, 37.5], 'Pekin', [116.4, 39.9]],
  ['Washington', [-77.0, 38.9], 'Meksiko', [-99.1, 19.4]],
  ['Meksiko', [-99.1, 19.4], 'Panama', [-79.5, 9.0]],
  ['Panama', [-79.5, 9.0], 'Bogota', [-74.1, 4.7]],
  ['Bogota', [-74.1, 4.7], 'Buenos Aires', [-58.4, -34.6]],
];

/** Denetim: bu iki kara noktası arasında kara yolu OLMAMALI. */
export const LAND_SPLITS = [
  ['Londra', [-0.1, 51.5], 'Paris', [2.3, 48.8]],
  ['Dublin', [-6.3, 53.3], 'Londra', [-0.1, 51.5]],
  ['Tokyo', [139.7, 35.7], 'Seul', [127.0, 37.5]],
  ['Taipei', [121.5, 25.0], 'Fuzhou', [119.3, 26.1]],
  ['Küba', [-79.5, 22.0], 'Florida', [-81.5, 28.0]],
  ['Antananarivo', [47.5, -18.9], 'Maputo', [32.6, -25.9]],
  ['Hobart', [147.3, -42.9], 'Melbourne', [145.0, -37.8]],
  ['Palembang', [104.8, -3.0], 'Pahang', [102.5, 4.5]],
  ['Anchorage', [-149.9, 61.2], 'Anadır', [177.5, 64.7]],
  ['Port Moresby', [147.2, -9.4], 'Cairns', [145.8, -16.9]],
];
