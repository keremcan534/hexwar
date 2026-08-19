# SON BUTUNLESTIRME GECISI — kapanis raporu

**Amac:** Imperial Eye'i kismen bagli simulasyonlar yigini olmaktan cikarip
TEK tutarli oyun olarak birakmak. Bu gecisten sonra gelistirme molasi.

Dal: `claude/technology-player-agency` (PR #4 head'inden turer; PR #4 ayri
ve Ready for Review durumunda bekliyor).

---

## 1. NE BITTI

### Teknoloji — artik OYNANAN bir sistem

- **Ulusal Program**: oyuncu (ve YZ) sekiz yilligina bir yone baglanir.
  Program tek kartta uc sey soyler: **yon** (odak klasorler ×0.6, ihmal
  ×1.6), **bedel** (egitim taban sarti) ve **taahhut** (erken fesih birikmis
  puanin yarisini yakar, bir yil yeni ilan yasagi). Alti program: Iron & Rail
  · Workshop of the World · The Arsenal · Blue Water · The Counting House ·
  National Instruction.
- **Zorunlu mikro sifira indi**: bosalan arastirma kuyrugunu program doldurur
  — oyuncu dahil (kor beta B-018: dokuz secim kacmis, 5671 RP bos beklemisti).
  Elle secim duruyor ve otomatigi her an ezebiliyor.
- **Yayilim**: temas ettigin komsularin cogunun bildigi teknoloji sana
  ucuzlar (azami %35). Geri kalan yakalayabilir; lider erken oder.
  `effectiveTechCost` herkesin (ekran dahil) alinti yaptigi TEK fiyat.
- **Icerik 30 → 65**: army 12 · navy 4 · commerce 9 · culture 10 · industry 30.
  Dolgu yok — her teknoloji kilit, DUZ kadro slotu, tavan ya da kapasite
  tasir. "Tufek I/II/III" bilerek yok: takvimsiz birim tiplerine kilit sahte
  olurdu.
- **Dort yeni degistirici, dordu de canli tuketicili** (AC/KAPA ile olculdu):
  `literacyReach` → okuryazarlik tavani (olu 0.95 kirpmasi ilk kez
  ulasilabilir) · `debtCapacityBonus` → borc kapasitesi (faiz yuku
  kendiliginden duser) · `trainingCapacity` → es zamanli egitim slotu ·
  `reinforcementRate` → takviye hizi.
- **Birim kilidi**: `unitAvailable` fabrika kapisiyla ayni VEYA kalibina
  kavustu — Armoured Warfare ARMOR'u, Military Aviation AIRCRAFT'i (ve
  fabrikasini) takvimden once acar. Modulun dosya-basi sozlesmesi ilk kez
  iki yariyla da dogru.

### Diplomasi — ulkeler artik hatirlanabilir

- **Ittifak**: `nation.treaties`'te simetrik kayit (yeni mimari yok; baris
  sartlarinin tesisati). Muttefige savas ilani **reddedilir**; saldirıya
  ugrayan muttefikin YZ ortagi kendi ciftler-arasi savasini acar
  (declareWar'in BUTUN kapilarindan gecerek — cullanma tavani asimaz).
  Oyuncu cagriya OTOMATIK sokulmaz: karar karti duser.
- **Rakip**: `nation.rivalId` — mana yok, tek alan. Yillik, HISTEREZISLI
  (etiket sarkaci dersi). YZ hedef seciminde rakibi ×1.35 agirliklar.
- **Diplomatik hafiza**: sinirli 24 kayit/ulke — savas, toprak aldi/verdi,
  ittifak kurdu/bozdu, cagriya kostu. Ulke panelini besler.
- **Duzeltilen sahte vaat**: VASSALIZE karti "kalici baris" vaat ediyordu,
  hicbir sey uygulamiyordu. declareWar artik ALLIANCE/VASSALIZE ciftleri
  arasinda ilani reddediyor.

### Kesfedilebilirlik — dunya 20 dakika gezilebilir

- **Ulke dosyasi** artik soyluyor: karakter satiri (14 elle yazilmis satir,
  simulasyon etiket secer, 26 haftalik onbellek titremeyi keser) · teknolojik
  konum (#sira/N + lider/takipci/ortalama/geri etiketi) · ne uretiyor · neye
  bagimli (ithalat yuzdesiyle) · muttefikler · rakip · son uc hafiza kaydi.
- **Fabrika karti**: ulusal baglam — "girdisi %N ithal · ulusal ciktinin
  %M'i ihrac" (yalniz gercek akislardan; tesis basina pay UYDURULMADI).
- **Dunya haberleri** (13 haftada bir, gecis tetiklemeli): buyuk guce
  giris/cikis, sanayi liderliginin el degistirmesi, devlet cokusu.
- **WHY panelleri**: arastirma hizi dokumu (formulun gercek terimleri) ve
  borc/faiz dokumu (taban + doluluk + temerrut sicili) tiklamayla.

### Iletisim / vakayiname / kapanis (onceki gecisin ustune)

- Kilit acan teknoloji tamamlanmasi tier 2 + vakayiname; program ilani/feshi
  tier 2 + vakayiname; programsiz oyuncuya uc yilda bir davet karti.
- Kapanis ekranina **Technology** satiri (acilis kesitine arastirma sayisi
  eklendi) ve **kampanya sayaclari**: savas sayisi · zirve hazine · en kotu
  borc (`nation.tally`, haftalik tutulur — REMAINING_PRESENTATION_DEBT #3
  "uydurmak yerine say" cozumu).

## 2. NE BAGLANDI

| Zincir | Once | Simdi |
|---|---|---|
| Egitim → arastirma | okuryazarlik stok ama YZ egitimi 1860'ta birakiyordu | program tabani + kirilan cirt + kurum tabani: uc kaynakli alt sinir |
| Teknoloji → sanayi | 7 kilit (1'i olu, 2'si geri tarihli) | 11 kilit, hepsi takvimi geciyor (+2y…+16y); telefon/radyo/ucak ILK kez arastirilabilir |
| Teknoloji → ordu | HIC | egitim slotu, takviye hizi, tedarik, ARMOR/AIRCRAFT erken |
| Teknoloji → maliye | HIC | borc kapasitesi → faiz yuku |
| Savas → siyaset | HIC (warStrain yalniz stability'ye akiyordu, stability'yi siyaset okumuyordu) | yipranma+isgal IKTIDAR partisini asindirir (azami −%45) — kaybedilen savas hukumet dusurebilir |
| Diplomasi → tarih | HIC | ittifak/rakip/hafiza → ulke paneli + vakayiname |
| Reform → ekonomi | CALISIYORDU ama ekran "akmiyor" diyordu | dipnot duzeltildi (8 anahtarin 6'si canliydi) |

## 3. NE KESILDI / SILINDI

- **War Exhaustion** satiri (military ekrani): "Not simulated" yazan olu
  gosterge. Savasin bedeli zaten dort kanaldan akiyor.
- **`lowerBudget`/`middleBudget`** reform anahtarlari + `reformBudgetFactor`:
  hesaplaniyor, hicbir yerden okunmuyordu. Baglamak dondurulmus hane
  muhasebesini acmak olurdu; silmek davranis koruyan tek durust secenek.
- **`techModifiers()`** disa aktarimi (onceki adimda): sifir cagiran.
- **Sahte "Unlocks steel mill" vaadi** (onceki adimda): kilit hicbir sey
  acmiyordu.
- **Bos teknoloji klasorleri**: 25 vaat edilen klasorden dolu olmayan 18'i
  sekmelerden kaldirildi — icerik geldikce geri gelir.

## 4. NE OTOMATIKLESTI

- Arastirma kuyrugu (program yonunde, oyuncu dahil; elle secim ezer).
- YZ program secimi / yenilemesi (ceyrek taramasi), ittifak taramasi,
  rakip tazeleme (yillik, histerezisli) — hepsi deterministik.

## 5. DUZELTILEN SAHTE-ETKINLIK (askeri)

- **HOLD emri artik gercek**: general HOLD verilen tumeni cepheye geri
  yurutuyordu; march() artik emri sayiyor.
- **Planlama sayaci ilk kez oduyor**: HOLD→ADVANCE gecisi birikimi KORUR
  (bekleyip taarruza birikimle girmek — sayacin vaadi buydu ve hicbir yol
  odemiyordu). ADVANCE→HOLD sifirlar: ac-kapa istismari hala imkansiz.
- **Saldiri temposu gorunur**: "next assault in Nw" komuta satirinda;
  kadans manuel taarruzu da kilitliyordu ve gorunmuyordu.
- **Denizdeki tumen**: "at sea — cannot fight, consumes convoys".

## 6. OLCUMLER (onceden kayitli olcutlere karsi)

`audit:research` (3 tohum × 1836-1945), olcutler koddan ONCE yazilmisti:

| Olcut | Taban (A) | Simdi | Hukum |
|---|---|---|---|
| (e) arastirma hizi p90/p10 ≥ 2 | 1.6-2.8 | **3.7 · 2.1 · 2.3** | **GECTI** |
| (f) 1945 farkli teknoloji kumesi ≥ 9 | 9-12 | **21 · 21 · 23** | **GECTI** (buyuk ayrisma) |
| (g) 1900 lider−geri ≥ 8 | 6-9 | **21 · 16 · 19** | **GECTI** |
| program cesitliligi (tekel yok) | — | 6 programin 6'si sahada, hicbiri >%70 | **GECTI** |
| (c) 1900 okuryazarlik ≥ %25 | %8.5-10.7 | **%36.3 · %16.8 · %23.1** | KALDI (2-4 kat iyilesme) |
| (b) egitim IQR > 0 | 6 onyil-tohum sifir | **1** | KALDI (buyuk iyilesme) |
| (a) egitim=0 ≤ %40 | %60-85 | en kotu tohum %48-55 (ayar sonrasi) | KALDI (iyilesme; asagida) |

(a)/(b)/(c) kalanlari **savas-yogun tohumlarda kriz-fesih-soguma dongusune
giren devletler**: geri donebiliyorlar (NONE payi onyillar icinde dalgalanip
dusuyor — kalici kilit YOK), ama "ara sira basarisiz devlet"ten cok.
On-kayitli plandaki iki ayar uygulandi (fesih esigi 0.8'e, rezerv
duyarliligi); brief'in "esik optimizasyonuyla bir gun daha harcama" emri
geregi burada duruldu. Borc listesinde.

Diger dogrulamalar:

| Test | Sonuc |
|---|---|
| `audit:tech-effect` (10 anahtar + birim kilidi, AC/KAPA) | **0 bulgu** |
| `audit:private` (P0 kilitlenme) | **0 bulgu** |
| `audit:events` (bildirim yuku, 100 yil) | **0 bulgu** — bir regresyon yakalayip kapattiktan sonra (asagida) |
| `audit:save` · `audit:determinism` · `audit:legacy` | **temiz** |
| Ittifak hedefli test (kur/red/cagri/cift-yon) | 6/6 |
| Chromium smoke | asagida |

### Dogrulamanin yakaladigi regresyon (kapatildi)

Savas→siyaset baglantisi hukumetleri GERCEKTEN dusurmeye baslayinca rejim
etiketi salinimi geri geldi (ayni baslik yuzyilda 10 kez — eski fren yon
basina ayri anahtar kullaniyordu, A→B ve B→A ikiser ayri kanaldan
akiyordu). Fren yon-gozetmez cift anahtarina baglandi (ceyrek yuzyil
sogutma): ayni ciftin gidis-gelisi TEK hikayedir. `audit:events` 0 bulguya
dondu. Mekanik degismedi — yalniz DUYURU frenlendi; secimler ve hukumet
dusmeleri aynen isliyor.

### Chromium smoke (gercek oturum)

- **Gercek bir cokusu yakaladi**: `FUEL_FIX` bayragi `process.env` okuyordu —
  tarayicida `process` yok, oyun ACILMIYORDU. Bassiz denetim bunu goremezdi.
  Duzeltildi (`typeof process` korumasi); konsol 0 hata.
- Program ilani gercek tiklamayla: kart → `IRON_AND_RAIL`, egitim kaydiraci
  aninda 0→25 (taahhut ANINDA baglar), vakayinameye kayit.
- WHY-arastirma balonu gercek formul terimlerini basiyor.
- 3 yil isletim: arastirma programa gore kendiliginden yurudu (1 teknoloji,
  odak klasorden), egitim tabanda kaldi.
- Dosya: karakter satiri + 5 kimlik satiri + gercek uretim listesi; ittifak
  teklifi tiklamayla kuruldu (karsi degerlendirme ayni fonksiyon).
- **Kaydet → yenile → yukle**: program, ittifak, rakip, hafiza, sayaclar,
  vakayiname — hepsi birebir; 6 haftada cift olay yok.
- Smoke'un ikinci yakalamasi: `isAllied` cagri sozlesmesi (nesne+id) —
  hedefli test 2. adimda yakaladi, duzeltildi, 6/6.

## 7. BILINEN, ENGELLEMEYEN BORC

1. **(a)/(c) olcutleri**: savas-yogun tohumlarda egitim=0 payi hedefin
   ustunde (%48-55). Kalici kilit yok (dongusel); sonraki tur icin bir
   aday: fesih sonrasi "toparlanma" programi (dusuk taban, kisa vade).
2. **YZ oyuncuya ittifak TEKLIF etmez** (bekleyen-teklif durumu ister);
   oyuncu-baslatir. 
3. **Abluka / deniz kontrolu yok**: donanma savasir, tasir, onarilir ama
   stratejik dis amaci ince. Taklit edilmedi; survey'in "kiyi sehrine bitisik
   dusman gemisi konvoy karsilamayi keser" onerisi ilk aday.
4. **Amiral/filo otomasyonu yok** (cephe sistemi karaya ozel).
5. **(h) yakalama olcusu** ulus-kimligi izlemedigi icin olculmedi.
6. **`inputEfficiency` tavani** 0.50'de; agac toplami tavana esitlendi ama
   tavanin kendisi ekonomi dengesi olcumu istedigi icin oynatilmadi.
7. **Muharebe raporlari ham koordinat** kullaniyor (Beta #1'den beri).
8. **Baris masasi eyalet kartlarinda RGO bilgisi yok** (B-023).
9. Kucuk kozmetik: `publishing_industry` id'si 'Charcoal Smelting' adini
   tasiyor (ic id, oyuncu gormez).

## 8. CEKIRDEK DEGISTI MI?

**Mekanik cekirdek: HAYIR.** Pazar mimarisi, POP/hane muhasebesi, insaat
kapasitesi, savas cozumu, cephe/muharebe modeli, dunya uretimi — dokunulmadi.

Sinirda olan ve ACIKCA beyan edilen degisiklikler:
- `adjustSocialAI` esikleri (YZ mali davranisi; on-kayitli A/B ile, tek
  bayrak `FUEL_FIX` — `HEXWAR_NO_FUEL_FIX=1` eski davranisi birebir verir).
- `supportScore`'a savas terimi (siyasi katman; hane muhasebesi degil).
- `setStance` planlama sifirlamasinin yonu (sayacin vaadini tutmasi icin).
- Iki olu reform anahtari silindi (hicbir tuketici davranisi degismedi).

## 9. DURUM

Oyun tek dunya gibi davraniyor: egitim teknolojiyi, teknoloji sanayiyi ve
orduyu, savas siyaseti, diplomasi tarihi besliyor; ekran her buyuk sayinin
"neden"ini tiklamayla acikliyor; yuzyilin sonu oyuncunun kendi sayaclariyla
kapaniyor. Kalan borc listesi kisa, kayitli ve hicbiri oynanisi kilitlemiyor.

**DURULDU.**
