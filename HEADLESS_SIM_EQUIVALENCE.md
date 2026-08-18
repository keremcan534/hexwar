# HEADLESS SIM EQUIVALENCE — bulut/bassiz kosu ile tarayici birebir mi?

Soru: bassiz (Node) simulasyon tarayicidaki oyunla AYNI oyunu mu oynuyor,
yoksa hiz icin adim mi atliyor? Varsayim yok, iki yonde de olcum var
(FAST = WRONG de FAST = CORRECT de pesinen kabul edilmedi).

## Duzenek

- Ayni tohum (`EQV-1`), ayni dunya boyutu (78×62), ayni oyuncu kosulu
  (`playerNation = -1`, tam YZ dunyasi), ayni ilerletme yolu
  (`beginTurnJob()` + `pumpTurn()` — canli oyunun dilimli tur yolu).
- Tarayici tarafi GERCEK ortam: Chromium (Playwright), gercek DOM, gercek
  renderer, `window.game` uzerinden — dev sunucudan yuklenen ayni kod.
- Iki taraf da parmak izini AYNI modulden hesaplar
  (`scripts/audit/fingerprint.mjs`, tarayici dev sunucudan dinamik import
  eder). "Esitlik" iki ayri formulun tesadufu olamaz.
- Parmak izi kapsami: tur sayaci; ulke basina altin/borc/nufus/fabrika/
  istikrar/sohret/kapasite/egitim/bina/general/okuryazarlik/arastirma; tum
  birimler (tip, sahip, konum, HP); sehirler (sahip, nufus); savas cifti
  sayisi; SIRALI pazar fiyatlari (4 basamak); aktif muharebe sayisi.
  FNV-1a ozetiyle karsilastirilir, uyusmazlikta alan alan diff icin tam
  metin saklanir.

## Sonuc — dort kontrol noktasinin dordunde birebir

| hafta | bassiz (Node) | tarayici (Chromium) | esit? |
|---|---|---|---|
| 52 | `ae799449` | `ae799449` | ✔ |
| 260 | `4c580ea6` | `4c580ea6` | ✔ |
| 520 | `84603f54` | `84603f54` | ✔ |
| 1300 | `952b0c32` | `952b0c32` | ✔ |

1300 hafta (25 yil) sonunda dunya durumu bayt bayt ayni ozete iniyor:
hicbir faz atlanmiyor, hicbir sira farki birikmiyor.

## Hiz

| ortam | 1300 hafta duvar saati | hafta/saniye |
|---|---|---|
| bassiz (Node) | 48.6 s | 26.7 |
| tarayici (Chromium) | 57.3 s | 22.7 |

Fark ~%15 ve tamamen ortam yuku (DOM, canvas, event dongusu). Bassiz kosu
"hizli ama farkli" degil; ayni islem sirasinin tasitsiz halidir.

## Neden yapisal olarak da ayni

`turns.js` tek tur uretecini (`turnSteps()`) iki yoldan bosaltir: canli oyun
`pumpTurn` ile dilim dilim, `endTurn` tek nefeste — dosyanin kendi sozuyle
"mantik ve islem sirasi iki yolda da birebir aynidir". Denetim kosulari da
ayni ureteci kullanir; bu olcum o sozlesmeyi ucuncu bir ortamda (gercek
tarayici) dogruladi.

Ek guvence: `audit:determinism` (ayni tohum → ayni dunya) ve `audit:save`
(kaydet-yukle-kosuya-devam = kesintisiz kosu) bu dal uzerinde geciyor.

## Sinirlar

- Olcum tam-YZ kosusu: oyuncu girdisi olan oturumlarda esdegerlik girdinin
  kendisine bagli (ayni girdi → ayni sonuc, determinizm denetimi kapsar).
- Tarayici tarafinda otomatik kayit kapatildi (`autosaveEnabled = false`);
  acikken de sonuc degismez ama olcum suresine yazim maliyeti karisirdi.
