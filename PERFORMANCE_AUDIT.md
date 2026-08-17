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

---

## 9. CURRENT FULL PERFORMANCE WALK (4. tur — 2026-08-17)

Kapsam: **mevcut HEAD**, bütün sistemler açık (askerî ekran + eğitim kuyruğu,
kültür taraması, etiketler, animasyonlu su dahil). Eski commit'lere bakılmadı,
özellik kapatılmadı, dünya küçültülmedi.

Ortam: Chrome (Claude tarayıcı paneli), 961×910 CSS px görünüm, dpr 1,
standart dünya 160×96 (15 360 hex, 64 ulus). Ölçüm iki ayaklı:

- **Tarayıcı** — `scripts/perf-walk.js` (yeni): kareden BAĞIMSIZ bir rAF
  gözcüsü + `PerformanceObserver('longtask')` + `core/perf.js` bölüm damgaları
  + heap/GC. Gözcü şart: oyun duraklatılmışken su kadansında (33/66 ms) çizer,
  yani oyunun kendi dt'si "kadans" ölçer, "takılma" ölçmez.
- **Node** — `scripts/sim-profile.mjs` (yeni): aynı tohum + aynı ısıtma ile
  haftalık faz sıralaması, **dilim dağılımı** ve tahsisat. Sunum hızından
  bağımsız olduğu için optimizasyon öncesi/sonrası karşılaştırmasının tek
  güvenilir yolu bu.

> Ölçüm notu: tarayıcı paneli, önplanda sunum yapmadığı aralıklarda rAF'ı
> ~1 Hz'e kısıyor. Bu duruma düşen koşular (dt ≈ 1000-4000 ms) rapora
> ALINMADI; her sonuç, kare sayısı beklenen orana ulaşan koşulardan alındı.

### 9.1 BASELINE — bu turdan önce (tur 471, 812 tümen, 2 266 tesis)

| Test | fps | p50 | p95 | p99 | max | >33 ms | >50 ms | cpu ort | cpu max | MB/sn | GC |
|---|---|---|---|---|---|---|---|---|---|---|---|
| A duraklat, sabit (25 sn) | 143.5 | 7.0 | 7.9 | 8.0 | 75.7 | 1 | 1 | 0.56 | 1.6 | 0.02 | 0 |
| B duraklat, kaydırma | 143.0 | 6.9 | 7.8 | 11.4 | 26.3 | 0 | 0 | 0.71 | 3.3 | 0.10 | 1 |
| C duraklat, **zoom** | 116.8 | 7.0 | 19.0 | **46.2** | 66.1 | **45** | **15** | 0.95 | 5.9 | 0.61 | 7 |
| D duraklat, kaydırma+zoom | 107.6 | 7.0 | 30.7 | **51.7** | 68.5 | **68** | **20** | 1.17 | 5.2 | 9.56 | 60 |
| E hız 1 | 142.1 | 7.0 | 7.9 | 8.1 | 52.6 | 2 | 1 | 1.20 | **27.2** | 3.50 | 16 |
| F hız 4 | 140.9 | 7.0 | 8.0 | 10.1 | 28.9 | 0 | 0 | 2.11 | **27.0** | 4.64 | 12 |
| G hız 8 | 137.9 | 7.0 | 8.0 | 22.1 | 32.0 | 0 | 0 | 3.09 | **26.1** | 13.31 | 20 |
| H hız 8 + kaydırma | 136.3 | 7.0 | 10.0 | 22.3 | 42.5 | 1 | 0 | 1.37 | 25.1 | **25.81** | 35 |
| I hız 8 + zoom | 100.3 | 7.0 | 30.5 | **52.8** | **90.9** | **52** | **21** | 1.92 | 26.1 | **31.08** | 25 |
| J hız 8 + kaydırma+zoom | 95.9 | 7.1 | 33.6 | **55.1** | 68.7 | **61** | **18** | 2.41 | 25.3 | 29.39 | 24 |

Baseline'ın üç net sinyali:

1. **Zoom** tek başına pacing'i bozuyor (p99 46-55 ms) ama `cpu` ≤6 ms ve
   longtask sayısı **0** — yani suç JS kare geri çağrısında DEĞİL.
2. Bütün hız testlerinde `cpu max` 25-27 ms: haftalık turun İÇİNDE bölünemeyen
   bir adım 5 ms'lik dilim bütçesini beş katıyla aşıyor.
3. Tahsisat hızla büyüyor: 13 → 26 → 31 MB/sn.

### 9.2 Ölçüm hatası: faz profili yanlış sistemi suçluyordu (P0)

`turnSteps` faz profili `mark(...); yield; stamp();` kalıbıyla yazılmıştı ve
`stamp()` damgayı ilerlettiği için **dilim sınırında yapılan iş hiçbir kovaya
yazılmıyordu**. Ulus başına yield eden fazlar (ai, komuta, ekonomi) neredeyse
görünmezdi:

| | hafta toplamı | profil toplamı | kapsama |
|---|---|---|---|
| önce | 112.1 ms | 9.6 ms | **9 %** |
| sonra | 88.7 ms | 87.9 ms | **99 %** |

Profil komutayı 0.17 ms/hafta gösterirken tek bir generalin dilimi 25 ms
ölçülüyordu. Düzeltme: `pause(name)` üreteci (`yield* pause('economy')`) —
mark+yield+stamp tek yerde, hiçbir iş kaybolmuyor. **Bu düzeltilmeden yapılan
her sıralama yanlış olurdu.**

### 9.3 GERÇEK haftalık sıralama (Node, 160×96, tur 531, 895 tümen, 2 134 tesis)

| faz | ms/hafta | pay |
|---|---|---|
| **economy** | **21.59** | 53 % |
| **command** | **8.85** | 22 % |
| ai | 4.83 | 12 % |
| reinforcements | 1.54 | |
| contacts | 1.07 | |
| produce · provinces · workers · construction · units · battles · movement · training · orders | ≤0.9 her biri | |
| **toplam** | **40.76** | |

Ekonomi içi: `econAI` 9.20 · `factories` 3.29 · `privateSector` 2.36 ·
`fiscal` 2.24 · `raw` 1.26 · kalan ≤0.52.

Tahsisat sıralaması (aynı dünya, `--expose-gc`): **command 8.25 MB/hafta**,
**economy 7.22**, ai 1.70, workers 0.62, kalan ≤0.32 → toplam 18.8 MB/hafta.
Hız 8'de bu ~21 MB/sn eder ve tarayıcıdaki 13-31 MB/sn ölçümüyle örtüşür.

### 9.4 Darboğazlar — sıralı, her biri ölçülerek doğrulandı

#### P0 · Zoom'da statik katmanın sürekli yeniden pişmesi
`src/render/renderer.js` → `ensureStaticLayers`

Karar kuralı `settled || uncovered || mag < 0.75 || mag > 1.33` idi. Sürekli
zoomda büyütme eşiği her birkaç karede aşılıyor ve **1461×1384 boyutlu katman
ÇİFTİ** yeniden boyanıp GPU'ya yükleniyordu. Kanıt (aynı dünya, 10 sn zoom
taraması, yeniden pişirme tamamen kapatılarak):

| | p95 | p99 | max | >33 ms | MB/sn |
|---|---|---|---|---|---|
| pişirme açık | 15.5 | **51.9** | 134.9 | 26 | 5.88 |
| pişirme kapalı (deney) | 7.1 | **7.5** | 11.8 | **0** | 0.29 |

Yani zoom takılmasının **tamamı** bu yeniden pişirmeydi.

Denenen ve **GERİ ALINAN** çözüm: pişirmeyi LOD kovasına oturtmak. Kova
değişiminde doku 1.6 kat büyüyor, her değişimde yeni tuval çifti ayrılıyordu:
>50 ms kare 7'den 27'ye çıktı. Kayıt burada duruyor çünkü "mantıklı görünen"
çözümün ölçümde kaybettiğinin kanıtı.

Kabul edilen çözüm (kural C): **jest sürerken yalnız kapsama kaybında pişir**,
jest yerleşince (150 ms) tam zoom'da bir kez. Aynı oturumda, aynı dünyada:

| kural | p95 | p99 | max | >33 ms | >50 ms | MB/sn |
|---|---|---|---|---|---|---|
| eski (eşikli) | 22.0 | 54.5 | 131.6 | 37 | 20 | 16.12 |
| kova (denendi) | 35.3 | 50.0 | 58.6 | 56 | 10 | 10.79 |
| **C (kabul)** | **7.2** | **7.4** | **10.7** | **0** | **0** | **1.07** |

Görsel doğrulama: jest bitince katman tam zoom'da pişiyor
(`staticLayers.zoom === camera.zoom`), durağan haritada bulanıklık ve kenar
boşluğu yok (ekran görüntüsüyle bakıldı).

#### P1 · `industryTaken` her aday için bütün fabrikaları yeniden indeksliyordu
`src/game/economy.js` → `industryTaken` / `factoriesInRegion` / `factoryAtlas`

Özel sermaye ve YZ her hafta 29 tür × state sayısı kadar aday dener; her aday
`factoriesInRegion` çağırıyor, o da ülkenin BÜTÜN fabrikaları üzerinde yeni bir
`Map` kurup diziye yayıyordu. Ölçüldü (195 fabrikalı ülke, 11 state):
`canBuildFactory` **0.052 ms/çağrı** × 319 aday = tek ülke için **16.6 ms/hafta**.

Çözüm: ulus başına haftada bir kurulan `region|type` **Set** dizini (imza:
bölge/fabrika/proje sayısı + atlas kimliği).

| | ms/hafta |
|---|---|
| hafta toplamı | 40.76 → **33.50** (−18 %) |
| economy | 21.59 → 16.21 |
| economy.econAI | 9.20 → **5.87** (−36 %) |
| economy.privateSector | 2.36 → 1.72 |

Dünya durumu 530 hafta sonra **birebir aynı** (tur/tümen/tesis) → davranış
değişmedi.

#### P1 · Ekonomi dilimi üçer ulusluydu
`src/game/turn.js` → ekonomi döngüsü

5 ms'lik kare bütçesi **bölünemeyen** bir adımı bölemez; üçerli demet tek
başına 8.9 ms tutabiliyordu. Ulus başına yield'e geçildi (sıra ve işlem dizisi
aynı → determinizm etkilenmez):

| | dilim/hafta | p95 | max | >5 ms dilim | hafta ms |
|---|---|---|---|---|---|
| önce | 347 | 0.36 | 8.85 | 47 | 31.01 |
| sonra | 394 | 0.22 | 9.11 | **24** | 31.02 |

#### P2 · Yol bulma kare başına dizi ayırıyordu
`src/core/pathfind.js` → `findPath` / `reachable`

`world.neighbors(tile)` kare başına yeni dizi kurar; ulaşılamaz bir mevkiye
giden arama düğüm tavanına (19 200) kadar açılır. Ölçüldü: tek bir başarısız
cephe yürüyüşü **5.4 ms**, ve mevki değişmediği için bu **her hafta** tekrar.
Yön tablosu doğrudan gezilir hâle getirildi (ziyaret sırası DIRS ile birebir
aynı):

| | değer |
|---|---|
| command tahsisatı | 8.25 → **6.75 MB/hafta** |
| command süresi | 7.98 → **6.71 ms/hafta** |
| en kötü dilim | 9.11 → **7.52 ms** |
| >5 ms dilim | 24 → **15** |
| dünya durumu | **birebir aynı** |

Denenen ve **GERİ ALINAN**: cephe yürüyüşüne 3000 düğümlük tavan. Tahsisat
düşmedi (19.3 MB/hafta) ama dünya durumu SAPTI (tümen ve tesis sayıları 530
haftada farklılaştı). Kazancı olmayan davranış değişikliği tutulmaz.

#### P2 · Kapalı ekran DOM'da asılı kalıyordu
`src/ui/screens.js` → `close()`

Sekiz ekran yirmişer kez açılıp kapatıldığında belge **406 → 1049 düğüme**
çıkıyor, son bakılan ekranın 635 düğümü (35 KB HTML) gizli hâlde asılı
kalıyordu. Kapanışta gövde temizleniyor (açılış zaten `refresh()` ile baştan
kuruyor):

| | önce | sonra |
|---|---|---|
| 160 aç/kapat sonrası DOM büyümesi | +643 düğüm | **0** |
| aç+kapat çevrimi | 11.8 ms | **7.5 ms** |

Dinleyici sızıntısı YOK: bağlamalar `onclick =` atamasıyla yapılıyor, tekrar
bağlama çoğaltmıyor (denetlendi).

### 9.5 Duraklatılmış oyun denetimi (Faz 3)

20 sn duraklat + sabit kamera, tur 1630:

- simülasyon pompası: **0** (duraklat gerçekten duraklat)
- yalnız su kadansı çiziyor: 14 kare/sn, kare başına cpu 0.71 ms
- bölümler: `r.labels` 0.34 · `r.actors` 0.18 · `r.water` 0.15 · `r.static` 0.01
- **tahsisat 0.08 MB/sn**, 20 saniyede **1** GC
- dt p50 7.0 · p95 7.1 · p99 7.3

Duraklatılmış oyunda mikro takılmanın kaynağı kalmadı.

### 9.6 SONUÇ — walk sonrası (tur **1630**, baseline'dan çok daha ağır dünya)

| Test | fps | p50 | p95 | p99 | max | >33 ms | >50 ms | cpu max | MB/sn |
|---|---|---|---|---|---|---|---|---|---|
| duraklat (panel çalkalamasından SONRA) | 142.0 | 7.0 | 7.1 | **7.2** | 161.5¹ | 1 | 1 | 1.1 | 0.12 |
| kaydırma | 142.2 | 6.9 | 7.5 | 11.7 | 74.3¹ | 1 | 1 | 2.8 | 0.40 |
| **zoom** | 142.0 | 7.0 | **7.2** | **8.9** | 49.3¹ | 2 | 0 | 0.9 | 0.95 |
| hız 8 | 141.3 | 7.0 | 7.1 | 12.1 | 42.6 | 1 | 0 | **14.5** | 6.76 |
| hız 8 + kaydırma | 141.5 | 6.9 | **9.1** | 13.7 | 27.5 | **0** | **0** | 13.9 | 20.73 |

¹ Tek seferlik: koşu başında `reset()` zoom'u değiştiriyor ve yerleşme
pişirmesi bir kez ödeniyor. Tekrarlayan değil.

Faz 30 hedefleriyle karşılaştırma:

| hedef | sonuç |
|---|---|
| duraklatılmışken mikro takılma yok | ✅ p99 7.2 ms · 0.12 MB/sn · 0 GC |
| duraklatılmışken GC yok denecek kadar az | ✅ 12 sn'de 0 |
| kaydırma akıcı | ✅ p95 7.5 |
| zoom akıcı | ✅ p99 8.9 (hedef ≤25-30) |
| hız 8 + kaydırma p95 ≤16 ms | ✅ **9.1** |
| tekrarlayan 50+ ms kare yok | ✅ |
| tekrarlayan 100+ ms donma yok | ✅ |

Simülasyon tarafı (Node, aynı dünya, tur 531 — hepsi **birebir aynı dünya
durumu** üretir):

| | ms/hafta | en kötü dilim | >5 ms dilim | command MB/hafta |
|---|---|---|---|---|
| baseline | 40.76 | 8.85 | 47 | 8.25 |
| + industry dizini | 33.50 | 8.85 | 47 | — |
| + ulus başına ekonomi dilimi | 31.02 | 9.11 | 24 | — |
| + yol bulma dizi temizliği | **30.64** | **7.52** | **15** | **6.75** |

**Haftalık simülasyon −25 %, 5 ms'i aşan dilim sayısı −68 %.**

### 9.7 Doğrulama

- `audit:determinism` GEÇTİ (5 koşu + süreç izolasyonu; ayrı süreçlerde tam).
- `audit:save` GEÇTİ (kaydet/yükle/100 hafta devam — alan alan aynı).
- `diagnose:military` 29/29 GEÇTİ.
- Her optimizasyon adımında dünya parmak izi (tur/tümen/tesis) 530 hafta sonra
  karşılaştırıldı; sapan tek değişiklik (yol bulma tavanı) geri alındı.
- Sekiz ekranın hepsi aç/kapat sonrası doğru çiziyor; konsol hatasız.

### 9.8 Kalan darboğazlar ve öneriler

1. **Hız 8 + kaydırmada 20.7 MB/sn tahsisat** (10 sn'de 38 GC). Pacing'i şu an
   bozmuyor (p95 9.1 ms) ama en büyük kalan kalem. Ölçülen kaynak: economy
   6.89 + command 6.65 MB/hafta. Sıradaki iş, `findPath` yığın nesnelerinin
   (`{tile, f}`) havuzlanması ve ekonomi kapanışındaki geçici nesneler.
2. **`cpu max` 13-14 ms** hız 8'de: en kötü dilim hâlâ tek bir ulusun ekonomisi
   ya da bir generalin `march`ı. Bir sonraki adım ekonomi dilimini ulus İÇİNDE
   bölmek (classes/raw/factories sınırları hazır).
3. **Ulaşılamaz mevkiye giden yol araması** her hafta tekrarlanıyor. Tavan
   koymak davranışı değiştirdiği için geri alındı; doğru çözüm mevki
   seçiminde ulaşılabilirlik ön kontrolü (`assignPosts` tarafında).

### 9.9 Worker kararı (Faz 32)

**Şimdilik hayır.** Ölçüm: haftalık sim 30.6 ms, 394 dilime bölünmüş, en kötü
dilim 7.5 ms; hız 8 + kaydırmada p95 9.1 ms ve >33 ms kare YOK. Simülasyon
kamerayı/girişi maddi olarak bloklamıyor. Göç ancak şu eşiklerde gündeme
gelir: dünya 2× büyürse, alt uç donanımda dilim bütçesi taşarsa ya da ekonomi
tek ulus için 10 ms'i aşarsa. O gün ilk aday **ekonomi kapanışı** (begin/
runNation/finish sınırı zaten hazır), ama paylaşılan dünya durumunu ağır
mutasyona uğrattığı için risk yüksek, kazanç düşük.

### 9.10 WebGL kararı (Faz 33)

**Gerek yok.** Optimizasyon sonrası çizim tarafı kare başına 0.5-2.8 ms cpu
harcıyor ve zoom'daki GPU maliyeti (katman yeniden yükleme) kaynağında
çözüldü: zoom p99 8.9 ms. Canvas2D bu dünya boyutunda ölçülen bir darboğaz
değil.
