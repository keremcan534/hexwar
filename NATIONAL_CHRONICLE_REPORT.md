# ULUSAL VAKAYINAME — kampanyanin hafizasi

**Sorun:** Hiz 8'de oynayan oyuncu 11 saniyelik bir kartı kacirinca o olayi
BIR DAHA goremiyordu. `turns.log` 30 satirlik, bicimlenmis, meta'si silinmis
bir halka tampondu — tarih degil, hata ayiklama izi. Kor kampanyada oyuncu
"12 yil once temerrude dusmusum" tarzi kesifleri ancak defter ekranini acinca
yapabiliyordu.

**Cozum:** Ulke basina, kayda giren, sinirli boyda bir **ulusal vakayiname**.

---

## 1. NE KAYDEDILIR

Yalnizca **tier ≥ 2 (MAJOR/EXISTENTIAL)** olaylar. Fabrika tamamlanmasi,
fiyat hareketi, muharebe turu, subay atamasi vakayinameye GIRMEZ.

Kayit sekli (`chronicle.js`):

```js
{ turn, kind, tier, title, detail }
```

Turetilen tek sey yildir: `chronicleYear(turn) = 1836 + floor(turn / 52)`.

## 2. NEREDE DURUR, NE KADAR BUYUR

- `nation.chronicle` — dizi, tavan **240 kayit** (dolunca en eski duser).
- Olculen gercek yogunluk: **on yilda 1.3 kayit**, yuzyilda 13
  (`audit:events` TEST 3, tohum COMMDENS). Tavan bir yuzyilda asilmaz;
  240 sinirlama degil, kacak durumlarina karsi emniyet supabidir.
- Kayit boyutu: kayit basina ~120 bayt, yuzyillik kampanyada ~1.5 KB.

## 3. IKI KEZ YAZILMA KORUMASI

`recordChronicle` ayni **hafta** icinde ayni **basligi** ikinci kez yazmaz.
Olay saptayicisi ile yerinde duyurular (baris gibi) ayni gecise iki yerden
bakabildigi icin bu koruma gerekli.

## 4. OYUNCU NASIL ULASIR

Yeni **Chronicle** sekmesi (sekme seridinde, Politics ile Technology
arasinda). En yeni kayit ustte — oyuncu once "az once ne oldu" diye bakar.
Varolussal kayitlar (tier 3) kirmizi kenar ve daha koyu zeminle ayrilir.

Bos durumda ekran ne bekleyecegini soyler:
*"Nothing of national consequence has been recorded yet. Wars, treaties, debt,
defaults and changes of government are written here."*

## 5. KAYIT/YUKLEME

`save.js` vakayinameyi, olay durum makinesini (`nation.events`, ic ice
`said` sogutma haritasi dahil) ve acilis kesitini (`nation.opening`) yazar.
Surum yukseltmesi gerekmedi: eski kayitlar bos vakayiname ve bos durum
makinesiyle yuklenir, ilk hafta mevcut durumu **temel cizgi** sayar ve sahte
olay uretmez.

**Tarayicida dogrulandi:** kaydet → sayfa yenile → yukle sonrasi vakayiname
5 kayit, borc fazi `default`, acilis kesiti ve sogutma haritasi aynen yerinde.
Yuklemeden sonra 6 hafta oynatildiginda **tekrar eden olay yok**; eklenen tek
satir gercek bir yeni gecisti (`Credit is running out`).

## 6. ORNEK CIKTI (bassiz, 100 yil, tohum COMMDENS)

```
1836  Absolute Monarchy → Presidential Dictatorship
1838  The treasury borrows
1838  Credit is running out
1838  The state defaults
1840  The army is gone
1867  Presidential Dictatorship → Absolute Monarchy
1884  Absolute Monarchy → Presidential Dictatorship
1899  The debt is cleared
```

Bir ulusun yuzyili sekiz satirda okunuyor: erken siyasi kirilma, ilk mali
cokus, ordunun yok olusu, uzun bir toparlanma ve borcun kapanmasi.

## 7. NE YAPILMADI

- **3000 satirlik bildirim dokumu yok.** Vakayiname akan bildirimlerin
  arsivi degildir; ulusal olaylarin tarihidir.
- **Olay betikleme sistemi yok.** Kayitlar durum farkindan dogar.
- **YZ ulkelerinin vakayinamesi tutulmaz.** `runNationalEvents` yalnizca
  oyuncu icin kosar; kayit boyutu ve performans bu yuzden sabit kalir.
