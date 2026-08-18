# REMAINING MECHANIC DEBT — bilinen borclar ve acik uclar

Budama gecisinin BILEREK birakigi isler. Her madde: ne, neden simdi degil,
kanit nerede. "Onceden var" = taban cizgide (4e49602) ayni bulgu ayni
siddette olculdu.

## Sistemik (onceden var, budamanin disinda)

1. **Uretim zincirinin orta katmani kurulmuyor** — 1040. haftada mallarin
   %57-62'si fiyat bandinda kilitli; DYE_WORKS hic insa edilmiyor, islenmis
   mal arzi kronik kit. (`audit:long-run` HIGH, taban cizgide de ayni kok.)
   Cozum fiyat bandi degil, YZ/ozel sermaye tesis secim mantigi.
2. **Isci cift sayimi** — fabrika kadrolari ulusal isci sayacini 3-6k asiyor
   (`audit:factory` HIGH, taban cizgide 3,049 / bu dalda 6,128 — ayni kok).
3. **Kohort muhasebesi** — meslek sayaclari ile 1000'lik kohortlar arasinda
   5,000 kisilik sapma (`audit:population` HIGH, taban cizgide ayni).
4. **POP gelir defteri ikiligi** — `income` uretim degerinden, `needsBudget`
   sabit sepetten turuyor; ayni hanenin iki bagimsiz hikayesi
   (`audit:population` HIGH, taban cizgide ayni + orada fazladan bir HIGH
   daha vardi). Sosyal kaydiraclarin "tek cevapliligi" da buraya bagli:
5. **Vergi hala monoton (Laffer yok)** — %100 vergi matrahi kuculttugu
   halde (nufus −%27, sanayi −%8) hazineyi hala buyutuyor; cunku sinif
   geliri uretim DEGERINDEN turuyor ve fiyat tavani kitlikta degeri yuksek
   tutuyor (`audit:strategy` MEDIUM). Kok yine 4. maddedir. Not: taban
   cizgideki "baskin tam-sosyal set" HIGH bulgusu son kosuda KAPANDI
   (kriz maliyesi + pahalanan dunya tam sosyali bedavaliktan cikardi).
6. **Cullanma tavani 4** — esik 3, olculen azami 4 escamanli saldirgan
   (`audit:war-pressure` HIGH, taban cizgide de 4). Saldirgan sayaci
   koalisyon savaslarini istisna sayiyor; kacak orada.
7. **Kartopu esigi kilpayı asiliyor** — 50 yilda kumelerin %34.8'i el
   degistiriyor (esik %33.3). Taban cizgide %33.2-34.2 olculmustu; donmus
   savas duzeltmesi kapanan savas sayisini artirdigi icin sinir trafigi
   hafif yukari geldi. Esik degeri mi davranis mi, ayri bir kalibrasyon
   karari.

## Budamanin actigi / birakigi

8. **Sehirsiz kalinti devletler** — fetih sonrasi sehri kalmayan ama onlarca
   fabrikasi "yasayan" uluslar: geliri ~7/hafta, kredi cezasi 0.8'de sabit
   (kriz modu artik calisiyor: terhis + tasfiye + yeniden yapilandirma ile
   borc stoklari kucuk, ama yapisal acik suruyor). Dogru cozum budama degil
   tasarim: ilhak/vassallik yolu ya da sahipsiz fabrika devri. 1300. haftada
   kredi cezasi tasiyicilarinin neredeyse tamami bu sinif.
9. **Gumruk geliri iceride hala yuksek-tarife-lehine** — disa bagimliligi
   dusuk ulke icin hazine hala yuksek tarifede maksimize oluyor; bedel
   (sepet +%14, girdi +%12, ihracat misillemesi) gercek ama vergi tabani
   kadar guclu degil. (`audit:tariff` bulgusuz geciyor; bu bir denge notu.)
10. **Eski kayitta autoAssign** — v14 kaydinda acikca `false` yazili deger
    korunur (bilincli: oyuncunun secimini gocle ezmiyoruz); yeni varsayilan
    yalniz yeni oyunlarda. Tek tikla acilir.
11. **Gercek tarayicida v14 localStorage gocu** — goc sentetik fikstürle
    27 kontrolde dogrulandi (`construction-diagnostic`); gercek eski bir
    localStorage kaydiyla uctan uca tarayici testi yapilmadi (elde eski
    kayit yok).
12. **Reform merdivenleri: 21 basamagin 10'u etkisiz** — kesip atmak yerine
    baglamak gerek (oy hakki/asker hakki gibi kavramlar siyasetin iskeleti);
    bu gecisin kapsamina alinmadi (NO NEW BIG FEATURES).
13. **Donanma devri asgari** — AUTO karada oldugu kadar denizde akilli
    degil; konvoy/devriye niyet katmani yok. Kucuk donanmalarda sorun
    degil, buyukte mikroya donebilir.
14. **timber/iron net akislari yalniz isci agirligina giriyor** — insaat
    malzemesi olarak gercek tuketicileri yok; ya tuketici baglanmali ya
    UI'da "insaat girdisi" imasi kaldirilmali (simdilik ima yok, sorun
    pasif).
15. **Kale terki yok** — kuyruktaki kale iptal edilebilir ama dikilmis kale
    sokulmez; kriz tasfiyesi de kaleye dokunmaz (bakim 1.5/hafta, kucuk).
    Yatirim seviyeleri icin eklenen − dugmesinin kaleye genellemesi kucuk
    bir is, istenirse.
16. **Kredi cezasi erimesi hazine esigine bagli** — `gold > 25` olmadan
    ceza erimez; geliri sifira yakin kalinti devlet suresiz cezali kalir
    (tematik olarak savunulabilir, mekanik olarak duz cizgi). 8 cozulurse
    kendiliginden onemsizlesir.

## Onerilen siradaki 5 is (etki x kucukluk)

1. Kalinti devlet tasarimi (8): ilhak-artigi ulkelere vassallik/emilme yolu.
2. POP gelir defteri birlestirme (4 → 5'i de cozer): tek gelir hikayesi.
3. Orta katman sanayi YZ'si (1): girdisi kit mallara tesis secimi.
4. Cullanma sayacina koalisyon istisnasini kapat (6).
5. Reform merdivenlerini baglama turu (12): basamak basina tek gercek etki.
