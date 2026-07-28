# HexWar — geliştirme notları

Mobil öncelikli hex strateji oyunu. Bağımlılık ve derleme adımı **yok**: saf ES
modülleri + Canvas2D. Bu kısıtı koru; kütüphane eklemeden önce sor.

Mimari ve tasarım kararları için [README.md](README.md).

## Kurallar

- Kod ve yorumlar Türkçe. Yorum sadece "neden"i açıklar, "ne"yi değil.
- Katman sırası tek yönlü: `ui`/`render` → `game` → `world` → `core`.
  `core` ve `world` DOM'a dokunmaz (Node'da test edilebilir kalsınlar).
- Yeni arazi tipi = sadece `src/world/terrain.js`. Renk/maliyet/verim orada.
  İki ayrı geçilebilirlik var: `passable`/`moveCost` kara, `navigable`/`seaCost`
  deniz içindir. Yol bulmaya alanı `Game.canEnterFor/costFor` verir.
- Çizimi değiştiren her şey `renderer.invalidateCache()` istemeli, yoksa uzak
  zoomda eski görüntü kalır.
- Sürekli `requestAnimationFrame` döngüsü açma; `game.requestRender()` kullan.
- Oyuncuya birim başına iş çıkaran her özellik, `orders.js` üzerinden
  devredilebilir olmalı. Mikro yönetim mobilde en hızlı büyüyen maliyet.

## Test

`npm run dev` ile aç, tarayıcı konsolunda `window.game` üzerinden:

```js
game.newWorld('SEED', { cols: 90, rows: 72, continentality: 0.8 });
game.world.nations.map(n => [n.name, n.tiles]);
game.renderer.lastDrawn;   // son karede çizilen hex sayısı
```

Performans hedefi (mobil): kare süresi uzak zoomda < 2 ms, yakın zoomda < 5 ms.
