# CORE STABILIZATION LOG

Amac: ekrandaki sayilara GUVENILEBILIR olsun. Muhasebe once, denge sonra.

## FAZ 0 — Taban cizgisi (83d88f6, calisma agaci temiz)

Tam takim (`audit:all`, bu commit uzerinde, ayni gun): **0 KRITIK · 7 YUKSEK ·
16 ORTA · 5 DUSUK**. Ilgili YUKSEK'lerin taban kaniti:

| bulgu | olcum (taban) | denetimin kok-neden ipucu |
|---|---|---|
| Isci cift sayimi (factory) | ulusal fabrika kadrosu > `workers` sayaci: **8,690 kisi**; en kotu province 53:41 → kadro 12,797 vs nufus 8,989 | "kadro ULUSAL havuzdan dagitilir ama `province.industrialEmployees` yerel nufusa karsi dogrulanmaz; `rgoLaborScale` bunu kirsal nufustan dusuyor, **negatif olabilir**" |
| Kohort muhasebesi (population) | en kotu sapma **5,000 kisi** (kohort toplami ≠ meslek sayaclari); yuvarlama farki ≤%3.5 (`reconcilePopulation` tabana yuvarlar, artik hicbir meslege yazilmaz) | |
| POP gelir defteri (population) | `income` ile `needsBudget` bagimsiz; kimlik sapmasi **%657.6**; hane harcamasi geliri **1.9x** asiyor | income = incomePool×agirlik (uretim degeri); needsBudget = nufus×sepet×ucret endeksi×(1−vergi) |
| Cullanma (war-pressure) | azami eszamanli saldirgan 4 (esik 3) | |
| Kartopu (border-change) | 50 yilda kume devri %39.0 / %33.5 (esik %33.3; budama oncesi %33.2-34.2) | |
| Fiyat bandi kilidi (long-run) | 1040h'de mallarin ~%57-62'si bantta; DYE_WORKS hic kurulmuyor | orta katman sanayi kurulmuyor |
| (7.) population MEDIUM notu | barista 4/60 haftada toplam insan dustu (en buyuk −227) | alay draws kaydi vs cekilen insan farki |

Ayrica ayni head'de bulgusuz: determinism, save, construction, tech-effect,
war-outcome, legacy, debt, military, tariff. Dogal acilis sorunu (FAZ 6):
duman oyununda ¤50 acilis kasasi her anlamli eylemin (¤70-120+) altindaydi,
teste ¤800 enjekte edilmisti — dogal acilis DOGRULANMADI.

Bu oturumun oncelik sirasi: (1) isci/kohort/gelir muhasebesi, (2) dogal
acilis + borc, (3) uzun kosular, (4) ancak ondan sonra fiyat bandi /
cullanma / kartopu.

## Duzeltme kayitlari

(asagiya her duzeltme icin: PROBLEM / ETKI / KOK NEDEN / DOSYALAR /
DEGISIKLIK / DEGISMEZ / TEST / ONCE / SONRA / KALAN RISK)

### 1. Isci cift sayimi (FAZ 1) — YUKSEK kapandi

- **PROBLEM:** Σfabrika kadrosu > `professionCounts.workers` (8.690 kisiye
  kadar); ayrica fabrika province'inde kadro yerel nufusu asarken fazlasi
  hicbir yerden dusulmuyordu (12.797 kadro / 8.989 nufus).
- **ETKI:** Ayni insan hem fabrikada calisir hem baska meslekte sayilirdi;
  ucret, issizlik ve RGO kirsal emegi yanlis tabandan hesaplaniyordu —
  komsu provinsler "hayalet kirsal" ile tam RGO isletiyordu.
- **KOK NEDEN (sonda ile olculdu, `worker-probe`):**
  1. *Kurulus:* `ensureInitialMilitaryIndustry` kadrolari (5×1000) meslek
     sayacina hic sorulmadan atiyordu — 1. haftada 5.000 kadro / 4.000 isci.
  2. *Kucultme:* `reconcilePopulation` nufus dusunce EN KALABALIK meslekten
     kohort siler (cogu zaman `workers`) ama tesis kadrosuna dokunmaz
     (260 haftada 11 kez ihlali buyuttu).
  3. *Yukselme:* `runPromotion` en kalabalik alt meslekten kohort alir —
     yine `workers` — kadro yerinde kalir (2 kez).
  Ise alim tavani (`counts.workers − employed`) yalniz alim aninda calisir.
- **DOSYALAR:** `src/game/economy.js`, `src/game/provinces.js`,
  `scripts/audit/factory-audit.mjs`, `scripts/audit/labor-audit.mjs` (yeni).
- **DEGISIKLIK:** `alignWorkforce(nation)` — acik once ciftci kohortundan
  kapanir (fiilen fabrikada calisan nufus ISCIDIR; ayni sinif, sinif
  toplamlari degismez), isci gercekten kalmadiysa kadro oransal kuculur.
  Cagri noktalari: kurulus sanayii, `reconcilePopulation`, mobilite.
  Mekansal taraf: `runFactories` banliyo duzeltmesi — yerel nufusu asan
  kadro fazlasi ulkenin diger provinslerine nufus oraninda
  `industrialCommuters` olarak yazilir; `provinces.ruralPopulation` kirsali
  `pop − min(kadro, pop) − banliyo` olarak hesaplar (RGO ve gelisme baskisi
  ayni yardimciyi kullanir). Alan `{...econ}` ile kayda kendiliginden girer.
- **DEGISMEZ:** I1 Σkadro ≤ workers; I2 kadro ≤ kapasite; I3 negatif emek
  yok; I4 Σsayac = cohortPopulation; I5 dunya: Σ(yerel fazla) ≈ Σbanliyo.
- **TEST:** yeni `audit:labor` (260 hafta surekli + A-G kontrollu senaryolar:
  fabrikasiz/yeniden cekirdekleme, tek tesis, emege yarisan tesisler, tesis
  kapanisi, hizli buyume, yuksek issizlik, emek kitligi) — bulgusuz.
  `audit:factory` yerel-nufus kontrolu korunum kimligine cevrildi (fazla ≈
  banliyo; ulke bazli gruplama isgal karisiminda yaniltici, DUNYA duzeyinde).
- **ONCE:** ihlal 1. haftada baslar, 260. haftada ulke basina 4.900'e cikar;
  denetimde 8.690. **SONRA:** 260 haftada ihlal 0; `audit:factory` YUKSEK'i
  ve "YZ subvansiyonla batiyor" ORTA'si kapandi; determinism + save temiz.
- **KALAN RISK:** banliyo bir haftalik tazeleme kaymasi tasir (olculen sapma
  4.192'de 358, tolerans %10); ayni econ'a iki AYRI ulkenin fabrikasi
  yazarsa son yazan kazanir (onceden de boyleydi, nadir).

### 2. Hayalet nufus tabani (FAZ 2) — YUKSEK kapandi

- **PROBLEM:** "Kohort muhasebesi tutmuyor: en kotu sapma 5-6.000 kisi."
- **ETKI:** Sayac 10.000 kisi gosterirken kohort katmani 0 kisi turetiyordu;
  kucuk uluslarin nufusu sisirilmis, topraksiz devlet sonsuza dek hayalet
  vergi tabani/ordu havuzu tasiyordu.
- **KOK NEDEN:** `populationOf` = `max(10000, kareToplami)` — her ulusa
  10.000 kisilik SERT taban. Topraksiz kalinti devlet (olculdu: Yarimark,
  0 kare, alive) 10.000 hayalet insanla yasiyordu; `reconcilePopulation` ve
  `initialProfessionCounts` icindeki `max(10, ...)` kohort tabanlari ayni
  hayaleti sayaclara isliyordu. Kohort katmani dagitacak kare bulamayinca
  sapma tam sayac buyuklugu oluyordu.
- **DOSYALAR:** `src/game/economy.js`, `src/game/population.js`,
  `src/game/provinces.js`, `scripts/audit/population-audit.mjs`.
- **DEGISIKLIK:** (a) taban kalkti: nufus = kare toplami (payda tuketiciler
  zaten `max(1,...)` korumali); kohort hedefi gercek nufusun karsiligi
  (nufus>0 ise en az 1 kohort). (b) `professionCountsValid` tamamen-sifir
  sayaci yapisal gecerli sayar (sifir nufuslu ulkede haftalik bosuna
  yeniden kurulum donuyordu). (c) `ownedProvinces` kalinti-devlet yedegi:
  cogunluk sahipligi olmayan ama kare tutan ulke, kare sahibi oldugu
  kumeler uzerinden dagitilir (gercek kalinti icin gerekli).
- **DEGISMEZ:** kohort toplami = meslek sayaclari = sinif toplamlari
  (denetim bolumu 1); nufus tabani uydurulamaz.
- **ONCE:** en kotu sapma 6.000. **SONRA:** 0.
- **KALAN RISK:** cok kucuk (<1000 kisi) gercek nufus 1 kohorta yuvarlanir
  (≤1000 kisilik fark, LOW yuvarlama bulgusunun icinde).

### 3. Kitlik olumleri kayitli kanal oldu (FAZ 2) — ORTA kapandi

- **PROBLEM:** "Barista nufus kaybolabiliyor: 4/60 haftada dusus, −227."
- **KOK NEDEN:** kayip degil KASITLI mekanik: `needsMet < 0.5` kitlik
  olumleri (provinces.js famine, olcumle eklenmis). Denetimin korunum
  denkleminde bu kanalin karsiligi yoktu — olumler "kaybolan insan"
  goruluyordu.
- **DEGISIKLIK:** olumler artik ACIK sayac: `economy.famineDeaths`
  (haftalik, provinces.js buyume adiminda birikir). Denetim denklemi
  kanali dusuyor; yalniz kitligin ACIKLAYAMADIGI kayip bulgu.
- **SONRA:** 4/60 dusus haftasinin 4'u de kitlikla birebir aciklandi;
  bulgu kapandi. Sayac UI'ya da acik (ileride gosterilebilir).
- **KALAN RISK:** yok — kanal kayitli, denklem siki (tolerans ±1).
  (Ek: runPeaceful savasi tur SONRASI bastiriyor; bir haftalik "savas
  parlamasi" olumleri artik isaretlenir ve baris denkleminin disindadir.)

### 4. POP gelir defteri: tek hikaye (FAZ 3) — YUKSEK kapandi

- **PROBLEM:** `income` ile `needsBudget` bagimsiz iki formul (harman %35);
  kimlik sapmasi %658; hane gelirinin 7-9 katini harciyordu. Dunya
  butceleri (14k/hf) dunya GSYH'sinin (9.2k/hf) 1.5 kati — para yoktan.
- **ETKI:** Sinif geliri dekoratifti; talep uretim degerinden kopuk (fiyat
  tavani kilitlerinin beslemesi); vergi matrahi ile tuketim ayri evrenler.
- **KOK NEDEN:** uc kopukluk: (1) fabrika ucretleri kardan dusuluyor ama
  KIMSEYE odenmiyordu (WAGE_PER_THROUGHPUT=1.2, katma degerin %2.5'i —
  para imha); (2) sanayi geliri hayali havuz payi (0.22×industrialOutput);
  (3) butce nufus×sabit-sepet formulu, gelire yalniz %35 harmanla bagli.
- **DOSYALAR:** `src/game/economy.js`, `scripts/audit/population-audit.mjs`,
  `scripts/audit/harness.mjs`.
- **DEGISIKLIK:** GELIR uc GERCEK kanal: kirsal pazarlanan pay
  (0.35×baseOutput; sanayi terimi kalkti), BORDRO (katma deger ×
  LABOR_SHARE, %80 alt / %20 orta sinifa — runFactories'te birikir,
  fiscalBalance'ta odenir), sermaye kari (mevcut PROFIT_TO_CAPITAL).
  BUTCE = net gelir + BEYAN EDILMIS gecimlik (SUBSISTENCE_SHARE
  {alt .30, orta .15, ust 0} × formul butcesi; `socialClass.subsistence`
  alaninda acik). INCOME_BUDGET_WEIGHT ve WAGE_PER_THROUGHPUT silindi;
  expectedMargin emek payi sonrasi kar uzerinden.
- **DEGISMEZ:** butce_t = netGelir_{t-1} + gecimlik_t (birebir; gelir bir
  hafta geriden gelir cunku fiscalBalance populationDemand'den sonra kosar).
  Denetim bu kimligi SIKI (%1) dogrular — olculen sapma %0.0.
- **KALIBRASYON (A/B, 2 tohum, 120/260 hafta, taban agacla):** LABOR_SHARE
  taramasi 0.45/0.55/0.65 → 0.55 IC OPTIMUM (iki yonde de fabrika sayisi
  ve needsMet dusuyor; ekonomi talep-kisitli — ucret, sanayiyi besleyen
  talebin kendisi). Sonuclar (tohum-2 @260h taban → yeni):
  needsMet 0.844→0.875 · istikrar 0.392→0.486 · kitlik olumu/hf 625→453
  (120h) · TAVAN MAL 7→3 (120h'de 14→7) · fabrika 673→490 (−%27) ·
  GSYH 13.2k→8.5k. Sanayi kuculmesi "hasar" degil DURUST OLCEK: eski
  buyukluk hayalet talep parasiyla sisirilmisti; fiyat kilitlerinin
  yarilanmasi ayni duzeltmenin obur yuzu.
- **ONCE:** kimlik %658, harcama/gelir 7-9x. **SONRA:** kimlik %0.0;
  butun harcamanin kaynagi ya gelir ya kayitli gecimlik.
- **KALAN RISK:** sanayilesme temposu dustu — 100 yillik kosuda (FAZ 10)
  izlenecek; gerekirse LABOR_SHARE tek durust kaldiractir. Gecimlik payi
  formul-butcesine carpan (vergi/ucret endeksi tasir) — kaba ama beyanli.

### 5. Para korunumu kimlikleri + yeni `audit:ledger` (FAZ 4-5)

- Fabrika/sermayedar: VA = ucret + kar tesis tesis dogrulanabilir
  (`factory.wages` alani); kar beyani 0.50 hane + 0.08 yeniden-yatirim
  (PROFIT_TO_REINVEST sabiti; politics tarafindaki 0.08 esitligi denetimde),
  kalan 0.42 BEYANLI yipranma bataktir — para iki kez dogmaz.
- Vergi: taxRevenue = Σ taxPaid × taxEfficiency (sapma %0.00; verim kaybi
  beyanli tahsilat-kaybi kanalidir). Gumruk: gelir = ithalat degeri ×
  tarife birebir (tariff-audit 0.00).
- Yeni denetim `audit:ledger` (L1-L5) + `ACCOUNTING_INVARIANTS.md` yayimlandi:
  butun korunum yasalari tek tabloda, her biri bir denetime bagli.
- NOT (FAZ 11'e devir): tarife→girdi faturasi kanali yeni ekonomide
  zayifladi (%12.3 → %1.8, tariff-audit ORTA) — fiyat/ithalat dengesi
  degisti; pazar sagligi fazinda yeniden bakilacak.
