# SIRKETLER, KURESEL BORSA VE AUTO DEVRI — uygulama raporu

Iki bagli ozellik eklendi. Tasarim kurali tekti ve bu rapor onun etrafinda
yazildi:

> **Sirketler mevcut ekonomik faaliyete SAHIP verir. Borsa o sahipligeye bir
> piyasa verir. Yabanci sahiplik sermayeye STRATEJIK bir amac verir.**
> Pazar, fabrika simulasyonu, ozel yatirim, kapitalist geliri, ticaret,
> siyaset ve diplomasi yerinde durur; hicbiri paralel bir sistemle
> degistirilmedi.

---

## AUTO IMPLEMENTED

`src/game/delegation.js` — alan basina tek anahtar, doktrin agaci yok, esik
tablosu yok, otomasyon ayar sayfasi yok.

| Alan | Ekran | AUTO ON kimi cagirir | Kapisi |
|---|---|---|---|
| Budget | Budget | `adjustSocialAI` + `adjustFiscalAI` (vergi/sosyal/savas maliyesi) | `economy.js runEconomicAI` |
| Trade | Trade | `adjustFiscalAI` tarife dali | ayni |
| Construction | Construction | `planConstructionAI` + devlet sanayi yatirimi | `construction.js:773` |
| Research programme | Technology | `scoreProgrammes` + `adoptProgramme` | `economy.js beginEconomy` |
| Diplomacy | Diplomacy | `ai.js diplomacy()` + bekleyen baris tekliflerinin cevabi | `ai.js runDelegatedAI` |
| Recruitment | Military | `ai.js spend()` (alay siparisi, sehir kurma) | ayni |

**Ayri bir "oyuncu otomasyonu" YAZILMADI.** AUTO ON, YZ ulkelerinin
kullandigi fonksiyonun ta kendisini oyuncunun ulkesine baglar. Yazilsaydi iki
davranis sessizce ayrisir ve biri digerinden avantajli olurdu.

**Hile yok.** Cagrilan her fonksiyon ayni hazineyi (`nation.gold`), ayni yasa
tavanlarini (`fiscalPolicyLimits`), ayni insaat kapisini (`canBuildFactory`,
`canQueueInvestment`), ayni techizat ve antlasma kisitlarini kullanir.
Denetim K12 bunu olcer: 60 hafta devredilmis butce/ticaret boyunca tarife
yasal bandin disina cikmadi ve **haftada en fazla 2 puan** oynadi.

**Salinim freni yeniden icat edilmedi.** Mevcut YZ zaten surunerek hareket
ediyor: tarife haftada ±2, vergi ±5 ve yalniz "kasa bos / kasa dolu" bandinda.
Oyuncu tarifeyi %30'a kurup AUTO acarsa hukumet aylar icinde kendi doktrinine
kayar, bir haftada %80'e sicramaz. Ustune 4 haftalik bir isinma penceresi
(`DELEGATION_WARMUP`) kondu: devrin ilk haftasinda kriz dali tetiklenip her
kaldiraci ayni anda oynatmasin.

**AUTO OFF ANINDA gecerlidir.** Anahtar kapandigi hafta YZ cagrisi bir daha
kosmaz. K13: kapaliyken 30 hafta boyunca tek kaldirac oynamadi; acilip
kapatildiktan sonra oyuncunun elle kurdugu degerler 20 hafta korundu.

**Gorunurluk.** Alti ekranin ustunde tek satirlik bir serit: alan adi,
`AUTO ON/OFF` anahtari, bir cumlelik aciklama ve hukumetin **son anlamli
eylemi** gerekcesiyle:

> `Tariff 25% → 31%.` — *Treasury reserves were declining.*

Alan basina **tek** kayit tutulur, ayni eylem tekrar yazilmaz. Otomasyon
gunlugu degildir.

### Iki durustluk notu (isim ve yetki)

- Anahtarin adi **"Research programme"**, "Research" degil. Bos arastirma
  kuyrugunu programa gore doldurmak (`nextTechFor`) oyuncu icin AUTO'dan
  bagimsiz olarak zaten calisiyor (kor beta B-018'in cozumu). Devredilen tek
  sey sekiz yillik program ilanidir; "Research AUTO" demek kapaliyken hicbir
  seyin secilmedigi izlenimi verirdi.
- **Recruitment devri terhis yetkisi de verir.** `spend()` temerrutteki baris
  ordusunu kucultur ve oyuncunun elinde bir terhis dugmesi yok. Anahtarin
  aciklamasi bunu acikca yazar; sessizce vermek surpriz olurdu.

Devredilmeyenler: **yasa** (`reformAgenda`) ve **ordu komutasi**
(`manageCommand`). Ikisi de altı alanin disinda; komuta zaten kendi otomatik
anahtarlarini tasiyor (`command.js ensureCommandOptions`).

---

## COMPANY MODEL

`src/game/companies.js`. Kayit `nation.economy.companies[]` uzerinde durur —
`economy` zaten butun olarak kaydedildigi icin **ek kayit isi yok**.

```
{ id, name, home, sector, founded, factoryIds[],
  revenue, grossProfit, capitalReturn, profitAvg, dividend,
  employees, levels, cash, book, value,
  owners: { [nationId]: pay }, outputs: { [goodId]: miktar },
  history[], lastInvestment, lastSeizure, failingWeeks, defunct, frozen }
```

**Sinirli sayida sirket:** ulke basina en cok bes — dort sanayi sektoru
(Consumer / Heavy / Transport / Arms) ve bir madencilik. Binlerce mikro sirket
ne okunur ne yonetilir; olcek stratejiktir. 65 ulkelik bir dunyada olculen
toplam ~230 sirket.

**Kimlik deterministiktir:** `c{ulkeId}-{sektor}`. Sayac yok, zar yok — bu,
`audit:determinism`in kovaladigi hata sinifina bagisik.

**Varlik baglantisi TURETILIR,** saklanmaz: `ensureCompanies` her hafta canli
fabrikalari sektorlerine kovalar. Sahipsiz kalan kimlik yapisal olarak
imkansiz (K11). Varligi tukenen sirket kayittan **dusmez** — hissedari varsa
uykuda bekler, ulke o sektore yeniden fabrika kurunca ayni kimlik ve ayni
hissedarlarla canlanir. Sahiplik sessizce buharlasmaz.

**Kar UYDURULMAZ.** Iki kaynak da zaten var olan kanallardir:

| Sektor | Sahibin haftalik hakki |
|---|---|
| Sanayi | `Σ factory.profit × PROFIT_TO_CAPITAL (0.5)` |
| Madencilik | `cikarim degeri × INCOME_POOL_SHARE (0.35) × INCOME_WEIGHTS.upper (0.25)` |

Ikisi de bugun `economy.classes.upper` gelirine akan paylardir. Sirket
katmani yeni bir gelir kalemi acmaz, mevcut kapitalist getirisini
**sahiplendirir**.

**Degerleme gercek durumdan turer,** rastgelelikten degil:

```
hedef = max(defter × 0.25, defter × 0.45 + kazanc × 0.55) + kasa
deger += (hedef − deger) × 0.08        // ~8 haftalik yarim omur
```

`kazanc = profitAvg × 208` (dort yillik sahip getirisi, EMA ile duzlestirilmis).
Komur sirketi **komur karliligi bozuldugu icin** deger kaybeder;
`randomEvent = −%12` diye bir kanal yoktur. Buyuk alim fiyati iter
(derinlik cezasi), spekulasyon icin degil.

**Cokus.** Surekli zarar `failingWeeks` sayacini buyutur, deger hurda degerine
(`defter × 0.25`) dogru erir, temettu kesilir. Genisleme kendiliginden durur:
kasa bosalir ve `investmentOptions` zaten marji negatif turleri elemektedir.

---

## STOCK EXCHANGE

Kuresel tek bir borsa. Sirketler ulkelere aittir, hisseleri yasalar izin
verdigi olcude uluslararasi dolasir. **Gunluk alim-satim simulatoru degildir:**
opsiyon, aciga satis, kaldirac, marjin, gun ici fiyat, mum grafigi ve
spekulasyon mini-oyunu **yoktur**. Borsa sahiplik, temettu, yabanci nufuz,
stratejik erisim ve sermaye akisi icin vardir.

**Alim para KORUR.** Alicinin hazinesinden cikan, ev sahibi ulkenin yurt ici
sermaye havuzuna (`politics.privateCapital`) girer. **Sirketin kasasina tek
kurus girmez** — girseydi ayni para hem saticida hem sirkette olurdu. Olculdu
(K2 ve tarayici dumani): alici −¤15.528, satici havuzu +¤15.528, dunya serveti
degisimi 0.

**Surtunme gercektir ama minik degildir:**

- kurucu blok (%55) hicbir zaman satilik degil,
- haftada sirket basina en cok **%5**,
- alis/satis makasi %2 (karsi tarafa gider, batak degil),
- buyuk alim fiyati yukari iter,
- **satista likidite sinirli**: ev sahibinin sermaye havuzu ne kadar
  odeyebiliyorsa o kadar hisse cikar. Pozisyonu bir haftada bosaltmak yok.

**Kapali dugme birakilmadi.** Alim engelliyse ekran sebebini yazar: tavan mi
doldu, ulke kapali mi, bu hafta arz mi yok, yoksa hazine mi yetmiyor
(`The treasury holds ¤41 — the smallest parcel costs ¤78`).

---

## FOREIGN OWNERSHIP

**Paylar her zaman %100 eder.** `yurt ici hissedarlar = 1 − Σ ortaklar`, yani
toplam yapisal olarak korunur (K1: en kotu sapma 1.1e-16).

**Tavan ayri bir yasa DEGILDIR** — mevcut siyasetten turer. Iktidar
partisinin ekonomi ve ticaret politikasi rejimi belirler:

| Ekonomi politikasi | Serbest ticaret | Korumacilik |
|---|---|---|
| laissez-faire | **Open** (×1.00) | Restricted (×0.65) |
| interventionism | Restricted (×0.65) | **Protected** (×0.35) |
| state capitalism | Restricted (×0.65) | **Protected** (×0.35) |
| planned economy | **Closed** (×0) | Closed (×0) |

Sektor tavani stratejik hassasiyete gore: tuketim %49, agir sanayi %35,
madencilik %30, tasima %20, **silah %10**. Nihai tavan = sektor × rejim ×
yatirim guveni.

Boylece **Ornek C kendiliginden calisir**: milliyetci/korumaci bir hukumet
secilince tavan duser ve tavani asan yabanci pay **zorla ve yavasca** elden
cikarilir (haftada 1 puan, piyasa degerinden, havuzun odeyebildigi kadar).
Bir gecede musadere degil, kapinin kapanmasidir.

**Para tek basina tavani asamaz.** K6: alicinin hazinesine ¤500.000 verildi ve
60 alim denemesi yapildi — hicbir sirkette tavan asilmadi.

---

## DIVIDENDS

Temettu **gercek kardan** gelir ve **transferdir**:

```
dagitilabilir = max(0, capitalReturn) × PAYOUT_RATIO (0.65)
ortak n alir  = dagitilabilir × pay[n]      → n.gold
ev sahibi ust sinif kaybeder = TAM O KADAR  → economy.capitalWithheld
```

`fiscalBalance` ust sinif gelirinden `capitalWithheld`i duser. Odenen tutar,
haftanin **gercek** ust sinif sermaye gelirini asamaz (asarsa kirpilir).
Karin tamami temettuye donmez: kalan %35 dagitilmamis kar olarak yurt ici
hissedarda kalir, dolayisiyla kimsenin gelirinden dusulmez.

Olculdu (K3): odenen ¤21.5 / alinan ¤21.5 — **sapma 0.00**. `ledger-audit` L1
kimligi bu terimi tasiyacak sekilde guncellendi; hala %0.00 sapmayla geciyor.

**Yeniden yatirim ikinci bir sermaye ekonomisi kurmaz.** Mevcut
`PROFIT_TO_REINVEST` (0.08) akisi artik sahibi sirketin kasasina gider ve o
sirketin **kendi santiyesini** fonlar; ulusal havuza giden pay tam o kadar
azalir (`economy.reinvestToCompanies` olarak beyan edilir). Karli sirket
kendi buyumesini kendi finanse eder, zarar eden ulusal havuzda sira bekler —
toplam akis degismeden.

---

## PREFERENTIAL ACCESS

**Kritik kural uygulandi: sahiplik bedava mal VERMEZ.** Yabanci demir
sirketinin %30'una sahip olmak %30 demir demek degildir.

Sahiplik yalnizca **sirada oncelik** verir:

```
oncelik agirligi = pay × 0.35, mal basina en cok 0.20
```

Kanca `settleGlobalTrade` icindedir ve **ayni ticaret hacminin yeniden
dagitimidir**. Uc kilit garanti:

1. `crossBorderTrade = min(toplamFazla, toplamTeklif)` **agirliksiz** teklif
   toplamindan hesaplanir — ayricaliklinin fazladan aldigi, digerlerinin
   alamadigidir.
2. **Iki gecisli su-doldurma**: birinci gecis kimsenin kendi teklifini
   asmasina izin vermez, kirpilan artik ikinci gecise gecer ve
   `Σtahsis === crossBorderTrade` **tam** kapanir.
3. Herkes ayni `priceOf(world, id)` fiyatini oder. Ayricalik **sirada
   ondelik**, indirim degil.

> Bu ikinci gecis bir denetim bulgusunun sonucudur. Tek gecisli ilk yazim
> kirpilan artigi bosluga birakiyordu; `Σithalat < Σihracat` kaliyor ve fark
> dis hesap kapanisi (`trade.settlement`) uzerinden hazinelere **net pozitif**
> dagiliyordu — yani sifirdan para. K5 yakaladi, iki gecis kapatti. Kirpma da
> ikinci gecis de kaldirilmamalidir.

Ayni oncelik stratejik techizat kuyrugunda da gecerlidir
(`procureStrategicGoods`): ortagi oldugu sirketin malindan haftalik parcasini
daha buyuk cekebilir, ama havuz degismez ve bedel yine tam fiyat + gumruktur.

Ayricalik yokken kod yolu **kapali** kalir (`world.market.hasPriority`), yani
sirketsiz bir dunyada davranis bit bit eskisiyle ayni ve ek maliyet sifirdir.

---

## WAR / NATIONALIZATION

**Savas.** Dusman ulkeyle olan pozisyon **silinmez** — donar:

- temettu odenmez (para yurt ici hissedarda kalir, kimseden alinmaz),
- oncelikli erisim **tam olarak sifir** katki verir,
- yeni alim/satim kapalidir.

Baris imzalandigi hafta akis kendiliginden geri baslar; ayri bir "coz" eylemi
yoktur. Olculdu (K7): savasta pozisyon elde kaldi, temettu durdu, dusman
sirketin oncelik katkisi tam olarak sifirdi.

**Kamulastirma** uc kademelidir ve bedeli **mevcut kanaldan** odenir:

| Kademe | Odeme | Sohret | Yatirim guveni |
|---|---|---|---|
| Compensated | tam piyasa degeri | +1 | −0.05 |
| Partial | %40 | +5 | −0.22 |
| Seizure | yok | **+12** | −0.45 |

Uydurma bir "yabanci sahiplik %30 → istikrar −10" modifieri **eklenmedi**.
Dunyanin tepkisini tasiyan kanal zaten **sohrettir** (infamy → koalisyon
esigi 22); tazminatsiz el koyma tek basina bir sehir fethi kadar sohret yakar.
Ustune magdurun **diplomatik hafizasina** kalici bir kayit dusulur
(`industry_seized_by`) ve ulkenin yatirim guveni coker — tavan yillarca duser,
yabanci sermaye geri gelmez. Guven zamanla erir; yasak kalici degil, hafizasi
uzundur.

Hazine tazminati karsilayamiyorsa o kademe **secilemez**; para korunur
(K6: dunya serveti degisimi 0, sohret 4.58 → 16.58).

---

## AI

**Yabanci yatirim YZ'si kasitla sade ve YAPISKAN.** Uc ayda bir bakar, tek bir
kucuk dilim (≤%3) alir, kendiliginden **hicbir zaman satmaz** — satisi yalnizca
tavan zorlar. Portfoy calkalama diye bir davranis yoktur.

Sartlar: hazine ≥ ¤620, borcsuz, temerrutsuz. Skor uc gercek girdiden:

- **bagimlilik** — o sirketin urettigi mallardan hangisi bize eksik
  (kendi `goodsFlow.shortage`imiz; uydurma stratejik mal listesi yok),
- **getiri** — gercek temettu / gercek deger,
- **risk** — gecmis savas sayaci ve rakiplik.

**Devir anahtarlari finansal yatirimi KAPSAMAZ.** Diplomacy AUTO ON hisse alip
satmaz; sirket yatirimi oyuncunun elinde kalir.

**Ozel yatirim sirketlere ATFEDILIR,** ikinci bir ozel yatirim ekonomisi
kurulmaz. Karar mekanizmasi aynen `runPrivateSector`dir; degisen sey haberin
yuzudur:

> ~~"Private investors built a Steel Mill"~~
> **"Aldemar Steel Union opened a Steel Mill in Torford."**

---

## UI

**Yeni ust duzey ekran: Companies & Exchange** (sekme cubugunda `Exchange`).
Gorsel dil mevcut tasarim sisteminin ta kendisi — komur siyahi yuzey,
mat pirinc ayrac, kirik beyaz metin, serif baslik, defter tablosu. Yeni ham
renk **eklenmedi**; her sey token'dan geliyor. Robinhood/kripto estetigi,
neon, dev yuvarlak kart yok.

**Kotasyon defteri** (siralanabilir 10 sutun): Company · Home · Sector ·
Market value · Profit/wk · Yield · Foreign · Ours · Employees · Trend.
Filtreler: butun kayitlar / bizim payimiz / yabanci payli / karli /
stratejik mal / yurt ici, arti ulke ve sektor secicileri.

**Sirket dosyasi** sorularin hepsini yanitlar: neye sahip, nerede isliyor, ne
uretiyor, ne kadar karli, **hangi girdi onu tehdit ediyor**, kim sahip, ne
kadari yabanci, ne kadari bizim, ne temettu odiyor, ayricalikli erisimimiz var
mi, son yatirimi ne. Sahiplik cubugu paylarin %100 ettigini gozle gosterir.

**Uydurma sutun yok.** Sirket borcu bu mimaride mevcut olmadigi icin borc
sutunu hic konmadi.

**Ulke paneline** sikistirilmis bir maliye blogu eklendi: yatirim rejimi,
sanayisinin yabanciya ait orani, disaridaki varliklari, en buyuk sirketleri
(tiklanabilir — dogrudan borsa dosyasini acar) ve en buyuk yabanci
yatirimcilari. Panel sismanlatilmadi; amac kesif.

---

## DOGRULAMA

Yeni denetim: `npm run audit:companies` (`run-all`e de kayitli).
**13 degismezin hepsi geciyor.**

| # | Degismez | Sonuc |
|---|---|---|
| K1 | paylar her zaman %100 eder | sapma 1.1e-16 |
| K2 | hisse alimi para korur | dunya serveti Δ=0; sirket kasasi degismedi |
| K3 | temettu gercek kardan, para korur | odenen = alinan, sapma 0.00 |
| K4 | sahiplik bedava mal vermez | ithalat ≤ ihracat ve ≤ talep |
| K5 | ayricalikli alici da tam fiyat oder | Σithalat = Σihracat, net kapanis 0 |
| K6 | yabanci sahiplik tavanlari tutar | ¤500k ile 60 denemede ihlal yok |
| K7 | savas temettuyu ve onceligi keser | oncelik katkisi tam sifir, pozisyon duruyor |
| K8 | kayit/yukleme sirketleri korur | 91 sirket, 12 pozisyon, AUTO anahtarlari birebir |
| K9 | determinizm | 60 hafta, iki ayri surec, parmak izi ayni |
| K10 | ozel yatirim calisiyor | 60 haftada 78 yeni tesis, 88 proje sirkete yazili |
| K11 | genisleme fabrika cogaltmaz | ayni tesis iki sirkette degil, sahipsiz tesis yok |
| K12 | AUTO ON yasal sinirlarda | banttan cikma yok, haftalik adim ≤ 2 puan |
| K13 | AUTO OFF elle kontrolu geri verir | 30 hafta hicbir kaldirac oynamadi |

`audit:ledger` (%0.00 sapma), `audit:save` ve `audit:determinism` de temiz.
Determinizm parmak izine (`fingerprint.mjs`) sirket degeri, kasa, sahiplik ve
AUTO anahtarlari **eklendi** — eklenmeseydi yesil bir determinizm kosusu bu
katman icin hicbir sey kanitlamayacakti.

**Tarayici dumani** (Chromium, tek kosu, 240 hafta ileri sarilmis dunya):
borsa acildi (230 kayit) → sirket incelendi → **gercek dugmeyle** kucuk bir
yabanci pay alindi (hazine −¤15.528, satici havuzu +¤15.528, sirket kasasi
degismedi) → 12 hafta sonra temettu defterde gorundu (¤0.0517/hafta) ve
sirketin **kendi mallarinda** oncelik olustu → "bizim payimiz" filtresi calisti
→ Budget AUTO acildi/kapandi → kaydedildi → sayfa yeniden yuklendi → kayit
acildi: pay, AUTO anahtari ve sirket sayisi birebir dondu. Sayfa hatasi yok
(tek 404 `favicon.ico`, degistirilmemis kodda da var).

---

## YOL USTUNDE KAPANAN MEVCUT HATALAR

Bunlarin hicbiri bu ozelligin hatasi degildi; denetimi yazarken ortaya
ciktilar ve kucuk olduklari icin kapatildilar.

1. **`emit` cokusu (TARAYICI-OLUMCUL).** `game.js` bilinmeyen olay adinda
   `throw` eder ve denetim tezgahi `emit(){}` ile susturur — yani hicbir
   denetim bunu yakalayamazdi. `'companies'` ve `'delegation'` olay listesine
   eklendi.
2. **Yasa sayaclari kaydet/yukle'yi dallandiriyordu.** `refreshReformModifiers`
   *yan etkili* bir "hesapla" fonksiyonuydu (`reformCooldown`/`reformFatigue`
   azaltiyordu) ve `enactReform` onu **kayda girmeyen bir WeakMap'e** gore
   kosulla cagiriyordu. Kesintisiz kosuda yasa cikaran ulke o hafta iki kez,
   yuklenmis kosuda bir kez eriyordu. Erime `decayReformCounters` olarak
   ayrildi ve haftalik fazdan **kosulsuz** cagriliyor.
3. **Birim kimlik sayaci ve yeniden-yol sayaci kayda girmiyordu.**
   `unitIdCursor()` ve `unit.reroutes` artik kaydediliyor.
4. **Para KAYBEDEN tavan.** `politics.privateCapital` tavani
   `min(1200, havuz + akis)` seklindeydi ve havuz tavani astiginda farki yok
   ediyordu. Hisse satisi buyuk ve ani bir girdi oldugu icin bu yol artik sik
   kullaniliyor. Iki yazim yeri de tavani **yalniz akisa** uygular; havuz
   ≤1200 iken iki yazim birebir ayni sonucu verir.

---

## COZULMEMIS (mevcut borc — bu ozellikten ONCE de vardi)

1. **Kaydet/yukle bes tohumun dordunde hala dallaniyor.** `SAVE-1` temiz,
   `CO-8 / CO-9 / CO-A / CO-B` degil. **Degistirilmemis HEAD kodunda ayni
   sekilde dallaniyor** — olculdu, izole sureclerle. Kalan sebep
   lokalize edildi: `general.front` **bilerek kaydedilmiyor** ("sinirdan
   turetilir"), ama yuklemeden sonraki ilk hafta mevki dagitimi kesintisiz
   kosudan farkli cikiyor; bir kara tumeni bir hafta erken/gec denize biniyor
   ve haftalik konvoy tedariki (~¤27-36) kayiyor. Buradan butun ekonomi
   ayriliyor. Cephe/mevki katmanini kaydetmek savas davranisini etkileyen
   gercek bir degisiklik oldugu icin bu gecise alinmadi.
   *Bu yuzden K9 tabani temiz olan `SAVE-1` tohumunda kosar — baskasinin
   hatasini bu denetime yazmamak icin.*
2. **Fabrikalar fetihte el degistirmiyor.** Hicbir kod `economy.factories`i
   yeni sahibine devretmiyor ve `runFactories`in sahiplik kontrolu yok. Sonuc:
   dusman toprakta kalan tesis uretmeye ve temettu odemeye devam eder — yani
   "hisseyi al, topragi kaybet, temettuyu koru" bugun mumkun. Mevcut bir
   davranis; sirket katmani onu **gorunur** kildi.
3. **Sirket borcu yok.** Mimaride sirket bazli borc/iflas yok; sahte bir borc
   sutunu koymak yerine alan hic eklenmedi. Cokus bugun deger erimesi,
   temettunun kesilmesi ve genislemenin durmasi olarak isliyor.
4. **Cok uluslu sirket yok.** Sirketler yalniz kendi ulkelerinde varlik tutar.
   Sinir otesi dogrudan yatirim ekonomiyi yeniden yazmayi gerektirdigi icin
   kasitla disarida birakildi; sahiplik zaten uluslararasi.
5. **Pozisyon kurmak tikliyor.** Haftalik %5 sinir bilincli bir surtunmedir
   (gorev: "buyuk pozisyonlar aninda ve bedelsiz tasinmasin") ama tam bir
   pozisyon ~11 hafta tik ister. Finansal yatirimin devri gorev geregi
   **kasitla** eklenmedi; ihtiyac olursa yedinci bir AUTO alani yerine
   "duran emir" daha dogru cozum olur.
6. **Bildirim yigini borsanin sag panelini ortuyor.** Mevcut z-duzeni sorunu;
   Trade ekraninda da ayni (detay paneli sagda). Bildirimler kendiliginden
   kapandigi icin kalici degil.
