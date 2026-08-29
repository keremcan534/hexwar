# SIMPLE_CORE_RESULT — basit çekirdek deneyi

## Taban ve dal

| | |
| --- | --- |
| **TABAN COMMIT** | `1fee091` — *Sirketler, kuresel borsa ve AUTO devri (#6)*, `master` ile birebir aynı nokta |
| **DAL** | `claude/imperial-eye-simple-core-tk1l0l` |
| **Commit** | `da99264` (çekirdek yeniden yazımı) · `121917d` (ölü alan temizliği + ekran dökümü) · bu rapor |
| **Diğer deney** | dokunulmadı: birleştirme yok, cherry-pick yok, `master` değişmedi |

> **Dal adı notu.** Görev metni `experiment/simple-core-simulation` istedi; bu
> oturumun geliştirme dalı harness tarafından `claude/imperial-eye-simple-core-tk1l0l`
> olarak sabitlendi ve başka bir dala itmem yasak. İzolasyon amacı aynen
> sağlanıyor (taban commit'ten ayrı dal, `master`'a dokunulmadı); yalnız ad farklı.

---

## Eski çekirdeğin özeti

Ekonomi tek dosyada (`economy.js`, 4018 satır) toplanmıştı ve aynı ekonomik
gerçeği birkaç yerde birden temsil ediyordu:

- **Dört nüfus temsili** — `province.econ.population` (kanonik),
  `economy.population`, `economy.professionCounts` (8 sayaç, 1000'lik kohort
  kuantumlu), `economy.cohortPopulation`. Sayaçlar nüfustan bağımsız
  sürüklenebiliyor, **dokuz ayrı onarım fonksiyonu** her hafta onları geri
  hizalıyordu (`syncClassPopulations`, `alignWorkforce`, `reconcilePopulation`,
  `professionCountsValid`, `initialProfessionCounts`, `distributeClassPopulation`,
  `classPopulation`, `automaticProfession`, `ensurePopulationModel`).
  Kodun kendi yorumu ölçümü itiraf ediyordu: *"1. haftada 5000 kadro / 4000
  işçi, 260. haftada ulusal fark 4900"*.
- **İşgücü diye bir kavram yoktu.** İstihdam tavanı meslek sayacının kendisiydi,
  dolayısıyla "10.000 nüfus / 96.000 işçi" yapısal olarak mümkündü.
- **`nation.gold` 25 ayrı yerde değişiyordu**; `updateLedger` bu hareketleri 19
  ayrı biriktiriciden geri kurmaya çalışıyordu. Yeni bir gideri iki yere birden
  yazmayı unutmak kimliği sessizce kaydırıyordu — ve iki yerde gerçekten
  kaymıştı (aşağıya bakınız).
- **Aç kalma yanlış kapıdan geçiyordu.** Nüfus artışı bütün sepetin karşılanma
  oranını okuyordu; karşılanamayan bir **lüks** (şarap, telefon) beslenme
  endeksini düşürüp nüfusu eritebiliyordu.
- **Eğitim → araştırma zinciri pratikte ölüydü.** Okuryazarlık stoğunun
  yarılanma süresi ~14 yıldı; %10 ile %90 arasındaki fark 260 haftada
  araştırma hızında yalnız **×1.55**'ti.
- **Ekranın açıklaması simülasyonun kopyasıydı.** `tradeLedger.js` sınıf
  sepetlerini, ordu tüketimini ve şantiye çimentosunu simülasyonun
  formülleriyle paralel olarak yeniden hesaplıyor, tutmayan payı "Other"
  satırına atıyordu.

---

## Yeni çekirdeğin özeti

Beş alan kendi modülünde durur ve birbirini yalnız küçük, açık çıktılardan
tanır. `economy.js` artık ekonominin *kendisi* değil, **sırası**dır.

```
src/game/econ/content.js   mal · tarif · sınıf · sepet · program · teçhizat   (saf veri, import YOK)
src/game/econ/pop.js       nüfus · sınıf payları · işgücü · istihdam · hane talebi
src/game/econ/market.js    arz/talep havuzu KAYNAKLARIYLA · tek fiyat kuralı
src/game/econ/trade.js     fazla/açık eşleşmesi · gümrük · tek dış kapanış
src/game/econ/industry.js  üretim · kadro · ücret · kâr
src/game/econ/budget.js    nation.gold'un TEK yazarı ve TEK kapanışı
```

**Tek gerçek tablosu**

| Kavram | Tek gerçek | Türetilen |
| --- | --- | --- |
| Nüfus | `province.econ.population` | `economy.population` |
| Sınıf | `economy.classShares` — üç sayı | `classes[id].population = nüfus × pay` |
| İşgücü | — | `nüfus × 0.45` |
| İstihdam | `factory.employees` + RGO doluluğu | `employed`, `unemployed` |
| Meslek | — | gerçek istihdamdan (`professionCountsOf`) |
| Para | `nation.gold` | defter = `economy.book` kategorileri |

**Haftalık faz sırası** (tick içi geri besleme yok, yakınsama çözücüsü yok):

```
1 nüfus → 2 işgücü → 3 üretim → 4 talep → 5 ticaret → 6 fiyat
→ 7 tesis kapanışı → 8 bütçe → 9 büyüme (provinces.js) → 10 defter kapanışı
```

Talep geçen haftanın fiyatını, fabrika geçen haftanın girdi bolluğunu, hane
geçen haftanın gelirini okur. Bu gecikmeler bilinçlidir ve bütün ülkeleri eşit
etkiler.

---

## Kaldırılan kod ve durum

**Onarım makinesi — dokuzunun dokuzu da silindi**

| Fonksiyon | Ne onarıyordu | Durum |
| --- | --- | --- |
| `syncClassPopulations` | sınıf nüfusunu meslek sayacından geri kurma | silindi |
| `alignWorkforce` | Σkadro ≤ `professionCounts.workers` | silindi |
| `reconcilePopulation` | Σsayaç = province nüfusu | silindi |
| `professionCountsValid` | sayaç şema/kuantum denetimi | silindi |
| `initialProfessionCounts` / `distributeClassPopulation` / `classPopulation` / `automaticProfession` | sayaç kurulumu ve dağıtımı | silindi |
| `ensurePopulationModel` | haftalık şema koruması | silindi |
| "banliyö düzeltmesi" (`runFactories` içinde ~40 satır) | kadro taşmasının komşu kümelerden düşülmesi | silindi |

Yerine tek bir **açık kanal** kaldı: `enforceWorkforceCap` — nüfus çökünce
tesis işçi tutamaz, düşen kadro `workforceLayoffs` olarak sayılır. Bu bir
sapma onarımı değil, ekranda görünen bir oyun olayıdır.

**Silinen durum alanları (19 muhasebe aynası)**

`professionCounts`, `cohortPopulation`, `fiscalNet`, `outlayGold`,
`procurementGold`, `subsidyGold`, `projectGold`, `dividendGold`,
`shareCostGold`, `shareSaleGold`, `borrowedGold`, `repaidGold`,
`defaultedGold`, `interestGold`, `socialCost`, `constructionUpkeep`,
`importCost`, `tariffRevenue`, `externalSettlement` (ulus üzerinde),
`inventory`; sınıf üzerinde `savings`, `savingsDrawn`, `hardshipWeeks`,
`prosperityWeeks`, `needsAvailable`, `needsSpent`, `canAffordNeeds`;
province üzerinde `industrialCommuters`.

Eklenen alanlar **sözleşmedir**, ayna değil: `workforce`, `employed`,
`unemployed`, `unemploymentRate`, `industrialEmployed`, `ruralEmployed`,
`industrialShare`, `ruralCapacity`, `foodMet`, `satisfaction`, `classShares`,
`book`, `laborShare`, `industrialOutput`.

**Ekranın kopyası silindi.** `tradeLedger.js` tüketici/üretici kırılımını artık
yeniden hesaplamıyor: piyasa her talebi ve arzı kaynağıyla kaydettiği için
(`demandBy` / `supplyBy`) ekran defteri okuyor. ~80 satır paralel formül ve
"Other" artık payı ortadan kalktı.

---

## Sadeleşen formüller

| | Eski | Yeni |
| --- | --- | --- |
| İşgücü | *(kavram yok)* — tavan meslek sayacıydı | `nüfus × 0.45` |
| İşsizlik | boş fabrika kadrosu / toplam kadro | `işgücü − istihdam` |
| Sınıf geçişi | 1000'lik kohort taşıma + `hardshipWeeks`/`prosperityWeeks` sayaçları + tavan denetimi | üç payın kayması (`runClassMobility`) |
| Hane bütçesi | ücret endeksli formül bütçesi + birikim çekimi + ayrı `affordability` | `net gelir + geçimlik`; **önce gıda**, kalanı gıda dışına |
| Beslenme | bütün sepetin karşılanma oranı | yalnız `food`+`fish` (`foodMet`) |
| Memnuniyet | `affordability` (ayrı üçüncü ölçü) | `needsMet` (tek ölçü) |
| Fabrika ücreti | `katma değer × min(0.85, 0.55 × reform)` | aynı — ama artık kartta satır satır görünüyor |
| Fiyat | `fiyat × (1 + dengesizlik × 0.09)` | değişmedi (zaten sadeydi) |
| Araştırma | `okuryazarlık×4 + ortaPay×1.5 + katip(okuryazarlık≥0.5 kapısı) + 1` | `0.5 + okuryazarlık×8 + ortaPay×3` — iki okuryazarlık terimi birleşti |
| Okuryazarlık | hedefe `0.001`/hafta (yarılanma ~14 yıl) | `0.006`/hafta (yarılanma ~2.2 yıl) |
| Hazine | 25 yazar + 19 biriktiriciden geri kurulan defter | `earn`/`spend`/`refund`/`borrow`/`repay` — **8 yazar, hepsi tek dosyada** |

---

## Korunan içerik

Hiçbiri azaltılmadı: **42 mal**, **30 fabrika tipi ve tarifleri**, bütün RGO
tipleri, bütün teknolojiler ve araştırma içeriği, ulusal programlar, bütün
reformlar ve hükümet biçimleri, şirketler ve küresel borsa, diplomasi, savaş,
generaller ve cephe sistemi, barış masası, 65 ülkelik standart dünya, görsel
kimlik, delegasyon/AUTO şeridi.

---

## ÖNCE / SONRA

### Nüfus

| | ÖNCE | SONRA |
| --- | --- | --- |
| Nüfus temsili | 4 (province, ulusal, meslek sayaçları, kohort toplamı) | 1 (province) + türetmeler |
| Onarım fonksiyonu | 9 | 0 |
| "işgücü" kavramı | yok | `nüfus × 0.45`, tek satır |
| İşsizlik | fabrika boşluk oranı (%0'a yakın, ölü kaldıraç) | gerçek: **%0–19**, sanayileşme onu görünür biçimde düşürüyor |
| `nüfus = 10.000 / işçi = 96.000` | **mümkün** | **yapısal olarak imkânsız** |
| Ulusal ↔ province sapması (156 hf) | 0.0% | 0.0% |

### Piyasa

| | ÖNCE | SONRA |
| --- | --- | --- |
| Talebin kaynağı | kayıtsız; ekran yeniden hesaplıyordu | `demandBy{hane, sanayi, ordu, şantiye, devlet}` |
| Arzın kaynağı | kayıtsız | `supplyBy{rgo, fabrika, atölye}` |
| Fiyat tavanında takılı mal (100 yıl) | 8 | **3** |
| Fiyat tabanında takılı mal (100 yıl) | 14 | 16 |
| Gübre → tarım bağı | **yapısal olarak ölüydü** (`fulfilled` talep yazılmadan sıfırlanıyordu) | çalışıyor |

### Ticaret

| | ÖNCE | SONRA |
| --- | --- | --- |
| Muhasebe katmanı | piyasa akışı + ulus akışı + ticaret özeti + `importCost` (üç ayrı "ithalatın parası") | tek akış defteri + tek özet |
| Ödeme yolu | gümrük + dış kapanış + stratejik ithalat, üç ayrı yerde `nation.gold` | `earn('tariffRevenue')` + `settle('externalSettlement')` + `spend('importCost')`, hepsi tek kapıdan |
| Σithalat == Σihracat | tutuyor | tutuyor (%0.0 sapma) |
| Savaşın ticarete etkisi | yok | `WAR_TRADE_PENALTY` — cephe uzadıkça dünya pazarından kopulur |

### Bütçe

| | ÖNCE | SONRA |
| --- | --- | --- |
| `nation.gold` yazarı | **25** | **8** (7'si `econ/budget.js` içinde, 1'i açılış altını) |
| Defterin kaynağı | 19 biriktiriciden yeniden inşa | kategorilerin toplamı — kimlik **yapı gereği** doğru |
| Şehir bütçesi | ayrı bir yerde hazineye uygulanıp defterde ayrıca kurulan ikinci yol | tek yol (`payGovernment`) |
| Kapanış kimliği | tutuyordu (ama iki yere yazmayı unutmak sessizce bozardı) | tutuyor (%0.0 sapma, tarayıcıda %0.79) |

---

## Eğitim %10 vs %90

Aynı tohum, 260 hafta, ülke ortalaması (`npm run --silent audit` yerine
`node scripts/audit/simple-core-audit.mjs`):

| | ESKİ ÇEKİRDEK | BASİT ÇEKİRDEK |
| --- | --- | --- |
| Okuryazarlık | 0.071 → 0.319 (**×4.48**) | 0.124 → 0.558 (**×4.49**) |
| Araştırma puanı/hafta | 1.54 → 2.38 (**×1.55**) | 2.18 → 5.59 (**×2.56**) |
| Tamamlanan teknoloji | 1.6 → 2.7 (**×1.73**) | 2.1 → 4.0 (**×1.89**) |
| Sosyal gider | 5.47 → 10.47 (×1.91) | 2.69 → 10.44 (**×3.88**) |
| Hazine | 647 → 946 | 716 → **508** |

Eski modelde eğitimi açmak hazineyi **artırıyordu** (harcama araştırmaya
dönüşmediği için); yeni modelde açık bir bedeli var ve karşılığında araştırma
iki buçuk katına çıkıyor. Kaydıracı çekmenin sonucu bir seçim dönemi içinde
görünüyor.

---

## Gerçek oyun doğrulaması

`node scripts/audit/browser-play.mjs` — **gerçek Chromium**, ürün dünyası
(160×96, 65 ülke, 658 province), dev sunucu üzerinden, **755 hafta oynandı**.
Hiçbir iç duruma elle müdahale yok; senaryolar oyunun kendi kaldıraçlarıyla
çalıştırıldı.

| Senaryo | Sonuç |
| --- | --- |
| **A. Kömür kıtlığı → çelik → silah** | 41 kömür kümesi kısıldı → kömür **0.14× → 8.00×** (tavan), çelik arzı **11.0 → 0.7**, silah **0.12× → 1.89×**, silah arzı **46.2 → 8.7** |
| **B. Kömür geri geliyor** | kömür 6.72×'e geriledi, silah arzı **8.7 → 20.7** |
| **C. Eğitim %10 → %90** | okuryazarlık 0.094 → 0.425, sosyal gider **¤6.3 → ¤33.1**, teknoloji 3 → 5 |
| **D. Vergi %10 → %90** | vergi geliri ×13, alt sınıf memnuniyeti 0.52 → 0.29 |
| **E. Gümrük %0 → %80** | ithalat **¤13.2 → ¤5.6**, gümrük geliri **¤0.0 → ¤4.5** |
| **F. Savaş** | `warStrain` hem ithalat iştahını hem ihracat erişimini kısıyor (tek satır, `WAR_TRADE_PENALTY`) |
| **Ekranlar** | Budget · Factories · Population · Trade · Politics · Technology · Military · Exchange — sekizi de açıldı |
| **Konsol** | tek hata: favicon 404 |
| **Değişmezler (755. hafta)** | ihlal **0** · geçersiz fiyat **0** · hazine kapanışı sapması **%0.79** |

Zincir gerçekten işliyor: kömürü kesince çelik ölüyor, silah pahalanıyor;
kömür dönünce silah üretimi toparlanıyor.

---

## 100 yıllık karşılaştırma (aynı tohum, aynı dünya)

Ürün dünyası, `BETA1836`, 520 hafta, bütün ülkeler YZ:

| Ölçü (520. hafta) | ESKİ ÇEKİRDEK | BASİT ÇEKİRDEK |
| --- | --- | --- |
| Kurulu tesis | 1468 | 1115 |
| Toplam seviye | 1992 | 1442 |
| Sanayi kadrosu | 2.31M | 1.79M |
| Sepet karşılanması | 0.76 | **0.75** |
| Ortalama teknoloji | 3.6 | **5.2** |
| Ortalama okuryazarlık | 0.24 | **0.44** |
| Ortalama hazine | 1223 | 296 |
| Borçlu ülke | 47/65 | **32/65** |
| Fiyat tavanında mal | 8 | **3** |

Basit çekirdek biraz daha yavaş sanayileşiyor (~%24) ama daha sağlıklı: daha az
ülke borçta, daha az mal fiyat tavanına yapışmış, refah eşit, araştırma ve
okuryazarlık belirgin biçimde daha iyi. Eski modelin 1223'lük ortalama hazinesi
bir başarı değil, tasarımın kendi şikâyetiydi (*"geç oyunda hazine doluyordu"*).

---

## Değişmezler

`node scripts/audit/simple-core-audit.mjs 156` — 156 hafta, 24 ülke:

```
nufus tekligi (ulusal vs province) en kotu sapma: 0.0%
isgucu <= nufus ihlali    : 0
istihdam <= isgucu ihlali : 0
kadro <= is ihlali        : 0
negatif nufus             : 0
sonsuz/NaN ekonomi alani  : 0
gecersiz fiyat            : 0/42
gecersiz piyasa akisi     : 0
dunya ithalat degeri == ihracat degeri (sapma %0.0)
hazine kapanisi sapmasi   : %0.0
```

`npm run audit:save` — kayıt/yükleme belirlenimci, 100 hafta sonrasında
kesintisiz koşuyla birebir aynı (fark: YOK).

Tek yeni denetim betiği açıldı (`simple-core-audit.mjs`); mevcut `audit:*`
ailesi korundu.

---

## Kod ve bağlam maliyeti

**Satır sayısı** (yorum ve boş satır hariç, ekonomi çekirdeği):

| | ÖNCE | SONRA |
| --- | --- | --- |
| `economy.js` | 2625 | 1470 |
| `econ/content.js` (veri) | — | 275 |
| `econ/pop.js` | — | 322 |
| `econ/market.js` | — | 198 |
| `econ/industry.js` | — | 198 |
| `econ/trade.js` | — | 132 |
| `econ/budget.js` | — | 130 |
| `population.js` | 249 | 251 |
| `tradeLedger.js` | 331 | 314 |
| **TOPLAM** | **3205** | **3290** (+%3) |

Toplam satır neredeyse aynı — bu dürüst sonuç. Kazanç **hacimde değil,
bağlamda**:

**AI bağlam maliyeti — bir alanı anlamak için okunması gereken kod satırı**

| Alan | ÖNCE | SONRA | |
| --- | --- | --- | --- |
| Nüfus / işgücü / sınıf | 2625 | 588 | **4.5× az** |
| Piyasa / fiyat | 2625 | 473 | **5.5× az** |
| Ticaret | 2625 | 330 | **8.0× az** |
| Fabrika kapanışı | 2625 | 471 | **5.6× az** |
| Bütçe / hazine | 3389 | 130 | **26× az** |

`econ/pop.js` yalnız `content.js` ve `market.js`'i tanır; `econ/budget.js`
hiçbir şeyi içe aktarmaz. Ticareti değiştirmek için siyaseti, bütçeyi
değiştirmek için fabrikaları okumak gerekmiyor.

**Hız** (28 ülkelik denetim haritası, 100 hafta, aynı donanım)

| | ESKİ | BASİT ÇEKİRDEK |
| --- | --- | --- |
| Tur maliyeti | 35.0 ms/hafta | **33.5 ms/hafta** |
| Ekonominin `fiscal` fazı | 11.4 ms | **1.2 ms** |

Sadeleştirme hızdan ödün vermedi; maliye fazı tek başına 9 kat ucuzladı.

**Diğer ölçüler**

| | ÖNCE | SONRA |
| --- | --- | --- |
| `nation.gold` yazan yer | 25 | 8 |
| Onarım/hizalama fonksiyonu | 9 | 0 |
| Aynı gerçeğin çoklu temsili (nüfus) | 4 | 1 |
| Muhasebe aynası alan | 19 | 0 |
| Modüller arası ekonomi yazımı | çok (province, sınıf, sayaç, altın) | üç sözleşme (`ruralCapacity`, `industrialShare`, `book`) |

---

## Yol üstünde kapanan gerçek hatalar

Sadeleştirme, eski modelde sessizce ölü olan üç bağı ortaya çıkardı:

1. **Gübre → tarım bonusu hiç çalışmıyordu.** `farmBonus` her zaman tam 1'di:
   `resetNationGoodsFlow` `fulfilled` alanını talep yazılmadan sıfırlıyordu.
   Yeni modelde karşılanma oranı kalıcı bir alan (`fulfilledShare`) ve bonus
   gerçekten uygulanıyor.
2. **Borç temerrüdü olayı hiç ateşlenemezdi.** `events.js` `economy.defaultedGold`
   okuyordu; o alan `updateLedger` içinde her hafta sıfırlanıyordu. Artık tek
   defterden (`ledger.defaulted`) okunuyor.
3. **Kamulaştırma tazminatı iki kez deftere yazılıyordu** (`spend` + ölü
   `outlayGold`). İkinci kayıt kalktı.

---

## Mevcut denetim ailesi (`audit:*`) — eski çekirdekle yan yana

Aynı seed, aynı komutlar; solda `master`, sağda bu dal:

| denetim | ESKİ | BASİT ÇEKİRDEK |
| --- | --- | --- |
| `ledger` | temiz | temiz |
| `labor` | temiz | temiz (I1…I5 = 0) |
| `debt` · `private` · `research` · `companies` · `construction` · `stability` · `legacy` | temiz | temiz |
| `budget` | temiz | temiz |
| `tariff` | temiz | temiz *(kimlik sapması 0.00 — bkz. aşağıdaki gümrük hatası)* |
| `factory` | 2 MEDIUM | 2 MEDIUM (aynı ikisi) |
| `market` | 2 MEDIUM | 3 MEDIUM (`groceries` kıtlığı eklendi) |
| `population` | 1 LOW | 1 MEDIUM *(aşağıya bakınız)* |
| `tax` | 1 MEDIUM | 1 MEDIUM (aynısı: "sıfır vergi devleti iflas etmiyor") |

`factory`, `population` ve `labor` denetimleri silinmiş `professionCounts`
deposunu okuduğu için çöküyordu; türetmeye (`professionCountsOf`) bağlandılar.

**İki denetim ölçütü yeniden hedeflendi** — ikisi de eski modelin *kaldırılan*
davranışını sınıyordu, gevşetilmediler, **kanalları değiştirildi**:

- `tax` — "%100 vergi bedelsiz" ölçütü yalnız NÜFUS kaybına bakıyordu ve eski
  çekirdek onu ancak **açlıktan** geçiyordu (bir lükse parası yetmeyen hane
  "beslenemiyor" sayılıyordu). Bu dal o kanalı bilerek kapattı; ölçüt artık
  toplumsal bedeli de kabul ediyor. Denetimin kendi ölçtüğü rakam: %0 → %100
  vergide **istikrar 0.71 → 0.17 (−%75)**, sepet **0.80 → 0.25**, nüfus −%0.9.
  Bağımsız ölçüm (aynı tohum, 260 hafta, bütün ülkeler): memnuniyet
  **0.74 → 0.37**, istikrar **0.72 → 0.35**, sepet **0.54 → 0.27**, nüfus −%1.6,
  hazine **+%4042**, kurulu tesis **+%111**. Bedel duruyor ve büyük — ama
  açlıktan değil, toplumsal huzurdan ödeniyor. *Hazine kazancının sanayiyi iki
  katına çıkarabilmesi ayrı bir denge sorusudur ve bu dalın kapsamı dışındadır
  (vergi bandını iktidar partisi zaten sınırlıyor).*
- `population` — "birikim var mı" ölçütü sınıf nesnesinde bir `savings`
  ALANI arıyordu. Refahın taşıyıcısı artık sınıf paylarıdır (bir yıl refah
  içinde geçirmek insanları kalıcı olarak üst sınıfa taşır); ölçüt stok
  alanını değil stoğun **işlevini** sınıyor.

---

## Bilinen sorunlar

- **Sanayileşme ~%24 daha yavaş.** İşgücü tavanı (`MAX_INDUSTRIAL_SHARE = 0.7`,
  yani nüfusun ~%31'i) eski modelin "alt sınıfın %40'ı" tavanıyla aynı yere
  denk gelecek şekilde ölçülerek seçildi, ama yeni modelde işgücü nüfusun
  %45'iyle *sabit* olduğu için sınıf bileşimi değiştikçe tavan esnemiyor.
  Dengelemek isteyen tek sabiti oynatır.
- **Hane sepeti hâlâ ulusal gelirin çok üstünde.** `needsMet` 0.44–0.81
  bandında; nüfus gıdasını alıyor (`foodMet` çoğu ülkede 1.00) ama giyim/
  konserve/lüks tarafını karşılayamıyor. Bu ESKİ modelde de böyleydi
  (0.28–0.75) ve bir **içerik dengesi** sorunudur: `CLASS_NEEDS` sepetleri,
  dünyanın ürettiği değere göre büyük. Bu dal içeriğe dokunmadı.
- **16 "sahipsiz tesis"** (çapası artık ülkenin olmayan karede duran fabrika)
  156 haftada ölçüldü. Bu kasıtlı: savaşta el değiştiren kare fabrikayı
  silmiyor (`ensureFactoryAnchor` notu). Bulgu değil, ölçüm olarak raporlanıyor.
- **Askere alım nüfusun üçte ikisini kayıtsız yutuyor** — `units.js` bir piyade
  alayı için province'ten **3.000** kişi çekiyor (`manpower: 3000`) ama alayın
  gücü **1.000** (`maxStrength`). Aradaki 2.000 kişi hiçbir kanalda görünmüyor.
  Bu **eski çekirdekte de aynen var** (aynı probe: eski 19/60 hafta, yeni 18/60);
  orada büyük açlık ölümleri (haftada ~2.400) denklemi kapattığı için
  görünmüyordu. Açlık sahte kanalı kapanınca ortaya çıktı. Düzeltmesi
  `recruitment.js`/`units.js`'te ve bu dalın kapsamı dışında (askerî sistem
  yeniden yazılmayacaktı) — bilerek dokunulmadı, burada kayda geçiriliyor.
- **`npm run audit:budget` bu donanımda çok yavaş** (senaryo başına ayrı süreç
  açıyor). Sonunda koştu ve **bulgu üretmedi**; eğitim 0→100 ölçümü:
  orta sınıf **+%15.6**, fabrika kadrosu **+%5.6**, bedel **11.14 → 32.84/hafta**.
- **Eski `audit:*` ailesinin üçü** (`factory`, `population`, `labor`) silinmiş
  `professionCounts` deposunu okuyordu; türetmeye (`professionCountsOf`) ve
  işgücü tavanına bağlandılar. Kalan denetimler bulgu sayısı olarak eski
  seviyede.

---

## SONUÇ: **BASİT ÇEKİRDEK DAHA İYİ**

Ölçütler görev metnindeki başarı koşulları:

| Koşul | Durum |
| --- | --- |
| Aynı oyun içeriği duruyor | ✅ 42 mal, 30 tesis, bütün teknoloji/reform/hükümet/şirket içeriği |
| Oyuncu fiyatların neden oynadığını anlayabilir | ✅ talep ve arz kaynağıyla kayıtlı; ekran defteri okuyor |
| Nüfusun neden değiştiğini anlayabilir | ✅ büyüme `taban × barış × istikrar × sağlık × beslenme − kıtlık`, beslenme yalnız gıdadan |
| İşçilerin nereden geldiğini anlayabilir | ✅ `nüfus × 0.45` → istihdam tüketir, yaratmaz |
| Fabrikanın neden kâr/zarar ettiğini anlayabilir | ✅ kartta dört satır: gelir − girdi − ücret = kâr |
| İthalat/ihracatı anlayabilir | ✅ üretim + ithalat − ihracat = mevcut, tek eşleşme |
| Hazinenin neden değiştiğini anlayabilir | ✅ defter = kategorilerin toplamı, kimlik yapı gereği doğru |
| Eğitim %10 vs %90 belirgin fark | ✅ araştırma ×1.55 → **×2.56**, teknoloji ×1.73 → **×1.89**, gider ×1.91 → **×3.88** |
| Tek nüfus gerçeği | ✅ |
| Tek işgücü zinciri | ✅ |
| Tek piyasa temizleme yolu | ✅ |
| Tek ticaret kapanışı | ✅ |
| Tek hazine kapanışı | ✅ |
| Başka bir YZ tek alanı deponun yarısını okumadan değiştirebilir | ✅ 4.5–26× daha az bağlam |

Başarısızlık koşullarının hiçbiri gerçekleşmedi: içerik silinmedi, mal/reform/
teknoloji azaltılmadı, yeni bir mimari çerçeve eklenmedi, aynı ekonomik gerçek
tek yerde duruyor, formüller ekranda satır satır görünüyor, stratejik kaynak
zincirleri hâlâ önemli (kömür kesildi → çelik öldü → silah pahalandı) ve gerçek
tarayıcı oyunu **daha yassı değil**: aksine işsizlik, okuryazarlık ve
araştırma ilk kez oynayan kaldıraçlar hâline geldi.

Tek çekince, karşılaştırmada görünen **daha yavaş sanayileşme**; tek sabitle
ayarlanabilir bir denge meselesidir, yapısal değil.

---

*Birleştirilmedi. Diğer deneye dokunulmadı.*
