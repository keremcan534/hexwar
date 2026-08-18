# OPEN BETA 2 — BUG LOG (blind campaign, seed IRONTIDE, Marov Khanate)

Siniflar: BLOCKER / CRITICAL / MAJOR / MINOR / COSMETIC.
Her kayit: DATE / CONTEXT / ACTION / EXPECTED / ACTUAL / PLAYER IMPACT /
REPRODUCIBILITY. Konsol hatasi sayaci ayrica en altta.

---

## B-001 · MAJOR — Ulke secim ekrani yok (otomatik atama)

- DATE: 1 JAN 1836 (kurulum)
- CONTEXT: New Campaign → seed IRONTIDE → Generate World
- ACTION: Dunya uretildi; ulke listesi/haritadan secim bekledim.
- EXPECTED: 65 ulkeli dunyada oynayacagim ulkeyi secmek (grand strategy'nin
  birinci karari).
- ACTUAL: Oyun beni dogrudan Marov Khanate'e atadi; secim arayuzu hic gelmedi.
- PLAYER IMPACT: "Baska ulkeyle bir kampanya daha oynar miydim" sorusunun
  cevabini oyunun kendisi zorlastiriyor; tekrar oynanabilirligi dograniyor.
- REPRODUCIBILITY: %100 (tek deneme, ama akista secim adimi hic yok).

## B-002 · MINOR — "provinces / hex / region" birimleri tutarsiz

- DATE: 1 JAN 1836
- CONTEXT: Ust bar "40 provinces" · dossier 328 hex · bir ekranda 92 sayisi
- ACTION: Ulke buyuklugunu anlamaya calistim.
- EXPECTED: Tek bir bolge birimi (ya da acik cevirim: "40 eyalet = 328 hex").
- ACTUAL: Uc ayri sayi, uc ayri isim; hicbiri digerine baglanmiyor.
- PLAYER IMPACT: Ulkeler arasi kiyas yapamiyorum ("buyuk muyum?").
- REPRODUCIBILITY: %100 (kalici UI metinleri).

## B-003 · MAJOR — Istikrar 62% → 51%, gerekce UI'da yok

- DATE: 1 JAN → 6 FEB 1836 (ilk 5 hafta)
- CONTEXT: Baris halinde, vergi degistirmedim; sadece egitim butcesi %0→%30
  ve kapasite yatirimi yaptim.
- ACTION: Ust bardaki istikrar sayisini izledim.
- EXPECTED: Dusen istikrarin nedeni bir tooltip/bildirim/dokum satirinda
  gorunmeli ("egitim harcamasi X sinifini kizdirdi" vb.).
- ACTUAL: Sessizce 11 puan dustu; hicbir yerde aciklama bulamadim (Politics
  ekrani kontrolu sirada).
- PLAYER IMPACT: Sebep gorunmeyince ogrenemiyorum; istikrar bir "kader
  cubugu"na donusuyor.
- REPRODUCIBILITY: Bu kosuda bir kez; izlemeye devam.

## B-004 · MINOR — Baris halindeki yabanci ordu etiketi "(enemy)"

- DATE: 1 JAN 1836
- CONTEXT: Haritada komsu birligine tikladim; savas yok.
- EXPECTED: "foreign army" / ulke adi.
- ACTUAL: "1-regiment Army (enemy)".
- PLAYER IMPACT: "Savasta miyim?" diye diplomasi ekranini acip kontrol ettim
  — sahte alarm.
- REPRODUCIBILITY: %100 (ayni birime her tiklamada).

## B-005 · MINOR — "Rank 1/65 · You lead the world" acilista inandirici degil

- DATE: 1 JAN 1836
- CONTEXT: %0 okuryazar, ¤50 kasali, 2 alaylik hanlik.
- EXPECTED: Siralamanin neye gore oldugu yazmali; ya da olcut, acilista
  herkesi 1. yapmayacak bir sey olmali.
- ACTUAL: Gerekcesiz "dunya lideri" etiketi.
- PLAYER IMPACT: Siralama gostergesine guvenim kalmadi; hedef metrigi olarak
  kullanamayacagim (halbuki BIRINCIL tutkum "Rank 1'i hak etmek").
- REPRODUCIBILITY: %100.

---

## Konsol hatasi sayaci

- Kurulum + ilk 5 hafta: **0** (favicon istekleri haric).

## B-006 · MAJOR — Ust bar hazine, durakta yapilan harcamayi gostermiyor

- DATE: 6 FEB 1836
- CONTEXT: Oyun duraklatilmisken ¤220'lik kasadan Higher Education (¤120+)
  yatirimi yaptim; banka ekrani Hazine ¤0 gosterdi.
- ACTION: Yatirim sonrasi ust bara ve Budget → NATIONAL BANK'a baktim.
- EXPECTED: Ust bar hazinesi harcamadan hemen sonra guncellenmeli.
- ACTUAL: Ust bar bir sonraki hafta tikine kadar ¤220+25'te kaldi; ayni anda
  banka ¤0, projeksiyon −¤20.9 idi. Iki ekran ayni kaynaga bakmiyor gibi.
- PLAYER IMPACT: "Param var" sanip pahali kararlar almak mumkun; para ana
  kaynak oldugu icin yaniltma maliyeti yuksek.
- REPRODUCIBILITY: Bir kez, buyuk olasilikla durak+harcama kombinasyonunda
  her seferinde (HUD tik bazli guncelleniyor gorunumunde).

## B-007 · MAJOR — Politika sistemi ekonomiye bagli degil (UI kendisi itiraf ediyor)

- DATE: 6 FEB 1836
- CONTEXT: Politics ekrani, tam reform merdiveni goruntusunde.
- EXPECTED: Yasalasan reformun bir etkisi olmali (okul sistemi → egitim,
  asgari ucret → ucretler...).
- ACTUAL: Ekran dipnotu: "Enacted laws are recorded and shown here; they do
  not yet feed the economy." Reform yasalasiyor, hicbir sey degismiyor.
- PLAYER IMPACT: Ikincil hedefim (siyasi reform) mekanik olarak bos cikti;
  koca ekran vitrin. (Yilda-bir-reform temposu ve UI iskeleti saglam — icerik
  eksik.)
- REPRODUCIBILITY: %100 (tasarim durumu).

## B-008 · MINOR — Reform tiklamalari cooldown sirasinda sessiz

- DATE: 6 FEB 1836
- CONTEXT: Bir reform yasalastiktan sonra digerlerine tikladim.
- EXPECTED: "Yillik reform hakki kullanildi" gibi bir geri bildirim.
- ACTUAL: Tiklama sessizce yutuluyor (satirdaki "about 12 months" etiketi
  tek ipucu).
- PLAYER IMPACT: Dusuk — etiket var; ama ilk saniyede "tikladigim oldu mu?"
  tereddudu yasatiyor.
- REPRODUCIBILITY: %100.

## B-009 · MAJOR — Butce projeksiyonu kaydirac degisikligini aninda yansitmiyor

- DATE: 21 APR 1837
- CONTEXT: Budget ekrani, "Projected weekly balance" satiri.
- ACTION: Tedarik/vergi/tarife kaydiraclarini degistirdim.
- EXPECTED: Projeksiyon her degisiklikte yeniden hesaplanmali (butce ayari
  bir geri-bildirim dongusudur).
- ACTUAL: Sayi hafta tikine kadar donuk kaliyor (−73.6 sabit kaldi).
- PLAYER IMPACT: Butceyi "dene-gor" ayarlamak icin her seferinde oyunu
  akitmak gerekiyor; kriz aninda kor ucus.
- REPRODUCIBILITY: %100.

## B-010 · CRITICAL — Borc krizinde gorunmez el butceyi sessizce ele geciriyor

- DATE: 21 APR → 5 MAY 1837
- CONTEXT: Hazine ¤0, tahvil borcu buyurken butce kaydiraclarini elle ayarladim.
- ACTION: Vergi ust 25 / orta 20, idare 60-80, tedarik 30, tarife 25 yaptim;
  2 hafta oynattim.
- EXPECTED: Ayarlarim kalmali; kriz yonetimi devralinacaksa acikca
  bildirilmeli ("Maliye nazirligi olaganustu yetki kullaniyor" vb.) ve
  kapatilabilir olmali.
- ACTUAL: TUM kaydiraclar eski/otomatik degerlere dondu (vergiler 10/15,
  idare 100, tarife 10); tedarik 25 ve maaslar 60 gibi HIC yapmadigim
  degerler belirdi. Hicbir bildirim yok.
- PLAYER IMPACT: Kriz aninda oyuncu ajansi sifir; "butce ekrani yalan
  soyluyor" hissi. Kampanyanin en agir deneyim kirilmasi.
- REPRODUCIBILITY: Kriz kosulunda %100 (2 denemede 2 kez).

## B-011 · COSMETIC — BUILD POWER ham float gosteriyor

- DATE: 5 MAY 1837
- ACTUAL: "BUILD POWER 9.991984890043716/wk".
- EXPECTED: "10/wk" ya da "10.0/wk".
- REPRODUCIBILITY: %100 (kapasite seviye 1 sonrasi).

## B-012 · MAJOR — Devlet borclanmasi tamamen sessiz

- DATE: 1836 sonu → 21 APR 1837 arasi (hiz 4'te)
- CONTEXT: Acik −60/hafta iken hazine 0'a indi; oyun otomatik tahvil kesti.
- EXPECTED: "Hazine tahvil ihrac etti" bildirimi; ilk borclanmada bir kez
  durup sormak bile mesru.
- ACTUAL: ¤1325 borc + %11.4 faiz sessizce birikti; ancak Budget ekranini
  acinca gordum.
- PLAYER IMPACT: Yuksek — borc kartopu oyuncunun haberi olmadan buyudu.
- REPRODUCIBILITY: %100 (acik sürdukce her hafta).

## B-013 · MAJOR — Kalici olay gunlugu yok

- DATE: genel (5 MAY 1837 itibariyla kesin)
- CONTEXT: Hiz 4'te yarim yil oynayinca ne olduysa kacirdim (borclanma,
  yatirim tamamlanmalari, kaydirac mudahaleleri...).
- EXPECTED: Geriye donuk okunabilir bir olay/gazete/gunluk paneli.
- ACTUAL: Yalniz gecici toast'lar var; kacan kacti.
- PLAYER IMPACT: Yuksek hizda oynamak = tarihini kaybetmek. Uzun kampanyada
  bu, oyunun anlatisini oldurur.
- REPRODUCIBILITY: %100 (ozellik yok).

## B-014 · MINOR (izlemede) — Hiz-8 performansi tutarsiz

- DATE: 24 NOV 1837
- ACTUAL: Bir 60sn penceresi 3 hafta ilerletti (~20sn/hafta); hemen sonraki
  olcum 20 saniyede 15 hafta (1.3sn/hafta). Tekrarlanirsa yukseltilecek.
- PLAYER IMPACT: O pencerede oyun "donmus" hissi verdi.
- REPRODUCIBILITY: 1/3 pencere.

## B-015 · MAJOR — Ust bar eyalet sayaci ve nufus, toprak kaybini yansitmiyor

- DATE: 17-22 JAN 1840
- CONTEXT: Iki barista toplam 5 eyalet devrettim (Haldburg, Pellholm,
  Jorford, Yarmark, Norrheim). Nufus tarayicisinda bolgeler gercekten yok.
- EXPECTED: "40 provinces" → 35; nufus, devredilen bolgelerin nufusu kadar
  dusmeli (o bolgeler ~250K kisiydi).
- ACTUAL: Bir hafta sonra bile ust bar "40 provinces ◆ 1 city"; nufus
  918K→917K. Ya sayaclar bayat ya da devir insanlari transfer etmiyor.
- PLAYER IMPACT: Yenilginin buyuklugunu OLCEMIYORUM; skor tablosu yalan
  soyluyor.
- REPRODUCIBILITY: Bu kosuda kalici (1 hafta sonra da ayni).

## B-016 · MAJOR — Ordunun tamamen yok olusu bildirilmedi

- DATE: 1838-1839 arasi (hiz 8'de), fark edilis 17 JAN 1840
- CONTEXT: 2 alayim savasta eridi (generalin "10 battles" satiri tek iz).
- EXPECTED: "Alay X yok oldu" bildirimi; "ordunuz kalmadi" kalici uyari.
- ACTUAL: Sessiz. HUD Army 0 gosteriyor, o kadar.
- PLAYER IMPACT: Ulkenin savunmasiz kaldigini gunler sonra ogrendim.
- REPRODUCIBILITY: Bu kosuda 1 kez (dogasi geregi tekrar zor).

## B-017 · CRITICAL — Gider kalemleri toplami "Total expenses" ile tutmuyor (gizli tazminat kalemi)

- DATE: 22 JAN 1840
- CONTEXT: Iki baristan hemen sonra; Irgard'a savas tazminati kabul ettim.
- ACTION: Budget gider kalemlerini topladim: tedarik 0 + maas 0 + idare 16.5
  + egitim 17.2 + insaat 7 + faiz 1.2 ≈ ¤42.
- EXPECTED: Kalemler toplami = Total expenses; tazminat gorunur bir satir
  olmali ("War reparations to Irgard ¤X/wk · Y hafta kaldi").
- ACTUAL: **Total expenses ¤170.9** — ¤129/haftalik GIZLI kalem var (buyuk
  olasilikla tazminat). Acigimin %100'u gorunmez bir gider.
- PLAYER IMPACT: Defterin varligi anlamsizlasiyor; en buyuk giderim listede
  yok. (Ayrica borc ¤1094→¤299'a yine sessizce indi — uciuncu kez borc
  stoku aciklamasiz degisti.)
- REPRODUCIBILITY: %100 (su anki durumda her hafta).

## B-018 · MAJOR — Arastirma bitince yenisi istenmiyor; RP sessizce birikiyor

- DATE: fark edilis 23 APR 1841 (bitis ~JAN 1840 olmali)
- CONTEXT: Water Wheel Power (208 hafta) bitti; sonraki ~1.5 yil arastirma
  "nothing", 220 RP birikmis.
- EXPECTED: "Arastirma tamamlandi — yenisini secin" kalici uyarisi (ideal:
  otomatik duraklat ya da kuyruk).
- ACTUAL: Hicbir bildirim; teknoloji ekranini acinca gordum. Ayrica yeni
  arastirmanin "AT CURRENT RATE 143 wk" tahmini bankadaki 220 RP'yi hesaba
  katmiyor gibi (izlemede).
- PLAYER IMPACT: 4 yillik yatirimin meyvesi sessizce geldi; 1.5 yil
  arastirma kapasitesi bosa akti (banka varsa kayip azalir — dogrulanacak).
- REPRODUCIBILITY: %100 (tek arastirma bitisinde 1/1).

## B-019 · MINOR — Okuryazarlik iki ekranda farkli (%11 vs %14)

- DATE: 23 APR 1841
- CONTEXT: Population ekrani LITERACY %11; Technology ekrani LITERACY %14.
- PLAYER IMPACT: Hangisi dogru? Egitim ilerlememi olcemiyorum.
- REPRODUCIBILITY: %100 (ayni anda iki deger).

## B-020 · MINOR — Savas banner'i baristan sonra temizlenmiyor

- DATE: fark edilis 22 MAR 1842 (baris 23 APR 1841'de)
- ACTUAL: "⚔ 3 WAR — Ulheim declared war on us!" banner'i baristan ~1 yil
  sonra hala ekranda (✕ ile elle kapatilabilir).
- EXPECTED: Baris imzalaninca kendiliginden kalkmali.
- REPRODUCIBILITY: %100 (bu kosuda).

## B-021 · MAJOR — Rejim/hukumet degisikligi tamamen sessiz

- DATE: 1841-42 arasi bir noktada
- CONTEXT: ABSOLUTE MONARCHY → PRESIDENTIAL DICTATORSHIP; iktidar
  Conservative Union → Social Democratic Party; 4 politika ekseni degisti
  (Interventionism devlet sanayimi yasakladi, Pacifism savas politikam).
- EXPECTED: Buyuk olay sunumu (rejim dususu bir kampanyanin kirilma ani).
- ACTUAL: Sifir bildirim; fabrika kurma menusundeki kisittan geriye dogru
  kesfettim.
- PLAYER IMPACT: Cok yuksek — oyunun EN ETKILI politik olayi gorunmez.
- REPRODUCIBILITY: bu kosuda 1/1 (dogasi geregi tekrar zor).

## B-022 · MAJOR — Egitim butcesi gorunmez tavana (%30) sikismis; kaydirak-etiket desync

- DATE: 22 MAR 1842 (3 ayri denemede)
- ACTION: Egitim kaydiragini 40'a cektim (kriz yokken de).
- EXPECTED: %40 olmali ya da UI tavani ve nedenini soylemeli ("idari
  kapasite %30 ile sinirliyor" gibi).
- ACTUAL: Kaydirak 40'ta durur, efektif etiket 30'da kalir; Higher
  Education seviye 2 ("needs 40%") kalici kilitli.
- PLAYER IMPACT: Yuksek — ana hedef yolu aciklamasiz kapali; oyuncu
  kendini UI hatasiyla mi mekanikle mi bogusuyor bilmiyor.
- REPRODUCIBILITY: %100.

## B-023 · MINOR — Baris masasi eyalet karti RGO/uretim gostermiyor

- DATE: 23 APR 1841 (fark edilis 22 MAR 1842)
- CONTEXT: Torford'u devrederken petrol kuyulari oldugunu bilmiyordum;
  normal harita tiklamasi RGO'yu gosteriyor, baris masasi secimi gostermiyor.
- PLAYER IMPACT: Stratejik degeri olculemeyen tavizler.
- REPRODUCIBILITY: %100.

## B-024 · INCONCLUSIVE — Donanma "ORDER" ilk denemelerde tutmadi

- DATE: 1843, 1849
- NOT: Sonunda kartin kendisine tiklayinca calisti ([data-military-build]).
  Ilk basarisizliklar buyuk olasilikla test surucusunun metin-tabanli
  tiklamasindandi; oyun hatasi olarak SAYILMAYABILIR. Kayit durustluk icin.

## B-025 · MAJOR — "Start Offensive" mekanigi kesfedilemez

- DATE: 1851-1853 (iki yillik acmaz)
- CONTEXT: Stance 1/2/3 + Offensive secili oldugu halde cephe iki yil kimildamadi.
- EXPECTED: Stance "Offensive" ise taarruzlar kendiliginden planlanip
  baslamali; ya da "planlama %100 — taarruzu baslat" cagrisi bir bildirimle
  oyuncuya soylenmali.
- ACTUAL: Taarruz yalnizca general panelindeki "Start Offensive" dugmesiyle
  basliyor; bunu soyleyien hicbir ogretici/bildirim yok. Dugmeyi tesadufen
  buldum; skor aninda −18'den +27'ye dondu.
- PLAYER IMPACT: Cok yuksek — savasin kaderini belirleyen tek dugme gizli.
- REPRODUCIBILITY: %100.

## B-026 · MINOR — Butce kaydiraclarinda sessiz uc deger yuvarlamasi

- DATE: 1851
- ACTUAL: Tedarik/maas kaydiragi 100 istenince 60'a, Welfare 20 istenince
  25'e yuvarlandi; adim/uc deger kurali gorunmuyor.
- PLAYER IMPACT: Dusuk-orta; niyet ile sonuc farkli, sebep yazmiyor.
- REPRODUCIBILITY: %100.
