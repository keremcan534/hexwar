// Nüfus ölçeği — TEK SAYI, hiçbir şey import etmez.
//
// Simülasyon 1836 ölçeğinde bir dünya anlatıyor ama rakamları bir kasabanın
// rakamlarıydı: ölçüldü, standart dünyada 69 ülkenin medyanı 227 bin, en
// büyüğü 2.5 milyon, toplam 27 milyon. Victoria kalıbında en büyük güç 25
// milyon olmalı — yani ekranda okunan sayı bir basamak eksikti.
//
// KURAL: nüfus ÜRETEN her kaynak bu sayıyla çarpılır, nüfus TÜKETEN her sabit
// de aynı sayıyla çarpılır. Böylece oranların hepsi (vergi tabanı, ihtiyaç
// sepeti, iş gücü doluluğu, asker havuzu, yönetim gideri) birebir korunur ve
// değişen tek şey ekranda okunan büyüklük olur. Bu bir denge kaldıracı
// DEĞİLDİR; sayıyı büyütmek isteyen buradan büyütür, dengeyi bozmadan.
//
// Dosya ayrı durmak zorunda: `economy.js` zaten `provinces.js`i import ediyor,
// sabiti onlardan birine koymak modül döngüsü yaratırdı.
//
// Bağlı sabitler (hepsi bu dosyayı import eder ve ölçekle çarpılır):
//   provinces.js  kare nüfus tohumu · MIGRATION_COHORT · RGO iş kotası ·
//                 vergi mükellefi ölçeği
//   economy.js    POPULATION_COHORT · sosyal program birimi (10.000 kişi)
//   cities.js     yönetim giderinin nüfus terimi
//   recruitment.js PROVINCE_POPULATION_FLOOR
//   units.js      UNIT_TYPES[*].manpower
//   infamy.js     POP_PER_POINT
//   ai.js         ordu büyüklüğü tavanı
//   construction.js bölge inşa gücü kademesi
//   peace.js      barış masasında province değeri
//   tradeLedger.js hane talebi birimi
//   renderer.js   nüfus harita kipinin logaritmik bandı
export const POPULATION_SCALE = 10;
