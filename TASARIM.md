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

**Tek Çubuk (2026-10-15).** Eski ekonomi altın + sekiz bina + inşaat
kuyruğuydu ve ölçümde bir bina simülasyonuydu: AUTO oyuncu altın gelirinin
%48-68'ini inşaata, %19-24'ünü bina bakımına, yalnız %7-11'ini orduya
harcıyordu; inşaatsız aynı oyuncunun hazinesi 16-37 bine yığılıyordu
(istatistik panosu, 3 tohum × 45 yıl). Kerem: "binaları kaldırıp sadece IC ile
devam ederiz, HOI3'teki gibi dağıtırız, ekstraya kaynak çıkmaz". Şimdi
ekonomi tek bir haftalık akıştır ve hiçbir şey birikmez:

    çıktı (IC) = faturalar + ordu + halk + kalkınma

Faturalar önden düşer (ikmal, okul, sıkıyönetim), ordu hatları yasanın
sanayi payına kadar çeker, **tek kol** halkın ne kadar doyurulacağıdır,
kalanı kalkınmaya gider. Altın, vergi, borç, enflasyon, iflas ve binalar
yoktur. Dört tasarımcı ve üç yargıçlı panelin (bağımlılık haritasıyla) üçü de
bu modeli seçti.

| Sayaç | Gelir | Gider |
|---|---|---|
| Çıktı (IC) | state'lerin eli + kalkınma sanayisi | faturalar, ordu hatları, halk, kalkınma |
| Kalkınma fonu (IC) | yatırılan çıktı, ihracat, haraç | kalkınma kademesi, ithalat, tek seferlik alım |
| Siyasi Güç (SG) | hükûmet, istikrar | yasa, hükûmet, danışman, kültür politikası, savaş gerekçesi, ambargo, kararlar |
| İnsan gücü | çekirdek nüfus × askerlik yasası | alay, takviye |
| İstikrar | hükûmet, tüketim malı, savaş, huzursuzluk | SG, çıktı, isyan |
| Savaş desteği | soydaş, saldırıya uğramak | kayıp, uzayan savaş; yasaların kapısı |
| 8 kaynak | province kaynağı, ithalat | sanayi, yatırım, üretim hatları, nüfus, muharebe |

## 2. Province — tek pop

`province.econ`: `population`, `development` (1–10), `fort` (0–3, haritanın
sabit özelliği), `control` (çekirdek dışında UYUM), `unrest`, `soldiers`.
Kültür payları ve ana yurt province üstünde kalır. Sınıf, meslek, ihtiyaç
sepeti, fiyat, bina yok.

**Çekirdek:** üretimden gelen `coreOf`, ya da çoğunluk sahibin ana/kabul
edilmiş kültürü, ya da sahibin ana kültürünün ana yurdu, ya da 25 yıldır
elde. **Statü:** çekirdek 1, çekirdek dışı `0.25 + 0.75 × uyum/100`, işgal 0.

**Kalkınma** sanayinin kendisidir: 1'in üstündeki her kademe state'in her
100 bin işçisine 0.2 IC sanayi ekler (§5); yatakları (`0.88 + 0.06·kalkınma`,
demir `0.44 + 0.255·kalkınma`, kereste `0.70 + 0.14·kalkınma`; maden ve demiryolu binalarının
yerine) ve nüfus artışını (+%5/kademe) büyütür. Kalkınma fonundan alınır (§7).
**Tavan: 3 + 1900 sonrası teknoloji + okuryazarlık × 8** (başlangıçta 5 / 7 / 9,
kademeye göre). Okul bugün çıktıya mal olur (fatura, §6), yarın tavanı açar.

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
| Kömür | kaynak hex'i × 0.185 | sanayi (ham birim başına 0.10, çağla %40 iner) | sanayi × (0.6 + 0.4 oran) |
| Demir | × 0.074 | sanayi (0.025/ham birim), tüfek, top, yatırım (yatırılan IC başına 0.005); sanayi ve yatırım payı çağla %40 iner | hat yavaşlar; sanayi × (0.85 + 0.15 oran); yatırım verimi düşer |
| Kereste | × 0.097 | sanayi (0.015/ham birim), yatırım (0.015/IC), gemi, tüfek; sanayi ve yatırım payı çağla %30 iner (çelik ve beton) | yatırım verimi düşer; sanayi × (0.9 + 0.1 oran) |
| At | × 0.075 | süvari (0.5/hafta), topçu (0.25/hafta) | süvari/topçu gücü düşer |
| Güherçile | × 0.13 | muharebe (alay başı 0.5), tüfek ve top hattı, 1868 sonrası gübre (gıda birimi başı 0.01; 0.02'de gübre talebin %94-99'uydu ve güherçileyi tavana çakıyordu) | muharebe gücü −%30'a kadar, gübre bonusu kaybolur |
| Petrol | × 0.2 (yalnız petrol lekesi) | 1868 sonrası fabrikalar (0.12/IC) | IC bonusu (en çok +%15) karşılanan oranda |
| Kauçuk | × 0.17 (yalnız kauçuk lekesi; 0.12'de ulus-haftaların %74-78'inde kıttı) | 1878 sonrası her kara alayı (0.08/hafta) | muharebe bonusu (en çok +%15) karşılanan oranda |

Fabrikanın demir ve kereste işlemesi 2026-10-11'de eklendi: gemi fazlası (tavansız hat) kalkınca ve YZ demiryolunu bırakınca demir talebi 1846-76 arası SIFIRDI, kereste fiyatı ulus-haftaların %94'ünde tabandaydı. Şimdi demir üretim/ihtiyaç 1.2-1.7, kereste 1.1-1.5 (50 yıl); IC ve iflas gürültü içinde.

Kaynak hex'i başı çıktı kalkınma (`0.88 + 0.06·kalkınma`) ve statüyle
çarpılır (2026-10-15'e dek işletme +%50/kademe ve demiryolu +%10/kademe
binalarıydı). Demir (`0.44 + 0.255·kalkınma`, kalkınma 2'de aynı yer, 6'da
×1.97) ve kereste (`0.70 + 0.14·kalkınma`) sanayiyle daha dik büyür: ortak
eğriyle ihtiyaçları 45 yılda ×2.6 artarken arz %20 büyüyordu ve 1940'ta dünya
demir arzı ihtiyacın 0.6-0.7'si, ulusların %74-77'si demir kıtlığında, fiyat
tavandaydı (ölçüldü, STAT1-2 160×96). Kerestede demirin eğrisi 1905-15'te
ihtiyacın 2.2-2.5 katı veriyordu. Kıt demirin fiyatı demir state'inin
kademesini (kazanç ÷ bedel) değerli kılar. **Çağ kaynakları ceza değil bonus taşır:** teknolojisi
olmayan ülke petrol istemez; teknoloji (Açık Ocak 1868 + Elektrik 1880 →
petrol, Entegre Demiryolu 1878 + Modern Doktrin 1882 → kauçuk, Kimyasal
Gübre 1868 → güherçile) bonusu yalnız kaynak karşılandığı oranda verir.
Ölçüm (64 yıl, tek tohum): petrol 1886'dan sonra dünya ihtiyacı ~105,
üretim ~75, fiyat 4.1-4.3; kauçuk ihtiyaç ≈ üretim ~20, fiyat 2.8-3.4;
güherçile barışta da 41-58 ihtiyaç, fiyat 2.6-3.0.

## 4. Ticaret

- Kaynak başına tek dünya fiyatı: `taban × (dünya ihtiyacı ÷ dünya üretimi)^1.5`, 0.6–2.0, haftada %10 yaklaşır.
- **İhracat:** yalnız fazla, üretimin yasa payına kadar. **İthalat:** açık, kendiliğinden; bedel kalkınma fonundan ödenir (fon tabanına, haftalık çıktının 4 katı eksiye kadar), ihracat geliri fona girer. Fiyatlar IC'dir (eski altın tabanı × 1.5: çıktı 1900'de eski verginin 1.50 katı).
- Ticaret yasası: Kapalı %0 (ithalat ×1.5, istikrar +3) · Sınırlı %25 · İhracat odaklı %50 (ihracat çekiciliği +%15) · Serbest %80 (ithalat ×0.9, yatırım +%10).
- **Para korunur (2026-10-14):** ihracatçı ithalatçının ödediğini alır, fazlasını değil. `exportIncome` (yasa, teknoloji, danışman, olay) artık "ihracat çekiciliği"dir: alıcı sırasında ağırlık — çekici satıcı talebin büyük payını alır. Eskiden ihracatçıya ödenen ithalatçının ödediğinin 1.53-1.58 katıydı; ticaret her hafta dünya gelirinin %4-5'i kadar parayı yoktan yaratıyordu ve en büyük dört devletten biri olan oyuncu hiç eksiye düşmüyordu (3 tohum × 516 hafta: eksi hafta %0 / 1.9 / 0). Düzeltmeyle oyuncunun fazlası %22-85 düşer; 45 yılda eksi hafta %0 / 10 / 20. Oyuncu yine yapısal ihracatçıdır (en büyük tek parça devlet, 8 kaynağın 5-7'sinde fazla): gerçek zorluk orta boy bir ülkeyle ya da gümrük payıyla gelir — tasarım kararı, açık.
- İkili akış: savaştaki ve ambargolu çift ticaret yapmaz. Kara komşusu doğrudan, ötekiler denizden (iki taraf da kıyılı).
- **Abluka:** deniz hâkimiyetinden okunur (§11 Donanma): kıyı province'i başına düşmanın o kıyının denizindeki hâkimiyet payı × kapsam (province başına 0.6 filo gücü); ulusun ortalaması deniz ticaretini (alım ve satım) o oranda keser. Deniz haritasında (Seas, M) görünür.
- **Bağımlılık:** bir kaynağın yarısından fazlası tek ülkeden geliyorsa uyarı. **Ambargo oyuncunun aracıdır** (25 SG, `econ/trade.js declareEmbargo`): acısı hedefin ilişki defterine "Embargoes us −20" olarak yazılır. YZ ambargo kullanmaz — eski belge "YZ rakibine ambargoyu silah olarak kullanır" diyordu ama bunu yapan bir rutin yoktu (DIP-06).

## 5. Çıktı, sanayi ve üretim

- **Çıktı** (`econ/output.js`): state başına `0.6 × işçi` (el) + `0.2 × işçi × (kalkınma − 1)` (sanayi), statüyle; sanayi ayrıca kömür/demir/kereste/petrol oranı × teknoloji (`ic`) ile, ikisi birlikte istikrar (0.85 + 0.3·istikrar) × askerlik yasası × emek yasası × `output` değiştiricisiyle çarpılır; başkentten düz 4 (taç). İşçi = 100 bin kişi × (1 − silah altındaki payı). Ölçüldü (STAT1/2, 1900): sanayi eski fabrika IC'sinin 4.08-4.27 katı (**IC_SCALE = 4**: teçhizat bedelleri bu katla yazıldı, aynı yasada 1900'ün askerî üretimi eskisiyle birebir), toplam çıktı eski verginin 1.50 katı, halkın ihtiyacı çıktının %34'ü (ulus p90 %46), faturalar %10.
- **Ekonomi yasası** ordunun SANAYİDEN en çok çekebileceği payı belirler: Sivil %10 · Kısmi %25 · Savaş %50 (savaşta ya da savaş desteği ≥50) · Topyekûn %80 (savaşta ve savaş desteği ≥70). Hatların çekmediği pay halka ve kalkınmaya kalır. YZ barışta depo hedefin altındaysa ya da dünya geriliyorsa (barut fıçısı, savaşa giden yol) ve halk doyuyorsa (oran ≥0.98) Kısmi'ye geçer, depo dolunca ve dünya sakinken Sivil'e döner.
- **ÇUBUK:** `çıktı = faturalar + ordu + halk + kalkınma` (`economy.splitOutput`, her hafta değişmez olarak sınanır). Ordu = hatların çektiği (≤ yasa × sanayi, ≤ faturalardan kalan). Halk = **doyurma hedefi × ihtiyaç** (kalanı yetmezse kalan). Kalkınma = geri kalan; yatırılacak state yoksa (hepsi tavanda/işgalde) halka döner.
- **Tek kol — halkın doyurulması** (`economy.feed`, 0.5–1.5, adım 0.05): tüketim malı oranı. Okuyucular eski tüketim malı okuyucularıdır (istikrar −20…+6, büyüme, huzursuzluk, partiler); 1.2-1.25'te tavan yapar. Sağa çekmek istikrar ve sakin azınlıklar, sola çekmek büyüme. AUTO: barışta kişiliğe göre 0.95/1.00/1.05/1.10, savaşta 0.85, istikrar %40'ın altındaysa +0.10. İhtiyaç `nüfus/100k × 0.45 × çağ (1→2.7)` (başlangıç değiştiricisiyle 1900'de 100 bin kişi başına 0.405). El tezgâhı ayrı bir arz değildir: çıktının içindedir.
- **Üretim hatları:** Tüfek (4 IC; demir 0.06, kereste 0.03, güherçile 0.02), Top (16 IC; demir 0.25, güherçile 0.06), Gemi (2.4 IC; kereste 0.6, zırhlı teknolojisiyle demir 0.5 + kömür 0.2; tersane kapasitesi = kıyı state'lerinin Σ kalkınma × statü × 0.3 IC, gemi hattı ona kadar alır), Tank (32 IC; demir 0.4, petrol ve kauçuk 0.05) ve Uçak (24 IC; demir 0.1, kereste ve petrol 0.05, kauçuk 0.03) — ikisi kolu açan teknolojiyle açılır. Bedeller 2026-10-14'te ×10 (Kerem: "en düşük mobilizasyonda bile ekipman hızla yetiyor"; depo insan gücünün kurabileceğinin 12.8 katını donatıyordu, sonra 0.8), 2026-10-15'te birim değişiminde ×IC_SCALE. Hat başına öncelik: **Auto** (varsayılan) ya da elle Off/Low/Normal/High (ağırlık 0/1/3/6); elle seçilene otomasyon dokunmaz. Auto'nun tüfek hedefi `alay × 10 + 80 + seferberlik yedeği` (kura alayı başına 15); tank ve uçak hedefi bir alaylık kit + alay başına 8. Verim %50'den başlar, çalışırken haftada +1 puan (tavan %80, teknolojiyle %100'e dek), boşta −0.5 (taban %20).
- **Teçhizat stoğu** ulusaldır, tavansız. Alay ihtiyacı (2026-10-14, kara ve hava ×3): piyade 30 tüfek; süvari 18 tüfek; topçu 12 tüfek + 18 top; savaş gemisi 10 gemi; zırhlı 24 tank + 6 tüfek; hava 24 uçak; kura alayı 15 tüfek. Tank ve uçak alay başına haftada 0.4/0.3 petrol yakar; petrolsüz güç %60'a dek düşer. Tankın atılımı (`breakthrough` 0.6). Takviye kaybolan güç oranında teçhizat yer. Terhis edilen alayın silahı depoya döner (hayatta kalan güç oranında). Teçhizat eğitimi bekletmez (HOI4): eksik teçhizat oranında alay o güçle çıkar (en az %10), takviye tamamlar.

## 6. Faturalar ve ikmal krizi

- **Faturalar** (`econ/bills.js`) çıktının önünden düşer: kara alayı haftada 1.2 IC (kura alayı yarısı), savaş gemisi 2.0, denizaltı 1.0 — hepsi çağla ×1.8'e dek büyür (ordu da modernleşir), savaşta ×1.4, `upkeep` değiştiricisiyle (Motor Lorries ve Motorised Logistics −%5); okul 0 / 0.075 / 0.18 IC × nüfus/100k (eğitim yasası); sıkıyönetim `0.75 + 0.6 × province` (hareket başına, 26 hafta); barış şartı ödemesi (tazminat çıktının %10'u, vassal haracı %7.5'i; alan ülkenin fonuna girer — fondan ödendiğinde fon tabanını yok sayıyor, ödeyenin fonu beş yıl eksiye gidip ithalatı kesiyordu, ulus-haftaların %5'i tabanda kalıyordu). Eskiden ordu bakımı altın gelirinin %3-6'sıydı ve hiçbir şeyi sıkıştırmıyordu; şimdi her alay halkın ve kalkınmanın payından yer.
- **Tavan:** faturalar çıktının en çok **%60**'ını alır (`obligationCap` değiştiricisiyle artar). Aşan ülke **ikmal krizindedir**: her fatura aynı oranda (s) ödenir, kalan silinir; takviye, eğitim ve düzen toparlanması `0.5 + 0.5·s` ile çarpılır, istikrar `−0.2 × (1 − s)`, okullar s oranında çalışır. İflasın yerine geçti: 52 haftalık uçurum yok, faturalar sığdığı hafta biter. Çıkışlar: alay terhisi, okul, Uzun Mesai, **Requisition the Economy** kararı (80 SG, tavan +%15, 26 hafta, istikrar −5; borç moratoryumunun yerine).
- **Kalkınma fonu** ekonominin tek stoğudur (`nation.fund`, IC): yatırılan çıktı, ihracat ve haraç girer; kalkınma kademesi, ithalat ve tek seferlik alımlar (general `90 + 37.5 × kadro`, iskân 100 bin göçmen başına 9, olay seçenekleri) çıkar. Tabanı haftalık çıktı ortalamasının 4 katı eksidir: tek seferlik alım tabanı aşamaz, ithalat tabana kalan payla sınırlıdır. Defter (`treasury.settle`, tek kapı) her hafta kapanır: Δfon = Σ satır.

## 7. Kalkınma (eski inşaat)

Fon bir sonraki kademenin bedeline ulaşınca hedef state bir kademe kalkınır
(hafta sonu, ticaretten sonra). Bina türü, yuva, kuyruk, iptal yoktur.
Bedel `50 × max(1, nüfus/100k) × hedef²` (Develop odağında ×0.75): kazanç
nüfusla orantılı olduğu için büyük state'in getirisi küçüğünkiyle aynıdır,
kademe yükseldikçe azalır. Fona giren verim `1 + investment` değiştiricisi ×
(0.5 + 0.5 × min(kereste, demir oranı)) (1900'ün miras teknolojileriyle ×1.35;
Serbest Ticaret +%10, Railway Baron +%15, Industrial Subsidies +%30).

**Hedef** herkes için aynı simülasyon kuralıdır (YZ değil): Develop odaklı
uygun state varsa yalnız onlar, yoksa bütün uygun state'ler (sahibinin, statü
≥0.5, tavanın altında); fonun ya da 26 haftalık yatırımın alabileceği
kademeler arasından en yüksek kazanç ÷ bedel, hiçbiri ufukta değilse en
ucuzu. Oyuncu fonu Develop odağıyla yönlendirir (State focus: vergi odağının
yerine). Uygun state kalmadıysa (hepsi tavanda) kalkınma payı halka döner ve
YZ okul yasasını yükseltir: tavanı yalnız okul açar.

**Tavan** 2026-10-15'e dek ölüydü: 1900 öncesi beş teknoloji herkese +5,
okuryazarlık × 4 ile tavan 1900'de bütün uluslarda 9-10'du; dünya ortancası
1945'te 6'ya ancak çıktığı için hiçbir state ona dayanmadı (ölçüldü). Şimdi
1900 öncesi teknolojiler tavan vermez, okuryazarlık × 8'dir.

Ölçüm (Tek Çubuk kalibrasyonu, BAR1 × 45 yıl, 78×62): ufuk yokken fon 41
birimlik bir state'in 81 bin IC'lik kademesine biriktiriyor, medyan fon
çıktının 40-170 haftası kadar yığılıyordu. Gündem ödülleri kademe verince
(eskiden bina) küçük ülkelerin kalkınmasını fon değil gündem sürüyordu (20 yılda
ortanca 2.9 → 5.7); ödüller yatırım değiştiricisine çevrildi. Bedel
30/45/60/80 → 1944'te ulusların ortanca kalkınması 9.4/8.2/7.7/6.7.

**Kale** inşa edilmez: kuruluşta başkent en az bir kademe, state'lerin
%10-20'si (kademeye göre) bir kademe; Fortify the Border gündemi üç sınır
state'ine +1 (en çok 3). Fethedene geçer. Kışla (insan gücü +%20, eğitim
yuvası), üniversite (araştırma +0.3; dünyada üç taneydi), çiftlik, maden,
demiryolu, tersane binaları kalktı; eğitim yuvası tabanı 2 → 3.

## 8. Nüfus, insan gücü, okuryazarlık

- Artış haftalık `%0.012 × gıda × tüketim malı × istikrar × barış` (savaşta ×0.6); kıtlıkta azalış. Ölen asker nüfustan, **kendi halkının payından** düşer. **Kayıp ölüm değildir** (`levy.DEATH_SHARE` = 1/3): muharebe ve teslim kaybının üçte biri ölür, kalanı yaralı/esir olarak evine (nüfusa ve havuza) döner; batan geminin mürettebatı ölür. Ölçüm (1900-1940, 160×96): her kayıp ölüyken NAVY2'de savaş ölümü 115M / doğum 122M, nüfus 339 → 342 (kırk yıl düz); yaralı dönünce ölüm 28M, nüfus 339 → 468. NAVY1 455 → 454 (ölüm 62M → 42M). Sınır payı değişmedi (6 tohum ort. %19.7 → %19.1).
- **Seferberliğin bedeli:** silah altındaki çalışmaz. Province'in çıktısı (el ve sanayi), gıdası ve yatak çıktısı `1 − asker/nüfus` ile çarpılır (gıda İHTİYACI bütün nüfustur). Ölçüm: 12 alay (360 bin) orta boy ülkede vergi ve gıdada −%1.4; alayın toplandığı state'te −%7'ye kadar (state kartında "Under arms").
- İnsan gücü: province `nüfus × askerlik oranı × (kabul payı + yabancı pay × vatandaşlık oranı) × statü − silah altındakiler`, halk halk hesaplanır (`levy.js`).
- **Yedek** (2026-10-14, `defs.ARMY_POOL_SHARE`): düzenli ordu havuzun (silah altındakiler dahil) barışta en çok YARISINI, savaşta ya da ültimatomda %80'ini tutar; kura alayları paya dahildir. Kalan yarı yedektir: seferberlik ondan alay kurar, takviye ondan beslenir. Barışta payı aşan düzenli ordu ayda bir alay terhis edilir. Eskiden tek pay 0.8'di ve "altın fazlası" kuralı onu da aşıyordu: ulusların boş havuzu ortanca %4-13, seferberlik açık ama hedefi 0, savaşta takviyeye kalan havuz 0-0.8 alay; bağlayan hep insandı, tüfek hiç harcanmıyordu. Sonra boş havuz %35-39, aynı anda kura alayı 19-36 → 35-62 (78×62 × 30 yıl); oyuncunun barış ordusu 44 → 21 alay, yedek ortalama 1.5 → 16 alay (160×96). Kuruluş ordusu buna göre 0.08-0.11 alay / 100 bin (`era.START_ARMY`; 0.12-0.17 iken havuzun %60-85'iydi ve AUTO ilk yıl ordunun üçte birini terhis ediyordu). Terhis AUTO notuna yazılır.
- **Kura (Who is drafted):** Military ekranında halk başına kutu; alay ve takviye yalnız işaretli halklardan çeker, ölen kendi halkının payından düşer, ulusun şehit defterine yazılır. Kabul edilmiş bir halk muafken kuraya kalan kabul edilmemiş halk huzursuzlanır (küme payı × 2; isyan eşiği 7). Ölçüm (Lorria, %52 azınlık, 12 alay, %60 kayıp): kendi halkı muaf → kendi şehidi 0, payı %48.0 → %48.4; insan gücü 1.34M → 441K; 30 state'in 27'sinde ort. +1.25 huzursuzluk. YZ varsayılanda herkesi askere alır.
- Askerlik: Gönüllü %3 · Sınırlı %6 (IC −%3) · Yaygın %10 (IC −%8, savaş desteği ≥50) · Topyekûn %16 (IC −%20, istikrar −5, savaş desteği ≥80). Alay 30 bin kişidir; 8 milyonluk ülke Sınırlı'da ~16 alay besler (ilk ayarda %4 kuruluş ordusunu havuzla eşitliyordu, yeni alay kurulamıyordu).
- Okuryazarlık ulusal; eğitim yasası (hedef %12 / %40 / %75) ve üniversiteyle hedefe ORANSAL yaklaşır (haftada açığın 0.0013'ü: 15 yılda %63, 30 yılda %86). Sabit adım denendi ve geri alındı: hedef iki yasada da aynı taraftayken yasa görünmüyordu. Araştırmayı, kalkınma tavanını ve milliyetçiliği büyütür.

## 9. Siyaset

- **SG:** haftada `(1 + hükûmet + parti + danışman) × (0.5 + istikrar)`, tavan 500. Harcandığı yer: yasa, hükûmet, danışman, devletin rotası, kültür politikası, savaş gerekçesi, ambargo ve KARARLAR (sübvansiyon, savaş tahvili, manevra, nüfus sayımı, af, araştırma bursu…; süreli değiştirici, bekleme süreli).
- **İstikrar** hedefe haftada 1 puan yaklaşır. Hedef: 50 + tüketim malı + gıda + yasalar (emek) + savaş + işgal + huzursuzluk + meşruiyet + ikmal krizi + parti + olay/gündem.
- **Savaş desteği = İRADE, yorgunluk = BEDEL** (2026-10-15, Kerem: "savaştıkça war support çakılıyor, askerileşmeye değil terhise gidiyoruz"). İrade hedefi: 25 + saldırganlık + bitişik irredenta + bayrak etrafında toplanma (savunan 0.15, haklı gerekçeli saldıran 0.08; bir yılda söner) + savunma 0.10 + düşman toprağımızda (işgal × 1.25, en çok 0.25) − yorgunluk 0.50'yi aştıkça + milliyetçi destek; savaşta hedefe haftada 0.03 yükselir. **Yorgunluk** (`politics.exhaustion`): kayıplar + savaş yılları (silah altındaki nüfus payıyla: %5'te tam, küçük savaşta üçte bir) + işgal + yenilgiler + ikmal kıtlığı + silah altındaki insan + Call to Arms. Merdiveni: %30 yeni savaş yok · %45 bezginlik · %50 halkların kırılma noktası düşmeye başlar · %60 barışçıl kopuş · %75 devrim riski · %85 teslim, eski düzen çöker. **Savaş yasaları barışa dek tutulur** (savaşta irade şartı aranmaz; barışta düşerse kaydedilir); Total Mobilisation 0.65 / Total War Economy 0.60 iradeyle ve yalnız TOPYEKÛN savaşta (düşman toprağımızda, bir yıllık savaş ya da büyük savaş). Ölçüm (P5, STAT1-3 160×96): savaşta zorla yasa düşürme 31/34 → 0, saldıranın 2. yıl iradesi 0.40 → 0.74-0.76, dünya savaşı yıllarında savaştaki irade barıştakinden yüksek. Kilit artık nadir doğan koşulun güvencesidir (2026-11-18, BORDER1-6 × 45 yıl, bayrak açık/kapalı): irade ulus-savaş-haftalarının %0.9'unda şartın altında, kilitsiz 19 zorla düşüş, kilitle 0; Extensive payı %75.0 ↔ %74.0, yani dünya ortalamasında görünmez. Silinmedi: silinse Kerem'in reddettiği "savaşırken terhis" geri gelir.
- **Hükûmet biçimi:** Mutlakiyet (SG +0.5, seçim yok, iktidar partisini sen seçersin), Meşruti (4 yılda seçim), Cumhuriyet (seçim, istikrar +5). Kararla ya da isyanla değişir.
- **Dört parti:** Muhafazakâr, Liberal, Milliyetçi, Sosyalist (1900'de dördü de sahnede). Destek sürücüleri: istikrar, okuryazarlık, tüketim malı, savaş, soydaşlar, sanayi. İktidar partisi bonus verir ve yasa aralığını sınırlar. Halkın istediği iktidarda değilse **meşruiyet cezası**. **Devletin rotası** (2026-10-15, propagandanın yerine; Kerem: "sürekli tıklayarak ilerletmek tasarım hatası"): dört partili kare — x seçkin ↔ halk, y düzen ↔ reform. Oyuncu bir yön seçer ve SG gelirinin bir payıyla (%15/%30) rotayı oraya sürükler; rotayı tutmak bedavadır. Rota köşedeki partiye +24, ötekilere −8 ham destek çeker; düzen yarısı savaş desteği (en çok +0.10), reform yarısı huzursuzluk (en çok −%10) verir. YZ yılda bir odağına göre yön seçer; AUTO oyuncunun rotasına dokunmaz. Propaganda tık başına +12 ham puandı ve 3. yılda +0.3'e eriyordu (bir duruşu tutmak ~45 tık; ölçüldü).
- **Altı yasa** (SG 50, 26 hafta kilit): Emek (3; vergi yasasının yerine: On Saatlik Gün çıktı ×0.92, istikrar +5, büyüme +%15 · Standart · Uzun Mesai ×1.12, istikrar −7, büyüme −%15), Askerlik (4), Ekonomi (4), Ticaret (4), Vatandaşlık (3), Eğitim (3).
- **Danışmanlar:** Ekonomi, Ordu, Siyaset yuvası; ikişer aday, SG 50, tek bonus.
- **Ulusal gündem:** duruma uyan 3 seçenekten biri, 12–20 hafta, somut sonuç.
- **Olaylar:** sistemlere bağlı, seçenekli kartlar (kıtlık, grev, seçim, savaş bezginliği, devrim, güçlü adam, motor patlaması…).

## 10. Kültür (Victoria 2'nin kalbi)

- Huzursuzluk = kabul edilmemiş pay × vatandaşlık × çağın milliyetçiliği + fetih + savaş + işgal − tüketim malı fazlası; garnizon ve istikrar düşürür. Milliyetçilik çağı 1900'de **1.5**, 1945'te 1.8 (barut fıçısında ×1.3): 1836 oyununda Ulusların Baharı kontrolü yalnız bitişe baktığı için çarpan ilk 14 yıl fiilen ×1.3'tü ve kültür sistemi buna göre ayarlanmıştı; kontrol düzelince 1900'ün ilk on yılında hiçbir hareket ilerlemedi (audit:culture-unrest "isyan ölü"). 1.5'te en ileri hareket %64.
- **Biriken şikâyet** (2026-10-14, Kerem: "diğer kültürler eninde sonunda maks unreste ulaşmalı"): huzursuzluk bir hedefe oturuyordu (yabancı çoğunluklu state'lerde ortanca 5.3, hiç tırmanmıyordu). State başına `grievance` haftada `0.01 × yabancı pay × vatandaşlık ağırlığı` birikir (tavan 10 × yabancı pay) ve hedefe eklenir; tam yabancı state Residency/Limited/Full'da ~4/14/33 yılda tavana varır. Durduranlar: kabul, asimilasyon, taviz (−1.5), sıkıyönetim ve Integration odağı (birikmeyi durdurur), toprağı bırakmak; sahiplik değişince sıfırlanır. Ölçüm (3 tohum × 45 yıl, 78×62): ortanca/p90 5.3/7.0 → 6.6/8.4, kararlılık 70.3 → 69.9, savaşla el değiştiren state %16.7 → %18.8 (gürültü içinde); politikasız çok kültürlü uluslar state'lerinin %46 yerine %36'sını tuttu.
- **Uyum** (çekirdek dışı): huzursuzluk düşükken artar; çıktı, asker ve yatak o oranda gelir. Yabancı kültürün sabit "−%30 verim" cezası YOKTUR (eski hex modelinden kalan panel etiketi kaldırıldı; simülasyon uygulamıyordu): yabancı halkın bedeli huzursuzluk, kura ve hareket riskidir.
- **İsyancılar haritada gerçek ordulardır** (Özgür X devletleri): hareket aşamaları → ayaklanma → bağımsızlık savaşı.
- **İmparatorluklar çok halklı doğar** (`world/peoples.js`, kayıt v28; Kerem: "gerçek hayatta 30 kültürü bir arada tutan imparatorluklar vardı, büyük ülkeler 1-2 kültürlü, kaos hissi yok"). Kültürler ülkelerin ~2 katı büyüklükteydi (bir halk 6-9 ülkenin ana halkı) ve ana kültür başkent province'inden seçiliyordu (tohum başına 11-15 ülke azınlığını ana halk sanıyordu). Şimdi ana halk en büyük çekirdek halktır, başlangıçta komşu kabulü yoktur ve kendi tohum dalıyla bir "tebaa halklar" geçişi kuzey imparatorluğuna 6-8, bileşik monarşiye 6-8 (biri Home Rule), kavşak imparatorluğuna 4-5 halk verir (ana yurt, karışık kuşak, diaspora); ulus-devletler aynı kalır. Etkin halk sayısı (ters Simpson): bileşik 1.7-2.9 → 6.4-7.2, kuzey 1.5-2.3 → 3.6-4.7, kavşak 2.5-3.0 → 3.9-6.1; ≥ %85 tek halklı ülke 24-31 (ölçüldü, STAT1-3 + BORDER1, 160×96).
- **Etnik mozaik** (`world/mosaic.js`, `genOptions.cultureGen` 2; 2026-11-23, Kerem: "büyük maplerde kültür mapi aşırı az kültürle doğuyor, tek kültür onlarca ülkeyi içine alıyor"). Kültür tohumu bölge başına sabitti (`macro.ZONE_CULTURES`): ulus sayısı alanla büyürken 240×144'te 55 halk 103 ulusa düşüyor, bir halk 8-10 ulusun ana halkı, 11-14 ulusun state'lerinde çoğunluktu (200 ulusla 17 ve 22). Şimdi tohum standart boyun üstünde alanın 0.75 kuvvetiyle çoğalır (`cultures.cultureScale`; standart ve küçük harita aynı tohumu alır) ve mozaik beş doku ekler: **yama kuşağı** (standartta 2, alanla çoğalır: üç halkın buluştuğu engebede, kavşak bölgesine yakın 9-13 kümelik kuşak gruplara bölünür; grupların yarısı yeni küçük halk, yarısı eski halkın adacığı, komşu payıyla iç içe; yeni halkların dörtte biri uzak aileden), **diaspora** (orta boy bir halk uzak liman ve büyük kümelerde %6-16), **ada azınlığı** (en çok 5 kümelik kara parçası karşı kıyının halkından %12-30), **kardeş halklar** (dörtten çok ulusun ana halkı olan halk bitişik 3-4 ulusluk gruplara bölünür; en büyük grup adı taşır, diğerleri aynı aile ekiyle yeni ad alır, sınırda lehçe kuşağı) ve **imparatorluk cepleri** (kalpte 1-3 kümeye tebaa halkı %22-40). Ulus-devlet korunur: kardeş bölme ulus sınırını izler. Dünya üretimi (`npm run audit:diversity`, STAT1/STAT2/BORDER1): 240×144 halk 55 → 102, bir halkın ana halk olduğu ulus en çok 9.0 → 4, çoğunluk yayılımı en çok 13 → 7.7, en büyük halkın kara payı %7.7 → %5.1, state içi azınlık %8.9 → %15.1, yama %7.5 → %15.3; 200 ulusla en çok 17 → 4 (yayılım 22 → 8.3); 160×96 halk 52 → 60, en çok 7.3 → 4, azınlık %13.0 → %14.5; Earth 52 → 61. Kuşaklar bütünüyle yeni halk ve kardeş gruplar 2-3 ulusken 160×96'da 45 yılda ulus sayısı tohum başına ~14 fazla bitiyordu (border-change-audit; kuşaksız kol −7, bölmesiz kol −6): yarı adacık ve 3-4'lük grup bu yüzden. Son ayarla 160×96, 2 tohum × 30 yıl: ulus 131 → 138 (taban 131 → 131), halk kanalıyla el değiştiren pay %12.8 → %17.2, savaş payı %10.7 → %10.2 (kısa ölçüm; 45 yıl ve 3 tohum koşulmadı). Eski kayıt `cultureGen` taşımaz ve 1 ile, yani kendi halk haritasıyla kurulur (kültür izi tutar).
- **Merdiven — "halklar her zaman daha fazlasını ister"** (2026-10-15, Kerem: "kültür kabul etmek zayıf bir yöntem; kabul edince iş özerkliğe kadar gitmeli"). Her halkın konumu: ana · tebaa · vatandaş · Home Rule (`nation.homeRule`, kabul listesinin alt kümesi). Tebaanın ayrılık hareketi barışta **uçurumun kenarında** (90) bekler; devlet sarsılınca uçurum kalkar: **çalkantı çağında** (barut fıçısından Büyük Savaş + 9 yıla, yeniden silahlanmadan İkinci Büyük Savaş + 10 yıla) yorgunluk ≥ 0.55, dışında yalnız felaket bir yenilgide ≥ 0.70; istikrar < 0.15 (devrim düzeyi); ağır bir yenilginin ardından iki yıl (çalkantıda yorgunluk ≥ 0.4, dışında ≥ 0.6). Tek eşikle oyunun 1900-13 yerel savaşları imparatorlukları Büyük Savaş'tan önce dağıtıyordu (160×96: kıvılcımdan önce 105/72/92 province, Büyük Savaş + 6 yılda 38/93/37; ölçüldü). Vatandaşlık (SG 100 + 50 × hakkı olan halk) hareketi yarıya indirir ama halk artık **Home Rule ister**: talep huzursuzluk değil siyasettir (haftada 0.07 × çağ × soydaş devlet ×1.5 × (1 + 2 × yorgunluk)); 100'de kriz açılır — Home Rule ver (kendini yönetir, askerinin yarısını yollar, rızası %70), taviz (zaman satın alır, 40 + 20 × son 10 yıldaki taviz) ya da reddet (hakkını kaybeder, hareket Direniş'ten döner). Home Rule halkı sonra **devlet ister**: Dominion olarak bırak, taviz ya da reddet (uçurumda bekler). Oyuncuya 13 hafta; sonra kabine **halklar politikasına** göre cevaplar (Accommodate · Balance · Repress) ve asla reddetmez (Repress gücü yettikçe taviz verir, yetmezse "evet" der). Duruşun ölçüsü (2026-11-18, 9 tohum × 45 yıl, bütün uluslar Repress → Accommodate): hak verilen halk 71 → 169, sıkıyönetim 12.458 → 0, taviz 1 → 1.390, ayaklanma 176 → 115 (9 tohumun 8'inde düşer), kopan province 361 → 248; ortalama istikrar değişmez. Takvimli yıllık kabul kalktı: 1900-09'da 24-29 kabul ediyordu ve yabancı payının %47 → %5 düşüşünün ~%78'iydi; ana yurt kilidi aslında tutuyordu (ana kültürden olmayan pay 50 yıl sonra %32-48).
- **Savaş sonrası çözülme** (Kerem: "eninde sonunda kültürler WW1 ve WW2'den sonra patlayıp gidecek"). Kırılma noktası yorgunluk 0.60'ın üstünde düşer (0.70'te 70, 0.80'de 40, 0.85'te 25: o hafta hareketi olan her halk gider). Yorgunluk ≥ 0.60 iken kopuş savaşsızdır (tükenmiş devlet tutamaz; kopuş zincirleme savaş doğurmaz), tükenmiş devletin Home Rule halkları sormadan gider. **Yenilgi şoku**: barış masasında kaybedenin her halkının talebi 10 + 40 × yorgunluk sıçrar; ağır yenilgi (yorgunluk ≥ 0.4) iki yıl devleti sarsar; tükenmiş kaybedenin dominyonları kendi yoluna gider. Eğri 0.50'den başlarken 1900'lerin yerel savaşları imparatorlukları Büyük Savaş'tan on yıl önce dağıtıyordu (STAT3 78×62: 1900-04'te 15 ayaklanma; ölçüldü). **Savaş sürerken kopuş yoktur** (tam çöküş, yorgunluk ≥ 0.85, hariç): hareketler birikir, krizler açılır, toprak barış imzalanınca el değiştirir; o da ülke başına 4 haftada bir halk, en ileri hareket önce (Kerem 2026-10-15: savaşın ortasındaki kopuşlar ordusunu cepte bıraktı, düşmanını isyancılara yedirdi — "bu patlama işi sıkıntı"). Başka savaştaki devletten kopuş hep barışçıldır; kopan devlet eski efendisinin düşmanlarına o savaş sürdükçe **kurtarıcı geçişi** (askerî geçiş) verir, savaş bitince 13 hafta içinde çıkılır. Savaştaki devlet barışçıl birleşmeyle soydaşına katılamaz (işgal edilen toprak birleşmeyle kayıyordu).
- **Bırakma her zaman mümkündür** (`nationBirth.js`; Kerem: "o kültürün ülkesi yoksa bile oluşturulmalı"): halkın çoğunluk olduğu province'ler (başkent hariç) halkın KENDİ Özgür Devlet yuvasına gider (her halkın yuvası dünya üretiminde vardır; çalışma sırasında yeni ulus nesnesi yaratılmaz). Halkın devleti bizimle savaştaysa bırakmak barıştır. LIBERATE barış şartı da yuvayı uyandırır. **Kopan halk soydaşa katılmaz** (2026-11-23, Kerem: "kültürlerin savaşta pat diye ayrılıp başka ülkeye geçmesi; yeni ülke olsalar"): ayaklanma, bırakma ve LIBERATE önce yuvaya gider, bitişik soydaş yalnız yuva yoksa (bozuk kayıt). Soydaşa katılmak barış masasının ve birleşmenin işidir. **Ayrılık ihtarı** (`MOVEMENT.NOTICE_WEEKS`): kırılma noktasına varan halk o hafta kopmaz, 8 hafta (tam çöküşte 4) süre ilan eder — oyuncuya kart, hareket kartında "break away in N wk"; savaştayken süre dolsa da barıştan sonra en az 4 hafta bekler; hareket kırılma noktasının altına inerse (taviz, sıkıyönetim, kabul) ihtar düşer. Eski "kırık province" düğmesi Ekim başından beri ölüydü (5 yılda 52/54 çiftin hiçbiri açık değil).
- **Rıza** (Kerem: "farklı kültürlü provinceler ekonomiye etki ediyor mu?" — etmiyordu: 1900'de her province çekirdek). Çekirdek province halkının rızası ölçüsünde öder: vatandaş tam, Home Rule payının %70'i, tebaa uyumu tavanının altına düştükçe payının yarısına dek saklar (en düşük 0.5). Sakin province tam öder; gıdaya ve askere dokunmaz. Savaşta yorgunluk tebaa province'lerinin uyumunu aşındırır (haftada 0.3 × yorgunluk × tebaa payı).
- Politikalar: kabul (SG), ödün (SG), sıkıyönetim (haftalık fatura; hareketi YAVAŞLATIR, dondurmaz — dondurunca 24 koşuda tek ayaklanma vardı), baskı (SG + şöhret), sürgün, toplama, zorla asimilasyon, iskân, soydaşa bırakma, vasal olarak bırakma.
- **Kabulü geri alma** (2026-10-14, Kerem: "accepted culturesi çıkarma olmalı"): kabul tek yönlü kapıydı ve AUTO kabine oyuncu adına da kabul ediyordu. Geri almanın kendi fiyatı yok; bedeli kabulün kazancının tersidir ve oyunun kendi formülünden gelir (asker havuzu vatandaşlık payına iner, huzursuzluk hedefi yükselir, şikâyet birikmeye başlar, sönen hareket kaldığı yerden döner); kazancı halkın yeniden eritilebilmesi ve isyan ederse sürgün/toplama kapılarıdır. Ödenen SG ve süren milliyetçi tepki geri gelmez: kabul–geri al–kabul her seferinde 100 SG ve iki yıllık tepki ister. Oyuncunun geri aldığı halkı kabine kendiliğinden yeniden kabul etmez (`nation.revoked`, kayıtta); YZ geri almaz.
- **Sürgün zinciri** (`culturePolicy.js`; 2026-10-12, Kerem). Eski sürgün halkı silerdi: nüfus hiçbir yere gitmez, tamamen o halktan oluşan province 0 kişide kalırdı (büyüme çarpımsal olduğu için sonsuza dek). Şimdi hiçbir seçenek insanı yok etmez — toptan yok etme bilinçli olarak yoktur. **Sürgün**: halk soydaş devlete (kara komşusu önce), sonra onların province'lerine en çok komşu yabancılara gider; varış devleti en çok kendi nüfusu kadarını alır (tavansız ilk denemede 10 milyon insan 267 binlik soydaşa yığıldı), kalan nüfusla orantılı paylaşılır. Şöhret eski sürgünle aynı (insan / 400 bin, en az 8). **Toplama**: halk en kalabalık olduğu state'e taşınır; o state rezervasyondur (huzursuzluk hedefi +3, hareket orada beslenir), şöhret yarısı. İkisi de kriz kapısından geçer: kırık province ya da en az Agitation'a (%25) varmış hareket — her azınlığın "Grievances %0" hareketi olduğu için hareketin varlığı yetmiyordu (1900'ün ilk haftasında dört halk sürülebiliyordu). **İskân**: eski nüfusunun yarısının altına inmiş province'ler kendi halkımızla eski nüfusun %60'ına dek dolar; göçmen ana kültürün çoğunlukta olduğu en kalabalık province'lerden, donör başına haftada nüfusunun %0.3'ü, iki yılda gelir; plan donörlerin verebileceğiyle sınırlıdır, bedeli 100 bin göçmen başına 9 IC peşin (kalkınma fonundan). **Zorla asimilasyon**: ilan edilen halkın payı haftada %0.2 (yılda ~%10) ana kültüre geçer, sakinlik istemez, ana yurt kilidini aşar; yaşadıkları her province'te huzursuzluk hedefine pay × 2.5, ilanı şöhret +5. Ölçüm (NAVY2, işlev testi): 10.4 M sürgün → soydaşa 267 bin, kalanı komşulara; iskân 851 bin göçmen / 52 altın (eski birim); zorla asimilasyon payı bir yılda %21.3 → %19.9. YZ kırık province'te eski sürgünün yerine bu sürgünü kullanır.
- **Birleşme:** soydaş toprak gerekçesi yarı fiyat; küçük soydaş devlet güç farkıyla (3× nüfus, 120 SG) barışla katılır — ama yalnız **çalkantıdayken (istikrar < %45) ya da milliyetçi kabineyle**: yokken 1900 dünyası ilk dört yılda ulusların beşte birini barışla yutuyordu (elemelerin 24/29'u birleşme; kapıyla ilk 4 yılda ort. 9.7 → 4 eleme). Ana yurdun %80'i toplanınca "Büyük X" kurulur. **Birleşme kararı** (2026-11-23, Kerem: "birleşmede bir istek var, saçma"): iki sabit şart (3× nüfus VE küçüğün çalkantısı/milliyetçi kabinesi) teklif edenin hiçbir kaldıracını okumuyordu; 10× büyük dost soydaşı istikrarlı küçük hep reddediyor, bizden nefret eden ama sarsılan küçük kabul ediyordu. Şimdi küçük devlet bir toplam tartar (`unification.unionVerdict`): büyüklük `20 × log2(oran / 3)` (−40…+20), sağlam hükûmet −30 × (istikrar − 0.45)/0.3 ya da çalkantı +20 × (0.45 − istikrar)/0.3, milliyetçi kabine +15, bize bakışı × 0.2, yorgunluk × 20; ≥ 0 kabul. 3× ve %45 sıfır noktasıdır (eski kural sınırda aynı cevabı verir). Oyuncu kararı düğmenin ipucunda parça parça görür; 1.5× altına teklif yok, savaş/garanti/güçlü müttefik engelleri aynı.
- **Dünya olayları** (`worldEvents.js`): harita uydurma olduğu için olay ulus seçmez, tarihin akıntısını değiştirir. Tohuma bağlı yılda başlar, süresince dört kanaldan okunur (geçici değiştirici, milliyetçilik, parti hedefi, YZ savaş gerilimi) ve başlarken her ulusa kartını yollar. **Barut fıçısı** (~1913, 5 yıl): savaş desteği +8, milliyetçilik ×1.3, YZ güç eşiği ×0.85 ve ilan zarı ×2 — Büyük Savaş ittifak zincirinden doğar. **Kızıl yıllar** (~1917): sosyalist hedef +12; savaşta ya da savaştan yeni çıkmış, istikrarı %60'ın altındaki devlete devrim kartı (kaybedilen ya da sevilmeyen savaş tacı düşürür). **Büyük grip** (1918): nüfus artışı −%50, istikrar −3. **Buhran** (~1929, 4 yıl): ihracat −%30, çıktı −%10, istikrar −8, sosyalist ve milliyetçi hedefler artar. 1920 sonrası mutlakiyet olmayan, milliyetçileri %25'i aşan ve istikrarı %60'ın altındaki ülkeye **güçlü adam** kartı (kararname rejimi). Eşikler dünyanın ölçülmüş istikrarına göredir: gözlemcide ortalama istikrar Büyük Savaş ve buhran sırasında bile %64-78'di; ilk eşiklerle (0.45/0.5) 45 yılda 2-9 devrim ve 0-1 güçlü adam çıkıyordu. Liberaller %35'i aşınca taç anayasa verir. **Çağın doruğu** (2026-10-14): 1933'ten sonra takvim boştu ve savaşan oyuncu 1923'ten sonra hiç savaşmıyordu (istatistik panosu). **Savaşa giden yol** (~1935, 5 yıl): barut fıçısının ikinci turu (savaş gerilimi ×0.85/×2, milliyetçilik +0.2), kartı "Silahlan" (hat verimi tavanı +%10, artışı +%50, savaş desteği +5; 3 yıl) ya da "Barış içinde zaman" (istikrar +4). **İkinci Büyük Savaş** (~1939): kıvılcım İKİ ayrı büyük güç çiftine çakar (`sparkGreatWar(game, 2)`). Takvim kayıttan dönen dünyada eksik olayı kendi zarıyla yerleştirir.
- **State odağı** (Vic2 ulusal odağı, `focus.js` + `stateFocus.js`): yuva 1 + okuryazarlığın her %25'i (en çok 5) — state sayısıyla değil okuryazarlıkla büyür (ev ödevi testi). Production gıda ve yatak +%25 · Develop (2026-10-15, Taxation'ın yerine) kalkınma fonu önce oraya, kademe %25 ucuz · Recruitment insan gücü +%30 · Integration uyum kazancı ×2, tavan +15, huzursuzluk −1 · Assimilation yılda nüfusun `%2 × (1 + okuryazarlık)`'ı ana kültüre (2026-10-11: %1'de hiçbir yuvaya değmiyordu) (ana yurt kilidini aşar; sakinlik çarpanı kendiliğinden asimilasyonla aynı). Fetihte odak düşer. YZ çeyrekte bir boş yuvaya koyar: uyumu düşük fetih → Integration, kalabalık azınlık → Assimilation, gerisi tavanın altındaki en kalabalık çekirdeğe Develop. Ölçüm (2 tohum, 104 hafta barış, aynı state, dürtü kolu sıfır oynadı): çıktı +%25, vergi +%30, verilebilir asker +%46/+%390, uyum %85 → %100 ve huzursuzluk −1.2, yabancı pay 2 yılda −1.5 puan.

## 11. Askerî

- Hareket HOI4 modelidir: ekonomi province kümesinde ("state"), ordu HEX hex yürür ve girdiği hexi işgal eder (`world/provinceGraph.js`). Muharebe, cephe, general, planlama, eğitim kuyruğu, seferberlik olduğu gibi kalır.
- Alay: insan gücü + teçhizat + haftalık ikmal faturası (peşin bedel yok). Teçhizat yoksa kuyrukta bekler, eksik tümen takviye alamaz.
- Muharebe: nehir aşarak saldırı −%25 (saldırılan hexle arasındaki kenar nehirse); güherçile eksikliği −%30'a kadar; at eksikliği süvari ve topçuyu vurur; kale +%15/kademe.
- **Cephe sektörleri** (`command.nationSectors`): aynı kaynağı paylaşan generaller (hedefsizken hepsi düşmana bakan bütün sınır) sınırı tümen sayıları oranında ARDIŞIK dilimlere böler; sınır, bitişik parçalara ayrılıp bir uçtan BFS mesafesiyle sıralanır (deterministik). Eskiden hepsi aynı listeyi alıyordu: 7 general 2 state'lik cepheye yığılıyordu. Ölçüm (BORDER1-6 × 50 yıl): kartopu %31.1 → %26.5, savaş 58 → 52, hayatta kalan ülke 18 → 20.5.
- **Çizilen cephe ve geri çekilme hattı** (HOI4, yalnız oyuncu): komuta şeridinde ✎ Front / ✎ Fallback. Çizilen cephe sınırın bir PARÇASINI seçer — karşıdaki uluslar + çizgi saklanır; cephe her hafta o ulusların sınır karelerinden izdüşümü çizginin boyunda kalanlardır, en yakın banttan 3 hex derinliğe kadar (`command.lineFront`). Uçları sınıra yapıştırmak denendi: sınır oynadıkça uçlar birleşip cephe tek kareye çöktü (3 → 1, 6 hafta). Sektör bölüşümüne girmez; dilim boşalırsa otomatik cepheye düşer. Geri çekilme hattı kendi karelerimizdir: Fall back emriyle ya da grubun yarısı bozgundayken tümenler oraya mevkilenir, taarruz durur; Offensive cepheye döndürür. YZ hat çizmez: denge ölçümleri değişmez (determinizm + kayıt denetimi temiz).
- **Kuşatma (cep):** cephedeki tümenin kendi denetimindeki topraktan çekilecek yeri yoksa kuşatılmıştır: gücü −%25 (`battles.ENCIRCLED_PENALTY`), yenilirse teslim olur. Bayrak haftalık, muharebeden önce kurulur ve kayda girer. Yokken cebe 3'e 3 taarruz 9 haftada geri atılıyordu. Harita cepleri halkayla işaretler; teslimler haftalık tek bildirimde toplanır (`pockets.js`).
- **Muharebe penceresi** (`battleView.js`): taraflar, tümenler, çarpan dökümü (`battleUnitFactors` — motorun kendi çarpımı) ve "kim kaç haftada kırılır" tahmini (`roundLosses` — motorun kayıp sabitleri). Ekran sayı kurmaz.
- **Donanma deniz deniz yönetilir** (`navy.js`, `world/seaZones.js`; 2026-10-12). Okyanus tohumdan adlı bölgelere bölünür (160×96'da ~31). Savaş gemisi haritada birim değil ulusun filosudur (eğitim kuyruğundan; mürettebat nüfustan, batarsa ölür). Oyuncu bölgeye öncelik verir (Auto/Off/Low/Normal/High = üretim hattı ağırlıkları); amirallik hazır gemileri böler, gemi kendisi gider (iki bölge adımı bir hafta). **Auto** = YZ kuralı: barışta iç sular (en geniş Normal, ötekiler Low); savaşta filo TOPLANIR — yalnız en geniş iç su Normal kalır, düşmanla paylaşılan iç sular High, filo yetiyorsa (düşmanınkinin 0.8'i) düşman kıyısı Normal; düşman gemisinin olduğu denize ancak hazır filonun 0.75'i oradakini geçiyorsa High, geçmiyorsa hiç (fleet in being, `CONTEST_RATIO`). Auto en az 3 gemilik kol kurar (`SQUADRON`): N hazır gemi en çok N/3 denizi tutar; elle seçilen deniz kol sayılır ama bölünmez. Bölgenin tek sayısı hâkimiyet `dost/(dost+düşman)` (güç = sağlık × (1+naval) × iç sular +%20 × amiral). Ondan okunur: abluka (§4); **kapalı deniz** — düşmanın yarıdan fazlasını tuttuğu denize ordu binemez ve oradan geçemez (içinde yakalanan yürüyüp çıkar, haftada %4 × pay adam yitirir; emir yürümezse sebebi yazılır); muharebe. Muharebe: hasar = karşı tarafın sağlığı × nitelik oranı (güç ÷ sağlık) × 0.5 × zar, 0.2'lik parçalarla — nitelik kimin kazanacağını söyler, dönemin ölümcüllüğünü değil; batan gemi mürettebatıyla gider, 0.4 altı limana döner (haftada %5 onarım, gemi teçhizatı yer); güçlünün yarısına varmayan taraf çatışmaz; yenilen ya da kaçınan ulusun o denize atanmış bütün gemileri (yoldakiler dahil) 6 hafta limanda kalır. Ölçüm (NAVY1/NAVY2, 160×96 × 45 yıl): eski modelde dünyada 12-18 gemi, filo haftada 0.01 hex, gemi karada (gemi-haftalarının %2.6-14'ü), abluka kıyılı savaş haftalarının %2'si. İlk havuz koşusu öğütücüydü: ~1.180 muharebe, ~1.100 batan gemi, 20-27 M denizde ölen asker; muharebelerin %93'ü toplam 2-3 gemi, tekrar edenlerin yarısı tam 6 hafta arayla (yenilen filo geri dönüyor, yoldaki gemiler tek tek yetişiyordu). Toplanma + kol + kapalı deniz + nitelik hasarı sonrası: 339/330 muharebe (yılda ~7, muharebe başına çoğunlukla 4-10 gemi), 264/273 batan gemi (tek ülkede en çok 44-50, önce 166), denizde ölen 1.7/2.0 M, dünya filosu 150 → 250, abluka kıyılı savaş haftalarının %50-55'inde ortalama %45-49; donanma fazı haftada 1.4 ms.
- **Gemi sınıfı — dretnot anı** (`units.SHIP_CLASSES`, `navy.js`; 2026-10-12). Gemi kızağa konduğu günün sınıfını ömür boyu taşır: Pre-dreadnought ×1, Dreadnought ×1.7 (Dreadnoughts 1906), Carrier group ×2.4 (Aircraft Carriers 1924). Bu iki teknoloji artık `naval` değil `shipClass` yazar: eski gövdeyi güçlendirmez. Sınıfın dünyadaki ilk gemisi adıyla herkese duyurulur (`world.navyFirsts`, kayıtta). Eski gövde aynı bakımı ve mürettebatı yer; panelden iki tıkla hurdaya ayrılır (mürettebat eve, gemi teçhizatının %30'u depoya). 2026-10-15'ten beri her gövde hurdaya ayrılabilir: panelin "Fleet" katı sınıf (ve denizaltı) başına Scrap 1 / Scrap all verir, hangi gövdenin gideceğini `navy.scrapPicks` seçer (önce limandaki, sonra en hasarlı, sonra en eski) — gemi gemi liste yok, denizler gibi grup grup. YZ filo hedefini gemi EŞDEĞERİYLE ölçer (eski gövde sınıf gücü oranında; düşmanın dretnotu iki eski zırhlıdır), gövde tavanı ayrıdır (4 + IC/25); barışta çeyrekte bir, tavan doluysa ya da hedef tutuyorsa en eski gövdeyi hurdaya ayırır. Ölçüm (NAVY1/NAVY2 × 45 yıl): ilk dretnot 1903 (YZ teknolojiyi takvimden erken alıyor), 1905'te kıyılı ulusların ~%95'i dretnot kurabiliyor, filonun üçte ikisi 1907'de dretnot; ilk uçak gemisi grubu 1920, 1930'larda çoğunluk. Sınıf farkı muharebeyi sertleştirdi: 339/330 → 520/444 muharebe, 264/273 → 451/368 batan gemi; hurda 335/292 gövde.
- **Deniz yolları ve denizaltı akını** (`seaLanes.js`; 2026-10-12). Kara komşusu olmayan iki ülkenin ticareti, kıyılarının değdiği denizler arasında bölge grafındaki en ucuz yoldan akar. Yol düşmanın tuttuğu bir ARA denizden (pay > 0.5) geçerse yük o payda kesilir; gemi mümkünse dolaşır (kesilen denizin yol maliyeti 1 + 10 × kesinti). Uç denizler ablukaya aittir, iki kez sayılmaz. **Denizaltı** (Submarines 1914; 5 gemi teçhizatı, 10 hafta, 250 kişi, yarı bakım) hâkimiyet aramaz, muharebeye girmez: savaşta düşmanın yapısal yollarının (her olası deniz ortağına giden yol + iç suları) en çok kesiştiği, eskortu zayıf denizlere kendiliğinden gider (N denizaltı en çok N/2 denize; oyuncuya iş yok) ve oradan geçen düşman yükünü `0.6 × denizaltı ÷ (denizaltı + 2 × eskort)` payında batırır. Düşman yüzey gemisi onu avlar (haftada 0.06 × güç × zar hasar). Auto, yükümüzün batırıldığı denize eskort yollar (Normal). YZ barışta 2, savaşta gövde tavanının yarısı kadar denizaltı tutar; düşman filosu güçlüyse bir buçuk katı. Hedef seçimi kayıttaki dünyadan türetilir; haftalık akış kayda girmediği için ona bağlansaydı kayıttan dönen oyun ayrışırdı (1916'da 27 denizaltılı kayıt 52 hafta birebir devam ediyor). Deniz haritası yolları yük kalınlığında çizer (bizimki pirinç, kesilen kırmızı kesik), denizaltıyı U-rozetiyle gösterir; panel yollarda kesilen payı yazar. Ölçüm (NAVY1/NAVY2 × 45 yıl): denizaltı 1915'te çıkar, 1941'de dünyada 147-171; savaştaki kıyılı ülkenin deniz ticaretinin yollardaki kaybı savaş yıllarında tipik %10-20 (abluka ayrı); yol fazı haftada 1-3 ms.
- **Çıkarma harekâtı** (`landings.js`; 2026-10-12). Kara sınırı olmayan iki düşman arasında savaş yalnız denizdeydi (generalin cephesi kara sınırıdır): savaşan çiftlerin %28-43'ü sınırsız, bu çiftlerde işgal çift başına 1-3.5 hex (sınırlılarda 12-13). YZ dört haftada bir, düşmanına güç üstünlüğü varsa o düşmana bakan generalin en sağlam 2-3 tümenini (sağlık ≥ %70, kendi toprağında, boşta) en çok 24 düğümlük yolla AÇIK denizden (kapalı denizden geçemez) savunmasız bir düşman kıyısına yollar; kıyı puanı: yakındaki düşman tümeni −4, şehir +3, başkent +2, denizi bizim tutmamız +2, deniz uzaklığı −0.5/adım. Savunulan kıyıya çıkılmaz (denizdeki birlik saldıramaz). Kıyı başı tutulunca yeni kural yok: sınır taraması kontrole baktığı için generalin cephesi kıyı başı olur, grubun gerisi denizden katılır, savunan generaller ona döner. Aynı düşmana deneme arası 8 hafta, yönerge ömrü 16 hafta (takılan öncü generaline döner). Oyuncunun ordusuna dokunulmaz; oyuncu aynı şeyi orduya karşı kıyıyı göstererek yapar. Bindirilmiş ordu hızı 4 → 12 (okyanusta 6, kıyıda 12 hex/hafta): öncü okyanusu 10-15 haftada geçiyordu. Ölçüm (NAVY1/NAVY2, 160×96 × 20 yıl): 255/186 çıkarma; NAVY2'de sınırsız savaş çiftlerinin payı %43 → %21, bu çiftlerde işgal 1.25 → 7.1 hex (NAVY1'de pay %28 → %29, kıyı başları kısa ömürlü). audit:borders (78×62 × 50 yıl): savaş payı %18.0/%17.3/%29.3 (önce %18.0/%13.8/%19.3), ulus 27→26 / 23→24 / 28→29 — barışta kalan kıyı başı sahiplik teması yaratır, YZ komşusuna savaş açabildiği için yeni savaşların kapısıdır.
- **Donanma geçişi: ret hafızası, buluşma, nöbet değişimi, deniz emri** (`navy.js`, `movement.js`; 2026-10-21/22). Auto, kolunun savaşı reddettiği denizi hatırlar (`nation.navy.refused`, `REFUSE_WEEKS` 26): hazır filo `REFUSE_MARGIN` 1.25 katına çıkmadan ya da süre dolmadan oraya yeniden çıkmaz (S1); düşmanı kovduğu denizi tutar (`drove`, S1b) ve kovan filo yerindeyken boş denize de dönmez (S1c) — kaçınmaların çoğu zayıfın KENDİ iç suyundaydı, güçlü yalnız "orada düşman var" diye geliyor, zayıf kaçınca o da dönüyordu. Düşmanın tuttuğu ve bizim kimsenin olmadığı denize giden yüzey kolu en çok `RENDEZVOUS_WEEKS` 3 bekleyip birlikte girer (S2; kapı ölçüldü: S1 sonrası kaçınmaların %21-38'inde aynı kolun gemileri hâlâ yoldaydı). Barışta 0.85 altı gövde onarıma döner; savaşta düşmansız denizdeki yaralı gövdenin yerine ≤ `RELIEF_WEEKS` 2 uzaklıktaki sağlam serbest gemi gelir (S3). Oyuncunun deniz aşırı emri tümen hedefe varana dek sürer (S5; eskiden düşman kıyısına çıkınca düşüyordu). Elle seçilen deniz Auto'nun en üst denizini soymaz (S4, yalnız oyuncu). Zar yok; kayıt alanları yokluğa dayanıklı, v28 kalır. Ölçüm (160×96 × 20 yıl, bütün uluslar YZ; NAVY2 / AUDIT1, önce → sonra): muharebe 27→22 / 32→29 (yılda 1.1 / 1.4), batan 20→12 / 22→22, gemi-kaçınma 71→32 / 59→73 — kayıtla 16 / 32 olay, bir ulus bir denizde en çok 2 / 3 olay ve aralar hafıza ömründen uzun (döngü yok; gemi sayımı 3 gemilik kolu üç kaçınma sayar), denizde yaralı gövde payı %7.6→2.8 / %3.3→2.0, en uzun yaralı nöbet 473→164 / 265→103 hafta, abluka payı %49→54 / %52→53, dünya filosu 145→148 / 143→151, çıkarma (başlayan/varan) 12/12→14/13 / 14/11→15/12, nakliyede ölen 12k→3k / 83k→75k. Altı tohum toplamı (+NAVY1/NAVY3/BORDER1/STAT1): muharebe 191→173, kaçınma 459→302, tekrar eden deniz 67→42, yaralı nöbet 2.475→772 hafta, nakliyede ölen 503k→654k (BORDER1/STAT1'de arttı). S1-S5 buluşmasız (S2'siz) donanmayı edilgen yapıyordu: AUDIT1'de 20 yılda 8 muharebe. audit:borders (78×62 × 50 yıl): savaş payı %13.7/11.4/18.1 → %13.7/16.5/17.0, ulus 41/40/43 → 43/37/42 (BORDER2'de S5 kapalı A/B: %20.5, 40 ulus — kayma tohum gürültüsü, S5 değil). Açık: savaşta yedek gövdesi olmayan donanmada yaralı gemi nöbette kalır (sınır 52 haftaydı, 103-164 ölçüldü); kapatmak nöbeti yedeksiz inceltir.
- **Filolar — oyuncunun donanma emri** (`navy.js` FİLOLAR, `orders.js` setFleetOrder, `render/seaLayer.js` sayaç, `ui/navyDock.js`; 2026-11-23, Kerem: "gemi kısmı full rework yiyecek"). Oynanarak ölçülen sorun (NAVY1, 1536×864): deniz önceliği denizi TARTAR, gemi göndermez — barışta bir denize High beş gemiden üçünü yolluyordu, bütün filoyu yollamak öteki denizleri Off'a çekmeyi istiyordu; savaşta katlı "sessiz" denize haritada tıklamak hiçbir satır açmıyordu; panelde iç içe iki kaydırma, deniz listesi bir buçuk satır; haritadaki filo rozeti tıklanmıyordu. Şimdi havuzun üstünde oyuncunun **filosu** vardır: adlı gemi grubu, tek emir — **Auto** (amirallik böler: YZ'nin kuralının ta kendisi, öncelikler dahil), **Hold sea** (bütün hazır gemiler o denize gider, tutar), **Port** (yedek). Varsayılan tek "Home Fleet" Auto'dadır (ev ödevi testi: oyuncu hiçbir şey yapmadan donanma çalışır; yeni gemi ilk filoya katılır; "All to Auto" tek tık). Haritada filo sayacı (emrin rengi, ad, ETA) tıklanır; seçiliyken sağ tık bir denize ya da kıyıya emirdir (2 tık; eskiden en az 3 tık ve filonun bir kısmı). Böl/birleştir, amiral filoya bağlanır (filo nereye, o oraya). **Toplanma:** düşmanın bulunduğu denize filo parça parça girmez — onarımdaki gemisi varken öteki gemileri limanda bekler (ilk oyunda yenilen filonun ilk onarılan gövdesi tek başına dönüp 1'e 4 kaçınıyordu). Varış bir kez duyurulur; filo kartı emrin denizindeki oranı gösterir (0.7 : 1 unfavourable). Ulusun filo listesi yoksa (YZ, eski kayıt) dağıtım bayt bayt eskisidir: parmak izi STAT1 160×96 × 260 hafta (YZ) ve edilgen oyunculu NAVY1 × 260 hafta önce/sonra AYNI; audit:determinism, audit:econ (bulgular tabanla aynı), audit:military-industry temiz; kayıttan dönen filo emirli oyun 20 hafta birebir. Ölçüm (`scripts/audit/navy-fleet-probe.mjs`, 3 tohum × 10 yıl, oyuncu 26. haftada deniz rakibine savaş açar; Auto'ya karşı dört haftada bir düşünen oyuncu): uygulanan abluka NAVY1 %50.0 → %45.5 (kaçınmamız 9 → 0), NAVY2 %42.8 → %42.8, AUDIT1 %32.2 → %53.1 (muharebe 0 → 2 zafer, 2 düşman gemisi battı); 10 yılda 1-7 emir. Filo güç VERMEZ, Auto zaten makuldür; oyuncuya kontrol ve okunurluk verir. YZ'nin kullanımı (`navy-probe.mjs`, 160×96 × 20 yıl, NAVY1/NAVY2): dünya filosu 88-137 gemi, 38-50 donanma (donanma başına ~2.5-3 gemi), donanma-haftası başına 1.0 deniz, kol başına 2.4-2.8 gemi, gemi-yılı başına 0.4 deniz değişimi, yılda 0.9-1.4 muharebe (ilk 6-10 yıl 0-4), kıyılı savaş haftalarının %42-54'ünde ≥%10 abluka; savaştaki donanma-haftalarının %6.5-12'sinde hiçbir gemi denizde değil.
- **Barış orduyu eve koyar** (`withdrawal.js`; 2026-11-23, Kerem: "barışa geçince bir anda askerler başka ülkelerin içinde kalıyor ve kurtaramıyorum"). `diplomacy.makePeace` imza ANINDA (masa, kabul edilen teklif, YZ barışı, bırakma) iki taraf arasındaki muharebeyi dağıtır ve savaşmadığı, geçişi olmadığı toprakta duran her kara tümenini hareket grafında (kara + deniz) en yakın boş kendi düğümüne koyar; o doluysa sıradaki, hepsi doluysa en yakın kendi düğümü (yığın taşar, tümen kaybolmaz); toprağı kalmamış devletin ordusu dağılır. Denizde, rotası barıştaki bir kıyıda biten tümen en yakın kendi kıyısına döner (kapalı deniz yüzünden yol yoksa kendi toprağına konur). Oyuncuya tek satır: "N divisions returned home from X". Aynı tarama haftanın sonunda değişmezdir (üçüncü tarafın toprağı alması, geçişin bitmesi; `nationBirth.evict` de aynı yer seçimini kullanır) ve `harness.scanInvariants` onu her hafta sınar. Eskiden tek çıkış hafta sonu taramasıydı ve önce yürüyüş deniyordu: yola çıkan tümen hafta sonunda hâlâ yabancı topraktaydı, muharebedeki ve gemideki atlanıyordu, masada (tur arası) imzalanan barışın tümeni bir hafta emir alamıyordu. Ölçüm (`npm run audit:war-end`, 160×96 × 20 yıl × BORDER1-3, etkin oyuncu): hafta sonunda yabancı toprakta tümen 7.701 / 5.511 / 9.069 tümen-hafta (en kötü hafta 32 tümen; haftaların %77-93'ünde en az biri) → 0 / 0 / 0; denizde ölü rota 83 / 77 / 119 → 0.
- **Otomatik emrin deniz kuralı** (`movement.AUTO_SEA`, `command.assignPosts`; 2026-11-23, Kerem: "saçma sapan bazen dünyanın öbür ucundan çıkartma atmaya başlıyorlar"). Uzak çıkarmayı `landings.js` değil GENERALLER yapıyordu: anavatandaki tümen okyanus ötesindeki boş cephe parçasına (sömürge sınırı, kıyı başı) mevkilendiriliyor, gemiyle gidip yanındaki düşman kıyısına iniyordu ("zayıflık × 10" puanında boş uzak mevki hep en zayıf yer çıkıyordu). YZ'nin, generallerin (oyuncunun AUTO cephesi dahil) ve çıkarma harekâtının yolu artık üç kapıdan geçer; oyuncunun kendi emri (`directive`) geçmez: (1) hedef aynı kara kütlesindeyse (`provinceGraph.landmassOf`) önce yalnız karadan yol aranır, deniz yolunun 2.5 katına kadar uzunsa o seçilir (yol bulucu deniz hexini kara hexiyle aynı fiyata sayıyordu: körfez atlamak dokuz puanlık kara dolambacını yeniyordu); (2) düşman kıyısına (toprak ya da kontrol düşmanın) inen yol denizde en çok 16 hex ve 2 deniz bölgesi geçer, iniş yeri kendi toprağımıza en çok 12 hex uzaktadır — aşan yol kurulmaz; (3) mevki dağıtımı önce tümenin kendi kara kütlesindeki mevkileri doldurur, öbür kütledeki mevki ancak 30 hex içindeyse ya da anavatana (başkentin kütlesi) dönüşse seçilir, düşman toprağındaki uzak kıyı başı hiç seçilmez. `landings.js` kıyı adayı da kendi iç sularımıza en çok bir bölge ötede ve kendi toprağımıza 12 hex yakın olmalı (eski 24 düğümlük tavan yalnız öncüye bakıyordu). Ölçüm (`npm run audit:war-end`, 160×96 × 20 yıl × BORDER1-3): YZ komutasının düşman kıyısına inişi 656 olay, denizde p90 94 hex, en uzun 265 hex / 13 bölge, 48 hexten uzun olanlar %20.7; son hâlde (2 tohum × 10 yıl, kısa ölçüm) düşman kıyısına inişlerin denizde p90'ı 8 hex, en uzunu 14 hex / 2 bölge, 48 hexten uzun 0/105. Kendi toprağına (sömürge, anavatana dönüş) uzun nakil sürer: en uzun 232 hex. audit:military-strategy (78×62, 400 hafta): suda kalan tümen 6 → 2 vaka, cephe doluluğu medyanı %50 → %100, mevkisine yerleşmiş tümen %74.9 → %80.8.
- **Teslim:** yorgunluğu 0.85'i aşan ülke her makul barışı kabul eder (eski kural başkent ve savaş desteğine bakıyordu).
- **Call to Arms — levée en masse** (`mobilization.js LEVEE`; Kerem: "seferberlik devasa olmalı, halkı topyekûn savaşa sürüklemeli, son umut"). Düşman toprağımızın onda birini ya da başkenti tuttuğunda ve irade ≥ 0.55 iken: işgalsiz nüfusun %8'i, her halktan tam oranda, milis olarak (ordunun 3 katı + 6, en çok 60 alay; 4 haftada). Milis 0.4 güçle dövüşür, takviye almaz, generale bağlanmaz, yalnız kendi toprağında yürür (saldırmaz, terk edilmiş toprağı geri alır), ikmali alayın dörtte biri. Bedeli: yorgunluk +0.10 ve silah altındaki insan, istikrar −5 (bir yıl), tebaanın huzursuzluğu; iki yıl ya da barışla dağılır, yarım yıldan sonra yorgun ulusun milisi firar eder. YZ işgal altında ve düşman daha güçlüyse çağırır; AUTO yalnız çaresizken (%25 işgal ya da başkent). Yedek seferberliği havuzun yarısı yerine %80'ini çağırır (ortanca seferberlik 1 alaydı). Ölçüm (78×62 × 45 yıl, 3 tohum): kampanya başına 26-34 çağrı, büyük ülkede 35-36 milis alayı, silah altındaki nüfus en çok %15-18. Hava kanadı yoktur (Kerem: gerek yok).

## 12. Diplomasi ve barış

İlişki, ittifak, rakip, kriz/ultimatom, barış masası, şöhret ve koalisyon
aynen kalır. Eklenen: savaş ilanı SG ister (soydaş/çekirdek hedefe ucuz),
ambargo (SG). Barış talepleri: toprak, kurtarma, vasal, tazminat, askersizleştirme.

**Barışta diplomasi (2026-10-22; `relations.js` defter ve masa, `pacts.js`
kararlar ve YZ, `dipDefs.js` bütün sabitler, ekran `ui/diplomacyScreen.js`).**
Hedef: savaşmayan oyuncunun da anlamlı kararları olsun. Her araç bir bedel,
okunan bir sonuç ve bir YZ kullanımı taşır; hükümler parça parça basılır
("They would sign: 1.4 ≥ 1 — Relations +0.6 · Busy elsewhere +1").
- **İlişki defteri:** her ulus başkasının ona YAPTIĞINI hatırlar (çağrıya
  geldi +25, bizi yalnız bıraktı −30, ittifakı bozdu −40, pakt bozup saldırdı
  −60, toprağımızı aldı −10/province, garanti verdi +20, ambargo −20, teklifimizi
  geri çevirdi −10 …); kayıt haftada %1 söner (yarı ömür 69 hafta), −100..100.
  Okuyucular: ittifak çekiciliği (değer/25), pakt ve talep hükümleri, kin
  (olumsuz kayıt, uygun hedefler arasında ×(1 + |değer|/100) öne geçirir;
  uygun olmayanı uygun yapmaz), koalisyon zarı (sevilene en çok yarı), YZ'nin
  ittifak bozma çizgisi −25. **Savaş eşiği okuyucusu ölçüldü ve silindi:**
  sevdiğine saldırmak için ×(1 + değer/100) üstünlük isteyen çarpan,
  160×96 × 3 tohum × 20 yılda dokuz koşunun (tüm-YZ, büyük ve küçük oyuncu
  diplomat; elçi en tehlikeli komşuda) hiçbirinde tek savaş kararını
  döndürmedi; kaldırılınca tüm kollar açık parmak izi aynı kaldı.
- **Elçi:** en çok 2, haftada 0.2 SG; ev sahibinin defterine haftada +0.8,
  +40'a kadar. Elçi ittifakı tek başına açmaz (+1.6 < 2), bir yapısal
  sebeple açar. Barışta biriken SG'nin ilk yutağı.
- **İttifak ve çağrı:** tek eşik 2 (oyuncu da YZ de). Çağrıya katılmak
  bedavadır ve SAVUNMADIR (saldırı savaşı yazmaz, ültimatom müttefikinkiyle
  biter); reddetmek −30, müttefik bir sonraki çeyrekte ittifakı bozar ve
  nedenini söyler. Sebepsiz bozmak 10 SG ve −40; çift 104 hafta yeniden
  kurulmaz (52 ile audit:diplomacy iki çiftte kur → boz → kur sarkacı buldu).
- **Bağımsızlık garantisi:** açık ara güçlü devletin (×1.5) küçüğe tek yönlü
  sözü; 20 SG + haftada 0.15, en çok 3 (YZ 2). Saldırganın oranında yarım
  ağırlıkla sayılır, saldırı garantörü çağırır, terk prestij −5 ve bütün
  ortaklara "Broke faith with others −10". YZ: ilk 8 büyük güç, rakibiyle
  arasındaki ve rakibinin ezebileceği küçük devlete.
- **Saldırmazlık paktı:** 5 yıl, 15 SG, iki tarafın hükmü ≥ 1; fesih 26 hafta
  önceden bildirilir; oyuncu ihlal edebilir (+8 şöhret, kurbana −60, öteki
  ortaklara −20). YZ oyuncuya pakt önerir (savaştayken ya da canlı bir
  rakibi varken: "arkayı güvenceye al"). **YZ-YZ paktı ölçüldü ve silindi:**
  160×96, 3 tohum × 20 yıl, 8 ve 19 YZ-YZ paktı tek bir savaş kararını
  değiştirmedi (pakt atlama sayacı 0) — iki hüküm de karşı tarafın en az
  kendisi kadar güçlü olmasını ister, denk komşu zaten hedef değildir.
- **Toprak talebi:** hakkımız olan (iddia, halkımız, yurdumuz) bitişik
  province için "ver ya da savaş": 25 SG + 2 şöhret. Hedefin hükmü parçalı
  (üstünlük, irade, province'in payı, yorgunluk, ilişki, kendi halkı); ret
  52 haftalık bedava savaş gerekçesi verir. YZ bazı savaş ilanlarının YERİNE
  talep eder; oyuncuya gelen talep durdurur, cevapsız kalırsa kabine hükmü
  uygular.
- **Vassal:** vassal ile efendi birbirini savunur, vassalın kendi dış
  siyaseti yoktur. Özerklik 0-100: hedef `10 + 60 × min(1.5, güç oranı) −
  0.5 × ilişki + 40 × efendinin yorgunluğu`, haftada 0.5 yaklaşır; 50'de
  ilhak kilitlenir, 80'de vassal kopar, YZ efendi 90'da bırakır.
- **Masa:** oyuncuya düşen kayıtlar (çağrı, talep, ittifak/pakt teklifi,
  garanti isteği). Çağrı ve talep durdurur, teklifler durdurmaz; en çok 3
  açık teklif, teklifler arası 4 hafta, aynı gönderen yılda bir ve geri
  çevrilen gönderen kırgınlığı sönmeden (69 hafta) yeniden sormaz. Zaman
  aşımı savaşa sokmaz ve söz imzalamaz.

**Ölçüm (2026-10-22; kollar `DIP_ARMS=none` ile `all` aynı commit'te
eşli; kaos tabanı `HX_PLACEBO=1`: kural aynı, tur zarından bir sayı atılır).**
- *Sınırlar* (audit:borders, 78×62, BORDER1-6 × 45 yıl): savaş + talep payı
  ortalaması %13.26 → %14.30 (+1.04; sınır ±4), nihai ulus toplamı 254 → 246
  (−8; sınır ±8), en yüksek tohum %20.2 (≤ 33), TEST 1-3 DOĞRU; savaş sayısı
  611 → 595. Placebo: %14.82, 253 ulus, 645 savaş — tohum başına savaş payı
  −2.3…+6.2 puan, ulus −3…+4 oynuyor.
- *Masa* (160×96, STAT1-3 × 20 yıl, hiçbir şeye cevap vermeyen pasif oyuncu):
  yılda 0.90 / 1.05 / 1.10 kayıt, barış yılı medyanı 1 / 1 / 1, durduran 0;
  aynı komşudan 20 yılda en çok 8. SG medyanı ±%1.2 (gizli sızıntı yok).
  Elle oynanan 3 yılda (oyuncu testi) masaya 5 kayıt düştü: 3 garanti
  isteği, 1 pakt, 1 ittifak teklifi. Aktif diplomat (2 elçi, garanti, pakt,
  bakanlık cevapları, her çağrıya katılır) barışta SG tavanında 0 / 0 / 0
  hafta geçirdi (pasif oyuncu STAT1'de 53 hafta tavanda).
- *Dünya* (aynı census): savaş ilanı −%13.3 / −20.5 / −4.7, koalisyon
  ilanı −%23.7 / −26.8 / +7.8, ittifak çifti −%10 / −9.2 / +2.8. Placebo
  aynı ölçülerde −%2.0 / −14.5 / −16.5, −%22.0 / −18.3 / −25.5, +%3.0 /
  −4.3 / −5.2 verdi: tohum başına ±%20 / ±%25 sınırı gürültü tabanında,
  karar 6 tohumluk eşli sınır ölçüsündedir.
- *Kaldıraçlar* (audit:diplomacy, 160×96, 3 tohum × 20 yıl): değişmez ihlali
  0; YZ garantisi 15, talep 52, ret → savaş 48, özerklik ≥ 50: 4, vassal
  çağrısı 11, ittifak kuruldu 237 / bozuldu 55; karar dönmesi: garantör 5,
  vassal bağı 7. Küçük oyuncu diplomatı (`--active --small`): oyuncunun
  paktı bir YZ savaş kararını durdurdu. **Ölçülüp silinenler:** YZ-YZ paktı
  (8-19 pakt, pakt atlama 0) ve ilişkinin savaş eşiği (yukarıda).
- **Açık (Kerem):** talepte verme payı %4-9 (şartname aralığı %10-60): YZ
  en değerli haklı province'i ister — hedef ülkenin ortalama %23'ü (−0.93),
  %60-90'ında hedefin kendi halkı (−1); üstünlük ×3.6-5 olsa da (+0.5…+0.6)
  hüküm −1.6. Talep çoğunlukla savaşın önsözü (ret → savaş %92). En kabul
  edilebilir adayı istemek de ölçüldü (4/55, gürültü içi) ve geri alındı.
  audit:econ "savaşta ikmal krizi" %16.3 (taban 9.9) placebo ile %10.6 ve
  %17.0 veriyor: ölçünün gürültüsü, diplomasi etkisi değil. **İkinci derece
  etki (ölçüldü, açık):** 1900-09 halk kabulü 7 koşu toplamında 29 → 36
  (placebo 27-30); kollardan garanti +3, talep +3. Daha çok barış, YZ'ye
  kabul bedelini ve olgun hareketi bırakıyor; audit:homeland "erken hak
  verme ≤ 6" kapısına bir koşuda (HL1 160×96: 7) değiyor.

**Zafer puanı (HOI4):** ordu hex hex yürür ama bir kümenin warscore payının
%75'i MERKEZ hexinden, %25'i işgal edilen hex payından gelir
(`peace.VICTORY_POINT_SHARE`). Yokken savunan birkaç hexi tutarken saldıran
boş hexlere akıyor, savaşlar kısalıyordu (ortanca 51 → 19 hafta).

**Masada toprak (2026-11-23, Kerem: "peacede çok az toprak alabiliyoruz, o
yüzden cansız kalıyor dünya").** Bağlayan sınır WARSCORE BÜTÇESİDİR: istenen
kümelerin fiyatı toplamı skoru aşamaz; sayı tavanı (`demandLimit`) yalnız
güvenliktir: 15 puanda 1, her 6 puanda +1, en çok 8 (eski 15/30/70 → 1/2/3).
Masaya gelen küme: işgal edilen (hex payı ≥ 1/3 YA DA merkezi tutulan) ve
CEPHE ÖTESİ — işgal edilmemiş ama bize ya da işgalimize komşu küme, tam
fiyatla (`frontierProvincesOf`; oyuncu bunu haritadan tıklayarak zaten
yapabiliyordu, YZ yapamıyordu). Kaybedenin teslim teklifi kazananın bütçesi
kadar toprak verir, aynı seçimle (`surrenderLand`); donmuş savaş beyaz barış
değil, önde olan tuttuğunu alır. Fiyat ucuzladı: pay ağırlığı 130 → 70, işgal
indirimi %40 → %60; YZ kazananın bütçesini yarı yarıya şarta ayırma payı
%35 → %15. **Ezici zafer** (başkent + varlığın yarısı işgalde,
`crushingVictory`): küme tavanı kalkar, başkent de masaya gelir, vassallık güç
oranına bakmadan istenebilir — ama devlet yine silinmez: en az bir kümesi
kalır, başkenti kalan en değerli kümesine taşınır (`relocateCapital`, kayıtta
`capitalAt`). Ekran bütçeyi ve tavanı yazar ("15 of 57 war score left · up to
8 states (crushing victory)"). Ölçüm (audit:borders 45 yıl, savaş payı
ortalaması, ulus önce → sonra): 160×96 BORDER1-3 taban %11.3 (204 → 212);
yalnız sayı tavanı %11.7 (tavan bağlamıyordu); + cephe ötesi, merkez, teslim,
donmuş savaş %14.5 (204 → 215); + ezici zaferde başkent (ilhak serbest) %18.5
ama 204 → 182; + ucuz fiyat %23.5 ama 204 → 164, BORDER1 66 → 46 (ülke
silinmesi bulgusu) — geri alındı, "en az bir küme kalır" eklendi: %18.5
(204 → 197); son hâl %15.9 / 17.6 / 21.1 = **%18.2** (204 → 189). 78×62
BORDER1-6: taban %10.5 (167 → 227) → **%19.3** (167 → 216), en yüksek tohum
%25.6 (kartopu eşiği %33). Şartnamenin %24-30 bandına ulaşılmadı: o bant ancak
devlet silen ilhakla geliyordu (ülke silinmesi kapısını aştı); tohum gürültüsü
±3-6 puan (3 tohum).

**Barış devlet silmez:** başkent state'i masada istenemez (`peace.capitalProvinceOf`;
YZ teklifi, oyuncunun listesi, haritadan tıklama ve savaş hedefi aynı kuralı
okur, antlaşmanın devir adımı da başkenti atlar). Küçük devlet küçülür ve vasal
olabilir; silinme yalnız çöküşle (ordusu ve şehri kalmayan devlet) ya da
barışçıl birleşmeyle olur. Yokken 1900 dünyası 45 yılda ulusların yarısını
kaybediyordu (audit:borders 78×62: 27 → 14, 23 → 13) — silinmelerin çoğu
tek barışla bütünüyle ilhak edilen 1-3 state'lik devletlerdi. Kuralla
27 → 25, 23 → 22, 28 → 26; haritanın %14-26'sı yine el değiştirir.
2026-11-23: ezici zaferde başkent masaya gelir, ama son küme hiçbir barışta
devredilmez (`demandLimitFor`, `signPeace` devri) — kural "başkent korunur"dan
"devlet en az bir kümede yaşar"a döndü (bkz. Masada toprak).

**Vassal (2026-10-15, `src/game/vassals.js`):** vassallık çifti kalıcı barışa
bağlar; efendi vassalına savaş ilan edemez. Engel artık sessiz değil:
`diplomacy.warBlockers` ilanın bütün kapılarını (ateşkes, ittifak/vassal bağı,
SG, çullanma tavanı) tek listede verir, ekran düğmeyi kapatıp nedeni yazar.
Efendinin iki yolu var: **Bırak** (bedelsiz; vassal bağımsız olur, sonra
savaşılabilir) ve **İlhak** (HOI4'ün kuklayı yutması: 40 + 4 × province SG,
bağ en az 104 hafta, iki taraf da barışta; masadaki ilhak şöhretinin dörtte
biri — 0.5'te 12 province'lik yabancı vassal tek başına 18 yazıyordu, eşik
22). YZ ilhak etmez; vassalını yalnız özerklik 90'da bırakır (2026-10-22,
yukarıdaki özerklik): sınır dinamiğine yeni kanal açmak önce audit:borders
ile ölçülmeli.

## 12b. Liderler

Her ulusun başında adı, portresi ve iki-üç kişilik özelliği olan bir lider vardır
(`leaders.js` yaşam döngüsü, `leaderDefs.js` özellikler ve kaldıraçlar,
`ui/leaderPortrait.js` çizim). Oyuncunun lider için tek bir işi yoktur: lider
yönetilmez, tanınır (ev ödevi testi). Özelliğin bilgi kartı hangi kararı nasıl
değiştirdiğini tek cümleyle söyler (cümle testi). Lider konuşmaz: ittifak, tehdit
ve barış masası için yazılan repliklerin hepsi Kerem'in isteğiyle kaldırıldı
(2026-11-18); ekranlar portreyi, adı ve özellikleri gösterir.

- **Değişim:** ölüm (yıllık `0.006 × 1.085^(yaş−40)`, çeyrekte bir bakılır), seçim
  (iktidar partisi değişir ya da iki dönem dolar), darbe (istikrar < %30 ya da
  yorgunluk ≥ %55, en az iki yıllık görev, çeyrekte %5) ve devrim ya da anayasa
  değişikliği. Değişim `politics.ruling` ve `politics.government` farkından okunur;
  mutlakiyette hanedan soyadını ve bir huyu geçirir. Kayıt v28 kalır: alan yoksa
  lider tohumdan kurulur.
- **Oyun zarı çekilmez:** her sonuç tohum + ulus + lider sırası + haftadan özetlenir.
  `DIP_AI.leaders` kapalıyken dünya parmak izi liderlerden öncekiyle bit bit aynıdır
  (FP1, FP2 × 10 yıl). Sınır ölçüsünün tabanı bu koldur.
- **Özellikler** mevcut eşikleri oynatır, yeni karar ya da ikinci ilişki sayacı açmaz:

| Özellik | Etki | Ölçüt (taban) | Etki | Std. hata | Aynı yönde |
|---|---|---|---|---|---|
| Warlike | savaş eşiği ×0.78, ilan zarı ×2 | saldırı savaşı (13.2) | +5.4 | 1.5 | 10/12 |
| Cautious | savaş eşiği ×1.3, ilan zarı ×0.5 | saldırı savaşı (13.2) | −5.4 | 1.5 | 11/12 |
| Opportunist | güçlü saldırganda çağrıya gelmez, ittifak çizgisi −5 | bozulan ittifak + reddedilen çağrı (5.7) | +28.0 | 1.1 | 12/12 |
| Conciliator | ittifak ve pakt hükmü +1 | kurulan ittifak (36.3) | +7.3 | 1.7 | 10/12 |
| Isolationist | ittifak −1.5, pakt +0.5 | kurulan ittifak (36.3) | −28.5 | 1.7 | 12/12 |

**Ölçüm** (`npm run audit:leaders`, 78×62, 12 tohum × 30 yıl): özellik bütün liderlere
zorlanır, nötr dünyayla eşli karşılaştırılır; gürültü iki `HX_PLACEBO` kolunun
farkıdır. Geçme şartı: beklenen yön, |etki| ≥ 2 × std. hata, tohumların en az üçte
ikisi aynı yönde. Tek bir kampanyada Warlike, Cautious ve Conciliator'ın etkisi
tohum gürültüsünün (5.1 ve 5.9) altında ya da yanında kalabilir; ayrışma ortalamadadır.
Kampanya başına ortalama 30 ölüm, 40 seçim, 9 darbe ya da devrim.

**Ölçülüp silinenler:** Faithful (bozulan ittifak farkı 0), Vengeful ve Forgiving (kin
sıralaması da eski düşmana düşük savaş eşiği de 6 tohum × 30 yılda tek kararı
değiştirmedi), Hardliner (görmediği 6 tohumda tekrarlanmadı: +0.6, 3/6), Pragmatist
(12 tohumun 7'sinde iz bıraktı, eşik 8).

**Sınır ölçüsü** (audit:borders, 78×62, BORDER1-6 × 45 yıl; lider kolu kapalı → açık):
savaş + talep payı %12.80 → %10.26 (−2.54; sınır ±4), ulus toplamı 238 → 236 (−2;
sınır ±8), en yüksek tohum %14.6 (≤ 33), TEST 1-3 doğru, savaş 431 → 388. Placebo:
%12.87, 239 ulus, 479 savaş; tohum başına pay −6.9…+4.9 puan oynuyor, lider kolu
−9.8…+7.5.

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

Puan = sanayi + nüfus (milyon) × 3 + çekirdek province + prestij (sanayi
birimi eski fabrika IC'sinin IC_SCALE katı: eski ağırlık 4, bileşim aynı). Prestij
kazanılan savaştan, Büyük X'ten, gündemden ve bir teknolojiyi **dünyada ilk** bulmaktan (+5, Vic2) gelir. İlk keşif yokken araştırma hızı skoru oynatmıyordu (+%50 araştırma → +%1.5, gürültü ±%1.7); şimdi +%0.7/+%10/+%12.5 (gürültü ±%1.1). Her ülkenin bir **ulusal
hedefi** vardır (Birleşmiş Ulus / İmparatorluğu Koru / Sanayi Devi); tutarsa
büyük bonus. Küçük ülke de kendi hikâyesini kazanabilir.

## 15. YZ

Kişilik (ulusun `focus` ve `aggression`'ı) ağırlıkları seçer. Ordu hedefi
`min(havuz × (barışta 0.5, savaşta 0.8) − kura, max(4 + toprak/12, min(çıktı ortalaması × 0.15 / alay ikmali, 2 × toprak hedefi)))`:
zengin ülke toprağından büyük ordu tutar ama tavanlı (tavansız dev 112 alaya
çıkıp kartopunu büyütüyordu); faturaları rahat (çıktının dörtte birinin
altında) ve fonu artıda olan ülke hedefi aşabilir, insan tavanını aşamaz.
İkmal krizindeki ülke yeni alay kurmaz; **ikmal kemeri** (`supplyAI`, eski
kemer sıkmanın yerine) ayda bir adım atar: barışta toprak hedefinin üstündeki
en zayıf alay terhis, sonra okul, sonra Uzun Mesai; savaşta Uzun Mesai,
Requisition the Economy, okul; barışta gemi faturası ordununkinin yarısını
aşıyorsa en eski gövde hurdaya. Faturaları çıktının %45'ini aşan ülke savaş
açmaz. **Besleyemeyeceği orduyu kurmaz:** YZ ordusunun ikmali çıktının en çok
%35'i (toprak tabanı dahil), filosununki %15'i; seferberlik hedefi
faturaların savaş fiyatıyla tavana kadar taşıyabileceği kura alayıyla
sınırlı (oyuncu için de). Yokken barış ulus-haftalarının %1.8'i, savaşınkilerin
%21'i ikmal krizindeydi — çoğu "en az 4 gemi" tabanıyla çıktısının yarısını
donanmaya veren küçük kıyı devletleri; sonra %0 ve %10 (kalanı işgalle çıktısı
çöken kaybeden taraf, audit:econ 3 tohum × 10 yıl). **Doyurma kolu** `autoFeed` ile hat ağırlıklarıyla aynı yerde ve
aralıkta yazılır. Her sistemin
kendi YZ rutini vardır: yasa, hat ağırlığı, doyurma, ticaret yasası,
kültür politikası, gündem, danışman, olay seçimi; diplomaside ittifak
taraması, garanti (büyük güç, rakibinin önündeki küçük devlete), toprak
talebi (bazı savaş ilanlarının yerine), elçi (yalnız kendi vassalı ve
müttefikine), oyuncuya pakt/ittifak teklifi, vassal bırakma (özerklik 90).
AUTO devri aynı rutinleri oyuncu için çalıştırır; diplomasi bakanlığı
masadaki kayıtları cevaplar ama elçi yollamaz, garanti vermez, pakt bozmaz.

## 16. Haftalık sıra

temas/koalisyon → YZ → diplomasi (ültimatomlar, çağrılar, ittifak taraması,
rakip; sonra dış siyaset `pacts.runForeignPolicy`: elçiler → masa → gerekçe
bitimi → pakt bildirimi → vassal özerkliği → çeyreklik YZ adımı, turn % 13 = 7)
→ tur++ → ordu düzeni → takviye → eğitim/
seferberlik → komuta → yürüyüş → province (nüfus, uyum, kültür) → hareketler →
**ekonomi** (ulus başına: kaynak → çıktı → faturalar → hatlar → halk →
yatırım → ticaret teklifi; sonra dünya ticareti (fondan), fiyat, kalkınma
kademeleri, fon defteri) → haraç → siyaset (SG, istikrar,
savaş desteği, parti, seçim, gündem, olay) → muharebe → eleme → emirler → zafer.

## 17. Değişmezler (her hafta doğrulanır)

- Fon defteri kapanır: açılış + Σ satır = kapanış.
- Çubuk kapanır: çıktı = faturalar + ordu + halk + kalkınma, her pay ≥ 0; faturalar tavanı, ordu yasanın sanayi payını aşmaz; kalkınma ve kale tamsayıdır.
- Kaynak dengesi: üretim + ithalat = tüketim + ihracat + açık.
- Dünya ticareti kapanır: Σ ithalat = Σ ihracat (miktar ve değer — IC, fondan fona; değer sınaması 2026-10-14'te harness.scanInvariants'a eklendi).
- Nüfus, insan gücü, stok negatif olmaz; hiçbir sayı NaN olmaz.
- Aynı tohum aynı oyunu üretir.

## 18. Devlet politikaları (2026-11-18)

Kerem: "vassallara işkence etme gelsin, nüfusunu aç bırakıp IC alma, pop kaçırma,
işgal edilen yerler için politikalar, bir state'i hapishaneye dönüştürme, tersi
veya nötrü daha iyi davranmalar, kültür birleştirme". Dört karar da ULUS
düzeyindedir (ev ödevi testi) ve tek ekrandadır (`ui/policyScreen.js`, döküm
`game/policyView.js`; Politics ve Cultures'tan açılır). Sabitler `policyDefs.js`,
haftalık giriş `policies.runPolicies` (province fazı), kamp ve kaynaşma
`culturePolicy.js`. Her alan `orders.setPolicyOrder` ile kabineye devredilir;
kabine sert uçlara gitmez, kamp açmaz, Total Plunder seçmez. Kayıt sürümü 28
kalır: alanlar yokken bugünkü dünya işler.

**Vassal merdiveni** (doktrin tek karar, 15 SG; vassal başına elle duruş istisna,
26 hafta bekleme). Haraç vassalın çıktısının payıdır ve faturaya girer:

| Duruş | Haraç | Kanal | Özerklik | Şöhret/hafta |
|---|---|---|---|---|
| Asset Stripping | %10 | çeyrekte 2 state bir kademe sökülür, bedelin %25'i efendiye | +22 | 0.22 |
| Labour Deportation | %7.5 | nüfusun haftada %0.15'i efendiye (yolda %10 ölür; kamp varsa kampa) | +18 | 0.18 |
| Grain Requisition | %15 | hasadın %40'ı efendiye, nüfus haftada %0.08-0.16 erir | +16 | 0.16 |
| Forced Levy | %7.5 | savaşta 8 haftada bir vassal insanından kura alayı (en çok 4) | +12 | 0.11 |
| Industrial Levy | %22 | ikmal krizine itebilir | +10 | 0.09 |
| Resource Extraction | %10 | gıda dışı yatakların %30'u efendiye | +8 | 0.07 |
| Standard Tribute | %7.5 | antlaşma | 0 | 0 |
| Protectorate | %5 | istikrar +5, büyüme +%10, huzursuzluk −%15 | −8 | 0 |
| Development Partnership | %3 | efendi çıktısının %6'sı vassal fonuna, yatırım +%25, tavan +2 | +4 | 0 |
| Self-Government | %2 | istikrar +6, çıktı +%5 | +20 | 0 |

Bedel gecikir: sert duruş ilişki defterini kirletir (denge katsayı ÷ 0.01), ilişki
özerkliği yükseltir, 80'de vassal efendi sendelerken kopar. Şöhret sayıları haftalık
sönmeye göre seçildi (`0.05 + 0.012 × şöhret`): 0.05'in altı hiç birikmiyordu.

**İşgal yasaları** (10 SG, 13 hafta bekleme; işgal edilen state'in işgücü çıktısından):
Total Plunder %50 (direniş +2.0, nüfus haftada −%0.08, yılda kademe sökümü, emek taşınır,
şöhret 0.05/state) · Requisition %28 (+0.9, 0.02) · Military Government %10 (+0.2) ·
Civil Administration %4 (−0.8; barışta alınırsa uyum +30). Direniş geliri %70'e dek
keser, garnizonu yıpratır, sahibin huzursuzluğuna biner; barışta alınan state'e şikâyet
olarak geçer, sert yasa uyumu −10/−20 düşürür.

**Ceza state'i** (60 SG + 6 şöhret; en çok 1 + state/12, tavan 3; başkent, kendi
yurdumuz ve Full Citizenship'te yok). Halk başına tek kutu: işaretli halk her state'ten
haftada %0.4 taşınır (yolda %3 ölür, kamp başına 1.2 milyon tavan). Sürgün gibi kriz
kapısı vardır: savaş, Residency yasası ya da Agitation'a varmış hareket. Rejim ulusun
tek kararıdır: Detention (yılda %1.5 ölüm, 100 bin mahkûm başına 0.15 IC) · Forced Labour
(%6.1, 0.60) · Penal Battalions (%3.1, 0.18, mahkûmun %25'i kuraya girer) · Labour to
Exhaustion (%16.7, 1.08). Bedel: haftalık şöhret, state'te huzursuzluk +4, halkın yaşadığı
her yerde pay × 2, hareketine haftalık ilerleme, soydaş devletlerin defteri, ulusal
istikrar −1.5/kamp; kamp düşmana düşerse +12 şöhret. Toptan yok etme seçeneği yine yoktur:
ölüm rejimin bedelidir, amacı değil.

**Kaynaşma** (120 SG; barış, istikrar ≥ %50, okuryazarlık ≥ %15, payı ≥ %3, Home Rule'suz
hak sahibi halk). Halkın payı haftada `%0.25 × (0.6 + okuryazarlık)` ana halka geçer, ana
yurt kilidini aşar, talebi söner; pay %2'nin altına inince halk ana halka karışır, yurdu
bizim yurdumuz olur, prestij +5.

**Ölçüm** (`npm run audit:policies`, 3 tohum, eşli kol, eşik max(2 × dürtü, %5), her
tohumda aynı yön): 25 kaldıracın 25'i çalışıyor. En ince pay Development Partnership
(küçük vassalın kalkınması, 10 yılda +%6.3; tohum başına +1.6 / +16.7 / +0.5: kademe bedeli
karesel olduğu için para yıllarca birikir). Düzeltilen ölü kanallar: alay tek state'ten
toplanamıyordu, haftalık küçük ilişki kaydı defterde budanıyordu (0.5 altı), küçük şöhret
sönmenin altında kalıyordu.

*Sınır ölçüsü* (`POLICY_ARMS=none` ile `all`, 78×62, BORDER1-6 × 45 yıl; `none` taban commit
ile 10 yılda bayt bayt aynı): savaş + talep payı ortalaması %12.80 → %9.88 (−2.92; sınır ±4),
nihai ulus toplamı 238 → 230 (−8; sınır ±8, **tam sınırda**), en yüksek tohum %13.1
(≤ 33), savaş 431 → 453, TEST 1-3 DOĞRU. Placebo (`none` + `HX_PLACEBO=1`): %12.88, 239 ulus,
479 savaş; tohum başına savaş payı −6.9…+4.9 puan, ulus −3…+2. YZ kullanımı (BORDER1-3 × 45 yıl):
sonda 0-3 kamp, kampanya başına 7-11 kaynaşma, ulusların %7-14'ü Requisition'da.
