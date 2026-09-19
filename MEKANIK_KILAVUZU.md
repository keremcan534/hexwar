# HexWar — mekanik kılavuzu

Oyundaki her mekanik için dört şey:

| | |
|---|---|
| **Formül** | tek satırda, yazılı hâli |
| **Kod** | gerçek kaynak, dosya:satır ile |
| **Çalışıyor mu?** | EVET / HAYIR — ölçülmüş, tahmin değil |
| **Pratikte** | oyunda ne yapman gerektiği |

Son ölçüm: 2026-08-29, dal `experiment/simple-budget`; siyaset (§6) 2026-09-17, `master`.
Yeniden üretmek için: `npm run audit:mechanics` ve `npm run audit:budget-contract`.

---

## "Çalışıyor mu?" ne demek

Bir mekaniğin çalıştığı **varsayılmaz, ölçülür**. Ölçüm tek soru sorar:
kaldıracı tabandan tavana çekince oyunda ölçülebilir bir şey değişiyor mu?

Ama "değişti" yetmez. Aynı senaryo farklı tohumlarla koşulduğunda çıktılar
zaten kendiliğinden oynar. Bir kaldıracın **bütün menzili** o kendiliğinden
oynamanın altındaysa oyuncu onu asla ayırt edemez — matematiksel olarak
vardır, oyun olarak yoktur.

**Ölçülen gürültü tabanı** (6 tohum, hiçbir şeye dokunulmadan):

| Ölçüt | Kendi gürültüsü | Ne demek |
|---|---|---|
| hazine | %50.8 | dünyalar arası en oynak şey para |
| GSYH | %51.9 | aynı |
| nüfus | %39.1 | coğrafya belirliyor |
| needsMet | %26.5 | sepet karşılama oranı |
| istikrar | %5.5 | dar bant, hassas ölçüt |
| memnuniyet | %5.3 | en hassas ölçüt |
| okuryazarlık | %0.0 → taban %5 | dokunulmayan ülkede tamamen belirlenimli |
| teknoloji sayısı | %20.2 | 120 haftada 2–3 kez zıplayan kaba sayaç |
| haftalık araştırma | %4.8 → taban %5 | her hafta değişen, ekranda yazan sayı |

Okuryazarlığın gürültüsü sıfır çıktığı için bölme anlamsızlaşırdı; taban %5'te
tutuluyor. Bu keyfi değil: ölçülen en küçük taban memnuniyetin %5.3'ü ve bu, bu
oyundaki "insanın fark ettiği en küçük değişim" ölçeği.

**Dört hüküm:**

- **ÇALIŞIYOR** — gürültünün üzerinde. Mekanik var.
- **GÜRÜLTÜ ALTI** — kımıldıyor ama oyuncu ayırt edemez.
- **ÖLÜ** — hiçbir ölçüt kımıldamadı, bit bit aynı. *Şu an sıfır tane var.*
- **SAVAŞ KALDIRACI** — barış arenasında ölçülemez (aşağıda `armyFunding`).

**Bugünkü tablo (2026-09-19): 13 kaldıraç (5 yasa, meşruiyet, 7 bütçe) · ÇALIŞIYOR 12 · GÜRÜLTÜ ALTI 0 · ÖLÜ 0 · SAVAŞ 1.**
Siyaset sadeleşmeden önce tarama 26 mekaniği (18 merdiven dahil) sayıyordu: 24 · 1 · 0 · 1.
Bu tarama ilk koştuğunda 26 mekanikten **10'u ölüydü.**

---

# 1. BÜTÇE — beş kaldıraç

Bütçe ekranında beş şey var, hepsi tek kapıdan geçer (`setBudgetPolicy`).
Oyuncu ve YZ aynı sınırları kullanır; gizli YZ tavanı yok.

## 1.1 Vergi · `taxRate`

**Formül**

    tahsilat = Σ_sınıf ( sınıf geliri × vergi oranı × sınıfın ağırlığı )

    ağırlık senin seçimin DEĞİL, iktidarın ideolojisinin:
      artan  (sosyalist/komünist)  alt 0.45 · orta 0.95 · üst 1.85
      düz    (liberal)             alt 1.00 · orta 1.00 · üst 1.00
      azalan (muhafazakâr/faşist)  alt 1.40 · orta 1.10 · üst 0.50

**Kod** — `src/game/economy.js:1648` ve `:2850`

```js
export function classTaxRate(nation, classId) {
  const rate = nation?.economy?.taxRate ?? 0;
  const weight = taxStructureOf(nation).weights[classId] ?? 1;
  return clamp(rate * weight, 0, 100);
}

// tahsilat:
socialClass.taxPaid = socialClass.income * (classTaxRate(nation, classId) / 100);
```

**Çalışıyor mu?** **EVET** — %0 → %100 istikrarı %26.2 oynatıyor, gürültünün
**4.77 katı.** Bedeli ayrıca izole ölçüldü (`audit:budget-contract` §6): vergi
%5'ten %70'e çıkınca alt sınıf memnuniyeti 0.44 → 0.37.

**Pratikte** — oran "ne kadar"ı, iktidar "kim"i belirler. Aynı %40 vergi,
muhafazakâr hükûmette işçinin sırtına biner (1.40 ağırlık), sosyalist
hükûmette aristokratın (1.85). Yani seçim sonucu bütçeni oynatır sen hiçbir
kaydıraca dokunmasan bile. Memnuniyet formülünde vergi **-0.28** katsayıyla
girer, refah **+0.14** ile: yani refahı sonuna kadar açsan bile vergiyi iki
katı kadar açarsan halk yine küser. %30–45 bandı çoğu oyunda doğru yer;
üstüne çıkacaksan refahı da açıp isyanı satın alman gerekir.

**Aç ve borçlu devlet alt sınıfı sıkıştırmaz (YZ ve devredilmiş bütçe).**
Ölçüldü: gıdası eksik ülkelerin hepsi alt sınıf vergisinde %90–100'deydi —
borç YZ'yi vergiye itiyor, vergi haneyi gıdadan ediyordu. Artık hazine
sıkışıkken alt sınıf sepetini karşılayamıyorsa (`adjustFiscalAI`) alt vergi 5
puan iner ve yük sepetini karşılayabilen orta/üst sınıfa 5'er puan kayar.
Kaydırma olmadan indirim sıkışık hazineyi daha da sıkıştırırdı. Bu pass'in
öbür değişiklikleriyle BİRLİKTE ölçüldü (ayrı kol koşulmadı): 20. yılda alt
vergisi ≥%90 ülke 9.3 → 1.7, borçlu ülke 34 → 24 (bkz. §4.7 tablosu).

**Geçim tavanı: vergi artışı sepeti yiyene kadar sürmez (2026-09-19).** Yukarıdaki
fren yalnız *aç* devleti tutuyordu; `canAffordNeeds` sadece YAŞAM kademesine
baktığı için ekmeğini alabilen orta sınıf "zorlanmış" sayılmıyor, merdiven
haftada +5 ile %100'e tırmanıyordu. Ölçüldü (4 tohum × 30 yıl, AUTO açık):
YZ medyanı orta vergide %75–90, üst vergide %80–100 ve orta sınıf payı 30.
yılda %2.9–9.5'e iniyordu; oyuncu ulusunda iki tohumda %0.02'ye kadar çöktü.
Artık `adjustFiscalAI` artışı `classTaxThresholds().survival` oranında
kesiyor — eşik uydurma değil, `alerts.js`'in zaten oyuncuya önerdiği "sepetin
%60'ını bırakan oran". Eşik ulaşılamıyorsa (sepet gelirin üstünde) fren
uygulanmaz, çünkü orada vergi kaldıraç değildir. Ayrıca eşiğin üstünde kilitli
kalan oran haftada 5 puan iner; eski kayıtlar da böyle onarılır.

Sonuç (aynı tohumlar, 30. yıl): YZ orta vergi medyanı %75–90 → %50–53, orta
sınıf payı %2.9–9.5 → %16.5–18.7, üst sınıf payı %1.9–2.9 → %2.9–8.8. **Bedeli
var:** hazine farkı borçtan kapatıyor, borçlu ülke sayısı 9–14 → 13–23'e
çıkıyor; GSYH iki tohumda artıyor (383→403, 509→659), ikisinde düşüyor
(573→546, 563→499). Yani bu değişiklik "daha zengin dünya" değil, **vergiyi
nüfusu yok eden bir kaldıraç olmaktan çıkarma**dır.

## 1.2 Gümrük · `tariff`

**Formül**

    gümrük geliri  = ithalat değeri × oran
    ithal girdinin fiyatı = dünya fiyatı × (1 + oran × o malın ithal payı)
    ithalat iştahı = 1 / (1 + oran × 1.6)
    ihracat erişimi = 1 / (1 + oran × 0.5)          ← misilleme

**Kod** — `src/game/economy.js:2514`, `:3444`, `:3448`

```js
// fabrikanın girdi maliyeti — gümrük yalnız İTHAL EDİLEN paya biner
const importShare = clamp(economy.goodsFlow?.[id]?.importShare ?? 0, 0, 1);
const tariffFactor = 1 + (economy.tariff / 100) * importShare;
inputCost += priceOf(world, id) * consumed * tariffFactor;

// ithalat iştahı ve ihracat erişimi
const appetite = 1 / Math.max(0.05, 1 + (nation.economy.tariff / 100) * IMPORT_ELASTICITY);
const access   = 1 / (1 + Math.max(0, nation.economy.tariff / 100) * EXPORT_RETALIATION);
```

**Çalışıyor mu?** **EVET** — hükûmetin izin verdiği taban–tavan arası hazineyi
%74.5 oynatıyor, gürültünün **1.47 katı.** Gümrük gelirinin ithalat değeriyle
mutabakatı ayrıca ölçülüyor: 27 ülkede en büyük sapma **%0.0**.

**Pratikte** — gümrük fabrikanın gelirini azaltır. Ama **hepsinin değil,
sadece dışarıdan girdi alanların**: kendi kömürünü, kendi pamuğunu kullanan
tesis gümrükten hiç etkilenmez. Yani korumacılık yerli tedarik zincirini
kayırır. Eksiye çekersen ters çalışır — ithalat sübvansiyonudur, farkı hazine
öder ve dışarıya bağımlı fabrikan daha çok kazanır. Üç bedel birden var:
hazine öder, ithalat iştahı düşer (karşılanmayan talep büyür), ihracat erişimin
kısılır. Sanayin ithal girdiyle dönüyorsa yüksek gümrük kendi fabrikanı
vurur. **Bandı hükûmetin belirler:** serbest ticaret partisinde -50…+25,
korumacıda -15…+100. Yani gümrüğü sonuna kadar açmak istiyorsan önce doğru
hükûmeti kurman gerekir.

**Gıda ithalatı iştahtan muaftır** (`settleGlobalTrade`, `FOOD_GOODS` için
iştah 1). Ölçüldü: dünyada gıda fazlayken %50 gümrük iştahı 0.56'ya
indiriyordu ve ekmek de bu kesintiye giriyordu — 10. yılda 64 ülkenin 23'ünde
raftaki gıda tam 0.56'da kalıyordu. Devletler lüksü keser, tahılı değil:
gümrük gıdanın fiyatına yine biner (hane sepeti), yalnız miktarını kısmaz.
Sanayi girdisinde ve ihracat erişiminde bedeli aynen sürer.

## 1.3 Ordu fonu · `armyFunding`

**Formül**

    muharebe gücü   = 0.55 + fon × 0.45          ← battles.js
    takviye hızı    = 0.25 + fon × 0.75          ← military.js
    eğitim hızı     = 0.45 + 0.4×fon + 0.15×ikmal ← recruitment.js
    tedarik hedefi  = ihtiyaç × fon               ← ekipman alımı da ölçeklenir

**Kod** — `src/game/battles.js:117`, `src/game/military.js:360`,
`src/game/recruitment.js:369`

```js
return armyPower(unit)
  * (0.55 + funding * 0.45)
  * (0.65 + readiness * 0.35)
  * terrain * generalModifier(...) * (defending ? 1 : planningBonus(...));

const reinforcement = BASE_REINFORCEMENT_RATE * (0.25 + funding * 0.75);
return 0.45 + 0.4 * wages + 0.15 * supply;
```

**Çalışıyor mu?** **EVET — ama barış taramasında görünmez.** Bu tarama bilerek
savaşsız koşar (savaş toprağı değiştirir, toprak nüfusu, nüfus her şeyi; o
zaman iki kol arasındaki fark kaldıraca değil kimin kimi fethettiğine bağlanır).
Ordu fonunun **üç çıktısının üçü de muharebe yolundadır**, dolayısıyla barışta
yalnızca **maliyeti** ölçülür. Üçü ayrıca doğrulandı — `audit:budget-contract`
§6: muharebe gücü 0.66 → 0.89, takviye 0.28 → 0.53, ikisi de doğru yönde.
"Ölçülemedi" ile "yok" aynı şey değildir; tarama bu ikisini artık ayrı
kategoride raporlar.

**Pratikte** — %25'te ordun kâğıttan, %100'de tam güçte ve pahalı. Barış
yılında %25–40'a çek, para biriktir; savaş ilan etmeden 8–10 hafta önce
%100'e çık ki depolar dolsun (tedarik hedefi de fona bağlı, yani düşük fonla
hemen savaşa girersen yarım depoyla girersin). Tavanı hükûmetin belirler:
pasifist hükûmette %60'ın üstüne çıkamazsın.

## 1.4 Eğitim · `education`

**Formül**

    haftalık gider = (nüfus / 10.000) × bütçe% × 0.34

    okuryazarlık HEDEFİ = 0.08 + bütçe% × 0.62   (okul yasası tabanı altına inmez)
    okuryazarlık STOĞU  += (hedef − mevcut) × 0.004     ← her hafta

**Kod** — `src/game/economy.js:539`, `:3865`, `:3878`

```js
export function programmeCost(nation, programId) {
  const program = SOCIAL_PROGRAMS[programId];
  if (!program || !nation?.economy) return 0;
  return (nation.economy.population / 10000) * socialLevel(nation, programId) * program.rate;
}

export function literacyTargetOf(nation) {
  const schooling = clamp(economy.social?.education ?? 0, 0, 100) / 100;
  const reach = economy.techMods?.literacyReach ?? 0;
  const budgeted = 0.08 + schooling * 0.62;
  const floor = lawModifiers(nation).literacyFloor ?? 0;   // refah YASASI (okul)
  return clamp(Math.max(budgeted, floor) + reach, 0, 0.95);
}

economy.literacy = current + (target - current) * LITERACY_APPROACH;  // 0.004
```

**Çalışıyor mu?** **EVET** — okuryazarlığı %59.2 oynatıyor, gürültünün
**11.83 katı.** Bütün taramanın en güçlü kaldıracı.

**Pratikte** — **eğitim gideri = nüfus × bütçe.** Nüfus arttıkça aynı yüzde
sana daha pahalıya patlar; büyüyen imparatorlukta %60 eğitim yıllar içinde
kendi kendine ağırlaşır. Orta bantlar iyi (%40–60), abanacaksan önce hazineye
bak. Ve **yavaş**: haftada hedefin yalnızca binde 4'ü kadar yaklaşırsın,
yarılanma ~173 hafta (3.3 oyun yılı). Yani eğitim bir yatırımdır, bir düğme
değil — açtığın hafta hiçbir şey olmaz, on yıl sonra teknoloji lideri olursun.
Ters tarafı da doğru: kapattığın hafta da hiçbir şey olmaz, on yıl sonra
geri kalmışsındır. Zaten YZ'nin kesme sırasında eğitim **en son** gider.

## 1.5 Refah · `welfare`

**Formül**

    haftalık gider = (nüfus / 10.000) × bütçe% × 0.76
    memnuniyet terimi = bütçe% × 0.14
    nüfus büyüme çarpanı = 1 + bütçe% × 0.35
    yaşam standardı  += bütçe% × 2.5

**Kod** — `src/game/economy.js:520`, `:2790`, `src/game/provinces.js:804`

```js
welfare: { id: 'welfare', name: 'Welfare', rate: 0.76, ledgerLine: 'welfare' },

socialClass.satisfaction = clamp(
  0.35 + affordability * 0.5 - taxRate * 0.28 + welfare * 0.14
    + lawMoodShift(nation, classId) - joblessBite,
  0.08, 0.95);

const health = 1 + Math.min(100, nation.economy?.social?.welfare ?? 0) / 100 * 0.35;
```

**Çalışıyor mu?** **EVET** — istikrarı %23.8 oynatıyor, gürültünün
**4.32 katı.**

**Pratikte** — refah pahalıdır (0.76 oran, eğitimin iki katından fazla) ve
etkisi anında görünür: memnuniyet → istikrar → parti desteği → meşruiyet. Vergiyi
yükselttiğin hafta refahı da yükselt, halk farkı yutar. Nüfusun da daha hızlı
büyür (%35'e kadar). Sağlık ayrı bir kaydıraç DEĞİL — ölçüldü, tek başına
700 haftada nüfusa %1.4–2.0 katkı yapıyordu, nüfusun kendi gürültüsü ise %39;
kaydıracın bütün menzili gürültünün yirmide biriydi. İki etkisi de refaha
katıldı, oran ikisinin toplamı.

---

# 2. BİLGİ ZİNCİRİ — eğitim nasıl teknolojiye dönüşüyor

Bu zincir oyunun en uzun nedensellik hattı. Dört halka:

    bütçe → okuryazarlık → araştırma puanı → teknoloji

## 2.1 Araştırma puanı

**Formül**

    RP = (okuryazarlık × 4 + orta sınıf payı × 1.5 + katipler + 1)
         × (1 + teknoloji bonusu + basın özgürlüğü)

    katipler = okuryazarlık ≥ %50 ise orta sınıf payı × 2, değilse 0

**Kod** — `src/game/technology.js:358`

```js
export function researchPointsOf(nation) {
  const literacy = clamp(economy.literacy ?? 0, 0, 1);
  const middleShare = clamp((economy.classes?.middle?.population ?? 0) / population, 0, 1);
  const clerks = literacy >= 0.5 ? middleShare * 2 : 0;
  const base = literacy * 4 + middleShare * 1.5 + clerks + 1;
  const press = lawModifiers(nation).researchRate ?? 0;   // anayasa (basın)
  return base * (1 + (economy.techMods?.researchRate ?? 0) + press);
}
```

**Çalışıyor mu?** **EVET** — zincirin ilk halkası (eğitim) 11.83 katıyla
taramanın en güçlüsü, son halkası (basın çarpanı) 4.00 katı.

**Pratikte** — **okuryazarlık araştırmayı doğrudan çarpar: 4 katsayıyla.**
%10 okuryazarlıkta taban 1.4, %90 okuryazarlıkta 4.6 — yani üç katından fazla.
Ama asıl kırılma noktası **%50**: orada "katip" terimi açılır ve orta sınıfın
katkısı bir anda ikiye katlanır. %49 ile %51 arasındaki fark, %10 ile %49
arasındaki farktan büyüktür. Okuryazarlığı %50'nin üstüne çıkarmak bu oyundaki
tek eşikli sıçramadır; hedefin orası olsun.

## 2.2 Teknoloji maliyeti

**Formül**

    maliyet = 120 × (1 + kademe × 0.55) × erken ceza
    erken ceza = 1 + (teknolojinin yılı − bugünkü yıl) × 0.06,   tavan 2.5

**Kod** — `src/game/technology.js:334`

```js
export function techCost(techId, year) {
  const levelScale = 1 + entry.level * 0.55;
  const early = Math.max(0, (entry.tech.year ?? 1836) - year);
  const earlyPenalty = clamp(1 + early * 0.06, 1, 2.5);
  return Math.round(TECH_BASE_COST * levelScale * earlyPenalty);
}
```

**Çalışıyor mu?** **EVET** — ölçüldü ve kalibre edildi: taban maliyet 260'tan
120'ye indirildi çünkü 1500 haftalık A/B'de araştırmayı **iki katına**
çıkarmak tamamlanan teknolojiyi 7'den yalnızca 8'e taşıyordu. Fazla puan
hiçbir şeye dönüşmeden bekliyordu.

**Pratikte** — takvimin önüne geçebilirsin ama bedeli var: 20 yıl erken bir
teknoloji 2.2 kat pahalıdır (tavan 2.5). Ceza silinmedi çünkü silinseydi
1836'da tank araştırılırdı. Kademe cezası daha sert: her kademe maliyeti
%55 büyütür. Yani derin bir klasörü sonuna kadar sürmek yerine, birkaç
klasörün ilk kademelerini almak neredeyse her zaman daha ucuzdur.

## 2.3 Araştırma kuyruğu, akıllı seçici ve YZ'nin okul geleneği

**Ne değişti (2026-09)** — Ulusal Program (sekiz yıllık yön + eğitim tabanı)
kalktı. Yön artık doğrudan seçimdir: teknoloji ağacında tık hemen araştırır
(kilitliyse yolunu kurar), shift+tık kuyruğa ekler, sağ tık çıkarır. Kuyruk
boşalınca sıradaki teknolojiyi `technology.pickNextTech` seçer.

**AKILLI SEÇİCİ.** Eski seçici ekolü kesin öne koyup **en ucuzu** alıyordu:
savaştaki ülke okul, borca batmış ülke tren yolu, sanayisi olmayan ülke
fabrika verimi araştırıyordu. Artık her teknoloji ülkenin ölçülmüş durumuna
göre tartılır ve **puan başına değerle** sıralanır:

    puan = Σ |etki| × ağırlık(etki, ülke) × ekol / etkin maliyet

| Ağırlık | Nereden | Bant |
| --- | --- | --- |
| fabrika verimi / girdi verimi | sanayinin GSYH payı (nabız) | 0.5 → 3.0 |
| RGO çıktısı | tarla/maden payı | 0.5 → 2.0 |
| inşaat gücü | kuyruktaki proje sayısı | 0.6 → 1.6 |
| araştırma hızı | 1936'ya kalan yıl | 0.5 → 1.6 |
| okuryazarlık tavanı | okuryazarlık 0.6'ya uzaklık | 0.6 → 1.5 |
| borç kapasitesi | borç / kredi kapasitesi | 0.3 → 2.5 |
| tedarik · eğitim kadrosu · takviye | savaş > rakip > barış (1 / 0.55 / 0) | 0.35 → 1.6 |
| fabrika kilidi | ürünün bant içindeki kıtlığı; barışta silah hattı ×0.6 | 0.08 → 0.16 |

Ekol (tohumdan gelen kategori eğilimi) **kesin öncelik değil ×1.4 çarpan**:
ülkeye karakterini bırakır ama durumun hükmünü kaldırmaz. Seçim deterministik
(eşitlikte maliyet → yıl → id) ve **YZ ile oyuncu aynı fonksiyonu kullanır**:
Research AUTO açıkken devir, YZ'nin ta kendisidir (bkz. `delegation.js`).

**Research AUTO.** Yeni kampanyada açık başlar; kuyruk her zaman önce gelir.
Kapalıyken kuyruk boşalınca akademi bekler — puan yanmaz, bankada birikir ve
kalıcı bir kart ("The academy is waiting") seçimi ister. Hükûmet bir teknoloji
seçince AUTO şeridi gerekçesini yazar ("Debt has used 52% of the country's
credit").

**Ölçüldü** (4 tohum × 30 yıl, standart dünya, gözlemci; taban `ae80dfc`):

| | 10. yıl | 20. yıl | 30. yıl |
| --- | --- | --- | --- |
| tamamlanan teknoloji (medyan) | 4 → 9 | 7 → 18 | 16 → 25.5 |
| farklı teknoloji kümesi | 11 → 34.5 | 22.5 → 45.5 | 28 → 47 |
| araştırma puanı/hafta (medyan) | 2.71 → 2.86 | 3.08 → 3.31 | 3.45 → 3.67 |
| okuryazarlık medyanı | 0.367 → 0.370 | 0.445 → 0.475 | 0.495 → 0.501 |
| GSYH medyanı | 58 → 52.5 | 64.5 → 68.5 | 71.5 → 89.5 |
| dünya GSYH toplamı | 5686 → 6055 | 6530 → 7059 | 7268 → 7904 |
| borçlu ülke | 27.5 → 24.5 | 21.5 → 20.5 | 21 → 18 |
| fabrika | 897 → 941 | 1069 → 1163 | 1035 → 1112 |
| ayakta kalan ülke | 60.5 → 61.5 | 54.5 → 55.5 | 51 → 52.5 |

Teknoloji sayısı arttı çünkü seçici aynı puanla **daha ucuz ve işe yarar**
kademeleri alıyor (eski seçici tek klasörün merdivenini tırmanıp pahalı
kademelere giriyordu); ayrışma neredeyse ülke başına bir kümeye çıktı. Kategori
payı sanayiye kayar (30. yıl: sanayi %47 → %56, ticaret %16 → %14, kültür
%16 → %11, donanma %6 → %4); **ordu payı rakip kapısı sayesinde yerinde kalır**
(%15 → %15). Rakip kapısı olmadan ölçülmüştü: ordu %15 → %11 ve barıştaki ülke
hiç askerî teknoloji almıyordu.

10. yıl GSYH medyanındaki düşüş (−%9.5) gürültüdür: aynı yılda dünya toplamı
+%6.5 ve ayakta kalan ülke sayısı bir fazladır (küçük ülkeler medyanı aşağı
çeker). Dört tohumun medyanı savaş sayısında ±%40 oynuyor.

**YZ'nin eğitim tabanı** — `economy.js aiEducationFloor`. Program YZ'ye tek
bir şey veriyordu: eğitim tabanı. O gidince ölçüldü (3 tohum, 1846–1906):
eğitimi sıfırda duran YZ payı %26–33'ten %51–63'e çıktı, 1866 medyan
okuryazarlık 0.45'ten 0.29'a indi. Taban artık ülkenin kalıcı okul geleneği
(%25/%40/%55); gelirin %35'ini aşamaz, borç yükseldikçe iner, temerrütteki
devlet muaftır. Sonuç: sıfırdaki YZ payı %17–29, medyan okuryazarlık 1906'da
0.52 (programla 0.52). Oyuncu bağlanmaz; bütçesini devrederse aynı fonksiyon
onun için de çalışır.

---

# 3. HANE — memnuniyet, istikrar, nüfus

## 3.1 Sınıf memnuniyeti

**Formül**

    memnuniyet = 0.35
               + ödenebilirlik × 0.50      (sepetinin ne kadarını alabiliyor)
               − vergi oranı   × 0.28
               + refah bütçesi × 0.14
               + yasa kayması              (aşağıda §6)
               − işsizlik ısırığı          (alt %22, orta %11, üst yok)
    sonuç 0.08 ile 0.95 arasına kırpılır

**Kod** — `src/game/economy.js:2790`

```js
const joblessBite = classId === 'upper' ? 0
  : unemployment * (classId === 'lower' ? UNEMPLOYMENT_MOOD : UNEMPLOYMENT_MOOD * 0.5);
socialClass.satisfaction = clamp(
  0.35 + affordability * 0.5 - taxRate * 0.28 + welfare * 0.14
    + lawMoodShift(nation, classId) - joblessBite,
  0.08, 0.95);
```

**Çalışıyor mu?** **EVET** — memnuniyet taramanın en hassas ölçütü (gürültüsü
yalnızca %5.3) ve 24 mekanikten 13'ü en güçlü sinyalini burada veriyor.

**Pratikte** — bu formül oyunun omurgası: memnuniyet → istikrar → parti
desteği → meşruiyet. Dört girdisi var ve dördü de senin elinde. En büyük terim
**ödenebilirlik (0.50)** — yani halkın sepetini alabilmesi. Fiyatlar fırlarsa
hiçbir refah bütçesi kurtarmaz. **Vergi (-0.28) refahın (+0.14) tam iki
katıdır**: refahı sıfırdan sonuna açman, vergiyi %50 artırmanın yarısını
karşılar. Sanayin çökerse işsizlik ısırır (alt sınıf %22'ye kadar) — ve bu
ısırık sermayedara işlemez, çünkü sermayedar işsiz kalmaz, tesisi zarar edince
kârından kaybeder.

## 3.2 İstikrar

**Formül**

    istikrar = nüfus ağırlıklı memnuniyet
             − işgal payı  × ağırlık
             − savaş yorgunluğu × ağırlık
             − işsizlik    × 0.22
    sonuç 0.03 ile 0.98 arasına kırpılır

**Kod** — `src/game/economy.js:2607`

```js
economy.stability = clamp(base + occupationHit + warHit + unemploymentHit, 0.03, 0.98);
economy.stabilityBreakdown = { base, occupation, war, unemployment, ... };
```

**Çalışıyor mu?** **EVET.** Eskiden tek satırdı (`istikrar = memnuniyet`) ve
beta'da **60 yıl boyunca %44'te dondu** — üç eşzamanlı savaş, işgal ve nüfusun
üçte ikisinin düşman elinde olması hiçbir şey değiştirmiyordu, çünkü işgal,
savaş yorgunluğu ve işsizlik girdi bile değildi.

**Pratikte** — istikrar tek başına bir sayı değil, dört ayrı şeyin toplamı ve
oyun sana dökümünü gösteriyor (`stabilityBreakdown`). Savaşta istikrarın
düşüyorsa nedeni memnuniyet olmayabilir — işgal edilmiş toprak payına bak.
İstikrar taşra sadakatini de besler (`0.45 + istikrar` çarpanı), yani düşük
istikrar fethettiğin toprağın yerleşmesini de yavaşlatır: kısır döngü.

## 3.3 Nüfus büyümesi

**Formül**

    haftalık büyüme = (0.00006 + tarım gelişimi × 0.00003)
                    × (barış ? 1 : 0.55)
                    × (0.45 + istikrar)
                    × (1 + refah% × 0.35)
                    × (0.25 + 0.75 × beslenme)
                    × (1 − işgal payı)
                    − kıtlık × erime

    beslenme < %50 ise KITLIK: nüfus artmaz, erir

**Kod** — `src/game/provinces.js:817`

```js
const nourishment = clamp(nation.economy?.needsMet ?? 1, 0, 1);
const famine = nourishment < FAMINE_THRESHOLD
  ? (FAMINE_THRESHOLD - nourishment) / FAMINE_THRESHOLD : 0;
const weeklyGrowth = ((0.00006 + econ.agriculture * 0.00003)
  * (peace ? 1 : 0.55) * (0.45 + stability) * health
  * (0.25 + 0.75 * nourishment)) * (1 - occupied)
  - famine * FAMINE_DECLINE;
```

**Çalışıyor mu?** **EVET** — beslenme bağı eklenmeden önce ölçülmüştü: dünya
tahıl üretimi **tamamen kesildiğinde bile** 120 haftalık nüfus farkı %0.0'dı.
Artık aç nüfus önce büyümeyi durdurur, uzayan açlık nüfusu eritir.

**Pratikte** — en iyi koşulda yılda ~%0.9, yüzyılda ~2.3 kat (gerçek
1836–1936 oranı ~1.75). Yani nüfus **yavaş** ve beş çarpanın hepsi birden iyi
olmadan hızlanmaz. Savaş büyümeyi neredeyse yarıya indirir. Beslenme %50'nin
altına inerse büyüme durmaz — **geriye döner**. Fetih nüfus kazandırmanın en
hızlı yolu, ama savaş sürdüğü sürece kendi nüfusun da durur.

## 3.4 İşsizlik

**Formül**

    işsizlik = (min(işçi, tezgâh) − istihdam) / tezgâh

**Kod** — `src/game/economy.js:2598`

```js
function unemploymentOf(nation) {
  const jobs = industrialJobs(nation);
  const workers = economy.classes?.lower?.population ?? 0;
  const employed = (economy.factories ?? []).reduce((s, f) => s + (f.employees ?? 0), 0);
  const seeking = Math.max(0, Math.min(workers, jobs) - employed);
  return { rate: jobs > 0 ? clamp(seeking / jobs, 0, 1) : 0, seeking };
}
```

**Çalışıyor mu?** **EVET** — hem istikrar hem hane memnuniyeti tek kaynaktan
okur. İki yerde iki formül olsaydı ekrandaki "işsizlik -6" ile hanenin
hissettiği işsizlik birbirini tutmazdı.

**Pratikte** — işsizlik "tezgâh var, işçi yok" değil "işçi var, tezgâh boş"
demek. Fabrikan girdi bulamayıp üretimi kısarsa işçi çıkarır, işsizlik
memnuniyeti ısırır, memnuniyet istikrarı düşürür. Yani bir tedarik krizi üç
hafta sonra siyasi krize dönüşür.

**Nüfus ekranındaki "Employment" başka bir sayıdır.** Yukarıdaki oran fabrika
tezgâhıdır ve istikrara girer. Nüfus ekranı ise alt sınıfın işte olup
olmadığını sayar: çiftçi ve amele RGO kadrosu kadar, fabrika işçisi tesis
kadrosu kadar, asker ordu kadar çalışır. Oyun Vic2'deki gibi **herkes işte**
başlar — kadro kuruluşta kümenin alt sınıf iş gücünün 1.05 katı açılır
(§4.7). Ölçüldü (3 tohum): 1. yıl istihdam medyanı %92.9 → %99.1, en kötü
onda bir %84.9 → %97.2. Silah altındaki adam kendi mesleğindedir
(`soldiers`); çiftçi sayıldığı sürece ordunun kendisi "işsiz" görünüyordu.

---

# 4. SANAYİ VE TİCARET

## 4.1 Fabrika ücreti ve kârı

**Formül**

    katma değer = hasılat − girdi maliyeti
    ücret       = katma değer × min(0.85, 0.55 × reform ücret çarpanı)
    kâr         = hasılat − girdi maliyeti − ücret
    ücretin dağılımı: %80 alt sınıf, %20 orta sınıf

**Kod** — `src/game/economy.js:2537`

```js
const valueAdded = Math.max(0, revenue - inputCost);
const wages = valueAdded * Math.min(0.85, LABOR_SHARE * reformMods.wageCost);
factory.wages = wages;
factory.profit = revenue - inputCost - wages;
```

**Çalışıyor mu?** **EVET** — işçi yasaları bu kanaldan geçer ve doğrudan
ölçüldü: asgari ücret yasası tabandan tavana işçi gelirini **+%8.8**,
sendika serbestliği **+%5.2** artırıyor.

**Pratikte** — işçi, girdi kıtlığında üretim düşse de fabrikada kalır ve
ücretini alır. Reformun faturası burada somutlaşır: **kâr daralır, üretim
değil.** Bu bilinçli — üretimi kısan bir reform işçiyi de vururdu, yani
"işçiyi koruyan yasa işçiyi vurur" tuzağı olurdu. Bütün işçi yasalarını
açarsan emek payı 0.55'ten 0.71'e çıkar: sanayin hâlâ kâr eder ama sermaye
birikimi yavaşlar, yani daha az yeni fabrika.

## 4.2 Ticaret — ithalat ve ihracat

**Formül**

    yurtiçi karşılama = min(üretim, talep)
    açık              = talep − yurtiçi
    teklif            = açık × ithalat iştahı
    fazla             = (üretim − yurtiçi) × ihracat erişimi
    sınır ötesi ticaret = min(toplam fazla, toplam teklif)

**Kod** — `src/game/economy.js:3444`

```js
const domestic = Math.min(marketProduction, flow.demand);
const deficit = Math.max(0, flow.demand - domestic);
const appetite = 1 / Math.max(0.05, 1 + (nation.economy.tariff / 100) * IMPORT_ELASTICITY);
const access = 1 / (1 + Math.max(0, nation.economy.tariff / 100) * EXPORT_RETALIATION);
```

**Çalışıyor mu?** **EVET** — gümrük bu bağ yokken **ölü bir kaldıraçtı**:
ticaret saf fiziksel eşleşmeydi ve %0 ile %50 gümrük arasında ithalat MİKTARI
yalnızca %0.9 oynuyordu. Şimdi korumacılık gerçekten koruyor, bedeli de gerçek.

**Pratikte** — dünya ticareti sıfır toplamlı: kimse mal yaratmaz, satılamayan
fazla satılamayan fazlanın yanına düşer. Yüksek gümrük iki ucundan da keser —
senin ithalat iştahın düşer (karşılanmayan talep büyür, halkın sepeti eksik
kalır) ve senin ihracat erişimin kısılır (misilleme). Serbest ticaret bunun
tersi: ucuz girdi, geniş pazar, sıfır gümrük geliri.

## 4.3 Arz tepkisi — tabandaki malın tarlası küçülür

**Formül**

    fiyat bandı  = taban fiyat × [0.5, 1.5]                     ← priceBand.js
    yer          = bant içindeki konum: tabanda −1, taban fiyatta 0, tavanda +1
    hedef ölçek  = √(1 + min(0, yer) × (1 − 0.5²))  ∈ [0.5, 1]  ← MAL BAŞINA
    ölçek       += (hedef − ölçek) × 0.004            ← her hafta (yarıya inmek ~4 yıl)
    RGO kadrosu ×= satırların hex ağırlıklı ölçeği ; malın çıktısı ×= kendi ölçeği
    yukarı yön ayrı: gelişme × rgoPriceDrive — tabanda 0.05, taban fiyatta 1, tavanda 2.5

**Kod** — `src/game/priceBand.js`, `src/game/provinces.js` `updateDemandScale`,
`rgoPriceDrive`, `rgoJobsOf`, `provinceOutput`

**Fiyat bandı ±%50 (2026-09-17).** Bant 0.12–8 idi ve malların yarısı iki
uçtan birine çakılı yaşıyordu (bkz. aşağıdaki ölçümler). Kerem'in isteği
"dünya çökmesin": bant taban fiyatın 0.5–1.5 katına daraldı. Arz tepkisi ham
oranı değil bandın içindeki YERİ okur; oranı okusaydı ±%50 bantta tam frene
(eski eşik 0.25) ve tam gaza (2.5) hiç varılamazdı ve tabana çakılı mal yarım
hızla gelişmeye devam ederdi — yukarıda ölçülen tırmanışın aynısı.

Ölçüldü — 9 tohum, eşleştirilmiş (aynı tohumda bant − eski bant), standart
dünya, gözlemci, taban f526c93; `t` eşleştirilmiş farkın t değeri:

| | eski bant | fark | t |
|---|---|---|---|
| fiyatın tabandan ortalama sapması, \|ln oran\| (20. yıl) | 0.845 | **−0.417** | −34.1 |
| taban fiyatın yarısı ve altında mal (10. yıl) | 19.3 | **−7.4** | −10.5 |
| istikrar medyanı (10. yıl) | 0.553 | +0.037 | 3.0 |
| fabrika sayısı (5. yıl) | 1034 | **−260** | −31.6 |
| fabrika doluluğu (10. yıl) | %48.3 | **+9.1 puan** | 10.8 |
| alt sınıf sepeti (5. yıl) | 0.633 | −0.029 | −5.0 |
| reel GSYH (5. yıl) | 7550 | −516 | −7.6 |
| reel GSYH (20. yıl) | 8615 | −23 | −0.1 |
| dünya nüfusu (20. yıl) | 280M | −5.6M | −3.0 |
| toplam borç (20. yıl) | 25779 | +9461 | 2.6 |
| yaşayan ülke (20. yıl) | 51.8 | −2.6 | −1.4 |

Okuma: fiyatlar sakinleşti ve ilk on yılda istikrar biraz yükseldi. Bedeli
erken sanayi yatırımında: 1836 dünyası fabrikasız açıldığı için mamul mallar
eski bantta 8 kata fırlıyor ve ilk beş yılda bir kuruluş dalgası
tetikliyordu (fiyat endeksi 1. yılda 3.05, yeni bantta 1.13; 3 tohum). Dalga
kalkınca 5. yılda %25 daha az fabrika var, ama kurulanlar daha dolu ve daha
kârlı; 3 tohumluk koşuda 10. yıldan sonra fabrikada çalışan kadro eşit ya da
fazla (seviye × doluluk: 10. yıl 604 → 627, 30. yıl 647 → 699). 20. yılda
nüfus −%2 ve borç +%37 ayrıştırılmadı; ilk yılların eksik sepeti nüfus için
olası sebep. Ülke kaybı anlamlı değil.

**AÇIK** — erken yatırım artık fiyat sıçramasından değil kıtlıktan
okunmalı: `investmentOptions` yalnız marja bakıyor ve tavan 1.5'te marj
kıtlığı az gösteriyor. Aday ölçülmedi.

**Çalışıyor mu?** **EVET, yavaş.** 520 haftalık barış koşusu (tohum BAND-1):
mal-haftalarının tabanda geçen payı %37.7 → %31.0, toplam bant doygunluğu
%45.6 → %40.4; 520. haftada tabanda çakılı mal 20 → 13. Kalan taban malları
(fruit, silk, rubber, oil, lumber) 1836'da alıcısı olmayan mallar — ölçek
0.5'in altına inmediği için orada kalırlar; bu tasarım seçimi, tarlanın
yok olmasını değil yarıya inmesini istiyor.

**Fiyat çapası.** Fiyat kuralı bir integratördü: `fiyat ×= 1 + dengesizlik ×
0.09` ve taban fiyata döndüren hiçbir kuvvet yoktu. Dünya arzı talebi taban
fiyatla 1.9 katladığı için küçük ama sürekli bir fazla, yirmi yılda fiyat
endeksini 1.86'dan 0.47'ye indiriyordu; gelir nominal olduğu için sınıf geliri
on kat eriyordu. Artık fiyat taban fiyatına zayıfça çekilir
(`PRICE_ANCHOR` 0.018, dengesizlik sinyalinin beşte biri). Ölçüldü
(`audit:price-stability`, 30 yıl, 2 tohum): endeks 0.49–0.51'de **oturuyor**,
son çeyrekte kayma −0.08 ve −0.01, gelir oranı 0.86 ve 1.03.

**Yatırım fiyata bağlı.** `rgoPriceDrive` tabanı 0.5'ti: fiyatı çökmüş malın
tarlası yarım hızla gelişmeye devam ediyor, dünya arz/talep oranı 1.50'den
2.03'e tırmanıyordu. Artık sürücü oranın kendisidir (taban fiyatta 1.0,
yarısında 0.5, bantta çakılı malda durur). RGO verimini global kısmak
(0.8/0.7/0.6) denendi ve İŞE YARAMADI: oran yine tırmandı, çünkü sorun
başlangıç seviyesi değil birikimdi.

**Dengenin yeri kapalı formda.** Denge koşulu `dengesizlik × PRICE_SPEED +
çapa = 0`. `r = arz/talep`, `x = fiyat/taban` konursa:

    x = 1 − K·(r−1)/(r+1)   ,   K = PRICE_SPEED / PRICE_ANCHOR = 0.09/0.018 = 5

Ölçüldü (17 mal, gözlenen fiyata karşı RMS hata 0.06). Beşlik amplifikasyon
şu demek: **%22'lik kalıcı fazla fiyatı yarıya indirir, %50'lik fazla malı
banda çiviler.** "Denge neden taban fiyatın yarısında" sorusunun cevabı bu
tek satırdır — tesadüf değil, iki sabitin oranı.

**KAPANDI — 2026-09-04.** Bu bölüm uzun süre "açık kalan" diye duruyordu:
dünya kapasitesi tüketimini aşıyor, denge taban fiyatın yarısında kuruluyor
ve yüzyılda büyüme eğrisi yok. Dört hipotez elendikten sonra doğru çift
bulundu ve **birlikte** kalibre edildi:

    INCOME_POOL_SHARE  0.35 → 0.70      (pazarlanan pay)
    PRICE_ANCHOR       0.018 → 0.060    (K = PRICE_SPEED/PRICE_ANCHOR: 5 → 1.5)

| hedef (`audit:growth`, 100 yıl × 2 tohum) | önce | sonra |
|---|---|---|
| H1 reel kişi başı tüketim | 0.94 / 1.01 | **1.03 / 1.05** ✓ |
| H2 orta+üst sınıf payı | %5.85 / %3.84 | **%13.83 / %11.63** ✓ |
| H3 tesis büyümesi | 1.12× / 1.03× | 1.19× / 1.16× ✗ |

`audit:price-stability` artık **hiç bulgu vermiyor** — dört testin dördü de
geçiyor. Çakılı mal 16'dan 14'e indi.

Dünya nüfusu da hızlandı (aynı tohum, gözlemci, barışçıl):

| yıl | önce | sonra | |
|---|---|---|---|
| 1866 | 106.62M | 108.32M | +%1.6 |
| 1896 | 117.10M | 130.36M | +%11.3 |
| 1936 | 147.76M | 180.56M | **+%22.2** |

Yüzyıllık büyüme 1.51× → 1.84×. Beklenen kanal: sepet karşılanması yükselince
`foodMet` yükseliyor, o da `provinces.js` içindeki `foodFactor` üzerinden
büyüme çarpanını açıyor.

Gerekçeler ayar değil: çapa, yukarıdaki kapalı formun tek koludur ve K'yı
5'ten 1.5'e indirir (kıtlık ölmez — dengesizlik sinyali +0.09'a çıkarken çapa
tavanda en fazla −0.053 çeker). Havuz payı ise muhasebedir: pazarlanan pay +
kendi tükettiği pay (`SUBSISTENCE_SHARE.lower` 0.30) aynı bölüşümün iki
yarısıdır ve toplamları 0.65 tutuyordu; %35 ne pazara ne haneye yazılıyordu.
0.70 + 0.30 = 1.00 ile bölüşüm kapanır.

**DENETİM KUSURU — `audit:market` kıyafet şoku testi kırılgan.** Değişiklikten
sonra MEDIUM veriyor ama sebebi davranış değil, testin kendisi:

| | önce | sonra |
|---|---|---|
| izlenen ülke | #0 | **#28** |
| taban büyüme (120 hafta) | %14.5 | **%0.7** |
| kıtlık kolunda büyüme | %0.7 | %1.0 |
| silinen pay | %95 (geçti) | −%51.3 (kaldı) |

İki sorun var. Birincisi `WATCHED` ülkeyi `pickNation` seçiyor (en çok
fabrikası olan) ve bu sıralama kod sürümüyle kayıyor — iki koşu **farklı
ülkelere** bakıyor, karşılaştırma elma-armut. İkincisi izlenen ülkede nüfus
iki kolda da neredeyse aynı (4.768.453 / 4.784.775, fark %0.3): test sıfıra
yakın iki büyümeyi bölüp anlamsız bir oran üretiyor. `baseGrowth > 0` kapısı
bunu elemiyor.

Test, oranı hesaplamadan önce anlamlı bir taban büyüme (ör. %5) istemeli ve
izlenen ülkeyi kod sürümünden bağımsız sabitlemeli. Şoku ölçmek isterken
`pickNation`'ın kaymasını ölçüyor.

**H3 DE KAPANDI — üçüncü sabitle.** Fabrika büyümesinin kilidi bu iki sabitte
değildi: yeni tesisin bedeli kurulu sayıyla tırmanırken (`factoryCost`)
kapitalistin bütçesi fiyatla çöküyordu. Ölçüldü: makas 1838–46 arasında
kapanıyor ve bir daha açılmıyordu — 1838'de 27 ülkenin 24'ü fabrika
açabilirken 1846'da **sıfır**.

    factoryCost egimi  0.05 → 0.02      (20 fabrikada carpan 2.0x → 1.4x)

Tek sabit, taramada bütün ölçütlerde iyileşme (40 yıl, gözlemci, PRICE-A):
tesis 463 → 581 · H1 1.498 → 1.569 · H2 %12.29 → %13.50 · alt sınıf sepeti
%60.7 → %66.7 · kârlı tesis %65 → %76 · arz/talep 1.93 (değişmedi).
0.01 daha çok tesis verir (624) ama arz/talep'i 2.03'e iter — fazla ucuz
fabrika, kapatmaya çalıştığımız makası yeniden açar.

**Üç hedefin üçü de yeşil** (`audit:growth`, 100 yıl × 2 tohum):

| | başlangıç | son |
|---|---|---|
| H1 reel kişi başı tüketim | 0.94 / 1.01 | **1.06 / 1.16** ✓ |
| H2 orta+üst sınıf payı | %5.85 / %3.84 | **%12.43 / %16.74** ✓ |
| H3 tesis büyümesi | 1.12× / 1.03× | **1.46× / 1.27×** ✓ |

Denetim artık bulgu vermiyor. Elenen hipotezler (talep tavanı, income-pool'un
tek başına, RGO veriminin global kısılması, işgücü tavanı, sınıf ağırlıkları,
bordro payı) ve neden elendikleri yukarıda; kaydın amacı aynı yolun ikinci kez
denenmemesidir.

Talep tarafında bir tavan var: `bought = quantity × afford` ve `afford ≤ 1`,
yani talep **sabit sepetin üstüne çıkamaz**. Victoria 3'te bu okun karşılığı
vardır — gelir → yaşam standardı → ihtiyaç → talep; bizde yok.

**Ama bu tavan kök sebep DEĞİL — ölçüldü ve elendi.** Refah basamağı
denendi: sınıfa bir `prosperity` stoğu, geliri sepetini rahatça karşılayan
hane zamanla daha büyük bir sepet ister (yalnız isteğe bağlı kademeler;
yaşam kademesi sabit). Tesisatın kendisi inert olduğu kanıtlandı (tavan 1
iken 400 hafta, 1117 satırlık durum birebir aynı). Kaldıraç açıkken
`audit:growth`, 100 yıl × 2 tohum:

| | referans | refah açık |
|---|---|---|
| H1 reel tüketim/kişi | 0.94 / 1.01 | **0.90 / 0.99** |
| H2 orta+üst payı | %5.85 / %3.84 | **%4.20 / %2.71** |
| H3 tesis büyümesi | 1.12× / 1.03× | **1.04× / 1.03×** |

Üçü de kötüleşti; H2 iki tohumda da ≈%29, yani gürültü değil. Sebep
tümdengelimle kesin: `hedef = clamp(covered/MARGIN, 1, CAP)` ve
`covered = needsBudget/outOfPocket`. Bir sınıfta `affordShare < 1` ise
`covered < 1 ≤ MARGIN`, yani hedef **her zaman 1'e kırpılır**. Sepet
karşılanması %40–49 olduğuna göre **alt sınıfın refahı hiç kıpırdamaz.**
Kaldıraç yalnız sepetini zaten tam karşılayabilen orta ve üst sınıfa çalışır;
onların sepeti büyüyünce `runPromotion`'ın istediği artık küçülür, eşiği ise
büyür — daha az terfi, daha çok düşüş.

**Bulgu:** nüfusun %94'ü için bağlayıcı kısıt talep tavanı değil **gelirdir**.
Alt sınıf zaten sahip olduğundan fazlasını istiyor, alamıyor. "İnsanlar daha
çok istesin" demek, yalnızca zaten yeterince alabilene daha çok istetiyor ve
sonuç regresif oluyor. Sıradaki aday bu yüzden talep değil **gelir kanalı**
olmalı (bordro payı, income-pool, ya da fiyat seviyesinin kendisi).

Bu bir kalibrasyon işidir (RGO verimi + kişi başı sepet + sanayinin emişi
birlikte) ve kendi pass'ini ister. `audit:price-stability` TEST 4 bulguyu
sayıyla tutar.

**Pratikte** — dünya fiyatı tabana yapışan hammaddenin province'i yıllar
içinde kadrosunu ve çıktısını yarıya indirir, açığa çıkan nüfus göçle
fabrikaya ya da başka tarlaya akar. Vic2'nin "kârsız RGO'dan pop kaçar"
davranışı. Fiyat toparlanınca ölçek de 1'e döner. Oyuncunun kolu yok: bu
bir piyasa refleksi, karar değil.

---

## 4.4 Sanayi doluluğu — fabrikanın dolması ve ölü tesisin tasfiyesi

**Formül**

    aylık işgücü akışı = alt sınıf × 0.0012 × okul × isteklilik
    okul               = 1 + okuryazarlık² × 2.5 + eğitim bütçesi × 0.25
    kuruluş kadrosu    = tezgâh × 0.15
    tasfiye            = beklenen marj ≤ 0 VE doluluk ≤ %5, 240 ay üst üste

**Kod** — `src/game/economy.js` (`runFactoryEmployment`, `retireDeadFactories`)

```js
const schooling = 1 + clamp(economy.literacy ?? 0, 0, 1) ** 2 * 2.5
  + socialLevel(nation, 'education') * 0.25;

function retireDeadFactories(game, nation) {
  const bos = (factory.employees ?? 0) <= jobs * DEAD_FACTORY_FILL;
  if (!bos || expectedMargin(game.world, nation, factory) > 0) {
    factory.deadMonths = 0; continue;
  }
  factory.deadMonths = (factory.deadMonths ?? 0) + 1;
  if (factory.deadMonths < DEAD_FACTORY_MONTHS || closed) continue;
  if (closeFactory(game, nation, factory.id)) closed++;
}
```

**Ne bozuktu.** İki ayrı kusur, aynı belirtiyi veriyordu — sanayi doluluğu
yüzyıl boyunca yükselmiyordu.

1. **Fabrika dolu doğuyordu.** `ensureInitialMilitaryIndustry` kuruluş
   tesislerini **yarı kadroyla** açıyordu; 1836'da dünya doluluğu **%61**
   oluyor, sonraki yüzyıl yalnız seyreliyordu (1906'da %43). Vic2'de 1836
   sanayisi cılızdır ve doluluk okuryazarlıkla sonradan gelir.
2. **Ölü tesis defterden hiç düşmüyordu.** `closeFactory` yalnızca
   **oyuncunun ekranından** çağrılıyordu — YZ'nin fabrika kapatma yolu yoktu.
   Ölçüldü (2 tohum, 1936): dünyadaki **550 tesisin 350'si** beklenen marjı
   ≤ 0 olduğu için işe alıma kapalı, ortalama **%32 dolu**, ve kapasitenin
   **%57'sini** tutuyordu. Doluluğun paydasında hiç dolmayacak tezgâh
   birikiyordu.

Elenen açıklamalar — hiçbiri değildi, ölçüldü:

| hipotez | ölçüm | sonuç |
|---|---|---|
| işgücü tavanı bağlıyor | kadro/tavan %23–34, tavan/kapasite %207 | işçi bol, tavan boşta |
| genişleme kapısı kapanmıyor | 1886'dan sonra kapasite yatay | kapı zaten kapalı |
| işe alım akışı yavaş | havuz aylık ~480 bin, boş tezgâh 8.7 mn | akış yeterli |
| **marjı ≤ 0 tesis işe alıma kapalı** | kapasitenin %57'si donmuş | **sebep bu** |

**Çalışıyor mu?** **EVET** — `audit:growth`, 100 yıl × 2 tohum:

| | önce | sonra |
|---|---|---|
| 1836 doluluk | %61.0 / %59.3 | **%14.6 / %14.1** |
| 1936 doluluk | %48.6 / %49.0 | **%71.8 / %73.6** |
| H4 doluluk eğimi (1846→1936) | 0.89× / 0.94× | **1.54× / 1.58×** ✓ |
| H1 reel tüketim/kişi | 1.19 / 1.14 | **1.67 / 1.73** ✓ |
| H2 orta+üst payı | %12.99 / %13.25 | **%12.52 / %12.44** ✓ |

Doluluk eğrisi artık gerçekten bir S: PRICE-A %33 → %47 → %47 → %57 → %59 →
%58 → %61 → %64 → %65 → %70 → %72. İlk kırk yıl yatay, sonra ivmeleniyor.

**Ama rapor kendi kendini kandırmasın diye pay ve payda ayrı basılır.**
Doluluk bir orandır ve iki yolla yükselir: kadro artar ya da ölü kapasite
düşer. Ölçüm: **kadro 1.60× / 1.59×, kapasite 1.04× / 1.01×.** Yani sanayi
istihdamı gerçekten büyüyor, ama doluluk artışının önemli kısmı kapasitenin
yatay tutulmasından geliyor. Bu saklanmıyor; `audit:growth` her koşuda
ikisini de yazar.

**AÇIK BULGU — H3.** Fabrika sayısı 1846→1936 arasında **0.72× / 0.59×**,
kapasite **1.04× / 1.01×** ile yatay. Yani tasfiye bir açıklama ama tek
açıklama değil: **sanayi tabanı da büyümüyor.** Sebep ölçüldü ve §4.3'teki
fiyat sorununun aynısı — cari fiyatlarla dünyanın yarısı girdi maliyetini
karşılayamıyor, o sektörlere ne işçi gidiyor ne yeni tesis kuruluyor. Barajı
düşürmedim; bulgu `audit:growth` içinde sayıyla duruyor ve kendi pass'ini
bekliyor.

**Pratikte** — 1836'da beş cılız fabrikayla başlarsın, üretim azdır. Okul
yasası ve okuryazarlık yükseldikçe fabrikaya işçi akışı **kare** hızlanır:
ilk yarım yüzyıl doluluk yarıyı zor bulur, sonra hızla tırmanır. Yanlış
sektöre kurduğun ve yirmi yıl boş kalan fabrika kendiliğinden kapanır —
para geri gelmez, kadro serbest kalır. Kapatma kararının oyuncudaki karşılığı
sanayi ekranındaki "close" düğmesidir; YZ artık aynı kolu kullanıyor.

---

## 4.5 Teknoloji tek taraflı çarpıyordu — arz/talep makasının kaynağı

**Formül**

    laborThroughput = kadro / tezgâh
    throughput      = laborThroughput × kıtlık × reform × (1 + teknoloji)

    pazara yazılan ARZ    = çıktı  × throughput
    maliyete yazılan girdi = girdi × throughput
    pazara yazılan TALEP   = girdi × laborThroughput      ← BURASI

**Kod** — `src/game/economy.js`, `runFactories`

**Ne bozuktu.** Talep ile tüketim arasındaki tek fark **kıtlık** olmalıydı;
yorumun söylediği niyet buydu ("fiyat karşılanamayan talebi de görür, maliyet
yalnız gerçekten kullanılanı"). Ama `laborThroughput` kıtlıkla birlikte
**reform ve teknoloji** çarpanlarını da düşürüyordu. Sonuç: fabrika teknoloji
kadar çok girdi **tüketiyor ve ödüyor**, ama pazardan o kadar **istemiyor**.

Teknolojinin iki ucu ölçüldü (100 yıl, gözlemci, ülke ortalaması):

| yıl | çıktı çarpanı | girdi çarpanı | bileşik |
|---|---|---|---|
| 1836 | 1.00 | 1.00 | 1.00 |
| 1886 | 1.67 | 0.74 | 2.26 |
| 1936 | **2.16** | **0.535** | **4.03** |

RGO ise aynı yüzyılda yalnızca 1.35× alıyor, hane talebinin ise **hiç teknoloji
kanalı yok**. Yani bir yüzyıllık araştırma, kimsenin ememeyeceği kadar mal
üretiyordu.

Arz ve talep KAYNAĞINA göre ayrıştırıldı (yıllık, taban fiyatla, bin birim):

| yıl | RGO arzı | fabrika arzı | hane | fabrika girdisi | gübre | ordu | arz/talep |
|---|---|---|---|---|---|---|---|
| 1837 | 129.7 | 26.7 | 65.0 | 15.4 | 15.8 | 8.7 | 1.47 |
| 1886 | 160.1 | 258.2 | 78.5 | 64.6 | 23.4 | 6.5 | 2.42 |
| 1936 | 200.7 | **496.2** | 126.0 | **75.5** | 30.2 | 4.7 | **2.95** |

Fabrika arzı 18.6× büyürken fabrika girdi talebi 1866'dan sonra ~75'te yatay
kalıyor. Katalog masum: 29 tesis türünün çıktı/girdi oranı 1.0–2.11, ortalama
1.33 (Vic2 ölçeğinde). Fark tamamen bu satırdan geliyordu.

**Düzeltme.** Talep de reform ve teknoloji çarpanını görür; kıtlığı görmez.

```js
const wantedThroughput = laborThroughput * reformMods.throughput
  * (1 + (techMods?.factoryThroughput ?? 0));
const requested = amount * wantedThroughput;   // önce: amount * laborThroughput
```

**Çalışıyor mu?** **EVET** — `audit:growth`, 100 yıl × 2 tohum:

| | önce | sonra |
|---|---|---|
| 1936 arz/talep | 2.95 | **2.05** |
| fabrika girdi talebi | 75.5 | **190.0** |
| H1 reel tüketim/kişi | 1.67 / 1.73 | **2.66 / 2.18** ✓ |
| H2 orta+üst payı | %12.5 / %12.4 | **%16.5 / %12.6** ✓ |
| H3 tesis büyümesi | 0.72 / 0.59 | **1.10 / 0.82** |
| H4 doluluk eğimi | 1.54 | **1.32** |
| sanayi kapasitesi | 1.04× (yatay) | **1.44× / 1.02×** |

Fazlanın **%46'sı** kapandı ve eğri 1906'dan sonra düzleşiyor
(2.01 → 2.02 → 2.03 → 2.05), tırmanmıyor. `audit:price-stability` bulgusuz.

**H3 İLE H4 BİRBİRİYLE KAVGA EDİYOR — bu bir ölçü kusurudur, oyunun değil.**
Doluluk = kadro / kapasite. H3 kapasitenin **büyümesini** ister, H4 aynı kesrin
**küçük kalmasını**. Aynı kesrin payını ve paydasını ayrı ayrı yeşile boyamak
tanım gereği mümkün değil: bu düzeltme kapasiteyi ilk kez gerçekten büyüttüğü
için (1.04× → 1.44×) H3 iyileşti, H4 kötüleşti. **Hiçbir barajı düşürmedim**;
ikisi de açık bulgu olarak `audit:growth` içinde sayıyla duruyor. Bir sonraki
tur bu iki hedefi TEK bir ölçüte indirmeli — muhtemelen "sanayi istihdamı kişi
başına büyüyor mu" — yoksa turlar birbirini kovalar.

Şunu da not düşmek gerekir: oyuncunun istediği ŞEKİL zaten var. Doluluk yüzyıl
boyunca %47'den %63'e tırmanıyor; 1.50× barajı bu depoya konmuş bir sayıdır,
oyunun bir gereği değil.

**Pratikte** — teknoloji artık hem daha çok üretir hem daha çok hammadde ister.
Çelik fabrikası açmak demir talebini gerçekten yükseltir, demir fiyatı yükselir,
maden kârlı olur. Zincirin alt katmanı üst katmanın büyümesini hisseder — daha
önce hissetmiyordu.

---

## 4.6 Sınıf hareketliliği — orta sınıf neden küçülüyordu

**Formül**

    kohort = max(10.000, kaynak sınıf × 0.0025 × (0.25 + okuryazarlık × 3.5))
    düşüş  = max(10.000, sınıf × 0.0025)

**Kod** — `src/game/economy.js`, `runPromotion` ve `runPopulationMobility`

**Ne bozuktu.** Terfi ve düşüş **sabit bir sayı** taşıyordu (`POPULATION_COHORT`,
10.000 kişi). Nüfus yüzyılda iki katına çıkarken akış sabit kalınca oran
sürekli küçülüyordu: orta+üst payı 1836'da %22, 1936'da %12.5.

Vic2'de terfi akışı sınıf büyüklüğüne orantılıdır ve okuryazarlıkla hızlanır —
katip ve memur sanayiyle birlikte gelir. İki çarpan da eklendi.

**Çalışıyor mu?** **EVET** — `audit:growth`, 100 yıl × 2 tohum:

| | önce | sonra |
|---|---|---|
| H2 orta+üst payı | %16.5 / %12.6 | **%20.05 / %22.27** |
| sepet karşılanması | ~%56 | ~%66 |

Eğri artık **geç yüzyılda hızlanıyor** — 1896 %12.3 → 1906 %14.0 → 1916 %17.5 →
1926 %19.5 → 1936 %20.1. Sanayileşme ve okuryazarlık birikince orta sınıf
kalkıyor; tam Victoria'nın şekli.

### ELENEN: ulusal odak (Vic2 national focus)

Oyuncuya bir kaldıraç vermek için yazıldı, **ölçüldü ve GERİ ALINDI.** Kayıt
burada duruyor ki aynı yol ikinci kez denenmesin.

Tasarım: yıl/okuryazarlıkla açılan 1–4 odak puanı, her biri bir sınıf kanalına
(`clerks` / `capitalists`) konur. Dört ayrı YZ politikası ve **iki ayrı etki
kanalı** denendi. Odaksız taban: **%20.05 / %22.27**.

| deneme | sonuç |
|---|---|
| bütün puanlar katibe, kohortu çarpar | %19.69 / %13.25 |
| + "orta sınıf sepetini karşılıyorsa" kapısı | %21.12 / %11.98 |
| eşik kanalı (istenen artığı küçültür) | %17.71 / %26.21 |
| + "orta sınıf GERÇEK artık bırakıyorsa" kapısı | %17.46 / %12.54 |

Dördünde de en kötü tohum tabanın altına düştü. Sebep ayrımın başladığı yıldan
okunuyor: odaksız kolda geç yüzyılda bir **kalkış** var (PRICE-B, 1906 %15.0 →
1936 %22.3); odaklı kolların hiçbirinde o kalkış olmuyor. Terfiyi öne çekmek,
kalkış için birikmesi gereken refahı erkenden harcıyor — hane orta sınıfın 2,2
kat büyük sepetini karşılayamayıp **geri düşüyor**, ve alt sınıftan çekilen
insan sanayinin işçi havuzunu (`LOWER_WORKFORCE_SHARE`) daraltıyor.

**Bulgu:** orta sınıfı sınırlayan şey terfi hızı değil **refahtır**. Bir orta
sınıf kanunla var edilemiyor; önce onu taşıyacak ekonomi gerekiyor.

### Oyuncunun kaldıracı ZATEN VAR

Yeni mekanik gerekmiyordu (CLAUDE.md: "yenisini eklemeyi son çare say").
Eğitim ve refah kaydırakları ölçüldü — 100 yıl, gözlemci, her tur dayatılarak:

| eğitim + refah | okuryazarlık | orta+üst |
|---|---|---|
| hepsi 0 | %40 | %14.5 |
| **YZ'nin kendi seçimi** | %68 | **%20.0** |
| hepsi 100 | %92 | **%9.3** |

Menzil **10.7 puan** — nüfus gürültüsünün (%39.1) altında değil, gerçek bir
kaldıraç. Ve **optimumu ortada**: sonuna kadar açmak okuryazarlığı %92'ye
çıkarır ama hazineyi batırır, ekonomi çöker, refah kalmaz ve orta sınıf
%9.3'e iner. "Orta sınıf runu" bu kaydırakların dengesini bulmakla oynanır.

**Pratikte** — okulunu açarsın, okuryazarlık yükselir, sanayi işçi bulur,
ücretler artar, hane geçiminin üstüne artık bırakır ve yüzyılın sonunda
katipler gelir. Kestirme yok: parayı önden basıp sınıf satın alamıyorsun.

## 4.7 Hex kaynakları — her karenin kendi malı, herkes işte

**Formül**

    uygunluk(kare, mal) = arazi tablosu × (sıcak mahsulde iklim) × damar gürültüsü × (0.92…1.08)
    kota(mal)           = dünya hex payı × kare sayısı        ← paylar talepten ölçüldü
    atama               = (kare, mal) çiftleri, uygunluk / o malın üst %10 dilimi
                          sırasıyla, kota dolana dek; artan kare kotası dolmamış
                          en uygun mala
    küme satırı         = mal başına { hex sayısı, ortalama nitelik 0.85…1.15 }
    satırın çıktısı     = taban × nitelik × (1 + gelişim×0.18) × emek × sadakat
                          × hex × teknoloji × talep ölçeği(mal)          (§4.3, §5.2)

    kuruluş kadrosu     = küme nüfusu × alt sınıf payı × 1.05
    RGO iş gücü         = nüfus × alt sınıf payı − yerel fabrika kadrosu − banliyö − asker

**Kod** — `src/game/provinces.js` (`assignHexResources`, `depositLines`,
`rgoWorkforceOf`, `rgoJobsOf`, `provinceOutput`, `ensureProvinceResources`),
`src/game/economy.js` (`jobTotalsOf`: asker mesleği)

**Ne bozuktu.** Kümenin tek RGO'su vardı ve türü zara bağlıydı:

1. **Paylar talebi izlemiyordu.** 40 yılda meyve, ipek, boya, tropik ağaç ve
   kauçuk tabana çakılı (arz talebin 3–20 katı), kükürt kıt (0.4–0.8, fiyat
   tabanın 1.3–2.8 katı), balık kıt.
2. **Kadro iş gücüne göre değil nüfusa göre açılıyordu** (nüfusun %72–88'i)
   ve orta/üst sınıf da iş arayan sayılıyordu: başkent kümesinde fabrika
   işçileri ve kâtipler "2.47M işsiz" görünüyordu (oyuncu bildirimi). Oyun
   işsizle başlıyor, 20. yılda en kötü onda bir ülkede istihdam %63'e
   iniyordu.
3. **Gıda fazlayken ülkelerin yarısı açtı:** gümrük iştahı ekmeği kesiyordu
   (§1.2), borçlu YZ alt vergisini %90–100'e çekiyordu (§1.1).

**Elenen: çarpan yinelemesi.** Tür çarpanını payı hedefe yaklaştırana dek
oynatmak yakınsamadı — argmax ataması kesikli, küçük bir çarpan değişimi
ikinci sıradaki binlerce kareyi birden çeviriyor: 30 turda meyve %18.9 (hedef
%1.3), ipek ve tropik ağaç sıfır. Kota ataması payı birebir verir.

**Demir kotası bilerek düşük (%4.5).** Karlı zirvede yalnız demir ve kükürt
çıkar; kotalar dolunca artan zirve demire düşüyordu (kota %6.5 iken gerçek
pay %8.8).

Atama tohum, arazi ve koordinattan türer, **kayda girmez**; satırlar econ'a
sayılamaz alan olarak bağlanır ve yüklemede aynı dünya aynı kaynakları yeniden
kurar. Eski kayıt göçü tek RGO'nun gelişim tabanını ve talep ölçeğini kendi
malına taşır, kadroyu bugünkü iş gücüne açar (sahip ulusun gerçek alt sınıf
payıyla — varsayılan 0.78 yıllar sonra alt sınıfı eksik sayıyordu).

**Çalışıyor mu?** **EVET** — standart dünya, 3 tohum × 20 yıl, gözlemci,
taban 4bb99ed (üç tohum ortalaması; bu pass'in bütün değişiklikleri
birlikte):

| | taban 1. yıl | yeni 1. yıl | taban 20. yıl | yeni 20. yıl |
|---|---|---|---|---|
| istihdam medyanı | %92.9 | %99.1 | %81.3 | %94.7 |
| istihdam, en kötü onda bir | %84.9 | %97.2 | %63.2 | %78.7 |
| raftaki gıda (ülke ortalaması) | 0.76 | 0.86 | 0.80 | 0.98 |
| gıdası %90 altında ülke | 57 | 42 | 32.3 | 2.0 |
| alt vergisi ≥ %90 ülke | 0 | 0.3 | 9.3 | 1.7 |
| istikrar medyanı | 0.32 | 0.32 | 0.52 | 0.66 |
| borçlu ülke | 55 | 52 | 34 | 24 |
| dünya nüfusu | 268M | 268M | 269M | 271M |

İstikrar artışı üç tohumun üçünde de var (20. yıl 0.58/0.50/0.50 →
0.68/0.57/0.71). Borç MEDYANI raporlanmadı: medyan ülke borçlu olmakla
olmamak arasında durduğu için tohum içinde 0 ile 50 arasında zıplıyor.

Hammadde arz/talebi, 20. yıl (taban → yeni): balık 0.72 → 1.22, kükürt
0.46 → 1.14, tropik ağaç 14.4 → 3.1, meyve 2.38 → 1.67, kömür 1.59 → 1.21,
pamuk 1.02 → 1.17, ipek 0.85 → 0.60 (fiyat 1.01). Kıt doğan mal yok.

**Reel GSYH ilk yıllarda düşük görünür, bu bir kayıp değildir.** Taban kodda
satılamayan fazla taban fiyattan sayılıyordu. Ayrıştırıldı: 1. yılda
hammaddenin taban fiyatlı SATILAN kısmı 2255 → 2202 (aynı), fazlası 5464 →
4340; reel GSYH farkının (−1177) 1124'ü eriyen fazladır. 5. yılda satılan
hammadde +%6, 20. yılda +%10; reel GSYH toplamı 20. yılda 8277 → 8710.
Nominal GSYH toplamı değişmedi (+%1). GSYH MEDYANI 55 → 37 düştü ama tohum
gürültüsü içinde (tabanın kendi tohumları 40/38/88) ve yeni kolda daha çok
küçük ülke ayakta (58/53/52 → 60/57/51).

**Açık kalan.** 20. yılda demir (1.84), boya (1.98), kereste (1.72) ve tropik
ağaç (3.1) hâlâ fazlada; fiyatları tabanın 0.5–0.6'sında, bantta değil. İlk
yıl bütün hammaddeler fazladır (sanayi henüz dolmadı) — tabanda da aynı.

**Pratikte** — haritadaki "resources" modu her karenin malını gösterir;
bir kümenin birden çok satırı olabilir (ovası tahıl, tepesi kömür). Kuruluşta
iş arayan yoktur; işsizlik ancak nüfus kadrodan hızlı büyürse, fiyatı çöken
malın tarlası küçülürse (§4.3) ya da fabrika kapanırsa doğar.

## 4.8 Fabrika duraklatma — kapatmadan durdurmak

**Formül**

    duran tesis: iş yok, üretim yok, ücret ve kâr sıfır; kadro ayda %25 erir
    YZ ve Industry AUTO, yalnız silah hattı (ARMS_FACTORY):
      durdur      = barış VE depo ≥ tavan × 0.95 VE fiyat < taban × 0.75
      yeniden aç  = savaş VEYA depo < tavan × 0.60 VEYA fiyat > taban
                    (yalnız YZ'nin durdurduğu hat; elle durdurulan elle açılır)
    duran türden yeni fabrika kurulmaz

**Kod** — `src/game/economy.js` (`setFactoryPaused`, `restMilitaryLines`,
`runFactories` duran dalı, `runFactoryEmployment`, `investmentOptions`);
ekran: `src/ui/industryScreen.js` ("Pause production" / "Resume")

**Ne bozuktu.** Kapatmaktan başka kol yoktu ve kapatmak geri dönüşsüzdü.
Silah fabrikası barışta da tam çalışıyor, deposu dolunca fazlayı dünya
pazarına döküyordu: tohum RAW1'de silah arzı 10. yılda talebin 2.2, 20.
yılda 2.3 katı, fiyat tabanın 0.34'ü.

**İlk kural geri alındı.** "Barışta depo dolu → durdur" tek başına ölçüldü:
5. yılda 86 hattın 61'i durdu, arz talebin altına indi (5.8'e 15.3, fiyat
tabanın 1.95 katı) ve YZ açığı kapatmak için yeni silah fabrikası kurdu (20.
yılda 90 yerine 110). Fazlanın yarısı zaten orduların tüketimine gidiyordu.
Hat artık yalnız pazar da doyduğunda durur.

**Çalışıyor mu?** **EVET** — tohum RAW1, 20 yıl, taban 4bb99ed:

| silah pazarı | taban 10. yıl | yeni 10. yıl | taban 20. yıl | yeni 20. yıl |
|---|---|---|---|---|
| arz / talep | 56.8 / 26.2 | 44.3 / 30.0 | 41.7 / 17.9 | 11.1 / 10.0 |
| fiyat / taban | 0.60 | 0.84 | 0.34 | 0.93 |
| silah fabrikası (duran) | 81 (0) | 81 (17) | 90 (0) | 77 (45) |

İki kol aynı tohumdan zamanla ayrışır (20. yılda savaştaki ülke 19'a 4);
yön tablonun her satırında aynı. 3 tohumluk sağlık koşusunda 20. yılda
dünyadaki 1106 tesisin ortalama 36'sı durmuş.

Mühimmat ve patlayıcı otomatik durmaz: deposu yoktur, fiyatla ayarlanır
(aynı koşuda 20. yıl mühimmat arzı talebin 1.85 katı, fiyat 0.52). Zararda
kalan tesis zaten işe almaz ve yirmi yıl boş kalırsa tasfiye olur (§4.4).

**Pratikte** — sanayi ekranında her tesisin menüsünde "Pause production"
vardır; işçi ayda dörtte bir hızla başka tesise ya da tarlaya döner, tesis
ve seviyesi yerinde kalır. Industry AUTO açıksa barışta dolu depolu silah
hatlarını hükûmet soğutur, savaş çıkınca kendisi açar.

---

# 5. DEVLET — imparatorluğun otomatik bedelleri

## 5.1 İdari gider

**Formül**

    idari gider = (şehir − 1)^1.6 × 4.0
                + taşra sayısı × 0.02
                + mesafe yükü
                + (nüfus / 100.000)^0.75 × 0.8

**Kod** — `src/game/cities.js:233`

```js
function administrationCost(cityCount, provinceCount, distanceLoad, population = 0) {
  const cities = Math.max(0, cityCount - ADMIN_FREE_CITIES) ** 1.6 * ADMIN_CITY_RATE;
  const provinces = Math.max(0, provinceCount) * ADMIN_PROVINCE_RATE;
  const people = (Math.max(0, population) / 100000) ** 0.75 * ADMIN_POPULATION_RATE;
  return Math.round((cities + provinces + distanceLoad + people) * 10) / 10;
}
```

**Çalışıyor mu?** **EVET — ve artık bir kaydıraç DEĞİL.** Eski `adminFunding`
kaydıracı ölçüldü: bütün menzili (30–100) hazineyi %0.6 oynatıyordu, yani
gürültü tabanının **85 kat altında**, ve bütün YZ ülkeleri istisnasız %100'de
oturuyordu. Tek doğru cevabı olan bir seçim, yani seçim değil. Kaldıraç gitti,
gider kaldı.

**Pratikte** — **şehir sayısı süperdoğrusal (üs 1.6), nüfus altdoğrusal
(üs 0.75).** Yani kalabalık olmak değil, YAYILMIŞ olmak pahalı. Başkent
bedava yönetilir; ikinci şehirden itibaren aygıt büyür. Ölçüldü: tek şehirli
minör devlet gelirinin ~%5'ini, altı şehirli imparatorluk ~%25'ini yönetime
verir. Büyümenin görünür bir bedeli olsun ve "her şeyi aynı anda maksimize
etme" seçeneği kendiliğinden kapansın diye böyle. Başkentten 6 kareden uzak
her şehir ayrıca yük getirir — sömürge kurarken bunu hesaba kat.

## 5.2 Taşra sadakati ve üretim

**Formül**

    sadakat += (kendi kültürün ? 1.5 : azınlık çarpanı) × (0.45 + istikrar)
    sadakat TAVANI = kendi kültürün ? 100 : 100 × azınlık hakları çarpanı
                     (kısıtlı haklar 0.70 … herkese açık 1.00)

    taşra üretimi = taban × kalite × gelişim × işgücü × SADAKAT × hex
    taşra vergisi = (0.08 + baseGold×0.05 + ticaret×0.09) × ... × SADAKAT

**Kod** — `src/game/provinces.js:788` ve `:626`

```js
const ceiling = province.culture === nation.culture
  ? 100
  : 100 * (lawModifiers(nation).minorityCeiling ?? 1);
econ.control = clamp(
  econ.control + ((province.culture === nation.culture ? 1.5 : minorityControl)
    * (0.45 + stability)) * (1 - occupied) - occupied * 2,
  0, ceiling);

const control = clamp(econ.control / 100, 0, 1) * (1 - occupied);
// hex kaynakları: kümenin her kaynak satırı (tür × hex) ayrı üretir
output[type.goodId] += type.baseOutput * RGO_OUTPUT_SCALE
  * line.quality * (1 + development * 0.18)
  * labor * control * line.hexes * tech * demandScaleOf(econ, type.goodId);
```

**Çalışıyor mu?** **EVET, ama oyuncu ayırt edemez.** Doğrudan ölçüldü:
azınlık hakları tabandan tavana taşra gelirini **+%12.5** artırıyor (sadakat
tavanı 70 → 100). Kaba ölçütlerde ise gürültünün 0.46 katı — çünkü GSYH'nin
kendi tohum gürültüsü %51.9 ve fazla üretim dünya fiyatını düşürerek kendini
kısmen yiyor. **Bu, kılavuzdaki tek "bağlı ama hissedilmiyor" mekanik.**

**Ayrıca** — sadakat kazancından huzursuzluk düşülür (`CULTURE.CONTROL_DRAG`
0.15/puan). Huzursuz taşra önce ÜRETİMİ keser; isyan en son adımdır (§5.7).

**Pratikte** — çok kültürlü imparatorluk kurduysan azınlık hakları doğrudan
paradır: kısıtlı haklarla yabancı kültürlü taşran üretiminin %70'ini verir ve
**asla fazlasını vermez** — bekleyerek düzelmez, tavan kalıcıdır. Parti
politikası (`citizenship`) sadakatin ne kadar HIZLI oturduğunu söyler, yasa
NEREYE KADAR oturduğunu. Tek kültürlü bir ulusal devlet oynuyorsan bu yasa
senin için bedava.

## 5.3 İnsan gücü

**Formül**

    ulusal insan gücü = Σ (işgal edilmemiş taşranın havuzu) × askerlik çarpanı
    askerlik çarpanı  = 0.85 + askerlik yasası ilerlemesi × 0.45
                        Mass 1.30 … Limited 1.075 … Volunteer 0.85

**Kod** — `src/game/recruitment.js:74`

```js
export function nationManpower(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nationId || !province.econ) continue;
    if (occupiedShareOf(world, province) > 0) continue;
    total += provinceManpower(world, province.center);
  }
  return total * (lawModifiers(world.nations?.[nationId]).manpower ?? 1);
}
```

**Çalışıyor mu?** **EVET** — 2.40 katı (yasa; eski merdiven 1.66 katıydı). Merdiven
bağlanmadan önce **hiçbir şeye bağlı değildi**: oyuncu askerlik yasası çıkarıyor,
hiçbir şey olmuyordu.

**Pratikte** — seferber ulustan gönüllü orduya geçmek havuzunu %35 küçültür
(1.30 → 0.85); Mass kademesine yalnız milliyetçi program izin verir. Bedeli de
var, ters yönde: seferberlik alt sınıf moralinden 0.06 götürür. Yani "büyük ordu mu, mutlu halk mı" gerçek bir takas. İşgal
edilmiş taşra havuza **hiç** katkı vermez — savaşta toprak kaybetmek aynı
zamanda yedek kaybetmektir.

**Asker kaybı gerçek kayıptır.** Askere alınan adam nüfusun İÇİNDE kalır
(`claimSoldiers`); tarladan ve insan gücü havuzundan düşer, meslek tablosunda
`soldiers` olarak görünür. Savaşta ölen adam hem nüfustan hem asker kaydından
düşer ve hiçbir terim onu geri doldurmaz; terhis yalnız kaydı bırakır, insan
yaratmaz. Ölçüldü (2 tohum, 260 hafta): savaş fazındaki nüfus düşüşü sayılan
ölümlere **birebir** eşit (−1.571.002 / −1.420.802), kayıt/yükleme sonrası
asker ve nüfus 4 haneye kadar aynı.

**Bedava başlangıç ordusu kapandı.** Kuruluş tümeni önce depodan teçhizat
isteyerek kuruluyordu; depo 16 tüfek (4 piyade) olduğu için plan çoğu ülkede
tükeniyor ve kalan tümenler HİÇBİR kümeden adam çekilmeden yaratılıyordu:
başlangıç askerlerinin %26-30'u hiçbir nüfusta yoktu, savaş ölümlerinin
%8.7-9.1'i nüfustan bir şey götürmüyordu. Artık depo bitince tümen teçhizatsız
kurulur ama adamı gerçek kümelerden çekilir (`turn.js`); gerçek kümeden adam
çeken alay payı %94.5 (`diagnose:rgo`, 309 alay). Kalanı nüfusu yetmeyen
ülkelerin acil durum tümenidir.

## 5.4 Ültimatom

**Formül**

    savaş ilanı → CRISIS (8 hafta) → WAR
    ültimatomda: sınır kapalı, muharebe yok, seferberlik AÇIK, müttefik çağrılır
    warAt = ilan turu + 8 ; müttefiğin ültimatomu saldırganınkiyle aynı hafta biter

**Kod** — `src/game/diplomacy.js` `CRISIS`, `ULTIMATUM_WEEKS`, `resolveCrises`

**Çalışıyor mu?** **EVET** (2026-09-04, bully senaryosu, 3 tohum). Ültimatom
öncesi 2.5–3.4× üstün komşu ilk haftadan saldırıyor, kurbanın ordusu savaş
boyunca hiç büyümüyordu (3→3 alay). Sonrası: kurban 4→16, 3→5, 3→7 alay.
Denetim/tanılama betikleri ültimatomu `declareWarNow` ile atlar; oyun
içinde her ilan (oyuncu, YZ, koalisyon) ültimatomdan geçer.

**Pratikte** — savaş ilan ettiğin an hiçbir şey olmaz; sekiz hafta sonra
sınır açılır. O sekiz haftada iki taraf da seferber olur ve ordularını sınıra
diker (YZ generalleri ültimatomdaki düşmana bakar, HOLD'da bekler). Zayıf
komşuya "pat diye" saldırmak artık onu iki katına çıkarır. Ültimatomda
verdiğin sağ tık emri düşmez: sınır açılınca yürür.

## 5.5 Seferberlik

**Formül**

    hedef alay  = min( havuz × 0.06 / 30.000 ,  düzenli kara alayı × 2 + 2 )
    tempo       = hedef / 8 alay per hafta      (ültimatomla aynı sürede tamamlanır)
    yedek gücü  = düzenli × 0.7 ; düzen 55 ile çıkar
    bedel       = insan (province nüfusundan), bakım (düzenli alayla aynı),
                  savaş yükü +0.35 (istikrar), son düşman gidince eve döner

**Kod** — `src/game/mobilization.js` (`MOBILIZATION`), `units.js`
`CONSCRIPT_POWER`, `economy.js` warStrain

**Çalışıyor mu?** **EVET.** Tek ulusal anahtar (Military ekranı "Mobilize");
YZ aynı fonksiyonla, düşman gücü kendi gücünün 0.6 katını aşınca açar.
Tavansız ilk sürüm 26 kümelik devlete 41 yedek verdi ve cephe üç yıl dondu;
"düzenli ordunun 2 katı + 2" tavanı bunun için var.

**Pratikte** — barış ordusu nüfusun %1–3'ü; seferberlik onu iki-üç katına
çıkarır ama tarla ve tezgâhtan adam çeker, istikrarı yer, sadece ültimatom
ya da savaşta açılabilir. Askerlik yasası havuzu (5.3) büyüttükçe seferberlik
de büyür. Barışta açık bırakamazsın; son savaş bitince kendiliğinden kapanır.

## 5.6 Cephe temposu ve kuşatma

**Formül**

    yürüyüş  : savunmasız düşman karesine, general başına haftada tümen/4 (en az 1)
    operasyon: YALNIZ savunulan kareye, plan ≥ 0.32 ve tempo (cadence) ile
    genişlik : 3 tümen + her ek saldırı yönü için 2, tavan 7 ; savunan 4
    sağ tık  : oyuncunun emri generalin temposunu beklemez; emir kaydedilir
    donmuş   : 104 hafta sonuçsuz savaş beyaz barış teklif eder

**Kod** — `src/game/command.js` `WALK_IN_SHARE`, `pickOperation`;
`battles.js` `selectAssault`, `FLANK_WIDTH`; `game.js` `attackBlockers`,
`reportOrder`; `movement.js` `resumeDirectives`; `ai.js` `FROZEN_WAR_WEEKS`

**Çalışıyor mu?** **EVET, ölçülü.** Boş cepheye 10 tümen / 3 general /
agresiflik 3: 16 haftada 16 hex → 25–28 hex. Sağ tık: generalin temposu 5
hafta ileri atılmışken el emri yine saldırıyor (`right-click.mjs`). Yürüyüş
artık savunmasız düşman karesinin TEK işgal yolu: kapatınca 50 yılda küme
değişimi %4–15'e düşüyor, yani savaş toprak üretmiyor (`audit:borders` C).
Kartopu (50 yılda el değiştiren küme payı, 3 tohum): taban %42/24/40 →
seferberlikle %28/34/32 → bu bölümle %25/27/48. Denenip GERİ ALINANLAR:
12 haftalık sabırsızlık tırmanışı (+4–5 puan kartopu, dar cepheyi açmadı),
savunma genişliği 3 ve siperli arazi çarpanı 1.5 (saldırı açıldı ama
kartopu %42–50), yürüyüşe "iki dost kenar" şartı (fark yok).

**Bombardıman.** İlerleme duruşundaki grup giremediği savunulan kareye bitişik
durduğu her hafta savunanın siperini aşındırır: hat birliği başına 0.006,
destek kolu (topçu, hava) başına 0.012, siper 0 olana kadar. Siperi tamamen
silmek savunmayı ~%26 düşürür, yani 0.66'lık bir şansı 0.89'a taşır —
saldırgan duruşun eşiğine. Bombardıman hattı KIRMAZ, kırılabilir hale getirir;
topçusuz ordu bunu üç kat yavaş yapar. Dar cephede donan savaşların çözümü bu:
`bully` senaryosunda BULLY-1 savaşı 104 hafta donup beyaz barışla bitiyordu.

**Pratikte** — bir kareyi iki-üç yandan sar: genişlik 3'ten 5–7'ye çıkar ve
sayı üstünlüğün nihayet muharebeye girer. Sağ tıkın sonucu her zaman tek
satırla yazılır ("Order recorded… consolidating 1 more week"); sessiz tık
yok. 3 hexlik dar cephede dolu siperli yığın hâlâ kırılmaz (şans 0.66–0.71,
gereken 1.2): topçu, mühendis general, ya da iki yıl sonunda beyaz barış.
Bu, bilinçli WW1 dengesi; çözümü kuşatma yeterlilik mekaniği değil,
topçu/ikmal yıpratması olmalı (açık iş).

## 5.7 Kültür — huzursuzluk, asimilasyon, ayrılıkçılık

**Formül**

    huzursuzluk HEDEFİ (0–10) =
        yabancı pay × 10 × haklar × milliyetçilik çağı      ← ana kaynak
      + (1 − sadakat) × 3 × (0.3 + 0.7 × yabancı pay)       ← taze fetih
      + savaş yükü × 1.0 + işgal × 1.5 + kabul tepkisi
      − refah/100 × 2 − azınlık hakları × yabancı pay
    huzursuzluk += (hedef − mevcut) × 0.02                  ← yarılanma ~34 hafta
    haklar: residency 1.0 · limited 0.7 · full citizenship 0.45
    milliyetçilik çağı: 1836'da 1.0 → 1900'de 1.8 (takvim)

    asimilasyon/hafta = 0.0008 × (0.5 + okuryazarlık) × haklar
                        × sadakat × (şehir ? 1.5 : 1) × (1 − huzursuzluk/10 × 1.3)
    asimilasyon haklarında ters yön: full 1.4 · limited 1.0 · residency 0.6

    isyan: huzursuzluk ≥ 7 VE yabancı pay ≥ 0.5 → sayaç++; 26 haftada kopar

**Kod** — `src/game/culture.js` (`unrestBreakdown`, `assimilate`,
`resolveRevolts`, `acceptCulture`), `provinces.js` haftalık döngü

**Çalışıyor mu?** **EVET, altı testle sabitlendi** (`audit:culture-unrest`,
520 hafta): yabancı kümelerin ortalama huzursuzluğu **6.24**, aynı ulusların
kendi kümelerinin ortalaması **1.05**. Vatandaşlık kaldıracı 0.43 puan
oynatıyor. Asimilasyon 520 haftada küme başına %1.3, yani yüzyılda ~%13 —
onlarca yıl sürer, yüzyılda kazanır. Kültür kabulü ulusal huzursuzluğu üç
yılda **3.78 → 1.83** düşürüyor.

**GÜVENLİK KİLİDİ.** İsyan yalnız kabul edilmeyen halkın **çoğunlukta**
olduğu kümede olur. Tek kültürlü ulusal devlet bu mekanikten toprak
kaybedemez; ölçüldü: 9 tek kültürlü ulusun 520 haftada isyan sayacı 0.
Savaş yorgunluğu huzursuzluğu yükseltir ama tek başına asla kopma üretmez.

**Pratikte** — fethettiğin yabancı taşra ilk yıl sessizdir, sonra huzursuzluk
birikir: önce sadakat kazancını yer (üretim ve vergi düşer), sonra asker
havuzunu, altı mevsim eşiğin üstünde kalırsa ayaklanır. Yüzyıl ilerledikçe
aynı yabancı pay daha çok huzursuzluk üretir: 1890'da kurulan imparatorluk
1840'takinden zordur.

Ayaklanmanın nereye çıktığı ve çıkış yolları için **5.8**.

---

## 5.8 Ana yurt — kırık küme ve üç çıkış

**Bu bölüm bir teşhisin sonucudur.** `audit:borders` ve `audit:war-pressure`
uzun süre "kartopu" veriyordu: 50 yılda haritanın %40.8'i el değiştiriyor,
eşik %33. Ad fetih kartopunu ima ediyordu; ölçüm başka şey söyledi.

**Sahiplik değişiminin sebebi** (50 yıl × 3 tohum, `claim`/`claimAtPeace`
sarılarak sayıldı):

| sebep | olay | ayrı küme | pay |
|---|---|---|---|
| savaş zaptı | 0 | 0 | %0 |
| barış masası | 139 | 105 | ~%20 |
| **bedava yerleşme** | 206 | **45** | ~%30 |
| **isyan** | 301 | 87 | ~%48 |

Olayların **%78'i bir döngüydü**. Mirasçısı olmayan ayaklanma kümeyi
*sahipsiz* bırakıyordu; sahipsiz toprak savaşsız ve şöhretsiz yerleşilebildiği
için (`turn.js occupy → canSettle`) komşu bedavaya giriyor, iki yıl sonra
aynı küme yeniden kopuyordu. Bir küme 50 yılda **24 kez** el değiştirdi.

Aynı döngü dünyayı da temizliyordu: yabancı halk payı %41.3 → **%6.0**.
İzole edildi — bunu yapan asimilasyon değil isyandı (isyan kapalıyken pay
%31.3 kalıyor). Yabancı toprak sindirilmiyor, **kopup gidiyordu**. Sonuç:
fethin kalıcı bedeli yok ve kültür freni tam da oyuncunun en çok fethettiği
çağda tutunacak yer bulamıyor — milliyetçilik çağının tersi.

**Elenen iki hipotez, ikisi de ölçüldü:**

| hipotez | ölçüm | sonuç |
|---|---|---|
| asimilasyon çok hızlı, yavaşlatalım | 8 kat yavaş → %40.8 → **%46.4** | ters etki, elendi |
| yabancı asker payını kısalım | 0.35 → 0.12 → %40.8 → **%40.6** | tek başına ölü |

İkincisi ölüydü çünkü dünyada ceza kesecek yabancı kalmamıştı. Döngü
onarıldıktan **sonra** çalışıyor (%32.8 → %30.5).

**Formül**

    ana yurt = kümenin DOĞUŞ çoğunluğu (province.homeland), değişmez
    asimilasyon: row.id === province.homeland ise ÇALIŞMAZ

    ayaklanan halk = kabul EDİLMEYENLERİN en büyüğü (çoğunluk değil)
    ayaklanma → aynı kültürden bitişik ulus varsa ONA KATILIR
              → yoksa toprak EL DEĞİŞTİRMEZ, küme KIRILIR:
                control = 0, unrest = 10, brokenSince = tur

    kırık küme çıktısı ≈ 0   (provinceOutput çıktıyı sadakatle ölçekler)
    kırık işareti SAHİBE aittir: devirde sıfırlanır, sadakat ≥ 50'de silinir

    yabancı asker payı: residency 0.15 · limited 0.30 · full 0.50
    ana yurt ilhak şöhreti: × 1.6 (kabul etmediğimiz bir halkın yurdu ise)

**Üç çıkış** — hepsi **kültür başına**, küme başına değil (ev ödevi testi):

| çıkış | şart | bedel | kod |
|---|---|---|---|
| **ortak et** | nüfusun %8'i; residency yasası engel | iki yıl milliyetçi tepki | `acceptCulture` |
| **bırak** | aynı kültürden **bitişik** ulus | toprak gider, şöhret düşer | `releaseToKin` |
| **sür** | her zaman açık | nüfus gider, ağır şöhret | `expelCulture` |

**Kod** — `src/world/cultures.js` (`homeland` yazımı), `src/game/culture.js`
(`rebelCultureOf`, `secede`, `brokenByCulture`, `releaseToKin`, `expelCulture`,
`manageBrokenProvinces`), `src/game/recruitment.js` (`foreignManpowerShare`),
`src/game/infamy.js` (`INFAMY_ANNEX.HOMELAND`), `src/game/turn.js`
(`clearBrokenMark`), `src/ui/populationScreen.js` (`brokenPanel`)

**Çalışıyor mu?** `audit:homeland`, altı test. Ölçülen (50 yıl × 3 tohum):

| | önce | sonra |
|---|---|---|
| el değişen küme (9 tohum ort.) | %40.8 | **%32.7** |
| eşiği geçen tohum | — | 2/9 |
| bedava yerleşme | 206 | **5.3** |
| barış masası fetih olayı | 139 | 108.7 |
| isyan | 301 | 50 |
| yabancı halk payı (50. yıl) | %6.0 | **%12.9** |
| kırık kümenin hex başına çıktısı | — | **sağlamın %0'ı** |
| üç kapısı da kapalı halk | — | **0** |

**Şöhret çarpanı ayrı ve DOKUZ tohumda ölçüldü.** Üç tohumluk ilk ölçüm
yanıltıcıydı: `HL` ailesinde iyileşme, `WP` ailesinde kötüleşme gösteriyordu.
Dokuz tohumda karar net:

| | çarpansız | çarpanlı |
|---|---|---|
| ortalama el değişen | %34.1 | **%32.7** |
| **eşiği geçen tohum** | **5/9** | **2/9** |
| ölen ülke | 9.8 | **8.8** |
| yabancı halk payı | %9.9 | **%12.9** |

Tohum bazında oynaktır (WP1 %33.3 → %44.0 kötüleşir, WP3 %38.7 → %29.8
iyileşir) çünkü çarpan hangi savaşların çıkacağını değiştirir. Ortalamada ve
başarısız tohum sayısında iyileştirir; kalan iki tohum kovalanmadı — bu,
mekaniği tohuma uydurmak olurdu.

`audit:war-pressure` iki YÜKSEK bulgusunun ikisini de kapattı: kartopu
%40.8 → %31.6, çullanma azami 4 → 3.

**Denetim dört gerçek kusur yakaladı**, dördü de düzeltildi:

1. Kırık kümeleri **ana yurda** göre gruplamak — ayaklanan halk başkası
   olabilir (`econ.brokenCulture`).
2. Sürgünün `province.homeland` değişikliğinin **kayda girmemesi** —
   yükleme sürgünü geri alıyordu.
3. Elenen ulusun **ilişkilerinin hiç sıfırlanmaması** — ölü ülke sonsuza
   kadar "savaşta" kalıyordu; `audit:war-pressure` bu bayat durumu
   çullanma sayıyordu (canlı filtreyle gerçek değer 3, tavan hiç
   delinmemiş).
4. Kırık işaretinin **el değiştirirken taşınması** — küme bir sahipte
   kırılıp o halkı zaten kabul eden bir ulusa geçince üç kapı da kapalı
   görünüyordu.

**Pratikte** — bir halkın ana yurdunu fethedebilirsin ama eritemezsin.
Diasporası erir, yurdu erimez. Tutmakta ısrar edersen ayaklanma bastırılır
ama küme çalışmaz: vergi yok, mal yok, asker yok, ve bu kalıcıdır. Üç
çıkışın hep en az biri açıktır. Kendi halkının olmadığı bir imparatorluk
kurmak artık mümkün ama ordusu küçük olur — asker vatandaştan gelir.

**Ölçülen yan etki, saklanmıyor:** canlı ülke 19.0 → 17.3. Ama kimin öldüğü
değişmedi (en büyük 10'dan 1.0, en küçük 10'dan 6.3 — master'da da aynı) ve
dünya daha **az** yoğunlaşıyor: ilk üçün payı %39.2 → %35.7, ortanca ülke
boyu 8.3 → 12.0. Harita üç deve değil orta boy devletlere oturuyor.

## 5.9 Şöhret, koalisyon ve sahipsiz toprak

**Formül**

    şöhret kazancı = ilhak (annexInfamy) + işgal (tileInfamy, şehir +INFAMY.CITY)
                     işgal şöhreti YALNIZ o savaşın SALDIRGANINA yazılır
    erime          = 0.05 + %1.2 / hafta
    koalisyon      = şöhret ≥ 22 → temaslı komşular tek tek katılabilir
    koalisyon savaşında hedef, üyelerden TOPRAK alamaz (occupiedProvincesOf → [])

**Kod** — `src/game/infamy.js`, `src/game/turn.js` (`occupy`, `heirOfProvince`,
`checkElimination`), `src/game/peace.js` (`occupiedProvincesOf`,
`liberationHeir`, `LIBERATE`)

**Ne bozuktu.** Kerem "şöhret doğru çalışıyor mu" diye sordu; ayrı bir ajan
3 tohum × 18 yıl ölçtü:

1. **Koalisyon ceza değil ödüldü.** Üyeler hedefin %25 gücünde tek tek
   katılıyor, yenilip toprak veriyordu: hedef üyelerden 111–181 küme aldı,
   29–58 kaybetti. Savaş ilanlarının %73–83'ü koalisyondu; el değiştiren
   toprak koalisyon açıkken %23–31, kapalıyken %12–18.
2. **Savunan da işgal şöhreti topluyordu:** işgal şöhretinin %55–57'si
   savunanlarındı. Kendini savunan hedefin şöhreti yeni koalisyon getiriyordu.
3. **"Liberate Minorities" toprağı SAHİPSİZ bırakıyordu:** komşular 20–21
   kümeye şöhretsiz yerleşti (aynı toprağın ilhakı 191–221 şöhret).
4. **Elenen ülkenin kalan toprağı sahipsizleşiyordu** ve aynı bedava
   yerleşme yolundan geçiyordu.

**Düzeltme.** (1) Koalisyon savaşında hedef masadan toprak dışı şart alır.
(2) İşgal şöhreti yalnız saldırgana. (3) Serbest bırakılan küme aynı kültürden
üçüncü bir ülkeye katılır (önce sınır komşusu); akrabası yoksa serbest
bırakılamaz. (4) Elenen ülkenin her kümesi işgalcisine ya da en çok sınır
paylaşan komşusuna geçer (`heirOfProvince`). Kutup buzu zaten bağlı olduğu
kümenin rengiyle boyanıyordu; panel de artık "Unclaimed Territory" değil o
ülkeyi yazar. Sonuç: oyun boyunca sahipsiz toprak oluşmaz.

**Çalışıyor mu?** **EVET, kısmen.** `audit:war-pressure` (50 yıl × 3 tohum;
taban f526c93, yeni kolda aynı çalışma alanındaki fiyat bandı ve kuruluş
ordusu değişiklikleri de var):

| | taban | yeni |
|---|---|---|
| dünya zirve şöhreti (ortalama) | 270 | **172** |
| eşiği geçen ülke-hafta | 5053 / 7241 / 8421 | **2978 / 2047 / 2775** |
| el değiştiren küme | %38.5 — HIGH kartopu | **%30.7** — bulgu yok |
| ayakta kalan ülke (başlangıç 28–29) | 17 / 17 / 17 | 19 / 20 / 18 |
| ortanca savaş süresi | 21.3 hafta | 41.3 hafta |

`audit:borders` (50 yıl × 3 tohum): el değiştiren küme %34.1 / 39.4 / 41.7
→ %36.9 / 31.1 / 35.6, toprak kazanan ülke 11 → 14. **Açık:** üç tohumun
ikisinde hâlâ üçte biri aşıyor (HIGH kartopu). Sahipsizliğe düşen küme
(`deaths` ölçümü, 2 tohum × 20 yıl): önce 5 yıllık dilimlerde 0–6, şimdi 0.

**Görünmeyen bedel — açık.** Barış masası imzalanacak şartın şöhret bedelini
göstermiyor; ipucu yalnız "hex, şehir ve kişi başına" diyor.

**Pratikte** — koalisyon artık kartopu yapmaz: sana karşı kurulan koalisyonu
yenersen hayatta kalırsın ama üyelerinden toprak koparamazsın. Savunurken
düşman toprağını işgal etmek şöhret getirmez; saldırırken getirir.

---

# 6. SİYASET — hükûmet ve beş yasa

Siyaset ekranında iki karar var: **hangi partiyle yönetildiği** ve **beş yasanın
kademesi**. Eski katman (18 yasa merdiveni, üst meclis kapısı, 48 haftalık seçim,
ülkeden ülkeye zarla kurulan partiler) 2026-09'da buna indirildi. Simülasyona
giden kanalların katsayıları DEĞİŞMEDİ: bir yasanın tavan kademesi, katlandığı
eski merdivenlerin hepsi tavandayken ne veriyorsa onu verir.

**Kod** — `src/game/politics.js` (`computeLawModifiers`). Her yasanın kademesi
0 / 0.5 / 1 ilerlemeye çevrilir.

```js
const slavery = 1 - labour;          // kölelik işçi hakkının en alt kademesinde yasal
lowerMood:  labour * 0.44 + welfare * 0.32 + constitution * 0.22
            - conscription * 0.06 - slavery * 0.08,
middleMood: constitution * 0.23 + citizenship * 0.09 + welfare * 0.02,
upperMood:  -(labour * 0.12 + constitution * 0.12),
throughput: 1 - labour * 0.054,
wageCost:   1 + labour * 0.29 - slavery * 0.10,
socialBurden:    welfare * 0.41,
manpower:        0.85 + conscription * 0.45,
literacyFloor:   welfare * 0.35,
researchRate:    constitution * 0.25,
minorityCeiling: 0.7 + citizenship * 0.3,
```

| Yasa | Kademeler | Katlanan eski merdivenler | Kanallar |
|---|---|---|---|
| Constitution | Absolute · Constitutional · Democracy | oy hakkı, seçim sistemi, partiler, üst meclis, toplanma, basın | alt/orta sınıf (+), seçkin (−), araştırma; kimin desteğinin sayıldığı (§6.2) |
| Labour Rights | None · Basic · Strong | asgari ücret, çalışma saati, güvenlik, sendika, çocuk işçi, kölelik | alt sınıf (+), seçkin (−), bordro, fabrika üretimi |
| Welfare State | None · Basic · Full | işsizlik yardımı, emeklilik, sağlık, okul | alt/orta sınıf (+), kısılamaz hazine yükü, okuryazarlık tabanı |
| Citizenship | Residency · Limited · Full | azınlık hakları + partinin eski vatandaşlık ekseni | orta sınıf (+), azınlık sadakat tavanı ve hızı, kültürel huzursuzluk, asimilasyon, yabancı asker payı, kültür kabulü |
| Conscription | Volunteer · Limited · Mass | askerlik (yön ters çevrildi: kademe = asker) | insan gücü, alt sınıf (−) |

## 6.1 Hükûmet — dört parti, dört yıl

Her ülkede aynı dört parti, aynı programla:

| Parti | Fabrika | Ticaret bandı | Ordu tavanı | Yasa tavanları (Anayasa / İşçi / Refah / Vatandaşlık / Askerlik) |
|---|---|---|---|---|
| Conservatives | devlet + özel | koruma −15…100 | %100 | Constitutional / Basic / Basic / Limited / Limited |
| Liberals | yalnız özel | serbest −50…25 | %75 | Democracy / Basic / Basic / Full / Limited |
| Socialists | yalnız devlet | koruma −15…100 | %60 | Democracy / Strong / Full / Full / Limited |
| Nationalists | devlet + özel | koruma −15…100 | %100 | Absolute / Basic / Basic / Residency / Mass |

Hükûmet dört yıl (208 hafta) görevde kalır, seçim yoktur; yasa yılda bir
değişir. Tavan yalnız yukarıyı keser: daha dar programlı bir hükûmet gelince
seçilen kademe **askıya alınır**, geniş programlı bir hükûmetle kendiliğinden geri
gelir — bütçedeki `tariffWanted` / `armyFundingWanted` ile aynı kavram.

## 6.2 Meşruiyet — seçimin yerini alan kural

**Formül**

    fark      = max(0, en çok desteklenen partinin desteği − iktidarın desteği) / 100
    istikrar −= fark × 0.25

    destek    = Σ sınıf nüfusu × ideoloji eğilimi × anayasa ağırlığı
                (radikal parti memnuniyet 0.40 altında, ılımlı 0.58 üstünde kazanır;
                 savaş ve işgal iktidarın desteğini %45'e kadar oyar)
    ağırlık   Absolute {alt 0, orta 0, üst 1} · Constitutional {0, 1, 1} · Democracy {1, 1, 1}

**Çalışıyor mu?** **EVET** — iktidarın 30 puan geride olması gürültünün
**2.82 katı** (istikrar).

**Pratikte** — halkın arkasında olmadığı partiyle de yönetebilirsin; bedelini her
hafta istikrardan ödersin (üst çubuktaki istikrar kartında "Government backing"
satırı). Anayasayı genişletmek kimin sesinin sayıldığını değiştirir: sayıca büyük
alt sınıf sosyaliste yakındır, yani demokrasi muhafazakâr bir hükûmetin
meşruiyetini yer. Eski seçim bu bedeli hiç kesmiyordu: parti atamak bedava ve
anlıktı, kaybedilen seçimin ertesi günü aynı parti yeniden atanabiliyordu.

## 6.3 Yapay zekâ ve dünya

Oyuncuyla aynı iki kapıdan geçer (`formGovernment`, `setLaw`). Hükûmet tam dönem
dolmadan değişmez; halkın öndeki partisi iktidarı anayasaya göre **8 / 5 / 3**
puan geçerse hükûmet ona geçer. Yılda en çok bir yasa, bir kademe, **yalnız
yukarı** — eski merdivenler gibi yasa geri alınmaz. Devredilmiş oyuncu kabinesi
(Laws AUTO) yalnız yasaları sürer; hükûmeti oyuncu seçer.

**Yeni kampanya AUTO açık başlar** (`delegation.DEFAULT_AUTO_AREAS`): inşaat,
sanayi, ticaret, bütçe, asker alımı, yasalar, araştırma. Isınma penceresi
geriye yazılır — kuruluşta ezilecek bir oyuncu ayarı yok ve YZ ülkeleri de ilk
haftadan yönetiyor. **Diplomasi dışarıdadır**: devri oyuncu adına savaş ilan
eder. Devredilmiş portföyün sekme künyesi şeritte yeşil yanar; anahtar ekranın
üstündeki AUTO şeridinden kapanır ve o hafta kontrol geri döner.

Aynı üç tohum, 20 yıl, eski katman / yeni katman:

| | 5. yıl | 10. yıl | 20. yıl |
|---|---|---|---|
| alt sınıf memnuniyeti | 0.68 / 0.68 | 0.68 / 0.68 | 0.69 / 0.66 |
| istikrar | 0.53 / 0.54 | 0.53 / 0.52 | 0.53 / 0.51 |
| okuryazarlık | 0.20 / 0.20 | 0.33 / 0.32 | 0.41 / 0.39 |
| teknoloji | 3.7 / 3.7 | 6.0 / 6.1 | 10.8 / 10.9 |
| fabrika seviyesi | 16.0 / 16.7 | 19.7 / 20.7 | 24.4 / 24.0 |
| hükûmet değişimi (toplam) | 0 / 4.3 | 3.7 / 8.7 | 23.0 / 16.7 |

Üç ayar ölçülerek bulundu ve geri dönülmesin diye kodda yazılı:
(1) meşrutiyet alt sınıfı da saydığında 30 haftada 30 ülkenin 9'u sosyalist
demokrasiye geçiyordu; (2) mutlak monarşi orta sınıfı saydığında liberal ilk yılda
dünyanın %60'ını alıyordu — üst sınıf ilk yıl alt sınıfa oranla 0.064'ten 0.016'ya
iniyor; (3) muhafazakâr refahı tercih etmeyince 20 yılda alt sınıf memnuniyeti eski
dünyanın 0.08 altında kaldı.

## 6.4 Çalışıyor mu?

| Kaldıraç | Hüküm | Kaç kat (son) | ilk 5-yasa taraması | En güçlü ölçüt (son) |
|---|---|---|---|---|
| Constitution | EVET | 6.13× | 6.97× | istikrar |
| Labour Rights | EVET | 4.80× | 6.20× | memnuniyet |
| Welfare State | EVET | 7.17× | 7.63× | istikrar |
| Conscription | EVET | 1.83× | 2.40× (eski merdiven 1.66×) | memnuniyet |
| Citizenship | EVET | 1.73× | 0.71× (eski azınlık hakları 0.57×) | hazine |
| Meşruiyet | EVET | 2.36× | 2.82× | istikrar |

"Son" = 2026-09-19 taraması (vergi geçim tavanından sonra; ondan önceki
tarama program kalkmış, hex kaynakları ve ±%50 fiyat bandı ile koşmuştu).
Katlar ekonomi değiştikçe oynar; vatandaşlık uzun süre eşiğin iki yanında
gidip geliyordu (bir gün 0.55×, aynı gün 1.68×). Vergi tavanı orta/üst sınıfı
nüfusta tuttuğu için hazine ölçütü artık daha dayanıklı: 1.73×.

Doğrudan kanal (son tarama): vatandaşlık Residency → Full taşra gelirini
**+%13.0** (ilk taramada +%8.3), işçi hakkı None → Strong işçi gelirini
**+%7.9** oynatıyor (eski asgari ücret kanalı %0.6'da kalıyordu; bandın hemen
ardından ölçülen +%2.8'den geri geldi — vergi tavanı işçinin elinde kalan
geliri büyüttü). İşçi kanalı bant daralmadan önceki taramada **+%19.3** idi: taban fiyat 0.12'den
0.5'e çıkınca satılamayan hammaddenin geliri de büyüyor ve ücret, alt sınıf
gelirinin küçük bir parçasına iniyor. Yasa memnuniyette hâlâ 4.80× çalışıyor;
kanal daralması §4.3 bant notunda açık iş olarak duruyor. Vatandaşlığın asıl işi azınlığı olan ülkededir: `audit:culture-unrest`
TEST 3'te huzursuzluk Residency 4.91 → Full 3.14.

**Pratikte** — tek tık artık büyüktür. İşçi hakkında bir kademe alt sınıf
memnuniyetini +0.26 oynatır ve bordroyu %19.5 büyütür; eskiden bu altı merdivenin
yıllar süren toplamıydı. Kademenin gerçek farkı düğmenin üstünde yazar (motorun
kendi katsayılarından, `lawPreview`).

---

# 7. TEK SAYFA ÖZET

Kaç kat: son `audit:mechanics` taraması (2026-09-17); bütçe satırlarında
en güçlü ölçüt.

| # | Mekanik | Formül (kısa) | Çalışıyor? | Kaç kat |
|---|---|---|---|---|
| 1 | Vergi | gelir × oran × sınıf ağırlığı | EVET | 8.00× (alt sınıf) |
| 2 | Gümrük | ithalat × oran; girdi fiyatı ×(1+oran×ithal payı); gıda iştahtan muaf | EVET | 1.82× |
| 3 | Ordu fonu | güç = 0.55 + fon×0.45 | EVET (savaşta) | contract §6 |
| 4 | Eğitim | (nüfus/10k) × bütçe × 0.34 | EVET | 13.97× |
| 5 | Refah | (nüfus/10k) × bütçe × 0.76 | EVET | 4.63× |
| 6 | Okuryazarlık | hedefe haftada binde 4 yaklaşır | EVET | zincirin içinde |
| 7 | Araştırma | (okuryazarlık×4 + orta×1.5 + katip + 1) × çarpanlar | EVET | 4.00× |
| 8 | Teknoloji maliyeti | 120 × (1+kademe×0.55) × erken ceza | EVET | kalibre |
| 9 | Memnuniyet | 0.35 + ödenebilirlik×0.5 − vergi×0.28 + refah×0.14 | EVET | omurga |
| 10 | İstikrar | memnuniyet − işgal − savaş − işsizlik×0.22 | EVET | omurga |
| 11 | Nüfus | beş çarpanın çarpımı; beslenme %50 altı kıtlık | EVET | ölçüldü |
| 12 | İşsizlik | (min(işçi,tezgâh) − istihdam) / tezgâh | EVET | tek kaynak |
| 13 | Fabrika ücreti | katma değer × 0.55 × yasa çarpanı | EVET | +%8.8 |
| 14 | Ticaret | min(fazla, teklif); iştah = 1/(1+oran×1.6), gıdada 1 | EVET | 1.82× |
| 15 | İdari gider | (şehir−1)^1.6 × 4.0 + nüfus^0.75 × 0.8 | EVET | kaldıraç değil |
| 16 | Taşra sadakati | tavan = vatandaşlık yasası; üretim ×= sadakat | BAĞLI | +%13.0 |
| 17 | İnsan gücü | havuz × (0.85 + askerlik×0.45) | EVET | 1.83× |
| 18 | Anayasa | alt +0.22, orta +0.23, üst −0.12, araştırma +%25; kimin desteği sayılır | EVET | 6.13× |
| 19 | İşçi hakları | alt +0.44 (kölelik kalkınca +0.08), bordro +%29, üretim −%5.4 | EVET | 4.80× |
| 20 | Sosyal devlet | alt +0.32, hazine yükü 0.41, okuryazarlık tabanı 0.35 | EVET | 7.17× |
| 21 | Vatandaşlık | azınlık tavanı 0.7→1.0, huzursuzluk, asimilasyon | EVET | 1.73× |
| 22 | Askerlik | insan gücü 0.85→1.30, alt −0.06 | EVET | 1.83× |
| 23 | Meşruiyet | istikrar −= (lider − iktidar) × 0.25 | EVET | 2.36× |
| 24 | Hex kaynakları | kota ataması (talepten paylar); satır çıktısı × talep ölçeği; kadro = alt sınıf × 1.05 | EVET | §4.7 sağlık koşusu |
| 25 | Fabrika duraklatma | barış + depo ≥%95 + fiyat <0.75 → silah hattı durur | EVET | silah fiyatı 0.34 → 0.93 |

---

# 8. BİLİNEN SINIRLAR

Bu kılavuz ne kadar ölçüldüyse o kadar doğrudur. Ölçülemeyenler:

1. **`armyFunding` barış arenasında ölçülemez.** Üç çıktısı da muharebe
   yolundadır; tarama savaşsız koşar (savaş toprağı değiştirir, o zaman iki
   kol arasındaki fark kaldıraca değil kimin kimi fethettiğine bağlanır).
   Yönü `audit:budget-contract` §6'da ayrıca doğrulanıyor.

2. **Vatandaşlık yasası eşiğe yakın koşuyor** (2026-09-19'da 1.73×; daha önce
   aynı gün iki taramada 0.55× ve 1.68×; ilk 5-yasa taraması 0.71×; eski
   `political_rights` 0.46–0.57×). Taşra gelirini
   +%20 artırdığı doğrudan ölçüldü. Kaba ölçütlerde görünmemesinin iki nedeni
   var: taramanın ülkesinde
   azınlık azdır (yasanın asıl işi azınlıklı ülkede: `audit:culture-unrest`
   TEST 3, huzursuzluk 4.91 → 3.14) ve artan üretim dünya fiyatını düşürerek
   kendini kısmen yiyor.

3. **Tarama 3 tohum × 150 hafta koşar.** Eşiğe yakın mekanikler (1.2–1.4×
   bandı) koşudan koşuya biraz oynayabilir. Gürültünün 2 katının üstündekiler
   sağlamdır.

4. **Kaydet/yükle simülasyonu dallandırıyor** (`audit:save`, HIGH). Birimler
   yüklemede yeniden üretiliyor ve kimlikleri süreç sayacından geliyor;
   `command.js` hangi tümenin o hafta taarruz edeceğine `(tur + birim.id)`
   ile karar verdiği için yüklenen oyunun cephe temposu değişiyor. Bu
   kılavuzdaki mekaniklerden bağımsız, önceden bilinen bir sorun.

5. **Çok nüfuslu ama az şehirli ülke** idari giderde hâlâ gelirinin altında
   ödüyor (`cities.js` kalibrasyon notu). Üç deneme yapıldı, ikisi geri
   alındı: nüfus ağırlıklı gider dünyayı fakirleştiriyordu.

---

## Yeniden üretmek

```bash
npm run audit:mechanics        # her kaldıraç: çalışıyor / hissedilmiyor / ölü
npm run audit:budget-contract  # bütçe sözleşmesi değişmezleri
npm run audit:research         # eğitim → okuryazarlık → teknoloji zinciri
npm run audit:tariff           # gümrüğün ticarete etkisi
```

Yön belgesi: [VICTORIA_LITE.md](VICTORIA_LITE.md) — bir mekaniğin oyunda
kalmayı hak edip etmediğine hangi ölçütle karar verildiği.
