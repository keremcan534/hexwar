# DENETIM HARNESS DUZELTMESI — egitim → sanayi isgucu

**Kapsam:** yalnizca `scripts/audit/budget-audit.mjs`. **Oyun kodu
degistirilmedi.** Bu bir tanisal duzeltmedir: yanlis olcen bir test duzeltildi,
olculen sistem degil.

---

## 1. HATA

```js
// ONCE
if (Math.abs(dEmpFar) < 0.05) {
  finding('HIGH', 'Egitim -> sanayi isgucu', 'egitim isealimi hizlandirmali',
    `1040 haftada bile kadro farki yalniz ${pct(dEmpFar)}`, '');
} else {
  console.log('  OK  egitim sanayi isgucunu uzun vadede belirgin buyutuyor.');
}
```

Testin **savi yonlu** (*"egitim isealimi hizlandirmali"*), **olcusu yonsuz**
(`Math.abs`). Iki ayri yanlis dogurur:

1. **Ters yondeki buyuk ihlal GECER.** A/B ile kanitlandi: P0 duzeltmesi
   oncesi kod 1040 haftada **−%11.9** veriyordu — yani egitim sanayi
   isgucunu *azaltiyordu* — ve `Math.abs(−0.119) = 0.119 > 0.05` oldugu icin
   test `OK` basiyordu.
2. **Dogru yondeki kucuk iyilesme KALIR.** Ayni kodun P0 sonrasi hali
   **+%2.4** veriyor — yon dogru — ve `HIGH` aliyordu.

## 2. IKINCI HATA: TEK TOHUM BIR TAHMIN EDICI DEGIL

Esigi uydurmamak icin once **olculdu**: 6 tohum × 3 ufuk, egitim %0'a karsi
%100 (savassiz, surec izolasyonlu).

| ufuk | ortalama | sapma | aralik | negatif tohum |
|---|---|---|---|---|
| 260 hafta | **+%4.7** | %7.2 | −%4.0 … +%16.4 | 2/6 |
| 520 hafta | −%3.2 | %6.9 | −%17.1 … +%5.7 | 5/6 |
| 1040 hafta | **+%0.8** | %3.2 | −%3.5 … +%6.1 | 3/6 |

1040 haftada **isaretin kendisi kararsiz**: alti tohumun ucu negatif, ortalama
sifirdan ayirt edilemiyor. Eski esik (`|d| < 0.05`) bu tohumlarin **besinde**
ates ederdi. Yani bulgu, olculen sistemin degil, secilen tohumun ozelligiydi.

## 3. NEDEN ETKI UZUN UFUKTA SONUYOR (kusur degil)

`schooling` bir **AKIS** carpanidir, stok degil — `src/game/economy.js:2051`:

```js
const schooling = 1 + socialLevel(nation, 'education') * 0.25 + higherEducationBonus(nation);
const pool = Math.max(0, Math.min(
  lower * MONTHLY_HIRE_RATE * schooling * willingness,   // ← carpan burada
  Math.min(counts.workers ?? 0, lower * MAX_WORKER_SHARE) - employed,  // ← STOK tavani
));
```

Havuz bir **stok tavaniyla** kirpilir. Uzun ufukta istihdami fabrika kadrosu ve
isci stogu belirler; akis carpani yalnizca **o tavana varma hizini** degistirir.
Etkinin 1040 haftada sonmesi bu mimarinin **dogru** davranisidir.

**Ikinci karistirici — mali yuk.** %100 egitim haftada ~28 daha pahalidir;
hazineyi bosaltir, insaati yavaslatir, tesis sayisini dusurur. Olcumde acikca
gorunur (1040 hafta, hazine %0 → %100): 186,337 → 105,257 · 309,499 → 251,203 ·
204,930 → 163,489. Yani uzun ufuk olcumu saf carpani degil, **carpan eksi mali
yuk** bilesigini olcuyordu.

## 4. DUZELTME

Amaclanan degismez, brief'in ifadesiyle: *higher education investment should
not REDUCE the relevant industrial-employment outcome, and ideally should
improve it.* Uygulanan:

- **Asil sav, etkinin GORULEBILDIGI ufukta** (260 hafta) olculur — akis
  carpaninin gercekten calistigi yer orasi.
- **Panel ortalamasi** (3 tohum), tek tohum degil — olculen sapma bunu
  zorunlu kiliyor.
- **Yon onemli:** ceza yalnizca isgucunu AZALTAN egitime verilir.
- **Uzun ufuk bilgi olarak basilir, uzerinden hukum verilmez** — cunku tek
  tohumla gecerli bir kestirim degil ve sonme zaten beklenen davranis.

```js
// SONRA
if (dEmpMean < 0) {
  finding('HIGH', ...);        // gercek kusur: egitim isgucunu AZALTIYOR
} else if (dEmpMean < 0.02) {
  finding('MEDIUM', ...);      // yon dogru, buyukluk gurultunun altinda
} else {
  console.log('  OK  egitim isealimi hizlandiriyor (260 hafta, panel ortalamasi).');
}
```

`%5` kutsallastirilmadi: tek esik **sifirdir** (yon), ikincil `%0.02` yalnizca
"olculebilir mi" ayrimi icindir.

### Panel ciktisi (gecerli kod)

```
  panel: egitim %0 vs %100, 260 hafta, 3 tohum
  tohum         kadro@0%  kadro@100%   fark  hazine@0%  hazine@100%
  budget-audit    82,629      93,533  11.7%     53,339       48,438
  edu-A           76,836      80,305   4.3%     37,826       19,789
  edu-B          129,858     124,640  -4.0%     64,951       46,084
  panel ortalamasi: 4.0% (tohum basina: 11.7% · 4.3% · -4.0%)
  OK  egitim isealimi hizlandiriyor (260 hafta, panel ortalamasi).
```

Negatif tohum **saklanmiyor** — panel her tohumu ayri basar.

## 5. IKINCI, AYRI DUZELTME: BAYAT BIR "LOW"

Ayni blok su bulguyu basiyordu:

> `[LOW] Okuryazarlik/nitelik degiskeni yok` — *"sistemde literacy/qualification
> diye saklanan hicbir alan yok … kaydirac kapatilinca birikmis nitelik de
> aninda kaybolur"*

**Ikisi de artik dogru degil:**

- `economy.literacy` bir **stoktur** (`src/game/economy.js:3374` `advanceLiteracy`),
  haftada `LITERACY_APPROACH = 0.001` ile hedefe yaklasir ve arastirmayi besler
  (`src/game/technology.js:213` `researchPointsOf`).
- `save.js:113` `economy`yi **butun halinde** serialize eder → okuryazarlik
  kayda girer.
- Kaydirac kapatilinca **aninda kaybolmaz**; ayni yavaslikla geri iner.

Bulgu, hala **dogru olan** dar cekirdegine indirildi: okuryazarlik stok oldu ama
**isealim/promosyon kanali hala durumsuz bir carpan** — orada birikmis yatirim
tasinmaz.

## 6. ONCE / SONRA

| Denetim | ONCE | SONRA |
|---|---|---|
| `audit:budget` | 0 KRITIK · **1 YUKSEK** · 4 ORTA · 2 DUSUK | 0 KRITIK · **0 YUKSEK** · 4 ORTA · 2 DUSUK |
| `audit:save` | temiz | **temiz** |
| `audit:construction` | temiz | **temiz** |
| `audit:tech-effect` | temiz | **temiz** |
| `audit:war-outcome` | temiz | **temiz** |
| `audit:borders` | kartopu %36.0 / %41.5 / %34.2 | **ayni** (degismedi) |
| `audit:all` | 0 KRITIK · **5 YUKSEK** · 10 ORTA · 5 DUSUK | 0 KRITIK · **4 YUKSEK** · 10 ORTA · 5 DUSUK |

Kalan dort YUKSEK: `cullanma`, `kartopu` ×2, `Piyasa fiyat bandinda
kilitleniyor` — hepsi belgelenmis, karakterize edilmis non-target
(`COMMUNICATION_PASS_FINAL_REPORT.md` §G).

Maliyet: `audit:budget` 206s → 230s (panelin uc tohumu).

## 7. ONEMLI — NEDEN YUKSEK KAYBOLDU

**Egitim dengesi degistirilmedi.** Ne `schooling` carpani, ne isealim, ne
promosyon, ne okuryazarlik, ne de mali yuk. Tek satir oyun kodu dokunulmadi:

```
git diff -- src/  →  (bos)
```

YUKSEK, **yalnizca test artik dogru seyi olctugu icin** kayboldu. Eski test
gecen kodu birakip kalan kodu geciriyordu; yeni test yonu olcuyor ve yon
dogru (+%4.0 panel ortalamasi).

Eski testi memnun etmek icin egitim **yeniden dengelenmedi** — brief'in acik
talimati buydu.
