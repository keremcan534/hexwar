# `beta3-war-pressure` — dal notu

**Taban:** `aab5f5c` (master) · **Dal ucu:** `5da6684`
**Kapsam:** `ai.js`, `diplomacy.js`, `infamy.js` (+ `peace.js` ve `game.js`'te
birer kancacik, aşağıda gerekçesi var) · **Kaynak:** Open Beta 3 kör kampanya
bulguları, bkz. [OPEN_BETA_3_PLAYTEST.md](OPEN_BETA_3_PLAYTEST.md).

## Bu dal neyi onarıyor

| # | Bulgu | Onarım | Ölçüm (önce → sonra) |
|---|---|---|---|
| 1 | Sürekli savaşan ülke dokunulmazdı | `ai.js` hedef kapısı: üçüncü saldırgan hiç binmez, ikincisi 2,2 kat güç + gerçek sınır ister | oyuncuya açılan savaş **1 → 34** / 64 yıl |
| 2 | Savaşlar 11 haftalık baskındı | `MIN_WAR_TURNS` 8 → 16; kazanan ilk ucuz kümede masaya oturmaz (cephe 18 hafta durmalı ya da talep tavana dayanmalı) | dünya ortancası **11 → 20 hafta**, 16 haftadan kısa savaş %69 → %0 |
| 3 | İlhak bedavaydı, şöhret yalnız işgalde birikiyordu | `infamy.annexInfamy`: kare + şehir + nüfus + kültür üzerinden, barış masasında | 3 kümelik barış **0 → 20,1 şöhret** (eşik 22) |
| 4 | Salam taktiği serbestti | Ateşkes tekrarla ölçekleniyor: 40 → 72 → 104 … dört yılda tavan | aynı çifte 64 yılda 14 savaş artık mümkün değil |
| 5 | Çullanma tavanı yalnız `ai.js`'teydi | Tavan `declareWar` içine taşındı — bütün yolların ortak geçtiği yer | azami oyuncu cephesi **2**, dünya tavanı **3** |

**Ölçülen kök neden (5. madde):** tur 755'te oyuncu üç cephedeyken dördüncü
cephe açıldı ve onu **oyuncunun kendisi ilan etti** — `checkCoalitions` oyuncuyu
da koalisyon üyesi sayıyordu. Artık `declareWar` üç nihai kapı işletir: oyuncu
adına otomatik ilan yok (`manual` bayrağı şart), bir ulusa en fazla üç saldırgan,
oyuncuya istemsiz en fazla iki cephe. Koalisyon oyuncuya **karşı** hâlâ kurulur.

**Dünya sağlığı:** sınır değişimi 136 → 191 küme, en büyük ülke %10,3 → %12,4,
ülke sayısı 61 → 61 (eleme yok), küçük ülke 32 → 34.

**Yeni denetimler:** `npm run audit:war-pressure`, `npm run audit:war-guard`.
Önceki dalın kapıları (`audit:war-outcome`, `audit:borders`) bozulmadı.

## Onarılmayan bilinen sorunlar

| kod | sorun | durum |
|---|---|---|
| P-1 | Geç oyun hafta maliyeti 80 → 212 ms (1871-1899) | **P2**, aşağıda |
| E-1 | Ekonomi iki kutuplu: absürt zengin ya da kalıcı ölü | kapsam dışı |
| — | Savaş komutasında yetki/geri bildirim | kapsam dışı |
| — | 14 savaş hiç kapanmıyor (donmuş cephe) | bu dalda **artmadı** (15 → 14), ayrı iş |
| — | İkinci cephe eşiği (2,2 kat) sondada hiç reddetmedi | fiilî sınırlayıcı çullanma tavanı; eşik şimdilik ölü kalıyor |

## Neden `command.js` performansı şimdilik P2

Geç oyun hafta maliyeti 80 ms'den 212 ms'ye çıktı. Sebep doğrudan ölçüldü:
eşzamanlı savaş ortalaması 9,8 → 12,2 ve yük `command.js`'in cephe hesabına
biniyor. Üç sebeple P0/P1 değil:

1. **Oynanabilirlik penceresi taban çizgisinde kaldı.** 1836-1870 ortalaması
   84 → 87 ms; kampanyanın karar yoğun kısmı etkilenmedi.
2. **Kare hızı düşmüyor.** Haftalık iş `pumpTurn` ile 5,5 ms'lik kare bütçesine
   dilimleniyor; artan maliyet bir haftanın daha çok kareye yayılması demek.
3. **Bu dalın işi değil.** Sorun `command.js`'in cephe hesabının ölçeklenmesi;
   burada tek satırı bile değişmedi. Ayarla kapatılırsa savaş temposu geri
   alınmış olur — yani asıl onarım geri alınır.

Ayrı bir performans dalının konusu: profil zaten faz düzeyinde yerelleşmiş
(1899: command 115,3 · economy 20,1 · orders 10,2 · ai 5,9).

## Neden para muslukları kapsam dışı

Beta 3'te ölçüldü: barışta 56.430 altın birikiyor, haftalık gelir 205. Gerçek
ve büyük bir sorun — ama **ekonomi** dalı. Bu dal `ai.js`/`diplomacy.js`/
`infamy.js` ile sınırlı tutuldu ki savaş temposundaki değişimin etkisi
ölçülebilir kalsın. Ekonomiye aynı anda dokunulsaydı, iki koşu arasındaki fark
artık savaşa değil, kimin ne inşa ettiğine bağlanırdı (denetim tezgâhının
2. kuralı: ekonomik kaldıraçlar savaşsız ölçülür).

## Neden UI yetkisi kapsam dışı

Beta 2'nin 3. sorunu — "savaş komutasında yetki ve geri bildirim yok" — Beta
3'te **ölçülmedi**: koşu başsızdı, tek bir düğmeye basılmadı. Ölçülmemiş bir
şey onarılmaz. Bu başlık önce elle bir UI oturumu ister; kod değişikliği o
oturumdan sonra tanımlanmalı.

Aynı sebeple bu daldaki "oyuncu adına savaş ilan edilmez" kuralı şimdilik
**sessiz bir ret**tir. Doğru davranış, koalisyona katılma teklifinin oyuncuya
bir karar olarak sunulmasıdır; o bir UI işidir ve bilerek ertelendi.
