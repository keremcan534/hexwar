# REMAINING OPEN BETA ISSUES

Bu geciste **kapatilmayan** bulgular. Kapananlar icin
[BETA_REPAIR_LOG.md](BETA_REPAIR_LOG.md).

Siniflandirma: P0 kampanyayi bozar · P1 buyuk oyun kaybi · P2 kullanilabilirlik
/ entegrasyon · P3 cila.

---

## P0 — kalan yok

Beta'nin uc P0'i (bedava beyaz baris, ticaretin hazineye dokunmamasi, suda
yetim kalan ordular) kapatildi ve regresyon testi yazildi.

---

## P1

### P1-1 · Dunya piyasasi fiyat bandinda kilitleniyor — **BUYUK OLCUDE KAPANDI**
**Kaynak:** beta §11 · B-04.
**Durum:** kok neden bulundu ve duzeltildi (bkz. LOG **R-10**). Hipotezim
("kisir dongu: girdi pahali → marj negatif → tesis kurulmuyor") **olcumle
curudu**: gubre tesisi 34 tane kurulu ve marji %100 hafta pozitifti, arz yine
0.1'di. Gercek sebep bir ust katmandaydi — **RGO dagitimi**: kukurt ve ipek
dunyada **tek kume / tek hex**e dusmustu. Kitlik ekonomik degil yapisaldi.

Olculen sonuc: kalici tavan mali **10 → 6**, komur **6.4x → 0.86x taban**,
kukurt/ipek/luks mallar listeden cikti, muhimmat neredeyse dengede.

**Kalan (daha kucuk):** hala 6 mal kalici tavanda — Fertilizer, Cement, Fuel,
Ammunition, Liquor, Furniture. Bunlarin cogu artik gercek bir kapasite yarisi
(arz buyuyor, talep daha hizli buyuyor) — saglikli. Tek yapisal istisna
**Fuel**: Oil Refinery hic kurulmuyor (cag kapisi 1870 + marj negatif), yani
`investmentOptions`'in `margin > 0` suzgeci burada gercekten isiriyor.
**Sonraki adim:** suzgece "urunu kalici tavandaysa negatif marja ragmen dene"
istisnasi, ya da girdisi olmayan tesis icin beklenen marji girdi
ULASILABILIRLIGIYLE agirliklandirmak.

### P1-1b · Komur: bilesik talep vs dogrusal arz — **YENI, en buyuk kalan is**
**Kaynak:** R-10 dogrulanirken olculdu; iki hipotez test edilip **curutuldu**
(ayrinti: LOG **R-14**).

**Curuyen H1 — "dunya buyudukce acik buyuyor".** Uc harita boyunda olculdu;
hex/nufus sabit (176-182), gida ve demir buyuk haritada DAHA IYI (0.78 →
0.99). Olcek sorunu yok.

**Curuyen H2 — "komur taban ciktisi dusuk".** `baseOutput` 0.288 → 0.5 → 0.8
denendi. 0.8'de bile 1866'da oran yalnizca 0.31 ve **erken oyun bozuluyor**
(1841'de komur fiyat TABANINA duserek beta'nin en sevdigi anlardan birini yok
ediyor). Sabit artis iki ucu birden bozar.

**Gercek sekil:** komur **dokuz** fabrika tipinin girdisi; sanayi talebi
BILESIK buyurken RGO arzi DOGRUSAL buyuyor (gelisim tavani 10, seviye basina
x0.18 → azami ~2.8 kat). Seviye degil, **buyume hizi** uyumsuzlugu.

**Sonraki adim (iki secenek, olculerek secilmeli):**
1. **Talep tarafi:** fabrika girdi oranlarini throughput ile alt-dogrusal
   yap (olcek ekonomisi) — beta'nin "223 seviye sanayi, gelir yariya dustu"
   bulgusuyla da ortusuyor.
2. **Arz tarafi:** RGO gelisim tavanini (10) ya da seviye carpanini (x0.18)
   sanayi talebiyle birlikte buyuyen bir seye bagla.
Her iki durumda `audit:long-run` ve `audit:market` taban cizgileri kayar.

### P1-2 · POP gelir defteri kendi icinde tutarsiz
**Kaynak:** `audit:population` **HIGH** x3, `audit:factory` **HIGH** x2.
- `needsBudget` net gelirden **turemiyor**; iki sayi bagimsiz hesaplaniyor
  (en kotu sapma %1443.9).
- Hane butceleri toplami gelirin **7.2 kati**.
- Sinifta `savings`/`wealth` stogu **yok** — her hafta sifirdan baslar.
**Etki:** sinif geliri pratikte dekoratif (yalniz vergi matrahi). Iyi yillar
kotu yillari tasimaz; kitlik bir birikimi eritmez.
**R-10 sonrasi buyudu (gorunurlukte, kapsamda degil):** sanayi fiilen
calismaya baslayinca iki kalem daha esigi asti —
- **fabrika kari hicbir yere akmiyor**: haftada **¤1327.7** kar uretiliyor,
  hazineye 0, hane gelirine 0; yalnizca %8'i ozel sermayeye yaziliyor.
  `incomePool = uretimDegeri x 0.18/0.22` formulunden gelir, **kardan degil** —
  yani kar/zarar hane butcesini hic degistirmez.
- **467 isci iki yerde birden sayiliyor** (fabrika kadrosu ulusal isci
  sayacini asiyor).

Bunlari R-10 YARATMADI; sanayi girdisiz oldugu icin gizliydiler.

**Neden kapatilmadi:** POP ekonomisinin gelir tarafini yeniden baglamak
demek — brief'in "buyuk yeniden yazim yapma" kuralina en cok yaklasan is.
Olculmeden dokunulmamali.
**Not:** R-01 (dis hesap) bu deligi BUYUTMEZ; ticaret zaten hane butcesinden
degil piyasa fiyatindan gecer.
**Bir yarisi KAPANDI (R-15):** `factory.profit`'in yarisi artik ust sinif
gelirine akiyor. Sonuc: "sanayi kari hicbir yere akmiyor" bulgusu kapandi,
hane butcesi/gelir orani **7.2x → 3.0x**.

**Ikisi daha KAPANDI (R-16):** hane `savings` stogu eklendi (iyi yillar kotu
yillari tasir, kitlik birikimi eritir) ve issizlik artik hane memnuniyetini
dusuruyor (alt sinif tam issizlikte -0.22, orta sinif yarisi; ust sinif
etkilenmez cunku o KARINDAN kaybeder).

**Buyuk olcude KAPANDI (R-17):** butce artik gecen haftanin net gelirine
harmanlaniyor (`w = 0.35`, olculerek secildi).

| Olcum | Once | R-15 | R-16 | R-17 |
|---|---|---|---|---|
| Gelir defteri sapmasi | %1443 | %1084 | %2688 | **%712** |
| Hane butcesi / gelir | 7.2x | 3.0x | 4.3x | **2.1x** |
| Dunya ihtiyac karsilanmasi | — | — | %83.2 | **%86.1** |

**Neden tam kapanmadi — ve neden `w` buyutulmemeli:** olculdu (780 hafta,
urun haritasi) — `w = 1.0` "dogru model"dir ama **dunyanin ucte birini aca
dusurur** (32/67 ulke) ve nufusu 24.3M → 19.7M coker. Sebep: iki formulun
OLCEKLERI ayni degil. `CLASS_NEEDS_BUDGET` sepet olcegi ile `incomePool`
katsayilari (0.18 / 0.22) farkli birimlerde.

**Sonraki adim (tek is, net):** `w`'yi artirmak DEGIL — once
`CLASS_NEEDS_BUDGET` ile `incomePool` katsayilarini ayni olcege oturt
(hedef: `w = 0`da butce/gelir orani ~1.0 civari). Olcek esitlenince `w`
guvenle 1'e cikarilabilir ve iki bulgu birden kapanir. Her adimda
`audit:population` + `audit:long-run` + aclik sayaci karsilastirilmali.

### P1-3 · Egitim harcamasi olcusuz — **KAPANDI**
**Kaynak:** BUG-019 / B-07. Beta: 62 yil %40 egitim → okuryazarlik %24 → %23.
**Kok neden (R-18):** `literacyOf` **stateless bir formuldu** — dosyanin kendi
yorumu soyluyordu: *"Simule edilen bir istatistik DEGILDIR."* Hicbir sey
birikmiyordu; egitim sabit kalinca geriye yalnizca SINIF BILESIMI etkisi
kaliyor, sanayilesme koyluyu dusuk okuryazarlikli isci sinifina tasidigi icin
oran DUSUYORDU. Oyuncu yanilmiyordu.
**Cozum:** ulusal okuryazarlik **stogu**; egitim + universite hedefi belirler,
stok yillar icinde yaklasir. Beta ayarinda (%40) artik duzenli YUKSELIYOR
(isci %8 → %13, orta %26 → %43).
**Ustune (R-19):** okuryazarlik artik **arastirma puani** uretiyor, yani
egitim butcesi teknolojiye donusuyor — %0 egitim 11 teknoloji, %100 egitim 18.

### P1-6 · Teknoloji ekrani ve kalan degistiriciler — **YENI**
**Durum:** teknoloji sistemi calisiyor (R-19) ama iki eksik var.
1. **Ekran yok.** Oyuncu arastirma YONU secemiyor; `pickResearchAI` (en ucuz)
   herkes icin kosuyor. Vic2 duzeni: 5 sutun x 6 kademe, secili tekin
   etkileri, "Start Research".
2. **Bagli olmayan degistiriciler:** `factoryThroughput`, `inputEfficiency`,
   `rgoOutput`, `supplyConsumption`, `morale` hesaplaniyor ve saklaniyor ama
   okunmuyor. Her biri tek satir, ama her biri dengeyi kaydirir — dengeleme
   pasajinda **tek tek** olculerek baglanmali.
3. Kalan dort kategori (120 teknoloji); iskelet hazir.

### P1-4 · Issizlik hane refahina gecmiyor — **KAPANDI**
**Kaynak:** `audit:population` **HIGH**: istihdam %70.0 → %62.4 degisti,
memnuniyet 0.59 → 0.57.
**Iki yari da kapandi:**
- **Ulusal:** issizlik dogrudan istikrara giriyor (R-05, agirlik 0.22) ve
  dokumu ekranda gorunuyor.
- **Hane:** memnuniyet artik issizligi goruyor (R-16). Oran `unemploymentOf`
  ile TEK kaynaktan okunur, yani ekrandaki kalem ile hanenin hissettigi ayni
  sayidir.

### P1-5 · Para hala kapasite satin alamiyor
**Kaynak:** B-03 / beta §19-3. Bu geciste hazine artik **sinirsiz degil**
(R-01: dis acik hazineyi bosaltiyor, borc ve temerrut gercek). Ama brief'in
Phase 2'si — paranin *throughput* satin almasi (egitim slotu, insaat
hizlandirma, sanayi destegi) — **yapilmadi**.
**Neden:** P0'lar once geldi. Onemli: artik para kit oldugu icin bu ozellik
eskisinden DAHA anlamli.
**Kural hatirlatmasi:** para asker satin ALMAZ. Yalnizca kapasite.

---

## P2

### P2-1 · Insaat kuyrugu widget'i
**Kaynak:** beta §7-1 SEVERE, §19-5. Bir kalemi basa almak ~20 tik; satirlar
imlecin altinda yeniden numaralaniyor; 8. satir gorus alaninin altinda.
**Durum: KISMEN KAPANDI (R-11).** Tek tikla basa (⤒) ve sona (⤓) tasima
eklendi: ~20 tik → **1 tik**. Karara (build power onceligi) dokunulmadi.
**Kalan:** surukle-birak yok; satirlar hala her cizimde yeniden numaralaniyor
(P2-3 ile ayni kok); 8+ kalemde son satir gorus alaninin altinda kalabilir.

### P2-2 · Savas ilani rutin bildirim gibi
**Kaynak:** BUG-013. *"Draesh declared war on us!"* ile *"Clothing Factory
reached level 6"* ayni yigin, ayni bicim. Oyuncu savasta oldugunu fark etmedi.
**Durum: KAPANDI (R-12).** `NOTIFY.WAR` ve `CRISIS` artik `halt: true` — yeni
kart oyunu **durduruyor** (olculdu: hiz 3 → 126. turda savas ilani → hiz 0).
Tekrar eden ayni olay duraklatmaz; YZ-YZ ilanlari zaten gunluge yazilmiyor.
**Kalan:** modal degil, ayrismis kart. Ayri "sonucu olan olaylar" akisi
(§19-6) yapilmadi.

### P2-3 · Tablo siralamasi kararsiz
**Kaynak:** BUG-020. Oyun duraklatilmadan ayni state'e iki kez tiklanamiyor.

### P2-4 · Bildirimler panel sekmelerini ortuyor
**Kaynak:** BUG-021.

### P2-5 · Ulke secim ekrani yok
**Kaynak:** beta §19-9. Dunya uretiliyor ve oyuncuya bir ulke *veriliyor*.

### P2-6 · Sohret/koalisyon tehdidi hic atesle(n)miyor
**Kaynak:** B-06. Sohret 33, esik 22, koalisyon yok, sonra 0'a soneyor.

### P2-7 · Donanma erisilemez
**Kaynak:** B-11. *"Steamer Convoys short: 6 needed, 2.6 in stock"*, cikis
yolu kesfedilemiyor. **Kismen aydinlandi:** Steamer Shipyard `availableFrom`
732 = **1850**. Yani 1836'da donanma yapisal olarak imkansiz ve UI bunu
soylemiyordu. Fabrika tarafi R-07 ile duzeldi; birim/konvoy tarafinda ayni
"neden" metni hala yok.

### P2-8 · Mal bazli ticaret politikasi bagli degil
**Kaynak:** BUG-026. AUTO / IMPORT PRIORITY / EXPORT PRIORITY / STRATEGIC
RESERVE kabuk. **Onem arti:** R-01'den sonra dis pozisyonun mali sonucu var,
dolayisiyla bu dort dugme artik gercek bir kaldirac olur.

### P2-9 · Iki komutan ayni panelde
**Kaynak:** BUG-012.

### P2-10 · Terminoloji cakismasi (hex / province / state)
**Kaynak:** BUG-003, BUG-007.

### P2-11 · Savas skoru rozeti absurt deger
**Kaynak:** BUG-018: rozet "+44K" derken baris ekrani -31 diyor.

---

## P3

- BUG-001 sekme basligi "HexWar" (oyun "Imperial Eye").
- BUG-002 menu rayi dugmelerinde erisilebilir ad yok.
- BUG-004 yuvarlanmamis float (`power 14.06111111111111`).
- BUG-005 ilk tikten once butun ekonomik degerler ¤0.
- BUG-006 `1 cities`.
- BUG-010 adsiz sehir `City-101`.
- BUG-014 `SEVERE SHORTAGE 100% met`.
- BUG-016 "power ratio" yonu okunmuyor.
- BUG-022 ayni adli generaller.
- BUG-023 Escape panelleri kapatmiyor.
- BUG-024 `round 0/20 · 0 losses` muharebe paneli.
- BUG-025 `Land ratio: 0.00` "otomatik" demek.
- **Yeni (R-04):** hedefi olmayan generallerin hepsi ayni dusman sinirini
  turetiyor; panelde tumeni olmayan "ikiz cephe" bos gorunuyor. Tahsis
  dogru (kardes grup tutuyor), gosterim yaniltici.

---

## Bu geciste OLCULUP DOGRULANMAYAN gelistirici hipotezleri

Brief bunlari hipotez saydi; uretilmeye calisildi ve **uretilemedi**. Kapali
sayilmamali ama acik kusur olarak da tutulmamali:

| Hipotez | Olcum |
|---|---|
| Cepheler bos kaliyor | medyan doluluk %44, `YERLESIK` 62/112 |
| Ordular absurt yerlerde atil | en uzun atil kalis **1 hafta** |
| Cephe tahsisi bozuk | mevkiye yerlesme **%85.3** |
| Ulkeler yetersiz kuvvetle basliyor | 1.20-4.33 tumen/cephe-karesi |

Kosum: `node scripts/audit/military-strategy-audit.mjs 400`.
