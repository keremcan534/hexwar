# HexWar

Hex tabanlı, prosedürel dünya üreten, mobil öncelikli gerçek zamanlı strateji
oyunu prototipi. Bağımlılık yok: saf ES modülleri ve Canvas2D; derleme adımı
gerekmez.

## Çalıştırma

```bash
npm run dev
```

Ardından `http://localhost:5173` adresini aç. Belirli bir dünyayı paylaşmak için
seed'i URL'ye ekle: `http://localhost:5173/?seed=TNGZT4`.

Ekonomi denge simülasyonu:

```bash
npm run diagnose:economy -- 30 VERIFY
npm run diagnose:system -- VERIFY 250
npm run diagnose:policy
```

## Kontroller

| Hareket | Mobil | Masaüstü |
| --- | --- | --- |
| Kaydır | tek parmak sürükle | orta tuş sürükle · `WASD` / ok tuşları |
| Yakınlaş | iki parmak pinch | fare tekerleği |
| Seç | dokun | sol tık |
| Çoklu seç | basılı tut + sürükle | sol tuş basılı + sürükle (kutu seçimi) |
| Yürüt | seç, sonra hedefe dokun | sağ tık |
| Seçimi bırak | boş yere dokun | boş yere sol tık · `Esc` |
| Cephe çiz | Front/Fallback + sınıra dokun | Front/Fallback + sınıra tık · sağ tuş sürükle |
| Zaman | duraklat, 1×, 2×, 4× | `boşluk` duraklat · `+` / `−` hız |

Giriş HOI4 semantiğindedir: **sol tuş seçer, sağ tuş yürütür**. Sol tuş sürükleme
masaüstünde klasör seçer gibi kutu seçimi yapar, bu yüzden kamera orta tuş ve
`WASD`/ok tuşlarıyla gezer. Sağ tuşu *sürüklemek* cephe hattı çizer, *tıklamak*
seçili tümenleri oraya yürütür; birden çok tümen seçiliyse hedefler çevreye
yayılır, hepsi tek province'e tıkışmaz.

Oyun haftalık adımlarla gerçek zamanlı akar. Saat penceresi sağ üsttedir; boşluk
tuşu duraklatır ve duraklatmadan önceki hızı hatırlar, `+`/`−` kademe değiştirir.
Yeni oyun ve yüklenen kayıt duraklatılmış başlar.

Ekran yerleşimi Vic2 düzenindedir: seçili province penceresi **sol altta**, saat
**sağ üstte**, harita kipleri **sağ altta**. Dar ekranda panel genişler ve kipler
onun üstüne çıkar.

## Ana sistemler

### Dünya pazarı ve sanayi

Gıda, kereste, demir, kömür, konserve, kumaş, alet, çelik, silah, mobilya ve
lüks ürünlerden oluşan tek bir dünya pazarı vardır. Her malın fiyatı haftalık
arz-talep dengesine göre değişir. Bir ülkenin stratejik mal satın alması talebi
ve dolayısıyla küresel fiyatı artırır.

Şehirlere Victoria tarzı fabrikalar kurulabilir. Fabrikalar işçilerini zamanla
doldurur; girdilerini dünya fiyatından alıp çıktılarını dünya fiyatından satar.
Girdi pahalanır ya da çıktı ucuzlarsa kâr düşer, işçiler fabrikadan ayrılmaya
başlar. Sanayi ekranı üretim zincirini, kapasiteyi ve beklenen kârı gösterir.

Sanayileşmenin sabit bir tavanı yoktur: fabrika kurulum bedeli kurulu kapasiteyle
birlikte artar, genişletme maliyeti ise seviye başına üstel büyür. Böylece sanayi
geç oyunda da hazineyi emmeye devam eder.

### Nüfus ve bütçe

Nüfus alt, orta ve üst sınıf olarak üçe ayrılır. Her sınıfın nüfusu, geliri,
yaşam standardı, memnuniyeti ve ayrı vergi oranı vardır. Bütçe ekranında üç
vergi, gümrük tarifesi ve ordu bakım oranı değiştirilebilir. Düşük ordu bakımı
harcamayı azaltırken orduların muharebe gücünü de doğrudan düşürür.
Yüksek vergi ve pozitif tarifeler geliri artırır; hane alım gücünü, sınıf
memnuniyetini ve ulusal istikrarı düşürür. İstikrar da nüfus büyümesini, province
kontrolünün toparlanmasını, idari kapasiteyi ve fabrika işgücünü etkiler.

Bütçe ekranında ayrıca üç sürekli sosyal harcama vardır: eğitim, sağlık ve
refah. Maliyetleri nüfusla birlikte büyür. Eğitim işgücünü niteliklendirir ve
araştırmayı ucuzlatır, sağlık nüfus büyümesini ve yaşam standardını yükseltir,
refah bütün sınıfların memnuniyetini artırır.

İmparatorluk büyüdükçe idari gider de artar: şehir sayısı süperdoğrusal,
province sayısı ve şehirlerin başkente uzaklığı doğrusal olarak haftalık altın
yer. Bu kalem Lojistik/Ülke ekranında ayrı satır olarak görünür.

Üst çubukta toplam nüfus, asker sayısı ve GSYİH sürekli görünür.

### Ordu yığınları ve province muharebeleri

Haritadaki ordular birkaç alaydan oluşan yığınlardır. Aynı province'e giren
dost ordular birleşir; düşman orduları ise EU4 tarzı haftalık muharebeye
kilitlenir. Arazi savunanı, ordu bütçesi iki tarafın gücünü etkiler. Asker
sayısı ve moral her raund aşınır; morali kırılan ordu üç hafta geri çekilir,
kazanan province'i işgal eder.

### Seçim ve komuta arayüzü

Kutu seçimi yapıldığında **solda tümen listesi** açılır: her satırda alayların
bileşimi, asker sayısı, morali, durumu (bekliyor / yürüyor / muharebede /
çekiliyor) ve komutanı görünür. Satıra tıklamak kamerayı o tümene götürür.

**Komuta paneli ekranın orta altında her zaman durur**: ülkenin her generali için
bir portre yuvası, sonda **+** (Assign) yuvası. Portreye **sol tık** o generalin
bütün tümenlerini seçer, **sağ tık** o an seçili tümenleri ona devreder — 10
tümenden 5'ini seçip başka bir generale sağ tıklamak onları o komutaya geçirir.
**+** seçimi listeden bir subaya bağlar.

Bir general seçiliyken portrelerin üstünde plan araçları çıkar: **Front**,
**Fallback**, **Offensive** ve **duruş 1-2-3**. Duruş ilerleme hızını ve bir
haftada kaç province ilerleneceğini belirler (temkinli 3 haftada bir 1 kare,
saldırgan her hafta 3 kare).

### Komutanlar

Her ülke bir subay kadrosuyla başlar. Bir general tek tümene değil bir **ordu
grubuna** komuta eder; altındaki bütün tümenler onun bonuslarını alır ve bir
tümen aynı anda yalnız tek generalde olur. Yetenek (1–5) her kademede %6 güç
verir, nitelikler kendi alanlarında
ekler: saldırı/savunma doktrini, mühendis (arazi ve tahkimat bonusunu deler),
süvari/topçu uzmanı (yığındaki o kolun payı kadar), kurmay (cephe planını
hızlandırır), düzenbaz (muharebe zarının aralığını genişletir).

Generaller savaştıkça tecrübe kazanıp terfi eder. İki tümen birleşince komuta
hedefin generalinde kalır. Altınla yeni subay yetiştirilir; kadro büyüdükçe
pahalanır.

### Cephe hatları ve muharebe planları

Komuta panelindeki **Front** ya da **Fallback** düğmesine basınca imlecin
yakınındaki sınır parlar; tıklayınca hat oraya oturur — hex hex çizmek gerekmez.
Sınır hangi ülkeyle ise o ülkeyle olan hat seçilir; komşuda sahipli ülke yoksa
kendi sınırımızın tamamı kullanılır. Bir generalin aynı anda ya cephe hattı ya
geri çekilme hattı olur: biri kurulunca diğeri kalkar.

**Offensive** planında çizilen hat cephe değil **hedeftir**: ordunun ilerleyeceği
sınırı çizersin, plan mevcut cephenden oraya doğru yürür. Kopuk çizersen aradaki
boşluklar doldurulur, tek province seçersen ondan bir hedef hattı türetilir.
Seçili taarruz planının izleyeceği güzergâh haritada kesikli province'lerle
gösterilir.

Masaüstünde sağ tuşu basılı tutup sürüklemek de serbest hat çizer.

Hatta atanan ordular kendiliğinden hat boyunca dağılır — her ordu kendine en
yakın boş hat karesine yürür, oyuncu tek tek yürütmez. Hat boşta beklerken
**planlama** birikir (haftada %6, kurmay generalle daha hızlı); plan olgunlaştıkça
o cephedeki ordular muharebede %25'e kadar bonus alır.

"Execute Plan" denince hat ilerlemeye başlar: cephe hattı düşman toprağına
itilir, taarruz planı çizilen hedef hattına yürür. Hız hem planlama olgunluğuna
hem komutanın duruşuna bağlıdır. İlerledikçe hazırlık erir — plan harcanan bir
kaynaktır.

Cephe yalnız kimin nerede duracağını ve ne zaman ilerleyeceğini yönetir;
muharebenin kendisi hâlâ province muharebesidir. Ayrı bir soyut cephe gücü
havuzu yoktur, savaş sonucu haritadaki ordulardan çıkar.

Alay kurmak province nüfusundan asker alır: piyade 3000, süvari 2000, topçu 1500
kişi. Asker çıkış province'i ve komşularından toplanır, dağıtımda hayatta kalanlar
aynı yerlere döner, savaşta ölenler kalıcı kayıptır. Üst şeritteki **MANPOWER**
kalan asker havuzunu gösterir.

Bir province seçilip **toplanma noktası** atanabilir; yeni kurulan alaylar
çıktıkları yerden oraya kendi yürür ve oradaki dost yığına katılır. Nokta
haritada altın renkli artı-daire ile işaretlenir.

Alaylar dört teçhizat kademesi taşır (Levy → Regular → Drilled → Modern).
Üretim ekranındaki Modernization kartından altın ve demir ödenerek bir kademe
yükseltilir; kademe muharebe gücünü artırırken haftalık altın bakımını da
kalıcı olarak yükseltir. Bakım çarpanı güçten daha hızlı büyüdüğü için modern
ordu tutmak bilinçli bir bütçe tercihidir.

### Province kararları

Her kara hex'i nüfus, kontrol ve üç kalıcı gelişim hattı taşır: tarım, çıkarım
ve ticaret. Bütün provinceler bağımsız olarak vergi ve hammadde üretir; şehirler
ise sanayi merkezidir. Geliştirme altın, kereste ve sınırlı idari kapasite
kullandığı için her yeri aynı anda yükseltmek mümkün değildir.

Fethedilen province düşük kontrolle başlar ve tam üretime zamanla döner. Böylece
arazi yalnız harita rengi değil, nüfus ve üretim tabanıdır.

Construction ekranındaki binalar şehir listesine anında eklenmez. Önce bina
seçilir, ardından uygun olduğu vurgulanan bir province haritada tıklanır. Her
province tek yapı taşır; liman kıyı, maden demir, tarım arazisi verimli toprak
ister. Yapı, yakındaki şehrin kapasitesini ve ekonomisini kullanırken haritada
fiziksel olarak görünür ve fetihte bağlı olduğu şehirle birlikte el değiştirebilir.

### Kaynak ekonomisi

Altın, erzak, kereste ve demirin hem üretimi hem sürekli gideri vardır.
Binalar kereste, ağır birlikler demir, yollar altın tüketir. Karşılanamayan
kereste bakımı binaları geçici olarak kapatabilir. Stratejik stok açığı dünya
pazarından alımla kapatılır; böylece yerel kıtlık küresel fiyata yansır.

## Mimari

```text
src/
  core/      hex matematiği, seed'li PRNG, gürültü, yol bulma
  world/     arazi, prosedürel dünya, ülkeler
  render/    kamera ve Canvas2D harita/muharebe çizimi
  input/     birleşik dokunmatik, fare ve pinch girişi
  game/
    game.js        gerçek zaman saati ve oyun kabuğu
    turn.js        haftalık simülasyon adımı
    economy.js     dünya pazarı, sınıflar, fabrikalar ve maliye
    battles.js     ordu yığını muharebesi, moral ve geri çekilme
    provinces.js   nüfus, kontrol, yerel üretim ve geliştirme
    cities.js      şehir, bina ve eski kaynak ekonomisi
    trade.js       stratejik mal ticareti
    diplomacy.js   savaş ve barış
    ai.js          ülke yapay zekâsı
    save.js        sürümlü kayıt
  ui/
    hud.js         üst çubuk, tarih ve hız denetimi
    screens.js     sanayi, bütçe, ticaret ve diplomasi ekranları
```

Katmanlar tek yönlüdür: `ui` ve `render`, `game` katmanını tanır; `world` ve
`core` üst katmanları tanımaz. Bu sayede ekonomi ve dünya simülasyonları
tarayıcı olmadan Node ile de test edilebilir.

## Tasarım notları

- Harita pointy-top eksenel `q,r` koordinatları kullanır.
- Çizim sürekli çalışan bir animasyon döngüsü yerine gerektiğinde yenilenir;
  simülasyon saati hafif bir zamanlayıcıyla ilerler.
- Diplomasi ilk 26 hafta barış süresi tanır. Yapay zekâ savaş kararını aylık
  değerlendirir; yalnız temas ettiği, istikrarlı, hazırlıklı ve tek cepheli
  ülkeler uygun gördüğü komşularla savaş açar.
- Kayıtlar her on haftada otomatik alınır; eski kayıt sürümleri güvenle yok
  sayılır.

## Sonraki adımlar

- Cephelere ikmal menzili ve yıpranma; hattan kopan ordunun cezalandırılması
- Yapay zekânın da cephe çizip plan yürütmesi (şu an yalnız oyuncu kullanıyor)
- Savaş sıklığının yeni muharebe modeline göre yeniden ayarlanması
- Nüfus sınıfları arasında meslek ve toplumsal hareketlilik
- Dünya pazarı için ülke bazlı ihracat önceliği ve ambargo
- Fabrika rezervleri, ücret politikası ve iflas/kapanma
- İttifaklar ve savaşa çağrı
