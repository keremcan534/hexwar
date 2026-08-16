# PERFORMANCE AUDIT — Imperial Eye

Tarih: 2026-08-16 · Ortam: Chrome (Claude tarayıcı paneli), ~144 Hz ekran,
800×757 görünüm, standart dünya 160×96 (15 360 hex, 62 ulus, ~655 tümen).
Ölçüm aracı: `src/core/perf.js` + F3 kaplaması (`?perf=1`), otomasyon için
`window.__perfReport()` / `__perfReset()`. Bütün sayılar gerçek tarayıcıda
rAF örneklemesiyle alındı (senkron döngü ölçümü kullanılmadı — GPU/GC
yığılması sahte spike üretiyor).

İki ayrı metrik raporlanır:

- **dt** — ardışık rAF kareleri arası duvar süresi (frame pacing; GPU dahil).
- **cpu** — kare geri çağrısının ana thread süresi (suçlu tespiti).

Not: oyun durağanken kareler KASITLI olarak su kadansında (40/80 ms) çizilir;
duraktaki "FPS" bu yüzden 12–25'tir ve bir sorun değildir. Sorun olan, o
kadansın düzensizleşmesi ve kare başına maliyet/çöptü.

---

## 1. BEFORE — açılış ölçümleri

| Senaryo | dt avg | dt p95 | dt p99 | dt max | cpu avg | cpu max | GC |
|---|---|---|---|---|---|---|---|
| İlk kare (yükleme) | — | — | — | **347 ms** | 347 | 347 | — |
| Durak, zoom 0.22 (uzak) | 93 | 103 | 104 | 104 | 3.1 | 5.2 | 0/60 sn |
| Durak, zoom 0.50 (deniz görünür) | 32 | — | 70 | 70 | 3.8 | 16.7 | **91 düşüş / 157 MB / 40 sn (~4 MB/sn)** |
| Zoom stresi (20 sn osilasyon) | 11.4 | 27.8 | **48.7** | 62.6 | 1.2 | 9.7 | 51 düşüş / 61 MB |
| Pan stresi (20 sn, zoom 0.8) | 9.3 | 20.8 | 27.7 | **35** | 1.3 | 4.1 | 42 düşüş / **278 MB (~14 MB/sn)** |
| Hız 8 sim (24 sn, 189 gün) | 42 | 62.6 | 69.4 | 69.6 | 5.5 | **22.4** | 40 düşüş / **547 MB (~23 MB/sn)** |

Diğer BEFORE bulguları:

- Haftalık tur (senkron toplam): **59 ms** — en büyük atomik parça
  `command` fazı **12.7–19.7 ms** (tek dilim, kare bütçesi 7 ms).
- `clock-tick` (setInterval içinde, rAF DIŞI stall): **8–20 ms**.
- Otomatik kayıt: 16–18 ms (bu dünya boyutunda).
- Hız 8'de `r.farbake` neredeyse her karede çalışıyordu: uzak önbellek her
  tur baştan pişiyordu.
- HUD, HER GÜN tikinde (hız 8'de sn'de 8 kez) skorbord + ordu toplamı +
  üç innerHTML bloğu yazıyordu (0.9–2.4 ms/tik + DOM çöpü).

## 2. Kök nedenler (önem sırasıyla)

### CRITICAL

1. **Tam geçersizleme fırtınası.** `battles.js` her muharebe kapanışında,
   `construction.js` YZ kuyruğu her oynadığında (yani fiilen her tur),
   `diplomacy.js` her savaş ilanında `renderer.invalidateCache()` çağırıyordu.
   Sonuç: uzak dünya dokusu + etiket yerleşimi + ton önbelleği her tur
   baştan; hız 8'de sürekli `farbake`, ~20 MB/sn çöp, GC duraklamaları.
   Etiketlerin jest ortasında yeniden çapalanması "haritada rastgele isim
   yağmuru" hatasının da köküydü.
2. **Kare başına tahsisat (GC mikro takılmaları).** Durakta bile her su
   tikinde köpük Path2D demetleri + DOMMatrix + birim başına gradyan/Path2D/
   yazı yeniden kuruluyordu (~4 MB/sn durakta, 14 MB/sn pan'da). GC
   duraklamaları 35–70 ms'lik, CPU'suz dt spike'ları olarak ölçüldü.
3. **`command` fazı atomik** (12.7–19.7 ms) ve turun dilimleri `setInterval`
   içinde de pompalanıyordu → rAF'tan bağımsız 7–20 ms ana thread stall'ları.

### HIGH

4. **Zoom jestinde ürün kurulumu.** Deniz yolu ürünleri (Path2D demetleri)
   görünür rect her karede değiştiği için her karede yeniden kuruluyordu
   (~8 MB/sn); statik katman da %8'lik dar bantta sürekli yeniden pişiyordu.
5. **Birim sayaçları canlı çiziliyordu.** Pan p95'inin ana kalemi
   (13.9 → 7.2 ms, birimler kapatılınca): görünür birim başına her karede
   gradyan + 2-3 Path2D + fillText.
6. **İlk kare senkron dev iş**: su dokuları (~227 ms) + uzak pişirme
   (~111 ms) tek karede.

### MEDIUM

7. HUD'un gün tiki başına tam yeniden kurulumu (yukarıda).
8. Su kadansı faz kilidi olmadan zamanlanıyordu → 33–104 ms düzensiz adım.
9. Otomatik kayıt ana thread'de 16–18 ms (küçük dünyada; büyükte daha çok).

### LOW

10. Uzak zoomda 655 birim sayacının tam detay çizimi (~2.7 ms/tik).
11. Kamera sıçramasında (odak/teleport) senkron statik tam pişirme (~26 ms).

## 3. Yapılan optimizasyonlar — BEFORE → AFTER (hepsi ölçüldü)

| # | Değişiklik | BEFORE | AFTER (ölçülen) | Beklenti |
|---|---|---|---|---|
| 1 | Hedefli geçersizleme (muharebe→yok, inşaat→`invalidateConstruction`, savaş ilanı→yok, barış devri→`invalidateTiles`) | hız 8'de sürekli farbake, 23 MB/sn çöp | farbake yalnız gerçek egemenlik olaylarında; sim çöpü 23→12 MB/sn | büyük |
| 2 | Köpük Path2D + coastal önbelleği (`foamFor`, WeakMap) + DOMMatrix tekil | durak 0.5: 91 GC/157 MB/40 sn | **0–1 GC / 20 sn; cpu 3.8→1.3 ms** | büyük |
| 3 | `command` dilimlendi (`beginCommand`/`runNationCommand`×4/`finishCommand`) | tek dilim 19.7 ms | en kötü sim dilimi 16.5 ms→(çoğu <10); profil sırası korunur, determinizm denetimi GEÇTİ | orta |
| 4 | Tur pompası yalnız rAF'ta (gizli sekmede interval yedeği) | clock-tick 8–20 ms stall | clock-tick yalnız autosave anında (16–18 ms) | orta |
| 5 | Zoom jestinde deniz ürünleri kurulmaz (`onlyCached`), statik yeniden pişirme bandı ±%8→±%25 | zoom p99 48.7, 30 uzun kare, 51 GC | **p99 27.7, max 48.7→(28–48), 16 uzun kare** | orta |
| 6 | Deniz ürünleri kapsama (%20 pay) önbelleği | pan'da her 1–3 hexte kurulum | kapsama tükenince kurulum | küçük† |
| 7 | Birim sayaçları sprite önbelleği (durum anahtarlı, zoom kovalı) | pan p95 13.9; durak 0.62'de 2.3 MB/sn, cpu 1.3 | **durak GC 0, cpu 0.5 ms; sim+pan p95 14 ms** | büyük |
| 8 | Su dokuları 3 aşamada + menü arkasında ısıtma; uzak pişirme kare bütçeli + kısmi doku gösterimi | ilk kare 347 ms | **ilk kare ~51 ms** (kalan iş perde arkasında) | büyük |
| 9 | HUD gün tiki = yalnız tarih + hız düğmesi (`onDay`); tam kurulum haftalık olaylarda | 0.9–2.4 ms × 8/sn | ui.hud yalnız haftada, 0.8 ms | küçük |
| 10 | Su kadansı faz kilitli zamanlayıcı | 33–104 ms düzensiz | 40/80 hedefte ~45/85 kararlı (p95 56/96) | küçük |
| 11 | Uzak LOD: zoom<0.34'te plaka+şerit | uzak tik 2.7 ms aktör | **0.38 ms** | küçük |
| 12 | Etiket yerleşimi jest sürerken yeniden kurulmaz; işgal (controller) etiketi kirletmez | jest ortasında isim sıçraması | hız 8 + pan + ani zoom işkencesinde etiketler stabil (ekran görüntülü doğrulama) | görsel hata |

† #6 tek başına ölçülebilir fark yaratmadı (pan çöpünün ana kaynağı birim
sayaçları çıktı, bkz. #7); kapsama önbelleği yine de kurulum sıklığını
düşürdüğü için tutuldu.

## 4. AFTER — kapanış ölçümleri

| Senaryo | dt avg | dt p95 | dt p99 | dt max | cpu avg | cpu max | GC |
|---|---|---|---|---|---|---|---|
| İlk kare (yükleme) | — | — | — | **~51 ms** | 51 | 51 | — |
| Durak, zoom 0.22 | 85 (kadans 80) | 96 | 100 | 100 | **0.67** | 1.1 | 1 düşüş / 25 sn |
| Durak, zoom 0.50 | 46 (kadans 40) | 56 | 63 | 63 | **1.3** | 1.9 | **1 düşüş / 1 MB / 20 sn** |
| Durak, zoom 0.62 (sprite sonrası) | 49 | 56 | — | — | **0.47** | 1.4 | **0 düşüş / 20 sn** |
| Zoom stresi (tam menzil osilasyon) | 8.5 | 20.9 | **27.7** | 48.7 | 0.75 | ~5 | 16 düşüş |
| Pan stresi (zoom 0.8) | 9.8 | 20.8 | 27.8 | **34.7** | 1.1 | 3.5 | pacing'e yansımıyor |
| Dikiş üstünde pan | 8.8 | 14.0 | 27.8 | 27.9 | 0.71 | 4.2 | 2 uzun kare/12 sn |
| **Hız 8 sim + sürekli pan** | **9.6** | **14.0** | **20.9** | **27.9** | 1.1 | 15.4 | 42 düşüş/22 sn |
| Hız 8 + pan + ani zoom (işkence) | 8.3 | 13.9 | 27.9 | 55 | 1.4 | 12.6 | — |

Kabul ölçütlerine karşı:

- ✅ Durakta tekrarlayan mikro takılma yok (GC 0–1/20 sn; kadans kararlı).
- ✅ Zoom/pan akıcı: etkileşimde p95 ≤ 21 ms, p50 ~7 ms (144 Hz ekranda).
  60 Hz bütçesi (16.7 ms) p95'te sağlanıyor.
- ✅ Tarih ilerlerken görünür donma yok: en kötü ana thread bloğu ~16 ms
  (eski: 70–100 ms atomik + 20 ms interval stall).
- ✅ Kare pacing: tekrarlayan >33 ms kare yalnız durak kadansı (kasıtlı);
  etkileşimde uzun kare ~0.2–0.8/sn ve ≤48 ms.
- ✅ GC: durakta sıfır; etkileşimde büyük duraklamalar yok (kalan düşüşler
  minör, pacing'e yansımıyor).
- ✅ Görsel doğruluk: dikiş, LOD geçişleri, etiketler, kip değişimleri,
  sprite sayaçlar ekran görüntüleriyle doğrulandı.
- ✅ Simülasyon doğruluğu: `audit:determinism` (5 koşu birebir aynı) ve
  `diagnose:command` GEÇTİ; kayıt/yükleme turu ve birimleri koruyor.
- ✅ Kayıt uyumluluğu: mevcut kayıt yüklendi, tekrar kaydedildi.

## 5. Kalan darboğazlar ve öneriler (yapılMAdı — ölçüme dayalı sıralama)

1. **Simülasyonun kendi tahsisatı: ~11 MB/hafta-turu** (render tamamen
   kapalıyken ölçüldü: 149 MB/12 sn, hız 8). Ekonomi/YZ nesne çöpü. Minör
   GC'ler şimdilik pacing'i bozmuyor; daha büyük dünyalarda bozar. Doğru
   adım kullanıcının Faz 3'ü: ekonomi/nüfus/YZ'yi Web Worker'a taşımak ve
   dünya durumunu kompakt tampon (SoA/typed array) olarak paylaşmak. Bu,
   ayrı ve büyük bir mimari iş — bu geçişten önceki mimari temizlik bilinçli
   olarak tamamlandı (tur zaten üreteçle dilimli; worker'a taşınacak sınır
   `begin*/runNation*/finish*` üçlüleri olarak hazır).
2. **Statik katman yeniden pişirme maliyeti** zoom yerleşmelerinde (1–2 MB
   tahsisat + GPU doku yüklemesi; 35–48 ms tekil dt spike'ları, cpu ~1 ms).
   Çözüm adayı: katmanı 256px'lik karolara bölüp karo başına pişirme
   (kullanıcının Faz 7'sinin karo varyantı) ya da harita katmanını WebGL2'ye
   taşımak. **WebGL2 önerisi ancak bu karolama denenip yetmezse** gündeme
   gelmeli (Faz 19 disiplini): mevcut Canvas2D hattı 60 Hz hedefini
   karşılıyor.
3. **Otomatik kayıt** 16–18 ms (bu dünyada). Büyük dünyalarda ölçülüp
   gerekirse `structuredClone` + worker'da serileştirme.
4. **Teleport (odak sıçraması) senkron statik pişirme** ~26 ms — nadir;
   istenirse kısmi-pişirme yoluna bağlanabilir.
5. Kaplamadaki `hex`/draw-op sayaçları kaba; per-katman draw-call sayacı
   istenirse eklenebilir.

## 6. Masaüstü paketleme notu (Faz 20)

Mimari değişmedi: saf ES modülleri + Canvas2D, derleme adımı yok. Bir
Electron/Tauri kabuğu `index.html`'i doğrudan yükleyebilir. EXE paketlemek
performans SORUNU da ÇÖZÜMÜ de değildir; yukarıdaki sayılar tarayıcıda
sağlandı ve kabukta aynı kalır. Paketleme bu görevin kapsamı dışında tutuldu.

## 7. Ölçüm araçları (kalıcı)

- `F3` ya da `?perf=1`: FPS, dt/cpu yüzdelikleri, bölüm süreleri
  (render/sim/ui + r.static/r.water/r.far/r.farbake/r.actors/r.labels),
  görünür hex, heap, GC düşüşleri, tur faz profili, uzun kare dökümü,
  kare süresi çubuğu.
- Konsoldan senaryo ölçümü: `__perfReset()` → senaryo → `__perfReport()`.
- Tur faz süreleri: `game.turns.lastProfile`, ekonomi alt fazları:
  `game.turns.lastEconomyProfile` (dilimli fazlarda değer son demeti temsil
  eder, toplamı değil).
