# Autonomous development session — report

Bu oturum, bir önceki oturumun bıraktığı işi tamamladı: reform mekaniğinin
tasarımı orada doğrulanmış ama **ölçülen performans maliyeti yüzünden geri
alınmıştı**. Bu sefer önce maliyetin kökü bulundu, çözüldü, mekanik yeniden
bağlandı ve taban korunarak canlıya alındı.

---

## 1. WHAT I FOUND

### Ana bulgu — reformlar ölü mekanikti (önceki oturumdan devreden, kanıtlı)

```
$ grep -rn "from './reforms.js'" src/ | grep -v "ui/"
(çıktı yok)
```

21 yasa merdiveni, üst meclis oylaması, seçmen kütüğü ve hareketler vardı;
hiçbir simülasyon dosyası okumuyordu.

### Kök neden — bağın neden pahalı olduğu (BU oturumun teşhisi)

Site düzeyi profil suçluyu ismiyle verdi: **`ensureReforms`**. Sıcak yoldan
çağrılan `reformModifiers`, her seferinde `ensureReforms`'a giriyor, o da 21
merdivende `steps.findIndex(closure)` kuruyordu. Ölçüm:

| Deneme | Tahsisat | Tur |
|---|---|---|
| Taban (bağ yok) | 8.72 MB/hafta | 22 ms |
| Çarpan sıcak yoldan çağrılıyor | **32.61 MB/hafta** | 46 ms |
| YZ `reformBoard`'ı her hafta kuruyor | 30.07 MB/hafta | 45 ms |
| YZ çeyrek yılda bir değerlendiriyor | 10.69 MB/hafta | 24 ms |
| `ensureReforms` hızlı yol + kapanışsız döngü | **9.33 MB/hafta** | **22 ms** |

Yani sorun mekanik değil, **çağrı frekansı ve fonksiyon başına kapanış
maliyetiydi**.

### İkincil bulgular

- **`militancyOf`** hesaplanıyor, tüketicisi yok (`census.js:106`).
- **`audit:save` DÜŞÜYOR** — `battles` yüklemede birebir dönmüyor, 100 hafta
  sonra `population/nations/prices` dallanıyor. **A/B ile doğrulandı: bu hata
  reform bağından gelmiyor** (bağ stash'lenince de aynı şekilde düşüyor).
  Açık P1 olarak devrediyor.

---

## 2. WHAT I CHOSE TO FIX

Tek iş: **reformları canlı mekanik yapmak.** En yüksek etki (21 yasa × her
ülke), en düşük mimari risk (yeni sistem değil, var olan iki sistem arasına
tek kenar) ve zaten canlı olan omurgaya bağlanıyor:

```
yasa → hane bütçesi / memnuniyet / sanayi → satisfaction → stability
     → parti desteği → seçim → hangi yasaların geçebileceği
```

---

## 3. WHAT I IMPLEMENTED

| Dosya | Değişiklik |
|---|---|
| `src/game/reforms.js` | Etki katmanı: `refreshReformModifiers` / `reformModifiers`; `ensureReforms` hızlı yolu |
| `src/game/economy.js` | `beginEconomy`'de haftalık tazeleme + 5 kanca (hane bütçesi, memnuniyet, üretim, ücret faturası, sosyal yük) |
| `src/game/ai.js` | `reformAgenda` — YZ de aynı meclis kapısından geçer, çeyrek yılda bir |
| `scripts/reform-effect-diagnostic.mjs` | Yeni A/B tanılaması (`npm run diagnose:reform-effect`) |

**Mimari karar:** çarpanlar haftada bir kez, ekonomi fazının başında hesaplanıp
saklanır; sıcak yol yalnız düz alan okur. Ayrıca çarpanlar `WeakMap`'te tutulur,
**kayda girmez** — kayıt biçimi hiç değişmedi, göç gerekmedi.

---

## 4. BEFORE / AFTER

**ÖNCE:** Oyuncu 21 yasanın hepsini çıkarabiliyor, hiçbir sayı kıpırdamıyordu.

**SONRA:** Yasanın kazananı ve kaybedeni var. 52 haftalık A/B (aynı tohum, tek
değişken, özne YZ'den izole):

| Ölçü | Reform yapan − yapmayan |
|---|---|
| alt sınıf memnuniyeti | **+0.068** kazanan |
| üst sınıf memnuniyeti | **−0.008** kaybeden |
| istikrar | **+0.052** |
| sosyal maliyet | **+112%** |
| hazine | **−27%** (gerçek bedel, yıkım değil) |
| radikal parti desteği | **−0.60 puan** |

Kalibrasyon da ölçümle yapıldı; iki tuzak bulunup düzeltildi:
- Memnuniyet katsayısı düşükken reform yapan ülkenin **işçisi daha
  memnuniyetsiz** çıkıyordu (sanayi kısıntısı ücret tabanını aşındırıyor).
- `socialBurden` kaydıraç mertebesindeyken beş yasa ülkeyi **52 haftada
  iflas** ettiriyordu (hazine −%100). Üçte birine indirildi.

**YZ paritesi:** 260 haftada canlı 28 ülkenin **28'i** reform yaptı (ortalama
28.8 kademe), borçlu 0, bozuk 0, istikrar 0.42/0.64/0.79.

---

## 5. TEST RESULTS

| Test | Sonuç |
|---|---|
| `diagnose:reform-effect` 52w / 260w | **passed** |
| `diagnose:reforms` / `politics` / `pops` | exit 0 |
| `audit:determinism` | bulgu yok |
| Tahsisat | 9.33 MB/hafta (taban 8.72, **+%7**) |
| Haftalık tur | 22 ms (taban 22, **değişmedi**) |
| Kayıt/yükleme — yasalar + çarpanlar | korunuyor |
| `audit:save` | **DÜŞÜYOR — önceden var olan hata**, A/B ile bu işten bağımsız olduğu gösterildi |

---

## 6. IMPORTANT THINGS I DID NOT IMPLEMENT

- **`audit:save` dallanması** — bu oturumun en önemli açık bulgusu.
- **Militancy'nin gerçek durum olması** ve huzursuzluk kademeleri
  (discontent → hareket → grev → isyan).
- **POP kohortlarında kültür bileşimi** — harita azınlığı gösteriyor, sayım
  defteri saymıyor.
- **Reform gerekçelerinin UI'da gösterimi** ("Alt sınıf desteği +6: oy hakkı
  reformu"). Mekanik canlı ama oyuncu nedeni ekranda görmüyor.
- Tahsisat geçişi: taban profil çıkarıldı (economy 2.8 / command 1.0 /
  cities 1.0 / construction 0.8 MB), optimizasyon yapılmadı.

---

## 7. RECOMMENDED NEXT 5 TASKS

| # | Görev | Etki | Risk | Karmaşıklık |
|---|---|---|---|---|
| 1 | `audit:save` dallanmasını bulmak (battles + 100w population/prices) | Çok yüksek | Düşük | Orta |
| 2 | Reform gerekçelerini siyaset ekranında göstermek | Yüksek | Düşük | Düşük-orta |
| 3 | Militancy'yi saklanan duruma çevirip huzursuzluk kademeleri | Yüksek | Orta | Yüksek |
| 4 | POP kohortlarına kültür bileşimi | Yüksek | Orta | Orta-yüksek |
| 5 | Tahsisat geçişini tamamlamak (9.3 → <5 MB/hafta) | Orta | Düşük | Orta |

---

## Bu oturumun dersi

Geçen oturum mekaniği "pahalı" diye geri almıştı. Pahalı olan mekanik değil,
onu **sıcak yoldan çağırma biçimiydi**: aynı iş haftada bir kez yapılıp düz
alandan okununca maliyet 32.6 MB'den 0.7 MB'ye indi. Ölçüm olmadan bu ayrım
görülemezdi — "geri al" doğru karardı, "bir daha deneme" olmazdı.

---

# REFORM KAPISI — ikinci geçiş (bu oturum)

Reformlar çıkarılabiliyordu ama fazla kolaydı: oyuncu merdivenleri tek
oturumda tırmanıyordu. Kapı, tek bir eşik olmaktan çıkıp dört koşullu bir
siyasi süreç hâline getirildi.

## Denetim: neyin zaten karşılandığı

Spec'in üç maddesi mevcut sistemde zaten vardı ve korundu:
§7 adım adım ilerleme, §2 ideolojik destek (merdiven başına ideoloji isteği),
§15 YZ'nin aynı kapıdan geçmesi. Yeni sistem kurulmadı, mevcut olanın üstüne
inşa edildi.

## Ne eklendi

| Koşul | Uygulama |
|---|---|
| Eşik kademesi | minor %50 / normal %50 / major %55 / **anayasal %60** |
| Bekleme | 26 / 52 / 78 / **104 hafta**, geri sayım olarak |
| **Baskı** | huzursuzluk ×0.55 + meseleye özel hareket ×0.45 |
| Yorgunluk | yasa başına +15…38, haftada −0.6 erir, desteği %25'e kadar düşürür |
| Hükûmet | otokraside idari yasa −%5 eşik, siyasi yasa **+%8** |
| Kriz istisnası | huzursuzluk ≥%70 **ve** hareket ≥%50 → sayaçtan 26 hafta düşer, bedeli +12 yorgunluk |
| Siyasi şok | talebi karşılanan parti popülaritesi ×0.96, karşı taraf ×1.05 (anayasalda ×1.09) |

Tasarımın kalbi **baskı**: statükocu meclis normalde reddeder, sokak ısındıkça
uzlaşır. İdeolojiler farklı esner — muhafazakâr 0.65 (pragmatik), gerici 0.08
(uzlaşmaz), komünist 0.35 (reformu zaten yetersiz bulur). Tavan 0.75: hiçbir
baskı bir meclisi tam ikna etmez.

## Senaryo testleri (`npm run diagnose:reform-gate`)

| Test | Sonuç |
|---|---|
| A — durgun gerici meclis | anayasal reform **0 açık**, destek %3 / %60 |
| B — liberal meclis | tek oturumda **1 yasa**, 20'si sayaca takılı, 51 hafta |
| C — baskı | muhafazakâr destek **%17 → %46** huzursuzlukla |
| D — spam denemesi | 5 tur süpürme → **1 yasa**, yorgunluk 24.4 |
| E — sayaç dolunca | beklerken kilitli, süre bitince yeniden açık |

## Uzun koşu (260 hafta, 33 ülke)

Kademe yayılımı **min 8 / medyan 13 / maks 18**, merdiveni bitiren **0** ülke,
ortalama yorgunluk 15.9. Ülkeler farklı hızlarda liberalleşiyor — istenen
davranış bu.

## Oyuncu geri bildirimi

Kilitli basamak yüzde yerine engelin kendisini gösterir (`about 12 months`);
tooltip tam dökümü verir — tarayıcıdan alınan gerçek çıktı:

```
Good Minimum Wage — normal reform
Support 65.0% of 50.0% required
Socialist 55.7% · Conservative 4.0% (reluctant) · Liberal 3.3% (reluctant)
Institutions are still adjusting to the previous reform — about 12 months
```

"(reluctant)" işareti baskıyla ikna olmuş grubu ayırır: oyuncu desteğin
nereden geldiğini ve kırılgan olduğunu görür.

Kart kenarı durumu renklendirir: hazır pirinç, destek bekleyen kırmızı, sayaç
bekleyen soluk.

## Ölçümler

| | Değer |
|---|---|
| Tahsisat | **8.98 MB/hafta** (taban 8.72; önceki geçiş 9.33) |
| Haftalık tur | 23 ms (taban 22) |
| Kaydırma | p50 0.9 ms, p95 1.6 ms |
| Kayıt/yükleme | sayaç + yorgunluk korunuyor, eski kayıtlar 0 varsayılanıyla göçer |
| audit:determinism | bulgu yok |

Tahsisat önceki geçişten **düştü**: reformBoard iklimi bir kez kurup bütün
satırlara paylaştırıyor, 21 kez meclis sayma bitti.

## Yapılmayan

**§12 reformların geri alınması** bu geçişe girmedi — ayrı bir mekanik (gerici
hükûmetin merdiveni aşağı inmesi) ve aynı kapıdan geçmesi gerekiyor. Kalan
açık bulgu audit:save dallanması hâlâ duruyor ve bu işten bağımsız.
