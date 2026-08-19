# ILETISIM GECISI — degisiklik defteri

**Amac:** Simulasyonun zaten urettigi sonuclari oyuncuya ANLATMAK —
simulasyonu yeniden tasarlamadan.

**Cekirdek dondurma:** ekonomi, POP mimarisi, insaat, kapasite, yuksekogretim,
devlet kapasitesi, pazar, savas cozumu, cephe, muharebe ve teknoloji
ilerlemesi **degistirilmedi**. Tek istisna P0 kilitlenme hatasidir (mekanik
degil, tikanma).

---

## FAZ 0 — TABAN CIZGI

| Olcum | Deger |
|---|---|
| `audit:all` (gecis oncesi, Faz C kosusu) | 0 KRITIK · 2 YUKSEK (fiyat-bandi, kartopu — ikisi de karakterize) |
| `audit:save` | temiz |
| `audit:determinism` | temiz |
| konsol hatasi (tarayici) | 0 (favicon 404 haric) |

> Not: Faz 0'da baslatilan takim kosusu kendi duzenlememle cakisti (yari
> duzenlenmis dosya okundu). Taban cizgi olarak birkac saat once ayni kod
> uzerinde alinmis temiz Faz C kosusu esas alindi; tam takim gecis SONUNDA
> yeniden kosuldu.

**Gecis sonrasi:** `audit:save` temiz · `audit:determinism` temiz ·
`audit:private` **0 bulgu** · `audit:events` **0 bulgu** ·
`audit:all` **0 KRITIK · 5 YUKSEK · 10 ORTA · 5 DUSUK**.

Bes YUKSEK'in tamami A/B testiyle (eski `economy.js` yerine konup denetim
yeniden kosuldu) tek tek acildi — ayrinti
`COMMUNICATION_PASS_FINAL_REPORT.md` §G:

| Bulgu | Hukum |
|---|---|
| fiyat bandi (%57.1) | belgelenmis non-target, degismedi |
| kartopu ×2 (war-pressure %37.2 · border-change %36.0-41.5) | belgelenmis non-target; war-pressure degeri %33.0'dan kaydi, border-change **iyilesti** (%41.9-46.8 → %34.2-41.5) |
| cullanma (azami 4) | `CORE_STABILIZATION_LOG.md:15`'te **onceden olculmus**; esik civari titreme (3 ↔ 4) |
| Egitim → sanayi isgucu (%2.4) | **denetimin kendi hatasi**: `Math.abs` esigi isaret koru; eski kod beklentiyi ters yonde %11.9 ihlal edip `OK` basiyordu |

Savas sayilarini P0 duzeltmesi oynatti (ozel sektor insa etmeye baslayinca YZ
sanayisi ve askeri kapasitesi buyudu); savas kodu **hic degistirilmedi** ve
dunya kartopu olmuyor — 17 uzun kosuda 0 degismez ihlali, 1040. haftada hala
27-28 canli ulke, savasan ulke orani %24.2 → %18.2 **duşuyor**.

---

## 1. OZEL SEKTOR PROJE KILITLENMESI (P0)

- **ISSUE** Durmus ozel yukseltme projeleri yeni ozel yatirim kapisini kalici
  isgal ediyor.
- **PLAYER EVIDENCE** Kor Beta #2: oyuncu ulkesi 20.→80. yil **7 tesiste
  dondu**; hazine ¤16-25k, gubre %16 karsilanmis (8× fiyat).
- **ROOT CAUSE** (a) `autoUpgradeFactory` sinirsiz UPGRADE kuyrukluyor,
  (b) `runPrivateSector` kapisi (`openPrivate >= 2`) bunlari da sayiyor,
  (c) `fundPrivateProjects` kuyruk sirasiyla fonluyor ve bastaki pahali proje
  (¤218 · haftalik sermaye ¤0.17) arkasindakileri ac birakiyor,
  (d) hedefi kaybolmus proje kuyrukta sonsuza kadar yasiyor.
- **OLD** Yedi tavan tesisi → yedi yukseltme → kapi bir daha acilmiyor.
- **NEW** Uyku hali (52 hafta fonlamasiz = `dormant`, kapiyi tutmaz), kuyruk
  tavani (6), bitmeye-kalan sirasiyla fonlama, gecersiz projelerin iadeyle
  temizlenmesi, `supportProject`in uyandirmasi.
- **FILES** `src/game/economy.js`
- **SAVE IMPACT** Yeni alanlar proje nesnesinde (`fundedTurn`, `dormant`);
  `construction` butun halinde serialize edildiginden **surum yukseltmesi
  gerekmedi**. Eski kayitta `fundedTurn` yoksa `started` kullanilir.
- **AI IMPACT** YZ'nin yatirim TERCIHI degismedi; ayni kapi YZ ulkeleri icin
  de gecerli ve dunya sanayisi 60 yilda 905 → 995 tesise cikti.
- **UI IMPACT** Yok (davranis duzeltmesi).
- **TEST** `npm run audit:private` — A-G senaryolari + 3 tohum × 60 yil +
  dunya sagligi.
- **BEFORE** C ve D senaryolari KALDI; PRIV1 6→14, PRIV2 7→25 tesis.
- **AFTER** A-G tamami GECTI; PRIV1 6→**32**, PRIV2 7→**36**; kilitli hafta
  **0**; 0 bulgu.

## 2. OLAY AGIRLIK KADEMELERI

- **ISSUE** Savas ilani ile fabrika bildirimi ayni agirlikta.
- **PLAYER EVIDENCE** Beta #1 B-UI3 ve Beta #2'nin genel "sessiz oyun" hukmu.
- **ROOT CAUSE** `NOTIFY` tablosunda onem kavrami yoktu; yalniz `ttl` ve
  `halt` vardi.
- **NEW** Her tura `tier` (0-3); `meta.tier` ile tek olay yukseltilebilir;
  tier 3 turu ne olursa olsun zamani durdurur.
- **FILES** `src/game/notifications.js`, `src/game/chronicle.js` (yeni)
- **SAVE IMPACT** Yok. **AI IMPACT** Yok.
- **UI IMPACT** Tier 2+ kartlar serif baslikli ve pirinc cerceveli.
- **TEST/AFTER** `audit:events` — yilda 0.1 ulusal olay, 0.1 duraklama.

## 3. ULUSAL OLAY SAPTAYICISI

- **ISSUE** Borc, temerrut, rejim, baskent, ordu kaybi tamamen sessiz.
- **PLAYER EVIDENCE** B-012 (¤1325 borc sessizce), B-016 (ordu iki kez sessizce
  yok oldu), B-021 (rejim degisimini fabrika menusunden ogrendi).
- **ROOT CAUSE** `settleDebt`in `borrowedGold`/`defaultedGold` alanlarinin
  hicbir UI tuketicisi yok; `killUnit` log'suz; `governmentType` okuma-aninda
  turetildigi icin "degisti" diyebilecek bir yer yok.
- **NEW** `runNationalEvents` — haftalik gecis taramasi (yalniz oyuncu):
  borc durum makinesi, rejim, baskent, ordu esikleri.
- **FILES** `src/game/events.js` (yeni), `src/game/turn.js` (tek cagri)
- **SAVE IMPACT** `nation.events` + `nation.chronicle` + `nation.opening`
  kayda eklendi (ek alan, surum yukseltmesi yok).
- **AI IMPACT** Yok — tarama yalniz oyuncu ulkesinde kosar.
- **TEST** `audit:events`, tarayici senaryolari.
- **AFTER** Borc/temerrut/ordu/rejim/baskent olaylari tarayicida dogrulandi.

## 4. TEKRAR ENGELLEME

- **ISSUE** Ayni olay tarihte tekrar tekrar.
- **EVIDENCE** Ilk olcumde "The state defaults" yuzyilda 5 kez; rejim etiketi
  **13 kez** salinim yapiyordu (yillik secimler `governmentType`i degistiriyor).
- **NEW** Uc kat fren: durum makinesi (yalniz gecis), anlamli esik
  (`minor` borc sessiz), sogutma (`156` hafta; hukumet bicimine ozel `520`).
- **AFTER** Yuzyilda ayni baslik en cok **4**; `audit:events` esikleri geciyor.

## 5. UI DOGRULUK DUZELTMELERI

Ayrintili liste: `UI_TRUTH_FIXES.md`. Ozet: HUD `construction` aboneligi ·
"Last week's balance" · olu canli-etiket seciciDusuk · parti bandi gorunurlugu ·
hex/province terminolojisi · arastirma tahmininde birikmis puan · barista
savas kartinin dusmesi · okuryazarlik adlandirmasi · tiklanabilir istikrar
dokumu · otomatik kayit gorunurlugu · BUILD POWER yuvarlanmasi.

- **FILES** `src/ui/hud.js`, `src/ui/screens.js`, `src/ui/notifications.js`,
  `src/ui/technologyScreen.js`, `src/ui/populationScreen.js`,
  `src/game/notifications.js`, `src/game/game.js` (yeni olay adi kaydi)
- **SAVE IMPACT** Yok. **AI IMPACT** Yok.

## 6. VAKAYINAME

Ayrintili: `NATIONAL_CHRONICLE_REPORT.md`. Yeni **Chronicle** sekmesi;
on yilda ~1.3 kayit; kayda giriyor; kayit sonrasi tekrar uretmiyor.

## 7. BARIS SUNUMU

- **ISSUE** Savasin nasil bittigi tek satirdi ("X imposed terms on Y").
- **NEW** `signPeace` oyuncunun tarafi icin sonucu ozetler: kac eyalet
  alindi/verildi, hangi maddeler; beyaz barista acikca soylenir.
- **FILES** `src/game/peace.js`
- **NOT** Ilk yazimda ozet `applyTerms` icine konmustu — orada `offer`
  degiskeni **yok**; kapsam hatasi fark edilip `signPeace`e tasindi.

## 8. ARASTIRMA GORUNURLUGU

- **ISSUE** Bitis karti 11 saniyede kayboluyordu, hiz 8'de fark edilmiyordu.
- **NEW** Kart **kalici** (`ttl: 0`) ama DURDURMUYOR; tahmin birikmis puani
  dusuyor.
- **FILES** `src/game/economy.js`, `src/ui/technologyScreen.js`

## 9. KAMPANYA SONU

Ayrintili: `CAMPAIGN_ENDING_REPORT.md`. `victory` olayinin ilk dinleyicisi;
oyuncunun kendi verisinden kapanis sayfasi.

- **FILES** `src/ui/endScreen.js` (yeni), `src/ui/hud.js`, `src/styles.css`

## 10. GORSEL DIL

Tek esnek kabuk, uc varyant (tier 2 / tier 3 / kampanya sonu) — hepsi mevcut
tasarim degiskenleriyle (`--surface-*`, `--gold*`, `--frame-brass`,
`--font-display`). Yeni palet, yuvarlak kose, neon, SaaS karti YOK.

- **FILES** `src/styles.css` (+264 satir)

---

## DEGISEN DOSYALAR

```
 index.html                 |   1 +      (Chronicle sekmesi)
 package.json               |   4 +-     (audit:private, audit:events)
 src/game/economy.js        | 106 ++++--  (P0 + arastirma karti)
 src/game/game.js           |   2 +-     (notify-dismiss olay adi)
 src/game/notifications.js  |  67 ++++-- (tier + dismissKind)
 src/game/peace.js          |  23 +-     (baris ozeti)
 src/game/save.js           |  16 +      (vakayiname/olay/acilis)
 src/game/turn.js           |   6 +      (haftalik tarama cagrisi)
 src/styles.css             | 264 +++++  (olay/vakayiname/kapanis dili)
 src/ui/hud.js              |  68 +++--  (abonelik, why-balonu, autosave, victory)
 src/ui/notifications.js    |  20 +-     (tier render + dismiss)
 src/ui/populationScreen.js |   6 +-     (okuryazarlik adi)
 src/ui/screens.js          |  56 ++++-- (bantlar, etiketler, vakayiname ekrani)
 src/ui/technologyScreen.js |  10 +-     (ETA + okuryazarlik adi)
 + src/game/chronicle.js    (yeni)
 + src/game/events.js       (yeni)
 + src/ui/endScreen.js      (yeni)
 + scripts/audit/private-investment-audit.mjs  (yeni)
 + scripts/audit/event-communication-audit.mjs (yeni)
```

## CEKIRDEK DOKUNULMADI

Ekonomi formulleri, POP mimarisi, insaat kapasitesi, yuksekogretim, devlet
kapasitesi, pazar fiyatlamasi, savas cozumu, cephe mimarisi, muharebe modeli,
teknoloji ilerlemesi, fetih dengesi, koalisyon esigi — **hicbiri
degistirilmedi**. Bilinen iki YUKSEK bulgu (fiyat-bandi, kartopu) bilerek
elle tutulmadi.
