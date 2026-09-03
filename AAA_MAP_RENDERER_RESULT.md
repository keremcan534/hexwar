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
