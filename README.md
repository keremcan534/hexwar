# HexWar

Hex tabanlı, prosedürel dünya üreten, mobil öncelikli strateji oyunu iskeleti.
Bağımlılık yok — saf ES modülleri + Canvas2D. Derleme adımı gerekmez.

## Çalıştırma

```bash
npm run dev
```

Sonra `http://localhost:5173` adresini aç. (Herhangi bir statik sunucu da olur;
ES modülleri `file://` üzerinden çalışmaz.)

Belirli bir dünyayı paylaşmak için: `http://localhost:5173/?seed=TNGZT4`

## Kontroller

| Hareket | Mobil | Masaüstü |
| --- | --- | --- |
| Kaydır | tek parmak sürükle (bırakınca kayar) | sol tuş sürükle |
| Yakınlaş | iki parmak pinch | fare tekerleği |
| Seç | dokun | tıkla |

## Mimari

```
src/
  core/      hex.js (hex matematiği), rng.js (seed'li PRNG), noise.js (Perlin + fBm)
  world/     terrain.js (biyom tanımları), worldgen.js (harita üretimi), nations.js (ülkeler)
  render/    camera.js (dünya<->ekran), renderer.js (Canvas2D çizim + önbellek)
  input/     pointer.js (dokunmatik/fare/pinch tek katman)
  game/      game.js (her şeyi bağlayan kabuk, olay yayını)
  ui/        hud.js (DOM paneller — oyun mantığı içermez)
```

Katmanlar tek yönlü bağlıdır: `ui` ve `render`, `game`'i tanır; `world` ve `core`
hiçbir üst katmanı tanımaz. Bu yüzden harita üretimini tarayıcı olmadan da
(Node ile) çalıştırıp test edebilirsin.

### Önemli tasarım kararları

- **Hex düzeni:** sivri-tepe (pointy-top), eksenel `q,r` koordinat. Depolama
  dikdörtgen `odd-r offset` ızgara olduğu için görünür alanı taramak O(görünen).
- **Deniz seviyesi yüzdelik dilimden:** gürültünün mutlak değeri değil, sıralaması
  kullanılır. Böylece kara oranı ve biyom dağılımı her seed'de öngörülebilir kalır.
- **Çizim yalnızca gerektiğinde:** sürekli rAF döngüsü yok; `requestRender()` ile
  tetiklenir. Atalet (flick) sürerken kendini yeniler.
- **Uzak zoom önbelleği:** `zoom < 0.55` altında tüm dünya tek bir dokuya pişirilip
  tek `drawImage` ile basılır (~0.1 ms). Yakın zoomda doğrudan çizim (~1 ms).
  Dünya veya katman değişince `renderer.invalidateCache()` çağrılmalı.

## Sonraki adımlar (iskelet hazır, üstüne inşa edilecek)

- Birimler ve hareket: `terrain.moveCost` ile A* (hex mesafesi sezgiseli hazır)
- Tur döngüsü ve ülke yapay zekâsı
- Şehirler, üretim, kaynaklar (`tile.terrain.fertility` yerinde duruyor)
- Nehirler (`tile.river` alanı ayrılmış), savaş çözümü (`terrain.defense`)
- Kaydetme: seed + yapılan hamleler yeterli, harita yeniden üretilebilir
