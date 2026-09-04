# Fiziksel Coğrafya — kıta iskeleti üretimi

Amaç: harita "prosedürel gürültü" değil **elle tasarlanmış bir strateji dünyası**
gibi okunsun. Oyuncu haritaya baktığında "bu Dünya değil" desin ama denizci
imparatorlukları, kıta imparatorluklarını, boğaz savaşlarını ve sömürge
yollarını hemen hayal edebilsin.

Uygulama: [`src/world/geography.js`](../src/world/geography.js) (şablon +
rasterleştirme), [`src/world/geoscore.js`](../src/world/geoscore.js) (ölçüm,
kabul/ret), [`src/world/worldgen.js`](../src/world/worldgen.js) (iklim + arazi).
Roller ve siyasi anlam [`macro.js`](../src/world/macro.js) ve
[makro-dunya.md](makro-dunya.md) içindedir — coğrafya değişse de roller kalır.

## Standart dünya

| | |
|---|---|
| Boyut | **160 × 96** (15.360 kare) |
| Yatay sarmal | AÇIK (silindir) |
| Dikey sarmal | KAPALI (kutuplar kenar) |
| Hedef kara | **%36** (bant %34-38) |
| Okyanus | ~%64 |

Denge hedefi bu boyuttur. Kaydırıcı başka boy verebilir; satır sayısı
`worldRows(cols)` ile 5:3 oranında türetilir, çünkü şablon bu en/boy oranına
göre çizildi.

## Neden eski üretici patates üretiyordu

Eski akış `fBm → eşik → yumuşatma` idi. Bu yöntemin yapısal sorunu şudur:
**kıtanın biçimini gürültünün kendisi tanımlar.** Gürültü izotropiktir; eşiklenen
izotropik bir alan her ölçekte yuvarlak lekeler verir. Makro blob maskesi
eklenmişti ama bloblar da elips olduğu için sonuç yine yumru kalıyordu ve
160×96'da bloblar birbirine değip **tek bir dev kütleye** kaynıyordu.

Ölçüldü (eski üretici, 160×96, 5 tohum): kara %34.0, kütle sayısı 4-5, **en
büyük kütle karanın %70-99'u**, "büyük sistem" sayısı 1-2. Yani üç ayrı kıtasal
sistem hiç doğmuyordu; kıtalar arası okyanus koridoru yoktu.

## Yeni kural

> **Gürültü kıtayı TANIMLAMAZ, kıtayı BOZAR.**

Silüet elle çizilmiş bir **omurgadan** (spine) ve omurga boyunca değişen
**kalınlıktan** çıkar. Gürültü iki iş yapar: örnekleme noktasını büker
(domain warp) ve kıyıya mikro pürüz ekler. Kıtanın makro biçimi gürültüden
önce vardır ve gürültüden sonra da tanınır.

## Boru hattı

```
şablon (rol atanmış omurgalar, deniz oymaları, boğazlar, sıradağlar, ada sahaları)
  → tohum başına döndürme / jitter / aynalama / isteğe bağlı halkalar
  → alan:  L = max(kara kapsülleri),  C = max(deniz oymaları),  f = min(L, −C)
  → domain warp (makro + mezo): körfez, burun, yarımada
  → kıyı bandına sınırlı mikro gürültü
  → yarıçap ölçeği kalibrasyonu (kara oranı hedefe kilitlenir)
  → köprü damgası (kıstak/geçit garanti)
  → temizlik (diken, çentik, mikro ada, anlamsız delik)
  → ölçüm → kabul/ret; en iyi aday saklanır
```

### Şablon

Her düğüm `[u, v, yarıçap, bölge, köprü?]`. Ardışık düğümler bir **kapsül**
(capsule) kemik kurar; kemik alanı `yarıçap − mesafe` işaretli uzaklığıdır.
Dal zincirleri ilk düğümünü ana gövdenin içinde seçer: yarımada gövdeye yapışır
ama kendi kalınlık profilini taşır. Yarıçaplar dünya **yüksekliği** birimindedir
ve alan hesabı `x = u·TX` ile yapılır (TX = gerçek en/boy oranı), böylece
"yarıçap 0.05" iki eksende de aynı sayıda hex eder.

Ayarlanabilir kollar:

| Alan | İş |
|---|---|
| `TEMPLATE_BULK` | küresel kalınlık; kalibrasyon ölçeğini ~1.0'da tutar |
| `body.bulk` / `chain.bulk` | kıtalar arası alan payı |
| `body.mirror` | tohum başına yatay aynalama |
| `body.drift` | uydu gövdeler (ada devletleri) yerinde durur (0) |
| `body.shift` | yalnız öteleme payı; dönüş serbest kalır |
| `chance` | bazı yarımadalar/adacıklar her dünyada doğmaz |

### Bükme (asıl anti-patates adımı)

Örnekleme noktası, alan hesaplanmadan **önce** bükülür:

```
p' = p + A_makro·(n₁, n₂) + A_mezo·(n₃, n₄)
```

Makro bükme (2 döngü/dünya, ~0.072 tasarım birimi) silüeti yeniden yazar; mezo
bükme (7 döngü, ~0.034) körfez ve burun üretir. Bükme örnekleme noktasına
uygulandığı için **kıta, iç deniz, boğaz ve sıradağ birlikte bükülür**: kanal
kıyıyla birlikte kıvrılır, kapanmaz.

Bükme genliği tohum başına ±%20 oynar: kimi dünya sakin kıyılı, kimi kıvrımlı.

### Mikro gürültü

`f += mikro · exp(−(f/0.030)²)` — yalnız kıyı bandında yaşar. İç bölgede delik
açmaz, açık denizde konfeti üretmez. Üç kademeli kıyı böyle doğar: makro silüet
(omurga), mezo girinti (bükme), mikro pürüz (kıyı bandı).

### Kara oranı kalibrasyonu

Kara oranını **eşik değil yarıçap ölçeği** tutturur: eşik kaydırmak bütün kıyıyı
aynı miktarda şişirir ve önce küçük adaları boğar; yarıçap ölçeklemek orantıyı
korur. Ölçek ikili aramayla bulunur (ilk geçişte kemik başına `(r, d)`
önbelleğe alındığı için arama ucuzdur), kalan sapma ±0.012'lik küçük bir eşikle
kapatılır.

### Köprü damgası

`bridge` işaretli kemikler (kıstak, batı geçidi) yarıçapının %60'ı kadar bir
çekirdeği **maskeye geri damgalar**. Gürültü kıyısını yontabilir ama koparamaz.
Ölçüldü: damga olmadan Yeni Dünya tohumların çoğunda iki ayrı kütleye düşüyordu.
Oyma (boğaz) damganın üstündedir — kanal kapanmaz.

### Temizlik

- Diken: ≤1 kara komşusu olan kara silinir (korunan köprü hariç).
- Çentik: ≥5 kara komşusu olan su doldurulur (korunan boğaz hariç).
- Mikro ada: ≤3 hex kara silinir.
- Anlamsız delik: okyanusa bağlı olmayan <10 hexlik su doldurulur.

Agresif yumuşatma **yok**: amaç patates üretmek değil, kazayı silmek.

## Kıta tasarımı

| Sistem | Pay | Karakter |
|---|---|---|
| **Eski Dünya** (süper kıta) | %40-45 | Uzun doğu-batı ekseni; batıda parçalı yarımadalar, ortada geniş bozkır, doğuda geniş ova; güneyde büyük yarımada; dar bir geçitle batı-orta ayrımı |
| **Güney kıtası** (Afrika işlevi) | %18-22 | Geniş iç bölge, uzun düz kuzey kıyı bandı, tek büyük batı körfezi, uzun doğu kıyısı, güney burnu, az yarımada |
| **Yeni Dünya** | %22-28 | Kuzey kıtası + ince kıstak + güney kıtası; batı kordilyer kıyısı, güneyde daralan kama, doğu şişkinliği |
| **Adalar** | kalanı | Ada devleti (batı takımadaları), ada modernleşicisi (doğu adaları), baharat zinciri, korsan adaları, volkanik yay (dikişi geçer), sahanlık adaları |

**İç deniz**: Eski Dünya ile güney kıtası arasındaki kanal, ortada geniş bir
havzaya açılır ve iki ucunda daralır — batı ağzı ve kavşak boğazı. Kanal
şablonda **garanti**dir (oyma olarak): olmasaydı iki kıta bükme altında birleşir
(ölçüldü: 40 denemenin 12'sinde birleşiyordu).

**Boğazlar**: batı kanalı (ada devletini anakaradan ayırır), doğu boğazı (ada
modernleşicisini ayırır), kavşak boğazı (iç denizin doğu ağzı) + iç denizin
batı ağzı. Ölçümde tohum başına ort. 4-5 dar geçit çıkar.

## Yükseklik ve arazi

Arazi simülasyonu yeniden yazılmadı; `classify()` ve iklim formülleri korundu.
Değişen, yüksekliğin **nereden geldiği**:

- Kara: kıyıdan uzaklık (iç bölge yükselir) + sıradağ şeridi + doku gürültüsü.
- Sıradağlar şablondan gelir: yarımada seddi, geçit sırtı, doğu sıradağları,
  Yeni Dünya kordilyeri ve güney sırtı, güney kıtası doğu yamacı.
- **Geçit gürültüsü** zincir boyunca yüksekliği dalgalandırır: kesintisiz bir
  sıradağ ova şeridini ikiye bölerdi. Ölçüldü: her büyük kütlenin geçilebilir
  alanının %99-100'ü tek parça kalıyor. (Dağ artık geçilebilir — maliyet 2,
  savunma %60 — ama zincir yine de ucuz yolu kıvrandırır, iş görür.)
- Deniz: kıyıdan uzaklığa göre sahanlık → açık deniz → derin bantları
  (bant kenarı gürültüyle tırtıklanır, mükemmel halka oluşmaz).

Kara yüksekliği **sıralamayla** eşlenir: dağ/tepe/ova oranları alan dağılımından
bağımsız kalır (dünyanın ~%11'i dağ), ama artık dağlar zincir, ovalar iç bölge.

Nem'e **karasallık** terimi eklendi: denizden uzak iç bölge kurur. Çöl ve bozkır
artık rastgele değil coğrafyanın sonucudur.

## Doğrulama (`npm run audit:geography`)

Üretim her adayı ölçer; ret gerekçesi varsa yeni tohum dalıyla yeniden dener
(en fazla 6 deneme), hiçbiri geçmezse **en yüksek puanlı** adayı kullanır.

Ret gerekçeleri:

| Kural | Eşik |
|---|---|
| Kara oranı | hedef ±%2 |
| Büyük kıtasal sistem | tam 3 (4 = parçalanma) |
| Kıta birleşmesi | en büyük kütle ≤ karanın %52'si |
| Üçüncü sistem | ≥ %10 |
| Yuvarlaklık | her büyük kütlenin çevre endeksi ≥ 8.6 (daire = 6.93) |
| Mikro ada | ≤ 4 (tek-hex ada: 0) |
| Anlamsız iç delik | ≤ 2 |
| Ada spami | ≤ 40 ada |
| Yarımada | ≥ 5 |
| Boğaz | ≥ 2 |
| İç deniz | havza ≥ %55 su ve çevre halka ≥ %50 kara |
| Dikiş | dikiş sütun sınırı, diğer 159 sınırın dağılımından ayırt edilememeli |

Kalite puanı (0-100) yalnız **hangi aday saklanacak** sorusunu yanıtlar;
oyuncuya gösterilmez.

## Önizleme

- Oyunda: harita kipi düğmelerinden **coğrafya** — ülke, sınır, province kenarı,
  ızgara, etiket, şehir ve ordu kapalı; yalnız kara, deniz ve arazi.
- Terminalde: `node scripts/audit/geography-preview.mjs SEED [--zones] [--full]`
