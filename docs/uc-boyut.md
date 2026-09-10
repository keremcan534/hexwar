# Üç boyutlu harita (C yolu)

Haritanın yüzeyi artık gerçek geometri olabilir ve kamera eğilebilir. Bu belge
neyin nasıl kurulduğunu, neyin ölçüldüğünü ve neyin **yapılmadığını** yazar.

## Üç kol

`renderer.setSurfaceMode(mode)` üç sunum arasında geçer. Hiçbiri silinmedi;
üçü yan yana karşılaştırılabilsin diye duruyorlar ve bu karşılaştırma portun
tek güvenlik ağı.

| Kol | Ne çizer | Nerede |
|---|---|---|
| `classic` | Her şey Canvas2D | `render/water.js`, `renderer.js` |
| `gpu` | Yüzey tek tam-ekran üçgende, mürekkep Canvas2D'de | `render/surfaceGL.js` |
| `3d` | Yüzey arazi mesh'i, dünya-uzayı mürekkebi yüzeyde | `render/scene3d.js` |

Bağlamı **renderer** açar (`createSurfaceContext`), iki GPU sunumu onu ödünç
alır. Tuval tek bağlam verebildiği için aksi hâlde yan yana yaşayamazlardı.

## Denemek için

Arayüzde: katman çekmecesindeki **3D** kutusu, sonra **Tilt** kaydıracı.
Konsoldan:

```js
await game.renderer.setSurfaceMode('3d');
game.renderer.waterGL.tilt = 30 * Math.PI / 180;
game.renderer.waterGL.perspective = true;   // hareket paralaksı
game.renderer.waterGL.heightScale = 60;     // kabartmanın dünya birimi
game.renderer.waterGL.meshDetail = 0.5;     // yavaş makinede üçgeni dörtte bire indirir
game.renderer.waterGL.shadow = 0;           // düşen gölgeyi kapat
game.requestRender();
```

three.js **dinamik** yüklenir: 3B kipine geçilmedikçe 687 KB hiç inmez.
Vendor edilmiştir (`vendor/three/`), importmap ile bağlanır — derleme adımı
ve paket yöneticisi yok, çevrimdışı çalışır.

## Mimari kararlar

### Malzeme tek kaynaktan

`surfaceGL.js` iki parça dışa açar: `SURFACE_LIB` (uniformlar, yardımcılar,
`landColor`) ve `SURFACE_BODY` (`vec4 surfaceAt(vec2 world)`). İki sunum da
aynı GLSL'i kullanır. Bölünme noktası yalnızca `world`ün nereden geldiğidir:
tam ekran yolu ekran koordinatından ters afinle türetir, mesh yolu vertex'ten
taşır.

İki kopya kaçınılmaz olarak birbirinden ayrılır ve bu depoda "aynı oyunda iki
ayrı sanat yönetimi" bir kez yaşandı (bkz. `renderer.glWater` yorumu).

### Mürekkep neden shader'da

Kamera eğildiği an Canvas2D'nin düz afin mürekkebi hexlerin üstünden kayar.
Izgara, province kenarı, ülke sınırı ve kenar gölgesi artık **arazinin
fragment shader'ında** çizilir:

- Araziye kusursuz drape olur; ayrı geometri, polygon offset, z-fighting yok.
- Kenar uzaklığı analitiktir: sivri-tepe hexin kenar *i*'sinin dış normali
  60·*i* derecede, merkeze uzaklığı iç yarıçap. Üçgen yok, segment yok.
- Kalınlık `dFdx/dFdy` ile **ekran pikselinde** sabit — eğimde de, perspektifte
  de. Canvas2D'nin `lineWidth / scale` numarasının eğimde çalışan karşılığı
  budur ve bedava kenar yumuşatması getirir.

Girdi bir hex kimlik dokusudur (`renderer.surfaceIdData`): RG grup, BA
province. Grubun ne olduğu harita kipine bağlıdır ve karar `drawBorders`la
**aynı yerden** gelir. Sahiplik değişince kimlik de tazelenir; renk tazelenip
kimlik tazelenmezse ülke yeni rengiyle ama eski sınırıyla durur.

Canvas2D o üç aileyi 3B kipinde çizmez (`renderer.surfaceInk`); ikisi birden
çizerse çizgiler kalınlaşır ve alfa katlanır.

### Kamera projektörü

`camera.setProjector()` ince bir dikiştir. Kamera matematiği (pan, zoom,
kilit) **afin kalır**; projektör yalnız iki soruyu devralır:

- `worldToScreenWrapped(wx, wy, height?)` — etiket, şehir adı, birim künyesi.
  Yükseklik verilmezse araziden örneklenir, böylece zeminin üstünde dururlar.
- `pickWorld(sx, sy)` — tıklama.

İkisi ayrılmazsa `zoomAt`in imleç altındaki noktayı sabit tutma kimliği
bozulur.

### Tıklama: ışın izi

Eğim açıksa ters afin diye bir şey yoktur. `scene3d.pick` ışını CPU'da
yükseklik alanında yürütür (`material.js` alanı zaten CPU'da tutuyor).
`gl.readPixels` ile GPU picking senkron boru duraklamasıdır ve hover **her**
`mousemove`'da çalışır — o yola girilmedi.

**Paralaks bütçesi artık bağlayıcı değil.** Tasarım notunda yükseklik ölçeği
`kayma_hex = h·tan(eğim)/45,03 < 0,5` kuralıyla sınırlanıyordu, çünkü
tıklamanın ters afinle çözüleceği varsayılmıştı. Işın izinden sonra oyuncu her
zaman gördüğü hexi tıklıyor. Geriye kalan risk kayma değil **örtme**: dağın
arkasındaki hex tıklanamaz.

### Düşen gölge ve tıkanım

Gölge haritası, FBO ya da cascade **yok**. Işın doğrudan yükseklik alanında
yürütülür; sarmalı da bedavaya çözer, çünkü `uElev` S ekseninde `REPEAT`.
Her iki sunumda da çalışır (ortak GLSL).

Kalibrasyon bir kez yanlış yapıldı ve düzeltildi: ham yükseklik farkı
kullanıldığında gölge **doyuyordu**. Kabartma 90 birimken komşu hexler arası
eğim ~31°, güneş ise 28,7°'de — yani neredeyse her kare gölgede kalıyor ve
bütün harita %31 parlaklığa iniyordu. Fiziksel olarak doğru, harita için
yanlış: gölge burada **aksan**, simülasyon değil. Yumuşak eşik + 60 birim
kabartma ile okunur ama karartmayan bir sonuç alındı.

## Ölçümler

Ölçüm hattı bu port için kuruldu (`core/perf.gauge`, `render/gpuTimer.js`).
GPU sorgusunun sonucu aynı karede okunamaz, bu yüzden kareye bağlanmayan ayrı
bir kanala düşer ve arayüzde `~` ile işaretlenir.

### Piksel-eş referans testi

`maplab.html` → `lab.abSurface({a:'gpu', b:'3d'})`. Eğim sıfırken ortografik
izdüşüm bugünkü afin dönüşümle birebir aynı olmalı.

| Ölçüm | Sonuç |
|---|---|
| Farklı piksel | 1.123 / 1.024.000 (**%0,11**) |
| Ortalama fark | 0,043 / 765 |

Kalan farkın **nedeni de bulundu**, "yakın" deyip geçilmedi: fark haritası
çıkarıldı, bütün farklı pikseller hex kenarında. İki yoğun sütun sayıyla
doğrulandı — ekran x=990 → dünya x=562,4 → (562,4+22,5)/45,03 = **13,00**
(tam hex sınırı); x=347 → **7,50** (tek satır hexinin sınırı). Sivri-tepe
hexlerin sol/sağ kenarları dikeydir. İki yol `hexAt`i float hassasiyetinde
farklı yuvarlıyor.

Test **mürekkebi dışarıda bırakır** (`ink: false`): mesh yolu çizgileri
shader'da, Canvas2D yolu kendi kenar yumuşatmasıyla çizer; ikisi tanım gereği
piksel-eş olamaz ve testin sorusu "malzeme sadık mı".

### Tıklama gidiş-dönüş

Dünya karesi → ekran → ışın → aynı kare mi?

| Eğim | Kamera | Doğru | Sapan |
|---|---|---|---|
| 0° | ortografik | **%100** | 0 |
| 20° | perspektif | **%100** | 0 |
| 30° | perspektif | **%100** | 0 |
| 45° | perspektif | **%100** | 0 |

### Maliyet

**Bu sayılar SwiftShader'dan, yani YAZILIM rasterleştiricisinden.** Gerçek GPU
rakamları değil; yalnız oranlar kullanılabilir. Ayrıca ölçüm koşumu kareyi iki
kez çizer, dolayısıyla mutlak değerler şişkindir.

| Kol | GPU (ort.) | Çizim | Üçgen |
|---|---:|---:|---:|
| `gpu`, gölgesiz | 119 ms | 2 | — |
| `gpu`, gölge+AO | 161 ms (**+%35**) | 2 | — |
| `3d`, tilt 0, gölgesiz | 299 ms | 6 | 1,47 M |
| `3d`, tilt 30° persp, gölge+AO | 450 ms | 6 | 1,47 M |

CPU aynı koşularda 1,92 → 2,04 ms, yani neredeyse sabit. **Bu portu CPU
sayaçlarıyla izleseydik gölgenin bedelini hiç göremezdik** — GPU zamanlayıcının
kurulma gerekçesi tam olarak buydu.

Üçgen sayısı `meshDetail` ile doğrudan ölçeklenir (0,5 → dörtte bir).

## Yapılmadı

- **Birim ve şehir mesh'leri.** Künyeler ve şehirler hâlâ Canvas2D sprite'ı;
  yalnız çapaları 3B izdüşümden geçiyor. `PIXI_AAA_MAP_RESULT.md`'nin
  "kütüphane kararı birim/ikon fazına ertelendi" notu hâlâ geçerli.
- **Post-process zinciri.** Bloom, DOF, renk derecesi yok. Grenli film ve
  vinyet zaten DOM kompozitöründe bedava çalışıyor (`.map-film`).
- **Gölgenin sarmal kopyaları.** Işın yürüyüşü doku sarmalını kullandığı için
  gerekmiyor, ama dikişin iki yakasında çok uzun gölgeler test edilmedi.
- **Düşük uçlu GPU kalite kademesi.** `meshDetail`, `resScale`, `shadow` ve
  `ao` konsoldan ayarlanabiliyor ama arayüzde yalnız 3B/eğim var.
- **Kip geçiş animasyonu.** Eğim anında değişiyor.

## Vazgeçme ölçütü

Gerçek donanımda ölçüldüğünde şunlardan biri görülürse 3B kip varsayılan
yapılmamalıdır (kol olarak kalabilir):

| # | Ölçüt | Eşik |
|---|---|---|
| 1 | GPU kare süresi, uzak zoom | > 2 ms |
| 2 | GPU kare süresi, yakın zoom | > 5 ms |
| 3 | `dt` p99 | > 16,7 ms |
| 4 | Yerleşen etiket sayısı, 2B kola göre | %20'den fazla düşerse |
| 5 | Tıklama gidiş-dönüş doğruluğu | %100'ün altına inerse |
| 6 | tilt=0 malzeme referans testi | %0,5'i aşarsa |

Ölçüt 5 ve 6 bu oturumda kuruldu ve şu an geçiyor; 1-4 gerçek GPU ister.
