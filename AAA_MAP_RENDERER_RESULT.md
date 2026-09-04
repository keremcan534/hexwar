# AAA Map Renderer — deney sonucu

**BASE COMMIT** `66183b7caa6dc5c197d6b2ec7e3f4a1b0c9b405d`
**SOURCE BRANCH** `gorsel-kimlik-ve-ihtiyac-kademeleri`
**NEW BRANCH** `experiment/aaa-map-renderer` — birleştirilmedi.

Simülasyona, dünya üretimine, sahipliğe, orduya, ekonomiye dokunulmadı.
Değişen dosyalar yalnız `src/render/` altında (+ dev sunucusuna ekran görüntüsü
kancası, + `maplab.html` tezgâhı).

---

## RENDERER PATH CHOSEN: A — Canvas2D, katmanlı ön-pişirme

**Neden WebGL2 değil.** Eksik olan şey rasterleştirme gücü değil, YÜZEY
MALZEMESİ idi: dolgular düz renkti. Mevcut Canvas2D borusu zaten üç kademeli
bir önbellek mimarisi taşıyor (uzak dünya dokusu, yakın statik katman çifti,
dilimli arka plan işleri) ve sarmal dünya kopya bantlarını, etiket yerleşimini,
birim sayaçlarını, seçim/işgal katmanlarını bu mimariye göre çözmüş. WebGL2'ye
geçmek bu 3300 satırın tamamını yeniden yazmak demekti — hedefe götüren şey ise
bir avuç **önbelleğe pişmiş modülasyon katmanı**ydı. `water.js` bunun bu depoda
uygun maliyetle yapılabildiğini zaten kanıtlıyordu.

Karar ölçütü şuydu: eksik görsel nitelikleri Canvas2D ile üretmek mümkün mü?
Evet — ve kare başına maliyet ödemeden, çünkü hepsi statik katmana pişiyor.

---

## Katman sözleşmesi (uygulanan)

```
1  SU TABANI          water.seaColor — kıyıdan uzaklığa göre derinlik rengi
2  SU DETAYI          water: gök gradyanı, swell/ripple/shimmer, köpük
3  KARA TABANI        ownerTint / terrainTint — ülke kimliği
4  ARAZİ / RÖLYEF     material: tepe gölgelemesi (yükseklikten)
5  ÜLKE MALZEMESİ     material: ortam ışığı + pigment + kâğıt greni
6  KIYI               paintShore (kara tarafı, iki halka) + drawCoastline (deniz)
7  İÇ SINIR           drawGrid (zoom duyarlı) → drawProvinceEdges
8  ULUSAL SINIR       drawBorders (kenar gölgesi + mürekkep + sıcak iç hat)
9  ETİKETLER          drawLabels
10 HARİTA İKONLARI    drawCities
11 BİRİMLER           drawUnitCounters / drawFronts / drawBattles
12 SEÇİM / SAVAŞ      drawSelection / drawHighlight / işgal taraması
13 ATMOSFER           .map-film (DOM): film greni + vinyet + sıcak derece
```

3-5 arası `overlay` ile biner ve **statik katmana bir kez pişer**; 1-2 ve 10-12
canlı karede çizilir.

---

## BEFORE / AFTER PERFORMANCE

Ölçüm: harita laboratuvarı, 1600×900, seed AAA111, 80 kare/örnek.
Ortam **yazılım rasterleştiren önizleme penceresi** — mutlak sayılar düşük
donanımı temsil eder, varyans yüksektir.

| | material KAPALI | material AÇIK |
| --- | --- | --- |
| Yakın kare (zoom 1.15) p50 | **1.5 ms** | **1.5 ms** |
| Uzak kare (zoom 0.38) p50 | 8.5 / 9.2 ms | 11.3 / 3.1 ms |
| Statik katman pişirme | 20.5–21.6 ms | 10.5–13.5 ms |
| Uzak önbellek tam pişirme | 70–94 ms | 61–97 ms |

Kare p50 iki durumda da aynı: **malzeme kare başına hiçbir şey ödemiyor**,
tasarım gereği önbelleğe pişiyor. Pişirme farkı bu ortamın gürültü tabanının
altında kaldı (açık/kapalı sıralaması sonucu tersine çevirebiliyor), bu yüzden
"pişirme hızlandı" DENMEZ.

Malzemenin kendi maliyeti ayrıca izole edildi (`getImageData` ile raster
zorlanarak, 1600×1400 tuval, 25 tekrar):

    material.paint  p50 1.4 ms   (boş çağrı 0.2 ms çıkarılmış)

Yani bir statik katman yeniden kurulduğunda ~1.4 ms ekleniyor; katman ancak
kaydırma payı aşılınca ya da zoom yerleşince kurulur.

Hedef (`CLAUDE.md`: uzak < 2 ms, yakın < 5 ms) korunuyor: p50 1.5 ms.
Görülen p95/max sıçramaları (25–43 ms / 140–300 ms) malzeme KAPALIYKEN de aynı
büyüklükte — pişirme dilimleri ve GC, bu deneyin getirdiği bir gerileme değil.

---

## LAYERS IMPLEMENTED

**Yeni:** `src/render/material.js` — dünya başına bir kez pişen ışık alanı
(320×192 teksel = hex başına 2×2), üç bileşenden toplanır: yükseklik
gradyanının güneşe izdüşümü (tepe gölgelemesi), kıta ölçekli ortam ışığı,
orta ölçekli pigment. Arazi tipi başına kabartma kazancı / gren / sıcaklık
karakteri (`CHARACTER`). Üstüne iki döşenebilir **modülasyon dokusu**
(pigment + lif), biri 2.7 kat ölçekte ve 31° dönük — döşeme izi kırılır.

**Retuned:** `water.seaShade` derinlik aralığı, iki halkalı derinlik
yumuşatma, dört kademeli kıyı çizgisi; `paintShore` iki halka; `drawGrid`
zoom duyarlı opaklık; `ownerTint` açıklık bandı.

---

## WATER RESULT

Derinlik aralığı L 27.5→9.5'ten **32→7**'ye, ton kayması 24'ten 31 dereceye
açıldı: sığlık gerçekten turkuaz, abis gerçekten lacivert. Aralık genişleyince
altıgen basamak görünür hale geldiği için derinlik ortalaması **iki halkaya**
yayıldı — deniz artık petek okunmuyor. Ortam ışığı alanı denize de biniyor
(§7 "atmospheric clouding"), deseni water.js'te kaldı.

## LAND RESULT

Düz `fillStyle` yerine malzeme. Ülke kimliği taban renkte kalıyor; üstüne
sırt/vadi ışığı, kıta ölçekli aydınlanma ve boya kalınlığı biniyor. Ülke
açıklık bandı 34-60'tan 27-64'e açıldı — dar bant bütün ulusları aynı pastele
sıkıştırıyordu.

## COAST RESULT

Kara tarafında azalan güçte iki halka (0.15 / 0.06), deniz tarafında dıştan
içe daralan dört kademe (geniş soluk turkuaz → dar parlak turkuaz → kum →
ince mürekkep). Kıyı bir çizgi değil bir geçiş. **Hedefin en gerisinde kalan
katman burası** (aşağıya bakınız).

## BORDER RESULT

Değiştirilmedi; hiyerarşi zaten üç kademeliydi (ızgara < province < ulus) ve
ölçtüğümde sorun sınırın zayıflığı değil **ızgaranın baskınlığıydı**. Izgara
opaklığı sabit 0.10'dan zoom rampasına çevrildi (0.028 → 0.113). Artık önce
kara, sonra hex okunuyor.

## LABEL RESULT

Değiştirilmedi. Denetimde §18-20'nin istediklerinin zaten karşılandığı görüldü:
PCA ile hâkim eksen, satır bazlı en geniş kesintisiz bant, ülke enine göre
punto + harf aralığı, üç kademeli LOD, çarpışma ayıklama, histerezis ve
zamansal erime. Tek bulgu ölçüm tarafındaydı: erime GERÇEK zamana bağlı olduğu
için sıkı döngüyle çizilen karelerde etiketler görünmüyor (laboratuvar bu
yüzden kareleri zamana yayıyor).

---

## SCREENSHOT ITERATION 1 — üç en büyük boşluk

`.shots/base-01-near.png` → `.shots/iter1-near.png`

1. **Harita puslandı.** İlk malzeme `soft-light` ile biniyordu. Ölçüldü:
   soft-light koyu zeminde simetrik değil — b=0.1'de sapma yukarı 0.196,
   aşağı 0.09 taşır. Ortalaması tam %50 gri olan bir alan bile denizi ve
   pigmenti AÇIYOR. Çare `overlay`: orada %50 gri her zeminde birim eleman.
2. **Uzak zoomda kıtalar yandı + yatay dikişler.** Uzak önbellek satır
   bantlarında pişiyor; malzeme her bantta bütün dünyaya sürülüp overlay sekiz
   kez katlanıyordu. Ayrıca döndürülmüş gren geçişi her bandın kendi köşesine
   çapalıydı, faz bantlar arasında zıplıyordu.
3. **Denizde derinlik yok.** Sığlık ile açık deniz arasında ~10 puanlık
   parlaklık farkı algı eşiğinin altındaydı.

## SCREENSHOT ITERATION 2 — üç en büyük boşluk

`.shots/iter2-near.png`, `.shots/iter2-far.png`

1 ve 2 çözüldü (`overlay` + iki süpürmeli uzak pişirme: önce bütün bantların
zemini, sonra TEK geçişte malzeme, sonra bütün bantların mürekkebi — malzeme
hiç dilimlenmiyor, dikiş matematiksel olarak imkânsız). 3 çözüldü (aralık +
iki halkalı yumuşatma). Kalan üç boşluk:

1. **Kıyı hâlâ "pahalı" görünmüyor.** Geçiş var ama bulanık; hedefteki
   "çevresel kontrastla aydınlanmış kıyı" için sığlığın kendi biçimi
   (kıyı-uzaklık alanı) gerekiyor, hex halkası değil.
2. **Tek bir küresel derecelendirme yok.** §12'nin S-eğrisi (koyular daha
   koyu, açıklar sıcak) yalnızca DOM film katmanında ve çok zayıf. Katmanı
   kendi üstüne `overlay` ile basmak bunu tek çağrıda verir ama dilimlenmiş
   statik iş yüzünden "bir kez uygula" garantisi kurulmalı.
3. **Uzak/yakın dal hâlâ aynı malzemeyi kullanmıyor.** Uzak pişirme eski
   `paintAtlas` kâğıdını da sürüyor (kara + okyanus mürekkebi); yakın dal
   sürmüyor. Görsel fark küçük ama sözleşmeye aykırı.

---

## FINAL SCREENSHOT RESULT

`.shots/iter2-near.png` (zoom 1.15) ve `.shots/iter2-far.png` (zoom 0.38).
§28'in soruları:

- Deniz derin hissettiriyor mu? **Evet** (sığlık→abis okunur, petek yok).
- Kıyı pahalı görünüyor mu? **Kısmen** — geçiş var, karakter yok.
- Ülkeler boyanmış mı görünüyor, doldurulmuş mu? **Boyanmış.**
- Ülke adları zarif mi? **Evet** (zaten öyleydi).
- Izgara dünyanın içinde eriyor mu? **Evet.**

---

## KNOWN LIMITATIONS

- **Hedef görsel belirsiz.** İstemde "ekteki görsel HEDEFTİR" deniyor ama iki
  ekran görüntüsü de AYNI oyunun aynı tohumundan (Kazylstan, 12 Apr 1850,
  £5,701). Hangisinin hedef, hangisinin mevcut durum olduğu doğrulanamadı; bu
  yüzden §6'nın açık listesi ölçüt alındı. Doğru referans söylenirse ikinci
  bir görsel geçiş buna göre ayarlanır.
- Referans dünyanın tohumu bilinmiyor; karşılaştırmalar `AAA111` üzerinde.
- Ölçümler yazılım rasterleştiren önizleme penceresinde; gerçek GPU'da mutlak
  sayılar daha iyi olacaktır, oranlar değil.
- `maplab.html` ve dev sunucusundaki `POST /__shot` yalnız geliştirme
  araçlarıdır (oyun bunlara dokunmaz). Gerçek `index.html` bu pencerede
  açılamıyor: arayüzün 23 ayrı `backdrop-filter` katmanı yazılım
  rasterleştirmede kareyi tamamlatmıyor. Oyunun kendisi ayrıca doğrulandı
  (dünya kuruldu, 65 ulus, 1408 hex çizildi, konsol hatası yok).
- Uzak dalda eski `paintAtlas` kâğıdı duruyor (yukarıda 3. boşluk).

---

## VERDICT

**NEEDS ANOTHER VISUAL PASS** — ve devam etmeye değer.

Taban katmanlar (su, kara malzemesi, ızgara, renk boru hattı) hedefe doğru
ölçülebilir biçimde ilerledi ve kare bütçesi bozulmadı. Birim/ikon cilasına
GEÇİLMEDİ (§26 kapısı): kıyı ve küresel derecelendirme hedefin gerisinde.
Bir sonraki geçiş bu ikisi olmalı — üçüncü bir görsel yineleme, yeni mekanik
değil.

---
---

# GEÇİŞ #2 — hedefe yaklaşma (target match)

Hedef görsel netleşti: **ikinci ekran görüntüsü**. Birinci geçişin belirsizliği
kapandı, ölçüt artık o kare.

Birinci geçişin sonucu teknik olarak çalışıyordu ama görsel olarak "hexlerin
üstüne püskürtülmüş pastel bulutlar" okunuyordu. Bu geçiş yeni özellik
EKLEMEDİ; malzemenin karakterini değiştirdi.

## Ne değişti

**Kıyı uzaklığı artık gerçek bir alan.** Hex halkaları (BFS) yerine iki
geçişli chamfer uzaklık dönüşümü, teksel başına DÜNYA BİRİMİNDE uzaklık
veriyor (yatay sarmal için süpürme iki kez koşuyor). Üstüne iki frekansta
gürültü biniyor: şelf artık her kıyıyı saran eşit genişlikte bir hale değil,
yer yer açılıp yer yer kaybolan düzensiz bir sahanlık.

**Deniz tamamen rasterden geliyor.** Üç bölge: sığlık (kısık turkuaz) →
geçiş (kırık köpük, yalnız gürültü eşiğini aşan noktalarda) → abis (koyu
petrol). Hex başına tek ton olan eski yol yalnız rasterin altında, onun
paletiyle hizalı bir taban olarak kaldı.

  Sıralama hilesi: raster deniz dolgusunun ÜSTÜNE, kara dolgusunun ALTINA
  serilir. Yumuşatılmış kenarı karaya taşar, üstünü kara dolgusu kapatır —
  binlerce hexlik kırpma yolu (bu borunun ölçülmüş en pahalı işlemi) hiç
  gerekmiyor.

**Kabartma yapısal oldu.** Alan çözünürlüğü hex başına 2×2'den **4×4**'e
çıktı ve sıra tersine döndü: önce yükseklik rasteri kurulup yumuşatılıyor,
eğim ondan SONRA hesaplanıyor. Eskiden eğim hex başına hesaplanıp sonuç
yumuşatılıyordu — bu tam olarak sırt yapısını silip yerine yumuşak lekeler
bırakan işlemdi. Sert kesme yerine `tanh` yumuşak sıkıştırma: en dik yamaç
bile detayını koruyor (ölçüldü: eski tavanda tekselin %2.2'si üstte, %2.6'sı
altta düzleşiyordu).

**Gürültü tabi kılındı.** Geniş rastgele aydınlanmanın ağırlığı 0.46 → 0.13.
Fiziksel ipucu (eğim) 1.0. §11'in istediği sıra.

**Küresel derecelendirme renk borusunun kaynağında.** Saydam siyah dikdörtgen
yok: ülke açıklık bandı 27-64'ten **22-53**'e indi, orta ton çevresinde 1.16
kat açıldı, doygunluk parlaklıkla birlikte düştü. Tek tutarlı dönüşüm, ülke
başına ayrı filtre değil.

**Kıyı halesi kaldırıldı.** Dört kademeli turkuaz vuruş yerine iki kademe
kaldı: kara tarafında dar sıcak pay, üstünde ince koyu mürekkep. Işık değil
kontrast.

**Su animasyonu yeni tabana göre kısıldı.** Koyulaşan denizde eski alfalar
(swell 0.22, ripple 0.48, shimmer tavanı 0.65) oransal olarak birkaç kat
güçlü düşüyor ve okyanusu gri bulut tarlasına çeviriyordu. Sırasıyla 0.065 /
0.20 / 0.30.

**Uzak/yakın dal aynı dili konuşuyor.** Eski `paintAtlas` kâğıt yolu (ve onun
`patterns` yardımcısı) SİLİNDİ; uzak dal artık yakın dalın aynı rasterlerini
kullanıyor. Uzak pişirme üç süpürmeye ayrıldı — deniz dolgusu → [deniz
rasteri, tek geçiş] → kara dolgusu → [ışık alanı, tek geçiş] → mürekkep —
çünkü rasterler dilimlenirse kırpma sınırında dikiş bırakıyor.

**Izgara daha da çekildi** (0.028-0.113 → 0.012-0.074, rampa 0.7'de başlıyor),
**sınır mürekkebi** saf siyahtan uzaklaştı (0.90 → 0.82 opak, hafif soğuk) ve
iç sıcak hat 0.10 → 0.16'ya çıktı, **etiketler** kâğıda basılmış hâle geldi
(hale 4 → 2.5 blur, kontur inceldi ve koyulaştı, mürekkep ısındı, geniş
ülkelerde harf aralığı tavanı 0.45 → 0.62).

## Ekran görüntüsü yinelemesi

**İterasyon A** (`.shots/p2-iterA-near.png`) — üç en büyük boşluk:
1. Okyanusta geniş soluk gri lekeler — su animasyonu eski parlak tabana göre
   ayarlıydı, koyu zeminde sis gibi düşüyordu.
2. Şelf hâlâ "genişliği değişen düzgün bir hale" — geniş bozucu (±2.1 hex,
   ~14 hex periyot) baskındı, ince bozucu görünmüyordu.
3. Abis %7.5 parlaklıkta ezikti ve ±4.2'lik salınım o tabanda oransal olarak
   devasaydı — su "koyu bulutlar" gibi lekeleniyordu.

**İterasyon B** (`.shots/p2-iterB-near.png`, `.shots/p2-final-near.png`) —
üçü de kapatıldı (frekans dengesi ince bozucu lehine çevrildi, abis tabanı
10.5'e çıktı, salınım 2.0'a indi, animasyon alfaları kısıldı). Kalan üç
boşluk:
1. Kabartma yakın zoomda hâlâ ölçülü — alan 4 teksel/hex'te sınırlı.
2. Uzak zoomda açık okyanus çok koyu; yapı neredeyse görünmüyor.
3. Ülke içi ince doku hedeften biraz daha seyrek (hedefte ikon yoğunluğu da
   katkı veriyor; ikonlar bu geçişin kapsamı dışında).

## §14 soruları

| | |
| --- | --- |
| A. Deniz pahalı görünüyor mu? | **Evet** — koyu petrol, düzensiz şelf, hale yok |
| B. Kara fiziksel arazi gibi mi? | **Büyük ölçüde** — eğim yapısal, ama yakın zoomda ölçülü |
| C. Kıyı parlamak yerine doğal mı? | **Evet** — turkuaz aura kaldırıldı |
| D. Dünya pastel yerine koyu/zengin mi? | **Evet** |
| E. Aynı dil zoom boyunca yaşıyor mu? | **Evet** — eski uzak-zoom yolu silindi |

## Performans

Ölçüm: 1600×900, seed AAA111, 80 kare/örnek, yazılım rasterleştiren pencere.

| | |
| --- | --- |
| Yakın kare (zoom 1.15) | **p50 1.0 ms · p95 1.7 ms · max 1.9 ms** |
| Uzak kare (zoom 0.38) | **p50 2.3 ms · p95 3.5 ms** |
| Malzemenin çizim maliyeti | **1.5 ms**, statik katman pişirmesi başına |
| Alan pişirme (dünya başına bir kez) | 138-207 ms — **dört aşamaya bölündü** |

Kare bütçesi korundu (`CLAUDE.md` hedefi: uzak < 2 ms, yakın < 5 ms) ve
mimari avantaj duruyor: malzeme kare başına değil, katman pişerken ödeniyor.

Alan pişirme tek parça hâlinde 207 ms tutuyordu — görünür bir takılma. `water.js`'in
doku üretimindeki kalıp izlendi ve dört aşamaya bölündü (raster → gürültü +
uzaklık → ışık → deniz); ölçülen aşama süreleri **38 / 53.5 / 24.7 / 21.8 ms**.
En kötü tek dilim 53.5 ms.

Oyunun kendisi ayrıca doğrulandı: iki zoom dalı da kuruluyor, uzak önbellek 7
dilimde tamamlanıyor, konsol hatası yok.

## §17 KARAR KAPISI

**YES — mevcut mimariyle devam.**

Kanıt: bu geçişte hedefe yaklaştıran her şey — gerçek kıyı uzaklığı alanı,
yükseklik türevli tepe gölgelemesi, üç bölgeli su, tek tutarlı derecelendirme,
zoom boyunca aynı malzeme — **önbelleğe pişmiş raster + karışım kipi** ile
çıktı ve kare başına maliyeti 1.0 ms p50. Kalan boşluklar da aynı cinsten:
daha ince alan, daha fazla frekans, daha iyi ayar. Hiçbiri API değişikliği
istemiyor.

WebGL2'yi gerçekten gerektirecek nitelikler ayrı ve şu an İSTENMİYOR:
kare başına piksel başına iş — normal haritalı gerçek su ışıklandırması,
gerçek zamanlı değişen ışık yönü, ekran uzayında kırılma/parallaks, ya da
piksel başına LUT ton eşlemesi. Bunlar §15'in açıkça yasakladığı efekt
sınıfı.

Tek dürüst sınır: ışık alanı hex başına 4×4 teksel. Maksimum zoomda (3.5)
bir teksel ~39×34 ekran pikseli, yani çok yakında kabartma yumuşar. Bunun
çaresi de WebGL değil, `SUB` sabitini yükseltmek (bellek karşılığı) ya da
ince ölçekli deseni güçlendirmek.

## KNOWN LIMITATIONS (geçiş #2 sonrası)

- Uzak zoomda açık okyanus çok koyu; abis hâkim ama yapı okunmuyor.
- Çok yakın zoomda (>2×) ışık alanının çözünürlüğü görünür hale gelir.
- Şehir/kaynak ikonları ve birim sunumu bu geçişin kapsamı dışında bırakıldı
  (§15) — hedefteki doku yoğunluğunun bir kısmı onlardan geliyor.
- Ölçümler yazılım rasterleştiren önizleme penceresinde; oranlar geçerli,
  mutlak sayılar muhafazakâr.

**VERDICT: CONTINUE** — taban beş nitelikte (koyu derin su, doğal kıyı,
fiziksel kabartma, olgun pigment, tek tutarlı derecelendirme) hedefe yaklaştı.
Birim/atmosfer cilası hâlâ sırada değil; sıradaki iş varsa uzak-zoom deniz
yapısı ve yakın-zoom alan çözünürlüğüdür.

---
---

# GEÇİŞ #3 — HİBRİT SU (WebGL2)

Karar değişti: su GPU'ya taşındı, haritanın geri kalanı Canvas2D'de kaldı.
Kapsam yalnız SU — kara, ülke, sınır, ızgara, etiket, birim, seçim, arayüz
hiç değişmedi.

## IMPLEMENTATION

`src/render/waterGL.js` — WebGL2, tek tam ekran üçgeni, tek shader.

**Yerleşim.** `#map-water` tuvali `#map`'in ALTINDA (z-index 0 / 1). Canvas2D
tarafı hibrit açıkken deniz karelerini hiç boyamaz ve o alan saydam kalır; su
alttan görünür, kara dolgusu üstünü doğal olarak kapatır. Etiket, birim ve
seçim Canvas2D'de olduğu için suyun ÜSTÜNDE kalır — ayrı bir sıralama işi
gerekmedi.

**Kara maskesi ANALİTİK.** Shader dünya noktasından hexi kendisi hesaplar
(piksel→axial + küp yuvarlama), sonra `cols × rows` boyutunda NEAREST bir
dokudan o hexin su olup olmadığını okur. Sonuç TAM hex kenarıdır: ne
çözünürlük kaybı, ne yumuşak sınır, ne de binlerce hexlik kırpma yolu.
Karadaki fragmanlar `discard` edilir.

**Tek anahtar.** `renderer.glWater()` / `canvasWater()` — bütün Canvas2D deniz
geçişleri (dolgu, deniz rasteri, gök gradyanı, desenler, kıyı hattı, uzak
pişirmenin deniz süpürmesi, `fillVoid`, zemin dolgusu) bu tek karardan geçer.
WebGL2 yoksa `WaterGL.create` null döner ve her şey eskisi gibi Canvas2D'de
çalışır — katman silinmedi, yalnız devreye girmiyor.

## GPU COST

Ölçüm: 40 çizim + tek `readPixels` (gerçek senkron), önizleme penceresi.

| | |
| --- | --- |
| Su çizimi (721×686 = tam karenin 0.75'i) | **0.047 ms / çizim** |
| Aynı, uzak zoom (0.38) | **0.047 ms / çizim** |
| Doku örneği / piksel | 6 (hex, uzaklık, 4× dalga) |
| Güncelleme hızı | 33 ms tavan; kamera durağansa çizim ATLANIR |
| Çözünürlük | tam karenin 0.75'i |

Kare bütçesine etkisi ölçüm gürültüsünün içinde. Canvas2D tarafı değişmedi.

## COAST FIELD METHOD

Komşu halkası KULLANILMADI. `material.js`'in geçiş #2'de kurduğu **iki geçişli
chamfer uzaklık dönüşümü** yeniden kullanılıyor: teksel başına dünya biriminde
kıyı uzaklığı, yatay sarmal için süpürme iki kez. Alan artık malzeme
önbelleğinde saklanıyor (`cache.toLand`) ve WebGL katmanı onu R8 dokuya
yüklüyor (LINEAR, x'te REPEAT). Aynı işi iki kez yapmamanın yanında iki
katmanın kıyısı da bit bit aynı yerde duruyor.

Alan şunları sürüyor: köpük bandı, sığlık rengi, kıyı geçişi, derin su geçişi.
Coğrafya değişene kadar önbellekte.

## WATER SHADER LAYERS

```
1  kara maskesi      analitik hex + NEAREST doku  → discard
2  kıyı uzaklığı     chamfer alanı (LINEAR)
3  geniş yapı        domain-warp'lı iki düşük frekans, TOPLAMLA binen
4  derinlik paleti   sığ turkuaz → teal → petrol → siyaha yakın lacivert
5  hareketli normal  iki frekans, ayrı ölçek/yön/hız
6  Fresnel (taklit)  sanal eğik bakış; eğim arttıkça soğuk yansıma
7  yönlü spekülar    tek ışık, üs 60, geniş yapıyla seyrekleştirilmiş
8  temas kenarı      kıyıda dar koyulaşma
9  kırık köpük       band × gürültü, eşiği gürültüyle oynatılmış
```

## SCREENSHOT COMPARISON

`.shots/gl-iter1..4`, `.shots/gl-final-near.png`, `.shots/gl-final-far.png`.

**iter1 — su simsiyah.** Geniş yapı ÇARPILARAK biniyordu; 0.03'lük bir tabanın
%20'si 0.006, yani algı eşiğinin altı. (Canvas2D geçişinde birebir aynı hata
yapılmıştı.) Çare: toplamla binen yapı.

**iter2 — okyanusun tamamı soluk lekelerle doldu.** Spekülar üssü 22'ydi;
tepeden bakılan bir haritada hem ışık hem bakış dikeye yakın olduğu için DÜZ
su bile `dot(N,H) ≈ 0.93` veriyor ve 0.93²² = 0.20 çıkıyordu. Üs 60-80'e
çıkarıldı: düz su 0.003'e indi.

**iter3 — kıyıyı saran kesintisiz soluk hale.** Köpük eşiği 0.40'tı ve
gürültünün (ortalama 0.5) yarısı geçiyordu. Eşik 0.60'a çıkarıldı, band
1.6 hex'ten 1.05 hex'e indi.

**iter4 — köpük bu kez neredeyse yok.** Eşik 0.52'ye dengelendi.

**final — hareket ölçüldü.** Tek piksel örneği 30 saniyede 2/255 değişiyordu:
normal eğimi (0.55) o kadar küçüktü ki Fresnel (1−dot)³ ≈ 0.014 veriyordu —
yani "ıslak yüzey" hiç yoktu. Eğim 1.35'e, Fresnel üssü 2'ye çıkarıldı.
Tam kare farkı ölçümü:

    saniyede ortalama 3.86/255 (su pikseli başına), yerel tepe 232/255

Yani ortalama kıpırtı bilinçaltı, vurgular ise gerçekten geziyor — briefin
istediği "moving light on water, not moving texture".

**Referans testi (yalnız SU):**

| | |
| --- | --- |
| Derin okyanusta okunur yapı var mı? | **Evet** — domain-warp'lı geniş kuşaklar |
| Yüzey ıslak görünüyor mu? | **Evet** — Fresnel + spekülar |
| Işık suyun üzerinde geziyor mu? | **Evet** (ölçüldü) |
| Sığlık doğal geçiyor mu? | **Evet** — düzensiz, yer yer kesilen şelf |
| Kıyılar düzensiz ve güzel mi? | **Büyük ölçüde**; köpük en zayıf halka |
| Karadan uzakta da iyi mi? | **Evet** |

## Yol boyunca çıkan üç gerçek hata

1. **Malzeme saydam denize gri boyuyordu.** `material.paint` tek dikdörtgen
   olarak `overlay` ile biniyor; saydam bir hedefe karışım uygulanınca sonuç
   kaynağın kendisi oluyor ve deniz ORTA GRİ doluyordu. Çare: malzemeden önce
   katmanın alfası kopyalanıp sonra `destination-in` ile geri uygulanıyor
   (`maskToLand`) — maske gerçek hex dolgusu olduğu için tam kenarlı.
2. **Spekülar üssü** (yukarıda).
3. **`requestAnimationFrame` gizli pencerede duraklıyor.** Kurucudan sonraki
   ölçüm rAF'a bağlıydı ve tezgâh sayfası hiç hazır olmuyordu; zamanlayıcıya
   çevrildi (oyunda da aynı düzeltme).

## VERDICT

**EVET — WebGL su katmanı, haritanın geri kalanı mevcut renderer'da kalırken
hedef su kalitesine ulaşabiliyor.**

Maliyet ihmal edilebilir (0.047 ms/çizim, 30 FPS tavan, durağan kamerada
çizim yok), mimari ayrışma temiz (tek anahtar, tek shader, altı doku örneği),
ve Canvas2D yolu kaldırılmadı — WebGL2 yoksa oyun eskisi gibi çalışıyor.

**En zayıf halka köpük**: kırılma var ama karakteri hâlâ ayar meselesi.
**Sonraki adım yok** — brief burada durmayı istiyor.
