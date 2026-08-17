# POST REPAIR VALIDATION

Bu geciste yapilan degisikliklerin **olculen** dogrulamasi.
Degisiklik kayitlari: [BETA_REPAIR_LOG.md](BETA_REPAIR_LOG.md).

Butun olcumler bassiz tezgahtan (`scripts/audit/harness.mjs`) veya canli
tarayicidan alinmistir. Tohum her karsilastirmada sabittir.

---

## 1. EKONOMI — dis hesap

**Kosum:** `node scripts/audit/trade-consequence-audit.mjs 520` (yeni denetim)

### 1.1 Para korunumu

| Kontrol | Sonuc |
|---|---|
| Hazine kimligi `dgold = net + borclanilan − odenen + temerrut` | **520 hafta x 30 ulke, sifir ihlal** |
| Dunya ticareti sifir toplamli mi (`Simport == Sexport`) | **evet**, 200. haftada fark **2.3e-13** |
| Kapanis para yaratiyor mu | **hayir** — `Sbalance = 0` oldugu icin her oranda 0 |

Sifir toplamlilik ORANDAN BAGIMSIZDIR; `EXTERNAL_SETTLEMENT` yalnizca isirma
siddetini ayarlar, korunumu bozamaz.

### 1.2 Dis pozisyonun mali yonu (ISARET TESTI)

Bu, R-01'in asil sinavi: ticaret fazlasi veren ulke acik verenden daha zengin
olmali. Once **tam tersiydi**.

| Olcum (520 hafta, 30 ulke) | Once | Sonra |
|---|---|---|
| Acik veren ulke ort. hazine | 18.259 | **2.813** |
| Fazla veren ulke ort. hazine | 1.968 | **14.552** |
| **Fazla/acik orani** | **0.11 (ters)** | **5.17 (dogru)** |
| Acik veren ort. haftalik net | +45.5 | +1.2 |
| Fazla veren ort. haftalik net | +2.3 | +44.5 |
| Acik veren ort. borc | 191 | **640** |
| Fazla veren ort. borc | 297 | **0** |

Borc yuku artik dogru tarafta.

### 1.3 Oran kalibrasyonu (URUN yapilandirmasinda)

160x96, 65 ulke, tohum BETA1836. Denetim haritasi (78x62) farkli bir cevap
veriyordu; urun yapilandirmasi esas alindi.

| oran | hf156 iflas | hf520 iflas | hf156 oran | hf520 oran |
|---|---|---|---|---|
| 0.00 (eski) | — | — | 0.06 | 0.06 |
| 0.50 | 0/65 | 6/65 | 0.81 | 1.05 |
| **1.00 (secilen)** | 1/65 | **4/65** | **5.90** | **2.95** |
| 1.50 | 5/65 | 8/65 | 12.32 | 4.36 |
| 2.00 | 9/65 | 12/65 | 6.31 | 3.18 |

1.0 hem isareti en net duzeltiyor hem 520. haftada **en az iflas** uretiyor.

### 1.4 Mali baski gercekten olusuyor mu

| Ufuk | Borclu ulke | Toplam borc |
|---|---|---|
| 520 hafta (denetim haritasi) | 8/30 | 10.235 |
| 520 hafta (urun haritasi) | 7/65 · 6 iflas | — |

Canli oyunda (seed SAVELOAD, 121. hafta) oyuncu ulusu: **hazine 0, borc 1.473,
ticaret dengesi −318/hafta, istikrar %33.4.** Beta kampanyasinda bu durum
imkansizdi — hazine her hafta buyuyordu.

---

## 2. SAVAS — baris bedeli

**Kosum:** `node scripts/audit/peace-stakes-audit.mjs` — **5/5 test geciyor.**

Kurulum: saldirgan kurbanin 97 karesini isgal ediyor, warScore **+46 / −46**.

| Test | Once | Sonra |
|---|---|---|
| Kaybeden bedava beyaz baris istiyor | **KABUL** | **RET** — *"they expect about 36 more at the table"* |
| Oyuncu yolu vs YZ yolu ayni mi | 3 vakada **ayrisiyor** | **3/3 ortusuyor** |
| Kaybeden toprak birakarak cikabiliyor mu | anlamsizdi | **KABUL** |
| Tolerans 0 → 10 yil savas | sabit | **10 → 25** |
| Yipranmis kazanan (istikrar %25, 8 yil, 2 cephe) | KABUL | **RET** — tavan 27.6 |

### 2.1 Canli oyun dogrulamasi — beta'nin kendi senaryosu

Ilk duzeltmeden sonra **oyun oynanarak** ayni kacagin TOLERANS yolundan geri
geldigi bulundu (bkz. LOG R-02b): tolerans kalemleri 45.9'a cikip 37'lik
ustunlugu yutuyordu. Tavan eklendi (`min(raw, lead * 0.6)`).

Seed **BETA1836**, oyuncu ulusu **Vasheim** — beta kampanyasinin tohumu ve
ulkesi. 251. hafta, Draesh savasi, warScore **−21**:

| | Beta buildi | Simdi |
|---|---|---|
| Beyaz baris cevabi | *"They will sign this treaty"* | *"They are winning and will not sign for nothing — they expect about 11 more at the table."* |

Ayni anda oyuncu ulusunun durumu: **hazine ¤0, borc 1.556** — yani savas
artik gercek bir tehdit ve para onu satin alamiyor.

Ret mesaji **istenen miktari soyluyor** — nedensellik kalibi baris masasina da
uygulandi.

**Korundu:** kaybeden YZ'nin artan taviz davranisi (`buildOffer`,
`surrenderOffer`) — beta §20'de acikca korumaya alinmisti, dokunulmadi.

---

## 3. ASKERI YZ

**Kosum:** `node scripts/audit/military-strategy-audit.mjs 400` (yeni) —
**bulgu yok.**

### 3.1 Suda yetim kalan kara birlikleri (DOGRULANAN hipotez)

| Olcum | Once | Halka taramasi | + kendi-toprak yedegi |
|---|---|---|---|
| Kalici yetim tumen | **17** | 1 | **0** |
| En uzun suda kalis | **277 hafta** | 151 | **7 hafta** |

7 hafta kiyiya yuruyus suresidir.

### 3.2 Dogrulanmayan hipotezler

| Hipotez | Olcum (400 hafta, 112 cephe ornegi) |
|---|---|
| Cepheler bos kaliyor | medyan doluluk **%44**, `YERLESIK` 62 · `KISMI` 26 |
| Ordular absurt yerlerde atil | en uzun atil kalis **1 hafta** |
| Cephe tahsisi bozuk | mevkiye yerlesme **%85.3** |
| Yetersiz baslangic kuvveti | **1.20-4.33** tumen/cephe-karesi |
| Ulasilamaz emir | **0 birim** |

---

## 4. ISTIKRAR

**Kosum:** `node scripts/audit/stability-audit.mjs 420` (yeni) — **bulgu yok.**

| Olcum | Once | Sonra |
|---|---|---|
| %5'ten az oynayan ulke | beta: 60 yil sabit %44 | **0/23** |
| Ortalama oynama araligi | ~0 | **%25.8** |
| Dokum kimligi (taban+isgal+savas+issizlik = istikrar) | yoktu | **tutuyor** |

**Kontrollu isgal senaryosu** (193 kare isgal + savas ilani, 6 hafta):

| | once | sonra |
|---|---|---|
| istikrar | %43.3 | **%19.2** |
| isgal kalemi | 0.0 | **−21.1** |
| savas kalemi | 0.0 | **−2.6** |
| isgal payi | %0 | %55.4 |

---

## 5. UI — canli tarayicida olculdu

Seed BETA1836 (beta kampanyasinin tohumu; ayni ulkeyi, **Vasheim**, uretiyor).

| Kusur | Once | Sonra |
|---|---|---|
| Reform enact dugmesi (BUG-008) | **11px × 55px** | **207-427px, satirin %100'u (14/14)** |
| `"unavailable"` diyen fabrika karti (BUG-015) | 5+ | **0** |
| Sebep veren kilitli kart | kismi | **12/12** — orn. *"not yet invented — available from 1870"* |
| Motorun reddedecegi hayalet kart | 2 | **0** |
| Istikrar ipucu | *"national stability"* | 3 satirlik gercek dokum |
| Muharebe raporu (BUG-011) | `battle at 125, 52` | `Battle of <Province>` |
| Insaat kuyrugu basa alma (§7-1) | ~20 tik | **1 tik** (⤒ / ⤓) |
| Savas ilani (BUG-013) | akan bildirim | **oyunu durduruyor** (hiz 3 → 0) |
| Sekme basligi (BUG-001) | `HexWar` | `Imperial Eye` |
| Ordu gucu (BUG-004) | `power 14.06111111111111` | `power 14.1` |
| Cogul eki (BUG-006) | `1 cities` | `1 city` |
| Escape (BUG-023) | hicbir sey | **acik paneli kapatiyor** |
| Guc orani (BUG-016) | `power ratio 0.18` | `they are 5.5× our strength` |

Istikrar ipucunun canli ciktisi:

```
Household satisfaction  +57.2
Unemployment            −2.5  (1,116 without work)
= Stability             54.7%
```

Konsol hatasi: **yok** (butun oturum boyunca).

---

## 6. SAVE / LOAD

Canli tarayici, seed SAVELOAD, 121 hafta simule → `serialize` → JSON turu →
`deserialize` → 30 hafta daha.

| Kontrol | Sonuc |
|---|---|
| Save surumu | 13 (**degismedi**, gec gerekmiyor) |
| Boyut | 2.06 MB |
| Izlenen 12 alanda uyusmazlik | **0** |
| Yeni alanlar (settlement, occupiedShare, warStrain, stability) | **birebir donuyor** |
| Yukleme sonrasi devam | **basarili** (121 → 151) |

Yeni alanlar her hafta turetildigi icin sema gecisi gerekmedi.
`audit:save` de temiz.

---

## 7. REGRESYON TABLOSU

**Metodoloji notu (durust olmak gerekirse):** bu oturumun ilk uc `run-all`
kosusu **kirlidir** — kosu surerken kaynak dosya duzenledim ve alt surecler
yarim modul durumu yukledi (bir kosuda `EXTERNAL_SETTLEMENT` tanimlanmadan
once referans alindi ve `long-run` cokmustu). Asagidaki tablo, hicbir kaynak
dosyaya dokunulmadan alinan **temiz** kosudur.

Kosum: `node scripts/audit/run-all.mjs`

| Denetim | KRITIK | YUKSEK | ORTA | DUSUK |
|---|---|---|---|---|
| determinism (RGO onarimindan sonra da temiz) | 0 | 0 | 0 | 0 |
| wrap · scale · province · world | 0 | 0 | 0 | 0 |
| tax | 0 | 0 | 1 | 0 |
| tariff | 0 | 0 | 0 | 0 |
| budget | 0 | 1 | 4 | 2 |
| market | 0 | 0 | 2 | 0 |
| factory | 0 | 1 | 2 | 0 |
| population | 0 | **2** | 0 | 1 |
| construction | 0 | 0 | 1 | 0 |
| military | 0 | 0 | 0 | 0 |
| debt | 0 | 0 | 0 | 0 |
| ai | 0 | 0 | 1 | 0 |
| strategy | 0 | 0 | 1 | 0 |
| boundary | 0 | 0 | 1 | 1 |
| save | 0 | 0 | 0 | 0 |
| legacy | 0 | 0 | 2 | 4 |
| long-run | 0 | 1 | 0 | 1 |
| **TOPLAM** | **0** | **4** | **17** | **9** |

Gecis boyunca: **7 → 4 YUKSEK**. Alti bagimsiz temiz kosu tutarli sonuc
verdi; taban tekrarlanabilir.

**Son iki tur (R-15, R-16):**
- `factory` 2 → **1** — sanayi kari artik ust sinif gelirine akiyor.
- `population` 4 → **2** — birikim stogu ve issizlik→memnuniyet baglari kuruldu.
- `ai` 2 → **1** ORTA.

| POP olcumu | R-14 | R-15 | R-16 | R-17 |
|---|---|---|---|---|
| `audit:population` YUKSEK | 3-4 | 4 | 2 | **2** |
| Gelir defteri sapmasi | %1443 | %1084 | %2688 | **%712** |
| Hane butcesi / gelir | 7.2x | 3.0x | 4.3x | **2.1x** |
| Dunya ihtiyac karsilanmasi | — | — | %83.2 | **%86.1** |
| "Sanayi kari akmiyor" | VAR | **KAPANDI** | — | — |
| "POP birikimi yok" | VAR | VAR | **KAPANDI** | — |
| "Issizlik → refah" | VAR | VAR | **KAPANDI** | — |

Kalan iki POP bulgusu esigin ustunde ama sayilar dortte bire indi. Tam
kapanma icin `INCOME_BUDGET_WEIGHT`'in 1'e cikmasi gerekir; olculdu ki bu
mevcut olceklerle **dunyanin ucte birini aca dusuruyor** (bkz. LOG R-17).
Dogru sonraki adim `w` degil, iki formulun OLCEGINI esitlemek.

Hareket eden kalemler (RGO onarimi R-10 sonrasi):
- `budget` 1 → **0** (egitim→sanayi bulgusu dustu: sanayi artik fiilen kadro
  aliyor)
- `strategy` 1 → **0** (baskin politika seti kayboldu)
- `population` 4 → **3**
- `factory` 0 → **2** — bu ikisi sonradan EKLENMEDI, **gorunur oldu**:
  sanayi girdisiz oldugu icin neredeyse hic calismiyordu; calismaya baslayinca
  onceden var olan iki muhasebe acigi esigi asti (fabrika kari haneye/hazineye
  akmiyor — haftada ¤1327.7; 467 isci iki yerde sayiliyor). Kok, P1-2 ile
  ayni: POP gelir defteri.

**Yeni denetimler** (hepsi temiz):

| Denetim | Sonuc |
|---|---|
| `trade-consequence-audit.mjs 520` | INFO 1 (izleme kalemi), kusur yok |
| `peace-stakes-audit.mjs` | 5/5 gecti |
| `stability-audit.mjs 420` | bulgu yok |
| `military-strategy-audit.mjs 400` | bulgu yok |
| `supply-response-audit.mjs 520` | bulgu yok |

---

## 8. DUNYA PIYASASI (Phase 7) — R-10

**Kosum:** `node scripts/audit/supply-response-audit.mjs 520` (yeni)

| Olcum (520 hafta) | Once | Sonra |
|---|---|---|
| Kalici tavan mali (>%50 hafta) | **10** | **6** |
| Kukurt | 1 kume / 1 hex, arz 0.2, talep 7.1, **8.0x** | **11 kume**, arz 12.1, listeden cikti |
| Gubre arzi | 0.1 (talep 37.6) | **9.4** |
| Cimento arzi | 13.6 (talep 64.7) | **22.9** |
| Muhimmat | %94.8 tavanda, 8.0x | **%76**, 5.7x, arz 6.4 / talep 6.7 |
| Komur fiyati | 25.79 (**6.4x taban**) | **3.44** |
| Ipek · Luks Kumas · Luks Mobilya · Tropik Agac | hepsi 8.0x | listeden cikti |

Beta'nin imza sikayeti — *"coal pinned at the ceiling for seventy years"* —
olculebilir sekilde hafifledi.

### 8.0 `audit:long-run` uzerinde dogrulama (bagimsiz olcum)

| Olcum | Once | Sonra |
|---|---|---|
| En kotu kosuda fiyat sinirinda mal | **%65.1** | **%53.5** |
| Tavandaki mal @260 / 520 / 1040 hafta | 12.6 → 16.4 → **17.5** | 8.6 → 11.0 → **10.5** |

Sayidan daha onemlisi **egilim**: onceden tavandaki mal sayisi zamanla
BUYUYORDU (beta'nin *"the world is hungrier than when it started"* bulgusu);
simdi kararliya oturuyor.

### 8.2 KALAN — urun haritasinda yapisal talep aciği (yeni, en buyuk P1)

Onarim dagitimi duzeltir, TOPLAM kapasiteyi degistirmez. 65 uluslu urun
haritasinda 1866'da olculen arz/talep:

| mal | arz | talep | oran |
|---|---|---|---|
| komur | 97.3 | **948.1** | 8.0x |
| kukurt | 58.9 | 531.8 | 8.0x |
| demir | 141.2 | 289.8 | 8.0x |
| gida | 1.094.6 | 1.254.0 | 8.0x |

Yaklasik **1:10** yapisal acik. Bu R-10'un URETTIGI bir sorun degil (degisiklik
arzi yalnizca artirir) — 65 ulusun sanayi talebi ile dunya RGO kapasitesi
arasindaki onceden var olan dengesizlik. Cozumu RGO taban ciktilarinin ya da
sanayi tuketim oranlarinin kuresel olarak yeniden dengelenmesidir; butun
denetim taban cizgilerini kaydirir ve bu oturumda guvenle baslatilamazdi.
Bkz. REMAINING_OPEN_BETA_ISSUES **P1-1b**.

### 8.1 Dis hesap, RGO onarimindan SONRA (urun haritasi, 520 hafta)

RGO onarimi ticaret hacimlerini degistirdigi icin R-01 yeniden dogrulandi:

| Grup | Ort. hazine | Ort. haftalik net | Ort. borc |
|---|---|---|---|
| Ticaret acigi verenler (36) | 5.808 | **−16.7** | 457 |
| Ticaret fazlasi verenler (27) | **24.109** | **+86.1** | **0** |
| **Oran** | **4.15x — yon dogru** | | |

Acik veren ulkeler artik ortalama **negatif** haftalik butceyle yasiyor.

**Denetim yapilandirmasi notu:** bu denetim artik **urun haritasinda**
(160x96, ~65 ulke) kosuyor. RGO onarimindan sonra kucuk denetim haritasinda
(78x62, 30 ulke) oran 0.93, urun haritasinda 3.90 cikti — kucuk harita 30
ulkeyle daha kapali bir ekonomidir ve ticaret her GSYH'de daha kucuk pay
tutar. Dogru cevap esigi gevsetmek degil, sevkedilen dunyayi olcmekti.

### Kalan YUKSEK bulgular — hepsi ONCEDEN VAR OLAN

Hicbiri bu geciste eklenmedi; hepsi beta raporunun da isaret ettigi
mimari eksikler:

1. **Egitim → sanayi isgucu** — 1040 haftada kadro farki %2.0 (beta B-07).
2. **POP gelir defteri tutarsiz** (x3) — `needsBudget` gelirden turemiyor,
   hane butceleri gelirin 7.2 kati, `savings` stogu yok.
3. **Issizlik → hane memnuniyeti** — memnuniyet istihdami gormuyor.
   (Ulusal yarisi R-05 ile kapandi: issizlik artik istikrara giriyor.)
4. **Baskin politika seti** — "tam sosyal" butun eksenlerde ustun.
5. **Piyasa fiyat bandinda kilitleniyor** — mallarin %65'i sinirda (Phase 7).

Ayrinti ve sonraki adimlar:
[REMAINING_OPEN_BETA_ISSUES.md](REMAINING_OPEN_BETA_ISSUES.md).

### Determinizm

`audit:determinism` **temiz** — ayni tohum ayni sonucu veriyor.
Simulasyon semantigi hiz icin degistirilmedi; eklenen tek sicak-yol isi
haftada **tek** dunya taramasidir (`refreshNationalStrain`), ulke basina
degil.
