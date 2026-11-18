// Subay portresi: komuta yuvası, ordu paneli ve askerî ekran için vesikalık.
//
// Modelde KIDEM MERDİVENİ yok — `rank` yalnız 'General'/'Admiral' ve kuvvetten
// türer (military.js), `skill` ise yetenektir, kıdem değil. Bu yüzden yüz
// seçimi kuvvet (kara/deniz) + kimlik ile yapılır: aynı general kampanya
// boyunca hep aynı yüzü taşır, kayıt/yükleme onu değiştirmez ve RNG
// tüketilmez (zar sırası bozulursa dünya ayrışır, bkz. audit:determinism).
//
// Yüzler assets/incoming/subay-*.webp sayfalarından dilimlendi: p51-p200 ve p251-p262
// kara, p201-p250 ve p263-p268 deniz. p01-p50 ilk denemenin yüzleridir, Kerem istemedi:
// havuza geri eklenmez.

const aralik = (ilk, son) => Array.from({ length: son - ilk + 1 }, (_, i) => ilk + i);
/** Sabit tohumlu karıştırma: aynı general her oturumda aynı yüzü taşır, oyunun zarı çekilmez. */
function karistir(liste, tohum) {
  const sonuc = [...liste];
  let s = tohum;
  for (let i = sonuc.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [sonuc[i], sonuc[j]] = [sonuc[j], sonuc[i]];
  }
  return sonuc;
}
const KARA = karistir([...aralik(51, 200), ...aralik(251, 262)], 0x51ed27);
const DENIZ = karistir([...aralik(201, 250), ...aralik(263, 268)], 0x7a31c5);

const fotoYolu = (no) => `assets/icons/officers/photo/p${no}.webp`;

/** Kendi portre sayfası henüz gelmemiş lider için aynı fotoğraf dilinden sabit bir yüz. */
export function liderYedekYuzu(sira) {
  return fotoYolu(KARA[Math.abs(Math.trunc(sira)) % KARA.length]);
}

export function subayPortresi(subay) {
  const yuzler = subay?.branch === 'navy' ? DENIZ : KARA;
  const kimlik = Number.isFinite(subay?.id) ? Math.abs(Math.trunc(subay.id)) : 0;
  return `<img class="officer-art officer-photo" alt="" draggable="false"
    src="${fotoYolu(yuzler[kimlik % yuzler.length])}">`;
}
