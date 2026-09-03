# AAA Dünya Yüzeyi — sonuç

**SOURCE BRANCH** `experiment/aaa-map-renderer`
**SOURCE COMMIT** `ff6cb43`
**NEW BRANCH** `experiment/pixi-aaa-map` — birleştirilmedi. Canvas deneyi silinmedi.

## PIXIJS KULLANILMADI — gerekçe

Brief PixiJS v8 istiyordu; sorduğumda ölçüt "hangisi görsel olarak en iyi
sonucu verirse" oldu. Cevap: **ham WebGL2**.

- Brief'in su bölümleri (§8–§16) zaten ham WebGL2 fragment shader'ında
  yazılmıştı ve çalışıyordu. Pixi onları ne hızlandırır ne güzelleştirir.
- Kalan boşluk kara malzemesiydi (§17–§23) ve o GLSL işi. Pixi sahne grafiği
  sunar, shader yazmaz — yazılacak GLSL iki yolda da birebir aynıydı.
- Pixi ~1 MB paketi depoya sokar ve CLAUDE.md'nin çekirdek kısıtını
  ("bağımlılık ve derleme adımı yok") kırardı.
- Brief'in kendi §51/§53 ve FINAL DIRECTIVE maddeleri de aynı yöne bakıyor:
  görsel sonuç > migrasyon.

Pixi kararı **birim/ikon fazına** ertelendi; sprite batching ve metin orada
gerçekten kazanç sağlar. Bağımlılık sayısı hâlâ **sıfır**.

## ARCHITECTURE / RENDER BACKEND

```
SİMÜLASYON  (dokunulmadı)
     |  salt okunur
renderer.tileColor / world.tiles / material.cache
     |  hex başına doku
SurfaceGL — WebGL2, TEK tam ekran üçgeni, TEK shader
     |
[ #map-water ]  deniz + kara MALZEMESİ
[ #map       ]  Canvas2D: sınır, province kenarı, ızgara, etiket, şehir,
                birim, seçim, taramalar
[ DOM        ]  bütün yönetim arayüzü (dokunulmadı)
```

Pixi sürümü: yok. Backend: WebGL2 / GLSL ES 3.00.
Tek çizim çağrısı, altı doku örneği. Hex başına draw call yok.

## DATA ADAPTER — oyun durumu kopyalanmadı

| Doku | Kaynak | Örnekleme |
| --- | --- | --- |
| `uOwner` | **`renderer.tileColor(tile, world)`** | NEAREST |
| `uHex` | `tile.terrain.water` | NEAREST |
| `uChar` | arazi tipi -> kabartma / gren / sıcaklık | NEAREST |
| `uElev` | `material.cache.surface` (yükseklik rasteri) | LINEAR |
| `uDist` | `material.cache.toLand` (chamfer kıyı uzaklığı) | LINEAR |

Kritik nokta: **taban rengi shader'da üretilmiyor.** Ne renk gerekiyorsa
oyunun kendi `tileColor` borusundan geliyor — harita kipleri, işgal, kültür,
barış masası hepsi tek yerde kalıyor. Shader ülke, province ya da sahiplik
kavramını bilmiyor.

Kara/deniz maskesi ANALİTİK: shader dünya noktasından hexi kendisi hesaplıyor
(axial + küp yuvarlama) ve cols x rows dokudan okuyor. Hex kenarı tam, kırpma
yolu yok.

## WATER IMPLEMENTATION

Chamfer kıyı uzaklığı alanı (komşu halkası değil) -> üç derinlik bölgesi; üç
oktav **yönlü** dalga; yüksekliğin ALBEDO'ya binmesi (görünür kabarma);
sığlıkta dalga eğimiyle kırılma; taklit Fresnel; yönlü spekülar (üs 60);
domain-warp makro yapı; eşiği gürültüyle oynayan kırık köpük.

Zaman gerçek render saatinden gelir — simülasyon hızından bağımsız (§34).

## LAND IMPLEMENTATION

```
ülke rengi (oyundan, NEAREST)
  x pigment          3 oktav prosedürel, DÜNYA uzayında, piksel başına
  x kabartma         yükseklik gradyanı -> normal -> yarım-Lambert
  x ışık/gölge rengi sırt sıcak, çukur soğuk
  -> küresel S eğrisi derecelendirmesi
```

Kabartma **çözünürlükten bağımsız**: gölge önceden pişmiş bir rasterden değil,
her karede piksel başına hesaplanıyor. Bu, geçiş #2'de not edilen "yakın
zoomda kabartma yumuşuyor" sınırını kapatıyor. Işık yönü su ile ORTAK (§22).

## COAST / BORDER / LABEL

- **Kıyı**: tamamen shader'da — dar koyu temas kenarı, kırık köpük, düzensiz
  şelf. Canvas2D'nin kıyı mürekkebi ve kum yıkaması devre dışı.
- **Sınır / province kenarı / ızgara**: Canvas2D'de KALDI. Üç kademeli
  hiyerarşi ve zoom rampası zaten çalışıyordu; GPU'ya taşımanın görsel
  karşılığı yok.
- **Etiketler**: Canvas2D'de KALDI. PCA ile hâkim eksen, satır bazlı en geniş
  kesintisiz bant, zoom LOD, çarpışma ayıklama, histerezis, zamansal erime —
  §27–§29'un istediği her şey mevcut. Yeniden yazmak gerileme olurdu.

## FRAME COST

**1920x1080**, yüzey tuvali 1440x810 (0.75x), DPR 1. Yüzey için 40 çizim +
`readPixels` senkronu; mürekkep için 40 tam kare.

| zoom | Yüzey (deniz + kara) | Canvas2D mürekkep p50 / p95 |
| --- | --- | --- |
| uzak (0.38) | **0.095 ms** | 0.4 / 0.8 ms |
| orta (0.95) | **0.095 ms** | 0.3 / 0.8 ms |
| yakın (1.80) | **0.093 ms** | 0.2 / 0.3 ms |
| kaydırma (30 kare) | — | 0.3 / 1.6 ms |

Toplam kare 2 ms'nin altında, yani 60 FPS hedefinin çok üstünde. Yüzey
maliyeti zoomdan bağımsız — tam ekran tek geçiş.

Renk dokusu tazelemesi (fetih / kip değişimi): **4.1 ms ilk, 2.5 ms sonraki**
(898 benzersiz renk, dize başına bir kez çözülüyor). Yalnız kirliyken koşar.

Su-yalnız sürüm 0.055 ms idi; kara +0.04 ms getirdi.

## SCREENSHOT ITERATION 1 — üç en büyük fark

`.shots/pixi-iter1.png`

1. **Kara tamamen düz.** Yükseklik R8 dokusunda teksel başına ~0.004
   değişiyor; shader'daki 18x kazanç normali dikeye yapıştırıyordu.
2. Pigment algı eşiğinin altındaydı (`grain` 0.55).
3. Kabartma kazancı arazi tipine göre ölçeklenmiyordu.

## SCREENSHOT ITERATION 2 — üç en büyük fark

`.shots/land-r12.png` / `land-r35.png` / `land-r70.png` taramasıyla kazanç
kalibre edildi; `relief=22`, `grain=0.85`'te duruldu
(`.shots/pixi-iter2-near.png`).

1. Yüksek kazançta (70) gölge tarafı ölüyor — yarım-Lambert şart.
2. Küresel derecelendirme S eğrisi 0.30'da doğru; üstünde ülke kimliği eziliyor.
3. Kalan: işgal / kültür taramaları hâlâ Canvas2D'de ve GPU malzemesiyle aynı
   ışığı almıyor.

Ayrıca bir hata çıktı ve **renderer'a ait değildi**: tezgâhın `shot()` işlevi
kamerayı kilitlemiyordu, yüzey bir zoomda mürekkep başka zoomda çiziliyor ve
kare "renkler denize taşmış" gibi okunuyordu (ölçüldü: 0.95 -> 1.30).

## FINAL SCREENSHOT

`.shots/pixi-iter2-near.png` — zoom 0.95, seed AAA111.

## YÜKSEKLİK HARİTASI GERÇEK Mİ?

Sorulduğu için ölçüldü (seed AAA111, kara hexleri):

| terrain | min elevation | medyan |
| --- | --- | --- |
| BEACH | 0.420 | 0.423 |
| GRASSLAND / FOREST | 0.420 | 0.52 – 0.53 |
| HILLS | **0.700** | 0.773 |
| MOUNTAIN | **0.880** | 0.914 |
| SNOW_PEAK | **0.940** | 0.970 |

Eşikler `terrain.js` içindeki `classify()` ile birebir aynı
(`>0.70 -> HILLS`, `>0.88 -> MOUNTAIN`, `>0.94 -> SNOW_PEAK`). Yani shader'ın
okuduğu yükseklik rastgele gürültü DEĞİL; bir hexin dağ mı tepe mi ova mı
olduğunu belirleyen sayının ta kendisi.

Zincir: `geo.height` -> `tile.elevation` (sıra eşlemeli) -> `classify()` ->
`material.surface` rasteri (yarım hex yumuşatma) -> `uElev`. Üstüne arazi
tipine göre kabartma kazancı biner (dağ 1.60, ova 0.44).

## SAHİPLİK VE KİP TAZELEMESİ (doğrulandı)

`tileColor` çıktısını değiştiren her şey renk dokusunu kirletir
(`invalidateCache` / `invalidateTiles`) ve bir sonraki karede tek seferde
yüklenir. Gerçek oyunda ölçüldü:

- Province sahibi değişti -> ekran merkezi (76,118,77) yeşilden
  (69,127,135) tealе döndü.
- `political -> terrain -> cultures -> political`: her kip ayrı renk verdi,
  politiğe dönüşte değer birebir aynı.

## KNOWN LIMITATIONS

- İşgal, kültür ve inşaat taramaları Canvas2D'de; GPU malzemesinin üstüne
  biniyorlar ve onunla aynı ışığı almıyorlar. Bilgi katmanı oldukları için
  bu kasıtlı, ama malzeme dili tam birleşmiş değil.
- Şehir / birim / ikon katmanları dokunulmadı — briefin §40/§56 kapısı.
- Veri kipleri (kaynak, nüfus, barış, inşaat) GPU yüzeyini kullanmaz; orada
  eski Canvas2D yolu devrededir ve zemini opak boyar. Kasıtlı: o kipler
  seçim yüzeyidir, malzeme değil.
- Ölçümler bu makinede ve önizleme penceresinde; oranlar geçerli.

## VERDICT

**TARGET APPROACHING.**

Su ve kara artık aynı ışığı paylaşan tek bir GPU yüzeyi; kabartma gerçek
yükseklikten ve çözünürlükten bağımsız; ülke kimliği oyunun kendi renk
borusundan geliyor; kare maliyeti 0.113 ms. Simülasyona, dünya üretimine,
sahipliğe ve arayüze dokunulmadı; bağımlılık sayısı sıfır kaldı.

A/B anahtarı: `game.renderer.setSurfaceMode('classic' | 'gpu')`
