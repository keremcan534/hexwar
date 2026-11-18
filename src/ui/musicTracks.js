// Oyunun üç parçası: Scott Buckley, CC BY 4.0 (www.scottbuckley.com.au).
// Lisans atıf ister: parça eklenir ya da çıkarılırsa index.html künyesi ve
// scripts/release/NASIL OYNANIR.txt de güncellenmeli.
//
// gain: parçalar farklı yükseklikte kaydedilmiş (EBU R128: -12.5 / -14.2 /
// -14.1 LUFS). En kısık parçaya eşitlenir; yoksa menüden oyuna ya da barıştan
// savaşa geçerken oyuncu sesi elle düzeltmek zorunda kalır.
//
// duration: ffprobe ölçümü; musicScore.js bölümleri bu sınıra göre denetlenir.

export const TRACKS = {
  ageOfWonder: { id: 'ageOfWonder', title: 'Age of Wonder', src: 'assets/music/age-of-wonder.mp3', gain: 0.82, duration: 350.9 },
  vanguard: { id: 'vanguard', title: 'Vanguard', src: 'assets/music/vanguard.mp3', gain: 1, duration: 234.5 },
  theClimb: { id: 'theClimb', title: 'The Climb', src: 'assets/music/the-climb.mp3', gain: 0.99, duration: 347.0 },
};
