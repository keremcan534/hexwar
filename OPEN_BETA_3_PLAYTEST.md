# Open Beta 3 — kör kampanya testi

**Sürüm:** commit `1ac35c7` (savaş sonucu döngüsü onarımı sonrası)
**Tohum:** `OB3-1836` · **Dünya:** 160×96, 708 küme, 61 ülke
**Oyuncu:** Turdor (#3) — başlangıçta 61 ülke arasında **20. sırada**, 18 küme,
88 kare, 676K nüfus, 2 şehir. Süper güç değil, orta halli bir devlet.
**Süre:** 1836 → 1899 (64 yıl, 3328 hafta)

## Yöntem ve dürüstlük notu

Kampanya **başsız** koşuldu: `scripts/audit/_tmp/ob3-campaign.mjs` tam ölçekli
dünyayı kurar, oyuncu ulusunu YZ'den ayırır (`playerNation` atanır, `runNationAI`
o ulusa hiç dokunmaz) ve bütün oyuncu kararlarını — bütçe kaydıraçları, ordu
alımı, komuta ataması, inşaat kuyruğu, reform, savaş ilanı, barış masası —
açıkça yazılmış bir doktrin işletir. Tümen yürüyüşü oyunun kendi devir
mekanizmasına (`ORDER.AUTO` → `orders.js`) bırakıldı; mobil tasarımın kuralı bu.

**Bu bir el ile UI oynanışı değildir.** "Nasıl hissettirdi" sorularının cevabı
ölçülen davranıştan çıkarılmıştır, gerçek dokunmatik oturumdan değil. Muharebe
animasyonu, harita okunabilirliği, menü sürtünmesi gibi kalemler bu testin
kapsamı dışındadır ve burada **ölçülmemiştir**.

Faz A boyunca `src/` altında **hiçbir değişiklik yapılmadı**; bütün araçlar
`scripts/audit/_tmp/` (git yoksayımlı) altındadır.

---

## 1. İlk on yıl (1836–1845)

### 1a. Ekonomi: iki uçlu uçurum

Aynı tohum ve aynı dünya, **tek fark bütçe politikası**:

| | sabit bütçe | hazineye tepki veren bütçe |
|---|---|---|
| 1845 altını | **0** (1838'den beri) | **56.430** |
| borç | 4.439 (tavan, temerrüt) | 0 |
| haftalık vergi geliri | 129 → **41** | 60 → **205** |
| tümen | 20 | 12 |

Borç sistemi yazıldığı gibi çalışıyor: kapasite haftalık gelirin 26 katı,
tavan yakalandı, temerrüt kredi cezası uyguladı, `canAfford` harcama kapılarını
kapattı. **Ama kapıdan geçtikten sonra geri dönüş yok.** Nüfus (521K→506K),
ihtiyaç karşılanması (%48→%78) ve fabrika sayısı (7) sabitken vergi geliri
sekiz yılda %68 düştü ve bir daha toparlanmadı.

Diğer uç aynı sertlikte: haftalık geliri 205 olan bir ülke 56.430 altın
biriktirdi — yaklaşık **beş yıllık ulusal gelir** atıl duruyor, çünkü barışta
alınacak bir şey kalmıyor.

> **Bulgu E-1.** Ekonominin sonucu iki kutuplu: kaydıraçları yönetirsen absürt
> zengin, yönetmezsen kalıcı ölü. İkisinin arasında oynanabilir bir bant yok.

### 1b. İlk tehditler: yok

1836–1847 arası oyuncuyu ilgilendiren olay sayısı: **0**. Ne savaş ilanı, ne
ültimatom, ne sınırda kare değişimi. 18 küme / 88 kare on yıl boyunca sabit.

### 1c. Dünyadaki ilk savaşlar

İlk on yılda 94 savaş/barış olayı işlendi. Karakteristik örüntü **kısa ve
tekrarlı**: Belnia–Norenia 1836, 1837 ve 1838'de; Vasland–Arria 1837 ve 1838'de;
Draovia–Belnia 1837 ve 1839'da savaştı. Savaşların çoğu aynı yıl içinde
kapanıyor, sonra 40 haftalık ateşkes dolar dolmaz yeniden ilan ediliyor.

### 1d. Sınırlar görünür şekilde değişiyor mu? **Evet**

1845'e kadar 34/708 küme (%4,8) el değiştirdi, 15 ülke toprak kazandı. En büyük
ülkenin dünya payı %7,7 → %8,2. Beta 2'nin "hiçbir sınır değişmiyor" tablosunun
tersi.

---

## 2. İlk oyuncu savaşı — Noramark, 1848

**Neden başladı:** 1845 istihbaratı beni sıkışmış gösterdi — bir yanda 1,1–1,7
güç oranıyla beş küçük komşu, öbür yanda 310 kareyle büyüyen Yarurheim (bana
oranı 0,3). Hazinede 56 bin altın vardı. Oyuncu kararı: fazlayı orduya çevir
(12 → 48 tümen), zayıf komşuyu dev uyanmadan al. Hedef Noramark: güç oranı 5,8,
şöhretim 0,0.

**Muharebe ve hareket:** savaş **12 hafta** sürdü, toplam **4 muharebe** oldu.
48 tümene karşı 7. Cephe diye bir şey kurulmadı.

| hafta | warscore | küme tavanı | tuttuğum küme | işgal kare | muharebe |
|---|---|---|---|---|---|
| 0 | 8 | 0 | 0 | 0 | 0 |
| 4 | 45 | 3 | 1 | 5 | 4 |
| 8 | 78 | 5 | 3 | 7 | 4 |

**Barış şartları anlaşılır mıydı?** Evet, ve bu onarımın en net kazancı.
Warscore 79, küme tavanı 5, üç küme istedim (Yarreach, Dornwick, Jorford),
bedel 79 — bütçemin tamamı. Sayılar aynı para birimindeydi ve "ne alabilirim"
sorusunun cevabı doğrudan haritadan okunuyordu.

**Ödül orantılı mıydı?** Bu savaş için evet: bir yıllık seferberlik → üç küme.
Ama savaşın kendisi bir savaş değil, bir **baskındı** — 5,8 kat üstünlük,
12 hafta, 4 muharebe.

> **Bulgu W-1.** Barış masası artık okunabilir ve ödüllendirici. Savaşın
> **kendisi** boş: 25 oyuncu savaşının ortalaması **0,22 yıl (11,4 hafta)**,
> en uzunu 22 hafta.

---

## 3. YZ dünya davranışı

### Sınır sayımı

| yıl | değişen küme | pay | toprak kazanan ülke | aktif savaş | en büyük ülke payı | ülke | küçük ülke (≤40 kare) |
|---|---|---|---|---|---|---|---|
| 1845 | 34 | %4,8 | 15 | 6 | %8,2 | 61 | 30 |
| **1850** | **52** | %7,3 | 16 | 10 | %8,2 | 61 | 30 |
| 1860 | 86 | %12,1 | 17 | 10 | %8,8 | 61 | 31 |
| **1870** | **100** | %14,1 | 18 | 10 | %9,3 | 61 | 31 |
| 1880 | 105 | %14,8 | 17 | 11 | %9,8 | 61 | 31 |
| 1890 | 124 | %17,5 | 17 | 13 | %10,1 | 61 | 31 |
| **1899** | **136** | %19,2 | 17 | 15 | %10,3 | 61 | 32 |

### Blob var mı? **Hayır — hatta fazla yok**

En büyük ülkenin dünya payı 64 yılda %7,7'den yalnız %10,3'e çıktı. **Hiçbir
ülke elenmedi (61 → 61).** Küçük ülke sayısı 25'ten 32'ye *çıktı*.

### Koalisyon ve şöhret gerçekten frenliyor mu? **Hayır — hiç devreye girmiyor**

Şöhret eşiği 22. Sayım noktalarında dünyanın zirve şöhreti: 10,8 · 3,5 · 6,4 ·
0,2 · 0,0 · 61,3 · 0,9. Eşiği aşan ülke sayısı 1890 hariç **her sayımda sıfır**.
Ben 40 yılda ~48 küme ilhak ettim ve şöhretim hiç 6,5'i geçmedi. Sebep yapısal:
şöhret *işgal* başına birikiyor, benim savaşlarım 11 hafta sürüyor, aradaki
barışta oransal azalma her şeyi siliyor.

Dünyayı dengede tutan şey koalisyon freni değil; savaşların kısa ve devirlerin
küçük olması.

> **Bulgu W-2.** Salam taktiği serbest ve baskın strateji. Aynı kurbana her yıl
> saldırdım: Turesh 1855-56-57-58, Kazyldor 1859-60-61-62-64-65, Irya
> 1885-87-88-89-90. YZ de aynısını yapıyor — 16 çift 4+ kez savaştı, bir çift
> 14 kez.

> **Bulgu W-3.** YZ oyuncuya saldırmıyor. 64 yılda oyuncuyu ilgilendiren 27
> savaşın **26'sı benim ilanımdı**. Tehdit hissi yok.

---

## 4. Ekonomi

- **Para musluğu var mı?** Zayıf. Bkz. bulgu E-1: barışta 56 bin altın birikti.
- **Absürt zengin olunabiliyor mu?** Evet, hem de kasıtsız olarak.
- **Ticaret açığı/fazlası anlaşılır mı?** Defter kalemleri (vergi, gümrük,
  şehir, ordu, tedarik, sosyal, inşaat, faiz, ithalat) ayrı ayrı okunabiliyor
  ve toplamı tutuyor. Bu taraf sağlam.
- **Anlamlı takas var mı?** Kısmen. 64 yılın **41'i borçlu**, **21'i sıfır
  altınla** geçti; tepe borç 21.291. Yani orta oyunda takas gerçek. Ama takasın
  iki ucu da uç nokta: ya tavana yaslanmış borç ya beş yıllık atıl gelir.

---

## 5. Tempo

| yıl | 1836 | 1845 | 1855 | 1870 | 1885 | 1899 |
|---|---|---|---|---|---|---|
| ms/hafta | 19 | 62 | 121 | 61 | 67 | **171** |

Haftalık kapanışın maliyeti dokuz katına çıktı. Baskın faz net:

```
1855: command 71,4 · economy 35,2 · ai 4,8 · orders 4,0
1899: command 115,3 · economy 20,1 · orders 10,2 · ai 5,9
```

**Yavaşlamanın %67'si `command.js`** (cephe hesabı), 78 tümen ve 61 ülkeyle.
Haftalık iş kare bütçesine dilimlendiği için (`pumpTurn`, 5,5 ms) kare hızı
düşmez; ama bir oyun haftası 1899'da ~31 kareye yayılır.

**Ölü on yıllar var mı? Evet.** Oyuncunun en uzun savaşsız dönemi **19 yıl**
(1866–1884): bu sürede toprak 224 karede sabit, altın 0, haftalık açık −80…−160.
Dünyada da savaş ilanı on yıllık dağılımı 43 · 44 · 20 · 18 · **9** · 26 · 1'e
düşüyor; 8 yılda hiç yeni savaş açılmıyor.

---

## 6. Hikâye oldu mu?

**Kısmen — ama anlattığı hikâye tekdüze.**

Turdor 1836'da 61 ülke arasında 20. sıradaydı; 1899'da 277 kare ve 2,4 milyon
nüfusla **dünyanın 2. büyük devleti** (lider Yarurheim 336 kare). 18 küme → 68
küme, 5 → 15 fabrika, 8 → 78 tümen. Kâğıt üzerinde bu bir yükseliş destanı.

Ama olayların dizilişi bir hikâye kavisi kurmuyor:

- **1836–1847** — hiçbir şey olmuyor. Tehdit yok, savaş yok, sınır yok.
- **1848–1865** — her yıl bir baskın. Aynı üç komşuya sırayla, her seferinde
  1-3 küme. Kararın kendisi hep aynı: "ateşkes doldu mu? doldu. saldır."
- **1866–1884** — 19 yıl hiçbir şey. Borç, sıfır hazine, sıfır savaş.
- **1885–1899** — baskınlar geri geliyor, sonunda deve (Yarurheim, oran 1,9)
  saldırıp iki küme alıyorum.

Devam etmeye değer bir kampanya mı? Savaşın **sonucu** artık tatmin edici —
Beta 2'de imkânsız olan şey, toprak kazanmak, şimdi çalışıyor ve okunabiliyor.
Ama kampanyanın **gerilimi yok**: bana kimse saldırmıyor, kimse ölmüyor,
kimse büyümüyor, hiçbir kararın geri tepmesi yok. Zafer bedava.

---

## Faz A bulgu listesi

| kod | şiddet | bulgu |
|---|---|---|
| W-1 | YÜKSEK | Savaşlar ortalama 11 hafta / 4 muharebe — baskın, savaş değil |
| W-2 | YÜKSEK | Salam taktiği serbest: aynı kurbana yılda bir, sonsuza dek |
| W-3 | YÜKSEK | YZ oyuncuya saldırmıyor (27 savaşın 26'sı oyuncu ilanı) |
| E-1 | YÜKSEK | Ekonomi iki kutuplu: absürt zengin ya da kalıcı ölü |
| I-1 | ORTA | Şöhret/koalisyon freni hiç devreye girmiyor (eşik 22, zirve 6,5) |
| P-1 | ORTA | Haftalık maliyet 19 → 171 ms; %67'si `command.js` |
| S-1 | ORTA | 19 yıllık ölü dönem; savaş ilanı on yılda 44'ten 1'e düşüyor |
| D-1 | DÜŞÜK | 64 yılda hiçbir ülke elenmiyor, küçükler 25 → 32'ye çıkıyor |

**Faz A donduruldu.** Karşılaştırma ve öneriler ayrı bölümde.

---

# Faz B — Beta 2 ile karşılaştırma ve öneri

## B.1 Beta 2'nin beş sorunu bugün nerede?

| Beta 2 sorunu | Beta 3 durumu | Kanıt |
|---|---|---|
| **1. Savaş haritayı değiştiremiyor** | **ÇÖZÜLDÜ** | 64 yılda 136/708 küme (%19,2) el değişti, 17 ülke toprak kazandı. Beta 2'de 68 yılda **sıfır**. İlk savaşım: skor 79 → 3 küme, bedel 79. |
| **2. Paranın musluğu yok** | **DEĞİŞMEDİ** | 1845'te 56.430 altın, haftalık gelir 205. Beta 2'nin ¤477.295'i ile aynı hastalık, daha küçük ölçekte. |
| **3. Savaş komutasında yetki/geri bildirim yok** | **TEST EDİLMEDİ** | Bu koşu başsızdı; UI iddiası yapamam. Bkz. yöntem notu. |
| **4. Başına hiçbir şey gelmiyor** | **DEĞİŞMEDİ — ve artık sebebi ölçüldü** | 64 yılda oyuncuyu ilgilendiren 27 savaşın **26'sı benim ilanımdı**. Bkz. B.2. |
| **5. Geç oyun ~10 kat pahalı** | **DEĞİŞMEDİ — ama yeri bulundu** | 19 → 171 ms/hafta (9 kat). Bunun **%67'si `command.js`** (1899: command 115,3 / economy 20,1 / orders 10,2 / ai 5,9). |

Beta 2'nin "dokunmayın" listesinden hiçbiri bu koşuda bozulmadı. Borç zinciri
(ayar → borç → faiz → kredi limiti) hâlâ gerçek bir başarısızlık üretiyor:
ilk doktrinim 1838'de tavana dayandı ve temerrüde düştü. Beta 2'nin övgüsü
yerinde; benim eklediğim tek şey, o kapıdan geçtikten sonra **geri dönüş
olmadığı** (vergi geliri sekiz yılda %68 düşüp bir daha toparlanmadı).

## B.2 Kök neden: savaşta olmak seni saldırılmaz yapıyor

30 yıllık sonda, oyuncunun her komşusu için `ai.js`'in hedef seçme kapıları tek
tek ölçüldü (23.400 komşu-değerlendirmesi):

| kapı | kez | pay |
|---|---|---|
| temas yok (komşu değil) | 21.060 | %90,0 |
| **oyuncu zaten savaşta ("busy")** | **1.587** | **%6,8** |
| zaten bizimle savaşta | 321 | %1,4 |
| **bütün kapıları geçti** | **225** | %1,0 |
| ilan edenin istikrarı düşük | 124 | %0,5 |
| güç oranı yetersiz | **0** | %0,0 |

`ai.js` hedef ararken şunu yapar: *"Zaten savaşan ülkeye çullanılmaz."* Amaç
savaş zincirini kırmaktı ve o işi yapıyor. Ama yan etkisi şu: **sürekli savaşan
bir oyuncu, sürekli dokunulmazdır.** 1848–1865 ve 1885–1892 arasında her yıl bir
savaş açtım; o yıllar boyunca YZ için geçerli bir hedef bile olmadım.

Bu, W-2 (salam taktiği) ile W-3'ü (tehdit yok) **tek bir kök nedene** bağlar:
salam taktiği hem toprak kazandırıyor hem de saldırılmazlık satın alıyor.

## B.3 Kalan beş engel

**1. Sürekli savaşan oyuncu dokunulmaz (W-2 + W-3).** Beta 2'nin 4. sorunu,
artık mekanizmasıyla. Kampanyanın gerilimsiz olmasının tek en büyük sebebi.

**2. Savaşlar savaş değil, baskın (W-1).** 25 oyuncu savaşının ortalaması
**11,4 hafta / 4 muharebe**; en uzunu 22 hafta. Barış masası artık okunabilir
ama masaya oturana kadar geçen süre bir kampanya olayı üretmiyor.

**3. Paranın musluğu yok (E-1).** Beta 2'nin 2. sorunu, aynen duruyor. Ekonomi
iki kutuplu: absürt zengin ya da kalıcı ölü; arada oynanabilir bant yok.

**4. Şöhret/koalisyon freni ölü (I-1).** Eşik 22; 40 yılda ~48 küme ilhak eden
oyuncunun şöhreti hiç 6,5'i geçmedi. Şöhret *işgal* başına birikip barışta
oransal olarak siliniyor; **ilhak** hiç ölçülmüyor.

**5. `command.js` geç oyunun %67'sini yiyor (P-1).** Beta 2'nin 5. sorunu,
artık faz düzeyinde yerelleşmiş.

## B.4 Önerilen tek onarım dalı: `beta3-war-pressure`

**Kapsam:** yalnız `ai.js` + `diplomacy.js` + `infamy.js`. Ekonomiye, inşaata,
politikaya, UI'a, render'a dokunulmaz.

**Neden bu dal:** yukarıdaki beş engelin **üçünü** (1, 2, 4) tek bir konu
başlığı altında toplar, hepsi az önce onarılan savaş döngüsünün bitişiğindedir
ve hiçbiri yeni bir sistem eklemez — Beta 2'nin kapanış cümlesi de tam olarak
bunu istiyordu: *"sistem eklemesin, var olanları ısırtsın."*

Dört iş:

1. **"busy" kapısını dokunulmazlık olmaktan çıkar.** Amaç (kurbanı bekleyen
   kuyruğu engellemek) korunsun, ama savaş hâlindeki bir ülke sonsuza dek
   hedef listesinden düşmesin — örneğin ikinci cepheye izin ver, üçüncüyü
   engelle. Kabul ölçütü: 64 yıllık koşuda YZ'nin oyuncuya açtığı savaş sayısı
   1'den anlamlı bir seviyeye çıksın.
2. **Salamın bedeli olsun.** Aynı kurbana tekrarlanan savaşta ateşkes süresi
   büyüsün. Kabul ölçütü: bir çiftin 64 yılda 14 kez savaşması mümkün olmasın.
3. **Şöhret ilhaktan da birikssin.** `signPeace` sırasında devredilen küme
   başına şöhret eklensin; işgal başına birikim korunsun. Kabul ölçütü: 48 küme
   ilhak eden oyuncu koalisyon eşiğini görsün.
4. **Savaşın asgari bir gövdesi olsun.** Kazanan tarafın ilk uygun kümede
   masaya oturmaması; savaş süresi 11 haftadan gerçek bir sefere çıksın.

**Bu dala girmeyecekler:** para musluğu (E-1) ayrı bir ekonomi dalı;
`command.js` performansı (P-1) ayrı bir performans dalı; UI yetkisi/geri
bildirimi (Beta 2 #3) bu testte ölçülmedi, önce elle bir UI oturumu gerekir.

**Uygulanmadı.** Talimat gereği bu dal yalnız önerilmiştir.
