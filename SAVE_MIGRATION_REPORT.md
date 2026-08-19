# SAVE MIGRATION REPORT — v14 → v15

## Neden surum atladi

Bina donusumu kayit semasini degistirdi: `nation.construction.buildings`
listesindeki uc tip (CONSTRUCTION_SECTOR, UNIVERSITY, ADMINISTRATION) artik
var olmayan tiplerdir; yerlerine `nation.construction.capacity =
{ construction, education }` ulusal seviyeleri geldi. Kale (FORT) yerlesik
bina olarak kaldi.

`SAVE_VERSION = 15`. `deserialize` v15'i dogal, v14'u **gocle** kabul eder
(`MIGRATABLE_VERSIONS`); daha eski surumler onceki kural geregi reddedilir
(dunya uretimi uyumsuz).

## Goc kurallari (`construction.migrateConstructionV14`)

| Eski kayit | Yeni karsilik | Gerekce |
|---|---|---|
| N x CONSTRUCTION_SECTOR binasi | `capacity.construction += N` | Guc esdegeri birebir: sektor basina +5/hafta ↔ seviye basina +5/hafta; bakim da birebir (4/hafta) — oyuncunun yatirimi tam degerinde |
| N x UNIVERSITY binasi | `capacity.education += ceil(2N/3)` (tavan 4) | Eski tavan 6 bina x %4 = %24; yeni tavan 4. kademe x %6 = %24. 6 bina → kademe 4: tavan degeri birebir; ara degerlerde sapma ≤ %2 puan |
| N x ADMINISTRATION binasi | Hazineye **tam bedel iadesi** (N x 80 altin) | Etki (+%4 vergi/bina) tek yonetim kavramina katildi; ayri bir kurum tutmak plani ihlal ederdi (MERGE #11). Tipik 1 binali ulkede kaybedilen ~1.5/hafta vergi carpani, kazanilan 2/hafta bakim tasarrufu + 80 altinla asagi yukari karsilanir |
| Kuyruktaki SECTOR/UNIVERSITY projeleri | `kind: national` CONSTRUCTION_CAPACITY / HIGHER_EDUCATION projelerine cevrilir (is/ilerleme/finansman korunur) | Odenen para ve yapilan is kaybolmaz |
| Kuyruktaki ADMINISTRATION projeleri | Insa edilmemis pay iade edilir, proje duser | `cancelConstruction` ile ayni iade kurali |
| FORT binalari ve projeleri | Aynen kalir (capa q/r zaten kayitta) | Kale yerlesik kaldi; yeni yerel etki capayi dogrudan okur |
| Kademe tavani ustu fazla proje | Tamamlanirken sessizce biter, seviye tavani asamaz | `completeProject` tavan kontrolu |

Siralama kritik: goc `ensureConstruction`'dan **ONCE** kosar — ensure, tabloda
olmayan tipleri filtreleyip atar; goc ham kayittan saymalidir. (Bu tam da ilk
uygulamada yakalanan hataydi; `construction-diagnostic` artik bunu sinar.)

Diger v14 kalintilari surum atlamasi gerektirmeden temizlenir:
- `economy.inventory`, bilinmeyen pazar mallari (`synthetic_oil`),
  `regiment.tier`: yuklemede dusurulur.
- `command.autoAssign`: kayitta acikca yazili deger AYNEN korunur (varsayilan
  degisikligi yalniz yeni uluslara/kayitsiz alana uygulanir).
- FACTORY_RIGHTS anlasmalarindan kalanlar zararsizdir ve surelerinde biter.

## Test: eski kayit → goc → yukle → simule → tekrar kaydet → tekrar yukle

`scripts/construction-diagnostic.mjs` icinde otomatiklestirildi:

1. v15 dunyasi kurulur, kapasite/kurum/kale kurulur, `serialize` edilir.
2. Ayni kayittan v14 fikstürü uretilir (2 sektor + 1 universite + 1 idare +
   1 kale binasi; kuyrukta 1 universite + 1 idare projesi).
3. `deserialize` v14 → dogrulanan sonuclar: `capacityFromSectors` (2 seviye),
   `educationFromUniversity` (1 kademe), `fortSurvives`, `adminRefunded`
   (2x80 iade), `universityProjectConverted`, `adminProjectDropped`,
   `powerPreserved` (guc 15 = taban 5 + 2 seviye x 5).
4. Yuklenen dunya calistirilir; v15 kaydi tekrar yazilip yuklenir
   (`savePreserved`). Temerrut kademesi (creditPenalty) etkileri koreltir,
   odeyen ulkede korunur (`solventKeeps`/`defaultDegrades`).

Sonuc: **27/27 kontrol geciyor.**

Ayrica `audit:save` (v15 dogal yolu) tam takimda geciyor: kaydetme aninin
parmak izi = yukleme aninin parmak izi; kaydet-yukle-100 hafta = kesintisiz
100 hafta (alan alan birebir).

## Bilinen sinirlar

- v14 → v15 goc tek yonlu: v15 kaydi eski kod tarafindan acilamaz (beklenen).
- Eski kayitta `autoAssign: false` acik degerdir ve korunur; beta'nin istedigi
  "acik varsayilan" yalniz yeni oyunlarda kendiliginden gelir. Eski kayit
  sahibi tek tikla acar.
- Goc, oyuncunun ELINDEKI kayitla olculdu (sentetik fikstur); gercek v14
  localStorage kaydiyla uctan uca tarayici testi yapilmadi (bkz.
  REMAINING_MECHANIC_DEBT).
