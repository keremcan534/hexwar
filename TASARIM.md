# ULUSLAR ÇAĞI — yön belgesi

Bu belge hem **ölçüt** hem **plan**dır. Her mekanik buna göre yargılanır;
sayılar başsız ölçümle ayarlanır ve ayarlandıkça burada güncellenir.

## Hedef tek cümlede

Age of History'nin sadeliği, HOI4'ün savaş ve üretim omurgası, Victoria 2'nin
halkları. 1900–1945, bir tur bir hafta (2026-10-12'de 1836–1900'den taşındı;
takvim `calendar.js`, kuruluş tabloları `era.js`).

Eski yön ("Victoria'nın dünyası, ev ödevi olmadan") 42 mal, üç sınıf, fiyat
zinciri ve 5.400 satırlık `economy.js` üretti; oyuncu kararlarının çoğu bir
muhasebe tablosuna gömüldü. Yeni yön içeriği budamaz, MUHASEBEYİ budar:
oyuncunun gördüğü her sayı bir karara bağlanır.

## İlkeler

1. **Her sayı bir karara bağlı.** Kararı olmayan sayı ne ekranda ne simde.
2. **Her sistem tek dosya, tek haftalık giriş, saf hesap.** Ekran formül
   kurmaz; sistemin döküm fonksiyonunu basar (eski değişmez #2 aynen geçerli).
3. **Oyuncu niyet söyler, sistem uygular.** Yasa, ağırlık, kuyruk — mal mal,
   fabrika fabrika düğme yok. Province başına iş varsa AUTO devralır.
4. **YZ aynı kapıdan geçer.** Ayrı YZ ekonomisi, gizli tavan yok.
5. **Her kaldıraç ölçülür.** Hissedilmeyen kaldıraç silinir.

### Üç test (eski belgeden, aynen geçerli)

- **Gürültü testi:** kaldıracın bütün menzili tohumlar arası doğal oynamanın
  altındaysa oyuncu onu hissetmez → birleştir ya da sil.
- **Ev ödevi testi:** oyuncunun işi sahip olduğu nesne sayısıyla büyüyorsa bu
  işletmedir → politikaya çevir.
- **Cümle testi:** ekrandaki sayı bir cümleye çevrilemiyorsa ya bir karara
  girdidir (dökümüyle kalsın) ya da ekranda işi yoktur.

## 1. Üst çubuk = oyunun bütün ekonomisi

| Sayaç | Gelir | Gider |
|---|---|---|
| Altın | province vergisi, ihracat, haraç | ordu/donanma bakımı, inşaat, alay, ithalat, faiz, eğitim |
| Siyasi Güç (SG) | hükûmet, istikrar | yasa, hükûmet, danışman, kültür politikası, savaş gerekçesi, ambargo |
| İnsan gücü | çekirdek nüfus × askerlik yasası | alay, takviye |
| Sanayi (IC) | fabrika × kömür × istikrar × teknoloji | sivil pay → tüketim malı, askerî pay → teçhizat |
| İstikrar | hükûmet, mal, savaş, huzursuzluk | SG, vergi, IC, isyan |
| Savaş desteği | soydaş, saldırıya uğramak | kayıp, uzayan savaş; yasaların kapısı |
| 8 kaynak | province kaynağı, ithalat | üretim hatları, nüfus, muharebe |

## 2. Province — tek pop

`province.econ`: `population`, `development` (1–10), `buildings`, `control`
(çekirdek dışında UYUM), `unrest`, `soldiers`. Kültür payları ve ana yurt
province üstünde kalır. Sınıf, meslek, ihtiyaç sepeti, fiyat yok.

**Çekirdek:** üretimden gelen `coreOf`, ya da çoğunluk sahibin ana/kabul
edilmiş kültürü, ya da sahibin ana kültürünün ana yurdu, ya da 25 yıldır
elde. **Statü:** çekirdek 1, çekirdek dışı `0.25 + 0.75 × uyum/100`, işgal 0.

**Kalkınma** vergiyi (×(1 + 0.15·kalkınma)), bina yuvasını (kalkınma + 1),
el tezgâhı tüketim malını ve nüfus artışını büyütür. Altınla, 18 haftada bir
kademe; bedel `15 × hedef^2.5 × √(nüfus ÷ 100 bin)` (kalabalık province'i
kalkındırmak pahalı ama daha çok vergi getirir). Tavan: 3 + teknoloji +
okuryazarlık × 4.

## 3. Sekiz kaynak (akış — stok yok)

**Her province bir kaynak çıkarır** (Victoria'nın RGO'su gibi): gıda ambarı,
kömür, demir, kereste, at ya da güherçile — arazisine ve kaynak kuşağına göre
(`econ/deposits.js`, paylar %24/19/17/18/16/6). Eski hex yatağı modelinde
province'lerin %39-45'i boştu; kaynaksız ülke iflas etmiyordu (vergi
kaynaktan bağımsız, ithalat bütçeyle sınırlı; ölçüldü: 10 yılda 8 kaynaksız
ülkeden hiçbiri ölmedi, gelirinin %18'i ithalata gitti) ama haritada
kimliksizdi. Province'lerin ~%10'unda **petrol**, ~%6'sında **kauçuk** ikinci
satırı yatar (çöl/tundra/kıyı ve orman-cangıl lekeleri): 1836'da alıcısı
yoktur, teknoloji yayıldıkça değerlenir — petrol patlaması.

| Kaynak | Province üretimi | Tüketen | Eksikse |
|---|---|---|---|
| Gıda | nüfus × verim × (1 + 0.25 çiftlik); tahıl ambarı ayrıca hex başı 0.05 | nüfus | nüfus azalır, istikrar düşer |
| Kömür | kaynak hex'i × 0.185 | fabrikalar (0.28/IC; 1900'ün sanayisinde 0.35 dünyayı kalıcı %25-30 kıtlıkta tutuyordu) | IC × (0.6 + 0.4 oran) |
| Demir | × 0.074 | fabrikalar (0.05/IC), tüfek, top, demiryolu inşaatı | hat yavaşlar; IC × (0.85 + 0.15 oran) |
| Kereste | × 0.097 | fabrikalar (0.06/IC), inşaat, gemi, tüfek | inşaat yavaşlar; IC × (0.9 + 0.1 oran) |
| At | × 0.075 | süvari (0.5/hafta), topçu (0.25/hafta) | süvari/topçu gücü düşer |
| Güherçile | × 0.13 | muharebe (alay başı 0.5), tüfek ve top hattı, 1868 sonrası gübre (gıda birimi başı 0.01; 0.02'de gübre talebin %94-99'uydu ve güherçileyi tavana çakıyordu) | muharebe gücü −%30'a kadar, gübre bonusu kaybolur |
| Petrol | × 0.2 (yalnız petrol lekesi) | 1868 sonrası fabrikalar (0.12/IC) | IC bonusu (en çok +%15) karşılanan oranda |
| Kauçuk | × 0.17 (yalnız kauçuk lekesi; 0.12'de ulus-haftaların %74-78'inde kıttı) | 1878 sonrası her kara alayı (0.08/hafta) | muharebe bonusu (en çok +%15) karşılanan oranda |

Fabrikanın demir ve kereste işlemesi 2026-10-11'de eklendi: gemi fazlası (tavansız hat) kalkınca ve YZ demiryolunu bırakınca demir talebi 1846-76 arası SIFIRDI, kereste fiyatı ulus-haftaların %94'ünde tabandaydı. Şimdi demir üretim/ihtiyaç 1.2-1.7, kereste 1.1-1.5 (50 yıl); IC ve iflas gürültü içinde.

Kaynak hex'i başı çıktı işletme (+%50/kademe, en çok 3), demiryolu ve
statüyle çarpılır. **Çağ kaynakları ceza değil bonus taşır:** teknolojisi
olmayan ülke petrol istemez; teknoloji (Açık Ocak 1868 + Elektrik 1880 →
petrol, Entegre Demiryolu 1878 + Modern Doktrin 1882 → kauçuk, Kimyasal
Gübre 1868 → güherçile) bonusu yalnız kaynak karşılandığı oranda verir.
Ölçüm (64 yıl, tek tohum): petrol 1886'dan sonra dünya ihtiyacı ~105,
üretim ~75, fiyat 4.1-4.3; kauçuk ihtiyaç ≈ üretim ~20, fiyat 2.8-3.4;
güherçile barışta da 41-58 ihtiyaç, fiyat 2.6-3.0.

## 4. Ticaret

- Kaynak başına tek dünya fiyatı: `taban × (dünya ihtiyacı ÷ dünya üretimi)^1.5`, 0.6–2.0, haftada %10 yaklaşır.
- **İhracat:** yalnız fazla, üretimin yasa payına kadar. **İthalat:** açık, altın yettiği sürece kendiliğinden.
- Ticaret yasası: Kapalı %0 (ithalat ×1.5, istikrar +3) · Sınırlı %25 · İhracat odaklı %50 (ihracat geliri +%15) · Serbest %80 (ithalat ×0.9, inşaat −%10).
- İkili akış: savaştaki ve ambargolu çift ticaret yapmaz. Kara komşusu doğrudan, ötekiler denizden (iki taraf da kıyılı).
- **Abluka:** düşman savaş gemisinin 2 hex yakınındaki kıyı province'lerinin payı kadar deniz ithalatı kesilir. Haritada görünür, donanmanın asıl işi.
- **Bağımlılık:** bir kaynağın yarısından fazlası tek ülkeden geliyorsa uyarı; YZ rakibine ambargoyu silah olarak kullanır.

## 5. Sanayi ve üretim

- `IC = Σ fabrika × (1 + teknoloji) × kömür × (0.85 + 0.3·istikrar) × (1 − askerlik cezası) × statü`.
- **Ekonomi yasası** askerî payı belirler: Sivil %10 · Kısmi %25 · Savaş %50 (savaşta ya da savaş desteği ≥50) · Topyekûn %80 (savaşta ve savaş desteği ≥70).
- **Tüketim malı:** ihtiyaç `nüfus/100k × 0.6 × çağ (1→1.8)`; arz el tezgâhı (`nüfus/100k × 0.5 × (1+0.03·kalkınma)`) + sivil IC. Oran 1'in altındaysa istikrar düşer (−20'ye kadar), üstündeyse vergi artar (+%20'ye kadar). Çağ ilerledikçe ihtiyaç büyür: sanayileşmeyen ülke huzursuzlaşır.
- **Üretim hatları:** Tüfek (0.1 IC; demir 0.06, kereste 0.03, güherçile 0.02), Top (0.4 IC; demir 0.25, güherçile 0.06), Gemi (0.6 IC; kereste 0.6, zırhlı teknolojisiyle demir 0.5 + kömür 0.2; tersane şart, tersane kademesi başına en çok 1 IC), Tank (0.8 IC; demir 0.4, petrol ve kauçuk 0.05) ve Uçak (0.6 IC; demir 0.1, kereste ve petrol 0.05, kauçuk 0.03) — ikisi kolu açan teknolojiyle açılır. Hat başına öncelik: **Auto** (varsayılan; depo ordunun ihtiyacını karşılayınca durur, savaşta hızlanır) ya da elle Off/Low/Normal/High (ağırlık 0/1/3/6); elle seçilen hatta hiçbir otomasyon dokunmaz. Askerî IC ağırlıkla dağılır; **hiçbir hattın almadığı askerî IC boşa gider** (barışta Auto depolar doluyken bütün hatları durdurur; tersane tavanını aşan gemi payı da). Factories ekranı bunu taralı "Idle" dilimiyle gösterir. Verim %50'den başlar, çalışırken haftada +1 puan (tavan %80, teknolojiyle %100'e dek), boşta −0.5 (taban %20).
- **Teçhizat stoğu** ulusaldır, tavansız. Alay ihtiyacı: piyade 10 tüfek; süvari 6 tüfek; topçu 4 tüfek + 6 top; savaş gemisi 10 gemi; zırhlı 8 tank + 2 tüfek; hava 8 uçak. Tank ve uçak alay başına haftada 0.4/0.3 petrol yakar; petrolsüz güç %60'a dek düşer. Tankın atılımı (`breakthrough` 0.6): saldıran yığındaki tank payı kadar savunanın siperi yok sayılır. Takviye kaybolan güç oranında teçhizat yer. **Teçhizat eğitimi bekletmez (HOI4):** eğitim biterken eksik kalan teçhizat oranında alay o güçle ve o oranda insanla çıkar (en az %10), takviye ikisini birlikte tamamlar.

## 6. Altın, borç, iflas

- Vergi = taç geliri 4 + Σ province `nüfus/100k × 0.45 × (1+0.15·kalkınma) × statü` × vergi yasası × `(0.8+0.4·istikrar)` × tüketim malı bonusu.
- Bakım: kara alayı 0.6, savaş gemisi 1.0 altın/hafta; savaşta ×1.5. Bina bakımı §7 tablosunda.
- Altın sıfırın altına inerse otomatik borç. Faiz haftada %0.3. Tavan `max(150, 20 × haftalık gelir)`.
- **Enflasyon:** rezervin (`max(300, 26 × haftalık gelir)`) üstünde yatan altının haftada %0.5'i erir; bütçede "Inflation" satırı. Cümlesi: biriktirdiğin para erir, harca. Yokken geç oyun hazinesi anlamsızlaşıyordu: 1890'da zengin ülkelerde her province kalkınma 10, bütün yuvalar dolu, 1900 medyan hazine ~28 bin, en zengin 330 bin. Enflasyon + kalkınma vergisi 0.25 → 0.15 + kalkınma bedeli üssü 2 → 2.5 + YZ bütçe ordusuyla 1896 medyan hazine ~1.7 bin (yarım yıllık vergi), medyan kalkınma 6.9.
- **İflas** (tavan aşılırsa): borç silinir, istikrar −20 ve ordu düzeni −50 (52 hafta), inşaat kuyruğu iptal, 52 hafta borç yok.

## 7. İnşaat

Bina province'e aittir; toprakla el değiştirir. Bedel peşin, süre haftalarla.
Aynı anda yürüyen proje: `2 + ⌊province/5⌋` (+teknoloji); kereste eksikse
yavaşlar. Her bina haftalık bakım öder (bütçede "maintenance"). Sayılar
`src/game/econ/defs.js BUILDINGS`'tendir.

| Bina | Bedel | Bakım/hf | Hafta | Etki | Şart |
|---|---|---|---|---|---|
| Çiftlik | 80 | 0.05 | 18 | gıda +%25 (en çok 3) | — |
| Maden | 120 | 0.15 | 24 | yatak +%50 (en çok 3) | yatak |
| Fabrika | 250 (+%5/fabrika) | 0.4 | 39 | +1 IC (en çok 5) | kalkınma ≥2 |
| Tersane | 200 | 0.4 | 45 | gemi hattı, liman (en çok 3) | kıyı |
| Kışla | 100 | 0.2 | 24 | insan gücü +%20, hızlı eğitim (en çok 2) | — |
| Kale | 120 | 0.2 | 30 | savunma +%15/kademe (en çok 3) | — |
| Demiryolu | 150 (+%50/kademe) | 0.15 | 30 | kaynak +%10 (en çok 5); YZ/AUTO yalnız en sonda ve evde demir fazlası varken kurar — geri dönüşü 639-1514 hafta | — |
| Üniversite | 200 | 0.4 | 45 | araştırma +0.3, okuryazarlık (en çok 2) | kalkınma ≥4 |

İnşaat yuvası `2 + state/10 + teknoloji` (eskiden state/5). Yuva ve süreler
2026-10-08'de birlikte değişti: 32 state'li ülke ilk yıl her ~1.5 haftada bir
bina bitiriyordu, oyuncu ekranı sürekli kollamak zorundaydı (ölçüm: büyük
ülkenin 1840 tamamlanması haftada 0.65 → 0.31).

## 8. Nüfus, insan gücü, okuryazarlık

- Artış haftalık `%0.012 × gıda × tüketim malı × istikrar × barış` (savaşta ×0.6); kıtlıkta azalış. Ölen asker nüfustan, **kendi halkının payından** düşer.
- **Seferberliğin bedeli:** silah altındaki çalışmaz. Province'in vergisi, gıdası, maden çıktısı ve el tezgâhı `1 − asker/nüfus` ile çarpılır (gıda İHTİYACI bütün nüfustur). Ölçüm: 12 alay (360 bin) orta boy ülkede vergi ve gıdada −%1.4; alayın toplandığı state'te −%7'ye kadar (state kartında "Under arms").
- İnsan gücü: province `nüfus × askerlik oranı × (kabul payı + yabancı pay × vatandaşlık oranı) × statü − silah altındakiler`, halk halk hesaplanır (`levy.js`).
- **Kura (Who is drafted):** Military ekranında halk başına kutu; alay ve takviye yalnız işaretli halklardan çeker, ölen kendi halkının payından düşer, ulusun şehit defterine yazılır. Kabul edilmiş bir halk muafken kuraya kalan kabul edilmemiş halk huzursuzlanır (küme payı × 2; isyan eşiği 7). Ölçüm (Lorria, %52 azınlık, 12 alay, %60 kayıp): kendi halkı muaf → kendi şehidi 0, payı %48.0 → %48.4; insan gücü 1.34M → 441K; 30 state'in 27'sinde ort. +1.25 huzursuzluk. YZ varsayılanda herkesi askere alır.
- Askerlik: Gönüllü %3 · Sınırlı %6 (IC −%3) · Yaygın %10 (IC −%8, savaş desteği ≥50) · Topyekûn %16 (IC −%20, istikrar −5, savaş desteği ≥80). Alay 30 bin kişidir; 8 milyonluk ülke Sınırlı'da ~16 alay besler (ilk ayarda %4 kuruluş ordusunu havuzla eşitliyordu, yeni alay kurulamıyordu).
- Okuryazarlık ulusal; eğitim yasası (hedef %12 / %40 / %75) ve üniversiteyle hedefe ORANSAL yaklaşır (haftada açığın 0.0013'ü: 15 yılda %63, 30 yılda %86). Sabit adım denendi ve geri alındı: hedef iki yasada da aynı taraftayken yasa görünmüyordu. Araştırmayı, kalkınma tavanını ve milliyetçiliği büyütür.

## 9. Siyaset

- **SG:** haftada `(1 + hükûmet + parti + danışman) × (0.5 + istikrar)`, tavan 500. Harcandığı yer: yasa, hükûmet, danışman, propaganda, kültür politikası, savaş gerekçesi, ambargo ve KARARLAR (sübvansiyon, savaş tahvili, manevra, nüfus sayımı, af, araştırma bursu…; süreli değiştirici, bekleme süreli).
- **İstikrar** hedefe haftada 1 puan yaklaşır. Hedef: 50 + tüketim malı + gıda + vergi yasası + savaş + işgal + huzursuzluk + meşruiyet + parti + olay/gündem.
- **Savaş desteği** hedefe haftada 1 puan yaklaşır. Hedef: 25 + saldırganlık (taban 40'tayken dağılım düzdü ve onu okuyan kapılar hiç tetiklenmiyordu) + yabancı yönetimdeki soydaşlar + savunma savaşı − kayıp − savaş süresi + milliyetçi destek.
- **Hükûmet biçimi:** Mutlakiyet (SG +0.5, seçim yok, iktidar partisini sen seçersin), Meşruti (4 yılda seçim), Cumhuriyet (seçim, istikrar +5). Kararla ya da isyanla değişir.
- **Dört parti:** Muhafazakâr, Liberal, Milliyetçi, Sosyalist (1900'de dördü de sahnede). Destek sürücüleri: istikrar, okuryazarlık, tüketim malı, savaş, soydaşlar, sanayi. İktidar partisi bonus verir ve yasa aralığını sınırlar. Halkın istediği iktidarda değilse **meşruiyet cezası**. SG ile propaganda.
- **Altı yasa** (SG 50, 26 hafta kilit): Vergi (3), Askerlik (4), Ekonomi (4), Ticaret (4), Vatandaşlık (3), Eğitim (3).
- **Danışmanlar:** Ekonomi, Ordu, Siyaset yuvası; ikişer aday, SG 50, tek bonus.
- **Ulusal gündem:** duruma uyan 3 seçenekten biri, 12–20 hafta, somut sonuç.
- **Olaylar:** sistemlere bağlı, seçenekli kartlar (kıtlık, grev, seçim, savaş bezginliği, devrim, güçlü adam, motor patlaması…).

## 10. Kültür (Victoria 2'nin kalbi)

- Huzursuzluk = kabul edilmemiş pay × vatandaşlık × çağın milliyetçiliği + fetih + savaş + işgal − tüketim malı fazlası; garnizon ve istikrar düşürür. Milliyetçilik çağı 1900'de **1.5**, 1945'te 1.8 (barut fıçısında ×1.3): 1836 oyununda Ulusların Baharı kontrolü yalnız bitişe baktığı için çarpan ilk 14 yıl fiilen ×1.3'tü ve kültür sistemi buna göre ayarlanmıştı; kontrol düzelince 1900'ün ilk on yılında hiçbir hareket ilerlemedi (audit:culture-unrest "isyan ölü"). 1.5'te en ileri hareket %64.
- **Uyum** (çekirdek dışı): huzursuzluk düşükken artar; vergi, asker ve IC o oranda gelir.
- **İsyancılar haritada gerçek ordulardır** (Özgür X devletleri): hareket aşamaları → ayaklanma → bağımsızlık savaşı.
- Politikalar: kabul (SG), ödün (SG), sıkıyönetim (altın/hafta; hareketi YAVAŞLATIR, dondurmaz — dondurunca 24 koşuda tek ayaklanma vardı), baskı (SG + şöhret), sürgün, soydaşa bırakma, vasal olarak bırakma.
- **Birleşme:** soydaş toprak gerekçesi yarı fiyat; küçük soydaş devlet güç farkıyla (3× nüfus, 120 SG) barışla katılır — ama yalnız **çalkantıdayken (istikrar < %45) ya da milliyetçi kabineyle**: yokken 1900 dünyası ilk dört yılda ulusların beşte birini barışla yutuyordu (elemelerin 24/29'u birleşme; kapıyla ilk 4 yılda ort. 9.7 → 4 eleme). Ana yurdun %80'i toplanınca "Büyük X" kurulur.
- **Dünya olayları** (`worldEvents.js`): harita uydurma olduğu için olay ulus seçmez, tarihin akıntısını değiştirir. Tohuma bağlı yılda başlar, süresince dört kanaldan okunur (geçici değiştirici, milliyetçilik, parti hedefi, YZ savaş gerilimi) ve başlarken her ulusa kartını yollar. **Barut fıçısı** (~1913, 5 yıl): savaş desteği +8, milliyetçilik ×1.3, YZ güç eşiği ×0.85 ve ilan zarı ×2 — Büyük Savaş ittifak zincirinden doğar. **Kızıl yıllar** (~1917): sosyalist hedef +12; savaşta ya da savaştan yeni çıkmış, istikrarı %60'ın altındaki devlete devrim kartı (kaybedilen ya da sevilmeyen savaş tacı düşürür). **Büyük grip** (1918): nüfus artışı −%50, istikrar −3. **Buhran** (~1929, 4 yıl): ihracat −%30, vergi −%15, istikrar −8, sosyalist ve milliyetçi hedefler artar. 1920 sonrası mutlakiyet olmayan, milliyetçileri %25'i aşan ve istikrarı %60'ın altındaki ülkeye **güçlü adam** kartı (kararname rejimi). Eşikler dünyanın ölçülmüş istikrarına göredir: gözlemcide ortalama istikrar Büyük Savaş ve buhran sırasında bile %64-78'di; ilk eşiklerle (0.45/0.5) 45 yılda 2-9 devrim ve 0-1 güçlü adam çıkıyordu. Liberaller %35'i aşınca taç anayasa verir.
- **State odağı** (Vic2 ulusal odağı, `focus.js` + `stateFocus.js`): yuva 1 + okuryazarlığın her %25'i (en çok 5) — state sayısıyla değil okuryazarlıkla büyür (ev ödevi testi). Production çıktı +%25 · Taxation vergi +%30 · Recruitment insan gücü +%30 · Integration uyum kazancı ×2, tavan +15, huzursuzluk −1 · Assimilation yılda nüfusun `%2 × (1 + okuryazarlık)`'ı ana kültüre (2026-10-11: %1'de hiçbir yuvaya değmiyordu) (ana yurt kilidini aşar; sakinlik çarpanı kendiliğinden asimilasyonla aynı). Fetihte odak düşer. YZ çeyrekte bir boş yuvaya koyar: uyumu düşük fetih → Integration, kalabalık azınlık → Assimilation, gerisi en kalabalık çekirdeğe Taxation. Ölçüm (2 tohum, 104 hafta barış, aynı state, dürtü kolu sıfır oynadı): çıktı +%25, vergi +%30, verilebilir asker +%46/+%390, uyum %85 → %100 ve huzursuzluk −1.2, yabancı pay 2 yılda −1.5 puan.

## 11. Askerî

- Hareket HOI4 modelidir: ekonomi province kümesinde ("state"), ordu HEX hex yürür ve girdiği hexi işgal eder (`world/provinceGraph.js`). Muharebe, cephe, general, planlama, eğitim kuyruğu, seferberlik olduğu gibi kalır.
- Alay: altın + insan gücü + teçhizat. Teçhizat yoksa kuyrukta bekler, eksik tümen takviye alamaz.
- Muharebe: nehir aşarak saldırı −%25 (saldırılan hexle arasındaki kenar nehirse); güherçile eksikliği −%30'a kadar; at eksikliği süvari ve topçuyu vurur; kale +%15/kademe.
- **Cephe sektörleri** (`command.nationSectors`): aynı kaynağı paylaşan generaller (hedefsizken hepsi düşmana bakan bütün sınır) sınırı tümen sayıları oranında ARDIŞIK dilimlere böler; sınır, bitişik parçalara ayrılıp bir uçtan BFS mesafesiyle sıralanır (deterministik). Eskiden hepsi aynı listeyi alıyordu: 7 general 2 state'lik cepheye yığılıyordu. Ölçüm (BORDER1-6 × 50 yıl): kartopu %31.1 → %26.5, savaş 58 → 52, hayatta kalan ülke 18 → 20.5.
- **Kuşatma (cep):** cephedeki tümenin kendi denetimindeki topraktan çekilecek yeri yoksa kuşatılmıştır: gücü −%25 (`battles.ENCIRCLED_PENALTY`), yenilirse teslim olur. Bayrak haftalık, muharebeden önce kurulur ve kayda girer. Yokken cebe 3'e 3 taarruz 9 haftada geri atılıyordu. Harita cepleri halkayla işaretler; teslimler haftalık tek bildirimde toplanır (`pockets.js`).
- **Muharebe penceresi** (`battleView.js`): taraflar, tümenler, çarpan dökümü (`battleUnitFactors` — motorun kendi çarpımı) ve "kim kaç haftada kırılır" tahmini (`roundLosses` — motorun kayıp sabitleri). Ekran sayı kurmaz.
- Donanma: muharebe, abluka, nakliye.
- **Teslim:** başkenti ve şehirlerinin yarısı düşen ülke, savaş desteği düşükse her makul barışı kabul eder.

## 12. Diplomasi ve barış

İlişki, ittifak, rakip, kriz/ultimatom, barış masası, şöhret ve koalisyon
aynen kalır. Eklenen: savaş ilanı SG ister (soydaş/çekirdek hedefe ucuz),
ambargo (SG). Barış talepleri: toprak, kurtarma, vasal, tazminat, askersizleştirme.

**Zafer puanı (HOI4):** ordu hex hex yürür ama bir kümenin warscore payının
%75'i MERKEZ hexinden, %25'i işgal edilen hex payından gelir
(`peace.VICTORY_POINT_SHARE`). Yokken savunan birkaç hexi tutarken saldıran
boş hexlere akıyor, savaşlar kısalıyordu (ortanca 51 → 19 hafta). Barışta
alınabilecek küme: warscore 15'te 1, 30'da 2, 70'te 3.

**Barış devlet silmez:** başkent state'i masada istenemez (`peace.capitalProvinceOf`;
YZ teklifi, oyuncunun listesi, haritadan tıklama ve savaş hedefi aynı kuralı
okur, antlaşmanın devir adımı da başkenti atlar). Küçük devlet küçülür ve vasal
olabilir; silinme yalnız çöküşle (ordusu ve şehri kalmayan devlet) ya da
barışçıl birleşmeyle olur. Yokken 1900 dünyası 45 yılda ulusların yarısını
kaybediyordu (audit:borders 78×62: 27 → 14, 23 → 13) — silinmelerin çoğu
tek barışla bütünüyle ilhak edilen 1-3 state'lik devletlerdi. Kuralla
27 → 25, 23 → 22, 28 → 26; haritanın %14-26'sı yine el değiştirir.

## 13. Teknoloji

5 dal (Sanayi, Altyapı, Ordu, Donanma, Toplum) × 2 klasör × 5 kademe, Ordu'da
üçüncü klasör Havacılık (6 kademe): 56 teknoloji, 1900-1940. 1836-1890 ağacının
40 düğümü **miras**tır: herkes bilir, araştırılmaz, etkileri aynı sırayla
değiştirici toplamına yazılır (katlama parmak iziyle birebir kanıtlandı). Her
teknolojinin etkisi somut: IC, verim tavanı/artışı, kaynak, petrol, kalkınma
tavanı, inşaat, ikmal, saldırı, savunma, zırh, hava, donanma, araştırma,
istikrar. İki kademe kol AÇAR (`unlocks`): Landships tankı, Military Aviation
uçağı; açılım YZ için 0.08 değerindedir (0.2'de uçak 1902'de açılıyordu).
Havacılığın öncülü Observation Balloons'tur: açılım ilk kademe olsaydı
kademe çarpanı 1.0 ile erken seçeneklerin en ucuzu olurdu. Araştırma = 1 + okuryazarlık × 6
+ üniversite × 0.3. Bedel `110 × (1 + 0.6·kademe) × (1 + 0.03·(yıl − START_YEAR))`,
yılından önce araştırmak yıl başına ×1.15 (tavan 8×; 1900 dünyası 2-3 kat hızlı araştırdığı için yılda +%6 / 2.5× uçağı 1910 yerine 1900'de açtırıyordu). Yıl çarpanı ağacı takvime
bağlar. 1900 ağacında ölçüm (2 tohum, 160×96): 1929'da medyan 34/55, sanayi
kademesi 40 (takvimde), tarım kademesi ~33; önde gidenler uçağı 1906-07, tankı
1915'te açar. (1836 ağacı: yıl ölçeği 0.03 ile ortanca ~1897'de bitiyordu.)

## 14. Zafer (kampanya sonu)

Puan = IC × 4 + nüfus (milyon) × 3 + çekirdek province + prestij. Prestij
kazanılan savaştan, Büyük X'ten, gündemden ve bir teknolojiyi **dünyada ilk** bulmaktan (+5, Vic2) gelir. İlk keşif yokken araştırma hızı skoru oynatmıyordu (+%50 araştırma → +%1.5, gürültü ±%1.7); şimdi +%0.7/+%10/+%12.5 (gürültü ±%1.1). Her ülkenin bir **ulusal
hedefi** vardır (Birleşmiş Ulus / İmparatorluğu Koru / Sanayi Devi); tutarsa
büyük bonus. Küçük ülke de kendi hikâyesini kazanabilir.

## 15. YZ

Kişilik (ulusun `focus` ve `aggression`'ı) ağırlıkları seçer. Ordu hedefi
`min(insan gücü, max(4 + toprak/12, min(vergi × 0.15 / bakım, 2 × toprak hedefi)))`:
zengin ülke toprağından büyük ordu tutar ama tavanlı (tavansız dev 112 alaya
çıkıp kartopunu büyütüyordu). Her sistemin
kendi YZ rutini vardır: yasa, inşaat, kalkınma, hat ağırlığı, ticaret yasası,
ambargo, kültür politikası, gündem, danışman, olay seçimi. AUTO devri aynı
rutinleri oyuncu için çalıştırır.

## 16. Haftalık sıra

temas/koalisyon → YZ → diplomasi → tur++ → ordu düzeni → takviye → eğitim/
seferberlik → komuta → yürüyüş → province (nüfus, uyum, kültür) → hareketler →
**ekonomi** (ulus başına: kaynak → IC → tüketim malı → hatlar → vergi/bakım;
sonra dünya ticareti, fiyat, hafta kapanışı) → inşaat → siyaset (SG, istikrar,
savaş desteği, parti, seçim, gündem, olay) → muharebe → eleme → emirler → zafer.

## 17. Değişmezler (her hafta doğrulanır)

- Altın defteri kapanır: açılış + Σ satır = kapanış.
- Kaynak dengesi: üretim + ithalat = tüketim + ihracat + açık.
- Dünya ticareti kapanır: Σ ithalat = Σ ihracat (miktar ve altın).
- Nüfus, insan gücü, stok negatif olmaz; hiçbir sayı NaN olmaz.
- Aynı tohum aynı oyunu üretir.
