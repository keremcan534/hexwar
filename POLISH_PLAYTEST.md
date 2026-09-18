# CİLA OYUN TESTİ — gerçek Chromium'da 24 oturum (Eylül 2026)

**Sürüm:** commit `9cfcf73` (`master` ile aynı; dal `claude/game-polish-test-fh0v8j`).
**Soru:** "Oyun epey polishlendi, oynamak ister misin?" — Oynadım. Bu belge o oyunun
kaydı: nasıl hissettirdi, nerede takıldım, hangisi kod hatası, hangisi denge.

## Yöntem ve dürüstlük notu

- Playwright + headless Chromium, 1600×900 masaüstü. Bütün eylemler oyunun kendi
  arayüzünden: sol/sağ tık, kaydıraç, sekme, portre, savaş çipi, barış masası.
  Zamanı ilerletmek için `game.endTurn()` (haftalık kapanış, UI olayları normal
  akar); tempo hissi için ayrıca gerçek zamanlı 1×/4×/8× akış.
- `src/` altına **hiç dokunulmadı**. Kod okuması yalnız "neden" sorusu için;
  her bulguda dosya:satır verilir.
- **Oturumlar:** ben 9 (tohum `PLAY-1836`, Marurstan, 431 hex, 65 ülke; ayrıca 5
  tohumluk açılış sıralaması ölçümü), *yeni oyuncu merceği* 7 (`FIRST-1836`,
  Goreshstan, 286 hex), *ekonomist merceği* 8 (`LEDGER-1836`, Kazyldor, 15 yıl).
  Planlanan beş mercek daha (savaş, UI denetimi, dayanıklılık/performans, tam
  yüzyıl, siyaset/reform) oturum limitine takıldı ve **koşmadı**; bu belge
  o alanlarda yalnız benim rastladıklarımı söyler, sistematik tarama iddia etmez.
- İki merceğin bulgularını ayrı doğrulayıcı ajanlar yerine ben doğruladım: her
  biri için ya kodda mekanizma bulundu ya da ikinci tohumda yeniden üretildi.
  Doğrulanamayanlar "gözlem" diye işaretli.
- **Konsol / sayfa hatası: 24 oturumda 0.**

## Kısa cevap: nasıl hissettirdi

Açılış gerçekten bitmiş bir ürün gibi: sahne, sis, müzik, çekmece, sonra Vic2
defterine benzeyen koyu cam ve pirinç arayüz. Bütçe defteri, barış masası,
fabrika seçici modalı, dossier'daki "we are 3.4× their strength" cümlesi,
istikrarın üç satırlık "neden" dökümü — bunlar bir strateji oyununun oyuncuya
en iyi anlattığı yerler ve burada hepsi tutarlı. 24 oturumda tek konsol hatası
çıkmaması cilanın gerçek olduğunu gösteriyor.

Asıl pürüz **ilk on dakika**. Karar kartı "Review Military, Logistics or
Construction before unpausing" diyor; bakıyorsun, her şey sıfır ya da kilitli:
GSYİH ¤0, matrah ¤0, bütün alaylar BLOCKED, kapasite "treasury short by ¤50".
Oynat'a basınca istikrar %62'den %26'ya (öbür tohumda %41'e) düşüyor ve GSYİH
ilk yıl %70 eriyor; ikisi de olay değil, başlatma ve fiyat deflasyonu — ama ekran
öyle demiyor. Yeni oyuncu "ben mi bozdum?" diye başlıyor.

Savaş tarafı iki yüzlü. Taarruz düğmesi, cephe, çizgili işgal hexleri, "won the
Battle of Garheim" kartı, düşmanın barış teklifi — akış çalışıyor ve güzel
görünüyor. Ama savaşın kendisi seyrek: 3 hexlik komşuya 20 hafta sıfır muharebe;
37 hexlik komşuya 30 haftada tek muharebe; yeni-oyuncu merceğinde 172 hexlik
komşuya 40 hafta sıfır temas. Warscore işgalle akıyor, düşman kıpırdamıyor.
Sonrası daha sert: o küçük savaş beni iki yılda temerrüde götürdü, çünkü defterin
en büyük gider satırı ("External settlement") ne olduğunu söylemiyor ve tümen
dağıtacak düğme yok. Kaldıraçları çekince kurtuluyorsun (ölçtüm), ama oyun
bunu söylemiyor. Bir de: her işgal edilen hex şöhret yazıyor; tek savaşta koalisyon
eşiğine dayandım ve komşular üstüme geldi. Fren çalışıyor, oyuncuya haber
verilmiyor.

Kısacası: kabuk çok iyi, ilk hafta ve savaş-sonrası ekonomi anlatımı geride.
Aşağıdaki listede her şey kanıtıyla.

## Bulgular

Sınıflar: **BUG** yanlış/bozuk · **UX** yanıltıcı/sürtünme · **DENGE** sayı
hissi · **CİLA** kozmetik. Durum: *doğrulandı* = kod + ekran/tekrar; *gözlem* =
tek oturumda görüldü, mekanizması aranmadı.

### A. İlk on dakika

| # | Sınıf | Bulgu | Kanıt | Kod | Durum |
|---|---|---|---|---|---|
| A1 | UX | Tur 1'de istikrar **%62 sahte**; ilk tikte gerçek değer %26 (`PLAY`) / %41 (`FIRST`). Döküm tur 1'de yok ("national stability"), tur 2'de var. Oyuncu ilk haftada 21-36 puanlık "çöküş" görüyor. | üst çubuk, `[data-why=stability]` tur 1 vs 2 | `economy.js:1185` `stability: 0.62` sabiti, breakdown null; `updateStability` ilk turda koşuyor | doğrulandı |
| A2 | UX | Tur 1'de Budget, Trade, Population, Nation Overview tamamen sıfır: "base ¤0 × 25% = ¤0.0", 43 mal INACTIVE, TAX/BUDGET/LIVING 0.00. Karar kartı bu ekranlara gönderiyor. "market clears on the next weekly tick" notu yalnız Trade'de. | ekran metinleri tur 1 | ilk `produce()` tur 1'de; dünya kurulurken ekonomi bir kez kapatılmıyor | doğrulandı |
| A3 | BUG | Başkent panelinde bütün alay düğmeleri kapalı ve tooltip **"Ordered into training; the full order book…"** diyor — sipariş yok. Gerçek sebep yalnız Military'de: "Small Arms short: 4 needed, 0.0 in stock", "Treasury short: 55 needed, 50 on hand". | `#sheet [data-buy]` title | `hud.js:888-892` sabit title, sebep taşınmıyor | doğrulandı |
| A4 | UX | Hafta 1'de hiçbir alay kurulamıyor (Small Arms stoğu 0/4, tedarik 0.01/gün); 3-4 hafta sonra açılıyor. Karar kartı "ordu kur" derken ilk günün tek askerî kararı yok. | Military BUILD sütunu tur 1 / 4 | `recruitment.js:165 canRecruit` stok şartı; açılış stoğu 0 | doğrulandı |
| A5 | UX | "NEXT MEANINGFUL DECISION" kartının barışta tek metni var ve bir yıl sonra da aynı; savaş dışında hiç değişmiyor. Üçüncü KPI kutusu boş bir kare. | `#sheet` 1836 vs 1837 | `hud.js:733-745` üç sabit cümle | doğrulandı |
| A6 | UX | Yeni dünya haritayı bütünüyle sığdırıyor; oyuncunun ülkesi hangisi vurgulanmıyor. `FIRST-1836`'da başkent sol-alttaki panelin **altında** kalıyor, yalnız etiketin ucu görünüyor. | yeni-oyuncu s1 ekranı | `game.js newWorld` → `camera.fit()`, `centerOn(capital)` yok | doğrulandı |
| A7 | DENGE | Oyuncu her dünyada "bitişik en büyük" ülkeyi alıyor: 5 tohumun 4'ünde tur 1'de **rank 1 / "You lead the world"** (A1 5/69, B2 1/68, C3 1/63, D4 1/71, E5 1/68). Ülke seçimi yok (bilinen #6) ama varsayılanın hegemon olması "tırmanma" hissini baştan alıyor. | `hegemony.scoreboard` 5 tohum | `nations.js:369 pickContiguousPlayer` | doğrulandı |

### B. Örtüşen ve kırpılan paneller

| # | Sınıf | Bulgu | Kanıt | Kod | Durum |
|---|---|---|---|---|---|
| B1 | BUG | Bildirim yığını (z 13) yönetim ekranlarının (z 9) sağ üstünü örtüyor: Factories'in **✕ düğmesi tıklanamıyor** (Playwright: "notify-stack subtree intercepts pointer events"), Politics'te MOVEMENTS sekmesi ve siyasi reform sütunu, Budget'ta gider tutarları, Population'da sağ sütunlar kartların altında. Seçimden sonra 4-5 kart normal. Esc çalışıyor. | `me4/03`, yeni-oyuncu s7/03-05 | `styles.css:180-188` `--z-notify: 13` > `--z-screen: 9`; `REMAINING_MECHANIC_DEBT.md:106` yalnız Exchange için biliyor | doğrulandı |
| B2 | BUG | Ayarlar paneli (`#settings`) başlığı ve ✕'i sekme çubuğunun altında kalıyor; "World Settings" yarı gizli, kapatma düğmesine fare ulaşmıyor (Playwright: `hud-header … intercepts pointer events`). | `me5/09-settings.png` | `styles.css:174` `--hud-top: 74px` sabit (hud.js artık yazmıyor, `trackHeaderHeight` yalnız `screen.style.top` yazıyor); `.panel` `top` (`:1470`) sekme şeridini saymıyor; z `--z-map-tools` 5 < header 12 | doğrulandı |
| B3 | CİLA | Budget'taki "?" tooltip'i panelin sol kenarında kırpılıyor: "…s pays this share of its income…". Metin çok iyi, üçte biri kayıp. Tariff'te aynı. | yeni-oyuncu s7/clip-02 | `styles.css:1233-1240` `left:50%` + `translate(-50%)`, kenar kontrolü yok | doğrulandı |
| B4 | CİLA | Technology ekranının başlığı **"—"**. | `me1/12` | `screens.js:85 TITLES` tablosunda `technology` yok | doğrulandı |
| B5 | CİLA | Fabrika seçici modalı satın alma sonrası açık kalıyor; ekran kapatılıp haftalar sonra açılınca aynı state'in modalı hâlâ üstte. | ekonomist s4 | `screens.js` `industryPicker` kapanışta/satın almada sıfırlanmıyor | gözlem (kod tutarlı) |
| B6 | CİLA | New Campaign çekmecesi açılırken başlığın 23 px üstünde hayalet bir "New Campaign" (şeridin hover etiketi çekmecenin içinden görünüyor). "LAND RATIO 0.00" yeni oyuncuya "kara yok" gibi okunuyor. | yeni-oyuncu s1/clip-00 | `styles.css:6468` `.menu.drawer-open .menu-item:hover { z-index: 3 }` | doğrulandı |
| B7 | CİLA | Yakın zoom politik harita düz tek renk; province adları çok soluk, şehir adı minicik. Uzak zoom ve terrain/resources kipleri ise çok iyi. | `me5/07-near-zoom.png` | — | gözlem |

### C. Savaş ve barış anlatımı

| # | Sınıf | Bulgu | Kanıt | Kod | Durum |
|---|---|---|---|---|---|
| C1 | BUG | **Vakayiname savaşı, muharebeyi ve barışı yazmıyor.** Ekran "Wars, treaties … are written here" diyor; savaş + ilhak + koalisyondan sonra listede yalnız rejim değişikliği ve "The treasury borrows" var. | `me3`, `me6`, `me7` Chronicle | `diplomacy.js:221`, `:290`, `peace.js:771` `addLog` kullanıyor; vakayinameye yalnız `chronicle.js:58 announce()` yazıyor | doğrulandı |
| C2 | BUG | Barış kartı tek karta birleşiyor: aynı anlaşma için iki PEACE (rozet 2), ikinci barış eski kartın başlığında kalıyor ("Peace with Draya ×4" — Quenuresh barışından sonra). Yeni oyuncu yanlış ülkeyle barış yaptım sanıyor. | benim "🕊 2 PEACE Peace with Turalland"; yeni-oyuncu s6 | `peace.js:769` key yok (key = kind); `diplomacy.js:290` aynı anlaşma için ikinci push; `notifications.js:76-88` birleştirme eski başlığı tutuyor | doğrulandı |
| C3 | BUG | "**1 provinces annexed**" çoğul hatası. | barış kartı | `peace.js:764` | doğrulandı |
| C4 | BUG | 16 haftalık asgari savaş süresi yalnız dossier/panel düğmesinde ("Peace Talks (16w)" kapalı); **savaş çipi 1. haftada beyaz barış imzalatıyor**. | yeni-oyuncu s6/00-01 | `hud.js:134-137` çip → `openPeaceTalks` (MIN_WAR_TURNS yok); `peace.js:719 signPeace` süre kapısı yok; kilit `screens.js:509`, `hud.js:917` | doğrulandı |
| C5 | UX | Savaş hedefi (WAR GOAL) ilan anında sessizce seçiliyor; oyuncu onu ilk kez barış masasında görüyor ve taarruz onu hedeflemiyor ("not occupied yet" savaş boyu). | yeni-oyuncu s5 | `game.js:685 suggestWarGoal` sessiz; `screens.js render_peace goalBand` | doğrulandı |
| C6 | UX | **İşgal şöhret yazıyor, ekran yazmıyor.** Vasesh savaşında (37 hex) barış imzalamadan şöhret 0→20.5, ilhakla 24.2 > eşik 22 → "Quenurgrad/Loralland joined a coalition against us" + savaş ilanı. Dossier metni "declaring war costs infamy for every province you **take**". | `me6`, `me7` | `turn.js:355` her işgal edilen hex `tileInfamy` (+0.5/+1, şehir +6); `turn.js:287` ilhak | doğrulandı |
| C7 | DENGE | Savaşlar boş: Turalland (3 hex) 20 hafta **0 muharebe**, warscore +40'ta sabit; Vasesh (37 hex) 30 haftada 1 muharebe; yeni-oyuncu: Quenuresh (172 hex, 7 tümen) 40 hafta 0 muharebe, düşman üç hexte hiç kıpırdamadı, warscore yalnız işgalden. OB3 W-1 ile uyumlu ama "40 haftada sıfır temas" bir adım ötesi. | üç oturum | `ai.js` savunan cephe mantığı; `command.js` hedef seçimi (README: dost kenarı çok, düşman kenarı az province) — düşman yığınına saldırı gerekmiyor | gözlem (tekrarlı) |
| C8 | UX | Teklif varken savaş çipi masayı değil Diplomacy ekranını açıyor; kart "their war score -69 · **costs you -44**" diyor (negatif = kazanç). Altında 60 ülkelik "Declare War" listesi. | `me6/08-peace.png` | `screens.js:714 peaceOfferCard` `offerCost` işaretsiz basılıyor | doğrulandı |
| C9 | BUG | Barış imzalandıktan sonra açık province paneli "AT WAR · Offer Peace · occupied by…" göstermeye devam ediyor; iki hafta sonra Military'de generaller hâlâ "advancing · facing Quenuresh" (ateşkes varken). | yeni-oyuncu s6 | `screens.js:2454-2466` imza `turn` yayıyor ama seçili kare yeniden çizilmiyor; `makePeace` komuta durumunu temizlemiyor | gözlem (kod tutarlı) |
| C10 | UX | Müttefikin savaşa girişi sebepsiz: "Turalland declared war on us!" (3 hexlik ülke, Vasesh'in müttefiki). Kartta "joins on Vasesh's side" yok. | `me4` | `diplomacy.js:221-223` tek cümle; ittifak çağrısı ayrımı yok | doğrulandı |
| C11 | CİLA | Muharebe kartı ham koordinat: "Marurstan engaged at 53, 7." (bilinen #10). Kazanılan muharebe kartı ise adlı ve güzel ("won the Battle of Garheim"). | `me6` | `battles.js:184` | doğrulandı |

### D. Ekonomi

| # | Sınıf | Bulgu | Kanıt | Kod | Durum |
|---|---|---|---|---|---|
| D1 | DENGE | **Üst çubuk GSYİH'si ilk yıl %70 eriyor** (739→205 `PLAY`, 494→146 `LEDGER`) ve bir daha anlam taşımıyor. Ekonomist ölçtü: taban fiyatla gerçek üretim 407→449 (düz); erime tamamen hammadde deflasyonu (tahıl ¤2→¤0.24, demir ¤5→¤0.60, kömür ¤4→¤0.48 = 0.12× taban). Fiyat güncellemesi geri dönüşsüz çarpımsal yürüyüş: kalıcı işaret → ray. 105. haftada 15 mal tabanda, 10 tavanda, 9'u hiç alınıp satılmadığı için tam 1.00×'te. Konserve ¤48 (8×) iken dünya arzı talebin yalnız %2.6 altında. | ekonomist s1/s5; benim `me2` | `economy.js:3716-3721` (`PRICE_SPEED` 0.09, band 0.12-8, reversiyon yok); `:4068` gdp cari fiyatla | doğrulandı |
| D2 | UX | **"External settlement" defterin en büyük gider satırı olabiliyor ve hiçbir yerde ne olduğu yazmıyor.** '?' yok, kaldıracı yok; işaretine göre yıl yıl Revenue ↔ Spending sütunu değiştiriyor (+8 hafta 2'de gelir, −85 üç yıl sonra gider). | `me8` defter izi; ekonomist Dec 1838 (¤32.4, en büyük satır) | `economy.js:543` `EXTERNAL_SETTLEMENT = 0.25`, `:3579` `trade.balance × 0.25`; `treasury.js:30` kind 'income' | doğrulandı |
| D3 | DENGE | **Küçük bir savaş → iki yılda temerrüt, hiçbir şey yapmazsan.** Defter izi (`PLAY-1836`): hafta 2 +60/hf; savaş sonu −19 (borç 341); +1y −25 (borç 1290; idare 18→30, tek province + şehir ilhakı); +2y −60, borç 1979, faiz %20.5, **"The state defaults"**; ordu %25'e çekilince bile −46 (dış hesap −85). Kurtarma mümkün: barıştan hemen sonra tarife %100 + vergi %100 + ordu %25 → +1y +114/hf, borç 0; +3y +173/hf; bedeli istikrar %22. Yani OB3 E-1 iki kutbu: kaydıraçları çeken absürt zengin, çekmeyen ölü; arada bant yok ve defter "ne yapayım" demiyor. | `me8`, `me9` | `treasury.js` borç/temerrüt; kaynak D2 + tedarik + idare | doğrulandı |
| D4 | UX | **Oyuncunun tümen dağıtma düğmesi yok.** `disband()` var ama yalnız yapay zekâ ve AUTO devri kullanıyor ("disbands regiments if the treasury defaults in peacetime"). Barışta 16 tümenin bakımından kurtulmanın tek yolu AUTO'yu açmak. VICTORIA_LITE "YZ ile oyuncu aynı kapıdan geçer" değişmeziyle çelişiyor. | Military/panel: düğme yok | `recruitment.js:270 disband`; `ai.js:294`; `delegation.js:57` | doğrulandı |
| D5 | DENGE | **Üst sınıf barışta eriyor, özel sermaye bu yüzden ¤0.** Lüks mallar tavanda ve %0 karşılanıyor → `canAffordNeeds` 1. haftadan false → her 4 haftada 1.000 kişi alt sınıfa. İki tohumda ölçtüm: `LEDGER` 47K→36K→23K→10K (3 yıl, 593 kişi 1846'da), `PLAY` 60K→50K→37K→25K. Sonuç: "private capital ¤0.0" yıllarca, özel projeler ("Steel Mill started by private investors") 15 yıl ¤2/213'te uyuyor, Exchange'de kendi havuzuna satış imkânsız. Bildirim yok, sayım sessizce "Other"a katlıyor. | `verify1.log`, ekonomist s1/s4 | `economy.js:1083-1101 runPopulationMobility` (taban yok, `POPULATION_COHORT` 1000); ihtiyaç sepeti tavan fiyatla | doğrulandı |
| D6 | BUG | Factories başlığı "upgrades by private capital, **then treasury**" vaat ediyor; kod hiç hazineye düşmüyor (`actor = privateExpand ? 'private' : stateExpand ? 'state' : null`). Ekonomist ¤3.000 enjekte edip 26 hafta bekledi: inşaat/destek satırı 0.0, Steel Mill ¤2/213 DORMANT. Elle "¤ support" çalışıyor (tık = çeyrek, shift = hazine yettiği kadar, tam ¤0'a). | ekonomist s8 | `screens.js:1036` metin; `economy.js:2154` actor; `:2188-2215 fundPrivateProjects` yalnız şirket kasası + özel sermaye | doğrulandı |
| D7 | UX | Aralık 1836 seçimi → Interventionism → fabrika seçicideki **her kart "policy forbids state industry"**; '+' tooltip'i hâlâ "24 types available" diyor; ekran salt-okunura döndüğünü söylemiyor. Sonra hazine şişiyor (`LEDGER` ¤805 → ¤3.745 → ¤7.018; `PLAY` ¤1.219 3. yılda) ve tek yatırım Exchange (%33-40 yıllık getiri). Higher Education'ın etkisi (+%6/seviye işe alım) hiçbir ekranda görünmüyor. | ekonomist s4/s6; benim `me4` | `politics.js:180 stateBuild`; `screens.js:1133` | doğrulandı |
| D8 | UX | Fabrika seçicideki "+X/level" tahmini bugünkü rayına yapışık fiyatın anlık görüntüsü, iki yönde 4× yanlış: aynı Paper Mill +8.8 → +18.4 → +40.4 → +55.9 (bir yıl), gerçek kazanç ¤0.16/hf; Cement Works +9.6 tahmin, gerçek ¤37/seviye. Oyuncu fabrikayı bu sayıyla seçiyor. | ekonomist s4 | `screens.js:1144 factoryMargin` cari fiyat, kendi arz etkisi yok | gözlem (kod tutarlı) |
| D9 | CİLA | Budget vergi notu tutmuyor: "base ¤134 × 25% = ¤31.5" (`LEDGER`), "base ¤130 × 25% = ¤31.9" (`PLAY`). Progressive yapı sınıfları 0.45/0.95/1.85 ile ağırlıklıyor; "× 25%" bir etiket, çarpan değil. Aynı ekranda negatif tarifede "imported goods cost **+-15%**". | `verify1.log` | `screens.js:1682`, `:1687`; `economy.js:1633 TAX_STRUCTURES` | doğrulandı |
| D10 | UX | "WHY THE PRICE MOVES" yüzdesi fark ÷ (arz + talep): "demand outruns supply by 41%" derken aynı panelde arz 80 / talep 191 (talep arzın %139 üstünde). Domestic satırı başka kural kullanıyor. | ekonomist s5 | `tradeLedger.js:275-288` | doğrulandı |
| D11 | UX | Exchange "Sell 1%" ev sahibi ülkenin özel sermaye havuzu boşken sessizce başarısız: düğme açık, hazine değişmiyor, yalnız günlüğe kısa bir DISPATCH. Alım, temettü ("Company dividends 3.3" Budget'ta) ve başarılı satış çalışıyor. | ekonomist s5/s8 | `screens.js:2179-2188` null → yalnız `addLog`, düğme kapatılmıyor; `companies.js:460-465` | doğrulandı |
| D12 | UX | İnşaat kuyruğu: oyuncunun Construction Capacity yatırımı özel sektörün 5 projesinin **arkasına** giriyor (6. sıra, ~45 hafta). ⤒ ile öne alınabiliyor ama varsayılan sürpriz. | `me4/00` | `construction.js queueInvestment` sona ekliyor | doğrulandı |
| D13 | DENGE | Eğitim %100 okuryazarlığı bir yılda %3.8 → %33.1'e çıkarıyor (hedef %70); diğer bütün kaydıraçlar 52 haftada ölçülür ve yönü doğru etki verdi (vergi 0/100 → istikrar +4/−11, gelir −19/+42; refah 100 → istikrar +18, ¤72/hf). Yalnız eğitimin ilk yıl sıçraması ölçek dışı. | ekonomist s2 | `economy.js:3908 literacyTargetOf` 0.08 + okul × 0.62 | gözlem (kod tutarlı) |
| D14 | UX | Piyade "8w" yazıyor, kuyrukta 11 hafta; sebep "supply index 34%" ama %34'ün nereden geldiği hiçbir ekranda yok. | `me4` Military | `recruitment.js` eğitim süresi × bütçe/ikmal | gözlem |

### E. Siyaset, araştırma, bildirim

| # | Sınıf | Bulgu | Kanıt | Kod | Durum |
|---|---|---|---|---|---|
| E1 | UX | **Seçmensiz seçim rejim değiştiriyor.** Politics ekranı aynı anda "No Voting · 0 enrolled · HOLD ELECTION kapalı ('There is no electorate: no election can be held under the current franchise')" diyor; zamanlanmış seçim yine de oluyor: "Absolute Monarchy → Presidential Dictatorship under the Workers Party (39%)" (`PLAY`), "Labour Union 36%" (`FIRST`), "Social Democratic Party 37%" (`LEDGER`) — üç tohumda üçü de 1836 Aralık'ta sosyalist. Sonucu gerçek: ekonomi politikası → Interventionism → fabrika kurmak yasak (D7), mali tavanlar değişiyor. Bilinen "sarkaç" #4'ün daha sert hâli: mesele etiket değil, oyuncunun hiç dahil olmadığı bir seçimle elinden alınan araç. | üç tohum | `politics.js:333-334` `runPolitics` → `resolveElection` yalnız `nextElectionTurn`e bakıyor, seçmen kütüğü şartı yok; `governmentType` iktidar ideolojisinden | doğrulandı |
| E2 | UX | "X researched — **nothing left to research.**" program aktifken bile çıkıyor (Basic Mechanization, Early Railways); ertesi hafta program yeni teknoloji seçiyor. | `me3`, `me4`, `me6` | `economy.js:3825` `nation.research.current` o an null | doğrulandı |
| E3 | BUG | "The nation has no programme" kartı (kalıcı) program ilan edilince silinmiyor; "Iron & Rail proclaimed" ile yan yana yıllarca duruyor. | `me4` | `events.js:203` key `programme-prompt`; `screens.js:2349` key `programme`; `dismissKey` yok | doğrulandı |
| E4 | UX | "The treasury borrows — Debt ¤264 · weekly ¤-20" kalıcı kartı aylarca aynı sayılarla duruyor; gerçek borç ¤1.979'a çıkmışken kart ¤264 diyor. | `me6`/`me7`; yeni-oyuncu s6 | `events.js:100-106` ttl 0, `throttled`, metin sabit | doğrulandı |
| E5 | BUG | Nation Overview "CLASS TAXES 0% / 0% / 0%" derken Budget 25% (35/28/13) gösteriyor. | yeni-oyuncu s7 | `screens.js:820` `me.economy?.taxes` artık yazılmıyor | doğrulandı |
| E6 | CİLA | Politics başlığındaki iki ikonlu sayı ("☁ 0%", "👥 3.8/4.5") etiketsiz; tooltip yok. | `me1/10` | `politicsScreen.js:81-` | gözlem |

## Beğendiklerim (gerçekten)

- **Ana menü**: sekiz sahne, iki katmanlı sis, çekmece, müzik anahtarı — açılış
  bir grand strategy açılışı gibi ağır ve temiz.
- **Bütçe defteri**: tek bakiye, "Last week's balance — closed accounts, not a
  forecast", her kaydıraçta düz cümle tooltip, canlı yüzde. Ekonomist 780 hafta
  boyunca `Unreconciled` satırını hiç görmedi; Budget ¤20.9 = Population TAX ¤20.9
  = ledger.tax. Muhasebe tutuyor.
- **Barış masası**: savaş hedefi bandı, bedel/bütçe sayacı, "They will sign this
  treaty" / "They will not cede an inch", listeden ekleme, Terms sekmesinde her
  şartın tek cümlelik açıklaması ve kapalıysa nedeni. Oyunun en iyi anlatılmış
  yeri.
- **Fabrika seçici modalı**: ikon, girdi/çıktı, "treasury short by ¤10", "not yet
  invented — available from 1850". Modal açık kalıp peş peşe kurmaya izin
  vermesi doğru karar.
- **Dossier**: "we are 3.4× their strength" renkli, "Peace Talks (16w)" sayaçlı.
- **Muharebe görseli**: 2.9K vs 1.0K rozeti, çizgili işgal hexleri, cephe
  vurguları, adlı zafer kartı.
- **İstikrar dökümü**: tıkla → üç satır, toplam eşit.
- **Harita kipleri**: terrain ve resources (14 kaynaklı, tablodan üretilen
  lejand) çok okunaklı.
- **Exchange döngüsü**: al → ertesi hafta Budget'ta "Company dividends" → sat.
- **Sıfır konsol hatası**, 24 oturum, 3 farklı tohum ailesi, 15 yıla kadar.

## Önerdiğim sıra (dokunmadım; karar senin)

1. **İlk tik** — dünya kurulurken ekonomiyi bir kez kapat (ya da tur 1'de
   sayıları gizle) ve `stability: 0.62` sabitini gerçek dökümle değiştir (A1, A2).
2. **Katman sırası** — `--z-notify` ekranların altına insin ya da yığın ekran
   açıkken sola/aşağı kaysın; ayarlar paneli `--hud-top`'u hesaba katsın (B1, B2).
3. **Vakayiname** — savaş ilanı, barış ve büyük muharebe `announce()` üzerinden
   yazılsın; barış kartına ülke anahtarı (C1, C2, C3).
4. **Defter cümlesi** — "External settlement" satırına '?' ve tek cümle; tümen
   dağıtma düğmesi (ya da AUTO kapalıyken de temerrütte dağıtma) (D2, D4).
5. **Dürüst düğmeler** — alay tooltip'ine gerçek sebep; savaş çipine
   MIN_WAR_TURNS kilidi; "costs you −44" → "worth 44 to you" (A3, C4, C8).
6. **Seçim** — seçmen yokken seçim ya olmasın ya "saray hizbi değişti" diye
   anlatılsın; fabrika kilidi bir kartla duyurulsun (E1, D7).
7. Denge işleri (fiyat rayları, üst sınıf erimesi, boş savaş, işgal şöhreti)
   ayrı bir ölçüm turu ister; burada yalnız sayıları bıraktım (D1, D5, C6, C7).

## Ek: oturumlar

| Oturum | Tohum | Ne yapıldı |
|---|---|---|
| me1-2 | PLAY-1836 | açılış, 11 ekran, başkent, bütçe kaydıraçları, 1 yıl |
| me3 | PLAY-1836 | Turalland'a savaş (3 hex), 24 hafta, barış masası, ilhak |
| me4 | PLAY-1836 | kapasite yatırımı, program, araştırma, fabrika, 3 yıl, savaş |
| me5 | PLAY-1836 | harita kipleri, katman menüsü, tooltip, ayarlar, gerçek zaman |
| me6 | PLAY-1836 | Vasesh'e taarruzlu savaş, muharebeler, düşman teklifi, koalisyon |
| me7 | PLAY-1836 | teklifi kabul, ilhak sonrası, 3 yıl, temerrüt |
| me8-9 | PLAY-1836 | defter izi (budgetBreakdown), kurtarma deneyi |
| ranks | A1..E5 | açılış sıralaması, 5 tohum |
| verify1 | LEDGER, PLAY | üst sınıf erimesi, vergi notu |
| newcomer s1-s7 | FIRST-1836 | menü, ilk bakış, gerçek zaman, savaş, beyaz barış |
| economist s1-s8 | LEDGER-1836 | GSYİH, kaydıraç A/B, fabrikalar, Exchange, 15 yıl |

Sürücü (Playwright harness, `PLAYER_GUIDE.md`) oturumun geçici dizininde; depoya
alınmadı çünkü Playwright bağımlılığı ister — istenirse `scripts/playtest/`
altına konur.
