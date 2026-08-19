# ILETISIM GECISI — KAPANIS RAPORU

**Hukum:** *"GOOD SIMULATION, SILENT GAME"* artik gecerli degil. Simulasyon
degismedi; anlatmaya basladi.

Bu belge brief'in 25 sorusunu sirasiyla yanitlar. Her yanit ya bir dosya/satir
ya da bir olcume dayanir; hicbiri niyet beyani degildir.

Ayrintili defterler: `COMMUNICATION_PASS_LOG.md` ·
`PRIVATE_INVESTMENT_DEADLOCK_REPORT.md` · `EVENT_COMMUNICATION_SYSTEM.md` ·
`UI_TRUTH_FIXES.md` · `NATIONAL_CHRONICLE_REPORT.md` ·
`CAMPAIGN_ENDING_REPORT.md` · `COMMUNICATION_BROWSER_VALIDATION.md` ·
`REMAINING_PRESENTATION_DEBT.md`.

---

## A. OZEL SEKTOR (P0)

### 1. Ozel yatirim kilitlenmesi duzeldi mi?

**EVET.** Kok neden tek bir hata degil, birbirine gecmis dort dislidir:

1. `autoUpgradeFactory` sinirsiz UPGRADE projesi kuyrukluyordu,
2. `runPrivateSector` kapisi (`openPrivate >= 2`) bu durmus projeleri de
   sayiyordu,
3. `fundPrivateProjects` **kuyruk sirasiyla** fonluyordu; bastaki ¤218'lik
   proje haftalik ¤0.17 sermayeyle arkasindaki her seyi ac birakiyordu,
4. hedefi silinmis (orphan) proje kuyrukta sonsuza kadar yasiyordu.

Duzeltme (yalniz `src/game/economy.js`): uyku hali (`dormant`, 52 hafta
fonlamasiz), kuyruk tavani (6), **bitmeye-kalan sirasiyla** fonlama, gecersiz
projelerin iadeyle temizlenmesi, `supportProject`in projeyi uyandirmasi.

| Olcum | ONCE | SONRA |
|---|---|---|
| A-G senaryolari | 5 gecti / **2 kaldi** (C, D) | **7 gecti / 0 kaldi** |
| PRIV1 tesis (60 yil) | 6 → 14 | 6 → **32** |
| PRIV2 tesis (60 yil) | 7 → 25 | 7 → **36** |
| kilitli hafta (3 tohum) | var | **0** |
| dunya sanayisi (60 yil) | 905 | **995** |
| `npm run audit:private` | — | **0 bulgu** |

### 2. Durmus bir proje ozel ekonomiyi hala sonsuza kadar tikayabilir mi?

**HAYIR** — ve bu ucuncu bir korumayla garanti altinda:

- **Uyku:** 52 hafta fonlanmayan proje `dormant` isaretlenir ve **aktif
  kapisini tutmaz**. Kapi `PRIVATE_ACTIVE_LIMIT = 2` uyanik projeyi sayar.
- **Tavan:** kuyruk `PRIVATE_QUEUE_LIMIT = 6`'da durur; `autoUpgradeFactory`
  bu tavanda ozel aktore proje ekleyemez.
- **Temizlik:** `dropInvalidProjects` her hafta hedefi kaybolmus veya bilinmeyen
  tipteki projeyi siler ve **odenmis parayi iade eder** (once `privateCapital`,
  yoksa `nation.gold`).

Sonuc: pahali bir proje artik yalniz *kendini* geciktirir, kuyrugu degil —
fonlama sirasi "bitmeye en az kalan" oldugu icin kucuk projeler once kapanir
ve kapi dolasimda kalir.

---

## B. OLAY ILETISIMI

### 3. Artik oyuncuya hangi buyuk olaylar bildiriliyor?

Haftalik **gecis taramasi** (`src/game/events.js`, `runNationalEvents`,
yalniz oyuncu ulkesi) su durum degisimlerini yakalar:

| Olay | Tier | Tetik |
|---|---|---|
| The treasury borrows | 2 MAJOR | borc esigi asildi (`DEBT_FLOOR = 120` **ve** aylik gelirin ustu) |
| Credit is running out | 2 MAJOR | borc/kapasite `DEBT_CRITICAL = 0.75` |
| The state defaults | **3 EXISTENTIAL** | `defaultedGold > 0` |
| The debt is cleared | 2 MAJOR | borcsuz duruma donus |
| `<eski> → <yeni>` rejim | 2 MAJOR | `governmentType` bicim degisimi |
| `<baskent>` is occupied | 2 MAJOR | baskent hex'i dusman kontrolunde |
| `<baskent>` is lost | **3 EXISTENTIAL** | baskent hex'inin **sahibi** degisti |
| `<baskent>` is recovered | 2 MAJOR | geri alindi |
| The army is gone | **3 EXISTENTIAL** | butun alaylar yok |
| The army is broken | 2 MAJOR | tek haftada ordunun ≥%34'u (en az 3 alay) |
| N regiments destroyed | 1 IMPORTANT | esigin altinda kayip |

Buna ek olarak mevcut bildirimler kademelendi: savas ilani (2, durdurur),
baris (2), fetih (2), hegemonya (2), kriz (2, durdurur), arastirma (1),
muharebe/insaat/sanayi (0).

Baris ayrica **ozetlenir**: `signPeace` artik oyuncunun tarafindan kac eyalet
alindigini/verildigini ve hangi maddelerin gectigini yazar; beyaz baris acikca
soylenir (`src/game/peace.js`).

### 4. Hangi olaylar oyunu durdurur?

**Kural:** `halt = meta.halt ?? (kind.halt || tier >= 3)`.

- **Her zaman:** tier 3 (temerrut, baskent kaybi, ordunun yok olusu).
- **Tur geregi:** `WAR` (savas ilani) ve `CRISIS`.
- **Ve yalniz YENI kart icin** — `NotificationCenter.push` `meta.key` ile
  tekilleştirir; ayni kart tekrar gelirse zaman durmaz.

Tier 2'nin **cogu durdurmaz.** Bilerek: "buyuk" demek "kesintili" demek degil.
Olculen kesinti orani yilda **0.1**; tarayicida 10 yilda **3**.

### 5. Hangi olaylar yalniz toast?

Tier 0 ve 1'in tamami: muharebe raporlari, fabrika/insaat bitisi, subay
atamasi, sehir kurulusu, diplomasi satirlari, esik alti alay kayiplari.
Bunlar 8-14 saniye durur ve kaybolur; **vakayinameye girmezler**.

Iki istisna kalicidir ama durdurmaz: `RESEARCH` ve `PEACE` (`ttl: 0`) —
hiz 8'de gozden kacmasinlar diye.

### 6. Bildirim spami nasil engelleniyor?

Dort bagimsiz fren:

1. **Durum makinesi** — olay degeri degil **gecisi** izler. Borc her hafta
   degil, faz degistiginde konusur (`clear → indebted → critical → default`).
   Ilk gozlem `null`/`-1` nobetleriyle **BASELINE** sayilir, olay degil.
2. **Anlamli esik** — `minor` borc fazi tamamen sessizdir. Bir onceki olcumde
   olay ¤7'lik bir kasa acigi icin ates ediyordu; simdi `DEBT_FLOOR = 120`
   **ve** aylik gelir sarti var.
3. **Sogutma** — `REPEAT_COOLDOWN = 156` hafta. Hukumet bicimi icin
   **hedefe ozel** anahtar (`regime:${form}`) ve `REGIME_COOLDOWN = 520`.
4. **Tekilleştirme** — `meta.key` ile ayni kart yigilmaz; vakayiname ayni
   hafta ayni basligi iki kez yazmaz.

Olculen sonuc (`npm run audit:events`, 3 tohum × 50 yil):

| tohum | ambient/yil | ulusal/yil | durdurma/yil | vakayiname |
|---|---|---|---|---|
| COMM1 | 22.9 | 0.1 | 0.1 | 5 |
| COMM2 | 27.1 | 0.1 | 0.1 | 7 |
| COMM3 | 26.7 | 0.2 | 0.1 | 8 |

Ayni baslik yuzyilda en cok **4** kez. `audit:events` **0 bulgu**.

> Yol boyunca duzeltilen iki gercek spam: "The state defaults" yuzyilda 5 kez
> (durum makinesi eksikti) ve rejim etiketi yuzyilda **13** kez (yillik
> secimler `governmentType`i salliyordu). Ikincisi genel sogutmayla 6'ya, hedefe
> ozel sogutmayla **4**'e indi.

---

## C. UI DOGRULUGU

### 7. Parti kaydirac sinirlari oyuncu dokunmadan once gorunuyor mu?

**EVET.** Bantli her kaydiracin altinda gercek parti adiyla tek satir:

```
National Conservative Party allows 25–100%
```

Iki askeri kalemde ve tarife satirinda; `src/ui/screens.js` `bandNote()`.
Motor zaten bu araligin disina cikmiyordu — **eksik olan gerekceydi**.

### 8. Herhangi bir mali kaydirac hala sessizce geri sicriyor mu?

**HAYIR.** Bu soru zaten yanlis bir tesise dayaniyordu: Kor Beta #2'nin
"egitim butcesi %30'da kilitli" bulgusu **test suruculerinin hatasiydi**
(`input` yayilip `change` yayilmiyordu). Gercek isaretciyle dogrulandi:

| An | Kaydirac | Yanindaki rakam | Oyun durumu |
|---|---|---|---|
| surukleme ortasi | 45 | 45% | — |
| birakildiktan sonra | 45 | 45% | **45** |
| 2 hafta sonra | 45 | 45% | **45** |

20 yillik insan benzeri oyunda egitim **35'te 20 yil boyunca kaldi**.

Duzeltilen gercek kusur: canli etiket seciciydi. `input.closest('.ledger-mid')
?.querySelector('.ledger-label b')` olmadan rakam surukleme boyunca 0'da
donuyordu — bu, "kaydirac calismiyor" hissinin asil kaynagiydi.

### 9. "Projected Weekly Balance" artik dogru mu?

**Artik oyle bir sey yok.** Etiket yalan soyluyordu: gosterilen sayi bir
tahmin degil, **kapanmis gecen haftanin defteriydi**. Etiket gercege
uyduruldu (formul degil):

```
Last week's balance
closed accounts, not a forecast
```

### 10. Okuryazarlik tutarli gosteriliyor mu?

**EVET.** Iki ekran ayni kelimeyle iki farkli seyi soyluyordu:

| Ekran | ONCE | SONRA | Anlami |
|---|---|---|---|
| Technology | `Literacy` | **National literacy** | ulusal oran (%) |
| Population | `Literacy` | **Literate pops** | okuryazar POP sayisi |

Technology satirina aciklayici `title` eklendi.

### 11. Province/hex terminolojisi tutarli mi?

**EVET** — `src/ui/screens.js`'te hex sayan uc etiket `provinces` diyordu;
`hexes` olarak duzeltildi (satirlar ~452, ~693, ~1949). Kampanya sonu ekrani da
`TERRITORY … hexes` der.

**Kalan:** muharebe raporlari hala ham koordinat basiyor ("engaged at 27, 23") —
Beta #1'den beri **degismedi**, bkz. `REMAINING_PRESENTATION_DEBT.md` §10.

### 12. Istikrar aciklamasi kesfedilebilir mi?

**EVET.** HUD'daki istikrar hucresi artik `role="button" tabindex="0"`;
**tiklama ve klavye** ile dokum acilir (hover tooltip ikincil yol olarak
duruyor — dokunmatikte hover yoktur):

```
Household satisfaction  +53.9
Unemployment            −11.0  (5,000 without work)
= Stability             42.9%
```

### 13. Arastirma bitisi hiz 8'de kacirilabilir mi?

**HAYIR.** Kart artik **kalici** (`ttl: 0`) — ama **durdurmaz**; bir sonraki
teknoloji secilene kadar ekranda kalir. Ayrica ETA'daki yalan duzeldi: tahmin
**birikmis puani dusuyor** (`Math.max(0, Math.ceil((cost - research.points) /
view.rate))`), eskiden hep sifirdan hesapliyordu.

---

## D. BUYUK TARIHI ANLAR

### 14. Borc gorunur mu?

**EVET** — iki asamali: `The treasury borrows` (tier 2) ve
`Credit is running out` (tier 2, borc kapasitenin %75'ini gectiginde).
Govde gercek rakamlari tasir: `Debt ¤2,888 · weekly +¤55 · interest ¤0/wk`.

Beta #2'de oyuncu ¤1325 borca **sessizce** girmisti; `settleDebt`in
`borrowedGold` alanini okuyan **hicbir UI tuketicisi yoktu**.

### 15. Temerrudu kacirmak mumkun mu?

**HAYIR.** Tier 3 → kart `notify-existential` sinifiyla cizilir (serif baslik,
pirinc cerceve), **zaman durur**, kayit vakayinameye dusar. Tarayicida gercek
mekanikle tetiklendi ve dogrulandi (`shot-debt.png`):

> **The state defaults** — *Obligations went unpaid; creditors will lend less
> and charge more. Debt ¤2,888 · weekly +¤55 · interest ¤0/wk*

### 16. Rejim degisimini kacirmak mumkun mu?

**HAYIR** — tier 2 kart + vakayiname kaydi (`Absolute Monarchy →
Presidential Dictatorship`). Beta #2'de oyuncu rejim degisimini **fabrika
menusunden** ogrenmisti.

**Durust kayit:** kok neden duruyor. `governmentType` bir kurumdan degil
iktidar partisinin ideolojisinden **okuma aninda turedigi** icin etiket yillik
secimlerle salinabiliyor. Sogutma bunu yuzyilda 13'ten 4'e indirdi;
histerezis politika mekanigine dokunur → **kapsam disi**
(`REMAINING_PRESENTATION_DEBT.md` §4).

### 17. Birim yok olusu gorunur mu?

**EVET**, uc kademede — cunku bir alay ile bir ordu ayni sey degil:

| Kayip | Tier | Baslik |
|---|---|---|
| esik alti | 1 | `A regiment is destroyed` / `N regiments destroyed` |
| ≥%34 (min 3 alay) | 2 | `The army is broken` |
| tamami | **3** | `The army is gone` (durdurur) |

Beta #2'de oyuncunun ordusu **iki kez sessizce** yok olmustu (`killUnit`
log'suzdu).

### 18. Baskent kaybi buyuk tarih olarak isleniyor mu?

**EVET**, ve isgal ile kayip ayrilir — biri geri alinabilir, digeri devir:

- **occupied** (tier 2): hex dusman *kontrolunde*, sahip hala oyuncu.
- **lost** (tier 3, durdurur): hex'in **sahibi** degisti.
- **recovered** (tier 2).

> **Test borcu:** kod yolu (`capitalPhase`, `tile.owner` + `controllerOf`) ve
> bassiz kosu dogrulandi; tarayicida gercek bir savasla **tetiklenmedi**
> (kontrollu bir baskent isgali icin uzun kampanya gerekiyordu). Kayitlidir.

### 19. Baris antlasmalari acikca sunuluyor mu?

**EVET.** Once tek satirdi ("X imposed terms on Y"). Simdi `signPeace`
oyuncunun tarafi icin sonucu ozetler: kac eyalet alindi/verildi, hangi
maddeler; **beyaz baris acikca soylenir** (tier 2, kalici kart).

> Ilk yazimda ozet `applyTerms` icine konmustu — orada `offer` degiskeni
> **yok**; kapsam hatasi calistirilmadan once yakalandi ve `signPeace`e tasindi.

Ayrica: baris imzalaninca HUD'daki savas karti artik **dusuyor**
(`dismissKind('WAR')`); eskiden bayat kart ekranda kaliyordu.

### 20. Oyuncunun geri donebilecegi bir vakayiname var mi?

**EVET** — yeni **Chronicle** sekmesi. Yalniz **tier 2+** kayitlar girer;
tavan 240 kayit; olculen yogunluk **on yilda ~1.3 kayit** (yuzyilda ~13,
~1.5 KB). Ekran acilmadikca metin uretilmez.

**Kalan bosluk (durust):** tier 0/1 kartlar kaybolduktan sonra geri
getirilemez — "gecen ay hangi fabrika bitti?" sorusunun cevabi hicbir yerde
yok. Brief "3000 satirlik bildirim dokumu" istemedigi icin bilincli birakildi
(`REMAINING_PRESENTATION_DEBT.md` §5).

### 21. Otomatik kayit varligini belli ediyor mu?

**EVET.** HUD satiri artik ne, hangi dunya ve hangi tarih oldugunu soyluyor:

```
Autosave · <seed> · <oyun tarihi>
```

---

## E. KAMPANYA SONU

### 22. 1945'in artik gercek bir kapanis ekrani var mi?

**EVET.** `victory` olayi `turn.js`'te **zaten yayiliyordu ve `src/` altinda
hicbir dinleyicisi yoktu.** 109 yillik kampanyanin odulu hegemonya seridindeki
tek bir satirdi. Artik `src/ui/endScreen.js` tam sayfa bir kapanis acar.

**Zafer kosullari degistirilmedi:** `FINAL_TURN = 5740`, `checkVictory` ve
hegemonya puanlamasi aynen duruyor. Eklenen sey yalnizca **ilk dinleyici**.

### 23. Kapanis gercek kampanya tarihini ozetliyor mu?

**EVET** — tamami oyuncunun kendi verisinden; hicbir sayi uydurulmaz.

Kampanyanin ilk haftasinda bir kesit alinir (`chronicle.captureOpening`,
`nation.opening`: nufus, GSYH, okuryazarlik, hex, kume, hukumet bicimi, tesis).
**Bir kez** yazilir, kayda girer — turetilemez veri oldugu icin kaydedilmezse
yuzyilin baslangici kaybolurdu.

Kapanis cumlesi **hazir cumleler arasindan secilmez**; dort gercek olcunun
farkindan kurulur (toprak / sanayi / okuryazarlik / siralama). Tarayicida
uretilen ornek:

> *"It entered the century as an absolute monarchy. It leaves it much the same
> size, still agrarian, largely unschooled, and first among nations."*

Zaman cizelgesi vakayinameden **en fazla 10** kayit secer: once tier 3, sonra
tier 2; secim sonrasi **zaman sirasina** geri dizilir. Kayit yoksa durust bir
satir: *"A century without recorded upheaval."*

**Bilerek eksik:** savas sayisi, zirve hazine, en kotu borc, "buyuk guc yillari"
— bunlarin kampanya boyu **guvenilir sayaci yok**. Uydurmak yerine cikarildilar
(`CAMPAIGN_ENDING_REPORT.md` §7).

---

## F. YAN ETKILER

### 24. Olay sunumu bildirim yorgunlugu yaratti mi?

**HAYIR.** Uc bagimsiz olcum:

| Test | Sonuc |
|---|---|
| bassiz, 3 tohum × 50 yil | yilda **0.1-0.2** ulusal olay, **0.1** durdurma |
| tarayicida 10 yil (520 hafta) | **3** durdurma, 6 vakayiname kaydi |
| 20 yillik insan benzeri oyun | **4** durdurma, 5 buyuk olay |
| yigin siniri: 20 kalici kart ust uste | ekranda **5**, merkezde **5** |
| olay tarayicisinin maliyeti | **haftada 0.0120 ms** (tam tik ~85 ms) |
| konsol hatasi | **0** (bilinen favicon 404 haric) |

Sakin bir yil oyuncuyu neredeyse hic bolmuyor. Kalici kartlar bile yigini
sisirmiyor.

> Ara olcumde gorulen "107 kart" bir sizinti degil, **testin kendi
> artifaktiydi**: 520 turluk senkron dongu zamanlayicilari blokluyordu. Ayrica
> kurulan bagimsiz test (20 yapiskan kart → 5) bunu kanitladi.

**Kaydet/yukle:** vakayiname (5 kayit), borc fazi, acilis kesiti ve sogutma
haritasi yeniden yuklemeden sonra **aynen** duruyor; sonraki 6 haftada
**tekrar eden olay yok** — eklenen tek satir gercek bir yeni gecisti.
Yeni alanlar mevcut yapilarin icine girdigi icin **surum yukseltmesi
gerekmedi** (`SAVE_VERSION` 15'te kaldi).

### 25. Herhangi bir cekirdek mekanik degisti mi?

# HAYIR.

Ekonomi formulleri, POP mimarisi, insaat, Insaat Kapasitesi, Yuksekogretim,
Devlet Kapasitesi, pazar mimarisi ve fiyatlamasi, savas cozumu, cephe
mimarisi, muharebe modeli, teknoloji ilerlemesi, fetih dengesi, koalisyon
esigi — **hicbirine dokunulmadi.**

`src/game/economy.js`'teki alti hunk'in tamami proje **kuyruk yonetimidir**;
degistirilen tek karar "hangi projeye once para verilir" ve "kuyruk kapisi
neyi sayar"dir. Yatirim **tercihi** (hangi tesis, nerede) degismedi — ayni kapi
YZ ulkeleri icin de gecerlidir ve dunya sanayisi 60 yilda 905 → 995 tesise
cikti.

Dogrulama:

```
git diff 763207f..HEAD -- src/game/economy.js \
  | grep -iE "schooling|education|hire|promot|literac|wage|employ"
→ (bos)
```

---

## G. TAM TAKIM DENETIMI — 5 YUKSEK'IN ADLI TIBBI

Gecis sonrasi `npm run audit:all`: **0 KRITIK · 5 YUKSEK · 10 ORTA · 5 DUSUK**.

Brief "0 KRITIK, 2 bilinen YUKSEK (fiyat bandi, kartopu)" diyordu. Bes bulgu
tek tek acildi; **hicbiri bu gecisin regresyonu degildir.**

| # | Bulgu | Denetim | Hukum |
|---|---|---|---|
| 1 | Piyasa fiyat bandinda kilitleniyor (%57.1) | long-run | **BELGELENMIS** — brief'in 1. non-target'i |
| 2 | Kartopu (%37.2) | war-pressure | **BELGELENMIS** bulgu, **degeri kaydi** (asagi bkz.) |
| 3 | Kartopu (BORDER1 %36.0 · BORDER2 %41.5 · BORDER3 %34.2) | border-change | **AYNI BULGU** ikinci denetimde; degeri **iyilesti** |
| 4 | Cullanma — azami eszamanli saldirgan 4 | war-pressure | **ONCEDEN OLCULMUS**, esik titremesi (asagi bkz.) |
| 5 | Egitim → sanayi isgucu (%2.4) | budget | **DENETIM ESIGININ ARTIFAKTI** (asagi bkz.) |

Yani brief'in "2" saydigi sey aslinda **ayni iki mekanik**, uc denetim
satirinda gorunuyor. Kalan ikisi asagida tek tek acildi.

### #2/#4 — Savas denetimleri: A/B ile olculdu

`git show 763207f:src/game/economy.js` yerine konup `audit:war-pressure`
yeniden kosuldu. Savas kodu bu geciste **hic degistirilmedi**, dolayisiyla
fark tamamen P0 duzeltmesinin ekonomik ardilidir:

| olcum (3 tohum × 50 yil) | ESKI kod | YENI kod | yon |
|---|---|---|---|
| azami eszamanli saldirgan | 3 · 3 · **3** (gecer) | 3 · 3 · **4** (kalir) | ↑ bir saldirgan, tek tohum |
| 3+ saldirganli ulke-hafta | 143 · 62 · 236 | 202 · 248 · 487 | ↑ |
| kume devri (kartopu) | **%33.0** | **%37.2** | ↑ 4.2 puan |
| dunya zirve sohreti | 151.1 | **116.2** | ↓ (fren daha erken tutuyor) |
| koalisyon esigini gecen ulke | 6.0 | **7.3** | ↑ (fren daha cok ates ediyor) |
| ortanca savas suresi | 19.0 hafta | 21.3 hafta | ↑ |
| canli ulke (baslangic→50 yil) | 28→28 · 26→26 · 29→27 | 28→27 · 26→24 · 29→29 | ≈ |
| TEST 1/2/3/5/6 | hepsi GECTI | hepsi GECTI | = |

**Durust okuma:** evet, bu sayilari **P0 duzeltmesi oynatti.** Sebep de
sasirtici degil — ozel sektor gercekten insa etmeye baslayinca YZ ulkelerinin
sanayisi (dolayisiyla askeri kapasitesi) buyudu. Eski dunya, herkesin sanayisi
~14 tesiste **dondugu icin** yapay olarak sakindi.

**Ama bulguyu bu gecis YARATMADI:**

- Kartopu zaten brief'in belgelenmis non-target'i. Eski deger **%33.0**,
  esik **%33.3** — `REMAINING_CORE_HIGH_ISSUES.md` bunu kelimesi kelimesine
  *"esik %33.3 — kilpayı"* diye kaydetmis. Kilpayi gecen bir esik, herhangi bir
  simulasyon degisikliginde taraf degistirir.
- Cullanma **4** degeri `CORE_STABILIZATION_LOG.md:15`'te, bu gecisten
  **onceki** turun taban cizgi tablosunda, kelimesi kelimesine duruyor:
  `| Cullanma (war-pressure) | azami eszamanli saldirgan 4 (esik 3) |`.
  Sonra `REMAINING_CORE_HIGH_ISSUES.md` ayni bulguyu 3·3·3 olcup "sinirin
  icinde, test GECIYOR" diye kapatmis. Yani deger tarihsel olarak **zaten
  4 ↔ 3 arasinda** salinmis; test `Math.max(...) > 3` diye sert bir esik
  kullandigi icin tek tohumdaki **tek saldirgan** hukmu ceviriyor.
- Ayni olguyu kendi tohumlariyla olcen `border-change` denetimi **ters yonde**
  hareket etti: onceki kayit %41.9 / %46.8, simdi **%36.0 / %41.5 / %34.2**.

**Ve dunya kartopu olmuyor.** `audit:long-run`, 17 uzun kosu:

- degismez ihlali: **0/17**; batik ulke orani her ufukta **%0.0**
- canli ulke sayisi 1040. haftada **27 ve 28** (baslangic 15)
- savasan ulke orani zamanla **duşuyor**: %24.2 → %20.6 → %18.2
- denetimin bu konudaki tek sikayeti ters yonde:
  `[LOW] Harita hic konsolide olmuyor — 1040. haftada canli ulke 27, 28`

Yani "%37.2 kume devri" **birikim degil calkantidir**: toprak el degistiriyor,
kimse kartopu yapmiyor, harita yuz yilda bile konsolide olmuyor.

**Karar: dokunulmadi.** Bu sayilari %33'un altina cekmek, dogru calismaya
yeni baslamis bir ekonomiyi telafi etmek icin **savas dengesini ayarlamak**
olurdu — brief'in acikca yasakladigi sey ("do not change conquest balance just
because the border audit is HIGH", "DO NOT REOPEN THE CORE"). Olcum kayitlidir;
karar kullanicinindir.

### #5 — Egitim → sanayi isgucu: esik **isaret koru**

Bu tek satirlik A/B testiyle kesin olarak cozuldu (`git show
763207f:src/game/economy.js` yerine konup `audit:budget` yeniden kosuldu):

| 1040. hafta | ESKI kod (P0 oncesi) | YENI kod (P0 sonrasi) |
|---|---|---|
| kadro @egitim %0 | 170,924 | 160,513 |
| kadro @egitim %100 | 150,593 | 164,535 |
| **fark** | **−11.9%** | **+2.4%** |
| denetimin hukmu | `OK` | `[HIGH]` |

Denetimin sarti (`scripts/audit/budget-audit.mjs:164`):

```js
if (Math.abs(dEmpFar) < 0.05) { finding('HIGH', 'Egitim -> sanayi isgucu', ...) }
```

**`Math.abs`** — yani test **buyuklugu** olcuyor, **yonu** degil. Eski kod
testin beklentisini (*"egitim isealimi hizlandirmali"*) **ters yonde %11.9
ihlal ediyordu** ve tam da bu buyukluk sayesinde `OK` basiyordu. Yeni kod
beklentiyi **dogru yonde** karsiliyor, sadece kucuk bir buyuklukte — ve HIGH
aliyor.

Yani bulgu su anda **gecmisten daha iyi bir dunyayi** raporluyor. Sebep de
anlasilir: P0 duzeltmesiyle ozel sektor gercekten insa ettigi icin iki kolun
tesis seviyesi yakinsadi (eskiden 107 vs 109, simdi 98 vs 99) ve istihdam da
onunla yakinsadi. Egitimin isealim carpani (`x1.25`) **kod olarak
dokunulmadi**.

**Karar (bu gecis): dokunulmadi.** Testin isaret korlugu gercek bir tanisal
hatadir ama oyun kodunda degil, denetim harness'indedir; bu gecis bir iletisim
gecisidir ve brief "THEN STOP" diyor. Bir sonraki tura kayit dusuldu.

> **SONRAKI TURDA DUZELTILDI.** Harness hatasi ayri bir adimda giderildi:
> olcum yonlu hale getirildi, etkinin gorulebildigi ufuga (260 hafta) tasindi ve
> tek tohum yerine panel ortalamasina baglandi (olculen sapma bunu zorunlu
> kildi: 1040 haftada 6 tohumun 3'u negatif). `audit:all` 5 YUKSEK → **4
> YUKSEK**; **oyun kodu degismedi** (`git diff -- src/` bos). Tam gerekce ve
> once/sonra: `AUDIT_HARNESS_CORRECTION.md`.

---

## H. NE YAPILMADI

Brief'in yasak listesi **eksiksiz uygulandi**: ittifak diplomasisi yok, dev
teknoloji agaci yok, savas komutasi/cephe yeniden tasarlanmadi, yeni ekonomik
kaynak yok, kolonizasyon yok, yeni ideoloji yok, ozel yatirim kilitlenme
onariminin otesine gecilmedi, pazar fiyatlamasi degistirilmedi, fetih dengesine
dokunulmadi, olay betik dili yazilmadi.

Bilincli birakilan sunum borcu — sirasiyla oyuncu etkisine gore —
`REMAINING_PRESENTATION_DEBT.md`de: reform merdiveninin ekonomiye bagli
olmamasi (bir sonraki mekanik turunun bir numarali adayi), ittifak diplomasisi,
kampanya sonu sayaclari, rejim etiketi sarkaci, tier 0/1 gecmisi, ulke secim
ekrani, ses kancalari, duraklama tercihleri, baskent olayinin canli
dogrulanmamasi.

---

## SONUC

Simulasyon bir yuzyil uretiyordu ve oyuncu bunu ancak menuleri kurcalayarak
ogrenebiliyordu. Bu gecis **tek bir formulu degistirmeden** simulasyonun zaten
bildiklerini konusturdu: haftalik bir gecis taramasi, dort kademeli bir agirlik
dili, bir vakayiname ve yuzyilin son sayfasi.

Oyun daha **gurultulu** olmadi — yilda 0.1 kesinti. Daha **anlasilir** oldu.
