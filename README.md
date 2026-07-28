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

Kendi birimine dokun → gidebileceği kareler beyazla işaretlenir → hedefe dokun.
Bitişik düşmana dokunmak saldırıdır. Birim durduğu kareyi ülkesine katar.
Alttaki **Turu Bitir** ile yapay zekâ oynar, sonra hareket hakları yenilenir.

### Mikro yönetimden kaçış

Geç oyunda 10-15 birimi her tur tek tek dolaştırmak turu dakikalara çıkarıyordu.
Üç mekanizma bunu çözer:

- **Sıradaki (n)** düğmesi: emri olmayan ve hakkı kalan bir sonraki birime atlar,
  kamerayı oraya taşır. Sayaç sıfırsa o tur bitmiştir.
- **Menzil dışına dokunma** = "oraya yürü" emri. Birim kaç tur sürerse sürsün
  kendi gider; varınca emir düşer, yol üç tur tıkanırsa iptal olur.
- **Otomatik** emri: birimi yapay zekâya devreder — YZ'nin kendi birim rutininin
  aynısını kullanır. **Bekle** emri birimi sıradaki döngüsünden çıkarır.

Emirli birimler haritada soluk çizilir ve rozet taşır (⚙ otomatik, → yolda,
⏸ bekliyor).

## Mimari

```
src/
  core/      hex.js (hex matematiği), rng.js (seed'li PRNG), noise.js (Perlin + fBm),
             pathfind.js (Dijkstra menzil + A*)
  world/     terrain.js (biyom tanımları), worldgen.js (harita üretimi), nations.js (ülkeler)
  render/    camera.js (dünya<->ekran), renderer.js (Canvas2D çizim + önbellek)
  input/     pointer.js (dokunmatik/fare/pinch tek katman)
  game/      game.js (kabuk + eylemler), units.js (birim tipleri, savaş),
             cities.js (şehirler + ekonomi), diplomacy.js (savaş/barış),
             orders.js (sürekli emirler), turn.js (tur döngüsü), ai.js (ülke YZ'si)
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

### Oyun döngüsü

Oyuncu 0. ülkeyi yönetir. Her tur: birimleri hareket ettir/saldır, şehirde birim
satın al → **Turu Bitir** → yapay zekâ tüm ülkeler için oynar → hareket hakları
yenilenir → gelir toplanır. Şehri ve birimi kalmayan ülke elenir, toprakları
sahipsizleşir.

Savaş: saldıran ve savunan aynı anda hasar alır; savunan arazi ve şehir surları
bonusundan yararlanır (piyade arazi bonusunu iki katı kullanır). Savunan ölürse
saldıran kareye ilerler. Saldırı turun kalan hareketini tüketir.

Diplomasi: oyun **herkes barış içinde** başlar. Barıştaki komşunun toprağına
girilmez, birimine saldırılmaz, karesi alınamaz — sınırlar ancak savaş ilanıyla
aşılır. Savaş açıldıktan sonra en az 8 tur barış görüşülemez; teklif edilince
karşı taraf reddedebilir (güçlüyse ve tek cephesi varsa reddeder). YZ yalnız
temas hâlindeki ve kendinden zayıf komşuya, en fazla iki cephe olacak şekilde
savaş açar; kaybettiği savaştan çıkmaya çalışır.

Deniz: kara birimi kıyıdan denize girince **bindirilmiş** olur — hızı 4'e sabitlenir,
saldıramaz, savunmada 1.6 kat hasar alır. Karaya çıkınca normale döner. Savaş gemisi
yalnızca kıyı şehrinde üretilir, karaya çıkamaz ama bitişik kara birimini vurabilir
(öldürse de kareye ilerlemez). Açık deniz iki kat pahalıdır, kıyı boyu seyretmek ucuz.

Ekonomi: şehirler gelirin ana kaynağı, toprak verimi ikincil. Her birim tur başına
**2 altın bakım** ister; hazine eksiye düşerse birimler dağılır. İmparatorluk
büyüdükçe şehir başına verim düşer (yolsuzluk). Bu iki fren olmadan ilk fetheden
ülke katlanarak büyüyüp oyunu ~100. turda bitiriyordu.

## Sonraki adımlar

- Nehirler (`tile.river` alanı ayrılmış), köprü/geçit maliyetleri
- İttifaklar ve karşılıklı savaş çağrısı (şu an yalnız ikili savaş/barış var)
- Birim terfisi / deneyim
- Daha akıllı YZ: şu an "en yakın yabancı kareye yürü, bitişiktekine vur"
- Kaydetme: seed + hamle listesi yeterli, harita yeniden üretilebilir
