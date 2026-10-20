# HexWar — geliştirme notları

**PC için** hex strateji oyunu — masaüstü tarayıcı, fare ve klavye. Bağımlılık
ve derleme adımı **yok**: saf ES modülleri + Canvas2D. Bu kısıtı koru; kütüphane
eklemeden önce sor.

Hedef kitle PC olduğu için hover ile açılan tooltip meşru bir anlatım aracıdır;
dokunmatik için ayrı yol yazmaya gerek yok.

Mimari ve tasarım kararları için [README.md](README.md).

## Kurallar

- Kod ve yorumlar Türkçe. Yorum sadece "neden"i açıklar, "ne"yi değil.
- Katman sırası tek yönlü: `ui`/`render` → `game` → `world` → `core`.
  `core` ve `world` DOM'a dokunmaz (Node'da test edilebilir kalsınlar).
- Yeni arazi tipi = sadece `src/world/terrain.js`. Renk/maliyet/verim orada.
  İki ayrı geçilebilirlik var: `passable`/`moveCost` kara, `navigable`/`seaCost`
  deniz içindir. Yol bulmaya alanı `Game.canEnterFor/costFor` verir.
- Standart dünya **160×96** (yatay sarmal, hedef %36 kara). Kıtaların biçimi
  `src/world/geography.js` şablonundandır — gürültü kıtayı tanımlamaz, bozar.
  Şablona dokunduysan `npm run audit:geography` ile kanıtla (bkz.
  [docs/cografya.md](docs/cografya.md)).
- Çizimi değiştiren her şey `renderer.invalidateCache()` istemeli, yoksa uzak
  zoomda eski görüntü kalır.
- Sürekli `requestAnimationFrame` döngüsü açma; `game.requestRender()` kullan.
- Yazı tipleri yereldir: EB Garamond ("HW Display") + Source Sans 3 ("HW UI"),
  `assets/fonts/` (OFL), `src/fonts.css`. Tuvalde aile adı elle yazılmaz,
  `src/render/fonts.js` sabitleri kullanılır; yoksa harita eski fontta kalır.
- Oyuncuya birim başına iş çıkaran her özellik, `orders.js` üzerinden
  devredilebilir olmalı. Mikro yönetim, oyuncunun sahip olduğu nesne sayısıyla
  büyüyen tek maliyettir; kırk fabrikada kırk tık ise o mekanik politikaya
  çevrilmeli (bkz. [TASARIM.md](TASARIM.md) "ev ödevi testi").

## Test

`npm run dev` ile aç, tarayıcı konsolunda `window.game` üzerinden:

```js
game.newWorld('SEED');                 // standart dünya: 160x96
game.renderer.setMapMode('geography'); // siyasetsiz coğrafya önizlemesi
game.world.geo.stats;                  // kara oranı, kütleler, yarımada, boğaz
game.world.nations.map(n => [n.name, n.tiles]);
game.renderer.lastDrawn;   // son karede çizilen hex sayısı
```

Performans hedefi: kare süresi uzak zoomda < 2 ms, yakın zoomda < 5 ms.

Arayüz iki sondayla doğrulanır (konsola yapıştır ya da başsız CDP ile enjekte et):
`scripts/ui/layout-probe.js` → `__layoutProbe()` (ulaşılamayan içerik, taşma,
yan yana sütun simetrisi; 1920/1600/1366/1280'de hepsi boş olmalı) ve
`scripts/ui/jitter-probe.js` → `__jitDump()` (8x akarken kayma/açılıp kapanma).

## Mekanik eklemeden önce

Oyunun yönü **Uluslar Çağı**dır: Age of History sadeliği, HOI4'ün savaş ve
üretim omurgası, Victoria 2'nin halkları. Tasarım, formüller, sabitler ve
haftalık sıra [TASARIM.md](TASARIM.md)'dedir; yeni mekanik önermeden önce
okunmalı (ilkeler + üç test: gürültü, ev ödevi, cümle).

Bu depoya mekanik EKLEMEK varsayılan değildir. Bir mekaniğin çalıştığı
varsayılmaz, ÖLÇÜLÜR:

    npm run audit:econ         # ekonomi değişmezleri (defter, ticaret korunumu, NaN) + sağlık
    npm run audit:mechanics    # her yasa/hat kaldıracı: çalışıyor / gürültü altı / ölü
    npm run audit:tech-effect  # her değiştirici anahtarının bir okuyucusu var mı
    npm run audit:military-industry  # yedek, seferberlik, hat kullanımı, zırh/hava, tüketim malı
    npm run audit:all          # bütün batarya

**Ekonomi = TEK ÇUBUK (2026-10-15, TASARIM §1, §5-§7).** Altın, vergi,
borç, enflasyon, iflas, binalar ve inşaat kuyruğu YOK. State çıktısı
(`econ/output.js`) = el (0.6 × işçi) + sanayi (0.2 × işçi × (kalkınma−1));
`çıktı = faturalar (econ/bills.js: ikmal, okul, sıkıyönetim, tazminat; tavan
%60, aşınca ikmal krizi) + ordu (hatlar, yasa × sanayi) + halk (doyurma kolu ×
ihtiyaç; tek kol) + kalkınma` (kalan → `nation.fund` → `econ/investment.js`
kademeleri). IC_SCALE 4: sanayi birimi eski fabrika IC'sinin 4 katı.
Kalkınma tavanı `3 + 1900 sonrası teknoloji + okuryazarlık × 8` (okul bugün
fatura, yarın tavan). Demir/kereste yatakları kalkınmayla dik büyür ve
sanayi girdisi çağla azalır: ikisi olmadan geç oyunda ulusların %74'ü demir
kıtlığındaydı. Kaynak dengesi 10 yıllık audit:econ'da GÖRÜNMEZ; 160×96 × 45
yıl ölç: `node scripts/audit/resource-balance.mjs TOHUM`. Kalibrasyon sondası: `node scripts/audit/bar-probe.mjs TOHUM YIL [1]`
(1 = 160×96; kollar ortam değişkeniyle: INVEST_COST, MAT_TIMBER…).

**Halklar, irade, çözülme (2026-10-15, TASARIM §9-§11).** Kabul tek tık
çözüm değil MERDİVEN: tebaa → vatandaş → Home Rule → Dominion/Özgür Devlet
(`movements.js` talep izleri ve krizler, `nationBirth.js` bırakma; halklar
politikası Accommodate/Balance/Repress). Barışta ayrılık uçurumda (90) bekler;
savaş YORGUNLUĞU (`politics.exhaustion`) kırılma noktasını düşürür, yenilgi
barış masasında şok verir. Savaş desteği = irade, yasalar barışa dek tutulur;
Call to Arms milis (`mobilization.js LEVEE`); parti propagandası yerine
devletin rotası karesi (`politics.js COURSE`); rıza ekonomisi
(`provinces.js CONSENT`). İmparatorluklar çok halklı doğar (`world/peoples.js`,
kayıt v28). Denetimler: `npm run audit:peoples` (dünya üretimi + kampanya
halk kanalları), `npm run audit:war` (irade/yorgunluk/yasa/levée),
`audit:homeland` (ana yurt kilidi, çeşitlilik, bırakma hep açık).
Şartname ve temel ölçümler: `scripts/audit/_tmp/redesign/` (gitignore).

Kampanya boyu grafik pano (oyuncu + dünya, 160×96, ~15 dk/koşu, paralel koş):
`node scripts/audit/stats-dashboard.mjs SEED auto|noinvest|diplo`
→ `scripts/audit/_tmp/stats/*.json`; `node scripts/audit/stats-dashboard-html.mjs
[klasör] [çıktı.html] [önceki-klasör]` tek HTML'e (önce/sonra) çizer.
2026-10-14 panodan çıkan düzeltme: sanayi savaş gücüne dönüşmüyordu (ordu
insan gücüyle sınırlı, askerî IC %96-100 boş, zırh/hava alayı yok, tüketim
malı 1.8). Yedek (barışta havuzun yarısı), teçhizat ×10, boşta kalan askerî
IC halka, tüketim malı ihtiyacı 0.7 × çağ 1→2.7, 1935/1939 dünya olayları
(TASARIM §5, §8, §10, §15).

Son tarama (2026-10-08, eşli bağıl etki + 1 altınlık dürtü gürültüsü):
8 kaldıraç · çalışıyor 8 · gürültü altı 0 · **ölü 0**. En ince pay ekonomi
yasasının tüketim malına etkisi (sanayi ülkesinde −%10.8, eşiğin 2.16 katı).
Eğitim yasası bir önceki taramada ölüydü: okuryazarlık sabit adımla
yaklaşıyordu, şimdi oransal (TASARIM.md §8). Bataryada kalan bulgular
yeniden yazımdan ÖNCE de vardı: province boy tavanı (200×160'ta 1 province),
ülke sayısı 101 (scale, ORTA). Sınır kartopu %32-40 (eşik %33; 2026-10-08
altı tohum × 50 yıl: %39.5 → inşaat temposu + HOI4 dağıtımıyla %36.5; 2026-10-09 A/B BORDER1-6: kura + seferberlik bedeli + state odağı öncesi %38.3, sonrası %38.5 — tohum başına ±10 gürültü, etkisiz; 2026-10-11 denge geçişi: **%38.5 → %30.9**, birleşme hariç savaş payı %31.3 → %25.3, 50 yılda savaş 77 → 65 — bağlayan kaldıraç YZ'nin hedefin müttefiklerini yarım ağırlıkla sayması, ai.js ALLY_WEIGHT; audit:borders artık savaş payını da yazar ve eşiği ona uygular; 2026-10-11 kuşatma cezası %28.5 → %31.1, cephe sektörleri %31.1 → **%26.5**): ordu
hex hex yürüdüğünden beri savaşlar kısa (ortanca ~20 hafta); zafer puanı
(kümenin merkez hexi) eklendi, barış masası eşikleri denendi ve ölçümde
etkisiz çıktı. Bağlayan kaldıraç küçük devletin iki-üç barışta tükenmesi.
2026-10-12 1900 geçişi (45 yıllık kampanya): barışçıl birleşme kapısı ve
"barış devlet silmez" (başkent masaya gelmez) sonrası audit:borders 3 tohum ×
45 yıl: savaş payı %14-22, ulus 27→25 / 23→22 / 28→26 (önce 27→14, 23→13).
2026-10-12 donanma (kapalı deniz: düşmanın tuttuğu denize ordu binemez)
sonrası: savaş payı %18.0 / %13.8 / %19.3, ulus 27→29 / 23→24 / 28→27;
YZ çıkarması (`landings.js`) sonrası %18.0 / %17.3 / %29.3, ulus 27→26 /
23→24 / 28→29 (barışta kalan kıyı başı yeni sahiplik teması açar).
2026-10-13 (1900 yarı başlangıç tabanı, 6 tohum BORDER1-6 × 45 yıl): savaş
payı %9.0 / 22.0 / 13.1 / 17.2 / 17.0 / 26.8 (ort. %17.5); eğitim kuyruğu
insanı sipariş anında tutunca %21.2 / 29.9 / 13.1 / 11.0 / 12.8 / 30.1
(ort. %19.7, tohum farkı +12…−6: gürültü), ulus toplamı 163 → 162;
yaralı eve dönünce (`levy.DEATH_SHARE`) %10.6 / 26.8 / 13.9 / 19.4 / 15.1 /
28.6 (ort. %19.1), ulus 164.
2026-10-14 (ticaret para korunumu + kara/hava teçhizatı ×3 + biriken
şikâyet) BORDER1-3 × 50 yıl: savaş payı %7.8 / 23.6 / 13.1, ulus 27→28 /
23→28 / 28→29; ulus artışı şikâyetle tutarlı (ayrı A/B: politikasız çok
kültürlü ulus state'lerinin %46 yerine %36'sını tutuyor). Batarya temiz.
Hex düğümlü hareket grafı: `src/world/provinceGraph.js`; kümeye oyuncu
"state" der.

Sistemlerin kod yeri: ekonomi `src/game/economy.js` (sıra ve çubuk) +
`src/game/econ/*` (output, bills, investment, industry, resources, trade),
siyaset `politics.js` (+ `laws.js`, `modifiers.js`, `agenda.js`,
`decisions.js`, `eventCards.js`), kültür `culture.js` + `culturePolicy.js` (sürgün, toplama,
iskân, zorla asimilasyon) + `movements.js` + `unification.js`, ordu `recruitment.js`/`reinforcement.js`/`battles.js`,
zafer `hegemony.js`, takvim `calendar.js` (dönem = START_YEAR/END_YEAR;
başka yerde yıl ya da kampanya uzunluğu yazılmaz). Ekranlar sayı üretmez; `economyView`, `governmentView`,
`stateYield`, `agendaView` gibi döküm fonksiyonlarını basar
(`src/ui/stateScreens.js`). Teknoloji/danışman/parti/olay etkileri tek
değiştirici toplamına yazılır (`modifiers.js MODIFIER_KEYS`): yeni anahtarın
okuyucusu yoksa `audit:tech-effect` yakalar.

Yeni kampanyada AUTO açık başlar (`delegation.DEFAULT_AUTO_AREAS`; diplomasi
hariç). Kayıt sürümü 28'dir (halklar doğuşta; eski kayıtlar temiz
reddedilir, menü onları "devam et" diye sunmaz). Kayıtlar yuvalıdır:
metin IndexedDB'de, küçük dizin localStorage'da (`src/game/saveStore.js`;
kayıt 1917'de 3,7M karakter, Chrome'un localStorage tavanı ~5M). `game.save/load`
zaman uyumsuzdur ve `{ok, reason}` döner; ekran `screens.render_saves`. Donanma deniz bölgeleriyle yönetilir: `src/world/seaZones.js`
(bölümleme), `src/game/navy.js` (dağıtım, hâkimiyet, muharebe, abluka,
gemi sınıfı), `src/game/seaLanes.js` (ticaret yolları, denizaltı akını),
`src/render/seaLayer.js` (Seas kipi, M), `src/ui/navyDock.js` (panel).
