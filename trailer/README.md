# IMPERIAL EYE — fragman projesi

72 sn, 1920×1080, 60 fps. Görüntünün tamamı oyunun kendisinden: harita
çekimleri sanal saatle kare kare çizilmiş gerçek oyun, arayüz kareleri
oyunun kendi ekranları (2× çözünürlükte). Hiçbir sayı uydurulmadı; her rakam
`footage/meta.json`'da yakalandığı haliyle duruyor.

Çıktı: `out/imperial-eye-trailer.mp4` (H.264 CRF 12, AAC 320k, -14 LUFS).

## Hikâye — gerçek bir oyunda oynandı

Seed `STEAM`, oyuncu **Lorania**. Senaryo `capture/story.mjs`; denge ve
mekanik değiştirilmedi, yalnız oyuncunun yapabildiği şeyler yapıldı
(arayüzden ilan, seferberlik, generallere taarruz emri, barış masasında
"Accept terms").

| Durak | Tarih (oyun) | Gerçek değer |
|---|---|---|
| Kıtlık | 24 Şub 1837 | Kömür: üretim **0.00**, ithalat 0.28, karşılanmayan 0.22, **karşılama %56**. Ana tüketici Arms Industry |
| İnşa seçeneği | 24 Şub 1837 | "Invest: treasury short by £100." (hazine £0) |
| Komşu | 24 Şub 1837 | Eldor — "Produces: Sulphur · Coal · Iron", "we are 2.4× their strength" |
| İlan | 24 Şub 1837 | "Click again to declare war: 8-week ultimatum" → ültimatom → savaş tur 70 |
| Savaş | 26 hafta | savaş skoru 6 → 76; Eldor barış teklif eder |
| Barış | tur 96 | "They cede to us: Jorvale ★ · Keshmark · Dornburg" — üçü de kömür eyaleti |
| Sonuç | 16 Şub 1838 | Kömür üretim **1.31**, ithalat **0.00**, karşılanmayan 0.00, **%100**; Arms Industry tüketimi 0.50 → 0.90; fabrika 7 → 9, işçi 120K → 192K |
| Dünyanın tepkisi | 16 Şub 1838 | kötü şöhret **28.6** (koalisyon eşiği 22), Wynathland ve Wynvik ile savaş |

Bilerek KULLANILMAYAN iddialar: "fabrika çıktısı düştü" (oyunda girdi kıtlığı
dünya pazarından gelir, ulus bazında çıktıyı düşürmez) ve "hazine düzeldi"
(Lorania'nın hazinesi baştan sona £0). Yerine gerçek olanlar kondu:
yerli seçenek kapalı, ithalat bağımlılığı, sanayi büyümesi, dünyanın tepkisi.

Not: taarruz emri vermeden (yalnız AUTO komutayla) aynı savaş 90 haftada
kilitleniyor — oyuncunun kararı sonucu gerçekten değiştiriyor.

## Müzik — vuruş haritası

Kaynak: verilen parça (4:54). Analiz `audio/analyze.py` + `audio/beats.py`
(spektral akı, otokorelasyon, dinamik programlamalı vuruş izleme, bas akısıyla
ölçü fazı). **120.19 BPM**, ölçü 1.997 sn, perküsyon 3+3+2 senkoplu (bu yüzden
otokorelasyon bazı bölümlerde "80 BPM" gösterir: 0.75 sn aralıklı darbeler).

Seçilen bölüm: kaynak **222.96 → 292.4 sn**, tek parça, kesme yok. Gerekçe:
6 ölçülük kırılma (sessiz açılış) → frazın dönüşü → askı → nefes → parçanın
**en güçlü bas darbesi** (256.987 sn, bas akısı 1.65, tüm parçada en yüksek)
→ 14 çift darbelik final → doğal sönüm.

| t (fragman) | kaynak | olay | görüntü |
|---|---|---|---|
| 0.00 | 222.96 | kırılma, ped | siyahtan deniz |
| 4.97 | 227.93 | ped kabarır | kara belirir |
| 6.95 | 229.91 | yükselen tiz | **1836** |
| 8.94 | 231.90 | gerilim ölçüsü | sınırlar Lorania'dan açılır (pirinç halka) |
| 11.92 | 234.88 | **ilk nabız** (bas 1.06) | LORANIA |
| 13.43 | 236.39 | bas vurgu | fabrika: girdi Coal |
| 14.94 | 237.90 | askı (2 ölçü) | Coal — SHORTAGE → %56 |
| 19.45 | 242.41 | bas geri girer | rakamın içinden kaynak haritasına |
| 23.93 | 246.89 | bas kesilir | **BUILD** (üstü çizilir) |
| 25.95 | 248.91 | tek bas | **TRADE** (üstü çizilir) |
| 27.47 / 27.97 | 250.43 / 250.93 | çift bas | **TAKE** — Eldor dosyası |
| 28.98 | 251.94 | ölçü başı | "we are 2.4× their strength" |
| 30.00 | 252.96 | — | ilan düğmesi |
| 32.50 | 255.46 | **nefes** (-16.9 dB) | hareket durur, müzik -11 dB çekilir |
| 33.88 | — | — | tık |
| **34.03** | **256.99** | **EN GÜÇLÜ DARBE** | **WAR** |
| 35.52 + 2k, 36.02 + 2k | 258.48… | çift darbeler | her kesme bir darbede |
| 43.52 | 266.48 | — | Eldor barış istiyor |
| 47.52 | 270.48 | çift darbe | **ilhak** — harita aynı çekimde el değiştirir |
| 49.52 | 272.48 | — | önce/sonra: 0.00 → 1.31 |
| 53.52 | 276.48 | kreşendo başı | THE WORLD REACTS. |
| 56.02 | 278.98 | — | SO DO YOU. |
| 63.52 | 286.48 | en parlak tiz darbe | son kesme |
| 64.03 | 286.99 | son vuruş, bırakış | dünya geri çekilir |
| 65.6 → 70.6 | sönüm | — | IMPERIAL EYE / EVERY NUMBER TELLS A STORY. |
| 72.0 | — | — | siyah |

Tam liste: `audio/beatmap.json`.

## Çekim listesi

| # | t | kaynak | kamera dili | işlev |
|---|---|---|---|---|
| 1 | 0.00–4.47 | `ocean_open` (three.js deniz, kıyı) | İmparatorluk | atmosfer |
| 2 | 4.47–8.94 | `land_reveal_geo` (siyasetsiz) | İmparatorluk | dünya |
| 3 | 8.94–11.92 | `land_reveal_pol` (aynı kamera, sınırlar) | İmparatorluk | dünya hareket ediyor |
| 4 | 11.92–13.43 | `lorania_intro` | Kriz | oyuncunun ülkesi |
| 5 | 13.43–14.94 | `industry` | Analiz | sorun: silah sanayisi kömür ister |
| 6 | 14.94–19.45 | `trade_coal` | Analiz | sorun: %56 |
| 7 | 19.45–23.93 | `coal_reveal` (kaynak kipi, iz verisiyle halkalar) | Analiz | neden: komşuda kömür |
| 8–12 | 23.93–34.03 | `construction`, `trade_coal`, `dossier`, `dossier_confirm` | Analiz → durgunluk | karar |
| 13 | 34.03–35.52 | SAVAŞ kartı (oyunun bayrakları) | Kriz | tırmanma |
| 14–17 | 35.52–43.52 | `war_orders`, `war_sweep`, `war_close` | Kriz, hep sağa | sonuç: cephe |
| 18 | 43.52–46.02 | `peace_offer` | Analiz | karar: kabul |
| 19 | 46.02–48.02 | `annex` (tek çekim, tık 47.52'de) | Kriz | sonuç: toprak |
| 20 | 48.02–49.52 | `coal_after` | Analiz | sonuç: kömür bizim |
| 21–22 | 49.52–52.02 | `trade_coal` → `trade_coal_after` (pirinç silme) | Analiz | ödeme: 0.00 → 1.31 |
| 23 | 52.02–53.52 | `industry_after` | Analiz | ödeme: 7 → 9 fabrika |
| 24–34 | 53.52–63.52 | tepki (HUD), kıyı, emirler, teknoloji, sanayi, siyaset, nüfus, ilhak, kömür, bayrak, çatışma | Kriz | kreşendo |
| 35 | 63.52–72.0 | `final_world` + logo | İmparatorluk | kontrol |

## Yakalanan oyun görüntüleri

Harita kare dizileri (`footage/<ad>/NNNN.jpg`, 1920×1080, JPEG q94, sanal
saat 1/60 sn/kare):

| ad | kare | oyun anı |
|---|---|---|
| ocean_open | 400 | Ocak 1836, coğrafya kipi, three.js deniz |
| land_reveal_geo / _pol | 480 + 480 | Ocak 1836, aynı kamera iki kipte |
| lorania_intro | 200 | Şub 1837, siyasi |
| coal_reveal | 300 | Şub 1837, kaynak kipi + Eldor kömür hex izleri |
| war_orders | 132 (6 hafta × 22) | savaş 0–5. hafta, general seçili (rotalar) |
| war_sweep | 260 (26 × 10) | savaş 0–25. hafta, işgal yayılımı |
| war_close | 168 (12 × 14) | savaş 4–15. hafta, Jorvale çevresi |
| annex | 320 | barış: 120. karede "Accept terms" |
| coal_after | 260 | Şub 1838, kaynak kipi |
| coast_fast | 120 | Şub 1838, kıyı |
| final_world | 600 | Şub 1838, tüm dünya geri çekilme |

Arayüz fotoğrafları (`footage/stills/*.png`, 3840×2160): hud_map, industry,
trade_coal, construction, budget, politics, technology, population, military,
dossier, dossier_confirm, ultimatum_hud, peace_offer, trade_coal_after,
industry_after, technology_after, population_after, flag_me, flag_foe.

## Çalıştırma

Gereken: Node 20+, Chrome, Python 3 + `pip install numpy scipy soundfile imageio-ffmpeg`.
Oyun sunucusu açık olmalı (`npm run dev`); adres farklıysa `GAME_URL`.

```bash
python trailer/audio/analyze.py      # müzik eğrileri (source.mp3 -> analysis.json)
python trailer/audio/beats.py        # tempo, vuruş, ölçü
python trailer/audio/sfx.py          # prosedürel efektler
node trailer/capture/story.mjs       # oyunu oyna + yakala (~25 dk)
python trailer/audio/mix.py          # miks, -14 LUFS
node trailer/render/render.mjs --workers 4             # ~16 dk
node trailer/render/contact.mjs out/imperial-eye-trailer.mp4
```

Hızlı deneme: `node render/render.mjs --stills 12.5,34.03 --dir scratch/x`
ya da `--from 30 --to 40 --out out/test.mp4`.

`audio/source.mp3` depoda yok: verilen dosyayı oraya kopyala.

## Yapı

| klasör | içerik |
|---|---|
| `audio/` | analiz, vuruş haritası, efekt sentezi, ipuçları (`cues.json`), miks |
| `capture/` | CDP sürücüsü, sanal saat, senaryo (`scenario.js`), çekim tanımları, `story.mjs` |
| `scenes/edl.js` | kurgu karar listesi — her zaman damgası bir müzik olayına bağlı |
| `motion/` | eğriler, yay, sarsıntı; kompozitör kamerası |
| `typography/` | maske açılışı, harf aralığı, pirinç çizgi |
| `effects/` | renk, gren, vinyet, duman, kor, kıvılcım, flaş, bulanıklık, SAVAŞ ve logo kartları |
| `render/` | kompozitör (Canvas2D, tarayıcıda), render sürücüsü, temas sayfaları |

## İnceleme — en zayıf üç an ve düzeltmeleri

1. **SAVAŞ darbe karesi (34.03).** İlk render'da parçanın en güçlü vuruşu en
   soluk kareye denk geliyordu: tam ekran flaş görüntüyü bej bir sise
   boğuyor, "WAR" henüz harf aralığı animasyonunun başındaydı ve merkez
   kıvılcımı "A"nın üstünde patlıyordu. Düzeltme: yazı darbeden 0.2 sn önce
   başlatıldı (karede oturmuş), flaş merkezden yayılan sıcak bir ışığa indi
   (kontrast korunuyor), ışınlar ve kıvılcım bayrak/yazının arkasına ve
   üstüne taşındı.
2. **Whip geçişleri.** Yönlü bulanıklık azalan ağırlıklı 8 kopyayla
   yapılıyordu; yazılar "1.31111111" gibi basamaklı yankılara bölünüyordu —
   fragmanın en ucuz görünen anı. Düzeltme: mesafeye göre 8–64 örnekli, eşit
   ağırlıklı birikimli gerçek kutu bulanıklığı. Aynı hata kamera hareket
   bulanıklığında da vardı: önceki karenin kamerası kenar sınırlamasından
   geçirilmediği için durağan çekimler "hızlı" sanılıp çift görüntü
   üretiyordu (ilan düğmesi).
3. **Karar ve barış kareleri karanlık ve çakışık.** BUILD/TRADE/TAKE
   kelimeleri odaklanan arayüz satırının üstüne biniyordu; COAL/SHORTAGE
   kıtlık satırıyla çakışıyordu; barış teklifi z≈1.6'da neredeyse siyahtı;
   iki odak maskesi üst üste binip kareleri öldürüyordu. Düzeltme: kamera
   önyargısıyla arayüz sağa, tipografi sola; kararma 0.8 → 0.62; odak maskesi
   dikdörtgenler arasında kayarak geçiyor; barış teklifi z≈3.5 ve gerçek bir
   bilgiyle ("THREE PROVINCES · ALL THREE COAL").

Ayrıca: duman efektinin "merkezi temizle" adımı haritanın kendisini silip
savaş çekimlerinin ortasında kara delik açıyordu (ayrı tuvale alındı);
"1836" Georgia'nın eski stil rakamlarıyla dalgalanıyordu (düz rakamlı yazı
tipine geçildi); oyunun göz amblemi menüdeki CSS süzgeci olmadan mavi
görünüyordu (aynı süzgeç uygulandı).

## Sınırlar

- **Ses kulakla dinlenmedi.** Zamanlama ölçümle kuruldu; seviyeler
  ölçüldü (miks -14.0 LUFS, gerçek tepe -4.2 dBTP; nefeste müzik -24 dB,
  SAVAŞ darbesinde -10 dB). Efektler prosedürel sentez (okyanus, top, darbe,
  whoosh, metal tık, kâğıt, kumaş, buhar) — kayıt değil; bir sesçinin
  elinden geçmesi iyi olur.
- **Müzik lisansı.** Parça La Casa de Papel'in film müziği; burada zamanlama
  referansı olarak verildi. Fragman herkese açık yayınlanacaksa lisans ya da
  aynı fraz yapısında bir besteyle değiştirme gerekir; kurgu `beatmap.json`
  olaylarına bağlı olduğundan yeni parçanın olayları girilip yeniden render
  edilebilir.
