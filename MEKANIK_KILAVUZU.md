# HexWar — mekanik kılavuzu

Oyundaki her mekanik için dört şey:

| | |
|---|---|
| **Formül** | tek satırda, yazılı hâli |
| **Kod** | gerçek kaynak, dosya:satır ile |
| **Çalışıyor mu?** | EVET / HAYIR — ölçülmüş, tahmin değil |
| **Pratikte** | oyunda ne yapman gerektiği |

Son ölçüm: 2026-08-29, dal `experiment/simple-budget`.
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

**Bugünkü tablo: 24 mekanik · ÇALIŞIYOR 22 · GÜRÜLTÜ ALTI 1 · ÖLÜ 0 · SAVAŞ 1.**
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

    okuryazarlık HEDEFİ = 0.08 + (bütçe% × 0.62 × üniversite çarpanı)
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
  const budgeted = 0.08 + schooling * 0.62 * (1 + higherEducationBonus(nation));
  const floor = reformModifiers(nation).literacyFloor ?? 0;   // okul YASASI
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
    + reformMoodShift(nation, classId) - joblessBite,
  0.08, 0.95);

const health = 1 + Math.min(100, nation.economy?.social?.welfare ?? 0) / 100 * 0.35;
```

**Çalışıyor mu?** **EVET** — istikrarı %23.8 oynatıyor, gürültünün
**4.32 katı.**

**Pratikte** — refah pahalıdır (0.76 oran, eğitimin iki katından fazla) ve
etkisi anında görünür: memnuniyet → istikrar → parti desteği → seçim. Vergiyi
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
  const press = reformModifiers(nation).researchRate ?? 0;
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

---

# 3. HANE — memnuniyet, istikrar, nüfus

## 3.1 Sınıf memnuniyeti

**Formül**

    memnuniyet = 0.35
               + ödenebilirlik × 0.50      (sepetinin ne kadarını alabiliyor)
               − vergi oranı   × 0.28
               + refah bütçesi × 0.14
               + reform kayması            (aşağıda §6)
               − işsizlik ısırığı          (alt %22, orta %11, üst yok)
    sonuç 0.08 ile 0.95 arasına kırpılır

**Kod** — `src/game/economy.js:2790`

```js
const joblessBite = classId === 'upper' ? 0
  : unemployment * (classId === 'lower' ? UNEMPLOYMENT_MOOD : UNEMPLOYMENT_MOOD * 0.5);
socialClass.satisfaction = clamp(
  0.35 + affordability * 0.5 - taxRate * 0.28 + welfare * 0.14
    + reformMoodShift(nation, classId) - joblessBite,
  0.08, 0.95);
```

**Çalışıyor mu?** **EVET** — memnuniyet taramanın en hassas ölçütü (gürültüsü
yalnızca %5.3) ve 24 mekanikten 13'ü en güçlü sinyalini burada veriyor.

**Pratikte** — bu formül oyunun omurgası: memnuniyet → istikrar → parti
desteği → seçim. Dört girdisi var ve dördü de senin elinde. En büyük terim
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
  : 100 * (reformModifiers(nation).minorityCeiling ?? 1);
econ.control = clamp(
  econ.control + ((province.culture === nation.culture ? 1.5 : minorityControl)
    * (0.45 + stability)) * (1 - occupied) - occupied * 2,
  0, ceiling);

const control = clamp(econ.control / 100, 0, 1) * (1 - occupied);
output[type.goodId] = type.baseOutput * econ.rgoQuality * (1 + development * 0.18)
  * rgoLaborScale(econ, rgoJobsOf(econ)) * control * econ.hexes * tech;
```

**Çalışıyor mu?** **EVET, ama oyuncu ayırt edemez.** Doğrudan ölçüldü:
azınlık hakları tabandan tavana taşra gelirini **+%12.5** artırıyor (sadakat
tavanı 70 → 100). Kaba ölçütlerde ise gürültünün 0.46 katı — çünkü GSYH'nin
kendi tohum gürültüsü %51.9 ve fazla üretim dünya fiyatını düşürerek kendini
kısmen yiyor. **Bu, kılavuzdaki tek "bağlı ama hissedilmiyor" mekanik.**

**Pratikte** — çok kültürlü imparatorluk kurduysan azınlık hakları doğrudan
paradır: kısıtlı haklarla yabancı kültürlü taşran üretiminin %70'ini verir ve
**asla fazlasını vermez** — bekleyerek düzelmez, tavan kalıcıdır. Parti
politikası (`citizenship`) sadakatin ne kadar HIZLI oturduğunu söyler, yasa
NEREYE KADAR oturduğunu. Tek kültürlü bir ulusal devlet oynuyorsan bu yasa
senin için bedava.

## 5.3 İnsan gücü

**Formül**

    ulusal insan gücü = Σ (işgal edilmemiş taşranın havuzu) × askerlik çarpanı
    askerlik çarpanı  = 0.85 + (1 − merdiven ilerlemesi) × 0.45
                        tam askerlik 1.30 … gönüllü ordu 0.85

**Kod** — `src/game/recruitment.js:74`

```js
export function nationManpower(world, nationId) {
  let total = 0;
  for (const province of world.provinces ?? []) {
    if (province.owner !== nationId || !province.econ) continue;
    if (occupiedShareOf(world, province) > 0) continue;
    total += provinceManpower(world, province.center);
  }
  return total * (reformModifiers(world.nations?.[nationId]).manpower ?? 1);
}
```

**Çalışıyor mu?** **EVET** — 1.66 katı. Bu merdiven daha önce **hiçbir şeye
bağlı değildi**: oyuncu askerlik yasası çıkarıyor, hiçbir şey olmuyordu.

**Pratikte** — tam askerlikten gönüllü orduya geçmek havuzunu %35 küçültür
(1.30 → 0.85). Bedeli de var, ters yönde: tam askerlik alt sınıf moralinden
0.06 götürür. Yani "büyük ordu mu, mutlu halk mı" gerçek bir takas. İşgal
edilmiş taşra havuza **hiç** katkı vermez — savaşta toprak kaybetmek aynı
zamanda yedek kaybetmektir.

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

**Pratikte** — bir kareyi iki-üç yandan sar: genişlik 3'ten 5–7'ye çıkar ve
sayı üstünlüğün nihayet muharebeye girer. Sağ tıkın sonucu her zaman tek
satırla yazılır ("Order recorded… consolidating 1 more week"); sessiz tık
yok. 3 hexlik dar cephede dolu siperli yığın hâlâ kırılmaz (şans 0.66–0.71,
gereken 1.2): topçu, mühendis general, ya da iki yıl sonunda beyaz barış.
Bu, bilinçli WW1 dengesi; çözümü kuşatma yeterlilik mekaniği değil,
topçu/ikmal yıpratması olmalı (açık iş).

---

# 6. REFORMLAR — 18 merdiven, dokuz kanal

Reform ekranındaki her merdiven 0–1 arası bir "ilerleme"ye indirgenir, sonra
dokuz kanaldan birine (veya birkaçına) girer. Kanal listesi tam olarak budur;
başka bir yere bağlı değildirler.

**Kod** — `src/game/reforms.js:930`

```js
const representation = (p('vote_franchise') + p('voting_system')
  + p('political_parties') + p('upper_house') + p('public_meetings')) / 5;
const draft = 1 - p('conscription');       // merdiven TERS: 0 = herkesi al
const slaveryFree = 1 - p('slavery');      // 0 = serbest, 1 = yasak

const mods = {
  lowerMood: hours * 0.13 + safety * 0.07 + dole * 0.12 + pension * 0.10
    + health * 0.10 + child * 0.06 + wage * 0.11 + unions * 0.07
    + representation * 0.22 - draft * 0.06 - slaveryFree * 0.08,
  middleMood: rights * 0.09 + press * 0.07 + health * 0.02 + representation * 0.16,
  upperMood: -(wage * 0.05 + safety * 0.03 + unions * 0.04 + representation * 0.12),
  throughput: 1 - hours * 0.03 - safety * 0.012 - child * 0.012,
  wageCost: 1 + wage * 0.14 + unions * 0.05 + hours * 0.06 + safety * 0.04
    - slaveryFree * 0.10,
  socialBurden: dole * 0.10 + pension * 0.12 + health * 0.10 + school * 0.09,
  manpower: 0.85 + draft * 0.45,
  literacyFloor: school * 0.35,
  researchRate: press * 0.25,
  minorityCeiling: 0.7 + rights * 0.3,
};
```

| Kanal | Ne yapar | Besleyen merdivenler |
|---|---|---|
| `lowerMood` | alt sınıf memnuniyeti | çalışma saati, güvenlik, işsizlik, emeklilik, sağlık, çocuk işçi, asgari ücret, sendika, temsil, askerlik(−), kölelik(−) |
| `middleMood` | orta sınıf memnuniyeti | azınlık hakları, basın, sağlık, temsil |
| `upperMood` | üst sınıf memnuniyeti (hep eksi) | asgari ücret, güvenlik, sendika, temsil |
| `throughput` | fabrika üretim hızı | çalışma saati, güvenlik, çocuk işçi |
| `wageCost` | fabrika bordrosu | asgari ücret, sendika, çalışma saati, güvenlik, kölelik(−) |
| `socialBurden` | zorunlu sosyal gider | işsizlik, emeklilik, sağlık, okul |
| `manpower` | seferberlik havuzu | askerlik |
| `literacyFloor` | okuryazarlık TABANI | okul sistemi |
| `researchRate` | araştırma çarpanı | basın |
| `minorityCeiling` | yabancı kültür sadakat TAVANI | azınlık hakları |

## 6.1 Temsil — beş merdiven, tek karar

**Formül**

    temsil = (oy hakkı + seçim sistemi + partiler + üst meclis + toplanma) / 5
    alt sınıf   += temsil × 0.22
    orta sınıf  += temsil × 0.16
    üst sınıf   −= temsil × 0.12

**Çalışıyor mu?** **EVET — ama ancak birlikte.** Tek tek ölçüldüğünde her biri
gürültünün 1.24–1.41 katı (yani sınırda). **Beşi birlikte 4.58 katı.**

**Pratikte** — bu beş merdiven aslında **tek bir karardır**: "devletim ne
kadar temsil ediyor". Birini açıp diğerlerini kapalı tutmak paranı boşa
harcamaktır — siyasi bedelini ödersin, hissedilir bir karşılık almazsın.
Ya hepsini birlikte sür, ya hiçbirine dokunma. Karşılığı da net: halk memnun
olur, aristokrasi küser. Demokratikleşmek üst sınıfın memnuniyetinden
0.12 götürür ve üst sınıf senin sermayendir.

## 6.2 Okul yasası — taban, bütçe tavan

**Formül**

    okuryazarlık hedefi = max( bütçeden gelen hedef , okul yasası × 0.35 )

**Çalışıyor mu?** **EVET** — 4.34 katı. Bağlanmadan önce 0.90 katıydı, yani
oyuncu için yoktu.

**Pratikte** — yasa ile bütçe **toplanmaz**, büyüğü geçerlidir. Zorunlu eğitim
yasası çıkardıysan hazinen eğitime sıfır ayırsa bile okuryazarlığın %35'in
altına düşmez. Yani yasa bir **sigortadır**: savaşta bütçeyi kesersin,
okuryazarlığın çökmez. Ama tavanı yükseltmez — %35'in üstüne çıkmak istiyorsan
bütçe açman gerekir.

## 6.3 Basın — araştırmanın hızı

**Formül**

    araştırma puanı ×= (1 + basın özgürlüğü × 0.25)

**Çalışıyor mu?** **EVET** — haftalık araştırmayı %20.0 oynatıyor, gürültünün
4.00 katı.

**Pratikte** — sansürlü ülke aynı nüfusla, aynı okulla **%20 daha az araştırır.**
Otokrasi oynuyorsan bunu bilerek ödüyorsun; teknoloji lideri olacaksan basını
serbest bırakman gerekir. Basının ikinci etkisi orta sınıf moralinde (0.07).

## 6.4 Kölelik

**Formül**

    ücret maliyeti −= (kölelik yasak mı) × 0.10
    alt sınıf morali −= (kölelik yasak mı) × 0.08

**Çalışıyor mu?** **EVET** — 2.35 katı.

**Pratikte** — ters okunuyor, dikkat: **kölelik serbestken emek ucuzdur**
(bordro %10 düşük) ve kaldırmak sanayinin maliyetini büyütür. Ama serbest
kölelik alt sınıfı ezer. Yani ahlaki tercih burada ekonomik bir tercihtir de:
köleliği kaldırmak sanayine fatura çıkarır, halkına iyi gelir.

---

# 7. TEK SAYFA ÖZET

| # | Mekanik | Formül (kısa) | Çalışıyor? | Kaç kat |
|---|---|---|---|---|
| 1 | Vergi | gelir × oran × sınıf ağırlığı | EVET | 4.77× |
| 2 | Gümrük | ithalat × oran; girdi fiyatı ×(1+oran×ithal payı) | EVET | 1.47× |
| 3 | Ordu fonu | güç = 0.55 + fon×0.45 | EVET (savaşta) | contract §6 |
| 4 | Eğitim | (nüfus/10k) × bütçe × 0.34 | EVET | 11.83× |
| 5 | Refah | (nüfus/10k) × bütçe × 0.76 | EVET | 4.32× |
| 6 | Okuryazarlık | hedefe haftada binde 4 yaklaşır | EVET | zincirin içinde |
| 7 | Araştırma | (okuryazarlık×4 + orta×1.5 + katip + 1) × çarpanlar | EVET | 4.00× |
| 8 | Teknoloji maliyeti | 120 × (1+kademe×0.55) × erken ceza | EVET | kalibre |
| 9 | Memnuniyet | 0.35 + ödenebilirlik×0.5 − vergi×0.28 + refah×0.14 | EVET | omurga |
| 10 | İstikrar | memnuniyet − işgal − savaş − işsizlik×0.22 | EVET | omurga |
| 11 | Nüfus | beş çarpanın çarpımı; beslenme %50 altı kıtlık | EVET | ölçüldü |
| 12 | İşsizlik | (min(işçi,tezgâh) − istihdam) / tezgâh | EVET | tek kaynak |
| 13 | Fabrika ücreti | katma değer × 0.55 × reform çarpanı | EVET | +%8.8 |
| 14 | Ticaret | min(fazla, teklif); iştah = 1/(1+oran×1.6) | EVET | 1.47× |
| 15 | İdari gider | (şehir−1)^1.6 × 4.0 + nüfus^0.75 × 0.8 | EVET | kaldıraç değil |
| 16 | Taşra sadakati | tavan = azınlık hakları; üretim ×= sadakat | BAĞLI, hissedilmez | +%12.5 |
| 17 | İnsan gücü | havuz × (0.85 + askerlik×0.45) | EVET | 1.66× |
| 18 | Temsil (5 merdiven) | ortalama; alt +0.22, orta +0.16, üst −0.12 | EVET | 4.58× |
| 19 | Okul yasası | okuryazarlık tabanı = yasa × 0.35 | EVET | 4.34× |
| 20 | Basın | araştırma ×= (1 + basın×0.25) | EVET | 4.00× |
| 21 | Kölelik | bordro −%10, alt sınıf morali −0.08 | EVET | 2.35× |
| 22 | İşçi yasaları | mood + wageCost + throughput | EVET | 1.40–3.49× |
| 23 | Asgari ücret | işçi geliri +%8.8 | EVET | 2.95× |
| 24 | Sendika | işçi geliri +%5.2 | EVET | 1.93× |

---

# 8. BİLİNEN SINIRLAR

Bu kılavuz ne kadar ölçüldüyse o kadar doğrudur. Ölçülemeyenler:

1. **`armyFunding` barış arenasında ölçülemez.** Üç çıktısı da muharebe
   yolundadır; tarama savaşsız koşar (savaş toprağı değiştirir, o zaman iki
   kol arasındaki fark kaldıraca değil kimin kimi fethettiğine bağlanır).
   Yönü `audit:budget-contract` §6'da ayrıca doğrulanıyor.

2. **`political_rights` bağlı ama hissedilmiyor** (0.46×). Taşra gelirini
   +%12.5 artırdığı doğrudan ölçüldü. Kaba ölçütlerde görünmemesinin iki
   nedeni var: GSYH'nin kendi tohum gürültüsü %51.9 ve artan üretim dünya
   fiyatını düşürerek kendini kısmen yiyor.

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
