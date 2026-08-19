# PRUNING VALIDATION REPORT — budama gecisinin dogrulamasi

Butun olcumler bu dalda, belirtilen yerlerde taban cizgi (4e49602, budama
oncesi kod) ile ayni tohum/ayni surede kiyaslanarak yapildi.

## 1. Insaat kabul testi — A/B/C

`audit:construction` icinde otomatik: ayni tohumda uc kimlik —
A hic kapasiteye yatirmaz, B agresif yigar, C dengeli.

- B, C'ye "bedavaya" ustun DEGIL: artan fiyat merdiveni + bakim, agresif
  yiginin fazlasini geri emiyor; sanayi kuyrugu kisa ama hazine farki
  bakimla eriyor. A ise kuyruk baglar (taban guc 5 ile yasanmiyor).
- Iptal istismari kapali: odenen is batik, yalniz insa edilmemis pay doner.
- Kale yerellik: savunma yalniz capa cevresinde (2 hex), isgalde kaybolmaz.
- Bulgu: yok. (`after-construction2` kosusu, son kodda.)

## 2. Teknoloji AC/KAPA — hicbir hayalet kalmadi

`audit:tech-effect`: her degistirici tek basina acilip ayni tohumda
kapaliyla kiyaslandi (son kodda yeniden kosuldu, bulgusuz):

| degistirici | AC etkisi (olculen) | tuketici |
|---|---|---|
| rgoOutput | RGO ciktisi +%20 | provinces.provinceOutput |
| factoryThroughput | fabrika ciktisi +%50 | economy.runFactories |
| inputEfficiency | girdi faturasi −%30 | economy.runFactories (girdi olcegi) |
| constructionPower | insaat gucu +%50 | construction.constructionPower |
| supplyConsumption | ordu tuketimi −%20 | economy.armyWeeklyDemand |
| researchRate | arastirma hizi | economy.beginEconomy |

Silinenler (literacyCap, morale, rankBonus): tuketicisi olmayan hicbir
degistirici kalmadi; anahtar kapsama testi her anahtarin en az bir
teknolojide tasindigini dogruluyor. Hicbir arac ipucu kullanilmayan etki
vaat etmiyor (legacy bekcisi kaldirilanlarin geri sizmasini da tutuyor).

## 3. Uzun kosu — coklu tohum

### Hizli takim (3 tohum x 520 hafta) — bulgusuz

| tohum | hf/s | ulke | nufus | kapasite T/max | egitim T | kale | gemi | zirve sohret | iflas |
|---|---|---|---|---|---|---|---|---|---|
| pv-1 | 33.8 | 26 | 8.0M | 260/17 | 45 | 59 | 17 | 107.9 | 1 |
| pv-2 | 42.1 | 30 | 7.6M | 164/19 | 48 | 63 | 25 | 22.5 | 0 |
| pv-3 | 28.1 | 26 | 8.2M | 202/19 | 42 | 66 | 18 | 131.0 | 4 |

### Tam takim (5x1300 + 3x2600 + 1x5740) — iki gercek sarmal yakaladi

Ilk tam kosu 1300. haftada kapasite 41-93 seviyesine tirmanan uluslar ve
19-21/26 ulkeyi kalici kredi cezasinda buldu. Defter kiyasi (ayni tohum,
taban cizgi agaci vs bu dal, `ledger-probe`/`war-state-probe`) kok
nedenleri ayirdi:

- Dunya BILEREK fakirlesti (ihracat misillemesi gumruk gelirini dunya
  capinda −%56, yeni techizat kalemleri tedariki +, nufusla buyuyen idare
  gideri): bunlar plan geregi konulan gercek bedeller, geri alinmadi.
- Ama YZ aliskanliklari zengin dunyaya gore ayarliydi ve UC kacak vardi:
  donmus savas (0-0 savasin teklif vereni yok — 1186 haftalik savas),
  cikissiz borc kilidi (ceza kapasiteyi kucultur → eski borc odenemez),
  sehirsiz devletin maliye YZ'sinden muaf kalmasi.

Dort duzeltme (bkz. MECHANIC_PRUNING_IMPLEMENTATION_LOG §6.3-6.6) sonrasi
ayni tohumlar:

| olcum (pv-1 @1300h) | taban cizgi | duzeltme oncesi | duzeltme sonrasi |
|---|---|---|---|
| kalici kredi cezasi (cp>0.3) | 2/26 | 19/26 | 11/25 |
| ortalama borc | 885 | 1,639 | ~230 |
| donmus savas cifti | 6 (azami 687h) | 9 (azami 1186h) | 1 (114h) |
| kapasite toplami/azami | 377/68 | 415/62 | 205/31 |
| ortalama hazine | 51,740 | 11,950 | ~18,000 |

Tam takimin son kosusunda dokuz kosunun yedisi esiksiz temiz; kalan iki
bulgu pv-1 tohumuna ozgu (en kotu tohum: %44 @1300h, %58 @5740h — 110
yillik tamamen fethedilmis dunya) ve tasiyicilar sehirsiz kalinti
devletler. Eski mutlak "seviye > 25" kapasite bulgusu yanlis olcuttu
(taban cizgi 68 sektoru ODEYEREK tasiyordu); denetim artik YZ'nin kendi
tavanini (2 + fabrika/3) asip asmadigini olcuyor — son kosuda ihlal yok
(orn. pv-3'un 72 seviyesi 220 fabrikalik imparatorluk, tavani ~75).

pv-3'te ayni olcum: taban 6/26'ya karsi 7/25 — tohuma gore taban bandina
dondu. Kalan tasiyicilar sehirsiz kalinti devletler (yapisal, bkz.
REMAINING_MECHANIC_DEBT #8). Ortalama hazinenin taban cizginin altinda
kalmasi kasitli: dunya artik daha pahali bir yerde yasiyor.

## 4. Savas baskisi (kalibrasyon sonrasi, son kod)

3 tohum x 1300 hafta (`audit:war-pressure`):

- Savaslar KAPANIYOR: 100/101, 52/52, 87/90 (donmus 1/0/3; onceki kosuda
  9/4/3 donmustu).
- Ortanca savas 19-30 hafta, 16 haftadan kisa savas %0 — govde var.
- Ilhak sohreti kalici, yarilanma ~45 hafta; en cok fetheden ulke 3/3
  tohumda koalisyon esigini gordu; savastaki ulke ikinci cepheden
  vurulabiliyor (kalkan yok).
- Tekrar savas bosluklari gercek (ortanca 176 hafta).
- Kalan iki HIGH taban cizgiyle ayni: cullanma azami 4 (esik 3) ve
  kartopu %34.8 (esik %33.3; taban %33.2-34.2) — ikisi de budama oncesi
  siddetinde, REMAINING_MECHANIC_DEBT'te.

## 5. Bassiz/tarayici esdegerligi

Dort kontrol noktasinda (52/260/520/1300 hafta) FNV ozetleri birebir;
bassiz 26.7 hafta/s, gercek Chromium 22.7 hafta/s. Ayrinti ve yontem:
HEADLESS_SIM_EQUIVALENCE.md.

## 6. Insan-benzeri duman oyunu (gercek tarayici, Playwright)

16 adimin 16'si geciyor: dunya kur → 9 ekranin hepsini ac → kapasite
yatirimi kuyrukla → kale sec+yerlestir → subvansiyon politikasi 'strategic'
→ arastirma sec → 26 hafta gercek hiz dongusunde oynat → kaydet → sayfayi
yenile → yukle (tur/hazine birebir). Konsolda tek hata: favicon 404.

His notlari (kod bilgisiyle oynamadan):
- Kapasite karti gerilimi koruyor: fiyat merdiveni gorunur, para hep kit.
- Kale yerlestirme artik bir KARAR (nereye?) — eski bolge-spami degil.
- Iki tikla 10 alay, kuyruga ⤒: askeri rutin belirgin hafifledi.
- Universite karti "neden" sorusuna cevap veriyor (kademe adi + taban);
  yine de egitim etkisi uzun vadede hissedilen cinsten, aninda degil.
- Eksikligi hissedilen kesilmis sistem: yok. Kaldirilan ekran sekmeleri
  (kararlar/serbest birakma) aranmiyor; ikisi de bos ritueldi.

## 7. Tam takim (audit:all) — son kod

24 denetim, son kod: 0 KRITIK, 7 YUKSEK, 16 ORTA, 5 DUSUK. YUKSEK'lerin
tamami taban cizgide ayni siddette olculen miras bulgular (isci cift
sayimi, kohort muhasebesi, POP gelir ikiligi, cullanma 4, kartopu ~%34,
fiyat bandi kilidi) — dokumu ve taban kiyasi REMAINING_MECHANIC_DEBT'te.
Taban cizgideki "baskin tam-sosyal set" YUKSEK bulgusu bu dalda KAPANDI
(kriz maliyesi + pahalanan dunya tam sosyali bedavaliktan cikardi).
Budamanin dokundugu alanlarin denetimleri (construction, legacy, save,
determinism, debt, tariff, military, war-outcome, war-guard) bulgusuz.

## 8. Kayit gocu

`construction-diagnostic` 27/27 (v14 fikstür gocu dahil); `audit:save`
tam takimda bulgusuz. Ayrinti: SAVE_MIGRATION_REPORT.md.
