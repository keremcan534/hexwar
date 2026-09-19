// Subay portresi: komuta yuvasi ve askerî ekran için madalyon resmi.
//
// Modelde KIDEM MERDIVENI yok — `rank` yalnız 'General'/'Admiral' ve kuvvetten
// türer (military.js), `skill` ise yetenektir, kıdem değil. Bu yüzden çeşit
// seçimi kuvvet (kara/deniz) + kimlik ile yapılır: aynı general kampanya
// boyunca hep aynı yüzü taşır, kayıt/yükleme onu değiştirmez ve RNG
// tüketilmez (zar sırası bozulursa dünya ayrışır, bkz. audit:determinism).
//
// Kadro sekiz generale kadar çıkabiliyor (command.MAX_GENERALS) ama kuvvet
// başına dört çeşit var: kalabalık kadroda tekrar kaçınılmazdır, sanat
// büyüyene kadar bu kabul edildi.

const CESITLER = ['junior_01', 'junior_02', 'senior_01', 'senior_02'];

export function subayPortresi(subay) {
  const kuvvet = subay?.branch === 'navy' ? 'navy' : 'land';
  const kimlik = Number.isFinite(subay?.id) ? Math.abs(Math.trunc(subay.id)) : 0;
  const cesit = CESITLER[kimlik % CESITLER.length];
  return `<img class="officer-art" alt="" draggable="false"
    src="assets/icons/officers/${kuvvet}_${cesit}.png">`;
}
