# CORE STABILIZATION LOG

Amac: ekrandaki sayilara GUVENILEBILIR olsun. Muhasebe once, denge sonra.

## FAZ 0 — Taban cizgisi (83d88f6, calisma agaci temiz)

Tam takim (`audit:all`, bu commit uzerinde, ayni gun): **0 KRITIK · 7 YUKSEK ·
16 ORTA · 5 DUSUK**. Ilgili YUKSEK'lerin taban kaniti:

| bulgu | olcum (taban) | denetimin kok-neden ipucu |
|---|---|---|
| Isci cift sayimi (factory) | ulusal fabrika kadrosu > `workers` sayaci: **8,690 kisi**; en kotu province 53:41 → kadro 12,797 vs nufus 8,989 | "kadro ULUSAL havuzdan dagitilir ama `province.industrialEmployees` yerel nufusa karsi dogrulanmaz; `rgoLaborScale` bunu kirsal nufustan dusuyor, **negatif olabilir**" |
| Kohort muhasebesi (population) | en kotu sapma **5,000 kisi** (kohort toplami ≠ meslek sayaclari); yuvarlama farki ≤%3.5 (`reconcilePopulation` tabana yuvarlar, artik hicbir meslege yazilmaz) | |
| POP gelir defteri (population) | `income` ile `needsBudget` bagimsiz; kimlik sapmasi **%657.6**; hane harcamasi geliri **1.9x** asiyor | income = incomePool×agirlik (uretim degeri); needsBudget = nufus×sepet×ucret endeksi×(1−vergi) |
| Cullanma (war-pressure) | azami eszamanli saldirgan 4 (esik 3) | |
| Kartopu (border-change) | 50 yilda kume devri %39.0 / %33.5 (esik %33.3; budama oncesi %33.2-34.2) | |
| Fiyat bandi kilidi (long-run) | 1040h'de mallarin ~%57-62'si bantta; DYE_WORKS hic kurulmuyor | orta katman sanayi kurulmuyor |
| (7.) population MEDIUM notu | barista 4/60 haftada toplam insan dustu (en buyuk −227) | alay draws kaydi vs cekilen insan farki |

Ayrica ayni head'de bulgusuz: determinism, save, construction, tech-effect,
war-outcome, legacy, debt, military, tariff. Dogal acilis sorunu (FAZ 6):
duman oyununda ¤50 acilis kasasi her anlamli eylemin (¤70-120+) altindaydi,
teste ¤800 enjekte edilmisti — dogal acilis DOGRULANMADI.

Bu oturumun oncelik sirasi: (1) isci/kohort/gelir muhasebesi, (2) dogal
acilis + borc, (3) uzun kosular, (4) ancak ondan sonra fiyat bandi /
cullanma / kartopu.

## Duzeltme kayitlari

(asagiya her duzeltme icin: PROBLEM / ETKI / KOK NEDEN / DOSYALAR /
DEGISIKLIK / DEGISMEZ / TEST / ONCE / SONRA / KALAN RISK)

### 1. Isci cift sayimi (FAZ 1) — YUKSEK kapandi

- **PROBLEM:** Σfabrika kadrosu > `professionCounts.workers` (8.690 kisiye
  kadar); ayrica fabrika province'inde kadro yerel nufusu asarken fazlasi
  hicbir yerden dusulmuyordu (12.797 kadro / 8.989 nufus).
- **ETKI:** Ayni insan hem fabrikada calisir hem baska meslekte sayilirdi;
  ucret, issizlik ve RGO kirsal emegi yanlis tabandan hesaplaniyordu —
  komsu provinsler "hayalet kirsal" ile tam RGO isletiyordu.
- **KOK NEDEN (sonda ile olculdu, `worker-probe`):**
  1. *Kurulus:* `ensureInitialMilitaryIndustry` kadrolari (5×1000) meslek
     sayacina hic sorulmadan atiyordu — 1. haftada 5.000 kadro / 4.000 isci.
  2. *Kucultme:* `reconcilePopulation` nufus dusunce EN KALABALIK meslekten
     kohort siler (cogu zaman `workers`) ama tesis kadrosuna dokunmaz
     (260 haftada 11 kez ihlali buyuttu).
  3. *Yukselme:* `runPromotion` en kalabalik alt meslekten kohort alir —
     yine `workers` — kadro yerinde kalir (2 kez).
  Ise alim tavani (`counts.workers − employed`) yalniz alim aninda calisir.
- **DOSYALAR:** `src/game/economy.js`, `src/game/provinces.js`,
  `scripts/audit/factory-audit.mjs`, `scripts/audit/labor-audit.mjs` (yeni).
- **DEGISIKLIK:** `alignWorkforce(nation)` — acik once ciftci kohortundan
  kapanir (fiilen fabrikada calisan nufus ISCIDIR; ayni sinif, sinif
  toplamlari degismez), isci gercekten kalmadiysa kadro oransal kuculur.
  Cagri noktalari: kurulus sanayii, `reconcilePopulation`, mobilite.
  Mekansal taraf: `runFactories` banliyo duzeltmesi — yerel nufusu asan
  kadro fazlasi ulkenin diger provinslerine nufus oraninda
  `industrialCommuters` olarak yazilir; `provinces.ruralPopulation` kirsali
  `pop − min(kadro, pop) − banliyo` olarak hesaplar (RGO ve gelisme baskisi
  ayni yardimciyi kullanir). Alan `{...econ}` ile kayda kendiliginden girer.
- **DEGISMEZ:** I1 Σkadro ≤ workers; I2 kadro ≤ kapasite; I3 negatif emek
  yok; I4 Σsayac = cohortPopulation; I5 dunya: Σ(yerel fazla) ≈ Σbanliyo.
- **TEST:** yeni `audit:labor` (260 hafta surekli + A-G kontrollu senaryolar:
  fabrikasiz/yeniden cekirdekleme, tek tesis, emege yarisan tesisler, tesis
  kapanisi, hizli buyume, yuksek issizlik, emek kitligi) — bulgusuz.
  `audit:factory` yerel-nufus kontrolu korunum kimligine cevrildi (fazla ≈
  banliyo; ulke bazli gruplama isgal karisiminda yaniltici, DUNYA duzeyinde).
- **ONCE:** ihlal 1. haftada baslar, 260. haftada ulke basina 4.900'e cikar;
  denetimde 8.690. **SONRA:** 260 haftada ihlal 0; `audit:factory` YUKSEK'i
  ve "YZ subvansiyonla batiyor" ORTA'si kapandi; determinism + save temiz.
- **KALAN RISK:** banliyo bir haftalik tazeleme kaymasi tasir (olculen sapma
  4.192'de 358, tolerans %10); ayni econ'a iki AYRI ulkenin fabrikasi
  yazarsa son yazan kazanir (onceden de boyleydi, nadir).
