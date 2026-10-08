# ULUSLAR ÇAĞI — yön belgesi

Bu belge hem **ölçüt** hem **plan**dır. Her mekanik buna göre yargılanır;
sayılar başsız ölçümle ayarlanır ve ayarlandıkça burada güncellenir.

## Hedef tek cümlede

Age of History'nin sadeliği, HOI4'ün savaş ve üretim omurgası, Victoria 2'nin
halkları. 1836–1900, bir tur bir hafta.

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
el tezgâhı tüketim malını ve nüfus artışını büyütür. Altınla, 12 haftada bir
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
| Kömür | kaynak hex'i × 0.185 | fabrikalar (0.35/IC) | IC × (0.6 + 0.4 oran) |
| Demir | × 0.074 | tüfek, top, demiryolu inşaatı | hat yavaşlar |
| Kereste | × 0.097 | inşaat, gemi, tüfek | inşaat yavaşlar |
| At | × 0.075 | süvari (0.5/hafta), topçu (0.25/hafta) | süvari/topçu gücü düşer |
| Güherçile | × 0.13 | muharebe (alay başı 0.5), tüfek ve top hattı, 1868 sonrası gübre (gıda birimi başı 0.02) | muharebe gücü −%30'a kadar, gübre bonusu kaybolur |
| Petrol | × 0.2 (yalnız petrol lekesi) | 1868 sonrası fabrikalar (0.12/IC) | IC bonusu (en çok +%15) karşılanan oranda |
| Kauçuk | × 0.12 (yalnız kauçuk lekesi) | 1878 sonrası her kara alayı (0.08/hafta) | muharebe bonusu (en çok +%15) karşılanan oranda |

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
- **Üretim hatları:** Tüfek (0.5 IC, demir 0.2 + kereste 0.1), Top (2 IC, demir 1), Gemi (3 IC, kereste 1.5; zırhlı teknolojisiyle demir+kömür; tersane şart). Oyuncu ağırlık verir; askerî IC ağırlıkla dağılır. Verim hat başına %20–%100: çalışırken haftada +1 puan, boşta −0.5.
- **Teçhizat stoğu** ulusaldır, tavansız. Alay ihtiyacı: piyade 10 tüfek; süvari 6 tüfek; topçu 4 tüfek + 6 top; savaş gemisi 10 gemi. Takviye kaybolan güç oranında teçhizat yer.

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
| Çiftlik | 80 | 0.05 | 12 | gıda +%25 (en çok 3) | — |
| Maden | 120 | 0.15 | 16 | yatak +%50 (en çok 3) | yatak |
| Fabrika | 250 (+%5/fabrika) | 0.4 | 26 | +1 IC (en çok 5) | kalkınma ≥2 |
| Tersane | 200 | 0.4 | 30 | gemi hattı, liman (en çok 3) | kıyı |
| Kışla | 100 | 0.2 | 16 | insan gücü +%20, hızlı eğitim (en çok 2) | — |
| Kale | 120 | 0.2 | 20 | savunma +%15/kademe (en çok 3) | — |
| Demiryolu | 150 (+%50/kademe) | 0.15 | 20 | kaynak +%10, hareket, ikmal (en çok 5) | — |
| Üniversite | 200 | 0.4 | 30 | araştırma +0.3, okuryazarlık (en çok 2) | kalkınma ≥4 |

## 8. Nüfus, insan gücü, okuryazarlık

- Artış haftalık `%0.012 × gıda × tüketim malı × istikrar × barış` (savaşta ×0.6); kıtlıkta azalış. Ölen asker nüfustan düşer.
- İnsan gücü: province `nüfus × askerlik oranı × (kabul payı + yabancı pay × vatandaşlık oranı) × statü − silah altındakiler`.
- Askerlik: Gönüllü %3 · Sınırlı %6 (IC −%3) · Yaygın %10 (IC −%8, savaş desteği ≥50) · Topyekûn %16 (IC −%20, istikrar −5, savaş desteği ≥80). Alay 30 bin kişidir; 8 milyonluk ülke Sınırlı'da ~16 alay besler (ilk ayarda %4 kuruluş ordusunu havuzla eşitliyordu, yeni alay kurulamıyordu).
- Okuryazarlık ulusal; eğitim yasası (hedef %12 / %40 / %75) ve üniversiteyle hedefe ORANSAL yaklaşır (haftada açığın 0.0013'ü: 15 yılda %63, 30 yılda %86). Sabit adım denendi ve geri alındı: hedef iki yasada da aynı taraftayken yasa görünmüyordu. Araştırmayı, kalkınma tavanını ve milliyetçiliği büyütür.

## 9. Siyaset

- **SG:** haftada `(1 + hükûmet + parti + danışman) × (0.5 + istikrar)`, tavan 500. Harcandığı yer: yasa, hükûmet, danışman, propaganda, kültür politikası, savaş gerekçesi, ambargo ve KARARLAR (sübvansiyon, savaş tahvili, manevra, nüfus sayımı, af, araştırma bursu…; süreli değiştirici, bekleme süreli).
- **İstikrar** hedefe haftada 1 puan yaklaşır. Hedef: 50 + tüketim malı + gıda + vergi yasası + savaş + işgal + huzursuzluk + meşruiyet + parti + olay/gündem.
- **Savaş desteği** hedefe haftada 1 puan yaklaşır. Hedef: 40 + saldırganlık + yabancı yönetimdeki soydaşlar + savunma savaşı − kayıp − savaş süresi + milliyetçi destek.
- **Hükûmet biçimi:** Mutlakiyet (SG +0.5, seçim yok, iktidar partisini sen seçersin), Meşruti (4 yılda seçim), Cumhuriyet (seçim, istikrar +5). Kararla ya da isyanla değişir.
- **Dört parti:** Muhafazakâr, Liberal, Milliyetçi, Sosyalist (1848'den sonra). Destek sürücüleri: istikrar, okuryazarlık, tüketim malı, savaş, soydaşlar, sanayi. İktidar partisi bonus verir ve yasa aralığını sınırlar. Halkın istediği iktidarda değilse **meşruiyet cezası**. SG ile propaganda.
- **Altı yasa** (SG 50, 26 hafta kilit): Vergi (3), Askerlik (4), Ekonomi (4), Ticaret (4), Vatandaşlık (3), Eğitim (3).
- **Danışmanlar:** Ekonomi, Ordu, Siyaset yuvası; ikişer aday, SG 50, tek bonus.
- **Ulusal gündem:** duruma uyan 3 seçenekten biri, 12–20 hafta, somut sonuç.
- **Olaylar:** sistemlere bağlı, seçenekli kartlar (kıtlık, grev, seçim, Ulusların Baharı, savaş bezginliği…).

## 10. Kültür (Victoria 2'nin kalbi)

- Huzursuzluk = kabul edilmemiş pay × vatandaşlık × çağın milliyetçiliği + fetih + savaş + işgal − tüketim malı fazlası; garnizon ve istikrar düşürür.
- **Uyum** (çekirdek dışı): huzursuzluk düşükken artar; vergi, asker ve IC o oranda gelir.
- **İsyancılar haritada gerçek ordulardır** (Özgür X devletleri): hareket aşamaları → ayaklanma → bağımsızlık savaşı.
- Politikalar: kabul (SG), ödün (SG), sıkıyönetim (altın/hafta), baskı (SG + şöhret), sürgün, soydaşa bırakma, vasal olarak bırakma.
- **Birleşme:** soydaş toprak gerekçesi yarı fiyat; küçük soydaş devlet ilişki ve güç farkıyla barışla katılır; ana yurdun %80'i toplanınca "Büyük X" kurulur.
- **Ulusların Baharı:** 1848 dolayında dünya dalgası: milliyetçilik ve liberaller sıçrar.

## 11. Askerî

- Hareket HOI4 modelidir: ekonomi province kümesinde ("state"), ordu HEX hex yürür ve girdiği hexi işgal eder (`world/provinceGraph.js`). Muharebe, cephe, general, planlama, eğitim kuyruğu, seferberlik olduğu gibi kalır.
- Alay: altın + insan gücü + teçhizat. Teçhizat yoksa kuyrukta bekler, eksik tümen takviye alamaz.
- Muharebe: nehir aşarak saldırı −%25 (saldırılan hexle arasındaki kenar nehirse); güherçile eksikliği −%30'a kadar; at eksikliği süvari ve topçuyu vurur; kale +%15/kademe.
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

## 13. Teknoloji

5 dal (Sanayi, Altyapı, Ordu, Donanma, Toplum) × 8 seviye. Her teknolojinin
etkisi somut: IC, verim tavanı, kaynak, kalkınma tavanı, inşaat, ikmal, saldırı,
savunma, zırhlı gemi, okuryazarlık, istikrar. Araştırma = 1 + okuryazarlık × 6
+ üniversite × 0.3. Bedel `110 × (1 + 0.6·kademe) × (1 + 0.02·(yıl − 1836))`,
yılından önce araştırmak yılda +%6 (tavan 2.5×). Yıl çarpanı ağacı takvime
bağlar: ölçümde orta ülke 1876'da 30, 1886'da 36 teknolojide, 40'ını
1886-96 arasında bitirir (çarpansız 1881-86'da bitip son on beş yıl boştu).

## 14. Zafer (1900)

Puan = IC × 4 + nüfus (milyon) × 3 + çekirdek province + prestij. Prestij
kazanılan savaştan, Büyük X'ten, gündemden gelir. Her ülkenin bir **ulusal
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
