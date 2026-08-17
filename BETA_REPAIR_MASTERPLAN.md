# BETA REPAIR MASTERPLAN

Open beta sonrasi kurtarma ve entegrasyon gecisi. Kaynaklar:
`OPEN_BETA_FULL_CAMPAIGN_REPORT.md`, `OPEN_BETA_PLAYTEST_DIARY.md`,
`OPEN_BETA_BUGS.md` (oyuncu kaniti) + kaynak kod ve bassiz olcum
(uygulama kaniti).

Calisma kaydi: [BETA_REPAIR_LOG.md](BETA_REPAIR_LOG.md).

---

## 1. RAPOR NE DIYOR

Cekirdek hukum: **iyi bir ekonomi simulasyonu var, ama sistemler birbirini
isirmiyor.** Guclu acilis (1836-1850) kitliktan geliyor; gec oyunda butun
kisitlar cozuluyor ve karar kalmiyor.

En agir dort iddia:

| # | Iddia | Kanit (oyuncu) |
|---|---|---|
| B-02 | Ticaret hazineye dokunmuyor | Butce: `Net -824` yaninda `balance +184` |
| B-01 | Kaybedilen savas bedava | -25 savas skoru, 2 sehir isgal, beyaz baris |
| B-03 | Hazine sinirsiz, alacak sey yok | 50 -> 280,023 altin |
| — | Gec oyun karar bosluğu | 1878-1895: 17 yil, yalniz hazine degisti |

## 2. KOD NE YAPIYOR (olculdu, varsayilmadi)

### 2.1 Ticaret mimarisi — "ozel takas"

`settleGlobalTrade` (economy.js:2433). Mallari **hane ve firmalar** oder;
hazineye yalnizca **gumruk** girer. Bu tutarli bir mimaridir (Victoria
kalibi) ve rapordaki "-824" satiri devletin degil, **ozel sektorun** dis
dengesidir. UI onu `Tariffs` basligi altinda, projeksiyonun hemen ustunde
gostererek devlet parasi gibi okutuyor.

Dogrulanan iyi haberler:
- Hazine kimligi kapaniyor: `dgold = net + borclanilan - odenen + temerrut`,
  **520 hafta x 30 ulke, tek ihlal yok**.
- Hane yalnizca **odeyebildigi kadarini** talep ediyor (economy.js:1998),
  yani bedava ithalat yok.
- Dunya ticareti **tam olarak sifir toplamli**: `Simport == Sexport`
  (olculdu: 200. haftada fark 2.3e-13).

### 2.2 Asil kusur — dis acik bir KAR MERKEZI

`trade.tariffRevenue = importValue * tariff/100`, dogrudan hazineye, **karsi
kalemi olmadan**. Bagimliligin buyumesi devlet gelirini buyutuyor.

Olculdu (`audit:trade-consequence`, 520 hafta, 30 ulke):

| Grup | Ort. hazine | Ort. haftalik net |
|---|---|---|
| Ticaret acigi verenler (12) | **18,259** | **+45.5** |
| Ticaret fazlasi verenler (17) | 1,968 | +2.3 |

Acik verenler **9 kat zengin**. Ravovvik: -343/hafta dis acik, +433/hafta
butce fazlasi, gumruk gelirin **%77.8**'i.

**Kok neden:** dis pozisyonun hazine tarafinda karsiligi yok. Sifir toplamli
bir akis (net ticaret) hicbir yerde kapanmiyor.

### 2.3 Stabilite dondu cunku girdisi yok

`economy.stability = satisfactionWeighted / population` (economy.js:2030).
`satisfaction` = 0.35 + odenebilirlik*0.5 - vergi*0.28 + refah*0.14 +
reform ruh hali. **Isgal, savas yorgunlugu, issizlik girdi degil.** Beta'nin
"60 yil %44'te dondu" gozlemi tam olarak bu.

---

## 3. EN YUKSEK RISKLI ENTEGRASYON KOPUKLUKLARI

1. **Dis hesap kapanmiyor** (P0) — sifir toplamli akis hazineye ugramiyor.
2. **Baris kabulu tek yonlu** (P0) — kaybeden YZ tavizi artiriyor (iyi),
   kazanan YZ zaferi bedava geri veriyor.
3. **Savas bitirilemiyor** (P0) — YZ toprak aliyor, siyasi sonuca ceviremiyor.
4. **Stabilite girdisiz** (P1) — isgal/savas/issizlik bagli degil.
5. **Nedensellik anlatilmiyor** (P1) — "WHY THE PRICE MOVES" kalibi tek yerde.

---

## 4. IS SIRASI

- **P0-1** Dis hesap kapanisi: net ticaret hazineden gecer (sifir toplamli,
  para yaratmaz). Kabul testi: A-F senaryolari.
- **P0-2** Baris/savas skoru: kazanan bedava geri vermez; kaybeden bedel oder.
- **P0-3** Askeri stratejik YZ: bos cephe / atil ordu / suda kara birligi
  olcumu, sonra duzeltme.
- **P1-4** Stabilite girdileri (isgal, savas yorgunlugu, issizlik).
- **P1-5** Nedensellik paneli: stabilite, okuryazarlik, takviye, cephe.
- **P1-6** Gec oyun kilidi: para -> kapasite, isgal geri alinabilir.
- **P2** Teknoloji denetimi, ulke secimi, UI engelleri.

---

## 5. YENIDEN TASARIMA KAPALI SISTEMLER

Beta raporu §20 acikca korumaya aldi. **Dokunulmayacak:**

1. "WHY THE PRICE MOVES" — kalip genisletilir, bilesen degistirilmez.
2. Ticaret mal dosyasi (uretici siralamasi, tarife matematigi).
3. Dunya uretici siralamasi.
4. Seferberlik / egitim kapasitesi kisiti (2 slot, 8-12 hafta).
5. Techizat stogu zorunlulugu (`Artillery Equipment short: 4 needed`).
6. Insaat gucu darbogazi (5/hafta, +5 Construction Sector).
7. Ozel yatirimci ekonomisi ve "¤ support" dugmesi.
8. Seviye basina kar karar destegi.
9. Ust meclis ideolojik reform kapisi.
10. Kaybeden YZ'nin artan baris tavizleri.
11. Otomatik lider olusturma/atama.
12. Ana menu gorsel kimligi.

**Mutlak kural:** para ordu SATIN ALMAZ. Para *kapasite* alir (insaat
hizi, egitim altyapisi, idare, sanayi destegi). Insan gucu, techizat,
egitim suresi ve kurumlar atlanmaz.

Ayrica korunacak (onceki perf gecisleri): hedefli onbellek gecersizlemesi,
etiket onbellegi, tur dilimleme, tek rAF pompasi.
