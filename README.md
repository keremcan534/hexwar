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
| Cephe yönet | general + hedef + Offensive | general + hedef + Offensive |
| Zaman | duraklat, 1×, 2×, 4× | `boşluk` duraklat · `+` / `−` hız |

Giriş HOI4 semantiğindedir: **sol tuş seçer, sağ tuş yürütür**. Sol tuş sürükleme
masaüstünde klasör seçer gibi kutu seçimi yapar, bu yüzden kamera orta tuş ve
`WASD`/ok tuşlarıyla gezer. Sağ tuşu tıklamak ya da sürükleyip bırakmak seçili
tümenleri hedef province'e yürütür; birden çok tümen seçiliyse hedefler çevreye
yayılır, hepsi tek province'e tıkışmaz.

Oyun haftalık adımlarla gerçek zamanlı akar. Saat penceresi sağ üsttedir; boşluk
tuşu duraklatır ve duraklatmadan önceki hızı hatırlar, `+`/`−` kademe değiştirir.
Yeni oyun ve yüklenen kayıt duraklatılmış başlar.

Ekran yerleşimi Vic2 düzenindedir: seçili province penceresi **sol altta**, saat
**sağ üstte**, harita kipleri **sağ altta**. Dar ekranda panel genişler ve kipler
onun üstüne çıkar.

## Ana sistemler

### Oyunun amacı: hegemonya

Zafer eleme değil üstünlüktür. Her ülkenin haftalık bir hegemonya puanı vardır:
ham üretim ve kurulu sanayi kapasitesi **ekonomi**, şehirler ile barışçı
ilişkiler ve toprak **prestij** bileşenini oluşturur. 400 puana ilk ulaşan
kazanır; kimse ulaşamazsa 300. haftada en yüksek puanlı kazanır. Eşik ölçümle
seçildi: on iki oyunluk koşuda ortalama bitiş 235. hafta ve oyunların %83'ü
süre dolarak değil hedefe ulaşarak bitiyor.

Puanın zamanla yükselen kısmı sanayidir. Toprak ve şehir nüfusu bu yapıda
neredeyse sabit kaldığı için geç oyunda skorun çoğunluğu fabrikalardan gelir.

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
kontrolünün toparlanmasını ve fabrika işgücünü etkiler.

Bütçe ekranında ayrıca üç sürekli sosyal harcama vardır: eğitim, sağlık ve
refah. Maliyetleri nüfusla birlikte büyür. Eğitim işgücünü niteliklendirir ve
aynı nüfusla daha çok fabrika doldurur, sağlık yaşam standardını yükseltir,
refah bütün sınıfların memnuniyetini artırır.

İmparatorluk büyüdükçe idari gider de artar: şehir sayısı süperdoğrusal,
province sayısı ve şehirlerin başkente uzaklığı doğrusal olarak haftalık altın
yer. Bu kalem Lojistik/Ülke ekranında ayrı satır olarak görünür.

Üst çubukta toplam nüfus, asker sayısı ve GSYİH sürekli görünür.

### Ordu yığınları ve province muharebeleri

Haritadaki tümenler birkaç alaydan oluşur. Aynı province'te dört dost tümen yan
yana durabilir; birbirleriyle birleşmezler. Düşmanla temas province'e bağlı tek
bir muharebe açar: karedeki bütün savunanlar ve oraya saldıran takviyeler aynı
savaşa katılır. Arazi savunanı, ordu bütçesi iki tarafın gücünü etkiler. Asker
sayısı ve moral 20 raunda kadar haftalar boyunca aşınır. Morali kırılan taraf
iki province gerideki baskısı düşük bir hatta çekilir ve dört hafta toparlanır.
Kazanan province'i işgal eder ama ikmal kurmadan yeni taarruza geçemez.

### Seçim ve komuta arayüzü

Kutu seçimi yapıldığında **solda tümen listesi** açılır: her satırda alayların
bileşimi, asker sayısı, morali, durumu (bekliyor / yürüyor / muharebede /
çekiliyor) ve komutanı görünür. Satıra tıklamak kamerayı o tümene götürür.

**Komuta paneli ekranın orta altında her zaman durur**: ülkenin her generali için
bir portre yuvası, sonda **+** (Assign) yuvası. Portreye **sol tık** o generalin
bütün tümenlerini seçer, **sağ tık** o an seçili tümenleri ona devreder — 10
tümenden 5'ini seçip başka bir generale sağ tıklamak onları o komutaya geçirir.
**+** seçimi listeden bir subaya bağlar.

Bir general seçiliyken portrelerin üstünde **hedef ülke**, **Offensive** ve
**duruş 1-2-3** araçları çıkar. Hedef, grubun hangi ülkeyle olan sınırı tutacağını;
duruş ise taarruz sıklığını ve kabul edilen güç riskini belirler. Hedef ülke
barıştayken de seçilebilir; tümenler savaş ilan etmeden o ülkenin sınırına dizilir.

### Komutanlar

Her ülke bir subay kadrosuyla başlar. Bir general tek tümene değil bir **ordu
grubuna** komuta eder; altındaki bütün tümenler onun bonuslarını alır ve bir
tümen aynı anda yalnız tek generalde olur. Yetenek (1–5) her kademede %6 güç
verir, nitelikler kendi alanlarında
ekler: saldırı/savunma doktrini, mühendis (arazi ve tahkimat bonusunu deler),
süvari/topçu uzmanı (yığındaki o kolun payı kadar), kurmay (cephe planını
hızlandırır), düzenbaz (muharebe zarının aralığını genişletir).

Generaller savaştıkça tecrübe kazanıp terfi eder. Altınla yeni subay yetiştirilir;
kadro büyüdükçe pahalanır.

### Cephe hatları ve muharebe planları

Cephe ayrı bir kare listesi değildir; **ülke ile hedef ülke arasındaki ilişki**dir.
Hat her hafta gerçek sınırdan türetilir. Oyuncu bir general seçip hedef ülkeyi
belirler; hedef boş bırakılırsa savaşta olunan bütün sınırlar birlikte tutulur.

Her tümenin kalıcı bir **mevkisi** vardır. Mevki hâlâ sınırdaysa tümen yerinde
kalır; sınırın başka bir ucundaki değişiklik bütün orduyu yeniden yürütmez.
Mevkisiz tümenler, dolu mevkilere hex mesafesi en büyük olan sınır karesine
yerleşir. Aynı karede en fazla dört tümen bulunur.

Tümenler mevzilerine oturdukça **planlama** birikir (kurmay generalle daha
hızlı); olgun plan taarruzda %25'e kadar muharebe bonusu verir. **Offensive**
açılınca soyut hat düşman toprağına itilmez: her tümen, önündeki uygun düşman
province'ine gerçek yürüyüş ya da saldırı emri alır. Province ele geçirilince
sınır ve dolayısıyla cephe kendiliğinden ilerler. Hedef seçimi dost kenarı çok,
düşman kenarı az olan province'leri tercih eder; tek karelik derin koridorlar
kanatlar ilerlemeden açılmaz. İlerledikçe hazırlık erir.

Cephe yalnız kimin nerede duracağını ve ne zaman ilerleyeceğini yönetir;
muharebenin kendisi hâlâ province muharebesidir. Ayrı bir soyut cephe gücü
havuzu yoktur, savaş sonucu haritadaki ordulardan çıkar.

Alay kurmak province nüfusundan asker alır: piyade 3000, süvari 2000, topçu 1500
kişi. Asker çıkış province'i ve komşularından toplanır, dağıtımda hayatta kalanlar
aynı yerlere döner, savaşta ölenler kalıcı kayıptır. Üst şeritteki **MANPOWER**
kalan asker havuzunu gösterir.

Bir province seçilip **toplanma noktası** atanabilir; yeni kurulan alaylar
çıktıkları yerden oraya kendi yürür ve oradaki dost tümenlerle konumlanır. Nokta
haritada altın renkli artı-daire ile işaretlenir.

Alayların teçhizat kademesi (Levy, Regular, Drilled, Modern) muharebe gücünü
ve haftalık bakımı belirler. Kademeyi yükselten oyuncu eylemi rework sırasında
kaldırıldı; şu an bütün alaylar Levy kademesinde kalır.

### Province kararları

Her kara hex'i nüfus, kontrol ve üç gelişim hattı taşır: tarım, çıkarım ve
ticaret. Bunlar province'in RGO çıktısını ve vergi tabanını belirler; şehirler
ise sanayi merkezidir. Hatları elle yükselten province geliştirme eylemi rework
sırasında kaldırıldı; gelişim şu an yalnız dünya üretiminden gelir.

Fethedilen province düşük kontrolle başlar ve tam üretime zamanla döner. Böylece
arazi yalnız harita rengi değil, nüfus ve üretim tabanıdır.

Yapılar şehre değil **eyalet bölgelerine** kurulur. Ülkenin toprağı yaklaşık
14 province'lik deterministik bölgelere ayrılır; her bölgenin sınırlı yapı yuvası
vardır. Construction ekranından bir yapı seçilip bölgeye kuyruğa alınır ve tek
bir ulusal öncelik kuyruğu haftalık inşaat gücüyle ilerler. Dört yapı vardır:
inşaat sektörü (inşaat gücü), tahkimat (bölgede savunma), idare (vergi tahsilatı)
ve üniversite (sanayi işgücü niteliği). Yapı bölge merkezinde haritada görünür ve
o kare fethedilirse bölgenin yapıları yeni sahibe geçer.

### Kaynak ekonomisi

Ülke kereste ya da demir stoklamaz: bütün hammadde province RGO'larından
dünya pazarına akar. Hazineden çıkan sürekli kalemler ordu bakımı, idari gider,
inşaat bakımı, sosyal harcama ve stratejik teçhizat ithalatıdır. Yerel kıtlık
pazardan alımla kapanır ve küresel fiyata yansır.

## Mimari

```text
src/
  core/      hex matematiği, seed'li PRNG, gürültü, yol bulma
  world/     arazi, prosedürel dünya, ülkeler
  render/    kamera ve Canvas2D harita/muharebe çizimi
  input/     birleşik dokunmatik, fare ve pinch girişi
  game/
    game.js          gerçek zaman saati ve oyun kabuğu
    turn.js          haftalık simülasyon adımı
    economy.js       dünya pazarı, sınıflar, fabrikalar ve maliye
    provinces.js     nüfus, kontrol, RGO üretimi ve göç
    cities.js        şehir, işçi dağıtımı ve ulusal bilanço
    construction.js  eyalet bölgeleri, yapılar ve inşaat kuyruğu
    politics.js      partiler, seçim ve politika sınırları
    command.js       generaller, ordu grupları ve cephe hattı
    battles.js       province muharebesi, moral ve geri çekilme
    reinforcement.js insan ve teçhizat takviyesi
    recruitment.js   alay kurma ve province asker havuzu
    control.js       hukuki sahiplik ile fiilî işgal ayrımı
    diplomacy.js     savaş, barış ve işgal tasfiyesi
    ai.js            ülke yapay zekâsı
    save.js          sürümlü kayıt
  ui/
    hud.js         üst çubuk, tarih, hız ve komuta paneli
    screens.js     inşaat, üretim, bütçe, ticaret, nüfus ve siyaset ekranları
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

Rework sırasında sökülen ve henüz geri bağlanmayanlar:

- Ordu modernizasyonu: teçhizat kademesi var ama yükseltme eylemi yok
- Province geliştirme: gelişim hatları var ama oyuncu eylemi yok
- Şehir nüfusunun büyümesi (`city.pop` artık sabit)
- Mobilizasyon (arayüzde kapalı duruyor)

Yeni işler:

- Cephelere ikmal menzili ve yıpranma; hattan kopan ordunun cezalandırılması
- Yapay zekânın cephe planlamasının derinleşmesi (şu an her generale sırayla
  bir düşman düşüyor)
- Savaş sıklığının yeni muharebe modeline göre yeniden ayarlanması
- Nüfus sınıfları arasında meslek ve toplumsal hareketlilik
- Dünya pazarı için ülke bazlı ihracat önceliği ve ambargo
- Fabrika rezervleri, ücret politikası ve iflas/kapanma
- İttifaklar ve savaşa çağrı
