# TEKNOLOJI TASARIMI — karar belgesi (Faz 2-4)

Girdi: `TECHNOLOGY_PLAYER_AGENCY_AUDIT.md`. Dort bagimsiz tasarim onerisi
uretildi, her biri iki ayri mercekle (mimari / oyuncu deneyimi) puanlandi,
kazanan **duzeltilerek** alindi. Butun iddialar kaynaktan dogrulandi.

**Henuz kod yazilmadi.** Bu belge kararı ve **onceden kayda gecirilmis**
basari olcutlerini sabitler.

---

## 0. SECILEN MODEL — ULUSAL PROGRAM

Brief dort yaklasim sunuyordu (A tek teknoloji · B birincil+ikincil alan ·
C alanlara agirlik dagitimi · D stratejik programlar). Secilen **D**.

**Oyuncunun fiili: ILAN ETMEK.** Devlet sekiz yilligina bir ulusal programa
baglanir. Program uc sey birden soyler — **yon**, **bedel** ve **taahhut**:

```
DEMIR VE RAY PROGRAMI                          ilan 1848, vade 1856
  Ucuz     Metalurji · Altyapi                                  ×0.55
  Pahali   Toplumsal Dusunce · Askeri Bilim                     ×1.75
  Bagli    Hazine egitimi en az %25 fonlamak zorunda.
  Vadeden once fesih: biriken arastirma puaninin yarisi yanar.
```

5×6 merdiven altta kalir; odak sutunlari fildisi/pirinc ve **indirimli
fiyatiyla**, ihmal edilen sutunlar koyu ve **zamli fiyatiyla** yazilir.
Tek tek teknoloji secme dugmesi **korunur** (program icinde yon degistirme),
ama zorunlu degildir: `nextTechFor` bosalan `research.current`i hem oyuncu
hem YZ icin doldurur.

### Neden D, neden A degil

Olculen taban: yuzyilda ~20 teknoloji ≈ **5 yilda bir karar**. Ama kor
kampanyada oyuncu bu kararlarin **dokuzunu kacirdi** ve 5671 RP bosta bekledi
(B-018 — `ttl: 0` kartinin varlik sebebi). Yani mevcut tempo dogru, **arayuz
sozlesmesi** yanlisti: oyun oyuncuyu masaya cagirmayi beceremiyordu.

| | Bugun | Bu tasarim |
|---|---|---|
| Zorunlu teknoloji secimi | ~20/yuzyil (9'u kacirildi) | **0** |
| Istege bagli yon karari | 0 | ~13/yuzyil (vade 416 tur) |
| Gercekci oyuncu eylemi | ~11 | ~8-10 |

Eylem sayisi **duser**, karar bir soyutlama katmani **yukselir**. Vadesi gecen
program kendiliginden surer — kartı yok saymak mesru bir muhafazakar oyundur,
ceza degil. CLAUDE.md'nin devretme kurali boylece yapisal olarak karsilanir:
**program devretmenin ta kendisidir**, geriye devredilecek mikro is kalmaz.

Vade (8 yil) bilerek bir klasorden (6 kademe × 2-4 yil = 18-24 yil) **kisadir**:
merdiven yurumeye devam ederken yeniden taahhut edersin. Kuyruk yonetmek degil,
**dumen tutmak** hissi buradan gelir.

---

## 1. KAZANAN TASARIMDA DUZELTILEN HATALAR

Yargic mercekleri sekiz kusur buldu; hepsini kaynaktan yeniden dogruladim.
Uc tanesi uygulansa **hata olarak sevk edilecekti**:

| # | Iddia | Kaynaktaki gercek | Karar |
|---|---|---|---|
| C1 | "Egitim tabanini `setFiscalPolicy`e koymak yeter" | `adjustSocialAI` (`economy.js:2570-2573`) `economy.social[id]`e **dogrudan** yazar, `setFiscalPolicy`i **atlar** | Taban **iki bogazda birden**, tek yardimci (`socialFloorOf`) |
| C2 | "Turetilmis hicbir sey kayda girmez" | `economy` **butun halinde** serialize edilir (`save.js:113`) → `techMods` **bugun kayitta**; `beginEconomy` yalniz `if (!techMods)` ile yeniden kurar (`economy.js:3300`) | Yeniden kurma nobeti **en yeni alana** tasinir |
| C7 | "`SAVE_VERSION` 15→16" | `MIGRATABLE_VERSIONS = new Set([14])` (`save.js:38`), `save.js:202` digerlerini **reddeder** | **Surum yukseltmesi YOK.** `research` butun halinde tasindigi icin gerekmiyor |
| C5 | Her programa sabit `order: [...]` | Ayni programdaki iki ulke **birebir ayni** sirayi izlerdi — ayrismayi **azaltirdi** | `order` **silindi**; siralama yayilim sonrasi maliyete gore |
| C6 | `rgoTrack: { agriculture: … }` (ic ice) | `refreshTechModifiers` `Number.isFinite(entry.tech[key])` bakar → ic ice anahtar sessizce **0** uretir; ekranda gorunur ama olu | **Duz** anahtar (`rgoAgriculture`) |
| C8 | `coke_smelting → STEEL_MILL` bir odul | Kilit **olu** (§4b-a); iki kilit de takvimden **gec** | Once veri hatalari onarilir |
| C9 | "Programsiz ulke mesru bir durum" | `programme: null` iken `nextTechFor` **hicbir sey** arastirmazdi | Programsiz siralama tanimli |
| C10 | "Egitim tabani collapse'i cozer" | **Olculdu**: duz %70 taban okuryazarligi %25.5→%49.5 cikardi ama teknoloji yayilimini 6→3, farkli kume sayisini 7→4 **cokertti** | Taban **programa ozel** (25/40/55/70) |

Yargicların kacirdigi bir tane daha: **`ARTILLERY`nin `availableFrom`u yok**
(`units.js`). Yalniz `ARMOR` (1916) ve `AIRCRAFT` (1906) kapili. Bir
`unlockUnit: ['ARTILLERY']` yazmak STEEL_MILL hatasini tekrarlamak olurdu.

---

## 2. KENDI OLCUMUMLE DUZELTILEN BIR IDDIA DAHA

Tasarim, yakit collapse'inin ikinci kilidini buldu ve **kod tarafi dogru**:
egitim 0'a inince `investmentBlocker` (`construction.js:530-536`)
`educationFloor[1] = 25` yuzunden `HIGHER_EDUCATION`i kalici kapatir.

Ama "**hicbir YZ hicbir kampanyada yuksekogretim kurmaz / yapisal olarak
imkansiz**" iddiasi **YANLIS**. Olctum (2 tohum, 78×62):

| Yil | HE ≥1 olan ulke | azami seviye | toplam seviye | egitimi ≥%25 olan |
|---|---|---|---|---|
| 1850 | **16/33 · 19/29** | 2 | 28 · 32 | 9 · 12 |
| 1870 | 11 · 18 | 2 | 20 · 34 | 4 · 13 |
| 1900 | 10 · 16 | 2 | 13 · 26 | 1 · 11 |
| 1945 | 10 · 16 | 2 | 14 · 27 | 3 · 12 |

Dogru ifade daha dar ve daha ilginc:

- Yuksekogretim **acilis penceresinde** (1836-1850, egitim hala fonluyken)
  kurulur; collapse'tan sonra **yeni kurulum durur** ve mevcut seviyeler
  **erir** (16→10, 32→14 toplam).
- `heMax` her yil **2**: YZ kendini `investmentLevel < 2` ile
  sinirliyor (`construction.js:816`) — kilit degil, tasarim.
- Seviye 3-4 (taban %55/%70) **fiilen hic kimse icin ulasilamaz**.

Dolayisiyla A/B olcutu (d) "yapisal olarak imkansiz" tabanindan **degil**,
olculen 10-16 tabanindan yazildi (§5).

---

## 3. VERI MODELI

```js
nation.research = {
  points, current, done,      // degismedi
  programme: null,            // PROGRAMMES anahtari
  programmeSince: 0,          // ilan turu; vade +416
  programmeCooldown: 0,       // fesihten sonra yeni ilan yasagi
  programmeHistory: [],       // [{ id, from, to, reason }]
}
```

`ensureResearch` (`technology.js:143-148`) dordune de `??=` varsayilani verir —
`done`/`points` icin zaten kullandigi kalip. **v15 kaydi degismeden yuklenir**,
`programme: null` alir, ilk haftalik tikta programini edinir.

**`SAVE_VERSION` 15'te kalir.** Migrasyon yok, `MIGRATABLE_VERSIONS`
dokunulmaz, hicbir eski kayit bozulmaz.

Turetilmis (elle yazilmaz, haftalik kurulur):

```js
economy.techMods     // + duz anahtarlar: literacyReach, rgoAgriculture, ...
economy.techDemand   // { [goodId]: true }
world.techHolders    // Map<techId, Set<nationId>> — KAYDA GIRMEZ
```

`beginEconomy`'nin nobeti `if (!nation.economy.techMods)` iken
**`if (!nation.economy.techDemand)`** olur: en yeni alan nobetci olur, eski
kayitlar yuklenince yeniden kurulur.

`world.techHolders` her tikta `research.done` + `world.contacts`tan kurulur.
Ikisi de o anda deterministiktir: `contacts` evresi (`turn.js:379`) `economy`
evresinden (`turn.js:477`) **once** kosar ve `computeContacts`
(`diplomacy.js:270`) saf fonksiyondur. `world.contacts` ilk tur oncesi
tanimsizdir — **temassizlik** sayilir, cokme degil.

### Katman ve dongu disiplini

`technology.js` **`economy.js`i import edemez** (ters yon zaten var). Bu yuzden
puanlama ikiye bolunur: saf `scoreProgrammes(nation, ctx)` `technology.js`te
kalir; `ctx`i kuran `programmeReview(world, nation, year)` `economy.js`e girer.
`technology.js` `politics.js`i import edebilir (o yalniz `core/rng.js` cektigi
icin dongu olusmaz).

### Sert UI kurali

`technologyScreen.js` **`effectiveTechCost` cagirir, `techCost` cagirmaz**.
Bugun `techCost`u iki yerde cagirip (`:77`, `:100`) tahmini de ondan turetiyor
(`:105-107`). Ekranda 468 RP yazip motorun 257 RP dusmesi, `UI_TRUTH_FIXES`in
kapatmak icin var oldugu hata sinifini yeniden acardi. Denetim
`technologyScreen.js` icinde ciplak `techCost(` gecmedigini **iddia eder**.

---

## 4. YAKIT COLLAPSE'I — DURUS

**Karar: KOKUNDEN DUZELT, ama FARKLILASTIRARAK.**

Etrafindan dolasmak (arastirmayi okuyarlıktan koparmak) egitimi yeniden
oldururdu — okuryazarligi stok yapan beta onariminin (BUG-019) tam tersi.
`adjustSocialAI` **YZ mali davranisidir**, butce modeli degil ve brief'in
MUST-NOT listesinde **yoktur**.

Dort duzenleme, ~15 satir:

1. **Taban, iki bogazda birden.** `socialFloorOf(nation, programId)`;
   `setFiscalPolicy` (oyuncu + kriz dali) ve `adjustSocialAI` (haftalik YZ
   cirtı) ayri kod yollari oldugu icin **ikisine de** uygulanir. Ikinci terim
   `educationFloor: [0,25,40,55,70]` dizisini (`construction.js:61`) yeniden
   kullanir: bugun bir **giris** kapisi olan esik ayni zamanda **cikis** kapisi
   olur — satin alinan kurum yapiskanlasir, sifir veri maliyetiyle.
   Kredi cezasi altindaki devlet muaftir: **geri kalan DUSEBILMELI**.
2. **Cirti kir.** `gold > 200` mutlak esigi olceğe gore yeniden yazilir
   (`reserve = 8 × socialSpendingCost`). On "zengin" haftada 0→100 cikip tek
   kotu haftada geri dusmek — asimetrinin kendisi cirttir, oncelik listesi
   degil.
3. **Kesme sirasini yukseltme sirasini ters cevirerek turetme.** Bugun
   `stability < 0.5` iken ters sira **egitimi ILK keser** — yani ulke tam da
   zordayken. Sabit `CUT_ORDER = ['welfare','health','education']`. Ayrica
   dongu tabanindaki programi **atlamali**, `return` etmemeli; yoksa
   `adjustSocialAI` haftalik bir no-op'a doner ve mali YZ kaldiracini kaybeder.
4. **Cokus silinmez, okunur bir basarisizlik durumu olur.**
   `adjustWarFiscalAI`in kriz dali once `abandonProgramme(..., 'crisis')`
   cagirir: taban kalkar, puanin yarisi yanar, vakayinameye kayit duser,
   52 hafta yeni ilan yasagi baslar. Ancak ondan sonra egitim kesilir.

Odenemezse acik borc sistemine akar ve **kurulu bir dongu** cezalandirir:
`settleDebt` → `creditPenalty` → `upkeepFactor` (`construction.js:267-269`) →
`higherEducationBonus` (`:319-322`) → okuryazarlik hedefi (`economy.js:3380`).
Odeyemeyecegin okula soz verirsen universitenin katkisini kaybedersin.
Kendini sinirlayan, yeni sistem gerektirmeyen bir ceza — ve "teknoloji lideri
olmayi" gercek bir **kumar** yapar.

**Neden duz taban degil:** olculdu — duz %70 taban okuryazarligi %25.5→%49.5
cikardi ama teknoloji yayilimini **6→3**, farkli teknoloji kumesini **7→4**
cokertti ve hazineleri sifirladi. **Yakiti tektiplestirmek sonucu
tektiplestirir.** Bu tasarimda taban **programin kendi sartidir**: Arsenal 40,
Ulusal Egitim 55-70, programsiz ulke 0 ve **cokmesi beklenir**. Ayrisma,
duzeltmeye **ragmen** degil, duzeltme **sayesinde** uretilir.

---

## 5. ONCEDEN KAYDA GECIRILMIS A/B (`npm run audit:research`)

Tek bayrak, tek fark: `export const FUEL_FIX = true` (denetim
`--no-fuel-fix` ile A koluna gecer). 3 tohum × 5740 tur.

| # | Olcut | A (taban, olculen) | B icin gerekli |
|---|---|---|---|
| a | Egitimi 0 olan ulke | 17/24 · 22/27 · 22/26 | 1860 sonrasi her onyilda **≤ %40** |
| b | Egitim harcamasi IQR | 0 (yozlasmis) | 1860/1900/1945'te **sifir degil** |
| c | Medyan okuryazarlik 1900 | 0.12 | **≥ 0.25** |
| d | HE ≥1 olan ulke (1900) | **10/32 · 16/28** (olculdu) | **A'nin altina dusmesin** ve HE≥2 ≥ 3 ulke |
| e | `researchPointsOf` p90/p10 (1900) | — | **≥ 2.0** (lider de geri kalan da var) |
| f | Farkli teknoloji kumesi (1945) | 9-12 | **≥ 9** (yayilim dunyayi duzlestirmesin) |
| g | Lider − geri kalan teknoloji farki (1900) | — | **≥ 8** |
| h | 1870'te alt cerekte olup 1930'da ust yariya cikan | — | 3 tohumun **≥1**'inde |
| i | Onyil basina fesih | — | **>0 ve ulkelerin <%50'si** |
| j | Medyan saglik/refah, medyan istikrar | A kolunda olculur | hicbir onyil A'dan **0.08**'den kotu degil |
| k | `audit:stability` · `budget` · `save` · `determinism` · `legacy` | yesil | **yesil** |

**B kolu henuz kosulmadi.** "Gerekli" sutunundaki her sayi bir olcum degil,
**yanlislanabilir bir iddiadir**.

### Geri alma plani (koddan ONCE yazildi)

- **(j) duserse** (refah 0'a yapisir, istikrar coker): taban duz kaydirac
  degeri yerine **gelirin payi** olur (tavan `ledger.income`in %12'si).
  O da olmazsa yalniz 3. duzenleme geri alinir.
- **(i) %50'yi asarsa**: collapse cozulmedi, **tasindi**. Butun program
  tabanlari bir kademe iner (25/40/55/70 → 15/25/40/55). **En olasi
  basarisizlik budur.**
- **(b) veya (e) duserse**: taban butun isi yapiyor, program secimi hicbir sey.
  Tasarimin merkez vaadi yanlislanmis olur.
- **(f) duserse**: `DIFFUSION_MAX` 0.45 → 0.30.
- **(a) duser ama (k) gecerse**: duzeltme zayif; once 2. duzenlemedeki
  `reserve` carpani.
- **`LITERACY_APPROACH` (0.001/hafta) son kaldiractir, ilk degil.** Oyundaki
  butun olculmus egrileri oynatir.

---

## 6. TEKNOLOJILER NE YAPAR — ETKI SINIFLARI

**Yazim kurali (denetimle zorlanir): her klasor en az iki yuzde-disi etki
tasimali. Hicbir klasor tamamen yuzdesel olamaz.** "+%2 verim" sisteminin
kendisi olmasin diye tek fren budur.

| Sinif | Tuketici | Durum |
|---|---|---|
| **A — fabrika kilidi** | `techUnlocksFactory` → `factoryUnlocked` (`economy.js:1471`) | **Hazir**, motor isi yok |
| **B — birim kilidi** | `unitAvailable` (`units.js:70`) | **Baglanacak**: `nation` parametresi eklenecek, uc cagiran (`recruitment.js:387`, `military.js:226`, `ai.js:249`) — ucunde de `nation` kapsamda |
| **C — talep one cekme** | `needAmount` | **Yeni**: teknoloji yeni girdi talebi dogurur → piyasa |
| **D — yuzdesel** | mevcut 6 anahtar | **Ikincil kalir** |

**Askeri gercek (sert kisit):** yalniz `ARMOR` (1916) ve `AIRCRAFT` (1906)
tarih kapilidir. Piyade/suvari/topcu/savas gemisi **hep aciktir**. Yani
"tufek teknolojisi tufegi acar" **yazilamaz** — yeni birim tipi eklemek savas
modeline dokunmaktir ve **yasak**. Askeri teknoloji bu geciste yalnizca
(a) ARMOR/AIRCRAFT'i one cekerek, (b) tedarik/takviye kanalindan
(`supplyConsumption`) is gorebilir. Digerleri **REMAINING_TECH_DEBT**'e yazilir.

### Once onarilacak veri hatalari

1. `coke_smelting → STEEL_MILL` olu kilit (§4b-a) — ya `STEEL_MILL`e
   `availableFrom` verilir ya kilit kaldirilir. Ekran sahte "Unlocks" demeyi
   birakir.
2. `ELECTRIC_GEAR` (tech 1875 / takvim 1870) ve `MACHINE_PARTS`
   (1855 / 1850) — teknoloji yillari takvimin **onune** cekilir.
3. `inputEfficiency` toplami 0.60, tuketici 0.50'de kirpiyor → %17 bosa
   gidiyor. Ya toplam 0.50'ye indirilir ya tavan yukseltilir (**olcum**
   kararı verir; tavani yukseltmek fiyat dengesini oynatir).
4. `techModifiers()` olu disa aktarimi silinir; `0.95` okuryazarlik kirpmasi
   ya 0.85'e cekilir ya aciklanir.
5. `technology.js:205` ve `units.js:96` bayat yorumlari duzeltilir.

---

## 7. BU GECISTE YAPILMAYACAKLAR

200 dugumlu agac · dolgu kart · RNG icat kutusu · bilim insani mikrosu ·
laboratuvar/universite spam · ekonomiden kopuk bilim para birimi · patent ·
casusluk · arastirma anlasmasi · yeni savas/deniz sistemi · kolonizasyon.

Ayrica **bu geciste degil**: kalan dort kategorinin tamami (temsili dilim
once olculur), 1905-1945 bosluğunun tamami, yeni birim tipleri.

---

## 8. RISKLER

1. **En buyuk risk — ekonomik zamanlama.** Fabrika kapilarini one cekmek mal
   fiyatlarini ve kitliklari kaydirir. Her adimda `audit:long-run` ve
   `audit:market` taban cizgisiyle karsilastirilacak. Onceki denetimin
   uyarisi aynen gecerli.
2. **Taban her isi yapar, program hicbir sey** — (b)/(e) olcutu bunu yakalar.
3. **Fesih salgini** — (i) olcutu; en olasi basarisizlik.
4. **Yayilim dunyayi duzlestirir** — (f) olcutu.
5. **Karar sikligi artar** — 13/yuzyil hedefi; asilirsa vade uzatilir.
