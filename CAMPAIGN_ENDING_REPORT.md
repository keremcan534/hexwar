# KAMPANYA SONU — yuzyilin son sayfasi

## 1. ONCEKI DURUM

Kampanya `FINAL_TURN = 5740` (**1945**) haftasinda duruyordu. `checkVictory`
tam bir skor tablosu (`board`) donduruyor, `turn.js` `emit('victory', result)`
yayiyordu — ve **bu olayin src/ altinda hicbir dinleyicisi yoktu**. Geriye
kalan tek sey hegemonya seridindeki bir satirdi:

> `X established hegemony — 400 points (time expired, largest nation)`

109 yillik kampanyanin odulu bir cumleydi. (Kor testcinin kampanyasi 1916'da
altyapi arizasiyla kesildigi icin bitisi hic gormemisti — simdi biliyoruz ki
gorulecek bir sey de yoktu.)

## 2. YENI DURUM

`victory` olayi artik **kapanis sayfasini** acar (`src/ui/endScreen.js`).
Bilgi tamamen oyuncunun kendi kampanyasindan gelir; hicbir sayi uydurulmaz.

### Yapi

```
THE LONG CENTURY
<Ulke adi>
1836–1945

<kapanis cumlesi — kampanyanin gercek sayilarindan turer>

POPULATION   1.13M      → 2.41M
TERRITORY    344 hexes  → 291 hexes
INDUSTRY     5 plants   → 36 plants
LITERACY     13%        → 47%
GOVERNMENT   Absolute Monarchy → Democracy
STANDING     rank 3     → rank 1 of 64

THE CENTURY IN BRIEF
1841  War declared by Vasangrad
1854  Absolute Monarchy → Democracy
1876  The capital is occupied
1886  Peace with Vasangrad
...

"The century is over. Its consequences are not."
```

## 3. KAPANIS CUMLESI NASIL TURETILIR

Hazir cumleler arasindan secim YAPILMAZ. Dort gercek olcunun farkindan kurulur:

| Olcu | Kaynak | Cumleye katkisi |
|---|---|---|
| toprak farki (hex) | `nation.tiles` − acilis | larger / smaller / much the same size |
| sanayi farki (tesis) | fabrika sayisi − acilis | industrial / partly industrialised / still agrarian |
| okuryazarlik farki | `economy.literacy` − acilis | literate / better schooled / largely unschooled |
| siralama | `scoreboard` sirasi | first among nations / among the great powers / still its own master |

Acilis cumlesi de gercektir: okuryazarligi %5'in altinda ve iki tesisten az
olan ulke *"It entered the century with land, poverty and ambition"* ile
baslar; digerleri kendi acilis rejimiyle.

Ornek (tarayicida uretildi):

> *"It entered the century as an absolute monarchy. It leaves it much the
> same size, still agrarian, largely unschooled, and first among nations."*

## 4. ACILIS KESITI

Kapanis "nereden nereye" diyebilsin diye kampanyanin ilk haftasinda bir kesit
alinir (`chronicle.captureOpening`, `nation.opening`): nufus, GSYH,
okuryazarlik, hex, kume, hukumet bicimi, tesis sayisi. **Bir kez** yazilir,
bir daha degismez, kayda girer. Turetilemez veri oldugu icin kayit disi
kalirsa yuzyilin baslangici kaybolurdu.

## 5. ZAMAN CIZELGESI

Vakayinameden **en fazla 10** kayit secilir: once varolussal (tier 3), sonra
ulusal (tier 2); esitlikte erken tarih. Secim sonrasi **zaman sirasina** geri
dizilir. Kayit yoksa durust bir satir yazilir:
*"A century without recorded upheaval."*

## 6. GORSEL DIL

Gosterge tahtasi degil, **tarih cildinin kapanis sayfasi**:

- zemin `--surface-1` uzerine ustten pirinc yikamasi, `--frame-brass` cerceve
- baslik ve kapanis cumlesi `--font-display` (serif), `--gold-bright` yil araligi
- olcu satirlari koyu seritler; "sonra" degeri pirinc, "once" degeri soluk
- yuvarlak kose yok, neon yok, gorsel golge oyunu yok
- 620px altinda tek sutuna duser

Ayni degiskenler ana menu ve panellerle **ayni** — yeni bir palet
uretilmedi.

## 7. NE YAPILMADI

- **Zafer kosullari degistirilmedi.** `FINAL_TURN`, `checkVictory` ve
  hegemonya puanlamasi aynen duruyor.
- **Sim durdurma mekanizmasina dokunulmadi.** Oyun zaten zafer sonrasi yeni
  tur baslatmiyordu.
- **Guvenilmeyen istatistik gosterilmiyor.** Savas sayisi/kazanilan savas,
  zirve hazine, en kotu borc gibi olculer icin kampanya boyu guvenilir birer
  sayac YOK; uydurmak yerine **cikarildilar**. Bunlari eklemek icin once
  sayaclarin tutulmasi gerekir (bkz. REMAINING_PRESENTATION_DEBT).
