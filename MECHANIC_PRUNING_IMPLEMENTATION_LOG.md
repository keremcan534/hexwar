# MECHANIC PRUNING — IMPLEMENTATION LOG

Uygulama dali: `claude/mechanic-pruning-audit-jbpfjk` · Kayit surumu: **v14 → v15**
Onayli plan: `MECHANIC_CUT_PLAN.md` · Analiz: `MECHANIC_PRUNING_AUDIT.md`
Dogrulama sonuclari: `PRUNING_VALIDATION_REPORT.md` · Kayit gocu: `SAVE_MIGRATION_REPORT.md`
Yuk olcumu: `PLAYER_BURDEN_BEFORE_AFTER.md` · Kalan borc: `REMAINING_MECHANIC_DEBT.md`

## FAZ 0 — Taban cizgisi

- `audit:save`: **master'da GECIYOR.** `AUTONOMOUS_DEV_REPORT.md`'nin bildirdigi
  "battles round-trip etmiyor" bulgusu bu dala gelene kadar kapatilmis; goc
  calismasina temiz tabanla girildi (plandaki on kosul saglandi).
- `audit:determinism`: geciyor (surec izolasyonuyla tam determinizm).
- Taban metrikleri kaydedildi: `audit:long-run`, `audit:construction`,
  `audit:tariff`, `audit:budget` ciktilari degisiklik oncesi alindi ve
  dogrulama raporunda kiyas icin kullanildi.

## FAZ 1 — Denetim iddialarinin kod dogrulamasi

Hepsi guncel kodda dogrulandi (satir kanitlari analiz dosyasinda):
Sector/University/Administration ulusal sayacti; kale bolge-geneliydi ve kendi
bolgesi kismen isgal edilince atlas'tan dusup etkisini KAYBEDIYORDU; 8 teknoloji
degistiricisinden 6'sinin tuketicisi yoktu; techizat kademeleri hic ilerlemiyordu;
FACTORY_RIGHTS sarti hicbir sistemce okunmuyordu; `orders.js` AUTO/HOLD hicbir
UI yolundan erisilemiyordu.

---

## DEGISIKLIK KAYITLARI

### 1. Olu mekanik temizligi (commit "Olu mekanik temizligi...")

| KONU | ESKI | NEDEN YUKTU | YENI |
|---|---|---|---|
| Techizat kademeleri | `EQUIPMENT_TIERS` 4 kademe, carpanlar, `regiment.tier` | Hicbir yol kademeyi 1 ustune cikarmiyordu; olu agirlik her kayitta ve guc formulunde | Tamamen kaldirildi; `upkeepWeight` = alay sayisi, `armyPower` kademe carpani olmadan birebir ayni deger |
| `economy.inventory` | Haftada 43 kalem yazim | Hicbir okuyucu yok (olculdu) | Kaldirildi; eski kayitta gelirse dusuluyor |
| `city.foodStore` | Kurulusta yazilir | Okuyucusu yok (300 haftada sabit) | Kaldirildi |
| `economy.armySpending` alani | Haftalik kirpilan miras alan | Okuyucusu yok | Alan kaldirildi; `setFiscalPolicy('armySpending')` GERIYE DONUK calisir (iki kaydiraci surer; eski betikler kirilmaz) |
| Bildirim turleri GROWTH/INFRA/PROVINCE | Tanimli, hic yayilmiyor | Olu tanim | Kaldirildi. CRISIS ve RESEARCH tutuldu ve **ilk kez gercek olaylara baglandi** (asagida) |
| FACTORY_RIGHTS baris sarti | 14 warscore'a satin alinabilir | `industrialRightsOn` tuketicisizdi: sart HICBIR SEY vermiyordu — tuzak | Sart ve fonksiyon kaldirildi. Eski kayitlardaki anlasmalar zararsizca sona erer |
| Ticaret mal-politikasi kabugu | 4 kalici kapali dugme | Iki beta boyunca sifir eylem | Dugmeler kaldirildi, durust tek satir not kaldi |
| Politics Decisions / Release sekmeleri | Bos kayit + kalici kapali dugmeler | Sifir eylem | Sekmeler kaldirildi (ozellik gelirse icerigiyle doner) |
| `synthetic_oil` mali | Bosluga uretim | Tuketicisi yok (olculdu) | Mal silindi; SYNTHETIC_OIL_PLANT dogrudan **yakit** uretir (stratejik kavram — komurden yakit — korundu) |
| `explosives` | Bosluga uretim | Tuketicisi yok | Ordu kusatma tuketimine baglandi (`ARMY_CONSUMPTION_RATES.explosives`) |
| `clippers` | Bosluga uretim | Tuketicisi yok; ustune donanma 1850'ye kadar YAPISAL imkansizdi (P2-7: savas gemisi vapur istiyor, vapur tersanesi 1850) | Savas gemisi artik yelkenli konvoyla kurulur/onarilir; `clippers` askeri stok ailesi oldu. **1836 donanmasi mumkun** ve CLIPPER_YARD'in gercek musterisi var |
| `steamers` | Tek tuketicisi gemi kurulumuydu (artik clippers) | — | Yeni gercek tuketici: **bindirilmis ordu konvoy yakar** (denizasiri harekatin lojistik bedeli) |
| UI'nin yalan bayraklari | "piyade arazi bonusunu iki kat kullanir", "topcu yiginda belirleyici, yalniz kirilgan" — muharebe ikisini de OKUMUYORDU | Ekran var olmayan mekanik vaat ediyordu | Vaatler simulasyona baglandi: siperci piyade savunmada arazi/tahkimat x2; destek kolu yiginda x1.2, yalniz x0.65. Bu ayni zamanda "piyade her zaman dogru cevap" metasina ilk gercek karsi agirlik |

**Bagimlilik izleri:** her kaldirma oncesi `grep` ile tuketici tarandi;
tek suprizler betiklerdi (`legacy-audit`, `construction-diagnostic`) — ikisi de
yeni modele gore yeniden yazildi. Kayit semasi: bilinmeyen alanlar yuklemede
temizleniyor (`ensureEconomy` bilinmeyen pazar malini dusurur), surum atlamasi
gerekmedi (bu adimda).

### 2. Teknoloji degistirici butunlugu (commit "Teknoloji degistirici butunlugu")

SINIFLAMA (plan Faz 8):
- **ACTIVE:** `constructionPower`, `researchRate` (zaten bagliydi)
- **UNWIRED → BAGLANDI:** `rgoOutput` → `provinceOutput`; `factoryThroughput`,
  `inputEfficiency` → `runFactories`; `supplyConsumption` → `armyWeeklyDemand`
- **OBSOLETE → SILINDI:** `literacyCap`, `morale` (tasiyan teknoloji de yoktu)
- **DEAD → SILINDI:** arastirma puanindaki `rankBonus` (`nation.rank` hicbir
  yerde atanmiyor, carpan hep 1'di; sabit +1 tabana katildi — puan uretimi ayni)

KABUL TESTI: yeni `audit:tech-effect` her anahtari AC/KAPA olcer:
rgoOutput %20 → ham cikti +%20.0 · constructionPower %50 → guc +%50 ·
supplyConsumption −%20 → tuketim −%20 · factoryThroughput %50 → throughput +%50 ·
inputEfficiency %30 → girdi talebi −%30. Ayrica her anahtari en az bir
teknolojinin tasidigini dogrular. **Artik ne tuketicisiz degistirici var, ne
degistiricisiz vaat.**

Oyuncu arastirma karari: otomatik "en ucuzu sec" YZ'de kaldi, oyuncuda kalkti.
Tamamlanan arastirma artik RESEARCH bildirimi yayar ("sonraki alani sec");
secim beklerken puan birikir, hicbir sey ziyan olmaz. `inputEfficiency`
baglantisi ayni zamanda P1-1b'nin (komur: bilesik talep vs dogrusal arz)
talep-tarafi adayinin ilk gercek adimi.

### 3. Bina donusumu + kayit v15 (commit "Bina donusumu (v15)...")

#### Construction Sector → Construction Capacity (ulusal yatirim)
- **Korunan sey:** insaat gucu kitligi ve "kapasiteye mi, ise mi" bilesik
  yatirim karari — protejili beta bulgusu. Yatirim projesi AYNI kuyruga girer,
  ayni insaat gucunu tuketir, kapasite projeleri (eski sektor kurali gibi) one
  alinir.
- **Kaldirilan sey:** bolge secme rituali (etki zaten ulusal sayacti).
- **Fren:** seviye basina artan fiyat (100 x (1+0.35L), kuyruktakiler dahil) +
  seviye basina 4/hafta bakim. YZ tavani sanayi olcegine bagli
  (2 + tesis/3) — dogrulamada olculen kapasite patlamasina karsi eklendi.
- **UI:** Insaat ekraninda tek kart: seviye, sonraki bedel, Invest. Kapali
  dugme NEDENINI yazar (bu oyunun tek sert UI kurali ihlalsiz).

#### University → Higher Education (ulusal kurum, 5 kademe)
- Kademeler: No organised higher education → Limited Academies → Regional
  Colleges → National University Network → Research Institutions.
- **Etki birebir esdeger tasindi:** eski 6-bina x %4 = %24 tavani, 4. kademe
  x %6 = %24 tavanina esner (`higherEducationBonus`). Ayni iki tuketici:
  fabrika ise alim hizi ve okuryazarlik hedefi → arastirma puani. R-18/R-19
  zinciri (egitim→okuryazarlik→arastirma) bozulmadan kurumsallasti.
- **"12 ayda bir tikla" olmamasi icin:** artan fiyat (120 x (1+0.6L)) + kademe
  basina 3/hafta bakim + **egitim butcesi esigi** (kademe basi %25/40/55/70) —
  egitim kaydiraci ilk kez bir kurumun on kosulu.
- Butce ekranindaki tarihi cumle guncellendi: egitim satiri artik kurumun
  kapisini gosteriyor.

#### Administration → tek yonetim kavrami (taxEfficiency + nufusla buyuyen gider)
- Bina silindi; +%4/bina ulusal vergisi carpani kaldirildi (etkisi kucuk ve
  tek tuketiciliydi — YZ tipik 1 bina kuruyordu).
- README'nin bastan beri vaat ettigi "imparatorluk buyudukce idari gider buyur"
  TESLIM EDILDI: `administrationCost` artik nufusla da olcekleniyor
  (250k ustu her 10k kisi 0.06/hafta). ORTA-18'in "asla dusurulmez kaydirac"
  bulgusuna gercek karsilik: dusuk fonlama tahsilati keser AMA buyuk ulkede
  gercek para biriktirir; YZ krizde idareyi kisar, bollukta tam fonlar.

#### Kale: KONUM TESTINI GECEN TEK YAPI — artik gercekten yerel
- Etki bolge-geneli %8/adet'ten **capa karesi + 2 hex yaricapta +%10**
  (toplam tavan %24) modeline gecti. "Neden buraya?" sorusunun cevabi ilk kez
  haritada okunuyor.
- **Ters tesvik duzeltildi:** eski yol atlas uzerinden gidiyordu ve isgal
  altindaki bolge atlastan dustugu icin kale TAM kendi bolgesi istila
  edilirken buharlasiyordu. Capa dogrudan cozulur; kale ancak capa karesi
  fiilen dusunce el degistirir (captureConstructionAt aynen).
- Oyuncu kaleyi haritada gercek bir kareye tiklayarak diker (insaat ekrani
  zaten harita tiklamasini destekliyordu — davranis anlamlandi); YZ kale
  yerini dusman sinirina/sehre gore SECER (`frontierFortAnchor`) ve taarruz
  degerlendirmesinde kaleyi GORUR (`estimatedDefense` fortDefenseAt okur).
  Kale capalari insaat kipinde haritada isaretlenir.

#### Kayit gocu
Bkz. `SAVE_MIGRATION_REPORT.md`. Ozet: v14 kayitlari kayipsiz yuklenir;
sektor sayisi 1:1 kapasite seviyesine (guc esdegeri birebir), universite
sayisi 2/3 oranla kademe tavan 4'e, idare binalari tam bedel iadesiyle;
kuyruktaki eski tip projeler cevrilir ya da iade edilir.
`construction-diagnostic` 27 kontrolun hepsiyle geciyor (goc dahil).

### 4. Oyuncu yuku (commit "Yuk azaltma...")

Ilke: tekrarlanan YURUTME gitti, tekrarlanan KARAR kaldi. Sayisal kiyas
`PLAYER_BURDEN_BEFORE_AFTER.md`'de. Ozet:
- Shift+tik = 5 siparis (alay/gemi; sehir paneli dahil). Egitim yuvasi,
  techizat, insan gucu kisitlari aynen baglayici — otomatik uretim YOK.
- Egitim kuyruguna tek-tik basa alma (⤒) — insaat kuyrugundaki R-11'in esi.
- Fabrika secim penceresi alimdan sonra ACIK kalir; kurulan tur listeden
  kendiliginden duser. Insaat ekranindaki state listesi KARARLI siralandi
  (bos-yuvaya-gore siralama satirlari her hafta kaydiriyordu, P2-3'un esi).
- Subvansiyon POLITIKASI (butce ekrani): Manual / War industries at war /
  None. "Strategic" YZ'nin kendi temizleyicisiyle ayni kurali oyuncuya verir;
  tekil isaretleme Manual'da aynen durur (anlamli tekil karar korunur).
- Tiyatro emri: "All commands: Advance/Hold" tek tik; subay satirinda durus
  rozeti. B2-021 ("sessiz geri donme") kod izinde oyuncu durusunu degistiren
  hicbir yol bulunamadi — bulgu, iki ekranin farkli general gosterip ayni
  soruyu cevapliyormus gibi yapmasiyla tutarli; cozum gorunurluk + tek tikta
  yeniden yayinlanabilir niyet. (Ayrintili degerlendirme validasyon raporunda.)
- `autoAssign` VARSAYILAN ACIK (beta talebi birebir). Eski kayitlarin acik
  tercihi korunur.
- **AUTO/HOLD ilk kez erisilebilir:** secili tumenlerin tamami tek dugmeyle
  YZ'ye devredilir ya da mevzide tutulur; N tusu siradaki bosta birime atlar.
  Donanma icin bu, eksik komuta katmaninin yerine gecen gercek devir yolu
  (amiralin cephesi yok; AUTO'daki gemi navalGoal ile kendisi calisir).

### 5. Tek-cevapli kaldiraclar + fren (commit "Tek-cevapli kaldiraclar...")

- **Gumruk:** `EXPORT_RETALIATION 0.5` — yuksek tarifeli ulkenin ihracat
  erisimi kisilir (dunya once acik ekonomiden alir; korunum bozulmaz).
  Olcum: %0→%100 hazine kazanci 66.6k → 39.1k, gumruk gelir payi %25.5 →
  %14.8, sanayi girdi faturasi −%2.8 → **+%10.9**, hane sepeti +%7,
  karsilanma −8 puan. Tavan hala gelir getirir ama artik uc gercek bedelle.
- **Salam freni:** ilhak sohreti ayni kurbana tekrar savasta x(1+0.5(n−1)),
  tavan x2.5; `DECAY_RATIO` 0.02 → 0.012. Kalibrasyon dongusu icin asagiya
  ve dogrulama raporuna bakin.
- **Koalisyon = KRIZ:** oyuncuya karsi koalisyon kurulunca CRISIS bildirimi
  (oyunu durdurur) — tanimli-ama-hic-yayilmayan tur gercek olayina baglandi.

### 6. Dogrulamanin geri dondurttukleri (Faz 17 kaydi)

Agresif gerileme taramasi (`audit:pruning-validation`) iki gercek gerileme
yakaladi ve ikisi de duzeltildi:
1. **Kapasite patlamasi + iflas dalgasi:** YZ merdiveni eski bolge-yuvasi
   freni olmadan seviye 26-33'e cikip bakim bataryasiyla 19/30 ulkeyi iflasa
   suruyordu. Duzeltme: "bogulma" sinyali yalniz FONLANMIS isi sayar
   (fonlanmamis proje guc tuketemez) + YZ kapasite tavani sanayi olcegine
   bagli. Sonuc: iflas bulgusu kapandi, azami seviye 12-18 banda indi.
2. **Sohret kacagi:** "savasta oransal azalma dursun" fikri donmus savaslar
   yuzunden sohreti 519-1141'e tasidi (esik 22!). GERI ALINDI; fren orani
   dusurulerek (0.012) hedeflenen davranis saglandi — tek savas guvenli,
   seri yagma esigi asar. Olcum dogrulama raporunda.

Tam uzunluktaki kosu (5x1300 + 3x2600 + 1x5740) hizli kosunun goremedigi
bir sarmali daha yakaladi: 1300. haftada 19/26 ulke kalici kredi cezasinda
(taban cizgi ayni tohumda 2/26). Kok neden zinciri defter kiyasiyla izlendi
(`ledger-probe`, `war-state-probe`) ve DORT duzeltmeyle kapatildi:

3. **Donmus savas kacagi (ai.js):** barisi yalniz kazanan (skor ≥ +30) ya da
   kaybeden (≤ −30 / cok zayif) teklif ediyordu; koalisyonun actigi uzak,
   cephesiz 0-0 savasin teklif vereni HIC yoktu — 1186 haftalik savaslar
   olculdu, savas maliyesi (tedarik %60-100) onyillarca acik kaliyordu.
   Duzeltme: 156 haftadir sonuc uretmeyen iki-esik-arasi savas beyaz baris
   teklif eder; kabul karari yine peace.js beklenti/yorgunluk kapisindan
   gecer (onde olan bedava imzalamaz). Sonuc: pv-1'de 9 donmus cift → 1;
   war-pressure'da donmus 9/4/3 → 1/0/3, kapanan savas 100/101.
4. **YZ yatirim disiplini (construction.js):** yatirim tetigi hazine STOGUNA
   bakiyordu (savas kasasi "zenginlik" sayiliyordu); yeni kosul temerrut izi
   yok + borc < yarim yillik gelir + haftalik net arti. Kriz modu ise STOK
   eritir: bakim gelirin %25'ini asarken haftada bir seviye lagvedilir
   (derin krizde son seviye dahil); `runEconomicAI`nin sehirsiz-devlet erken
   cikisi maliye YZ'sinin ustunden alindi (kalinti devletler hic kriz moduna
   giremiyordu). Oyuncuya ayni cikis UI'da: yatirim kartinda − (lagvet,
   iade yok) — tek yonlu tuzak kalmadi.
5. **Borc yeniden yapilandirma (economy.js):** ceza borc kapasitesini
   kuculttugu icin eski savas borcu matematiksel olarak odenemez hale
   geliyordu (cikissiz kilit). Temerrutteki devletin kapasite USTU borcu
   haftada %2 silinir; bedel zaten yuksek cezada (faiz +%10, kapasite %15'e
   dusuk, kurum verimi kirik). Sonuc: takili borc stoklari 2600 → ~60.
6. **Kriz terhisi (ai.js):** `desiredArmy` maliyeye bakmiyordu; yenilgiden
   cikan devlet gelirinin katini maas+tedarike verip her hafta kucuk kucuk
   temerrude dusuyordu. Bariste, agir kredi cezasindaki YZ haftada bir birim
   terhis eder (iki alaylik cekirdek kalir).

Toplam etki (pv-1, 1300. hafta): kalici kredi cezasi 19/26 → 11/26 (taban
2/26; pv-3'te taban 6/26'ya karsi 7/25 — tohuma gore taban cizgiyle ayni
banda dondu), ortalama borc taban cizginin ALTINDA (459 vs 885), kapasite
toplami taban cizgiyle ayni bantta. Kalan tasiyicilar sehirsiz kalinti
devletler — REMAINING_MECHANIC_DEBT'te.

---

## TESTLER

- Yeni: `audit:tech-effect` (degistirici AC/KAPA), `audit:pruning-validation`
  (cok tohumlu uzun kosu + sistemik saglik esikleri).
- Yeniden yazilan: `construction-diagnostic` (27 kontrol; v14 gocu dahil),
  `audit:construction` (pesin bedel, A/B/C kapasite kiyasi, kale yerellik,
  iptal istismari), `audit:legacy` (kaldirilanlarin geri sizmadigini dogrulayan
  gerileme bekcisine donustu; olu-mal bekcisi cag kapilarini tanir).
- Gecen mevcutlar: `audit:save`, `audit:determinism`, `audit:tariff` ve tam
  takim (`PRUNING_VALIDATION_REPORT.md`).
