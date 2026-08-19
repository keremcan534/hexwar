# TARAYICI DOGRULAMA — gercek Chromium, gercek isaretci

Onceki gecisin dersi: **sentetik olaylara guvenme.** Kor Beta #2'de "egitim
butcesi %30'da kilitli" bulgusu, test surucusunun `input` yayip `change`
yaymamasindan dogmustu; oyunda oyle bir tavan yoktu. Bu gecisin butun
oyuncu kontrolu testleri **gercek fare basma/surukleme/birakma** ile yapildi.

Ortam: Chromium (Playwright), 1440×900, `localhost:5173`, tohum `COMMPASS`.
Konsol hatasi: **0** (yalnizca bilinen favicon 404'u).

---

## 1. Kaydirac: gercek isaretciyle surukleme

**Senaryo:** Budget → Education kaydiraci, gercek `mouse.down → move ×12 → up`.

| An | Kaydirac degeri | Yanindaki rakam | Oyun durumu |
|---|---|---|---|
| surukleme ortasi | 45 | **45%** | (henuz commit yok) |
| birakildiktan sonra | 45 | 45% | **45** |
| 2 hafta oynatildiktan sonra | 45 | 45% | **45** |

**Sonuc:** Canli rakam artik sürüklemeyi takip ediyor (eski surumde 0'da
donuyordu) ve deger tik sonrasi **kendiliginden geri donmuyor**.

## 2. Parti bandi gorunurlugu

Bütce ekraninda bantli satirlarin altinda gercek parti adiyla:

```
National Conservative Party allows 25–100%
```

Iki askeri kalemde ve tarife satirinda gorundu. Kaydirac zaten bu araligin
disina cikamiyordu; **eksik olan gerekce artik ekranda**.

## 3. Istikrar: tiklamayla acilan dokum

`[data-why="stability"]` hucresine **gercek tiklama** → balon:

```
Household satisfaction  +53.9
Unemployment            −11.0  (5,000 without work)
= Stability             42.9%
```

Hover tooltip ikincil yol olarak duruyor; dokunmatikte ve hizli oyunda
tiklama calisiyor.

## 4. Borc / temerrut olayi (gercek mekanikle tetiklendi)

Kasa eksiye dusuruldu ve hafta isletildi — `settleDebt` gercekten borclandi
ve temerrude dustu. Sonuc:

- Kart sinifi: `notify-card notify-bad notify-sticky notify-existential`
- Baslik: **"The state defaults"** (serif, pirinc)
- Govde: *"Obligations went unpaid; creditors will lend less and charge more.
  Debt ¤2,888 · weekly +¤55 · interest ¤0/wk"*
- **Oyun durdu** (`clock.speed === 0`)
- Vakayinameye 1 kayit dustu

Ekran goruntusu: `shot-debt.png`.

## 5. Vakayiname ekrani

Chronicle sekmesi acildi, kayit dogru bicimde listelendi:

```
1836   The state defaults
       Obligations went unpaid; creditors will lend less and charge more...
```

## 6. Kampanya sonu ekrani

`victory` olayi gercek yayin yoluyla tetiklendi; ekran acildi ve **kendi
kampanya verisini** okudu: acilis/kapanis olculeri, siralama, vakayinameden
secilmis zaman cizelgesi ve turetilmis kapanis cumlesi:

> *"It entered the century as an absolute monarchy. It leaves it much the same
> size, still agrarian, largely unschooled, and first among nations."*

Ekran goruntusu: `shot-epilogue.png`. Iki rotus yapildi: `a absolute` →
`an absolute` (artikel) ve kapat dugmesinin satiri yutmasi.

## 7. Kaydet → yenile → yukle

| Alan | Kayittan once | Yuklemeden sonra |
|---|---|---|
| vakayiname kaydi | 5 | **5** |
| borc fazi | `default` | **`default`** |
| acilis kesiti | var | **var** |
| sogutma haritasi (`said`) | 1 anahtar | **1 anahtar** |

Yuklemeden sonra 6 hafta oynatildi: **tekrar eden olay yok**; eklenen tek
satir gercek bir yeni gecisti (`Credit is running out`, borc temerruttan
kritige dondu).

## 8. Bildirim yuku (gurultu nobeti)

**Tarayicida 10 yil** (520 hafta, tek oturum):

- zorunlu duraklama: **3** (yilda 0.3)
- vakayiname kaydi: 6
- ekranda biriken kart: sinirli (asagi bkz.)

**Yigin siniri testi:** 20 adet kalici (ttl 0) ulusal olay ust uste
gonderildi → ekranda **5 kart**, bildirim merkezinde **5 kayit**. Kalici
kartlar bile yigini sismiyor.

**Bassiz olcum** (`npm run audit:events`, 3 tohum × 50 yil):

| tohum | ambient/yil | ulusal/yil | durdurma/yil | vakayiname |
|---|---|---|---|---|
| COMM1 | 22.9 | 0.1 | 0.1 | 5 |
| COMM2 | 27.1 | 0.1 | 0.1 | 7 |
| COMM3 | 26.7 | 0.2 | 0.1 | 8 |

Sakin bir yil oyuncuyu **neredeyse hic bolmuyor**.

## 9. Performans

Olay tarayicisinin tam maliyeti tarayicida olculdu (500 cagri ortalamasi,
373 birimli dunya): **haftada 0.0120 ms**. Ayni tarayicida bir haftalik tam
tik ~85 ms; yani iletisim katmani haftalik maliyetin **on binde 1.4'u**.

Vakayiname bellek izi: yuzyilda ~13 kayit (~1.5 KB). Her karede tarama yok,
her cizimde metin yeniden uretimi yok — kayitlar yalnizca ekran acilinca
okunur.

## 10. Kapsanan tarayici senaryolari

| Senaryo | Durum |
|---|---|
| parti-sinirli tarife/askeri kaydirac | ✅ bant gorunur |
| sinirsiz kaydirac (egitim) gercek surukleme | ✅ canli rakam + kalicilik |
| borclanma → temerrut | ✅ kart + durdurma + vakayiname |
| istikrar aciklamasi | ✅ tiklamayla acilir |
| otomatik kayit gorunurlugu | ✅ "Autosave · <seed> · <tarih>" |
| vakayiname ekrani | ✅ sekmeden acilir |
| kampanya sonu ekrani | ✅ gercek veriyle |
| kaydet/yukle tekrar korumasi | ✅ tekrar yok |
| bildirim yigin siniri | ✅ 5'te sabit |
| rejim degisimi | ⚠ bassiz dogrulandi (tarayicida dogal olarak tetiklenmedi) |
| baskent isgali/kaybi | ⚠ kod yolu dogrulandi, tarayicida savas kurulmadi |
