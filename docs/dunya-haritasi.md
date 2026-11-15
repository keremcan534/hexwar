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
- **Avrupa** (16°D, 49°K; m 1.55): yogun-bati 224 → 401 hex; province
  sayısı (104) prosedürel standart dünyayla birebir aynı. **Anadolu**
  (34.5°D, 39.2°K; m 1.28, doğu-batı uzun elips): Avrupa merceğinin
  çekirdeğinde zaten ×1.43'tü, toplam ~×1.75.
- **Hindistan** (m 1.65) ve **Doğu Asya** (Çin, Kore, Japonya; m 1.5): rol
  tasarımının iki nüfus devi. Saf Miller'da Hindistan 86, Japonya 10 hexti,
  denizci imparatorluğun kolonisi 2-4 province kalıyordu. Şimdi Hindistan
  158, Japonya 15 hex; koloni 6 province ve ana yurdun 2.5-3 katı nüfus.
- Bedeli halkadadır: Kuzey Atlantik, Arktik, Sahra'nın güneyi, Arabistan,
  Tibet, Hint Okyanusu ve Pasifik basıklaşır (Afrika 550 → 484 hex).
  Satır/sütun sayısı değişmez.
- Geçitler en ucuz yol aramasıyla açıldığı için mercek oynayınca kendiliğinden
  uyar; bağlantı denetimi yine de her üretimde koşar.

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
kanıtlanır (13 deniz yolu, 15 kara yolu, 10 ayrı kara). Liste yalnız YÖN
verir: betik çizginin bir hex çevresinde en ucuz yolu arar (suya dönen hexin
bedeli kara payı); %90'ı yanlış türde olan hexe yalnız başka yol yoksa
dokunur. Sabit hex listesi her mercek ayarında elle yeniden seçilmek
zorundaydı; uzun serbest çizgi Hampshire'ı (%80) siliyordu.

- **Suya döner:** Tanca (%55), Gelibolu (%69), Trakya'nın Karadeniz kıyısı
  (%51) — İstanbul'un hexi `keep` ile kara kalır, Marmara zaten su —, Sund'da
  Zelanda kuzeyi (%31), Aden (%52), Johor (%65). Manş, Kerç, Otranto, Hürmüz,
  Bering kendiliğinden açık.
- **Karaya döner:** Panama (4 hex), Kra kıstağı (%17 ve %36). Süveyş ve
  Orta Amerika kendiliğinden bağlı.
- Küçük ada: hex alanının beşte birini dolduran ada korunur (Girit, Kıbrıs,
  Korsika, Zelanda, Jamaika, Hawaii…).

## Nehirler

Natural Earth çizgileri hex KENARINA oturtulur (köşe grafında en kısa yol;
rivers.js ile aynı köşe şeması), province üreteci v2 onları sınır sayar.
Prosedürel dünyada nehir karanın ~%5.5'i (~460 kenar); Earth'te ayrıntı
merceğe göre: Avrupa ve Yakın Doğu'da ölçek ≤ 4 (Ren, Oder, Dinyeper, Dicle),
Güney/Doğu Asya'da ≤ 3 (Ganj, İndus, Sarı Irmak), başka yerde yalnız devler
(Nil, Mississippi, Amazon, Yangtze, Ob). 724 kenar, 28 sistem.

## Ölçüm (2026-11-15)

| | Prosedürel 160×96 | Earth |
|---|---|---|
| Kara hex | 5.539 | 4.694 (%30.6) |
| Province | 755 | ~665 |
| Ulus (isyancı hariç) | 66 | ~58 |
| Dünya üretimi | — | ~0.3 s |
| Hafta (YZ, başsız) | — | ~170 ms |

- `audit:geography -- --earth`: 38 geçit, 40/40 kent, 16/16 deniz, 24/24
  ada, 19/19 iklim noktası, 10/10 büyük nehir; coğrafya tohumdan bağımsız.
- `audit:province -- --earth`: bulgu yok.
- `audit:world -- --earth`: yedi arketip doğar, bant tutar, Akdeniz iç deniz
  testini geçer, Avrupa'da 12-15 devlet. İki bulgu açık: Hindistan kolonisi
  6 province (≥ 8 istenir; nüfusu ana yurdun 2.5-3 katı) ve doğu devi Avrupa'nın
  1.06-1.35 katı nüfus (≥ 1.5 istenir; Avrupa bilerek büyütüldü). Çözüm adayı:
  Earth'e özgü bölge başına province boyu (aşağıda).
- Prosedürel dünya birebir aynı: `audit:determinism` çıktısı ve 3 tohumluk
  kare/ulus/province/6 hafta izi değişmedi.

## Denetim

- `npm run audit:geography -- --earth` · `audit:world -- --earth` ·
  `audit:province -- --earth`: Earth kipinde kara oranı, geçit listesi,
  arketipler, province bandı.
- `npm run audit:determinism` + taban izi: prosedürel dünya birebir aynı kalır.
- `scripts/ui/hx.mjs`: menüden Earth, birkaç hafta akış, iki zoomda görüntü.

## Sonraki adımlar (ilk dilimden sonra)

- Bölge başına province boyu Earth'e kalibre: arketip boyları province
  sayısıyla yazılı, Earth'te bölgelerin kara alanı prosedürelden farklı
  (Sibirya ve Kanada iri, Hindistan ve Japonya küçük). Hedef: bölge başına
  province sayısı prosedürel standarda yakın.
- Gerçek kaynak kuşakları (kömür, demir, petrol, kauçuk) küçük bir tabloyla.
- Kanallar (Süveyş 1869, Kiel 1895, Panama 1914): hem kara hem deniz geçişi.
- Daha büyük ızgara (200×120) ölçümü.
