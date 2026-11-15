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
| Projeksiyon | **Miller**, 83.6°K – 63.1°G: 160×96 hex oranı tam bu aralığa denk gelir. Antarktika yok, dikiş Bering'de (−169°), Avrupa-Afrika ortada. Üstüne **Avrupa ve Anadolu mercekleri** (aşağıda) |
| Menü | New Campaign: **World: Procedural / Earth**. Earth'te boy, kıtasallık ve kara oranı kapanır; **tohum = siyaset** (ülke, sınır, ad, halk, province bölümü). Ana raydaki Random World prosedürel kalır |
| Dağılım | Bugünkü makro roller gerçek bölgelere (aşağıdaki tablo); nüfus ve kaynak bugünkü kuraldan: arazi × bölge çarpanı |

## Mercekler: Avrupa ve Anadolu büyütülür

Kerem (2026-11-15): "Avrupa'nın küçük kalması bu tarz oyunlarda sıkıcı olur",
"Türkiye de önemli". Saf Miller'da Avrupa kara hexlerinin yalnız %4.9'uydu
(224 hex), Sibirya ve Kanada ise kutup şişmesiyle dev. Paradox haritalarının
hilesi uygulanır: projeksiyonun üstüne yumuşak büyüteçler
([earthGrid.js](../src/world/earthGrid.js) `EARTH_GRID.lenses`).

- Profil `ρ → ρ·(1 + (m−1)(1−ρ²)²)`: merkezde iki yönde de ×m (biçim
  bozulmaz), elips kenarında 1'e söner. m < 2.25 iken bire bir ve tersinir
  (ileri-geri hata 4·10⁻¹³ derece).
- **Avrupa** (16°D, 49°K; m 1.55): yogun-bati 224 → 401 hex. **Anadolu**
  (34.5°D, 39.2°K; m 1.28, doğu-batı uzun elips): Avrupa merceğinin
  çekirdeğinde zaten ×1.43'tü, toplam ~×1.8; kavsak 218 → 237 hex.
- Bedeli halkadadır: Kuzey Atlantik, Arktik, Sahra'nın güneyi ve Arabistan
  basıklaşır (Afrika 550 → 484 hex). Satır/sütun sayısı değişmez.
- Mercek değişirse dar geçit çizgileri yeniden seçilir (`--probe`); bağlantı
  denetimi kaymayı yakalar.

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
rasterde kapanır. Bu yüzden geçitler elle listelenir
([curation.mjs](../scripts/earth/curation.mjs) `PASSAGES`) ve denetimle
kanıtlanır (13 deniz yolu, 15 kara yolu, 10 ayrı kara). Çizgi komşu hex
merkezlerinden geçer, yalnız gereken hexi değiştirir:

- **Suya döner:** Tanca (%55), Gelibolu (%69) ve İzmit (%60) — İstanbul hexi
  kara kalır, Marmara zaten su —, Sund'da Zelanda kuzeyi (%31), Aden (%52),
  Johor (%65). Manş, Kerç, Otranto, Hürmüz, Bering kendiliğinden açık;
  çizgileri kapanmasın diye durur.
- **Karaya döner:** Panama ve Orta Amerika (7 hex), Kra-Patani (3 hex).
  Süveyş kendiliğinden bağlı.
- Küçük ada: hex alanının beşte birini dolduran ada korunur (49 ada: Girit,
  Kıbrıs, Korsika, Zelanda, Jamaika, Hawaii…).

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
