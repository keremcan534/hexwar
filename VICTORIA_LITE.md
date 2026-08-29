# VICTORIA LITE — yön belgesi

Bu bir plan değil, bir **ölçüt**. Her mekanik geçişi buna göre yargılanır.
`BUDGET_ANALYSIS.md` + `BUDGET_SIMPLIFICATION_RESULT.md` bu ölçütün ilk
uygulamasıdır; yöntem orada denendi ve işledi.

## Hedef tek cümlede

Victoria'nın **dünyası**, Victoria'nın **ev ödevi** olmadan.

## Ayrım: derinlik ile işletme aynı şey değil

Bu ayrım belgenin tamamıdır. Karıştırılırsa iki kötü sonuçtan biri çıkar:
ya içerik budanır ve sığ bir oyun kalır, ya işletme korunur ve muhasebe
programı olur.

| DERİNLİK — korunur | EV ÖDEVİ — silinir |
|---|---|
| 42 mal, 29 fabrika tipi, 65 teknoloji, 21 reform | tesis tesis düğme, birim birim emir |
| sınıflar, okuryazarlık, göç, siyasi destek | bunları ekranda ondalık sayı olarak okumak |
| sistemler arası nedensellik | aynı kararı üç kaydıraçla vermek |
| dünyanın kendi kendine değişmesi | oyuncunun her hafta aynı bakımı yapması |

İçeriğin genişliği hikâye üretir. İşletmenin genişliği yalnızca tık üretir.

## Ölçülen durum (2026-08, `experiment/simple-budget`)

- Ekranda basılan ondalık sayı: **151**
- 15 ekranın **6'sında hiç etkileşim yok** (salt okunur tablo)
- `tradeScreen` + `render_trade`: **~790 satır, 1 etkileşim**
- `populationScreen`: **593 satır, 7 etkileşim**
- Tesis başına düğme türü: **7** — 40 fabrikalı oyuncu için 280 düğme

## Üç test

Her mekanik, her kaydırac, her ekran sayısı bunlardan geçer.

### 1. Gürültü testi *(bütçe geçişinde kuruldu)*
Aynı senaryo, altı farklı tohum, hiçbir şeye dokunulmadan koşulur; her
çıktının kendi kendine ne kadar oynadığı ölçülür. Bir kaldıracın **bütün
menzili** o gürültünün altındaysa, oyuncu onu asla hissedemez.
Ölçülen taban: hazine %50.8 · GSYH %51.9 · nüfus %39.1 · needsMet %26.5 ·
istikrar %5.5 · memnuniyet %5.3.
→ Altında kalan: **birleştir veya sil.** (`adminFunding` 0.012×, `health` 0.043×)

### 2. Ev ödevi testi
Oyuncunun işi, sahip olduğu nesne sayısıyla büyüyor mu?
İki fabrikayla iki tık, kırk fabrikayla kırk tık ise bu **işletmedir**.
→ Politikaya çevir. Oyuncu *niyet* söyler, sistem uygular.
(Bütçede `subsidyPolicy` böyle gitti: artık tek kural, herkese aynı.)

### 3. Cümle testi
Ekrandaki sayı bir cümleye çevrilebiliyor mu?
`middleShare 0.213` değil, "orta sınıf büyüyor, liberaller güçleniyor".
→ Çevrilemiyorsa ya bir karara girdidir (kalsın, dökümüyle birlikte) ya da
ekranda işi yoktur.

## Değişmezler — geçişten geçişe taşınır

1. **Bir kavramın tek doğrusu olur.** Bütçede dört "haftalık bakiye" vardı.
2. **Sayı üreten, onu gösterendir.** Ekran hiçbir simülasyon formülünü
   yeniden kurmaz; alan katmanı bir döküm fonksiyonu verir
   (`budgetBreakdown`), ekran onu basar. Yeniden kuran ekran mutlaka sapar.
3. **YZ ile oyuncu aynı kapıdan geçer.** Tek setter, tek sınır tablosu.
   Gizli YZ tavanı yoktur.
4. **Her kaldıracın bir faydası, bir bedeli, bir de sonucu vardır.** Üçü de
   ekranda yazar.
5. **Simülasyon oyuncudan derin olabilir, ekran olamaz.**

## Sıra — ölçüme göre

Oyun ikiye ayrılmış durumda ve bütün matematik bir yarıda:

| Küme | Sim | UI | Etkileşim | Durum |
|---|---|---|---|---|
| **Sanayi + Şirketler** | ~1.900 | ~810 | 21 | tesis tesis işletme |
| **Ticaret / piyasa** | ~420 | ~790 | 1 | salt okunur tablo |
| **Nüfus / sayım** | ~740 | ~590 | 7 | salt okunur tablo |
| Reform · Ordu · İnşaat · Teknoloji | ~4.300 | ~1.180 | 30 | gerçek karar, dokunma |
| Bütçe | — | 115 | 5 | **bitti** |

İlk üç küme ~3.000 sim + ~2.200 UI satırıyla 29 etkileşim üretiyor ve
bunların çoğu mikro iş. Geçiş sırası buradan çıkar; her biri ayrı bir pass,
ayrı bir dal, ayrı bir rapor — bütçede olduğu gibi.

## Yöntem (bütçede denendi, tekrarlanır)

1. Kaynaktan tersine mühendislik — tahmin değil, satır numarası.
2. Gürültü tabanını **önce** ölç.
3. Muhasebeyi doğru yap, sonra kaldıraçları sadeleştir. (Ters sıra işlemez:
   yanlış defter üstünde denge ölçülemez.)
4. Her iddiayı bassız koşuyla kanıtla.
5. Gerçek tarayıcıda oyna.
6. Tek rapor, açık bilinen sorunlar listesi.
