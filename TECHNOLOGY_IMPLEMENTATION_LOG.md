# TEKNOLOJI GECISI — uygulama defteri

Sirali kayit. Her adim: NE · NEDEN · OLCUM · HUKUM.
Olcutler `TECHNOLOGY_DESIGN.md` §5'te **koddan once** yazildi.

---

## ADIM 1 — `audit:research` (olcum harness'i)

Kod degistirmeden once olcum araci. Onyil onyil: egitim harcamasi (medyan,
sifirda olan sayisi, IQR), okuryazarlik p10/p50/p90, arastirma hizi
p10/p50/p90, teknoloji sayisi p10/p50/p90, lider-geri farki, farkli
teknoloji kumesi sayisi, yuksekogretim seviyesi, istikrar/saglik/refah.

3 tohum × 5740 tur (1836-1945). `harness.headless()` 78×62 harita kurar.

## ADIM 2 — veri hatasi onarimlari

Denetimin **goremedigi** turden kusurlar (o, degistiricinin tuketicisi var mi
diye bakar; kilidin bir sey acip acmadigina bakmaz):

| Onarim | Etki |
|---|---|
| `coke_smelting`in `unlock: ['STEEL_MILL']`i kaldirildi | `STEEL_MILL`in `availableFrom`u yok → ilk haftadan herkese acikti. Kilit hicbir sey acmiyordu ama ekran **"Unlocks steel mill"** diye sahte vaat basiyordu. Fabrikaya takvim vermek butun sanayi zamanlamasini oynatirdi; vaat kaldirildi. **Simulasyon degismedi.** |
| `electrical_power` 1875 → **1866** | Acacagi fabrikanin takviminden (1870) SONRAYA tarihliydi: arastirmak hicbir zaman one gecirmiyordu |
| `precision_work` 1855 → **1848** | Ayni hata (takvim 1850) |
| `techModifiers()` silindi | `src/` ve `scripts/` altinda sifir cagiran |
| Iki bayat yorum | `technology.js` silinmis "ulusal rutbe" terimini anlatiyordu; `units.js` `maxHp`i hicbir teknolojinin dokunmadigi "zirh teknolojisi"ne bagliyordu |

**SONRA:** alti fabrika kilidinin **altisi da** takvimi geciyor (+2y … +16y);
olu kilit yok, geri tarihli kilit yok.

**ERTELENDI:** `inputEfficiency` agaci 0.60 dagitiyor, tuketici 0.50'de
kirpiyor (`economy.js:2190`) → arastirmanin **%17'si** bosa gidiyor. Hem
degerleri kismak hem tavani yukseltmek ekonomi dengesini oynatir; olcum
yapmadan dokunulmadi (`REMAINING_TECH_DEBT`).

## ADIM 3 — YAKIT DUZELTMESI (`FUEL_FIX` bayragi)

### Ne yapildi

1. **`socialFloorOf(nation, programId)`** — egitim icin alt sinir.
   Kaynak: `NATIONAL_INVESTMENTS.HIGHER_EDUCATION.educationFloor`
   (`[0,25,40,55,70]`), **ulkenin kendi yatirim seviyesine** gore. Bugun bir
   **giris** kapisi olan esik ayni zamanda **cikis** kapisi oldu: satin
   alinan kurum yapiskanlasir.
   **Kredi cezasi altindaki devlet muaf** (`creditPenalty > 0.05`) — geri
   kalan DUSEBILMELI, yoksa "teknoloji lideri olmak" risksiz bahis olur.
2. **Iki bogazda birden**: `setFiscalPolicy` (oyuncu + kriz dali) **ve**
   `adjustSocialAI` (haftalik YZ). Ikincisi `economy.social`a **dogrudan**
   yazip `setFiscalPolicy`i atladigi icin tek nokta yetmezdi.
3. **Cirt kirildi**: mutlak `gold > 200` / `gold < 60` esikleri ulkenin
   olcegine baglandi (`reserve = 8 × socialSpendingCost`). Eski asimetri —
   `weekly < 0` tek basina kesmeye yetiyor, yukselmek on iyi hafta istiyor —
   cirtin ta kendisiydi.
4. **Kesme sirasi sabitlendi** (`CUT_ORDER = welfare, health, education`).
   Eskiden yukseltme sirasi **ters cevrilerek** turetiliyordu ve bu,
   `stability < 0.5` iken **egitimi ILK** kesiyordu — yani ulke tam da
   zordayken. Ayrica tabandaki program artik **atlanir**, `return`
   edilmez: yoksa `adjustSocialAI` haftalik no-op'a doner ve mali YZ
   kaldiracini kaybeder.

### A/B — tek fark oldugu KANITLANDI

`HEXWAR_NO_FUEL_FIX=1` ile kosulan A2, orijinal A kolunun ciktisiyla
**birebir ayni** (`diff` bos). Yani olcum tek bir bayragin farkini olcuyor.

### Sonuc

| # | Olcut | A (once) | B (sonra) | Hukum |
|---|---|---|---|---|
| a | egitim=0 orani ≤%40 | 71/80/80/65/60/**85** | 45/60/50/45/45/**80** | **KALDI** (belirgin iyilesme, yetmedi) |
| b | egitim IQR > 0 | **6** onyil-tohumda sifir | **2** | **KALDI** (iyilesme) |
| c | 1900 okuryazarlik ≥%25 | %10.7 · %8.5 · %10.4 | **%23.3 · %12.8 · %19.4** | **KALDI** (ikiye katlandi) |
| e | hiz p90/p10 ≥ 2.0 | 2.8 · 1.6 · 1.7 | **3.4 · 2.2 · 2.1** | **GECTI** ✅ |
| f | farkli kume ≥ 9 | 11 · 9 · 10 | **11 · 9 · 12** | **GECTI** ✅ (duzlesmedi) |
| g | lider-geri ≥ 8 | 9 · 7 · 6 | **12 · 9 · 12** | **GECTI** ✅ |
| j | istikrar/refah gerilemesin | istikrar 0.6-0.7 | **0.5-0.7**, hicbir onyil >0.08 kotu | **GECTI** ✅ |
| k | save · determinism · legacy · stability | yesil | **yesil** | **GECTI** ✅ |
| d | 1900 HE≥1 (HE≥2) | 11/20 (7) · 7/29 (1) · 10/26 (2) | 10/20 (**9**) · 8/23 (**5**) · 10/26 (**4**) | HE≥2 belirgin artti |

### HUKUM: kismi basari — TUTULUYOR, ama yetersiz

**Tuttugu yer, en cok onemseneni:** brief'in "lider / hizli takipci /
ortalama / geri kalan" sarti artik **olculebilir**. (e) ve (g) A'da
KALIYORDU, B'de GECIYOR: liderler ve geri kalanlar gercekten var. Ve en
buyuk risk gerceklesmedi — (f) korundu, **yayilim dunyayi duzlestirmedi**.

**Tutmadigi yer:** (a)/(b)/(c) hala kaliyor. Sebep tasarimdan
anlasilabilir: taban `educationFloor[yatirim seviyesi]`. **HE seviyesi 0
olan ulkenin tabani da 0'dir** — yani hic universite almamis ulke yine
sifira coker. Ustelik HE'ye *girmek* %25 egitim gerektirdigi icin, erken
coken ulke bir daha **giremez**.

Bu, tasarimin "programsiz ulke cokmeli" ilkesiyle tutarli; ama **programlar
henuz yazilmadigi icin** ikinci taban kaynagi yok ve cok fazla ulke sifirda
kaliyor.

### Siradaki adim (onceden yazilmis geri-alma planina gore)

Plan diyor ki: *"(a) duser ama (k) gecerse: duzeltme zayif; once 2.
duzenlemedeki `reserve` carpani. `rich` esiginin duyarliligini yukselt."*
(k) gectigi icin plan aynen izlenecek. **Ikinci taban kaynagi** (ulusal
program) bu bosluğun asil cevabidir.

**Geri alinmadi** cunku: (k) yesil, (j) yesil, uc olcut KALDI'dan GECTI'ye
dondu ve hicbir olcut A'dan kotulesmedi.
