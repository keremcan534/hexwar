# OPEN BETA — TEST #1 vs YENI KOR KAMPANYA (IRONTIDE)

Bu dosya onceki dongulerin karsilastirmasini DEGISTIRIR (eski surum git
gecmisinde). Soy agaci:

- **TEST #1** — seed `BETA1836`, Vasheim, ~70 yil (ozgun acik beta).
- **ara donguler** — eski Test #2 (Ossria, 8V9X3W) + Beta 3 bassiz kosusu +
  onarim/budama/stabilizasyon gecisleri. Kanit olarak kullanildi.
- **YENI TEST (bu)** — seed `IRONTIDE`, Marov Khanate, 1836 → 7 JUL 1916
  (%80.5; son, altyapi arizasi — TEST CONTAMINATION, gunlukte kayitli).
  Kor oynandi; bu dosya rapor DONDURULDUKTAN sonra yazildi.

Kategoriler: **FIXED · IMPROVED · UNCHANGED · REGRESSED · NOT ENCOUNTERED ·
INCONCLUSIVE**. Iki kampanya farkli dunyalar/uluslar; kiyas zorlanmadan
verilemeyen yerde acikca soylenir.

> **Metodoloji notu (eski karsilastirmadan alinan ders):** Onceki kor testin
> "savas ilani duraklatmiyor" bulgusu kod incelemesinde KENDI otomasyonunun
> artefakti cikmisti (NOTIFY halt'i hizli-sarma dongusunce eziliyordu).
> Benim kampanyam da hiz-8 dongulu oynandi; asagida "sessizlik" iceren her
> hukum bu riskle isaretlendi ve Faz C'de kod dogrulamasina tabi.

---

## 1. TEST #1'IN UC BUYUK KIRIGI

| Eksen | Test #1 | IRONTIDE | Hukum |
|---|---|---|---|
| Bedava beyaz baris (B-01) | 25-0 kaybedilen savas tek tikla silinir | Kaybederken beyaz baris REDDEDILDI ("will not sign for nothing"); yenilgiler 6+5+2 eyalet + tazminata mal oldu; kazandigimda Torford'u ancak ISGAL EDIP alabildim | **FIXED — kokten** |
| Ticaret-hazine kopuklugu (B-02) | Net −¤824 hazineye hic dokunmuyor | Dis denge kampanyamin ANA mali kuvveti: −¤75 (1837 iflasi), −¤168 (1861), −¤284 (1887 iflasi) hazineden odendi | **FIXED — hatta ters yonde asiri guclu** |
| Sonsuz para, sifir sonuc (B-03) | ¤50 → ¤280k, borc yok, alacak sey yok | Hazinem ¤0↔¤92k arasinda IKI tam cokus-donus dongusu yasadi; tahvil, %20.5 faiz, yeniden yapilandirma, kredi duvari hepsi gercek | **FIXED (ceza tarafi) / IMPROVED (odul tarafi)** — zirvede hala harcayacak sey az (Interventionism yasagi + tavanlar), "para guce donusmuyor" sikayeti kucultulmus halde yasiyor |

## 2. EKONOMI VE PIYASA

| Eksen | Test #1 | IRONTIDE | Hukum |
|---|---|---|---|
| Tavan-fiyat ranti (B-04) | Komur 70 yil 8×'te sabit; sahibi bedava kazanir | Sarap fabrikam fiyati ¤80→¤4.5 cokertti — arz fiyati GERCEKTEN kirar; ama gubre/demir on yillarca 5-8× kaldi cunku kimse yatirim yapmadi | **IMPROVED** — mekanizma calisiyor, yatirim YZ'si koru (yeni B-027) |
| YZ ekonomik firsat korlugu (D-15) | Hicbir YZ komur kapasitesi kurmadi | 80 yilda tek gubre/demir tesisi kurulmadi (8× fiyata ragmen); ozel sermaye luks pesinde | **UNCHANGED** — bugun kalan en buyuk ekonomik YZ borcu |
| Sanayi olceginde negatif getiri (B-08) | 223 seviye < 30 seviyenin geliri | Karsilasmadim (sanayim 66 seviyeyi gecmedi) | **NOT ENCOUNTERED** |
| Egitim olu butce (B-07) | 62 yil %40 → okuryazarlik 24→23 | 0% → %27; egitim isci NITELIKLENDIRIYOR, HE'yi kilitliyor, arastirmayi besliyor | **FIXED** — yeni sikayet katmani: %30 gizli tavan + iki ekranin farkli okuryazarlik soylemesi |
| Defter okunakliligi | "en iyi sinif" aciklamalar + B-02 skandali | Aciklama satirlari hala cok iyi; AMA gizli tazminat kalemi (toplamlar tutmuyor, B-017), bayat HUD (B-006), kaydiraca tepkisiz projeksiyon (B-009) | **KARISIK: IMPROVED cekirdek, yeni MAJOR okunakl. hatalari** |
| Para bir seye donusuyor mu | Hayir (skor tablosu) | Kismen: ordu/kale/kapasite/HE aliyor; zirvede yine biriktirme | **IMPROVED, tam degil** |

## 3. SAVAS VE ASKERIYE

| Eksen | Test #1 | IRONTIDE | Hukum |
|---|---|---|---|
| Savas sonucu / sinir hareketi | Eski Test #2'de 68 yilda SIFIR sinir degisti | Kampanyamda ~30 eyalet el degistirdi (25'ini kaybettim, 1'ini geri aldim, azinliklarim bagimsizlasti) | **FIXED** — sinirlar yasiyor |
| Oyuncu talebi masada gecmiyor (B-05/D-8) | Kazanilan savaslar bile toprak getirmiyor | Kural artik net ve OYNANIR: ancak isgal ettigin kirmizi eyalet talep edilir; +27 skorla Torford'u aldim | **FIXED** |
| Komuta ajansi (D-9) | "General sec, Start Offensive, izle" | Cephe/hedef/stance/taarruz dalgalari: 4. savasin kaderini BEN dondurdum; ama "Start Offensive" dugmesi ogretilmiyor — iki yil acmazda kaldim (yeni B-025) | **IMPROVED** — ayni dugme ailesi, artik gercek sonuclu; kesfedilebilirlik hala berbat |
| Muharebe raporlari koordinatli (UI-4) | "battle at 125, 52" | "Ulheim engaged at 27, 23" / "BATTLE OF 42, 21" | **UNCHANGED** — birebir ayni kusur |
| Ordu bakim/erime iletisimi | (Test #1'de ordu olumsuzdu) | Ordum IKI Kez toptan yok oldu ve tek iz bir generalin ozgecmisiydi (B-016) — hiz-8 artefakti riski var, Faz C'de dogrulanacak | **YENI SORUN (INCONCLUSIVE sessizlik payi)** |
| YZ savas kapatamiyor / surekli ilan (D-14) | Draesh her yil yeniden ilan, on yil isgal sonucsuz | YZ savaslari acimasizca KAPATIYOR (6 savasin 6'si sonuclu); yeniden-ilan temposu "ciftlik" hissi veriyor ama ateskes/infamy/sonuclarla tutarli | **FIXED**, yeni kisilik sikayetiyle |
| YZ oyuncuya saldirmiyor (eski T#2/B3) | 64 yil kimse saldirmadi / busy-gate dokunulmazligi | Bana 7 kez saldirildi; zayifken cullanildi, guclenince 13 yil beklendi | **FIXED** |
| Donanma (B-11) | Kalici BLOCKED, sebep yok | 1849'da gemi yapabildim (blokaj sebepleri yazili); ama donanmanin OYUNU 67 yilda hic olmadi | **IMPROVED (erisim) / UNCHANGED (anlam)** |
| Lojistik ekrani (D-10) | 70 yilda 1 kez acildi, hic gerekmedi | Ayni — iyi tasarlanmis ekran, baris zamani islevsiz | **UNCHANGED** |

## 4. POLITIKA VE TOPLUM

| Eksen | Test #1 | IRONTIDE | Hukum |
|---|---|---|---|
| Reform etkisizligi | Etkiler tespit edilemiyor | Ekran kendisi itiraf ediyor: "laws do not yet feed the economy" (B-007) — durust ama bos | **UNCHANGED (durustlugu arttirilmis)** |
| Yillik ulusal reform kilidi (B-10) | 10 reform = 10 yil kuyruk | Ayni tempo ("about 12 months" satir etiketi eklendi) | **UNCHANGED (iletisimi IMPROVED)** |
| Rejim/parti katmani | (eski T#2: franchise→rejim zinciri "en iyi yeni an") | Kampanyamin en buyuk politik olayi: sessiz sosyalist devrim → Interventionism devlet sanayimi YASAKLADI, Pacifism savas durusumu degistirdi — parti politikasi GERCEK disli | **IMPROVED (mekanik) / YENI MAJOR (sunumsuzluk, B-021)** |
| Istikrar (B-09) | 60 yil 44%'te tas gibi | 15%↔79% arasinda savas/refah/kemer sikmayla oynadi | **FIXED (mekanik)**; neden dokumu bulamadim — eski testte itemize tooltip vardi deniyor → **INCONCLUSIVE (kesfedilebilirlik)** |
| Kultur/azinlik sonucsuzlugu (D-12) | 70 yil sifir sonuc | "Liberate Minorities" baris maddesi azinlik eyaletlerimi kopardi; ic uyum %77→%100 degisti | **IMPROVED** — tek ama guclu bir sonuc kanali var |
| Nufus simulasyonu | "Victoria kalitesinde ama salt-okunur" | Ayni kalite + benim kampanyamda uc buyuk donusum (aclik→refah, kapitalist sinif dogusu, kalinti-devlet sanayilesmesi) — hala salt-okunur | **UNCHANGED (iyi anlamda cekirdek, kotu anlamda etkilesim)** |

## 5. DIPLOMASI VE DUNYA

| Eksen | Test #1 | IRONTIDE | Hukum |
|---|---|---|---|
| Baris masasi | Umut verici, oyuncu tarafi kirik | Kampanyanin en iyi UI'si: skor/butce, canli kabul sinyali, isgal kurali, tazminat/azinlik maddeleri | **FIXED/IMPROVED** |
| Masada eyalet bilgisi | — | RGO/uretim gorunmuyor; petrolumu bilmeden verdim (B-023) | **YENI SORUN** |
| Diplomasi genisligi | "fiilen yok" | Hala yok: ittifak/garanti/vasal/pakt sifir (B-028); zayif devletin tek araci toprak odemek | **UNCHANGED** — kalan en buyuk tasarim bosluklarindan |
| Infamy/koalisyon (B-06) | 33 > 22 esik, koalisyon yok | Esik artik ekranda ("coalition at 22", "0/22"); Gororland 91'e cikti ve koalisyon GORMEDIM | **UNCHANGED (tetiklenme) / IMPROVED (seffaflik)** — Faz C dogrulamasi sart |
| Dunya evrimi | Canli savaslar ama sinir donmus (eski T#2) | Hegemonya el degistirdi (Corya→Yarmark 3918), super-imparatorluk dogdu, kucuk devletler dogdu, dunya ticareti 4.5× | **FIXED/IMPROVED** — dunya artik tarih uretiyor |
| Dunya haberlesmesi | — | "DISPATCH" haberleri var ama cok seyrek | **IMPROVED (embriyonik)** |

## 6. UI / SUNUM / PERFORMANS

| Eksen | Test #1 | IRONTIDE | Hukum |
|---|---|---|---|
| Ulke secimi yok (D-1) | Ayni | Ayni (B-001) | **UNCHANGED** |
| Rank 1/65 acilis yalani (D-5) | Ayni | Ayni (B-005) | **UNCHANGED** |
| Birim terminolojisi (UI-7/D-4) | provinces/hex/region kaosu | 40 provinces vs 328 hex vs "TERRITORY 257 provinces" (B-002/B-015) | **UNCHANGED** |
| Kapali dugme gerekceleri (UI-5) | 'unavailable' cirilciplak | Neredeyse her yerde gerekce var ("policy forbids state industry", "not yet invented — 1870") | **FIXED** — turun ornegi olacak kalitede |
| Kuyruk yonetimi (UI-1) | ~20 tik | ⤒▲▼⤓✕ tek tik | **FIXED** |
| 11px reform dugmesi (UI-2) | — | Reform tiklarim ilk seferde gecti | **FIXED** |
| Escape (UI-10) | Hicbir seyi kapatmiyor | Her seyi kapatiyor | **FIXED** |
| Savas ilani sunumu (UI-3) | Fabrika toast'i gibi | Kalici kirmizi banner (tek kalici bildirim) — ama baristan sonra TEMIZLENMIYOR (B-020) | **IMPROVED, yeni kusurla** |
| Olay/bildirim sistemi | (T#1'de de yoktu, adi konmamisti) | Kampanyamin 1 numarali sikayeti: borc/temerrut/rejim/arastirma sessiz (B-010/012/013/018/021) — hiz-8 artefakt payi Faz C'de ayristirilacak | **UNCHANGED ve artik EN PAHALI eksik** |
| Ham float / kozmetik (D-4) | power 14.061111... | BUILD POWER 9.9919... (B-011) | **UNCHANGED (ayni tur kusur)** |
| Gec oyun karar boslugu (D-6) | 17 belgeli bos yil | Kriz/savas noktalama sikligi artti; yine de 1857-61 ve 1900-16 fiilen kararsiz | **IMPROVED, cozulmemis** |
| Performans (D-16) | 2.9→1.15 hafta/sn (~2.5×) | 0.72→0.25→0.45 hafta/sn (~3× dip, konsolidasyonla toparlanma) | **UNCHANGED (karakter ayni)** |
| Ana menu/atmosfer | En iyi kisim | Hala en iyi kisim | **UNCHANGED (iyi)** |

## 7. OZEL ONCE/SONRA SORULARI

1. **Savas artik sinir tasiyor mu?** EVET — iki yonde de. Test #1/eski-2'nin
   "hicbir sinir kimildamadi" cagi kapanmis: ben 25 eyalet kaybettim, 1 geri
   aldim, komsularim benim eski topraklarimda somurge yonetiyor.
2. **Para artik bir sey satin aliyor mu?** Kismen. Asagi yonde tamamen
   (iflas-borc-faiz zinciri gercek); yukari yonde politika kilitleri ve
   tavanlar yuzunden zirve para yine atil.
3. **Oyuncunun basina olay geliyor mu?** MEKANIK olarak evet (devrim,
   temerrut, cullanma, azinlik kopusu) — SUNUM olarak hayir; olaylar
   yasandigini soylemiyor. Eski verdict'in istedigi "events happening to
   the player"in yarisi gelmis: olaylar var, haberciler yok.
4. **Egitim calisiyor mu?** Evet — T#1'in en net kapanan sikayeti.
5. **Gec oyun yasiyor mu?** Yari yariya. Dunya yasiyor (super-imparatorluk,
   ticaret buyumesi, benim cokusum); OYUNCUNUN gec oyunu hala ince —
   ozellikle kucuk devlet olarak arac yoklugu (ittifaksizlik) can yakiyor.
6. **Test #1'in "1880'de birakirdim"i degisti mi?** Ben 1916'ya kadar
   MERAKLA oynadim (hikayenin sonunu gormek icin) — bu gercek bir ilerleme;
   ama beni tutan sey verdigim kararlar degil, izledigim tarihti.
7. **Puan cizgisi:** T#1 7/10 (yanlis iyimser: 4 hata + eksik sink) →
   eski T#2 5/10 (dogru karamsar: "ayni takvim noktasinda oluyor") →
   **IRONTIDE 6/10** ("iyi simulasyon, sessiz oyun"). Egri artik dogru
   seyi olcuyor: cekirdek saglamlasti, kalan is iletisim + gec-oyun icerigi.

## 8. YENI TESTTE ORTAYA CIKAN (eski raporlarda olmayan) SORUNLAR

- Gorunmez el / kaydirac el koymasi (B-010 — kriz maliye YZ'sinin oyuncu
  uzerinde de calismasi; eski testler bunu hic yasamamisti cunku iflas
  edemiyorlardi. Yani bu, ODENEN bir bedelin yan etkisi).
- Gizli tazminat kalemi (B-017) — tazminat mekanigi yeni oldugundan yeni.
- Arastirma bosta-kalma dongusu (B-018) — arastirma secimi oyuncuya yeni
  gecti (eskiden YZ seciyordu), bildirimsiz devir bu dongulu dogurdu.
- "Start Offensive" kesfedilemezligi (B-025) — taarruz mekanigi yeni.
- Ozel sermaye yatirim koru artik OYUNCUNUN sorunu (B-027) — devlet
  sanayisi politikayla kapaninca YZ'nin korlugu oyuncuyu kilitliyor.

**Ozet hukum:** Test #1'in kirdigi "sonuçsuzluk" cagi bitti; IRONTIDE'da
her sey sonuclu. Simdiki savas "sessizlik"le: oyun urettigi tarihi
oyuncusuna anlatmayi ogrenmeli. (Kor rapor dondu; bu dosya onu degistirmez.)
