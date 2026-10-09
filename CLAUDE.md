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
    npm run audit:all          # bütün batarya

Son tarama (2026-10-08, eşli bağıl etki + 1 altınlık dürtü gürültüsü):
8 kaldıraç · çalışıyor 8 · gürültü altı 0 · **ölü 0**. En ince pay ekonomi
yasasının tüketim malına etkisi (sanayi ülkesinde −%10.8, eşiğin 2.16 katı).
Eğitim yasası bir önceki taramada ölüydü: okuryazarlık sabit adımla
yaklaşıyordu, şimdi oransal (TASARIM.md §8). Bataryada kalan bulgular
yeniden yazımdan ÖNCE de vardı: province boy tavanı (200×160'ta 1 province),
ülke sayısı 101 (scale, ORTA). Sınır kartopu %32-40 (eşik %33; 2026-10-08
altı tohum × 50 yıl: %39.5 → inşaat temposu + HOI4 dağıtımıyla %36.5): ordu
hex hex yürüdüğünden beri savaşlar kısa (ortanca ~20 hafta); zafer puanı
(kümenin merkez hexi) eklendi, barış masası eşikleri denendi ve ölçümde
etkisiz çıktı. Bağlayan kaldıraç küçük devletin iki-üç barışta tükenmesi.
Hex düğümlü hareket grafı: `src/world/provinceGraph.js`; kümeye oyuncu
"state" der.

Sistemlerin kod yeri: ekonomi `src/game/economy.js` + `src/game/econ/*`,
siyaset `politics.js` (+ `laws.js`, `modifiers.js`, `agenda.js`,
`decisions.js`, `eventCards.js`), kültür `culture.js` + `movements.js` +
`unification.js`, ordu `recruitment.js`/`reinforcement.js`/`battles.js`,
zafer `hegemony.js`. Ekranlar sayı üretmez; `economyView`, `governmentView`,
`constructionView`, `agendaView` gibi döküm fonksiyonlarını basar
(`src/ui/stateScreens.js`). Teknoloji/danışman/parti/olay etkileri tek
değiştirici toplamına yazılır (`modifiers.js MODIFIER_KEYS`): yeni anahtarın
okuyucusu yoksa `audit:tech-effect` yakalar.

Yeni kampanyada AUTO açık başlar (`delegation.DEFAULT_AUTO_AREAS`; diplomasi
hariç). Kayıt sürümü 24'tür; eski kayıtlar temiz reddedilir.
