# OZEL SERMAYE KILITLENMESI — teshis, duzeltme, kanit

**Siniflandirma:** P0 · GERCEK SIMULASYON HATASI (kilitlenme)
**Kanit kaynagi:** kor Beta #2 kampanyasi (B-027) + bu gecisin bassiz
reprodüksiyonu · **Denetim:** `npm run audit:private`

---

## 1. OYUNCU KANITI

Kor kampanyada oyuncunun ulkesi 20. yildan 80. yila kadar **7 tesiste dondu**.
Hazinede ¤16-25k duruyordu, gubre %16 karsilanmisti (8× taban fiyat), demir
%80'de — yani kar firsati acikca ortadaydi. Oyuncu 60 yil boyunca sanayisinin
neden buyumedigini anlayamadi ve bunu "kapitalistler luks pesinde kosuyor"
diye yorumladi.

**O yorum yanlisti.** Dunya YZ'si ayni kosuda gubreye 81 tesis kurmustu.
Sorun tercih degil, **tikanmaydi**.

## 2. BORU HATTI (izlenen tam zincir)

```
autoUpgradeFactory ──> queueIndustryProject ──> state.projects[]
   (tavana dayanan            (funded: 0,              │
    karli tesis)               actor 'private')        │
                                                       ▼
runPrivateSector ──> fundPrivateProjects ──> fundProject (sermaye akitir)
   │                    (kuyruk sirasi)
   ├─ openPrivate = TUM ozel projeler
   └─ if (openPrivate >= 2) return;  ◄── YENI YATIRIM BURADA OLUYOR
```

## 3. KOK NEDEN — iki disli birbirini kilitliyor

### Disli 1: yukseltme kuyrugu sinirsiz, kapi sinirli

`autoUpgradeFactory` her tavana dayanmis karli tesis icin bir UPGRADE projesi
aciyordu ve **hicbir sayi siniri yoktu**. `runPrivateSector` ise yeni tesis
kurmadan once `openPrivate >= 2` diye bakiyordu ve bu sayima yukseltmeler de
giriyordu.

Yedi tesis tavana dayandiginda yedi yukseltme kuyruga giriyor, kapi bir daha
acilmiyordu. Kalici kilit.

### Disli 2: kuyruk sirasiyla fonlama, bastaki projeyi asla bitirmiyor

`fundPrivateProjects` projeleri **kuyruk sirasiyla** geziyor ve eldeki tum
sermayeyi ilkine veriyordu (`if (available <= 0) break`). Olculen sermaye
akisi haftada ~¤0.17, bir yukseltmenin bedeli ~¤218 idi: bastaki proje
~25 yilda bitiyor, arkasindaki her sey aç kaliyordu.

### Disli 3 (yan): hedefi olmayan proje sonsuza kadar yasiyor

`validProject` yalnizca `Number.isFinite(project.q)` kontrol ediyordu. Savasta
kaybedilen bir bolgenin tesisi icin acilmis yukseltme projesi — hedefi artik
var olmayan bir proje — kuyrukta kaliyor ve slotu tutuyordu.

## 4. TASARIM ILKESI (uygulanan)

> Ozel proje GECIKEBILIR. Para, malzeme, kapasite bekleyebilir.
> Ama **ilerleme ihtimali olmadan kit slotu kalici isgal EDEMEZ.**

Kapitalist karar verme, ozel yatirim, insaat rekabeti ve sermaye sahipligi
mantigi **aynen korundu**. Degisen tek sey: "acik santiye" tanimi.

## 5. YAPILAN DEGISIKLIK (`src/game/economy.js`)

| # | Degisiklik | Neden |
|---|---|---|
| 1 | **Uyku hali**: bir yildir (`PRIVATE_STALL_WEEKS = 52`) tek kurus almayan ozel proje `dormant` isaretlenir | Parasi akmayan proje santiye degil, niyettir |
| 2 | **Kapi uyuyani saymaz**: `active = projects.filter(p => !p.dormant)`, `active >= PRIVATE_ACTIVE_LIMIT (2)` | Kilidin dogrudan cozumu |
| 3 | **Kuyruk tavani**: `PRIVATE_QUEUE_LIMIT = 6`, yukseltme kuyruklamasi da buna tabi | Kuyruk sinirsiz buyuyemez |
| 4 | **Bitmeye-kalan sirasi**: `fundPrivateProjects` en az kalani olan projeyi once fonlar | Her hafta bir seyin BITMESINI garanti eder; toplam harcanan sermaye AYNI |
| 5 | **Gecersiz proje temizligi**: `dropInvalidProjects` hedefi kalmamis UPGRADE/FACTORY projesini duserir, odenmis parayi sahibine iade eder | Hayalet proje slot tutamaz |
| 6 | **Uyandirma**: `supportProject` (oyuncunun hazineden destegi) `fundedTurn` yazar ve uykuyu bozar | Oyuncu mudahalesi anlamli olmali |

**Denge degisikligi YOK:** sermaye uretimi (`collectPrivateCapital`), proje
maliyetleri, kar hesabi, tesis secim siralamasi ve yatirim kurallarina
dokunulmadi.

## 6. KANIT — BEFORE / AFTER

### Kontrollu senaryolar (A-G)

| Senaryo | ONCE | SONRA |
|---|---|---|
| A — nakitli proje tamamlanir | GECTI | GECTI |
| B — gecici parasiz proje devam eder | GECTI | GECTI |
| **C — kalici gecersiz proje slotu birakir** | **KALDI** (2 hayalet proje kalici) | **GECTI** (0 hayalet) |
| **D — hedefi kaybolan yukseltme temizlenir** | **KALDI** (proje duruyor) | **GECTI** (kuyruktan dustu) |
| E — uzun kitliktan sonra toparlanma | GECTI | GECTI |
| F — durmus proje varken yatirim surer | GECTI | GECTI (8→13) |
| G — iki durmus proje + firsat | GECTI | GECTI (8→15) |

### 60 yillik oyuncu ulkesi (3 tohum)

| tohum | tesis ONCE | tesis SONRA | seviye ONCE | seviye SONRA | kilitli hafta |
|---|---|---|---|---|---|
| PRIV1 | 6 → 14 | **6 → 32** | 96 | **105** | 0 |
| PRIV2 | 7 → 25 | **7 → 36** | 117 | **158** | 0 |
| PRIV3 | 6 → 10 | 6 → 10 | 94 | 94 | 0 |

Sanayi buyumesi iki tohumda **iki katina** cikti; ucuncude degismedi (o ulke
zaten `privateBuild` politikasi disindaydi — kilit orada degildi).

**Kilitli hafta = 0** (uc tohumun hicbirinde "kapi kapali + parasi eksik proje
var + sermaye elde duruyor + hicbir sey kimildamiyor" hali 5 haftayi asmadi).

### Dunya sagligi

60 yillik dunya kosusunda toplam tesis **905 → 995**; "kapisi kapali ve parasi
olan" ulke sayisi 0/30. Kilit tek ulkeye ozgu degildi ama sistemik de degildi:
YZ ulkeleri `runEconomicAI` sayesinde devlet eliyle de yatirim yapabildigi
icin gizleniyordu. **Oyuncu ulkesi tek basina `runPrivateSector`e bagli
oldugu icin kilidi tam gucuyle yiyordu.**

## 7. "DURMUS PROJE HALA SONSUZA KADAR ENGELLEYEBILIR MI?"

**Hayir.** Uc bagimsiz kapi var:

1. Hedefi gecersiz proje ayni hafta kuyruktan duser (`dropInvalidProjects`).
2. Fonlanabilir ama fonlanmayan proje 52 hafta sonra uyur ve kapiyi birakir.
3. Uyusa bile bitmeye-kalan sirasi sayesinde sermaye ona degil, bitmeye en
   yakin projeye gider — yani sermaye varken kuyruk **her zaman** ilerler.

Tek kalici blokaj senaryosu: kuyrukta 6 proje varken (tavan) hepsinin fonlanip
insaat kapasitesi bekliyor olmasi. Bu **dogru davranistir** — sermaye ve
santiye zaten calisiyordur.

## 8. KAYIT ETKISI

Yeni alanlar `project.fundedTurn` ve `project.dormant` proje nesnesinin
icindedir; `construction` butun halinde serialize edildigi icin **surum
yukseltmesi gerekmedi**. Eski kayitlar: `fundedTurn` yoksa `started` kullanilir
(uyku sayaci projenin acilis haftasindan baslar). `audit:save` ve
`audit:determinism` temiz.
