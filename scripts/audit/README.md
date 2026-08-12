# scripts/audit — davranış denetimi

Bu klasör **üretim kodu değildir** ve `src/` altına hiçbir şey sızdırmaz.
Amacı tek: bir mekaniğin yazılmış olması ile *bağlı* olması arasındaki farkı
ölçmek. Sonuçlar [SYSTEM_AUDIT_REPORT.md](../../SYSTEM_AUDIT_REPORT.md)'de.

```bash
npm run audit:all              # hepsi (~30 dk)
npm run audit:all -- tax market  # adında geçenler
npm run audit:tax              # tek denetim
```

## Ölçüm kuralları

**1. Her senaryo kendi sürecinde işler.** `units.js`'teki `nextId` sayacı modül
düzeyindedir ve dünyalar arasında sıfırlanmaz; `command.js` ise
`(turn + unit.id) % cadence` ile hangi tümenin o hafta taarruz edeceğine karar
verir. Aynı süreçte kurulan ikinci dünya, aynı tohumla bile başka bir oyundur.
Bu ölçülmüş bir bulgudur (bkz. `determinism-audit.mjs`), varsayım değil — ve
karşılaştırmalı ölçümün neden `runScenario` üzerinden gitmesi gerektiğinin
sebebidir.

**2. Ekonomik kaldıraçlar savaşsız ölçülür** (`runPeaceful`). Savaş toprağı,
toprak nüfusu, nüfus her şeyi değiştirir; o zaman iki koşunun farkı artık
kaldıraca değil kimin kimi fethettiğine bağlanır. İlk koşuda aynı refah testinin
iki seviyesi 575K ve 954K nüfusla bitiyordu.

**3. Kaldıraç her hafta tazelenir.** `runPolitics → applyGovernmentLimits` gümrük
ve ordu kaydıraçlarını iktidar partisinin bandına geri kırpar; seçim de bandı
değiştirebilir. Haftada bir yazmazsak "tarife −50" diye etiketlenen koşu aslında
−15'te işler.

**4. Ölçülen ülke oyuncu yapılır** (`asPlayer`), yoksa `adjustFiscalAI` /
`adjustSocialAI` kurduğumuz değeri her hafta partinin tercihine geri sürükler ve
iki koşu aynı yere yakınsar: kaldıraç ölü görünür ama aslında ölçümü YZ ezmiştir.
Savaş ekonomisi testleri bunun istisnasıdır (`asPlayer: false`) — orada YZ'nin
birim satın alma ve borçlanma kararlarının devrede olması gerekir.

## Dosyalar

| Dosya | İş |
|---|---|
| `harness.mjs` | Başsız dünya, `runPeaceful`, değişmez tarayıcı, tablo/rapor biçimleme, `runScenario` (süreç izolasyonu) |
| `scenario-runner.mjs` | Tek senaryoyu kendi sürecinde işletir; JSON tanım, adlandırılmış mutasyonlar, ölçüm seçicileri |
| `run-all.mjs` | Bütün denetimleri sırayla işletir, şiddet düzeyine göre özet çıkarır |
| `*-audit.mjs` | Denetimler (bkz. rapordaki test envanteri) |

## Senaryo tanımı

```js
runScenario({
  seed: 'tohum',
  warmup: 60,          // ölçümden önce işletilecek hafta
  weeks: 260,          // ölçüm penceresi
  peaceful: true,      // savaşsız koşu
  asPlayer: true,      // YZ maliye kararları devre dışı
  nation: 'factories', // 'factories' | 'first' | 'protectionist' | <id>
  levers: [{ key: 'tax', value: 100, classId: 'lower' }],
  //        raw: true  -> politika bandını aşan SINIR testi (doğrudan yazım)
  mutations: [{ name: 'forceWar', args: { foes: 3 } }],
  repeatMutations: [], // her hafta yeniden uygulanır
  trace: 52,           // her N haftada bir ara ölçüm
  watchInvariants: true,
  measure: ['army', 'war', 'market', 'factories', 'construction',
            'nations', 'trade', 'prices', 'invariants', 'trace',
            'taxEfficiency', 'control'],
});
```

Yeni bir uç senaryo gerekiyorsa kodu `scenario-runner.mjs` içindeki `MUTATIONS`
tablosuna adlandırılmış bir fonksiyon olarak ekleyin — senaryo tanımı JSON
kalmalı ki süreçler arasında taşınabilsin.

## Bulgu bildirme

```js
finding('HIGH', 'Mekanik adı', 'beklenen davranış', 'ölçülen davranış', 'kanıt/kök neden');
```

Şiddet düzeyleri: `CRITICAL` (simülasyonu bozar), `HIGH` (mekanik yanlış
çalışıyor), `MEDIUM` (denge/entegrasyon), `LOW` (tutarsızlık). `run-all.mjs`
çıkış kodu KRİTİK + YÜKSEK sayısına bakar.
