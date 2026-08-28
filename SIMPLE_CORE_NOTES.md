# SIMPLE_CORE_NOTES — çalışma belgesi

Deney dalı: **basit çekirdek simülasyonu**. Amaç içerik silmek değil, içeriğin
altındaki ekonomik motoru sadeleştirmek.

Taban commit: `1fee091` (*Sirketler, kuresel borsa ve AUTO devri (#6)*) —
`master` ile birebir aynı nokta. Paralel deney dalına dokunulmadı.

Bu belge iki bölümdür: **(1) mevcut çekirdeğin haritası**, **(2) yerine
konacak model ve sözleşmeler**. Uzun mimari raporu değildir; karar belgesidir.

---

## 1. MEVCUT ÇEKİRDEK

### 1.1 Nüfus

| Alan | Sınıf | Not |
| --- | --- | --- |
| `province.econ.population` | **CANONICAL** | Tek gerçek nüfus. `runProvinces` büyütür, göç taşır. |
| `nation.economy.population` | DERIVED | `provincePopulation()` toplamı (turn.js:118, economy.js:1872). |
| `economy.professionCounts` | **DUPLICATE** | 8 meslek sayacı, 1000'lik kohort kuantumlu. Nüfustan bağımsız sürüklenir, `reconcilePopulation` her hafta geri çeker. |
| `economy.classes[id].population` | DERIVED (professionCounts'tan) | `syncClassPopulations` yazar. |
| `economy.cohortPopulation` | **DUPLICATE** | professionCounts toplamı — üçüncü nüfus temsili. |
| `factory.employees` | CANONICAL | Ama hiçbir yerde *işgücüne* karşı sınırlanmaz; yalnız `factoryJobs`'a karşı. |
| `province.econ.industrialEmployees` / `industrialJobs` | DERIVED | `runFactories` her hafta sıfırlayıp yeniden yazar. |
| `province.econ.industrialCommuters` | **REPAIR_STATE** | "Banliyö düzeltmesi": kadro yerel nüfusu aşınca fazlayı diğer province'lere dağıtır ki RGO emeği iki kez sayılmasın. |

**Onarım makineleri (hepsi aynı sapmayı kovalıyor):**
`syncClassPopulations`, `alignWorkforce`, `reconcilePopulation`,
`professionCountsValid`, `automaticProfession`, `distributeClassPopulation`,
`initialProfessionCounts`, banliyö bloğu (`runFactories` içinde ~40 satır).

Kanıt: `alignWorkforce` yorumu ölçümü kendi anlatıyor —
*"1. haftada 5000 kadro / 4000 işçi, 260. haftada ulusal fark 4900"*.
Sorun onarımın kalitesi değil, onarıma **ihtiyaç duyan yapı**.

**İşgücü diye bir kavram yok.** İstihdam tavanı `min(professionCounts.workers,
lower × 0.4)`. Yani işgücü, *meslek sayacının kendisi*. Sayaç nüfustan bağımsız
sürüklenebildiği için "10.000 nüfus / 96.000 işçi" yapısal olarak mümkün.

**Büyüme** (`provinces.js:803`) zaten hedeflenen biçime yakın:
`taban × barış × istikrar × sağlık × beslenme − kıtlık`. Korunacak.

**Göç** (`runProvinceMigration`) gerçek bir karar üretiyor: sanayi kurduğun
yere insan akar. Korunur, ama kadro/boşluk hesabı işgücü sözleşmesine bağlanır.

### 1.2 İhtiyaç / tüketim

`populationDemand` (190 satır) tek fonksiyonda **iki geçişli** bir sistem:

1. sepetin istenen hali → `basket`, `basketAtBase`, `onShelf`
2. `availability` = raf doluluğu (taban fiyat ağırlıklı)
3. `netIncome` (geçen hafta) + `subsistence` (sepetin sabit reel payı) = `needsBudget`
4. `welfare` indirimi → `outOfPocket`
5. `affordability` = `1/(1+outOfPocket/(scale×2.5))` — **satisfaction için ayrı bir üçüncü ölçü**
6. `savings` çekimi → `spendable` → `affordShare`
7. ikinci geçiş: `bought = quantity × affordShare` → pazara talep
8. `needsMet = affordShare × availability`

Sınıf başına yazılan alanlar: `subsistence, savings, savingsDrawn, needsCost,
needsBudget, needsMet, needsAvailable, needsSpent, canAffordNeeds, satisfaction,
hardshipWeeks, prosperityWeeks`. Oyuncunun gördüğü: `needsMet`, `satisfaction`.

**Aç kalma zinciri yanlış kapıdan geçiyor.** `needsMet` bütün sepettir; RGO
büyümesi ve nüfus büyümesi (`provinces.js` `nourishment`) bunu okur. Yani
karşılanamayan bir **lüks** (şarap, telefon) beslenme endeksini düşürür ve
nüfusu eritebilir. Kodun kendi yorumu bunu bir kez düzeltmeye çalışmış
(ağırlık taban fiyata çekilmiş) ama kanal hâlâ tek.

### 1.3 Fabrika

`runFactories` çarpan zinciri (sırayla):
`employees/2000` → `× inputFulfillment` (küresel arz/talep) → `× reformMods.throughput`
→ `× (1 + techMods.factoryThroughput)`; girdi ayrıca `× (1 − techMods.inputEfficiency)`
ve `× (1 + tariff × importShare)`.

Ücret: `valueAdded × min(0.85, LABOR_SHARE × reformMods.wageCost)` — yani ücret
kârdan türer, kâr ücretten. Aynı tick içinde döngüsel değil ama **açıklanamaz**:
"işçi başına ne kazanıyor" sorusunun cevabı yok.

İstihdam: `runFactoryEmployment` — `schooling × willingness × MONTHLY_HIRE_RATE`
havuzu, `expectedMargin` sıralaması, `LAYOFF_RATE × (recovering ? 0.25 : 1)`,
`profitTrend` EMA. Beş ayrı katsayı, hiçbiri ekranda yok.

"Fabrikada kaç kişi çalışıyor" **dört yerde**: `factory.employees`,
`professionCounts.workers`, `province.econ.industrialEmployees`,
`population.js` kohort `employed`.

### 1.4 Piyasa

Tek küresel `world.market.goods[id]` (supply/demand/price) **artı** ulus başına
`economy.goodsFlow[id]` (production/demand/retained/domestic/imports/exports/
fulfilled/shortage/importShare/fulfilledShare) **artı** `economy.trade` özeti.

Fiyat: `price × (1 + imbalance × 0.09)`, bant `base × [0.12, 8]`.
Fiyatı etkileyen tek terim arz/talep — bu iyi.

**Ama talebin kaynağı kayıtlı değil.** `addFlow(market, id, 'demand', x)` kim
istedi bilmiyor. `tradeLedger.js` bunu ekranda göstermek için `CLASS_NEEDS`,
fabrika girdileri ve `armyWeeklyDemand`'i **yeniden hesaplıyor** (198 satır);
kalanı "Other" satırına düşüyor. Yani açıklama, simülasyonun kopyası.

Ölçülen taban çizgisi (156 hafta, tohum SIMPLE-CORE): 42 malın **23'ü** fiyat
bandının ucunda takılı, `needsMet` 0.23–0.52.

### 1.5 Ticaret

`settleGlobalTrade`: mal başına `domestic → surplus/bid → crossBorderTrade =
min(Σsurplus, Σbid)` → **iki geçişli su doldurma** (öncelikli erişim ağırlığı
kırpılınca ikinci geçiş açığı kapatıyor).

Kısıtlar: tarife iştahı (`IMPORT_ELASTICITY`), tarife ihracat erişimi
(`EXPORT_RETALIATION`), şirket önceliği (`priorityAccess`). Savaş/ilişki
ticareti **kesmiyor** (yalnız temettü donuyor).

Para: hane sepeti tarifeyi öder (populationDemand), hazine
`tariffRevenue + settlement` alır, ayrıca `procureStrategicGoods` `importCost`
adıyla üçüncü bir ithalat kalemi yazar. Üç ayrı yerde "ithalatın parası".

### 1.6 Bütçe / hazine

**`nation.gold` 20 ayrı yerde yazılıyor** (economy.js×9, construction.js×4,
turn.js×3, companies.js×4, command.js, recruitment.js). Defter (`updateLedger`)
bu hareketleri *yeniden inşa etmeye* çalışıyor: 19 kalem + 4 bilanço satırı.
Kimlik `Δhazine = net + borçlanılan − ödenen + temerrüt` bugün tutuyor, ama
tutması için her yeni harcamanın iki yere (gold ve bir `*Gold` biriktiricisine)
yazılması gerekiyor. Bir tanesi unutulursa kimlik sessizce kayar.

Vergi: `Σ sınıfGeliri × oran × taxEfficiency(0.55 + 0.45×adminFunding)`. İyi.
Sosyal: `nüfus/10000 × seviye × rate` + reform yükü. İyi.

**Eğitim → araştırma zinciri ölü sayılır.** `literacy` stoğu haftada `0.001`
oranında hedefe yaklaşıyor: yarılanma ~14 yıl. Araştırma puanı
`literacy×4 + middleShare×1.5 + clerks + 1`. Yani %10 ile %90 eğitim arasındaki
fark bir insan ömrü sonra görünür hale geliyor — oyuncu bağlantıyı kuramıyor.
Üstüne `higherEducationBonus`, `programmeFloorOf`, `refreshDiffusion`,
`literacyReach` aynı kararı besliyor.

### 1.7 Faz sırası (bugün)

```
turn.endTurn
  runProvinces        büyüme, gelişme, göç, kontrol
  beginEconomy        techMods, reformMods, literacy, strain
  runNationEconomy    (ulus başına)
      commitCompletedProjects → resetNationGoodsFlow → updateClasses
      rawProduction → runFactories → runFactoryEmployment (4 haftada bir)
      askeri tedarik → populationDemand → çimento/ordu talebi
      runCompanies → fiscalBalance → runPopulationMobility
      runPrivateSector → runEconomicAI → planConstructionAI
  finishEconomy
      procureStrategicGoods → refreshPriorityAccess → settleGlobalTrade
      runInvestmentAI → updateLedger (settleDebt içeride) → updatePrices
```

Gizli sıra bağımlılıkları: `populationDemand` **geçen haftanın** gelirini,
`importShare`'ini ve `fulfilledShare`'ini okur; `runFactories` **geçen
haftanın** `inputAvailability`'sini okur. Bu bilinçli ve doğru — korunacak.

---

## 2. YERİNE KONAN MODEL

### 2.1 Tek gerçek

| Kavram | Tek gerçek | Türetilen |
| --- | --- | --- |
| Nüfus | `province.econ.population` | `economy.population` |
| Sınıf | `economy.classShares {lower,middle,upper}` (3 sayı) | `classes[id].population = population × share` |
| İşgücü | — | `economy.workforce = population × 0.45` |
| İstihdam | `factory.employees` (+ RGO doluluğu) | `economy.employed`, `unemployed` |
| Meslek | — | `professionCounts` gerçek istihdamdan türetilir |
| Para | `nation.gold` | defter = `economy.book` kategorileri |

`professionCounts`, `cohortPopulation`, `savings`, `subsistence`,
`needsAvailable`, `needsSpent`, `hardshipWeeks`, `prosperityWeeks`,
`industrialCommuters`, `capitalWithheld` kaldırıldı.

### 2.2 Sözleşmeler (modüller arası)

```
econ/pop.js       → population, workforce, employed, unemployment,
                    classShares, classes[].{population,income,taxPaid,satisfaction,needsMet},
                    needsMet, foodMet, standardOfLiving, stability
econ/market.js    → market.goods[id].{production,demand,imports,exports,available,price},
                    demandBy{households,industry,army,construction,state},
                    supplyBy{rgo,factory,workshop}
econ/trade.js     → flow.{domestic,imports,exports,shortage,importShare},
                    trade.{importValue,exportValue,balance,tariffRevenue}
econ/industry.js  → factory.{employees,throughput,revenue,inputCost,wages,profit},
                    economy.{wagesPaid,factoryProfit,industrialOutput}
econ/budget.js    → payGold/earnGold (nation.gold'un TEK yazarı),
                    economy.book (kategori → tutar), ledger, treasury close
```

### 2.3 Formüller (hepsi tek satırda açıklanabilir)

**İşgücü** `workforce = population × 0.45`
**İstihdam** `unemployed = workforce − (fabrika kadrosu + RGO kadrosu)`

**Talep** `demand[g] = Σ_sınıf (classPop/10000) × need[g] × affordShare`
**Karşılanabilirlik** `affordShare = clamp(income / basketCost, 0, 1)`
**Beslenme** `foodMet = alınan gıda / istenen gıda` — **yalnız gıda malları**
**Memnuniyet** `0.35 + 0.5×needsMet − 0.28×vergi + 0.14×refah + reform − işsizlik×0.22`

**Fiyat** `price × (1 + 0.09 × (talep − mevcut)/(talep + mevcut))`, bant `×[0.12, 8]`
**Mevcut** `available = üretim + ithalat − ihracat`

**Ücret** `wages = employees × wageRate`, `wageRate = 1.1 × altSınıfKişiBaşıSepet`
**Kâr** `revenue − inputCost − wages`

**Vergi** `Σ sınıfGeliri × oran × yönetimVerimi`
**Gümrük** `ithalatDeğeri × tarife`
**Hazine** `Δgold = Σ gelir kategorileri − Σ gider kategorileri` (tek kapanış)

**Okuryazarlık** hedefe haftada `0.006` yaklaşır (yarılanma ~2.2 yıl)
**Araştırma** `(2 + 8×okuryazarlık + 4×ortaSınıfPayı) × (1 + techBonus)`

### 2.4 Faz sırası (yeni, açıkça basılabilir)

```
1  Nüfus anlık görüntüsü   population, classShares, workforce
2  İşgücü tahsisi          RGO + fabrika kadrosu (işgücü tavanı)
3  Üretim                  RGO + fabrika çıktısı → market.supply
4  Tüketim talebi          hane + sanayi + ordu + inşaat + devlet → market.demand
5  Ticaret                 fazla/açık eşleşmesi, gümrük
6  Fiyat                   arz/talep
7  Fabrika kapanışı        gelir − girdi − ücret = kâr
8  Bütçe                   vergi, harcama, tek hazine kapanışı
9  Nüfus büyümesi          gıdaya bağlı
10 Defter kapanışı         kategori toplamı = Δhazine
```

Tick içi geri besleme yok: 4. adım 6. adımın **geçen haftaki** fiyatını okur,
3. adım geçen haftanın girdi bolluğunu okur. Yakınsama çözücüsü yok.

### 2.5 Korunan içerik

42 mal, 30 fabrika tipi ve tarifleri, bütün RGO tipleri, bütün teknolojiler ve
araştırma içeriği, bütün reformlar ve hükümet biçimleri, diplomasi, savaş,
generaller/cepheler, şirketler ve borsa, ülke sayısı, dünya üretimi, görsel
kimlik. Hiçbiri bu dalda azaltılmadı.
