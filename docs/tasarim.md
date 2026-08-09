# HexWar — ekonomi ve hegemonya tasarımı

Bu belge **kod yazılmadan önce** alınan denge kararlarını kaydeder. Amaç, sayılar
tartışmaya açıldığında "bu neden böyleydi" sorusunun cevabının elde olması.

Uygulama durumu: **1. adım (kaynaklar) ve 2. adım (binalar) yazıldı.**
Gerisi bekliyor. Yol haritası ve gerçekleşen sayılar için bölüm 11 ve 13.

## 1. Vizyon

Dünyayı ele geçirme oyunu değil, **hegemonya** oyunu. Toprak almak mümkün ama
bedelli: kötü şöhret (infamy) biriktirir, yabancı etnik nüfus hoşnutsuzluk ve
verim kaybı getirir. Büyümenin diğer yolları ekonomi, ticaret ve teknolojidir.

Bu, şimdiye kadar elle koyduğumuz kartopu frenlerinin (yolsuzluk katsayısı, birim
bakımı, YZ cephe limiti) yerini **oyunun kendi diliyle çalışan** bir frene
bırakması demek: fetih pahalıdır çünkü dünya tepki verir, biz öyle ayarladık diye
değil.

## 2. Alınan kararlar

| Konu | Karar | Gerekçe |
|---|---|---|
| Kaynak sayısı | 4: altın, erzak, kereste, demir | Derinlik tercih edildi |
| Arazi işleme | Elle işçi ataması, **otomatik varsayılanla** | Derinlik zorunluluk olmasın |
| Fetih | Pahalı ama geçerli yol (Victoria gibi) | Savaş katmanı değerini korusun |
| Oyun ufku | 250-300 tur | Asimilasyon ve teknolojiye zaman |

Son iki karar mevcut tempoyu geçersiz kılıyor: bugün oyun 150. turda 3-6 ülkeye
iniyor. Fetih hızı **yarıya** inmeli.

## 3. Kaynaklar

Her kaynağın tek ve net bir işi var; yoksa muhasebeye döner.

| Kaynak | İşi | Kaynağı |
|---|---|---|
| Altın | Tek harcanan kaynak: birim, bina, ticaret | Ova/kıyı, Pazar, ticaret |
| Erzak | Şehir büyümesi **ve ordu tavanı** | Çayır/ova/su |
| Kereste | Binalar ve gemiler | Orman |
| Demir | Elit birimler | Tepe/dağ |

Demir ve kereste araziye bağlı: haritanın belirli bölgeleri savaşmaya değer olur
ve ticaret gerçek bir sebep kazanır.

### Arazi verimleri (işçi başına)

| Arazi | Erzak | Kereste | Demir | Altın |
|---|---|---|---|---|
| Çayır | 3 | — | — | — |
| Ova | 2 | — | — | 1 |
| Orman | 1 | 3 | — | — |
| Tepeler | 1 | — | 2 | — |
| Dağ | — | — | 3 | — |
| Sığ su | 2 | — | — | 1 |
| Kumsal | 1 | — | — | 1 |
| Tundra | 1 | — | — | — |
| Çöl | — | — | — | — |

Şehir merkezi bedava: 2 erzak + 1 altın + 1 kereste.

### Birim maliyetleri

Çıpa değişmedi: **bir piyade = oyunun para birimi.** Maliyet dört kaynağa
bölünerek altının tek darboğaz olması engellenir.

| Birim | Altın | Demir | Kereste | Erzak/tur |
|---|---|---|---|---|
| İzci | 15 | — | — | 1 |
| Piyade | 25 | 1 | — | 1 |
| Süvari | 40 | 2 | — | 2 |
| Savaş gemisi | 30 | 1 | 3 | 1 |

İzci kasten demirsiz: demirsiz doğan ülke tamamen kilitlenmesin.

Birim bakımı **1 altın + 1 erzak**. Mevcut 2 altın ikiye bölünür, çift vergi
olmaz. Ordunun asıl freni artık erzaktır: ordu, haritanın besleyebildiği kadar.

### Binalar

Şehir başına **3 yuva**. Bonuslar **sabit, yüzde değil** — yüzde verirsek her
fetih lideri katlar, yeni kırdığımız kartopu geri gelir. Geri ödeme penceresi
12-25 tur: altı otomatik alım, üstü 300 turluk oyunda bile anlamsız.

| Bina | Altın | Kereste | Demir | Bakım | Etki |
|---|---|---|---|---|---|
| Ambar | 40 | 3 | — | 1 | +2 erzak, büyüme eşiği −%20 |
| Pazar | 60 | 2 | — | 1 | +4 altın |
| Bıçkıhane | 50 | 2 | — | 1 | orman hexleri +1 kereste |
| Demirhane | 70 | 3 | 2 | 2 | tepe/dağ hexleri +1 demir |
| Liman | 70 | 4 | — | 1 | su hexleri +1 erzak +1 altın |
| Sur | 60 | 2 | 2 | 1 | +0.15 savunma |

## 4. Kültür ve nüfus

**Kültür bölgeleri için yeni algoritma gerekmiyor.** `nations.js`'teki ağırlıklı
Dijkstra yayılımı iki kez çalıştırılır: önce az sayıda büyük kültür bölgesi,
sonra üstüne daha çok sayıda ülke. Ülkenin kurucu kültürü = başkentinin hexinin
kültürü. Dünya doğuştan "bu sınır yapay" gerilimi taşır.

Nüfus **hexlerde değil şehirlerde** durur: her hexin bir kültürü, her şehrin
`{kültür: miktar}` bileşimi olur. Victoria'nın pop'larını hex başına taşımak
mobilde sürdürülemez.

Yabancı kültürlü toprak:

- İşgalden sonra **5 tur verim yok** (işgal dönemi)
- Sonrasında **−%30 verim** + hoşnutsuzluk
- Asimilasyon politikasıyla ~40 turda kendi kültürüne döner

Sonuç: **fetih 45-50 turda kâra geçer.** 250. turda yapılan fetih zarardır.
300 hexlik hoşnutsuz imparatorluk, 120 hexlik türdeş ülkeden fakir olabilir.

## 5. Infamy

Fetihle artar, yavaş düşer. Etkileri yeni sistem değil, **mevcut sistemlere**
bağlanır.

| Olay | Infamy |
|---|---|
| Kendi kültüründen hex almak | +0.5 |
| Yabancı kültürlü hex almak | +1 |
| Şehir almak | +6 |
| Turluk düşüş | −1 (politikaya göre değişir) |

| Eşik | Sonuç |
|---|---|
| 15 | Ticaret ortakları anlaşmayı keser |
| 30 | Komşular **koalisyon** kurar (çoklu savaş ilanı) |

Bu sayıların ürettiği kural: **bir şehir + çevresini almak güvenlidir
(~14 infamy), bir ülkeyi yutmak dünyayı üstüne çeker (~70).** Sınırlı savaş
serbest, total fetih cezalı.

## 6. Politikalar

3-4 yuva yeter. Her seçenek **savunulabilir** olmalı, biri açıkça üstünse tercih
değildir. Değiştirmek istikrara mal olur ki her tur oynanmasın.

| Yuva | Seçenek A | Seçenek B |
|---|---|---|
| Toprak | Asimilasyon: yabancı verim düzelir, infamy geç düşer | Özerklik: hoşnutsuzluk yok, kalıcı −%20 verim |
| Ekonomi | Serbest ticaret: +ortak, −gümrük | Korumacılık: +altın, −ortak |
| Ordu | Profesyonel: az/güçlü/pahalı | Milis: ucuz, erzak yer, savunmada güçlü |

## 7. Ticaret

Barışta tek dokunuşla anlaşma, sonrası pasif akış. Miktar
`min(fazla, karşı tarafın açığı)` ile sınırlı; altın alıcıdan satıcıya.
Her tur pazarlık yok.

Denge inceliği: ticaret **açığı olana** akar, yani fakiri güçlendirir. Bu,
ölçümlerde gördüğümüz hazine birikmesine (en yüksek 1110 altın) doğal tahliye.

## 8. Teknoloji

300 turluk ufukta 24-30 düğüm sığar. Üç dal: ekonomi, askerî, idare. Bonuslar
küçük ve tavanlı tutulur (teknoloji doğası gereği yüzdeliktir; binaların sabit
bonus kuralı burada geçerli değil ama sınır konmalı).

## 9. Zafer

Eleme değil, **hegemonya puanı**: ekonomi + teknoloji + prestij bileşimi.
Fetih bu puana katkı verir ama infamy ve hoşnutsuzluk üzerinden geri öder.

## 10. Denge eşikleri

Kod yazıldıktan sonra "iyi mi kötü mü" tartışması olmasın diye önceden sabit.
Ufuk 300 tura çıktığı için eski hedefler yeniden ölçeklendi.

| Ölçüt | Hedef | Bugünkü (150 tur, fetih oyunu) |
|---|---|---|
| **Fetih dışı yolla kazanılan oyun oranı** | **≥ %40** | — |
| 300. turda ayakta ülke | ≥ 6 | 3-6 (150. turda) |
| 300. turda lider toprak payı | %25-45 | %34-59 (150. turda) |
| 150. turda ayakta ülke | 8-10 | 3-6 |
| En yüksek biriken altın | < 400 | 150-1110 |
| Biriken demir/kereste | < 60 | — |
| Erzak fazlası 0…+5 olan ülke oranı | ≥ %60 | — |
| Tur süresi | < 8 ms | 4.5 ms |
| Bütünlük hatası | 0 | 0 |

İlk satır bu katmanın **var olma sebebi**. YZ simülasyonlarında hep en çok toprak
alan kazanıyorsa infamy/kültür/teknoloji dekordan ibarettir.

İkinci bir kabul ölçütü: türdeş küçük bir ülkenin, büyük ve hoşnutsuz bir
imparatorluğu **ekonomide** geçtiği en az bir örnek görülmeli.

## 11. Yol haritası

Her adım tek başına ölçülebilir olmalı; hepsini yazıp sonra denge aramak,
hangi mekaniğin bozduğunu ayırt etmeyi imkânsız kılar.

1. ~~**Kaynak havuzları + arazi verimleri + otomatik işçi**~~ — yazıldı, bkz. bölüm 13
1b. ~~**Binalar**~~ — yazıldı, bkz. bölüm 14. Vizyon değişince listeden düşmüştü;
    1. adımın açık bıraktığı altın birikmesini kapatmak için öne alındı.
2. **Kültür bölgeleri + şehir nüfusu** — worldgen değişikliği, kayıt biçiminden önce
3. ~~**Infamy + hoşnutsuzluk + ateşkes**~~ — yazıldı, bkz. bölüm 15
4. ~~**Kayıt/yükleme**~~ — yazıldı
5. **Politikalar** — *yazılmadı*
6. ~~**Ticaret**~~ — yazıldı (kayıt biçimi iki kez değişmesin diye öne alındı),
   bkz. bölüm 15
7. ~~**Teknoloji**~~ — yazıldı, bkz. bölüm 16
8. ~~**Hegemonya puanı ve zafer**~~ — yazıldı, bkz. bölüm 16
9. **Elle işçi ataması + şehir ekranı** — *yazılmadı*; en pahalı ve en riskli iş

Kültür üretimi (2) kayıt biçiminden (4) önce gelmeli: worldgen değişince eski
kayıtlar geçersiz olur.

## 12. Riskler

1. **Mikro patlaması** — seçilen iki seçenek de bu yönde. Panzehir: her sistemin
   otomatik varsayılanı olacak. Kural, `orders.js` dersinin genellenmiş hâli:
   **eklenen her sistemin bir "tek bakışta özet" satırı ve bir otomatik modu olacak.**
2. **Arayüz darboğazı** — asıl zorluk kod değil, 375 piksel. Şu anda tek alt panel
   var; politikalar, teknoloji, nüfus ve ticaret ekran istiyor.
3. **YZ'nin hedef seçimi** — bugün YZ'nin tek amacı toprak. Hegemonya oyununda
   "ticaretle mi, teknolojiyle mi, fetihle mi büyüyorum" kararı gerekiyor. Bu,
   projenin en zor parçası olacak.
4. **Kaynak kilidi** — ne demiri ne ticaret ortağı olan ada ülkesi ölü doğar.
   İzci'nin demirsizliği hafifletir ama ölçmek gerek.
5. **Altın birikmesinin dönüşü** — YZ'ye bina ve teknoloji alımı eklenmezse hazine
   yine şişer. Ekonomiyle **aynı anda** yazılmalı. *(Gerçekleşti, bkz. 13.)*

## 13. 1. adımın uygulama notları

Tasarımdan sapan ve ölçüm sonucu eklenen şeyler:

| Karar | Tasarımda | Uygulanan | Sebep |
|---|---|---|---|
| Şehir bedeli | 80 altın | 60 altın + 4 kereste | Kereste bir işe yarasın |
| İşçi tüketimi | belirtilmemiş | 2 erzak | 1 olunca erzak freni hiç bağlamıyor |
| Ambar kapasitesi | yok | `30 + 5×şehir` | Ölçümde 2968 demir, 7464 kereste birikti |
| Şehir erzak stoku | yok | 15 ile başlar | Ormanlık başlangıçta 1. turda birim dağılıyordu |
| Ordu tavanı | yok | hedefin 2 katı | Bir seed'de 93 süvari, tur 22 ms'ye çıktı |
| Nüfus artışı | belirtilmemiş | `15 + işçi×10` erzak | — |

### Ölçüm (150 tur, 4 seed)

| Ölçüt | Hedef | Sonuç |
|---|---|---|
| Ayakta ülke | ≥ 3 (150. turda 8-10 hedefi 300 tur içindi) | 2-5 |
| Lider toprak payı | %25-45 | %35-43 (ada haritasında %69) |
| Biriken demir/kereste | < 60 | 110-200 (tavana dayalı, sınırlı) |
| Erzak dengesi −2…+6 arası ülke | ≥ %60 | %50-75 |
| Tur süresi | < 8 ms | 2.9-3.7 ms |
| Bütünlük hatası | 0 | 0 |

### Açık kalan: altın birikmesi

En yüksek hazine **2022 altına** çıktı (hedef < 400) ve bu ekonomiden *önce*
görülen 1110'dan kötü. Sebebi mekanik: ordu artık **erzakla** sınırlı olduğundan
YZ altınını orduya çeviremiyor ve altının başka gideri yok.

Bu, binaların tam olarak çözmesi gereken sorun. Binalar yazılmadan altına yapay
bir fren koymak, gerçek gideri gizler. *(Çözüldü, bkz. 14.)*

## 14. Binaların uygulama notları

Tasarımdaki bina tablosu (bölüm 3) neredeyse aynen uygulandı; tek fark
Bıçkıhane/Demirhane/Liman'ın **arazi koşuluna bağlanması**: beslendiği arazi
yakında yoksa kurulamaz. Koşulsuz bıraksak oyuncu için tuzak olurdu (etkisi
sıfır bir binaya para vermek).

### Ölçüm (150 tur, 4 seed)

| Ölçüt | Öncesi | Sonrası |
|---|---|---|
| **En yüksek biriken altın** | 2022 | **29 / 52 / 705 / 29** |
| Ortalama hazine | — | 23-178 |
| Dolu bina yuvası | — | şehir başına 2.4-2.7 / 3 |
| Ayakta ülke | 2-5 | 3-5 |
| Lider toprak payı | %35-43 | %28-56 |
| Tur süresi | 2.9-3.7 ms | 3.5-4.2 ms |
| Bütünlük hatası | 0 | 0 |

Altın birikmesi dört seed'in üçünde hedefin (< 400) çok altına indi. Kalan
aykırı değer (705), tüm şehir yuvaları dolduktan sonra ordunun erzakla sınırlı
kalmasından: harcayacak yer bitiyor. **Yapısal sınır bu** — sıradaki gider
kalemleri ticaret (6) ve teknoloji (7).

## 15. Infamy, hoşnutsuzluk, ateşkes ve ticaret

Tasarım sayıları aynen uygulandı. Eklenen üç şey:

| Ekleme | Sebep |
|---|---|
| Ateşkes: barıştan sonra 15 tur savaş yasağı | Barış yapıp ertesi tur saldırmak serbestti |
| Şöhretin **oransal** azalması (`1 + %3`) | Sabit azalmayla 300. turda 1548'e çıkıyordu |
| YZ şöhreti 18'i geçince yeni savaş açmaz | Koalisyon riskini hesaba katsın |

Şehir zaptının gerçek bedeli **~12 infamy**: şehir (+6) artı zaptla birlikte
gelen çevre kareler. Tasarımda öngörülen "bir şehir + çevresi ~14" ile uyumlu.

### Ölçüm (300 tur, 4 seed)

| Ölçüt | Hedef | Adım 2 sonrası | **Şimdi** |
|---|---|---|---|
| 150. turda ayakta | 8-10 | 2-5 | **6-9** |
| 300. turda ayakta | ≥ 6 | — | 4-6 |
| 300. turda lider payı | %25-45 | — | %30-61 |
| En yüksek şöhret | anlamlı kalmalı | 1548 | **107-178** |
| En yüksek hazine | < 400 | 3465 | **210-375** (bir aykırı: 1772) |
| Tur süresi | < 8 ms | 3.5-4.2 | 3.2-4.2 ms |
| Bütünlük hatası | 0 | 0 | 0 |

### Kaynak kilidi çözüldü

Bölüm 14'te "demir üretimi 0, stoğu 3'te kilitli" diye yazdığımız ülke artık
ticaretle **12-45 demir** tutuyor. Dört seed'in hepsinde demir üretmeyen 2 ülke
var ve hiçbiri kilitli değil. Ticaretin varlık sebebi buydu.

### Açık kalanlar

- 300. turda lider payı iki seed'de %61 ve %41 — hedef %25-45'in üstünde.
  Politikalar (5) ve teknoloji (7) fakire alternatif yol açtığında düşmesi
  beklenir.
- Bir seed'de hazine 1772'de kaldı: tüm bina yuvaları dolu, ordu erzakla
  sınırlı, ticaret ortağı doymuş. Teknoloji sıradaki gider kalemi.

## 16. Teknoloji, hegemonya zaferi ve ana ölçütün karşılanması

Üç dal (ekonomi/askerî/idare) × dört kademe = 12 teknoloji. Kademe maliyeti
katlandığı için 250 turluk oyunda bir ülke 2-5 teknoloji alıyor: dal seçmek
gerçek bir tercih. Etkiler yeni mekanik eklemiyor, mevcutların katsayısını
oynatıyor (şehir üretimi, ambar, yolsuzluk tabanı, asimilasyon, şöhret azalması,
bina yuvası, birim canı/saldırısı, sur etkisi).

Zafer: **hegemonya puanı** = ekonomi (üretim×1.2) + teknoloji (kademe×7)
+ prestij (şehirler + barışçı ilişkiler×2 + toprak×0.04). Toprağın katsayısı
kasten en zayıf. Eşiğe ilk ulaşan ya da 300. turda en yüksek olan kazanır.

### Ana ölçütün hikâyesi

Tasarımın kabul ölçütü şuydu: **oyunların en az %40'ı fetih dışı bir yolla
kazanılabilmeli** (bölüm 10). Ölçüm üç aşamada yürüdü:

| Durum | Ort. bitiş turu | Fetih dışı kazanma |
|---|---|---|
| Eşik 220 | 122 | %38 |
| Eşik 420 (seçilen 250-300 ufkuna uyum) | 236 | **%17** |
| Eşik 420 + asimilasyon teknolojiye bağlı | 244 | **%50** |

Ortadaki satır önemli bir şey öğretti: **oyun uzadıkça fetih kazanıyordu.**
Sebebi, fethin bütün bedellerinin geçici olmasıydı — 40 turda asimilasyon
tamamlanıyor, şöhret sönüyor, yabancı toprak tam verimli hâle geliyor. 250
turluk bir oyunda bu, fethi matematiksel olarak en iyi strateji yapıyor.

Çözüm katsayı oynatmak değil, tasarımda zaten duran kancayı kullanmak oldu:
**asimilasyon artık bedava değil, İdare dalındaki Asimilasyon teknolojisini
gerektiriyor.** O teknoloji olmadan fethedilen toprak kalıcı olarak yabancı ve
−%30 verimli kalıyor. Böylece fethin bedeli süreklileşti.

12 oyunun kazananlarından yalnız 1'i Asimilasyon teknolojisine sahipti: yani
fetihçiler idari yatırımı genellikle yapmıyor ve fethettikleri toprak onlara
tam getiri sağlamıyor. Amaçlanan baskı tam olarak bu.

### Ölçüm (12 seed, zafere kadar)

| Ölçüt | Hedef | Sonuç |
|---|---|---|
| **Fetih dışı kazanma** | ≥ %40 | **%50** |
| Bitiş turu | 250-300 ufku | ort. 244 (182-300) |
| Ayakta ülke | ≥ 6 (300. turda) | 3-7 |
| Lider toprak payı | %25-45 | %20-62 |
| En yüksek hazine | < 400 | 430 (bir seed) |
| Tur süresi | < 8 ms | ≤ 5.4 ms |
| Bütünlük hatası | 0 | **0** |

Aşan iki ölçüt (lider payı %62, hazine 430) tek seed'de görülüyor ve
politikalar (5. adım) yazılmadığı için fakirin elinde henüz bir alternatif
kaldıraç yok. Politikalar geldiğinde yeniden ölçülmeli.

## 17. Ölçüm yönteminin kendisi hakkında

Yol katmanı eklenirken ana ölçütün ("oyunların ≥%40'ı fetih dışı kazanılmalı")
güvenilir olmadığı anlaşıldı. Üç kusur vardı:

**1. Pasif oyuncu sonuçları kirletiyordu.** Simülasyonda oyuncu ülkesi hiçbir
şey yapmıyor, altın biriktiriyor ve "hazine 1533" gibi sahte alarmlar
üretiyordu. Ölçümler artık `playerNation = -1` ile, **tüm ülkeler YZ** olarak
koşuluyor.

**2. 12 seed yetersiz.** Aynı yapı arka arkaya %17 ve %33 verdi; 30 oyunda bile
güven aralığı ±16 puan. Bu ölçütle 10 puanlık farklar okunamaz. Karar vermek
için en az 30 oyun, tercihen daha fazlası gerekir.

**3. İkili ölçüt yanıltıcı.** "Kazanan en geniş ülke mi?" sorusu, toprağın
ekonomiyi *dolaylı* beslediğini gizler: en geniş ülke genellikle en üretken
ülkedir.

### Daha iyi gösterge: kazananın puan kompozisyonu

20 oyunda kazananın hegemonya puanının kaynağı:

| Bileşen | Pay |
|---|---|
| Ekonomi + teknoloji | **%84** |
| Toprak (doğrudan) | %6 |
| Kalan prestij (şehir, barış) | %10 |

Yani zafer **üretimden** geliyor, topraktan değil — tasarımın istediği bu.
Ama toprak hâlâ üretime giden en iyi *yol*. Bu, Victoria'nın kendi mantığıyla
tutarlı (fetih bir araçtır, amaç değil); yine de "fetih dışı yol yeterince
güçlü mü" sorusu açık kalıyor ve cevabı ikili ölçütle değil bu kompozisyonla
izlenmeli.

### Yol yatırımı: çözülmemiş

Ölçümde yol yapan ülkelerin kazanma oranı %14, yapmayanların %22. İlk bakışta
yol bir tuzak gibi duruyor ama sebep muhtemelen ters nedensellik: `investInRoads`
ancak ordu/bina/teknoloji alımından sonra hâlâ 140+ altını olan ülkelerde
çalışıyor, yani yol yapanlar **zengin değil, parasını başka bir şeye
harcayamayan sıkışmış** ülkeler. Yola seviye başına +1 altın getiri eklendi;
gürültü içinde bu değişimin etkisi ayırt edilemedi. Yol maliyeti/getirisi hâlâ
ölçülmüş bir denge değil.

### Gözlenen: kaynak kilidi gerçek

TNGZT4'te bir ulusun demir üretimi **0**, stoğu 3'te kalıyor. Tepe/dağ toprağı
olmadığı için Demirhane de kuramıyor; yalnız İzci üretebiliyor. Bu, bölüm 12'de
4 numaralı risk olarak yazdığımız durumun doğrulanması. İzci'nin demirsiz
olması ülkeyi ayakta tutuyor ama gerçek çözüm ticaret (6. adım).

## 18. Sürekli kaynak giderlerinin ikinci ölçümü

Kereste ve demir bakımından sonra görülen 1432 altınlık hazine önce ticaret
kapasitesine bağlandı. Tur izleri bu tahmini doğrulamadı:

- Kerestesi 0 olan ülkenin bakım bilançosu −2 olmasına rağmen binaları tam
  verimle çalışıyordu. Stok 0'a sabitleniyor, açığın hiçbir sonucu olmuyordu.
- Yol seviyesi işlenen karede +1 altın üretiyor ama yolun sürekli gideri yoktu.
  Yol ağı tamamlandıktan sonra bu gelir sonsuza kadar hazineye ekleniyordu.
- Bazı kilitli ülkelerde `ROUTE_CAPACITY = 3` değil, uygun satıcının hiç
  bulunmaması sorundu. Kapasiteyi büyütmek bu durumu değiştirmiyor.

İki simetrik sonuç eklendi: kereste açığında bütçe dengelenene kadar en yeni
binalar bakımsızlıktan kapanıyor; yol seviyesi başına 1 altın bakım ödeniyor.
İşlenen yol kendi ticaret gelirini karşılıyor, atıl stratejik ağ ise gerçek bir
bütçe tercihi oluyor.

İki bağımsız 30 oyunluk grupta finaldeki en yüksek ülke hazinesi:

| Grup | Medyan | p90 | En yüksek |
|---|---:|---:|---:|
| ECON | 109 | 149 | 177 |
| VERIFY | 108 | 159 | 213 |

Geçici zirveler 457 ve 456; bunlar sonraki teknoloji/yapı harcamasında düşüyor.
Yol bakımını aynı VERIFY seed'lerinde kapatan A/B koşusunda final maksimumu
213'ten 749'a çıktı. Fetih dışı oran yalnız bir oyunda değişti (%23 → %27);
bu, 30 oyunluk örneklemin belirsizliğinin altında. İki grubun ikili fetih dışı
sonucu %40 ve %23 olduğundan bu ölçüt hâlâ kararsız; bölüm 17'deki puan
kompozisyonu göstergesiyle birlikte izlenmeli.

## 19. Gerçek zamanlı pazar, sınıflar, sanayi ve cephe dikey dilimi

Tur sonu düğmesi kaldırıldı. Simülasyon artık haftalık adımlarla akar ve
duraklatma, 1×, 2×, 4× hızlarıyla yönetilir. Bu, ekonominin ve cephelerin
oyuncu emri beklemeden birbirini beslemesini sağlıyor. Yeni oyun ve kayıt
yükleme duraklatılmış başlar; otomatik kayıt her on haftada bir yapılır.

### Dünya pazarı

Dört stratejik stoğun yanında yedi işlenmiş mal tanımlandı: kömür, konserve,
kumaş, alet, çelik, silah, mobilya ve lüks ürünlerle toplam on bir piyasa malı
var. Her hafta gerçekleşen üretim ve tüketim arz/talep sayaçlarına yazılır;
fiyat önceki değerden kademeli hareket eder. Ülkelerin eksik kereste ve demiri
dünya pazarından alması özellikle önemlidir: stok açığı artık yalnız yerel bir
engel değil, herkesin ödediği fiyatı yükselten küresel taleptir.

### Sınıflar ve maliye

Nüfus alt (%78), orta (%17) ve üst (%5) sınıfa ayrıldı. Sınıfların ayrı geliri,
ihtiyaç sepeti, yaşam standardı ve memnuniyeti var. Oyuncu her sınıfın vergisini,
gümrük tarifesini ve ordu bakımını ayrı kaydırıcılarla belirler. Ordu bakımını
azaltmak bütçede anlık rahatlama sağlar ama cephe gücünü aynı oranda düşürür.

### Fabrikalar

Yedi fabrika tarifi yerel hammaddeyi dünya fiyatından girdiye, işlenmiş mala
çevirir. İşçi doluluğu anlık değildir: kârlı tesisler boş işgücünden haftalık
işçi çeker, zarar edenler işçi kaybeder. Böylece yüksek çıktı fiyatı tek başına
yeterli değildir; girdi maliyeti ve tarife de yatırım kararını değiştirir.
Sanayi ekranı her tesis için çalışan/kapasite, haftalık kâr, marj ve üretim
zincirini gösterir.

### Cephe savaşı

Tek tek birlik mikro yönetimi yerine savaş başına otomatik temas cepheleri
oluşturulur. Beş haftada bir iki tarafın kara gücü, ordu bakım bütçesi ve küçük
bir belirsizlikle muharebe çözülür. Kayıplar birlik canına uygulanır; yenilen
taraf geri çekilmiş sayılır. Cephe ilerlemesi ±100'e ulaştığında sınırdaki bir
hex ve varsa şehir el değiştirir. Harita üzerindeki cephe rozeti ve Diplomasi
ekranı asker gücünü, ilerlemeyi ve son muharebe sonucunu gösterir.

Bu ilk dikey dilim general, ikmal hattı ve saldırı emri içermiyor. Bunlar,
temel ekonomik-savaş geri beslemesi oynanıp ölçüldükten sonra eklenecek ikinci
katmandır.

### İlk denge gözlemi

Beş seed'lik hızlı başsız koşuda simülasyon hatasız tamamlandı. Stratejik pazar
alımları eklenmeden bir ülke 1112 altınla kaynak kilidinde kalabiliyordu.
Alımlar dünya fiyatına bağlandıktan sonra finalde en zengin ülke medyanı 236,
p90 ve maksimum 370 oldu. Bu küçük örnek sonuç kararı değildir; 30+ seed ile
yeniden ölçülmelidir. Yine de stok-pazar bağının eski para biriktirme arızasını
doğru yönde kırdığı görülüyor.

## 20. Tek savaş dili ve anlamlı provinceler

Vic3 tarzı otomatik cephe ile haritada seçilip yürütülen birlikler birbirini
boşa çıkarıyordu: oyuncu bir orduyu konumlandırabiliyor ama savaşın sonucu o
ordunun bulunduğu yerden bağımsız çözülüyordu. Cephe sistemi kaldırıldı.

Yeni modelde haritadaki her ordu birden fazla alay taşır. Dost ordular aynı
province'de birleşir. Bitişik düşman ordusuna saldırı haftalık, en fazla altı
raundluk bir muharebe başlatır. Asker sayısı ve moral birlikte aşınır; arazi ve
şehir savunana, ordu bütçesi iki tarafa katsayı verir. Moral kırılınca ordu
kendi kontrolündeki bir province'e çekilir ve üç hafta emir alamaz. Kazanan
sahada kalır ve province'i işgal eder. Böylece oyuncunun haritada gördüğü,
seçtiği ve yürüttüğü nesne savaş hesabındaki nesnenin aynısıdır.

Her geçilebilir kara hex'i artık bir province'dir ve şunları taşır:

- Yerel nüfus
- Sahiplik değişince düşen, zamanla toparlanan kontrol
- Tarım, çıkarım ve ticaret için üç ayrı 0-5 gelişim seviyesi
- Şehir işçisi atamasından bağımsız haftalık hammadde ve vergi katkısı

Province geliştirmek 20 idari kapasiteyle birlikte altın ve kereste harcar.
İdari kapasite 100'de sınırlı ve haftada 2 yenilenir. Bu kaynak, boş zamanda
her kareye basılan bedava bir düğme yerine “hangi bölgeyi önce uzmanlaştırayım?”
kararı yaratır. Verimli ova tarım, orman/tepe çıkarım, kıyı ve altın üreten
arazi ticaret için daha iyi adaydır.

Alt panel seçili bir province'in nüfusunu, kontrolünü, gerçek haftalık çıktısını
ve üç yatırımın maliyetini birlikte gösterir. Seçim yokken “sonraki anlamlı
karar” kartı ülkenin açık veren kaynağına, savaşa ve mevcut idari kapasiteye
göre tek bir öneri verir.

Province üretimi eski 420 hegemonya eşiğini 70-100 haftada doldurduğu için hedef
1000'e ölçeklendi. İlk beş seed'de 750 hedefiyle ortalama bitiş 171 haftaydı;
1000 hedefi 220-300 haftalık eski tasarım ufkunu geri kazanmayı amaçlıyor.

Üç ayrı 180 haftalık bütünlük koşusunda 132 muharebe gözlendi. Orphan muharebe
referansı, aynı karede iki ordu ve boş/negatif alay yığını sayıları sıfırdı.

## 21. Savaş temposu, çalışan maliye ve harita yapıları

YZ'nin savaş kararı ilk 26 hafta kilitli ve daha sonra aylık değerlendirilir.
Bir ülke ikinci bir savaşı açamaz; en az dört kara alayı, 45 altın ve %40
istikrar gerekir. Uygun hedef bulunsa bile aylık savaş ilanı olasılığı %2'dir;
barıştan sonra aynı iki ülke arasında 26 haftalık ateşkes vardır.
Bu tempo savaşın kaybolmadığı fakat haritanın sürekli zincir savaşa da
dönüşmediği başlangıç aralığını hedefler. Altı ayrı 250 haftalık koşuda 4–32
savaş görüldü; ortalama 18.8 savaştı. Aynı koşularda bütünlük hatası sıfırdı.

Budget & Society artık yalnız arayüz değerleri değildir. Vergi doğrudan hazine
gelirine; tarife hem dış ticaret gelirine hem hanelerin ödediği ihtiyaç sepetine;
ordu bütçesi ise bakım giderine ve gerçek muharebe gücüne bağlanır. Sınıfların
ağırlıklı memnuniyeti ulusal istikrarı üretir. İstikrar province kontrol
toparlanmasını, nüfus büyümesini, idari kapasite yenilenmesini ve fabrika
işgücünü etkiler.

Aynı seed üzerinde 180 haftalık politika A/B koşusu:

| Politika | Vergi | Tarife | İstikrar | Alt sınıf memnuniyeti | Otorite |
|---|---:|---:|---:|---:|---:|
| Düşük vergi + sübvansiyon | 0.00 | −2.98 | %57 | %59.7 | 92.8 |
| Yüksek vergi + yüksek tarife | 4.02 | 11.92 | %27 | %29.0 | 85.9 |

Ordu bütçesini %100'den %25'e indirmek aynı kuvvet için haftalık bakımı
2.0'dan 0.5 altına düşürdü; muharebe katsayısı da aynı politika değerini
kullanıyor.

Şehir binaları artık Construction ekranından doğrudan satın alınmaz. Oyuncu
önce yapıyı, sonra haritada uygun bir province'i seçer. Kıyı, hammadde ve arazi
koşulları yer seçimini anlamlı kılar; bir province yalnız bir yapı taşıyabilir.
Yapılar Canvas üzerinde görünür, kayıt dosyasında province ile saklanır ve şehir
fethinde bağlı yapılar tutarlı biçimde el değiştirir. Başsız bütünlük koşusunda
212 yapı üretildi ve sahipsiz/geçersiz yapı sayısı sıfır kaldı.

## 22. Ölü katmanların sökülmesi ve çalışan bir zafer koşulu

Rework sırasında sökülen sistemlerin arkasında kalan ulaşılamaz kod temizlendi:
eski şehir binası katmanı, yol ağı, ordu modernizasyonu, province geliştirme ve
şehir nüfus büyümesi. Hiçbiri bir çağrı noktasına bağlı değildi; bir kısmı
bütçede daima sıfır olan gider satırları üretiyordu. Kayıt şeması v8'e çıktı ve
kare kaydından ölü yol/yapı alanları düştü.

Zafer koşulu çalışmıyordu. Ölçüm, lider ülkenin hegemonya puanının 300 hafta
boyunca **sabit** kaldığını gösterdi:

| | hafta 50 | hafta 300 |
|---|---:|---:|
| Puan | 117 | 126 |
| Province | 136 | 141 |
| Şehir | 4 | 5 |
| Nüfus | 685K | 721K |
| Fabrika seviyesi | 4 | 13 |

Puan formülü ham üretim ve prestijden oluşuyordu; ikisi de ilk elli haftada
donuyor. Büyüyen tek eksen olan sanayi ise puana hiç girmiyordu. Bu yüzden eşiği
düşürmek işe yaramazdı: oyun 50. haftada biterdi. Kurulu fabrika seviyesi
ağırlık 10 ile ekonomi bileşenine bağlandı; puan artık 187'den 440'a çıkıyor.

Eşik ölçümle seçildi. 12 oyunluk koşularda:

| Eşik | Ortalama bitiş | En erken | Eşiğe ulaşarak biten |
|---:|---:|---:|---:|
| 400 | 235 | 179 | %83 |
| 420 | 263 | 189 | %58 |
| 440 | 277 | 205 | %42 |

400 seçildi: ortalama 220-300 haftalık tasarım ufkunun içinde kalıyor ve
oyunların çoğu süre dolarak değil, gerçekten hedefe ulaşarak bitiyor. Bedeli,
geç oyunda puanın çoğunluğunun sanayiden gelmesi. Fetih ya da province gelişimi
tekrar büyümeye başlarsa ağırlık yeniden ölçülmeli.
