# TEKNOLOJI OYUNCU ETKISI — DENETIM (Faz 1)

**Dal:** `claude/technology-player-agency`, PR #4 head'inden (`e25a789`)
tureyerek. **Bagimlilik acik:** PR #4 henuz merge edilmedi; bu dal onun
uzerinde durur.

Bu belge **yalniz tespittir.** Hicbir tasarim uygulanmadi. Butun iddialar
`dosya:satir` ile ve olculen sayilarla desteklenir.

---

## 0. OZET HUKUM

Onceki denetim (`TECHNOLOGY_GAMEPLAY_AUDIT.md`) *"teknoloji diye bir sistem
yok, bir TAKVIM var"* diyordu. **Bu artik dogru degil** — o belgenin 1-7.
bolumleri `technology.js` yazilmadan onceki dunyayi anlatir (bkz. §1).

Bugunun hukmu farkli ve daha dar:

> **Teknoloji sistemi VAR, calisiyor ve durust. Ama yakiti 1860'ta kuruyor,
> yonu yok, ve yuzyilin son 40 yilinda arastirilacak hicbir sey kalmiyor.**

Uc olculen gercek:

1. **Yakit collapse'i.** 1860'ta medyan ulkenin egitim harcamasi **0**'a
   iner ve **kalan 85 yil boyunca orada kalir**. Okuryazarlik hedefi %8
   tabanina cakilir; arastirma hizi 2.0'dan 1.4'e duser. Arastirma motoru
   yuzyilin dortte ucunu bos depoyla gecirir.
2. **Yon yok, yalniz hiz var.** YZ **en ucuz** teknolojiyi secer
   (`technology.js:278`). Butun ulkeler ayni merdiveni ayni sirada tirmanir;
   ayrisma "kim daha ileri" ile sinirlidir, "kim farkli" degil.
3. **Icerik yuzyili kapatmiyor.** Yazilmis 30 teknolojinin tamami `industry`
   kategorisinde ve **1836-1905** araligini kapsar. Askeri, denizci, ticari
   ve kulturel kategoriler **bos**. 1905-1945 arasi (40 yil) teknolojik
   olarak **bostur**.

Oyuncu etkisi acisindan: secim **mevcut** (oyuncu teknolojiyi elle secer,
puan birikir, otomatik secilmez) ama secim **anlamsiz** — tek kategori,
tek merdiven, agirlikli olarak yuzdesel degistiriciler.

---

## 1. ONCEKI DENETIM NE KADAR GECERLI? (brief'in uyarisi)

Brief: *"Do not assume it is still current without verifying code."* Dogrulandi
— belgenin yarisi bayat:

| Bolum | Iddia | Bugun |
|---|---|---|
| §1 "Tek mekanizma `availableFrom`" | takvim tek belirleyici | **BAYAT** — `factoryUnlocked` artik ulkeye bakar (`economy.js:1471`) |
| §2 "Ulkeler ayrisamaz" | ayrisma imkansiz | **BAYAT** — arastirma kapiyi one ceker; ayrisma olculdu (§3) |
| §3 "Egitim teknolojiye hicbir sey" | bag yok | **BAYAT** — okuryazarlik arastirmanin ana terimi (`technology.js:222`) |
| §6 "Oyuncunun tek karari yok" | secim yok | **BAYAT** — Technology ekrani + `startResearch` var |
| §7 "YZ ayni takvimi bekler" | YZ karar vermez | **BAYAT** — `pickResearchAI` (ama en ucuzu secer) |
| EK §A okuryazarlik stok olmali | yapilacak | **YAPILDI** (`advanceLiteracy`) |
| EK §G adim 1-2, 4, 6 | yapilacak | **YAPILDI** |
| EK §G adim 3 (`unitAvailable`) | yapilacak | **YARIM** — fabrika evet, **birim HAYIR** |
| EK §G adim 5 (YZ secimi) | yapilacak | **YARIM** — secim var, strateji yok |
| EK §G adim 7 (kalan 4 kategori) | yapilacak | **YAPILMADI** |

Ayrica `technology.js:74` hala o belgenin "EK: UYGULAMA TASARIMI G bolumu"ne
atif yapar — atif gecerli, belge repoda duruyor.

---

## 2. ON BES SORU

### 1. Kanonik teknoloji durumu nedir?

Iki alan, ikisi de ulus basina:

- **`nation.research = { points, current, done[] }`** — tek gercek kaynak.
  `ensureResearch` kurar; `points` biriken arastirma puani, `current`
  yurumekte olan teknoloji id'si, `done` tamamlananlarin id listesi.
- **`nation.economy.techMods`** — turetilmis onbellek.
  `refreshTechModifiers` (`technology.js:231-243`) `done` listesini gezip alti
  degistiriciyi toplar. **Durum degil, ozet.**

Modul duzeyinde `INDEX` (`technology.js:136`) id → `{categoryId, folder,
level, tech}` haritasi ve `UNLOCKS` fabrika id → tech id haritasi tutar;
ikisi de sabit, ulusa bagli degil.

### 2. Teknolojik ilerlemeyi ne suruyor?

Haftalik tek cagri, `economy.js:3295-3320` icinde her canli ulus icin:

```js
advanceLiteracy(nation);            // okuryazarlik stogu hedefe yaklasir
ensureResearch(nation);
const isPlayer = nation.id === game.turns.playerNation;
if (!nation.research.current && !isPlayer) {
  const pick = pickResearchAI(nation, year);   // YZ: en ucuz
  if (pick) startResearch(nation, pick);
}
const done = advanceResearch(nation, year);
```

`advanceResearch` (`technology.js:259-271`): `points += researchPointsOf(nation)`,
maliyet dolunca `done.push`, `current = null`, `refreshTechModifiers`.

**Oyuncu icin otomatik secim YOK** — bilincli bir karar
(`economy.js:3301-3304` yorumu: eski davranis oyuncunun secimini eziyordu).

### 3. Ilerleme kuresel mi, ulusal mi, takvimsel mi?

**Hibrit: ulusal arastirma + kuresel takvim tabani.**

`factoryUnlocked` (`economy.js:1467-1473`) **VEYA** kapisidir:

```js
if (nation && techUnlocksFactory(nation, typeId)) return true;   // ulusal
return (FACTORIES[typeId]?.availableFrom ?? 0) <= turn;          // kuresel
```

Yani arastirma **kapiyi one ceker, acmaz**; takvim herkese eninde sonunda
verir. Bu tasarim kasitlidir ve iyidir: teknolojik ustunluk mumkun, kalici
geri kalma imkansiz.

**Ulkeler arasi yayilim (diffusion) mekanizmasi YOKTUR.** Yakalanmanin tek
yolu takvimdir.

### 4. Yuksekogretim su an neyi etkiliyor?

`higherEducationBonus(nation)` — **tam iki tuketici**:

| Yer | Etki |
|---|---|
| `economy.js:3380` | okuryazarlik **hedefini** yukseltir: `0.08 + schooling*0.62*(1+bonus)` |
| `economy.js:2052` | isealim carpani `schooling`e eklenir |

Yani yuksekogretim teknolojiye **dolayli** baglidir: okuryazarlik hedefi →
okuryazarlik stogu → arastirma puani. Bag gercek ama **tek yonlu ve zayif**;
arastirmaya dogrudan bir terim olarak girmez.

### 5. Okuryazarlik neyi etkiliyor?

Yalniz iki yer (UI disinda):

- **`technology.js:213-222`** — arastirma puanininin **ana terimi**:
  `base = literacy*4 + middleShare*1.5 + clerks + 1`, ve `clerks` yalniz
  `literacy >= 0.5` ise sayilir (Vic2 katip esigi).
- **`census.js:106`** — kohort okuryazarligi ulusal stoktan turer (gorunum).

`chronicle.js:105` acilis kesitine yazar (kayit, tuketici degil).

**Sonuc: okuryazarligin tek mekanik tuketicisi arastirmadir.**

### 6. Arastirma uretimi neyi etkiliyor?

Yalniz teknoloji tamamlama hizini. `researchPointsOf` → `advanceResearch`
disinda tuketicisi yok. Yan etkisi yok, baska sisteme akmaz.

### 7. Kullanilmayan arastirma birikir mi?

**EVET.** `advanceResearch`: `research.points += researchPointsOf(nation)`
kosulsuz calisir — `current` bos olsa bile. Tamamlamada `points -= cost`
(sifirlanmaz), artan bir sonrakine devreder. Kod yorumu acik: *"puan bosa
gitmez"* (`technology.js:257`).

Oyuncu icin bu kritiktir: secim yapmadan gecen haftalar **ziyan olmaz**.
Kor beta'da oyuncu 5671 RP biriktirmisti (B-018).

### 8. Hangi teknoloji etkileri var?

`TECH_MODS` — **alti**, hepsi yuzdesel (`technology.js:56-63`):

| Anahtar | Etiket | Kac teknolojide |
|---|---|---|
| `factoryThroughput` | Factory throughput | 11 |
| `inputEfficiency` | Factory input efficiency | 10 |
| `rgoOutput` | RGO output | 6 |
| `constructionPower` | Construction power | 6 |
| `supplyConsumption` | Army supply consumption | 4 |
| `researchRate` | Research speed | 1 |

Bir de **`unlock`** alani: 30 teknolojinin **7**'si fabrika acar.

### 9. Hangi etkilerin gercek tuketicisi var?

**Altisinin da var — olu degistirici YOK:**

| Anahtar | Tuketici |
|---|---|
| `rgoOutput` | `provinces.js:624` |
| `constructionPower` | `construction.js:298` |
| `factoryThroughput` | `economy.js:2182` |
| `inputEfficiency` | `economy.js:2190` |
| `supplyConsumption` | `economy.js:2911` |
| `researchRate` | `technology.js:223` (arastirmanin kendisi) |

`npm run audit:tech-effect` her anahtar icin kontrollu AC/KAPA olcumu yapar
ve **temiz** doner. Bu, gecmisteki "tuketicisiz degistirici" hastaliginin
kapatildigi anlamina gelir ve **korunmasi gereken bir kazanimdir**.

### 10. Hangi fabrikalar teknolojiyle aciliyor?

Yedi: `STEEL_MILL`, `MACHINE_PARTS_FACTORY`, `REFINERY`,
`ELECTRIC_GEAR_FACTORY`, `SYNTHETIC_OIL_PLANT`, `AUTOMOBILE_FACTORY`,
`TANK_FACTORY`. Kapi `techUnlocksFactory` → `factoryUnlocked` uzerinden.

### 11. Hangi askeri etkiler teknolojiyle aciliyor?

**HICBIRI.** Iki ayri bosluk:

- `unitAvailable(typeId, turn)` (`units.js:70`) **`nation` parametresi bile
  almaz** — birim tipleri yalniz takvimle acilir. `TANK_FACTORY` teknolojiyle
  gelebilir ama **tankin kendisi** gelmez.
- Askeri nitelikli tek degistirici `supplyConsumption`'dir ve o da
  **industry** agacindadir.

Yani askeri teknoloji **yoktur**. Bu, brief'in "1836 savasi 1905 savasi gibi
olmamali" hedefinin onundeki birinci engeldir.

### 12. Ulkeler teknolojik olarak ayrisiyor mu?

Kismen — **hizda evet, yonde hayir.** Olculdu (3 tohum, 1836→1945, medyan):

| Yil | en ileri | medyan | en geri | farkli tek kumesi |
|---|---|---|---|---|
| 1850 | 5-6 | 4-5 | 3 | 3-4 |
| 1875 | 14 | 10-11 | 8 | 7 |
| 1900 | 19-23 | 13-16 | 11-12 | 8-11 |
| 1925 | 24-29 | 16-20 | 14-15 | 9-11 |
| 1945 | **27-30** | **18-22** | **16-17** | 9-12 |

En ileri ile en geri arasinda 1945'te **11-14 teknoloji** fark var — gercek
bir liderlik merdiveni. Ama "farkli kume" sayisi ayrisma degil **ilerleme
farkidir**: herkes ayni sirayi izler, kimi daha uzaga gider. `pickResearchAI`
en ucuzu sectigi ve maliyet `level`'a bagli oldugu icin **sira fiilen
sabittir**.

### 13. YZ teknoloji karari veriyor mu?

Veriyor ama **stratejisi yok**:

```js
// technology.js:278 — "YZ secimi: en ucuz arastirilabilir teknoloji.
// Kasten basit — YZ'nin teknolojik olarak YASAMASI yeterli."
export function pickResearchAI(nation, year) { /* en dusuk techCost */ }
```

Ulke durumu (sanayi mi, tehdit altinda mi, zengin mi, egitimsiz mi)
**hic okunmaz**. Brief'in "AI MUST NOT: always choose cheapest technology"
maddesinin tam ihlali. YZ bedava teknoloji **almaz** — bu iyi; ayni motoru
kullanir.

### 14. Teknolojiler seciliyor mu, otomatik mi aciliyor?

**Oyuncu icin secilir** — `screens.js:2124` → `startResearch(me, id)`.
**YZ icin otomatik** — `economy.js:3308`. Oyuncunun arastirmasi bitince
`current = null` olur ve **oyuncu yeni secim yapana kadar bos kalir**;
puan birikmeye devam eder. Bitiste kalici bir bildirim kartı duser
(`economy.js:3313-3318`, `kind: 'RESEARCH'`, `ttl: 0`).

### 15. Kaydet/yukle teknoloji durumunu koruyor mu?

**Evet, tam.**

- `save.js:116` — `research: n.research ?? null` (points + current + done).
- `save.js:113` — `economy: n.economy` **butun halinde** → `literacy`,
  `literacyTarget`, `techMods` hepsi girer.
- Yukleme: `save.js:260` `nation.research = saved.research ?? null`,
  `save.js:253` `nation.economy = saved.economy ?? nation.economy`.
- `SAVE_VERSION = 15`; `npm run audit:save` **temiz**.

Yeni alan eklenirse `research` nesnesinin icine girmesi yeterlidir; ust
duzey ulus alani eklenirse `save.js`e **elle** yazilmalidir.

---

## 3. OLCULEN TABAN CIZGI — YAKIT COLLAPSE'I

Bu, bu denetimin **en onemli bulgusudur** ve tasarimi dogrudan kisitlar.

Olcum (2 tohum, medyan degerler, 1836→1945):

| Yil | egitim (medyan) | egitimi 0 olan ulke | okuryazarlik hedefi | okuryazarlik | istikrar |
|---|---|---|---|---|---|
| 1840 | **80** / 50 | 5 / 13 | %63.6 / %39.0 | %9.8 | 0.47 |
| 1860 | **0** | 17 / 24 | **%8** | %23.1 | 0.52 |
| 1880 | 0 | 21 / 26 | %8 | %19.9 | 0.63 |
| 1900 | 0 | 22 / 27 | %8 | %12.3 | 0.65 |
| 1920 | 0 | 22 / 26 | %8 | %9.5 | 0.67 |
| 1945 | **0** | **22/26 · 27/30** | **%8** | **%8.4** | 0.61 |

**Kok neden — `adjustSocialAI` (`economy.js:2558-2575`):**

```js
const broke = nation.gold < 60 || weekly < 0;
const step = broke ? -10 : rich ? 10 : 0;
const priority = economy.stability < 0.5
  ? ['welfare', 'health', 'education']
  : ['education', 'health', 'welfare'];
for (const id of broke ? [...priority].reverse() : priority) {
  if (step > 0 && current < 100) { economy.social[id] = current + step; return; }
  if (step < 0 && current > 0)   { economy.social[id] = current + step; return; }
}
```

Uc mekanizma birlikte tek yonlu bir cirit kurar:

1. `broke` sarti **cok kolay** doyar (`weekly < 0` tek basina yeter), `rich`
   sarti (`gold > 200`) zordur.
2. Istikrar 0.5'in altindayken ters sira **egitimi ILK keser**.
3. Dongu **ilk degisiklikte `return` eder** — yani haftada tek program
   oynar. Sifirdan 100'e cikmak on `rich` haftasi ister, tek `broke` haftasi
   geri alir.

Sonuc: yuzyilin **ilk 25 yilinda** egitim sifira iner ve bir daha kalkmaz.
Okuryazarlik hedefi `0.08 + 0*0.62 = 0.08` tabanina cakilir; stok
`LITERACY_APPROACH = 0.001` ile yavasca oraya iner.

**Teknoloji acisindan anlami:** `researchPointsOf`'un ana terimi
`literacy * 4`'tur. Okuryazarlik %8'e cakilinca bu terim **0.32**'ye duser ve
formul fiilen sabit tabana (`+1`) indirgenir. Olculen arastirma hizi bunu
dogrular: medyan **2.0 → 1.4**.

> **Bu bir teknoloji hatasi degil, YZ butce davranisidir.** Ama teknolojinin
> yakit deposudur ve oyuncu etkisi katmani bunun **uzerine** kurulacaktir.
> Dokunulup dokunulmayacagi Faz 2'nin karari; denetimin isi tespit etmekti.
> Onemli yan sonuc: **oyuncu, egitimi acik tutmakla tek basina teknoloji
> lideri olur** — ciddi bir avantaj, ama YZ'nin yarisamamasi ayrismayi
> sahte kilar.

## 4. ICERIK BOSLUGU

```
CATEGORIES: army(0) · navy(0) · commerce(0) · culture(0) · industry(30)
TOTAL: 30 teknoloji · yil araligi 1836-1905 · 7'si fabrika aciyor
```

- **Bes kategoriden dordu bos.** UI bunlari `disabled title="Not yet authored"`
  ile gosterir (`technologyScreen.js:64`) — durust, ama oyuncunun secenegi
  fiilen tek sutundur.
- **1905-1945 bostur.** Kampanya 1945'te (`FINAL_TURN = 5740`) biter; son
  **40 yil** boyunca arastirilacak yeni teknoloji yoktur. En ileri ulke
  1925'te zaten 24-29/30'a ulasir.
- Olcum bunu dogrular: 1925→1945 arasinda medyan yalniz 16-20'den 18-22'ye
  cikar; merdivenin ustu bitmistir.

## 5. SINIFLANDIRMA

| Parca | Sinif | Gerekce |
|---|---|---|
| `nation.research` veri modeli | **KEEP** | Kucuk, deterministik, kayda giriyor |
| Puan birikimi / devir (`points -= cost`) | **KEEP** | Oyuncuyu cezalandirmiyor; B-018'in cozumu |
| `techCost` (kademe × erken ceza) | **KEEP** | Takvimi ust sinir yapan dogru arac |
| `factoryUnlocked` VEYA kapisi | **KEEP** | "One ceker, acmaz" — ayrisma + geri kalmama |
| Klasor sirasi onkosulu (`canResearch`) | **KEEP** | Anlasilir, ucuz |
| 6 `TECH_MODS` + `audit:tech-effect` | **KEEP** | Tuketicisi olan, olculen etkiler; sahte etki yok |
| Kayit/yukleme | **KEEP** | Temiz |
| Arastirma hizi dokumu (oyuncuya) | **SURFACE** | Ekran yalniz ham `rate` gosteriyor; "neden bu kadar surüyor?" cevapsiz |
| Rakiplerle karsilastirma | **SURFACE** | "Neden baska ulke onde?" sorusunun hicbir cevabi yok |
| Okuryazarlik → arastirma zinciri | **SURFACE** | Gercek ama gorunmez; oyuncu egitimin ne satin aldigini bilmiyor |
| `unitAvailable` (`units.js:70`) | **CONNECT** | `nation` almiyor; askeri teknolojinin acacagi hicbir sey yok |
| Yuksekogretim → arastirma | **CONNECT** | Bag var ama yalniz okuryazarlik hedefi uzerinden; dogrudan terim degil |
| Vakayiname / kampanya sonu | **CONNECT** | Teknolojik kilometre taslari hic girmiyor |
| `pickResearchAI` (en ucuz) | **REDESIGN** | Brief'in acik yasagi; ayrismayi sahte kilan tek satir |
| Kategori icerigi (4 bos + 1905 sonrasi) | **REDESIGN** | Secim tek sutuna sikismis; yuzyilin son 40 yili bos |
| Etki paleti (6 yuzdesel knob) | **REDESIGN** | Brief: "+2% throughput teknoloji sistemi OLAMAZ" |
| — | **REMOVE** | **Yok.** Olu kod, olu degistirici, sahte etki bulunamadi. |
| Yon secimi (oncelik/program) | **MISSING** | Oyuncu "sirada ne" secer, "ne tur ulke olacagim" secemez |
| Askeri teknoloji | **MISSING** | Hicbir askeri yetenek teknolojiye bagli degil |
| Ulkeler arasi yayilim | **MISSING** | Yakalanmanin tek yolu takvim |
| YZ'nin egitime yatirim yapmasi | **MISSING** | Yakit collapse'i; YZ teknolojik olarak yarisamiyor |

## 6. TASARIMA GIREN KISITLAR

Faz 2'ye devredilen, olculmus kisitlar:

1. **Yuzyil butcesi ~20-30 teknolojidir** (medyan 18-22, lider 27-30). Brief'in
   "40-60 anlamli teknoloji" hedefi ya arastirma hizinin artmasini ya da
   maliyetlerin dusmesini gerektirir — **veya** hedef bu olcume gore
   asagi cekilmelidir. Uydurulmamali, olculmeli.
2. **Karar sikligi zaten dogru bandda.** ~20 teknoloji / 109 yil ≈ **5 yilda
   bir karar**. Brief "birkac yilda bir" istiyordu; mevcut tempo hedefte.
   Yeni tasarim bunu **bozmamali** (kategori basina paralel arastirma
   sikligi dortе katlar).
3. **Yakit collapse'i cozulmeden ayrisma sahte kalir.** YZ egitimi 1860'ta
   birakiyorsa hicbir YZ teknoloji lideri olamaz.
4. **1905 sonrasi icerik yoksa "yuzyil degisiyor" hissi 1905'te durur.**
5. **`audit:tech-effect`'in temizligi korunacak:** eklenen her etkinin
   kontrollu AC/KAPA testi olmali (brief: "NO FAKE EFFECTS" — mutlak).
6. **Ekonomik zamanlama riski:** fabrika kapilarini one cekmek mal
   fiyatlarini ve kitliklari kaydirir. Onceki denetimin uyarisi gecerli —
   her adimda `audit:long-run` ve `audit:market` taban cizgisiyle
   karsilastirilmali.

---

## 7. OLCUM ARACLARI

Bu denetimin sayilari su gecici betiklerle uretildi (repoya girmedi; kalici
denetim Faz 15'te yazilacak):

- `tech-pacing.mjs` — 3 tohum × 1836-1945; tamamlanan teknoloji, ayrisma,
  hiz, okuryazarlik.
- `edu-decay.mjs` — 2 tohum; egitim harcamasi, istikrar, okuryazarlik hedefi.

Kod tarafi iddialarin tamami dogrudan kaynak okunarak dogrulandi; ayrica
bes paralel izleme ajani ve her iddia icin bagimsiz bir carpitma denetimi
kosuldu.
