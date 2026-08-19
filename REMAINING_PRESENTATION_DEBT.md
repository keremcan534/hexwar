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

Gecis sonrasi tam takim: **0 KRITIK · 5 YUKSEK · 10 ORTA · 5 DUSUK**.
Bes YUKSEK'in tamami tek tek acildi (`COMMUNICATION_PASS_FINAL_REPORT.md` §G);
**hicbirine dokunulmadi**:

1. **Fiyat bandi / uzun kosu deflasyonu** (%57.1) — pazar mimarisi isi,
   brief'in 1. non-target'i.
2. **Kartopu / kume devri** — war-pressure %37.2 **ve** border-change
   %36.0-41.5, ayni bulgu iki denetimde. Brief'in 2. non-target'i.
3. **Cullanma** — azami eszamanli saldirgan 4 (esik 3).

Bunlar `REMAINING_CORE_HIGH_ISSUES.md` ve `CORE_STABILIZATION_LOG.md`de
karakterize edilmis durumda ve bu gecisin kapsamina alinmadi.

**Onemli kayit — savas sayilarini P0 duzeltmesi oynatti.** A/B ile olculdu
(eski `economy.js` yerine konup denetim yeniden kosuldu): kartopu %33.0 →
%37.2, cullanma 3·3·3 → 3·3·4. Sebep basit — ozel sektor gercekten insa
etmeye baslayinca YZ sanayisi ve askeri kapasitesi buyudu; eski dunya
herkesin sanayisi dondugu icin yapay olarak sakindi. Savas kodu bu geciste
**hic degistirilmedi**, ve dunya kartopu olmuyor: 17 uzun kosuda 0 degismez
ihlali, 1040. haftada hala 27-28 canli ulke, savasan ulke orani duşuyor
(%24.2 → %18.2). Bu sayilari geri cekmek savas dengesini ayarlamak olurdu —
brief'in acikca yasakladigi sey.

## AYRICA: denetim harness'inde bir tanisal hata (oyun kodunda degil)

`scripts/audit/budget-audit.mjs:164` egitimin sanayi isgucune etkisini
`Math.abs(dEmpFar) < 0.05` ile olcuyor — yani **buyuklugu** olcuyor,
**yonu** degil. A/B testi bunu kanitladi: P0 oncesi kod beklentiyi
(*"egitim isealimi hizlandirmali"*) **ters yonde %11.9 ihlal ediyor** ve tam
da bu buyukluk sayesinde `OK` basiyordu; simdiki kod **dogru yonde +%2.4**
veriyor ve `[HIGH]` aliyor.

Yani bu YUKSEK, gecmisten **daha iyi** bir dunyayi raporluyordu.

**DURUM: KAPANDI** (bu gecisin disinda, ayri bir harness adiminda). Duzeltme
tek satirdan buyuk cikti: olcum yonlu yapildi, etkinin **gorulebildigi** ufuga
(260 hafta) tasindi ve tek tohum yerine **panel ortalamasina** baglandi —
cunku olcum, 1040 haftada tek tohumun bir tahmin edici olmadigini gosterdi
(6 tohum: ortalama +%0.8, sapma %3.2, ucu negatif). Ayni blokta bayat bir
`[LOW]` da duzeltildi: okuryazarlik artik gercekten bir stok ve kayda giriyor.

`audit:all` 5 YUKSEK → **4 YUKSEK**; **oyun kodu degismedi**. Tam gerekce:
`AUDIT_HARNESS_CORRECTION.md`.
