# scripts/audit — davranış denetimi

Bu klasör **üretim kodu değildir** ve `src/` altına hiçbir şey sızdırmaz.
Amacı tek: bir mekaniğin yazılmış olması ile *bağlı* olması arasındaki farkı
ölçmek. Sonuçlar [SYSTEM_AUDIT_REPORT.md](../../SYSTEM_AUDIT_REPORT.md)'de.

```bash
npm run audit:all              # hepsi (~30 dk)
npm run audit:all -- econ save  # adında geçenler
npm run audit:econ             # tek denetim
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

**5. A/B dondurulmuş kopyada koşar.** Paralel oturumlar src'yi değiştirirken
aynı tohum %6.1'den %5.1'e kaydı (audit:homeland, 2026-10-15). Karşılaştırmalı
her ölçüm `snapshot.mjs` ile alınan kopyada koşar; iki kolun farkı ancak iki
kol da aynı kodu koşarsa kolun etkisidir:

```bash
node scripts/audit/snapshot.mjs create p0-base --root <kazı-klasörü>   # çalışma ağacı, işlenmemiş değişiklikler dahil
node scripts/audit/snapshot.mjs run p0-base homeland --root <kazı-klasörü>
node scripts/audit/snapshot.mjs list --root <kazı-klasörü>
```

Kopya `git ls-files --cached --others --exclude-standard` listesidir (silinen
dosyalar hariç, `assets/` ve `trailer/` hariç; `--full` onları da alır).
`SNAPSHOT.json` HEAD'i, işlenmemiş yolları ve içerik özetini taşır. Var olan
kopyanın üzerine yazılmaz (`--force` ister). Git'e hiçbir şey yazılmaz.

**6. Boş geçiş ve olmayan mekanik.** Her test önce kendi olay sayısının
sıfırdan büyük olduğunu doğrular (`harness.requireEvents`); sıfırsa test
"vacuous" diye YÜKSEK bulgu düşer, "DOĞRU" basmaz. Mekaniği henüz olmayan test
`harness.skip` ile **SKIP (not present)** basar — asla geçti değil. Mekanik
varlığı dışa aktarımın kendisinden okunur (ör. `nationBirth.releasePeople`,
`movements.MOVEMENT.BRINK`, `mobilization.LEVEE`); denetimler src modüllerini
ad alanı olarak alır ki silinen bir dışa aktarım denetimi çökertmesin.

## Dosyalar

| Dosya | İş |
|---|---|
| `harness.mjs` | Başsız dünya, `runPeaceful`, `passivePlayer` (AUTO'ya bırakan oyuncu), değişmez tarayıcı (yeniden tasarım alanları korumalı), tablo/rapor biçimleme, `runScenario`/`runScenariosParallel`/`runWorkers` (süreç izolasyonu, havuz), `skip`/`requireEvents` |
| `scenario-runner.mjs` | Tek senaryoyu kendi sürecinde işletir; JSON tanım, adlandırılmış mutasyonlar, kaldıraçlar, ölçüm seçicileri |
| `snapshot.mjs` | Dondurulmuş kopya: oluştur, içinden denetim koş, listele |
| `peoples-observer.mjs` | Halk kanalı gözlemcisi: sahiplik değişiminin kanalı (savaş/barış/LIBERATE/birleşme/halk), hak verme, kriz, taviz, konum payları, bırakma çiftleri, kabulün anlık kazancı |
| `sim-fingerprint.mjs` | `TOHUM HAFTA [sütun satır]` → eski alanların (`worldFingerprint`) ve yeni alanların (`extendedFingerprint`) özeti; "davranış değişmedi" kanıtı |
| `run-all.mjs` | Bütün denetimleri sırayla işletir, şiddet düzeyine göre özet çıkarır; çöken denetim KRİTİK (COKTU), özetsiz biten YÜKSEK sayılır |
| `*-audit.mjs` | Denetimler (bkz. rapordaki test envanteri) |
| `peoples-audit.mjs` | `npm run audit:peoples` — dünya üretimi (ENC, ≥%2 halk, ulus-devlet, yanlış ana halk, kimlik izi) + kampanya (5 yıllık kova: hak, kriz, Dominion, ayaklanma, LIBERATE, çöküş, konum payları, SG) |
| `war-support-audit.mjs` | `npm run audit:war` — savaş haftasına göre irade/yorgunluk, zorla yasa düşüşü, 3. kademe, barış imzaları, devrim, levée; `--arm leveeOff` |
| `resource-balance.mjs` | 160×96 tam kampanya, beş yılda bir kaynak başına arz/ihtiyaç, teklif/talep, fiyat ve kıt ulus payı (geç oyun dengesi; audit:econ 10 yıl koşar) |
| `bar-probe.mjs` | Çubuk kalibrasyon sondası; kollar ortam değişkeniyle |

Uzun denetimler (homeland, peoples, war) tohumları kendi süreçlerinde paralel
koşar; eşzamanlı süreç sayısı `AUDIT_JOBS` ile sınırlanır (varsayılan çekirdek − 2).
peoples ve war `run-all`'a girmez (her biri üç tam 160×96 kampanya); paket
kabullerinde ve birleşik kontrolde (J2) ayrıca koşulur.

## Senaryo tanımı

```js
runScenario({
  seed: 'tohum',
  warmup: 60,          // ölçümden önce işletilecek hafta
  weeks: 260,          // ölçüm penceresi
  peaceful: true,      // savaşsız koşu
  asPlayer: true,      // AUTO kapalı: YZ kaldıracı geri sürükleyemez
  nation: 'industry',  // 'industry' (en çok sanayi) | 'median' | 'first' | <id>
  levers: [            // kilitsiz ve bedelsiz yazılır, her hafta tazelenir
    { law: 'labour', index: 2 },          // yasa kademesi
    { line: 'rifles', priority: 'high' }, // hat önceliği (ya da weight: 0-10)
    { feed: 1.15 },                       // halkın doyurma kolu (elle) ya da 'auto'
    // yeniden tasarım kaldıraçları — API yoksa koşu { skip } döner:
    { course: { x: 1, y: -1 }, budget: 0.30 }, // politics.setCourse (D4)
    { nationalities: 'accommodate' },     // politics.nationalities (D1)
    { grant: 'subject' },                 // %15-25'lik tebaa halka bir kez hak ('none' = kontrol)
    { warLawLock: 'on' },                 // savaşta zorla yasa düşüşü geri yazılır ('off' = eski kural)
    { tier3: 'redesign' },                // 3. kademe 0.65/0.6 + toplam savaş ('base' = 0.8/0.7)
    { levee: false },                     // mobilization.LEVEE.enabled (D6)
    { consent: false },                   // provinces.CONSENT.enabled (D8)
  ],
  // setFund, nudgeFund (fondan, defterle), freezeDevelopment, forceWar,
  // drainManpower, damageArmy, stripEquipment, floodEquipment, depositScale…
  mutations: [{ name: 'forceWar', args: { foes: 3 } }],
  repeatMutations: [], // her hafta yeniden uygulanır
  trace: 52,           // her N haftada bir ara ölçüm
  watchInvariants: true,
  measure: ['army', 'war', 'market', 'nations', 'invariants', 'trace',
            'control', 'unrest',
            'warlaws',   // dünya: savaş haftalarında Extensive/TM/TWE payı, savaş dönemi p50
            'support',   // ölçülen ulusun parti desteği
            'peoples',   // halk kanalından kaybedilen küme, tebaa payı, dünya konum payları
            'invasion'], // işgal payı, başkent, savaş haftası
  // nation: 'industry' | 'median' | 'largest' | 'subject-people' | 'first' | <id>
  // mutations: forceInvasion (en güçlü temaslı komşu ölçülen ulusa savaş açar)
});
```

Ölçüm `snap` alanı `harness.snapshotNation`dır: fon ve tabanı, çıktı,
faturalar ve ödeme payı (`supplyShare`), çubuğun halk/kalkınma payları,
ordunun çektiği (`militaryIC`) ve yasanın tavanı (`militaryCap`), kalkınma.

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
