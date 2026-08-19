# KALAN SUNUM BORCU — bu gecisin bilerek yapmadiklari

Bu gecis **P0 kilitlenmeyi** cozdu, **iletisim katmanini** kurdu, **UI
yalanlarini** duzeltti ve **kampanyaya bir son** verdi. Asagidakiler bilinen,
olculmus ve **bilincli olarak** siradaki tura birakilan islerdir.

Siralama: oyuncu etkisine gore.

---

## 1. Reform merdiveni ekonomiye bagli degil (MEKANIK — kapsam disi)

Politics ekraninin kendi dipnotu soyluyor: *"Enacted laws are recorded and
shown here; they do not yet feed the economy."* Kor testcinin ikincil
hedeflerinden biri buydu ve bos cikti.

**Neden simdi degil:** Bu bir SUNUM sorunu degil, eksik mekanik. Cekirdek
dondurmasi altinda reform etkilerini baglamak yeni bir denge turu acar.
**Bir sonraki mekanik turunun bir numarali adayi.**

## 2. Ittifak/garanti diplomasisi yok (EKSIK OYNANIS)

Diplomatik fiil kumesi hala: savas ilan et · baris teklif et · masa maddeleri.
Kucuk devletin elinde toprak vermekten baska arac yok. Kor kampanyanin gec
oyununu bosaltan sey buydu.

**Neden simdi degil:** Brief acikca "DO NOT add alliance diplomacy yet" dedi.

## 3. Kampanya sonu istatistikleri dar (SUNUM — sayac eksikligi)

Kapanis ekrani su an nufus/toprak/sanayi/okuryazarlik/hukumet/siralama
gosteriyor. Brief'in istedigi digerleri **guvenilir sayaci olmadigi icin**
cikarildi:

| Istenen | Neden yok |
|---|---|
| savas sayisi / kazanilan / kaybedilen | kampanya boyu sayac tutulmuyor |
| zirve hazine / en kotu borc | anlik deger var, zirve saklanmiyor |
| kazanilan/kaybedilen toprak | acilis-kapanis farki var ama akis yok |
| buyuk guc yillari | "buyuk guc" esigi tanimli degil |

**Yol:** `nation.opening` gibi ucuz bir `nation.tally` sayaci (savas acildi,
savas bitti, zirve hazine, en kotu borc) haftalik taramada guncellenebilir —
~10 satir, kayda ~80 bayt. Uydurma sayi gostermektense eksik gosterildi.

## 4. Rejim etiketi sarkaci (SUNUM + MEKANIK ARASI)

`governmentType` iktidar partisinin ideolojisinden turedigi icin yillik
secimler etiketi "Absolute Monarchy ↔ Presidential Dictatorship" arasinda
gidip getirebiliyor. Sogutma bunu yuzyilda 13'ten **4**'e indirdi ama kok
neden duruyor: **etiket bir kurumdan degil, gecici bir cogunluktan turuyor.**

**Yol:** ya `governmentType` histerezisli olmali (bicim degisimi icin birkac
yillik surdurulmus cogunluk), ya da diktatorluk alt-turleri tek bir bicim
sayilmali. Ikisi de politika mekanigine dokunur → kapsam disi.

## 5. Kart yigininda gecmis yok, yalniz vakayiname var (SUNUM)

Tier 0/1 kartlar (fabrika bitti, alay dustu, subay atandi) kaybolduktan sonra
geri getirilemez; yalnizca tier 2+ vakayinameye girer. `turns.log` hala 30
satirlik bicimlenmis halka tampon.

**Neden simdi degil:** Brief "3000 satirlik bildirim dokumu" istemiyordu ve
"az ve kullanisli" dedi. Ama "gecen ay hangi fabrika bitti" sorusunun cevabi
su an hicbir yerde yok. Kucuk bir "son 50 bildirim" sekmesi ucuzdur.

## 6. Ulke secim ekrani yok (EKSIK OYNANIS)

Kor beta B-001. Motor `playerNation`i zaten parametrik tutuyor; eksik olan
yalnizca on yuz adimi. Kapsam disi birakildi cunku bu bir sunum degil,
yeni-kampanya akisi tasarimidir.

## 7. Ses kancalari bagli degil (SUNUM)

Olay turleri (`kind`) ve `tier` temiz birer kanca noktasi; ama ses varligi
olmadigi icin **hicbir dosya yolu yazilmadi** (brief: "Do not hardcode missing
file paths"). Ses geldiginde baglanacak tek yer `NotificationCenter.push`.

## 8. Duraklama tercihleri yok (SUNUM — dusuk oncelik)

Su an tier 3 daima durdurur, tier 2 durdurmaz (savas ilani haric). Brief
"varsayilan mantikli davranis daha onemli" dedi ve ayar ekrani istemedi.
Olculen kesinti orani yilda 0.1-0.3; ayar ihtiyaci henuz dogmadi.

## 9. Baskent olaylari tarayicida dogal olarak tetiklenmedi (TEST BORCU)

Baskent isgali/kaybi kod yolu ve bassiz kosuda dogrulandi; tarayicida gercek
bir savasla tetiklenmedi (kontrollu savas kurmak icin uzun bir kampanya
gerekiyordu). Kod yolu `capitalPhase` uzerinden nettir ama **canli
dogrulama eksiktir**.

## 10. Beta #1'den devreden kucuk kusurlar

- Muharebe raporlari hala ham hex koordinati kullaniyor
  ("Ulheim engaged at 27, 23") — Beta #1'den beri **UNCHANGED**.
- Baris masasi eyalet kartlarinda RGO/uretim bilgisi yok (B-023); veri bir
  dosya otede hazir (`provinceRgoStatus`), yalnizca cizilmiyor.
- "1-regiment Army (enemy)" etiketi baris halinde de "enemy" diyor (B-004,
  dogrulanmadi).

---

## OLCULEN, KAPATILMAYAN CEKIRDEK BULGULAR (degismedi)

`audit:all` iki YUKSEK bulguyla geliyor ve **ikisine de bilerek
dokunulmadi**:

1. **Fiyat bandi / uzun kosu deflasyonu** — pazar mimarisi isi.
2. **Kartopu / sinir devri** (%41.9-46.8) — esik tanisal, oynanis deseni
   bozuk degil.

Bunlar `REMAINING_CORE_HIGH_ISSUES.md`de karakterize edilmis durumda ve bu
gecisin kapsamina alinmadi.
