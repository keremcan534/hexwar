# HexWar

Hex tabanlı, prosedürel dünya üreten, **PC için** (masaüstü tarayıcı, fare ve
klavye) gerçek zamanlı strateji oyunu prototipi. Bağımlılık yok: saf ES
modülleri ve Canvas2D; derleme adımı gerekmez. Dokunmatik girdi çalışır ama
tasarım hedefi değildir (bkz. CLAUDE.md).

## Çalıştırma

**Oyuncu için (Windows):** kök klasördeki `Imperial Eye.cmd` dosyasına çift
tıkla. Yerel sunucuyu görünmez başlatır, oyunu adres çubuğu olmayan tam ekran
bir Edge (yoksa Chrome) penceresinde açar; pencere kapanınca sunucu da kapanır.
Node.js kurulu olmalı. Tarayıcı modülleri `file://` üzerinden yüklemediği için
`index.html`e doğrudan çift tıklamak çalışmaz. Başlatıcının penceresi kendi
tarayıcı profilini kullanır (`%LOCALAPPDATA%\ImperialEye`); başka bir
pencerede oynanan kampanyayı taşımak için eski pencerede **Settings → Export
save**, başlatıcının penceresinde **Settings → Import save**.

**Geliştirici için:**

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
npm run diagnose:military
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
| Zaman | duraklat, 1×, 2×, 4×, 8× | `boşluk` duraklat · `+` / `−` hız |

Giriş HOI4 semantiğindedir: **sol tuş seçer, sağ tuş yürütür**. Sol tuş sürükleme
masaüstünde klasör seçer gibi kutu seçimi yapar, bu yüzden kamera orta tuş ve
`WASD`/ok tuşlarıyla gezer. Sağ tuşu tıklamak ya da sürükleyip bırakmak seçili
tümenleri hedef province'e yürütür; birden çok tümen seçiliyse hedefler çevreye
yayılır, hepsi tek province'e tıkışmaz.

Oyun haftalık adımlarla gerçek zamanlı akar. Saat penceresi sağ üsttedir; boşluk
tuşu duraklatır ve duraklatmadan önceki hızı hatırlar, `+`/`−` kademe değiştirir.
Yeni oyun ve yüklenen kayıt duraklatılmış başlar. Savaş, kriz ve açlık gibi
sonucu olan olaylar saati kendileri durdurur; tarihin altındaki "Paused" rozeti
sebebini yazar.

Yeni dünya kurulunca sağda **ülke seçim paneli** açılır: haritada bir ülkeye
tıklamak ya da listeden seçmek kartı o ülkeye çevirir (sıra, hammadde, sanayi,
komşuların gücü, dikkat satırları); "Play as" oyuncu ulusunu değiştirir. Saat
akmaya başlarsa kartta duran ülke seçilmiş sayılır.

Ekran yerleşimi Vic2 düzenindedir: seçili province penceresi **sol altta**, saat
**sağ üstte**, harita kipleri **sağ altta**. Dar ekranda panel genişler ve kipler
onun üstüne çıkar.

Üst çubuk üç bölgedir ve tek eksene oturur: solda künye (dalgalanan bayrak +
ülke adı + tek satır özet), **ortada oyunun bütün ekonomisi** (altın ve haftalık
akış, Siyasi Güç, istikrar, savaş desteği, şöhret, nüfus, ordu, insan gücü,
IC ve altı kaynağın karşılanma çipi), sağda tarih, saat durumu ve hız kanalı. Sekme künyeleri de ortalanır ve pencere genişledikçe büyür.

Harita kipleri üç ailedir: coğrafya (siyasi, arazi, coğrafya, kültür, kaynak,
nüfus), **veri** ve katmanlar. Veri kipleri simülasyondan boyanır ve her hafta
tazelenir:

| Kip | Ne gösterir |
| --- | --- |
| Diplomacy | Bakılan ülkenin gözünden savaş, ültimatom, ittifak, ateşkes, rakip; başkasıyla savaşanlar ayrı ton, işgal edilen topraklar taralı. Haritada bir ülkeye tıklamak bakış açısını ona çevirir. |
| Unrest | Küme başına huzursuzluk (0–10); 6'nın üstü ulusal hareketi besler. |
| Industry | Küme başına fabrika kademesi — bütün ülkeler, sanayi kalpleri. |
| Infamy | Ülkelerin şöhreti; koalisyon eşiğine (22) yaklaşan kızarır. |

Arayüz hareketleri (ekran/panel açılış-kapanışı, sekme ışığı, bayrak dalgası)
**Settings → Interface animations** anahtarındadır; varsayılan açık. Sistemin
"hareketi azalt" ayarına bağlı değildir — Windows animasyonları kapalı bir
makinede oyunun kendi hareketleri yine oynar.

## Ana sistemler

### Oyunun amacı: 1900 puanı ve ulusal hedef

Oyun 1836'da başlar, bir tur bir haftadır ve **1900'de biter** (`FINAL_TURN`
3340). Erken zafer yoktur: kazanan, son turda en yüksek puana sahip ülkedir.
Puan dört eksenden gelir (`hegemony.js`): **sanayi** (IC × 4), **nüfus**
(milyon × 3), **çekirdek province** (× 1) ve **prestij** (kazanılan savaş,
gündem, Büyük X). Her ülke kuruluşta bir **ulusal hedef** alır — bölünmüş
halk için *Birleşmiş Ulus*, çok uluslu devlet için *İmparatorluğu Koru*,
diğerleri için *Sanayi Devi* — tutarsa 80-100 puan bonus: küçük ülke de kendi
hikâyesini kazanabilir. Tasarımın bütünü: [TASARIM.md](TASARIM.md).

### Savaş ve barış masası

Aktif savaşlar üst menünün altında kırmızı parlayan kutucuklar olarak durur;
üzerlerinde anlık **warscore** yazar. Tıklamak barış masasını açar ve harita bir
seçim yüzeyine döner (Construction ekranıyla aynı kalıp): karşı tarafın toprağı
kırmızı, istediklerin yeşil, verdiklerin turuncu.

Her province'in bir bedeli vardır (nüfus + gelişmişlik + şehir primi) ve toplam
talep warscore'unu aşamaz. Warscore işgal ettiğin toprak, kaybettiğin toprak ve
askerî üstünlükten hesaplanır; işgal payı en ağır kalemdir.

Victoria'da olduğu gibi savaşlar ülke yutmaz, sınır düzeltir: **bir anlaşmada en
çok altı province** el değiştirir. Toprak dışı talepler de vardır ve hepsinin
gerçek bir oyun etkisi bulunur:

| Talep | Etkisi |
| --- | --- |
| Savaş tazminatı | Beş yıl boyunca gelirinin bir payı sana akar |
| Askersizleştirme | Dört yıl yeni tümen kuramaz |
| Kaynak imtiyazı | Yatak üretiminin (kömür, demir, kereste, at, güherçile) beşte biri altı yıl sana akar |
| Azınlıkları serbest bırak | Yabancı kültürlü province'leri bağımsızlaşır |
| Vassallaştırma | Kalıcı barış ve gelirinden haraç (yalnız çok zayıf ülkeye) |

Kaybeden taraf da masaya toprak koyarak anlaşmanın bedelini düşürebilir.

### Ekonomi: altın, sekiz kaynak, sanayi

Uluslar Çağı ekonomisi üç sayaç ve sekiz kaynaktır; sınıf, mal sepeti ve fiyat
zinciri yoktur (TASARIM.md §1-§8, `src/game/econ/`).

- **Altın** province vergisinden (nüfus × kalkınma × statü × vergi yasası ×
  istikrar) ve ihracattan gelir; ordu/donanma bakımı, bina bakımı, eğitim,
  ithalat ve faize gider. Yarım yıllık gelirden fazlası kasada yatarsa
  **enflasyon** fazlanın haftada %0.5'ini eritir: biriktirmek değil
  harcamak ödüllenir. Eksiye düşen hazine otomatik borçlanır; borç tavanı
  aşılırsa **iflas**: borç silinir, 52 hafta kredi yok, istikrar −20, ordu
  yarı hızda toplanır.
- **Sekiz kaynak** akıştır, stok yoktur. **Her province bir kaynak
  çıkarır** (gıda ambarı, kömür, demir, kereste, at, güherçile); gıda ayrıca
  her province'te topraktan gelir. Bazı province'lerde **petrol** ya da
  **kauçuk** lekesi yatar: 1836'da alıcısı yoktur, sanayi ve ordu
  teknolojileri yayıldıkça değerlenir (bonus, kaynak karşılandığı oranda).
  Fazla, ticaret yasasının izin verdiği payda satılır; açık altın yettiği
  sürece kendiliğinden alınır. Dünya fiyatı `taban × (dünya ihtiyacı ÷ dünya
  üretimi)^1.5`. Ambargo, abluka (düşman savaş gemisi kıyının iki hex
  yakınında) ve bağımlılık uyarısı ikili akıştan gelir.
- **Sanayi (IC)** fabrika kademesinden gelir; kömür, istikrar, askerlik
  yasası ve teknoloji çarpar. **Ekonomi yasası** IC'nin ne kadarının orduya
  gideceğini söyler: sivil pay halkın **tüketim malıdır** (eksikse istikrar
  düşer, fazlası vergiyi artırır; beklenti her on yılda büyür), askerî pay
  **üretim hatlarına** (tüfek, top, gemi) ağırlıkla dağılır ve teçhizat
  stoğunu doldurur.

### Nüfus, insan gücü, okuryazarlık

Province tek poptur: nüfus, kalkınma, binalar, uyum ve huzursuzluk. Nüfus
gıda, tüketim malı, istikrar ve barışla büyür; gıda %70'in altına inerse
kıtlıkta erir; ölen asker nüfustan düşer. **İnsan gücü** askerlik yasasının
oranıdır (Gönüllü %3 · Sınırlı %6 · Yaygın %10 · Topyekûn %16), kışla,
vatandaşlık yasası ve uyumla çarpılır. **Okuryazarlık** ulusaldır; eğitim
yasası ve üniversiteyle bir nesilde hedefe yaklaşır, araştırmayı ve kalkınma
tavanını büyütür.

### Ordu yığınları ve province muharebeleri

Haritadaki tümenler birkaç alaydan oluşur. Aynı province'te dört dost tümen yan
yana durabilir; birbirleriyle birleşmezler. Düşmanla temas province'e bağlı tek
bir muharebe açar: karedeki bütün savunanlar ve oraya saldıran takviyeler aynı
savaşa katılır. Arazi, kale ve siper savunanı güçlendirir; **nehir aşarak**
saldıran −%25 alır (hexler arası kenar nehirse); **barut** (güherçile)
kıtlığı gücü %30'a kadar, **at** kıtlığı süvari ve topçuyu %40'a kadar düşürür.
Düşman topraklarında kendi kontrolünden yedi hexten uzak tümen haftada güç
kaybeder (ikmal yıpranması). Asker sayısı ve moral 20 raunda kadar haftalar
boyunca aşınır. Morali kırılan taraf
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

### Askerî ekran ve eğitim kuyruğu

Military ekranı üç sütundur: solda **komuta** (generaller, amiraller, seçili
subayın çarpanları, otomatik kadro/atama anahtarları ve ulusal askerî
göstergeler), ortada **kurulabilir kollar**, sağda **eğitim kuyruğu**. Altta
ordunun künyesi durur: kol dağılımı, mevcut/organizasyon, haftalık takviye ve
teçhizat stoğu.

Alay artık düğmeye basılan hafta belirmez, **siparişe** dönüşür:

- Altın ve teçhizat sıraya girerken düşer, insan gücü alay sahaya çıkarken
  toplanır. İptal, harcanmamış payı geri verir.
- Depoda teçhizat yoksa sipariş yine verilir: eksik, üretim hattından
  geldikçe dolar; alay teçhizatı tamamlanana dek kışla yeri tutmadan bekler.
  Teçhizat: piyade 10 tüfek, süvari 6 tüfek, topçu 4 tüfek + 6 top, savaş
  gemisi 10 gemi.
- Eğitim süresi kola göredir (piyade 8, süvari 10, topçu 12, gemi 16 hafta);
  doktrin ve danışman kısaltır, iflas iki katına çıkarır.
- Aynı anda kaç alayın eğitildiğini şehir sayısı ve kışlalar belirler; sıradakiler bekler.
  Öncelik okları kapasitenin kime gideceğini değiştirir.
- Kuyruk kendiliğinden eyaletlere yayılır: bir kışlaya söz verilen asker bir
  sonraki siparişte o kümeyi daha az çekici yapar.
- Kurulamayan kol sebebini yazar — hazine kaç altın
  yetmiyor, hangi antlaşma yasaklıyor, hangi yıl açılıyor.

Subay kadrosunun iki kolu vardır: general cephe tutar, **amiral** filoya komuta
eder ve cepheye sürüklenmez. Kadro yılda bir yenilenir (otomatik kadro açıkken),
boştaki tümenler istenirse haftalık olarak en az yüklü subaya dağıtılır.

Yapay zekâ aynı kuyruğu kullanır ve eğitimdeki alayları ordu hedefine sayar;
yoksa sipariş sahaya çıkana kadar her hafta yeniden sipariş verirdi.

Alay kurmak province nüfusundan asker alır: piyade 30.000, süvari 20.000, topçu
15.000 kişi; havuz askerlik yasasının oranıdır. Asker çıkış province'i ve komşularından toplanır, dağıtımda hayatta kalanlar
aynı yerlere döner, savaşta ölenler kalıcı kayıptır. Üst şeritteki **MANPOWER**
kalan asker havuzunu gösterir.

Bir province seçilip **toplanma noktası** atanabilir; yeni kurulan alaylar
çıktıkları yerden oraya kendi yürür ve oradaki dost tümenlerle konumlanır. Nokta
haritada altın renkli artı-daire ile işaretlenir.

### İnşaat ve kalkınma

Bina province'e aittir ve toprakla el değiştirir: çiftlik, maden, fabrika,
tersane, kışla, kale, demiryolu, üniversite. Bedel peşin, süre haftalarla;
aynı anda yürüyen proje inşaat yuvasıyla sınırlıdır, yürüyen proje kereste
(demiryolu ayrıca demir) yer. Bina yuvası **kalkınma + 1**'dir. **Kalkınma**
(1-10) altınla, 12 haftada bir kademe yükselir: vergi +%15, bir yuva, hızlı
büyüme; tavanı teknoloji ve okuryazarlık açar. Construction ekranı HOI4
kalıbındadır: önce bina seçilir, sonra bütün state'ler o binanın o state'te
getireceği **gerçek** kazançla sıralanır (`src/game/buildPreview.js`: kademe
geçici eklenir, oyunun kendi formülü yeniden okunur). Kaynak binaları değerle
sıralanır — evde kullanılan kaynak piyasa fiyatı, kullanılmayan ise yalnız
dünyanın aldığı oranda değerlidir. Satırda kur, ya da "en iyi N"; AUTO
kıtlığa göre kurar. Gıda her state'te nüfus × verimden doğar; çiftlik o
state'in gıdasını %25 artırır, yani kazancı nüfusa ve toprağa bağlıdır.

### Population ekranı

Tek döküm: `src/game/peoplesView.js`. Halklar tablosu (pay, yaşadığı state,
huzursuzluk, hareket aşaması) ve **Kabul önizlemesi**: halk geçici olarak kabul
edilmiş sayılır, `nationManpower` ve `unrestBreakdown` yeniden okunur — düğme
kilitliyken de görünür. Huzursuz state'ler sebepleriyle (yabancı yönetim,
taze fetih, savaş yorgunluğu; tüketim malı ve haklar yatıştırır). Ulusal
hareketler eylemleriyle, büyüme çarpanlarıyla (`provinces.growthFactors`,
`growthRateOf` aynı çarpanları okur).

### Klavye

Saat: Space duraklat/sürdür, + / − hız. Sekmeler soldan sağa F1-F9.
Esc açık paneli/ekranı kapatır. Açık ekran tuşu önce alır, kullanmadığı tuş
haritaya düşer (WASD/oklar kamera). Her ekranda **A** AUTO'yu çevirir (hap
başlıkta durur). Construction: 1-9 bina, ↑↓ state, Enter kur, B en iyi 3,
⇧B en iyi 5, F kaynak süzgeci, S kurulamayanları göster. Ekranda her
kısayolun rozeti vardır.

### Ulusal hareketler

Kabul edilmeyen her halk, çoğunlukta olduğu kümelerde bir **ulusal hareket**
kurar. Hareket huzursuzlukla beslenir ve dört aşamadan geçer (Grievances,
Agitation, Resistance, Insurgency); her aşama o kümelerin sadakatini daha
hızlı aşındırır. %100'de kümeler kopar: halkın devleti doğar (ya da bitişik
akraba devlete katılır), ordusunu oradan toplar ve savaş açar. Sağ üstteki
panel hareketleri fitil gibi gösterir ve araçları sunar: sıkıyönetim ve taviz
(geçici), kabul, vassal olarak bırakma, katliam ve sürgün (kalıcı). YZ aynı
araçları kullanır; ödün ve baskı Siyasi Güç ister, sıkıyönetim altın.

### Siyaset: Siyasi Güç, istikrar, savaş desteği

**Siyasi Güç (SG)** hükûmetin para birimidir: yasa (50), hükûmet atama (80),
danışman (50), propaganda (50), kültür kabulü (100), ödün/baskı, savaş
gerekçesi (soydaş ya da talep varsa 20, yoksa 60), ambargo (25) ve kararlar
(sübvansiyon, savaş tahvili, manevra, nüfus sayımı, af, araştırma bursu...).
**İstikrar** ve **savaş desteği** dökümlü bir hedefe haftada bir puan
yaklaşır; ekran parçaları basar. Dört parti (Muhafazakâr, Liberal,
Milliyetçi, 1848'den sonra Sosyalist) iktidarda bonus verir ve yasa aralığını
sınırlar; halkın istediği parti iktidarda değilse **meşruiyet cezası**
istikrardan düşer. Mutlakiyette hükûmeti taç atar; Meşrutiyet ve Cumhuriyet
dört yılda bir seçer. **Altı yasa**: vergi, askerlik, ekonomi, ticaret,
vatandaşlık, eğitim. **Ulusal gündem** duruma uyan üç seçenekten birini
12-20 haftada somut bir sonuca çevirir; **olay kartları** saati durdurur ve
seçenek ister; **Büyük X** ana yurdun %80'i toplanınca kurulur.

### Yönetimi devretme (AUTO)

Yedi alan — ekonomi (hat ağırlıkları, ticaret yasası, kemer sıkma), inşaat,
hükûmet (yasalar, danışmanlar, azınlıklar, kararlar), gündem, asker alımı,
araştırma ve diplomasi — tek bir **AUTO ON/OFF** anahtarıyla devredilir.
Diplomasi dışındakiler yeni kampanyada açık başlar. AUTO açıkken çalışan şey,
yapay zekâ ülkelerinin kullandığı fonksiyonun ta kendisidir; hükûmet biçimi ve
iktidar partisi devredilmez.

## Mimari

```text
src/
  core/      hex matematiği, seed'li PRNG, gürültü, yol bulma
  world/     arazi, prosedürel dünya, nehirler, province üreteci, hareket grafı
  render/    kamera, Canvas2D/WebGL harita ve sınır ağı
  input/     birleşik fare ve klavye girişi
  game/
    game.js          gerçek zaman saati ve oyun kabuğu
    turn.js          haftalık simülasyon adımı (sıra: TASARIM.md §16)
    economy.js       ekonomi orkestrası: vergi, bakım, okuryazarlık, borç/iflas
    econ/defs.js     kaynak, bina, teçhizat ve ekonomi sabitleri (formül yok)
    econ/deposits.js province kaynağı (her province bir tane + petrol/kauçuk lekesi), toprak verimi
    econ/resources.js province üretimi ve ulusal kaynak ihtiyacı
    econ/industry.js IC, tüketim malı, üretim hatları ve teçhizat stoğu
    econ/trade.js    dünya fiyatı, ikili akış, ambargo, abluka
    treasury.js      altının tek geçiş noktası ve haftalık defter
    laws.js          altı yasanın verisi ve okuyucuları
    modifiers.js     teknoloji/danışman/parti/olay değiştiricilerinin tek toplamı
    politics.js      SG, istikrar, savaş desteği, partiler, seçim, yasa, danışman
    agenda.js        ulusal gündem şablonları
    decisions.js     SG kararları
    eventCards.js    seçenekli olay kartları, Ulusların Baharı
    unification.js   Büyük X ve barışla birleşme
    provinces.js     tek pop: nüfus, uyum, çekirdek, statü
    construction.js  bina ve kalkınma kuyruğu
    culture.js       huzursuzluk, asimilasyon, kabul
    movements.js     ulusal hareketler ve isyan ordusu
    technology.js    40 teknoloji, araştırma, yayılım
    hegemony.js      1900 puanı ve ulusal hedef
    command.js       generaller, cephe ve planlama
    battles.js       province muharebesi (nehir, barut, at, kale)
    recruitment.js   alay siparişi, eğitim kuyruğu, insan gücü
    reinforcement.js insan ve teçhizat takviyesi
    diplomacy.js     savaş, gerekçe, ateşkes, temas
    ai.js            ülke yapay zekâsı (AUTO aynı fonksiyonları kullanır)
    save.js          sürümlü kayıt (v24)
  ui/
    hud.js           üst çubuk, il paneli, komuta paneli
    screens.js       ekran kabuğu, dosya kartı, barış masası, diplomasi, ordu
    stateScreens.js  Budget, Trade, Factories, Construction, Population, Politics
    eventCard.js     olay kartı penceresi
    tooltipData.js   gecikmeli bilgi kartlarının içerik sağlayıcıları
```

```

Katmanlar tek yönlüdür: `ui` ve `render`, `game` katmanını tanır; `world` ve
`core` üst katmanları tanımaz. Bu sayede ekonomi ve dünya simülasyonları
tarayıcı olmadan Node ile de test edilebilir.

## Tasarım notları

- Harita pointy-top eksenel `q,r` koordinatları kullanır.
- Nehirler hex KENARLARI boyunca akar (`world/rivers.js`): köşe grafında
  denizden geriye öncelikli taşma ile drenaj ağacı, nem birikimi eşiği aşan
  kenar nehirdir. RNG çekmez, araziye dokunmaz; çizimde hücre kenarı eğrisini
  izler (province çizgisinin üstünde, ülke çizgisinin altında).
- Province üreteci sürümlüdür (`world/provinces-gen.js`, `genOptions.provinceGen`).
  v2'de tohum vadi tabanına düşer, büyüme nehir ve sırt geçişinde ve yokuş
  yukarı pahalıdır: sınırlar nehir, sırt ve kıyıya oturur (ölçüldü: nehir
  kenarlarının %81-87'si sınır, v1'de %37-45). Boy yerel verimle (besin,
  nehir, kıyı) 0.8-1.15× ölçeklenir. Kayıt sürümü taşır; alanı olmayan eski
  kayıt v1 ile birebir aynı bölümlemeyle açılır.
- Harita birimi province'tir; hex altta veri ızgarası olarak kalır ve
  ızgara çizgileri varsayılan kapalıdır (Katmanlar → Hex grid; ülke ve
  province sınırları da oradan ayrı ayrı kapatılır, tercihler hatırlanır).
  Province, ülke ve kıyı çizgileri hex kenarlarından türer
  (`render/borderMesh.js`): kenarlar zincirlere dizilir, her zincir yay
  boyunca Gauss süzgecinden geçip konuma bağlı gürültüyle kıvrılır; hex
  merdiveni söner, eğri hex yolundan en çok 17 birim sapar (hex merkezi hep
  kendi tarafında kalır), kavşak uçları sabittir. GL yüzeyi kara/deniz
  kararını da bu eğriden verir; deniz katmanlarının kıyı uzaklığı alanı aynı
  eğriden (`coastMesh`). Canvas2D yedeğinde kıyı hex kenarında kalır (deniz
  dolgusu ve köpük orada hex yoluna bağlı). Dolgu aynı eğriyi izler: GL yüzeyinde shader pikselin hex
  merkezinden kendisine uzanan doğrunun eğriyi kesip kesmediğine bakıp
  komşu bölgenin rengini okur, hex başına ton bölge içinde komşu merkezler
  arasında süzülür; Canvas2D yedeğinde kara province çokgeni olarak dolar.
  Ülke kenar gölgesi GL'de uzaklık alanından, yedekte kırpılmış darbelerden
  gelir. Hex hücreleri de organiktir: zincir üstündeki köşe sınır eğrisine
  oturur, iç kenarlar hafif kavisle kıvrılır; province sınırı hücre
  kenarlarının tam birleşimidir. Dolgu (her kipte), tıklama, ızgara ve imleç
  aynı hücre tablosunu okur (`cellAt`/`cellOutline`); Canvas2D yedeğinde
  arazi/kaynak dolgusu hex kalır. Seçim ve imleç ızgara kapalıyken
  province'i gösterir; ordu seçiliyken çevresinde yerel hex ızgarası belirir
  ve imleç hedef hexi çerçeveler.
- HOI4 modeli: ekonomi, bina ve kültür province KÜMESİNDEDİR (oyuncunun
  gözünde "state"); ordular HEX hex yürür (`world/provinceGraph.js`) — her
  organik hücre bir HOI4 province'idir. Girilen hex işgal edilir; kümenin
  sahipliği barış masasında değişir, işgal payı kümenin üretimini düşürür.
  Adım maliyeti hedef hexin arazisi, gemiye binme/inme ayrıca 4. Hex başına
  yığın tavanı 4; nehir kenarını aşan saldırı −%25; kendi kontrolünden 7
  hexten uzak tümen ikmal yıpranması yer. Cephe, komşuluk, saldırı ve geri
  çekilme bu graftan sorulur.
- Çizim sürekli çalışan bir animasyon döngüsü yerine gerektiğinde yenilenir;
  simülasyon saati hafif bir zamanlayıcıyla ilerler.
- Deniz yüzeyi `render/water.js`'te ayrı bir katmandır: açılışta üretilen
  döşenebilir dokular (geniş kabarma, kırışıklık, parıltı) dünya uzayına
  sabitlenmiş desenler olarak deniz hexlerine dolgulanır ve zamanla yavaşça
  kayar. Kıyı köpüğü ile kıyı kümesi dünya başına bir kez çıkarılıp saklanır.
  Animasyon rAF döngüsü açmaz; `Game.scheduleWaterFrame` kısılmış bir
  zamanlayıcıyla `requestRender`'ı dürter, seçim yüzeyi kiplerinde (inşaat,
  barış) ve sekme gizliyken kendiliğinden durur. `addWaterRipple` benzeri
  yerel bozulmalar (gemi dümen suyu, top şoku) için `water.addRipple(x, y)`
  hazırdır; gelecekteki hava sistemi `water.setEnvironment` üzerinden ışık
  yönü, fırtına ve rüzgâr şiddeti yazabilir.
- Diplomasi ilk 26 hafta barış süresi tanır. Yapay zekâ savaş kararını aylık
  değerlendirir; yalnız temas ettiği, istikrarlı, hazırlıklı ve tek cepheli
  ülkeler uygun gördüğü komşularla savaş açar.
- Kayıtlar her on haftada otomatik alınır; eski kayıt sürümleri güvenle yok
  sayılır.

## Sonraki adımlar

Uluslar Çağı'nın ilk tam sürümünden sonra açık kalanlar (TASARIM.md):

- Tümen şablonu (karma alaylı tümen kurma ekranı)
- Büyük güçlerin başkalarının savaşına müdahalesi
- Ulusal gündemde ülkeye özgü (kültür/bölge) şablonlar
- Olay kartlarının sayısını artırmak (şu an 13 kart + Ulusların Baharı)
- Ticaret akışı harita kipi
