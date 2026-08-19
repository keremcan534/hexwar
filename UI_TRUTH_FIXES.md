# UI DOGRULUK DUZELTMELERI — ekran ne soyluyorsa o olsun

Kor Beta #2'de dogrulanmis (Faz C kod incelemesiyle teyit edilmis) arayuz
yalanlari. Her satir: **oyuncu kaniti → kok neden → yeni davranis**.

Mekanik degisiklik YOK. Bu belgedeki hicbir duzeltme bir sayiyi, bir formulu
ya da bir kurali degistirmez — yalnizca ekranin **dogru soylemesini** saglar.

---

## 1. Ust bar hazinesi harcamayi gostermiyordu (B-006)

- **Kanit:** Duraklatilmisken ¤220 ile Higher Education alindi; banka ekrani
  ¤0 gosterirken ust bar bir hafta boyunca ¤220 gostermeye devam etti. Oyuncu
  "param var" sanip pahali karar alabiliyordu.
- **Kok neden:** `hud.js` olay abonelikleri arasinda `construction` yoktu.
  Yatirim/insaat kuyruklama parayi aninda dusuyor ama yalnizca
  `emit('construction')` yayiyordu; ust bar bunu duymuyordu. (Fabrika kurmak
  `economy` yaydigi icin O anında guncelleniyordu — bu yuzden hata
  "bazen oluyor" gibi gorunuyordu.)
- **Yeni:** `game.on('construction', () => this.onTurn())`.

## 2. "Projected weekly balance" gecen haftanin defteriydi (B-009)

- **Kanit:** Kaydirac oynatilinca projeksiyon kimildamiyordu; kriz aninda
  butce ayari kor ucusa donuyordu.
- **Kok neden:** Satir `ledger.net` okuyor; `updateLedger` haftada BIR kez
  calisiyor ve **gerceklesmis** gelir−giderdir. "Projected" kelimesi yanlisti.
- **Yeni:** etiket **"Last week's balance"** + alt satir *"closed accounts,
  not a forecast"*. Tahmin motoru YAZILMADI: kelimeyi dogru yapmak, yalan
  bir tahmin uretmekten iyidir.

## 3. Kaydirac rakami surukleme boyunca donuyordu (B-022 — "gorunmez tavan")

- **Kanit:** Egitim kaydiragi 40'a cekiliyor, yanindaki rakam 30'da kaliyordu.
  Testci bunu "%30'luk gizli bir tavan" sandi ve kampanya boyunca Higher
  Education seviye 2'ye ulasamadigini dusundu.
- **Kok neden:** Canli etiket guncelleyicisi olu seciciler kullaniyordu
  (`.policy-slider` / `[data-policy-value]`) — defter tasarimiyla birlikte bu
  isimler DOM'dan kalkmisti. **Tavan hicbir zaman yoktu.**
- **Yeni:** `input.closest('.ledger-mid')?.querySelector('.ledger-label b')`.
  **Gercek fareyle dogrulandi:** surukleme sirasinda etiket 45% gosterdi,
  birakinca oyun durumu 45 oldu, hafta doner donmez 45 kaldi.

## 4. Parti bantlari gorunmuyordu (B-026 / B-010'un gercek cekirdegi)

- **Kanit:** Tedarik 100'e cekilince 60'a "snapliyordu"; testci oyunun
  ayarlarini arkasindan degistirdigini sandi ("gorunmez el").
- **Kok neden:** Iktidar partisinin politikasi tarife ve iki askeri kalemi
  bir banda sikistiriyor (`fiscalPolicyLimits`) ve `applyGovernmentLimits`
  bunu her hafta yeniden uyguluyor. Bant kaydiracin `min`/`max` degerlerinde
  zaten vardi; **eksik olan gerekceydi.**
- **Yeni:** Bantli satirlarin altinda gercek parti adiyla
  **"National Conservative Party allows 25–100%"**. Tarayicida dogrulandi.
- **Not:** Ekonomi YZ'si (`runEconomicAI`) oyuncu ulkesinde CALISMIYOR
  (bassiz simulasyonla kanitlandi, Faz C). Testcinin gordugu "vergilerin
  varsayilana donmesi" kendi test surucusunun commit etmeyen sentetik
  olaylariydi; gercek olan tek mekanizma parti bandidir.

## 5. "TERRITORY provinces" aslinda hex sayiyordu (B-002)

- **Kanit:** Ust bar "40 provinces", Nation Overview "TERRITORY 257
  provinces", nufus ekrani baska bir sayi. Uc ayri birim, iki ayri isim.
- **Kok neden:** `nation.tiles` bir HEX sayacidir; uc ekran onu "provinces"
  diye basiyordu. Ust bardaki `nation.provinces` ise gercekten kume sayisidir
  (yani ust bar dogruydu).
- **Yeni:** Nation Overview, yabanci ulke dosyasi ve diplomasi listesi artik
  **hexes** diyor. Kume sayisini gosteren yerler "provinces" olarak kaldi.

## 6. Arastirma tahmini birikmis puani saymiyordu (B-018)

- **Kanit:** 693 RP birikmisken her aday teknoloji "191 hafta" diyordu.
- **Kok neden:** `technologyScreen.js` birikmis puani yalnizca **yurumekte
  olan** teknoloji icin dusuyordu. Oysa `advanceResearch` puani secimden
  ONCE toplar: banka hangi teknolojiye baslarsan ona sayilir.
- **Yeni:** tahmin her zaman `cost - research.points` uzerinden.

## 7. Savas karti barista ekranda kaliyordu (B-020)

- **Kanit:** Baristan bir yil sonra "Ulheim declared war on us!" karti hala
  asiliydi.
- **Kok neden:** WAR karti `ttl: 0` (kalici, gorulmeden gecmesin diye) ve
  hicbir kod barista onu dusurmuyordu.
- **Yeni:** `NotificationCenter.dismissKind('WAR')`, savas kalmadiginda
  `showWars()` tarafindan cagrilir. Yeni `notify-dismiss` olayi UI'da karti
  animasyonla kaldirir.

## 8. Okuryazarlik iki ekranda farkli (B-019)

- **Kanit:** Nufus ekrani %16, teknoloji ekrani %26 — ayni anda.
- **Kok neden:** Iki farkli olcu. Teknoloji ekrani **ulusal okuryazarlik
  stogunu** (`economy.literacy`, arastirmayi besleyen sayi) gosteriyor; nufus
  ekrani **secili kohortlarin sinif agirlikli ortalamasini** gosteriyor ve
  sinif carpanlari ortalama-korumadigi icin ikisi yapisal olarak asla
  esitlenemez.
- **Yeni:** Farkli seyler farkli adlar aldi — teknoloji ekraninda
  **"National literacy"** (aciklamali tooltip ile), nufus ekraninda
  **"Literate pops"**. Hesaplama DEGISMEDI: tek kavram/tek sayi ilkesi
  "ayni seye iki ad" yerine "iki seye iki ad" ile saglandi.

## 9. Istikrar dokumu yalnizca hover'da duruyordu (B-003)

- **Kanit:** Testci 80 yil boyunca istikrarin neden dustugunu bulamadi.
- **Kok neden:** `stabilityWhy()` tam ve kalemli bir dokum uretiyor — ama tek
  tuketicisi bir `title=` ozelligiydi. Dokunmatikte ve hizli oyunda hover yok.
- **Yeni:** Ust bardaki istikrar hucresi **tiklanabilir** (klavyeyle de:
  Enter/Space) ve ayni metni bir balonda acar. Tooltip ikincil yol olarak
  duruyor. Tarayicida dogrulandi:
  `Household satisfaction +53.9 / Unemployment −11.0 (5,000 without work) / = Stability 42.9%`

## 10. Otomatik kayit kendini tanitmiyordu (B-029)

- **Kanit:** 80 yillik oturumda oyuncu kaydi olmadigini sandi.
- **Kok neden:** Otomatik kayit VAR (10 turda bir) ama "autosave" kelimesi
  yalnizca **hic kayit yokken** goruluyordu; ilk kayittan sonra satir
  `Save: <seed> · week N` oluyordu.
- **Yeni:** `Autosave · <seed> · <tarih>` — kelime kaliyor, hafta yerine
  okunabilir tarih.

## 11. BUILD POWER ham float basiyordu (B-011)

`9.991984890043716/wk` → `10.0/wk`.

---

## KAPSAM DISI BIRAKILANLAR (bilincli)

- **Reform merdiveninin ekonomiye baglanmasi (B-007).** Ekranin kendi
  itirafi ("laws do not yet feed the economy") dogru; bunu baglamak MEKANIK
  bir istir ve cekirdek dondurmasinin disinda kalir.
- **Ulke secim ekrani (B-001).** Eksik oynanis, sunum hatasi degil.
- **"1-regiment Army (enemy)" etiketi (B-004).** Dogrulanmadi, dusuk etki.
- **Rank 1/65 (B-005).** Faz C'de OYUNCU YANILGISI cikti: oyuncuya kasten
  haritanin en buyuk bitisik ulkesi veriliyor. Etiket dogru.
