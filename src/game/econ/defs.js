// ULUSLAR ÇAĞI ekonomisinin veri tabloları. Formül YOK — yalnız sabitler.
//
// Bir sayı değişecekse burada değişir; sistem dosyaları (output, bills,
// investment, resources, industry, trade) bu tablolardan okur. Sayıların
// gerekçesi TASARIM.md'de, ölçülmüş ayarları ise yanlarındaki notta durur.
//
// TEK ÇUBUK (2026-10-15). Eski ekonomi altın + sekiz bina + inşaat kuyruğuydu:
// AUTO oyuncu gelirinin %48-68'ini inşaata, %19-24'ünü bina bakımına, yalnız
// %7-11'ini orduya harcıyordu; inşaatsız aynı oyuncuda hazine 16-37 bine
// yığılıyordu (istatistik panosu, 3 tohum × 45 yıl). Kerem: "binaları kaldırıp
// sadece IC ile devam ederiz, HOI3'teki gibi dağıtırız, ekstraya kaynak
// çıkmaz". Şimdi tek akış var: state'ler ÇIKTI (IC) üretir, faturalar önden
// düşer, ordu hatları yasanın tavanına kadar çeker, halk doyurulur, kalanı
// kalkınmaya gider. Altın, vergi, borç, enflasyon ve binalar yoktur.
//
// Katman notu: hiçbir şey import etmez (döngü riski sıfır).

/** Nüfus birimi: ekonomi formüllerinin hepsi "100 bin kişi başına" yazılır. */
export const POP_UNIT = 100000;

/**
 * Sekiz kaynak: altı temel + iki çağ kaynağı (petrol, kauçuk). Akış olarak
 * işler: stok yoktur, her hafta üretilir, tüketilir, fazlası satılır, açığı
 * alınır. `price` dünya fiyatının tabanıdır (IC/birim; altın tabanının 1.5
 * katı — çıktı eski vergiyle 1.5 kurla ölçeklendi, ticaretin ekonomideki payı
 * korunsun). Çağ kaynaklarının 1900'de alıcısı azdır; talebi teknolojiyle doğar.
 */
export const RESOURCES = {
  FOOD: { id: 'FOOD', name: 'Food', glyph: '🌾', color: '#c9a13a', hue: 45, sat: 45, price: 1.5 },
  COAL: { id: 'COAL', name: 'Coal', glyph: '⬛', color: '#4a4a52', hue: 230, sat: 8, price: 2.4 },
  IRON: { id: 'IRON', name: 'Iron', glyph: '⛏', color: '#8a6f62', hue: 12, sat: 35, price: 3.0 },
  TIMBER: { id: 'TIMBER', name: 'Timber', glyph: '🪵', color: '#6f8a3a', hue: 95, sat: 38, price: 1.8 },
  HORSES: { id: 'HORSES', name: 'Horses', glyph: '🐎', color: '#a0703c', hue: 30, sat: 45, price: 3.3 },
  SALTPETER: { id: 'SALTPETER', name: 'Saltpeter', glyph: '✦', color: '#d8d0c0', hue: 280, sat: 30, price: 4.5 },
  OIL: { id: 'OIL', name: 'Oil', glyph: '🛢', color: '#3d3346', hue: 300, sat: 12, price: 3.75, era: true },
  RUBBER: { id: 'RUBBER', name: 'Rubber', glyph: '◍', color: '#4f8a7a', hue: 165, sat: 30, price: 4.2, era: true },
};
export const RESOURCE_IDS = Object.keys(RESOURCES);

/**
 * Province'in ANA kaynağı olabilecekler: her province birini çıkarır. Gıda
 * ayrıca her province'te topraktan gelir; gıda ana kaynağı "tahıl ambarı"dır.
 */
export const DEPOSIT_IDS = ['FOOD', 'COAL', 'IRON', 'TIMBER', 'HORSES', 'SALTPETER'];
/** Çağ kaynakları: bazı province'lerde ikinci satır olarak yatar. */
export const ERA_DEPOSIT_IDS = ['OIL', 'RUBBER'];

/**
 * Kaynak hex'i başına haftalık çıktı (kalkınma çarpanından önce). Her
 * province bir kaynak çıkardığından kaynak hex'i eskisinin ~2.4 katıdır;
 * hex başı çıktı aynı oranda indirildi ki dünya toplamı ve kıtlık korunsun.
 * Gıda satırı tahıl ambarının topraktan gelen gıdaya EKİdir.
 */
export const DEPOSIT_OUTPUT = {
  // At 0.075'te dünya ihtiyacının 2.5 katıydı, fiyat haftaların %95-99'unda
  // tabandaydı (Tek Çubuk kalibrasyonu, BAR1 × 45 yıl): 0.035.
  FOOD: 0.05, COAL: 0.185, IRON: 0.074, TIMBER: 0.097, HORSES: 0.035, SALTPETER: 0.13,
  // Kauçuk 0.12'de ulus-haftaların %74-78'inde kıttı, 0.17'de dünya ihtiyacının
  // 1.3-1.7 katıydı ve fiyat haftaların %50-87'sinde tabandaydı: 0.13.
  OIL: 0.2, RUBBER: 0.13,
};

/**
 * Yatak çıktısının kalkınma çarpanı `base + perDev × kalkınma`: maden ve
 * demiryolu binalarının yerine. Eski binalar 10. yılda yatakları ×1.37-1.40
 * büyütüyordu; kalkınma 2'de ×1.0, 7'de ×1.3. (0.1/kademe ile kalkınma
 * yükselince yataklar ×1.6'ya çıkıp fiyatları tabana çakıyordu.)
 */
export const DEPOSIT_DEV = { base: 0.88, perDev: 0.06 };
/**
 * Demir ve kereste sanayiyle büyür: ihtiyaçları sanayi ve kalkınmayla ×2.6
 * artarken ortak çarpanla arz yalnız %20 büyüyordu; dünya arz/ihtiyacı
 * 1905'te 1.49 iken 1940'ta demirde 0.68, kerestede 0.89'a iniyordu ve
 * ulusların %74'ü demir kıtlığındaydı (ölçüldü, STAT1 160×96). Kalkınma 2'de
 * ortak çarpanla aynı yerde (~0.95), 6'da ×1.97. Kıt demirin fiyatı yükselince
 * demir state'inin kademesi (levelGain) değerlenir ve yatırım oraya akar.
 * Kereste demirin eğrisiyle 1905-15'te ihtiyacın 2.2-2.5 katıydı: daha yumuşak.
 */
export const DEPOSIT_DEV_BY = {
  IRON: { base: 0.44, perDev: 0.255 },
  TIMBER: { base: 0.70, perDev: 0.14 },
};

/**
 * Gıda: nüfus birimi başına üretim `FOOD_BASE + FOOD_FERTILITY × verim`.
 * Nüfusla ölçeklenir (tarlayı insan sürer) ama verimsiz toprak hep açık verir:
 * çöl ve dağ ithalatçı, ova ve bozkır ihracatçı doğar. Çiftlik binası kalkınca
 * (dünya gıdasının %6.5-8.7'siydi) katsayı yükseltilmedi: dünya gıdası zaten
 * %30-45 fazlaydı ve +%7 ile fiyat haftaların %65'inde tabandaydı (ölçüldü).
 */
// 0.45/0.55 ile dünya gıdası ihtiyacın 1.4-1.5 katıydı (fiyat haftaların
// %33-50'sinde tabanda): %6 indi.
export const FOOD_BASE = 0.42;
export const FOOD_FERTILITY = 0.52;
/** Nüfus birimi başına haftalık gıda ihtiyacı. */
export const FOOD_NEED = 1.0;

/**
 * ÇIKTI (econ/output.js). Her 100 bin işçi elle HAND_OUTPUT üretir; 1'in
 * üstündeki her kalkınma kademesi INDUSTRY_PER_DEV sanayi ekler (kömür ister,
 * teknolojiyle büyür). Ölçüldü (STAT1/STAT2, 160×96, 2. hafta): sanayi eski
 * fabrika IC'sinin 4.08-4.27 katı (IC_SCALE), toplam çıktı eski verginin 1.50
 * katı, halkın ihtiyacı çıktının %34'ü (ulus p90 %46), faturalar %10.
 */
export const HAND_OUTPUT = 0.6;
export const INDUSTRY_PER_DEV = 0.2;
/**
 * Yeni sanayi biriminin eski fabrika IC'sine oranı. Teçhizat bedelleri bu
 * katla yazılır: aynı yasada 1900'ün askerî üretimi eskisiyle birebir kalır
 * (2026-10-14 teçhizat ayarı korunur). Ekranlar ve YZ eşikleri de bu kata göre.
 */
export const IC_SCALE = 4;
/** Taç çıktısı: her devletin başkentinden düz haftalık çıktı (mikro devlet yaşasın). */
export const CROWN_OUTPUT = 4;

/**
 * Ham sanayi birimi (Σ 0.2 × işçi × (kalkınma − 1) × statü) başına haftalık
 * girdi. Eski fabrika IC'si başına kömür 0.28, demir 0.05, kereste 0.06,
 * petrol 0.12'ydi; ham birim eski fabrikanın ~4.2 katı. Kömür 1.5 kat
 * yazıldı: maden ve demiryolu kalkınca kaynaklar 1900'de dünyada %40 fazlaydı
 * ve fiyatların hepsi 3. yılda tabana yapışıyordu (ölçüldü).
 */
export const INDUSTRY_INPUTS = { COAL: 0.10, IRON: 0.025, TIMBER: 0.015, OIL: 0.03 };
/**
 * Ham birim başına girdi çağla bu paya dek iner (verim: kok, Bessemer, çelik
 * alaşımı). Sanayi 45 yılda ×4-5 büyür; tasarrufsuz demir 1940-45'te dünya
 * ihtiyacının 0.83-0.88'ini karşılıyor, ulusların %65-69'u kıttı (ölçüldü,
 * dik yatak eğrisiyle bile). Kömür eskiden %30'du ve 1945'te 1.02'ye iniyordu.
 * Tasarrufla demir 1930-45'te 1.17-1.33, kıt ulus %3-16 (STAT1-3); kereste
 * %20 ile son yılda 0.97-1.01'e iniyordu (%48-55 kıt): %30.
 */
export const INPUT_ERA_SAVING = { COAL: 0.4, IRON: 0.4, TIMBER: 0.3 };

/**
 * Tersane kapasitesi (gemi hattına girebilecek IC): kıyı state'lerinin
 * Σ kalkınma × statü × bu katsayı. Tersane binasının yerine; dünya toplamı
 * eski tersane kapasitesinin ×IC_SCALE'ine denk (ölçüldü: 290 / 268).
 */
export const SHIPYARD_PER_DEV = 0.3;

/**
 * FATURALAR (econ/bills.js): ordu ve donanmanın ikmali, okullar, sıkıyönetim.
 * Kura alayı (seferberlik) yarım ikmal yer: yarım takımla toplanır ve
 * savaşta kriz haftaları onsuz %10-17'ydi (ölçüldü).
 * Çıktının önünden düşer. Alay başına 1.2 IC/hafta (eski bakım 0.6 altın ×
 * kur 1.5 × 1.33: ordu ekonominin gerçek ağırlığı olsun), çağla ×1.8'e
 * büyür (ordu da modernleşir), savaşta ×1.4.
 * Milis (levée) alayın onda birini yer: topraktan beslenir (el koyma); 0.25'te
 * savaştaki ulus-haftaların %15.5'i ikmal krizindeydi (eşik %10, ölçüldü).
 * Levée'nin bedeli ikmal değil tarladan ve tezgâhtan çekilen insandır.
 */
export const SUPPLY = { land: 1.2, sea: 2.0, sub: 1.0, conscript: 0.5, militia: 0.1, war: 1.4, eraGrowth: 0.8 };
/**
 * Faturaların çıktıdan alabileceği en büyük pay. Aşılırsa İKMAL KRİZİ:
 * her fatura aynı oranda (s) ödenir; takviye, eğitim ve düzen toparlanması
 * `0.5 + 0.5·s` ile çarpılır, istikrar düşer. İflasın yerine: sürekli,
 * faturalar sığdığı hafta biter.
 */
export const BILL_CAP = 0.6;

/**
 * Halkın doyurulma hedefi (ihtiyacın katı). Tek kol budur: sağa çekmek
 * istikrar ve büyüme, sola çekmek kalkınma. Okuyucular 1.2-1.25'te tavan
 * yapar (istikrar +6, büyüme ×1.06, huzursuzluk −1).
 */
export const FEED = { min: 0.5, max: 1.5, step: 0.05, peace: 1.05, war: 0.85, unrest: 0.1 };

/**
 * YATIRIM (econ/investment.js). Kalan çıktı kalkınma fonuna akar; fon bir
 * sonraki kademenin bedeline ulaşınca state bir kademe kalkınır. Bedel
 * `cost × max(1, nüfus birimi) × hedef²` — kazanç nüfusla orantılı olduğu için
 * büyük state'in geri dönüşü küçüğünkiyle aynıdır, kademe yükseldikçe azalır.
 * Develop odağı bedeli dörtte bir indirir ve fonu önce oraya çeker.
 */
// `cost`: kademe başına IC × nüfus birimi × hedef². Ölçüldü (BAR1 × 45 yıl,
// gündem ödülleri kademe vermeyince): bedel 30/45/60/80 → 1944'te ulusların
// ortanca kalkınması 9.4/8.2/7.7/6.7. 50: ortanca ~7.5, büyük devletlerin
// kalabalık state'leri ~5-6'da kalır (kademesi pahalı), geç oyunda yatırım
// azalan getiridir.
// `horizon`: fon en çok bu kadar haftalık yatırımın alabileceği kademeler
// arasından seçer. Ufuksuzken fon "en iyi oran" diye 41 birimlik bir state'in
// 81 bin IC'lik kademesine biriktiriyor, medyan fon çıktının 40-170 haftası
// kadar yığılıyordu (ölçüldü, BAR1 × 30 yıl).
export const INVEST = { cost: 50, exponent: 2, focusDiscount: 0.75, minStatus: 0.5, horizon: 26 };
/**
 * Yatırılan IC başına kereste ve demir (inşaatın kaynak talebinin yerine).
 * 0.06/0.02'de dünya kerestesi ihtiyacın 0.5'i, demiri 0.6'sıydı (fiyatlar
 * tavanda); 0.02/0.008'de hâlâ 1.0-1.5/1.4-1.6.
 */
export const INVEST_MATERIALS = { TIMBER: 0.015, IRON: 0.005 };
/**
 * Fonun tabanı: haftalık çıktının bu katı kadar eksiye inebilir (tek seferlik
 * alımlar ve ithalat için). Altındayken ithalat ve harcama durur.
 */
export const FUND_FLOOR_WEEKS = 4;
/**
 * Bütün state'leri tavanda olan ülkenin fonu yine bu kadar haftalık çıktıya
 * dek dolar (ithalat ve tek seferlik alımlar için); fazlası halka döner.
 */
export const FUND_RESERVE_WEEKS = 4;

/** Kalkınma tavanı ve en üst kademe. */
export const DEVELOPMENT_MAX = 10;
/**
 * Kalkınma tavanı = taban + 1900 sonrası teknoloji + okuryazarlık × katsayı.
 * Eskiden 1900 öncesi beş teknoloji herkese +5 veriyordu ve okuryazarlık × 4
 * ile tavan 1900'de bütün uluslarda 9-10'du: dünya ortancası 1945'te 6'ya
 * ancak çıktığı için tavan hiç bağlamıyordu (ölçüldü). × 8 ile başlangıç
 * okuryazarlığı (0.25 / 0.5 / 0.8) tavanı 5 / 7 / 9 yapar; başlangıç kademesi
 * en çok 7'dir. Okul bugün çıktıya mal olur, yarın state'lerin tavanını açar.
 */
export const DEVELOPMENT_CAP_BASE = 3;
export const DEVELOPMENT_CAP_LITERACY = 8;

/**
 * Teçhizat. `ic` bir parçanın sanayi bedeli (yeni IC biriminde: eski ×
 * IC_SCALE), `resources` parça başına kaynak. Gemi yelken çağında kereste,
 * zırhlı teknolojisiyle demir ve kömür yer.
 */
export const EQUIPMENT = {
  // Güherçile fişek ve mermi barutudur: barışta da hat üretimiyle talep görür.
  // IC bedeli 2026-10-14'te ×10 (Kerem: "en düşük mobilizasyonda bile ekipman
  // hızla yetiyor"), 2026-10-15'te birim değişiminde ×IC_SCALE.
  rifles: { id: 'rifles', name: 'Rifles', glyph: '🔫', ic: 4.0, resources: { IRON: 0.06, TIMBER: 0.03, SALTPETER: 0.02 } },
  guns: { id: 'guns', name: 'Artillery', glyph: '💣', ic: 16.0, resources: { IRON: 0.25, SALTPETER: 0.06 } },
  ships: {
    id: 'ships', name: 'Ships', glyph: '⚓', ic: 2.4, resources: { TIMBER: 0.6 },
    ironclad: { IRON: 0.5, COAL: 0.2 },
  },
  // 1900 kollarının teçhizatı: hat, kolu açan teknolojiyle açılır (`unit`).
  tanks: { id: 'tanks', name: 'Tanks', glyph: '⛟', ic: 32.0, resources: { IRON: 0.4, OIL: 0.05, RUBBER: 0.05 }, unit: 'ARMOR' },
  aircraft: { id: 'aircraft', name: 'Aircraft', glyph: '✈', ic: 24.0, resources: { IRON: 0.1, TIMBER: 0.05, OIL: 0.05, RUBBER: 0.03 }, unit: 'AIRCRAFT' },
};
export const EQUIPMENT_IDS = Object.keys(EQUIPMENT);

/**
 * Alay başına kuruluş teçhizatı; takviye kaybolan güç oranında aynısını yer.
 * Kara ve hava üç kat (2026-10-14, Kerem: "hiçbir zaman ekipman sıkıntısı
 * olmuyor"); ölçüm notu TASARIM §5'te.
 */
export const UNIT_EQUIPMENT = {
  INFANTRY: { rifles: 30 },
  CAVALRY: { rifles: 18 },
  ARTILLERY: { rifles: 12, guns: 18 },
  WARSHIP: { ships: 10 },
  SUBMARINE: { ships: 5 },
  ARMOR: { tanks: 24, rifles: 6 },
  AIRCRAFT: { aircraft: 24 },
};

/** Alay başına haftalık kaynak bakımı (at sürüsü, yakıt). */
export const UNIT_RESOURCES = {
  CAVALRY: { HORSES: 0.5 },
  ARTILLERY: { HORSES: 0.25 },
  ARMOR: { OIL: 0.4 },
  AIRCRAFT: { OIL: 0.3 },
};

/** Muharebedeki alay başına haftalık barut (güherçile). */
export const BATTLE_SALTPETER = 0.5;

/** Kauçuk: muharebe teknolojisi olan ülkede kara alayı başına haftalık. */
export const RUBBER_PER_REGIMENT = 0.08;
/**
 * Gübre: kimyasal gübre teknolojisi (`saltpeterFood`) olan ülkede gıda
 * çıktısının birimi başına güherçile (0.02'de gübre talebin %94-99'uydu).
 */
export const SALTPETER_PER_FOOD = 0.01;

/**
 * Tüketim malı ihtiyacı nüfus birimi başına; çağ çarpanı 1900'de 1, 1945'te
 * 1 + CONSUMER_ERA_GROWTH. El tezgâhı artık çıktının (HAND_OUTPUT) içindedir:
 * halkın payı doyurma kolundan gelir. 0.45 × başlangıç değiştiricisi −%10 →
 * 1900'de 100 bin kişi başına 0.405 IC, çıktının ~%34'ü.
 */
export const CONSUMER_NEED = 0.45;
export const CONSUMER_ERA_GROWTH = 1.7;

/** Üretim hattı verimi: tavan, taban, haftalık artış ve boşta erime. */
export const LINE_EFFICIENCY = { start: 0.5, floor: 0.2, cap: 0.8, gain: 0.01, decay: 0.005 };

/**
 * YZ ordusu: çıktının bu payını kara ordusunun ikmaline ayırmayı göze alır
 * (insan gücü tavanı içinde). Tavan: toprak hedefinin ARMY_SUPPLY_CAP katı —
 * tavansız (pay 0.2) zengin dev 112 alaya çıkıp kartopunu %53'e taşımıştı.
 */
export const ARMY_SUPPLY_SHARE = 0.15;
export const ARMY_SUPPLY_CAP = 2;
/**
 * YZ ordusunun ikmali hiçbir koşulda çıktının bu payını geçmez (toprak
 * tabanı dahil): faturaların tavanı %60, okul ve donanmaya yer kalsın.
 */
export const ARMY_SUPPLY_LIMIT = 0.35;
/** YZ filosunun (savaş gemisi gövdeleri) ikmali en çok çıktının bu payı. */
export const FLEET_SUPPLY_LIMIT = 0.15;

/**
 * Düzenli ordunun insan gücü havuzundan alabileceği pay. Barışta yarısı:
 * kalanı YEDEKTİR, savaşta seferber olur (mobilization.js) ve takviyeyi
 * besler. Savaşta 0.8: beşte biri takviyeye kalır. Kura alayları paya
 * dahildir. Ölçüm notu TASARIM §8'de.
 */
export const ARMY_POOL_SHARE = { peace: 0.5, war: 0.8 };

/** Kura alayının teçhizatı (yarım piyade takımı; mobilization.js çeker, terhiste döner). */
export const CONSCRIPT_KIT = { rifles: 15 };

/** Ticaret: fiyat bandı ve haftalık yaklaşma (fiyat = taban × (dünya ihtiyacı ÷ dünya üretimi)^1.5). */
export const TRADE = { minPrice: 0.6, maxPrice: 2.0, priceSpeed: 0.1 };
