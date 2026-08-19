# PLAYER BURDEN — ONCE / SONRA

Olcut: ayni hedefe ulasmak icin gereken oyuncu etkilesimi (tik/kaydirac).
Amac sifir tik degil; AYNI KARARLA daha az AYNI TIK. Sayimlar kod yolundan
dogrulandi (once = 4e49602 taban agaci, sonra = bu dal).

## HEDEF A — 10 piyade sirala

| | once | sonra |
|---|---|---|
| Yol | sehir sayfasi/askeri ekran → Order ×10 | ayni ekran → **Shift+Order ×2** (tik basina 5) |
| Etkilesim | ~11 (1 gezinme + 10 tik) | ~3 (1 gezinme + 2 shift-tik) |

Karar sayisi ayni (ne kadar, nerede); yalniz tekrar kayboldu. Shift carpani
HUD sehir sayfasinda da askeri ekranda da gecerli.

## HEDEF B — bir sanayiyi 10 seviye buyut

| | once | sonra |
|---|---|---|
| Seviye buyutme | kendi kendine (karli + tam kadro tesis aylik yukselir); istege bagli hizlandirma = proje destegi (Shift = tam fonlama, o zaman da vardi) | ayni |
| Etkilesim | ~0 zorunlu | ~0 zorunlu |

Burada yuk zaten dusuktu; degisiklik YENI tesis acilisinda: secici pencere
artik her secimden sonra kapanmiyor. 10 yeni tesis: once ~30 etkilesim
(her tesiste yeniden ac), sonra ~12 (bir kez ac, 10 sec, kapat).

## HEDEF C — insaat kabiliyetini buyut (+3 esdegeri)

| | once | sonra |
|---|---|---|
| Yol | palet: Construction Sector sec + bos yuvali bolge bul + tikla ×3; bolge listesi her hafta yeniden siralaniyordu (yanlis tiklama), yuva dolunca baska bolge ara | tek kart: **Invest ×3**; fiyat merdiveni kartta, bolge avi yok |
| Etkilesim | ~5-8 (yuva avciligiyla) | 3 |
| Geri donus | yok (tuzak) | **− dugmesi**: seviye lagvedilir, iade yok, bakim duser |

Stratejik kisit korunuyor: bedel seviyeyle artar (100 → +%35/seviye),
bakim 4/hafta/seviye, kuyruk onceligi hala oyuncu karari. "Her zaman %100"
diye bir cevap yok — A/B/C kabul testi `audit:construction` icinde.

## HEDEF D — orta boy ulkede 20 yil idari kapasite bakimi

| | once | sonra |
|---|---|---|
| Yol | buyudukce Administration binasi dik (+%4/bina, tavan 6 bina, bolge basi 2): ~6 bina × 2 tik + yuva avi + bakim satiri takibi | **0 tekrarlanan is**: yonetim gideri nufus/sehir/mesafeyle kendiliginden buyur; tek kaldirac adminFunding (varsayilan 100, kriz aninda gercek bir karar) |
| Etkilesim (20 yil) | ~12+ ayni tik | 0 (istege bagli 1-2 kaydirac karari) |

Bu tam "bakim mekanigi" tanimiydi: dogru cevap belliydi, is tekrardi.
Kavram (idari kapasite devlete gider yazar) simulasyonda duruyor; sadece
bina dikme ritueli gitti.

## HEDEF E — normal bir savasta 5 general yonetimi

| | once | sonra |
|---|---|---|
| Duruş | general basina chip/dugme; savas boyunca tek tek | **tiyatro dugmesi**: butun ordu komutanlarina tek tikla saldiri/savunma; general basina chip hala var (istisna yonetimi) |
| Emir | birim basina AUTO/HOLD | secili grubun tamamina AUTO/HOLD (HUD), K: siradaki bos birim |
| Etkilesim (12-26 haftalik savas) | ~5 durus + haftalik yeniden emir ~2-3/hafta ≈ 30-70 | ~1 tiyatro + ~2-4 istisna + AUTO devri ≈ 5-10 |

Durus kalicidir (savas bitene dek); AUTO onceden de vardi — yeniden
kullanildi, kopyasi yazilmadi. Niyet katmani oyuncuda: kim saldirir, kim
tutar, hangi cephe onceliklidir.

## Sayim disi kazanimlar

- Subvansiyon: tesis basina ¤ dugmesi duruyor; ustune ulke politikasi
  (manual/strategic/none) geldi — savas kasasi mikro isi tek secime indi.
- Arastirma bitince bildirim + oyuncu secimi YZ'ye devredilmiyor (once
  sessizce en ucuzu seciliyordu): tik artti (bilincli), karar oyuncuya dondu.
- Kuyruk yonetimi: ⤒ / en alta / iptal — uzun kuyrukta surukleme yok.

## Durum tespiti

Tekrarlanan YURUTME azaldi (A, C, D, E); tekrarlanan KARAR azalmadi —
butce kaydiraclari, kuyruk onceligi, durus istisnalari, yatirim zamanlamasi
hala oyuncunun. Sifir tik hedeflenmedi: yeni tesis secimi, kale yeri secimi
(capa artik anlamli) ve arastirma secimi bilerek tik olarak kaldi.
