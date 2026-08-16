# PERFORMANCE AUDIT — Imperial Eye

Tarih: 2026-08-16 (2. tur güncellemesiyle) · Ortam: Chrome (Claude tarayıcı
paneli), ~144 Hz ekran,
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

## 4b. İkinci tur (kullanıcı geri bildirimi üzerine) — ek düzeltmeler

Bildirilen üç sorun ölçülüp çözüldü:

1. **"Ani zoom'da binlerce isim patlıyor."** Kök: hızlı zoom, state (0.68) ve
   şehir (0.78+) eşiklerini tek karede aşınca yüzlerce etiket AYNI karede
   kabul ediliyor ve boşta kalmış fade saati (dt tavanı 0.1 sn) alfayı tek
   adımda ~0.7'ye fırlatıyordu. Düzeltme: zoom jesti sürerken (son zoom
   değişiminden 200 ms) HİÇBİR yeni etiket kabul edilmez — görünenler kalır
   ve akar; jest yerleşince adlar rampayla döner. Fade dt tavanı 0.05'e
   indirildi (boşta kadansta 2 tiklik "pat" açılma da gitti). Doğrulama:
   0.5↔1.4 sürekli osilasyonda (eşikler saniyede ~2 kez aşılırken) ekran
   görüntüleriyle sıfır isim patlaması; jest durunca etiketler normal döndü.
2. **"Denizde/başka yerlerde çizgiler."** İki ayrı kusur: (a) su desen
   dolguları yarı saydam ve 256'lık Path2D parçaları hâlinde — komşu
   parçaların ortak hex kenarında AA iki kez uygulanıp alfa topluyor,
   denizde kayan ince koyu çizgiler bırakıyordu. Düzeltme: parçalar ara
   tuvalde tam alfayla birleştirilir (ilk parça source-over, kalanlar
   destination-over: aynı deseni örneklediklerinden ortak kenar pikseli
   a·c+(1-a)·c=c, dikiş matematiksel olarak yok) ve ana tuvale hedef alfayla
   TEK blit yapılır; ölçülen ek maliyet ~0.1-0.2 ms/tik. (b) İlk turda
   eklenen "zoom'da su katmanını atla" yolu desenleri jest boyunca söndürüp
   yakıyordu — o da glitch gibi okunuyordu; şimdi jest sırasında SON kapsama
   kullanılmaya devam eder, kurulum 150 ms'de bire sınırlıdır.
3. **"Oyun ilerlerken spike'lar."** Adım telemetrisi eklendi
   (`turns.lastWorstStep` faz adıyla, `world.commandWorst` grup dökümüyle).
   Bulunanlar ve yapılanlar: pump bütçesi 7→5 ms (144 Hz bütçesi ~7 ms);
   YZ demeti 6→4, ekonomi 4→3; movement/provinces/workers/construction/
   battles fazları ayrı dilimlere bölündü (savaş haftasında tek dilim
   30-40 ms olabiliyordu); komuta ulus başına DEĞİL general başına dilimlendi
   ve `reconcileCommand`/`runGroup` içindeki O(tümen×birim) doğrusal
   taramalar kimlik tablosuyla kaldırıldı. Sonuç: en pahalı komuta grubu
   ölçümde 1.7 ms; kalan ~25 ms'lik tekil "dilim" süreleri saf hesap değil,
   adımın ortasına denk gelen MAJÖR GC duraklaması (duvar saati) — kaynağı
   madde 5.1'deki sim tahsisatı. Otomatik kayıt hızlı oynatmada 60 sn tavanla
   ertelenir (16-21 ms'lik tekrarlayan yazım durak/gizlenme anına kayar).
   Determinizm denetimi ve komuta tanılaması her değişiklikten sonra GEÇTİ.

PC hedefi notu (min 144 FPS): etkileşim kareleri (pan/zoom/sim) zaten
sınırsız rAF'ta akar — bu oturumda 98-144 FPS ölçüldü; 60 Hz bütçesinin
değil ~7 ms'lik 144 Hz bütçesinin içinde kalmak için sim dilimi 5 ms'e
çekildi. Boşta (durağan harita) su tazelemesi kasıtlı 30 fps'tir (66/33 ms
faz kilitli kadans): ambiyans dokusu için tam kare hızı ölçüsüz CPU olur;
etkileşim başlar başlamaz su da tam kare hızında akar.

## 5. Kalan darboğazlar ve öneriler (yapılMAdı — ölçüme dayalı sıralama)

1. ~~**Simülasyonun kendi tahsisatı: ~11 MB/hafta-turu**~~ — **ÇÖZÜLDÜ,
   bkz. bölüm 8 (SIMULATION ALLOCATION PASS).** Haftalık tahsisat ölçülüp
   dörtte birine indirildi (tarayıcıda −%57, Node profilinde −%75);
   determinizm 260 haftalık tam-durum parmak iziyle bire bir korundu.
   Worker değerlendirmesi bölüm 8.7'de güncellendi.
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
- Tahsisat profili (Node, başsız): `node scripts/audit/alloc-audit.mjs
  [hafta] [tohum] [--small]` — V8 örnekleyici heap profilcisiyle
  (toplanan nesneler DAHİL) haftalık turun alt sistem/fonksiyon bazında
  bayt dökümü. Bölüm 8'in bütün Node sayıları bu araçtan.

---

## 8. SIMULATION ALLOCATION PASS (3. tur — 2026-08-16)

Hedef: haftalık simülasyon turunun ~11 MB'lik tahsisatını, sonuçları
DEĞİŞTİRMEDEN küçültmek. Worker/WebGL yok, formül değişikliği yok, kayıt
formatı değişikliği yok.

### 8.1 Ölçüm yöntemi

- **Node (atıf):** `scripts/audit/alloc-audit.mjs` — V8 örnekleyici heap
  profilcisi, 4 KB örnekleme, minör+majör GC ile toplanan nesneler dahil
  (yani TOPLAM tahsisat). Standart dünya 160×96, 20 hafta ısınma + 10
  hafta profil. Fonksiyon/dosya bazında kesin atıf verir.
- **Tarayıcı (doğrulama):** gerçek Chromium (Playwright, 900×780,
  `--enable-precise-memory-info`), aynı tohum ve senaryoyla taban (0eae296)
  ve optimize sürüm yan yana. Tahsisat = GC düşüş toplamı + net büyüme
  (`perf.js` GC izleyicisi), hafta sayısı `turns.turn` farkından.

İki ölçek farklı sayı verir (tarayıcı sayısına render/autosave/HUD çöpü de
girer; Node sayısına yorumlayıcı HeapNumber kutulaması daha çok girer) —
o yüzden karşılaştırmalar hep kendi ölçeği içinde yapıldı.

### 8.2 Faz 1 — profil: 11 MB nereden geliyor?

Node atıf profili (taban, MB/hafta, toplam 30.0):

| Alt sistem | MB/hafta | Baskın kaynak |
|---|---|---|
| economy | 21.9 | `ensureMilitaryEconomy` içindeki `Object.entries` (9.6), haftalık ensure/reset spread kopyaları (4.6), mal döngülerindeki `Object.entries` + geçici nesneler |
| command | 2.0 | `scanBorders`'ta `world.neighbors` dizileri (0.9), `assignPosts` Map/dizileri (0.5) |
| construction | 1.5 | `ensureConstruction` her çağrıda filter+map kopyası (0.4), `chooseSeeds` map+spread, atlas |
| provinces | 1.2 | `provinceOutput` nesnesi (0.4), `refreshProvinceOwner` Map'i, `rgoStatusOf` nesneleri |
| diplomacy | 0.9 | `computeContacts`'ta `world.neighbors` dizileri |
| cities/budget | 0.6 | `assignWorkers` aday satırları + `hexesInRange` nesneleri |
| reinforcement | 0.6 | alay başına `Object.entries(cost)`, `fromEntries` |
| diğer (ai, pathfind, units…) | 1.3 | küçük kalemler |

Tek başına en büyük kalem: `ensureMilitaryEconomy` HER stok okumasında
77 anahtarlı `DEFAULT_MILITARY` üzerinde `Object.entries` kuruyordu —
haftada ~9.6 MB, toplam çöpün üçte biri.

### 8.3 Faz 3 sınıflandırması ve yapılanlar

- **A (kalıcı durum)** ve **B (gerekli çıktı)** dokunulmadı: `ledger`,
  `budget`, `trade` özet nesneleri, birim/şehir listeleri aynen üretiliyor.
- **C (yeniden kullanılabilir geçici):** karalama depolarına taşındı.
  Hepsinin ömrü TEK çağrıdır ve çıkışta ölü referans bırakmamak için
  boşaltılır; hiçbiri kayda girmez (modül düzeyi, dünya nesnesine asılı
  değil): `provinceOutputScratch`, `nationOutputScratch`,
  `settleGlobalTrade` Float64Array sütunları, `assignPosts` indeks/sayaç/
  boşluk/evsiz depoları, `assignWorkers` satır havuzu, `refreshArmy` ve
  `refreshProvinceOwner` sayım dizileri, `runProvinces` barış bayrağı.
- **D (gereksiz geçici):** kaldırıldı. Başlıcaları:
  - `ensureMilitaryEconomy`: anahtar listesi + alan adları
    (`armsProduced`…) modül kurulumunda bir kez (`MILITARY_FIELD`);
    okuma yolu (`equipmentStock`) geçerli değerde 77 alanlık doğrulamayı
    atlar (megamorfik double okumaları HeapNumber kutuluyordu).
  - `ensureEconomy`/`ensurePopulationModel`/`resetNationGoodsFlow`:
    spread ile yeniden kurmak yerine YERİNDE doldurma/sıfırlama
    (`fillMissing`); fabrika/proje filtreleri yalnız gerçekten düşecek
    kayıt varsa kopyalar; profesyon sayımı geçerliyken göç atlanır.
  - Mal döngüleri: `Object.entries`/`Object.keys` yerine statik tablolarda
    for-in / önceden açılmış listeler (`CLASS_NEEDS_ENTRIES`,
    `REINFORCEMENT_EQUIPMENT_ENTRIES`, `ARMY_CONSUMPTION_RATES`).
  - `settleGlobalTrade`: mal başına ülke satır nesneleri yerine üç
    Float64Array sütunu (toplama sırası aynı → bit bit aynı sonuç).
  - `computeContacts`/`scanBorders`: `world.neighbors` dizisi yerine DIRS
    tablosuyla doğrudan gezinme (haftalık tam taramada ~1.7 MB).
  - `populationDemand`: `wanted` ara listesi yerine aynı statik tablodan
    ikinci geçiş (aynı çarpımlar).
  - Sıcak yolda değişmeyen ondalık alanlar geri yazılmaz
    (`normalizeProject`, ekipman kırpması): V8'de her double yazımı yeni
    HeapNumber kutusu demek.

Faz 5/6/7 notu: iç sıcak döngüler zaten mal/ülke dizisi sırasında ilerliyor;
ID tabanlı SoA'ya geçmeye gerek kalmadan hedefe ulaşıldığı için genel bir
"sayısal kimlik" yeniden yazımı yapılmadı (Faz 8 disiplini: TypedArray yalnız
`settleGlobalTrade` sütunlarında, orada gerçek kazanç ölçüldü).

### 8.4 BEFORE → AFTER (Node atıf profili, aynı tohum/pencere)

| Alt sistem | Önce | Sonra | Azalma |
|---|---|---|---|
| economy | 21.92 | 3.16 | −86% |
| command | 1.97 | 0.92 | −53% |
| construction | 1.50 | 0.87 | −42% |
| provinces | 1.21 | 0.62 | −49% |
| diplomacy | 0.89 | 0.06 | −93% |
| cities/budget | 0.61 | 0.44 | −28% |
| reinforcement | 0.57 | 0.16 | −72% |
| ai | 0.34 | 0.34 | 0% |
| pathfind | 0.25 | 0.22 | −12% |
| diğer | 0.76 | 0.53 | −30% |
| **TOPLAM** | **30.02 MB/hafta** | **7.32 MB/hafta** | **−75.6%** |

Tur CPU'su (yan etki): 75 → 31 ms/hafta (Node, profilci açıkken).
Kalan 7.3 MB'nin büyük payı artık tek tek fonksiyonlara dağılmış
~0.2-0.6 MB'lik "doğrudan" kalemler: bunların çoğu V8 yorumlayıcı/IC
kademesinin double kutulaması (kod ısınınca tarayıcıda kendiliğinden
küçülür) ve gerçek iş (yol bulma, savaş haftası dizileri).

### 8.5 Tarayıcı doğrulaması (gerçek Chromium, aynı tohum, aynı senaryo)

| Ölçüm (hız 8, kamera sabit, 30 sn = 34 hafta) | Taban | Optimize |
|---|---|---|
| Toplam tahsisat | 735.9 MB | 313.1 MB |
| **MB / hafta** | **21.7** | **9.2 (−57%)** |
| GC düşüşü / 30 sn | 39 | 30 (hacim −57%) |
| sim cpu p95 / p99 / max | 32.4 / 66.8 / 115.4 | 27.7 / 41.7 / **49.0** |

(Bu ölçekte tarayıcı sayısına otomatik kayıt, HUD ve su/render çöpü de
girer; önceki turun "render kapalı ~11 MB/hafta" sayısıyla aynı kefeye
koymayın — buradaki geçerli karşılaştırma aynı senaryodaki taban sütunudur.)

Kare pacing regresyon testi (yazılım rasterli başsız Chromium; mutlak
değerler kullanıcı donanımıyla kıyaslanamaz, taban↔optimize kıyası geçerli):

| Senaryo | Taban dt p50/p95/p99 | Optimize dt p50/p95/p99 |
|---|---|---|
| Durak 0.5, 30 sn | 33.3 / 49.9 / 50.1 (GC 8/35.9 MB) | 33.3 / 33.4 / 50.1 (GC 4/33.9 MB) |
| Hız 8 + sürekli pan 20 sn | 33.3 / 50.0 / 66.6 | **16.7** / 50.0 / 50.1 |
| Zoom osilasyonu 20 sn | 33.3 / 33.4 / 50.1 (cpu p95 23.9) | 16.7 / 33.4 / 66.6† (cpu p95 **15.7**) |

† Tek 20 sn'lik pencerede p99 örnek sayısı küçük; cpu yüzdelikleri ve
ortalama (26.9→22.1 ms) tutarlı biçimde iyi, regresyon yok. Duraktaki
kalan ~1.1 MB/sn ambiyans çöpü su/render katmanına ait (iki sürümde aynı)
ve bu görevin kapsamı dışında.

Haftalık tur profili (tarayıcı, hız 8'de örneklenen hafta): economy
4.8→2.3 ms, provinces 2.8→1.8 ms, battles 1.2→0.7 ms. En kötü tekil dilim
iki sürümde de savaş haftası komuta dilimi bandında (14.9 / 18.1 ms —
pencereye denk gelen hafta farklı; kaynak GC değil CPU, bkz. 8.7).

### 8.6 Determinizm, kayıt ve sızıntı

- **Determinizm (Faz 17):** tam-durum sha256 parmak izi (bütün uluslar,
  defterler, sınıflar, ordu/alay güçleri, piyasa fiyat/arz/talep, province
  nüfus/kontrol, savaşlar, muharebeler — tam float hassasiyeti) 260 hafta
  boyunca 7 kontrol noktasında taban ile BİRE BİR aynı; ikinci tohum ve
  küçük dünyada 52 hafta aynı. FP toplama sıraları bilinçli korunduğu için
  sapma sıfır — "küçük fark kabul edilebilir" durumuna hiç düşülmedi.
  `audit:determinism` (5 koşu + süreç izolasyonu) GEÇTİ.
- **Kayıt/yükleme (Faz 18):** `audit:save` GEÇTİ — kaydet/yükle/100 hafta
  devam, kesintisiz koşuyla alan alan aynı. Karalama depoları modül
  düzeyinde yaşadığı için kayda GİREMEZ; kayıt boyutu/format değişmedi.
- **Sızıntı (Faz 19):** başsız 10 oyun yılı: GC sonrası taban 20.4 MB'de
  düz (yıl 4-10 arası büyüme yok). Tarayıcıda 6 dk hız 8 (412 hafta):
  GC sonrası taban 16-19 MB bandında, yükselen trend yok.
- **Görsel:** aynı tohumla taban/optimize ekran görüntüleri (uzak/orta/
  yakın) birebir aynı; mekanik denetimler (`audit:market/population/
  budget/military`) taban commit'iyle aynı bulguları veriyor (hepsi
  önceden var olan denge gözlemleri).

### 8.7 Worker değerlendirmesi (Faz 23 — yapılMAdı, öneri)

Temizlik sonrası gerçek tablo: haftalık turun kalan maliyeti **CPU**
(Node'da ~31 ms/hafta; tarayıcıda 5 ms'lik dilimlere bölünmüş, en kötü
dilim savaş haftasında ~18 ms komuta/muharebe bandı), tahsisat değil.
GC artık pacing sorunu değil: hız 8'de dakikada ~60 minör GC kaldı ve
hiçbiri kare bütçesini taşırmıyor.

Öneri: **worker göçünü şimdilik ertele.** Standart dünyada (160×96, ~60
ulus) mevcut dilimli pompa 144 Hz bütçesinde kalıyor. Göçü tetiklemesi
gereken eşikler: (a) 220× dünyalar hedeflenirse, (b) alt uç mobilde dilim
bütçesi 5 ms'i taşarsa, (c) savaş haftası komuta dilimi büyürse. O gün
taşınacak ilk adaylar, ölçülen CPU sırasıyla: **ekonomi kapanışı**
(begin/runNation/finish sınırı hazır), **komuta** (`assignPosts`
O(cephe²) `wrapDistance` taraması — worker'dan önce algoritmik ucuzlatma
denenmeli) ve **yol bulma**. Tahsisat temizliği sayesinde paylaşılacak
durum artık SoA tampona kopyalanabilir boyutta.
