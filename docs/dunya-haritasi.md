# Earth — gerçek Dünya haritası seçeneği

Prosedürel dünyanın yanına ikinci seçenek: coğrafya gerçek Dünya, ülkeler
yine oyunun üreticisiyle rastgele. Dönem oyunun dönemidir (1900–1945).

> Bu belge EARTH'ü anlatır. Prosedürel kıta iskeleti
> [cografya.md](cografya.md), rollerin siyasi anlamı
> [makro-dunya.md](makro-dunya.md) içindedir. Earth yalnız BİÇİM kaynağını
> değiştirir: roller, kültür, province, ekonomi, siyaset ve ordu aynı kodla
> çalışır.

## Kararlar (Kerem, 2026-11-15)

| | Karar |
|---|---|
| Veri | Natural Earth 1:10m (kara, küçük adalar, göller, tarihî göller, nehirler, buzullar; kamu malı) · NOAA ETOPO1 yükseklik/derinlik, 0.1° (ABD kamu malı) · Köppen-Geiger **1901–1930** (Beck vd. 2023, CC BY 4.0: künyede atıf) |
| Izgara | **160 × 96**, yatay sarmal — standart dünyanın yoğunluğu ve dengesi |
| Projeksiyon | **Miller**, 83.6°K – 63.1°G: 160×96 hex oranı tam bu aralığa denk gelir. Antarktika yok, dikiş Bering'de (−169°), Avrupa-Afrika ortada |
| Menü | New Campaign: **World: Procedural / Earth**. Earth'te boy, kıtasallık ve kara oranı kapanır; **tohum = siyaset** (ülke, sınır, ad, halk, province bölümü). Ana raydaki Random World prosedürel kalır |
| Dağılım | Bugünkü makro roller gerçek bölgelere (aşağıdaki tablo); nüfus ve kaynak bugünkü kuraldan: arazi × bölge çarpanı |

## Boru hattı

```
kaynak veri (depo dışı, fetch-earth.mjs)
  → build-earth.mjs: ince eşdikdörtgen raster (kara/göl/buz) + ETOPO + Köppen
  → hex başına ölçüm (Miller'da hex alanı; örnek hücre ağırlığı sec(0.8φ))
  → elle listelenmiş boğaz / kara köprüsü / ada düzeltmeleri
  → nehirler hex KENARINA oturtulur, bölgeler gerçek bölge tablosundan
  → src/world/earth/earth-160x96.js (tek modül, base64)
oyun: earth.js buildGeography sözleşmesini verir → worldgen Earth dalı
```

Depoya yalnız işlenmiş modül ve betikler girer; kaynak veri girmez. Betik
bağımlılıksızdır (zip, shapefile, NetCDF-3, GeoTIFF okuyucuları kendi içinde).

Ham ölçüler saklanır, oyun kuralı kodda kalır: modül "bu hexin yüksekliği,
engebesi, iklimi" der; hangi arazi tipine düştüğüne `src/world/earth.js`
karar verir. Böylece arazi kuralı değişince veri yeniden üretilmez.

## Bölgeler → roller

| Gerçek bölge | Bölge kimliği |
|---|---|
| Avrupa (Urallar'ın batısı, Rusya hariç), Britanya, İzlanda | `yogun-bati` |
| Rusya, Sibirya, Kafkasya'nın kuzeyi, Orta Asya, Moğolistan | `kuzey-bozkiri` |
| Anadolu, Kafkasya'nın güneyi, Levant, Mezopotamya, Arabistan, İran, Afganistan, Mısır, Libya | `kavsak` |
| Hindistan alt kıtası, Seylan | `guney-yarimada` |
| Çin, Mançurya, Kore, Tibet, Doğu Türkistan, Çinhindi, Malaya | `dogu-ovasi` |
| Japonya, Ryukyu, Tayvan, Kuriller | `dogu-adalari` |
| Endonezya, Filipinler, Borneo, Yeni Gine, Melanezya | `baharat-adalari` |
| Afrika (Mağrip dahil), Madagaskar | `guney-kita` |
| Kanada, ABD, Alaska, Grönland, Arktik adalar, Avustralya, Yeni Zelanda | `yeni-kuzey` |
| Meksika, Orta Amerika | `kistak` |
| Karayipler | `korsan-adalari` |
| Güney Amerika | `yeni-guney` |
| Uzak okyanus adaları | `acik-deniz` |

Arketiplerin çapası rol başına gerçek bir yerdedir (denizci imparatorluk
Kuzey Denizi kıyısı, bileşik monarşi Tuna havzası, kuzey imparatorluğu
Moskova, kavşak Anadolu, doğu devi Orta Ova, ada modernleşicisi Kantō, yeni
federasyon Atlantik kıyısı…). Ülkenin kendisi, adı ve sınırı tohumdan doğar;
çapa yalnız "büyüme nereden başlar" sorusunu yanıtlar.

## Dar geçitler

160 sütunda hex ~250 km: Cebelitarık (14 km) ya da İstanbul Boğazı (1 km)
rasterde kapanır. Bu yüzden geçitler elle listelenir ve denetimle kanıtlanır:

- **Deniz yolu açık:** Cebelitarık, Çanakkale–Marmara–İstanbul, Kerç, Manş,
  Kuzey Kanalı, Danimarka boğazları, Otranto, Bab-ül Mendeb, Hürmüz, Malakka,
  Bering.
- **Kara bağlı:** Süveyş kıstağı, Panama, Kra kıstağı, Kore.

## Denetim

- `npm run audit:geography -- --earth` · `audit:world -- --earth` ·
  `audit:province -- --earth`: Earth kipinde kara oranı, geçit listesi,
  arketipler, province bandı.
- `npm run audit:determinism` + taban izi: prosedürel dünya birebir aynı kalır.
- `scripts/ui/hx.mjs`: menüden Earth, birkaç hafta akış, iki zoomda görüntü.

## Sonraki adımlar (ilk dilimden sonra)

- Gerçek kaynak kuşakları (kömür, demir, petrol, kauçuk) küçük bir tabloyla.
- Kanallar (Süveyş 1869, Kiel 1895, Panama 1914): hem kara hem deniz geçişi.
- Daha büyük ızgara (200×120) ölçümü.
