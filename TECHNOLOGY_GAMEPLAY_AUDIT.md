# TECHNOLOGY GAMEPLAY AUDIT

Beta raporu teknolojinin **var oldugunu** dogru gozlemledi: celik, makine
parcasi, telefon, radyo, otomobil onyillar icinde makul sirayla sahneye cikti
ve 1903'te bir Otomobil Fabrikasi kuruldu. Bu denetim o gozlemin ARKASINDA ne
oldugunu tespit eder.

**Ozet hukum: teknoloji diye bir sistem yok. Bir TAKVIM var.**

---

## 1. TEKNOLOJIK ILERLEMEYI NE SURUYOR?

Tek mekanizma: veri tablolarindaki `availableFrom` alani — bir **tur numarasi**.

```js
// src/game/economy.js
export function factoryUnlocked(typeId, turn) {
  return (FACTORIES[typeId]?.availableFrom ?? 0) <= turn;
}

// src/game/units.js
export function unitAvailable(typeId, turn) {
  return (UNIT_TYPES[typeId]?.availableFrom ?? 0) <= turn;
}
```

Cagri yeri sayisi: `factoryUnlocked` **1** (canBuildFactory), `unitAvailable`
**birkac** (askere alma). Baska hicbir sey yok.

Olculen kapi takvimi (oyun ici, ekrandan dogrulandi):

| Bina | `availableFrom` | Yil |
|---|---|---|
| Machine Parts Factory | 732 | 1850 |
| Steamer Shipyard | 732 | 1850 |
| Electric Gear / Oil Refinery | 1776 | 1870 |
| Telephone Factory | 2297 | 1880 |
| Synthetic Oil / Radio / Automobile | 3341 | 1900 |
| Aeroplane Factory | 3654 | 1906 |
| Tank Factory | 4176 | 1916 |

## 2. ULKELER TEKNOLOJIK OLARAK AYRISABILIR MI?

**Hayir.** Kapi `turn`'e bakar; `nation` parametresi bile almaz. 1850'de
dunyanin en geri ulkesi de en ileri ulkesi de ayni hafta Makine Parcasi
Fabrikasi kurabilir. Teknolojik ustunluk **imkansizdir**.

## 3. EGITIM / OKURYAZARLIK NE YAPIYOR?

Teknolojiye **hicbir sey**. Okuryazarligin teknoloji kapisiyla bagi yok.
Egitim harcamasi isgucu niteligi kanalindan uretime baglanir
(`universityWorkforceBonus`, reform carpanlari) ama **hicbir teknolojiyi
erkene cekmez**. Beta'nin "62 yil egitim, okuryazarlik 24% -> 23%" bulgusu
ayri bir konudur (bkz. REMAINING_OPEN_BETA_ISSUES P1-3) ve teknolojiden
bagimsizdir.

## 4. UNIVERSITELER YENILIGI ETKILIYOR MU?

Hayir. Universite bir insaat tipi ve isgucu carpani; arastirma uretmez.

## 5. TEKNOLOJI ASKERIYE / EKONOMIYE / TOPLUMA ETKI EDIYOR MU?

**Evet, ama tek yonlu.** Kapi acilinca:
- yeni bina tipi kurulabilir (yeni mal, yeni uretim zinciri halkasi),
- yeni birim tipi (tank, ucak) egitilebilir.

Bu gercek ve gorunur bir etki — dunyanin sanayilesmesi buradan geliyor. Eksik
olan sey **etkinin girdisi degil, kapisinin oyuncuya acik olmasi**.

## 6. OYUNCUNUN ANLAMLI BIR TEKNOLOJI KARARI VAR MI?

**Hayir. Tek bir tane bile yok.** Arastirma ekrani, arastirma noktasi, yon
secimi, oncelik, maliyet — hicbiri mevcut degil. Oyuncunun teknoloji uzerindeki
toplam etkisi sifirdir; yalnizca bekler.

Bu, beta raporunun "the world evolves technologically, but the player may not
meaningfully choose a research direction" tahminini **birebir dogrular**.

## 7. YZ TEKNOLOJIYI ANLIYOR MU?

Anlayacak bir sey yok. YZ de ayni takvimi bekler. Kapi acilinca ozel
yatirimci yeni tesisi karlilik siralamasina gore kuyruga alir — bu iyi
calisiyor (beta ozel yatirimci YZ'sini ovdu) ama teknolojik bir karar degil,
ekonomik bir karardir.

---

## 8. BU GECISTE NE YAPILDI

Brief'in kurali acikti: **P0 sistemleri kararli degilse teknoloji katmani
EKLENMEZ.** Eklenmedi. Bunun yerine takvim kapisinin en zararli yan etkisi
duzeltildi:

**BUG-015 — "unavailable" (kapali).** Insa menusundeki sebep zincirinde cag
kapisi vakasi yoktu; cag-kilitli her bina tek kelimeye dusuyordu. Oyuncu
oyunun en karli binasinin (Oil Refinery, +61.3/seviye) neyle acildigini 70
yilda ogrenemedi. Artik tarih soyleniyor:

```
not yet invented — available from 1870
```

Olculdu (tarayicida, seed BETA1836, 1836): **12 kilitli binadan 12'si sebep
veriyor, "unavailable" diyen kart sayisi 0.**

Ayrica ayni hatanin ikinci yarisi kapatildi: ekran `factoriesInRegion`
(**factoryAtlas**) ile suzuyor, motor `industryTaken` (**constructionAtlas**)
ile bakiyordu. Iki atlas ayrisinca ekran kart gosterip motor reddediyordu —
beta'nin *"kapitalistler Steel Mill kuruyor ama bana yasak"* celiskisi tam
olarak buydu. `industryTaken` disa acildi, ekran motorun dizinini kullaniyor.

---

## 9. ONERILEN ASGARI TASARIM (bu geciste UYGULANMADI)

Mevcut mimariyi yeniden yazmadan, `availableFrom` takvimini **taban** olarak
koruyup uzerine oyuncu etkisi eklemek yeterli. Onerilen sekil:

1. **Takvim taban kalir** — dunya yine sanayilesir, hicbir ulke geri kalmaz.
   Bu, beta'nin begendigi "dunya kendi tarihini yaziyor" hissini korur.
2. **Arastirma kapiyi ONE CEKER, acmaz.** Ulke bir alana yatirim yaparak
   `availableFrom`'u en fazla ~10 yil erkene ceker. Boylece:
   - teknolojik ustunluk mumkun olur (ayrisma),
   - kimse kalici olarak geride kalmaz (takvim yakalar),
   - mevcut kod yolu degismez — yalnizca `factoryUnlocked` ulkeye ozel bir
     kaydirma okur: `availableFrom - nation.research[field]`.
3. **Arastirma girdisi zaten var:** okuryazarlik, universite, egitim butcesi.
   Bunlari kapi kaydirmasina baglamak beta'nin "egitimin ne satin aldigini
   soyle" istegini de ayni hamlede karsilar.
4. **4-6 alan yeter** (Sanayi / Askeri / Ulasim-Haberlesme / Toplum), 150
   dugumlu agac degil. Her alan bir sayidir: kac hafta erken.

Tahmini buyukluk: `factoryUnlocked`/`unitAvailable` icinde tek satir, bir
arastirma tahsis ekrani, save semasina bir alan. **Yeni simulasyon dongusu
gerektirmez.**

**Risk notu:** bu degisiklik dunya ekonomisinin zamanlamasini oynatir
(fabrika kapilari erkene gelirse mal fiyatlari ve kitliklar kayar). Uygulanirsa
`audit:long-run` ve `audit:market` taban cizgileriyle karsilastirilmali.

---

# EK: UYGULAMA TASARIMI (Vic2 modeli)

Kaynak: [Research & technology](https://vic2.paradoxwikis.com/Research_%26_technology),
[Technology guide](https://vic2.paradoxwikis.com/Technology_guide).

## A. TEMEL ATILDI — okuryazarlik artik bir STOK (bu oturumda yapildi)

Arastirma puani okuryazarliktan gelir; okuryazarlik ise bizde **stateless bir
formuldu**. Once o duzeltildi (bkz. LOG R-18):

| egitim | 1851 | 1898 | stok |
|---|---|---|---|
| %0 | isci %2 / orta %8 | isci %3 / orta %11 | %7.8 |
| **%40** | isci %8 / orta %26 | **isci %13 / orta %43** | %31.6 |
| %100 | isci %17 / orta %54 | isci %28 / orta %91 | %67.4 |

Beta'nin 62 yillik gizemi (BUG-019) bu adimla kapandi ve teknolojinin yakiti
hazir hale geldi.

## B. YAPI — 5 x 5 x 6

Vic2'nin kendi iskeleti; kategoriler ve klasorler birebir alinabilir:

| Kategori | Klasorler |
|---|---|
| **Army** | Army Doctrine · Light Armament · Heavy Armament · Military Science · Army Leadership |
| **Navy** | Naval Doctrine · Ship Construction · Naval Engineering · Naval Science · Naval Leadership |
| **Commerce** | Financial Institutions · Monetary System · Economic Thought · Market Functionality · Organization |
| **Culture** | Aesthetics · Philosophy · Social Thought · Political Thought · Psychology |
| **Industry** | Power · Mechanization · Metallurgy · Infrastructure · Chemistry & Electricity |

Her klasor **6 kademe**, dogrusal ilerler (ucuncuyu almadan dorduncu yok).
Toplam 150. **Sistem kucuk, ICERIK buyuk** — bu ayrimi korumak sart.

## C. ARASTIRMA PUANI (Vic2 formulu, bizim karsiliklarimizla)

```
RP = (okuryazarlik + din adami + katip + ulusal rutbe) x (1 + cogulculuk + felsefe)
```

| Vic2 bileseni | Bizdeki karsiligi | Durum |
|---|---|---|
| 4 x okuryazarlik% | `economy.literacy` | **HAZIR** (A) |
| 1.5 x ruhban% | `classes.middle` payi | var |
| 0.5 x katip% (>%50 okuryazarlik sarti) | kentli orta sinif | var |
| Ulusal rutbe (BG 1.5 / ikincil 1.25) | `hegemonyScore` siralamasi | **HAZIR** |
| Felsefe carpani (x4.5'e kadar) | Culture/Philosophy klasoru | teknolojinin kendisi |

Not: Vic2'de tavan ~10.5 ham RP, carpanlarla ~78. Bizim olceklerimize
oturtulurken **oran** korunmali, mutlak sayi degil.

## D. AKTIVASYON YILI — zaten var

`availableFrom` alani **birebir Vic2'nin activation year'idir**. Yani takvim
kapisi atilmiyor, **ust sinir** olarak kaliyor:
- Yilindan once arastirilabilir ama **pahali** (erken arastirma cezasi).
- Arastirilmazsa yil gelince yine acilir (kimse geride kalmaz).

Bu, beta'nin begendigi "dunya kendiliginden sanayilesiyor" hissini korurken
oyuncuya **one gecme** imkani verir — teknolojik ustunluk ilk kez mumkun olur.

## E. ETKILER — dolgu yok

Her teknoloji su uclerinden EN AZ birini yapmali:
1. **Yeni yetenek acar** (fabrika tipi, birim tipi) — mevcut `availableFrom`
   mekanizmasi.
2. **Davranis degistirir** (RGO cikti carpani, insaat gucu, egitim tavani,
   moral, tedarik tuketimi).
3. **Yeni talep yaratir** (yeni girdi maddesi) — piyasayi hareketlendirir.

Ekran gorüntüsündeki "Army Professionalism: Supply Consumption −10%,
Morale +10%, Military Tactics +25%" tam olarak (2). Bizde karsiliklari
`ARMY_CONSUMPTION_RATES`, `generalModifier`, `planningBonus`.

## F. IKINCIL — bu surumde ATLANACAK

- **Inventions** (RNG ile tetiklenen kesifler): guzel doku ama ikinci katman.
- **Plurality**: bizde karsiligi yok, uydurmayalim.

## G. ONERILEN SIRA

1. `technology.js`: kategori/klasor/kademe veri modeli + `researchPointsOf`.
2. RP birikimi + `startResearch` (haftalik tur icinde, tek satir).
3. `factoryUnlocked`/`unitAvailable` icine tek satir: teknoloji varsa yil
   sartini atla.
4. **Bir kategoriyi** (Industry) tam doldur — 30 teknoloji — ve olc.
5. YZ arastirma secimi (en ucuz + kategorisine gore agirlik).
6. Ekran (Vic2 duzeni: 5 sutun, 6 kademe, secili tekin etkileri).
7. Kalan dort kategori.

**Risk uyarisi:** 3. adim dunya ekonomisinin ZAMANLAMASINI oynatir. Her
adimda `audit:long-run` ve `audit:market` taban cizgileriyle karsilastirilmali.
