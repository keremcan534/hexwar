# BETA REPAIR LOG

Plan: [BETA_REPAIR_MASTERPLAN.md](BETA_REPAIR_MASTERPLAN.md).
Her kayit: PROBLEM · KANIT · KOK NEDEN · DOSYA · DEGISIKLIK · TEST · ONCE ·
SONRA · KALAN RISK.

---

## R-01 — Dis hesap hazineye kapanmiyor (P0)

**PROBLEM** Ticaret dengesi devlet maliyesine hic ugramiyor; dis acik veren
ulke zenginlesiyor.

**PLAYER EVIDENCE** B-02 / BUG-017. Butce ekrani: `Net -¤823.8` yaninda
`Projected weekly balance +¤184.0`. Kampanya 70 yilda 50 -> 280.023 altin,
sifir komur uretimi ve kendi gidasini ithal ederken.

**ROOT CAUSE** Mimari "ozel takas" (hane/firma oder, hazineye yalnizca gumruk
girer) ve bu **tutarli**: hazine kimligi kapaniyor, hane yalnizca odeyebildigi
kadarini talep ediyor (bedava ithalat yok). Asil kusur baska:
`trade.tariffRevenue = importValue * tariff/100` **karsi kalemi olmayan** bir
devlet geliri. Gelir ithalat HACMIYLE buyudugu icin cokmus ekonomi en zengin
hazineyi topluyor. Net dis denge — sifir toplamli bir akis — hicbir yerde
kapanmiyordu.

**FILES** `src/game/economy.js` (EXTERNAL_SETTLEMENT, settleGlobalTrade,
updateLedger, emptyTradeSummary, resetTradeSummary).

**CHANGE** Net dis denge hazineden gecer: `trade.settlement = balance * 1`.
Fazla gelir, acik gider. Ledger'da ayri satir (`externalSettlement`).
Para YARATMAZ: `crossBorderTrade = min(totalSurplus, totalBid)`, iki taraf ayni
fiyattan degerlenir, dunya toplaminda `Simport == Sexport` (olculdu: 200.
haftada fark 2.3e-13). Bir hazineden cikan baska hazineye girer.

**TEST** `node scripts/audit/trade-consequence-audit.mjs 520` (yeni).

**BEFORE / AFTER** (ayni tohum, 520 hafta, 30 ulke)

| Olcum | Once | Sonra |
|---|---|---|
| Acik veren ulke ort. hazine | 18.259 | **2.813** |
| Fazla veren ulke ort. hazine | 1.968 | **14.552** |
| Fazla/acik hazine orani | 0.11x (ters) | **5.17x** |
| Acik veren ort. haftalik net | +45.5 | **+1.2** |
| Fazla veren ort. haftalik net | +2.3 | **+44.5** |
| Acik veren ort. borc | 191 | **640** |
| Fazla veren ort. borc | 297 | **0** |
| Borclu ulke / toplam borc | 8/30 · 7.349 | 8/30 · **10.235** |

Hazine kimligi 520 hafta x 30 ulke boyunca tek ihlalsiz kapanmaya devam ediyor.

**REMAINING RISK** Yuksek gumruklu, kucuk acikli zengin ulke dis hesaptan net
kazanmaya devam ediyor (kendi hanesinden vergi topluyor). Bedeli haneye
biniyor (`needsMet` dusuk) ama o bedel stabiliteye tam gecmiyor — bkz. R-03.
Denetimde INFO olarak izleniyor.

---

## R-02 — Kaybedilen savas bedava (P0)

**PROBLEM** Kazanan taraf, isgal ettigi her seyi bedelsiz geri veren beyaz
barisi imzaliyor.

**PLAYER EVIDENCE** B-01 / BUG-009. 2 ARA 1846: 7 yil savas, -25 savas skoru,
iki sehir isgal altinda. Ekran: *"They will sign this treaty"*, 0 talep. Tek
tikla her sey geri geldi. Oyuncu: *"losing was interesting; the loss being
erasable was not"* — bu andan sonra hicbir savas tehdit olusturmadi.

**ROOT CAUSE** **Iki ayri kabul yolu.** `ai.js:52 acceptsOffer` "kazanan beyaz
barisi reddeder" kuralini zaten dogru isletiyordu — ama yalnizca YZ-YZ
arasinda. Oyuncunun masasi `peace.js offerRefusal`'dan geciyor ve orada
kosulsuz bir kacak vardi:

```js
const cost = offerCost(world, offer);
if (cost <= 0) return null;   // bedeli sifir olan her teklif kabul
```

Yani formul yanlis degildi; **oyuncu formulun ugramadigi yoldan geciyordu**.

**FILES** `src/game/peace.js` (acceptanceTolerance, offerMeetsExpectation,
offerRefusal), `src/game/ai.js` (acceptsOffer artik paylasilan fonksiyonu
cagiriyor).

**CHANGE** Kabul esigi tek fonksiyonda toplandi: `offerMeetsExpectation`.
Alici, `warScore - tolerance` kadarini masada gormek ister. Tolerans =
10 + (ikinci cephe basina 15) + (istikrar <%40 ise 15) + yorgunluk (6 yilda
azami 15). `offerRefusal` bu fonksiyonu cagiriyor; ret mesaji **istenen
miktari soyluyor**. `ai.js` ayni fonksiyonu cagiriyor, uzerine yalnizca kucuk
rastgele pay (%8) ekliyor ki iki inatci YZ kilitlenmesin.

**TEST** `node scripts/audit/peace-stakes-audit.mjs` (yeni, 4 test).

**BEFORE / AFTER** (46-0 kaybedilen savas kurulumu)

| Senaryo | Once | Sonra |
|---|---|---|
| Kaybeden bedava beyaz baris | **KABUL** | **RET** — "expect about 36 more" |
| Oyuncu yolu vs YZ yolu | 3 vakada ayrisiyor | **3/3 ortusuyor** |
| Kaybeden isgal topragini birakip cikis | anlamsizdi (bedava vardi) | **KABUL** |
| Tolerans 0 -> 10 yil savas | sabit | **10 -> 25** |

Korundu: kaybeden YZ'nin artan taviz davranisi (`buildOffer` + `surrenderOffer`
dokunulmadi) — beta raporu §20'de acikca korumaya alinmisti.

**REMAINING RISK** Kesin yenilgide (skor -46) 10 yil yorgunluk bile bedava
cikis vermiyor; savasin kapanmasi kaybedenin toprak birakmasina bagli. TEST 3
bunun mumkun oldugunu sabitliyor, ama YZ'nin bu teklifi FIILEN yapip yapmadigi
P0-3'te (savas bitirme) olculecek.

### R-02b — ayni kacak TOLERANS yolundan geri dondu (canli oyunda yakalandi)

R-02 yazildiktan sonra **canli oyunda** dogrulama yapilirken beta'nin tam
senaryosu ureildi (seed BETA1836, Vasheim, 1840, Draesh savasi) ve sonuc
sasirticiydi: warScore **-37** olmasina ragmen bedava beyaz baris **yine
kabul ediliyordu**.

**Sebep:** tolerans kalemleri toplami ustunlugu asabiliyordu. Draesh iki
cephede savasiyor (+15) ve istikrari %40 altindaydi (+15); taban 10 ve
yorgunlukla birlikte tolerans **45.9** oluyor, 37'lik ustunlugu tamamen
yutuyordu. Yorgunlugun talebi UCUZLATMASI dogru, SIFIRLAMASI degil.

**Duzeltme:** `acceptanceTolerance` artik tavanli:
```js
const lead = warScore(world, receiverId, proposerId);
return lead > 0 ? Math.min(raw, lead * 0.6) : raw;
```
Kazanan taraf ustunlugunun **en az %40'ini** masada ister; yorgunluk en fazla
%60'ini siler. Kaybeden taraf (lead <= 0) icin tavan uygulanmaz — o zaten
kolay imzalamali.

**TEST** peace-stakes-audit **TEST 5** (yeni): istikrar %25, 8 yil savas,
2 cephe → tolerans 27.6, tavan 27.6, beyaz baris **RET**.

**Canli dogrulama** (ayni tohum, 251. hafta, warScore -21):
```
They are winning and will not sign for nothing — they expect about 11 more at the table.
```
Beta'da ayni durum *"They will sign this treaty"* diyordu.

**DERS:** bassiz test tek basina yetmedi. Kacagi bulan sey oyunun kendisini
oynamakti; denetim ancak ondan SONRA yazilabildi.

---

## R-03 — Kara birlikleri okyanusta yetim kaliyor (P0)

**PROBLEM** Kara tumeni suda kalip bir daha hic hareket etmiyor.

**PLAYER EVIDENCE** Gelistirici gozlemi (H3): *"land troops can sometimes
remain stuck in water / naval spaces"*.

**ROOT CAUSE** Zincir tam olarak su:
1. `movement.js reroute` — yol iki kez kapanirsa `clearPath(unit)`. Tumen
   **suda ve emirsiz** kalir.
2. `command.js runGroup` — `if (... && !unit.embarked)` kosuluyla embarked
   tumeni `divisions` listesine ALMIYOR. Bu **hakli**: denizdeki tumen cephe
   mevkisi tutamaz.
3. Yan etki: `assignPosts` mevki vermez, `march` yurutmez, `advance` gormez.
   **Tumeni sahiplenen hicbir kod kalmaz.**

**FILES** `src/game/command.js` (rescueStranded + runGroup embarked dali).

**CHANGE** Embarked ve emirsiz tumen en yakin cikarma noktasina yonlendirilir:
once 6 yaricapli halka taramasi, bulunamazsa en yakin 12 kendi-toprak karesi.
Ikinci yol sart cikti — kalan tek vaka tarafsiz bir ulkenin kiyisiyla cevrili
korfezdi ve `canEnterFor.allowed` baristaki topraga girisi (dogru sekilde)
reddediyordu.

**TEST** `node scripts/audit/military-strategy-audit.mjs 400` (yeni).

**BEFORE / AFTER**

| Olcum | Once | Halka taramasi | + kendi-toprak yedegi |
|---|---|---|---|
| Kalici yetim tumen | **17** | 1 | **0** |
| En uzun suda kalis | **277 hafta** | 151 hafta | **7 hafta** |

7 hafta mesru gecis suresidir (kiyiya yuruyus), yetimlik degil.

**REMAINING RISK** Yok denecek kadar az; yedek tarama yalnizca halka
taramasi bosa cikinca kosar (pratikte cok seyrek).

---

## R-04 — Gelistirici hipotezlerinin OLCUMU (P0, sonuc: cogu dogrulanmadi)

Brief bu gozlemleri *hipotez* saydi ve uretilmesini istedi. Uretildi:

| Hipotez | Sonuc | Kanit (400 hafta) |
|---|---|---|
| H1 cepheler bos kaliyor | **DOGRULANMADI** | 112 ornekte medyan doluluk %44, `YERLESIK` 62 · `KISMI` 26 |
| H2 ordular absurt yerlerde atil | **DOGRULANMADI** | en uzun atil kalis **1 hafta** |
| H3 kara birligi suda takiliyor | **DOGRULANDI** | 17 tumen, 277 hafta → duzeltildi (R-03) |
| H4 cephe tahsisi bozuk | **DOGRULANMADI** | tumeni olan gruplarda mevkiye yerlesme **%85.3** |
| H5 ulkeler yetersiz kuvvetle basliyor | **DOGRULANMADI** | savasan ulkelerde 1.20-4.33 tumen/cephe-karesi |

**Onemli olcum hatasi notu:** ilk kosuda cephe uzunlugu her ulkede 0 gorundu
ve "cephe sistemi tamamen bozuk" gibi okundu. Sebep denetimin kendisiydi:
`BRANCH.ARMY` degeri `'army'` (kucuk harf) iken filtre `'ARMY'` ariyordu ve
butun generalleri eliyordu. Duzeltilince tablo yukaridaki haliyle cikti.
**Oyun kodunda bir kusur yoktu.**

`KUVVET BASKA GRUPTA` (16 ornek) da kusur degil: hedefi olmayan generallerin
hepsi `frontFor` uzerinden AYNI dusman sinirini turetir, dolayisiyla bir
generalin cephesi kardes grup tarafindan tutulur. Panelde bos gorunen ikiz
cephe bir NETLIK sorunudur, tahsis sorunu degil (bkz. REMAINING P3).

---

## R-05 — Istikrar donuk: girdisi yoktu (P1)

**PROBLEM** Istikrar onyillarca kimildamiyor.

**PLAYER EVIDENCE** B-09. *"It fell 62% → 44% in the first decade and then sat
at 44% for sixty years, through occupation, three simultaneous wars, and 65% of
my population living under enemy control."*

**ROOT CAUSE** Tek satirdi (`economy.js:2030`):
```js
economy.stability = satisfactionWeighted / Math.max(1, economy.population);
```
`satisfaction` = 0.35 + odenebilirlik*0.5 − vergi*0.28 + refah*0.14 + reform
ruh hali. **Isgal, savas yorgunlugu ve issizlik girdi degildi.** Kalan iki
terim de yavas hareket ettigi icin sonuc pratikte sabitti.

**FILES** `src/game/economy.js` (refreshNationalStrain, updateStability,
STABILITY_WEIGHTS), `src/ui/hud.js` (stabilityWhy).

**CHANGE** Uc gercek girdi eklendi — isgal payi (agirlik 0.38), savas yuku
(0.14; cephe sayisi × sure), issizlik (0.22). Isgal ve savas yuku **haftada
bir, TEK dunya taramasiyla** hesaplanir (`refreshNationalStrain`); ulke basina
kume taramasi sicak yolu geri bozardi. `stabilityBreakdown` gercek kalemleri
tasir ve toplami istikrara esittir.

**TEST** `node scripts/audit/stability-audit.mjs 420` (yeni).

**BEFORE / AFTER**

| Olcum | Once | Sonra |
|---|---|---|
| %5'ten az oynayan ulke | (beta: 60 yil sabit) | **0/23** |
| Ortalama oynama araligi | ~0 | **%25.8** |
| Dokum kimligi | yok | **tutuyor** |
| Kontrollu isgal senaryosu | — | **%43.3 → %19.2** (isgal −21.1, savas −2.6) |

---

## R-06 — "WHY STABILITY IS WHAT IT IS" (P1)

**PLAYER EVIDENCE** Beta'nin 4. en degerli istegi. Eski ipucu tam metniyle:
*"national stability"* — yani etiketin kendisi.

**CHANGE** `hud.js stabilityWhy`, ticaret ekranindaki kalibi istikrara
uygular. Sayilar `stabilityBreakdown`'dan gelir, **uydurulmaz**. Canli oyunda
olculen cikti:

```
Household satisfaction  +57.2
Unemployment            −2.5  (1,116 without work)
= Stability             54.7%
```

Butce ekranina da `External settlement` satiri eklendi: dis dengenin hazineye
ne yaptigi artik projeksiyonun icinde ve **gorunur**.

---

## R-07 — "unavailable" ve hayalet fabrika karti (P1)

**PLAYER EVIDENCE** BUG-015. Bes bina tek kelimeyle kilitli; oyunun en karli
binasinin (Oil Refinery +61.3/seviye) neyle acildigi 70 yilda ogrenilemedi.
Ayrica *"private investors queued a Steel Mill in 1836 while the same building
was unavailable to me"*.

**ROOT CAUSE — iki ayri kusur:**
1. Sebep zincirinde **cag kapisi vakasi yoktu**; `availableFrom` ile kilitli
   her bina son dala, `'unavailable'`e dusuyordu.
2. **Iki ayri atlas.** Ekran `factoriesInRegion` (**factoryAtlas**) ile
   suzuyor, motor `canBuildFactory` → `industryTaken` (**constructionAtlas**)
   ile bakiyordu. Ayrisinca ekran kart gosteriyor, motor reddediyor — kart
   yine `'unavailable'`. Kapitalist celiskisinin kaynagi buydu.

**FILES** `src/ui/screens.js` (eraYear, sebep zinciri, suzgec),
`src/game/economy.js` (`industryTaken` disa acildi).

**TEST** Tarayicida, seed BETA1836, 1836, bolge 40:6.

**BEFORE / AFTER**

| Olcum | Once | Sonra |
|---|---|---|
| `"unavailable"` diyen kart | 5+ | **0** |
| Sebep veren kilitli kart | kismi | **12/12** |
| Motorun reddedecegi hayalet kart | 2 (Steel Mill, Luxury Furniture) | **0** |

Ornek: `not yet invented — available from 1870`.

---

## R-08 — Reform dugmesi 11 piksel (P1)

**PLAYER EVIDENCE** BUG-008. *"The row renders 280px wide; the actual
`<button>` measures 11px × 55px."* Oyuncu reformlari bozuk sandi.

**ROOT CAUSE** CSS. `.rstep` **kendisi** bir grid:
`grid-template-columns: 11px minmax(0,1fr) auto`. Satirin icinde TEK bir
`<button>` varsa o buton **ilk sutuna**, yani 11px'lik hucreye yerlesiyor;
butonun `width: 100%`u da o 11px'in %100'u oluyordu. Olculen kutu tam olarak
11×55.

**FILES** `src/styles.css` (`.rstep.is-open { display: block; }`).

**TEST** Tarayicida `getBoundingClientRect`, tester'in yaptigi olcumun aynisi.

**BEFORE / AFTER**

| Olcum | Once | Sonra |
|---|---|---|
| Enact dugme genisligi | **11px** | **207-427px** |
| Satir kaplama orani | ~%4 | **%100 (14/14 dugme)** |

---

## R-09 — Muharebe raporlari ham koordinat (P1)

**PLAYER EVIDENCE** BUG-011. Yedi yil boyunca `Draesh won the battle at
125, 52.` Oyuncu tek bir muharebesini haritada bulamadi.

**FILES** `src/game/battles.js`.

**CHANGE** `provinceName(tile)` zaten var ve deterministik. Rapor artik
`... won the Battle of <Province>; the enemy was forced out.`

---

## R-10 — Dunya kalici kitliga MAHKUM dogmus (P1, Phase 7)

**PROBLEM** Dunya piyasasi fiyat bandinda kilitli; 70 yil sonra basindan daha
cok kitlik var.

**PLAYER EVIDENCE** B-04 · beta §11: *"26 critical worldwide shortages after
seventy years of industrialisation — more than in 1836."* Komur 70 yil boyunca
tavanda. Oyuncu: *"if the AI never builds coal capacity, this isn't a boom,
it's an annuity."*

**ROOT CAUSE — hipotezim YANLISTI, olcum baskasini gosterdi.**

Ilk hipotez "kisir dongu: girdi pahali → orta katman tesisin marji negatif →
`investmentOptions` onu eliyor" idi. Olcum bunu **curuttu**: gubre tesisi 34
tane KURULU ve marji **%100 hafta pozitif**, buna karsilik arz 0.1, talep 37.6.
Tesisler vardi, karliydi ve calismiyorlardi.

Gercek sebep bir ust katmandaydi — **RGO dagilimi**. `weightedRgo` her kume
icin BAGIMSIZ zar atar ve nadir kaynaklarin agirligi cok dusuktur. Olculdu
(260. hafta, 255 kume):

| kaynak | kume | hex | arz | talep | fiyat/taban |
|---|---|---|---|---|---|
| kukurt | **1** | **1** | 0.2 | 7.1 | **8.0x** |
| ipek | **1** | **1** | 0.2 | 2.8 | **8.0x** |
| kaucuk | 1 | 3 | 0.4 | — | — |
| tahil | 123 | 691 | 419 | 299 | 0.12x |

Tek hex butun dunyanin kukurdunu uretmek zorundaydi. Gelisim hizi bunu
KURTARAMAZ: tavanda bile tek hex 0.56 uretir, talep 7.1'dir. Yani kitlik
ekonomik degil, **yapisaldi** — dunya kurulurken zar oyle dusmustu.

**FILES** `src/game/provinces.js` (RGO_WORLD_MINIMUM, repairRgoScarcity,
rgoPriceDrive), `src/game/economy.js` (market durumunda `basePrice`).

**CHANGE — iki kenar:**

1. **`repairRgoScarcity`** (asil duzeltme): zar atildiktan sonra, asgarinin
   altinda kalan her stratejik RGO icin arazisi uygun ve turu bol olan kumeler
   devralinir. Secim tamamen deterministik (arazi uygunlugu → verici bollugu →
   kume merkezi). CLAUDE.md'deki cografya kuralinin ayni ruhu: dagilimi talep
   belirler, zar yalnizca yerini secer.
2. **`rgoPriceDrive`** (ikincil): gelisim hizi artik fiyat sinyalini okur —
   taban fiyatta 1.0 (eski davranis birebir), tavanda 2.5. Sermaye karli
   cikarima akar. `basePrice` piyasa durumuna eklendi ki provinces.js
   economy.js'i import etmesin (ters yon dongu olurdu).

**TEST** `node scripts/audit/supply-response-audit.mjs 520` (yeni).

**BEFORE / AFTER** (520 hafta)

| Olcum | Once | Sonra |
|---|---|---|
| Kalici tavan mali (>%50 hafta) | **10** | **6** |
| Kukurt | 1 kume, arz 0.2 / talep 7.1, 8.0x | **11 kume**, arz 12.1, listeden **cikti** |
| Gubre arzi | 0.1 | **9.4** |
| Cimento arzi | 13.6 | **22.9** |
| Muhimmat | %94.8 tavanda, 8.0x | **%76**, 5.7x, arz 6.4 / talep 6.7 |
| Komur fiyati | 25.79 (**6.4x**) | **3.44** |
| Ipek / Luks Kumas / Luks Mobilya / Tropik Agac | hepsi 8.0x | listeden **cikti** |

Determinizm korundu (`audit:determinism` temiz).

**REMAINING RISK** Zincir uyaninca iki ONCEDEN VAR OLAN muhasebe acigi denetim
esigini asti (`audit:factory` +2 HIGH): fabrika kari (haftada ¤1327.7) haneye
ya da hazineye hic akmiyor, ve 467 isci iki yerde birden sayiliyor. Bunlari bu
degisiklik YARATMADI — sanayiyi fiilen calistirarak GORUNUR yapti. P1-2 ile
ayni kok (POP gelir defteri). Bkz. REMAINING_OPEN_BETA_ISSUES.

---

## R-11 — Insaat kuyrugunda basa/sona tasima (P2)

**PLAYER EVIDENCE** Beta §7-1 **SEVERE**, §19-5. Bir kalemi 8'lik kuyrugun
basina almak ~20 tik; satirlar imlecin altinda yeniden numaralaniyor; testci
iki kez yanlis yapti ve bir keresinde yukseltmeye calistigi kalemi DUSURDU.

**FILES** `src/game/construction.js` (`moveConstructionTo`),
`src/ui/screens.js` (⤒ / ⤓ dugmeleri + isleyiciler).

**CHANGE** Tek tikla basa (⤒) ve sona (⤓). Tek adimlik ▲▼ korundu; kararin
kendisine (build power onceligi) dokunulmadi — beta onu acikca korumaya almisti.

**TEST** Canli tarayici: 4 projelik kuyrukta son kalem basa alindi
(`[13,14,15,16]` → `[16,13,14,15]`), sonra sona (`[13,14,15,16]`); kalem
kaybi yok. Bes dugme de 28px, dogru disabled durumlariyla ciziliyor.

---

## R-12 — Savas ilani oyunu durdurmuyordu (P2)

**PLAYER EVIDENCE** BUG-013. *"Draesh declared war on us!"* ile *"Clothing
Factory reached level 6"* ayni yiginda ayni bicimdeydi; testci savasta oldugunu
dakikalar sonra, baska bir ekranda beliren bir dugmeden anladi.

**ROOT CAUSE** `NOTIFY.WAR` zaten `ttl: 0` idi (kendiliğinden kapanmaz) ama bu
yetmiyordu: kart akista kayboluyordu. Sonucu olan olay ZAMANI durdurmali.

**FILES** `src/game/notifications.js`.

**CHANGE** Kart turune `halt` bayragi eklendi; `WAR` ve `CRISIS` icin true.
Yeni kart acilinca `game.setSpeed(0)`. Tekrar eden ayni anahtarli olay
duraklatmaz (oyuncuyu surekli kesmesin). Savas gunlugu zaten yalnizca oyuncu
taraf oldugunda yaziliyor, dolayisiyla YZ-YZ ilanlari oyunu durdurmaz.

**TEST** Canli tarayici: hiz 3'te kosuldu, 126. turda savas ilan edildi,
`clock.speed` **0**'a dustu.

---

## R-13 — Kucuk ama gorunur UI kusurlari (P3 toplu)

Hepsi canli tarayicida dogrulandi (seed BETA1836).

| Bug | Once | Sonra |
|---|---|---|
| BUG-001 sekme basligi | `HexWar` | **`Imperial Eye`** |
| BUG-004 yuvarlanmamis float | `power 14.06111111111111` | **`power 14.1`** |
| BUG-006 cogul eki | `1 cities` | **`1 city`** |
| BUG-023 Escape | hicbir sey yapmiyor | **acik paneli kapatiyor** |
| BUG-016 guc orani | `power ratio 0.18` | **`they are 5.5× our strength`** |

**BUG-023 notu:** `bindKeys` icinde `menu-open` muhafizi Escape'ten ONCE
donuyordu. Duzeltme sirayla calisir: once acik panel kapanir, panel yoksa
secim temizlenir (tersi olsaydi panel acikken Escape sessizce secimi silip
paneli birakirdi). Test sirasinda `newWorld()`'u programatik cagirmak
`menu-open` sinifini bayat birakiyor — gercek acilista menu onu kaldirir;
sinif elle temizlenince Escape beklendigi gibi calisti (`screen-open`
kalkti).

**BUG-016 notu:** matematik zaten dogruydu (`bizimGuc / onlarinGucu`); okunmaz
olan etiketti. Artik duz dil: *"we are 1.6× their strength"* /
*"they are 5.5× our strength"* / *"evenly matched"*. Diplomasi listesi ust
gezinme cubugunda YOK (haritada ulkeye tiklanarak aciliyor), bu yuzden panelin
kendisi gorsel olarak dogrulanamadi — modul yukleniyor ve eski etiket kaynakta
kalmadi.

---

## R-14 — Komur acigi: OLCULDU, DUZELTILMEDI (negatif sonuc)

**Neden kayda geciyor:** bir sonraki oturum ayni yanlis yola girmesin.

R-10'dan sonra urun haritasinda komur hala 8 katta kaliyordu. Iki hipotez
test edildi:

**H1 — "dunya olcegi buyudukce talep arzi asiyor".** *Curudu.* Uc harita
boyunda olculdu:

| harita | ulke | gida | komur | demir | hex/nufus |
|---|---|---|---|---|---|
| 78x62 | 29 | 0.78 | 0.25 | 0.61 | 176.5 |
| 110x70 | 38 | 0.97 | 0.27 | 0.91 | 179.0 |
| 160x96 | 66 | 0.99 | 0.28 | 0.99 | 182.0 |

Dunya orantili olcekleniyor (hex/nufus sabit); gida ve demir buyuk haritada
DAHA IYI. Sorun olcek degil, **komurun kendisi**.

**H2 — "komur taban ciktisi dusuk".** *Curudu.* `baseOutput` uc degerde
denendi (1560 hafta, urun haritasi):

| baseOutput | 1841 | 1846 | 1856 | 1866 |
|---|---|---|---|---|
| 0.288 (mevcut) | 1.6x / 0.55 | 8.0x / 0.33 | 8.0x / 0.09 | 8.0x / 0.10 |
| 0.5 | 0.3x / 0.61 | 8.0x / 0.41 | 8.0x / 0.27 | 8.0x / 0.21 |
| 0.8 | **0.1x** / 0.89 | 8.0x / 0.55 | 8.0x / 0.31 | 8.0x / 0.31 |

Sabit artis **iki ucu birden bozuyor**: erken oyunda komur fiyat TABANINA
duserek beta'nin en sevdigi anlardan birini (*"watching coal go to ¤32 and
understanding why"*) yok ediyor, gec oyunda ise 8 katı yine kurtaramiyor.

**Gercek sekil:** komur **dokuz** fabrika tipinin girdisi (celik, cimento,
cam, boya, makine parcasi, elektrik, sentetik yag, silah, vapur) ve sanayi
talebi BILESIK buyurken RGO arzi DOGRUSAL buyuyor (gelisim tavani 10,
seviye basina x0.18 → azami ~2.8 kat). Bu bir seviye uyumsuzlugu degil,
**buyume hizi uyumsuzlugu**.

**Sonuc:** degisiklik yapilmadi, `baseOutput` 0.288'de birakildi. Cozum
talep tarafinda (fabrika girdi oranlari / throughput olcegi) ya da bilesik
buyuyen bir arz mekanizmasinda. Bkz. REMAINING **P1-1b**.

---

## R-15 — Sanayi kari hicbir yere akmiyordu (P1)

**PROBLEM** Fabrika kari ne haneye ne hazineye ulasiyor; kar/zarar hicbir
seyi degistirmiyor.

**PLAYER EVIDENCE** `audit:factory` **HIGH**: *"haftalik 1327.7 altin kar
uretiliyor; hazineye 0, hane gelirine 0 gidiyor."* Beta tarafi: *"Scaling
from 30 to 223 factory levels HALVED my weekly factory income and no screen
explained why"* — kar bir sayiydi, sonucu yoktu.

**ROOT CAUSE** `fiscalBalance`:
```js
const incomePool = Math.max(1, baseOutputValue * 0.18 + industrialOutput * 0.22);
```
Sinif geliri **URETIM DEGERINDEN** turuyordu, **kardan degil**. Yani zarar
eden bir fabrika hane gelirine karli biri kadar katki yapiyordu; kar yalnizca
`privateCapital`e yazilan %8'lik pay disinda buharlasiyordu.

**FILES** `src/game/economy.js` (`PROFIT_TO_CAPITAL`, `fiscalBalance`).

**CHANGE** Kar sahibine gider: `factoryProfit * 0.5` **ust sinif** gelirine
eklenir. Ucret ciktiya bagli kalir (isci fabrikanin kar/zararina bakmaksizin
maasini alir — bu dogru); degisen yalnizca KAR. Zarar simetriktir: surekli
zarar eden sanayi ust sinifi yoksullastirir. Pay 1.0 degil 0.5, cunku karin
bir kismi zaten yeniden yatirim fonuna gidiyor — hepsini haneye de yazmak
ayni parayi iki kez saymak olurdu.

**TEST** `npm run audit:factory`, `npm run audit:population`.

**BEFORE / AFTER**

| Olcum | Once | Sonra |
|---|---|---|
| "Sanayi kari hicbir yere akmiyor" (factory HIGH) | **VAR** | **KAPANDI** |
| Hane butcesi / gelir orani (population HIGH) | **7.2x** | **3.0x** |

**REMAINING RISK** Zincirin geri kalani icin bkz. R-16 ve REMAINING **P1-2**.

---

## R-16 — Hane birikimi ve issizligin refaha etkisi (P1)

**PROBLEM** (i) Sinif her hafta sifirdan basliyor: iyi yillar kotu yillari
tasimiyor, kitlik bir birikimi eritmiyor. (ii) Memnuniyet istihdami hic
gormuyor.

**PLAYER EVIDENCE** `audit:population` **HIGH** x2:
- *"sinif nesnesinde savings/wealth alani yok — her hafta sifirdan baslar"*
- *"istihdam %73.5 → %64.0 degisti ama memnuniyet 0.68 → 0.65"*

Beta tarafi: issizlik 175K'ya cikarken oyuncu bunun hicbir sonucunu
hissetmedi.

**FILES** `src/game/economy.js` (`SAVINGS_*`, `UNEMPLOYMENT_MOOD`,
`unemploymentOf`, `populationDemand`).

**CHANGE — iki kenar:**

1. **Birikim stogu.** Acik once birikimden kapanir (haftada en fazla stogun
   %25'i), artan gelirin yarisi birikir, tavan yarim yillik sepet. Tavan sart:
   yoksa ust sinif sonsuz yastik biriktirip kitliga bagisik olurdu. Eski
   kayitlarda alan yok — `Number.isFinite` muhafazasi 0'a duser, sema gecisi
   gerekmiyor (`economy` butun halinde serilestiriliyor).
2. **Issizlik → memnuniyet.** Tam issizlikte alt sinif memnuniyetinden 0.22,
   orta siniftan yarisi duser. Ust sinifa **binmez**: sermayedar issiz kalmaz,
   tesisi zarar edince KARINDAN kaybeder (bkz. R-15). Oran `unemploymentOf`
   ile TEK kaynaktan okunur — istikrar dokumu ve hane memnuniyeti ayni sayiyi
   kullanir, yoksa ekrandaki "issizlik −6" ile hanenin hissettigi issizlik
   birbirini tutmazdi.

**TEST** `npm run audit:population`, `npm run audit:stability`, `audit:all`.

**BEFORE / AFTER**

| Olcum | R-15 sonrasi | R-16 sonrasi |
|---|---|---|
| `audit:population` YUKSEK | 4 | **2** |
| "POP birikimi yok" | VAR | **KAPANDI** |
| "Issizlik → hane refahi" | VAR | **KAPANDI** |
| Toplam YUKSEK (`audit:all`) | 6 | **4** |

**REMAINING RISK** Hane butcesi/gelir orani bu turda 2.7x → **4.3x**'e
cikti: issizlik memnuniyeti dusurunce sinif dengesi kayiyor ve gelir tarafi
buzusuyor. R-17 bunu geri aldi ve otesine gecti.

---

## R-17 — Hane butcesi gelire baglandi (P1)

**PROBLEM** `needsBudget` ile `income` bagimsiz iki formuldu; hane
kazandigindan kat kat fazlasini harcayabiliyordu ve sinif geliri pratikte
dekoratifti (yalnizca vergi matrahi).

**PLAYER EVIDENCE** `audit:population` **HIGH** x2: *"iki sayi birbirinden
BAGIMSIZ hesaplaniyor; en kotu sapma %2688.9"*, *"gecim butceleri toplami
gelirin 4.3 kati"*.

**FILES** `src/game/economy.js` (`INCOME_BUDGET_WEIGHT`, `populationDemand`).

**CHANGE** Butce, eski formul ile GECEN HAFTANIN net geliri arasinda
harmanlanir:
```js
needsBudget = formulaBudget * (1 - w) + netIncome * w
```
Gelir bir hafta gecikmelidir (`fiscalBalance` bu fonksiyondan SONRA kosar);
gecikme butun ulkeleri esit etkiler ve ayni kalip fabrika girdi
musaitliginde de kullaniliyor. Gelir henuz yoksa (ilk hafta) formule dusulur.

**KALIBRASYON — tam gecis FELAKET, olculdu** (urun haritasi, 780 hafta):

| w | butce/gelir | ihtiyac | aclik ceken ulke | dunya nufusu |
|---|---|---|---|---|
| 0.00 (eski) | 1.91 | %83.2 | 0/67 | 24.29M |
| **0.35 (secilen)** | **1.34** | **%86.1** | **0/67** | **24.44M** |
| 0.60 | 1.13 | %80.7 | 0/67 | 23.45M |
| 1.00 | 0.63 | **%51.4** | **32/67** | **19.66M** |

`w = 1.0` "dogru model"dir ama iki formulun olcekleri farkli oldugu icin ani
gecis aclik zincirini tetikliyor: dunyanin ucte biri aciga duşuyor ve nufus
24.3M → 19.7M cokuyor. 0.35 orani sikilastirirken ihtiyac karsilanmasini
**iyilestiriyor** (%83.2 → %86.1) ve nufusu hafifce artiriyor.

**TEST** `npm run audit:population`, `audit:all`.

**BEFORE / AFTER**

| Olcum | R-16 sonrasi | R-17 sonrasi |
|---|---|---|
| Gelir defteri sapmasi | %2688.9 | **%712.0** |
| Hane butcesi / gelir | 4.3x | **2.1x** |
| Dunya ihtiyac karsilanmasi | %83.2 | **%86.1** |

**REMAINING RISK** Iki bulgu hala denetim esiginin ustunde (%712 ve 2.1x) —
kapanmalari icin `w`'nin 1'e yaklasmasi gerekir, ama yukaridaki tablo bunun
mevcut olceklerle imkansiz oldugunu gosteriyor. Gercek cozum `w`'yi
buyutmek degil, **iki formulun olceklerini birbirine yaklastirmak**:
`CLASS_NEEDS_BUDGET` sepet olcegi ile `incomePool` katsayilari (0.18/0.22)
ayni birimde degil. Bir sonraki adim bu iki tabloyu tek olcege oturtmak;
o zaman `w` guvenle 1'e cikabilir. Bkz. REMAINING **P1-2**.

---

## R-18 — Okuryazarlik artik bir STOK (P1, teknolojinin temeli)

**PROBLEM** 62 yil egitim harcamasi okuryazarligi **dusurdu**.

**PLAYER EVIDENCE** BUG-019 / B-07. Oyuncu 1836'dan itibaren egitimi %40'ta
tuttu, ilk yil Okul Sistemi reformunu gecirdi; okuryazarlik **%24 (1837) →
%23 (1899)**. *"I made an early strategic decision, paid for it every week for
six decades, and it did nothing I could measure."*

**ROOT CAUSE** `census.js literacyOf` **stateless bir formuldu** ve dosyanin
kendi yorumu bunu soyluyordu:

> *"Simule edilen bir istatistik DEGILDIR — egitim butcesinin defterde bir
> karsiligi olsun diye turetilir."*

```js
base(sinif) * (0.55 + 0.75 * egitim%) + sehirlesme
```

Hicbir sey **birikmiyordu**. Egitim %40'ta sabit kalinca carpan da sabit
kaliyor, geriye yalnizca SINIF BILESIMI etkisi kaliyordu — ve sanayilesme
koyluyu dusuk okuryazarlikli isci sinifina tasidigi icin oran DUSUYORDU.
Yani oyuncu yanilmiyordu; sistem gercekten hicbir sey biriktirmiyordu.
Tuketicisi de yalnizca UI etiketleriydi.

**FILES** `src/game/economy.js` (`advanceLiteracy`, `LITERACY_APPROACH`,
haftalik cagri), `src/game/census.js` (`literacyOf`, `CLASS_LITERACY_REL`).

**CHANGE** Ulusal `economy.literacy` **stogu**: egitim harcamasi ve
universiteler bir HEDEF belirler, stok oraya yillar icinde yaklasir
(yarilanma ~14 yil). Kohort okuryazarligi artik stoktan turer — sinif yalnizca
GORELI konumu belirler (isci 0.42x, orta 1.35x, ust 1.9x), yani egitim
ORTALAMAYI yukseltir, siniflar arasi mesafeyi degil. Universite carpani butce
ekraninin uzun zamandir vaat ettigi cumleyi ilk kez dogru yapiyor: *"schools
qualify workers; universities amplify it."* Eski kayitlarda stok yok — tek
seferlik tahminle baslar, sema gecisi gerekmiyor.

**TEST** Bassiz, 3250 hafta (1836-1898), egitim kaydiraci sabit tutuldu.

**BEFORE / AFTER**

| egitim | 1851 | 1898 | stok |
|---|---|---|---|
| %0 | isci %2 · orta %8 | isci %3 · orta %11 | %7.8 |
| **%40** (beta ayari) | isci %8 · orta %26 | **isci %13 · orta %43** | %31.6 |
| %100 | isci %17 · orta %54 | isci %28 · orta %91 | %67.4 |

Beta'nin ayarinda (%40) okuryazarlik artik **duzenli yukseliyor**; onceki
davranista ayni kosuda DUSUYORDU.

**NEDEN SIMDI** Bu, teknoloji mekaniginin **yakiti**. Vic2'de arastirma puani
`4 x okuryazarlik%` ile baslar; stateless bir okuryazarlik uzerine arastirma
kurmak anlamsiz olurdu. Tasarimin tamami:
[TECHNOLOGY_GAMEPLAY_AUDIT.md](TECHNOLOGY_GAMEPLAY_AUDIT.md) "EK: UYGULAMA
TASARIMI".

**REMAINING RISK** Yaklasma hizi (`LITERACY_APPROACH = 0.001`) tek tohumda
denendi; teknoloji baglandiginda arastirma temposunu dogrudan belirleyecegi
icin dengeleme pasajinda yeniden olculmeli.

---

## R-19 — TEKNOLOJI MEKANIGI (yeni sistem)

**ISTEK** Vic2 tarzi teknoloji/arastirma katmani.
Kaynaklar: [Research & technology](https://vic2.paradoxwikis.com/Research_%26_technology),
[Technology guide](https://vic2.paradoxwikis.com/Technology_guide).

**FILES** `src/game/technology.js` (yeni), `src/game/economy.js`
(haftalik kosum + `factoryUnlocked` imzasi), `src/game/construction.js`
(`constructionPower` teknoloji carpani), `src/game/save.js` (`research`).

### Tasarimin cekirdegi — takvim ATILMADI

`availableFrom` zaten Vic2'nin **activation year**'idir. Onu silmek yerine
UST SINIR olarak biraktim:

```js
export function factoryUnlocked(typeId, turn, nation = null) {
  if (nation && techUnlocksFactory(nation, typeId)) return true;   // erken ac
  return (FACTORIES[typeId]?.availableFrom ?? 0) <= turn;          // takvim
}
```

- Arastiran ulke tesisi **yillar once** kurar → teknolojik ustunluk ilk kez
  mumkun.
- Arastirmayan ulke yil gelince yine acar → kimse kalici geride kalmaz.
- Beta'nin begendigi *"dunya kendi tarihini yaziyor"* hissi korunur.

`nation` varsayilan `null`: eski cagri yerleri degismeden calisir.

### Arastirma puani — Vic2 formulunun bizdeki karsiligi

```
RP = okuryazarlik x 4 + orta sinif x 1.5 + katip + ulusal rutbe
```

Katip payi Vic2'deki gibi **%50 okuryazarlik esigi** ister. Bu zincirin
calismasi R-18'e (okuryazarligin stok olmasi) bagliydi — stateless bir
okuryazarlik uzerine arastirma kurmak anlamsiz olurdu.

### Erken arastirma cezasi

Aktivasyon yilindan once arastirmak pahalidir (yilda +%12, tavan 4 kat).
Ceza olmasaydi 1836'da tank arastirilirdi; sonsuz olsaydi takvim yine tek
belirleyici olur ve oyuncunun karari yok olurdu.

### Icerik

**Industry kategorisi tam dolu** (5 klasor x 6 kademe = 30 teknoloji), her
biri gercek etkiyle: `rgoOutput`, `factoryThroughput`, `inputEfficiency`,
`constructionPower`, `supplyConsumption`, `researchRate` ve fabrika kilidi
acma (STEEL_MILL, MACHINE_PARTS, REFINERY, ELECTRIC_GEAR, SYNTHETIC_OIL,
AUTOMOBILE, TANK). Dolgu yok — beta raporu "+%2'lik dugmeler" istemedigini
acikca yazmisti.

Diger dort kategorinin **iskeleti hazir** (kategori + klasor adlari Vic2
ile birebir); icerik olculerek buyutulecek.

**TEST** Bassiz, 2600 hafta (1836-1886), egitim kaydiraci sabit.

**SONUC — egitim artik teknolojiye donusuyor**

| egitim | okuryazarlik | RP/hafta | 1886'da teknoloji | throughput | insaat |
|---|---|---|---|---|---|
| %0 | %8 | 1.55 | 11 | +%14 | +%22 |
| %40 | %31 | 2.46 | **14** | +%24 | +%22 |
| %100 | %65 | 4.52 | **18** | **+%48** | **+%36** |

**Teknolojik ayrisma ilk kez var:** 1886 dunyasinda en ileri ulke 16
teknoloji, medyan 13, en geri 12 (30 ulke).

**Kalibrasyon:** `TECH_BASE_COST` once 900 idi → 50 yilda yalnizca 4-7
teknoloji (teknoloji basina ~7 yil, cok yavas). 260'a cekildi.

**REGRESYON** `audit:all` **KRITIK 0 · YUKSEK 4** — degisiklik oncesiyle
ayni. Determinizm ve save/load temiz.

**KALAN**
1. **Ekran yok.** Sistem calisiyor ama oyuncu yon SECEMIYOR — YZ secimi
   (`pickResearchAI`, en ucuz) herkes icin kosuyor. Vic2 duzeninde ekran
   (5 sutun x 6 kademe + secili tekin etkileri) bir sonraki is.
2. **Uygulanan degistiriciler:** `unlock`, `researchRate`,
   `constructionPower`. `factoryThroughput`, `inputEfficiency`,
   `rgoOutput`, `supplyConsumption`, `morale` **hesaplaniyor ve saklaniyor
   ama henuz okunmuyor** — her biri tek satirlik bir kosum, ama her biri
   denge kaydirir, o yuzden dengeleme pasajinda tek tek olculerek baglanmali.
3. Kalan dort kategori (120 teknoloji).

### R-19b — Teknoloji ekrani (oyuncu ajansi)

R-19 sistemi kurdu ama oyuncu **yon secemiyordu**; `pickResearchAI` herkes
icin kosuyordu. Ekran o boslugu kapatir.

**FILES** `src/ui/technologyScreen.js` (yeni), `src/ui/screens.js`
(`render_technology` + tiklama isleyicileri), `index.html` (gezinme dugmesi),
`src/styles.css`.

**DUZEN** Vic2'nin kendisi: ust satirda arastirma ozeti, bes kategori cubugu
(ilerleme oranli), bes klasor sutunu x alti kademe merdiven, sagda secili
teknolojinin dosyasi ve **Start Research**.

**BUG-008 DERSI UYGULANDI.** Reform dugmesi 11 piksele dusmustu cunku `<li>`
grid'di ve tek cocuk buton ilk (11px) sutuna yerlesiyordu. Burada basamak
bilerek `display: block`, izgara BUTONUN kendisinde. Olculdu: Start Research
**220px**, merdiven butonlari satirin tamami.

**TEST** Canli tarayici, seed BETA1836, 1840:

| Kontrol | Sonuc |
|---|---|
| Gezinme dugmesi | var |
| Kategori cubugu | 5 (Industry 1/30 aktif, digerleri 0/30 devre disi) |
| Merdiven basamagi | 30 |
| Teknoloji secimi → dosya | *"Early Railways · 1836 · Construction power +10% · 260 RP · 184 wk"* |
| **Start Research oyuncu secimini uyguluyor** | `early_railways` → **`water_wheel_power`** |
| Konsol hatasi | yok |

Icerigi olmayan kategoriler `disabled` ve *"Not yet authored"* ipucu tasiyor —
bos sekmeyi hata sanmaktansa durumu soylemek dogru.

**KALAN** Ekrandaki "184 wk" erken oyunda (okuryazarlik %4) yavas. Arastirma
temposu dengeleme pasajinin kalemi; `TECH_BASE_COST` ve `LITERACY_APPROACH`
birlikte ayarlanmali.
