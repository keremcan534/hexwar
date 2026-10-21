// Subay portresi: komuta yuvası, ordu paneli ve askerî ekran için vesikalık.
//
// Modelde KIDEM MERDİVENİ yok — `rank` yalnız 'General'/'Admiral' ve kuvvetten
// türer (military.js), `skill` ise yetenektir, kıdem değil. Bu yüzden yüz
// seçimi kuvvet (kara/deniz) + kimlik ile yapılır: aynı general kampanya
// boyunca hep aynı yüzü taşır, kayıt/yükleme onu değiştirmez ve RNG
// tüketilmez (zar sırası bozulursa dünya ayrışır, bkz. audit:determinism).
//
// Yüzler tek bir vesikalık sheet'ten dilimlendi (assets/incoming/
// subay-vesikalik.webp, 10x5): üniformaya göre ayrıldı — haki ve kalpaklı/
// kuşaklı yüksek yaka kara, beyaz/siyah denizci şapkası ve gömlek-kravat
// deniz. Eski yuvarlak madalyonlar (officers/*.png) yüzü küçültüyordu;
// Kerem kare vesikalık istedi. Kuvvet başına 18-32 yüz: sekiz generallik
// kadroda bile ardışık kimlikler aynı yüzü almaz.

const KARA = [1, 2, 4, 5, 6, 8, 10, 12, 13, 15, 17, 20, 21, 23, 24, 25, 26, 28, 30, 31, 32, 35, 36, 37, 39, 41, 43, 45, 46, 48, 49, 50];
const DENIZ = [3, 7, 9, 11, 14, 16, 18, 19, 22, 27, 29, 33, 34, 38, 40, 42, 44, 47];

export function subayPortresi(subay) {
  const yuzler = subay?.branch === 'navy' ? DENIZ : KARA;
  const kimlik = Number.isFinite(subay?.id) ? Math.abs(Math.trunc(subay.id)) : 0;
  const no = String(yuzler[kimlik % yuzler.length]).padStart(2, '0');
  return `<img class="officer-art officer-photo" alt="" draggable="false"
    src="assets/icons/officers/photo/p${no}.webp">`;
}
