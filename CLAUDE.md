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
  çevrilmeli (bkz. [VICTORIA_LITE.md](VICTORIA_LITE.md) "ev ödevi testi").

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

## Mekanik eklemeden önce

Bu depoya mekanik EKLEMEK varsayılan değildir. Yeni bir mekanik önermeden önce
[VICTORIA_LITE.md](VICTORIA_LITE.md) okunmalı; ölçüt orada. Bir mekaniğin
çalıştığı varsayılmaz, ÖLÇÜLÜR:

    npm run audit:mechanics        # her kaldıraç: çalışıyor / hissedilmiyor / ölü
    npm run audit:budget-contract  # bütçe sözleşmesi değişmezleri

İlk tarama: 26 mekanikten 10'u ölü, 5'i gürültü tabanının altındaydı. Yani bu
depoda asıl risk eksik mekanik değil, **çalışmayan mekanik**.
Son tarama: 26 mekanik · çalışıyor 24 · gürültü altı 1 · **ölü 0** · savaş
kaldıracı 1 (barış arenasında ölçülemez).

Her mekaniğin formülü, kodu, "çalışıyor mu" testi ve pratikte ne yaptığı:
[MEKANIK_KILAVUZU.md](MEKANIK_KILAVUZU.md)
(PDF: [docs/HexWar-Mekanik-Kilavuzu.pdf](docs/HexWar-Mekanik-Kilavuzu.pdf)).
