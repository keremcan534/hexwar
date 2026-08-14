# Makro Dünya — Vic2 tarzı kurgusal jeopolitik şablon

Amaç: "Bu Dünya değil" ama "stratejik mantığı hemen anlıyorum" hissi.
Silindirik (doğu-batı sarmal) haritada, rol atanmış makro bölgeler ve
arketip güçler. Hiçbir bölge/ülke gerçek adlarla anılmaz.

> **Bu belge ROLLERİ anlatır.** Bölgelerin fiziksel biçimi — kıta iskeleti,
> kıyı, iç deniz, boğaz, sıradağ — [cografya.md](cografya.md) içindedir.
> Standart dünya artık **160 × 96**'dır; aşağıdaki (u,v) konumları eski blob
> şablonundan kalmadır ve yalnız rollerin göreli yerleşimini anlatır.

## Faz 1 — Mevcut durumun denetimi (uygulama öncesi)

| Konu | Durum |
|---|---|
| Kıta üretimi | Saf periyodik Perlin fBm + enlem sönümü; yüzdelik deniz seviyesi (%34 kara). Makro yapı YOK: kıtalar rastgele, rol yok, garanti okyanus koridoru yok, boğaz yok |
| Ülke doğuşu | En-uzak-nokta tohum + province grafında ağırlıklı büyüme; sayı `clamp(kara/95, 4, 30)` → 200×160'ta 30 ülke; TÜM kara paylaştırılıyor (sahipsiz sınır/kolonizasyon alanı kalmıyor) |
| Province bölümleme | 2-7 hexlik kümeler, ort. 4.07; 200×160'ta 2.675 province |
| Ülke başına province | ~%100 sahiplik / 30 ülke ≈ **ort. 89 province/ülke** — hedefin (3-35) çok üstünde |
| Arazi | elev+nem+sıcaklık; kutup/at-enlemi kuşakları. Şablon dağ zinciri yok |
| State | constructionAtlas: ülke başına ≤12 state, state ≈ 3 küme |
| Kültür | ≤14 rastgele blob; kümeye snap; çekirdek (core) ve kabul edilen kültür sistemi YOK; tek kanca: `tileEfficiency` yabancı kültür cezası |
| Nüfus/gelişim | Yalnız araziden türetilir; makro asimetri yok; sanayi çekirdeği yok; herkes 1 şehirle başlar |

## Faz 2 — Makro şablon (silindirde)

Boylam `u∈[0,1)` dairesel, enlem `v∈[0,1]` (0.5 ekvator). Her tohum için
şablon `${seed}-macro` dalıyla küresel döndürme + blob başına jitter alır:
iskelet aynı, dünya her tohumda farklı. Dikiş hiçbir zaman "haritanın kenarı"
değildir — okyanuslardan biri döndürmeyle rastgele bir boylama düşer.

Kara, rol atanmış çekirdek bloblarından + gürültü detayından doğar; bloblar
arası bantlar okyanus kalır (yüzdelik deniz seviyesi bunu garantiler).

| Bölge (zone id) | Rol | Konum (u,v merkez) | Not |
|---|---|---|---|
| `yeni-kuzey` | Amerika-benzeri kuzey | .245,.30 | Doğu kıyısı yerleşik, iç batı sınır konfederasyonlarında |
| `kistak` | Orta köprü | .272,.475 | İnce kara köprüsü = stratejik geçit |
| `yeni-guney` | Latin-benzeri güney | .30,.64 | Parçalı cumhuriyetler; batıda sıradağ |
| `yogun-bati` | Avrupa-benzeri yoğun siyasi bölge | .475,.30 | Küçük province'ler, çok ülke, sanayi çekirdeği |
| `ic-deniz` | Akdeniz-benzeri iç deniz (negatif blob) | .515,.445 | Batı ağzı boğaz; kıyıları ticaret kuşağı |
| `kavsak` | Osmanlı-benzeri gerileyen kavşak | .565,.445 | İç deniz ↔ sıcak körfez arası; karışık kültür |
| `kuzey-bozkiri` | Rusya-benzeri kara imparatorluğu | .66,.17 | Geniş, seyrek, düşük gelişim |
| `guney-yarimada` | Hindistan-benzeri yarımada | .70,.58 | Yüksek nüfus; kuzeyinde aşılmaz sıradağ yayı |
| `dogu-ovasi` | Çin-benzeri nüfus devi | .84,.44 | Dev nüfus, düşük sanayi |
| `dogu-adalari` | Japonya-benzeri ada modernleşicisi | .965,.34 | Sarmalı dikişe yakın düşebilir — sorun değil |
| `guney-kita` | Afrika-benzeri kolonizasyon alanı | .49,.70 | Kıyı krallıkları + kabile birlikleri; iri province'ler |
| `baharat-adalari` | Ada zinciri | .93→.06,.62 | Deniz yolu basamakları (Grand Ocean'ı köprüler) |
| `korsan-adalari` | Karayip-benzeri küme | .21,.50 | Kıstak önü ada kümesi |

Sıradağ şeritleri (şablon kaynaklı, aşılmaz): yarımada-kuzeyi yayı
(Himalaya işlevi), güney yeni dünyanın batı kıyı sırtı (And işlevi),
bozkır-batı ayracı (Ural işlevi).

Okyanuslar: `u≈.02-.14` Büyük Okyanus (Yeni Dünya batısı ↔ Doğu Adaları),
`u≈.38-.43` Ayrım Okyanusu (Yeni Dünya ↔ Eski Dünya). Deniz yolları:
iç deniz ağzı boğazı, kıstak kıyı suları, baharat zinciri, ada üsleri.

## Faz 3 — Jeopolitik kurulum (arketipler)

Adlar üretimden gelir (mevcut ad üreteci); roller şablondan.

| Arketip | Bölge | Çekirdek province | Ek |
|---|---|---|---|
| Denizci koloni imparatorluğu | yogun-bati (kıyı) | 14-18 | `guney-yarimada`nın ~%70'i KOLONİ (çekirdek değil, kabul edilmeyen kültür) + 2-3 ada üssü |
| Kuzey kara imparatorluğu | kuzey-bozkiri | 24-31 | Düşük gelişim; çok kültürlü doğu ucu |
| Bileşik monarşi | yogun-bati (merkez-doğu) | 14-20 | 3 kültür: 2'si KABUL EDİLMİŞ — kırılgan çokluk |
| Gerileyen kavşak imparatorluğu | kavsak (+iç deniz kıyıları) | 12-18 | Karışık kültür; düşük istikrar başlangıcı |
| Doğu devi | dogu-ovasi | 24-32 | Nüfus ×3; sanayi 0; büyük gelecek |
| Ada modernleşicisi | dogu-adalari | 5-8 | Yüksek gelişim eğilimi |
| Yeni dünya federasyonu | yeni-kuzey (doğu kıyısı) | 10-16 | Batısı sınır konfederasyonu — yerleşimci genişleme |
| Güney cumhuriyetleri (3-5 ülke) | yeni-guney | 4-8'er | Kaynak zengini, sanayisiz |
| Yoğun-batı küçükleri (5-8 ülke) | yogun-bati | 3-12'şer | Avrupa dokusu |
| Kıyı krallıkları (3-4 ülke) | guney-kita kıyısı | 2-5'er | İç bölge kabile birliklerinde |

## Faz 3b — Doldurma: dünyada sahipsiz toprak kalmaz

Arketip planı yalnız BÜYÜK güçleri kurar (~20-24 ülke) ve dünyanın ancak
üçte birini kaplar. Kalan toprak boş bırakılmaz: `nations.fillRemaining`
her sahipsiz province kümesini bölge karakterine göre devletlere böler.

| Kural | Değer |
|---|---|
| Sahipsiz province | **0** (her kara bir devlete bağlı) |
| Toplam ülke (160×96) | ~53-63 |
| Doldurma devleti boyu | bozkır 28, güney kıtası/yeni kuzey 26, yoğun-batı 10 province (harita boyuyla üsse 0.6 ölçeklenir) |
| Üst sınır | 24 province/devlet (Voronoi sapmasını keser) |
| İzole ada kümesi ≤12 province | devlet değil, en yakın kıyı ülkesinin **deniz aşırı** toprağı |
| Kara cebi ≤3 province | en KÜÇÜK komşuya katılır (bant şişmesin) |

Doldurma rolleri: `bozkir-boyu`, `kabile-birligi`, `sinir-konfederasyonu`,
`bati-prensligi`, `kavsak-beyligi`, `dogu-beyligi`, `yarimada-beyligi`,
`kistak-beyligi`, `ada-beyligi`. Hepsi `devTier 0`, ikinci şehirsiz ve
tek kültürlü doğar.

**Neden:** kolonizasyon gerilimi BOŞLUKTAN değil ZAYIFLIKTAN gelmeli. Boş
harita politik kipte gri bir levha gibi okunuyordu (ölçüldü: karenin yalnız
%35'i sahipli). Artık dünya dolu ama sınır boyları hâlâ av alanı.

**Bedeli:** sahipsiz toprağa bedava yerleşme yolu (`TurnManager.occupy` →
`claim`) fiilen kapanır; genişleme savaş ister.

Geçilmez arazi (dağ, zirve, buz) hiçbir province'e üye olmaz ama en yakın
province'e "etek" olarak bağlanır: ekonomiye girmez, politik haritada o
province'in sahibinin renginde görünür (bkz. provinces-gen.attachImpassableFringe).

## Faz 4 — Yoğunluk

Province boyu bölgeye göre değişir (bölümleme kotası şablondan):

| Bölge | Hedef hex/province |
|---|---|
| yogun-bati, adalar | 4-5 |
| kavsak, guney-yarimada, dogu-ovasi, yeni-guney (kıyı) | 6-8 |
| yeni-kuzey iç, guney-kita kıyı | 9-12 |
| kuzey-bozkiri, guney-kita iç, sınır boşlukları | 12-18 |

Beklenen: ~1.300-1.500 province (2.675 yerine) ve ülke başına 3-35 bandı.

## Faz 5 — Kültür / çekirdek / kabul edilen kültür

- Kültürler bölge ailelerinden doğar (bölge başına 1-3; guney-kita çok
  parçalı). Ülkenin `culture` birincil kültürüdür.
- Yeni alanlar: `nation.accepted: number[]` (birincil dahil),
  `province.coreOf: nationId | -1` (üretimde ev toprakları çekirdek,
  koloniler DEĞİL).
- Kancalar (küçük, mevcut sistemlerin içine):
  - Vergi: çekirdek olmayan province `provinceOutput.gold ×0.55`.
  - İnsan gücü: kültürü kabul edilmemiş province `provinceManpower ×0.35`.
  - Verim/entegrasyon: `tileEfficiency` kabul edilen kültürleri tam sayar.
- Nüfus/gelişim çarpanları bölgeden: dogu-ovasi ×3.0, guney-yarimada ×2.6,
  yogun-bati ×1.6 (+ticaret geliştirmesi +1), guney-kita iç ×0.5,
  yeni-kuzey iç ×0.25, bozkır ×0.6. Büyük güçler 2. şehirle başlar
  (sanayi çekirdeği hissi).

## Doğrulama (audit:world)

1. Arketiplerin hepsi doğdu mu (bölge-rol eşleşmesi)?
2. Ülke başına province bandı (3-35) tutuyor mu; ortalama ≤ 20 mi?
3. Sahipsiz province kalmadı mı (%0)?
4. Yarımada kolonisi: nüfus ≥ sahip ülkenin ev nüfusunun ~%60'ı, kültürü
   kabul edilmemiş, çekirdek değil mi?
5. İç deniz var mı (kapalı deniz hücresi) ve ağzı dar mı?
6. Dikişte kıta bütünlüğü (wrap-audit zaten garanti ediyor)?
7. Yoğun-batıda ≥6 ülke; bozkırda tek dev; doğuda nüfus devi mi?
8. Kolonizasyon alanı: guney-kita iç province'lerinin ≥%70'i gelişmemiş yerel devletlerde mi (dev 0)?
