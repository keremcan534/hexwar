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

1125x675 yüzey tuvali (tam karenin 0.75'i), 40 çizim + `readPixels` senkronu:

| | |
| --- | --- |
| Yüzey (deniz + kara, tek shader) | **0.113 ms / çizim** |
| Canvas2D mürekkep karesi | **p50 0.8 ms · p95 2.0 ms** |
| Güncelleme | 33 ms tavan; kamera durağansa çizim atlanır |

Yalnız su 0.055 ms idi; kara +0.058 ms getirdi. Kaydırma ve zoom maliyeti
mürekkep katmanınınkiyle sınırlı, o da değişmedi.

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

## KNOWN LIMITATIONS

- İşgal, kültür ve inşaat taramaları Canvas2D'de; GPU malzemesinin üstüne
  biniyorlar ve onunla aynı ışığı almıyorlar.
- `updateOwners` yazıldı ama **tetikleyen bağ henüz kurulmadı**: fetihten
  sonra renk dokusu kendiliğinden tazelenmiyor. Bir sonraki işin ilk maddesi.
- Şehir / birim / ikon katmanları dokunulmadı (§40 gereği).
- Ölçümler önizleme penceresinde; oranlar geçerli, mutlak sayılar muhafazakâr.

## VERDICT

**TARGET APPROACHING.**

Su ve kara artık aynı ışığı paylaşan tek bir GPU yüzeyi; kabartma gerçek
yükseklikten ve çözünürlükten bağımsız; ülke kimliği oyunun kendi renk
borusundan geliyor; kare maliyeti 0.113 ms. Simülasyona, dünya üretimine,
sahipliğe ve arayüze dokunulmadı; bağımlılık sayısı sıfır kaldı.

A/B anahtarı: `game.renderer.setSurfaceMode('classic' | 'gpu')`
