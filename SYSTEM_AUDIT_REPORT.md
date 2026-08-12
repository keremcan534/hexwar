# HexWar — Sistem Davranış Denetimi

**Tarih:** 2026-08-12 · **Dal:** `vic2-ekonomi-baris` · **Kapsam:** tüm simülasyon katmanı

Bu bir kod incelemesi değil. Her iddia deterministik tohumlarla, tek değişkenli
karşılaştırmalı koşularla ölçüldü. Kanıt üreten betikler `scripts/audit/`
altında; hepsi yeniden çalıştırılabilir (`npm run audit:all`).

> **Ölçüm disiplini:** Her senaryo **kendi Node sürecinde** işler. Bunun sebebi
> denetimin ilk bulgusudur: aynı süreçte kurulan ikinci dünya, aynı tohumla bile
> farklı bir oyundur (bkz. KRITIK-1). İlk ölçümlerimiz bu yüzden kirlenmişti;
> aynı refah testinin iki seviyesi 575K ve 954K nüfusla bitiyordu. Ayrıca
> ekonomik kaldıraç ölçümleri **savaşsız** koşar — savaş toprağı, toprak nüfusu,
> nüfus her şeyi değiştirir ve fark artık kaldıraca değil fethe atfedilir.

**Denetim turu bulgusu:** 2 KRİTİK · 18 YÜKSEK · 21 ORTA · 10 DÜŞÜK.
Tam takım (`npm run audit:all`) tek geçişte ~11 dakika sürer.

**Bu rapor iki bölümlüdür.** Önce denetimin bulguları (aşağıda, düzeltme
öncesi ölçümlerle), sonra [uygulanan düzeltmeler ve ÖNCE/SONRA
kanıtları](#uygulanan-düzeltmeler). Kapatılan bulgular başlıklarında
`[DÜZELTİLDİ]` işaretlidir; sayılar bilerek düzeltme öncesi hâliyle bırakıldı —
kanıtın kendisi onlar.

**Kapsam dışı kalanlar (dürüstlük notu):**
tesis türü başına *yapay girdi fiyatı* stresi tek tek yapılmadı — bunun yerine
dünya çapında 0 ve 1e6 fiyat senaryoları ile hammadde zinciri kesme testi
kullanıldı; deniz savaşı ve donanma ekonomisi ayrıca ölçülmedi; barış masası
(`peace.js`) şartlarının uzun vadeli ekonomik etkisi ölçülmedi; UI katmanı
(`screens.js`, `hud.js`) hiç test edilmedi — denetim yalnız simülasyona bakar.

---

## A. SİSTEM VE BAĞIMLILIK HARİTASI

### A.1 Haftalık çözüm sırası (`turn.js:endTurn`)

```
computeContacts → checkCoalitions → runNationAI (her YZ)
  → turn++ → organizasyon toparlanması → runReinforcements → runCommand
  → advanceMovement → decayInfamy → runProvinces → growCities
  → assignAllWorkers → produce (nationBudget) → runEconomy
  → runConstruction → runPolitics → runBattles → checkElimination
  → executeOrders → checkVictory
```

`runEconomy` içindeki sıra (ülke başına, sonra dünya geneli):

```
commitCompletedProjects → resetNationGoodsFlow → updateClasses
  → rawProduction → runFactories → runFactoryEmployment (4 haftada bir)
  → askeri stok alıkoyma → populationDemand → çimento talebi → ordu talebi
  → fiscalBalance → runPopulationMobility → runPrivateSector → runEconomicAI
[dünya] procureStrategicGoods → settleGlobalTrade → updateMilitaryAverages
        → updateLedger (settleDebt burada) → updatePrices
```

### A.2 Bağımlılık zincirleri (ölçülmüş hâliyle)

Aşağıda `→` **kanıtlanmış** bağ, `⇢` **kodda var ama ölçülemeyen/etkisiz** bağ,
`✗` **hiç kurulmamış** bağ demektir.

**Vergi (sınıf başına)**
```
taxes[class]
  → classes[c].taxPaid → taxRevenue → fiscalNet → hazine        [KANITLI]
  → needsBudget = scale × wageIndex × sepet × (1 − vergi)        [KANITLI]
  → satisfaction (− vergi×0.28) → stability                     [KANITLI]
      → province.control, province büyüme hızı                  [ZAYIF: %30 bandında]
      → parti desteği (supportScore)                            [KANITLI ama etkisiz]
  ✗ needsBudget → tüketim miktarı        ← KIRIK BAĞLANTI (KRITIK-2)
  ✗ vergi → piyasa talebi → fiyat → üretim
  ✗ vergi → birikim/servet stoğu (böyle bir stok yok)
```

**Gümrük (tariff)**
```
tariff
  → appetite = 1/(1 + t/100 × 1.6) → ithalat miktarı            [KANITLI: %0→%100, −65.2%]
  → tariffRevenue = importValue × t → hazine                    [KANITLI, kimlik tam]
  → hane sepeti (× importShare)                                 [KANITLI ama sonuçsuz]
  → fabrika girdi maliyeti (× importShare)                      [ZAYIF: importShare %2.7–7.5]
  ⇢ stratejik alım fiyatı (1 + t/100, importShare'siz)
```

**Fabrika kârlılığı**
```
factory.profit = gelir − girdi − ücret
  → profitTrend → işten çıkarma                                 [KANITLI]
  → expectedMargin → işe alım sırası                            [KANITLI]
  → autoUpgradeFactory (kâr>0 + kadro dolu + laborFill≥0.7)     [KANITLI]
  → subsidyPaid → hazine                                        [KANITLI]
  → privateCapital += kâr × 0.08 (tavan 1200)                   [KANITLI]
  ✗ factory.profit → hazine geliri
  ✗ factory.profit → hane geliri (sınıf geliri ÜRETİM DEĞERİNDEN gelir)
```

**Askerî tedarik**
```
militaryProcurement
  → stok hedefi, alıkonan üretim, ordu tüketimi → procurementGold [KANITLI]
  → supplyIndex (EMA)                                             [KANITLI: 0.13→0.24]
      → organizasyon toparlanma hızı (turn.js)                    [KANITLI]
      → takviye hızı (reinforcement.js)                           [KANITLI: %87→%100]
  ✗ techizat stoğu → muharebe gücü (battleUnitPower techizatı okumaz)
```

**İnşaat**
```
CONSTRUCTION_SECTOR sayısı → constructionPower → proje ilerlemesi [KANITLI]
  → fabrika/seviye projeleri → sanayi kapasitesi                  [KANITLI]
  → upkeep → hazine                                               [KANITLI]
  ✗ CONSTRUCTION_TYPES.cost → hazineden peşin çıkış (YÜKSEK-13)
```

**Nüfus**
```
province.population
  → provinceOutput (rgoLaborScale) → ham üretim → pazar arzı      [KANITLI]
  → provinceManpower → asker alımı / takviye                      [KANITLI, korunumlu]
  → reconcilePopulation → professionCounts → classes[].population  [KANITLI, sapma 0]
  → nationCohorts (province × meslek × kültür)                     [KANITLI, sapma 0]
  ← weeklyGrowth(stability, health, peace, agriculture)            [ÇOK ZAYIF]
  ✗ ihtiyaç karşılanması → ölümlülük/göç
```

**Eski (legacy) paralel ekonomi**
```
provinceOutput → nationBudget.production.{food,timber,iron}
  → net.food → growCities kapısı, workerWeights
  → net.timber/iron → yalnız workerWeights (kendi kendini besleyen döngü)
AYNI çıktı → rawProduction → market.supply          ← ÇİFT SAYIM (ORTA-24)
```

### A.3 Test envanteri

| Betik | Kapsam | Süre |
|---|---|---|
| `determinism-audit.mjs` | Aynı tohum → aynı oyun mu | ~35 s |
| `tax-audit.mjs` | C — sınıf vergileri 0/50/100, hepsi 0/100 | ~90 s |
| `tariff-audit.mjs` | D — gümrük −50…100 | ~110 s |
| `budget-audit.mjs` | E/F/G/O/P — bütün kaydıraçlar, eğitim 260/520/1040 hafta, sıfır ve tavan devlet | ~300 s |
| `market-audit.mjs` | H/M — akış korunumu, zincir kesme, kıtlık/bolluk | ~120 s |
| `factory-audit.mjs` | I/J — kârlılık tablosu, işçi muhasebesi, sübvansiyon | ~150 s |
| `population-audit.mjs` | K/L/N — nüfus muhasebesi, hane defteri, istihdam | ~110 s |
| `construction-audit.mjs` | Q — bina bedeli, kapasite, iptal/öncelik istismarı | ~120 s |
| `military-audit.mjs` | R/S/T — savaş ekonomisi, insan gücü, savaş stresi | ~220 s |
| `debt-audit.mjs` | U — borç, faiz, sınır değerleri | ~90 s |
| `ai-audit.mjs` | V — 10 tohum × 260 hafta + 5 tohum × 520 hafta YZ taraması | ~110 s |
| `strategy-audit.mjs` | W — 21 politika seti × 260 hafta | ~200 s |
| `boundary-audit.mjs` | X — 17 uç senaryo + değişmez taraması | ~90 s |
| `save-audit.mjs` | Y — kayıt/yükleme determinizmi | ~60 s |
| `legacy-audit.mjs` | Z — terk edilmiş sistemler | ~40 s |
| `long-run-audit.mjs` | 10×260 + 5×520 + 2×1040 hafta | ~300 s |

Ortak altyapı: `harness.mjs` (bassız dünya, savaşsız koşu, değişmez tarayıcı,
süreç izolasyonu) ve `scenario-runner.mjs` (JSON senaryo tanımı, adlandırılmış
mutasyonlar). **Denetim turu boyunca üretim kodu değiştirilmedi**; düzeltmeler
ancak başarısızlık ölçüldükten sonra, ayrı bir turda yapıldı
(bkz. [Uygulanan düzeltmeler](#uygulanan-düzeltmeler)).

---

## KRİTİK

### KRITIK-1 · Aynı tohum aynı oyunu vermiyor  `[DÜZELTİLDİ]`

| | |
|---|---|
| **Mekanik** | Dünya üretimi / simülasyon determinizmi |
| **Test** | `determinism-audit.mjs` — aynı süreçte arka arkaya 5 dünya, tohum sabit, 40 hafta |
| **Beklenen** | Beş koşu da birebir aynı |
| **Ölçülen** | Beş farklı sonuç |

```
kaçıncıDünya  ilkBirimKimliği  toplamNüfus  birim  şehir
       1                  1     7,434,714     45     18
       2                 46     7,433,162     46     19
       3                 92     7,433,320     46     19
       4                138     7,436,245     45     19
       5                183     7,433,331     46     19
```

Kanıt izolasyonu: önceki dünyalarda **tek bir tur bile işletilmeden**, yalnızca
kimlik sayacını ilerletmek sonucu değiştiriyor (30 haftada nüfus 7,472,427 ↔
7,472,448). Ayrı süreçlerde determinizm **tam** (3/3 birebir aynı).

**Kök neden:** `src/game/units.js:270` `let nextId = 1` modül düzeyindedir ve
dünya kurulunca sıfırlanmaz. `src/game/command.js:723`
`if ((game.turns.turn + unit.id) % cadence !== 0) continue;` hangi tümenin o
hafta taarruz edeceğine birimin **mutlak** kimliğiyle karar verir. İkinci dünyanın
birimleri farklı kimlik aralığında doğar → cephe temposu kayar → savaşlar başka
sonuçlanır.

**Oyuncuya etkisi:** Bir oturumda "yeni oyun" deyip aynı tohumu girmek farklı bir
dünya verir. Aynı kök neden YÜKSEK-15'i (kayıt/yükleme dallanması) da açıklar.

**Etkilenen dosyalar:** `src/game/units.js:270`, `src/game/command.js:723`

**Önerilen asgari düzeltme:** Kimliği dünyaya bağla (`world.nextUnitId`) ve
cadence kapısını kimliğe değil tümenin komuta içindeki **sırasına** dayandır
(`general.divisions.indexOf(unit.id)`). İkisi birlikte hem determinizmi hem
kayıt/yükleme tutarlılığını düzeltir.

---

### KRITIK-2 · Tüketim bütçeye bağlı değil (vergi → piyasa bağlantısı kırık)  `[DÜZELTİLDİ]`

| | |
|---|---|
| **Mekanik** | `populationDemand` — hane talebi |
| **Test** | `tax-audit.mjs` — alt sınıf vergisi %0 / %50 / %100, 260 hafta, savaşsız |
| **Beklenen** | Bütçesi sıfırlanan sınıf daha az mal alır; piyasa talebi düşer |
| **Ölçülen** | Bütçe %100 düştü, sepet harcaması %4.1 **arttı** |

Hafta +260, aynı tohum, tek değişken:

| altVergi | vergiGeliri | altGelir | altBütçe | altSepet | artık | ihtiyaç | memnun | nüfus |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0% | 41.86 | 70.02 | **330.1** | **153.7** | +176.4 | 99.1% | 0.58 | 643,999 |
| 50% | 69.80 | 63.58 | 161.4 | 149.3 | +12.2 | 99.1% | 0.44 | 641,458 |
| 100% | 106.64 | 66.74 | **0.0** | **160.2** | −160.2 | 17.2% | 0.29 | 639,180 |

**Kök neden:** `economy.js:1704-1717` — talep `quantity = amount * scale` ile
**yalnız nüfusa** orantılı üretilip pazara yazılır. `needsBudget` sonradan
hesaplanır ve yalnızca `canAffordNeeds`, `satisfaction` ve `prosperityWeeks`
gibi *rapor* alanlarını besler. Hiçbir yerde talep bütçeye göre kısılmaz.

**Sonuçları (zincirleme):** Vergi tüketimi kısmadığı için üretim de küçülmez →
matrah küçülmez → **Laffer eğrisi yoktur** (ORTA-19); gümrüğün hane sepetine
bindirdiği maliyet de aynı sebeple sonuçsuz kalır (YÜKSEK-4); "ihtiyaç
karşılanması %0" bir gösterge olarak kalır, hiçbir sisteme girmez.

**Etkilenen dosyalar:** `src/game/economy.js:1693-1755`

**Önerilen asgari düzeltme:** `populationDemand` içinde sepeti iki geçişte
çöz — önce sepet maliyetini fiyatlarla hesapla, sonra
`afford = clamp(needsBudget / basketCost, 0, 1)` oranıyla **pazara yazılan
miktarı** kıs. Lüks kalemler önce kesilsin (temel gıda en son). Bu tek değişiklik
vergi, gümrük, refah ve kıtlık kanallarının dördünü birden canlandırır.

---

## YÜKSEK

### YÜKSEK-3 · %100 vergi neredeyse bedelsiz  `[DÜZELTİLDİ]`

**Test:** `tax-audit.mjs`, üç sınıf da %0 vs %100, 260 hafta savaşsız.

| | hepsi %0 | hepsi %100 |
|---|---:|---:|
| hazine | 2,935 | **33,333** |
| vergi geliri | 0.00 | 153.82/hafta |
| nüfus | 644,107 | 639,049 (**−0.8%**) |
| sanayi (tesis/seviye) | 10/35 | 10/33 |
| istikrar | 0.58 | 0.29 |
| üst sınıf | 27,000 | **0** |
| ihtiyaç karşılanması | 100.0% | 0.0% |

Üst sınıfın tamamen yok olmasının bile ölçülebilir bir bedeli yok: özel sermaye
her senaryoda tavanda (1200) kalıyor, çünkü `collectPrivateCapital` fabrika
kârının %8'iyle tek başına tavanı dolduruyor.

**Kök neden:** KRITIK-2'nin doğrudan sonucu + `satisfaction`ın tek çıktısı olan
`stability`nin dar etki bandı (province büyüme çarpanı `0.45 + stability`).

**Dosyalar:** `economy.js:1726-1746` (bütçe/memnuniyet), `provinces.js:435` (büyüme),
`politics.js:248-257` (özel sermaye)

**Asgari düzeltme:** KRITIK-2 çözülünce doğal olarak düzelir. Ek olarak
`collectPrivateCapital`ın fabrika kârı bileşenini üst sınıf nüfusuyla ölçekle.

---

### YÜKSEK-4 · %100 gümrük bedelsiz gelir

**Test:** `tariff-audit.mjs`, −50…100, 200 hafta, korumacı hükümetli ülke.

| tarife% | gümrükGeliri | ithalatMiktar | girdiFaturası | ihtiyaç | altSepet | hazine | borç |
|---:|---:|---:|---:|---:|---:|---:|---:|
| −50 | −390.65 | 35.89 | 169.00 | 99.2% | 127.3 | **−31,065** | 2,442 |
| 0 | 0.00 | 6.11 | 187.03 | 99.2% | 149.8 | 3,761 | 0 |
| 50 | 29.45 | 2.94 | 168.17 | 99.2% | 157.1 | 11,465 | 0 |
| 100 | 41.05 | **2.13** | 184.11 | **99.2%** | 166.2 | **14,633** | 0 |

Gümrük geliri toplam gelirin **%31.3**'ü. Korumacılığın *koruyan* kısmı çalışıyor
(ithalat −%65.2) ama *bedeli* çalışmıyor: fabrika girdi faturası −%1.6, ihtiyaç
karşılanması −0.01 puan. Sebep: ortalama ithal payı %2.7–7.5 — kanalın üzerinde
işleyeceği hacim yok. Negatif tarifenin bedeli ise gerçek (hazine −31,065).

**Kimlik kontrolü tam:** `gümrükGeliri = ithalatDeğeri × tarife`, altı seviyede de
sapma 0.00. **Çifte sayım yok.**

**Dosyalar:** `economy.js:2109-2169` (settleGlobalTrade), `economy.js:1646-1653`
(fabrika girdi tarifesi)

**Asgari düzeltme:** KRITIK-2 + zincirin orta katmanının kurulması (YÜKSEK-16).
Ticaret hacmi büyümeden bu kanal ölçülebilir hâle gelmez.

---

### YÜKSEK-5 · Sanayi kârı hiçbir yere akmıyor

**Test:** `factory-audit.mjs`, 150 hafta.

```
haftalık fabrika kârı   444.50
devlet geliri            88.90   (oran 5.0×)
üst sınıf geliri         27.88
özel sermaye             35.6    (tavan 1200)
```

Fabrika kârının varış yerleri: işten çıkarma sinyali, seviye atlama kapısı,
sübvansiyon ve `privateCapital += kâr × 0.08`. Hazineye **0**, hane gelirine **0**.
Sınıf geliri `incomePool = üretimDeğeri × 0.18/0.22` formülünden gelir — kârdan
değil. Yani bir fabrikanın kâr mı zarar mı ettiği hanelerin cebini hiç
değiştirmez.

**Dosyalar:** `economy.js:1672-1690`, `economy.js:1757-1767`, `politics.js:248-257`

**Asgari düzeltme:** `incomePool`a fabrika kârını dahil et
(`+ max(0, factoryProfit) × 0.5`) ve ağırlığın çoğunu `upper`a ver — kapitalist
sınıfın geliri sanayinin kârı olsun.

---

### YÜKSEK-6 · POP hane defteri kendi içinde tutarsız

**Test:** `population-audit.mjs`, 200 hafta, temsili kohortlar.

| meslek | brütGelir | vergi | netGelir | geçimBütçesi | tüketim | artık |
|---|---:|---:|---:|---:|---:|---:|
| farmers | 0.54 | 0.05 | 0.49 | **4.62** | 2.20 | +2.42 |
| workers | 11.30 | 1.13 | 10.17 | **96.50** | 45.90 | +50.60 |
| capitalists | 8.30 | 3.73 | 4.56 | **21.12** | 28.85 | −7.74 |

"Brüt gelir − vergi = geçim bütçesi" kimliğinde en kötü sapma **%849**. Ulusal
toplamda: sınıf gelirleri 183.78/hafta, geçim bütçeleri **979.63/hafta (5.3×)**.

**Kök neden:** İki sayı bağımsız formüllerden gelir.
`income = incomePool × ağırlık` (üretim değerinden),
`needsBudget = nüfus × sabit sepet × ücret endeksi × (1 − vergi) × (1 + refah)`.
`income` yalnız vergi matrahı olarak kullanılır; harcamayı `needsBudget` belirler.

**Dosyalar:** `economy.js:1726-1727` (bütçe), `economy.js:1757-1767` (gelir)

**Asgari düzeltme:** `needsBudget`i `income`dan türet
(`needsBudget = (income − taxPaid) × (1 + welfare×0.22)`) ve `incomePool`u
sepet ölçeğine kalibre et. Bu YÜKSEK-5 ve KRITIK-2 ile aynı düzeltmenin parçası.

---

### YÜKSEK-7 · POP birikimi (savings/wealth) yok

Sınıf nesnesinde `savings`/`wealth` alanı yok — ölçüldü, `false`. Her hafta
sıfırdan başlanır. Sonuçları: geçmiş refah geleceğe taşınmaz, kıtlık bir birikimi
eritemez, vergi bir servet stoğunu tüketemez, "iyi yıllar kötü yılları taşır"
diye bir şey yoktur. Oyundaki tek servet stoğu `politics.privateCapital`.

**Dosyalar:** `economy.js:826-836` (sınıf şeması), `population.js:113-129`

**Asgari düzeltme:** `classes[c].savings` ekle;
`savings += needsBudget − needsCost` (taban 0, tavan sepetin ~26 katı) ve
`canAffordNeeds` kararına `savings`i dahil et.

---

### YÜKSEK-8 · İşsizliğin hane ekonomisinde karşılığı yok  `[DÜZELTİLDİ]`

`population.js:113-129 cohortEconomics` kohort ekonomisini
`share = size / classPopulation` ile dağıtır; `employed` alanı hiç kullanılmaz.
Ölçüm: aynı province'te çalışan ve işsiz işçi kohortları **kişi başına aynı
gelire ve aynı tüketime** sahip.

**Asgari düzeltme:** `share`ı istihdam ağırlıklı yap
(`employed × 1 + unemployed × 0.35`).

---

### YÜKSEK-9 · GSYH → hane refahı bağı yok  `[DÜZELTİLDİ]`

**Test:** `population-audit.mjs` N bölümü, 80 hafta, kadro sıfıra sabitlenmiş.

| senaryo | tesis | çalışan | kohortİstihdamı | **gdp** | **ihtiyaçKarşılanma** | altMemnuniyet |
|---|---:|---:|---:|---:|---:|---:|
| A sağlıklı | 16 | 41,913 | 78.0% | **698.1** | 98.7% | 0.46 |
| B kapalı | 16 | 0 | 70.5% | **36.0** | **98.7%** | 0.43 |
| C şişirilmiş | 16 | 78,000 | 84.4% | 963.7 | 98.8% | 0.47 |

Ülkenin bütün sanayisi durunca GSYH **%94.8** düşüyor, halkın ihtiyaç
karşılanması **hiç** değişmiyor.

**Kök neden:** Hane talebi nüfusla ölçülür; karşılanma bütçeyle değil pazar
arzıyla belirlenir; arz da RGO ağırlıklı olduğu için sanayinin durması haneyi
bulmuyor.

---

### YÜKSEK-10 · Temel gıda kıtlığının nüfusa bedeli yok  `[DÜZELTİLDİ]`

**Test:** `market-audit.mjs` M bölümü — dünya tahıl üretimi ×0, 120 hafta,
sabit izlenen ülke.

| üretimÇarpanı | fiyat | dünyaArz | karşılanma | altSepet | altMemnun | istikrar | nüfus |
|---:|---:|---:|---:|---:|---:|---:|---:|
| ×0 | 16.00 (tavan) | 0.00 | **0.0%** | 369.3 | 0.50 | 0.48 | **599,721** |
| ×1 | 0.24 (taban) | 506.03 | 100.0% | 247.6 | 0.56 | 0.53 | **599,667** |
| ×4 | 0.24 (taban) | 2026.13 | 100.0% | 300.9 | 0.52 | 0.48 | 599,615 |

Dünyada hiç tahıl kalmamasının 120 haftalık nüfus etkisi: **−0.0%**. Kıyafet ve
konserve için de aynı: −0.5% ve −0.2%.

**Asgari düzeltme:** `province` büyüme formülüne ihtiyaç karşılanmasını kat:
`weeklyGrowth × (0.2 + 0.8 × needsFulfilled)`; %50'nin altında negatif büyüme
(açlık ölümü) ver.

---

### YÜKSEK-11 · Teçhizat → muharebe gücü bağı yok denecek kadar zayıf  `[DÜZELTİLDİ]`

**Test:** `military-audit.mjs`, aynı tohum, aynı savaş, 80 hafta.

| senaryo | mevcut% | ortOrg | **saldırıGücü** | ikmalEndeksi | silahStoğu | **işgalEttiği** | hazine |
|---|---:|---:|---:|---:|---:|---:|---:|
| sanayi kapalı + stok sıfır | 97.3% | 98.4 | **160.4** | 0.13 | 2.98 | **59** | 6,747 |
| stok tavanda | 99.5% | 99.0 | **166.4** | 1.00 | 40.00 | 52 | 4,013 |

Mermisiz ordu **daha fazla toprak işgal etti ve daha çok para biriktirdi**.
Teçhizatın tek gerçek kanalı 80 haftada 2.2 puan mevcut farkı.

**Kök neden:** `battles.js:94-108 battleUnitPower` yalnız `militaryWages`
çarpanına bakar; teçhizat stoğu muharebe gücüne hiç girmez. Stok yalnızca
takviye hızını ve organizasyon toparlanmasını etkiler; savaşlar da çok az
kayıp ürettiği için bu kanal görünmez.

**Asgari düzeltme:** `battleUnitPower`a ikmal çarpanı ekle:
`× (0.55 + 0.45 × supplyIndex)`.

---

### YÜKSEK-12 · Hazinenin tabanı yok (iflas mekaniği eksik)  `[DÜZELTİLDİ]`

**Test:** `debt-audit.mjs` — haftalık gelirin iki katı zorla sızdırılır, 150 hafta.

```
hafta   hazine    borç  kapasite  yıllıkFaiz
   15        0   1,981     2,813        9.6%
   60   -6,202   3,732     3,701       12.0%
  150  -23,350   5,711     5,201       12.0%
```

Borç kapasitede **doğru şekilde** duruyor; ama karşılanamayan açık hazinede
sınırsız negatif olarak birikiyor. Geri dönüşü yok: `canAfford` kapanır,
`gold > 0` şartına bağlı bütün bina bonusları söner (inşaat gücü 125 → 5),
gelir düşer, çukur derinleşir.

**Uzun koşu kanıtı** (`long-run-audit.mjs`):

| süre | batık ülke oranı | ülke başına ort. hazine | ort. borç |
|---:|---:|---:|---:|
| 260 hafta | 0.0% | 1,152 | 17 |
| 520 hafta | 22.7% | 120 | 736 |
| 1040 hafta | **30.0%** | **−596** | 1,173 |

**Dosyalar:** `economy.js:2201-2224 settleDebt`

**Asgari düzeltme:** Borçlanma kapasitesi dolduğunda **zorunlu kesinti** uygula:
hazine negatifse sosyal harcamaları ve tedariki oransal olarak kıs, hazineyi 0'a
sabitle ve bir "temerrüt" cezası (istikrar/kredi) yaz. Şu anki hâli sessiz bir
imkânsız durum.

---

### YÜKSEK-13 · Devlet binaları peşin bedelsiz  `[DÜZELTİLDİ]`

**Test:** `construction-audit.mjs`.

| bina | tablodakiCost | **hazinedenÇıkan** | projeİşi(work) | projeParası(cost) | haftalıkBakım |
|---|---:|---:|---:|---:|---:|
| CONSTRUCTION_SECTOR | 100 | **0.00** | 100 | 0 | 4 |
| FORT | 70 | **0.00** | 70 | 0 | 1.5 |
| ADMINISTRATION | 80 | **0.00** | 80 | 0 | 2 |
| UNIVERSITY | 100 | **0.00** | 100 | 0 | 3 |

`CONSTRUCTION_TYPES.cost` alanı `normalizeProject` içinde `work` (inşaat işi)
olarak yorumlanıyor; `project.cost` 0 kalıyor, `projectFundingRatio` 1 dönüyor.
Fabrika projeleri peşin ödüyor, binalar ödemiyor. Hazinesi 0 olan ülke bile bina
bitiriyor (4 haftada ilerleme 0 → 21.38).

**Dosyalar:** `construction.js:105-115` (normalizeProject),
`construction.js:315-329` (queueConstruction)

**Asgari düzeltme:** `queueConstruction`da `cost: CONSTRUCTION_TYPES[typeId].cost`
alanını da yaz ve peşin tahsil et (fabrika yolundaki `payFactoryCost` deseni).

---

### YÜKSEK-14 · `nation.tiles` kayıt/yüklemede bozuluyor  `[DÜZELTİLDİ]`

**Test:** `save-audit.mjs` — 100 hafta, kaydet, yükle.

| ülke | kayıtta sayaç | kayıtta gerçek | **yüklemede sayaç** | **yüklemede gerçek** |
|---:|---:|---:|---:|---:|
| 0 | 136 | 136 | **117** | 136 |
| 1 | 135 | 135 | **61** | 126 |
| 2 | 125 | 125 | **79** | 125 |
| 6 | 120 | 120 | **104** | 120 |

12/15 ülkenin sayacı gerçek toprakla uyuşmuyor; en kötüsü %52 sapma.

**Kök neden:** `nation.tiles` `NATION_FIELDS` listesinde yok ve `deserialize`
sonrası yeniden sayılmıyor; `generateNations`ın verdiği 1. tur değeri kalıyor.
Bu sayacı okuyanlar:
`ai.js:170` YZ ordu hedefi (`desiredArmy = 4 + tiles/12`),
`ai.js:209` YZ şehir hedefi (`cities < 1 + tiles/45`),
`hegemony.js:57` prestij puanı (`nation.tiles × 0.04`),
`hegemony.js:86,90` **zafer koşulu** (`byConquest: leader.tiles === maxTiles`).

Yani bir kayıt yüklendiğinde yalnız YZ davranışı değil, **oyunun kazananını
belirleyen puan** da yanlış bir sayaçtan hesaplanmaya başlar.

**Dosyalar:** `save.js:24`, `save.js:155-178`

**Asgari düzeltme:** `deserialize`ın sonunda toprakları yeniden say
(`for (nation) nation.tiles = 0;` sonra `world.forEach(t => t.owner>=0 && nations[t.owner].tiles++)`).

---

### YÜKSEK-15 · Kaydet/yükle simülasyonu dallandırıyor  `[DÜZELTİLDİ]`

**Test:** `save-audit.mjs` — 100 hafta → kaydet → (A) kesintisiz 100 hafta,
(B) yükle + 100 hafta.

| alan | aynı | kesintisiz | yüklenmiş |
|---|---|---|---|
| turn | evet | 201 | 201 |
| population | **HAYIR** | 6,738,537 | 6,767,343 |
| units | **HAYIR** | 248 | 230 |
| cities | **HAYIR** | 50 | 49 |
| wars | **HAYIR** | (yok) | 1-13 |
| nations | **HAYIR** | … | … |
| prices | **HAYIR** | … | … |

Yükleme **kendi içinde** deterministik (aynı kayıttan iki bağımsız yükleme
birebir aynı). Sorun, yüklemenin farklı bir gelecek üretmesi.

**Kök neden:** KRITIK-1 ile aynı (`deserialize` birimleri yeniden üretir, yeni
kimlikler cephe temposunu kaydırır) + aktif muharebelerin bilerek düşürülmesi
(`save.js:55-59`).

---

### YÜKSEK-16 · Piyasa fiyat bandında kilitleniyor

**Test:** `long-run-audit.mjs` — 17 koşu, 260/520/1040 hafta.

| süre | tavanda mal | tabanda mal | tamamen ölü | talebi var arzı yok |
|---:|---:|---:|---:|---:|
| 260 hafta | 6.0 | 12.9 | 10.9 | 1.1 |
| 520 hafta | 7.6 | 12.0 | 10.4 | 1.0 |
| 1040 hafta | **9.5** | **10.5** | 12.0 | 1.0 |

43 malın **%48.8**'i fiyat sınırında çakılı. Örnek kesit (120 hafta):

```
food     arz 505.25  talep 207.23  fiyat 0.24 (taban ×0.12)
iron     arz  78.93  talep  39.42  fiyat 0.60 (taban)
timber   arz  58.05  talep   4.32  fiyat 0.36 (taban)
clothes  arz  26.89  talep  33.42  fiyat 72.00 (tavan ×8)
furniture arz  2.15  talep  11.10  fiyat 96.00 (tavan)
liquor   arz   0.00  talep  10.36  fiyat 64.00 (tavan)  ← hiç üretilmiyor
paper    arz   0.00  talep   3.43  fiyat 48.00 (tavan)  ← hiç üretilmiyor
```

Hammadde arzı talebin 2–13 katı (taban), işlenmiş mal arzı talebin çok altında
(tavan). Üretim zincirinin orta katmanı kurulmuyor. Bunun ikinci derece sonucu:
`factoryMargin` 200. haftada tasarım marjının 20–40 katına çıkıyor (REFINERY
tasarım 1.80 → gerçek **117.36**; LUXURY_WORKSHOP 3.30 → **82.08**), yani tüketim
malı fabrikaları para basma makinesine dönüşüyor.

**Asgari düzeltme:** RGO arzını nüfusla değil talep ile ölçekle ya da ham mal
fiyat tabanını yükselt (0.12 → 0.4) ve tüketim malı tavanını düşür (8 → 4);
ayrıca `investmentOptions`ın "hiç kurulmamış tür önce" kuralına kıtlık ağırlığı
ekle (arz/talep < 0.5 olan malı üreten tesise öncelik).

---

### YÜKSEK-17 · Sömürücü politika seti baskın

**Test:** `strategy-audit.mjs` — 21 politika seti, aynı tohum, 260 hafta.

| sıra | strateji | puan | hazine | tesis/seviye | nüfus | istikrar | ihtiyaç |
|---:|---|---:|---:|---|---:|---:|---:|
| 1 | 12 şantiye + tavan vergi + tavan tarife | **65.0** | 32,305 | 33/37 | 392,372 | 0.35 | 0.0% |
| 2 | tavan vergi + tavan tarife + sıfır sosyal + sıfır ordu | **60.7** | 29,652 | 32/36 | 391,741 | 0.31 | 0.0% |
| 3 | tam vergi %100 | 59.6 | 27,475 | 32/36 | 392,464 | 0.35 | 0.0% |
| … | | | | | | | |
| 14 | DENGELİ (YZ vergi + tarife %50 + refah/eğitim %60) | 45.7 | 9,107 | 35/39 | 395,652 | 0.58 | 99.5% |
| 20 | REFAH DEVLETİ (düşük vergi + tam sosyal) | 34.7 | −1,156 | 22/38 | 406,165 | 0.72 | 100.0% |

Sömürücü setin bedeli: nüfusta **%1.0**, sanayide 3 seviye. Kazancı: hazinede
**3.3 kat**. Kaydıraç uçlarının puan farkı:
sıfır sosyal > tam sosyal (+5.5), sıfır ordu > tam ordu (+1.7),
yönetim %100 > %30 (+3.2), tarife %100 > %0 (+4.0).

---

## ORTA

### ORTA-18 · Yönetim bütçesi tek yönlü optimal (gizli ceza)

`budget-audit.mjs`: yönetim %30 → %100 arasında vergi geliri 33.86 → 50.47
(+%49), yönetim gideri 0.03 → 0.10. Net kazanç **+16.54/hafta**. Kaydırağı kısmak
hiçbir senaryoda doğru değil — bu bir tercih değil, gizli bir ceza. Ayrıca
province kontrol kanalı (kod yorumunda vaat edilen) hiç kurulmamış: %30 ile %100
arasında ortalama kontrol farkı **%0.0**.
*Düzeltme:* yönetim giderini nüfusla ölçekle (`administrationCost × population/10000`).

### ORTA-19 · Vergi gelirinde Laffer eğrisi yok

`strategy-audit.mjs`: hazine %0 → 5,297 · %5 → 5,477 · YZ tavanı → 13,750 ·
%100 → **27,475**. Monoton artıyor. KRITIK-2'nin doğrudan sonucu.

### ORTA-20 · Eğitim sınıf hareketliliğini hiç etkilemiyor

`budget-audit.mjs`. Eğitim %0 vs %100, üç ufukta:

| hafta | ortaSınıf@0% | ortaSınıf@100% | kadro@0% | kadro@100% | seviye@0% | seviye@100% |
|---:|---:|---:|---:|---:|---:|---:|
| 260 | 100,000 | **100,000** | 53,404 | 64,740 | 37 | 40 |
| 520 | 105,000 | **111,000** | 52,481 | 60,059 | 44 | 53 |
| 1040 | 117,000 | **118,000** | 56,963 | 74,782 | 49 | 67 |

1040 haftada bile orta sınıf farkı **%0.8**; buna karşılık sanayi kadrosu +%31,
tesis seviyesi +%37. Yani eğitimin **işe alım kanalı çalışıyor, terfi kanalı
çalışmıyor**. Sebep: `runPromotion`daki kapı (`satisfaction > 0.55` **ve**
`artık > sepetin %35'i`) eğitimden önce geliyor; kapı kapalıysa `schooling`
çarpanı bir şey yapmaz.

### ORTA-21 · Sağlık harcaması ölçülemeyecek kadar zayıf

260 haftada sağlık %0 → %100 nüfus farkı **%0.7** (583,126 → 587,074), haftalık
bedel 23.01 altın. Çarpan (`1 + sağlık × 0.35`) taban büyüme %0.006/hafta
üzerinde çalışıyor. Ölümlülük/hastalık diye ayrı bir mekanik yok.

### ORTA-22 · Sıfır harcama devletinin bedeli yok denecek kadar az

260 hafta: nüfus farkı **−0.2%**, ihtiyaç karşılanması hâlâ %99.8. Tek görünür
bedel ordu gücü (51.4 → 38.4) ve ikmal (0.19 → 0.16). Hazine −1,690 (ilginç
şekilde sıfır harcama *kârlı değil*, çünkü `adminFunding` düşünce tahsilat
verimi de düşüyor).

### ORTA-23 · Tavan harcama sürdürülebilir

260 hafta, her kaydıraç %100 + bütün fabrikalar destekli: hazine 7, borç 90,
haftalık net **+3.51**. Karşılığında istikrar 0.51 → 0.66 ve sanayi 37 → 40
seviye. "Her şeyi aç" dominant değil ama cezalandırılmıyor da.

### ORTA-24 · Aynı ham üretim iki ayrı ekonomide sayılıyor

`legacy-audit.mjs`: aynı hafta aynı tahıl hem `nationBudget.production.food`
(36.0) hem `rawProduction → market.supply` (35.6) olarak sayılıyor. `cities.js`
ve `economy.js` aynı `provinceOutput` çağrısını kullanıp birbirinden habersiz iki
paralel ekonomi besliyor.

### ORTA-25 · Teçhizat kademesi (EQUIPMENT_TIERS) tamamen ölü

300 haftada dünyadaki **246 tümenin** bütün alayları hâlâ kademe 1 (Levy).
`createRegiment` `tier: 1` verir, hiçbir kod yolu yükseltmez. Kademe 2–4'ün güç
(1.15/1.32/1.52) ve bakım (1.6/2.4/3.6) çarpanları ile bedelleri
(`{gold, iron}`) hiç kullanılmaz — üstelik bedel `iron` ister, `nation.iron` ise
`turn.js:75`'te **silinir**, yani ödenebilir bile değil.

### ORTA-26 · Açık ama hiç kurulmayan tesis türleri

300 turda: `DYE_WORKS`, `EXPLOSIVES_FACTORY` hiçbir ülke tarafından kurulmadı.
200 turda: `EXPLOSIVES_FACTORY` (canlı marj **−58.80**). Sebep:
`investmentOptions` yalnız `factoryMargin > 0` olanları seçer; girdisi fiyat
tavanında olan tesis kalıcı negatif marja düşüp kuyruğa hiç girmez.
11 mal (`tools, electric_gear, synthetic_oil, explosives, telephone, radio,
automobile, tanks, airplane, clippers, steamers`) ne üretiliyor ne talep ediliyor.

### ORTA-27 · Province sanayi kadrosu yerel nüfusu aşabiliyor

400 haftada en kötü örnek: kare `3:37` → **16,707 sanayi işçisi, 3,900 nüfus**
(4.3 kat). Kadro ulusal havuzdan dağıtılır ama `province.industrialEmployees`
yerel nüfusa karşı doğrulanmaz. Sonucu: `rgoLaborScale`
(`rural = max(0, population − industrialEmployees)`) o karede 0'a düşer ve RGO
üretimi durur.

### ORTA-28 · `populationOf` hayali 10.000 kişilik taban uyduruyor

`boundary-audit.mjs`: province nüfusu 0 ve 1 olan iki senaryo aynı sonucu verdi —
ülke nüfusu 10,000, sanayi kadrosu 14,074, GSYH 324.0, 8 alay sahada.
`populationOf = Math.max(10000, provincePopulation(...))`. Sınıf nüfusları, vergi
matrahı ve sosyal harcama bu hayali tabandan hesaplanıyor.

### ORTA-29 · Fabrika projesi iptalinde para iade edilmiyor

434 altın peşin ödendi, proje iptal edildi, hazineye **0** altın döndü.
`cancelConstruction` yalnız projeyi listeden siliyor. (Para *üretmiyor*, yani
istismar değil — sessiz bir kayıp.)

### ORTA-30 · Parasız devlet inşaata devam ediyor

Hazine 0 iken bina projesi taban inşaat gücüyle (5/hafta) ilerlemeye devam etti
(4 haftada 0 → 21.38). YÜKSEK-13'ün sonucu.

### ORTA-31 · YZ vergiyi sürekli tavanda tutuyor

`ai-audit.mjs`, 10 tohum × 260 hafta, 150 ülke: **122/150 (%81)** ülke üç vergiyi
de YZ tavanında (35/42/45) tutuyor. **149/150 (%99)** ülke tarifeyi %100'de
tutuyor. `adjustFiscalAI` yalnız `rich` (hazine > 600 **ve** haftalık net > 0)
durumunda vergi indirir; bu eşiğe ulaşamayan ülkede vergi tek yönlü yükselir.

### ORTA-32 · Sürekli savaş ucuz

`military-audit.mjs`, 260 hafta savaş vs 260 hafta barış (tam YZ):
hazine 15,198 → 12,499 (−2,699 ≈ 10 altın/hafta), nüfus −1.5%, borç 0 → 0,
sanayi 39/63 → 39/63 (aynı). Tedarik faturası 24.17 → 44.31/hafta.

### ORTA-33 · Genel sübvansiyon zararsız

`strategy-audit.mjs`: bütün fabrikaları desteklemek hazineyi 13,750 → 12,400'e
indiriyor, sanayiyi değiştirmiyor. `factory-audit.mjs`de kasten zararlı 4 tesis
100 haftada **3,748 altın** sübvansiyon yedi ve karşılığında **141.4 altınlık**
mal üretti — istismar edilebilir değil, ama üç tesis girdisizlikten
`throughput = 0` iken bile haftada 6 altın ücret faturası kesmeye devam etti.

---

## DÜŞÜK

| # | Bulgu | Kanıt |
|---|---|---|
| D-34 | **Kohort yuvarlama farkı** — nüfus 1000'lik kohortlara yuvarlanıyor, artık hiçbir mesleğe yazılmıyor | en kötü %0.4 (748,010 → 748,000) |
| D-35 | **`city.foodStore` ölü alan** — `createCity` yazıyor, `deserialize` 0'lıyor, kimse okumuyor | 300 haftada 50 şehrin hepsi hâlâ 60 |
| D-36 | **`economy.armySpending` ölü ama hâlâ kırpılıyor** — hiçbir sistem okumuyor, `applyGovernmentLimits` her hafta kırpıyor; yeni kaydıraçlar değişince güncellenmiyor | `militaryWages=90` sonrası `armySpending` 55'te kaldı |
| D-37 | **`economy.inventory` bir stok değil** — her hafta üzerine yazılıyor | bir hafta sonra birikmiyor |
| D-38 | **`nation.gold > 0` uçurumu** — inşaat gücü 125 → 5, vergi çarpanı 1.04 → 1.00, üniversite bonusu 0.04 → 0.00, hepsi 1 altınla 0 altın arasında | ölçüldü |
| D-39 | **İthalat iştahı formülü −%62.5'te tanımsız** — `1/(1 + t/100 × 1.6)`; altında negatif | UI bandı (−50) bugün girmiyor, koruma yok |
| D-40 | **Okuryazarlık/nitelik değişkeni yok** — eğitim yalnız iki çarpan, birikim yok | kaydırağı kapatınca kazanım anında kaybolur |
| D-41 | **Kereste ve demir havuzları kendi kendini besliyor** — tek okuyucu `workerWeights` | `net.timber 1.0`, `net.iron −2.0` |
| D-42 | **Harita hiç konsolide olmuyor** — 1040 haftada canlı ülke 15 → 15 (bütün tohumlarda) | hegemonya yarışı anlamsızlaşıyor |

---

## ÖLÜ MEKANİKLER (ölçülmüş, etkisi sıfır)

1. **EQUIPMENT_TIERS** — 4 kademe, 246 tümenin tamamı kademe 1 (ORTA-25)
2. **`city.foodStore`** — yazılıyor, hiç okunmuyor (D-35)
3. **`economy.armySpending`** — hiçbir sistem okumuyor (D-36)
4. **`adminFunding` → province kontrolü** — kod yorumunda vaat, kanal yok (ORTA-18)
5. **Sınıf `income` alanı** — yalnız vergi matrahı; hane harcamasını hiç belirlemiyor (YÜKSEK-6)
6. **`cohort.employed`** — hesaplanıyor, kohort ekonomisine girmiyor (YÜKSEK-8)
7. **`needsFulfilled` göstergesi** — %0'a düşüyor, hiçbir sisteme girmiyor (KRITIK-2)
8. **11 mal ve 2 tesis türü** — hiç üretilmiyor/kurulmuyor (ORTA-26)

## ZAYIF MEKANİKLER (çalışıyor ama fark yaratmıyor)

| Mekanik | Ölçülen etki | Beklenen |
|---|---|---|
| Sağlık harcaması | 260 haftada nüfus +%0.7 | belirgin |
| Eğitim → sınıf terfisi | %0.0 | belirgin |
| Tarife → fabrika girdi maliyeti | −%1.6 | korumacılığın bedeli |
| Teçhizat → muharebe gücü | %3.6 | belirleyici |
| Kıtlık → nüfus | tahıl ×0'da −%0.0 | yıkıcı |
| İşsizlik → hane refahı | kişi başı fark yok | belirgin |
| Sıfır kamu harcaması → nüfus | −%0.2 | uzun vadede yıkıcı |

## AŞIRI GÜÇLÜ MEKANİKLER

| Mekanik | Ölçülen |
|---|---|
| %100 vergi | 260 haftada +30,398 altın, bedel: nüfusta %0.8 |
| %100 gümrük | 200 haftada +10,872 altın, ölçülebilir bedel yok |
| Bedava bina inşaatı | 4/4 bina türü peşin 0 altın |
| Yönetim bütçesi %100 | +16.54/hafta net, karşılığında 0.07 altın gider |
| Sanayi kârı | 444.5/hafta üretiliyor, hiçbir bütçeyi bağlamıyor |

## İSTİSMARLAR (oyuncu tarafından kullanılabilir)

1. **Kalıcı %100 vergi + %100 gümrük + sıfır sosyal** → baskın strateji (YÜKSEK-17)
2. **Sınırsız bedava bina** → inşaat gücü ve vergi çarpanı peşin bedelsiz (YÜKSEK-13);
   tek fren haftalık bakım (36 şantiye + 32 kale = 238/hafta, hazine hâlâ 7,755)
3. **Askerî sanayiyi tamamen kapatmak** → savaşta daha iyi sonuç *ve* daha çok para (YÜKSEK-11)
4. **Aynı tohumu yeniden girmek** → farklı dünya (KRITIK-1); kaydet/yükle ile
   savaş sonucu "yeniden atılabilir" (YÜKSEK-15)

**İstismar OLMADIĞI doğrulananlar:** borçlan–geri öde döngüsü para üretmiyor;
kur–dağıt döngüsü nüfus üretmiyor (200 döngü, sapma **0 kişi**); iptal–yeniden
kur döngüsü para üretmiyor (50 döngü, fark **0.00**); sübvansiyon net kazanç
sağlamıyor; bölge yuvası aşılamıyor.

## YZ PATOLOJİLERİ

1. **%81 ülke üç vergiyi de tavanda tutuyor**, **%99 ülke tarifeyi %100'de** (ORTA-31)
2. **Geç oyun borç sarmalı** — `ai-audit.mjs`, aynı 5 tohum, iki ufuk:

   | ufuk | hazine ≤ 0 | hazine < −50 | borçlu | ort. hazine | ort. borç | ort. seviye |
   |---:|---:|---:|---:|---:|---:|---:|
   | 260 hafta | 0/75 | **0/75** | 1/75 | 1,294 | 6 | 33.4 |
   | 520 hafta | 22/75 | **17/75 (%23)** | 31/75 | 1,188 | 580 | 43.8 |

   En kötü hazine 520. haftada **−8,487**. 400 haftalık ayrı koşuda 15 ülkenin
   6'sı borç kapasitesini aşmış (yük %101–162), haftalık net −51 … −82.
   Kriz dalı (`adjustWarFiscalAI`) yalnız `borç > kapasite/2 ve hazine < 50`
   şartıyla açılıyor, açtığında da yalnız sosyal harcamayı ve tedariki kısıyor —
   açığı kapatmaya yetmiyor. Sanayi büyümeye devam ettiği için (33.4 → 43.8
   seviye) bu bir üretim çöküşü değil, **saf maliye çöküşü**.
3. **`adminFunding` hiç kullanılmıyor** — 150/150 ülke %100'de (varsayılan);
   YZ tarafında bu kaydırağı ayarlayan hiçbir kod yok
4. **Savaşlar toprak değiştirmiyor** — 1040 haftada hiçbir ülke elenmedi (D-42)

**YZ'nin sağlıklı çıktığı alanlar:** hiç fabrikasız ülke yok (0/150), para yığıp
yatırım yapmayan yok (0/150), ordu şişkinliği yok (0/150), istikrarı 0.35 altında
ülke yok (0/150), sübvansiyonla batan ülke yok.

## ESKİ / MÜKERRER SİSTEMLER

| Sistem | Durum |
|---|---|
| `food/timber/iron` bütçe havuzu | Paralel ekonomi; tahıl çift sayılıyor (ORTA-24) |
| `EQUIPMENT_TIERS` | Tamamen ölü (ORTA-25) |
| `city.foodStore` | Ölü alan (D-35) |
| `economy.armySpending` | Ölü ama hâlâ kırpılıyor (D-36) |
| `economy.inventory` | Adı stok, davranışı haftalık akış (D-37) |
| `LEGACY_UNIT_TYPES` / `englishCityName` | Yalnız eski kayıt göçü — **temiz** |
| `factory.cityId` → `q/r` göçü | `ensureFactoryAnchor` — **temiz** |
| `regiment.home` → `draws` göçü | `appendDraw` — **temiz, korunumlu** |

---

## İYİ ÇALIŞAN SİSTEMLER (test edildi, doğrulandı)

1. **Piyasa akış korunumu** — 20 hafta × 43 mal taraması:
   `pazarArz = Σ(ülkeÜretim − alıkonan)` sapma **0.00**,
   `pazarTalep = Σ ülkeTalep` sapma **0.00**,
   `Σ ithalat = Σ ihracat` sapma **0.00**,
   `fulfilled ≤ demand` ihlali **0.00**. Mal yoktan var olmuyor, kaybolmuyor.
2. **Üretim zinciri girdi kısıtı** — demir ve kömür RGO'ları sıfırlandığında
   demir −%100 → çelik −%100, silah −%100, çimento −%100. Fabrikalar girdisiz
   üretmiyor.
3. **Nüfus muhasebesi** — 15 ülke, 200 hafta: kohort/meslek/sınıf toplamları
   arasında sapma **0 kişi**. Kur–dağıt döngüsü (200 tekrar) **0 kişi** sapma.
   Asker alım spam'i hiçbir province'i negatife düşürmedi (2000 kişilik taban
   tutuyor); çekilen insan (72,000) ile insan gücündeki düşüş (72,000) birebir.
4. **Sayısal sağlamlık** — 17 uç sınır senaryosu (0/1/dev nüfus, ±1e9 hazine,
   0/dev fiyat, 0/dev arz, 411 fabrika, %1000 tarife…) ve 17 uzun koşu
   (1040 haftaya kadar): **tek bir NaN/Infinity/negatif sayım/imkânsız durum yok**.
5. **Gümrük → ithalat hacmi** — %0 → %100 arasında ithalat **−%65.2**;
   gelir kimliği altı seviyede de tam.
6. **Askerî maaş → muharebe gücü** — %25 → %75 arasında saldırı gücü
   38.4 → 51.4 (**+%25.4**), gider 1.75 → 5.25.
7. **Askerî tedarik → ikmal → takviye** — tedarik %25 → %75: ikmal endeksi
   0.13 → 0.24, hasarlı ordunun 60 haftada toparlanması **%87.1 → %100.0**.
8. **Refah** — %0 → %100: cepten sepet 120.5 → 77.8, memnuniyet 0.49 → 0.69,
   istikrar 0.47 → 0.66, bedel 26.94/hafta.
9. **Borç sistemi** — borçlanma kapasitede duruyor, faiz her zaman pozitif
   (%4–12), geri ödeme çalışıyor (560.2 borçlanıldı → 560.2 geri ödendi),
   borçlan/öde döngüsü para üretmiyor, sınır değerlerinde kapasite ve faiz sonlu.
10. **İnşaat kapasitesi** — 0 → 12 şantiye: inşaat gücü 10 → 70, GSYH 734 → 947,
    bakım 4 → 52/hafta ile bedelini ödüyor. Bölge yuvası sınırı spam'e dayanıyor.
11. **Eğitim → sanayi işgücü** — %0 → %100: kadro 53,404 → 64,740 (+%17.5).
12. **Sübvansiyon** — gerçek bir hazine gideri (100 haftada 3,748 altın),
    zararı tam kapatıyor, kârı 0'a çekiyor, istismar edilemiyor.

---

## DÜZELTME SIRASI ÖNERİSİ

Bulguların çoğu **üç kök nedene** iniyor. Sırayla çözülürse çoğu türev bulgu
kendiliğinden kapanır.

**1. Tüketimi bütçeye bağla** (KRITIK-2)
→ kapattığı bulgular: YÜKSEK-3, YÜKSEK-4, YÜKSEK-9, YÜKSEK-10 (kısmen),
ORTA-19, YÜKSEK-17'nin çoğu.
Dokunulacak tek yer: `economy.js populationDemand`.

**2. Hane defterini tek kaynağa indir** (YÜKSEK-6)
→ `needsBudget`i `income − taxPaid`ten türet, `income`a fabrika kârını kat
(YÜKSEK-5), `savings` stoğu ekle (YÜKSEK-7), kohort payını istihdamla ağırlıklandır
(YÜKSEK-8).

**3. Determinizmi onar** (KRITIK-1)
→ `world.nextUnitId` + cadence'i sıraya dayandır; `deserialize` sonunda
`nation.tiles` yeniden say (YÜKSEK-14). Bu ikisi YÜKSEK-15'i de kapatır.

Bunlardan sonra bağımsız kalanlar: YÜKSEK-11 (teçhizat → muharebe gücü),
YÜKSEK-12 (hazine tabanı/iflas), YÜKSEK-13 (bina bedeli), YÜKSEK-16 (fiyat bandı),
ORTA-18 (yönetim gideri ölçeği), ORTA-25 (teçhizat kademesi).

Denetim turu boyunca üretim kodu değiştirilmedi. Düzeltmeler ayrı bir turda,
her biri kendi başarısızlığı kanıtlandıktan sonra ve aynı deterministik testin
öncesi/sonrası ölçümüyle yapıldı — aşağıda.

---

## UYGULANAN DÜZELTMELER

Sıra, yukarıdaki "düzeltme sırası önerisi"ni izler: önce kök nedenler, sonra
bağımsız kalanlar. Her düzeltme, onu ortaya çıkaran **aynı deterministik test**
ile doğrulandı; ardından tam takım yeniden koşularak gerileme arandı.

### Toplam sonuç

| | KRİTİK | YÜKSEK | ORTA | DÜŞÜK |
|---|---:|---:|---:|---:|
| Denetim turu (düzeltme öncesi) | **2** | **18** | 21 | 10 |
| Düzeltme sonrası (tam takım) | **0** | **5** | 16 | 9 |

Denetim başına son durum — `determinism`, `tariff`, `military`, `debt`, `save`
ve `construction` **sıfır bulguyla** kapanıyor. Kalan 5 YÜKSEK'in tamamı
bilinçli olarak kapsam dışı bırakılan hane defteri (3), sanayi kârının varış
yeri (1) ve fiyat bandı (1) kalemleridir — hepsi aşağıda gerekçeli.

Üretim kodundaki toplam değişiklik: **10 dosya, ~+270 / −40 satır.**

**Gerileme kontrolü:** Yeni takıma ek olarak depodaki 23 eski tanılama da
koşuldu. `scripts/mechanics-audit.mjs` sıfır ölü mekanik / sıfır bozuk
doğrulukla geçiyor. Davranışı bilerek değiştirdiğim iki eski tanılama
güncellendi ve gerekçesi koda yazıldı:
`construction-diagnostic.mjs` (binalar artık bedelli; `gold > 0` uçurumu yerine
kademeli kredi körelmesi bekleniyor) ve `budget-diagnostic.mjs` +
`mechanics-audit.mjs` (muhasebe kimliğine `defaulted` satırı eklendi).

### D1 · Determinizm — KRITIK-1

**Değişiklik:** `command.js` cephe temposunun fazı artık tümenin **mutlak
kimliği** değil, komuta listesindeki **sırası**. `units.js` bir
`resetUnitIds()` verir; `turn.js start()` her yeni dünyada sayacı 1'e çeker.

| | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| Aynı süreçte 5 dünya, aynı tohum | **5 farklı sonuç** (nüfus 7,434,714 / 7,433,162 / 7,433,320 / 7,436,245 / 7,433,331) | **1 sonuç** (7,440,624 ×5) | tek sonuç ✓ |
| Yalnız kimlik sayacını ilerletmek | 2/4 farklı nüfus | 1/4 | tek sonuç ✓ |

**Dosyalar:** `src/game/command.js`, `src/game/units.js`, `src/game/turn.js`

### D2 · Kayıt/yükleme — YÜKSEK-14, YÜKSEK-15

**Değişiklik:** Birim kimlikleri kayıttan geri yazılır ve sayaç en büyük
kimliğin üstüne kurulur; `nation.tiles` yüklemeden sonra yeniden sayılır;
tur zarının durumu (`rngState`) kayda girer (`rng.state()` / `rng.seedState()`).
Eski kayıtlarda alan yoksa davranış bugünküyle aynı kalır — sürüm yükseltmedim,
v8 kayıtları açılmaya devam eder.

| | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| Kayıt → yükle → kayıt tur farkı | **2,762 alan** | **0** | 0 ✓ |
| `nation.tiles` (ülke 1) | sayaç 61, gerçek 126 | 138 / 138 | eşit ✓ |
| Kaydetmeden vs yükleyip 100 hafta | 8 alandan **6'sı farklı** | **0** | özdeş ✓ |

**Dosyalar:** `src/game/save.js`, `src/core/rng.js`

### D3 · Tüketim bütçeye bağlandı — KRITIK-2, YÜKSEK-3, YÜKSEK-10

**Değişiklik:** `populationDemand` iki geçişli oldu. Birinci geçiş sepetin
*istenen* hâlini ve maliyetini kurar; bütçe hesaplandıktan sonra ikinci geçiş
pazara yalnız **ödeyebildiği kadarını** yazar. `needsCost` ve `canAffordNeeds`
bilerek *istenen* sepeti göstermeye devam eder (sınıf düşüşü ve memnuniyet
zincirleri "ne kadarını karşılayamıyor" sorusunu oradan okur); yeni
`needsMet` / `needsSpent` alanları fiili alımı taşır. Ulusal `needsMet`
endeksi `provinces.js`e beslenir: aç nüfus önce büyümeyi durdurur (× 0.25–1.0),
sepetinin %50'sinden azını alabilen nüfus erimeye başlar (tam açlıkta haftalık
−0.0012, yani 260 haftada ~−%27).

Alt sınıf vergisi %0 → %100, 260 hafta, savaşsız:

| ölçüm | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| geçim bütçesi | 330.1 → 0.0 | 310.4 → 0.0 | düşer ✓ |
| **fiili harcama (piyasa talebi)** | 153.7 → 160.2 (**+%4.1**) | 144.0 → 0.0 (**−%100**) | çöker ✓ |
| sepetin karşılanan oranı | (yok) | %100 → **%0** | çöker ✓ |

Bütün vergiler %0 vs %100, 260 hafta:

| ölçüm | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| nüfus | 644,107 → 639,049 (**−%0.8**) | 617,226 → 450,420 (**−%27.0**) | ağır bedel ✓ |
| istikrar | 0.58 → 0.29 | 0.58 → 0.31 | düşer ✓ |
| hazine | +30,398 | +24,093 | artar ✓ |

**İkinci geçiş — bulunabilirlik.** İlk hâlinde `needsMet` yalnız *ödeyebilme*
oranıydı; fiziksel kıtlık bu ölçüye hiç girmiyordu. Dünya tahıl üretimi tamamen
kesildiğinde hane hâlâ "karşılayabiliyor" görünüyordu, çünkü fiyat tavana
vurunca ücret endeksi de yükseliyor. `needsMet` artık iki kapıya birden bakar:
`ödeyebilme × bulunabilirlik` (geçen haftanın mal başına karşılanma oranının
sepet maliyetiyle ağırlıklı ortalaması). Talep yalnız ödeyebilmeyle kısılır —
parası olup mal bulamayan hane yine talep eder ve fiyatı yukarı iter, ama karnı
doymaz.

**Üçüncü geçiş — ağırlık taban fiyata çevrildi.** İlk uygulamada bulunabilirlik
*güncel* fiyatla ağırlıklandırılıyordu ve bu, fiyat bandı patolojisini
(YÜKSEK-16) doğrudan miras aldı: hiç üretilmeyen likör tavan fiyattan sepetin
%17'sini kaplarken, tabana çakılı tahıl %0.8'e düşüyordu. Sonuç, dünyanın
tamamının kalıcı kıtlıkta görünmesiydi — ölçüldü: dünya ortalama `needsMet`
**0.42**. Ağırlık sepetin **tasarlanmış** bileşimine (taban fiyat × miktar)
çevrildi.

| ölçüm (10 ülke, 260 hafta) | güncel fiyat ağırlığı | taban fiyat ağırlığı |
|---|---:|---:|
| ortalama `needsMet` | 0.417 | **0.941** |
| ortalama bulunabilirlik | 0.42 | **0.965** |
| dünya nüfusu | 6,383,663 | **6,876,174** |

Dünya üretimi ×0, 120 hafta, sabit izlenen ülke (nihai hâl):

| kesilen mal | sepetteki payı | nüfus farkı ÖNCE | nüfus farkı SONRA | istikrar SONRA |
|---|---:|---:|---:|---|
| tahıl (food) | ~%35 | **−%0.0** | **−%8.1** | 0.48 → 0.49 |
| konserve (groceries) | ~%28 | −%0.2 | **−%2.8** | 0.48 → 0.42 |
| kıyafet (clothes) | ~%24 | −%0.5 | **−%3.3** | 0.48 → 0.37 |

Bedel artık malın sepetteki payıyla orantılı: temel gıdayı kaybetmek en ağır
sonucu doğuruyor. Ayrıca `population.js`'teki kohort `needsFulfilled` ölçüsü de
aynı tanıma bağlandı — eskiden yalnız bütçeye bakıyordu ve tamamen boş bir
pazarda bile "%99 karşılandı" diyordu; kohort katmanı ile ekonomi katmanı artık
aynı hikâyeyi anlatıyor. Bu, **YÜKSEK-9'u da kapattı**:

| ülkenin bütün sanayisi durunca | ÖNCE | SONRA |
|---|---|---|
| GSYH | 698.1 → 36.0 (−%94.8) | 748.8 → 36.5 (−%95.1) |
| ihtiyaç karşılanması | 98.7% → **98.7%** | 94.0% → **57.0%** |

**Dosyalar:** `src/game/economy.js`, `src/game/provinces.js`, `src/game/population.js`

### D4 · Hazine tabanı ve temerrüt — YÜKSEK-12

**Değişiklik:** Borçlanma kapasitesi dolduğunda devlet **temerrüde** düşer:
kalan açık ödenmez, hazine 0'a oturur, `creditPenalty` birikir. Ceza borç
kapasitesini daraltır (× 1−ceza), faizi yükseltir (+%10'a kadar) ve ödeme
gücü geri geldikçe haftada 0.01 erir. Defter satırı `defaulted` eklendi;
muhasebe kimliği artık `Δhazine = net + borçlanılan − ödenen + temerrüt`.

| | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| Zorlanmış açık, 150 hafta | hazine **−23,350** | hazine **0**, ceza %85, faiz %20.5 | taban var ✓ |
| Dünya, 400 hafta: hazinesi < −50 | **5/15** (en kötü −2,781) | **0/15** | yok ✓ |
| Dünya, 400 hafta: kapasitesi dolu | 6/15 | 3/15 | azalır ✓ |

Uzun koşuda sistemik çöküş de kapandı (10×260 + 5×520 + 2×1040 hafta):

| ufuk | batık ülke oranı ÖNCE | SONRA | ülke başına ort. hazine ÖNCE → SONRA |
|---|---:|---:|---|
| 260 hafta | %0.0 | %0.0 | 1,152 → 682 |
| 520 hafta | %22.7 | **%0.0** | 120 → 1,176 |
| 1040 hafta | **%30.0** | **%0.0** | **−596 → +1,113** |

**Dosyalar:** `src/game/economy.js`, `scripts/mechanics-audit.mjs` (kimlik)

### D5 · Bina bedeli, iade ve 1-altınlık uçurum — YÜKSEK-13, ORTA-29, D-38

**Değişiklik:** `queueConstruction` artık `work` ve `cost`'u ayrı yazar, bedeli
peşin tahsil eder; `canQueueConstruction` parası yetmeyeni reddeder.
`cancelConstruction` **inşa edilmemiş payı** iade eder (özel sermayeli proje
kapitalistlere döner). `nation.gold > 0` ikili kapısı kaldırıldı: bina etkileri
artık temerrüt cezasıyla kademeli körelir (`upkeepFactor`).

| | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| Bina bedeli (4 tür) | hepsi **0 altın** | 100 / 70 / 80 / 100 | tabloya eşit ✓ |
| Hazinesi 0 olan devlet bina başlatabilir mi | evet | **hayır** | hayır ✓ |
| İptal iadesi (dokunulmamış proje) | 434 ödendi, **0** iade | 434 iade | tam iade ✓ |
| İptal iadesi (%50.4 ilerlemiş) | 0 | **215** (beklenen ~215) | orantılı ✓ |
| Hazine 1 → 0 arasında inşaat gücü | 125 → 5 | değişmez | uçurum yok ✓ |

**Yan etki ve onun düzeltmesi:** Bina bedeli peşin çıkınca haftalık muhasebe
kimliği tam bina bedeli kadar sapmaya başladı (en kötü **100.00**), çünkü YZ'nin
bina kararı `runConstruction` içinde — yani defter yazıldıktan *sonra* —
veriliyordu. `planConstructionAI` `runEconomy`ye taşındı; artık fabrika
alımlarıyla aynı muhasebe penceresinde. Kimlik sapması 3,900 örnekte
**0.0000**'a döndü (`scripts/budget-diagnostic.mjs`).

**Dosyalar:** `src/game/construction.js`, `src/game/economy.js`

### D6 · Teçhizat → muharebe gücü — YÜKSEK-11

| ölçüm (aynı savaş, 80 hafta) | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| saldırı gücü: stok sıfır vs stok tavanda | 160.4 vs 166.4 (**%3.6**) | 104.7 vs 155.9 (**%32.8**) | belirleyici ✓ |
| işgal edilen kare | **59 vs 52** (ikmalsiz ordu DAHA başarılı) | **39 vs 47** | ikmal kazanır ✓ |


**Değişiklik:** `battleUnitPower` artık ihtiyat stoğuna göre bir hazırlık
çarpanı uygular: `× (0.65 + 0.35 × min(1, silahStoğu / ihtiyat))`. Ölçüt
bilerek `supplyIndex` değil stok: ikmal endeksi mühimmat piyasası yapısal
olarak kıt olduğu için barışta bile ~0.25'te takılı (YÜKSEK-16) ve onu çarpan
yapmak bütün dünyanın ordusunu topluca zayıflatırdı — kırık piyasayı denge
kararı hâline getirmek olurdu.

### D7 · İşsizlik → hane geliri — YÜKSEK-8

**Değişiklik:** `nationCohorts` iki geçişli oldu; kohortun gelir payı artık
boyutu değil **etkinlik ağırlığı** (işsiz kişi çalışanın %35'i kadar sayılır),
sınıf içinde normalize edilir — böylece sınıf toplamı birebir korunur.

| | ÖNCE | SONRA | BEKLENEN |
|---|---|---|---|
| Çalışan vs işsiz işçi kohortu, kişi başı gelir farkı | **%0** (aynı) | **%42.3** | belirgin ✓ |

### D8 · İthalat iştahı koruması — D-39

`settleGlobalTrade` paydası 0.05'in altına inemez; formül −%62.5'te sonsuza,
altında negatife gidiyordu. Bugünkü UI bandı oraya girmiyor, ama koruma artık
bandın değil formülün içinde.

### D9 · Baskın strateji testi ölçütü düzeltildi — YÜKSEK-17

Bulgu turunda "sömürücü set baskın" tanısı tek bir **bileşik puana**
dayanıyordu; o puanın ağırlıkları benim tercihimdi, oyunun ölçüsü değil
(`hegemony.js:57` puanı şehir + ortak + **toprak** okur, hazineyi hiç okumaz).
Ölçüt ağırlıksız hâle getirildi: bir set, dengeli setten **bütün eksenlerde
birden** üstünse baskındır (Pareto).

D3 sonrası, 260 hafta:

| set | hazine | nüfus | sanayi | istikrar | ihtiyaç |
|---|---:|---:|---:|---:|---:|
| DENGELİ | 11,360 | 595,140 | 45 | 0.61 | 1.00 |
| SÖMÜRÜCÜ (tavan vergi + tavan tarife + sıfır sosyal/ordu) | **30,811** | **440,043** | **35** | **0.37** | **0.00** |
| REFAH DEVLETİ | 0 (borç 1,849) | 608,512 | 50 | 0.76 | 1.00 |

**Bütün eksenlerde üstün set sayısı: 0.** Sömürücü set hazineyi 2.7 katına
çıkarıyor ama nüfusun %26'sını, sanayinin dörtte birini ve ihtiyaç
karşılanmasının tamamını feda ediyor. Artık bir tercih; bedava değil.

### Düzeltilmeyenler (bilinçli kapsam kararı)

Aşağıdakiler **denge kalibrasyonu**dur, kırık bağlantı değil. Bunları bu turda
tahmine dayalı sayılarla değiştirmek, denetimin kendi kuralını çiğnemek olurdu
("rastgele yeniden dengeleme yok"). Her biri kendi ölçüm turunu hak ediyor:

| Bulgu | Neden bekliyor | Önerilen yön |
|---|---|---|
| YÜKSEK-5/6/7 hane defteri | `income` ve `needsBudget` birleştirilirse hane alım gücü ~5 kat değişir; bütün fiyat ve vergi dengesi yeniden kalibre edilmeli | tek kaynak + `savings` stoğu, kendi ölçüm turunda |
| YÜKSEK-16 fiyat bandı | RGO arzı ile tüketim talebi arasındaki yapısal uçurum; band değiştirmek semptomu gizler | zincirin orta katmanını kuran yatırım önceliği |
| ORTA-18 yönetim gideri | doğru katsayı ölçümle bulunmalı | gideri nüfusla ölçekle, iki iterasyonda kalibre et |
| ORTA-25 teçhizat kademesi | ölü sistem: ya bağlanmalı ya kaldırılmalı — ikisi de özellik kararı | kademe yükseltme akışı ya da tabloyu sil |
| ORTA-24 çift sayım | eski `food/timber/iron` havuzunun kaldırılması ayrı bir temizlik | tek kaynağa indir |
| ORTA-27 / ORTA-28 | province kadro tavanı ve `populationOf` tabanı | küçük ama davranış değiştirir |
