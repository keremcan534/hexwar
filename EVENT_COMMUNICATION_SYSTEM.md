# OLAY ILETISIM SISTEMI — simulasyon nasil konusur

Kor Beta #2'nin hukmu: **"iyi simulasyon, sessiz oyun."** Simulasyon borc,
temerrut, rejim degisimi, ordunun yok olusu ve baskent kaybi uretiyordu; oyun
bunlarin hicbirini soylemiyordu. Bu gecis o katmani kurdu.

**Hicbir olay UYDURULMADI.** Her duyuru gercek simulasyon durumundan
turetilir; olay saptayicisi haftada bir ulkeye bakar ve GECIS oldugunda
konusur.

---

## 1. AGIRLIK KADEMELERI (`src/game/chronicle.js` · `TIER`)

| Tier | Ne | Sunum | Vakayiname | Durdurur |
|---|---|---|---|---|
| **0 AMBIENT** | gunluk isleyis: kucuk tesis, muharebe turu, fiyat hareketi | akan toast | hayir | hayir |
| **1 IMPORTANT** | arastirma bitti, subay atandi, bir alay dustu | belirgin kart, uzun omur | hayir | hayir |
| **2 MAJOR** | savas, baris, borc, kritik kredi, rejim, baskent isgali | serif baslikli **ulusal olay karti** | **evet** | hayir |
| **3 EXISTENTIAL** | temerrut, ordunun yok olusu, baskent kaybi, kampanya sonu | pirinc cerceveli **ilan** | **evet** | **evet** |

Tier `NOTIFY` tablosunda tur basina tanimlidir, `meta.tier` ile tek olayda
yukseltilebilir: ayni ARMY turu hem "bir alay dustu" (1) hem "ordu yok oldu"
(3) olabilir.

## 2. TEK HUNI

```
gercek simulasyon durumu
        │
        ▼
runNationalEvents (events.js)   ── haftalik gecis taramasi, YALNIZ oyuncu
        │
        ▼
announce (chronicle.js)  ──►  recordChronicle  (tier >= 2 ise ulusal tarihe)
        │
        ▼
turns.addLog  ──►  NotificationCenter.push  ──►  ui/notifications.js
                          │
                          └─ halt (tier 3 ya da meta.halt) ──► setSpeed(0)
```

Gunluk, bildirim ve vakayiname **ayni hunide** bulusur: bir olayin uc yerde
ayri ayri yazilmasi mumkun degil.

## 3. HANGI OLAYLAR DUYURULUYOR

### Borc durum makinesi (`debtPhase`)

`clear → minor → indebted → critical → default` — yalnizca **gecis** konusur.

| Gecis | Baslik | Tier | Durdurur |
|---|---|---|---|
| clear → indebted | The treasury borrows | 2 | hayir |
| * → critical | Credit is running out | 2 | hayir |
| * → default | The state defaults | **3** | **evet** |
| gercek borctan → clear | The debt is cleared | 2 | hayir |

`minor` kademesi bilerek **sessizdir**: bir haftalik ¤7'lik acik ulusal olay
degildir. Esik `max(¤120, bir aylik gelir)` — hem histerezis saglar hem olayi
haber degeri olan yere baglar.

### Rejim

`governmentType(nation)` degistiginde: `Eski → Yeni` basligi, iktidar partisi
ve **gercek sonucu** ("Fiscal limits follow its policy" — oyuncunun kaydirac
bantlarini belirleyen sey budur).

### Baskent

`held / occupied / lost` durum makinesi. Isgal (tier 2) ile **kalici kayip**
(tier 3) ayrilir; geri alinis da duyurulur.

### Ordu

Haftalik alay sayisi farkindan turer — her zayiat degil, **anlamli esik**:

- alay sayisi 0'a dustu → *The army is gone* (tier 3)
- bir haftada %34'ten fazlasi gitti (en az 3 alaydan) → *The army is broken* (tier 2)
- daha kucuk kayip → *A regiment is destroyed* (tier 1)

### Baris

`signPeace` artik sonucu ozetler: kac eyalet alindi/verildi, hangi maddeler
(tazminat, vassallik, azinliklarin serbest birakilmasi). Beyaz barista
"borders stand as they are".

### Arastirma

Kart zaten vardi ama 11 saniyelik gecici toast'ti ve hiz 8'de fark
edilmiyordu. Artik **kalici** (`ttl: 0`) — okunana kadar durur, ama
DURDURMAZ (arastirma bitisi her seferinde zamani durdurursa yorucu olur).

## 4. GURULTU NASIL ENGELLENIYOR

**Dort ayri fren:**

1. **Durum makinesi** — olay ancak DEGISIMDE konusur. Borc surdugu her hafta
   degil, borca GIRILDIGINDE.
2. **Anlamli esik** — `minor` borc, kucuk alay kaybi, kisa dalgalanma sessiz.
3. **Tekrar sogutmasi** (`throttled`, 156 hafta) — ayni olay uc yildan once
   tekrarlanmaz. Kalibrasyon kaniti: rejim etiketi yillik secimlerle gidip
   geliyordu ve 100 yilda **13 kez** "rejim degisti" diyordu; sogutma bunu
   ~4'e indirdi.
4. **Kart birlestirme** (mevcut mimari) — ayni anahtarli olay yeni kart acmaz,
   var olanin sayacini artirir; tekrar eden olay **yeniden durdurmaz**.

## 5. TEKRAR ENGELLEME KAYIT SONRASI DA CALISIR

Durum makinesi (`nation.events`) ve sogutma haritasi (`events.said`) kayda
girer. Tarayicida dogrulandi: kaydet → sayfayi yenile → yukle → 6 hafta
oynat sonrasi vakayiname 5 → 6 oldu ve eklenen tek satir **gercek yeni bir
gecisti** ("Credit is running out"); "The state defaults" tekrarlanmadi.

Ayrica `ensureEventState` **null sentinel** kullanir: ilk gozlem TEMEL
CIZGIDIR, olay degil. Borclu bir kayit yuklendiginde oyun "az once
borclandiniz" demez.

## 6. OLCULEN YUK

`npm run audit:events` uc tohumda 50'ser yil kosar ve yillik butceyi olcer.
Esikler: **yilda en cok 2 zorunlu duraklama**, **50 yilda en az 2 ulusal
olay**, **yuzyilda ayni baslik en cok 4 kez**, **on yilda en cok 12 kayit**.

Performans: olay tarayicisinin tam maliyeti tarayicida olculdu —
**haftada 0.012 ms** (373 birimli dunyada, 500 cagrilik ortalama). Haftalik
tikin (~85 ms) on binde biri.

## 7. NE YAPILMADI (bilincli)

- **Olay betikleme dili yok.** Olaylar durum farkindan dogar; yazili senaryo
  yoktur.
- **Her olay modal degil.** Tek bir modal bile yok: en agir sunum bile
  bildirim yiginindaki bir karttir (kampanya sonu haric).
- **YZ ulkelerinin ic gecisleri taranmaz.** Oyuncunun ekranini bolmez, kaydi
  sisirmez.
- **Ses dosyasi eklenmedi.** Kart turleri (`kind`) ve tier zaten temiz birer
  kanca; ses varligi geldiginde baglanacak yer hazirdir, uydurma dosya yolu
  yazilmadi.
