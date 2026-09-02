# Open Beta 4 — oynanış testi: gerçek Chromium, gerçek fare

**Sürüm:** commit `f3f6e6b` (oynanabilirlik ve arayüz pası)
**Dünya:** 160×96 standart, 61-66 ülke · **Tohumlar:** `FABLE-1`, `NEW-1`, `IND-1`,
`UI-1`, `LONG-1`, `OB3-1836`
**Ortam:** Chromium (Playwright), 1440×900 ve 1280×720, `localhost:5173`

## Yöntem ve dürüstlük notu

Üç katman:

1. **Kendi ellerim** (`FABLE-1`, Halalnia, açılışta 1/66): bütün ekranları gezme,
   bütçe kaydıraçlarını gerçek fareyle sürükleme, araştırma seçimi, 4 yıl barış;
   ayrı bir oturumda 1836'da Irheim'e savaş, general + hedef + taarruz, elle
   yürüyüş emri, barış masası.
2. **İki kişilik ajanı**, aynı sürücüyle: *yeni oyuncu* (`NEW-1`, 6 yıl, belge
   okumadan) ve *sanayici* (`IND-1`, 22 yıl aktif + 30 yıl el sürmeden + 30 yıl
   AUTO bütçe, üç koşu yan yana).
3. **Başsız doğrulama**: her bulgu için `scripts/audit/harness.mjs` ile standart
   boyutta yeniden koşu ve kaynakta satır numarası.

Planlanan dört kişilik daha (savaşçı, arayüz eleştirmeni, yüzyıl koşusu,
politikacı) ve bağımsız doğrulama ajanları oturum limitine takıldı; o alanların
bir kısmını kendim kapattım (savaş: başsız izler; yüzyıl: başsız 65 yıl;
arayüz: 1280×720 ölçümü). **Politika/reform kolu bu testte kapsanmadı.**
Konsol hatası: dossier çökmesi dışında **0** (yaklaşık 3.500 tur).

## 1. Kısa cevap

Görünüş ve bilgi yoğunluğu gerçekten iyi: harita, tipografi, bütçe dökümleri,
"neden engellendi" cümleleri, barış masası. Ama üç şey oyunu taşımıyor:

- **Son commit dossier ekranını kırmış** (yabancı province'e sağ tık → boş panel
  + TypeError).
- **Cephe taarruzu hiçbir duruşta saldırmıyor**: 11 tümen 3 tümene karşı 30
  hafta, 0 muharebe. Savaş ancak elle sağ tıkla oluyor.
- **Ekonomi oyuncuya cevap vermiyor**: sanayici 22 yılda ¤4.300 harcayıp el
  sürmeyenden +3 GSYH ileri; el sürmeyen + AUTO bütçe ikisini de geçiyor.

## 2. Beğenilenler

- Ana menü, harita, bayraklar, muharebe çipleri (0.6K × 2.5K) — ilk bakışta okunuyor.
- Bütçe satırlarında formül (`754K people · income ¤67.2 × 35% = ¤23.5`), parti
  bandı (`Traditional Bloc allows 25–100%`), "closed accounts, not a forecast".
- Vergi sisteminin adı üç orandan türüyor (Regressive/Progressive).
- Military'de engel sebebi (`Small Arms short: 4 needed, 0.0 in stock`).
- Barış masası tek para biriminde: war score / demanded / budget; "They will
  sign this treaty." YZ kendi teklifini 🕊 çipiyle getiriyor.
- Elle yürüyüş emri çalışıyor (6 haftada hedefte); kaydıraçlar gerçek
  sürüklemeyle 7/7 tuttu (bildirim örtmediği sürece).
- Ticaret ekranındaki "Top Imports / Trade Dependency" paneli gübre sorununu
  tek bakışta gösterdi (¤133.5/¤143 ithalat).

## 3. Bulgular — BUG (hepsi kaynakta doğrulandı)

| # | Bulgu | Şiddet | Kök neden | Kanıt |
|---|---|---|---|---|
| B-1 | Yabancı province'e sağ tık → `TypeError: this.dossierIdentity is not a function`, "Foreign Power" paneli boş, her refresh'te tekrar; Declare War / Show on map o ekrandan erişilmez | **HIGH** (regresyon) | `src/ui/screens.js:485` çağrıyor; `dossierIdentity` ve `dossierFinance` aynı commit'te (`f3f6e6b`, diff 619-698) silinmiş | s2 log, `07-dossier.png`; 5 sayfa hatası |
| B-2 | Offensive hiç saldırmıyor: 11 tümen vs siperlenmiş 3, hedef seçili, taarruz açık, planlama %100, duruş 1/2/3 fark etmiyor → 30 haftada 0 muharebe; war score işgalden +19'a çıkıp donuyor | **HIGH** | `src/game/command.js` `pickOperation`: `participatingAttackPower(participants) < defense * info.risk`; katılımcı `MAX_ASSAULT_DIVISIONS=3` ile kırpılıyor (top3 = 18), savunma 16 × (1+0.35 siper) = 21.6 → Aggressive 0.9 ile bile 19.4 > 18. Sayı üstünlüğü hesaba girmiyor | başsız izler `war-trace3.mjs` (aşağıda tablo) |
| B-3 | Bildirim yığını ekranların üstünde ve tıklamayı yutuyor: Build Factory, katalog Close, bütçe kaydıraçlarının sağ yarısı, Military'nin sağ sütunu | **HIGH** | `--z-notify: 13` > `--z-screen: 9` (`styles.css:183-190`) + CRISIS/WAR/RESEARCH/HEGEMONY kartları `ttl: 0` (kalıcı); sanayici oturumunda 10 kez "obscured", iki koşu bu yüzden bitti | `industrialist/run2crash/12-crash.png`, `21-crash.png` |
| B-4 | "X researched — nothing left to research." her teknolojide (56 kez), ağaç doluyken; araştırma yine de devam ediyor | MEDIUM | `src/game/economy.js:4015-4043`: kuyruk doldurma (`nextTechFor`) `advanceResearch`'ten ÖNCE koşuyor; tamamlanma anında `research.current` null → mesaj hep "nothing left" | s2/newcomer/industrialist loglar |
| B-5 | Kalıcı kartlar hiç düşmüyor ve bayat sayı gösteriyor: "The nation has no programme" program ilanından 2 yıl sonra; 1839 kriz kartları 1865'te (borç 0 iken); seçim kartı 5 yıl | MEDIUM | `notifications.js` NOTIFY tablosu `ttl: 0`; yalnız WAR türü `dismissKind` ile kapanıyor (`hud.js:122`); program/borç için kapatma yok | `newcomer/17-year-1_MAR_1839.png`, `industrialist/baseline/05-end-budget.png` |
| B-6 | Sulphur "SEVERE SHORTAGE · 100% met · short 0.0/wk", aynı anda en büyük ihracat kalemi; başlıktaki kıtlık sayısı buna göre | MEDIUM | `src/game/tradeLedger.js:62-64`: `pinned === 'ceiling'` tek başına "severe" veriyor, karşılanma oranına bakılmıyor | `industrialist/run1/13-trade-y10.png` |
| B-7 | AUTO bütçe eğitimi %105'e çıkarıyor (kaydıraç 0-100, bant 70-100) | LOW | `src/game/economy.js` `adjustSocialAI`: `if (current < 100) social[id] = current + 10` — 95'ten 105'e, tavan yok | `industrialist/18-budget-y18-auto.png` |
| B-8 | Tank Factory (1916) 1858'de kurulabilir | LOW/MED | `factoryUnlocked`: teknoloji takvimi eziyor; Alloy Steel (1900 teknolojisi) erken-ceza ile 1858'de araştırılınca `unlock: ['TANK_FACTORY']` | `industrialist/21-crash.png` |
| B-9 | Escape province seçimini temizlemiyor → "NEXT MEANINGFUL DECISION" kartı ilk harita tıkından sonra bir daha görünmüyor | MEDIUM | `hud.js` Escape: `selectGeneral(null)`, `selectUnits([])`; `game.selected` hiç sıfırlanmıyor; `handleTap` denize tıkta bile `selected = tile` | newcomer `esc.log`, `25-own-province-after-escape.png` |
| B-10 | Fabrika kataloğu Escape'e rağmen açık kalıyor, Factories her açılışta katalogla geliyor; sekme vurgusu yanlış sekmede kalıyor | LOW | `screens.js close()` yalnız `constructionType`'ı sıfırlıyor, `industry.picker` kalıyor | `industrialist/run1/12-industry-y5.png` |
| B-11 | Barıştaki oyuncuya "Bluehill occupied; sovereignty will be decided at peace." — kimin kimi işgal ettiği yok, kendi şehri düşmüş gibi okunuyor | LOW | `src/game/game.js:490` `addLog` ulus filtresiz; metin aktör içermiyor | s2, newcomer `verify.log` |
| B-12 | Subay adları tekrarlıyor: dockta "JORUND / JORUND", "KASTOR / KASTOR" | LOW | `command.js:184-198`: `FIRST[rnd] LAST[rnd]`, teklik kontrolü yok; dock yalnız ilk adı basıyor (24 isim) | `ui720/06-command-720.png`, newcomer `21-end-of-play.png` |
| B-13 | "City-101" gibi şehir adları bildirimde | LOW | `cities.js:97` havuz 10×10=100 ad, 40 denemeden sonra sayı | s2 log |
| B-14 | 1280×720: Military sol sütununun altı (Create General, auto anahtarları) erişilemiyor (screen-body 496/496, kaydırmıyor); Population'da lejant etiketleri kırpık ("S… 36.8%"); savaş çipi tümen listesi başlığının üstüne biniyor; province paneli ekranın altından taşıyor (b=1025) | MEDIUM | `#screen-body` yüksekliği/`.mil-col` `min-height: 0` ile iç kaydırma yok | `ui720/03-military-720.png`, `04-population-720.png`, `06-command-720.png` |

Reddedilen/bug olmayan: "4 divisions selected" ile paneldeki "1-regiment Army"
çelişkisi — dört tek-alaylı tümen seçili, panel ilkini gösteriyor; sayı doğru,
anlatım eksik. "Balanced/Careful/Aggressive 1-2-3" düğmeleri modele bağlı
(`setAggression`), ölü değil; B-2 yüzünden hissedilmiyor.

### B-2'nin izi (başsız, `FABLE-1`, Irheim 13 kare · 3 tümen @132,7 Tundra)

| hafta | plan (taarruz generali) | bitişik/hazır tümenim | atkPow (top3) | savunma tahmini | muharebe |
|---|---|---|---|---|---|
| 8 | 0.18 | 5 / 5 | 17 | 16 × 1.35 = 21.6 | 0 |
| 15 | 0.70 | 7 / 6 | 17 | 21.6 | 0 |
| 19 | 1.00 | 11 / 11 | 18 | 21.6 | 0 |
| 30 | 1.00 | 11 / 11 | 18 | 21.6 | 0 |

Aynı senaryoda 12. haftada elle `game.attack` (3 tümen sığdı, 8'i "refused"):
ilk muharebe kaybedildi (T23 "Irheim won the Battle of Pellvale"), ikincisi
kazanıldı (T27), düşman 133,8'e çekildi, işgal 2 → 5 hex. Yani muharebe
sistemi çalışıyor; general onu hiç çağırmıyor.

## 4. Tasarım bulguları (sayılarla)

- **Ekonomi karara cevap vermiyor** (`IND-1`, 22 yıl, aynı tohum):
  aktif sanayici (9 devlet fabrikası + 4 yükseltme + Higher Education 4 +
  Capacity 4, ~¤4.300) GSYH 461 · skor 585 · sıra 7 — el sürmeyen 458 · 562 ·
  8 — el sürmeyen + AUTO bütçe **509 · 619 · 6**.
- **Özel sermaye 1837'den sonra hiç yatırım yapmıyor**: üç koşuda da `¤1.200`'de
  sabit 28 yıl; ilk yılda 3 tesis, sonra sıfır; 24-27 boş yuva; "Hired per
  month +0" 20 yıl.
- **AUTO bütçe üst sınıfı yok ederek kazanıyor**: üst vergi 1843'ten itibaren
  %100; üst sınıf 55K → 335 kişi (1865). Fabrika kuracak sınıf, hazinenin kendi
  YZ'si tarafından vergiyle eritiliyor.
- **Construction Capacity geri bildirimsiz para kuyusu**: 14 seviye (¤100 →
  ¤520) alınırken kuyruk 12 yıl boş; bakımı harcamanın %39'u.
- **Gümrük asıl ekonomi**: %25 tarife 1850'de gelirin %58'i (¤88/¤151); üç
  sınıf vergisi toplam ¤31.
- **El sürmeyen açılış iki kutuplu**: `FABLE-1` Halalnia 1839'da iflas (GSYH
  365 → 141, üst sınıf 48K → 15K); `OB3-1836` Vasland 6.3K altın biriktiriyor.
  Standart dünyada 10 yılda ülkelerin yarısı borçta (aşağıdaki tablo).
- **Turn 1'de her şey sıfır**: GSYH ¤0, pazar INACTIVE, bütçe 0, bütün alaylar
  BLOCKED (Small Arms stok 0), istikrar 62 → ilk hafta 41. "Review Military,
  Factories or Construction before unpausing" tavsiyesi verilemez; ilk hafta
  işletilmiş açılış daha dürüst.
- **Rehber kartı üç cümle** (barış/savaş/muharebe): temerrütteyken bile "Review
  Military…"; hegemonyanın neyden oluştuğu ve nasıl artırılacağı hiçbir yerde.
- **"Strategic imports" ve "External settlement"** en büyük gider kalemleri
  (¤49.7 ve ¤7 → ¤40/hafta) — `?` yok, kaydıraç yok, iki oyuncu da neyi
  değiştireceğini bulamadı. Army %100'de "supply 64%" neden, yazmıyor.
- **Fiyat ölçeği**: üretilmeyen mallar tavanda (Sulphur ¤48, Fertilizer ¤64,
  Explosives ¤112) diğer her şey ¤0.24-1.44; gübre ithalatı tek başına ¤133/hafta.
- **Ev ödevi testi Factories'te düşüyor**: tesis başına Upgrade/Subsidise/⋯;
  Factories'te `[data-auto]` yok (diğer beş alanda var).
- **Program ilanı tek tıkla 8 yıl**, onay yok; "CHEAP/DEAR/BOUND" ilan
  sonrası okunuyor.
- **Seçim sonrası "Policy forbids state industry"** bütün katalogda — hangi
  yasa, hangi parti, nasıl değişir yazmıyor.
- Savaş vakayinameye girmiyor (T39'da yalnız "The treasury borrows"); muharebe
  logu koordinat basıyor ("engaged at 132, 7").
- README "1945'te biter (5740. tur)" diyor, `FINAL_TURN` 1900; README "mobil
  öncelikli", CLAUDE.md "PC için".
- Gerçek saat: başsız Chromium'da 8x hızda 8 saniyede 2 hafta (tur 70-135 ms,
  5 ms dilim/kare, ~10 fps); efektif hız gösterilmiyor.

## 5. Dünya yayı (başsız, standart 160×96, el sürülmeden)

| tohum | yıl | dünya GSYH | fabrika sev. | okuryazar | altın>0 / canlı | borçlu | savaş | en büyük (hex) |
|---|---|---|---|---|---|---|---|---|
| FABLE-1 | 1841 | 11.903 | 1.747 | %31 | 57/66 | 11 | 15 | 336 |
| | 1851 | 9.775 | 2.223 | %34 | 31/65 | 50 | 22 | 336 |
| | 1861 | 10.744 | 2.813 | %36 | 28/65 | 47 | 13 | 336 |
| OB3-1836 | 1841 | 11.884 | 1.639 | %29 | 48/61 | 14 | 21 | 377 |
| | 1856 | 10.591 | 2.532 | %34 | 33/61 | 43 | 13 | 530 |
| LONG-1 | 1841 | 15.748 | 1.642 | %29 | 53/66 | 13 | 12 | 318 |
| | 1851 | 12.367 | 2.673 | %40 | 36/64 | 37 | 10 | 540 |
| | 1861 | 12.838 | 2.861 | %48 | 42/64 | 26 | 15 | 658 |

Fabrika seviyesi 25 yılda +%60-75 büyürken nominal dünya GSYH'si düşüyor ya da
yatay; 10. yılda ülkelerin yarısı borçta. `LONG_RUN_25Y_50Y_100Y.md` deflasyonu
"35. yıldan sonra" diye kaydediyor; standart boyutta GSYH tepesi 5-10. yılda,
çöküş 30-35. yılda, sonrası donmuş dünya (ekteki 65 yıllık tablo).

## 6. Yeni oyuncunun altı yılı (`NEW-1`, Yaresh) — ajan raporunun özü

Hafta 1'de dört alay + iki ulusal yatırım da Blocked; hazine T17-T55 arası ¤0
(gelir 69, gider 88, "Strategic imports" 49.7). Bütçeyi düzelten şey oyuncunun
kararı değil, YZ seçimiyle gelen Presidential Dictatorship'in orduyu %60'a
kapatması. 1838-39'da girdi olmadan sarmal: External settlement 7 → 40, ithalat
41 → 180, üst sınıf 44K → 8K, GSYH 437 → 135, Temmuz 1839'da temerrüt; 1842'de
kendi kendine toparlanma. Hegemonyanın yarış olduğunu "Leader: Vasordor 385"
yazısı çıkınca anladı; neyle yükseldiğini altı yılda öğrenemedi.

## 7. Kapsanmayanlar

Politika/reform/seçim etkileri; ikinci savaş ve YZ generalinin "All active
fronts" davranışı; kayıt-yükle; ana menüye dönüş; tooltip taraması; 1280×720'de
inşaat harita kipi ve ticaret ekranının tam gövdesi.

## 8. Düzeltmeler (bu dalda)

**B-1 — dossier.** `dossierIdentity` geri geldi (`src/ui/screens.js`); maliye
bloğu (`dossierFinance`) bilerek gelmedi, dayandığı şirket katmanı yok.
Tarayıcıda yabancı province'e gerçek sağ tık: panel 497 karakter, Declare War /
Propose Alliance / Show on map düğmeleri var, sayfa hatası 0.

**B-2 — taarruz kapısı.** `command.js` artık kendi savunma tahminini kurmuyor;
`battles.estimateBattle` muharebenin kendi terazisini (`sidePower`: bütçe,
teçhizat, arazi, siper, general, plan) zar hariç veriyor. Taraflar muharebeye
girecekleri gibi kırpılıyor (saldıran combat width, savunan yığın tavanı). Eski
tahmin savunana arazi+siperi sayıp saldırana general/plan/bütçe çarpanlarını
vermiyordu; iki hakikat ayrışmıştı (VICTORIA_LITE değişmez 2).

Aynı senaryo (`FABLE-1`, 11 tümen vs siperli 3), başsız:

| duruş | eski oran (18 / 21.6 × risk) | yeni oran (taarruz generalinin grubu) | sonuç |
|---|---|---|---|
| Careful 1.6 | 0.83 → tutar | 1.04 → tutar | muharebe yok |
| Balanced 1.2 | 0.83 → tutar | 1.04 → tutar | muharebe yok |
| Aggressive 0.9 | 0.83 → **tutar** | 1.04 → **saldırır** | 17. hafta muharebe, yığın 16 → 6 güce düşüp çekildi |

Eski terazide hiçbir duruş 0.9'u geçemiyordu; yenisinde duruş merdiveni gerçek:
denk kuvvete yalnız Aggressive dalar, Balanced üstünlük bekler. Gerçek
arayüzde (savaş ilanı, general, hedef, Offensive, duruş 3): 18. haftada
muharebe, war score +19'da donmak yerine +36, 30. haftada Irheim'den barış
teklifi.

Dünya davranışı değişti mi? Aynı denetimler düzeltme öncesi (`f3f6e6b`,
ayrı worktree) ve sonrası:

| denetim | önce | sonra |
|---|---|---|
| `audit:determinism` | — | ayrı süreçlerde determinizm TAM |
| `audit:war-outcome` | bulgu yok | bulgu yok |
| `audit:war-pressure` | çullanma azami 5 · kartopu %33.2 · ortanca savaş 33.3 hf | çullanma azami 5 · kartopu %33.3 · ortanca savaş 34.3 hf |
| `audit:military-strategy` | atıl ordu en uzun 157 hf | atıl ordu en uzun 137 hf |
| `diagnose:command` | `offensive.attackIssued: false` (kırmızı) | aynı (kırmızı) |

YZ-YZ savaşlarında ölçülebilir kayma yok; kapı yalnız denk kuvvete
Aggressive'in dalmasına izin veriyor. `diagnose:command`'ın taarruz senaryosu
düzeltmeden önce de kırmızıydı ve bu kapıyla ilgisi yok: senaryoda komşu
düşman kareleri boş (savunan 0) ama hedef ülke başka olduğu için
`pickOperation` onları eliyor, `pickFrontierTarget` ise sahipli toprağa hiç
yürümüyor. Ayrı bir iş.

## 9. Önerilen sıra

1. B-1 (tek satır: silinen metodu geri getir ya da çağrıyı kaldır).
2. B-2: `pickOperation`'da savunmayı da combat width'e kırp ya da toplam
   bitişik gücü/oranı hesaba kat; "neden saldırmıyor" cümlesini panele yaz.
3. B-3 + B-5: bildirim yığınını ekran açıkken kenara al ya da kalıcı kartlara
   koşul-bitince-kapan kuralı (`dismissKind` programa, borca, seçime).
4. B-4 (iki satırın yeri değişsin), B-6 (`coverage` önce), B-7 (clamp), B-9
   (Escape → `selected = null`), B-10 (`close()` picker'ı sıfırlasın).
5. Sonra tasarım: kapitalist yatırım kilidi (¤1.200), AUTO bütçenin üst sınıfı
   eritmesi, açılış haftası, rehber kartı.

### Beş küçük düzeltme (aynı dal, ikinci commit)

| # | değişiklik | doğrulama |
|---|---|---|
| B-4 | `economy.js`: biten teknolojiden sonra kuyruk hemen doldurulur, kart ondan sonra yazılır | `FABLE-1`, eğitim %60, 5 yıl: 5 tamamlanma, 5 "continuing with …", 0 "nothing left" |
| B-6 | `tradeLedger.js`: kıtlık yalnız karşılanma oranından; tavan fiyat tek başına "severe" vermez | tavan + %100 karşılanan + ihraç edilen Sulphur → `export surplus`; tavan + %40 → `severe` |
| B-7 | `economy.js adjustSocialAI`: sosyal harcama artışı 100'de kırpılır | AUTO bütçe + zengin hazine, eğitim 95'ten: azami 100 (önce 105) |
| B-9 | `hud.js` Escape: province seçimi de temizlenir, `select(null)` yayınlanır | tarayıcı: province tıkla → kart yok; Escape → "NEXT MEANINGFUL DECISION" geri, `game.selected` null |
| B-10 | `screens.js close()`: katalog, ⋯ menüsü ve onay sıfırlanır; seçili state korunur | tarayıcı: katalog açıkken Escape, 4 hafta, Factories tekrar → katalog kapalı, sekme vurgusu doğru |

Sonrası: `audit:determinism` bulgusuz, `audit:budget-contract` bulgusuz.
`audit:research` iki HIGH bulgu veriyor (eğitim sıfıra yapışıyor; teknolojik
ayrışma düzleşti); aynı denetim düzeltme öncesi kodda da (`f3f6e6b`) aynı iki
HIGH'ı ve fazladan bir MEDIUM'u ("araştırma hızında ayrışma yok") veriyor.
Yani ikisi de eski bulgu, bu düzeltmelerin işi değil; MEDIUM sonrasında
kayboldu (p90/p10 2.6 · 1.7 · 1.8 eşiğin üstüne çıktı).

### Bildirim yığını: B-3 ve B-5 birlikte (üçüncü commit)

Karar iki kural: **ekran açıkken yığın tek bir sayaca çekilir**, **kalıcı kart
koşulu bitince düşer**. Yığını ekrandan tümden kaldırmak ya da tıklamaya
geçirgen yapmak reddedildi: kart okunmadan kaybolur ya da yine örter.

| değişiklik | doğrulama (tarayıcı, `FABLE-1`) |
|---|---|
| `ui/notifications.js` + `styles.css`: `body.screen-open` iken kartlar gizli, sağ üstte "🔔 N" pili; üzerine gelince ya da tıklayınca kartlar altında açılır, ekran kapanınca eski yerine döner. Gizli doğan kart animasyonsuz (yükseklik 0 tuzağı). | Factories açık: kartlar `display: none`, pil "🔔 2"; Upgrade düğmesinin ortasında `elementFromPoint` düğmenin kendisi. Pile gelince kartlar `grid`, ayrılınca gizli; Escape sonrası kartlar haritada, pil yok. |
| `game/notifications.js dismissKeys` + `events.js`: borç evresi değişince önceki evrenin kriz kartı düşer (ekranda hep bugünkü evre), program ilan edilince "The nation has no programme" düşer. Anahtarlar ortak olduğu için yalnız oyuncunun kartları. | borç 3000 → `debt-critical`; borç 0 → yalnız `debt-clear`. `programme-prompt` var → Iron & Rail ilanı + 1 hafta → yok. Sayfa hatası 0. |

Kalıcı kalanlar bilerek: araştırma kartı (B-018: okunana kadar durur, artık
doğru metinle), hegemonya ve savaş ilanı (barışta zaten düşüyor).

### Kalan beş (dördüncü commit)

| # | değişiklik | doğrulama |
|---|---|---|
| B-8 | `technology.js`: araştırmayla açılan tesis/birim ancak teknolojisinin DEVRİ gelince (`yearOfTurn(turn) >= tech.year`); takvim yine üst sınır. `factoryUnlocked` ve `unitAvailable` turu geçirir. | Alloy Steel 1857'de: Tank Factory kapalı, 1916'da teknolojisiz açık; ARMOR 1857'de kapalı, 1912'de açık |
| B-11 | `game.js enterTile`: haber aktörü ve mağduru söyler ("Ravania occupies Stonemere (Yaria)"), kart yalnız oyuncunun savaşında; muharebe kartlarıyla aynı kural | 30 yıl `FABLE-1`: 269 işgal haberi, oyuncuya açılan kart 0 (hiçbirinde taraf değildi) |
| B-12 | Asıl neden ad havuzu değildi: `command.js` otomatik kadro `createGeneral`'in zaten kadroya yazdığı subayı ikinci kez push ediyordu; aynı subay listede iki kez duruyordu. Push kalktı; ayrıca kadro içinde ilk ad tekil seçilir (dock yalnız ilk adı basar) | 30 yıl, 66 ülke, 266 subay: aynı kadroda tekrar eden ilk ad 0 (önce 29) |
| B-13 | `cities.js cityName`: rastgele deneme pes edince kalan havuz sırayla taranır (RNG tüketmez), sonra ikinci havuz (Green/Stone… × ford/gate…); numara ancak 200 ad bitince | 30 yıl: 192 şehir, "City-N" 0, tekrar 0 |
| B-14 | `hud.js` ölçülen başlık yüksekliğini `--header-bottom` olarak yazar, tümen listesi ona göre yer bulur; `--sheet-max` 760px'ten alçak ekranda 50vh; `.pop-legend` 140px altına buzulmaz | 1280×720: lejantta kırpılan etiket 0/13 (önce 4); savaş çipi altı 176, liste üstü 206 (binmiyor); liste yüksekliği 31 → 132 px. Military sol sütunu zaten kendi içinde kayıyor (ölçüldü: sh 719 / ch 267), dokunulmadı |

Sonrası: `audit:determinism` ve `audit:war-outcome` bulgusuz, `audit:military-strategy`
atıl ordu 136 hafta (öncekiyle aynı bant). Subay çift kaydı YZ ülkelerini de
etkiliyordu (kadro sayısı fazla görünüyordu); ölçülebilir kayma yok.

### Tasarım bulgularının izi (beşinci commit)

**"Kapitalistler 1837'den sonra hiç kurmuyor, havuz ¤1.200'de donuyor."**
Başsız iz, `IND-1`, oyuncu ülkesi, her kapı ayrı ayrı:

| yıl | ekonomi politikası | özel kurabilir | havuz | akış/hf | tesis | kapıyı kapatan |
|---|---|---|---|---|---|---|
| 1836 | state_capitalism | evet | 0 | 0.0 | 5 | maliyet > ufuk (en ucuz 350) |
| 1838 | planned_economy | **hayır** | 1.200 | 26.8 | 8 | politika |
| 1840-1864 | planned_economy | hayır | 1.200 | 3-10 | 8 | politika |
| 1866 | planned_economy | hayır | 142 | 12.1 | 11 | politika |

Kilit değil, **politika**: 1837 seçimini kazanan Workers Party planlı
ekonomiye geçmiş; `factoryInvestmentRules` özel kurmayı kapatıyor, havuz
`politics.js` tavanına (1.200) kadar dolup duruyor. Sanayici bunu 22 yıl
boyunca ekranda göremedi: kart "Private capital ¤1.20K · +¤19.6/week" diyor,
"planlı ekonomide özel sermaye kuramaz" demiyor. Düzeltme: Factories özet
şeridi iktidarın yatırım kuralını cümleyle yazar, özel kurma yasakken akış
satırı "idle under planned economy" der, katalogdaki "Policy forbids state
industry" politikanın adını söyler. Havuz tavanı ve politika kuralı
değişmedi; bu bir iletişim düzeltmesi.

**"AUTO bütçe üst sınıfı %100 vergiyle eritiyor."** Başsız iz, `IND-1`,
1839'da bütçe devri:

| yıl | altın | haftalık | duruş | vergi alt/orta/üst | üst sınıf |
|---|---|---|---|---|---|
| 1839 | 0 | −17 | broke | 20/25/30 | 18K |
| 1842 | 803 | +35 | rich | 22/30/39 | 7K |
| 1854 | 325 | −10 | mid | 22/30/39 | 35K |
| 1857 | 35 | +6 | mid | 71/72/60 | 41K |
| 1866 | 173 | −10 | mid | 55/82/100 | 40K |

Mekanizma bir **cırcır**: `adjustFiscalAI` yalnız `broke` iken +5/hafta
yükseltir, yalnız `rich` iken (altın > 1.5 × rezerv VE haftalık > 0) −5
indirir; arada hiçbir şey yapmaz. Kısa bir iflas dalgası oranları yukarı
sürükler, "rich" eşiği nadiren tutunca geri inmez ve son commit'te YZ'nin
kendi tavanları (35/42/45) bilerek kaldırıldığı için üst oran 100'e dayanır.
Üst sınıfın 7K'ya inişi ise vergiden önce, 1839 krizinde (ihtiyaç
karşılanmayınca sınıf düşüşü). Sınıf başına YZ tavanı VICTORIA_LITE'ın
"gizli YZ tavanı yok" değişmezini bozar; seçilen çözüm iniş koşulu
(altıncı commit): `fiscalStance.easing` = altın > rezerv VE haftalık fazla >
rezervin %5'i. Histerezis duruyor (0.5 × rezervde artar, 1 × rezervde iner).
Marj şart: yalnız "haftalık > 0" ile denendi, YZ gümrük geliri yettiği için
oranları sıfıra indirip on yıl sıfır vergiyle oturdu (ölçüldü: 1845-1857
0/0/0). Aynı iz, marjlı kural:

| yıl | altın | haftalık | vergi alt/orta/üst | üst sınıf |
|---|---|---|---|---|
| 1842 | 36 | +4 | 36/65/100 | 2K |
| 1845 | 70 | +11 | 8/20/36 | 4K |
| 1851 | 66 | −3 | 12/30/54 | 15K |
| 1860 | 20 | −2 | 16/40/72 | 30K |
| 1866 | 24 | −0.4 | 12/30/54 | 41K |

Üst oran iflas dalgasında yine 100'e çıkıyor (niyet bu) ama artık geri
iniyor; 25 yıl 100'de yapışmak bitti. Dünya çapı (66 YZ ülkesi, 30 yıl, iki
tohum, ayrı worktree ile önce/sonra): ortalama vergi 86.7 → 69.3 (IND-1) ve
75.9 → 70.5 (FABLE-1); bir sınıfı ≥%90 vergileyen ülke 55 → 41 ve 46 → 43;
fabrika 1.781 → 1.515 ve 1.837 → 1.635 (devlet daha az biriktirip daha az
kuruyor, bedel bu); GSYH ve borçlu sayısı gürültü bandında. Dünyanın
üçte ikisinin hâlâ %90'a dayanması cırcırdan değil, deflasyon yüzünden
kronik iflastan: `broke` iken +5/hafta kuralı niyet gereği duruyor.
`audit:determinism`, `audit:budget` ve `audit:ai` bulguları önce/sonra aynı
sınıfta ("YZ taşıyamayacağı ordu kuruyor" 19% → 15%).

**"Sanayi kurmak ekonomiyi oynatmıyor"** büyük ölçüde yukarıdaki ikisinin
sonucu: planlı ekonomide özel kanal kapalı, devlet fabrikaları oyuncunun
elle kurduğu 9 tesis; dünya fiyatları tabanda olduğu için (deflasyon, bilinen
#1) çıktının parasal karşılığı küçük. Deflasyon `REMAINING_CORE_HIGH_ISSUES`
#1 olarak sahibinin kararıyla kapsam dışı.

### İletişim maddeleri (yedinci commit)

| madde | değişiklik | doğrulama |
|---|---|---|
| Rehber kartı üç cümleydi | `hud.js showGuidance` devletin o anki haline göre konuşur: ilk hafta / bütçe açığı / eğitim < %25 / program yok / emirsiz tümen / boş inşaat gücü / kıtlık / rutin; ikinci satır ne yapılacağını söyler | T1 "Unpause for one week…", T7 "Education is at 0%…", borçta "Spending exceeds revenue (−2/week): open Budget." |
| Hegemonya açıklamasız | Dört hücrede `title`: puanın bileşimi, sıralama, ekonomi (ham üretim × 1.2 + fabrika seviyesi, devirle ağırlık), prestij (şehir, barış ortağı, toprak) | 4 başlık |
| "Strategic imports", "External settlement" anlamsız | Bütçede kaydıraçsız her kalemin altında bir cümle (`LEDGER_NOTES`, 9 kalem) | ekranda 2 not (o hafta var olan kalemler) |
| Program tek tıkla sekiz yıl | İlk tık kartı "click again to proclaim…" yapar, ikinci tık ilan eder | 1. tık: confirming 1, program null; 2. tık: IRON_AND_RAIL |
| General neden saldırmıyor | `command.assaultOutlook` (pickOperation ile aynı terazi) → `military.assaultLine` → Military'de cümle | "Holding before Pellvale: odds 1.01 with 3 in the line against 3 dug in; Balanced needs 1.2. Raise the posture, bring artillery or wait…" |
| Savaş vakayinameye girmiyor | `diplomacy.declareWar` `announce` (tier MAJOR) | Chronicle 1836: "War declared on Irheim" |
| Muharebe logu koordinat | `battles.js` "engaged at Pellvale" | — |
| Boş kuyrukla kapasite bakımı | Construction kartında "Build power idle: nothing is queued, upkeep −¤X/week still runs" | — |
| Efektif hız gizli | `hud.showEffectiveSpeed`: on saniyelik pencerede kapanan hafta, nominalin %80'inin altına düşünce tarih altında "effective ×N" | başsız Chromium 8x: 15. saniyede "effective ×1.4" |
| README 1945 / mobil | 1900 ve PC | — |

## Ek: 65 yıllık `LONG-1` koşusu (başsız, el sürülmeden, 66 ülke)

| yıl | dünya GSYH | fabrika | seviye | nüfus (M) | okuryazar | canlı | altın>0 | borçlu | savaş | en büyük (hex) | ms/hafta |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1841 | 15.748 | 1.195 | 1.642 | 24,6 | %29 | 66 | 53 | 13 | 12 | 318 | 98 |
| 1846 | 17.825 | 1.743 | 2.518 | 24,6 | %38 | 65 | 41 | 26 | 16 | 408 | 195 |
| 1851 | 12.367 | 1.800 | 2.673 | 24,9 | %40 | 64 | 36 | 37 | 10 | 540 | 118 |
| 1861 | 12.838 | 1.881 | 2.861 | 25,2 | %48 | 64 | 42 | 26 | 15 | 658 | 94 |
| 1866 | 11.822 | 1.900 | 2.951 | 25,4 | %51 | 64 | 36 | 32 | 12 | 680 | 119 |
| 1871 | 5.659 | 1.900 | 2.953 | 26,1 | %42 | 64 | 27 | 49 | 9 | 680 | 170 |
| 1881 | 3.660 | 1.912 | 2.968 | 26,8 | %39 | 64 | 26 | 51 | 5 | 673 | 95 |
| 1891 | 4.073 | 1.912 | 2.968 | 27,6 | %43 | 64 | 31 | 46 | 4 | 673 | 100 |
| 1901 | 4.638 | 1.912 | 2.991 | 28,4 | %50 | 64 | 34 | 43 | 4 | 673 | 109 |

Okuma: dünya GSYH'si 10. yılda tepe yapıyor (17.8K), 35. yılda üçe bölünüyor
(5.7K) ve kampanya sonuna kadar orada kalıyor. **1866'dan sonra dünya donuyor**:
fabrika sayısı 1.900 → 1.912, seviye 2.951 → 2.991, en büyük ülke 680 hex'te
sabit, eşzamanlı savaş 12 → 4, 64 ülkenin 43-51'i borçta. Kampanyanın ikinci
yarısında (1866-1900) ne sanayi ne sınır ne savaş değişiyor; hegemonya puanının
%73-82'sinin sanayi olduğu dönem, sanayinin durduğu dönem. Zaman maliyeti
95-195 ms/hafta (headless, 66 ülke); `game.js` yorumundaki 30 ms küçük dünya
ölçümü.
