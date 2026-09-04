# ACCOUNTING INVARIANTS — simulasyonun korunum yasalari

Her yasa bir denetimle baglidir; ihlal YUKSEK bulgudur. "Beyanli kanal" =
alan olarak kayitli, denetimin okudugu, ekranin gosterebilecegi akis.

## Insan (audit:labor, audit:population, audit:factory)

| # | yasa | denetim |
|---|---|---|
| I1 | Σ fabrika kadrosu ≤ `professionCounts.workers` (cift sayim yok) | labor 260hf + A-G senaryolari |
| I2 | kadro ≤ seviye kapasitesi; negatif emek yok | labor |
| I3 | Σ meslek sayaci = `cohortPopulation` = Σ sinif nufusu = Σ kohort | labor I4 + population §1 |
| I4 | dunya: Σ(yerel nufusu asan kadro) ≈ Σ banliyoculuk (`industrialCommuters`) | labor I5 + factory |
| I5 | nufus tabani UYDURULMAZ: sayaclar kare nufusundan turer (10k hayalet taban yok) | population §1 |
| I6 | bariscil hafta: Δ(nufus+ordu) ≥ −kayitli kitlik olumleri (`famineDeaths`) | population §2 |
| I7 | asker alimi: cekilen insan = alay `draws` kaydi; dagitimda sahipli yurda doner | population §3-4 |

## Para (audit:ledger, audit:population, audit:tariff, audit:save)

| # | yasa | denetim |
|---|---|---|
| L1 | sinif geliri = 0.35×tabanUretim×pay + bordro×WAGE_SPLIT (+ kar×0.5 ust) — baska kaynak yok | ledger (sapma %0.00) |
| L2 | Σ `factory.wages` = `economy.wagesPaid`; tesiste VA = ucret + kar; ucret/VA ∈ [LABOR_SHARE, 0.85] | ledger |
| L3 | kar beyani: hane 0.50 + yeniden-yatirim 0.08 ≤ 1; kalan 0.42 BEYANLI yipranma bataktir (kaynak degil) | ledger |
| L4 | vergi geliri = Σ sinif.taxPaid × taxEfficiency — odeyensiz devlet geliri yok | ledger (sapma %0.00) |
| L5 | subvansiyon: tesise odenen destek defterde (`subsidyCost`) gorunur | ledger |
| L6 | HANE KIMLIGI: `needsBudget_t` = netGelir_{t-1} + `subsistence_t` — beyansiz harcama yok | population §5 (sapma %0.0) |
| L7 | hane artigi bolusumu: birikim 0.50 + ozel sermaye 0.22 ≤ 1 | sabitler (politics not) |
| L8 | gumruk geliri = ithalat degeri × tarife (birebir); ic tuketim gumruklenmez | tariff (sapma 0.00) |
| L9 | Δhazine = defter net + borclanilan − odenen + temerrut (bilanco kimligi) | updateLedger + save |
| L15 | GSYH CIFT SAYMAZ: `gdp` = tabanUretim + Σ tesis KATMA DEGERI (hasilat degil); ara mal alt zincirin hasilatinda ikinci kez sayilmaz | ledger L15 (sapma %0.00) |
| L16 | REEL seri ayridir: `realGdp` ayni toplam TABAN fiyatlarla. Buyume yalniz burada okunur — nominal seride hacim artisi fiyat dususuyle sifirlanir | price-stability TEST 4 |

## Sirket / borsa (audit:companies)

| # | yasa | denetim |
|---|---|---|
| L10 | temettu TRANSFERDIR: yabanci ortaga odenen tutar ayni hafta ev sahibi ust sinifin gelirinden dusulur (`economy.capitalWithheld`); Σodenen = Σalinan | companies K3 (sapma 0.00) |
| L11 | hisse bedeli TRANSFERDIR: alici hazinesi −X, ev sahibinin `politics.privateCapital` +X; **sirketin kasasi degismez** | companies K2 (dunya serveti Δ=0) |
| L12 | ayricalikli erisim MAL YARATMAZ: `crossBorderTrade` AGIRLIKSIZ teklif toplamindan hesaplanir, tahsis iki gecisli su-doldurmayla tam kapanir, dolayisiyla dunya toplaminda Σithalat degeri = Σihracat degeri ve dis hesap kapanisi sifirlanir | companies K4 + K5 |
| L13 | yeniden-yatirim payi (0.08) IKI KEZ yazilmaz: sirket kasasina giden kisim `economy.reinvestToCompanies` olarak beyan edilir ve ulusal havuzdan tam o kadar dusulur | ledger L3 + companies K2 |
| L14 | kamulastirma tazminati TRANSFERDIR ve hazine ortulemedigi kademeyi secemez (`due > gold` on kontrolu) | companies K6 (dunya serveti Δ=0) |

Sirket kari YENI BIR GELIR DEGILDIR: sanayide `factory.profit × PROFIT_TO_CAPITAL`,
cikarimda `tabanUretim × INCOME_POOL_SHARE × INCOME_WEIGHTS.upper` — ikisi de
zaten ust sinifa akan kanallardir, sirket katmani yalniz onlara SAHIP verir.

## Para KAYBETMEK de ihlaldir

`politics.privateCapital` tavani (1200) bir zamanlar `min(1200, havuz + akis)`
seklindeydi ve havuz tavani astiginda farki YOK EDIYORDU. Hisse satisi buyuk ve
ani bir girdi oldugu icin bu yol artik sik kullaniliyor; her iki yazim yeri
(`politics.collectPrivateCapital`, `construction` iadesi) tavani YALNIZ
AKISA uygular. Havuz <= 1200 iken iki yazim birebir ayni sonucu verir.

## Beyanli olmayan tek bataklar (bilerek, kaynak degil GIDER yonunde)

- Kar 0.42 payi: yipranma / ithal makine sogurmasi (L3).
- taxEfficiency < 1 kaybi: tahsilat kaybi — yonetim butcesinin bedeli.
- Iptal edilen insaatta yapilan is: batik maliyet (cancelConstruction).

Kaynak yaratan (odeyensiz gelir, sahipsiz insan) HICBIR kanal yoktur;
yeni kanal eklerken bu dosyaya beyan + denetime kimlik eklenmelidir.
